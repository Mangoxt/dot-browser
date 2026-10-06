import { z } from 'zod';

export const engineSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  keyword: z.string().max(15),
  template: z.string().refine((v) => {
    try {
      const url = new URL(v);
      return url.protocol === 'https:' && !url.username && !url.password && v.includes('%s');
    } catch {
      return false;
    }
  }, 'Use a valid HTTPS URL containing %s, without credentials'),
});
export type SearchEngine = z.infer<typeof engineSchema>;
export const ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', keyword: 'g', template: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', keyword: 'b', template: 'https://www.bing.com/search?q=%s' },
  { id: 'duck', name: 'DuckDuckGo', keyword: 'd', template: 'https://duckduckgo.com/?q=%s' },
  {
    id: 'brave',
    name: 'Brave Search',
    keyword: 'br',
    template: 'https://search.brave.com/search?q=%s',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    keyword: 'yt',
    template: 'https://www.youtube.com/results?search_query=%s',
  },
  { id: 'github', name: 'GitHub', keyword: 'gh', template: 'https://github.com/search?q=%s' },
];
export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  forceDarkPages: z.boolean().default(true),
  darkSiteExceptions: z.array(z.string().url().max(8192)).max(500).default([]),
  accent: z.enum(['violet', 'blue', 'green', 'rose', 'amber']).default('violet'),
  compact: z.boolean().default(false),
  animations: z.boolean().default(true),
  glass: z.number().min(0).max(1).default(0.8),
  radius: z.number().min(4).max(14).default(9),
  verticalTabs: z.boolean().default(false),
  sidebar: z.boolean().default(true),
  sidebarWidth: z.number().min(180).max(360).default(224),
  bookmarkBar: z.boolean().default(false),
  showHome: z.boolean().default(true),
  home: z.string().default('browser://newtab'),
  engine: z.string().default('google'),
  engines: z.array(engineSchema).default(ENGINES),
  startup: z.enum(['newtab', 'restore', 'pages']).default('restore'),
  startupPages: z.array(z.string()).default([]),
  memorySaver: z.enum(['off', 'balanced', 'aggressive']).default('balanced'),
  protection: z.enum(['off', 'balanced', 'strict']).default('off'),
  blockedDomains: z.array(z.string()).default([]),
  popupAllowlist: z.array(z.string()).default([]),
  downloadPath: z.string().default(''),
  askDownload: z.boolean().default(true),
  background: z.enum(['orbital', 'plain', 'grid']).default('orbital'),
  language: z.enum(['en-US', 'tr-TR', 'de-DE', 'fr-FR']).default('en-US'),
  textScale: z.number().min(0.85).max(1.3).default(1),
  onboarded: z.boolean().default(false),
});
export type BrowserSettings = z.infer<typeof settingsSchema>;
export const bookmarkSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(500),
  url: z.string().max(8192),
  favicon: z.string().default(''),
  folder: z.string().default('Favorites'),
  createdAt: z.number(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;
export const historySchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  favicon: z.string().default(''),
  timestamp: z.number(),
  visitCount: z.number(),
});
export type HistoryEntry = z.infer<typeof historySchema>;
export const shortcutSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(80),
  url: z.string(),
  favicon: z.string().default(''),
});
export type Shortcut = z.infer<typeof shortcutSchema>;
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#a398ff'),
  icon: z.enum(['home', 'briefcase', 'music', 'book', 'gamepad']).default('home'),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const groupSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  collapsed: z.boolean(),
});
export type TabGroup = z.infer<typeof groupSchema>;
export const tabRestoreSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  url: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  muted: z.boolean(),
  groupId: z.string().nullable().default(null),
  zoom: z.number().min(0.25).max(3).default(1),
});
export type TabRestore = z.infer<typeof tabRestoreSchema>;
export interface BrowserTab extends TabRestore {
  connection: 'internal' | 'pending' | 'https' | 'http' | 'error';
  favicon: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  audio: boolean;
  suspended: boolean;
  blockedPopups: number;
  error: string | null;
  processId: number | null;
  webContentsId: number | null;
}
export interface ClosedTab {
  tab: TabRestore;
  index: number;
}
export const downloadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
  path: z.string(),
  received: z.number(),
  total: z.number(),
  speed: z.number(),
  status: z.enum(['progressing', 'paused', 'completed', 'cancelled', 'interrupted']),
  startedAt: z.number(),
});
export type DownloadItem = z.infer<typeof downloadSchema>;
export const permissionSchema = z.object({
  origin: z.string(),
  permission: z.string(),
  decision: z.enum(['allow', 'block']),
});
export type PermissionRule = z.infer<typeof permissionSchema>;
export interface PermissionRequest {
  id: string;
  contentsId: number;
  origin: string;
  permission: string;
}
export const windowSchema = z.object({
  id: z.string(),
  tabs: z.array(tabRestoreSchema),
  workspaces: z.array(workspaceSchema).min(1),
  groups: z.array(groupSchema).default([]),
  workspaceId: z.string(),
  activeId: z.string(),
  bounds: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().min(640),
      height: z.number().min(480),
    })
    .optional(),
});
export type WindowRestore = z.infer<typeof windowSchema>;
export const dataSchema = z.object({
  version: z.literal(1).default(1),
  settings: settingsSchema.default(() => settingsSchema.parse({})),
  history: z.array(historySchema).default([]),
  bookmarks: z.array(bookmarkSchema).default([]),
  folders: z.array(z.string()).default(['Favorites', 'Reading list']),
  shortcuts: z.array(shortcutSchema).default([
    { id: 'github', title: 'GitHub', url: 'https://github.com', favicon: '' },
    { id: 'wiki', title: 'Wikipedia', url: 'https://wikipedia.org', favicon: '' },
    { id: 'youtube', title: 'YouTube', url: 'https://youtube.com', favicon: '' },
  ]),
  searches: z.array(z.string()).default([]),
  downloads: z.array(downloadSchema).default([]),
  permissions: z.array(permissionSchema).default([]),
  windows: z.array(windowSchema).default([]),
  cleanExit: z.boolean().default(true),
  lastSeenReleaseVersion: z
    .string()
    .regex(/^(?:\d+\.\d+\.\d+)?$/)
    .default(''),
  extensions: z
    .array(
      z.object({
        id: z.string(),
        path: z.string(),
        name: z.string(),
        version: z.string(),
        description: z.string(),
        enabled: z.boolean(),
        builtin: z.enum(['night', 'scroll']).optional(),
      }),
    )
    .max(20)
    .default([]),
  logins: z
    .array(
      z.object({
        id: z.string(),
        origin: z.string(),
        username: z.string(),
        encrypted: z.string(),
        createdAt: z.number(),
      }),
    )
    .default([]),
});
export type BrowserData = z.infer<typeof dataSchema>;
export interface SplitState {
  left: string;
  right: string;
  ratio: number;
  direction: 'vertical' | 'horizontal';
  focused: string;
}
export interface BrowserWindowState {
  windowId: string;
  private: boolean;
  tabs: BrowserTab[];
  workspaces: Workspace[];
  groups: TabGroup[];
  activeId: string;
  workspaceId: string;
  split: SplitState | null;
  maximized: boolean;
  settings: BrowserSettings;
  bookmarks: Bookmark[];
  folders: string[];
  history: HistoryEntry[];
  shortcuts: Shortcut[];
  searches: string[];
  downloads: DownloadItem[];
  permissions: PermissionRule[];
  permissionRequests: PermissionRequest[];
  find: { matches: number; active: number };
  versions: { app: string; electron: string; chrome: string; node: string };
  systemDark: boolean;
}
export const INTERNAL_PAGES = [
  'newtab',
  'settings',
  'history',
  'downloads',
  'bookmarks',
  'about',
  'performance',
] as const;
export function internalPage(url: string): string | null {
  if (!url.startsWith('browser://')) return null;
  const page = url.slice(10).split(/[/?#]/)[0];
  return (INTERNAL_PAGES as readonly string[]).includes(page) ? page : 'error';
}
