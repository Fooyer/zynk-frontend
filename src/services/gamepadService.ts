/**
 * Gamepad Service — Detecção, polling e serialização de estado de gamepads.
 *
 * Usa a Web Gamepad API para detectar controles conectados e envia o estado
 * via RTCDataChannel em formato binário compacto (~50 bytes por frame).
 */

export interface GamepadInfo {
  index: number;
  id: string;
  connected: boolean;
}

/**
 * Formato binário do estado do gamepad (51 bytes total):
 *  [0]       u8   — gamepad index
 *  [1..4]    u32  — timestamp (ms, little-endian)
 *  [5..6]    u16  — bitmask de botões pressionados (16 botões)
 *  [7..38]   f32  — 8 valores analógicos de botões (L2/R2/etc) × 4 bytes
 *  [39..54]  f32  — 4 eixos (sticks) × 4 bytes
 */
const PACKET_SIZE = 55;

let pollingRafId: number | null = null;
let lastState: ArrayBuffer | null = null;
let connectedGamepads: GamepadInfo[] = [];

const listeners = new Set<(gamepads: GamepadInfo[]) => void>();

export function onGamepadsChanged(cb: (gamepads: GamepadInfo[]) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notifyListeners() {
  for (const cb of listeners) cb([...connectedGamepads]);
}

function updateConnectedList() {
  const gps = navigator.getGamepads();
  const list: GamepadInfo[] = [];
  for (let i = 0; i < gps.length; i++) {
    const gp = gps[i];
    if (gp) list.push({ index: gp.index, id: gp.id, connected: gp.connected });
  }
  connectedGamepads = list;
  notifyListeners();
}

export function getConnectedGamepads(): GamepadInfo[] {
  updateConnectedList();
  return [...connectedGamepads];
}

export function setupGamepadListeners() {
  window.addEventListener('gamepadconnected', updateConnectedList);
  window.addEventListener('gamepaddisconnected', updateConnectedList);
  return () => {
    window.removeEventListener('gamepadconnected', updateConnectedList);
    window.removeEventListener('gamepaddisconnected', updateConnectedList);
  };
}

/** Serializa o estado do gamepad em ArrayBuffer compacto. */
function serializeGamepadState(gp: Gamepad): ArrayBuffer {
  const buf = new ArrayBuffer(PACKET_SIZE);
  const view = new DataView(buf);

  // byte 0: index
  view.setUint8(0, gp.index);

  // bytes 1-4: timestamp (u32, wraps a cada ~49 dias)
  view.setUint32(1, gp.timestamp & 0xFFFFFFFF, true);

  // bytes 5-6: bitmask de botões
  let buttonMask = 0;
  for (let i = 0; i < Math.min(gp.buttons.length, 16); i++) {
    if (gp.buttons[i].pressed) buttonMask |= (1 << i);
  }
  view.setUint16(5, buttonMask, true);

  // bytes 7-38: valores analógicos dos 8 primeiros botões (f32 × 8 = 32 bytes)
  for (let i = 0; i < 8; i++) {
    const value = i < gp.buttons.length ? gp.buttons[i].value : 0;
    view.setFloat32(7 + i * 4, value, true);
  }

  // bytes 39-54: 4 eixos (f32 × 4 = 16 bytes)
  for (let i = 0; i < 4; i++) {
    const value = i < gp.axes.length ? gp.axes[i] : 0;
    view.setFloat32(39 + i * 4, value, true);
  }

  return buf;
}

/** Compara dois buffers de estado para detectar mudanças. */
function stateChanged(a: ArrayBuffer | null, b: ArrayBuffer): boolean {
  if (!a || a.byteLength !== b.byteLength) return true;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  // Compara a partir do byte 5 (pula index e timestamp)
  for (let i = 5; i < va.length; i++) {
    if (va[i] !== vb[i]) return true;
  }
  return false;
}

/** Deserializa o ArrayBuffer de volta para um objeto de estado usável. */
export interface GamepadState {
  index: number;
  timestamp: number;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

export function deserializeGamepadState(buf: ArrayBuffer): GamepadState {
  const view = new DataView(buf);

  const index = view.getUint8(0);
  const timestamp = view.getUint32(1, true);
  const buttonMask = view.getUint16(5, true);

  const buttons: { pressed: boolean; value: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const pressed = (buttonMask & (1 << i)) !== 0;
    const value = i < 8 ? view.getFloat32(7 + i * 4, true) : (pressed ? 1 : 0);
    buttons.push({ pressed, value });
  }

  const axes: number[] = [];
  for (let i = 0; i < 4; i++) {
    axes.push(view.getFloat32(39 + i * 4, true));
  }

  return { index, timestamp, buttons, axes };
}

/**
 * Inicia o polling do gamepad e envia via DataChannel.
 * @param channel - RTCDataChannel configurado com ordered=false, maxRetransmits=0
 * @param gamepadIndex - Índice do gamepad a monitorar (default: 0)
 */
export function startGamepadPolling(channel: RTCDataChannel, gamepadIndex = 0) {
  stopGamepadPolling();

  const poll = () => {
    if (channel.readyState !== 'open') {
      pollingRafId = requestAnimationFrame(poll);
      return;
    }

    const gamepads = navigator.getGamepads();
    const gp = gamepads[gamepadIndex];

    if (gp && gp.connected) {
      const state = serializeGamepadState(gp);
      if (stateChanged(lastState, state)) {
        try {
          channel.send(state);
        } catch { /* channel may be closing */ }
        lastState = state;
      }
    }

    pollingRafId = requestAnimationFrame(poll);
  };

  pollingRafId = requestAnimationFrame(poll);
}

/** Para o polling do gamepad. */
export function stopGamepadPolling() {
  if (pollingRafId !== null) {
    cancelAnimationFrame(pollingRafId);
    pollingRafId = null;
  }
  lastState = null;
}
