import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dot-language-theme-'));
const env = {
  ...process.env,
  DOT_TEST_DATA: directory,
  DOT_TEST_HIDDEN: '1',
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
let fixtureImage = '';
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  const media =
    req.url === '/native'
      ? '@media(prefers-color-scheme:dark){body{background:#111;color:white}}'
      : '';
  res.end(
    `<title>Owned theme fixture</title><style>html,body{margin:0;background:white;color:black;height:100vh}${media}img{position:absolute;left:80px;top:80px}</style><p>Theme fixture</p><img width="40" height="40" src="${fixtureImage}"><input value="keep me">`,
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
let app;
let page;
async function launch() {
  app = await electron.launch(
    process.env.DOT_PACKAGED
      ? {
          executablePath: resolve('release/win-unpacked/Dot Browser.exe'),
          env,
        }
      : { args: ['.'], env },
  );
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  await page.waitForSelector('.app');
  if (process.env.DOT_PACKAGED)
    await app.evaluate(({ app }) => {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    });
}
async function cmd(command) {
  const result = await page.evaluate((c) => window.dot.command(c), command);
  assert.ok(result.ok, result.error);
  return result;
}
async function web(code) {
  const s = await page.evaluate(() => window.dot.snapshot());
  const id = s.tabs.find((t) => t.id === s.activeId).webContentsId;
  return app.evaluate(
    ({ webContents }, { id, code }) => webContents.fromId(id).executeJavaScript(code),
    { id, code },
  );
}
async function pixel(x, y) {
  const s = await page.evaluate(() => window.dot.snapshot());
  const id = s.tabs.find((t) => t.id === s.activeId).webContentsId;
  return app.evaluate(
    async ({ webContents }, { id, x, y }) => {
      const image = await webContents
        .fromId(id)
        .capturePage({ x, y, width: 1, height: 1 }, { stayHidden: true, stayAwake: true });
      const bitmap = image.toBitmap();
      if (bitmap.length < 4) throw new Error('Empty fixture capture');
      return [...bitmap].slice(0, 4);
    },
    { id, x, y },
  );
}
try {
  await launch();
  fixtureImage = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.from([0, 0, 255, 255]), { width: 1, height: 1 })
      .toDataURL(),
  );
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await cmd({ type: 'tab.navigate', input: 'browser://settings#languages' });
  const locales = [
    ['tr-TR', 'Ayarlar', 'Tarayıcı menüsü', 'Parolalar ve otomatik doldurma', 'Tarayıcı dili'],
    [
      'de-DE',
      'Einstellungen',
      'Browsermenü',
      'Passwörter und automatisches Ausfüllen',
      'Browsersprache',
    ],
    [
      'fr-FR',
      'Paramètres',
      'Menu du navigateur',
      'Mots de passe et saisie automatique',
      'Langue du navigateur',
    ],
    ['en-US', 'Settings', 'Browser menu', 'Passwords and autofill', 'Browser language'],
  ];
  for (const [language, settings, menu, passwords, languageLabel] of locales) {
    await page.locator('#setting-language').selectOption(language);
    await expect(page.locator('.settings-nav h2')).toHaveText(settings);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('.settings-content')).toContainText(languageLabel);
    await page.getByRole('button', { name: menu, exact: true }).click();
    await expect(page.getByRole('dialog', { name: menu, exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: settings, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cmd({ type: 'tab.navigate', input: 'browser://settings#advanced' });
    // A restored internal page needs a new component for the selected section.
    await cmd({ type: 'tab.new', url: 'browser://settings#advanced' });
    await expect(page.locator('.settings-content')).toContainText(passwords);
    await cmd({ type: 'tab.new', url: 'browser://settings#languages' });
  }
  await cmd({ type: 'settings', patch: { theme: 'light', language: 'tr-TR', animations: false } });
  await cmd({ type: 'tab.navigate', input: url });
  await expect.poll(() => web('document.title')).toBe('Owned theme fixture');
  await expect
    .poll(async () => (await pixel(20, 250)).slice(0, 3).every((v) => v > 235))
    .toBe(true);
  const lightImage = await pixel(95, 95);
  await web(
    "document.querySelector('input').value = 'typed while browsing'; window.dotThemeMarker = 'live page';",
  );
  await cmd({ type: 'settings', patch: { theme: 'dark', forceDarkPages: true } });
  await expect.poll(() => web("matchMedia('(prefers-color-scheme: dark)').matches")).toBe(true);
  await expect
    .poll(async () => (await pixel(20, 250)).slice(0, 3).every((v) => v < 100))
    .toBe(true);
  const darkImage = await pixel(95, 95);
  assert.deepEqual(darkImage, lightImage, 'image colors must be preserved');
  assert.equal(await web('document.querySelector("input").value'), 'typed while browsing');
  assert.equal(await web('window.dotThemeMarker'), 'live page');
  await cmd({ type: 'extension.install', builtin: 'night' });
  await cmd({ type: 'tab.action', action: 'reload' });
  await expect.poll(() => web('getComputedStyle(document.documentElement).filter')).toBe('none');
  await page.getByRole('button', { name: 'Site bilgileri', exact: true }).click();
  await page.getByLabel('Bu siteyi açık renkte tut').check();
  await page
    .getByRole('dialog', { name: 'Site bilgileri' })
    .getByRole('button', { name: 'Kapat', exact: true })
    .click();
  await expect
    .poll(async () => (await pixel(20, 250)).slice(0, 3).every((v) => v > 235))
    .toBe(true);
  await cmd({ type: 'settings', patch: { darkSiteExceptions: [], forceDarkPages: false } });
  await expect
    .poll(async () => (await pixel(20, 250)).slice(0, 3).every((v) => v > 235))
    .toBe(true);
  await cmd({ type: 'tab.navigate', input: url + 'native' });
  await expect
    .poll(() => web('getComputedStyle(document.body).backgroundColor'))
    .toBe('rgb(17, 17, 17)');
  await cmd({ type: 'settings', patch: { forceDarkPages: true } });
  const sleepingId = (await page.evaluate(() => window.dot.snapshot())).activeId;
  await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await cmd({ type: 'tab.action', action: 'suspend', id: sleepingId });
  assert.equal(
    (await page.evaluate(() => window.dot.snapshot())).tabs.find((t) => t.id === sleepingId)
      .suspended,
    true,
  );
  await cmd({ type: 'tab.action', action: 'select', id: sleepingId });
  await expect.poll(() => web('document.title')).toBe('Owned theme fixture');
  await expect.poll(() => web("matchMedia('(prefers-color-scheme: dark)').matches")).toBe(true);
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = async (text) => {
      globalThis.dotCopied = text;
    };
  });
  await page.getByRole('button', { name: 'Tarayıcı menüsü', exact: true }).click();
  await page.getByText('Sayfa araçları', { exact: true }).click();
  await page.getByRole('button', { name: 'Sayfa bağlantısını kopyala', exact: true }).click();
  assert.equal(await app.evaluate(() => globalThis.dotCopied), url + 'native');
  await cmd({ type: 'page', action: 'readLater' });
  await cmd({ type: 'page', action: 'readLater' });
  let state = await page.evaluate(() => window.dot.snapshot());
  assert.equal(
    state.bookmarks.filter((b) => b.folder === 'Reading list' && b.url === url + 'native').length,
    1,
  );
  assert.equal(state.settings.language, 'tr-TR');
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  await app.close();
  await launch();
  await expect(page.getByRole('button', { name: 'Tarayıcı menüsü', exact: true })).toBeVisible();
  state = await page.evaluate(() => window.dot.snapshot());
  assert.equal(state.settings.language, 'tr-TR');
  assert.ok(state.bookmarks.some((b) => b.folder === 'Reading list'));
  const mainWindow = await app.browserWindow(page);
  await mainWindow.evaluate((w) => w.setSize(820, 620));
  await cmd({ type: 'settings', patch: { textScale: 1.3 } });
  for (const [language, , menu] of locales) {
    await cmd({ type: 'settings', patch: { language } });
    await cmd({ type: 'tab.navigate', input: 'browser://settings#languages' });
    await page.getByRole('button', { name: menu, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: menu, exact: true });
    const rect = await dialog.boundingBox();
    assert.ok(
      rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 821 && rect.y + rect.height <= 621,
    );
    if (!process.env.DOT_PACKAGED && language === 'de-DE')
      await page.screenshot({
        path: 'test-results/language-de-menu.png',
        animations: 'disabled',
        timeout: 10000,
      });
    await dialog.locator('.modal-heading button').click();
    await expect(dialog).toHaveCount(0);
    if (!process.env.DOT_PACKAGED && language === 'tr-TR')
      await page.screenshot({
        path: 'test-results/language-tr-settings.png',
        animations: 'disabled',
        timeout: 10000,
      });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  console.log(
    'PASS: four live UI languages, persisted language, dark rendering, preserved image colors/input, site exception, native dark preference, suspend/resume, copy link, deduplicated reading list, hidden windows',
  );
  const logs = await readFile(join(directory, 'browser.log'), 'utf8').catch(() => '');
  assert.ok(!logs.includes('page-theme'), 'no dark engine protocol errors');
} finally {
  if (app) await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
