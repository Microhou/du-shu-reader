import { useCallback, useRef, useState } from 'react';

import { formatProgress, formatTime } from '../../core/library.ts';
import type { BookMeta, OpenedTextFile } from '../../shared/types.ts';

interface Props {
  books: BookMeta[];
  loaded: boolean;
  onOpen: (id: string) => void;
  onImport: (files: OpenedTextFile[]) => Promise<number>;
  onRemove: (id: string) => void;
}

export default function Bookshelf({
  books,
  loaded,
  onOpen,
  onImport,
  onRemove,
}: Props) {
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

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
    const added = await onImport(files);
    setStatus(added > 0 ? `已导入 ${added} 本` : '没有可导入的内容');
  }, [onImport]);

  const importFromDrop = useCallback(
    async (fileList: FileList) => {
      setStatus('');
      const files: OpenedTextFile[] = [];
      for (const file of Array.from(fileList)) {
        if (!/\.txt$/i.test(file.name)) continue;
        files.push({
          name: file.name,
          data: new Uint8Array(await file.arrayBuffer()),
        });
      }
      if (files.length === 0) {
        setStatus('仅支持 TXT 文件');
        return;
      }
      const added = await onImport(files);
      setStatus(added > 0 ? `已导入 ${added} 本` : '文件内容为空');
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
        <button className="btn" onClick={() => void importFromDialog()}>
          导入 TXT
        </button>
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
          点击右上角「导入 TXT」，或把 TXT 文件拖到这里。
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
                <span>{formatProgress(book.progress)}</span>
                <span>{formatTime(book.lastReadAt)}</span>
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
    </div>
  );
}
