/**
 * 幻想スキン（天空の庭・星の海）：本物らしさより、絵の華やかさ。重さは気にしない（毎コマ、グラデーションと光を惜しまず描く）。
 * - 天空の庭（明）：空に浮かぶ花園。水彩のにじむ草地、花、雲の海、金の縁の水晶、虹と花びら
 * - 星の海（暗）：星雲と星座の地、光る水晶の原、オーロラ、流れ星、蛍のような光の粒
 * - ベルトは「光の川」：金の岸、流れる星屑。装置は宝石の台座：切子の面、金の二重の縁、回る紋章の輪、四隅の宝玉
 * - 納品所は「世界の水晶」：虹色の大水晶と、逆に回る魔法陣、まわりを巡る元素の宝玉
 * 守ること：装置の窓の中（反応の様子・物質の色）は、ほかのスキンと同じ絵（覚える中身は飾らない）。文字は読める濃さを保つ
 */
import { ELEMENTS } from '../content/elements';
import { ZONES, isSea, zoneAt, type Zone } from '../content/map';
import { label, sub } from '../content/substances';
import { currentGoal, fedTier, goalCount, goalRate, requiredOf, type Ent, type World } from '../engine/world';
import { mix, MYTH_GOLD, MYTH_GOLD_DARK, MYTH_RAINBOW, type Palette } from './theme';
import { drawElement } from './token';

const TAU = Math.PI * 2;
const FONT_SERIF = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
const hash = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
const rgbOf = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
/** 時間でめぐる虹の色（h は 0〜1 のずれ） */
const hue = (t: number, h = 0, s = 90, l = 68, a = 1) => `hsla(${(((t * 40 + h * 360) % 360) + 360) % 360},${s}%,${l}%,${a})`;

// ---- 1 コマごとの状態 ----
let G: CanvasRenderingContext2D | null = null, calm = false;
/** 毎コマのはじめに呼ぶ。glow：光の層（高画質のときだけ）、calmNow：動きを減らす設定か */
export function mythFrame(glow: CanvasRenderingContext2D | null, calmNow: boolean) { G = glow; calm = calmNow; }

/** 4 つの光の先を持つ星（きらめき） */
function star4(c: CanvasRenderingContext2D, x: number, y: number, r: number, thin = 0.22) {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = i % 2 ? r * thin : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
/** 八角形（宝石の台座） */
function oct(c: CanvasRenderingContext2D, cx: number, cy: number, half: number, cut: number) {
  c.beginPath();
  c.moveTo(cx - half + cut, cy - half); c.lineTo(cx + half - cut, cy - half); c.lineTo(cx + half, cy - half + cut); c.lineTo(cx + half, cy + half - cut);
  c.lineTo(cx + half - cut, cy + half); c.lineTo(cx - half + cut, cy + half); c.lineTo(cx - half, cy + half - cut); c.lineTo(cx - half, cy - half + cut);
  c.closePath();
}
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// =====================================================================
// 地面
// =====================================================================
/** 決まった乱数（区画ごと） */
function rngOf(cx: number, cy: number, salt: number) { let s = ((cx * 73856093) ^ (cy * 19349663) ^ (salt * 83492791)) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function buildChunkMyth(P: Palette, cx: number, cy: number, TS: number, CH: number): HTMLCanvasElement {
  const SIZE = TS * CH, cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, light = P.name === 'light', r = rngOf(cx, cy, 7);
  const X = (tx: number) => (tx - ox) * TS, Y = (ty: number) => (ty - oy) * TS;
  g.fillStyle = P.paper; g.fillRect(0, 0, SIZE, SIZE);

  // にじみ：区画の内側で消える丸いぼかし（継ぎ目が出ない）。明は水彩の花の色、暗は星雲
  const washes = light ? ['255,196,226', '196,255,226', '216,204,255', '255,238,186', '186,226,255'] : ['120,80,255', '255,70,170', '50,210,255', '90,60,200'];
  for (let i = 0; i < (light ? 7 : 6); i++) {
    const rad = 50 + r() * 90, x = rad + r() * (SIZE - rad * 2), y = rad + r() * (SIZE - rad * 2), col = washes[Math.floor(r() * washes.length)];
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${col},${light ? 0.42 : 0.1 + r() * 0.07})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  if (light) {
    // 草のひと筆と、小さな花（5 枚の花びら）
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * SIZE, y = r() * SIZE, h = 3 + r() * 4;
      g.strokeStyle = `rgba(${r() < 0.5 ? '96,190,150' : '120,170,230'},${0.25 + r() * 0.2})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 1.5, y - h * 0.6, x + (r() - 0.5) * 3, y - h); g.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const x = 8 + r() * (SIZE - 16), y = 8 + r() * (SIZE - 16), pr = 1.6 + r() * 1.6, col = MYTH_RAINBOW[Math.floor(r() * 6)], rot = r() * TAU;
      g.fillStyle = col; g.globalAlpha = 0.75;
      for (let k = 0; k < 5; k++) { const a = rot + (k / 5) * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * pr, y + Math.sin(a) * pr, pr * 0.8, pr * 0.5, a, 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = '#fff6c9'; g.beginPath(); g.arc(x, y, pr * 0.45, 0, TAU); g.fill();
    }
    // きらめき
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 12; i++) { star4(g, r() * SIZE, r() * SIZE, 1.5 + r() * 2.5); g.fill(); }
  } else {
    // 星：小さな点、ときどき十字に光る星。色は白・水色・桃・金
    const cols = ['255,255,255', '170,220,255', '255,190,230', '255,230,170'];
    for (let i = 0; i < 170; i++) {
      const x = r() * SIZE, y = r() * SIZE, a = 0.25 + r() * 0.6, s = r() < 0.86 ? 1 : 1.6;
      g.fillStyle = `rgba(${cols[Math.floor(r() * 4)]},${a})`; g.fillRect(x, y, s, s);
    }
    // 星座：近くの星を細い線でつなぐ
    for (let k = 0; k < 2; k++) {
      let x = 40 + r() * (SIZE - 80), y = 40 + r() * (SIZE - 80);
      g.strokeStyle = 'rgba(190,180,255,0.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
      const pts: [number, number][] = [[x, y]];
      for (let i = 0; i < 3 + Math.floor(r() * 3); i++) { x = Math.max(8, Math.min(SIZE - 8, x + (r() - 0.5) * 110)); y = Math.max(8, Math.min(SIZE - 8, y + (r() - 0.5) * 110)); g.lineTo(x, y); pts.push([x, y]); }
      g.stroke();
      for (const [px, py] of pts) { g.fillStyle = 'rgba(255,255,255,0.9)'; star4(g, px, py, 2.6 + r() * 2); g.fill(); }
    }
  }

  // マスの目印：角の小さな菱形（線は引かない。8 マスごとは金）
  for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
    const big = (((ox + i) % 8) + 8) % 8 === 0 && (((oy + j) % 8) + 8) % 8 === 0, s = big ? 3 : 1.4;
    g.fillStyle = big ? (light ? 'rgba(200,150,40,0.55)' : 'rgba(255,220,140,0.4)') : light ? 'rgba(90,80,190,0.2)' : 'rgba(170,160,255,0.16)';
    g.beginPath(); g.moveTo(i * TS, j * TS - s); g.lineTo(i * TS + s, j * TS); g.lineTo(i * TS, j * TS + s); g.lineTo(i * TS - s, j * TS); g.closePath(); g.fill();
  }

  // 資源地：光る水晶の原。海は雲の海（明）・星の淵（暗）
  const tiles = new Map<Zone, [number, number, number, number][]>();
  for (let y = oy - 1; y <= oy + CH; y++) for (let x = ox - 1; x <= ox + CH; x++) {
    const zn = zoneAt(x, y);
    if (!zn) continue;
    if (!tiles.has(zn)) tiles.set(zn, []);
    tiles.get(zn)!.push([x + 0.5 + (hash(x, y) - 0.5) * 0.3, y + 0.5 + (hash(y, x) - 0.5) * 0.3, x, y]);
  }
  const blobs = (list: [number, number, number, number][], rad: number) => { g.beginPath(); for (const [x, y] of list) { g.moveTo(X(x) + rad * TS, Y(y)); g.arc(X(x), Y(y), rad * TS, 0, TAU); } g.fill(); };
  for (const [zn, list] of tiles) {
    const sea = isSea(zn), tint = ZONES[zn].tint[1];
    // 金の縁（海は白い縁）
    g.fillStyle = sea ? (light ? '#ffffff' : '#3b2f8a') : light ? MYTH_GOLD_DARK : mix(tint, '#ffffff', 0.25);
    blobs(list, 0.88);
    g.fillStyle = sea ? (light ? '#9fd2ff' : '#04020f') : light ? MYTH_GOLD : mix(P.paper, tint, 0.75);
    blobs(list, 0.83);
    g.fillStyle = sea ? (light ? '#bfe3ff' : '#070418') : mix(P.paper, tint, light ? 0.34 : 0.3);
    blobs(list, 0.78);
    for (const [x, y, tx, ty] of list) {
      const h0 = hash(tx * 3.1, ty * 7.7), px = X(x), py = Y(y);
      if (sea) {
        if (light) {
          // 雲の海：白い雲のかたまり
          if (h0 < 0.55) { g.fillStyle = `rgba(255,255,255,${0.55 + h0 * 0.5})`; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(px + (k - 1) * TS * 0.26, py + (k % 2) * TS * 0.1, TS * (0.24 + 0.1 * hash(tx + k, ty)), TS * 0.16, 0, 0, TAU); g.fill(); } }
        } else {
          // 星の淵：青緑の光のもやと、こまかい星
          const gr = g.createRadialGradient(px, py, 0, px, py, TS * 0.8);
          gr.addColorStop(0, `rgba(60,220,255,${0.05 + h0 * 0.1})`); gr.addColorStop(1, 'rgba(60,220,255,0)');
          g.fillStyle = gr; g.fillRect(px - TS, py - TS, TS * 2, TS * 2);
          g.fillStyle = `rgba(200,240,255,${0.4 + h0 * 0.5})`;
          for (let k = 0; k < 3; k++) g.fillRect(px + (hash(tx + k * 5, ty) - 0.5) * TS, py + (hash(tx, ty + k * 3) - 0.5) * TS, 1, 1);
        }
        continue;
      }
      // 明るい芯
      const gr = g.createRadialGradient(px, py, 0, px, py, TS * 0.7);
      gr.addColorStop(0, light ? 'rgba(255,255,255,0.5)' : `rgba(${rgbOf(tint)},0.22)`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(px - TS, py - TS, TS * 2, TS * 2);
      // 水晶のかけら：切子の菱形。上の面は明るく、下の面は濃く
      if (h0 < 0.62) {
        const n = h0 < 0.2 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const sx = px + (hash(tx + k, ty * 2) - 0.5) * TS * 0.5, sy = py + (hash(tx * 2, ty + k) - 0.5) * TS * 0.4, hh = TS * (0.28 + 0.24 * hash(tx + k * 9, ty)), ww = hh * 0.42, lean = (hash(tx, ty + k * 4) - 0.5) * ww;
          g.beginPath(); g.moveTo(sx + lean, sy - hh); g.lineTo(sx + ww, sy - hh * 0.3); g.lineTo(sx, sy + hh * 0.25); g.lineTo(sx - ww, sy - hh * 0.3); g.closePath();
          g.fillStyle = mix(tint, light ? '#ffffff' : '#000000', light ? 0.15 : 0.25); g.fill();
          g.beginPath(); g.moveTo(sx + lean, sy - hh); g.lineTo(sx + ww, sy - hh * 0.3); g.lineTo(sx, sy - hh * 0.15); g.closePath();
          g.fillStyle = mix(tint, '#ffffff', 0.6); g.fill();
          g.beginPath(); g.moveTo(sx + lean, sy - hh); g.lineTo(sx + ww, sy - hh * 0.3); g.lineTo(sx, sy + hh * 0.25); g.lineTo(sx - ww, sy - hh * 0.3); g.closePath();
          g.strokeStyle = light ? MYTH_GOLD_DARK : mix(tint, '#ffffff', 0.5); g.lineWidth = 0.8; g.stroke();
        }
      }
      if (h0 > 0.8) { g.fillStyle = 'rgba(255,255,255,0.9)'; star4(g, px + TS * 0.2, py - TS * 0.2, 2.2); g.fill(); }
    }
  }
  return cv;
}

// =====================================================================
// 光の川（ベルト）
// =====================================================================
type BK = 'solid' | 'liquid' | 'gas' | 'none';
export interface MythBelt { e: Ent; c: { ax: number; ay: number; bx: number; by: number } }
/**
 * 金の岸のあいだを、物の状態の色の光が流れる。上を、白い星屑と、時間でめぐる虹色の粒が、違う速さで流れる。
 * 川がマスをまたぐ所に、金の小さな星
 */
export function mythBelts(ctx: CanvasRenderingContext2D, P: Palette, z: number, t: number, speed: number, belts: MythBelt[], pass: (style: (k: BK) => void) => void, far: boolean, veryFar: boolean, sx: (x: number) => number, sy: (y: number) => number) {
  const light = P.name === 'light', W = { solid: 0.58, liquid: 0.48, gas: 0.4, none: 0.46 }, tt = calm ? 0 : t;
  const lw = (k: number) => Math.max(1, z * k);
  ctx.lineCap = 'round';
  // 岸：濃い金 → 金 → 明るい線
  ctx.strokeStyle = light ? MYTH_GOLD_DARK : '#05030f';
  pass((k) => { ctx.lineWidth = z * W[k] + lw(0.11); });
  ctx.strokeStyle = MYTH_GOLD;
  pass((k) => { ctx.lineWidth = z * W[k] + lw(0.05); });
  // 流れ：状態の色。芯は明るく
  pass((k) => { ctx.strokeStyle = light ? mix(P.line[k], '#ffffff', 0.15) : mix(P.line[k], '#000000', 0.25); ctx.lineWidth = z * W[k] - lw(0.02); });
  pass((k) => { ctx.strokeStyle = light ? 'rgba(255,255,255,0.6)' : `rgba(${rgbOf(mix(P.line[k], '#b8a8ff', 0.6))},0.55)`; ctx.lineWidth = z * W[k] * 0.42; });
  if (!veryFar) {
    if (!light) ctx.globalCompositeOperation = 'lighter';
    // 虹色の粒（ゆっくり）と、白い星屑（速く）
    ctx.lineDashOffset = -tt * speed * z * 0.5;
    pass((k) => { ctx.strokeStyle = hue(t, k === 'solid' ? 0.08 : k === 'liquid' ? 0.55 : 0.75, 95, light ? 58 : 70, light ? 0.85 : 0.9); ctx.lineWidth = lw(0.07); ctx.setLineDash([z * 0.01, z * 0.24]); });
    ctx.lineDashOffset = -tt * speed * z * 0.85 + z * 0.13;
    pass(() => { ctx.strokeStyle = light ? 'rgba(255,255,255,0.95)' : 'rgba(235,240,255,0.85)'; ctx.lineWidth = lw(0.035); ctx.setLineDash([z * 0.09, z * 0.41]); });
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!far) {
    // マスの継ぎ目の金の星
    for (const b of belts) {
      const gx = sx(b.e.x + 0.5) + b.c.ax * z * 0.96, gy = sy(b.e.y + 0.5) + b.c.ay * z * 0.96;
      star4(ctx, gx, gy, z * 0.13, 0.36); ctx.fillStyle = MYTH_GOLD; ctx.fill();
      ctx.strokeStyle = light ? MYTH_GOLD_DARK : '#05030f'; ctx.lineWidth = Math.max(0.8, z * 0.02); ctx.stroke();
    }
  }
  if (G && belts.length) {
    // 光の層：川がうっすら虹色に光る
    G.lineCap = 'round';
    G.strokeStyle = hue(t, 0.6, 90, 65, light ? 0.1 : 0.28); G.lineWidth = z * 0.5;
    G.beginPath();
    for (const b of belts) { const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5); G.moveTo(cx + b.c.ax * z, cy + b.c.ay * z); G.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z); }
    G.stroke();
  }
}

// =====================================================================
// 装置の台座
// =====================================================================
/**
 * 宝石の台座：下に光の輪と回る紋章、濃い金の厚み、切子の八角形、金の二重の縁、四隅の宝玉（機種の色。動いている間は光る）、
 * まわりを巡る光の粒。真ん中は、窓の中の絵が読めるように、台の色の板
 */
export function bodyMyth(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number, color: string, line: number) {
  const light = P.name === 'light', busy = !!e.busy, tt = calm ? 0 : t, ph = e.x * 1.7 + e.y * 2.3, half = u * 0.43, cut = u * 0.13;
  const pulse = busy ? 0.6 + 0.4 * Math.sin(tt * 3 + ph) : 0.25;
  // 下の光：動いている装置は、機種の色と金の光に包まれる
  if (z >= 14) {
    const gr = ctx.createRadialGradient(cx, cy + u * 0.05, u * 0.2, cx, cy + u * 0.05, u * 0.72);
    gr.addColorStop(0, `rgba(${rgbOf(color)},${(light ? 0.22 : 0.4) * pulse})`); gr.addColorStop(0.6, `rgba(${P.glow},${(light ? 0.08 : 0.16) * pulse})`); gr.addColorStop(1, `rgba(${P.glow},0)`);
    ctx.fillStyle = gr; ctx.fillRect(cx - u * 0.75, cy - u * 0.7, u * 1.5, u * 1.5);
  }
  // 回る紋章の輪：点線の輪と、6 つの小さな星
  if (z >= 22) {
    const R = u * 0.56, rot = (busy ? tt * 0.5 : 0) + ph;
    ctx.save();
    ctx.strokeStyle = light ? `rgba(160,110,20,${busy ? 0.7 : 0.3})` : `rgba(${P.glow},${busy ? 0.75 : 0.3})`;
    ctx.lineWidth = Math.max(1, u * 0.012);
    ctx.setLineDash([u * 0.05, u * 0.035]); ctx.lineDashOffset = -rot * R;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = busy ? hue(t, ph * 0.1, 95, light ? 55 : 72) : light ? 'rgba(160,110,20,0.4)' : `rgba(${P.glow},0.4)`;
    for (let i = 0; i < 6; i++) { const a = -rot * 0.6 + (i / 6) * TAU; star4(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, u * 0.035, 0.3); ctx.fill(); }
    ctx.restore();
  }
  // 浮いている影と、濃い金の厚み
  const th = (u / Math.max(1, Math.round(u / z))) * 0.12;
  ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(cx + th * 0.5, cy + half + th * 1.6, half * 0.92, half * 0.22, 0, 0, TAU); ctx.fill();
  oct(ctx, cx, cy + th, half, cut); ctx.fillStyle = mix(MYTH_GOLD_DARK, '#1a0f02', 0.3); ctx.fill(); ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = line; ctx.stroke();
  // 切子の八角形：斜めの光のグラデーション
  const g1 = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
  g1.addColorStop(0, light ? '#ffffff' : mix(P.plate, '#8f7dff', 0.5)); g1.addColorStop(0.5, mix(P.plate, color, light ? 0.22 : 0.3)); g1.addColorStop(1, mix(P.plate, color, light ? 0.5 : 0.12));
  oct(ctx, cx, cy, half, cut); ctx.fillStyle = g1; ctx.fill();
  if (z >= 20) {
    // 面：角から内の板へ向かう稜線と、交互に明るい面
    const inh = u * 0.34, inc = u * 0.08;
    const O: [number, number][] = [[-half + cut, -half], [half - cut, -half], [half, -half + cut], [half, half - cut], [half - cut, half], [-half + cut, half], [-half, half - cut], [-half, -half + cut]];
    const I: [number, number][] = [[-inh + inc, -inh], [inh - inc, -inh], [inh, -inh + inc], [inh, inh - inc], [inh - inc, inh], [-inh + inc, inh], [-inh, inh - inc], [-inh, -inh + inc]];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      ctx.beginPath(); ctx.moveTo(cx + O[i][0], cy + O[i][1]); ctx.lineTo(cx + O[j][0], cy + O[j][1]); ctx.lineTo(cx + I[j][0], cy + I[j][1]); ctx.lineTo(cx + I[i][0], cy + I[i][1]); ctx.closePath();
      // 上と左の面は明るく、下と右の面は濃く
      const up = i === 7 || i === 0 || i === 6, down = i === 3 || i === 4 || i === 2;
      ctx.fillStyle = up ? `rgba(255,255,255,${light ? 0.55 : 0.2})` : down ? `rgba(${light ? '70,50,140' : '0,0,10'},${light ? 0.16 : 0.34})` : 'rgba(255,255,255,0.06)';
      ctx.fill();
    }
    ctx.strokeStyle = light ? 'rgba(138,95,23,0.45)' : 'rgba(200,190,255,0.22)'; ctx.lineWidth = Math.max(0.6, line * 0.3);
    ctx.beginPath(); for (let i = 0; i < 8; i++) { ctx.moveTo(cx + O[i][0], cy + O[i][1]); ctx.lineTo(cx + I[i][0], cy + I[i][1]); } ctx.stroke();
  }
  // 金の二重の縁
  oct(ctx, cx, cy, half, cut); ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = line * 1.9; ctx.stroke();
  oct(ctx, cx, cy, half, cut); ctx.strokeStyle = MYTH_GOLD; ctx.lineWidth = line * 1.05; ctx.stroke();
  oct(ctx, cx, cy, half - line * 0.2, cut); ctx.strokeStyle = 'rgba(255,248,214,0.8)'; ctx.lineWidth = Math.max(0.6, line * 0.25); ctx.stroke();
  // 真ん中の板（窓の中の絵の地）
  oct(ctx, cx, cy, u * 0.34, u * 0.08); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = light ? MYTH_GOLD_DARK : 'rgba(200,190,255,0.5)'; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
  // 四隅の宝玉
  if (z >= 20) for (const [gx, gy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const jx = cx + gx * (half - cut * 0.5), jy = cy + gy * (half - cut * 0.5), jr = Math.max(1.8, u * 0.04);
    if (busy) { ctx.fillStyle = `rgba(${rgbOf(color)},${0.35 * pulse})`; ctx.beginPath(); ctx.arc(jx, jy, jr * 2.3, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(jx, jy, jr, 0, TAU); ctx.fillStyle = busy ? mix(color, '#ffffff', 0.25 + 0.3 * pulse) : mix(color, P.plate, 0.45); ctx.fill();
    ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(jx - jr * 0.3, jy - jr * 0.3, jr * 0.3, 0, TAU); ctx.fill();
  }
  // 巡る光の粒
  if (busy && z >= 26 && !calm) {
    for (let i = 0; i < 3; i++) {
      const a = t * (1.1 + i * 0.25) + ph + i * 2.1, R = u * (0.5 + 0.04 * Math.sin(t * 2 + i));
      ctx.fillStyle = hue(t, i / 3 + ph * 0.05, 95, light ? 58 : 75); star4(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.86, u * 0.04, 0.3); ctx.fill();
    }
  }
  if (G && busy) {
    const gr = G.createRadialGradient(cx, cy, 0, cx, cy, u * 0.8);
    // 窓の中（覚える中身）は照らさない：輪の形の光
    gr.addColorStop(0, `rgba(${P.glow},0)`); gr.addColorStop(0.5, `rgba(${P.glow},0)`); gr.addColorStop(0.68, `rgba(${P.glow},${(light ? 0.1 : 0.22) * pulse})`); gr.addColorStop(1, `rgba(${P.glow},0)`);
    G.fillStyle = gr; G.fillRect(cx - u * 0.8, cy - u * 0.8, u * 1.6, u * 1.6);
  }
}

// =====================================================================
// 納品所：世界の水晶
// =====================================================================
/**
 * 逆に回る 2 つの魔法陣（六芒星と、紋章の刻み）の上に、虹色の大水晶が浮かぶ。大きくなるほど、まわりの小さな水晶と光の柱が増える。
 * 元素の宝玉が輪になって巡り、飲み込んだ元素は灯る。真ん中に、いま欲しがっているものと数
 */
export function hubMyth(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World, t: number) {
  const s = z * size, lv = Math.max(0, [2, 4, 6, 8].indexOf(size)), light = P.name === 'light', tt = calm ? 0 : t;
  const cx = px + s / 2, cy = py + s / 2, line = Math.max(1.4, z * 0.045), R = s * 0.5, pulse = 0.5 + 0.5 * Math.sin(tt * 2.2);
  const gold = MYTH_GOLD, dark = light ? '#4a3208' : '#05030f';
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 地面の光
  const base = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.35);
  base.addColorStop(0, `rgba(${P.glow},${light ? 0.4 : 0.5})`); base.addColorStop(0.7, `rgba(${light ? '255,150,210' : '90,220,255'},0.12)`); base.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = base; ctx.fillRect(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8);
  // 台：丸い石の盤（金の縁）
  ctx.beginPath(); ctx.arc(cx, cy + z * 0.1, R * 0.98, 0, TAU); ctx.fillStyle = mix(MYTH_GOLD_DARK, '#140a02', 0.4); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.98, 0, TAU);
  const disk = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
  disk.addColorStop(0, light ? '#ffffff' : '#34277a'); disk.addColorStop(1, light ? '#e9dcff' : '#120b33');
  ctx.fillStyle = disk; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = line * 2.2; ctx.stroke(); ctx.strokeStyle = gold; ctx.lineWidth = line * 1.2; ctx.stroke();
  // 魔法陣：外の輪（紋章の刻み、時計回り）、内の輪（六芒星、逆回り）
  const ring = (rad: number, rot: number, ticks: number, col: string) => {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, line * 0.55);
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.9, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < ticks; i++) {
      const a = rot + (i / ticks) * TAU, r0 = rad * 0.9, r1 = rad, k = i % 3;
      // 刻みは 3 種類：線、くの字、点
      if (k === 0) { ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
      else if (k === 1) { const am = a + 0.03; ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(am) * (r0 + r1) / 2, cy + Math.sin(am) * (r0 + r1) / 2); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
      else { const rm = (r0 + r1) / 2; ctx.moveTo(cx + Math.cos(a) * rm + 1, cy + Math.sin(a) * rm); ctx.arc(cx + Math.cos(a) * rm, cy + Math.sin(a) * rm, 1, 0, TAU); }
    }
    ctx.stroke();
  };
  const lineCol = light ? 'rgba(138,95,23,0.75)' : `rgba(${P.glow},0.8)`;
  ring(R * 0.9, tt * 0.25, 24 + lv * 12, lineCol);
  const hexR = R * 0.74, rot2 = -tt * 0.18;
  ctx.strokeStyle = light ? 'rgba(217,58,120,0.6)' : 'rgba(110,243,255,0.7)'; ctx.lineWidth = Math.max(1, line * 0.6);
  for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = rot2 + k * (TAU / 6) + (i / 3) * TAU; ctx.lineTo(cx + Math.cos(a) * hexR, cy + Math.sin(a) * hexR); } ctx.closePath(); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy, hexR, 0, TAU); ctx.stroke();

  // 元素の宝玉：輪になって巡る。飲み込んだ元素は灯り、段が上がると金の縁
  const els = ELEMENTS, ringR = R * 0.82, er = Math.max(2.5, Math.min(z * 0.17, (ringR * TAU) / els.length / 2.7));
  if (z >= 16 && lv >= 1) els.forEach((el, i) => {
    const a = (i / els.length) * TAU - Math.PI / 2 + tt * 0.06, ex = cx + Math.cos(a) * ringR, ey = cy + Math.sin(a) * ringR, tier = fedTier(w, el.sym);
    if (tier) { ctx.fillStyle = `rgba(${P.glow},${0.25 + 0.1 * tier})`; ctx.beginPath(); ctx.arc(ex, ey, er * 1.9, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(ex, ey, er * 1.25, 0, TAU); ctx.fillStyle = tier ? '#fffdf4' : light ? '#cfc6ea' : '#0c0826'; ctx.fill();
    ctx.strokeStyle = tier >= 3 ? gold : tier ? dark : light ? '#9b92c4' : '#3a2f7a'; ctx.lineWidth = tier >= 2 ? line * 0.9 : line * 0.5; ctx.stroke();
    ctx.globalAlpha = tier ? 1 : 0.3; drawElement(ctx, el.sym, ex, ey, er * 0.8); ctx.globalAlpha = 1;
  });

  // 光の柱（段 2 から）：四方に立つ細い水晶
  const shard = (x: number, y: number, hh: number, ww: number, h0: number, lean = 0) => {
    ctx.beginPath(); ctx.moveTo(x + lean, y - hh); ctx.lineTo(x + ww, y - hh * 0.25); ctx.lineTo(x, y + hh * 0.3); ctx.lineTo(x - ww, y - hh * 0.25); ctx.closePath();
    const gr = ctx.createLinearGradient(x - ww, y - hh, x + ww, y + hh * 0.3);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, hue(tt * 0.6, h0, 90, light ? 70 : 62)); gr.addColorStop(1, hue(tt * 0.6, h0 + 0.2, 85, light ? 52 : 36));
    ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = line * 0.8; ctx.stroke();
    // 稜線と照り
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.8, line * 0.35);
    ctx.beginPath(); ctx.moveTo(x + lean, y - hh); ctx.lineTo(x, y + hh * 0.3); ctx.moveTo(x - ww, y - hh * 0.25); ctx.lineTo(x, y - hh * 0.05); ctx.lineTo(x + ww, y - hh * 0.25); ctx.stroke();
  };
  if (lv >= 1) {
    const n = 2 + lv * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.PI / n, d = R * 0.56, bob = calm ? 0 : Math.sin(t * 1.6 + i * 1.3) * z * 0.05;
      shard(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9 + bob, z * (0.42 + 0.06 * lv), z * 0.15, i / n, Math.cos(a) * z * 0.05);
    }
  }
  // 大水晶：ゆっくり上下に浮く
  const bob = calm ? 0 : Math.sin(t * 1.3) * z * 0.06, CH2 = Math.min(R * 0.74, z * (0.75 + lv * 0.5)), CW = CH2 * 0.5, ky = cy - CH2 * 0.12 + bob;
  ctx.fillStyle = `rgba(${light ? '70,56,150' : '0,0,0'},0.28)`; ctx.beginPath(); ctx.ellipse(cx, cy + CH2 * 0.42, CW * 0.9, CW * 0.26, 0, 0, TAU); ctx.fill();
  // 後光
  const halo = ctx.createRadialGradient(cx, ky - CH2 * 0.3, 0, cx, ky - CH2 * 0.3, CH2 * 1.25);
  halo.addColorStop(0, `rgba(255,255,255,${0.5 + 0.25 * pulse})`); halo.addColorStop(0.4, hue(tt, 0, 95, 70, 0.22 + 0.1 * pulse)); halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo; ctx.fillRect(cx - CH2 * 1.3, ky - CH2 * 1.6, CH2 * 2.6, CH2 * 2.6);
  // 本体：虹のめぐる面
  const top: [number, number] = [cx, ky - CH2], bot: [number, number] = [cx, ky + CH2 * 0.42], L: [number, number] = [cx - CW, ky - CH2 * 0.28], Rt: [number, number] = [cx + CW, ky - CH2 * 0.28], mid: [number, number] = [cx - CW * 0.12, ky - CH2 * 0.1];
  const face = (a: [number, number], b: [number, number], c: [number, number], h0: number, l: number) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fillStyle = hue(tt * 0.8, h0, 92, l); ctx.fill(); };
  face(top, L, mid, 0.0, light ? 82 : 74); face(top, mid, Rt, 0.14, light ? 70 : 58); face(L, bot, mid, 0.3, light ? 62 : 46); face(mid, bot, Rt, 0.5, light ? 54 : 34);
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(Rt[0], Rt[1]); ctx.lineTo(bot[0], bot[1]); ctx.lineTo(L[0], L[1]); ctx.closePath();
  ctx.strokeStyle = dark; ctx.lineWidth = line * 1.3; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(0.8, line * 0.4);
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineTo(bot[0], bot[1]); ctx.moveTo(L[0], L[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineTo(Rt[0], Rt[1]); ctx.stroke();
  // 照り
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; star4(ctx, cx - CW * 0.35, ky - CH2 * 0.55, CH2 * (0.1 + 0.04 * pulse)); ctx.fill();
  // 巡る光の輪（傾いた楕円）と星
  if (!calm) for (let k = 0; k < 2 + lv; k++) {
    const a = t * (0.9 + k * 0.2) + k * 1.7, rx = CW * (1.5 + k * 0.25), ry = rx * 0.34, ox = cx + Math.cos(a) * rx, oy = ky - CH2 * 0.25 + Math.sin(a) * ry;
    ctx.fillStyle = hue(t, k / 5, 95, light ? 60 : 78); star4(ctx, ox, oy, z * 0.09, 0.3); ctx.fill();
  }

  // いま欲しがっているもの（水晶の下の、金の縁の札）
  const u = Math.min(s / 2, Math.max(z * 1.2, R * 0.9));
  const goal = currentGoal(w), gs = goal ? sub(goal.s) : null, plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '満ちた' : goal!.also ? `${label(goal!.s)} ほか` : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  const ct = goal ? (goal.rate ? `毎分 ${Math.round(goalRate(w))} / ${goal.rate}` : `${goalCount(w)} / ${requiredOf(w, goal)}`) : '';
  const fs = u * Math.min(0.34, 1.0 / Math.max(1, tx.length * (plain ? 1 : 0.62))), fs2 = u * 0.17, ty = cy + CH2 * 0.42 + fs * 0.75;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${fs}px ${plain ? FONT_SERIF : FONT_MONO}`;
  const bw = Math.max(ctx.measureText(tx).width, ct ? ct.length * fs2 * 0.62 : 0) + fs * 0.9, bh = fs * 1.25 + (ct ? fs2 * 1.3 : 0);
  rr(ctx, cx - bw / 2, ty - fs * 0.7, bw, bh, fs * 0.3); ctx.fillStyle = light ? 'rgba(255,253,247,0.94)' : 'rgba(14,9,40,0.92)'; ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = line * 1.5; ctx.stroke(); ctx.strokeStyle = gold; ctx.lineWidth = line * 0.8; ctx.stroke();
  ctx.fillStyle = P.ink; ctx.fillText(tx, cx, ty);
  if (ct) { ctx.font = `600 ${fs2}px ${FONT_MONO}`; ctx.fillStyle = light ? '#8a5f17' : gold; ctx.fillText(ct, cx, ty + fs * 0.62 + fs2 * 0.55); }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
/** 納品所の光（光の層）：虹のめぐる後光と、回る光の弧 */
export function mythHubGlow(Gc: CanvasRenderingContext2D, P: Palette, hx: number, hy: number, size: number, z: number, t: number) {
  const light = P.name === 'light', tt = calm ? 0 : t, R = size * z * 0.5;
  const g = Gc.createRadialGradient(hx, hy, 0, hx, hy, R * 1.6);
  // 盤の上（元素の宝玉と札）は照らさない：盤の縁から外へ広がる、虹のめぐる光
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.56, 'rgba(0,0,0,0)'); g.addColorStop(0.66, hue(tt, 0, 95, 65, light ? 0.14 : 0.36)); g.addColorStop(1, 'rgba(0,0,0,0)');
  Gc.fillStyle = g; Gc.fillRect(hx - R * 1.6, hy - R * 1.6, R * 3.2, R * 3.2);
  if (z < 10) return;
  Gc.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const a = tt * 0.5 + (k / 6) * TAU;
    Gc.strokeStyle = MYTH_RAINBOW[k] + (light ? '33' : '88'); Gc.lineWidth = Math.max(1.5, z * 0.09);
    Gc.beginPath(); Gc.arc(hx, hy, R * (1.1 + 0.06 * (k % 2)), a, a + 0.7); Gc.stroke();
  }
}

// =====================================================================
// 札と印
// =====================================================================
/** 資源地の名前：金の縁の巻物。両端に巻き、左に資源の色の宝玉 */
export function mythZoneLabel(ctx: CanvasRenderingContext2D, P: Palette, name: string, sub2: string, x: number, y: number, z: number, tint: string) {
  const light = P.name === 'light', fs = Math.max(12, z * 0.38), fs2 = Math.max(10, z * 0.23);
  ctx.save();
  ctx.font = `700 ${fs}px ${FONT_SERIF}`;
  const w1 = ctx.measureText(name).width + fs * 1.0;
  let w2 = 0;
  if (sub2) { ctx.font = `500 ${fs2}px ${FONT_SERIF}`; w2 = ctx.measureText(sub2).width; }
  const bw = Math.max(w1, w2) + fs * 1.3, bh = sub2 ? fs * 1.35 + fs2 * 1.45 : fs * 1.75, bx = x - bw / 2, by = y - fs * 1.25;
  const dark = light ? '#4a3208' : '#05030f';
  // 両端の巻き
  for (const ex of [bx, bx + bw]) { ctx.beginPath(); ctx.ellipse(ex, by + bh / 2, fs * 0.2, bh * 0.58, 0, 0, TAU); ctx.fillStyle = MYTH_GOLD; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, fs * 0.07); ctx.stroke(); }
  rr(ctx, bx, by, bw, bh, fs * 0.12);
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, light ? '#fffdf7' : '#2a1f63'); g.addColorStop(1, light ? '#f3e9ff' : '#150d3a');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, fs * 0.13); ctx.stroke(); ctx.strokeStyle = MYTH_GOLD; ctx.lineWidth = Math.max(1, fs * 0.06); ctx.stroke();
  const ny = by + fs * 0.95, rowX = x - w1 / 2;
  // 宝玉
  ctx.beginPath(); ctx.moveTo(rowX + fs * 0.3, ny - fs * 0.34); ctx.lineTo(rowX + fs * 0.58, ny); ctx.lineTo(rowX + fs * 0.3, ny + fs * 0.34); ctx.lineTo(rowX + fs * 0.02, ny); ctx.closePath();
  ctx.fillStyle = tint; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, fs * 0.07); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(rowX + fs * 0.3, ny - fs * 0.34); ctx.lineTo(rowX + fs * 0.44, ny - fs * 0.05); ctx.lineTo(rowX + fs * 0.16, ny - fs * 0.05); ctx.closePath(); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `700 ${fs}px ${FONT_SERIF}`; ctx.fillStyle = P.ink; ctx.fillText(name, rowX + fs * 0.78, ny);
  if (sub2) { ctx.textAlign = 'center'; ctx.font = `500 ${fs2}px ${FONT_SERIF}`; ctx.fillStyle = P.soft; ctx.fillText(sub2, x, by + fs * 1.35 + fs2 * 0.62); }
  ctx.restore();
}
/** 選んだもの：回る魔法陣（二重の輪、六芒星、巡る 3 つの星） */
export function mythSelect(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, sz: number, z: number, t: number) {
  const light = P.name === 'light', tt = calm ? 0 : t, R = z * (sz * 0.5 + 0.07 + (calm ? 0 : 0.015 * Math.sin(t * 4)));
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const draw = (col: string, wd: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = wd;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([z * 0.1, z * 0.07]); ctx.lineDashOffset = -tt * z * 0.3;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.07, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // 六芒星は、輪の外に出る先だけを描く（装置の上に線を引かない）：輪と外の輪のあいだの 6 つの山
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = tt * 0.4 + (i / 6) * TAU, w0 = 0.2; ctx.moveTo(cx + Math.cos(a - w0) * R, cy + Math.sin(a - w0) * R); ctx.lineTo(cx + Math.cos(a) * R * 1.16, cy + Math.sin(a) * R * 1.16); ctx.lineTo(cx + Math.cos(a + w0) * R, cy + Math.sin(a + w0) * R); } ctx.stroke();
  };
  draw(light ? 'rgba(74,50,8,0.55)' : 'rgba(0,0,0,0.8)', Math.max(3, z * 0.085));
  draw(P.hi, Math.max(1.6, z * 0.045));
  for (let i = 0; i < 3; i++) { const a = -tt * 1.2 + (i / 3) * TAU; ctx.fillStyle = hue(t, i / 3, 95, light ? 55 : 75); star4(ctx, cx + Math.cos(a) * R * 1.07, cy + Math.sin(a) * R * 1.07, z * 0.1, 0.3); ctx.fill(); ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
  if (G) { G.strokeStyle = `rgba(${P.glow},${light ? 0.2 : 0.35})`; G.lineWidth = Math.max(2, z * 0.06); G.beginPath(); G.arc(cx, cy, R, 0, TAU); G.stroke(); }
}

// =====================================================================
// 空気
// =====================================================================
interface Mote { x: number; y: number; v: number; s: number; ph: number; c: number }
const motes: Mote[] = Array.from({ length: 70 }, (_, i) => ({ x: hash(i, 3.3), y: hash(i, 5.1), v: 0.01 + hash(i, 7.7) * 0.03, s: 0.6 + hash(i, 9.9) * 1.6, ph: hash(i, 11.3) * TAU, c: Math.floor(hash(i, 13.1) * 6) }));
interface Shoot { x: number; y: number; vx: number; vy: number; age: number; life: number }
const shoots: Shoot[] = [];
let shootIn = 2;
/**
 * 天空の庭：左上から差す金の光の帯、右上にかかる大きな虹、舞う花びら、またたく光。
 * 星の海：上にゆれるオーロラの幕（緑・青緑・菫）、流れ星、蛍のように漂う光の粒、四隅の菫色の暗がり
 */
export function mythAmbient(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number, dt: number) {
  const light = P.name === 'light', big = Math.max(cw, ch), tt = calm ? 0 : t;
  ctx.save();
  if (light) {
    // 金の光の帯
    ctx.globalCompositeOperation = 'soft-light';
    ctx.translate(cw * 0.25, -ch * 0.1); ctx.rotate(0.5);
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * big * 0.2 + Math.sin(tt * 0.12 + i * 1.7) * big * 0.03, wd = big * (0.05 + 0.03 * (i % 2));
      const g = ctx.createLinearGradient(x - wd, 0, x + wd, 0);
      g.addColorStop(0, 'rgba(255,236,170,0)'); g.addColorStop(0.5, `rgba(255,236,170,${0.13 + 0.04 * Math.sin(tt * 0.5 + i)})`); g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g; ctx.fillRect(x - wd, 0, wd * 2, big * 1.6);
    }
    ctx.restore(); ctx.save();
    // 虹：右上の角を中心にした、6 色の弧
    ctx.globalCompositeOperation = 'source-over';
    const rc = big * 0.62, rwd = big * 0.012;
    MYTH_RAINBOW.forEach((col, i) => { ctx.strokeStyle = col; ctx.globalAlpha = 0.11 + 0.02 * Math.sin(tt * 0.4); ctx.lineWidth = rwd; ctx.beginPath(); ctx.arc(cw * 1.02, -ch * 0.08, rc - i * rwd, Math.PI * 0.5, Math.PI); ctx.stroke(); });
    ctx.globalAlpha = 1;
    // 花びら：斜めに舞いおりる
    for (let i = 0; i < 34; i++) {
      const m = motes[i];
      if (!calm) { m.y += m.v * dt * 1.6; m.x += Math.sin(t * 0.7 + m.ph) * 0.0006 + m.v * dt * 0.5; if (m.y > 1.05) { m.y = -0.05; m.x = hash(i, t) * 1.1 - 0.1; } if (m.x > 1.05) m.x = -0.05; }
      const x = m.x * cw, y = m.y * ch, rot = tt * (0.6 + m.s * 0.3) + m.ph, pr = 2.5 + m.s * 2.2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.55 + 0.4 * Math.sin(tt * 1.3 + m.ph));
      ctx.fillStyle = ['#ffc1dc', '#ffd9e8', '#fff0f6', '#ffe1b8', '#e7d4ff', '#ffffff'][m.c]; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(0, -pr); ctx.quadraticCurveTo(pr, -pr * 0.2, 0, pr); ctx.quadraticCurveTo(-pr, -pr * 0.2, 0, -pr); ctx.fill();
      ctx.restore();
    }
    // またたく光
    for (let i = 34; i < 60; i++) {
      const m = motes[i], a = 0.5 + 0.5 * Math.sin(tt * (1 + m.s) + m.ph);
      if (a < 0.3) continue;
      ctx.fillStyle = `rgba(255,255,255,${a})`; star4(ctx, m.x * cw, m.y * ch, 2 + m.s * 2.4 * a); ctx.fill();
    }
  } else {
    // オーロラ：波うつ幕を 3 枚、足し合わせて描く
    ctx.globalCompositeOperation = 'lighter';
    const cols = ['90,255,180', '80,200,255', '170,110,255'];
    for (let k = 0; k < 3; k++) {
      const y0 = ch * (0.08 + k * 0.07), amp = ch * 0.05, hgt = ch * (0.26 + k * 0.05), step = Math.max(10, cw / 60);
      const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + hgt);
      g.addColorStop(0, `rgba(${cols[k]},0)`); g.addColorStop(0.25, `rgba(${cols[k]},${0.13 + 0.04 * Math.sin(tt * 0.6 + k)})`); g.addColorStop(1, `rgba(${cols[k]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, y0 + hgt);
      for (let x = 0; x <= cw + step; x += step) ctx.lineTo(x, y0 + Math.sin(x * 0.006 + tt * (0.35 + k * 0.12) + k * 2) * amp + Math.sin(x * 0.017 - tt * 0.5 + k) * amp * 0.4);
      ctx.lineTo(cw, y0 + hgt); ctx.closePath(); ctx.fill();
      // 幕のひだ：縦の光の筋
      ctx.strokeStyle = `rgba(${cols[k]},0.05)`; ctx.lineWidth = step * 0.5;
      ctx.beginPath();
      for (let x = (tt * 12 * (k + 1)) % (step * 4); x <= cw; x += step * 4) { const yy = y0 + Math.sin(x * 0.006 + tt * (0.35 + k * 0.12) + k * 2) * amp; ctx.moveTo(x, yy); ctx.lineTo(x, yy + hgt * 0.7); }
      ctx.stroke();
    }
    // 流れ星
    if (!calm) {
      shootIn -= dt;
      if (shootIn <= 0 && shoots.length < 3) { shootIn = 1.5 + Math.random() * 4; shoots.push({ x: Math.random() * cw * 0.9, y: Math.random() * ch * 0.35, vx: 420 + Math.random() * 260, vy: 160 + Math.random() * 140, age: 0, life: 0.7 + Math.random() * 0.5 }); }
      for (let i = shoots.length - 1; i >= 0; i--) {
        const s0 = shoots[i]; s0.age += dt;
        if (s0.age >= s0.life) { shoots.splice(i, 1); continue; }
        const k = 1 - s0.age / s0.life, hx = s0.x + s0.vx * s0.age, hy = s0.y + s0.vy * s0.age, tx = hx - s0.vx * 0.22, ty = hy - s0.vy * 0.22;
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, 'rgba(160,190,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.9 * k})`);
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${k})`; star4(ctx, hx, hy, 5 * k + 2); ctx.fill();
      }
    }
    // 漂う光の粒（6 色）
    for (let i = 0; i < 70; i++) {
      const m = motes[i];
      if (!calm) { m.y -= m.v * dt * 0.6; m.x += Math.sin(t * 0.5 + m.ph) * 0.0004; if (m.y < -0.05) { m.y = 1.05; m.x = hash(i, t); } }
      const a = 0.35 + 0.45 * Math.sin(tt * (0.8 + m.s * 0.6) + m.ph);
      if (a <= 0.05) continue;
      const x = m.x * cw, y = m.y * ch, rad = 1.2 + m.s * 1.6;
      ctx.fillStyle = MYTH_RAINBOW[m.c] + Math.round(a * 200).toString(16).padStart(2, '0');
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      if (m.s > 1.6) { ctx.fillStyle = `rgba(255,255,255,${a})`; star4(ctx, x, y, rad * 2.6); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (!G) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, big * 0.78);
      g.addColorStop(0, 'rgba(20,6,60,0)'); g.addColorStop(1, 'rgba(20,6,60,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
  }
  ctx.restore();
  if (G && !calm) {
    // 光の層：光の粒を本当に光らせる
    for (let i = 0; i < 70; i += 2) { const m = motes[i]; G.fillStyle = MYTH_RAINBOW[m.c] + (light ? '18' : '55'); G.beginPath(); G.arc(m.x * cw, m.y * ch, 3 + m.s * 2, 0, TAU); G.fill(); }
  }
}
