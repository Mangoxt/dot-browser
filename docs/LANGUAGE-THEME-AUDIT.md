# Dot Browser 1.0.7 language and webpage theme audit

Date: 2026-10-06. Windows x64, Electron 44.5.1. All automated browser windows used `DOT_TEST_HIDDEN=1`, isolated temporary application data and local fixture pages. Installed user browser profiles were not read or launched.

## Changes

- English, Turkish, German and French interface catalogs cover settings, toolbar, menus, dialogs, release history, native context menus and file chooser titles. Language changes apply immediately and survive restart. User page titles, imported content and external extension metadata retain their language. Technical error details that are not in the catalog use their original diagnostic text.
- Dark webpages are enabled by default. A main-process controller applies Chromium `Emulation.setAutoDarkModeOverride` and the matching `prefers-color-scheme` per WebContents. It reapplies after navigation, restored suspended tabs, settings changes and closing DevTools. System theme uses Electron's system dark preference. There is no remote preload, inversion stylesheet for the browser theme or page reload for a theme change. A boolean HTML attribute lets the optional legacy Night view stylesheet honor explicit light exceptions as well.
- Per-origin light exceptions are managed through Site information and Appearance settings. Disabling forced dark keeps the website's native dark preference when the browser is dark. The optional Night view extension only inverts light-mode pages, avoiding a second inversion when native dark rendering is active.
- Copy page link uses the current WebContents URL. Read later creates a bookmark in Reading list and deduplicates that URL in the folder. Private windows retain their existing in-memory bookmark/settings behavior.
- Canned promotional wording was replaced with direct labels. The stale Extensions settings row now opens the extension manager. Settings section links also update the currently open settings tab.

## Validation

- Typecheck and lint: passed.
- Unit suite: 65 tests passed. Catalog checks verify all static translated controls, release notes, complete four-language entries and matching substitution parameters. User parameter contents are preserved.
- Local browser audit: all 31 flows passed, including real Chromium navigation, session recovery, downloads, permissions, private isolation, profile import, locked database recovery, encrypted password import and origin-constrained fill.
- Language/theme integration: all four languages change visible UI without restarting; Turkish selection survives restart. The native paint of a white fixture becomes dark, its PNG image pixel remains unchanged, and typed input survives the theme change. A site-information exception restores light rendering. Native CSS dark preference, actual suspend/resume, clipboard dispatch and duplicate reading-list prevention pass.
- All four localized menus stay within an 820 × 620 window at 130% interface text size. Turkish settings and German menu captures were inspected locally.
- Extension suite: built-in/custom loading, enable/disable/remove, restart persistence, private rejection and narrow menu passed. Night view still inverts in light mode and has no inversion filter in dark mode.
- Motion suite: entry/exit, reopening, stable native page bounds, reduced motion, keyboard dismissal and scoped import cleanup passed.
- Release notice: onboarding baseline, one-time upgrade popup, persistence and manual release history passed with localized English text.
- Packaged NSIS output: the four-language/theme suite also passes against `release/win-unpacked/Dot Browser.exe`, including an enabled Night view extension with a light exception, preservation of a manually changed input value and page marker, PNG colors, actual tab suspension/recreation and localized menu bounds.

The final local installer is 115,300,302 bytes. SHA-256: `9bc09cc3cb3252f01965a6e8f72669a6c36d50fe61bed88c719c4001af1d06b8`.

## Published build

[Release v1.0.7](https://github.com/Mangoxt/dot-browser/releases/tag/v1.0.7) is public. [Windows setup](https://github.com/Mangoxt/dot-browser/releases/download/v1.0.7/Dot-Browser-Setup-1.0.7.exe), blockmap and `latest.yml` all match the local sizes and SHA-256 digests reported by GitHub. The public setup URL returns HTTP 200. Release source commit: `d5fd6e9b0bd10f5cd74f3f52c37750fa4f9fb665`.

A separate hidden packaged process simulated installed version 1.0.6 with downloads and installation disabled. The actual public GitHub update feed returned version 1.0.7 and `Dot-Browser-Setup-1.0.7.exe`. No user installation was changed or restarted.

## Boundaries

Website styling remains site-dependent; use a light exception for sites that do not render well. DevTools can temporarily own page emulation until it closes. Actual OS dialogs, installed-user update/relaunch behavior, OS focus and multi-monitor scaling are not driven by the hidden tests. File dialogs and clipboard writes in new integration tests are stubbed where applicable; downloaded programs are never executed.
