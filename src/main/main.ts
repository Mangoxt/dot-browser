import { app, ipcMain, nativeTheme } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { BrowserController } from './browser';
import { Storage } from './storage';
import { BrowserSession } from './session';
import { commandSchema } from '../shared/ipc';
import type { WindowRestore } from '../shared/models';

app.setName('Dot Browser');
if (process.env.DOT_TEST_DATA) app.setPath('userData', process.env.DOT_TEST_DATA);
const locked = process.env.DOT_TEST_DATA ? true : app.requestSingleInstanceLock();
if (!locked) app.quit();
let storage: Storage;
const windows = new Map<string, BrowserController>();
const sessions = new Map<string, BrowserSession>();
let quitting = false;
function setupAutomaticUpdates() {
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, 'app-update.yml'))) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = false;
  autoUpdater.on('update-downloaded', () => {
    for (const window of windows.values())
      window.toast('Update downloaded. It will install when you close Dot Browser.');
  });
  autoUpdater.on('error', (error) =>
    storage.log('update-check-failed', error.message.slice(0, 500)),
  );
  const check = () =>
    void autoUpdater
      .checkForUpdates()
      .catch((error: unknown) =>
        storage.log(
          'update-check-failed',
          error instanceof Error ? error.message.slice(0, 500) : 'unknown',
        ),
      );
  check();
  const timer = setInterval(check, 6 * 60 * 60 * 1000);
  timer.unref();
}
const host = {
  get storage() {
    return storage;
  },
  windows,
  sessions,
  create(privateMode = false, restore?: WindowRestore) {
    return new BrowserController(host, privateMode, restore);
  },
  broadcast() {
    for (const w of windows.values()) if (!w.privateMode) w.emit();
  },
  persist() {
    if (quitting) return;
    storage.data.windows = [...windows.values()]
      .filter((w) => !w.privateMode && !w.window.isDestroyed())
      .map((w) => w.restore());
    storage.schedule();
  },
};
function senderController(event: Electron.IpcMainInvokeEvent) {
  const controller = [...windows.values()].find((w) => w.window.webContents === event.sender);
  if (!controller || event.senderFrame !== event.sender.mainFrame)
    throw new Error('Untrusted IPC sender');
  const url = event.senderFrame.url;
  const devURL = process.env.DOT_DEV_URL;
  if (
    devURL
      ? !url.startsWith(`${devURL}/`)
      : !url.startsWith('file:') ||
        decodeURIComponent(new URL(url).pathname).replace(/^\//, '').toLowerCase() !==
          join(__dirname, '../renderer/index.html').replace(/\\/g, '/').toLowerCase()
  )
    throw new Error('Untrusted chrome origin');
  return controller;
}
if (locked)
  void app
    .whenReady()
    .then(() => {
      storage = new Storage(app.getPath('userData'));
      storage.onError = (message) => {
        for (const w of windows.values()) w.toast(message);
      };
      storage.log('startup', `v${app.getVersion()}`);
      setupAutomaticUpdates();
      ipcMain.handle('dot:snapshot', (event) => senderController(event).snapshot());
      ipcMain.handle('dot:command', async (event, raw: unknown) => {
        try {
          const controller = senderController(event);
          const command = commandSchema.parse(raw);
          return await controller.execute(command);
        } catch (error) {
          storage.log(
            'ipc-failure',
            error instanceof Error ? error.message.slice(0, 1000) : 'unknown',
          );
          return { ok: false, error: error instanceof Error ? error.message : 'Operation failed' };
        }
      });
      const previous = storage.data.windows;
      const crashed = !storage.data.cleanExit;
      storage.data.cleanExit = false;
      if ((storage.data.settings.startup === 'restore' || crashed) && previous.length)
        for (const restore of previous) host.create(false, restore);
      else {
        const w = host.create();
        if (storage.data.settings.startup === 'pages')
          for (const [i, url] of storage.data.settings.startupPages.entries()) {
            try {
              if (!i) w.navigate(w.tab(), url);
              else w.addTab(url, true);
            } catch (error) {
              storage.log('startup-page-skipped', String(error));
              w.toast('A startup page could not be opened. Review your startup settings.');
            }
          }
      }
      host.persist();
      storage.flush();
      nativeTheme.on('updated', () => {
        for (const w of windows.values()) w.emit();
      });
    })
    .catch((error) => {
      console.error(error);
      app.quit();
    });
app.on('second-instance', () => {
  const first = [...windows.values()][0];
  if (first) {
    if (first.window.isMinimized()) first.window.restore();
    first.window.focus();
  }
});
app.on('activate', () => {
  if (!windows.size && storage) host.create();
});
app.on('before-quit', () => {
  if (!storage) return;
  host.persist();
  quitting = true;
  storage.data.cleanExit = true;
  try {
    storage.flush();
  } catch (error) {
    storage.log('shutdown-write-failed', String(error));
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
