import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer } from 'electron';
import path from 'path';

// Desabilita aceleração de hardware se causar problemas
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'Chat App',
    // Frame customizado para visual moderno
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#131524',
      symbolColor: '#8b91a7',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false, // Segurança: não expõe Node no renderer
    },
    backgroundColor: '#131524',
    show: false, // Mostra só quando pronto (evita flash branco)
  });

  // Mostra window só quando conteúdo estiver pronto
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Abre links externos no browser do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dev: carrega o Vite dev server / Prod: carrega o build
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

app.whenReady().then(() => {
  // Permite que o renderer use getDisplayMedia para compartilhar a tela (Windows)
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources.length === 0) { callback({}); return; }
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => callback({}));
  });


  // CSP apenas em produção — em dev o Vite precisa de HMR/websocket/inline scripts
  if (!process.env.VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
            " script-src 'self';" +
            " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
            " font-src 'self' https://fonts.gstatic.com;" +
            " connect-src 'self' https://zynk.fooyer.space ws://zynk.fooyer.space wss://zynk.fooyer.space;" +
            " img-src 'self' data:;"
          ],
        },
      });
    });
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
