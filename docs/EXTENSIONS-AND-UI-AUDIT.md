# Extensions and navigation cleanup — 1.0.5

The toolbar now keeps navigation, address/bookmark, downloads, extensions and the browser menu. Passwords, profile/import, libraries and settings have labeled menu entries. Reading, split view, find, PDF/HTML saving, print, mute/pin and zoom live under Page tools. The new-tab page prioritizes search and shortcuts, with decorative rings, large marketing text and redundant footer library buttons removed.

The extension manager loads compatible unpacked extension folders through Electron's persistent personal session. Folder locations stay in main-process storage, not renderer snapshots. Native folder selection grants the chosen path; renderer commands cannot supply an arbitrary path. Install/toggle/remove operations are serialized across windows. Extensions reload at startup, missing folders report a per-extension error, and private windows reject mutation commands and use a separate session with no extensions. Local file access is disabled. Removing an extension unloads it and removes registration; it does not delete the user's source folder. Existing pages need a reload to clear or receive injected content.

Two optional bundled Manifest V3 content extensions provide night rendering and a scroll-to-top button. They require no background service, external network or browser account. Their files are unpacked alongside the application so Chromium can load them from disk in the setup distribution.

Electron does not implement all Chrome extension APIs; Chrome Web Store and .crx installation are not provided. See https://www.electronjs.org/docs/latest/api/extensions/ and https://www.electronjs.org/docs/latest/api/extensions-api . The manager states this limitation before installation.

Validation: all 61 unit tests, TypeScript and ESLint pass. All 31 local production integration flows pass. `scripts/extensions-check.mjs` validates the clean menu, real bundled script/CSS injection, enable/disable/remove, custom folder installation, duplicate rejection, persistence after restart, private-window rejection and a menu inside a narrow viewport. `scripts/release-notice-check.mjs` checks the once-per-version popup lifecycle. Screenshots of the menu, new-tab and extension manager were visually inspected.

Tests use hidden windows, stubbed file dialogs and disposable profiles. Existing user browsers and installed programs remain open and untouched.


The same extension lifecycle checks also pass against release/win-unpacked/Dot Browser.exe with DOT_PACKAGED=1, including bundled files under app.asar.unpacked. Automatic installation is disabled in this isolated packaged test.

