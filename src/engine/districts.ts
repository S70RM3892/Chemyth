import { recipeById } from '../content/recipes';
import { isMachine, reactionsPerMin, sizeOf, type World } from './world';

/** 区画：近くに固まっている装置のまとまり。引いた視点で「ここは何を作っているか」を示すのに使う */
export interface District {
  x0: number; y0: number; x1: number; y1: number;
  /** いちばん多くの装置が作っている物質 */
  s: string;
  /** その物質を、いまの稼働率で毎分いくつ作っているか */
  perMin: number;
  /** 装置の台数 */
  n: number;
}

/** 1 つの区画とみなす近さ（マス）。装置どうしがこれより離れていたら別の区画 */
export const DISTRICT_CELL = 6;

export function districtsOf(w: World): District[] {
  // 装置を粗い升目に入れ、隣り合う升目をつないで、まとまりを作る
  const cells = new Map<string, { es: number[] }>();
  const ms = [...w.ents.values()].filter((e) => isMachine(e.kind) && !!e.recipe && !!e.outOrder);
  const cellOf = (i: number) => { const e = ms[i]; return [Math.floor((e.x + sizeOf(e) / 2) / DISTRICT_CELL), Math.floor((e.y + sizeOf(e) / 2) / DISTRICT_CELL)]; };
  ms.forEach((_, i) => { const [cx, cy] = cellOf(i), k = `${cx},${cy}`; (cells.get(k) ?? cells.set(k, { es: [] }).get(k)!).es.push(i); });
  const seen = new Set<string>(), out: District[] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const stack = [start], members: number[] = [];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!, [cx, cy] = k.split(',').map(Number);
      members.push(...cells.get(k)!.es);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nk = `${cx + dx},${cy + dy}`;
        if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const count: Record<string, number> = {}, rate: Record<string, number> = {};
    for (const i of members) {
      const e = ms[i], r = recipeById(e.recipe)!, sz = sizeOf(e);
      x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + sz); y1 = Math.max(y1, e.y + sz);
      const main = e.outOrder!.find((s) => s !== 'e') ?? e.outOrder![0];
      const coef = r.outputs.find(([id]) => id === main)?.[1] ?? 1;
      count[main] = (count[main] || 0) + 1;
      rate[main] = (rate[main] || 0) + (e.u ?? 0) * reactionsPerMin(w, e, r) * coef;
    }
    const s = Object.keys(count).sort((a, b) => count[b] - count[a] || rate[b] - rate[a] || (a < b ? -1 : 1))[0];
    out.push({ x0, y0, x1, y1, s, perMin: rate[s], n: members.length });
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
