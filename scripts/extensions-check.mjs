import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dot-extension-ui-'));
const env = {
  ...process.env,
  DOT_TEST_HIDDEN: '1',
  DOT_TEST_DATA: directory,
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    '<title>Extension fixture</title><style>body{height:4000px;background:#fff;color:#111}</style><h1>Extension fixture</h1><p>Owned test page</p>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const custom = join(directory, 'custom');
await mkdir(custom);
await writeFile(
  join(custom, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Test fixture extension',
    version: '1.0',
    permissions: ['tabs', 'contextMenus'],
    background: { service_worker: 'worker.js' },
    action: { default_popup: 'popup.html', default_title: 'Fixture action' },
    content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['content.js'] }],
  }),
);
await writeFile(
  join(custom, 'content.js'),
  'document.documentElement.dataset.dotExtensionFixture="working"; chrome.runtime.sendMessage({kind:"tabs"}, response=>{document.documentElement.dataset.dotTabs=JSON.stringify(response);});',
);
await writeFile(
  join(custom, 'worker.js'),
  'chrome.action.setBadgeText({text:"OK"}); chrome.contextMenus.create({id:"fixture-menu",title:"Fixture menu",contexts:["page"]}); chrome.runtime.onMessage.addListener((message,sender,reply)=>{ if(message.kind==="tabs") chrome.tabs.query({},tabs=>reply({tabs,error:chrome.runtime.lastError?.message})); else if(message.kind==="create") chrome.tabs.create({url:message.url,active:false},tab=>reply({tab,error:chrome.runtime.lastError?.message})); return true; });',
);
await writeFile(
  join(custom, 'popup.html'),
  '<!doctype html><html><body style="width:240px;height:140px"><h1>Fixture popup</h1><button id="create">Create a tab</button><script src="popup.js"></script></body></html>',
);
await writeFile(
  join(custom, 'popup.js'),
  `document.getElementById('create').onclick=()=>chrome.runtime.sendMessage({kind:'create',url:${JSON.stringify(url + 'extension-created')}},r=>document.body.dataset.result=JSON.stringify(r));`,
);
let app, page;
async function launch() {
  app = await electron.launch(
    process.env.DOT_PACKAGED
      ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), env }
      : { args: ['.'], env },
  );
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.waitForSelector('.app');
  if (process.env.DOT_PACKAGED)
    await app.evaluate(({ app }) => {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      const updater = req('electron-updater').autoUpdater;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
    });
}
async function cmd(c) {
  const r = await page.evaluate((c) => window.dot.command(c), c);
  assert.equal(r.ok, true, r.error);
  return r;
}
async function web(code) {
  const state = await page.evaluate(() => window.dot.snapshot());
  const id = state.tabs.find((t) => t.id === state.activeId).webContentsId;
  return app.evaluate(
    ({ webContents }, { id, code }) => webContents.fromId(id).executeJavaScript(code),
    { id, code },
  );
}
async function navigate() {
  await cmd({ type: 'tab.navigate', input: url });
  await expect
    .poll(async () => {
      const s = await page.evaluate(() => window.dot.snapshot());
      return s.tabs.find((t) => t.id === s.activeId)?.title;
    })
    .toBe('Extension fixture');
}
async function capture(path) {
  if (!process.env.DOT_PACKAGED) await page.screenshot({ path, animations: 'disabled' });
}
try {
  await launch();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await capture('test-results/clean-new-tab.png');
  assert.ok(await page.getByRole('button', { name: 'Browser menu', exact: true }).count());
  assert.equal(await page.getByRole('button', { name: 'Saved passwords', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Browser menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Browser menu', exact: true })).toBeVisible();
  await capture('test-results/clean-browser-menu.png');
  await page.getByRole('button', { name: 'Extensions', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'Extensions', exact: true })).toBeVisible();
  await page
    .locator('.extension-card')
    .filter({ hasText: 'Back to top' })
    .getByRole('button', { name: 'Add', exact: true })
    .click();
  await expect(page.locator('.extension-card.installed')).toHaveCount(1);
  await capture('test-results/extensions-manager.png');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await navigate();
  await expect.poll(() => web('!!document.querySelector("[data-dot-scroll-top]")')).toBe(true);
  const installed = (await cmd({ type: 'extension.list' })).extensions[0];
  await cmd({ type: 'extension.action', id: installed.id, action: 'disable' });
  await cmd({ type: 'tab.action', action: 'reload' });
  await expect.poll(() => web('!!document.querySelector("[data-dot-scroll-top]")')).toBe(false);
  await cmd({ type: 'extension.action', id: installed.id, action: 'enable' });
  await cmd({ type: 'tab.action', action: 'reload' });
  await expect.poll(() => web('!!document.querySelector("[data-dot-scroll-top]")')).toBe(true);
  await cmd({ type: 'extension.install', builtin: 'night' });
  await cmd({ type: 'settings', patch: { theme: 'light' } });
  await cmd({ type: 'tab.action', action: 'reload' });
  await expect
    .poll(() => web('getComputedStyle(document.documentElement).filter'))
    .toContain('invert');
  await cmd({ type: 'settings', patch: { theme: 'dark' } });
  await expect.poll(() => web('getComputedStyle(document.documentElement).filter')).toBe('none');
  await app.evaluate(({ dialog }, custom) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [custom] });
  }, custom);
  await cmd({ type: 'extension.install' });
  await cmd({ type: 'tab.action', action: 'reload' });
  await expect
    .poll(() => web('document.documentElement.dataset.dotExtensionFixture'))
    .toBe('working');
  await expect
    .poll(() => web('!!document.documentElement.dataset.dotTabs'), { timeout: 15000 })
    .toBe(true);
  const realTabs = await web('JSON.parse(document.documentElement.dataset.dotTabs)');
  assert.equal(realTabs.error, undefined);
  const normal = await page.evaluate(() => window.dot.snapshot());
  assert.ok(
    realTabs.tabs.some(
      (t) =>
        t.id === normal.tabs.find((t) => t.id === normal.activeId).webContentsId &&
        t.active &&
        t.url === url,
    ),
  );
  assert.ok(
    !realTabs.tabs.some((t) => t.url.startsWith('file:')),
    'trusted interface is never exposed as a browser tab',
  );
  await expect(page.locator('browser-action-list button').first()).toBeVisible();
  const popupWait = app.waitForEvent('window');
  await page.locator('browser-action-list button').first().click();
  const popup = await popupWait;
  await expect(popup.locator('h1')).toHaveText('Fixture popup');
  await popup.locator('#create').click();
  await expect.poll(() => popup.evaluate(() => document.body.dataset.result)).toBeTruthy();
  const created = await popup.evaluate(() => JSON.parse(document.body.dataset.result));
  assert.equal(created.error, undefined);
  assert.ok(created.tab.id > 0);
  assert.equal(
    (await page.evaluate(() => window.dot.snapshot())).activeId,
    normal.activeId,
    'background extension tabs must preserve the active tab',
  );
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.dot.snapshot())).tabs.some(
        (t) => t.url === url + 'extension-created',
      ),
    )
    .toBe(true);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible()),
    ),
    false,
  );
  await (await app.browserWindow(popup)).evaluate((window) => window.close());
  const duplicate = await page.evaluate(() =>
    window.dot.command({ type: 'extension.install', builtin: 'scroll' }),
  );
  assert.equal(duplicate.ok, false);
  await app.close();
  await launch();
  await navigate();
  await expect
    .poll(() => web('document.documentElement.dataset.dotExtensionFixture'))
    .toBe('working');
  await expect.poll(() => web('!!document.querySelector("[data-dot-scroll-top]")')).toBe(true);
  assert.equal((await cmd({ type: 'extension.list' })).extensions.length, 3);
  const privateWindow = app.waitForEvent('window');
  await cmd({ type: 'window', action: 'private' });
  const privatePage = await privateWindow;
  await privatePage.waitForSelector('.app');
  const rejected = await privatePage.evaluate(() =>
    window.dot.command({ type: 'extension.install', builtin: 'night' }),
  );
  assert.equal(rejected.ok, false);
  await privatePage.evaluate(
    (url) => window.dot.command({ type: 'tab.navigate', input: url }),
    url,
  );
  await expect
    .poll(async () => {
      const s = await privatePage.evaluate(() => window.dot.snapshot());
      return s.tabs.find((t) => t.id === s.activeId).title;
    })
    .toBe('Extension fixture');
  const privateState = await privatePage.evaluate(() => window.dot.snapshot());
  const privateId = privateState.tabs.find((t) => t.id === privateState.activeId).webContentsId;
  assert.equal(
    await app.evaluate(
      ({ webContents }, id) =>
        webContents
          .fromId(id)
          .executeJavaScript(
            '!!document.querySelector("[data-dot-scroll-top]") || !!document.documentElement.dataset.dotExtensionFixture',
          ),
      privateId,
    ),
    false,
  );
  assert.equal(
    await app.evaluate(
      ({ session }) =>
        session.fromPartition('persist:dot-personal').extensions.getAllExtensions().length,
    ),
    3,
  );
  const current = (await cmd({ type: 'extension.list' })).extensions;
  for (const item of current)
    await cmd({ type: 'extension.action', id: item.id, action: 'remove' });
  assert.equal((await cmd({ type: 'extension.list' })).extensions.length, 0);
  const normalWindow = await app.browserWindow(page);
  await normalWindow.evaluate((window) => window.setSize(820, 620));
  await cmd({ type: 'tab.new', url: 'browser://newtab' });
  await page.getByRole('button', { name: 'Browser menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Browser menu', exact: true })).toBeVisible();
  const rect = await page.getByRole('dialog', { name: 'Browser menu', exact: true }).boundingBox();
  assert.ok(
    rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= (await page.evaluate(() => innerWidth)),
  );
  console.log(
    'PASS: clean menu, builtin DOM/CSS injection, toggle/remove, MV3 service worker real tabs.query, action popup, background tabs.create, isolated interface, persistence, private rejection, narrow menu; every window hidden',
  );
} catch (error) {
  if (app) {
    console.error(
      'Extension worker diagnostics:',
      await app
        .evaluate(({ session }) => ({
          workers: session.fromPartition('persist:dot-personal').serviceWorkers.getAllRunning(),
          preloads: session.fromPartition('persist:dot-personal').getPreloadScripts(),
        }))
        .catch(() => null),
    );
  }
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
