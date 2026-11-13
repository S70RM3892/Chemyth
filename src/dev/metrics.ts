/**
 * 撮影した画面を測る関数（SPEC2 §6.C C10、§7.3 の検査が使う）。どれも RGBA の配列だけを受け取る純粋な関数で、
 * ブラウザにも DOM にも頼らない（Playwright の撮影や getImageData の結果をそのまま渡せる）。ゲームの実行時には使わない。
 *
 * - 画面の明るさ（表示の luma）：sRGB の値（0〜1）に Rec. 709 の重み 0.2126・0.7152・0.0722 をかけたもの
 * - 相対輝度（線形の Y）と WCAG のコントラスト比：colorsci.ts（WCAG 2.2）
 * - 色差：CIEDE2000（colorsci.ts）。色相：HSV と OKLCh
 */
import { contrastRatio, deltaE00, hexToRgb, hsvOfRgb, labOf, labOfRgb, oklchOfRgb, relLumRgb, type RGB3 } from '../content/colorsci';

/** 画像（ImageData と同じ形）。data は RGBA の順に 1 画素 4 つ */
export interface Img { data: ArrayLike<number>; width: number; height: number }
/** 画素の四角（端を含まない右下：x ≤ px < x + w） */
export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = [number, number];

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(v)));
/** 画像の中に切り詰めた四角。省くと画像全体 */
function within(img: Img, r?: Rect): Rect {
  if (!r) return { x: 0, y: 0, w: img.width, h: img.height };
  const x0 = clampInt(r.x, 0, img.width), y0 = clampInt(r.y, 0, img.height);
  const x1 = clampInt(r.x + r.w, 0, img.width), y1 = clampInt(r.y + r.h, 0, img.height);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
/** 1 画素の RGB（0〜255）。画像の外は端の画素 */
export function rgbAt(img: Img, x: number, y: number): RGB3 {
  const i = (clampInt(y, 0, img.height - 1) * img.width + clampInt(x, 0, img.width - 1)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
/** 表示の luma（0〜1） */
export const lumaOf = (c: RGB3): number => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** 並べた値の p 分位（p は 0〜100、線形補間）。空なら NaN */
export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Array.from(values).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const k = (Math.max(0, Math.min(100, p)) / 100) * (a.length - 1), i = Math.floor(k), f = k - i;
  return i + 1 < a.length ? a[i] + (a[i + 1] - a[i]) * f : a[i];
}
export const median = (values: ArrayLike<number>): number => percentile(values, 50);

/** 四角の中の表示の luma をすべて（行の順） */
export function lumas(img: Img, r?: Rect): number[] {
  const q = within(img, r), out: number[] = [];
  for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) out.push(lumaOf(rgbAt(img, x, y)));
  return out;
}
/** 表示の luma の分位（例：[5, 50, 95]） */
export const lumaPercentiles = (img: Img, ps: number[], r?: Rect): number[] => { const l = lumas(img, r); return ps.map((p) => percentile(l, p)); };

/**
 * 四角を 3×3（n×n）のます目に分け、ますごとの中央値。行の順に n×n 個。
 * of：'luma'（表示の luma）か 'Y'（相対輝度、線形）
 */
export function cellMedians(img: Img, r?: Rect, n = 3, of: 'luma' | 'Y' = 'luma'): number[] {
  const q = within(img, r), out: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x0 = q.x + Math.floor((q.w * i) / n), x1 = q.x + Math.floor((q.w * (i + 1)) / n);
    const y0 = q.y + Math.floor((q.h * j) / n), y1 = q.y + Math.floor((q.h * (j + 1)) / n);
    const v: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const c = rgbAt(img, x, y); v.push(of === 'luma' ? lumaOf(c) : relLumRgb(c)); }
    out.push(median(v));
  }
  return out;
}

/** 点の集まりの相対輝度の中央値（WCAG の Y） */
export const pointsY = (img: Img, pts: Pt[]): number => median(pts.map(([x, y]) => relLumRgb(rgbAt(img, x, y))));
/** 2 つの点の集まり（文字の画素と、そのまわりの画素など）の WCAG コントラスト比。それぞれ相対輝度の中央値で比べる */
export const contrastOfSets = (img: Img, a: Pt[], b: Pt[]): number => contrastRatio(pointsY(img, a), pointsY(img, b));

/** 点のまわり（半径 r 画素の正方形）の RGB の中央値。r = 0 ならその画素 */
export function rgbMedianAt(img: Img, x: number, y: number, r = 0): RGB3 {
  const ch: number[][] = [[], [], []];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const c = rgbAt(img, x + dx, y + dy); ch[0].push(c[0]); ch[1].push(c[1]); ch[2].push(c[2]); }
  return [median(ch[0]), median(ch[1]), median(ch[2])];
}
/** 探る点（probe）の色と、期待する '#rrggbb' の CIEDE2000。r は中央値をとる半径 */
export interface Probe { x: number; y: number; hex: string; r?: number }
export const deltaEAtProbes = (img: Img, probes: Probe[]): number[] =>
  probes.map((p) => deltaE00(labOfRgb(rgbMedianAt(img, p.x, p.y, p.r ?? 0)), labOf(p.hex)));
/** 2 枚の画像の同じ点の CIEDE2000（段のあいだ・時刻のあいだの比較） */
export const deltaEBetween = (a: Img, b: Img, pts: Pt[], r = 0): number[] =>
  pts.map(([x, y]) => deltaE00(labOfRgb(rgbMedianAt(a, x, y, r)), labOfRgb(rgbMedianAt(b, x, y, r))));

/** 点の HSV の色相（度）と彩度・明度 */
export const hsvAt = (img: Img, x: number, y: number): RGB3 => hsvOfRgb(rgbAt(img, x, y));
/** 点の OKLCh（L 0〜1、C、色相は度） */
export const oklchAt = (img: Img, x: number, y: number): RGB3 => oklchOfRgb(rgbAt(img, x, y));
/** 2 つの色相（度）の差（0〜180） */
export const hueGap = (h1: number, h2: number): number => { const d = Math.abs(h1 - h2) % 360; return d > 180 ? 360 - d : d; };
/** '#rrggbb' の OKLCh の色相（度） */
export const hueOfHex = (hex: string): number => oklchOfRgb(hexToRgb(hex))[2];

/**
 * 8×8 の窓の SSIM（luma、0〜1 の値、C1 = (0.01)²、C2 = (0.03)²）。窓は 8 画素ずつずらして重ねず、平均をとる。
 * 同じ大きさの 2 枚、同じ四角で比べる。四角が 8 画素に満たなければ、その大きさの窓 1 つで
 */
export function ssim8(a: Img, b: Img, r?: Rect): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('SSIM：画像の大きさが違う');
  const q = within(a, r), C1 = 0.01 ** 2, C2 = 0.03 ** 2, n = 8;
  const W = Math.min(n, q.w), H = Math.min(n, q.h);
  if (!W || !H) return NaN;
  let sum = 0, cnt = 0;
  for (let y0 = q.y; y0 + H <= q.y + q.h; y0 += H) for (let x0 = q.x; x0 + W <= q.x + q.w; x0 += W) {
    let ma = 0, mb = 0;
    const va: number[] = [], vb: number[] = [];
    for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + W; x++) { const p = lumaOf(rgbAt(a, x, y)), s = lumaOf(rgbAt(b, x, y)); va.push(p); vb.push(s); ma += p; mb += s; }
    const N = va.length;
    ma /= N; mb /= N;
    let sa = 0, sb = 0, sab = 0;
    for (let k = 0; k < N; k++) { const da = va[k] - ma, db = vb[k] - mb; sa += da * da; sb += db * db; sab += da * db; }
    sa /= N - 1 || 1; sb /= N - 1 || 1; sab /= N - 1 || 1;
    sum += ((2 * ma * mb + C1) * (2 * sab + C2)) / ((ma * ma + mb * mb + C1) * (sa + sb + C2));
    cnt++;
  }
  return sum / cnt;
}

/**
 * 2 枚のあいだで変わった画素の割合（0〜1）。どれかの色の差が threshold（0〜255、既定 4）を超えたら「変わった」。
 * exclude は数えない画素（0 以外の値が除外。幅×高さの 1 画素 1 つ）：光るもの・粒子の仮面など
 */
export function changedShare(a: Img, b: Img, threshold = 4, exclude?: ArrayLike<number>, r?: Rect): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('changedShare：画像の大きさが違う');
  const q = within(a, r);
  let changed = 0, total = 0;
  for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) {
    const p = y * a.width + x;
    if (exclude && exclude[p]) continue;
    total++;
    const i = p * 4;
    if (Math.abs(a.data[i] - b.data[i]) > threshold || Math.abs(a.data[i + 1] - b.data[i + 1]) > threshold || Math.abs(a.data[i + 2] - b.data[i + 2]) > threshold) changed++;
  }
  return total ? changed / total : 0;
}

/** 4 近傍のラプラシアン（luma）の 2 乗の平均。細かな模様の量（§7.3 j）。端の 1 画素は使わない */
export function laplacianEnergy(img: Img, r?: Rect): number {
  const q = within(img, r);
  let sum = 0, cnt = 0;
  for (let y = Math.max(q.y, 1); y < Math.min(q.y + q.h, img.height - 1); y++) for (let x = Math.max(q.x, 1); x < Math.min(q.x + q.w, img.width - 1); x++) {
    const l = 4 * lumaOf(rgbAt(img, x, y)) - lumaOf(rgbAt(img, x - 1, y)) - lumaOf(rgbAt(img, x + 1, y)) - lumaOf(rgbAt(img, x, y - 1)) - lumaOf(rgbAt(img, x, y + 1));
    sum += l * l; cnt++;
  }
  return cnt ? sum / cnt : 0;
}

/** 物質として描いた形（keep の形）。円か四角。座標は画素 */
export type Shape = { kind: 'circle'; x: number; y: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number };
/** 形の境目から内側への距離（画素の中心で。外なら負） */
function insideDepth(s: Shape, px: number, py: number): number {
  const x = px + 0.5, y = py + 0.5;
  if (s.kind === 'circle') return s.r - Math.hypot(x - s.x, y - s.y);
  return Math.min(x - s.x, s.x + s.w - x, y - s.y, s.y + s.h - y);
}
/** 境目から内側へ inner〜outer 画素の輪の画素（既定 1〜3：§7.3 c の rim） */
export function ringPixels(s: Shape, inner = 1, outer = 3): Pt[] {
  const b = s.kind === 'circle' ? { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r } : s;
  const out: Pt[] = [];
  for (let y = Math.floor(b.y); y < Math.ceil(b.y + b.h); y++) for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.w); x++) {
    const d = insideDepth(s, x, y);
    if (d >= inner && d <= outer) out.push([x, y]);
  }
  return out;
}
/**
 * 輪の統計：輪の画素ごとに、基準の画像（標準・12:00）の同じ位置の画素との CIEDE2000 をとり、最大・平均・閾値を超えた割合を返す
 */
export function rimStats(img: Img, ref: Img, s: Shape, threshold = 3, inner = 1, outer = 3): { n: number; max: number; mean: number; over: number } {
  const pts = ringPixels(s, inner, outer).filter(([x, y]) => x >= 0 && y >= 0 && x < img.width && y < img.height);
  if (!pts.length) return { n: 0, max: 0, mean: 0, over: 0 };
  const d = deltaEBetween(img, ref, pts);
  return { n: pts.length, max: Math.max(...d), mean: d.reduce((a, b) => a + b, 0) / d.length, over: d.filter((v) => v > threshold).length / d.length };
}
