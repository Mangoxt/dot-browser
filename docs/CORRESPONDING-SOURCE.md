# Corresponding source for Dot Browser 1.3.2

Dot Browser 1.3.2 is licensed GPL-3.0-only. The release provides
`Dot-Browser-Source-1.3.2.zip` alongside its installer. It contains the tagged Dot
source (including build scripts, lockfile, assets and licenses) and unmodified
source archives for the GPL extension bridge and MPL filtering engine.

Exact upstream revisions:

- electron-chrome-extensions 4.9.0:
  https://github.com/samuelmaddock/electron-browser-shell/tree/927ac340c3c6cc462f636a50ccd9991df0cd2e12
  (package at `packages/electron-chrome-extensions`; this is the 4.9.0 release commit).
- @ghostery/adblocker 2.18.2:
  https://github.com/ghostery/adblocker/tree/c4c20aa63e3a72113f66777cf35a3f58877a36ee
  (package at `packages/adblocker`; revision reported by the npm release).
- Bundled EasyList/EasyPrivacy:
  https://github.com/easylist/easylist/tree/5826a01119b8769f86ed191181537914362f000c
  The exact combined text files, attribution and GPL option are in
  `assets/filter-lists` in the Dot source archive. Runtime downloaded updates
  retain the original list license and author headers.

Build Dot on Windows with Node.js 24, from the Dot source folder:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run package:setup
```

The lockfile pins all packages and integrity hashes. The unmodified bridge's
source includes its own package scripts, TypeScript, renderer/preload sources
and monorepo workspace configuration. The engine archive likewise includes its
workspace packages and build configuration. Upstream archives and their
licenses are preserved without modification. Electron/Chromium notices and
other dependency licenses also accompany the installed application.

The public repository tag `v1.3.2` identifies the same Dot source as the archive:
https://github.com/Mangoxt/dot-browser/tree/v1.3.2
