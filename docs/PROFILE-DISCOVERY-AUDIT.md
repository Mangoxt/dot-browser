# Expanded profile discovery — 1.0.2

Validated on Windows on 2026-10-06 with Electron 44.5.1. TypeScript and ESLint passed, along with 50 unit tests and 27 hidden local Electron integration flows. Test profiles were fabricated; no real browser was opened and no installer was executed.

Discovery now recognizes Chromium and Firefox storage formats instead of limiting imports to four product paths. It scans standard application-data roots asynchronously, lists separate profiles with their recorded names, and keeps actual source paths in the main process rather than deriving paths from display labels. History-only profiles, corrupt or absent Chromium Local State files, Opera-style root and side profiles, unknown compatible forks, Firefox-family profiles.ini registrations and absolute external profiles are covered by tests. Product names are display labels, not an import allowlist.

Choose browser folder supports portable installs, custom locations and either a single profile or a parent folder containing several profiles. The integration test added two portable profiles through a stubbed directory picker, selected the second by name, imported its actual bookmarks and confirmed that adding the same folder again did not duplicate entries. Existing password, cookie and restart tests still passed.

Automatic scanning skips caches and symlinked child folders and is bounded to 10 levels and 20,000 directories. Select a specific folder for unusually deep or relocated data. This does not guarantee native database compatibility with every browser engine or every historical/future version. Other engines can use the existing HTML bookmark import and compatible exported password/cookie files. Protected password databases are still handled through password CSV export/import.

The 1.0.2 NSIS setup, blockmap and latest.yml were built successfully; the installer hash matches the update metadata. The setup is unsigned and was not launched.

The public [1.0.2 release](https://github.com/Mangoxt/dot-browser/releases/tag/v1.0.2) contains all three update assets. Their public API digests match the validated local files, and the installer download returned HTTP 200. The setup is 115,187,053 bytes with SHA-256 `1c18a52a808392dedbc3f84541ae2b2937756946f98f1f902649b84aab1e179d`. A packaged application check in a hidden temporary profile read the live GitHub update feed and reported local/remote version 1.0.2 without scheduling a same-version download. The validated local build was uploaded manually after canceling the redundant Actions job.
