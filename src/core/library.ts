// 书库逻辑：存储介质可注入，便于单元测试
import type { BookMeta } from '../shared/types.ts';
import type { KeyValueStore } from './storage.ts';

export interface Library {
  listBooks(): Promise<BookMeta[]>;
  addBook(title: string, content: string): Promise<BookMeta>;
  getBookContent(id: string): Promise<string | null>;
  saveProgress(id: string, ratio: number): Promise<BookMeta | null>;
  removeBook(id: string): Promise<boolean>;
}

export function createLibrary(storage: KeyValueStore): Library {
  const LIST_KEY = 'library';

  async function loadList(): Promise<BookMeta[]> {
    return (await storage.get<BookMeta[]>(LIST_KEY)) ?? [];
  }

  async function saveList(list: BookMeta[]): Promise<void> {
    await storage.set(LIST_KEY, list);
  }

  return {
    async listBooks() {
      return loadList();
    },

    async addBook(title, content) {
      const list = await loadList();
      const book: BookMeta = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        addedAt: Date.now(),
        lastReadAt: 0,
        progress: 0,
      };
      list.unshift(book);
      await storage.set(`book:${book.id}`, content);
      await saveList(list);
      return book;
    },

    async getBookContent(id) {
      return (await storage.get<string>(`book:${id}`)) ?? null;
    },

    async saveProgress(id, ratio) {
      const list = await loadList();
      const book = list.find((b) => b.id === id);
      if (!book) return null;
      book.progress = Math.min(1, Math.max(0, ratio));
      book.lastReadAt = Date.now();
      await saveList(list);
      return book;
    },

    async removeBook(id) {
      const list = await loadList();
      const next = list.filter((b) => b.id !== id);
      await storage.del(`book:${id}`);
      await saveList(next);
      return next.length !== list.length;
    },
  };
}

/** 进度展示文案：0 视为未读 */
export function formatProgress(ratio: number): string {
  if (!ratio || ratio <= 0) return '未读';
  return `${Math.floor(ratio * 100)}%`;
}

/** 最近阅读时间展示文案 */
export function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
