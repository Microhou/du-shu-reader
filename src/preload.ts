// preload：向渲染层暴露最小白名单 API（当前仅文件对话框导入）
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openTextFiles: (): Promise<{ name: string; data: Uint8Array }[]> =>
    ipcRenderer.invoke('open-text-files'),
});
