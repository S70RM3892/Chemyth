/**
 * 工場の計算の直し：ずらしたあとの元に戻す、複数の物質の指令、線路のつながり、自動ベルトの道筋、一時停止の扱い、
 * 設計図の写し、鏡に映すときの知らせ、駅の役割・番号を変えたときの荷
 */
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/content/goals';
import { MACHINES } from '../src/content/machines';
import { RECIPES } from '../src/content/recipes';
import { HUB_TILES, resourceAt } from '../src/content/map';
import { addRail, at, configure, currentGoal, deserialize, DX, DY, flowStats, flowTrace, goalCount, layRail, liftPartner, machineState, moveEnts, moveRails, multiOf, newWorld, place, railRoute, requiredOf, serialize, setChapter, setRailMask, setStationRole, slotPort, step, outPort, type Ent, type World, plainSave } from '../src/engine/world';
import { mirrorFixed, moveSpec, relocate, xEnts, xRails, type MoveSpec, type Rect, type Xform } from '../src/engine/shape';
import { bottlenecks, machineTypes, stopReasons } from '../src/engine/flow';
import { findRoute } from '../src/engine/route';
import { decodeBlueprint, encodeBlueprint } from '../src/engine/blueprint';

const rec = (id: string) => RECIPES.find((r) => r.id === id)!;
const run = (w: World, sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) step(w, 1 / 60); };
/** どの線路のつながりも、隣から同じつながりが返っている */
const symmetric = (w: World) => [...w.rails].every(([k, m]) => {
  const [x, y] = k.split(',').map(Number);
  for (let d = 0; d < 4; d++) if ((m >> d) & 1 && !(((w.rails.get(`${x + DX[d]},${y + DY[d]}`) || 0) >> ((d + 2) % 4)) & 1)) return false;
  return true;
});

describe('ずらす・回すを元に戻す：いまの中身のまま戻り、物が増えない', () => {
  it('タンクをずらして中身が流れ出たあと、元に戻しても数は増えない（やり直しても同じ）', () => {
    const w = newWorld();
    expect(place(w, 'tank', 60, 40, 0)).toBeNull();
    const tank = at(w, 60, 40)!;
    tank.sub = 'NaCl'; tank.cnt = 500;
    // 1 マス上へずらす（Shift + ↑ と同じ）。元に戻す手は「いま置かれている設備を、元の場所へ」
    const r = moveEnts(w, [tank], 0, -1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const live = r.added[0];
    for (const i of [0, 1]) { const p = slotPort(live, i); expect(place(w, 'vent', p.tx, p.ty, 0)).toBeNull(); }
    run(w, 10);
    const vented = w.vented.NaCl || 0;
    expect(vented).toBeGreaterThan(0);
    // しまっておいた動かす前の設備は、動かした時点の中身のまま（これを戻すと、流れ出た分が増える）
    expect(r.removed[0].cnt).toBe(500);
    const back = relocate(w, moveSpec(r.removed, r.added));
    expect(back.ok).toBe(true);
    const home = at(w, 60, 40)!;
    expect(home).toBe(back.added[0]);
    expect(at(w, 60, 39)?.kind === 'tank' && at(w, 60, 39) !== home).toBe(false);
    expect((home.cnt || 0) + vented).toBe(500);
    // やり直す：もう一度上へ
    const again = relocate(w, moveSpec(back.removed, back.added, undefined, false));
    expect(again.ok).toBe(true);
    expect(at(w, 60, 39)).toBe(again.added[0]);
    expect((again.added[0].cnt || 0) + (w.vented.NaCl || 0)).toBe(500);
  });

  it('回したベルトの荷が先へ渡ったあと、元に戻しても荷は戻らない。向き・立体交差の荷は元の向きに戻る', () => {
    const w = newWorld();
    place(w, 'belt', 70, 70, 0);
    const belt = at(w, 70, 70)!;
    belt.item = { s: 'H2O', p: 0, m: 0 };
    const res = xEnts(w, [belt], 'rot', [70, 70, 70, 70]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(at(w, 70, 70)!.dir).toBe(1);
    place(w, 'vent', 70, 71, 0);
    run(w, 2);
    expect(at(w, 70, 70)!.item).toBeNull();
    expect(w.vented.H2O).toBe(1);
    expect(res.removed[0].item).not.toBeNull();   // しまっておいた設備には、荷が残っている
    const back = relocate(w, moveSpec(res.removed, res.added, 'rot'));
    expect(back.ok).toBe(true);
    expect(at(w, 70, 70)).toMatchObject({ dir: 0, item: null });

    // 立体交差と、出口の場所を決めた装置：回して戻すと、もとの形にそろう
    const w2 = newWorld();
    place(w2, 'bridge', 60, 60, 0);
    const br = at(w2, 60, 60)!;
    br.items = [{ s: 'H2O', p: 0.5, m: 0, d: 2 }, { s: 'NH3', p: 0.2, m: 0, d: 1 }];
    place(w2, 'reactor', 61, 60, 1);
    const re = at(w2, 61, 60)!;
    configure(re, rec('haber-bosch'), ['NH3']);
    re.outSlot = [3];
    const before = { items: JSON.parse(JSON.stringify(br.items)), dir: re.dir, outSlot: [...re.outSlot] };
    for (const how of ['rot', 'flipX', 'flipY'] as const) {
      const box: [number, number, number, number] = [60, 60, 62, 61];
      const xr = xEnts(w2, [at(w2, 60, 60)!, at(w2, 61, 60)!], how, box);
      expect(xr.ok).toBe(true);
      if (!xr.ok) return;
      const bk = relocate(w2, moveSpec(xr.removed, xr.added, how));
      expect(bk.ok).toBe(true);
      expect(at(w2, 60, 60)!.items).toEqual(before.items);
      expect(at(w2, 61, 60)).toMatchObject({ dir: before.dir, outSlot: before.outSlot });
    }
  });

  it('戻す先がふさがっていれば、何も動かさない', () => {
    const w = newWorld();
    place(w, 'belt', 80, 80, 0);
    const r = moveEnts(w, [at(w, 80, 80)!], 1, 0);
    if (!r.ok) throw new Error(r.why);
    place(w, 'vent', 80, 80, 0);
    const back = relocate(w, moveSpec(r.removed, r.added));
    expect(back.ok).toBe(false);
    expect(at(w, 81, 80)).toBe(r.added[0]);
  });
});

/**
 * main.ts の「元に戻す」と同じ手順：ずらす・回すは 1 回ごとに 1 組（move と、範囲の線路の控え）。
 * 組を逆からたどって打ち消し、打ち消した手を逆にした組を、やり直す側へ積む
 */
type Op = { t: 'move'; m: MoveSpec } | { t: 'rails'; snap: [string, number | undefined][] };
function undoBook(w: World) {
  const undo: Op[][] = [], redo: Op[][] = [];
  const apply = (g: Op[]): Op[] => {
    const inv: Op[] = [];
    for (const op of [...g].reverse()) {
      if (op.t === 'move') {
        const r = relocate(w, op.m);
        if (r.ok && r.added.length) inv.push({ t: 'move', m: moveSpec(r.removed, r.added, op.m.how, !op.m.back) });
      } else {
        inv.push({ t: 'rails', snap: op.snap.map(([k]) => [k, w.rails.get(k)] as [string, number | undefined]) });
        for (const [k, m] of op.snap) setRailMask(w, k, m);
      }
    }
    return inv;
  };
  return {
    /** Shift + 矢印・範囲の ↑↓←→ と同じ。rect があれば、その中の線路も一緒に */
    move(es: Ent[], dx: number, dy: number, rect?: Rect) {
      const r = moveEnts(w, es, dx, dy);
      if (!r.ok) throw new Error(r.why);
      const g: Op[] = [{ t: 'move', m: moveSpec(r.removed, r.added) }];
      if (rect) { const snap = moveRails(w, rect, dx, dy); if (snap.length) g.push({ t: 'rails', snap }); }
      undo.push(g); redo.length = 0;
      return r.added;
    },
    /** 範囲の ↻・⇋・⇅ と同じ */
    xform(es: Ent[], how: Xform, rect: Rect) {
      const r = xEnts(w, es, how, rect);
      if (!r.ok) throw new Error(r.why);
      const g: Op[] = [{ t: 'move', m: moveSpec(r.removed, r.added, how) }];
      if (r.snap.length) g.push({ t: 'rails', snap: r.snap });
      undo.push(g); redo.length = 0;
      return r;
    },
    undo() { const g = undo.pop(); if (g) redo.push(apply(g)); },
    redo() { const g = redo.pop(); if (g) undo.push(apply(g)); },
    get left() { return undo.length; },
  };
}
const spots = (w: World, kind: string) => [...w.ents.values()].filter((e) => e.kind === kind).map((e) => `${e.x},${e.y},${e.dir}`).sort();

describe('続けてずらす・回すと、続けて元に戻せる（1 手ずつ、きちんと戻る）', () => {
  it('タンクを 2 回ずらして 2 回戻すと、元の場所に戻る。2 回やり直すと、ずらした先に戻る', () => {
    const w = newWorld(), book = undoBook(w);
    expect(place(w, 'tank', 60, 40, 0)).toBeNull();
    at(w, 60, 40)!.sub = 'NaCl'; at(w, 60, 40)!.cnt = 50;
    let es = book.move([at(w, 60, 40)!], 0, -1);
    es = book.move(es, 0, -1);
    expect(spots(w, 'tank')).toEqual(['60,38,0']);
    book.undo();
    expect(spots(w, 'tank')).toEqual(['60,39,0']);
    book.undo();
    expect(spots(w, 'tank')).toEqual(['60,40,0']);
    expect(at(w, 60, 40)).toMatchObject({ kind: 'tank', cnt: 50 });
    expect(at(w, 61, 41)?.kind).toBe('tank');   // 2×2 の残りのマスも、元の場所
    expect(book.left).toBe(0);
    book.redo(); book.redo();
    expect(spots(w, 'tank')).toEqual(['60,38,0']);
    expect(at(w, 60, 40)).toBeUndefined();
    // やり直したあとも、また 2 回戻せる
    book.undo(); book.undo();
    expect(spots(w, 'tank')).toEqual(['60,40,0']);
  });

  it('範囲を 2 回回して 2 回戻すと、場所も向きも元どおり。回して鏡に映したあとも同じ', () => {
    const w = newWorld(), book = undoBook(w);
    place(w, 'belt', 70, 70, 0); place(w, 'belt', 71, 70, 0); place(w, 'reactor', 72, 70, 1);
    configure(at(w, 72, 70)!, rec('haber-bosch'), ['NH3']);
    at(w, 72, 70)!.outSlot = [3];
    const start = { belt: spots(w, 'belt'), reactor: spots(w, 'reactor'), outSlot: [3] };
    let rect: Rect = [70, 70, 73, 71];
    let r = book.xform([at(w, 70, 70)!, at(w, 71, 70)!, at(w, 72, 70)!], 'rot', rect);
    rect = r.box;
    r = book.xform(r.added, 'rot', rect);
    const mid = { belt: spots(w, 'belt'), reactor: spots(w, 'reactor') };
    r = book.xform(r.added, 'flipX', r.box);
    const end = { belt: spots(w, 'belt'), reactor: spots(w, 'reactor'), outSlot: r.added.find((e) => e.kind === 'reactor')!.outSlot };
    expect(end.belt).not.toEqual(start.belt);
    book.undo();
    expect({ belt: spots(w, 'belt'), reactor: spots(w, 'reactor') }).toEqual(mid);
    book.undo(); book.undo();
    expect(spots(w, 'belt')).toEqual(start.belt);
    expect(spots(w, 'reactor')).toEqual(start.reactor);
    expect(at(w, 72, 70)!.outSlot).toEqual(start.outSlot);
    // やり直すと、3 手とも同じ形に戻る
    book.redo(); book.redo(); book.redo();
    expect(spots(w, 'belt')).toEqual(end.belt);
    expect(spots(w, 'reactor')).toEqual(end.reactor);
    expect([...w.ents.values()].find((e) => e.kind === 'reactor')!.outSlot).toEqual(end.outSlot);
  });

  it('線路を含む範囲を 2 回ずらして 2 回戻すと、設備も線路もそろって元の場所に戻る', () => {
    const w = newWorld(), book = undoBook(w);
    layRail(w, [[50, 50], [60, 50]]);
    place(w, 'belt', 55, 49, 0);
    const rails0 = new Map(w.rails);
    let es = book.move([at(w, 55, 49)!], 0, 1, [54, 49, 56, 51]);
    es = book.move(es, 0, 1, [54, 50, 56, 52]);
    expect(spots(w, 'belt')).toEqual(['55,51,0']);
    expect(w.rails.get('55,52')).toBeTruthy();
    book.undo();
    expect(spots(w, 'belt')).toEqual(['55,50,0']);
    expect(w.rails.get('55,51')).toBeTruthy();
    book.undo();
    expect(spots(w, 'belt')).toEqual(['55,49,0']);
    expect(new Map(w.rails)).toEqual(rails0);
    expect(symmetric(w)).toBe(true);
    book.redo(); book.redo();
    expect(spots(w, 'belt')).toEqual(['55,51,0']);
    expect(w.rails.get('55,52')).toBeTruthy();
    expect(w.rails.get('55,50')).toBeUndefined();
  });

  it('昇降機は、相方と一緒に何度でも行き来する', () => {
    const w = newWorld(), book = undoBook(w);
    expect(place(w, 'lift', 40, 40, 0)).toBeNull();
    const lifts = () => spots(w, 'lift');
    const start = lifts();
    expect(start.length).toBe(2);
    let es = book.move([at(w, 40, 40)!], 1, 0);
    es = book.move(es.filter((e) => e.y === 40), 1, 0);
    book.undo(); book.undo();
    expect(lifts()).toEqual(start);
    expect(liftPartner(w, at(w, 40, 40)!)).toBeTruthy();
  });
});

describe('複数の物質を同時に求める指令：進み具合は指令ごとに残る', () => {
  /** 納品所の左のベルトから、物質 s を n 個納める（納品所が広がっても付いていく） */
  const give = (w: World, s: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const hub = [...w.ents.values()].filter((e) => e.kind === 'hub'), x0 = Math.min(...hub.map((e) => e.x)), y0 = hub.find((e) => e.x === x0)!.y;
      if (at(w, x0 - 1, y0)?.kind !== 'belt') place(w, 'belt', x0 - 1, y0, 0);
      at(w, x0 - 1, y0)!.item = { s, p: 1, m: 0 };
      run(w, 0.1);
    }
  };
  /** 複数の物質を求める指令（章、番号） */
  const multis = CHAPTERS.flatMap((c, ch) => c.goals.map((g, gi) => ({ ch, gi, g })).filter((x) => x.g.also));
  const go = (w: World, ch: number, gi: number) => { w.progress[ch] = gi; setChapter(w, ch); };

  it('別の章の指令を終えても、この章の進み具合は消えない', () => {
    const a = multis.find((x) => x.g.s === 'NaOH')!, b = multis.find((x) => x.ch !== a.ch)!;
    const w = newWorld();
    go(w, a.ch, a.gi);
    for (const s of [a.g.s, ...a.g.also!]) give(w, s, 3);
    expect(goalCount(w)).toBe(3);
    // 別の章へ移って、その指令を終える
    go(w, b.ch, b.gi);
    for (const s of [b.g.s, ...b.g.also!]) give(w, s, requiredOf(w, b.g));
    expect(w.progress[b.ch]).toBe(b.gi + 1);
    // 戻ると、3 のまま。もう 1 つ納めても、ほかが 3 なので 3
    setChapter(w, a.ch);
    expect(goalCount(w)).toBe(3);
    expect(multiOf(w)).toMatchObject({ [a.g.s]: 3 });
    give(w, a.g.s, 1);
    expect(goalCount(w)).toBe(3);
    expect(multiOf(w)[a.g.s]).toBe(4);
  });

  it('同じ物質を求める別の章の指令に、数が流れ込まない', () => {
    // 同じ物質を含む、別の章の 2 つの指令
    let pair: [typeof multis[0], typeof multis[0], string] | null = null;
    for (const p of multis) for (const q of multis) {
      if (pair || p.ch === q.ch) continue;
      const s = [p.g.s, ...p.g.also!].find((x) => [q.g.s, ...q.g.also!].includes(x));
      if (s) pair = [p, q, s];
    }
    expect(pair).not.toBeNull();
    const [p, q, s] = pair!;
    const w = newWorld();
    go(w, q.ch, q.gi);
    go(w, p.ch, p.gi);
    give(w, s, 2);
    expect(multiOf(w, p.ch)[s]).toBe(2);
    setChapter(w, q.ch);
    expect(multiOf(w)[s]).toBeUndefined();
    expect(goalCount(w)).toBe(0);
  });

  it('保存して読み直しても章ごとに残る。古いセーブ（物質ごとの数 1 つ）は、いまの章へ読み替える', () => {
    const a = multis.find((x) => x.g.s === 'NaOH')!, b = multis.find((x) => x.ch !== a.ch)!;
    const w = newWorld();
    go(w, b.ch, b.gi);
    give(w, b.g.s, 2);
    go(w, a.ch, a.gi);
    give(w, a.g.s, 4);
    const w2 = deserialize(serialize(w))!;
    expect(multiOf(w2, a.ch)).toEqual({ [a.g.s]: 4 });
    expect(multiOf(w2, b.ch)).toEqual({ [b.g.s]: 2 });
    // 古いセーブ
    const d = plainSave(serialize(w));
    const all = [a.g.s, ...a.g.also!];
    d.multi = Object.fromEntries(all.map((s, i) => [s, 3 + i]));
    d.counts[a.ch] = 3;
    d.counts[b.ch] = 2;
    const w3 = deserialize(JSON.stringify(d))!;
    expect(multiOf(w3, a.ch)).toEqual(Object.fromEntries(all.map((s, i) => [s, 3 + i])));
    expect(multiOf(w3, b.ch)).toEqual(Object.fromEntries([b.g.s, ...b.g.also!].map((s) => [s, 2])));
    expect(currentGoal(w3)).toBe(a.g);
  });
});

describe('線路：範囲をずらす・回すと、外とのつながりは両側とも切れる', () => {
  it('ずらすと、外の隣に片側だけのつながりが残らない。元に戻すと、すっかり元どおり', () => {
    const w = newWorld();
    layRail(w, [[10, 5], [20, 5]]);
    const orig = new Map(w.rails);
    const snap = moveRails(w, [15, 4, 20, 6], 0, 2);
    expect(symmetric(w)).toBe(true);
    expect((w.rails.get('14,5') || 0) & 1).toBe(0);       // 消えたマスを指していない
    expect(w.rails.has('15,5')).toBe(false);
    expect(w.rails.get('15,7')! & 4).toBe(0);              // 動かした端は、知らない隣を指していない
    // 線路を敷き直せる（片側だけのつながりがあると、断られていた）
    expect(addRail(w, [14, 5], [15, 5])).toBe(true);
    expect(symmetric(w)).toBe(true);
    // 元に戻す：控えを書き戻すと、まわりも含めて元どおり（いま敷いた (14,5)–(15,5) も控えに入っている）
    for (const [k, m] of snap) setRailMask(w, k, m);
    expect(new Map(w.rails)).toEqual(orig);
  });

  it('回すと、外の隣に片側だけのつながりが残らない', () => {
    const w = newWorld();
    layRail(w, [[10, 5], [20, 5]]);
    const orig = new Map(w.rails);
    const snap = xRails(w, [15, 3, 17, 7], 'rot');
    expect(symmetric(w)).toBe(true);
    expect((w.rails.get('18,5') || 0) & 4).toBe(0);
    expect((w.rails.get('14,5') || 0) & 1).toBe(0);
    for (const [k, m] of snap) setRailMask(w, k, m);
    expect(new Map(w.rails)).toEqual(orig);
  });

  it('列車の道筋は、片側だけのつながりを通らない。片側だけなら、敷き直すともう片側も足す。古いセーブも直す', () => {
    const w = newWorld();
    place(w, 'station', 10, 10, 0);
    place(w, 'station', 30, 10, 0);
    const a = at(w, 10, 10)!, b = at(w, 30, 10)!;
    b.role = 'out';
    layRail(w, [[12, 10], [29, 10]]);
    expect(railRoute(w, a, b)).not.toBeNull();
    // (20,10) から左への つながりを外す（(19,10) は右を指したまま）
    setRailMask(w, '20,10', w.rails.get('20,10')! & ~4);
    expect(railRoute(w, a, b)).toBeNull();
    expect(addRail(w, [19, 10], [20, 10])).toBe(true);
    expect(railRoute(w, a, b)).not.toBeNull();
    // 片側だけのつながりを持つセーブ
    const d = plainSave(serialize(w));
    d.rails = [...d.rails, ['50,50', 1], ['60,60', 1], ['61,60', 4 | 1]];
    const w2 = deserialize(JSON.stringify(d))!;
    expect(w2.rails.has('50,50')).toBe(false);   // 右の隣がない
    expect(w2.rails.get('60,60')).toBe(1);        // 両側そろったつながりは残る
    expect(w2.rails.get('61,60')).toBe(4);
    expect(symmetric(w2)).toBe(true);
  });
});

describe('自動ベルト：ほかの設備が物を出しているマスを通らない', () => {
  const [hx, hy] = HUB_TILES[0];
  it('採取機の出口の前を横切らない。敷いて流しても、関係のない物は納品所に届かない', () => {
    const w = newWorld();
    const ex = hx - 8, ey = hy - 1;
    expect(place(w, 'extractor', ex, ey, 1)).toBeNull();   // 下向き。前は空いている
    const r = findRoute(w, [hx - 13, hy], [hx, hy]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.some((s) => s.x === ex && s.y === ey + 1)).toBe(false);
    for (const s of r.steps) { if (s.bridge) continue; expect(place(w, 'belt', s.x, s.y, s.dir)).toBeNull(); }
    run(w, 10);
    expect(w.delivered[resourceAt(ex, ey)] || 0).toBe(0);
  });

  it('終わりの設備の隣でも、ほかの設備が物を出しているマスには最後のベルトを置かない', () => {
    const w = newWorld();
    place(w, 'vent', 50, 50, 0);
    place(w, 'extractor', 49, 49, 1);   // (49,50) へ出す
    const r = findRoute(w, [40, 50], [50, 50]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.some((s) => s.x === 49 && s.y === 50)).toBe(false);
    const last = r.steps[r.steps.length - 1];
    expect(at(w, last.x + DX[last.dir], last.y + DY[last.dir])?.kind).toBe('vent');
    // 分配器の 3 つの出口の前も通らない
    const w2 = newWorld();
    place(w2, 'splitter', 12, 10, 0);
    const r2 = findRoute(w2, [10, 10], [15, 10]);
    expect(r2.ok).toBe(true);
    if (r2.ok) for (const [x, y] of [[13, 10], [12, 9], [12, 11]]) expect(r2.steps.some((s) => s.x === x && s.y === y)).toBe(false);
  });

  it('選んだ始まりの空きマスは、行き止まりのベルトの先でも使える（延ばすとき）', () => {
    const w = newWorld();
    place(w, 'belt', 80, 80, 0);
    const r = findRoute(w, [81, 80], [90, 80]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps[0]).toMatchObject({ x: 81, y: 80 });
  });
});

describe('一時停止した装置：統計・地図・診断で「動いている」「詰まっている」と見せない', () => {
  /** 反応器と、原料を運ぶベルト、出口の先の廃棄口 */
  const line = () => {
    const w = newWorld();
    place(w, 'reactor', 20, 10, 0);
    const e = at(w, 20, 10)!;
    configure(e, rec('haber-bosch'), ['NH3']);
    const p = outPort(e, 0);
    place(w, 'vent', p.tx, p.ty, 0);
    place(w, 'belt', 19, 10, 0);
    return { w, e, belt: at(w, 19, 10)! };
  };
  const feed = (e: ReturnType<typeof line>['e']) => { e.inBuf = { N2: 4, H2: 12 }; };

  it('反応の途中で止めると、稼働とは数えず、止める前の続きから再開する', () => {
    const { w, e, belt } = line();
    for (let i = 0; i < 30 * 60; i++) { feed(e); step(w, 1 / 60); }
    expect(e.u!).toBeGreaterThan(0.6);
    // 反応の途中で止める
    while (!e.busy || (e.prog || 0) < 0.3) { feed(e); step(w, 1 / 60); }
    const prog = e.prog!, n = e.n!;
    e.off = true;
    belt.item = { s: 'H2', p: 1, m: 0 };
    run(w, 10);
    expect(e.busy).toBe(false);
    expect(e.offProg).toBeCloseTo(prog, 6);
    expect(machineState(e)).toBe(3);
    expect(e.u!).toBeLessThan(0.6);
    expect(stopReasons(w)).toMatchObject({ run: 0, wait: 0, jam: 0, off: 1 });
    expect(machineTypes(w).find((t) => t.kind === 'reactor')).toMatchObject({ n: 1, set: 1, run: 0, wait: 0, jam: 0, off: 1, util: null });
    const f = flowStats(w);
    expect(f).toMatchObject({ util: null, machines: 0, paused: 1, jammed: 0, starved: 0 });
    expect(bottlenecks(w).starved.length + bottlenecks(w).jammed.length).toBe(0);
    // 止まっているベルトの理由
    expect(flowTrace(w, belt).head?.why).toContain('一時停止');
    // 動かすと、預けた続きから
    delete e.off;
    step(w, 1 / 60);
    expect(e.busy).toBe(true);
    expect(e.offProg).toBeUndefined();
    expect(e.prog!).toBeGreaterThan(prog);
    expect(e.n).toBe(n);
    run(w, 3);
    expect(e.n!).toBeGreaterThan(n);
  });

  it('詰まったまま止めても、詰まりの元・受け取れない物質には出ない', () => {
    const { w, e } = line();
    // 出口の先をなくして詰まらせる
    const p = outPort(e, 0);
    w.ents.delete(`${p.tx},${p.ty}`);
    for (let i = 0; i < 20 * 60; i++) { feed(e); step(w, 1 / 60); }
    expect(bottlenecks(w).jammed[0]?.e).toBe(e);
    e.bad = 'O2'; e.badT = w.tick;
    e.off = true;
    step(w, 1 / 60);
    expect(e.stuck || 0).toBe(0);
    expect(e.bad).toBeUndefined();
    expect(bottlenecks(w).jammed.length).toBe(0);
    expect(flowStats(w).jammed).toBe(0);
    expect(stopReasons(w)).toMatchObject({ jam: 0, bad: 0, off: 1 });
  });
});

describe('写す・鏡に映す', () => {
  it('設計図の文字列は、積む駅の編成の数も運ぶ', () => {
    const text = encodeBlueprint('駅', [{ kind: 'station', dx: 0, dy: 0, dir: 0, ch: 7, role: 'in', cars: 3 }, { kind: 'sensor', dx: 2, dy: 0, dir: 0, test: 'jam', ch: 5 }]);
    const bp = decodeBlueprint(text)!;
    expect(bp.stamps[0]).toMatchObject({ ch: 7, role: 'in', cars: 3 });
    expect(bp.stamps[1]).toMatchObject({ ch: 5, test: 'jam' });
  });

  it('鏡に映すと出口の左右が入れ替わらない設備の名前（回すだけなら知らせない）', () => {
    expect(mirrorFixed(['analyzer', 'belt', 'settler', 'analyzer'], 'flipX')).toEqual([MACHINES.analyzer.name, MACHINES.settler.name]);
    expect(mirrorFixed(['analyzer'], 'flipY')).toEqual([MACHINES.analyzer.name]);
    expect(mirrorFixed(['analyzer'], 'rot')).toEqual([]);
  });
});

describe('貨物駅：役割・番号を変えても、列車の荷は消えない', () => {
  const setup = () => {
    const w = newWorld();
    place(w, 'station', 10, 60, 0);
    place(w, 'station', 110, 60, 0);
    const a = at(w, 10, 60)!, b = at(w, 110, 60)!;
    b.role = 'out';
    a.cars = 2;
    a.buf = Array(480).fill('NH3');
    run(w, 1);
    return { w, a, b };
  };
  const onTrains = (a: ReturnType<typeof setup>['a']) => [a.tr, ...(a.xtr ?? [])].reduce((n, t) => n + (t?.cargo.length ?? 0), 0);

  it('番号を変えると、走っている列車は荷を積んだまま引き返す', () => {
    const { w, a, b } = setup();
    expect(onTrains(a)).toBe(480);
    a.ch = 2;
    run(w, 15);
    expect(a.buf!.length + onTrains(a) + (b.buf?.length ?? 0)).toBe(480);
    expect(b.buf?.length ?? 0).toBe(0);
  });

  it('役割を変えると、列車の荷は駅に戻る（消えない）', () => {
    const { w, a } = setup();
    a.buf!.push('!NH3');
    setStationRole(a, 'out');
    expect(a.role).toBe('out');
    expect(a.tr).toBeUndefined();
    expect(a.buf!.length).toBe(481);
    setStationRole(a, 'out');
    expect(a.buf!.length).toBe(481);
    void w;
  });
});
