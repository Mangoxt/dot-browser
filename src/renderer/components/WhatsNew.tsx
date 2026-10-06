import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import type { CommandResult } from '../../shared/ipc';
import { command, useBrowser } from '../stores/browser';

export function WhatsNew() {
  const { open } = useBrowser();
  const [release, setRelease] = useState<CommandResult['release']>();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void command({ type: 'release.info' }).then(async (result) => {
      if (!alive) return;
      if (!result.ok || !result.release) {
        setError(result.error || 'Değişiklikler yüklenemedi.');
        return;
      }
      setRelease(result.release);
      await command({ type: 'release.seen' });
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="release-notes">
      <p className="muted">
        {release
          ? tr('Dot Browser {version}: changes and fixes.', { version: release.version })
          : tr(error || 'Değişiklikler yükleniyor…')}
      </p>
      {release?.releases.map((item, index) => (
        <details key={item.version} open={index === 0}>
          <summary>
            {tr('Version {version}', { version: item.version })} <small>{item.date}</small>
          </summary>
          <ul>
            {item.changes.map((change) => (
              <li key={change}>{tr(change)}</li>
            ))}
          </ul>
        </details>
      ))}
      <div className="form-actions">
        <button className="primary" autoFocus onClick={() => open(null)}>
          {tr('Anladım')}
        </button>
      </div>
    </div>
  );
}
