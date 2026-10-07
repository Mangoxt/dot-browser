import { _electron as electron, expect as baseExpect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
const expect = baseExpect.configure({ timeout: 15000 });
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<title>Owned menu fixture</title><h1>Owned page</h1><input id="draft" value="unsaved text">',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const directory = await mkdtemp(join(tmpdir(), 'dot-menu-'));
const env = {
  ...process.env,
  DOT_TEST_HIDDEN: '1',
  DOT_TEST_DATA: directory,
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
  await page.waitForSelector('.app');
  const win = await app.browserWindow(page);
  await app.evaluate(({ app, clipboard }) => {
    clipboard.writeText = (text) => {
      globalThis.dotMenuClipboard = text;
    };
    if (app.isPackaged) {
      const req = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    }
  });
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const cmd = async (c) => {
    const r = await page.evaluate((c) => window.dot.command(c), c);
    assert.ok(r.ok, r.error);
    return r;
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  const button = (label) => page.getByRole('button', { name: label, exact: true }).last();
  const menu = () => button('Browser menu').click();
  await cmd({
    type: 'settings',
    patch: { animations: false, sidebar: false, language: 'en-US', theme: 'dark' },
  });
  const capture = async (name) => {
    const path = `test-results/menu-${name}${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`;
    if (!process.env.DOT_PACKAGED) return page.screenshot({ path, animations: 'disabled' });
    await win.evaluate(async (w) =>
      w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true }),
    );
    const bytes = await win.evaluate(async (w) => [
      ...(
        await w.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true })
      ).toPNG(),
    ]);
    await writeFile(path, Buffer.from(bytes));
  };
  const fits = async () => {
    const data = await page
      .getByRole('dialog', { name: 'Browser menu', exact: true })
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        const header = document.querySelector('.browser-header').getBoundingClientRect();
        const footer = el.querySelector('.browser-menu-footer').getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          header: header.bottom,
          width: innerWidth,
          height: innerHeight,
          overflow: el.scrollWidth > el.clientWidth,
          footer: footer.bottom,
        };
      });
    assert.ok(
      data.x >= 0 &&
        data.right <= data.width &&
        data.y >= data.header &&
        data.bottom <= data.height,
    );
    assert.equal(data.overflow, false);
    assert.ok(data.footer <= data.bottom);
    await expect(button('Settings')).toBeInViewport();
  };
  await menu();
  await expect(button('New tab')).toBeFocused();
  await expect(button('Zoom in')).toBeDisabled();
  await capture('main-dark');
  await button('Page tools').click();
  await expect(button('Back to menu')).toBeFocused();
  await expect(button('Screenshot')).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await expect(button('Close dialog')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button('Page tools')).toBeFocused();
  await expect(page.locator('[data-menu-view="main"]')).toBeVisible();
  await button('Tabs and windows').click();
  await expect(button('Reopen closed tab')).toBeDisabled();
  await expect(button('Split view')).toBeEnabled();
  await button('Back to menu').click();
  await expect(button('Tabs and windows')).toBeFocused();
  await button('Profile and import').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(button('About Dot')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button('Profile and import')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button('Browser menu')).toBeFocused();
  await cmd({ type: 'tab.navigate', input: url });
  await expect
    .poll(async () =>
      (await snap()).tabs.some(
        (t) => t.url === url && !t.loading && t.title === 'Owned menu fixture',
      ),
    )
    .toBe(true);
  await menu();
  await button('Zoom in').click();
  await expect(button('Reset zoom')).toHaveText('110%');
  await expect(page.getByRole('dialog', { name: 'Browser menu', exact: true })).toBeVisible();
  await button('Reset zoom').click();
  await expect(button('Reset zoom')).toHaveText('100%');
  await button('Page tools').click();
  await expect(button('Screenshot')).toBeEnabled();
  await capture('page-tools');
  await button('Copy page link').click();
  await expect.poll(() => app.evaluate(() => globalThis.dotMenuClipboard)).toBe(url);
  await menu();
  await button('Page tools').click();
  await button('Find in page').click();
  await expect(page.locator('.find-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await menu();
  await button('Tabs and windows').click();
  await button('Saved sessions').click();
  await expect(page.getByRole('dialog', { name: 'Saved sessions', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button('Browser menu')).toBeFocused();
  await menu();
  await button('Extensions').click();
  await expect(page.getByRole('dialog', { name: 'Extensions', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button('Browser menu')).toBeFocused();
  const count = (await snap()).tabs.length;
  await menu();
  await button('New tab').click();
  await expect.poll(async () => (await snap()).tabs.length).toBe(count + 1);
  await cmd({ type: 'tab.action', action: 'close' });
  await menu();
  await button('Tabs and windows').click();
  await expect(button('Reopen closed tab')).toBeEnabled();
  await button('Reopen closed tab').click();
  await expect.poll(async () => (await snap()).tabs.length).toBe(count + 1);
  await cmd({ type: 'tab.action', action: 'close' });
  for (const theme of ['light', 'dark']) {
    await cmd({ type: 'settings', patch: { theme } });
    await menu();
    await fits();
    await capture(`main-${theme}`);
    await page.keyboard.press('Escape');
  }
  for (const language of ['en-US', 'tr-TR', 'de-DE', 'fr-FR']) {
    await cmd({ type: 'settings', patch: { language, textScale: 1.3, compact: true } });
    await win.evaluate((w) => w.setSize(760, 540));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(760);
    await page.locator('.toolbar').getByRole('button').last().click();
    // Dialog content is identified structurally to avoid repeating translated names.
    const dialog = page.locator('.browser-menu-modal');
    await expect(dialog).toBeVisible();
    const geometry = await dialog.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const footer = el.querySelector('.browser-menu-footer').getBoundingClientRect();
      return {
        right: box.right,
        bottom: box.bottom,
        width: innerWidth,
        height: innerHeight,
        overflow: el.scrollWidth > el.clientWidth,
        footer: footer.bottom,
      };
    });
    assert.ok(
      geometry.right <= geometry.width &&
        geometry.bottom <= geometry.height &&
        geometry.footer <= geometry.bottom,
    );
    assert.equal(geometry.overflow, false);
    await dialog.locator('[data-menu-target="tabs"]').click();
    await expect(dialog.locator('[data-menu-view="tabs"]')).toBeVisible();
    assert.equal(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth), false);
    await capture(`narrow-${language}`);
    await page.keyboard.press('Escape');
    await expect(dialog.locator('[data-menu-view="main"]')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await cmd({ type: 'settings', patch: { language: 'tr-TR', textScale: 1, compact: false } });
  await win.evaluate((w) => w.setSize(1360, 900));
  await page.locator('.toolbar').getByRole('button').last().click();
  const previewRect = await page.locator('.browser-menu-modal').boundingBox();
  const previewBytes = await win.evaluate(
    async (w, rect) => [
      ...(
        await w.webContents.capturePage(
          {
            x: Math.floor(rect.x),
            y: Math.floor(rect.y),
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
          },
          { stayHidden: false, stayAwake: true },
        )
      ).toPNG(),
    ],
    previewRect,
  );
  await writeFile('test-results/menu-preview.png', Buffer.from(previewBytes));
  await page.keyboard.press('Escape');
  await cmd({ type: 'settings', patch: { language: 'en-US' } });
  const privateWait = app.waitForEvent('window');
  await menu();
  await button('Private window').click();
  const privatePage = await privateWait;
  await privatePage.waitForSelector('.app');
  assert.equal((await privatePage.evaluate(() => window.dot.snapshot())).private, true);
  await privatePage.getByRole('button', { name: 'Browser menu', exact: true }).click();
  await privatePage.getByRole('button', { name: 'Tabs and windows', exact: true }).click();
  await expect(
    privatePage.getByRole('button', { name: 'Saved sessions', exact: true }),
  ).toBeDisabled();
  const privateWindow = await app.browserWindow(privatePage);
  await privateWindow.evaluate((w) => w.close());
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(1);
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  console.log(
    'PASS: redesigned main/submenus, back/Escape/arrow keys/focus trap, live zoom, copy/find, sessions/extensions/new/reopen/private actions, four languages at 130% and 760px, visible settings/footer; every window hidden and clipboard stubbed.',
  );
} finally {
  await app.close();
  await new Promise((r) => server.close(r));
}
