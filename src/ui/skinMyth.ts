/**
 * 幻想スキン（天空の庭・星の海）：本物らしさより、絵の華やかさ。重さは気にしない（毎コマ、グラデーションと光を惜しまず描く）。
 * - 天空の庭（明）：空に浮かぶ花園。水彩のにじむ草地、花、雲の海、金の縁の水晶、虹と花びら
 * - 星の海（暗）：星雲と星座の地、光る水晶の原、オーロラ、流れ星、蛍のような光の粒
 * - 生き物：ベルトは大蛇、反応器は竜（鱗・爪・頭・尾・翼）、蒸留塔にペリカン、電解槽に双頭の蛇、沈殿槽にスライム、納品所は緑の獅子 → 不死鳥。装置は宝石の台座：切子の面、金の二重の縁、回る紋章の輪、四隅の宝玉
 * - 納品所は「世界の水晶」：虹色の大水晶と、逆に回る魔法陣、まわりを巡る元素の宝玉
 * 守ること：装置の窓の中（反応の様子・物質の色）は、ほかのスキンと同じ絵（覚える中身は飾らない）。文字は読める濃さを保つ
 */
import { ELEMENTS } from '../content/elements';
import { ZONES, isSea, zoneAt, type Zone } from '../content/map';
import { label, sub } from '../content/substances';
import { chaptersDone, currentGoal, fedTier, goalCount, goalRate, requiredOf, type Ent, type World } from '../engine/world';
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
 * ベルトは、荷を背にのせて運ぶ大蛇。体は物の状態の色、腹は明るく、背には流れといっしょに動く横じまと、背びれの点線。
 * ベルトの終わり（先がベルトでない所）に頭、始まり（どのベルトも入ってこない所）に細い尾。
 * 頭と尾は、画面に見えているベルトどうしのつながりで決める
 */
export function mythBelts(ctx: CanvasRenderingContext2D, P: Palette, z: number, t: number, speed: number, belts: MythBelt[], pass: (style: (k: BK) => void) => void, far: boolean, veryFar: boolean, sx: (x: number) => number, sy: (y: number) => number) {
  const light = P.name === 'light', W = { solid: 0.58, liquid: 0.48, gas: 0.4, none: 0.46 }, tt = calm ? 0 : t;
  const lw = (k: number) => Math.max(1, z * k);
  const body = (k: BK) => mix(P.line[k], light ? '#1d3a2a' : '#0a1a22', light ? 0.3 : 0.32);
  ctx.lineCap = 'round';
  // 輪郭 → 体 → 明るい腹（真ん中の帯）
  ctx.strokeStyle = light ? '#2a2010' : '#05030f';
  pass((k) => { ctx.lineWidth = z * W[k] + lw(0.09); });
  // 体：鱗の模様（物の状態の色）。引いているときは、色だけ
  const sr = Math.max(3, z * 0.085), ox = sx(0), oy = sy(0);
  pass((k) => { ctx.strokeStyle = veryFar ? body(k) : scalePat(ctx, mix(P.line[k], light ? '#ffffff' : '#9fe0d0', light ? 0.1 : 0.12), sr, light, ox, oy); ctx.lineWidth = z * W[k]; });
  // 背の明るい帯（丸みのつや）と、その中の細い光
  pass((k) => { ctx.strokeStyle = light ? 'rgba(255,255,255,0.3)' : `rgba(${rgbOf(mix(P.line[k], '#ffffff', 0.55))},0.22)`; ctx.lineWidth = z * W[k] * 0.42; });
  pass(() => { ctx.strokeStyle = light ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)'; ctx.lineWidth = Math.max(0.6, z * 0.03); });
  if (!veryFar) {
    // 背の横じま：流れといっしょに進む（蛇が這うように見える）
    ctx.lineCap = 'butt';
    ctx.lineDashOffset = -tt * speed * z * 0.5;
    pass((k) => { ctx.strokeStyle = light ? `rgba(${rgbOf(body(k))},0.55)` : 'rgba(0,0,0,0.42)'; ctx.lineWidth = z * W[k] * 0.9; ctx.setLineDash([z * 0.09, z * 0.24]); });
    // 背びれ：金の点線
    ctx.lineDashOffset = -tt * speed * z * 0.5 + z * 0.165;
    pass(() => { ctx.strokeStyle = MYTH_GOLD; ctx.lineWidth = lw(0.06); ctx.setLineDash([z * 0.05, z * 0.28]); });
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }
  if (!far && belts.length) {
    // 頭と尾：見えているベルトのつながりから
    const K = (x: number, y: number) => x * 131071 + y, DXY = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const here = new Map<number, MythBelt>(), fed = new Set<number>();
    for (const b of belts) here.set(K(b.e.x, b.e.y), b);
    for (const b of belts) { const d = DXY[b.e.dir]; if (here.has(K(b.e.x + d[0], b.e.y + d[1]))) fed.add(K(b.e.x + d[0], b.e.y + d[1])); }
    const edge = light ? '#2a2010' : '#05030f';
    for (const b of belts) {
      const k = (b.e.st ?? 'none') as BK, d = DXY[b.e.dir], cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5), wd = z * W[k];
      if (!here.has(K(b.e.x + d[0], b.e.y + d[1]))) {
        // 頭：出口の少し手前に、くさび形。目が 2 つ、舌がちろちろ
        const hx = cx + d[0] * z * 0.3, hy = cy + d[1] * z * 0.3, px = -d[1], py = d[0], L = z * 0.46, Hw = wd * 0.95;
        ctx.beginPath();
        ctx.moveTo(hx - d[0] * L * 0.5 + px * Hw * 0.75, hy - d[1] * L * 0.5 + py * Hw * 0.75);
        ctx.quadraticCurveTo(hx + d[0] * L * 0.3 + px * Hw, hy + d[1] * L * 0.3 + py * Hw, hx + d[0] * L, hy + d[1] * L);
        ctx.quadraticCurveTo(hx + d[0] * L * 0.3 - px * Hw, hy + d[1] * L * 0.3 - py * Hw, hx - d[0] * L * 0.5 - px * Hw * 0.75, hy - d[1] * L * 0.5 - py * Hw * 0.75);
        ctx.closePath();
        skinFill(ctx, mix(P.line[k], '#ffffff', light ? 0.12 : 0.2), light, hx - px * Hw - d[0] * L, hy - py * Hw - d[1] * L, hx + px * Hw + d[0] * L, hy + py * Hw + d[1] * L, sr, edge, lw(0.045));
        // 額の金のひし形と、目
        ctx.beginPath(); ctx.moveTo(hx - d[0] * L * 0.25, hy - d[1] * L * 0.25); ctx.lineTo(hx + px * Hw * 0.16, hy + py * Hw * 0.16); ctx.lineTo(hx + d[0] * L * 0.35, hy + d[1] * L * 0.35); ctx.lineTo(hx - px * Hw * 0.16, hy - py * Hw * 0.16); ctx.closePath();
        ctx.fillStyle = goldGrad(ctx, hx - L * 0.3, hy - L * 0.3, hx + L * 0.3, hy + L * 0.3); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(0.02); ctx.stroke();
        for (const sd of [-1, 1]) eyeGem(ctx, hx + d[0] * L * 0.3 + px * Hw * 0.45 * sd, hy + d[1] * L * 0.3 + py * Hw * 0.45 * sd, Math.max(1.4, z * 0.055), Math.max(1.1, z * 0.042), Math.atan2(d[1], d[0]), '#f6c644', edge, 0);
        if (z >= 22 && !calm && Math.sin(t * 5 + b.e.x * 1.3 + b.e.y * 2.1) > 0.3) {
          const tx = hx + d[0] * L, ty = hy + d[1] * L, fl = z * 0.12;
          ctx.strokeStyle = '#e0486a'; ctx.lineWidth = Math.max(0.8, z * 0.025);
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + d[0] * fl, ty + d[1] * fl);
          ctx.moveTo(tx + d[0] * fl, ty + d[1] * fl); ctx.lineTo(tx + d[0] * fl * 1.6 + px * fl * 0.4, ty + d[1] * fl * 1.6 + py * fl * 0.4);
          ctx.moveTo(tx + d[0] * fl, ty + d[1] * fl); ctx.lineTo(tx + d[0] * fl * 1.6 - px * fl * 0.4, ty + d[1] * fl * 1.6 - py * fl * 0.4);
          ctx.stroke();
        }
      }
      if (!fed.has(K(b.e.x, b.e.y))) {
        // 尾：入口の側へ、細くなって終わる
        const ax = cx + b.c.ax * z * 0.9, ay = cy + b.c.ay * z * 0.9, ux = b.c.ax * 2, uy = b.c.ay * 2, px = -uy, py = ux;
        ctx.beginPath();
        ctx.moveTo(ax + px * wd * 0.5, ay + py * wd * 0.5); ctx.lineTo(ax + ux * z * 0.45, ay + uy * z * 0.45); ctx.lineTo(ax - px * wd * 0.5, ay - py * wd * 0.5); ctx.closePath();
        skinFill(ctx, P.line[k], light, ax - z * 0.3, ay - z * 0.3, ax + z * 0.3, ay + z * 0.3, sr, edge, lw(0.04));
        // 尾の先の金の輪
        ctx.beginPath(); ctx.arc(ax + ux * z * 0.3, ay + uy * z * 0.3, Math.max(1, z * 0.04), 0, TAU); ctx.fillStyle = goldGrad(ctx, ax, ay - z * 0.05, ax + z * 0.1, ay + z * 0.05); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(0.02); ctx.stroke();
      }
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
// =====================================================================
// 竜の皮（反応器の台座）
// =====================================================================
/**
 * 竜の鱗の皮（八角形の台座いっぱい。真ん中は、あとで窓の板が上にかぶさる）。1 度描いた絵を、大きさ・色・昼夜ごとに覚えておいて貼る
 * （鱗は 1 台に 100 枚ほど。毎コマ 1 枚ずつ描くと、装置が並んだときに重い）。
 * seam は、鱗のすき間だけを明るく描いた絵（動いているあいだ、熱で赤く光らせるのに重ねる）
 */
const scaleCache = new Map<string, { skin: HTMLCanvasElement; seam: HTMLCanvasElement }>();
function dragonSkin(u: number, color: string, light: boolean): { skin: HTMLCanvasElement; seam: HTMLCanvasElement; size: number } {
  const size = Math.max(8, Math.round(u)), key = `${size}|${color}|${light}`;
  let c = scaleCache.get(key);
  if (!c) {
    if (scaleCache.size > 80) scaleCache.clear();
    const half = size * 0.43, cut = size * 0.13, cx = size / 2, cy = size / 2;
    const make = (seam: boolean) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d')!;
      // 八角形の中だけに描く（真ん中は、あとで板が上にかぶさる）
      oct(g, cx, cy, half, cut);
      g.clip();
      const base = mix(color, light ? '#3a2a14' : '#1a0c08', light ? 0.3 : 0.42);
      if (!seam) { g.fillStyle = base; g.fillRect(0, 0, size, size); }
      // 鱗：半円を、行ごとに半分ずらして重ねる（下の行が上に重なる）
      const r = Math.max(2.4, size * 0.07), rows = Math.ceil(size / (r * 1.05)) + 2, cols = Math.ceil(size / (r * 2)) + 2;
      for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
        const x = i * r * 2 + (j % 2 ? r : 0), y = j * r * 1.05, n = hash(i * 3.1 + 7, j * 5.3 + 1);
        g.beginPath(); g.arc(x, y, r, 0, Math.PI);
        if (seam) { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(0.8, r * 0.22); g.stroke(); continue; }
        // 1 枚ごとに、少しずつ明るさを変える。上の端に光、下の縁に影
        g.fillStyle = mix(base, n > 0.5 ? mix(color, '#ffd9a0', 0.4) : '#000000', 0.12 + 0.5 * Math.abs(n - 0.5)); g.fill();
        g.strokeStyle = light ? 'rgba(20,30,10,0.55)' : 'rgba(0,0,0,0.7)'; g.lineWidth = Math.max(0.7, r * 0.16); g.stroke();
        g.beginPath(); g.arc(x, y + r * 0.12, r * 0.62, Math.PI * 0.15, Math.PI * 0.85);
        g.strokeStyle = light ? 'rgba(255,255,255,0.28)' : `rgba(${rgbOf(mix(color, '#ffffff', 0.5))},0.3)`; g.lineWidth = Math.max(0.5, r * 0.12); g.stroke();
      }
      return cv;
    };
    c = { skin: make(false), seam: make(true) };
    scaleCache.set(key, c);
  }
  return { ...c, size };
}
// ---------------------------------------------------------------------
// 生き物を描く道具：どの面も、一色で塗らない。
//  - 鱗：1 枚ずつ、光の当たる上の端から影の縁へ濃くなる丸い鱗を、互い違いに重ねた模様（scalePat）。体・翼の腕・頭に敷く
//  - 羽根：根もとから先へ色が移り、羽軸と、そこから斜めに出る毛筋、縁の切れこみを描く（feather）
//  - 立体感：どの形も、光の側（左上）から影の側へのグラデーションで塗り、最後に縁の内側へ細い光（rim）を入れる
// ---------------------------------------------------------------------
const patCache = new Map<string, CanvasPattern | null>();
/** 鱗の模様。r は鱗の半径（画素）。模様は、置く場所 (ox, oy) に合わせる（視点を動かしても、体の上で鱗がすべらない） */
function scalePat(ctx: CanvasRenderingContext2D, color: string, r: number, light: boolean, ox: number, oy: number): CanvasPattern | string {
  const R = Math.max(3, Math.round(r)), key = `${color}|${R}|${light}`;
  let p = patCache.get(key);
  if (p === undefined) {
    if (patCache.size > 120) patCache.clear();
    const w = R * 2, h = Math.max(4, Math.round(R * 2.1)), cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d')!;
    const lo = mix(color, light ? '#2a1606' : '#020108', light ? 0.55 : 0.72), hi = mix(color, '#fff6d8', light ? 0.55 : 0.42);
    g.fillStyle = lo; g.fillRect(0, 0, w, h);
    // 下の行から上の行へ（上の行の鱗が、下の行に重なる）。模様の端でつながるよう、1 つ外まで描く
    for (let j = 3; j >= -1; j--) for (let i = -1; i <= 2; i++) {
      const x = i * w + (j % 2 ? R : 0), y = (j * h) / 2, n = hash(i * 3.1 + 7, (((j % 2) + 2) % 2) * 5.3 + 1);
      const gr = g.createRadialGradient(x - R * 0.25, y - R * 0.1, R * 0.08, x, y + R * 0.1, R * 1.05);
      gr.addColorStop(0, hi); gr.addColorStop(0.45, mix(color, n > 0.5 ? '#ffffff' : '#000000', 0.1)); gr.addColorStop(1, lo);
      g.beginPath(); g.arc(x, y, R * 1.02, 0, TAU); g.fillStyle = gr; g.fill();
      g.strokeStyle = light ? 'rgba(30,14,2,0.55)' : 'rgba(0,0,0,0.75)'; g.lineWidth = Math.max(0.6, R * 0.14); g.stroke();
      // 鱗の下の縁に、細い光（濡れたつや）
      g.beginPath(); g.arc(x, y, R * 0.8, Math.PI * 0.2, Math.PI * 0.8); g.strokeStyle = `rgba(255,246,216,${light ? 0.35 : 0.22})`; g.lineWidth = Math.max(0.4, R * 0.08); g.stroke();
    }
    p = ctx.createPattern(cv, 'repeat');
    patCache.set(key, p);
  }
  if (!p) return color;
  if (typeof DOMMatrix !== 'undefined' && p.setTransform) p.setTransform(new DOMMatrix().translate(ox, oy));
  return p;
}
/** いまの形（パス）を、鱗で塗る：下地のグラデーション → 鱗の模様 → 光の側のつや → 影の側のかげ → 縁 */
function skinFill(ctx: CanvasRenderingContext2D, color: string, light: boolean, x0: number, y0: number, x1: number, y1: number, r: number, edge: string, lw: number) {
  ctx.fillStyle = scalePat(ctx, color, r, light, x0, y0); ctx.fill();
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(255,244,214,${light ? 0.42 : 0.3})`); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(${light ? '40,14,30' : '0,0,12'},${light ? 0.38 : 0.55})`);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
}
/** 金の地金：明るい金 → 金 → 濃い金 → 照り返し */
function goldGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, MYTH_GOLD); g.addColorStop(0.7, MYTH_GOLD_DARK); g.addColorStop(1, '#f6d98a');
  return g;
}
/**
 * 羽根 1 枚：根もと (bx, by) から先 (tx, ty) へ。幅 wd。根もとの色 c0 → 中ほど c1 → 先 c2。
 * 羽軸、斜めの毛筋、縁の切れこみ（毛の束が割れた所）、先の飾り（eye：孔雀の目のような金の輪）
 */
function feather(ctx: CanvasRenderingContext2D, bx: number, by: number, tx: number, ty: number, wd: number, c0: string, c1: string, c2: string, edge: string, lw: number, eye = false) {
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const at = (k: number, s: number): [number, number] => [bx + dx * k + nx * wd * s, by + dy * k + ny * wd * s];
  // 外形：根もとは細く、中ほどでふくらみ、先はとがる。片側に切れこみ 2 つ
  const a1 = at(0.3, 0.5), a2 = at(0.72, 0.42), b2 = at(0.72, -0.42), b1 = at(0.3, -0.5), n1 = at(0.5, 0.2), n2 = at(0.62, -0.18);
  ctx.beginPath(); ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(a1[0] - ux * L * 0.12, a1[1] - uy * L * 0.12, a1[0], a1[1]);
  ctx.lineTo(at(0.46, 0.5)[0], at(0.46, 0.5)[1]); ctx.lineTo(n1[0], n1[1]); ctx.lineTo(at(0.54, 0.48)[0], at(0.54, 0.48)[1]);
  ctx.quadraticCurveTo(a2[0], a2[1], tx, ty);
  ctx.quadraticCurveTo(b2[0], b2[1], at(0.66, -0.46)[0], at(0.66, -0.46)[1]); ctx.lineTo(n2[0], n2[1]); ctx.lineTo(at(0.58, -0.5)[0], at(0.58, -0.5)[1]);
  ctx.quadraticCurveTo(b1[0], b1[1], bx, by);
  ctx.closePath();
  const g = ctx.createLinearGradient(bx, by, tx, ty);
  g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fill();
  // 片側を明るく、反対を暗く（羽根の丸み）
  const sh = ctx.createLinearGradient(bx + nx * wd * 0.5, by + ny * wd * 0.5, bx - nx * wd * 0.5, by - ny * wd * 0.5);
  sh.addColorStop(0, 'rgba(0,0,20,0.28)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0.3)');
  ctx.fillStyle = sh; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  // 毛筋：羽軸から先へ斜めに
  ctx.beginPath();
  for (let k = 0.16; k < 0.92; k += 0.085) for (const s of [-1, 1]) {
    const p0 = at(k, 0), p1 = at(Math.min(0.98, k + 0.11), s * 0.4 * Math.sin(Math.min(1, k * 1.25) * Math.PI));
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.4, lw * 0.5); ctx.stroke();
  // 羽軸
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * 0.94, by + dy * 0.94);
  ctx.strokeStyle = 'rgba(255,250,225,0.85)'; ctx.lineWidth = Math.max(0.5, lw * 0.7); ctx.stroke();
  if (eye) {
    const e = at(0.76, 0), r = wd * 0.26;
    ctx.beginPath(); ctx.arc(e[0], e[1], r, 0, TAU); ctx.fillStyle = goldGrad(ctx, e[0] - r, e[1] - r, e[0] + r, e[1] + r); ctx.fill();
    ctx.beginPath(); ctx.arc(e[0], e[1], r * 0.55, 0, TAU); ctx.fillStyle = c0; ctx.fill();
    ctx.beginPath(); ctx.arc(e[0] - r * 0.2, e[1] - r * 0.2, r * 0.2, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
}
/** 目：虹彩のグラデーション、縦長の瞳、うるんだ光。glow > 0 なら、まわりに熱の光 */
function eyeGem(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, iris: string, edge: string, glow: number) {
  if (glow > 0) { const g = ctx.createRadialGradient(x, y, 0, x, y, rx * 3); g.addColorStop(0, `rgba(255,170,80,${0.6 * glow})`); g.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx * 3, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.3, rx * 0.1, x, y, rx);
  g.addColorStop(0, '#fffbe0'); g.addColorStop(0.4, iris); g.addColorStop(1, mix(iris, '#3a0a00', 0.7));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.5, rx * 0.16); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, rx * 0.22, ry * 0.85, rot, 0, TAU); ctx.fillStyle = '#05030f'; ctx.fill();
  ctx.beginPath(); ctx.arc(x - rx * 0.35, y - ry * 0.35, Math.max(0.4, rx * 0.2), 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
}
/** 角・爪・牙：象牙色のグラデーションに、横のすじ */
function horn(ctx: CanvasRenderingContext2D, pts: [number, number][], edge: string, lw: number) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); ctx.quadraticCurveTo(pts[3][0], pts[3][1], pts[4][0], pts[4][1]); ctx.closePath();
  const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
  g.addColorStop(0, '#8a6a3a'); g.addColorStop(0.45, '#f4e6c2'); g.addColorStop(1, '#fffdf2');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  // すじ
  ctx.beginPath();
  for (let k = 0.25; k < 0.8; k += 0.18) { const ax = pts[0][0] + (pts[2][0] - pts[0][0]) * k, ay = pts[0][1] + (pts[2][1] - pts[0][1]) * k, bx = pts[4][0] + (pts[2][0] - pts[4][0]) * k, by = pts[4][1] + (pts[2][1] - pts[4][1]) * k; ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
  ctx.strokeStyle = 'rgba(90,60,20,0.45)'; ctx.lineWidth = Math.max(0.4, lw * 0.5); ctx.stroke();
}

/**
 * 竜の頭と尾。頭は台座の右上の角にのり、外（右上）を向く：鱗の皮、眉のとげ、象牙の角 2 対、金の目、牙。
 * 動いているあいだは、目と鼻先が熱で光り、三重の炎を吐く。尾は左下の角から巻き、背にとげ、先は矢じり
 */
function dragonHeadTail(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, half: number, color: string, line: number, busy: boolean, pulse: number, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#2a1404' : '#05030f', lw = Math.max(0.8, line * 0.55), sr = Math.max(3, u * 0.028);
  // ---- 尾：根もとから先へ細くなる帯を、鱗で塗る ----
  const tx = cx - half * 0.86, ty = cy + half * 0.86, sway = busy ? Math.sin(t * 2.2 + ph) * 0.14 : 0;
  const sp: [number, number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const k = i / 14, a = Math.PI * 0.75 + k * Math.PI * 1.25 + sway * k, rr2 = u * (0.02 + 0.115 * (1 - k * 0.55));
    sp.push([tx - u * 0.1 + Math.cos(a) * rr2 * (1 + k) - u * 0.05 * k, ty - u * 0.02 + Math.sin(a) * rr2 * (1 + k) - u * 0.1 * k, u * 0.05 * (1 - k * 0.82)]);
  }
  sp[0] = [tx, ty, u * 0.05];
  ctx.beginPath();
  for (let i = 0; i < sp.length; i++) { const p = sp[i], q = sp[Math.min(sp.length - 1, i + 1)], o = sp[Math.max(0, i - 1)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; const x = p[0] - (dy / l) * p[2], y = p[1] + (dx / l) * p[2]; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  for (let i = sp.length - 1; i >= 0; i--) { const p = sp[i], q = sp[Math.min(sp.length - 1, i + 1)], o = sp[Math.max(0, i - 1)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; ctx.lineTo(p[0] + (dy / l) * p[2], p[1] - (dx / l) * p[2]); }
  ctx.closePath();
  skinFill(ctx, color, light, tx - u * 0.25, ty - u * 0.25, tx + u * 0.05, ty + u * 0.1, sr, edge, lw);
  // 背のとげ（金）
  for (let i = 2; i < sp.length - 2; i += 2) {
    const p = sp[i], q = sp[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, h = p[2] * 1.5;
    ctx.beginPath(); ctx.moveTo(p[0] - nx * p[2], p[1] - ny * p[2]); ctx.lineTo((p[0] + q[0]) / 2 - nx * (p[2] + h), (p[1] + q[1]) / 2 - ny * (p[2] + h)); ctx.lineTo(q[0] - nx * q[2], q[1] - ny * q[2]); ctx.closePath();
    ctx.fillStyle = goldGrad(ctx, p[0], p[1], p[0] - nx * h * 2, p[1] - ny * h * 2); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.stroke();
  }
  // 先の矢じり
  { const e = sp[sp.length - 1], o = sp[sp.length - 2], dx = e[0] - o[0], dy = e[1] - o[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, s = u * 0.05;
    ctx.beginPath(); ctx.moveTo(e[0] + ux * s * 1.4, e[1] + uy * s * 1.4); ctx.lineTo(e[0] - uy * s * 0.8, e[1] + ux * s * 0.8); ctx.lineTo(e[0] - ux * s * 0.2, e[1] - uy * s * 0.2); ctx.lineTo(e[0] + uy * s * 0.8, e[1] - ux * s * 0.8); ctx.closePath();
    ctx.fillStyle = goldGrad(ctx, e[0] - s, e[1] - s, e[0] + s, e[1] + s); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.7; ctx.stroke(); }
  // ---- 頭 ----
  const hx = cx + half * 0.82, hy = cy - half * 0.82, S = u * 0.2, bob = busy ? Math.sin(t * 3 + ph) * u * 0.006 : 0;
  ctx.save();
  ctx.translate(hx, hy + bob); ctx.rotate(-Math.PI / 4);
  // 首のえり（鱗のひだ 3 枚）
  for (let i = 2; i >= 0; i--) {
    ctx.beginPath(); ctx.ellipse(-S * (0.55 + i * 0.16), 0, S * (0.3 - i * 0.02), S * (0.6 - i * 0.07), 0, 0, TAU);
    skinFill(ctx, mix(color, '#000000', 0.12 * i), light, -S, -S * 0.6, 0, S * 0.6, sr, edge, lw * 0.8);
  }
  // 角 2 対：うしろへ長い角と、頬の短い角
  for (const sd of [-1, 1]) {
    horn(ctx, [[-S * 0.42, sd * S * 0.28], [-S * 0.95, sd * S * 0.3], [-S * 1.45, sd * S * 0.82], [-S * 0.7, sd * S * 0.62], [-S * 0.18, sd * S * 0.46]], edge, lw * 0.8);
    horn(ctx, [[-S * 0.05, sd * S * 0.5], [-S * 0.2, sd * S * 0.7], [-S * 0.5, sd * S * 0.95], [-S * 0.05, sd * S * 0.78], [S * 0.12, sd * S * 0.5]], edge, lw * 0.7);
  }
  // 頭の形：額が広く、鼻先へ細く、鼻づらは少しふくらむ
  ctx.beginPath();
  ctx.moveTo(-S * 0.6, -S * 0.5);
  ctx.bezierCurveTo(-S * 0.1, -S * 0.72, S * 0.35, -S * 0.36, S * 0.72, -S * 0.3);
  ctx.bezierCurveTo(S * 1.05, -S * 0.3, S * 1.18, -S * 0.1, S * 1.16, 0);
  ctx.bezierCurveTo(S * 1.18, S * 0.1, S * 1.05, S * 0.3, S * 0.72, S * 0.3);
  ctx.bezierCurveTo(S * 0.35, S * 0.36, -S * 0.1, S * 0.72, -S * 0.6, S * 0.5);
  ctx.quadraticCurveTo(-S * 0.82, 0, -S * 0.6, -S * 0.5);
  ctx.closePath();
  skinFill(ctx, color, light, -S * 0.6, -S * 0.6, S * 1.1, S * 0.6, sr, edge, lw * 1.25);
  // 鼻すじの板（金の小さな甲）と、眉のとげ
  for (let i = 0; i < 4; i++) { const x = -S * 0.3 + i * S * 0.3, r2 = S * (0.1 - i * 0.012); ctx.beginPath(); ctx.moveTo(x - r2, 0); ctx.lineTo(x, -r2 * 0.8); ctx.lineTo(x + r2 * 1.3, 0); ctx.lineTo(x, r2 * 0.8); ctx.closePath(); ctx.fillStyle = goldGrad(ctx, x - r2, -r2, x + r2, r2); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.5; ctx.stroke(); }
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-S * 0.02, sd * S * 0.42); ctx.quadraticCurveTo(S * 0.22, sd * S * 0.56, S * 0.46, sd * S * 0.36); ctx.strokeStyle = edge; ctx.lineWidth = lw * 1.6; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = mix(color, '#fff6d8', 0.5); ctx.lineWidth = lw * 0.7; ctx.stroke(); }
  // 牙（口の両わきから、前へ）
  for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) { const x = S * (0.78 + i * 0.16), y = sd * S * (0.3 - i * 0.04); ctx.beginPath(); ctx.moveTo(x - S * 0.05, y); ctx.lineTo(x + S * 0.02, y + sd * S * 0.13); ctx.lineTo(x + S * 0.06, y); ctx.closePath(); ctx.fillStyle = '#fffdf2'; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.45; ctx.stroke(); }
  // 鼻の穴（動いているあいだは、中が赤く光る）
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(S * 0.98, sd * S * 0.11, S * 0.06, S * 0.035, sd * 0.5, 0, TAU); ctx.fillStyle = busy ? mix('#3a0a00', '#ff7a2a', pulse) : '#12060a'; ctx.fill(); }
  // 目
  for (const sd of [-1, 1]) eyeGem(ctx, S * 0.24, sd * S * 0.3, S * 0.15, S * 0.1, sd * 0.4, busy ? mix('#f6c644', '#ff6a1a', 0.55 * pulse) : '#f6c644', edge, busy ? pulse : 0);
  // 息：動いているあいだ、鼻先から三重の炎（外：赤橙 → 中：金 → 芯：白）。飾りで、装置の中の炎の色とは別
  if (busy && !calm) {
    const fx = S * 1.16;
    for (const [k, col, wdt] of [[1, 'rgba(255,90,40,0.75)', 0.26], [0.72, 'rgba(255,190,70,0.9)', 0.17], [0.42, 'rgba(255,250,220,0.95)', 0.09]] as [number, string, number][]) {
      const fl = S * k * (0.85 + 0.3 * Math.sin(t * 9 + ph + k * 4)), wv = Math.sin(t * 13 + k * 7) * S * 0.05;
      ctx.beginPath(); ctx.moveTo(fx, -S * wdt); ctx.bezierCurveTo(fx + fl * 0.5, -S * wdt * 1.5 + wv, fx + fl * 0.8, -S * wdt * 0.4, fx + fl, wv); ctx.bezierCurveTo(fx + fl * 0.8, S * wdt * 0.4, fx + fl * 0.5, S * wdt * 1.5 + wv, fx, S * wdt); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    }
    if (G) { const gx = hx + Math.cos(-Math.PI / 4) * S * 1.6, gy = hy + Math.sin(-Math.PI / 4) * S * 1.6; const gr = G.createRadialGradient(gx, gy, 0, gx, gy, S * 1.4); gr.addColorStop(0, `rgba(255,150,60,${0.5 * pulse})`); gr.addColorStop(1, 'rgba(255,150,60,0)'); G.fillStyle = gr; G.fillRect(gx - S * 1.4, gy - S * 1.4, S * 2.8, S * 2.8); }
  }
  ctx.restore();
}
/**
 * 竜の翼：台座のうしろから左右へ広がる。腕と指の骨は鱗の皮、膜は、根もとの深い色から縁の炎の色へ透ける薄い皮で、
 * 血管の筋が走り、縁は金で波うつ。動いているあいだ羽ばたき、膜がうしろからの熱で明るく透ける
 */
function dragonWings(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, color: string, line: number, busy: boolean, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#2a1404' : '#05030f', lw = Math.max(0.8, line * 0.55), sr = Math.max(3, u * 0.024);
  const flap = busy ? Math.sin(t * 2.4 + ph) * 0.15 : 0, heat = busy ? 0.55 + 0.45 * Math.sin(t * 3 + ph) : 0;
  for (const sd of [-1, 1]) {
    const bx = cx + sd * u * 0.34, by = cy - u * 0.22;
    const tip = (a: number, len: number): [number, number] => [bx + sd * Math.cos(a + flap * (0.6 + len)) * u * len, by + Math.sin(a + flap * (0.6 + len)) * u * len];
    const el = tip(-1.15, 0.3), f = [tip(-1.05, 0.66), tip(-0.5, 0.72), tip(0.08, 0.64), tip(0.62, 0.5), tip(1.05, 0.36)];
    // ---- 膜 ----
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(el[0], el[1]); ctx.lineTo(f[0][0], f[0][1]);
    for (let i = 0; i < f.length - 1; i++) { const a = f[i], b = f[i + 1]; ctx.quadraticCurveTo((a[0] + b[0]) / 2 - sd * u * 0.09, (a[1] + b[1]) / 2 - u * 0.02, b[0], b[1]); }
    ctx.quadraticCurveTo(bx + sd * u * 0.05, by + u * 0.34, bx - sd * u * 0.05, by + u * 0.3); ctx.closePath();
    const g = ctx.createRadialGradient(bx, by, u * 0.05, bx, by, u * 0.75);
    g.addColorStop(0, mix(color, light ? '#3a1a0a' : '#16040a', 0.6)); g.addColorStop(0.45, mix(color, light ? '#c0401a' : '#8a1a2a', 0.45)); g.addColorStop(0.8, mix(color, '#ff9a3a', 0.6)); g.addColorStop(1, mix(color, '#ffe08a', 0.75));
    ctx.globalAlpha = light ? 0.9 : 0.94; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
    // 膜のつや（上から斜めの光）と、熱で透ける光
    const sh = ctx.createLinearGradient(bx, by - u * 0.6, bx + sd * u * 0.3, by + u * 0.4);
    sh.addColorStop(0, 'rgba(255,240,210,0.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(20,0,30,0.35)');
    ctx.fillStyle = sh; ctx.fill();
    if (heat > 0) { const hg = ctx.createRadialGradient(bx + sd * u * 0.25, by + u * 0.05, 0, bx + sd * u * 0.25, by + u * 0.05, u * 0.5); hg.addColorStop(0, `rgba(255,200,90,${0.42 * heat})`); hg.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = hg; ctx.fill(); }
    // 血管：指の骨のあいだへ枝分かれする細い筋
    ctx.save(); ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < f.length - 1; i++) {
      const m: [number, number] = [(f[i][0] + f[i + 1][0]) / 2 - sd * u * 0.06, (f[i][1] + f[i + 1][1]) / 2];
      ctx.moveTo(el[0], el[1]); ctx.quadraticCurveTo((el[0] + m[0]) / 2 + sd * u * 0.03, (el[1] + m[1]) / 2 + u * 0.03, m[0], m[1]);
      for (const k of [0.45, 0.7]) { const px = el[0] + (m[0] - el[0]) * k, py = el[1] + (m[1] - el[1]) * k; ctx.moveTo(px, py); ctx.lineTo(px + (f[i][0] - px) * 0.35, py + (f[i][1] - py) * 0.35); ctx.moveTo(px, py); ctx.lineTo(px + (f[i + 1][0] - px) * 0.35, py + (f[i + 1][1] - py) * 0.35); }
    }
    ctx.strokeStyle = light ? 'rgba(120,20,10,0.4)' : 'rgba(255,170,120,0.3)'; ctx.lineWidth = Math.max(0.4, u * 0.005); ctx.stroke();
    // 膜の細かい点（皮のきめ）
    ctx.fillStyle = light ? 'rgba(60,20,8,0.16)' : 'rgba(0,0,0,0.22)';
    for (let i = 0; i < 26; i++) { const k = 0.2 + 0.75 * hash(i + 1, 3.7), a = -1.0 + 2.0 * hash(i + 4, 9.1); ctx.beginPath(); ctx.arc(bx + sd * Math.cos(a) * u * 0.7 * k, by + Math.sin(a) * u * 0.7 * k, Math.max(0.5, u * 0.006), 0, TAU); ctx.fill(); }
    ctx.restore();
    // 縁：濃い線の上に、金の細い線
    ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]);
    for (let i = 0; i < f.length - 1; i++) { const a = f[i], b = f[i + 1]; ctx.quadraticCurveTo((a[0] + b[0]) / 2 - sd * u * 0.09, (a[1] + b[1]) / 2 - u * 0.02, b[0], b[1]); }
    ctx.strokeStyle = edge; ctx.lineWidth = lw * 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = goldGrad(ctx, f[0][0], f[0][1], f[4][0], f[4][1]); ctx.lineWidth = lw * 1.1; ctx.stroke();
    // ---- 骨：腕（太い）と指（先へ細い）。鱗の皮 ----
    const limb = (a: [number, number], b: [number, number], w0: number, w1: number) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      ctx.beginPath(); ctx.moveTo(a[0] + nx * w0, a[1] + ny * w0); ctx.lineTo(b[0] + nx * w1, b[1] + ny * w1); ctx.lineTo(b[0] - nx * w1, b[1] - ny * w1); ctx.lineTo(a[0] - nx * w0, a[1] - ny * w0); ctx.closePath();
      skinFill(ctx, color, light, a[0] - u * 0.05, a[1] - u * 0.05, a[0] + u * 0.05, a[1] + u * 0.08, sr, edge, lw * 0.8);
    };
    for (const q of f) limb(el, q, u * 0.022, u * 0.007);
    limb([bx, by], el, u * 0.04, u * 0.028);
    // 関節の玉（金）と、指先・ひじの爪
    ctx.beginPath(); ctx.arc(el[0], el[1], u * 0.03, 0, TAU); ctx.fillStyle = goldGrad(ctx, el[0] - u * 0.03, el[1] - u * 0.03, el[0] + u * 0.03, el[1] + u * 0.03); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.7; ctx.stroke();
    horn(ctx, [[el[0] - sd * u * 0.02, el[1]], [el[0], el[1] - u * 0.06], [el[0] + sd * u * 0.03, el[1] - u * 0.13], [el[0] + sd * u * 0.035, el[1] - u * 0.05], [el[0] + sd * u * 0.025, el[1]]], edge, lw * 0.6);
    for (const q of f) { ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, u * 0.014), 0, TAU); ctx.fillStyle = '#fff6d8'; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.5; ctx.stroke(); }
    if (G && heat > 0) { const gr = G.createRadialGradient(bx + sd * u * 0.3, by, 0, bx + sd * u * 0.3, by, u * 0.5); gr.addColorStop(0, `rgba(255,140,60,${0.22 * heat})`); gr.addColorStop(1, 'rgba(255,140,60,0)'); G.fillStyle = gr; G.fillRect(bx + sd * u * 0.3 - u * 0.5, by - u * 0.5, u, u); }
  }
}
/** ペリカンの翼：蒸留塔の左右へ開く、真珠色の翼。風切り羽（長い）と雨おおい（短い）の 2 段、先は桃色と金。動いているあいだ、ゆっくりあおぐ */
function pelicanWings(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, line: number, busy: boolean, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#5a4420' : '#0a0618', lw = Math.max(0.6, line * 0.4), open = busy ? 0.1 * Math.sin(t * 1.8 + ph) : 0;
  for (const sd of [-1, 1]) {
    const bx = cx + sd * u * 0.36, by = cy - u * 0.16;
    // 風切り羽 7 枚：下から上へ扇に
    for (let i = 6; i >= 0; i--) {
      const a = 0.95 - i * 0.3 + open * (1 + i * 0.15), L = u * (0.46 + 0.035 * i - (i === 6 ? 0.06 : 0));
      feather(ctx, bx, by, bx + sd * Math.cos(a) * L, by + Math.sin(a) * L, u * 0.1, light ? '#ffffff' : '#f4f1ff', light ? '#fdeef2' : '#e2daf8', i % 2 ? '#ffb7c8' : '#ffd9a8', edge, lw);
    }
    // 雨おおい 5 枚：短く、明るい
    for (let i = 4; i >= 0; i--) {
      const a = 0.75 - i * 0.34 + open, L = u * 0.24;
      feather(ctx, bx, by, bx + sd * Math.cos(a) * L, by + Math.sin(a) * L, u * 0.085, '#ffffff', light ? '#ffffff' : '#f6f2ff', light ? '#f6e4c8' : '#d8cdf6', edge, lw);
    }
    // 肩の金の飾り
    ctx.beginPath(); ctx.arc(bx, by, u * 0.035, 0, TAU); ctx.fillStyle = goldGrad(ctx, bx - u * 0.035, by - u * 0.035, bx + u * 0.035, by + u * 0.035); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
  }
}
/**
 * ペリカンの頭：蒸留塔の右上にのる。羽毛の重なる S 字の首、金の冠羽、長い嘴（上は琥珀色のつや、下ののど袋は透ける桃色に筋）。
 * 動いているあいだ、嘴の先から光る雫が落ちる。ペリカンは、錬金術で蒸留（くり返し蒸発させて戻す操作）のしるし
 */
function pelicanHead(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, half: number, line: number, busy: boolean, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#5a4420' : '#0a0618', lw = Math.max(0.7, line * 0.5);
  const nx = cx + half * 0.74, ny = cy - half * 0.86, hx = nx + u * 0.1, hy = ny - u * 0.24 + (busy ? Math.sin(t * 2 + ph) * u * 0.008 : 0);
  // 首：曲線に沿って、羽毛の鱗を重ねる（下から上へ）
  const P0: [number, number] = [nx, ny + u * 0.08], P1: [number, number] = [nx - u * 0.13, ny - u * 0.08], P2: [number, number] = [nx + u * 0.18, ny - u * 0.12], P3: [number, number] = [hx, hy];
  const bez = (k: number): [number, number] => { const m = 1 - k; return [m * m * m * P0[0] + 3 * m * m * k * P1[0] + 3 * m * k * k * P2[0] + k * k * k * P3[0], m * m * m * P0[1] + 3 * m * m * k * P1[1] + 3 * m * k * k * P2[1] + k * k * k * P3[1]]; };
  ctx.lineCap = 'round'; ctx.strokeStyle = edge; ctx.lineWidth = u * 0.1 + lw * 2;
  ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.bezierCurveTo(P1[0], P1[1], P2[0], P2[1], P3[0], P3[1]); ctx.stroke();
  for (let i = 0; i <= 12; i++) {
    const k = i / 12, p = bez(k), r = u * (0.055 - k * 0.012);
    const g = ctx.createRadialGradient(p[0] - r * 0.4, p[1] - r * 0.4, r * 0.1, p[0], p[1], r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, light ? '#fbeef0' : '#e6dff8'); g.addColorStop(1, light ? '#e8cfd6' : '#b9aee0');
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], r, Math.PI * 0.15, Math.PI * 0.85); ctx.strokeStyle = light ? 'rgba(150,110,120,0.35)' : 'rgba(40,30,90,0.45)'; ctx.lineWidth = Math.max(0.4, lw * 0.5); ctx.stroke();
  }
  // 冠羽：頭のうしろへ、金の羽根 3 枚
  for (let i = 0; i < 3; i++) { const a = -0.55 + i * 0.32; feather(ctx, hx + u * 0.03, hy - u * 0.02, hx + u * 0.03 + Math.cos(a) * u * (0.2 - i * 0.02), hy - u * 0.02 + Math.sin(a) * u * (0.2 - i * 0.02), u * 0.05, '#fff2b8', MYTH_GOLD, '#ff9db0', edge, lw * 0.7); }
  // 嘴：のど袋（透ける桃色）→ 上の嘴（琥珀色）→ 先のかぎ
  const bx = hx - u * 0.36, by = hy + u * 0.2;
  ctx.beginPath(); ctx.moveTo(hx - u * 0.02, hy + u * 0.04); ctx.bezierCurveTo(hx - u * 0.08, hy + u * 0.24, hx - u * 0.26, hy + u * 0.27, bx, by); ctx.lineTo(hx - u * 0.06, hy); ctx.closePath();
  const pg = ctx.createLinearGradient(hx, hy, bx, by + u * 0.1);
  pg.addColorStop(0, 'rgba(255,170,190,0.95)'); pg.addColorStop(0.6, 'rgba(255,205,160,0.9)'); pg.addColorStop(1, 'rgba(255,240,200,0.9)');
  ctx.fillStyle = pg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); for (let i = 1; i <= 4; i++) { const k = i / 5; ctx.moveTo(hx - u * 0.05 + (bx - hx + u * 0.05) * k, hy + (by - hy) * k); ctx.quadraticCurveTo(hx - u * 0.07 + (bx - hx) * k, hy + (by - hy) * k + u * 0.07, hx - u * 0.1 + (bx - hx + u * 0.1) * k * 0.9, hy + u * 0.2 + (by - hy - u * 0.2) * k * 0.6); }
  ctx.strokeStyle = 'rgba(200,70,100,0.4)'; ctx.lineWidth = Math.max(0.4, lw * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx - u * 0.01, hy - u * 0.045); ctx.quadraticCurveTo(hx - u * 0.2, hy + u * 0.03, bx - u * 0.01, by + u * 0.015); ctx.quadraticCurveTo(bx + u * 0.01, by - u * 0.02, bx + u * 0.03, by - u * 0.012); ctx.lineTo(hx - u * 0.05, hy + u * 0.025); ctx.closePath();
  const ug = ctx.createLinearGradient(hx, hy - u * 0.05, bx, by);
  ug.addColorStop(0, '#fff0b0'); ug.addColorStop(0.4, '#ffb347'); ug.addColorStop(0.85, '#e8742a'); ug.addColorStop(1, '#fff0b0');
  ctx.fillStyle = ug; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx - u * 0.04, hy - u * 0.02); ctx.quadraticCurveTo(hx - u * 0.2, hy + u * 0.035, bx + u * 0.03, by - u * 0.02); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(0.5, lw * 0.6); ctx.stroke();
  // 頭
  const hg = ctx.createRadialGradient(hx - u * 0.025, hy - u * 0.03, u * 0.008, hx, hy, u * 0.075);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.7, light ? '#fbeef0' : '#e6dff8'); hg.addColorStop(1, light ? '#e2c2cc' : '#b0a4dc');
  ctx.beginPath(); ctx.arc(hx, hy, u * 0.072, 0, TAU); ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
  // 目のまわりの金の輪と、目
  ctx.beginPath(); ctx.arc(hx - u * 0.02, hy - u * 0.012, u * 0.028, 0, TAU); ctx.fillStyle = goldGrad(ctx, hx - u * 0.05, hy - u * 0.04, hx + u * 0.01, hy + u * 0.02); ctx.fill();
  eyeGem(ctx, hx - u * 0.02, hy - u * 0.012, u * 0.018, u * 0.018, 0, '#5aa0e0', edge, 0);
  // 雫：嘴の先にたまり、落ちて、小さく光って消える
  if (busy && !calm) {
    const k = (t * 0.9 + ph * 0.13) % 1, dy = k * k * u * 0.26, r = Math.max(1.2, u * 0.026) * (1 - k * 0.35), x = bx, y = by + dy + r;
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.bezierCurveTo(x + r * 1.3, y - r * 0.3, x + r, y + r, x, y + r); ctx.bezierCurveTo(x - r, y + r, x - r * 1.3, y - r * 0.3, x, y - r * 2); ctx.closePath();
    const dg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.4);
    dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.4, '#9fe0ff'); dg.addColorStop(1, '#3a8ad8');
    ctx.fillStyle = dg; ctx.fill(); ctx.strokeStyle = 'rgba(20,60,120,0.6)'; ctx.lineWidth = Math.max(0.4, lw * 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
    if (G) { G.fillStyle = `rgba(140,220,255,${0.4 * (1 - k)})`; G.beginPath(); G.arc(x, y, r * 3, 0, TAU); G.fill(); }
  }
}
/**
 * 双頭の蛇：電解槽の左上と右上の角から、鱗の首がのび、広げた頭巾（コブラのえり）に金の紋。
 * 動いているあいだ、2 つの頭のあいだを、枝分かれする稲妻が走る
 */
function twinSerpent(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, half: number, color: string, line: number, busy: boolean, pulse: number, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#0a2630' : '#05030f', lw = Math.max(0.8, line * 0.55), S = u * 0.17, sr = Math.max(3, u * 0.024);
  const heads: [number, number][] = [];
  for (const sd of [-1, 1]) {
    const bx = cx + sd * half * 0.78, by = cy - half * 0.84, sway = busy ? Math.sin(t * 2.6 + ph + sd) * 0.16 : 0;
    const hx = bx + sd * u * (0.12 + sway * 0.1), hy = by - u * 0.2;
    heads.push([hx + sd * S * 0.5, hy - S * 0.3]);
    // 首：先へ細くなる帯（鱗）。腹側に、明るい横じま
    const mx = bx - sd * u * 0.1, my = by - u * 0.1, w0 = u * 0.05, w1 = u * 0.036;
    ctx.beginPath(); ctx.moveTo(bx - w0, by + u * 0.06); ctx.quadraticCurveTo(mx - w0, my, hx - w1, hy); ctx.lineTo(hx + w1, hy); ctx.quadraticCurveTo(mx + w0, my, bx + w0, by + u * 0.06); ctx.closePath();
    skinFill(ctx, color, light, bx - u * 0.08, by - u * 0.2, bx + u * 0.08, by, sr, edge, lw);
    // 頭巾：うしろに広がるえり。内側は明るい腹の色に、金の目玉もよう
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(sd > 0 ? -0.75 + sway : Math.PI + 0.75 - sway);
    ctx.beginPath(); ctx.moveTo(-S * 0.9, 0); ctx.bezierCurveTo(-S * 0.8, -S * 0.95, S * 0.1, -S * 0.9, S * 0.3, -S * 0.25); ctx.lineTo(S * 0.3, S * 0.25); ctx.bezierCurveTo(S * 0.1, S * 0.9, -S * 0.8, S * 0.95, -S * 0.9, 0); ctx.closePath();
    skinFill(ctx, mix(color, '#000000', 0.15), light, -S, -S, S * 0.3, S, sr, edge, lw);
    ctx.beginPath(); ctx.ellipse(-S * 0.3, 0, S * 0.36, S * 0.5, 0, 0, TAU);
    const ig = ctx.createRadialGradient(-S * 0.35, -S * 0.1, S * 0.05, -S * 0.3, 0, S * 0.5);
    ig.addColorStop(0, '#fff6d0'); ig.addColorStop(0.6, mix(color, '#ffe9a0', 0.7)); ig.addColorStop(1, mix(color, '#7a5a10', 0.5));
    ctx.fillStyle = ig; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.stroke();
    for (const q of [-1, 1]) { ctx.beginPath(); ctx.arc(-S * 0.3, q * S * 0.2, S * 0.1, 0, TAU); ctx.strokeStyle = goldGrad(ctx, -S * 0.4, -S * 0.3, -S * 0.2, S * 0.3); ctx.lineWidth = Math.max(0.6, S * 0.05); ctx.stroke(); }
    // 頭
    ctx.beginPath(); ctx.moveTo(-S * 0.25, 0); ctx.bezierCurveTo(-S * 0.1, -S * 0.5, S * 0.55, -S * 0.42, S * 1.0, 0); ctx.bezierCurveTo(S * 0.55, S * 0.42, -S * 0.1, S * 0.5, -S * 0.25, 0); ctx.closePath();
    skinFill(ctx, color, light, -S * 0.3, -S * 0.5, S, S * 0.5, sr, edge, lw);
    // 額の金のひし形、目、鼻の穴
    ctx.beginPath(); ctx.moveTo(S * 0.05, 0); ctx.lineTo(S * 0.25, -S * 0.1); ctx.lineTo(S * 0.5, 0); ctx.lineTo(S * 0.25, S * 0.1); ctx.closePath(); ctx.fillStyle = goldGrad(ctx, 0, -S * 0.1, S * 0.5, S * 0.1); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.5; ctx.stroke();
    for (const q of [-1, 1]) eyeGem(ctx, S * 0.42, q * S * 0.25, S * 0.11, S * 0.075, q * 0.3, busy ? mix('#f6c644', '#9ff0ff', 0.6 * pulse) : '#f6c644', edge, 0);
    // 舌
    if (!calm && Math.sin(t * 6 + ph + sd * 2) > 0.1) { ctx.strokeStyle = '#ff4a7a'; ctx.lineWidth = Math.max(0.7, S * 0.07); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(S * 1.0, 0); ctx.quadraticCurveTo(S * 1.2, S * 0.05, S * 1.32, 0); ctx.lineTo(S * 1.5, -S * 0.14); ctx.moveTo(S * 1.32, 0); ctx.lineTo(S * 1.5, S * 0.14); ctx.stroke(); }
    ctx.restore();
  }
  // 稲妻：太い光の帯 → 青白い線 → 白い芯。途中で枝が 2 本出る。毎コマ形が変わる
  if (busy && !calm) {
    const [a, b] = heads, n = 9, seed = Math.floor(t * 16), pts: [number, number][] = [a];
    for (let i = 1; i < n; i++) { const k = i / n; pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * u * 0.06 + (hash(i + seed, ph) - 0.5) * u * 0.11]); }
    pts.push(b);
    const bolt = () => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); for (const bi of [3, 6]) { const q = pts[bi]; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + (hash(bi + seed, 1.1) - 0.5) * u * 0.1, q[1] - u * (0.05 + 0.07 * hash(bi + seed, 2.2))); ctx.lineTo(q[0] + (hash(bi + seed, 3.3) - 0.5) * u * 0.16, q[1] - u * (0.11 + 0.08 * hash(bi + seed, 4.4))); } };
    ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
    bolt(); ctx.strokeStyle = light ? 'rgba(90,170,255,0.35)' : 'rgba(120,200,255,0.35)'; ctx.lineWidth = u * 0.045; ctx.stroke();
    bolt(); ctx.strokeStyle = light ? 'rgba(40,140,230,0.95)' : 'rgba(170,235,255,0.95)'; ctx.lineWidth = Math.max(1, u * 0.016); ctx.stroke();
    bolt(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, u * 0.006); ctx.stroke();
    if (G) { G.strokeStyle = 'rgba(120,220,255,0.55)'; G.lineWidth = u * 0.07; G.lineCap = 'round'; G.beginPath(); pts.forEach((q, i) => (i ? G!.lineTo(q[0], q[1]) : G!.moveTo(q[0], q[1]))); G.stroke(); }
  }
}
/**
 * スライム：沈殿槽の下の縁から垂れる、透きとおったゼリー。中に泡と、金の核。上に強いつや、下の縁に光の輪、床に色のついた影。
 * 動いているあいだ、ぷるぷるゆれ、泡がのぼる
 */
function slime(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, half: number, color: string, line: number, busy: boolean, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#2a3a2a' : '#05030f', y0 = cy + half * 0.8, wob = busy ? Math.sin(t * 3 + ph) * u * 0.014 : 0, jelly = mix(color, '#7dffb0', 0.45);
  const shape = () => {
    ctx.beginPath(); ctx.moveTo(cx - half * 1.0, y0 - u * 0.02);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const xa = cx - half * 1.0 + (i / n) * half * 2.0, xb = cx - half * 1.0 + ((i + 1) / n) * half * 2.0, d = u * (0.07 + 0.11 * hash(i + 2, 5.5)) + (i % 2 ? wob : -wob);
      ctx.bezierCurveTo(xa + (xb - xa) * 0.05, y0 + d * 1.6, xb - (xb - xa) * 0.05, y0 + d * 1.6, xb, y0 - u * 0.02);
    }
    ctx.bezierCurveTo(cx + half * 1.12, y0 - u * 0.16, cx + half * 0.6, y0 - u * 0.15 + wob, cx, y0 - u * 0.13 - wob); ctx.bezierCurveTo(cx - half * 0.6, y0 - u * 0.15 + wob, cx - half * 1.12, y0 - u * 0.16, cx - half * 1.0, y0 - u * 0.02);
    ctx.closePath();
  };
  // 床に落ちる、色のついた影
  ctx.beginPath(); ctx.ellipse(cx, y0 + u * 0.19, half * 0.95, u * 0.04, 0, 0, TAU); ctx.fillStyle = `rgba(${rgbOf(jelly)},0.28)`; ctx.fill();
  shape();
  const g = ctx.createLinearGradient(cx, y0 - u * 0.16, cx, y0 + u * 0.2);
  g.addColorStop(0, `rgba(${rgbOf(mix(jelly, '#ffffff', 0.55))},0.9)`); g.addColorStop(0.45, `rgba(${rgbOf(jelly)},0.78)`); g.addColorStop(1, `rgba(${rgbOf(mix(jelly, light ? '#0a4a3a' : '#02201a', 0.55))},0.9)`);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); shape(); ctx.clip();
  // 中の光（核のまわり）と、泡
  const cg = ctx.createRadialGradient(cx, y0, 0, cx, y0, half * 0.9); cg.addColorStop(0, 'rgba(255,255,220,0.5)'); cg.addColorStop(1, 'rgba(255,255,220,0)'); ctx.fillStyle = cg; ctx.fillRect(cx - half * 1.2, y0 - u * 0.2, half * 2.4, u * 0.5);
  for (let i = 0; i < 9; i++) {
    const k = busy && !calm ? (t * (0.25 + 0.15 * hash(i, 1.7)) + hash(i, 2.9)) % 1 : hash(i, 2.9), bx = cx + (hash(i, 4.1) - 0.5) * half * 1.7, by = y0 + u * 0.12 - k * u * 0.24, r = Math.max(0.8, u * (0.008 + 0.014 * hash(i, 6.3)));
    ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.4, r * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  // 下の縁の光の輪（透けた光が下に集まる）
  shape(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = u * 0.03; ctx.stroke();
  ctx.restore();
  shape(); ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.8, line * 0.55); ctx.lineJoin = 'round'; ctx.stroke();
  // 上のつや：白い帯と、小さな光
  ctx.beginPath(); ctx.ellipse(cx - half * 0.35, y0 - u * 0.085, half * 0.4, u * 0.018, -0.05, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx + half * 0.35, y0 - u * 0.08, u * 0.012, 0, TAU); ctx.fill();
  // 金の核と、目
  ctx.beginPath(); ctx.arc(cx, y0 + u * 0.04 + wob, u * 0.03, 0, TAU); ctx.fillStyle = goldGrad(ctx, cx - u * 0.03, y0, cx + u * 0.03, y0 + u * 0.08); ctx.fill(); ctx.strokeStyle = 'rgba(90,60,10,0.6)'; ctx.lineWidth = Math.max(0.4, line * 0.25); ctx.stroke();
  for (const sd of [-1, 1]) {
    const ex = cx + sd * u * 0.085, ey = y0 - u * 0.03 + wob, r = Math.max(1.4, u * 0.032);
    const eg = ctx.createRadialGradient(ex - r * 0.3, ey - r * 0.3, r * 0.1, ex, ey, r); eg.addColorStop(0, '#ffffff'); eg.addColorStop(1, '#d8e8f0');
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fillStyle = eg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = Math.max(0.5, line * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + u * 0.006, ey + u * 0.006, r * 0.5, 0, TAU); ctx.fillStyle = '#0a1420'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex - r * 0.1, ey - r * 0.15, r * 0.2, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
}
/**
 * 納品所の獣：物を飲み込む緑の獅子（錬金術で、緑礬からとる硫酸のしるし）。章を 1 つ終えるたびに、左右の翼に羽根が 1 枚ずつ増え、
 * すべての章を終えると、炎の冠をいただく不死鳥（完成のしるし）になる。台の盤のうしろに描く。
 * 羽根は 1 枚ずつ、根もと・中ほど・先で色が移り、羽軸と毛筋、先に金の目玉もよう。獅子のたてがみは、3 重の炎のような房
 */
function hubBeast(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, R: number, w: World, t: number) {
  const light = P.name === 'light', edge = light ? '#2a1a04' : '#05030f', done = chaptersDone(w.progress), n = done.filter(Boolean).length, all = done.length > 0 && (n >= done.length || !currentGoal(w));
  const lw = Math.max(0.8, R * 0.012), flap = calm ? 0 : Math.sin(t * 1.3) * 0.05, total = Math.max(1, done.length);
  // ---- 翼：羽根は、終えた章の数だけ。長い羽根の上に、短い羽根を 1 段重ねる ----
  for (const sd of [-1, 1]) {
    const bx = cx + sd * R * 0.78, by = cy - R * 0.12;
    for (let layer = 0; layer < 2; layer++) for (let i = n - 1; i >= 0; i--) {
      const k = i / Math.max(1, total - 1), a = -1.1 + k * 1.75 + flap * (1 + i * 0.05) + layer * 0.04, L = R * (layer ? 0.52 - 0.12 * k : 1.0 - 0.3 * k);
      const tx = bx + sd * Math.cos(a) * L, ty = by + Math.sin(a) * L;
      const c = all ? MYTH_RAINBOW[(i + layer * 2) % MYTH_RAINBOW.length] : mix('#1f8a4a', '#bfe86a', k);
      const c0 = all ? '#ffe08a' : layer ? '#eaffc0' : '#0f5a3a', c1 = all ? mix(c, '#ff6a2a', 0.5) : c, c2 = all ? (layer ? '#fff4c8' : '#d8203a') : layer ? MYTH_GOLD : '#2ad0a0';
      feather(ctx, bx, by, tx, ty, R * (layer ? 0.16 : 0.2), c0, c1, c2, edge, lw, layer === 0);
    }
    if (n > 0) {
      // 肩の金の飾り：玉と、小さな葉
      ctx.beginPath(); ctx.arc(bx, by, R * 0.07, 0, TAU); ctx.fillStyle = goldGrad(ctx, bx - R * 0.07, by - R * 0.07, bx + R * 0.07, by + R * 0.07); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx - R * 0.02, by - R * 0.02, R * 0.022, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }
  }
  // ---- 頭：盤の上の縁にのる ----
  const hx = cx, hy = cy - R * 1.16, S = R * 0.44;
  if (!all) {
    // たてがみ：外・中・内の 3 重。1 房ずつ、根もとの深緑から先の若葉色・金へ
    for (let ring = 0; ring < 3; ring++) {
      const cnt = 16 - ring * 2, r0 = S * (0.5 - ring * 0.04), r1 = S * (1.18 - ring * 0.2), tw = (ring % 2 ? -1 : 1) * (calm ? 0 : Math.sin(t * 0.9 + ring) * 0.05);
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * TAU + ring * 0.2 + tw, a2 = a + 0.32;
        const bx0 = hx + Math.cos(a - 0.2) * r0, by0 = hy + Math.sin(a - 0.2) * r0, bx1 = hx + Math.cos(a + 0.2) * r0, by1 = hy + Math.sin(a + 0.2) * r0, tx = hx + Math.cos(a2) * r1, ty = hy + Math.sin(a2) * r1;
        ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.quadraticCurveTo(hx + Math.cos(a - 0.05) * r1 * 0.8, hy + Math.sin(a - 0.05) * r1 * 0.8, tx, ty); ctx.quadraticCurveTo(hx + Math.cos(a + 0.3) * r1 * 0.7, hy + Math.sin(a + 0.3) * r1 * 0.7, bx1, by1); ctx.closePath();
        const g = ctx.createLinearGradient(bx0, by0, tx, ty);
        g.addColorStop(0, ring === 2 ? '#2f9a4a' : '#0f4a2a'); g.addColorStop(0.6, ring === 0 ? '#2fa858' : '#6fd86a'); g.addColorStop(1, ring === 2 ? '#fff0a0' : '#d6f08a');
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.7; ctx.lineJoin = 'round'; ctx.stroke();
      }
    }
    // 顔：丸みのあるグラデーション
    const fg = ctx.createRadialGradient(hx - S * 0.15, hy - S * 0.2, S * 0.05, hx, hy, S * 0.62);
    fg.addColorStop(0, '#e6ffc8'); fg.addColorStop(0.55, '#7fd87a'); fg.addColorStop(1, '#2f8a4a');
    ctx.beginPath(); ctx.ellipse(hx, hy, S * 0.56, S * 0.6, 0, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
    // 耳
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + sd * S * 0.46, hy - S * 0.44, S * 0.16, 0, TAU); ctx.fillStyle = '#4fb85a'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(hx + sd * S * 0.46, hy - S * 0.44, S * 0.08, 0, TAU); ctx.fillStyle = '#ffc8d0'; ctx.fill(); }
    // 額の金の太陽の紋（獅子が飲み込む太陽）
    ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = S * (i % 2 ? 0.07 : 0.13); ctx.lineTo(hx + Math.cos(a) * r, hy - S * 0.36 + Math.sin(a) * r); } ctx.closePath();
    ctx.fillStyle = goldGrad(ctx, hx - S * 0.13, hy - S * 0.5, hx + S * 0.13, hy - S * 0.22); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.stroke();
    // 目、鼻すじ、鼻
    for (const sd of [-1, 1]) eyeGem(ctx, hx + sd * S * 0.24, hy - S * 0.1, S * 0.12, S * 0.09, sd * 0.25, '#f6c644', edge, 0);
    ctx.beginPath(); ctx.moveTo(hx - S * 0.12, hy + S * 0.1); ctx.quadraticCurveTo(hx, hy + S * 0.04, hx + S * 0.12, hy + S * 0.1); ctx.quadraticCurveTo(hx + S * 0.06, hy + S * 0.24, hx, hy + S * 0.25); ctx.quadraticCurveTo(hx - S * 0.06, hy + S * 0.24, hx - S * 0.12, hy + S * 0.1); ctx.closePath();
    const ng = ctx.createLinearGradient(hx, hy + S * 0.05, hx, hy + S * 0.25); ng.addColorStop(0, '#3a7a4a'); ng.addColorStop(1, '#12381f'); ctx.fillStyle = ng; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.stroke();
    // 口：開いて、牙が 4 本。中は深い赤のグラデーション。ひげの点
    const mo = S * (0.13 + (calm ? 0 : 0.04 * Math.sin(t * 2)));
    ctx.beginPath(); ctx.ellipse(hx, hy + S * 0.4, S * 0.24, mo, 0, 0, TAU);
    const mg = ctx.createRadialGradient(hx, hy + S * 0.44, 0, hx, hy + S * 0.4, S * 0.24); mg.addColorStop(0, '#ff7a6a'); mg.addColorStop(1, '#4a0612'); ctx.fillStyle = mg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.8; ctx.stroke();
    for (const sd of [-1, 1]) for (const q of [0.08, 0.17]) { ctx.beginPath(); ctx.moveTo(hx + sd * S * (q - 0.03), hy + S * 0.4 - mo * 0.85); ctx.lineTo(hx + sd * S * q, hy + S * 0.4 - mo * 0.2); ctx.lineTo(hx + sd * S * (q + 0.03), hy + S * 0.4 - mo * 0.85); ctx.closePath(); ctx.fillStyle = '#fffdf2'; ctx.fill(); }
    ctx.fillStyle = 'rgba(15,60,30,0.7)'; for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(hx + sd * S * (0.2 + i * 0.07), hy + S * (0.22 + (i % 2) * 0.05), S * 0.015, 0, TAU); ctx.fill(); }
  } else {
    // 炎の冠：7 本の炎。1 本ずつ、根もとの金 → 橙 → 先の紅。中に白い芯
    for (let i = -3; i <= 3; i++) {
      const a = -Math.PI / 2 + i * 0.27, L = S * (1.5 - Math.abs(i) * 0.14 + (calm ? 0 : 0.1 * Math.sin(t * 4 + i * 1.7))), bw = S * 0.2;
      const bx0 = hx + Math.cos(a) * S * 0.4 - Math.sin(a) * bw, by0 = hy + Math.sin(a) * S * 0.4 + Math.cos(a) * bw, bx1 = hx + Math.cos(a) * S * 0.4 + Math.sin(a) * bw, by1 = hy + Math.sin(a) * S * 0.4 - Math.cos(a) * bw, tx = hx + Math.cos(a) * L, ty = hy + Math.sin(a) * L, wv = calm ? 0 : Math.sin(t * 5 + i) * S * 0.08;
      ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.bezierCurveTo(bx0 + Math.cos(a) * L * 0.4 + wv, by0 + Math.sin(a) * L * 0.4, tx - wv, ty + L * 0.2, tx, ty); ctx.bezierCurveTo(tx + wv, ty + L * 0.25, bx1 + Math.cos(a) * L * 0.4 - wv, by1 + Math.sin(a) * L * 0.4, bx1, by1); ctx.closePath();
      const g = ctx.createLinearGradient(hx, hy, tx, ty); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.45, '#ffb347'); g.addColorStop(0.8, '#ff5a2a'); g.addColorStop(1, '#c81e4a');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * S * 0.45, hy + Math.sin(a) * S * 0.45); ctx.lineTo(hx + Math.cos(a) * L * 0.75, hy + Math.sin(a) * L * 0.75); ctx.strokeStyle = 'rgba(255,255,240,0.75)'; ctx.lineWidth = Math.max(0.5, S * 0.025); ctx.lineCap = 'round'; ctx.stroke();
    }
    // 頭：羽毛の重なり（小さな羽根を放射に）と、丸い顔
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; feather(ctx, hx, hy, hx + Math.cos(a) * S * 0.72, hy + Math.sin(a) * S * 0.72, S * 0.24, '#ffe08a', '#ff8a3a', '#d8203a', edge, lw * 0.6); }
    const fg = ctx.createRadialGradient(hx - S * 0.12, hy - S * 0.16, S * 0.04, hx, hy, S * 0.5); fg.addColorStop(0, '#fff6c8'); fg.addColorStop(0.5, '#ffb347'); fg.addColorStop(1, '#e8402a');
    ctx.beginPath(); ctx.arc(hx, hy, S * 0.46, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
    // 目のまわりの金のくま取り、目、嘴（金のグラデーションに、鼻すじの光）
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + sd * S * 0.08, hy - S * 0.12); ctx.quadraticCurveTo(hx + sd * S * 0.3, hy - S * 0.34, hx + sd * S * 0.52, hy - S * 0.2); ctx.quadraticCurveTo(hx + sd * S * 0.3, hy - S * 0.02, hx + sd * S * 0.08, hy - S * 0.12); ctx.closePath(); ctx.fillStyle = goldGrad(ctx, hx, hy - S * 0.3, hx + sd * S * 0.5, hy); ctx.fill(); eyeGem(ctx, hx + sd * S * 0.25, hy - S * 0.15, S * 0.09, S * 0.075, sd * 0.2, '#6ee0ff', edge, 0); }
    ctx.beginPath(); ctx.moveTo(hx - S * 0.15, hy + S * 0.04); ctx.quadraticCurveTo(hx, hy - S * 0.03, hx + S * 0.15, hy + S * 0.04); ctx.quadraticCurveTo(hx + S * 0.06, hy + S * 0.4, hx, hy + S * 0.58); ctx.quadraticCurveTo(hx - S * 0.06, hy + S * 0.4, hx - S * 0.15, hy + S * 0.04); ctx.closePath();
    ctx.fillStyle = goldGrad(ctx, hx - S * 0.15, hy, hx + S * 0.15, hy + S * 0.55); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - S * 0.03, hy + S * 0.06); ctx.lineTo(hx - S * 0.01, hy + S * 0.45); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(0.5, S * 0.02); ctx.stroke();
    if (G) { const gr = G.createRadialGradient(hx, hy - S * 0.5, 0, hx, hy - S * 0.5, S * 1.6); gr.addColorStop(0, 'rgba(255,170,70,0.45)'); gr.addColorStop(1, 'rgba(255,170,70,0)'); G.fillStyle = gr; G.fillRect(hx - S * 1.6, hy - S * 2.1, S * 3.2, S * 3.2); }
  }
}
/** 白い絵 src を、色 col で塗った絵（覚えておく） */
const tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function tinted(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  let m = tintCache.get(src);
  if (!m) tintCache.set(src, (m = new Map()));
  let cv = m.get(col);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d')!;
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
    m.set(col, cv);
  }
  return cv;
}
/** 竜の皮を着る機種（火で反応させる装置） */
const isDragon = (e: Ent) => e.kind === 'reactor';

export function bodyMyth(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number, color: string, line: number) {
  const light = P.name === 'light', busy = !!e.busy, tt = calm ? 0 : t, ph = e.x * 1.7 + e.y * 2.3, half = u * 0.43, cut = u * 0.13;
  const pulse = busy ? 0.6 + 0.4 * Math.sin(tt * 3 + ph) : 0.25;
  // 台座のうしろに描く生き物の部分（竜の翼・ペリカンの翼）
  if (z >= 14) {
    if (isDragon(e)) dragonWings(ctx, P, cx, cy, u, color, line, busy, tt, ph);
    else if (e.kind === 'separator') pelicanWings(ctx, P, cx, cy, u, line, busy, tt, ph);
  }
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
  // 反応器は竜：縁が鱗の皮。動いているあいだ、鱗のすき間が熱で赤く光り、息をするように明滅する
  const dragon = isDragon(e) && z >= 12;
  if (dragon) {
    const d = dragonSkin(u, color, light);
    ctx.drawImage(d.skin, cx - u / 2, cy - u / 2, u, u);
    // 鱗の上のつや：左上から右下へ、光 → 影
    oct(ctx, cx, cy, half, cut);
    const sh = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
    sh.addColorStop(0, `rgba(255,244,214,${light ? 0.4 : 0.26})`); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, `rgba(0,0,12,${light ? 0.3 : 0.5})`);
    ctx.fillStyle = sh; ctx.fill();
    if (busy) {
      const prev = ctx.globalCompositeOperation;
      ctx.globalAlpha = 0.35 + 0.45 * pulse;
      // 白いすき間の絵を、熱の色（赤 → 橙）で重ねる：下に、その色の光を敷いてから
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      ctx.drawImage(tinted(d.seam, pulse > 0.75 ? '#ffb347' : '#ff5a2a'), cx - u / 2, cy - u / 2, u, u);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = prev;
    }
  }
  // 金の二重の縁
  oct(ctx, cx, cy, half, cut); ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = line * 1.9; ctx.stroke();
  oct(ctx, cx, cy, half, cut); ctx.strokeStyle = MYTH_GOLD; ctx.lineWidth = line * 1.05; ctx.stroke();
  oct(ctx, cx, cy, half - line * 0.2, cut); ctx.strokeStyle = 'rgba(255,248,214,0.8)'; ctx.lineWidth = Math.max(0.6, line * 0.25); ctx.stroke();
  // 真ん中の板（窓の中の絵の地）
  oct(ctx, cx, cy, u * 0.34, u * 0.08); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = light ? MYTH_GOLD_DARK : 'rgba(200,190,255,0.5)'; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
  // 四隅：竜は、台をつかむ爪。ほかは宝玉
  if (dragon && z >= 20) for (const [gx, gy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const jx = cx + gx * (half - cut * 0.5), jy = cy + gy * (half - cut * 0.5), L = u * 0.1;
    // 3 本の爪：角から外へ、少し開いて
    for (let k = -1; k <= 1; k++) {
      const a = Math.atan2(gy, gx) + k * 0.5, bx = jx - Math.cos(a) * L * 0.25, by = jy - Math.sin(a) * L * 0.25, px = -Math.sin(a) * L * 0.2, py = Math.cos(a) * L * 0.2;
      ctx.beginPath(); ctx.moveTo(bx + px, by + py); ctx.lineTo(jx + Math.cos(a) * L, jy + Math.sin(a) * L); ctx.lineTo(bx - px, by - py); ctx.closePath();
      ctx.fillStyle = light ? '#f4ead0' : '#e8dcc0'; ctx.fill(); ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = Math.max(0.7, line * 0.4); ctx.stroke();
    }
  } else if (z >= 20) for (const [gx, gy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const jx = cx + gx * (half - cut * 0.5), jy = cy + gy * (half - cut * 0.5), jr = Math.max(1.8, u * 0.04);
    if (busy) { ctx.fillStyle = `rgba(${rgbOf(color)},${0.35 * pulse})`; ctx.beginPath(); ctx.arc(jx, jy, jr * 2.3, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(jx, jy, jr, 0, TAU); ctx.fillStyle = busy ? mix(color, '#ffffff', 0.25 + 0.3 * pulse) : mix(color, P.plate, 0.45); ctx.fill();
    ctx.strokeStyle = light ? '#4a3208' : '#05030f'; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(jx - jr * 0.3, jy - jr * 0.3, jr * 0.3, 0, TAU); ctx.fill();
  }
  // 竜の頭（右上の角から外を向く）と尾（左下の角から巻く）
  if (dragon && z >= 16) dragonHeadTail(ctx, P, cx, cy, u, half, color, line, busy, pulse, tt, ph);
  else if (z >= 16 && e.kind === 'separator') pelicanHead(ctx, P, cx, cy, u, half, line, busy, tt, ph);
  else if (z >= 16 && e.kind === 'electrolyzer') twinSerpent(ctx, P, cx, cy, u, half, color, line, busy, pulse, tt, ph);
  else if (z >= 16 && e.kind === 'settler') slime(ctx, P, cx, cy, u, half, color, line, busy, tt, ph);
  else if (z >= 16 && e.kind === 'battery') thunderBeast(ctx, P, cx, cy, u, half, line, busy, pulse, tt, ph);
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
  // 獣（緑の獅子 → 不死鳥）：盤のうしろ
  if (z >= 8) hubBeast(ctx, P, cx, cy, R, w, tt);
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

  if (z >= 8) mythPillar(ctx, P, cx, ky - CH2 * 0.3, s, t);
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
  mythSky(ctx, P, cw, ch, t);
  mythSkyDragon(ctx, P, cw, ch, t, dt);
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

// =====================================================================
// 覚醒：地面の下の大魔法陣と光の脈、反応の瞬間の星、空を渡るもの
// =====================================================================
/**
 * 地面のすぐ上、設備の下に描く：納品所を中心にした大魔法陣（3 重の輪・十二芒星・逆に回る四角・刻み）、
 * 納品所から動いている装置へ伸びる光の脈（虹色の粒が流れる）、4 秒ごとに広がる波紋
 */
export function mythUnder(ctx: CanvasRenderingContext2D, P: Palette, sx: (x: number) => number, sy: (y: number) => number, z: number, t: number, hub: { x: number; y: number; s: number }, busy: [number, number][]) {
  const light = P.name === 'light', tt = calm ? 0 : t, hx = sx(hub.x + hub.s / 2), hy = sy(hub.y + hub.s / 2);
  const Rg = (hub.s / 2 + 5.5) * z, col = light ? '138,95,23' : P.glow, a0 = light ? 0.3 : 0.34;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // 光の脈：納品所から、動いている装置へ
  if (z >= 9) {
    const n = Math.min(busy.length, 48);
    for (let i = 0; i < n; i++) {
      const bx = sx(busy[i][0]), by = sy(busy[i][1]), dx = bx - hx, dy = by - hy, len = Math.hypot(dx, dy);
      if (len < z * 2 || len > z * 60) continue;
      const bend = (hash(busy[i][0], busy[i][1]) - 0.5) * 0.5, mx = (hx + bx) / 2 - dy * bend, my = (hy + by) / 2 + dx * bend;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.strokeStyle = `rgba(${col},${light ? 0.16 : 0.2})`; ctx.lineWidth = Math.max(1, z * 0.07); ctx.stroke();
      ctx.setLineDash([z * 0.02, z * 0.7]); ctx.lineDashOffset = -tt * z * 1.6 - i * z * 0.3;
      ctx.strokeStyle = hue(t, i * 0.07, 95, light ? 52 : 72, 0.95); ctx.lineWidth = Math.max(2, z * 0.12); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // 大魔法陣
  const lw0 = Math.max(1, z * 0.045);
  ctx.strokeStyle = `rgba(${col},${a0})`; ctx.lineWidth = lw0;
  for (const k of [1, 0.93, 0.62, 0.57]) { ctx.beginPath(); ctx.arc(hx, hy, Rg * k, 0, TAU); ctx.stroke(); }
  // 刻み（外の 2 つの輪のあいだ）：3 種類の印が巡る
  const ticks = 72, rot = tt * 0.05;
  ctx.beginPath();
  for (let i = 0; i < ticks; i++) {
    const a = rot + (i / ticks) * TAU, r0 = Rg * 0.94, r1 = Rg * 0.99, c = Math.cos(a), s0 = Math.sin(a);
    if (i % 3 === 0) { ctx.moveTo(hx + c * r0, hy + s0 * r0); ctx.lineTo(hx + c * r1, hy + s0 * r1); }
    else if (i % 3 === 1) { const a2 = a + 0.025; ctx.moveTo(hx + c * r0, hy + s0 * r0); ctx.lineTo(hx + Math.cos(a2) * r1, hy + Math.sin(a2) * r1); ctx.lineTo(hx + Math.cos(a2 + 0.025) * r0, hy + Math.sin(a2 + 0.025) * r0); }
    else { const rm = (r0 + r1) / 2; ctx.moveTo(hx + c * rm + lw0, hy + s0 * rm); ctx.arc(hx + c * rm, hy + s0 * rm, lw0, 0, TAU); }
  }
  ctx.stroke();
  // 十二芒星（5 つ飛ばしで結ぶ）と、逆に回る 2 つの四角
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const a = rot * 1.6 + ((i * 5) / 12) * TAU; ctx.lineTo(hx + Math.cos(a) * Rg * 0.93, hy + Math.sin(a) * Rg * 0.93); }
  ctx.strokeStyle = `rgba(${col},${a0 * 0.7})`; ctx.stroke();
  for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = -rot * 2.2 + k * (TAU / 8) + (i / 4) * TAU; ctx.lineTo(hx + Math.cos(a) * Rg * 0.57, hy + Math.sin(a) * Rg * 0.57); } ctx.closePath(); ctx.stroke(); }
  // 輪の上の 12 の星（虹の色が巡る）
  for (let i = 0; i < 12; i++) {
    const a = rot * 1.6 + (i / 12) * TAU, px = hx + Math.cos(a) * Rg * 0.93, py = hy + Math.sin(a) * Rg * 0.93;
    ctx.fillStyle = hue(t, i / 12, 95, light ? 55 : 72, light ? 0.75 : 0.9); star4(ctx, px, py, z * (0.22 + 0.06 * Math.sin(tt * 2 + i)), 0.32); ctx.fill();
  }
  // 波紋：納品所から広がる
  if (!calm) for (let k = 0; k < 2; k++) {
    const u = ((t / 4 + k * 0.5) % 1), r = Rg * 1.3 * u;
    ctx.strokeStyle = `rgba(${col},${(1 - u) * (light ? 0.3 : 0.4)})`; ctx.lineWidth = lw0 * (2.4 - u * 1.6);
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  if (G) {
    G.strokeStyle = `rgba(${P.glow},${light ? 0.08 : 0.22})`; G.lineWidth = Math.max(2, z * 0.14);
    G.beginPath(); G.arc(hx, hy, Rg * 0.96, 0, TAU); G.stroke();
  }
}

/** 反応の瞬間などの粒：star は回りながら飛ぶ星、mring は広がる紋章の輪。k は残りの割合（1 → 0） */
export function mythParticle(ctx: CanvasRenderingContext2D, P: Palette, kind: string, x: number, y: number, size: number, k: number, tint: string | undefined, t: number) {
  if (kind === 'star') {
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 4 + size);
    ctx.fillStyle = tint ?? P.hi; star4(ctx, 0, 0, size * (0.6 + 0.6 * k), 0.3); ctx.fill();
    ctx.fillStyle = '#ffffff'; star4(ctx, 0, 0, size * 0.35 * k, 0.4); ctx.fill();
    ctx.restore();
    if (G) { G.fillStyle = `rgba(${P.glow},${(P.name === 'light' ? 0.05 : 0.12) * k})`; G.beginPath(); G.arc(x, y, size * 1.2, 0, TAU); G.fill(); }
  } else {
    const r = size * (1.15 - k * 0.75);
    ctx.globalAlpha = k * 0.9;
    ctx.strokeStyle = tint ?? P.hi; ctx.lineWidth = Math.max(1.2, size * 0.05);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = t * 1.5 + (i / 8) * TAU; ctx.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); ctx.lineTo(x + Math.cos(a) * r * 1.12, y + Math.sin(a) * r * 1.12); } ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 納品所から立つ光の柱と、うしろで回る光の矢（納品所の絵の上に重ねる） */
export function mythPillar(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, s: number, t: number) {
  const light = P.name === 'light', tt = calm ? 0 : t, pw = s * 0.16, ph = s * 1.5, pulse = 0.75 + 0.25 * Math.sin(tt * 2.2);
  ctx.save();
  if (!light) ctx.globalCompositeOperation = 'lighter';
  // 回る光の矢
  for (let i = 0; i < 14; i++) {
    const a = tt * 0.12 + (i / 14) * TAU, len = s * (0.75 + 0.3 * ((i * 7) % 5) / 5), wd = 0.035 + 0.02 * (i % 3);
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.addColorStop(0, hue(t, i / 14, 95, light ? 62 : 70, light ? 0.2 : 0.26)); g.addColorStop(1, hue(t, i / 14, 95, 70, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - wd) * len, cy + Math.sin(a - wd) * len); ctx.lineTo(cx + Math.cos(a + wd) * len, cy + Math.sin(a + wd) * len); ctx.closePath(); ctx.fill();
  }
  // 光の柱：水晶の上から空へ
  const top = cy - s * 0.2 - ph, g = ctx.createLinearGradient(0, cy - s * 0.2, 0, top);
  g.addColorStop(0, `rgba(255,255,255,${(light ? 0.5 : 0.55) * pulse})`); g.addColorStop(0.35, hue(tt, 0.1, 95, light ? 72 : 68, (light ? 0.28 : 0.34) * pulse)); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - pw * 0.35, cy - s * 0.2); ctx.lineTo(cx + pw * 0.35, cy - s * 0.2); ctx.lineTo(cx + pw, top); ctx.lineTo(cx - pw, top); ctx.closePath(); ctx.fill();
  // 柱を昇る星
  if (!calm) for (let i = 0; i < 7; i++) {
    const u = (t * 0.22 + i / 7) % 1, x = cx + Math.sin(t * 1.3 + i * 2.4) * pw * (0.3 + u * 0.6), y = cy - s * 0.2 - ph * u;
    ctx.fillStyle = `rgba(255,255,255,${(1 - u) * 0.95})`; star4(ctx, x, y, s * 0.03 * (1.4 - u), 0.3); ctx.fill();
  }
  ctx.restore();
  if (G) {
    const gg = G.createLinearGradient(0, cy, 0, top);
    gg.addColorStop(0, `rgba(${P.glow},${light ? 0.16 : 0.4})`); gg.addColorStop(1, `rgba(${P.glow},0)`);
    G.fillStyle = gg; G.fillRect(cx - pw * 1.4, top, pw * 2.8, ph + s * 0.2);
  }
}

/** 星の海の空：満月と暈、空を渡る光の竜（45 秒に 1 度）。天空の庭の空：太陽と回る光の矢、レンズの光の玉、蝶 */
export function mythSky(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number) {
  const light = P.name === 'light', big = Math.max(cw, ch), tt = calm ? 0 : t;
  ctx.save();
  if (!light) {
    ctx.globalCompositeOperation = 'lighter';
    // 満月：暈（2 重の輪）と、淡い模様
    const mx = cw * 0.87, my = ch * 0.17, mr = big * 0.045;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4.2);
    halo.addColorStop(0, 'rgba(200,210,255,0.3)'); halo.addColorStop(0.4, 'rgba(150,130,255,0.1)'); halo.addColorStop(1, 'rgba(150,130,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(mx - mr * 4.2, my - mr * 4.2, mr * 8.4, mr * 8.4);
    const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    disc.addColorStop(0, 'rgba(255,255,250,0.85)'); disc.addColorStop(1, 'rgba(190,200,255,0.6)');
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(110,110,190,0.16)';
    for (const [ox, oy, r] of [[-0.3, -0.15, 0.24], [0.25, 0.2, 0.3], [0.1, -0.42, 0.14], [-0.38, 0.38, 0.16]]) { ctx.beginPath(); ctx.arc(mx + ox * mr, my + oy * mr, r * mr, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(190,200,255,0.12)'; ctx.lineWidth = 1.5;
    for (const k of [2.1, 3.2]) { ctx.beginPath(); ctx.arc(mx, my, mr * k, 0, TAU); ctx.stroke(); }
    // 光の竜：うねりながら左から右へ渡る。体は虹色の光の玉の連なり、背にひれ、頭に角とひげ
    if (!calm) {
      const u = (t % 45) / 14;
      if (u < 1.25) {
        const at = (q: number): [number, number] => [cw * (-0.25 + 1.5 * q), ch * (0.3 + 0.13 * Math.sin(q * 9 + 1) + 0.05 * Math.sin(q * 23))];
        const N = 54, gap = 0.0065;
        for (let i = N - 1; i >= 0; i--) {
          const q = u - i * gap; if (q < -0.05) continue;
          const [x, y] = at(q), [x2, y2] = at(q + 0.004), ang = Math.atan2(y2 - y, x2 - x), k = 1 - i / N, r = big * 0.012 * (0.25 + 0.9 * Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.62));
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
          g.addColorStop(0, hue(t * 0.5, i / N, 95, 78, 0.5)); g.addColorStop(0.45, hue(t * 0.5, i / N, 95, 60, 0.22)); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
          if (i % 3 === 0 && i > 2) { // 背びれ
            ctx.fillStyle = hue(t * 0.5, i / N, 95, 80, 0.4);
            ctx.beginPath(); ctx.moveTo(x + Math.cos(ang - 1.57) * r * 0.8, y + Math.sin(ang - 1.57) * r * 0.8); ctx.lineTo(x + Math.cos(ang - 2.2) * r * 2.4, y + Math.sin(ang - 2.2) * r * 2.4); ctx.lineTo(x + Math.cos(ang + 3.14) * r, y + Math.sin(ang + 3.14) * r); ctx.closePath(); ctx.fill();
          }
          if (i === 0) { // 頭：角、ひげ、目
            ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            for (const sgn of [-1, 1]) {
              ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(ang + sgn * 2.2) * r * 2, y + Math.sin(ang + sgn * 2.2) * r * 2, x + Math.cos(ang + sgn * 2.7) * r * 3.4, y + Math.sin(ang + sgn * 2.7) * r * 3.4); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r); ctx.quadraticCurveTo(x + Math.cos(ang + sgn * 0.8) * r * 3, y + Math.sin(ang + sgn * 0.8) * r * 3 + Math.sin(t * 5) * r * 0.5, x + Math.cos(ang + sgn * 1.5) * r * 4.5, y + Math.sin(ang + sgn * 1.5) * r * 4.5); ctx.stroke();
            }
            ctx.fillStyle = '#ffffff'; star4(ctx, x + Math.cos(ang) * r * 0.5, y + Math.sin(ang) * r * 0.5, r * 0.9, 0.3); ctx.fill();
          }
          // こぼれる星屑
          if (i % 5 === 2) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - k) + 0.2})`; star4(ctx, x + Math.sin(t * 3 + i) * r * 2, y + r * (1.5 + 2.5 * (1 - k)), r * 0.4, 0.3); ctx.fill(); }
        }
      }
    }
  } else {
    // 太陽：回る光の矢と、レンズの光の玉
    const sx0 = cw * 0.1, sy0 = ch * 0.1, sr = big * 0.05;
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 18; i++) {
      const a = tt * 0.05 + (i / 18) * TAU, len = big * (0.5 + 0.35 * ((i * 5) % 7) / 7), wd = 0.03 + 0.02 * (i % 2);
      const g = ctx.createLinearGradient(sx0, sy0, sx0 + Math.cos(a) * len, sy0 + Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,240,190,0.5)'); g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + Math.cos(a - wd) * len, sy0 + Math.sin(a - wd) * len); ctx.lineTo(sx0 + Math.cos(a + wd) * len, sy0 + Math.sin(a + wd) * len); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const sun = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, sr * 2.6);
    sun.addColorStop(0, 'rgba(255,255,240,0.9)'); sun.addColorStop(0.3, 'rgba(255,226,150,0.45)'); sun.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = sun; ctx.fillRect(sx0 - sr * 2.6, sy0 - sr * 2.6, sr * 5.2, sr * 5.2);
    // レンズの光の玉：太陽と画面の真ん中を結ぶ線の上
    [[0.35, 0.5, 0], [0.6, 0.9, 2], [0.85, 0.35, 4], [1.2, 1.3, 5], [1.5, 0.6, 1]].forEach(([d, r, c]) => {
      const fx = sx0 + (cw / 2 - sx0) * d * 1.3, fy = sy0 + (ch / 2 - sy0) * d * 1.3, rr0 = sr * r;
      ctx.strokeStyle = MYTH_RAINBOW[c] + '30'; ctx.lineWidth = 2; ctx.fillStyle = MYTH_RAINBOW[c] + '16';
      ctx.beginPath(); ctx.arc(fx, fy, rr0, 0, TAU); ctx.fill(); ctx.stroke();
    });
    // 蝶：羽ばたきながら、ゆるい輪を描いて飛ぶ
    for (let i = 0; i < 9; i++) {
      const sp = 0.05 + hash(i, 2.2) * 0.05, ph = hash(i, 4.4) * TAU;
      const x = cw * (0.5 + 0.46 * Math.sin(tt * sp + ph) + 0.06 * Math.sin(tt * sp * 3.7 + i)), y = ch * (0.48 + 0.36 * Math.sin(tt * sp * 1.31 + ph * 2) + 0.05 * Math.cos(tt * sp * 4.3 + i));
      const dir = Math.cos(tt * sp + ph) >= 0 ? 1 : -1, flap = Math.abs(Math.sin(t * (9 + i % 3) + i)), s0 = 6 + hash(i, 6.6) * 5, colr = MYTH_RAINBOW[i % 6];
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir * 0.25); ctx.globalAlpha = 0.85;
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.scale(sgn * (0.25 + 0.75 * flap), 1);
        ctx.fillStyle = colr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(s0 * 0.4, -s0 * 1.3, s0 * 1.5, -s0 * 1.1, s0 * 1.1, -s0 * 0.1); ctx.bezierCurveTo(s0 * 1.3, s0 * 0.7, s0 * 0.4, s0 * 0.9, 0, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(s0 * 0.75, -s0 * 0.45, s0 * 0.22, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(42,35,86,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#2a2356'; ctx.fillRect(-0.8, -s0 * 0.5, 1.6, s0);
      ctx.restore();
    }
  }
  ctx.restore();
}

// =====================================================================
// 生き物（その 3）：資源地の主、列車のムカデ竜、空を渡る竜、電池の雷獣
// =====================================================================
/** 資源地の主の種類 */
const GUARD: Record<string, 'kraken' | 'golem' | 'tar' | 'wisp' | 'treant' | 'ram'> = {
  sea: 'kraken', bay: 'kraken', sulfur: 'golem', limestone: 'golem', iron: 'golem', bauxite: 'golem', copper: 'golem', zinc: 'golem', lead: 'golem', phosphate: 'golem', sand: 'golem', fluorite: 'golem',
  coal: 'tar', oil: 'tar', gas: 'wisp', farm: 'treant', grove: 'treant', rubber: 'treant', forest: 'treant', ranch: 'ram',
};
/**
 * 資源地の主：名札の上に、その土地の生き物が 1 体。海にはクラーケン、鉱床には結晶のゴーレム（結晶は資源地の色）、
 * 炭田と油田には黒い泥の獣、ガス田には青い炎の精、畑と森には木の精、牧場には翼のある羊。ゆっくり息をし、ときどきまばたきする
 */
export function mythGuardian(ctx: CanvasRenderingContext2D, P: Palette, zone: string, x: number, y: number, z: number, t: number, tint: string) {
  const kind = GUARD[zone];
  if (!kind || z < 12) return;
  const light = P.name === 'light', edge = light ? '#2a1a04' : '#05030f', S = Math.max(14, z * 0.95), lw = Math.max(0.8, S * 0.03), tt = calm ? 0 : t;
  const ph = hash(x * 0.01 + zone.length, y * 0.01), breath = Math.sin(tt * 1.4 + ph * 6) * S * 0.02, blink = !calm && (tt * 0.31 + ph) % 1 > 0.94;
  const cx = x, cy = y - S * 1.55 + breath;
  const eyes = (ex: number, ey: number, gap: number, r: number, iris: string) => { for (const sd of [-1, 1]) { if (blink) { ctx.beginPath(); ctx.moveTo(ex + sd * gap - r, ey); ctx.lineTo(ex + sd * gap + r, ey); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke(); } else eyeGem(ctx, ex + sd * gap, ey, r, r * 0.8, 0, iris, edge, 0); } };
  ctx.save();
  // 足もとの影
  ctx.beginPath(); ctx.ellipse(cx, y - S * 0.95, S * 0.6, S * 0.1, 0, 0, TAU); ctx.fillStyle = P.shadow; ctx.fill();
  if (kind === 'kraken') {
    // 触手 6 本：根もとは太く、先は巻く。吸盤の点。体は、頭の明るい紫から下の深い藍へ
    const col = mix(tint, '#8a5ad8', 0.55);
    for (let i = 0; i < 6; i++) {
      const sd = i < 3 ? -1 : 1, k = (i % 3) / 2, a0 = Math.sin(tt * 1.6 + i * 1.3) * 0.25;
      const bx = cx + sd * S * (0.12 + k * 0.14), by = cy + S * 0.25, mx = bx + sd * S * (0.3 + k * 0.2), my = by + S * (0.35 - k * 0.1) + a0 * S * 0.2, ex = mx + sd * S * 0.18 * Math.cos(a0 * 3), ey = my - S * (0.22 + 0.1 * Math.sin(tt * 2 + i));
      for (const [wd, c] of [[S * 0.13 + lw * 2, edge], [S * 0.13, col]] as [number, string][]) { ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(mx, my + S * 0.15, ex, ey); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,220,240,0.55)'; ctx.lineWidth = S * 0.035; ctx.setLineDash([S * 0.02, S * 0.07]); ctx.beginPath(); ctx.moveTo(bx, by + S * 0.03); ctx.quadraticCurveTo(mx, my + S * 0.18, ex, ey + S * 0.02); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.moveTo(cx - S * 0.36, cy + S * 0.3); ctx.bezierCurveTo(cx - S * 0.5, cy - S * 0.2, cx - S * 0.3, cy - S * 0.75, cx, cy - S * 0.75); ctx.bezierCurveTo(cx + S * 0.3, cy - S * 0.75, cx + S * 0.5, cy - S * 0.2, cx + S * 0.36, cy + S * 0.3); ctx.quadraticCurveTo(cx, cy + S * 0.42, cx - S * 0.36, cy + S * 0.3); ctx.closePath();
    const g = ctx.createRadialGradient(cx - S * 0.15, cy - S * 0.45, S * 0.05, cx, cy - S * 0.1, S * 0.7); g.addColorStop(0, mix(col, '#ffffff', 0.6)); g.addColorStop(0.5, col); g.addColorStop(1, mix(col, '#0a0a3a', 0.65));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 1.2; ctx.stroke();
    // 頭の斑点と、つや
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(cx + (hash(i, 1.1) - 0.5) * S * 0.5, cy - S * (0.3 + hash(i, 2.2) * 0.35), S * (0.02 + hash(i, 3.3) * 0.03), 0, TAU); ctx.fillStyle = 'rgba(255,230,250,0.45)'; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(cx - S * 0.14, cy - S * 0.52, S * 0.1, S * 0.05, -0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    eyes(cx, cy + S * 0.02, S * 0.15, S * 0.085, '#ffd84a');
  } else if (kind === 'golem') {
    // 岩の体（面ごとに明暗の違う多角形）に、背から資源地の色の結晶が生える。胸に光る核
    const rock = light ? '#b8a890' : '#5a5270', cr = mix(tint, '#ffffff', 0.25);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42, L = S * (0.62 - Math.abs(i - 2) * 0.1), bx = cx + (i - 2) * S * 0.13, by = cy - S * 0.25, wd = S * 0.09, tx = bx + Math.cos(a) * L, ty = by + Math.sin(a) * L;
      ctx.beginPath(); ctx.moveTo(bx - wd, by); ctx.lineTo(tx - wd * 0.3, ty + wd); ctx.lineTo(tx, ty); ctx.lineTo(tx + wd * 0.5, ty + wd * 1.2); ctx.lineTo(bx + wd, by); ctx.closePath();
      const g = ctx.createLinearGradient(bx - wd, by, bx + wd, ty); g.addColorStop(0, mix(cr, '#ffffff', 0.6)); g.addColorStop(0.5, cr); g.addColorStop(1, mix(cr, '#1a0a3a', 0.5));
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.8; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
    }
    const body: [number, number][] = [[-0.45, -0.2], [-0.2, -0.42], [0.22, -0.42], [0.46, -0.18], [0.5, 0.25], [0.2, 0.55], [-0.22, 0.55], [-0.5, 0.25]];
    ctx.beginPath(); body.forEach(([px, py], i) => (i ? ctx.lineTo(cx + px * S, cy + py * S) : ctx.moveTo(cx + px * S, cy + py * S))); ctx.closePath();
    const g = ctx.createLinearGradient(cx - S * 0.5, cy - S * 0.4, cx + S * 0.5, cy + S * 0.55); g.addColorStop(0, mix(rock, '#ffffff', 0.45)); g.addColorStop(0.5, rock); g.addColorStop(1, mix(rock, '#000010', 0.55));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    // 面の稜線（割れ目）と、苔のような金の筋
    ctx.beginPath(); for (const [a, b] of [[0, 4], [1, 5], [2, 6], [3, 7]] as [number, number][]) { ctx.moveTo(cx + body[a][0] * S, cy + body[a][1] * S); ctx.lineTo(cx + (body[a][0] + body[b][0]) * S * 0.5 + S * 0.04, cy + (body[a][1] + body[b][1]) * S * 0.5); }
    ctx.strokeStyle = light ? 'rgba(60,40,10,0.35)' : 'rgba(0,0,0,0.45)'; ctx.lineWidth = lw * 0.6; ctx.stroke();
    // 腕（岩のこぶし）
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sd * S * 0.56, cy + S * 0.3 - breath, S * 0.14, S * 0.18, sd * 0.3, 0, TAU); const ag = ctx.createRadialGradient(cx + sd * S * 0.52, cy + S * 0.22, S * 0.02, cx + sd * S * 0.56, cy + S * 0.3, S * 0.18); ag.addColorStop(0, mix(rock, '#ffffff', 0.4)); ag.addColorStop(1, mix(rock, '#000010', 0.5)); ctx.fillStyle = ag; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke(); }
    // 胸の核：資源地の色に光る
    const pulse = 0.6 + 0.4 * Math.sin(tt * 2 + ph * 6), cg = ctx.createRadialGradient(cx, cy + S * 0.22, 0, cx, cy + S * 0.22, S * 0.2); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.35, cr); cg.addColorStop(1, `rgba(${rgbOf(cr)},0)`);
    ctx.globalAlpha = pulse; ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy + S * 0.22, S * 0.2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy + S * 0.12); ctx.lineTo(cx + S * 0.07, cy + S * 0.22); ctx.lineTo(cx, cy + S * 0.32); ctx.lineTo(cx - S * 0.07, cy + S * 0.22); ctx.closePath(); ctx.fillStyle = goldGrad(ctx, cx - S * 0.07, cy + S * 0.12, cx + S * 0.07, cy + S * 0.32); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.stroke();
    eyes(cx, cy - S * 0.12, S * 0.15, S * 0.07, cr);
  } else if (kind === 'tar') {
    // 黒い泥の獣：ゆれる山形の体に、虹色の油膜のつや。したたる雫。金の目
    ctx.beginPath(); ctx.moveTo(cx - S * 0.55, cy + S * 0.55);
    for (let i = 0; i <= 10; i++) { const k = i / 10, xx = cx - S * 0.55 + k * S * 1.1, hh = Math.sin(k * Math.PI) * S * (0.95 + 0.06 * Math.sin(tt * 2 + i)) + Math.sin(k * 9 + tt * 1.5) * S * 0.04; ctx.lineTo(xx, cy + S * 0.55 - hh); }
    ctx.lineTo(cx + S * 0.55, cy + S * 0.55); ctx.quadraticCurveTo(cx, cy + S * 0.68, cx - S * 0.55, cy + S * 0.55); ctx.closePath();
    const g = ctx.createLinearGradient(cx - S * 0.4, cy - S * 0.4, cx + S * 0.4, cy + S * 0.6); g.addColorStop(0, '#4a4458'); g.addColorStop(0.4, '#16121e'); g.addColorStop(1, '#020106');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.save(); ctx.clip();
    // 油膜：斜めに流れる虹
    for (let i = 0; i < 5; i++) { ctx.strokeStyle = hue(t * 0.5, i / 5, 90, 65, 0.35); ctx.lineWidth = S * 0.05; ctx.beginPath(); ctx.moveTo(cx - S * 0.6, cy - S * 0.1 + i * S * 0.12 + Math.sin(tt + i) * S * 0.03); ctx.bezierCurveTo(cx - S * 0.2, cy - S * 0.3 + i * S * 0.12, cx + S * 0.2, cy + S * 0.1 + i * S * 0.12, cx + S * 0.6, cy - S * 0.15 + i * S * 0.12); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx - S * 0.16, cy - S * 0.2, S * 0.1, S * 0.04, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    for (let i = 0; i < 3; i++) { const k = calm ? 0.3 : (tt * 0.5 + i * 0.37) % 1, dx = cx + (i - 1) * S * 0.3; ctx.beginPath(); ctx.ellipse(dx, cy + S * 0.5 + k * S * 0.2, S * 0.03, S * 0.05 * (1 - k * 0.5), 0, 0, TAU); ctx.fillStyle = `rgba(10,6,16,${1 - k})`; ctx.fill(); }
    eyes(cx, cy + S * 0.05, S * 0.16, S * 0.08, '#ffb347');
  } else if (kind === 'wisp') {
    // 青い炎の精（メタンの炎は青い）：外の青 → 中の水色 → 芯の白。ゆらめく 3 重の炎に、小さな顔
    for (const [k, c0, c1] of [[1, 'rgba(60,120,255,0.75)', 'rgba(60,120,255,0)'], [0.7, 'rgba(120,210,255,0.9)', 'rgba(120,210,255,0.1)'], [0.4, 'rgba(255,255,255,0.95)', 'rgba(200,240,255,0.3)']] as [number, string, string][]) {
      const w2 = S * 0.42 * k, h2 = S * 1.1 * k, wv = Math.sin(tt * 5 + k * 5) * S * 0.06, by = cy + S * 0.5;
      ctx.beginPath(); ctx.moveTo(cx - w2, by - h2 * 0.25); ctx.bezierCurveTo(cx - w2 * 1.1, by - h2 * 0.7, cx - w2 * 0.2 + wv, by - h2 * 0.8, cx + wv, by - h2); ctx.bezierCurveTo(cx + w2 * 0.3 + wv, by - h2 * 0.75, cx + w2 * 1.1, by - h2 * 0.7, cx + w2, by - h2 * 0.25); ctx.bezierCurveTo(cx + w2, by + h2 * 0.05, cx - w2, by + h2 * 0.05, cx - w2, by - h2 * 0.25); ctx.closePath();
      const g = ctx.createLinearGradient(cx, by, cx, by - h2); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fill();
    }
    eyes(cx, cy + S * 0.22, S * 0.1, S * 0.05, '#2a5ad8');
    if (G) { const gr = G.createRadialGradient(cx, cy, 0, cx, cy, S); gr.addColorStop(0, 'rgba(90,160,255,0.4)'); gr.addColorStop(1, 'rgba(90,160,255,0)'); G.fillStyle = gr; G.fillRect(cx - S, cy - S, S * 2, S * 2); }
  } else if (kind === 'treant') {
    // 木の精：木目の幹（縦の筋）、枝の腕、葉の冠は 3 色の葉を重ね、実（資源地の色）がなる
    const bark0 = light ? '#b08050' : '#6a4a38';
    ctx.beginPath(); ctx.moveTo(cx - S * 0.22, cy + S * 0.55); ctx.quadraticCurveTo(cx - S * 0.3, cy, cx - S * 0.18, cy - S * 0.2); ctx.lineTo(cx + S * 0.18, cy - S * 0.2); ctx.quadraticCurveTo(cx + S * 0.3, cy, cx + S * 0.22, cy + S * 0.55); ctx.quadraticCurveTo(cx + S * 0.34, cy + S * 0.62, cx + S * 0.4, cy + S * 0.6); ctx.lineTo(cx - S * 0.4, cy + S * 0.6); ctx.quadraticCurveTo(cx - S * 0.34, cy + S * 0.62, cx - S * 0.22, cy + S * 0.55); ctx.closePath();
    const g = ctx.createLinearGradient(cx - S * 0.3, cy, cx + S * 0.3, cy); g.addColorStop(0, mix(bark0, '#ffe0b0', 0.5)); g.addColorStop(0.5, bark0); g.addColorStop(1, mix(bark0, '#1a0a00', 0.6));
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(cx + i * S * 0.08, cy - S * 0.15); ctx.quadraticCurveTo(cx + i * S * 0.1 + Math.sin(i * 2.1) * S * 0.03, cy + S * 0.2, cx + i * S * 0.09, cy + S * 0.52); } ctx.strokeStyle = light ? 'rgba(70,40,10,0.4)' : 'rgba(0,0,0,0.4)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
    for (const sd of [-1, 1]) { ctx.strokeStyle = edge; ctx.lineWidth = S * 0.07 + lw * 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx + sd * S * 0.2, cy + S * 0.05); ctx.quadraticCurveTo(cx + sd * S * 0.45, cy + S * 0.05, cx + sd * S * 0.5, cy - S * 0.2 + breath * 2); ctx.stroke(); ctx.strokeStyle = bark0; ctx.lineWidth = S * 0.07; ctx.stroke(); }
    for (let i = 0; i < 22; i++) {
      const a = hash(i, 1.3) * TAU, r = S * (0.12 + hash(i, 2.7) * 0.34), lx = cx + Math.cos(a) * r, ly = cy - S * 0.5 + Math.sin(a) * r * 0.75 + breath, la = a + Math.sin(tt * 1.5 + i) * 0.15, ll = S * 0.2;
      const c = ['#2f9a4a', '#6fd86a', '#bfe86a'][i % 3];
      feather(ctx, lx, ly, lx + Math.cos(la) * ll, ly + Math.sin(la) * ll, S * 0.14, mix(c, '#0a3a1a', 0.5), c, mix(c, '#fff6b0', 0.6), edge, lw * 0.5);
    }
    for (let i = 0; i < 4; i++) { const a = hash(i, 8.8) * TAU, fx = cx + Math.cos(a) * S * 0.3, fy = cy - S * 0.5 + Math.sin(a) * S * 0.22 + breath, fg = ctx.createRadialGradient(fx - S * 0.02, fy - S * 0.02, 0, fx, fy, S * 0.06); fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.4, mix(tint, '#ffb0a0', 0.5)); fg.addColorStop(1, mix(tint, '#3a0a00', 0.4)); ctx.beginPath(); ctx.arc(fx, fy, S * 0.06, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.5; ctx.stroke(); }
    eyes(cx, cy + S * 0.05, S * 0.1, S * 0.055, '#7fd87a');
    ctx.beginPath(); ctx.arc(cx, cy + S * 0.22, S * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
  } else {
    // 翼のある羊：もこもこの毛（丸を重ね、1 つずつ陰影）、巻いた金の角、小さな羽根の翼
    for (const sd of [-1, 1]) for (let i = 3; i >= 0; i--) { const a = -0.9 + i * 0.35 + Math.sin(tt * 2 + ph) * 0.08, bx = cx + sd * S * 0.3, by = cy - S * 0.05; feather(ctx, bx, by, bx + sd * Math.cos(a) * S * 0.55, by + Math.sin(a) * S * 0.55, S * 0.14, '#ffffff', light ? '#fde8f0' : '#e6dcfa', '#ffd9a8', edge, lw * 0.5); }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, r = S * (i % 2 ? 0.34 : 0.26), px = cx + Math.cos(a) * r, py = cy + S * 0.12 + Math.sin(a) * r * 0.8, rr2 = S * 0.17;
      const g = ctx.createRadialGradient(px - rr2 * 0.3, py - rr2 * 0.35, rr2 * 0.1, px, py, rr2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, light ? '#f6eef2' : '#e2daf4'); g.addColorStop(1, light ? '#d8c4d0' : '#a89ad0');
      ctx.beginPath(); ctx.arc(px, py, rr2, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.6; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy + S * 0.12, S * 0.28, 0, TAU); ctx.fillStyle = light ? '#fbf6f8' : '#eee8fa'; ctx.fill();
    // 顔（桃色がかったクリーム色）と、巻いた角
    const fg = ctx.createRadialGradient(cx - S * 0.05, cy + S * 0.05, S * 0.02, cx, cy + S * 0.12, S * 0.22); fg.addColorStop(0, '#fff2e6'); fg.addColorStop(1, '#e8c4b0');
    ctx.beginPath(); ctx.ellipse(cx, cy + S * 0.14, S * 0.17, S * 0.2, 0, 0, TAU); ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
    for (const sd of [-1, 1]) { ctx.strokeStyle = edge; ctx.lineWidth = S * 0.075 + lw * 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx + sd * S * 0.24, cy + S * 0.02, S * 0.11, sd > 0 ? Math.PI * 1.1 : Math.PI * 1.9, sd > 0 ? Math.PI * 2.7 : Math.PI * 0.3, sd < 0); ctx.stroke(); ctx.strokeStyle = goldGrad(ctx, cx + sd * S * 0.13, cy - S * 0.1, cx + sd * S * 0.35, cy + S * 0.14); ctx.lineWidth = S * 0.075; ctx.stroke(); }
    eyes(cx, cy + S * 0.1, S * 0.075, S * 0.04, '#7a5a3a');
    ctx.beginPath(); ctx.ellipse(cx, cy + S * 0.22, S * 0.035, S * 0.022, 0, 0, TAU); ctx.fillStyle = '#e88aa0'; ctx.fill();
  }
  ctx.restore();
}

/**
 * 列車はムカデ竜：鱗の胴が 4 節（節ごとに少しうねる）、節ごとに金の背びれと、歩く足。先頭に角のある頭。
 * 積んでいるときは背の宝玉が番線の色に光る。前の列車を待っているときは、目が赤い。
 * 進む向きが +x になるよう回した座標で呼ぶ（L：長さ、Wd：幅）
 */
export function mythTrain(ctx: CanvasRenderingContext2D, P: Palette, L: number, Wd: number, col: string, loaded: boolean, held: boolean, moving: boolean, t: number) {
  const light = P.name === 'light', edge = light ? '#2a1404' : '#05030f', lw = Math.max(0.7, Wd * 0.07), n = 4, seg = (L * 1.25) / n, sr = Math.max(3, Wd * 0.13), tt = calm || !moving ? 0 : t;
  // 影
  ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(-L * 0.1, Wd * 0.35, L * 0.75, Wd * 0.45, 0, 0, TAU); ctx.fill();
  for (let i = n - 1; i >= 0; i--) {
    const x = L * 0.45 - (i + 0.5) * seg, y = Math.sin(tt * 9 - i * 1.1) * Wd * 0.1, r = Wd * (0.52 - i * 0.05);
    // 足：節の両わきに 1 対。交互に前後へ
    for (const sd of [-1, 1]) { const sw = Math.sin(tt * 14 + i * 1.6 + (sd > 0 ? 0 : Math.PI)) * seg * 0.3; ctx.strokeStyle = edge; ctx.lineWidth = lw * 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + sd * r * 0.7); ctx.lineTo(x + sw * 0.4, y + sd * r * 1.25); ctx.lineTo(x + sw, y + sd * r * 1.55); ctx.stroke(); ctx.strokeStyle = mix(col, '#ffe9a0', 0.5); ctx.lineWidth = lw; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x, y, seg * 0.62, r, 0, 0, TAU);
    skinFill(ctx, col, light, x - seg * 0.6, y - r, x + seg * 0.6, y + r, sr, edge, lw);
    // 背びれ（金のひし形）と、積み荷の宝玉
    ctx.beginPath(); ctx.moveTo(x - seg * 0.28, y); ctx.lineTo(x, y - r * 0.32); ctx.lineTo(x + seg * 0.28, y); ctx.lineTo(x, y + r * 0.32); ctx.closePath(); ctx.fillStyle = goldGrad(ctx, x - seg * 0.28, y - r * 0.3, x + seg * 0.28, y + r * 0.3); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.5; ctx.stroke();
    if (loaded && i > 0) { const g = ctx.createRadialGradient(x - r * 0.08, y - r * 0.08, 0, x, y, r * 0.22); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, mix(col, '#ffffff', 0.4)); g.addColorStop(1, mix(col, '#000010', 0.4)); ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.4; ctx.stroke(); }
  }
  // 頭
  const hx = L * 0.5, hy = Math.sin(tt * 9 + 0.6) * Wd * 0.08, S = Wd * 0.62;
  for (const sd of [-1, 1]) horn(ctx, [[hx - S * 0.3, hy + sd * S * 0.3], [hx - S * 0.7, hy + sd * S * 0.5], [hx - S * 1.1, hy + sd * S * 0.95], [hx - S * 0.5, hy + sd * S * 0.75], [hx - S * 0.05, hy + sd * S * 0.5]], edge, lw * 0.7);
  ctx.beginPath(); ctx.moveTo(hx - S * 0.5, hy - S * 0.55); ctx.bezierCurveTo(hx + S * 0.2, hy - S * 0.7, hx + S * 0.9, hy - S * 0.3, hx + S * 0.95, hy); ctx.bezierCurveTo(hx + S * 0.9, hy + S * 0.3, hx + S * 0.2, hy + S * 0.7, hx - S * 0.5, hy + S * 0.55); ctx.quadraticCurveTo(hx - S * 0.7, hy, hx - S * 0.5, hy - S * 0.55); ctx.closePath();
  skinFill(ctx, col, light, hx - S * 0.5, hy - S * 0.6, hx + S, hy + S * 0.6, sr, edge, lw * 1.1);
  // ひげ（先がゆれる）
  for (const sd of [-1, 1]) { ctx.strokeStyle = goldGrad(ctx, hx + S * 0.8, hy, hx + S * 1.6, hy + sd * S * 0.6); ctx.lineWidth = lw * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx + S * 0.85, hy + sd * S * 0.15); ctx.quadraticCurveTo(hx + S * 1.3, hy + sd * S * 0.2, hx + S * 1.5, hy + sd * S * (0.55 + 0.15 * Math.sin(tt * 7 + sd))); ctx.stroke(); }
  for (const sd of [-1, 1]) eyeGem(ctx, hx + S * 0.25, hy + sd * S * 0.3, S * 0.17, S * 0.12, sd * 0.3, held ? '#ff3a3a' : '#f6c644', edge, held ? 1 : 0);
}

/**
 * 空を渡る竜：ときどき、画面の端から端へ、長い竜が身をくねらせて渡る（遠くを飛ぶ影。星の海では月明かりの青白い縁、天空の庭では雲の色）。
 * 胴は、背から腹へのグラデーションの帯。背びれ、2 対の翼、たなびくひげ
 */
let skyDragon: { x: number; y: number; dir: number; age: number; next: number } = { x: 0, y: 0, dir: 1, age: -1, next: 8 };
export function mythSkyDragon(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number, dt: number) {
  if (calm) return;
  const d = skyDragon;
  if (d.age < 0) { d.next -= dt; if (d.next > 0) return; d.age = 0; d.dir = Math.random() < 0.5 ? 1 : -1; d.y = ch * (0.12 + Math.random() * 0.3); d.x = d.dir > 0 ? -cw * 0.35 : cw * 1.35; }
  d.age += dt; d.x += d.dir * cw * 0.085 * dt;
  if (d.x < -cw * 0.4 || d.x > cw * 1.4) { d.age = -1; d.next = 18 + Math.random() * 25; return; }
  const light = P.name === 'light', S = Math.max(cw, ch) * 0.022, n = 34, pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) { const k = i / (n - 1); pts.push([d.x - d.dir * k * S * 16, d.y + Math.sin(t * 2.2 - k * 7) * S * (0.9 + k * 0.8) + Math.sin(t * 0.7) * S, S * (0.55 * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k * 0.85) + 0.05)]); }
  ctx.save();
  ctx.globalAlpha = light ? 0.5 : 0.72;
  const c0 = light ? '#ffffff' : '#bfd0ff', c1 = light ? '#e8c8f0' : '#3a3a8a', rim = light ? 'rgba(255,190,220,0.9)' : 'rgba(190,220,255,0.9)';
  // 翼 2 対（胴の 2 か所から、上へ。羽ばたく）
  for (const wi of [5, 13]) {
    const p = pts[wi], fl = Math.sin(t * 3.2 + wi) * 0.5, L = S * (wi === 5 ? 5.2 : 3.6);
    for (const up of [-1, 1]) {
      const tx = p[0] - d.dir * L * 0.35, ty = p[1] + up * L * (0.55 + fl * 0.3 * up);
      ctx.beginPath(); ctx.moveTo(p[0] + d.dir * S * 0.6, p[1]); ctx.quadraticCurveTo(p[0] + d.dir * L * 0.2, p[1] + up * L * 0.5, tx, ty);
      for (let q = 1; q <= 3; q++) ctx.quadraticCurveTo(tx - d.dir * L * (0.05 + q * 0.12) , ty - up * L * (q * 0.2 - 0.1), tx - d.dir * L * q * 0.2, ty - up * L * q * 0.19);
      ctx.lineTo(p[0] - d.dir * S * 1.2, p[1]); ctx.closePath();
      const g = ctx.createLinearGradient(p[0], p[1], tx, ty); g.addColorStop(0, c1); g.addColorStop(1, light ? 'rgba(255,220,240,0.5)' : 'rgba(120,150,255,0.35)');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // 胴：背（明るい）と腹（暗い）の 2 本の帯で、丸みを出す
  const side = (s: number) => { for (let i = 0; i < n; i++) { const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; const x = p[0] - (dy / l) * p[2] * s, y = p[1] + (dx / l) * p[2] * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } };
  ctx.beginPath(); side(1); for (let i = n - 1; i >= 0; i--) { const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; ctx.lineTo(p[0] + (dy / l) * p[2], p[1] - (dx / l) * p[2]); } ctx.closePath();
  const bg = ctx.createLinearGradient(0, d.y - S * 2, 0, d.y + S * 2); bg.addColorStop(0, c0); bg.addColorStop(1, c1);
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.stroke();
  // 鱗の点線と、背びれ
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.setLineDash([S * 0.25, S * 0.3]); ctx.strokeStyle = light ? 'rgba(200,120,170,0.5)' : 'rgba(20,20,70,0.55)'; ctx.lineWidth = S * 0.35; ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = light ? 'rgba(255,200,120,0.9)' : 'rgba(255,230,150,0.9)';
  for (let i = 2; i < n - 3; i += 2) { const p = pts[i], q = pts[i + 1]; ctx.beginPath(); ctx.moveTo(p[0], p[1] - p[2]); ctx.lineTo((p[0] + q[0]) / 2 - d.dir * S * 0.3, (p[1] + q[1]) / 2 - p[2] * 1.9); ctx.lineTo(q[0], q[1] - q[2]); ctx.closePath(); ctx.fill(); }
  // 頭：角 2 本、ひげ、光る目
  const h = pts[0];
  ctx.beginPath(); ctx.moveTo(h[0] - d.dir * S * 0.5, h[1] - S * 0.6); ctx.quadraticCurveTo(h[0] + d.dir * S * 0.9, h[1] - S * 0.5, h[0] + d.dir * S * 1.5, h[1]); ctx.quadraticCurveTo(h[0] + d.dir * S * 0.9, h[1] + S * 0.5, h[0] - d.dir * S * 0.5, h[1] + S * 0.6); ctx.closePath(); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = light ? 'rgba(255,200,120,0.95)' : 'rgba(255,230,150,0.95)'; ctx.lineWidth = Math.max(1, S * 0.14); ctx.lineCap = 'round';
  for (const up of [-1, 1]) { ctx.beginPath(); ctx.moveTo(h[0] - d.dir * S * 0.2, h[1] + up * S * 0.4); ctx.quadraticCurveTo(h[0] - d.dir * S * 1.0, h[1] + up * S * 0.7, h[0] - d.dir * S * 1.6, h[1] + up * S * 1.3); ctx.stroke(); }
  ctx.lineWidth = Math.max(0.8, S * 0.07); for (const up of [-1, 1]) { ctx.beginPath(); ctx.moveTo(h[0] + d.dir * S * 1.3, h[1] + up * S * 0.1); ctx.bezierCurveTo(h[0] + d.dir * S * 1.8, h[1] + up * S * 0.8, h[0] + d.dir * S * 0.6, h[1] + up * S * 1.4 + Math.sin(t * 3 + up) * S * 0.3, h[0] - d.dir * S * 0.6, h[1] + up * S * 1.5 + Math.sin(t * 3) * S * 0.4); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = light ? '#ff6a9a' : '#fff6b0'; ctx.beginPath(); ctx.arc(h[0] + d.dir * S * 0.55, h[1] - S * 0.15, Math.max(1.2, S * 0.14), 0, TAU); ctx.fill();
  if (G) { G.fillStyle = light ? 'rgba(255,160,200,0.25)' : 'rgba(160,200,255,0.35)'; G.beginPath(); G.arc(h[0], h[1], S * 2.2, 0, TAU); G.fill(); }
  ctx.restore();
}

/**
 * 電池の雷獣：右上の角に、稲妻の形の角をもつ獣の頭（青みの毛は、束ごとに根もとの藍から先の白へ）。左下に、稲妻の形の尾。
 * 動いているあいだ、毛が逆立ち、角のあいだに火花が散る
 */
function thunderBeast(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, half: number, line: number, busy: boolean, pulse: number, t: number, ph: number) {
  const light = P.name === 'light', edge = light ? '#0a1a3a' : '#05030f', lw = Math.max(0.8, line * 0.55), S = u * 0.2, up = busy ? 1.25 : 1;
  // 尾：稲妻の形（金のグラデーション）
  const tx = cx - half * 0.86, ty = cy + half * 0.86, zz: [number, number][] = [[0, 0], [-0.12, 0.02], [-0.07, -0.05], [-0.2, -0.04], [-0.14, -0.11], [-0.3, -0.13], [-0.17, -0.02], [-0.22, 0.04], [-0.08, 0.07]];
  ctx.beginPath(); zz.forEach(([px, py], i) => (i ? ctx.lineTo(tx + px * u, ty + py * u) : ctx.moveTo(tx + px * u, ty + py * u))); ctx.closePath();
  ctx.fillStyle = goldGrad(ctx, tx - u * 0.3, ty - u * 0.13, tx, ty + u * 0.07); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
  const hx = cx + half * 0.82, hy = cy - half * 0.84;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-Math.PI / 4);
  // たてがみ：うしろへ流れる毛の束
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i - 4) * 0.24, Lm = S * (1.1 - Math.abs(i - 4) * 0.08) * up + (busy && !calm ? Math.sin(t * 12 + i * 2) * S * 0.08 : 0);
    feather(ctx, -S * 0.2, Math.sin(a) * S * 0.2, -S * 0.2 + Math.cos(a) * Lm, Math.sin(a) * Lm, S * 0.3, '#1a2a7a', '#5aa0ff', '#f0faff', edge, lw * 0.6);
  }
  // 角：稲妻の形 2 本
  for (const sd of [-1, 1]) { const b: [number, number][] = [[0, 0.3], [-0.35, 0.55], [-0.15, 0.6], [-0.6, 1.0], [-0.1, 0.78], [-0.3, 0.75], [0.2, 0.42]]; ctx.beginPath(); b.forEach(([px, py], i) => (i ? ctx.lineTo(px * S, sd * py * S) : ctx.moveTo(px * S, sd * py * S))); ctx.closePath(); ctx.fillStyle = goldGrad(ctx, -S * 0.6, sd * S, S * 0.2, sd * S * 0.3); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 0.7; ctx.lineJoin = 'round'; ctx.stroke(); }
  // 顔：鼻先のとがった獣。額の白から、あごの藍へ
  ctx.beginPath(); ctx.moveTo(-S * 0.45, -S * 0.5); ctx.bezierCurveTo(S * 0.2, -S * 0.6, S * 0.7, -S * 0.25, S * 1.1, 0); ctx.bezierCurveTo(S * 0.7, S * 0.25, S * 0.2, S * 0.6, -S * 0.45, S * 0.5); ctx.quadraticCurveTo(-S * 0.65, 0, -S * 0.45, -S * 0.5); ctx.closePath();
  const g = ctx.createLinearGradient(-S * 0.5, -S * 0.5, S, S * 0.5); g.addColorStop(0, '#f0faff'); g.addColorStop(0.5, '#6ab0ff'); g.addColorStop(1, '#1a2a7a');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw * 1.2; ctx.stroke();
  // 頬の稲妻の紋、鼻、目
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(S * 0.05, sd * S * 0.42); ctx.lineTo(S * 0.3, sd * S * 0.3); ctx.lineTo(S * 0.22, sd * S * 0.4); ctx.lineTo(S * 0.5, sd * S * 0.26); } ctx.strokeStyle = MYTH_GOLD; ctx.lineWidth = lw * 0.9; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(S * 1.02, 0, S * 0.08, S * 0.1, 0, 0, TAU); ctx.fillStyle = '#0a1030'; ctx.fill();
  for (const sd of [-1, 1]) eyeGem(ctx, S * 0.3, sd * S * 0.22, S * 0.13, S * 0.09, sd * 0.35, busy ? mix('#ffe86a', '#ffffff', 0.5 * pulse) : '#ffe86a', edge, busy ? pulse * 0.6 : 0);
  // 火花：角のあいだを、短い稲妻が飛ぶ
  if (busy && !calm) {
    const seed = Math.floor(t * 18);
    ctx.beginPath(); ctx.moveTo(-S * 0.6, -S); for (let i = 1; i < 6; i++) ctx.lineTo(-S * 0.6 + (hash(i + seed, ph) - 0.5) * S * 0.5, -S + (i / 6) * S * 2); ctx.lineTo(-S * 0.6, S);
    ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = Math.max(0.8, S * 0.07); ctx.lineJoin = 'miter'; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.4, S * 0.025); ctx.stroke();
  }
  ctx.restore();
  if (G && busy) { const gr = G.createRadialGradient(hx, hy, 0, hx, hy, S * 2); gr.addColorStop(0, `rgba(140,200,255,${0.4 * pulse})`); gr.addColorStop(1, 'rgba(140,200,255,0)'); G.fillStyle = gr; G.fillRect(hx - S * 2, hy - S * 2, S * 4, S * 4); }
}
