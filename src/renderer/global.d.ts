import type { BrowserAPI } from '../shared/ipc';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'browser-action-list': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        partition: string;
        tab: string;
        alignment: string;
      };
    }
  }
}
declare global {
  interface Window {
    dot: BrowserAPI;
  }
}
export {};
