import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  annotationsToMarkdown,
  base64ToBytes,
  buildBackupBook,
  buildBackupFile,
  bytesToBase64,
  parseBackup,
  revivePayload,
  BACKUP_FORMAT,
} from '../src/core/backup.ts';
import type { Annotation, BookMeta, BookPayload } from '../src/shared/types.ts';

const meta = (over: Partial<BookMeta> = {}): BookMeta => ({
  id: 'b1',
  title: '测试书',
  addedAt: 1,
  lastReadAt: 2,
  progress: 0.5,
  format: 'txt',
  readSeconds: 60,
  ...over,
});

const ann = (over: Partial<Annotation>): Annotation => ({
  id: 'a1',
  type: 'highlight',
  ratio: 0.4,
  createdAt: new Date(2026, 7, 30, 10, 0).getTime(),
  ...over,
});

test('base64 与全部字节值往返一致', () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('TXT payload 备份往返一致', () => {
  const payload: BookPayload = { kind: 'txt', text: '你好\n世界' };
  const backup = buildBackupBook(meta(), payload, []);
  const revived = revivePayload(backup.payload);
  assert.deepEqual(revived, payload);
});

test('EPUB payload：图片二进制经 base64 往返无损', () => {
  const image = new Uint8Array([137, 80, 78, 71, 0, 255, 1, 254]);
  const payload: BookPayload = {
    kind: 'epub',
    book: {
      chapters: [{ title: '一', path: 'c1.xhtml', html: '<p>hi</p>' }],
      toc: [{ label: '一', chapterIndex: 0 }],
      images: { 'img/a.png': image },
    },
  };
  const backup = buildBackupBook(meta(), payload, []);
  // 备份形态里图片必须是 base64 字符串（回归：Uint8Array 直接序列化会丢成 {}）
  const images = (
    JSON.parse(JSON.stringify(backup)) as {
      payload: { book: { images: Record<string, unknown> } };
    }
  ).payload.book.images;
  assert.equal(typeof images['img/a.png'], 'string');
  assert.ok((images['img/a.png'] as string).length > 0);
  const revived = revivePayload((JSON.parse(json) as { payload: never }).payload);
  assert.deepEqual(revived, payload);
});

test('PDF payload：二进制经 base64 往返无损', () => {
  const data = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);
  const payload: BookPayload = { kind: 'pdf', data };
  const json = JSON.stringify(buildBackupBook(meta(), payload, []));
  const revived = revivePayload((JSON.parse(json) as { payload: never }).payload);
  assert.deepEqual(revived, payload);
});

test('buildBackupFile 文档形状与 parseBackup 校验', () => {
  const file = buildBackupFile([
    buildBackupBook(meta(), { kind: 'txt', text: '正文' }, [
      ann({ type: 'note', text: '摘录', note: '想法' }),
    ]),
  ]);
  const parsed = parseBackup(JSON.stringify(file));
  assert.equal(parsed.format, BACKUP_FORMAT);
  assert.equal(parsed.books.length, 1);
  assert.deepEqual(parsed.books[0].annotations[0].note, '想法');

  assert.throws(() => parseBackup('{"format":"other"}'), /备份文件/);
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ ...file, version: 99 }),
      ),
    /备份版本/,
  );
});

test('annotationsToMarkdown：排序、位置、笔记与空标注', () => {
  const empty = annotationsToMarkdown(meta(), []);
  assert.equal(empty, null);

  const md = annotationsToMarkdown(
    meta({ title: '我的书' }),
    [
      ann({ id: 'a2', ratio: 0.8, type: 'note', text: '后面的摘录', note: '越往后越重要' }),
      ann({ id: 'a1', ratio: 0.2, type: 'highlight', text: '前面的摘录' }),
      ann({ id: 'a3', ratio: 0.5, type: 'bookmark' }),
      ann({ id: 'a4', ratio: 0.9, type: 'highlight', page: 42, text: 'PDF 摘录' }),
    ],
  )!;

  assert.ok(md.startsWith('# 《我的书》 标注导出'));
  // 按进度升序：a1(0.2) 在 a2(0.8) 之前
  assert.ok(md.indexOf('前面的摘录') < md.indexOf('后面的摘录'));
  assert.ok(md.includes('**想法**：越往后越重要'));
  assert.ok(md.includes('（第 42 页）'), 'PDF 标注带页码');
  assert.ok(md.includes('（进度 20%）'), '非 PDF 标注带进度');
  assert.ok(!md.includes('undefined'));
});
