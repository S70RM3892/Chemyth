/**
 * 軽量スキン（白い紙・黒い紙）：重い端末と電池のために、飾りをすべて省く。
 * - 地面：一色の地に、マスの線と、資源地の四角い色だけ（にじみ・模様・紙の繊維なし）
 * - 装置：四角い札に機種の色の帯。影・厚み・面取りなし（反応の様子は、覚える中身なのでそのまま描く）
 * - ベルト：縁と中身の 2 回の線引きと、流れの向きの点線だけ（厚み・影なし）
 * - 画質は「標準」に固定（WebGL を使わない）、地図は等倍の細かさ、毎秒 30 コマ（main.ts）
 * - 画面の部品（CSS）：影・ぼかし・動く飾り・読み込む書体を使わない
 */
import { ZONES, isSea, zoneAt } from '../content/map';
import { label, sub } from '../content/substances';
import { currentGoal, goalCount, goalRate, requiredOf, type World } from '../engine/world';
import { mix, type Palette } from './theme';

/** 地面の区画：一色の地、マスの線（8 マスごとに濃い線）、資源地は四角く塗る。海は青 */
export function buildChunkLite(P: Palette, cx: number, cy: number, TS: number, CH: number): HTMLCanvasElement {
  const SIZE = TS * CH, cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d', { alpha: false })!;
  const ox = cx * CH, oy = cy * CH, light = P.name === 'light';
  g.fillStyle = P.paper; g.fillRect(0, 0, SIZE, SIZE);
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
    const zn = zoneAt(ox + tx, oy + ty);
    if (!zn) continue;
    g.fillStyle = isSea(zn) ? (light ? '#d5e9f7' : '#0a1c2a') : mix(P.paper, ZONES[zn].tint[1], light ? 0.26 : 0.3);
    g.fillRect(tx * TS, ty * TS, TS, TS);
  }
  g.fillStyle = P.grid;
  for (let i = 0; i < CH; i++) { g.fillRect(i * TS, 0, 1, SIZE); g.fillRect(0, i * TS, SIZE, 1); }
  g.fillStyle = P.gridBold;
  for (let i = 0; i < CH; i++) {
    if ((((ox + i) % 8) + 8) % 8 === 0) g.fillRect(i * TS, 0, 1, SIZE);
    if ((((oy + i) % 8) + 8) % 8 === 0) g.fillRect(0, i * TS, SIZE, 1);
  }
  return cv;
}

/** 装置の台：四角い札と、上の辺の機種の色の帯 */
export function bodyLite(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, color: string, line: number) {
  const x = cx - u * 0.42, y = cy - u * 0.42, s = u * 0.84;
  ctx.fillStyle = P.plate; ctx.fillRect(x, y, s, s);
  ctx.fillStyle = color; ctx.fillRect(x, y, s, Math.max(2, u * 0.05));
  ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.strokeRect(x, y, s, s);
}

/** 納品所：四角い箱に、いま欲しがっているものと数だけ（歯・煙突・元素の環・煙なし。元素の一覧は、納品所をタップすると出る） */
export function hubLite(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World) {
  const s = z * size, m = z * 0.06, cx = px + s / 2, cy = py + s / 2, light = P.name === 'light';
  ctx.fillStyle = light ? '#111111' : '#f2f2f2'; ctx.fillRect(px + m, py + m, s - m * 2, s - m * 2);
  ctx.strokeStyle = P.red; ctx.lineWidth = Math.max(2, z * 0.08); ctx.strokeRect(px + m, py + m, s - m * 2, s - m * 2);
  const goal = currentGoal(w), gs = goal ? sub(goal.s) : null, plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '満腹' : goal!.also ? `${label(goal!.s)} ほか` : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  const u = s * 0.5;
  ctx.textAlign = 'center'; ctx.fillStyle = light ? '#ffffff' : '#000000';
  ctx.font = `700 ${u * Math.min(0.42, 1.2 / Math.max(1, tx.length * (plain ? 1 : 0.62)))}px ${P.font}`;
  ctx.fillText(tx, cx, cy - u * 0.04);
  if (goal) {
    ctx.font = `600 ${u * 0.2}px ui-monospace, Menlo, monospace`;
    ctx.fillText(goal.rate ? `毎分 ${Math.round(goalRate(w))} / ${goal.rate}` : `${goalCount(w)} / ${requiredOf(w, goal)}`, cx, cy + u * 0.32);
  }
}
