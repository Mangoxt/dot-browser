import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ImportSource } from '../shared/import';
import { object } from './import-formats';

const excluded = new Set([
  'cache',
  'cache2',
  'code cache',
  'gpucache',
  'shadercache',
  'service worker',
  'extensions',
  'node_modules',
  '.git',
  'crashpad',
  'crash reports',
  'temporary internet files',
  'indexeddb',
  'local storage',
  'session storage',
  'blob_storage',
  'storage',
  'network',
  'dot browser',
  'dot-browser',
  'dot-browser-updater',
]);
const products: [RegExp, string][] = [
  [/opera[ /_-]*gx/i, 'Opera GX'],
  [/opera[ /_-]*stable/i, 'Opera'],
  [/opera[ /_-]*developer/i, 'Opera Developer'],
  [/opera[ /_-]*beta/i, 'Opera Beta'],
  [/opera/i, 'Opera'],
  [/chrome sxs/i, 'Chrome Canary'],
  [/chrome[ /_-]*beta/i, 'Chrome Beta'],
  [/chrome[ /_-]*dev/i, 'Chrome Dev'],
  [/chrome/i, 'Chrome'],
  [/edge[ /_-]*sxs/i, 'Edge Canary'],
  [/edge[ /_-]*beta/i, 'Edge Beta'],
  [/edge[ /_-]*dev/i, 'Edge Dev'],
  [/edge/i, 'Edge'],
  [/brave-browser-nightly/i, 'Brave Nightly'],
  [/brave-browser-beta/i, 'Brave Beta'],
  [/brave/i, 'Brave'],
  [/vivaldi/i, 'Vivaldi'],
  [/chromium/i, 'Chromium'],
  [/yandex/i, 'Yandex'],
  [/thorium/i, 'Thorium'],
  [/supermium/i, 'Supermium'],
  [/slimjet/i, 'Slimjet'],
  [/coccoc/i, 'Coc Coc'],
  [/whale/i, 'Whale'],
  [/centbrowser/i, 'Cent Browser'],
  [/avast/i, 'Avast Secure Browser'],
  [/avg/i, 'AVG Secure Browser'],
  [/comodo/i, 'Comodo'],
  [/epic/i, 'Epic'],
  [/sidekick/i, 'Sidekick'],
  [/(?:^|\/)arc(?:\/|$)|thebrowsercompany/i, 'Arc'],
  [/orbitum/i, 'Orbitum'],
  [/librewolf/i, 'LibreWolf'],
  [/waterfox/i, 'Waterfox'],
  [/floorp/i, 'Floorp'],
  [/mullvad/i, 'Mullvad Browser'],
  [/zen[ /_-]*browser|(?:^|\/)zen(?:\/|$)/i, 'Zen'],
  [/palemoon|pale moon/i, 'Pale Moon'],
  [/basilisk/i, 'Basilisk'],
  [/seamonkey/i, 'SeaMonkey'],
  [/icecat/i, 'IceCat'],
  [/firefox/i, 'Firefox'],
];
function browserLabel(path: string, family: ImportSource['family']) {
  const normalized = path.replace(/\\/g, '/');
  const known = products.find(([pattern]) => pattern.test(normalized));
  if (known) return known[1];
  let candidate = basename(path);
  if (/^(default|profile(?:[ -].*)?|.*\.default.*|[a-f0-9-]{20,})$/i.test(candidate))
    candidate = basename(dirname(path));
  if (/^(user data|profiles|_side_profiles)$/i.test(candidate))
    candidate = basename(dirname(dirname(path)));
  return `${candidate || 'Custom browser'} (${family === 'firefox' ? 'Firefox-based' : 'Chromium-based'})`;
}
async function smallText(path: string): Promise<string> {
  if ((await stat(path)).size > 4 * 1024 * 1024) throw new Error('Profile metadata is too large');
  return readFile(path, 'utf8');
}
function defaultRoots(): string[] {
  const home = homedir();
  if (process.platform === 'win32')
    return [process.env.LOCALAPPDATA, process.env.APPDATA].filter(
      (value): value is string => !!value,
    );
  if (process.platform === 'darwin') return [join(home, 'Library/Application Support')];
  return [
    process.env.XDG_CONFIG_HOME || join(home, '.config'),
    join(home, '.mozilla'),
    join(home, '.var/app'),
    join(home, 'snap'),
  ];
}

// Detect storage formats rather than requiring a browser to appear in a fixed allowlist.
// A selected portable/custom folder uses the same bounded scan as the automatic roots.
export async function discoverProfiles(
  searchRoots = defaultRoots(),
  limits = { depth: 10, directories: 20000 },
): Promise<ImportSource[]> {
  const sources: ImportSource[] = [];
  const seenDirectories = new Set<string>(),
    seenProfiles = new Set<string>();
  const labels = new Map<string, string>();
  const browserHints = new Map<string, string>();
  const key = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  const queue = searchRoots.map((path) => ({ path: resolve(path), depth: 0 }));
  const add = (path: string, family: ImportSource['family'], label?: string) => {
    if (seenProfiles.has(key(path))) return;
    seenProfiles.add(key(path));
    sources.push({
      id: randomUUID(),
      browser: browserHints.get(key(path)) || browserLabel(path, family),
      profile:
        label ||
        labels.get(key(path)) ||
        (basename(path) === 'Default' ? 'Default profile' : basename(path)),
      family,
      path,
    });
  };
  for (let index = 0; index < queue.length && seenDirectories.size < limits.directories; index++) {
    const item = queue[index];
    let path: string, entries;
    try {
      path = await realpath(item.path);
      if (seenDirectories.has(key(path))) continue;
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      continue;
    }
    seenDirectories.add(key(path));
    const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    if (files.has('Local State')) {
      try {
        const info = object(
          object(object(JSON.parse(await smallText(join(path, 'Local State')))).profile).info_cache,
        );
        for (const [folder, value] of Object.entries(info)) {
          if (!folder || folder === '.' || folder === '..' || /[\\/]/.test(folder)) continue;
          const name = object(value).name;
          if (typeof name === 'string' && name)
            labels.set(key(join(path, folder)), `${name.slice(0, 100)} (${folder})`);
        }
      } catch {
        /* Directory discovery still works with a corrupt Local State file. */
      }
    }
    if (files.has('profiles.ini')) {
      try {
        const text = await smallText(join(path, 'profiles.ini'));
        for (const section of text.split(/^\s*\[/m).slice(1)) {
          if (!/^Profile[^\]]*\]/i.test(section)) continue;
          const values = Object.fromEntries(
            section.split(/\r?\n/).flatMap((line) => {
              const match = line.match(/^\s*(Name|Path|IsRelative)\s*=\s*(.*?)\s*$/i);
              return match ? [[match[1].toLowerCase(), match[2]]] : [];
            }),
          );
          if (!values.path) continue;
          const registered =
            values.isrelative === '0' || isAbsolute(values.path)
              ? resolve(values.path)
              : resolve(path, values.path);
          labels.set(key(registered), values.name || basename(registered));
          browserHints.set(key(registered), browserLabel(path, 'firefox'));
          queue.push({ path: registered, depth: 0 });
        }
      } catch {
        /* Sibling profile discovery remains available. */
      }
    }
    if (files.has('places.sqlite')) add(path, 'firefox');
    else if (
      (files.has('Preferences') &&
        (labels.has(key(path)) ||
          ['History', 'Bookmarks', 'Login Data', 'Cookies'].some((name) => files.has(name)) ||
          entries.some((entry) => entry.name === 'Sessions' && entry.isDirectory()))) ||
      files.has('Bookmarks')
    ) {
      let valid = files.has('Preferences');
      if (!valid) {
        try {
          valid = !!object(JSON.parse(await smallText(join(path, 'Bookmarks')))).roots;
        } catch {
          /* Not a Chromium bookmark file. */
        }
      }
      if (valid) {
        let label = labels.get(key(path));
        if (!label && files.has('Preferences')) {
          try {
            const name = object(
              object(JSON.parse(await smallText(join(path, 'Preferences')))).profile,
            ).name;
            if (typeof name === 'string' && name)
              label = `${name.slice(0, 100)} (${basename(path)})`;
          } catch {
            /* Use directory name. */
          }
        }
        add(path, 'chromium', label);
      }
    }
    if (item.depth >= limits.depth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || excluded.has(entry.name.toLowerCase()))
        continue;
      if (queue.length < limits.directories * 2)
        queue.push({ path: join(path, entry.name), depth: item.depth + 1 });
    }
  }
  return sources.sort(
    (a, b) => a.browser.localeCompare(b.browser) || a.profile.localeCompare(b.profile),
  );
}
