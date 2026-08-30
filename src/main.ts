// 主进程：窗口生命周期 + 文件对话框 + fs 读取
// 安全基线：contextIsolation / sandbox 开启，Node 集成关闭，不加载远程内容
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import started from 'electron-squirrel-startup';

// Squirrel.Windows 安装/卸载时的快捷方式处理
if (started) {
  app.quit();
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 760,
    minHeight: 540,
    title: '读书阅读器',
    backgroundColor: '#f6f1e7',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.whenReady().then(() => {
  ipcMain.handle('open-text-files', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 TXT 文件',
      buttonLabel: '导入',
      filters: [{ name: '文本文档', extensions: ['txt'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const files: { name: string; data: Uint8Array }[] = [];
    for (const filePath of result.filePaths) {
      try {
        files.push({
          name: path.basename(filePath),
          data: await readFile(filePath),
        });
      } catch {
        // 单个文件读取失败不阻塞其余导入
      }
    }
    return files;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
