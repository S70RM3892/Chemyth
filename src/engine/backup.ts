/**
 * ファイルからの読み込みと、読み込む前の控え（画面も保存先も持たない。単体テストで確かめる）。
 * - 設計図の棚：読み込んだ設計図も、この端末に置いてある設計図も、文字列での受け渡しと同じ検査（decodeBlueprint）に通す
 *   （数・広さ・名前の長さは、文字列で渡すときの上限に切らない）。
 *   読み込んだ設計図は、いまの棚に足す（いまある設計図は消さない）
 * - 読み込む前の控え：置き換えた枠だけを控える。戻すときも、その枠だけを戻す（読み込みと関係ない枠には触らない）
 */
import { BP_MAX, decodeBlueprint, encodeBlueprint, type Stamp } from './blueprint';

/** 設計図の棚の 1 件 */
export interface Shelf { name: string; stamps: Stamp[] }
/** 設計図の棚に置ける数 */
export const SHELF_MAX = 16;

/** 棚の設計図の名前の長さの上限。自動でつける名前（設計図 N：反応・反応）は、文字列で渡すときの 30 文字を超えることがある */
const NAME_MAX = 100;
/** 棚の設計図の広さの上限（マス）。自分で囲んだ範囲は、文字列で渡すときの上限（BP_SPAN）より広くてよい */
const SHELF_SPAN = 1_000_000;

/**
 * 棚の 1 件を確かめる。設備と設定は、文字列にして読み直す（decodeBlueprint の検査をそのまま通す）。読めなければ null。
 * 棚の設計図は、文字列で渡せる数（BP_MAX）と広さ（BP_SPAN）を超えてよい。数は BP_MAX 個ずつに分けて確かめ、
 * 位置はここで確かめてから、文字列の検査には左上に寄せて通し、元の位置に戻す。名前もそのまま残す（文字列の 30 文字に切らない）
 */
export function checkShelf(x: unknown): Shelf | null {
  try {
    const { name, stamps } = (x ?? {}) as { name?: unknown; stamps?: unknown };
    if (typeof name !== 'string' || !Array.isArray(stamps) || !stamps.length) return null;
    const pos = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= SHELF_SPAN;
    const out: Stamp[] = [];
    for (let i = 0; i < stamps.length; i += BP_MAX) {
      const part = stamps.slice(i, i + BP_MAX) as Stamp[];
      if (!part.every((b) => b && typeof b === 'object' && pos(b.dx) && pos(b.dy))) return null;
      // 位置は上で確かめた。文字列の広さの上限に当たらないよう、左上（0, 0）に寄せて検査に通す
      const d =decodeBlueprint(encodeBlueprint('', part.map((b) => ({ ...b, dx: 0, dy: 0 }))));
      if (!d || d.stamps.length !== part.length) return null;
      d.stamps.forEach((b, j) => out.push({ ...b, dx: part[j].dx, dy: part[j].dy }));
    }
    return { name: name.trim().slice(0, NAME_MAX) || '受け取った設計図', stamps: out };
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
