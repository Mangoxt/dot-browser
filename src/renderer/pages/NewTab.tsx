import { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  ArrowUpRight,
  Pencil,
  X,
  SlidersHorizontal,
  History,
  Star,
  Download,
  Command,
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
  return (
    <div className={`newtab background-${state.settings.background}`}>
      <div className="newtab-top">
        <span>
          <span className="tiny-dot" />
          YOUR OWN CORNER OF THE INTERNET
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
      <div className="orbit-art" aria-hidden="true">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="orbit orbit-three" />
        <div className="orbit-center" />
        <span className="orbit-point" />
      </div>
      <div className="newtab-center">
        <span className="eyebrow">LESS NOISE. MORE POSSIBILITY.</span>
        <h1>
          Make room for
          <br />
          <span>what’s next.</span>
        </h1>
        <p>A fresh perspective starts with a new tab.</p>
        <form
          className="newtab-search"
          onSubmit={(e) => {
            e.preventDefault();
            void command({ type: 'tab.navigate', input: query });
          }}
        >
          <Search size={19} />
          <input
            aria-label="Search the web"
            placeholder={`Search ${state.settings.engines.find((e) => e.id === state.settings.engine)?.name ?? 'the web'}, or explore a new address`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" title="Search" aria-label="Search">
            <ArrowUpRight size={19} />
          </button>
        </form>
        <div className="speed-dial">
          {state.shortcuts.map((s, i) => (
            <div
              key={s.id}
              className="speed-item"
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
                  label={`Edit ${s.title}`}
                  onClick={() => open('shortcut', s)}
                />
                <IconButton
                  icon={X}
                  label={`Remove ${s.title}`}
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
              <span>Add shortcut</span>
            </button>
          </div>
        </div>
        {!!state.history.length && (
          <div className="recent-sites">
            <span>Pick up where you left off</span>
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
          <button onClick={() => openPage('history')}>
            <History size={14} />
            History
          </button>
          <button onClick={() => openPage('bookmarks')}>
            <Star size={14} />
            Bookmarks
          </button>
          <button onClick={() => openPage('downloads')}>
            <Download size={14} />
            Downloads
          </button>
        </div>
        <div>
          <button onClick={() => open('palette')}>
            <Command size={14} />
            <kbd>Ctrl K</kbd>
          </button>
          <button onClick={() => openPage('settings#appearance')}>
            <SlidersHorizontal size={14} />
            Customize
          </button>
        </div>
      </div>
    </div>
  );
}
