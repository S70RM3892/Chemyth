import { ZONES, hubRect, zoneAt, zoneSpots, type Zone } from '../content/map';
import { MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { beltSpeed, currentGoal, DX, DY, goalCount, inflow, isMachine, portDir, requiredOf, type Dir, type Ent, type World } from '../engine/world';
import { mix, onThemeChange, palette, type Palette } from './theme';
import { sprite } from './token';

export interface Camera { x: number; y: number; z: number }
export interface View { tool: string; selected: Ent | null }

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
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  scratch ??= Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const t = scratch.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, OX = ox * TS, OY = oy * TS;
  const X = (tx: number) => (tx - ox) * TS, Y = (ty: number) => (ty - oy) * TS;
  const punk = P.skin === 'punk', light = P.name === 'light';
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
    if (zn === 'sea') {
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

function chunk(P: Palette, cx: number, cy: number): HTMLCanvasElement {
  const k = `${P.key}:${cx},${cy}`;
  let c = chunks.get(k);
  if (c) { chunks.delete(k); chunks.set(k, c); return c; } // 最近使ったものを後ろへ
  c = buildChunk(P, cx, cy);
  chunks.set(k, c);
  if (chunks.size > 220) chunks.delete(chunks.keys().next().value as string);
  return c;
}

// 工業スキンの空気：光の側は日差しと塵、闇の側は火の粉
interface Mote { x: number; y: number; v: number; s: number; ph: number }
const motes: Mote[] = Array.from({ length: 46 }, (_, i) => ({ x: hash(i, 3), y: hash(i, 5), v: 0.02 + hash(i, 7) * 0.05, s: 0.6 + hash(i, 9) * 1.8, ph: hash(i, 11) * 6.28 }));

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; text?: string; r: number }
const particles: Particle[] = [];
const born = new WeakMap<Ent, number>();

function spawn(w: World, P: Palette) {
  for (const f of w.fx.splice(0)) {
    if (f.type === 'deliver') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.2, vx: 0, vy: -0.9, age: 0, life: 0.9, color: P.red, text: '+1', r: 0 });
    } else if (f.type === 'spill') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.5, vx: (Math.random() - 0.5) * 0.8, vy: 0.5, age: 0, life: 0.5, color: P.red, r: 0.06 });
    } else {
      for (let i = 0; i < 4; i++) {
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
  for (let cy = Math.floor(wy0 / CH); cy <= Math.floor(wy1 / CH); cy++) for (let cx = Math.floor(wx0 / CH); cx <= Math.floor(wx1 / CH); cx++) {
    ctx.drawImage(chunk(P, cx, cy), Math.floor(sx(cx * CH)), Math.floor(sy(cy * CH)), Math.ceil(CH * z) + 1, Math.ceil(CH * z) + 1);
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
    const fs = Math.max(12, z * (punk ? 0.36 : 0.42));
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
  const trace = (b: (typeof belts)[number]) => {
    const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + b.c.ax * z, cy + b.c.ay * z);
    ctx.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z);
  };
  // 固体は幅広のコンベヤ、液体は管、気体は細い管
  const WIDTH = { solid: 0.6, liquid: 0.46, gas: 0.34, none: 0.52 };
  const DASH = { solid: [0.04, 0.21], liquid: [0.18, 0.32], gas: [0.03, 0.22], none: [0.1, 0.4] };
  const st = (b: (typeof belts)[number]) => b.e.st ?? 'none';
  const edge = lw(0.045) * 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = P.ink;
  for (const b of belts) { ctx.lineWidth = z * WIDTH[st(b)] + edge; trace(b); ctx.stroke(); }
  for (const b of belts) { ctx.strokeStyle = P.line[st(b)]; ctx.lineWidth = z * WIDTH[st(b)]; trace(b); ctx.stroke(); }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = punk && !light ? P.hi : P.ink;
  ctx.globalAlpha = punk ? (light ? 0.7 : 0.9) : light ? 0.5 : 0.45;
  ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
  for (const b of belts) {
    const s = st(b);
    ctx.lineWidth = s === 'solid' ? z * WIDTH.solid * 0.72 : lw(0.05);
    ctx.setLineDash([z * DASH[s][0], z * DASH[s][1]]);
    trace(b); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

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
    token(ctx, P, sx(b.e.x + 0.5 + ox), sy(b.e.y + 0.5 + oy), z, b.e.item.s);
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
    if (e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'hub' || !inView(e)) continue;
    if (!born.has(e)) born.set(e, t);
    const age = t - born.get(e)!;
    const pop = age < 0.24 ? 0.7 + 0.3 * (1 - Math.pow(1 - age / 0.24, 3)) + 0.1 * Math.sin((age / 0.24) * Math.PI) : 1;
    machine(ctx, P, sx(e.x + 0.5), sy(e.y + 0.5), z * pop, z, e, t);
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
    for (const e of w.ents.values()) if (e.busy && inView(e)) pool(e.x + 0.5, e.y + 0.5, 1.5, 0.22 + 0.06 * Math.sin(t * 9 + e.x));
    ctx.globalCompositeOperation = 'source-over';
  }
  const hr = hubRect(w.hubSize);
  hub(ctx, P, sx(hr.x), sy(hr.y), z, hr.s, w, t);

  // ---- 選んだものは蛍光ペンで囲む ----
  if (view.selected && view.selected.kind !== 'hub') {
    const e = view.selected;
    if (punk) {
      // 照準の角
      const cx0 = sx(e.x + 0.5), cy0 = sy(e.y + 0.5), r = z * (0.6 + 0.03 * Math.sin(t * 6)), L = z * 0.2;
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
    ctx.arc(sx(e.x + 0.5), sy(e.y + 0.5), z * 0.62, -0.4 + Math.sin(t * 2) * 0.1, Math.PI * 2 - 0.9);
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
    if (p.text) {
      ctx.fillStyle = p.color;
      ctx.font = `600 ${z * 0.4}px ${FONT_HAND}`;
      ctx.fillText(p.text, sx(p.x), sy(p.y));
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = lw(0.03);
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), z * p.r * (1.8 - k * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (punk) ambient(ctx, P, cw, ch, t, dt);
}

/** 工業スキンの空気。光の炉は斜めに差す日差しと舞う塵、闇の炉は立ちのぼる火の粉と周辺の闇 */
function ambient(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number, dt: number) {
  const light = P.name === 'light';
  if (light) {
    // 天窓からの光の帯が、ゆっくり床を渡っていく
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(-0.42);
    const span = Math.hypot(cw, ch);
    for (let i = 0; i < 4; i++) {
      const x = mod(t * 14 + i * span * 0.31, span * 1.25) - span * 0.62, wd = span * (0.05 + 0.03 * (i % 2));
      const g = ctx.createLinearGradient(x - wd, 0, x + wd, 0);
      g.addColorStop(0, `rgba(${P.glow},0)`); g.addColorStop(0.5, `rgba(${P.glow},0.55)`); g.addColorStop(1, `rgba(${P.glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - wd, -span, wd * 2, span * 2);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 0.4, 1);
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
      ctx.fillRect(mod(m.x + Math.sin(t * 0.3 + m.ph) * 0.01, 1) * cw, m.y * ch, m.s, m.s);
    }
    ctx.globalAlpha = 1;
  } else {
    // 周辺は闇に沈む
    const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 1.6, 1);
      const fl = 0.5 + 0.5 * Math.sin(t * 7 + m.ph * 3);
      ctx.fillStyle = `rgba(${P.glow},${0.25 + 0.55 * fl * m.y})`;
      ctx.beginPath();
      ctx.arc(mod(m.x + Math.sin(t * 0.9 + m.ph) * 0.02, 1) * cw, m.y * ch, m.s * (0.6 + 0.6 * m.y), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function token(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, z: number, s: string) {
  const d = z * 0.78;
  ctx.drawImage(sprite(s), x - d / 2, y - d / 2 - d * 0.035, d, d);
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
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const unset = isMachine(e.kind) && !e.recipe;
  const line = Math.max(1.5, u * 0.045);
  const disc = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const inked = (fill: string) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke(); };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const punk = P.skin === 'punk';
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
  ctx.fillStyle = P.shadow;
  rr(ctx, cx - u * 0.42 + u * 0.05, cy - u * 0.42 + u * 0.06, u * 0.84, u * 0.84, u * 0.12);
  ctx.fill();
  rr(ctx, cx - u * 0.42, cy - u * 0.42, u * 0.84, u * 0.84, u * 0.12);
  inked(P.plate);
  }

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

  // 名札
  if (z >= 34 && !unset) {
    rr(ctx, cx - u * 0.46, cy - u * 0.46, u * 0.27, u * 0.27, u * 0.05); inked(info.color);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${u * 0.17}px ${FONT_SMALL}`;
    ctx.textAlign = 'center';
    ctx.fillText(info.glyph, cx - u * 0.325, cy - u * 0.315);
  }

  // 出口の矢じり
  const port = (d: number, color: string, text?: string) => {
    ctx.save();
    ctx.translate(cx + DX[d] * u * 0.42, cy + DY[d] * u * 0.42);
    ctx.rotate((d * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(u * 0.15, 0); ctx.lineTo(-u * 0.03, -u * 0.12); ctx.lineTo(-u * 0.03, u * 0.12);
    ctx.closePath();
    inked(color);
    ctx.restore();
    if (text && z >= 48) {
      ctx.font = `600 ${u * 0.13}px ${FONT_MONO}`;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'center';
      ctx.fillText(text, cx + DX[d] * u * 0.2 + (DY[d] ? u * 0.26 : 0), cy + DY[d] * u * 0.25 + (DX[d] ? u * 0.3 : 0));
    }
  };
  if (e.kind === 'extractor' || e.kind === 'depot' || e.kind === 'sampler') port(e.dir, P.plate);
  else if (e.kind === 'analyzer') { port(portDir(e.dir, 0), '#7fc06a', '陽'); port(portDir(e.dir, 1), P.red, '陰'); }
  else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), P.plate);
  else if (e.outOrder) e.outOrder.forEach((s, i) => port(portDir(e.dir, i), sub(s).color, label(s)));
  else if (unset) port(e.dir, P.plate);

  // 赤ペンの印：設定が要る「？」、詰まっている「！」
  const jam = (e.stuck || 0) > 2.5;
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

function hub(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World, t: number) {
  const s = z * size, m = z * 0.1, line = Math.max(1.5, z * 0.05), u = s / 2; // u：2 マスのときの 1 マスぶん
  const punk = P.skin === 'punk', light = P.name === 'light';
  ctx.lineJoin = 'round';
  ctx.fillStyle = P.shadow;
  if (punk) chamfer(ctx, px + m + z * 0.08, py + m + z * 0.11, s - 2 * m, s - 2 * m, z * 0.3); else rr(ctx, px + m + z * 0.07, py + m + z * 0.09, s - 2 * m, s - 2 * m, z * 0.12);
  ctx.fill();
  let ink = P.ink;
  if (punk) {
    // 危険表示の縞で縁どった搬入口
    chamfer(ctx, px + m, py + m, s - 2 * m, s - 2 * m, z * 0.3);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = P.hi;
    ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = '#14181d';
    ctx.lineWidth = z * 0.16;
    ctx.beginPath();
    for (let d = -s + mod(t * z * 0.25, z * 0.46); d < s * 2; d += z * 0.46) { ctx.moveTo(px + d, py); ctx.lineTo(px + d - s, py + s); }
    ctx.stroke();
    ctx.restore();
    chamfer(ctx, px + m, py + m, s - 2 * m, s - 2 * m, z * 0.3);
    ctx.strokeStyle = light ? P.ink : '#000';
    ctx.lineWidth = line;
    ctx.stroke();
    chamfer(ctx, px + m + z * 0.22, py + m + z * 0.22, s - 2 * m - z * 0.44, s - 2 * m - z * 0.44, z * 0.2);
    ctx.fillStyle = light ? P.plate : '#0b0c0f';
    ctx.fill();
    ctx.stroke();
    ink = light ? P.ink : P.hi;
  } else {
    rr(ctx, px + m, py + m, s - 2 * m, s - 2 * m, z * 0.12);
    ctx.fillStyle = light ? P.hi : P.plate;
    ctx.fill();
    ctx.strokeStyle = light ? P.ink : P.hi;
    ctx.lineWidth = line;
    ctx.stroke();
    rr(ctx, px + m + z * 0.1, py + m + z * 0.1, s - 2 * m - z * 0.2, s - 2 * m - z * 0.2, z * 0.06);
    ctx.lineWidth = line * 0.5;
    ctx.stroke();
    ink = light ? P.ink : P.hi;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = `700 ${u * 0.2}px ${FONT_SMALL}`;
  ctx.fillText('納品所', px + s / 2, py + s / 2 - u * 0.5);
  const goal = currentGoal(w);
  const gs = goal ? sub(goal.s) : null;
  const plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '完了' : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  ctx.font = `600 ${u * Math.min(0.44, 1.2 / Math.max(1, tx.length * (plain ? 1 : 0.62)))}px ${plain ? FONT_HAND : FONT_MONO}`;
  ctx.fillText(tx, px + s / 2, py + s / 2 - u * 0.02);
  if (goal) {
    ctx.font = `500 ${u * 0.22}px ${FONT_MONO}`;
    ctx.fillText(`${goalCount(w)} / ${requiredOf(w, goal)}`, px + s / 2, py + s / 2 + u * 0.46);
  }
}

/** 角を落とした四角 */
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
