/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette dark neutra (cinza/preto, sem viés azulado) com alto contraste —
        // cada tom de texto atinge >=4.5:1 (WCAG AA) contra os fundos
        // surface-800/900/950 em que é usado.
        // Cada tom vem de uma variável CSS (definida em src/assets/styles/themes.css,
        // formato "R G B") em vez de hex fixo — permite trocar o tema inteiro em
        // runtime via atributo data-theme, sem recompilar e sem tocar em nenhuma
        // classe já usada nos componentes (bg-surface-900, text-surface-100 etc.).
        surface: {
          50: 'rgb(var(--color-surface-50) / <alpha-value>)',
          100: 'rgb(var(--color-surface-100) / <alpha-value>)',
          200: 'rgb(var(--color-surface-200) / <alpha-value>)',
          300: 'rgb(var(--color-surface-300) / <alpha-value>)',
          400: 'rgb(var(--color-surface-400) / <alpha-value>)',
          500: 'rgb(var(--color-surface-500) / <alpha-value>)',
          600: 'rgb(var(--color-surface-600) / <alpha-value>)',
          700: 'rgb(var(--color-surface-700) / <alpha-value>)',
          750: 'rgb(var(--color-surface-750) / <alpha-value>)',
          800: 'rgb(var(--color-surface-800) / <alpha-value>)',
          900: 'rgb(var(--color-surface-900) / <alpha-value>)',
          950: 'rgb(var(--color-surface-950) / <alpha-value>)',
        },
        // Accent = vermelho neon (identidade "futurista" do app). 400 é o tom vívido
        // usado como glow/hover; 500 é o tom "core" (texto, ícones, bordas ativas);
        // 600/700 são variantes escuras para fundo sólido de botão com texto branco.
        // Deliberadamente mais magenta/quente que `danger` (que é mais alaranjado)
        // pra dar pra distinguir "isto é a marca" de "isto é destrutivo" só pela cor.
        accent: {
          300: 'rgb(var(--color-accent-300) / <alpha-value>)',
          400: 'rgb(var(--color-accent-400) / <alpha-value>)',
          500: 'rgb(var(--color-accent-500) / <alpha-value>)',
          600: 'rgb(var(--color-accent-600) / <alpha-value>)',
          700: 'rgb(var(--color-accent-700) / <alpha-value>)',
          // Tons quase-pretos com base vermelha — fundo de superfícies "em chamada"
          // (painel de call, overlay flutuante, modal de chamada recebida), pra essas
          // telas lerem como vermelhas mesmo sendo escuras o bastante pra texto branco.
          800: 'rgb(var(--color-accent-800) / <alpha-value>)',
          900: 'rgb(var(--color-accent-900) / <alpha-value>)',
        },
        // DEFAULT continua vívido para uso como texto/ícone/dot sobre fundo escuro;
        // 600 é a variante escura para fundo sólido de botão com texto branco.
        success: { DEFAULT: '#43b581', 600: '#1c7d53' },
        warning: '#faa61a',
        danger: { DEFAULT: '#f04747', 600: '#cc3333' },
        online: '#43b581',
        offline: '#9aa0ad',
        away: '#faa61a',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      // Sombras de elevação para UI dark — como sombra pura não aparece sobre
      // fundo já escuro, cada nível soma um realce interno sutil no topo (simula
      // luz batendo na borda) com uma sombra externa difusa (separação do que
      // está atrás). Uso: panel < elevated < modal, do menos ao mais "no ar".
      // Cada nível soma um anel vermelho cada vez mais visível (moldura "HUD") além
      // da elevação em si — panel quase imperceptível, modal com halo vermelho nítido.
      // Isso propaga o tema futurista pro app inteiro sem precisar tocar componente
      // por componente: qualquer coisa que já usa shadow-panel/elevated/modal ganha o anel.
      boxShadow: {
        panel: '0 0 0 1px rgb(var(--color-accent-500) / 0.08), 0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 1px 3px 0 rgb(0 0 0 / 0.3)',
        elevated: '0 0 0 1px rgb(var(--color-accent-500) / 0.16), 0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 10px 30px -8px rgb(0 0 0 / 0.55), 0 2px 10px -2px rgb(0 0 0 / 0.4)',
        modal: '0 0 0 1px rgb(var(--color-accent-500) / 0.22), 0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 25px 60px -15px rgb(0 0 0 / 0.7), 0 10px 24px -8px rgb(0 0 0 / 0.5), 0 0 60px -18px rgb(var(--color-accent-500) / 0.4)',
        // Glow vermelho neon — usado em botões/estados ativos. "-sm" é o toque sutil
        // de hover; sem sufixo é o padrão (ex.: ícone de nav ativo); "-lg" é reservado
        // pra poucos destaques fortes (chamada ativa, CTA principal em foco).
        'glow-accent-sm': '0 0 0 1px rgb(var(--color-accent-500) / 0.3), 0 0 12px -2px rgb(var(--color-accent-500) / 0.45)',
        'glow-accent': '0 0 0 1px rgb(var(--color-accent-500) / 0.4), 0 0 24px -4px rgb(var(--color-accent-500) / 0.6)',
        'glow-accent-lg': '0 0 0 1px rgb(var(--color-accent-500) / 0.5), 0 0 40px -4px rgb(var(--color-accent-500) / 0.7), 0 0 80px -20px rgb(var(--color-accent-500) / 0.5)',
        // Moldura vermelha fina, standalone — pra elementos pequenos que não usam
        // panel/elevated/modal (avatares, chips) mas ainda devem ter o contorno "HUD".
        frame: '0 0 0 1px rgb(var(--color-accent-500) / 0.12), 0 1px 0 0 rgb(255 255 255 / 0.04) inset',
      },
      // Entradas de UI reutilizáveis — nada no app deve simplesmente "aparecer".
      // Curva cubic-bezier(0.16, 1, 0.3, 1) ("ease-out-expo") em vez de ease-out
      // padrão: desacelera bem mais suave no final, sem nenhum bounce — o toque
      // "confortável" pedido, não um efeito chamativo. Duração escala com o
      // tamanho do elemento: menu/toast são rápidos (a intenção é não atrasar a
      // interação), modal é um pouco mais lento (é o elemento mais dominante da
      // tela quando abre).
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'menu-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'menu-in': 'menu-in 0.14s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
