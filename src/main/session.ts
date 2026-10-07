import {
  app,
  dialog,
  DownloadItem as ElectronDownloadItem,
  session,
  Session,
  shell,
  WebContents,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { BrowserData, DownloadItem, PermissionRequest, PermissionRule } from '../shared/models';
import { isWebURL } from '../shared/navigation';
import type { AdBlock } from './adblock';

export interface SessionHost {
  data: BrowserData;
  changed(): void;
  permission(request: PermissionRequest, callback: (allowed: boolean) => void): void;
  toast(message: string): void;
  blocked(contentsId: number): void;
}
export class BrowserSession {
  readonly session: Session;
  readonly liveDownloads = new Map<string, ElectronDownloadItem>();
  private permissionsOnce = new Map<string, Set<number>>();
  private attached = false;
  private cosmetics = new Map<number, { key?: string }>();
  constructor(
    readonly partition: string,
    readonly hostFor: (contents: WebContents | null) => SessionHost | undefined,
    private readonly adblock: AdBlock,
  ) {
    this.session = session.fromPartition(partition);
  }
  attach() {
    if (this.attached) return;
    this.attached = true;
    this.session.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
      const host = this.hostFor(contents);
      if (!host) return false;
      const origin = originOf(requestingOrigin);
      return (
        host.data.permissions.some(
          (p) => p.origin === origin && p.permission === permission && p.decision === 'allow',
        ) ||
        (contents
          ? this.permissionsOnce.get(`${origin}:${permission}`)?.has(contents.id) === true
          : false)
      );
    });
    this.session.setPermissionRequestHandler((contents, permission, callback, details) => {
      const host = this.hostFor(contents);
      const origin = originOf(details.requestingUrl || contents.getURL());
      if (!host || !isWebURL(origin)) {
        callback(false);
        return;
      }
      const existing = host.data.permissions.find(
        (p) => p.origin === origin && p.permission === permission,
      );
      if (existing) {
        callback(existing.decision === 'allow');
        return;
      }
      const key = `${origin}:${permission}`;
      host.permission(
        { id: randomUUID(), contentsId: contents.id, origin, permission },
        (allowed) => {
          if (allowed) {
            const set = this.permissionsOnce.get(key) ?? new Set<number>();
            set.add(contents.id);
            this.permissionsOnce.set(key, set);
          }
          callback(allowed);
        },
      );
    });
    // Hardware/device and display capture remain denied until a proper chooser exists.
    this.session.setDevicePermissionHandler(() => false);
    this.configureBlocking();
    this.session.on('will-download', (_event, item, contents) => {
      const host = this.hostFor(contents);
      if (!host) {
        item.cancel();
        return;
      }
      const id = randomUUID();
      const filename = basename(item.getFilename());
      if (!host.data.settings.askDownload) {
        const folder = host.data.settings.downloadPath || app.getPath('downloads');
        const extension = extname(filename),
          stem = filename.slice(0, filename.length - extension.length);
        let target = join(folder, filename),
          suffix = 1;
        while (
          existsSync(target) ||
          [...this.liveDownloads.values()].some((d) => d.getSavePath() === target)
        )
          target = join(folder, `${stem} (${suffix++})${extension}`);
        item.setSavePath(target);
      }
      const download: DownloadItem = {
        id,
        filename,
        url: item.getURL(),
        path: item.getSavePath(),
        received: 0,
        total: item.getTotalBytes(),
        speed: 0,
        status: 'progressing',
        startedAt: Date.now(),
      };
      host.data.downloads.unshift(download);
      this.liveDownloads.set(id, item);
      let lastAt = Date.now(),
        lastBytes = 0,
        lastNotify = 0;
      item.on('updated', (_event, state) => {
        const now = Date.now();
        download.received = item.getReceivedBytes();
        download.total = item.getTotalBytes();
        download.path = item.getSavePath();
        download.status = item.isPaused() ? 'paused' : state;
        if (now - lastAt > 500) {
          download.speed = ((download.received - lastBytes) * 1000) / (now - lastAt);
          lastAt = now;
          lastBytes = download.received;
        }
        if (now - lastNotify > 180 || state === 'interrupted') {
          lastNotify = now;
          host.changed();
        }
      });
      item.once('done', (_event, state) => {
        download.status = state;
        download.path = item.getSavePath();
        download.received = item.getReceivedBytes();
        download.speed = 0;
        this.liveDownloads.delete(id);
        host.changed();
        host.toast(
          state === 'completed' ? `${filename} downloaded` : `Download ${state}: ${filename}`,
        );
      });
      host.changed();
      host.toast(`Downloading ${filename}`);
    });
  }
  configureBlocking() {
    const settings = this.hostFor(null)?.data.settings;
    if (!settings || (settings.adblock === 'off' && settings.protection === 'off')) {
      this.session.webRequest.onBeforeRequest(null);
      return;
    }
    this.session.webRequest.onBeforeRequest((details, callback) => {
      const contents = details.webContents ?? null;
      const host = this.hostFor(contents);
      let blocked = false;
      if (host && contents && isWebURL(details.url)) {
        const settings = host.data.settings;
        const hostname = new URL(details.url).hostname;
        blocked =
          settings.protection !== 'off' &&
          settings.blockedDomains.some(
            (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
          ) &&
          (settings.protection === 'strict' || details.resourceType !== 'mainFrame');
        blocked ||= this.adblock.shouldBlock(
          settings,
          details.url,
          contents.getURL(),
          details.resourceType,
        );
        if (blocked) host.blocked(contents.id);
      }
      callback({ cancel: blocked });
    });
  }
  resetBlocking(id: number) {
    this.cosmetics.delete(id);
  }
  async applyCosmetics(contents: WebContents) {
    if (contents.isDestroyed()) return;
    const host = this.hostFor(contents);
    if (!host) return;
    const url = contents.getURL();
    const previous = this.cosmetics.get(contents.id);
    const state: { key?: string } = {};
    this.cosmetics.set(contents.id, state);
    try {
      if (previous?.key) await contents.removeInsertedCSS(previous.key);
      if (!isWebURL(url)) return;
      const dom = await contents.executeJavaScript(
        `(() => {const classes=new Set(), ids=new Set(); for(const el of Array.from(document.querySelectorAll('[class],[id]')).slice(0,10000)) { for(const cls of el.classList) if(classes.size<2000)classes.add(cls); if(el.id&&ids.size<1000)ids.add(el.id); } return {classes:[...classes],ids:[...ids]};})()`,
      );
      if (
        contents.isDestroyed() ||
        contents.getURL() !== url ||
        this.cosmetics.get(contents.id) !== state
      )
        return;
      const css = this.adblock.cosmetics(host.data.settings, url, dom.classes, dom.ids);
      if (!css) return;
      // Electron 44 fails to remove user-origin sheets. Author-origin !important
      // rules stay removable when the user exempts a site or disables blocking.
      const key = await contents.insertCSS(css, { cssOrigin: 'author' });
      if (contents.isDestroyed()) return;
      if (contents.getURL() !== url || this.cosmetics.get(contents.id) !== state)
        await contents.removeInsertedCSS(key);
      else state.key = key;
    } catch {
      /* Navigation may destroy a frame while styles are being applied. */
    }
  }
  revoke(origin: string, permission: string) {
    this.permissionsOnce.delete(`${origin}:${permission}`);
  }
  revokeContents(id: number) {
    for (const set of this.permissionsOnce.values()) set.delete(id);
  }
  async downloadAction(host: SessionHost, id: string, action: string, contents?: WebContents) {
    if (action === 'clear') {
      host.data.downloads = host.data.downloads.filter((d) =>
        ['progressing', 'paused'].includes(d.status),
      );
      host.changed();
      return;
    }
    const d = host.data.downloads.find((d) => d.id === id);
    if (!d) throw new Error('Download no longer exists');
    const live = this.liveDownloads.get(id);
    if (action === 'pause' && live) {
      live.pause();
      d.status = 'paused';
    }
    if (action === 'resume' && live) {
      if (!live.canResume())
        throw new Error('This server does not support resuming. Retry the download.');
      live.resume();
      d.status = 'progressing';
    }
    if (action === 'cancel' && live) live.cancel();
    if (action === 'open' && d.status === 'completed') {
      if (/\.(exe|msi|bat|cmd|ps1|vbs|scr|com|hta)$/i.test(d.path)) {
        const answer = await dialog.showMessageBox({
          type: 'warning',
          message: 'Open a downloaded program?',
          detail: d.filename,
          buttons: ['Cancel', 'Open'],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response !== 1) return;
      }
      const error = await shell.openPath(d.path);
      if (error) throw new Error(error);
    }
    if (action === 'reveal' && d.path) shell.showItemInFolder(d.path);
    if (action === 'retry') {
      if (!isWebURL(d.url)) throw new Error('Invalid download URL');
      if (contents) contents.downloadURL(d.url);
      else this.session.downloadURL(d.url);
    }
    host.changed();
  }
  async clear(_hours: number, cookies: boolean, cache: boolean) {
    if (cookies)
      await this.session.clearData({
        dataTypes: ['cookies', 'localStorage', 'indexedDB', 'serviceWorkers'],
      });
    if (cache) await this.session.clearCache(); // Electron exposes all-cache clearing only.
    this.permissionsOnce.clear();
  }
  async cleanup() {
    this.cosmetics.clear();
    this.permissionsOnce.clear();
    await this.session.clearStorageData();
    await this.session.clearCache();
  }
}
export function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
export function rememberRule(rules: PermissionRule[], rule: PermissionRule) {
  return [
    ...rules.filter((p) => p.origin !== rule.origin || p.permission !== rule.permission),
    rule,
  ];
}
