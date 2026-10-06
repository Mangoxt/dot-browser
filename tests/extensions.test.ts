import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = vi.hoisted(() => ({ loadExtension: vi.fn(), removeExtension: vi.fn() }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/dot' },
  session: { fromPartition: () => ({ extensions: api }) },
}));
import { Storage } from '../src/main/storage';
import { ExtensionManager } from '../src/main/extensions';
let storage: Storage;
beforeEach(() => {
  vi.resetAllMocks();
  storage = new Storage(mkdtempSync(join(tmpdir(), 'dot-extension-unit-')));
  api.loadExtension.mockImplementation(async (path: string) => ({
    id: path,
    name: 'Fixture',
    version: '1.0',
    manifest: { description: 'A test' },
  }));
});
afterEach(() => rmSync(storage.directory, { recursive: true, force: true }));
describe('extension lifecycle', () => {
  it('persists installation while withholding filesystem paths from the UI', async () => {
    const manager = new ExtensionManager(storage);
    const items = await manager.install('/fixture');
    expect(items[0]).not.toHaveProperty('path');
    expect(api.loadExtension).toHaveBeenCalledWith('/fixture', { allowFileAccess: false });
    expect(new Storage(storage.directory).data.extensions[0].enabled).toBe(true);
  });
  it('serializes concurrent duplicate installation and recovers after rejection', async () => {
    const manager = new ExtensionManager(storage);
    const result = await Promise.allSettled([
      manager.install('/fixture'),
      manager.install('/fixture'),
    ]);
    expect(result.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(api.loadExtension).toHaveBeenCalledTimes(1);
    expect(await manager.install('/other')).toHaveLength(2);
  });
  it('disables, enables and removes without deleting user files', async () => {
    const manager = new ExtensionManager(storage);
    await manager.install('/fixture');
    expect((await manager.action('/fixture', 'disable'))[0].enabled).toBe(false);
    expect((await manager.action('/fixture', 'enable'))[0].enabled).toBe(true);
    expect(await manager.action('/fixture', 'remove')).toHaveLength(0);
    expect(new Storage(storage.directory).data.extensions).toHaveLength(0);
  });
  it('does not remember a failed install', async () => {
    api.loadExtension.mockRejectedValueOnce(new Error('Invalid manifest'));
    const manager = new ExtensionManager(storage);
    await expect(manager.install('/broken')).rejects.toThrow();
    expect(manager.list()).toEqual([]);
  });
  it('preserves the original extension when a second folder uses the same identity', async () => {
    api.loadExtension.mockImplementation(async () => ({
      id: 'same-key',
      name: 'Original',
      version: '1.0',
      manifest: {},
    }));
    const manager = new ExtensionManager(storage);
    await manager.install('/original');
    await expect(manager.install('/copy')).rejects.toThrow('kimliği');
    expect(manager.list()).toHaveLength(1);
    expect(api.loadExtension).toHaveBeenLastCalledWith('/original', { allowFileAccess: false });
  });
  it('restores enabled extensions and isolates missing folders from startup', async () => {
    const manager = new ExtensionManager(storage);
    await manager.install('/enabled');
    await manager.install('/disabled');
    await manager.action('/disabled', 'disable');
    api.loadExtension.mockClear();
    api.loadExtension.mockRejectedValueOnce(new Error('Missing folder'));
    const restored = new ExtensionManager(new Storage(storage.directory));
    await expect(restored.restore()).resolves.toBeUndefined();
    expect(api.loadExtension).toHaveBeenCalledTimes(1);
    expect(restored.list()[0].error).toBeTruthy();
  });
});
