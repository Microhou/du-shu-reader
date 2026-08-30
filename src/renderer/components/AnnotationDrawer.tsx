import type { Annotation } from '../../shared/types.ts';
import { formatTime } from '../../core/library.ts';

const TYPE_LABEL: Record<Annotation['type'], string> = {
  bookmark: '书签',
  highlight: '划线',
  note: '笔记',
};

interface AnnotationDrawerProps {
  open: boolean;
  annotations: Annotation[];
  onJump: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onAddBookmark: () => void;
  onClose: () => void;
}

export default function AnnotationDrawer({
  open,
  annotations,
  onJump,
  onDelete,
  onAddBookmark,
  onClose,
}: AnnotationDrawerProps) {
  if (!open) return null;
  const ordered = [...annotations].sort((a, b) => a.ratio - b.ratio);
  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-header">
          <span>标注</span>
          <button className="reader-tool" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="drawer-body">
          <button className="btn drawer-add" onClick={onAddBookmark}>
            在当前位置加书签
          </button>
          {ordered.length === 0 ? (
            <p className="drawer-empty">
              还没有标注。选中正文可划线/写笔记，看书时随手加个书签。
            </p>
          ) : (
            <ul className="ann-list">
              {ordered.map((a) => (
                <li key={a.id} className="ann-item">
                  <button className="ann-main" onClick={() => onJump(a)}>
                    <span className={`ann-type ann-type-${a.type}`}>
                      {TYPE_LABEL[a.type]}
                    </span>
                    <span className="ann-text">
                      {a.type === 'bookmark'
                        ? `进度 ${Math.round(a.ratio * 100)}%`
                        : a.text || '（无摘录）'}
                    </span>
                    {a.note && <span className="ann-note">{a.note}</span>}
                    <span className="ann-time">{formatTime(a.createdAt)}</span>
                  </button>
                  <button
                    className="ann-delete"
                    title="删除"
                    onClick={() => onDelete(a.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
