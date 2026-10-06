import {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  clipboard,
  dialog,
  nativeTheme,
  shell,
  screen,
  type MenuItemConstructorOptions,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import {
  BrowserData,
  BrowserTab,
  BrowserWindowState,
  ClosedTab,
  PermissionRequest,
  SplitState,
  TabRestore,
  WindowRestore,
  Workspace,
  internalPage,
} from '../shared/models';
import { Command, CommandResult } from '../shared/ipc';
import { domainOf, isWebURL, recordVisit, resolveInput, safeFavicon } from '../shared/navigation';
import { BrowserSession, SessionHost, originOf, rememberRule } from './session';
import { Storage } from './storage';
import type { ExtensionManager } from './extensions';
import { releaseInfo, markReleaseSeen } from './release-notice';
import { readProfile } from './profile-import';
import { readingScript } from './reading';
import { readingSchema } from '../shared/reading';
import { PageTheme } from './page-theme';
import { translate } from '../shared/i18n';
import { discoverProfiles } from './profile-discovery';
import type { ImportSource, ImportReport } from '../shared/import';
import {
  bundleCounts,
  passwordCSV,
  cookieFile,
  tabFile,
  type ImportBundle,
} from './import-formats';
import { encryptImportedLogins, decryptLogin, loginFillScript } from './login-vault';

interface LiveTab {
  meta: BrowserTab;
  view: WebContentsView | null;
  lastUsed: number;
  previousInternal: string | null;
  shiftClickAt: number;
  pageTheme?: PageTheme;
}
interface BrowserHost {
  extensions: ExtensionManager;
  storage: Storage;
  sessions: Map<string, BrowserSession>;
  windows: Map<string, BrowserController>;
  create(privateMode?: boolean, restore?: WindowRestore): BrowserController;
  broadcast(): void;
  persist(): void;
}
const newWorkspace = (): Workspace => ({
  id: randomUUID(),
  name: 'Personal',
  color: '#a398ff',
  icon: 'home',
});

export class BrowserController implements SessionHost {
  readonly id = randomUUID();
  readonly window: BrowserWindow;
  readonly browserSession: BrowserSession;
  readonly data: BrowserData;
  readonly tabs: LiveTab[] = [];
  workspaces: Workspace[];
  groups: BrowserWindowState['groups'];
  workspaceId: string;
  activeId = '';
  split: SplitState | null = null;
  readonly closedTabs: ClosedTab[] = [];
  private tr(message: string, values?: Record<string, string | number>) {
    return translate(message, this.data.settings.language, values);
  }
  private layoutState = { top: 92, left: 224, right: 0, overlay: false };
  private requests = new Map<
    string,
    { request: PermissionRequest; callback: (allowed: boolean) => void }
  >();
  private findResult = { matches: 0, active: 0 };
  private pending = false;
  private memoryTimer: ReturnType<typeof setInterval>;
  private htmlFullscreen = false;
  private importSources = new Map<string, ImportSource>();
  private importPreviews = new Map<string, ImportBundle>();

  constructor(
    readonly host: BrowserHost,
    readonly privateMode = false,
    restore?: WindowRestore,
  ) {
    this.data = privateMode ? structuredClone(host.storage.data) : host.storage.data;
    if (privateMode) {
      this.data.history = [];
      this.data.searches = [];
      this.data.downloads = [];
      this.data.permissions = [];
      this.data.windows = [];
    }
    this.workspaces = restore?.workspaces ?? [newWorkspace()];
    this.groups = restore?.groups ?? [];
    this.workspaceId = this.workspaces.some((w) => w.id === restore?.workspaceId)
      ? restore!.workspaceId
      : this.workspaces[0].id;
    const partition = privateMode ? `private-${this.id}` : 'persist:dot-personal';
    let browserSession = host.sessions.get(partition);
    if (!browserSession) {
      browserSession = new BrowserSession(partition, (contents) =>
        [...host.windows.values()].find((w) =>
          contents ? w.ownsContents(contents.id) : w.browserSession?.partition === partition,
        ),
      );
      host.sessions.set(partition, browserSession);
    }
    this.browserSession = browserSession;
    const bounds = restore?.bounds;
    const displays = screen.getAllDisplays();
    const onScreen =
      bounds?.x !== undefined &&
      bounds?.y !== undefined &&
      displays.some(
        (d) =>
          bounds.x! < d.workArea.x + d.workArea.width &&
          bounds.x! + bounds.width > d.workArea.x &&
          bounds.y! < d.workArea.y + d.workArea.height &&
          bounds.y! + bounds.height > d.workArea.y,
      );
    this.window = new BrowserWindow({
      width: bounds?.width ?? 1360,
      height: bounds?.height ?? 900,
      ...(onScreen ? { x: bounds?.x, y: bounds?.y } : {}),
      minWidth: 760,
      minHeight: 540,
      frame: false,
      show: false,
      backgroundColor: '#101113',
      title: 'Dot Browser',
      icon: join(__dirname, '../../assets/dot.ico'),
      webPreferences: {
        preload: join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: !process.env.DOT_TEST_HIDDEN,
      },
    });
    this.window.setMenuBarVisibility(false);
    host.windows.set(this.id, this);
    this.browserSession.attach();
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.webContents.on('before-input-event', (event, input) => {
      if (this.shortcut(input)) event.preventDefault();
    });
    this.window.webContents.on('render-process-gone', (_event, details) => {
      host.storage.log('chrome-crash', details.reason);
      this.window.webContents.reload();
    });
    this.window.on('resize', () => {
      this.layout();
      this.emit();
    });
    this.window.on('maximize', () => this.emit());
    this.window.on('unmaximize', () => this.emit());
    this.window.on('enter-full-screen', () => this.emit());
    this.window.on('leave-full-screen', () => this.emit());
    this.window.on('close', () => {
      if (!privateMode) host.persist();
    });
    this.window.on('closed', () => {
      this.importPreviews.clear();
      for (const item of this.requests.values()) item.callback(false);
      this.requests.clear();
      clearInterval(this.memoryTimer);
      for (const tab of this.tabs) this.destroyView(tab);
      host.windows.delete(this.id);
      if (privateMode) {
        for (const item of browserSession.liveDownloads.values()) item.cancel();
        void browserSession
          .cleanup()
          .catch((error) => host.storage.log('private-cleanup-failed', String(error)));
        host.sessions.delete(partition);
      }
    });
    this.window.once('ready-to-show', () => {
      if (!process.env.DOT_TEST_HIDDEN) this.window.show();
    });
    const restored = restore?.tabs.filter((t) =>
      this.workspaces.some((w) => w.id === t.workspaceId),
    );
    if (restored?.length) {
      for (const tab of restored) {
        try {
          this.addTab(tab.url, true, tab.workspaceId, {
            ...tab,
            id: this.tabs.some((t) => t.meta.id === tab.id) ? randomUUID() : tab.id,
          });
        } catch (error) {
          host.storage.log('restore-tab-skipped', String(error));
        }
      }
      this.activeId = this.tabs.some(
        (t) => t.meta.id === restore?.activeId && t.meta.workspaceId === this.workspaceId,
      )
        ? restore!.activeId
        : (this.tabs.find((t) => t.meta.workspaceId === this.workspaceId)?.meta.id ?? '');
    }
    if (!this.activeId) this.addTab('browser://newtab');
    this.layout();
    const loading = process.env.DOT_DEV_URL
      ? this.window.loadURL(process.env.DOT_DEV_URL)
      : this.window.loadFile(join(__dirname, '../renderer/index.html'));
    void loading.catch((error) => host.storage.log('chrome-load-failed', String(error)));
    this.memoryTimer = setInterval(() => this.manageMemory(), 60000);
    host.storage.log('window-created', privateMode ? 'private' : 'normal');
  }
  ownsContents(id: number) {
    return (
      this.window.webContents.id === id || this.tabs.some((t) => t.view?.webContents.id === id)
    );
  }
  active() {
    return this.tabs.find((t) => t.meta.id === (this.split?.focused ?? this.activeId));
  }
  tab(id?: string) {
    const tab = id ? this.tabs.find((t) => t.meta.id === id) : this.active();
    if (!tab) throw new Error('Tab no longer exists');
    return tab;
  }
  snapshot(): BrowserWindowState {
    return {
      windowId: this.id,
      private: this.privateMode,
      tabs: this.tabs.map((t) => ({
        ...t.meta,
        title: internalPage(t.meta.url) ? this.tr(this.internalTitle(t.meta.url)) : t.meta.title,
        connection: this.connection(t),
        webContentsId: t.view && !t.view.webContents.isDestroyed() ? t.view.webContents.id : null,
        processId:
          t.view && !t.view.webContents.isDestroyed() ? t.view.webContents.getOSProcessId() : null,
      })),
      workspaces: this.workspaces,
      groups: this.groups,
      activeId: this.split?.focused ?? this.activeId,
      workspaceId: this.workspaceId,
      split: this.split,
      maximized: this.window.isMaximized(),
      settings: this.data.settings,
      bookmarks: this.data.bookmarks,
      folders: this.data.folders,
      history: this.data.history,
      shortcuts: this.data.shortcuts,
      searches: this.data.searches,
      downloads: this.data.downloads,
      permissions: this.data.permissions,
      permissionRequests: [...this.requests.values()].map((r) => r.request),
      find: this.findResult,
      versions: {
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
      systemDark: nativeTheme.shouldUseDarkColors,
    };
  }
  restore(): WindowRestore {
    return {
      id: this.id,
      tabs: this.tabs.map((t) => ({ ...t.meta })),
      workspaces: this.workspaces,
      groups: this.groups,
      workspaceId: this.workspaceId,
      activeId: this.activeId,
      bounds: this.window.getBounds(),
    };
  }
  private connection(tab: LiveTab): BrowserTab['connection'] {
    if (internalPage(tab.meta.url)) return 'internal';
    if (tab.meta.error) return 'error';
    const committed =
      tab.view && !tab.view.webContents.isDestroyed() ? tab.view.webContents.getURL() : '';
    if (tab.meta.loading || !isWebURL(committed) || originOf(committed) !== originOf(tab.meta.url))
      return 'pending';
    return committed.startsWith('https:') ? 'https' : 'http';
  }
  emit() {
    for (const tab of this.tabs) tab.pageTheme?.update(this.data.settings, tab.meta.url);
    if (this.pending || this.window.isDestroyed()) return;
    this.pending = true;
    setImmediate(() => {
      this.pending = false;
      if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed())
        this.window.webContents.send('dot:state', this.snapshot());
    });
  }
  changed() {
    this.emit();
    if (!this.privateMode) {
      this.host.persist();
      this.host.broadcast();
    }
  }
  toast(message: string) {
    if (!this.window.isDestroyed())
      this.window.webContents.send('dot:event', { type: 'toast', message });
  }
  ui(type: string) {
    if (!this.window.isDestroyed()) {
      if (type !== 'escape')
        this.layoutState.overlay =
          ['omnibox', 'palette', 'split', 'group', 'clear', 'tabsearch', 'reader'].includes(type) ||
          (type === 'bookmark' && isWebURL(this.active()?.meta.url ?? ''));
      this.layout();
      this.window.webContents.focus();
      this.window.webContents.send('dot:event', { type });
    }
  }
  permission(request: PermissionRequest, callback: (allowed: boolean) => void) {
    this.requests.set(request.id, { request, callback });
    this.emit();
  }
  private cancelPermissions(contentsId: number) {
    for (const [id, item] of this.requests)
      if (item.request.contentsId === contentsId) {
        this.requests.delete(id);
        item.callback(false);
      }
  }
  addTab(
    input = 'browser://newtab',
    background = false,
    workspaceId = this.workspaceId,
    restore?: TabRestore,
  ) {
    if (!this.workspaces.some((w) => w.id === workspaceId)) throw new Error('Unknown workspace');
    if (this.tabs.length >= 200) throw new Error('Close some tabs before opening more');
    const { url } = resolveInput(input, this.data.settings);
    const meta: BrowserTab = {
      connection: internalPage(url) ? 'internal' : 'pending',
      id: restore?.id ?? randomUUID(),
      workspaceId,
      url,
      title: internalPage(url) ? this.internalTitle(url) : (restore?.title ?? domainOf(url)),
      pinned: restore?.pinned ?? false,
      muted: restore?.muted ?? false,
      groupId: restore?.groupId ?? null,
      zoom: restore?.zoom ?? 1,
      favicon: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      audio: false,
      suspended: false,
      blockedPopups: 0,
      error: null,
      processId: null,
      webContentsId: null,
    };
    const tab: LiveTab = {
      meta,
      view: null,
      lastUsed: Date.now(),
      previousInternal: null,
      shiftClickAt: 0,
    };
    this.tabs.push(tab);
    if (!background) {
      this.workspaceId = workspaceId;
      this.activeId = meta.id;
      this.split = null;
    }
    if (!internalPage(url)) {
      if (restore && background) meta.suspended = true;
      else this.createView(tab);
    }
    this.sortPinned();
    this.layout();
    this.changed();
    return tab;
  }
  internalTitle(url: string) {
    const name = internalPage(url) ?? 'newtab';
    return name === 'newtab' ? 'New tab' : name[0].toUpperCase() + name.slice(1);
  }
  createView(tab: LiveTab) {
    if (tab.view || internalPage(tab.meta.url)) return;
    const view = new WebContentsView({
      webPreferences: {
        session: this.browserSession.session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: true,
      },
    });
    tab.view = view;
    tab.meta.loading = true;
    tab.meta.suspended = false;
    this.window.contentView.addChildView(view);
    view.setVisible(false);
    const wc = view.webContents;
    tab.pageTheme = new PageTheme(wc, (message) => this.host.storage.log('page-theme', message));
    tab.pageTheme.update(this.data.settings, tab.meta.url);
    wc.on('dom-ready', () => {
      tab.pageTheme?.invalidate();
      tab.pageTheme?.update(this.data.settings, tab.meta.url);
    });
    wc.on('devtools-closed', () => {
      tab.pageTheme?.invalidate();
      tab.pageTheme?.update(this.data.settings, tab.meta.url);
    });
    wc.setAudioMuted(tab.meta.muted);
    wc.setZoomFactor(tab.meta.zoom);
    const sync = () => {
      if (wc.isDestroyed()) return;
      tab.meta.canGoBack = wc.navigationHistory.canGoBack() || !!tab.previousInternal;
      tab.meta.canGoForward = wc.navigationHistory.canGoForward();
      tab.meta.audio = wc.isCurrentlyAudible();
      this.emit();
    };
    wc.on('did-start-loading', () => {
      tab.meta.loading = true;
      this.emit();
    });
    wc.on('did-stop-loading', () => {
      tab.meta.loading = false;
      sync();
    });
    const navigated = (_event: Electron.Event, url: string) => {
      this.browserSession.revokeContents(wc.id);
      this.cancelPermissions(wc.id);
      tab.meta.url = url;
      tab.pageTheme?.invalidate();
      tab.meta.error = null;
      sync();
      this.changed();
      if (!this.privateMode) {
        this.data.history = recordVisit(
          this.data.history,
          url,
          wc.getTitle() || domainOf(url),
          tab.meta.favicon,
        );
        this.changed();
      }
    };
    wc.on('did-navigate', navigated);
    wc.on('did-navigate-in-page', (event, url, mainFrame) => {
      if (mainFrame) navigated(event, url);
    });
    wc.on('page-title-updated', (_event, title) => {
      tab.meta.title = title;
      const h = this.data.history.find((h) => h.url === tab.meta.url);
      if (h) h.title = title;
      this.changed();
    });
    wc.on('page-favicon-updated', (_event, icons) => {
      tab.meta.favicon = safeFavicon(icons[0] ?? '');
      const h = this.data.history.find((h) => h.url === tab.meta.url);
      if (h) h.favicon = tab.meta.favicon;
      this.changed();
    });
    wc.on('media-started-playing', sync);
    wc.on('media-paused', sync);
    wc.on('focus', () => {
      tab.lastUsed = Date.now();
      if (this.split) this.split.focused = tab.meta.id;
      else this.activeId = tab.meta.id;
      this.emit();
    });
    wc.on('before-input-event', (event, input) => {
      if (this.shortcut(input)) event.preventDefault();
    });
    wc.on('before-mouse-event', (_event, input) => {
      if (input.type === 'mouseDown' && input.modifiers?.includes('shift'))
        tab.shiftClickAt = Date.now();
    });
    wc.on('found-in-page', (_event, result) => {
      this.findResult = { matches: result.matches, active: result.activeMatchOrdinal };
      this.emit();
    });
    wc.on('zoom-changed', (_event, direction) => {
      this.zoom(tab, tab.meta.zoom + (direction === 'in' ? 0.1 : -0.1));
    });
    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreen = true;
      this.layout();
    });
    wc.on('leave-html-full-screen', () => {
      this.htmlFullscreen = false;
      this.layout();
    });
    wc.on('will-navigate', (event, url) => {
      if (!isWebURL(url)) {
        event.preventDefault();
        void this.external(url);
      }
    });
    wc.on('will-redirect', (event, url) => {
      if (!isWebURL(url)) {
        event.preventDefault();
        void this.external(url);
      }
    });
    wc.setWindowOpenHandler((details) => {
      if (!isWebURL(details.url)) {
        void this.external(details.url);
        return { action: 'deny' };
      }
      const allowed =
        ['foreground-tab', 'background-tab'].includes(details.disposition) ||
        (details.disposition === 'new-window' && Date.now() - tab.shiftClickAt < 1000) ||
        this.data.settings.popupAllowlist.includes(originOf(tab.meta.url));
      if (!allowed) {
        tab.meta.blockedPopups++;
        this.toast('Popup blocked. Manage this site in Site information.');
        this.emit();
        return { action: 'deny' };
      }
      if (details.disposition === 'new-window') {
        const next = this.host.create(this.privateMode);
        next.navigate(next.tab(), details.url);
      } else
        this.addTab(details.url, details.disposition === 'background-tab', tab.meta.workspaceId);
      return { action: 'deny' };
    });
    wc.on('context-menu', (_event, params) => this.pageMenu(tab, params));
    wc.on('did-fail-load', (_event, code, description, failedUrl, mainFrame) => {
      if (!mainFrame || code === -3) return;
      tab.meta.url = failedUrl || tab.meta.url;
      tab.meta.error = `${description} (${code})`;
      tab.meta.loading = false;
      this.host.storage.log('navigation-failed', `${code} ${description}`);
      this.layout();
      this.emit();
    });
    wc.on('render-process-gone', (_event, details) => {
      tab.meta.error = `This page stopped responding: ${details.reason}`;
      tab.meta.loading = false;
      this.host.storage.log('page-crash', details.reason);
      this.layout();
      this.emit();
    });
    void wc.loadURL(tab.meta.url).catch((error) => {
      if (!wc.isDestroyed() && !tab.meta.error && !String(error).includes('ERR_ABORTED')) {
        tab.meta.error = String(error);
        this.layout();
        this.emit();
      }
    });
  }
  navigate(tab: LiveTab, input: string) {
    const result = resolveInput(input, this.data.settings);
    if (result.query && !this.privateMode)
      this.data.searches = [
        result.query,
        ...this.data.searches.filter((s) => s !== result.query),
      ].slice(0, 100);
    const wasInternal = internalPage(tab.meta.url);
    tab.meta.error = null;
    if (internalPage(result.url)) {
      if (tab.view) this.destroyView(tab);
      tab.meta.url = result.url;
      tab.meta.title = this.internalTitle(result.url);
      tab.meta.favicon = '';
      tab.meta.loading = false;
      tab.meta.canGoBack = false;
      tab.meta.canGoForward = false;
      this.split = null;
    } else {
      if (wasInternal) tab.previousInternal = tab.meta.url;
      tab.meta.loading = true;
      tab.meta.url = result.url;
      if (!tab.view) this.createView(tab);
      else
        void tab.view.webContents.loadURL(result.url).catch((error) => {
          if (!String(error).includes('ERR_ABORTED'))
            this.host.storage.log('navigation-load-error', String(error));
        });
    }
    this.layout();
    this.changed();
  }
  select(tab: LiveTab, focusPage = true) {
    this.workspaceId = tab.meta.workspaceId;
    this.activeId = tab.meta.id;
    tab.lastUsed = Date.now();
    if (this.split && ![this.split.left, this.split.right].includes(tab.meta.id)) this.split = null;
    if (this.split) this.split.focused = tab.meta.id;
    if (tab.meta.groupId) {
      const g = this.groups.find((g) => g.id === tab.meta.groupId);
      if (g) g.collapsed = false;
    }
    this.createView(tab);
    this.layout();
    if (focusPage) tab.view?.webContents.focus();
    else this.window.webContents.focus();
    this.changed();
  }
  destroyView(tab: LiveTab) {
    if (!tab.view) return;
    this.cancelPermissions(tab.view.webContents.id);
    this.browserSession.revokeContents(tab.view.webContents.id);
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    tab.view = null;
    tab.pageTheme = undefined;
  }
  close(tab: LiveTab) {
    const index = this.tabs.indexOf(tab);
    this.closedTabs.unshift({ tab: { ...tab.meta }, index });
    this.closedTabs.splice(30);
    this.destroyView(tab);
    this.tabs.splice(index, 1);
    if (this.split && [this.split.left, this.split.right].includes(tab.meta.id)) this.split = null;
    if (this.activeId === tab.meta.id)
      this.activeId =
        this.tabs.filter((t) => t.meta.workspaceId === this.workspaceId)[Math.max(0, index - 1)]
          ?.meta.id ??
        this.tabs.find((t) => t.meta.workspaceId === this.workspaceId)?.meta.id ??
        '';
    if (!this.tabs.some((t) => t.meta.workspaceId === this.workspaceId)) this.addTab();
    this.select(this.tab(this.activeId));
    this.changed();
  }
  sortPinned() {
    this.tabs.sort((a, b) => Number(b.meta.pinned) - Number(a.meta.pinned));
  }
  layout() {
    if (this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();
    const { top, left, right, overlay } = this.layoutState;
    const visibleIds =
      overlay && !this.htmlFullscreen
        ? []
        : this.split && !this.htmlFullscreen
          ? [this.split.left, this.split.right]
          : [this.split?.focused ?? this.activeId];
    for (const tab of this.tabs)
      if (
        tab.view?.getVisible() &&
        (!visibleIds.includes(tab.meta.id) || internalPage(tab.meta.url) || tab.meta.error)
      )
        tab.view.setVisible(false);
    if (overlay && !this.htmlFullscreen) return;
    const x = this.htmlFullscreen ? 0 : left,
      y = this.htmlFullscreen ? 0 : top;
    const w = Math.max(1, width - x - (this.htmlFullscreen ? 0 : right)),
      h = Math.max(1, height - y);
    const place = (id: string, bounds: Electron.Rectangle) => {
      const tab = this.tabs.find((t) => t.meta.id === id);
      if (!tab || internalPage(tab.meta.url) || tab.meta.error) return;
      this.createView(tab);
      if (!tab.view) return;
      const previous = tab.view.getBounds();
      if (
        previous.x !== bounds.x ||
        previous.y !== bounds.y ||
        previous.width !== bounds.width ||
        previous.height !== bounds.height
      )
        tab.view.setBounds(bounds);
      if (!tab.view.getVisible()) tab.view.setVisible(true);
    };
    if (!this.split || this.htmlFullscreen)
      place(this.split?.focused ?? this.activeId, { x, y, width: w, height: h });
    else {
      const s = this.split;
      if (s.direction === 'vertical') {
        const cut = Math.round((w - 6) * s.ratio);
        place(s.left, { x, y, width: cut, height: h });
        place(s.right, { x: x + cut + 6, y, width: w - cut - 6, height: h });
      } else {
        const cut = Math.round((h - 6) * s.ratio);
        place(s.left, { x, y, width: w, height: cut });
        place(s.right, { x, y: y + cut + 6, width: w, height: h - cut - 6 });
      }
    }
  }
  manageMemory() {
    const mode = this.data.settings.memorySaver;
    if (mode === 'off') return;
    const age = (mode === 'aggressive' ? 5 : 20) * 60000;
    for (const t of this.tabs)
      if (
        t.meta.id !== this.activeId &&
        ![this.split?.left, this.split?.right].includes(t.meta.id) &&
        t.view &&
        !t.meta.audio &&
        !t.meta.loading &&
        Date.now() - t.lastUsed > age
      ) {
        this.destroyView(t);
        t.meta.suspended = true;
      }
    this.emit();
  }
  zoom(tab: LiveTab, value: number) {
    tab.meta.zoom = Math.min(3, Math.max(0.25, Math.round(value * 100) / 100));
    tab.view?.webContents.setZoomFactor(tab.meta.zoom);
    this.changed();
  }
  async external(url: string) {
    if (!/^(mailto|tel|discord|steam):/i.test(url) || url.length > 8192) {
      this.toast('Unsupported link protocol');
      return;
    }
    const result = await dialog.showMessageBox(this.window, {
      type: 'question',
      message: 'Open an external application?',
      detail: url,
      buttons: ['Cancel', 'Open application'],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) await shell.openExternal(url);
  }
  async execute(command: Command): Promise<CommandResult> {
    const c = command;
    switch (c.type) {
      case 'tab.new':
        this.addTab(c.url, c.background, c.workspaceId);
        break;
      case 'tab.navigate':
        this.navigate(this.tab(c.id), c.input);
        break;
      case 'tab.action': {
        if (c.action === 'restore') {
          const closed = this.closedTabs.shift();
          if (closed) {
            if (!this.workspaces.some((w) => w.id === closed.tab.workspaceId))
              closed.tab.workspaceId = this.workspaceId;
            const t = this.addTab(closed.tab.url, false, closed.tab.workspaceId, {
              ...closed.tab,
              id: randomUUID(),
            });
            this.tabs.splice(this.tabs.indexOf(t), 1);
            this.tabs.splice(Math.min(closed.index, this.tabs.length), 0, t);
            this.toast('Tab restored');
          }
          break;
        }
        const t = this.tab(c.id),
          wc = t.view?.webContents;
        if (c.action === 'select') this.select(t, !c.focusChrome);
        if (c.action === 'close') this.close(t);
        if (c.action === 'duplicate') this.addTab(t.meta.url, false, t.meta.workspaceId);
        if (c.action === 'pin') {
          t.meta.pinned = !t.meta.pinned;
          this.sortPinned();
        }
        if (c.action === 'mute') {
          t.meta.muted = !t.meta.muted;
          wc?.setAudioMuted(t.meta.muted);
        }
        if (c.action === 'reload' || c.action === 'hardReload') {
          t.meta.error = null;
          if (!wc) this.createView(t);
          else if (c.action === 'hardReload') wc.reloadIgnoringCache();
          else wc.reload();
        }
        if (c.action === 'stop') {
          wc?.stop();
          t.meta.loading = false;
        }
        if (c.action === 'back') {
          if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
          else if (t.previousInternal) {
            this.navigate(t, t.previousInternal);
            t.previousInternal = null;
          }
        }
        if (c.action === 'forward' && wc?.navigationHistory.canGoForward())
          wc.navigationHistory.goForward();
        if (c.action === 'closeOthers' || c.action === 'closeRight') {
          const index = this.tabs.indexOf(t);
          for (const other of [...this.tabs])
            if (
              other !== t &&
              other.meta.workspaceId === t.meta.workspaceId &&
              !other.meta.pinned &&
              (c.action === 'closeOthers' || this.tabs.indexOf(other) > index)
            )
              this.close(other);
          this.select(t);
        }
        if (c.action === 'newWindow') {
          const next = this.host.create(this.privateMode);
          next.navigate(next.tab(), t.meta.url);
          this.close(t);
        }
        if (
          c.action === 'suspend' &&
          t.meta.id !== this.activeId &&
          ![this.split?.left, this.split?.right].includes(t.meta.id)
        ) {
          this.destroyView(t);
          t.meta.suspended = true;
        }
        break;
      }
      case 'tab.move': {
        const t = this.tab(c.id);
        if (c.workspaceId && !this.workspaces.some((w) => w.id === c.workspaceId))
          throw new Error('Unknown workspace');
        if (c.workspaceId) {
          t.meta.workspaceId = c.workspaceId;
          t.meta.groupId = null;
        }
        if (c.groupId !== undefined) {
          if (
            c.groupId &&
            !this.groups.some((g) => g.id === c.groupId && g.workspaceId === t.meta.workspaceId)
          )
            throw new Error('Unknown tab group');
          t.meta.groupId = c.groupId;
        }
        this.tabs.splice(this.tabs.indexOf(t), 1);
        this.tabs.splice(Math.min(c.index, this.tabs.length), 0, t);
        this.sortPinned();
        if (t.meta.id === this.activeId && t.meta.workspaceId !== this.workspaceId) {
          const next = this.tabs.find((t) => t.meta.workspaceId === this.workspaceId);
          if (next) this.select(next);
          else this.addTab();
        }
        break;
      }
      case 'workspace.save': {
        const i = this.workspaces.findIndex((w) => w.id === c.workspace.id);
        if (i >= 0) this.workspaces[i] = c.workspace;
        else this.workspaces.push(c.workspace);
        break;
      }
      case 'workspace.action': {
        const i = this.workspaces.findIndex((w) => w.id === c.id);
        if (i < 0) throw new Error('Unknown workspace');
        if (c.action === 'select') {
          this.workspaceId = c.id;
          this.split = null;
          const t = this.tabs.find((t) => t.meta.workspaceId === c.id);
          if (t) this.select(t);
          else this.addTab();
        }
        if (c.action === 'delete') {
          if (this.workspaces.length === 1) throw new Error('Keep at least one workspace');
          const target = this.workspaces.find((w) => w.id !== c.id)!;
          for (const t of this.tabs)
            if (t.meta.workspaceId === c.id) {
              t.meta.workspaceId = target.id;
              t.meta.groupId = null;
            }
          this.workspaces.splice(i, 1);
          this.groups = this.groups.filter((g) => g.workspaceId !== c.id);
          if (this.workspaceId === c.id) {
            this.workspaceId = target.id;
            this.select(this.tabs.find((t) => t.meta.workspaceId === target.id) ?? this.addTab());
          }
        }
        if (c.action === 'reorder') {
          const [w] = this.workspaces.splice(i, 1);
          this.workspaces.splice(Math.min(c.index ?? 0, this.workspaces.length), 0, w);
        }
        break;
      }
      case 'group.save': {
        let group = this.groups.find((g) => g.id === c.id);
        if (group) {
          group.name = c.name;
          group.color = c.color;
        } else {
          group = {
            id: randomUUID(),
            workspaceId: this.workspaceId,
            name: c.name,
            color: c.color,
            collapsed: false,
          };
          this.groups.push(group);
        }
        if (c.tabId) this.tab(c.tabId).meta.groupId = group.id;
        break;
      }
      case 'group.action': {
        const g = this.groups.find((g) => g.id === c.id);
        if (g) {
          if (c.action === 'collapse') g.collapsed = !g.collapsed;
          else {
            this.groups = this.groups.filter((g) => g !== this.groups.find((x) => x.id === c.id));
            for (const t of this.tabs) if (t.meta.groupId === c.id) t.meta.groupId = null;
          }
        }
        break;
      }
      case 'split': {
        if (!c.otherId) this.split = null;
        else if (this.split) {
          this.split.ratio = c.ratio ?? this.split.ratio;
          this.split.direction = c.direction ?? this.split.direction;
          if (c.swap) [this.split.left, this.split.right] = [this.split.right, this.split.left];
        } else {
          const t = this.tab(),
            other = this.tab(c.otherId);
          if (
            other === t ||
            other.meta.workspaceId !== t.meta.workspaceId ||
            internalPage(t.meta.url) ||
            internalPage(other.meta.url)
          )
            throw new Error('Choose two web tabs in this workspace');
          this.createView(other);
          this.split = {
            left: t.meta.id,
            right: other.meta.id,
            focused: t.meta.id,
            ratio: c.ratio ?? 0.5,
            direction: c.direction ?? 'vertical',
          };
        }
        break;
      }
      case 'layout':
        this.layoutState = c;
        this.layout();
        return { ok: true };
      case 'bookmark.save': {
        if (!isWebURL(c.bookmark.url)) throw new Error('Bookmarks require an HTTP or HTTPS URL');
        const i = this.data.bookmarks.findIndex((b) => b.id === c.bookmark.id);
        if (i >= 0) this.data.bookmarks[i] = c.bookmark;
        else this.data.bookmarks.push(c.bookmark);
        if (!this.data.folders.includes(c.bookmark.folder))
          this.data.folders.push(c.bookmark.folder);
        this.toast('Bookmark saved');
        break;
      }
      case 'bookmark.remove':
        this.data.bookmarks = this.data.bookmarks.filter((b) => b.id !== c.id);
        break;
      case 'bookmark.reorder':
        this.reorder(this.data.bookmarks, c.id, c.index);
        break;
      case 'bookmark.transfer':
        await this.transferBookmarks(c.action);
        break;
      case 'import.sources': {
        const sources = await discoverProfiles();
        this.importSources = new Map(sources.map((source) => [source.id, source]));
        return { ok: true, sources: sources.map(({ path: _path, ...source }) => source) };
      }
      case 'import.folder': {
        const result = await dialog.showOpenDialog(this.window, {
          title: this.tr('Choose browser profile or user data folder'),
          properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) return { ok: true };
        const found = await discoverProfiles([result.filePaths[0]]);
        if (!found.length)
          throw new Error(
            'No compatible Chromium or Firefox profiles were found in this folder. Choose the profile or user data folder.',
          );
        const existing = new Set(
          [...this.importSources.values()].map((source) => source.path?.toLowerCase()),
        );
        for (const source of found)
          if (!existing.has(source.path?.toLowerCase())) {
            this.importSources.set(source.id, source);
            existing.add(source.path?.toLowerCase());
          }
        return {
          ok: true,
          sources: [...this.importSources.values()].map(({ path: _path, ...source }) => source),
        };
      }
      case 'import.preview': {
        const source = this.importSources.get(c.sourceId);
        if (!source) throw new Error('Choose a detected browser profile again');
        const imported = { ...readProfile(source, c.kinds), cookies: [], passwords: [] };
        const token = randomUUID();
        this.importPreviews.set(token, imported);
        if (this.importPreviews.size > 5)
          this.importPreviews.delete(this.importPreviews.keys().next().value!);
        return {
          ok: true,
          preview: {
            token,
            source: `${source.browser} · ${source.profile}`,
            counts: bundleCounts(imported),
            warnings: imported.warnings,
          },
        };
      }
      case 'import.file': {
        if (this.privateMode) throw new Error('Import files in a normal window.');
        const result = await dialog.showOpenDialog(this.window, {
          title:
            c.kind === 'passwords'
              ? this.tr('Import exported browser password CSV')
              : this.tr('Import exported browser data'),
          properties: ['openFile'],
          filters: [
            {
              name: this.tr(c.kind === 'passwords' ? 'Password CSV' : 'Exported data'),
              extensions: c.kind === 'passwords' ? ['csv'] : ['json', 'txt'],
            },
          ],
        });
        if (result.canceled || !result.filePaths[0]) return { ok: true };
        const path = result.filePaths[0];
        if ((await stat(path)).size > 20 * 1024 * 1024)
          throw new Error('Choose an export smaller than 20 MB.');
        const text = await readFile(path, 'utf8');
        const imported =
          c.kind === 'passwords'
            ? passwordCSV(text)
            : c.kind === 'cookies'
              ? cookieFile(text)
              : tabFile(text);
        if (imported.passwords.length > 10000 || imported.cookies.length > 10000)
          throw new Error('Import at most 10,000 passwords or cookies at a time.');
        const token = randomUUID();
        this.importPreviews.clear();
        this.importPreviews.set(token, imported);
        setTimeout(() => this.importPreviews.delete(token), 5 * 60 * 1000).unref();
        return {
          ok: true,
          preview: {
            token,
            source:
              c.kind === 'passwords'
                ? 'Exported browser passwords'
                : 'Exported browser cookies / tabs',
            counts: bundleCounts(imported),
            warnings: imported.warnings,
          },
        };
      }
      case 'import.apply': {
        const imported = this.importPreviews.get(c.token);
        if (!imported) throw new Error('Import preview expired; scan the profile again');
        this.importPreviews.delete(c.token);
        const encryptedLogins = imported.passwords.length
          ? await encryptImportedLogins(this.data.logins, imported.passwords)
          : [];
        for (const login of encryptedLogins) {
          const index = this.data.logins.findIndex(
            (item) => item.origin === login.origin && item.username === login.username,
          );
          if (index >= 0) this.data.logins[index] = login;
          else this.data.logins.push(login);
        }
        let cookies = 0;
        for (const cookie of imported.cookies) {
          try {
            await this.browserSession.session.cookies.set(cookie);
            cookies++;
          } catch {
            /* Report rejected/unsupported cookie attributes without logging secret values. */
          }
        }
        if (cookies) await this.browserSession.session.cookies.flushStore();
        const bookmarkUrls = new Set(this.data.bookmarks.map((item) => item.url));
        const newBookmarks = imported.bookmarks.filter((item) => {
          if (bookmarkUrls.has(item.url)) return false;
          bookmarkUrls.add(item.url);
          return true;
        });
        this.data.bookmarks.push(...newBookmarks);
        const historyUrls = new Set(this.data.history.map((item) => item.url));
        const newHistory = imported.history.filter((item) => {
          if (historyUrls.has(item.url)) return false;
          historyUrls.add(item.url);
          return true;
        });
        this.data.history.push(...newHistory);
        this.data.history.sort((a, b) => b.timestamp - a.timestamp);
        this.data.history = this.data.history.slice(0, 50000);
        for (const folder of new Set(newBookmarks.map((bookmark) => bookmark.folder)))
          if (!this.data.folders.includes(folder)) this.data.folders.push(folder);
        const restoredTabs = imported.tabs.slice(
          0,
          Math.max(0, Math.min(50, 200 - this.tabs.length)),
        );
        for (const tab of restoredTabs) {
          this.addTab(tab.url, true, this.workspaceId, {
            id: randomUUID(),
            workspaceId: this.workspaceId,
            url: tab.url,
            title: tab.title,
            pinned: tab.pinned,
            muted: false,
            groupId: null,
            zoom: 1,
          });
        }
        this.sortPinned();
        const counts = {
          bookmarks: newBookmarks.length,
          history: newHistory.length,
          tabs: restoredTabs.length,
          cookies,
          passwords: encryptedLogins.length,
        };
        const report: ImportReport = {
          counts,
          skipped:
            imported.bookmarks.length -
            newBookmarks.length +
            imported.history.length -
            newHistory.length,
          warnings: [
            ...imported.warnings,
            ...(cookies < imported.cookies.length
              ? [`${imported.cookies.length - cookies} cookies could not be imported.`]
              : []),
            ...(imported.tabs.length > restoredTabs.length
              ? ['Some tabs were skipped to respect the browser tab limit.']
              : []),
          ],
        };
        this.changed();
        this.toast(
          `Imported ${counts.bookmarks} bookmarks, ${counts.history} history entries, ${counts.tabs} tabs, ${counts.passwords} passwords and ${counts.cookies} cookies`,
        );
        return { ok: true, report };
      }
      case 'import.cancel':
        if (c.token) this.importPreviews.delete(c.token);
        else this.importPreviews.clear();
        return { ok: true };
      case 'login.list':
        return {
          ok: true,
          logins: this.data.logins.map(({ encrypted: _encrypted, ...login }) => login),
        };
      case 'login.action': {
        const login = this.data.logins.find((item) => item.id === c.id);
        if (!login) throw new Error('Saved password no longer exists.');
        if (c.action === 'delete') {
          this.data.logins = this.data.logins.filter((item) => item.id !== c.id);
          this.changed();
          return { ok: true };
        }
        const tab = this.active();
        if (
          c.action === 'fill' &&
          (!tab?.view || new URL(tab.view.webContents.getURL()).origin !== login.origin)
        )
          throw new Error('Open the matching site before filling this password.');
        const password = await decryptLogin(login);
        if (c.action === 'reveal') return { ok: true, password };
        if (c.action === 'copy') {
          await clipboard.writeText(password);
          setTimeout(() => {
            void (async () => {
              if ((await clipboard.readText()) === password) await clipboard.clear();
            })().catch(() => {});
          }, 30000).unref();
          this.toast('Password copied. Clipboard clears in 30 seconds.');
          return { ok: true };
        }
        const wc = tab?.view?.webContents;
        if (/[\r\n]/.test(password))
          throw new Error(
            'This password contains line breaks and cannot be filled into a single-line field. Use Copy instead.',
          );
        if (
          !wc ||
          wc.isDestroyed() ||
          this.active() !== tab ||
          new URL(wc.getURL()).origin !== login.origin
        )
          throw new Error('The page changed. Choose the password again.');
        let filled: unknown;
        try {
          filled = await wc.mainFrame.executeJavaScript(
            loginFillScript(login.origin, login.username, password),
            true,
          );
        } catch {
          throw new Error('Could not fill this login form.');
        }
        if (filled !== 'filled')
          throw new Error('No single matching login form was found. Password was not filled.');
        this.toast('Login filled. Submit the form when ready.');
        return { ok: true };
      }
      case 'folder.add':
        if (!this.data.folders.includes(c.name)) this.data.folders.push(c.name);
        break;
      case 'history.delete':
        this.data.history = this.data.history.filter((h) => !c.ids.includes(h.id));
        break;
      case 'data.clear': {
        if (c.history) {
          const since = c.hours ? Date.now() - c.hours * 3600000 : 0;
          this.data.history = this.data.history.filter((h) => h.timestamp < since);
          this.data.searches = [];
        }
        if (c.session) {
          this.closedTabs.splice(0);
          if (!this.privateMode) this.data.windows = [];
        }
        await this.browserSession.clear(c.hours, c.cookies, c.cache);
        this.toast('Browsing data cleared');
        break;
      }
      case 'settings': {
        if (c.patch.home) resolveInput(c.patch.home, this.data.settings);
        if (c.patch.startupPages)
          for (const page of c.patch.startupPages) resolveInput(page, this.data.settings);
        Object.assign(this.data.settings, c.patch);
        break;
      }
      case 'engine.save': {
        const i = this.data.settings.engines.findIndex((e) => e.id === c.engine.id);
        if (i >= 0) this.data.settings.engines[i] = c.engine;
        else this.data.settings.engines.push(c.engine);
        break;
      }
      case 'engine.remove': {
        if (this.data.settings.engines.length === 1)
          throw new Error('Keep at least one search engine');
        this.data.settings.engines = this.data.settings.engines.filter((e) => e.id !== c.id);
        if (this.data.settings.engine === c.id)
          this.data.settings.engine = this.data.settings.engines[0].id;
        break;
      }
      case 'shortcut.save': {
        if (!isWebURL(c.shortcut.url)) throw new Error('Shortcuts require an HTTP or HTTPS URL');
        const i = this.data.shortcuts.findIndex((s) => s.id === c.shortcut.id);
        if (i >= 0) this.data.shortcuts[i] = c.shortcut;
        else this.data.shortcuts.push(c.shortcut);
        break;
      }
      case 'shortcut.remove':
        this.data.shortcuts = this.data.shortcuts.filter((s) => s.id !== c.id);
        break;
      case 'shortcut.reorder':
        this.reorder(this.data.shortcuts, c.id, c.index);
        break;
      case 'download':
        await this.browserSession.downloadAction(
          this,
          c.id,
          c.action,
          this.active()?.view?.webContents,
        );
        break;
      case 'download.directory': {
        const result = await dialog.showOpenDialog(this.window, { properties: ['openDirectory'] });
        if (!result.canceled) this.data.settings.downloadPath = result.filePaths[0];
        break;
      }
      case 'permission': {
        const item = this.requests.get(c.id);
        if (!item) break;
        this.requests.delete(c.id);
        if (c.decision !== 'once')
          this.data.permissions = rememberRule(this.data.permissions, {
            origin: item.request.origin,
            permission: item.request.permission,
            decision: c.decision,
          });
        item.callback(c.decision !== 'block');
        break;
      }
      case 'permission.remove':
        this.data.permissions = this.data.permissions.filter(
          (p) => p.origin !== c.origin || p.permission !== c.permission,
        );
        this.browserSession.revoke(c.origin, c.permission);
        break;
      case 'extension.list':
        return { ok: true, extensions: this.host.extensions.list() };
      case 'extension.install': {
        if (this.privateMode) throw new Error('Eklentileri normal pencerede yönetin.');
        let path = '';
        if (!c.builtin) {
          const result = await dialog.showOpenDialog(this.window, {
            title: this.tr('Eklenti klasörünü seçin (manifest.json içermeli)'),
            properties: ['openDirectory'],
          });
          if (result.canceled || !result.filePaths[0])
            return { ok: true, extensions: this.host.extensions.list() };
          path = result.filePaths[0];
        }
        return { ok: true, extensions: await this.host.extensions.install(path, c.builtin) };
      }
      case 'extension.action':
        if (this.privateMode) throw new Error('Eklentileri normal pencerede yönetin.');
        return { ok: true, extensions: await this.host.extensions.action(c.id, c.action) };
      case 'release.info':
        return {
          ok: true,
          release: releaseInfo(
            this.host.storage,
            app.getVersion(),
            !!c.automatic,
            this.privateMode,
          ),
        };
      case 'release.seen':
        markReleaseSeen(this.host.storage, app.getVersion(), this.privateMode);
        return { ok: true };
      case 'site.info': {
        const url = this.tab().meta.url;
        if (!isWebURL(url)) throw new Error('Open a website to see site information');
        const origin = originOf(url);
        const cookies = await this.browserSession.session.cookies.get({ url });
        return {
          ok: true,
          site: {
            origin,
            https: this.connection(this.tab()) === 'https',
            connection: this.connection(this.tab()),
            cookies: cookies.map((cookie) => ({
              name: cookie.name,
              domain: cookie.domain ?? '',
              secure: cookie.secure ?? false,
              httpOnly: cookie.httpOnly ?? false,
            })),
            permissions: this.data.permissions.filter((p) => p.origin === origin),
          },
        };
      }
      case 'site.clear':
        if (!isWebURL(c.origin)) throw new Error('Invalid origin');
        else {
          await this.browserSession.session.clearStorageData({
            origin: c.origin,
            storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
          });
          this.toast('Site data cleared');
        }
        break;
      case 'find': {
        const wc = this.active()?.view?.webContents;
        if (!wc) break;
        if (c.text) wc.findInPage(c.text, { forward: c.forward ?? true, findNext: !c.next });
        else {
          wc.stopFindInPage('clearSelection');
          this.findResult = { matches: 0, active: 0 };
        }
        break;
      }
      case 'zoom':
        this.zoom(this.tab(), c.value);
        break;
      case 'reader.extract': {
        const tab = this.active(),
          wc = tab?.view?.webContents;
        if (!wc || !isWebURL(wc.getURL())) throw new Error('Open a webpage to use reading view.');
        const url = wc.getURL();
        const article = readingSchema.parse(await wc.executeJavaScript(readingScript));
        if (wc.isDestroyed() || this.active() !== tab || wc.getURL() !== url)
          throw new Error('The page changed. Open reading view again.');
        if (!article.blocks.length)
          throw new Error('No readable article text was found on this page.');
        return { ok: true, article: { ...article, url } };
      }
      case 'page':
        await this.pageAction(c.action);
        break;
      case 'window': {
        if (c.action === 'new' || c.action === 'private') this.host.create(c.action === 'private');
        if (c.action === 'minimize') this.window.minimize();
        if (c.action === 'maximize') {
          if (this.window.isMaximized()) this.window.unmaximize();
          else this.window.maximize();
        }
        if (c.action === 'close')
          setImmediate(() => {
            if (!this.window.isDestroyed()) this.window.close();
          });
        if (c.action === 'fullscreen') this.window.setFullScreen(!this.window.isFullScreen());
        if (c.action === 'exit') setImmediate(() => app.quit());
        break;
      }
      case 'clipboard':
        clipboard.writeText(c.text);
        break;
      case 'menu.tab':
        this.tabMenu(this.tab(c.id));
        break;
      case 'menu.main':
        this.mainMenu();
        break;
    }
    this.layout();
    this.changed();
    return { ok: true };
  }
  private reorder<T extends { id: string }>(items: T[], id: string, index: number) {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [item] = items.splice(i, 1);
    items.splice(Math.min(index, items.length), 0, item);
  }
  async pageAction(action: string) {
    const t = this.tab(),
      wc = t.view?.webContents;
    if (!wc) throw new Error('Open a webpage first');
    if (action === 'copyLink') {
      const url = wc.getURL();
      if (!isWebURL(url)) throw new Error('Open a webpage first');
      await clipboard.writeText(url);
      this.toast('Link copied');
      return;
    }
    if (action === 'readLater') {
      const url = wc.getURL();
      if (!isWebURL(url)) throw new Error('Open a webpage first');
      const existing = this.data.bookmarks.find(
        (item) => item.url === url && item.folder === 'Reading list',
      );
      if (!existing) {
        if (!this.data.folders.includes('Reading list')) this.data.folders.push('Reading list');
        this.data.bookmarks.push({
          id: randomUUID(),
          url,
          title: wc.getTitle() || domainOf(url),
          favicon: t.meta.favicon,
          folder: 'Reading list',
          createdAt: Date.now(),
        });
        this.changed();
      }
      this.toast('Saved to reading list');
      return;
    }
    if (action === 'pdf') {
      const originalURL = wc.getURL();
      const selected = await dialog.showSaveDialog(this.window, {
        defaultPath: `${t.meta.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'page'}.pdf`,
        filters: [{ name: this.tr('PDF document'), extensions: ['pdf'] }],
      });
      if (selected.canceled || !selected.filePath) return;
      if (wc.isDestroyed() || this.active() !== t || wc.getURL() !== originalURL)
        throw new Error('The page changed. Choose Save as PDF again.');
      const pdf = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true });
      if (wc.isDestroyed() || wc.getURL() !== originalURL)
        throw new Error('The page changed while preparing the PDF. Try again.');
      await writeFile(selected.filePath, pdf);
      this.toast('Page saved as PDF.');
      return;
    }
    if (action === 'print')
      wc.print({}, (success, reason) => {
        if (!success && !reason.includes('cancel')) this.toast(`Print failed: ${reason}`);
      });
    if (action === 'devtools') {
      if (wc.isDevToolsOpened()) wc.closeDevTools();
      else wc.openDevTools({ mode: process.env.DOT_TEST_HIDDEN ? 'right' : 'detach' });
    }
    if (action === 'save') {
      const path = await dialog.showSaveDialog(this.window, {
        defaultPath: `${t.meta.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)}.html`,
        filters: [{ name: this.tr('Web page'), extensions: ['html'] }],
      });
      if (path.filePath) await wc.savePage(path.filePath, 'HTMLComplete');
    }
    if (action === 'source') {
      const source = this.addTab('browser://newtab');
      source.meta.url = `view-source:${t.meta.url}`;
      source.meta.title = `Source: ${domainOf(t.meta.url)}`;
      this.createView(source);
      this.layout();
    }
  }
  private run(c: Command) {
    void this.execute(c).catch((error) => {
      this.host.storage.log('command-failed', String(error));
      this.toast(String(error));
    });
  }
  tabMenu(t: LiveTab) {
    const action = (
      label: string,
      action: Extract<Command, { type: 'tab.action' }>['action'],
    ): MenuItemConstructorOptions => ({
      label: this.tr(label),
      click: () => this.run({ type: 'tab.action', action, id: t.meta.id }),
    });
    const items: MenuItemConstructorOptions[] = [
      {
        label: this.tr('New tab'),
        accelerator: 'Ctrl+T',
        click: () => this.run({ type: 'tab.new' }),
      },
      action('Reload', 'reload'),
      action('Duplicate', 'duplicate'),
      { type: 'separator' },
      action(t.meta.pinned ? 'Unpin tab' : 'Pin tab', 'pin'),
      action(t.meta.muted ? 'Unmute tab' : 'Mute tab', 'mute'),
      {
        label: this.tr('Move to workspace'),
        submenu: this.workspaces.map((w) => ({
          label: w.name,
          enabled: w.id !== t.meta.workspaceId,
          click: () =>
            this.run({
              type: 'tab.move',
              id: t.meta.id,
              workspaceId: w.id,
              index: this.tabs.length,
            }),
        })),
      },
      {
        label: this.tr('Add to group'),
        submenu: [
          {
            label: this.tr('New group…'),
            click: () => {
              this.select(t);
              this.ui('group');
            },
          },
          ...this.groups
            .filter((g) => g.workspaceId === t.meta.workspaceId)
            .map((g) => ({
              label: g.name,
              click: () =>
                this.run({
                  type: 'tab.move',
                  id: t.meta.id,
                  index: this.tabs.indexOf(t),
                  groupId: g.id,
                }),
            })),
          {
            label: this.tr('Remove from group'),
            enabled: !!t.meta.groupId,
            click: () =>
              this.run({
                type: 'tab.move',
                id: t.meta.id,
                index: this.tabs.indexOf(t),
                groupId: null,
              }),
          },
        ],
      },
      action('Move to new window', 'newWindow'),
      { type: 'separator' },
      action('Close tab', 'close'),
      action('Close other tabs', 'closeOthers'),
      action('Close tabs to right', 'closeRight'),
      action('Reopen closed tab', 'restore'),
    ];
    Menu.buildFromTemplate(items).popup({ window: this.window });
  }
  mainMenu() {
    const open = (
      label: string,
      page: string,
      accelerator?: string,
    ): MenuItemConstructorOptions => ({
      label: this.tr(label),
      accelerator,
      click: () => this.run({ type: 'tab.new', url: `browser://${page}` }),
    });
    const wc = this.active()?.view?.webContents;
    Menu.buildFromTemplate([
      {
        label: this.tr('New tab'),
        accelerator: 'Ctrl+T',
        click: () => this.run({ type: 'tab.new' }),
      },
      {
        label: this.tr('New window'),
        accelerator: 'Ctrl+N',
        click: () => this.run({ type: 'window', action: 'new' }),
      },
      {
        label: this.tr('Private window'),
        accelerator: 'Ctrl+Shift+N',
        click: () => this.run({ type: 'window', action: 'private' }),
      },
      { type: 'separator' },
      {
        label: this.tr('Home'),
        click: () => this.run({ type: 'tab.navigate', input: this.data.settings.home }),
      },
      open('History', 'history', 'Ctrl+H'),
      open('Bookmarks', 'bookmarks'),
      open('Downloads', 'downloads', 'Ctrl+J'),
      { type: 'separator' },
      {
        label: `Zoom · ${Math.round((this.active()?.meta.zoom ?? 1) * 100)}%`,
        submenu: [
          {
            label: this.tr('Zoom in'),
            click: () =>
              this.run({ type: 'zoom', value: Math.min(3, (this.active()?.meta.zoom ?? 1) + 0.1) }),
          },
          {
            label: this.tr('Zoom out'),
            click: () =>
              this.run({
                type: 'zoom',
                value: Math.max(0.25, (this.active()?.meta.zoom ?? 1) - 0.1),
              }),
          },
          { label: this.tr('Reset zoom'), click: () => this.run({ type: 'zoom', value: 1 }) },
        ],
      },
      {
        label: this.tr('Find in page'),
        accelerator: 'Ctrl+F',
        enabled: !!wc,
        click: () => this.ui('find'),
      },
      {
        label: this.tr('Search tabs'),
        accelerator: 'Ctrl+Shift+A',
        click: () => this.ui('tabsearch'),
      },
      {
        label: this.tr('Reading view'),
        accelerator: 'Ctrl+Shift+M',
        enabled: !!wc,
        click: () => this.ui('reader'),
      },
      {
        label: this.tr('Save as PDF…'),
        accelerator: 'Ctrl+Shift+S',
        enabled: !!wc,
        click: () => this.run({ type: 'page', action: 'pdf' }),
      },
      {
        label: this.tr('Print…'),
        accelerator: 'Ctrl+P',
        enabled: !!wc,
        click: () => this.run({ type: 'page', action: 'print' }),
      },
      {
        label: this.tr('Save page…'),
        accelerator: 'Ctrl+S',
        enabled: !!wc,
        click: () => this.run({ type: 'page', action: 'save' }),
      },
      { label: this.tr('Split view…'), click: () => this.ui('split') },
      { label: this.tr('Command palette'), accelerator: 'Ctrl+K', click: () => this.ui('palette') },
      {
        label: this.tr('Developer tools'),
        accelerator: 'F12',
        enabled: !!wc,
        click: () => this.run({ type: 'page', action: 'devtools' }),
      },
      {
        label: this.tr('Fullscreen'),
        accelerator: 'F11',
        click: () => this.run({ type: 'window', action: 'fullscreen' }),
      },
      { type: 'separator' },
      open('Settings', 'settings'),
      open('About Dot', 'about'),
      { label: this.tr('Exit'), click: () => app.quit() },
    ]).popup({ window: this.window });
  }
  pageMenu(t: LiveTab, params: Electron.ContextMenuParams) {
    const wc = t.view!.webContents;
    const items: MenuItemConstructorOptions[] = [];
    if (params.linkURL && isWebURL(params.linkURL))
      items.push(
        { label: this.tr('Open link in new tab'), click: () => this.addTab(params.linkURL) },
        {
          label: this.tr('Open link in background tab'),
          click: () => this.addTab(params.linkURL, true),
        },
        {
          label: this.tr('Open link in new window'),
          click: () => {
            const next = this.host.create(this.privateMode);
            next.navigate(next.tab(), params.linkURL);
          },
        },
        { label: this.tr('Copy link address'), click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      );
    if (params.mediaType === 'image' && isWebURL(params.srcURL))
      items.push(
        { label: this.tr('Open image in new tab'), click: () => this.addTab(params.srcURL) },
        { label: this.tr('Copy image URL'), click: () => clipboard.writeText(params.srcURL) },
        { label: this.tr('Save image as…'), click: () => wc.downloadURL(params.srcURL) },
        { type: 'separator' },
      );
    if (params.isEditable)
      items.push(
        { role: 'undo', label: this.tr('Undo') },
        { role: 'redo', label: this.tr('Redo') },
        { type: 'separator' },
        { role: 'cut', label: this.tr('Cut') },
        { role: 'copy', label: this.tr('Copy') },
        { role: 'paste', label: this.tr('Paste') },
        { role: 'selectAll', label: this.tr('Select all') },
        { type: 'separator' },
      );
    else if (params.selectionText)
      items.push({
        label: this.tr('Copy'),
        click: () => clipboard.writeText(params.selectionText),
      });
    if (params.selectionText)
      items.push(
        {
          label: this.tr('Search {engine} for “{query}”', {
            engine:
              this.data.settings.engines.find((e) => e.id === this.data.settings.engine)?.name ??
              this.tr('the web'),
            query: params.selectionText.slice(0, 45),
          }),
          click: () =>
            this.addTab(
              this.data.settings.engines
                .find((e) => e.id === this.data.settings.engine)!
                .template.replace('%s', encodeURIComponent(params.selectionText)),
            ),
        },
        { type: 'separator' },
      );
    items.push(
      {
        label: this.tr('Back'),
        enabled: t.meta.canGoBack,
        click: () => this.run({ type: 'tab.action', action: 'back', id: t.meta.id }),
      },
      {
        label: this.tr('Forward'),
        enabled: t.meta.canGoForward,
        click: () => this.run({ type: 'tab.action', action: 'forward', id: t.meta.id }),
      },
      { label: this.tr('Reload'), click: () => wc.reload() },
      { type: 'separator' },
      { label: this.tr('Save page…'), click: () => this.run({ type: 'page', action: 'save' }) },
      { label: this.tr('Print…'), click: () => this.run({ type: 'page', action: 'print' }) },
      { label: this.tr('View source'), click: () => this.run({ type: 'page', action: 'source' }) },
      { label: this.tr('Inspect element'), click: () => wc.inspectElement(params.x, params.y) },
    );
    Menu.buildFromTemplate(items).popup({ window: this.window });
  }
  shortcut(input: Electron.Input) {
    if (input.type !== 'keyDown') return false;
    const key = input.key.toLowerCase(),
      ctrl = input.control || input.meta,
      shift = input.shift;
    const action = (action: Extract<Command, { type: 'tab.action' }>['action']) =>
      this.run({ type: 'tab.action', action });
    if (ctrl && key === 'l') this.ui('omnibox');
    else if (ctrl && shift && key === 'a') this.ui('tabsearch');
    else if (ctrl && shift && key === 'm') this.ui('reader');
    else if (ctrl && key === 't') {
      if (shift) action('restore');
      else this.addTab();
    } else if (ctrl && key === 'w') action('close');
    else if (ctrl && key === 'tab') {
      const tabs = this.tabs.filter((t) => t.meta.workspaceId === this.workspaceId);
      const i = tabs.findIndex((t) => t.meta.id === this.activeId);
      this.select(tabs[(i + (shift ? -1 : 1) + tabs.length) % tabs.length]);
    } else if (ctrl && /^[1-9]$/.test(key)) {
      const tabs = this.tabs.filter((t) => t.meta.workspaceId === this.workspaceId);
      const t = tabs[key === '9' ? tabs.length - 1 : Number(key) - 1];
      if (t) this.select(t);
    } else if (ctrl && key === 'r') action(shift ? 'hardReload' : 'reload');
    else if (ctrl && key === 'd') this.ui('bookmark');
    else if (ctrl && key === 'h') this.addTab('browser://history');
    else if (ctrl && key === 'j') this.addTab('browser://downloads');
    else if (ctrl && key === 'f') this.ui('find');
    else if (ctrl && (key === 'k' || (shift && key === 'p'))) this.ui('palette');
    else if (ctrl && key === 'n') this.host.create(shift || this.privateMode);
    else if (ctrl && key === 'delete' && shift) {
      this.addTab('browser://settings#privacy');
      this.ui('clear');
    } else if (ctrl && ['+', '=', '-', '0'].includes(key)) {
      const t = this.active();
      if (t) this.zoom(t, key === '0' ? 1 : t.meta.zoom + (key === '-' ? -0.1 : 0.1));
    } else if (ctrl && key === 'p') this.run({ type: 'page', action: 'print' });
    else if (ctrl && key === 's') this.run({ type: 'page', action: shift ? 'pdf' : 'save' });
    else if (key === 'f12' || (ctrl && shift && key === 'i'))
      this.run({ type: 'page', action: 'devtools' });
    else if (key === 'f11') this.window.setFullScreen(!this.window.isFullScreen());
    else if (input.alt && key === 'arrowleft') action('back');
    else if (input.alt && key === 'arrowright') action('forward');
    else if (key === 'escape') {
      if (this.htmlFullscreen) this.window.setFullScreen(false);
      else {
        this.active()?.view?.webContents.stopFindInPage('clearSelection');
        this.findResult = { matches: 0, active: 0 };
        this.ui('escape');
        this.emit();
      }
    } else return false;
    return true;
  }
  async transferBookmarks(action: 'import' | 'export') {
    const encode = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (action === 'export') {
      const result = await dialog.showSaveDialog(this.window, {
        defaultPath: 'dot-bookmarks.html',
        filters: [{ name: this.tr('Bookmark HTML'), extensions: ['html'] }],
      });
      if (result.filePath) {
        const html =
          '<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p>' +
          this.data.folders
            .map(
              (folder) =>
                `<DT><H3>${encode(folder)}</H3><DL><p>${this.data.bookmarks
                  .filter((b) => b.folder === folder)
                  .map((b) => `<DT><A HREF="${encode(b.url)}">${encode(b.title)}</A>`)
                  .join('\n')}</DL><p>`,
            )
            .join('\n') +
          '</DL>';
        await writeFile(result.filePath, html);
        this.toast('Bookmarks exported');
      }
    } else {
      const result = await dialog.showOpenDialog(this.window, {
        filters: [{ name: this.tr('Bookmark HTML'), extensions: ['html', 'htm'] }],
        properties: ['openFile'],
      });
      if (result.canceled) return;
      const html = await readFile(result.filePaths[0], 'utf8');
      if (html.length > 10000000) throw new Error('Bookmark file is too large');
      const decode = (s: string) =>
        s
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
      let count = 0;
      for (const match of html.matchAll(/<A\b[^>]*HREF=["']([^"']+)["'][^>]*>([\s\S]*?)<\/A>/gi)) {
        const url = decode(match[1]);
        if (!isWebURL(url) || this.data.bookmarks.some((b) => b.url === url)) continue;
        this.data.bookmarks.push({
          id: randomUUID(),
          url,
          title: decode(match[2].replace(/<[^>]+>/g, '')).slice(0, 500) || domainOf(url),
          folder: 'Imported',
          favicon: '',
          createdAt: Date.now(),
        });
        count++;
      }
      if (count && !this.data.folders.includes('Imported')) this.data.folders.push('Imported');
      this.toast(`${count} bookmarks imported`);
    }
  }
}
