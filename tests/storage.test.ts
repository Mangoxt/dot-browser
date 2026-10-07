import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
const directories: string[] = [];
function storage() {
  const dir = mkdtempSync(join(tmpdir(), 'dot-storage-test-'));
  directories.push(dir);
  return new Storage(dir);
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe('durable storage', () => {
  it('migrates legacy restored zoom values to exact-origin preferences', () => {
    const a = storage();
    const raw = JSON.parse(JSON.stringify(a.data));
    delete raw.settings.siteZoom;
    raw.windows = [
      {
        id: 'window',
        workspaceId: 'space',
        activeId: 'active',
        workspaces: [{ id: 'space', name: 'Personal', color: '#a398ff', icon: 'home' }],
        groups: [],
        tabs: [
          {
            id: 'active',
            workspaceId: 'space',
            url: 'https://example.com/article',
            title: 'Old page',
            pinned: false,
            muted: false,
            zoom: 1.4,
          },
        ],
      },
    ];
    writeFileSync(a.path, JSON.stringify(raw));
    expect(new Storage(a.directory).data.settings.siteZoom).toEqual([
      { origin: 'https://example.com', value: 1.4 },
    ]);
  });
  it('persists named sessions with groups without adding page secrets or live tab IDs', () => {
    const a = storage();
    a.data.savedSessions.push({
      id: 'saved',
      name: 'Research',
      createdAt: 1,
      workspace: { name: 'Work', color: '#a398ff', icon: 'briefcase' },
      groups: [{ id: 'group', name: 'Articles', color: '#a398ff', collapsed: false }],
      activeTab: 0,
      tabs: [
        {
          url: 'https://example.com',
          title: 'Example',
          pinned: true,
          muted: false,
          groupId: 'group',
          zoom: 1,
        },
      ],
    });
    a.flush();
    const copy = new Storage(a.directory).data.savedSessions[0];
    expect(copy.groups[0].name).toBe('Articles');
    expect(copy.tabs[0].groupId).toBe('group');
    expect(Object.keys(copy.tabs[0]).sort()).toEqual(
      ['groupId', 'muted', 'pinned', 'title', 'url', 'zoom'].sort(),
    );
  });
  it('persists bookmarks, settings and restores snapshots atomically', () => {
    const a = storage();
    a.data.settings.theme = 'light';
    a.data.bookmarks.push({
      id: 'test',
      title: 'Test',
      url: 'https://example.com',
      folder: 'Favorites',
      createdAt: 1,
      favicon: '',
    });
    a.flush();
    const b = new Storage(a.directory);
    expect(b.data.settings.theme).toBe('light');
    expect(b.data.bookmarks[0].title).toBe('Test');
    expect(JSON.parse(readFileSync(a.path, 'utf8')).version).toBe(1);
  });
  it('recovers from a truncated primary file using the last valid backup', () => {
    const a = storage();
    a.data.settings.theme = 'light';
    a.flush();
    a.data.settings.theme = 'dark';
    a.flush();
    writeFileSync(a.path, '{"broken"');
    expect(new Storage(a.directory).data.settings.theme).toBe('light');
  });
  it('recovers valid sections when one section is corrupted', () => {
    const a = storage();
    const raw = { ...a.data, history: 'corrupt', settings: { ...a.data.settings, theme: 'light' } };
    writeFileSync(a.path, JSON.stringify(raw));
    const b = new Storage(a.directory);
    expect(b.data.history).toEqual([]);
    expect(b.data.settings.theme).toBe('light');
  });
  it('uses safe defaults if all data is corrupt', () => {
    const a = storage();
    writeFileSync(a.path, 'garbage');
    expect(new Storage(a.directory).data.settings.theme).toBe('dark');
  });
  it('marks incomplete downloads interrupted after restart', () => {
    const a = storage();
    a.data.downloads.push({
      id: 'x',
      filename: 'a.zip',
      url: 'https://example.com/a.zip',
      path: '',
      received: 2,
      total: 10,
      speed: 1,
      status: 'progressing',
      startedAt: 1,
    });
    a.flush();
    expect(new Storage(a.directory).data.downloads[0].status).toBe('interrupted');
  });
});
