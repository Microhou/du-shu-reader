// EPUB 章节 HTML 消毒与图片重写（渲染层，依赖 DOMParser）
import { resolveZipPath } from '../core/epub-parser.ts';

const DANGEROUS_TAGS = 'script, style, iframe, object, embed, link, meta, form, base';

/**
 * 清洗章节 HTML：去脚本/事件属性/javascript: 链接，去除站内跳转 href，
 * 并把相对路径图片重写为传入的 blob URL（未命中则移除）。
 */
export function prepareChapterHtml(
  html: string,
  chapterPath: string,
  imageUrls: Map<string, string>,
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const el of [...doc.querySelectorAll(DANGEROUS_TAGS)]) el.remove();

  for (const el of [...doc.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === 'href' || name === 'src' || name === 'xlink:href') &&
        attr.value.trim().toLowerCase().startsWith('javascript:')
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  // 站内链接在阅读器里没有落地页，去掉 href 保留文字
  for (const a of [...doc.querySelectorAll('a[href]')]) {
    a.removeAttribute('href');
  }

  const baseDir = chapterPath.includes('/')
    ? chapterPath.slice(0, chapterPath.lastIndexOf('/'))
    : '';
  const rewrite = (el: Element, source: string): boolean => {
    const url = imageUrls.get(resolveZipPath(baseDir, source));
    if (!url) {
      el.remove();
      return true;
    }
    el.setAttribute('src', url);
    return true;
  };
  for (const img of [...doc.querySelectorAll('img[src]')]) {
    rewrite(img, img.getAttribute('src')!);
  }
  // SVG 内嵌图片（EPUB 封面/插图常见）
  for (const img of [...doc.querySelectorAll('image')]) {
    const src = img.getAttribute('xlink:href') ?? img.getAttribute('href');
    if (src) rewrite(img, src);
  }

  return doc.body.innerHTML;
}
