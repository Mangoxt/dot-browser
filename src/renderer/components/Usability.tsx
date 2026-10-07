import { tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { ReadingArticle } from '../../shared/reading';
import { command, useBrowser } from '../stores/browser';
import { Favicon } from './common';

export function TabSearch() {
  const { state, open } = useBrowser();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'open' | 'closed'>('open');
  const [filter, setFilter] = useState('all');
  const results = useRef<HTMLDivElement>(null);
  const tabs = (state?.tabs ?? [])
    .filter((tab) =>
      filter === 'workspace'
        ? tab.workspaceId === state?.workspaceId
        : filter === 'audio'
          ? tab.audio
          : filter === 'sleeping'
            ? tab.suspended
            : true,
    )
    .filter((tab) =>
      `${tab.title} ${tab.url} ${state?.workspaces.find((space) => space.id === tab.workspaceId)?.name ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const closed = (state?.closedTabs ?? [])
    .map((item) => item.tab)
    .filter((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query.toLowerCase()));
  const items = mode === 'open' ? tabs : closed;
  const selected = Math.min(index, Math.max(0, items.length - 1));
  useEffect(() => {
    results.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, query, filter, mode]);
  const choose = async (id: string) => {
    const result = await command({
      type: 'tab.action',
      action: mode === 'open' ? 'select' : 'restore',
      id,
    });
    if (result.ok) open(null);
  };
  return (
    <div className="form-stack">
      <div className="tab-search-modes">
        <button
          aria-pressed={mode === 'open'}
          onClick={() => {
            setMode('open');
            setIndex(0);
          }}
        >
          {tr('Open tabs')}
        </button>
        <button
          aria-pressed={mode === 'closed'}
          onClick={() => {
            setMode('closed');
            setIndex(0);
          }}
        >
          {tr('Recently closed')}
        </button>
      </div>
      <input
        autoFocus
        role="combobox"
        aria-expanded={true}
        aria-autocomplete="list"
        aria-label={tr(mode === 'open' ? 'Search open tabs' : 'Search closed tabs')}
        placeholder={tr('Search title, address or workspace')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIndex(
              Math.max(
                0,
                Math.min(items.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)),
              ),
            );
          }
          if (event.key === 'Enter' && items[selected]) {
            event.preventDefault();
            void choose(items[selected].id);
          }
        }}
        aria-controls="tab-search-results"
        aria-activedescendant={items[selected] ? `search-tab-${items[selected].id}` : undefined}
      />
      {mode === 'open' && (
        <select
          aria-label={tr('Filter tabs')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setIndex(0);
          }}
        >
          <option value="all">{tr('All tabs')}</option>
          <option value="workspace">{tr('This workspace')}</option>
          <option value="audio">{tr('Playing audio')}</option>
          <option value="sleeping">{tr('Sleeping')}</option>
        </select>
      )}
      <div
        ref={results}
        className="tab-search-results"
        id="tab-search-results"
        role="listbox"
        aria-label={tr(mode === 'open' ? 'Open tabs' : 'Recently closed')}
      >
        {items.map((tab, position) => (
          <button
            id={`search-tab-${tab.id}`}
            key={tab.id}
            role="option"
            aria-selected={position === selected}
            className={position === selected ? 'selected' : ''}
            onMouseEnter={() => setIndex(position)}
            onClick={() => void choose(tab.id)}
          >
            <Favicon url={'favicon' in tab && typeof tab.favicon === 'string' ? tab.favicon : ''} />
            <span>
              <strong>{tab.title}</strong>
              <small>
                {state?.workspaces.find((space) => space.id === tab.workspaceId)?.name} · {tab.url}
              </small>
            </span>
            <small>
              {mode === 'closed'
                ? tr('Restore')
                : 'suspended' in tab && tab.suspended
                  ? tr('Sleeping')
                  : tab.id === state?.activeId
                    ? tr('Current')
                    : ''}
            </small>
          </button>
        ))}
      </div>
      {!items.length && (
        <p>{tr(mode === 'open' ? 'No open tabs match.' : 'No closed tabs match.')}</p>
      )}
      <p className="modal-hint">
        {tr(
          mode === 'open'
            ? '{count} tabs · ↑ ↓ to choose · Enter to switch'
            : '{count} tabs · ↑ ↓ to choose · Enter to restore',
          { count: items.length },
        )}
      </p>
    </div>
  );
}

export function ReadingView() {
  const { open } = useBrowser();
  const [article, setArticle] = useState<ReadingArticle | null>(null);
  const [error, setError] = useState('');
  const [size, setSize] = useState(20);
  useEffect(() => {
    let active = true;
    void command({ type: 'reader.extract' }).then((result) => {
      if (!active) return;
      if (result.ok && result.article) setArticle(result.article);
      else setError(result.error ?? 'Could not read this page');
    });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <div className="form-stack">
        <p role="alert">{tr(error)}</p>
        <button onClick={() => open(null)}>{tr('Back to page')}</button>
      </div>
    );
  if (!article) return <p role="status">{tr('Preparing reading view…')}</p>;
  const words = article.blocks.reduce((count, block) => count + block.text.split(/\s+/).length, 0);
  return (
    <div className="reading-view">
      <div className="reading-controls">
        <button
          aria-label={tr('Smaller reading text')}
          disabled={size <= 16}
          onClick={() => setSize((value) => value - 2)}
        >
          {tr('A−')}
        </button>
        <button
          aria-label={tr('Larger reading text')}
          disabled={size >= 28}
          onClick={() => setSize((value) => value + 2)}
        >
          {tr('A+')}
        </button>
        <span>{tr('{count} min read', { count: Math.max(1, Math.ceil(words / 200)) })}</span>
        <button onClick={() => open(null)}>{tr('Back to page')}</button>
      </div>
      <article style={{ fontSize: size }}>
        <h1>{article.title}</h1>
        <p className="reading-source">{article.url}</p>
        {article.blocks.map((block, index) =>
          block.kind === 'heading' ? (
            <h2 key={index}>{block.text}</h2>
          ) : block.kind === 'quote' ? (
            <blockquote key={index}>{block.text}</blockquote>
          ) : (
            <p key={index}>{block.text}</p>
          ),
        )}
      </article>
    </div>
  );
}
