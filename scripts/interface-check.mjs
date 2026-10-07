import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<title>Owned home fixture</title><h1>Saved page fixture</h1>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const fixture = `http://127.0.0.1:${server.address().port}/`;
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
    await win.evaluate(async (w) => {
      await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
    });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const bytes = await win.evaluate(async (w) => {
      const image = await w.webContents.capturePage(undefined, {
        stayHidden: false,
        stayAwake: true,
      });
      if (image.isEmpty()) throw new Error('Empty hidden interface capture');
      return [...image.toPNG()];
    });
    await writeFile(path.replace('.png', '-packaged.png'), Buffer.from(bytes));
  };
  await cmd({ type: 'settings', patch: { animations: false, sidebar: false } });
  const create = page.getByRole('button', { name: 'New tab (Ctrl+T)', exact: true });
  const assertTrailingCreate = async () => {
    await expect(create).toHaveCount(1);
    await expect(create).toBeInViewport();
    const createBox = await create.boundingBox();
    const lastTab = await page.locator('.tab-scroll > :last-child').boundingBox();
    assert.ok(
      createBox.x >= lastTab.x + lastTab.width - 1 &&
        createBox.x - (lastTab.x + lastTab.width) <= 8,
      'new-tab button follows the last visible tab without an unused gap',
    );
    assert.ok(
      Math.abs(createBox.y + createBox.height / 2 - (lastTab.y + lastTab.height / 2)) <= 1,
      'new-tab button shares the tab vertical center',
    );
    assert.equal(
      await create.evaluate((el) => getComputedStyle(el).borderColor),
      'rgba(0, 0, 0, 0)',
    );
  };
  await assertTrailingCreate();
  await cmd({ type: 'settings', patch: { chromeStyle: 'soft' } });
  await assertTrailingCreate();
  await capture('test-results/chrome-soft.png');
  await cmd({ type: 'settings', patch: { chromeStyle: 'classic' } });
  await create.click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await assertTrailingCreate();
  await cmd({ type: 'settings', patch: { language: 'tr-TR' } });
  await capture('test-results/tabs-trailing-tr.png');
  await cmd({ type: 'settings', patch: { language: 'en-US' } });
  const initial = await snap();
  await cmd({ type: 'tab.action', action: 'pin', id: initial.tabs[0].id });
  await cmd({ type: 'group.save', name: 'Owned group', color: '#a398ff', tabId: initial.activeId });
  await assertTrailingCreate();
  const groupId = (await snap()).groups[0].id;
  await cmd({ type: 'group.action', id: groupId, action: 'collapse' });
  await assertTrailingCreate();
  await cmd({ type: 'group.action', id: groupId, action: 'delete' });
  await cmd({ type: 'tab.action', action: 'pin', id: initial.tabs[0].id });
  await cmd({ type: 'tab.action', action: 'close', id: initial.activeId });
  await expect(page.getByRole('tab')).toHaveCount(1);
  await assertTrailingCreate();
  await create.click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await assertTrailingCreate();
  await expect(page.locator('.newtab-reading-empty')).toHaveCount(0);
  await expect(page.locator('.newtab-orbit')).toHaveCount(0);
  await capture('test-results/home-simple.png');
  await cmd({ type: 'settings', patch: { showNewTabClock: false } });
  await expect(page.locator('.newtab-clock')).toHaveCount(0);
  await cmd({ type: 'settings', patch: { showNewTabClock: true, newTabLayout: 'dashboard' } });
  await expect(page.locator('.newtab-reading-empty')).toHaveCount(0);
  await expect(page.locator('.newtab')).toHaveClass(/newtab-dashboard/);
  await cmd({ type: 'settings', patch: { language: 'tr-TR' } });
  await expect(page.locator('.newtab-hero h1')).toHaveText('Yeni sekme');
  await capture('test-results/home-empty-tr.png');
  await cmd({ type: 'settings', patch: { language: 'en-US' } });
  await capture('test-results/home-empty.png');
  await cmd({
    type: 'bookmark.save',
    bookmark: {
      id: 'owned-reading',
      title: 'A saved article for the reading list',
      url: fixture,
      favicon: '',
      folder: 'Reading list',
      createdAt: Date.now(),
    },
  });
  await expect(page.locator('.newtab-reading-items')).toContainText(
    'A saved article for the reading list',
  );
  await page.locator('.newtab-reading-items button').click();
  await expect.poll(activeURL).toBe(fixture);
  await expect
    .poll(async () => {
      const s = await snap();
      return s.tabs.find((t) => t.id === s.activeId).title;
    })
    .toBe('Owned home fixture');
  await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await expect(page.locator('.recent-sites')).toContainText('Owned home fixture');
  for (const background of ['plain', 'grid', 'orbital']) {
    await cmd({ type: 'settings', patch: { background } });
    await expect(page.locator('.newtab')).toHaveClass(new RegExp(`background-${background}`));
    await expect(page.locator('.newtab-orbit')).toHaveCount(0);
  }
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
      await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);
    await expect(page.locator('.newtab-library')).toBeVisible();
    await capture(`test-results/interface-newtab-${theme}.png`);
  }
  await win.evaluate(async (w) => {
    w.setSize(760, 600);
    await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(760);
  await cmd({ type: 'settings', patch: { textScale: 1.3 } });
  await expect(page.locator('.speed-open').first()).toBeVisible();
  assert.ok(await page.locator('.page-content').evaluate((e) => e.scrollWidth <= e.clientWidth));
  for (const language of ['tr-TR', 'de-DE', 'fr-FR', 'en-US']) {
    await cmd({ type: 'settings', patch: { language } });
    await expect(page.locator('.newtab-hero')).toBeVisible();
    assert.ok(await page.locator('.page-content').evaluate((e) => e.scrollWidth <= e.clientWidth));
  }
  await capture('test-results/home-narrow.png');
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
  await expect(create).toHaveCount(1);
  await expect(create).toBeInViewport();
  const createBox = await create.boundingBox();
  const scrollBox = await page.locator('.tab-scroll').boundingBox();
  assert.ok(
    createBox.x >= scrollBox.x + scrollBox.width - 1,
    'new-tab button remains accessible after the overflowing tab strip',
  );
  const tabCount = (await snap()).tabs.length;
  await create.click();
  await expect.poll(async () => (await snap()).tabs.length).toBe(tabCount + 1);
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
  await expect(create).toBeInViewport();
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
    await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);
  await expect(page.locator('.tabs-container.vertical')).toHaveCount(1);
  await expect(page.locator('.titlebar .tabs-container')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New tab (Ctrl+T)', exact: true })).toHaveCount(1);
  await page.locator('.tab.selected').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="tab"]').nth(1)).toHaveAttribute('aria-selected', 'true');
  await win.evaluate(async (w) => {
    w.setSize(760, 600);
    await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
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
    'PASS: new-tab button follows one/two tabs, pinned tabs and expanded/collapsed groups, follows tab closure, creates a tab and stays visible during overflow and manual scrolling; home reading list opens a real saved page, recent history, three background options, four languages at 130%, site cards, light/dark captures, library access, settings search, keyboard navigation and responsive vertical tabs; every window hidden',
  );
} finally {
  await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
