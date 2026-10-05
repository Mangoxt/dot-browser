import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readProfile } from '../src/main/profile-import';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('browser profile migration', () => {
  it('reads Firefox bookmarks and visit history while discarding unsafe schemes', () => {
    const root = mkdtempSync(join(tmpdir(), 'dot-firefox-import-'));
    roots.push(root);
    const db = new DatabaseSync(join(root, 'places.sqlite'));
    db.exec(`CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, hidden INTEGER, frecency INTEGER);
      CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, fk INTEGER, parent INTEGER, type INTEGER, title TEXT, dateAdded INTEGER);
      CREATE TABLE moz_historyvisits (place_id INTEGER, visit_date INTEGER);
      INSERT INTO moz_bookmarks VALUES (1,NULL,0,2,'Bookmarks Menu',0);
      INSERT INTO moz_places VALUES (1,'https://example.com/path','Example',0,7);
      INSERT INTO moz_places VALUES (2,'javascript:alert(1)','Unsafe',0,1);
      INSERT INTO moz_bookmarks VALUES (2,1,1,1,'Example bookmark',1700000000000000);
      INSERT INTO moz_bookmarks VALUES (3,2,1,1,'Unsafe bookmark',1700000000000000);
      INSERT INTO moz_historyvisits VALUES (1,1700000000000000);
      INSERT INTO moz_historyvisits VALUES (2,1700000000000000);`);
    db.close();

    const result = readProfile(
      { id: 'test', browser: 'Firefox', profile: 'Test', family: 'firefox', path: root },
      ['bookmarks', 'history'],
    );
    expect(result.bookmarks).toHaveLength(1);
    expect(result.bookmarks[0].url).toBe('https://example.com/path');
    expect(result.history).toHaveLength(1);
    expect(result.history[0].visitCount).toBe(1);
  });
});
