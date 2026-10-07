export interface ExtensionSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  error?: string;
  builtin?: 'night' | 'scroll';
  source?: 'folder' | 'store';
}
export function chromeStoreId(value: string) {
  if (/^[a-p]{32}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return;
    if (url.hostname !== 'chromewebstore.google.com' && url.hostname !== 'chrome.google.com')
      return;
    if (
      !(
        url.hostname === 'chromewebstore.google.com' ? /^\/detail\// : /^\/webstore\/detail\//
      ).test(url.pathname)
    )
      return;
    const id = url.pathname.replace(/\/$/, '').split('/').at(-1);
    if (id && /^[a-p]{32}$/.test(id)) return id;
  } catch {
    /* Not a store address. */
  }
}
