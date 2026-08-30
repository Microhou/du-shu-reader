// 主进程：窗口生命周期 + 文件对话框 + fs 读取
// 安全基线：contextIsolation / sandbox 开启，Node 集成关闭，不加载远程内容
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
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
      title: '导入电子书',
      buttonLabel: '导入',
      filters: [{ name: '电子书', extensions: ['txt', 'epub', 'pdf'] }],
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

  ipcMain.handle(
    'save-file',
    async (
      _event,
      opts: {
        title?: string;
        defaultName: string;
        content: string;
        filterName?: string;
        extensions?: string[];
      },
    ): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: opts.title ?? '保存文件',
        defaultPath: opts.defaultName,
        filters: [
          {
            name: opts.filterName ?? '文件',
            extensions: opts.extensions ?? ['txt'],
          },
        ],
      });
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, opts.content, 'utf8');
      return result.filePath;
    },
  );

  ipcMain.handle('open-backup-file', async (): Promise<{ name: string; content: string } | null> => {
    const result = await dialog.showOpenDialog({
      title: '导入备份',
      buttonLabel: '导入',
      filters: [{ name: '读书备份', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    try {
      return {
        name: path.basename(result.filePaths[0]),
        content: await readFile(result.filePaths[0], 'utf8'),
      };
    } catch {
      return null;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
