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
} from '../../shared/types.ts';
import {
  applyMarks,
  findAncestorWithAttr,
  getTextOffset,
} from '../annotations.ts';
import { prepareChapterHtml } from '../sanitize.ts';
import SelBubble from './SelBubble.tsx';

interface TextReaderProps {
  kind: 'txt' | 'epub';
  /** TXT：全文段落（已过滤空行，全局索引与 data-para 一致） */
  paras: string[];
  /** EPUB：解析产物 */
  epub: EpubBook | null;
  annotations: Annotation[];
  fontSize: number;
  onAddAnnotation: (input: AnnotationInput) => void;
  /** 当前滚动比例，供标注记录兜底跳转 */
  getRatio: () => number;
  /** 点击正文内划线时打开标注抽屉 */
  onMarkActivate: () => void;
  /** 父级滚动时递增，用于关闭选区气泡 */
  scrollToken: number;
}

interface SelectionState {
  x: number;
  y: number;
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

export default function TextReader({
  kind,
  paras,
  epub,
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

  /* ---------- TXT：分块渲染 + 内联划线 ---------- */

  const chunks = useMemo(() => {
    const out: { index: number; text: string }[][] = [];
    for (let i = 0; i < paras.length; i += PARAS_PER_CHUNK) {
      out.push(
        paras.slice(i, i + PARAS_PER_CHUNK).map((text, j) => ({ index: i + j, text })),
      );
    }
    return out;
  }, [paras]);

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
      nodes.push(
        <mark
          key={key++}
          className={m.type === 'note' ? 'mark mark-note' : 'mark mark-hl'}
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
          x: Math.min(window.innerWidth - 220, Math.max(24, rect.left + rect.width / 2 - 70)),
          y: Math.max(72, rect.top - 14),
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
      const chapterIndex = Number(chapterEl.getAttribute('data-chapter'));
      if (!Number.isInteger(chapterIndex)) {
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
        x: Math.min(window.innerWidth - 220, Math.max(24, rect.left + rect.width / 2 - 70)),
        y: Math.max(72, rect.top - 14),
        text,
        noteMode: false,
        chapterIndex,
        start,
        end,
      });
    }, 0);
  }, [kind]);

  const saveSelection = (type: 'highlight' | 'note', note?: string) => {
    if (!sel) return;
    onAddAnnotation({
      type,
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

  /* ---------- EPUB：blob URL + 消毒渲染 + 内联标记 ---------- */

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

  const chaptersHtml = useMemo(() => {
    if (!epub) return [];
    return epub.chapters.map((c) => prepareChapterHtml(c.html, c.path, imageUrls));
  }, [epub, imageUrls]);

  // 把 EPUB 划线/笔记同步为章节内的 <mark>
  useEffect(() => {
    if (kind !== 'epub' || !epub) return;
    const root = contentRef.current;
    if (!root) return;
    const byChapter = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if (
        (a.type !== 'highlight' && a.type !== 'note') ||
        a.chapterIndex === undefined ||
        a.start == null ||
        a.end == null
      ) {
        continue;
      }
      const list = byChapter.get(a.chapterIndex) ?? [];
      list.push(a);
      byChapter.set(a.chapterIndex, list);
    }
    for (const section of root.querySelectorAll<HTMLElement>('section[data-chapter]')) {
      const idx = Number(section.getAttribute('data-chapter'));
      applyMarks(section, (byChapter.get(idx) ?? []).map((a) => ({
        id: a.id,
        start: a.start!,
        end: a.end!,
        note: a.note,
      })));
    }
  }, [kind, epub, annotations, chaptersHtml]);

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

  const isEpub = kind === 'epub' && !!epub;

  return (
    <>
      <div
        ref={contentRef}
        className={isEpub ? 'reader-content epub-content' : 'reader-content'}
        style={{ fontSize: `${fontSize}px` }}
        onMouseUp={captureSelection}
        onClick={isEpub ? handleContentClick : undefined}
      >
        {isEpub && epub
          ? chaptersHtml.map((html, i) => (
              <section
                key={i}
                data-chapter={i}
                className="epub-chapter"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ))
          : chunks.map((chunk, ci) => (
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
      </div>

      {sel && (
        <SelBubble
          x={sel.x}
          y={sel.y}
          noteMode={sel.noteMode}
          noteDraft={noteDraft}
          onNoteDraftChange={setNoteDraft}
          onHighlight={() => saveSelection('highlight')}
          onStartNote={() => {
            setNoteDraft('');
            setSel({ ...sel, noteMode: true });
          }}
          onSaveNote={() => saveSelection('note', noteDraft.trim() || undefined)}
          onCancel={() => setSel(null)}
        />
      )}
    </>
  );
}
