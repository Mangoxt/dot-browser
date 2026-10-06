import { tr } from '../i18n';
import { useBrowser } from '../stores/browser';
export function AboutContent() {
  const { state, open } = useBrowser();
  if (!state) return null;
  return (
    <div className="about-content">
      <span className="about-logo">
        d<span>•</span>
      </span>
      <h2>Dot Browser</h2>
      <p>{tr('A desktop browser powered by Chromium.')}</p>
      <button onClick={() => open('whatsnew')}>{tr('Neler yeni?')}</button>
      <div className="version-list">
        {[
          ['Dot', state.versions.app],
          ['Chromium', state.versions.chrome],
          ['Electron', state.versions.electron],
          ['Node.js', state.versions.node],
        ].map(([name, v]) => (
          <div key={name}>
            <span>{name}</span>
            <code>{v}</code>
          </div>
        ))}
      </div>
      <p>{tr('Built with Electron, Chromium, React, TypeScript, Zustand, Zod and Lucide.')}</p>
      <p className="muted">
        {tr(
          'Dot source: MIT. Electron: MIT. React: MIT. Zustand: MIT. Zod: MIT. Lucide: ISC. Chromium uses BSD and third-party licenses included with the application distribution.',
        )}
      </p>
    </div>
  );
}
