import { recipeById } from '../content/recipes';
import { isPlaceable, LINE_MAX, subOk, testOk } from './world';
import type { Dir, Kind } from './world';

/** 設計図の 1 個ぶん：左上からの位置、向き、設定。cars は積む駅の編成の数 */
export interface Stamp { kind: Exclude<Kind, 'hub' | 'part'>; dx: number; dy: number; dir: Dir; recipe?: string; outOrder?: string[]; outSlot?: number[]; test?: string; sub?: string; ch?: number; role?: 'in' | 'out'; cars?: number }

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
    const row: unknown[] = [b.kind, b.dx, b.dy, b.dir, b.recipe ?? 0, b.outOrder ?? 0, b.outSlot ?? 0, b.test ?? 0, b.sub ?? 0, b.ch ?? 0, b.role ?? 0, b.cars ?? 0];
    while (row.length > 4 && row[row.length - 1] === 0) row.pop();
    return row;
  });
  return HEAD + b64(JSON.stringify({ n: name.slice(0, 30), s: rows }));
}

const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * 1 個ぶんを確かめる。種類・位置・向きがおかしければ null。知らない反応や物質、その設備では選べない設定は外して、設備だけ残す。
 * span：左上からの広さの上限（受け取った文字列は BP_SPAN まで。自分で囲んだ範囲には上限がない）
 */
export function cleanStamp(o: Partial<Record<keyof Stamp, unknown>> | null | undefined, span = Infinity): Stamp | null {
  if (!o || typeof o !== 'object') return null;
  const { kind, dx, dy, dir, recipe, outOrder, outSlot, test, sub, ch, role, cars } = o;
  if (!isPlaceable(kind) || !int(dx, 0, span) || !int(dy, 0, span) || !int(dir, 0, 3)) return null;
  const b: Stamp = { kind, dx, dy, dir: dir as Dir };
  // 反応は、その装置の反応で、出口の物質がその生成物のときだけ写す
  const r = typeof recipe === 'string' ? recipeById(recipe) : undefined;
  if (r && r.machine === kind && Array.isArray(outOrder) && outOrder.length <= 6 && outOrder.every((s) => typeof s === 'string' && r.outputs.some(([x]) => x === s))) {
    b.recipe = r.id; b.outOrder = [...outOrder];
    if (Array.isArray(outSlot) && outSlot.length === outOrder.length && outSlot.every((v) => int(v, 0, 5))) b.outSlot = [...outSlot];
  }
  if (testOk(kind, test)) b.test = test;
  if (subOk(kind, sub)) b.sub = sub;
  if (int(ch, 1, LINE_MAX)) b.ch = ch;
  if (role === 'in' || role === 'out') b.role = role;
  if (int(cars, 1, 5)) b.cars = cars;
  return b;
}

/** 文字列から設計図を読む。読めない・中身がおかしいときは null。知らない反応や物質の設定は外して、設備だけ残す */
export function decodeBlueprint(text: string): { name: string; stamps: Stamp[] } | null {
  try {
    const t = text.trim().replace(/\s+/g, '');
    if (!t.startsWith(HEAD)) return null;
    const d = JSON.parse(unb64(t.slice(HEAD.length)));
    if (!d || !Array.isArray(d.s) || d.s.length === 0 || d.s.length > BP_MAX) return null;
    const stamps: Stamp[] = [];
    for (const row of d.s) {
      if (!Array.isArray(row)) return null;
      const [kind, dx, dy, dir, recipe, outOrder, outSlot, test, sub, ch, role, cars] = row;
      const b = cleanStamp({ kind, dx, dy, dir, recipe, outOrder, outSlot, test, sub, ch, role, cars }, BP_SPAN);
      if (!b) return null;
      stamps.push(b);
    }
    return { name: typeof d.n === 'string' && d.n.trim() ? d.n.trim().slice(0, 30) : '受け取った設計図', stamps };
  } catch {
    return null;
  }
}
