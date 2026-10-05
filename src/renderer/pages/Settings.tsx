import { useState } from 'react';
import {
  Settings2,
  Palette,
  Search,
  Layers,
  Shield,
  Download,
  Power,
  Languages,
  Accessibility,
  Keyboard,
  Wrench,
  Info,
  Plus,
  Trash2,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import { command, openPage, patchSettings, useBrowser } from '../stores/browser';
import { IconButton, Toggle } from '../components/common';
import type { BrowserSettings, SearchEngine } from '../../shared/models';
import { AboutContent } from './About';
const sections: [string, string, LucideIcon][] = [
  ['general', 'General', Settings2],
  ['appearance', 'Appearance', Palette],
  ['search', 'Search engines', Search],
  ['tabs', 'Tabs & spaces', Layers],
  ['privacy', 'Privacy & security', Shield],
  ['downloads', 'Downloads', Download],
  ['startup', 'On startup', Power],
  ['languages', 'Languages', Languages],
  ['accessibility', 'Accessibility', Accessibility],
  ['shortcuts', 'Keyboard shortcuts', Keyboard],
  ['advanced', 'Advanced', Wrench],
  ['about', 'About Dot', Info],
];
function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
function TextSetting({
  value,
  onSave,
  label,
  multiline = false,
  placeholder = '',
}: {
  value: string;
  onSave: (s: string) => void;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return multiline ? (
    <textarea
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
    />
  ) : (
    <input
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
export default function Settings() {
  const { state, open } = useBrowser();
  const tab = state?.tabs.find((t) => t.id === state.activeId);
  const [section, setSection] = useState(tab?.url.split('#')[1] || 'general');
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  if (!state) return null;
  const s = state.settings;
  const select = <K extends keyof BrowserSettings>(key: K, options: [string, string][]) => (
    <select
      aria-label={key}
      value={String(s[key])}
      onChange={(e) => patchSettings({ [key]: e.target.value })}
    >
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
  const toggle = (
    key:
      | 'showHome'
      | 'compact'
      | 'animations'
      | 'sidebar'
      | 'bookmarkBar'
      | 'verticalTabs'
      | 'askDownload',
    label: string,
  ) => <Toggle label={label} checked={s[key]} onChange={(v) => patchSettings({ [key]: v })} />;
  return (
    <div className="settings-page">
      <nav className="settings-nav">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h2>Settings</h2>
        {sections.map(([id, label, Icon]) => (
          <button
            className={section === id ? 'selected' : ''}
            key={id}
            onClick={() => setSection(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        <h1>{sections.find((x) => x[0] === section)?.[1] ?? 'General'}</h1>
        {section === 'general' && (
          <>
            <p className="section-description">A browser that feels like your own.</p>
            <Row title="Home button" detail="A familiar place, one click away.">
              {toggle('showHome', 'Show home button')}
            </Row>
            <Row title="Home page">
              <TextSetting
                label="Home page"
                value={s.home}
                onSave={(home) => patchSettings({ home })}
              />
            </Row>
            <Row title="Bookmarks bar">{toggle('bookmarkBar', 'Show bookmarks bar')}</Row>
            <Row
              title="Local profile"
              detail="Personal · isolated Chromium session and local browser data."
            >
              <button onClick={() => open('profile')}>Manage session</button>
            </Row>
          </>
        )}
        {section === 'appearance' && (
          <>
            <p className="section-description">Quiet details. Your kind of space.</p>
            <Row title="Theme">
              {select('theme', [
                ['dark', 'Dark'],
                ['light', 'Light'],
                ['system', 'Follow system'],
              ])}
            </Row>
            <Row title="Accent color">
              <div className="accent-picker">
                {(['violet', 'blue', 'green', 'rose', 'amber'] as const).map((color) => (
                  <button
                    key={color}
                    className={`swatch ${color} ${s.accent === color ? 'selected' : ''}`}
                    title={color}
                    aria-label={`${color} accent`}
                    aria-pressed={s.accent === color}
                    onClick={() => patchSettings({ accent: color })}
                  />
                ))}
              </div>
            </Row>
            <Row title="Compact toolbar">{toggle('compact', 'Compact toolbar')}</Row>
            <Row title="Sidebar">{toggle('sidebar', 'Show sidebar')}</Row>
            <Row title="Animations">{toggle('animations', 'Enable animations')}</Row>
            <Row title="New tab background">
              {select('background', [
                ['orbital', 'Orbital'],
                ['plain', 'Minimal'],
                ['grid', 'Grid'],
              ])}
            </Row>
            <Row title="Glass intensity">
              <input
                type="range"
                aria-label="Glass intensity"
                min={0}
                max={1}
                step={0.1}
                value={s.glass}
                onChange={(e) => patchSettings({ glass: Number(e.target.value) })}
              />
            </Row>
            <Row title="Corner radius">
              <input
                type="range"
                aria-label="Corner radius"
                min={4}
                max={14}
                step={1}
                value={s.radius}
                onChange={(e) => patchSettings({ radius: Number(e.target.value) })}
              />
            </Row>
          </>
        )}
        {section === 'search' && (
          <>
            <p className="section-description">
              Search your way. Type a keyword before your query to switch engines.
            </p>
            <Row title="Default search engine">
              <select
                aria-label="Default search engine"
                value={s.engine}
                onChange={(e) => patchSettings({ engine: e.target.value })}
              >
                {s.engines.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Row>
            <div className="engine-list">
              {s.engines.map((e) => (
                <div className="setting-row" key={e.id}>
                  <div>
                    <strong>{e.name}</strong>
                    <p>{e.template}</p>
                  </div>
                  <kbd>{e.keyword}</kbd>
                  <IconButton
                    icon={Pencil}
                    label={`Edit ${e.name}`}
                    onClick={() => setEngine({ ...e })}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${e.name}`}
                    disabled={s.engines.length === 1}
                    onClick={() => void command({ type: 'engine.remove', id: e.id })}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setEngine({
                  id: crypto.randomUUID(),
                  name: '',
                  keyword: '',
                  template: 'https://example.com/search?q=%s',
                })
              }
            >
              <Plus size={15} />
              Add search engine
            </button>
            {engine && (
              <form
                className="engine-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const result = await command({ type: 'engine.save', engine });
                  if (result.ok) setEngine(null);
                }}
              >
                <label>
                  Name
                  <input
                    required
                    aria-label="Engine name"
                    value={engine.name}
                    onChange={(e) => setEngine({ ...engine, name: e.target.value })}
                  />
                </label>
                <label>
                  Keyword
                  <input
                    aria-label="Engine keyword"
                    value={engine.keyword}
                    onChange={(e) => setEngine({ ...engine, keyword: e.target.value })}
                  />
                </label>
                <label>
                  HTTPS search URL · use %s for the query
                  <input
                    required
                    aria-label="Engine URL template"
                    value={engine.template}
                    onChange={(e) => setEngine({ ...engine, template: e.target.value })}
                  />
                </label>
                <div className="form-actions">
                  <button type="button" onClick={() => setEngine(null)}>
                    Cancel
                  </button>
                  <button className="primary" type="submit">
                    Save engine
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        {section === 'tabs' && (
          <>
            <Row title="Vertical tabs" detail="Give your tabs a little more breathing room.">
              {toggle('verticalTabs', 'Vertical tabs')}
            </Row>
            <Row
              title="Memory saver"
              detail="Suspend inactive, silent tabs after 20 minutes (Balanced) or 5 minutes (Aggressive). Pages reload when reselected."
            >
              {select('memorySaver', [
                ['off', 'Off'],
                ['balanced', 'Balanced'],
                ['aggressive', 'Aggressive'],
              ])}
            </Row>
            <Row title="Workspaces" detail="Separate your tabs by what you are doing.">
              <button onClick={() => open('workspace')}>
                <Plus size={15} />
                New workspace
              </button>
            </Row>
            <Row
              title="Tab groups"
              detail="Use the tab context menu to create and organize groups."
            >
              <button onClick={() => open('group')}>Create group</button>
            </Row>
          </>
        )}
        {section === 'privacy' && (
          <>
            <p className="section-description">Clear choices. No inflated promises.</p>
            <Row
              title="Clear browsing data"
              detail="History, site data, cache and restore records."
            >
              <button onClick={() => open('clear')}>Choose data to clear</button>
            </Row>
            <Row
              title="Request blocking"
              detail="Uses your domain list. Balanced blocks subresources; Strict also blocks navigation. This is basic filtering, not comprehensive tracking protection."
            >
              {select('protection', [
                ['off', 'Off'],
                ['balanced', 'Balanced'],
                ['strict', 'Strict'],
              ])}
            </Row>
            <Row title="Blocked domains" detail="One domain per line, without https://.">
              <TextSetting
                multiline
                label="Blocked domains"
                value={s.blockedDomains.join('\n')}
                placeholder="ads.example.com"
                onSave={(v) =>
                  patchSettings({
                    blockedDomains: v
                      .split(/\s+/)
                      .map((x) => x.trim().toLowerCase())
                      .filter(Boolean),
                  })
                }
              />
            </Row>
            <Row
              title="Allowed popup origins"
              detail="One full origin per line, such as https://example.com."
            >
              <TextSetting
                multiline
                label="Popup allowlist"
                value={s.popupAllowlist.join('\n')}
                onSave={(v) => patchSettings({ popupAllowlist: v.split(/\s+/).filter(Boolean) })}
              />
            </Row>
            <h3>Saved site permissions</h3>
            {state.permissions.length ? (
              state.permissions.map((p) => (
                <Row
                  key={`${p.origin}-${p.permission}`}
                  title={p.origin}
                  detail={`${p.permission} · ${p.decision}`}
                >
                  <button
                    onClick={() =>
                      void command({
                        type: 'permission.remove',
                        origin: p.origin,
                        permission: p.permission,
                      })
                    }
                  >
                    Reset
                  </button>
                </Row>
              ))
            ) : (
              <p className="muted">You haven’t saved any permission decisions.</p>
            )}
          </>
        )}
        {section === 'downloads' && (
          <>
            <Row title="Ask where to save each file">
              {toggle('askDownload', 'Ask where to save downloads')}
            </Row>
            <Row title="Download folder" detail={s.downloadPath || 'Your system Downloads folder'}>
              <button onClick={() => void command({ type: 'download.directory' })}>
                Change folder
              </button>
            </Row>
            <Row title="Download history">
              <button onClick={() => openPage('downloads')}>Open downloads</button>
            </Row>
          </>
        )}
        {section === 'startup' && (
          <>
            <Row title="When Dot starts">
              {select('startup', [
                ['newtab', 'Open a new tab'],
                ['restore', 'Continue where I left off'],
                ['pages', 'Open specific pages'],
              ])}
            </Row>
            {s.startup === 'pages' && (
              <Row title="Startup pages" detail="One URL per line.">
                <TextSetting
                  multiline
                  label="Startup pages"
                  value={s.startupPages.join('\n')}
                  onSave={(v) =>
                    patchSettings({
                      startupPages: v
                        .split('\n')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Row>
            )}
            <p className="muted">
              Normal windows are recovered after an unexpected shutdown. Private tabs are never
              saved.
            </p>
          </>
        )}
        {section === 'languages' && (
          <>
            <Row
              title="Date and time format"
              detail="Changes the new tab clock and history timestamps. The interface is currently in English."
            >
              {select('language', [
                ['en-US', 'English (United States)'],
                ['tr-TR', 'Türkçe'],
                ['de-DE', 'Deutsch'],
                ['fr-FR', 'Français'],
              ])}
            </Row>
            <p className="muted">
              Webpage languages and spell checking follow Chromium and your operating system.
            </p>
          </>
        )}
        {section === 'accessibility' && (
          <>
            <Row title="Interface text size">
              <input
                type="range"
                aria-label="Interface text size"
                min={0.85}
                max={1.3}
                step={0.05}
                value={s.textScale}
                onChange={(e) => patchSettings({ textScale: Number(e.target.value) })}
              />
              <span>{Math.round(s.textScale * 100)}%</span>
            </Row>
            <Row title="Motion">{toggle('animations', 'Enable interface animations')}</Row>
            <p className="muted">
              Dot respects your system’s reduced motion preference. All controls support keyboard
              focus.
            </p>
          </>
        )}
        {section === 'shortcuts' && (
          <div className="shortcut-table">
            {[
              ['Focus address bar', 'Ctrl L'],
              ['New tab', 'Ctrl T'],
              ['Close tab', 'Ctrl W'],
              ['Reopen tab', 'Ctrl Shift T'],
              ['Next / previous tab', 'Ctrl Tab / Ctrl Shift Tab'],
              ['Select tab 1–8 / last tab', 'Ctrl 1–8 / Ctrl 9'],
              ['Reload / hard reload', 'Ctrl R / Ctrl Shift R'],
              ['Back / forward', 'Alt ← / Alt →'],
              ['Bookmark page', 'Ctrl D'],
              ['History / downloads', 'Ctrl H / Ctrl J'],
              ['Find in page', 'Ctrl F'],
              ['Zoom in / out / reset', 'Ctrl + / Ctrl − / Ctrl 0'],
              ['Command palette', 'Ctrl K / Ctrl Shift P'],
              ['Search open tabs', 'Ctrl Shift A'],
              ['Reading view', 'Ctrl Shift M'],
              ['Save as PDF', 'Ctrl Shift S'],
              ['New / private window', 'Ctrl N / Ctrl Shift N'],
              ['Clear browsing data', 'Ctrl Shift Delete'],
              ['Fullscreen', 'F11'],
              ['Developer tools', 'F12 / Ctrl Shift I'],
              ['Print / save page', 'Ctrl P / Ctrl S'],
            ].map(([label, keys]) => (
              <Row key={label} title={label}>
                <kbd>{keys}</kbd>
              </Row>
            ))}
          </div>
        )}
        {section === 'advanced' && (
          <>
            <Row
              title="Browser task manager"
              detail="Live process IDs and tab lifecycle status. Memory totals are not estimated."
            >
              <button onClick={() => openPage('performance')}>Open task manager</button>
            </Row>
            <Row
              title="Extensions"
              detail="Extension loading is not offered in this release. Chromium web standards run natively."
            >
              <span className="badge">Unavailable</span>
            </Row>
            <Row
              title="Passwords and autofill"
              detail="Import browser password CSV files, store them encrypted and fill login forms on matching sites."
            >
              <button onClick={() => useBrowser.getState().open('passwords')}>
                Manage passwords
              </button>
            </Row>
            <Row
              title="Updates"
              detail="Updates download automatically from GitHub Releases and install when you quit Dot."
            >
              <span className="badge">Automatic</span>
            </Row>
          </>
        )}
        {section === 'about' && <AboutContent />}
      </div>
    </div>
  );
}
