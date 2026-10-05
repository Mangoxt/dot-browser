import { Plus, X, Pin, Volume2, VolumeX, ChevronDown, Layers, Search } from 'lucide-react';
import { command, useBrowser } from '../stores/browser';
import { Favicon, IconButton } from './common';
import type { BrowserTab } from '../../shared/models';
export function Tabs({ vertical = false }: { vertical?: boolean }) {
  const { state, open } = useBrowser();
  if (!state) return null;
  const tabs = state.tabs.filter((t) => t.workspaceId === state.workspaceId);
  const renderTab = (tab: BrowserTab) => (
    <div
      key={tab.id}
      className={`tab ${tab.id === state.activeId ? 'selected' : ''} ${tab.pinned ? 'pinned' : ''} ${tab.suspended ? 'suspended' : ''}`}
      role="tab"
      aria-selected={tab.id === state.activeId}
      tabIndex={0}
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
          title={tab.muted ? 'Unmute tab' : 'Mute tab'}
          aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
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
          title="Close tab (Ctrl+W)"
          aria-label={`Close ${tab.title}`}
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
      <div
        className="tab-scroll"
        role="tablist"
        aria-label="Browser tabs"
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
                title={`${g.name} — click to ${g.collapsed ? 'expand' : 'collapse'}, right click to edit`}
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
      <div className="tab-controls">
        <IconButton
          icon={Plus}
          label="New tab (Ctrl+T)"
          onClick={() => void command({ type: 'tab.new' })}
        />
        <IconButton icon={Search} label="Search tabs (Ctrl+K)" onClick={() => open('palette')} />
      </div>
    </div>
  );
}
