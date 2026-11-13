/**
 * 光と色調の計算（SPEC2 D2・L3・L3a・L7）。
 * - 合成段（final.glsl）の LIGHT・COMPOSE・TONE を、JS でそのままなぞる見本。検査はこれで、シェーダーと同じ式を確かめる
 * - CPU で決める値：昼の光のならし（紙は正午に 標準 と同じ値）、夜の場 N、露出、熱のゆらぎと水面の格子のずれと位相
 * 作業の空間はガンマ 2：画面の値 s を s*s にして光をかけ、最後に sqrt で戻す（pow・exp・log を使わない）。
 * 8 ビットのどの値も、2 乗して平方根で戻すと元の値にもどる（fp32 で確かめてある）。
 * 物質（keep = 1）は、合成段を通っても元の絵の値のまま。夜の場 N は、標準の画質では乗算、高い画質では同じ N を光として使うので、
 * 開けた紙はどの画質でも同じ色になる。
 */

/** 色（作業の空間なら 2 乗した値、画面の値なら 0〜1） */
export type RGB = [number, number, number];

/** ITU-R BT.709 の明るさの重み（作業の空間で彩度を変えるとき） */
export const LUM709: Readonly<RGB> = [0.2126, 0.7152, 0.0722];
/** BT.601 の明るさの重み（画面の値で、暗い所と明るい所の色を分けるとき。今の合成段と同じ） */
export const LUM601: Readonly<RGB> = [0.299, 0.587, 0.114];
const WHITE: Readonly<RGB> = [1, 1, 1];

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** GLSL の mix と同じ式（t = 1 でちょうど b、t = 0 でちょうど a） */
export const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const dot3 = (a: Readonly<RGB>, b: Readonly<RGB>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const mix3 = (a: Readonly<RGB>, b: Readonly<RGB>, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const mul3 = (a: Readonly<RGB>, b: Readonly<RGB>): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const scale3 = (a: Readonly<RGB>, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

// ---- ガンマ 2 ----
/** '#rrggbb' を画面の値（0〜1）に */
export function hexDisp(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
/** 画面の値を '#rrggbb' に（0〜1 におさめて、8 ビットに丸める） */
export const dispHex = (c: Readonly<RGB>) => '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
/** 画面の値を作業の空間へ（2 乗） */
export const toG2 = (c: Readonly<RGB>): RGB => [c[0] * c[0], c[1] * c[1], c[2] * c[2]];
/** 作業の空間を画面の値へ（負の値は 0 にしてから平方根。NaN を出さない） */
export const fromG2 = (c: Readonly<RGB>): RGB => [Math.sqrt(Math.max(c[0], 0)), Math.sqrt(Math.max(c[1], 0)), Math.sqrt(Math.max(c[2], 0))];
export const hexG2 = (hex: string) => toG2(hexDisp(hex));

/** 物質の印（マスクの緑）から、そのままにする度合い。合成も色調もこの 1 つの式を使う（D4） */
export const keepOf = (g: number) => smoothstep(0.85, 0.98, g);

// ---- 色調 ----
/**
 * 色を保つ肩（Khronos PBR Neutral の形から、暗い所の 0.04 のずらしを除いたもの）。
 * いちばん明るい成分が start より下なら、そのまま。上なら、明るさを 1 の手前へなめらかに寄せ、寄せた分だけ白へ少し混ぜる。
 * start は 0 と 1 のあいだ（明るい見た目 0.94：紙 #f6f4ec の 2 乗 0.93 はそのまま通り、真っ白は 251/255 になる。暗い見た目 0.80）
 */
export function neutralCompress(c: Readonly<RGB>, start: number): RGB {
  const peak = Math.max(c[0], c[1], c[2]);
  if (!(peak >= start)) return [c[0], c[1], c[2]];
  const d = 1 - start, np = 1 - (d * d) / (peak + d - start), k = np / peak;
  const g = 1 - 1 / (0.15 * (peak - np) + 1);
  return [mix(c[0] * k, np, g), mix(c[1] * k, np, g), mix(c[2] * k, np, g)];
}

/** TONE の値（見た目ごとの色調。post-looks.ts と postParamsFor が決める） */
export interface ToneU {
  exposure: number;      // uExposure：昼は 1、夜は見た目ごとに 1.0〜1.25（光の状態から決める。画面の明るさからは決めない）
  sat: number;           // uSat
  toneStart: number;     // uToneStart：肩の始まり
  contrast: number;      // uContrast
  shTint: Readonly<RGB>; // uShTint：暗い所の色
  hiTint: Readonly<RGB>; // uHiTint：明るい所の色
  tint: Readonly<RGB>;   // uTint
  vig: number;           // uVig：明るい見た目 ≤ 0.12、暗い見た目 ≤ 0.20（D4）
  dither: number;        // uDither：暗い見た目だけ、≤ 1.5/255
}

/**
 * TONE をなぞる（final.glsl の最後）。col は作業の空間の色、sRaw は物質の元の絵（画面の値）、keep は keepOf の値、
 * c は画面の中心からの位置（uv − 0.5）、aspect は高さ / 幅、q はディザーに使う画素の位置（整数）。
 */
export function toneMirror(u: ToneU, col: Readonly<RGB>, sRaw: Readonly<RGB>, keep: number, c: readonly [number, number], aspect: number, q?: readonly [number, number]): RGB {
  let x = scale3(col, u.exposure);
  const y = dot3(x, LUM709);
  x = [mix(y, x[0], u.sat), mix(y, x[1], u.sat), mix(y, x[2], u.sat)];
  x = neutralCompress([Math.max(x[0], 0), Math.max(x[1], 0), Math.max(x[2], 0)], u.toneStart);
  let d = fromG2(x);
  d = d.map((v) => mix(v, v * v * (3 - 2 * v), u.contrast)) as RGB;
  const t = smoothstep(0.08, 0.9, dot3(d, LUM601));
  d = [d[0] * mix(u.shTint[0], u.hiTint[0], t) * u.tint[0], d[1] * mix(u.shTint[1], u.hiTint[1], t) * u.tint[1], d[2] * mix(u.shTint[2], u.hiTint[2], t) * u.tint[2]];
  // 物質は、合成段を通っても元の絵のまま
  d = mix3(d, sRaw, keep);
  // 周辺減光は物質にもかける（画面の中ほど |c|·1.7 < 0.35 では 1）
  d = scale3(d, 1 - smoothstep(0.35, 0.95, Math.hypot(c[0], c[1] * aspect) * 1.7) * u.vig);
  if (u.dither > 0 && q) { const n = (u01(pcg2d(q[0], q[1])[0]) - 0.5) * u.dither * (1 - keep); d = [d[0] + n, d[1] + n, d[2] + n]; }
  return d;
}

// ---- 光（LIGHT と COMPOSE） ----
/** LIGHT の値（postParamsFor が決める）。色は作業の空間 */
export interface LightU {
  dirCol: Readonly<RGB>;    // uDirCol：影を落とす光
  fillCol: Readonly<RGB>;   // uFillCol：回りの光
  floor: Readonly<RGB>;     // uFloor：光の床 night·floor²/露出（昼は 0）
  pool: readonly [number, number, number];   // uPool：池の中心（画面の左上を 0 とした割合）と届く距離（CSS px）。距離 0 なら池の項を省く
  lampDisp: Readonly<RGB>;  // uLampDisp：池の中心の色（画面の値。白から night で混ぜたもの）
  floorDisp: Readonly<RGB>; // uFloorDisp：池の外の色（同じ）
  shadow: number; ao: number; bevel: number;   // uShadow, uAO, uBevel（tShade がないときは 0）
  lampGain: number;         // uLampGain：灯のにじみが、まわりを照らす強さ
  bloom: number;            // uBloom
}
/** にじみ（PRE で 2 乗してあるので、作業の空間） */
export interface BloomTaps { b1: Readonly<RGB>; b2: Readonly<RGB>; b3: Readonly<RGB>; streak: Readonly<RGB> }

/**
 * LIGHT と COMPOSE と HALO をなぞる。s は場面の色（画面の値）、sh は tShade（r 影、g くぼみ、b 面の傾き 0.5 が平ら。最高でないときは null）、
 * p は画素の位置（CSS px、左上が 0）、size は画面の大きさ（CSS px）。返すのは作業の空間の色（TONE の前）。
 * シェーダーは uv と装置の画素で池の距離を測るが、割合は同じなので、ここでは CSS px で測る（uv の y は下が 0 なので、中心の y は 1 − y になる）
 */
export function lightMirror(u: LightU, s: Readonly<RGB>, sh: Readonly<RGB> | null, keep: number, p: readonly [number, number], size: readonly [number, number], b?: BloomTaps): RGB {
  const sl = toG2(s);
  let vis = 1, ao = 1, bev = 1;
  if (sh) { vis = 1 - sh[0] * u.shadow; ao = 1 - sh[1] * u.ao; bev = 1 + (sh[2] - 0.5) * 2 * u.bevel; }
  let nf: RGB = [1, 1, 1];
  if (u.pool[2] > 0) {
    const t = Math.min(1, Math.hypot(p[0] - u.pool[0] * size[0], p[1] - u.pool[1] * size[1]) / u.pool[2]);
    nf = toG2(mix3(u.lampDisp, u.floorDisp, t));
  }
  const lampL: RGB = b ? scale3([b.b3[0] + 0.5 * b.b2[0], b.b3[1] + 0.5 * b.b2[1], b.b3[2] + 0.5 * b.b2[2]], u.lampGain) : [0, 0, 0];
  const out = [0, 1, 2].map((i) => {
    const light = Math.max((u.dirCol[i] * (vis * bev) + u.fillCol[i] * ao) * nf[i], u.floor[i]) + lampL[i];
    let col = sl[i] * mix(light, 1, keep);
    // 灯のにじみは足し算（スクリーンで重ねない）。物質の上には乗せない
    if (b) col += ((b.b1[i] * 0.5 + b.b2[i] * 0.45 + b.b3[i] * 0.35) * u.bloom + b.streak[i]) * (1 - keep);
    return col;
  });
  return out as RGB;
}

/**
 * 昼の開けた地面の光（影を落とす光 + 回りの光）を、明るさ 1・色み 4 割にならす（L3 の CPU 側）。
 * 2 つの光に同じ係数 open·mix(1/Y(open), 1/open, 0.6) をかけるので、影と日なたの割合は変わらない。紙は正午に 標準 と同じ値になり、夕方は少し暖かくなる
 */
export function openNorm(dir: Readonly<RGB>, fill: Readonly<RGB>): [RGB, RGB] {
  const open: RGB = [dir[0] + fill[0], dir[1] + fill[1], dir[2] + fill[2]];
  const y = Math.max(dot3(open, LUM709), 1e-6);
  const k: RGB = [mix(1 / y, 1 / Math.max(open[0], 1e-6), 0.6), mix(1 / y, 1 / Math.max(open[1], 1e-6), 0.6), mix(1 / y, 1 / Math.max(open[2], 1e-6), 0.6)];
  return [mul3(dir, k), mul3(fill, k)];
}

// ---- 夜の場 N（L7） ----
/** 明るい見た目（夜の場があるのは、この 4 つだけ。暗い見た目は時刻で変わらない） */
export type LightLook = 'note-light' | 'arcane-light' | 'punk-light' | 'lab-light';
/**
 * 夜の場：灯りの色（中心）から床の色（中心から届く距離の先）へ、画面の値で直線に。どちらも目が部屋の灯りに慣れた色（白に寄せた色）。
 * 床で、紙と文字のコントラストが 7:1 を下まわらない。一様な見た目（工場の投光器・研究所の天井灯）は lamp = floor。
 * keyShare：夜の開けた地面の光のうち、影を落とす分（初期値。関門で合わせる）。exposure：夜の露出（初期値、1.0〜1.25）
 */
export interface NightSpec { lamp: string; floor: string; x: number; y: number; keyShare: number; exposure: number }
export const NIGHT: Readonly<Record<LightLook, Readonly<NightSpec>>> = {
  'note-light': { lamp: '#ffeedd', floor: '#b4bccc', x: 0.15, y: 0.10, keyShare: 0.6, exposure: 1.15 },    // 机の電気スタンド 2700 K
  'arcane-light': { lamp: '#fff6ea', floor: '#c8ccd6', x: 0.10, y: 0.20, keyShare: 0.6, exposure: 1.25 },  // ろうそく 1850 K
  'punk-light': { lamp: '#c8ccd6', floor: '#c8ccd6', x: 0.5, y: 0.5, keyShare: 0.4, exposure: 1.1 },      // 天井の投光器 4000 K
  'lab-light': { lamp: '#d2d8e2', floor: '#d2d8e2', x: 0.5, y: 0.5, keyShare: 0.3, exposure: 1.0 },       // 天井の灯り 5000 K
};
/** 夜の場が池の形を持たず、画面のどこでも同じか */
export const uniformField = (f: Readonly<Pick<NightSpec, 'lamp' | 'floor'>>) => f.lamp === f.floor;
/** 夜の場の届く距離（CSS px）：中心からいちばん遠い画面の角までの 0.7 倍 */
export function reachOf(x: number, y: number, cw: number, ch: number): number {
  const px = x * cw, py = y * ch;
  return 0.7 * Math.max(Math.hypot(px, py), Math.hypot(cw - px, py), Math.hypot(px, ch - py), Math.hypot(cw - px, ch - py));
}
/** 夜の場 N_eff の色（画面の値）：画素 (px, py)（CSS px）で N = mix(lamp, floor, 距離/届く距離) を求め、白から night で混ぜる */
export function fieldAt(f: Readonly<Pick<NightSpec, 'lamp' | 'floor' | 'x' | 'y'>>, night: number, px: number, py: number, cw: number, ch: number): RGB {
  const reach = reachOf(f.x, f.y, cw, ch);
  const t = uniformField(f) || reach <= 0 ? 1 : Math.min(1, Math.hypot(px - f.x * cw, py - f.y * ch) / reach);
  return mix3(WHITE, mix3(hexDisp(f.lamp), hexDisp(f.floor), t), night);
}
/** 露出：昼は 1、夜に向かって見た目の夜の露出へ */
export const exposureOf = (f: Readonly<Pick<NightSpec, 'exposure'>> | null, night: number) => (f ? mix(1, f.exposure, night) : 1);

/** 明るい見た目の、昼から夜への LIGHT の値（色調以外） */
export interface NightU {
  dirCol: RGB; fillCol: RGB; floor: RGB;
  pool: [number, number, number]; lampDisp: RGB; floorDisp: RGB;
  exposure: number;
}
/**
 * 昼の光（openNorm でならした dayDir・dayFill）から夜の場へ（L3・L7 の CPU 側）。
 * - 夜に向かって、影を落とす光と回りの光を、色のない割合 keyShare/露出 と (1 − keyShare)/露出 へ混ぜる。色はすべて夜の場が受け持つ
 *   （光が N より強い色みを持たない）
 * - 池のある見た目（ノート・魔術）：池の中心と届く距離（CSS px）、灯りと床の色を白から night で混ぜたものを渡す。night ≤ 0.01 では池の項を省く
 * - 一様な見た目（工場・研究所）：池の項を省き、2 つの光に mix(1, N, night)² をかける
 * - 光の床 night·floor²/露出：影の中でも、床の色より暗くならない
 * 夜（night = 1）の開けた紙は、TONE で露出をかけたあと paper·N になり、標準 の乗算と同じ色になる。
 */
export function nightLight(f: Readonly<NightSpec>, night: number, dayDir: Readonly<RGB>, dayFill: Readonly<RGB>, cw: number, ch: number): NightU {
  const exposure = exposureOf(f, night), ks = f.keyShare / exposure, fs = (1 - f.keyShare) / exposure;
  let dirCol: RGB = [mix(dayDir[0], ks, night), mix(dayDir[1], ks, night), mix(dayDir[2], ks, night)];
  let fillCol: RGB = [mix(dayFill[0], fs, night), mix(dayFill[1], fs, night), mix(dayFill[2], fs, night)];
  const lamp = hexDisp(f.lamp), floorD = hexDisp(f.floor);
  const floor: RGB = [night * floorD[0] * floorD[0] / exposure, night * floorD[1] * floorD[1] / exposure, night * floorD[2] * floorD[2] / exposure];
  if (uniformField(f) || night <= 0.01) {
    const n2 = uniformField(f) ? toG2(mix3(WHITE, floorD, night)) : [1, 1, 1] as RGB;
    dirCol = mul3(dirCol, n2); fillCol = mul3(fillCol, n2);
    return { dirCol, fillCol, floor, pool: [f.x, f.y, 0], lampDisp: [1, 1, 1], floorDisp: [1, 1, 1], exposure };
  }
  return { dirCol, fillCol, floor, pool: [f.x, f.y, reachOf(f.x, f.y, cw, ch)], lampDisp: mix3(WHITE, lamp, night), floorDisp: mix3(WHITE, floorD, night), exposure };
}

// ---- 熱のゆらぎと水面：整数の格子と、CPU で決めるずれと位相（L3a） ----
/** pcg2d（Jarzynski & Olano 2020）：32 ビットの符号なし整数 2 つから 2 つ。GLSL の uvec2 と同じ桁あふれ */
export function pcg2d(x: number, y: number): [number, number] {
  let vx = (Math.imul(x, 1664525) + 1013904223) >>> 0, vy = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  vx = (vx + Math.imul(vy, 1664525)) >>> 0;
  vy = (vy + Math.imul(vx, 1664525)) >>> 0;
  vx = (vx ^ (vx >>> 16)) >>> 0; vy = (vy ^ (vy >>> 16)) >>> 0;
  vx = (vx + Math.imul(vy, 1664525)) >>> 0;
  vy = (vy + Math.imul(vx, 1664525)) >>> 0;
  vx = (vx ^ (vx >>> 16)) >>> 0; vy = (vy ^ (vy >>> 16)) >>> 0;
  return [vx, vy];
}
/** かけ算と xorshift を 1 回ずつのハッシュ（pcg2d が ALU の見積もりに入らないときの代わり。整数の演算 8 つ） */
export function mxHash(x: number, y: number): number {
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
/** 32 ビットの整数を [0, 1) に（上の 24 ビットだけ使うので、fp32 でも 1 にならない。GLSL も float(h >> 8u) * (1.0 / 16777216.0)） */
export const u01 = (h: number) => (h >>> 8) / 16777216;
const pcgCell = (x: number, y: number) => u01(pcg2d(x >>> 0, y >>> 0)[0]);

/**
 * 整数の格子の値ノイズ：floor(p) に整数のずれ o を足した点のハッシュを、今の noise() と同じなめらかさで補う。
 * 格子の番号は GLSL の ivec2 と同じく 32 ビットで回る
 */
export function noiseI(px: number, py: number, ox = 0, oy = 0, cell: (x: number, y: number) => number = pcgCell): number {
  const ix = Math.floor(px), iy = Math.floor(py);
  let fx = px - ix, fy = py - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const cx = (ix + ox) | 0, cy = (iy + oy) | 0, cx1 = (cx + 1) | 0, cy1 = (cy + 1) | 0;
  return mix(mix(cell(cx, cy), cell(cx1, cy), fx), mix(cell(cx, cy1), cell(cx1, cy1), fx), fy);
}

/** 地図の原点：カメラの位置を 256 マスの倍数にそろえる（シェーダーの中の数が、大きな工場でも小さいままになる） */
export const snapOrigin = (x: number) => Math.round(x / 256) * 256;
/**
 * 格子のずれ（CPU、fp64）：A = f·origin + v·t を、整数 o と端数 r に分ける。f は 1 マス（または 1 画素）あたりの格子の数、v は 1 秒の流れ。
 * シェーダーは noise(f·(wp − origin) + r, o)（画面に貼りつく模様は origin = 0）。f·wp + v·t の格子と端数がそのまま保たれる
 */
export function latticeSplit(f: number, origin: number, v: number, t: number): { o: number; r: number } {
  const a = f * origin + v * t, o = Math.floor(a);
  return { o, r: a - o };
}
/** 位相（CPU、fp64）：(f·origin + v·t) を 2π で回したもの。シェーダーは sin(f·(wp − origin) + φ)。時間がたっても跳ばない */
export function phaseOf(f: number, origin: number, v: number, t: number): number {
  const TAU = 2 * Math.PI, a = (f * origin + v * t) % TAU;
  return a < 0 ? a + TAU : a;
}
