import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLibrary, formatProgress, formatTime } from '../src/core/library.ts';
import type { KeyValueStore } from '../src/core/storage.ts';
import type { StoredMeta } from './helpers/types.ts';

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

test('addBook / listBooks / getBookContent（TXT 纯文本）', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('斗破苍穹', 'txt', { kind: 'txt', text: '正文内容' });
  assert.ok(book.id.length > 0);
  assert.equal(book.title, '斗破苍穹');
  assert.equal(book.progress, 0);
  assert.equal(book.lastReadAt, 0);
  assert.equal(book.format, 'txt');
  assert.equal(book.readSeconds, 0);

  const list = await lib.listBooks();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, book.id);
  assert.deepEqual(await lib.getBookContent(book.id), { kind: 'txt', text: '正文内容' });
  assert.equal(await lib.getBookContent('missing'), null);
});

test('EPUB 结构化 payload 原样存取', async () => {
  const lib = createLibrary(memStore());
  const payload = {
    kind: 'epub' as const,
    book: {
      chapters: [{ title: '一', path: 'c1.xhtml', html: '<p>hi</p>' }],
      toc: [{ label: '一', chapterIndex: 0 }],
      images: { 'a.png': new Uint8Array([1, 2]) },
    },
  };
  const book = await lib.addBook('样本', 'epub', payload);
  const loaded = await lib.getBookContent(book.id);
  assert.equal(loaded?.kind, 'epub');
  assert.deepEqual(loaded, payload);
});

test('saveProgress 钳制比例并更新最近阅读时间', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('A', 'txt', { kind: 'txt', text: 'a' });
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

test('addReadSeconds 累计并刷新最近阅读时间', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('A', 'txt', { kind: 'txt', text: 'a' });
  await lib.addReadSeconds(book.id, 30);
  await lib.addReadSeconds(book.id, 45);
  const list = await lib.listBooks();
  assert.equal(list[0].readSeconds, 75);
  assert.ok(list[0].lastReadAt > 0);
  assert.equal(await lib.addReadSeconds('missing', 10), null);
  assert.equal(await lib.addReadSeconds(book.id, 0), null, '非正数不写入');
});

test('标注：新增 / 列表 / 删除，删书时一并清除', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('A', 'txt', { kind: 'txt', text: 'a' });

  const mark = await lib.addAnnotation(book.id, {
    type: 'highlight',
    ratio: 0.5,
    paraIndex: 3,
    start: 2,
    end: 8,
    text: '划线内容',
  });
  const note = await lib.addAnnotation(book.id, {
    type: 'note',
    ratio: 0.6,
    text: '划线内容',
    note: '这是笔记',
  });
  assert.ok(mark.id !== note.id);
  assert.ok(mark.createdAt > 0);

  let list = await lib.listAnnotations(book.id);
  assert.equal(list.length, 2);

  assert.equal(await lib.removeAnnotation(book.id, mark.id), true);
  assert.equal(await lib.removeAnnotation(book.id, mark.id), false, '重复删除返回 false');
  list = await lib.listAnnotations(book.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'note');

  assert.equal(await lib.removeBook(book.id), true);
  assert.deepEqual(await lib.listAnnotations(book.id), []);
});

test('兼容 v0.1 旧元数据（缺 format / readSeconds）', async () => {
  const store = memStore();
  const legacy: StoredMeta[] = [
    {
      id: 'old1',
      title: '旧书',
      addedAt: 1,
      lastReadAt: 2,
      progress: 0.4,
    },
  ];
  await store.set('library', legacy);
  const lib = createLibrary(store);
  const list = await lib.listBooks();
  assert.equal(list[0].format, 'txt');
  assert.equal(list[0].readSeconds, 0);
});

test('兼容 v0.1 旧正文（裸字符串 → txt payload）', async () => {
  const store = memStore();
  await store.set('library', [
    { id: 'old1', title: '旧书', addedAt: 1, lastReadAt: 2, progress: 0.4 },
  ]);
  await store.set('book:old1', '旧版纯文本正文');
  const lib = createLibrary(store);
  assert.deepEqual(await lib.getBookContent('old1'), {
    kind: 'txt',
    text: '旧版纯文本正文',
  });
  // 新格式不受影响
  await lib.addBook('新书', 'txt', { kind: 'txt', text: '新正文' });
  assert.deepEqual(await lib.getBookContent((await lib.listBooks())[0].id), {
    kind: 'txt',
    text: '新正文',
  });
});

test('removeBook 删除元数据与正文', async () => {
  const lib = createLibrary(memStore());
  const book = await lib.addBook('A', 'txt', { kind: 'txt', text: 'a' });
  assert.equal(await lib.removeBook(book.id), true);
  assert.equal(await lib.removeBook(book.id), false, '重复删除返回 false');
  assert.deepEqual(await lib.listBooks(), []);
  assert.equal(await lib.getBookContent(book.id), null);
});

test('新书排在书架最前', async () => {
  const lib = createLibrary(memStore());
  await lib.addBook('A', 'txt', { kind: 'txt', text: 'a' });
  await lib.addBook('B', 'txt', { kind: 'txt', text: 'b' });
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
  const ts = new Date(2026, 7, 30, 9, 5).getTime();
  assert.equal(formatTime(ts), '8月30日 09:05');
});
