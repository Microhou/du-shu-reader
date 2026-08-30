// 排版设置：字号 + 主题，localStorage 持久化
import { useCallback, useState } from 'react';

import type { Theme } from '../../shared/types.ts';

const SETTINGS_KEY = 'dushu:settings';
const MIN_FONT = 14;
const MAX_FONT = 30;
const DEFAULT_FONT = 18;
const THEME_ORDER: Theme[] = ['paper', 'green', 'dark'];

const THEME_LABEL: Record<Theme, string> = {
  paper: '纸',
  green: '绿',
  dark: '夜',
};

export function themeLabel(theme: Theme): string {
  return THEME_LABEL[theme];
}

function clampFont(size: number): number {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));
}

function load(): { fontSize: number; theme: Theme } {
  let fontSize = DEFAULT_FONT;
  let theme: Theme = 'paper';
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { fontSize?: unknown; theme?: unknown };
      if (typeof parsed.fontSize === 'number') fontSize = clampFont(parsed.fontSize);
      if (parsed.theme === 'paper' || parsed.theme === 'green' || parsed.theme === 'dark') {
        theme = parsed.theme;
      }
    }
  } catch {
    // 损坏的设置按默认值处理
  }
  return { fontSize, theme };
}

interface SettingsState {
  fontSize: number;
  theme: Theme;
}

export function useSettings() {
  const [state, setState] = useState<SettingsState>(load);

  const apply = useCallback((next: SettingsState) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // 写入失败时仅本次会话生效
    }
    return next;
  }, []);

  const setFontSize = useCallback(
    (updater: (prev: number) => number) => {
      setState((prev) => apply({ ...prev, fontSize: clampFont(updater(prev.fontSize)) }));
    },
    [apply],
  );

  const setTheme = useCallback(
    (theme: Theme) => {
      setState((prev) => apply({ ...prev, theme }));
    },
    [apply],
  );

  const cycleTheme = useCallback(() => {
    setState((prev) =>
      apply({
        ...prev,
        theme: THEME_ORDER[(THEME_ORDER.indexOf(prev.theme) + 1) % THEME_ORDER.length],
      }),
    );
  }, [apply]);

  return { fontSize: state.fontSize, theme: state.theme, setFontSize, setTheme, cycleTheme };
}
