import type { Bookmark, HistoryEntry } from '../shared/models';
import type { ImportKind } from '../shared/import';
import { randomUUID } from 'node:crypto';

export interface ImportedCookie {
  url: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}
export interface ImportBundle {
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  tabs: { url: string; title: string; pinned: boolean }[];
  cookies: ImportedCookie[];
  passwords: { origin: string; username: string; password: string }[];
  warnings: string[];
}
export const emptyBundle = (): ImportBundle => ({
  bookmarks: [],
  history: [],
  tabs: [],
  cookies: [],
  passwords: [],
  warnings: [],
});
export function webURL(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function chromiumTime(value: unknown): number {
  const n = Number(value) / 1000 - 11644473600000;
  return Number.isFinite(n) && n > 0 && n <= Date.now() ? n : Date.now();
}
export function chromiumBookmarks(raw: unknown, source: string): Bookmark[] {
  const results: Bookmark[] = [];
  function walk(value: unknown, folders: string[], depth: number) {
    if (depth > 40 || results.length >= 50000) return;
    const node = object(value),
      url = webURL(node.url);
    if (node.type === 'url' && url)
      results.push({
        id: randomUUID(),
        url,
        title: String(node.name || new URL(url).hostname).slice(0, 500),
        favicon: '',
        folder: [source, ...folders].join(' / ').slice(0, 500),
        createdAt: chromiumTime(node.date_added),
      });
    if (Array.isArray(node.children))
      for (const child of node.children)
        walk(
          child,
          node.type === 'folder'
            ? [...folders, String(node.name || 'Folder').slice(0, 100)]
            : folders,
          depth + 1,
        );
  }
  for (const root of Object.values(object(object(raw).roots))) walk(root, [], 0);
  return results;
}

// RFC 4180 CSV, including quoted commas, newlines, BOMs and escaped quotes.
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field.length) quoted = !quoted;
      else throw new Error('Invalid CSV quoting');
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field);
      field = '';
      if (c !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += c;
    if (rows.length > 50000 || field.length > 65536)
      throw new Error('Import file exceeds the supported size');
  }
  if (quoted) throw new Error('Incomplete CSV quoted field');
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function passwordCSV(text: string): ImportBundle {
  const out = emptyBundle(),
    rows = csvRows(text),
    headers = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const u = headers.findIndex((h) => ['url', 'origin', 'hostname', 'website'].includes(h));
  const n = headers.findIndex((h) => ['username', 'user', 'login'].includes(h));
  const p = headers.indexOf('password');
  if (u < 0 || n < 0 || p < 0)
    throw new Error('Choose a browser password CSV containing url, username and password columns');
  let skipped = 0;
  for (const row of rows) {
    const url = webURL(row[u]);
    if (!url || !row[p] || row[p].length > 8192 || (row[n]?.length ?? 0) > 1024) {
      skipped++;
      continue;
    }
    out.passwords.push({ origin: new URL(url).origin, username: row[n] ?? '', password: row[p] });
  }
  if (skipped) out.warnings.push(`${skipped} invalid or empty password rows were skipped.`);
  return out;
}
export function normalizeCookie(value: unknown): ImportedCookie | null {
  const r = object(value),
    domain = String(r.domain ?? r.host ?? '');
  const host = domain.replace(/^\./, '');
  if (!host || /[\s/:\\@]/.test(host)) return null;
  const path = typeof r.path === 'string' && r.path.startsWith('/') ? r.path : '/';
  const secure = Boolean(r.secure ?? r.isSecure),
    url = webURL(`${secure ? 'https' : 'http'}://${host}${path}`);
  if (
    !url ||
    typeof r.name !== 'string' ||
    !r.name ||
    r.name.length > 1024 ||
    typeof r.value !== 'string' ||
    r.value.length > 16384
  )
    return null;
  const expirationDate = Number(r.expirationDate ?? r.expiry ?? r.expires);
  if (expirationDate > 0 && expirationDate <= Date.now() / 1000) return null;
  const sameSites: Record<string, ImportedCookie['sameSite']> = {
    '0': 'no_restriction',
    '1': 'lax',
    '2': 'strict',
    '-1': 'unspecified',
    none: 'no_restriction',
    no_restriction: 'no_restriction',
    lax: 'lax',
    strict: 'strict',
    unspecified: 'unspecified',
  };
  return {
    url,
    domain,
    path,
    secure,
    httpOnly: Boolean(r.httpOnly ?? r.isHttpOnly),
    name: r.name,
    value: r.value,
    ...(expirationDate > 0 && !r.session ? { expirationDate } : {}),
    sameSite: sameSites[String(r.sameSite ?? 'unspecified')] ?? 'unspecified',
  };
}
export function cookieFile(text: string): ImportBundle {
  const out = emptyBundle();
  let rows: unknown[];
  if (/^\s*(?:\{|\[)/.test(text)) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Cookie export is not valid JSON.');
    }
    rows = Array.isArray(raw) ? raw : (object(raw).cookies as unknown[]);
    if (!Array.isArray(rows)) throw new Error('Cookie JSON must contain an array of cookies');
  } else {
    rows = text
      .split(/\r?\n/)
      .filter((l) => l.trim() && (!l.startsWith('#') || l.startsWith('#HttpOnly_')))
      .map((l) => {
        const [domain, subdomains, path, secure, expires, name, ...value] = l
          .replace(/^#HttpOnly_/, '')
          .split('\t');
        return {
          domain:
            subdomains === 'TRUE' && domain && !domain.startsWith('.') ? `.${domain}` : domain,
          path,
          secure: secure === 'TRUE',
          expirationDate: Number(expires),
          name,
          value: value.join('\t'),
          httpOnly: l.startsWith('#HttpOnly_'),
        };
      });
  }
  if (rows.length > 50000) throw new Error('Too many cookies');
  for (const row of rows) {
    const cookie = normalizeCookie(row);
    if (cookie) out.cookies.push(cookie);
  }
  if (rows.length > out.cookies.length)
    out.warnings.push(
      `${rows.length - out.cookies.length} expired or invalid cookies were skipped.`,
    );
  return out;
}
export function tabFile(text: string): ImportBundle {
  const out = emptyBundle();
  for (const line of text.split(/\r?\n/)) {
    const url = webURL(line.trim());
    if (url) out.tabs.push({ url, title: new URL(url).hostname, pinned: false });
  }
  if (out.tabs.length > 200) {
    out.tabs.length = 200;
    out.warnings.push('Only the first 200 tabs are included.');
  }
  if (!out.tabs.length) throw new Error('Use a text file with one HTTP or HTTPS tab URL per line');
  return out;
}

// Mozilla jsonlz4 is an 8-byte magic, LE uncompressed size, then a raw LZ4 block.
export function firefoxSession(data: Buffer): ImportBundle['tabs'] {
  let text: string;
  if (data.subarray(0, 8).toString('binary') === 'mozLz40\0') {
    const size = data.readUInt32LE(8);
    if (size > 64 * 1024 * 1024) throw new Error('Session file is too large');
    const out = Buffer.alloc(size);
    let i = 12,
      j = 0;
    const extra = (n: number) => {
      if (n === 15) {
        let b: number;
        do {
          if (i >= data.length) throw new Error('Truncated LZ4');
          b = data[i++];
          n += b;
        } while (b === 255);
      }
      return n;
    };
    while (i < data.length) {
      const token = data[i++],
        literals = extra(token >> 4);
      if (i + literals > data.length || j + literals > size) throw new Error('Invalid LZ4 literal');
      data.copy(out, j, i, i + literals);
      i += literals;
      j += literals;
      if (i === data.length) break;
      if (i + 2 > data.length) throw new Error('Truncated LZ4 offset');
      const offset = data.readUInt16LE(i);
      i += 2;
      const length = extra(token & 15) + 4;
      if (!offset || offset > j || j + length > size) throw new Error('Invalid LZ4 match');
      for (let k = 0; k < length; k++) {
        out[j] = out[j - offset];
        j++;
      }
    }
    if (j !== size) throw new Error('Truncated LZ4 output');
    text = out.toString('utf8');
  } else text = data.toString('utf8');
  const raw = object(JSON.parse(text)),
    tabs: ImportBundle['tabs'] = [];
  for (const w of Array.isArray(raw.windows) ? raw.windows : []) {
    const window = object(w);
    if (window.isPrivate) continue;
    for (const t of Array.isArray(window.tabs) ? window.tabs : []) {
      const tab = object(t);
      if (tab.isPrivate) continue;
      const entries = Array.isArray(tab.entries) ? tab.entries : [],
        entry = object(entries[Number(tab.index ?? entries.length) - 1]),
        url = webURL(entry.url);
      if (url)
        tabs.push({
          url,
          title: String(entry.title ?? new URL(url).hostname).slice(0, 500),
          pinned: Boolean(tab.pinned),
        });
      if (tabs.length >= 200) return tabs;
    }
  }
  return tabs;
}

// Chromium SNSS v1/v3 command stream. v2/v4 are encrypted and deliberately rejected.
export function chromiumSession(data: Buffer): ImportBundle['tabs'] {
  if (
    data.length < 8 ||
    data.toString('ascii', 0, 4) !== 'SNSS' ||
    ![1, 3].includes(data.readInt32LE(4))
  )
    throw new Error('Unsupported or protected Chromium session format');
  const tabs = new Map<
    number,
    {
      window?: number;
      order: number;
      selected?: number;
      pinned: boolean;
      entries: Map<number, { url: string; title: string }>;
    }
  >();
  const closedWindows = new Set<number>();
  const get = (id: number) => {
    let tab = tabs.get(id);
    if (!tab) {
      tab = { order: tabs.size, pinned: false, entries: new Map() };
      tabs.set(id, tab);
    }
    return tab;
  };
  for (let p = 8; p + 3 <= data.length;) {
    const size = data.readUInt16LE(p);
    p += 2;
    if (!size || p + size > data.length) break; // Chromium may leave a partial last command after a crash.
    const id = data[p],
      b = data.subarray(p + 1, p + size);
    p += size;
    if (b.length < 4) continue;
    const tabId = b.readInt32LE(0);
    if (id === 16) {
      tabs.delete(tabId);
      continue;
    }
    if (id === 17) {
      closedWindows.add(tabId);
      continue;
    }
    if ([0, 2, 7].includes(id) && b.length >= 8) {
      const t = get(tabId),
        n = b.readInt32LE(4);
      if (id === 0) t.window = n;
      else if (id === 2) t.order = n;
      else t.selected = n;
    } else if (id === 12 && b.length >= 5) get(tabId).pinned = !!b[4];
    else if (id === 6 && b.length >= 16) {
      let cursor = 4; // Pickle header's payload length.
      const int = () => {
        if (cursor + 4 > b.length) throw new Error('Invalid session command');
        const n = b.readInt32LE(cursor);
        cursor += 4;
        return n;
      };
      const string = (utf16 = false) => {
        const size = int() * (utf16 ? 2 : 1);
        if (size < 0 || cursor + size > b.length) throw new Error('Invalid session string');
        const s = b.toString(utf16 ? 'utf16le' : 'utf8', cursor, cursor + size);
        cursor += (size + 3) & ~3;
        return s;
      };
      const t = get(int()),
        index = int(),
        url = webURL(string()),
        title = string(true);
      if (url) t.entries.set(index, { url, title: title.slice(0, 500) || new URL(url).hostname });
    }
  }
  return [...tabs.values()]
    .filter((t) => t.window !== undefined && !closedWindows.has(t.window))
    .sort((a, b) => a.window! - b.window! || a.order - b.order)
    .flatMap((t) => {
      const entry =
        t.selected === undefined ? [...t.entries.values()].at(-1) : t.entries.get(t.selected);
      return entry ? [{ ...entry, pinned: t.pinned }] : [];
    })
    .slice(0, 200);
}
export function bundleCounts(bundle: ImportBundle): Record<ImportKind, number> {
  return {
    bookmarks: bundle.bookmarks.length,
    history: bundle.history.length,
    tabs: bundle.tabs.length,
    cookies: bundle.cookies.length,
    passwords: bundle.passwords.length,
  };
}
