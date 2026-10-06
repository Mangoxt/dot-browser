import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/main/storage';
import { releaseInfo, markReleaseSeen } from '../src/main/release-notice';
const directories: string[] = [];
function storage() {
  const directory = mkdtempSync(join(tmpdir(), 'dot-release-test-'));
  directories.push(directory);
  return new Storage(directory);
}
afterEach(() =>
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
describe('release notice lifecycle', () => {
  it('leaves first installation to onboarding and establishes its baseline', () => {
    const s = storage();
    expect(releaseInfo(s, '1.0.5', true, false).show).toBe(false);
    expect(new Storage(s.directory).data.lastSeenReleaseVersion).toBe('1.0.5');
  });
  it('announces legacy upgrades in only one normal window and persists dismissal', () => {
    const s = storage();
    s.data.settings.onboarded = true;
    expect(releaseInfo(s, '1.0.5', true, true).show).toBe(false);
    expect(releaseInfo(s, '1.0.5', true, false).show).toBe(true);
    expect(releaseInfo(s, '1.0.5', true, false).show).toBe(false);
    markReleaseSeen(s, '1.0.5', false);
    expect(releaseInfo(new Storage(s.directory), '1.0.5', true, false).show).toBe(false);
    expect(releaseInfo(s, '1.0.5', false, false).releases[0].version).toBe('1.0.5');
  });
  it('includes skipped updates and never regresses the stored version', () => {
    const s = storage();
    s.data.settings.onboarded = true;
    s.data.lastSeenReleaseVersion = '1.0.3';
    expect(releaseInfo(s, '1.0.5', true, false).releases.map((r) => r.version)).toEqual([
      '1.0.5',
      '1.0.4',
    ]);
    markReleaseSeen(s, '1.0.5', true);
    expect(s.data.lastSeenReleaseVersion).toBe('1.0.3');
    markReleaseSeen(s, '1.0.10', false);
    markReleaseSeen(s, '1.0.5', false);
    expect(s.data.lastSeenReleaseVersion).toBe('1.0.10');
    expect(releaseInfo(s, '1.0.5', true, false).show).toBe(false);
  });
});
