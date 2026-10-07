import { FiltersEngine, Request } from '@ghostery/adblocker';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserSettings } from '../shared/models';

export function blockingEnabled(settings: BrowserSettings, sourceURL: string) {
  try {
    const source = new URL(sourceURL);
    return (
      ['http:', 'https:'].includes(source.protocol) &&
      settings.adblock !== 'off' &&
      !settings.adblockExceptions.includes(source.origin)
    );
  } catch {
    return false;
  }
}

export class AdBlock {
  private ads = FiltersEngine.empty();
  private strict = FiltersEngine.empty();
  private updatedAt = 0;
  private updating?: Promise<void>;
  constructor(
    private readonly directory: string,
    private readonly bundled: string,
  ) {}
  private compile(easylist: string, easyprivacy: string) {
    if (
      ![easylist, easyprivacy].every(
        (list) => list.startsWith('[Adblock') && list.length > 10000 && list.length < 8_000_000,
      )
    )
      throw new Error('Invalid filter list');
    const ads = FiltersEngine.parse(easylist, { loadExtendedSelectors: false });
    const strict = FiltersEngine.parse(`${easylist}\n${easyprivacy}`, {
      loadExtendedSelectors: false,
    });
    return { ads, strict };
  }
  async initialize() {
    const [list, privacy] = await Promise.all([
      readFile(join(this.bundled, 'easylist.txt'), 'utf8'),
      readFile(join(this.bundled, 'easyprivacy.txt'), 'utf8'),
    ]);
    Object.assign(this, this.compile(list, privacy));
    try {
      const cache = JSON.parse(await readFile(join(this.directory, 'filters.json'), 'utf8'));
      const engines = this.compile(cache.easylist, cache.easyprivacy);
      if (Number.isFinite(cache.updatedAt) && cache.updatedAt <= Date.now()) {
        Object.assign(this, engines);
        this.updatedAt = cache.updatedAt;
      }
    } catch {
      /* Bundled lists keep blocking available offline or after a corrupt cache. */
    }
  }
  info() {
    return {
      updatedAt: this.updatedAt,
      updating: !!this.updating,
      rules: this.ads.getFilters().networkFilters.length,
    };
  }
  update() {
    if (this.updating) return this.updating;
    this.updating = (async () => {
      const download = async (name: string) => {
        const response = await fetch(`https://easylist.to/easylist/${name}.txt`, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok || !response.body) throw new Error('Filter update failed');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 8_000_000) throw new Error('Filter list too large');
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        return Buffer.concat(chunks).toString('utf8');
      };
      const [easylist, easyprivacy] = await Promise.all([
        download('easylist'),
        download('easyprivacy'),
      ]);
      const engines = this.compile(easylist, easyprivacy);
      const updatedAt = Date.now();
      await mkdir(this.directory, { recursive: true });
      const destination = join(this.directory, 'filters.json');
      await writeFile(`${destination}.tmp`, JSON.stringify({ easylist, easyprivacy, updatedAt }));
      await rename(`${destination}.tmp`, destination);
      Object.assign(this, engines);
      this.updatedAt = updatedAt;
    })().finally(() => {
      this.updating = undefined;
    });
    return this.updating;
  }
  shouldBlock(settings: BrowserSettings, url: string, sourceUrl: string, resourceType: string) {
    // Never block the top-level navigation or extension resources with filter lists.
    if (
      resourceType === 'mainFrame' ||
      !blockingEnabled(settings, sourceUrl) ||
      !/^https?:\/\//i.test(url)
    )
      return false;
    const type =
      ({ subFrame: 'sub_frame', xhr: 'xmlhttprequest' } as Record<string, string>)[resourceType] ??
      resourceType;
    return (settings.adblock === 'strict' ? this.strict : this.ads).match(
      Request.fromRawDetails({ url, sourceUrl, type: type as 'script' }),
    ).match;
  }
  cosmetics(settings: BrowserSettings, url: string, classes: string[], ids: string[]) {
    if (!blockingEnabled(settings, url)) return '';
    const request = Request.fromRawDetails({ url });
    const result = (settings.adblock === 'strict' ? this.strict : this.ads).getCosmeticsFilters({
      url,
      hostname: request.hostname,
      domain: request.domain,
      classes,
      ids,
      getBaseRules: true,
      getRulesFromDOM: true,
      getRulesFromHostname: true,
      getInjectionRules: false,
      getExtendedRules: false,
    });
    return result.styles;
  }
}
