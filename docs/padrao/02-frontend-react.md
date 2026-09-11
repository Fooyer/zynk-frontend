# Padrões de Frontend (React)

Este arquivo é lido pelo revisor de IA. Cada regra vem com um exemplo de
❌ trecho que deve ser sinalizado e ✅ como corrigir, para o revisor (e
qualquer pessoa do time) reconhecer o padrão rápido, sem ambiguidade.

## Organização

Estrutura de pastas esperada; um arquivo fora do lugar é sinal de
responsabilidade mal separada:

```
src/
├─ pages/        # telas, compostas a partir de components
├─ components/   # peças de UI pequenas e reutilizáveis
├─ services/     # chamadas HTTP (fetch/axios), nada de JSX aqui
├─ hooks/        # lógica reutilizável extraída de componentes
└─ contexts/     # estado compartilhado entre componentes
```

## Componentização

Lógica de UI (o que buscar, quando refazer fetch, como tratar loading/erro)
vai para um **custom hook**: o componente só renderiza.

```jsx
// ❌ busca de dado, estado de loading e JSX misturados no componente
function ClientList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(json => { setClients(json.data); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;
  return <ul>{clients.map(c => <li key={c.id}>{c.name}</li>)}</ul>;
}
```

```jsx
// ✅ hook cuida do dado, componente só apresenta
function useClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientsService.list().then(data => {
      setClients(data);
      setLoading(false);
    });
  }, []);

  return { clients, loading };
}

function ClientList() {
  const { clients, loading } = useClients();
  if (loading) return <Spinner />;
  return <ul>{clients.map(c => <li key={c.id}>{c.name}</li>)}</ul>;
}
```

**Reprovar (🔴)** quando um componente de página faz fetch direto, mistura
regra de exibição (`if`, `filter`, `sort` complexo) com JSX de layout, ou
passa de ~150 linhas sem nenhuma extração de hook.

## Props drilling → Context

Evitar repassar a mesma prop por mais de 2 níveis de componente.

```jsx
// ❌ tema repassado por 3 componentes que só o entregam adiante
<Page theme={theme}>
  <Sidebar theme={theme}>
    <UserCard theme={theme} />
  </Sidebar>
</Page>
```

```jsx
// ✅ Context evita o repasse manual
const ThemeContext = createContext(theme);

<ThemeContext.Provider value={theme}>
  <Page>
    <Sidebar>
      <UserCard /> {/* lê o tema com useContext(ThemeContext) */}
    </Sidebar>
  </Page>
</ThemeContext.Provider>
```

## Performance: useMemo / useCallback

Só valem quando o valor/função alimenta um filho memoizado
(`React.memo`) ou é dependência de outro hook. Usar por reflexo em tudo
tem custo e não ganha nada.

```jsx
// ❌ recalcula em toda renderização, e a função recriada quebra o memo do filho
function Dashboard({ items }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const handleClick = (id) => dispatch(select(id));
  return <ExpensiveList items={items} onClick={handleClick} total={total} />;
}
```

```jsx
// ✅ memoiza o que realmente é caro e estabiliza a função para o React.memo filho
function Dashboard({ items }) {
  const total = useMemo(() => items.reduce((s, i) => s + i.value, 0), [items]);
  const handleClick = useCallback((id) => dispatch(select(id)), [dispatch]);
  return <ExpensiveList items={items} onClick={handleClick} total={total} />;
}
```

**Sinalizar como 🟡 sugestão** (não bloqueante) o inverso: `useMemo` em um
cálculo trivial (`a + b`) só adiciona overhead de comparação sem ganho.

## Integração com o backend

Chamadas HTTP ficam em `services/`, nunca direto no componente ou no hook de
UI, e o envelope de resposta padrão é tratado uma vez só, no service.

```jsx
// ❌ cada componente repete o parsing do envelope e a URL fica espalhada
function useInvoice(id) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) throw new Error(json.error);
        setData(json.data);
      });
  }, [id]);
  return data;
}
```

```jsx
// ✅ service centraliza URL e envelope; o hook só consome
// services/invoices.js
export const invoicesService = {
  async get(id) {
    const res = await fetch(`/api/invoices/${id}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
};

// hooks/useInvoice.js
function useInvoice(id) {
  const [data, setData] = useState(null);
  useEffect(() => { invoicesService.get(id).then(setData); }, [id]);
  return data;
}
```

Nunca confiar em validação feita só no frontend. Ela existe para UX, não
para segurança; a validação que importa é a do backend.

## Segurança

```jsx
// ❌ HTML da API injetado sem sanitização: risco de XSS se a API for comprometida
function Comment({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

```jsx
// ✅ sanitiza antes de injetar, ou evita dangerouslySetInnerHTML por completo
import DOMPurify from "dompurify";

function Comment({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
```

Token/sessão nunca em `localStorage` se o projeto já usa cookie httpOnly.
Não misturar as duas estratégias no mesmo fluxo.

## O que sinalizar como 🟡 sugestão (não bloqueante)

- `useEffect` com array de dependências incompleto, mas sem bug funcional
  aparente.
- CSS inline repetido que poderia virar classe/estilo compartilhado.
- Nome de estado ou prop que não comunica o que representa.
