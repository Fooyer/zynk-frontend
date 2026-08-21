// ─── Utilidades de cor pro sistema de temas ─────────────────────
// Gera uma rampa de 7 tons (300–900, no mesmo formato "R G B" das
// variáveis CSS em themes.css) a partir de UMA cor escolhida pelo
// usuário, preservando a mesma relação de luminosidade entre os
// tons que a rampa vermelha original tinha — cada tom continua
// cumprindo o mesmo papel (300=vívido claro, 500=core, 900=quase-preto),
// só que no matiz escolhido.

export type RGB = [number, number, number];
export type AccentRampKey = '300' | '400' | '500' | '600' | '700' | '800' | '900';

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Deltas de luminosidade (relativos ao tom 500) extraídos da rampa vermelha
// original do app — aplicar os mesmos deltas sobre a luminosidade de
// qualquer matiz escolhido reproduz a mesma "forma" de rampa (300 claro/vívido
// até 900 quase-preto) para qualquer cor.
const L_DELTA: Record<AccentRampKey, number> = {
  '300': 24.3,
  '400': 11.4,
  '500': 0,
  '600': -12.7,
  '700': -23.7,
  '800': -39.6,
  '900': -45.9,
};

export function generateAccentRamp(hex: string): Record<AccentRampKey, RGB> {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const ramp = {} as Record<AccentRampKey, RGB>;
  (Object.keys(L_DELTA) as AccentRampKey[]).forEach((step) => {
    ramp[step] = hslToRgb(h, s, clamp(l + L_DELTA[step], 3, 97));
  });
  return ramp;
}

export function rgbTriple([r, g, b]: RGB): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

export function mixHex(a: string, b: string, t = 0.5): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}
