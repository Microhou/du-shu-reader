// 设置（字号/主题）加载、持久化与主题 DOM 应用：纯逻辑单测
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyThemeToRoot,
  clampFont,
  isTheme,
  loadSettings,
  persistSettings,
} from '../src/renderer/settings-core.ts';

function memStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    snapshot: () => map,
  };
}

test('loadSettings：空/损坏存储回退默认值', () => {
  assert.deepEqual(loadSettings(memStorage()), { fontSize: 18, theme: 'paper' });
  const broken = memStorage({ 'dushu:settings': '{{{' });
  assert.deepEqual(loadSettings(broken), { fontSize: 18, theme: 'paper' });
});

test('loadSettings：合法值读取与非法字段忽略/钳制', () => {
  const s = memStorage({
    'dushu:settings': JSON.stringify({ fontSize: 22, theme: 'dark' }),
  });
  assert.deepEqual(loadSettings(s), { fontSize: 22, theme: 'dark' });

  const outOfRange = memStorage({
    'dushu:settings': JSON.stringify({ fontSize: 999, theme: 'hacker' }),
  });
  assert.deepEqual(loadSettings(outOfRange), { fontSize: 30, theme: 'paper' });
});

test('persistSettings 与 loadSettings 往返一致', () => {
  const s = memStorage();
  persistSettings(s, { fontSize: 20, theme: 'green' });
  assert.deepEqual(loadSettings(s), { fontSize: 20, theme: 'green' });
});

test('applyThemeToRoot 把主题写到 data-theme', () => {
  const root = { dataset: {} as Record<string, string> };
  applyThemeToRoot('dark', root);
  assert.equal(root.dataset.theme, 'dark');
  applyThemeToRoot('paper', root);
  assert.equal(root.dataset.theme, 'paper');
});

test('clampFont / isTheme 边界', () => {
  assert.equal(clampFont(10), 14);
  assert.equal(clampFont(18.6), 19);
  assert.equal(clampFont(40), 30);
  assert.equal(isTheme('green'), true);
  assert.equal(isTheme('blue'), false);
});
