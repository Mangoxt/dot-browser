import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  ArrowUpRight,
  Pencil,
  X,
  SlidersHorizontal,
  Command,
  Star,
  History,
  Download,
  BookOpen,
  Layers,
  FolderClock,
} from 'lucide-react';
import { command, openPage, useBrowser } from '../stores/browser';
import { Favicon, IconButton } from '../components/common';
import { domainOf } from '../../shared/navigation';
export default function NewTab() {
  const { state, open } = useBrowser();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!state) return null;
  const workspace = state.workspaces.find((w) => w.id === state.workspaceId);
  const reading = state.bookmarks.filter((b) => b.folder === 'Reading list').slice(0, 4);
  const recent: typeof state.history = [];
  const seen = new Set<string>();
  for (const entry of state.history) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    recent.push(entry);
    if (recent.length === 3) break;
  }
  return (
    <div className={`newtab background-${state.settings.background}`}>
      <div className="newtab-top">
        <span>
          <span className="tiny-dot" />
          DOT BROWSER
        </span>
        {workspace && (
          <span className="newtab-workspace">
            <Layers size={13} />
            <i style={{ background: workspace.color }} />
            {workspace.name}
          </span>
        )}
      </div>
      <div className="newtab-center">
        <section className="newtab-hero" aria-labelledby="newtab-title">
          <div className="newtab-hero-copy">
            <span className="newtab-home-label">{tr('Home')}</span>
            <h1 id="newtab-title">{tr('New tab')}</h1>
            <p>{tr('Search, shortcuts and saved pages.')}</p>
          </div>
          <div className="newtab-clock">
            <strong>
              {now.toLocaleTimeString(state.settings.language, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </strong>
            <small>
              {now.toLocaleDateString(state.settings.language, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </small>
          </div>
          <div className="newtab-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
            <i />
          </div>
          <form
            className="newtab-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void command({ type: 'tab.navigate', input: query });
            }}
          >
            <Search size={19} />
            <input
              aria-label={tr('Search the web')}
              placeholder={tr('Search {engine} or enter an address', {
                engine:
                  state.settings.engines.find((e) => e.id === state.settings.engine)?.name ??
                  tr('the web'),
              })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              title={tr('Search')}
              aria-label={tr('Search')}
              disabled={!query.trim()}
            >
              <ArrowUpRight size={19} />
            </button>
          </form>
          <nav className="newtab-library" aria-label={tr('Library')}>
            <button onClick={() => openPage('bookmarks')}>
              <Star size={15} />
              {tr('Bookmarks')}
            </button>
            <button onClick={() => openPage('history')}>
              <History size={15} />
              {tr('History')}
            </button>
            <button onClick={() => open('downloads')}>
              <Download size={15} />
              {tr('Downloads')}
            </button>
            {!state.private && (
              <button onClick={() => open('sessions')}>
                <FolderClock size={15} />
                {tr('Saved sessions')}
              </button>
            )}
          </nav>
        </section>
        <div className="newtab-sections">
          <section className="newtab-shortcuts" aria-labelledby="shortcuts-title">
            <div className="newtab-section-heading">
              <h2 id="shortcuts-title">{tr('Shortcuts')}</h2>
              <span>{tr('Drag to reorder')}</span>
            </div>
            <div className="speed-dial">
              {state.shortcuts.map((s, i) => (
                <div
                  key={s.id}
                  className="speed-item"
                  style={{ animationDelay: `${Math.min(i * 24, 144)}ms` }}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('dot/shortcut', s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('dot/shortcut');
                    if (id) void command({ type: 'shortcut.reorder', id, index: i });
                  }}
                >
                  <button
                    className="speed-open"
                    title={s.url}
                    onClick={() => void command({ type: 'tab.navigate', input: s.url })}
                  >
                    <span className="speed-icon">
                      {s.favicon ? (
                        <Favicon url={s.favicon} size={22} />
                      ) : (
                        <span>{s.title.slice(0, 1)}</span>
                      )}
                    </span>
                    <span className="speed-caption">
                      <strong>{s.title}</strong>
                      <small>{domainOf(s.url)}</small>
                    </span>
                    <ArrowUpRight className="speed-arrow" size={14} />
                  </button>
                  <div className="speed-edit">
                    <IconButton
                      icon={Pencil}
                      label={tr('Edit {name}', { name: s.title })}
                      onClick={() => open('shortcut', s)}
                    />
                    <IconButton
                      icon={X}
                      label={tr('Remove {name}', { name: s.title })}
                      onClick={() => void command({ type: 'shortcut.remove', id: s.id })}
                    />
                  </div>
                </div>
              ))}
              <div className="speed-item">
                <button className="speed-open add-shortcut" onClick={() => open('shortcut')}>
                  <span className="speed-icon">
                    <Plus size={21} />
                  </span>
                  <span>{tr('Add shortcut')}</span>
                </button>
              </div>
            </div>
            {!!recent.length && (
              <div className="recent-sites">
                <span>{tr('Browsing history')}</span>
                {recent.map((h) => (
                  <button
                    key={h.id}
                    title={h.url}
                    onClick={() => void command({ type: 'tab.navigate', input: h.url })}
                  >
                    <Favicon url={h.favicon} size={15} />
                    <span className="recent-caption">
                      <strong>{h.title || domainOf(h.url)}</strong>
                      <small>{domainOf(h.url)}</small>
                    </span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="newtab-reading" aria-labelledby="reading-title">
            <div className="newtab-section-heading">
              <h2 id="reading-title">
                <BookOpen size={17} />
                {tr('Reading list')}
              </h2>
              <IconButton
                icon={ArrowUpRight}
                label={tr('Open bookmarks')}
                onClick={() => openPage('bookmarks')}
              />
            </div>
            {reading.length ? (
              <div className="newtab-reading-items">
                {reading.map((b) => (
                  <button
                    key={b.id}
                    title={b.url}
                    onClick={() => void command({ type: 'tab.navigate', input: b.url })}
                  >
                    <Favicon url={b.favicon} size={18} />
                    <span>
                      <strong>{b.title}</strong>
                      <small>{domainOf(b.url)}</small>
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="newtab-reading-empty">
                <BookOpen size={30} />
                <strong>{tr('Keep a page for later')}</strong>
                <p>{tr('Choose Read later in Page tools. Your saved pages appear here.')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="newtab-bottom">
        <div>
          <button onClick={() => open('palette')}>
            <Command size={14} />
            <kbd>{tr('Ctrl K')}</kbd>
          </button>
          <button onClick={() => openPage('settings#appearance')}>
            <SlidersHorizontal size={14} />
            {tr('Customize')}
          </button>
        </div>
      </div>
    </div>
  );
}
