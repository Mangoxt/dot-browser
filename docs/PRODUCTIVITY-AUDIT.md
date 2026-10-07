# Dot Browser 1.1.0 feature audit

Date: 2026-10-07. Windows x64, Electron 44.5.1. All app checks use hidden windows, isolated temporary profiles and owned local webpage fixtures. Clipboard writes are stubbed in the feature test. No real audio is played and no installer is executed.

## Shipped changes

- Named sessions save the current workspace's URLs, tab groups, active tab and pinned/muted flags. Preview, search, rename, restore into a fresh workspace and explicit deletion are available from the home library, menu and settings. Existing tabs and their live form state remain intact. Restored group/tab IDs are independent, and background restored webpages load when selected. Copies do not include live DOM, navigation stacks, cookies or the password vault. Named copies remain separate from transient restore records and are deleted from their manager.
- Tab search includes a window-local, 30-entry recently closed list. Selecting an entry restores that entry while preserving the others. Open-tab filters cover workspace, audio and sleeping status, with keyboard result navigation and scrolling.
- Zoom persists for an exact scheme/host/port, applies to normal windows, resets on a different origin, and remains isolated from private windows and the trusted interface. Site information and Appearance settings can reset individual rules. Old persisted tab zooms migrate to site rules. Native frames use Electron 44 isolated zoom mode, avoiding startup/shared-origin interference while Dot applies the intended rules itself.
- Automatic memory saving skips pinned tabs and exact origins marked Never put this site to sleep, in addition to active, split, loading and audible tabs. This does not infer unsaved forms; sites whose live forms/background tasks matter can be explicitly kept awake.
- Copy clean link is an explicit Page tools action. It removes common tracking query keys while preserving other parameters and fragments; ordinary copying preserves the original URL.
- Restoring a session validates the 200-tab limit before changing any workspace, tabs or retained copy. The same capacity check preserves the closed list on failed restore. Private windows cannot save, rename, delete or open persisted sessions.
- Native page focus is re-applied after a selecting dialog disappears, while ordinary dialog dismissal continues to restore its connected opener.

## Validation

73 unit tests cover existing behavior plus exact-origin zoom, memory-saver exclusions, link cleaning, session validation/bounds, session storage and legacy zoom migration. Typecheck and lint pass.

The source feature integration verifies session UI actions and original live DOM preservation, independent restored IDs/groups, a selected closed entry, all tab filters, native zoom on navigation/new tabs and across multiple normal/private windows, clean/original clipboard output, the actual memory-saver callback with a simulated clock, atomic capacity failures, deletion without closing tabs, four interface languages at 130% text in a narrow dialog, persisted state after restart and native zoom reset. Audible state is stubbed; no sound hardware is exercised. Every app window remains hidden.

Source chrome/focus, motion, release-notice and language/theme integrations pass. All 31 local core-browser regression flows pass with the final zoom/focus behavior. The same feature integration and the existing chrome/focus integration also pass against the final packaged application. Turkish narrow-session and menu captures were inspected. The remaining manual checks are OS foreground focus, installation/relaunch, screen readers and multi-monitor DPI behavior.

## Package and publication

Installer: 115,327,064 bytes. SHA-256: `eadb0d877a7a2ab45f742e366f8f33f6d72b4e7d5d6b73af3e0277d0eaa29043`.

[Release v1.1.0](https://github.com/Mangoxt/dot-browser/releases/tag/v1.1.0) is public. [Windows setup](https://github.com/Mangoxt/dot-browser/releases/download/v1.1.0/Dot-Browser-Setup-1.1.0.exe), blockmap and `latest.yml` match local sizes and GitHub's SHA-256 digests. The stable setup link returns HTTP 200. Release source commit: `47afd51d6c921851984f16c7edbed29326c04c27`.

The real updater in the final packaged application, using a separate hidden profile simulating installed version 1.0.10, detects 1.1.0 and the correct installer filename. Downloads and installation were disabled for this check. The user's installed browser was not restarted or modified.
