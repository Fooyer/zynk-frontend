/**
 * Combinação de tecla pra atalhos configuráveis (Configurações > Atalhos).
 * Usa `KeyboardEvent.code` (posição física da tecla) em vez de `.key` —
 * independe de layout de teclado (ex.: a tecla física "Y" no QWERTY é "Z"
 * no QWERTZ alemão; `.code` sempre identifica a mesma tecla física nos dois).
 */
export interface KeyCombo {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

// DOM `code` → { label pra exibição, nome de tecla aceito pelo Accelerator
// do Electron (https://www.electronjs.org/docs/latest/api/accelerator) }.
// Só cobre o que faz sentido pra um atalho de call (letras, números, F-keys,
// navegação, pontuação comum e teclas de mídia de headset) — não inclui
// numpad nem teclas mortas/IME.
const CODE_MAP: Record<string, { label: string; accelerator: string }> = {};
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i);
  CODE_MAP[`Key${letter}`] = { label: letter, accelerator: letter };
}
for (let i = 0; i <= 9; i++) {
  CODE_MAP[`Digit${i}`] = { label: String(i), accelerator: String(i) };
}
for (let i = 1; i <= 24; i++) {
  CODE_MAP[`F${i}`] = { label: `F${i}`, accelerator: `F${i}` };
}
Object.assign(CODE_MAP, {
  Space: { label: 'Espaço', accelerator: 'Space' },
  ArrowUp: { label: '↑', accelerator: 'Up' },
  ArrowDown: { label: '↓', accelerator: 'Down' },
  ArrowLeft: { label: '←', accelerator: 'Left' },
  ArrowRight: { label: '→', accelerator: 'Right' },
  Escape: { label: 'Esc', accelerator: 'Escape' },
  Tab: { label: 'Tab', accelerator: 'Tab' },
  Enter: { label: 'Enter', accelerator: 'Return' },
  Backspace: { label: 'Backspace', accelerator: 'Backspace' },
  Delete: { label: 'Delete', accelerator: 'Delete' },
  Insert: { label: 'Insert', accelerator: 'Insert' },
  Home: { label: 'Home', accelerator: 'Home' },
  End: { label: 'End', accelerator: 'End' },
  PageUp: { label: 'PageUp', accelerator: 'PageUp' },
  PageDown: { label: 'PageDown', accelerator: 'PageDown' },
  Comma: { label: ',', accelerator: ',' },
  Period: { label: '.', accelerator: '.' },
  Slash: { label: '/', accelerator: '/' },
  Semicolon: { label: ';', accelerator: ';' },
  Quote: { label: "'", accelerator: "'" },
  BracketLeft: { label: '[', accelerator: '[' },
  BracketRight: { label: ']', accelerator: ']' },
  Backslash: { label: '\\', accelerator: '\\' },
  Minus: { label: '-', accelerator: '-' },
  Equal: { label: '=', accelerator: '=' },
  Backquote: { label: '`', accelerator: '`' },
  // Teclas de mídia (comuns em headset/teclado de jogo) — ótimas pra atalho
  // de mudo porque não colidem com digitação em nenhum campo de texto.
  AudioVolumeMute: { label: 'Mudo (mídia)', accelerator: 'VolumeMute' },
  AudioVolumeUp: { label: 'Vol. + (mídia)', accelerator: 'VolumeUp' },
  AudioVolumeDown: { label: 'Vol. − (mídia)', accelerator: 'VolumeDown' },
  MediaPlayPause: { label: 'Play/Pause (mídia)', accelerator: 'MediaPlayPause' },
  MediaStop: { label: 'Stop (mídia)', accelerator: 'MediaStop' },
  MediaTrackNext: { label: 'Próxima (mídia)', accelerator: 'MediaNextTrack' },
  MediaTrackPrevious: { label: 'Anterior (mídia)', accelerator: 'MediaPreviousTrack' },
});

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

/** true quando o alvo do evento é um campo de texto — atalhos de tecla só
 *  (sem modificador) não devem disparar enquanto o usuário está digitando. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/** Extrai a combinação de um keydown — null se for só um modificador solto
 *  (ainda esperando a tecla "de verdade") ou uma tecla não suportada. */
export function keyComboFromEvent(e: KeyboardEvent): KeyCombo | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  if (!CODE_MAP[e.code]) return null;
  return { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
}

export function keyComboMatchesEvent(combo: KeyCombo, e: KeyboardEvent): boolean {
  return (
    combo.code === e.code &&
    combo.ctrl === e.ctrlKey &&
    combo.shift === e.shiftKey &&
    combo.alt === e.altKey &&
    combo.meta === e.metaKey
  );
}

export function keyComboEquals(a: KeyCombo, b: KeyCombo): boolean {
  return a.code === b.code && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta;
}

const isMac = () => (window.electronAPI?.platform ?? navigator.platform).toLowerCase().includes('mac');

/** Rótulo pra exibir na UI — ex.: "Ctrl + Shift + M". */
export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push(isMac() ? 'Option' : 'Alt');
  if (combo.shift) parts.push('Shift');
  if (combo.meta) parts.push(isMac() ? 'Cmd' : 'Win');
  parts.push(CODE_MAP[combo.code]?.label ?? combo.code);
  return parts.join(' + ');
}

/** Converte pro formato Accelerator do Electron, pra registrar como atalho
 *  global (system-wide). Null quando a tecla não tem equivalente — nesse
 *  caso o atalho continua funcionando só com o app em foco. */
export function keyComboToAccelerator(combo: KeyCombo): string | null {
  const key = CODE_MAP[combo.code]?.accelerator;
  if (!key) return null;
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Control');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  if (combo.meta) parts.push('Super');
  parts.push(key);
  return parts.join('+');
}
