import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  offsetToPage,
  offsetToRatio,
  pageToOffset,
  ratioToOffset,
} from '../../core/pager.ts';
import { library } from '../library.ts';
import { mirrorProgress, readInitialRatio } from '../progress.ts';
import { useSettings } from '../hooks/useSettings.ts';

interface Props {
  bookId: string;
  onBack: () => void;
}

interface PageInfo {
  page: number;
  pages: number;
}

/** 内容按段落分组渲染，配合 content-visibility 控制长篇的渲染开销 */
interface ContentChunk {
  paras: string[];
  estHeight: number;
}

const PARAS_PER_CHUNK = 200;
const LINE_ESTIMATE_PX = 36;
const SAVE_DEBOUNCE_MS = 400;

function splitChunks(content: string): ContentChunk[] {
  const paras = content.split('\n').filter((line) => line.trim() !== '');
  const chunks: ContentChunk[] = [];
  for (let i = 0; i < paras.length; i += PARAS_PER_CHUNK) {
    const group = paras.slice(i, i + PARAS_PER_CHUNK);
    chunks.push({
      paras: group,
      estHeight: group.length * LINE_ESTIMATE_PX,
    });
  }
  return chunks;
}

export default function Reader({ bookId, onBack }: Props) {
  const [book, setBook] = useState<{ title: string; content: string } | null>(
    null,
  );
  const [pageInfo, setPageInfo] = useState<PageInfo>({ page: 1, pages: 1 });
  const { fontSize, setFontSize } = useSettings();

  const scrollRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(0);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingRatioRef = useRef<number | null>(null);
  const initialRatioRef = useRef(0);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const chunks = useMemo(
    () => (book ? splitChunks(book.content) : []),
    [book],
  );

  // 加载书籍内容与进度
  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await library.listBooks();
      const meta = list.find((b) => b.id === bookId);
      const content = await library.getBookContent(bookId);
      if (!alive) return;
      if (content === null) {
        onBackRef.current();
        return;
      }
      initialRatioRef.current = readInitialRatio(
        bookId,
        meta?.progress ?? 0,
      );
      setBook({ title: meta?.title ?? '未命名', content });
    })();
    return () => {
      alive = false;
    };
  }, [bookId]);

  const updatePageInfo = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight <= 0) return;
    ratioRef.current = offsetToRatio(
      el.scrollTop,
      el.scrollHeight,
      el.clientHeight,
    );
    setPageInfo({
      page: offsetToPage(el.scrollTop, el.scrollHeight, el.clientHeight),
      pages: Math.max(1, Math.ceil(el.scrollHeight / el.clientHeight)),
    });
  }, []);

  // 恢复上次阅读位置
  useLayoutEffect(() => {
    if (!book || restoredRef.current) return;
    restoredRef.current = true;
    ratioRef.current = initialRatioRef.current;
    document.title = `${book.title} · 读书阅读器`;
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = ratioToOffset(
          ratioRef.current,
          el.scrollHeight,
          el.clientHeight,
        );
        updatePageInfo();
      });
    }
  }, [book, updatePageInfo]);

  const flushProgress = useCallback(() => {
    if (!restoredRef.current) return;
    void library.saveProgress(bookId, ratioRef.current);
    mirrorProgress(bookId, ratioRef.current);
  }, [bookId]);

  const handleScroll = useCallback(() => {
    updatePageInfo();
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined;
      flushProgress();
    }, SAVE_DEBOUNCE_MS);
  }, [flushProgress, updatePageInfo]);

  const handleBack = useCallback(async () => {
    flushProgress();
    onBackRef.current();
  }, [flushProgress]);

  const turnPage = useCallback((dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const current = offsetToPage(
      el.scrollTop,
      el.scrollHeight,
      el.clientHeight,
    );
    const target = pageToOffset(
      current + dir,
      el.scrollHeight,
      el.clientHeight,
    );
    el.scrollTo({ top: target, behavior: 'smooth' });
  }, []);

  // 键盘翻页；返回书架前先落盘进度
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowRight' ||
        e.key === 'PageDown' ||
        e.key === ' '
      ) {
        e.preventDefault();
        turnPage(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        turnPage(-1);
      } else if (e.key === 'Escape') {
        void handleBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turnPage, handleBack]);

  // 关闭窗口 / 返回书架时兜底保存
  useEffect(() => {
    const onPageHide = () => flushProgress();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
      }
      flushProgress();
      document.title = '读书阅读器';
    };
  }, [flushProgress]);

  // 字号调整后保持相对阅读位置
  const changeFontSize = useCallback(
    (delta: number) => {
      const el = scrollRef.current;
      if (el) {
        pendingRatioRef.current = offsetToRatio(
          el.scrollTop,
          el.scrollHeight,
          el.clientHeight,
        );
      }
      setFontSize((prev) => prev + delta);
    },
    [setFontSize],
  );

  useEffect(() => {
    if (pendingRatioRef.current === null) return;
    const ratio = pendingRatioRef.current;
    pendingRatioRef.current = null;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = ratioToOffset(ratio, el.scrollHeight, el.clientHeight);
      updatePageInfo();
    });
  }, [fontSize, updatePageInfo]);

  if (!book) {
    return <div className="reader-loading">加载中…</div>;
  }

  return (
    <div className="reader">
      <header className="reader-toolbar">
        <button className="reader-tool" onClick={() => void handleBack()}>
          ← 书架
        </button>
        <div className="reader-title" title={book.title}>
          {book.title}
        </div>
        <span className="reader-pageinfo">
          {pageInfo.page} / {pageInfo.pages} 页
        </span>
        <button
          className="reader-tool"
          title="减小字号"
          onClick={() => changeFontSize(-2)}
        >
          A−
        </button>
        <span className="reader-fontsize">{fontSize}</span>
        <button
          className="reader-tool"
          title="增大字号"
          onClick={() => changeFontSize(2)}
        >
          A＋
        </button>
      </header>

      <div className="reader-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div
          className="reader-content"
          style={{ fontSize: `${fontSize}px` }}
        >
          {chunks.map((chunk, i) => (
            <div
              className="reader-chunk"
              key={i}
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: `auto ${chunk.estHeight}px`,
              }}
            >
              {chunk.paras.map((para, j) => (
                <p key={j}>{para}</p>
              ))}
            </div>
          ))}
        </div>
      </div>

      <button
        className="zone zone-left"
        title="上一页"
        onClick={() => turnPage(-1)}
      />
      <button
        className="zone zone-right"
        title="下一页"
        onClick={() => turnPage(1)}
      />
    </div>
  );
}
