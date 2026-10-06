import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import { Search, Plus, ArrowUpRight, Pencil, X, SlidersHorizontal, Command } from 'lucide-react';
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
  return (
    <div className={`newtab background-${state.settings.background}`}>
      <div className="newtab-top">
        <span>
          <span className="tiny-dot" />
          DOT BROWSER
        </span>
        <div>
          <strong>
            {now.toLocaleTimeString(state.settings.language, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </strong>
          <small>
            {now.toLocaleDateString(state.settings.language, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </small>
        </div>
      </div>
      <div className="newtab-center">
        <h1>{tr('New tab')}</h1>
        <form
          className="newtab-search"
          onSubmit={(e) => {
            e.preventDefault();
            void command({ type: 'tab.navigate', input: query });
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
          <button type="submit" title={tr('Search')} aria-label={tr('Search')}>
            <ArrowUpRight size={19} />
          </button>
        </form>
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
                onClick={() => void command({ type: 'tab.navigate', input: s.url })}
              >
                <span className="speed-icon">
                  {s.favicon ? (
                    <Favicon url={s.favicon} size={22} />
                  ) : (
                    <span>{s.title.slice(0, 1)}</span>
                  )}
                </span>
                <span>{s.title}</span>
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
        {!!state.history.length && (
          <div className="recent-sites">
            <span>{tr('Browsing history')}</span>
            {state.history.slice(0, 3).map((h) => (
              <button
                key={h.id}
                title={h.url}
                onClick={() => void command({ type: 'tab.navigate', input: h.url })}
              >
                <Favicon url={h.favicon} size={13} />
                {domainOf(h.url)}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        )}
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
