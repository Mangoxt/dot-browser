import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { ImportSource } from '../shared/import';
import type { Bookmark, HistoryEntry } from '../shared/models';
import { chromiumBookmarks, chromiumSession, firefoxSession, webURL } from './import-formats';

export interface ImportedProfileData {
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  tabs: { url: string; title: string; pinned: boolean }[];
  warnings: string[];
}
function sourcePath(source: ImportSource): string {
  if (source.path && existsSync(source.path)) return source.path;
  throw new Error('Browser profile is no longer available');
}
function queryDb(
  path: string,
  sql: string,
  ...args: (string | number)[]
): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true, timeout: 1500 });
  try {
    const statement = db.prepare(sql);
    statement.setReadBigInts(true);
    return statement.all(...args) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}
function chromeTime(value: unknown): number {
  const n = Number(value) / 1000 - 11644473600000;
  return Number.isFinite(n) && n > 0 && n <= Date.now() ? n : Date.now();
}
function readProfilePart(source: ImportSource, kinds: string[]): ImportedProfileData {
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
            folder: `${source.browser} / ${String(row.folder || 'Bookmarks').slice(0, 100)}`,
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

export function readProfile(source: ImportSource, kinds: string[]): ImportedProfileData {
  sourcePath(source);
  const data: ImportedProfileData = { bookmarks: [], history: [], tabs: [], warnings: [] };
  const labels = { bookmarks: 'Bookmarks', history: 'Browsing history', tabs: 'Open tabs' };
  for (const kind of ['bookmarks', 'history', 'tabs'] as const) {
    if (!kinds.includes(kind)) continue;
    try {
      const part = readProfilePart(source, [kind]);
      if (kind === 'bookmarks') data.bookmarks = part.bookmarks;
      else if (kind === 'history') data.history = part.history;
      else data.tabs = part.tabs;
      data.warnings.push(...part.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      data.warnings.push(
        /(?:locked|busy)/i.test(message)
          ? `${labels[kind]} is locked by ${source.browser}. Completely close ${source.browser}, including background processes, then preview again to import this category.`
          : `${labels[kind]} could not be read from this profile. This category was skipped; try a different profile or an exported file.`,
      );
    }
  }
  if (kinds.some((kind) => ['cookies', 'passwords'].includes(kind)))
    data.warnings.push(
      'Export passwords as CSV and cookies as JSON/TXT from the source browser to import them.',
    );
  if (!data.bookmarks.length && !data.history.length && !data.tabs.length && data.warnings.length)
    throw new Error(data.warnings.join(' '));
  return data;
}
