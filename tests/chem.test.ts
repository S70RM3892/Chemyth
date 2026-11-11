import { describe, expect, it } from 'vitest';
import { isBalanced, normalizeFormula, parseFormula } from '../src/chem/formula';
import { CONDITIONS, RECIPES, productsOf } from '../src/content/recipes';
import { sub, subByFormula, sameAtoms, SUBSTANCES } from '../src/content/substances';
import { element, ELEMENTS } from '../src/content/elements';
import { HUB_TILES, MAP_H, MAP_W, ZONES, zoneAt, type Zone } from '../src/content/map';
import { GOALS, CHAPTERS, chapterOf } from '../src/content/goals';
import { QUESTIONS, isCorrect } from '../src/content/questions';
import { MACHINES } from '../src/content/machines';
import { at, autoDir, configure, currentGoal, deserialize, doneCount, dueIds, goalCount, judge, learn, newWorld, place, schedule, serialize, setChapter, step, toolUnlocked, type Answer } from '../src/engine/world';
import { REAGENTS, SETS, TESTS, isPositive } from '../src/content/samples';
import { KNOWLEDGE } from '../src/content/knowledge';
import { PASSAGES, checkBlank } from '../src/content/passages';

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
    for (const s of SUBSTANCES) if (!s.mask) for (const sym of s.rep ?? Object.keys(parseFormula(s.formula!))) expect(() => element(sym)).not.toThrow();
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
    if (!r.loose && !r.mix) {
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
    const have = new Set<string>(['air', ...Object.values(ZONES).map((z) => z.resource), ...REAGENTS, ...SETS.flatMap((x) => x.members)]);
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
    expect(chapterOf(GOALS.length - 1)?.name).toContain('第11章');
    expect(chapterOf(GOALS.length)).toBeNull();
    expect(CHAPTERS[MACHINES.battery.chapter!].goals[0].s).toBe('e');
    for (const g of GOALS) if (g.strict) expect(SETS.find((x) => x.id === g.strict)!.members, g.s).toContain(g.s);
  });
  it('計算問題の id が重複せず、答えは許容誤差つきで判定される', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    const q = QUESTIONS.find((x) => x.id === 'elec-1')!;
    expect(isCorrect(q, 3.2)).toBe(true);
    expect(isCorrect(q, 3.5)).toBe(false);
    expect(isCorrect(QUESTIONS.find((x) => x.id === 'heat-2')!, 111)).toBe(false);
  });
});

describe('分析の課題', () => {
  it('試料の検査 id はすべて定義済みで、試薬も定義済み', () => {
    const ids = new Set(TESTS.map((t) => t.id));
    for (const x of SUBSTANCES) for (const t of x.pos ?? []) expect(ids.has(t), `${x.id}:${t}`).toBe(true);
    for (const r of REAGENTS) expect(() => sub(r)).not.toThrow();
    for (const set of SETS) for (const m of set.members) expect(sub(m).mask, m).toBeTruthy();
  });
  it('仕分けの指令は、検査の組み合わせで目的の物質だけを取り出せる', () => {
    for (const g of GOALS.filter((x) => x.strict)) {
      const set = SETS.find((x) => x.id === g.strict)!;
      const sig = (id: string) => TESTS.map((t) => (isPositive(id, t.id) ? '1' : '0')).join('');
      for (const m of set.members) if (m !== g.s) expect(sig(m), `${g.s} と ${m} が区別できない`).not.toBe(sig(g.s));
    }
  });
  it('知識問題とリード文課題のデータが整っている', () => {
    expect(new Set(KNOWLEDGE.map((k) => k.id)).size).toBe(KNOWLEDGE.length);
    for (const k of KNOWLEDGE) { expect(k.choices.length).toBeGreaterThanOrEqual(3); expect(new Set(k.choices).size).toBe(k.choices.length); }
    for (const p of PASSAGES) {
      const marks = [...p.text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      expect([...new Set(marks)].sort(), p.id).toEqual(p.blanks.map((b) => b.id).sort());
      for (const b of p.blanks) {
        if (b.type === 'choice') expect(b.choices, `${p.id}:${b.id}`).toContain(b.answer);
        expect(checkBlank(b, String(b.answer)), `${p.id}:${b.id}`).toBe(true);
      }
    }
    const lead = PASSAGES.find((p) => p.id === 'lead')!.blanks.find((b) => b.type === 'formula')!;
    expect(checkBlank(lead, 'ＰｂＳＯ４')).toBe(lead.answer === 'PbSO4');
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
  const haber0: Answer = { reactants: [['N2', 1], ['H2', 3]], products: [['NH3', 2]], condition: 'Fe₃O₄' };
  const haber: Answer = { ...haber0 };
  const v = (m: Parameters<typeof judge>[0], a: Answer) => { const r = judge(m, a); return r.ok ? r.recipe.id : r.part; };
  it('正しい設定は通る', () => {
    expect(v('reactor', { ...haber, shift: '低温・高圧' })).toBe('haber-bosch');
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
  it('可逆反応は平衡を動かす条件も問う', () => {
    expect(v('reactor', haber)).toBe('equilibrium');
    expect(v('reactor', { ...haber, shift: '高温・高圧' })).toBe('equilibrium');
    expect(v('reactor', { reactants: [['CH4', 1], ['H2O', 1]], products: [['CO', 1], ['H2', 3]], condition: 'Ni', shift: '高温・低圧' })).toBe('steam-reforming');
  });
  it('捕集は方法と乾燥剤の組で採点する', () => {
    expect(v('collector', { reactants: [['NH3', 1]], products: [], condition: '上方置換・ソーダ石灰' })).toBe('collect-NH3');
    expect(v('collector', { reactants: [['NH3', 1]], products: [], condition: '上方置換・塩化カルシウム' })).toBe('condition');
    expect(v('collector', { reactants: [['H2S', 1]], products: [], condition: '下方置換・濃硫酸' })).toBe('condition');
    expect(v('collector', { reactants: [['NO', 1]], products: [], condition: '水上置換' })).toBe('collect-NO');
  });
  it('緩衝液は混ぜる比を問う', () => {
    expect(v('reactor', { reactants: [['CH3COOH', 1], ['CH3COONa', 10]], products: [['buffer57', 1]], condition: 'なし' })).toBe('buffer-57');
    expect(v('reactor', { reactants: [['CH3COOH', 1], ['CH3COONa', 1]], products: [['buffer57', 1]], condition: 'なし' })).toBe('coefficients');
    expect(v('reactor', { reactants: [['CH3COOH', 1], ['CH3COONa', 1]], products: [['buffer47', 1]], condition: 'なし' })).toBe('buffer-47');
  });
  it('同じ原料でも酸の濃さで生成物が変わる（銅と硝酸）', () => {
    expect(v('reactor', { reactants: [['Cu', 3], ['HNO3', 8]], products: [['Cu(NO3)2', 3], ['NO', 2], ['H2O', 4]], condition: '希酸' })).toBe('lab-no');
    expect(v('reactor', { reactants: [['Cu', 1], ['HNO3', 4]], products: [['Cu(NO3)2', 1], ['NO2', 2], ['H2O', 2]], condition: '濃酸' })).toBe('lab-no2');
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
    w.progress[0] = 2;
    expect(place(w, 'reactor', hx - 1, hy, 0)).toBeNull();
    const e = at(w, hx - 1, hy)!;
    configure(e, rec('haber-bosch'), ['NH3']);
    e.inBuf = { N2: 1, H2: 3 };
    run(w, 4);
    expect(w.delivered.NH3).toBe(2);
    expect(goalCount(w)).toBe(2);
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
    expect(goalCount(w)).toBe(0);
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
    w.points = 77; w.up.belt = 2; w.progress[0] = 3; w.progress[1] = 2; setChapter(w, 1); w.counts[1] = 4; w.stock.H2 = 4;
    const r = deserialize(serialize(w))!;
    expect(r.points).toBe(77);
    expect(r.up.belt).toBe(2);
    expect(doneCount(r)).toBe(5);
    expect(currentGoal(r)?.s).toBe('NaOH');
    expect(goalCount(r)).toBe(4);
    expect(r.stock.H2).toBe(4);
    expect(at(r, 30, 30)!.recipe).toBe('haber-bosch');
    expect(deserialize('{"v":1,"ents":[]}')).toBeNull();
  });

  it('章を選べなかった頃のセーブを読み替える', () => {
    const old = JSON.stringify({ v: 2, ents: [], goal: 4, count: 7, learned: ['haber-bosch'], points: 9 });
    const r = deserialize(old)!;
    expect(r.progress.slice(0, 3)).toEqual([3, 1, 0]);
    expect(r.chapter).toBe(1);
    expect(goalCount(r)).toBe(7);
    expect(currentGoal(r)?.s).toBe('H2SO4');
    expect(r.counts[2]).toBe(0);
    expect(dueIds(r)).toContain('r:haber-bosch');
  });

  it('章を終えると次の章へ進み、道具が解禁される', () => {
    const w = newWorld();
    expect(toolUnlocked(w, MACHINES.analyzer)).toBe(false);
    expect(toolUnlocked(w, MACHINES.bridge)).toBe(true);
    setChapter(w, 9);
    expect(toolUnlocked(w, MACHINES.analyzer)).toBe(true);
    expect(toolUnlocked(w, MACHINES.battery)).toBe(true);
    setChapter(w, 0);
    w.progress[0] = 2; w.counts[0] = 19;
    place(w, 'reactor', hx - 1, hy, 0);
    const e = at(w, hx - 1, hy)!;
    configure(e, rec('haber-bosch'), ['NH3']);
    e.inBuf = { N2: 1, H2: 3 };
    run(w, 4);
    expect(w.chapter).toBe(1);
    expect(w.events).toContain('chapter-done');
  });

  it('試薬棚の試料を分析器で仕分けると、目的の物質だけが届く', () => {
    const w = newWorld();
    setChapter(w, 9); // 第10章：2-ブタノール
    expect(currentGoal(w)?.s).toBe('x-2-butanol');
    // 棚 → 分析器（ヨードホルム反応）→ 陽性は納品所、陰性は廃棄
    place(w, 'sampler', hx - 2, hy, 0); at(w, hx - 2, hy)!.sub = 'set:A';
    place(w, 'analyzer', hx - 1, hy, 0); at(w, hx - 1, hy)!.test = 'iodoform';
    place(w, 'vent', hx - 1, hy + 1, 0);
    run(w, 30);
    expect(goalCount(w)).toBeGreaterThan(1);
    expect(w.mistakes.length).toBe(0);
    expect(Object.keys(w.delivered)).toEqual(['x-2-butanol']);
  });

  it('仕分けずに納めると減点される', () => {
    const w = newWorld();
    setChapter(w, 9);
    w.counts[9] = 5;
    place(w, 'sampler', hx - 1, hy, 0); at(w, hx - 1, hy)!.sub = 'set:A';
    run(w, 4);
    expect(goalCount(w)).toBeLessThan(5);
    expect(w.mistakes[0].part).toBe('isomer');
  });

  it('試薬棚の試薬を直接納めても数えない', () => {
    const w = newWorld();
    setChapter(w, 1); w.progress[1] = 1; // 硫酸の指令
    expect(currentGoal(w)?.s).toBe('H2SO4');
    place(w, 'sampler', hx - 1, hy, 0); at(w, hx - 1, hy)!.sub = 'H2SO4';
    run(w, 6);
    expect(goalCount(w)).toBe(0);
    expect(w.stock.H2SO4).toBeGreaterThan(0);
  });

  it('覚えた反応は復習の予定に入り、正解で間隔が延びる', () => {
    const w = newWorld();
    const t0 = 1_000_000;
    learn(w, rec('contact'), true);
    w.srs['r:contact'].due = t0;
    expect(dueIds(w, t0 + 1)).toEqual(['r:contact']);
    schedule(w, 'r:contact', true, t0);
    expect(w.srs['r:contact'].iv).toBe(1);
    expect(dueIds(w, t0 + 60_000)).toEqual([]);
    schedule(w, 'r:contact', false, t0);
    expect(w.srs['r:contact'].iv).toBe(0);
  });
});
