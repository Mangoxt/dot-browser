import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AdBlock, blockingEnabled } from '../src/main/adblock';
import { settingsSchema } from '../src/shared/models';
const directory = mkdtempSync(join(tmpdir(), 'dot-adblock-unit-'));
const engine = new AdBlock(directory, resolve('assets/filter-lists'));
beforeAll(() => engine.initialize(), 30000);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
describe('maintained ad blocking', () => {
  const settings = settingsSchema.parse({});
  it('uses bundled network filters offline while preserving top-level navigation', () => {
    expect(engine.info().rules).toBeGreaterThan(10000);
    expect(
      engine.shouldBlock(
        settings,
        'https://ad.doubleclick.net/ad.js',
        'https://example.org/',
        'script',
      ),
    ).toBe(true);
    expect(
      engine.shouldBlock(settings, 'https://doubleclick.net/', 'https://example.org/', 'mainFrame'),
    ).toBe(false);
    expect(
      engine.shouldBlock(
        settings,
        'https://example.org/normal.js',
        'https://example.org/',
        'script',
      ),
    ).toBe(false);
  });
  it('honors exact-origin exceptions, disabled blocking and extension boundaries', () => {
    const excepted = { ...settings, adblockExceptions: ['https://example.org'] };
    expect(blockingEnabled(excepted, 'https://example.org/path')).toBe(false);
    expect(blockingEnabled(excepted, 'http://example.org/path')).toBe(true);
    expect(
      engine.shouldBlock(
        excepted,
        'https://ad.doubleclick.net/ad.js',
        'https://example.org/',
        'script',
      ),
    ).toBe(false);
    expect(
      engine.shouldBlock(
        { ...settings, adblock: 'off' },
        'https://ad.doubleclick.net/ad.js',
        'https://example.org/',
        'script',
      ),
    ).toBe(false);
    expect(
      engine.shouldBlock(
        settings,
        'https://ad.doubleclick.net/ad.js',
        'chrome-extension://fixture/',
        'script',
      ),
    ).toBe(false);
  });
  it('adds tracker rules in strict mode and produces removable cosmetic CSS', () => {
    expect(
      engine.shouldBlock(
        { ...settings, adblock: 'strict' },
        'https://www.google-analytics.com/analytics.js',
        'https://example.org/',
        'script',
      ),
    ).toBe(true);
    expect(engine.cosmetics(settings, 'https://example.org/', ['adsbygoogle'], [])).toContain(
      'display: none',
    );
    expect(
      engine.cosmetics(
        { ...settings, adblock: 'off' },
        'https://example.org/',
        ['adsbygoogle'],
        [],
      ),
    ).toBe('');
  });
  it('falls back to bundled lists when the update cache is corrupt', async () => {
    writeFileSync(join(directory, 'filters.json'), '{bad');
    const fallback = new AdBlock(directory, resolve('assets/filter-lists'));
    await fallback.initialize();
    expect(
      fallback.shouldBlock(
        settings,
        'https://ad.doubleclick.net/ad.js',
        'https://example.org/',
        'script',
      ),
    ).toBe(true);
    expect(fallback.info().updatedAt).toBe(0);
  });
});
