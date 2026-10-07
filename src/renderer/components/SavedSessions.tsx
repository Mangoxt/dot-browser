import { useState } from 'react';
import { FolderClock, Pencil, Trash2, ChevronDown, ArrowUpRight } from 'lucide-react';
import { tr } from '../i18n';
import { command, useBrowser } from '../stores/browser';
import type { Command } from '../../shared/ipc';
import { domainOf } from '../../shared/navigation';

export function SavedSessions() {
  const { state, open } = useBrowser();
  const [name, setName] = useState(
    state?.workspaces.find((w) => w.id === state.workspaceId)?.name ?? '',
  );
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamed, setRenamed] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const run = async (c: Command) => {
    setBusy(true);
    setError('');
    try {
      const result = await command(c);
      if (!result.ok) setError(result.error ?? 'Operation failed');
      return result;
    } catch {
      setError('Could not complete this action. Try again.');
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };
  if (!state) return null;
  if (state.private) return <p>{tr('Manage saved sessions in a normal window')}</p>;
  const workspace = state.workspaces.find((w) => w.id === state.workspaceId)!;
  const count = state.tabs.filter((t) => t.workspaceId === workspace.id).length;
  const sessions = state.savedSessions.filter((s) =>
    `${s.name} ${s.tabs.map((t) => t.title + ' ' + t.url).join(' ')}`
      .toLocaleLowerCase(state.settings.language)
      .includes(query.toLocaleLowerCase(state.settings.language)),
  );
  return (
    <div className="saved-sessions form-stack">
      <p className="muted">
        {tr(
          'Save tabs and groups for later. Opening a session creates a new workspace; it does not replace your current tabs.',
        )}
      </p>
      {error && (
        <p role="alert" className="danger-text">
          {tr(error)}
        </p>
      )}
      <form
        className="session-save"
        onSubmit={async (e) => {
          e.preventDefault();
          await run({ type: 'session.save', name: name.trim() });
        }}
      >
        <label>
          {tr('Session name')}
          <input
            autoFocus
            required
            maxLength={60}
            aria-label={tr('Session name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={busy || !name.trim() || state.savedSessions.length >= 40}
        >
          {tr('Save current workspace')}
        </button>
        <small>
          {tr('Save {count} tabs from {workspace}', { count, workspace: workspace.name })}
        </small>
      </form>
      <p className="modal-hint">
        {tr(
          'Saved sessions store addresses and tab groups. Page content, cookies and passwords are not included.',
        )}
      </p>
      <input
        type="search"
        aria-label={tr('Search saved sessions')}
        placeholder={tr('Search saved sessions')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!sessions.length && (
        <div className="session-empty">
          <FolderClock size={30} />
          <p>{tr(query ? 'No saved sessions match.' : 'No saved sessions yet.')}</p>
        </div>
      )}
      <div className="session-list">
        {sessions.map((s) => (
          <section className="session-card" key={s.id}>
            <div className="session-card-heading">
              <FolderClock size={19} />
              <div>
                <strong>{s.name}</strong>
                <small>
                  {tr('{count} tabs', { count: s.tabs.length })} ·{' '}
                  {new Date(s.createdAt).toLocaleDateString(state.settings.language)}
                </small>
              </div>
              <button
                disabled={busy || state.tabs.length + s.tabs.length > 200}
                title={
                  state.tabs.length + s.tabs.length > 200
                    ? tr('Close some tabs before opening more')
                    : undefined
                }
                onClick={async () => {
                  const r = await run({ type: 'session.action', id: s.id, action: 'restore' });
                  if (r.ok) open(null);
                }}
              >
                {tr('Open session')}
                <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="session-card-tools">
              <button
                aria-expanded={expanded === s.id}
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                <ChevronDown size={14} />
                {tr('View saved tabs')}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setRenaming(s.id);
                  setRenamed(s.name);
                }}
              >
                <Pencil size={13} />
                {tr('Rename')}
              </button>
              <button disabled={busy} onClick={() => setDeleting(s.id)}>
                <Trash2 size={13} />
                {tr('Delete')}
              </button>
            </div>
            {expanded === s.id && (
              <ul className="session-tab-preview">
                {s.tabs.map((t, i) => (
                  <li key={i}>
                    <strong>{t.title}</strong>
                    <small>{domainOf(t.url)}</small>
                  </li>
                ))}
              </ul>
            )}
            {renaming === s.id && (
              <form
                className="session-inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await run({
                    type: 'session.action',
                    action: 'rename',
                    id: s.id,
                    name: renamed.trim(),
                  });
                  if (r.ok) setRenaming(null);
                }}
              >
                <input
                  autoFocus
                  required
                  maxLength={60}
                  aria-label={tr('New session name')}
                  value={renamed}
                  onChange={(e) => setRenamed(e.target.value)}
                />
                <button className="primary" disabled={busy || !renamed.trim()}>
                  {tr('Save')}
                </button>
                <button type="button" disabled={busy} onClick={() => setRenaming(null)}>
                  {tr('Cancel')}
                </button>
              </form>
            )}
            {deleting === s.id && (
              <div className="session-delete-confirm">
                <p>{tr('Delete this saved copy? Open tabs will stay open.')}</p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={async () => {
                    const r = await run({ type: 'session.action', action: 'remove', id: s.id });
                    if (r.ok) setDeleting(null);
                  }}
                >
                  {tr('Delete saved session')}
                </button>
                <button disabled={busy} onClick={() => setDeleting(null)}>
                  {tr('Cancel')}
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
