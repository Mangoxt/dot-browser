import type { BrowserTab, BrowserSettings } from './models';
import { isWebURL } from './navigation';

export function webOrigin(url: string): string | null {
  return isWebURL(url) ? new URL(url).origin : null;
}
export function siteZoom(settings: Pick<BrowserSettings, 'siteZoom'>, url: string): number {
  const origin = webOrigin(url);
  return settings.siteZoom.find((rule) => rule.origin === origin)?.value ?? 1;
}
export function canAutoSleep(
  tab: Pick<BrowserTab, 'id' | 'url' | 'pinned' | 'audio' | 'loading'>,
  activeId: string,
  splitIds: (string | undefined)[],
  keepAwakeSites: string[],
): boolean {
  const origin = webOrigin(tab.url);
  return (
    !!origin &&
    tab.id !== activeId &&
    !splitIds.includes(tab.id) &&
    !tab.pinned &&
    !tab.audio &&
    !tab.loading &&
    !keepAwakeSites.includes(origin)
  );
}
export function cleanLink(raw: string): string {
  if (!isWebURL(raw)) throw new Error('Open a website first');
  const url = new URL(raw);
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? url.href : raw;
}
