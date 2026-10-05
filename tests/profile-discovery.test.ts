import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProfiles } from '../src/main/profile-discovery';
import { readProfile } from '../src/main/profile-import';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function root() {
  const path = mkdtempSync(join(tmpdir(), 'dot-discovery-'));
  roots.push(path);
  return path;
}
function chromium(path: string, bookmarks = false) {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'Preferences'), JSON.stringify({ profile: { name: 'Work' } }));
  if (bookmarks)
    writeFileSync(
      join(path, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'Bar',
            children: [{ type: 'url', name: 'Test', url: 'https://example.com/' }],
          },
        },
      }),
    );
  else writeFileSync(join(path, 'History'), 'fixture marker');
}
describe('format-based browser profile discovery', () => {
  it('finds every Chromium profile even without bookmarks or a valid Local State', async () => {
    const base = root(),
      data = join(base, 'Vivaldi', 'User Data');
    chromium(join(data, 'Default'), true);
    chromium(join(data, 'Profile 2'));
    chromium(join(data, 'Custom-person'));
    writeFileSync(join(data, 'Local State'), '{broken');
    const found = await discoverProfiles([base]);
    expect(found).toHaveLength(3);
    expect(found.every((item) => item.browser === 'Vivaldi')).toBe(true);
    expect(
      readProfile(
        found.find((item) => item.path?.endsWith('Default'))!,
        ['bookmarks'],
      ).bookmarks,
    ).toHaveLength(1);
  });
  it('preserves profile names without using them as filesystem paths and rejects path traversal cache entries', async () => {
    const base = root(),
      data = join(base, 'Thorium', 'User Data');
    chromium(join(data, 'Profile 4'));
    writeFileSync(
      join(data, 'Local State'),
      JSON.stringify({
        profile: {
          info_cache: {
            'Profile 4': { name: 'Personal / custom label' },
            '../escape': { name: 'Invalid' },
          },
        },
      }),
    );
    const found = await discoverProfiles([base]);
    expect(found).toHaveLength(1);
    expect(found[0].profile).toBe('Personal / custom label (Profile 4)');
    expect(found[0].path).toBe(join(data, 'Profile 4'));
  });
  it('finds unknown forks, Opera root and side profiles, and portable folders with no product allowlist', async () => {
    const base = root();
    chromium(join(base, 'UnknownFork', 'User Data', 'Default'), true);
    chromium(join(base, 'Opera Software', 'Opera GX Stable'), true);
    chromium(join(base, 'Opera Software', 'Opera GX Stable', '_side_profiles', 'custom-side'));
    const found = await discoverProfiles([base, base]);
    expect(found).toHaveLength(3);
    expect(found.filter((item) => item.browser === 'Opera GX')).toHaveLength(2);
    expect(found.some((item) => item.browser.includes('Chromium-based'))).toBe(true);
    expect(await discoverProfiles([join(base, 'UnknownFork', 'User Data')])).toHaveLength(1);
  });
  it('reads all Firefox-family registrations including absolute external profiles and named profiles', async () => {
    const base = root(),
      external = root(),
      product = join(base, 'LibreWolf');
    mkdirSync(join(product, 'Profiles', 'abc.default'), { recursive: true });
    writeFileSync(join(product, 'Profiles', 'abc.default', 'places.sqlite'), 'fixture marker');
    writeFileSync(join(external, 'places.sqlite'), 'fixture marker');
    writeFileSync(
      join(product, 'profiles.ini'),
      `[Profile0]\nName=Primary\nIsRelative=1\nPath=Profiles/abc.default\n[InstallABC]\nDefault=Profiles/abc.default\n[Profile1]\nName=On another drive\nIsRelative=0\nPath=${external}\n`,
    );
    const found = await discoverProfiles([base]);
    expect(found).toHaveLength(2);
    expect(found.map((item) => item.profile).sort()).toEqual(['On another drive', 'Primary']);
    expect(found.every((item) => item.family === 'firefox')).toBe(true);
    expect(found.every((item) => item.browser === 'LibreWolf')).toBe(true);
  });
  it('ignores unsupported folders and caches and respects scan bounds', async () => {
    const base = root();
    chromium(join(base, 'Cache', 'fake-profile'));
    chromium(join(base, 'one', 'two', 'three'), true);
    mkdirSync(join(base, 'unsupported'), { recursive: true });
    writeFileSync(join(base, 'unsupported', 'Bookmarks'), 'not a browser bookmark database');
    expect(await discoverProfiles([base], { depth: 1, directories: 100 })).toEqual([]);
    expect(await discoverProfiles([base])).toHaveLength(1);
  });
});
