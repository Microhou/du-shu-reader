// 划线/笔记选区气泡（参考微信读书：深色工具条 + 指向箭头，图标 + 文字项）
import type { HighlightStyle } from '../../shared/types.ts';

interface SelBubbleProps {
  x: number;
  y: number;
  noteMode: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onCopy: () => void;
  onHighlight: (style: HighlightStyle) => void;
  onStartNote: () => void;
  onSaveNote: () => void;
  onCancel: () => void;
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const CopyIcon = (
  <svg {...ICON_PROPS}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

const MarkerIcon = (
  <svg {...ICON_PROPS}>
    <path d="m14 3 7 7-9.5 9.5a2.4 2.4 0 0 1-1.7.7H5v-4.8a2.4 2.4 0 0 1 .7-1.7L14 3Z" />
    <path d="m12 5 7 7" />
  </svg>
);

const WavyIcon = (
  <svg {...ICON_PROPS}>
    <path d="M3 15c2.5-4 5.5-4 8 0s5.5 4 8 0" />
  </svg>
);

const LineIcon = (
  <svg {...ICON_PROPS}>
    <path d="M4 18h16" />
    <path d="M12 4v11" />
  </svg>
);

const NoteIcon = (
  <svg {...ICON_PROPS}>
    <path d="M21 12a9 9 0 1 1-4.2-7.6L21 3l-1 4.3c.6 1.4 1 3 1 4.7Z" />
  </svg>
);

export default function SelBubble({
  x,
  y,
  noteMode,
  noteDraft,
  onNoteDraftChange,
  onCopy,
  onHighlight,
  onStartNote,
  onSaveNote,
  onCancel,
}: SelBubbleProps) {
  if (noteMode) {
    return (
      <div className="sel-pop" style={{ left: x, top: y }}>
        <div className="sel-note">
          <textarea
            autoFocus
            rows={3}
            placeholder="写点什么…"
            value={noteDraft}
            onChange={(e) => onNoteDraftChange(e.target.value)}
          />
          <div className="sel-note-actions">
            <button className="sel-btn" onClick={onSaveNote}>
              保存
            </button>
            <button className="sel-btn" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="sel-pop" style={{ left: x, top: y }}>
      <button className="sel-item" onClick={onCopy}>
        {CopyIcon}
        <span>复制</span>
      </button>
      <button className="sel-item" onClick={() => onHighlight('mark')}>
        {MarkerIcon}
        <span>马克笔</span>
      </button>
      <button className="sel-item" onClick={() => onHighlight('wavy')}>
        {WavyIcon}
        <span>波浪线</span>
      </button>
      <button className="sel-item" onClick={() => onHighlight('underline')}>
        {LineIcon}
        <span>直线</span>
      </button>
      <button className="sel-item" onClick={onStartNote}>
        {NoteIcon}
        <span>写想法</span>
      </button>
    </div>
  );
}
