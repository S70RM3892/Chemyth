import { ZONES, hubRect, isSea, zoneAt, zoneSpots, type Zone } from '../content/map';
import { ELEMENTS } from '../content/elements';
import { LINE_COLORS, MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { beltSpeed, currentGoal, DX, DY, fedTier, goalCount, goalRate, STATION_CAP, inDoors, inflow, isMachine, machineState, outPort, railOf, stationTargets, tunnelPair, portDir, requiredOf, sizeOf, slotPort, type Dir, type Ent, type World } from '../engine/world';
import { mix, onThemeChange, palette, type Palette } from './theme';
import { drawElement, sprite } from './token';

export interface Camera { x: number; y: number; z: number }
export interface View { tool: string; selected: Ent | null; stats?: boolean; /** 範囲選択 [x0, y0, x1, y1]（両端を含む） */ area?: [number, number, number, number] | null; /** 設計図を置こうとしている場所の見本 */ ghost?: { x: number; y: number; size: number; ok: boolean; dir: number; glyph: string }[] | null; /** 敷いている途中の線路（マスの中心の列） */ rail?: [number, number][] | null }

// 方眼ノートに描いた工場の図面。輪郭線と斜線で描き、ぼかしや発光は使わない
let FONT_HAND = '"Klee One", sans-serif';
/** 小さい文字用。工業スキンの極太書体は小さいと潰れるので使わない */
let FONT_SMALL = FONT_HAND;
const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// ---- 地形は区画ごとに描いてためておく。地図に果てはないので、見えた所から作る ----
const TS = 24, CH = 16, SIZE = TS * CH;
const chunks = new Map<string, HTMLCanvasElement>();
onThemeChange(() => chunks.clear());
let scratch: HTMLCanvasElement | null = null;
const ORDER = Object.keys(ZONES) as Zone[];
const mod = (a: number, n: number) => ((a % n) + n) % n;

function buildChunk(P: Palette, cx: number, cy: number): HTMLCanvasElement {
  if (P.skin === 'punk') return buildChunkPunk(P, cx, cy);
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  scratch ??= Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const t = scratch.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, OX = ox * TS, OY = oy * TS;
  const X = (tx: number) => (tx - ox) * TS, Y = (ty: number) => (ty - oy) * TS;
  const punk = (P.skin as string) === 'punk', light = P.name === 'light';
  const base = P.paper;

  g.fillStyle = base;
  g.fillRect(0, 0, SIZE, SIZE);
  if (punk) {
    // 鋼板の床：ヘアラインの筋
    g.strokeStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.025)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = 0; y < SIZE; y += 4) { const w0 = hash(cx * 31 + y, cy * 17) * SIZE; g.moveTo(w0, y + 0.5); g.lineTo(Math.min(SIZE, w0 + 60 + hash(y, cx) * 160), y + 0.5); }
    g.stroke();
  }

  // 区画にかかる資源地のマス（縁のにじみぶんだけ外側も見る）
  const tiles = new Map<Zone, [number, number][]>();
  for (let y = oy - 1; y <= oy + CH; y++) for (let x = ox - 1; x <= ox + CH; x++) {
    const zn = zoneAt(x, y);
    if (!zn) continue;
    if (!tiles.has(zn)) tiles.set(zn, []);
    tiles.get(zn)!.push([x + 0.5 + (hash(x, y) - 0.5) * 0.3, y + 0.5 + (hash(y, x) - 0.5) * 0.3]);
  }
  const blobs = (c: CanvasRenderingContext2D, list: [number, number][], r: number) => {
    c.beginPath();
    for (const [x, y] of list) { c.moveTo(X(x) + r * TS, Y(y)); c.arc(X(x), Y(y), r * TS, 0, Math.PI * 2); }
    c.fill();
  };
  // 輪郭 → 塗り → 模様、の順に重ねる。輪郭は外周にだけ残る
  for (const [zn, list] of tiles) {
    g.fillStyle = punk && !light ? mix(base, ZONES[zn].tint[1], 0.75) : P.ink;
    blobs(g, list, punk ? 0.88 : 0.86);
  }
  for (const [zn, list] of tiles) {
    const core = ZONES[zn].tint[1];
    g.fillStyle = mix(base, core, punk ? (light ? 0.5 : 0.22) : light ? 0.2 : 0.26);
    blobs(g, list, 0.78);
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, SIZE, SIZE);
    t.fillStyle = '#000';
    blobs(t, list, 0.72);
    t.globalCompositeOperation = 'source-in';
    t.strokeStyle = punk ? (light ? mix(P.ink, core, 0.35) : mix(base, core, 0.6)) : mix(base, core, light ? 0.62 : 0.7);
    t.lineWidth = punk ? 1.1 : 1.4;
    t.lineCap = 'round';
    t.beginPath();
    if (isSea(zn)) {
      const r = TS * 0.62, p = TS * 1.1;
      for (let y = -mod(OY, r); y < SIZE + r; y += r) {
        const row = Math.round((y + OY) / r);
        for (let x = -mod(OX + (mod(row, 2) ? p / 2 : 0), p) - p; x < SIZE + p; x += p) {
          t.moveTo(x, y);
          t.quadraticCurveTo(x + TS * 0.2, y - TS * 0.16, x + TS * 0.4, y);
          t.quadraticCurveTo(x + TS * 0.6, y + TS * 0.16, x + TS * 0.8, y);
        }
      }
    } else {
      const sp = TS * 0.34, dirs = punk ? [1, -1] : [ORDER.indexOf(zn) % 2 ? 1 : -1];
      for (const dir of dirs) {
        // 斜線は地図全体でつながるように、区画の位置からずらす
        const off = mod(dir === 1 ? OX - OY : OX + OY, sp);
        for (let d = -SIZE - off; d < SIZE * 2; d += sp) { t.moveTo(dir === 1 ? d : d + SIZE, 0); t.lineTo(dir === 1 ? d + SIZE : d, SIZE); }
      }
    }
    t.stroke();
    g.drawImage(scratch, 0, 0);
  }

  // 方眼（ノート）／鋼板の継ぎ目と鋲（工業）
  const every = punk ? 4 : 5;
  for (const bold of [false, true]) {
    g.strokeStyle = bold ? P.gridBold : P.grid;
    g.lineWidth = bold ? (punk ? 2 : 1.2) : 1;
    g.beginPath();
    for (let i = 0; i <= CH; i++) {
      if ((mod(ox + i, every) === 0) === bold) { g.moveTo(i * TS + 0.5, 0); g.lineTo(i * TS + 0.5, SIZE); }
      if ((mod(oy + i, every) === 0) === bold) { g.moveTo(0, i * TS + 0.5); g.lineTo(SIZE, i * TS + 0.5); }
    }
    g.stroke();
  }
  if (punk) {
    for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
      if (mod(ox + i, every) || mod(oy + j, every)) continue;
      for (const [dx, dy] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) {
        g.fillStyle = light ? 'rgba(20,24,29,0.45)' : 'rgba(0,0,0,0.7)';
        g.beginPath(); g.arc(i * TS + dx, j * TS + dy, 1.8, 0, Math.PI * 2); g.fill();
        g.fillStyle = light ? 'rgba(255,255,255,0.7)' : 'rgba(255,170,90,0.25)';
        g.beginPath(); g.arc(i * TS + dx - 0.5, j * TS + dy - 0.5, 0.8, 0, Math.PI * 2); g.fill();
      }
    }
  }
  return cv;
}

/** 工業スキンの床：縞鋼板、鋼板の継ぎ目と鋲、油じみ。資源地は角ばった採掘区画で、縁は危険表示 */
function buildChunkPunk(P: Palette, cx: number, cy: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, light = P.name === 'light', base = P.paper;
  g.fillStyle = base;
  g.fillRect(0, 0, SIZE, SIZE);
  // 鋼板 1 枚ごとに、わずかに色が違う
  const PANEL = 4;
  for (let j = 0; j < CH / PANEL; j++) for (let i = 0; i < CH / PANEL; i++) {
    const h0 = hash(ox / PANEL + i, oy / PANEL + j);
    g.fillStyle = light ? `rgba(255,255,255,${h0 * 0.22})` : `rgba(255,255,255,${h0 * 0.04})`;
    g.fillRect(i * PANEL * TS, j * PANEL * TS, PANEL * TS, PANEL * TS);
  }
  // 縞鋼板のすべり止め
  const tread = (dx: number, color: string) => {
    g.strokeStyle = color; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath();
    for (let y = 6; y < SIZE; y += 12) for (let x = 6; x < SIZE; x += 12) {
      const d = ((x - 6) / 12 + (y - 6) / 12) % 2 ? 1 : -1;
      g.moveTo(x - 2.4 + dx, y - 2.4 * d + dx); g.lineTo(x + 2.4 + dx, y + 2.4 * d + dx);
    }
    g.stroke();
  };
  tread(0, light ? 'rgba(20,24,29,0.09)' : 'rgba(0,0,0,0.5)');
  tread(-1, light ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.035)');
  // 油じみと擦り傷
  for (let k = 0; k < 3; k++) {
    const x = hash(cx * 7 + k, cy * 13) * SIZE, y = hash(cx * 11, cy * 5 + k) * SIZE, r = 30 + hash(cx + k, cy - k) * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, light ? 'rgba(20,24,29,0.13)' : 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = light ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 7; k++) {
    const x = hash(cx * 3 + k, cy * 19) * SIZE, y = hash(cx * 23, cy * 3 + k) * SIZE, a = hash(k, cx + cy) * 6.28, l = 20 + hash(k, cx) * 60;
    g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  g.stroke();

  // 採掘区画
  const INK = '#0b0d10';
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
    const x = ox + tx, y = oy + ty, zn = zoneAt(x, y);
    if (!zn) continue;
    const core = ZONES[zn].tint[1], px = tx * TS, py = ty * TS, sea = isSea(zn);
    g.fillStyle = sea ? (light ? '#62aebf' : '#06202b') : mix(base, core, light ? 0.62 : 0.36);
    g.fillRect(px, py, TS, TS);
    if (sea) {
      // 貯水槽の水面
      g.strokeStyle = light ? 'rgba(255,255,255,0.55)' : 'rgba(90,220,255,0.22)'; g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 2; k++) { const wx = px + hash(x + k * 9, y) * (TS - 10), wy = py + 5 + hash(x, y + k * 7) * (TS - 10); g.moveTo(wx, wy); g.lineTo(wx + 8, wy); }
      g.stroke();
    } else {
      // 鉱石のかけら
      for (let k = 0; k < 3; k++) {
        const qx = px + 3 + hash(x + k * 5, y) * (TS - 6), qy = py + 3 + hash(x, y + k * 5) * (TS - 6), r = 2.5 + hash(x + k, y + k) * 4, a = hash(x - k, y + k) * 6.28;
        g.fillStyle = mix(core, k % 2 ? '#ffffff' : '#000000', light ? 0.25 : 0.3);
        g.beginPath();
        for (let v = 0; v < 3; v++) g.lineTo(qx + Math.cos(a + v * 2.1) * r, qy + Math.sin(a + v * 2.1) * r * 0.8);
        g.closePath(); g.fill();
      }
    }
    // 区画の縁：黒い太線と、危険表示の破線。闇では鉱石の色がにじむ
    for (const [dx, dy, x1, y1, x2, y2] of [[1, 0, px + TS, py, px + TS, py + TS], [-1, 0, px, py, px, py + TS], [0, 1, px, py + TS, px + TS, py + TS], [0, -1, px, py, px + TS, py]]) {
      if (zoneAt(x + dx, y + dy) === zn) continue;
      if (!light && !sea) {
        g.strokeStyle = core; g.globalAlpha = 0.3; g.lineWidth = 10;
        g.beginPath(); g.moveTo(x1 - dx * 4, y1 - dy * 4); g.lineTo(x2 - dx * 4, y2 - dy * 4); g.stroke();
        g.globalAlpha = 1;
      }
      g.lineCap = 'butt';
      g.strokeStyle = INK; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = sea ? (light ? '#f4f5f2' : '#3aa7c2') : P.hi; g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.setLineDash([]);
    }
  }

  // 鋼板の継ぎ目：溝と、その縁のハイライト
  for (let i = 0; i <= CH; i += PANEL) {
    g.fillStyle = light ? 'rgba(20,24,29,0.42)' : 'rgba(0,0,0,0.85)';
    g.fillRect(i * TS - 1, 0, 2, SIZE); g.fillRect(0, i * TS - 1, SIZE, 2);
    g.fillStyle = light ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.07)';
    g.fillRect(i * TS + 1, 0, 1, SIZE); g.fillRect(0, i * TS + 1, SIZE, 1);
  }
  // マス目は角の小さな十字だけ
  g.fillStyle = light ? 'rgba(20,24,29,0.22)' : 'rgba(255,255,255,0.09)';
  for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) { if (i % PANEL === 0 || j % PANEL === 0) continue; g.fillRect(i * TS - 2, j * TS, 5, 1); g.fillRect(i * TS, j * TS - 2, 1, 5); }
  // 鋲
  for (let j = 0; j <= CH; j += PANEL) for (let i = 0; i <= CH; i += PANEL) {
    for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) {
      g.fillStyle = light ? '#59626b' : '#000';
      g.beginPath(); g.arc(i * TS + dx, j * TS + dy, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = light ? '#f4f5f2' : `rgba(${P.glow},0.35)`;
      g.beginPath(); g.arc(i * TS + dx - 0.7, j * TS + dy - 0.7, 1, 0, Math.PI * 2); g.fill();
    }
  }
  return cv;
}

/** 地面の 1 区画の絵。lod：0 はそのまま、1 は半分、2 は 4 分の 1 の大きさに縮めたもの。
 *  引いた視野で大きい絵を毎フレーム縮めて描くと重いので、あらかじめ縮めた絵を使う */
function chunk(P: Palette, cx: number, cy: number, lod = 0): HTMLCanvasElement {
  const k = `${P.key}:${cx},${cy}:${lod}`;
  let c = chunks.get(k);
  if (c) { chunks.delete(k); chunks.set(k, c); return c; } // 最近使ったものを後ろへ
  if (lod === 0) c = buildChunk(P, cx, cy);
  else {
    const full = chunk(P, cx, cy, 0), size = full.width >> lod;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(full, 0, 0, size, size);
  }
  chunks.set(k, c);
  if (chunks.size > 520) chunks.delete(chunks.keys().next().value as string);
  return c;
}

// 工業スキンの空気：光の側は日差しと塵、闇の側は火の粉
interface Mote { x: number; y: number; v: number; s: number; ph: number }
const motes: Mote[] = Array.from({ length: 46 }, (_, i) => ({ x: hash(i, 3), y: hash(i, 5), v: 0.02 + hash(i, 7) * 0.05, s: 0.6 + hash(i, 9) * 1.8, ph: hash(i, 11) * 6.28 }));

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; text?: string; r: number; tint?: string }
const particles: Particle[] = [];
const born = new WeakMap<Ent, number>();

function spawn(w: World, P: Palette) {
  for (const f of w.fx.splice(0)) {
    if (f.type === 'deliver') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.2, vx: 0, vy: -0.9, age: 0, life: 0.9, color: P.red, text: '+1', r: 0 });
    } else if (f.type === 'vent') {
      // 廃棄口は煙突：捨てた物質の色の煙を吐く
      particles.push({ x: f.x + 0.5 + (Math.random() - 0.5) * 0.2, y: f.y + 0.3, vx: 0.2 + Math.random() * 0.15, vy: -0.6 - Math.random() * 0.3, age: 0, life: 1.6 + Math.random() * 0.8, color: 'smoke', r: 0.13 + Math.random() * 0.07, tint: mix(sub(f.s).color, '#3a3d42', 0.45) });
    } else if (f.type === 'spill') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.5, vx: (Math.random() - 0.5) * 0.8, vy: 0.5, age: 0, life: 0.5, color: P.red, r: 0.06 });
    } else {
      for (let i = 0; i < (P.skin === 'punk' ? 9 : 4); i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: f.x + 0.5, y: f.y + 0.25, vx: Math.cos(a) * 0.3, vy: -0.5 - Math.random() * 0.4, age: 0, life: 0.6 + Math.random() * 0.3, color: P.soft, r: 0.06 + Math.random() * 0.05 });
      }
    }
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);
}

/** ベルト1マスぶんの道筋。横から入るときは弧になる */
function beltCurve(e: Ent, inDir: Dir) {
  return { ax: -DX[inDir] * 0.5, ay: -DY[inDir] * 0.5, bx: DX[e.dir] * 0.5, by: DY[e.dir] * 0.5 };
}
function onCurve(c: ReturnType<typeof beltCurve>, p: number): [number, number] {
  const q = 1 - p; // 制御点はマスの中心
  return [q * q * c.ax + p * p * c.bx, q * q * c.ay + p * p * c.by];
}

export function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, cam: Camera, t: number, dt: number, view: View) {
  const P = palette();
  const z = cam.z;
  const sx = (x: number) => (x - cam.x) * z + cw / 2;
  const sy = (y: number) => (y - cam.y) * z + ch / 2;
  spawn(w, P);
  FONT_HAND = P.font;
  FONT_SMALL = P.skin === 'punk' ? FONT_UI : P.font;
  const punk = P.skin === 'punk', light = P.name === 'light';

  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  const wx0 = cam.x - cw / 2 / z, wy0 = cam.y - ch / 2 / z, wx1 = cam.x + cw / 2 / z, wy1 = cam.y + ch / 2 / z;
  // 画面の 1 マスが何ピクセルかで、地面の絵の細かさを選ぶ
  const tilePx = z * (ctx.getTransform().a || 1), lod = tilePx >= 20 ? 0 : tilePx >= 10 ? 1 : 2;
  for (let cy = Math.floor(wy0 / CH); cy <= Math.floor(wy1 / CH); cy++) for (let cx = Math.floor(wx0 / CH); cx <= Math.floor(wx1 / CH); cx++) {
    ctx.drawImage(chunk(P, cx, cy, lod), Math.floor(sx(cx * CH)), Math.floor(sy(cy * CH)), Math.ceil(CH * z) + 1, Math.ceil(CH * z) + 1);
  }

  const x0 = Math.floor(wx0), x1 = Math.ceil(wx1), y0 = Math.floor(wy0), y1 = Math.ceil(wy1);
  const inView = (e: Ent) => e.x >= x0 - 2 && e.x <= x1 + 2 && e.y >= y0 - 2 && e.y <= y1 + 2;
  const lw = (k: number) => Math.max(1.2, z * k);

  // ---- 採取機を持っているとき、資源地のマスに印をつける ----
  if (view.tool === 'extractor' && z >= 16) {
    ctx.fillStyle = P.red;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!zoneAt(x, y)) continue;
      ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * 3 + x + y);
      ctx.beginPath();
      ctx.arc(sx(x + 0.5), sy(y + 0.5), z * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- 資源地の名前 ----
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const sp of zoneSpots(x0, y0, x1, y1)) {
    const zn = ZONES[sp.zone], lx = sp.cx, ly = sp.cy;
    if (punk) {
      // 鉱区の標識板
      const fs = Math.max(11, z * 0.3), sub2 = `${sub(zn.resource).name} / ${zn.form}`;
      ctx.font = `400 ${fs}px ${FONT_HAND}`;
      const w1 = ctx.measureText(zn.name).width;
      ctx.font = `700 ${fs * 0.62}px ${FONT_UI}`;
      const w2 = z >= 20 ? ctx.measureText(sub2).width : 0;
      const bw = Math.max(w1, w2) + fs * 1.5, bh = fs * (z >= 20 ? 2.5 : 1.7), bx = sx(lx) - bw / 2, by = sy(ly) - fs * 1.15;
      chamfer(ctx, bx, by, bw, bh, fs * 0.35);
      ctx.fillStyle = '#0b0d10'; ctx.fill();
      ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(1.2, fs * 0.09); ctx.stroke();
      ctx.fillStyle = P.hi;
      ctx.font = `400 ${fs}px ${FONT_HAND}`;
      ctx.fillText(zn.name, sx(lx), sy(ly));
      if (z >= 20) { ctx.fillStyle = '#c9ced2'; ctx.font = `700 ${fs * 0.62}px ${FONT_UI}`; ctx.fillText(sub2, sx(lx), sy(ly) + fs * 0.95); }
      continue;
    }
    const fs = Math.max(12, z * 0.42);
    ctx.font = `600 ${fs}px ${FONT_HAND}`;
    ctx.lineWidth = fs * 0.3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.paper;
    ctx.strokeText(zn.name, sx(lx), sy(ly));
    ctx.fillStyle = P.ink;
    ctx.fillText(zn.name, sx(lx), sy(ly));
    if (z >= 20) {
      const s2 = Math.max(10, z * 0.26), tx = `${sub(zn.resource).name}・${zn.form}`;
      ctx.font = `500 ${s2}px "Zen Kaku Gothic New", sans-serif`;
      ctx.lineWidth = s2 * 0.3;
      ctx.strokeText(tx, sx(lx), sy(ly) + s2 * 1.4);
      ctx.fillStyle = P.soft;
      ctx.fillText(tx, sx(lx), sy(ly) + s2 * 1.4);
    }
  }
  ctx.textBaseline = 'middle';

  // ---- いまの指令で使う資源地が画面の外にあれば、縁に道しるべを出す ----
  const gz = currentGoal(w)?.zone;
  if (gz) {
    const zn = ZONES[gz], tx = sx(zn.at[0]), ty = sy(zn.at[1]);
    if (tx < 0 || tx > cw || ty < 150 || ty > ch - 170) {
      const px = Math.min(cw - 80, Math.max(80, tx)), py = Math.min(ch - 190, Math.max(170, ty));
      const ang = Math.atan2(ty - py, tx - px);
      ctx.font = `700 14px ${FONT_SMALL}`;
      const wd = ctx.measureText(zn.name).width + 22;
      ctx.fillStyle = P.plate;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      rr(ctx, px - wd / 2, py - 14, wd, 28, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.fillText(zn.name, px, py + 1);
      ctx.fillStyle = P.red;
      ctx.save();
      ctx.translate(px + Math.cos(ang) * (wd / 2 + 10), py + Math.sin(ang) * 25);
      ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---- ベルト：輪郭線つきの管。中身の状態で太さと模様が変わる ----
  const belts: { e: Ent; c: ReturnType<typeof beltCurve> }[] = [];
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || !inView(e)) continue;
    belts.push({ e, c: beltCurve(e, inflow(w, e.x, e.y, e.dir) ?? e.dir) });
  }
  type Belt = (typeof belts)[number];
  const trace = (b: Belt) => {
    const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + b.c.ax * z, cy + b.c.ay * z);
    ctx.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z);
  };
  // 固体は幅広のコンベヤ、液体は管、気体は細い管
  const WIDTH = { solid: 0.6, liquid: 0.46, gas: 0.34, none: 0.52 };
  const DASH = { solid: [0.04, 0.21], liquid: [0.18, 0.32], gas: [0.03, 0.22], none: [0.1, 0.4] };
  const st = (b: Belt) => b.e.st ?? 'none';
  const edge = lw(0.045) * 2;
  // 速さのために：同じ見た目のベルトは 1 本の道にまとめ、1 回の線引きで描く。
  // 大きな工場を引いて見たとき、1 本ずつ描くと 1 フレームに数万回の線引きになる
  type BK = 'solid' | 'liquid' | 'gas' | 'none';
  const KINDS: BK[] = ['solid', 'liquid', 'gas', 'none'];
  const byKind: Record<BK, Belt[]> = { solid: [], liquid: [], gas: [], none: [] };
  for (const b of belts) byKind[st(b)].push(b);
  const strokeAll = (list: Belt[]) => {
    if (!list.length) return;
    ctx.beginPath();
    for (const b of list) {
      const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5);
      ctx.moveTo(cx + b.c.ax * z, cy + b.c.ay * z);
      ctx.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z);
    }
    ctx.stroke();
  };
  /** 状態ごとに線の設定をしてから、その状態のベルトをまとめて描く */
  const pass = (style: (k: BK) => void) => { for (const k of KINDS) if (byKind[k].length) { style(k); strokeAll(byKind[k]); } };
  // 引いた視野では、細部（厚み・流れ線・影）を省く
  const far = z < 15, veryFar = z < 11;
  // 厚み：ベルトと配管を地面から浮かせる。まず地面に落ちる影、次に手前の側面を描き、そのあと上面を描く
  const lift = z * 0.1;
  ctx.lineCap = 'round';
  if (!far) {
    ctx.save();
    ctx.translate(lift * 0.7, lift * 1.7);
    ctx.strokeStyle = punk ? `rgba(0,0,0,${light ? 0.2 : 0.42})` : P.shadow;
    pass((k) => { ctx.lineWidth = z * WIDTH[k] + edge; });
    ctx.restore();
    ctx.save();
    ctx.translate(0, lift);
    ctx.strokeStyle = punk ? '#0b0d10' : P.ink;
    pass((k) => { ctx.lineWidth = z * WIDTH[k] + edge; });
    pass((k) => { ctx.strokeStyle = mix(P.line[k], punk ? '#0b0d10' : P.ink, punk ? 0.6 : 0.42); ctx.lineWidth = z * WIDTH[k]; });
    ctx.restore();
  }
  if (punk) {
    // 工業：固体はゴムのベルトに鋼の側板、液体と気体は継ぎ手のある配管
    const PW = { solid: 0.62, liquid: 0.44, gas: 0.3, none: 0.5 };
    const casing = '#0b0d10', rail = light ? '#8d969e' : '#4d545c', rubber = light ? '#33383e' : '#16191d';
    const isPipe = (k: BK) => k === 'liquid' || k === 'gas';
    ctx.lineCap = 'round';
    ctx.strokeStyle = casing;
    pass((k) => { ctx.lineWidth = z * PW[k] + lw(0.055) * 2; });
    pass((k) => { ctx.strokeStyle = isPipe(k) ? P.line[k] : rail; ctx.lineWidth = z * PW[k]; });
    // 配管は円筒に見えるよう中央にハイライト、ベルトは中央がゴム
    pass((k) => { ctx.strokeStyle = isPipe(k) ? `rgba(255,255,255,${light ? 0.55 : 0.2})` : rubber; ctx.lineWidth = z * PW[k] * (isPipe(k) ? 0.26 : 0.7); });
    if (!veryFar) {
      ctx.lineCap = 'butt';
      ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
      if (!light) ctx.globalCompositeOperation = 'lighter';
      pass((k) => {
        if (k === 'liquid') { ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(90,220,255,0.85)'; ctx.lineWidth = lw(0.07); ctx.setLineDash([z * 0.2, z * 0.3]); }
        else if (k === 'gas') { ctx.strokeStyle = light ? 'rgba(20,24,29,0.6)' : `rgba(${P.glow},0.8)`; ctx.lineWidth = lw(0.05); ctx.setLineDash([z * 0.04, z * 0.21]); }
        else { ctx.strokeStyle = light ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.lineWidth = z * PW[k] * 0.7; ctx.setLineDash([z * 0.04, z * 0.21]); }
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.setLineDash([]);
    }
    // 配管の継ぎ手
    if (!far) {
      ctx.strokeStyle = casing;
      ctx.lineWidth = lw(0.08);
      ctx.beginPath();
      for (const k of ['liquid', 'gas'] as BK[]) for (const b of byKind[k]) {
        const jx = sx(b.e.x + 0.5 + b.c.ax), jy = sy(b.e.y + 0.5 + b.c.ay), hw = z * (PW[k] / 2 + 0.07);
        const px = b.c.ax ? 0 : 1, py = b.c.ax ? 1 : 0;
        ctx.moveTo(jx - px * hw, jy - py * hw); ctx.lineTo(jx + px * hw, jy + py * hw);
      }
      ctx.stroke();
    }
  } else {
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.ink;
    pass((k) => { ctx.lineWidth = z * WIDTH[k] + edge; });
    pass((k) => { ctx.strokeStyle = P.line[k]; ctx.lineWidth = z * WIDTH[k]; });
    if (!veryFar) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = P.ink;
      ctx.globalAlpha = light ? 0.5 : 0.45;
      ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
      pass((k) => { ctx.lineWidth = k === 'solid' ? z * WIDTH.solid * 0.72 : lw(0.05); ctx.setLineDash([z * DASH[k][0], z * DASH[k][1]]); });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // ベルトの段階：強化するほど、中央の流れ線が色を変えて速く流れる
  const tier = Math.min(5, w.up.belt);
  if (tier > 0 && z >= 14) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = ['', '#3f8fd0', '#2fa06a', '#d9a520', '#e0662c', '#c23fb0'][tier];
    ctx.lineWidth = lw(0.075);
    ctx.setLineDash([z * 0.16, z * 0.34]); ctx.lineDashOffset = -t * beltSpeed(w) * z;
    strokeAll(belts);
    ctx.setLineDash([]);
    if (tier >= 3 && !far) { ctx.lineWidth = lw(0.025); ctx.globalAlpha = 0.55; strokeAll(belts); ctx.globalAlpha = 1; }
  }

  // 地下ベルト：入口は後ろ半分、出口は前半分だけ地上に見える。あいだは点線
  for (const e of w.ents.values()) {
    if (e.kind !== 'tunnel' || !inView(e)) continue;
    const cx = sx(e.x + 0.5), cy = sy(e.y + 0.5), wd = z * WIDTH.none, pair = tunnelPair(w, e);
    const dxv = DX[e.dir], dyv = DY[e.dir], side = pair ? -1 : 1;
    if (pair) {
      ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.3; ctx.lineWidth = lw(0.07);
      ctx.setLineDash([z * 0.12, z * 0.16]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx(pair.x + 0.5), sy(pair.y + 0.5)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
    for (const [col, lwid] of [[punk ? '#0b0d10' : P.ink, wd + edge], [P.line.none, wd]] as [string, number][]) {
      ctx.strokeStyle = col; ctx.lineWidth = lwid;
      ctx.beginPath(); ctx.moveTo(cx + dxv * side * z * 0.5, cy + dyv * side * z * 0.5); ctx.lineTo(cx, cy); ctx.stroke();
    }
    const it = e.item;
    if (it) {
      const dist = pair ? Math.abs(pair.x - e.x) + Math.abs(pair.y - e.y) : 1;
      const off = pair ? -0.5 + it.p * dist : it.p - 0.5;
      if (pair ? off < -0.05 : off > 0.05) token(ctx, P, cx + dxv * off * z, cy + dyv * off * z, z, it.s);
    }
    // 坑口：黒い口と、もぐる・出る向きの矢じり
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((e.dir * Math.PI) / 2);
    ctx.fillStyle = punk ? 'rgba(0,0,0,0.45)' : P.shadow; rr(ctx, -z * 0.17 + z * 0.05, -z * 0.4 + z * 0.1, z * 0.34, z * 0.8, z * 0.08); ctx.fill();
    rr(ctx, -z * 0.17, -z * 0.4, z * 0.34, z * 0.8, z * 0.08);
    ctx.fillStyle = MACHINES.tunnel.color; ctx.fill(); ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = lw(0.05); ctx.stroke();
    rr(ctx, -z * 0.09, -z * 0.3, z * 0.18, z * 0.6, z * 0.05); ctx.fillStyle = '#050607'; ctx.fill();
    ctx.fillStyle = P.hi;
    ctx.beginPath(); ctx.moveTo(z * 0.06, 0); ctx.lineTo(-z * 0.05, -z * 0.1); ctx.lineTo(-z * 0.05, z * 0.1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 立体交差：縦の管の上を横の管がまたぐ
  for (const e of w.ents.values()) {
    if (e.kind !== 'bridge' || !inView(e)) continue;
    const cx = sx(e.x + 0.5), cy = sy(e.y + 0.5), wd = z * WIDTH.none;
    const pipe = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.strokeStyle = P.ink; ctx.lineWidth = wd + edge;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = P.line.none; ctx.lineWidth = wd;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    pipe(cx, cy - z / 2, cx, cy + z / 2);
    ctx.strokeStyle = P.paper; ctx.lineWidth = wd + edge * 3;
    ctx.beginPath(); ctx.moveTo(cx - z * 0.36, cy); ctx.lineTo(cx + z * 0.36, cy); ctx.stroke();
    pipe(cx - z / 2, cy, cx + z / 2, cy);
  }
  for (const b of belts) {
    if (!b.e.item) continue;
    const [ox, oy] = onCurve(b.c, b.e.item.p);
    if (veryFar) {
      // ごく引いた視野：物質は、その色の小さな点で示す
      ctx.fillStyle = b.e.item.s === 'e' ? P.hi : sub(b.e.item.s).color;
      ctx.fillRect(sx(b.e.x + 0.5 + ox) - z * 0.2, sy(b.e.y + 0.5 + oy) - z * 0.2, z * 0.4, z * 0.4);
    } else token(ctx, P, sx(b.e.x + 0.5 + ox), sy(b.e.y + 0.5 + oy), z, b.e.item.s, far);
  }
  for (const e of w.ents.values()) {
    if (e.kind !== 'bridge' || !e.items || !inView(e)) continue;
    e.items.forEach((it, a) => {
      if (!it) return;
      const d = it.d ?? a;
      token(ctx, P, sx(e.x + 0.5 + DX[d] * (it.p - 0.5)), sy(e.y + 0.5 + DY[d] * (it.p - 0.5)), z, it.s);
    });
  }

  // ---- 装置 ----
  for (const e of w.ents.values()) {
    if (e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'tunnel' || e.kind === 'hub' || e.kind === 'part' || !(inView(e) || (e.big && inView({ ...e, x: e.x + 1, y: e.y + 1 })))) continue;
    if (!born.has(e)) born.set(e, t);
    const age = t - born.get(e)!;
    const pop = age < 0.24 ? 0.7 + 0.3 * (1 - Math.pow(1 - age / 0.24, 3)) + 0.1 * Math.sin((age / 0.24) * Math.PI) : 1;
    const sz = sizeOf(e);
    if (far) {
      // 引いた視野：機種の色の札と、状態を示す点だけ
      const info = MACHINES[e.kind as keyof typeof MACHINES], px0 = sx(e.x) + z * 0.08, py0 = sy(e.y) + z * 0.08, ps = sz * z - z * 0.16;
      ctx.fillStyle = info.color; ctx.fillRect(px0, py0, ps, ps);
      ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = Math.max(1, z * 0.07); ctx.strokeRect(px0, py0, ps, ps);
      const needs = (isMachine(e.kind) && !e.recipe) || (e.kind === 'analyzer' && !e.test) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
      const jam = (e.stuck || 0) > 2.5 || !!e.bad;
      if (needs || jam || e.busy) { ctx.fillStyle = needs || jam ? P.red : '#58e06a'; ctx.fillRect(px0 + ps * 0.3, py0 + ps * 0.3, ps * 0.4, ps * 0.4); }
      continue;
    }
    machine(ctx, P, sx(e.x + sz / 2), sy(e.y + sz / 2), z * pop * sz, z, e, t);
    // 稼働中の装置は、蒸気や火花を出す
    if (e.busy && z >= 20 && particles.length < 260 && Math.random() < dt * (e.kind === 'electrolyzer' || e.kind === 'battery' ? 5 : 3)) {
      const r1 = Math.random(), r2 = Math.random();
      if (e.kind === 'electrolyzer' || e.kind === 'battery') particles.push({ x: e.x + sz / 2 + (r1 - 0.5) * 0.9, y: e.y + sz / 2 + (r2 - 0.5) * 0.5, vx: (r2 - 0.5) * 1.6, vy: -0.6 - r1 * 0.9, age: 0, life: 0.28 + r1 * 0.2, color: 'spark', r: 0.05 });
      else particles.push({ x: e.x + sz * 0.3 + r1 * sz * 0.4, y: e.y + 0.25, vx: 0.1 + r2 * 0.14, vy: -0.42 - r1 * 0.25, age: 0, life: 1.3 + r2 * 0.7, color: 'smoke', r: 0.1 + r1 * 0.07 });
    }
  }

  // 闇の炉：稼働中の装置と納品所は、暗がりに光をこぼす
  if (punk && !light) {
    ctx.globalCompositeOperation = 'lighter';
    const pool = (gx: number, gy: number, r: number, a: number) => {
      const g = ctx.createRadialGradient(sx(gx), sy(gy), 0, sx(gx), sy(gy), r * z);
      g.addColorStop(0, `rgba(${P.glow},${a})`);
      g.addColorStop(1, `rgba(${P.glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(sx(gx) - r * z, sy(gy) - r * z, 2 * r * z, 2 * r * z);
    };
    const hr0 = hubRect(w.hubSize);
    pool(hr0.x + hr0.s / 2, hr0.y + hr0.s / 2, hr0.s * 1.6 + 1, 0.2 + 0.04 * Math.sin(t * 2.3));
    for (const e of w.ents.values()) if (e.busy && inView(e)) pool(e.x + sizeOf(e) / 2, e.y + sizeOf(e) / 2, 1 + sizeOf(e) * 0.5, 0.22 + 0.06 * Math.sin(t * 9 + e.x));
    ctx.globalCompositeOperation = 'source-over';
  }
  const hr = hubRect(w.hubSize);
  hub(ctx, P, sx(hr.x), sy(hr.y), z, hr.s, w, t);

  // ---- 貨物線：積む駅から降ろす駅へ、設備の上を越える高架の線路と列車。
  //      自動の線路は横に進んでから縦に曲がる。降ろす駅がいくつもあれば、それぞれへ線路が分かれる ----
  for (const e of w.ents.values()) {
    if (e.kind !== 'station' || e.role !== 'in') continue;
    const own = railOf(w, e);
    if (!own) continue;
    const routes = own.custom ? [own] : stationTargets(w, e).map((d) => railOf(w, e, d)!);
    const col = LINE_COLORS[((e.ch || 1) - 1) % LINE_COLORS.length], lift2 = z * 0.3;
    const screen = routes.map((r) => ({ r, xs: r.pts.map((q) => sx(q[0])), ys: r.pts.map((q) => sy(q[1])) }));
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const { xs, ys } of screen) {
      if (Math.max(...xs) < -50 || Math.min(...xs) > cw + 50 || Math.max(...ys) < -50 || Math.min(...ys) > ch + 50) continue;
      const path = (ox: number, oy: number) => { ctx.beginPath(); xs.forEach((x, k) => (k ? ctx.lineTo(x + ox, ys[k] + oy) : ctx.moveTo(x + ox, ys[k] + oy))); };
      // 地面の影 → 枕木 → 桁 → 路線色
      ctx.strokeStyle = punk ? 'rgba(0,0,0,0.35)' : P.shadow; ctx.lineWidth = z * 0.2; path(lift2 * 0.5, lift2); ctx.stroke();
      ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = z * 0.26; ctx.setLineDash([z * 0.07, z * 0.2]); path(0, 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = z * 0.13; path(0, 0); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = z * 0.07; path(0, 0); ctx.stroke();
    }
    // 列車：それぞれの行き先の道のりに沿って進む
    if (z >= 10) for (const tr of [e.tr, ...(e.xtr ?? [])]) {
      if (!tr) continue;
      const sc = screen.find((q) => `${q.r.dest.x},${q.r.dest.y}` === tr.to) ?? screen[0];
      const { xs, ys } = sc, pts = sc.r.pts;
      const segs = pts.slice(1).map((q, k) => Math.abs(q[0] - pts[k][0]) + Math.abs(q[1] - pts[k][1]));
      let d = Math.max(0, Math.min(1, tr.p)) * segs.reduce((x, y) => x + y, 0), a = 0;
      while (a < segs.length - 1 && d > segs[a]) { d -= segs[a]; a++; }
      const f = segs[a] ? Math.min(1, d / segs[a]) : 0;
      const tx = xs[a] + (xs[a + 1] - xs[a]) * f, ty = ys[a] + (ys[a + 1] - ys[a]) * f;
      if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) continue;
      const ang = Math.atan2(ys[a + 1] - ys[a], xs[a + 1] - xs[a]) + (tr.back ? Math.PI : 0);
      ctx.save();
      ctx.translate(tx, ty); ctx.rotate(ang);
      const L = z * 0.95, Wd = z * 0.46;
      ctx.fillStyle = punk ? 'rgba(0,0,0,0.4)' : P.shadow; rr(ctx, -L / 2 + z * 0.06, -Wd / 2 + z * 0.14, L, Wd, z * 0.08); ctx.fill();
      rr(ctx, -L / 2, -Wd / 2, L, Wd, z * 0.08); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = lw(0.05); ctx.stroke();
      rr(ctx, -L / 2 + z * 0.08, -Wd / 2 + z * 0.07, L * 0.62, Wd - z * 0.14, z * 0.04); ctx.fillStyle = tr.cargo.length ? '#f3f1e8' : 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = punk ? '#14181d' : P.ink; ctx.fillRect(L / 2 - z * 0.2, -Wd / 2 + z * 0.06, z * 0.14, Wd - z * 0.12);
      ctx.restore();
      if (tr.cargo.length && z >= 22) { const s0 = tr.cargo[0]; ctx.drawImage(sprite(s0.startsWith('!') ? s0.slice(1) : s0), tx - z * 0.17 - Math.cos(ang) * z * 0.1, ty - z * 0.17 - Math.sin(ang) * z * 0.1, z * 0.34, z * 0.34); }
    }
  }

  // ---- 稼働率の札：装置の上に、直近の稼働率と止まっている理由を出す ----
  if (view.stats && z >= 13) {
    const GOOD = '#2f8f55', WARN = '#c9821a';
    ctx.textAlign = 'center';
    for (const e of w.ents.values()) {
      const cfg = isMachine(e.kind) && !!e.recipe;
      if (!(cfg || e.kind === 'extractor') || !inView(e)) continue;
      const u = e.u ?? 0, sz = sizeOf(e), st = cfg ? machineState(e) : u >= 0.5 ? 0 : 2;
      // 色だけに頼らない：稼働は ●、原料待ちは ▲、詰まりは ✕
      const color = u >= 0.7 ? GOOD : u >= 0.35 ? WARN : P.red, mark = st === 0 ? '●' : st === 1 ? '▲' : '✕';
      const fs = Math.max(10, Math.min(15, z * 0.3)), tx = `${mark} ${Math.round(u * 100)}%`;
      ctx.font = `700 ${fs}px ${FONT_MONO}`;
      const wd = ctx.measureText(tx).width + fs * 0.9, hh = fs * 1.5;
      const bx = sx(e.x + sz / 2) - wd / 2, by = sy(e.y) - hh - z * 0.06;
      ctx.fillStyle = punk ? '#0b0d10' : P.plate;
      rr(ctx, bx, by, wd, hh, punk ? 0 : 4); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      // 稼働率の横棒
      ctx.fillStyle = color;
      ctx.fillRect(bx + 2, by + hh - 4, (wd - 4) * u, 2.5);
      ctx.fillStyle = punk ? '#eef0ea' : P.ink;
      ctx.fillText(tx, bx + wd / 2, by + hh / 2 - 1);
    }
  }

  // ---- 敷いている途中の線路 ----
  if (view.rail && view.rail.length) {
    ctx.strokeStyle = P.hi; ctx.lineWidth = z * 0.16; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([z * 0.25, z * 0.2]);
    ctx.beginPath(); view.rail.forEach((q, k) => (k ? ctx.lineTo(sx(q[0]), sy(q[1])) : ctx.moveTo(sx(q[0]), sy(q[1])))); ctx.stroke();
    ctx.setLineDash([]);
    const q = view.rail[view.rail.length - 1];
    ctx.fillStyle = P.hi; ctx.beginPath(); ctx.arc(sx(q[0]), sy(q[1]), z * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  // ---- 設計図の見本：置ける所は蛍光、ふさがっている所は赤 ----
  if (view.ghost) {
    ctx.textAlign = 'center';
    for (const g of view.ghost) {
      const gx = sx(g.x), gy = sy(g.y), gs = g.size * z;
      ctx.fillStyle = g.ok ? (punk ? `rgba(${P.glow},0.3)` : 'rgba(255,225,77,0.45)') : 'rgba(210,63,58,0.4)';
      ctx.fillRect(gx + 2, gy + 2, gs - 4, gs - 4);
      ctx.strokeStyle = g.ok ? P.hi : P.red; ctx.lineWidth = lw(0.05); ctx.strokeRect(gx + 2, gy + 2, gs - 4, gs - 4);
      if (z >= 18) { ctx.fillStyle = punk ? '#f0e9dc' : P.ink; ctx.font = `700 ${Math.min(gs * 0.45, z * 0.5)}px ${FONT_SMALL}`; ctx.fillText(g.glyph, gx + gs / 2, gy + gs / 2 + 1); }
    }
  }

  // ---- 範囲選択 ----
  if (view.area) {
    const [ax0, ay0, ax1, ay1] = view.area;
    ctx.fillStyle = punk ? `rgba(${P.glow},0.12)` : 'rgba(255,225,77,0.2)';
    ctx.fillRect(sx(ax0), sy(ay0), (ax1 - ax0 + 1) * z, (ay1 - ay0 + 1) * z);
    ctx.strokeStyle = P.hi; ctx.lineWidth = lw(0.08);
    ctx.setLineDash([z * 0.3, z * 0.2]); ctx.lineDashOffset = -t * z * 0.6;
    ctx.strokeRect(sx(ax0), sy(ay0), (ax1 - ax0 + 1) * z, (ay1 - ay0 + 1) * z);
    ctx.setLineDash([]);
  }

  // ---- 選んだものは蛍光ペンで囲む ----
  if (view.selected && view.selected.kind !== 'hub') {
    const e = view.selected;
    if (punk) {
      // 照準の角
      const cx0 = sx(e.x + sizeOf(e) / 2), cy0 = sy(e.y + sizeOf(e) / 2), r = z * (sizeOf(e) * 0.5 + 0.1 + 0.03 * Math.sin(t * 6)), L = z * 0.2;
      ctx.strokeStyle = P.hi; ctx.lineWidth = lw(0.08); ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(cx0 + ax * r, cy0 + ay * (r - L)); ctx.lineTo(cx0 + ax * r, cy0 + ay * r); ctx.lineTo(cx0 + ax * (r - L), cy0 + ay * r);
      }
      ctx.stroke();
    } else {
    ctx.strokeStyle = P.hi;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = lw(0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sx(e.x + sizeOf(e) / 2), sy(e.y + sizeOf(e) / 2), z * (sizeOf(e) === 2 ? 1.3 : 0.62), -0.4 + Math.sin(t * 2) * 0.1, Math.PI * 2 - 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    }
  }

  // ---- 粒子 ----
  ctx.textAlign = 'center';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = k;
    if (p.color === 'smoke') {
      // 蒸気：上がりながら広がって薄れる
      ctx.globalAlpha = k * (punk ? (light ? 0.5 : 0.3) : 0.32);
      ctx.fillStyle = p.tint ?? (punk ? (light ? '#ffffff' : '#aeb7bf') : P.soft);
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), z * p.r * (2.6 - k * 1.6), 0, Math.PI * 2); ctx.fill();
    } else if (p.color === 'spark') {
      ctx.strokeStyle = punk && !light ? P.hi : P.red;
      ctx.lineWidth = lw(0.035);
      ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x - p.vx * 0.12), sy(p.y - p.vy * 0.12)); ctx.stroke();
    } else if (p.text) {
      ctx.fillStyle = p.color;
      ctx.font = `600 ${z * 0.4}px ${FONT_HAND}`;
      ctx.fillText(p.text, sx(p.x), sy(p.y));
    } else if (punk) {
      // 火花
      ctx.strokeStyle = light ? P.red : P.hi;
      ctx.lineWidth = lw(0.04);
      ctx.beginPath();
      ctx.moveTo(sx(p.x), sy(p.y));
      ctx.lineTo(sx(p.x - p.vx * 0.22), sy(p.y - p.vy * 0.22));
      ctx.stroke();
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = lw(0.03);
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), z * p.r * (1.8 - k * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (punk) ambient(ctx, P, cw, ch, t, dt, sx(hr.x + hr.s / 2), sy(hr.y + hr.s / 2), z);
}

/** 工業スキンの空気。同じ工場の「光の側」と「闇の側」。
 *  光：雲の影が流れ、その切れ間から日が差し、塵が光る。
 *  闇：煙が漂って視界を奪い、納品所の警告灯が回り、火の粉が立ちのぼる。 */
function ambient(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number, dt: number, hx: number, hy: number, z: number) {
  const light = P.name === 'light', big = Math.max(cw, ch);
  const blob = (x: number, y: number, r: number, rgba: (a: number) => string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(a)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (light) {
    // 雲の影（闇）と、その切れ間の日だまり（光）
    for (let i = 0; i < 4; i++) {
      const x = (mod(i * 0.37 + t * 0.006, 1.4) - 0.2) * cw, y = (0.15 + 0.7 * hash(i, 41)) * ch;
      blob(x, y, big * (0.28 + 0.1 * hash(i, 43)), (a) => `rgba(18,28,40,${a})`, 0.16);
    }
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 3; i++) {
      const x = (mod(i * 0.41 + 0.2 + t * 0.006, 1.4) - 0.2) * cw, y = (0.2 + 0.6 * hash(i, 47)) * ch;
      blob(x, y, big * 0.26, (a) => `rgba(255,248,225,${a})`, 0.75);
    }
    // 天窓からの光の帯
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(-0.42);
    const span = Math.hypot(cw, ch);
    for (let i = 0; i < 4; i++) {
      const x = mod(t * 14 + i * span * 0.31, span * 1.25) - span * 0.62, wd = span * (0.05 + 0.03 * (i % 2));
      const g = ctx.createLinearGradient(x - wd, 0, x + wd, 0);
      g.addColorStop(0, `rgba(${P.glow},0)`); g.addColorStop(0.5, `rgba(${P.glow},0.7)`); g.addColorStop(1, `rgba(${P.glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - wd, -span, wd * 2, span * 2);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 0.4, 1);
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
      ctx.fillRect(mod(m.x + Math.sin(t * 0.3 + m.ph) * 0.01, 1) * cw, m.y * ch, m.s, m.s);
    }
    ctx.globalAlpha = 1;
  } else {
    // 回る警告灯
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const ang = t * 1.1 + k * Math.PI, R = z * 16;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      g.addColorStop(0, 'rgba(255,60,36,0.28)'); g.addColorStop(1, 'rgba(255,60,36,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, R, ang - 0.17, ang + 0.17); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 漂う煙
    for (let i = 0; i < 5; i++) {
      const x = (mod(i * 0.29 + t * 0.011, 1.4) - 0.2) * cw, y = (0.1 + 0.8 * hash(i, 53)) * ch + Math.sin(t * 0.2 + i) * 20;
      blob(x, y, big * (0.22 + 0.1 * hash(i, 59)), (a) => `rgba(4,5,7,${a})`, 0.42);
    }
    // 周辺は闇に沈む
    const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.28, cw / 2, ch / 2, big * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.68)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
    // 火の粉
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 1.8, 1);
      const fl = 0.5 + 0.5 * Math.sin(t * 7 + m.ph * 3), x = mod(m.x + Math.sin(t * 0.9 + m.ph) * 0.02, 1) * cw, y = m.y * ch;
      ctx.strokeStyle = `rgba(${P.glow},${0.3 + 0.6 * fl * m.y})`;
      ctx.lineWidth = m.s * (0.7 + 0.6 * m.y);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t + m.ph) * 2, y + 5 * m.s); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function token(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, z: number, s: string, flat = false) {
  const d = z * 0.78;
  if (flat) { ctx.drawImage(sprite(s), x - d / 2, y - d / 2, d, d); return; }
  // 物質はベルトの上に乗っている：下に影を落とし、少し持ち上げて描く
  ctx.fillStyle = P.skin === 'punk' ? 'rgba(0,0,0,0.38)' : 'rgba(20,30,50,0.2)';
  ctx.beginPath(); ctx.ellipse(x + d * 0.05, y + d * 0.36, d * 0.3, d * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(sprite(s), x - d / 2, y - d / 2 - d * 0.09, d, d);
  if (z >= 52) {
    const su = sub(s), tx = label(s);
    ctx.font = `600 ${z * 0.13}px ${su.formula && !su.mask ? FONT_MONO : FONT_HAND}`;
    const wd = ctx.measureText(tx).width + z * 0.1;
    ctx.fillStyle = P.paper;
    rr(ctx, x - wd / 2, y + z * 0.27, wd, z * 0.18, z * 0.04);
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'center';
    ctx.fillText(tx, x, y + z * 0.365);
  }
}

function machine(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number) {
  if (P.skin === 'punk') { machinePunk(ctx, P, cx, cy, u, z, e, t); return; }
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const unset = isMachine(e.kind) && !e.recipe;
  const line = Math.max(1.5, u * 0.045);
  const disc = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const inked = (fill: string) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke(); };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const punk = (P.skin as string) === 'punk';
  if (punk) {
    // 角を落とした鋼板に四隅のボルト
    ctx.fillStyle = P.shadow;
    chamfer(ctx, cx - u * 0.43 + u * 0.05, cy - u * 0.43 + u * 0.07, u * 0.86, u * 0.86, u * 0.13);
    ctx.fill();
    chamfer(ctx, cx - u * 0.43, cy - u * 0.43, u * 0.86, u * 0.86, u * 0.13);
    inked(P.plate);
    ctx.strokeStyle = P.name === 'light' ? 'rgba(255,255,255,0.9)' : `rgba(${P.glow},${e.busy ? 0.7 : 0.25})`;
    ctx.lineWidth = line * 0.6;
    chamfer(ctx, cx - u * 0.37, cy - u * 0.37, u * 0.74, u * 0.74, u * 0.1);
    ctx.stroke();
    if (z >= 30) {
      ctx.fillStyle = P.ink;
      for (const [bx, by] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { ctx.beginPath(); ctx.arc(cx + bx * u * 0.37, cy + by * u * 0.37, u * 0.022, 0, Math.PI * 2); ctx.fill(); }
    }
  } else {
  // 台：紙に貼った札。影はずらしたベタ
  // 厚み：地面の影 → 機種の色の側面 → 上面
  const th = (u / sizeOf(e)) * 0.13;
  ctx.fillStyle = P.shadow;
  rr(ctx, cx - u * 0.42 + th * 0.8, cy - u * 0.42 + th * 1.9, u * 0.84, u * 0.84, u * 0.12);
  ctx.fill();
  rr(ctx, cx - u * 0.42, cy - u * 0.42 + th, u * 0.84, u * 0.84, u * 0.12);
  inked(mix(info.color, P.ink, 0.25));
  rr(ctx, cx - u * 0.42, cy - u * 0.42, u * 0.84, u * 0.84, u * 0.12);
  inked(P.plate);
  }

  const busy = !!e.busy;
  glyph(ctx, P, e, cx, cy, u, t, line);

  // 名札
  if (z >= 34 && !unset) {
    rr(ctx, cx - u * 0.46, cy - u * 0.46, u * 0.27, u * 0.27, u * 0.05); inked(info.color);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${u * 0.17}px ${FONT_SMALL}`;
    ctx.textAlign = 'center';
    ctx.fillText(info.glyph, cx - u * 0.325, cy - u * 0.315);
  }

  // 出口の矢じり。大きい装置では、出口のあるマスごとに描く。ox, oy は装置の中心から出口のマスの中心までのずれ（マス単位）
  const sz = sizeOf(e), pu = u / sz, EO = sz === 2 ? 0.34 : 0.42, mx = e.x + sz / 2, my = e.y + sz / 2;
  const port = (d: number, color: string, text?: string, ox = 0, oy = 0, s?: string) => {
    const bx = cx + ox * pu, by = cy + oy * pu;
    ctx.save();
    ctx.translate(bx + DX[d] * pu * EO, by + DY[d] * pu * EO);
    ctx.rotate((d * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(pu * 0.15, 0); ctx.lineTo(-pu * 0.03, -pu * 0.12); ctx.lineTo(-pu * 0.03, pu * 0.12);
    ctx.closePath();
    inked(color);
    ctx.restore();
    if (sz === 2 && s && z >= 26) {
      // 何が出る出口かを、出口のすぐ内側に絵柄で示す
      const d2 = pu * 0.44, ix = bx + DX[d] * pu * 0.06, iy = by + DY[d] * pu * 0.06;
      disc(ix, iy, d2 * 0.52); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.6; ctx.stroke();
      ctx.drawImage(sprite(s), ix - d2 / 2, iy - d2 / 2, d2, d2);
    } else if (text && z >= 48) {
      ctx.font = `600 ${pu * 0.13}px ${FONT_MONO}`;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'center';
      ctx.fillText(text, cx + DX[d] * u * 0.2 + (DY[d] ? u * 0.26 : 0), cy + DY[d] * u * 0.25 + (DX[d] ? u * 0.3 : 0));
    }
  };
  // 入口の目安：奥の面に、内向きの切り欠き
  for (const dr of inDoors(e)) {
    ctx.save();
    ctx.translate(cx + (dr.x + 0.5 - mx) * pu - DX[dr.d] * pu * (EO + 0.1), cy + (dr.y + 0.5 - my) * pu - DY[dr.d] * pu * (EO + 0.1));
    ctx.rotate((dr.d * Math.PI) / 2);
    ctx.strokeStyle = P.ink; ctx.lineWidth = line;
    ctx.beginPath(); ctx.moveTo(-pu * 0.06, -pu * 0.13); ctx.lineTo(pu * 0.08, 0); ctx.lineTo(-pu * 0.06, pu * 0.13); ctx.stroke();
    ctx.restore();
  }
  if (e.kind === 'extractor' || e.kind === 'depot' || e.kind === 'sampler') port(e.dir, P.plate);
  else if (e.kind === 'analyzer') { port(portDir(e.dir, 0), '#7fc06a', '陽'); port(portDir(e.dir, 1), P.red, '陰'); }
  else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), P.plate);
  else if (e.kind === 'station') { if (e.role === 'out') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, P.plate, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); } }
  else if (e.outOrder) e.outOrder.forEach((s2, i) => { const p = outPort(e, i); port(p.d, sub(s2).color, label(s2), p.x + 0.5 - mx, p.y + 0.5 - my, s2); });
  else if (unset) { const p = slotPort(e, 0); port(p.d, P.plate, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  if (e.kind === 'electrolyzer' && e.big) poleMarks(ctx, P, e, cx, cy, pu, line);
  if ((e.pw || 0) > 0) powerMark(ctx, P, cx, cy, u, t);

  // 赤ペンの印：設定が要る「？」、詰まっている「！」
  const jam = (e.stuck || 0) > 2.5 || !!e.bad || (e.kind === 'station' && e.role === 'out' && (e.buf?.length ?? 0) >= STATION_CAP);
  const needs = unset || (e.kind === 'analyzer' && !e.test) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
  if (needs || jam) {
    if (needs) {
      ctx.strokeStyle = P.red; ctx.lineWidth = line * 1.2;
      ctx.setLineDash([u * 0.12, u * 0.09]);
      ctx.lineDashOffset = -t * u * 0.2;
      if (punk) chamfer(ctx, cx - u * 0.43, cy - u * 0.43, u * 0.86, u * 0.86, u * 0.13); else rr(ctx, cx - u * 0.42, cy - u * 0.42, u * 0.84, u * 0.84, u * 0.12);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    disc(cx + u * 0.32, cy - u * 0.32, u * 0.15); inked(P.red);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${u * 0.2}px ${FONT_SMALL}`;
    ctx.textAlign = 'center';
    ctx.fillText(jam ? '！' : '？', cx + u * 0.32, cy - u * 0.31);
  }
  if (busy) {
    // 進み具合は蛍光ペンの下線
    ctx.strokeStyle = P.hi; ctx.lineWidth = u * 0.07; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(cx - u * 0.34, cy + u * 0.36); ctx.lineTo(cx - u * 0.34 + u * 0.68 * (e.prog || 0), cy + u * 0.36); ctx.stroke();
  }
}

/** 工業スキンの装置：機種の色で塗った厚い筐体、黒い計器盤、四隅のボルト、状態を示すランプ */
function machinePunk(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number) {
  const info = MACHINES[e.kind as keyof typeof MACHINES], light = P.name === 'light';
  const unset = isMachine(e.kind) && !e.recipe;
  const needs = unset || (e.kind === 'analyzer' && !e.test) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
  const jam = (e.stuck || 0) > 2.5 || !!e.bad || (e.kind === 'station' && e.role === 'out' && (e.buf?.length ?? 0) >= STATION_CAP), busy = !!e.busy;
  const line = Math.max(1.5, u * 0.05), a = u * 0.46, c = u * 0.14, INK = '#0b0d10';
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  // 出口：筐体から突き出た管。大きい装置では、出口のあるマスごとに描く
  const sz = sizeOf(e), pu = u / sz, EO = sz === 2 ? 0.42 : 0.46, mx = e.x + sz / 2, my = e.y + sz / 2;
  const marks: (() => void)[] = [];
  const port = (d: number, color: string, text?: string, ox = 0, oy = 0, s?: string) => {
    const bx = cx + ox * pu, by = cy + oy * pu;
    ctx.save();
    ctx.translate(bx + DX[d] * pu * EO, by + DY[d] * pu * EO);
    ctx.rotate((d * Math.PI) / 2);
    ctx.fillStyle = light ? '#8d969e' : '#4d545c';
    ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8;
    ctx.fillRect(-pu * 0.02, -pu * 0.13, pu * 0.1, pu * 0.26); ctx.strokeRect(-pu * 0.02, -pu * 0.13, pu * 0.1, pu * 0.26);
    ctx.beginPath(); ctx.moveTo(pu * 0.2, 0); ctx.lineTo(pu * 0.08, -pu * 0.1); ctx.lineTo(pu * 0.08, pu * 0.1); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    ctx.restore();
    if (sz === 2 && s && z >= 26) {
      // 筐体を描いたあとで、出口のすぐ内側に中身の絵柄を載せる
      const d2 = pu * 0.44, ix = bx + DX[d] * pu * 0.1, iy = by + DY[d] * pu * 0.1;
      marks.push(() => {
        ctx.beginPath(); ctx.arc(ix, iy, d2 * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = '#eef0ea'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line * 0.6; ctx.stroke();
        ctx.drawImage(sprite(s), ix - d2 / 2, iy - d2 / 2, d2, d2);
      });
    } else if (text && z >= 48) {
      ctx.font = `600 ${pu * 0.12}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      const tx = cx + DX[d] * u * 0.22 + (DY[d] ? u * 0.2 : 0), ty = cy + DY[d] * u * 0.25 + (DX[d] ? u * 0.25 : 0);
      ctx.fillStyle = '#eef0ea';
      ctx.fillText(text, tx, ty);
    }
  };
  const ports = () => {
    // 入口の目安：奥の面の受け口
    for (const dr of inDoors(e)) {
      ctx.save();
      ctx.translate(cx + (dr.x + 0.5 - mx) * pu - DX[dr.d] * pu * (EO + 0.06), cy + (dr.y + 0.5 - my) * pu - DY[dr.d] * pu * (EO + 0.06));
      ctx.rotate((dr.d * Math.PI) / 2);
      ctx.fillStyle = INK;
      ctx.fillRect(-pu * 0.08, -pu * 0.16, pu * 0.14, pu * 0.32);
      ctx.strokeStyle = P.hi; ctx.lineWidth = line * 0.7;
      ctx.beginPath(); ctx.moveTo(-pu * 0.05, -pu * 0.09); ctx.lineTo(pu * 0.03, 0); ctx.lineTo(-pu * 0.05, pu * 0.09); ctx.stroke();
      ctx.restore();
    }
    if (e.kind === 'extractor' || e.kind === 'depot' || e.kind === 'sampler') port(e.dir, '#eef0ea');
    else if (e.kind === 'analyzer') { port(portDir(e.dir, 0), '#7fc06a', '陽'); port(portDir(e.dir, 1), P.red, '陰'); }
    else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), '#eef0ea');
    else if (e.kind === 'station') { if (e.role === 'out') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, '#eef0ea', undefined, p.x + 0.5 - mx, p.y + 0.5 - my); } }
    else if (e.outOrder) e.outOrder.forEach((s2, i) => { const p = outPort(e, i); port(p.d, sub(s2).color, label(s2), p.x + 0.5 - mx, p.y + 0.5 - my, s2); });
    else if (unset) { const p = slotPort(e, 0); port(p.d, '#eef0ea', undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  };

  // 影と筐体
  // 厚み：地面に落ちる影と、筐体の手前の側面
  const th = pu * 0.15;
  ctx.fillStyle = `rgba(0,0,0,${light ? 0.26 : 0.5})`;
  chamfer(ctx, cx - a + th * 0.9, cy - a + th * 2.1, a * 2, a * 2, c); ctx.fill();
  chamfer(ctx, cx - a, cy - a + th, a * 2, a * 2, c);
  ctx.fillStyle = mix(info.color, '#0b0d10', light ? 0.55 : 0.72); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  // 側面のリブ
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = line * 0.6;
  ctx.beginPath();
  for (let k = 1; k < 4 * sz; k++) { const rx = cx - a + c + ((a * 2 - c * 2) * k) / (4 * sz); ctx.moveTo(rx, cy + a + line * 0.5); ctx.lineTo(rx, cy + a + th - line * 0.5); }
  ctx.stroke();
  chamfer(ctx, cx - a, cy - a, a * 2, a * 2, c);
  ctx.fillStyle = mix(info.color, '#0b0d10', light ? 0.1 : 0.42); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  // 面取りの光と影
  ctx.lineWidth = line * 0.7;
  ctx.strokeStyle = `rgba(255,255,255,${light ? 0.6 : 0.2})`;
  ctx.beginPath(); ctx.moveTo(cx - a + line, cy + a - c); ctx.lineTo(cx - a + line, cy - a + c); ctx.lineTo(cx - a + c, cy - a + line); ctx.lineTo(cx + a - c, cy - a + line); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.moveTo(cx + a - line, cy - a + c); ctx.lineTo(cx + a - line, cy + a - c); ctx.lineTo(cx + a - c, cy + a - line); ctx.lineTo(cx - a + c, cy + a - line); ctx.stroke();

  // 計器盤
  const b = u * 0.335;
  chamfer(ctx, cx - b, cy - b, b * 2, b * 2, u * 0.07);
  ctx.fillStyle = '#0e1115'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8; ctx.stroke();
  if (busy) {
    // 稼働中は内側から機種の色で光る
    ctx.save();
    chamfer(ctx, cx - b, cy - b, b * 2, b * 2, u * 0.07); ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b * 1.4);
    g.addColorStop(0, mix(info.color, '#ffffff', 0.25)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 9 + e.x);
    ctx.fillStyle = g; ctx.fillRect(cx - b, cy - b, b * 2, b * 2);
    ctx.restore();
  }
  glyph(ctx, { ...P, ink: '#eef0ea', plate: '#2c333c', soft: '#9aa3ab' }, e, cx, cy, u * 0.74, t, line * 0.75);
  ports();

  if (z >= 30) {
    // 四隅のボルト
    for (const [bx, by] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); ctx.arc(cx + bx * u * 0.385, cy + by * u * 0.385, u * 0.03, 0, Math.PI * 2);
      ctx.fillStyle = light ? '#f4f5f2' : '#6b727a'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = line * 0.5; ctx.stroke();
    }
    // 機種名の刻印
    ctx.fillStyle = P.hi;
    ctx.fillRect(cx - a + u * 0.1, cy - a + u * 0.02, u * 0.22, u * 0.1);
    ctx.fillStyle = INK;
    ctx.font = `700 ${u * 0.1}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.fillText(info.name.slice(0, 2), cx - a + u * 0.21, cy - a + u * 0.075);
  }
  for (const m of marks) m();
  if (e.kind === 'electrolyzer' && e.big) poleMarks(ctx, P, e, cx, cy, pu, line);
  if ((e.pw || 0) > 0) powerMark(ctx, P, cx, cy, u, t);
  // 状態ランプ：緑＝稼働、橙＝待機、赤の点滅＝設定待ち・詰まり
  const lamp = needs || jam ? (Math.sin(t * 10) > 0 ? P.red : '#3a1410') : busy ? '#58e06a' : e.recipe || e.test || e.sub || e.kind === 'extractor' ? '#ffb020' : '#3b4048';
  ctx.beginPath(); ctx.arc(cx + a - u * 0.14, cy - a + u * 0.07, u * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = lamp; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line * 0.5; ctx.stroke();
  if (!light && lamp !== '#3b4048' && lamp !== '#3a1410') {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx + a - u * 0.14, cy - a + u * 0.07, 0, cx + a - u * 0.14, cy - a + u * 0.07, u * 0.3);
    g.addColorStop(0, lamp + '88'); g.addColorStop(1, lamp + '00');
    ctx.fillStyle = g; ctx.fillRect(cx + a - u * 0.44, cy - a - u * 0.23, u * 0.6, u * 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (needs || jam) {
    ctx.strokeStyle = P.red; ctx.lineWidth = line * 1.3;
    ctx.setLineDash([u * 0.12, u * 0.09]);
    ctx.lineDashOffset = -t * u * 0.25;
    chamfer(ctx, cx - a - u * 0.03, cy - a - u * 0.03, a * 2 + u * 0.06, a * 2 + u * 0.06, c); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.red;
    ctx.font = `700 ${u * 0.34}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    if (Math.sin(t * 6) > -0.3) ctx.fillText(jam ? '！' : '？', cx, cy + u * 0.02);
  }
  if (busy) {
    // 進み具合は盤の下のランプ列
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i < Math.ceil((e.prog || 0) * 8) ? P.hi : 'rgba(255,255,255,0.14)';
      ctx.fillRect(cx - b + u * 0.03 + i * ((b * 2 - u * 0.06) / 8), cy + b - u * 0.08, (b * 2 - u * 0.06) / 8 - u * 0.012, u * 0.045);
    }
  }
}

/** 装置の中身の絵。台は呼ぶ側が描く */
function glyph(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, u: number, t: number, line: number) {
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const disc = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const inked = (fill: string) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke(); };
  const busy = !!e.busy;
  switch (e.kind) {
    case 'extractor': {
      disc(cx, cy, u * 0.27); inked(info.color);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 3 + e.x);
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.ellipse(u * 0.12, 0, u * 0.11, u * 0.045, 0, 0, Math.PI * 2);
        ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7; ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'separator': {
      rr(ctx, cx - u * 0.13, cy - u * 0.33, u * 0.26, u * 0.66, u * 0.1); inked(info.color);
      ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7;
      for (let i = 0; i < 4; i++) {
        const ty = cy + u * (0.2 - i * 0.13);
        const lit = busy && Math.floor(((e.prog || 0) * 8) % 4) === i;
        if (lit) { ctx.fillStyle = P.hi; ctx.fillRect(cx - u * 0.13, ty - u * 0.05, u * 0.26, u * 0.1); }
        ctx.beginPath(); ctx.moveTo(cx - u * 0.13, ty); ctx.lineTo(cx + u * 0.13, ty); ctx.stroke();
      }
      break;
    }
    case 'electrolyzer': {
      rr(ctx, cx - u * 0.29, cy - u * 0.06, u * 0.58, u * 0.34, u * 0.06); inked(mix(info.color, '#ffffff', P.name === 'light' ? 0.55 : 0.1));
      ctx.strokeStyle = P.ink; ctx.lineWidth = u * 0.07;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.14, cy - u * 0.24); ctx.lineTo(cx - u * 0.14, cy + u * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + u * 0.14, cy - u * 0.24); ctx.lineTo(cx + u * 0.14, cy + u * 0.18); ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = `600 ${u * 0.16}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('−', cx - u * 0.14, cy - u * 0.33);
      ctx.fillText('+', cx + u * 0.14, cy - u * 0.33);
      if (busy) {
        ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.6;
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.4 + i * 0.37) % 1;
          disc(cx + (i % 2 ? 0.21 : -0.07) * u + Math.sin(i * 9 + t * 4) * u * 0.02, cy + u * (0.22 - ph * 0.26), u * 0.024);
          ctx.stroke();
        }
      }
      break;
    }
    case 'reactor': {
      disc(cx, cy, u * 0.3); inked(info.color);
      disc(cx, cy, u * 0.17); inked(busy ? P.hi : P.plate);
      if (busy) {
        ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 4);
        ctx.beginPath(); ctx.moveTo(-u * 0.1, 0); ctx.lineTo(u * 0.1, 0); ctx.moveTo(0, -u * 0.1); ctx.lineTo(0, u * 0.1); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'battery': {
      rr(ctx, cx - u * 0.27, cy - u * 0.18, u * 0.54, u * 0.46, u * 0.06); inked(info.color);
      rr(ctx, cx - u * 0.2, cy - u * 0.29, u * 0.12, u * 0.11, u * 0.02); inked(P.plate);
      rr(ctx, cx + u * 0.08, cy - u * 0.29, u * 0.12, u * 0.11, u * 0.02); inked(P.plate);
      ctx.fillStyle = '#1c2a48';
      ctx.font = `600 ${u * 0.2}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('−', cx - u * 0.14, cy + u * 0.06);
      ctx.fillText('+', cx + u * 0.14, cy + u * 0.06);
      if (busy && Math.sin(t * 14) > 0) { disc(cx, cy - u * 0.24, u * 0.045); ctx.fillStyle = P.hi; ctx.fill(); }
      break;
    }
    case 'splitter': {
      disc(cx, cy, u * 0.28); inked(info.color);
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.28, cy - u * 0.28, u * 0.56, u * 0.56);
      break;
    }
    case 'analyzer': {
      ctx.strokeStyle = P.ink; ctx.lineWidth = u * 0.1;
      ctx.beginPath(); ctx.moveTo(cx + u * 0.12, cy + u * 0.12); ctx.lineTo(cx + u * 0.28, cy + u * 0.28); ctx.stroke();
      disc(cx - u * 0.04, cy - u * 0.04, u * 0.21); inked(mix(info.color, '#ffffff', P.name === 'light' ? 0.6 : 0.15));
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.22, cy - u * 0.22, u * 0.36, u * 0.36);
      break;
    }
    case 'sampler': {
      for (let i = -1; i <= 1; i++) {
        rr(ctx, cx + i * u * 0.19 - u * 0.07, cy - u * 0.13, u * 0.14, u * 0.28, u * 0.03); inked(['#d9a05b', '#8fbf7a', '#7fb2d9'][i + 1]);
        ctx.fillStyle = P.ink;
        ctx.fillRect(cx + i * u * 0.19 - u * 0.035, cy - u * 0.2, u * 0.07, u * 0.07);
      }
      ctx.strokeStyle = P.ink; ctx.lineWidth = line;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.32, cy + u * 0.2); ctx.lineTo(cx + u * 0.32, cy + u * 0.2); ctx.stroke();
      break;
    }
    case 'collector': {
      rr(ctx, cx - u * 0.17, cy - u * 0.14, u * 0.34, u * 0.42, u * 0.06); inked(mix(info.color, '#ffffff', P.name === 'light' ? 0.6 : 0.12));
      if (busy) { ctx.fillStyle = info.color; ctx.fillRect(cx - u * 0.14, cy + u * (0.25 - 0.34 * (e.prog || 0)), u * 0.28, u * 0.34 * (e.prog || 0)); }
      rr(ctx, cx - u * 0.09, cy - u * 0.27, u * 0.18, u * 0.13, u * 0.02); inked(info.color);
      break;
    }
    case 'depot': {
      rr(ctx, cx - u * 0.26, cy - u * 0.26, u * 0.52, u * 0.52, u * 0.06); inked(info.color);
      if (e.sub) ctx.drawImage(sprite(e.sub), cx - u * 0.25, cy - u * 0.25, u * 0.5, u * 0.5);
      break;
    }
    case 'station': {
      // 駅舎：路線色の屋根に番線の数字。積む駅は上向き、降ろす駅は下向きの矢じり
      const col = LINE_COLORS[((e.ch || 1) - 1) % LINE_COLORS.length], out = e.role === 'out';
      rr(ctx, cx - u * 0.3, cy - u * 0.22, u * 0.6, u * 0.44, u * 0.05); inked(col);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = line * 0.6;
      for (const k of [-0.1, 0.1]) { ctx.beginPath(); ctx.moveTo(cx - u * 0.3, cy + u * k); ctx.lineTo(cx + u * 0.3, cy + u * k); ctx.stroke(); }
      disc(cx, cy, u * 0.14); inked('#f3f1e8');
      ctx.fillStyle = '#14181d'; ctx.font = `700 ${u * 0.18}px ${FONT_MONO}`; ctx.textAlign = 'center';
      ctx.fillText(String(e.ch || 1), cx, cy + u * 0.01);
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      if (out) { ctx.moveTo(cx - u * 0.08, cy + u * 0.27); ctx.lineTo(cx + u * 0.08, cy + u * 0.27); ctx.lineTo(cx, cy + u * 0.36); }
      else { ctx.moveTo(cx - u * 0.08, cy - u * 0.27); ctx.lineTo(cx + u * 0.08, cy - u * 0.27); ctx.lineTo(cx, cy - u * 0.36); }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'vent': {
      disc(cx, cy + u * 0.06, u * 0.21); inked(info.color);
      disc(cx, cy + u * 0.06, u * 0.12); inked(P.plate);
      const f = 0.2 + 0.06 * Math.sin(t * 11 + e.x * 3) + 0.03 * Math.sin(t * 23);
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.08, cy + u * 0.06);
      ctx.quadraticCurveTo(cx, cy - u * f * 1.6, cx + u * 0.08, cy + u * 0.06);
      ctx.closePath();
      inked(P.red);
      break;
    }
  }
}

/** 納品所：全元素を欲しがる機械。大きくなるほど、歯・煙突・棘・回る環が増えていかつくなる。
 *  外周に並ぶ元素の印は、その元素を飲み込むと灯る */
function hub(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World, t: number) {
  const s = z * size, lv = Math.max(0, [2, 4, 6, 8].indexOf(size)), punk = P.skin === 'punk', light = P.name === 'light';
  const cxh = px + s / 2, cyh = py + s / 2, line = Math.max(1.5, z * 0.05), m = z * 0.06, c = z * 0.3;
  const INK = punk ? '#07090b' : P.ink;
  const hull = punk ? (light ? '#2e353d' : '#171b20') : light ? '#2b3550' : '#1a2620';
  const steel = punk ? (light ? '#8d969e' : '#4d545c') : light ? '#8792ab' : '#6f8176';
  const hot = punk ? P.hi : light ? P.red : P.hi, core = punk ? '#ff3c24' : P.red;
  const pulse = 0.5 + 0.5 * Math.sin(t * (2.2 + lv * 0.5));
  const box = (ox: number, oy: number, grow = 0) => chamfer(ctx, px + m - grow + ox, py + m - grow + oy, s - 2 * m + grow * 2, s - 2 * m + grow * 2, c);
  ctx.lineJoin = 'miter';

  // 地面の影と、背の高い側面
  const th = z * (0.22 + lv * 0.06);
  ctx.fillStyle = punk ? `rgba(0,0,0,${light ? 0.3 : 0.55})` : P.shadow;
  box(th * 0.7, th * 1.8); ctx.fill();
  // 棘：段階 2 から外へ突き出す。段階 3 では脈打つ
  if (lv >= 2) {
    const n = size * 2, len = z * (lv >= 3 ? 0.42 + 0.08 * pulse : 0.3), half = z * 0.16;
    ctx.fillStyle = steel; ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8;
    for (let side = 0; side < 4; side++) for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * (s - z * 0.9);
      const [bx, by, nx, ny] = side === 0 ? [cxh + u, py + m, 0, -1] : side === 1 ? [px + s - m, cyh + u, 1, 0] : side === 2 ? [cxh + u, py + s - m, 0, 1] : [px + m, cyh + u, -1, 0];
      ctx.beginPath(); ctx.moveTo(bx - ny * half, by + nx * half); ctx.lineTo(bx + nx * len, by + ny * len); ctx.lineTo(bx + ny * half, by - nx * half); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
  box(0, th); ctx.fillStyle = punk ? '#0b0d10' : mix(hull, '#000000', 0.35); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  // 筐体
  box(0, 0); ctx.fillStyle = hull; ctx.fill(); ctx.stroke();
  if (punk) {
    // 縁の危険表示
    ctx.save(); box(0, 0); ctx.clip();
    ctx.strokeStyle = P.hi; ctx.lineWidth = z * 0.1; ctx.globalAlpha = light ? 0.9 : 0.75;
    ctx.setLineDash([z * 0.22, z * 0.22]); ctx.lineDashOffset = -t * z * 0.3;
    chamfer(ctx, px + m + z * 0.07, py + m + z * 0.07, s - 2 * m - z * 0.14, s - 2 * m - z * 0.14, c * 0.8); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // 四辺の搬入口：歯が噛み合う口。マスごとに 1 つ
  const chomp = 0.5 + 0.5 * Math.sin(t * 7);
  for (let side = 0; side < 4; side++) for (let k = 0; k < size; k++) {
    const u = (k + 0.5 - size / 2) * z;
    ctx.save();
    ctx.translate(side === 0 ? cxh + u : side === 1 ? px + s - m : side === 2 ? cxh + u : px + m, side === 0 ? py + m : side === 1 ? cyh + u : side === 2 ? py + s - m : cyh + u);
    ctx.rotate((side * Math.PI) / 2);
    const jw = z * 0.34, jh = z * 0.26;
    ctx.fillStyle = '#050607'; ctx.fillRect(-jw, 0, jw * 2, jh);
    ctx.fillStyle = core; ctx.globalAlpha = 0.25 + 0.3 * pulse; ctx.fillRect(-jw, jh * 0.55, jw * 2, jh * 0.45); ctx.globalAlpha = 1;
    ctx.fillStyle = steel;
    for (let i = 0; i < 4; i++) {
      const x0 = -jw + (i * jw) / 2, d = jh * (0.35 + 0.3 * (i % 2 ? chomp : 1 - chomp));
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + jw / 4, d); ctx.lineTo(x0 + jw / 2, 0); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = line * 0.7; ctx.strokeRect(-jw, 0, jw * 2, jh);
    ctx.restore();
  }

  // 元素の環：飲み込んだ元素は色がつき、まだのものは影だけ
  const els = ELEMENTS, ringR = s / 2 - z * (0.42 + (lv ? 0.1 : 0)), er = Math.max(2.5, Math.min(z * 0.17, (ringR * 8) / els.length / 2.6));
  // 2×2 のうちは場所がないので、元素の環は出さない（納品所をタップすれば一覧が見える）
  if (z >= 16 && lv >= 1) els.forEach((el, i) => {
    const a = (i / els.length) * Math.PI * 2 - Math.PI / 2 + (lv >= 3 ? t * 0.05 : 0);
    const k = Math.SQRT2, ex = cxh + ringR * Math.max(-1, Math.min(1, Math.cos(a) * k)), ey = cyh + ringR * Math.max(-1, Math.min(1, Math.sin(a) * k));
    const tier = fedTier(w, el.sym);
    ctx.beginPath(); ctx.arc(ex, ey, er * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = tier ? '#f3f1e8' : '#0a0c0e'; ctx.fill();
    ctx.strokeStyle = tier >= 3 ? hot : tier ? INK : steel; ctx.lineWidth = tier >= 2 ? line * 0.9 : line * 0.5; ctx.stroke();
    ctx.globalAlpha = tier ? 1 : 0.28;
    drawElement(ctx, el.sym, ex, ey, er * 0.8);
    ctx.globalAlpha = 1;
  });

  // 中央の口：回る歯の環と、赤く脈打つ炉心
  const R = lv === 0 ? z * 0.6 : Math.min(s * 0.3, s / 2 - z * 0.82);
  const ring = (r: number, teeth: number, rot: number, depth: number, fill: string) => {
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = rot + (i / (teeth * 2)) * Math.PI * 2, rr2 = i % 2 ? r : r + depth; ctx.lineTo(cxh + Math.cos(a) * rr2, cyh + Math.sin(a) * rr2); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8; ctx.stroke();
  };
  if (lv >= 3) ring(R * 1.34, 28, -t * 0.25, R * 0.1, steel);
  if (lv >= 1) ring(R * 1.14, 10 + lv * 4, t * 0.35, R * 0.12, mix(steel, hull, 0.35));
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.04, 0, Math.PI * 2); ctx.fillStyle = '#050607'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  const glow = ctx.createRadialGradient(cxh, cyh, R * 0.15, cxh, cyh, R);
  glow.addColorStop(0, punk && !light ? 'rgba(255,90,40,0.55)' : 'rgba(210,63,58,0.42)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55 + 0.45 * pulse; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cxh, cyh, R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  // 内向きの牙
  const fangs = 8 + lv * 4;
  ctx.fillStyle = steel; ctx.strokeStyle = INK; ctx.lineWidth = line * 0.6;
  for (let i = 0; i < fangs; i++) {
    const a = t * -0.5 + (i / fangs) * Math.PI * 2, wd = (Math.PI / fangs) * 0.7, r1 = R * 1.02, r2 = R * (0.8 - 0.05 * chomp);
    ctx.beginPath(); ctx.moveTo(cxh + Math.cos(a - wd) * r1, cyh + Math.sin(a - wd) * r1); ctx.lineTo(cxh + Math.cos(a) * r2, cyh + Math.sin(a) * r2); ctx.lineTo(cxh + Math.cos(a + wd) * r1, cyh + Math.sin(a + wd) * r1); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // 煙突：段階 1 から四隅に立ち、煙を吐く
  if (lv >= 1) {
    const off = s / 2 - z * 0.62;
    for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cxh + ax * off, y = cyh + ay * off, r = z * (0.2 + lv * 0.03);
      ctx.beginPath(); ctx.arc(x, y + r * 0.35, r, 0, Math.PI * 2); ctx.fillStyle = '#0b0d10'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = steel; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#050607'; ctx.fill();
      if (particles.length < 260 && Math.random() < 0.025 * lv) { const hr = hubRect(size); particles.push({ x: hr.x + (x - px) / z, y: hr.y + (y - py) / z, vx: 0.18 + Math.random() * 0.1, vy: -0.55 - Math.random() * 0.2, age: 0, life: 1.8 + Math.random(), color: 'smoke', r: 0.14 + lv * 0.02, tint: '#30343a' }); }
    }
  }

  // いま欲しがっているもの
  const u = Math.min(s / 2, R * 2.1);
  ctx.textAlign = 'center';
  const ink = punk ? P.hi : '#f3f1e8';
  ctx.fillStyle = ink;
  const goal = currentGoal(w);
  const gs = goal ? sub(goal.s) : null;
  const plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '満腹' : goal!.also ? `${label(goal!.s)} ほか` : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  ctx.lineWidth = Math.max(2, u * 0.05); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  ctx.font = `600 ${u * Math.min(0.4, 1.15 / Math.max(1, tx.length * (plain ? 1 : 0.62)))}px ${plain ? FONT_HAND : FONT_MONO}`;
  ctx.strokeText(tx, cxh, cyh - u * 0.06); ctx.fillText(tx, cxh, cyh - u * 0.06);
  if (goal) {
    ctx.font = `600 ${u * 0.2}px ${FONT_MONO}`;
    const ct = goal.rate ? `毎分 ${Math.round(goalRate(w))} / ${goal.rate}` : `${goalCount(w)} / ${requiredOf(w, goal)}`;
    ctx.strokeText(ct, cxh, cyh + u * 0.3); ctx.fillText(ct, cxh, cyh + u * 0.3);
  }
}

/** 角を落とした四角 */
/** 電池の電力で加速しているしるし：中央に稲妻 */
function powerMark(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, t: number) {
  const r = u * 0.13, k = 0.75 + 0.25 * Math.sin(t * 14);
  ctx.save();
  ctx.translate(cx, cy - u * 0.36);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0d10'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.25, -r); ctx.lineTo(-r * 0.55, r * 0.15); ctx.lineTo(-r * 0.05, r * 0.15); ctx.lineTo(-r * 0.25, r); ctx.lineTo(r * 0.55, -r * 0.2); ctx.lineTo(r * 0.05, -r * 0.2);
  ctx.closePath();
  ctx.globalAlpha = k;
  ctx.fillStyle = P.hi; ctx.fill();
  ctx.restore();
}

/** 電解槽：左半分が陰極（−）、右半分が陽極（＋） */
function poleMarks(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, pu: number, line: number) {
  const f = e.dir as number, l = (f + 3) % 4, r = (f + 1) % 4;
  for (const [side, text, color] of [[l, '−', '#3f7fc0'], [r, '＋', P.red]] as [number, string, string][]) {
    const x = cx + DX[side] * pu * 0.68 - DX[f] * 0, y = cy + DY[side] * pu * 0.68 - DY[f] * 0;
    ctx.beginPath(); ctx.arc(x, y, pu * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#0b0d10'; ctx.lineWidth = line * 0.8; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${pu * 0.22}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + pu * 0.01);
  }
}

function chamfer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number) {
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c);
  ctx.closePath();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
