import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer, Tray, Menu, nativeImage, dialog, globalShortcut, type DesktopCapturerSource } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import http from 'http';
import {
  isAvailable as isGamepadAvailable,
  cleanup as cleanupGamepad,
  createVirtualGamepadSlot,
  updateVirtualGamepadSlot,
  destroyVirtualGamepadSlot,
  destroyAllSlots,
  type GamepadInputState,
} from './gamepadEmulator';

// Impede duas instâncias do Zynk rodando ao mesmo tempo na mesma máquina —
// sem isso, reabrir o atalho achando que o app não está rodando (ele só
// minimiza pra bandeja, ver mainWindow.on('close') abaixo) sobe um SEGUNDO
// processo ao lado do primeiro; se um auto-update reinicia só um deles nesse
// meio tempo, sobram duas versões diferentes rodando juntas — e cada uma
// briga pela mesma porta do servidor local (ver LOCAL_SERVER_PORTS), o que
// pode fazer um relançamento cair numa origem de localStorage diferente da
// anterior e parecer um logout forçado. process.exit(0) logo após app.quit()
// é o que garante que a instância perdedora nem chega a chamar
// startLocalServer() e disputar essa porta.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => showMainWindow());

// On Linux/Wayland the PipeWire screen capturer tries DMA-BUF with EGL and
// fails with EGL_BAD_DISPLAY, producing a black stream.
// ozone-platform-hint=auto makes Electron detect X11 vs Wayland and set up
// EGL properly; WebRtcPipeWireCapturer enables the PipeWire capture path.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WebRtcPipeWireCapturer');
}

// Chromium's default autoplay policy (document-user-activation-required)
// blocks `<audio>.play()` with sound until the page has seen a user gesture
// — silently: the promise still resolves and no error is ever thrown. That
// was making remote call audio and screen/audio-share audio inaudible
// whenever the call started from something that isn't a plain in-page click
// (answering from a tray/notification action, a global shortcut, etc.), and
// only "fixed itself" by accident once the user happened to click something
// else in the window (e.g. the screen picker), which counted as the gesture
// that unlocked autoplay for the rest of the session. This is a private
// desktop app, not a public page trying to avoid autoplay abuse, so we just
// disable the restriction outright instead of chasing gesture timing in
// every call/voice-room code path.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Serve o build de produção por um servidor HTTP local (127.0.0.1) em vez de
// file:// — e não por um esquema customizado (app://) como numa tentativa
// anterior, que resolvia o problema de origem "opaca" do file:// pro nosso
// próprio CSP/postMessage, mas não pro YouTube: o embed do YouTube faz sua
// PRÓPRIA validação de origem no servidor deles, e rejeita qualquer esquema
// que não seja http:/https: com "Error 153 — Video player configuration
// error", mesmo com o esquema registrado como standard+secure no Electron.
// http://localhost é a solução padrão da comunidade Electron pra esse tipo
// de embed sensível a origem — servido só em loopback, nunca exposto à rede.
//
// Porta fixa (não 0/efêmera): o backend precisa saber de antemão qual origem
// liberar no CORS. Lista curta de fallback caso a porta principal esteja em
// uso — todas já pré-liberadas no backend (ver app.ts e chat-gateway.ts).
const LOCAL_SERVER_PORTS = [47823, 47824, 47825];
let localServerPort: number | null = null;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
};

function tryListen(server: http.Server, ports: number[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (index: number) => {
      if (index >= ports.length) {
        reject(new Error('Nenhuma das portas locais candidatas ficou disponível.'));
        return;
      }
      const port = ports[index];
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') attempt(index + 1);
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve(port));
    };
    attempt(0);
  });
}

/** Serve dist/ estático em http://127.0.0.1:<porta> — sem client-side
 *  routing nesse app (a navegação é toda por estado, não por URL), então não
 *  precisa de fallback pra index.html em rotas desconhecidas: um arquivo que
 *  não existe é mesmo um 404. */
async function startLocalServer(): Promise<number> {
  const distDir = path.join(__dirname, '../dist');

  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relPath = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.normalize(path.join(distDir, relPath));

      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500);
      res.end('Internal error');
    }
  });

  return tryListen(server, LOCAL_SERVER_PORTS);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Guardado à parte pra poder restaurar o ícone original da bandeja quando o
// badge de "não lida" for removido (tray.setImage substitui o ícone inteiro,
// não existe overlay nativo como na taskbar).
let trayIcon: Electron.NativeImage | null = null;
let isQuitting = false;
let pendingScreenSource: DesktopCapturerSource | null = null;

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

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

  // F12/Ctrl+Shift+I abrem o DevTools mesmo em build de produção — sem isso,
  // só dava pra inspecionar rodando via `npm run electron:dev` (que abre
  // sozinho), o que não reproduz bugs que só aparecem sob a CSP de produção.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const isToggle = input.key === 'F12' || (input.control && input.shift && input.key.toUpperCase() === 'I');
    if (isToggle) mainWindow?.webContents.toggleDevTools();
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
    // startLocalServer() já rodou em app.whenReady(), antes de createWindow().
    mainWindow.loadURL(`http://127.0.0.1:${localServerPort}/index.html`);
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

// ─── Atalhos globais (system-wide) ─────────────────────────────
// Registrados via globalShortcut — funcionam mesmo com o Zynk sem foco
// (ex.: mutar durante um jogo em tela cheia). O renderer reenvia a lista
// inteira a cada mudança (não incremental), então sempre começa do zero.
ipcMain.handle('shortcuts:set', (_event, items: { action: string; accelerator: string }[]) => {
  globalShortcut.unregisterAll();
  const failed: string[] = [];
  for (const { action, accelerator } of items) {
    if (!accelerator) continue;
    try {
      const ok = globalShortcut.register(accelerator, () => {
        mainWindow?.webContents.send('shortcut:triggered', action);
      });
      if (!ok) failed.push(action);
    } catch {
      failed.push(action);
    }
  }
  return { failed };
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

app.whenReady().then(async () => {
  if (!process.env.VITE_DEV_SERVER_URL) {
    try {
      localServerPort = await startLocalServer();
    } catch (err) {
      console.error('[localServer] Não deu pra subir o servidor local:', err);
      dialog.showErrorBox('Erro ao iniciar', 'Não foi possível iniciar o servidor local do Zynk. Feche outros programas que possam estar usando as portas 47823-47825 e tente novamente.');
      app.quit();
      return;
    }
  }

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
      // onHeadersReceived roda pra QUALQUER request da sessão, não só a
      // nossa página — sem este filtro, a CSP era injetada também na
      // resposta do próprio iframe do YouTube (o documento embed e o
      // www-widgetapi.js dele), derrubando os scripts inline que o widget
      // deles usa pra bootstrar. Resultado: player preso em "Carregando
      // player..." e um monte de "Refused to execute inline script" com
      // o ID do vídeo no console — nada disso é specífico de plataforma,
      // só não tinha aparecido ainda em teste no Windows.
      if (!details.url.startsWith(`http://127.0.0.1:${localServerPort}/`)) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
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
            // stun:/turn: (sem host fixo) — connect-src também rege a quais
            // servidores ICE o RTCPeerConnection pode conectar, não só
            // fetch/WebSocket. Sem isso, o Chromium recusa silenciosamente
            // (nem sempre loga violação) qualquer stun:/turn: usado em
            // ICE_SERVERS (ver services/iceServers.ts), sobrando só
            // candidatos "host" — que só conectam entre pares na mesma rede
            // local, quebrando a call pra qualquer um atrás de NAT/rede
            // diferente (era exatamente esse o sintoma: call sem áudio nem
            // vídeo pra quem entra depois, sem nenhum erro no console).
            // https: solto (sem host fixo) além da allowlist de sempre —
            // "assistir junto" com link direto deixa qualquer participante
            // colar a URL de um vídeo de qualquer host, e hls.js busca
            // manifesto/segmentos de HLS via fetch/XHR, então precisam
            // passar por connect-src também (não só o <video src> em si).
            " connect-src 'self' https://zynk.fooyer.com ws://zynk.fooyer.com wss://zynk.fooyer.com wss://signaling.yjs.dev stun: turn: https:;" +
            " img-src 'self' data: blob: https://zynk.fooyer.com;" +
            // Sem media-src, default-src 'self' bloqueia qualquer <video
            // src> de host externo — é o que quebra silenciosamente o
            // "assistir junto" com link direto em build de produção (dev
            // não tem CSP, por isso não aparece testando local).
            " media-src 'self' https: blob:;" +
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
      click: () => showMainWindow(),
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
  tray.on('double-click', () => showMainWindow());
});

app.on('before-quit', () => {
  isQuitting = true;
  cleanupGamepad();
  globalShortcut.unregisterAll();
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
