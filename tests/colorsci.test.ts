import { describe, expect, it } from 'vitest';
import {
  MACHADO, contrast, contrastRatio, cvdHex, cvdLinearRaw, de00, deltaE00, hexOfLinear, hexToRgb, hsvOfRgb, labOf, linearOf, mixGamma2, oklabOf, oklchOf, relLum, rgbToHex,
  toLinear, toSrgb, type Lab,
} from '../src/content/colorsci';
import {
  cellMedians, changedShare, contrastOfSets, deltaEAtProbes, deltaEBetween, hsvAt, hueGap, hueOfHex, laplacianEnergy, lumaPercentiles, oklchAt, percentile,
  rimStats, ringPixels, ssim8, type Img, type Pt,
} from '../src/dev/metrics';

/**
 * G. Sharma, W. Wu, E. N. Dalal (2005) の CIEDE2000 の試験データ（ciede2000testdata.txt、34 組）。
 * L1 a1 b1 L2 a2 b2 ΔE00。https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
 */
const SHARMA: number[][] = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
];

describe('CIEDE2000（Sharma・Wu・Dalal の試験データ）', () => {
  it('34 組すべてで、表の値と 1e-4 以内（最初の 10 組を含む）。入れ替えても同じ', () => {
    for (const [i, r] of SHARMA.entries()) {
      const a: Lab = [r[0], r[1], r[2]], b: Lab = [r[3], r[4], r[5]];
      expect(Math.abs(deltaE00(a, b) - r[6]), `組 ${i + 1}`).toBeLessThan(1e-4);
      expect(Math.abs(deltaE00(b, a) - r[6]), `組 ${i + 1}（逆）`).toBeLessThan(1e-4);
    }
    expect(deltaE00([50, 10, -10], [50, 10, -10])).toBe(0);
  });
});

describe('sRGB・CIELAB・OKLab', () => {
  it('sRGB の符号化と線形の往復（IEC 61966-2-1）：8 ビットのどの値も戻る', () => {
    for (let v = 0; v <= 255; v++) expect(Math.round(255 * toSrgb(toLinear(v / 255)))).toBe(v);
    expect(toLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 12);
    expect(toLinear(1)).toBeCloseTo(1, 12);
    expect(hexOfLinear(linearOf('#3b82d6'))).toBe('#3b82d6');
    expect(rgbToHex(hexToRgb('#a8001e'))).toBe('#a8001e');
    expect(hexToRgb('#fa0')).toEqual([255, 170, 0]);
    expect(() => hexToRgb('#12345')).toThrow();
  });
  it('CIELAB（D65）：白は (100, 0, 0)、sRGB の赤は (53.24, 80.09, 67.20)', () => {
    const w = labOf('#ffffff');
    expect(w[0]).toBeCloseTo(100, 3); expect(Math.abs(w[1])).toBeLessThan(1e-3); expect(Math.abs(w[2])).toBeLessThan(1e-3);
    const r = labOf('#ff0000');
    expect(r[0]).toBeCloseTo(53.24, 1); expect(r[1]).toBeCloseTo(80.09, 1); expect(r[2]).toBeCloseTo(67.2, 1);
    expect(labOf('#000000')).toEqual([0, 0, 0]);
  });
  it('OKLab / OKLCh（CSS Color 4）：白は L = 1、赤は oklch(0.628 0.2577 29.23)', () => {
    const w = oklabOf('#ffffff');
    expect(w[0]).toBeCloseTo(1, 4); expect(Math.abs(w[1])).toBeLessThan(1e-4); expect(Math.abs(w[2])).toBeLessThan(1e-4);
    const r = oklabOf('#ff0000');
    expect(r[0]).toBeCloseTo(0.62796, 4); expect(r[1]).toBeCloseTo(0.22486, 4); expect(r[2]).toBeCloseTo(0.12585, 4);
    const c = oklchOf('#ff0000');
    expect(c[1]).toBeCloseTo(0.2577, 3); expect(c[2]).toBeCloseTo(29.23, 1);
    expect(oklchOf('#808080')[1]).toBeLessThan(1e-4);
  });
  it('HSV の色相', () => {
    expect(hsvOfRgb([255, 0, 0])).toEqual([0, 1, 1]);
    expect(hsvOfRgb([0, 255, 0])[0]).toBeCloseTo(120, 6);
    expect(hsvOfRgb([0, 0, 255])[0]).toBeCloseTo(240, 6);
    expect(hsvOfRgb([255, 0, 128])[0]).toBeCloseTo(329.9, 1);
    expect(hsvOfRgb([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('WCAG のコントラスト比（WCAG 2.2）', () => {
  it('黒と白は 21:1、#777 と白は 4.48:1、#767676 と白は 4.54:1、同じ色は 1:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrast('#ffffff', '#767676')).toBeCloseTo(4.54, 2);
    expect(contrast('#5d6b84', '#5d6b84')).toBe(1);
    expect(relLum('#ffffff')).toBeCloseTo(1, 6);
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 9);
  });
});

describe('色覚の模擬（Machado・Oliveira・Fernandes 2009、強さ 1.0）', () => {
  it('純色の赤・緑・青に、論文の表 1 の値（行列の列）を返す。白は白のまま', () => {
    const P = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
    const D = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]];
    for (const [kind, M] of [['protan', P], ['deutan', D]] as const) {
      expect(MACHADO[kind].map((r) => [...r])).toEqual(M);
      for (let c = 0; c < 3; c++) {
        const unit: [number, number, number] = [0, 0, 0];
        unit[c] = 1;
        const out = cvdLinearRaw(unit, kind);
        for (let k = 0; k < 3; k++) expect(out[k], `${kind} ${c} ${k}`).toBeCloseTo(M[k][c], 9);
      }
      const w = cvdLinearRaw([1, 1, 1], kind);
      for (const v of w) expect(v).toBeCloseTo(1, 5);
      expect(cvdHex('#ffffff', kind)).toBe('#ffffff');
      expect(cvdHex('#000000', kind)).toBe('#000000');
    }
    // 1 型・2 型では赤と緑が近づく
    expect(de00(cvdHex('#ff0000', 'protan'), cvdHex('#00a000', 'protan'))).toBeLessThan(de00('#ff0000', '#00a000'));
  });
});

describe('ガンマ 2 の作業空間', () => {
  it('8 ビットのどの値も、2 乗して平方根で戻る。混ぜる端は元の色', () => {
    for (let v = 0; v <= 255; v++) expect(Math.round(255 * Math.sqrt(Math.max((v / 255) * (v / 255), 0)))).toBe(v);
    expect(mixGamma2('#ff5400', '#fff1d6', 0)).toBe('#ff5400');
    expect(mixGamma2('#ff5400', '#fff1d6', 1)).toBe('#fff1d6');
    expect(mixGamma2('#000000', '#ffffff', 0.5)).toBe('#b4b4b4');
  });
});

/** 画像を作る：f(x, y) が RGB を返す */
const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Img => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return { data, width: w, height: h };
};

describe('撮影の測定（src/dev/metrics.ts）', () => {
  it('分位と、表示の luma の分位', () => {
    expect(percentile([3, 1, 2, 4], 50)).toBe(2.5);
    expect(percentile([5], 95)).toBe(5);
    expect(Number.isNaN(percentile([], 50))).toBe(true);
    const half = img(10, 10, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255]));
    const [p5, p95] = lumaPercentiles(half, [5, 95]);
    expect(p5).toBe(0); expect(p95).toBeCloseTo(1, 12);
    expect(lumaPercentiles(half, [5], { x: 6, y: 0, w: 4, h: 10 })[0]).toBeCloseTo(1, 12);
  });
  it('3×3 のますの中央値（luma と線形の Y）', () => {
    const g = img(9, 9, (x, y) => { const v = 20 * (Math.floor(x / 3) + 3 * Math.floor(y / 3)); return [v, v, v]; });
    const m = cellMedians(g);
    expect(m.map((v) => Math.round(v * 255))).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160]);
    const Y = cellMedians(g, undefined, 3, 'Y');
    expect(Y[8]).toBeCloseTo(toLinear(160 / 255), 6);
  });
  it('2 つの点の集まりの WCAG コントラスト', () => {
    const half = img(10, 10, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255]));
    const ink: Pt[] = [[1, 1], [2, 2], [3, 3]], paper: Pt[] = [[7, 1], [8, 2], [9, 3]];
    expect(contrastOfSets(half, ink, paper)).toBeCloseTo(21, 6);
  });
  it('探る点の CIEDE2000、2 枚のあいだの CIEDE2000', () => {
    const a = img(8, 8, () => hexToRgb('#3b82d6')), b = img(8, 8, () => hexToRgb('#3aa0c8'));
    expect(deltaEAtProbes(a, [{ x: 4, y: 4, hex: '#3b82d6', r: 1 }])[0]).toBe(0);
    expect(deltaEAtProbes(a, [{ x: 4, y: 4, hex: '#3aa0c8' }])[0]).toBeCloseTo(de00('#3b82d6', '#3aa0c8'), 9);
    expect(deltaEBetween(a, b, [[1, 1]])[0]).toBeCloseTo(de00('#3b82d6', '#3aa0c8'), 9);
  });
  it('点の HSV・OKLCh の色相', () => {
    const a = img(2, 2, () => [255, 0, 0]);
    expect(hsvAt(a, 0, 0)[0]).toBe(0);
    expect(oklchAt(a, 1, 1)[2]).toBeCloseTo(29.23, 1);
    expect(hueOfHex('#ff0000')).toBeCloseTo(29.23, 1);
    expect(hueGap(350, 10)).toBe(20);
    expect(hueGap(10, 190)).toBe(180);
  });
  it('8×8 の SSIM：同じ画像は 1、模様が崩れると下がる', () => {
    const a = img(32, 32, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? [220, 220, 220] : [30, 30, 30]);
    const b = img(32, 32, (x, y) => ((x * 7 + y * 13) % 5 < 2 ? [220, 220, 220] : [30, 30, 30]));
    expect(ssim8(a, a)).toBeCloseTo(1, 9);
    expect(ssim8(a, b)).toBeLessThan(0.5);
    expect(() => ssim8(a, img(8, 8, () => [0, 0, 0]))).toThrow();
  });
  it('変わった画素の割合（除外の仮面つき）', () => {
    const a = img(10, 10, () => [100, 100, 100]);
    const b = img(10, 10, (x) => (x === 0 ? [110, 100, 100] : x === 1 ? [103, 100, 100] : [100, 100, 100]));
    expect(changedShare(a, b)).toBeCloseTo(0.1, 9);                 // 4/255 より大きく変わったのは x = 0 の列だけ
    const mask = new Uint8Array(100); for (let y = 0; y < 10; y++) mask[y * 10] = 1;
    expect(changedShare(a, b, 4, mask)).toBe(0);
    expect(changedShare(a, a)).toBe(0);
  });
  it('ラプラシアンの量：平らな画像は 0、細かな模様ほど大きい', () => {
    const flat = img(16, 16, () => [128, 128, 128]);
    const fine = img(16, 16, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
    const coarse = img(16, 16, (x) => (x < 8 ? [255, 255, 255] : [0, 0, 0]));
    expect(laplacianEnergy(flat)).toBe(0);
    expect(laplacianEnergy(fine)).toBeGreaterThan(laplacianEnergy(coarse));
  });
  it('物質の形の輪（内側 1〜3 画素）と、輪の色の統計', () => {
    const ring = ringPixels({ kind: 'rect', x: 10, y: 10, w: 20, h: 20 });
    // 画素の中心は境目から 0.5、1.5、2.5…：1〜3 に入るのは外から 2 列目と 3 列目（18×18 から 14×14 を除いた 128 画素）
    expect(ring.length).toBe(18 * 18 - 14 * 14);
    for (const [x, y] of ring) { const d = Math.min(x + 0.5 - 10, 30 - x - 0.5, y + 0.5 - 10, 30 - y - 0.5); expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(3); }
    const circ = ringPixels({ kind: 'circle', x: 20, y: 20, r: 10 });
    for (const [x, y] of circ) { const d = 10 - Math.hypot(x + 0.5 - 20, y + 0.5 - 20); expect(d >= 1 && d <= 3).toBe(true); }
    expect(circ.length).toBeGreaterThan(80);
    const ref = img(40, 40, () => hexToRgb('#3b82d6'));
    const off = img(40, 40, (x, y) => (Math.hypot(x + 0.5 - 20, y + 0.5 - 20) > 8.5 ? hexToRgb('#7fb6e8') : hexToRgb('#3b82d6')));
    expect(rimStats(ref, ref, { kind: 'circle', x: 20, y: 20, r: 10 })).toMatchObject({ max: 0, over: 0 });
    const s = rimStats(off, ref, { kind: 'circle', x: 20, y: 20, r: 10 });
    expect(s.n).toBe(circ.length);
    expect(s.max).toBeCloseTo(de00('#7fb6e8', '#3b82d6'), 6);
    expect(s.over).toBeGreaterThan(0);
    expect(s.over).toBeLessThan(1);
  });
});
