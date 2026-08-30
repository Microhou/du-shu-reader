// 设置的纯逻辑：加载/持久化/主题应用。与 React 解耦，可在 Node 单测。
import type { Theme } from '../shared/types.ts';

export const THEME_ORDER: Theme[] = ['paper', 'green', 'dark'];

const THEME_LABEL: Record<Theme, string> = {
  paper: '纸',
  green: '绿',
  dark: '夜',
};

export function themeLabel(theme: Theme): string {
  return THEME_LABEL[theme];
}

export function isTheme(value: unknown): value is Theme {
  return value === 'paper' || value === 'green' || value === 'dark';
}

const MIN_FONT = 14;
const MAX_FONT = 30;
const DEFAULT_FONT = 18;

export function clampFont(size: number): number {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));
}

/** 主题变量作用在 :root[data-theme] 上，全部主题样式由此生效 */
export function applyThemeToRoot(
  theme: Theme,
  root: { dataset: { theme?: string } },
): void {
  root.dataset.theme = theme;
}

/** localStorage 的最小接口，便于测试注入 */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_KEY = 'dushu:settings';

export interface SettingsState {
  fontSize: number;
  theme: Theme;
}

export function loadSettings(storage: SettingsStorage): SettingsState {
  let fontSize = DEFAULT_FONT;
  let theme: Theme = 'paper';
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { fontSize?: unknown; theme?: unknown };
      if (typeof parsed.fontSize === 'number') {
        fontSize = clampFont(parsed.fontSize);
      }
      if (isTheme(parsed.theme)) theme = parsed.theme;
    }
  } catch {
    // 损坏的设置按默认值处理
  }
  return { fontSize, theme };
}

export function persistSettings(storage: SettingsStorage, state: SettingsState): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(state));
  } catch {
    // 写入失败时仅本次会话生效
  }
}
