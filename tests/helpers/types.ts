// 测试辅助：v0.1 旧版书架元数据形态（缺 format / readSeconds）
import type { BookMeta } from '../../src/shared/types.ts';

export type StoredMeta = Omit<BookMeta, 'format' | 'readSeconds'> &
  Partial<Pick<BookMeta, 'format' | 'readSeconds'>>;
