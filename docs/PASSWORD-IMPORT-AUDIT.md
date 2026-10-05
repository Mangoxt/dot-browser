# Password and cookie migration — 1.0.1

Validated on Windows on 2026-10-06 using Electron 44.5.1. All application windows remained hidden, test profiles were temporary, file dialogs were stubbed and no installer was launched.

- TypeScript and ESLint passed. All 45 unit tests and 26 local Electron integration flows passed.
- Chrome-style quoted CSV and Firefox-style exports are parsed without trimming passwords. BOMs, escaped quotes, commas and multiline values are covered. Unsupported URLs, URLs with embedded credentials, oversized fields and empty passwords are rejected or skipped.
- Passwords are encrypted using Electron's asynchronous safeStorage API and the operating-system account before persistence. The integration test confirmed ciphertext in browser-data.json, no plaintext in snapshots or login lists, and successful decryption after a full restart.
- The trusted password manager supports search, show/hide, copy, delete and explicit form fill. Copy clears the clipboard after 30 seconds only if it still contains that password. Revealed passwords hide after 30 seconds. Clipboard behavior was not exercised against the user's live clipboard.
- The integration test verified correct username/password fill without submitting, rejection on another origin and rejection of a form posting to another origin. Ambiguous forms, signup forms and multiline passwords are not filled. No automatic password capture or automatic page-load autofill is implemented.
- Exported cookie JSON and Netscape TXT are supported. The integration test imported a cookie into Chromium and confirmed it on the matching page; canceled previews could not be applied. Protected source-browser password/cookie databases are not decrypted directly. Some server sessions still require a fresh sign-in.
- The 1.0.1 NSIS setup and update blockmap were built successfully. The installer is unsigned. The update configuration points to Mangoxt/dot-browser.

Migration path: Bookmarks → Import browser → Passwords and cookies → Import password CSV → Import. Export the CSV from the previous browser's password manager first. CSV exports contain readable passwords; delete the exported file when it is no longer needed. Use the toolbar's Saved passwords button to manage or fill imported credentials.

Source data for all tests was fabricated. No real user browser passwords or cookies were read or imported.
