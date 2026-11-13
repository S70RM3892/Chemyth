import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUB_TILES } from '../src/content/map';
import { CHAPTERS } from '../src/content/goals';
import { RECIPES } from '../src/content/recipes';
import { at, learn, newWorld, place, step, type World } from '../src/engine/world';
import { BP_MAX, encodeBlueprint, type Stamp } from '../src/engine/blueprint';
import { SHELF_MAX, checkShelf, cleanShelf, makeBackup, mergeShelf, parseBackup, restorePlan, type Shelf } from '../src/engine/backup';

const rec = (id: string) => RECIPES.find((r) => r.id === id)!;

describe('設計図の棚（ファイルからの読み込み）', () => {
  const good: Shelf = { name: 'アンモニアの列', stamps: [
    { kind: 'reactor', dx: 0, dy: 0, dir: 1, recipe: 'haber-bosch', outOrder: ['NH3'], outSlot: [2] },
    { kind: 'belt', dx: 2, dy: 0, dir: 0 },
    { kind: 'station', dx: 0, dy: 3, dir: 0, ch: 4, role: 'out' },
  ] };

  it('正しい設計図は、そのまま通る', () => {
    expect(checkShelf(good)).toEqual(good);
  });

  it('壊れた設計図は外す（棚が開かなくなるもの・置けない種類・形の違うもの）', () => {
    const bad: unknown[] = [
      null, 3, 'x', {}, { name: 'x' }, { name: 'x', stamps: [] }, { name: 'x', stamps: 'belt' },
      { name: 'x', stamps: [{ kind: 'hub', dx: 0, dy: 0, dir: 0 }] },
      { name: 'x', stamps: [{ kind: 'part', dx: 0, dy: 0, dir: 0 }] },
      { name: 'x', stamps: [null] },
      { name: 'x', stamps: [{ kind: 'belt', dx: -1, dy: 0, dir: 0 }] },
      { name: 'x', stamps: [{ kind: 'belt', dx: 0, dy: 0, dir: 9 }] },
      { name: 'x', stamps: [{ kind: 'belt', dx: 0.5, dy: 0, dir: 0 }] },
      { name: 5, stamps: good.stamps },
    ];
    const r = cleanShelf([good, ...bad]);
    expect(r.list).toEqual([good]);
    expect(r.dropped).toBe(bad.length);
    expect(cleanShelf('nope')).toEqual({ list: [], dropped: 0 });
  });

  it('知らない反応の設定は外して、設備は残す（文字列での受け渡しと同じ）', () => {
    const b = checkShelf({ name: '', stamps: [{ kind: 'reactor', dx: 0, dy: 0, dir: 0, recipe: 'no-such', outOrder: ['NH3'] }] })!;
    expect(b.stamps[0]).toEqual({ kind: 'reactor', dx: 0, dy: 0, dir: 0 });
    expect(b.name).toBe('受け取った設計図');
  });

  it('文字列で渡せる数を超える大きな設計図も、棚からは消さない', () => {
    const many: Stamp[] = Array.from({ length: BP_MAX + 300 }, (_, i) => ({ kind: 'belt', dx: i % 80, dy: Math.floor(i / 80), dir: (i % 4) as 0 | 1 | 2 | 3 }));
    const b = checkShelf({ name: '工場まるごと', stamps: many })!;
    expect(b.stamps.length).toBe(many.length);
    expect(b.stamps).toEqual(many);
  });

  it('文字列で渡せる広さ（200 マス）を超える設計図も、棚からは消さない（引いて「画面全体」で囲んだもの）', () => {
    const wide: Shelf = { name: '設計図 1：3 個', stamps: [
      { kind: 'belt', dx: 0, dy: 0, dir: 0 },
      { kind: 'belt', dx: 250, dy: 0, dir: 0 },
      { kind: 'reactor', dx: 3, dy: 250, dir: 1, recipe: 'haber-bosch', outOrder: ['NH3'], outSlot: [2] },
      { kind: 'station', dx: 780, dy: 540, dir: 0, ch: 4, role: 'out' },
    ] };
    expect(checkShelf(wide)).toEqual(wide);
    expect(cleanShelf([wide, good])).toEqual({ list: [wide, good], dropped: 0 });
    // 位置の形がおかしいものは、広さに関わらず外す
    expect(checkShelf({ name: 'x', stamps: [{ kind: 'belt', dx: 250.5, dy: 0, dir: 0 }] })).toBeNull();
    expect(checkShelf({ name: 'x', stamps: [{ kind: 'belt', dx: 0, dy: -250, dir: 0 }] })).toBeNull();
    expect(checkShelf({ name: 'x', stamps: [{ kind: 'belt', dx: '250', dy: 0, dir: 0 }] })).toBeNull();
    expect(checkShelf({ name: 'x', stamps: [{ kind: 'belt', dx: Infinity, dy: 0, dir: 0 }] })).toBeNull();
    // 大きくて広いもの（BP_MAX を超え、BP_SPAN も超える）
    const big: Stamp[] = Array.from({ length: BP_MAX + 10 }, (_, i) => ({ kind: 'belt', dx: i % 400, dy: Math.floor(i / 400) * 90, dir: 0 }));
    expect(checkShelf({ name: 'big', stamps: big })!.stamps).toEqual(big);
  });

  it('棚の名前は、文字列で渡すときの 30 文字に切らない（自動でつく名前は長くなる）', () => {
    const name = '設計図 12：' + '硫酸銅（Ⅱ）水溶液の電気分解'.padEnd(33, 'あ');
    expect(name.length).toBe(40);
    const b: Shelf = { name, stamps: [{ kind: 'belt', dx: 0, dy: 0, dir: 0 }] };
    expect(checkShelf(b)).toEqual(b);
    expect(checkShelf({ ...b, name: '  my bp  ' })!.name).toBe('my bp');
    expect(checkShelf({ ...b, name: '   ' })!.name).toBe('受け取った設計図');
    // 前の版で書き出したファイル（長い名前のまま）を読み込んでも、同じものとして足さない
    expect(mergeShelf([checkShelf(b)!], cleanShelf([b]).list).added).toBe(0);
  });

  it('読み込んだ設計図は、いまの棚に足す（消さない・同じものは足さない・あふれる分は足さない）', () => {
    const mine: Shelf = { name: 'my bp', stamps: [{ kind: 'belt', dx: 0, dy: 0, dir: 0 }] };
    // 何も入っていないファイル：いまの棚はそのまま
    expect(mergeShelf([mine], [])).toEqual({ list: [mine], added: 0, full: 0 });
    // 同じものは足さない。新しいものは先頭へ
    const r = mergeShelf([mine], [{ ...mine }, good]);
    expect(r.list).toEqual([good, mine]);
    expect(r.added).toBe(1);
    // 名前が同じでも、中身が違えば両方残す
    const other: Shelf = { name: 'my bp', stamps: [{ kind: 'belt', dx: 0, dy: 0, dir: 2 }] };
    expect(mergeShelf([mine], [other]).list).toEqual([other, mine]);
    // 棚がいっぱいなら、いまの棚は 1 つも落とさない
    const full = Array.from({ length: SHELF_MAX }, (_, i) => ({ name: `bp ${i}`, stamps: mine.stamps }));
    const f = mergeShelf(full, [good, other]);
    expect(f.list).toEqual(full);
    expect(f.added).toBe(0);
    expect(f.full).toBe(2);
  });
});

describe('読み込む前の控え', () => {
  const A = '{"v":2,"a":1}', B = '{"v":2,"b":1}', C = '{"v":2,"c":1}';

  it('置き換えた枠だけを控え、戻すときも、その枠だけを戻す', () => {
    // 1 冊目だけを読み込んだ。2・3 冊目は、あとから遊んだり作ったりした
    const b = parseBackup(makeBackup(123, { 1: A }))!;
    expect(b).toEqual({ at: 123, slots: { 1: A } });
    const now: Record<number, string | null> = { 1: 'imported', 2: 'played later', 3: 'made later' };
    expect(restorePlan(b, (n) => now[n])).toEqual([{ n: 1, json: A }]);
  });

  it('読み込む前は空だった枠は、戻すと消える。いまの中身が控えと同じ枠は、戻す物に入れない', () => {
    const b = parseBackup(makeBackup(5, { 1: A, 3: null }))!;
    expect(restorePlan(b, (n) => ({ 1: 'x', 2: B, 3: 'y' } as Record<number, string>)[n])).toEqual([{ n: 1, json: A }, { n: 3, json: null }]);
    // 書き込めなかった枠（中身が控えのまま）は戻さない
    expect(restorePlan(b, (n) => ({ 1: A, 3: 'y' } as Record<number, string>)[n] ?? null)).toEqual([{ n: 3, json: null }]);
  });

  it('前の版の控え（3 冊ぶん）も読める。日付は分からない', () => {
    const b = parseBackup(JSON.stringify({ 1: A, 2: B, 3: null }))!;
    expect(b).toEqual({ at: 0, slots: { 1: A, 2: B, 3: null } });
    // 変わっていない枠は戻さない
    expect(restorePlan(b, (n) => ({ 1: A, 2: C, 3: null } as Record<number, string | null>)[n])).toEqual([{ n: 2, json: B }]);
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup('broken')).toBeNull();
    expect(parseBackup('{}')).toBeNull();
    expect(parseBackup('{"v":2,"at":1,"slots":{"1":5}}')).toBeNull();
  });
});

describe('課題の工場で得た学習の研究点', () => {
  it('課題の工場で、初めて反応を正しく設定したときの研究点は、本編の工場に入る', () => {
    const home = newWorld(), w = newWorld();
    w.learned = home.learned; w.srs = home.srs; w.discovered = home.discovered;
    w.bank = home;
    expect(learn(w, rec('haber-bosch'), true)).toBe(15);
    expect(home.points).toBe(15);
    expect(w.points).toBe(0);
    // 覚えた印は共有なので、もう一度はもらえない
    expect(learn(home, rec('haber-bosch'), true)).toBe(0);
  });
  it('本編の工場では、これまでどおり自分に入る', () => {
    const w = newWorld();
    learn(w, rec('haber-bosch'), false);
    expect(w.points).toBe(8);
  });
});

describe('違う物質の納品（仕分けの指令）', () => {
  afterEach(() => { vi.useRealTimers(); });
  const strictWorld = (): World => {
    const w = newWorld();
    const ci = CHAPTERS.findIndex((c) => c.goals.some((g) => g.strict === 'G' && g.s === 'x-Ag'));
    w.chapter = ci; w.seen = ci;
    w.progress[ci] = CHAPTERS[ci].goals.findIndex((g) => g.strict === 'G' && g.s === 'x-Ag');
    w.counts[ci] = 40;
    const [hx, hy] = HUB_TILES[0];
    place(w, 'belt', hx - 1, hy, 0);
    return w;
  };
  const drop = (w: World, n: number) => {
    const [hx, hy] = HUB_TILES[0];
    at(w, hx - 1, hy)!.item = { s: 'x-Cu', p: 1, m: 0, n };
    for (let i = 0; i < 4; i++) step(w, 1 / 60);
  };

  it('ひと山（10 個）が届くと、減点は 1 個ずつ、間違いの記録と知らせは 1 回', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 12, 15, 0));
    const w = strictWorld();
    drop(w, 10);
    expect(w.counts[w.chapter]).toBe(20);
    expect(w.mistakes.filter((m) => m.part === 'isomer').length).toBe(1);
    expect(w.events.filter((e) => e === 'wrong-sample').length).toBe(1);
  });

  it('同じ仕分けの誤りが続く間は、記録を 1 件にまとめる（ほかの間違いの記録を押し出さない）', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 12, 15, 0));
    const w = strictWorld();
    w.mistakes.push({ machine: 'reactor', recipe: 'haber-bosch', part: 'products', t: Date.now() - 1000 });
    for (let i = 0; i < 300; i++) { vi.setSystemTime(new Date(2026, 10, 12, 15, 0, i * 20)); drop(w, 1); w.counts[w.chapter] = 40; }
    expect(w.mistakes.length).toBe(2);
    expect(w.mistakes[0].recipe).toBe('haber-bosch');
    expect(w.mistakes[1].t).toBe(new Date(2026, 10, 12, 15, 0, 299 * 20).getTime());
    // 間が空けば、別の記録になる
    vi.setSystemTime(new Date(2026, 10, 12, 18, 0));
    drop(w, 1);
    expect(w.mistakes.length).toBe(3);
  });
});

describe('設計図の文字列とのつながり', () => {
  it('棚の検査は、文字列での受け渡しと同じ結果になる', () => {
    const t = encodeBlueprint('x', [{ kind: 'belt', dx: 0, dy: 0, dir: 0 }]);
    expect(t.startsWith('CHEMYTH-BP1:')).toBe(true);
    expect(checkShelf({ name: 'x', stamps: [{ kind: 'belt', dx: 0, dy: 0, dir: 0, junk: 1 }] })).toEqual({ name: 'x', stamps: [{ kind: 'belt', dx: 0, dy: 0, dir: 0 }] });
  });
});
