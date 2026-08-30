// 备份纯逻辑：构建/解析备份文档、base64 还原、笔记 Markdown 导出。
// 与存储介质解耦（输入输出都是纯数据），可在 Node 单测。
// btoa/atob 在 Node 16+ 与浏览器均为全局，无需注入。
import type {
  Annotation,
  BookMeta,
  BookPayload,
  EpubBook,
} from '../shared/types.ts';
import { formatTime } from './library.ts';

export const BACKUP_FORMAT = 'dushu-backup';
export const BACKUP_VERSION = 1;

/** 备份文档（JSON 序列化后的文件内容） */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  books: BackupBook[];
}

export interface BackupBook {
  meta: BookMeta;
  payload: BackupPayload;
  annotations: Annotation[];
}

/**
 * IndexedDB 里的 payload 含 Uint8Array（PDF 字节 / EPUB 图片），直接 JSON.stringify
 * 会丢成 `{}`；备份前编码为 base64，恢复时还原。
 */
export type BackupPayload =
  | { kind: 'txt'; text: string }
  | { kind: 'epub'; book: Omit<EpubBook, 'images'> & { images: Record<string, string> } }
  | { kind: 'pdf'; data: { __bytes: string } };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function buildBackupFile(books: BackupBook[]): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    books,
  };
}

export function buildBackupBook(
  meta: BookMeta,
  payload: BookPayload,
  annotations: Annotation[],
): BackupBook {
  let backupPayload: BackupPayload;
  if (payload.kind === 'txt') {
    backupPayload = { kind: 'txt', text: payload.text };
  } else if (payload.kind === 'epub') {
    const images: Record<string, string> = {};
    for (const [path, bytes] of Object.entries(payload.book.images)) {
      images[path] = bytesToBase64(bytes);
    }
    backupPayload = { kind: 'epub', book: { ...payload.book, images } };
  } else {
    backupPayload = { kind: 'pdf', data: { __bytes: bytesToBase64(payload.data) } };
  }
  return { meta, payload: backupPayload, annotations };
}

/** 备份 payload → 运行时 payload（还原二进制字段） */
export function revivePayload(payload: BackupPayload): BookPayload {
  if (payload.kind === 'txt') return payload;
  if (payload.kind === 'pdf') {
    return { kind: 'pdf', data: base64ToBytes(payload.data.__bytes) };
  }
  const images: Record<string, Uint8Array> = {};
  for (const [path, b64] of Object.entries(payload.book.images)) {
    images[path] = base64ToBytes(b64);
  }
  return { kind: 'epub', book: { ...payload.book, images } };
}

export function parseBackup(raw: string): BackupFile {
  const parsed = JSON.parse(raw) as Partial<BackupFile>;
  if (
    parsed.format !== BACKUP_FORMAT ||
    typeof parsed.exportedAt !== 'number' ||
    !Array.isArray(parsed.books)
  ) {
    throw new Error('不是有效的读书阅读器备份文件');
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${parsed.version}（当前支持 v${BACKUP_VERSION}）`);
  }
  return parsed as BackupFile;
}

/* ---------- 笔记 Markdown 导出 ---------- */

const TYPE_LABEL: Record<Annotation['type'], string> = {
  bookmark: '书签',
  highlight: '划线',
  note: '笔记',
};

/** 单本书的标注 → Markdown；无标注返回 null */
export function annotationsToMarkdown(
  meta: BookMeta,
  annotations: Annotation[],
): string | null {
  if (annotations.length === 0) return null;
  const ordered = [...annotations].sort((a, b) => a.ratio - b.ratio);
  const lines: string[] = [`# 《${meta.title}》 标注导出`, ''];
  for (const a of ordered) {
    const loc =
      a.page !== undefined ? `（第 ${a.page} 页）` : `（进度 ${Math.round(a.ratio * 100)}%）`;
    lines.push(`## ${TYPE_LABEL[a.type]} ${loc}`);
    lines.push('');
    if (a.text) {
      lines.push(`> ${a.text.replace(/\n/g, '\n> ')}`);
      lines.push('');
    }
    if (a.note) {
      lines.push(`**想法**：${a.note}`);
      lines.push('');
    }
    lines.push(`_${formatTime(a.createdAt)}_`);
    lines.push('');
  }
  return lines.join('\n');
}
