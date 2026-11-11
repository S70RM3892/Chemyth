/** ライト＝方眼ノートにインク、ダーク＝黒板にチョーク。画面部品（CSS）と地図（canvas）で同じ色を使う */
export type ThemeName = 'light' | 'dark';
export type ThemeChoice = 'auto' | ThemeName;

export interface Palette {
  name: ThemeName;
  paper: string;
  grid: string;
  gridBold: string;
  /** 主線（ライトは青黒インク、ダークは白チョーク） */
  ink: string;
  soft: string;
  /** 赤ペン／赤チョーク */
  red: string;
  /** 蛍光ペン／黄チョーク */
  hi: string;
  /** 装置や物質の台 */
  plate: string;
  shadow: string;
  /** 元素の形の輪郭 */
  edge: string;
  line: { solid: string; liquid: string; gas: string; none: string };
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    name: 'light', paper: '#f3f5ef', grid: '#cfdfe3', gridBold: '#a9c6ce', ink: '#1c2a48', soft: '#63718a', red: '#d23f3a', hi: '#ffe14d',
    plate: '#ffffff', shadow: 'rgba(28,42,72,0.2)', edge: '#1c2a48',
    line: { solid: '#ead9b8', liquid: '#c8e3f2', gas: '#e4e0f4', none: '#e3e6de' },
  },
  dark: {
    name: 'dark', paper: '#1f2d27', grid: 'rgba(232,238,224,0.07)', gridBold: 'rgba(232,238,224,0.14)', ink: '#eceee2', soft: '#a3b0a2', red: '#f2938c', hi: '#f3d86b',
    plate: '#2a3b32', shadow: 'rgba(0,0,0,0.35)', edge: 'rgba(8,14,11,0.75)',
    line: { solid: '#51493a', liquid: '#2a4d5e', gas: '#403f5c', none: '#35463d' },
  },
};

const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function themeName(): ThemeName {
  const a = root.dataset.theme;
  return a === 'dark' || a === 'light' ? a : media.matches ? 'dark' : 'light';
}
export const palette = (): Palette => PALETTES[themeName()];

/** 利用者が選んだテーマを反映する。auto は端末（または表示している側）の設定に従う */
export function applyTheme(choice: ThemeChoice) {
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** テーマが変わったら呼ぶ（描き済みの絵を作り直すため） */
export function onThemeChange(cb: () => void) {
  media.addEventListener('change', cb);
  new MutationObserver(cb).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}

/** 2 色を混ぜる（#rrggbb どうし） */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
