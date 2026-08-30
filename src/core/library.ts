// 书库逻辑：存储介质可注入，便于单元测试。
// 数据形态：元数据列表（library）+ 每本书内容（book:{id}）+ 标注列表（ann:{id}）
import type {
  Annotation,
  AnnotationInput,
  BookFormat,
  BookMeta,
  BookPayload,
} from '../shared/types.ts';
import type { KeyValueStore } from './storage.ts';

export interface Library {
  listBooks(): Promise<BookMeta[]>;
  addBook(
    title: string,
    format: BookFormat,
    payload: BookPayload,
    extras?: { coverThumb?: string },
  ): Promise<BookMeta>;
  getBookContent(id: string): Promise<BookPayload | null>;
  saveProgress(id: string, ratio: number): Promise<BookMeta | null>;
  /** 累计阅读秒数（同时刷新 lastReadAt） */
  addReadSeconds(id: string, seconds: number): Promise<BookMeta | null>;
  removeBook(id: string): Promise<boolean>;
  /** 从备份恢复一本书：按 id 幂等（已存在则跳过），保留进度与标注 */
  restoreBook(
    meta: BookMeta,
    payload: BookPayload,
    annotations: Annotation[],
  ): Promise<'restored' | 'skipped'>;
  listAnnotations(bookId: string): Promise<Annotation[]>;
  addAnnotation(bookId: string, input: AnnotationInput): Promise<Annotation>;
  removeAnnotation(bookId: string, annotationId: string): Promise<boolean>;
}

/** 兼容 v0.1 的旧元数据（缺 format / readSeconds 字段） */
type StoredMeta = Omit<BookMeta, 'format' | 'readSeconds'> &
  Partial<Pick<BookMeta, 'format' | 'readSeconds'>>;

function normalizeMeta(raw: StoredMeta): BookMeta {
  return {
    ...raw,
    format: raw.format ?? 'txt',
    readSeconds: raw.readSeconds ?? 0,
  };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createLibrary(storage: KeyValueStore): Library {
  const LIST_KEY = 'library';

  async function loadList(): Promise<BookMeta[]> {
    const raw = (await storage.get<StoredMeta[]>(LIST_KEY)) ?? [];
    return raw.map(normalizeMeta);
  }

  async function saveList(list: BookMeta[]): Promise<void> {
    await storage.set(LIST_KEY, list);
  }

  return {
    async listBooks() {
      return loadList();
    },

    async addBook(title, format, payload, extras) {
      const list = await loadList();
      const book: BookMeta = {
        id: newId(),
        title,
        addedAt: Date.now(),
        lastReadAt: 0,
        progress: 0,
        format,
        readSeconds: 0,
        ...(extras?.coverThumb ? { coverThumb: extras.coverThumb } : {}),
      };
      list.unshift(book);
      await storage.set(`book:${book.id}`, payload);
      await saveList(list);
      return book;
    },

    async getBookContent(id) {
      const raw = await storage.get<BookPayload | string>(`book:${id}`);
      if (raw == null) return null;
      // v0.1 兼容：旧版正文是裸字符串，归一化为判别联合
      return typeof raw === 'string' ? { kind: 'txt', text: raw } : raw;
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

    async addReadSeconds(id, seconds) {
      if (!(seconds > 0)) return null;
      const list = await loadList();
      const book = list.find((b) => b.id === id);
      if (!book) return null;
      book.readSeconds += Math.floor(seconds);
      book.lastReadAt = Date.now();
      await saveList(list);
      return book;
    },

    async removeBook(id) {
      const list = await loadList();
      const next = list.filter((b) => b.id !== id);
      await storage.del(`book:${id}`);
      await storage.del(`ann:${id}`);
      await saveList(next);
      return next.length !== list.length;
    },

    async restoreBook(meta, payload, annotations) {
      const list = await loadList();
      if (list.some((b) => b.id === meta.id)) return 'skipped';
      list.unshift(meta);
      await storage.set(`book:${meta.id}`, payload);
      await storage.set(`ann:${meta.id}`, annotations);
      await saveList(list);
      return 'restored';
    },

    async listAnnotations(bookId) {
      return (await storage.get<Annotation[]>(`ann:${bookId}`)) ?? [];
    },

    async addAnnotation(bookId, input) {
      const list = await storage.get<Annotation[]>(`ann:${bookId}`) ?? [];
      const annotation: Annotation = {
        ...input,
        id: newId(),
        createdAt: Date.now(),
      };
      list.push(annotation);
      await storage.set(`ann:${bookId}`, list);
      return annotation;
    },

    async removeAnnotation(bookId, annotationId) {
      const list = (await storage.get<Annotation[]>(`ann:${bookId}`)) ?? [];
      const next = list.filter((a) => a.id !== annotationId);
      if (next.length === list.length) return false;
      await storage.set(`ann:${bookId}`, next);
      return true;
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
