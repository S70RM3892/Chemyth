import { HUB_TILES, MAP_H, MAP_W, ZONES, zoneAt, type Zone } from '../content/map';
import { GOALS } from '../content/goals';
import { MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { beltSpeed, DX, DY, inflow, isMachine, portDir, type Dir, type Ent, type World } from '../engine/world';
import { sprite } from './token';

export interface Camera { x: number; y: number; z: number }
export interface View { tool: string; selected: Ent | null }

// 夜の入り江。苔色の大地に水と霧がにじみ、装置の灯りと物質の色が浮かぶ
const C = {
  void: '#0a100d', land: '#1a2620', moss: ['#20322a', '#263223', '#1c2c25', '#2a3222'],
  sand: '#4a4632', shallow: '#1f5b63', deep: '#0d3442', wave: '170,225,230',
  mist: '#3d4160', mistHi: '#565b82', wind: '205,210,255',
  ochre: '#5b5320', crust: '#c2ad3c', fume: '235,215,90',
  bank: '#0c1310', track: '#26342d', flow: 'rgba(190,215,200,0.5)',
  body: '#111a16', ink: '#f3efe4', dim: '#98a69c', lamp: '#f4c063', lampInk: '#2a1c05', steel: '#c3ccc5',
};
const FONT_UI = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// ---- 地形は一度だけ描いて使い回す。マス目ではなく、にじんだ塊を重ねて形を作る ----
const TS = 20;
let terrain: HTMLCanvasElement | null = null;
function buildTerrain(): HTMLCanvasElement {
  const pad = 3;
  const cv = document.createElement('canvas');
  cv.width = (MAP_W + pad * 2) * TS;
  cv.height = (MAP_H + pad * 2) * TS;
  const g = cv.getContext('2d')!;
  g.fillStyle = C.void;
  g.fillRect(0, 0, cv.width, cv.height);
  const soft = (tx: number, ty: number, r: number, color: string, a = 1) => {
    const x = (tx + pad) * TS, y = (ty + pad) * TS, rad = g.createRadialGradient(x, y, 0, x, y, r * TS);
    g.globalAlpha = a;
    rad.addColorStop(0, color);
    rad.addColorStop(0.3, color);
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(x - r * TS, y - r * TS, 2 * r * TS, 2 * r * TS);
    g.globalAlpha = 1;
  };
  // 陸
  for (let y = -1; y <= MAP_H; y++) for (let x = -1; x <= MAP_W; x++) soft(x + 0.5, y + 0.5, 2.2, C.land, 0.7);
  for (let i = 0; i < 520; i++) soft(hash(i, 1) * MAP_W, hash(i, 2) * MAP_H, 2 + hash(i, 3) * 3.5, C.moss[i % 4], 0.35);
  // 資源地：外側の帯から順に重ねる。海は地図の左端の外まで続いている
  const zoneOf = (x: number, y: number) => (x < 0 ? 'sea' as Zone : zoneAt(x, Math.min(MAP_H - 1, Math.max(0, y))));
  for (let b = 0; b < 3; b++) {
    for (let y = -2; y < MAP_H + 2; y++) for (let x = -3; x < MAP_W; x++) {
      const zn = zoneOf(x, y);
      if (!zn) continue;
      const inner = zoneOf(x - 1, y) === zn && zoneOf(x + 1, y) === zn && zoneOf(x, y - 1) === zn && zoneOf(x, y + 1) === zn;
      const jx = x + 0.5 + (hash(x, y) - 0.5) * 0.4, jy = y + 0.5 + (hash(y, x) - 0.5) * 0.4;
      const [outer, core] = ZONES[zn].tint;
      if (zn === 'sea') {
        if (b === 0) soft(jx, jy, 2.1, C.sand, 0.8);
        else if (b === 1) soft(jx, jy, 1.8, outer, 0.8);
        else if (inner) soft(jx, jy, 2.0, core, 0.8);
      } else if (b === 0) soft(jx, jy, 2.0, outer, 0.8);
      else if (b === 1 && inner) soft(jx, jy, 1.5, core, 0.4);
    }
  }
  // 草と小石
  for (let i = 0; i < 3200; i++) {
    const x = hash(i, 7) * MAP_W, y = hash(i, 8) * MAP_H;
    if (zoneAt(Math.floor(x), Math.floor(y))) continue;
    g.fillStyle = i % 3 ? 'rgba(120,160,120,0.16)' : 'rgba(200,200,170,0.10)';
    g.beginPath();
    g.ellipse((x + pad) * TS, (y + pad) * TS, 1 + hash(i, 9) * 1.6, 0.8 + hash(i, 10), hash(i, 11) * 3, 0, Math.PI * 2);
    g.fill();
  }
  (cv as unknown as { pad: number }).pad = pad;
  return cv;
}

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; text?: string; r: number }
const particles: Particle[] = [];
const born = new WeakMap<Ent, number>();

function spawn(w: World) {
  for (const f of w.fx.splice(0)) {
    const color = sub(f.s).color;
    if (f.type === 'deliver') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.2, vx: 0, vy: -0.9, age: 0, life: 0.9, color, text: '+1', r: 0 });
    } else if (f.type === 'spill') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.5, vx: (Math.random() - 0.5) * 0.8, vy: 0.5, age: 0, life: 0.5, color: 'rgba(236,123,108,0.9)', r: 0.06 });
    } else {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: f.x + 0.5, y: f.y + 0.3, vx: Math.cos(a) * 0.35, vy: -0.5 - Math.random() * 0.5, age: 0, life: 0.7 + Math.random() * 0.4, color, r: 0.07 + Math.random() * 0.06 });
      }
    }
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400);
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
  const z = cam.z;
  const sx = (x: number) => (x - cam.x) * z + cw / 2;
  const sy = (y: number) => (y - cam.y) * z + ch / 2;
  spawn(w);
  terrain ??= buildTerrain();
  const pad = (terrain as unknown as { pad: number }).pad;

  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrain, sx(-pad), sy(-pad), (MAP_W + pad * 2) * z, (MAP_H + pad * 2) * z);

  const x0 = Math.max(0, Math.floor(cam.x - cw / 2 / z)), x1 = Math.min(MAP_W - 1, Math.ceil(cam.x + cw / 2 / z));
  const y0 = Math.max(0, Math.floor(cam.y - ch / 2 / z)), y1 = Math.min(MAP_H - 1, Math.ceil(cam.y + ch / 2 / z));
  const inView = (e: Ent) => e.x >= x0 - 2 && e.x <= x1 + 2 && e.y >= y0 - 2 && e.y <= y1 + 2;

  // ---- 水・風・噴気の動き ----
  ctx.lineCap = 'round';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const zn = zoneAt(x, y);
    if (!zn) continue;
    const h = hash(x, y), px = sx(x), py = sy(y);
    if (zn === 'sea') {
      ctx.strokeStyle = `rgba(${C.wave},${0.06 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.1 + h * 6.28 + x * 0.6))})`;
      ctx.lineWidth = Math.max(1, z * 0.04);
      const wy = py + z * (0.25 + 0.5 * h), wx = px + z * (0.15 + 0.12 * Math.sin(t * 0.7 + h * 9));
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + z * 0.22, wy - z * 0.12, wx + z * 0.45, wy);
      ctx.stroke();
    } else if (z >= 16) {
      // 鉱床はときどき光る
      const ph = (t * 0.22 + h * 7) % 1;
      ctx.fillStyle = ZONES[zn].tint[1];
      ctx.globalAlpha = 0.55 * Math.sin(ph * Math.PI) ** 4;
      ctx.beginPath();
      ctx.arc(px + z * (0.15 + 0.7 * h), py + z * (0.15 + 0.7 * hash(y, x)), Math.max(1.2, z * 0.06), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---- 置ける場所の手がかり（道具を持っているときだけ） ----
  const building = view.tool !== 'pan';
  if (building && z >= 26) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const strong = view.tool === 'extractor' && !!zoneAt(x, y);
      ctx.fillStyle = strong ? `rgba(244,192,99,${0.5 + 0.25 * Math.sin(t * 3 + x + y)})` : 'rgba(230,240,230,0.10)';
      ctx.beginPath();
      ctx.arc(sx(x + 0.5), sy(y + 0.5), strong ? z * 0.09 : Math.max(1, z * 0.03), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 灯りだまり ----
  ctx.globalCompositeOperation = 'lighter';
  const glow = (gx: number, gy: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(sx(gx), sy(gy), 0, sx(gx), sy(gy), r * z);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(sx(gx) - r * z, sy(gy) - r * z, 2 * r * z, 2 * r * z);
  };
  const [hx, hy] = HUB_TILES[0];
  glow(hx + 1, hy + 1, 4.4, '255,196,110', 0.17 + 0.03 * Math.sin(t * 2));
  for (const e of w.ents.values()) {
    if (!inView(e) || e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'hub') continue;
    if (e.busy) glow(e.x + 0.5, e.y + 0.5, 1.6, '255,214,160', 0.15);
    else if (e.kind === 'vent') glow(e.x + 0.5, e.y + 0.5, 1.1, '255,140,70', 0.1 + 0.04 * Math.sin(t * 9 + e.x));
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- 資源地の名札 ----
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 6;
  ctx.textAlign = 'center';
  for (const zn of Object.values(ZONES)) {
    const [lx, ly] = zn.at;
    if (sx(lx) < -200 || sx(lx) > cw + 200 || sy(ly) < -100 || sy(ly) > ch + 100) continue;
    ctx.font = `700 ${Math.max(11, z * 0.36)}px ${FONT_UI}`;
    ctx.fillStyle = 'rgba(243,239,228,0.9)';
    ctx.fillText(zn.name, sx(lx), sy(ly));
    if (z >= 18) {
      ctx.font = `500 ${Math.max(10, z * 0.24)}px ${FONT_UI}`;
      ctx.fillStyle = 'rgba(243,239,228,0.62)';
      ctx.fillText(`${sub(zn.resource).name}・${zn.form}`, sx(lx), sy(ly) + Math.max(13, z * 0.32));
    }
  }
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ---- いまの指令で使う資源地が画面の外にあれば、縁に道しるべを出す ----
  const gz = GOALS[w.goal]?.zone;
  if (gz) {
    const zn = ZONES[gz], tx = sx(zn.at[0]), ty = sy(zn.at[1]);
    if (tx < 0 || tx > cw || ty < 150 || ty > ch - 170) {
      const px = Math.min(cw - 80, Math.max(80, tx)), py = Math.min(ch - 190, Math.max(170, ty));
      const ang = Math.atan2(ty - py, tx - px);
      ctx.font = `700 13px ${FONT_UI}`;
      const wd = ctx.measureText(zn.name).width + 26;
      ctx.fillStyle = 'rgba(20,29,24,0.9)';
      rr(ctx, px - wd / 2, py - 15, wd, 30, 15);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.fillText(zn.name, px, py + 1);
      ctx.fillStyle = C.lamp;
      ctx.save();
      ctx.translate(px + Math.cos(ang) * (wd / 2 + 10), py + Math.sin(ang) * 26);
      ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---- ベルト：ひと続きの管として描く ----
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
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.bank; ctx.lineWidth = z * 0.74;
  for (const b of belts) { trace(b); ctx.stroke(); }
  ctx.strokeStyle = C.track; ctx.lineWidth = z * 0.6;
  for (const b of belts) { trace(b); ctx.stroke(); }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = C.flow; ctx.lineWidth = Math.max(1.5, z * 0.07);
  ctx.setLineDash([z * 0.1, z * 0.4]);
  ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
  for (const b of belts) { trace(b); ctx.stroke(); }
  ctx.setLineDash([]);
  // 立体交差は縦横 2 本の管
  for (const e of w.ents.values()) {
    if (e.kind !== 'bridge' || !inView(e)) continue;
    const cx = sx(e.x + 0.5), cy = sy(e.y + 0.5);
    for (const [wd, col] of [[0.74, C.bank], [0.6, C.track]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = z * wd; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(cx, cy - z / 2); ctx.lineTo(cx, cy + z / 2); ctx.stroke();
    }
    ctx.strokeStyle = '#0c1310'; ctx.lineWidth = z * 0.86;
    ctx.beginPath(); ctx.moveTo(cx - z / 2, cy); ctx.lineTo(cx + z / 2, cy); ctx.stroke();
    ctx.strokeStyle = '#33443b'; ctx.lineWidth = z * 0.62;
    ctx.beginPath(); ctx.moveTo(cx - z / 2, cy); ctx.lineTo(cx + z / 2, cy); ctx.stroke();
  }
  for (const b of belts) {
    if (!b.e.item) continue;
    const [ox, oy] = onCurve(b.c, b.e.item.p);
    token(ctx, sx(b.e.x + 0.5 + ox), sy(b.e.y + 0.5 + oy), z, b.e.item.s);
  }
  for (const e of w.ents.values()) {
    if (e.kind !== 'bridge' || !e.items || !inView(e)) continue;
    e.items.forEach((it, a) => {
      if (!it) return;
      const d = it.d ?? a;
      token(ctx, sx(e.x + 0.5 + DX[d] * (it.p - 0.5)), sy(e.y + 0.5 + DY[d] * (it.p - 0.5)), z, it.s);
    });
  }

  // ---- 装置 ----
  for (const e of w.ents.values()) {
    if (e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'hub' || !inView(e)) continue;
    if (!born.has(e)) born.set(e, t);
    const age = t - born.get(e)!;
    const pop = age < 0.28 ? 0.6 + 0.4 * (1 - Math.pow(1 - age / 0.28, 3)) + 0.12 * Math.sin((age / 0.28) * Math.PI) : 1;
    machine(ctx, sx(e.x + 0.5), sy(e.y + 0.5), z * pop, z, e, t);
  }

  hub(ctx, sx(hx), sy(hy), z, w, t);

  // ---- 選択の輪 ----
  if (view.selected && view.selected.kind !== 'hub') {
    const e = view.selected;
    ctx.strokeStyle = `rgba(244,192,99,${0.7 + 0.3 * Math.sin(t * 5)})`;
    ctx.lineWidth = Math.max(2, z * 0.06);
    ctx.beginPath();
    ctx.arc(sx(e.x + 0.5), sy(e.y + 0.5), z * (0.6 + 0.02 * Math.sin(t * 5)), 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- 粒子 ----
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    if (p.text) {
      ctx.font = `700 ${z * 0.36}px ${FONT_MONO}`;
      ctx.fillText(p.text, sx(p.x), sy(p.y));
    } else {
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), z * p.r * (1.6 - k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ---- 周辺減光 ----
  const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  v.addColorStop(0, 'rgba(6,10,8,0)');
  v.addColorStop(1, 'rgba(6,10,8,0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cw, ch);
}

function token(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, s: string) {
  const d = z * 0.78;
  ctx.drawImage(sprite(s), x - d / 2, y - d / 2 - d * 0.035, d, d);
  if (z >= 52) {
    const tx = label(s);
    ctx.font = `600 ${z * 0.13}px ${sub(s).formula ? FONT_MONO : FONT_UI}`;
    const wd = ctx.measureText(tx).width + z * 0.1;
    ctx.fillStyle = 'rgba(10,16,13,0.82)';
    rr(ctx, x - wd / 2, y + z * 0.26, wd, z * 0.18, z * 0.09);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.fillText(tx, x, y + z * 0.355);
  }
}

function machine(ctx: CanvasRenderingContext2D, cx: number, cy: number, u: number, z: number, e: Ent, t: number) {
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const unset = isMachine(e.kind) && !e.recipe;
  const disc = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  // 土台は角のない円盤
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(cx, cy + u * 0.08, u * 0.46, u * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.body;
  disc(cx, cy, u * 0.45); ctx.fill();
  ctx.strokeStyle = info.color;
  ctx.lineWidth = Math.max(1.5, u * 0.05);
  ctx.stroke();

  const busy = !!e.busy;
  switch (e.kind) {
    case 'extractor': {
      ctx.fillStyle = info.color;
      disc(cx, cy, u * 0.3); ctx.fill();
      ctx.fillStyle = C.body;
      disc(cx, cy, u * 0.23); ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 3 + e.x);
      ctx.fillStyle = C.steel;
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.ellipse(u * 0.11, 0, u * 0.11, u * 0.045, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'separator': {
      ctx.fillStyle = info.color;
      rr(ctx, cx - u * 0.14, cy - u * 0.34, u * 0.28, u * 0.68, u * 0.14);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const lit = busy && Math.floor(((e.prog || 0) * 8) % 4) === i;
        ctx.fillStyle = lit ? C.lamp : 'rgba(10,16,12,0.55)';
        rr(ctx, cx - u * 0.1, cy + u * (0.19 - i * 0.13), u * 0.2, u * 0.04, u * 0.02);
        ctx.fill();
      }
      break;
    }
    case 'electrolyzer': {
      ctx.fillStyle = 'rgba(80,205,190,0.28)';
      rr(ctx, cx - u * 0.29, cy - u * 0.08, u * 0.58, u * 0.36, u * 0.14);
      ctx.fill();
      ctx.lineCap = 'round';
      ctx.lineWidth = u * 0.07;
      ctx.strokeStyle = C.steel;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.14, cy - u * 0.24); ctx.lineTo(cx - u * 0.14, cy + u * 0.18); ctx.stroke();
      ctx.strokeStyle = '#6a766f';
      ctx.beginPath(); ctx.moveTo(cx + u * 0.14, cy - u * 0.24); ctx.lineTo(cx + u * 0.14, cy + u * 0.18); ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.font = `700 ${u * 0.15}px ${FONT_MONO}`;
      ctx.fillText('−', cx - u * 0.14, cy - u * 0.33);
      ctx.fillText('+', cx + u * 0.14, cy - u * 0.33);
      if (busy) {
        ctx.fillStyle = 'rgba(235,252,250,0.85)';
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.4 + i * 0.37) % 1;
          disc(cx + (i % 2 ? 0.2 : -0.08) * u + Math.sin(i * 9 + t * 4) * u * 0.02, cy + u * (0.22 - ph * 0.28), u * 0.022);
          ctx.fill();
        }
      }
      break;
    }
    case 'reactor': {
      ctx.fillStyle = info.color;
      disc(cx, cy, u * 0.33); ctx.fill();
      const k = busy ? 0.75 + 0.25 * Math.sin(t * 8) : 0.18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.21);
      g.addColorStop(0, `rgba(255,236,170,${k})`);
      g.addColorStop(1, `rgba(255,150,60,${k * 0.35})`);
      ctx.fillStyle = C.body;
      disc(cx, cy, u * 0.21); ctx.fill();
      ctx.fillStyle = g;
      disc(cx, cy, u * 0.21); ctx.fill();
      break;
    }
    case 'battery': {
      ctx.fillStyle = info.color;
      rr(ctx, cx - u * 0.27, cy - u * 0.2, u * 0.54, u * 0.48, u * 0.1);
      ctx.fill();
      ctx.fillStyle = C.steel;
      rr(ctx, cx - u * 0.2, cy - u * 0.31, u * 0.12, u * 0.12, u * 0.03); ctx.fill();
      rr(ctx, cx + u * 0.08, cy - u * 0.31, u * 0.12, u * 0.12, u * 0.03); ctx.fill();
      ctx.fillStyle = C.lampInk;
      ctx.font = `700 ${u * 0.2}px ${FONT_MONO}`;
      ctx.fillText('−', cx - u * 0.14, cy + u * 0.05);
      ctx.fillText('+', cx + u * 0.14, cy + u * 0.05);
      if (busy) {
        ctx.fillStyle = `rgba(255,242,122,${0.5 + 0.5 * Math.sin(t * 14)})`;
        disc(cx, cy - u * 0.25, u * 0.05); ctx.fill();
      }
      break;
    }
    case 'splitter': {
      ctx.fillStyle = info.color;
      disc(cx, cy, u * 0.3); ctx.fill();
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.3, cy - u * 0.3, u * 0.6, u * 0.6);
      break;
    }
    case 'depot': {
      ctx.fillStyle = info.color;
      rr(ctx, cx - u * 0.27, cy - u * 0.27, u * 0.54, u * 0.54, u * 0.16);
      ctx.fill();
      if (e.sub) ctx.drawImage(sprite(e.sub), cx - u * 0.25, cy - u * 0.25, u * 0.5, u * 0.5);
      else { ctx.fillStyle = C.lampInk; ctx.font = `700 ${u * 0.3}px ${FONT_UI}`; ctx.fillText('?', cx, cy + u * 0.02); }
      break;
    }
    case 'vent': {
      ctx.fillStyle = info.color;
      disc(cx, cy + u * 0.06, u * 0.22); ctx.fill();
      ctx.fillStyle = C.body;
      disc(cx, cy + u * 0.06, u * 0.13); ctx.fill();
      const f = 0.2 + 0.06 * Math.sin(t * 11 + e.x * 3) + 0.03 * Math.sin(t * 23);
      ctx.fillStyle = '#ff8a3c';
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.09, cy + u * 0.06);
      ctx.quadraticCurveTo(cx, cy - u * f * 1.6, cx + u * 0.09, cy + u * 0.06);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.045, cy + u * 0.06);
      ctx.quadraticCurveTo(cx, cy - u * f * 0.8, cx + u * 0.045, cy + u * 0.06);
      ctx.fill();
      break;
    }
  }

  if (z >= 34 && !unset) {
    ctx.fillStyle = info.color;
    disc(cx - u * 0.31, cy - u * 0.31, u * 0.13); ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `700 ${u * 0.16}px ${FONT_UI}`;
    ctx.fillText(info.glyph, cx - u * 0.31, cy - u * 0.3);
  }

  // 出口は外へ向く小さな芽
  const port = (d: number, color: string, text?: string) => {
    ctx.save();
    ctx.translate(cx + DX[d] * u * 0.45, cy + DY[d] * u * 0.45);
    ctx.rotate((d * Math.PI) / 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = C.body;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(u * 0.13, 0);
    ctx.quadraticCurveTo(0, -u * 0.16, -u * 0.07, -u * 0.1);
    ctx.quadraticCurveTo(-u * 0.02, 0, -u * 0.07, u * 0.1);
    ctx.quadraticCurveTo(0, u * 0.16, u * 0.13, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (text && z >= 48) {
      ctx.font = `600 ${u * 0.14}px ${FONT_MONO}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(text, cx + DX[d] * u * 0.2 + (DY[d] ? u * 0.25 : 0), cy + DY[d] * u * 0.27 + (DX[d] ? u * 0.27 : 0));
    }
  };
  if (e.kind === 'extractor' || e.kind === 'depot') port(e.dir, C.ink);
  else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), C.steel);
  else if (e.outOrder) e.outOrder.forEach((s, i) => port(portDir(e.dir, i), sub(s).color, label(s)));
  else if (unset) port(e.dir, C.dim);

  if (unset) {
    ctx.strokeStyle = `rgba(244,192,99,${0.55 + 0.45 * Math.sin(t * 5)})`;
    ctx.lineWidth = Math.max(2, u * 0.06);
    ctx.setLineDash([u * 0.14, u * 0.1]);
    disc(cx, cy, u * 0.45); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.lamp;
    disc(cx + u * 0.3, cy - u * 0.3, u * 0.15); ctx.fill();
    ctx.fillStyle = C.lampInk;
    ctx.font = `700 ${u * 0.2}px ${FONT_UI}`;
    ctx.fillText('?', cx + u * 0.3, cy - u * 0.29);
  }
  if (busy) {
    ctx.strokeStyle = C.lamp;
    ctx.lineWidth = Math.max(2, u * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, u * 0.39, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.prog || 0));
    ctx.stroke();
  }
}

function hub(ctx: CanvasRenderingContext2D, px: number, py: number, z: number, w: World, t: number) {
  const s = z * 2, m = z * 0.06;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  rr(ctx, px + m, py + m * 2.5, s - 2 * m, s - 2 * m, z * 0.6);
  ctx.fill();
  const g = ctx.createLinearGradient(px, py, px, py + s);
  g.addColorStop(0, '#f2bd62');
  g.addColorStop(1, '#b97f2a');
  ctx.fillStyle = g;
  rr(ctx, px + m, py + m, s - 2 * m, s - 2 * m, z * 0.6);
  ctx.fill();
  ctx.fillStyle = '#1a140a';
  rr(ctx, px + z * 0.24, py + z * 0.42, s - z * 0.48, s - z * 0.74, z * 0.34);
  ctx.fill();
  ctx.fillStyle = C.lampInk;
  ctx.font = `700 ${z * 0.2}px ${FONT_UI}`;
  ctx.fillText('納品所', px + s / 2, py + z * 0.27);
  const goal = GOALS[w.goal];
  const tx = goal ? label(goal.s) : '完了';
  ctx.fillStyle = `rgba(255,214,130,${0.85 + 0.15 * Math.sin(t * 3)})`;
  ctx.font = `600 ${z * (tx.length > 9 ? 0.15 : tx.length > 6 ? 0.22 : tx.length > 4 ? 0.3 : 0.46)}px ${FONT_MONO}`;
  ctx.fillText(tx, px + s / 2, py + z * 0.9);
  if (goal) {
    ctx.font = `500 ${z * 0.22}px ${FONT_MONO}`;
    ctx.fillStyle = '#c99a45';
    ctx.fillText(`${w.count} / ${goal.n}`, px + s / 2, py + z * 1.36);
  }
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
