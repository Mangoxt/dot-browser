# Validation

The 1.0.2 profile discovery update passed 50 unit tests and 27 local application flows. See [PROFILE-DISCOVERY-AUDIT.md](PROFILE-DISCOVERY-AUDIT.md) for scope and limitations.

The 1.0.1 credential migration update passed 45 unit tests and 26 local application flows. See [PASSWORD-IMPORT-AUDIT.md](PASSWORD-IMPORT-AUDIT.md) for scope and limitations.

The automated audit runs against actual Electron processes and actual WebContentsViews. It uses a local HTTP server for reproducible navigation, downloads and permission flows. Test profiles are temporary and separate from real user data.

The initial audit passed 18 application flows plus opening all nine requested external websites. The generated record is in `test-results/audit.md`; screenshots show dark/light themes and narrow-window chrome. Opening a site does not verify logging into accounts, protected media playback, payments, file upload or every feature of that site.

The expanded final audit on Electron 44.5.1 passed 23 local application flows plus the external-site audit (24 flows total), including shortcut/workspace forms, side panels, native input shortcut dispatch, popup denial, background-tab suspension, HTML page saving, bookmark import/export and stopping a slow page load. All nine requested external sites opened. All 38 pure-logic/storage tests pass. The hidden development launch also passes. The earlier record is preserved in `docs/INITIAL-AUDIT.md`; the final regression record is in `docs/FINAL-AUDIT.md` and `test-results/audit.md`.

The user was playing a game during development and asked not to be interrupted. Visible testing was stopped and all created visible browser processes were closed. Subsequent app tests use hidden windows, without foreground activation, external app launches or actual print jobs. Native focus behavior, OS dialogs and high-DPI multi-monitor behavior therefore remain interactive checks for later. Do not describe those checks as completed.

Important regressions fixed during validation:

- Zod 4 field defaults inside partial objects reset unrelated preferences. IPC settings patches now remove defaults before making fields optional; a dedicated regression test covers this.
- Repeated view hiding/showing during commands disturbed Chromium operations. Layout now changes native view visibility and bounds only when needed.
- Electron's `findNext` flag starts a new search when true and advances an existing search when false. Find controls now translate their next/previous intent correctly.
- The Windows presence of `ELECTRON_RUN_AS_NODE`, even with an empty value, breaks Electron test launches. Development and test scripts remove it rather than set it to an empty string.
- Test automation originally addressed duplicate webpages by URL. It now uses the exact WebContents ID for each tab.
- Normal download filenames are allocated without overwriting existing files or another active transfer.

No native windows should be shown by `npm run test:e2e`. Normal `npm start`, `npm run dev`, and the portable executable open the browser intentionally.
