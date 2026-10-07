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
notice checks passed. Public asset verification will be recorded after publication.
