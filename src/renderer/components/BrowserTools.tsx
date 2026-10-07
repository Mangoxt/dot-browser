import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import {
  BookOpen,
  Columns2,
  Search,
  History,
  Star,
  Download,
  Settings2,
  KeyRound,
  Puzzle,
  UserRound,
  PanelRight,
  Plus,
  Shield,
  FileDown,
  Printer,
  Trash2,
  Info,
  Sparkles,
  Link,
  FolderClock,
  type LucideIcon,
} from 'lucide-react';
import type { ExtensionSummary } from '../../shared/extensions';
import { command, openPage, useBrowser, type Overlay } from '../stores/browser';
import type { Command } from '../../shared/ipc';
import { isWebURL } from '../../shared/navigation';

export function BrowserMenu() {
  const { state, open, panel, set } = useBrowser();
  if (!state) return null;
  const tab = state.tabs.find((t) => t.id === state.activeId)!;
  const web = isWebURL(tab.url);
  const run = (c: Command) => {
    open(null);
    void command(c);
  };
  const page = (name: string) => {
    open(null);
    openPage(name);
  };
  const item = (
    Icon: LucideIcon,
    label: string,
    action: () => void,
    shortcut?: string,
    disabled = false,
  ) => (
    <button
      key={tr(label)}
      className="browser-menu-item"
      onClick={action}
      disabled={disabled}
      autoFocus={label === 'New tab'}
    >
      <Icon size={17} />
      <span>{tr(label)}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  const overlay = (name: Overlay) => () => open(name);
  return (
    <div className="browser-menu-content">
      <div className="menu-section">
        <p className="menu-section-label">{tr('Tabs and windows')}</p>
        {item(Plus, 'New tab', () => run({ type: 'tab.new' }), 'Ctrl T')}
        {item(Plus, 'New window', () => run({ type: 'window', action: 'new' }), 'Ctrl N')}
        {item(
          History,
          'Reopen closed tab',
          () => run({ type: 'tab.action', action: 'restore' }),
          'Ctrl Shift T',
        )}
        {item(
          Shield,
          'Private window',
          () => run({ type: 'window', action: 'private' }),
          'Ctrl Shift N',
        )}
        {item(Search, 'Search tabs', overlay('tabsearch'), 'Ctrl Shift A')}
      </div>
      <div className="menu-section">
        <p className="menu-section-label">{tr('Library')}</p>
        {item(History, 'History', () => page('history'), 'Ctrl H')}
        {item(Star, 'Bookmarks', () => page('bookmarks'))}
        {item(FolderClock, 'Saved sessions', overlay('sessions'))}
        {item(Download, 'Downloads', overlay('downloads'), 'Ctrl J')}
        {item(KeyRound, 'Saved passwords', overlay('passwords'))}
        {item(Puzzle, 'Extensions', overlay('extensions'))}
      </div>
      <div className="menu-zoom">
        <span>{tr('Zoom')}</span>
        <button
          aria-label={tr('Zoom out')}
          disabled={!web || tab.zoom <= 0.25}
          onClick={() =>
            void command({
              type: 'zoom',
              value: Math.max(0.25, Math.round((tab.zoom - 0.1) * 100) / 100),
            })
          }
        >
          −
        </button>
        <button
          aria-label={tr('Reset zoom')}
          disabled={!web}
          onClick={() => void command({ type: 'zoom', value: 1 })}
        >
          {Math.round(tab.zoom * 100)}%
        </button>
        <button
          aria-label={tr('Zoom in')}
          disabled={!web || tab.zoom >= 3}
          onClick={() =>
            void command({
              type: 'zoom',
              value: Math.min(3, Math.round((tab.zoom + 0.1) * 100) / 100),
            })
          }
        >
          +
        </button>
      </div>
      <details className="menu-tools">
        <summary>{tr('Page tools')}</summary>
        {item(
          Link,
          'Copy page link',
          () => run({ type: 'page', action: 'copyLink' }),
          undefined,
          !web,
        )}
        {item(
          Link,
          'Copy clean link',
          () => run({ type: 'page', action: 'copyCleanLink' }),
          undefined,
          !web,
        )}
        {item(
          BookOpen,
          'Read later',
          () => run({ type: 'page', action: 'readLater' }),
          undefined,
          !web,
        )}
        {item(BookOpen, 'Reading view', overlay('reader'), 'Ctrl Shift M', !web)}
        {item(Columns2, 'Split view', overlay('split'))}
        {item(PanelRight, panel ? 'Close side panel' : 'Bookmarks side panel', () => {
          open(null);
          set({ panel: panel ? null : 'bookmarks' });
        })}
        {item(
          Search,
          'Find in page',
          () => {
            open(null);
            set({ find: true });
          },
          'Ctrl F',
          !web,
        )}
        {item(
          FileDown,
          'Save as PDF',
          () => run({ type: 'page', action: 'pdf' }),
          'Ctrl Shift S',
          !web,
        )}
        {item(Printer, 'Print', () => run({ type: 'page', action: 'print' }), 'Ctrl P', !web)}
        {item(FileDown, 'Save page', () => run({ type: 'page', action: 'save' }), 'Ctrl S', !web)}
        {item(Star, tab.pinned ? 'Unpin tab' : 'Pin tab', () =>
          run({ type: 'tab.action', action: 'pin' }),
        )}
        {item(
          Shield,
          tab.muted ? 'Unmute tab' : 'Mute tab',
          () => run({ type: 'tab.action', action: 'mute' }),
          undefined,
          !web,
        )}
        {item(Trash2, 'Clear browsing data', overlay('clear'))}
      </details>
      <div className="menu-section">
        <p className="menu-section-label">{tr('Browser')}</p>
        {item(
          UserRound,
          state.private ? 'Private session' : 'Profile and import',
          overlay('profile'),
        )}
        {item(Settings2, 'Settings', () => page('settings'))}
        {item(Sparkles, 'Neler yeni?', overlay('whatsnew'))}
        {item(Info, 'About Dot', () => page('about'))}
      </div>
    </div>
  );
}

const builtins = [
  {
    id: 'night' as const,
    name: 'Gece görünümü',
    description: 'Açık renkli sayfaları koyulaştırır. Bazı sitelerde renkler farklı görünebilir.',
  },
  {
    id: 'scroll' as const,
    name: 'Başa dön',
    description: 'Uzun sayfalarda tek tıkla başa dönmek için küçük bir düğme ekler.',
  },
];
export function Extensions() {
  const { state } = useBrowser();
  const [items, setItems] = useState<ExtensionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    void command({ type: 'extension.list' }).then((r) => {
      setItems(r.extensions || []);
      if (!r.ok) setError(r.error || 'Eklentiler yüklenemedi.');
    });
  }, []);
  const run = async (c: Command) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await command(c);
      if (result.ok) {
        setItems(result.extensions || []);
        setMessage(
          'Değişiklikler kaydedildi. Açık sayfalarda etkisini görmek için sayfayı yenileyin.',
        );
      } else setError(result.error || 'Eklenti yüklenemedi.');
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || !!state?.private;
  return (
    <div className="extension-manager">
      <p className="muted">
        {tr(
          "Hazır eklentilerden seçin veya manifest.json içeren bir eklenti klasörü ekleyin. Chrome Web Store'dan doğrudan kurulum desteklenmez; bazı Chrome eklentileri uyumlu olmayabilir.",
        )}
      </p>
      {state?.private && (
        <p className="modal-hint">
          {tr('Eklentiler gizli pencerelerde çalışmaz. Yönetmek için normal pencereye geçin.')}
        </p>
      )}
      <button disabled={disabled} onClick={() => void run({ type: 'extension.install' })}>
        <Plus size={15} />
        {tr('Klasörden eklenti ekle')}
      </button>
      <h3>{tr('Hazır eklentiler')}</h3>
      {builtins.map((builtin) => (
        <div className="extension-card" key={builtin.id}>
          <Puzzle size={22} />
          <div>
            <strong>{tr(builtin.name)}</strong>
            <p>{tr(builtin.description)}</p>
          </div>
          <button
            disabled={disabled || items.some((i) => i.builtin === builtin.id)}
            onClick={() => void run({ type: 'extension.install', builtin: builtin.id })}
          >
            {items.some((i) => i.builtin === builtin.id) ? tr('Eklendi') : tr('Ekle')}
          </button>
        </div>
      ))}
      <h3>
        {tr('Eklenen eklentiler')}
        <span className="badge">{items.length}</span>
      </h3>
      {!items.length && (
        <p className="muted">
          {tr('Henüz eklenti eklenmedi. Eklentiler yalnızca siz eklediğinizde etkinleşir.')}
        </p>
      )}
      {items.map((item) => (
        <div className="extension-card installed" key={item.id}>
          <Puzzle size={22} />
          <div>
            <strong>
              {item.builtin ? tr(item.name) : item.name} <small>{item.version}</small>
            </strong>
            <p>{item.builtin ? tr(item.description) : item.description}</p>
            {item.error && <p role="alert">{tr(item.error)}</p>}
            <label className="extension-toggle">
              <input
                type="checkbox"
                checked={item.enabled}
                disabled={disabled}
                onChange={() =>
                  void run({
                    type: 'extension.action',
                    id: item.id,
                    action: item.enabled ? 'disable' : 'enable',
                  })
                }
              />{' '}
              {item.enabled ? tr('Etkin') : tr('Kapalı')}
            </label>
          </div>
          <button
            disabled={disabled}
            onClick={() => void run({ type: 'extension.action', id: item.id, action: 'remove' })}
          >
            {tr('Kaldır')}
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {message && (
        <p role="status" className="modal-hint">
          {tr(message)}
        </p>
      )}
      <p className="modal-hint">
        {tr(
          'Yalnızca güvendiğiniz eklentileri yükleyin; eklentiler ziyaret ettiğiniz sayfalara erişebilir.',
        )}
      </p>
    </div>
  );
}
