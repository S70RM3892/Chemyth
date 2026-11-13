import { describe, expect, it } from 'vitest';
import {
  LUM709, NIGHT, NOISE_CALLS, PHASE_TERMS, TONE_CAPS, capTone, cellMx, cellPcg, dispHex, dot3, exposureOf, fieldAt, fieldEnds, fieldOf, fromG2, hexDisp,
  keepOf, latticeSplit, latticeUniforms, lightMirror, mix3, mxHash, neutralCompress, nightLight, noiseI, openNorm, pcg2d, phaseOf, phaseUniforms,
  reachOf, scale3, snapOrigin, toG2, toneMirror, u01, uniformField,
  type LightLook, type LightU, type RGB, type ToneU,
} from '../src/ui/gfx/tonemath';
import { FRAMES, jst, skyAt, sunAt, windowHand } from '../src/ui/gfx/sky';

// ---- 検査だけで使う色の計算（sRGB の正確な式と OKLab。合成段には入れない） ----
/** sRGB の画面の値（0〜1、1 を超えてもよい）を直線の光に */
const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const relY = (c: Readonly<RGB>) => 0.2126 * dec(c[0]) + 0.7152 * dec(c[1]) + 0.0722 * dec(c[2]);
const contrast = (a: Readonly<RGB>, b: Readonly<RGB>) => { const x = relY(a), y = relY(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** 直線の光から OKLab（Björn Ottosson、CSS Color 4 と同じ係数） */
function oklabLin(c: Readonly<RGB>): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** 画面の値（sRGB）の OKLCh の彩度と色相 */
const okDisp = (c: Readonly<RGB>) => { const o = oklabLin([dec(c[0]), dec(c[1]), dec(c[2])]); return { C: Math.hypot(o[1], o[2]), h: (Math.atan2(o[2], o[1]) * 180) / Math.PI }; };
/** 作業の空間（ガンマ 2）の値を、画面に出したときの OKLCh（sqrt で画面の値にしてから） */
const okG2 = (c: Readonly<RGB>) => okDisp(fromG2(c));
/** 値をそのまま直線の光とみなした OKLCh */
const okLin = (c: Readonly<RGB>) => { const o = oklabLin(c); return { C: Math.hypot(o[1], o[2]), h: (Math.atan2(o[2], o[1]) * 180) / Math.PI }; };
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
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** 色調を中立にした値（見た目の彩度・コントラスト・色みを除いたもの） */
const NEUTRAL: ToneU = { exposure: 1, sat: 1, toneStart: 0.94, contrast: 0, shTint: [1, 1, 1], hiTint: [1, 1, 1], tint: [1, 1, 1], vig: 0, dither: 0 };
/** L11 の見た目ごとの彩度・コントラスト・肩の始まり・周辺減光・ディザー（初期値） */
const GRADE: Record<string, { sat: number; contrast: number; toneStart: number; vig: number; dither: number }> = {
  'note-light': { sat: 1.0, contrast: 0.04, toneStart: 0.94, vig: 0.04, dither: 0 },
  'note-dark': { sat: 1.02, contrast: 0.08, toneStart: 0.80, vig: 0.20, dither: 1 / 255 },
  'punk-light': { sat: 1.03, contrast: 0.10, toneStart: 0.94, vig: 0.12, dither: 0 },
  'punk-dark': { sat: 1.06, contrast: 0.10, toneStart: 0.80, vig: 0.20, dither: 1.5 / 255 },
  'arcane-light': { sat: 1.04, contrast: 0.08, toneStart: 0.94, vig: 0.12, dither: 0 },
  'arcane-dark': { sat: 1.06, contrast: 0.12, toneStart: 0.80, vig: 0.20, dither: 1.5 / 255 },
  'lab-light': { sat: 1.04, contrast: 0.10, toneStart: 0.94, vig: 0.12, dither: 0 },
  'lab-dark': { sat: 1.06, contrast: 0.14, toneStart: 0.80, vig: 0.20, dither: 1 / 255 },
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
    expect(dispHex(toneMirror(NEUTRAL, toG2(paper), [0, 0, 0], 0, [0, 0], 1))).toBe('#f6f4ec');
    expect(to8(toneMirror(NEUTRAL, [1, 1, 1], [0, 0, 0], 0, [0, 0], 1)[0])).toBe(251);
    for (const start of [0.94, 0.8]) {
      const a = neutralCompress([start - 1e-9, 0.3, 0.1], start), b = neutralCompress([start + 1e-9, 0.3, 0.1], start);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-8);
    }
  });
  it('始まりより上の 1,000 色（0〜1 の色で、いちばん明るい成分が 0.94・0.80 より上）：OKLab の色相の変化は 2° 以下', () => {
    // 画面に出したときの OKLab の色相で比べる（彩度がほとんどない色は色相を持たないので除く）。実際の最悪は 1.0°（始まり 0.80 の青）
    for (const start of [0.94, 0.8]) {
      const r = rng(2);
      let n = 0, worst = 0;
      while (n < 1000) {
        const x: RGB = [r(), r(), r()];
        if (Math.max(...x) < start) continue;
        n++;
        const y = neutralCompress(x, start), a = okG2(x), b = okG2(y);
        if (b.C > 0.01) { const d = angDiff(a.h, b.h); worst = Math.max(worst, d); expect(d, `${x}`).toBeLessThanOrEqual(2); }
      }
      expect(worst).toBeGreaterThan(0);
    }
  });
  it('明るい光（いちばん明るい成分 〜64）の 1,000 色：NaN も負の値も出さず 1 を超えない。RGB の比の色相と成分の順はそのまま、白へ混ぜる分は彩度を下げるだけ', () => {
    // 白へ混ぜる分（g）は OKLab の色相を少し動かす（灯の芯のような、1 を大きく超える青で最大 20° ほど。彩度は下がる）。
    // 明るさを下げる分（np/peak をかける）だけなら OKLab の色相も変わらない
    const r = rng(3);
    for (const start of [0.94, 0.8]) for (let i = 0; i < 1000; i++) {
      const c: RGB = [r(), r(), r()], peak = start + r() * (64 - start), mx = Math.max(...c);
      const x = c.map((v) => (v / mx) * peak) as RGB, y = neutralCompress(x, start);
      for (const v of y) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
      expect(angDiff(hueHex(x), hueHex(y))).toBeLessThan(1e-6);
      for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) if (x[a] > x[b]) expect(y[a]).toBeGreaterThanOrEqual(y[b]);
      // ここは作業の空間の値を光の量とみなして OKLab に（かけ算が光の量のかけ算になるように）
      const d = 1 - start, np = 1 - (d * d) / (peak + d - start), scaled = x.map((v) => (v * np) / peak) as RGB;
      if (okLin(scaled).C > 0.01) expect(angDiff(okLin(x).h, okLin(scaled).h)).toBeLessThan(1e-6);
      expect(okLin(y).C).toBeLessThanOrEqual(okLin(scaled).C + 1e-9);
    }
  });
  it('明るさは単調：同じ色を明るくすると（0.1〜64 倍）、出力の明るさは下がらない', () => {
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
      const out = toneMirror({ ...NEUTRAL, ...g, exposure: 1 + r() * 0.25 }, col, [0.5, 0.5, 0.5], 0, [r() - 0.5, r() - 0.5], 0.7, [i, i * 7]);
      for (const v of out) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
    }
  });
  it('色調の曲線は単調：灰色と色のついた明るさの坂で、どの成分も下がらない（見た目ごと、露出 1 と 1.25）', () => {
    for (const [look, g] of Object.entries(GRADE)) for (const exposure of [1, 1.25]) for (const base of [[1, 1, 1], [1, 0.5, 0.2], [0.1, 0.4, 1], [0.9, 0.05, 0.6]] as RGB[]) {
      let p: RGB = [-1, -1, -1];
      for (let s = 0; s <= 8; s += 0.01) {
        const out = toneMirror({ ...NEUTRAL, ...g, vig: 0, dither: 0, exposure }, base.map((v) => v * s) as RGB, [0, 0, 0], 0, [0, 0], 1);
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
      // 画面の中ほど（|c|·1.7 < 0.35）は周辺減光がかからない
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
  it('ディザーは物質でない所だけ、±dither/2 の中で、画素ごとに動かない', () => {
    const g: RGB = [0.25, 0.25, 0.25];
    let moved = 0;
    for (let x = 0; x < 64; x++) for (let y = 0; y < 8; y++) {
      const out = toneMirror({ ...NEUTRAL, dither: 1.5 / 255 }, toG2(g), g, 0, [0, 0], 1, [x, y]);
      expect(Math.abs(out[0] - 0.25)).toBeLessThanOrEqual(0.75 / 255 + 1e-12);
      expect(toneMirror({ ...NEUTRAL, dither: 1.5 / 255 }, toG2(g), g, 0, [0, 0], 1, [x, y])).toEqual(out);
      if (out[0] !== 0.25) moved++;
      expect(toneMirror({ ...NEUTRAL, dither: 1.5 / 255 }, toG2(g), g, 1, [0, 0], 1, [x, y])).toEqual(g);
      expect(toneMirror(NEUTRAL, toG2(g), g, 0, [0, 0], 1, [x, y])[0]).toBeCloseTo(0.25, 12);
    }
    expect(moved).toBeGreaterThan(400);
  });
  it('決まり：周辺減光は明るい見た目 0.12・暗い見た目 0.20 まで、ディザーは暗い見た目だけ 1.5/255 まで、露出は 1〜1.25（L11 の初期値はみな中）', () => {
    expect(TONE_CAPS.light).toEqual({ vig: 0.12, dither: 0, toneStart: 0.94 });
    expect(TONE_CAPS.dark).toEqual({ vig: 0.20, dither: 1.5 / 255, toneStart: 0.80 });
    const wild: ToneU = { ...NEUTRAL, vig: 0.5, dither: 4 / 255, exposure: 2 };
    expect(capTone(wild, false)).toEqual({ ...wild, vig: 0.12, dither: 0, exposure: 1.25 });
    expect(capTone(wild, true)).toEqual({ ...wild, vig: 0.20, dither: 1.5 / 255, exposure: 1.25 });
    expect(capTone({ ...NEUTRAL, vig: -1, dither: -1, exposure: 0.5 }, true)).toEqual({ ...NEUTRAL, vig: 0, dither: 0, exposure: 1 });
    for (const [look, g] of Object.entries(GRADE)) {
      const dark = look.endsWith('-dark'), u = { ...NEUTRAL, ...g };
      expect(capTone(u, dark), look).toEqual(u);
      expect(g.toneStart).toBe(dark ? TONE_CAPS.dark.toneStart : TONE_CAPS.light.toneStart);
    }
    for (const look of LIGHT_LOOKS) for (const n of [0, 0.5, 1]) {
      const e = exposureOf(NIGHT[look], n);
      expect(e).toBeGreaterThanOrEqual(TONE_CAPS.exposure[0]);
      expect(e).toBeLessThanOrEqual(TONE_CAPS.exposure[1]);
    }
  });
});

describe('昼の光のならし（L3 の CPU 側）', () => {
  it('2026-11-12 12:00、明るい見た目：開けた地面の光は明るさ 1 ± 0.005、色みは 4 割、影と日なたの割合はそのまま', () => {
    const s = sunAt(jst(2026, 11, 12, 12)), sky = skyAt(s.el);
    for (const look of ['note-light', 'arcane-light'] as const) {
      const h = windowHand(s.el, s.az, FRAMES[look]);
      const dir = sky.sunCol.map((v) => v * sky.Esun * h.aS) as RGB, fill = sky.skyCol.map((v) => v * sky.Esky * 0.25) as RGB;
      const [d, f] = openNorm(dir, fill), open: RGB = [d[0] + f[0], d[1] + f[1], d[2] + f[2]], raw: RGB = [dir[0] + fill[0], dir[1] + fill[1], dir[2] + fill[2]];
      expect(Math.abs(dot3(open, LUM709) - 1)).toBeLessThanOrEqual(0.005);
      const y = dot3(raw, LUM709);
      for (let i = 0; i < 3; i++) {
        expect(open[i]).toBeCloseTo(0.6 + (0.4 * raw[i]) / y, 12);
        expect(d[i] / f[i]).toBeCloseTo(dir[i] / fill[i], 9);
      }
      // 正午の紙は、標準の紙とほぼ同じ（色みの残り 4 割の分だけ）
      const paper = hexDisp(PAPER[look].paper);
      const out = toneMirror(NEUTRAL, lightMirror({ ...DAY_LIGHT, dirCol: d, fillCol: f }, paper, null, 0, [500, 400], [1180, 820]), [0, 0, 0], 0, [0, 0], 1);
      for (let i = 0; i < 3; i++) expect(Math.abs(to8(out[i]) - to8(paper[i]))).toBeLessThanOrEqual(6);
    }
  });
  it('色のない光ではならしても色のないまま、明るさだけ 1 に', () => {
    const [d, f] = openNorm([0.2, 0.2, 0.2], [0.3, 0.3, 0.3]);
    for (let i = 0; i < 3; i++) { expect(d[i]).toBeCloseTo(0.4, 12); expect(f[i]).toBeCloseTo(0.6, 12); }
  });
});

describe('夜の場 N（L7）', () => {
  const W = 1180, H = 820;
  it('届く距離は、中心からいちばん遠い角までの 0.7 倍。一様な見た目は池を持たない。暗い見た目は夜の場を持たない', () => {
    expect(reachOf(0.15, 0.10, W, H)).toBeCloseTo(0.7 * Math.hypot(0.85 * W, 0.9 * H), 9);
    expect(reachOf(0.5, 0.5, W, H)).toBeCloseTo(0.7 * Math.hypot(W / 2, H / 2), 9);
    expect(uniformField(NIGHT['punk-light'])).toBe(true);
    expect(uniformField(NIGHT['lab-light'])).toBe(true);
    expect(uniformField(NIGHT['note-light'])).toBe(false);
    expect(uniformField(NIGHT['arcane-light'])).toBe(false);
    expect(nightLight(NIGHT['punk-light'], 1, [0.7, 0.7, 0.7], [0.3, 0.3, 0.3], W, H).pool[2]).toBe(0);
    expect(nightLight(NIGHT['note-light'], 1, [0.7, 0.7, 0.7], [0.3, 0.3, 0.3], W, H).pool[2]).toBeCloseTo(reachOf(0.15, 0.10, W, H), 9);
    expect(fieldOf('note-light', W, H)).toEqual({ lamp: '#ffeedd', floor: '#b4bccc', x: 0.15, y: 0.10, reach: reachOf(0.15, 0.10, W, H) });
    expect(fieldOf('arcane-light', W, H)).toEqual({ lamp: '#fff6ea', floor: '#c8ccd6', x: 0.10, y: 0.20, reach: reachOf(0.10, 0.20, W, H) });
    expect(fieldOf('punk-light', W, H)).toMatchObject({ lamp: '#c8ccd6', floor: '#c8ccd6' });
    expect(fieldOf('lab-light', W, H)).toMatchObject({ lamp: '#d2d8e2', floor: '#d2d8e2' });
    for (const look of ['note-dark', 'punk-dark', 'arcane-dark', 'lab-dark']) expect(fieldOf(look, W, H)).toBeNull();
  });
  it('両端の色を直線に混ぜたものが、どの画素の N_eff とも同じ（標準 は放射状のグラデーション 1 つで描ける）', () => {
    for (const look of LIGHT_LOOKS) for (const n of [0, 0.3, 1]) {
      const f = NIGHT[look], e = fieldEnds(f, n), reach = reachOf(f.x, f.y, W, H);
      for (const k of [0, 0.25, 0.5, 0.99, 1, 1.4]) {
        const p = fieldAt(f, n, f.x * W + reach * k * 0.6, f.y * H + reach * k * 0.8, W, H);
        const want = uniformField(f) ? e.floor : mix3(e.lamp, e.floor, Math.min(1, k));
        for (let i = 0; i < 3; i++) expect(p[i]).toBeCloseTo(want[i], 12);
      }
      if (n === 0) expect([e.lamp, e.floor]).toEqual([[1, 1, 1], [1, 1, 1]]);
    }
  });
  it('床で、紙と文字のコントラストが 7:1 以上（ノート 7.84・魔術 7.37・工場 7.48・研究所 9.54、標準 の乗算、8 ビットでも 7 以上）', () => {
    const want: Record<LightLook, number> = { 'note-light': 7.84, 'arcane-light': 7.37, 'punk-light': 7.48, 'lab-light': 9.54 };
    for (const look of LIGHT_LOOKS) {
      const n = hexDisp(NIGHT[look].floor), p = hexDisp(PAPER[look].paper), k = hexDisp(PAPER[look].ink);
      const mulF = (a: RGB): RGB => a.map((v, i) => v * n[i]) as RGB;
      const mul8 = (a: RGB): RGB => a.map((v, i) => Math.round(v * 255 * n[i]) / 255) as RGB;
      expect(contrast(mulF(k), mulF(p)), look).toBeCloseTo(want[look], 2);
      expect(contrast(mul8(k), mul8(p)), look).toBeGreaterThanOrEqual(7);
    }
  });
  it('池は灯りに見える：画面を 3×3 に分けた紙の明るさ（直線の Y）の、いちばん明るい区画と暗い区画の比はノート 1.61・魔術 1.45（関門 e の 1.4 より上）', () => {
    const want: Partial<Record<LightLook, number>> = { 'note-light': 1.61, 'arcane-light': 1.45 };
    for (const look of ['note-light', 'arcane-light'] as const) {
      const f = NIGHT[look], P = hexDisp(PAPER[look].paper), I = hexDisp(PAPER[look].ink);
      const cells: number[][] = Array.from({ length: 9 }, () => []);
      let worst = 99;
      for (let y = 0; y < H; y += 10) for (let x = 0; x < W; x += 10) {
        const n = fieldAt(f, 1, x, y, W, H), px = P.map((v, i) => v * n[i]) as RGB;
        cells[Math.min(2, Math.floor((y * 3) / H)) * 3 + Math.min(2, Math.floor((x * 3) / W))].push(relY(px));
        worst = Math.min(worst, contrast(I.map((v, i) => v * n[i]) as RGB, px));
      }
      const med = cells.map(median);
      expect(Math.max(...med) / Math.min(...med), look).toBeCloseTo(want[look]!, 2);
      expect(Math.max(...med) / Math.min(...med)).toBeGreaterThan(1.4);
      expect(worst).toBeGreaterThanOrEqual(7);
    }
  });
  it('21:30（night = 1）の開けた紙：高い画質の LIGHT と TONE は、標準の乗算 paper·N と 1/255 以内（池の中心・届く距離・角）', () => {
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], u = nightLight(f, 1, [0.7, 0.72, 0.68], [0.3, 0.29, 0.33], W, H);
      const paper = hexDisp(PAPER[look].paper), reach = reachOf(f.x, f.y, W, H);
      const pts: [number, number][] = [[f.x * W, f.y * H], [f.x * W + reach * 0.6, f.y * H + reach * 0.8], [W, H], [0, H]];
      for (const p of pts) {
        const gl = toneMirror({ ...NEUTRAL, exposure: u.exposure }, lightMirror({ ...DAY_LIGHT, ...u }, paper, null, 0, p, [W, H]), [0, 0, 0], 0, [0, 0], 1).map(to8);
        // 標準：1/4 の大きさの 8 ビットの N の絵を、乗算で重ねる
        const n8 = fieldAt(f, 1, p[0], p[1], W, H).map(to8);
        const std = paper.map((v, i) => Math.round((Math.round(v * 255) * n8[i]) / 255));
        for (let i = 0; i < 3; i++) expect(Math.abs(gl[i] - std[i]), `${look} ${p}`).toBeLessThanOrEqual(1);
      }
    }
  });
  it('夕方のあいだも（night 0〜1）、色のない昼の光なら、高い画質の開けた紙は 標準 の乗算と 1/255 以内', () => {
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], paper = hexDisp(PAPER[look].paper), reach = reachOf(f.x, f.y, W, H);
      for (let n = 0; n <= 1.0001; n += 0.02) {
        const u = nightLight(f, n, [0.6, 0.6, 0.6], [0.4, 0.4, 0.4], W, H);
        for (const p of [[f.x * W, f.y * H], [f.x * W + reach * 0.3, f.y * H + reach * 0.4], [W, H]] as [number, number][]) {
          const gl = toneMirror({ ...NEUTRAL, exposure: u.exposure }, lightMirror({ ...DAY_LIGHT, ...u }, paper, null, 0, p, [W, H]), [0, 0, 0], 0, [0, 0], 1).map(to8);
          const n8 = fieldAt(f, n, p[0], p[1], W, H).map(to8);
          const std = paper.map((v, i) => Math.round((Math.round(v * 255) * n8[i]) / 255));
          for (let i = 0; i < 3; i++) expect(Math.abs(gl[i] - std[i]), `${look} ${n.toFixed(2)} ${p}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('夜の影を落とす光と回りの光は、N より強い色みを持たない（21:30、画面の値の OKLCh）', () => {
    for (const look of LIGHT_LOOKS) {
      const f = NIGHT[look], u = nightLight(f, 1, [0.75, 0.7, 0.6], [0.25, 0.3, 0.4], W, H);
      // 露出をかけ、割合で割った光を画面の値にしたもの（開けた地面に乗る色）
      const key = fromG2(scale3(u.dirCol, u.exposure / f.keyShare)), fill = fromG2(scale3(u.fillCol, u.exposure / (1 - f.keyShare)));
      const nC = Math.min(okDisp(hexDisp(f.lamp)).C, okDisp(hexDisp(f.floor)).C);
      expect(okDisp(key).C).toBeLessThanOrEqual(nC + 1e-9);
      expect(okDisp(fill).C).toBeLessThanOrEqual(nC + 1e-9);
      if (uniformField(f)) for (let i = 0; i < 3; i++) { expect(key[i]).toBeCloseTo(hexDisp(f.floor)[i], 12); expect(fill[i]).toBeCloseTo(hexDisp(f.floor)[i], 12); }
      else for (let i = 0; i < 3; i++) { expect(key[i]).toBeCloseTo(1, 12); expect(fill[i]).toBeCloseTo(1, 12); }
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
      expect(exposureOf(f, 1)).toBe(f.exposure);
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
    for (const look of LIGHT_LOOKS) for (const n of [0.5, 1]) {
      const f = NIGHT[look], u = nightLight(f, n, [0.7, 0.7, 0.7], [0.3, 0.3, 0.3], W, H);
      const col = lightMirror({ ...DAY_LIGHT, ...u, shadow: 1, ao: 1 }, [1, 1, 1], [1, 1, 0], 0, [W, H], [W, H]);   // 影とくぼみがいちばん濃い所
      const fl = toG2(hexDisp(f.floor));
      for (let i = 0; i < 3; i++) expect(col[i] * u.exposure).toBeGreaterThanOrEqual(n * fl[i] - 1e-12);
    }
  });
});

describe('熱のゆらぎと水面の格子（L3a）', () => {
  const fr = Math.fround;
  /** 分けない計算（fp64）：f·wp + v·t + c */
  const whole = (k: (typeof NOISE_CALLS)[number], wx: number, wy: number, t: number) =>
    noiseI(k.f * wx + k.v[0] * t + (k.c?.[0] ?? 0), k.f * wy + k.v[1] * t + (k.c?.[1] ?? 0));
  it('今の FS_FINAL の 7 つのノイズと 5 つの位相（熱のゆらぎ 2・水面 2・泡・光の粒 2、さざ波 2・光の網 2・泡）', () => {
    expect(NOISE_CALLS.map((k) => k.id)).toEqual(['haze1', 'haze2', 'water1', 'water2', 'foam', 'glint1', 'glint2']);
    expect(NOISE_CALLS.filter((k) => k.world).map((k) => k.id)).toEqual(['water1', 'water2', 'foam']);
    expect(PHASE_TERMS.map((p) => p.id)).toEqual(['ripple1', 'ripple2', 'caustic1', 'caustic2', 'foam']);
    expect(NOISE_CALLS.length * 2).toBeLessThanOrEqual(16);   // ivec4 uNCell[4]
    expect(PHASE_TERMS.length).toBeLessThanOrEqual(8);        // vec4 uPhase[2]
  });
  it('CPU で分けた格子（fp64）は、分けない計算と同じ（世界 0 と 10⁴ マス、t ≤ 10⁶ 秒、1e-5 以内）', () => {
    for (const [cx, cy] of [[0, 0], [1e4, 1e4], [-1e4 + 0.37, 5e3 + 0.81]]) for (const t of [0, 1, 999.9, 1000.1, 1e5, 1e6]) {
      const U = latticeUniforms(cx, cy, t);
      expect(U.origin).toEqual([snapOrigin(cx), snapOrigin(cy)]);
      NOISE_CALLS.forEach((k, i) => {
        const o: [number, number] = [U.cell[2 * i], U.cell[2 * i + 1]], r: [number, number] = [U.frac[2 * i], U.frac[2 * i + 1]];
        for (const v of r) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        for (let j = 0; j < 40; j++) {
          // 画面に貼りつく模様は画素の位置、地図に貼りつく模様は地図の位置
          const dx = (j - 20) * 3.7 + 0.13, dy = (j % 7) * 5.3 - 11;
          const [wx, wy] = k.world ? [cx + dx, cy + dy] : [600 + dx * 20, 400 + dy * 20];
          const rel = k.world ? [U.camRel[0] + dx, U.camRel[1] + dy] : [wx, wy];
          // fp64 の端数（uNFrac は fp32 に丸めて渡すので、ここでは分け方そのものを見る）
          const s0 = latticeSplit(k.f, k.world ? U.origin[0] : 0, k.v[0], t, k.c?.[0] ?? 0), s1 = latticeSplit(k.f, k.world ? U.origin[1] : 0, k.v[1], t, k.c?.[1] ?? 0);
          expect([s0.o | 0, s1.o | 0]).toEqual(o);
          const split = noiseI(k.f * rel[0] + s0.r, k.f * rel[1] + s1.r, o[0], o[1]);
          expect(Math.abs(split - whole(k, wx, wy, t)), `${k.id} ${cx} ${t}`).toBeLessThan(1e-5);
        }
      });
    }
  });
  it('fp32 のシェーダーでも、誤差は世界の位置と時間で増えない（今の式は 10⁴ マス・10⁶ 秒で 1e-3 を超える）', () => {
    const worst = (cam: number, t: number) => {
      let w = 0, naive = 0;
      const U = latticeUniforms(cam, cam, t);
      NOISE_CALLS.forEach((k, i) => {
        if (!k.world) return;
        for (let j = 0; j < 400; j++) {
          const off = (j / 400 - 0.5) * 80 + 0.123, ref = whole(k, cam + off, cam, t);
          // シェーダー：wp − origin は (カメラ − 原点) と画面の中のずれの和、それに f をかけて端数を足す（すべて fp32）
          const rx = fr(fr(fr(k.f) * fr(fr(U.camRel[0]) + fr(off))) + U.frac[2 * i]), ry = fr(fr(fr(k.f) * fr(U.camRel[1])) + U.frac[2 * i + 1]);
          w = Math.max(w, Math.abs(noiseI(rx, ry, U.cell[2 * i], U.cell[2 * i + 1]) - ref));
          const nx = fr(fr(fr(k.f) * fr(cam + off)) + fr(fr(k.v[0]) * fr(t))), ny = fr(fr(fr(k.f) * fr(cam)) + fr(fr(k.v[1]) * fr(t)));
          naive = Math.max(naive, Math.abs(noiseI(nx, ny) - ref));
        }
      });
      return { w, naive };
    };
    // 誤差は原点のまわり 256 マスの中の位置だけで決まる（fp32 の f·(wp − origin) の丸め）。同じ「カメラ − 原点」なら、どこでもいつでも同じくらい
    const rel = 57.678;
    const at0 = worst(rel, 1).w;
    for (const cam of [rel, rel + 256 * 39, rel + 256 * 1000]) for (const t of [1, 999.9, 1e5, 1e6]) {
      const e = worst(cam, t);
      expect(e.w, `${cam} ${t}`).toBeLessThan(1.5e-4);
      expect(e.w, `${cam} ${t}`).toBeLessThan(at0 * 3 + 2e-5);
    }
    for (const cam of [0, 1e4, 12345.678]) expect(worst(cam, 1e6).w).toBeLessThan(1.5e-4);
    expect(worst(1e4, 1e6).naive).toBeGreaterThan(1e-3);
  });
  it('原点を 256 マス先へ移しても、模様は同じ（つなぎ目が出ない）。整数のずれは 32 ビットで回っても同じ模様', () => {
    for (const k of NOISE_CALLS) for (const wp of [127.9, 128.1, 10000.5]) {
      const a = latticeSplit(k.f, 0, k.v[0], 50), b = latticeSplit(k.f, 256, k.v[0], 50);
      expect(Math.abs(noiseI(k.f * wp + a.r, 0.5, a.o, 0) - noiseI(k.f * (wp - 256) + b.r, 0.5, b.o, 0))).toBeLessThan(1e-9);
    }
    expect(noiseI(0.3, 0.6, 5 + 2 ** 32, -7 - 2 ** 32)).toBe(noiseI(0.3, 0.6, 5, -7));
    const far = latticeUniforms(0, 0, 3e9);   // 格子の数が 32 ビットを超える時刻
    expect(far.cell[1]).toBe(Math.floor(-2.2 * 3e9) | 0);
  });
  it('位相は 2π で回り、回る前後で途切れない（t ≤ 10⁶ 秒で sin がずれない）', () => {
    const TAU = 2 * Math.PI;
    for (const p of PHASE_TERMS) for (const origin of [0, 256 * 39]) {
      const o = p.world ? origin : 0;
      for (const t of [0, 0.5, 1e3, 1e5, 1e6]) {
        const ph = phaseOf(p.f, o, p.v, t);
        expect(ph).toBeGreaterThanOrEqual(0);
        expect(ph).toBeLessThan(TAU);
        expect(Math.abs(Math.sin(ph) - Math.sin(p.f * o + p.v * t))).toBeLessThan(1e-6);
      }
      // 回る時刻のまわりを、1/60 秒きざみで
      const tw = ((Math.ceil((p.f * o) / TAU) + 3) * TAU - p.f * o) / Math.abs(p.v);
      let prev = Math.sin(phaseOf(p.f, o, p.v, tw - 0.1));
      for (let t = tw - 0.1; t <= tw + 0.1; t += 1 / 60) {
        const s = Math.sin(phaseOf(p.f, o, p.v, t));
        expect(Math.abs(s - prev)).toBeLessThanOrEqual(Math.abs(p.v) / 60 + 1e-9);
        prev = s;
      }
    }
    const U = latticeUniforms(1e4 + 3, -2e3, 777.7), ph = phaseUniforms(U.origin, 777.7);
    expect(ph.length).toBe(8);
    PHASE_TERMS.forEach((p, i) => expect(ph[i]).toBe(Math.fround(phaseOf(p.f, p.world ? U.origin[p.axis] : 0, p.v, 777.7))));
    expect([ph[5], ph[6], ph[7]]).toEqual([0, 0, 0]);
  });
  it('ハッシュは GLSL の 32 ビットの符号なし整数と同じ（BigInt で別に計算して比べる）。値ノイズは 0〜1、格子の上ではハッシュの値', () => {
    const M = (1n << 32n) - 1n;
    const pcgBig = (x: number, y: number): [number, number] => {
      let vx = (BigInt(x) * 1664525n + 1013904223n) & M, vy = (BigInt(y) * 1664525n + 1013904223n) & M;
      vx = (vx + vy * 1664525n) & M; vy = (vy + vx * 1664525n) & M;
      vx ^= vx >> 16n; vy ^= vy >> 16n;
      vx = (vx + vy * 1664525n) & M; vy = (vy + vx * 1664525n) & M;
      vx ^= vx >> 16n; vy ^= vy >> 16n;
      return [Number(vx), Number(vy)];
    };
    const mxBig = (x: number, y: number) => {
      let h = ((BigInt(x) * 0x8da6b343n) & M) ^ ((BigInt(y) * 0xd8163841n) & M);
      h ^= h >> 16n; h = (h * 0x7feb352dn) & M; h ^= h >> 15n;
      return Number(h);
    };
    const r = rng(9);
    for (let i = 0; i < 500; i++) {
      const x = i < 4 ? [0, 1, 4294967295, 2147483648][i] : Math.floor(r() * 4294967296), y = Math.floor(r() * 4294967296);
      expect(pcg2d(x, y)).toEqual(pcgBig(x, y));
      expect(mxHash(x, y)).toBe(mxBig(x, y));
    }
    expect(u01(0xffffffff)).toBeLessThan(1);
    expect(Math.fround(u01(0xffffffff))).toBeLessThan(1);
    for (const cell of [cellMx, cellPcg]) {
      let lo = 1, hi = 0, sum = 0;
      for (let i = 0; i < 5000; i++) { const n = noiseI((r() - 0.5) * 1e4, (r() - 0.5) * 1e4, 0, 0, cell); lo = Math.min(lo, n); hi = Math.max(hi, n); sum += n; }
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThan(1);
      expect(hi - lo).toBeGreaterThan(0.8);
      expect(Math.abs(sum / 5000 - 0.5)).toBeLessThan(0.05);
    }
    expect(noiseI(3, 5, 10, -2)).toBe(cellMx(13, 3));
    expect(noiseI(3, 5, 10, -2, cellPcg)).toBe(u01(pcg2d(13, 3)[0]));
    expect(noiseI(-1, -1)).toBe(u01(mxHash(-1 >>> 0, -1 >>> 0)));
  });
});
