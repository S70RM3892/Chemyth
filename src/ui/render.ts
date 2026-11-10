import { GOALS, HUB_TILES, MAP_H, MAP_W, ZONES, zoneAt } from '../content/map';
import { recipeById } from '../content/recipes';
import { label, sub } from '../content/substances';
import { DX, DY, isMachine, portDir, type Ent, type Kind, type World } from '../engine/world';

export interface Camera { x: number; y: number; z: number }

// 画面は暗い一色の世界。就寝前でも眩しくない配色に固定する
const C = {
  land: '#1b211f', landAlt: '#1e2523', sea: '#15303d', seaAlt: '#17364a', air: '#262b40', airAlt: '#2a3048',
  grid: 'rgba(255,255,255,0.045)', edge: '#0f1312', belt: '#2f3836', beltArrow: '#5d6b67',
  text: '#e8ece9', dim: '#93a09b', hub: '#e0a23a', hubInk: '#231a08', warn: '#f2c14e',
};

export const MACHINE_STYLE: Record<Exclude<Kind, 'belt' | 'hub'>, { glyph: string; name: string; color: string }> = {
  extractor: { glyph: '採', name: '採取機', color: '#5f7d8c' },
  separator: { glyph: '留', name: '分留塔', color: '#7a6fb0' },
  electrolyzer: { glyph: '電', name: '電解槽', color: '#3f8f8a' },
  reactor: { glyph: '反', name: '反応器', color: '#b0683f' },
  vent: { glyph: '放', name: '放出口', color: '#5a5f66' },
};

const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';

export function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, cam: Camera) {
  const z = cam.z;
  const sx = (x: number) => (x - cam.x) * z + cw / 2;
  const sy = (y: number) => (y - cam.y) * z + ch / 2;

  ctx.fillStyle = C.edge;
  ctx.fillRect(0, 0, cw, ch);

  const x0 = Math.max(0, Math.floor(cam.x - cw / 2 / z)), x1 = Math.min(MAP_W - 1, Math.ceil(cam.x + cw / 2 / z));
  const y0 = Math.max(0, Math.floor(cam.y - ch / 2 / z)), y1 = Math.min(MAP_H - 1, Math.ceil(cam.y + ch / 2 / z));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const zone = zoneAt(x, y);
      const alt = (x + y) % 2 === 0;
      ctx.fillStyle = zone === 'sea' ? (alt ? C.sea : C.seaAlt) : zone === 'air' ? (alt ? C.air : C.airAlt) : alt ? C.land : C.landAlt;
      ctx.fillRect(Math.floor(sx(x)), Math.floor(sy(y)), Math.ceil(z) + 1, Math.ceil(z) + 1);
    }
  }
  if (z >= 30) {
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(Math.round(sx(x)) + 0.5, sy(y0)); ctx.lineTo(Math.round(sx(x)) + 0.5, sy(y1 + 1)); }
    for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(sx(x0), Math.round(sy(y)) + 0.5); ctx.lineTo(sx(x1 + 1), Math.round(sy(y)) + 0.5); }
    ctx.stroke();
  }

  // 資源地の名前
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const zn of Object.values(ZONES)) {
    const [lx, ly] = zn.labelAt;
    ctx.font = `700 ${Math.max(11, z * 0.3)}px ${FONT_UI}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`${zn.name}  ${label(zn.resource)}`, sx(lx), sy(ly));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ベルト
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || e.x < x0 - 1 || e.x > x1 + 1 || e.y < y0 - 1 || e.y > y1 + 1) continue;
    const px = sx(e.x), py = sy(e.y), m = z * 0.08;
    ctx.fillStyle = C.belt;
    ctx.fillRect(px + m, py + m, z - 2 * m, z - 2 * m);
    arrow(ctx, px + z / 2, py + z / 2, e.dir, z * 0.2, C.beltArrow);
  }

  // 装置
  for (const e of w.ents.values()) {
    if (e.kind === 'belt' || e.kind === 'hub') continue;
    const st = MACHINE_STYLE[e.kind];
    const px = sx(e.x), py = sy(e.y), m = z * 0.06;
    const unset = isMachine(e.kind) && !e.recipe;
    ctx.fillStyle = st.color;
    rr(ctx, px + m, py + m, z - 2 * m, z - 2 * m, z * 0.14);
    ctx.fill();
    if (unset) {
      ctx.strokeStyle = C.warn;
      ctx.lineWidth = Math.max(2, z * 0.05);
      ctx.setLineDash([z * 0.14, z * 0.1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = C.text;
    ctx.font = `700 ${z * 0.42}px ${FONT_UI}`;
    ctx.fillText(unset ? '？' : st.glyph, px + z / 2, py + z / 2 + z * 0.02);

    if (e.kind === 'extractor') {
      arrow(ctx, px + z / 2 + DX[e.dir] * z * 0.36, py + z / 2 + DY[e.dir] * z * 0.36, e.dir, z * 0.11, C.text);
    } else if (e.outOrder) {
      e.outOrder.forEach((s, i) => {
        const d = portDir(e.dir, i);
        const cx = px + z / 2 + DX[d] * z * 0.38, cy = py + z / 2 + DY[d] * z * 0.38;
        ctx.fillStyle = sub(s).color;
        ctx.beginPath();
        ctx.arc(cx, cy, z * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.edge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
    if (e.busy) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px + z * 0.16, py + z * 0.8, z * 0.68, z * 0.07);
      ctx.fillStyle = C.text;
      ctx.fillRect(px + z * 0.16, py + z * 0.8, z * 0.68 * (e.prog || 0), z * 0.07);
    }
  }

  // ベルト上の物質
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || !e.item) continue;
    const t = e.item.p - 0.5;
    token(ctx, sx(e.x + 0.5 + DX[e.dir] * t), sy(e.y + 0.5 + DY[e.dir] * t), z, e.item.s);
  }

  // 納品ハブ
  const [hx, hy] = HUB_TILES[0];
  const hpx = sx(hx), hpy = sy(hy), hs = z * 2, hm = z * 0.08;
  ctx.fillStyle = C.hub;
  rr(ctx, hpx + hm, hpy + hm, hs - 2 * hm, hs - 2 * hm, z * 0.22);
  ctx.fill();
  ctx.fillStyle = C.hubInk;
  const g = GOALS[w.goal];
  ctx.font = `700 ${z * 0.3}px ${FONT_UI}`;
  ctx.fillText('納品', hpx + hs / 2, hpy + hs * 0.26);
  ctx.font = `600 ${z * 0.5}px ${FONT_MONO}`;
  ctx.fillText(g ? label(g.s) : '完了', hpx + hs / 2, hpy + hs * 0.54);
  if (g) {
    ctx.font = `600 ${z * 0.28}px ${FONT_MONO}`;
    ctx.fillText(`${w.count} / ${g.n}`, hpx + hs / 2, hpy + hs * 0.8);
  }
}

function token(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, s: string) {
  const r = z * 0.27;
  ctx.fillStyle = sub(s).color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (z >= 34) {
    const t = label(s);
    ctx.fillStyle = '#10151a';
    ctx.font = `600 ${z * (t.length > 3 ? 0.17 : 0.21)}px ${FONT_MONO}`;
    ctx.fillText(t, x, y + z * 0.01);
  }
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s, 0);
  ctx.lineTo(-s * 0.7, -s * 0.85);
  ctx.lineTo(-s * 0.7, s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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

export function describe(e: Ent): string {
  if (e.kind === 'hub') return '納品ハブ。指定された物質をここへ運べ。';
  if (e.kind === 'belt') return 'ベルト。';
  const r = recipeById(e.recipe);
  return MACHINE_STYLE[e.kind].name + (r ? `（${r.name}）` : '');
}
