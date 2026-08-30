import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findParaIndexForOffset,
  parseTxtChapters,
} from '../src/core/toc.ts';

test('parseTxtChapters 识别常见章节行', () => {
  const content = [
    '开篇的话',
    '第一章 风起青萍',
    '正文甲',
    '第12章 山雨欲来',
    '他说起第三章的往事，但这是正文行',
    '第一百章 大结局',
    '',
    '楔子',
  ].join('\n');

  const chapters = parseTxtChapters(content);
  assert.deepEqual(
    chapters.map((c) => c.title),
    ['第一章 风起青萍', '第12章 山雨欲来', '第一百章 大结局', '楔子'],
  );
  // 偏移 = 之前所有行（含换行）的长度和
  assert.equal(chapters[0].offset, '开篇的话\n'.length);
  assert.equal(chapters[1].offset, content.indexOf('第12章'));
});

test('parseTxtChapters 处理 CRLF 与空白缩进', () => {
  const content = '  \u3000第一章 开始\r\n正文\r\n  第二章 继续\r\n';
  const chapters = parseTxtChapters(content);
  assert.deepEqual(
    chapters.map((c) => c.title),
    ['第一章 开始', '第二章 继续'],
  );
});

test('parseTxtChapters 无章节时返回空数组', () => {
  assert.deepEqual(parseTxtChapters('没有任何章节标记的正文'), []);
});

test('findParaIndexForOffset 二分定位', () => {
  const starts = [0, 10, 20, 35];
  assert.equal(findParaIndexForOffset(starts, 0), 0);
  assert.equal(findParaIndexForOffset(starts, 9), 0);
  assert.equal(findParaIndexForOffset(starts, 10), 1);
  assert.equal(findParaIndexForOffset(starts, 34), 2);
  assert.equal(findParaIndexForOffset(starts, 100), 3, '越界钳到最后一段');
  assert.equal(findParaIndexForOffset([], 5), 0, '空数组兜底');
});
