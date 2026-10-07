import type { WebContents } from 'electron';
import { nativeImage } from 'electron';
import { isWebURL } from '../shared/navigation';

export const MAX_CAPTURE_PIXELS = 40_000_000;
export function captureBounds(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 16000 ||
    height > 24000 ||
    Math.ceil(width) * Math.ceil(height) > MAX_CAPTURE_PIXELS
  )
    throw new Error('This page is too large. Capture the visible area instead.');
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export async function captureWebpage(
  wc: WebContents,
  mode: 'visible' | 'full',
  reuseThemeDebugger = false,
  deviceScaleFactor = 1,
) {
  if (wc.isDestroyed() || !isWebURL(wc.getURL()) || wc.isLoadingMainFrame())
    throw new Error('Wait for a webpage to finish loading.');
  const alreadyAttached = wc.debugger.isAttached();
  if (wc.isDevToolsOpened() || (alreadyAttached && !reuseThemeDebugger))
    throw new Error('Close developer tools before capturing this page.');
  let changed = false;
  const navigation = (
    _event: Electron.Event,
    _url: string,
    _inPlace: boolean,
    mainFrame: boolean,
  ) => {
    if (mainFrame) changed = true;
  };
  wc.on('did-start-navigation', navigation);
  const throttled = wc.getBackgroundThrottling();
  wc.setBackgroundThrottling(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!alreadyAttached) wc.debugger.attach('1.3');
    const work = async () => {
      // Flush pending zoom/theme paint before measuring the capture region.
      await wc.capturePage(undefined, { stayHidden: false, stayAwake: true });
      const metrics = await wc.debugger.sendCommand('Page.getLayoutMetrics');
      const viewport = metrics.cssVisualViewport;
      const content = metrics.cssContentSize;
      // CDP's capture clip uses device-independent coordinates, while the
      // css* layout metrics above use CSS pixels. Preserve the current zoom.
      const zoom = wc.getZoomFactor();
      const { width, height } = captureBounds(
        (mode === 'full' ? content.width : viewport.clientWidth) * zoom,
        (mode === 'full' ? content.height : viewport.clientHeight) * zoom,
      );
      captureBounds(width * deviceScaleFactor, height * deviceScaleFactor);
      const screenshot = wc.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: (mode === 'full' ? content.x : viewport.pageX) * zoom,
          y: (mode === 'full' ? content.y : viewport.pageY) * zoom,
          width,
          height,
          scale: 1,
        },
      });
      // Keep the page compositor active while CDP requests a new surface. The
      // native capture makes the page visible to Chromium, not the OS window:
      // no BrowserWindow.show/focus call is made, including in hidden tests.
      const [result] = await Promise.all([
        screenshot,
        wc.capturePage(undefined, { stayHidden: false, stayAwake: true }),
      ]);
      if (wc.isDestroyed() || changed) throw new Error('The page changed. Capture it again.');
      if (typeof result.data !== 'string' || result.data.length > 100_000_000)
        throw new Error('Could not capture this page. Try the visible area.');
      const image = nativeImage.createFromBuffer(Buffer.from(result.data, 'base64'));
      if (image.isEmpty()) throw new Error('Could not capture this page. Try the visible area.');
      const size = image.getSize();
      captureBounds(size.width, size.height);
      return image;
    };
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Capture timed out. Try again.')), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    wc.removeListener('did-start-navigation', navigation);
    if (!wc.isDestroyed()) wc.setBackgroundThrottling(throttled);
    if (!alreadyAttached && !wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach();
  }
}
