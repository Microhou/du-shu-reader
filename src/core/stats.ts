// 阅读时长展示与日期工具（纯函数）

/** 秒数 → 展示文案 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s === 0) return '未读';
  if (s < 60) return '不足 1 分钟';
  const minutes = Math.floor(s / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分钟`;
}

/** 本地日期键：YYYY-MM-DD（每日时长统计用） */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
