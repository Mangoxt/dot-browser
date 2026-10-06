# Dot Browser 1.0.9 home page audit

Date: 2026-10-07. Windows x64, Electron 44.5.1. All browser checks use hidden windows and isolated temporary data. Screenshots contain only the app interface and owned fixture content.

## Changes

- The new-tab home page has a framed search area, a localized clock/date, current workspace label, separate shortcut and reading-list sections, and subtle static orbital details. Plain/grid/orbital background choices remain available. There is no continuous background animation.
- Reading-list cards use existing bookmarks in the Reading list folder. They open the saved URL; an empty list explains the existing Read later action. Recent owned history displays page titles and hosts.
- The horizontal new-tab button sits before the tab strip and its overflow controls. It remains visible independently of tab scrolling. Vertical layouts retain one new-tab button on the left of their bottom controls.
- New text and the matching release notes are translated into English, Turkish, German and French. User workspace names, bookmark titles and URLs remain unchanged.

## Source verification

Typecheck, lint and 65 unit tests pass. The interface integration opens a real local saved page from the reading list, verifies its history entry, checks all three background options, four languages at 130% text size, the left button's position and creation action with overflowing tabs, existing library actions, settings search, tab scrolling and responsive vertical layout. All windows remain hidden.

Default dark home and narrow light home captures were inspected. The home page scrolls vertically when content exceeds the viewport; it does not create horizontal overflow at 760 × 600. OS focus, native dialogs and installation/relaunch of the user's existing app are not driven by these checks.
The source motion and release-notice integrations pass. Recent-history selection stops after the first three distinct URLs rather than filtering the entire history with repeated scans. Long shortcut titles and addresses truncate within their cards.
## Packaged validation

The interface integration also passes against the final `release/win-unpacked/Dot Browser.exe`, including the real saved-page link, first-run empty shelf, four home-page languages, background choices, large text, overflowing tabs and the left new-tab button. Turkish dark home and populated cards were visually inspected. Hidden native captures wait for two rendering frames after waking the compositor so they contain the current interface rather than an earlier onboarding frame.

Installer size: 115,307,800 bytes. SHA-256: `37d2ac7324fd8a859c0f77e5db2fabad14f556e6ddfdee6dc9ed6f61056857d3`.
## Published build

[Release v1.0.9](https://github.com/Mangoxt/dot-browser/releases/tag/v1.0.9) is public. [Windows setup](https://github.com/Mangoxt/dot-browser/releases/download/v1.0.9/Dot-Browser-Setup-1.0.9.exe), blockmap and `latest.yml` match the local sizes and SHA-256 digests returned by GitHub. The setup URL returns HTTP 200. Release source commit: `6b8fc1ecf93b55844318723991aeee1e7baac912`.

The real packaged updater, in a separate hidden temporary profile simulating installed version 1.0.8, detects version 1.0.9 and the correct installer filename. Downloads and installation were disabled during the check; the user's existing installation was not changed or restarted.
