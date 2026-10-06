import { tr } from '../i18n';
import { useState } from 'react';
import {
  History as HistoryIcon,
  Star,
  Download,
  Search,
  Trash2,
  Copy,
  ExternalLink,
  Pencil,
  FolderPlus,
  Plus,
  Upload,
  FolderOpen,
  Pause,
  Play,
  RotateCw,
  X,
  File,
  ArrowDownToLine,
} from 'lucide-react';
import { command, openPage, useBrowser } from '../stores/browser';
import { bytes, Empty, Favicon, IconButton, PageHeading } from '../components/common';
import { domainOf, historyGroup } from '../../shared/navigation';

export function HistoryPage() {
  const { state, open } = useBrowser();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  if (!state) return null;
  const history = state.history.filter((h) =>
    `${h.title} ${h.url}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="internal-page">
      <PageHeading eyebrow={tr('BROWSING HISTORY')} title={tr('History')}>
        <button onClick={() => open('clear')}>
          <Trash2 size={15} />
          {tr('Clear browsing data')}
        </button>
      </PageHeading>
      <div className="library-toolbar">
        <label className="filter-input">
          <Search size={16} />
          <input
            aria-label={tr('Search history')}
            placeholder={tr('Search your history')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span>{tr('{count} history entries', { count: history.length })}</span>
        {!!selected.length && (
          <button
            className="danger-text"
            onClick={() => {
              void command({ type: 'history.delete', ids: selected });
              setSelected([]);
            }}
          >
            {tr('Delete')} · {tr('{count} selected', { count: selected.length })}
          </button>
        )}
      </div>
      {!history.length && (
        <Empty
          icon={HistoryIcon}
          title={tr('No history yet')}
          detail={
            state.private
              ? tr('Your visits stay out of history in this private window.')
              : tr('The places you visit will appear here.')
          }
        />
      )}
      {['Today', 'Yesterday', 'Previous 7 days', 'Older'].map((group) => {
        const items = history.filter((h) => historyGroup(h.timestamp) === group);
        return items.length ? (
          <section className="library-group" key={group}>
            <h3>{tr(group)}</h3>
            {items.map((h) => (
              <div className="library-row" key={h.id}>
                <input
                  aria-label={tr('Select {name}', { name: h.title })}
                  type="checkbox"
                  checked={selected.includes(h.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, h.id] : selected.filter((id) => id !== h.id),
                    )
                  }
                />
                <Favicon url={h.favicon} />
                <button
                  className="row-content"
                  onClick={() => void command({ type: 'tab.navigate', input: h.url })}
                >
                  <strong>{h.title}</strong>
                  <small>
                    {domainOf(h.url)} · {tr('{count} visits', { count: h.visitCount })}
                  </small>
                </button>
                <time>
                  {new Date(h.timestamp).toLocaleTimeString(state.settings.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <IconButton
                  icon={ExternalLink}
                  label={tr('Open in new tab')}
                  onClick={() => void command({ type: 'tab.new', url: h.url })}
                />
                <IconButton
                  icon={Copy}
                  label={tr('Copy URL')}
                  onClick={() => void command({ type: 'clipboard', text: h.url })}
                />
                <IconButton
                  icon={Trash2}
                  label={tr('Delete history entry')}
                  onClick={() => void command({ type: 'history.delete', ids: [h.id] })}
                />
              </div>
            ))}
          </section>
        ) : null;
      })}
    </div>
  );
}
export function BookmarksPage() {
  const { state, open } = useBrowser();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('All');
  const [newFolder, setNewFolder] = useState('');
  const [adding, setAdding] = useState(false);
  if (!state) return null;
  const bookmarks = state.bookmarks.filter(
    (b) =>
      (folder === 'All' || b.folder === folder) &&
      `${b.title} ${b.url}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="internal-page">
      <PageHeading eyebrow={tr('SAVED PAGES')} title={tr('Bookmarks')}>
        <button onClick={() => open('import')}>
          <Upload size={15} />
          {tr('Import browser')}
        </button>
        <button onClick={() => void command({ type: 'bookmark.transfer', action: 'import' })}>
          <Upload size={15} />
          {tr('Import file')}
        </button>
        <button onClick={() => void command({ type: 'bookmark.transfer', action: 'export' })}>
          <ArrowDownToLine size={15} />
          {tr('Export')}
        </button>
        <button
          className="primary"
          onClick={() =>
            open('bookmark', {
              id: crypto.randomUUID(),
              title: '',
              url: 'https://',
              folder: folder === 'All' ? 'Favorites' : folder,
              favicon: '',
              createdAt: Date.now(),
            })
          }
        >
          <Plus size={15} />
          {tr('Add bookmark')}
        </button>
      </PageHeading>
      <div className="library-toolbar">
        <label className="filter-input">
          <Search size={16} />
          <input
            aria-label={tr('Search bookmarks')}
            placeholder={tr('Search bookmarks')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label={tr('Bookmark folder')}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          {['All', ...state.folders].map((f) => (
            <option key={f} value={f}>
              {tr(f)}
            </option>
          ))}
        </select>
        <button onClick={() => setAdding(!adding)}>
          <FolderPlus size={15} />
          {tr('New folder')}
        </button>
      </div>
      {adding && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (newFolder.trim()) {
              void command({ type: 'folder.add', name: newFolder.trim() });
              setNewFolder('');
              setAdding(false);
            }
          }}
        >
          <input
            autoFocus
            placeholder={tr('Folder name')}
            aria-label={tr('Folder name')}
            maxLength={60}
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <button type="submit" className="primary">
            {tr('Create')}
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            {tr('Cancel')}
          </button>
        </form>
      )}
      {!bookmarks.length && (
        <Empty
          icon={Star}
          title={tr('No bookmarks yet')}
          detail={tr('Save a page with the star in your address bar, or add one here.')}
        />
      )}
      <div className="bookmark-list">
        {bookmarks.map((b) => (
          <div
            className="library-row"
            key={b.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('dot/bookmark', b.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('dot/bookmark');
              if (id)
                void command({
                  type: 'bookmark.reorder',
                  id,
                  index: state.bookmarks.findIndex((x) => x.id === b.id),
                });
            }}
          >
            <Favicon url={b.favicon} />
            <button
              className="row-content"
              onClick={() => void command({ type: 'tab.navigate', input: b.url })}
            >
              <strong>{b.title}</strong>
              <small>
                {domainOf(b.url)} · {b.folder}
              </small>
            </button>
            <IconButton
              icon={ExternalLink}
              label={tr('Open bookmark in new tab')}
              onClick={() => void command({ type: 'tab.new', url: b.url })}
            />
            <IconButton
              icon={Pencil}
              label={tr('Edit bookmark')}
              onClick={() => open('bookmark', b)}
            />
            <IconButton
              icon={Trash2}
              label={tr('Remove bookmark')}
              onClick={() => void command({ type: 'bookmark.remove', id: b.id })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
export function DownloadList({ compact = false }: { compact?: boolean }) {
  const { state } = useBrowser();
  if (!state) return null;
  return (
    <div className={`download-list ${compact ? 'compact-list' : ''}`}>
      {!state.downloads.length && (
        <Empty
          icon={Download}
          title={tr('Nothing downloading')}
          detail={tr('Your downloads will appear here.')}
        />
      )}
      {state.downloads.slice(0, compact ? 5 : undefined).map((d) => {
        const action = (action: 'open' | 'pause' | 'resume' | 'cancel' | 'reveal' | 'retry') =>
          void command({ type: 'download', id: d.id, action });
        const live = d.status === 'progressing' || d.status === 'paused';
        return (
          <div className="download-row" key={d.id}>
            <span className="file-icon">
              <File size={21} />
            </span>
            <div className="download-content">
              <button
                disabled={d.status !== 'completed'}
                title={d.path || d.filename}
                onClick={() => action('open')}
              >
                <strong>{d.filename}</strong>
              </button>
              <small>
                {d.status === 'completed'
                  ? `${bytes(d.total || d.received)} · ${domainOf(d.url)}`
                  : `${tr(d.status)} · ${bytes(d.received)}${d.total ? ` ${tr('of {total}', { total: bytes(d.total) })}` : ''}${d.speed ? ` · ${bytes(d.speed)}/s` : ''}`}
              </small>
              {live && <progress value={d.received} max={d.total || Math.max(1, d.received)} />}{' '}
              {!compact && d.path && <small className="download-path">{d.path}</small>}
            </div>
            <div className="download-actions">
              {live && (
                <>
                  <IconButton
                    icon={d.status === 'paused' ? Play : Pause}
                    label={d.status === 'paused' ? tr('Resume download') : tr('Pause download')}
                    onClick={() => action(d.status === 'paused' ? 'resume' : 'pause')}
                  />
                  <IconButton
                    icon={X}
                    label={tr('Cancel download')}
                    onClick={() => action('cancel')}
                  />
                </>
              )}
              {['cancelled', 'interrupted'].includes(d.status) && (
                <IconButton
                  icon={RotateCw}
                  label={tr('Retry download')}
                  onClick={() => action('retry')}
                />
              )}
              <IconButton
                icon={FolderOpen}
                label={tr('Show in folder')}
                disabled={!d.path || d.status !== 'completed'}
                onClick={() => action('reveal')}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function DownloadsPage() {
  return (
    <div className="internal-page">
      <PageHeading eyebrow={tr('FILES')} title={tr('Downloads')}>
        <button onClick={() => void command({ type: 'download', id: 'all', action: 'clear' })}>
          <Trash2 size={15} />
          {tr('Clear completed')}
        </button>
        <button onClick={() => openPage('settings#downloads')}>{tr('Download settings')}</button>
      </PageHeading>
      <DownloadList />
    </div>
  );
}
