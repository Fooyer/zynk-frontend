# Zynk — Regras de Segurança

> **Documento normativo e RÍGIDO.** Estas regras são de cumprimento
> obrigatório. Violação deliberada é critério de bloqueio de PR.
> Vocabulário RFC 2119 (DEVE, NÃO DEVE, OBRIGATÓRIO, PROIBIDO, PODE).

---

## 0. Princípios fundamentais

1. **Privilégio mínimo.** Cada processo/camada deve ter o menor poder
   necessário. O renderer NÃO é confiável e nunca deve ter acesso direto a
   Node/nativo.
2. **Defesa em profundidade.** Nunca confiar em uma única camada de
   segurança.
3. **Fail-closed.** Em caso de falha/ambiguidade, negue/feche (fail closed),
   não deixe passar.
4. **O backend é a fonte de verdade.** Regras de autorização (quem pode
   mandar mensagem, entrar em grupo, etc.) são impostas no backend. O
   frontend apenas reflete. Segurança de autorização **nunca** deve ser a
   única barreira no frontend.

---

## 1. Configuração do BrowserWindow (mandatória)

As seguintes opções são **OBRIGATÓRIAS** e não devem ser relaxadas em
produção (`electron/main.ts`):

```ts
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,   // OBRIGATÓRIO
  nodeIntegration: false,   // OBRIGATÓRIO
}
```

- **PROIBIDO** `nodeIntegration: true`.
- **PROIBIDO** `contextIsolation: false`.
- **NÃO DEVE** ser usado `sandbox: false` sem justificativa documentada e
  revisão.

## 2. Ponte IPC (contextBridge)

- O renderer acessa o main **somente** através de `window.electronAPI`
  exposto por `contextBridge.exposeInMainWorld` em `electron/preload.ts`.
- **PROIBIDO** expor `ipcRenderer` genérico, `ipcRenderer.send`/`invoke`
  crus, `process`, `require` ou qualquer API que permita o renderer chamar
  handlers arbitrários do main.
- Cada método exposto deve ter uma assinatura tipada e estreita. **Não**
  criar um método coringa tipo `invoke(channel, ...args)`.
- A interface de `window.electronAPI` fica em `src/types/index.ts`
  (`declare global`). Qualquer método novo DEVE ser adicionado nesses 3
  pontos: `preload.ts`, `main.ts` (handler) e `types/index.ts`.

## 3. Validação de entrada no processo main

O processo main **nunca** confia em argumentos vindos do renderer. Para todo
IPC handler que recebe dados (especialmente paths de arquivo):

- **Path traversal** — **PROIBIDO** aceitar paths arbitrários sem validação.
  Os handlers de filesystem/código (`fs:*`, `tunnel:*`) recebem paths do
  renderer; validar que estão dentro da pasta de trabalho escolhida pelo
  usuário antes de ler/escrever. Ex.: `tunnel:write-remote-file` faz
  `path.join(folderPath, relativePath)` — garantir que `relativePath` não
  escapole com `..` e que o resultado permanece sob `folderPath`.
- Validar tipos (número/string), tamanhos e limites:
  - Arquivos a ler/processar devem ter limite de tamanho (ex.: o file
    watcher ignora arquivos > 1 MB — `if (stat.size > 1024 * 1024) return`).
  - Validar números de slot de gamepad (1..N), channelId, etc., no main.
- Tratar erros com `try/catch` e retornar estado de falha **sem** vazar
  detalhes internos (stack traces, paths internos) para o renderer.

## 4. Segredo / credenciais

- **PROIBIDO** hardcodar segredos no código fonte (tokens, senhas, chaves de
  API, URLs internas sensíveis).
- Credenciais de TURN e token de publicação vêm de variáveis de ambiente
  (`.env`, `.env.example`).
- **O `.env` não é versionado** (está no `.gitignore`). Comprometer segredo =
  rotacionar imediatamente e revisar histórico do git.
- **PROIBIDO** logar tokens, senhas, headers de autorização ou dados
  sensíveis. Refletir os logs do `authStore`/interceptors.
- O token JWT fica em `localStorage` (decisão existente) e é enviado como
  `Authorization: Bearer` pelo interceptor do axios e como `auth.token` do
  Socket.IO. Nunca logue esse valor.

## 5. Abrir links externos com segurança

- Qualquer `window.open`/navegação para URL externa **DEVE** passar pelo
  `setWindowOpenHandler` que usa `shell.openExternal` e retorna
  `{ action: 'deny' }` (já implementado):
  ```ts
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  ```
- **PROIBIDO** deixar o `webContents` navegar para URLs arbitrárias dentro
  da janela (permitir que o app vire um browser de conteúdo remoto).
- URLs exibidas ao usuário (ex.: link de vídeo no "assistir junto") NÃO devem
  ser abertas em `webview`/iframe não confiável. O iframe do YouTube é a
  única exceção autorizada (ver §8).

## 6. Renderização de conteúdo

- **PROIBIDO** `dangerouslySetInnerHTML` sem sanitização explícita.
  Mensagens/conteúdo de backend são texto; deixar o React escapar. Se
  conteúdo rico for necessário, usar biblioteca de sanitização e revisar.
- **PROIBIDO** `eval`, `new Function`, `innerHTML` para processar dados.
  (WASM do RNNoise é a exceção para compilação, ver §8.)
- **PROIBIDO** renderizar URLs de imagem de usuário/backend sem restringir
  esquema/domínio onde cabível (`img-src` na CSP já limita — ver §8).
- Conteúdo colaborativo (código em Monaco, notas) é texto tratado como não
  executável na renderização (o Monaco exibe como texto; nenhuma execução).

## 7. WebRTC, áudio e gravação

- **Acesso a câmera/microfone:** o Chromium pede permissão; garantir que o
  app não solicite captura sem ação do usuário e que elementos de mídia
  remotos não vazem entre chamadas.
- **Screen sharing:** o usuário escolhe a fonte (`ScreenPicker`); o
  `setDisplayMediaRequestHandler` no main retorna apenas a fonte que o
  renderer selecionou via IPC. **PROIBIDO** capturar tela automaticamente.
- Após encerrar chamada/screen-share, **parar streams e tracks** (evitar
  mic/câmera "fantasma" ativos).
- ICE/TURN: as credenciais TURN têm validade; nunca expor credenciais em
  logs. A CSP controla `connect-src` para STUN/TURN.

## 8. Content-Security-Policy (produção)

A CSP é injetada **apenas em produção** pelo `electron/main.ts`
(`onHeadersReceived`), **apenas para respostas da própria origem**
(`http://127.0.0.1:PORT/`), para não derrubar o iframe/scripts do YouTube.

Resumo da política (fonte normativa = código em `main.ts`):

| Diretiva | Valor | Observação |
|---|---|---|
| `default-src` | `'self'` | Base restritiva |
| `script-src` | `'self'` `'wasm-unsafe-eval'` `https://www.youtube.com` | `'wasm-unsafe-eval'` **não** libera `eval()` de JS — só WebAssembly (RNNoise). Sem `'unsafe-inline'` |
| `style-src` | `'self'` `'unsafe-inline'` `https://fonts.googleapis.com` | `unsafe-inline` para estilos (ok; não é script) |
| `font-src` | `'self'` `https://fonts.gstatic.com` | |
| `connect-src` | `'self'` `https://zynk.fooyer.com` `ws/wss://zynk.fooyer.com` `wss://signaling.yjs.dev` `stun:` `turn:` `https:` | `https:` solto para links diretos de vídeo + hls.js |
| `img-src` | `'self'` `data:` `blob:` `https://zynk.fooyer.com` | |
| `media-src` | `'self'` `https:` `blob:` | para `<video>` de links externos |
| `frame-src` | `https://www.youtube.com` | somente o embed do YouTube |

**Regras de manutenção da CSP:**

1. **PROIBIDO** adicionar `'unsafe-inline'` a `script-src` ou
   `'unsafe-eval'`. O projeto resolve assets inline externalizando (ver §10).
2. **PROIBIDO** ampliar `default-src` para `*` ou permitir `data:`/`blob:` em
   `script-src`.
3. Toda origem nova (API, sinalizadores, TURN, embed) DEVE ser adicionada
   à diretiva correta **e** justificada neste documento/comentário.
4. Ao adicionar capacidade nova que precise de recurso bloqueado pela CSP,
   resolver **externalizando** (arquivo `self`) ou alargando a diretiva
   específica — **nunca** afrouxando script-src globalmente.

## 9. Servidor HTTP local (loopback)

- O build de produção é servido por `http://127.0.0.1:PORT` (portas fixas
  `47823-47825`, fallback curto). **OBRIGATÓRIO** ligar somente em
  `127.0.0.1` (loopback), **nunca** em `0.0.0.0`/interface de rede, para
  não expor o app à rede local.
- A porta é fixa (não efêmera) porque o backend precisa conhecer a origem
  para CORS.
- Garantir que o servidor serve **apenas os arquivos do próprio build**
  (não um diretório arbitrário). MIME types controlados.

## 10. Assets e Worklets (não inline)

- O Monaco injeta um script inline (`self["MonacoEnvironment"]`); o build o
  **externaliza** para `monaco-env.js` (servido por `self`) — `vite.config.ts`
  `externalizeMonacoEnv`.
- AudioWorklets (`agcWorklet.js`, `noiseGateWorklet.js`) são importados com
  `?url` e `assetsInlineLimit: 0` os mantém **fora** da página como arquivos
  reais (servidos por `self`) — evitando `data:` em `script-src`.
- **Regra:** nunca resolver restrição de CSP inlinando script como `data:`.

## 11. Dados não-lidos / badge / notificação

- Os PNGs de badge são gerados no renderer (canvas) e enviados como dataURL
  por IPC. O main deve tratar o recebimento de forma segura
  (`nativeImage.createFromDataURL`), sem interpretar o dataURL como código.

## 12. Gamepad emulação

- Slots de gamepad criados via IPC (`gamepad:create-slot`). Validar no main
  o número do slot e o estado enviado (`GamepadInputState`) — evitar valores
  fora de faixa em `buttons`/`axes`.
- **PROIBIDO** permitir ao renderer criar/alterar slots sem validação de
  limites.
- Limpeza obrigatória em `before-quit` (`cleanupGamepad`).

## 13. Sessão / múltiplas contas

- No `logout`, o `authStore` **DEVE** limpar todos os stores (não vazar
  dados entre contas): `useChatStore.clearMessages()`, reset de
  `friendStore`, `uiStore`, etc.
- **PROIBIDO** manter dados de usuário anterior na memória após troca de
  conta.
- Na expiração de token (HTTP 401), o interceptor remove o token e recarrega
  — comportamento esperado, mantê-lo.

## 14. Dependências e supply-chain

- Manter dependências fixas em `package.json` com `package-lock.json`
  versionado (reprodutibilidade).
- **PROIBIDO** adicionar dependência sem avaliar necessidade e risco
  (manutenção, tamanho, scripts pós-instalação). O `allowScripts` em
  `package.json` é a lista explícita de pacotes com scripts de instalação
  permitidos (`esbuild`, `electron`).
- **PROIBIDO** instalar dependência desconhecida de fonte não verificada.

## 15. Atualizações (auto-update)

- O `autoUpdater` (electron-updater) busca releases no GitHub. A verificação
  de integridade segue as checksums do `latest.yml`/`latest-linux.yml`
  (electron-updater nativo).
- **PROIBIDO** desativar a verificação de atualização ou pular validação de
  assinatura/checksum sem justificativa forte.
- Publicação: `scripts/publish-release.js` faz upload dos artefatos. O nome
  dos assets é sanitizado (espaço → hífen) para casar com o que o auto-update
  espera — preservar essa lógica.

## 16. Checklist de segurança do PR (OBRIGATÓRIO em todo PR)

- [ ] Sem `any` desnecessário criado ou ampliado.
- [ ] Sem `dangerouslySetInnerHTML` novo sem sanitização.
- [ ] Nenhum segredo/token hardcoded ou logado novo.
- [ ] Nenhum acesso a `ipcRenderer`/`require`/`process` no renderer.
- [ ] Handlers IPC novos validam entrada (tipo, tamanho, path dentro do root).
- [ ] CSP não foi afrouxada em `script-src` (sem `unsafe-inline`/`unsafe-eval`).
- [ ] Nada em `connect-src`/`frame-src`/`media-src` adicionado sem justificação
      no documento/comentário.
- [ ] Dado de API renderizado sem desativar escaping do React.
- [ ] Se mexe em lifecycle de janela/atualização, não quebra o fail-closed.
- [ ] Atualizou `specs/security/*` se o comportamento de segurança mudou.

## 17. Classificação de violações

| Gravidade | Exemplo | Ação |
|---|---|---|
| **Crítica** | Expor `ipcRenderer` cru, `nodeIntegration: true`, afrouxar script-src com `unsafe-eval`, logar senha/token, path traversal real | Bloqueia release; corrigir imediatamente |
| **Alta** | `dangerouslySetInnerHTML` sem sanitização, validação ausente em handler IPC, vazar dados entre contas | Bloqueia merge do PR |
| **Média** | Falta de tratamento de erro que expõe stack, `any` evitável, novo domínio em CSP sem justificativa | Deve ser corrigido antes do merge; CC pode apontar |
| **Baixa** | Convenção de nomenclatura, formatação | Não bloqueia, mas deve ser seguido |
