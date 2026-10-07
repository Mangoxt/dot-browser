# Dot Browser 1.3.0

The new-tab button now shares its tab's vertical center, uses a neutral hover
surface and follows the final tab during overflow. Appearance offers Classic
and Soft chrome, Simple and Dashboard home layouts, and an optional clock.
Simple is the new layout default; it removes the decorative hero and empty
reading-list prompt while keeping search, shortcuts and saved pages.

Dot is GPL-3.0-only from this release, following the owner's explicit approval.
The corresponding source, dependency lockfile and build instructions are
published with the release tag. Third-party notices and licenses ship in assets.

Chrome extension compatibility uses electron-chrome-extensions 4.9.0 with the
real persistent browsing session, page WebContents IDs, windows, selection and
removal callbacks, toolbar actions/popups and context menus. Host notifications
are guarded against recursive selection/removal; background extension-created
tabs preserve the active tab. Trusted interface views and private windows are
excluded from extension tab enumeration. Sandbox, isolation, web security and
file-access restrictions remain enabled.

Chrome Web Store detail pages offer **Add to Dot** in Dot's toolbar. An extension
link can also be pasted in Extensions. Dot downloads the official store package
using electron-chrome-web-store, checks its identity and manifest, shows its
requested API/host/content-script access and loads it only after approval. A
declined download is removed. Owned store files are deleted when removing an
extension; external unpacked folders are preserved. Installation doesn't depend
on Google's browser-detection button. Only official HTTPS store addresses or a
32-character extension ID are accepted. Store extension updates require explicit
removal/reinstallation; no automatic permission expansion is enabled.

Compatibility remains a subset of Chrome. Some APIs, account sync, themes and
extensions that depend on absent APIs will not work. `storage.sync` stays local.
Native request filtering takes precedence over extension webRequest filtering;
both Ad blocking and custom Request blocking can be disabled for that hook.

Ad blocking uses @ghostery/adblocker 2.18.2 with bundled EasyList and optional
EasyPrivacy. Lists update daily, are bounded during download and installed
atomically; a failed update keeps existing rules. Top-level filter-list navigation
blocking is disabled. Exact-origin exceptions, per-page counters and removable
CSS cosmetic filtering are available. Scriptlets and extended selectors are not
executed. Electron 44's user-origin CSS removal failure was reproduced; cosmetic
rules use removable author-origin important styles. Private exceptions/counters
remain in the ephemeral profile.

The store package's adm-zip dependency is overridden to patched 0.6.1. The
production dependency audit has no reported vulnerabilities; remaining audit
reports concern development/build dependencies.

## Validation

Typecheck, lint and unit checks cover persistence, official store address
validation, approval-before-load, cancellation, path ownership, offline filters,
exceptions, corrupt-cache fallback and top-level navigation preservation.

Hidden integration checks exercise tab alignment/overflow, both home layouts,
four languages at 130%, responsive controls, MV3 service workers querying real
tabs, extension popups, background tab creation, regular/private separation,
actual request cancellation, cosmetic removal, counters and failed updates.

The real store integration check downloads Dark Reader into an isolated test
profile, declines then approves installation using test dialog handlers, verifies
actual content injection, disables/removes it and checks owned-file cleanup.
No extension is installed into the user's profile. All test windows stay hidden;
no installer is executed, no user browser is restarted and no OS dialog is shown.

Existing core browsing, capture/community tools and once-per-version release
notice checks also run. Packaged validation and release digests are recorded
after the installer is built and published.

## Completed local/package verification

- Typecheck and lint passed; 90 unit tests in 12 files passed.
- Existing core hidden integration passed all 31 flows.
- Source and packaged extension, ad-blocking, interface and real-store checks
  passed. Source and packaged community checks passed capture, MRU, duplicate
  review, private isolation and four-language responsive checks.
- Service-worker startup polling allows 15 seconds on the packaged build.
  Packaged UI screenshot preparation uses `stayHidden: false` to wake Chromium's
  parent compositor, matching Playwright's source screenshot preparation. This
  does not show/focus an OS window; hidden-window assertions passed. Keeping the
  parent compositor hidden produced repeated tiles after zoom in an earlier QA
  attempt. No screenshot expectation was removed or weakened.
- The archive contains the extension preload/dependencies, bundled filters,
  GPL text and third-party notices; obsolete store-compat preload is absent.
- `npm audit --omit=dev` reported zero vulnerabilities.
- Corresponding source includes exact upstream source archives; see
  [CORRESPONDING-SOURCE.md](CORRESPONDING-SOURCE.md).
