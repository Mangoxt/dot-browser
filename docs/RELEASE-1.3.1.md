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
