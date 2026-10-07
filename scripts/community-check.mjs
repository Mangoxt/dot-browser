import { _electron as electron, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<title>Owned ${req.url}</title><style>html{background:white;color:black}body{margin:0;height:2400px}header{height:200px;background:#ff0000}footer{position:absolute;top:2200px;height:200px;width:100%;background:#00ff00}</style><header>Owned page</header><input id="draft"><footer>Owned bottom marker</footer><script>window.ownedToken=Math.random()</script>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fixture = `http://127.0.0.1:${server.address().port}/`;
const directory = await mkdtemp(join(tmpdir(), 'dot-community-'));
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
  page.setDefaultTimeout(12000);
  const win = await app.browserWindow(page);
  const captureUI = async (name) => {
    const path = `test-results/${name}${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`;
    if (!process.env.DOT_PACKAGED) return page.screenshot({ path, animations: 'disabled' });
    await win.evaluate(async (window) =>
      window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }),
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const bytes = await win.evaluate(async (window) => [
      ...(
        await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      ).toPNG(),
    ]);
    await writeFile(path, Buffer.from(bytes));
  };
  await app.evaluate(({ app, clipboard, dialog }) => {
    globalThis.captureTrace = [];
    if (process.env.DOT_CAPTURE_TRACE) {
      const instrument = (wc) => {
        const capture = wc.capturePage.bind(wc);
        wc.capturePage = async (...args) => {
          globalThis.captureTrace.push(['capturePage start', wc.id]);
          const image = await capture(...args);
          globalThis.captureTrace.push(['capturePage done', wc.id, image.getSize()]);
          return image;
        };
        const send = wc.debugger.sendCommand.bind(wc.debugger);
        wc.debugger.sendCommand = async (name, ...args) => {
          globalThis.captureTrace.push([name + ' start', wc.id]);
          const result = await send(name, ...args);
          globalThis.captureTrace.push([name + ' done', wc.id]);
          return result;
        };
      };
      for (const wc of process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json')('electron')
        .webContents.getAllWebContents())
        instrument(wc);
      app.on('web-contents-created', (_event, wc) => instrument(wc));
    }
    globalThis.dotCapturePath = '';
    globalThis.dotCaptureImage = [];
    globalThis.dotCaptureCancel = false;
    globalThis.dotCaptureDelay = false;
    globalThis.dotCaptureResolve = null;
    dialog.showSaveDialog = async () => {
      if (globalThis.dotCaptureDelay)
        await new Promise((resolve) => (globalThis.dotCaptureResolve = resolve));
      return { canceled: globalThis.dotCaptureCancel, filePath: globalThis.dotCapturePath };
    };
    clipboard.write = async (items) => {
      const image = await items[0].getType('image/png');
      globalThis.dotCaptureImage = [...new Uint8Array(await image.arrayBuffer())];
    };
    if (app.isPackaged) {
      const req = process
        .getBuiltinModule('module')
        .createRequire(process.getBuiltinModule('path').join(app.getAppPath(), 'package.json'));
      req('electron-updater').autoUpdater.autoDownload = false;
      req('electron-updater').autoUpdater.autoInstallOnAppQuit = false;
    }
  });
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.evaluate(() => {
    globalThis.communityCaptureEvents = [];
    window.dot.onEvent((event) => {
      if (event.type === 'toast') globalThis.communityCaptureEvents.push(event.message);
    });
  });
  const cmd = async (command) => {
    const result = await page.evaluate((value) => window.dot.command(value), command);
    assert.ok(result.ok, result.error);
    return result;
  };
  const snap = () => page.evaluate(() => window.dot.snapshot());
  const active = async () => {
    const state = await snap();
    return state.tabs.find((tab) => tab.id === state.activeId);
  };
  const web = async (id, script) => {
    const tab = (await snap()).tabs.find((tab) => tab.id === id);
    return app.evaluate(
      ({ webContents }, { wcId, script }) => webContents.fromId(wcId).executeJavaScript(script),
      { wcId: tab.webContentsId, script },
    );
  };
  const ready = async (id) =>
    expect
      .poll(async () => {
        const tab = (await snap()).tabs.find((tab) => tab.id === id);
        return tab && !tab.loading && tab.title.startsWith('Owned ');
      })
      .toBe(true);
  const select = (id) => cmd({ type: 'tab.action', action: 'select', id, focusChrome: true });
  const input = async (keyCode, type = 'keyDown', modifiers = ['control'], chrome = false) => {
    const tab = await active();
    await app.evaluate(
      async ({ webContents, BrowserWindow }, value) => {
        const wc = value.chrome
          ? BrowserWindow.getAllWindows()[0].webContents
          : webContents.fromId(value.wcId);
        wc.focus();
        if (value.keyCode === 'Control') {
          // Hidden Windows sendInputEvent/CDP suppress pure modifier events.
          // Exercise Electron's event contract for release; Tab combinations
          // above/below still use real sendInputEvent across native contents.
          wc.emit(
            'before-input-event',
            { preventDefault() {} },
            {
              type: value.type,
              key: 'Control',
              code: 'ControlLeft',
              control: value.type !== 'keyUp',
              shift: false,
              alt: false,
              meta: false,
              isAutoRepeat: false,
              isComposing: false,
              location: 1,
              modifiers: value.modifiers,
            },
          );
          return;
        }
        wc.sendInputEvent({ type: value.type, keyCode: value.keyCode, modifiers: value.modifiers });
      },
      { wcId: tab.webContentsId, keyCode, type, modifiers, chrome },
    );
  };
  const tabKey = async (expected, shift = false, chrome = false) => {
    await input('Tab', 'keyDown', shift ? ['control', 'shift'] : ['control'], chrome);
    await expect.poll(async () => (await snap()).activeId).toBe(expected);
    await input('Tab', 'keyUp', shift ? ['control', 'shift'] : ['control']);
  };
  await cmd({
    type: 'settings',
    patch: { sidebar: false, animations: false, forceDarkPages: false, theme: 'light' },
  });
  const ids = [];
  for (const path of ['a', 'b', 'c']) {
    await cmd({ type: 'tab.new', url: fixture + path });
    ids.push((await snap()).activeId);
    await ready(ids.at(-1));
  }
  const [a, b, c] = ids;
  await select(a);
  await select(c);
  await cmd({ type: 'settings', patch: { recentTabSwitching: true } });
  await input('Control', 'keyDown', ['control'], true);
  await tabKey(a, false, true);
  await tabKey(b);
  await tabKey(a, true);
  await input('Control', 'keyUp', []);
  await tabKey(b);
  await input('Control', 'keyUp', []);
  await tabKey(a);
  await input('Control', 'keyUp', []);
  await cmd({ type: 'settings', patch: { recentTabSwitching: false } });
  await select(a);
  await tabKey(b, false, true);
  await input('Control', 'keyUp', []);
  await tabKey(a, true);
  await input('Control', 'keyUp', []);
  console.log(
    'PASS: MRU from trusted chrome and native pages, fixed held sequence, reverse, release/reset and positional fallback',
  );

  const workspaceId = (await snap()).workspaceId;
  const duplicateIds = [];
  for (let i = 0; i < 4; i++) {
    await cmd({ type: 'tab.new', url: fixture + 'same' });
    duplicateIds.push((await snap()).activeId);
    await ready(duplicateIds.at(-1));
  }
  const [pinned, candidate, stale, kept] = duplicateIds;
  await cmd({ type: 'tab.action', action: 'pin', id: pinned });
  await cmd({ type: 'tab.new', url: fixture + 'same#different', background: true });
  const hashId = (await snap()).tabs.at(-1).id;
  await ready(hashId);
  await cmd({
    type: 'workspace.save',
    workspace: { id: 'owned-other', name: 'Other', color: '#a398ff', icon: 'book' },
  });
  await cmd({
    type: 'tab.new',
    url: fixture + 'same',
    background: true,
    workspaceId: 'owned-other',
  });
  const other = (await snap()).tabs.at(-1).id;
  await select(kept);
  await web(kept, `document.querySelector('#draft').value='unsaved owned text';window.ownedToken`);
  const token = await web(kept, 'window.ownedToken');
  const menu = page.getByRole('button', { name: 'Browser menu', exact: true });
  await menu.click();
  await page.getByRole('button', { name: 'Duplicate tabs', exact: true }).click();
  const row = (id) => page.locator(`.duplicate-row[data-tab-id="${id}"] input`);
  await expect(row(pinned)).toBeDisabled();
  await expect(row(kept)).toBeDisabled();
  await expect(row(candidate)).toBeEnabled();
  await expect(row(candidate)).not.toBeChecked();
  await expect(page.locator('.duplicate-group')).toHaveCount(1);
  await cmd({ type: 'settings', patch: { language: 'tr-TR', theme: 'dark' } });
  await captureUI('community-duplicates-tr');
  await cmd({ type: 'settings', patch: { language: 'en-US', theme: 'light' } });
  await row(candidate).check();
  await page.getByRole('button', { name: 'Close 1 selected tabs', exact: true }).click();
  await expect
    .poll(async () => (await snap()).tabs.some((tab) => tab.id === candidate))
    .toBe(false);
  assert.equal(await web(kept, 'window.ownedToken'), token);
  assert.equal(await web(kept, `document.querySelector('#draft').value`), 'unsaved owned text');
  assert.ok((await snap()).tabs.some((tab) => tab.id === other));
  assert.ok((await snap()).tabs.some((tab) => tab.id === hashId));
  await page.keyboard.press('Escape');
  await cmd({ type: 'tab.navigate', id: stale, input: fixture + 'changed' });
  await ready(stale);
  const before = (await snap()).tabs.length;
  const rejection = await page.evaluate((value) => window.dot.command(value), {
    type: 'tab.cleanup',
    workspaceId,
    tabs: [
      { id: stale, url: fixture + 'same' },
      { id: pinned, url: fixture + 'same' },
    ],
  });
  assert.equal(rejection.ok, false);
  assert.equal((await snap()).tabs.length, before);
  await cmd({ type: 'tab.action', action: 'restore', id: candidate });
  const restored = (await snap()).activeId;
  await ready(restored);
  await select(kept);
  console.log(
    'PASS: duplicate review selects only requested copies, preserves active DOM/draft, pins, hashes and other workspace; stale plans reject atomically; closed copy restores',
  );

  let captureEventStart = 0;
  const captureDialog = async () => {
    await menu.click();
    await page.getByText('Page tools', { exact: true }).click();
    await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Screenshot', exact: true })).toBeVisible();
    captureEventStart = await page.evaluate(() => globalThis.communityCaptureEvents.length);
  };
  const captureFinished = async () => {
    await expect
      .poll(
        async () => {
          const alert = page.getByRole('alert');
          if (await alert.count()) throw new Error(await alert.first().innerText());
          return page.evaluate(
            (start) =>
              globalThis.communityCaptureEvents
                .slice(start)
                .some((message) => ['Screenshot saved', 'Screenshot copied'].includes(message)),
            captureEventStart,
          );
        },
        { timeout: 22000 },
      )
      .toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };
  await web(kept, 'scrollTo(0,500)');
  const scroll = await web(kept, 'scrollY');
  await captureDialog();
  await page.getByRole('button', { name: 'Copy image', exact: true }).click();
  await captureFinished();
  const visible = Buffer.from(await app.evaluate(() => globalThis.dotCaptureImage));
  assert.equal(visible.subarray(1, 4).toString(), 'PNG');
  const visibleHeight = visible.readUInt32BE(20);
  assert.ok(visibleHeight > 100 && visibleHeight < 1500);
  await writeFile('test-results/capture-visible.png', visible);
  await app.evaluate(
    (_electron, path) => (globalThis.dotCapturePath = path),
    join(directory, 'full.png'),
  );
  await captureDialog();
  await page.getByLabel('Capture area', { exact: true }).selectOption('full');
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await captureFinished();
  const full = await readFile(join(directory, 'full.png'));
  assert.equal(full.readUInt32BE(20), 2400);
  assert.ok(full.readUInt32BE(16) >= 700);
  await writeFile(
    `test-results/capture-full${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`,
    full,
  );
  assert.ok(
    await app.evaluate(
      ({ nativeImage }, bytes) => {
        const image = nativeImage.createFromBuffer(Buffer.from(bytes));
        const { width, height } = image.getSize();
        const offset = ((height - 20) * width + Math.floor(width / 2)) * 4;
        const bitmap = image.toBitmap();
        return bitmap[offset + 1] > 230 && bitmap[offset] < 20 && bitmap[offset + 2] < 20;
      },
      [...full],
    ),
    'full capture includes the bottom green document marker',
  );
  assert.equal(await web(kept, 'scrollY'), scroll);
  assert.equal(await web(kept, 'window.ownedToken'), token);
  assert.equal(await web(kept, `document.querySelector('#draft').value`), 'unsaved owned text');
  await cmd({ type: 'settings', patch: { theme: 'dark', forceDarkPages: true } });
  await captureDialog();
  await page.getByRole('button', { name: 'Copy image', exact: true }).click();
  await captureFinished();
  const native = (await snap()).tabs.find((tab) => tab.id === kept).webContentsId;
  assert.ok(
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id).debugger.isAttached(),
      native,
    ),
    'theme debugger stays attached after capture',
  );
  assert.equal(await web(kept, 'matchMedia("(prefers-color-scheme: dark)").matches'), true);
  await cmd({ type: 'settings', patch: { theme: 'light' } });
  await expect
    .poll(() => web(kept, 'matchMedia("(prefers-color-scheme: dark)").matches'))
    .toBe(false);
  await cmd({ type: 'zoom', value: 1.4 });
  await cmd({ type: 'page.capture', mode: 'full', destination: 'clipboard' });
  const zoomed = Buffer.from(await app.evaluate(() => globalThis.dotCaptureImage));
  await writeFile(
    `test-results/capture-zoom${process.env.DOT_PACKAGED ? '-packaged' : ''}.png`,
    zoomed,
  );
  assert.ok(zoomed.readUInt32BE(20) >= 2400);
  assert.ok(
    await app.evaluate(
      ({ nativeImage }, bytes) => {
        const image = nativeImage.createFromBuffer(Buffer.from(bytes));
        const { width, height } = image.getSize(),
          bitmap = image.toBitmap();
        const offset = ((height - 20) * width + Math.floor(width / 2)) * 4;
        return bitmap[offset + 1] > 230 && bitmap[offset] < 20 && bitmap[offset + 2] < 20;
      },
      [...zoomed],
    ),
    'zoomed capture includes the document bottom',
  );
  await cmd({ type: 'zoom', value: 1 });
  const lastImage = await app.evaluate(() => globalThis.dotCaptureImage.length);
  await app.evaluate(() => (globalThis.dotCaptureCancel = true));
  await cmd({ type: 'page.capture', mode: 'full', destination: 'file' });
  assert.equal(await app.evaluate(() => globalThis.dotCaptureImage.length), lastImage);
  await app.evaluate(() => (globalThis.dotCaptureCancel = false));
  await web(kept, `document.body.style.height='50000px'`);
  const huge = await page.evaluate(() =>
    window.dot.command({ type: 'page.capture', mode: 'full', destination: 'clipboard' }),
  );
  assert.equal(huge.ok, false);
  assert.match(huge.error, /too large/);
  await web(kept, `document.body.style.height='2400px'`);
  await app.evaluate(() => {
    globalThis.dotCaptureDelay = true;
    globalThis.dotCaptureResolve = null;
  });
  const delayed = page.evaluate(() =>
    window.dot.command({ type: 'page.capture', mode: 'full', destination: 'file' }),
  );
  await expect.poll(() => app.evaluate(() => !!globalThis.dotCaptureResolve)).toBe(true);
  const concurrent = await page.evaluate(() =>
    window.dot.command({ type: 'page.capture', mode: 'visible', destination: 'clipboard' }),
  );
  assert.equal(concurrent.ok, false);
  assert.match(concurrent.error, /already in progress/);
  await cmd({ type: 'tab.navigate', id: kept, input: fixture + 'new-page' });
  await ready(kept);
  await app.evaluate(() => {
    globalThis.dotCaptureDelay = false;
    globalThis.dotCaptureResolve();
  });
  assert.equal((await delayed).ok, false);
  await app.evaluate(() => {
    globalThis.dotCaptureDelay = true;
    globalThis.dotCaptureResolve = null;
  });
  const reloading = page.evaluate(() =>
    window.dot.command({ type: 'page.capture', mode: 'full', destination: 'file' }),
  );
  await expect.poll(() => app.evaluate(() => !!globalThis.dotCaptureResolve)).toBe(true);
  const previousToken = await web(kept, 'window.ownedToken');
  await cmd({ type: 'tab.action', action: 'reload', id: kept });
  await expect.poll(() => web(kept, 'window.ownedToken')).not.toBe(previousToken);
  await ready(kept);
  await app.evaluate(() => {
    globalThis.dotCaptureDelay = false;
    globalThis.dotCaptureResolve();
  });
  assert.equal((await reloading).ok, false, 'same-address reload while saving rejects capture');
  console.log(
    'PASS: real PNG visible/full captures and stubbed image clipboard, 2400px document, scroll/draft/DOM preserved, dark theme debugger retained, excessive size and navigation race rejected',
  );
  await cmd({ type: 'settings', patch: { language: 'tr-TR' } });
  await page.getByRole('button', { name: 'Tarayıcı menüsü', exact: true }).click();
  await page.getByText('Sayfa araçları', { exact: true }).click();
  await page.getByRole('button', { name: 'Ekran görüntüsü', exact: true }).click();
  await captureUI('community-capture-tr');
  await page.keyboard.press('Escape');
  await cmd({ type: 'settings', patch: { language: 'en-US' } });

  for (const language of ['tr-TR', 'de-DE', 'fr-FR', 'en-US']) {
    await cmd({ type: 'settings', patch: { language, textScale: 1.3 } });
    await win.evaluate(async (window) => {
      window.setSize(760, 600);
      await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    });
    await page
      .getByRole('button', {
        name: {
          'tr-TR': 'Tarayıcı menüsü',
          'de-DE': 'Browsermenü',
          'fr-FR': 'Menu du navigateur',
          'en-US': 'Browser menu',
        }[language],
        exact: true,
      })
      .click();
    await page
      .locator('.browser-menu-item')
      .filter({
        hasText: {
          'tr-TR': 'Yinelenen sekmeler',
          'de-DE': 'Doppelte Tabs',
          'fr-FR': 'Onglets en double',
          'en-US': 'Duplicate tabs',
        }[language],
      })
      .click();
    assert.ok(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    );
    if (language === 'tr-TR') await captureUI('community-duplicates-narrow-tr');
    await page.keyboard.press('Escape');
  }
  await cmd({ type: 'settings', patch: { recentTabSwitching: false } });
  await cmd({ type: 'window', action: 'private' });
  await expect
    .poll(async () => {
      for (const candidate of app.windows()) {
        try {
          if ((await candidate.evaluate(() => window.dot.snapshot())).private) return true;
        } catch {
          /* Native webpage contents have no trusted bridge. */
        }
      }
      return false;
    })
    .toBe(true);
  let privatePage;
  for (const candidate of app.windows()) {
    try {
      if ((await candidate.evaluate(() => window.dot.snapshot())).private) {
        privatePage = candidate;
        break;
      }
    } catch {
      /* Ignore native webpage contents. */
    }
  }
  const privateCmd = async (command) => {
    const result = await privatePage.evaluate((value) => window.dot.command(value), command);
    assert.ok(result.ok, result.error);
    return result;
  };
  await privateCmd({ type: 'settings', patch: { recentTabSwitching: true } });
  assert.equal((await snap()).settings.recentTabSwitching, false);
  await privateCmd({ type: 'tab.new', url: fixture + 'private-fixture' });
  await expect
    .poll(async () => {
      const state = await privatePage.evaluate(() => window.dot.snapshot());
      const tab = state.tabs.find((tab) => tab.id === state.activeId);
      return !tab.loading && tab.title.startsWith('Owned ');
    })
    .toBe(true);
  await privateCmd({ type: 'page.capture', mode: 'visible', destination: 'clipboard' });
  await privateCmd({ type: 'window', action: 'close' });
  assert.ok(
    !(await readFile(join(directory, 'browser-data.json'), 'utf8')).includes('private-fixture'),
  );
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  );
  console.log(
    'PASS: four languages at 130% and 760px; all test windows remain hidden; real OS clipboard and dialogs were never used',
  );
} catch (error) {
  if (process.env.DOT_CAPTURE_TRACE) {
    console.log(
      'CAPTURE TRACE',
      JSON.stringify(await app.evaluate(() => globalThis.captureTrace.slice(-60))),
    );
    console.log('TOAST', await (await app.firstWindow()).locator('.toast').allTextContents());
  }
  throw error;
} finally {
  await app.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
