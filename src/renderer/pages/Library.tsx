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
      <PageHeading eyebrow="YOUR TRAIL" title="History">
        <button onClick={() => open('clear')}>
          <Trash2 size={15} />
          Clear browsing data
        </button>
      </PageHeading>
      <div className="library-toolbar">
        <label className="filter-input">
          <Search size={16} />
          <input
            aria-label="Search history"
            placeholder="Search your history"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span>{history.length} sites</span>
        {!!selected.length && (
          <button
            className="danger-text"
            onClick={() => {
              void command({ type: 'history.delete', ids: selected });
              setSelected([]);
            }}
          >
            Delete {selected.length} selected
          </button>
        )}
      </div>
      {!history.length && (
        <Empty
          icon={HistoryIcon}
          title="A clean slate"
          detail={
            state.private
              ? 'Your visits stay out of history in this private window.'
              : 'The places you visit will appear here.'
          }
        />
      )}
      {['Today', 'Yesterday', 'Previous 7 days', 'Older'].map((group) => {
        const items = history.filter((h) => historyGroup(h.timestamp) === group);
        return items.length ? (
          <section className="library-group" key={group}>
            <h3>{group}</h3>
            {items.map((h) => (
              <div className="library-row" key={h.id}>
                <input
                  aria-label={`Select ${h.title}`}
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
                    {domainOf(h.url)} · {h.visitCount} visit{h.visitCount === 1 ? '' : 's'}
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
                  label="Open in new tab"
                  onClick={() => void command({ type: 'tab.new', url: h.url })}
                />
                <IconButton
                  icon={Copy}
                  label="Copy URL"
                  onClick={() => void command({ type: 'clipboard', text: h.url })}
                />
                <IconButton
                  icon={Trash2}
                  label="Delete history entry"
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
      <PageHeading eyebrow="KEEP THE GOOD STUFF" title="Bookmarks">
        <button onClick={() => open('import')}>
          <Upload size={15} />
          Import browser
        </button>
        <button onClick={() => void command({ type: 'bookmark.transfer', action: 'import' })}>
          <Upload size={15} />
          Import file
        </button>
        <button onClick={() => void command({ type: 'bookmark.transfer', action: 'export' })}>
          <ArrowDownToLine size={15} />
          Export
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
          Add bookmark
        </button>
      </PageHeading>
      <div className="library-toolbar">
        <label className="filter-input">
          <Search size={16} />
          <input
            aria-label="Search bookmarks"
            placeholder="Search bookmarks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Bookmark folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          {['All', ...state.folders].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button onClick={() => setAdding(!adding)}>
          <FolderPlus size={15} />
          New folder
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
            placeholder="Folder name"
            aria-label="Folder name"
            maxLength={60}
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <button type="submit" className="primary">
            Create
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      {!bookmarks.length && (
        <Empty
          icon={Star}
          title="Worth coming back to"
          detail="Save a page with the star in your address bar, or add one here."
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
              label="Open bookmark in new tab"
              onClick={() => void command({ type: 'tab.new', url: b.url })}
            />
            <IconButton icon={Pencil} label="Edit bookmark" onClick={() => open('bookmark', b)} />
            <IconButton
              icon={Trash2}
              label="Remove bookmark"
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
          title="Nothing downloading"
          detail="Your downloads will appear here."
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
                  : `${d.status} · ${bytes(d.received)}${d.total ? ` of ${bytes(d.total)}` : ''}${d.speed ? ` · ${bytes(d.speed)}/s` : ''}`}
              </small>
              {live && <progress value={d.received} max={d.total || Math.max(1, d.received)} />}{' '}
              {!compact && d.path && <small className="download-path">{d.path}</small>}
            </div>
            <div className="download-actions">
              {live && (
                <>
                  <IconButton
                    icon={d.status === 'paused' ? Play : Pause}
                    label={d.status === 'paused' ? 'Resume download' : 'Pause download'}
                    onClick={() => action(d.status === 'paused' ? 'resume' : 'pause')}
                  />
                  <IconButton icon={X} label="Cancel download" onClick={() => action('cancel')} />
                </>
              )}
              {['cancelled', 'interrupted'].includes(d.status) && (
                <IconButton
                  icon={RotateCw}
                  label="Retry download"
                  onClick={() => action('retry')}
                />
              )}
              <IconButton
                icon={FolderOpen}
                label="Show in folder"
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
      <PageHeading eyebrow="FROM THE WEB TO YOU" title="Downloads">
        <button onClick={() => void command({ type: 'download', id: 'all', action: 'clear' })}>
          <Trash2 size={15} />
          Clear completed
        </button>
        <button onClick={() => openPage('settings#downloads')}>Download settings</button>
      </PageHeading>
      <DownloadList />
    </div>
  );
}
