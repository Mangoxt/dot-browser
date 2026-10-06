import { tr } from './i18n';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Minus, Square, Copy, X, Globe, RotateCw, ArrowLeft, Shield, Cpu } from 'lucide-react';
import {
  bookmarkCurrent,
  command,
  notify,
  openPage,
  useBrowser,
  OVERLAY_EXIT_MS,
} from './stores/browser';
import { internalPage } from '../shared/models';
import { Tabs } from './components/Tabs';
import { Toolbar, BookmarkBar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Overlays } from './components/Overlays';
import { SidePanel } from './components/SidePanel';
import { FindBar } from './components/FindBar';
import { Favicon, IconButton, PageHeading } from './components/common';
import { HistoryPage, BookmarksPage, DownloadsPage } from './pages/Library';
import { AboutContent } from './pages/About';
const NewTab = lazy(() => import('./pages/NewTab'));
const Settings = lazy(() => import('./pages/Settings'));
export default function App() {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [releasePending, setReleasePending] = useState(false);
  const {
    state,
    overlay,
    overlayClosing,
    omnibox,
    find,
    panel,
    panelWidth,
    toast,
    setState,
    open,
    set,
  } = useBrowser();
  const header = useRef<HTMLElement>(null);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    document.documentElement.lang = state?.settings.language ?? 'en-US';
  }, [state?.settings.language]);
  useEffect(() => {
    let started = false;
    const unsubscribe = window.dot.onState((next) => {
      setState(next);
      if (!started) {
        started = true;
        if (!next.settings.onboarded) open('onboarding');
        void command({ type: 'release.info', automatic: true }).then((r) =>
          setReleasePending(!!r.release?.show),
        );
      }
    });
    void window.dot.snapshot().then((next) => {
      setState(next);
      if (!started) {
        started = true;
        if (!next.settings.onboarded) open('onboarding');
        void command({ type: 'release.info', automatic: true }).then((r) =>
          setReleasePending(!!r.release?.show),
        );
      }
    });
    const off = window.dot.onEvent((event) => {
      if (event.type === 'toast' && event.message) notify(event.message);
      else if (event.type === 'omnibox') set({ omnibox: true });
      else if (event.type === 'find') set({ find: true });
      else if (event.type === 'bookmark') bookmarkCurrent();
      else if (event.type === 'escape') {
        open(null);
        set({ omnibox: false, find: false });
      } else if (['palette', 'split', 'group', 'clear', 'tabsearch', 'reader'].includes(event.type))
        open(event.type as 'palette');
    });
    return () => {
      unsubscribe();
      off();
    };
  }, [setState, open, set]);
  useEffect(() => {
    if (
      releasePending &&
      state?.settings.onboarded &&
      !overlay &&
      !omnibox &&
      !state.permissionRequests.length
    ) {
      setReleasePending(false);
      open('whatsnew');
    }
  }, [
    releasePending,
    state?.settings.onboarded,
    state?.permissionRequests.length,
    overlay,
    overlayClosing,
    omnibox,
    open,
  ]);
  const showSidebar = !!state?.settings.sidebar && viewportWidth >= 980;
  const sidebarWidth = showSidebar ? (state?.settings.sidebarWidth ?? 224) : 0;
  const vertical = !!state?.settings.verticalTabs && showSidebar;
  useEffect(() => {
    if (!state || !header.current) return;
    const layout = () => {
      const width = window.innerWidth;
      const left = state.settings.sidebar && width >= 980 ? state.settings.sidebarWidth : 0;
      const right = panel && width >= 1100 ? panelWidth : 0;
      void command({
        type: 'layout',
        top: header.current!.getBoundingClientRect().height,
        left,
        right,
        overlay: !!overlay || omnibox || state.permissionRequests.length > 0,
      });
    };
    const observer = new ResizeObserver(layout);
    observer.observe(header.current);
    layout();
    window.addEventListener('resize', layout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', layout);
    };
  }, [
    state?.settings.sidebar,
    state?.settings.sidebarWidth,
    state?.settings.compact,
    state?.settings.verticalTabs,
    state?.settings.bookmarkBar,
    state?.split,
    state?.permissionRequests.length,
    overlay,
    omnibox,
    find,
    panel,
    panelWidth,
    state?.windowId,
  ]);
  if (!state)
    return (
      <div className="bootstrap">
        <span className="dot-logo">{tr('d•')}</span>
        <span>{tr('Opening Dot…')}</span>
      </div>
    );
  const tab = state.tabs.find((t) => t.id === state.activeId);
  if (!tab) return null;
  const page = internalPage(tab.url);
  const dark =
    state.settings.theme === 'dark' || (state.settings.theme === 'system' && state.systemDark);
  const contentPage = () => {
    if (tab.error)
      return (
        <div className="error-page">
          <Globe size={44} />
          <span className="eyebrow">{tr('PAGE ERROR')}</span>
          <h1>{tr('This page couldn’t open.')}</h1>
          <p>{tab.url}</p>
          <code>{tab.error}</code>
          <p className="muted">{tr('Check the address and your connection, then try again.')}</p>
          <div>
            <button
              className="primary"
              onClick={() => void command({ type: 'tab.action', action: 'reload' })}
            >
              <RotateCw size={15} />
              {tr('Try again')}
            </button>
            <button
              disabled={!tab.canGoBack}
              onClick={() => void command({ type: 'tab.action', action: 'back' })}
            >
              <ArrowLeft size={15} />
              {tr('Go back')}
            </button>
          </div>
        </div>
      );
    if (page === 'newtab') return <NewTab />;
    if (page === 'settings') return <Settings key={tab.id} />;
    if (page === 'history') return <HistoryPage />;
    if (page === 'bookmarks') return <BookmarksPage />;
    if (page === 'downloads') return <DownloadsPage />;
    if (page === 'about')
      return (
        <div className="internal-page">
          <PageHeading eyebrow="DOT BROWSER" title={tr('About Dot')} />
          <AboutContent />
        </div>
      );
    if (page === 'performance')
      return (
        <div className="internal-page">
          <PageHeading eyebrow={tr('BROWSER PROCESSES')} title={tr('Task manager')}>
            <button onClick={() => void window.dot.snapshot().then(setState)}>
              <RotateCw size={14} />
              {tr('Refresh')}
            </button>
          </PageHeading>
          <p className="muted">
            {tr('Process IDs are supplied by Chromium. Multiple tabs may share a process.')}
          </p>
          {state.tabs.map((t) => (
            <div className="library-row" key={t.id}>
              <Cpu size={16} />
              <Favicon url={t.favicon} />
              <span className="row-content">
                <strong>{t.title}</strong>
                <small>{t.url}</small>
              </span>
              <code>{t.processId || '—'}</code>
              <span className="badge">
                {t.suspended
                  ? tr('Suspended')
                  : internalPage(t.url)
                    ? tr('Internal')
                    : t.loading
                      ? tr('Loading')
                      : tr('Running')}
              </span>
              <button
                disabled={
                  t.id === state.activeId ||
                  (!!state.split && [state.split.left, state.split.right].includes(t.id)) ||
                  !!internalPage(t.url)
                }
                onClick={() => void command({ type: 'tab.action', id: t.id, action: 'suspend' })}
              >
                {tr('Suspend')}
              </button>
              <IconButton
                icon={X}
                label={tr('Close {name}', { name: t.title })}
                onClick={() => void command({ type: 'tab.action', id: t.id, action: 'close' })}
              />
            </div>
          ))}
        </div>
      );
    if (page === 'error')
      return (
        <div className="error-page">
          <h1>{tr('Page not found')}</h1>
          <button onClick={() => openPage('newtab')}>{tr('Open new tab')}</button>
        </div>
      );
    return <div className="webpage-surface" aria-hidden="true" />;
  };
  return (
    <div
      className={`app ${dark ? 'dark' : 'light'} accent-${state.settings.accent} ${state.settings.compact ? 'compact' : ''} ${state.settings.animations ? '' : 'no-animation'}`}
      style={
        {
          '--sidebar-width': `${sidebarWidth}px`,
          '--radius': `${state.settings.radius}px`,
          '--glass-opacity': state.settings.glass,
          '--text-scale': state.settings.textScale,
          '--motion-exit': `${OVERLAY_EXIT_MS}ms`,
        } as React.CSSProperties
      }
    >
      <header ref={header} className="browser-header">
        <div
          className="titlebar"
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) void command({ type: 'window', action: 'maximize' });
          }}
        >
          <div className="titlebar-brand">
            <span className="tiny-dot" />
            dot
            {state.private && (
              <span className="title-private">
                <Shield size={11} />
                {tr('Private')}
              </span>
            )}
          </div>
          {!vertical ? <Tabs /> : <div className="vertical-title">{tab.title}</div>}
          <div className="window-controls">
            <IconButton
              icon={Minus}
              label={tr('Minimize window')}
              onClick={() => void command({ type: 'window', action: 'minimize' })}
            />
            <IconButton
              icon={state.maximized ? Copy : Square}
              label={state.maximized ? tr('Restore window') : tr('Maximize window')}
              onClick={() => void command({ type: 'window', action: 'maximize' })}
            />
            <IconButton
              icon={X}
              label={tr('Close window')}
              className="window-close"
              onClick={() => void command({ type: 'window', action: 'close' })}
            />
          </div>
        </div>
        <Toolbar />
        <BookmarkBar />
        {find && <FindBar />}
        {toast && (
          <div className="chrome-notice" role="status">
            <span className="tiny-dot" />
            <span>{tr(toast)}</span>
            <IconButton
              icon={X}
              label={tr('Dismiss notification')}
              onClick={() => set({ toast: '' })}
            />
          </div>
        )}
      </header>
      <div className="browser-body">
        {showSidebar && <Sidebar />}
        <main
          ref={content}
          className="page-content"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const url =
              e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (/^https?:\/\//.test(url)) void command({ type: 'tab.new', url });
          }}
        >
          <Suspense fallback={<div className="internal-loading">{tr('Opening…')}</div>}>
            {contentPage()}
          </Suspense>
          {state.split && (
            <div
              className={`split-divider ${state.split.direction}`}
              style={
                state.split.direction === 'vertical'
                  ? { left: `calc((100% - 6px) * ${state.split.ratio})` }
                  : { top: `calc((100% - 6px) * ${state.split.ratio})` }
              }
              role="separator"
              aria-label={tr('Resize split view')}
              tabIndex={0}
              onKeyDown={(e) => {
                if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key))
                  void command({
                    type: 'split',
                    otherId: state.split!.right,
                    ratio: Math.min(
                      0.8,
                      Math.max(
                        0.2,
                        state.split!.ratio +
                          (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -0.05 : 0.05),
                      ),
                    ),
                  });
              }}
              onPointerDown={(e) => {
                const target = e.currentTarget;
                target.setPointerCapture(e.pointerId);
                const rect = content.current!.getBoundingClientRect();
                const move = (ev: PointerEvent) => {
                  const ratio =
                    state.split!.direction === 'vertical'
                      ? (ev.clientX - rect.left) / rect.width
                      : (ev.clientY - rect.top) / rect.height;
                  void command({
                    type: 'split',
                    otherId: state.split!.right,
                    ratio: Math.max(0.2, Math.min(0.8, ratio)),
                  });
                };
                const stop = () => target.removeEventListener('pointermove', move);
                target.addEventListener('pointermove', move);
                target.addEventListener('pointerup', stop, { once: true });
              }}
            />
          )}
        </main>
        {panel && <SidePanel />}
      </div>
      {omnibox && <div className="omnibox-scrim" onClick={() => set({ omnibox: false })} />}
      <Overlays />
      {state.permissionRequests[0] && (
        <div className="permission-scrim">
          <div
            className="permission-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={tr('Site permission request')}
          >
            <Shield size={24} />
            <h3>{state.permissionRequests[0].origin}</h3>
            <p>
              {tr('wants to use')} <strong>{tr(state.permissionRequests[0].permission)}</strong>
            </p>
            <div className="form-actions">
              {(['block', 'once', 'allow'] as const).map((decision) => (
                <button
                  className={decision === 'allow' ? 'primary' : ''}
                  key={decision}
                  onClick={() =>
                    void command({
                      type: 'permission',
                      id: state.permissionRequests[0].id,
                      decision,
                    })
                  }
                >
                  {decision === 'once'
                    ? tr('Allow once')
                    : decision === 'allow'
                      ? tr('Always allow')
                      : tr('Block')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab.loading && <div className="loading-line" />}
    </div>
  );
}
