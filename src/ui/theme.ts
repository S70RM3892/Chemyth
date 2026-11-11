/** 見た目は「スキン × 明暗」の 4 通り。
 *  ノート：ライト＝方眼ノートにインク、ダーク＝黒板にチョーク。
 *  工業：ライト＝光の炉（白い鋼板、安全色、差し込む日光）、ダーク＝闇の炉（煤けた鉄、溶けた橙、火の粉と走査線）。
 *  画面部品（CSS）と地図（canvas）で同じ色を使う */
export type ThemeName = 'light' | 'dark';
export type ThemeChoice = 'auto' | ThemeName;
export type Skin = 'note' | 'punk';

export interface Palette {
  key: string;
  skin: Skin;
  name: ThemeName;
  paper: string;
  grid: string;
  gridBold: string;
  /** 主線と文字 */
  ink: string;
  soft: string;
  /** 警告・赤ペン */
  red: string;
  /** 強調・蛍光ペン・信号色 */
  hi: string;
  /** 装置や物質の台 */
  plate: string;
  shadow: string;
  /** 元素の形の輪郭 */
  edge: string;
  /** 光の色（r,g,b）。工業スキンの発光に使う */
  glow: string;
  line: { solid: string; liquid: string; gas: string; none: string };
  /** 手書き・見出し用の書体 */
  font: string;
}

const HAND = '"Klee One", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif';
const HEAVY = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic", sans-serif';

export const PALETTES: Record<string, Palette> = {
  'note-light': {
    key: 'note-light', skin: 'note', name: 'light', paper: '#f3f5ef', grid: '#cfdfe3', gridBold: '#a9c6ce', ink: '#1c2a48', soft: '#63718a', red: '#d23f3a', hi: '#ffe14d',
    plate: '#ffffff', shadow: 'rgba(28,42,72,0.2)', edge: '#1c2a48', glow: '255,225,77', font: HAND,
    line: { solid: '#ead9b8', liquid: '#c8e3f2', gas: '#e4e0f4', none: '#e3e6de' },
  },
  'note-dark': {
    key: 'note-dark', skin: 'note', name: 'dark', paper: '#1f2d27', grid: 'rgba(232,238,224,0.07)', gridBold: 'rgba(232,238,224,0.14)', ink: '#eceee2', soft: '#a3b0a2', red: '#f2938c', hi: '#f3d86b',
    plate: '#2a3b32', shadow: 'rgba(0,0,0,0.35)', edge: 'rgba(8,14,11,0.75)', glow: '243,216,107', font: HAND,
    line: { solid: '#51493a', liquid: '#2a4d5e', gas: '#403f5c', none: '#35463d' },
  },
  // 光の炉：昼の製鉄所。白い琺瑯の鋼板、黒い縁、安全橙と信号黄
  'punk-light': {
    key: 'punk-light', skin: 'punk', name: 'light', paper: '#c9ced2', grid: 'rgba(20,24,29,0.10)', gridBold: 'rgba(20,24,29,0.34)', ink: '#14181d', soft: '#4d5761', red: '#f04a12', hi: '#ffc400',
    plate: '#f4f5f2', shadow: 'rgba(10,15,20,0.4)', edge: '#14181d', glow: '255,244,214', font: HEAVY,
    line: { solid: '#b89255', liquid: '#49b9d6', gas: '#dfe5ea', none: '#a3acb4' },
  },
  // 闇の炉：夜勤の溶鉱炉。煤けた鉄、溶けた橙、警報の赤
  'punk-dark': {
    key: 'punk-dark', skin: 'punk', name: 'dark', paper: '#0c0e11', grid: 'rgba(255,255,255,0.035)', gridBold: 'rgba(255,138,31,0.16)', ink: '#f0e9dc', soft: '#8d9198', red: '#ff3d2e', hi: '#ff8a1f',
    plate: '#1d2127', shadow: 'rgba(0,0,0,0.65)', edge: 'rgba(0,0,0,0.85)', glow: '255,122,30', font: HEAVY,
    line: { solid: '#4d3c28', liquid: '#0f566a', gas: '#34384a', none: '#2a2f37' },
  },
};

const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function themeName(): ThemeName {
  const a = root.dataset.theme;
  return a === 'dark' || a === 'light' ? a : media.matches ? 'dark' : 'light';
}
export const skinName = (): Skin => (root.dataset.skin === 'punk' ? 'punk' : 'note');
export const palette = (): Palette => PALETTES[`${skinName()}-${themeName()}`];

/** 明暗の選択を反映する。auto は端末（または表示している側）の設定に従う */
export function applyTheme(choice: ThemeChoice) {
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}
export function applySkin(skin: Skin) {
  if (skin === 'punk') root.dataset.skin = 'punk';
  else delete root.dataset.skin;
}

/** 見た目が変わったら呼ぶ（描き済みの絵を作り直すため） */
export function onThemeChange(cb: () => void) {
  media.addEventListener('change', cb);
  new MutationObserver(cb).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
}

/** 2 色を混ぜる（#rrggbb どうし） */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
