import { mixGamma2 } from './colorsci';

/**
 * 熱で光る物の色（黒体放射）と、炎色反応の原子の線。
 * 色の表は、プランクの分布を CIE 1931 の等色関数に通して作ったもの（SPEC2 §10.7、[D1]）。実行時には作らず、定数で持つ。
 * 明るさ log10(Y/Y₆₀₀) は 600 ℃ に対する輝度の比。表にない温度は、1/T（絶対温度）について直線で補う
 * （ウィーンの近似で log Y は 1/T にほぼ比例するので、1400・1600・1800 ℃ も物理の値と 0.01 以内で合う）。
 */
export interface BlackbodyRow { T: number; hex: string; logY?: number }
export const BLACKBODY: BlackbodyRow[] = [
  { T: 450, hex: '#ff0000', logY: -2.37 },
  { T: 525, hex: '#ff1a00', logY: -1.08 },
  { T: 600, hex: '#ff2a00', logY: 0 },
  { T: 700, hex: '#ff3b00', logY: 1.19 },
  { T: 800, hex: '#ff4900', logY: 2.17 },
  { T: 900, hex: '#ff5400', logY: 2.99 },
  { T: 1000, hex: '#ff5e00', logY: 3.68 },
  { T: 1200, hex: '#ff6e00', logY: 4.8 },
  { T: 1400, hex: '#ff7b00' },
  { T: 1500, hex: '#ff8100', logY: 6.02 },
  { T: 1600, hex: '#ff8600' },
  { T: 1800, hex: '#ff9120' },
  { T: 2000, hex: '#ff9b36', logY: 7.36 },
];
/** 色の表示の上限（℃）。これより熱いものも、この色で描く */
export const T_CLAMP = 2000;
/** 赤く見え始める温度（ドレーパー点、℃） [D1] */
export const DRAPER = 525;
/** 白熱の芯の色 */
export const WHITE_HOT = '#fff1d6';

const K = (t: number) => t + 273.15;
const LOGY = BLACKBODY.filter((r) => r.logY !== undefined) as Required<BlackbodyRow>[];
/** 600 ℃ に対する輝度の比の対数。表の外は端の 2 行で延ばす */
export function logY(T: number): number {
  let i = 0;
  while (i < LOGY.length - 2 && T > LOGY[i + 1].T) i++;
  const a = LOGY[i], b = LOGY[i + 1];
  const u = (1 / K(a.T) - 1 / K(T)) / (1 / K(a.T) - 1 / K(b.T));
  return a.logY + (b.logY - a.logY) * u;
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** 光の強さ G（0〜1）。ドレーパー点より下では 0 */
export const G = (T: number): number => clamp01((logY(T) + 1.2) / 7.5);
/** 昼の明るさの中で見える度合い V（0〜1） */
export const V = (T: number): number => smooth(1.5, 4.0, logY(T));
/** 温度（℃）の色。表の行の間はガンマ 2 で直線に補い、2000 ℃ で切る */
export function blackbodyHex(T: number): string {
  const t = Math.min(Math.max(T, BLACKBODY[0].T), T_CLAMP);
  let i = 0;
  while (i < BLACKBODY.length - 2 && t > BLACKBODY[i + 1].T) i++;
  const a = BLACKBODY[i], b = BLACKBODY[i + 1];
  return mixGamma2(a.hex, b.hex, (t - a.T) / (b.T - a.T));
}
/** 白熱の芯をまぜた色：G が 0.7 を超えると #fff1d6 へ寄る */
export const whiteHotHex = (T: number): string => mixGamma2(blackbodyHex(T), WHITE_HOT, smooth(0.7, 1.0, G(T)));

/** 光源の色（描く電灯・炎の色。物質の色には使わない） */
export const LIGHT_SOURCES = {
  candle: { K: 1850, hex: '#ff8500' },
  tungsten: { K: 2700, hex: '#ffae59' },
  led: { K: 4000, hex: '#ffd4a5' },
  panel: { K: 5000, hex: '#ffe7d0' },
} as const;

/** 炎色反応の原子の強い線（nm）。分光器を描くとき（第 2 ラウンド）に使う。原子の線だけを持つ [N2][C1] */
export const LINES: Record<string, { nm: number[]; src: string[] }> = {
  Li: { nm: [670.8], src: ['N2', 'C1'] },
  Na: { nm: [589.0, 589.6], src: ['N2', 'C1'] },
  K: { nm: [766.5, 769.9, 404.4], src: ['N2', 'C1', 'JF'] },
};
