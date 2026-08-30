import type { ReactNode } from 'react';

export interface TocEntry {
  label: string;
  jump: () => void;
}

interface TocDrawerProps {
  open: boolean;
  entries: TocEntry[];
  footer?: ReactNode;
  onJump: (entry: TocEntry) => void;
  onClose: () => void;
}

export default function TocDrawer({
  open,
  entries,
  footer,
  onJump,
  onClose,
}: TocDrawerProps) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-header">
          <span>目录</span>
          <button className="reader-tool" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="drawer-body">
          {entries.length === 0 ? (
            <p className="drawer-empty">本书没有识别到章节。</p>
          ) : (
            <ul className="toc-list">
              {entries.map((entry, i) => (
                <li key={i}>
                  <button
                    className="toc-item"
                    title={entry.label}
                    onClick={() => onJump(entry)}
                  >
                    {entry.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {footer && <footer className="drawer-footer">{footer}</footer>}
      </aside>
    </>
  );
}
