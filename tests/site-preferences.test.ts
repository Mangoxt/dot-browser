import { describe, expect, it } from 'vitest';
import { settingsSchema, savedSessionSchema, dataSchema } from '../src/shared/models';
import { commandSchema } from '../src/shared/ipc';
import { canAutoSleep, cleanLink, siteZoom } from '../src/shared/site-preferences';

describe('site preferences', () => {
  it('uses exact scheme, host and port for saved zoom and never defaults another site to that factor', () => {
    const settings = settingsSchema.parse({
      siteZoom: [{ origin: 'https://example.com', value: 1.4 }],
    });
    expect(siteZoom(settings, 'https://example.com/article')).toBe(1.4);
    for (const url of [
      'http://example.com/',
      'https://example.com:8443/',
      'https://sub.example.com/',
      'browser://newtab',
    ])
      expect(siteZoom(settings, url)).toBe(1);
    for (const origin of [
      'https://user:secret@example.com',
      'https://example.com/path',
      '*.example.com',
      'file:///tmp',
    ]) {
      expect(settingsSchema.safeParse({ siteZoom: [{ origin, value: 1.2 }] }).success).toBe(false);
      expect(commandSchema.safeParse({ type: 'site.zoom.reset', origin }).success).toBe(false);
    }
  });
  it('protects pinned, audible, loading, active, split and exempt tabs from automatic sleeping', () => {
    const tab = {
      id: 'one',
      url: 'https://example.com/article',
      pinned: false,
      audio: false,
      loading: false,
    };
    const eligible = (
      patch: Partial<typeof tab> = {},
      active = 'other',
      split: (string | undefined)[] = [],
      keep: string[] = [],
    ) => canAutoSleep({ ...tab, ...patch }, active, split, keep);
    expect(eligible()).toBe(true);
    for (const patch of [
      { pinned: true },
      { audio: true },
      { loading: true },
      { url: 'browser://newtab' },
    ])
      expect(eligible(patch)).toBe(false);
    expect(eligible({}, 'one')).toBe(false);
    expect(eligible({}, 'other', ['one'])).toBe(false);
    expect(eligible({}, 'other', [], ['https://example.com'])).toBe(false);
    expect(eligible({ url: 'http://example.com' }, 'other', [], ['https://example.com'])).toBe(
      true,
    );
  });
  it('cleans only common tracking keys and preserves useful queries, fragments and embedded destinations', () => {
    const raw =
      'https://example.com/read?id=42&utm_source=a&UTM_medium=b&fbclid=one&gclid=two&ref=chapter&next=https%3A%2F%2Fother.example%2F%3Futm_source%3Dx#part';
    const clean = new URL(cleanLink(raw));
    expect([...clean.searchParams.keys()]).toEqual(['id', 'ref', 'next']);
    expect(clean.hash).toBe('#part');
    expect(clean.searchParams.get('next')).toBe('https://other.example/?utm_source=x');
    const unchanged = 'https://example.com/?signature=a%20b&ref=keep#part';
    expect(cleanLink(unchanged)).toBe(unchanged);
    expect(() => cleanLink('javascript:alert(1)')).toThrow();
    expect(() => cleanLink('https://user:secret@example.com')).toThrow();
  });
});

describe('saved-session storage boundary', () => {
  const session = {
    id: 'saved',
    name: 'Research',
    createdAt: 1,
    workspace: { name: 'Personal', color: '#a398ff', icon: 'home' },
    groups: [],
    activeTab: 0,
    tabs: [
      {
        url: 'https://example.com/',
        title: 'Example',
        pinned: false,
        muted: false,
        groupId: null,
        zoom: 1,
      },
    ],
  };
  it('accepts normal/internal/source pages and rejects executable or credential-bearing addresses', () => {
    for (const url of [
      'https://example.com/',
      'browser://settings#tabs',
      'view-source:https://example.com/',
    ])
      expect(
        savedSessionSchema.safeParse({ ...session, tabs: [{ ...session.tabs[0], url }] }).success,
      ).toBe(true);
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///secret',
      'view-source:javascript:alert(1)',
      'https://user:secret@example.com/',
      'browser://unknown',
    ])
      expect(
        savedSessionSchema.safeParse({ ...session, tabs: [{ ...session.tabs[0], url }] }).success,
      ).toBe(false);
  });
  it('bounds retained copies and active-tab indices while migrating old data with empty sessions', () => {
    expect(dataSchema.parse({}).savedSessions).toEqual([]);
    expect(savedSessionSchema.safeParse({ ...session, activeTab: 1 }).success).toBe(false);
    expect(
      savedSessionSchema.safeParse({ ...session, tabs: Array(201).fill(session.tabs[0]) }).success,
    ).toBe(false);
    expect(dataSchema.safeParse({ savedSessions: Array(41).fill(session) }).success).toBe(false);
    expect(commandSchema.safeParse({ type: 'session.save', name: '   ' }).success).toBe(false);
  });
});
