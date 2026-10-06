# Dot Browser 1.0.10 interface audit

Date: 2026-10-07. Windows x64, Electron 44.5.1. Tests use hidden windows, temporary profiles and owned local website fixtures. No installer was executed and the user's browser was not restarted.

## Changes

- Increased the address field and toolbar control sizes, improved secondary text contrast in both themes, and made home card and helper text follow the selected text scale.
- Grouped the browser menu with localized section labels. Page zoom is directly available, and controls that require a webpage are disabled on internal pages. Menu placement and available height follow the actual header, including bookmarks, compact mode, split controls and notices.
- Bookmark links scroll separately from the always-visible All bookmarks button.
- Address suggestions provide combobox/listbox semantics, active option IDs, bounded result selection and URL deduplication across open tabs, bookmarks and history. Distinct open tabs remain separate switch targets. New-tab search drafts do not leak into a different tab.
- Arrow/Home/End tab selection routes focus to the trusted interface instead of the native webpage. Normal tab selection retains webpage focus. Overlay switches focus the new dialog and final dismissal restores the original connected opener. The Tab loop includes visible summaries and excludes hidden or disabled fields.

## Source validation

Typecheck, lint, 66 unit tests and all 31 local browser integration flows pass. The focused interface check verifies actual native focus-method routing, overlay switches, forward/reverse keyboard loops, direct zoom, suggestion navigation to a real open tab, bookmark overflow, and menu bounds at 760 × 600 in normal and compact modes with 130% text. The broader interface check passes for four languages, light/dark themes, reading-list navigation, settings search, overflowing tabs and responsive layouts.

Motion, release-notice and language/theme integrations pass. Homepage and grouped-menu captures were inspected. Native OS foreground focus, high-DPI multi-monitor layouts, screen readers and installation/relaunch require interactive validation; the automated focus assertions observe the app's native focus routing in hidden windows.

## Package and publication

Both focused keyboard/interface checks and the broader interface checks pass against the final unpacked application, including four home languages, 130% text, compact mode, real native page switching and bookmark overflow. Turkish home and grouped-menu captures from the packaged application were inspected.

Installer: 115,310,769 bytes. SHA-256: `ee96578182a4dd1c64956aca5ff4b7af8a6a8dd31bb708f5e180cdb354a3c30c`.

Public release and live update-feed verification pending.
