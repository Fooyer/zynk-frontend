// Gera os ícones de "notificação não lida" em runtime via <canvas> (sem
// depender de nenhuma lib de imagem no processo main do Electron) e manda o
// data URL pronto por IPC pro main aplicar via nativeImage.
//
// - overlay: só a bolinha vermelha, transparente por trás — usada no overlay
//   da taskbar do Windows, que já compõe sozinho por cima do ícone existente.
// - tray: o ícone do app + a mesma bolinha no canto — porque tray.setImage
//   substitui o ícone inteiro (sem overlay nativo como a taskbar).

const SIZE = 64;
const DOT_RADIUS = SIZE * 0.3;
const DOT_CX = SIZE - DOT_RADIUS * 0.85;
const DOT_CY = SIZE - DOT_RADIUS * 0.85;

function drawDot(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.arc(DOT_CX, DOT_CY, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.lineWidth = SIZE * 0.06;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
}

function loadIconImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = '/icon.svg';
  });
}

let overlayBadgeUrl: string | null = null;
let trayBadgeUrl: string | null = null;
let building: Promise<void> | null = null;

async function buildBadges(): Promise<void> {
  if (overlayBadgeUrl && trayBadgeUrl) return;

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = SIZE;
  overlayCanvas.height = SIZE;
  const overlayCtx = overlayCanvas.getContext('2d');
  if (overlayCtx) {
    drawDot(overlayCtx);
    overlayBadgeUrl = overlayCanvas.toDataURL('image/png');
  }

  try {
    const icon = await loadIconImage();
    const trayCanvas = document.createElement('canvas');
    trayCanvas.width = SIZE;
    trayCanvas.height = SIZE;
    const trayCtx = trayCanvas.getContext('2d');
    if (trayCtx) {
      trayCtx.drawImage(icon, 0, 0, SIZE, SIZE);
      drawDot(trayCtx);
      trayBadgeUrl = trayCanvas.toDataURL('image/png');
    }
  } catch {
    // Sem o ícone base não dá pra montar o da bandeja — o overlay da
    // taskbar continua funcionando normalmente.
  }
}

let lastApplied: boolean | null = null;

/** Liga/desliga o selo de "não lida" na taskbar e na bandeja. Seguro chamar
 *  fora do Electron (window.electronAPI ausente) e em qualquer plataforma. */
export async function applyUnreadBadge(hasUnread: boolean): Promise<void> {
  if (!window.electronAPI) return;
  if (lastApplied === hasUnread) return;
  lastApplied = hasUnread;

  if (hasUnread) {
    if (!building) building = buildBadges();
    await building;
  }

  window.electronAPI.setOverlayBadge(hasUnread ? overlayBadgeUrl : null);
  window.electronAPI.setTrayBadge(hasUnread ? trayBadgeUrl : null);
}
