# Zynk — Padrões & Convenções de Código

> Regras normativas de estilo, nomenclatura e estrutura de código. O vocabulário
> de obrigação segue **RFC 2119**: DEVE, NÃO DEVE, OBRIGATÓRIO, PROIBIDO, PODE,
> RECOMENDADO.

## 1. Nomenclatura

| Item | Regra | Exemplo |
|---|---|---|
| Componentes React | PascalCase, obrigatório | `GroupLayout` |
| Hooks | prefixo `use`, camelCase, obrigatório | `useVoiceRoom` |
| Funções/constantes | camelCase | `generateAccentRamp` |
| Constantes constantes | UPPER_SNAKE_CASE | `ICE_SERVERS` |
| Arquivos de componente | PascalCase | `ActiveCallOverlay.tsx` |
| Arquivos de hook | camelCase com `use` | `useVoiceRoom.ts` |
| Stores | camelCase + `Store` | `authStore.ts` |
| Funções de API | grupos nomeados (objeto) | `groupsAPI.create` |
| Tipos/interfaces | PascalCase, sem prefixo `I` | `Message`, `User` |
| Tipos de evento socket | Sufixo `Event` | `TypingEvent` |

- **PROIBIDO** o prefixo `I` em interfaces (`IUser` → `User`).
- Tipos que colidem com globals do DOM são renomeados (ex.: `ServerEvent`
  em vez de `Event`).

## 2. TypeScript

- **`strict: true`** é obrigatório e não deve ser reduzido.
- **`any` é proibido** onde um tipo real é possível. `any` residual DEVE ser
  justificado com um comentário e tipado na medida do possível.
- Tipos de resposta de API devem refletir o formato real do backend
  (veja `Message` com união de anexo em `index.ts`).
- Props de componente **sempre** tipadas via `interface`/`type`.
- Preferir `interface` para tipos de objeto com extensão; `type` para união.

## 3. Estado global (Zustand)

- Estado global apenas quando compartilhado entre componentes distantes ou
  com lógica de domínio. Senão, usar `useState`/`useReducer` local.
- Seletores estáveis: evitar `useStore((s) => ({...}))` criando objeto novo a
  cada render sem `shallow`. Preferir seletores atômicos.
- Stores não fazem fetch fora de seus métodos de ação (`loadX`,
  `createX`, etc.).
- **Extração de dados:** componentes leem a store; a escrita acontece em
  ações da store ou hooks (`services` chamados dentro de ações).

## 4. Hooks

- Todo hook DEVE começar com `use`.
- Hooks de integração (socket/WebRTC/API) ficam em `src/hooks/` e são os
  únicos autorizados a orquestrar `services/` com ciclo de vida.
- **`useEffect`:** dependências corretas e completas. NUNCA silenciar o
  linter removendo a lista de deps. Evitar efeito em cadeia desnecessário.
- **`useMemo`/`useCallback`:** use onde há custo real ou estabilidade de
  referência necessária (ex.: para `React.memo`). Não use em excesso — o
  custo de manutenção supera o ganho se mal aplicado.

## 5. Componentes

- Um componente = um arquivo (salvo helper privado pequeno, que PODE ficar no
  mesmo arquivo).
- Extrair JSX repetido em subcomponente quando `n > 1` usos reais.
- **`React.memo`** apenas onde há re-render custoso real e props estáveis.
- Evitar `props drilling` profundo: use contexto/Zustand quando necessário,
  mas contexto deve ter `value` memoizado.
- Botões/ações seguem acessibilidade: `aria-label` em ícone puro.

## 6. Estilo (Tailwind)

- Usar classes utilitárias do Tailwind. Evitar CSS custom em arquivos `.css`
  a menos que necessário (variáveis de tema na raiz).
- O tema usa variáveis CSS em runtime: `--color-accent-*`, `--color-surface-*`,
  `--color-accent-foreground`, `--color-accent-gradient`, `data-theme` e
  `data-accent-style` no `<html>`.
- Não criar classes de cor "mágicas" no meio do componente; usar tokens do
  tema (ex.: `bg-surface-950`, `text-surface-400`, `bg-accent-500`).

## 7. Imports

- Ordem: libs externas → módulos internos (`@/` ou relativos) → tipos.
- Preferir o alias `@/` para caminhos dentro de `src/` quando melhorar a
  legibilidade.

## 8. Integração REST

- **PROIBIDO** chamar `fetch`/`axios`/`io()` fora de `src/services/`.
- Todo endpoint REAL DEVE estar em `services/api.ts` agrupado semanticamente.
- Tratamento de erro obrigatório: verificar status HTTP e `try/catch`.
- O interceptor de axios já cuida do token Bearer (`Authorization`) e do
  logout em 401 — não duplicar essa lógica.

## 9. Comunicação com o processo main

- Renderer acessa o main **somente** via `window.electronAPI` (exposto pelo
  preload com `contextBridge`). **PROIBIDO** acessar `ipcRenderer`, `require`,
  `process` ou `Node` diretamente no renderer.
- Novos métodos IPC devem ser adicionados em: `electron/preload.ts` (bridge),
  `electron/main.ts` (handler), e tipados em `src/types/index.ts` (interface
  `Window.electronAPI`).
- Siga as convenções de nome: `dominio:acao` (ex.: `fs:read-dir`,
  `screen:get-sources`, `gamepad:create-slot`).

## 10. Segurança de dados exibidos

- **PROIBIDO** `dangerouslySetInnerHTML` sem sanitização explícita.
- Todo dado vindo de API/backend renderizado em texto DEVE ser escapado pelo
  React (comportamento padrão). Não desativar escaping.
- **PROIBIDO** `eval`/`innerHTML`/`document.write` para processar dados.
  (Exceção documentada: WebAssembly via `'wasm-unsafe-eval'` para RNNoise —
  não libera `eval()` de JS.)

## 11. Tratamento de erros

- Buscar mensagens de erro amigáveis ao usuário; manter o erro técnico
  registrado no console.
- Formato de resposta de erro do backend: `err.response?.data?.message`
  (usado em `authStore`). Seguir esse padrão.

## 12. Comentários

- Comentários em **pt-BR**, como o restante do código.
- Comentar o **porquê** de decisões não triviais (o "why"), não o "o que".
- Exemplos bons de como documentar decisões estão nos comentários de
  `electron/main.ts` e `vite.config.ts` (decisões de CSP, servidor local,
  autoplay).

## 13. Convenções de git/PR

- Mensagens de commit concisas, em pt-BR ou inglês, descrevendo a intenção.
- Todo PR que muda arquitetura/segurança atualiza `specs/` (ver
  `specs/README.md`).
- O workflow `.github/workflows/CR.yml` roda code-review automático no diff;
  não ignore seus apontamentos sem justificativa.

## 14. Proibições resumidas

1. `any` evitável.
2. `dangerouslySetInnerHTML` sem sanitização.
3. `ipcRenderer`/`require`/`process` no renderer.
4. Fetch/axios/socket fora de `services/`.
5. Reduzir `strict` do TypeScript.
6. Afrouxar a CSP com `'unsafe-inline'`/`'unsafe-eval'` (ver security).
7. Estado global para coisa local resolvível com `useState`.
8. Prefixo `I` em interfaces.
