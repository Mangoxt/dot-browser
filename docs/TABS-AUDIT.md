# Dot Browser 1.1.1 tab button placement

Date: 2026-10-07. Windows x64, Electron 44.5.1. Verification uses hidden windows and isolated temporary profiles only.

The horizontal new-tab button follows the displayed tab strip rather than preceding it. The strip uses its content width up to the available space, so a few tabs do not leave an empty gap before the button. With overflowing tabs, the strip scrolls while the button remains outside it and accessible. Tab search stays at the right edge; the unused titlebar space can drag the window. Vertical tab controls retain their existing layout.

Typecheck, lint and all 73 unit tests pass. The interface integration verifies adjacency after one/two tabs, pinning, expanded/collapsed groups and closing a tab. It clicks the button to create real tabs, checks overflow at 760 × 600, manual scrolling, active-tab reveal, keyboard navigation and responsive vertical tabs. Existing home, library and settings checks also pass. The release notice check verifies the 1.1.1 change appears once after an upgrade and remains available from release history. Notes are translated into all four interface languages.

The same interface integration passes against the final unpacked executable. Its hidden Turkish capture was inspected: the button sits directly after two tabs, with spare titlebar space following it. No user browser, native dialog or installer is launched by these checks. Public release details are recorded after publication.

## Published build

[Release v1.1.1](https://github.com/Mangoxt/dot-browser/releases/tag/v1.1.1) is public. [Windows setup](https://github.com/Mangoxt/dot-browser/releases/download/v1.1.1/Dot-Browser-Setup-1.1.1.exe), its blockmap and `latest.yml` match the checked local files by size and GitHub SHA-256 digest. The public setup URL returns HTTP 200. Source commit: `b8891416877e2d2794f9c87f27832988bdcc9445`.

Installer size: 115,327,904 bytes. SHA-256: `624655785c89d53c62725e7da0957bc5fde8a5ed9f8a8ef7039930fd8784f3ea`.

The real packaged updater, in a separate hidden temporary profile simulating installed version 1.1.0, detects 1.1.1 with the correct installer filename. Downloads and installation were disabled during verification. The user's running app was not changed or restarted.
