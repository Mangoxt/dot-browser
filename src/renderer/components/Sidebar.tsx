import {
  Home,
  Briefcase,
  Music2,
  BookOpen,
  Gamepad2,
  Plus,
  ChevronDown,
  Settings2,
  History,
  Star,
  Download,
  Command,
  PanelLeftClose,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { command, openPage, patchSettings, useBrowser } from '../stores/browser';
import { IconButton } from './common';
import { Tabs } from './Tabs';
const workspaceIcons: Record<string, LucideIcon> = {
  home: Home,
  briefcase: Briefcase,
  music: Music2,
  book: BookOpen,
  gamepad: Gamepad2,
};
export function Sidebar() {
  const { state, open } = useBrowser();
  if (!state) return null;
  const current = state.workspaces.find((w) => w.id === state.workspaceId)!;
  return (
    <aside className="sidebar" style={{ width: state.settings.sidebarWidth }}>
      <div className="sidebar-brand">
        <span className="dot-logo">
          d<span>•</span>
        </span>
        <span>
          dot<span className="brand-detail">browser</span>
        </span>
        <IconButton
          icon={PanelLeftClose}
          label="Collapse sidebar"
          onClick={() => patchSettings({ sidebar: false })}
        />
      </div>
      {state.private && (
        <div className="private-label">
          <Shield size={14} />
          Private window
        </div>
      )}
      <div className="sidebar-section-label">
        YOUR SPACES
        <IconButton icon={Plus} label="Create workspace" onClick={() => open('workspace')} />
      </div>
      <div className="workspaces">
        {state.workspaces.map((w, i) => {
          const Icon = workspaceIcons[w.icon];
          return (
            <div
              key={w.id}
              className={`workspace ${state.workspaceId === w.id ? 'selected' : ''}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('dot/workspace', w.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('dot/workspace');
                if (id) void command({ type: 'workspace.action', action: 'reorder', id, index: i });
              }}
            >
              <button
                className="workspace-select"
                onClick={() =>
                  void command({ type: 'workspace.action', action: 'select', id: w.id })
                }
              >
                <Icon size={16} style={{ color: w.color }} />
                <span>{w.name}</span>
                <small>{state.tabs.filter((t) => t.workspaceId === w.id).length}</small>
              </button>
              <button
                className="workspace-edit"
                title={`Edit ${w.name}`}
                aria-label={`Edit ${w.name}`}
                onClick={() => open('workspace', w)}
              >
                <ChevronDown size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="sidebar-divider" />
      {state.settings.verticalTabs ? (
        <>
          <div className="sidebar-section-label">{current.name.toUpperCase()} TABS</div>
          <Tabs vertical />
        </>
      ) : (
        <div className="sidebar-favorites">
          <div className="sidebar-section-label">FAVORITES</div>
          {state.shortcuts.slice(0, 6).map((s) => (
            <button key={s.id} onClick={() => void command({ type: 'tab.new', url: s.url })}>
              <span className="shortcut-letter">{s.title[0]}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sidebar-bottom">
        <button className="command-launch" onClick={() => open('palette')}>
          <Command size={15} />
          <span>Quick command</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="sidebar-utilities">
          <IconButton icon={History} label="History (Ctrl+H)" onClick={() => openPage('history')} />
          <IconButton icon={Star} label="Bookmarks" onClick={() => openPage('bookmarks')} />
          <IconButton
            icon={Download}
            label="Downloads (Ctrl+J)"
            onClick={() => openPage('downloads')}
          />
          <IconButton icon={Settings2} label="Settings" onClick={() => openPage('settings')} />
        </div>
        <div className="sidebar-status">
          <span className="status-dot" />A little space to focus.
        </div>
      </div>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="Resize sidebar"
        tabIndex={0}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight'].includes(e.key))
            patchSettings({
              sidebarWidth: Math.min(
                360,
                Math.max(180, state.settings.sidebarWidth + (e.key === 'ArrowLeft' ? -10 : 10)),
              ),
            });
        }}
        onPointerDown={(e) => {
          const target = e.currentTarget;
          target.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) => {
            patchSettings({ sidebarWidth: Math.min(360, Math.max(180, ev.clientX)) });
          };
          const stop = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', stop);
          };
          target.addEventListener('pointermove', move);
          target.addEventListener('pointerup', stop, { once: true });
        }}
      />
    </aside>
  );
}
