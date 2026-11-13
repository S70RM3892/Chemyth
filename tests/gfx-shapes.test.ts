import { describe, expect, it } from 'vitest';
import {
  AO_FLOOR, AO_STEP, ART, CLEAR, CLS, HEIGHT, KIND, LIFT, SHADOW_STEPS, STRIDE,
  aoMaxFor, beltShape, crossShape, fragShape, guardOf, hubShape, machineShape, newShapes, packKC, pushShape, railShape, rasterShapes,
  sdCapsule, sdDisc, sdOctagon, sdRoundRect, sdShape, shadeAt, shadeUniforms, shapeView, sh0Uniforms, texelWorld, trainShape, unpackKC, waterShape,
  type BeltState, type RGBA, type ShapeBuf, type ShapeLight, type Skin,
} from '../src/ui/gfx/sdf';
import { FS_SH0, FS_SH1, SH0_ATTR, SH0_BYTES, SH0_UNIFORMS, SH1_UNIFORMS, VS_SH0, VS_SH1 } from '../src/ui/gfx/shapes.glsl';
import { MACHINES } from '../src/content/machines';

const SKINS: Skin[] = ['note', 'punk', 'arcane', 'lab'];
/** 決まった並びの乱数（検査を毎回同じにする） */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const deg = (a: number) => (a * 180) / Math.PI;
const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ---- 検査だけで使う、細かく刻んだ輪郭からの距離（形の関数とは別の作り方） ----
type Pt = [number, number];
/** 角丸の長方形（中心 0、半分の幅と高さ、丸み）の輪郭を n 点で */
function outlineRoundRect(bx: number, by: number, r: number, n: number): Pt[] {
  r = Math.min(r, bx, by);
  const pts: Pt[] = [], k = Math.ceil(n / 8);
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= k; i++) { const a = a0 + (i / k) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  const line = (x0: number, y0: number, x1: number, y1: number) => { for (let i = 0; i <= k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k]); };
  corner(bx - r, by - r, 0); line(bx - r, by, -bx + r, by); corner(-bx + r, by - r, Math.PI / 2); line(-bx, by - r, -bx, -by + r);
  corner(-bx + r, -by + r, Math.PI); line(-bx + r, -by, bx - r, -by); corner(bx - r, -by + r, -Math.PI / 2); line(bx, -by + r, bx, by - r);
  return pts;
}
function outlinePoly(v: Pt[], n: number): Pt[] {
  const pts: Pt[] = [], k = Math.ceil(n / v.length);
  for (let s = 0; s < v.length; s++) { const a = v[s], b = v[(s + 1) % v.length]; for (let i = 0; i < k; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]); }
  return pts;
}
const octVerts = (bx: number, by: number, c: number): Pt[] => [[bx - c, by], [-bx + c, by], [-bx, by - c], [-bx, -by + c], [-bx + c, -by], [bx - c, -by], [bx, -by + c], [bx, by - c]];
function outlineCapsule(ax: number, ay: number, r: number, n: number): Pt[] {
  const L = Math.hypot(ax, ay), ux = ax / L, uy = ay / L, nx = -uy, ny = ux, pts: Pt[] = [], k = Math.ceil(n / 4);
  for (let i = 0; i <= k; i++) { const a = -Math.PI / 2 + (i / k) * Math.PI, c = Math.cos(a), s = Math.sin(a); pts.push([ax + (ux * c + nx * s) * r, ay + (uy * c + ny * s) * r]); }
  for (let i = 0; i <= k; i++) { const a = Math.PI / 2 + (i / k) * Math.PI, c = Math.cos(a), s = Math.sin(a); pts.push([(ux * c + nx * s) * r, (uy * c + ny * s) * r]); }
  return pts;
}
/** 輪郭の点の並び（閉じた多角形）からの符号つき距離：近い点までの距離と、中か外か（偶奇の規則） */
function polyDist(pts: Pt[], x: number, y: number): number {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i], ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -d : d;
}

// ---- 形の層を CPU の見本で作って、世界の点で SH1 を読む ----
interface Scene {
  v: ReturnType<typeof shapeView>; T: Float32Array; b: ShapeBuf;
  at(wx: number, wy: number): RGBA; tShape(wx: number, wy: number): RGBA;
  /** いちばん近い形（水を除く）までの距離（マス） */
  dist(wx: number, wy: number): number;
}
function scene(fill: (b: ShapeBuf, w: ShapeBuf) => void, L: ShapeLight, o: { cam?: [number, number]; size?: number; z?: number; aoMax?: number } = {}): Scene {
  const z = o.z ?? 44, cw = o.size ?? 264, ch = o.size ?? 264, [cx, cy] = o.cam ?? [0, 0];
  const v = shapeView(cw, ch, z, L.len, cx, cy), b = newShapes(16), w = newShapes(4);
  fill(b, w);
  const T = rasterShapes(b, w, v), U = shadeUniforms(v, L, { aoMax: o.aoMax });
  const uv = (wx: number, wy: number): [number, number] => [((wx - cx) * z + cw / 2) / cw, 1 - ((wy - cy) * z + ch / 2) / ch];
  return {
    v, T, b,
    dist: (wx, wy) => { let d = Infinity; for (let i = 0; i < b.n; i++) d = Math.min(d, sdShape(b.a, i, wx, wy)); return d; },
    at: (wx, wy) => { const [u, vv] = uv(wx, wy); return shadeAt(T, v.W, v.H, U, u, vv); },
    tShape: (wx, wy) => { const i = Math.round((wx - cx) / v.aa + v.W / 2 - 0.5), j = Math.round((cy - wy) / v.aa + v.H / 2 - 0.5), k = (j * v.W + i) * 4; return [T[k], T[k + 1], T[k + 2], T[k + 3]]; },
  };
}
/** D1 の窓の光の向き（2026-11-12）と、真上の光 */
const DIRS: [string, [number, number]][] = [['08:00', [-0.82, -0.58]], ['12:00', [0.1, -0.99]], ['15:00', [0.77, -0.64]], ['16:00', [0.87, -0.49]], ['真上', [0, -1]]];
const hard = (dir: [number, number], len = 1.2): ShapeLight => ({ dir, len, soft: 0, vis: 1 });
/** 1 マスの装置（文具の台）を、中心 (0, 0) に */
const card = (b: ShapeBuf, skin: Skin = 'note', x = -0.5, y = -0.5) => machineShape(b, skin, 'separator', x, y, 1);
/** 格子の点で、条件にあう点を集める */
function grid(r: number, step: number, f: (x: number, y: number) => boolean): Pt[] {
  const out: Pt[] = [];
  for (let y = -r; y <= r + 1e-9; y += step) for (let x = -r; x <= r + 1e-9; x += step) if (f(x, y)) out.push([x, y]);
  return out;
}

describe('形の記録', () => {
  it('種類と層は 1 つの数に詰めて、Float32 に入れても元にもどる', () => {
    const a = new Float32Array(1);
    for (let kind = 0; kind <= 4; kind++) for (let cls = 0; cls <= 6; cls++) {
      a[0] = packKC(kind, cls);
      expect(unpackKC(a[0])).toEqual({ kind, cls });
    }
    expect(Object.values(KIND)).toEqual([0, 1, 2, 3, 4]);
    // 層は MAX で重ねたとき上の面が残る順
    expect([CLS.water, CLS.ground, CLS.belt, CLS.rail, CLS.machine, CLS.hub, CLS.train]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('並びは 8 つずつで、足りなくなると 2 倍に広がり、入れた値はそのまま', () => {
    const b = newShapes(256), lens: number[] = [];
    for (let i = 0; i < 5000; i++) {
      pushShape(b, i, i + 1, i + 2, i + 3, 0.44, KIND.rect, CLS.machine, 0.12, i % 2 ? LIFT : 0);
      if (lens[lens.length - 1] !== b.a.length) lens.push(b.a.length);
    }
    expect(b.n).toBe(5000);
    expect(lens).toEqual([256, 512, 1024, 2048, 4096, 8192].map((n) => n * STRIDE));
    for (const i of [0, 255, 256, 4095, 4999]) {
      const o = i * STRIDE;
      expect(Array.from(b.a.subarray(o, o + 4))).toEqual([i, i + 1, i + 2, i + 3]);
      expect(b.a[o + 4]).toBeCloseTo(0.44, 6);
      expect(unpackKC(b.a[o + 5])).toEqual({ kind: KIND.rect, cls: CLS.machine });
      expect(b.a[o + 7]).toBeCloseTo(i % 2 ? LIFT : 0, 6);
    }
    // 4,096 個で 128 KB（GPU の側も同じ大きさ）
    expect(4096 * STRIDE * 4).toBe(128 * 1024);
    expect(SH0_BYTES).toBe(STRIDE * 4);
  });
  it('画面の外の帯は min(3, 影の長さ·0.95) マス·z/2（切り上げ）で、形の層はその分大きい', () => {
    expect(guardOf(1.6, 44)).toBe(Math.ceil(1.52 * 22));
    expect(guardOf(2.5, 44)).toBe(Math.ceil(2.375 * 22));
    expect(guardOf(10, 44)).toBe(66);
    expect(guardOf(0.25, 30)).toBe(Math.ceil(0.2375 * 15));
    expect(guardOf(0, 44)).toBe(0);
    expect(guardOf(-1, 44)).toBe(0);
    const v = shapeView(1180, 820, 44, 1.6, 12.3, -4.5);
    expect([v.W, v.H, v.g]).toEqual([590 + 2 * 34, 410 + 2 * 34, 34]);
    // tShape の中心が画面の中心、1 画素は 2/z マス
    expect(texelWorld(v, v.W / 2 - 0.5, v.H / 2 - 0.5)).toEqual([12.3, -4.5]);
    expect(texelWorld(v, 0, 0)[0]).toBeCloseTo(12.3 - (v.W / 2 - 0.5) * (2 / 44), 9);
    // 帯の幅は、高さ 0.95 の物の影がちょうど届く長さ
    expect(v.g * v.aa).toBeGreaterThanOrEqual(1.6 * 0.95 - 1e-9);
  });
});

describe('形の距離', () => {
  const cases: { name: string; sd: (x: number, y: number) => number; ref: Pt[]; box: number }[] = [
    { name: '角丸の長方形', sd: (x, y) => sdRoundRect(x, y, 0.42, 0.42, 0.12), ref: outlineRoundRect(0.42, 0.42, 0.12, 4000), box: 0.8 },
    { name: '細長い角丸', sd: (x, y) => sdRoundRect(x, y, 0.475, 0.23, 0.08), ref: outlineRoundRect(0.475, 0.23, 0.08, 4000), box: 0.8 },
    { name: '円', sd: (x, y) => sdDisc(x, y, 0.84), ref: outlineRoundRect(0.84, 0.84, 0.84, 4000), box: 1.3 },
    { name: 'カプセル（斜め）', sd: (x, y) => sdCapsule(x, y, 0.375, -0.375, 0.3), ref: outlineCapsule(0.375, -0.375, 0.3, 4000), box: 1 },
    { name: 'カプセル（横）', sd: (x, y) => sdCapsule(x, y, 1, 0, 0.1), ref: outlineCapsule(1, 0, 0.1, 4000), box: 1.3 },
    { name: '八角形（工業の 1 マス）', sd: (x, y) => sdOctagon(x, y, 0.46, 0.46, 0.14), ref: outlinePoly(octVerts(0.46, 0.46, 0.14), 4000), box: 0.9 },
    { name: '八角形（納品所）', sd: (x, y) => sdOctagon(x, y, 1.94, 1.94, 0.3), ref: outlinePoly(octVerts(1.94, 1.94, 0.3), 8000), box: 2.6 },
    { name: '八角形（横長）', sd: (x, y) => sdOctagon(x, y, 0.9, 0.4, 0.25), ref: outlinePoly(octVerts(0.9, 0.4, 0.25), 6000), box: 1.3 },
  ];
  for (const c of cases) it(`${c.name}：細かく刻んだ輪郭からの距離と 0.01 マス以内（中が負）`, () => {
    const r = rng(7);
    let worst = 0;
    for (let k = 0; k < 500; k++) {
      // 縁の近く（ぼかしの 1 画素が効く所）を多めに
      const x = (r() * 2 - 1) * c.box, y = (r() * 2 - 1) * c.box, want = polyDist(c.ref, x, y);
      worst = Math.max(worst, Math.abs(c.sd(x, y) - want));
    }
    expect(worst).toBeLessThanOrEqual(0.01);
  });
  it('記録から測る距離は形の関数と同じ（カプセルは軸の両端、円とドームは短い辺の半分が半径）', () => {
    const b = newShapes(4);
    pushShape(b, 2, 3, 2.75, 2.25, 0.24, KIND.capsule, CLS.belt, 0.3);
    pushShape(b, 1, 1, 3, 3, 0.62, KIND.dome, CLS.machine);
    pushShape(b, -1, -0.5, 1, 0.5, 0.44, KIND.oct, CLS.machine, 0.2);
    pushShape(b, 5, 5, 5.9, 5.6, 0.5, KIND.rect, CLS.train, 0.08);
    const r = rng(3);
    for (let k = 0; k < 200; k++) {
      const x = r() * 8 - 2, y = r() * 8 - 2;
      // 記録は Float32 なので 1e-6 まで
      expect(sdShape(b.a, 0, x, y)).toBeCloseTo(sdCapsule(x - 2, y - 3, 0.75, -0.75, 0.3), 5);
      expect(sdShape(b.a, 1, x, y)).toBeCloseTo(sdDisc(x - 2, y - 2, 1), 5);
      expect(sdShape(b.a, 2, x, y)).toBeCloseTo(sdOctagon(x, y, 1, 0.5, 0.2), 5);
      expect(sdShape(b.a, 3, x, y)).toBeCloseTo(sdRoundRect(x - 5.45, y - 5.3, 0.45, 0.3, 0.08), 5);
    }
  });
  it('丸みや面取りが短い辺の半分より大きくても、長さ 0 のカプセルでも、NaN にならない', () => {
    for (const [x, y] of [[0, 0], [0.3, 0.1], [2, -1]] as Pt[]) {
      expect(Number.isFinite(sdRoundRect(x, y, 0.2, 0.5, 3))).toBe(true);
      expect(Number.isFinite(sdOctagon(x, y, 0.2, 0.5, 3))).toBe(true);
      expect(Number.isFinite(sdCapsule(x, y, 0, 0, 0.3))).toBe(true);
    }
    // 丸みが大きすぎるときは短い辺の半分（両端が丸い形）
    for (const y of [0, 0.5, 0.7, -0.9]) expect(sdRoundRect(0.1, y, 0.2, 0.5, 3)).toBeCloseTo(sdCapsule(0.1, y + 0.3, 0, 0.6, 0.2), 9);
  });
});

describe('今の絵と同じ形', () => {
  /** 形の中心から向き (ux, uy) へ、距離が 0 になる所までの長さ（二分法） */
  const reach = (b: ShapeBuf, i: number, cx: number, cy: number, ux: number, uy: number) => {
    let lo = 0, hi = 3;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (sdShape(b.a, i, cx + ux * m, cy + uy * m) < 0) lo = m; else hi = m; }
    return lo;
  };
  const kinds = Object.keys(MACHINES).filter((k) => k !== 'belt' && k !== 'bridge' && k !== 'tunnel');
  it('MACHINES のどの装置も、4 つのスキンと 2 つの大きさで 1 つの形になり、マスに収まり、絵の寸法と 1 % 以内', () => {
    expect(kinds.length).toBeGreaterThanOrEqual(15);
    for (const skin of SKINS) for (const kind of kinds) for (const sz of [1, 2]) {
      const b = newShapes(2), x = 10, y = 20, cx = x + sz / 2, cy = y + sz / 2;
      machineShape(b, skin, kind, x, y, sz);
      expect(b.n).toBe(1);
      const a = b.a, { kind: k, cls } = unpackKC(a[5]);
      expect(cls).toBe(CLS.machine);
      // マスの中に収まり、中心はマスの中心
      expect(Math.min(a[0], a[2])).toBeGreaterThanOrEqual(x); expect(Math.max(a[0], a[2])).toBeLessThanOrEqual(x + sz);
      expect(Math.min(a[1], a[3])).toBeGreaterThanOrEqual(y); expect(Math.max(a[1], a[3])).toBeLessThanOrEqual(y + sz);
      expect(sdShape(a, 0, cx, cy)).toBeLessThan(0);
      // 高さ：タンクは低い、2×2 は 0.62、1×1 は 0.44
      expect(a[4]).toBeCloseTo(kind === 'tank' ? HEIGHT.tank : sz === 2 ? HEIGHT.big : HEIGHT.small, 6);
      const side = reach(b, 0, cx, cy, 1, 0), diag = reach(b, 0, cx, cy, Math.SQRT1_2, Math.SQRT1_2), up = reach(b, 0, cx, cy, 0, -1);
      const near = (got: number, want: number) => expect(Math.abs(got / want - 1)).toBeLessThanOrEqual(0.01);
      near(up, side);
      if (skin === 'punk') {
        // 八角形：半分の幅 0.46·sz、斜めは面取りの線 x + y = 2a − c まで
        const A = ART.punk.a * sz, C = ART.punk.c * sz;
        expect(k).toBe(KIND.oct);
        near(side, A); near(diag, ((2 * A - C) / 2) * Math.SQRT2);
      } else if (skin === 'lab' && kind === 'reactor') {
        // 研究所の反応器：殻の半分の幅を半径とするドーム（どの向きも同じ）
        expect(k).toBe(KIND.dome);
        near(side, ART.dome * sz); near(diag, ART.dome * sz);
      } else {
        // 角丸の四角：半分の幅 0.42·sz、斜めは角の丸みの円まで
        const s = skin === 'lab' ? ART.shell : ART.card, A = (s.size * sz) / 2, R = s.r * sz;
        expect(k).toBe(KIND.rect);
        near(side, A); near(diag, (A - R) * Math.SQRT2 + R);
      }
    }
  });
  it('研究所の殻と文具の台は同じ外形（0.84、丸み 0.12）、反応器のドームは殻の幅いっぱい', () => {
    expect(ART.shell).toEqual(ART.card);
    expect(ART.dome * 2).toBeCloseTo(ART.shell.size, 9);
  });
  it('ベルト：まっすぐなら 1 本、曲がるなら 2 本のカプセル。絵の曲線から 0.05 マス以内、太さは絵と同じ', () => {
    const states: BeltState[] = ['solid', 'liquid', 'gas', 'none'];
    for (const skin of SKINS) for (const st of states) {
      const r = ART.belt[skin][st] / 2;
      const straight = newShapes(2);
      beltShape(straight, skin, st, 4, 7, -0.5, 0, 0.5, 0);
      expect(straight.n).toBe(1);
      expect(sdShape(straight.a, 0, 4.5, 7.5)).toBeCloseTo(-r, 6);
      expect(sdShape(straight.a, 0, 4.5, 7.5 + r)).toBeCloseTo(0, 6);
      expect(straight.a[4]).toBeCloseTo(HEIGHT.belt, 6);
      expect(unpackKC(straight.a[5])).toEqual({ kind: KIND.capsule, cls: CLS.belt });
      // 左から入って下へ出る曲がり角：中心を制御点とする 2 次曲線の上の点は、どれも縁から r ± 0.05 の深さ
      const bend = newShapes(2), a = [-0.5, 0], e = [0, 0.5];
      beltShape(bend, skin, st, 4, 7, a[0], a[1], e[0], e[1]);
      expect(bend.n).toBe(2);
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const q = 1 - p, x = 4.5 + q * q * a[0] + p * p * e[0], y = 7.5 + q * q * a[1] + p * p * e[1];
        const d = Math.min(sdShape(bend.a, 0, x, y), sdShape(bend.a, 1, x, y));
        expect(Math.abs(d + r)).toBeLessThanOrEqual(0.05);
      }
    }
    // 魔術の気体の管は文具より太く、工業の固体のベルトがいちばん太い（今の絵のまま）
    expect(ART.belt.arcane.gas).toBeGreaterThan(ART.belt.note.gas);
    expect(Math.max(...SKINS.map((s) => ART.belt[s].solid))).toBe(ART.belt.punk.solid);
  });
  it('橋・トンネル・納品所・線路・列車・水も、今の絵と高さの層の寸法', () => {
    const b = newShapes(8);
    crossShape(b, false, 3, 3); crossShape(b, true, 5, 3);
    expect(b.a[2] - b.a[0]).toBeCloseTo(0.76, 6); expect(b.a[4]).toBeCloseTo(HEIGHT.bridge, 6);
    expect(b.a[STRIDE + 2] - b.a[STRIDE]).toBeCloseTo(0.74, 6); expect(b.a[STRIDE + 4]).toBeCloseTo(HEIGHT.tunnel, 6);
    for (const skin of SKINS) {
      const h = newShapes(1);
      hubShape(h, skin, 30, 40, 4);
      const { kind } = unpackKC(h.a[5]);
      expect([h.a[0], h.a[1], h.a[2], h.a[3]].map((v) => +v.toFixed(5))).toEqual([30.06, 40.06, 33.94, 43.94]);
      expect(h.a[4]).toBeCloseTo(HEIGHT.hub, 6);
      // hub() は面取り 0.3 マスの八角形、hubLab() は丸み 0.42 マスの角丸の四角
      if (skin === 'lab') { expect(kind).toBe(KIND.rect); expect(h.a[6]).toBeCloseTo(0.42, 6); } else { expect(kind).toBe(KIND.oct); expect(h.a[6]).toBeCloseTo(0.3, 6); }
    }
    const r = newShapes(1); railShape(r, 3.5, 4.5, 4.5, 4.5);
    expect(sdShape(r.a, 0, 4, 4.5)).toBeCloseTo(-ART.rail / 2, 6);
    expect(r.a[7]).toBeCloseTo(LIFT, 6); expect(unpackKC(r.a[5]).cls).toBe(CLS.rail);
    // 列車は進む向きに長く、縦の線路では向きを変える
    for (const [ang, w, h] of [[0, 0.95, 0.46], [Math.PI, 0.95, 0.46], [Math.PI / 2, 0.46, 0.95], [-Math.PI / 2, 0.46, 0.95]] as const) {
      const t = newShapes(1); trainShape(t, 8, 9, ang);
      expect(t.a[2] - t.a[0]).toBeCloseTo(w, 5); expect(t.a[3] - t.a[1]).toBeCloseTo(h, 5);
      expect((t.a[0] + t.a[2]) / 2).toBeCloseTo(8, 6); expect(t.a[7]).toBeCloseTo(LIFT, 6); expect(t.a[4]).toBeCloseTo(HEIGHT.train, 6);
    }
    const w = newShapes(1); waterShape(w, 2, 6, 9);
    expect([w.a[0], w.a[1], w.a[2], w.a[3], w.a[4]]).toEqual([2, 9, 6, 10, 0]);
  });
});

describe('SH0：形を塗る', () => {
  const L = hard([0, -1], 0.6);
  it('地面で消し、水は混ぜずに 0、形は MAX で重なり、上の面の層が残る', () => {
    const s = scene((b, w) => {
      waterShape(w, -3, 0, 1);
      machineShape(b, 'note', 'separator', -0.5, 0.5, 1);             // 水の上の装置
      beltShape(b, 'note', 'solid', 1, -2, 0, -0.5, 0, 0.5);           // ベルトの上に装置
      machineShape(b, 'note', 'separator', 1, -2, 1);
      railShape(b, -2, -1.5, 2, -1.5); trainShape(b, -1.5, -1.5, 0);   // 線路の上の列車
    }, L);
    const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(1 / 255 + 1e-6);
    // 地面
    const g = s.tShape(-2.5, 2.5); near(g[0], CLEAR[0]); near(g[1], CLS.ground / 16); near(g[3], CLEAR[3]);
    // 水
    const wt = s.tShape(-2.5, 1.5); expect(wt).toEqual([0, 0, 0, 0]);
    // 水の上の装置は装置
    const m = s.tShape(0, 1); near(m[0], 0.44); near(m[1], CLS.machine / 16); near(m[3], 0.44);
    // ベルトの上の装置：高いほう、装置の層
    const bm = s.tShape(1.5, -1.5); near(bm[0], 0.44); near(bm[1], CLS.machine / 16);
    // 線路の上の列車：列車の層、浮きはどちらも 0.3、床から積み上がった物は地面のまま
    const tr = s.tShape(-1.5, -1.5); near(tr[0], HEIGHT.train); near(tr[1], CLS.train / 16); near(tr[2], LIFT); near(tr[3], CLEAR[3]);
    const rl = s.tShape(-0.6, -1.5); near(rl[0], HEIGHT.rail); near(rl[1], CLS.rail / 16); near(rl[2], LIFT); near(rl[3], CLEAR[3]);
  });
  it('縁のぼかしは 1 画素ほど、ドームは中心で h、半径の半分で h·√0.75', () => {
    const v = shapeView(200, 200, 40, 0, 0, 0), b = newShapes(2);
    pushShape(b, -1, -1, 1, 1, 0.62, KIND.dome, CLS.machine);
    pushShape(b, 2, -0.5, 3, 0.5, 0.44, KIND.rect, CLS.machine, 0.12);
    const f = (i: number, x: number, y: number) => fragShape(b.a, i, x, y, v.aa);
    expect(f(0, 0, 0)![0]).toBeCloseTo(0.62, 6);
    expect(f(0, 0.5, 0)![0]).toBeCloseTo(0.62 * Math.sqrt(0.75), 6);
    expect(f(0, 0, 0)![3]).toBeCloseTo(0.62, 6);
    // 四角の左の縁 x = 2 をはさんで、0 から h まで 1 画素（0.05 マス）で上がる
    const ramp = [-0.03, -0.0125, 0, 0.0125, 0.03].map((dx) => f(1, 2 + dx, 0)?.[0] ?? 0);
    expect(ramp[0]).toBe(0); expect(ramp[2]).toBeCloseTo(0.22, 6); expect(ramp[4]).toBeCloseTo(0.44, 6);
    for (let k = 1; k < ramp.length; k++) expect(ramp[k]).toBeGreaterThanOrEqual(ramp[k - 1]);
    // 層は半分より多く覆う画素だけ
    expect(f(1, 1.99, 0)![1]).toBe(0); expect(f(1, 2.01, 0)![1]).toBeCloseTo(CLS.machine / 16, 9);
    // 浮いた物は A（床から積み上がった物）に書かない
    const r = newShapes(1); railShape(r, 0, 0, 1, 0);
    const fr = fragShape(r.a, 0, 0.5, 0, v.aa)!;
    [HEIGHT.rail, CLS.rail / 16, LIFT, 0].forEach((want, c) => expect(fr[c]).toBeCloseTo(want, 6));
  });
  it('水のひと続きは、縦にならべても継ぎ目に地面が残らない', () => {
    const s = scene((_, w) => { for (let y = -2; y < 2; y++) waterShape(w, -2, 2, y); }, L, { z: 37 });
    for (let y = -1.95; y < 1.95; y += 0.013) expect(s.tShape(0.3, y)[0]).toBe(0);
  });
});

describe('SH1：影', () => {
  /** 影（0.5 より濃い）のついた地面の点の重心と数 */
  function shadowCentroid(s: Scene, r = 2.2, step = 0.04) {
    const pts = grid(r, step, (x, y) => { const q = s.at(x, y); return q[3] === 0 && q[0] > 0.5; });
    return { n: pts.length, x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length };
  }
  for (const [name, dir] of DIRS) it(`影は光と反対の向きにのびる（${name}、重心の向きが 5° 以内）`, () => {
    for (const skin of SKINS) {
      const s = scene((b) => card(b, skin), hard(dir));
      const c = shadowCentroid(s);
      expect(c.n).toBeGreaterThan(20);
      expect(angDiff(deg(Math.atan2(c.y, c.x)), deg(Math.atan2(-dir[1], -dir[0])))).toBeLessThanOrEqual(5);
      // 光の側の地面（縁から 0.05〜0.6 マス）には影がなく、陰りは 3 歩（0.18 マス）とぼかしの 2 画素より先にはない
      let seen = 0;
      for (let d = 0.3; d <= 1.3; d += 0.02) {
        const x = dir[0] * d, y = dir[1] * d, e = s.dist(x, y);
        if (e < 0.05 || e > 0.6) continue;
        seen++;
        const q = s.at(x, y);
        expect(q[0]).toBe(0);
        if (e >= 3 * AO_STEP + 2 * s.v.aa) expect(q[1]).toBe(0);
      }
      expect(seen).toBeGreaterThan(10);
    }
  });
  it('影の長さは高さの差 × len（12 歩の 1 歩と 1 画素の内）。接地点ではくっきり', () => {
    for (const len of [0.6, 1.2, 2.0]) {
      const s = scene((b) => card(b), hard([0, -1], len));
      // 真上からの光：影は下へ。装置の下の縁は y = 0.42
      let end = 0.42;
      for (let y = 0.42; y < 0.42 + len; y += 0.005) if (s.at(0, y)[0] > 0.5) end = y;
      const dh = Math.round(0.44 * 255) / 255 - Math.round(0.1 * 255) / 255;
      expect(Math.abs(end - 0.42 - dh * len)).toBeLessThanOrEqual(len / SHADOW_STEPS + 2 * s.v.aa);
      // 縁のすぐ外（1 画素先）はもう濃い影
      expect(s.at(0, 0.42 + 2 * s.v.aa)[0]).toBeGreaterThan(0.9);
    }
  });
  it('天面は、もっと高い物からだけ影をうける', () => {
    const dir: [number, number] = [-1, 0];
    // 光の側に納品所（0.95）があれば装置の天面に影、ベルト（0.24）なら影なし
    const tall = scene((b) => { card(b); hubShape(b, 'note', -2.6, -1, 2); }, hard(dir, 1.5));
    const low = scene((b) => { card(b); beltShape(b, 'note', 'solid', -1.5, -0.5, 0, -0.5, 0, 0.5); }, hard(dir, 1.5));
    expect(tall.at(-0.25, 0)[3]).toBe(1);
    expect(tall.at(-0.25, 0)[0]).toBeGreaterThan(0.9);
    expect(low.at(-0.25, 0)[0]).toBe(0);
    expect(low.at(0, 0)[0]).toBe(0);
  });
  /** 形どおりの影：地面の点から光の向きへ細かく歩き、光の線が形の高さより下を通れば影 */
  function exactShadow(height: (x: number, y: number) => number, dir: [number, number], len: number, x: number, y: number) {
    const n = Math.hypot(dir[0], dir[1]), ux = dir[0] / n, uy = dir[1] / n;
    // 光の線が、いちばん高い装置（2×2 の 0.62）より上に出たら、もう何にもかからない
    for (let k = 1; k <= 600 && HEIGHT.ground + k / 600 < HEIGHT.big; k++) { const t = k / 600; if (HEIGHT.ground + t < height(x + ux * t * len, y + uy * t * len)) return true; }
    return false;
  }
  /**
   * SH1 の影（0.5 より濃い）と形どおりの影の、重なりの割合と、食いちがう点から形どおりの影の縁までのいちばん遠い距離。
   * 縁は、となりあう格子の点で形どおりの影かどうかが変わる所（その 2 点の中点）
   */
  function compare(s: Scene, height: (x: number, y: number) => number, dir: [number, number], len: number, r: number, step: number) {
    const n = Math.round((2 * r) / step) + 1, X = (i: number) => -r + i * step, E: boolean[] = [], A: (boolean | null)[] = [], edge: Pt[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X(i), y = X(j);
      E.push(exactShadow(height, dir, len, x, y));
      A.push(s.dist(x, y) > 0.05 ? s.at(x, y)[0] > 0.5 : null);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (i + 1 < n && E[j * n + i] !== E[j * n + i + 1]) edge.push([X(i) + step / 2, X(j)]);
      if (j + 1 < n && E[j * n + i] !== E[(j + 1) * n + i]) edge.push([X(i), X(j) + step / 2]);
    }
    let both = 0, either = 0, worst = 0;
    for (let k = 0; k < n * n; k++) {
      const a = A[k], e = E[k];
      if (a === null) continue;
      if (a && e) both++;
      if (a || e) either++;
      if (a !== e) { const x = X(k % n), y = X(Math.floor(k / n)); worst = Math.max(worst, Math.min(...edge.map((q) => Math.hypot(q[0] - x, q[1] - y)))); }
    }
    return { iou: both / either, worst, n: either };
  }
  for (const [name, dir] of DIRS) it(`丸い物は丸い影：研究所の反応器のドームの影は形どおりの影と 90 % 以上重なり、縁のずれは 3 画素以内（${name}）`, () => {
    const len = 2, R = ART.dome * 2;
    const s = scene((b) => machineShape(b, 'lab', 'reactor', -1, -1, 2), hard(dir, len), { size: 320 });
    const dome = (x: number, y: number) => { const q = Math.hypot(x, y) / R; return q < 1 ? HEIGHT.big * Math.sqrt(1 - q * q) : 0; };
    const c = compare(s, dome, dir, len, 2.6, 0.04);
    expect(c.n).toBeGreaterThan(150);
    expect(c.iou).toBeGreaterThanOrEqual(0.9);
    expect(c.worst).toBeLessThanOrEqual(3 * s.v.aa);
  });
  it('角丸の台の影は形どおりの影とほぼ重なり、ずれは影の先の 1 歩（len/12）と 2 画素以内', () => {
    for (const [, dir] of DIRS) for (const len of [0.6, 1.2]) {
      const s = scene((b) => card(b), hard(dir, len));
      const top = (x: number, y: number) => (sdRoundRect(x, y, 0.42, 0.42, 0.12) < 0 ? 0.44 : 0);
      const c = compare(s, top, dir, len, 1.4, 0.035);
      // 細い影ほど、縁の 1 画素のずれで重なりの割合は下がる（ずれそのものは小さい）
      expect(c.iou).toBeGreaterThanOrEqual(len < 1 ? 0.55 : 0.75);
      expect(c.worst).toBeLessThanOrEqual(len / SHADOW_STEPS + 2 * s.v.aa);
    }
  });
  it('浮いた線路の影は離れて落ち、下を低い光がくぐる。装置の上を通る線路は、装置の影に穴をあけない', () => {
    const len = 1.2, L = hard([0, -1], len);
    const s = scene((b) => railShape(b, -3, 0, 3, 0), L);
    // 光の線は 0.3〜0.36 の高さで線路にかかる：t = 0.2〜0.26、線路の中心から len·t 下
    expect(s.at(0, ART.rail / 2 + 0.03)[0]).toBe(0);
    expect(s.at(0, 0.3)[0]).toBeGreaterThan(0.9);
    expect(s.at(0, 0.6)[0]).toBe(0);
    // 線路を床から立つ壁（浮きなし）にすると、縁からすぐ影になる
    const wall = scene((b) => pushShape(b, -3, 0, 3, 0, HEIGHT.rail, KIND.capsule, CLS.rail, ART.rail / 2), L);
    expect(wall.at(0, ART.rail / 2 + 0.03)[0]).toBeGreaterThan(0.9);
    // 装置の上を線路が通っても、装置の影は変わらない
    const solo = scene((b) => card(b), L), over = scene((b) => { card(b); railShape(b, -3, 0, 3, 0); }, L);
    for (let y = 0.45; y < 1; y += 0.02) expect(Math.abs(over.at(0, y)[0] - solo.at(0, y)[0])).toBeLessThanOrEqual(0.02);
  });
  it('柔らかい光では、高い物の長い影ほど先のぼけが広い（接地点でくっきり）', () => {
    const len = 1.2, L: ShapeLight = { dir: [0, -1], len, soft: 1, vis: 1 };
    /** 真上からの光で、下の縁 y0 から下へ、影が 0.9 から 0.1 に落ちるまでの幅 */
    const ramp = (s: Scene, y0: number) => {
      let a = NaN, b = NaN;
      for (let y = y0; y < y0 + 2.5; y += 0.005) { const v = s.at(0, y)[0]; if (isNaN(a) && v < 0.9) a = y; if (isNaN(b) && v < 0.1) b = y; }
      return { start: a - y0, width: b - a };
    };
    const low = ramp(scene((b) => card(b), L, { size: 360 }), 0.42);
    const high = ramp(scene((b) => machineShape(b, 'note', 'reactor', -1, -1, 2), L, { size: 360 }), 0.84);
    expect(high.width).toBeGreaterThan(low.width * 1.2);
    // 接地点（縁から 1 画素）ではどちらも濃い
    expect(low.start).toBeGreaterThan(0.05);
    expect(high.start).toBeGreaterThan(low.start);
  });
  it('影の濃さは vis、日なたは 0（夜の光や窓の空の光でも、影は形の向きのまま）', () => {
    const s = scene((b) => card(b), { dir: [0, -1], len: 0.6, soft: 0, vis: 0.3 });
    expect(s.at(0, 0.5)[0]).toBeCloseTo(0.3, 6);
    expect(s.at(0, -0.6)[0]).toBe(0);
    expect(s.at(0, 0)[0]).toBe(0);
  });
});

describe('SH1：くぼみの陰り（灰色の輪がない）', () => {
  const L = hard([0, -1], 0.6);
  it('陰りは自分より高い物のそばの地面と水だけ：天面・低い物のそば・離れた地面では 0', () => {
    const s = scene((b, w) => { card(b); hubShape(b, 'note', 1.2, -2, 2); waterShape(w, -3, -1, 2); }, hard([0, -1], 0.6));
    // 天面（装置・納品所）
    for (const [x, y] of [[0, 0], [0.3, -0.35], [2.2, -1], [1.6, -1.5]] as Pt[]) expect(s.at(x, y)[1]).toBe(0);
    // 装置の右の縁のすぐ外の地面は陰る。0.2 マスより離れると 0
    expect(s.at(0.42 + 0.03, 0)[1]).toBeGreaterThan(0.3);
    for (let d = 3 * AO_STEP + 2 * s.v.aa; d < 0.75; d += 0.01) expect(s.at(0.42 + d, -0.1)[1]).toBe(0);
    // 水は岸（0.1 高い地面）のそばだけ少し陰る。岸から離れれば 0
    expect(s.at(-2, 2.04)[1]).toBeGreaterThan(0);
    expect(s.at(-2, 2.5)[1]).toBe(0);
    // 地面は、低い水のそばでは陰らない
    expect(s.at(-2, 1.96)[1]).toBe(0);
  });
  it('どの装置のまわりも、0.2〜0.5 マス離れた地面には陰りがなく、光の側は開けた地面と同じ', () => {
    for (const skin of SKINS) for (const kind of ['reactor', 'separator']) {
      const s = scene((b) => { machineShape(b, skin, kind, -1, -1, 2); card(b, skin, 1.5, -0.5); }, L, { size: 360 });
      let seen = 0;
      for (const [x, y] of grid(2.4, 0.03, (x, y) => { const e = s.dist(x, y); return e >= 0.2 && e <= 0.5; })) {
        seen++;
        const q = s.at(x, y);
        // 3 歩（0.18 マス）とぼかしの 2 画素より先には届かない
        if (s.dist(x, y) >= 3 * AO_STEP + 2 * s.v.aa) expect(q[1]).toBe(0);
        // 陰りが残っても、いちばん強い見た目（0.12）で 0.95 より暗くならない
        expect(1 - q[1] * 0.12).toBeGreaterThanOrEqual(0.95);
        // 光の側（真上からの光なので、形より上）には影がない
        if (y < -1) expect(q[0]).toBe(0);
      }
      expect(seen).toBeGreaterThan(500);
      // 2×2 の天面に陰りはない（平均 0.02 未満どころか 0）
      for (const [x, y] of grid(0.6, 0.05, (x, y) => s.dist(x, y) < -0.1)) expect(s.at(x, y)[1]).toBe(0);
    }
  });
  it('浮いた線路のそばの地面は陰らない（線路のまわりに輪が出ない）', () => {
    const s = scene((b) => railShape(b, -3, 0, 3, 0), L);
    for (let y = -0.4; y <= 0.4; y += 0.01) if (Math.abs(y) > ART.rail / 2 + 0.05) expect(s.at(0.3, y)[1]).toBe(0);
  });
  it('いちばん暗い陰りでも、開けた地面の 0.92（明るい見た目）・0.85（暗い見た目）より暗くならない', () => {
    for (const [uAO, dark] of [[0.06, false], [0.08, false], [0.2, false], [0.12, true], [0.3, true]] as [number, boolean][]) {
      // 2 つの納品所のあいだの細い谷（いちばん陰る所）
      const s = scene((b) => { hubShape(b, 'note', -2.1, -1, 2); hubShape(b, 'note', 0.06, -1, 2); }, L, { aoMax: aoMaxFor(uAO, dark) });
      let worst = 0;
      for (let y = -0.8; y <= 0.8; y += 0.1) for (let x = -0.1; x <= 0.1; x += 0.01) worst = Math.max(worst, s.at(x, y)[1]);
      expect(worst).toBeGreaterThan(0);
      expect(1 - worst * uAO).toBeGreaterThanOrEqual(AO_FLOOR[dark ? 'dark' : 'light'] - 1e-9);
    }
    expect(aoMaxFor(0, false)).toBe(1);
  });
  it('陰りの届く距離は 3 歩（AO_STEP × 3 = 0.18 マス）', () => {
    expect(AO_STEP * 3).toBeCloseTo(0.18, 9);
  });
});

describe('SH1：面の傾き', () => {
  it('平らな所は 0.5、光の側の縁は明るく、反対の縁は暗い。地面の側にはつかない', () => {
    const s = scene((b) => card(b), hard([-1, 0], 1));
    expect(s.at(0, 0)[2]).toBe(0.5);
    expect(s.at(-0.4, 0)[2]).toBeGreaterThan(0.85);
    expect(s.at(0.4, 0)[2]).toBeLessThan(0.15);
    // 上下の縁は光の向きに直角なので平ら
    expect(s.at(0, -0.4)[2]).toBeCloseTo(0.5, 6);
    // 地面の側（縁の外）は 0.5
    for (const x of [-0.46, -0.5, 0.46, 0.5]) expect(s.at(x, 0)[2]).toBe(0.5);
    // 遠くの開けた地面
    expect(s.at(-1.5, 1.5)).toEqual([0, 0, 0.5, 0]);
  });
  it('ドームは光の側が明るく、なめらかに暗くなる', () => {
    const s = scene((b) => machineShape(b, 'lab', 'reactor', -1, -1, 2), hard([-1, 0], 0.6));
    const xs = [-0.7, -0.5, 0, 0.5, 0.7].map((x) => s.at(x, 0)[2]);
    expect(xs[0]).toBeGreaterThan(0.5); expect(xs[2]).toBeCloseTo(0.5, 2); expect(xs[4]).toBeLessThan(0.5);
    expect(xs[0]).toBeGreaterThan(xs[1]); expect(xs[3]).toBeGreaterThan(xs[4]);
  });
});

describe('シェーダーの文字列', () => {
  const ALL = { VS_SH0, FS_SH0, VS_SH1, FS_SH1 };
  it('どれも highp float と highp int を宣言し、pow・exp・log・sin・cos（sin の乱数）を使わない', () => {
    for (const src of Object.values(ALL)) {
      expect(src.startsWith('#version 300 es\n')).toBe(true);
      expect(src).toContain('precision highp float;');
      expect(src).toContain('precision highp int;');
      expect(src).not.toMatch(/\b(pow|exp|exp2|log|log2|sin|cos|tan)\s*\(/);
      expect(src).not.toMatch(/uTime/);
    }
  });
  it('sqrt の中は必ず max(…, 0.0)、0 で割らない（長さ 0 の線分）', () => {
    for (const src of Object.values(ALL)) for (const m of src.matchAll(/sqrt\(/g)) expect(src.slice(m.index! + 5, m.index! + 9)).toBe('max(');
    expect(FS_SH0).toContain('max(dot(ba, ba), 1e-12)');
  });
  it('SH1 は影 12 歩・陰り 4 方向 × 3 歩、読みこみは 25、どれも textureLod(…, 0.0)', () => {
    expect(FS_SH1.match(/textureLod\(uShape, vM\d\.(xy|zw), 0\.0\)/g)).toHaveLength(12);
    expect(FS_SH1.match(/HA\(vec2\(/g)).toHaveLength(12);
    expect(FS_SH1.match(/textureLod\(uShape, vS, 0\.0\)/g)).toHaveLength(1);
    expect(FS_SH1.match(/textureLod\(/g)).toHaveLength(14);           // 中心 1 + 影 12 + HA の中の 1
    expect(FS_SH1).not.toMatch(/\btexture\(/);
    // 影の比 1/t と、2t の値は 12 歩の値（sdf.ts の shadeAt と同じ）
    for (let i = 1; i <= SHADOW_STEPS; i++) {
      const re = new RegExp(`c = h0 \\+ ([0-9.]+); m = [^;]*\\* ([0-9.]+)\\)?;`, 'g');
      const all = [...FS_SH1.matchAll(re)];
      expect(all).toHaveLength(SHADOW_STEPS);
      expect(+all[i - 1][1]).toBeCloseTo((2 * i) / SHADOW_STEPS, 7);
      expect(+all[i - 1][2]).toBeCloseTo(SHADOW_STEPS / i, 6);
    }
    expect(FS_SH1).toContain('hT = h0 + 0.02');
    expect(FS_SH1).toContain('step(h0, 0.15)');
    expect(FS_SH1).toContain('step(0.15, h0)');
  });
  /** `uniform <型> a, b;` の名前 */
  const uniforms = (src: string) => [...src.matchAll(/uniform\s+\w+\s+([^;]+);/g)].flatMap((m) => m[1].split(',').map((s) => s.trim())).sort();
  it('uniform の名前の一覧は、ソースの宣言と、sh0Uniforms・shadeUniforms の名前と揃っている', () => {
    expect(uniforms(VS_SH0 + FS_SH0)).toEqual([...SH0_UNIFORMS].sort());
    expect(uniforms(VS_SH1 + FS_SH1)).toEqual([...SH1_UNIFORMS].sort());
    const v = shapeView(1180, 820, 44, 1.2, 0, 0);
    expect(Object.keys(sh0Uniforms(v)).sort()).toEqual(SH0_UNIFORMS.filter((n) => n !== 'uWater').sort());
    expect(Object.keys(shadeUniforms(v, hard([0, -1]))).sort()).toEqual(SH1_UNIFORMS.filter((n) => n !== 'uShape').sort());
  });
  it('属性の番号、頂点と画素のあいだの値（varying）の数と名前', () => {
    for (const [name, loc] of Object.entries(SH0_ATTR)) expect(VS_SH0).toMatch(new RegExp(`layout\\(location = ${loc}\\) in vec[24] ${name};`));
    expect(VS_SH1).toContain('layout(location = 0) in vec2 p;');
    const outs = (src: string) => [...src.matchAll(/^(?:flat )?out (?:vec[24]) (\w+);/gm)].map((m) => m[1]).sort();
    const ins = (src: string) => [...src.matchAll(/^(?:flat )?in (?:vec[24]) (\w+);/gm)].map((m) => m[1]).sort();
    expect(outs(VS_SH0)).toEqual(ins(FS_SH0));
    expect(outs(VS_SH1)).toEqual(ins(FS_SH1));
    // WebGL2 が必ず持つ 15 個の vec4 に余裕で収まる
    expect(ins(FS_SH1).length).toBeLessThanOrEqual(8);
  });
  it('shadeUniforms：tShade の uv の端は tShape の帯の内側、光の向きは uv の上向きに直す', () => {
    const v = shapeView(1180, 820, 44, 1.6, 3, 4), U = shadeUniforms(v, hard([-0.82, -0.58], 1.6));
    expect(U.uShapeOff[0]).toBeCloseTo(v.g / v.W, 9);
    expect(U.uShapeScale[0] + 2 * U.uShapeOff[0]).toBeCloseTo(1, 9);
    expect(U.uShapeOff[1]).toBeCloseTo(v.g / v.H, 9);
    // 画面の上（光の側）は uv の v が大きい方
    expect(U.uD[0]).toBeLessThan(0); expect(U.uD[1]).toBeGreaterThan(0);
    expect(Math.hypot(U.uD[0] * v.W, U.uD[1] * v.H)).toBeCloseTo(1.6 * 22, 6);
    expect(U.uK).toBeCloseTo(16, 9);
    expect(shadeUniforms(v, { dir: [0, -1], len: 1, soft: 1, vis: 1 }).uK).toBeCloseTo(2, 9);
    expect(U.uAOX[2] * v.W).toBeCloseTo(3 * AO_STEP * 22, 9);
  });
});
