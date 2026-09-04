# Zynk — Especificações de Design (SDD)

Este diretório centraliza a documentação de design do frontend do **Zynk**.
É a fonte de verdade normativa para arquitetura, segurança, estrutura e
validação de qualidade do projeto.

> **Idioma:** os documentos são escritos em português (pt-BR), alinhado ao
> código do projeto (comentários e mensagens em pt-BR). Nomes de código,
> APIs e identificadores permanecem em inglês.

## Índice

| Documento | Caminho | Descrição |
|---|---|---|
| Arquitetura & Estrutura | [`architecture/overview.md`](architecture/overview.md) | Visão geral da stack, fluxo de dados, processos principal vs. renderer |
| Estrutura de Diretórios | [`architecture/directory-structure.md`](architecture/directory-structure.md) | Árvore oficial de pastas e regras de colocação de código |
| Padrões & Convensões | [`patterns/conventions.md`](patterns/conventions.md) | Nomes, imports, estado, hooks, componentes, estilos |
| Regras de Segurança | [`security/security-rules.md`](security/security-rules.md) | Regras rígidas de segurança no renderer, no processo main e no IPC |
| Segurança — Threat Model | [`security/threat-model.md`](security/threat-model.md) | Ameaças a mitigar e contramedidas |
| Testes & Validação | [`testing/testing-strategy.md`](testing/testing-strategy.md) | Estratégia de testes, o que cobrir e como executar |
| Regras de Teste (rígidas) | [`testing/validation-rules.md`](testing/validation-rules.md) | Checklists obrigatórias e barreiras de qualidade |
| Pipeline de Release | [`architecture/release-pipeline.md`](architecture/release-pipeline.md) | Build, assinatura, publicação e auto-update |

## Como estes documentos se relacionam

```
                    ┌───────────────────────┐
                    │  overview.md          │  (comece aqui)
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
  directory-structure    patterns/conventions   security/security-rules
        │                       │                       │
        │                       │                       ▼
        │                       │              security/threat-model
        │                       │
        └───────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │  release-pipeline     │
    └───────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │ testing/strategy      │
    │ testing/validation   │  (barreiras de qualidade)
    └───────────────────────┘
```

## Regras de manutenção desta documentação

1. **Toda mudança de arquitetura ou segurança DEVE atualizar o documento
   correspondente no mesmo PR.** Não é aceito PR que altere o comportamento
   de um sistema documentado sem tocar na documentação.
2. **Fatos observáveis no código têm precedência** sobre o que está escrito
   aqui. Se o código e a doc divergirem, o código é o certo e a doc deve ser
   corrigida (e o contrário é um bug documental).
3. Documentos são **exigências normativas** (devem), não sugestões — exceto
   onde marcado explicitamente como *"recomendado"* ou *"opcional"*.
4. Mantenha tabelas e checklists no formato Markdown simples. Não use emojis.
5. O vocabulário de nível de obrigação segue RFC 2119: **DEVE**, **NÃO DEVE**,
   **OBRIGATÓRIO**, **PROIBIDO**, **PODE**, **RECOMENDADO** (ver
   `patterns/conventions.md`).
```
