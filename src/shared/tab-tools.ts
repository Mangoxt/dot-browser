import type { BrowserTab, SplitState } from './models';
import { isWebURL } from './navigation';

export interface DuplicateGroup {
  url: string;
  tabs: BrowserTab[];
  removable: BrowserTab[];
}

// Only identical web addresses within one workspace qualify. Query strings and
// fragments can identify different documents and must not be discarded.
export function duplicateGroups(
  tabs: BrowserTab[],
  workspaceId: string,
  activeId: string,
  split: SplitState | null,
): DuplicateGroup[] {
  const byURL = new Map<string, BrowserTab[]>();
  for (const tab of tabs) {
    if (tab.workspaceId !== workspaceId || !isWebURL(tab.url)) continue;
    const matching = byURL.get(tab.url) ?? [];
    matching.push(tab);
    byURL.set(tab.url, matching);
  }
  const protectedTab = (tab: BrowserTab) =>
    tab.id === activeId ||
    tab.pinned ||
    tab.audio ||
    tab.loading ||
    tab.id === split?.left ||
    tab.id === split?.right;
  return [...byURL.entries()]
    .filter(([, matching]) => matching.length > 1)
    .map(([url, matching]) => {
      const keeper = matching.find(protectedTab) ?? matching[0];
      return {
        url,
        tabs: matching,
        removable: matching.filter((tab) => tab !== keeper && !protectedTab(tab)),
      };
    });
}

// A held Ctrl+Tab gesture uses a fixed order; updating MRU on every selection
// would otherwise bounce between only two tabs.
export class TabCycle {
  private order: string[] = [];
  private workspace = '';
  reset() {
    this.order = [];
    this.workspace = '';
  }
  next(
    tabs: { id: string; workspaceId: string }[],
    workspace: string,
    active: string,
    recent: string[],
    backwards: boolean,
  ) {
    const ids = tabs.filter((tab) => tab.workspaceId === workspace).map((tab) => tab.id);
    if (this.workspace !== workspace || !this.order.includes(active)) {
      this.workspace = workspace;
      this.order = [...new Set([active, ...recent, ...ids])].filter((id) => ids.includes(id));
    } else this.order = this.order.filter((id) => ids.includes(id));
    if (!this.order.length) return undefined;
    const index = this.order.indexOf(active);
    return this.order[(index + (backwards ? -1 : 1) + this.order.length) % this.order.length];
  }
}
