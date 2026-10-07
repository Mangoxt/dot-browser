import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  FileDown,
  FolderClock,
  History,
  Info,
  KeyRound,
  Link,
  PanelRight,
  Pin,
  Plus,
  Printer,
  Puzzle,
  Search,
  Settings2,
  Shield,
  Star,
  Trash2,
  UserRound,
  Volume2,
  X,
  AppWindow,
  type LucideIcon,
} from 'lucide-react';
import { tr } from '../i18n';
import { command, openPage, useBrowser, type Overlay } from '../stores/browser';
import { IconButton } from './common';
import type { Command } from '../../shared/ipc';
import { isWebURL } from '../../shared/navigation';

type MenuView = 'main' | 'page' | 'tabs';

export function BrowserMenu() {
  const { state, open, panel, set } = useBrowser();
  const [view, setView] = useState<MenuView>('main');
  const root = useRef<HTMLDivElement>(null);
  const returnTo = useRef<MenuView>('main');
  const previousView = useRef<MenuView>('main');
  useLayoutEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    root.current
      ?.querySelector<HTMLButtonElement>(
        view === 'main' ? `[data-menu-target="${returnTo.current}"]` : '.menu-back',
      )
      ?.focus({ preventScroll: true });
    root.current?.querySelector('.browser-menu-body')?.scrollTo(0, 0);
  }, [view]);
  if (!state) return null;
  const tab = state.tabs.find((t) => t.id === state.activeId)!;
  const web = isWebURL(tab.url);
  const run = (c: Command) => {
    open(null);
    void command(c);
  };
  const page = (name: string) => {
    open(null);
    openPage(name);
  };
  const overlay = (name: Overlay) => () => open(name);
  const show = (next: MenuView) => {
    returnTo.current = next;
    setView(next);
  };
  const item = (
    Icon: LucideIcon,
    label: string,
    action: () => void,
    shortcut?: string,
    disabled = false,
    target?: MenuView,
  ) => (
    <button
      key={label}
      className="browser-menu-item"
      aria-label={tr(label)}
      onClick={action}
      disabled={disabled}
      data-menu-target={target}
      autoFocus={view === 'main' && label === 'New tab'}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{tr(label)}</span>
      {shortcut && <kbd aria-hidden="true">{shortcut}</kbd>}
      {target && <ChevronRight className="menu-chevron" size={14} aria-hidden="true" />}
    </button>
  );
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && view !== 'main') {
      event.preventDefault();
      event.stopPropagation();
      setView('main');
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ].filter((button) => button.getClientRects().length);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next].focus();
  };
  return (
    <div className="browser-menu-content" ref={root} onKeyDown={keys}>
      <div className="browser-menu-header">
        {view === 'main' ? (
          <>
            <span className="menu-wordmark">
              <i aria-hidden="true" />
              dot
            </span>
            <IconButton
              icon={state.private ? Shield : UserRound}
              label={tr(state.private ? 'Private session' : 'Profile and import')}
              onClick={overlay('profile')}
            />
          </>
        ) : (
          <>
            <IconButton
              className="menu-back"
              icon={ArrowLeft}
              label={tr('Back to menu')}
              onClick={() => setView('main')}
            />
            <h2>{tr(view === 'page' ? 'Page tools' : 'Tabs and windows')}</h2>
          </>
        )}
        <IconButton icon={X} label={tr('Close dialog')} onClick={() => open(null)} />
      </div>
      <div className="browser-menu-body" data-menu-view={view}>
        {view === 'main' && (
          <div className="menu-view">
            <div className="menu-group">
              {item(Plus, 'New tab', () => run({ type: 'tab.new' }), 'Ctrl+T')}
              <div className="menu-window-actions">
                {item(AppWindow, 'New window', () => run({ type: 'window', action: 'new' }))}
                {item(Shield, 'Private window', () => run({ type: 'window', action: 'private' }))}
              </div>
            </div>
            <div className="menu-group">
              {item(History, 'History', () => page('history'), 'Ctrl+H')}
              {item(Star, 'Bookmarks', () => page('bookmarks'))}
              {item(Download, 'Downloads', overlay('downloads'), 'Ctrl+J')}
              {item(KeyRound, 'Saved passwords', overlay('passwords'))}
              {item(Puzzle, 'Extensions', overlay('extensions'))}
            </div>
            <div className="menu-zoom">
              <span>{tr('Zoom')}</span>
              <div className="menu-zoom-controls">
                <button
                  aria-label={tr('Zoom out')}
                  disabled={!web || tab.zoom <= 0.25}
                  onClick={() =>
                    void command({
                      type: 'zoom',
                      value: Math.max(0.25, Math.round((tab.zoom - 0.1) * 100) / 100),
                    })
                  }
                >
                  −
                </button>
                <button
                  aria-label={tr('Reset zoom')}
                  disabled={!web}
                  onClick={() => void command({ type: 'zoom', value: 1 })}
                >
                  {Math.round(tab.zoom * 100)}%
                </button>
                <button
                  aria-label={tr('Zoom in')}
                  disabled={!web || tab.zoom >= 3}
                  onClick={() =>
                    void command({
                      type: 'zoom',
                      value: Math.min(3, Math.round((tab.zoom + 0.1) * 100) / 100),
                    })
                  }
                >
                  +
                </button>
              </div>
            </div>
            <div className="menu-group">
              {item(BookOpen, 'Page tools', () => show('page'), undefined, false, 'page')}
              {item(Columns2, 'Tabs and windows', () => show('tabs'), undefined, false, 'tabs')}
              {item(Trash2, 'Clear browsing data', overlay('clear'))}
            </div>
          </div>
        )}
        {view === 'page' && (
          <div className="menu-view">
            <div className="menu-group">
              {item(
                Search,
                'Find in page',
                () => {
                  open(null);
                  set({ find: true });
                },
                'Ctrl+F',
                !web,
              )}
              {item(Camera, 'Screenshot', overlay('capture'), undefined, !web)}
              {item(BookOpen, 'Reading view', overlay('reader'), 'Ctrl+Shift+M', !web)}
              {item(
                BookOpen,
                'Read later',
                () => run({ type: 'page', action: 'readLater' }),
                undefined,
                !web,
              )}
            </div>
            <div className="menu-group">
              {item(
                Link,
                'Copy page link',
                () => run({ type: 'page', action: 'copyLink' }),
                undefined,
                !web,
              )}
              {item(
                Link,
                'Copy clean link',
                () => run({ type: 'page', action: 'copyCleanLink' }),
                undefined,
                !web,
              )}
            </div>
            <div className="menu-group">
              {item(
                FileDown,
                'Save page',
                () => run({ type: 'page', action: 'save' }),
                'Ctrl+S',
                !web,
              )}
              {item(
                FileDown,
                'Save as PDF',
                () => run({ type: 'page', action: 'pdf' }),
                'Ctrl+Shift+S',
                !web,
              )}
              {item(Printer, 'Print', () => run({ type: 'page', action: 'print' }), 'Ctrl+P', !web)}
            </div>
          </div>
        )}
        {view === 'tabs' && (
          <div className="menu-view">
            <div className="menu-group">
              {item(Search, 'Search tabs', overlay('tabsearch'), 'Ctrl+Shift+A')}
              {item(
                History,
                'Reopen closed tab',
                () => run({ type: 'tab.action', action: 'restore' }),
                'Ctrl+Shift+T',
                !state.closedTabs.length,
              )}
              {item(Copy, 'Duplicate tabs', overlay('duplicates'))}
              {item(FolderClock, 'Saved sessions', overlay('sessions'), undefined, state.private)}
            </div>
            <div className="menu-group">
              {item(Pin, tab.pinned ? 'Unpin tab' : 'Pin tab', () =>
                run({ type: 'tab.action', action: 'pin' }),
              )}
              {item(
                Volume2,
                tab.muted ? 'Unmute tab' : 'Mute tab',
                () => run({ type: 'tab.action', action: 'mute' }),
                undefined,
                !web,
              )}
              {item(Columns2, 'Split view', overlay('split'))}
              {item(PanelRight, panel ? 'Close side panel' : 'Bookmarks side panel', () => {
                open(null);
                set({ panel: panel ? null : 'bookmarks' });
              })}
            </div>
          </div>
        )}
      </div>
      <div className="browser-menu-footer">
        {item(Settings2, 'Settings', () => page('settings'))}
        <div className="menu-footer-links">
          <button onClick={overlay('whatsnew')}>
            <History size={14} aria-hidden="true" />
            {tr('Neler yeni?')}
          </button>
          <button onClick={() => page('about')}>
            <Info size={14} aria-hidden="true" />
            {tr('About Dot')}
          </button>
        </div>
      </div>
    </div>
  );
}
