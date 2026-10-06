export interface ExtensionSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  error?: string;
  builtin?: 'night' | 'scroll';
}
