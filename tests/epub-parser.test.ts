import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEpub, resolveZipPath } from '../src/core/epub-parser.ts';
import { buildZip } from './helpers/zip-writer.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="c1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="img" href="images/logo.png" media-type="image/png"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`;

const CHAP1 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章 风起</title></head>
<body><h1>第一章 风起</h1><p>夜色如墨。</p><img src="images/logo.png" alt="logo"/></body></html>`;

const CHAP2 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章 云涌</title></head>
<body><p>山雨欲来。</p></body></html>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
  <li><a href="chap2.xhtml">第二章 · 云涌</a></li>
  <li><a href="chap1.xhtml">第一章 · 风起</a></li>
</ol></nav></body></html>`;

function sampleEpub(): Uint8Array {
  return buildZip([
    { name: 'mimetype', data: utf8('application/epub+zip') },
    { name: 'META-INF/container.xml', data: utf8(CONTAINER), compress: true },
    { name: 'OEBPS/content.opf', data: utf8(OPF), compress: true },
    { name: 'OEBPS/chap1.xhtml', data: utf8(CHAP1), compress: true },
    { name: 'OEBPS/chap2.xhtml', data: utf8(CHAP2), compress: true },
    { name: 'OEBPS/nav.xhtml', data: utf8(NAV), compress: true },
    { name: 'OEBPS/images/logo.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
  ]);
}

test('resolveZipPath 相对路径解析', () => {
  assert.equal(resolveZipPath('OEBPS', 'chap1.xhtml'), 'OEBPS/chap1.xhtml');
  assert.equal(resolveZipPath('OEBPS/text', '../images/a.png'), 'OEBPS/images/a.png');
  assert.equal(resolveZipPath('', 'a/b.xhtml'), 'a/b.xhtml');
  assert.equal(resolveZipPath('OEBPS', 'chap1.xhtml#frag'), 'OEBPS/chap1.xhtml');
  assert.equal(
    resolveZipPath('a', encodeURIComponent('中文名.png')),
    'a/中文名.png',
  );
});

test('parseEpub：章节、目录（nav 优先）、图片', async () => {
  const book = await parseEpub(sampleEpub());

  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].title, '第一章 风起');
  assert.equal(book.chapters[0].path, 'OEBPS/chap1.xhtml');
  assert.ok(book.chapters[0].html.includes('<p>夜色如墨。</p>'));
  assert.ok(!book.chapters[0].html.includes('<body'), '应只保留 body 内片段');
  assert.equal(book.chapters[1].title, '第二章 云涌');

  // 目录按 nav 中的顺序（第二章在前）
  assert.deepEqual(book.toc, [
    { label: '第二章 · 云涌', chapterIndex: 1 },
    { label: '第一章 · 风起', chapterIndex: 0 },
  ]);

  assert.deepEqual(
    Array.from(book.images['OEBPS/images/logo.png']),
    [137, 80, 78, 71, 1, 2, 3],
  );
});

test('parseEpub：无 nav/NCX 时目录退化为章节标题', async () => {
  const opfNoNav = OPF.replace(
    /<item id="nav"[^/]*\/>/,
    '',
  );
  const container = CONTAINER;
  const bytes = buildZip([
    { name: 'META-INF/container.xml', data: utf8(container) },
    { name: 'OEBPS/content.opf', data: utf8(opfNoNav), compress: true },
    { name: 'OEBPS/chap1.xhtml', data: utf8(CHAP1), compress: true },
    { name: 'OEBPS/chap2.xhtml', data: utf8(CHAP2), compress: true },
  ]);
  const book = await parseEpub(bytes);
  assert.deepEqual(
    book.toc.map((t) => [t.label, t.chapterIndex]),
    [
      ['第一章 风起', 0],
      ['第二章 云涌', 1],
    ],
  );
});

test('parseEpub：非 EPUB 输入抛错', async () => {
  await assert.rejects(parseEpub(utf8('plain text')), /EPUB|ZIP/);
});
