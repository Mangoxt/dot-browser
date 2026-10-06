import { describe, expect, it } from 'vitest';
import {
  resolveInput,
  isWebURL,
  historyGroup,
  recordVisit,
  safeFavicon,
} from '../src/shared/navigation';
import { dataSchema, settingsSchema, internalPage } from '../src/shared/models';
import { commandSchema } from '../src/shared/ipc';
const settings = settingsSchema.parse({});
describe('omnibox', () => {
  it.each([
    ['google.com', 'https://google.com/'],
    ['youtube.com/watch?v=123', 'https://youtube.com/watch?v=123'],
    ['https://github.com', 'https://github.com/'],
    ['localhost:5173', 'http://localhost:5173/'],
    ['127.0.0.1:3000', 'http://127.0.0.1:3000/'],
    ['192.168.1.1', 'http://192.168.1.1/'],
    ['[::1]:3000', 'http://[::1]:3000/'],
    ['http://localhost:3000/a', 'http://localhost:3000/a'],
    ['browser://settings#privacy', 'browser://settings#privacy'],
    ['', 'browser://newtab'],
  ])('resolves %s', (input, url) => expect(resolveInput(input, settings).url).toBe(url));
  it.each([
    'hello world',
    'typescript electron tutorial',
    'best music production software',
    'hello',
    'a.b',
    'python: list comprehension',
  ])('searches %s', (input) =>
    expect(resolveInput(input, settings)).toEqual({
      url: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
      query: input,
    }),
  );
  it('uses selected engine and custom aliases', () => {
    expect(resolveInput('cats & dogs', { ...settings, engine: 'duck' }).url).toBe(
      'https://duckduckgo.com/?q=cats%20%26%20dogs',
    );
    expect(resolveInput('yt music production', settings).url).toBe(
      'https://www.youtube.com/results?search_query=music%20production',
    );
    expect(resolveInput('gh electron', settings).url).toBe('https://github.com/search?q=electron');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///C:/Windows',
    'browser://unknown',
    'https://user:secret@example.com',
    'https://',
  ])('rejects dangerous or malformed input %s', (input) =>
    expect(() => resolveInput(input, settings)).toThrow(),
  );
  it('keeps internal pages off the network', () => {
    expect(internalPage('browser://history')).toBe('history');
    expect(internalPage('https://browser.com')).toBeNull();
    expect(internalPage('browser://bad')).toBe('error');
  });
  it('rejects unsafe favicon schemes', () => {
    expect(safeFavicon('file:///private')).toBe('');
    expect(safeFavicon('javascript:hello')).toBe('');
    expect(isWebURL('https://example.com')).toBe(true);
  });
});
describe('history', () => {
  it('increments visits and bounds storage without mutating old records', () => {
    const initial = recordVisit([], 'https://example.com', 'Example', '', 10);
    const next = recordVisit(initial, 'https://example.com', 'New title', '', 20);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ visitCount: 2, title: 'New title', timestamp: 20 });
    expect(initial[0].visitCount).toBe(1);
    expect(recordVisit(next, 'browser://settings', 'Settings')).toBe(next);
  });
  it('groups by local calendar boundaries', () => {
    const now = new Date(2026, 9, 5, 13).getTime();
    expect(historyGroup(now, now)).toBe('Today');
    expect(historyGroup(new Date(2026, 9, 4, 23).getTime(), now)).toBe('Yesterday');
    expect(historyGroup(now - 4 * 86400000, now)).toBe('Previous 7 days');
    expect(historyGroup(now - 12 * 86400000, now)).toBe('Older');
  });
});
describe('boundary validation', () => {
  it('does not reset unrelated settings in a partial command', () => {
    expect(commandSchema.parse({ type: 'settings', patch: { theme: 'light' } })).toEqual({
      type: 'settings',
      patch: { theme: 'light' },
    });
  });
  it.each(['https:///%s', 'https://name:secret@example.com/?q=%s'])(
    'rejects unsafe engine templates %s',
    (template) => {
      expect(
        settingsSchema.safeParse({
          engines: [{ id: 'test', name: 'Test', keyword: 't', template }],
        }).success,
      ).toBe(false);
    },
  );
  it('supplies consistent first-run defaults', () => {
    const data = dataSchema.parse({});
    expect(data.settings).toEqual(settings);
    expect(data.history).toEqual([]);
    expect(data.shortcuts.length).toBeGreaterThan(0);
  });
  it('rejects invalid settings', () => {
    expect(settingsSchema.safeParse({ sidebarWidth: -1 }).success).toBe(false);
    expect(
      settingsSchema.safeParse({
        engines: [{ id: 'test', name: 'Unsafe', keyword: 'u', template: 'javascript:%s' }],
      }).success,
    ).toBe(false);
  });
  it('rejects unknown IPC commands and arbitrary tab actions', () => {
    expect(commandSchema.safeParse({ type: 'executeJS', code: 'hello' }).success).toBe(false);
    expect(commandSchema.safeParse({ type: 'tab.action', action: 'execute' }).success).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'layout', top: -1, left: 0, right: 0, overlay: false })
        .success,
    ).toBe(false);
  });
  it('validates the optional keyboard focus preference for tab selection', () => {
    expect(
      commandSchema.safeParse({ type: 'tab.action', action: 'select', focusChrome: true }).success,
    ).toBe(true);
    expect(commandSchema.safeParse({ type: 'tab.action', action: 'select' }).success).toBe(true);
    expect(
      commandSchema.safeParse({ type: 'tab.action', action: 'select', focusChrome: 'true' })
        .success,
    ).toBe(false);
  });
});
