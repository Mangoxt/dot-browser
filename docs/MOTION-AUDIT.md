# Interface motion — 1.0.6

Menus and dialogs enter with a short opacity/transform transition and close over 110 ms. The overlay remains registered during its exit, keeping native web views hidden until the transition completes. Reopening another dialog cancels the old close timer. Escape preserves the existing native overlay state until the renderer confirms closure.

Tabs enter with a short fade/translation and their active indicator expands. The side panel, address suggestions, notifications and new-tab search/shortcuts have light entrance motion. Icon buttons and shortcuts have press feedback. All new keyframes animate opacity or transform; the loading line now translates instead of animating left. Native web-view bounds are not interpolated.

The browser's animation setting and prefers-reduced-motion disable transitions and the delayed exit. The disabled-animation spinner exception was removed. Controls remain usable during transitions and reopening does not wait for the old exit.

Importer cleanup now cancels only tokens created by that dialog. Pending results that arrive after unmount cancel their own token. An exiting dialog can no longer clear a newer preview produced during its fade-out.

Validation: TypeScript, ESLint and 61 unit tests pass. `node scripts/motion-check.mjs` validates opening/closing, rapid reopening, identical native page bounds before/after, animation preference, reduced motion and Escape. These checks also pass against the packaged executable with DOT_PACKAGED=1. The dynamic-version release-notice check passes for 1.0.6.

All tests use hidden windows and isolated profiles. No installed user application or installer is launched.

The 31 local integration workflows pass with step boundaries waiting for visual exits. The final scoped-cleanup change is covered by creating a new import preview during an older dialog's exit, waiting for unmount, and successfully applying the new token.

