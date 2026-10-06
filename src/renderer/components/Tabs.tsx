import { tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  Pin,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Search,
} from 'lucide-react';
import { command, useBrowser } from '../stores/browser';
import { Favicon, IconButton } from './common';
import type { BrowserTab } from '../../shared/models';
export function Tabs({ vertical = false }: { vertical?: boolean }) {
  const { state, open } = useBrowser();
  const scroll = useRef<HTMLDivElement>(null);
  const revealed = useRef('');
  const [edges, setEdges] = useState({ before: false, after: false });
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const update = () =>
      setEdges({
        before: element.scrollLeft > 1,
        after: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener('scroll', update, { passive: true });
    const active = element.querySelector<HTMLElement>('.tab.selected');
    const selection = `${vertical}:${state?.workspaceId}:${state?.activeId}`;
    if (selection !== revealed.current) {
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      revealed.current = selection;
    }
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [state?.activeId, state?.tabs, state?.groups, state?.workspaceId, vertical]);
  const moveScroll = (direction: number) => {
    const element = scroll.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.7,
      behavior:
        state?.settings.animations && !matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'smooth'
          : 'instant',
    });
  };
  if (!state) return null;
  const tabs = state.tabs.filter((t) => t.workspaceId === state.workspaceId);
  const visibleTabs = [
    ...tabs.filter((t) => !t.groupId),
    ...state.groups
      .filter((g) => g.workspaceId === state.workspaceId && !g.collapsed)
      .flatMap((g) => tabs.filter((t) => t.groupId === g.id)),
  ];
  const focusId = visibleTabs.some((t) => t.id === state.activeId)
    ? state.activeId
    : visibleTabs[0]?.id;
  const renderTab = (tab: BrowserTab) => (
    <div
      key={tab.id}
      className={`tab ${tab.id === state.activeId ? 'selected' : ''} ${tab.pinned ? 'pinned' : ''} ${tab.suspended ? 'suspended' : ''}`}
      role="tab"
      aria-selected={tab.id === state.activeId}
      tabIndex={tab.id === focusId ? 0 : -1}
      title={tab.title}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('dot/tab', tab.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('dot/tab');
        if (id)
          void command({
            type: 'tab.move',
            id,
            index: state.tabs.findIndex((t) => t.id === tab.id),
          });
      }}
      onClick={() => void command({ type: 'tab.action', action: 'select', id: tab.id })}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
        const next = vertical ? 'ArrowDown' : 'ArrowRight';
        if ([previous, next, 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const visible = [...scroll.current!.querySelectorAll<HTMLElement>('[role="tab"]')];
          const index = visible.indexOf(e.currentTarget);
          const target =
            visible[
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? visible.length - 1
                  : (index + (e.key === next ? 1 : -1) + visible.length) % visible.length
            ];
          target?.focus({ preventScroll: true });
          target?.click();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void command({ type: 'tab.action', action: 'select', id: tab.id });
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          void command({ type: 'tab.action', action: 'close', id: tab.id });
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        void command({ type: 'menu.tab', id: tab.id });
      }}
    >
      <Favicon url={tab.favicon} loading={tab.loading} />
      {(!tab.pinned || vertical) && <span className="tab-title">{tab.title}</span>}
      {(tab.audio || tab.muted) && (
        <button
          className="tab-small"
          tabIndex={tab.id === focusId ? 0 : -1}
          title={tab.muted ? tr('Unmute tab') : tr('Mute tab')}
          aria-label={tab.muted ? tr('Unmute tab') : tr('Mute tab')}
          onClick={(e) => {
            e.stopPropagation();
            void command({ type: 'tab.action', action: 'mute', id: tab.id });
          }}
        >
          {tab.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      )}
      {tab.pinned && vertical && <Pin size={12} />}
      {!tab.pinned && (
        <button
          className="tab-small close-tab"
          tabIndex={tab.id === focusId ? 0 : -1}
          title={tr('Close tab (Ctrl+W)')}
          aria-label={tr('Close {name}', { name: tab.title })}
          onClick={(e) => {
            e.stopPropagation();
            void command({ type: 'tab.action', action: 'close', id: tab.id });
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
  return (
    <div className={`tabs-container ${vertical ? 'vertical' : ''}`}>
      {!vertical && (edges.before || edges.after) && (
        <IconButton
          icon={ChevronLeft}
          label={tr('Scroll tabs left')}
          disabled={!edges.before}
          onClick={() => moveScroll(-1)}
        />
      )}
      <div
        ref={scroll}
        className="tab-scroll"
        role="tablist"
        aria-label={tr('Browser tabs')}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) void command({ type: 'tab.new' });
        }}
      >
        {tabs.filter((t) => !t.groupId).map(renderTab)}
        {state.groups
          .filter((g) => g.workspaceId === state.workspaceId)
          .map((g) => (
            <div
              className="tab-group"
              key={g.id}
              style={{ '--group-color': g.color } as React.CSSProperties}
            >
              <button
                className="group-label"
                title={tr('{name}: click to {action}, right click to edit', {
                  name: g.name,
                  action: tr(g.collapsed ? 'expand' : 'collapse'),
                })}
                onClick={() => void command({ type: 'group.action', id: g.id, action: 'collapse' })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  open('group', g);
                }}
              >
                <Layers size={12} />
                {g.name}
                <ChevronDown size={12} style={{ transform: g.collapsed ? 'rotate(-90deg)' : '' }} />
              </button>
              {!g.collapsed && tabs.filter((t) => t.groupId === g.id).map(renderTab)}
            </div>
          ))}
      </div>
      {!vertical && (edges.before || edges.after) && (
        <IconButton
          icon={ChevronRight}
          label={tr('Scroll tabs right')}
          disabled={!edges.after}
          onClick={() => moveScroll(1)}
        />
      )}
      <div className="tab-controls">
        <IconButton
          icon={Plus}
          label={tr('New tab (Ctrl+T)')}
          onClick={() => void command({ type: 'tab.new' })}
        />
        <IconButton
          icon={Search}
          label={tr('Search tabs (Ctrl+Shift+A)')}
          onClick={() => open('tabsearch')}
        />
      </div>
    </div>
  );
}
