import { create } from 'zustand';
import type {
  BrowserWindowState,
  Bookmark,
  Shortcut,
  Workspace,
  TabGroup,
} from '../../shared/models';
import type { Command } from '../../shared/ipc';
export type Overlay =
  | 'palette'
  | 'bookmark'
  | 'shortcut'
  | 'workspace'
  | 'group'
  | 'split'
  | 'clear'
  | 'site'
  | 'profile'
  | 'downloads'
  | 'onboarding'
  | 'import'
  | 'passwords'
  | 'tabsearch'
  | 'reader'
  | 'whatsnew'
  | 'browsermenu'
  | 'extensions'
  | null;
interface UIState {
  state: BrowserWindowState | null;
  overlay: Overlay;
  editing: Bookmark | Shortcut | Workspace | TabGroup | null;
  panel: 'bookmarks' | 'history' | 'downloads' | 'tabs' | null;
  panelWidth: number;
  omnibox: boolean;
  find: boolean;
  toast: string;
  setState: (state: BrowserWindowState) => void;
  open: (overlay: Overlay, editing?: UIState['editing']) => void;
  set: (patch: Partial<UIState>) => void;
}
export const useBrowser = create<UIState>((set) => ({
  state: null,
  overlay: null,
  editing: null,
  panel: null,
  panelWidth: 300,
  omnibox: false,
  find: false,
  toast: '',
  setState: (state) => set({ state }),
  open: (overlay, editing = null) => set({ overlay, editing, omnibox: false }),
  set: (patch) => set(patch),
}));
let toastTimer: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  useBrowser.setState({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useBrowser.setState({ toast: '' }), 3200);
}
export async function command(c: Command) {
  const result = await window.dot.command(c);
  if (!result.ok) notify(result.error ?? 'Operation failed');
  return result;
}
export function openPage(page: string) {
  void command({ type: 'tab.new', url: `browser://${page}` });
}
export function patchSettings(patch: Extract<Command, { type: 'settings' }>['patch']) {
  void command({ type: 'settings', patch });
}
export function bookmarkCurrent() {
  const { state, open } = useBrowser.getState();
  const tab = state?.tabs.find((t) => t.id === state.activeId);
  if (!tab || !/^https?:/.test(tab.url)) {
    notify('Open a website to bookmark it');
    return;
  }
  open(
    'bookmark',
    state!.bookmarks.find((b) => b.url === tab.url) ?? {
      id: crypto.randomUUID(),
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
      folder: 'Favorites',
      createdAt: Date.now(),
    },
  );
}
