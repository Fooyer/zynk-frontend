import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer, Tray, Menu, nativeImage, dialog, protocol, net, type DesktopCapturerSource } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import {
  isAvailable as isGamepadAvailable,
  cleanup as cleanupGamepad,
  createVirtualGamepadSlot,
  updateVirtualGamepadSlot,
  destroyVirtualGamepadSlot,
  destroyAllSlots,
  type GamepadInputState,
} from './gamepadEmulator';

// On Linux/Wayland the PipeWire screen capturer tries DMA-BUF with EGL and
// fails with EGL_BAD_DISPLAY, producing a black stream.
// ozone-platform-hint=auto makes Electron detect X11 vs Wayland and set up
// EGL properly; WebRtcPipeWireCapturer enables the PipeWire capture path.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WebRtcPipeWireCapturer');
}

// Serve o build de produção por um esquema customizado em vez de file://.
// file:// não tem origem "de verdade" (é opaca) — e o postMessage entre
// nossa página e o iframe do YouTube (IFrame Player API) depende de origem
// pra funcionar. Sob file://, o handshake falhava em silêncio e o player
// ficava "Carregando..." pra sempre. Registrar como standard+secure dá à
// nossa própria página uma origem estável (app://zynk), tratada de forma
// equivalente a https:// pra esse tipo de checagem — precisa acontecer
// ANTES de app.whenReady().
const APP_SCHEME = 'app';
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Guardado à parte pra poder restaurar o ícone original da bandeja quando o
// badge de "não lida" for removido (tray.setImage substitui o ícone inteiro,
// não existe overlay nativo como na taskbar).
let trayIcon: Electron.NativeImage | null = null;
let isQuitting = false;
let pendingScreenSource: DesktopCapturerSource | null = null;

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(__dirname, '..', 'build', 'icon.png');
}

function createWindow() {
  const isLinux = process.platform === 'linux';

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    title: 'Zynk',
    icon: getIconPath(),
    frame: false,
    titleBarStyle: 'hidden',
    // roundedCorners é nativo no macOS e Windows 11 com frame:false — nesses
    // o próprio SO desenha o arredondado (DWM/Quartz), sem precisar de
    // transparência. No Linux não existe suporte nativo, então a janela fica
    // transparente e quem desenha o arredondado é o CSS (.window-shell).
    // transparent:true em todas as plataformas (como era antes) quebrava a
    // interação da janela no Windows — o maximizar do titleBarOverlay parava
    // de responder a cliques por causa de como o DWM compõe janelas
    // transparentes. Por isso os botões de controle agora são sempre os
    // customizados (React + IPC), iguais em Windows e Linux, e o
    // titleBarOverlay nativo (que só existe em Win/macOS) nem é usado.
    roundedCorners: true,
    transparent: isLinux,
    backgroundColor: isLinux ? undefined : '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Menu de contexto nativo (Recortar/Copiar/Colar) para campos de texto —
  // Electron não mostra isso por padrão como um navegador normal mostraria.
  // Não dispara em elementos que já têm seu próprio menu React (eles chamam
  // e.preventDefault() no contextmenu do DOM, o que suprime este evento).
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { isEditable, editFlags, selectionText } = params;
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (isEditable) {
      template.push(
        { label: 'Desfazer', role: 'undo', enabled: editFlags.canUndo },
        { label: 'Refazer', role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut', enabled: editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: editFlags.canCopy },
        { label: 'Colar', role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { label: 'Selecionar tudo', role: 'selectAll', enabled: editFlags.canSelectAll },
      );
    } else if (selectionText && selectionText.trim().length > 0) {
      template.push({ label: 'Copiar', role: 'copy' });
    } else {
      return;
    }

    Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(`${APP_SCHEME}://zynk/index.html`);
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

// ─── Edit commands (undo/redo/cut/copy/paste/selectAll) ───────
// Usado pelo menu de contexto customizado (React) dos campos de texto, no
// lugar do menu nativo do Electron — webContents.cut()/copy()/etc já operam
// sobre o elemento focado no momento da chamada, então funciona mesmo tendo
// clicado num botão do nosso próprio menu flutuante entre o meio do caminho
// (o campo original recupera o foco antes do IPC ser enviado).
ipcMain.on('edit:undo', () => mainWindow?.webContents.undo());
ipcMain.on('edit:redo', () => mainWindow?.webContents.redo());
ipcMain.on('edit:cut', () => mainWindow?.webContents.cut());
ipcMain.on('edit:copy', () => mainWindow?.webContents.copy());
ipcMain.on('edit:paste', () => mainWindow?.webContents.paste());
ipcMain.on('edit:selectAll', () => mainWindow?.webContents.selectAll());

// ─── Auto-update (electron-updater + GitHub Releases) ─────────
// Cada instalação já sabe seu próprio SO — o Windows só olha pro
// latest.yml do NSIS, o Linux só pro latest-linux.yml do AppImage — então
// não existe "detectar e redirecionar" nenhum, é tudo automático por
// plataforma assim que uma release é publicada (`npm run release`).
ipcMain.on('update:restart', () => autoUpdater.quitAndInstall());

ipcMain.handle('app:get-version', () => app.getVersion());

// ─── Badge de notificação não lida (taskbar + bandeja) ─────────
// O renderer desenha os PNGs (via <canvas>, sem precisar de dependência de
// imagem no processo main) e manda o data URL pronto por IPC.
ipcMain.on('notif:set-overlay-badge', (_event, dataUrl: string | null) => {
  if (!mainWindow) return;
  if (dataUrl) {
    const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
    mainWindow.setOverlayIcon(icon, 'Notificações não lidas');
  } else {
    mainWindow.setOverlayIcon(null, '');
  }
});

ipcMain.on('notif:set-tray-badge', (_event, dataUrl: string | null) => {
  if (!tray) return;
  if (dataUrl) {
    tray.setImage(nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 }));
  } else if (trayIcon) {
    tray.setImage(trayIcon);
  }
});

// Botão "Verificar atualizações" nas Configurações chama isso — reusa o
// autoUpdater.checkForUpdates() diretamente, então dispara os MESMOS eventos
// (checking/available/not-available/error) que a checagem automática, e a UI
// reage do mesmo jeito não importa quem pediu a checagem.
ipcMain.handle('update:check', () => {
  if (!app.isPackaged) {
    mainWindow?.webContents.send('update:error', 'Checagem de atualização não disponível em modo de desenvolvimento.');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdater] falha ao checar:', err);
    mainWindow?.webContents.send('update:error', err?.message ?? String(err));
  });
});

function setupAutoUpdater() {
  if (!app.isPackaged) return; // não faz sentido checar update rodando via `npm run dev`

  autoUpdater.autoDownload = true;
  // Se o usuário ignorar o toast de "reiniciar agora", a atualização ainda
  // se aplica sozinha na próxima vez que o app for fechado de verdade (menu
  // da bandeja "Sair") — não só minimizado pro tray.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:checking');
  });
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:not-available');
  });
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', Math.round(progress.percent));
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', info.version);
  });
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err);
    mainWindow?.webContents.send('update:error', err?.message ?? String(err));
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => console.error('[autoUpdater] falha ao checar:', err));
  };

  // Primeira checagem alguns segundos depois de abrir (não compete com o
  // carregamento inicial da janela), depois a cada 4h enquanto aberto.
  setTimeout(check, 10_000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

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
ipcMain.handle('gamepad:is-available', () => isGamepadAvailable());

// Multi-gamepad (game sessions)
ipcMain.handle('gamepad:create-slot', (_event, slot: number) => createVirtualGamepadSlot(slot));
ipcMain.handle('gamepad:destroy-slot', (_event, slot: number) => { destroyVirtualGamepadSlot(slot); });
ipcMain.handle('gamepad:destroy-all-slots', () => { destroyAllSlots(); });
ipcMain.on('gamepad:input-slot', (_event, data: { slot: number; state: GamepadInputState }) => {
  updateVirtualGamepadSlot(data.slot, data.state);
});

// ─── Filesystem (Code Sessions) ──────────────────────────────
ipcMain.handle('fs:select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecionar pasta do projeto',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('fs:read-dir', async (_event, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const ignored = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'target']);
    return entries
      .filter((e) => !ignored.has(e.name) && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
  } catch {
    return [];
  }
});

ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('fs:save-file', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

// ─── Code Tunnel (VS Code + File Watcher) ───────────────────
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'target', '.idea', '.vscode']);
const IGNORED_EXTS = new Set(['.exe', '.dll', '.so', '.dylib', '.o', '.obj', '.class', '.jar', '.zip', '.tar', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.mov']);

let activeWatcher: fs.FSWatcher | null = null;
const recentWrites = new Set<string>(); // Paths we wrote ourselves (avoid echo loop)

function shouldIgnorePath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]/);
  for (const part of parts) {
    if (IGNORED_DIRS.has(part) || part.startsWith('.')) return true;
  }
  const ext = path.extname(relativePath).toLowerCase();
  if (IGNORED_EXTS.has(ext)) return true;
  return false;
}

// Open VS Code on a folder
ipcMain.handle('tunnel:open-vscode', async (_event, folderPath: string) => {
  // On Linux, VS Code may be installed as Flatpak or Snap and not expose `code` in PATH
  const candidates =
    process.platform === 'win32' || process.platform === 'darwin'
      ? ['code']
      : ['code', 'flatpak run com.visualstudio.code', 'snap run code'];

  const tryNext = (index: number): Promise<{ success: boolean; error?: string }> => {
    if (index >= candidates.length) {
      return Promise.resolve({ success: false, error: 'VS Code não encontrado. Instale o VS Code e verifique se está no PATH.' });
    }
    const [bin, ...args] = candidates[index].split(' ');
    return new Promise((resolve) => {
      execFile(bin, [...args, folderPath], { shell: true }, (err) => {
        if (err) resolve(tryNext(index + 1));
        else resolve({ success: true });
      });
    });
  };

  const result = await tryNext(0);
  if (!result.success) console.error('[tunnel:open-vscode] Error:', result.error);
  return result;
});

// ─── Manual recursive watcher (fs.watch { recursive } not supported on Linux) ─
const dirWatchers = new Map<string, fs.FSWatcher>();

function watchDir(dir: string, root: string) {
  if (dirWatchers.has(dir)) return;
  try {
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (!filename || !mainWindow) return;

      const fullPath = path.join(dir, filename);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      if (shouldIgnorePath(relativePath)) return;
      if (recentWrites.has(fullPath)) return;

      setTimeout(() => {
        try {
          if (!fs.existsSync(fullPath)) {
            mainWindow?.webContents.send('tunnel:file-changed', {
              relativePath,
              action: 'delete' as const,
              content: null,
            });
            return;
          }

          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            // New subdirectory created — start watching it too
            watchDir(fullPath, root);
            return;
          }
          if (stat.size > 1024 * 1024) return;

          const content = fs.readFileSync(fullPath, 'utf-8');
          mainWindow?.webContents.send('tunnel:file-changed', {
            relativePath,
            action: eventType === 'rename' ? 'create' : 'change',
            content,
          });
        } catch {
          // File may have been deleted between check and read
        }
      }, 100);
    });
    dirWatchers.set(dir, watcher);
  } catch {
    // Directory may not be accessible
  }
}

function walkAndWatch(dir: string, root: string) {
  watchDir(dir, root);
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walkAndWatch(path.join(dir, entry.name), root);
    }
  } catch {
    // Skip unreadable directories
  }
}

function stopAllDirWatchers() {
  for (const w of dirWatchers.values()) w.close();
  dirWatchers.clear();
}

// Start watching a folder for file changes
ipcMain.handle('tunnel:watch-folder', async (_event, folderPath: string) => {
  stopAllDirWatchers();
  if (activeWatcher) { activeWatcher.close(); activeWatcher = null; }

  try {
    walkAndWatch(folderPath, folderPath);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Stop watching
ipcMain.handle('tunnel:stop-watching', async () => {
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
  stopAllDirWatchers();
  recentWrites.clear();
});

// Write a file received from a remote participant (marks it to avoid echo)
ipcMain.handle('tunnel:write-remote-file', async (_event, folderPath: string, relativePath: string, content: string) => {
  try {
    const fullPath = path.join(folderPath, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Mark as "our write" so the watcher ignores it
    recentWrites.add(fullPath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    // Clear the mark after a short delay
    setTimeout(() => recentWrites.delete(fullPath), 500);

    return true;
  } catch {
    return false;
  }
});

// Delete a file received from a remote participant
ipcMain.handle('tunnel:delete-remote-file', async (_event, folderPath: string, relativePath: string) => {
  try {
    const fullPath = path.join(folderPath, relativePath);
    recentWrites.add(fullPath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    setTimeout(() => recentWrites.delete(fullPath), 500);
    return true;
  } catch {
    return false;
  }
});

app.whenReady().then(() => {
  // Serve o dist/ pelo esquema app:// — mapeia app://zynk/<path> pra
  // dist/<path> no disco. net.fetch sobre um file:// já faz o Chromium
  // inferir o Content-Type certo pela extensão (mesma receita da doc oficial
  // do Electron pra protocolos customizados), então JS/WASM/fontes servem
  // com o mime type que cada um precisa.
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    let relPath = decodeURIComponent(url.pathname);
    if (relPath === '' || relPath === '/') relPath = '/index.html';

    const distDir = path.join(__dirname, '../dist');
    const filePath = path.normalize(path.join(distDir, relPath));
    // Contenção básica — nada aqui deveria pedir fora de dist/, mas não
    // custa garantir que um ../ perdido não escape pro resto do disco.
    if (!filePath.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });

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
            // https://www.youtube.com carrega o script da IFrame Player API
            // (assistir junto sincronizado) — sem isso o <script src=...>
            // dinâmico era bloqueado silenciosamente em build de produção.
            // 'wasm-unsafe-eval' (não 'unsafe-eval' — não libera eval() de JS,
            // só compilação de WebAssembly) é o que o worklet de supressão de
            // ruído (RNNoise, rodando via WASM) precisa pra instanciar.
            " script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com;" +
            " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
            " font-src 'self' https://fonts.gstatic.com;" +
            " connect-src 'self' https://zynk.fooyer.com ws://zynk.fooyer.com wss://zynk.fooyer.com wss://signaling.yjs.dev;" +
            " img-src 'self' data: blob: https://zynk.fooyer.com;" +
            // Sem frame-src, default-src 'self' bloqueia o próprio <iframe>
            // que a IFrame Player API cria pra embutir o vídeo.
            " frame-src https://www.youtube.com;"
          ],
        },
      });
    });
  }

  createWindow();
  setupAutoUpdater();

  // ─── System Tray ──────────────────────────────────────────────
  trayIcon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
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
