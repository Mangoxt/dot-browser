# Dot Browser 1.0.8 interface audit

Date: 2026-10-07. Windows x64, Electron 44.5.1. Tests use hidden windows, isolated temporary data and owned fixtures. The installed user browser is not launched or modified.

## Interface changes

- Horizontal tabs keep a readable minimum width and expose left/right overflow controls. Selection brings the active tab into view; unrelated state changes preserve manual scrolling. The tab strip supports arrow keys, Home and End, with a single entry point for tab selection. Vertical strips use up/down keys. The search icon opens the actual tab search dialog with its correct shortcut.
- New tab shortcuts are responsive cards with a title, site address and editable controls. Bookmarks, history and downloads have direct access. Recent entries show their title and host, with duplicate URLs removed from the displayed list.
- Settings navigation includes a localized section search, selected-section semantics and persistent section URLs. Empty results are explicit. Narrow layouts place setting controls below their labels; new type sizes follow the interface scale.
- Viewport changes update horizontal/vertical tab placement immediately. The hidden sidebar is unmounted at the narrow breakpoint, eliminating its duplicate tab list and keyboard targets.
- Release notes cover these changes in all four interface languages.

## Verification

Source interface integration passes: light/dark captures, owned site cards, library navigation, English/Turkish section search including Turkish case handling, empty results, settings URL links, 130% text at 760 × 600, tab overflow, active-tab visibility, preserved manual scrolling, horizontal/vertical keyboard selection, the tab search button and resizing between vertical and horizontal layouts. All windows remain hidden.

The general browser audit passes all 31 flows. Source typecheck, lint and 65 unit tests pass. Release popup integration passes onboarding, upgrade notes, once-per-version persistence and manual history.

Visual captures were inspected for dark new tab cards and narrow settings/tab placement. Native file dialogs and actual installed-app update/restart are outside this hidden interface audit.
## Packaged interface validation

The same interface integration passes against `release/win-unpacked/Dot Browser.exe`. Captures of its light/dark new tab cards and narrow layout were inspected. Packaged screenshots use Electron's `capturePage` with `stayHidden` and `stayAwake`; a Playwright screenshot timed out on a hidden packaged window, so capture does not depend on making a window visible.

The source motion and language/theme integrations also pass: animation/reduced-motion behavior, stable native bounds, four live interface languages, persisted language, native dark rendering, site light exceptions and preserved webpage input/image colors.

Installer size: 115,304,221 bytes. SHA-256: `7cb64cff578b70309e5008e7d7b77ff9a32cc7338e3050a0fff6fef0d6532a91`.
Packaged language/theme integration passes, including restart persistence and four localized menus at 820 × 620. The restart harness now selects the trusted `dist/renderer/index.html` interface explicitly: a restored WebContentsView can be reported before the browser window. Earlier timeouts selected that webpage rather than the interface.
## Published build

[Release v1.0.8](https://github.com/Mangoxt/dot-browser/releases/tag/v1.0.8) is public. [Windows setup](https://github.com/Mangoxt/dot-browser/releases/download/v1.0.8/Dot-Browser-Setup-1.0.8.exe), blockmap and `latest.yml` match the verified local sizes and SHA-256 digests returned by GitHub. The setup URL returns HTTP 200. Release source commit: `320f39cd1af9ef4e525848265224756a3032c908`.

The real packaged updater, in a separate hidden temporary profile simulating installed version 1.0.7, detects version 1.0.8 and the correct installer filename. Downloads and installation were disabled during this verification. The user installation was not restarted or modified.

Tab-strip keyboard selection was tested on internal tabs. Foreground OS focus and navigation between native webpage views are not driven by these hidden interface tests; selecting a web tab retains the existing native-page focus behavior.
