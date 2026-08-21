import type { AccentRampKey, RGB } from './color';
import type { AccentPreset } from '../stores/themeStore';

// Rampas curadas manualmente (não geradas pela fórmula genérica de color.ts)
// — cada uma já validada pra manter contraste forte o bastante pro texto
// branco em cima do tom 600 (o "core" usado em botões sólidos). O verde em
// especial não é uma rotação de matiz do vermelho: luminância percebida do
// verde é bem mais alta pra mesma luminosidade HSL, então a rampa foi
// recalibrada (600 mais escuro que o offset padrão indicaria) pra não cair
// abaixo de ~6:1 de contraste.
export const PRESET_RAMPS: Record<AccentPreset, Record<AccentRampKey, RGB>> = {
  red: {
    '300': [255, 143, 156],
    '400': [255, 77, 104],
    '500': [255, 19, 57],
    '600': [196, 13, 46],
    '700': [143, 10, 34],
    '800': [61, 11, 19],
    '900': [32, 8, 13],
  },
  blue: {
    '300': [143, 190, 255],
    '400': [77, 151, 255],
    '500': [19, 117, 255],
    '600': [13, 89, 196],
    '700': [10, 65, 143],
    '800': [11, 32, 61],
    '900': [8, 18, 32],
  },
  purple: {
    '300': [199, 143, 255],
    '400': [166, 77, 255],
    '500': [137, 19, 255],
    '600': [105, 13, 196],
    '700': [77, 10, 143],
    '800': [36, 11, 61],
    '900': [20, 8, 32],
  },
  green: {
    '300': [68, 243, 127],
    '400': [15, 230, 87],
    '500': [12, 176, 66],
    '600': [8, 115, 43],
    '700': [4, 62, 23],
    '800': [2, 29, 11],
    '900': [1, 14, 5],
  },
};

// Hex do tom 500 de cada preset — usado só pra preview (swatch) na UI.
export const PRESET_SWATCH: Record<AccentPreset, string> = {
  red: '#ff1339',
  blue: '#1375ff',
  purple: '#8913ff',
  green: '#0cb042',
};

export const PRESET_LABELS: Record<AccentPreset, string> = {
  red: 'Vermelho',
  blue: 'Azul',
  purple: 'Roxo',
  green: 'Verde',
};
