import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { ImportSource } from '../shared/import';
import type { Bookmark, HistoryEntry } from '../shared/models';
import {
  chromiumBookmarks,
  chromiumSession,
  firefoxSession,
  object,
  webURL,
} from './import-formats';

export interface ImportedProfileData {
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  tabs: { url: string; title: string; pinned: boolean }[];
  warnings: string[];
}
const home = homedir();
function profileRoots() {
  if (process.platform === 'win32')
    return [
      ['Chrome', join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data')],
      ['Edge', join(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/User Data')],
      ['Brave', join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware/Brave-Browser/User Data')],
    ];
  if (process.platform === 'darwin')
    return [
      ['Chrome', join(home, 'Library/Application Support/Google/Chrome')],
      ['Edge', join(home, 'Library/Application Support/Microsoft Edge')],
      ['Brave', join(home, 'Library/Application Support/BraveSoftware/Brave-Browser')],
    ];
  return [
    ['Chrome', join(home, '.config/google-chrome')],
    ['Edge', join(home, '.config/microsoft-edge')],
    ['Brave', join(home, '.config/BraveSoftware/Brave-Browser')],
  ];
}
function profileLabel(name: string) {
  return name === 'Default' ? 'Default profile' : name.replace(/^Profile /, 'Profile ');
}
function firefoxRoots(): string[] {
  const base =
    process.platform === 'win32'
      ? join(process.env.APPDATA ?? '', 'Mozilla/Firefox')
      : process.platform === 'darwin'
        ? join(home, 'Library/Application Support/Firefox')
        : join(home, '.mozilla/firefox');
  const ini = join(base, 'profiles.ini');
  if (!existsSync(ini)) return [];
  const results: string[] = [];
  let path = '',
    absolute = false;
  const add = () => {
    if (!path) return;
    const folder = absolute ? resolve(path) : resolve(base, path);
    if (existsSync(join(folder, 'places.sqlite'))) results.push(folder);
    path = '';
    absolute = false;
  };
  for (const line of readFileSync(ini, 'utf8').split(/\r?\n/)) {
    if (/^\s*\[Profile\d+\]/i.test(line)) {
      add();
      continue;
    }
    const match = line.match(/^\s*(Path|IsRelative)\s*=\s*(.*)\s*$/i);
    if (match) {
      if (match[1].toLowerCase() === 'path') path = match[2];
      else absolute = match[2] === '0';
    }
  }
  add();
  return results;
}
export function discoverProfiles(): ImportSource[] {
  const sources: ImportSource[] = [];
  for (const [browser, root] of profileRoots()) {
    const localState = join(root, 'Local State');
    if (!existsSync(localState)) continue;
    let names = ['Default'];
    try {
      const raw = object(JSON.parse(readFileSync(localState, 'utf8')));
      const info = object(object(raw.profile).info_cache);
      const detected = Object.keys(info).filter((name) =>
        existsSync(join(root, name, 'Bookmarks')),
      );
      if (detected.length) names = detected;
    } catch {
      /* A damaged profile list should not hide the browser's default profile. */
    }
    for (const name of names) {
      if (!existsSync(join(root, name, 'Bookmarks'))) continue;
      sources.push({ id: randomUUID(), browser, profile: profileLabel(name), family: 'chromium' });
    }
  }
  firefoxRoots().forEach((path, index) =>
    sources.push({
      id: randomUUID(),
      browser: 'Firefox',
      profile: `Profile ${index + 1}`,
      family: 'firefox',
      path,
    }),
  );
  return sources;
}
function sourcePath(source: ImportSource): string {
  if (source.family === 'firefox' && source.path) return source.path;
  const root = profileRoots().find(([name]) => name === source.browser)?.[1];
  if (!root) throw new Error('Browser profile is no longer available');
  const base = source.profile === 'Default profile' ? 'Default' : source.profile;
  const path = join(root, base);
  if (!existsSync(join(path, 'Bookmarks')))
    throw new Error('Browser profile is no longer available');
  return path;
}
function queryDb(
  path: string,
  sql: string,
  ...args: (string | number)[]
): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true, timeout: 1500 });
  try {
    return db.prepare(sql).all(...args) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}
function chromeTime(value: unknown): number {
  const n = Number(value) / 1000 - 11644473600000;
  return Number.isFinite(n) && n > 0 && n <= Date.now() ? n : Date.now();
}
export function readProfile(source: ImportSource, kinds: string[]): ImportedProfileData {
  const directory = sourcePath(source),
    data: ImportedProfileData = { bookmarks: [], history: [], tabs: [], warnings: [] };
  const firefox = source.family === 'firefox';
  if (kinds.includes('bookmarks')) {
    if (firefox) {
      const rows = queryDb(
        join(directory, 'places.sqlite'),
        `SELECT b.title AS title, p.url AS url, f.title AS folder, b.dateAdded AS dateAdded FROM moz_bookmarks b JOIN moz_places p ON p.id=b.fk LEFT JOIN moz_bookmarks f ON f.id=b.parent WHERE b.type=1 ORDER BY b.id LIMIT 50000`,
      );
      data.bookmarks = rows.flatMap((row) => {
        const url = webURL(row.url);
        if (!url) return [];
        return [
          {
            id: randomUUID(),
            url,
            title: String(row.title || new URL(url).hostname).slice(0, 500),
            favicon: '',
            folder: `Firefox / ${String(row.folder || 'Bookmarks').slice(0, 100)}`,
            createdAt: Math.max(0, Number(row.dateAdded) / 1000) || Date.now(),
          },
        ];
      });
    } else {
      const file = join(directory, 'Bookmarks');
      if (existsSync(file))
        data.bookmarks = chromiumBookmarks(JSON.parse(readFileSync(file, 'utf8')), source.browser);
    }
  }
  if (kinds.includes('history')) {
    const db = join(directory, firefox ? 'places.sqlite' : 'History');
    const rows = firefox
      ? queryDb(
          db,
          `SELECT p.url AS url,p.title AS title,COUNT(*) AS visitCount,MAX(v.visit_date) AS timestamp FROM moz_places p JOIN moz_historyvisits v ON v.place_id=p.id WHERE p.hidden=0 GROUP BY p.id ORDER BY timestamp DESC LIMIT 20000`,
        )
      : queryDb(
          db,
          `SELECT url,title,visit_count AS visitCount,last_visit_time AS timestamp FROM urls WHERE hidden=0 ORDER BY last_visit_time DESC LIMIT 20000`,
        );
    data.history = rows.flatMap((row) => {
      const url = webURL(row.url);
      if (!url) return [];
      const timestamp = firefox ? Number(row.timestamp) / 1000 : chromeTime(row.timestamp);
      return [
        {
          id: randomUUID(),
          url,
          title: String(row.title || url).slice(0, 500),
          favicon: '',
          timestamp: timestamp > 0 ? timestamp : Date.now(),
          visitCount: Math.max(1, Number(row.visitCount) || 1),
        },
      ];
    });
  }
  if (kinds.includes('tabs')) {
    if (firefox) {
      const backup = join(directory, 'sessionstore-backups');
      for (const name of ['recovery.jsonlz4', 'recovery.baklz4', 'previous.jsonlz4']) {
        const path = join(backup, name);
        if (existsSync(path)) {
          try {
            data.tabs = firefoxSession(readFileSync(path));
            if (data.tabs.length) break;
          } catch {
            /* try the next recoverable session */
          }
        }
      }
    } else {
      const sessions = join(directory, 'Sessions');
      if (existsSync(sessions)) {
        const files = readdirSync(sessions)
          .filter((name) => /^(Session|Tabs)_/.test(name))
          .sort((a, b) => b.localeCompare(a));
        for (const name of files.slice(0, 2)) {
          try {
            const tabs = chromiumSession(readFileSync(join(sessions, name)));
            if (tabs.length > data.tabs.length) data.tabs = tabs;
          } catch {
            /* older Chromium may encrypt session files */
          }
        }
      }
    }
  }
  if (kinds.some((kind) => ['cookies', 'passwords'].includes(kind)))
    data.warnings.push(
      'Cookies and passwords are protected by the source browser and operating system. Export these from the source browser to import them safely.',
    );
  return data;
}
