import { describe, expect, it } from 'vitest';
import { isBalanced, normalizeFormula, parseFormula } from '../src/chem/formula';
import { CONDITIONS, RECIPES } from '../src/content/recipes';
import { sub, SUBSTANCES } from '../src/content/substances';
import { GOALS, HUB_TILES } from '../src/content/map';
import { at, configure, judge, newWorld, place, step } from '../src/engine/world';

describe('化学式', () => {
  it('括弧と下付き数字を読める', () => {
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula('Fe₃O₄')).toEqual({ Fe: 3, O: 4 });
    expect(normalizeFormula(' ＮＨ３ ')).toBe('NH3');
  });
  it('読めない式は例外', () => {
    expect(() => parseFormula('nh3')).toThrow();
  });
});

describe('内容データ', () => {
  it('物質の id が重複しない', () => {
    expect(new Set(SUBSTANCES.map((s) => s.id)).size).toBe(SUBSTANCES.length);
  });
  for (const r of RECIPES) {
    it(`${r.name}：登場物質が定義済みで、正解の条件が選択肢にある`, () => {
      for (const [s] of [...r.inputs, ...r.outputs]) expect(() => sub(s)).not.toThrow();
      for (const a of r.accept) expect(CONDITIONS[r.machine].options).toContain(a);
      expect(r.source).not.toBe('');
    });
    if (!r.separation) {
      it(`${r.name}：原子数の収支が合う`, () => {
        const f = (side: [string, number][]) => side.map(([s, n]) => [sub(s).formula!, n] as [string, number]);
        expect(isBalanced(f(r.inputs), f(r.outputs))).toBe(true);
      });
    }
  }
  it('納品目標の物質は作れる', () => {
    const makeable = new Set(RECIPES.flatMap((r) => r.outputs.map(([s]) => s)));
    for (const g of GOALS) expect(makeable.has(g.s)).toBe(true);
  });
});

describe('採点', () => {
  const haber = { reactants: [['N2', 1], ['H2', 3]] as [string, number][], products: [['NH3', 2]] as [string, number][], condition: 'Fe₃O₄' };
  it('正しい設定は通る', () => {
    expect(judge('reactor', haber).ok).toBe(true);
  });
  it('係数・触媒・生成物の誤りを区別する', () => {
    const v = (a: typeof haber) => { const r = judge('reactor', a); return r.ok ? 'ok' : r.part; };
    expect(v({ ...haber, reactants: [['N2', 1], ['H2', 2]] })).toBe('coefficients');
    expect(v({ ...haber, condition: 'Pt' })).toBe('condition');
    expect(v({ ...haber, products: [['N2H4', 1]] })).toBe('products');
    expect(v({ ...haber, reactants: [['N2', 1]] })).toBe('reactants');
  });
  it('電解槽は陰極と陽極の取り違えを見抜く', () => {
    const r = judge('electrolyzer', { reactants: [['H2O', 2]], products: [['O2', 1], ['H2', 2]], condition: 'NaOH' });
    expect(r.ok ? 'ok' : r.part).toBe('electrodes');
    const s = judge('electrolyzer', { reactants: [['H2O', 2]], products: [['H2', 2], ['O2', 1]], condition: 'NaCl' });
    expect(s.ok ? 'ok' : s.part).toBe('condition');
  });
});

describe('工場の動作', () => {
  const [hx, hy] = HUB_TILES[0];
  const run = (w: ReturnType<typeof newWorld>, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };

  it('反応器は 1:3 で消費して 2 を出し、ハブに届く', () => {
    const w = newWorld();
    w.goal = 2;
    expect(place(w, 'reactor', hx - 1, hy, 0)).toBeNull();
    const e = at(w, hx - 1, hy)!;
    configure(e, RECIPES.find((r) => r.id === 'haber-bosch')!, ['NH3']);
    e.inBuf = { N2: 1, H2: 3 };
    run(w, 4);
    expect(w.delivered.NH3).toBe(2);
    expect(w.count).toBe(2);
    expect(e.inBuf).toEqual({ N2: 0, H2: 0 });
  });

  it('副生成物の出口がないと詰まる', () => {
    const w = newWorld();
    place(w, 'electrolyzer', hx - 1, hy, 0);
    const e = at(w, hx - 1, hy)!;
    configure(e, RECIPES.find((r) => r.id === 'water-electrolysis')!, ['H2', 'O2']);
    e.inBuf = { H2O: 4 };
    run(w, 10);
    expect(w.delivered.H2).toBe(2);
    expect(e.inBuf.H2O).toBe(2);
    // 放出口をつなぐと再開する
    const d = [hx - 1, hy + 1] as const;
    place(w, 'vent', d[0], d[1], 0);
    run(w, 5);
    expect(w.delivered.H2).toBe(4);
  });

  it('海の採取機→ベルト→電解槽がつながる', () => {
    const w = newWorld();
    expect(place(w, 'extractor', 10, 10, 0)).not.toBeNull();
    expect(place(w, 'extractor', 1, 5, 0)).toBeNull();
    place(w, 'belt', 2, 5, 0);
    place(w, 'electrolyzer', 3, 5, 0);
    place(w, 'vent', 4, 5, 0);
    place(w, 'vent', 3, 6, 0);
    configure(at(w, 3, 5)!, RECIPES.find((r) => r.id === 'water-electrolysis')!, ['H2', 'O2']);
    run(w, 10);
    expect(w.discovered).toContain('H2');
  });
});
