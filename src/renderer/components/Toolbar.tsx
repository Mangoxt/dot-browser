import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Home,
  Star,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Download,
  Puzzle,
  MoreHorizontal,
  PanelLeft,
  Search,
  History,
  CornerDownLeft,
  ExternalLink,
} from 'lucide-react';
import { bookmarkCurrent, command, openPage, patchSettings, useBrowser } from '../stores/browser';
import { Favicon, IconButton } from './common';
import { domainOf, isWebURL } from '../../shared/navigation';
export function Toolbar() {
  const { state, omnibox, set, open } = useBrowser();
  const tab = state?.tabs.find((t) => t.id === state.activeId);
  const [input, setInput] = useState('');
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!omnibox) setInput(tab?.url.startsWith('browser://') ? '' : (tab?.url ?? ''));
  }, [tab?.url, omnibox]);
  useEffect(() => {
    if (omnibox) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [omnibox]);
  if (!state || !tab) return null;
  const q = input.toLowerCase().trim();
  const suggestions = [
    ...state.tabs
      .filter((t) => t.id !== tab.id && q && `${t.title} ${t.url}`.toLowerCase().includes(q))
      .map((t) => ({ title: t.title, url: t.url, favicon: t.favicon, kind: 'tab', id: t.id })),
    ...state.bookmarks
      .filter((b) => q && `${b.title} ${b.url}`.toLowerCase().includes(q))
      .map((b) => ({ ...b, kind: 'bookmark' })),
    ...state.history
      .filter((h) => !q || `${h.title} ${h.url}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((h) => ({ ...h, kind: 'history' })),
    ...state.searches
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 3)
      .map((s) => ({ title: s, url: s, favicon: '', kind: 'search', id: s })),
  ].slice(0, 8);
  const submit = (url = input, tabId?: string) => {
    set({ omnibox: false });
    if (tabId) void command({ type: 'tab.action', action: 'select', id: tabId });
    else void command({ type: 'tab.navigate', input: url });
    ref.current?.blur();
  };
  const action = (action: 'back' | 'forward' | 'reload' | 'stop') =>
    void command({ type: 'tab.action', action });
  const bookmarked = state.bookmarks.some((b) => b.url === tab.url);
  const highlight = (text: string) => {
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    return i < 0 ? (
      text
    ) : (
      <>
        {text.slice(0, i)}
        <mark>{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    );
  };
  return (
    <div className="toolbar">
      <IconButton
        icon={PanelLeft}
        label="Toggle sidebar"
        active={state.settings.sidebar}
        onClick={() => patchSettings({ sidebar: !state.settings.sidebar })}
      />
      <div className="navigation-buttons">
        <IconButton
          icon={ArrowLeft}
          label="Back (Alt+Left)"
          disabled={!tab.canGoBack}
          onClick={() => action('back')}
        />
        <IconButton
          icon={ArrowRight}
          label="Forward (Alt+Right)"
          disabled={!tab.canGoForward}
          onClick={() => action('forward')}
        />
        <IconButton
          icon={tab.loading ? X : RotateCw}
          label={tab.loading ? 'Stop loading' : 'Reload (Ctrl+R)'}
          onClick={() => action(tab.loading ? 'stop' : 'reload')}
        />
        {state.settings.showHome && (
          <IconButton
            icon={Home}
            className="home-control"
            label="Home"
            onClick={() => void command({ type: 'tab.navigate', input: state.settings.home })}
          />
        )}
      </div>
      <div
        className={`omnibox ${omnibox ? 'focused' : ''}`}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) set({ omnibox: false });
        }}
      >
        <IconButton
          icon={
            isWebURL(tab.url)
              ? tab.connection === 'https'
                ? ShieldCheck
                : ShieldAlert
              : SlidersHorizontal
          }
          label="Site information"
          disabled={!isWebURL(tab.url)}
          onClick={() => open('site')}
        />
        <input
          ref={ref}
          aria-label="Address and search"
          placeholder={`Search ${state.settings.engines.find((e) => e.id === state.settings.engine)?.name ?? 'the web'} or enter a URL`}
          value={input}
          spellCheck={false}
          onChange={(e) => {
            setInput(e.target.value);
            setIndex(0);
          }}
          onFocus={() => set({ omnibox: true })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              set({ omnibox: false });
              ref.current?.blur();
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(suggestions.length, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const s = suggestions[index - 1];
              submit(s?.url, s?.kind === 'tab' ? s.id : undefined);
            }
          }}
        />
        {tab.zoom !== 1 && (
          <button
            className="zoom-pill"
            title="Reset zoom"
            onClick={() => void command({ type: 'zoom', value: 1 })}
          >
            {Math.round(tab.zoom * 100)}%
          </button>
        )}
        <IconButton
          icon={Star}
          label={bookmarked ? 'Edit bookmark (Ctrl+D)' : 'Bookmark page (Ctrl+D)'}
          active={bookmarked}
          disabled={!isWebURL(tab.url)}
          onClick={bookmarkCurrent}
        />
        {omnibox && (
          <div className="suggestions" role="listbox" aria-label="Address suggestions">
            <button
              role="option"
              aria-selected={index === 0}
              className={`suggestion ${index === 0 ? 'highlighted' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit()}
            >
              <Search size={17} />
              <span>
                <strong>{input || 'Where would you like to go?'}</strong>
                <small>
                  {input ? 'Search or navigate' : 'Type an address, a search, or an engine keyword'}
                </small>
              </span>
              <CornerDownLeft size={15} />
            </button>
            {suggestions.map((s, i) => (
              <button
                key={`${s.kind}-${s.id}`}
                role="option"
                aria-selected={index === i + 1}
                className={`suggestion ${index === i + 1 ? 'highlighted' : ''}`}
                onMouseEnter={() => setIndex(i + 1)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s.url, s.kind === 'tab' ? s.id : undefined)}
              >
                {s.kind === 'search' ? <History size={17} /> : <Favicon url={s.favicon} />}
                <span>
                  <strong>{highlight(s.title)}</strong>
                  <small>
                    {highlight(s.kind === 'search' ? 'Recent search' : domainOf(s.url))}
                  </small>
                </span>
                <small className="suggestion-kind">
                  {s.kind === 'tab' ? 'Switch to tab' : s.kind}
                </small>
                {s.kind === 'tab' && <ExternalLink size={13} />}
              </button>
            ))}
            <div className="suggestion-footer">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> to navigate
              </span>
              <span>
                <kbd>enter</kbd> to open
              </span>
              <span>
                <kbd>esc</kbd> to close
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="download-indicator">
        <IconButton icon={Download} label="Downloads (Ctrl+J)" onClick={() => open('downloads')} />
        {state.downloads.some((d) => d.status === 'progressing') && (
          <span className="activity-dot" />
        )}
      </div>
      <IconButton icon={Puzzle} label="Extensions" onClick={() => open('extensions')} />
      <IconButton
        icon={MoreHorizontal}
        label="Browser menu"
        active={useBrowser.getState().overlay === 'browsermenu'}
        onClick={() => open(useBrowser.getState().overlay === 'browsermenu' ? null : 'browsermenu')}
      />
      {state.split && (
        <div className="split-toolbar">
          <span>Split view</span>
          <button
            onClick={() => void command({ type: 'split', otherId: state.split!.right, swap: true })}
          >
            Swap
          </button>
          <select
            aria-label="Split layout"
            value={state.split.direction}
            onChange={(e) =>
              void command({
                type: 'split',
                otherId: state.split!.right,
                direction: e.target.value as 'vertical' | 'horizontal',
              })
            }
          >
            <option value="vertical">Side by side</option>
            <option value="horizontal">Stacked</option>
          </select>
          <select
            aria-label="Split ratio"
            value={state.split.ratio}
            onChange={(e) =>
              void command({
                type: 'split',
                otherId: state.split!.right,
                ratio: Number(e.target.value),
              })
            }
          >
            <option value={0.4}>40 / 60</option>
            <option value={0.5}>50 / 50</option>
            <option value={0.6}>60 / 40</option>
          </select>
          <IconButton
            icon={X}
            label="Exit split view"
            onClick={() => void command({ type: 'split', otherId: null })}
          />
        </div>
      )}
    </div>
  );
}
export function BookmarkBar() {
  const { state } = useBrowser();
  if (!state?.settings.bookmarkBar) return null;
  return (
    <div className="bookmark-bar">
      {state.bookmarks.slice(0, 16).map((b) => (
        <button
          key={b.id}
          title={b.url}
          onClick={() => void command({ type: 'tab.navigate', input: b.url })}
        >
          <Favicon url={b.favicon} />
          <span>{b.title}</span>
        </button>
      ))}
      <button onClick={() => openPage('bookmarks')}>
        <Star size={13} />
        All bookmarks
      </button>
    </div>
  );
}
