import { app, session } from 'electron';
import { join } from 'node:path';
import type { Storage } from './storage';
import type { ExtensionSummary } from '../shared/extensions';

export class ExtensionManager {
  private errors = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private get api() {
    return session.fromPartition('persist:dot-personal').extensions;
  }
  constructor(private readonly storage: Storage) {}
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
      }
      this.errors.delete(id);
      this.storage.flush();
      return this.list();
    });
  }
}
