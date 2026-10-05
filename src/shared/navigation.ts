import { BrowserSettings, HistoryEntry, internalPage } from './models';
export function resolveInput(
  raw: string,
  settings: BrowserSettings,
): { url: string; query?: string } {
  const input = raw.trim();
  if (!input) return { url: 'browser://newtab' };
  if (input.startsWith('view-source:') && isWebURL(input.slice(12))) return { url: input };
  if (/^browser:\/\//i.test(input)) {
    const normalized = input.toLowerCase();
    if (internalPage(normalized) === 'error') throw new Error('Unknown internal browser page');
    return { url: normalized };
  }
  if (/^(https?):\/\//i.test(input)) {
    const url = new URL(input);
    if (url.username || url.password)
      throw new Error('URLs containing credentials are not supported');
    return { url: url.href };
  }
  const alias = settings.engines.find(
    (engine) => engine.keyword && input.startsWith(`${engine.keyword} `),
  );
  if (alias) {
    const query = input.slice(alias.keyword.length + 1).trim();
    return { url: alias.template.replace('%s', encodeURIComponent(query)), query };
  }
  const local = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#].*)?$/i.test(
    input,
  );
  const domain = /^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#].*)?$/u.test(input);
  if (!/\s/.test(input) && (local || domain))
    return { url: new URL(`${local ? 'http' : 'https'}://${input}`).href };
  if (
    /^(javascript|vbscript|data|file|about|http|https|mailto|tel|discord|steam):/i.test(input) ||
    /^[a-z][a-z\d+.-]*:\/\//i.test(input)
  )
    throw new Error('This address uses an unsupported protocol');
  const engine = settings.engines.find((e) => e.id === settings.engine) ?? settings.engines[0];
  if (!engine) throw new Error('Choose a search engine in Settings');
  return { url: engine.template.replace('%s', encodeURIComponent(input)), query: input };
}
export function isWebURL(raw: string): boolean {
  try {
    const u = new URL(raw);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function safeFavicon(raw: string): string {
  return raw.startsWith('data:image/') || isWebURL(raw) ? raw : '';
}
export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}
export function historyGroup(timestamp: number, now = Date.now()): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (timestamp >= today.getTime()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (timestamp >= yesterday.getTime()) return 'Yesterday';
  if (now - timestamp <= 7 * 86400000) return 'Previous 7 days';
  return 'Older';
}
export function recordVisit(
  history: HistoryEntry[],
  url: string,
  title: string,
  favicon = '',
  now = Date.now(),
): HistoryEntry[] {
  if (!isWebURL(url)) return history;
  const existing = history.find((h) => h.url === url);
  return [
    {
      id: existing?.id ?? crypto.randomUUID(),
      url,
      title,
      favicon,
      timestamp: now,
      visitCount: (existing?.visitCount ?? 0) + 1,
    },
    ...history.filter((h) => h.url !== url),
  ].slice(0, 10000);
}
