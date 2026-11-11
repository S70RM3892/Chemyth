import { recipeById } from '../content/recipes';
import { hasSub } from '../content/substances';
import { MACHINES } from '../content/machines';
import type { Dir, Kind } from './world';

/** 設計図の 1 個ぶん：左上からの位置、向き、設定 */
export interface Stamp { kind: Exclude<Kind, 'hub' | 'part'>; dx: number; dy: number; dir: Dir; recipe?: string; outOrder?: string[]; outSlot?: number[]; test?: string; sub?: string; ch?: number; role?: 'in' | 'out' }

const HEAD = 'CHEMYTH-BP1:';
/** 1 枚の設計図に入れられる数と、広さ（マス） */
export const BP_MAX = 1500, BP_SPAN = 200;

const b64 = (s: string) => {
  // 長い配列を一度に展開すると引数の上限を超えるので、区切って文字にする
  const u = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < u.length; i += 4096) bin += String.fromCharCode(...u.subarray(i, i + 4096));
  return btoa(bin);
};
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** 設計図を、人に渡せる文字列にする */
export function encodeBlueprint(name: string, stamps: Stamp[]): string {
  // 短くするため、1 個を配列で書く。設定のないものは後ろを省く
  const rows = stamps.map((b) => {
    const row: unknown[] = [b.kind, b.dx, b.dy, b.dir, b.recipe ?? 0, b.outOrder ?? 0, b.outSlot ?? 0, b.test ?? 0, b.sub ?? 0, b.ch ?? 0, b.role ?? 0];
    while (row.length > 4 && row[row.length - 1] === 0) row.pop();
    return row;
  });
  return HEAD + b64(JSON.stringify({ n: name.slice(0, 30), s: rows }));
}

/** 文字列から設計図を読む。読めない・中身がおかしいときは null。知らない反応や物質の設定は外して、設備だけ残す */
export function decodeBlueprint(text: string): { name: string; stamps: Stamp[] } | null {
  try {
    const t = text.trim().replace(/\s+/g, '');
    if (!t.startsWith(HEAD)) return null;
    const d = JSON.parse(unb64(t.slice(HEAD.length)));
    if (!d || !Array.isArray(d.s) || d.s.length === 0 || d.s.length > BP_MAX) return null;
    const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
    const stamps: Stamp[] = [];
    for (const row of d.s) {
      if (!Array.isArray(row)) return null;
      const [kind, dx, dy, dir, recipe, outOrder, outSlot, test, sub, ch, role] = row;
      if (typeof kind !== 'string' || !(kind in MACHINES) || !int(dx, 0, BP_SPAN) || !int(dy, 0, BP_SPAN) || !int(dir, 0, 3)) return null;
      const b: Stamp = { kind: kind as Stamp['kind'], dx, dy, dir };
      const r = typeof recipe === 'string' ? recipeById(recipe) : undefined;
      if (r && r.machine === kind && Array.isArray(outOrder) && outOrder.every((s) => typeof s === 'string' && (s === 'e' || hasSub(s))) && outOrder.length <= 6) {
        b.recipe = r.id; b.outOrder = outOrder;
        if (Array.isArray(outSlot) && outSlot.length === outOrder.length && outSlot.every((v) => int(v, 0, 5))) b.outSlot = outSlot;
      }
      if (typeof test === 'string' && test.length <= 40) b.test = test;
      if (typeof sub === 'string' && sub.length <= 40) b.sub = sub;
      if (int(ch, 1, 8)) b.ch = ch;
      if (role === 'in' || role === 'out') b.role = role;
      stamps.push(b);
    }
    return { name: typeof d.n === 'string' && d.n.trim() ? d.n.trim().slice(0, 30) : '受け取った設計図', stamps };
  } catch {
    return null;
  }
}
