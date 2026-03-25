import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer, Tray, Menu, nativeImage, type DesktopCapturerSource } from 'electron';
import path from 'path';
import {
  createVirtualGamepad,
  updateVirtualGamepad,
  destroyVirtualGamepad,
  isAvailable as isGamepadAvailable,
  cleanup as cleanupGamepad,
  type GamepadInputState,
} from './gamepadEmulator';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pendingScreenSource: DesktopCapturerSource | null = null;

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(__dirname, '..', 'build', 'icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'Zynk',
    icon: getIconPath(),
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
      nodeIntegration: false,
    },
    backgroundColor: '#131524',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

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

// ─── Screen Sharing via IPC ────────────────────────────────────
// Abordagem direta: renderer pede sources, escolhe, e pede o stream ID.
// Sem setDisplayMediaRequestHandler. Usa desktopCapturer no main e retorna
// o sourceId para o renderer criar o stream via getUserMedia com chromeMediaSource.

ipcMain.handle('screen:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      isScreen: s.id.startsWith('screen:'),
    }));
  } catch (e) {
    console.error('[screen:get-sources] Erro:', e);
    return [];
  }
});

// Renderer escolheu um source — busca o objeto real e guarda para o handler usar
ipcMain.handle('screen:select-source', async (_event, sourceId: string) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    pendingScreenSource = sources.find((s) => s.id === sourceId) || null;
    return pendingScreenSource !== null;
  } catch {
    pendingScreenSource = null;
    return false;
  }
});

// ─── Gamepad Emulation via IPC ─────────────────────────────────
ipcMain.handle('gamepad:create-virtual', () => createVirtualGamepad());
ipcMain.handle('gamepad:destroy-virtual', () => { destroyVirtualGamepad(); });
ipcMain.handle('gamepad:is-available', () => isGamepadAvailable());
ipcMain.on('gamepad:input', (_event, state: GamepadInputState) => {
  updateVirtualGamepad(state);
});

app.whenReady().then(() => {
  // Handler para getDisplayMedia — pega a tela inteira automaticamente.
  // O renderer é que decide qual source via IPC, este handler só precisa
  // retornar um source válido para o Chromium aceitar a chamada.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    // Se o renderer selecionou um source via picker, usa ele
    if (pendingScreenSource) {
      const source = pendingScreenSource;
      pendingScreenSource = null;
      callback({ video: source, audio: 'loopback' });
      return;
    }
    // Fallback: pega a primeira tela
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (!sources.length) {
        callback({ video: sources[0] as any });
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => {
      callback({ video: undefined as any });
    });
  });

  // CSP apenas em produção
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

  // ─── System Tray ──────────────────────────────────────────────
  const trayIcon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Zynk');

  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Zynk',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(trayMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  cleanupGamepad();
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
