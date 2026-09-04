# Zynk — Estratégia de Testes

> Estratégia normativa para testes e validação de qualidade do frontend
> Electron. O projeto atual NÃO possui suíte de testes configurada — este
> documento define a estratégia-alvo e os critérios para a introdução de
> testes. Regras rígidas de barreira de qualidade: `testing/validation-rules.md`.

---

## 1. Situação atual (baseline)

- `package.json` **não** tem framework de testes, linter nem formatter
  configurados (sem `vitest`, `jest`, `eslint`, `prettier` no
  `devDependencies`).
- Não existem arquivos `*.test.*`/`*.spec.*` no repositório.
- Existe um **code-review automático** em `.github/workflows/CR.yml` (opencode
  review do diff de PRs), que cobre critérios de arquitetura, estado, performance,
  REST, segurança, TypeScript e convenções.

> **Consequência:** antes de adicionar testes automatizados, é necessário
> instalar o framework (recomendado: **Vitest** + **React Testing Library**,
> alinhados ao ecossistema Vite), conforme planos na seção 5.

## 2. Princípios da estratégia de teste

1. **Pirâmide de testes:** muitos testes unitários (base), menos testes de
   integração e poucos testes E2E. Na prática do projeto: priorizar
   **unitários puros** (utils, reducers de store) e **testes de hook/store**,
   com testes de componente e E2E seletivos.
2. **O que é barato e de alto valor:** funções puras de `src/utils/`, ações
   de Zustand stores, e a lógica restrita (sockets/WebRTC) sem depender de
   infra real (mock da camada de transporte).
3. **Não testar o framework** (React, Zustand, Electron, Socket.IO,
   RTCPeerConnection) — testar **nossa** lógica sobre eles.
4. **Priorizar áreas críticas de segurança** (ver `validation-rules.md`): os
   caminhos que podem escalar privilégio ou expor dados são os primeiros a
   ter cobertura de validação.

## 3. Camadas de teste e sua responsabilidade

| Camada | Framework sugerido | Cobre | Mocks necessários |
|---|---|---|---|
| **Unit — utils** | Vitest | `src/utils/` (color, accentPresets, formatDate, keyCombo) | Nenhum (funcões puras) |
| **Unit — stores** | Vitest | Ações de `src/stores/` (auth, chat, friend, call, theme, etc.) | Mock de `services/api`, `services/socket`, `localStorage` |
| **Unit — services** | Vitest | `api.ts` (interceptors), `socket.ts`, `iceServers.ts`, `trayBadge.ts` | Mock de axios/io |
| **Component** | Vitest + RTL | Componentes chave que orquestram estado (login form, dialogs, unread badge) | Mock de stores/socket |
| **Hook** | Vitest + `renderHook` | `useSocket`, `useVoiceRoom` (sinalização), `useYouTubeSync` | Mock de `socket`, `RTCPeerConnection` |
| **Integração** | Vitest | Fluxo auth (login → token → socket), fluxo de banimento de dados no logout | Mock de backend |
| **E2E (opcional)** | Playwright | Fluxos do usuário no Electron | Backend de teste |

## 4. Priorização por módulo (ordem de maior valor)

1. `src/utils/color.ts` — geração de rampa, mistura, contraste (pura,
   determinística, alta regressão visual).
2. `src/stores/authStore.ts` — `login/register/logout/loadUser/updateIdentity`
   (segurança de token, limpeza de logout — liga com `validation-rules.md`).
3. `src/services/api.ts` — interceptors (header Bearer, logout em 401).
4. `src/services/socket.ts` — singleton, connect/disconnect, reconexão.
5. `src/stores/callStore.ts` — máquina de estado da chamada
   (idle/calling/ringing/active) e reset.
6. Lógica de `useVoiceRoom` — estabelecimento de `RTCPeerConnection` e
   limpeza de tracks (com mock).
7. `src/stores/themeStore.ts` — aplicação de tema/cor de destaque.
8. `src/utils/keyCombo.ts`, `src/utils/formatDate.ts`.

## 5. Roteiro de introdução (recomendado)

> Requer ação de configuração — não é aplicável até a instalação das
> ferramentas.

1. **Instalar:** `vitest`, `@testing-library/react`,
   `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
2. **Configurar:** adicionar script `"test": "vitest run"` e `"test:watch"`;
   configurar `environment: 'jsdom'` para testes de componente e
   `environment: 'node'` (ou pool default) para unit puro.
3. **Adicionar setup** de `@testing-library/jest-dom` e mock global de
   `window.electronAPI` para testes de renderer.
4. **Escrever os testes** conforme a priorização da seção 4.
5. **Fixar qualidade:** integrar na barreira de validação (ver
   `validation-rules.md`) para novos PRs.

## 6. Locais dos arquivos de teste

- Colocar `*.test.ts`/`*.test.tsx` **ao lado** do arquivo testado
  (colocalização), ex.: `src/utils/color.test.ts`, `src/stores/authStore.test.ts`.
- Nome do arquivo: `<nome>.test.ts(x)`.

## 7. Testes manuais de regressão (áreas sensíveis)

Até haver E2E automatizado, estas validações são feitas manualmente a cada
release que toca a área:

1. **CSP em produção** — `npm run electron:dev` abre devtools; conferir que
   não há violação de CSP no console (especialmente Monaco e worklets de áudio).
2. **Servidor local** — verificar que carrega em `127.0.0.1:47823` e que
   falha com "porta em uso" de forma controlada (fallback 47824/47825).
3. **Auto-update** — publicação de release gera `latest.yml` com checksum e o
   app detecta versão nova.
4. **Chamada de voz** entre 2 contas — áudio bilateral, mute, screen-share,
   ingressar em canal de voz (roster correto).
5. **Troca de conta** — após logout não sobram mensagens/DMs do usuário anterior.
6. **Assistir junto** — vídeo do YouTube (validar origem 153) e link direto
   (hls) funcionam em build de produção.
7. **Gamepad** — slot criado/destruído, cleanup no quit.

## 8. Métricas de aceite

- **Cobertura mínima** (barra de seed, após implementação inicial):
  - `src/utils/` — ≥ 80% de linhas.
  - `src/stores/authStore` — ≥ 90% (área de segurança).
  - `src/services/api.ts` interceptors — ≥ 90%.
- As métricas acima são **direcionamento de seed**; o rigor real é definido
  pelas regras de `validation-rules.md`.
