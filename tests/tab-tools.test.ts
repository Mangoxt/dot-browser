import { describe, expect, it } from 'vitest';
import { duplicateGroups, TabCycle } from '../src/shared/tab-tools';
import type { BrowserTab } from '../src/shared/models';
import { commandSchema } from '../src/shared/ipc';
const tab = (id: string, patch: Partial<BrowserTab> = {}): BrowserTab => ({
  id,
  workspaceId: 'w',
  url: 'https://example.com/',
  title: id,
  favicon: '',
  loading: false,
  pinned: false,
  muted: false,
  audio: false,
  suspended: false,
  groupId: null,
  zoom: 1,
  canGoBack: false,
  canGoForward: false,
  connection: 'https',
  blockedPopups: 0,
  processId: null,
  webContentsId: null,
  error: null,
  ...patch,
});
describe('duplicate review', () => {
  it('keeps one copy, all protected tabs and other workspaces', () => {
    const tabs = [
      tab('first'),
      tab('active'),
      tab('pin', { pinned: true }),
      tab('sound', { audio: true }),
      tab('load', { loading: true }),
      tab('split'),
      tab('other', { workspaceId: 'other' }),
      tab('last'),
    ];
    const groups = duplicateGroups(tabs, 'w', 'active', {
      left: 'split',
      right: 'active',
      focused: 'active',
      ratio: 0.5,
      direction: 'vertical',
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].removable.map((tab) => tab.id)).toEqual(['first', 'last']);
    expect(groups[0].tabs.some((tab) => tab.id === 'other')).toBe(false);
  });
  it('keeps the first background copy when none is protected', () => {
    expect(
      duplicateGroups([tab('a'), tab('b'), tab('c')], 'w', 'elsewhere', null)[0].removable.map(
        (tab) => tab.id,
      ),
    ).toEqual(['b', 'c']);
  });
  it('does not merge hashes, searches, protocols or internal pages', () => {
    const tabs = [
      tab('a'),
      tab('b', { url: 'https://example.com/?q=x' }),
      tab('c', { url: 'https://example.com/#x' }),
      tab('d', { url: 'http://example.com/' }),
      tab('e', { url: 'browser://newtab' }),
      tab('f', { url: 'browser://newtab' }),
    ];
    expect(duplicateGroups(tabs, 'w', 'a', null)).toEqual([]);
  });
  it('protects a recently activated or audible candidate on revalidation', () => {
    const tabs = [tab('a'), tab('b')];
    expect(duplicateGroups(tabs, 'w', 'a', null)[0].removable).toHaveLength(1);
    expect(duplicateGroups(tabs, 'w', 'b', null)[0].removable.map((tab) => tab.id)).toEqual(['a']);
    tabs[1].audio = true;
    expect(duplicateGroups(tabs, 'w', 'a', null)[0].removable).toEqual([]);
  });
});
describe('recent tab cycling', () => {
  const tabs = [tab('a'), tab('b'), tab('c'), tab('elsewhere', { workspaceId: 'other' })];
  it('freezes held-key order rather than bouncing between two tabs', () => {
    const cycle = new TabCycle();
    expect(cycle.next(tabs, 'w', 'a', ['a', 'c', 'b'], false)).toBe('c');
    expect(cycle.next(tabs, 'w', 'c', ['c', 'a', 'b'], false)).toBe('b');
    expect(cycle.next(tabs, 'w', 'b', ['b', 'c', 'a'], true)).toBe('c');
    cycle.reset();
    expect(cycle.next(tabs, 'w', 'c', ['c', 'b', 'a'], false)).toBe('b');
  });
  it('wraps, prunes closed tabs, and never enters another workspace', () => {
    const cycle = new TabCycle();
    expect(cycle.next(tabs, 'w', 'a', ['a', 'elsewhere', 'c', 'b'], true)).toBe('b');
    expect(
      cycle.next(
        tabs.filter((tab) => tab.id !== 'c'),
        'w',
        'b',
        ['b', 'c', 'a'],
        false,
      ),
    ).toBe('a');
    expect(cycle.next(tabs, 'other', 'elsewhere', ['a'], false)).toBe('elsewhere');
    expect(cycle.next([], 'empty', '', [], false)).toBeUndefined();
  });
});
describe('new action boundaries', () => {
  it('rejects malformed modes, unbounded tab lists and missing expected URLs', () => {
    expect(
      commandSchema.safeParse({ type: 'page.capture', mode: 'desktop', destination: 'file' })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'tab.cleanup', workspaceId: 'w', tabs: [] }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'tab.cleanup', workspaceId: 'w', tabs: [{ id: 'a' }] })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'tab.cleanup',
        workspaceId: 'w',
        tabs: Array.from({ length: 201 }, () => ({ id: 'a', url: 'https://example.com/' })),
      }).success,
    ).toBe(false);
  });
});
