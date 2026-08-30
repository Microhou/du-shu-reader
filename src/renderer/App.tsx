import { useCallback, useEffect, useState } from 'react';

import { parseTxt, titleFromFilename } from '../core/txt-parser.ts';
import { parseEpub } from '../core/epub-parser.ts';
import {
  annotationsToMarkdown,
  buildBackupBook,
  buildBackupFile,
  parseBackup,
  revivePayload,
} from '../core/backup.ts';
import { todayKey } from '../core/stats.ts';
import type {
  BookFormat,
  BookMeta,
  OpenedTextFile,
} from '../shared/types.ts';
import Bookshelf from './components/Bookshelf.tsx';
import Reader from './components/Reader.tsx';
import { library } from './library.ts';

type View = { name: 'shelf' } | { name: 'reader'; bookId: string };

export interface ImportResult {
  added: number;
  failed: number;
}

function detectFormat(name: string): BookFormat | null {
  if (/\.txt$/i.test(name)) return 'txt';
  if (/\.epub$/i.test(name)) return 'epub';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return null;
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'shelf' });
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setBooks(await library.listBooks());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importFiles = useCallback(
    async (files: OpenedTextFile[]): Promise<ImportResult> => {
      let added = 0;
      let failed = 0;
      for (const file of files) {
        try {
          const format = detectFormat(file.name);
          if (!format) {
            failed += 1;
            continue;
          }
          if (format === 'txt') {
            const { title, content } = parseTxt(file.data, file.name);
            if (!content) {
              failed += 1;
              continue;
            }
            await library.addBook(title, 'txt', { kind: 'txt', text: content });
          } else if (format === 'epub') {
            const book = await parseEpub(file.data);
            await library.addBook(titleFromFilename(file.name), 'epub', {
              kind: 'epub',
              book,
            });
          } else {
            await library.addBook(titleFromFilename(file.name), 'pdf', {
              kind: 'pdf',
              data: file.data,
            });
          }
          added += 1;
        } catch {
          failed += 1;
        }
      }
      if (added > 0) await refresh();
      return { added, failed };
    },
    [refresh],
  );

  const removeBook = useCallback(
    async (id: string) => {
      await library.removeBook(id);
      await refresh();
    },
    [refresh],
  );

  /** 全量备份：书籍内容 + 进度 + 标注 → 用户选择的位置（JSON） */
  const exportBackup = useCallback(async (): Promise<string> => {
    const all = await library.listBooks();
    if (all.length === 0) return '书架是空的，没有可备份的内容';
    const entries = [];
    for (const meta of all) {
      const payload = await library.getBookContent(meta.id);
      if (!payload) continue;
      entries.push(
        buildBackupBook(meta, payload, await library.listAnnotations(meta.id)),
      );
    }
    const json = JSON.stringify(buildBackupFile(entries));
    const savedPath = await window.api.saveFile({
      title: '备份读书数据',
      defaultName: `读书备份-${todayKey()}.json`,
      content: json,
      filterName: '读书备份',
      extensions: ['json'],
    });
    return savedPath
      ? `已备份 ${entries.length} 本 → ${savedPath}`
      : '已取消备份';
  }, []);

  /** 从备份 JSON 恢复（按书去重，已存在则跳过） */
  const importBackup = useCallback(async (): Promise<string> => {
    const file = await window.api.openBackupFile();
    if (!file) return '已取消恢复';
    try {
      const backup = parseBackup(file.content);
      let restored = 0;
      let skipped = 0;
      for (const entry of backup.books) {
        const result = await library.restoreBook(
          entry.meta,
          revivePayload(entry.payload),
          entry.annotations,
        );
        if (result === 'restored') restored += 1;
        else skipped += 1;
      }
      await refresh();
      return `恢复完成：新增 ${restored} 本${skipped > 0 ? `，跳过已存在 ${skipped} 本` : ''}`;
    } catch (e) {
      return e instanceof Error ? `恢复失败：${e.message}` : '恢复失败：文件无法解析';
    }
  }, [refresh]);

  /** 全部标注 → 单个 Markdown 文件 */
  const exportNotes = useCallback(async (): Promise<string> => {
    const all = await library.listBooks();
    const parts: string[] = [];
    for (const meta of all) {
      const md = annotationsToMarkdown(meta, await library.listAnnotations(meta.id));
      if (md) parts.push(md);
    }
    if (parts.length === 0) return '还没有任何标注可导出';
    const savedPath = await window.api.saveFile({
      title: '导出标注笔记',
      defaultName: `读书笔记-${todayKey()}.md`,
      content: parts.join('\n\n---\n\n'),
      filterName: 'Markdown',
      extensions: ['md'],
    });
    return savedPath ? `笔记已导出 → ${savedPath}` : '已取消导出';
  }, []);

  if (view.name === 'reader') {
    return (
      <Reader
        bookId={view.bookId}
        onBack={() => {
          void refresh();
          setView({ name: 'shelf' });
        }}
      />
    );
  }

  return (
    <Bookshelf
      books={books}
      loaded={loaded}
      onOpen={(id) => setView({ name: 'reader', bookId: id })}
      onImport={importFiles}
      onRemove={(id) => void removeBook(id)}
      onBackup={exportBackup}
      onRestore={importBackup}
      onExportNotes={exportNotes}
    />
  );
}
