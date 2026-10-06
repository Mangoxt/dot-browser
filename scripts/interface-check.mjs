import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dot-interface-'));
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
  if (process.env.DOT_PACKAGED)
    await app.evaluate(({ app }) => {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    });
  await page.waitForSelector('.app');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const cmd = async (c) => {
    const r = await page.evaluate((v) => window.dot.command(v), c);
    assert.ok(r.ok, r.error);
    return r;
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  const activeURL = async () => {
    const s = await snap();
    return s.tabs.find((t) => t.id === s.activeId).url;
  };
  const win = await app.browserWindow(page);
  const capture = async (path) => {
    if (!process.env.DOT_PACKAGED) return page.screenshot({ path, animations: 'disabled' });
    const bytes = await win.evaluate(async (w) => {
      const image = await w.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (image.isEmpty()) throw new Error('Empty hidden interface capture');
      return [...image.toPNG()];
    });
    await writeFile(path.replace('.png', '-packaged.png'), Buffer.from(bytes));
  };
  await cmd({ type: 'settings', patch: { animations: false, sidebar: false } });
  for (let i = 0; i < 6; i++)
    await cmd({
      type: 'shortcut.save',
      shortcut: {
        id: `owned-${i}`,
        title: i ? `Site ${i}` : 'A very long shortcut title that should truncate cleanly',
        url: `https://owned-${i}.example/`,
      },
    });
  for (const theme of ['dark', 'light']) {
    await cmd({ type: 'settings', patch: { theme } });
    await win.evaluate(async (w) => {
      w.setSize(1280, 850);
      await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);
    await expect(page.locator('.newtab-library')).toBeVisible();
    await capture(`test-results/interface-newtab-${theme}.png`);
  }
  await win.evaluate(async (w) => {
    w.setSize(760, 600);
    await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(760);
  await cmd({ type: 'settings', patch: { textScale: 1.3 } });
  await expect(page.locator('.speed-open').first()).toBeVisible();
  assert.ok(await page.locator('.page-content').evaluate((e) => e.scrollWidth <= e.clientWidth));
  await page
    .locator('.newtab-library')
    .getByRole('button', { name: 'Bookmarks', exact: true })
    .click();
  await expect.poll(activeURL).toBe('browser://bookmarks');
  await cmd({ type: 'tab.navigate', input: 'browser://settings' });
  const search = page.getByRole('searchbox', { name: 'Search settings sections' });
  await search.fill('appearance');
  await expect(page.locator('.settings-nav > button')).toHaveCount(1);
  await page.locator('.settings-nav > button').click();
  await expect(page.locator('.settings-content h1')).toHaveText('Appearance');
  assert.equal(await activeURL(), 'browser://settings#appearance');
  await search.fill('no matching section xyz');
  await expect(page.locator('.settings-search-empty')).toHaveText('No matching sections');
  await search.fill('');
  await page
    .locator('.settings-nav')
    .getByRole('button', { name: 'Languages', exact: true })
    .click();
  await page.locator('#setting-language').selectOption('tr-TR');
  await page.getByRole('searchbox', { name: 'Ayar bölümlerinde ara' }).fill('GÖRÜNÜM');
  await expect(page.locator('.settings-nav > button')).toHaveCount(1);
  await page.locator('.settings-nav > button').click();
  await expect(page.locator('.settings-content h1')).toHaveText('Görünüm');
  await capture('test-results/interface-settings-narrow.png');
  assert.ok(
    await page.locator('.settings-content').evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await cmd({ type: 'settings', patch: { language: 'en-US', textScale: 1, theme: 'dark' } });
  for (let i = 0; i < 18; i++) await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await expect(page.getByRole('button', { name: 'Scroll tabs left', exact: true })).toBeEnabled();
  const activeBox = await page.locator('.tab.selected').boundingBox();
  const strip = await page.locator('.tab-scroll').boundingBox();
  assert.ok(
    activeBox.x >= strip.x - 1 && activeBox.x + activeBox.width <= strip.x + strip.width + 1,
    'active tab scrolled into view',
  );
  await page.locator('.tab.selected').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('[role="tab"]').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[role="tab"]').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.locator('[role="tab"]').last()).toHaveAttribute('aria-selected', 'true');
  const scrollBefore = await page.locator('.tab-scroll').evaluate((e) => e.scrollLeft);
  await page.getByRole('button', { name: 'Scroll tabs left', exact: true }).click();
  await expect
    .poll(() => page.locator('.tab-scroll').evaluate((e) => e.scrollLeft))
    .toBeLessThan(scrollBefore - 10);
  const manuallyScrolled = await page.locator('.tab-scroll').evaluate((e) => e.scrollLeft);
  await cmd({ type: 'settings', patch: { showHome: true } });
  assert.equal(
    await page.locator('.tab-scroll').evaluate((e) => e.scrollLeft),
    manuallyScrolled,
    'unrelated state update preserves manual scroll',
  );
  await page.getByRole('button', { name: 'Search tabs (Ctrl+Shift+A)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Search tabs', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await cmd({ type: 'settings', patch: { sidebar: true, verticalTabs: true } });
  await win.evaluate(async (w) => {
    w.setSize(1280, 850);
    await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);
  await expect(page.locator('.tabs-container.vertical')).toHaveCount(1);
  await expect(page.locator('.titlebar .tabs-container')).toHaveCount(0);
  await page.locator('.tab.selected').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="tab"]').nth(1)).toHaveAttribute('aria-selected', 'true');
  await win.evaluate(async (w) => {
    w.setSize(760, 600);
    await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(760);
  await expect(page.locator('.tabs-container.vertical')).toHaveCount(0);
  await expect(page.locator('.titlebar .tabs-container')).toHaveCount(1);
  await capture('test-results/interface-tabs-narrow.png');
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  console.log(
    'PASS: site cards, light/dark captures, library shortcut, localized settings section search, section links, 130% narrow layout, readable overflow tabs, active visibility, manual scroll preservation, keyboard navigation, actual tab search and responsive vertical tabs; every window hidden',
  );
} finally {
  await app.close().catch(() => {});
}
