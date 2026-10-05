import { Search, Star, History, Download, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { command, useBrowser } from '../stores/browser';
import { Favicon, IconButton } from './common';
import { DownloadList } from '../pages/Library';
export function SidePanel() {
  const { state, panel, panelWidth, set } = useBrowser();
  const [q, setQ] = useState('');
  if (!state || !panel) return null;
  const items =
    panel === 'history' ? state.history : panel === 'tabs' ? state.tabs : state.bookmarks;
  return (
    <aside className="side-panel" style={{ width: panelWidth }}>
      <div className="panel-heading">
        <select
          aria-label="Side panel section"
          value={panel}
          onChange={(e) => set({ panel: e.target.value as typeof panel })}
        >
          <option value="bookmarks">Bookmarks</option>
          <option value="history">History</option>
          <option value="downloads">Downloads</option>
          <option value="tabs">Tabs</option>
        </select>
        <IconButton icon={X} label="Close side panel" onClick={() => set({ panel: null })} />
      </div>
      <div className="panel-tabs">
        {(
          [
            ['bookmarks', Star],
            ['history', History],
            ['downloads', Download],
            ['tabs', Layers],
          ] as const
        ).map(([p, Icon]) => (
          <IconButton
            key={p}
            icon={Icon}
            label={p}
            active={panel === p}
            onClick={() => set({ panel: p })}
          />
        ))}
      </div>
      {panel === 'downloads' ? (
        <DownloadList compact />
      ) : (
        <>
          <label className="filter-input">
            <Search size={14} />
            <input
              aria-label="Search side panel"
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="panel-items">
            {items
              .filter((i) => `${i.title} ${i.url}`.toLowerCase().includes(q.toLowerCase()))
              .map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    if (panel === 'tabs')
                      void command({ type: 'tab.action', action: 'select', id: i.id });
                    else void command({ type: 'tab.new', url: i.url });
                  }}
                >
                  <Favicon url={i.favicon} />
                  <span>
                    {i.title}
                    <small>{i.url}</small>
                  </span>
                </button>
              ))}
            {!items.length && <p className="muted">Nothing here yet.</p>}
          </div>
        </>
      )}
      <div
        className="panel-resizer"
        role="separator"
        tabIndex={0}
        aria-label="Resize side panel"
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight'].includes(e.key))
            set({
              panelWidth: Math.min(
                480,
                Math.max(240, panelWidth + (e.key === 'ArrowLeft' ? 10 : -10)),
              ),
            });
        }}
        onPointerDown={(e) => {
          const target = e.currentTarget;
          target.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) =>
            set({ panelWidth: Math.min(480, Math.max(240, window.innerWidth - ev.clientX)) });
          const stop = () => {
            target.removeEventListener('pointermove', move);
          };
          target.addEventListener('pointermove', move);
          target.addEventListener('pointerup', stop, { once: true });
        }}
      />
    </aside>
  );
}
