# Zynk — Pipeline de Release

> Especificação do processo de build, empacotamento, publicação e
> auto-atualização. Baseado em `package.json`, `electron-builder.yml`,
> `scripts/publish-release.js` e nos comentários de `electron/main.ts`.

## 1. Comandos de build

| Script | O que faz |
|---|---|
| `npm run build` | `tsc && vite build && electron-builder --publish never` (plataforma atual) |
| `npm run build:win` | `tsc && vite build && electron-builder --win --publish never` |
| `npm run build:linux` | `tsc && vite build && electron-builder --linux --publish never` |
| `npm run release` | `build:win` + `build:linux` + `dotenv -e .env -- node scripts/publish-release.js` |
| `npm run electron:dev` | `vite build && electron .` — roda o Electron sobre o build (útil para testar sob a CSP de produção) |

- Todos usam `--publish never`: o build **não** publica; a publicação é feita
  separadamente pelo script `publish-release.js`.
- `tsc` roda antes do `vite build` (valida tipos).

## 2. Fase de build (electron-builder)

- Config em `electron-builder.yml` (gerador de instaladores,
  `latest*.yml`, ícones, etc.).
- Saída em `release/` (ex.: instalador NSIS `Zynk Setup <versão>.exe`,
  `latest.yml`, AppImage + `latest-linux.yml`, blockmaps).
- A pasta `release/` **acumula** os builds de todas as versões (nunca é
  limpa sozinha) — o script de publicação filtra o que subir.

## 3. Fase de publicação (`scripts/publish-release.js`)

O script publica os artefatos de `release/` no **GitHub Releases**
(repo `Fooyer/zynk-frontend`).

### 3.1 Por que um script próprio (e não o publish nativo)
O publish nativo do electron-builder tem um bug conhecido de corrida
(`PublishManager` cacheava o publisher depois de esperar a criação da
release — uploads concorrentes podiam criar releases duplicadas). Este script
resolve/cria a release **uma única vez antes de qualquer upload**, evitando a
corrida. Preservar essa propriedade.

### 3.2 Detalhes importantes (NÃO alterar sem cuidado)
- **Seleção de artefatos:** só extensões `ASSET_EXTENSIONS` (`.exe`,
  `.blockmap`, `.yml`, `.appimage`, `.dmg`, `.zip`); e o filtro
  `latest*.yml` **ou** arquivos que contenham `pkg.version` — evita subir o
  histórico antigo de `release/`.
- **Sanitização de nome:** o instalador sai com espaço no nome
  ("Zynk Setup 0.7.1.exe"), mas o `latest.yml` referencia com hífen
  ("Zynk-Setup-0.7.1.exe"). O script substitui espaço por hífen no nome do
  asset **para casar com a URL que o auto-updater espera**. Sem isso o
  auto-update dá 404 silencioso. Esta lógica é crítica.
- **Token:** `GH_TOKEN` (ou `GITHUB_TOKEN`) vindo do `.env`.
- **Release draft:** cria a release como `draft: true` (o `collectAssets` +
  upload acontecem antes de publicar).

## 4. Auto-atualização (electron-updater)

- `setupAutoUpdater` em `electron/main.ts` (só quando `app.isPackaged`).
- `autoDownload = true` e `autoInstallOnAppQuit = true`.
- Primeira checagem 10s após abrir; depois a cada 4h enquanto aberto.
- Eventos enviados ao renderer: `update:checking`, `update:available`,
  `update:not-available`, `download-progress`, `update-downloaded`,
  `update:error`; ações: `update:check` (manual), `update:restart`.
- Plataformas:
  - **Windows** lê `latest.yml` (NSIS).
  - **Linux** lê `latest-linux.yml` (AppImage).
  - Não há "detecção e redirecionamento" de plataforma — cada instalação
    sabe seu próprio SO.
- Verificação de integridade/checksum é feita pelo electron-updater nativo.

## 5. Versionamento

- Versão em `package.json` (ex.: `0.7.2`).
- Tag de release: `v<pacote.version>`.
- **Regra:** não publicar sem que `tsc`/`vite build` passem (ver
  `validation-rules.md`).

## 6. Segurança do pipeline

Ver `security-rules.md` §15. Pontos-chave:
- Não logar `GH_TOKEN`.
- Preservar a sanetização de nome (casa com `latest*.yml`).
- Não desativar validação de checksum do auto-updater.
- O `.env` com `GH_TOKEN` não é versionado.

## 7. Checklist de release

- [ ] `npx tsc --noEmit` e `npm run build` passam.
- [ ] Versão em `package.json` incrementada corretamente.
- [ ] `release/` contém os artefatos da versão atual.
- [ ] `GH_TOKEN` presente no `.env`.
- [ ] `npm run release` gera a release draft e sobe todos os artefatos.
- [ ] Conferir no GitHub que `latest.yml`/`latest-linux.yml` batem com os
      nomes de artefatos (espaço→hífen).
- [ ] Testar auto-update numa instalação real (detecta a versão nova).
