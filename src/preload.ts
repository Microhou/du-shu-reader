// preload：向渲染层暴露最小白名单 API（文件对话框导入 / 备份保存与恢复）
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openTextFiles: (): Promise<{ name: string; data: Uint8Array }[]> =>
    ipcRenderer.invoke('open-text-files'),

  /** 保存对话框写文件；用户取消返回 null，成功返回保存路径 */
  saveFile: (opts: {
    title?: string;
    defaultName: string;
    content: string;
    filterName?: string;
    extensions?: string[];
  }): Promise<string | null> => ipcRenderer.invoke('save-file', opts),

  /** 打开备份 JSON；用户取消或读取失败返回 null */
  openBackupFile: (): Promise<{ name: string; content: string } | null> =>
    ipcRenderer.invoke('open-backup-file'),
});
