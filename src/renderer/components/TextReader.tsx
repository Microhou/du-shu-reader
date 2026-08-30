import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  Annotation,
  AnnotationInput,
  EpubBook,
  HighlightStyle,
} from '../../shared/types.ts';
import {
  applyMarks,
  findAncestorWithAttr,
  getTextOffset,
} from '../annotations.ts';
import { prepareChapterHtml } from '../sanitize.ts';
import { bubblePosition, SelBubble } from './SelBubble.tsx';

interface TextReaderProps {
  kind: 'txt' | 'epub';
  /** TXT：当前章节的段落（data-para = 全局段落下标 = paraStart + 数组下标） */
  paras: string[];
  paraStart: number;
  /** EPUB：当前章节下标与整本解析产物 */
  chapterIndex: number;
  epub: EpubBook | null;
  /** TXT 章节标题（识别到章节标记时展示） */
  chapterTitle?: string;
  /** 当前章节相关的标注（Reader 已按章节过滤） */
  annotations: Annotation[];
  fontSize: number;
  onAddAnnotation: (input: AnnotationInput) => void;
  getRatio: () => number;
  onMarkActivate: () => void;
  scrollToken: number;
}

interface SelectionState {
  x: number;
  y: number;
  placement: 'above' | 'below';
  text: string;
  noteMode: boolean;
  /** TXT 锚点 */
  paraIndex?: number;
  start?: number;
  end?: number;
  /** EPUB 锚点 */
  chapterIndex?: number;
}

const PARAS_PER_CHUNK = 200;
const LINE_ESTIMATE_PX = 36;
const MAX_SELECTION_CHARS = 2000;

function findParaElement(node: Node | null, root: HTMLElement | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement && cur.hasAttribute('data-para')) return cur;
    cur = cur.parentNode;
  }
  return null;
}

function styleClass(style?: HighlightStyle): string {
  return style === 'wavy'
    ? 'mark mark-wavy'
    : style === 'underline'
      ? 'mark mark-line'
      : 'mark mark-hl';
}

export default function TextReader({
  kind,
  paras,
  paraStart,
  chapterIndex,
  epub,
  chapterTitle,
  annotations,
  fontSize,
  onAddAnnotation,
  getRatio,
  onMarkActivate,
  scrollToken,
}: TextReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<SelectionState | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  // 滚动即关闭选区气泡
  useEffect(() => {
    setSel(null);
  }, [scrollToken]);

  const isEpub = kind === 'epub' && !!epub;

  /* ---------- TXT：段内分块渲染 + 内联划线 ---------- */

  const chunks = useMemo(() => {
    const out: { index: number; text: string }[][] = [];
    for (let i = 0; i < paras.length; i += PARAS_PER_CHUNK) {
      out.push(
        paras
          .slice(i, i + PARAS_PER_CHUNK)
          .map((text, j) => ({ index: paraStart + i + j, text })),
      );
    }
    return out;
  }, [paras, paraStart]);

  const marksByPara = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if (
        (a.type !== 'highlight' && a.type !== 'note') ||
        a.paraIndex === undefined
      ) {
        continue;
      }
      const list = map.get(a.paraIndex) ?? [];
      list.push(a);
      map.set(a.paraIndex, list);
    }
    return map;
  }, [annotations]);

  const renderPara = (text: string, index: number): ReactNode => {
    const marks = (marksByPara.get(index) ?? [])
      .filter((m) => m.start != null && m.end != null)
      .sort((a, b) => a.start! - b.start!);
    if (marks.length === 0) return text;
    const nodes: ReactNode[] = [];
    let pos = 0;
    let key = 0;
    for (const m of marks) {
      const s = Math.max(pos, Math.max(0, m.start!));
      const e = Math.min(text.length, m.end!);
      if (s >= e) continue;
      if (s > pos) nodes.push(<span key={key++}>{text.slice(pos, s)}</span>);
      const style = m.type === 'note' ? 'mark mark-note' : styleClass(m.style);
      nodes.push(
        <mark
          key={key++}
          className={style}
          title={m.note ?? undefined}
          onClick={onMarkActivate}
        >
          {text.slice(s, e)}
        </mark>,
      );
      pos = e;
    }
    if (pos < text.length) nodes.push(<span key={key++}>{text.slice(pos)}</span>);
    return nodes;
  };

  /* ---------- EPUB：blob URL + 当前章节消毒渲染 + 内联标记 ---------- */

  const imageUrls = useMemo(() => {
    const map = new Map<string, string>();
    if (epub) {
      for (const [path, bytes] of Object.entries(epub.images)) {
        map.set(path, URL.createObjectURL(new Blob([new Uint8Array(bytes)])));
      }
    }
    return map;
  }, [epub]);

  useEffect(
    () => () => {
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    },
    [imageUrls],
  );

  const chapterHtml = useMemo(() => {
    if (!epub) return '';
    const chapter = epub.chapters[chapterIndex];
    if (!chapter) return '';
    return prepareChapterHtml(chapter.html, chapter.path, imageUrls);
  }, [epub, chapterIndex, imageUrls]);

  // 把当前章节的划线/笔记合成为内联 <mark>
  useEffect(() => {
    if (!isEpub) return;
    const root = contentRef.current;
    if (!root) return;
    applyMarks(
      root,
      annotations
        .filter((a) => a.start != null && a.end != null)
        .map((a) => ({
          id: a.id,
          start: a.start!,
          end: a.end!,
          note: a.note,
          style: a.style,
        })),
    );
  }, [isEpub, annotations, chapterHtml]);

  // 点击 EPUB 内联划线 → 打开标注抽屉（事件委托，标记是命令式插入的）
  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLElement && target.closest('mark[data-ann-id]')) {
        onMarkActivate();
      }
    },
    [onMarkActivate],
  );

  /* ---------- 选区捕获（TXT 与 EPUB 各自锚定） ---------- */

  const captureSelection = useCallback(() => {
    window.setTimeout(() => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSel(null);
        return;
      }
      const text = selection.toString();
      if (!text.trim() || text.length > MAX_SELECTION_CHARS) {
        setSel(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (kind === 'txt') {
        const anchorPara = findParaElement(range.startContainer, contentRef.current);
        const focusPara = findParaElement(range.endContainer, contentRef.current);
        if (!anchorPara || anchorPara !== focusPara) {
          setSel(null);
          return;
        }
        const paraIndex = Number(anchorPara.getAttribute('data-para'));
        if (!Number.isInteger(paraIndex)) {
          setSel(null);
          return;
        }
        const paraText = anchorPara.textContent ?? '';
        const start = paraText.indexOf(text);
        if (start < 0) {
          setSel(null);
          return;
        }
        setSel({
          ...bubblePosition(rect),
          text,
          noteMode: false,
          paraIndex,
          start,
          end: start + text.length,
        });
        return;
      }

      // EPUB：按章节纯文本偏移锚定
      const chapterEl = findAncestorWithAttr(
        range.startContainer,
        contentRef.current,
        'data-chapter',
      );
      const endChapterEl = findAncestorWithAttr(
        range.endContainer,
        contentRef.current,
        'data-chapter',
      );
      if (!chapterEl || chapterEl !== endChapterEl) {
        setSel(null);
        return;
      }
      const chapterIdx = Number(chapterEl.getAttribute('data-chapter'));
      if (!Number.isInteger(chapterIdx)) {
        setSel(null);
        return;
      }
      const start = getTextOffset(chapterEl, range.startContainer, range.startOffset);
      const end = getTextOffset(chapterEl, range.endContainer, range.endOffset);
      if (start === null || end === null || end <= start) {
        setSel(null);
        return;
      }
      setSel({
        ...bubblePosition(rect),
        text,
        noteMode: false,
        chapterIndex: chapterIdx,
        start,
        end,
      });
    }, 0);
  }, [kind]);

  const saveSelection = (
    type: 'highlight' | 'note',
    style?: HighlightStyle,
    note?: string,
  ) => {
    if (!sel) return;
    onAddAnnotation({
      type,
      style: type === 'highlight' ? (style ?? 'mark') : undefined,
      ratio: getRatio(),
      paraIndex: sel.paraIndex,
      chapterIndex: sel.chapterIndex,
      start: sel.start,
      end: sel.end,
      text: sel.text,
      note,
    });
    document.getSelection()?.removeAllRanges();
    setSel(null);
    setNoteDraft('');
  };

  const copySelection = useCallback(() => {
    if (!sel) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(sel.text);
      } catch {
        // 无剪贴板权限时的兜底
        const ta = document.createElement('textarea');
        ta.value = sel.text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } catch {
          // 都失败时静默关闭
        }
        ta.remove();
      }
      document.getSelection()?.removeAllRanges();
      setSel(null);
    })();
  }, [sel]);

  return (
    <>
      <div
        ref={contentRef}
        className={isEpub ? 'reader-content epub-content' : 'reader-content'}
        style={{ fontSize: `${fontSize}px` }}
        onMouseUp={captureSelection}
        onClick={isEpub ? handleContentClick : undefined}
      >
        {isEpub ? (
          <section
            data-chapter={chapterIndex}
            className="epub-chapter"
            dangerouslySetInnerHTML={{ __html: chapterHtml }}
          />
        ) : (
          <>
            {chapterTitle && <h1 className="chapter-title">{chapterTitle}</h1>}
            {chunks.map((chunk, ci) => (
              <div
                key={ci}
                className="reader-chunk"
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: `auto ${chunk.length * LINE_ESTIMATE_PX}px`,
                }}
              >
                {chunk.map(({ index, text }) => (
                  <p key={index} data-para={index}>
                    {renderPara(text, index)}
                  </p>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {sel && (
        <SelBubble
          x={sel.x}
          y={sel.y}
          placement={sel.placement}
          noteMode={sel.noteMode}
          noteDraft={noteDraft}
          onNoteDraftChange={setNoteDraft}
          onCopy={copySelection}
          onHighlight={(style) => saveSelection('highlight', style)}
          onStartNote={() => {
            setNoteDraft('');
            setSel({ ...sel, noteMode: true });
          }}
          onSaveNote={() => saveSelection('note', undefined, noteDraft.trim() || undefined)}
          onCancel={() => setSel(null)}
        />
      )}
    </>
  );
}
