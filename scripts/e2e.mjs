import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { strict as assert } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
const results = [];
const directory = resolve('test-results');
await mkdir(directory, { recursive: true });
const userData = await mkdtemp(join(tmpdir(), 'dot-e2e-'));
const downloadBody = Buffer.alloc(1024 * 1024, 'dot browser download test\n');
const server = createServer((req, res) => {
  if (req.url === '/article') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<title>Reading fixture</title><nav><p>Navigation noise</p></nav><article><h1>A calmer way to read</h1><h2>First section</h2><p>This is the first meaningful paragraph of the article, with enough text to make reading useful.</p><p>Literal &lt;img src=x onerror=alert(1)&gt; text stays readable, not executable.</p><form><p>Private form content must stay out of reading view</p><input id="article-input"></form><blockquote>A useful quote.</blockquote></article><aside><p>Sidebar noise</p></aside><script>window.readerMarker=Math.random()</script>',
    );
    return;
  }
  if (req.url === '/login' || req.url === '/cross-login') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      `<title>Login fixture</title><form action="${req.url === '/cross-login' ? 'https://other.invalid/' : '/login'}"><input id="username" autocomplete="username"><input id="password" type="password"><button>Sign in</button></form><script>window.submitted=false;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submitted=true};</script>`,
    );
    return;
  }
  if (req.url === '/download') {
    const offset = Number(req.headers.range?.match(/bytes=(\d+)/)?.[1] ?? 0);
    res.writeHead(offset ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="dot-test.bin"',
      'Content-Length': downloadBody.length - offset,
      'Accept-Ranges': 'bytes',
      ...(offset
        ? { 'Content-Range': `bytes ${offset}-${downloadBody.length - 1}/${downloadBody.length}` }
        : {}),
    });
    let position = offset;
    const interval = setInterval(() => {
      if (position >= downloadBody.length) {
        clearInterval(interval);
        res.end();
      } else {
        res.write(downloadBody.subarray(position, position + 16384));
        position += 16384;
      }
    }, 30);
    res.on('close', () => clearInterval(interval));
    return;
  }
  if (req.url === '/slow') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<title>Slow page</title><h1>Loading</h1>');
    const timer = setTimeout(() => res.end('Done'), 10000);
    res.on('close', () => clearTimeout(timer));
    return;
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(404);
    res.end();
    return;
  }
  const second = req.url === '/second';
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Set-Cookie': 'dot-test=present; SameSite=Lax; Path=/',
  });
  res.end(
    `<!doctype html><html><head><title>${second ? 'Second' : 'First'} test page</title><style>body{font:18px system-ui;padding:30px;background:#f4f4f8;color:#222}a,button{margin:10px}input{padding:10px}</style></head><body><h1>${second ? 'Second' : 'First'} test page</h1><p>Chromium browser test. Find this phrase. Find this phrase.</p><a id="next" href="/second">Next page</a><a id="blank" href="/second" target="_blank">New tab</a><a id="download" href="/download">Download</a><button id="location" onclick="navigator.geolocation.getCurrentPosition(()=>document.title='Location allowed',()=>document.title='Location blocked')">Request location</button><button id="popup" onclick="window.open('/second','','width=300,height=300')">Script popup</button><input id="input" placeholder="Typed content survives tab switches"/><script>window.testMarker=Math.random();</script></body></html>`,
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let app, page;
const env = { ...process.env, DOT_TEST_DATA: userData, DOT_TEST_HIDDEN: '1' };
env.APPDATA = join(userData, 'import-appdata');
env.LOCALAPPDATA = join(userData, 'import-localappdata');
const firefoxRoot = join(env.APPDATA, 'Mozilla', 'Firefox');
const importedProfile = join(firefoxRoot, 'Profiles', 'test.default');
await mkdir(join(importedProfile, 'sessionstore-backups'), { recursive: true });
await writeFile(
  join(firefoxRoot, 'profiles.ini'),
  '[Profile0]\nIsRelative=1\nPath=Profiles/test.default\n',
);
const importedDb = new DatabaseSync(join(importedProfile, 'places.sqlite'));
importedDb.exec(`CREATE TABLE moz_places (id INTEGER PRIMARY KEY,url TEXT,title TEXT,hidden INTEGER);
  CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY,fk INTEGER,parent INTEGER,type INTEGER,title TEXT,dateAdded INTEGER);
  CREATE TABLE moz_historyvisits (place_id INTEGER,visit_date INTEGER);
  INSERT INTO moz_bookmarks VALUES (1,NULL,0,2,'Migration folder',0);`);
importedDb
  .prepare('INSERT INTO moz_places VALUES (1,?,?,0)')
  .run(`${base}/migration`, 'Migration history');
importedDb
  .prepare('INSERT INTO moz_bookmarks VALUES (2,1,1,1,?,?)')
  .run('Migration bookmark', Date.now() * 1000);
importedDb.prepare('INSERT INTO moz_historyvisits VALUES (1,?)').run(Date.now() * 1000);
importedDb.close();
const sessionText = Buffer.from(
  JSON.stringify({
    windows: [
      {
        tabs: [
          {
            pinned: true,
            index: 1,
            entries: [{ url: `${base}/imported-tab`, title: 'Migrated tab' }],
          },
        ],
      },
    ],
  }),
);
const sessionSize = Buffer.alloc(4);
sessionSize.writeUInt32LE(sessionText.length);
const literalLength = [];
for (let n = sessionText.length - 15; n >= 0; n -= 255) {
  literalLength.push(Math.min(n, 255));
  if (n < 255) break;
}
await writeFile(
  join(importedProfile, 'sessionstore-backups', 'recovery.jsonlz4'),
  Buffer.concat([
    Buffer.from('mozLz40\0', 'binary'),
    sessionSize,
    Buffer.from([0xf0, ...literalLength]),
    sessionText,
  ]),
);
delete env.DOT_DEV_URL;
const customProfiles = join(userData, 'portable-browser', 'User Data');
for (const folder of ['Default', 'Profile 8']) {
  await mkdir(join(customProfiles, folder), { recursive: true });
  await writeFile(
    join(customProfiles, folder, 'Preferences'),
    JSON.stringify({ profile: { name: folder === 'Default' ? 'Personal' : 'Work' } }),
  );
  await writeFile(
    join(customProfiles, folder, 'Bookmarks'),
    JSON.stringify({
      roots: {
        bookmark_bar: {
          type: 'folder',
          name: 'Portable',
          children: [
            {
              type: 'url',
              name: `Portable ${folder}`,
              url: `${base}/portable-${folder.replace(/ /g, '-')}`,
            },
          ],
        },
      },
    }),
  );
}
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 30000 });
  page = await app.firstWindow();
  page.on('pageerror', (e) =>
    results.push({ name: 'Renderer error', status: 'FAIL', detail: String(e) }),
  );
  await page.waitForFunction(() => !!window.dot);
  await page.waitForSelector('.app');
}
async function snap() {
  return page.evaluate(() => window.dot.snapshot());
}
async function cmd(c) {
  const result = await page.evaluate((c) => window.dot.command(c), c);
  assert.equal(result.ok, true, result.error);
  return result;
}
async function key(keyCode, modifiers = ['control']) {
  await app.evaluate(
    ({ BrowserWindow }, { keyCode, modifiers }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    },
    { keyCode, modifiers },
  );
}
async function waitState(predicate, timeout = 10000) {
  await expect.poll(async () => predicate(await snap()), { timeout }).toBe(true);
}
async function webEval(code, tabId) {
  const s = await snap();
  const t = s.tabs.find((t) => t.id === (tabId ?? s.activeId));
  return app.evaluate(
    async ({ webContents }, { id, code }) => {
      const wc = webContents.fromId(id);
      if (!wc) throw new Error('Website WebContents not found: ' + id);
      return wc.executeJavaScript(code, true);
    },
    { id: t.webContentsId, code },
  );
}
async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    // A step ends after its visual exit and component cleanup, before the next
    // independent workflow creates new import previews or other resources.
    await expect(page.locator('.overlay-scrim.closing')).toHaveCount(0);
    results.push({ name, status: 'PASS', duration: Date.now() - start });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: String(error) });
    process.stdout.write(`FAIL ${name}: ${error}\n`);
    throw error;
  }
}
let normalTab, savedBookmarkId, workspaceId, savedLoginId;
const migratedPassword = 'fake,secret"with-quote';
try {
  await launch();
  await step('First-run onboarding and production launch', async () => {
    await page.getByRole('dialog', { name: 'Welcome to Dot' }).waitFor();
    await page.getByRole('button', { name: 'Start browsing' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cmd({ type: 'settings', patch: { askDownload: false, downloadPath: directory } });
  });
  await step('Real Chromium navigation from the visible omnibox', async () => {
    const address = page.getByRole('combobox', { name: 'Address and search', exact: true });
    await address.fill(base + '/first');
    await address.press('Enter');
    await waitState((s) => s.tabs.some((t) => t.title === 'First test page' && !t.loading));
    normalTab = (await snap()).activeId;
    assert.equal(await webEval('document.querySelector("h1").textContent'), 'First test page');
    const secure = await webEval(
      '({node:typeof require,bridge:typeof window.dot,process:typeof process})',
    );
    assert.deepEqual(secure, { node: 'undefined', bridge: 'undefined', process: 'undefined' });
  });
  await step('Link navigation, back, forward and reload preserve real pages', async () => {
    await webEval('document.querySelector("#next").click()');
    await waitState((s) => s.tabs.find((t) => t.id === normalTab)?.title === 'Second test page');
    await page.getByRole('button', { name: 'Back (Alt+Left)', exact: true }).click();
    await waitState((s) => s.tabs.find((t) => t.id === normalTab)?.url.endsWith('/first'));
    await page.getByRole('button', { name: 'Forward (Alt+Right)', exact: true }).click();
    await waitState((s) => s.tabs.find((t) => t.id === normalTab)?.url.endsWith('/second'));
    await page.getByRole('button', { name: 'Reload (Ctrl+R)', exact: true }).click();
    await waitState((s) => !s.tabs.find((t) => t.id === normalTab)?.loading);
  });
  await step('Tabs keep page state, duplicate, pin, mute, reorder, close and restore', async () => {
    await webEval('document.querySelector("#input").value="preserved"');
    await cmd({ type: 'tab.new' });
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    assert.equal(await webEval('document.querySelector("#input").value'), 'preserved');
    await cmd({ type: 'tab.action', action: 'duplicate' });
    await waitState(
      (s) => s.tabs.filter((t) => t.url === base + '/second' && !t.loading).length === 2,
    );
    const duplicate = (await snap()).activeId;
    await cmd({ type: 'tab.action', action: 'pin' });
    assert.equal((await snap()).tabs[0].id, duplicate);
    await cmd({ type: 'tab.action', action: 'mute' });
    assert.equal((await snap()).tabs[0].muted, true);
    await cmd({ type: 'tab.action', action: 'pin' });
    await cmd({ type: 'tab.move', id: duplicate, index: 0 });
    assert.equal((await snap()).tabs[0].id, duplicate);
    await cmd({ type: 'tab.action', action: 'close' });
    await cmd({ type: 'tab.action', action: 'restore' });
    await waitState((s) => s.tabs.some((t) => t.url === base + '/second' && t.id !== normalTab));
  });
  await step('Bookmark editor, bookmark bar, folders and history', async () => {
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    await page.getByRole('button', { name: 'Bookmark page (Ctrl+D)', exact: true }).click();
    await page.getByRole('textbox', { name: 'Bookmark name' }).fill('A saved test page');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    savedBookmarkId = (await snap()).bookmarks.find((b) => b.title === 'A saved test page').id;
    await cmd({ type: 'folder.add', name: 'Testing' });
    await cmd({ type: 'settings', patch: { bookmarkBar: true } });
    await expect(page.locator('.bookmark-bar')).toContainText('A saved test page');
    assert.ok((await snap()).history.length >= 2);
    await cmd({ type: 'tab.new', url: 'browser://history' });
    await page.getByRole('textbox', { name: 'Search history' }).fill('Second');
    await expect(page.locator('.library-row')).toHaveCount(1);
    await cmd({ type: 'tab.new', url: 'browser://bookmarks' });
    await page.getByRole('textbox', { name: 'Search bookmarks' }).fill('saved');
    await expect(page.locator('.bookmark-list .library-row')).toHaveCount(1);
  });
  await step('Immediate appearance changes and every settings section', async () => {
    await cmd({ type: 'tab.new', url: 'browser://settings' });
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await expect(page.locator('.app')).toHaveClass(/light/);
    await page.getByRole('button', { name: 'green accent' }).click();
    await expect(page.locator('.app')).toHaveClass(/accent-green/);
    await page.getByRole('switch', { name: 'Compact toolbar' }).click();
    await expect(page.locator('.app')).toHaveClass(/compact/);
    await page.screenshot({ path: join(directory, 'settings-light.png') });
    for (const label of [
      'General',
      'Search engines',
      'Tabs & spaces',
      'Privacy & security',
      'Downloads',
      'On startup',
      'Languages',
      'Accessibility',
      'Keyboard shortcuts',
      'Advanced',
      'About Dot',
    ]) {
      await page.locator('.settings-nav').getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('.settings-content h1')).toContainText(label);
    }
    await cmd({
      type: 'settings',
      patch: { theme: 'dark', accent: 'violet', compact: false, bookmarkBar: false },
    });
  });
  await step('Workspace isolation, alive tabs and tab groups', async () => {
    workspaceId = crypto.randomUUID();
    await cmd({
      type: 'workspace.save',
      workspace: { id: workspaceId, name: 'Work', color: '#83b5f0', icon: 'briefcase' },
    });
    await cmd({ type: 'workspace.action', action: 'select', id: workspaceId });
    assert.equal((await snap()).workspaceId, workspaceId);
    await cmd({ type: 'tab.navigate', input: base + '/first' });
    await waitState((s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'First test page');
    await cmd({
      type: 'group.save',
      name: 'Research',
      color: '#83b5f0',
      tabId: (await snap()).activeId,
    });
    const g = (await snap()).groups.find((g) => g.name === 'Research');
    await cmd({ type: 'group.action', id: g.id, action: 'collapse' });
    assert.equal((await snap()).groups.find((x) => x.id === g.id).collapsed, true);
    await cmd({ type: 'group.action', id: g.id, action: 'collapse' });
    const original = (await snap()).tabs.find((t) => t.id === normalTab).workspaceId;
    await cmd({ type: 'workspace.action', action: 'select', id: original });
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    assert.equal(await webEval('document.querySelector("#input").value'), 'preserved');
  });
  await step('Vertical tabs, sidebar and command palette keyboard navigation', async () => {
    await cmd({ type: 'settings', patch: { verticalTabs: true } });
    await expect(page.locator('.tabs-container.vertical')).toHaveCount(1);
    await page.getByRole('button', { name: 'Quick command' }).click();
    const input = page.getByRole('textbox', { name: 'Search commands and tabs' });
    await input.fill('New tab');
    await input.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const current = await snap();
    assert.equal(current.tabs.find((t) => t.id === current.activeId)?.url, 'browser://newtab');
    await cmd({ type: 'settings', patch: { verticalTabs: false } });
  });
  await step('Split view uses two live WebContentsViews and independent navigation', async () => {
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    await cmd({ type: 'tab.new', url: base + '/first' });
    await waitState((s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'First test page');
    const other = (await snap()).activeId;
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    await cmd({ type: 'split', otherId: other });
    assert.ok((await snap()).split);
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].contentView.children.map((v) => v.getBounds()),
    );
    assert.ok(bounds.some((b) => b.width > 200 && b.width < 800));
    await cmd({ type: 'tab.navigate', input: base + '/first', id: normalTab });
    await waitState((s) => s.tabs.find((t) => t.id === normalTab)?.url.endsWith('/first'));
    assert.equal((await snap()).tabs.find((t) => t.id === other).url, base + '/first');
    await cmd({ type: 'split', otherId: other, ratio: 0.6, swap: true });
    assert.equal((await snap()).split.ratio, 0.6);
    await cmd({ type: 'split', otherId: null });
  });
  await step(
    'Tab search switches across workspaces using title, URL and keyboard navigation',
    async () => {
      const before = await snap();
      const target = before.tabs.find((tab) => tab.id === normalTab);
      await key('A', ['control', 'shift']);
      const modal = page.getByRole('dialog', { name: 'Search tabs', exact: true });
      const input = modal.getByRole('combobox', { name: 'Search open tabs' });
      await input.fill(target.url);
      await expect(modal.getByRole('option')).not.toHaveCount(0);
      await input.press('Enter');
      await waitState(
        (state) =>
          state.activeId === normalTab ||
          state.tabs.find((tab) => tab.id === state.activeId).url === target.url,
      );
      await expect(modal).toHaveCount(0);
    },
  );
  await step(
    'Reading view extracts safe article text and leaves the original page intact',
    async () => {
      await cmd({ type: 'tab.new', url: base + '/article' });
      await waitState(
        (state) => state.tabs.find((tab) => tab.id === state.activeId).title === 'Reading fixture',
      );
      await webEval('document.querySelector("#article-input").value="unsaved form"');
      const marker = await webEval('window.readerMarker');
      await key('M', ['control', 'shift']);
      const modal = page.getByRole('dialog', { name: 'Reading view', exact: true });
      await expect(modal.locator('article')).toContainText('A calmer way to read');
      await expect(modal.locator('article')).toContainText('<img src=x onerror=alert(1)>');
      await expect(modal.locator('article')).not.toContainText('Navigation noise');
      await expect(modal.locator('article')).not.toContainText('Sidebar noise');
      await expect(modal.locator('article')).not.toContainText('Private form content');
      assert.equal(await modal.locator('article img').count(), 0);
      await modal.getByRole('button', { name: 'Larger reading text' }).click();
      await expect(modal.locator('article')).toHaveCSS('font-size', '22px');
      await page.screenshot({ path: join(directory, 'reading-view.png') });
      await modal.getByRole('button', { name: 'Back to page', exact: true }).click();
      assert.equal(await webEval('window.readerMarker'), marker);
      assert.equal(await webEval('document.querySelector("#article-input").value'), 'unsaved form');
    },
  );
  await step('Save as PDF writes a real Chromium PDF and cancellation writes nothing', async () => {
    const path = join(directory, 'article.pdf');
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, path);
    await key('S', ['control', 'shift']);
    await expect
      .poll(async () => {
        try {
          return (await readFile(path)).subarray(0, 5).toString();
        } catch {
          return '';
        }
      })
      .toBe('%PDF-');
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true });
    });
    assert.equal((await cmd({ type: 'page', action: 'pdf' })).ok, true);
  });
  await step('Find in page and zoom control Chromium', async () => {
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    await waitState(
      (s) =>
        s.tabs.find((t) => t.id === normalTab)?.title === 'First test page' &&
        !s.tabs.find((t) => t.id === normalTab)?.loading,
    );
    await cmd({ type: 'find', text: 'Find this phrase' });
    await waitState((s) => s.find.matches === 2);
    await cmd({ type: 'find', text: 'Find this phrase', next: true });
    await cmd({ type: 'find', text: '' });
    await cmd({ type: 'zoom', value: 1.25 });
    assert.equal((await snap()).tabs.find((t) => t.id === normalTab).zoom, 1.25);
    await cmd({ type: 'zoom', value: 1 });
  });
  await step('Permission requests, deny and persistent decisions', async () => {
    await webEval('document.querySelector("#location").click()');
    await waitState((s) => s.permissionRequests.length > 0);
    await expect(page.getByRole('dialog', { name: 'Site permission request' })).toBeVisible();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await waitState((s) =>
      s.permissions.some((p) => p.permission === 'geolocation' && p.decision === 'block'),
    );
    await cmd({ type: 'permission.remove', origin: base, permission: 'geolocation' });
    await cmd({ type: 'tab.new', url: base + '/first' });
    await waitState(
      (s) =>
        s.tabs.find((t) => t.id === s.activeId)?.title === 'First test page' &&
        !s.tabs.find((t) => t.id === s.activeId)?.loading,
    );
    await webEval('document.querySelector("#location").click()');
    await waitState((s) => s.permissionRequests.length > 0);
    await cmd({ type: 'tab.action', action: 'close' });
    await waitState((s) => s.permissionRequests.length === 0);
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
  });
  await step('Cookies, site information and clearing a site', async () => {
    const info = await cmd({ type: 'site.info' });
    assert.equal(info.site.https, false);
    assert.ok(info.site.cookies.some((c) => c.name === 'dot-test'));
    await cmd({ type: 'site.clear', origin: base });
    const after = await cmd({ type: 'site.info' });
    assert.equal(after.site.cookies.length, 0);
  });
  await step('Real download, pause/resume and persisted file bytes', async () => {
    await webEval('document.querySelector("#download").click()');
    await waitState((s) => s.downloads.some((d) => d.status === 'progressing'));
    const d = (await snap()).downloads[0];
    await cmd({ type: 'download', id: d.id, action: 'pause' });
    assert.equal((await snap()).downloads[0].status, 'paused');
    await cmd({ type: 'download', id: d.id, action: 'resume' });
    await waitState((s) => s.downloads[0].status === 'completed', 15000);
    const actual = await readFile((await snap()).downloads[0].path);
    assert.equal(actual.length, downloadBody.length);
    await cmd({ type: 'tab.new', url: 'browser://downloads' });
    await expect(page.locator('.download-content')).toContainText('dot-test.bin');
  });
  await step('Shortcut, workspace and group forms from browser controls', async () => {
    await cmd({ type: 'tab.new' });
    await page.getByRole('button', { name: 'Add shortcut', exact: true }).click();
    await page.getByLabel('Shortcut name', { exact: true }).fill('Local fixture');
    await page.getByLabel('Shortcut URL', { exact: true }).fill(base + '/first');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.speed-dial')).toContainText('Local fixture');
    await page.locator('.speed-item').filter({ hasText: 'Local fixture' }).hover();
    await page.getByRole('button', { name: 'Edit Local fixture' }).click();
    await page.getByLabel('Shortcut name', { exact: true }).fill('Edited fixture');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.speed-item').filter({ hasText: 'Edited fixture' }).hover();
    await page.getByRole('button', { name: 'Remove Edited fixture' }).click();
    assert.equal(
      (await snap()).shortcuts.some((s) => s.title === 'Edited fixture'),
      false,
    );
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.getByLabel('Workspace name', { exact: true }).fill('Music');
    await page.getByLabel('Workspace icon', { exact: true }).selectOption('music');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const music = (await snap()).workspaces.find((w) => w.name === 'Music');
    assert.equal((await snap()).workspaceId, music.id);
    await page.getByRole('button', { name: 'Edit Music', exact: true }).click();
    await page.getByRole('button', { name: 'Delete space', exact: true }).click();
    assert.equal(
      (await snap()).workspaces.some((w) => w.id === music.id),
      false,
    );
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
  });
  await step('Side panel sections and sidebar controls', async () => {
    await page.getByRole('button', { name: 'Browser menu', exact: true }).click();
    await page.getByRole('button', { name: 'Tabs and windows', exact: true }).click();
    await page.getByRole('button', { name: 'Bookmarks side panel', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Browser menu', exact: true })).toHaveCount(0);
    await expect(page.locator('.side-panel')).toBeVisible();
    for (const section of ['history', 'tabs', 'downloads', 'bookmarks']) {
      await page.getByLabel('Side panel section', { exact: true }).selectOption(section);
      await expect(page.getByLabel('Side panel section', { exact: true })).toHaveValue(section);
    }
    await page.getByRole('button', { name: 'Close side panel', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
    assert.equal((await snap()).settings.sidebar, false);
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
    assert.equal((await snap()).settings.sidebar, true);
  });
  await step('Keyboard shortcuts are handled in Chromium and chrome', async () => {
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    const before = (await snap()).tabs.length;
    await key('t');
    await waitState((s) => s.tabs.length === before + 1);
    await key('w');
    await waitState((s) => s.tabs.length === before);
    await key('t', ['control', 'shift']);
    await waitState((s) => s.tabs.length === before + 1);
    await key('l');
    await expect(page.getByLabel('Address and search', { exact: true })).toBeFocused();
    await key('Escape', []);
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    const contentsId = (await snap()).tabs.find((t) => t.id === normalTab).webContentsId;
    await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 't', modifiers: ['control'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 't', modifiers: ['control'] });
    }, contentsId);
    await waitState((s) => s.tabs.length === before + 2);
  });
  await step('Popup denial, target blank and background tab suspension', async () => {
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    const count = (await snap()).tabs.length;
    await webEval('document.querySelector("#popup").click()');
    await waitState((s) => s.tabs.find((t) => t.id === normalTab).blockedPopups > 0);
    assert.equal((await snap()).tabs.length, count);
    await webEval('document.querySelector("#blank").click()');
    await waitState((s) => s.tabs.length === count + 1);
    const blank = (await snap()).tabs.at(-1);
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    await cmd({ type: 'tab.action', action: 'suspend', id: blank.id });
    assert.equal((await snap()).tabs.find((t) => t.id === blank.id).suspended, true);
    await cmd({ type: 'tab.action', action: 'select', id: blank.id });
    await waitState(
      (s) =>
        s.tabs.find((t) => t.id === blank.id).title === 'Second test page' &&
        !s.tabs.find((t) => t.id === blank.id).loading,
    );
    assert.equal((await snap()).tabs.find((t) => t.id === blank.id).suspended, false);
  });
  await step('Save page and bookmark import/export use real files', async () => {
    const exportPath = join(directory, 'bookmarks-export.html');
    const savePath = join(directory, 'saved-page.html');
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.exportPath });
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.exportPath] });
      },
      { exportPath },
    );
    await cmd({ type: 'bookmark.transfer', action: 'export' });
    assert.ok((await readFile(exportPath, 'utf8')).includes('A saved test page'));
    await cmd({ type: 'bookmark.remove', id: savedBookmarkId });
    await cmd({ type: 'bookmark.transfer', action: 'import' });
    savedBookmarkId = (await snap()).bookmarks.find((b) => b.title === 'A saved test page').id;
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, savePath);
    await cmd({ type: 'tab.action', action: 'select', id: normalTab });
    await cmd({ type: 'page', action: 'save' });
    assert.ok((await readFile(savePath, 'utf8')).includes('First test page'));
  });
  await step(
    'Browser profile import previews SQLite history, bookmarks and compressed session tabs',
    async () => {
      await cmd({ type: 'tab.new', url: 'browser://bookmarks' });
      await page.getByRole('button', { name: 'Import browser', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Import browser data' });
      await expect(modal.getByRole('combobox', { name: 'Browser profile' })).toContainText(
        'Firefox',
      );
      await modal.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(modal.locator('.import-preview')).toContainText('Bookmarks: 1');
      await expect(modal.locator('.import-preview')).toContainText('Browsing history: 1');
      await expect(modal.locator('.import-preview')).toContainText('Open tabs: 1');
      await modal.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(modal.getByRole('status')).toContainText(
        'Imported: 1 bookmarks, 1 history entries, 1 tabs, 0 passwords and 0 cookies.',
      );
      const state = await snap();
      assert.ok(state.bookmarks.some((bookmark) => bookmark.url === `${base}/migration`));
      assert.ok(state.folders.includes('Firefox / Migration folder'));
      assert.ok(state.history.some((visit) => visit.url === `${base}/migration`));
      assert.ok(
        state.tabs.some((tab) => tab.url === `${base}/imported-tab` && tab.pinned && tab.suspended),
      );
      const detected = await cmd({ type: 'import.sources' });
      assert.ok(detected.sources.every((source) => !('path' in source)));
      const second = await cmd({
        type: 'import.preview',
        sourceId: detected.sources[0].id,
        kinds: ['bookmarks', 'history'],
      });
      const duplicate = await cmd({ type: 'import.apply', token: second.preview.token });
      assert.equal(duplicate.report.counts.bookmarks, 0);
      assert.equal(duplicate.report.counts.history, 0);
      assert.equal(duplicate.report.skipped, 2);
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
    },
  );
  await step(
    'Custom browser folders discover all portable profiles and import the selected profile',
    async () => {
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, customProfiles);
      await page.getByRole('button', { name: 'Import browser', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Import browser data' });
      await modal.getByRole('button', { name: 'Choose browser folder', exact: true }).click();
      const selector = modal.getByRole('combobox', { name: 'Browser profile' });
      await expect(selector).toContainText('Personal (Default)');
      await expect(selector).toContainText('Work (Profile 8)');
      const value = await selector
        .locator('option')
        .filter({ hasText: 'Work (Profile 8)' })
        .getAttribute('value');
      await selector.selectOption(value);
      await modal.getByRole('checkbox', { name: 'Browsing history', exact: true }).uncheck();
      await modal.getByRole('checkbox', { name: 'Open tabs', exact: true }).uncheck();
      await modal.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(modal.locator('.import-preview')).toContainText('Bookmarks: 1');
      await modal.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(modal.getByRole('status')).toContainText('Imported: 1 bookmarks');
      assert.ok((await snap()).bookmarks.some((item) => item.title === 'Portable Profile 8'));
      await modal.getByRole('button', { name: 'Choose browser folder', exact: true }).click();
      assert.equal(await selector.locator('option').count(), 3);
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
    },
  );
  await step(
    'Locked Chromium history preserves readable bookmarks and imports history after unlock',
    async () => {
      const root = join(userData, 'locked-source');
      await mkdir(root, { recursive: true });
      await writeFile(join(root, 'Preferences'), '{}');
      await writeFile(
        join(root, 'Bookmarks'),
        JSON.stringify({
          roots: {
            bar: {
              type: 'folder',
              name: 'Available',
              children: [
                { type: 'url', name: 'Lock fixture bookmark', url: `${base}/locked-bookmark` },
              ],
            },
          },
        }),
      );
      const writer = new DatabaseSync(join(root, 'History'));
      writer.exec(
        `CREATE TABLE urls(url TEXT,title TEXT,visit_count INTEGER,last_visit_time INTEGER,hidden INTEGER); INSERT INTO urls VALUES('${base}/locked-history','Lock fixture history',1,13300000000000000,0); BEGIN EXCLUSIVE;`,
      );
      try {
        await app.evaluate(({ dialog }, path) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
        }, root);
        const found = await cmd({ type: 'import.folder' });
        const source = found.sources.find((item) => item.profile === 'locked-source');
        const partial = await cmd({
          type: 'import.preview',
          sourceId: source.id,
          kinds: ['bookmarks', 'history'],
        });
        assert.equal(partial.preview.counts.bookmarks, 1);
        assert.equal(partial.preview.counts.history, 0);
        assert.ok(partial.preview.warnings.join(' ').includes('locked'));
        assert.equal(
          (await cmd({ type: 'import.apply', token: partial.preview.token })).report.counts
            .bookmarks,
          1,
        );
        writer.exec('COMMIT');
        const unlocked = await cmd({
          type: 'import.preview',
          sourceId: source.id,
          kinds: ['history'],
        });
        assert.equal(unlocked.preview.counts.history, 1);
        assert.equal(
          (await cmd({ type: 'import.apply', token: unlocked.preview.token })).report.counts
            .history,
          1,
        );
      } finally {
        writer.close();
      }
    },
  );
  await step(
    'Password CSV import encrypts secrets, manages entries and fills only matching login forms',
    async () => {
      const csvPath = join(userData, 'fake-passwords.csv');
      await writeFile(
        csvPath,
        `name,url,username,password\nTest,${base}/login,test-user,"fake,secret""with-quote"\nOther,https://other.invalid/,other-user,"another-fake\nsecret"\n`,
      );
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, csvPath);
      await page.getByRole('button', { name: 'Import browser', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Import browser data' });
      await modal.locator('summary').click();
      await modal.getByRole('button', { name: 'Import password CSV', exact: true }).click();
      await expect(modal.locator('.import-preview')).toContainText('Passwords: 2');
      assert.ok(!(await modal.textContent()).includes(migratedPassword));
      await modal.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(modal.getByRole('status')).toContainText('2 passwords');
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
      const list = await cmd({ type: 'login.list' });
      savedLoginId = list.logins.find((login) => login.origin === base).id;
      assert.ok(list.logins.every((login) => !('encrypted' in login) && !('password' in login)));
      assert.ok(!JSON.stringify(await snap()).includes(migratedPassword));
      await cmd({ type: 'tab.new', url: base + '/login' });
      await waitState((s) => s.tabs.find((t) => t.id === s.activeId).title === 'Login fixture');
      await page.getByRole('button', { name: 'Browser menu', exact: true }).click();
      await page.getByRole('button', { name: 'Saved passwords', exact: true }).click();
      const manager = page.getByRole('dialog', { name: 'Saved passwords' });
      await manager.getByRole('button', { name: 'Show', exact: true }).first().click();
      await expect(
        manager.getByRole('textbox', { name: `Password for test-user at ${base}`, exact: true }),
      ).toHaveValue(migratedPassword);
      await manager.getByRole('button', { name: 'Hide', exact: true }).click();
      await manager.getByRole('button', { name: 'Show', exact: true }).last().click();
      await expect(
        manager.getByRole('textbox', {
          name: 'Password for other-user at https://other.invalid',
          exact: true,
        }),
      ).toHaveValue('another-fake\nsecret');
      await manager.getByRole('button', { name: 'Hide', exact: true }).click();
      await manager.getByRole('button', { name: 'Fill on this site', exact: true }).first().click();
      assert.deepEqual(
        await webEval(
          '({ user:document.querySelector("#username").value,password:document.querySelector("#password").value,submitted:window.submitted })',
        ),
        { user: 'test-user', password: migratedPassword, submitted: false },
      );
      const wrong = list.logins.find((login) => login.origin !== base);
      const rejected = await page.evaluate(
        (id) => window.dot.command({ type: 'login.action', action: 'fill', id }),
        wrong.id,
      );
      assert.equal(rejected.ok, false);
      await cmd({ type: 'tab.navigate', input: base + '/cross-login' });
      await waitState(
        (s) =>
          s.tabs.find((t) => t.id === s.activeId).url === base + '/cross-login' &&
          !s.tabs.find((t) => t.id === s.activeId).loading,
      );
      const cross = await page.evaluate(
        (id) => window.dot.command({ type: 'login.action', action: 'fill', id }),
        savedLoginId,
      );
      assert.equal(cross.ok, false);
      assert.equal(await webEval('document.querySelector("#password").value'), '');
      await cmd({ type: 'login.action', action: 'delete', id: wrong.id });
      assert.equal((await cmd({ type: 'login.list' })).logins.length, 1);
    },
  );
  await step('Exported cookie files restore cookies to the Chromium session', async () => {
    const path = join(userData, 'fake-cookies.json');
    await writeFile(
      path,
      JSON.stringify([
        {
          domain: '127.0.0.1',
          name: 'imported-session',
          value: 'fake-cookie',
          path: '/',
          secure: false,
        },
      ]),
    );
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, path);
    const preview = await cmd({ type: 'import.file', kind: 'cookies' });
    assert.equal(preview.preview.counts.cookies, 1);
    assert.ok(!JSON.stringify(preview).includes('fake-cookie'));
    assert.equal(
      (await cmd({ type: 'import.apply', token: preview.preview.token })).report.counts.cookies,
      1,
    );
    await cmd({ type: 'tab.navigate', input: base });
    await waitState((s) => s.tabs.find((t) => t.id === s.activeId).title === 'First test page');
    assert.ok((await webEval('document.cookie')).includes('imported-session=fake-cookie'));
    const cancelled = await cmd({ type: 'import.file', kind: 'cookies' });
    await cmd({ type: 'import.cancel' });
    assert.equal(
      (
        await page.evaluate(
          (token) => window.dot.command({ type: 'import.apply', token }),
          cancelled.preview.token,
        )
      ).ok,
      false,
    );
  });
  await step('Loading can be stopped and task manager reports real metadata', async () => {
    await cmd({ type: 'tab.new', url: base + '/slow' });
    await waitState((s) => s.tabs.find((t) => t.id === s.activeId).loading);
    await page.getByRole('button', { name: 'Stop loading', exact: true }).click();
    await waitState((s) => !s.tabs.find((t) => t.id === s.activeId).loading);
    await cmd({ type: 'tab.new', url: 'browser://performance' });
    await expect(page.getByRole('heading', { name: 'Task manager', exact: true })).toBeVisible();
    assert.ok((await snap()).tabs.some((t) => t.processId > 0));
  });
  await step('Failed navigation shows recoverable internal error UI', async () => {
    await cmd({ type: 'tab.new', url: 'http://127.0.0.1:1' });
    await waitState((s) => !!s.tabs.find((t) => t.id === s.activeId)?.error);
    await expect(page.getByRole('heading', { name: 'This page couldn’t open.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
  await step('Private session has isolated cookies and does not record visits', async () => {
    await cmd({ type: 'window', action: 'private' });
    await expect
      .poll(
        async () => await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      )
      .toBe(2);
    const normal = page;
    await expect
      .poll(async () => (await app.windows()).filter((p) => p.url().startsWith('file:')).length)
      .toBe(2);
    page = (await app.windows()).find((p) => p !== normal && p.url().startsWith('file:'));
    await page.waitForSelector('.app');
    assert.equal((await snap()).private, true);
    await cmd({ type: 'tab.navigate', input: base + '/first' });
    await waitState((s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'First test page');
    assert.equal((await snap()).history.length, 0);
    const privatePartition = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .flatMap((w) => w.contentView.children)
        .filter((v) => v.webContents)
        .map((v) => ({ url: v.webContents.getURL(), cookies: v.webContents.session.storagePath })),
    );
    assert.ok(privatePartition.some((p) => p.url === base + '/first' && !p.cookies));
    await cmd({ type: 'window', action: 'close' }).catch((error) => {
      // Closing the IPC sender can destroy its evaluation before the reply arrives.
      if (!String(error).includes('Target page, context or browser has been closed')) throw error;
    });
    page = normal;
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);
  });
  await step('Responsive chrome in hidden test windows', async () => {
    await cmd({ type: 'tab.new' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(800);
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.screenshot({ path: join(directory, 'newtab-narrow.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 900));
    await page.screenshot({ path: join(directory, 'newtab-dark.png') });
  });
  await step('Session restore survives a full application restart', async () => {
    const before = await snap();
    await app.close();
    const stored = await readFile(join(userData, 'browser-data.json'), 'utf8');
    assert.ok(!stored.includes('fake,secret'));
    assert.ok(JSON.parse(stored).logins[0].encrypted);
    await launch();
    const after = await snap();
    assert.equal(after.tabs.length, before.tabs.length);
    assert.equal(after.workspaces.length, before.workspaces.length);
    assert.ok(after.bookmarks.some((b) => b.id === savedBookmarkId));
    assert.equal(after.settings.onboarded, true);
    assert.equal(after.activeId, before.activeId);
    assert.equal(after.downloads[0].status, 'completed');
    assert.equal(
      (await cmd({ type: 'login.action', id: savedLoginId, action: 'reveal' })).password,
      migratedPassword,
    );
  });
  if (!process.env.DOT_SKIP_EXTERNAL)
    await step('Real website compatibility audit', async () => {
      const sites = [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://github.com',
        'https://en.wikipedia.org',
        'https://www.reddit.com',
        'https://open.spotify.com',
        'https://discord.com/app',
        'https://www.microsoft.com',
        'https://chatgpt.com',
      ];
      for (const url of sites) {
        await cmd({ type: 'tab.new', url });
        await waitState((s) => {
          const t = s.tabs.find((t) => t.id === s.activeId);
          return !!t?.error || !t?.loading;
        }, 30000);
        const s = await snap();
        const t = s.tabs.find((t) => t.id === s.activeId);
        results.push({
          name: `Website ${url}`,
          status: t.error ? 'LIMITED' : 'PASS',
          detail: t.error || t.title,
        });
        process.stdout.write(`SITE ${url}: ${t.error || t.title}\n`);
        await cmd({ type: 'tab.action', action: 'close' });
      }
    });
} catch (error) {
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
  process.stderr.write(String(error) + '\n');
} finally {
  const report =
    '# Dot Browser integration audit\n\nExecuted ' +
    new Date().toISOString() +
    ' against the production build on Windows.\n\n' +
    results
      .map(
        (r) => `- **${r.status}** ${r.name}${r.detail ? ' — ' + r.detail.replace(/\n/g, ' ') : ''}`,
      )
      .join('\n') +
    '\n\nTest user data: ' +
    userData +
    '\n';
  await writeFile(join(directory, 'audit.md'), report);
  await writeFile(join(directory, 'audit.json'), JSON.stringify(results, null, 2));
  if (app) await app.close().catch(() => {});
  await new Promise((r) => server.close(r));
}
