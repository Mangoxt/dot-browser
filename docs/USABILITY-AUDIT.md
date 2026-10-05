# Usability improvements — 1.0.4

Validated on Windows on 2026-10-06 with Electron 44.5.1. TypeScript, ESLint and all 52 unit tests passed. All 31 local Electron integration flows passed in hidden windows with temporary profiles and stubbed file dialogs. No installer was executed and no user browser window was controlled.

- Search open tabs: title, URL and workspace name filtering, keyboard navigation and selection. Ctrl+Shift+A opens the dialog; the toolbar, browser menu and command palette also expose it. A separate packaged-app check verified selecting a tab from another workspace.
- Reading view: plain-text headings, paragraphs and quotes, adjustable type size, estimated reading time and return to the original page. Ctrl+Shift+M or the toolbar's book icon opens it. The integration test excluded navigation/sidebar/form text, rendered an HTML-looking string as literal text, adjusted typography, and verified that the original page marker and unsaved form value survived. Empty article extraction gives an explanation. This is a semantic text extractor, not a full readability engine or an access-restriction bypass.
- Save as PDF: Ctrl+Shift+S or the browser menu writes Chromium's actual PDF output with print backgrounds and CSS page sizes. The integration test checked the PDF file signature and canceled a second save. A separate packaged-app check navigated during the save picker and verified rejection without a file being written. Actual print dialogs were not launched.

The final reading layout was captured in test-results/reading-view-final.png and visually checked. New shortcuts are included in Settings and the command palette. The PDF feature saves the underlying webpage, not a separate PDF of the reading overlay.

The 1.0.4 NSIS installer, blockmap and latest.yml were built successfully. The installer is unsigned and was not executed.
