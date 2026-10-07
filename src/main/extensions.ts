import { app, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { rm, readFile, mkdir, mkdtemp, rename } from 'node:fs/promises';
import { downloadExtension } from 'electron-chrome-web-store';
import type { Storage } from './storage';
import type { ExtensionSummary } from '../shared/extensions';

export class ExtensionManager {
  private errors = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private get api() {
    return session.fromPartition('persist:dot-personal').extensions;
  }
  constructor(private readonly storage: Storage) {}
  installStore(
    id: string,
    confirm: (name: string, manifest: Record<string, unknown>) => Promise<boolean>,
  ) {
    return this.serial(async () => {
      if (!/^[a-p]{32}$/.test(id)) throw new Error('Invalid store extension identity');
      if (this.storage.data.extensions.some((e) => e.id === id))
        throw new Error('This extension is already installed');
      if (this.storage.data.extensions.length >= 20)
        throw new Error('En fazla 20 eklenti eklenebilir.');
      await mkdir(this.storePath, { recursive: true });
      const stage = await mkdtemp(join(this.storePath, '.pending-'));
      try {
        const downloaded = await downloadExtension(id, stage);
        const child = relative(stage, resolve(downloaded));
        if (!child || child.startsWith('..') || isAbsolute(child))
          throw new Error('Invalid extension download location');
        const manifest = JSON.parse(await readFile(join(downloaded, 'manifest.json'), 'utf8'));
        if (
          !/^\d{1,6}(?:\.\d{1,6}){0,3}$/.test(manifest.version) ||
          ![2, 3].includes(manifest.manifest_version)
        )
          throw new Error('Invalid extension manifest');
        let name = String(manifest.name ?? id);
        if (/^__MSG_\w+__$/.test(name) && /^[\w-]{2,20}$/.test(manifest.default_locale ?? '')) {
          try {
            const messages = JSON.parse(
              await readFile(
                join(downloaded, '_locales', manifest.default_locale, 'messages.json'),
                'utf8',
              ),
            );
            name = String(messages[name.slice(6, -2)]?.message ?? name);
          } catch {
            /* Keep manifest name if translations are unavailable. */
          }
        }
        if (!(await confirm(name, manifest))) return this.list();
        const root = join(this.storePath, id);
        await mkdir(root, { recursive: true });
        const target = join(root, `${manifest.version}_${randomUUID()}`);
        const ownedTarget = relative(resolve(this.storePath), resolve(target));
        if (!ownedTarget || ownedTarget.startsWith('..') || isAbsolute(ownedTarget))
          throw new Error('Invalid store extension location');
        await rename(downloaded, target);
        try {
          const loaded = await this.api.loadExtension(target, { allowFileAccess: false });
          if (loaded.id !== id) {
            this.api.removeExtension(loaded.id);
            throw new Error('Store extension identity mismatch');
          }
          this.rememberStore(loaded);
        } catch (error) {
          await rm(target, { recursive: true, force: true });
          throw error;
        }
        this.storage.flush();
        return this.list();
      } finally {
        const child = relative(resolve(this.storePath), resolve(stage));
        if (child.startsWith('.pending-') && !isAbsolute(child) && !child.includes('..'))
          await rm(stage, { recursive: true, force: true });
      }
    });
  }
  get storePath() {
    return join(this.storage.directory, 'extensions-store');
  }
  rememberStore(loaded: Electron.Extension) {
    const child = relative(this.storePath, loaded.path);
    if (!child || child.startsWith('..') || isAbsolute(child)) return;
    const existing = this.storage.data.extensions.find((item) => item.id === loaded.id);
    if (existing) {
      if (existing.source !== 'store') return;
      existing.path = loaded.path;
      existing.version = loaded.version;
      existing.name = loaded.name;
    } else {
      if (this.storage.data.extensions.length >= 20) {
        this.api.removeExtension(loaded.id);
        return;
      }
      this.storage.data.extensions.push({
        id: loaded.id,
        path: loaded.path,
        name: loaded.name,
        version: loaded.version,
        description: String(loaded.manifest.description || '').slice(0, 500),
        enabled: true,
        source: 'store',
      });
    }
    this.storage.flush();
  }
  async restore() {
    for (const item of this.storage.data.extensions) {
      if (!item.enabled) continue;
      try {
        const loaded = await this.api.loadExtension(this.path(item), { allowFileAccess: false });
        item.id = loaded.id;
      } catch {
        this.errors.set(item.id, 'Eklenti yüklenemedi. Klasörünü ve uyumluluğunu kontrol edin.');
      }
    }
  }
  private path(item: { path: string; builtin?: 'night' | 'scroll' }) {
    return item.builtin
      ? join(
          app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
          'assets',
          'extensions',
          item.builtin,
        )
      : item.path;
  }
  list(): ExtensionSummary[] {
    return this.storage.data.extensions.map(({ path: _path, ...item }) => ({
      ...item,
      error: this.errors.get(item.id),
    }));
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }
  install(path: string, builtin?: 'night' | 'scroll') {
    return this.serial(async () => {
      if (this.storage.data.extensions.length >= 20)
        throw new Error('En fazla 20 eklenti eklenebilir.');
      const candidate = { path, builtin };
      const existing = this.storage.data.extensions.find(
        (item) => this.path(item).toLowerCase() === this.path(candidate).toLowerCase(),
      );
      if (existing) throw new Error('Bu eklenti zaten eklenmiş.');
      const loaded = await this.api.loadExtension(this.path(candidate), { allowFileAccess: false });
      const duplicate = this.storage.data.extensions.find((item) => item.id === loaded.id);
      if (duplicate) {
        this.api.removeExtension(loaded.id);
        if (duplicate.enabled)
          await this.api.loadExtension(this.path(duplicate), { allowFileAccess: false });
        throw new Error('Bu eklenti kimliği zaten eklenmiş.');
      }
      this.storage.data.extensions.push({
        id: loaded.id,
        path,
        builtin,
        name: loaded.name,
        version: loaded.version,
        description: String(loaded.manifest.description || '').slice(0, 500),
        enabled: true,
      });
      this.storage.flush();
      return this.list();
    });
  }
  action(id: string, action: 'enable' | 'disable' | 'remove') {
    return this.serial(async () => {
      const item = this.storage.data.extensions.find((item) => item.id === id);
      if (!item) throw new Error('Eklenti bulunamadı.');
      if (action === 'enable') {
        const loaded = await this.api.loadExtension(this.path(item), { allowFileAccess: false });
        item.id = loaded.id;
        item.enabled = true;
      } else {
        this.api.removeExtension(item.id);
        item.enabled = false;
        if (action === 'remove')
          this.storage.data.extensions = this.storage.data.extensions.filter((e) => e !== item);
        if (action === 'remove' && item.source === 'store') {
          if (!/^[a-p]{32}$/.test(item.id)) throw new Error('Invalid store extension identity');
          const root = resolve(this.storePath),
            target = resolve(root, item.id);
          const child = relative(root, target);
          if (!child || child.startsWith('..') || isAbsolute(child))
            throw new Error('Invalid store extension location');
          await rm(target, { recursive: true, force: true });
        }
      }
      this.errors.delete(id);
      this.storage.flush();
      return this.list();
    });
  }
}
