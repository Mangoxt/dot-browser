import { session, dialog } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import type { BrowserHost } from './browser';
import { translate } from '../shared/i18n';

export async function createExtensionBridge(host: BrowserHost) {
  const persistent = session.fromPartition('persist:dot-personal');
  const owners = () =>
    [...host.windows.values()].filter((w) => !w.privateMode && !w.window.isDestroyed());
  const ownerOf = (wc: Electron.WebContents) => owners().find((w) => w.ownsContents(wc.id));
  let notifying = 0;
  const bridge = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: persistent,
    createTab: async (details) => {
      const owner =
        details.windowId === undefined || details.windowId === -2
          ? (owners().find((w) => w.window.isFocused()) ?? owners()[0])
          : owners().find((w) => w.window.id === details.windowId);
      if (!owner) throw new Error('Browser window unavailable');
      const tab = owner.addTab(details.url || 'about:blank', details.active === false);
      if (!tab.view) owner.navigate(tab, 'about:blank');
      if (details.pinned) {
        tab.meta.pinned = true;
        owner.sortPinned();
        owner.changed();
      }
      return [tab.view!.webContents, owner.window];
    },
    selectTab: (wc) => {
      if (notifying) return;
      const owner = ownerOf(wc);
      const tab = owner?.tabs.find((t) => t.view?.webContents === wc);
      if (owner && tab) owner.select(tab);
    },
    removeTab: (wc) => {
      if (notifying) return;
      const owner = ownerOf(wc);
      const tab = owner?.tabs.find((t) => t.view?.webContents === wc);
      if (owner && tab) owner.close(tab);
    },
    assignTabDetails: (details, wc) => {
      const owner = ownerOf(wc);
      const tab = owner?.tabs.find((t) => t.view?.webContents === wc);
      if (!owner || !tab) return;
      details.index = owner.tabs.indexOf(tab);
      details.pinned = tab.meta.pinned;
      details.active = owner.active()?.meta.id === tab.meta.id;
      details.incognito = false;
    },
    createWindow: async (details) => {
      if (details.incognito) throw new Error('Extensions are unavailable in private windows');
      const urls =
        details.url === undefined ? [] : Array.isArray(details.url) ? details.url : [details.url];
      // Validate all addresses before creating a window.
      for (const url of urls)
        if (!/^https?:\/\//i.test(url) && !allowedExtensionURL(url, persistent))
          throw new Error('Unsupported extension window URL');
      const owner = host.create(false);
      if (urls.length) {
        owner.navigate(owner.tab(), urls[0]);
        for (const url of urls.slice(1)) owner.addTab(url, true);
      }
      return owner.window;
    },
    removeWindow: (win) => {
      if (owners().some((w) => w.window === win)) win.close();
    },
    requestPermissions: async (extension, permissions) => {
      const owner = owners()[0];
      if (!owner) return false;
      const answer = await dialog.showMessageBox(owner.window, {
        type: 'question',
        message: translate('Allow extension permissions?', owner.data.settings.language),
        detail: `${extension.name}\n\n${[...(permissions.permissions ?? []), ...(permissions.origins ?? [])].join('\n')}`,
        buttons: [
          translate('Cancel', owner.data.settings.language),
          translate('Allow', owner.data.settings.language),
        ],
        defaultId: 0,
        cancelId: 0,
      });
      return answer.response === 1;
    },
  });
  // Host notifications must not be interpreted as extension requests to select/close a tab.
  const add = bridge.addTab.bind(bridge),
    select = bridge.selectTab.bind(bridge),
    remove = bridge.removeTab.bind(bridge);
  bridge.addTab = (wc, win) => {
    notifying++;
    try {
      add(wc, win);
    } finally {
      notifying--;
    }
  };
  bridge.selectTab = (wc) => {
    notifying++;
    try {
      select(wc);
    } finally {
      notifying--;
    }
  };
  bridge.removeTab = (wc) => {
    notifying++;
    try {
      remove(wc);
    } finally {
      notifying--;
    }
  };
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  // QA remains invisible even when testing a real extension popup.
  if (process.env.DOT_TEST_HIDDEN)
    bridge.on('browser-action-popup-created', (popup) => {
      popup.show = () => {
        popup.hidden = false;
      };
    });
  return bridge;
}

export function allowedExtensionURL(url: string, persistent: Electron.Session) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'chrome-extension:' &&
      !!persistent.extensions.getExtension(parsed.hostname)
    );
  } catch {
    return false;
  }
}
