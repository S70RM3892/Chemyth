import { describe, expect, it } from 'vitest';
import {
  LUM709, NIGHT, dispHex, dot3, exposureOf, fieldAt, fromG2, hexDisp, keepOf, latticeSplit, lightMirror, mxHash, neutralCompress, nightLight,
  noiseI, openNorm, pcg2d, phaseOf, reachOf, snapOrigin, toG2, toneMirror, u01, uniformField,
  type LightLook, type LightU, type RGB, type ToneU,
} from '../src/ui/gfx/tonemath';
import { jst, skyAt, sunAt, windowHand } from '../src/ui/gfx/sky';

// ---- 検査だけで使う色の計算（sRGB の正確な式と OKLab。合成段には入れない） ----
const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const relY = (c: RGB) => 0.2126 * dec(c[0]) + 0.7152 * dec(c[1]) + 0.0722 * dec(c[2]);
const contrast = (a: RGB, b: RGB) => { const x = relY(a), y = relY(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** 直線の光（ここでは作業の空間の値をそのまま光の量とみなす）から OKLab */
function oklab(c: Readonly<RGB>): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const chroma = (c: Readonly<RGB>) => { const o = oklab(c); return Math.hypot(o[1], o[2]); };
const hueOk = (c: Readonly<RGB>) => { const o = oklab(c); return (Math.atan2(o[2], o[1]) * 180) / Math.PI; };
/** 6 角すいの色相（RGB の比だけで決まる。白へ混ぜても変わらない） */
function hueHex(c: Readonly<RGB>): number {
  const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
  if (d <= 0) return 0;
  const h = mx === c[0] ? ((c[1] - c[2]) / d + 6) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
  return h * 60;
}
const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/** 決まった並びの乱数（検査を毎回同じにする） */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const to8 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

/** 色調を中立にした値（見た目の彩度・コントラスト・色みを除いたもの） */
const NEUTRAL: ToneU = { exposure: 1, sat: 1, toneStart: 0.94, contrast: 0, shTint: [1, 1, 1], hiTint: [1, 1, 1], tint: [1, 1, 1], vig: 0, dither: 0 };
/** L11 の見た目ごとの彩度・コントラスト・肩の始まり（初期値） */
const GRADE: Record<string, { sat: number; contrast: number; toneStart: number; vig: number }> = {
  'note-light': { sat: 1.0, contrast: 0.04, toneStart: 0.94, vig: 0.04 },
  'note-dark': { sat: 1.02, contrast: 0.08, toneStart: 0.80, vig: 0.20 },
  'punk-light': { sat: 1.03, contrast: 0.10, toneStart: 0.94, vig: 0.12 },
  'punk-dark': { sat: 1.06, contrast: 0.10, toneStart: 0.80, vig: 0.20 },
  'arcane-light': { sat: 1.04, contrast: 0.08, toneStart: 0.94, vig: 0.12 },
  'arcane-dark': { sat: 1.06, contrast: 0.12, toneStart: 0.80, vig: 0.20 },
  'lab-light': { sat: 1.04, contrast: 0.10, toneStart: 0.94, vig: 0.12 },
  'lab-dark': { sat: 1.06, contrast: 0.14, toneStart: 0.80, vig: 0.20 },
};
/** 明るい見た目の紙と文字（theme.ts の地図の色。theme.ts は読みこむと画面に触るので、ここに写す） */
const PAPER: Record<LightLook, { paper: string; ink: string }> = {
  'note-light': { paper: '#f3f5ef', ink: '#1c2a48' },
  'arcane-light': { paper: '#eadfc4', ink: '#3b2a1a' },
  'punk-light': { paper: '#c9ced2', ink: '#14181d' },
  'lab-light': { paper: '#dfe6eb', ink: '#16222d' },
};
const LIGHT_LOOKS = Object.keys(NIGHT) as LightLook[];
const DAY_LIGHT: LightU = { dirCol: [0.7, 0.7, 0.7], fillCol: [0.3, 0.3, 0.3], floor: [0, 0, 0], pool: [0, 0, 0], lampDisp: [1, 1, 1], floorDisp: [1, 1, 1], shadow: 0, ao: 0, bevel: 0, lampGain: 0, bloom: 0 };

describe('ガンマ 2 の作業の空間（D2）', () => {
  it('8 ビットのどの値も、fp32 で 2 乗して平方根で戻すと元の値（256 通り）', () => {
    const f = Math.fround;
    for (let v = 0; v < 256; v++) {
      const x = f(v / 255), sq = f(x * x), back = f(Math.sqrt(f(Math.max(sq, 0))));
      expect(Math.round(f(back * 255))).toBe(v);
      expect(to8(fromG2(toG2([v / 255, v / 255, v / 255]))[0])).toBe(v);
    }
  });
  it('16 進の色との行き来と、負の値に平方根をとらない', () => {
    for (const h of ['#000000', '#ffffff', '#f3f5ef', '#b4bccc', '#ff6200', '#1c2a48']) expect(dispHex(hexDisp(h))).toBe(h);
    expect(fromG2([-1e-7, 0, 4])).toEqual([0, 0, 2]);
  });
  it('物質の印：緑 0.85 以下は 0、0.98 以上はちょうど 1、そのあいだは増える', () => {
    expect(keepOf(0)).toBe(0);
    expect(keepOf(0.85)).toBe(0);
    expect(keepOf(0.98)).toBe(1);
    expect(keepOf(1)).toBe(1);
    let p = 0;
    for (let g = 0.85; g <= 0.98; g += 0.001) { const k = keepOf(g); expect(k).toBeGreaterThanOrEqual(p); p = k; }
  });
});

describe('色を保つ肩（neutralCompress）', () => {
  it('いちばん明るい成分が始まり（0.94・0.80）より下なら、そのまま', () => {
    const r = rng(1);
    for (const start of [0.94, 0.8]) for (let i = 0; i < 1000; i++) {
      const c: RGB = [r() * start, r() * start, r() * start];
      expect(neutralCompress(c, start)).toEqual(c);
    }
  });
  it('紙 #f6f4ec（2 乗して 0.93）は通り、真っ白は 251/255 に、始まりの前後で途切れない', () => {
    const paper = hexDisp('#f6f4ec');
    expect(to8(toneMirror(NEUTRAL, toG2(paper), [0, 0, 0], 0, [0, 0], 1)[0])).toBe(0xf6);
    expect(dispHex(toneMirror(NEUTRAL, toG2(paper), [0, 0, 0], 0, [0, 0], 1))).toBe('#f6f4ec');
    expect(to8(toneMirror(NEUTRAL, [1, 1, 1], [0, 0, 0], 0, [0, 0], 1)[0])).toBe(251);
    for (const start of [0.94, 0.8]) {
      const a = neutralCompress([start - 1e-9, 0.3, 0.1], start), b = neutralCompress([start + 1e-9, 0.3, 0.1], start);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-8);
    }
  });
  it('始まりより上の 1,000 色（いちばん明るい成分 〜64）：NaN も負の値も出さず、1 を超えず、RGB の比で決まる色相と成分の順は変わらない', () => {
    const r = rng(2);
    for (const start of [0.94, 0.8]) for (let i = 0; i < 1000; i++) {
      const c: RGB = [r(), r(), r()], peak = start + r() * (64 - start), mx = Math.max(...c);
      const x = c.map((v) => (v / mx) * peak) as RGB, y = neutralCompress(x, start);
      for (const v of y) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      expect(angDiff(hueHex(x), hueHex(y))).toBeLessThan(1e-6);
      for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) if (x[a] > x[b]) expect(y[a]).toBeGreaterThanOrEqual(y[b]);
      // 明るさを下げる部分だけなら、OKLab の色相も変わらない。白へ混ぜる分は、彩度を下げる向きにだけ働く
      const k = y.reduce((a, v) => Math.max(a, v), 0) / peak;
      expect(angDiff(hueOk(x), hueOk(x.map((v) => v * k) as RGB))).toBeLessThan(1e-6);
      expect(chroma(y)).toBeLessThanOrEqual(chroma(x.map((v) => v * k) as RGB) + 1e-12);
    }
  });
  it('明るさは単調：同じ色を明るくすると、出力の明るさは下がらない', () => {
    const r = rng(3);
    for (const start of [0.94, 0.8]) for (let i = 0; i < 200; i++) {
      const c: RGB = [r(), r(), r()];
      let p = -1;
      for (let s = 0.1; s <= 64; s *= 1.05) {
        const y = dot3(neutralCompress(c.map((v) => v * s) as RGB, start), LUM709);
        expect(y).toBeGreaterThanOrEqual(p - 1e-12);
        p = y;
      }
    }
  });
});

describe('TONE（見た目の色調まで）', () => {
  it('入力 −0.1〜64 で NaN も負の値も出さない（どの見た目の値でも）', () => {
    const r = rng(4);
    for (const [, g] of Object.entries(GRADE)) for (let i = 0; i < 300; i++) {
      const col: RGB = [-0.1 + r() * 64.1, -0.1 + r() * 64.1, -0.1 + r() * 64.1];
      const out = toneMirror({ ...NEUTRAL, ...g, exposure: 1 + r() * 0.25 }, col, [0.5, 0.5, 0.5], 0, [r() - 0.5, r() - 0.5], 0.7);
      for (const v of out) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
    }
  });
  it('色調の曲線は単調：灰色と色のついた明るさの坂で、どの成分も下がらない（見た目ごと、露出 1 と 1.25）', () => {
    for (const [look, g] of Object.entries(GRADE)) for (const exposure of [1, 1.25]) for (const base of [[1, 1, 1], [1, 0.5, 0.2], [0.1, 0.4, 1], [0.9, 0.05, 0.6]] as RGB[]) {
      let p: RGB = [-1, -1, -1];
      for (let s = 0; s <= 8; s += 0.01) {
        const out = toneMirror({ ...NEUTRAL, ...g, vig: 0, exposure }, base.map((v) => v * s) as RGB, [0, 0, 0], 0, [0, 0], 1);
        for (let i = 0; i < 3; i++) expect(out[i], `${look} ${base} ${s}`).toBeGreaterThanOrEqual(p[i] - 1e-12);
        p = out;
      }
    }
  });
  it('物質はそのまま：keep = 1 なら、光・にじみ・露出・色調・夜にかかわらず、画面の中ほどで元の 8 ビットの値', () => {
    const r = rng(5);
    const rgb = (): RGB => [r(), r(), r()];
    for (let i = 0; i < 2000; i++) {
      const s8: RGB = i < 256 ? [i, i, i] : [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)];
      const s = s8.map((v) => v / 255) as RGB;
      const u: LightU = { dirCol: rgb(), fillCol: rgb(), floor: rgb(), pool: [r(), r(), 100 + r() * 900], lampDisp: rgb(), floorDisp: rgb(), shadow: r(), ao: r(), bevel: r(), lampGain: r() * 2, bloom: r() };
      const looks = Object.values(GRADE), g = looks[i % looks.length];
      const tone: ToneU = { ...NEUTRAL, ...g, exposure: 1 + r() * 0.25, shTint: [0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.2], hiTint: [0.9 + r() * 0.2, 1, 1], tint: [1, 0.95 + r() * 0.1, 1], dither: 1.5 / 255 };
      const keep = keepOf(0.98 + r() * 0.02);
      const col = lightMirror(u, s, [r(), r(), r()], keep, [r() * 1180, r() * 820], [1180, 820], { b1: rgb(), b2: rgb(), b3: rgb(), streak: rgb() });
      expect(col).toEqual(toG2(s));   // 光もにじみも乗らない
      const out = toneMirror(tone, col, s, keep, [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3], 820 / 1180, [Math.floor(r() * 2360), Math.floor(r() * 1640)]);
      expect(out.map(to8)).toEqual(s8);
      expect(out).toEqual(s);
    }
  });
  it('周辺減光は物質にもかかる（画面の中ほどでは 1、端で 1 − vig）', () => {
    const s: RGB = [0.4, 0.6, 0.8];
    expect(toneMirror({ ...NEUTRAL, vig: 0.12 }, toG2(s), s, 1, [0.1, 0.1], 1)).toEqual(s);
    const edge = toneMirror({ ...NEUTRAL, vig: 0.12 }, toG2(s), s, 1, [0.6, 0.6], 1);
    for (let i = 0; i < 3; i++) expect(edge[i]).toBeCloseTo(s[i] * 0.88, 12);
  });
  it('ディザーは暗い見た目の物質でない所だけ、±dither/2 の中', () => {
    const g: RGB = [0.25, 0.25, 0.25];
    let moved = 0;
    for (let x = 0; x < 64; x++) for (let y = 0; y < 8; y++) {
      const out = toneMirror({ ...NEUTRAL, dither: 1.5 / 255 }, toG2(g), g, 0, [0, 0], 1, [x, y]);
      expect(Math.abs(out[0] - 0.25)).toBeLessThanOrEqual(0.75 / 255 + 1e-12);
      if (out[0] !== 0.25) moved++;
      expect(toneMirror({ ...NEUTRAL, dither: 1.5 / 255 }, toG2(g), g, 1, [0, 0], 1, [x, y])).toEqual(g);
      expect(toneMirror(NEUTRAL, toG2(g), g, 0, [0, 0], 1, [x, y])[0]).toBeCloseTo(0.25, 12);
    }
    expect(moved).toBeGreaterThan(400);
  });
});

describe('昼の光のならし（L3 の CPU 側）', () => {
  it('2026-11-12 12:00、明るい見た目：開けた地面の光は明るさ 1 ± 0.005、色みは 4 割、影と日なたの割合はそのまま', () => {
    const s = sunAt(jst(2026, 11, 12, 12)), sky = skyAt(s.el);
    for (const key of [[-0.5, -0.87], [-0.71, -0.71]] as const) {
      const h = windowHand(s.el, s.az, { frame: 'window', clock: true, key, day: { len: 0.35, vis: 0.3, soft: 1 }, night: { len: 0.6, vis: 1, soft: 0.3 } });
      const dir = sky.sunCol.map((v) => v * sky.Esun * h.aS) as RGB, fill = sky.skyCol.map((v) => v * sky.Esky * 0.25) as RGB;
      const [d, f] = openNorm(dir, fill), open: RGB = [d[0] + f[0], d[1] + f[1], d[2] + f[2]], raw: RGB = [dir[0] + fill[0], dir[1] + fill[1], dir[2] + fill[2]];
      expect(Math.abs(dot3(open, LUM709) - 1)).toBeLessThanOrEqual(0.005);
      const y = dot3(raw, LUM709);
      for (let i = 0; i < 3; i++) {
        expect(open[i]).toBeCloseTo(0.6 + (0.4 * raw[i]) / y, 12);
        expect(d[i] / f[i]).toBeCloseTo(dir[i] / fill[i], 9);
      }
      // 正午の紙は、標準の紙とほぼ同じ（色みの残り 4 割の分だけ）
      const paper = hexDisp(PAPER['note-light'].paper);
      const out = toneMirror(NEUTRAL, lightMirror({ ...DAY_LIGHT, dirCol: d, fillCol: f }, paper, null, 0, [500, 400], [1180, 820]), [0, 0, 0], 0, [0, 0], 1);
      for (let i = 0; i < 3; i++) expect(Math.abs(to8(out[i]) - to8(paper[i]))).toBeLessThanOrEqual(6);
    }
  });
});

describe('夜の場 N（L7）', () => {
  const W = 1180, H = 820;
  it('届く距離は、中心からいちばん遠い角までの 0.7 倍。一様な見た目は池を持たない', () => {
    expect(reachOf(0.15, 0.10, W, H)).toBeCloseTo(0.7 * Math.hypot(0.85 * W, 0.9 * H), 9);
    expect(reachOf(0.5, 0.5, W, H)).toBeCloseTo(0.7 * Math.hypot(W / 2, H / 2), 9);
    expect(uniformField(NIGHT['punk-light'])).toBe(true);
    expect(uniformField(NIGHT['lab-light'])).toBe(true);
    expect(uniformField(NIGHT['note-light'])).toBe(false);
    expect(nightLight(NIGHT['punk-light'], 1, [0.7, 0.7, 0.7], [0.3, 0.3, 0.3], W, H).pool[2]).toBe(0);
    expect(nightLight(NIGHT['note-light'], 1, [0.7, 0.7, 0.7], [0.3, 0.3, 0.3], W, H).pool[2]).toBeCloseTo(reachOf(0.15, 0.10, W, H), 9);
  });
  it('床で、紙と文字のコントラストが 7:1 以上（標準の乗算、8 ビット）', () => {
    for (const look of LIGHT_LOOKS) {
      const n = hexDisp(NIGHT[look].floor), p = hexDisp(PAPER[look].paper), k = hexDisp(PAPER[look].ink);
      const mul = (a: RGB): RGB => a.map((v, i) => Math.round(v * 255 * n[i]) / 255) as RGB;
      expect(contrast(mul(k), mul(p)), look).toBeGreaterThanOrEqual(7);
    }
  });
  it('21:30（night = 1）の開けた紙：高い画質の LIGHT と TONE は、標準の乗算 paper·N と 1/255 以内（池の中心・届く距離・角）', () => {
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], u = nightLight(f, 1, [0.7, 0.72, 0.68], [0.3, 0.29, 0.33], W, H);
      const paper = hexDisp(PAPER[look].paper), reach = reachOf(f.x, f.y, W, H);
      const pts: [number, number][] = [[f.x * W, f.y * H], [f.x * W + reach * 0.6, f.y * H + reach * 0.8], [W, H], [0, H]];
      for (const p of pts) {
        const lu: LightU = { ...DAY_LIGHT, ...u, pool: u.pool };
        const gl = toneMirror({ ...NEUTRAL, exposure: u.exposure }, lightMirror(lu, paper, null, 0, p, [W, H]), [0, 0, 0], 0, [0, 0], 1).map(to8);
        // 標準：1/4 の大きさの 8 ビットの N の絵を、乗算で重ねる
        const n8 = fieldAt(f, 1, p[0], p[1], W, H).map(to8);
        const std = paper.map((v, i) => Math.round((Math.round(v * 255) * n8[i]) / 255));
        for (let i = 0; i < 3; i++) expect(Math.abs(gl[i] - std[i]), `${look} ${p}`).toBeLessThanOrEqual(1);
      }
    }
  });
  it('夜の影を落とす光と回りの光は、N より強い色みを持たない（21:30、OKLCh）', () => {
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], u = nightLight(f, 1, [0.75, 0.7, 0.6], [0.25, 0.3, 0.4], W, H);
      const nC = Math.min(chroma(toG2(hexDisp(f.lamp))), chroma(toG2(hexDisp(f.floor))));
      expect(chroma(u.dirCol)).toBeLessThanOrEqual(nC + 1e-9);
      expect(chroma(u.fillCol)).toBeLessThanOrEqual(nC + 1e-9);
    }
  });
  it('昼（night = 0）は昼の光のまま、床なし、露出 1。night とともに途切れずに夜へ', () => {
    const dd: RGB = [0.7, 0.72, 0.68], df: RGB = [0.3, 0.29, 0.33];
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], u0 = nightLight(f, 0, dd, df, W, H);
      expect(u0.dirCol).toEqual(dd);
      expect(u0.fillCol).toEqual(df);
      expect(u0.floor).toEqual([0, 0, 0]);
      expect(u0.pool[2]).toBe(0);
      expect(u0.exposure).toBe(1);
      expect(exposureOf(f, 1)).toBeGreaterThanOrEqual(1);
      expect(exposureOf(f, 1)).toBeLessThanOrEqual(1.25);
      // 開けた紙の表示は、night を細かく動かしても 1/255 より大きく跳ばない（池を省くしきい値 0.01 の前後も）
      const paper = hexDisp(PAPER[look].paper);
      let prev: RGB | null = null;
      for (let n = 0; n <= 1.0001; n += 0.0025) {
        const u = nightLight(f, n, dd, df, W, H);
        const out = toneMirror({ ...NEUTRAL, exposure: u.exposure }, lightMirror({ ...DAY_LIGHT, ...u }, paper, null, 0, [W * 0.4, H * 0.4], [W, H]), [0, 0, 0], 0, [0, 0], 1);
        if (prev) for (let i = 0; i < 3; i++) expect(Math.abs(out[i] - prev[i]), `${look} ${n}`).toBeLessThan(1.5 / 255);
        prev = out;
      }
    }
    expect(exposureOf(null, 1)).toBe(1);
  });
  it('影の中でも光の床より暗くならない（night·floor²/露出）', () => {
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], u = nightLight(f, 1, [0.7, 0.7, 0.7], [0.3, 0.3, 0.3], W, H);
      const lu: LightU = { ...DAY_LIGHT, ...u, shadow: 1, ao: 1 };
      const white: RGB = [1, 1, 1];
      const col = lightMirror(lu, white, [1, 1, 0], 0, [W, H], [W, H]);   // 影とくぼみがいちばん濃い所
      const fl = toG2(hexDisp(f.floor));
      for (let i = 0; i < 3; i++) expect(col[i] * u.exposure).toBeGreaterThanOrEqual(fl[i] - 1e-12);
    }
  });
});

describe('熱のゆらぎと水面の格子（L3a）', () => {
  const fr = Math.fround;
  /** シェーダーの計算を fp32 でなぞる：wp − origin を CPU で作り、f·(wp − origin) + r に整数のずれ o */
  const shader = (f: number, cam: number, off: number, v: number, t: number) => {
    const o = snapOrigin(cam), sp = latticeSplit(f, o, v, t);
    const rel = fr(fr(cam - o) + fr(off));
    return noiseI(fr(fr(fr(f) * rel) + fr(sp.r)), 0.5, sp.o, 0);
  };
  const FV: [number, number][] = [[2.08, 0.35], [3.36, -0.27], [4.8, 0.8]];   // 水面 n1・n2・泡の 1 マスあたりの格子と流れ
  it('CPU で分けた格子（fp64）は、分けない計算と同じ（世界 0 と 10⁴ マス、t ≤ 10⁶ 秒、1e-5 以内）', () => {
    for (const cam of [0, 1e4, -1e4 + 0.37]) for (const t of [0, 1, 999.9, 1e5, 1e6]) for (const [f, v] of FV) {
      const o = snapOrigin(cam), sp = latticeSplit(f, o, v, t);
      expect(Number.isInteger(sp.o)).toBe(true);
      expect(sp.r).toBeGreaterThanOrEqual(0);
      expect(sp.r).toBeLessThan(1);
      for (let k = 0; k < 50; k++) {
        const wp = cam + (k - 25) * 1.37;
        expect(Math.abs(noiseI(f * (wp - o) + sp.r, 0.5, sp.o, 0) - noiseI(f * wp + v * t, 0.5))).toBeLessThan(1e-5);
      }
    }
  });
  it('fp32 のシェーダーでも、誤差は世界の位置と時間で増えない（今の式は 10⁴ マス・10⁶ 秒で 1e-3 を超える）', () => {
    const worst = (cam: number, t: number) => {
      let w = 0, naive = 0;
      for (const [f, v] of FV) for (let k = 0; k < 400; k++) {
        const off = (k / 400 - 0.5) * 80 + 0.123, ref = noiseI(f * (cam + off) + v * t, 0.5);
        w = Math.max(w, Math.abs(shader(f, cam, off, v, t) - ref));
        naive = Math.max(naive, Math.abs(noiseI(fr(fr(fr(f) * fr(cam + off)) + fr(fr(v) * fr(t))), 0.5) - ref));
      }
      return { w, naive };
    };
    const base = worst(0, 0).w;
    for (const cam of [0, 1e4, 12345.678]) for (const t of [1, 999.9, 1e5, 1e6]) {
      const e = worst(cam, t);
      expect(e.w, `${cam} ${t}`).toBeLessThan(5e-5);
      expect(e.w).toBeLessThan(base * 4);
    }
    expect(worst(1e4, 1e6).naive).toBeGreaterThan(1e-3);
  });
  it('原点を 256 マス先へ移しても、模様は同じ（つなぎ目が出ない）', () => {
    for (const [f, v] of FV) for (const wp of [127.9, 128.1, 10000.5]) {
      const a = latticeSplit(f, 0, v, 50), b = latticeSplit(f, 256, v, 50);
      expect(Math.abs(noiseI(f * wp + a.r, 0.5, a.o, 0) - noiseI(f * (wp - 256) + b.r, 0.5, b.o, 0))).toBeLessThan(1e-9);
    }
  });
  it('位相は 2π で回り、回る前後で途切れない（t ≤ 10⁶ 秒で sin がずれない）', () => {
    for (const [f, v] of [[0.06, 1.4], [2.6 * 1.6, 0.6], [2.3 * 1.6, -0.5], [0, 1.7]]) {
      for (const origin of [0, 256 * 39]) {
        for (const t of [0, 0.5, 1e3, 1e5, 1e6]) {
          const ph = phaseOf(f, origin, v, t);
          expect(ph).toBeGreaterThanOrEqual(0);
          expect(ph).toBeLessThan(2 * Math.PI);
          expect(Math.abs(Math.sin(ph) - Math.sin(f * origin + v * t))).toBeLessThan(1e-6);
        }
        // 回る時刻のまわりを、1/60 秒きざみで
        const tw = ((Math.ceil((f * origin) / (2 * Math.PI)) + 3) * 2 * Math.PI - f * origin) / Math.abs(v || 1);
        let p = Math.sin(phaseOf(f, origin, v, tw - 0.1));
        for (let t = tw - 0.1; t <= tw + 0.1; t += 1 / 60) {
          const s = Math.sin(phaseOf(f, origin, v, t));
          expect(Math.abs(s - p)).toBeLessThanOrEqual(Math.abs(v) / 60 + 1e-9);
          p = s;
        }
      }
    }
  });
  it('ハッシュは 32 ビットの整数で決まり、値ノイズは 0〜1、格子の上ではハッシュの値', () => {
    expect(pcg2d(0, 0)).toEqual(pcg2d(0, 0));
    expect(pcg2d(1, 2)).not.toEqual(pcg2d(2, 1));
    for (const [x, y] of [[0, 0], [1, 0], [4294967295, 7], [123456, 654321]]) {
      const [a, b] = pcg2d(x, y);
      for (const h of [a, b, mxHash(x, y)]) { expect(Number.isInteger(h)).toBe(true); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(2 ** 32); }
    }
    expect(u01(0xffffffff)).toBeLessThan(1);
    expect(Math.fround(u01(0xffffffff))).toBeLessThan(1);
    const r = rng(9);
    let lo = 1, hi = 0;
    for (let i = 0; i < 5000; i++) { const n = noiseI((r() - 0.5) * 1e4, (r() - 0.5) * 1e4); lo = Math.min(lo, n); hi = Math.max(hi, n); }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.8);
    expect(noiseI(3, 5, 10, -2)).toBe(u01(pcg2d(13, (3 >>> 0))[0]));
    expect(noiseI(-1, -1)).toBe(u01(pcg2d(-1 >>> 0, -1 >>> 0)[0]));
  });
});
