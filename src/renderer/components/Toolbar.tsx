import { tr } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Home,
  Star,
  ShieldCheck,
  ShieldAlert,
  Globe,
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
  const q = input.toLowerCase().trim();
  const suggestions = useMemo(() => {
    const result: { title: string; url: string; favicon: string; kind: string; id: string }[] = [];
    if (!state || !tab || !omnibox) return result;
    const seen = new Set<string>();
    const matches = (item: { title: string; url: string }) =>
      `${item.title} ${item.url}`.toLowerCase().includes(q);
    if (q) {
      for (const t of state.tabs) {
        if (t.id !== tab.id && matches(t)) {
          result.push({ title: t.title, url: t.url, favicon: t.favicon, kind: 'tab', id: t.id });
          seen.add(t.url);
          if (result.length === 8) return result;
        }
      }
      for (const b of state.bookmarks) {
        if (!seen.has(b.url) && matches(b)) {
          result.push({ ...b, kind: 'bookmark' });
          seen.add(b.url);
          if (result.length === 8) return result;
        }
      }
    }
    let historyCount = 0;
    for (const h of state.history) {
      if (!seen.has(h.url) && (!q || matches(h))) {
        result.push({ ...h, kind: 'history' });
        seen.add(h.url);
        if (result.length === 8 || ++historyCount === 5) break;
      }
    }
    if (result.length < 8) {
      let searchCount = 0;
      for (const s of state.searches) {
        if (!seen.has(s) && (!q || s.toLowerCase().includes(q))) {
          result.push({ title: s, url: s, favicon: '', kind: 'search', id: s });
          seen.add(s);
          if (result.length === 8 || ++searchCount === 3) break;
        }
      }
    }
    return result;
  }, [state?.tabs, state?.bookmarks, state?.history, state?.searches, tab?.id, q, omnibox]);
  useEffect(() => {
    if (omnibox)
      document
        .getElementById(`address-option-${Math.min(index, suggestions.length)}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [index, omnibox, suggestions.length]);
  if (!state || !tab) return null;
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
        label={tr('Toggle sidebar')}
        active={state.settings.sidebar}
        onClick={() => patchSettings({ sidebar: !state.settings.sidebar })}
      />
      <div className="navigation-buttons">
        <IconButton
          icon={ArrowLeft}
          label={tr('Back (Alt+Left)')}
          disabled={!tab.canGoBack}
          onClick={() => action('back')}
        />
        <IconButton
          icon={ArrowRight}
          label={tr('Forward (Alt+Right)')}
          disabled={!tab.canGoForward}
          onClick={() => action('forward')}
        />
        <IconButton
          icon={tab.loading ? X : RotateCw}
          label={tab.loading ? tr('Stop loading') : tr('Reload (Ctrl+R)')}
          onClick={() => action(tab.loading ? 'stop' : 'reload')}
        />
        {state.settings.showHome && (
          <IconButton
            icon={Home}
            className="home-control"
            label={tr('Home')}
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
            isWebURL(tab.url) ? (tab.connection === 'https' ? ShieldCheck : ShieldAlert) : Globe
          }
          label={tr('Site information')}
          disabled={!isWebURL(tab.url)}
          onClick={() => open('site')}
        />
        <input
          ref={ref}
          aria-label={tr('Address and search')}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={omnibox}
          aria-controls={omnibox ? 'address-suggestions' : undefined}
          aria-activedescendant={
            omnibox ? `address-option-${Math.min(index, suggestions.length)}` : undefined
          }
          placeholder={tr('Search {engine} or enter an address', {
            engine:
              state.settings.engines.find((e) => e.id === state.settings.engine)?.name ??
              tr('the web'),
          })}
          value={input}
          spellCheck={false}
          onChange={(e) => {
            setInput(e.target.value);
            setIndex(0);
          }}
          onFocus={() => {
            setIndex(0);
            set({ omnibox: true });
          }}
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
            title={tr('Reset zoom')}
            onClick={() => void command({ type: 'zoom', value: 1 })}
          >
            {Math.round(tab.zoom * 100)}%
          </button>
        )}
        <IconButton
          icon={Star}
          label={bookmarked ? tr('Edit bookmark (Ctrl+D)') : tr('Bookmark page (Ctrl+D)')}
          active={bookmarked}
          disabled={!isWebURL(tab.url)}
          onClick={bookmarkCurrent}
        />
        {omnibox && (
          <div
            id="address-suggestions"
            className="suggestions"
            role="listbox"
            aria-label={tr('Address suggestions')}
          >
            <button
              role="option"
              id="address-option-0"
              aria-selected={index === 0}
              className={`suggestion ${index === 0 ? 'highlighted' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit()}
            >
              <Search size={17} />
              <span>
                <strong>{input || tr('Search or enter an address')}</strong>
                <small>
                  {input
                    ? tr('Search or navigate')
                    : tr('Type an address, a search, or an engine keyword')}
                </small>
              </span>
              <CornerDownLeft size={15} />
            </button>
            {suggestions.map((s, i) => (
              <button
                key={`${s.kind}-${s.id}`}
                role="option"
                id={`address-option-${i + 1}`}
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
                    {highlight(s.kind === 'search' ? tr('Recent search') : domainOf(s.url))}
                  </small>
                </span>
                <small className="suggestion-kind">
                  {s.kind === 'tab' ? tr('Switch to tab') : tr(s.kind)}
                </small>
                {s.kind === 'tab' && <ExternalLink size={13} />}
              </button>
            ))}
            <div className="suggestion-footer">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                {tr('to navigate')}
              </span>
              <span>
                <kbd>{tr('enter')}</kbd>
                {tr('to open')}
              </span>
              <span>
                <kbd>{tr('esc')}</kbd>
                {tr('to close')}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="download-indicator">
        <IconButton
          icon={Download}
          label={tr('Downloads (Ctrl+J)')}
          onClick={() => open('downloads')}
        />
        {state.downloads.some((d) => d.status === 'progressing') && (
          <span className="activity-dot" />
        )}
      </div>
      <IconButton icon={Puzzle} label={tr('Extensions')} onClick={() => open('extensions')} />
      <IconButton
        icon={MoreHorizontal}
        label={tr('Browser menu')}
        active={useBrowser.getState().overlay === 'browsermenu'}
        onClick={() => open(useBrowser.getState().overlay === 'browsermenu' ? null : 'browsermenu')}
      />
      {state.split && (
        <div className="split-toolbar">
          <span>{tr('Split view')}</span>
          <button
            onClick={() => void command({ type: 'split', otherId: state.split!.right, swap: true })}
          >
            {tr('Swap')}
          </button>
          <select
            aria-label={tr('Split layout')}
            value={state.split.direction}
            onChange={(e) =>
              void command({
                type: 'split',
                otherId: state.split!.right,
                direction: e.target.value as 'vertical' | 'horizontal',
              })
            }
          >
            <option value="vertical">{tr('Side by side')}</option>
            <option value="horizontal">{tr('Stacked')}</option>
          </select>
          <select
            aria-label={tr('Split ratio')}
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
            label={tr('Exit split view')}
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
      <div className="bookmark-links">
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
      </div>
      <button className="all-bookmarks" onClick={() => openPage('bookmarks')}>
        <Star size={13} />
        {tr('All bookmarks')}
      </button>
    </div>
  );
}
