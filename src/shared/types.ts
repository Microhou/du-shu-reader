// 跨层共享的数据类型

/** 书籍格式 */
export type BookFormat = 'txt' | 'epub' | 'pdf';

/** 阅读主题 */
export type Theme = 'paper' | 'green' | 'dark';

/** 书目元数据 */
export interface BookMeta {
  id: string;
  title: string;
  /** 导入时间戳（ms） */
  addedAt: number;
  /** 最近阅读时间戳（ms），0 表示从未读过 */
  lastReadAt: number;
  /** 阅读进度，滚动比例 0-1 */
  progress: number;
  format: BookFormat;
  /** 累计阅读时长（秒） */
  readSeconds: number;
}

/** 全局排版设置（localStorage 持久化） */
export interface Settings {
  fontSize: number;
  theme: Theme;
}

/** 经 IPC / 拖拽到达渲染层的文件（字节流，不含路径） */
export interface OpenedTextFile {
  name: string;
  data: Uint8Array;
}

/* ---------- EPUB 解析产物（纯数据，可存入 IndexedDB） ---------- */

export interface EpubChapter {
  /** 章节标题（<title> / 标题标签 / 兜底命名） */
  title: string;
  /** zip 内规范化路径，图片引用解析的基准 */
  path: string;
  /** <body> 内 HTML 片段（渲染前需经渲染层消毒） */
  html: string;
}

export interface EpubTocItem {
  label: string;
  chapterIndex: number;
}

export interface EpubBook {
  chapters: EpubChapter[];
  toc: EpubTocItem[];
  /** 图片资源：zip 内规范化路径 → 字节 */
  images: Record<string, Uint8Array>;
}

/* ---------- 书籍内容的存储形态 ---------- */

export type BookPayload =
  | { kind: 'txt'; text: string }
  | { kind: 'epub'; book: EpubBook }
  | { kind: 'pdf'; data: Uint8Array };

/* ---------- 标注：书签 / 划线 / 笔记 ---------- */

export type AnnotationType = 'bookmark' | 'highlight' | 'note';

export interface Annotation {
  id: string;
  type: AnnotationType;
  /** 创建时的整书滚动比例（0-1），兜底跳转用 */
  ratio: number;
  createdAt: number;
  /** 仅 TXT：段落全局索引与段内 [start, end) 区间，用于内联渲染与精确跳转 */
  paraIndex?: number;
  start?: number;
  end?: number;
  /** 划线/笔记的原文摘录 */
  text?: string;
  /** 笔记内容 */
  note?: string;
}

export interface AnnotationInput {
  type: AnnotationType;
  ratio: number;
  paraIndex?: number;
  start?: number;
  end?: number;
  text?: string;
  note?: string;
}
