import type { OpenedTextFile } from '../shared/types.ts';

declare global {
  interface Window {
    /** preload 暴露的白名单 API（见 src/preload.ts） */
    api: {
      openTextFiles(): Promise<OpenedTextFile[]>;
      saveFile(opts: {
        title?: string;
        defaultName: string;
        content: string;
        filterName?: string;
        extensions?: string[];
      }): Promise<string | null>;
      openBackupFile(): Promise<{ name: string; content: string } | null>;
    };
  }
}

export {};
