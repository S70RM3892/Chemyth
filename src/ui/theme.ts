/** 見た目は「スキン × 明暗」の 8 通り。
 *  ノート：ライト＝方眼ノートにインク、ダーク＝黒板にチョーク。
 *  工業：ライト＝光の炉（白い鋼板、安全色、差し込む日光）、ダーク＝闇の炉（煤けた鉄、溶けた橙、火の粉と走査線）。
 *  魔術：ライト＝羊皮紙の実験録（セピアのインク、真鍮、青く光る液）、ダーク＝夜の書斎（藍の闇、真鍮、青い灯）。
 *  研究所：ライト＝白の研究棟（白い陶板の床、銀とガラスの装置、青緑の立体映像）、ダーク＝深夜のラボ（青緑と赤紫の灯を映す黒い床）。
 *  画面部品（CSS）と地図（canvas）で同じ色を使う */
export type ThemeName = 'light' | 'dark';
export type ThemeChoice = 'auto' | ThemeName;
export type Skin = 'note' | 'punk' | 'arcane' | 'lab';

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
const SERIF = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';
const SANS = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';
/** 魔術スキンの真鍮の色（明るい面・縁） */
export const BRASS = '#b8913f', BRASS_DARK = '#6b4f1f';

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
  // 羊皮紙：錬金術師の実験録。セピアのインク、真鍮の金具、ガラス管の中を青い光が流れる
  'arcane-light': {
    key: 'arcane-light', skin: 'arcane', name: 'light', paper: '#eadfc4', grid: 'rgba(110,78,36,0.09)', gridBold: 'rgba(110,78,36,0.2)', ink: '#3b2a1a', soft: '#7c6850', red: '#a3322b', hi: '#35aef2',
    plate: '#f7f0dc', shadow: 'rgba(70,45,15,0.26)', edge: '#3b2a1a', glow: '53,174,242', font: SERIF,
    line: { solid: '#d8c69a', liquid: '#bfe6fb', gas: '#e2dcf2', none: '#dfd4b6' },
  },
  // 夜の書斎：藍の闇に、真鍮と青い灯
  'arcane-dark': {
    key: 'arcane-dark', skin: 'arcane', name: 'dark', paper: '#14121e', grid: 'rgba(120,170,255,0.05)', gridBold: 'rgba(196,154,78,0.15)', ink: '#efe5cc', soft: '#a99b83', red: '#ff7a66', hi: '#5ccaff',
    plate: '#262034', shadow: 'rgba(0,0,0,0.55)', edge: 'rgba(8,6,16,0.88)', glow: '92,202,255', font: SERIF,
    line: { solid: '#4b3d29', liquid: '#1c4b68', gas: '#3a3555', none: '#2d2841' },
  },
  // 闇の炉：夜勤の溶鉱炉。煤けた鉄、溶けた橙、警報の赤
  'punk-dark': {
    key: 'punk-dark', skin: 'punk', name: 'dark', paper: '#0c0e11', grid: 'rgba(255,255,255,0.035)', gridBold: 'rgba(255,138,31,0.16)', ink: '#f0e9dc', soft: '#8d9198', red: '#ff3d2e', hi: '#ff8a1f',
    plate: '#1d2127', shadow: 'rgba(0,0,0,0.65)', edge: 'rgba(0,0,0,0.85)', glow: '255,122,30', font: HEAVY,
    line: { solid: '#4d3c28', liquid: '#0f566a', gas: '#34384a', none: '#2a2f37' },
  },
  // 白の研究棟：白い陶板の床、銀の縁とガラスの装置、青緑の立体映像
  'lab-light': {
    key: 'lab-light', skin: 'lab', name: 'light', paper: '#dfe6eb', grid: 'rgba(40,70,90,0.08)', gridBold: 'rgba(40,70,90,0.18)', ink: '#16222d', soft: '#596a77', red: '#e23d55', hi: '#11b7c9',
    plate: '#ffffff', shadow: 'rgba(30,52,70,0.22)', edge: '#16222d', glow: '0,196,214', font: SANS,
    line: { solid: '#dfe5ea', liquid: '#a6e3ef', gas: '#ddd8f3', none: '#e4e9ed' },
  },
  // 深夜のラボ：青緑と赤紫の灯を映す、黒く磨いた床
  'lab-dark': {
    key: 'lab-dark', skin: 'lab', name: 'dark', paper: '#0a1018', grid: 'rgba(80,220,240,0.05)', gridBold: 'rgba(80,220,240,0.12)', ink: '#e4f3f7', soft: '#8aa1ae', red: '#ff4f7b', hi: '#2ef0e0',
    plate: '#131c27', shadow: 'rgba(0,0,0,0.6)', edge: 'rgba(3,7,12,0.92)', glow: '46,240,224', font: SANS,
    line: { solid: '#283444', liquid: '#0d4b5e', gas: '#3a2d58', none: '#202a37' },
  },
};
/** 研究所スキンの差し色（赤紫）。暗いテーマの灯と、立体映像の二色目に使う */
export const LAB_MAGENTA = '255,79,216';

const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function themeName(): ThemeName {
  const a = root.dataset.theme;
  return a === 'dark' || a === 'light' ? a : media.matches ? 'dark' : 'light';
}
export const skinName = (): Skin => (root.dataset.skin === 'punk' ? 'punk' : root.dataset.skin === 'arcane' ? 'arcane' : root.dataset.skin === 'lab' ? 'lab' : 'note');
export const palette = (): Palette => PALETTES[`${skinName()}-${themeName()}`];

/** 明暗の選択を反映する。auto は端末（または表示している側）の設定に従う */
export function applyTheme(choice: ThemeChoice) {
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}
export function applySkin(skin: Skin) {
  if (skin === 'punk' || skin === 'arcane' || skin === 'lab') root.dataset.skin = skin;
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
