import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dot-motion-'));
const env = {
  ...process.env,
  DOT_TEST_DATA: directory,
  DOT_TEST_HIDDEN: '1',
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    '<title>Motion fixture</title><input value="Preserve page state"><p>Owned animation test page</p>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let app;
try {
  app = await electron.launch(
    process.env.DOT_PACKAGED
      ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), env }
      : { args: ['.'], env },
  );
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
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
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(
    (url) => window.dot.command({ type: 'tab.navigate', input: url }),
    `http://127.0.0.1:${server.address().port}/`,
  );
  await expect
    .poll(async () => {
      const s = await page.evaluate(() => window.dot.snapshot());
      return s.tabs.find((t) => t.id === s.activeId).title;
    })
    .toBe('Motion fixture');
  const mainWindow = await app.browserWindow(page);
  const bounds = await mainWindow.evaluate((w) => w.contentView.children[0].getBounds());
  const menuButton = page.getByRole('button', { name: 'Browser menu', exact: true });
  await menuButton.click();
  assert.equal(
    await page.locator('.modal').evaluate((el) => getComputedStyle(el).animationName),
    'dot-menu-in',
  );
  await expect
    .poll(() => mainWindow.evaluate((w) => w.contentView.children[0].getVisible()))
    .toBe(false);
  const phase = await page.evaluate(async () => {
    const observed = [];
    const observer = new MutationObserver(() => {
      if (document.querySelector('.overlay-scrim.closing')) observed.push('closing');
    });
    observer.observe(document.body, { attributes: true, subtree: true });
    document.querySelector('button[aria-label="Close dialog"]').click();
    await new Promise((r) => setTimeout(r, 180));
    observer.disconnect();
    return { observed, remains: !!document.querySelector('.modal') };
  });
  assert.ok(phase.observed.includes('closing'));
  assert.equal(phase.remains, false);
  await expect
    .poll(() => mainWindow.evaluate((w) => w.contentView.children[0].getVisible()))
    .toBe(true);
  assert.deepEqual(await mainWindow.evaluate((w) => w.contentView.children[0].getBounds()), bounds);
  await menuButton.click();
  await page.evaluate(() => {
    document.querySelector('button[aria-label="Close dialog"]').click();
    setTimeout(() => document.querySelector('button[aria-label="Extensions"]').click(), 20);
  });
  await expect(page.getByRole('dialog', { name: 'Eklentiler', exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog', { name: 'Eklentiler', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const mode of ['setting', 'system']) {
    if (mode === 'setting')
      await page.evaluate(() =>
        window.dot.command({ type: 'settings', patch: { animations: false } }),
      );
    else {
      await page.evaluate(() =>
        window.dot.command({ type: 'settings', patch: { animations: true } }),
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await menuButton.click();
    assert.equal(
      await page.locator('.modal').evaluate((el) => getComputedStyle(el).animationName),
      'none',
    );
    const immediate = await page.evaluate(async () => {
      document.querySelector('button[aria-label="Close dialog"]').click();
      await new Promise(requestAnimationFrame);
      return !!document.querySelector('.overlay-scrim.closing');
    });
    assert.equal(immediate, false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await menuButton.click();
  await mainWindow.evaluate((w) => {
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() => mainWindow.evaluate((w) => w.contentView.children[0].getVisible()))
    .toBe(true);
  const profile = join(directory, 'motion-profile');
  await mkdir(profile);
  await writeFile(join(profile, 'Preferences'), '{}');
  await writeFile(
    join(profile, 'Bookmarks'),
    JSON.stringify({
      roots: {
        bar: {
          type: 'folder',
          name: 'Fixture',
          children: [{ type: 'url', name: 'Motion bookmark', url: 'https://fixture.invalid/' }],
        },
      },
    }),
  );
  await app.evaluate(({ dialog }, profile) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [profile] });
  }, profile);
  await menuButton.click();
  await page.getByRole('button', { name: 'Profile and import', exact: true }).click();
  await page.getByRole('button', { name: 'Import from another browser', exact: true }).click();
  await page.getByRole('button', { name: 'Choose browser folder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  const sourceId = await page.getByLabel('Browser profile', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.import-preview')).toContainText('Bookmarks: 1');
  const preview = await page.evaluate(async (sourceId) => {
    document.querySelector('button[aria-label="Close dialog"]').click();
    const result = await window.dot.command({
      type: 'import.preview',
      sourceId,
      kinds: ['bookmarks'],
    });
    await new Promise((r) => setTimeout(r, 200));
    return result;
  }, sourceId);
  assert.equal(preview.ok, true, preview.error);
  const imported = await page.evaluate(
    (token) => window.dot.command({ type: 'import.apply', token }),
    preview.preview.token,
  );
  assert.equal(imported.ok, true, imported.error);
  assert.equal(imported.report.counts.bookmarks, 1);
  console.log(
    'PASS: entry/exit motion, rapid reopen, stable native page bounds, motion preferences, keyboard dismissal and scoped import cleanup',
  );
} finally {
  if (app) await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
