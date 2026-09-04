# Zynk — Regras de Validação e Testes (Rígidas)

> **Documento normativo e RÍGIDO.** Define as barreiras de qualidade que todo
> código DEVE atravessar antes de ser considerado "pronto". Vocabulário RFC
> 2119.

## 0. Princípio geral

> **"Pronto" ≠ "compila".** Pronto = compila sob `strict`, valida nos testes
> obrigatórios, passa na barrier de qualidade, não regride segurança, e está
> documentado em `specs/` quando aplicável.

---

## 1. Barreiras de validação (comando)

As seguintes validações DEVERÃO passar em todo PR. Elas devem rodar sem erro
antes do merge:

| # | Validação | Comando | Fase |
|---|---|---|---|
| 1 | **Compilação TypeScript (strict)** | `npx tsc --noEmit` | OBRIGATÓRIO — falha bloqueia |
| 2 | **Build de produção** | `npm run build` | OBRIGATÓRIO — falha bloqueia |
| 3 | **Testes unitários** | `npm test` (quando configurado) | OBRIGATÓRIO — falha bloqueia |
| 4 | **Code-review automático** | `.github/workflows/CR.yml` | OBRIGATÓRIO — apontamentos devem ser resolvidos/justificados |

> Até a suíte de testes ser configurada (seção 2 do strategy), as validações 1 e 2
> são as obrigatórias; a 3 entra em vigor assim que `npm test` existir.

### 1.1 Falhas bloqueantes (não negociáveis)

- **Qualquer erro de `tsc --noEmit`** — bloqueia merge. Não se faz merge com
  tipo quebrado.
- **Qualquer teste de regressão obrigatório falhando** — bloqueia merge.
- **Qualquer erro de build de produção** — bloqueia merge.

### 1.2 Falhas por padrão (devem ser toleradas apenas com justificativa)

- Violação de `specs/security/security-rules.md` de gravidade **Alta/Crítica**
  — bloqueia merge imediatamente (ver `security-rules.md` §17).
- Aumento de coerção de tipo insegura (`as unknown as`, `as any`) novo sem
  justificativa.

## 2. Regras por tipo de mudança

### 2.1 Mudança de utilidade pura (`src/utils/`)
- **OBRIGATÓRIO** escrever teste unitário cobrindo: comportamento principal,
  edge cases (vazio, nulo, valores-limite) e invariantes.
- Se for matemática de cor (`color.ts`), testar determinismo e faixa de
  valores (RGB 0..255), além de contraste.

### 2.2 Mudança em store Zustand
- **OBRIGATÓRIO** cobrir com teste (se ação tocar rede, mockar o service).
- **Máquina de estado:** testar transições válidas E inválidas.
- **Logout/limpeza:** se a store participa do `logout`, testar que seus dados
  são limpos (não vazar entre contas).

### 2.3 Mudança em `services/` (rede/nativo)
- **Testar interceptors** de `api.ts`: presença de `Authorization: Bearer` e
  limpeza de token/logout em 401.
- **Testar singleton de socket:** conecta uma vez, desconecta e limpa
  listeners.
- Mudança em `iceServers.ts`/CSP/`connect-src`: revisar `security-rules.md` §8.

### 2.4 Mudança em componente React
- Teste de componente obrigatório **apenas** se o componente tem lógica de
  estado/propriedades não trivial ou é crítico de segurança (login/registro,
  dialogs que manipulam dados). Componente puramente visual e sem lógica
  PODE ficar sem teste dedicado.
- **PROIBIDO** testar framework — somente nossa lógica.

### 2.5 Mudança no processo main (`electron/`)
- **Não automatizável facilmente** (Electron); exigir **validação manual**
  (ver `testing-strategy.md` §7) + revisão de segurança (§ IPC handlers
  validam entrada, path dentro do root).
- Mudança em CSP: seguir `security-rules.md` §8 e atualizar doc.

### 2.6 Mudança de pipeline/segurança (CSP, IPC, preload, release)
- **OBRIGATÓRIO** atualizar `specs/security/*` e `specs/architecture/` quando
  o comportamento mudar.
- Revisar o threat model (`threat-model.md`).

## 3. Critérios de qualidade de código (todos os PRs)

| Critério | Status |
|---|---|
| TypeScript `strict` sem erros | Requerido |
| Sem `any` novo evitável | Requerido |
| Sem `dangerouslySetInnerHTML` novo sem sanitização | Requerido |
| Sem segredo/token hardcoded ou logado | Requerido |
| Sem acesso a `ipcRenderer`/`require`/`process` no renderer | Requerido |
| Handlers IPC validam entrada (tipo/tamanho/path) | Requerido |
| CSP não afrouxada em `script-src` | Requerido |
| Fetch/axios/socket dentro de `services/` | Requerido |
| Nomenclatura e imports conforme `patterns/conventions.md` | Requerido |

## 4. Testes — o que NÃO se aceita

- **PROIBIDO** teste que "passa" por falso positivo: teste sem assert,
  teste que só testa o mock (não o comportamento real), teste com `skip`
  permanente sem justificativa.
- **PROIBIDO** teste que depende de rede/backend real (usar mock/determinismo).
- **PROIBIDO** remover teste para "fazer passar" sem corrigir o bug que o
  teste está pegando. Se o teste está errado, corrigir o teste — mas
  primeiro confirmar que não é o código que está errado.
- Teste flaky (intermitente) é defeito de qualidade e DEVE ser corrigido ou
  removido com justificativa — nunca ignorado.

## 5. Checklist final antes de abrir PR (OBRIGATÓRIO)

- [ ] `npx tsc --noEmit` passa.
- [ ] `npm run build` passa (produção).
- [ ] Testes obrigatórios do módulo alterado passam e cobrem edge cases.
- [ ] Nenhuma violação de `security-rules.md` de gravidade Alta/Crítica.
- [ ] Se mexeu em `src/utils/`: teste unitário adicionado/atualizado.
- [ ] Se mexeu em store com ação de rede: teste com mock de service.
- [ ] Se mexeu em `services/api.ts`: interceptors cobertos.
- [ ] Se mexeu em `electron/`: revisou segurança de IPC + validação manual
      aplicável + atualizou `specs/security/` se mudou comportamento.
- [ ] Se mexeu em CSP/pipeline/release: atualizou `specs/architecture/` e
      `specs/security/`.
- [ ] `logout` continua limpando cross-stores (não regrediu).
- [ ] Sem segredos novos no diff.
- [ ] Sem `any`/`as any` novo injustificado.

## 6. Rituais de rigor (quando pedido pelo responsável)

1. **Testes rodados em modo CI-equivalente** (`vitest run`, não watch) antes
   do merge.
2. **Análise estática** adicional quando aplicável para paths de segurança
   (paths de arquivo, inputs de handlers IPC).
3. **Revisão de diff por módulo afetado**, não só do diff inteiro.

## 7. Escalonamento de problemas

- Problema de **Alta/Crítica** (segurança): não fecha PR; corrigir primeiro.
- Problema de **Média** (falta de validação, teste ausente): corrigir antes do
  merge ou registrar issue rastreada e bloquear merge até resolução.
- Problema de **Baixa** (convenção): corrigir quando conveniente; não é
  bloqueante, mas o padrão deve ser mantido.
