/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette inspirada no Discord mas com identidade própria
        surface: {
          50: '#f0f1f5',
          100: '#e1e3ea',
          200: '#c3c7d5',
          300: '#8b91a7',
          400: '#5c6380',
          500: '#3a3f55',
          600: '#2d3148',
          700: '#23273a',
          800: '#1a1d2e',
          900: '#131524',
          950: '#0d0e1a',
        },
        accent: {
          400: '#7c8aff',
          500: '#5b6aff',
          600: '#4a57e0',
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
