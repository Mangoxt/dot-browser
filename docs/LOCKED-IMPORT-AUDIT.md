# Locked profile import — 1.0.3

Validated on Windows on 2026-10-06 with Electron 44.5.1. TypeScript and ESLint passed; all 52 unit tests and 28 hidden local Electron integration flows passed. Source profiles were fabricated and no installer was launched.

The user reported “database is locked” when reading a detected profile. The original reader aborted the entire preview if one category failed. Categories now fail independently: readable bookmarks or tabs remain available, and skipped data is identified in the preview and import report. If no data can be read, an actionable error replaces an empty import. Locked-category messages ask the user to completely close the source browser, including background processes, and preview again.

A second regression was exposed while testing Chromium history: its microsecond timestamps since 1601 exceed JavaScript's safe integer range. SQLite statements now read integers as BigInt, and the importer converts numeric fields into the existing millisecond/count representation. No raw BigInt is exposed through IPC or stored in browser JSON.

Unit tests hold a real exclusive SQLite lock, verify partial bookmark import, verify an actionable history-only failure and verify history after releasing the lock. Another regression test preserves readable history when the bookmark JSON is malformed, without echoing its contents. The Electron integration test holds an exclusive History database lock in another process, previews/imports a readable bookmark and then previews/imports the large-timestamp history row after releasing the lock.

Source databases remain read-only. Locks are not bypassed, source processes are not terminated, and live SQLite files are not copied as an unsafe workaround. The [SQLite WAL documentation](https://www.sqlite.org/wal.html) describes locking behavior; [Node's SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) describes integer handling. History in a still-locked source database requires closing the source browser before retrying.

The 1.0.3 NSIS installer and update assets were built successfully. The installer is unsigned and was not executed.

The public [1.0.3 release](https://github.com/Mangoxt/dot-browser/releases/tag/v1.0.3) includes the setup, blockmap and latest.yml. Public API digests match local files and the setup download returned HTTP 200. Setup size: 115,188,866 bytes; SHA-256: `da0f5fa030df5cd2ef3c0f93af370e7d7bc31e75781933b2966145835d6f2c65`. The packaged application read the live update feed in a hidden temporary profile and reported local/remote version 1.0.3 without scheduling a same-version download. The local build was published after canceling the redundant Actions job.
