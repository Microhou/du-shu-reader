import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLibrary, formatProgress, formatTime } from '../src/core/library.ts';
import type { KeyValueStore } from '../src/core/storage.ts';

function memStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T,>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => {
      map.set(key, value);
    },
    del: async (key) => {
      map.delete(key);
    },
  };
}

test('addBook / listBooks / getBookContent', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('斗破苍穹', '正文内容');
  assert.ok(book.id.length > 0);
  assert.equal(book.title, '斗破苍穹');
  assert.equal(book.progress, 0);
  assert.equal(book.lastReadAt, 0);

  const list = await lib.listBooks();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, book.id);
  assert.equal(await lib.getBookContent(book.id), '正文内容');
  assert.equal(await lib.getBookContent('missing'), null);
});

test('saveProgress 钳制比例并更新最近阅读时间', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('A', 'a');
  await new Promise((r) => setTimeout(r, 5));

  const updated = await lib.saveProgress(book.id, 1.7);
  assert.ok(updated);
  assert.equal(updated.progress, 1);
  assert.ok(updated.lastReadAt > 0);

  const clampedLow = await lib.saveProgress(book.id, -0.5);
  assert.ok(clampedLow);
  assert.equal(clampedLow.progress, 0);

  assert.equal(await lib.saveProgress('missing', 0.5), null);
});

test('removeBook 删除元数据与正文', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('A', 'a');
  assert.equal(await lib.removeBook(book.id), true);
  assert.equal(await lib.removeBook(book.id), false, '重复删除返回 false');
  assert.deepEqual(await lib.listBooks(), []);
  assert.equal(await lib.getBookContent(book.id), null);
});

test('新书排在书架最前', async () => {
  const lib = createLibrary(memStore());
  await lib.addBook('A', 'a');
  await lib.addBook('B', 'b');
  const list = await lib.listBooks();
  assert.deepEqual(
    list.map((b) => b.title),
    ['B', 'A'],
  );
});

test('formatProgress / formatTime 文案', () => {
  assert.equal(formatProgress(0), '未读');
  assert.equal(formatProgress(0.456), '45%');
  assert.equal(formatProgress(1), '100%');
  assert.equal(formatTime(0), '—');
  // 用本地时间构造，避免时区影响
  const ts = new Date(2026, 7, 30, 9, 5).getTime();
  assert.equal(formatTime(ts), '8月30日 09:05');
});
