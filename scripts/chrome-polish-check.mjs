import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<title>Owned keyboard fixture</title><input placeholder="Owned input">');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const fixture = `http://127.0.0.1:${server.address().port}/`;
const directory = await mkdtemp(join(tmpdir(), 'dot-polish-'));
const env = {
  ...process.env,
  DOT_TEST_DATA: directory,
  DOT_TEST_HIDDEN: '1',
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
const app = await electron.launch(
  process.env.DOT_PACKAGED
    ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), env }
    : { args: ['.'], env },
);
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  const win = await app.browserWindow(page);
  if (process.env.DOT_PACKAGED)
    await app.evaluate(({ app }) => {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    });
  const capture = async (name) => {
    const path = `test-results/polish-${name}${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`;
    if (!process.env.DOT_PACKAGED) return page.screenshot({ path, animations: 'disabled' });
    await win.evaluate(async (w) =>
      w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }),
    );
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const bytes = await win.evaluate(async (w) => {
      const image = await w.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (image.isEmpty()) throw new Error('Empty hidden capture');
      return [...image.toPNG()];
    });
    await writeFile(path, Buffer.from(bytes));
  };
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const cmd = async (c) => {
    const result = await page.evaluate((v) => window.dot.command(v), c);
    assert.ok(result.ok, result.error);
    return result;
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  await cmd({ type: 'settings', patch: { animations: false, sidebar: false } });
  const menuButton = page.getByRole('button', { name: 'Browser menu', exact: true });
  await menuButton.click();
  await expect(page.locator('.menu-zoom')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  const profile = page.getByRole('button', { name: 'Profile and import', exact: true });
  await profile.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'About Dot', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(profile).toBeFocused();
  await page.getByRole('button', { name: 'Page tools', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-menu-view="page"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to menu', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Page tools', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Extensions', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'Extensions', exact: true })).toBeVisible();
  assert.ok(
    await page.getByRole('dialog').evaluate((e) => e.contains(document.activeElement)),
    'switching overlays retains focus inside the new dialog',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Search the web', exact: true })
    .fill('draft from another tab');
  await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await expect(page.getByRole('textbox', { name: 'Search the web', exact: true })).toHaveValue('');
  const homeId = (await snap()).activeId;
  await cmd({ type: 'tab.new', url: fixture });
  const firstWebId = (await snap()).activeId;
  await expect
    .poll(async () => (await snap()).tabs.find((t) => t.id === firstWebId).title)
    .toBe('Owned keyboard fixture');
  await cmd({ type: 'tab.new', url: fixture + 'second' });
  const secondWebId = (await snap()).activeId;
  await expect
    .poll(async () => (await snap()).tabs.find((t) => t.id === secondWebId).title)
    .toBe('Owned keyboard fixture');
  await app.evaluate(({ webContents, BrowserWindow }) => {
    const chromeId = BrowserWindow.getAllWindows()[0].webContents.id;
    globalThis.dotFocusStats = { chrome: 0, page: 0 };
    for (const wc of webContents.getAllWebContents()) {
      const original = wc.focus;
      wc.focus = function () {
        globalThis.dotFocusStats[this.id === chromeId ? 'chrome' : 'page']++;
        return original.call(this);
      };
    }
  });
  await page.locator('.tab.selected').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snap()).activeId).toBe(firstWebId);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await snap()).activeId).toBe(secondWebId);
  assert.deepEqual(
    await app.evaluate(() => globalThis.dotFocusStats),
    { chrome: 2, page: 0 },
    'keyboard tab navigation focuses chrome rather than the webpage',
  );
  await cmd({ type: 'tab.action', action: 'select', id: firstWebId });
  assert.equal(
    (await app.evaluate(() => globalThis.dotFocusStats)).page,
    1,
    'ordinary tab selection focuses the webpage',
  );
  await menuButton.click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom', exact: true }).last()).toHaveText(
    '110%',
  );
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).last().click();
  await page.keyboard.press('Escape');
  await cmd({ type: 'tab.action', action: 'select', id: homeId });
  for (let i = 0; i < 16; i++)
    await cmd({
      type: 'bookmark.save',
      bookmark: {
        id: `polish-${i}`,
        title: `Owned keyboard fixture bookmark ${i}`,
        url: i === 0 ? fixture : fixture + `bookmark-${i}`,
        favicon: '',
        folder: 'Bookmarks',
        createdAt: Date.now(),
      },
    });
  await cmd({ type: 'settings', patch: { bookmarkBar: true } });
  const address = page.getByRole('combobox', { name: 'Address and search', exact: true });
  await address.fill('Owned keyboard fixture');
  await expect(address).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('option')).toHaveCount(9);
  await expect(page.getByRole('option').filter({ hasText: 'Switch to tab' })).toHaveCount(2);
  assert.equal(
    await page.locator('.suggestion-kind').filter({ hasText: 'history' }).count(),
    0,
    'URLs already shown as open tabs/bookmarks are not repeated from history',
  );
  await address.press('ArrowDown');
  await expect(address).toHaveAttribute('aria-activedescendant', 'address-option-1');
  await address.press('Enter');
  await expect.poll(async () => (await snap()).activeId).toBe(firstWebId);
  await cmd({ type: 'tab.action', action: 'select', id: homeId });
  for (const compact of [false, true]) {
    await cmd({ type: 'settings', patch: { compact, textScale: 1.3 } });
    await win.evaluate(async (w) => {
      w.setSize(760, 600);
      await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(760);
    const all = page.getByRole('button', { name: 'All bookmarks', exact: true });
    const allBox = await all.boundingBox();
    assert.ok(
      allBox.x >= 0 && allBox.x + allBox.width <= 760,
      'all bookmarks remains inside narrow viewport',
    );
    assert.ok(await page.locator('.bookmark-links').evaluate((e) => e.scrollWidth > e.clientWidth));
    await menuButton.click();
    const box = await page.getByRole('dialog').boundingBox();
    const bottom = await page
      .locator('.browser-header')
      .evaluate((e) => e.getBoundingClientRect().bottom);
    assert.ok(
      box.y >= bottom && box.y + box.height <= 600,
      'menu tracks actual chrome height and fits viewport',
    );
    await page.keyboard.press('Escape');
    await expect(menuButton).toBeFocused();
  }
  await cmd({ type: 'settings', patch: { compact: false, textScale: 1, language: 'tr-TR' } });
  await win.evaluate(async (w) => {
    w.setSize(1360, 900);
    await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1360);
  await capture('home');
  await page.getByRole('button', { name: 'Tarayıcı menüsü', exact: true }).click();
  await capture('menu');
  await page.keyboard.press('Escape');
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  console.log(
    'PASS: overlay switching and focus restoration, Tab trap including Page tools, native tab keyboard focus routing, normal webpage focus routing, accessible deduplicated address suggestions, fresh new-tab search, direct zoom, bookmark overflow and menu bounds in normal/compact 130% narrow windows; all windows hidden',
  );
} finally {
  await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
