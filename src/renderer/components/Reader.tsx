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
import { parseTxtChapters, findParaIndexForOffset } from '../../core/toc.ts';
import { formatDuration } from '../../core/stats.ts';
import type {
  Annotation,
  AnnotationInput,
  BookMeta,
  BookPayload,
} from '../../shared/types.ts';
import AnnotationDrawer from './AnnotationDrawer.tsx';
import PdfReader from './PdfReader.tsx';
import TextReader from './TextReader.tsx';
import TocDrawer, { type TocEntry } from './TocDrawer.tsx';
import { useSettings, themeLabel } from '../settings.tsx';
import { library } from '../library.ts';
import { mirrorProgress, readInitialRatio } from '../progress.ts';
import { addDailySeconds, getTodaySeconds } from '../stats-store.ts';

interface ReaderProps {
  bookId: string;
  onBack: () => void;
}

interface PageInfo {
  page: number;
  pages: number;
}

type DrawerKind = 'toc' | 'annotations' | null;

const SAVE_DEBOUNCE_MS = 400;
const STATS_FLUSH_SECONDS = 30;

export default function Reader({ bookId, onBack }: ReaderProps) {
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [payload, setPayload] = useState<BookPayload | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ page: 1, pages: 1 });
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [scrollToken, setScrollToken] = useState(0);
  const { fontSize, setFontSize, theme, cycleTheme } = useSettings();

  const scrollRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(0);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingRatioRef = useRef<number | null>(null);
  const initialRatioRef = useRef(0);
  const drawerRef = useRef<DrawerKind>(null);
  drawerRef.current = drawer;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  /* ---------- 载入 ---------- */

  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await library.listBooks();
      const found = list.find((b) => b.id === bookId) ?? null;
      const content = await library.getBookContent(bookId);
      if (!alive) return;
      if (!found || !content) {
        onBackRef.current();
        return;
      }
      initialRatioRef.current = readInitialRatio(bookId, found.progress);
      setMeta(found);
      setPayload(content);
    })();
    return () => {
      alive = false;
    };
  }, [bookId]);

  const refreshAnnotations = useCallback(async () => {
    setAnnotations(await library.listAnnotations(bookId));
  }, [bookId]);

  useEffect(() => {
    void refreshAnnotations();
  }, [refreshAnnotations]);

  /* ---------- TXT 派生：段落与章节定位 ---------- */

  const txtParas = useMemo(() => {
    if (payload?.kind !== 'txt') return [];
    return payload.text.split('\n').filter((line) => line.trim() !== '');
  }, [payload]);

  const paraStarts = useMemo(() => {
    if (payload?.kind !== 'txt') return [];
    const starts: number[] = [];
    let acc = 0;
    for (const line of payload.text.split('\n')) {
      if (line.trim() !== '') starts.push(acc);
      acc += line.length + 1;
    }
    return starts;
  }, [payload]);

  const jumpToPara = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      const node = el?.querySelector(`[data-para="${index}"]`);
      node?.scrollIntoView({ block: 'start' });
    },
    [],
  );

  const tocEntries = useMemo<TocEntry[]>(() => {
    if (payload?.kind === 'txt') {
      return parseTxtChapters(payload.text).map((c) => ({
        label: c.title,
        jump: () => jumpToPara(findParaIndexForOffset(paraStarts, c.offset)),
      }));
    }
    if (payload?.kind === 'epub') {
      return payload.book.toc.map((t) => ({
        label: t.label,
        jump: () => {
          scrollRef.current
            ?.querySelector(`[data-chapter="${t.chapterIndex}"]`)
            ?.scrollIntoView({ block: 'start' });
        },
      }));
    }
    return [];
  }, [payload, paraStarts, jumpToPara]);

  /* ---------- 进度：恢复 / 保存 / 翻页 ---------- */

  const updatePageInfo = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight <= 0) return;
    ratioRef.current = offsetToRatio(
      el.scrollTop,
      el.scrollHeight,
      el.clientHeight,
    );
    const total =
      meta?.format === 'pdf' && numPages > 0
        ? numPages
        : Math.max(1, Math.ceil(el.scrollHeight / el.clientHeight));
    setPageInfo({
      page: offsetToPage(el.scrollTop, el.scrollHeight, el.clientHeight),
      pages: total,
    });
  }, [meta, numPages]);

  useLayoutEffect(() => {
    if (!payload || restoredRef.current) return;
    restoredRef.current = true;
    ratioRef.current = initialRatioRef.current;
    if (meta) document.title = `${meta.title} · 读书阅读器`;
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
  }, [payload, meta, updatePageInfo]);

  const flushProgress = useCallback(() => {
    if (!restoredRef.current) return;
    void library.saveProgress(bookId, ratioRef.current);
    mirrorProgress(bookId, ratioRef.current);
  }, [bookId]);

  const handleScroll = useCallback(() => {
    setScrollToken((t) => t + 1);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerRef.current) setDrawer(null);
        else void handleBack();
        return;
      }
      if (drawerRef.current) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        turnPage(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        turnPage(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turnPage, handleBack]);

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

  /* ---------- 阅读时长统计 ---------- */

  useEffect(() => {
    if (!meta) return;
    let batch = 0;
    const flush = () => {
      if (batch <= 0) return;
      void library.addReadSeconds(bookId, batch);
      void addDailySeconds(batch);
      batch = 0;
    };
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      batch += 1;
      if (batch >= STATS_FLUSH_SECONDS) flush();
    }, 1000);
    return () => {
      window.clearInterval(timer);
      flush();
    };
  }, [bookId, meta]);

  useEffect(() => {
    if (drawer) void getTodaySeconds().then(setTodaySeconds);
  }, [drawer]);

  /* ---------- 标注 ---------- */

  const addAnnotation = useCallback(
    (input: AnnotationInput) => {
      void (async () => {
        await library.addAnnotation(bookId, input);
        await refreshAnnotations();
      })();
    },
    [bookId, refreshAnnotations],
  );

  const addBookmark = useCallback(() => {
    addAnnotation({ type: 'bookmark', ratio: ratioRef.current });
  }, [addAnnotation]);

  const jumpToAnnotation = useCallback(
    (a: Annotation) => {
      setDrawer(null);
      // TXT：按段落定位；EPUB：定位到内联标记（退化到章节头）；PDF：定位到页
      if (a.paraIndex !== undefined) {
        jumpToPara(a.paraIndex);
        return;
      }
      const el = scrollRef.current;
      if (!el) return;
      if (a.chapterIndex !== undefined) {
        const mark = el.querySelector(`[data-ann-id="${a.id}"]`);
        if (mark) {
          mark.scrollIntoView({ block: 'center' });
          return;
        }
        el.querySelector(`[data-chapter="${a.chapterIndex}"]`)?.scrollIntoView({ block: 'start' });
        return;
      }
      if (a.page !== undefined) {
        el.querySelector(`[data-pdf-page="${a.page}"]`)?.scrollIntoView({ block: 'start' });
        return;
      }
      el.scrollTop = ratioToOffset(a.ratio, el.scrollHeight, el.clientHeight);
    },
    [jumpToPara],
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      void (async () => {
        await library.removeAnnotation(bookId, id);
        await refreshAnnotations();
      })();
    },
    [bookId, refreshAnnotations],
  );

  /* ---------- 字号调整保持相对位置 ---------- */

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

  /* ---------- PDF 数据拷贝（worker 会转移缓冲） ---------- */

  const pdfData = useMemo(
    () => (payload?.kind === 'pdf' ? payload.data.slice() : null),
    [payload],
  );

  const onNumPages = useCallback((n: number) => setNumPages(n), []);
  const onPdfError = useCallback(() => onBackRef.current(), []);

  /* ---------- 渲染 ---------- */

  if (!meta || !payload) {
    return <div className="reader-loading">加载中…</div>;
  }

  const isPdf = payload.kind === 'pdf';

  return (
    <div className="reader">
      <header className="reader-toolbar">
        <button className="reader-tool" onClick={() => void handleBack()}>
          ← 书架
        </button>
        {!isPdf && (
          <button
            className="reader-tool"
            onClick={() => setDrawer(drawer === 'toc' ? null : 'toc')}
          >
            目录
          </button>
        )}
        <button
          className="reader-tool"
          onClick={() => setDrawer(drawer === 'annotations' ? null : 'annotations')}
        >
          标注
        </button>
        <div className="reader-title" title={meta.title}>
          {meta.title}
        </div>
        <span className="reader-pageinfo">
          {pageInfo.page} / {pageInfo.pages} 页
        </span>
        <button
          className="reader-tool"
          title="切换主题（纸张 → 护眼 → 深色）"
          onClick={cycleTheme}
        >
          {themeLabel(theme)}
        </button>
        {!isPdf && (
          <>
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
          </>
        )}
      </header>

      <div className="reader-scroll" ref={scrollRef} onScroll={handleScroll}>
        {payload.kind === 'pdf' && pdfData ? (
          <div className="reader-content pdf-content">
            <PdfReader
              data={pdfData}
              annotations={annotations}
              onAddAnnotation={addAnnotation}
              getRatio={() => ratioRef.current}
              onNumPages={onNumPages}
              onError={onPdfError}
              scrollToken={scrollToken}
            />
          </div>
        ) : payload.kind === 'epub' ? (
          <TextReader
            kind="epub"
            paras={[]}
            epub={payload.book}
            annotations={annotations}
            fontSize={fontSize}
            onAddAnnotation={addAnnotation}
            getRatio={() => ratioRef.current}
            onMarkActivate={() => setDrawer('annotations')}
            scrollToken={scrollToken}
          />
        ) : (
          <TextReader
            kind="txt"
            paras={txtParas}
            epub={null}
            annotations={annotations}
            fontSize={fontSize}
            onAddAnnotation={addAnnotation}
            getRatio={() => ratioRef.current}
            onMarkActivate={() => setDrawer('annotations')}
            scrollToken={scrollToken}
          />
        )}
      </div>

      <button
        className="reader-nav reader-nav-prev"
        title="上一页"
        onClick={() => turnPage(-1)}
      >
        ‹
      </button>
      <button
        className="reader-nav reader-nav-next"
        title="下一页"
        onClick={() => turnPage(1)}
      >
        ›
      </button>

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

      <TocDrawer
        open={drawer === 'toc'}
        entries={tocEntries}
        onJump={(entry) => {
          setDrawer(null);
          entry.jump();
        }}
        onClose={() => setDrawer(null)}
        footer={
          <span>
            今日阅读 {formatDuration(todaySeconds)} · 本书累计{' '}
            {formatDuration(meta.readSeconds)}
          </span>
        }
      />
      <AnnotationDrawer
        open={drawer === 'annotations'}
        annotations={annotations}
        onJump={jumpToAnnotation}
        onDelete={removeAnnotation}
        onAddBookmark={() => {
          addBookmark();
          setDrawer(null);
        }}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
