// 渲染层单例书库（IndexedDB 介质）
import { createLibrary } from '../core/library.ts';
import { idbStorage } from '../core/storage.ts';

export const library = createLibrary(idbStorage);
