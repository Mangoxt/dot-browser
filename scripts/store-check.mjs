import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dot-store-ui-'));
const env = {
  ...process.env,
  DOT_TEST_HIDDEN: '1',
  DOT_TEST_DATA: directory,
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    '<title>Real extension fixture</title><style>body{background:#fff;color:#111}</style><h1>Owned white page</h1>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const fixture = `http://127.0.0.1:${server.address().port}/`;
const app = await electron.launch(
  process.env.DOT_PACKAGED
    ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), env }
    : { args: ['.'], env },
);
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  await page.waitForSelector('.app');
  await app.evaluate(({ app, dialog }) => {
    globalThis.dotStorePrompts = [];
    globalThis.dotStoreDecision = 0;
    dialog.showMessageBox = async (...args) => {
      globalThis.dotStorePrompts.push(args.at(-1));
      return { response: globalThis.dotStoreDecision, checkboxChecked: false };
    };
    if (app.isPackaged) {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    }
  });
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const id = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
  const url = `https://chromewebstore.google.com/detail/dark-reader/${id}?hl=en`;
  const cmd = async (c) => {
    const result = await page.evaluate((c) => window.dot.command(c), c);
    assert.ok(result.ok, result.error);
    return result;
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  await cmd({ type: 'tab.navigate', input: url });
  const add = page.getByRole('button', { name: 'Add to Dot', exact: true });
  await expect(add).toBeVisible();
  await add.click();
  await expect
    .poll(() => app.evaluate(() => globalThis.dotStorePrompts.length), { timeout: 60000 })
    .toBe(1);
  const prompt = await app.evaluate(() => globalThis.dotStorePrompts[0]);
  assert.match(prompt.message, /Dark Reader/);
  assert.match(prompt.detail, /Requested access/);
  await expect(add).toBeEnabled();
  assert.equal((await cmd({ type: 'extension.list' })).extensions.length, 0);
  assert.ok(
    !(await readdir(join(directory, 'extensions-store'))).some((name) =>
      name.startsWith('.pending-'),
    ),
    'declined download is cleaned up',
  );
  await app.evaluate(() => {
    globalThis.dotStoreDecision = 1;
  });
  await add.click();
  await expect
    .poll(async () => (await cmd({ type: 'extension.list' })).extensions.length, { timeout: 60000 })
    .toBe(1);
  const installed = (await cmd({ type: 'extension.list' })).extensions[0];
  assert.equal(installed.id, id);
  assert.equal(installed.source, 'store');
  assert.equal(installed.enabled, true);
  assert.equal(installed.name, 'Dark Reader');
  assert.ok(!('path' in installed));
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await cmd({ type: 'settings', patch: { theme: 'light', forceDarkPages: false } });
  await cmd({ type: 'tab.navigate', input: fixture });
  const web = async (code) => {
    const s = await snap();
    const contentsId = s.tabs.find((t) => t.id === s.activeId).webContentsId;
    return app.evaluate(
      ({ webContents }, { id, code }) => webContents.fromId(id).executeJavaScript(code),
      { id: contentsId, code },
    );
  };
  await expect
    .poll(() => web('!!document.querySelector("style.darkreader")'), { timeout: 30000 })
    .toBe(true);
  assert.equal(await web('typeof window.dot'), 'undefined');
  await cmd({ type: 'extension.action', id, action: 'disable' });
  await cmd({ type: 'tab.action', action: 'reload' });
  await expect.poll(() => web('!!document.querySelector("style.darkreader")')).toBe(false);
  await cmd({ type: 'extension.action', id, action: 'remove' });
  assert.equal(existsSync(join(directory, 'extensions-store', id)), false);
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await page
    .getByLabel('Chrome Web Store link', { exact: true })
    .fill('https://evil.example/detail/' + id);
  await expect(page.getByRole('button', { name: 'Add extension', exact: true })).toBeDisabled();
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
    false,
  );
  console.log(
    'PASS: real Chrome Web Store download, permissions cancellation and cleanup, approved Dark Reader installation and actual page injection, disable/removal, invalid host rejection, isolated remote page; every window hidden',
  );
} finally {
  await app.close();
  await new Promise((r) => server.close(r));
}
