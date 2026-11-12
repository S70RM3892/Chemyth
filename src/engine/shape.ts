/**
 * 組み立ての手助け（工場の形を変える計算）。画面に頼らない計算だけを置く（tests/chem.test.ts で確かめる）。
 *  - 囲んだ設備・設計図を、その場で回す・鏡に映す（左右・上下）
 *  - 隣に複製するときの場所
 *  - ベルトの一続きを見つけて、向きを逆にする
 *  - 出口のつなぎ忘れ、中にたまっている数、置けない理由
 */
import { MACHINES } from '../content/machines';
import { isSep, sepReady, sepSlots } from '../content/sep';
import type { Stamp } from './blueprint';
import { at, BIG, DX, DY, FLOOR_DY, fitAnchor, floorOf, footprint, isMachine, key, liftPartner, MOVERS, outPort, portDir, restore, sizeOf, slotPort, tunnelPair, type Dir, type Ent, type Kind, type World } from './world';

/** [x0, y0, x1, y1]（両端を含む） */
export type Rect = [number, number, number, number];
/** rot：右に 90° 回す、flipX：左右を入れ替える、flipY：上下を入れ替える */
export type Xform = 'rot' | 'flipX' | 'flipY';

/** 向きの付け替え */
export const xDir = (d: Dir, how: Xform): Dir => (how === 'rot' ? (d + 1) % 4 : how === 'flipX' ? (d % 2 ? d : (d + 2) % 4) : d % 2 ? (d + 2) % 4 : d) as Dir;
/** 4 方向のビットの並び（線路のつながり・ベルトに入ってきた向き）を付け替える */
export const xBits = (m: number, how: Xform): number => { let r = 0; for (let d = 0; d < 4; d++) if ((m >> d) & 1) r |= 1 << xDir(d as Dir, how); return r; };
/** 幅 W・高さ H の枠の中で、大きさ s の物の左上 (cx, cy) がどこへ移るか（枠の左上からのずれ） */
export function xPos(cx: number, cy: number, s: number, W: number, H: number, how: Xform): [number, number] {
  if (how === 'rot') return [H - cy - s, cx];
  if (how === 'flipX') return [W - cx - s, cy];
  return [cx, H - cy - s];
}
/** 鏡に映すと、右手と左手の出口が入れ替わる。1 マスの装置：0 正面 1 右手 2 左手。2×2：0↔1、2↔3、4↔5 */
const MIRROR_SMALL = [0, 2, 1], MIRROR_BIG = [1, 0, 3, 2, 5, 4];
export const mirrorSlot = (big: boolean, s: number) => (big ? MIRROR_BIG : MIRROR_SMALL)[s] ?? s;
/** 出口の左右が決まっていて、鏡に映しても入れ替えられない設備 */
export const MIRROR_FIXED: Kind[] = ['analyzer', 'settler', 'funnel', 'phoresis'];

const stampSize = (b: Stamp) => (BIG.includes(b.kind) ? 2 : 1);
/** 設計図を回す・鏡に映す。左上は (0, 0) のまま */
export function xStamps(stamps: Stamp[], how: Xform): Stamp[] {
  if (!stamps.length) return [];
  const W = Math.max(...stamps.map((b) => b.dx + stampSize(b))), H = Math.max(...stamps.map((b) => b.dy + stampSize(b)));
  return stamps.map((b) => {
    const s = stampSize(b), [dx, dy] = xPos(b.dx, b.dy, s, W, H, how);
    const out: Stamp = { ...b, dx, dy, dir: xDir(b.dir, how) };
    if (how !== 'rot' && b.outOrder && !isSep(b.kind)) out.outSlot = b.outOrder.map((_, i) => mirrorSlot(s === 2, b.outSlot?.[i] ?? i));
    return out;
  });
}

/** 設備を移した写し。向き・出口の場所・立体交差の荷・合流の向きも付け替える */
function copyX(e: Ent, x: number, y: number, how: Xform): Ent {
  const c: Ent = { ...e, x, y, dir: xDir(e.dir, how) };
  if (how !== 'rot' && e.outOrder && !isSep(e.kind)) c.outSlot = e.outOrder.map((_, i) => mirrorSlot(!!e.big, e.outSlot?.[i] ?? i));
  if (e.items) {
    // 立体交差：[横の流れ, 縦の流れ]。回すと、横と縦が入れ替わる
    const items: Ent['items'] = [null, null];
    e.items.forEach((it, a) => { if (!it) return; const d = xDir((it.d ?? a) as Dir, how); items[d % 2] = { ...it, d }; });
    c.items = items;
  }
  if (e.ins) c.ins = xBits(e.ins, how);
  if (e.li !== undefined) c.li = xDir(e.li, how);
  if (e.pri !== undefined) c.pri = xDir(e.pri, how);
  return c;
}

export type XResult = { ok: true; removed: Ent[]; added: Ent[]; box: Rect; snap: [string, number | undefined][]; warn: string[] } | { ok: false; why: string };
/**
 * 囲んだ設備を、その場で回す・鏡に映す。基準は、囲み（rect と、設備が占めるマスをすべて含む四角）の左上。
 * 設定・中身はそのまま。昇降機は、もう一方の階の相方も一緒に動く。中の線路も一緒に回す（1 階だけ）。
 * 行き先が、動かすもの以外でふさがっていれば何もせず、理由を返す。
 * 成功したら、消した元の設備・置いた設備・新しい囲み・線路の控え（元に戻すときに使う）・鏡に映せない設備の名前を返す
 */
export function xEnts(w: World, es: Ent[], how: Xform, rect?: Rect | null): XResult {
  const set = new Set<Ent>();
  for (const e0 of es) { const e = e0.kind === 'part' ? at(w, e0.x, e0.y) : e0; if (e && e.kind !== 'hub') set.add(e); }
  if (!set.size) return { ok: false, why: '動かすものがない。' };
  let [x0, y0, x1, y1] = rect ?? [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of set) { const s = sizeOf(e); x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + s - 1); y1 = Math.max(y1, e.y + s - 1); }
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const plan: [Ent, Ent][] = [];
  for (const e of set) {
    const s = sizeOf(e), [rx, ry] = xPos(e.x - x0, e.y - y0, s, W, H, how), c = copyX(e, x0 + rx, y0 + ry, how);
    plan.push([e, c]);
    if (e.kind === 'lift') { const p = liftPartner(w, e); if (p && !set.has(p)) plan.push([p, copyX(p, c.x, c.y + (p.y - e.y), how)]); }
  }
  const moving = new Set(plan.map(([e]) => e));
  for (const [, c] of plan) for (const [fx, fy] of footprint(c.x, c.y, sizeOf(c))) {
    const o = at(w, fx, fy);
    if (o && !moving.has(o)) return { ok: false, why: o.kind === 'hub' ? '行き先に納品所がある。' : `行き先に${o.kind === 'part' ? '装置' : MACHINES[o.kind as keyof typeof MACHINES]?.name ?? 'ほかの設備'}がある。` };
  }
  for (const [e] of plan) for (const [fx, fy] of footprint(e.x, e.y, sizeOf(e))) w.ents.delete(key(fx, fy));
  for (const [, c] of plan) restore(w, c);
  // 走っている列車の行き先の駅を動かしたら、行き先も付け替える
  const moved = new Map(plan.filter(([e]) => e.kind === 'station').map(([e, c]) => [key(e.x, e.y), key(c.x, c.y)]));
  if (moved.size) for (const e of w.ents.values()) if (e.kind === 'station') for (const tr of [e.tr, ...(e.xtr ?? [])]) if (tr?.to && moved.has(tr.to)) tr.to = moved.get(tr.to);
  const box: Rect = how === 'rot' ? [x0, y0, x0 + H - 1, y0 + W - 1] : [x0, y0, x1, y1];
  const snap = floorOf(y0) ? [] : xRails(w, [x0, y0, x1, y1], how);
  const warn = how === 'rot' ? [] : [...new Set([...set].filter((e) => MIRROR_FIXED.includes(e.kind)).map((e) => MACHINES[e.kind as keyof typeof MACHINES].name))];
  return { ok: true, removed: plan.map(([e]) => e), added: plan.map(([, c]) => c), box, snap, warn };
}
/** 囲みの中の線路を、設備と同じように回す・鏡に映す。かかわるマスの、変える前の線路を返す（元に戻すときに使う） */
export function xRails(w: World, r: Rect, how: Xform): [string, number | undefined][] {
  const W = r[2] - r[0] + 1, H = r[3] - r[1] + 1;
  const inside: [number, number, number][] = [];
  for (const [k, m] of w.rails) { const [x, y] = k.split(',').map(Number); if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) inside.push([x, y, m]); }
  if (!inside.length) return [];
  const to = inside.map(([x, y, m]) => { const [rx, ry] = xPos(x - r[0], y - r[1], 1, W, H, how); return [r[0] + rx, r[1] + ry, xBits(m, how)] as [number, number, number]; });
  const cells = new Set([...inside, ...to].map(([x, y]) => key(x, y)));
  const snap = [...cells].map((k) => [k, w.rails.get(k)] as [string, number | undefined]);
  for (const [x, y] of inside) w.rails.delete(key(x, y));
  for (const [x, y, m] of to) { const k = key(x, y); w.rails.set(k, (w.rails.get(k) ?? 0) | m); }
  w.railRev++;
  return snap;
}

// ---------------- 出口と入口 ----------------
export interface OutTarget { tx: number; ty: number; d: Dir; /** 装置の生成物 */ s?: string }
/** 設備 e が物を送り出す先のマスと向き（装置は、設定した生成物の出口だけ） */
export function outTargets(w: World, e: Ent): OutTarget[] {
  const one = (d: Dir): OutTarget => ({ tx: e.x + DX[d], ty: e.y + DY[d], d });
  const slot = (i: number): OutTarget => { const p = slotPort(e, i); return { tx: p.tx, ty: p.ty, d: p.d }; };
  switch (e.kind) {
    case 'belt': case 'extractor': case 'depot': case 'sampler': case 'sensor': case 'gate': return [one(e.dir)];
    case 'lift': return e.role === 'out' ? [one(e.dir)] : [];
    case 'tunnel': return tunnelPair(w, e) ? [] : [one(e.dir)];
    case 'splitter': return [0, 1, 2].map((i) => one(portDir(e.dir, i)));
    case 'analyzer': return [0, 1].map((i) => one(portDir(e.dir, i)));
    case 'settler': case 'funnel': case 'phoresis': return sepSlots(e.kind).map(slot);
    case 'tank': return [0, 1].map(slot);
    case 'station': return e.role === 'out' ? [0, 1].map(slot) : [];
    case 'bridge': case 'hub': case 'vent': case 'part': return [];
    default: return (e.outOrder ?? []).map((s, i) => { const p = outPort(e, i); return { tx: p.tx, ty: p.ty, d: p.d, s }; });
  }
}
/** m が、マス (x, y) へ向き d で物を送り出すか（立体交差は、通り抜けるかもしれないので、送り出すものとみなす） */
export function emitsInto(w: World, m: Ent, x: number, y: number, d: Dir): boolean {
  if (m.kind === 'bridge') return true;
  return outTargets(w, m).some((o) => o.tx === x && o.ty === y && o.d === d);
}
/** t が、向き d で入ってくる物を受け取る形か（物質の種類は見ない） */
export function acceptsFrom(t: Ent, d: Dir): boolean {
  const back = (d + 2) % 4;
  switch (t.kind) {
    case 'belt': case 'sensor': case 'gate': return t.dir !== back;
    case 'lift': return t.role === 'in' && t.dir !== back;
    case 'tunnel': return t.dir === d;
    case 'station': return t.role !== 'out';
    case 'extractor': case 'depot': case 'sampler': case 'part': return false;
    default: return true;
  }
}

/** ベルト e を含む一続き（流れの順）。合流・分かれ道・ベルト以外の設備で切れる */
export function beltLine(w: World, e: Ent): Ent[] {
  if (e.kind !== 'belt') return [];
  const feeders = (b: Ent) => ([0, 1, 2, 3] as Dir[]).flatMap((d) => { const m = at(w, b.x - DX[d], b.y - DY[d]); return m && m !== b && emitsInto(w, m, b.x, b.y, d) ? [m] : []; });
  const line = [e], seen = new Set<Ent>([e]);
  for (let b = e; ;) {
    const f = feeders(b);
    if (f.length !== 1 || f[0].kind !== 'belt' || seen.has(f[0])) break;
    b = f[0]; seen.add(b); line.unshift(b);
  }
  for (let b = e; ;) {
    const n = at(w, b.x + DX[b.dir], b.y + DY[b.dir]);
    if (!n || n.kind !== 'belt' || seen.has(n) || n.dir === (b.dir + 2) % 4 || feeders(n).length !== 1) break;
    b = n; seen.add(b); line.push(b);
  }
  return line;
}
const dirTo = (a: Ent, b: Ent): Dir => (b.x > a.x ? 0 : b.x < a.x ? 2 : b.y > a.y ? 1 : 3);
/**
 * 一続きのベルトを逆向きにしたときの、それぞれの向き。もとの先頭（これからは最後）は、もとの流れの元（装置）があればそこへ向け、なければ逆を向く
 */
export function reversedDirs(w: World, line: Ent[]): Dir[] {
  return line.map((b, i) => {
    if (i > 0) return dirTo(b, line[i - 1]);
    const src = ([0, 1, 2, 3] as Dir[]).find((d) => { const m = at(w, b.x - DX[d], b.y - DY[d]); return !!m && m.kind !== 'belt' && emitsInto(w, m, b.x, b.y, d); });
    return (((src ?? b.dir) + 2) % 4) as Dir;
  });
}

/** 出口の先に何もない（または受け取れない向きの）装置。what は、つながっていない出口の生成物（わからなければ ''） */
export interface Loose { e: Ent; what: string[] }
export function looseOutputs(w: World): Loose[] {
  const res: Loose[] = [];
  for (const e of w.ents.values()) {
    if (e.kind === 'part' || e.kind === 'hub' || e.kind === 'vent' || MOVERS.has(e.kind) || e.sealed) continue;
    if (isMachine(e.kind) && !e.outOrder?.length) continue;
    if ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub) continue;
    if (isSep(e.kind) && !sepReady(e.kind, e.test)) continue;
    if (e.kind === 'tank' && e.test === 'hold') continue;
    const outs = outTargets(w, e);
    if (!outs.length) continue;
    const bad = outs.filter((o) => { const t = at(w, o.tx, o.ty); return !t || !acceptsFrom(t, o.d); });
    // 駅とタンクは 2 つの口から交互に出す：どちらかがつながっていればよい
    const alt = e.kind === 'station' || e.kind === 'tank';
    if (alt ? bad.length === outs.length : bad.length) res.push({ e, what: bad.map((o) => o.s ?? '') });
  }
  return res.sort((a, b) => floorOf(a.e.y) - floorOf(b.e.y) || a.e.y - b.e.y || a.e.x - b.e.x);
}

/** 中にためている物の数（原料・生成物・タンク・駅・分ける装置・列車の荷） */
export function stockOf(e: Ent): number {
  let n = 0;
  for (const v of Object.values(e.inBuf ?? {})) n += Math.max(0, v || 0);
  for (const v of e.outBuf ?? []) n += Math.max(0, v || 0);
  n += (e.cnt ?? 0) + (e.rcn ?? 0) + (e.buf?.length ?? 0) + (e.buf2?.length ?? 0) + (e.buf3?.length ?? 0);
  if (e.item && !MOVERS.has(e.kind)) n += e.item.n ?? 1;
  for (const tr of [e.tr, ...(e.xtr ?? [])]) if (tr) n += tr.cargo.length;
  return n;
}

/** 設備の名前（2×2 の残りのマスは「装置」） */
export const nameOf = (k: Kind) => (k === 'hub' ? '納品所' : k === 'part' ? '装置' : MACHINES[k as keyof typeof MACHINES]?.name ?? 'ほかの設備');
/** kind を (x, y) に置けない理由。置けるなら null */
export function whyNot(w: World, kind: Kind, x: number, y: number): string | null {
  const o = at(w, x, y);
  if (o) return o.kind === 'hub' ? 'ここは納品所。空いたマスを選べ。' : `ここには${nameOf(o.kind)}がある。空いたマスを選べ（ずらすなら「見る」で長押し）。`;
  if (floorOf(y) === 1 && kind === 'extractor') return '採取機は 1 階にしか置けない。採ったものは昇降機で上げろ。';
  if (floorOf(y) === 1 && kind === 'station') return '貨物駅は 1 階にしか置けない。';
  if (BIG.includes(kind) && !fitAnchor(w, x, y)) return `${nameOf(kind)}は 2×2 マスを使う。ここを含む 2×2 の空きがない。`;
  if (kind === 'lift' && w.ents.has(key(x, y + (floorOf(y) ? -FLOOR_DY : FLOOR_DY)))) return 'もう一方の階の同じ場所がふさがっている（昇降機は上下で 1 組）。';
  return null;
}

/** 隣に複製する場所：正面 → 右手 → 左手 → 背中側の順に、空いている所。side は e から見た向き（0 正面 1 右手 2 背中側 3 左手） */
export function dupSpot(w: World, e: Ent): { x: number; y: number; side: number } | null {
  const s = sizeOf(e);
  for (const side of [0, 1, 3, 2]) {
    const d = (e.dir + side) % 4, x = e.x + DX[d] * s, y = e.y + DY[d] * s;
    if (footprint(x, y, s).some(([fx, fy]) => w.ents.has(key(fx, fy)))) continue;
    if (e.kind === 'lift' && w.ents.has(key(x, y + (floorOf(y) ? -FLOOR_DY : FLOOR_DY)))) continue;
    return { x, y, side };
  }
  return null;
}
