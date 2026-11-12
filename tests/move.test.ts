import { describe, expect, it } from 'vitest';
import { at, FLOOR_DY, key, liftPartner, moveEnts, newWorld, place, remove, restore, type Ent } from '../src/engine/world';

/** 地図のマスのうち、本体を失った「装置の残りのマス」 */
const orphans = (w: ReturnType<typeof newWorld>) => [...w.ents.entries()].filter(([, e]) => e.kind === 'part' && !w.ents.has(e.ref!)).map(([k]) => k);

describe('ずらす：もう地図にないものは動かさない', () => {
  it('ずらしたあとの古い控えを渡しても、いまそこにある装置を消さず、増やしもしない', () => {
    const w = newWorld();
    expect(place(w, 'reactor', 50, 30, 0)).toBeNull();
    const old = at(w, 50, 30)!;
    old.inBuf = { H2: 40 };
    // 長押しで 1 マスずらした（本体は新しいものに置き換わる）
    expect(moveEnts(w, [old], 1, 0).ok).toBe(true);
    const now = at(w, 51, 30)!;
    expect(now).not.toBe(old);
    const n = w.ents.size;
    // 「ずらす」の行き先待ちに残っていた古い控えで、もう一度ずらそうとする
    const r = moveEnts(w, [old], -15, -4);
    expect(r.ok).toBe(false);
    expect(w.ents.size).toBe(n);
    expect(at(w, 51, 30)).toBe(now);
    expect(at(w, 52, 31)).toBe(now);
    expect(at(w, 35, 26)).toBeUndefined();
    expect(orphans(w)).toEqual([]);
  });
  it('消したものを渡しても、置き直さない。その場所に新しく置いたものも消さない', () => {
    const w = newWorld();
    place(w, 'belt', 40, 20, 0);
    const gone = at(w, 40, 20)!;
    remove(w, 40, 20);
    place(w, 'belt', 40, 20, 1);
    const fresh = at(w, 40, 20)!;
    const r = moveEnts(w, [gone], 3, 0);
    expect(r.ok).toBe(false);
    expect(at(w, 40, 20)).toBe(fresh);
    expect(at(w, 43, 20)).toBeUndefined();
  });
  it('元に戻すで同じものが戻れば、また動かせる', () => {
    const w = newWorld();
    place(w, 'tank', 30, 30, 0);
    const t = at(w, 30, 30)!;
    remove(w, 30, 30);
    expect(moveEnts(w, [t], 1, 0).ok).toBe(false);
    expect(restore(w, t)).toBe(true);
    expect(moveEnts(w, [t], 1, 0).ok).toBe(true);
    expect(at(w, 31, 30)?.kind).toBe('tank');
  });
  it('まとめてずらすとき、もうないものだけを飛ばして、残りは動かす', () => {
    const w = newWorld();
    for (const x of [10, 11, 12]) place(w, 'belt', x, 10, 0);
    const es: Ent[] = [10, 11, 12].map((x) => at(w, x, 10)!);
    remove(w, 11, 10);
    const r = moveEnts(w, es, 0, 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.added.length).toBe(2);
    expect([10, 11, 12].map((x) => at(w, x, 12)?.kind ?? null)).toEqual(['belt', null, 'belt']);
  });
});

describe('ずらす：階はまたげない', () => {
  it('1 階の採取機を 2 階へずらせない', () => {
    const w = newWorld();
    expect(place(w, 'extractor', 50, 30, 0)).toBeNull();
    const r = moveEnts(w, [at(w, 50, 30)!], 0, FLOOR_DY - 6);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/階/);
    expect(at(w, 50, 30)?.kind).toBe('extractor');
    expect(at(w, 50, 24 + FLOOR_DY)).toBeUndefined();
  });
  it('昇降機の組を、ありもしない階へずらせない。同じ階の中なら組ごと動く', () => {
    const w = newWorld();
    expect(place(w, 'lift', 50, 30, 0)).toBeNull();
    const up = at(w, 50, 30 + FLOOR_DY)!;
    expect(moveEnts(w, [at(w, 50, 30)!], 0, FLOOR_DY - 6).ok).toBe(false);
    expect(moveEnts(w, [up], 0, FLOOR_DY).ok).toBe(false);
    expect([...w.ents.values()].filter((e) => e.kind === 'lift').map((e) => e.y).sort((a, b) => a - b)).toEqual([30, 30 + FLOOR_DY]);
    // 2 階の側をつかんでも、同じ階の中なら上下とも動く
    expect(moveEnts(w, [up], 2, 0).ok).toBe(true);
    const a = at(w, 52, 30)!;
    expect(a.kind).toBe('lift');
    expect(liftPartner(w, a)?.y).toBe(30 + FLOOR_DY);
    expect(w.ents.has(key(50, 30))).toBe(false);
  });
});
