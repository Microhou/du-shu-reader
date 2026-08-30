import { useCallback, useMemo, useRef, useState } from 'react';

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

/** 由书名首字 + id 生成占位封面的配色（0-5 循环） */
function coverHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 6;
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
  const [query, setQuery] = useState('');
  const dragDepth = useRef(0);

  const runDataOp = useCallback((op: () => Promise<string>) => {
    setStatus('处理中…');
    void op()
      .then(setStatus)
      .catch((e: unknown) =>
        setStatus(e instanceof Error ? `操作失败：${e.message}` : '操作失败，请重试'),
      );
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

  const keyword = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      keyword
        ? books.filter((b) => b.title.toLowerCase().includes(keyword))
        : books,
    [books, keyword],
  );

  const recent = useMemo(
    () =>
      [...books]
        .filter((b) => b.lastReadAt > 0)
        .sort((a, b) => b.lastReadAt - a.lastReadAt)
        .slice(0, 4),
    [books],
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
      <header className="shelf-hero">
        <div className="brand">
          <span className="brand-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M6.5 3A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H6.5ZM7 5h12v9.2a3.4 3.4 0 0 0-1.6-.4H7V5Zm0 11h10.4a1.6 1.6 0 0 1 0 3.2H7A1.6 1.6 0 0 1 5.4 17.6 1.6 1.6 0 0 1 7 16Z" />
            </svg>
          </span>
          <span>读书阅读器</span>
        </div>

        <div className="search-box">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" />
          </svg>
          <input
            type="text"
            placeholder="搜索书名"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" title="清空" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </div>

        {!query && recent.length > 0 && (
          <div className="recent-row">
            <span className="recent-label">最近在读</span>
            {recent.map((b) => (
              <button
                key={b.id}
                className="recent-chip"
                title={b.title}
                onClick={() => onOpen(b.id)}
              >
                {b.title}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="shelf-main">
        <div className="section-row">
          <h2>继续阅读</h2>
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
        </div>

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
        ) : loaded && filtered.length === 0 ? (
          <div className="shelf-empty">没有找到与「{query.trim()}」匹配的书。</div>
        ) : (
          <ul className="book-grid">
            {filtered.map((book) => (
              <li
                key={book.id}
                className="book-card"
                onClick={() => onOpen(book.id)}
              >
                {book.coverThumb ? (
                  <img
                    className="book-cover"
                    src={book.coverThumb}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <div className={`book-cover book-cover-ph ph-${coverHue(book.id)}`}>
                    {[...book.title.trim()][0] || '书'}
                  </div>
                )}
                <div className="book-info">
                  <div className="book-title" title={book.title}>
                    {book.title}
                  </div>
                  <div className="book-meta">
                    <span className={`book-format book-format-${book.format}`}>
                      {FORMAT_LABEL[book.format]}
                    </span>
                    <span>{formatProgress(book.progress)}</span>
                  </div>
                  <div className="book-meta book-meta-sub">
                    <span>
                      {book.readSeconds > 0
                        ? `读过 ${formatDuration(book.readSeconds)}`
                        : '未开始'}
                    </span>
                    <span>{formatTime(book.lastReadAt)}</span>
                  </div>
                </div>
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
      </main>
    </div>
  );
}

function describe(result: ImportResult): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(`已导入 ${result.added} 本`);
  if (result.failed > 0) parts.push(`${result.failed} 本失败（文件损坏或格式不支持）`);
  return parts.length > 0 ? parts.join('，') : '没有可导入的内容';
}
