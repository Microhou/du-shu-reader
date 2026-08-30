// 阅读进度镜像：localStorage 同步写兜底。
// 窗口关闭瞬间 IndexedDB 异步事务可能未落盘，localStorage 的同步写入更可靠，
// 打开书籍时取两者中较大的进度。

const MIRROR_PREFIX = 'dushu:progress:';

export function mirrorProgress(bookId: string, ratio: number): void {
  try {
    localStorage.setItem(
      MIRROR_PREFIX + bookId,
      JSON.stringify({ ratio, at: Date.now() }),
    );
  } catch {
    // 写入失败不影响阅读
  }
}

function readMirrorRatio(bookId: string): number {
  try {
    const raw = localStorage.getItem(MIRROR_PREFIX + bookId);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { ratio?: unknown };
    return typeof parsed.ratio === 'number' ? parsed.ratio : 0;
  } catch {
    return 0;
  }
}

export function readInitialRatio(bookId: string, idbRatio: number): number {
  const ratio = Math.max(idbRatio, readMirrorRatio(bookId));
  return Math.min(1, Math.max(0, ratio));
}
