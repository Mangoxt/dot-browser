# Dot Browser

A real Windows desktop browser powered by Electron and Chromium, with an original, quiet interface. Websites live in independent **WebContentsViews**; React draws the browser interface. There are no webpage iframes, webview tags, simulated websites, or renderer-side filesystem APIs.

[Download the Windows setup installer](https://github.com/Mangoxt/dot-browser/releases/latest) from GitHub Releases.

## Run

Use Node.js 22.12 or newer and Windows 10/11 x64.

```sh
npm install
npm run dev
```

Development mode serves the interface on `127.0.0.1:5173` with React hot reload. Restart the command after changing main-process or preload source.

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm start
npm run test:e2e
npm run package
npm run package:setup
```

The Windows setup installer is `release/Dot-Browser-Setup-1.0.9.exe`. Portable builds use `release/Dot-Browser-<version>-portable.exe`. The executables are unsigned unless you supply a signing certificate to electron-builder.

### Automatic updates for installed copies

The setup installer uses `electron-updater` and public GitHub Releases. Before building it, set `DOT_GITHUB_REPOSITORY` to `owner/repo` or add the public GitHub URL in the `repository` field of `package.json`. The build embeds that repository in `app-update.yml`. A missing repository stops setup packaging rather than producing an installer with a broken update address.

Installed copies check on startup and every six hours, automatically download newer releases, then install the downloaded update when the app exits. Downloads do not close browsing windows. Dot stays closed after that installation. Portable builds do not use this installer update flow.

For each release, increase the version in `package.json`, add that version and its actual changes to `src/shared/releases.json`, and publish the setup executable, its blockmap and `latest.yml` together. `npm run package:setup` builds these files without publishing. `npm run release:setup` publishes them to the configured GitHub repository using a `GH_TOKEN` supplied in the environment. Never put a publishing token in the application or repository. The release workflow can perform this when a matching `v1.0.1` version tag is pushed.

Run `npm version patch --no-git-tag-version`, add the matching changelog entry, validate and commit the changes, create the matching version tag, then run `git push origin main --follow-tags` to start the GitHub release workflow. The first release was uploaded from the validated local build while the Windows runner was queued.

**Integration tests use hidden windows** to avoid stealing focus, temporary profiles outside the project, and a local HTTP fixture server. They write screenshots and a detailed audit under `test-results/`. The external-site audit uses the current network and does not bypass access restrictions. Running the normal application or development command intentionally opens a browser window.

## What works

- Search open tabs across workspaces by title, URL or workspace name with Ctrl+Shift+A; use arrow keys and Enter to switch. Reading view (Ctrl+Shift+M) displays extracted article text with adjustable type size and estimated reading time while preserving the original page. Save as PDF (Ctrl+Shift+S) writes a real Chromium PDF through a file picker. All three are available in the browser menu and command palette. Reading view depends on extractable page text and does not bypass service access restrictions.

- Real Chromium navigation, redirects, back/forward, reload/stop, external-protocol confirmation, download responses, recoverable network errors and crashed-page recovery.
- An omnibox with URL/domain/localhost/IP parsing, history/bookmark/open-tab/search suggestions, highlighted matches and keyboard selection. Google, Bing, DuckDuckGo, Brave, YouTube and GitHub keywords are included; custom engines can be added or edited.
- Multiple persistent tabs, horizontal or vertical layouts, pinning, muting, audio indicators, drag ordering, duplication, recently closed tabs, tab context menus, groups, a keyboard command palette and cross-workspace tab search.
- Workspaces with editable names, icons and colors, ordering, independent tabs and preservation of live pages when switching. Removing a workspace moves its tabs to another workspace.
- Two live web tabs in side-by-side or stacked split view, independent navigation, selectable ratios, swapping and a draggable/keyboard-resizable divider. Split view requires two web tabs in the same workspace.
- History with visit counts, local calendar groups, filtering, selection/deletion, opening and copying. Browser migration detects compatible Chromium and Firefox storage formats without a fixed product allowlist and lists each profile separately. Opera/GX, Vivaldi, Chromium, Yandex, Thorium, LibreWolf, Waterfox, Floorp, Zen and other compatible forks can be discovered alongside Chrome, Edge and Brave, including release channels and named profiles. A Choose browser folder option handles portable installations and custom locations. Preview/import supports bookmarks, browsing history and open tabs. A Netscape HTML bookmark import/export option is also available for browsers with other storage formats.
- Password CSV import from Chrome, Edge, Brave and Firefox exports, encrypted storage with the operating-system account, search, reveal/hide, copy and delete. The toolbar's Saved passwords button fills a single matching login form after an explicit user action, checks the exact origin and form action, and does not submit the form. Exported cookie JSON and Netscape TXT files can also be imported; some sites still require a fresh login. Protected profile password/cookie databases are not decrypted directly.
- Real downloads with progress, measured transfer speed, pause/resume/cancel, retry, open/reveal and persistent records. Automatic saves choose a unique filename. Interrupted downloads after restart can be retried; active transfers are not resumed automatically across application restarts.
- Find in page, Chromium page zoom, developer tools, inspect element, source view, save complete HTML pages, native print dialogs, window controls and fullscreen. Chromium's media APIs handle supported picture-in-picture behavior.
- New tab clock/date, editable/reorderable shortcuts, recent sites, quiet background choices and utility actions. A resizable side panel offers bookmarks, history, downloads and tabs.
- Dark/light/system themes, accents, compact chrome, animation/reduced-motion support, typography scale, sidebar width, bookmark bar, background, home/search/startup/download/privacy preferences and one-step onboarding.
- Normal and isolated private windows. Private history, searches, downloads metadata and tab recovery are never written to normal browser storage. Downloaded files remain on disk; shared bookmark/settings copies in private windows are changed only in memory. Closing a private window clears its temporary session storage and cache.
- Site permission prompts with once/remembered allow/block, reset controls, cookie inspection/removal, popup allowlists and opt-in domain-based request filtering. The filter is basic blocking, not comprehensive ad/tracker protection. Device selection and screen sharing are denied until a proper chooser is implemented.
- Normal multi-window session recovery, window bounds, selected workspace/tab, pinned/muted states and zoom survive restart. Idle silent background tabs can be suspended after 20 or 5 minutes. Suspended pages reload their saved URL; their forms and native back stack do not survive suspension or an application restart.
- A task manager displays actual Chromium process IDs and tab status. It does not invent memory statistics.

## Architecture and security

`src/main/` owns windows, tab WebContentsViews, sessions, downloads, permissions and storage. `src/preload/` exposes only `snapshot`, validated `command`, and two event subscriptions. `src/shared/` defines storage/IPC schemas and URL logic. `src/renderer/` contains browser chrome, internal pages, components, styles and Zustand state.

Both chrome and webpages have context isolation, sandboxing and Node integration disabled. **Only the trusted interface receives the preload bridge.** Every main-process IPC request checks the sender WebContents, the main frame and the expected local interface URL, then validates its typed payload with Zod. Chrome navigation and window creation are denied; internal `browser://` pages never reach a remote website. Remote tabs have no Node or bridge access. Dangerous protocols are rejected. TLS certificate checks and Chromium web security are kept enabled. Executable downloads ask before opening.

The user data lives in Electron's system `userData` directory, normally `%APPDATA%/Dot Browser`, with Chromium data in its profile partition. JSON writes use a flushed temporary file, atomic replacement and a previous-file backup. Independent valid sections can be recovered from partially corrupt storage. Logs include lifecycle and errors, without form contents or passwords.

Storage clearing time ranges apply to history. Electron exposes all-time clearing for the cache and site storage used here; the dialog labels this explicitly. Open tabs are saved again for subsequent crash recovery after restore records are cleared. Permission grants last until navigation when allowed once. Chromium may restrict cookie clearing to its origin/domain rules.

The [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [webContents](https://www.electronjs.org/docs/latest/api/web-contents) and [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) documentation describe the native APIs behind this architecture.

For custom profile locations, select the profile directory or its parent user-data directory in Import browser → Choose browser folder. The source browser can show its profile path: [Vivaldi's About page](https://help.vivaldi.com/desktop/install-update/full-reset-of-vivaldi/), [Opera's About page](https://help.opera.com/en/opera36/find-solutions/), or [Firefox's Troubleshooting Information](https://support.mozilla.org/en-US/kb/profiles-where-firefox-stores-user-data). Automatic scanning covers standard application-data roots, skips caches and symlinked children, and is bounded to 10 levels and 20,000 directories. Deep or unusually located profiles can be selected directly. Discovery identifies compatible data formats; compatibility with every historical or future browser version is not guaranteed.

## Deliberately unavailable

Account sync and additional persistent user profiles are not implemented. Automatic password capture and automatic page-load autofill are not implemented. Additional profiles can be added by giving each profile its own Storage and `persist:` session partition; private windows already exercise separate ephemeral sessions.

Protected streaming, OAuth policies, bot challenges and other service-side restrictions may limit custom Electron clients. Do not assume that loading Spotify or YouTube proves protected media playback works. Native print/save dialogs, external-app launches, actual screen sharing, audio hardware, OS focus behavior and 125%/150% multi-monitor scaling require interactive hardware validation. Tests never launch external apps or execute downloaded programs.




After each installed update, Dot shows a one-time **What’s new?** changelog in the selected interface language. Reopen it from About. Every release must add its actual changes to src/shared/releases.json before building.


Extensions: open the puzzle icon or Browser menu → Extensions. Optional bundled Night view and Back to top extensions can be added, disabled or removed. Compatible unpacked Chrome extension folders can be loaded; Chrome Web Store and .crx installation are not supported. Changes apply to pages on reload, and extensions stay disabled in private windows. Keep an external extension's selected folder in place for future launches.

Language: Settings → Languages changes menus, settings, dialogs, native context menus, release notes, accessibility labels and dates immediately. English, Turkish, German and French are included. Site content, imported data and external extension metadata retain their original language.

Webpage theme: Settings → Appearance → Dark webpages is enabled by default. Chromium's native dark renderer and color-scheme preference follow the browser's dark/light/system theme. Use Site information → Keep this site light for per-origin exceptions. Switching themes preserves live page state. The optional Night view extension only inverts light-mode pages, avoiding a second inversion of native dark pages. Some sites may need an exception; DevTools can temporarily own page emulation until closed.

Browser menu → Page tools offers Copy page link and Read later. Reading-list entries are local bookmarks in the Reading list folder; saving the same URL twice does not create duplicate reading-list entries.
