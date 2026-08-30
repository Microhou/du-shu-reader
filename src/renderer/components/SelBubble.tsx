// 划线/笔记选区气泡：TXT 与 PDF 共用

interface SelBubbleProps {
  x: number;
  y: number;
  noteMode: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onHighlight: () => void;
  onStartNote: () => void;
  onSaveNote: () => void;
  onCancel: () => void;
}

export default function SelBubble({
  x,
  y,
  noteMode,
  noteDraft,
  onNoteDraftChange,
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
            <button className="reader-tool" onClick={onSaveNote}>
              保存
            </button>
            <button className="reader-tool" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="sel-pop" style={{ left: x, top: y }}>
      <button className="sel-btn" onClick={onHighlight}>
        划线
      </button>
      <button className="sel-btn" onClick={onStartNote}>
        笔记
      </button>
    </div>
  );
}
