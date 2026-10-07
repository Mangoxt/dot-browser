import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const releases = JSON.parse(readFileSync('src/shared/releases.json', 'utf8'));
if (!releases.some((r) => r.version === version && r.changes?.length)) {
  throw new Error(`Add release notes for ${version} to src/shared/releases.json before building.`);
}
await build({
  entryPoints: ['src/main/main.ts'],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: [
    'electron',
    'electron-updater',
    'electron-chrome-extensions',
    'electron-chrome-web-store',
  ],
  sourcemap: true,
});
await build({
  entryPoints: ['src/preload/preload.ts'],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
});
