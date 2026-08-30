import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import type {
  Annotation,
  AnnotationInput,
  HighlightStyle,
  MarkRect,
} from '../../shared/types.ts';
import { findAncestorWithAttr } from '../annotations.ts';
import { pdfjs } from '../pdf.ts';
import SelBubble from './SelBubble.tsx';

interface PdfReaderProps {
  /** 必须是拷贝：pdf.js 会把缓冲转移给 worker 导致原缓冲分离 */
  data: Uint8Array;
  annotations: Annotation[];
  onAddAnnotation: (input: AnnotationInput) => void;
  getRatio: () => number;
  onNumPages: (n: number) => void;
  onError: () => void;
  /** 父级滚动时递增，用于关闭选区气泡 */
  scrollToken: number;
}

interface SelectionState {
  x: number;
  y: number;
  text: string;
  noteMode: boolean;
  page: number;
  rects: MarkRect[];
}

const MAX_SELECTION_CHARS = 2000;
const MAX_MARK_RECTS = 40;

export default function PdfReader({
  data,
  annotations,
  onAddAnnotation,
  getRatio,
  onNumPages,
  onError,
  scrollToken,
}: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.414); // A4 竖版兜底
  const [sel, setSel] = useState<SelectionState | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    setSel(null);
  }, [scrollToken]);

  useEffect(() => {
    let alive = true;
    const task = pdfjs.getDocument({ data });
    void task.promise.then(
      (d) => {
        if (!alive) return;
        setDoc(d);
        onNumPages(d.numPages);
        void d.getPage(1).then((p) => {
          const vp = p.getViewport({ scale: 1 });
          if (vp.width > 0) setAspect(vp.height / vp.width);
        });
      },
      () => {
        if (alive) onError();
      },
    );
    return () => {
      alive = false;
      void task.destroy();
    };
  }, [data, onNumPages, onError]);

  const pageNumbers = useMemo(
    () => (doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []),
    [doc],
  );

  /** 选区 → 当前页内的百分比矩形组 */
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
      const pageEl = findAncestorWithAttr(
        range.startContainer,
        containerRef.current,
        'data-pdf-page',
      );
      const endPageEl = findAncestorWithAttr(
        range.endContainer,
        containerRef.current,
        'data-pdf-page',
      );
      if (!pageEl || pageEl !== endPageEl) {
        setSel(null);
        return;
      }
      const pageNum = Number(pageEl.getAttribute('data-pdf-page'));
      if (!Number.isInteger(pageNum)) {
        setSel(null);
        return;
      }
      const pageRect = pageEl.getBoundingClientRect();
      if (pageRect.width <= 0 || pageRect.height <= 0) {
        setSel(null);
        return;
      }
      const rects: MarkRect[] = [];
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        rects.push({
          x: (r.left - pageRect.left) / pageRect.width,
          y: (r.top - pageRect.top) / pageRect.height,
          w: r.width / pageRect.width,
          h: r.height / pageRect.height,
        });
        if (rects.length >= MAX_MARK_RECTS) break;
      }
      if (rects.length === 0) {
        setSel(null);
        return;
      }
      const first = range.getBoundingClientRect();
      setSel({
        x: Math.min(window.innerWidth - 270, Math.max(24, first.left + first.width / 2 - 125)),
        y: Math.max(72, first.top - 14),
        text,
        noteMode: false,
        page: pageNum,
        rects,
      });
    }, 0);
  }, []);

  const saveSelection = (type: 'highlight' | 'note', style?: HighlightStyle, note?: string) => {
    if (!sel) return;
    onAddAnnotation({
      type,
      style: type === 'highlight' ? (style ?? 'mark') : undefined,
      ratio: getRatio(),
      page: sel.page,
      rects: sel.rects,
      text: sel.text,
      note,
    });
    document.getSelection()?.removeAllRanges();
    setSel(null);
    setNoteDraft('');
  };

  if (!doc) return <div className="reader-loading">正在解析 PDF…</div>;

  return (
    <>
      <div className="pdf-list" ref={containerRef} onMouseUp={captureSelection}>
        {pageNumbers.map((n) => (
          <PdfPage
            key={n}
            doc={doc}
            pageNum={n}
            aspect={aspect}
            marks={annotations.filter(
              (a) =>
                (a.type === 'highlight' || a.type === 'note') &&
                a.page === n &&
                a.rects?.length,
            )}
          />
        ))}
      </div>

      {sel && (
        <SelBubble
          x={sel.x}
          y={sel.y}
          noteMode={sel.noteMode}
          noteDraft={noteDraft}
          onNoteDraftChange={setNoteDraft}
          onCopy={() => {
            void navigator.clipboard.writeText(sel.text).catch(() => {});
            document.getSelection()?.removeAllRanges();
            setSel(null);
          }}
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

function PdfPage({
  doc,
  pageNum,
  aspect,
  marks,
}: {
  doc: PDFDocumentProxy;
  pageNum: number;
  aspect: number;
  marks: Annotation[];
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const startedRef = useRef(false);

  // 接近视口才开始渲染，避免整本一次性渲染
  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '900px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || startedRef.current || !canvasRef.current) return;
    startedRef.current = true;
    void (async () => {
      const page = await doc.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      const cssWidth = holderRef.current?.clientWidth || 660;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      // 文字层：让正文可选中。按画布视口定位，再整体缩放到 CSS 尺寸。
      const layer = textLayerRef.current;
      if (layer) {
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
        layer.style.transform = `scale(${cssWidth / viewport.width})`;
        const textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: layer,
          viewport,
        });
        await textLayer.render();
      }
    })();
  }, [visible, doc, pageNum]);

  return (
    <div ref={holderRef} className="pdf-page-wrap" data-pdf-page={pageNum}>
      <div className="pdf-page" style={{ aspectRatio: `1 / ${aspect}` }}>
        <canvas ref={canvasRef} />
        <div className="text-layer" ref={textLayerRef} />
      </div>
      <div className="pdf-overlays">
        {marks.flatMap((m) =>
          (m.rects ?? []).map((r, i) => (
            <div
              key={`${m.id}-${i}`}
              className={`pdf-mark ${
                m.type === 'note'
                  ? 'pdf-mark-note'
                  : m.style === 'wavy'
                    ? 'pdf-mark-wavy'
                    : m.style === 'underline'
                      ? 'pdf-mark-underline'
                      : 'pdf-mark-hl'
              }`}
              title={m.note ?? undefined}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}
