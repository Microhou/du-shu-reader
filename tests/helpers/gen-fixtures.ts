// 生成 GUI 验收用样本：多章节 EPUB + 最小 PDF（输出到 %TEMP%）
import { deflateRawSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildZip } from './zip-writer.ts';

const tmp = process.env.TEMP!;

/* ---------- EPUB：3 章 + 目录 + 图片 ---------- */

const chapter = (n: number, paras: number) => {
  let body = '';
  for (let i = 0; i < paras; i++) {
    body += `<p>这是第${n}章的第${i + 1}个段落。夜色如墨，山风卷着落叶掠过青石长街，少年握紧手中的旧剑。</p>\n`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第${n}章 测试章节</title></head>
<body><h1>第${n}章 测试章节</h1>${body}<img src="images/dot.png" alt="dot"/></body></html>`;
};

const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <manifest>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="img" href="images/dot.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine>
</package>`;

const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
<li><a href="c1.xhtml">第一章 风起</a></li>
<li><a href="c2.xhtml">第二章 云涌</a></li>
<li><a href="c3.xhtml">第三章 归途</a></li>
</ol></nav></body></html>`;

  // 真实可解码的 1x1 PNG（深蓝色）
  const dotPng = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  const epubBytes = buildZip([
    { name: 'mimetype', data: new TextEncoder().encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: new TextEncoder().encode(container), compress: true },
    { name: 'OEBPS/content.opf', data: new TextEncoder().encode(opf), compress: true },
    { name: 'OEBPS/nav.xhtml', data: new TextEncoder().encode(nav), compress: true },
    { name: 'OEBPS/c1.xhtml', data: new TextEncoder().encode(chapter(1, 30)), compress: true },
    { name: 'OEBPS/c2.xhtml', data: new TextEncoder().encode(chapter(2, 40)), compress: true },
    { name: 'OEBPS/c3.xhtml', data: new TextEncoder().encode(chapter(3, 20)), compress: true },
    { name: 'OEBPS/images/dot.png', data: dotPng, compress: true },
  ]);
writeFileSync(join(tmp, 'sample-book.epub'), epubBytes);
console.log('EPUB:', join(tmp, 'sample-book.epub'), epubBytes.length, 'bytes');

/* ---------- PDF：5 页，每页大号 ASCII 标题 ---------- */

function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

const pages: string[] = [];
for (let p = 1; p <= 5; p++) {
  pages.push(
    `BT /F1 28 Tf 72 700 Td (Sample PDF - Page ${p} of 5) Tj ET\n` +
      `BT /F1 14 Tf 72 650 Td (${escapePdfText('The quick brown fox jumps over the lazy dog.')}) Tj ET\n` +
      `BT /F1 14 Tf 72 620 Td (${escapePdfText(`Rendered line ${p}: 0123456789`)}) Tj ET`,
  );
}

const objects: string[] = [];
const pageObjNums: number[] = [];
// 1: Catalog, 2: Pages, then per page: content obj + page obj, font last
let next = 3;
for (let i = 0; i < pages.length; i++) {
  const contentNum = next++;
  const pageNum = next++;
  pageObjNums.push(pageNum);
  const stream = pages[i];
  objects[contentNum] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  objects[pageNum] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${next} 0 R >> >> >>`;
}
const fontNum = next++;
objects[fontNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`;

let pdf = '%PDF-1.4\n';
const offsets: number[] = [];
for (let i = 1; i < objects.length; i++) {
  if (objects[i] === undefined) continue;
  offsets[i] = pdf.length;
  pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefStart = pdf.length;
const maxObj = objects.length - 1;
pdf += `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= maxObj; i++) {
  const off = offsets[i] ?? 0;
  pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

writeFileSync(join(tmp, 'sample-doc.pdf'), pdf, 'latin1');
console.log('PDF:', join(tmp, 'sample-doc.pdf'), pdf.length, 'bytes');
