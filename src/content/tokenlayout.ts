import { parseFormula } from '../chem/formula';
import { sub } from './substances';

/** 物質の絵柄の中での、元素の形の並べ方。描く道具（Canvas）には触れないので、計算だけに使える */

export interface Atom { sym: string; x: number; y: number; r: number; n?: number }
const layouts = new Map<string, Atom[]>();
const ring = (syms: string[], rad: number, r: number, start: number): Atom[] =>
  syms.map((sym, i) => ({ sym, r, x: rad * Math.cos(start + (2 * Math.PI * i) / syms.length), y: rad * Math.sin(start + (2 * Math.PI * i) / syms.length) }));
const RING_START: Record<number, number> = { 2: Math.PI / 6, 3: -Math.PI / 2, 4: -Math.PI * 0.75 };

/** 半径 1 の台の上での原子の配置 */
export function layoutOf(id: string): Atom[] {
  const hit = layouts.get(id);
  if (hit) return hit;
  const s = sub(id);
  let out: Atom[];
  if (!s.formula) {
    const rep = s.rep ?? [];
    out = rep.length === 1 ? [{ sym: rep[0], x: 0, y: 0, r: 0.62 }] : rep.length === 2 ? [{ sym: rep[0], x: -0.36, y: 0, r: 0.34 }, { sym: rep[1], x: 0.36, y: 0, r: 0.34 }] : ring(rep, 0.44, 0.3, -Math.PI / 2);
  } else {
    const atoms = parseFormula(s.formula), syms = Object.keys(atoms), total = syms.reduce((a, k) => a + atoms[k], 0);
    if (total === 1) out = [{ sym: syms[0], x: 0, y: 0, r: 0.62 }];
    else if (total <= 5) {
      const all = syms.flatMap((k) => Array(atoms[k]).fill(k) as string[]);
      const ones = syms.filter((k) => atoms[k] === 1 && k !== 'H');
      const center = total >= 3 ? (ones.find((k) => k !== 'O') ?? ones[0]) : undefined;
      if (center) {
        const rest = all.filter((k, i) => !(k === center && all.indexOf(center) === i));
        out = [{ sym: center, x: 0, y: 0, r: 0.34 }, ...ring(rest, 0.58, 0.23, RING_START[rest.length] ?? -Math.PI / 2)];
      } else if (total === 2) out = [{ sym: all[0], x: -0.36, y: 0, r: 0.34 }, { sym: all[1], x: 0.36, y: 0, r: 0.34 }];
      else out = ring(all, 0.46, 0.28, -Math.PI / 2);
    } else {
      // 原子が多いものは、元素ごとに 1 つの形と個数で表す
      const m = syms.length;
      const pos = m === 1 ? [[0, 0]] : m === 2 ? [[-0.38, 0], [0.38, 0]] : m === 3 ? [[0, -0.4], [-0.42, 0.3], [0.42, 0.3]] : m === 4 ? [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]] : syms.map((_, i) => [0.52 * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / m), 0.52 * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / m)]);
      const r = m === 1 ? 0.55 : m <= 2 ? 0.34 : m === 3 ? 0.31 : m === 4 ? 0.3 : 0.24;
      out = syms.map((sym, i) => ({ sym, x: pos[i][0], y: pos[i][1], r, n: atoms[sym] }));
    }
  }
  layouts.set(id, out);
  return out;
}

/** 物質の絵柄を、原子 1 個ずつに開いた配置（半径 1 の台の上）。原子が多くて「形と個数」で描いている物質は、その個数ぶんの小さな形に開く。
 *  化学式を持たない物質（混合物・高分子）は、本当の原子の数がわからないので null */
export function atomsOf(id: string): { sym: string; x: number; y: number; r: number }[] | null {
  if (id === 'e' || !sub(id).formula) return null;
  const out: { sym: string; x: number; y: number; r: number }[] = [];
  // drawToken と同じ場所に来るように、縮尺（0.9）と液体のずれ（0.1）を合わせる
  const dy = sub(id).state === 'liquid' ? 0.1 : 0;
  for (const a of layoutOf(id)) {
    const n = a.n ?? 1;
    if (n === 1) { out.push({ sym: a.sym, x: a.x * 0.9, y: a.y * 0.9 + dy, r: a.r * 0.9 }); continue; }
    const r = a.r * 0.9 * Math.max(0.3, 0.85 / Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const ang = i * 2.39996, rad = a.r * 0.8 * Math.sqrt((i + 0.5) / n);
      out.push({ sym: a.sym, x: (a.x + Math.cos(ang) * rad) * 0.9, y: (a.y + Math.sin(ang) * rad) * 0.9 + dy, r });
    }
  }
  return out;
}
