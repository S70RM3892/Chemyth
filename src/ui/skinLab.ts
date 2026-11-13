/**
 * 研究所スキンの絵：床、装置、ベルト、納品所、空気、資源地の札、選んだものの印。
 *  白の研究棟（ライト）：白い陶板の床、銀の縁とガラスの装置、青緑の立体映像。照明は天井いっぱいから回り込む。
 *  深夜のラボ（ダーク）：黒く磨いた床に、青緑と赤紫の灯が映る。光の帯と立体映像。
 * render.ts からは短い呼び出しで使う。重い絵（床の区画、装置の殻と影）は一度描いてためておくので、
 * 毎コマの重さは、ほかのスキンと変わらない。
 */
import { ELEMENTS } from '../content/elements';
import { ZONES, isSea, zoneAt } from '../content/map';
import { MACHINES } from '../content/machines';
import { SEP_PORTS, isSep, sepReady, sepSlots, type SepKind } from '../content/sep';
import { label, sub } from '../content/substances';
import { DX, DY, STATION_CAP, currentGoal, fedTier, goalCount, goalRate, inDoors, isMachine, outPort, portDir, requiredOf, sizeOf, slotPort, type Ent, type World } from '../engine/world';
import { LAB_MAGENTA, mix, onThemeChange, type Palette } from './theme';
import { drawElement, sprite } from './token';

const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
const TAU = Math.PI * 2;
/** 青緑（明るいテーマ・暗いテーマ）の r,g,b */
const TEAL_L = '17,183,201', TEAL_D = '46,240,224';

// ---- 1 コマごとの状態（render が draw のはじめに渡す）----
let G: CanvasRenderingContext2D | null = null, MK: CanvasRenderingContext2D | null = null, flat = true, calm = false;
/** 毎コマのはじめに呼ぶ。glow：光の層・mask：効果の層（高画質のときだけ）、three：立体表示か、calmNow：動きを減らす設定か */
export function labFrame(glow: CanvasRenderingContext2D | null, mask: CanvasRenderingContext2D | null, three: boolean, calmNow: boolean) { G = glow; MK = mask; flat = !three; calm = calmNow; }

const hash = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** 区画ごとに決まった乱数（同じ区画は、いつも同じ絵になる） */
function rngOf(cx: number, cy: number, salt: number) {
  let a = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** ぼかした影（一度だけ描く絵に使う。毎コマ使うと重い）。大きさと位置はマス単位、blur もマス単位。
 *  形は絵の外（左）に描き、影だけを、ずらして絵の中に落とす */
function blurShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, blur: number, dx: number, dy: number, color: string) {
  const k = g.getTransform().a, BIG = g.canvas.width * 2 + 200;
  g.save();
  g.shadowColor = color; g.shadowBlur = blur * k; g.shadowOffsetX = BIG + dx * k; g.shadowOffsetY = dy * k;
  rr(g, x - BIG / k, y, w, h, r); g.fillStyle = '#000'; g.fill();
  g.restore();
}

// =====================================================================
// 床
// =====================================================================
/**
 * 研究所の床の 1 区画（ためておく絵）。TS は 1 マスの画素数、CH は区画のマス数。
 * 2×2 マスで 1 枚の、つやのある陶板。継ぎ目、8 マスごとの伸縮の目地、マスの角の小さな印（数えやすいように）、
 * 床に埋めた光の帯、配線の溝、六角の点検口。資源地は色で塗った封じ込めの区画、海と入り江は冷却水のプール。
 */
export function buildChunkLab(P: Palette, cx: number, cy: number, TS: number, CH: number): HTMLCanvasElement {
  const SIZE = TS * CH, cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, light = P.name === 'light', r = rngOf(cx, cy, 13);
  const free = (tx: number, ty: number) => !zoneAt(ox + tx, oy + ty);
  g.fillStyle = P.paper; g.fillRect(0, 0, SIZE, SIZE);

  // 陶板：1 枚ごとに、わずかに色が違う。左上から照らされた照り
  const PN = 2, PW = PN * TS;
  const sheen = g.createLinearGradient(0, 0, PW, PW);
  sheen.addColorStop(0, light ? 'rgba(255,255,255,0.75)' : 'rgba(160,220,255,0.075)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, light ? 'rgba(30,60,80,0.08)' : 'rgba(0,0,0,0.26)');
  for (let j = 0; j < CH / PN; j++) for (let i = 0; i < CH / PN; i++) {
    const x = i * PW, y = j * PW, h0 = hash(ox / PN + i, oy / PN + j);
    g.fillStyle = light ? `rgba(255,255,255,${0.16 + h0 * 0.3})` : `rgba(110,170,210,${0.012 + h0 * 0.03})`;
    g.fillRect(x, y, PW, PW);
    g.save(); g.translate(x, y); g.fillStyle = sheen; g.fillRect(0, 0, PW, PW); g.restore();
  }
  // 天井の照明の映り込み（明るいテーマは白い光の板、暗いテーマは青緑と赤紫の灯）
  const blob = (rx: number, ry: number, rgb: string, a: number) => {
    const x = rx + r() * (SIZE - rx * 2), y = ry + r() * (SIZE - ry * 2);
    g.save(); g.translate(x, y); g.scale(rx / ry, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(-ry, -ry, ry * 2, ry * 2); g.restore();
  };
  if (light) { for (let k = 0; k < 2; k++) blob(26 + r() * 22, 70 + r() * 70, '255,255,255', 0.42); }
  else for (let k = 0; k < 2; k++) blob(22 + r() * 20, 60 + r() * 80, r() < 0.62 ? TEAL_D : LAB_MAGENTA, 0.045 + r() * 0.035);
  // 細かいむら
  g.fillStyle = light ? 'rgba(40,70,90,0.06)' : 'rgba(170,230,255,0.04)';
  for (let i = 0; i < 240; i++) g.fillRect(r() * SIZE, r() * SIZE, 1, 1);

  // 継ぎ目：細い溝と、その下の縁の照り。8 マスごとは太い目地
  const seam = (vert: boolean, at: number, big: boolean) => {
    const p = at * TS, wd = big ? 2 : 1;
    g.fillStyle = light ? `rgba(40,66,84,${big ? 0.2 : 0.12})` : `rgba(0,0,0,${big ? 0.95 : 0.75})`;
    if (vert) g.fillRect(p - wd / 2, 0, wd, SIZE); else g.fillRect(0, p - wd / 2, SIZE, wd);
    g.fillStyle = light ? 'rgba(255,255,255,0.95)' : `rgba(140,210,240,${big ? 0.12 : 0.07})`;
    if (vert) g.fillRect(p + wd / 2, 0, 1, SIZE); else g.fillRect(0, p + wd / 2, SIZE, 1);
  };
  for (let i = 0; i <= CH; i += PN) { seam(true, i, mod(ox + i, 8) === 0); seam(false, i, mod(oy + i, 8) === 0); }
  // マスの角の小さな十字（陶板の継ぎ目がない所だけ）
  g.fillStyle = light ? 'rgba(40,66,84,0.16)' : 'rgba(120,220,240,0.12)';
  for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
    if (i % PN === 0 && j % PN === 0) continue;
    g.fillRect(i * TS - 2, j * TS - 0.5, 4, 1); g.fillRect(i * TS - 0.5, j * TS - 2, 1, 4);
  }

  // 床に埋めた光の帯（継ぎ目に沿って。暗いテーマでは高画質で本当に光る）
  g.lineCap = 'round';
  const strips = Math.floor(r() * 2.6);
  for (let k = 0; k < strips; k++) {
    const vert = r() < 0.5, at = PN * (1 + Math.floor(r() * (CH / PN - 1))), a0 = Math.floor(r() * (CH - 7)), len = 3 + Math.floor(r() * 5), mag = !light && r() < 0.3;
    let ok = true;
    for (let q = a0; q < a0 + len; q++) if (!(vert ? free(at, q) && free(at - 1, q) : free(q, at) && free(q, at - 1))) ok = false;
    if (!ok) continue;
    const x0 = vert ? at * TS : a0 * TS + 5, y0 = vert ? a0 * TS + 5 : at * TS, x1 = vert ? x0 : (a0 + len) * TS - 5, y1 = vert ? (a0 + len) * TS - 5 : y0;
    const rgb = light ? TEAL_L : mag ? LAB_MAGENTA : TEAL_D;
    for (const [wd, col] of [[9, `rgba(${rgb},${light ? 0.12 : 0.14})`], [4, `rgba(${rgb},${light ? 0.3 : 0.4})`], [1.6, light ? `rgba(${rgb},0.95)` : mag ? '#ffd9f6' : '#dafffb']] as [number, string][]) {
      g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  // 配線の溝：格子のふたの下に、色の違う線が通る
  if (r() < 0.4) {
    const vert = r() < 0.5, at = 1 + Math.floor(r() * (CH - 2)), a0 = Math.floor(r() * (CH - 9)), len = 5 + Math.floor(r() * 5);
    let ok = true;
    for (let q = a0; q < a0 + len; q++) if (!(vert ? free(at, q) && free(at - 1, q) : free(q, at) && free(q, at - 1))) ok = false;
    if (ok) {
      g.save();
      const p = at * TS, s0 = a0 * TS + 6, s1 = (a0 + len) * TS - 6, half = 6;
      if (vert) { g.translate(p, 0); g.rotate(Math.PI / 2); g.translate(0, -p); }
      // ここからは横向きの溝として描く（縦なら回してある）
      const y = p;
      g.fillStyle = light ? 'rgba(40,66,84,0.2)' : 'rgba(0,0,0,0.7)'; g.fillRect(s0, y - half, s1 - s0, half * 2);
      const cables = light ? ['#2a9fb0', '#e08a3c', '#8a96a1'] : ['#19808c', '#8a4a2c', '#3c4a59'];
      cables.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(s0 + 2, y - 3 + i * 3); g.lineTo(s1 - 2, y - 3 + i * 3); g.stroke(); });
      g.fillStyle = light ? 'rgba(255,255,255,0.8)' : 'rgba(120,170,200,0.2)';
      for (let x = s0 + 3; x < s1 - 2; x += 5) g.fillRect(x, y - half, 1, half * 2);
      g.fillStyle = light ? 'rgba(40,66,84,0.4)' : 'rgba(0,0,0,0.9)'; g.fillRect(s0, y - half - 1, s1 - s0, 1);
      g.fillStyle = light ? '#ffffff' : 'rgba(140,210,240,0.12)'; g.fillRect(s0, y + half, s1 - s0, 1);
      for (const x of [s0 - 3, s1 - 3]) { g.fillStyle = light ? '#c3ced6' : '#263241'; g.fillRect(x, y - half - 1, 6, half * 2 + 2); }
      g.restore();
    }
  }
  // 六角の点検口：床になじむ色の、細い銀の縁と 6 本のねじ、小さな表示灯
  const hatches = r() < 0.3 ? 1 : 0;
  for (let k = 0; k < hatches; k++) {
    const tx = 1 + Math.floor(r() * (CH - 2)), ty = 1 + Math.floor(r() * (CH - 2));
    if (!free(tx, ty) || !free(tx + 1, ty) || !free(tx, ty + 1) || !free(tx - 1, ty) || !free(tx, ty - 1)) continue;
    const x = tx * TS + TS / 2, y = ty * TS + TS / 2, R = TS * 0.66;
    const hex = (rad: number) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.closePath(); };
    hex(R + 1); g.fillStyle = light ? 'rgba(40,66,84,0.16)' : 'rgba(0,0,0,0.8)'; g.fill();
    hex(R); g.fillStyle = light ? 'rgba(236,241,244,0.9)' : '#0c131b'; g.fill(); g.strokeStyle = light ? 'rgba(150,166,178,0.7)' : '#1d2834'; g.lineWidth = 1.2; g.stroke();
    hex(R * 0.7); g.strokeStyle = light ? 'rgba(40,66,84,0.14)' : 'rgba(120,200,230,0.08)'; g.lineWidth = 1; g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3; g.fillStyle = light ? '#8d9aa5' : '#3a4a5b';
      g.beginPath(); g.arc(x + Math.cos(a) * R * 0.84, y + Math.sin(a) * R * 0.84, 1.3, 0, TAU); g.fill();
    }
    g.fillStyle = light ? `rgba(${TEAL_L},0.8)` : 'rgba(127,252,241,0.8)'; g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill();
  }

  // 資源地：封じ込めの区画（資源の色に塗り、点の網）。海と入り江は冷却水のプール
  const tiles: [number, number, string, boolean][] = [];
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
    const zn = zoneAt(ox + tx, oy + ty);
    if (!zn) continue;
    const core = ZONES[zn].tint[1], px = tx * TS, py = ty * TS, sea = isSea(zn);
    tiles.push([tx, ty, zn, sea]);
    if (sea) {
      g.fillStyle = light ? '#69c6d6' : '#04303b'; g.fillRect(px, py, TS, TS);
      // 底のタイルの目地と、ゆれる光の網
      g.fillStyle = light ? 'rgba(255,255,255,0.28)' : 'rgba(90,220,240,0.09)'; g.fillRect(px, py, TS, 1); g.fillRect(px, py, 1, TS);
      g.strokeStyle = light ? 'rgba(255,255,255,0.62)' : 'rgba(110,240,255,0.3)'; g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < 2; k++) {
        const wx = px + 2 + hash(ox + tx + k * 9, oy + ty) * (TS - 14), wy = py + 5 + hash(ox + tx, oy + ty + k * 7) * (TS - 10);
        g.moveTo(wx, wy); g.quadraticCurveTo(wx + 3, wy - 3, wx + 6, wy); g.quadraticCurveTo(wx + 9, wy + 3, wx + 12, wy);
      }
      g.stroke();
    } else {
      g.fillStyle = mix(P.paper, core, light ? 0.42 : 0.3); g.fillRect(px, py, TS, TS);
      g.fillStyle = light ? mix(core, '#16222d', 0.3) : mix(core, '#ffffff', 0.25);
      g.globalAlpha = light ? 0.4 : 0.35;
      for (let j = 3; j < TS; j += 6) for (let i = 3 + (j % 12 === 3 ? 0 : 3); i < TS; i += 6) g.fillRect(px + i - 0.75, py + j - 0.75, 1.5, 1.5);
      g.globalAlpha = 1;
    }
  }
  // 区画の縁：プールは銀の縁、封じ込めの区画は資源の色の帯と光る線（暗いテーマでは高画質で光る）
  for (const [tx, ty, zn, sea] of tiles) {
    const core = ZONES[zn as keyof typeof ZONES].tint[1], px = tx * TS, py = ty * TS, x = ox + tx, y = oy + ty;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (zoneAt(x + dx, y + dy) === zn) continue;
      // 縁の帯を、マスの内側に描く（at：外側からの深さ、wd：幅）
      const band = (at: number, wd: number, col: string) => {
        g.fillStyle = col;
        if (dx === 1) g.fillRect(px + TS - at - wd, py, wd, TS);
        else if (dx === -1) g.fillRect(px + at, py, wd, TS);
        else if (dy === 1) g.fillRect(px, py + TS - at - wd, TS, wd);
        else g.fillRect(px, py + at, TS, wd);
      };
      if (sea) {
        band(0, 5, light ? '#c4d0d8' : '#283544');
        band(0, 1, light ? '#ffffff' : 'rgba(140,220,255,0.3)');
        band(5, 1, light ? 'rgba(20,60,80,0.35)' : 'rgba(0,0,0,0.8)');
      } else {
        band(0, 3, light ? mix(core, '#16222d', 0.3) : mix(core, '#05080c', 0.35));
        band(4.5, 1.5, light ? mix(core, '#ffffff', 0.2) : mix(core, '#ffffff', 0.5));
        // 封じ込めの柵の柱（マスごとに 1 つ）
        g.fillStyle = light ? `rgb(${TEAL_L})` : mix(core, '#ffffff', 0.7);
        const mx = dx ? (dx === 1 ? px + TS - 4.5 : px + 1.5) : px + TS / 2 - 1.5, my = dy ? (dy === 1 ? py + TS - 4.5 : py + 1.5) : py + TS / 2 - 1.5;
        g.fillRect(mx, my, 3, 3);
      }
    }
  }
  return cv;
}

// =====================================================================
// 装置
// =====================================================================
/** 殻の絵の余白（マス）：影と手前の側面の分。TH：手前の側面の高さ（マス） */
const M = 0.3, TH = 0.14;
/** 窓の半分の大きさ（装置の一辺に対する割合）。1 マスの装置は、縁と状態の帯の場所を残すため少し小さい */
const winOf = (sz: number) => (sz === 1 ? 0.31 : 0.34);
interface Shell { under: HTMLCanvasElement; base: HTMLCanvasElement; over: HTMLCanvasElement }
const shells = new Map<string, Shell>();
/** 殻の絵を捨てる（絵の分のメモリもすぐ返す。参照を外すだけでは GC まで残る） */
const dropShell = (s: Shell) => { for (const c of [s.under, s.base, s.over]) c.width = c.height = 0; };
onThemeChange(() => { for (const s of shells.values()) dropShell(s); shells.clear(); });
/** 殻の細かさ（1 マスの画素数）。画面の大きさに合わせて、この中から選ぶ */
const BUCKETS = [24, 48, 96, 160];
const bucketOf = (need: number) => BUCKETS.find((b) => b >= need * 0.85) ?? BUCKETS[BUCKETS.length - 1];
function layer(sz: number, px: number) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil((sz + M * 2) * px);
  const g = c.getContext('2d')!;
  g.setTransform(px, 0, 0, px, M * px, M * px);
  return { c, g };
}
const round = (kind: string) => kind === 'reactor';
function windowPath(g: CanvasRenderingContext2D, kind: string, sz: number, inset = 0) {
  const c = sz / 2, W = winOf(sz) * sz - inset;
  if (round(kind)) { g.beginPath(); g.arc(c, c, W, 0, TAU); } else rr(g, c - W, c - W, W * 2, W * 2, 0.07 * sz - inset);
}
/**
 * 装置の殻を描いてためておく。under：床の影と手前の側面、base：天面（つやのある白、夜は黒いガラス）・銀の縁・機種の色の帯・窓のくぼみ、
 * over：窓のガラスの照り（中身の絵の上に重ねる）
 */
function shellOf(P: Palette, kind: string, color: string, sz: number, px: number): Shell {
  const key = `${P.key}|${kind}|${sz}|${px}`;
  let s = shells.get(key);
  if (s) { shells.delete(key); shells.set(key, s); return s; }
  const light = P.name === 'light', b0 = 0.08 * sz, bw = 0.84 * sz, R = 0.12 * sz;
  // 影と側面
  const U = layer(sz, px), g = U.g;
  blurShadow(g, b0 - 0.03, b0 + 0.02, bw + 0.06, bw + 0.04, R, 0.34, 0.03, 0.16, light ? 'rgba(30,52,70,0.2)' : 'rgba(0,0,0,0.7)');
  blurShadow(g, b0, b0, bw, bw, R, 0.09, 0.03, TH + 0.04, light ? 'rgba(30,52,70,0.32)' : 'rgba(0,0,0,0.8)');
  rr(g, b0, b0 + TH, bw, bw, R);
  const sg = g.createLinearGradient(0, b0 + bw - R, 0, b0 + bw + TH);
  sg.addColorStop(0, light ? '#e3e9ed' : '#1f2b39'); sg.addColorStop(0.6, light ? '#b9c4cc' : '#0d141d'); sg.addColorStop(1, light ? '#8e9ba5' : '#04070b');
  g.fillStyle = sg; g.fill();
  g.strokeStyle = light ? 'rgba(22,34,45,0.55)' : '#010306'; g.lineWidth = 0.022; g.stroke();
  // 天面
  const B = layer(sz, px), h = B.g;
  rr(h, b0, b0, bw, bw, R);
  const tg = h.createLinearGradient(b0, b0, b0 + bw, b0 + bw);
  if (light) { tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.6, '#f1f4f6'); tg.addColorStop(1, '#dce3e8'); }
  else { tg.addColorStop(0, '#283646'); tg.addColorStop(0.55, '#162130'); tg.addColorStop(1, '#0b121a'); }
  h.fillStyle = tg; h.fill();
  // 斜めに走る照りの帯
  h.save(); rr(h, b0, b0, bw, bw, R); h.clip();
  h.translate(b0, b0); h.rotate(-Math.PI / 4);
  const band = h.createLinearGradient(0, bw * 0.18, 0, bw * 0.52);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.35, `rgba(255,255,255,${light ? 0.75 : 0.07})`); band.addColorStop(1, 'rgba(255,255,255,0)');
  h.fillStyle = band; h.fillRect(-bw, bw * 0.18, bw * 3, bw * 0.34);
  h.restore();
  // 銀の縁と、外の輪郭
  const rim = h.createLinearGradient(b0, b0, b0 + bw, b0 + bw);
  rim.addColorStop(0, light ? '#ffffff' : '#c6d8e4'); rim.addColorStop(0.45, light ? '#c2ccd4' : '#56697b'); rim.addColorStop(1, light ? '#7b8995' : '#161f2a');
  rr(h, b0 + 0.022, b0 + 0.022, bw - 0.044, bw - 0.044, R * 0.84); h.strokeStyle = rim; h.lineWidth = 0.045; h.stroke();
  rr(h, b0, b0, bw, bw, R); h.strokeStyle = light ? 'rgba(22,34,45,0.6)' : '#02050a'; h.lineWidth = 0.022; h.stroke();
  if (!light) {
    // 夜：左上の縁に赤紫、右下の縁に青緑の灯が映る
    const nl = h.createLinearGradient(b0, b0, b0 + bw, b0 + bw);
    nl.addColorStop(0, `rgba(${LAB_MAGENTA},0.5)`); nl.addColorStop(0.32, `rgba(${LAB_MAGENTA},0)`); nl.addColorStop(0.62, `rgba(${TEAL_D},0)`); nl.addColorStop(1, `rgba(${TEAL_D},0.75)`);
    rr(h, b0 + 0.05, b0 + 0.05, bw - 0.1, bw - 0.1, R * 0.7); h.strokeStyle = nl; h.lineWidth = 0.02; h.stroke();
  }
  // 機種の色の帯（上の縁）
  h.lineCap = 'round'; h.strokeStyle = color; h.lineWidth = 0.032;
  h.beginPath(); h.moveTo(b0 + R + 0.04, b0 + 0.068); h.lineTo(b0 + bw - R - 0.04, b0 + 0.068); h.stroke();
  // 窓のくぼみ：上の縁に落ちる陰りと、内側の青緑の細い光
  const c0 = sz / 2, W = winOf(sz) * sz;
  windowPath(h, kind, sz); h.fillStyle = light ? '#e3ecf1' : '#070e16'; h.fill();
  h.save(); windowPath(h, kind, sz); h.clip();
  const ig = h.createLinearGradient(0, c0 - W, 0, c0 - W * 0.45);
  ig.addColorStop(0, light ? 'rgba(30,60,80,0.2)' : 'rgba(0,0,0,0.65)'); ig.addColorStop(1, 'rgba(0,0,0,0)');
  h.fillStyle = ig; h.fillRect(c0 - W, c0 - W, W * 2, W);
  h.restore();
  windowPath(h, kind, sz); h.strokeStyle = light ? 'rgba(22,34,45,0.55)' : '#000000'; h.lineWidth = 0.026; h.stroke();
  windowPath(h, kind, sz, 0.022); h.strokeStyle = light ? `rgba(${TEAL_L},0.6)` : `rgba(${TEAL_D},0.55)`; h.lineWidth = 0.012; h.stroke();
  // 窓のガラスの照り（左上から斜めに、はっきりした縁で切れる）
  const O = layer(sz, px), o = O.g;
  o.save(); windowPath(o, kind, sz, 0.015); o.clip();
  const hg = o.createLinearGradient(c0 - W, c0 - W, c0 + W * 0.1, c0 + W * 0.1);
  hg.addColorStop(0, `rgba(255,255,255,${light ? 0.42 : 0.14})`); hg.addColorStop(0.42, `rgba(255,255,255,${light ? 0.1 : 0.035})`); hg.addColorStop(0.43, 'rgba(255,255,255,0)');
  o.fillStyle = hg; o.fillRect(c0 - W, c0 - W, W * 2, W * 2);
  o.restore();
  o.lineCap = 'round'; o.strokeStyle = `rgba(255,255,255,${light ? 0.95 : 0.4})`; o.lineWidth = 0.016;
  o.beginPath();
  if (round(kind)) o.arc(c0, c0, W - 0.035, Math.PI * 1.08, Math.PI * 1.42);
  else { o.moveTo(c0 - W + 0.05, c0 - W * 0.3); o.lineTo(c0 - W + 0.05, c0 - W + 0.1); o.quadraticCurveTo(c0 - W + 0.05, c0 - W + 0.05, c0 - W + 0.1, c0 - W + 0.05); o.lineTo(c0 - W * 0.35, c0 - W + 0.05); }
  o.stroke();
  // 天面の縁の小さなきらめき
  o.fillStyle = `rgba(255,255,255,${light ? 1 : 0.6})`;
  o.beginPath(); o.arc(b0 + R * 0.55, b0 + R * 0.55, 0.022, 0, TAU); o.fill();
  s = { under: U.c, base: B.c, over: O.c };
  shells.set(key, s);
  if (shells.size > 96) { const [k0, s0] = shells.entries().next().value!; shells.delete(k0); dropShell(s0); }
  return s;
}

/** render の中だけにある絵の道具（装置の中身、電解槽の極、電池の稲妻） */
export interface LabKit {
  glyph(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, u: number, t: number, line: number): void;
  poleMarks(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, pu: number, line: number): void;
  powerMark(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, t: number): void;
}
/** 窓の中の絵に使う色（夜は、窓の黒いガラスに合わせて台を少し明るく） */
const inner = new Map<string, Palette>();
const innerOf = (P: Palette) => { let q = inner.get(P.key); if (!q) { q = P.name === 'light' ? P : { ...P, plate: '#17222f' }; inner.set(P.key, q); } return q; };

/**
 * 研究所の装置：ためておいた殻（影・側面・天面・銀の縁・窓）の上に、窓の中の反応の様子、ガラスの照り、
 * 出口の銀の口と矢じり、入口の青緑の山形、手前の側面の状態の帯（稼働＝青緑で進み具合、原料待ち＝橙、設定待ち・詰まり＝赤の点滅）、
 * 機種の札（立体映像）を描く
 */
export function machineLab(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number, kit: LabKit) {
  const info = MACHINES[e.kind as keyof typeof MACHINES], light = P.name === 'light';
  const unset = isMachine(e.kind) && !e.recipe;
  const needs = unset || (e.kind === 'analyzer' && !e.test) || (isSep(e.kind) && !sepReady(e.kind, e.test)) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
  const jam = (e.stuck || 0) > 2.5 || !!e.bad || (e.kind === 'station' && e.role === 'out' && (e.buf?.length ?? 0) >= STATION_CAP), busy = !!e.busy;
  const sz = sizeOf(e), pu = u / sz, line = Math.max(1.4, u * 0.04);
  const sh = shellOf(P, e.kind, info.color, sz, bucketOf(pu * (ctx.getTransform().a || 1)));
  const S = pu * (sz + M * 2), ox = cx - pu * (sz / 2 + M), oy = cy - pu * (sz / 2 + M);
  // 立体表示の 2×2 の装置は、本物の箱が側面と影をつけるので、殻の下の絵は描かない
  const skirt = flat || sz === 1;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (skirt) ctx.drawImage(sh.under, ox, oy, S, S);
  ctx.drawImage(sh.base, ox, oy, S, S);
  const W = winOf(sz) * u;
  if (busy) {
    // 動いている間は、窓の中が青緑に灯る
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 1.05);
    g2.addColorStop(0, `rgba(${P.glow},${light ? 0.24 : 0.32})`); g2.addColorStop(1, `rgba(${P.glow},0)`);
    ctx.fillStyle = g2; ctx.fillRect(cx - W, cy - W, W * 2, W * 2);
  }
  kit.glyph(ctx, innerOf(P), e, cx, cy, u * 0.8, t, line * 0.8);
  ctx.drawImage(sh.over, ox, oy, S, S);

  // 出口：銀の口と、中身の色の矢じり。入口：黒い受け口に青緑の山形
  const EO = sz === 2 ? 0.43 : 0.47, mx = e.x + sz / 2, my = e.y + sz / 2;
  const chrome = light ? '#c9d3da' : '#3d4b5b', edge = light ? 'rgba(22,34,45,0.8)' : '#010409', plain = light ? '#ffffff' : '#dff7fb';
  const port = (d: number, color: string, text?: string, ox2 = 0, oy2 = 0, s?: string) => {
    const bx = cx + ox2 * pu, by = cy + oy2 * pu;
    ctx.save();
    ctx.translate(bx + DX[d] * pu * EO, by + DY[d] * pu * EO);
    ctx.rotate((d * Math.PI) / 2);
    ctx.lineWidth = line * 0.55; ctx.strokeStyle = edge;
    rr(ctx, -pu * 0.03, -pu * 0.12, pu * 0.11, pu * 0.24, pu * 0.035); ctx.fillStyle = chrome; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pu * 0.22, 0); ctx.lineTo(pu * 0.09, -pu * 0.105); ctx.lineTo(pu * 0.09, pu * 0.105); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    ctx.restore();
    if (sz === 2 && s && z >= 26) {
      // 何が出る出口かを、出口のすぐ内側に絵柄で示す
      const d2 = pu * 0.44, ix = bx + DX[d] * pu * 0.1, iy = by + DY[d] * pu * 0.1;
      ctx.beginPath(); ctx.arc(ix, iy, d2 * 0.52, 0, TAU);
      ctx.fillStyle = light ? '#ffffff' : '#0d1620'; ctx.fill();
      ctx.strokeStyle = light ? `rgba(${TEAL_L},0.9)` : `rgba(${TEAL_D},0.8)`; ctx.lineWidth = Math.max(1, line * 0.45); ctx.stroke();
      ctx.drawImage(sprite(s), ix - d2 / 2, iy - d2 / 2, d2, d2);
    } else if (text && z >= 48) {
      ctx.font = `700 ${pu * 0.12}px ${FONT_MONO}`; ctx.textAlign = 'center';
      ctx.fillStyle = P.ink;
      ctx.fillText(text, cx + DX[d] * u * 0.22 + (DY[d] ? u * 0.2 : 0), cy + DY[d] * u * 0.25 + (DX[d] ? u * 0.25 : 0));
    }
  };
  for (const dr of inDoors(e)) {
    ctx.save();
    ctx.translate(cx + (dr.x + 0.5 - mx) * pu - DX[dr.d] * pu * (EO + 0.03), cy + (dr.y + 0.5 - my) * pu - DY[dr.d] * pu * (EO + 0.03));
    ctx.rotate((dr.d * Math.PI) / 2);
    rr(ctx, -pu * 0.07, -pu * 0.15, pu * 0.12, pu * 0.3, pu * 0.04); ctx.fillStyle = light ? '#33424f' : '#02060b'; ctx.fill();
    ctx.strokeStyle = light ? `rgb(${TEAL_L})` : `rgb(${TEAL_D})`; ctx.lineWidth = Math.max(1.2, line * 0.6);
    ctx.beginPath(); ctx.moveTo(-pu * 0.04, -pu * 0.08); ctx.lineTo(pu * 0.025, 0); ctx.lineTo(-pu * 0.04, pu * 0.08); ctx.stroke();
    ctx.restore();
  }
  if (e.kind === 'extractor' || e.kind === 'depot' || e.kind === 'sampler' || e.kind === 'sensor' || e.kind === 'gate' || (e.kind === 'lift' && e.role === 'out')) port(e.dir, plain);
  else if (e.kind === 'analyzer') { port(portDir(e.dir, 0), '#7fc06a', '陽'); port(portDir(e.dir, 1), P.red, '陰'); }
  else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), plain);
  else if (e.kind === 'station') { if (e.role === 'out') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, plain, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); } }
  else if (e.kind === 'tank') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, plain, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  else if (isSep(e.kind)) { if (sepReady(e.kind, e.test)) sepSlots(e.kind).forEach((i, k) => { const p = slotPort(e, i); port(p.d, ['#9fd0e6', '#c9b27a', '#b9a0d6'][k], SEP_PORTS[e.kind as SepKind][k], p.x + 0.5 - mx, p.y + 0.5 - my); }); }
  else if (e.outOrder) e.outOrder.forEach((s2, i) => { const p = outPort(e, i); port(p.d, sub(s2).color, label(s2), p.x + 0.5 - mx, p.y + 0.5 - my, s2); });
  else if (unset) { const p = slotPort(e, 0); port(p.d, plain, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  if (e.kind === 'electrolyzer' && e.big) kit.poleMarks(ctx, P, e, cx, cy, pu, line);
  if ((e.pw || 0) > 0) kit.powerMark(ctx, P, cx, cy, u, t);

  // 状態の帯：手前の側面に埋めた光の帯（側面がないときは天面の手前の縁）。色だけに頼らないよう、模様も変える
  const st = needs || jam ? 3 : busy ? 0 : e.recipe || e.test || e.sub || e.kind === 'extractor' ? 1 : 2;
  const lx0 = cx - u * 0.3, lw = u * 0.6, lh = Math.max(1.6, pu * (skirt ? 0.05 : 0.035));
  const ly = skirt ? cy + u * 0.42 + pu * TH * 0.48 : cy + u * 0.42 - pu * 0.045;
  ctx.fillStyle = light ? 'rgba(18,30,42,0.6)' : 'rgba(0,0,0,0.85)'; ctx.fillRect(lx0 - 1, ly - lh / 2 - 1, lw + 2, lh + 2);
  const on = st === 0 ? (light ? `rgb(${TEAL_L})` : '#62fff1') : st === 1 ? '#ffb02e' : st === 3 ? (Math.sin(t * 9) > 0 ? P.red : mix(P.red, '#000000', 0.6)) : light ? '#7b8995' : '#2a3542';
  if (st === 0) {
    // 稼働：進み具合まで満ち、先頭の光が走る
    ctx.fillStyle = light ? `rgba(${TEAL_L},0.3)` : `rgba(${TEAL_D},0.22)`; ctx.fillRect(lx0, ly - lh / 2, lw, lh);
    ctx.fillStyle = on; ctx.fillRect(lx0, ly - lh / 2, lw * Math.min(1, e.prog || 0), lh);
    if (!calm) { const hx = lx0 + lw * ((t * 0.9 + e.x * 0.13) % 1); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.fillRect(hx - lh, ly - lh / 2, lh * 2, lh); ctx.globalAlpha = 1; }
  } else {
    // 原料待ちは点線、設定待ち・詰まりは全体、止まっているものは暗い点線
    ctx.fillStyle = on;
    if (st === 3) ctx.fillRect(lx0, ly - lh / 2, lw, lh);
    else for (let i = 0; i < 6; i++) ctx.fillRect(lx0 + (lw * i) / 6 + lw * 0.02, ly - lh / 2, lw / 6 - lw * 0.04, lh);
  }
  if (G && st !== 2) { G.fillStyle = st === 0 ? `rgba(${P.glow},0.55)` : st === 1 ? 'rgba(255,176,46,0.45)' : 'rgba(255,79,123,0.5)'; G.fillRect(lx0 - lh, ly - lh * 1.5, lw + lh * 2, lh * 3); }

  // 機種の札：立体映像の小さな札（拡大したときだけ）
  if (z >= 34 && !unset) {
    const ts = pu * 0.3, tx = cx - u * 0.44, ty = cy - u * 0.44;
    rr(ctx, tx - 1.5, ty - 1.5, ts + 3, ts + 3, ts * 0.28); ctx.strokeStyle = light ? `rgba(${TEAL_L},0.85)` : `rgba(${TEAL_D},0.8)`; ctx.lineWidth = Math.max(1, line * 0.35); ctx.stroke();
    rr(ctx, tx, ty, ts, ts, ts * 0.22); ctx.fillStyle = info.color; ctx.fill(); ctx.strokeStyle = light ? '#ffffff' : '#02060b'; ctx.lineWidth = Math.max(1, line * 0.45); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${ts * 0.62}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.glyph, tx + ts / 2, ty + ts / 2 + ts * 0.03); ctx.textBaseline = 'alphabetic';
  }
  // 設定が要る「？」、詰まっている「！」
  if (needs || jam) {
    if (needs) {
      ctx.strokeStyle = P.red; ctx.lineWidth = line * 1.15;
      ctx.setLineDash([u * 0.1, u * 0.08]); ctx.lineDashOffset = calm ? 0 : -t * u * 0.2;
      rr(ctx, cx - u * 0.45, cy - u * 0.45, u * 0.9, u * 0.9, u * 0.14); ctx.stroke();
      ctx.setLineDash([]);
    }
    const bx = cx + u * 0.33, by = cy - u * 0.33, br = Math.max(6, pu * 0.16);
    ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fillStyle = P.red; ctx.fill();
    ctx.strokeStyle = light ? '#ffffff' : '#02060b'; ctx.lineWidth = Math.max(1.2, line * 0.5); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${br * 1.3}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(jam ? '！' : '？', bx, by + br * 0.05); ctx.textBaseline = 'alphabetic';
  }
}

// =====================================================================
// ベルト：磁気浮上のレール（固体）と、ガラスの管（液体・気体）。流れる向きに光の山形が走る
// =====================================================================
type BK = 'solid' | 'liquid' | 'gas' | 'none';
export interface LabBelt { e: Ent; c: { ax: number; ay: number; bx: number; by: number } }
export function labBelts(ctx: CanvasRenderingContext2D, P: Palette, z: number, t: number, speed: number, belts: LabBelt[], pass: (style: (k: BK) => void) => void, far: boolean, veryFar: boolean, sx: (x: number) => number, sy: (y: number) => number) {
  const light = P.name === 'light', W: Record<BK, number> = { solid: 0.58, liquid: 0.46, gas: 0.36, none: 0.52 };
  const edge = Math.max(1.2, z * 0.04), tube = (k: BK) => k === 'liquid' || k === 'gas';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (!far) {
    // 浮いているので、影は少し離れて落ちる
    ctx.save(); ctx.translate(z * 0.05, z * 0.13);
    ctx.strokeStyle = light ? 'rgba(30,52,70,0.15)' : 'rgba(0,0,0,0.55)';
    pass((k) => { ctx.lineWidth = z * W[k] + edge * 2; });
    ctx.restore();
  }
  // 外の輪郭 → 銀のレール（固体）／ガラス（液体・気体）→ 中の床または液
  ctx.strokeStyle = light ? '#7f8c97' : '#02060b';
  pass((k) => { ctx.lineWidth = z * W[k] + edge * 2; });
  pass((k) => { ctx.strokeStyle = tube(k) ? (light ? '#eef8fb' : '#132433') : light ? '#e2e9ee' : '#3a4a5b'; ctx.lineWidth = z * W[k]; });
  pass((k) => {
    if (tube(k)) { ctx.strokeStyle = light ? mix(P.line[k], '#ffffff', 0.15) : mix(P.line[k], '#081018', 0.1); ctx.lineWidth = z * W[k] * 0.62; }
    else { ctx.strokeStyle = light ? '#f7fafb' : '#121b26'; ctx.lineWidth = z * W[k] * 0.74; }
  });
  if (veryFar) return;
  // 固体のレールの中央の溝（浮かせる磁石の列）
  ctx.beginPath();
  for (const b of belts) {
    if (tube((b.e.st ?? 'none') as BK)) continue;
    const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5);
    ctx.moveTo(cx + b.c.ax * z, cy + b.c.ay * z); ctx.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z);
  }
  ctx.strokeStyle = light ? '#c4ced6' : '#060a10'; ctx.lineWidth = z * 0.19; ctx.stroke();
  if (!light) ctx.globalCompositeOperation = 'lighter';
  // 溝と管の中の、うすい光の筋
  pass((k) => { ctx.strokeStyle = light ? `rgba(${TEAL_L},${tube(k) ? 0.35 : 0.5})` : `rgba(${TEAL_D},${tube(k) ? 0.3 : 0.38})`; ctx.lineWidth = Math.max(1, z * 0.035); });
  ctx.globalCompositeOperation = 'source-over';
  if (!far) {
    // ガラスの映り込み（管）と、レールの縁の照り（固体）
    ctx.save(); ctx.translate(-z * 0.03, -z * 0.075); ctx.globalAlpha = light ? 0.9 : 0.3; ctx.strokeStyle = '#ffffff';
    pass((k) => { ctx.lineWidth = Math.max(1, z * (tube(k) ? 0.03 : 0.022)); });
    ctx.restore(); ctx.globalAlpha = 1;
    // つなぎ目：マスの入口ごとに、浮上の輪（銀の短い帯と青緑の点）
    ctx.lineCap = 'butt';
    const bars: number[] = [], dots: number[] = [];
    for (const b of belts) {
      const kx = b.c.ax, ky = b.c.ay, gx = sx(b.e.x + 0.5) + kx * z * 0.92, gy = sy(b.e.y + 0.5) + ky * z * 0.92, half = z * (W[(b.e.st ?? 'none') as BK] / 2 + 0.05);
      const px = Math.abs(kx) > Math.abs(ky) ? 0 : 1, py = 1 - px;
      bars.push(gx - px * half, gy - py * half, gx + px * half, gy + py * half);
      dots.push(gx - px * half * 0.82, gy - py * half * 0.82, gx + px * half * 0.82, gy + py * half * 0.82);
    }
    const seg = (list: number[]) => { ctx.beginPath(); for (let i = 0; i < list.length; i += 4) { ctx.moveTo(list[i], list[i + 1]); ctx.lineTo(list[i + 2], list[i + 3]); } ctx.stroke(); };
    ctx.strokeStyle = light ? '#7f8c97' : '#02060b'; ctx.lineWidth = z * 0.11 + 2; seg(bars);
    ctx.strokeStyle = light ? '#dbe3e9' : '#4d5f71'; ctx.lineWidth = z * 0.11; seg(bars);
    ctx.fillStyle = light ? `rgb(${TEAL_L})` : '#7ffcf1';
    const r0 = Math.max(1, z * 0.025);
    ctx.beginPath(); for (let i = 0; i < dots.length; i += 2) { ctx.moveTo(dots[i] + r0, dots[i + 1]); ctx.arc(dots[i], dots[i + 1], r0, 0, TAU); } ctx.fill();
  }
  // 流れの向きに走る光の山形（止まった絵でも向きがわかる）
  const ph = mod(t * speed * 0.5, 1), s = z * 0.1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const b of belts) {
    const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5), c = b.c;
    for (let k = 0; k < 2; k++) {
      const p = (ph + k * 0.5) % 1, q = 1 - p;
      const x = cx + (q * q * c.ax + p * p * c.bx) * z, y = cy + (q * q * c.ay + p * p * c.by) * z;
      let dx = -2 * q * c.ax + 2 * p * c.bx, dy = -2 * q * c.ay + 2 * p * c.by;
      const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      ctx.moveTo(x - dx * s - dy * s, y - dy * s + dx * s); ctx.lineTo(x + dx * s * 0.3, y + dy * s * 0.3); ctx.lineTo(x - dx * s + dy * s, y - dy * s - dx * s);
    }
  }
  if (!light) ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = light ? '#0a9fb1' : '#8ffcf3'; ctx.lineWidth = Math.max(1.2, z * 0.045); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  if (G && belts.length) {
    // 高画質：レールと管が、うっすら光る
    G.lineCap = 'round';
    G.strokeStyle = `rgba(${P.glow},${light ? 0.2 : 0.42})`; G.lineWidth = z * 0.2;
    G.beginPath();
    for (const b of belts) { const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5); G.moveTo(cx + b.c.ax * z, cy + b.c.ay * z); G.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z); }
    G.stroke();
  }
}

// =====================================================================
// 納品所：反応炉の炉心。回る光の環と、元素の立体映像の環
// =====================================================================
export function hubLab(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World, t: number) {
  const s = z * size, lv = Math.max(0, [2, 4, 6, 8].indexOf(size)), light = P.name === 'light';
  const cxh = px + s / 2, cyh = py + s / 2, line = Math.max(1.4, z * 0.04), m = z * 0.06, x0 = px + m, y0 = py + m, ww = s - 2 * m, R0 = z * 0.42;
  const pulse = calm ? 0.6 : 0.5 + 0.5 * Math.sin(t * (2 + lv * 0.4));
  const teal = light ? TEAL_L : TEAL_D, accent = light ? '98,92,255' : LAB_MAGENTA;
  const edge = light ? 'rgba(22,34,45,0.65)' : '#010306';
  ctx.save();
  ctx.lineJoin = 'round';
  // 床の影と、手前の厚み（立体表示では、箱が影と側面をつける）
  const th = z * (0.2 + lv * 0.05);
  if (flat) {
    for (const [k, a] of [[1.6, light ? 0.07 : 0.22], [1.0, light ? 0.12 : 0.35]] as [number, number][]) {
      rr(ctx, x0 + th * 0.2 * k, y0 + th * 0.9 * k, ww, ww, R0 * 1.2); ctx.fillStyle = light ? `rgba(30,52,70,${a})` : `rgba(0,0,0,${a})`; ctx.fill();
    }
    rr(ctx, x0, y0 + th, ww, ww, R0);
    const sg = ctx.createLinearGradient(0, y0 + ww - R0, 0, y0 + ww + th);
    sg.addColorStop(0, light ? '#dfe6eb' : '#1f2b39'); sg.addColorStop(1, light ? '#8a97a1' : '#03060a');
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = line * 0.7; ctx.stroke();
    // 側面に並ぶ光の点
    ctx.fillStyle = `rgba(${teal},${0.5 + 0.4 * pulse})`;
    for (let i = 1; i < size * 2; i++) ctx.fillRect(x0 + (ww * i) / (size * 2) - z * 0.03, y0 + ww + th * 0.45, z * 0.06, Math.max(1.5, th * 0.18));
  }
  // 天面：つやのある台と銀の縁
  rr(ctx, x0, y0, ww, ww, R0);
  const tg = ctx.createLinearGradient(x0, y0, x0 + ww, y0 + ww);
  if (light) { tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.6, '#eef2f5'); tg.addColorStop(1, '#d6dee4'); }
  else { tg.addColorStop(0, '#263443'); tg.addColorStop(0.6, '#121b26'); tg.addColorStop(1, '#090f16'); }
  ctx.fillStyle = tg; ctx.fill();
  const rim = ctx.createLinearGradient(x0, y0, x0 + ww, y0 + ww);
  rim.addColorStop(0, light ? '#ffffff' : '#a9bdcc'); rim.addColorStop(0.5, light ? '#bcc7cf' : '#4a5b6c'); rim.addColorStop(1, light ? '#7b8995' : '#121a24');
  rr(ctx, x0 + z * 0.03, y0 + z * 0.03, ww - z * 0.06, ww - z * 0.06, R0 * 0.85); ctx.strokeStyle = rim; ctx.lineWidth = z * 0.06; ctx.stroke();
  rr(ctx, x0, y0, ww, ww, R0); ctx.strokeStyle = edge; ctx.lineWidth = line * 0.7; ctx.stroke();
  // 炉心のまわりの、一段低い円い台
  const R = coreR(size, z);
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.32, 0, TAU);
  ctx.fillStyle = light ? '#e3eaef' : '#0b121a'; ctx.fill(); ctx.strokeStyle = light ? 'rgba(22,34,45,0.25)' : 'rgba(120,200,230,0.12)'; ctx.lineWidth = line * 0.6; ctx.stroke();

  // 四辺の搬入口：マスごとに 1 つ。黒い口に、内向きに流れる光の山形
  for (let side = 0; side < 4; side++) for (let k = 0; k < size; k++) {
    const uu = (k + 0.5 - size / 2) * z;
    ctx.save();
    ctx.translate(side === 0 ? cxh + uu : side === 1 ? px + s - m : side === 2 ? cxh + uu : px + m, side === 0 ? py + m : side === 1 ? cyh + uu : side === 2 ? py + s - m : cyh + uu);
    ctx.rotate((side * Math.PI) / 2);
    const jw = z * 0.3, jh = z * 0.26;
    rr(ctx, -jw, -z * 0.02, jw * 2, jh, z * 0.06); ctx.fillStyle = light ? '#22303c' : '#010407'; ctx.fill();
    ctx.fillStyle = `rgba(${teal},${0.18 + 0.25 * pulse})`; ctx.fillRect(-jw * 0.8, jh * 0.55, jw * 1.6, jh * 0.3);
    const f = calm ? 0.5 : mod(t * 1.4 + k * 0.3, 1);
    ctx.strokeStyle = `rgba(${teal},${0.35 + 0.6 * (1 - f)})`; ctx.lineWidth = Math.max(1.2, z * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-jw * 0.45, jh * (0.1 + 0.4 * f)); ctx.lineTo(0, jh * (0.35 + 0.4 * f)); ctx.lineTo(jw * 0.45, jh * (0.1 + 0.4 * f)); ctx.stroke();
    rr(ctx, -jw, -z * 0.02, jw * 2, jh, z * 0.06); ctx.strokeStyle = light ? '#9aa7b1' : '#3a4a5b'; ctx.lineWidth = line * 0.6; ctx.stroke();
    ctx.restore();
  }
  // 四隅の柱：場を張る装置。暗いテーマでは、炉心へ細い光の線を送る
  if (lv >= 1) {
    const off = s / 2 - z * 0.62;
    for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cxh + ax * off, y = cyh + ay * off, r = z * (0.17 + lv * 0.02);
      if (!light) { ctx.strokeStyle = `rgba(${LAB_MAGENTA},${0.22 + 0.2 * pulse})`; ctx.lineWidth = Math.max(1, z * 0.03); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cxh + ax * R * 0.9, cyh + ay * R * 0.9); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y + r * 0.3, r, 0, TAU); ctx.fillStyle = light ? 'rgba(30,52,70,0.25)' : '#000'; ctx.fill();
      const cg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      cg.addColorStop(0, light ? '#ffffff' : '#9fb3c2'); cg.addColorStop(1, light ? '#98a5af' : '#1c2733');
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = line * 0.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fillStyle = `rgba(${ax === ay ? teal : accent},${0.55 + 0.45 * pulse})`; ctx.fill();
    }
  }

  // 元素の環（立体映像）：飲み込んだ元素は灯り、まだのものは薄い影
  const els = ELEMENTS, ringR = s / 2 - z * (0.42 + (lv ? 0.1 : 0)), er = Math.max(2.5, Math.min(z * 0.17, (ringR * 8) / els.length / 2.6));
  if (z >= 16 && lv >= 1) {
    rr(ctx, cxh - ringR, cyh - ringR, ringR * 2, ringR * 2, ringR * 0.3);
    ctx.strokeStyle = `rgba(${teal},${light ? 0.4 : 0.3})`; ctx.lineWidth = Math.max(1, z * 0.025); ctx.setLineDash([z * 0.08, z * 0.08]); ctx.stroke(); ctx.setLineDash([]);
    els.forEach((el, i) => {
      const a = (i / els.length) * TAU - Math.PI / 2 + (lv >= 3 && !calm ? t * 0.05 : 0);
      const k = Math.SQRT2, ex = cxh + ringR * Math.max(-1, Math.min(1, Math.cos(a) * k)), ey = cyh + ringR * Math.max(-1, Math.min(1, Math.sin(a) * k));
      const tier = fedTier(w, el.sym);
      ctx.beginPath(); ctx.arc(ex, ey, er * 1.25, 0, TAU);
      ctx.fillStyle = tier ? (light ? '#ffffff' : '#0e1a26') : light ? 'rgba(255,255,255,0.45)' : 'rgba(8,14,22,0.6)'; ctx.fill();
      ctx.strokeStyle = tier >= 3 ? `rgb(${teal})` : tier ? (light ? '#7b8995' : '#5b7286') : `rgba(${teal},0.3)`; ctx.lineWidth = tier >= 2 ? line * 0.85 : line * 0.45; ctx.stroke();
      ctx.globalAlpha = tier ? 1 : 0.3;
      drawElement(ctx, el.sym, ex, ey, er * 0.8);
      ctx.globalAlpha = 1;
    });
  }

  // 炉心：銀の封じ込めの輪と目盛り、黒い窓の中で回る光の環
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.14, 0, TAU);
  const cr = ctx.createLinearGradient(cxh - R, cyh - R, cxh + R, cyh + R);
  cr.addColorStop(0, light ? '#ffffff' : '#9fb3c2'); cr.addColorStop(0.5, light ? '#b3bfc8' : '#3a4a5b'); cr.addColorStop(1, light ? '#6f7d89' : '#0f161f');
  ctx.strokeStyle = cr; ctx.lineWidth = z * 0.1; ctx.stroke();
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.14 + z * 0.05, 0, TAU); ctx.strokeStyle = edge; ctx.lineWidth = line * 0.5; ctx.stroke();
  const ticks = 24 + lv * 8;
  ctx.beginPath();
  for (let i = 0; i < ticks; i++) { const a = (i / ticks) * TAU, r1 = R * 1.21 + z * 0.02, r2 = r1 + z * (i % 4 ? 0.05 : 0.1); ctx.moveTo(cxh + Math.cos(a) * r1, cyh + Math.sin(a) * r1); ctx.lineTo(cxh + Math.cos(a) * r2, cyh + Math.sin(a) * r2); }
  ctx.strokeStyle = `rgba(${teal},${light ? 0.75 : 0.6})`; ctx.lineWidth = Math.max(1, z * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.06, 0, TAU); ctx.fillStyle = light ? '#0c1720' : '#02060a'; ctx.fill();
  // 光の環（中心は暗いまま残して、文字が読めるようにする）
  const cg = ctx.createRadialGradient(cxh, cyh, R * 0.2, cxh, cyh, R * 1.06);
  cg.addColorStop(0, `rgba(${teal},0.06)`); cg.addColorStop(0.6, `rgba(${teal},0.16)`); cg.addColorStop(0.86, `rgba(${teal},${0.5 + 0.3 * pulse})`); cg.addColorStop(0.95, `rgba(235,255,252,${0.55 + 0.35 * pulse})`); cg.addColorStop(1, `rgba(${teal},0)`);
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.06, 0, TAU); ctx.fillStyle = cg; ctx.fill();
  ctx.lineCap = 'round';
  const arcs = (rad: number, n: number, rot: number, len: number, col: string, wd: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = wd;
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; ctx.beginPath(); ctx.arc(cxh, cyh, rad, a, a + len); ctx.stroke(); }
  };
  const tt = calm ? 0 : t;
  arcs(R * 0.9, 3, tt * 0.9, 1.1, `rgba(${teal},0.9)`, Math.max(1.5, z * 0.05));
  arcs(R * 0.78, 4, -tt * 0.6, 0.7, `rgba(${accent},0.75)`, Math.max(1.2, z * 0.035));
  if (lv >= 2) arcs(R * 0.67, 6, tt * 0.35, 0.35, `rgba(${teal},0.5)`, Math.max(1, z * 0.025));
  if (lv >= 1) arcs(R * 1.3, 2 + lv, -tt * 0.25, 0.5, `rgba(${teal},${light ? 0.65 : 0.5})`, Math.max(1, z * 0.03));

  // いま欲しがっているもの（黒い窓に白い字）
  const u = Math.min(s / 2, R * 2.1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#effcfd';
  const goal = currentGoal(w);
  const gs = goal ? sub(goal.s) : null;
  const plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '満腹' : goal!.also ? `${label(goal!.s)} ほか` : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  ctx.lineWidth = Math.max(2, u * 0.05); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  ctx.font = `700 ${u * Math.min(0.4, 1.15 / Math.max(1, tx.length * (plain ? 1 : 0.62)))}px ${plain ? FONT_UI : FONT_MONO}`;
  ctx.strokeText(tx, cxh, cyh - u * 0.06); ctx.fillText(tx, cxh, cyh - u * 0.06);
  if (goal) {
    ctx.font = `600 ${u * 0.2}px ${FONT_MONO}`;
    const ct = goal.rate ? `毎分 ${Math.round(goalRate(w))} / ${goal.rate}` : `${goalCount(w)} / ${requiredOf(w, goal)}`;
    ctx.fillStyle = light ? '#8ff3fb' : '#7ffcf1';
    ctx.strokeText(ct, cxh, cyh + u * 0.3); ctx.fillText(ct, cxh, cyh + u * 0.3);
  }
  ctx.restore();
}
/** 炉心の半径（納品所の大きさ size マス、1 マス z 画素） */
const coreR = (size: number, z: number) => (size === 2 ? z * 0.6 : Math.min(z * size * 0.3, (z * size) / 2 - z * 0.82));
/** 高画質：納品所の炉心の光（輪の形。中の字のまわりは暗いまま）と、まわりを回る光の弧（光の層だけに描く）。字の窓は効果の層で色を守る */
export function labHubGlow(Gc: CanvasRenderingContext2D, P: Palette, hx: number, hy: number, size: number, z: number, t: number) {
  const light = P.name === 'light', tt = calm ? 0 : t, R = coreR(size, z), r = R * 1.9;
  const g = Gc.createRadialGradient(hx, hy, 0, hx, hy, r);
  const k = 0.36 + 0.08 * Math.sin(tt * 2.3);
  g.addColorStop(0, `rgba(${P.glow},0)`); g.addColorStop(0.42, `rgba(${P.glow},0.04)`); g.addColorStop(0.6, `rgba(${P.glow},${k})`); g.addColorStop(1, `rgba(${P.glow},0)`);
  Gc.fillStyle = g; Gc.fillRect(hx - r, hy - r, r * 2, r * 2);
  if (MK) { MK.fillStyle = 'rgb(0,255,0)'; MK.beginPath(); MK.arc(hx, hy, R * 0.88, 0, TAU); MK.fill(); }
  if (z < 10) return;
  const R1 = (size / 2 + 0.45) * z, R2 = (size / 2 + 0.72) * z;
  Gc.lineCap = 'round'; Gc.lineWidth = Math.max(1.5, z * 0.08);
  for (let k = 0; k < 3; k++) { const a = tt * 0.7 + k * 2.094; Gc.strokeStyle = `rgba(${P.glow},${light ? 0.3 : 0.55})`; Gc.beginPath(); Gc.arc(hx, hy, R1, a, a + 0.85); Gc.stroke(); }
  Gc.lineWidth = Math.max(1, z * 0.05);
  for (let k = 0; k < 4; k++) { const a = -tt * 0.45 + k * 1.571; Gc.strokeStyle = `rgba(${light ? '98,92,255' : LAB_MAGENTA},${light ? 0.2 : 0.42})`; Gc.beginPath(); Gc.arc(hx, hy, R2, a, a + 0.45); Gc.stroke(); }
}

// =====================================================================
// 札と印
// =====================================================================
/** 資源地の名前：立体映像の札。左に資源の色の印、下に産出物 */
export function labZoneLabel(ctx: CanvasRenderingContext2D, P: Palette, name: string, sub2: string, x: number, y: number, z: number, tint: string) {
  const light = P.name === 'light', fs = Math.max(12, z * 0.36), fs2 = Math.max(10, z * 0.23);
  ctx.save();
  ctx.font = `700 ${fs}px ${FONT_UI}`;
  const w1 = ctx.measureText(name).width + fs * 1.0;
  let w2 = 0;
  if (sub2) { ctx.font = `500 ${fs2}px ${FONT_UI}`; w2 = ctx.measureText(sub2).width; }
  const bw = Math.max(w1, w2) + fs * 1.1, bh = sub2 ? fs * 1.35 + fs2 * 1.45 : fs * 1.75, bx = x - bw / 2, by = y - fs * 1.25;
  rr(ctx, bx + 2, by + 3, bw, bh, fs * 0.32); ctx.fillStyle = light ? 'rgba(30,52,70,0.12)' : 'rgba(0,0,0,0.4)'; ctx.fill();
  rr(ctx, bx, by, bw, bh, fs * 0.32); ctx.fillStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(7,13,21,0.86)'; ctx.fill();
  ctx.strokeStyle = light ? `rgba(${TEAL_L},0.8)` : `rgba(${TEAL_D},0.65)`; ctx.lineWidth = Math.max(1.2, fs * 0.08); ctx.stroke();
  // 上の縁の、資源の色の線
  ctx.strokeStyle = tint; ctx.lineWidth = Math.max(2, fs * 0.14); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx + fs * 0.5, by + fs * 0.08); ctx.lineTo(bx + bw - fs * 0.5, by + fs * 0.08); ctx.stroke();
  // 1 行目：資源の色の丸と名前（丸のぶんも含めて、札の真ん中にそろえる）
  const ny = by + fs * 0.95, rowX = x - w1 / 2;
  ctx.beginPath(); ctx.arc(rowX + fs * 0.3, ny - fs * 0.02, fs * 0.26, 0, TAU); ctx.fillStyle = tint; ctx.fill(); ctx.strokeStyle = light ? '#16222d' : '#e4f3f7'; ctx.lineWidth = Math.max(1, fs * 0.07); ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `700 ${fs}px ${FONT_UI}`; ctx.fillStyle = P.ink; ctx.fillText(name, rowX + fs * 0.75, ny);
  if (sub2) { ctx.textAlign = 'center'; ctx.font = `500 ${fs2}px ${FONT_UI}`; ctx.fillStyle = P.soft; ctx.fillText(sub2, x, by + fs * 1.35 + fs2 * 0.62); }
  ctx.restore();
}
/** 選んだもの：照準の角と、ゆっくり回る点線の輪 */
export function labSelect(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, sz: number, z: number, t: number) {
  const light = P.name === 'light', r = z * (sz * 0.5 + 0.12 + (calm ? 0 : 0.025 * Math.sin(t * 5))), L = z * (0.18 + sz * 0.04);
  ctx.save();
  ctx.lineCap = 'round';
  const corners = () => { ctx.beginPath(); for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + ax * r, cy + ay * (r - L)); ctx.lineTo(cx + ax * r, cy + ay * r); ctx.lineTo(cx + ax * (r - L), cy + ay * r); } ctx.stroke(); };
  ctx.strokeStyle = light ? 'rgba(22,34,45,0.45)' : 'rgba(0,0,0,0.8)'; ctx.lineWidth = Math.max(3, z * 0.1); corners();
  ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(1.8, z * 0.06); corners();
  ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.2, z * 0.03);
  ctx.setLineDash([z * 0.12, z * 0.09]); ctx.lineDashOffset = calm ? 0 : -t * z * 0.35;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.12, 0, TAU); ctx.stroke();
  ctx.restore();
  if (G) { G.strokeStyle = `rgba(${P.glow},${light ? 0.35 : 0.6})`; G.lineWidth = Math.max(2, z * 0.08); G.beginPath(); G.arc(cx, cy, r * 1.12, 0, TAU); G.stroke(); }
}

// =====================================================================
// 空気：天井の照明の帯（昼）、青緑と赤紫の光の帯（夜）、立体映像の粒、ゆっくり下る走査線
// =====================================================================
interface Mote { x: number; y: number; v: number; s: number; ph: number; m: boolean }
const motes: Mote[] = Array.from({ length: 38 }, (_, i) => ({ x: hash(i, 3.3), y: hash(i, 5.1), v: 0.008 + hash(i, 7.7) * 0.025, s: 1 + hash(i, 9.9) * 2.2, ph: hash(i, 11.3) * TAU, m: hash(i, 13.1) < 0.32 }));
export function labAmbient(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number, dt: number) {
  const light = P.name === 'light', big = Math.max(cw, ch);
  if (light) {
    // 天井の照明の帯：やわらかい光が斜めに差しこむ
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    ctx.translate(cw * 0.5, ch * 0.45); ctx.rotate(-0.38);
    const drift = calm ? 0 : Math.sin(t * 0.03) * big * 0.05;
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * big * 0.42 + drift, wd = big * (0.09 + 0.04 * (k % 2));
      const gr = ctx.createLinearGradient(x - wd, 0, x + wd, 0);
      gr.addColorStop(0, 'rgba(235,252,255,0)'); gr.addColorStop(0.5, 'rgba(235,252,255,0.55)'); gr.addColorStop(1, 'rgba(235,252,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - wd, -big, wd * 2, big * 2);
    }
    ctx.restore();
  } else {
    // 天井の灯から斜めに落ちる、青緑と赤紫の光の帯
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [fx, rgb, ang] of [[0.14, TEAL_D, 0.42], [0.88, LAB_MAGENTA, -0.4]] as [number, string, number][]) {
      ctx.save(); ctx.translate(cw * fx, -ch * 0.06); ctx.rotate(ang + (calm ? 0 : Math.sin(t * 0.07 + fx * 9) * 0.03));
      const wd = big * 0.13, L = big * 1.3;
      const gr = ctx.createLinearGradient(-wd, 0, wd, 0);
      gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.5, `rgba(${rgb},0.06)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-wd * 0.18, 0); ctx.lineTo(wd * 0.18, 0); ctx.lineTo(wd, L); ctx.lineTo(-wd, L); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    if (!G) {
      // 後処理がないときは、ここで四隅を沈める
      const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, big * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,10,0.5)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
    }
  }
  if (calm) return;
  // 立体映像の粒：小さな四角が、ゆっくり昇ってまたたく（ときどき十字）
  if (!light) ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    m.y = mod(m.y - m.v * dt, 1);
    const x = mod(m.x + Math.sin(t * 0.2 + m.ph) * 0.015, 1) * cw, y = m.y * ch, tw = 0.5 + 0.5 * Math.sin(t * 1.7 + m.ph * 3);
    const rgb = m.m && !light ? LAB_MAGENTA : light ? TEAL_L : TEAL_D, a = (light ? 0.35 : 0.55) * tw;
    if (a < 0.04) continue;
    ctx.fillStyle = `rgba(${rgb},${a})`;
    if (m.s > 2.6) { ctx.fillRect(x - m.s, y - 0.5, m.s * 2, 1); ctx.fillRect(x - 0.5, y - m.s, 1, m.s * 2); }
    else ctx.fillRect(x - m.s / 2, y - m.s / 2, m.s, m.s);
    if (G && !light) { G.fillStyle = `rgba(${rgb},${a * 0.6})`; G.fillRect(x - 3, y - 3, 6, 6); }
  }
  ctx.globalCompositeOperation = 'source-over';
  // 走査線：画面をゆっくり下る、細い光の線と、うすい尾
  const yy = (mod(t * 0.05, 1.3) - 0.15) * ch, tail = ch * 0.06;
  const sg = ctx.createLinearGradient(0, yy - tail, 0, yy);
  sg.addColorStop(0, `rgba(${light ? TEAL_L : TEAL_D},0)`); sg.addColorStop(1, `rgba(${light ? TEAL_L : TEAL_D},${light ? 0.07 : 0.06})`);
  ctx.fillStyle = sg; ctx.fillRect(0, yy - tail, cw, tail);
  ctx.fillStyle = `rgba(${light ? TEAL_L : TEAL_D},${light ? 0.22 : 0.2})`; ctx.fillRect(0, yy, cw, 1);
}
