// Gera o ícone usado no toast nativo do Windows (Notification API) em
// runtime via <canvas> — o mesmo raio estilizado do logo (public/icon.svg),
// mas pintado com a cor de destaque ATUAL do usuário (--color-accent-500),
// não a cor fixa do arquivo SVG. Sem isso o toast usava um SVG estático
// (renderiza pequeno/borrado no Action Center do Windows) e ignorava
// completamente o tema escolhido nas configurações.

const SIZE = 256;
const SCALE = SIZE / 512;
const BOLT_PATH = 'M 152 128 L 360 128 L 360 168 L 228 304 L 368 304 L 368 384 L 144 384 L 144 344 L 284 208 L 152 208 Z';

function readAccentRgb(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-500').trim();
  if (!raw) return 'rgb(255, 19, 57)';
  return `rgb(${raw.split(/\s+/).join(', ')})`;
}

let cachedUrl: string | null = null;
let cachedAccent: string | null = null;

/** Ícone quadrado arredondado, na cor de destaque atual, com o raio do logo
 *  em branco por cima — cacheado e só recalculado se a cor de destaque mudar. */
export function getNotificationIcon(): string {
  const accent = readAccentRgb();
  if (cachedUrl && cachedAccent === accent) return cachedUrl;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '/icon.svg';

    ctx.scale(SCALE, SCALE);

    const bg = new Path2D();
    bg.roundRect(16, 16, 480, 480, 96);
    ctx.fillStyle = accent;
    ctx.fill(bg);

    ctx.fillStyle = '#ffffff';
    ctx.fill(new Path2D(BOLT_PATH));

    cachedUrl = canvas.toDataURL('image/png');
    cachedAccent = accent;
    return cachedUrl;
  } catch {
    return '/icon.svg';
  }
}
