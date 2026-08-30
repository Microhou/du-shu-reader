// 翻页数学：与 DOM 解耦的纯函数，便于单元测试
// 尺寸参数统一指纵向滚动方向（scrollHeight / clientHeight）

/** 最大可滚动距离；内容不足一屏时为 0 */
export function maxScroll(scrollLength: number, clientLength: number): number {
  return Math.max(0, scrollLength - clientLength);
}

/** 滚动偏移 -> 阅读进度比例 [0,1]；一屏放得下视为读完 */
export function offsetToRatio(
  offset: number,
  scrollLength: number,
  clientLength: number,
): number {
  const max = maxScroll(scrollLength, clientLength);
  if (max === 0) return 1;
  const ratio = offset / max;
  return Math.min(1, Math.max(0, ratio));
}

/** 阅读进度比例 -> 滚动偏移 */
export function ratioToOffset(
  ratio: number,
  scrollLength: number,
  clientLength: number,
): number {
  const max = maxScroll(scrollLength, clientLength);
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round(r * max);
}

/** 总页数；至少 1 页 */
export function pageCount(scrollLength: number, clientLength: number): number {
  if (clientLength <= 0) return 1;
  return Math.max(1, Math.ceil(scrollLength / clientLength));
}

/** 滚动偏移 -> 当前页码（1 起） */
export function offsetToPage(
  offset: number,
  scrollLength: number,
  clientLength: number,
): number {
  const pages = pageCount(scrollLength, clientLength);
  if (pages === 1) return 1;
  const page = Math.floor(Math.max(0, offset) / clientLength) + 1;
  return Math.min(pages, page);
}

/** 页码（1 起）-> 该页顶部对应的滚动偏移 */
export function pageToOffset(
  page: number,
  scrollLength: number,
  clientLength: number,
): number {
  const max = maxScroll(scrollLength, clientLength);
  const pages = pageCount(scrollLength, clientLength);
  const p = Math.min(Math.max(1, Math.round(page)), pages);
  return Math.min(max, (p - 1) * clientLength);
}
