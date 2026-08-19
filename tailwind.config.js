/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette dark neutra (cinza/preto, sem viés azulado) com alto contraste —
        // cada tom de texto atinge >=4.5:1 (WCAG AA) contra os fundos
        // surface-800/900/950 em que é usado.
        surface: {
          50: '#f6f6f7',
          100: '#e9e9eb',
          200: '#d1d1d5',
          300: '#a8a9af',
          400: '#808187',
          500: '#65656b',
          600: '#48484d',
          700: '#2c2c30',
          750: '#212124',
          800: '#19191b',
          900: '#101011',
          950: '#08080a',
        },
        // Accent = vermelho neon (identidade "futurista" do app). 400 é o tom vívido
        // usado como glow/hover; 500 é o tom "core" (texto, ícones, bordas ativas);
        // 600/700 são variantes escuras para fundo sólido de botão com texto branco.
        // Deliberadamente mais magenta/quente que `danger` (que é mais alaranjado)
        // pra dar pra distinguir "isto é a marca" de "isto é destrutivo" só pela cor.
        accent: {
          300: '#ff8f9c',
          400: '#ff4d68',
          500: '#ff1339',
          600: '#c40d2e',
          700: '#8f0a22',
          // Tons quase-pretos com base vermelha — fundo de superfícies "em chamada"
          // (painel de call, overlay flutuante, modal de chamada recebida), pra essas
          // telas lerem como vermelhas mesmo sendo escuras o bastante pra texto branco.
          800: '#3d0b13',
          900: '#20080d',
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
        panel: '0 0 0 1px rgb(255 19 57 / 0.08), 0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 1px 3px 0 rgb(0 0 0 / 0.3)',
        elevated: '0 0 0 1px rgb(255 19 57 / 0.16), 0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 10px 30px -8px rgb(0 0 0 / 0.55), 0 2px 10px -2px rgb(0 0 0 / 0.4)',
        modal: '0 0 0 1px rgb(255 19 57 / 0.22), 0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 25px 60px -15px rgb(0 0 0 / 0.7), 0 10px 24px -8px rgb(0 0 0 / 0.5), 0 0 60px -18px rgb(255 19 57 / 0.4)',
        // Glow vermelho neon — usado em botões/estados ativos. "-sm" é o toque sutil
        // de hover; sem sufixo é o padrão (ex.: ícone de nav ativo); "-lg" é reservado
        // pra poucos destaques fortes (chamada ativa, CTA principal em foco).
        'glow-accent-sm': '0 0 0 1px rgb(255 19 57 / 0.3), 0 0 12px -2px rgb(255 19 57 / 0.45)',
        'glow-accent': '0 0 0 1px rgb(255 19 57 / 0.4), 0 0 24px -4px rgb(255 19 57 / 0.6)',
        'glow-accent-lg': '0 0 0 1px rgb(255 19 57 / 0.5), 0 0 40px -4px rgb(255 19 57 / 0.7), 0 0 80px -20px rgb(255 19 57 / 0.5)',
        // Moldura vermelha fina, standalone — pra elementos pequenos que não usam
        // panel/elevated/modal (avatares, chips) mas ainda devem ter o contorno "HUD".
        frame: '0 0 0 1px rgb(255 19 57 / 0.12), 0 1px 0 0 rgb(255 255 255 / 0.04) inset',
      },
    },
  },
  plugins: [],
};
