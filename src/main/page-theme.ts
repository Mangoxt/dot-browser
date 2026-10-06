import { nativeTheme, type WebContents } from 'electron';
import type { BrowserSettings } from '../shared/models';

// Chromium changes the paint, rather than inverting images or rewriting a site's styles.
export function pageTheme(settings: BrowserSettings, url: string) {
  const dark =
    settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors);
  let excepted = false;
  try {
    excepted = settings.darkSiteExceptions.includes(new URL(url).origin);
  } catch {
    /* internal page */
  }
  return { dark: dark && !excepted, force: dark && settings.forceDarkPages && !excepted, excepted };
}

export class PageTheme {
  private applied = '';
  private requested = '';
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private wc: WebContents,
    private onError: (message: string) => void,
  ) {
    wc.debugger.on('detach', () => {
      this.applied = '';
    });
  }
  update(settings: BrowserSettings, url: string) {
    const mode = pageTheme(settings, url);
    const signature = JSON.stringify(mode);
    if (this.applied === signature && this.requested === signature) return;
    if (this.requested === signature) return;
    this.requested = signature;
    this.queue = this.queue.then(async () => {
      if (this.wc.isDestroyed()) return;
      try {
        if (this.wc.isDevToolsOpened()) {
          this.requested = '';
          return;
        }
        if (!this.wc.debugger.isAttached()) this.wc.debugger.attach('1.3');
        // The bundled legacy night stylesheet also respects explicit light exceptions.
        // This boolean marker grants pages no bridge or privileged API.
        await this.wc.debugger
          .sendCommand('Runtime.evaluate', {
            expression: `document.documentElement?.toggleAttribute('data-dot-light-exception', ${mode.excepted})`,
            returnByValue: true,
          })
          .catch(() => {
            // Navigation can replace the execution context. DOM-ready reapplies
            // the marker; native color emulation must still apply before paint.
          });
        await this.wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: mode.dark ? 'dark' : 'light' }],
        });
        await this.wc.debugger.sendCommand('Emulation.setAutoDarkModeOverride', {
          enabled: mode.force,
        });
        this.applied = signature;
      } catch (error) {
        this.requested = '';
        if (!this.wc.isDestroyed()) this.onError(String(error));
      }
    });
  }
  invalidate() {
    this.applied = '';
    this.requested = '';
  }
}
