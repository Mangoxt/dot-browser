import { build } from 'esbuild';
await build({
  entryPoints: ['src/main/main.ts', 'src/preload/preload.ts'],
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'electron-updater'],
  sourcemap: true,
});
