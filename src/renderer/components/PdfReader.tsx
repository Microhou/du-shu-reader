import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfReaderProps {
  /** 必须是拷贝：pdf.js 会把缓冲转移给 worker 导致原缓冲分离 */
  data: Uint8Array;
  onNumPages: (n: number) => void;
  onError: () => void;
}

export default function PdfReader({ data, onNumPages, onError }: PdfReaderProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.414); // A4 竖版兜底

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

  if (!doc) return <div className="reader-loading">正在解析 PDF…</div>;

  return (
    <div className="pdf-list">
      {pageNumbers.map((n) => (
        <PdfPage key={n} doc={doc} pageNum={n} aspect={aspect} />
      ))}
    </div>
  );
}

function PdfPage({
  doc,
  pageNum,
  aspect,
}: {
  doc: PDFDocumentProxy;
  pageNum: number;
  aspect: number;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    })();
  }, [visible, doc, pageNum]);

  return (
    <div
      ref={holderRef}
      className="pdf-page"
      style={{ aspectRatio: `1 / ${aspect}` }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
