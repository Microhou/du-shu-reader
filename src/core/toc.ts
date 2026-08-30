// TXT 章节识别：整行匹配“第X章/回/节/卷……”样式，输出字符偏移供目录跳转

export interface TxtChapter {
  title: string;
  /** 章节标题行在全文中的字符偏移 */
  offset: number;
}

const CHAPTER_LINE =
  /^[ \t\u3000]*(第\s*[0-9〇零一二三四五六七八九十百千万两]+\s*[章回节卷集部篇][^\n]*)$/;
const EXTRA_LINE =
  /^[ \t\u3000]*(楔子|序章|序言|自序|前言|引子|后记|尾声|终章|番外)[^\n]*$/;

export function parseTxtChapters(content: string): TxtChapter[] {
  const chapters: TxtChapter[] = [];
  let offset = 0;
  for (const line of content.split('\n')) {
    const candidate = line.replace(/\r$/, '');
    if (CHAPTER_LINE.test(candidate) || EXTRA_LINE.test(candidate)) {
      chapters.push({ title: candidate.trim(), offset });
    }
    offset += line.length + 1;
  }
  return chapters;
}

/** 二分查找：最后一个 start <= charOffset 的段落下标（用于章节 → 段落定位） */
export function findParaIndexForOffset(
  paraStarts: number[],
  charOffset: number,
): number {
  let lo = 0;
  let hi = paraStarts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (paraStarts[mid] <= charOffset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
