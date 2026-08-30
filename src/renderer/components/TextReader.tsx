import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type {
  Annotation,
  AnnotationInput,
  EpubBook,
} from '../../shared/types.ts';
import { prepareChapterHtml } from '../sanitize.ts';

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
  paraIndex: number;
  start: number;
  end: number;
  text: string;
  noteMode: boolean;
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

  /* ---------- 选区气泡（仅 TXT） ---------- */

  const handleMouseUp = useCallback(() => {
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
      const rect = range.getBoundingClientRect();
      setSel({
        x: Math.min(window.innerWidth - 220, Math.max(24, rect.left + rect.width / 2 - 70)),
        y: Math.max(72, rect.top - 14),
        paraIndex,
        start,
        end: start + text.length,
        text,
        noteMode: false,
      });
    }, 0);
  }, []);

  const clearSelection = () => {
    document.getSelection()?.removeAllRanges();
  };

  const saveSelection = (type: 'highlight' | 'note', note?: string) => {
    if (!sel) return;
    onAddAnnotation({
      type,
      ratio: getRatio(),
      paraIndex: sel.paraIndex,
      start: sel.start,
      end: sel.end,
      text: sel.text,
      note,
    });
    clearSelection();
    setSel(null);
    setNoteDraft('');
  };

  /* ---------- EPUB：blob URL + 消毒后渲染 ---------- */

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

  const isEpub = kind === 'epub' && !!epub;

  return (
    <>
      <div
        ref={contentRef}
        className={isEpub ? 'reader-content epub-content' : 'reader-content'}
        style={{ fontSize: `${fontSize}px` }}
        onMouseUp={isEpub ? undefined : handleMouseUp}
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

      {sel && !isEpub && (
        <div className="sel-pop" style={{ left: sel.x, top: sel.y }}>
          {sel.noteMode ? (
            <div className="sel-note">
              <textarea
                autoFocus
                rows={3}
                placeholder="写点什么…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className="sel-note-actions">
                <button className="reader-tool" onClick={() => saveSelection('note', noteDraft.trim() || undefined)}>
                  保存
                </button>
                <button className="reader-tool" onClick={() => setSel(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <button className="sel-btn" onClick={() => saveSelection('highlight')}>
                划线
              </button>
              <button
                className="sel-btn"
                onClick={() => {
                  setNoteDraft('');
                  setSel({ ...sel, noteMode: true });
                }}
              >
                笔记
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function useCallbackish(fn: () => void, deps: unknown[]): () => void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallbackWrap(fn, deps);
}

function useCallbackWrap(fn: () => void, deps: unknown[]): () => void {
  const ref = useRef(fn);
  ref.current = fn;
  return useRef(() => ref.current()).current as () => void;
}
