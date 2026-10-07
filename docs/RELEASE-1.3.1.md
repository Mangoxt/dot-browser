# Dot Browser 1.3.1

The main menu is rebuilt as a compact toolbar popover with a quiet header,
quick normal/private window buttons, common library actions and inline zoom.
Settings and release/about links stay in a fixed footer when content scrolls.
Page tools and tab/window actions use separate views with back navigation,
rather than expanding the full command list. All previous actions remain
available. Page actions reflect the active tab; restoring a closed tab and
private saved-session management are disabled when unavailable.

Arrow keys and Home/End move between enabled buttons. Escape returns from a
submenu to its opener, then closes the main menu and restores the toolbar
button. Tab/Shift+Tab remain trapped inside the dialog, including header and
footer. Menu animations honor existing animation/reduced-motion preferences.
The new layout supports all four UI languages, text scaling and minimum-size
windows. Old overlapping menu CSS and the previous list component were removed.

GPL-3.0-only is retained. Corresponding source and exact unchanged GPL/MPL
dependency source archives accompany this release; see CORRESPONDING-SOURCE.md.

Validation: typecheck, lint and all 90 unit tests passed. Source hidden menu
checks passed actual zoom, copy/find, saved-session/extension dialogs, new and
restored tabs, private windows, keyboard navigation and four languages at 130%
in the minimum-size window. Source chrome-polish regression checks and the
once-per-version release-notice check passed. Dark/light and narrow captures
were inspected. Test clipboard writes were stubbed and all windows remained
hidden. Packaged results and public asset verification are recorded below
after publication.

Packaged menu and chrome-polish checks also passed. The menu check exercises
real commands and state transitions, with clipboard output stubbed. The private
test window is closed from the main-process test handle to avoid waiting for an
IPC reply from a renderer that is already closed during cleanup. All UI and
private-isolation assertions remain intact. The Turkish menu preview was
captured directly from the test app's own WebContents; no desktop was captured.

## Published asset verification

Release: https://github.com/Mangoxt/dot-browser/releases/tag/v1.3.1.
Source tag commit: `2eeb28076017d87caec14d6a38a9061e126d3b08`.
The exact tag's automatic workflow was canceled to publish the tested local
build; no unrelated run was canceled.

| Asset                                |     Bytes | SHA-256                                                          |
| ------------------------------------ | --------: | ---------------------------------------------------------------- |
| Dot-Browser-Setup-1.3.1.exe          | 117199593 | 1557792796e049b40cf5ee37003417a57ef61d9dc3fc1b13497bbafa5102540d |
| Dot-Browser-Setup-1.3.1.exe.blockmap |    122520 | be210b65dab3c05fb42dade8d759744dcc9be9ae70cbba6e76472b72631c2ca5 |
| latest.yml                           |       351 | 715da76220c46b7bef3df164eac111df592e3ae383dd56ef7f9cf58f42a7c661 |
| Dot-Browser-Source-1.3.1.zip         |  16966297 | 028426f4917edc73c51a195dba6b0d62d40df1e350baffbb8e62a13910be44fc |

Authenticated upload and anonymous latest-release metadata matched every size
and digest. The stable installer URL returned HTTP 200. The real packaged
updater, in a fresh hidden profile simulating 1.3.0, found 1.3.1 through the
embedded public feed. Download/install were disabled for this probe and no
installer was run. Corresponding source includes the tagged Dot archive and
hash-verified unchanged GPL extension-bridge/MPL filtering-engine archives.
