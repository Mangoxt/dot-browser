import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import messages from '../src/shared/locales.json';
import releases from '../src/shared/releases.json';
import { translate, type Language } from '../src/shared/i18n';
import { settingsSchema } from '../src/shared/models';

describe('browser localization', () => {
  it('provides every shipped release note in all four interface languages', () => {
    const catalog = messages as Record<string, string[]>;
    for (const release of releases)
      for (const change of release.changes) {
        expect(catalog[change], change).toHaveLength(4);
      }
    for (const [key, translations] of Object.entries(catalog)) {
      expect(translations).toHaveLength(4);
      const parameters = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      for (const text of translations) {
        expect(text.trim().length, key).toBeGreaterThan(0);
        expect([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), key).toEqual(parameters);
      }
    }
  });
  it('keeps user titles and parameter values intact', () => {
    const title = 'Settings <b>my page</b> {name}';
    expect(translate(title, 'tr-TR')).toBe(title);
    expect(translate('Close {name}', 'tr-TR', { name: title })).toBe(`${title} kapat`);
  });
  it('has translations for static interface controls', () => {
    const identity = new Set(['d•', 'A+', 'A−', 'Ctrl K', 'ads.example.com', 'example.com']);
    const catalog = messages as Record<string, string[]>;
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((file) =>
        file.isDirectory() ? files(join(directory, file.name)) : [join(directory, file.name)],
      );
    for (const path of [
      ...files('src/renderer').filter((p) => p.endsWith('.tsx')),
      'src/main/browser.ts',
    ]) {
      const ast = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const walk = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ['tr', 'this.tr'].includes(node.expression.getText(ast))) {
          const key = node.arguments[0];
          if (key && ts.isStringLiteral(key) && !identity.has(key.text))
            expect(catalog[key.text], `${path}: ${key.text}`).toHaveLength(4);
        }
        ts.forEachChild(node, walk);
      };
      walk(ast);
    }
  });
  it('persists an actual interface language and dark preferences', () => {
    for (const language of ['en-US', 'tr-TR', 'de-DE', 'fr-FR'] as Language[]) {
      expect(settingsSchema.parse({ language }).language).toBe(language);
      expect(translate('Browser language', language)).toBeTruthy();
    }
    expect(settingsSchema.parse({}).forceDarkPages).toBe(true);
    expect(settingsSchema.parse({ forceDarkPages: false }).forceDarkPages).toBe(false);
  });
});
