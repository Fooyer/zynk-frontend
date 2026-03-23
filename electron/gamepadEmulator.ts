/**
 * Gamepad Emulator — Cria controles virtuais Xbox 360 via ViGEmBus.
 *
 * Carrega o módulo `vigemclient` dinamicamente. Se não estiver instalado
 * ou o ViGEmBus driver não estiver presente, degrada graciosamente.
 *
 * Pré-requisitos:
 *   1. ViGEmBus driver instalado: https://github.com/nefarius/ViGEmBus/releases
 *   2. npm install vigemclient (requer Python + Build Tools para compilar)
 */

let vigemclient: any = null;
let client: any = null;
let virtualController: any = null;
let available = false;

/** Tenta inicializar o ViGEmClient. */
function init(): boolean {
  if (available) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vigemclient = require('vigemclient');
    client = new vigemclient.ViGEmClient();
    const err = client.connect();
    if (err) {
      console.warn('[GamepadEmulator] ViGEmBus connect error:', err);
      client = null;
      return false;
    }
    available = true;
    console.log('[GamepadEmulator] ViGEmBus conectado com sucesso');
    return true;
  } catch (e) {
    console.warn('[GamepadEmulator] vigemclient não disponível:', (e as Error).message);
    console.warn('[GamepadEmulator] Para habilitar controle virtual, instale:');
    console.warn('  1. ViGEmBus driver: https://github.com/nefarius/ViGEmBus/releases');
    console.warn('  2. npm install vigemclient');
    return false;
  }
}

export interface GamepadInputState {
  index: number;
  timestamp: number;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

/**
 * Cria um controle virtual Xbox 360.
 * @returns {{ success: boolean; error?: string }}
 */
export function createVirtualGamepad(): { success: boolean; error?: string } {
  if (!init()) {
    return {
      success: false,
      error: 'ViGEmBus não disponível. Instale o driver ViGEmBus e o pacote vigemclient.',
    };
  }

  if (virtualController) {
    return { success: true }; // Já existe
  }

  try {
    virtualController = client.createX360Controller();
    const err = virtualController.connect();
    if (err) {
      virtualController = null;
      return { success: false, error: `Erro ao conectar controle virtual: ${err}` };
    }
    console.log('[GamepadEmulator] Controle virtual Xbox 360 criado');
    return { success: true };
  } catch (e) {
    virtualController = null;
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Atualiza o estado do controle virtual com os inputs recebidos.
 * Mapeamento Standard Gamepad → Xbox 360:
 *   buttons[0]  → A        buttons[1]  → B
 *   buttons[2]  → X        buttons[3]  → Y
 *   buttons[4]  → LB       buttons[5]  → RB
 *   buttons[6]  → LT       buttons[7]  → RT
 *   buttons[8]  → Back     buttons[9]  → Start
 *   buttons[10] → LS       buttons[11] → RS
 *   buttons[12] → DPad Up  buttons[13] → DPad Down
 *   buttons[14] → DPad Left buttons[15] → DPad Right
 *
 *   axes[0] → Left Stick X   axes[1] → Left Stick Y
 *   axes[2] → Right Stick X  axes[3] → Right Stick Y
 */
export function updateVirtualGamepad(state: GamepadInputState): void {
  if (!virtualController) return;

  try {
    const btn = state.buttons;
    const axes = state.axes;

    // Botões digitais
    virtualController.button.A.setValue(btn[0]?.pressed ?? false);
    virtualController.button.B.setValue(btn[1]?.pressed ?? false);
    virtualController.button.X.setValue(btn[2]?.pressed ?? false);
    virtualController.button.Y.setValue(btn[3]?.pressed ?? false);
    virtualController.button.LEFT_SHOULDER.setValue(btn[4]?.pressed ?? false);
    virtualController.button.RIGHT_SHOULDER.setValue(btn[5]?.pressed ?? false);
    virtualController.button.BACK.setValue(btn[8]?.pressed ?? false);
    virtualController.button.START.setValue(btn[9]?.pressed ?? false);
    virtualController.button.LEFT_THUMB.setValue(btn[10]?.pressed ?? false);
    virtualController.button.RIGHT_THUMB.setValue(btn[11]?.pressed ?? false);

    // DPad
    virtualController.button.DPAD_UP.setValue(btn[12]?.pressed ?? false);
    virtualController.button.DPAD_DOWN.setValue(btn[13]?.pressed ?? false);
    virtualController.button.DPAD_LEFT.setValue(btn[14]?.pressed ?? false);
    virtualController.button.DPAD_RIGHT.setValue(btn[15]?.pressed ?? false);

    // Triggers analógicos (0.0 a 1.0 → 0 a 255)
    virtualController.axis.leftTrigger.setValue(Math.round((btn[6]?.value ?? 0) * 255));
    virtualController.axis.rightTrigger.setValue(Math.round((btn[7]?.value ?? 0) * 255));

    // Sticks analógicos (-1.0 a 1.0 → -32768 a 32767)
    virtualController.axis.leftX.setValue(Math.round((axes[0] ?? 0) * 32767));
    virtualController.axis.leftY.setValue(Math.round((axes[1] ?? 0) * -32767)); // Y invertido
    virtualController.axis.rightX.setValue(Math.round((axes[2] ?? 0) * 32767));
    virtualController.axis.rightY.setValue(Math.round((axes[3] ?? 0) * -32767)); // Y invertido

    virtualController.update();
  } catch {
    // Ignora erros de atualização para não travar o loop
  }
}

/** Remove o controle virtual. */
export function destroyVirtualGamepad(): void {
  if (virtualController) {
    try {
      virtualController.disconnect();
    } catch { /* pode já estar desconectado */ }
    virtualController = null;
    console.log('[GamepadEmulator] Controle virtual removido');
  }
}

/** Verifica se o ViGEmBus está disponível. */
export function isViGEmAvailable(): boolean {
  return init();
}

/** Limpa tudo ao fechar o app. */
export function cleanup(): void {
  destroyVirtualGamepad();
  if (client) {
    try { client.disconnect(); } catch { /* */ }
    client = null;
  }
  available = false;
}
