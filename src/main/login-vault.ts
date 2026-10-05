import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import type { SavedLogin } from '../shared/import';

export async function encryptImportedLogins(
  existing: SavedLogin[],
  incoming: { origin: string; username: string; password: string }[],
): Promise<SavedLogin[]> {
  if (!(await safeStorage.isAsyncEncryptionAvailable()))
    throw new Error('Operating-system password encryption is unavailable. Nothing was imported.');
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    throw new Error('A secure system password store is required.');
  const unique = new Map(
    incoming.map((login) => [JSON.stringify([login.origin, login.username]), login]),
  );
  const output: SavedLogin[] = [];
  for (const login of unique.values()) {
    const previous = existing.find(
      (item) => item.origin === login.origin && item.username === login.username,
    );
    const encrypted = await safeStorage.encryptStringAsync(login.password);
    output.push({
      id: previous?.id ?? randomUUID(),
      origin: login.origin,
      username: login.username,
      encrypted: encrypted.toString('base64'),
      createdAt: previous?.createdAt ?? Date.now(),
    });
  }
  return output;
}

export async function decryptLogin(login: SavedLogin): Promise<string> {
  try {
    return (await safeStorage.decryptStringAsync(Buffer.from(login.encrypted, 'base64'))).result;
  } catch {
    throw new Error('This password cannot be unlocked by the current system account.');
  }
}

export function loginFillScript(origin: string, username: string, password: string): string {
  return `(() => {
    if (location.origin !== ${JSON.stringify(origin)}) return 'origin';
    const visible = element => !element.disabled && !element.readOnly && element.getClientRects().length > 0;
    const passwords = [...document.querySelectorAll('input[type="password"]')].filter(element => visible(element) && element.autocomplete !== 'new-password');
    if (passwords.length !== 1) return 'form';
    const field = passwords[0], form = field.form;
    if (form && form.querySelectorAll('input[type="password"]').length !== 1) return 'form';
    if (form && new URL(form.getAttribute('action') || location.href, location.href).origin !== location.origin) return 'action';
    const inputs = [...(form || document).querySelectorAll('input')].filter(element => visible(element) && ['text','email','tel'].includes(element.type) && (element.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING));
    const user = inputs.find(element => element.autocomplete === 'username') || inputs.filter(element => element.type === 'email').at(-1) || inputs.at(-1);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const fill = (element, value) => { setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); };
    if (user) fill(user, ${JSON.stringify(username)});
    fill(field, ${JSON.stringify(password)});
    return 'filled';
  })()`;
}
