# Dot Browser 1.3.2

The new tab page is rebuilt around centered search and compact shortcut icons.
An inline search-engine selector changes the actual default engine. The expanded
layout uses site cards with domains. Empty reading-list prompts, decorative
orbits and overlapping old home-page CSS are removed.

A page-local Customize panel applies layout, background, clock, recent-history
and reading-list visibility preferences immediately. Changes persist in the
existing settings store. Existing layout/background values are preserved for
upgrade compatibility. The panel traps keyboard focus, closes with Escape and
returns focus to its opener; it honors animation and reduced-motion preferences.

Shortcut options provide edit, remove and earlier/later keyboard reordering,
alongside existing drag-and-drop. Personal recent-history/reading collections
are omitted on private new-tab pages. Actual saved pages render as quiet lists
and retain their existing navigation behavior. All four UI languages and both
themes are supported. The 1.3.1 browser-menu redesign remains available.

Validation: typecheck, lint and all 90 existing unit checks passed. Source
interface checks passed actual saved-page navigation, history display, background
choices, 130% text in four languages, narrow layouts and tab-strip controls.
The new hidden-app integration check passed actual search submission (an owned
HTTPS protocol fixture), live customization, focus trapping/Escape, preference
persistence across restart, add/edit/remove shortcut forms, keyboard reordering
and private-page isolation. Dark/light and customization captures were inspected.
All test windows use fresh data directories and remain hidden. No installed
browser or system dialogs are opened by these checks.

GPL-3.0-only and dependency revisions remain unchanged. Corresponding source
archives accompany the installer; see CORRESPONDING-SOURCE.md. Packaged new-tab and interface checks also passed, including restart persistence,
actual search and private-page isolation. The final dark/light and Customize
panel captures were inspected. Source chrome-polish and once-per-version release
notice checks passed. Public release and update-feed verification are recorded below.

## Published asset verification

Release: https://github.com/Mangoxt/dot-browser/releases/tag/v1.3.2.
Source tag commit: `f38f596e0fc21af2b3849e37637c355447d3b417`.
The exact tag workflow was canceled to publish the tested local installer.
No unrelated workflow was canceled.

| Asset                                |     Bytes | SHA-256                                                          |
| ------------------------------------ | --------: | ---------------------------------------------------------------- |
| Dot-Browser-Setup-1.3.2.exe          | 117202120 | ae8c810cc6c09f2980e0dbad28b6f554b57d67ef008e291acc89603cf00e0d11 |
| Dot-Browser-Setup-1.3.2.exe.blockmap |    122549 | 985e038ac3c3de2f9b6a6fed1b516c05807a614bd2b0f7d8b9ea4bf4cd11c70a |
| latest.yml                           |       351 | 8970474d707ec1004ec61af6fcccf636242991509394fd30607733d1591999b1 |
| Dot-Browser-Source-1.3.2.zip         |  16973728 | c3a57b2b3dd7b8969fa0b61d2ef7f31b289e5185f1e83ee7b59f47fca0bbf038 |

Authenticated uploads and anonymous latest-release metadata matched every
size and SHA-256 digest. The stable installer URL returned HTTP 200. The real
packaged updater, in a fresh hidden profile simulating 1.3.1, found 1.3.2 through
its embedded public feed. Download/install were disabled for that probe; no
installer was executed. Corresponding source includes the tagged Dot archive
and hash-verified unchanged GPL bridge/MPL engine source archives.
