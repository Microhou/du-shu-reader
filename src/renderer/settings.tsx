// 设置全局化：Context Provider 持有唯一状态，主题变更同步到 <html data-theme>。
// 此前 App 与 Reader 各持一份 useState 导致状态不同步，且从未写入 data-theme（主题失效 bug 的根因）。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Theme } from '../shared/types.ts';
import {
  applyThemeToRoot,
  clampFont,
  loadSettings,
  persistSettings,
  themeLabel,
  THEME_ORDER,
  type SettingsState,
} from './settings-core.ts';

export { themeLabel };

interface SettingsContextValue extends SettingsState {
  setFontSize: (updater: (prev: number) => number) => void;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettingsState>(() =>
    loadSettings(localStorage),
  );

  // 主题只有写到根元素上，:root[data-theme] 的 CSS 变量才会切换
  useEffect(() => {
    applyThemeToRoot(state.theme, document.documentElement);
  }, [state.theme]);

  const apply = useCallback((next: SettingsState) => {
    persistSettings(localStorage, next);
    return next;
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      fontSize: state.fontSize,
      theme: state.theme,
      setFontSize: (updater) =>
        setState((prev) =>
          apply({ ...prev, fontSize: clampFont(updater(prev.fontSize)) }),
        ),
      setTheme: (theme) => setState((prev) => apply({ ...prev, theme })),
      cycleTheme: () =>
        setState((prev) =>
          apply({
            ...prev,
            theme:
              THEME_ORDER[(THEME_ORDER.indexOf(prev.theme) + 1) % THEME_ORDER.length],
          }),
        ),
    }),
    [state, apply],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings 必须在 SettingsProvider 内使用');
  return ctx;
}
