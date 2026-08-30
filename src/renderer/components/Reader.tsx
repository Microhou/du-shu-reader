import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { offsetToPage, offsetToRatio, ratioToOffset } from '../../core/pager.ts';
import {
  parseTxtChapters,
  chapterParaRanges,
  findParaIndexForOffset,
} from '../../core/toc.ts';
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

type DrawerKind = 'toc' | 'annotations' | null;

/** 章节渲染后的滚动意图：恢复比例 / 跳段落 / 跳标注 / 上一章落底 */
interface ScrollAnchor {
  ratioInChapter?: number;
  paraIndex?: number;
  annId?: string;
}

const SAVE_DEBOUNCE_MS = 400;
const STATS_FLUSH_SECONDS = 30;

export default function Reader({ bookId, onBack }: ReaderProps) {
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [payload, setPayload] = useState<BookPayload | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [scrollToken, setScrollToken] = useState(0);
  const [pageLabel, setPageLabel] = useState('');
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
  const chapterIndexRef = useRef(0);
  chapterIndexRef.current = chapterIndex;
  const navDirRef = useRef<'top' | 'prev' | null>(null);
  const anchorRef = useRef<ScrollAnchor | null>(null);

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
      // 恢复的兜底锚点：进章后按章内比例落位（章节模式会覆盖为按章换算的值）
      anchorRef.current = { ratioInChapter: initialRatioRef.current };
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

  /* ---------- TXT 派生：全书段落、章节划分 ---------- */

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

  const txtChapters = useMemo(
    () => (payload?.kind === 'txt' ? parseTxtChapters(payload.text) : []),
    [payload],
  );

  const txtRanges = useMemo(
    () => chapterParaRanges(paraStarts, txtChapters),
    [paraStarts, txtChapters],
  );

  const isPdf = payload?.kind === 'pdf';
  const isPdfRef = useRef(false);
  isPdfRef.current = isPdf === true;
  const chapterCount = isPdf
    ? 0
    : payload?.kind === 'epub'
      ? payload.book.chapters.length
      : txtRanges.length;
  const chapterCountRef = useRef(0);
  chapterCountRef.current = chapterCount;
  const txtRangesRef = useRef(txtRanges);
  txtRangesRef.current = txtRanges;

  // 打开书籍时：全局进度比例 → 章节 + 章内比例（PDF 走兜底锚点）
  useEffect(() => {
    if (!payload || isPdf || chapterCount === 0) return;
    const globalRatio = initialRatioRef.current;
    const idx = Math.max(
      0,
      Math.min(chapterCount - 1, Math.floor(globalRatio * chapterCount)),
    );
    anchorRef.current = {
      ratioInChapter: Math.min(1, globalRatio * chapterCount - idx),
    };
    setChapterIndex(idx);
  }, [payload, isPdf, chapterCount]);

  const txtChapter = useMemo(() => {
    if (payload?.kind !== 'txt') return null;
    const range = txtRanges[Math.min(chapterIndex, txtRanges.length - 1)] ?? [
      0,
      txtParas.length,
    ];
    return {
      paras: txtParas.slice(range[0], range[1]),
      paraStart: range[0],
      title: txtChapters[Math.min(chapterIndex, txtChapters.length - 1)]?.title,
    };
  }, [payload, txtParas, txtRanges, txtChapters, chapterIndex]);

  /* ---------- 当前章节相关的标注 ---------- */

  const chapterAnnotations = useMemo(() => {
    if (isPdf) return annotations;
    if (payload?.kind === 'txt' && txtChapter) {
      const s = txtChapter.paraStart;
      const e = s + txtChapter.paras.length;
      return annotations.filter(
        (a) => a.paraIndex === undefined || (a.paraIndex >= s && a.paraIndex < e),
      );
    }
    if (payload?.kind === 'epub') {
      return annotations.filter(
        (a) => a.chapterIndex === undefined || a.chapterIndex === chapterIndex,
      );
    }
    return annotations;
  }, [annotations, payload, txtChapter, chapterIndex, isPdf]);

  /* ---------- 页码与进度 ---------- */

  const updatePageInfo = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight <= 0) return;
    const max = el.scrollHeight - el.clientHeight;
    const inRatio = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 1;
    const count = chapterCountRef.current;
    if (meta?.format === 'pdf') {
      ratioRef.current = inRatio;
      setPageLabel(
        numPages > 0
          ? `第 ${Math.min(numPages, offsetToPage(el.scrollTop, el.scrollHeight, el.clientHeight))} / ${numPages} 页`
          : '',
      );
    } else if (count > 0) {
      ratioRef.current = Math.min(
        1,
        (chapterIndexRef.current + inRatio) / count,
      );
      setPageLabel(`第 ${chapterIndexRef.current + 1} / ${count} 章`);
    } else {
      ratioRef.current = inRatio;
    }
  }, [meta, numPages]);

  // 进度恢复 / 章节切换后的落位
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !payload) return;
    const hasPending =
      anchorRef.current !== null ||
      navDirRef.current !== null ||
      !restoredRef.current;
    if (!hasPending) return;

    if (!restoredRef.current) {
      restoredRef.current = true;
      ratioRef.current = initialRatioRef.current;
      if (meta) document.title = `${meta.title} · 读书阅读器`;
    }

    const raf = requestAnimationFrame(() => {
      const anchor = anchorRef.current;
      const nav = navDirRef.current;
      if (anchor?.paraIndex !== undefined) {
        el.querySelector(`[data-para="${anchor.paraIndex}"]`)?.scrollIntoView({ block: 'start' });
      } else if (anchor?.annId) {
        el.querySelector(`[data-ann-id="${anchor.annId}"]`)?.scrollIntoView({ block: 'center' });
      } else if (anchor?.ratioInChapter !== undefined) {
        el.scrollTop = ratioToOffset(
          anchor.ratioInChapter,
          el.scrollHeight,
          el.clientHeight,
        );
      } else if (nav === 'prev') {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTop = 0;
      }
      anchorRef.current = null;
      navDirRef.current = null;
      updatePageInfo();
    });
    return () => cancelAnimationFrame(raf);
  }, [payload, chapterIndex, meta, updatePageInfo]);

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

  /* ---------- 章节导航 ---------- */

  const goChapter = useCallback(
    (next: number, mode: 'top' | 'prev') => {
      const count = chapterCountRef.current;
      if (next < 0 || (count > 0 && next >= count)) return;
      flushProgress();
      navDirRef.current = mode;
      setChapterIndex(next);
    },
    [flushProgress],
  );

  const scrollScreen = useCallback((dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: dir * el.clientHeight * 0.88, behavior: 'smooth' });
  }, []);

  // 键盘：章内滚动一屏；到章底/章顶再按则切换章节
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerRef.current) setDrawer(null);
        else void handleBack();
        return;
      }
      if (drawerRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        if (
          !isPdfRef.current &&
          el.scrollTop >= max - 2 &&
          chapterIndexRef.current < chapterCountRef.current - 1
        ) {
          goChapter(chapterIndexRef.current + 1, 'top');
          return;
        }
        scrollScreen(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (!isPdfRef.current && el.scrollTop <= 2 && chapterIndexRef.current > 0) {
          goChapter(chapterIndexRef.current - 1, 'prev');
          return;
        }
        scrollScreen(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goChapter, scrollScreen, handleBack]);

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

  const removeAnnotation = useCallback(
    (id: string) => {
      void (async () => {
        await library.removeAnnotation(bookId, id);
        await refreshAnnotations();
      })();
    },
    [bookId, refreshAnnotations],
  );

  const jumpToAnnotation = useCallback(
    (a: Annotation) => {
      setDrawer(null);
      const el = scrollRef.current;
      if (a.paraIndex !== undefined) {
        // TXT：定位到段落所在章节
        let ch = 0;
        const ranges = txtRangesRef.current;
        for (let i = 0; i < ranges.length; i++) {
          const [s, e] = ranges[i];
          if (a.paraIndex >= s && a.paraIndex < e) {
            ch = i;
            break;
          }
        }
        if (ch === chapterIndexRef.current) {
          el?.querySelector(`[data-para="${a.paraIndex}"]`)?.scrollIntoView({ block: 'start' });
        } else {
          anchorRef.current = { paraIndex: a.paraIndex };
          setChapterIndex(ch);
        }
        return;
      }
      if (a.chapterIndex !== undefined) {
        if (a.chapterIndex === chapterIndexRef.current) {
          el?.querySelector(`[data-ann-id="${a.id}"]`)?.scrollIntoView({ block: 'center' });
        } else {
          anchorRef.current = { annId: a.id };
          setChapterIndex(a.chapterIndex);
        }
        return;
      }
      if (a.page !== undefined) {
        el?.querySelector(`[data-pdf-page="${a.page}"]`)?.scrollIntoView({ block: 'start' });
        return;
      }
      el?.scrollTo({ top: ratioToOffset(a.ratio, el.scrollHeight, el.clientHeight) });
    },
    [],
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

  /* ---------- 目录 ---------- */

  const tocEntries = useMemo<TocEntry[]>(() => {
    if (payload?.kind === 'txt') {
      const list = txtChapters.length
        ? txtChapters
        : [{ title: '正文', offset: 0 }];
      return list.map((c, i) => ({
        label: c.title,
        jump: () => goChapter(i, 'top'),
      }));
    }
    if (payload?.kind === 'epub') {
      return payload.book.toc.map((t) => ({
        label: t.label,
        jump: () => goChapter(Math.min(t.chapterIndex, chapterCount - 1), 'top'),
      }));
    }
    return [];
  }, [payload, txtChapters, chapterCount, goChapter]);

  /* ---------- 渲染 ---------- */

  if (!meta || !payload) {
    return <div className="reader-loading">加载中…</div>;
  }

  const isPdfView = payload.kind === 'pdf';

  return (
    <div className="reader">
      <header className="reader-toolbar">
        <button className="reader-tool" onClick={() => void handleBack()}>
          ← 书架
        </button>
        <div className="reader-title" title={meta.title}>
          {meta.title}
        </div>
        <span className="reader-pageinfo">{pageLabel}</span>
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
          <>
            {chapterIndex > 0 && (
              <div className="chapter-nav chapter-nav-top">
                <button onClick={() => goChapter(chapterIndex - 1, 'prev')}>
                  上一章
                </button>
              </div>
            )}
            <TextReader
              kind="epub"
              paras={[]}
              paraStart={0}
              chapterIndex={chapterIndex}
              epub={payload.book}
              annotations={chapterAnnotations}
              fontSize={fontSize}
              onAddAnnotation={addAnnotation}
              getRatio={() => ratioRef.current}
              onMarkActivate={() => setDrawer('annotations')}
              scrollToken={scrollToken}
            />
            <div className="chapter-nav">
              {chapterIndex > 0 && (
                <button onClick={() => goChapter(chapterIndex - 1, 'prev')}>
                  上一章
                </button>
              )}
              {chapterIndex < chapterCount - 1 ? (
                <button
                  className="chapter-nav-next"
                  onClick={() => goChapter(chapterIndex + 1, 'top')}
                >
                  下一章
                </button>
              ) : (
                <span className="chapter-end">全书完</span>
              )}
            </div>
          </>
        ) : (
          <>
            <TextReader
              kind="txt"
              paras={txtChapter?.paras ?? []}
              paraStart={txtChapter?.paraStart ?? 0}
              chapterIndex={chapterIndex}
              chapterTitle={txtChapter?.title}
              epub={null}
              annotations={chapterAnnotations}
              fontSize={fontSize}
              onAddAnnotation={addAnnotation}
              getRatio={() => ratioRef.current}
              onMarkActivate={() => setDrawer('annotations')}
              scrollToken={scrollToken}
            />
            <div className="chapter-nav">
              {chapterIndex > 0 && (
                <button onClick={() => goChapter(chapterIndex - 1, 'prev')}>
                  上一章
                </button>
              )}
              {chapterIndex < chapterCount - 1 ? (
                <button
                  className="chapter-nav-next"
                  onClick={() => goChapter(chapterIndex + 1, 'top')}
                >
                  下一章
                </button>
              ) : (
                <span className="chapter-end">全书完</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* 右侧悬浮工具栏（参考微信读书阅读页） */}
      <div className="reader-rail">
        {!isPdfView && (
          <button
            className="rail-btn"
            title="目录"
            onClick={() => setDrawer(drawer === 'toc' ? null : 'toc')}
          >
            ☰
          </button>
        )}
        <button
          className="rail-btn"
          title="标注（书签 / 划线 / 笔记）"
          onClick={() => setDrawer(drawer === 'annotations' ? null : 'annotations')}
        >
          ✎
        </button>
        {!isPdfView && (
          <>
            <button
              className="rail-btn rail-btn-lg"
              title="增大字号"
              onClick={() => changeFontSize(2)}
            >
              A⁺
            </button>
            <button
              className="rail-btn rail-btn-lg"
              title="减小字号"
              onClick={() => changeFontSize(-2)}
            >
              A⁻
            </button>
          </>
        )}
        <button
          className="rail-btn"
          title={`当前主题：${themeLabel(theme)}，点击切换（纸 → 绿 → 夜）`}
          onClick={cycleTheme}
        >
          {themeLabel(theme)}
        </button>
      </div>

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
