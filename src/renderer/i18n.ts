import { translate } from '../shared/i18n';
import { useBrowser } from './stores/browser';
export function tr(message: string, values?: Record<string, string | number>) {
  return translate(message, useBrowser.getState().state?.settings.language ?? 'en-US', values);
}
