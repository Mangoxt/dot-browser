import {
  mkdirSync,
  readFileSync,
  existsSync,
  renameSync,
  writeFileSync,
  copyFileSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { BrowserData, dataSchema } from '../shared/models';

export class Storage {
  releaseNoticeClaimed = false;
  data: BrowserData;
  readonly path: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onError?: (message: string) => void;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, 'browser-data.json');
    this.data = dataSchema.parse({});
    for (const path of [this.path, `${this.path}.bak`]) {
      if (!existsSync(path)) continue;
      try {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
        const result = dataSchema.safeParse(raw);
        if (result.success) {
          this.data = result.data;
          break;
        }
        // Recover independent valid sections rather than discard all browser data.
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const recovered: Record<string, unknown> = {};
          for (const [key, schema] of Object.entries(dataSchema.shape)) {
            const item = schema.safeParse((raw as Record<string, unknown>)[key]);
            if (item.success) recovered[key] = item.data;
          }
          if (Object.keys(recovered).length > 2) {
            this.data = dataSchema.parse(recovered);
            this.log('storage-section-recovery');
            break;
          }
        }
        this.log('storage-validation-failed', result.error.message);
      } catch (error) {
        this.log('storage-read-failed', String(error));
      }
    }
    this.data.downloads = this.data.downloads.map((d) =>
      ['progressing', 'paused'].includes(d.status) ? { ...d, status: 'interrupted', speed: 0 } : d,
    );
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.flush();
      } catch (error) {
        this.log('storage-write-failed', String(error));
        this.onError?.(
          'Could not save browser data. Check your free disk space and file permissions.',
        );
      }
    }, 180);
  }
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data), { encoding: 'utf8', flush: true });
    if (existsSync(this.path)) copyFileSync(this.path, `${this.path}.bak`);
    renameSync(temp, this.path);
  }
  log(event: string, detail = '') {
    try {
      appendFileSync(
        join(this.directory, 'browser.log'),
        `${new Date().toISOString()} ${event} ${detail}\n`,
      );
    } catch {
      /* Logging must never prevent recovery. */
    }
  }
}
