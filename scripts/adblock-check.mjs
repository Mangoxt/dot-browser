import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
let adHits = 0;
const server = createServer((req, res) => {
  if (req.url === '/banner.js') {
    adHits++;
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end('document.documentElement.dataset.adExecuted="yes"');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    `<title>Blocking fixture</title><h1>Owned normal page</h1><ins class="adsbygoogle" data-ad-client="fixture">Ad fixture</ins><script src="http://ad.doubleclick.net:${server.address().port}/banner.js"></script>`,
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://example.org:${server.address().port}/`;
const directory = await mkdtemp(join(tmpdir(), 'dot-adblock-ui-'));
const env = {
  ...process.env,
  DOT_TEST_HIDDEN: '1',
  DOT_TEST_DATA: directory,
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
const resolver =
  '--host-resolver-rules=MAP ad.doubleclick.net 127.0.0.1, MAP example.org 127.0.0.1';
const app = await electron.launch(
  process.env.DOT_PACKAGED
    ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), args: [resolver], env }
    : { args: [resolver, '.'], env },
);
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.app');
  if (process.env.DOT_PACKAGED)
    await app.evaluate(({ app }) => {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    });
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const cmd = async (c) => {
    const result = await page.evaluate((c) => window.dot.command(c), c);
    assert.ok(result.ok, result.error);
    return result;
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  const active = async () => {
    const s = await snap();
    return s.tabs.find((t) => t.id === s.activeId);
  };
  const web = async (code) =>
    app.evaluate(
      ({ webContents }, { id, code }) => webContents.fromId(id).executeJavaScript(code),
      { id: (await active()).webContentsId, code },
    );
  const load = async () => {
    await cmd({ type: 'tab.navigate', input: url });
    await expect.poll(async () => (await active()).loading).toBe(false);
    await expect.poll(() => web('document.title')).toBe('Blocking fixture');
  };
  await load();
  await expect.poll(async () => (await active()).blockedRequests).toBeGreaterThan(0);
  assert.equal(adHits, 0);
  await expect
    .poll(() => web('getComputedStyle(document.querySelector(".adsbygoogle")).display'))
    .toBe('none');
  assert.equal(await web('document.querySelector("h1").textContent'), 'Owned normal page');
  await page.getByRole('button', { name: 'Site information', exact: true }).click();
  await expect(page.getByText('Blocked requests: 1', { exact: true })).toBeVisible();
  await page.getByLabel('Block ads on this site', { exact: true }).uncheck();
  await expect
    .poll(async () => (await snap()).settings.adblockExceptions)
    .toEqual([new URL(url).origin]);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect
    .poll(() => web('getComputedStyle(document.querySelector(".adsbygoogle")).display'))
    .not.toBe('none');
  await load();
  await expect.poll(() => web('document.documentElement.dataset.adExecuted')).toBe('yes');
  assert.equal(adHits, 1);
  assert.equal((await active()).blockedRequests, 0);
  await cmd({ type: 'settings', patch: { adblockExceptions: [], adblock: 'off' } });
  await load();
  await expect.poll(() => web('document.documentElement.dataset.adExecuted')).toBe('yes');
  assert.equal(adHits, 2);
  await cmd({ type: 'settings', patch: { adblock: 'ads' } });
  await app.evaluate(() => {
    globalThis.dotOriginalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false });
  });
  const update = await page.evaluate(() => window.dot.command({ type: 'adblock.update' }));
  assert.equal(update.ok, false);
  await app.evaluate(() => {
    globalThis.fetch = globalThis.dotOriginalFetch;
    delete globalThis.dotOriginalFetch;
  });
  await load();
  await expect.poll(async () => (await active()).blockedRequests).toBeGreaterThan(0);
  assert.equal(adHits, 2);
  const waitPrivate = app.waitForEvent('window');
  await cmd({ type: 'window', action: 'private' });
  const privatePage = await waitPrivate;
  await privatePage.waitForSelector('.app');
  await privatePage.evaluate(
    (origin) => window.dot.command({ type: 'settings', patch: { adblockExceptions: [origin] } }),
    new URL(url).origin,
  );
  assert.deepEqual((await snap()).settings.adblockExceptions, []);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
    false,
  );
  console.log(
    'PASS: real network cancellation, removable cosmetic CSS, per-origin exception, off/on, page counters, failed update retains lists, private isolation; every window hidden',
  );
} finally {
  await app.close();
  await new Promise((r) => server.close(r));
}
