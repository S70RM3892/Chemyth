import { productsOf, type Recipe } from './recipes';
import { hasSub } from './substances';
import { atomsOf } from './tokenlayout';

/**
 * 反応の様子の設計：原料の粒がばらけ、原子が飛んで、生成物に組み替わる。
 * 原子の数が両辺で合っていること（係数の意味）が、目で見てわかる。
 * 化学式のない物質（混合物・高分子）がからむ反応や、原子が多すぎる反応は、粒のまま入れ替わる絵にする。
 */

export interface Unit { id: string; x: number; y: number; r: number }
export interface Flight { sym: string; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; delay: number; bend: number }
export interface ScenePlan { left: Unit[]; right: Unit[]; flights: Flight[] | null; /** 原子を飛ばせない理由（飛ばせるなら空） */ why: string }

/** 1 つの辺に並べられる粒の上限と、飛ばせる原子の上限 */
export const MAX_UNITS = 12, MAX_ATOMS = 72;

/** 粒を、与えられた四角の中に、できるだけ大きく並べる */
function pack(ids: string[], x0: number, y0: number, w: number, hgt: number): Unit[] {
  const n = ids.length;
  if (!n) return [];
  let best = { cols: 1, r: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols), r = Math.min(w / cols, hgt / rows) / 2 * 0.86;
    if (r > best.r) best = { cols, r };
  }
  const rows = Math.ceil(n / best.cols), cw = w / best.cols, ch = hgt / rows, r = Math.min(best.r, 34);
  return ids.map((id, i) => {
    const row = Math.floor(i / best.cols), inRow = row === rows - 1 ? n - row * best.cols : best.cols;
    return { id, r, x: x0 + (w - inRow * cw) / 2 + ((i % best.cols) + 0.5) * cw, y: y0 + (row + 0.5) * ch };
  });
}

/** 反応の場面の設計：両辺の粒の配置と、原子 1 個ずつの出発点・到着点 */
export function planScene(r: Recipe, W: number, H: number): ScenePlan {
  const outs = r.machine === 'battery' ? r.outputs : productsOf(r);
  const expand = (side: [string, number][]) => side.flatMap(([id, n]) => (hasSub(id) || id === 'e' ? Array(n).fill(id) as string[] : []));
  let L = expand(r.inputs), R = expand(outs), why = '';
  // 係数を問わない反応や、粒が多すぎる反応は、物質 1 種につき 1 粒にする
  if (r.loose || r.mix || L.length > MAX_UNITS || R.length > MAX_UNITS) {
    why = r.loose || r.mix ? '混合物や高分子がからむので、原子の数は追わない' : '粒が多いので、種類だけを示す';
    L = r.inputs.map(([id]) => id); R = outs.map(([id]) => id);
  }
  const pad = 10, mid = W * 0.16, sideW = (W - mid) / 2 - pad;
  const left = pack(L, pad, pad, sideW, H - pad * 2), right = pack(R, W - pad - sideW, pad, sideW, H - pad * 2);
  if (why) return { left, right, flights: null, why };
  // 原子を元素ごとに集め、左の出発点と右の到着点を順に結ぶ
  const collect = (units: Unit[]) => {
    const by = new Map<string, { x: number; y: number; r: number }[]>();
    for (const u of units) {
      if (u.id === 'e') continue;
      const atoms = atomsOf(u.id);
      if (!atoms) return null;
      for (const a of atoms) (by.get(a.sym) ?? by.set(a.sym, []).get(a.sym)!).push({ x: u.x + a.x * u.r, y: u.y + a.y * u.r, r: a.r * u.r });
    }
    return by;
  };
  const from = collect(left), to = collect(right);
  if (!from || !to) return { left, right, flights: null, why: '化学式で書けない物質がからむので、原子の数は追わない' };
  const total = [...from.values()].reduce((a, v) => a + v.length, 0);
  const balanced = from.size === to.size && [...from].every(([sym, v]) => to.get(sym)?.length === v.length);
  if (!balanced) return { left, right, flights: null, why: '原子の数を追えない反応' };
  if (total > MAX_ATOMS) return { left, right, flights: null, why: '原子が多いので、粒のまま示す' };
  const flights: Flight[] = [];
  let k = 0;
  for (const [sym, src] of from) {
    // 上から順に結ぶと、線が交わりにくい
    const a = [...src].sort((p, q) => p.y - q.y || p.x - q.x), b = [...to.get(sym)!].sort((p, q) => p.y - q.y || p.x - q.x);
    a.forEach((s, i) => { flights.push({ sym, x0: s.x, y0: s.y, r0: s.r, x1: b[i].x, y1: b[i].y, r1: b[i].r, delay: (k % 7) * 0.035, bend: ((k * 37) % 11 - 5) * 3 }); k++; });
  }
  return { left, right, flights, why: '' };
}
