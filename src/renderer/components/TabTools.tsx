import { useState } from 'react';
import { Camera, Copy, Download, Check } from 'lucide-react';
import { tr } from '../i18n';
import { command, useBrowser } from '../stores/browser';
import { duplicateGroups } from '../../shared/tab-tools';
import { Favicon } from './common';

export function DuplicateTabs() {
  const { state } = useBrowser();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!state) return null;
  const groups = duplicateGroups(state.tabs, state.workspaceId, state.activeId, state.split);
  const candidates = groups.flatMap((group) => group.removable);
  const chosen = candidates.filter((tab) => selected[tab.id] === tab.url);
  const workspace = state.workspaces.find((workspace) => workspace.id === state.workspaceId)!;
  return (
    <div className="duplicate-tabs form-stack">
      <p className="muted">
        {tr('Identical addresses in {workspace}', { workspace: workspace.name })}
      </p>
      <p className="modal-hint">
        {tr(
          'Current, pinned, playing, loading and split-view tabs are kept. Closing a selected tab discards its unsaved page state.',
        )}
      </p>
      {!groups.length && (
        <div className="session-empty">
          <Check size={28} />
          <p>{tr('No duplicate web tabs in this workspace.')}</p>
        </div>
      )}
      {!!groups.length && (
        <button
          disabled={busy || !candidates.length}
          onClick={() =>
            setSelected(
              chosen.length === candidates.length
                ? {}
                : Object.fromEntries(candidates.map((tab) => [tab.id, tab.url])),
            )
          }
        >
          {tr(
            chosen.length === candidates.length && candidates.length
              ? 'Clear selection'
              : 'Select duplicates',
          )}
        </button>
      )}
      <div className="duplicate-list">
        {groups.map((group) => (
          <section className="duplicate-group" key={group.url}>
            <p title={group.url}>{group.url}</p>
            {group.tabs.map((tab) => {
              const removable = group.removable.some((candidate) => candidate.id === tab.id);
              return (
                <label className="duplicate-row" key={tab.id} data-tab-id={tab.id}>
                  <input
                    type="checkbox"
                    disabled={!removable || busy}
                    checked={!!removable && selected[tab.id] === tab.url}
                    aria-label={tr('Select duplicate {title}', { title: tab.title })}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [tab.id]: event.target.checked ? tab.url : '',
                      }))
                    }
                  />
                  <Favicon url={tab.favicon} />
                  <span title={tab.title}>{tab.title}</span>
                  {!removable && <small>{tr('Keep')}</small>}
                </label>
              );
            })}
          </section>
        ))}
      </div>
      {error && (
        <p role="alert" className="danger-text">
          {tr(error)}
        </p>
      )}
      {!!groups.length && (
        <button
          className="primary"
          disabled={busy || !chosen.length}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const result = await command({
                type: 'tab.cleanup',
                workspaceId: state.workspaceId,
                tabs: chosen.map(({ id, url }) => ({ id, url })),
              });
              if (result.ok) setSelected({});
              else setError(result.error ?? 'Operation failed');
            } catch {
              setError('Could not complete this action. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr('Close {count} selected tabs', { count: chosen.length })}
        </button>
      )}
    </div>
  );
}

export function PageCapture() {
  const { state, open } = useBrowser();
  const [mode, setMode] = useState<'visible' | 'full'>('visible');
  const [busy, setBusy] = useState(false);
  const tab = state?.tabs.find((tab) => tab.id === state.activeId);
  const capture = async (destination: 'file' | 'clipboard') => {
    if (!tab) return;
    const selected = { id: tab.id, url: tab.url };
    setBusy(true);
    await new Promise<void>((resolve) => {
      const unsubscribe = useBrowser.subscribe((state) => {
        if (!state.overlay) {
          unsubscribe();
          resolve();
        }
      });
      open(null);
    });
    await command({ type: 'page.capture', mode, destination, ...selected });
  };
  return (
    <div className="page-capture form-stack">
      <div className="capture-heading">
        <Camera size={24} />
        <span title={tab?.url}>{tab?.title}</span>
      </div>
      <label>
        {tr('Capture area')}
        <select
          aria-label={tr('Capture area')}
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as 'visible' | 'full')}
        >
          <option value="visible">{tr('Visible area')}</option>
          <option value="full">{tr('Full page')}</option>
        </select>
      </label>
      <p className="modal-hint">
        {tr('Full page captures content already loaded. Images stay on this device.')}
      </p>
      <div className="capture-actions">
        <button disabled={busy} onClick={() => void capture('clipboard')}>
          <Copy size={16} />
          {tr('Copy image')}
        </button>
        <button className="primary" disabled={busy} onClick={() => void capture('file')}>
          <Download size={16} />
          {tr('Save PNG')}
        </button>
      </div>
      {busy && <p role="status">{tr('Preparing screenshot…')}</p>}
    </div>
  );
}
