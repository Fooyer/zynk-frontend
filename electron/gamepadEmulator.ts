/**
 * Gamepad Emulator — Emula controle no PC servidor.
 *
 * Backend 1 (primário): ViGEmBus — cria Xbox 360 virtual.
 *   Requer: ViGEmBus driver + npm install vigemclient
 *
 * Backend 2 (fallback): Teclado/Mouse via PowerShell + SendInput (Windows).
 *   Sem dependências externas. Mapeia botões para teclas e analógicos para mouse.
 *
 * Mapeamento do fallback (teclado):
 *   A → Space, B → E, X → R, Y → T
 *   LB → Q, RB → F, LT → LShift, RT → LCtrl
 *   Back → Tab, Start → Escape, LS → C, RS → V
 *   DPad → Arrow keys
 *   Left Stick → WASD (threshold)
 *   Right Stick → Mouse movement
 */

import { spawn, type ChildProcess } from 'child_process';

// ─── Types ───────────────────────────────────────────────

export interface GamepadInputState {
  index: number;
  timestamp: number;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

type Backend = 'vigem' | 'keyboard' | 'none';
let activeBackend: Backend = 'none';

// ═══════════════════════════════════════════════════════════
// ViGEmBus Backend
// ═══════════════════════════════════════════════════════════

let vigemMod: any = null;
let vigemClient: any = null;
let vigemController: any = null;
let vigemInited = false;

function initViGEm(): boolean {
  if (vigemInited) return !!vigemClient;
  vigemInited = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vigemMod = require('vigemclient');
    vigemClient = new vigemMod.ViGEmClient();
    const err = vigemClient.connect();
    if (err) { vigemClient = null; return false; }
    console.log('[GamepadEmulator] ViGEmBus conectado');
    return true;
  } catch (e) {
    console.log('[GamepadEmulator] ViGEmBus indisponível:', (e as Error).message);
    return false;
  }
}

function createViGEm(): boolean {
  if (vigemController) return true;
  if (!initViGEm()) return false;
  try {
    vigemController = vigemClient.createX360Controller();
    const err = vigemController.connect();
    if (err) { vigemController = null; return false; }
    console.log('[GamepadEmulator] Controle Xbox 360 virtual criado (ViGEm)');
    return true;
  } catch {
    vigemController = null;
    return false;
  }
}

function updateViGEm(state: GamepadInputState): void {
  if (!vigemController) return;
  try {
    const btn = state.buttons;
    const axes = state.axes;
    vigemController.button.A.setValue(btn[0]?.pressed ?? false);
    vigemController.button.B.setValue(btn[1]?.pressed ?? false);
    vigemController.button.X.setValue(btn[2]?.pressed ?? false);
    vigemController.button.Y.setValue(btn[3]?.pressed ?? false);
    vigemController.button.LEFT_SHOULDER.setValue(btn[4]?.pressed ?? false);
    vigemController.button.RIGHT_SHOULDER.setValue(btn[5]?.pressed ?? false);
    vigemController.button.BACK.setValue(btn[8]?.pressed ?? false);
    vigemController.button.START.setValue(btn[9]?.pressed ?? false);
    vigemController.button.LEFT_THUMB.setValue(btn[10]?.pressed ?? false);
    vigemController.button.RIGHT_THUMB.setValue(btn[11]?.pressed ?? false);
    vigemController.button.DPAD_UP.setValue(btn[12]?.pressed ?? false);
    vigemController.button.DPAD_DOWN.setValue(btn[13]?.pressed ?? false);
    vigemController.button.DPAD_LEFT.setValue(btn[14]?.pressed ?? false);
    vigemController.button.DPAD_RIGHT.setValue(btn[15]?.pressed ?? false);
    vigemController.axis.leftTrigger.setValue(Math.round((btn[6]?.value ?? 0) * 255));
    vigemController.axis.rightTrigger.setValue(Math.round((btn[7]?.value ?? 0) * 255));
    vigemController.axis.leftX.setValue(Math.round((axes[0] ?? 0) * 32767));
    vigemController.axis.leftY.setValue(Math.round((axes[1] ?? 0) * -32767));
    vigemController.axis.rightX.setValue(Math.round((axes[2] ?? 0) * 32767));
    vigemController.axis.rightY.setValue(Math.round((axes[3] ?? 0) * -32767));
    vigemController.update();
  } catch { /* ignora erros de atualização */ }
}

function destroyViGEm(): void {
  if (vigemController) {
    try { vigemController.disconnect(); } catch { /* */ }
    vigemController = null;
  }
}

// ═══════════════════════════════════════════════════════════
// Keyboard/Mouse Fallback (PowerShell + C# SendInput)
// ═══════════════════════════════════════════════════════════

let psProc: ChildProcess | null = null;
let psReady = false;

const DEADZONE = 0.15;
const STICK_THRESHOLD = 0.4;
const MOUSE_SENS = 14;

/**
 * Script PowerShell que compila C# inline para SendInput.
 * Recebe linhas CSV via stdin com 22 valores:
 *   b0..b15 (botões 0/1), w,a,s,d (WASD do stick esquerdo 0/1), mx,my (mouse delta int)
 *
 * Mapeamento VK embutido no script:
 *   [0]Space [1]E [2]R [3]T [4]Q [5]F [6]LShift [7]LCtrl
 *   [8]Tab [9]Esc [10]C [11]V [12]Up [13]Down [14]Left [15]Right
 *   [16]W [17]A [18]S [19]D
 */
const PS_SCRIPT = `
[Console]::InputEncoding=[System.Text.Encoding]::UTF8
Add-Type @'
using System;using System.Runtime.InteropServices;
public class GI{
  [DllImport("user32.dll")]static extern void keybd_event(byte a,byte b,uint c,IntPtr d);
  [DllImport("user32.dll")]static extern void mouse_event(uint a,int b,int c,uint d,IntPtr e);
  static bool[] h=new bool[256];
  public static void S(byte v,bool d){
    if(d&&!h[v]){keybd_event(v,0,0,IntPtr.Zero);h[v]=true;}
    else if(!d&&h[v]){keybd_event(v,0,2,IntPtr.Zero);h[v]=false;}
  }
  public static void M(int x,int y){if(x!=0||y!=0)mouse_event(1,x,y,0,IntPtr.Zero);}
  public static void R(){for(int i=0;i<256;i++)if(h[i]){keybd_event((byte)i,0,2,IntPtr.Zero);h[i]=false;}}
}
'@
[byte[]]$km=@(0x20,0x45,0x52,0x54,0x51,0x46,0xA0,0xA2,0x09,0x1B,0x43,0x56,0x26,0x28,0x25,0x27,0x57,0x41,0x53,0x44)
Write-Output 'RDY'
while($l=[Console]::In.ReadLine()){
  if(!$l -or $l-eq'X'){[GI]::R();break}
  $v=$l.Split(',')
  for($i=0;$i-lt 20;$i++){[GI]::S($km[$i],[int]$v[$i]-ne 0)}
  [GI]::M([int]$v[20],[int]$v[21])
}
`.trim();

function startKeyboard(): Promise<boolean> {
  return new Promise((resolve) => {
    if (psProc && psReady) { resolve(true); return; }

    try {
      psProc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-Command', PS_SCRIPT,
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const onData = (chunk: Buffer) => {
        if (chunk.toString().includes('RDY')) {
          psReady = true;
          psProc?.stdout?.off('data', onData);
          console.log('[GamepadEmulator] Fallback teclado/mouse pronto (PowerShell)');
          resolve(true);
        }
      };

      psProc.stdout?.on('data', onData);
      psProc.stderr?.on('data', (d: Buffer) => {
        console.warn('[GamepadEmulator] PS stderr:', d.toString().trim());
      });

      psProc.on('exit', () => { psProc = null; psReady = false; });
      psProc.on('error', () => { psProc = null; psReady = false; resolve(false); });

      // Timeout: compilação do C# pode levar alguns segundos
      setTimeout(() => { if (!psReady) resolve(false); }, 10000);
    } catch {
      resolve(false);
    }
  });
}

function updateKeyboard(state: GamepadInputState): void {
  if (!psProc?.stdin || !psReady) return;

  const btn = state.buttons;
  const axes = state.axes;
  const vals: string[] = [];

  // 16 botões
  for (let i = 0; i < 16; i++) {
    if (i === 6 || i === 7) {
      // Triggers analógicos → threshold
      vals.push((btn[i]?.value ?? 0) > 0.3 ? '1' : '0');
    } else {
      vals.push(btn[i]?.pressed ? '1' : '0');
    }
  }

  // Left stick → WASD
  const lx = Math.abs(axes[0] ?? 0) > DEADZONE ? (axes[0] ?? 0) : 0;
  const ly = Math.abs(axes[1] ?? 0) > DEADZONE ? (axes[1] ?? 0) : 0;
  vals.push(ly < -STICK_THRESHOLD ? '1' : '0'); // W (up = negative Y)
  vals.push(lx < -STICK_THRESHOLD ? '1' : '0'); // A (left)
  vals.push(ly > STICK_THRESHOLD ? '1' : '0');  // S (down)
  vals.push(lx > STICK_THRESHOLD ? '1' : '0');  // D (right)

  // Right stick → mouse delta
  const rx = Math.abs(axes[2] ?? 0) > DEADZONE ? (axes[2] ?? 0) : 0;
  const ry = Math.abs(axes[3] ?? 0) > DEADZONE ? (axes[3] ?? 0) : 0;
  vals.push(String(Math.round(rx * MOUSE_SENS)));
  vals.push(String(Math.round(ry * MOUSE_SENS)));

  try {
    psProc.stdin.write(vals.join(',') + '\n');
  } catch { /* stdin may be closed */ }
}

function stopKeyboard(): void {
  if (psProc?.stdin) {
    try { psProc.stdin.write('X\n'); } catch { /* */ }
  }
  if (psProc) {
    const proc = psProc;
    setTimeout(() => { try { proc.kill(); } catch { /* */ } }, 500);
  }
  psProc = null;
  psReady = false;
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/**
 * Cria um controle virtual.
 * Tenta ViGEmBus primeiro (Xbox 360 real para jogos).
 * Se indisponível, usa fallback teclado/mouse via PowerShell.
 */
export async function createVirtualGamepad(): Promise<{ success: boolean; error?: string; backend?: string }> {
  if (activeBackend !== 'none') return { success: true, backend: activeBackend };

  // Tenta ViGEm primeiro
  if (createViGEm()) {
    activeBackend = 'vigem';
    return { success: true, backend: 'vigem' };
  }

  // Fallback: teclado/mouse
  console.log('[GamepadEmulator] ViGEm indisponível, usando fallback teclado/mouse...');
  const ok = await startKeyboard();
  if (ok) {
    activeBackend = 'keyboard';
    return { success: true, backend: 'keyboard' };
  }

  return { success: false, error: 'Nenhum backend disponível para emulação de gamepad.' };
}

/** Atualiza o estado do controle virtual. */
export function updateVirtualGamepad(state: GamepadInputState): void {
  if (activeBackend === 'vigem') updateViGEm(state);
  else if (activeBackend === 'keyboard') updateKeyboard(state);
}

/** Remove o controle virtual. */
export function destroyVirtualGamepad(): void {
  if (activeBackend === 'vigem') destroyViGEm();
  else if (activeBackend === 'keyboard') stopKeyboard();
  activeBackend = 'none';
  console.log('[GamepadEmulator] Controle virtual removido');
}

/** Verifica se algum backend está disponível. */
export function isAvailable(): boolean {
  return initViGEm() || process.platform === 'win32';
}

/** Limpa tudo ao fechar o app. */
export function cleanup(): void {
  destroyVirtualGamepad();
  if (vigemClient) {
    try { vigemClient.disconnect(); } catch { /* */ }
    vigemClient = null;
  }
  vigemInited = false;
}
