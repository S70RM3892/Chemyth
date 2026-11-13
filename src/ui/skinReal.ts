/**
 * 実景スキン（昼の構内・夜の構内）：上空から撮った、本物の化学プラントの見え方をめざす。
 * - 絵の具で塗った面を置かない。どの面も、素材の写真のようなきめ（コンクリートのむら・骨材・しみ、研磨した鋼のヘアライン、
 *   土と砂利、水面のさざ波）を、起動してから 1 度だけ計算で作り、それを敷く
 * - 光は左上から。丸い管は、明るい帯・細い照り返し・下側の影を重ねて円筒に見せる。装置は、縁の面取りと、地面に落ちる影
 * - 地面：打ち継ぎ目地のあるコンクリートの構内。油じみ・雨の水たまり（空が映る）・タイヤの跡。資源地は、その土地の地面（海は水面）
 * - 装置：コンクリートの基礎の上に、研磨した鋼の筐体。機種の色は、塗装した帯と銘板だけ。ボルト、通気口、黄黒の安全表示。
 *   絵は 1 度描いて覚え、あとは貼る（何百台並んでも重くならない）
 * - 配管：液体は青灰、気体は黄の塗装管（配管の色分けにならう）にフランジ。固体は、ローラーの上を流れる黒いゴムのコンベヤ
 * 守ること：装置の窓の中（反応の様子・物質の色）は、ほかのスキンと同じ絵。文字は読めること
 */
import { ZONES, isSea, zoneAt } from '../content/map';
import { label, sub } from '../content/substances';
import { currentGoal, goalCount, goalRate, requiredOf, type Ent, type World } from '../engine/world';
import { mix, type Palette } from './theme';

const TAU = Math.PI * 2;
const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
type BK = 'solid' | 'liquid' | 'gas' | 'none';
export interface RealBelt { e: Ent; c: { ax: number; ay: number; bx: number; by: number } }

// ---------------------------------------------------------------------
// 素材：端でつながる 256×256 のきめを、計算で作る（1 度だけ）
// ---------------------------------------------------------------------
const TEX = 256;
/** 決まった乱数（0〜1） */
const rnd = (x: number, y: number, s: number) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
/** 端でつながる、なめらかな乱れ（格子 cell 個で 1 巡り） */
function vnoise(x: number, y: number, cell: number, seed: number): number {
  const fx = (x / TEX) * cell, fy = (y / TEX) * cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), w = (i: number) => ((i % cell) + cell) % cell;
  const a = rnd(w(ix), w(iy), seed), b = rnd(w(ix + 1), w(iy), seed), c = rnd(w(ix), w(iy + 1), seed), d = rnd(w(ix + 1), w(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x: number, y: number, cell: number, seed: number, oct = 4) => { let v = 0, a = 0.5, c = cell; for (let i = 0; i < oct; i++) { v += vnoise(x, y, c, seed + i * 13) * a; a *= 0.5; c *= 2; } return v; };
const texCache = new Map<string, HTMLCanvasElement>();
/** 画素ごとの明るさ（0〜1 あたり）と色から、きめの絵を作る */
function makeTex(key: string, f: (x: number, y: number) => [number, number, number]): HTMLCanvasElement {
  let cv = texCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = cv.height = TEX;
  const g = cv.getContext('2d')!, im = g.createImageData(TEX, TEX), d = im.data;
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const [r, gg, b] = f(x, y), i = (y * TEX + x) * 4; d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b; d[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  texCache.set(key, cv);
  return cv;
}
/** コンクリート：大きなむら、細かいざらつき、骨材の粒、小さな気泡の穴、うっすらした水の跡 */
function concrete(night: boolean): HTMLCanvasElement {
  return makeTex(`concrete-${night}`, (x, y) => {
    const big = fbm(x, y, 3, 1, 4), fine = rnd(x, y, 3), grit = fbm(x, y, 48, 5, 2), streak = fbm(x * 0.3, y, 6, 9, 3);
    let v = 0.62 + (big - 0.5) * 0.22 + (fine - 0.5) * 0.09 + (grit - 0.5) * 0.12 + (streak - 0.5) * 0.08;
    const pit = rnd(x, y, 7); if (pit > 0.992) v -= 0.22; else if (pit < 0.012) v += 0.14;
    const w = night ? 0.3 : 1, k = (v + (night ? 0.06 : 0.2)) * (night ? 112 : 236);
    return [k * (1 + 0.02 * w), k * (1 + 0.01 * w), k * (night ? 1.08 : 0.95)];
  });
}
/** 研磨した鋼：横に長いヘアライン。ところどころ、うっすらした曇り */
function steel(night: boolean): HTMLCanvasElement {
  return makeTex(`steel-${night}`, (x, y) => {
    const line = fbm(x * 0.04, y, 64, 11, 3), cloud = fbm(x, y, 3, 17, 3), fine = rnd(x * 0.2 | 0, y, 19);
    const v = 0.72 + (line - 0.5) * 0.34 + (cloud - 0.5) * 0.12 + (fine - 0.5) * 0.05, k = v * (night ? 120 : 232);
    return [k * 0.97, k, k * 1.04];
  });
}
/** 土と砂利：粒の大きさの違うむらと、小石の明暗 */
function soil(night: boolean): HTMLCanvasElement {
  return makeTex(`soil-${night}`, (x, y) => {
    const big = fbm(x, y, 4, 23, 4), peb = fbm(x, y, 40, 29, 2), fine = rnd(x, y, 31);
    let v = 0.55 + (big - 0.5) * 0.4 + (peb - 0.5) * 0.3 + (fine - 0.5) * 0.14;
    if (peb > 0.72) v += 0.16; if (peb < 0.3) v -= 0.1;
    const k = v * (night ? 92 : 230);
    return [k, k, k];
  });
}
/** 水面：2 つの向きのさざ波が重なった明暗（明るい所が、空の照り返し） */
function water(night: boolean): HTMLCanvasElement {
  return makeTex(`water-${night}`, (x, y) => {
    const a = fbm(x + y * 0.4, y * 2.2, 6, 37, 3), b = fbm(x * 1.6 - y * 0.3, y * 3.1, 9, 41, 3), deep = fbm(x, y, 2, 43, 3);
    const rip = Math.pow(Math.abs(a - b) * 2.2, 0.7), spec = Math.max(0, 1 - rip * 3.2);
    const v = 0.34 + (deep - 0.5) * 0.3 + spec * 0.5;
    return night ? [v * 26 + spec * 60, v * 46 + spec * 80, v * 78 + spec * 110] : [v * 40 + spec * 150, v * 110 + spec * 120, v * 150 + spec * 95];
  });
}
/** 草地：短い草のむらと、明るい穂先 */
function grass(night: boolean): HTMLCanvasElement {
  return makeTex(`grass-${night}`, (x, y) => {
    const big = fbm(x, y, 5, 47, 4), blade = fbm(x * 2.4, y * 0.6, 60, 53, 2), fine = rnd(x, y, 59);
    const v = 0.5 + (big - 0.5) * 0.45 + (blade - 0.5) * 0.4 + (fine - 0.5) * 0.12, k = night ? 0.36 : 1;
    return [v * 150 * k, v * 205 * k, v * 96 * k];
  });
}
const patCache = new WeakMap<CanvasRenderingContext2D, Map<HTMLCanvasElement, CanvasPattern>>();
/** きめを敷く模様。(ox, oy) を原点に合わせる。scale は、きめ 1 枚を何画素に広げるか ÷ 256 */
function pat(ctx: CanvasRenderingContext2D, tex: HTMLCanvasElement, ox = 0, oy = 0, scale = 1): CanvasPattern | string {
  let m = patCache.get(ctx);
  if (!m) patCache.set(ctx, (m = new Map()));
  let p = m.get(tex);
  if (!p) { const q = ctx.createPattern(tex, 'repeat'); if (!q) return '#888888'; m.set(tex, (p = q)); }
  if (typeof DOMMatrix !== 'undefined' && p.setTransform) p.setTransform(new DOMMatrix().translate(ox, oy).scale(scale));
  return p;
}
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + q, y); c.lineTo(x + w - q, y); c.arcTo(x + w, y, x + w, y + q, q); c.lineTo(x + w, y + h - q); c.arcTo(x + w, y + h, x + w - q, y + h, q);
  c.lineTo(x + q, y + h); c.arcTo(x, y + h, x, y + h - q, q); c.lineTo(x, y + q); c.arcTo(x, y, x + q, y, q); c.closePath();
}
const rgbOf = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;

// ---------------------------------------------------------------------
// 地面
// ---------------------------------------------------------------------
/** 資源地の地面の種類 */
const GROUND: Record<string, 'water' | 'grass' | 'soil'> = { sea: 'water', bay: 'water', farm: 'grass', grove: 'grass', rubber: 'grass', forest: 'grass', ranch: 'grass' };
export function buildChunkReal(P: Palette, cx: number, cy: number, TS: number, CH: number): HTMLCanvasElement {
  const SIZE = TS * CH, cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d', { alpha: false })!, night = P.name !== 'light', ox = cx * CH, oy = cy * CH;
  // きめは、地図の座標に合わせて敷く（区画の境目で模様がずれない）。1 枚を 6 マスぶんに広げる
  const sc = (TS * 6) / TEX, px = -((ox * TS) % (TEX * sc)), py = -((oy * TS) % (TEX * sc));
  g.fillStyle = pat(g, concrete(night), px, py, sc); g.fillRect(0, 0, SIZE, SIZE);
  // ---- 資源地：その土地の地面。まず土台、縁は不ぞろいに ----
  const zones: (string | null)[] = [];
  for (let ty = -1; ty <= CH; ty++) for (let tx = -1; tx <= CH; tx++) zones.push(zoneAt(ox + tx, oy + ty) ?? null);
  const zAt = (tx: number, ty: number) => zones[(ty + 1) * (CH + 2) + tx + 1];
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
    const zn = zAt(tx, ty);
    if (!zn) continue;
    const kind = isSea(zn as never) ? 'water' : GROUND[zn] ?? 'soil', X = tx * TS, Y = ty * TS, wx = ox + tx, wy = oy + ty;
    g.save();
    // 縁のマスは、角を丸く欠く（まっすぐな境目にしない）
    const n = !zAt(tx, ty - 1), s = !zAt(tx, ty + 1), w = !zAt(tx - 1, ty), e = !zAt(tx + 1, ty), r = TS * 0.55;
    g.beginPath();
    g.moveTo(X + (n && w ? r : 0), Y);
    g.lineTo(X + TS - (n && e ? r : 0), Y); if (n && e) g.quadraticCurveTo(X + TS, Y, X + TS, Y + r);
    g.lineTo(X + TS, Y + TS - (s && e ? r : 0)); if (s && e) g.quadraticCurveTo(X + TS, Y + TS, X + TS - r, Y + TS);
    g.lineTo(X + (s && w ? r : 0), Y + TS); if (s && w) g.quadraticCurveTo(X, Y + TS, X, Y + TS - r);
    g.lineTo(X, Y + (n && w ? r : 0)); if (n && w) g.quadraticCurveTo(X, Y, X + r, Y);
    g.closePath(); g.clip();
    if (kind === 'water') {
      const ws = (TS * 5) / TEX;
      g.fillStyle = pat(g, water(night), -((ox * TS) % (TEX * ws)), -((oy * TS) % (TEX * ws)), ws); g.fillRect(X, Y, TS, TS);
    } else {
      const ss = (TS * 4) / TEX;
      g.fillStyle = pat(g, kind === 'grass' ? grass(night) : soil(night), -((ox * TS) % (TEX * ss)), -((oy * TS) % (TEX * ss)), ss); g.fillRect(X, Y, TS, TS);
      // 土地の色（鉱石の色）を、掛け算で重ねる
      g.globalCompositeOperation = 'multiply'; g.fillStyle = mix(ZONES[zn as keyof typeof ZONES].tint[1], '#ffffff', kind === 'grass' ? 0.86 : 0.5); g.fillRect(X, Y, TS, TS);
      g.globalCompositeOperation = 'source-over';
      // 石：明るい面と影のある小さな多角形
      for (let i = 0; i < 3; i++) {
        if (rnd(wx * 3 + i, wy * 5, 61) > (kind === 'grass' ? 0.25 : 0.6)) continue;
        const sx2 = X + rnd(wx, wy + i, 67) * TS, sy2 = Y + rnd(wx + i, wy, 71) * TS, sr = TS * (0.04 + rnd(wx, wy, 73 + i) * 0.07);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(sx2 + sr * 0.5, sy2 + sr * 0.6, sr * 1.1, sr * 0.7, 0, 0, TAU); g.fill();
        const tone = mix(ZONES[zn as keyof typeof ZONES].tint[1], night ? '#30343a' : '#c8c4bc', 0.55);
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, rr2 = sr * (0.75 + rnd(wx + k, wy + i, 79) * 0.5); g.lineTo(sx2 + Math.cos(a) * rr2, sy2 + Math.sin(a) * rr2 * 0.8); } g.closePath();
        const sg = g.createLinearGradient(sx2 - sr, sy2 - sr, sx2 + sr, sy2 + sr); sg.addColorStop(0, mix(tone, '#ffffff', night ? 0.2 : 0.5)); sg.addColorStop(1, mix(tone, '#000000', 0.5));
        g.fillStyle = sg; g.fill();
      }
    }
    g.restore();
    // 岸・土の縁：コンクリートとの境に、細い影と、こぼれた砂
    if (n || s || w || e) {
      g.strokeStyle = night ? 'rgba(0,0,0,0.5)' : 'rgba(30,24,16,0.4)'; g.lineWidth = Math.max(1, TS * 0.05); g.beginPath();
      if (n) { g.moveTo(X + (w ? r : 0), Y); g.lineTo(X + TS - (e ? r : 0), Y); } if (s) { g.moveTo(X + (w ? r : 0), Y + TS); g.lineTo(X + TS - (e ? r : 0), Y + TS); }
      if (w) { g.moveTo(X, Y + (n ? r : 0)); g.lineTo(X, Y + TS - (s ? r : 0)); } if (e) { g.moveTo(X + TS, Y + (n ? r : 0)); g.lineTo(X + TS, Y + TS - (s ? r : 0)); }
      g.stroke();
    }
  }
  // ---- コンクリートの構内：目地・しみ・水たまり・タイヤの跡（資源地でない所だけ）----
  const free = (tx: number, ty: number) => !zAt(tx, ty);
  // 打ち継ぎ目地：4 マスごと。暗い溝の左上に、細い明るい縁
  for (let i = 0; i <= CH; i++) {
    const jx = mod(ox + i, 4) === 0, jy = mod(oy + i, 4) === 0;
    for (let k = 0; k < CH; k++) {
      if (jx && free(i, k) && free(i - 1, k)) { g.fillStyle = night ? 'rgba(0,0,0,0.55)' : 'rgba(40,36,30,0.5)'; g.fillRect(i * TS - 1, k * TS, 2, TS); g.fillStyle = night ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.3)'; g.fillRect(i * TS + 1, k * TS, 1, TS); }
      if (jy && free(k, i) && free(k, i - 1)) { g.fillStyle = night ? 'rgba(0,0,0,0.55)' : 'rgba(40,36,30,0.5)'; g.fillRect(k * TS, i * TS - 1, TS, 2); g.fillStyle = night ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.3)'; g.fillRect(k * TS, i * TS + 1, TS, 1); }
    }
  }
  // マスの目印：角に小さな十字（置く場所がわかる程度に、うすく）
  g.fillStyle = night ? 'rgba(255,255,255,0.07)' : 'rgba(30,26,20,0.14)';
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) if (free(tx, ty)) { g.fillRect(tx * TS - 2, ty * TS, 5, 1); g.fillRect(tx * TS, ty * TS - 2, 1, 5); }
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
    if (!free(tx, ty)) continue;
    const wx = ox + tx, wy = oy + ty, X = tx * TS, Y = ty * TS, h1 = rnd(wx, wy, 83);
    if (h1 > 0.93) {
      // 油じみ：中心が濃く、縁がにじむ。うっすら虹色の膜
      const cxs = X + TS * (0.3 + rnd(wx, wy, 89) * 0.4), cys = Y + TS * (0.3 + rnd(wx, wy, 97) * 0.4), r = TS * (0.25 + rnd(wx, wy, 101) * 0.35);
      const og = g.createRadialGradient(cxs, cys, 0, cxs, cys, r); og.addColorStop(0, 'rgba(18,14,10,0.6)'); og.addColorStop(0.6, 'rgba(26,20,14,0.3)'); og.addColorStop(1, 'rgba(26,20,14,0)');
      g.fillStyle = og; g.beginPath(); g.ellipse(cxs, cys, r, r * 0.7, rnd(wx, wy, 103) * 3, 0, TAU); g.fill();
      const ig = g.createRadialGradient(cxs, cys, r * 0.2, cxs, cys, r * 0.6); ig.addColorStop(0, 'rgba(120,80,200,0.12)'); ig.addColorStop(0.5, 'rgba(60,180,160,0.1)'); ig.addColorStop(1, 'rgba(220,180,60,0)');
      g.fillStyle = ig; g.beginPath(); g.ellipse(cxs, cys, r * 0.6, r * 0.4, 0, 0, TAU); g.fill();
    } else if (h1 < 0.014) {
      // 水たまり：濡れて暗いコンクリートの中に、空を映す水面。縁に細い光
      const cxs = X + TS * 0.5, cys = Y + TS * 0.5, r = TS * (0.35 + rnd(wx, wy, 107) * 0.3), rot = rnd(wx, wy, 109) * 3;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cxs, cys, r * 1.3, r * 0.9, rot, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.ellipse(cxs, cys, r, r * 0.62, rot, 0, TAU); g.clip();
      const pg = g.createLinearGradient(cxs - r, cys - r, cxs + r, cys + r);
      if (night) { pg.addColorStop(0, '#2a3446'); pg.addColorStop(0.5, '#141a26'); pg.addColorStop(1, '#3a2c1c'); } else { pg.addColorStop(0, '#c9d6e0'); pg.addColorStop(0.45, '#8fa3b4'); pg.addColorStop(1, '#66798a'); }
      g.fillStyle = pg; g.fillRect(cxs - r * 1.3, cys - r * 1.3, r * 2.6, r * 2.6);
      g.restore();
      g.strokeStyle = night ? 'rgba(255,220,160,0.25)' : 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.ellipse(cxs, cys, r, r * 0.62, rot, Math.PI * 1.0, Math.PI * 1.7); g.stroke();
    } else if (h1 > 0.5 && h1 < 0.53) {
      // タイヤの跡：2 本の、かすれた黒い帯
      g.save(); g.translate(X + TS / 2, Y + TS / 2); g.rotate(rnd(wx, wy, 113) * Math.PI);
      for (const o of [-TS * 0.18, TS * 0.18]) { g.fillStyle = 'rgba(12,12,14,0.16)'; g.fillRect(-TS * 0.9, o - TS * 0.05, TS * 1.8, TS * 0.1); g.fillStyle = 'rgba(12,12,14,0.1)'; for (let k = 0; k < 14; k++) g.fillRect(-TS * 0.9 + k * TS * 0.13, o - TS * 0.05, TS * 0.05, TS * 0.1); }
      g.restore();
    } else if (h1 > 0.7 && h1 < 0.72) {
      // ひび：細く枝分かれする線
      g.strokeStyle = night ? 'rgba(0,0,0,0.6)' : 'rgba(30,26,20,0.55)'; g.lineWidth = 0.8; g.beginPath();
      let x = X + TS * rnd(wx, wy, 127), y = Y + TS * rnd(wx, wy, 131), a = rnd(wx, wy, 137) * TAU; g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { a += (rnd(wx + k, wy, 139) - 0.5) * 1.2; x += Math.cos(a) * TS * 0.09; y += Math.sin(a) * TS * 0.09; g.lineTo(x, y); if (k === 4) { g.moveTo(x, y); g.lineTo(x + Math.cos(a + 1.1) * TS * 0.14, y + Math.sin(a + 1.1) * TS * 0.14); g.moveTo(x, y); } }
      g.stroke();
    }
  }
  // ---- 構内灯：8 マスごとに 1 本。夜は、地面に橙の光の輪（ナトリウム灯）。昼は、柱と、その影 ----
  for (let ty = -5; ty < CH + 5; ty++) for (let tx = -5; tx < CH + 5; tx++) {
    const wx = ox + tx, wy = oy + ty;
    if (mod(wx, 8) !== 4 || mod(wy, 8) !== 4 || zoneAt(wx, wy)) continue;
    const X = tx * TS, Y = ty * TS;
    if (night) {
      const R = TS * 4.2, lg = g.createRadialGradient(X, Y, 0, X, Y, R);
      lg.addColorStop(0, 'rgba(255,196,120,0.5)'); lg.addColorStop(0.25, 'rgba(255,170,90,0.26)'); lg.addColorStop(0.6, 'rgba(255,150,70,0.09)'); lg.addColorStop(1, 'rgba(255,150,70,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = lg; g.fillRect(X - R, Y - R, R * 2, R * 2); g.globalCompositeOperation = 'source-over';
    } else {
      // 柱の長い影（右下へ）
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = Math.max(1.5, TS * 0.05); g.lineCap = 'round'; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + TS * 0.9, Y + TS * 1.2); g.stroke();
    }
    // 柱の頭（上から見た灯具）
    const r = Math.max(2, TS * 0.09), hg = g.createRadialGradient(X - r * 0.3, Y - r * 0.3, r * 0.1, X, Y, r);
    hg.addColorStop(0, night ? '#fff2d0' : '#f4f6f8'); hg.addColorStop(0.5, night ? '#ffb85a' : '#9aa2aa'); hg.addColorStop(1, '#22262a');
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(X + r * 0.3, Y + r * 0.4, r * 1.1, 0, TAU); g.fill();
    g.fillStyle = hg; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill();
  }
  return cv;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

// ---------------------------------------------------------------------
// 装置：1 度描いた絵を覚えて貼る
// ---------------------------------------------------------------------
const bodyCache = new Map<string, HTMLCanvasElement>();
/** 装置の筐体の絵（影・基礎・鋼の箱・塗装の帯・ボルト・通気口・安全表示・窓の枠）。大きさ・色・昼夜・大小ごとに 1 枚 */
function bodySprite(P: Palette, u: number, color: string, big: boolean): { cv: HTMLCanvasElement; size: number } {
  const U = Math.max(10, Math.round(u)), key = `${P.key}|${U}|${color}|${big}`, size = Math.ceil(U * 1.3);
  let cv = bodyCache.get(key);
  if (!cv) {
    if (bodyCache.size > 160) bodyCache.clear();
    cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d')!, night = P.name !== 'light', c = size / 2, h = U * 0.44, lw = Math.max(1, U * 0.012);
    // 地面に落ちる影：右下へ、やわらかく
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(0,0,0,${night ? 0.1 : 0.075})`; rr(g, c - h + U * 0.03 + i * U * 0.012, c - h + U * 0.05 + i * U * 0.016, h * 2, h * 2, U * 0.06 + i * U * 0.01); g.fill(); }
    // コンクリートの基礎：角の面取りに光
    rr(g, c - h - U * 0.02, c - h - U * 0.02, h * 2 + U * 0.04, h * 2 + U * 0.04, U * 0.05); g.fillStyle = pat(g, concrete(night), 0, 0, 0.5); g.fill();
    g.strokeStyle = night ? 'rgba(0,0,0,0.7)' : 'rgba(40,36,30,0.6)'; g.lineWidth = lw; g.stroke();
    // 鋼の筐体：ヘアラインのきめ → 左上からの光 → 縁の面取り
    const bh = h * 0.93;
    rr(g, c - bh, c - bh, bh * 2, bh * 2, U * 0.05); g.fillStyle = pat(g, steel(night), 0, 0, Math.max(0.35, U / 300)); g.fill();
    const lg = g.createLinearGradient(c - bh, c - bh, c + bh, c + bh);
    lg.addColorStop(0, `rgba(255,255,255,${night ? 0.16 : 0.42})`); lg.addColorStop(0.35, 'rgba(255,255,255,0.02)'); lg.addColorStop(0.7, 'rgba(0,0,0,0.12)'); lg.addColorStop(1, `rgba(0,0,0,${night ? 0.55 : 0.4})`);
    g.fillStyle = lg; g.fill();
    g.save(); rr(g, c - bh, c - bh, bh * 2, bh * 2, U * 0.05); g.clip();
    // 面取り：上と左は明るい線、下と右は暗い線
    g.lineWidth = Math.max(1.5, U * 0.022);
    g.strokeStyle = `rgba(255,255,255,${night ? 0.3 : 0.75})`; g.beginPath(); g.moveTo(c - bh, c + bh); g.lineTo(c - bh, c - bh); g.lineTo(c + bh, c - bh); g.stroke();
    g.strokeStyle = `rgba(0,0,0,${night ? 0.7 : 0.45})`; g.beginPath(); g.moveTo(c + bh, c - bh); g.lineTo(c + bh, c + bh); g.lineTo(c - bh, c + bh); g.stroke();
    // 塗装の帯（機種の色）：上の辺。つやと、端の欠け・さび
    const band = U * 0.1, paint = mix(color, night ? '#20242a' : '#f0f0ee', night ? 0.35 : 0.12);
    const pg = g.createLinearGradient(0, c - bh, 0, c - bh + band); pg.addColorStop(0, mix(paint, '#ffffff', 0.35)); pg.addColorStop(0.3, paint); pg.addColorStop(1, mix(paint, '#000000', 0.3));
    g.fillStyle = pg; g.fillRect(c - bh, c - bh, bh * 2, band);
    for (let i = 0; i < 14; i++) { const x = c - bh + rnd(i, U, 3) * bh * 2, y = c - bh + band - rnd(i, U, 5) * band * 0.5, r = U * (0.004 + rnd(i, U, 7) * 0.012); g.fillStyle = i % 3 ? 'rgba(120,60,24,0.75)' : 'rgba(200,205,210,0.8)'; g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(c - bh, c - bh + band, bh * 2, Math.max(1, U * 0.006));
    // 安全表示：下の辺に黄と黒の斜めじま
    const hz = U * 0.045;
    g.save(); g.beginPath(); g.rect(c - bh, c + bh - hz, bh * 2, hz); g.clip();
    g.fillStyle = night ? '#9a7a10' : '#f2c21a'; g.fillRect(c - bh, c + bh - hz, bh * 2, hz);
    g.fillStyle = '#16181a'; for (let x = -bh; x < bh * 2; x += hz * 1.6) { g.beginPath(); g.moveTo(c + x, c + bh); g.lineTo(c + x + hz * 0.8, c + bh); g.lineTo(c + x + hz * 1.8, c + bh - hz); g.lineTo(c + x + hz, c + bh - hz); g.closePath(); g.fill(); }
    g.restore();
    // 通気口：左右に細い溝（溝の下の縁に光）
    if (U >= 40) for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const x = c + sd * bh * 0.86 - U * 0.022, y = c - bh * 0.4 + i * U * 0.05; g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x, y, U * 0.044, U * 0.014); g.fillStyle = `rgba(255,255,255,${night ? 0.15 : 0.45})`; g.fillRect(x, y + U * 0.014, U * 0.044, Math.max(1, U * 0.005)); }
    // 溶接の継ぎ目：かすかな縦の線
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(c - bh * 0.62, c - bh + band); g.lineTo(c - bh * 0.62, c + bh - hz); g.moveTo(c + bh * 0.62, c - bh + band); g.lineTo(c + bh * 0.62, c + bh - hz); g.stroke();
    g.restore();
    rr(g, c - bh, c - bh, bh * 2, bh * 2, U * 0.05); g.strokeStyle = night ? '#05070a' : '#22262a'; g.lineWidth = lw * 1.2; g.stroke();
    // ボルト：頭の丸みと、右下の影
    if (U >= 30) for (const [bx, by] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
      if (!big && bx * by === 0) continue;
      const x = c + bx * bh * 0.88, y = c + by * bh * (by < 0 ? 0.7 : 0.86) + (by < 0 ? band * 0.2 : -hz * 0.4), r = Math.max(1.4, U * 0.017);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x + r * 0.4, y + r * 0.5, r * 1.1, 0, TAU); g.fill();
      const bg = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r); bg.addColorStop(0, night ? '#aab2ba' : '#ffffff'); bg.addColorStop(0.6, night ? '#4a525a' : '#9aa2aa'); bg.addColorStop(1, '#22262a');
      g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    // 窓の枠：黒いゴムのパッキン → 奥まった縁の影 → 板（中の絵の地）
    const wh = U * 0.3;
    rr(g, c - wh - U * 0.022, c - wh - U * 0.022, (wh + U * 0.022) * 2, (wh + U * 0.022) * 2, U * 0.05); g.fillStyle = '#101214'; g.fill();
    rr(g, c - wh, c - wh, wh * 2, wh * 2, U * 0.035); g.fillStyle = P.plate; g.fill();
    g.save(); rr(g, c - wh, c - wh, wh * 2, wh * 2, U * 0.035); g.clip();
    const ig = g.createLinearGradient(c - wh, c - wh, c - wh + U * 0.07, c - wh + U * 0.07); ig.addColorStop(0, 'rgba(0,0,0,0.35)'); ig.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ig; g.fillRect(c - wh, c - wh, wh * 2, wh * 2);
    g.restore();
    bodyCache.set(key, cv);
  }
  return { cv, size };
}
/** 装置の台：覚えた絵を貼り、動いているあいだだけ、表示灯を灯す */
export function bodyReal(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number, color: string) {
  const big = Math.round(u / z) >= 2, s = bodySprite(P, u, color, big), k = u / Math.max(10, Math.round(u)), d = s.size * k;
  ctx.drawImage(s.cv, cx - d / 2, cy - d / 2, d, d);
  if (z < 18) return;
  // 表示灯：右上。動いていれば緑、止まっていれば橙（消えかけ）。まわりに光
  const lx = cx + u * 0.34, ly = cy - u * 0.37, r = Math.max(1.5, u * 0.02), on = !!e.busy, col = on ? '80,255,130' : '255,170,60', a = on ? 0.9 + 0.1 * Math.sin(t * 6 + e.x) : 0.45;
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 4); g.addColorStop(0, `rgba(${col},${0.55 * a})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, r * 4, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(lx, ly, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(lx - r * 0.3, ly - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------------
// 配管とコンベヤ
// ---------------------------------------------------------------------
/**
 * 液体と気体は塗装した鋼管（液体は青灰、気体は黄。光は左上から：明るい帯・細い照り返し・下側の影を重ねて円筒に見せる）。
 * マスの継ぎ目にフランジ。固体は、鋼の側板のあいだを流れる黒いゴムのコンベヤ（ローラーの筋が、流れといっしょに動く）
 */
export function realBelts(ctx: CanvasRenderingContext2D, P: Palette, z: number, t: number, speed: number, belts: RealBelt[], pass: (style: (k: BK) => void) => void, far: boolean, veryFar: boolean, sx: (x: number) => number, sy: (y: number) => number) {
  const night = P.name !== 'light', W = { solid: 0.6, liquid: 0.42, gas: 0.36, none: 0.4 };
  const paint = (k: BK) => (k === 'solid' ? (night ? '#101113' : '#1b1c1f') : k === 'liquid' ? (night ? '#27455c' : '#4f7c9c') : k === 'gas' ? (night ? '#7a6412' : '#d8ae24') : night ? '#3a4048' : '#8a949c');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (!veryFar) {
    // 地面に落ちる影：右下へずらして、2 段でやわらかく
    for (const [o, a] of [[0.16, 0.16], [0.09, 0.2]] as [number, number][]) { ctx.save(); ctx.translate(z * o * 0.7, z * o); ctx.strokeStyle = `rgba(0,0,0,${night ? a * 1.4 : a})`; pass((k) => { ctx.lineWidth = z * W[k] + z * 0.06; }); ctx.restore(); }
  }
  // 輪郭 → 塗装の地
  ctx.strokeStyle = night ? '#040506' : '#15181b';
  pass((k) => { ctx.lineWidth = z * W[k] + Math.max(1.2, z * 0.035); });
  pass((k) => { ctx.strokeStyle = k === 'solid' ? (night ? '#4a5058' : '#aab2ba') : paint(k); ctx.lineWidth = z * W[k]; });
  // 固体：鋼の側板の内側に、黒いゴムのベルト
  pass((k) => { if (k === 'solid') { ctx.strokeStyle = paint(k); ctx.lineWidth = z * W[k] * 0.76; } else { ctx.strokeStyle = 'rgba(0,0,0,0)'; ctx.lineWidth = 0.01; } });
  if (!veryFar) {
    // 円筒の陰影（管）：下側の影 → 上側の明るい帯 → 細い照り返し。固体は、ベルトのつや
    ctx.save(); ctx.translate(z * 0.045, z * 0.06);
    pass((k) => { ctx.strokeStyle = k === 'solid' ? 'rgba(0,0,0,0)' : `rgba(0,0,0,${night ? 0.42 : 0.3})`; ctx.lineWidth = k === 'solid' ? 0.01 : z * W[k] * 0.5; });
    ctx.restore();
    ctx.save(); ctx.translate(-z * 0.04, -z * 0.055);
    pass((k) => { ctx.strokeStyle = k === 'solid' ? `rgba(255,255,255,${night ? 0.04 : 0.07})` : `rgba(255,255,255,${night ? 0.16 : 0.34})`; ctx.lineWidth = z * W[k] * (k === 'solid' ? 0.5 : 0.4); });
    ctx.restore();
    ctx.save(); ctx.translate(-z * 0.065, -z * 0.085);
    pass((k) => { ctx.strokeStyle = k === 'solid' ? 'rgba(0,0,0,0)' : `rgba(255,255,255,${night ? 0.4 : 0.8})`; ctx.lineWidth = k === 'solid' ? 0.01 : Math.max(0.8, z * W[k] * 0.09); });
    ctx.restore();
    // 流れ：固体はローラーの筋、管は、流れる向きを示すかすかな光の点線
    ctx.lineCap = 'butt';
    ctx.lineDashOffset = -t * speed * z * 0.5;
    pass((k) => { if (k === 'solid') { ctx.strokeStyle = `rgba(255,255,255,${night ? 0.09 : 0.13})`; ctx.lineWidth = z * W[k] * 0.72; ctx.setLineDash([z * 0.03, z * 0.17]); } else { ctx.strokeStyle = `rgba(255,255,255,${night ? 0.18 : 0.28})`; ctx.lineWidth = Math.max(0.8, z * 0.035); ctx.setLineDash([z * 0.12, z * 0.38]); } });
    ctx.setLineDash([]); ctx.lineCap = 'round';
  }
  if (!far) {
    // フランジ（管）と支柱（コンベヤ）：マスの入口に、流れと直角の金具。ボルトの点
    for (const b of belts) {
      const k = (b.e.st ?? 'none') as BK, cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5), px = cx + b.c.ax * z * 0.98, py = cy + b.c.ay * z * 0.98;
      const ux = b.c.ax * 2, uy = b.c.ay * 2, nx = -uy, ny = ux, hw = z * W[k] * 0.5 + z * 0.045, th = z * (k === 'solid' ? 0.035 : 0.05);
      ctx.beginPath(); ctx.moveTo(px + nx * hw - ux * th, py + ny * hw - uy * th); ctx.lineTo(px + nx * hw + ux * th, py + ny * hw + uy * th); ctx.lineTo(px - nx * hw + ux * th, py - ny * hw + uy * th); ctx.lineTo(px - nx * hw - ux * th, py - ny * hw - uy * th); ctx.closePath();
      const g = ctx.createLinearGradient(px - z * 0.2, py - z * 0.2, px + z * 0.2, py + z * 0.2); g.addColorStop(0, night ? '#8a929a' : '#f2f5f7'); g.addColorStop(0.5, night ? '#4a525a' : '#a4acb4'); g.addColorStop(1, night ? '#1a1e22' : '#5a626a');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = night ? '#040506' : '#15181b'; ctx.lineWidth = Math.max(0.8, z * 0.018); ctx.stroke();
      if (z >= 30 && k !== 'solid') { ctx.fillStyle = night ? '#0a0c0e' : '#2a2e32'; for (const s of [-0.75, -0.25, 0.25, 0.75]) { ctx.beginPath(); ctx.arc(px + nx * hw * s, py + ny * hw * s, Math.max(0.7, z * 0.012), 0, TAU); ctx.fill(); } }
    }
  }
}

// ---------------------------------------------------------------------
// 納品所：出荷棟
// ---------------------------------------------------------------------
/** 納品所：コンクリートの敷地に、波板の屋根の出荷棟。屋根の上に換気扇と赤い航空障害灯、真ん中の表示板に、いまの指令 */
export function hubReal(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World, t: number) {
  const s = z * size, night = P.name !== 'light', cx = px + s / 2, cy = py + s / 2, m = z * 0.08, lw = Math.max(1, z * 0.03);
  ctx.save();
  // 影
  for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(0,0,0,${night ? 0.11 : 0.08})`; rr(ctx, px + m + z * 0.05 + i * z * 0.03, py + m + z * 0.08 + i * z * 0.04, s - m * 2, s - m * 2, z * 0.1 + i * z * 0.02); ctx.fill(); }
  // 敷地：コンクリートに、黄と黒の安全線
  rr(ctx, px + m * 0.3, py + m * 0.3, s - m * 0.6, s - m * 0.6, z * 0.1); ctx.fillStyle = pat(ctx, concrete(night), px, py, 0.6); ctx.fill();
  ctx.save(); rr(ctx, px + m * 0.3, py + m * 0.3, s - m * 0.6, s - m * 0.6, z * 0.1); ctx.clip();
  ctx.lineWidth = z * 0.07; ctx.strokeStyle = night ? '#9a7a10' : '#f2c21a'; ctx.strokeRect(px + m * 0.7, py + m * 0.7, s - m * 1.4, s - m * 1.4);
  ctx.setLineDash([z * 0.12, z * 0.12]); ctx.strokeStyle = '#16181a'; ctx.strokeRect(px + m * 0.7, py + m * 0.7, s - m * 1.4, s - m * 1.4); ctx.setLineDash([]);
  ctx.restore();
  // 屋根：波板（細い縦の山と谷）→ 左上からの光 → 棟の継ぎ目
  const rx = px + m * 1.6, ry = py + m * 1.6, rs = s - m * 3.2;
  rr(ctx, rx, ry, rs, rs, z * 0.08); ctx.fillStyle = pat(ctx, steel(night), rx, ry, 0.8); ctx.fill();
  ctx.save(); rr(ctx, rx, ry, rs, rs, z * 0.08); ctx.clip();
  const rib = Math.max(3, z * 0.11);
  for (let x = rx; x < rx + rs; x += rib) { const g = ctx.createLinearGradient(x, 0, x + rib, 0); g.addColorStop(0, `rgba(255,255,255,${night ? 0.1 : 0.3})`); g.addColorStop(0.5, 'rgba(0,0,0,0.02)'); g.addColorStop(1, `rgba(0,0,0,${night ? 0.4 : 0.26})`); ctx.fillStyle = g; ctx.fillRect(x, ry, rib, rs); }
  const lg = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs); lg.addColorStop(0, `rgba(255,255,255,${night ? 0.1 : 0.3})`); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, `rgba(0,0,0,${night ? 0.5 : 0.32})`); ctx.fillStyle = lg; ctx.fillRect(rx, ry, rs, rs);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(rx, cy - z * 0.02, rs, z * 0.04); ctx.fillStyle = `rgba(255,255,255,${night ? 0.12 : 0.4})`; ctx.fillRect(rx, cy - z * 0.035, rs, z * 0.015);
  // さびの筋：屋根の上の端から垂れる
  for (let i = 0; i < 9; i++) { const x = rx + rnd(i, size, 151) * rs, L = rs * (0.08 + rnd(i, size, 157) * 0.2), g = ctx.createLinearGradient(0, ry, 0, ry + L); g.addColorStop(0, 'rgba(130,70,30,0.4)'); g.addColorStop(1, 'rgba(130,70,30,0)'); ctx.fillStyle = g; ctx.fillRect(x, ry, rib * 0.7, L); }
  ctx.restore();
  rr(ctx, rx, ry, rs, rs, z * 0.08); ctx.strokeStyle = night ? '#05070a' : '#22262a'; ctx.lineWidth = lw * 1.3; ctx.stroke();
  // 換気扇 2 基：羽根が回る。枠に光
  for (const sd of [-1, 1]) {
    const fx = cx + sd * rs * 0.32, fy = ry + rs * 0.16, fr = Math.max(4, rs * 0.075);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(fx + fr * 0.2, fy + fr * 0.25, fr * 1.15, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(fx - fr * 0.3, fy - fr * 0.3, fr * 0.1, fx, fy, fr * 1.1); g.addColorStop(0, night ? '#9aa2aa' : '#ffffff'); g.addColorStop(0.7, night ? '#3a4048' : '#8a929a'); g.addColorStop(1, '#16181a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, fr * 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0c0e10'; ctx.beginPath(); ctx.arc(fx, fy, fr * 0.82, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(t * 5 * sd);
    for (let i = 0; i < 5; i++) { ctx.rotate(TAU / 5); ctx.fillStyle = night ? 'rgba(150,160,170,0.75)' : 'rgba(210,216,222,0.9)'; ctx.beginPath(); ctx.ellipse(fr * 0.42, 0, fr * 0.36, fr * 0.14, 0.4, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // 航空障害灯：右上の角。赤く明滅
  const bl = 0.5 + 0.5 * Math.sin(t * 3), bx = rx + rs * 0.9, by = ry + rs * 0.1, br = Math.max(2, z * 0.06);
  const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br * 6); bg.addColorStop(0, `rgba(255,50,30,${0.6 * bl})`); bg.addColorStop(1, 'rgba(255,50,30,0)'); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br * 6, 0, TAU); ctx.fill();
  ctx.fillStyle = mix('#5a0c06', '#ff4a30', bl); ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.3, 0, TAU); ctx.fill();
  // 表示板：黒い枠の中の、暗いガラス。上から斜めの映りこみ
  const bw = rs * 0.74, bh = rs * 0.36, dx = cx - bw / 2, dy = cy - bh * 0.3;
  rr(ctx, dx - z * 0.04, dy - z * 0.04, bw + z * 0.08, bh + z * 0.08, z * 0.07); ctx.fillStyle = '#0a0c0e'; ctx.fill();
  rr(ctx, dx, dy, bw, bh, z * 0.05); const dg = ctx.createLinearGradient(dx, dy, dx, dy + bh); dg.addColorStop(0, '#16222c'); dg.addColorStop(1, '#070b10'); ctx.fillStyle = dg; ctx.fill();
  const goal = currentGoal(w), gs = goal ? sub(goal.s) : null, plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '満腹' : goal!.also ? `${label(goal!.s)} ほか` : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eaf6ff'; ctx.font = `700 ${Math.min(bh * 0.46, (bw * 0.9) / Math.max(1, tx.length * (plain ? 1 : 0.62)))}px ${FONT}`;
  ctx.fillText(tx, cx, dy + bh * 0.36);
  if (goal) { ctx.fillStyle = '#ffc21a'; ctx.font = `600 ${bh * 0.24}px ${FONT_MONO}`; ctx.fillText(goal.rate ? `毎分 ${Math.round(goalRate(w))} / ${goal.rate}` : `${goalCount(w)} / ${requiredOf(w, goal)}`, cx, dy + bh * 0.76); }
  ctx.textBaseline = 'alphabetic';
  ctx.save(); rr(ctx, dx, dy, bw, bh, z * 0.05); ctx.clip();
  const sg = ctx.createLinearGradient(dx, dy, dx + bw * 0.5, dy + bh); sg.addColorStop(0, 'rgba(255,255,255,0.16)'); sg.addColorStop(0.35, 'rgba(255,255,255,0.03)'); sg.addColorStop(0.36, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(dx, dy, bw, bh);
  ctx.restore();
  ctx.restore();
}
/** 資源地の名札：地面に埋めた金属の銘板（刻印のような文字） */
export function realZoneLabel(ctx: CanvasRenderingContext2D, P: Palette, name: string, sub2: string, x: number, y: number, z: number) {
  const night = P.name !== 'light', fs = Math.max(11, z * 0.34), fs2 = Math.max(9, z * 0.2);
  ctx.save();
  ctx.font = `700 ${fs}px ${FONT}`; const w1 = ctx.measureText(name).width;
  let w2 = 0; if (sub2) { ctx.font = `500 ${fs2}px ${FONT}`; w2 = ctx.measureText(sub2).width; }
  const bw = Math.max(w1, w2) + fs * 1.4, bh = sub2 ? fs * 1.3 + fs2 * 1.4 : fs * 1.7, bx = x - bw / 2, by = y - fs * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, bx + 2, by + 3, bw, bh, 4); ctx.fill();
  rr(ctx, bx, by, bw, bh, 4); ctx.fillStyle = pat(ctx, steel(night), bx, by, 0.6); ctx.fill();
  const g = ctx.createLinearGradient(bx, by, bx, by + bh); g.addColorStop(0, `rgba(255,255,255,${night ? 0.12 : 0.35})`); g.addColorStop(1, `rgba(0,0,0,${night ? 0.45 : 0.25})`); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = night ? '#05070a' : '#22262a'; ctx.lineWidth = 1.2; ctx.stroke();
  for (const [ix, iy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.fillStyle = '#16181a'; ctx.beginPath(); ctx.arc(bx + 5 + ix * (bw - 10), by + 5 + iy * (bh - 10), 1.5, 0, TAU); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // 刻印：下に明るい線、上に暗い文字
  ctx.font = `700 ${fs}px ${FONT}`; ctx.fillStyle = `rgba(255,255,255,${night ? 0.2 : 0.6})`; ctx.fillText(name, x, by + fs * 1.12 + 1); ctx.fillStyle = night ? '#e8edf2' : '#14181c'; ctx.fillText(name, x, by + fs * 1.12);
  if (sub2) { ctx.font = `500 ${fs2}px ${FONT}`; ctx.fillStyle = night ? '#aab4be' : '#3a4248'; ctx.fillText(sub2, x, by + fs * 1.3 + fs2 * 1.05); }
  ctx.restore();
}
void rgbOf;
