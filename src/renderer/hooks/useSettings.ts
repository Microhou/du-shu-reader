// 排版设置：localStorage 持久化，重启浏览器/应用后仍生效
import { useCallback, useState } from 'react';

const SETTINGS_KEY = 'dushu:settings';
const MIN_FONT = 14;
const MAX_FONT = 30;
const DEFAULT_FONT = 18;

function clampFont(size: number): number {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));
}

function loadFontSize(): number {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_FONT;
    const parsed = JSON.parse(raw) as { fontSize?: unknown };
    if (typeof parsed.fontSize === 'number') return clampFont(parsed.fontSize);
  } catch {
    // 损坏的设置按默认值处理
  }
  return DEFAULT_FONT;
}

export function useSettings() {
  const [fontSize, setFontSizeState] = useState(loadFontSize);

  const setFontSize = useCallback(
    (updater: (prev: number) => number) => {
      setFontSizeState((prev) => {
        const next = clampFont(updater(prev));
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontSize: next }));
        } catch {
          // 写入失败时仅本次会话生效
        }
        return next;
      });
    },
    [],
  );

  return { fontSize, setFontSize };
}
