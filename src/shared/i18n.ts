import messages from './locales.json';
export type Language = 'en-US' | 'tr-TR' | 'de-DE' | 'fr-FR';
export function translate(
  message: string,
  language: Language,
  values: Record<string, string | number> = {},
) {
  const entry = (messages as Record<string, string[]>)[message];
  const index = ['en-US', 'tr-TR', 'de-DE', 'fr-FR'].indexOf(language);
  const result = entry?.[index] || message;
  return result.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
