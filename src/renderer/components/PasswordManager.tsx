import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import type { LoginSummary } from '../../shared/import';
import { command, useBrowser } from '../stores/browser';

export function PasswordManager() {
  const { state, open } = useBrowser();
  const [logins, setLogins] = useState<LoginSummary[]>([]);
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void command({ type: 'login.list' }).then((result) => {
      if (result.ok) setLogins(result.logins ?? []);
      else setError(result.error ?? 'Could not read saved passwords');
    });
  }, []);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 30000);
    return () => clearTimeout(timer);
  }, [revealed]);
  const tab = state?.tabs.find((item) => item.id === state.activeId);
  let origin = '';
  try {
    origin = new URL(tab?.url ?? '').origin;
  } catch {
    /* Internal page */
  }
  return (
    <div className="form-stack">
      <p>
        {tr(
          'Passwords are encrypted with your system account. Choose Fill on this site to fill a login form; you submit it yourself.',
        )}
      </p>
      <input
        aria-label={tr('Search saved passwords')}
        placeholder={tr('Search sites or usernames')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setRevealed(null);
        }}
      />
      <div className="password-list">
        {logins
          .filter((login) =>
            `${login.origin} ${login.username}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((login) => (
            <div className="password-entry" key={login.id}>
              <strong>{login.origin}</strong>
              <span>{login.username || tr('(No username)')}</span>
              <textarea
                aria-label={tr('Password for {name} at {origin}', {
                  name: login.username,
                  origin: login.origin,
                })}
                readOnly
                value={revealed?.id === login.id ? revealed.value : '••••••••'}
              />
              <div className="password-actions">
                {(['reveal', 'copy', 'fill', 'delete'] as const).map((action) => (
                  <button
                    key={action}
                    disabled={busy || (action === 'fill' && origin !== login.origin)}
                    onClick={async () => {
                      if (action === 'reveal' && revealed?.id === login.id) {
                        setRevealed(null);
                        return;
                      }
                      setBusy(true);
                      setError('');
                      const result = await command({ type: 'login.action', id: login.id, action });
                      if (!result.ok) setError(result.error ?? 'Password action failed');
                      else if (action === 'reveal' && result.password !== undefined)
                        setRevealed({ id: login.id, value: result.password });
                      else if (action === 'delete') {
                        setRevealed(null);
                        setLogins((items) => items.filter((item) => item.id !== login.id));
                      } else if (action === 'fill') open(null);
                      setBusy(false);
                    }}
                  >
                    {action === 'reveal'
                      ? revealed?.id === login.id
                        ? tr('Hide')
                        : tr('Show')
                      : action === 'fill'
                        ? tr('Fill on this site')
                        : action === 'copy'
                          ? tr('Copy')
                          : tr('Delete')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        {!logins.length && (
          <p>{tr('No saved passwords yet. Import the CSV exported by your previous browser.')}</p>
        )}
      </div>
      {error && <p role="alert">{tr(error)}</p>}
      <button onClick={() => open('import')}>{tr('Import browser data')}</button>
    </div>
  );
}
