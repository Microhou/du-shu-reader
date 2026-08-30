// 每日阅读时长：IndexedDB 按日期键累计（渲染层专用）
import { todayKey } from '../core/stats.ts';
import { idbStorage } from '../core/storage.ts';

const dailyKey = () => `daily:${todayKey()}`;

export async function addDailySeconds(delta: number): Promise<void> {
  if (!(delta > 0)) return;
  const current = (await idbStorage.get<number>(dailyKey())) ?? 0;
  await idbStorage.set(dailyKey(), current + Math.floor(delta));
}

export async function getTodaySeconds(): Promise<number> {
  return (await idbStorage.get<number>(dailyKey())) ?? 0;
}
