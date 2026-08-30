import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  maxScroll,
  offsetToPage,
  offsetToRatio,
  pageToOffset,
  pageCount,
  ratioToOffset,
} from '../src/core/pager.ts';

test('maxScroll', () => {
  assert.equal(maxScroll(1000, 400), 600);
  assert.equal(maxScroll(300, 400), 0);
  assert.equal(maxScroll(400, 400), 0);
});

test('offsetToRatio 换算与边界钳制', () => {
  assert.equal(offsetToRatio(300, 1000, 400), 0.5);
  assert.equal(offsetToRatio(-5, 1000, 400), 0);
  assert.equal(offsetToRatio(999, 1000, 400), 1);
  assert.equal(offsetToRatio(0, 400, 400), 1, '一屏放得下视为读完');
});

test('ratioToOffset 换算与边界钳制', () => {
  assert.equal(ratioToOffset(0.5, 1000, 400), 300);
  assert.equal(ratioToOffset(0, 1000, 400), 0);
  assert.equal(ratioToOffset(2, 1000, 400), 600);
  assert.equal(ratioToOffset(-1, 1000, 400), 0);
});

test('pageCount', () => {
  assert.equal(pageCount(1200, 400), 3);
  assert.equal(pageCount(1000, 400), 3);
  assert.equal(pageCount(100, 400), 1);
  assert.equal(pageCount(100, 0), 1, '视口为 0 时兜底');
});

test('offsetToPage', () => {
  assert.equal(offsetToPage(0, 1200, 400), 1);
  assert.equal(offsetToPage(400, 1200, 400), 2);
  assert.equal(offsetToPage(801, 1200, 400), 3);
  assert.equal(offsetToPage(5000, 1200, 400), 3, '越界钳制到最后一页');
});

test('pageToOffset 与 offsetToPage 往返一致', () => {
  assert.equal(pageToOffset(1, 1200, 400), 0);
  assert.equal(pageToOffset(2, 1200, 400), 400);
  assert.equal(pageToOffset(9, 1200, 400), 800, '越界钳制到最后可滚动位置');
  for (let page = 1; page <= 3; page++) {
    const offset = pageToOffset(page, 1200, 400);
    assert.equal(offsetToPage(offset, 1200, 400), page);
  }
});
