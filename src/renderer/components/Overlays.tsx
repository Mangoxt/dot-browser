import { tr } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  X,
  Search,
  Plus,
  Copy,
  Star,
  History,
  Download,
  Settings2,
  PanelLeft,
  Columns2,
  Moon,
  Sun,
  Code2,
  Trash2,
  Layers,
  Shield,
  Globe,
  ArrowUpRight,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { bookmarkCurrent, command, openPage, patchSettings, useBrowser } from '../stores/browser';
import { IconButton } from './common';
import { DownloadList } from '../pages/Library';
import { PasswordManager } from './PasswordManager';
import { ReadingView, TabSearch } from './Usability';
import { WhatsNew } from './WhatsNew';
import { BrowserMenu, Extensions } from './BrowserTools';
import type { Bookmark, Shortcut, Workspace, TabGroup } from '../../shared/models';
import type { SiteInfo } from '../../shared/ipc';
import { isWebURL, resolveInput } from '../../shared/navigation';
import type { ImportKind, ImportPreview, ImportSource } from '../../shared/import';

export function Overlays() {
  const { overlay, overlayClosing, open } = useBrowser();
  const modal = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!overlay) return;
    const previous = useBrowser.getState().overlayOpener;
    const items = () =>
      [
        ...(modal.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ) ?? []),
      ].filter(
        (el) =>
          el.getClientRects().length &&
          !el.closest('[inert]') &&
          getComputedStyle(el).visibility !== 'hidden',
      );
    if (!modal.current?.contains(document.activeElement)) (items()[0] ?? modal.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        open(null);
      }
      if (e.key === 'Tab') {
        const controls = items();
        if (!controls.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || !modal.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || !modal.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (!useBrowser.getState().overlay && previous?.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [overlay, open]);
  if (!overlay) return null;
  const titles = {
    palette: 'Quick command',
    bookmark: 'Bookmark',
    shortcut: 'Shortcut',
    workspace: 'Workspace',
    group: 'Tab group',
    split: 'Split view',
    clear: 'Clear browsing data',
    site: 'Site information',
    profile: 'Your session',
    downloads: 'Downloads',
    onboarding: 'Welcome to Dot',
    import: 'Import browser data',
    passwords: 'Saved passwords',
    tabsearch: 'Search tabs',
    reader: 'Reading view',
    whatsnew: 'Neler yeni?',
    browsermenu: 'Browser menu',
    extensions: 'Eklentiler',
  };
  return (
    <div
      className={`overlay-scrim ${overlayClosing ? 'closing' : ''} ${overlay === 'palette' ? 'palette-scrim' : ''} ${overlay === 'browsermenu' ? 'menu-scrim' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) open(null);
      }}
    >
      <div
        key={overlay}
        ref={modal}
        className={`modal ${overlay === 'palette' ? 'palette-modal' : ''} ${overlay === 'reader' ? 'reader-modal' : ''} ${overlay === 'browsermenu' ? 'browser-menu-modal' : ''} ${overlay === 'extensions' ? 'extensions-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={tr(titles[overlay])}
        tabIndex={-1}
      >
        {overlay !== 'palette' && (
          <div className="modal-heading">
            <h2>{tr(titles[overlay])}</h2>
            <IconButton icon={X} label={tr('Close dialog')} onClick={() => open(null)} />
          </div>
        )}
        {overlay === 'palette' && <CommandPalette />}
        {overlay === 'bookmark' && <BookmarkForm />}
        {overlay === 'shortcut' && <ShortcutForm />}
        {overlay === 'workspace' && <WorkspaceForm />}
        {overlay === 'group' && <GroupForm />}
        {overlay === 'split' && <SplitForm />}
        {overlay === 'clear' && <ClearForm />}
        {overlay === 'site' && <SiteInformation />}
        {overlay === 'profile' && <Profile />}
        {overlay === 'downloads' && (
          <>
            <DownloadList compact />
            <button
              className="full-width"
              onClick={() => {
                open(null);
                openPage('downloads');
              }}
            >
              {tr('View all downloads')}
              <ArrowUpRight size={14} />
            </button>
          </>
        )}
        {overlay === 'onboarding' && <Onboarding />}
        {overlay === 'import' && <ImportBrowserData />}
        {overlay === 'passwords' && <PasswordManager />}
        {overlay === 'tabsearch' && <TabSearch />}
        {overlay === 'reader' && <ReadingView />}
        {overlay === 'whatsnew' && <WhatsNew />}
        {overlay === 'browsermenu' && <BrowserMenu />}
        {overlay === 'extensions' && <Extensions />}
      </div>
    </div>
  );
}
function ImportBrowserData() {
  const { open } = useBrowser();
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [kinds, setKinds] = useState<ImportKind[]>(['bookmarks', 'history', 'tabs']);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const ownedPreviews = useRef(new Set<string>());
  const alive = useRef(true);
  const showPreview = (next: ImportPreview | null) => {
    if (!next) {
      setPreview(null);
      return;
    }
    if (!alive.current) {
      void command({ type: 'import.cancel', token: next.token });
      return;
    }
    ownedPreviews.current.add(next.token);
    setPreview(next);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    alive.current = true;
    const owned = ownedPreviews.current;
    void command({ type: 'import.sources' }).then((result) => {
      if (!result.ok) setError(result.error ?? 'Could not find browser profiles');
      else {
        const found = result.sources ?? [];
        setSources(found);
        setSourceId(found[0]?.id ?? '');
      }
    });
    return () => {
      alive.current = false;
      for (const token of owned) void command({ type: 'import.cancel', token });
      owned.clear();
    };
  }, []);
  const names: Record<ImportKind, string> = {
    bookmarks: 'Bookmarks',
    history: 'Browsing history',
    tabs: 'Open tabs',
    cookies: 'Cookies',
    passwords: 'Passwords',
  };
  const toggle = (kind: ImportKind) => {
    setKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
    setPreview(null);
  };
  return (
    <div className="form-stack">
      <p>
        {tr(
          'Bring bookmarks, history and open tabs from Chromium-based or Firefox-based browsers. Every discovered profile is listed separately. For portable browsers or a custom location, choose the profile or user data folder.',
        )}
      </p>
      <label>
        {tr('Browser profile')}
        <select
          aria-label={tr('Browser profile')}
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            setPreview(null);
          }}
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.browser} · {source.profile}
            </option>
          ))}
        </select>
      </label>
      {!sources.length && (
        <p>
          {tr('No compatible profiles were found automatically. Choose a browser folder below.')}
        </p>
      )}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          setPreview(null);
          const result = await command({ type: 'import.folder' });
          if (result.ok && result.sources) {
            const found = result.sources;
            setSources(found);
            setSourceId((current) =>
              found.some((source) => source.id === current) ? current : (found[0]?.id ?? ''),
            );
          } else if (!result.ok) setError(result.error ?? 'Could not read browser profiles');
          setBusy(false);
        }}
      >
        {tr('Choose browser folder')}
      </button>
      {(['bookmarks', 'history', 'tabs'] as const).map((kind) => (
        <label className="checkbox-label" key={kind}>
          <input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggle(kind)} />
          {tr(names[kind])}
        </label>
      ))}
      <details>
        <summary>{tr('Passwords and cookies')}</summary>
        <p>
          {tr(
            "Export passwords as CSV from your previous browser's password manager, then import that file here. Compatible Chromium-based and Firefox-based CSV exports are supported. Imported passwords are encrypted with your operating-system account and available from Saved passwords in the toolbar.",
          )}
        </p>
        <p>
          {tr(
            'The exported CSV contains readable passwords. Delete it after importing if you no longer need it.',
          )}
        </p>
        <p>
          {tr(
            'Cookies can be imported from an exported JSON or Netscape TXT file. Some sites will still require you to sign in again.',
          )}
        </p>
        {(['passwords', 'cookies'] as const).map((kind) => (
          <button
            key={kind}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              setMessage('');
              setPreview(null);
              const result = await command({ type: 'import.file', kind });
              if (result.ok) showPreview(result.preview ?? null);
              else setError(result.error ?? 'Could not read the exported file');
              setBusy(false);
            }}
          >
            {kind === 'passwords' ? tr('Import password CSV') : tr('Import cookie file')}
          </button>
        ))}
      </details>
      {preview && (
        <div className="import-preview">
          <strong>{preview.source}</strong>
          {(['bookmarks', 'history', 'tabs', 'passwords', 'cookies'] as const).map((kind) => (
            <span key={kind}>
              {tr(names[kind])}: {preview.counts[kind]}
            </span>
          ))}
          {preview.warnings.map((warning) => (
            <p key={warning}>{tr(warning)}</p>
          ))}
        </div>
      )}
      {message && <p role="status">{tr(message)}</p>}
      {error && <p role="alert">{tr(error)}</p>}
      <div className="form-actions">
        <button type="button" onClick={() => open(null)}>
          {tr('Close')}
        </button>
        <span />
        <button
          type="button"
          disabled={busy || !sourceId || !kinds.length}
          onClick={async () => {
            setBusy(true);
            setError('');
            const result = await command({ type: 'import.preview', sourceId, kinds });
            if (result.ok && result.preview) showPreview(result.preview);
            else setError(result.error ?? 'Could not preview this profile');
            setBusy(false);
          }}
        >
          {busy ? tr('Reading…') : tr('Preview')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !preview}
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            setError('');
            const result = await command({ type: 'import.apply', token: preview.token });
            if (result.ok && result.report) {
              const { bookmarks, history, tabs, passwords, cookies } = result.report.counts;
              setMessage(
                tr(
                  'Imported: {bookmarks} bookmarks, {history} history entries, {tabs} tabs, {passwords} passwords and {cookies} cookies.',
                  { bookmarks, history, tabs, passwords, cookies },
                ) +
                  ' ' +
                  result.report.warnings.map((warning) => tr(warning)).join(' '),
              );
              setPreview(null);
            } else setError(result.error ?? 'Import failed');
            setBusy(false);
          }}
        >
          {tr('Import')}
        </button>
      </div>
    </div>
  );
}
function FormActions({ text = 'Save', children }: { text?: string; children?: React.ReactNode }) {
  const { open } = useBrowser();
  return (
    <div className="form-actions">
      {children}
      <span />
      <button type="button" onClick={() => open(null)}>
        {tr('Cancel')}
      </button>
      <button type="submit" className="primary">
        {tr(text)}
        <Check size={14} />
      </button>
    </div>
  );
}
function BookmarkForm() {
  const { state, editing, open } = useBrowser();
  const initial = editing as Bookmark;
  const [bookmark, setBookmark] = useState(initial);
  const [error, setError] = useState('');
  if (!state || !bookmark) return null;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!isWebURL(bookmark.url)) {
          setError('Enter a valid HTTP or HTTPS URL.');
          return;
        }
        const r = await command({ type: 'bookmark.save', bookmark });
        if (r.ok) open(null);
      }}
    >
      <label>
        {tr('Name')}
        <input
          autoFocus
          required
          maxLength={500}
          aria-label={tr('Bookmark name')}
          value={bookmark.title}
          onChange={(e) => setBookmark({ ...bookmark, title: e.target.value })}
        />
      </label>
      <label>
        {tr('URL')}
        <input
          required
          aria-label={tr('Bookmark URL')}
          value={bookmark.url}
          onChange={(e) => setBookmark({ ...bookmark, url: e.target.value })}
        />
      </label>
      <label>
        {tr('Folder')}
        <select
          aria-label={tr('Bookmark folder')}
          value={bookmark.folder}
          onChange={(e) => setBookmark({ ...bookmark, folder: e.target.value })}
        >
          {state.folders.map((f) => (
            <option key={f} value={f}>
              {tr(f)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="form-error">{tr(error)}</p>}
      <FormActions text="Done">
        {state.bookmarks.some((b) => b.id === bookmark.id) && (
          <button
            type="button"
            className="danger-text"
            onClick={() => {
              void command({ type: 'bookmark.remove', id: bookmark.id });
              open(null);
            }}
          >
            {tr('Remove')}
          </button>
        )}
      </FormActions>
    </form>
  );
}
function ShortcutForm() {
  const { editing, open, state } = useBrowser();
  const [item, setItem] = useState<Shortcut>(
    (editing as Shortcut) ?? { id: crypto.randomUUID(), title: '', url: '', favicon: '' },
  );
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!state) return;
        try {
          const { url } = resolveInput(item.url, state.settings);
          if (!isWebURL(url)) throw new Error('Enter a website URL');
          const result = await command({ type: 'shortcut.save', shortcut: { ...item, url } });
          if (result.ok) open(null);
        } catch (e) {
          setError(String(e));
        }
      }}
    >
      <label>
        {tr('Name')}
        <input
          required
          autoFocus
          aria-label={tr('Shortcut name')}
          value={item.title}
          onChange={(e) => setItem({ ...item, title: e.target.value })}
        />
      </label>
      <label>
        {tr('Website')}
        <input
          required
          aria-label={tr('Shortcut URL')}
          placeholder={tr('example.com')}
          value={item.url}
          onChange={(e) => setItem({ ...item, url: e.target.value })}
        />
      </label>
      {error && <p className="form-error">{tr(error)}</p>}
      <FormActions />
    </form>
  );
}
function WorkspaceForm() {
  const { state, editing, open } = useBrowser();
  const [item, setItem] = useState<Workspace>(
    (editing as Workspace) ?? {
      id: crypto.randomUUID(),
      name: '',
      color: '#a398ff',
      icon: 'briefcase',
    },
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await command({ type: 'workspace.save', workspace: item });
        if (r.ok) {
          await command({ type: 'workspace.action', action: 'select', id: item.id });
          open(null);
        }
      }}
    >
      <label>
        {tr('Name')}
        <input
          required
          autoFocus
          aria-label={tr('Workspace name')}
          maxLength={40}
          value={item.name}
          onChange={(e) => setItem({ ...item, name: e.target.value })}
        />
      </label>
      <div className="form-columns">
        <label>
          {tr('Color')}
          <input
            type="color"
            aria-label={tr('Workspace color')}
            value={item.color}
            onChange={(e) => setItem({ ...item, color: e.target.value })}
          />
        </label>
        <label>
          {tr('Icon')}
          <select
            aria-label={tr('Workspace icon')}
            value={item.icon}
            onChange={(e) => setItem({ ...item, icon: e.target.value as Workspace['icon'] })}
          >
            <option value="home">{tr('Home')}</option>
            <option value="briefcase">{tr('Work')}</option>
            <option value="book">{tr('Study')}</option>
            <option value="music">{tr('Music')}</option>
            <option value="gamepad">{tr('Gaming')}</option>
          </select>
        </label>
      </div>
      <FormActions>
        {editing && state && state.workspaces.length > 1 && (
          <button
            type="button"
            className="danger-text"
            onClick={() => {
              void command({ type: 'workspace.action', action: 'delete', id: item.id });
              open(null);
            }}
          >
            {tr('Delete space')}
          </button>
        )}
      </FormActions>
      <p className="modal-hint">{tr('Deleting a space moves its tabs to another space.')}</p>
    </form>
  );
}
function GroupForm() {
  const { state, editing, open } = useBrowser();
  const group = editing as TabGroup | null;
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? '#a398ff');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await command({
          type: 'group.save',
          id: group?.id,
          name,
          color,
          tabId: group ? undefined : state?.activeId,
        });
        if (r.ok) open(null);
      }}
    >
      <label>
        {tr('Group name')}
        <input
          required
          autoFocus
          maxLength={40}
          aria-label={tr('Group name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        {tr('Color')}
        <input
          type="color"
          aria-label={tr('Group color')}
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <FormActions>
        {group && (
          <button
            type="button"
            className="danger-text"
            onClick={() => {
              void command({ type: 'group.action', id: group.id, action: 'delete' });
              open(null);
            }}
          >
            {tr('Ungroup tabs')}
          </button>
        )}
      </FormActions>
    </form>
  );
}
function SplitForm() {
  const { state, open } = useBrowser();
  const [otherId, setOtherId] = useState(
    state?.tabs.find(
      (t) => t.id !== state.activeId && t.workspaceId === state.workspaceId && isWebURL(t.url),
    )?.id ?? '',
  );
  const [ratio, setRatio] = useState(0.5);
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  if (!state) return null;
  const current = state.tabs.find((t) => t.id === state.activeId);
  const options = state.tabs.filter(
    (t) => t.id !== state.activeId && t.workspaceId === state.workspaceId && isWebURL(t.url),
  );
  const available = !!current && isWebURL(current.url) && options.length > 0;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await command({ type: 'split', otherId, ratio, direction });
        if (r.ok) open(null);
      }}
    >
      <p className="muted">{tr('Choose a second tab to show alongside this page.')}</p>
      {available ? (
        <>
          <label>
            {tr('Second tab')}
            <select
              aria-label={tr('Second split tab')}
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
            >
              {options.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <div className="form-columns">
            <label>
              {tr('Layout')}
              <select
                aria-label={tr('Split direction')}
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'vertical' | 'horizontal')}
              >
                <option value="vertical">{tr('Side by side')}</option>
                <option value="horizontal">{tr('Stacked')}</option>
              </select>
            </label>
            <label>
              {tr('Ratio')}
              <select
                aria-label={tr('Split ratio')}
                value={ratio}
                onChange={(e) => setRatio(Number(e.target.value))}
              >
                <option value={0.4}>40 / 60</option>
                <option value={0.5}>50 / 50</option>
                <option value={0.6}>60 / 40</option>
              </select>
            </label>
          </div>
          <FormActions text="Start split view" />
        </>
      ) : (
        <p>
          {tr('Open two web tabs in the same workspace, then start split view from one of them.')}
        </p>
      )}
      {state.split && (
        <button
          type="button"
          onClick={() => {
            void command({ type: 'split', otherId: null });
            open(null);
          }}
        >
          {tr('Exit split view')}
        </button>
      )}
    </form>
  );
}
function ClearForm() {
  const { open } = useBrowser();
  const [hours, setHours] = useState(0);
  const [selection, setSelection] = useState({
    history: true,
    cookies: false,
    cache: true,
    session: false,
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await command({ type: 'data.clear', hours, ...selection });
        setBusy(false);
        if (r.ok) open(null);
      }}
    >
      <label>
        {tr('Time range')}
        <select
          aria-label={tr('Clear data time range')}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {[
            [1, 'Last hour'],
            [24, 'Last 24 hours'],
            [168, 'Last 7 days'],
            [672, 'Last 4 weeks'],
            [0, 'All time'],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {tr(l.toString())}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ['history', 'Browsing history and searches'],
          ['cookies', 'Cookies and site storage (all time)'],
          ['cache', 'Cached files (all time)'],
          ['session', 'Recently closed tabs and saved restore records'],
        ] as const
      ).map(([key, label]) => (
        <label className="checkbox-label" key={key}>
          <input
            type="checkbox"
            checked={selection[key]}
            onChange={(e) => setSelection({ ...selection, [key]: e.target.checked })}
          />
          {tr(label)}
        </label>
      ))}
      <p className="modal-hint">
        {tr('Site data removal may sign you out. Open tabs continue to be saved for recovery.')}
      </p>
      <div className="form-actions">
        <button type="button" onClick={() => open(null)}>
          {tr('Cancel')}
        </button>
        <button
          type="submit"
          className="danger"
          disabled={busy || !Object.values(selection).some(Boolean)}
        >
          {busy ? tr('Clearing…') : tr('Clear data')}
        </button>
      </div>
    </form>
  );
}
function SiteInformation() {
  const { state } = useBrowser();
  const [site, setSite] = useState<SiteInfo | null>(null);
  useEffect(() => {
    void command({ type: 'site.info' }).then((r) => {
      if (r.site) setSite(r.site);
    });
  }, []);
  if (!site) return <p>{tr('Reading site information…')}</p>;
  return (
    <div className="site-info">
      <h3>{site.origin}</h3>
      <p className={site.https ? 'secure-label' : 'danger-text'}>
        <Shield size={16} />
        {site.https
          ? tr('HTTPS connection')
          : site.connection === 'pending'
            ? tr('Connection not yet verified')
            : site.connection === 'error'
              ? tr('Connection failed')
              : tr('Connection is not encrypted')}
      </p>
      <p className="muted">
        {site.https
          ? tr(
              'Chromium accepted this connection’s certificate. HTTPS does not establish whether a site is trustworthy.',
            )
          : site.connection === 'pending'
            ? tr('Connection information will be available after this page finishes loading.')
            : tr('Avoid sharing sensitive information on this connection.')}
      </p>
      <h4>{tr('Permissions')}</h4>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={state?.settings.darkSiteExceptions.includes(site.origin) ?? false}
          onChange={(e) =>
            patchSettings({
              darkSiteExceptions: e.target.checked
                ? [...new Set([...(state?.settings.darkSiteExceptions ?? []), site.origin])]
                : state?.settings.darkSiteExceptions.filter((origin) => origin !== site.origin),
            })
          }
        />
        {tr('Keep this site light')}
      </label>
      {site.permissions.length ? (
        site.permissions.map((p) => (
          <div className="site-permission" key={p.permission}>
            <span>
              {tr(p.permission)} · {tr(p.decision)}
            </span>
            <button
              onClick={async () => {
                await command({
                  type: 'permission.remove',
                  origin: p.origin,
                  permission: p.permission,
                });
                setSite({
                  ...site,
                  permissions: site.permissions.filter((x) => x.permission !== p.permission),
                });
              }}
            >
              {tr('Reset')}
            </button>
          </div>
        ))
      ) : (
        <p className="muted">{tr('This site will ask when it needs access.')}</p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={state?.settings.popupAllowlist.includes(site.origin) ?? false}
          onChange={(e) =>
            patchSettings({
              popupAllowlist: e.target.checked
                ? [...(state?.settings.popupAllowlist ?? []), site.origin]
                : state?.settings.popupAllowlist.filter((x) => x !== site.origin),
            })
          }
        />
        {tr('Allow popups from this site')}
      </label>
      <h4>{tr('Cookies: {count}', { count: site.cookies.length })}</h4>
      <div className="cookie-list">
        {site.cookies.map((c, i) => (
          <div key={`${c.name}-${i}`}>
            <code>{c.name}</code>
            <small>
              {c.domain}
              {c.secure ? tr(' · HTTPS only') : ''}
              {c.httpOnly ? tr(' · HTTP only') : ''}
            </small>
          </div>
        ))}
      </div>
      <button
        onClick={async () => {
          await command({ type: 'site.clear', origin: site.origin });
          setSite({ ...site, cookies: [] });
        }}
      >
        {tr('Clear this site’s data')}
      </button>
    </div>
  );
}
function Profile() {
  const { state, open } = useBrowser();
  return (
    <div className="profile-info">
      <span className="profile-avatar">
        {state?.private ? <Shield size={30} /> : tr('Personal').slice(0, 1)}
      </span>
      <h3>{state?.private ? tr('Private session') : tr('Personal')}</h3>
      <p className="muted">
        {state?.private
          ? tr('Visits, searches and tabs are not saved. Downloaded files remain on your device.')
          : tr('Your bookmarks, settings and cookies stay on this device.')}
      </p>
      {!state?.private && (
        <button className="full-width" onClick={() => open('import')}>
          <Download size={16} />
          {tr('Import from another browser')}
        </button>
      )}
      <button
        className="full-width"
        onClick={() => {
          void command({ type: 'window', action: 'private' });
          open(null);
        }}
      >
        <Shield size={16} />
        {tr('Open private window')}
      </button>
      <button
        className="full-width"
        onClick={() => {
          void command({ type: 'window', action: 'new' });
          open(null);
        }}
      >
        <Plus size={16} />
        {tr('Open normal window')}
      </button>
    </div>
  );
}
function Onboarding() {
  const { state, open } = useBrowser();
  const [theme, setTheme] = useState(state?.settings.theme ?? 'dark');
  const [engine, setEngine] = useState(state?.settings.engine ?? 'google');
  const [vertical, setVertical] = useState(false);
  const [restore, setRestore] = useState(true);
  const finish = async (skip = false) => {
    await command({
      type: 'settings',
      patch: skip
        ? { onboarded: true }
        : {
            theme,
            engine,
            verticalTabs: vertical,
            startup: restore ? 'restore' : 'newtab',
            onboarded: true,
          },
    });
    open(null);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void finish();
      }}
    >
      <div className="welcome-orbit">
        <span>{tr('d•')}</span>
      </div>
      <p>{tr('Choose your theme and search engine.')}</p>
      <div className="form-columns">
        <label>
          {tr('Theme')}
          <select
            aria-label={tr('Initial theme')}
            value={theme}
            onChange={(e) => setTheme(e.target.value as typeof theme)}
          >
            <option value="dark">{tr('Dark')}</option>
            <option value="light">{tr('Light')}</option>
            <option value="system">{tr('System')}</option>
          </select>
        </label>
        <label>
          {tr('Search')}
          <select
            aria-label={tr('Initial search engine')}
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
          >
            {state?.settings.engines.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="checkbox-label">
        <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} />
        {tr('Use vertical tabs')}
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={restore} onChange={(e) => setRestore(e.target.checked)} />
        {tr('Continue where I left off')}
      </label>
      <div className="form-actions">
        <button type="button" onClick={() => void finish(true)}>
          {tr('Skip')}
        </button>
        <button type="submit" className="primary">
          {tr('Start browsing')}
          <ArrowUpRight size={15} />
        </button>
      </div>
    </form>
  );
}
function CommandPalette() {
  const { state, open } = useBrowser();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current?.querySelectorAll('button')[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  if (!state) return null;
  const commands: { label: string; icon: LucideIcon; keys?: string; run: () => void }[] = [
    { label: 'New tab', icon: Plus, keys: 'Ctrl T', run: () => void command({ type: 'tab.new' }) },
    {
      label: 'Close tab',
      icon: X,
      keys: 'Ctrl W',
      run: () => void command({ type: 'tab.action', action: 'close' }),
    },
    {
      label: 'Duplicate tab',
      icon: Copy,
      run: () => void command({ type: 'tab.action', action: 'duplicate' }),
    },
    {
      label: 'Reopen closed tab',
      icon: History,
      run: () => void command({ type: 'tab.action', action: 'restore' }),
    },
    { label: 'Bookmark page', icon: Star, run: bookmarkCurrent },
    { label: 'Search open tabs', icon: Search, keys: 'Ctrl Shift A', run: () => open('tabsearch') },
    { label: 'Reading view', icon: Layers, keys: 'Ctrl Shift M', run: () => open('reader') },
    {
      label: 'Save as PDF',
      icon: Download,
      keys: 'Ctrl Shift S',
      run: () => void command({ type: 'page', action: 'pdf' }),
    },
    ...[
      ['History', History],
      ['Bookmarks', Star],
      ['Downloads', Download],
      ['Settings', Settings2],
    ].map(([label, icon]) => ({
      label: label as string,
      icon: icon as LucideIcon,
      run: () => openPage((label as string).toLowerCase()),
    })),
    { label: 'New workspace', icon: Plus, run: () => open('workspace') },
    {
      label: 'Toggle sidebar',
      icon: PanelLeft,
      run: () => patchSettings({ sidebar: !state.settings.sidebar }),
    },
    {
      label: 'Toggle vertical tabs',
      icon: Layers,
      run: () => patchSettings({ verticalTabs: !state.settings.verticalTabs, sidebar: true }),
    },
    { label: 'Split view', icon: Columns2, run: () => open('split') },
    {
      label: 'Developer tools',
      icon: Code2,
      keys: 'F12',
      run: () => void command({ type: 'page', action: 'devtools' }),
    },
    { label: 'Clear browsing data', icon: Trash2, run: () => open('clear') },
    { label: 'Dark theme', icon: Moon, run: () => patchSettings({ theme: 'dark' }) },
    { label: 'Light theme', icon: Sun, run: () => patchSettings({ theme: 'light' }) },
    ...state.workspaces.map((w) => ({
      label: tr('Switch workspace · {name}', { name: w.name }),
      icon: Layers,
      run: () => void command({ type: 'workspace.action', action: 'select', id: w.id }),
    })),
    ...state.tabs.map((t) => ({
      label: `${t.title} · ${state.workspaces.find((w) => w.id === t.workspaceId)?.name} · ${t.url}`,
      icon: Globe,
      run: () => void command({ type: 'tab.action', action: 'select', id: t.id }),
    })),
  ]
    .map((c) => ({ ...c, label: tr(c.label) }))
    .filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  const choose = (i: number) => {
    const item = commands[i];
    if (!item) return;
    open(null);
    item.run();
  };
  return (
    <>
      <div className="palette-input">
        <Search size={20} />
        <input
          autoFocus
          aria-label={tr('Search commands and tabs')}
          value={q}
          placeholder={tr('Search commands or tabs')}
          onChange={(e) => {
            setQ(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(commands.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              choose(index);
            }
          }}
        />
        <kbd>{tr('esc')}</kbd>
      </div>
      <div className="palette-results" ref={container}>
        {commands.map((c, i) => (
          <button
            key={`${c.label}-${i}`}
            className={index === i ? 'selected' : ''}
            onMouseEnter={() => setIndex(i)}
            onClick={() => choose(i)}
          >
            <c.icon size={16} />
            <span>{c.label}</span>
            {c.keys && <kbd>{c.keys}</kbd>}
          </button>
        ))}
        {!commands.length && <p className="empty-palette">{tr('No commands or tabs match.')}</p>}
      </div>
      <div className="palette-footer">
        <span>{tr('DOT QUICK COMMAND')}</span>
        <span>
          <kbd>↑ ↓</kbd>
          {tr('navigate')}
          <kbd>↵</kbd>
          {tr('select')}
        </span>
      </div>
    </>
  );
}
