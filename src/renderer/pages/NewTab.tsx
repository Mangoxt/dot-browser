import { tr } from '../i18n';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  MoreHorizontal,
  SlidersHorizontal,
  Star,
  History,
  Download,
  BookOpen,
  Layers,
  FolderClock,
  X,
  Check,
  Shield,
} from 'lucide-react';
import { command, openPage, patchSettings, useBrowser } from '../stores/browser';
import { Favicon } from '../components/common';
import { domainOf } from '../../shared/navigation';
import '../styles/newtab.css';

export default function NewTab() {
  const { state, open } = useBrowser();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(new Date());
  const [customize, setCustomize] = useState(false);
  const [options, setOptions] = useState<string | null>(null);
  const customTrigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const optionOpener = useRef<HTMLButtonElement | null>(null);
  const closeCustom = () => {
    setCustomize(false);
    requestAnimationFrame(() => customTrigger.current?.focus());
  };
  const closeOptions = () => {
    setOptions(null);
    requestAnimationFrame(() => optionOpener.current?.focus());
  };
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!customize) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeCustom();
      }
      if (e.key === 'Tab') {
        const nodes = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, select',
          ) ?? []),
        ];
        if (!nodes.length) return;
        if (
          e.shiftKey &&
          (document.activeElement === nodes[0] || !panel.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === nodes.at(-1) ||
            !panel.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [customize]);
  useEffect(() => {
    if (!options) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (e: PointerEvent) => {
      if (
        !menu.current?.contains(e.target as Node) &&
        !optionOpener.current?.contains(e.target as Node)
      )
        setOptions(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeOptions();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const nodes = [
          ...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
        ];
        const i = nodes.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? nodes.length - 1
              : (i + (e.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
        nodes[next]?.focus();
      }
      if (e.key === 'Tab') setOptions(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key, true);
    };
  }, [options]);
  if (!state) return null;
  const s = state.settings;
  const expanded = s.newTabLayout === 'dashboard';
  const workspace = state.workspaces.find((w) => w.id === state.workspaceId);
  const reading =
    !state.private && s.showNewTabReading
      ? state.bookmarks.filter((b) => b.folder === 'Reading list').slice(0, expanded ? 6 : 3)
      : [];
  const recent: typeof state.history = [];
  const seen = new Set<string>();
  if (!state.private && s.showNewTabRecent)
    for (const entry of state.history) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      recent.push(entry);
      if (recent.length === (expanded ? 6 : 3)) break;
    }
  return (
    <div className={`newtab background-${s.background} newtab-${s.newTabLayout}`}>
      <div className="newtab-surface" inert={customize}>
        <header className="newtab-top">
          <span className="newtab-workspace">
            {state.private ? <Shield size={15} /> : <Layers size={15} />}
            {!state.private && workspace && <i style={{ background: workspace.color }} />}
            {state.private ? tr('Private window') : workspace?.name}
          </span>
          <button
            className="newtab-customize"
            ref={customTrigger}
            onClick={() => {
              setOptions(null);
              setCustomize(true);
            }}
          >
            <SlidersHorizontal size={15} />
            {tr('Customize')}
          </button>
        </header>
        <main className="newtab-center">
          <section className="newtab-hero" aria-labelledby="newtab-title">
            <h1 id="newtab-title" className="sr-only">
              {tr('New tab')}
            </h1>
            {s.showNewTabClock ? (
              <div className="newtab-clock">
                <strong>
                  {now.toLocaleTimeString(s.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </strong>
                <small>
                  {now.toLocaleDateString(s.language, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </small>
              </div>
            ) : (
              <div className="newtab-wordmark" aria-hidden="true">
                <i />
                dot
              </div>
            )}
            <form
              className="newtab-search"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) void command({ type: 'tab.navigate', input: query });
              }}
            >
              <Search size={19} aria-hidden="true" />
              <select
                aria-label={tr('Search engine')}
                value={s.engine}
                onChange={(e) => patchSettings({ engine: e.target.value })}
              >
                {s.engines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={tr('Search the web')}
                placeholder={tr('Search or enter an address')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="submit"
                title={tr('Search')}
                aria-label={tr('Search')}
                disabled={!query.trim()}
              >
                <ArrowRight size={19} />
              </button>
            </form>
          </section>
          <section className="newtab-shortcuts" aria-labelledby="shortcuts-title">
            <h2 id="shortcuts-title" className="sr-only">
              {tr('Shortcuts')}
            </h2>
            <div className="speed-dial">
              {state.shortcuts.map((shortcut, index) => {
                const hue = [...shortcut.url].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
                return (
                  <div
                    key={shortcut.id}
                    className={`speed-item${options === shortcut.id ? ' has-options' : ''}`}
                    style={{ '--shortcut-hue': hue } as CSSProperties}
                    draggable
                    onDragStart={(e) => {
                      setOptions(null);
                      e.dataTransfer.setData('dot/shortcut', shortcut.id);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('dot/shortcut');
                      if (id) void command({ type: 'shortcut.reorder', id, index });
                    }}
                  >
                    <button
                      className="speed-open"
                      title={shortcut.url}
                      onClick={() => void command({ type: 'tab.navigate', input: shortcut.url })}
                    >
                      <span className="speed-icon">
                        {shortcut.favicon ? (
                          <Favicon url={shortcut.favicon} size={24} />
                        ) : (
                          <span>{shortcut.title.slice(0, 1).toUpperCase()}</span>
                        )}
                      </span>
                      <span className="speed-caption">
                        <strong>{shortcut.title}</strong>
                        {expanded && <small>{domainOf(shortcut.url)}</small>}
                      </span>
                    </button>
                    <button
                      className="speed-options"
                      aria-label={tr('Options for {name}', { name: shortcut.title })}
                      aria-haspopup="menu"
                      aria-expanded={options === shortcut.id}
                      onClick={(e) => {
                        optionOpener.current = e.currentTarget;
                        setOptions(options === shortcut.id ? null : shortcut.id);
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {options === shortcut.id && (
                      <div
                        className="speed-menu"
                        ref={menu}
                        role="menu"
                        aria-label={tr('Shortcut options')}
                      >
                        <button
                          role="menuitem"
                          onClick={() => {
                            setOptions(null);
                            optionOpener.current?.focus();
                            open('shortcut', shortcut);
                          }}
                        >
                          {tr('Edit {name}', { name: shortcut.title })}
                        </button>
                        <button
                          role="menuitem"
                          disabled={index === 0}
                          onClick={() => {
                            closeOptions();
                            void command({
                              type: 'shortcut.reorder',
                              id: shortcut.id,
                              index: index - 1,
                            });
                          }}
                        >
                          {tr('Move earlier')}
                        </button>
                        <button
                          role="menuitem"
                          disabled={index === state.shortcuts.length - 1}
                          onClick={() => {
                            closeOptions();
                            void command({
                              type: 'shortcut.reorder',
                              id: shortcut.id,
                              index: index + 1,
                            });
                          }}
                        >
                          {tr('Move later')}
                        </button>
                        <button
                          role="menuitem"
                          className="speed-remove"
                          onClick={() => {
                            setOptions(null);
                            void command({ type: 'shortcut.remove', id: shortcut.id });
                          }}
                        >
                          {tr('Remove {name}', { name: shortcut.title })}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="speed-item">
                <button className="speed-open add-shortcut" onClick={() => open('shortcut')}>
                  <span className="speed-icon">
                    <Plus size={23} />
                  </span>
                  <span className="speed-caption">
                    <strong>{tr('Add shortcut')}</strong>
                  </span>
                </button>
              </div>
            </div>
          </section>
          {(!!recent.length || !!reading.length) && (
            <div className="newtab-collections">
              {!!recent.length && (
                <section className="recent-sites" aria-labelledby="recent-title">
                  <h2 id="recent-title">
                    <History size={15} />
                    {tr('Recently visited')}
                  </h2>
                  <div className="newtab-list">
                    {recent.map((entry) => (
                      <button
                        key={entry.id}
                        title={entry.url}
                        onClick={() => void command({ type: 'tab.navigate', input: entry.url })}
                      >
                        <Favicon url={entry.favicon} size={18} />
                        <span>
                          <strong>{entry.title || domainOf(entry.url)}</strong>
                          <small>{domainOf(entry.url)}</small>
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {!!reading.length && (
                <section className="newtab-reading" aria-labelledby="reading-title">
                  <h2 id="reading-title">
                    <BookOpen size={15} />
                    {tr('Reading list')}
                  </h2>
                  <div className="newtab-list newtab-reading-items">
                    {reading.map((entry) => (
                      <button
                        key={entry.id}
                        title={entry.url}
                        onClick={() => void command({ type: 'tab.navigate', input: entry.url })}
                      >
                        <Favicon url={entry.favicon} size={18} />
                        <span>
                          <strong>{entry.title}</strong>
                          <small>{domainOf(entry.url)}</small>
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
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
        </main>
      </div>
      {customize && (
        <div className="newtab-custom-layer">
          <div className="newtab-custom-backdrop" onClick={closeCustom} />
          <aside
            className="newtab-custom-panel"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-title"
          >
            <header>
              <h2 id="custom-title">{tr('Customize new tab')}</h2>
              <button aria-label={tr('Close')} onClick={closeCustom}>
                <X size={19} />
              </button>
            </header>
            <div className="newtab-custom-body">
              <fieldset>
                <legend>{tr('New tab layout')}</legend>
                <div className="newtab-layout-options">
                  {(['simple', 'dashboard'] as const).map((layout) => (
                    <button
                      key={layout}
                      aria-pressed={s.newTabLayout === layout}
                      onClick={() => patchSettings({ newTabLayout: layout })}
                    >
                      <span
                        className={`newtab-layout-preview preview-${layout}`}
                        aria-hidden="true"
                      >
                        <i />
                        <b />
                        <span>
                          <i />
                          <i />
                          <i />
                        </span>
                      </span>
                      <span>
                        {tr(layout === 'simple' ? 'Simple' : 'Expanded')}
                        {s.newTabLayout === layout && <Check size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>{tr('New tab background')}</legend>
                <div className="newtab-background-options">
                  {(['orbital', 'plain', 'grid'] as const).map((background) => (
                    <button
                      key={background}
                      aria-pressed={s.background === background}
                      onClick={() => patchSettings({ background })}
                    >
                      <span className={`newtab-swatch swatch-${background}`} aria-hidden="true">
                        {s.background === background && <Check size={17} />}
                      </span>
                      {tr(
                        background === 'orbital'
                          ? 'Soft color'
                          : background === 'plain'
                            ? 'Minimal'
                            : 'Grid',
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>{tr('Visible sections')}</legend>
                {(
                  [
                    ['showNewTabClock', 'Clock on new tabs'],
                    ['showNewTabRecent', 'Recently visited'],
                    ['showNewTabReading', 'Reading list'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="newtab-section-toggle" key={key}>
                    <span>{tr(label)}</span>
                    <input
                      type="checkbox"
                      checked={s[key]}
                      onChange={(e) => patchSettings({ [key]: e.target.checked })}
                    />
                  </label>
                ))}
              </fieldset>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
