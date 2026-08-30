import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, todayKey } from '../src/core/stats.ts';

test('formatDuration 文案', () => {
  assert.equal(formatDuration(0), '未读');
  assert.equal(formatDuration(30), '不足 1 分钟');
  assert.equal(formatDuration(60), '1 分钟');
  assert.equal(formatDuration(125 * 60), '2 小时 5 分钟');
  assert.equal(formatDuration(3 * 3600), '3 小时 0 分钟');
  assert.equal(formatDuration(-5), '未读');
});

test('todayKey 本地日期格式', () => {
  assert.equal(todayKey(new Date(2026, 7, 30)), '2026-08-30');
  assert.equal(todayKey(new Date(2026, 0, 5)), '2026-01-05');
});
