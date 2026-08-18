/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette dark com alto contraste — cada tom de texto atinge >=4.5:1
        // (WCAG AA) contra os fundos surface-800/900/950 em que é usado.
        surface: {
          50: '#f5f6f8',
          100: '#e7e9ed',
          200: '#d5d8de',
          300: '#b8bcc6',
          400: '#9aa0ad',
          500: '#828998',
          600: '#6b7280',
          700: '#313745',
          800: '#1a1d29',
          900: '#101219',
          950: '#0a0b10',
        },
        accent: {
          400: '#33c4e8',
          500: '#00b4d8',
          // 600 é usado só como fundo sólido de botão (texto/ícone branco em cima),
          // por isso é mais escuro que 500 apesar de ficar "atrás" na escala visual.
          600: '#00819c',
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
    },
  },
  plugins: [],
};
