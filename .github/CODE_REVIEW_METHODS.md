# CR com IA: metodologias e comparação

## O que existe consolidado sobre isso

Não existe uma norma única e oficial ("a" metodologia de CR com IA). Não há
um RFC, um padrão ISO, nem um workflow de referência do GitHub que todo
mundo siga. O que existe é convergência de mercado: ferramentas comerciais
independentes (CodeRabbit, Qodo/PR-Agent, Sourcery, Graphite) e pesquisa
acadêmica recente chegaram, por caminhos diferentes, aos mesmos punhados de
padrões. Esses padrões é que este repositório implementa e compara:

1. **Diff-only + prompt fixo (single-pass).** O ponto de partida de quase
   toda ferramenta: um prompt com critérios, aplicado às linhas alteradas.
   Rápido e barato, mas cego a tudo que não está no hunk.
2. **Híbrido: análise estática + LLM.** Rodar ferramentas determinísticas
   (linter, type-checker, SAST) antes do modelo e instruir o modelo a não
   redizer o que elas já pegaram — só complementar com o que exige
   raciocínio semântico. A literatura reporta reduções de 94–98% em falsos
   positivos nesse padrão vs. LLM sozinho (Code Broker, LLIFT).
3. **Multi-agente especializado.** Em vez de um prompt genérico cobrindo
   tudo, agentes paralelos com escopo estreito (correção, segurança,
   performance, estilo/arquitetura) — usado pela Qodo 2.0 (multi-agent
   review architecture) e por sistemas de pesquisa como AutoReview e
   CodeX-Verify (4 agentes especializados rodando em paralelo).
4. **Contexto estendido (cross-file / repo-aware).** Em vez de só o diff,
   indexar ou reunir arquivo completo + dependências/dependentes. É o
   diferencial citado para a Qodo detectar mais bugs que ferramentas
   diff-only em benchmarks de mercado (82% vs. 44% citado em comparativos).
5. **Propor-então-verificar (self-verification / chain-of-verification).**
   Uma passada gera candidatos, uma segunda passada — com o código real na
   frente de novo — confirma ou descarta cada um antes de virar comentário
   final. É como o próprio `/code-review` (skill deste Claude Code) decide
   entre veredito `CONFIRMED` e `PLAUSIBLE`, e é citado por sistemas
   acadêmicos multi-agente como forma de reduzir ruído sem perder cobertura.

Nenhuma ferramenta comercial usa só um desses padrões — CodeRabbit combina
AST + LLM (padrão 2), Qodo combina multi-agente + contexto de repo
(padrões 3 + 4). Este repositório separa cada padrão em um workflow próprio
de propósito para você ver o efeito de cada um isoladamente, em vez de um
só workflow "black box" que já mistura tudo.

## Os 5 métodos implementados

| # | Workflow | Método | Trigger | Como comparar |
|---|----------|--------|---------|----------------|
| A | [`CR.yml`](workflows/CR.yml) *(já existia)* | Baseline: diff-only, prompt único fixo | Automático em todo PR (opened/sync/reopened) | Referência — é o que os outros métodos tentam melhorar |
| B | [`cr-hybrid-static.yml`](workflows/cr-hybrid-static.yml) | Híbrido: `tsc --noEmit` + `oxlint` antes do LLM | Comentário `/cr-hybrid` ou manual | Menos achados triviais de tipo/lint repetidos; achados mais focados em lógica/arquitetura |
| C | [`cr-multi-agent.yml`](workflows/cr-multi-agent.yml) | 4 agentes paralelos por especialidade | Comentário `/cr-agents` ou manual | 4 comentários distintos em vez de 1 — compare profundidade por categoria vs. o comentário único do baseline |
| D | [`cr-context-aware.yml`](workflows/cr-context-aware.yml) | Contexto estendido: arquivo completo + importadores (grep) | Comentário `/cr-context` ou manual | Único capaz de sinalizar quebra de contrato em arquivos que o PR não tocou |
| E | [`cr-verify.yml`](workflows/cr-verify.yml) | Duas passadas: rascunho → verificação | Comentário `/cr-verify` ou manual | Compare o comentário `🔍 DRAFT` com o `✅ VERIFIED` no mesmo PR — a diferença de contagem *é* o ruído removido |

Todos (B–E) também podem ser disparados manualmente pela aba **Actions →
[workflow] → Run workflow**, informando o número do PR — não precisa
comentar no PR pra testar.

## Por que os métodos B–E são opt-in (comentário/manual) e não automáticos

Isso também é achado de pesquisa, não só custo: times que recebem
comentário automático de IA em todo PR, sem controle, tendem a silenciar o
bot em poucos meses quando ele discorda demais do time — cada comentário
"errado" corrói confiança. Manter o baseline (A) automático, porque já é o
comportamento estabelecido deste repo, e os demais como comando explícito
evita empilhar 5 revisões de IA por PR e deixa você escolher o método pelo
tipo de mudança (ex.: `/cr-context` numa mudança de contrato de API,
`/cr-verify` quando quer o mínimo de ruído possível).

## Trade-offs práticos

| Método | Custo (chamadas de LLM) | Latência | Ruído esperado | Ponto forte | Ponto fraco |
|---|---|---|---|---|---|
| A. Baseline | 1 | Baixa | Médio | Simples, já rodando | Sem verificação, sem contexto além do diff |
| B. Híbrido | 1 (+ ferramentas locais) | Média (instala deps) | Baixo em tipo/lint | Achados de tipo são 100% precisos (vêm do compilador) | Não pega nada cross-file |
| C. Multi-agente | 4 em paralelo | Baixa (paralelo) | Médio-alto (4 comentários) | Nenhuma categoria "perde" espaço para outra | Mais caro, mais comentários pra triar |
| D. Contexto estendido | 1 (+ grep local) | Média | Médio | Único que pega quebra de contrato fora do diff | Grep de importador é aproximado, não AST real |
| E. Propor-verificar | 2 sequenciais | Alta (sequencial) | Baixo (só confirmados) | Reduz falso positivo sem esconder o que foi descartado | Mais lento, 2x custo de LLM |

## Fontes

- [GitHub PR Review: Best Practices and Tools (2026)](https://dev.to/rahulxsingh/github-pr-review-best-practices-and-tools-2026-1p90)
- [Best AI Code Review Agents for GitHub PRs (2026)](https://medium.com/@piyalidas.it/best-ai-code-review-agents-for-github-prs-2026-ac4c86ef3a63)
- [AI Code Review in CI/CD Pipeline: 2026 Setup Guide](https://www.kunalganglani.com/blog/ai-code-review-github-actions)
- [Qodo vs Sourcery: AI Code Review Approaches Compared (2026)](https://dev.to/rahulxsingh/qodo-vs-sourcery-ai-code-review-approaches-compared-2026-a6b)
- [GitHub AI Code Review: 6 Tools Tested on Real PRs (2026)](https://www.morphllm.com/github-ai-code-review)
- [AutoReview: An LLM-based Multi-Agent System for Security](https://dl.acm.org/doi/pdf/10.1145/3696630.3728618)
- [Code Broker: A Multi-Agent System for Automated Code Quality Assessment](https://arxiv.org/pdf/2604.23088)
- [GitHub - calimero-network/ai-code-reviewer](https://github.com/calimero-network/ai-code-reviewer)
