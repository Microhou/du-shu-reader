import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ZipArchive } from '../src/core/zip.ts';
import { buildZip } from './helpers/zip-writer.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

test('读取 STORE 与 DEFLATE 混合条目', async () => {
  const a = utf8('hello zip');
  const b = utf8('压缩内容'.repeat(100));
  const zipBytes = buildZip([
    { name: 'a.txt', data: a },
    { name: 'dir/b.txt', data: b, compress: true },
  ]);

  const zip = ZipArchive.open(zipBytes);
  assert.equal(zip.entries.length, 2);
  assert.deepEqual(
    zip.entries.map((e) => e.name).sort(),
    ['a.txt', 'dir/b.txt'],
  );

  const ea = zip.entry('a.txt')!;
  assert.equal(ea.method, 0);
  assert.equal(Buffer.from(await zip.read(ea)).toString('utf8'), 'hello zip');

  const eb = zip.entry('dir/b.txt')!;
  assert.equal(eb.method, 8);
  assert.equal(eb.size, b.length);
  assert.equal(Buffer.from(await zip.read(eb)).toString('utf8'), Buffer.from(b).toString('utf8'));
});

test('entry 大小与偏移解析正确（多个条目连续排列）', () => {
  const zipBytes = buildZip([
    { name: 'one', data: utf8('12345') },
    { name: 'two', data: utf8('x'.repeat(50)), compress: true },
    { name: 'three', data: utf8('y'.repeat(5)) },
  ]);
  const zip = ZipArchive.open(zipBytes);
  assert.equal(zip.entries.length, 3);
  assert.equal(zip.entry('one')!.size, 5);
  assert.equal(zip.entry('two')!.size, 50);
  assert.equal(zip.entry('three')!.size, 5);
  assert.equal(zip.entry('missing'), undefined);
});

test('非 ZIP 输入抛出可读错误', () => {
  assert.throws(() => ZipArchive.open(utf8('not a zip at all....')), /EOCD/);
});
