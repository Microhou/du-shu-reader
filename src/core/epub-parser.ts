// EPUB 解析：容器 → OPF → spine 章节 + 目录（nav/NCX）+ 图片资源。
// XML 结构固定且简单，用正则提取即可满足 MVP；章节 HTML 在渲染层消毒后使用。
import type { EpubBook, EpubChapter, EpubTocItem } from '../shared/types.ts';
import { ZipArchive } from './zip.ts';

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

function tagInner(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : null;
}

/** base 目录 + 相对 href → zip 内规范化路径（POSIX、已 URL 解码、去锚点） */
export function resolveZipPath(baseDir: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]);
  const parts = (baseDir ? baseDir.split('/') : []).concat(clean.split('/'));
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function extractTitle(raw: string, index: number): string {
  const raw1 =
    raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    raw.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
  const clean = raw1 ? stripTags(raw1).trim() : '';
  return clean || `第 ${index + 1} 节`;
}

function extractBody(raw: string): string {
  return (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? raw).trim();
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

export async function parseEpub(data: Uint8Array): Promise<EpubBook> {
  const zip = ZipArchive.open(data);

  const containerEntry = zip.entry('META-INF/container.xml');
  if (!containerEntry) throw new Error('EPUB: 缺少 META-INF/container.xml');
  const container = decode(await zip.read(containerEntry));
  const opfPath = container.match(/full-path\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!opfPath) throw new Error('EPUB: container.xml 未声明 rootfile');

  const opfEntry = zip.entry(opfPath);
  if (!opfEntry) throw new Error(`EPUB: 缺少 OPF（${opfPath}）`);
  const opf = decode(await zip.read(opfEntry));
  const opfDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/'))
    : '';
  const resolve = (href: string) => resolveZipPath(opfDir, href);

  // manifest
  const manifest = new Map<string, ManifestItem>();
  for (const tag of opf.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      href,
      mediaType: attr(tag, 'media-type') ?? '',
      properties: attr(tag, 'properties') ?? '',
    });
  }

  // spine 顺序
  const spineXml = tagInner(opf, 'spine') ?? '';
  const spineIds = [
    ...spineXml.matchAll(/<itemref\b[^>]*>/gi),
  ]
    .map((m) => attr(m[0], 'idref'))
    .filter((x): x is string => !!x);

  const chapters: EpubChapter[] = [];
  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item || !/xhtml|html/i.test(item.mediaType)) continue;
    const path = resolve(item.href);
    const entry = zip.entry(path);
    if (!entry) continue;
    const raw = decode(await zip.read(entry));
    chapters.push({
      title: extractTitle(raw, chapters.length),
      path,
      html: extractBody(raw),
    });
  }
  if (chapters.length === 0) throw new Error('EPUB: spine 中没有可读章节');

  const chapterIndexByPath = new Map(chapters.map((c, i) => [c.path, i]));
  const indexFor = (href: string): number | null =>
    chapterIndexByPath.get(resolve(href)) ?? null;

  // 目录：EPUB3 nav 优先，其次 EPUB2 NCX，最后退化为章节标题
  let toc: EpubTocItem[] = [];
  const navItem = [...manifest.values()].find((i) => /\bnav\b/.test(i.properties));
  if (navItem) {
    const path = resolve(navItem.href);
    const entry = zip.entry(path);
    if (entry) {
      const navHtml = decode(await zip.read(entry));
      const scope = /epub:type/i.test(navHtml)
        ? (navHtml.match(/<nav\b[^>]*epub:type\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? navHtml)
        : navHtml;
      for (const m of scope.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const idx = indexFor(m[1]);
        const label = stripTags(m[2]).trim();
        if (idx !== null && label) toc.push({ label, chapterIndex: idx });
      }
    }
  }
  if (toc.length === 0) {
    const ncxItem = [...manifest.values()].find(
      (i) => i.mediaType === 'application/x-dtbncx+xml',
    );
    if (ncxItem) {
      const path = resolve(ncxItem.href);
      const entry = zip.entry(path);
      if (entry) {
        const ncx = decode(await zip.read(entry));
        for (const m of ncx.matchAll(
          /<navLabel\b[^>]*>[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<\/navLabel>\s*<content\b[^>]*src=["']([^"']+)["']/gi,
        )) {
          const idx = indexFor(m[2]);
          const label = stripTags(m[1]).trim();
          if (idx !== null && label) toc.push({ label, chapterIndex: idx });
        }
      }
    }
  }
  if (toc.length === 0) {
    toc = chapters.map((c, i) => ({ label: c.title, chapterIndex: i }));
  }

  // 图片资源（渲染层转 blob URL 后重写引用）
  const images: Record<string, Uint8Array> = {};
  for (const item of manifest.values()) {
    if (!item.mediaType.startsWith('image/')) continue;
    const path = resolve(item.href);
    const entry = zip.entry(path);
    if (entry) images[path] = await zip.read(entry);
  }

  return { chapters, toc, images };
}
