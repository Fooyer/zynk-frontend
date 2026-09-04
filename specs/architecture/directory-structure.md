# Zynk — Estrutura de Diretórios

> Regras normativas de organização do código no monorepo do frontend.
> Qualquer arquivo novo deve seguir esta árvore e as regras de colocação.

## 1. Árvore oficial (nível de raiz)

```
zynk-frontend/
├── .claude/                    # Configuração de agentes (opencode/claude)
├── .env                        # Variáveis locais (não versionado)
├── .env.example                # Modelo de variáveis de ambiente
├── .github/workflows/CR.yml    # Code-review automático via opencode
├── .gitignore
├── electron/
│   ├── main.ts                 # Processo main do Electron
│   ├── preload.ts              # contextBridge (expõe electronAPI)
│   └── gamepadEmulator.ts      # Emulação de gamepad virtual
├── public/
│   ├── bootstrap.js            # Roda antes do primeiro paint (tema)
│   ├── icon.svg
│   └── notification.wav
├── scripts/
│   ├── publish-release.js      # Publica artefatos no GitHub Releases
│   └── set-icon.js
├── src/
│   ├── components/             # Componentes React (UI)
│   ├── hooks/                  # Custom hooks
│   ├── services/               # Integração com backend/WebRTC/nativo
│   ├── stores/                 # Zustand stores (estado global)
│   ├── types/                  # Tipos/entidades compartilhados
│   ├── utils/                  # Funções puras utilitárias
│   ├── App.tsx                 # Raiz da aplicação React
│   └── main.tsx                # Entrypoint React
├── specs/                      # SDD deste repositório (este diretório)
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── electron-builder.yml
└── package.json
```

## 2. Regras de colocação de código

### 2.1 `src/components/` — apenas UI + estado local
Contém **componentes React**. Subdividido por domínio:
- `components/auth/` — login/registro.
- `components/call/` — chamadas (overlay, manager, screen picker, atalhos).
- `components/chat/` — mensagens/DMs.
- `components/common/` — primitivos reutilizáveis (Dialog, ContextMenu, Toast,
  Skeleton).
- `components/events/` — eventos agendados.
- `components/game/` — sessões de jogo.
- `components/groups/` — grupos, canais de voz/texto, watch-together, kanban,
  notas.
- `components/home/` — layout da tela principal (DMs, amigos).
- `components/layout/` — layout global (NavBar, etc.).
- `components/settings/` — página de configurações.

**Regras:**
- Componentes **não** devem conter lógica de fetch/business diretamente;
  devem usar hooks ou `services/`.
- Componente de apresentação puro vs. componente "container" (que lê store):
  um componente pode ler Zustand, mas não deve chamar `api.*` diretamente
  fora de um hook.
- Cada componente deve estar no diretório do seu domínio. Componente
  globalmente reutilizável vai em `components/common/`.

### 2.2 `src/hooks/` — lógica reutilizável com ciclo de vida React
Custom hooks com prefixo `use` (OBRIGATÓRIO):
- `useSocket.ts` — escuta eventos do Socket.IO e despacha para stores.
- `useVoiceRoom.ts` — gerencia `RTCPeerConnection` de uma sala de voz.
- `useYouTubeSync.ts` — sincronização do player do "assistir junto".

**Regras:**
- Hook que depende de algo do `window`/nativo deve ser abstraído.
- Hooks de integração (rede/WebRTC) ficam aqui, não dentro de componentes.

### 2.3 `src/services/` — integração externa (backend, WebRTC, nativo)
Camada que fala com o mundo externo. **Nenhum componente deve chamar
`fetch`/`axios`/`io()` diretamente** — deve passar por aqui:
- `api.ts` — instância axios + todos os clientes REST.
- `socket.ts` — singleton Socket.IO.
- `callStream.ts`, `audioProcessing.ts`, `lowLatencyAudio.ts` — WebRTC/áudio.
- `agcWorklet.js`, `noiseGateWorklet.js` — AudioWorklets.
- `screenCapture.ts`, `fileTransfer.ts`, `youtube.ts`, `notification.ts`.
- `trayBadge.ts` — badge de não lida (taskbar/bandeja).
- `iceServers.ts` — lista de servidores STUN/TURN.
- `shortcutActions.ts` — ações dos atalhos globais.

**Regras:**
- Funções aqui devem ser orientadas a dados e independentes de React.
- Não importar hooks/stores de componentes dentro de services, salvo
  acoplamento inevitável e documentado.

### 2.4 `src/stores/` — estado global (Zustand)
Um store por domínio:
- `authStore`, `chatStore`, `friendStore`, `groupStore`, `callStore`,
  `eventStore`, `gameSessionStore`, `uiStore`, `unreadStore`, `themeStore`,
  `settingsStore`, `layoutStore`, `pollStore`, `keybindingsStore`,
  `shortcutStatusStore`, `watchTogetherUiStore`, `contextMenuStore`,
  `dialogStore`.

**Regras:**
- Cada store é criada com `create<State>()(...)` do Zustand.
- **Não** usar estado global para coisa que dá pra resolver com `useState`
  local/USE de componente (evitar poluição).
- Seletores devem ser estáveis para evitar re-renders (evitar selecionar
  objeto novo a cada chamada sem `shallow` quando necessário).
- No `logout`, o `authStore` é responsável por limpar os demais stores
  (não vazar dados entre contas).

### 2.5 `src/types/` — tipos/entidades compartilhados
`index.ts` concentra todas as entidades: `User`, `Message`, `Group`, `DM`,
`VoiceChannel`, `ServerEvent`, `Poll`, `GameSession`, `WatchTogetherState`,
etc., e a declaração global de `window.electronAPI`.

**Regras:**
- Tipos de entidade de domínio **obrigatoriamente** em `src/types/`.
- Tipos específicos de um componente podem ficar locais ao componente, mas
  entidades de backend devem ser compartilhadas aqui.
- `declare global { interface Window { electronAPI? } }` vive aqui.

### 2.6 `src/utils/` — funções puras
- `color.ts` — geração de rampa de cor/gradiente, contraste.
- `accentPresets.ts` — presets de cor de destaque.
- `formatDate.ts`, `keyCombo.ts`.

**Regras:**
- Utils **não** podem importar React, hooks, stores nem `window`.
  (Funções puras — testáveis sem ambiente DOM.)

### 2.7 `electron/` — processo main
- `main.ts` — janela, IPC, servidor local, CSP, tray, auto-update, gamepad.
- `preload.ts` — única ponte via `contextBridge`.
- `gamepadEmulator.ts` — emulação de gamepad.

### 2.8 `specs/` — documentação de design (este repositório)
- `architecture/`, `security/`, `testing/`, `patterns/`.

## 3. Regras transversais de organização

1. **Import path:** usar o alias `@/` para `src/` quando conveniente
   (`import { useAuthStore } from '@/stores/authStore'`). Imports relativos
   são aceitáveis, mas dentro das mesmas pastas abaixo de `src/`.
2. **Não colocar** lógica de negócio no `main.tsx` ou `index.html` — são
   entrypoints.
3. **Assets estáticos** que o app serve vão em `public/`; imagens/ícones de
   componente devem ir em `src/assets/`.
4. Arquivos de **build/CI/release** ficam na raiz (`vite.config.ts`,
   `electron-builder.yml`, `.github/`) — não no `src/`.
5. **Worklets de áudio** (`.js`) ficam em `services/` para serem importados
   com `?url` e externalizados no build (nunca inlinados — ver
   `security/security-rules.md` §8).

## 4. Checklist para colocar um arquivo novo

- [ ] É um componente de UI? → `src/components/<dominio>/`.
- [ ] É uma tela nova? → `src/components/<dominio>/` (não `pages/`).
- [ ] É lógica reutilizável ligada a ciclo de vida React? → `src/hooks/`.
- [ ] Fala com backend/WebRTC/nativo? → `src/services/`.
- [ ] É estado global compartilhado? → `src/stores/`.
- [ ] É uma entidade/tipo de backend? → `src/types/`.
- [ ] É função pura? → `src/utils/`.
- [ ] Mexe na janela/tray/update/gamepad/screen? → `electron/`.
- [ ] Documento de design/segurança? → `specs/`.
