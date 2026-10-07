import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const handler = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<title>Owned ${req.url.startsWith('/one') ? 'Article One' : req.url.startsWith('/two') ? 'Article Two' : 'Memory Page'}</title><input id="draft" placeholder="Owned draft"><p>Local fixture</p><script>window.fixtureMarker=Math.random()</script>`,
  );
};
const servers = [createServer(handler), createServer(handler)];
await Promise.all(servers.map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
const base = `http://127.0.0.1:${servers[0].address().port}`;
const other = `http://127.0.0.1:${servers[1].address().port}`;
const directory = await mkdtemp(join(tmpdir(), 'dot-productivity-'));
const env = {
  ...process.env,
  DOT_TEST_HIDDEN: '1',
  DOT_TEST_DATA: directory,
  APPDATA: join(directory, 'appdata'),
  LOCALAPPDATA: join(directory, 'localappdata'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOT_DEV_URL;
let app, page;
const chrome = () => app.windows().filter((p) => p.url().includes('/dist/renderer/index.html'));
async function launch(expectedURL) {
  app = await electron.launch(
    process.env.DOT_PACKAGED
      ? { executablePath: resolve('release/win-unpacked/Dot Browser.exe'), env }
      : { args: ['.'], env },
  );
  await app.firstWindow();
  await expect.poll(() => chrome().length).toBeGreaterThan(0);
  page = chrome()[0];
  if (expectedURL) {
    await expect
      .poll(
        async () => {
          for (const candidate of chrome()) {
            try {
              const state = await candidate.evaluate(() => window.dot.snapshot());
              if (state.tabs.find((t) => t.id === state.activeId)?.url === expectedURL) {
                page = candidate;
                return true;
              }
            } catch {
              /* Another restored window may still be starting. */
            }
          }
          return false;
        },
        { timeout: 20000 },
      )
      .toBe(true);
  }
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
const snapshot = (target = page) => target.evaluate(() => window.dot.snapshot());
async function cmd(command, target = page) {
  const r = await target.evaluate((c) => window.dot.command(c), command);
  assert.ok(r.ok, r.error);
  return r;
}
const active = async (target = page) => {
  const s = await snapshot(target);
  return s.tabs.find((t) => t.id === s.activeId);
};
async function loaded(target = page) {
  await expect.poll(async () => !(await active(target)).loading).toBe(true);
}
async function nativeZoom(target = page) {
  const tab = await active(target);
  return app.evaluate(
    ({ webContents }, id) => webContents.fromId(id).getZoomFactor(),
    tab.webContentsId,
  );
}
async function capture(name) {
  const path = `test-results/productivity-${name}${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`;
  if (!process.env.DOT_PACKAGED) return page.screenshot({ path, animations: 'disabled' });
  const win = await app.browserWindow(page);
  await win.evaluate(async (w) =>
    w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }),
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const bytes = await win.evaluate(async (w) => [
    ...(await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG(),
  ]);
  await writeFile(path, Buffer.from(bytes));
}
async function openSessions(target = page) {
  await target.getByRole('button', { name: 'Browser menu', exact: true }).click();
  await target.getByRole('button', { name: 'Tabs and windows', exact: true }).click();
  await target.getByRole('button', { name: 'Saved sessions', exact: true }).click();
  await expect(target.getByRole('dialog', { name: 'Saved sessions', exact: true })).toBeVisible();
}
async function openTabSearch(target = page) {
  await target.getByRole('button', { name: 'Search tabs (Ctrl+Shift+A)', exact: true }).click();
  await expect(target.getByRole('dialog', { name: 'Search tabs', exact: true })).toBeVisible();
}
try {
  await launch();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await cmd({ type: 'settings', patch: { animations: false, sidebar: false } });
  const originalWorkspace = (await snapshot()).workspaceId;
  const url = base + '/one?utm_source=news&id=42#part';
  await cmd({ type: 'tab.new', url });
  await loaded();
  const firstId = (await active()).id;
  const firstWC = (await active()).webContentsId;
  const marker = await app.evaluate(
    ({ webContents }, id) =>
      webContents
        .fromId(id)
        .executeJavaScript(
          "document.querySelector('#draft').value='owned draft survives';window.fixtureMarker",
        ),
    firstWC,
  );
  await cmd({ type: 'zoom', value: 1.4 });
  assert.equal(await nativeZoom(), 1.4);
  await cmd({ type: 'tab.new', url: base + '/two' });
  await loaded();
  const secondId = (await active()).id;
  assert.equal(await nativeZoom(), 1.4, 'new same-origin tabs use remembered zoom');
  await cmd({ type: 'tab.navigate', input: other + '/third' });
  await loaded();
  assert.equal(await nativeZoom(), 1, 'different port uses a separate zoom preference');
  await cmd({ type: 'tab.navigate', input: base + '/two' });
  await loaded();
  assert.equal(await nativeZoom(), 1.4);
  await cmd({ type: 'group.save', name: 'Reading', color: '#a398ff', tabId: secondId });
  const originalGroup = (await active()).groupId;
  await cmd({ type: 'tab.action', action: 'pin', id: firstId });
  await cmd({ type: 'tab.action', action: 'mute', id: secondId });
  await openSessions();
  await page.getByRole('textbox', { name: 'Session name', exact: true }).fill('Research');
  await page.getByRole('button', { name: 'Save current workspace', exact: true }).click();
  await expect.poll(async () => (await snapshot()).savedSessions.length).toBe(1);
  let saved = (await snapshot()).savedSessions[0];
  assert.equal(saved.tabs.length, 3);
  assert.equal(saved.groups.length, 1);
  await page.getByRole('button', { name: 'View saved tabs', exact: true }).click();
  await expect(page.locator('.session-tab-preview')).toContainText('Owned Article Two');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'New session name', exact: true })
    .fill('Research renamed');
  await page
    .locator('.session-inline-form')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.locator('.session-card-heading strong')).toHaveText('Research renamed');
  await page
    .getByRole('searchbox', { name: 'Search saved sessions', exact: true })
    .fill('Owned Article Two');
  await expect(page.locator('.session-card')).toHaveCount(1);
  await capture('sessions');
  const before = await snapshot();
  await page.getByRole('button', { name: 'Open session', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let state = await snapshot();
  assert.equal(state.tabs.length, before.tabs.length + 3);
  assert.notEqual(state.workspaceId, originalWorkspace);
  const restored = state.tabs.filter((t) => t.workspaceId === state.workspaceId);
  assert.ok(
    restored.every((t) => !before.tabs.some((old) => old.id === t.id)),
    'restored tabs get fresh IDs',
  );
  assert.notEqual(
    restored.find((t) => t.groupId)?.groupId,
    originalGroup,
    'group IDs are isolated in the new workspace',
  );
  assert.ok(restored.find((t) => t.url === url).pinned);
  assert.ok(restored.find((t) => t.url === base + '/two').muted);
  assert.equal((await active()).url, base + '/two');
  await loaded();
  assert.equal(
    await app.evaluate(
      ({ webContents }, { id, marker }) => {
        const wc = webContents.fromId(id);
        return wc.executeJavaScript(
          `window.fixtureMarker===${marker} && document.querySelector('#draft').value==='owned draft survives'`,
        );
      },
      { id: firstWC, marker },
    ),
    true,
    'saving/restoring leaves original DOM and draft intact',
  );
  console.log(
    'PASS named session save/search/preview/rename/restore, groups and original live-page state',
  );
  await cmd({ type: 'workspace.action', action: 'select', id: originalWorkspace });
  await cmd({ type: 'tab.action', action: 'close', id: firstId });
  await cmd({ type: 'tab.action', action: 'close', id: secondId });
  await openTabSearch();
  await page.getByRole('button', { name: 'Recently closed', exact: true }).click();
  const closedInput = page.getByRole('combobox', { name: 'Search closed tabs', exact: true });
  await closedInput.fill('Article One');
  await closedInput.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await active()).url, url);
  assert.ok((await active()).pinned);
  assert.ok(
    (await snapshot()).closedTabs.some((c) => c.tab.id === secondId),
    'selecting one closed entry preserves the others',
  );
  await cmd({
    type: 'tab.action',
    action: 'suspend',
    id: restored.find((t) => t.url === base + '/two').id,
  });
  await openTabSearch();
  await page.getByRole('combobox', { name: 'Search open tabs', exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Filter tabs', exact: true }).selectOption('sleeping');
  await expect(page.locator('.tab-search-results [role=option]')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Filter tabs', exact: true }).selectOption('workspace');
  const current = await snapshot();
  await expect(page.locator('.tab-search-results [role=option]')).toHaveCount(
    current.tabs.filter((t) => t.workspaceId === current.workspaceId).length,
  );
  await page.keyboard.press('Escape');
  await app.evaluate(({ clipboard }) => {
    globalThis.dotClipboard = '';
    clipboard.writeText = async (text) => {
      globalThis.dotClipboard = text;
    };
  });
  await cmd({ type: 'page', action: 'copyCleanLink' });
  assert.equal(await app.evaluate(() => globalThis.dotClipboard), base + '/one?id=42#part');
  await cmd({ type: 'page', action: 'copyLink' });
  assert.equal(await app.evaluate(() => globalThis.dotClipboard), url);
  await page.getByRole('button', { name: 'Site information', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Never put this site to sleep', exact: true }).check();
  await expect
    .poll(async () => (await snapshot()).settings.keepAwakeSites.includes(base))
    .toBe(true);
  await page.keyboard.press('Escape');
  console.log(
    'PASS selected closed-tab restore, workspace/sleep filters, exact-origin zoom and clean/original clipboard actions',
  );
  await app.evaluate(() => {
    const original = globalThis.setInterval;
    globalThis.dotOriginalInterval = original;
    globalThis.dotMemoryTicks = [];
    globalThis.setInterval = (fn, delay, ...args) => {
      if (delay === 60000) globalThis.dotMemoryTicks.push(fn);
      return original(fn, delay, ...args);
    };
  });
  const windowCount = chrome().length;
  await cmd({ type: 'window', action: 'new' });
  await expect.poll(() => chrome().length).toBe(windowCount + 1);
  const memoryPage = chrome().at(-1);
  memoryPage.setDefaultTimeout(12000);
  await memoryPage.waitForSelector('.app');
  await app.evaluate(() => {
    globalThis.setInterval = globalThis.dotOriginalInterval;
  });
  await cmd({ type: 'settings', patch: { memorySaver: 'balanced' } }, memoryPage);
  const memoryIds = {};
  for (const [name, target] of [
    ['pinned', other + '/pinned'],
    ['audio', other + '/audio'],
    ['sleep', other + '/sleep'],
    ['kept', base + '/kept'],
    ['left', other + '/left'],
    ['right', other + '/right'],
  ]) {
    await cmd({ type: 'tab.new', url: target }, memoryPage);
    await loaded(memoryPage);
    memoryIds[name] = (await active(memoryPage)).id;
  }
  await cmd({ type: 'tab.action', action: 'pin', id: memoryIds.pinned }, memoryPage);
  const audibleWC = (await snapshot(memoryPage)).tabs.find(
    (t) => t.id === memoryIds.audio,
  ).webContentsId;
  await app.evaluate(({ webContents }, id) => {
    const wc = webContents.fromId(id);
    wc.isCurrentlyAudible = () => true;
    wc.emit('media-started-playing');
  }, audibleWC);
  await cmd({ type: 'split', otherId: memoryIds.left }, memoryPage);
  await app.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() + 21 * 60000;
    try {
      for (const tick of globalThis.dotMemoryTicks) tick();
    } finally {
      Date.now = original;
    }
  });
  let memory = await snapshot(memoryPage);
  assert.ok(memory.tabs.find((t) => t.id === memoryIds.sleep).suspended);
  for (const key of ['pinned', 'audio', 'kept', 'left', 'right'])
    assert.equal(
      memory.tabs.find((t) => t.id === memoryIds[key]).suspended,
      false,
      `${key} tab protected from memory saver`,
    );
  await openTabSearch(memoryPage);
  await memoryPage
    .getByRole('combobox', { name: 'Filter tabs', exact: true })
    .selectOption('audio');
  await expect(memoryPage.locator('.tab-search-results [role=option]')).toHaveCount(1);
  await memoryPage.keyboard.press('Escape');
  console.log(
    'PASS actual memory-saver callback protects pinned/audio/exempt/split tabs and suspends an eligible tab without playing audio',
  );
  assert.equal(
    await nativeZoom(page),
    1.4,
    'another window and origin cannot reset the original page zoom',
  );
  assert.equal(await nativeZoom(memoryPage), 1, 'unrelated origin retains its own native zoom');
  const privateCount = chrome().length;
  await cmd({ type: 'window', action: 'private' });
  await expect.poll(() => chrome().length).toBe(privateCount + 1);
  const privatePage = chrome().at(-1);
  await privatePage.waitForSelector('.app');
  assert.equal((await snapshot(privatePage)).savedSessions.length, 0);
  const privateSave = await privatePage.evaluate(() =>
    window.dot.command({ type: 'session.save', name: 'Private copy' }),
  );
  assert.equal(privateSave.ok, false);
  await cmd({ type: 'tab.new', url: base + '/one' }, privatePage);
  await loaded(privatePage);
  await cmd({ type: 'zoom', value: 1.8 }, privatePage);
  assert.equal(await nativeZoom(privatePage), 1.8);
  assert.equal(await nativeZoom(page), 1.4, 'private native zoom does not affect normal webpages');
  assert.equal((await snapshot()).settings.siteZoom.find((r) => r.origin === base).value, 1.4);
  const privateWindow = await app.browserWindow(privatePage);
  await privateWindow.evaluate((w) => w.close());
  const beforeLimit = (await snapshot(memoryPage)).workspaces.length;
  await cmd({ type: 'tab.action', action: 'close', id: memoryIds.sleep }, memoryPage);
  const closedBefore = (await snapshot(memoryPage)).closedTabs.length;
  for (let i = (await snapshot(memoryPage)).tabs.length; i < 200; i++)
    await cmd({ type: 'tab.new', url: 'browser://newtab', background: true }, memoryPage);
  const overflow = await memoryPage.evaluate(
    (id) => window.dot.command({ type: 'session.action', action: 'restore', id }),
    saved.id,
  );
  assert.equal(overflow.ok, false);
  const limit = await snapshot(memoryPage);
  assert.equal(limit.tabs.length, 200);
  assert.equal(limit.workspaces.length, beforeLimit);
  const restoreOverflow = await memoryPage.evaluate(() =>
    window.dot.command({ type: 'tab.action', action: 'restore' }),
  );
  assert.equal(restoreOverflow.ok, false);
  assert.equal((await snapshot(memoryPage)).closedTabs.length, closedBefore);
  console.log('PASS private-session isolation and atomic session/closed-tab capacity checks');
  await openSessions();
  await page.getByRole('textbox', { name: 'Session name', exact: true }).fill('Temporary copy');
  await page.getByRole('button', { name: 'Save current workspace', exact: true }).click();
  await expect(page.locator('.session-card')).toHaveCount(2);
  const temporary = page.locator('.session-card').filter({ hasText: 'Temporary copy' });
  const tabsBeforeDelete = (await snapshot()).tabs.length;
  await temporary.getByRole('button', { name: 'Delete', exact: true }).click();
  await temporary.getByRole('button', { name: 'Delete saved session', exact: true }).click();
  await expect(page.locator('.session-card')).toHaveCount(1);
  assert.equal((await snapshot()).tabs.length, tabsBeforeDelete);
  const win = await app.browserWindow(page);
  await win.evaluate(async (w) => {
    w.setSize(760, 600);
    await w.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(760);
  for (const [language, name] of [
    ['tr-TR', 'Kayıtlı oturumlar'],
    ['de-DE', 'Gespeicherte Sitzungen'],
    ['fr-FR', 'Sessions enregistrées'],
    ['en-US', 'Saved sessions'],
  ]) {
    await cmd({ type: 'settings', patch: { language, textScale: 1.3 } });
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    assert.ok(await page.getByRole('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth));
  }
  await cmd({ type: 'settings', patch: { language: 'tr-TR' } });
  await capture('sessions-narrow');
  await page.keyboard.press('Escape');
  await cmd({ type: 'settings', patch: { language: 'en-US', textScale: 1 } });
  await cmd({ type: 'tab.navigate', input: url });
  await loaded();
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  await app.close();
  app = undefined;
  const persisted = JSON.parse(await readFile(join(directory, 'browser-data.json'), 'utf8'));
  assert.equal(persisted.savedSessions.length, 1);
  assert.equal(persisted.savedSessions[0].name, 'Research renamed');
  assert.equal(persisted.settings.siteZoom.find((r) => r.origin === base).value, 1.4);
  assert.ok(!Object.hasOwn(persisted, 'closedTabs'));
  await launch(url);
  await loaded();
  assert.equal(await nativeZoom(), 1.4);
  assert.equal((await snapshot()).savedSessions[0].name, 'Research renamed');
  assert.equal((await snapshot()).closedTabs.length, 0);
  await cmd({ type: 'site.zoom.reset', origin: base });
  assert.equal(await nativeZoom(), 1);
  await cmd({ type: 'tab.new', url: base + '/two' });
  await loaded();
  assert.equal(await nativeZoom(), 1);
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
    ),
  );
  console.log(
    'PASS persistence across restart, four dialog languages at 130% in narrow layout, deleting only the saved copy, and native zoom reset; every window hidden',
  );
} finally {
  if (app) await app.close().catch(() => {});
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
}
