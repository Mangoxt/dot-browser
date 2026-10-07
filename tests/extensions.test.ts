import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = vi.hoisted(() => ({ loadExtension: vi.fn(), removeExtension: vi.fn() }));
const downloads = vi.hoisted(() => ({ downloadExtension: vi.fn() }));
vi.mock('electron-chrome-web-store', () => downloads);
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/dot' },
  session: { fromPartition: () => ({ extensions: api }) },
}));
import { Storage } from '../src/main/storage';
import { ExtensionManager } from '../src/main/extensions';
import { chromeStoreId } from '../src/shared/extensions';
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
  it('accepts only official store links or a valid extension identity', () => {
    const id = 'a'.repeat(32);
    expect(chromeStoreId(id)).toBe(id);
    expect(chromeStoreId(`https://chromewebstore.google.com/detail/example/${id}?hl=tr`)).toBe(id);
    for (const url of [
      `http://chromewebstore.google.com/detail/example/${id}`,
      `https://evil.example/detail/${id}`,
      `https://chromewebstore.google.com.evil.example/detail/${id}`,
      `https://user:pass@chromewebstore.google.com/detail/example/${id}`,
      `https://chromewebstore.google.com/other/${id}`,
    ])
      expect(chromeStoreId(url)).toBeUndefined();
  });
  it('previews downloaded permissions without loading declined code and cleans staging files', async () => {
    const manager = new ExtensionManager(storage),
      id = 'b'.repeat(32);
    downloads.downloadExtension.mockImplementation(async (_id: string, stage: string) => {
      const path = join(stage, id, '1.0_0');
      mkdirSync(path, { recursive: true });
      writeFileSync(
        join(path, 'manifest.json'),
        JSON.stringify({
          name: 'Permission fixture',
          version: '1.0',
          manifest_version: 3,
          permissions: ['tabs'],
        }),
      );
      return path;
    });
    const confirm = vi.fn().mockResolvedValue(false);
    expect(await manager.installStore(id, confirm)).toHaveLength(0);
    expect(confirm).toHaveBeenCalledWith(
      'Permission fixture',
      expect.objectContaining({ permissions: ['tabs'] }),
    );
    expect(api.loadExtension).not.toHaveBeenCalled();
    expect(new Storage(storage.directory).data.extensions).toHaveLength(0);
  });
  it('remembers only owned store installations and deletes only their owned files', async () => {
    const manager = new ExtensionManager(storage),
      id = 'a'.repeat(32);
    const owned = join(manager.storePath, id, '1.0_0');
    mkdirSync(owned, { recursive: true });
    writeFileSync(join(owned, 'manifest.json'), '{}');
    const extension = {
      id,
      name: 'Store fixture',
      version: '1.0',
      path: owned,
      manifest: {},
    } as Electron.Extension;
    manager.rememberStore({ ...extension, path: join(storage.directory, 'elsewhere') });
    expect(manager.list()).toHaveLength(0);
    manager.rememberStore(extension);
    expect(manager.list()[0].source).toBe('store');
    await manager.action(id, 'disable');
    manager.rememberStore(extension);
    expect(manager.list()[0].enabled).toBe(false);
    expect(existsSync(owned)).toBe(true);
    await manager.action(id, 'remove');
    expect(existsSync(join(manager.storePath, id))).toBe(false);
    expect(manager.list()).toHaveLength(0);
  });
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
