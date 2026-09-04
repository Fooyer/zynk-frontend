# Zynk — Threat Model

> Modelo de ameaças do frontend (Electron). Identifica atores, ativos e
> ameaças, e a contramedida correspondente. As regras detalhadas de
> implementação estão em `security/security-rules.md`; este documento é o
> raciocínio por trás delas.

## 1. Atores

| Ator | Confiabilidade | Interesse malicioso |
|---|---|---|
| Usuário local | Alto (dono do app) | Baixo, mas pode ser vítima de outra ameaça |
| Usuário remoto (peer em chat/call) | Não confiável | Enviar conteúdo malicioso, phishing, exploração de UI |
| Atacante de rede | Não confiável | MitM, forjar/persistir sessão, DDoS em sinalização |
| Código malicioso dentro do processo renderer (XSS) | Não confiável | Acesso a Node/main, roubo de token, spawn de processo |

## 2. Ativos

| Ativo | Sensibilidade |
|---|---|
| Token JWT (autenticação) | Alta |
| Dados de usuário/conversas | Alta |
| Credenciais TURN / tokens de API | Média |
| Código/arquivos locais (code sessions) | Alta |
| Marcador de gamepad / screen capture | Baixa-Média |
| Acesso ao sistema via IPC do main | **Crítica** |

## 3. Matriz de ameaças × contramedidas

| ID | Ameaça | Impacto | Vetor | Contramedida principal |
|---|---|---|---|---|
| T1 | **RCE no renderer via XSS** que escala para o main | Crítico | Conteúdo de chat malicioso; `dangerouslySetInnerHTML`; `eval` | `contextIsolation: true`, `nodeIntegration: false`, ponte estreita via preload, CSP rígida, escaping React, sanitização |
| T2 | **Escalada de privilégio via IPC** (renderer chama handler cru) | Crítico | Expor `ipcRenderer` genérico na bridge | `contextBridge` com métodos estreitos e tipados; estilo `dominio:acao`; sem `invoke` coringa |
| T3 | **Path traversal** em handlers de filesystem/código | Alto | `fs:*`, `tunnel:*` com path do renderer contendo `..` | Validar path dentro do root escolhido; limites de tamanho; try/catch fail-closed |
| T4 | **Exfiltração de dados/dados entre contas** | Alto | Troca de conta sem limpar estado | `logout` limpa todos os stores; remove token; desconecta socket |
| T5 | **Seqüestro/roubo de token** | Crítico | XSS, log indevido, MitM em transporte | Token em `localStorage`; HTTPS (`https://zynk.fooyer.com`) no transporte; PROIBIDO logar token; interceptor 401 limpa token |
| T6 | **Conteúdo remoto malicioso renderizado** (iframe/webview) | Alto | `frame-src` aberto, link externo abrindo dentro da janela | CSP `frame-src` só YouTube; `setWindowOpenHandler` → `shell.openExternal` + deny; não navegar o webContents |
| T7 | **MitM em WebRTC/media** | Médio | STUN/TURN não autenticados | `connect-src` restringe; DTLS/SRTP nativo do WebRTC; TURN autenticado quando configurado |
| T8 | **Captura não autorizada** (mic/câmera/tela) | Médio | Chamada automática ou screen-share automático | Acesso exigido por ação de usuário; `setDisplayMediaRequestHandler` usa só a fonte escolhida via IPC; parar tracks no encerramento |
| T9 | **Abuso de atalhos globais** | Baixo | Atalhos capturados com ação indesejada | Lista controlada; `unregisterAll` na troca; falhas reportadas |
| T10 | **Abuso de gamepad virtual** | Médio | Slot/estado fora de faixa injetando input em jogos | Validar slot e `GamepadInputState` no main; cleanup em `before-quit` |
| T11 | **Abuso de atualização** (release falsa / downgrade) | Alto | Servir binário malicioso via auto-update | electron-updater valida `latest*.yml`; origem GitHub Releases; checksums nativos |
| T12 | **CSP vazando/afrouxada** | Alto | Regressão que adiciona `unsafe-eval`/`unsafe-inline` a script-src | Filtro `onHeadersReceived` só para a própria origem; checklist de PR; este documento como guard-rails |

## 4. Superfície de ataque priorizada

1. **IPC (main)** — a superfície mais crítica. Todo handler exposto eleva o
   poder de um XSS. Manter a ponte mínima e validar entradas.
2. **Conteúdo renderizado** (chat, mensagens, código colaborativo, links) —
   origem de XSS. Apenas texto escapado.
3. **Redes/media** — transporte já HTTPS; WebRTC protegido por SRTP/DTLS.
4. **Filesystem local** — handlers `fs:*`/`tunnel:*` — risco de leitura/
   escrita arbitrária; validar paths.

## 5. Pressupostos e limites

- O **backend é a fonte de verdade** de autorização (membros de grupo, amigos,
  envio de mensagem). O frontend NÃO deve ser a única barreira de autorização.
- O TURN público (`expressturn.com`) é para desenvolvimento; em produção real,
  configurar TURN próprio com credenciais via `VITE_TURN_*`.
- O servidor HTTP local é loopback-only e serve apenas o próprio build; não é
  uma API pública.

## 6. Mitigações compensatórias por recurso

| Recurso | Riscos | Mitigações |
|---|---|---|
| Editor colaborativo (Monaco/Yjs) | Injeção de conteúdo no documento | Tratar como texto; Monaco não executa o conteúdo; HL via y-webrtc autenticada |
| Watch-together (YouTube/URL) | O link direto pode ser de host qualquer | `media-src https:`/`media blob:` restringem; player em sandbox; sem executar scripts do host |
| Screen-sharing | Vazar tela indesejada | Picker obrigatório; fonte escolhida via IPC; preview |
| Gamepad emulação | Injeção de input ao SO | Limitar slots; validar estado; cleanup no quit |

## 7. Revisão de ameaças

- O threat model deve ser revisado a cada mudança que introduza **novo canal
  de comunicação** (novo IPC handler, novo embed, novo domínio na CSP, novo
  protocolo WebRTC).
- Toda adição de superfície DEVE atualizar esta matriz e as regras.
