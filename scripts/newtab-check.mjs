import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<title>Owned new tab fixture</title><h1>Saved article</h1>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const fixture = `http://127.0.0.1:${server.address().port}`;
const directory = await mkdtemp(join(tmpdir(), 'dot-newtab-'));
const env = {
  ...process.env,
  DOT_TEST_DATA: directory,
  DOT_TEST_HIDDEN: '1',
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
let app;
async function launch() {
  app = await electron.launch(
    process.env.DOT_PACKAGED
      ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), env }
      : { args: ['.'], env },
  );
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.waitForSelector('.app');
  await app.evaluate(({ app }) => {
    if (!app.isPackaged) return;
    const req = process
      .getBuiltinModule('module')
      .createRequire(app.getAppPath() + '/package.json');
    req('electron-updater').autoUpdater.autoDownload = false;
    req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
  });
  return page;
}
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await app.evaluate(({ session }) => {
    session.fromPartition('persist:dot-personal').protocol.handle(
      'https',
      () =>
        new Response('<title>Owned new tab fixture</title><h1>Owned search</h1>', {
          headers: { 'Content-Type': 'text/html' },
        }),
    );
  });
  const cmd = async (c) => {
    const result = await page.evaluate((c) => window.dot.command(c), c);
    assert.ok(result.ok, result.error);
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  const capture = async (name) => {
    const win = await app.browserWindow(page);
    await win.evaluate(async (w) => {
      await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
    });
    const bytes = await win.evaluate(async (w) => [
      ...(
        await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true })
      ).toPNG(),
    ]);
    await writeFile(
      `test-results/newtab-${name}${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`,
      Buffer.from(bytes),
    );
  };
  await cmd({
    type: 'settings',
    patch: {
      animations: false,
      sidebar: false,
      theme: 'dark',
      engines: [
        ...(await snap()).settings.engines,
        {
          id: 'owned',
          name: 'Owned search',
          keyword: 'owned',
          template: 'https://search.owned.example/search?q=%s',
        },
      ],
    },
  });
  await page.getByRole('combobox', { name: 'Search engine', exact: true }).selectOption('owned');
  await page.getByRole('textbox', { name: 'Search the web', exact: true }).fill('a + b');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect
    .poll(async () => {
      const s = await snap();
      return s.tabs.find((t) => t.id === s.activeId).url;
    })
    .toBe('https://search.owned.example/search?q=a%20%2B%20b');
  await expect
    .poll(async () => {
      const s = await snap();
      return s.tabs.find((t) => t.id === s.activeId).title;
    })
    .toBe('Owned new tab fixture');
  await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await expect(page.locator('.recent-sites')).toContainText('Owned new tab fixture');
  await cmd({
    type: 'bookmark.save',
    bookmark: {
      id: 'owned-reading',
      title: 'Saved article',
      url: fixture + '/article',
      folder: 'Reading list',
      favicon: '',
      createdAt: Date.now(),
    },
  });
  await expect(page.locator('.newtab-reading-items')).toContainText('Saved article');
  const trigger = () => page.getByRole('button', { name: 'Customize', exact: true });
  await trigger().click();
  let dialog = page.getByRole('dialog', { name: 'Customize new tab', exact: true });
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('checkbox', { name: 'Reading list', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Expanded', exact: true }).click();
  await expect(page.locator('.newtab')).toHaveClass(/newtab-dashboard/);
  await dialog.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('.newtab')).toHaveClass(/background-grid/);
  await dialog.getByRole('checkbox', { name: 'Clock on new tabs', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Recently visited', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Reading list', exact: true }).uncheck();
  await expect(page.locator('.newtab-clock, .recent-sites, .newtab-reading')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger()).toBeFocused();
  await app.close();
  page = await launch();
  const persisted = (await snap()).settings;
  assert.equal(persisted.newTabLayout, 'dashboard');
  assert.equal(persisted.background, 'grid');
  assert.equal(persisted.engine, 'owned');
  for (const key of ['showNewTabClock', 'showNewTabRecent', 'showNewTabReading'])
    assert.equal(persisted[key], false);
  await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await trigger().click();
  dialog = page.getByRole('dialog', { name: 'Customize new tab', exact: true });
  for (const label of ['Clock on new tabs', 'Recently visited', 'Reading list'])
    await dialog.getByRole('checkbox', { name: label, exact: true }).check();
  await dialog.getByRole('button', { name: 'Simple', exact: true }).click();
  await dialog.getByRole('button', { name: 'Soft color', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.recent-sites')).toHaveCount(1);
  await expect(page.locator('.newtab-reading')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add shortcut', exact: true }).click();
  await page.getByLabel('Shortcut name', { exact: true }).fill('Owned shortcut');
  await page.getByLabel('Shortcut URL', { exact: true }).fill(fixture);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Owned shortcut', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit Owned shortcut', exact: true }).click();
  await page.getByLabel('Shortcut name', { exact: true }).fill('Edited shortcut');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Options for Edited shortcut', exact: true }).click();
  const before = (await snap()).shortcuts.findIndex((s) => s.title === 'Edited shortcut');
  await page.getByRole('menuitem', { name: 'Move earlier', exact: true }).click();
  await expect
    .poll(async () => (await snap()).shortcuts.findIndex((s) => s.title === 'Edited shortcut'))
    .toBe(before - 1);
  await page.getByRole('button', { name: 'Options for Edited shortcut', exact: true }).click();
  await page.keyboard.press('End');
  await expect(
    page.getByRole('menuitem', { name: 'Remove Edited shortcut', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Options for Edited shortcut', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Options for Edited shortcut', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Edited shortcut', exact: true }).click();
  assert.equal(
    (await snap()).shortcuts.some((s) => s.title === 'Edited shortcut'),
    false,
  );
  await cmd({ type: 'window', action: 'private' });
  await expect
    .poll(async () => (await app.windows()).filter((p) => p.url().startsWith('file:')).length)
    .toBe(2);
  const privatePage = (await app.windows()).find((p) => p !== page && p.url().startsWith('file:'));
  await privatePage.waitForSelector('.newtab');
  await expect(privatePage.locator('.newtab-collections')).toHaveCount(0);
  const privateResult = await privatePage
    .evaluate(() => window.dot.command({ type: 'window', action: 'close' }))
    .catch((e) => {
      if (!String(e).includes('closed')) throw e;
    });
  if (privateResult) assert.ok(privateResult.ok);
  await cmd({ type: 'settings', patch: { language: 'tr-TR', engine: 'google', theme: 'dark' } });
  await capture('redesign-tr');
  await page.getByRole('button', { name: 'Özelleştir', exact: true }).click();
  await capture('customize-tr');
  await page.keyboard.press('Escape');
  await cmd({ type: 'settings', patch: { theme: 'light' } });
  await capture('redesign-light-tr');
  const win = await app.browserWindow(page);
  await win.evaluate(async (w) => {
    w.setSize(760, 540);
    await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
  });
  await cmd({ type: 'settings', patch: { textScale: 1.3, language: 'de-DE' } });
  await page.getByRole('button', { name: 'Anpassen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Neuen Tab anpassen', exact: true })).toBeVisible();
  assert.ok(
    await page.locator('.newtab-custom-panel').evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await page.getByRole('checkbox', { name: 'Leseliste', exact: true }).scrollIntoViewIfNeeded();
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('.page-content').evaluate((e) => e.scrollWidth <= e.clientWidth));
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  console.log(
    'PASS: actual search, inline live customization, keyboard focus and Escape, preferences survive restart, shortcut forms and keyboard reordering, private-page isolation, dark/light previews, 760x540 at 130%; every window hidden',
  );
} finally {
  if (app) await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
