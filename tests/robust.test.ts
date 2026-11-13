import { describe, expect, it } from 'vitest';
import { decodeBlueprint, encodeBlueprint } from '../src/engine/blueprint';
import { AGENTS } from '../src/content/ions';
import { WASHES } from '../src/content/extract';
import { CHAPTERS } from '../src/content/goals';
import { HUB_TILES } from '../src/content/map';
import { RECIPES, productsOf } from '../src/content/recipes';
import { TESTS } from '../src/content/samples';
import { hasSub } from '../src/content/substances';
import { at, configure, deserialize, layRail, newWorld, place, serialize, step, FLOOR_DY, type World } from '../src/engine/world';

const run = (w: World, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };
const forge = (o: unknown) => 'CHEMYTH-BP1:' + btoa(JSON.stringify(o));
const [hx, hy] = HUB_TILES[0];
/** 新しい工場のセーブを、書き換えられるように読んだもの */
const blank = () => JSON.parse(serialize(newWorld()));

describe('設計図の文字列を確かめる', () => {
  it('どのオブジェクトにもある名前（constructor など）は、設備の種類として受けつけない', () => {
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) expect(decodeBlueprint(forge({ n: 'x', s: [[k, 0, 0, 0]] })), k).toBeNull();
  });

  it('知らない物質、その設備では選べない設定、生成物でない出口は外して、設備は残す', () => {
    const bp = decodeBlueprint(forge({ n: 'gift', s: [
      ['depot', 0, 0, 0, 0, 0, 0, 0, 'zzz'],
      ['sampler', 1, 0, 0, 0, 0, 0, 0, 'set:A'],
      ['sampler', 2, 0, 0, 0, 0, 0, 0, 'set:ZZ'],
      ['belt', 3, 0, 0, 0, 0, 0, 'jam', 'NH3'],
      ['analyzer', 4, 0, 0, 0, 0, 0, 'is:zzz'],
      ['analyzer', 5, 0, 0, 0, 0, 0, TESTS[0].id],
      ['sensor', 6, 0, 0, 0, 0, 0, 'jam', 0, 3],
      ['gate', 7, 0, 0, 0, 0, 0, 'maybe'],
      ['settler', 8, 0, 0, 0, 0, 0, AGENTS[0].id],
      ['reactor', 10, 0, 0, 'haber-bosch', ['H2O']],
      ['reactor', 12, 0, 0, 'haber-bosch', ['NH3'], [7]],
      ['tank', 14, 0, 0, 0, 0, 0, 'hold', 'NaCl'],
    ] }))!;
    expect(bp.stamps.map((b) => [b.kind, b.sub, b.test, b.recipe, b.outSlot, b.ch])).toEqual([
      ['depot', undefined, undefined, undefined, undefined, undefined],
      ['sampler', 'set:A', undefined, undefined, undefined, undefined],
      ['sampler', undefined, undefined, undefined, undefined, undefined],
      ['belt', undefined, undefined, undefined, undefined, undefined],
      ['analyzer', undefined, undefined, undefined, undefined, undefined],
      ['analyzer', undefined, TESTS[0].id, undefined, undefined, undefined],
      ['sensor', undefined, 'jam', undefined, undefined, 3],
      ['gate', undefined, undefined, undefined, undefined, undefined],
      ['settler', undefined, AGENTS[0].id, undefined, undefined, undefined],
      ['reactor', undefined, undefined, undefined, undefined, undefined],
      ['reactor', undefined, undefined, 'haber-bosch', undefined, undefined],
      ['tank', 'NaCl', 'hold', undefined, undefined, undefined],
    ]);
  });

  it('ゲームが書き出した設計図は、そのまま読み戻せる', () => {
    const bat = RECIPES.find((r) => r.machine === 'battery')!, cell = RECIPES.find((r) => r.machine === 'electrolyzer')!;
    const stamps = [
      { kind: 'reactor' as const, dx: 0, dy: 0, dir: 1 as const, recipe: 'haber-bosch', outOrder: ['NH3'], outSlot: [2] },
      { kind: 'battery' as const, dx: 3, dy: 0, dir: 0 as const, recipe: bat.id, outOrder: ['e', ...productsOf(bat).map(([s]) => s)] },
      { kind: 'electrolyzer' as const, dx: 6, dy: 0, dir: 0 as const, recipe: cell.id, outOrder: productsOf(cell).map(([s]) => s) },
      { kind: 'sampler' as const, dx: 0, dy: 3, dir: 0 as const, sub: 'set:Q' },
      { kind: 'sampler' as const, dx: 1, dy: 3, dir: 0 as const, sub: 'NaCl' },
      { kind: 'depot' as const, dx: 2, dy: 3, dir: 0 as const, sub: 'NH3' },
      { kind: 'analyzer' as const, dx: 3, dy: 3, dir: 2 as const, test: 'is:NH3' },
      { kind: 'sensor' as const, dx: 4, dy: 3, dir: 0 as const, test: 'is:NH3', ch: 12 },
      { kind: 'gate' as const, dx: 5, dy: 3, dir: 0 as const, test: 'off', ch: 12 },
      { kind: 'funnel' as const, dx: 0, dy: 5, dir: 0 as const, test: WASHES[0].id },
      { kind: 'phoresis' as const, dx: 3, dy: 5, dir: 0 as const, test: '6' },
      { kind: 'station' as const, dx: 6, dy: 5, dir: 0 as const, ch: 4, role: 'out' as const },
    ];
    expect(decodeBlueprint(encodeBlueprint('いろいろ', stamps))!.stamps).toEqual(stamps);
  });

  it('保存しておいた設計図も、貼る前に確かめられる（前の版で読み込んだ、知らない物質の設定）', async () => {
    const { cleanStamp } = await import('../src/engine/blueprint');
    expect(cleanStamp({ kind: 'depot', dx: 0, dy: 0, dir: 0, sub: 'zzz' })).toEqual({ kind: 'depot', dx: 0, dy: 0, dir: 0 });
    expect(cleanStamp({ kind: 'constructor', dx: 0, dy: 0, dir: 0 })).toBeNull();
    // 並びに紛れた、表でない値
    for (const v of [null, undefined, 3, 'belt']) expect(cleanStamp(v as never), String(v)).toBeNull();
    // 自分で囲んだ範囲は、文字列の広さの上限（200 マス）を超えてもよい
    expect(cleanStamp({ kind: 'belt', dx: 500, dy: 0, dir: 1 })).toEqual({ kind: 'belt', dx: 500, dy: 0, dir: 1 });
  });
});

describe('セーブの読み込みを確かめる', () => {
  it('種類や位置のおかしい設備は捨て、知らない物質や形の合わない設定は外す', () => {
    const d = blank();
    d.ents.push(
      { kind: 'depot', x: 30, y: 30, dir: 0, sub: 'zzz', timer: 0, rr: 0 },
      { kind: 'constructor', x: 31, y: 30, dir: 0 },
      { kind: 'zzz', x: 32, y: 30, dir: 0 },
      { kind: 'belt', x: 33.5, y: 30, dir: 0, item: null },
      { kind: 'belt', x: '34', y: 30, dir: 0, item: null },
      { kind: 'sampler', x: 35, y: 30, dir: 9, sub: 'set:A', rr: 'x', timer: 0 },
      { kind: 'sampler', x: 36, y: 30, dir: 0, sub: 'set:ZZ' },
      { kind: 'analyzer', x: 37, y: 30, dir: 0, test: 'is:zzz', item: { s: 'zzz', p: 0, m: 0 } },
      { kind: 'tank', x: 30, y: 32, dir: 0, big: true, sub: 'zzz', cnt: 50, rcn: 0, ts: 'abc' },
      { kind: 'belt', x: 33, y: 32, dir: 0, item: { s: 'NaCl', p: 'x', m: 5, n: 'many' }, bad: 'zzz' },
      { kind: 'bridge', x: 34, y: 32, dir: 0, items: 7 },
      { kind: 'station', x: 36, y: 32, dir: 0, big: true, role: 'sideways', ch: 'x', buf: ['N2', '!H2', 'zzz', '!zzz', 3], tr: { p: 0.5, back: false, cargo: ['N2', 'zzz'], wait: 'x' } },
    );
    d.side = { s: 'NH3', n: 5, got: 0, ch: 999, reward: 10 };
    d.seen = 999;
    const w = deserialize(JSON.stringify(d))!;
    expect(w).not.toBeNull();
    expect(at(w, 30, 30)?.kind).toBe('depot');
    expect(at(w, 30, 30)!.sub).toBeUndefined();
    for (const x of [31, 32, 33, 34]) expect(at(w, x, 30), `x=${x}`).toBeUndefined();
    const smp = at(w, 35, 30)!;
    expect([smp.sub, smp.rr, smp.dir]).toEqual(['set:A', undefined, 0]);
    expect(at(w, 36, 30)!.sub).toBeUndefined();
    expect([at(w, 37, 30)!.test, at(w, 37, 30)!.item]).toEqual([undefined, null]);
    const tank = at(w, 30, 32)!;
    expect([tank.sub, tank.cnt, tank.ts]).toEqual([undefined, 0, undefined]);
    const belt = at(w, 33, 32)!;
    expect([belt.item, belt.bad]).toEqual([{ s: 'NaCl', p: 0, m: 0 }, undefined]);
    expect(at(w, 34, 32)!.items).toEqual([null, null]);
    const st = at(w, 36, 32)!;
    expect([st.role, st.ch, st.buf]).toEqual([undefined, 1, ['N2', '!H2']]);
    expect([st.tr!.cargo, st.tr!.wait]).toEqual([['N2'], 0]);
    expect(w.side!.ch).toBe(CHAPTERS.length - 1);
    expect(w.seen).toBe(CHAPTERS.length - 1);
    // 読み込んだ工場は、そのまま動かせる
    expect(() => run(w, 3)).not.toThrow();
  });

  it('順に回す番号（rr）が 0 以上の整数でなければ、0 から回し直す（口や行き先が引けずに止まらない）', () => {
    const d = blank();
    d.ents.push(
      // 試料の組を順に出す試薬棚
      { kind: 'sampler', x: 30, y: 30, dir: 0, sub: 'set:A', rr: 0.5, timer: 99 },
      { kind: 'sampler', x: 30, y: 31, dir: 0, sub: 'set:A', rr: -1, timer: 99 },
      // 積む駅（発車するときに行き先を順に選ぶ）と、降ろす駅
      { kind: 'station', x: 30, y: 40, dir: 0, big: true, role: 'in', ch: 2, rr: 1.5, buf: [], tr: { p: 0, back: false, cargo: ['NaCl'], wait: 9 } },
      { kind: 'station', x: 30, y: 50, dir: 0, big: true, role: 'out', ch: 2, rr: 0.5, buf: ['NaCl', 'NaCl'] },
      // 2 つの口から交互に出すタンク
      { kind: 'tank', x: 40, y: 40, dir: 0, big: true, sub: 'NaCl', cnt: 30, rcn: 0, rr: 0.5, timer: 0 },
    );
    for (let x = 31; x < 34; x++) d.ents.push({ kind: 'belt', x, y: 30, dir: 0, item: null }, { kind: 'belt', x, y: 31, dir: 0, item: null });
    const w = deserialize(JSON.stringify(d))!;
    expect(() => run(w, 3)).not.toThrow();
    const w0 = deserialize(JSON.stringify(d))!;
    expect([at(w0, 30, 30)!.rr, at(w0, 30, 31)!.rr, at(w0, 30, 40)!.rr, at(w0, 30, 50)!.rr, at(w0, 40, 40)!.rr]).toEqual([0, 0, 0, 0, 0]);
    // 試料の組は、組の物質を順に出している
    expect(at(w, 31, 30)!.item?.s ?? at(w, 32, 30)!.item?.s).toBeTruthy();
    // ふつうの番号は、そのまま読む
    const d2 = blank();
    d2.ents.push({ kind: 'splitter', x: 30, y: 30, dir: 0, rr: 2, item: null });
    expect(at(deserialize(JSON.stringify(d2))!, 30, 30)!.rr).toBe(2);
  });

  it('物質の id でないもの（文字でない値）を、物質かどうか調べても止まらない', () => {
    for (const v of [undefined, null, 3, {}, ['NaCl']]) expect(hasSub(v as never), String(v)).toBe(false);
    expect(hasSub('NaCl')).toBe(true);
  });

  it('出口の物質が反応の生成物でない装置は、反応の設定を外す（反応が終わったところで止まらない）', () => {
    const d = blank();
    d.ents.push({ kind: 'reactor', x: 20, y: 20, dir: 0, big: true, recipe: 'haber-bosch', outOrder: ['H2O'], outSlot: [0], inBuf: { N2: 9, H2: 9 }, outBuf: [0], busy: true, prog: 0.99 });
    const w = deserialize(JSON.stringify(d))!;
    expect(at(w, 20, 20)!.recipe).toBeUndefined();
    expect(() => run(w, 1)).not.toThrow();
  });

  it('表のはずの値が数や文字でも、読み込んだ工場で納品できる', () => {
    const d = blank();
    Object.assign(d, { delivered: 5, stock: 'abc', made: [1], vented: { zzz: 3, H2O: 'x', NaCl: 2 }, multi: 7, grades: 'S', playMs: 'x' });
    const w = deserialize(JSON.stringify(d))!;
    expect(w.vented).toEqual({ NaCl: 2 });
    place(w, 'belt', hx - 1, hy, 0);
    at(w, hx - 1, hy)!.item = { s: 'H2O', p: 0.99, m: -1 };
    expect(() => run(w, 1)).not.toThrow();
    expect(w.delivered.H2O).toBe(1);
    expect(w.playMs).toBeGreaterThanOrEqual(0);
  });

  it('古いセーブの駅の線路：長すぎるものは移さない', () => {
    const d = blank();
    delete d.rails;
    d.ents.push({ kind: 'station', x: 10, y: 10, dir: 0, big: true, role: 'in', ch: 1, buf: [], rail: [[10.5, 10.5], [10.5, 1e6]] },
      { kind: 'station', x: 14, y: 10, dir: 0, big: true, role: 'in', ch: 2, buf: [], rail: [[14.5, 10.5], [14.5, 40.5]] });
    const w = deserialize(JSON.stringify(d))!;
    expect(w.rails.size).toBe(31);   // ふつうの長さの線路だけが移る
  });

  it('古いセーブの駅の線路：角が数でなくても、止まらずに読み終える', () => {
    const d = blank();
    delete d.rails;
    d.ents.push({ kind: 'station', x: 10, y: 10, dir: 0, big: true, role: 'in', ch: 1, buf: [], rail: [[10.5, 10.5], ['x', 40]] });
    const w = deserialize(JSON.stringify(d))!;
    expect(w.rails.size).toBe(0);
    expect(at(w, 10, 10)!.rail).toBeUndefined();
    // 整数でない角は、敷かずに飛ばす
    layRail(w, [[0, 0], [0.5, 3], [NaN, 0]]);
    expect(w.rails.size).toBe(0);
  });

  it('ゲームが作ったセーブは、読み込みで何も失わない', () => {
    const w = newWorld();
    const conf = (x: number, y: number, kind: Parameters<typeof place>[1], dir: 0 | 1 | 2 | 3, f?: (e: NonNullable<ReturnType<typeof at>>) => void) => { expect(place(w, kind, x, y, dir)).toBeNull(); f?.(at(w, x, y)!); };
    // 試薬棚 → ベルト → 検知器 → 分析器 → 納品所。弁・立体交差・分配器・地下ベルトも通す
    conf(hx - 9, hy, 'sampler', 0, (e) => { e.sub = 'NaCl'; });
    for (let x = hx - 8; x < hx - 1; x++) conf(x, hy, 'belt', 0);
    w.ents.delete(`${hx - 6},${hy}`); conf(hx - 6, hy, 'sensor', 0, (e) => { e.test = 'is:NaCl'; e.ch = 7; });
    w.ents.delete(`${hx - 5},${hy}`); conf(hx - 5, hy, 'gate', 0, (e) => { e.test = 'off'; e.ch = 3; });
    w.ents.delete(`${hx - 4},${hy}`); conf(hx - 4, hy, 'bridge', 0);
    w.ents.delete(`${hx - 3},${hy}`); conf(hx - 3, hy, 'analyzer', 0, (e) => { e.test = TESTS[0].id; });
    conf(hx - 1, hy, 'belt', 0);
    conf(hx - 9, hy + 2, 'sampler', 0, (e) => { e.sub = 'set:A'; });
    conf(hx - 8, hy + 2, 'tunnel', 0); conf(hx - 5, hy + 2, 'tunnel', 0);
    conf(hx - 4, hy + 2, 'splitter', 0); conf(hx - 3, hy + 2, 'vent', 0);
    conf(hx - 9, hy + 4, 'depot', 0, (e) => { e.sub = 'NaCl'; });
    conf(hx - 8, hy + 4, 'tank', 0, (e) => { e.test = 'hold'; });
    w.stock.NaCl = 30;
    // 装置
    const bat = RECIPES.find((r) => r.machine === 'battery')!, cell = RECIPES.find((r) => r.machine === 'electrolyzer')!;
    conf(10, 10, 'reactor', 0, (e) => { configure(e, RECIPES.find((r) => r.id === 'haber-bosch')!, ['NH3']); e.inBuf = { N2: 3, H2: 7 }; e.memo = 'NH₃ 1 号'; });
    conf(13, 10, 'battery', 0, (e) => configure(e, bat, productsOf(bat).map(([s]) => s)));
    conf(16, 10, 'electrolyzer', 0, (e) => { configure(e, cell, productsOf(cell).map(([s]) => s)); e.off = true; });
    conf(10, 13, 'settler', 0, (e) => { e.test = AGENTS[0].id; e.buf = ['AgCl']; });
    conf(13, 13, 'funnel', 0, (e) => { e.test = WASHES[0].id; });
    conf(16, 13, 'phoresis', 0, (e) => { e.test = '6'; });
    conf(10, 16, 'station', 0, (e) => { e.buf = ['N2', '!H2']; e.ch = 9; e.cars = 2; e.tr = { p: 0.25, back: false, cargo: ['N2', '!N2'], wait: 1.5, to: '10,22' }; });
    conf(10, 22, 'station', 0, (e) => { e.role = 'out'; e.ch = 9; });
    conf(20, 16, 'lift', 0);
    conf(20, 17 + FLOOR_DY, 'belt', 1);
    conf(25, 25, 'extractor', 0);
    run(w, 12);
    const j = serialize(w);
    // 読み込みでもともと決まっている直し（納品所を置き直すので並び順が変わる。荷の tick と、列車の待ち合わせは、読み込むたびに消す）だけを合わせて比べる
    const norm = (s: string) => {
      const d = JSON.parse(s);
      delete d.savedAt;
      d.ents.sort((a: { x: number; y: number }, b: { x: number; y: number }) => a.x - b.x || a.y - b.y);
      for (const e of d.ents) {
        if (e.item) e.item.m = 0;
        if (e.items) e.items = e.items.map((it: { m: number } | null) => it && { ...it, m: 0 });
        for (const t of [e.tr, ...(e.xtr ?? [])]) if (t) delete t.held;
      }
      return d;
    };
    expect(norm(serialize(deserialize(j)!))).toEqual(norm(j));
  });
});
