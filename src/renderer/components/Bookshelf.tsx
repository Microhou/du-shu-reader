import { useCallback, useRef, useState } from 'react';

import { formatProgress, formatTime } from '../../core/library.ts';
import { formatDuration } from '../../core/stats.ts';
import type { BookMeta, OpenedTextFile } from '../../shared/types.ts';
import type { ImportResult } from '../App.tsx';

const SUPPORTED = /\.(txt|epub|pdf)$/i;

const FORMAT_LABEL: Record<BookMeta['format'], string> = {
  txt: 'TXT',
  epub: 'EPUB',
  pdf: 'PDF',
};

interface Props {
  books: BookMeta[];
  loaded: boolean;
  onOpen: (id: string) => void;
  onImport: (files: OpenedTextFile[]) => Promise<ImportResult>;
  onRemove: (id: string) => void;
  onBackup: () => Promise<string>;
  onRestore: () => Promise<string>;
  onExportNotes: () => Promise<string>;
}

export default function Bookshelf({
  books,
  loaded,
  onOpen,
  onImport,
  onRemove,
  onBackup,
  onRestore,
  onExportNotes,
}: Props) {
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  /** 执行数据操作（备份/恢复/导出），统一展示结果消息 */
  const runDataOp = useCallback((op: () => Promise<string>) => {
    setStatus('处理中…');
    void op()
      .then(setStatus)
      .catch(() => setStatus('操作失败，请重试'));
  }, []);

  const importFromDialog = useCallback(async () => {
    setStatus('');
    let files: OpenedTextFile[];
    try {
      files = await window.api.openTextFiles();
    } catch {
      setStatus('导入失败：无法打开文件对话框');
      return;
    }
    if (files.length === 0) return;
    const result = await onImport(files);
    setStatus(describe(result));
  }, [onImport]);

  const importFromDrop = useCallback(
    async (fileList: FileList) => {
      setStatus('');
      const files: OpenedTextFile[] = [];
      for (const file of Array.from(fileList)) {
        if (!SUPPORTED.test(file.name)) continue;
        files.push({
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
        });
      }
      if (files.length === 0) {
        setStatus('仅支持 TXT / EPUB / PDF 文件');
        return;
      }
      const result = await onImport(files);
      setStatus(describe(result));
    },
    [onImport],
  );

  return (
    <div
      className={dragging ? 'shelf dragging' : 'shelf'}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void importFromDrop(e.dataTransfer.files);
      }}
    >
      <header className="shelf-header">
        <h1>读书</h1>
        <div className="shelf-actions">
          <button
            className="btn-ghost"
            title="把全部书籍、进度与标注导出为 JSON 备份文件"
            onClick={() => runDataOp(onBackup)}
          >
            备份
          </button>
          <button
            className="btn-ghost"
            title="从备份文件恢复书籍与标注"
            onClick={() => runDataOp(onRestore)}
          >
            恢复
          </button>
          <button
            className="btn-ghost"
            title="把全部划线与笔记导出为 Markdown"
            onClick={() => runDataOp(onExportNotes)}
          >
            笔记
          </button>
          <button className="btn" onClick={() => void importFromDialog()}>
            导入
          </button>
        </div>
      </header>

      {status && (
        <p className="shelf-status" role="status">
          {status}
        </p>
      )}

      {loaded && books.length === 0 ? (
        <div className="shelf-empty">
          书架还是空的。
          <br />
          点击右上角「导入」，或把 TXT / EPUB / PDF 文件拖到这里。
        </div>
      ) : (
        <ul className="shelf-list">
          {books.map((book) => (
            <li
              key={book.id}
              className="book-card"
              onClick={() => onOpen(book.id)}
            >
              <div className="book-title" title={book.title}>
                {book.title}
              </div>
              <div className="book-meta">
                <span className="book-facts">
                  <span
                    className={`book-format book-format-${book.format}`}
                  >
                    {FORMAT_LABEL[book.format]}
                  </span>
                  <span>{formatProgress(book.progress)}</span>
                </span>
                <span>{formatTime(book.lastReadAt)}</span>
              </div>
              {book.readSeconds > 0 && (
                <div className="book-meta book-meta-sub">
                  <span>读过 {formatDuration(book.readSeconds)}</span>
                </div>
              )}
              <button
                className="book-delete"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(`删除《${book.title}》？该操作不可恢复。`)
                  ) {
                    onRemove(book.id);
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describe(result: ImportResult): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(`已导入 ${result.added} 本`);
  if (result.failed > 0) parts.push(`${result.failed} 本失败（文件损坏或格式不支持）`);
  return parts.length > 0 ? parts.join('，') : '没有可导入的内容';
}
