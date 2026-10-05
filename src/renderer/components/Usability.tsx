import { useEffect, useState } from 'react';
import type { ReadingArticle } from '../../shared/reading';
import { command, useBrowser } from '../stores/browser';
import { Favicon } from './common';

export function TabSearch() {
  const { state, open } = useBrowser();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const tabs = (state?.tabs ?? []).filter((tab) =>
    `${tab.title} ${tab.url} ${state?.workspaces.find((space) => space.id === tab.workspaceId)?.name ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected = Math.min(index, Math.max(0, tabs.length - 1));
  const choose = async (id: string) => {
    const result = await command({ type: 'tab.action', action: 'select', id });
    if (result.ok) open(null);
  };
  return (
    <div className="form-stack">
      <input
        autoFocus
        aria-label="Search open tabs"
        placeholder="Search title, address or workspace"
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
                Math.min(tabs.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)),
              ),
            );
          }
          if (event.key === 'Enter' && tabs[selected]) {
            event.preventDefault();
            void choose(tabs[selected].id);
          }
        }}
        aria-controls="tab-search-results"
        aria-activedescendant={tabs[selected] ? `search-tab-${tabs[selected].id}` : undefined}
      />
      <div
        className="tab-search-results"
        id="tab-search-results"
        role="listbox"
        aria-label="Open tabs"
      >
        {tabs.map((tab, position) => (
          <button
            id={`search-tab-${tab.id}`}
            key={tab.id}
            role="option"
            aria-selected={position === selected}
            className={position === selected ? 'selected' : ''}
            onMouseEnter={() => setIndex(position)}
            onClick={() => void choose(tab.id)}
          >
            <Favicon url={tab.favicon} />
            <span>
              <strong>{tab.title}</strong>
              <small>
                {state?.workspaces.find((space) => space.id === tab.workspaceId)?.name} · {tab.url}
              </small>
            </span>
            <small>
              {tab.suspended ? 'Sleeping' : tab.id === state?.activeId ? 'Current' : ''}
            </small>
          </button>
        ))}
      </div>
      {!tabs.length && <p>No open tabs match.</p>}
      <p className="modal-hint">{tabs.length} tabs · ↑ ↓ to choose · Enter to switch</p>
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
        <p role="alert">{error}</p>
        <button onClick={() => open(null)}>Back to page</button>
      </div>
    );
  if (!article) return <p role="status">Preparing reading view…</p>;
  const words = article.blocks.reduce((count, block) => count + block.text.split(/\s+/).length, 0);
  return (
    <div className="reading-view">
      <div className="reading-controls">
        <button
          aria-label="Smaller reading text"
          disabled={size <= 16}
          onClick={() => setSize((value) => value - 2)}
        >
          A−
        </button>
        <button
          aria-label="Larger reading text"
          disabled={size >= 28}
          onClick={() => setSize((value) => value + 2)}
        >
          A+
        </button>
        <span>About {Math.max(1, Math.ceil(words / 200))} min read</span>
        <button onClick={() => open(null)}>Back to page</button>
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
