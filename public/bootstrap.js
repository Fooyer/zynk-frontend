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
// flash do modo errado antes do React montar. A cor de destaque
// (predefinida/personalizada/gradiente) não entra aqui — só é
// aplicada depois que o React monta (ver App.tsx), o que é aceitável
// já que uma cor de destaque "errada" por um instante é bem menos
// perceptível que o fundo inteiro trocando de claro pra escuro.
try {
  var raw = localStorage.getItem('zynk-theme');
  var mode = raw ? JSON.parse(raw).state.mode : null;
  document.documentElement.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
