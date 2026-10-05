# Profile migration and installer updates

Validated on Windows on 2026-10-05, with Electron 44.5.1.

- TypeScript and ESLint checks passed.
- All 39 unit tests passed, including reading a Firefox SQLite fixture and rejecting unsafe bookmark/history URLs.
- All 24 local Electron integration flows passed in hidden windows. The new migration flow detected a temporary Firefox profile, previewed and imported its SQLite bookmarks/history and compressed session, restored a pinned suspended tab, preserved bookmark folders and skipped duplicate data. No real user profile was imported.
- The production build and NSIS setup build completed successfully.
- The installer checksum matches `release/latest.yml`. The packaged application contains the profile importer and `electron-updater`; its update configuration points to `Mangoxt/dot-browser`.
- Installer output: `release/Dot-Browser-Setup-1.0.0.exe`, 115,172,987 bytes. The installer is unsigned and was not launched during validation.

The update client checks on launch and every six hours, automatically downloads newer published releases and installs on normal application exit. It does not close browsing windows to install, and it does not reopen Dot after installation. The release workflow publishes the installer, blockmap and update metadata when a tag matching the package version is pushed.

The public repository and [v1.0.0 release](https://github.com/Mangoxt/dot-browser/releases/tag/v1.0.0) were published on 2026-10-05. The setup, blockmap and latest.yml asset hashes match the validated local files. The packaged application read the live GitHub update feed in a hidden test window and correctly reported local/remote version 1.0.0 without scheduling a same-version download. A newer-version download/install cycle has not yet been exercised. The first release used the validated local build; the queued Windows Actions job was canceled to avoid duplicate publication.

Profile migration covers bookmarks, history and open tabs. Passwords and cookies are not included. Firefox bookmarks preserve their immediate parent folder; Chromium bookmark imports retain folder paths. Up to 20,000 history entries are read, and up to 50 imported tabs are restored within the browser's 200-tab limit.
