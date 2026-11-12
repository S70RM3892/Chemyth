/**
 * ファイルからの読み込みと、読み込む前の控え（画面も保存先も持たない。単体テストで確かめる）。
 * - 設計図の棚：読み込んだ設計図も、この端末に置いてある設計図も、文字列での受け渡しと同じ検査（decodeBlueprint）に通す。
 *   読み込んだ設計図は、いまの棚に足す（いまある設計図は消さない）
 * - 読み込む前の控え：置き換えた枠だけを控える。戻すときも、その枠だけを戻す（読み込みと関係ない枠には触らない）
 */
import { BP_MAX, decodeBlueprint, encodeBlueprint, type Stamp } from './blueprint';

/** 設計図の棚の 1 件 */
export interface Shelf { name: string; stamps: Stamp[] }
/** 設計図の棚に置ける数 */
export const SHELF_MAX = 16;

/**
 * 棚の 1 件を確かめる。文字列にして読み直す（decodeBlueprint の検査をそのまま通す）。読めなければ null。
 * 棚の設計図は、文字列で渡せる数（BP_MAX）を超えてよいので、BP_MAX 個ずつに分けて確かめる
 */
export function checkShelf(x: unknown): Shelf | null {
  try {
    const { name, stamps } = (x ?? {}) as { name?: unknown; stamps?: unknown };
    if (typeof name !== 'string' || !Array.isArray(stamps) || !stamps.length) return null;
    const out: Stamp[] = [];
    let title = '';
    for (let i = 0; i < stamps.length; i += BP_MAX) {
      const d = decodeBlueprint(encodeBlueprint(name, stamps.slice(i, i + BP_MAX) as Stamp[]));
      if (!d) return null;
      title = d.name;
      out.push(...d.stamps);
    }
    return { name: title, stamps: out };
  } catch { return null; }
}

/** 棚ぜんぶを確かめる。読めないものは外し、外した数を返す */
export function cleanShelf(raw: unknown): { list: Shelf[]; dropped: number } {
  if (!Array.isArray(raw)) return { list: [], dropped: 0 };
  const list: Shelf[] = [];
  for (const x of raw) { const b = checkShelf(x); if (b) list.push(b); }
  return { list, dropped: raw.length - list.length };
}

/**
 * 読み込んだ設計図を、いまの棚に足す。いまある設計図は 1 つも消さない。
 * 名前も中身も同じものは、もうあるので足さない。棚があふれる分は足さない（full に数える）。足したものは棚の先頭に並べる
 */
export function mergeShelf(local: Shelf[], incoming: Shelf[], max = SHELF_MAX): { list: Shelf[]; added: number; full: number } {
  const key = (b: Shelf) => JSON.stringify([b.name, b.stamps]);
  const have = new Set(local.map(key)), fresh: Shelf[] = [];
  for (const b of incoming) { const k = key(b); if (!have.has(k)) { have.add(k); fresh.push(b); } }
  const room = Math.max(0, max - local.length), add = fresh.slice(0, room);
  return { list: [...add, ...local], added: add.length, full: fresh.length - add.length };
}

/** 読み込む前の控え。at：読み込んだ時刻（前の版の控えは 0）。slots：置き換えた枠の、置き換える前の中身（空だった枠は null） */
export interface Backup { at: number; slots: Record<string, string | null> }

/** 控えを、保存する文字列にする */
export const makeBackup = (at: number, slots: Record<string, string | null>) => JSON.stringify({ v: 2, at, slots });

/** 保存してある控えを読む。前の版の控え（3 冊ぶんを、そのまま並べたもの）も読む。読めなければ null */
export function parseBackup(text: string | null, slots = 3): Backup | null {
  if (!text) return null;
  try {
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object') return null;
    const v2 = d.v === 2, raw = v2 ? d.slots : d;
    if (!raw || typeof raw !== 'object') return null;
    const out: Record<string, string | null> = {};
    for (let n = 1; n <= slots; n++) {
      const j = raw[String(n)];
      if (typeof j === 'string' || j === null) out[String(n)] = j;
    }
    return Object.keys(out).length ? { at: v2 && typeof d.at === 'number' ? d.at : 0, slots: out } : null;
  } catch { return null; }
}

/**
 * 控えから戻すと、どの枠がどうなるか（枠の番号の順）。json が null の枠は消える。
 * いまの中身が控えと同じ枠は、戻しても変わらないので入れない（読み込めなかった枠や、すでに戻した枠）
 */
export function restorePlan(b: Backup, read: (n: number) => string | null): { n: number; json: string | null }[] {
  return Object.entries(b.slots).map(([k, json]) => ({ n: Number(k), json })).filter(({ n, json }) => read(n) !== json).sort((p, q) => p.n - q.n);
}
