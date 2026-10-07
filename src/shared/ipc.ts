import { z } from 'zod';
import type { ReadingArticle } from './reading';
import type { ExtensionSummary } from './extensions';
import { chromeStoreId } from './extensions';
import {
  IMPORT_KINDS,
  type ImportSource,
  type ImportPreview,
  type ImportReport,
  type LoginSummary,
} from './import';
import {
  BrowserWindowState,
  BrowserSettings,
  bookmarkSchema,
  engineSchema,
  settingsSchema,
  shortcutSchema,
  workspaceSchema,
  siteOriginSchema,
} from './models';
const id = z.string().min(1).max(100);
// Zod 4 applies nested defaults inside partial objects. A patch must never reset
// omitted preferences, so unwrap every field's default before making it optional.
const settingsPatchSchema = z.object(
  Object.fromEntries(
    Object.entries(settingsSchema.shape).map(([key, field]) => [
      key,
      field.removeDefault().optional(),
    ]),
  ),
) as z.ZodType<Partial<BrowserSettings>>;
export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tab.cleanup'),
    workspaceId: id,
    tabs: z
      .array(z.object({ id, url: z.string().max(8192) }))
      .min(1)
      .max(200),
  }),
  z.object({
    type: z.literal('page.capture'),
    mode: z.enum(['visible', 'full']),
    destination: z.enum(['file', 'clipboard']),
    id: id.optional(),
    url: z.string().max(8192).optional(),
  }),
  z.object({ type: z.literal('session.save'), name: z.string().trim().min(1).max(60) }),
  z.object({
    type: z.literal('session.action'),
    id,
    action: z.enum(['restore', 'remove', 'rename']),
    name: z.string().trim().min(1).max(60).optional(),
  }),
  z.object({ type: z.literal('site.zoom.reset'), origin: siteOriginSchema }),
  z.object({ type: z.literal('extension.list') }),
  z.object({
    type: z.literal('extension.store'),
    url: z
      .string()
      .max(2048)
      .refine((value) => !!chromeStoreId(value)),
  }),
  z.object({ type: z.literal('adblock.info') }),
  z.object({ type: z.literal('adblock.update') }),
  z.object({
    type: z.literal('extension.install'),
    builtin: z.enum(['night', 'scroll']).optional(),
  }),
  z.object({
    type: z.literal('extension.action'),
    id,
    action: z.enum(['enable', 'disable', 'remove']),
  }),
  z.object({ type: z.literal('release.info'), automatic: z.boolean().optional() }),
  z.object({ type: z.literal('release.seen') }),
  z.object({
    type: z.literal('tab.new'),
    url: z.string().max(8192).optional(),
    background: z.boolean().optional(),
    workspaceId: id.optional(),
  }),
  z.object({ type: z.literal('tab.navigate'), input: z.string().max(8192), id: id.optional() }),
  z.object({
    type: z.literal('tab.action'),
    action: z.enum([
      'select',
      'close',
      'duplicate',
      'pin',
      'mute',
      'reload',
      'hardReload',
      'back',
      'forward',
      'stop',
      'restore',
      'closeOthers',
      'closeRight',
      'newWindow',
      'suspend',
    ]),
    id: id.optional(),
    focusChrome: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('tab.move'),
    id,
    index: z.number().int().min(0).max(1000),
    workspaceId: id.optional(),
    groupId: id.nullable().optional(),
  }),
  z.object({ type: z.literal('workspace.save'), workspace: workspaceSchema }),
  z.object({
    type: z.literal('workspace.action'),
    action: z.enum(['select', 'delete', 'reorder']),
    id,
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('group.save'),
    id: id.optional(),
    name: z.string().min(1).max(40),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    tabId: id.optional(),
  }),
  z.object({ type: z.literal('group.action'), id, action: z.enum(['collapse', 'delete']) }),
  z.object({
    type: z.literal('split'),
    otherId: id.nullable(),
    ratio: z.number().min(0.2).max(0.8).optional(),
    direction: z.enum(['vertical', 'horizontal']).optional(),
    swap: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('layout'),
    top: z.number().min(0).max(500),
    left: z.number().min(0).max(600),
    right: z.number().min(0).max(600),
    overlay: z.boolean(),
  }),
  z.object({ type: z.literal('bookmark.save'), bookmark: bookmarkSchema }),
  z.object({ type: z.literal('bookmark.remove'), id }),
  z.object({ type: z.literal('bookmark.reorder'), id, index: z.number().int().min(0) }),
  z.object({ type: z.literal('bookmark.transfer'), action: z.enum(['import', 'export']) }),
  z.object({ type: z.literal('import.sources') }),
  z.object({ type: z.literal('import.folder') }),
  z.object({
    type: z.literal('import.preview'),
    sourceId: id,
    kinds: z.array(z.enum(IMPORT_KINDS)).min(1).max(5),
  }),
  z.object({ type: z.literal('import.file'), kind: z.enum(['passwords', 'cookies', 'tabs']) }),
  z.object({ type: z.literal('import.apply'), token: id }),
  z.object({ type: z.literal('import.cancel'), token: id.optional() }),
  z.object({ type: z.literal('login.list') }),
  z.object({
    type: z.literal('login.action'),
    id,
    action: z.enum(['copy', 'delete', 'reveal', 'fill']),
  }),
  z.object({ type: z.literal('folder.add'), name: z.string().min(1).max(60) }),
  z.object({ type: z.literal('history.delete'), ids: z.array(id) }),
  z.object({
    type: z.literal('data.clear'),
    hours: z.number().min(0),
    history: z.boolean(),
    cookies: z.boolean(),
    cache: z.boolean(),
    session: z.boolean(),
  }),
  z.object({ type: z.literal('settings'), patch: settingsPatchSchema }),
  z.object({ type: z.literal('engine.save'), engine: engineSchema }),
  z.object({ type: z.literal('engine.remove'), id }),
  z.object({ type: z.literal('shortcut.save'), shortcut: shortcutSchema }),
  z.object({ type: z.literal('shortcut.remove'), id }),
  z.object({ type: z.literal('shortcut.reorder'), id, index: z.number().int().min(0) }),
  z.object({
    type: z.literal('download'),
    id,
    action: z.enum(['pause', 'resume', 'cancel', 'open', 'reveal', 'retry', 'clear']),
  }),
  z.object({ type: z.literal('download.directory') }),
  z.object({ type: z.literal('permission'), id, decision: z.enum(['once', 'allow', 'block']) }),
  z.object({ type: z.literal('permission.remove'), origin: z.string(), permission: z.string() }),
  z.object({ type: z.literal('site.info') }),
  z.object({ type: z.literal('site.clear'), origin: z.string() }),
  z.object({
    type: z.literal('find'),
    text: z.string().max(500),
    forward: z.boolean().optional(),
    next: z.boolean().optional(),
  }),
  z.object({ type: z.literal('zoom'), value: z.number().min(0.25).max(3) }),
  z.object({ type: z.literal('reader.extract') }),
  z.object({
    type: z.literal('page'),
    action: z.enum([
      'print',
      'save',
      'pdf',
      'devtools',
      'source',
      'copyLink',
      'copyCleanLink',
      'readLater',
    ]),
  }),
  z.object({
    type: z.literal('window'),
    action: z.enum(['new', 'private', 'minimize', 'maximize', 'close', 'fullscreen', 'exit']),
  }),
  z.object({ type: z.literal('clipboard'), text: z.string().max(200000) }),
  z.object({ type: z.literal('menu.tab'), id }),
  z.object({ type: z.literal('menu.main') }),
]);
export type Command = z.infer<typeof commandSchema>;
export interface SiteInfo {
  origin: string;
  https: boolean;
  connection: 'internal' | 'pending' | 'https' | 'http' | 'error';
  cookies: { name: string; domain: string; secure: boolean; httpOnly: boolean }[];
  permissions: BrowserWindowState['permissions'];
}
export interface CommandResult {
  ok: boolean;
  error?: string;
  site?: SiteInfo;
  sources?: ImportSource[];
  preview?: ImportPreview;
  report?: ImportReport;
  logins?: LoginSummary[];
  password?: string;
  article?: ReadingArticle;
  extensions?: ExtensionSummary[];
  adblock?: { updatedAt: number; updating: boolean; rules: number };
  release?: {
    version: string;
    show: boolean;
    releases: { version: string; date: string; changes: string[] }[];
  };
}
export interface BrowserAPI {
  snapshot(): Promise<BrowserWindowState>;
  command(command: Command): Promise<CommandResult>;
  onState(handler: (state: BrowserWindowState) => void): () => void;
  onEvent(handler: (event: { type: string; message?: string }) => void): () => void;
}
