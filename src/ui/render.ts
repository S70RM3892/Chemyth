import { GOALS, HUB_TILES, MAP_H, MAP_W, ZONES, zoneAt } from '../content/map';
import { MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { BELT_SPEED, DX, DY, isMachine, portDir, type Ent, type World } from '../engine/world';

export interface Camera { x: number; y: number; z: number }

// 夜の臨海コンビナート。暗い地面に、装置の灯りと物質の色だけが浮かぶ
const C = {
  void: '#070a10', land: ['#161c27', '#181f2b', '#141a24'], speck: 'rgba(160,180,210,0.10)',
  seaDeep: '#0a2536', seaShore: '#12405a', wave: '150,215,240', foam: 'rgba(190,235,250,0.30)',
  plateau: ['#23284a', '#262b50', '#21264a'], wind: '190,200,255', zoneEdge: 'rgba(170,180,255,0.35)',
  track: '#222b38', rail: '#3d4a5c', chevron: 'rgba(150,170,195,0.55)',
  plate: '#10151d', ink: '#eef2f6', dim: '#8d99ab', lamp: '#ffc857', lampInk: '#2a1c05', steel: '#b9c4d2',
};
const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; text?: string; r: number }
const particles: Particle[] = [];

function spawn(w: World) {
  for (const f of w.fx.splice(0)) {
    const color = sub(f.s).color;
    if (f.type === 'deliver') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.2, vx: 0, vy: -0.9, age: 0, life: 0.9, color, text: '+1', r: 0 });
    } else {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: f.x + 0.5, y: f.y + 0.3, vx: Math.cos(a) * 0.35, vy: -0.5 - Math.random() * 0.5, age: 0, life: 0.7 + Math.random() * 0.4, color, r: 0.07 + Math.random() * 0.06 });
      }
    }
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400);
}

export function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, cam: Camera, t: number, dt: number) {
  const z = cam.z;
  const sx = (x: number) => (x - cam.x) * z + cw / 2;
  const sy = (y: number) => (y - cam.y) * z + ch / 2;
  spawn(w);

  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, cw, ch);

  const x0 = Math.max(0, Math.floor(cam.x - cw / 2 / z)), x1 = Math.min(MAP_W - 1, Math.ceil(cam.x + cw / 2 / z));
  const y0 = Math.max(0, Math.floor(cam.y - ch / 2 / z)), y1 = Math.min(MAP_H - 1, Math.ceil(cam.y + ch / 2 / z));
  const inView = (e: Ent) => e.x >= x0 - 2 && e.x <= x1 + 2 && e.y >= y0 - 2 && e.y <= y1 + 2;
  const detail = z >= 30;

  // ---- 地面 ----
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const zone = zoneAt(x, y), hsh = hash(x, y);
      const px = Math.floor(sx(x)), py = Math.floor(sy(y)), s = Math.ceil(z) + 1;
      if (zone === 'sea') {
        ctx.fillStyle = zoneAt(x + 2, y) === 'sea' ? C.seaDeep : C.seaShore;
        ctx.fillRect(px, py, s, s);
        const a = 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.1 + hsh * 6.28 + x * 0.6));
        ctx.strokeStyle = `rgba(${C.wave},${a})`;
        ctx.lineWidth = Math.max(1, z * 0.04);
        ctx.beginPath();
        const wy = py + z * (0.3 + 0.4 * hsh), wx = px + z * (0.15 + 0.1 * Math.sin(t * 0.7 + hsh * 9));
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + z * 0.2, wy - z * 0.1, wx + z * 0.4, wy);
        ctx.stroke();
        if (zoneAt(x + 1, y) !== 'sea') { ctx.fillStyle = C.foam; ctx.fillRect(px + s - Math.max(2, z * 0.07), py, Math.max(2, z * 0.07), s); }
      } else if (zone === 'air') {
        ctx.fillStyle = C.plateau[Math.floor(hsh * 3)];
        ctx.fillRect(px, py, s, s);
        const ph = (t * 0.35 + hsh * 3) % 1;
        ctx.strokeStyle = `rgba(${C.wind},${0.22 * Math.sin(ph * Math.PI)})`;
        ctx.lineWidth = Math.max(1, z * 0.03);
        ctx.beginPath();
        const wy = py + z * (0.2 + 0.6 * hsh);
        ctx.moveTo(px + z * ph, wy);
        ctx.lineTo(px + z * (ph + 0.45), wy);
        ctx.stroke();
        ctx.fillStyle = C.zoneEdge;
        const b = Math.max(1.5, z * 0.04);
        if (zoneAt(x - 1, y) !== 'air') ctx.fillRect(px, py, b, s);
        if (zoneAt(x + 1, y) !== 'air') ctx.fillRect(px + s - b, py, b, s);
        if (zoneAt(x, y - 1) !== 'air') ctx.fillRect(px, py, s, b);
        if (zoneAt(x, y + 1) !== 'air') ctx.fillRect(px, py + s - b, s, b);
      } else {
        ctx.fillStyle = C.land[Math.floor(hsh * 3)];
        ctx.fillRect(px, py, s, s);
        if (detail && hsh > 0.72) {
          ctx.fillStyle = C.speck;
          ctx.fillRect(px + z * hash(y, x) * 0.8, py + z * hash(x + 7, y) * 0.8, Math.max(1.5, z * 0.05), Math.max(1.5, z * 0.05));
        }
      }
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
  glow(hx + 1, hy + 1, 4.2, '255,190,90', 0.16 + 0.03 * Math.sin(t * 2));
  for (const e of w.ents.values()) {
    if (!inView(e) || e.kind === 'belt' || e.kind === 'hub') continue;
    if (e.busy) glow(e.x + 0.5, e.y + 0.5, 1.5, '255,210,150', 0.14);
    else if (e.kind === 'vent') glow(e.x + 0.5, e.y + 0.5, 1.1, '255,140,70', 0.1 + 0.04 * Math.sin(t * 9 + e.x));
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- 資源地の名札 ----
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const zn of Object.values(ZONES)) {
    const [lx, ly] = zn.labelAt;
    ctx.font = `700 ${Math.max(11, z * 0.34)}px ${FONT_UI}`;
    ctx.fillStyle = 'rgba(225,232,245,0.8)';
    ctx.fillText(zn.name, sx(lx), sy(ly));
    ctx.font = `400 ${Math.max(10, z * 0.24)}px ${FONT_UI}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`${sub(zn.resource).name}（${zn.form}）`, sx(lx), sy(ly) + Math.max(13, z * 0.32));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ---- ベルト ----
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || !inView(e)) continue;
    ctx.save();
    ctx.translate(sx(e.x + 0.5), sy(e.y + 0.5));
    ctx.rotate((e.dir * Math.PI) / 2);
    ctx.fillStyle = C.track;
    ctx.fillRect(-z / 2, -z * 0.36, z, z * 0.72);
    ctx.fillStyle = C.rail;
    ctx.fillRect(-z / 2, -z * 0.4, z, z * 0.05);
    ctx.fillRect(-z / 2, z * 0.35, z, z * 0.05);
    ctx.beginPath();
    ctx.rect(-z / 2, -z * 0.35, z, z * 0.7);
    ctx.clip();
    ctx.strokeStyle = C.chevron;
    ctx.lineWidth = Math.max(1.5, z * 0.05);
    for (let k = 0; k < 2; k++) {
      const o = (((t * BELT_SPEED * 0.5 + k / 2) % 1) - 0.5) * z;
      ctx.beginPath();
      ctx.moveTo(o - z * 0.1, -z * 0.16);
      ctx.lineTo(o + z * 0.06, 0);
      ctx.lineTo(o - z * 0.1, z * 0.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- ベルト上の物質 ----
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || !e.item || !inView(e)) continue;
    const p = e.item.p - 0.5;
    token(ctx, sx(e.x + 0.5 + DX[e.dir] * p), sy(e.y + 0.5 + DY[e.dir] * p), z, e.item.s);
  }

  // ---- 装置 ----
  for (const e of w.ents.values()) {
    if (e.kind === 'belt' || e.kind === 'hub' || !inView(e)) continue;
    machine(ctx, sx(e.x + 0.5), sy(e.y + 0.5), z, e, t);
  }

  hub(ctx, sx(hx), sy(hy), z, w, t);

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
  v.addColorStop(0, 'rgba(4,6,10,0)');
  v.addColorStop(1, 'rgba(4,6,10,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cw, ch);
}

function token(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, s: string) {
  const su = sub(s), r = z * 0.26;
  ctx.fillStyle = su.color;
  ctx.beginPath();
  if (su.state === 'solid') {
    for (let i = 0; i < 6; i++) ctx.lineTo(x + r * Math.cos((i * Math.PI) / 3), y + r * Math.sin((i * Math.PI) / 3));
    ctx.closePath();
  } else if (su.state === 'liquid') {
    ctx.moveTo(x, y - r * 1.25);
    ctx.bezierCurveTo(x + r * 1.5, y, x + r * 0.9, y + r, x, y + r);
    ctx.bezierCurveTo(x - r * 0.9, y + r, x - r * 1.5, y, x, y - r * 1.25);
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  if (z >= 34) {
    const tx = label(s);
    ctx.fillStyle = '#0c1118';
    ctx.font = `600 ${z * (tx.length > 3 ? 0.15 : 0.2)}px ${tx === su.name ? FONT_UI : FONT_MONO}`;
    ctx.fillText(tx, x, y + z * 0.03);
  }
}

function machine(ctx: CanvasRenderingContext2D, cx: number, cy: number, z: number, e: Ent, t: number) {
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const u = z; // 1マス
  const unset = isMachine(e.kind) && !e.recipe;
  // 台座
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, cx - u * 0.44, cy - u * 0.4, u * 0.9, u * 0.9, u * 0.14);
  ctx.fill();
  ctx.fillStyle = C.plate;
  rr(ctx, cx - u * 0.46, cy - u * 0.46, u * 0.92, u * 0.92, u * 0.14);
  ctx.fill();
  ctx.strokeStyle = info.color;
  ctx.lineWidth = Math.max(1.5, u * 0.045);
  ctx.stroke();

  const busy = !!e.busy;
  switch (e.kind) {
    case 'extractor': {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.plate;
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.23, 0, Math.PI * 2); ctx.fill();
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
      // 棚段のある塔
      ctx.fillStyle = info.color;
      rr(ctx, cx - u * 0.15, cy - u * 0.36, u * 0.3, u * 0.72, u * 0.12);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const ty = cy + u * (0.2 - i * 0.14);
        const lit = busy && Math.floor(((e.prog || 0) * 8) % 4) === i;
        ctx.fillStyle = lit ? C.lamp : 'rgba(10,14,22,0.55)';
        ctx.fillRect(cx - u * 0.11, ty, u * 0.22, u * 0.035);
      }
      ctx.fillStyle = C.steel;
      ctx.fillRect(cx + u * 0.15, cy - u * 0.24, u * 0.14, u * 0.04);
      ctx.fillRect(cx + u * 0.15, cy + u * 0.16, u * 0.14, u * 0.04);
      break;
    }
    case 'electrolyzer': {
      ctx.fillStyle = 'rgba(70,200,190,0.25)';
      rr(ctx, cx - u * 0.33, cy - u * 0.12, u * 0.66, u * 0.44, u * 0.06);
      ctx.fill();
      ctx.strokeStyle = info.color;
      ctx.lineWidth = Math.max(1.5, u * 0.04);
      ctx.stroke();
      ctx.fillStyle = C.steel;
      ctx.fillRect(cx - u * 0.19, cy - u * 0.3, u * 0.07, u * 0.52);
      ctx.fillStyle = '#56606e';
      ctx.fillRect(cx + u * 0.12, cy - u * 0.3, u * 0.07, u * 0.52);
      ctx.fillStyle = C.ink;
      ctx.font = `700 ${u * 0.16}px ${FONT_MONO}`;
      ctx.fillText('−', cx - u * 0.155, cy - u * 0.36);
      ctx.fillText('+', cx + u * 0.155, cy - u * 0.36);
      if (busy) {
        ctx.fillStyle = 'rgba(230,250,255,0.8)';
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.4 + i * 0.37) % 1;
          const bx = cx + (i % 2 ? 0.2 : -0.11) * u + Math.sin(i * 9 + t * 4) * u * 0.02;
          ctx.beginPath(); ctx.arc(bx, cy + u * (0.26 - ph * 0.34), u * 0.022, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'reactor': {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.33, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.arc(cx + Math.cos((i * Math.PI) / 4) * u * 0.27, cy + Math.sin((i * Math.PI) / 4) * u * 0.27, u * 0.022, 0, Math.PI * 2); ctx.fill();
      }
      const k = busy ? 0.75 + 0.25 * Math.sin(t * 8) : 0.18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.2);
      g.addColorStop(0, `rgba(255,236,170,${k})`);
      g.addColorStop(1, `rgba(255,150,60,${k * 0.35})`);
      ctx.fillStyle = C.plate;
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.19, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'vent': {
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(cx, cy + u * 0.06, u * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.plate;
      ctx.beginPath(); ctx.arc(cx, cy + u * 0.06, u * 0.13, 0, Math.PI * 2); ctx.fill();
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

  // 名前の札
  if (z >= 34) {
    ctx.fillStyle = info.color;
    rr(ctx, cx - u * 0.46, cy - u * 0.46, u * 0.26, u * 0.26, u * 0.07);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `700 ${u * 0.17}px ${FONT_UI}`;
    ctx.fillText(info.glyph, cx - u * 0.33, cy - u * 0.32);
  }

  // 出口
  const port = (d: number, color: string, text?: string) => {
    const px = cx + DX[d] * u * 0.46, py = cy + DY[d] * u * 0.46;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((d * Math.PI) / 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = C.plate;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(u * 0.1, 0);
    ctx.lineTo(-u * 0.07, -u * 0.13);
    ctx.lineTo(-u * 0.07, u * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (text && z >= 46) {
      ctx.font = `600 ${u * 0.15}px ${FONT_MONO}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(text, cx + DX[d] * u * 0.25 + (DY[d] ? u * 0.24 : 0), cy + DY[d] * u * 0.3 + (DX[d] ? u * 0.24 : 0));
    }
  };
  if (e.kind === 'extractor') port(e.dir, C.ink);
  else if (e.outOrder) e.outOrder.forEach((s, i) => port(portDir(e.dir, i), sub(s).color, label(s)));

  if (unset) {
    const a = 0.55 + 0.45 * Math.sin(t * 5);
    ctx.strokeStyle = `rgba(255,200,87,${a})`;
    ctx.lineWidth = Math.max(2, u * 0.06);
    ctx.setLineDash([u * 0.14, u * 0.1]);
    rr(ctx, cx - u * 0.46, cy - u * 0.46, u * 0.92, u * 0.92, u * 0.14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.lamp;
    ctx.beginPath(); ctx.arc(cx + u * 0.3, cy - u * 0.3, u * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.lampInk;
    ctx.font = `700 ${u * 0.2}px ${FONT_UI}`;
    ctx.fillText('?', cx + u * 0.3, cy - u * 0.29);
  }
  if (busy) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - u * 0.34, cy + u * 0.37, u * 0.68, u * 0.05);
    ctx.fillStyle = C.lamp;
    ctx.fillRect(cx - u * 0.34, cy + u * 0.37, u * 0.68 * (e.prog || 0), u * 0.05);
  }
}

function hub(ctx: CanvasRenderingContext2D, px: number, py: number, z: number, w: World, t: number) {
  const s = z * 2, m = z * 0.06;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  rr(ctx, px + m, py + m * 2, s - 2 * m, s - 2 * m, z * 0.2);
  ctx.fill();
  const g = ctx.createLinearGradient(px, py, px, py + s);
  g.addColorStop(0, '#f0b54a');
  g.addColorStop(1, '#b8791f');
  ctx.fillStyle = g;
  rr(ctx, px + m, py + m, s - 2 * m, s - 2 * m, z * 0.2);
  ctx.fill();
  // 表示盤
  ctx.fillStyle = '#17120a';
  rr(ctx, px + z * 0.2, py + z * 0.36, s - z * 0.4, s - z * 0.62, z * 0.1);
  ctx.fill();
  ctx.fillStyle = C.lampInk;
  ctx.font = `700 ${z * 0.2}px ${FONT_UI}`;
  ctx.fillText('納 品 所', px + s / 2, py + z * 0.23);
  const goal = GOALS[w.goal];
  ctx.fillStyle = `rgba(255,208,110,${0.85 + 0.15 * Math.sin(t * 3)})`;
  ctx.font = `600 ${z * 0.5}px ${FONT_MONO}`;
  ctx.fillText(goal ? label(goal.s) : '完了', px + s / 2, py + z * 0.86);
  if (goal) {
    ctx.font = `500 ${z * 0.24}px ${FONT_MONO}`;
    ctx.fillStyle = '#c99a45';
    ctx.fillText(`${w.count} / ${goal.n}`, px + s / 2, py + z * 1.38);
  }
  // 四隅の警告灯
  for (const [ox, oy] of [[0.16, 0.16], [1.84, 0.16], [0.16, 1.84], [1.84, 1.84]]) {
    ctx.fillStyle = `rgba(255,245,210,${0.5 + 0.5 * Math.sin(t * 4 + ox * 3 + oy)})`;
    ctx.beginPath(); ctx.arc(px + ox * z, py + oy * z, z * 0.045, 0, Math.PI * 2); ctx.fill();
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
