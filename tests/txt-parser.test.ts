import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeTxt,
  normalizeText,
  parseTxt,
  titleFromFilename,
} from '../src/core/txt-parser.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

test('BOM 优先识别：UTF-8 / UTF-16LE / UTF-16BE', () => {
  assert.equal(
    decodeTxt(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('你好')])),
    '你好',
  );
  // "你" U+4F60
  assert.equal(decodeTxt(new Uint8Array([0xff, 0xfe, 0x60, 0x4f])), '你');
  assert.equal(decodeTxt(new Uint8Array([0xfe, 0xff, 0x4f, 0x60])), '你');
});

test('严格 UTF-8 解码成功则直接返回', () => {
  assert.equal(decodeTxt(utf8('hello 世界')), 'hello 世界');
});

test('GBK 字节回退 GB18030 解码', () => {
  // "你好" 的 GBK 编码
  assert.equal(decodeTxt(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3])), '你好');
  // "你好\n世界" 整体为 GBK 编码：世 CAC0，界 BDE7
  const mixed = new Uint8Array([
    0xc4, 0xe3, 0xba, 0xc3, 0x0a, 0xca, 0xc0, 0xbd, 0xe7,
  ]);
  assert.equal(decodeTxt(mixed), '你好\n世界');
});

test('normalizeText 规整换行', () => {
  assert.equal(normalizeText('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(normalizeText('a\n\n\n\n\nb'), 'a\n\n\nb');
  assert.equal(normalizeText('  \n a b \n '), 'a b');
});

test('titleFromFilename 提取书名', () => {
  assert.equal(titleFromFilename('斗破苍穹.txt'), '斗破苍穹');
  assert.equal(titleFromFilename('Novel.TXT'), 'Novel');
  assert.equal(titleFromFilename('  '), '未命名');
  assert.equal(titleFromFilename(null), '未命名');
});

test('parseTxt 组合解码与规整', () => {
  // GBK 编码的 "你好\r\n世界"：世 CAC0，界 BDE7
  const gbk = new Uint8Array([
    0xc4, 0xe3, 0xba, 0xc3, 0x0d, 0x0a, 0xca, 0xc0, 0xbd, 0xe7,
  ]);
  const parsed = parseTxt(gbk, '测试书.txt');
  assert.deepEqual(parsed, { title: '测试书', content: '你好\n世界' });
});
