// 跨层共享的数据类型

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
}

/** 全局排版设置（localStorage 持久化） */
export interface Settings {
  fontSize: number;
}

/** 经 IPC / 拖拽到达渲染层的 TXT 文件（字节流，不含路径） */
export interface OpenedTextFile {
  name: string;
  data: Uint8Array;
}
