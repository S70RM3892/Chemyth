/**
 * 立体表示のカメラと、指の位置からマスを求める計算。
 * 世界は x が東、y が南（マスの座標そのまま）、h が高さ。カメラは注視点の南の上空にあり、北を向いて見下ろす。回転はしない
 * （地面の文字や化学式が逆さにならないように）。
 * 絵は 2 枚の平面に描く：地面（h = 0）と、大きな装置の天面（h = TOP_H）。1 マスの設備は地面の絵をそのまま少し持ち上げる。
 */
import type { Ent } from '../engine/world';

/** 真上からの傾き（度）と、縦の視野角（度）。傾きを大きくすると立体感は増すが、天面の絵と文字が縦に潰れる */
export const TILT = 30, FOV = 32;
/** 2×2 の装置と納品所の天面の高さ（マス） */
export const TOP_H = 0.9;
/** 1 マスの設備の高さ */
const LOW: Record<string, number> = { extractor: 0.45, depot: 0.4, analyzer: 0.4, sampler: 0.4, vent: 0.3, splitter: 0.2, sensor: 0.32, gate: 0.32, lift: 0.5 };

/** 設備の箱の高さ（マス）。0 は平ら（ベルト、立体交差、地下ベルトの口、2×2 の残りのマス） */
export function heightOf(e: Pick<Ent, 'kind' | 'big'>): number {
  if (e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'tunnel' || e.kind === 'part') return 0;
  if (e.kind === 'hub' || e.big) return TOP_H;
  return LOW[e.kind] ?? 0.35;
}

export type Mat4 = Float64Array;

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

/** 4×4 の逆行列（余因子で求める） */
function invert(m: Mat4): Mat4 {
  const o = new Float64Array(16);
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = det ? 1 / det : 0;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}

export interface Cam3 {
  /** 世界（x, 高さ, y）→ 画面の変換（WebGL に渡す） */
  vp: Mat4;
  /** 世界の点が、画面のどこに見えるか（画面の左上からのピクセル） */
  project(x: number, y: number, h?: number): [number, number];
  /** 画面の点から伸ばした視線が、高さ h の平面と交わる所 */
  unproject(px: number, py: number, h?: number): [number, number];
  /** 画面に見えている範囲（地面と天面の両方）を囲む長方形 */
  x0: number; y0: number; x1: number; y1: number;
}

/**
 * カメラを作る。cam.x, cam.y は注視点（画面の真ん中に見える地面の点）、cam.z は注視点での 1 マスの大きさ（ピクセル）。
 * 平らな表示と同じ意味なので、視点の移動・拡大・「全体」ボタンは、そのまま使える。
 */
export function camera3(cam: { x: number; y: number; z: number }, cw: number, ch: number): Cam3 {
  const th = (TILT * Math.PI) / 180, f = 1 / Math.tan((FOV * Math.PI) / 360);
  const d = (ch * f) / (2 * cam.z), s = Math.sin(th), c = Math.cos(th);
  // 視線は (0, -c, -s)。右は +x、上は (0, s, -c)
  const ex = cam.x, eh = d * c, ey = cam.y + d * s;
  const view = new Float64Array([1, 0, 0, 0, 0, s, c, 0, 0, -c, s, 0, -ex, -(eh * s - ey * c), -(eh * c + ey * s), 1]);
  const near = Math.max(0.5, d * 0.2), far = d * 4 + 60, asp = cw / ch;
  const proj = new Float64Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  const vp = mul(proj, view), inv = invert(vp);
  const project = (x: number, y: number, h = 0): [number, number] => {
    const w = vp[3] * x + vp[7] * h + vp[11] * y + vp[15];
    // カメラより後ろ（ずっと南）の点は、画面の下のはるか外にあることにする
    if (w < 1e-3) return [cw / 2 + (x - cam.x) * cam.z, ch * 50];
    return [((vp[0] * x + vp[4] * h + vp[8] * y + vp[12]) / w * 0.5 + 0.5) * cw, (0.5 - (vp[1] * x + vp[5] * h + vp[9] * y + vp[13]) / w * 0.5) * ch];
  };
  const at = (nx: number, ny: number, nz: number): [number, number, number] => {
    const w = inv[3] * nx + inv[7] * ny + inv[11] * nz + inv[15];
    return [(inv[0] * nx + inv[4] * ny + inv[8] * nz + inv[12]) / w, (inv[1] * nx + inv[5] * ny + inv[9] * nz + inv[13]) / w, (inv[2] * nx + inv[6] * ny + inv[10] * nz + inv[14]) / w];
  };
  const unproject = (px: number, py: number, h = 0): [number, number] => {
    const nx = (px / cw) * 2 - 1, ny = 1 - (py / ch) * 2, a = at(nx, ny, -1), b = at(nx, ny, 1);
    const k = (h - a[1]) / (b[1] - a[1] || 1e-9);
    return [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k];
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const h of [0, TOP_H]) for (const [px, py] of [[0, 0], [cw, 0], [0, ch], [cw, ch]]) {
    const [x, y] = unproject(px, py, h);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { vp, project, unproject, x0, y0, x1, y1 };
}

/**
 * 画面に見えている範囲を覆うのに要る、絵の大きさ（注視点での 1 マス = cam.z ピクセルとして）。
 * 見えている範囲のマスの数は拡大率に反比例するので、この大きさは拡大率によらない。
 */
export function planeSize(cw: number, ch: number): [number, number] {
  const c = camera3({ x: 0, y: 0, z: 40 }, cw, ch), pad = 16;
  return [Math.ceil((c.x1 - c.x0) * 40) + pad * 2, Math.ceil((c.y1 - c.y0) * 40) + pad * 2];
}

/**
 * 指の位置のマス。箱の天面や側面に触れていれば、その設備のマスを返す（地面の点ではなく）。
 * 視線に沿って上から下へ調べ、最初に入った箱を取る。entAt はマスにある設備（なければ undefined）。
 */
export function pickTile(c: Cam3, px: number, py: number, entAt: (x: number, y: number) => Pick<Ent, 'kind' | 'big'> | undefined): [number, number] {
  for (let h = TOP_H; h > 0.01; h -= 0.1) {
    const [x, y] = c.unproject(px, py, h), tx = Math.floor(x), ty = Math.floor(y), e = entAt(tx, ty);
    if (e && heightOf(e) >= h - 1e-6) return [tx, ty];
  }
  const [x, y] = c.unproject(px, py, 0);
  return [Math.floor(x), Math.floor(y)];
}
