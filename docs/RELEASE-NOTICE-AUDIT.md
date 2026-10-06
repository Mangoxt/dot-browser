# Release notice validation — 1.0.5

The browser shows its bundled Turkish changelog after the first launch of a newer installed version. The dismissed version is stored in browser-data.json. Private windows do not consume the notification, and a shared process claim prevents duplicate automatic popups across windows. Pending notices wait until onboarding, another dialog, the address picker and permission prompts are clear. Fresh installations establish a baseline while displaying onboarding.

About → Neler yeni? reopens the full bundled release history. Text is rendered as React text, without remote HTML. A build fails if package.json's version has no nonempty entry in src/shared/releases.json; add actual changes there for every future release.

Validation: TypeScript, ESLint and all 61 unit tests pass. `node scripts/release-notice-check.mjs` passes hidden Electron checks for fresh-install onboarding, an upgrade from 1.0.4, dismissal, persistence across a restart and manually reopening historical notes. `test-results/whats-new.png` was visually inspected. All checks use isolated temporary profiles; no installer or visible application window is opened.

The popup appears when the installed update starts, not when a download finishes. Automatic installation still waits for normal application exit.


