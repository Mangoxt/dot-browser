export const IMPORT_KINDS = ['bookmarks', 'history', 'tabs', 'cookies', 'passwords'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export interface ImportSource {
  id: string;
  browser: string;
  profile: string;
  family: 'chromium' | 'firefox';
  path?: string;
}
export interface ImportPreview {
  token: string;
  source: string;
  counts: Record<ImportKind, number>;
  warnings: string[];
}
export interface ImportReport {
  counts: Record<ImportKind, number>;
  skipped: number;
  warnings: string[];
}
export interface SavedLogin {
  id: string;
  origin: string;
  username: string;
  encrypted: string;
  createdAt: number;
}
export type LoginSummary = Omit<SavedLogin, 'encrypted'>;
