import { describe, expect, it } from 'vitest';
import { isBalanced, normalizeFormula, parseFormula } from '../src/chem/formula';
import { CONDITIONS, RECIPES, productsOf } from '../src/content/recipes';
import { sub, subByFormula, sameAtoms, SUBSTANCES } from '../src/content/substances';
import { element, ELEMENTS } from '../src/content/elements';
import { HUB_TILES, MAP_H, MAP_W, ZONES, zoneAt, type Zone } from '../src/content/map';
import { GOALS, CHAPTERS, chapterOf } from '../src/content/goals';
import { QUESTIONS, isCorrect } from '../src/content/questions';
import { MACHINES } from '../src/content/machines';
import { at, autoDir, configure, deserialize, judge, newWorld, place, serialize, step, type Answer } from '../src/engine/world';

const rec = (id: string) => RECIPES.find((r) => r.id === id)!;

describe('化学式', () => {
  it('括弧と下付き数字を読める', () => {
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula('Fe₃O₄')).toEqual({ Fe: 3, O: 4 });
    expect(parseFormula('C6H4(OCOCH3)COOH')).toEqual({ C: 9, H: 8, O: 4 });
    expect(normalizeFormula(' ＮＨ３ ')).toBe('NH3');
  });
  it('読めない式は例外', () => {
    expect(() => parseFormula('nh3')).toThrow();
  });
  it('示性式の表記ゆれは認め、分子式だけでは認めない', () => {
    expect(subByFormula('CH3CH2OH')?.id).toBe('C2H5OH');
    expect(subByFormula('C2H6O')).toBeNull();
    expect(sameAtoms('C2H6O')).toBe(true);
  });
});

describe('内容データ', () => {
  it('物質の id と表記が重複しない', () => {
    expect(new Set(SUBSTANCES.map((s) => s.id)).size).toBe(SUBSTANCES.length);
    const texts = SUBSTANCES.flatMap((s) => [s.formula, ...(s.aliases ?? [])].filter(Boolean));
    expect(new Set(texts).size).toBe(texts.length);
  });
  it('すべての物質が元素の形で描ける', () => {
    for (const s of SUBSTANCES) for (const sym of s.rep ?? Object.keys(parseFormula(s.formula!))) expect(() => element(sym)).not.toThrow();
    expect(new Set(ELEMENTS.map((e) => e.d)).size).toBe(ELEMENTS.length);
  });
  it('反応の id が重複しない', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  for (const r of RECIPES) {
    it(`${r.name}：定義済みの物質だけを使い、正解の条件が選択肢にあり、出口は 3 つまで`, () => {
      for (const [s] of [...r.inputs, ...r.outputs]) expect(() => sub(s)).not.toThrow();
      for (const a of r.accept) expect(CONDITIONS[r.machine].options).toContain(a);
      expect(r.outputs.length).toBeLessThanOrEqual(3);
      expect(r.source).not.toBe('');
      if (r.machine === 'battery') { expect(r.outputs[0][0]).toBe('e'); expect(r.inputs.map(([s]) => s)).toContain(r.neg); expect(r.inputs.map(([s]) => s)).toContain(r.pos); }
    });
    if (!r.loose) {
      it(`${r.name}：原子数の収支が合う`, () => {
        const f = (side: [string, number][]) => side.map(([s, n]) => [sub(s).formula!, n] as [string, number]);
        expect(isBalanced(f(r.inputs), f(productsOf(r)))).toBe(true);
      });
    }
  }
  it('同じ装置・同じ原料・同じ生成物の反応が二重にない', () => {
    const sig = RECIPES.map((r) => `${r.machine}|${r.inputs.map(([s]) => s).sort()}|${productsOf(r).map(([s]) => s).sort()}`);
    expect(new Set(sig).size).toBe(sig.length);
  });
  it('すべての指令の物質は、天然の産出物から順にたどって作れる', () => {
    const have = new Set<string>(['air', ...Object.values(ZONES).map((z) => z.resource)]);
    for (let grew = true; grew;) {
      grew = false;
      for (const r of RECIPES) {
        if (!r.inputs.every(([s]) => have.has(s))) continue;
        for (const [s] of r.outputs) if (!have.has(s)) { have.add(s); grew = true; }
      }
    }
    for (const g of GOALS) expect(have.has(g.s), g.s).toBe(true);
    // 使われない反応がない
    for (const r of RECIPES) expect(r.inputs.every(([s]) => have.has(s)), r.id).toBe(true);
  });
  it('章と指令の対応', () => {
    expect(GOALS.length).toBe(CHAPTERS.reduce((a, c) => a + c.goals.length, 0));
    expect(chapterOf(0)?.name).toContain('第1章');
    expect(chapterOf(GOALS.length - 1)?.name).toContain('第7章');
    expect(chapterOf(GOALS.length)).toBeNull();
    expect(GOALS[MACHINES.battery.unlock].s).toBe('e');
  });
  it('計算問題の id が重複せず、答えは許容誤差つきで判定される', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    const q = QUESTIONS.find((x) => x.id === 'elec-1')!;
    expect(isCorrect(q, 3.2)).toBe(true);
    expect(isCorrect(q, 3.5)).toBe(false);
    expect(isCorrect(QUESTIONS.find((x) => x.id === 'heat-2')!, 111)).toBe(false);
  });
});

describe('地図', () => {
  it('すべての資源地が地図上にあり、納品所や互いに重ならない', () => {
    const count: Record<string, number> = {};
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) { const z = zoneAt(x, y); if (z) count[z] = (count[z] || 0) + 1; }
    for (const z of Object.keys(ZONES)) expect(count[z], z).toBeGreaterThan(8);
    for (const [x, y] of HUB_TILES) expect(zoneAt(x, y)).toBeNull();
    for (const z of Object.keys(ZONES) as Zone[]) { const [cx, cy] = ZONES[z].at; expect(zoneAt(Math.floor(cx), Math.floor(cy)), z).toBe(z); }
  });
});

describe('採点', () => {
  const haber: Answer = { reactants: [['N2', 1], ['H2', 3]], products: [['NH3', 2]], condition: 'Fe₃O₄' };
  const v = (m: Parameters<typeof judge>[0], a: Answer) => { const r = judge(m, a); return r.ok ? r.recipe.id : r.part; };
  it('正しい設定は通る', () => {
    expect(v('reactor', haber)).toBe('haber-bosch');
  });
  it('係数・触媒・生成物・原料の誤りを区別する', () => {
    expect(v('reactor', { ...haber, reactants: [['N2', 1], ['H2', 2]] })).toBe('coefficients');
    expect(v('reactor', { ...haber, condition: 'Pt' })).toBe('condition');
    expect(v('reactor', { ...haber, products: [[null, 1]] })).toBe('products');
    expect(v('reactor', { ...haber, reactants: [['N2', 1]] })).toBe('reactants');
  });
  it('電解槽は陰極と陽極の取り違えを見抜く', () => {
    expect(v('electrolyzer', { reactants: [['H2O', 2]], products: [['O2', 1], ['H2', 2]], condition: '水 + NaOH' })).toBe('electrodes');
    expect(v('electrolyzer', { reactants: [['H2O', 2]], products: [['H2', 2], ['O2', 1]], condition: '水のみ' })).toBe('condition');
    expect(v('electrolyzer', { reactants: [['NaCl', 2], ['H2O', 2]], products: [['H2', 1], ['Cl2', 1], ['NaOH', 2]], condition: '飽和食塩水（陽イオン交換膜）' })).toBe('brine-electrolysis');
    expect(v('electrolyzer', { reactants: [['NaCl', 2]], products: [['Na', 2], ['Cl2', 1]], condition: '融解塩（水なし）' })).toBe('molten-nacl');
  });
  it('同じ原料でも生成物で反応を見分ける（エタノールの脱水）', () => {
    expect(v('reactor', { reactants: [['C2H5OH', 2]], products: [['C2H5OC2H5', 1], ['H2O', 1]], condition: '濃硫酸 130〜140 ℃' })).toBe('ether');
    expect(v('reactor', { reactants: [['C2H5OH', 1]], products: [['C2H4', 1], ['H2O', 1]], condition: '濃硫酸 160〜170 ℃' })).toBe('ethanol-dehydration');
    expect(v('reactor', { reactants: [['C2H5OH', 1]], products: [['C2H4', 1], ['H2O', 1]], condition: '濃硫酸 130〜140 ℃' })).toBe('condition');
  });
  it('電池は負極・正極・電子の数を問う', () => {
    const lead: Answer = { reactants: [['Pb', 1], ['PbO2', 1], ['H2SO4', 2]], products: [['PbSO4', 2], ['H2O', 2]], condition: '希硫酸', neg: 'Pb', pos: 'PbO2', electrons: 2 };
    expect(v('battery', lead)).toBe('lead-acid');
    expect(v('battery', { ...lead, neg: 'PbO2', pos: 'Pb' })).toBe('electrodes');
    expect(v('battery', { ...lead, electrons: 4 })).toBe('electrons');
  });
  it('係数を問わない反応もある（分離・高分子）', () => {
    expect(v('separator', { reactants: [['air', 1]], products: [['O2', 1], ['N2', 1]], condition: '分留' })).toBe('air-distillation');
    expect(v('separator', { reactants: [['seawater', 1]], products: [['H2O', 1], ['NaCl', 1]], condition: '分留' })).toBe('condition');
    expect(v('reactor', { reactants: [['C2H4', 1]], products: [['PE', 1]], condition: '付加重合' })).toBe('polyethylene');
  });
});

describe('工場の動作', () => {
  const [hx, hy] = HUB_TILES[0];
  const run = (w: ReturnType<typeof newWorld>, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };

  it('反応器は 1:3 で消費して 2 を出し、納品所に届いて点が入る', () => {
    const w = newWorld();
    w.goal = 2;
    expect(place(w, 'reactor', hx - 1, hy, 0)).toBeNull();
    const e = at(w, hx - 1, hy)!;
    configure(e, rec('haber-bosch'), ['NH3']);
    e.inBuf = { N2: 1, H2: 3 };
    run(w, 4);
    expect(w.delivered.NH3).toBe(2);
    expect(w.count).toBe(2);
    expect(w.points).toBe(2);
    expect(w.stock.NH3).toBe(2);
  });

  it('副生成物の出口がないと詰まり、廃棄口をつなぐと再開する', () => {
    const w = newWorld();
    place(w, 'electrolyzer', hx - 1, hy, 0);
    const e = at(w, hx - 1, hy)!;
    configure(e, rec('water-electrolysis'), ['H2', 'O2']);
    e.inBuf = { H2O: 4 };
    run(w, 10);
    expect(w.delivered.H2).toBe(2);
    place(w, 'vent', hx - 1, hy + 1, 0);
    run(w, 5);
    expect(w.delivered.H2).toBe(4);
  });

  it('空気は陸地のどこでも採れ、海では海水が採れる', () => {
    const w = newWorld();
    expect(place(w, 'extractor', 30, 30, 0)).toBeNull();
    place(w, 'separator', 31, 30, 0);
    place(w, 'vent', 31, 31, 0);
    place(w, 'vent', 32, 30, 0);
    configure(at(w, 31, 30)!, rec('air-distillation'), ['N2', 'O2']);
    place(w, 'extractor', 1, 20, 0);
    place(w, 'separator', 2, 20, 0);
    place(w, 'vent', 2, 21, 0);
    place(w, 'vent', 3, 20, 0);
    configure(at(w, 2, 20)!, rec('seawater-distillation'), ['H2O', 'NaCl']);
    run(w, 12);
    expect(w.discovered).toEqual(expect.arrayContaining(['N2', 'O2', 'H2O', 'NaCl']));
  });

  it('入れすぎた原料はあふれて捨てられ、ベルトは詰まらない', () => {
    const w = newWorld();
    place(w, 'reactor', 30, 30, 0);
    configure(at(w, 30, 30)!, rec('haber-bosch'), ['NH3']);
    place(w, 'belt', 29, 30, 0);
    for (let i = 0; i < 20; i++) { at(w, 29, 30)!.item = { s: 'N2', p: 1, m: 0 }; run(w, 0.1); }
    expect(at(w, 29, 30)!.item).toBeNull();
    expect(at(w, 30, 30)!.inBuf!.N2).toBe(4);
  });

  it('分配器は出口へ順番に送り、立体交差は流れを混ぜない', () => {
    const w = newWorld();
    place(w, 'splitter', 30, 30, 0);
    place(w, 'belt', 31, 30, 0); place(w, 'belt', 30, 31, 1);
    for (let i = 0; i < 4; i++) { at(w, 30, 30)!.item = { s: 'O2', p: 1, m: 0 }; step(w, 1 / 60); }
    // 2 回目以降は前の品がまだ出口のベルトにあるので、交互に入る
    expect(at(w, 31, 30)!.item?.s).toBe('O2');
    expect(at(w, 30, 31)!.item?.s).toBe('O2');

    place(w, 'bridge', 40, 40, 0);
    place(w, 'belt', 39, 40, 0); place(w, 'belt', 41, 40, 0); place(w, 'belt', 40, 39, 1); place(w, 'belt', 40, 41, 1);
    at(w, 39, 40)!.item = { s: 'N2', p: 0, m: 0 };
    at(w, 40, 39)!.item = { s: 'H2', p: 0, m: 0 };
    run(w, 1.2);
    expect(at(w, 41, 40)!.item?.s).toBe('N2');
    expect(at(w, 40, 41)!.item?.s).toBe('H2');
  });

  it('搬出口は在庫を取り出すが、戻しても指令の数には入らない', () => {
    const w = newWorld();
    w.stock.N2 = 3;
    place(w, 'depot', hx - 1, hy, 0);
    at(w, hx - 1, hy)!.sub = 'N2';
    run(w, 6);
    expect(w.count).toBe(0);
    expect(w.stock.N2).toBe(3);
    expect(w.delivered.N2).toBeUndefined();
  });

  it('強化すると速くなる', () => {
    const slow = newWorld(), fast = newWorld();
    fast.up.extract = 4;
    for (const w of [slow, fast]) { place(w, 'extractor', 30, 30, 0); place(w, 'vent', 31, 30, 0); }
    let a = 0, b = 0;
    for (let i = 0; i < 600; i++) {
      for (const [w, add] of [[slow, () => a++], [fast, () => b++]] as const) { const t0 = at(w, 30, 30)!.timer!; step(w, 1 / 60); if (at(w, 30, 30)!.timer! < t0) add(); }
    }
    expect(b).toBeGreaterThan(a * 2.5);
  });

  it('置く向きは流れ込みに合わせる', () => {
    const w = newWorld();
    place(w, 'belt', 10, 10, 1);
    expect(autoDir(w, 'reactor', 10, 11)).toBe(1);
    expect(autoDir(w, 'reactor', 5, 28)).toBe(0);
    expect(autoDir(w, 'reactor', 70, 28)).toBe(2);
  });

  it('保存して読み戻せる', () => {
    const w = newWorld();
    place(w, 'reactor', 30, 30, 0);
    configure(at(w, 30, 30)!, rec('haber-bosch'), ['NH3']);
    place(w, 'bridge', 31, 30, 0);
    w.points = 77; w.up.belt = 2; w.goal = 5; w.stock.H2 = 4;
    const r = deserialize(serialize(w))!;
    expect(r.points).toBe(77);
    expect(r.up.belt).toBe(2);
    expect(r.goal).toBe(5);
    expect(r.stock.H2).toBe(4);
    expect(at(r, 30, 30)!.recipe).toBe('haber-bosch');
    expect(deserialize('{"v":1,"ents":[]}')).toBeNull();
  });
});
