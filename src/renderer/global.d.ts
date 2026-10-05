import type { BrowserAPI } from '../shared/ipc';
declare global {
  interface Window {
    dot: BrowserAPI;
  }
}
export {};
