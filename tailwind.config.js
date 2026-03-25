/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette dark com alto contraste e accent em teal
        surface: {
          50: '#e8eaed',
          100: '#d1d5db',
          200: '#b0b7c3',
          300: '#9ca3b0',
          400: '#6b7280',
          500: '#4b5263',
          600: '#2a2f3d',
          700: '#1e2230',
          800: '#151823',
          900: '#0f1119',
          950: '#090a10',
        },
        accent: {
          400: '#5eead4',
          500: '#2dd4bf',
          600: '#14b8a6',
        },
        success: '#43b581',
        warning: '#faa61a',
        danger: '#f04747',
        online: '#43b581',
        offline: '#747f8d',
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
