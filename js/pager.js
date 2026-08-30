// 翻页数学：与 DOM 解耦的纯函数，便于单元测试

export function maxScroll(scrollWidth, clientWidth) {
  return Math.max(0, scrollWidth - clientWidth);
}

// 滚动偏移 -> 阅读进度比例 [0,1]；一屏放得下视为读完
export function offsetToRatio(offset, scrollWidth, clientWidth) {
  const max = maxScroll(scrollWidth, clientWidth);
  if (max === 0) return 1;
  const ratio = offset / max;
  return Math.min(1, Math.max(0, ratio));
}

// 阅读进度比例 -> 滚动偏移
export function ratioToOffset(ratio, scrollWidth, clientWidth) {
  const max = maxScroll(scrollWidth, clientWidth);
  const r = Math.min(1, Math.max(0, ratio));
  return Math.round(r * max);
}
