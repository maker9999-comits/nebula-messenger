const { app, BrowserWindow, Menu, shell } = require('electron');

const APP_URL = 'https://nebula-1337.web.app';

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 420,
    minHeight: 600,
    title: 'Nebula Messenger',
    backgroundColor: '#0e1116',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      sandbox: true
    }
  });

  win.loadURL(APP_URL);

  win.once('ready-to-show', () => win.show());

  // Не даём открывать DevTools из приложения
  win.webContents.on('devtools-opened', () => {
    try { win.webContents.closeDevTools(); } catch (e) {}
  });

  // Внешние ссылки открываем в системном браузере, а не в окне приложения
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== APP_URL && !url.startsWith(APP_URL + '/')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow = win;
  return win;
}

// Только один экземпляр приложения
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
