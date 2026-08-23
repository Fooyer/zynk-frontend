// Roda antes do primeiro paint — precisa ser um <script src> externo (não
// inline) porque a CSP de produção não libera 'unsafe-inline' pra scripts.

// Detecta a plataforma antes do primeiro paint: no Electron, o preload
// expõe window.electronAPI de forma síncrona antes de qualquer script
// da página rodar. Só no Linux a janela é transparente (transparent:true
// no main.ts, pro arredondado via CSS) — em Windows/macOS a janela já é
// opaca com cantos nativos, então manter o fundo transparente aqui
// deixaria o conteúdo sem base sólida (glitches visuais/composição).
if (!window.electronAPI || window.electronAPI.platform !== 'linux') {
  document.documentElement.classList.add('native-frame');
}

// Aplica claro/escuro antes do primeiro paint (mesmo formato que o
// zustand/persist grava em src/stores/themeStore.ts) pra evitar o
// flash do modo errado antes do React montar.
//
// A cor de destaque também é lida aqui (só pra colorir o loader da splash,
// ver #splash no index.html) — precisa ficar em sincronia com o hex de
// PRESET_SWATCH em src/utils/accentPresets.ts. Fora da splash, a cor de
// destaque continua sendo aplicada de verdade só depois que o React monta
// (App.tsx gera a rampa completa via generateAccentRamp), porque isso exige
// lógica de geração de cor que não vale a pena duplicar aqui.
var PRESET_SWATCH = { red: '#ff1339', blue: '#1375ff', purple: '#8913ff', green: '#0cb042' };

function hexToRgbTriple(hex) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return null;
  return parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16);
}

try {
  var raw = localStorage.getItem('zynk-theme');
  var state = raw ? JSON.parse(raw).state : null;
  var mode = state ? state.mode : null;
  document.documentElement.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');

  var accentMode = state ? state.accentMode : 'preset';
  var accentHex =
    accentMode === 'custom'
      ? state.customColor
      : accentMode === 'gradient'
        ? state.gradientFrom
        : PRESET_SWATCH[state && state.accentPreset] || PRESET_SWATCH.red;
  var accent2Hex = accentMode === 'gradient' ? state.gradientTo : accentHex;

  var accentRgb = hexToRgbTriple(accentHex) || hexToRgbTriple(PRESET_SWATCH.red);
  var accent2Rgb = hexToRgbTriple(accent2Hex) || accentRgb;
  document.documentElement.style.setProperty('--splash-accent-rgb', accentRgb);
  document.documentElement.style.setProperty('--splash-accent-2-rgb', accent2Rgb);
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.setProperty('--splash-accent-rgb', hexToRgbTriple(PRESET_SWATCH.red));
  document.documentElement.style.setProperty('--splash-accent-2-rgb', hexToRgbTriple(PRESET_SWATCH.red));
}
