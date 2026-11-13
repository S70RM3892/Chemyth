/**
 * 色の計算。物質の色が教科書の色からずれていないか、色だけで見分けさせていないか（色覚の多様性）を
 * 検査と撮影の測定で確かめるために使う。描画からは呼ばない（実行時の負担はない）。
 *
 * - sRGB ⇄ 線形 RGB：IEC 61966-2-1（CSS Color 4 と同じ）
 * - CIELAB：D65 白色点、sRGB → XYZ は IEC 61966-2-1 の行列
 * - CIEDE2000：G. Sharma, W. Wu, E. Dalal（2005）の式。検査は同じ論文の試験データで行う
 * - OKLab / OKLCh：CSS Color 4 の行列（B. Ottosson）
 * - WCAG のコントラスト比：WCAG 2.2 の相対輝度（閾値 0.04045）
 * - 色覚の模擬：Machado, Oliveira, Fernandes（2009）の 1 型（protan）・2 型（deutan）、強さ 1.0。線形 RGB にかける
 */

export type RGB3 = [number, number, number];
export type Lab = [number, number, number];

/** '#rrggbb'（'#rgb' も可）を 0〜255 の 3 つに */
export function hexToRgb(hex: string): RGB3 {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(f)) throw new Error(`色の書き方が違う: ${hex}`);
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** 0〜255 の 3 つを '#rrggbb' に（範囲外は切り詰め、四捨五入） */
export function rgbToHex(c: RGB3): string {
  return '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

/** sRGB の値（0〜1）を線形に */
export const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** 線形の値（0〜1）を sRGB に */
export const toSrgb = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
/** '#rrggbb' → 線形 RGB（0〜1） */
export const linearOf = (hex: string): RGB3 => hexToRgb(hex).map((v) => toLinear(v / 255)) as RGB3;
/** 線形 RGB（0〜1）→ '#rrggbb' */
export const hexOfLinear = (c: RGB3): string => rgbToHex(c.map((v) => 255 * toSrgb(clamp(v, 0, 1))) as RGB3);

/** 線形 RGB → XYZ（D65、Y は 0〜1） */
export function xyzOfLinear([r, g, b]: RGB3): RGB3 {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}
const WHITE: RGB3 = [0.95047, 1, 1.08883];
/** XYZ → CIELAB（D65） */
export function labOfXyz([x, y, z]: RGB3): Lab {
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** '#rrggbb' → CIELAB */
export const labOf = (hex: string): Lab => labOfXyz(xyzOfLinear(linearOf(hex)));
/** 0〜255 の RGB → CIELAB（画素の測定用） */
export const labOfRgb = (c: RGB3): Lab => labOfXyz(xyzOfLinear(c.map((v) => toLinear(v / 255)) as RGB3));

const deg = (r: number) => (r * 180) / Math.PI, rad = (d: number) => (d * Math.PI) / 180;
/** CIEDE2000 の色差（kL = kC = kH = 1）。Sharma, Wu, Dalal の式のとおり */
export function deltaE00(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lmp = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hmp = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) <= 180) hmp /= 2; else hmp = h1p + h2p < 360 ? (hmp + 360) / 2 : (hmp - 360) / 2; }
  const T = 1 - 0.17 * Math.cos(rad(hmp - 30)) + 0.24 * Math.cos(rad(2 * hmp)) + 0.32 * Math.cos(rad(3 * hmp + 6)) - 0.2 * Math.cos(rad(4 * hmp - 63));
  const dTh = 30 * Math.exp(-Math.pow((hmp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cmp, 7) / (Math.pow(Cmp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lmp - 50, 2)) / Math.sqrt(20 + Math.pow(Lmp - 50, 2));
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(rad(2 * dTh)) * Rc;
  const x = dLp / Sl, y = dCp / Sc, z = dHp / Sh;
  return Math.sqrt(x * x + y * y + z * z + Rt * y * z);
}
/** 2 つの '#rrggbb' の CIEDE2000 */
export const de00 = (a: string, b: string): number => deltaE00(labOf(a), labOf(b));

/** 線形 RGB → OKLab（CSS Color 4） */
export function oklabOfLinear([r, g, b]: RGB3): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** '#rrggbb' → OKLab */
export const oklabOf = (hex: string): Lab => oklabOfLinear(linearOf(hex));
/** OKLab → OKLCh（色相は度、0〜360） */
export function oklchOfLab([L, a, b]: Lab): Lab {
  const C = Math.hypot(a, b);
  return [L, C, C < 1e-9 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360];
}
/** '#rrggbb' → OKLCh */
export const oklchOf = (hex: string): Lab => oklchOfLab(oklabOf(hex));
/** OKLab の色差（ΔE_OK） */
export const deltaEOK = (a: Lab, b: Lab): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** 2 つの色相（度）の差。0〜180 */
export const hueDiff = (h1: number, h2: number): number => { const d = Math.abs(h1 - h2) % 360; return d > 180 ? 360 - d : d; };

/** WCAG の相対輝度（0〜1） */
export const relLum = (hex: string): number => xyzOfLinear(linearOf(hex))[1];
/** 0〜255 の RGB の相対輝度 */
export const relLumRgb = (c: RGB3): number => xyzOfLinear(c.map((v) => toLinear(v / 255)) as RGB3)[1];
/** WCAG のコントラスト比（1〜21） */
export function contrastRatio(y1: number, y2: number): number {
  const hi = Math.max(y1, y2), lo = Math.min(y1, y2);
  return (hi + 0.05) / (lo + 0.05);
}
/** 2 つの '#rrggbb' の WCAG コントラスト比 */
export const contrast = (a: string, b: string): number => contrastRatio(relLum(a), relLum(b));

/** Machado ほか（2009）の行列、強さ 1.0。表 1 の値 */
export const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;
export type Cvd = keyof typeof MACHADO;
/** 線形 RGB に行列をかける（0〜1 に切り詰める） */
export function cvdLinear(c: RGB3, kind: Cvd): RGB3 {
  const M = MACHADO[kind];
  return [0, 1, 2].map((k) => clamp(M[k][0] * c[0] + M[k][1] * c[1] + M[k][2] * c[2], 0, 1)) as RGB3;
}
/** 1 型・2 型の色覚で見える色（8 ビットに丸めた '#rrggbb'） */
export const cvdHex = (hex: string, kind: Cvd): string => hexOfLinear(cvdLinear(linearOf(hex), kind));
/** 色覚の見え方ごとの CIEDE2000。kind を省くと一般の色覚 */
export const de00As = (a: string, b: string, kind?: Cvd): number => (kind ? de00(cvdHex(a, kind), cvdHex(b, kind)) : de00(a, b));

/** ガンマ 2 の作業空間で 2 色を混ぜる（t = 0 で a、1 で b）。8 ビットの値は往復で変わらない */
export function mixGamma2(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => {
    const x = v / 255, y = B[i] / 255, s = x * x + (y * y - x * x) * t;
    return 255 * Math.sqrt(Math.max(s, 0));
  }) as RGB3);
}
