import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chapterParaRanges,
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

test('chapterParaRanges 章节段落区间', () => {
  // 章节：第一章(偏移10) → 段1；第二章(偏移25) → 段3；其后到结尾
  const paraStarts = [0, 10, 15, 25, 30, 40];
  const chapters = [
    { title: '第一章', offset: 10 },
    { title: '第二章', offset: 25 },
  ];
  assert.deepEqual(chapterParaRanges(paraStarts, chapters), [
    [0, 3],
    [3, 6],
  ]);
});

test('chapterParaRanges 首章前内容并入第 0 章', () => {
  const paraStarts = [0, 50, 100, 150];
  const chapters = [
    { title: '序', offset: 50 },
    { title: '第一章', offset: 100 },
  ];
  // 段 0（首章标记之前的内容）并入第 0 章
  assert.deepEqual(chapterParaRanges(paraStarts, chapters), [
    [0, 2],
    [2, 4],
  ]);
});

test('chapterParaRanges 无章节时整本退化为单章', () => {
  assert.deepEqual(chapterParaRanges([0, 10, 20], []), [[0, 3]]);
  assert.deepEqual(chapterParaRanges([], []), [[0, 0]]);
});
