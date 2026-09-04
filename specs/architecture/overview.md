# Zynk — Arquitetura & Visão Geral

> Fonte normativa: este documento descreve a arquitetura vincular do frontend
> do Zynk. Antes de qualquer mudança estrutural, leia este documento.

## 1. Propósito

O **Zynk** é um aplicativo desktop de **chat + voz** (estilo Discord) com
recursos extras: chamadas de voz/vídeo WebRTC, canais de voz de grupo,
sessões de jogo com **emulação de gamepad** e **edição colaborativa** de
código. Ele é construído com **Electron + Vite + React + TypeScript** e
conecta-se a um backend Node (REST + Socket.IO).

É um aplicativo **Electron**, não um SPA web: o processo `main` do Electron
serve o frontend por um servidor HTTP local (loopback) e expõe capacidades
nativas via IPC (janela, bandeja, auto-update, gamepad, filesystem, screen
capture).

## 2. Stack de tecnologia

| Camada | Tecnologia | Versão (package.json) |
|---|---|---|
| Shell desktop | Electron | ^43.0.0 |
| Build | Vite | ^5.0.12 |
| UI | React | ^18.2.0 |
| Linguagem | TypeScript | ^5.3.3 (`strict: true`) |
| Estado | Zustand | ^4.5.0 |
| Estilo | Tailwind CSS | ^3.4.1 |
| HTTP | axios | ^1.6.7 |
| Tempo real | socket.io-client | ^4.7.4 |
| Editor colaborativo | Monaco + Yjs + y-webrtc | — |
| Áudio/voz | WebRTC (`RTCPeerConnection`) + AudioWorklets | — |
| Atualização | electron-updater | ^6.8.9 |
| Empacotamento | electron-builder | ^26.0.0 |
| Emulação de gamepad | Custom (viGEm/`gamepadEmulator.ts`) | — |

## 3. Visão arquitetural de alto nível

```
┌──────────────────────────── Electron app ────────────────────────────┐
│                                                                      │
│  ┌─────────────────────────  Processo Renderer  ──────────────────┐  │
│  │                                                                │  │
│  │  React UI (components/)                                        │  │
│  │   ├── Zustand stores (stores/)          <── estado global      │  │
│  │   ├── hooks (hooks/)                    <── lógica reutilizável│  │
│  │   ├── services/ (api, socket, webrtc)   <── integração externa │  │
│  │   │                                                           │  │
│  │   └── window.electronAPI  (preload, context-isolated)         │  │
│  └───────────────────────────────────────────────┬────────────────┘  │
│                                                  │ IPC (contextBridge)│
│  ┌───────────────────────── Processo Main ───────▼────────────────┐  │
│  │  electron/main.ts                                              │  │
│  │   ├── BrowserWindow (contextIsolation: true, nodeIntegration: false)│
│  │   ├── Servidor HTTP local (127.0.0.1:47823-47825)              │  │
│  │   ├── IPC handlers (fs, screen, gamepad, shortcuts, updates)   │  │
│  │   ├── Tray + badge de notificação                              │  │
│  │   └── autoUpdater (electron-updater)                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Backend remoto (https://zynk.fooyer.com) ── REST + Socket.IO        │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Processo Renderer (React)

- Todo o comportamento visível ao usuário.
- Estado global exclusivamente via **Zustand** (`stores/`). Não há Redux.
- Comunicação com backend:
  - **REST** via `services/api.ts` (axios), com interceptor de token Bearer e
    logout automático em 401.
  - **Tempo real** via `services/socket.ts` (singleton Socket.IO) para
    mensagens, presença, chamadas, canais de voz, watch-together, etc.
- `window.electronAPI` (exposto pelo preload) é o **único** contato com o
  processo main.

### 3.2 Processo Main (Electron)

- Responsável pela janela (`BrowserWindow`), bandeja (`Tray`), auto-update,
  atalhos globais (`globalShortcut`), captura de tela (screen sharing) e
  emulação de gamepad.
- Como o app abre localmente por `http://127.0.0.1:PORT` (não `file://`), o
  embed do YouTube e o loopback de mídia funcionam (o YouTube valida a origem).

## 4. Fluxo de dados (exemplos)

### 4.1 Autenticação
1. `AuthScreen` chama `useAuthStore.login()`.
2. `authStore.login()` → `authAPI.login()` (axios) → backend.
3. Token `accessToken` salvo em `localStorage`.
4. `connectSocket()` conecta o Socket.IO com o token.
5. Se token inválido/expirado (HTTP 401), o interceptor remove o token e recarrega.

### 4.2 Mensagem em tempo real
1. Backend emite evento via Socket.IO (ex.: `message:new`).
2. `useSocket` (hook) escuta e despacha para `useChatStore`.
3. Componente lê o estado do Zustand e renderiza.

### 4.3 Chamada de voz
1. Usuário inicia/aceita a chamada → `useVoiceRoom` (hook) gerencia
   `RTCPeerConnection`.
2. Sinalização via Socket.IO (SDP/ICE).
3. Áudio passa por AudioWorklets (`agcWorklet.js`, `noiseGateWorklet.js`,
   `rnnoiseWorklet.js`) para AGC e supressão de ruído.
4. Estado de UI (status, mute, volume, screen share) em `useCallStore`.

## 5. Decisões arquiteturais registradas (ADRs)

Estas decisões são vinculantes e documentadas nos comentários do código:

### 5.1 Servidor HTTP local em vez de `file://`
O main serve o build de produção por `http://127.0.0.1:PORT` (portas fixas
`47823-47825`, já liberadas no backend para CORS). Motivos:
- `file://` gera origem "opaca", quebrando `postMessage`/CSP.
- O **YouTube exig**e `http`/`https` para validar origem (erro 153) — um
  esquema customizado `app://` não resolve.
- Serve apenas em loopback, nunca exposto à rede.

### 5.2 CSP rígida em produção
A CSP é injetada **apenas em produção** (não em dev) pelo `main.ts`. Usa
`'wasm-unsafe-eval'` (não `'unsafe-eval'`) para o RNNoise (WASM) e libera
especificamente as origens do YouTube/fontes/STUN-TURN. Ver
`security/security-rules.md` §8.

### 5.3 Como resolver restrições de CSP (não afrouxar)
Quando um script/asset precisa ser carregado e a CSP não libera `'unsafe-inline'`:
- O `MonacoEnvironment` inline e os AudioWorklets (`?url`) foram resolvidos
  **externalizando** para arquivos `self` (ver `vite.config.ts`:
  `externalizeMonacoEnv`, `assetsInlineLimit: 0`).
- **Regra:** nunca afrouxar `script-src` com `'unsafe-inline'`/`'unsafe-eval'`
  para resolver esse tipo de problema. Prefira externalizar o asset.

### 5.4 Autoplay desabilitado
`autoplay-policy=no-user-gesture-required` para garantir áudio de chamada /
screen-share venha audível mesmo quando iniciado de bandeja/atalho global.
Aceitável porque é app desktop privado.

### 5.5 Singleton de socket
`services/socket.ts` mantém uma única conexão (~singleton) para evitar
múltiplas conexões. Com horizontal scaling, o backend usa Redis adapter.

### 5.6 Chamadas de voz sobrevivem à navegação
Overlays de chamada e `useVoiceRoom` são montados no nível de `AppLayout`,
não dentro de telas específicas, para que trocar de view não derrube a call.

## 6. Processos principais (scripts)

| Script | Descrição |
|---|---|
| `npm run dev` | Vite dev server (renderer) |
| `npm run build` | `tsc && vite build && electron-builder --publish never` (plataforma atual) |
| `npm run build:win` | Build Windows |
| `npm run build:linux` | Build Linux |
| `npm run release` | `build:win` + `build:linux` + publicação no GitHub Releases |
| `npm run electron:dev` | `vite build && electron .` (executa Electron sobre o build) |

Ver `architecture/release-pipeline.md` para detalhes do release.

## 7. Configuração compilada (TypeScript)

`tsconfig.json`: `strict: true`, módulo ESNext, `moduleResolution: bundler`,
alias `@/*` → `src/*`. TypeScript cobre **`src`** e **`electron`**.

## 8. Endpoints de backend conhecidos

- Base REST: `https://zynk.fooyer.com`
- Socket.IO: `https://zynk.fooyer.com/chat` (auth via token JWT)

Clientes REST (`services/api.ts`) agrupados: `authAPI`, `usersAPI`,
`channelsAPI`, `messagesAPI`, `pollsAPI`, `friendsAPI`, `groupsAPI`,
`eventsAPI`, `gameSessionsAPI`.

## 9. Variáveis de ambiente

| Variável | Uso |
|---|---|
| `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | Servidor TURN para WebRTC (`services/iceServers.ts`) |
| `VITE_DEV_SERVER_URL` | Em dev, indica o dev server do Vite (usado pelo main) |
| `GH_TOKEN` / `GITHUB_TOKEN` | Publicação no GitHub Releases (`scripts/publish-release.js`) |

## 10. Leitura recomendada após este documento

- `architecture/directory-structure.md` — onde colocar cada arquivo.
- `security/security-rules.md` — regras de segurança obrigatórias.
- `testing/testing-strategy.md` — como validar qualidade.
