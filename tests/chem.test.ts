import { describe, expect, it } from 'vitest';
import { TOP_H, camera3, heightOf, pickTile, planeSize } from '../src/ui/three';
import { ORG_MIXES, WASHES, extract, extractReachable, extractRefusal, washById } from '../src/content/extract';
import { AMINO, AMINO_MIXES, migrate, migrateReachable, poleAt } from '../src/content/phoresis';
import { AGENTS, ION_ORDER, MIXES, MUD_CL, MUD_OH, SLUDGE, agentById, ionsId, ionsOf, reachableFrom, refusal, settle } from '../src/content/ions';
import { isBalanced, normalizeFormula, parseFormula } from '../src/chem/formula';
import { RAIL_BOOST, addRail, layRail, railRoute, removeRail, stationRoutes, STATION_CAP, TOXIC, TRAIN_CAP, TUNNEL_RANGE, goalRate, reactionsPerMin, stationTargets, pathLength, railLength, railOf, trainSpeed, fedTier, stationTarget, tunnelPair, fitAnchor, flowStats, inDoors, machineState, moveOutput, outPort, poleOf, restore, slotCount, slotPort } from '../src/engine/world';
import { CONDITIONS, RECIPES, productsOf } from '../src/content/recipes';
import { hasSub, sub, subByFormula, sameAtoms, SUBSTANCES } from '../src/content/substances';
import { element, ELEMENTS } from '../src/content/elements';
import { HUB_TILES, MAP_H, MAP_W, ZONES, hubTiles, isSea, resourceAt, zoneAt, zoneSpots, type Zone } from '../src/content/map';
import { GOALS, CHAPTERS, chapterOf } from '../src/content/goals';
import { QUESTIONS, isCorrect } from '../src/content/questions';
import { MACHINES } from '../src/content/machines';
import { at, autoDir, remove, inflow, configure, currentGoal, growHub, hubLevel, requiredOf, deserialize, doneCount, dueIds, goalCount, judge, learn, newWorld, place, schedule, serialize, setChapter, step, toolUnlocked, type Answer } from '../src/engine/world';
import { REAGENTS, SETS, TESTS, isPositive } from '../src/content/samples';
import { KNOWLEDGE } from '../src/content/knowledge';
import { SYLLABUS, coverageOf } from '../src/content/syllabus';
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
    it(`${r.name}：定義済みの物質だけを使い、正解の条件が選択肢にあり、出口は 6 つまで`, () => {
      for (const [s] of [...r.inputs, ...r.outputs]) expect(() => sub(s)).not.toThrow();
      for (const a of r.accept) expect(CONDITIONS[r.machine].options).toContain(a);
      expect(r.outputs.length).toBeLessThanOrEqual(6);
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
    // 試薬棚の混合溶液から、沈殿槽で作れるもの
    for (const m of MIXES) for (const x of reachableFrom(m.id)) have.add(x);
    for (const m of ORG_MIXES) for (const x of extractReachable(m.id)) have.add(x);
    for (const m of AMINO_MIXES) for (const x of migrateReachable(m.id)) have.add(x);
    for (let grew = true; grew;) {
      grew = false;
      for (const r of RECIPES) {
        if (!r.inputs.every(([s]) => have.has(s))) continue;
        for (const [s] of r.outputs) if (!have.has(s)) { have.add(s); grew = true; }
      }
    }
    for (const g of GOALS) for (const x of [g.s, ...(g.also ?? [])]) expect(have.has(x), x).toBe(true);
    // 使われない反応がない
    for (const r of RECIPES) expect(r.inputs.every(([s]) => have.has(s)), r.id).toBe(true);
  });
  it('章と指令の対応', () => {
    expect(GOALS.length).toBe(CHAPTERS.reduce((a, c) => a + c.goals.length, 0));
    expect(chapterOf(0)?.name).toContain('第1章');
    expect(chapterOf(GOALS.length - 1)?.name).toContain('第24章');
    expect(CHAPTERS[MACHINES.settler.chapter!].name).toContain('系統分離');
    expect(CHAPTERS[13].name).toContain('総合演習');
    expect(CHAPTERS[13].goals.length).toBeGreaterThan(60);
    expect(chapterOf(GOALS.length)).toBeNull();
    expect(CHAPTERS[MACHINES.battery.chapter!].goals[0].s).toBe('e');
    for (const g of GOALS) if (g.strict) expect(SETS.find((x) => x.id === g.strict)!.members, g.s).toContain(g.s);
  });
  it('運転条件の計算つきの反応は、問いと答えがそろっている', () => {
    const asks = RECIPES.filter((r) => r.ask);
    expect(asks.length).toBe(5);
    for (const r of asks) { expect(r.ask!.text.length).toBeGreaterThan(20); expect(Number.isFinite(r.ask!.answer)).toBe(true); }
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

describe('学習指導要領との対応', () => {
  it('化学基礎 14 項目と化学 20 項目がそろっている', () => {
    expect(SYLLABUS.filter((u) => u.subject === '化学基礎').length).toBe(14);
    expect(SYLLABUS.filter((u) => u.subject === '化学').length).toBe(20);
    expect(new Set(SYLLABUS.map((u) => u.id)).size).toBe(SYLLABUS.length);
  });
  for (const u of SYLLABUS) {
    it(`${u.subject}「${u.title}」に対応する内容がある`, () => {
      const c = coverageOf(u);
      // 参照している分野や試料が、実在するデータに 1 つ以上当たること
      for (const k of u.recipes ?? []) expect(RECIPES.some((r) => r.id === k || r.source.includes(k)), `反応 ${k}`).toBe(true);
      for (const k of u.sets ?? []) expect(SETS.some((x) => x.id === k), `試料 ${k}`).toBe(true);
      for (const k of u.questions ?? []) expect(QUESTIONS.some((q) => q.topic === k), `計算 ${k}`).toBe(true);
      for (const k of u.knowledge ?? []) expect(KNOWLEDGE.some((x) => x.topic === k), `知識 ${k}`).toBe(true);
      for (const k of u.passages ?? []) expect(PASSAGES.some((x) => x.id === k), `リード文 ${k}`).toBe(true);
      expect(c.total, '内容の数').toBeGreaterThanOrEqual(5);
    });
  }
  it('どの内容も、いずれかの項目に属している', () => {
    const all = SYLLABUS.map(coverageOf);
    for (const r of RECIPES) expect(all.some((c) => c.recipes.includes(r)), `反応 ${r.id}（${r.source}）`).toBe(true);
    for (const q of QUESTIONS) expect(all.some((c) => c.questions.includes(q)), `計算 ${q.id}（${q.topic}）`).toBe(true);
    for (const k of KNOWLEDGE) expect(all.some((c) => c.knowledge.includes(k)), `知識 ${k.id}（${k.topic}）`).toBe(true);
    for (const x of SETS) expect(all.some((c) => c.sets.includes(x)), `試料 ${x.id}`).toBe(true);
    for (const x of PASSAGES) expect(all.some((c) => c.passages.includes(x)), `リード文 ${x.id}`).toBe(true);
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
    expect(v('reactor', { ...haber, reactants: [['N2', 1], ['O2', 1]] })).toBe('reactants');
  });
  it('電解槽は陰極と陽極の取り違えを見抜く', () => {
    expect(v('electrolyzer', { reactants: [['H2O', 2]], products: [['O2', 1], ['H2', 2]], poles: ['c', 'a'], condition: '水 + NaOH' })).toBe('electrodes');
    expect(v('electrolyzer', { reactants: [['H2O', 2]], products: [['O2', 1], ['H2', 2]], poles: ['a', 'c'], condition: '水 + NaOH' })).toBe('water-electrolysis'); // 書く順は問わない
    expect(v('electrolyzer', { reactants: [['H2O', 2]], products: [['H2', 2], ['O2', 1]], poles: ['c', 'a'], condition: '水のみ' })).toBe('condition');
    expect(v('electrolyzer', { reactants: [['NaCl', 2], ['H2O', 2]], products: [['H2', 1], ['NaOH', 2], ['Cl2', 1]], poles: ['c', 'c', 'a'], condition: '飽和食塩水（陽イオン交換膜）' })).toBe('brine-electrolysis');
    expect(v('electrolyzer', { reactants: [['NaCl', 2], ['H2O', 2]], products: [['H2', 1], ['Cl2', 1], ['NaOH', 2]], poles: ['c', 'a', 'a'], condition: '飽和食塩水（陽イオン交換膜）' })).toBe('electrodes'); // NaOH は陰極側
    expect(v('electrolyzer', { reactants: [['NaCl', 2]], products: [['Na', 2], ['Cl2', 1]], poles: ['c', 'a'], condition: '融解塩（水なし）' })).toBe('molten-nacl');
    // 極を間違えたときは、どの物質が違うのかと、その理由を返す
    const naoh = judge('electrolyzer', { reactants: [['NaCl', 2], ['H2O', 2]], products: [['H2', 1], ['NaOH', 2], ['Cl2', 1]], poles: ['c', 'a', 'a'], condition: '飽和食塩水（陽イオン交換膜）' });
    expect(naoh.ok).toBe(false);
    if (!naoh.ok) { expect(naoh.message).toContain('NaOH'); expect(naoh.message).toContain('OH⁻'); expect(naoh.message).not.toContain('Cl₂'); }
    const acid = judge('electrolyzer', { reactants: [['CuSO4', 2], ['H2O', 2]], products: [['Cu', 2], ['O2', 1], ['H2SO4', 2]], poles: ['c', 'a', 'c'], condition: '水溶液・白金電極' });
    if (!acid.ok) { expect(acid.message).toContain('H₂SO₄'); expect(acid.message).toContain('H⁺'); }
    const swap = judge('electrolyzer', { reactants: [['H2O', 2]], products: [['O2', 1], ['H2', 2]], poles: ['c', 'a'], condition: '水 + NaOH' });
    if (!swap.ok) { expect(swap.message).toContain('還元'); }
  });
  it('1 つの極で 2 つのものが生じる電気分解を受けつける', () => {
    // 硫酸銅(II)水溶液：陽極で O₂ と H₂SO₄（H⁺）
    const cu: Answer = { reactants: [['CuSO4', 2], ['H2O', 2]], products: [['Cu', 2], ['O2', 1], ['H2SO4', 2]], poles: ['c', 'a', 'a'], condition: '水溶液・白金電極' };
    expect(v('electrolyzer', cu)).toBe('cuso4-electrolysis');
    expect(v('electrolyzer', { ...cu, poles: ['c', 'a', 'c'] })).toBe('electrodes');
    // 鉛蓄電池の充電：硫酸はどちらの極に書いてもよい
    const pb: Answer = { reactants: [['PbSO4', 2], ['H2O', 2]], products: [['Pb', 1], ['PbO2', 1], ['H2SO4', 2]], poles: ['c', 'a', 'a'], condition: '水 + H₂SO₄' };
    expect(v('electrolyzer', pb)).toBe('lead-charge');
    expect(v('electrolyzer', { ...pb, poles: ['c', 'a', 'c'] })).toBe('lead-charge');
    // アルミナの溶融塩電解：陽極は CO だけ、CO₂ だけ、両方のどれでもよい
    const al = (products: [string, number][], reactants: [string, number][]): Answer => ({ reactants, products, poles: products.map(([p]) => (p === 'Al' ? 'c' : 'a')), condition: '融解した氷晶石' });
    expect(v('electrolyzer', al([['Al', 4], ['CO2', 3]], [['Al2O3', 2], ['C', 3]]))).toBe('hall-heroult');
    expect(v('electrolyzer', al([['Al', 2], ['CO', 3]], [['Al2O3', 1], ['C', 3]]))).toBe('hall-heroult-co');
    expect(v('electrolyzer', al([['Al', 4], ['CO', 2], ['CO2', 2]], [['Al2O3', 2], ['C', 4]]))).toBe('hall-heroult-mix');
    expect(v('electrolyzer', al([['Al', 6], ['CO', 1], ['CO2', 4]], [['Al2O3', 3], ['C', 5]]))).toBe('hall-heroult-mix'); // 比が違っても原子の数が合えばよい
    expect(v('electrolyzer', al([['Al', 4], ['CO', 1], ['CO2', 1]], [['Al2O3', 2], ['C', 2]]))).toBe('coefficients');
    // 電解槽に書ける生成物の数：極ごとに 3 つまで
    for (const r of RECIPES.filter((x) => x.machine === 'electrolyzer')) {
      const n = (pole: string) => r.outputs.filter((_, i) => poleOf(r, i) === pole).length;
      expect(n('c') + n('x'), r.id).toBeLessThanOrEqual(3);
      expect(n('a') + n('x'), r.id).toBeLessThanOrEqual(3);
    }
  });
  it('どの反応も、装置の出口の数に収まる', () => {
    for (const r of RECIPES) expect(r.outputs.length, r.id).toBeLessThanOrEqual(6);
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
    expect(place(w, 'reactor', hx - 2, hy, 0)).toBeNull();
    const e = at(w, hx - 2, hy)!;
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
    // 南向きに置くと、左手（陰極側）が東の納品所、右手（陽極側）が西を向く
    place(w, 'electrolyzer', hx - 2, hy - 1, 1);
    const e = at(w, hx - 2, hy - 1)!;
    configure(e, rec('water-electrolysis'), ['H2', 'O2'], ['c', 'a']);
    expect(e.outSlot).toEqual([3, 2]);
    expect(outPort(e, 0)).toMatchObject({ tx: hx, ty: hy, d: 0 });
    expect(outPort(e, 1)).toMatchObject({ tx: hx - 3, ty: hy, d: 2 });
    e.inBuf = { H2O: 4 };
    run(w, 10);
    expect(w.delivered.H2).toBe(2);
    place(w, 'vent', hx - 3, hy, 0);
    run(w, 5);
    expect(w.delivered.H2).toBe(4);
  });

  it('空気は陸地のどこでも採れ、海では海水が採れる', () => {
    const w = newWorld();
    expect(place(w, 'extractor', 30, 30, 0)).toBeNull();
    place(w, 'separator', 31, 30, 0);
    place(w, 'vent', 33, 30, 0);
    place(w, 'vent', 33, 31, 0);
    configure(at(w, 31, 30)!, rec('air-distillation'), ['N2', 'O2']);
    expect(resourceAt(7, 27)).toBe('seawater');  // 海
    expect(resourceAt(53, 21)).toBe('seawater'); // 入り江
    place(w, 'extractor', 53, 21, 0);
    place(w, 'separator', 54, 21, 0);
    place(w, 'vent', 56, 21, 0);
    place(w, 'vent', 56, 22, 0);
    configure(at(w, 54, 21)!, rec('seawater-distillation'), ['H2O', 'NaCl']);
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
    place(w, 'bridge', 32, 30, 0);
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
    expect(toolUnlocked(w, MACHINES.analyzer)).toBe(true); // 選別に使うので最初からある
    expect(toolUnlocked(w, MACHINES.sampler)).toBe(false);
    expect(toolUnlocked(w, MACHINES.bridge)).toBe(true);
    setChapter(w, 9);
    expect(toolUnlocked(w, MACHINES.sampler)).toBe(true);
    expect(toolUnlocked(w, MACHINES.battery)).toBe(true);
    setChapter(w, 0);
    w.progress[0] = 2; w.counts[0] = 19;
    place(w, 'reactor', hx - 2, hy, 0);
    const e = at(w, hx - 2, hy)!;
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

  it('地図に果てはなく、遠くにも資源地が現れる', () => {
    const w = newWorld();
    expect(place(w, 'extractor', 900, -700, 0)).toBeNull();
    expect(place(w, 'belt', -50, 2000, 0)).toBeNull();
    const far = zoneSpots(300, 300, 500, 500);
    expect(far.length).toBeGreaterThan(20);
    const kinds = new Set(zoneSpots(100, 100, 900, 900).map((s) => s.zone));
    for (const z of Object.keys(ZONES)) expect(kinds.has(z as Zone), z).toBe(true);
    const s0 = far[0];
    expect(zoneAt(Math.floor(s0.cx), Math.floor(s0.cy))).toBe(s0.zone);
    // 西も陸地で、資源地が点在する。一面の海ではない
    const west = zoneSpots(-500, -200, -100, 200);
    expect(west.length).toBeGreaterThan(20);
    let sea = 0, all = 0;
    for (let x = -400; x < -300; x++) for (let y = 0; y < 100; y++) { all++; if (isSea(zoneAt(x, y))) sea++; }
    expect(sea).toBeGreaterThan(0);
    expect(sea / all).toBeLessThan(0.1);
  });

  it('達成数が増えると納品所が大きくなり、要求数も増える', () => {
    const w = newWorld();
    const g = CHAPTERS[0].goals[0];
    expect(requiredOf(w, g)).toBe(10);
    place(w, 'belt', hx - 1, hy, 0);
    place(w, 'reactor', hx - 4, hy, 0);   // 外側
    place(w, 'reactor', hx - 2, hy + 2, 0); // 2×2 の半分だけが重なる
    w.progress[0] = 3;
    expect(growHub(w)).toBe(true);
    expect(w.hubSize).toBe(4);
    expect(hubLevel(w)).toBe(1);
    expect(at(w, hx - 1, hy)!.kind).toBe('hub');   // 重なったベルトは納品所に置き換わる
    expect(at(w, hx - 4, hy)!.kind).toBe('reactor'); // 外側は残る
    expect(at(w, hx - 2, hy + 2)).toBeUndefined();   // 半分重なった装置は、丸ごと撤去される
    expect(at(w, hx - 2, hy + 3)).toBeUndefined();
    expect(requiredOf(w, g)).toBe(15);
    expect(requiredOf(w, CHAPTERS[9].goals[0])).toBe(8); // 仕分けは増やさない
    expect([...w.ents.values()].filter((e) => e.kind === 'hub').length).toBe(hubTiles(4).length);
    const r = deserialize(serialize(w))!;
    expect(r.hubSize).toBe(4);
    expect(growHub(r)).toBe(false);
  });

  it('2×2 の装置は 4 マスを占め、6 か所の出口をもつ', () => {
    const w = newWorld();
    expect(place(w, 'reactor', 10, 10, 0)).toBeNull();
    const e = at(w, 10, 10)!;
    expect(e.big).toBe(true);
    for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11]]) expect(at(w, x, y)).toBe(e);
    expect(place(w, 'belt', 11, 11, 0)).not.toBeNull();
    expect(place(w, 'reactor', 11, 11, 0)).not.toBeNull();
    expect(fitAnchor(w, 12, 12)).toEqual([12, 12]);
    expect(fitAnchor(w, 12, 11)).toEqual([12, 11]);
    place(w, 'belt', 13, 12, 0);
    expect(fitAnchor(w, 13, 13)).toEqual([13, 13]);          // (13,12) がふさがっても、(13,13) を左上にすれば置ける
    expect(fitAnchor(w, 12, 12)).toEqual([12, 12].map((n, i) => (i === 0 ? n - 1 : n))); // (12,12)-(13,13) は置けないので、左へずらす
    for (const dir of [0, 1, 2, 3] as const) {
      e.dir = dir;
      const seen = new Set<string>();
      for (let slot = 0; slot < slotCount(e); slot++) {
        const p = slotPort(e, slot);
        // 出口のマスは装置の中、出ていく先は装置の外
        expect(at(w, p.x, p.y)).toBe(e);
        expect(at(w, p.tx, p.ty)).not.toBe(e);
        seen.add(`${p.tx},${p.ty}`);
      }
      expect(seen.size).toBe(6);
      // 奥の面の 2 マスには出口がない
      for (const d of inDoors(e)) expect(seen.has(`${d.x - [1, 0, -1, 0][d.d]},${d.y - [0, 1, 0, -1][d.d]}`)).toBe(false);
    }
    e.dir = 0;
    // 出口から出たものを、隣のベルトが流れ込みとして認識する
    configure(e, rec('soda-ash'), ['Na2CO3', 'H2O', 'CO2']);
    // 入れた順に、正面・右手・左手と面を分けて出る
    expect(e.outSlot).toEqual([0, 2, 3]);
    expect(inflow(w, 12, 10)).toBe(0);    // 正面・左：Na₂CO₃
    expect(inflow(w, 12, 11)).toBeNull(); // 正面・右は使っていない
    expect(inflow(w, 11, 12)).toBe(1);    // 右手・手前：H₂O
    expect(inflow(w, 11, 9)).toBe(3);     // 左手・手前：CO₂
    expect(inflow(w, 10, 12)).toBeNull();
    moveOutput(e, 2, 4);                  // CO₂ を右手・奥へ移す
    expect(inflow(w, 11, 9)).toBeNull();
    expect(inflow(w, 10, 12)).toBe(1);
    moveOutput(e, 0, 2);                  // Na₂CO₃ と H₂O を入れ替える
    expect(e.outSlot).toEqual([2, 0, 4]);
    // 保存して読み戻しても、大きさと出口が残る
    const r = deserialize(serialize(w))!;
    expect(at(r, 11, 11)).toBe(at(r, 10, 10));
    expect(at(r, 10, 10)!.outSlot).toEqual([2, 0, 4]);
    // 消すと 4 マスとも空く。元に戻せる
    expect(remove(w, 11, 11)).toBe(true);
    expect(at(w, 10, 10)).toBeUndefined();
    expect(restore(w, e)).toBe(true);
    expect(at(w, 11, 10)).toBe(e);
  });

  it('稼働率・納品の速さ・捨てた数を記録する', () => {
    const w = newWorld();
    w.progress[0] = 2;
    // 納品所が広がっても巻き込まれない場所に置き、ベルトでつなぐ
    place(w, 'reactor', hx - 5, hy, 0);
    for (const x of [hx - 3, hx - 2, hx - 1]) place(w, 'belt', x, hy, 0);
    const e = at(w, hx - 5, hy)!;
    configure(e, rec('haber-bosch'), ['NH3']);
    expect(flowStats(w).util).toBe(0);
    // 原料が切れない状態で 30 秒。1 回に 2 個できるが、残りが 1 回ぶん未満になれば次の反応へ進むので、出口待ちはほとんど無い
    for (let i = 0; i < 8 * 60; i++) { e.inBuf = { N2: 4, H2: 12 }; step(w, 1 / 60); }
    // 指令（NH₃ を 10 個）の途中：指令ぶんの速さと、終わるまでの見込みが出る
    expect(goalCount(w)).toBeGreaterThan(0);
    expect(flowStats(w).goalPerMin).toBeGreaterThan(10);
    expect(flowStats(w).etaSec!).toBeGreaterThan(0);
    for (let i = 0; i < 22 * 60; i++) { e.inBuf = { N2: 4, H2: 12 }; step(w, 1 / 60); }
    expect(e.u!).toBeGreaterThan(0.5);
    expect(e.ts![0]).toBeGreaterThan(18);
    expect(e.ts![2]).toBeLessThan(2);
    expect(e.n!).toBeGreaterThan(10);
    expect(machineState(e)).toBe(0);
    expect(w.made.NH3).toBe(e.n! * 2);
    const f = flowStats(w);
    expect(f.machines).toBe(1);
    expect(f.util!).toBeGreaterThan(0.5);
    expect(f.perMin1).toBeGreaterThan(20);
    expect(f.goalPerMin).toBe(0); // 指令を終えて次へ移ったので、数え直しになる
    expect(f.etaSec).toBeNull();
    expect(f.wasteRate).toBe(0);
    // 原料を止めると、稼働率が下がり、原料待ちの時間が増える
    e.inBuf = {};
    run(w, 60);
    expect(e.u!).toBeLessThan(0.1);
    expect(e.ts![1]).toBeGreaterThan(55);
    expect(machineState(e)).toBe(1);
    expect(flowStats(w).starved).toBe(1);
    // 廃棄口とあふれ
    const w2 = newWorld();
    place(w2, 'electrolyzer', 10, 10, 0);
    const c = at(w2, 10, 10)!;
    configure(c, rec('water-electrolysis'), ['H2', 'O2'], ['c', 'a']);
    place(w2, 'vent', 11, 9, 0);   // 陰極側（左手・手前）の先
    place(w2, 'vent', 11, 12, 0);  // 陽極側（右手・手前）の先
    for (let i = 0; i < 20 * 60; i++) { c.inBuf = { H2O: 8 }; step(w2, 1 / 60); }
    expect(w2.vented.H2).toBeGreaterThan(5);
    expect(w2.vented.O2).toBeGreaterThan(2);
    expect(flowStats(w2).wasteRate!).toBeGreaterThan(0.8);
    // 保存して読み戻しても、累計は残る
    const r = deserialize(serialize(w2))!;
    expect(r.vented.H2).toBe(w2.vented.H2);
    expect(r.made.H2).toBe(w2.made.H2);
  });

  it('使わない物質が入口に来ると、受け取らずに印をつける', () => {
    const w = newWorld();
    place(w, 'electrolyzer', 10, 10, 0);
    const e = at(w, 10, 10)!;
    configure(e, rec('water-electrolysis'), ['H2', 'O2'], ['c', 'a']);
    place(w, 'belt', 9, 10, 0);
    at(w, 9, 10)!.item = { s: 'NaCl', p: 1, m: 0 };
    run(w, 0.5);
    expect(at(w, 9, 10)!.item?.s).toBe('NaCl'); // ベルトに残ったまま
    expect(e.bad).toBe('NaCl');
    expect(flowStats(w).jammed).toBe(1);
    // 取り除けば、印は消える
    at(w, 9, 10)!.item = null;
    run(w, 1.5);
    expect(e.bad).toBeUndefined();
    at(w, 9, 10)!.item = { s: 'H2O', p: 1, m: 0 };
    run(w, 0.2);
    expect(e.inBuf!.H2O).toBe(1);
    // 食塩水の電気分解は、膜のない電極でも同じ生成物
    expect(judge('electrolyzer', { reactants: [['NaCl', 2], ['H2O', 2]], products: [['H2', 1], ['NaOH', 2], ['Cl2', 1]], poles: ['c', 'c', 'a'], condition: '水溶液・炭素電極' }).ok).toBe(true);
    // 1 マスだった頃の電解槽：正面に陰極、右手に陽極、残りは左手
    const old = { kind: 'electrolyzer', x: 20, y: 20, dir: 0 } as Parameters<typeof configure>[0];
    configure(old, rec('brine-electrolysis'), ['H2', 'NaOH', 'Cl2'], ['c', 'c', 'a']);
    expect(old.outOrder).toEqual(['H2', 'Cl2', 'NaOH']);
    expect(old.outSlot).toBeUndefined();
  });

  it('電池の e⁻ で電解槽が加速し、有毒な気体を捨てると研究点を失い、指令に操業評価がつく', () => {
    // 選別：指定した物質だけを正面へ通す
    {
      const f = newWorld();
      place(f, 'analyzer', 30, 30, 0);
      at(f, 30, 30)!.test = 'is:NaCl';
      place(f, 'belt', 31, 30, 0); place(f, 'belt', 30, 31, 1);
      at(f, 30, 30)!.item = { s: 'NaCl', p: 1, m: 0 }; run(f, 0.05);
      expect(at(f, 31, 30)!.item?.s).toBe('NaCl');
      at(f, 30, 30)!.item = { s: 'H2O', p: 1, m: 0 }; run(f, 0.05);
      expect(at(f, 30, 31)!.item?.s).toBe('H2O');
    }
    // 納品所は元素を飲み込む：NaCl 10 個で Na と Cl が段階 1 になり、研究点が入る
    {
      const f = newWorld();
      place(f, 'belt', hx - 1, hy, 0);
      for (let i = 0; i < 10; i++) { at(f, hx - 1, hy)!.item = { s: 'NaCl', p: 1, m: 0 }; run(f, 0.1); }
      expect(f.fed).toEqual({ Na: 10, Cl: 10 });
      expect(fedTier(f, 'Na')).toBe(1);
      expect(fedTier(f, 'Fe')).toBe(0);
      expect(f.events).toContain('fed:Na:1');
      expect(f.points).toBe(20);
      expect(deserialize(serialize(f))!.fed.Cl).toBe(10);
    }
    // コンビナート：3 つとも必要な数に達して、はじめて達成
    {
      const f = newWorld();
      const ch = CHAPTERS.findIndex((c) => c.name.includes('コンビナート'));
      setChapter(f, ch);
      const g = currentGoal(f)!;
      expect(g.also).toEqual(['Cl2', 'H2']);
      const need = requiredOf(f, g);
      place(f, 'belt', hx - 1, hy, 0);
      const give = (s: string, n: number) => { for (let i = 0; i < n; i++) { at(f, hx - 1, hy)!.item = { s, p: 1, m: 0 }; run(f, 0.1); } };
      give('NaOH', need + 5);
      expect(goalCount(f)).toBe(0);            // ほかの 2 つがまだ 0
      expect(f.multi.NaOH).toBe(need);         // 必要な数を超えた分は数えない
      give('Cl2', need);
      expect(f.progress[ch]).toBe(0);
      give('H2', need - 1);
      expect(goalCount(f)).toBe(need - 1);
      give('H2', 1);
      expect(f.progress[ch]).toBe(1);
      expect(f.multi).toEqual({});
    }
    // 電力
    const run2 = (boost: boolean) => {
      const w = newWorld();
      place(w, 'electrolyzer', 10, 10, 0);
      const c = at(w, 10, 10)!;
      configure(c, rec('water-electrolysis'), ['H2', 'O2'], ['c', 'a']);
      place(w, 'vent', 11, 9, 0); place(w, 'vent', 11, 12, 0);
      place(w, 'belt', 9, 10, 0);
      for (let i = 0; i < 20 * 60; i++) { c.inBuf = { H2O: 8 }; if (boost && i % 60 === 0) at(w, 9, 10)!.item = { s: 'e', p: 1, m: 0 }; step(w, 1 / 60); }
      return c.n!;
    };
    const slow = run2(false), fast = run2(true);
    expect(fast).toBeGreaterThan(slow * 1.6);
    // 排出：塩素を 10 個捨てると 2 点失う。水素や酸素は失わない
    const w = newWorld();
    w.points = 10;
    place(w, 'vent', 20, 20, 0);
    place(w, 'belt', 19, 20, 0);
    for (let i = 0; i < 10; i++) { at(w, 19, 20)!.item = { s: 'Cl2', p: 1, m: 0 }; run(w, 0.1); }
    expect(w.emitted.Cl2).toBe(10);
    expect(w.points).toBe(10); // 捨てても罰はない。数だけ残る
    for (let i = 0; i < 10; i++) { at(w, 19, 20)!.item = { s: 'O2', p: 1, m: 0 }; run(w, 0.1); }
    expect(w.points).toBe(10);
    expect(w.emitted.O2).toBeUndefined();
    // 有毒な気体には、処理の反応が用意されている
    for (const g of ['Cl2', 'SO2', 'NO2', 'H2S', 'HCl', 'NH3', 'CO']) {
      expect(TOXIC[g], g).toBeTruthy();
      expect(RECIPES.some((r) => r.machine === 'reactor' && r.inputs.some(([s]) => s === g) && r.outputs.every(([s]) => !TOXIC[s])), `${g} の処理`).toBe(true);
    }
    // 操業評価：速く納めると S、ゆっくりだと C
    const grade = (gap: number) => {
      const g = newWorld();
      place(g, 'belt', hx - 1, hy, 0);
      for (let i = 0; i < 10; i++) { at(g, hx - 1, hy)!.item = { s: 'N2', p: 1, m: 0 }; run(g, gap); }
      return g.lastGrade;
    };
    expect(grade(0.5)!.g).toBe('S');
    expect(grade(0.5)!.bonus).toBe(30);
    expect(grade(15)!.g).toBe('C');
    const g2 = newWorld();
    place(g2, 'belt', hx - 1, hy, 0);
    for (let i = 0; i < 10; i++) { at(g2, hx - 1, hy)!.item = { s: 'N2', p: 1, m: 0 }; run(g2, 0.5); }
    expect(g2.grades['0:0']).toBe('S');
    expect(deserialize(serialize(g2))!.grades['0:0']).toBe('S');
  });

  it('地下ベルトは、あいだに何があってもくぐって運ぶ', () => {
    const w = newWorld();
    place(w, 'belt', 10, 10, 0);
    place(w, 'tunnel', 11, 10, 0);
    place(w, 'reactor', 12, 10, 0);          // あいだに 2×2 の装置
    place(w, 'belt', 14, 9, 1); place(w, 'belt', 14, 10, 1); // 交差するベルト
    expect(autoDir(w, 'tunnel', 15, 10)).toBe(0); // 2 つ目は入口と同じ向きになる
    place(w, 'tunnel', 15, 10, 0);
    place(w, 'belt', 16, 10, 0);
    expect(tunnelPair(w, at(w, 11, 10)!)).toBe(at(w, 15, 10));
    expect(tunnelPair(w, at(w, 15, 10)!)).toBeNull();
    expect(inflow(w, 16, 10)).toBe(0);            // 出口の先は流れ込みとして認識する
    expect(inflow(w, 12, 10)).toBeNull();         // 入口の先（地下）は地上へは出ない
    at(w, 10, 10)!.item = { s: 'N2', p: 1, m: 0 };
    run(w, 5);
    expect(at(w, 16, 10)!.item?.s).toBe('N2');
    expect(at(w, 12, 10)!.inBuf).toBeUndefined(); // あいだの装置には入らない
    // 届く距離をこえると、つながらない
    place(w, 'tunnel', 30, 30, 0); place(w, 'tunnel', 30 + TUNNEL_RANGE + 1, 30, 0);
    expect(tunnelPair(w, at(w, 30, 30)!)).toBeNull();
    // 逆向きからは入れない
    place(w, 'belt', 12, 20, 2); place(w, 'tunnel', 11, 20, 0);
    at(w, 12, 20)!.item = { s: 'O2', p: 1, m: 0 };
    run(w, 1);
    expect(at(w, 11, 20)!.item).toBeNull();
  });

  it('貨物駅：積む駅から、同じ路線の降ろす駅へ列車が運ぶ', () => {
    const w = newWorld();
    place(w, 'station', 10, 10, 0);
    place(w, 'station', 60, 10, 0);
    const a = at(w, 10, 10)!, b = at(w, 60, 10)!;
    expect(a.big).toBe(true);
    b.role = 'out';
    expect(stationTarget(w, a)).toBe(b);
    b.ch = 2;
    expect(stationTarget(w, a)).toBeNull();   // 路線番号が違うとつながらない
    b.ch = 1;
    place(w, 'belt', 62, 10, 0); place(w, 'belt', 62, 11, 0); // 降ろす駅の正面の 2 つの口
    place(w, 'belt', 9, 10, 0);
    let got = 0;
    for (let i = 0; i < 40 * 60; i++) {
      const src = at(w, 9, 10)!;
      if (!src.item) src.item = { s: i % 2 ? 'N2' : 'O2', p: 1, m: 0 };
      for (const [x, y] of [[62, 10], [62, 11]]) { const o = at(w, x, y)!; if (o.item) { got++; o.item = null; } }
      step(w, 1 / 60);
    }
    expect(got).toBeGreaterThan(TRAIN_CAP * 2);   // 何往復かして届いている
    expect(a.n!).toBeGreaterThan(1);
    expect(a.buf!.length).toBeLessThanOrEqual(STATION_CAP);
    // 速さの目安：線路 100 マスでも、ベルト 1 本（毎分 120 個）の半分以上は運べる
    {
      const f = newWorld();
      place(f, 'station', 0, 100, 0); place(f, 'station', 60, 140, 0);
      const src = at(f, 0, 100)!, dst = at(f, 60, 140)!;
      dst.role = 'out';
      expect(railLength(src, dst)).toBe(100);
      let moved = 0;
      for (let i = 0; i < 60 * 60; i++) { src.buf = Array(STATION_CAP).fill('N2'); moved += dst.buf!.length; dst.buf = []; step(f, 1 / 60); }
      expect(moved).toBeGreaterThan(60);
      expect(moved).toBeLessThan(140);
    }
    // 降ろす駅は受け取らない（ベルトで押し込めない）
    place(w, 'belt', 59, 10, 0);
    at(w, 59, 10)!.item = { s: 'H2', p: 1, m: 0 };
    run(w, 1);
    expect(at(w, 59, 10)!.item?.s).toBe('H2');
    // 行き先を消すと、列車は積み荷を持って引き返し、駅に戻す
    const w2 = newWorld();
    place(w2, 'station', 10, 10, 0); place(w2, 'station', 40, 10, 0);
    at(w2, 40, 10)!.role = 'out';
    at(w2, 10, 10)!.buf = ['N2', 'N2', 'N2'];
    run(w2, 3.5);
    expect(at(w2, 10, 10)!.tr!.p).toBeGreaterThan(0);
    remove(w2, 40, 10);
    run(w2, 10);
    expect(at(w2, 10, 10)!.tr!.cargo.length + at(w2, 10, 10)!.buf!.length).toBe(3);
    // 搬出口から出したもの（数えない印つき）は、列車で運んでも印が残る
    const w3 = newWorld();
    place(w3, 'station', hx - 30, hy - 1, 0); place(w3, 'station', hx - 2, hy - 1, 0); // 正面・右の口が納品所に向く
    at(w3, hx - 2, hy - 1)!.role = 'out';
    at(w3, hx - 30, hy - 1)!.buf = ['!N2', '!N2'];
    run(w3, 12);
    expect(w3.stock.N2).toBe(2);
    expect(w3.delivered.N2).toBeUndefined();
    const r = deserialize(serialize(w))!;
    expect(at(r, 60, 10)!.role).toBe('out');
  });

  it('自分で敷いた線路があれば、列車はその道のりを走る', () => {
    const w = newWorld();
    place(w, 'station', 10, 10, 0); place(w, 'station', 30, 10, 0);
    const a = at(w, 10, 10)!, b = at(w, 30, 10)!;
    b.role = 'out';
    const auto = railOf(w, a)!;
    expect(auto.custom).toBe(false);
    expect(auto.len).toBe(20);
    // 遠回りの線路：下へ 10、右へ 20、上へ 10
    layRail(w, [[10, 10], [10, 20], [30, 20], [30, 10]]);
    const own = railOf(w, a)!;
    expect(own.custom).toBe(true);
    expect(own.len).toBe(40);
    expect(pathLength(own.pts)).toBe(40);
    a.buf = ['N2'];
    run(w, 2.6);                         // 発車
    const p1 = a.tr!.p;
    run(w, 0.5);
    expect(a.tr!.p - p1).toBeCloseTo((trainSpeed(w) * RAIL_BOOST * 0.5) / 40, 1); // 敷いた線路は速いが、長いぶん進む割合は小さい
    // 行き先の番線を変えると、敷いた線路は使われなくなる
    b.ch = 2;
    expect(railOf(w, a)).toBeNull();
    b.ch = 1; remove(w, 30, 10);
    expect(railOf(w, a)).toBeNull();
  });

  it('列車は、降ろす駅がいくつもあれば順番に配り、編成を増やせば多く運ぶ', () => {
    // 分岐：同じ番線の降ろす駅 2 つへ、交互に届く
    const w = newWorld();
    place(w, 'station', 10, 10, 0); place(w, 'station', 30, 10, 0); place(w, 'station', 10, 40, 0);
    const a = at(w, 10, 10)!, b1 = at(w, 30, 10)!, b2 = at(w, 10, 40)!;
    b1.role = 'out'; b2.role = 'out';
    expect(stationTargets(w, a)).toEqual([b1, b2]);   // 近い順
    for (let i = 0; i < 60 * 60; i++) { a.buf = Array(STATION_CAP).fill('N2'); step(w, 1 / 60); if (b1.buf!.length > 40) b1.buf = []; if (b2.buf!.length > 40) b2.buf = []; }
    expect(b1.buf!.length + b2.buf!.length).toBeGreaterThan(0);
    const w1 = newWorld();
    place(w1, 'station', 10, 10, 0); place(w1, 'station', 30, 10, 0); place(w1, 'station', 10, 40, 0);
    at(w1, 30, 10)!.role = 'out'; at(w1, 10, 40)!.role = 'out';
    at(w1, 10, 10)!.buf = Array(TRAIN_CAP * 2).fill('O2');
    run(w1, 30);
    expect(at(w1, 30, 10)!.buf!.length).toBe(TRAIN_CAP);  // 1 便目と 2 便目が別々の駅へ
    expect(at(w1, 10, 40)!.buf!.length).toBe(TRAIN_CAP);
    // 自分で線路を敷くと、その 1 か所だけに送る
    const w2 = newWorld();
    place(w2, 'station', 10, 10, 0); place(w2, 'station', 30, 10, 0); place(w2, 'station', 10, 40, 0);
    at(w2, 30, 10)!.role = 'out'; at(w2, 10, 40)!.role = 'out';
    layRail(w2, [[10, 10], [10, 40]]);
    at(w2, 10, 10)!.buf = Array(TRAIN_CAP * 2).fill('O2');
    run(w2, 40);
    expect(at(w2, 30, 10)!.buf!.length).toBe(0);
    expect(at(w2, 10, 40)!.buf!.length).toBe(TRAIN_CAP * 2);
    // 増発：3 編成にすると、1 編成のときの 2 倍以上運ぶ
    const moved = (cars: number) => {
      const f = newWorld();
      place(f, 'station', 0, 100, 0); place(f, 'station', 60, 140, 0);
      const src = at(f, 0, 100)!, dst = at(f, 60, 140)!;
      dst.role = 'out'; src.cars = cars;
      let n = 0;
      for (let i = 0; i < 90 * 60; i++) { src.buf = Array(STATION_CAP).fill('N2'); n += dst.buf!.length; dst.buf = []; step(f, 1 / 60); }
      return n;
    };
    const one = moved(1), three = moved(3);
    expect(three).toBeGreaterThan(one * 2);
    // 編成を減らすと、駅に戻った空の編成から外れる
    const g = newWorld();
    place(g, 'station', 10, 10, 0); place(g, 'station', 20, 10, 0);
    at(g, 20, 10)!.role = 'out';
    const src = at(g, 10, 10)!;
    src.cars = 3; run(g, 1);
    expect(src.xtr!.length).toBe(2);
    src.cars = 1; run(g, 1);
    expect(src.xtr!.length).toBe(0);
  });

  it('コンビナートの最初の指令を、実際に工場を組んで通す（入り江 → 蒸留 → 電解 → 列車 → 納品所）', () => {
    const w = newWorld();
    const ch = CHAPTERS.findIndex((c) => c.name.includes('コンビナート'));
    setChapter(w, ch);
    const g = currentGoal(w)!;
    expect([g.s, ...g.also!]).toEqual(['NaOH', 'Cl2', 'H2']);
    // 入り江 (53,21) で海水を採り、蒸留塔で H₂O と NaCl に分ける
    expect(place(w, 'extractor', 53, 21, 0)).toBeNull();
    expect(place(w, 'separator', 54, 21, 0)).toBeNull();
    configure(at(w, 54, 21)!, rec('seawater-distillation'), ['H2O', 'NaCl']);   // H₂O は正面 (56,21) へ、NaCl は右手 (55,23) へ
    expect(outPort(at(w, 54, 21)!, 0)).toMatchObject({ tx: 56, ty: 21 });
    expect(outPort(at(w, 54, 21)!, 1)).toMatchObject({ tx: 55, ty: 23 });
    // 電解槽は蒸留塔の正面に直結。NaCl はベルトで回り込ませて下の面から入れる
    expect(place(w, 'electrolyzer', 56, 21, 0)).toBeNull();
    expect(place(w, 'belt', 55, 23, 0)).toBeNull();
    expect(place(w, 'belt', 56, 23, 3)).toBeNull();
    const cell = at(w, 56, 21)!;
    const v = judge('electrolyzer', { reactants: [['NaCl', 2], ['H2O', 2]], products: [['H2', 1], ['NaOH', 2], ['Cl2', 1]], poles: ['c', 'c', 'a'], condition: '飽和食塩水（陽イオン交換膜）' });
    expect(v.ok).toBe(true);
    configure(cell, rec('brine-electrolysis'), ['H2', 'NaOH', 'Cl2'], ['c', 'c', 'a']);
    // 陰極側（H₂ と NaOH）は北へ、陽極側（Cl₂）は南へ出る。それぞれ積む駅で受ける
    expect(outPort(cell, 0)).toMatchObject({ tx: 57, ty: 20 });
    expect(outPort(cell, 1)).toMatchObject({ tx: 56, ty: 20 });
    expect(outPort(cell, 2)).toMatchObject({ tx: 57, ty: 23 });
    expect(place(w, 'station', 56, 19, 0)).toBeNull();      // 1 番線：H₂ と NaOH を混載
    expect(place(w, 'station', 57, 23, 0)).toBeNull();      // 2 番線：Cl₂
    at(w, 57, 23)!.ch = 2;
    // 納品所の西と東に降ろす駅
    expect(place(w, 'station', hx - 2, hy, 0)).toBeNull();
    at(w, hx - 2, hy)!.role = 'out';
    expect(place(w, 'station', hx + 2, hy, 2)).toBeNull();
    Object.assign(at(w, hx + 2, hy)!, { role: 'out', ch: 2 });
    let sec = 0;
    while (w.progress[ch] === 0 && sec < 600) { run(w, 1); sec++; }
    expect(w.progress[ch], `かかった時間 ${sec} 秒、納めた数 ${JSON.stringify(w.multi)}`).toBe(1);
    expect(sec).toBeLessThan(400);
    expect(w.spilled.H2O).toBeGreaterThan(0);               // 水は余るので、あふれて捨てられる
    expect(w.fed.Na).toBeGreaterThanOrEqual(10);            // 納品所は Na・O・H・Cl を飲み込んだ
    expect(w.grades[`${ch}:0`]).toBeTruthy();
  });

  it('コンビナートの全指令：最終段の装置を並べ、同時に動かして列車で運べば、どれも達成できる', () => {
    const ch = CHAPTERS.findIndex((c) => c.name.includes('コンビナート'));
    CHAPTERS[ch].goals.forEach((g, gi) => {
      const w = newWorld();
      setChapter(w, ch);
      w.progress[ch] = gi;
      expect(currentGoal(w)).toBe(g);
      place(w, 'station', hx - 2, hy, 0);
      at(w, hx - 2, hy)!.role = 'out';
      const feed: [ReturnType<typeof at>, typeof RECIPES[number]][] = [];
      [g.s, ...g.also!].forEach((s, i) => {
        // その物質を作る装置を 1 台ずつ。原料は切らさずに与える（上流は別のテストで確かめている）
        const r = RECIPES.find((x) => x.machine !== 'collector' && x.machine !== 'battery' && productsOf(x).some(([o]) => o === s))!;
        expect(r, s).toBeTruthy();
        const x = 100 + i * 14, y = 100;
        expect(place(w, r.machine, x, y, 0), `${s} の装置`).toBeNull();
        const e = at(w, x, y)!, order = productsOf(r).map(([o]) => o);
        configure(e, r, order, r.machine === 'electrolyzer' ? order.map((_, k) => (poleOf(r, k) === 'a' ? 'a' : 'c')) : undefined);
        // 先に、欲しい生成物の出口へ積む駅を置く。残りの出口は廃棄口でふさぐ（駅と重なる出口は、そのまま駅に入る）
        order.forEach((o, k) => {
          const p = outPort(e, k);
          if (o === s) expect(place(w, 'station', p.tx + (p.d === 2 ? -1 : 0), p.ty + (p.d === 3 ? -1 : 0), 0), `${s} の積む駅`).toBeNull();
        });
        order.forEach((o, k) => { const p = outPort(e, k); if (o !== s) place(w, 'vent', p.tx, p.ty, 0); });
        feed.push([e, r]);
      });
      let sec = 0;
      while (w.progress[ch] === gi && sec < 900) {
        for (let k = 0; k < 60; k++) { for (const [e, r] of feed) for (const [s, n] of r.inputs) e!.inBuf![s] = n * 2; step(w, 1 / 60); }
        sec++;
      }
      expect(w.progress[ch], `${g.s} ほか：${sec} 秒で ${JSON.stringify(w.multi)}`).toBe(gi + 1);
    });
  });

  it('量産の指令：求められた速さを保ち続けたときだけ達成になる', () => {
    const ch = CHAPTERS.findIndex((c) => c.name.includes('量産'));
    const build = (extractors: number) => {
      const w = newWorld();
      setChapter(w, ch);
      const g = currentGoal(w)!;
      expect(g.s).toBe('N2');
      expect(requiredOf(w, g)).toBe(g.n);                 // 納品所が大きくなっても、秒数は変わらない
      expect(resourceAt(40, 18)).toBe('air');
      place(w, 'extractor', 40, 18, 0);
      if (extractors > 1) place(w, 'extractor', 41, 20, 3); // 2 台目は下の面から
      place(w, 'separator', 41, 18, 0);
      configure(at(w, 41, 18)!, rec('air-distillation'), ['N2', 'O2']);
      place(w, 'vent', 42, 20, 0);
      place(w, 'station', 43, 18, 0);
      place(w, 'station', hx - 2, hy, 0);
      at(w, hx - 2, hy)!.role = 'out';
      return w;
    };
    // 採取機 1 台では毎分 48 個までしか出ない：いつまで待っても達成にならない
    const slow = build(1);
    let peak = 0;
    for (let i = 0; i < 150; i++) { run(slow, 1); peak = Math.max(peak, goalRate(slow)); }
    expect(peak).toBeGreaterThan(30);
    expect(peak).toBeLessThan(80);
    expect(slow.progress[ch]).toBe(0);
    expect(slow.hold).toBe(0);
    // 採取機 2 台なら毎分 96 個：20 秒保てて達成
    const fast = build(2);
    let sec = 0, top = 0;
    while (fast.progress[ch] === 0 && sec < 300) { run(fast, 1); sec++; top = Math.max(top, goalRate(fast)); }
    expect(fast.progress[ch], `${sec} 秒、最高 毎分 ${top} 個`).toBe(1);
    expect(top).toBeGreaterThanOrEqual(80);
    expect(fast.hold).toBe(0);
    expect(fast.rateWin.length).toBe(0);
    // 装置の能力：ハーバー・ボッシュ法は 1 台で毎分 30 回。NH₃ なら毎分 60 個
    const w = newWorld();
    place(w, 'reactor', 10, 10, 0);
    const per = reactionsPerMin(w, at(w, 10, 10)!, rec('haber-bosch'));
    expect(per).toBeCloseTo(60 / rec('haber-bosch').time, 5);
    expect(per * 2).toBeCloseTo(60, 5);                    // 1 回 2 秒なので毎分 30 回、NH₃ は毎分 60 個
    at(w, 10, 10)!.pw = 5;                                 // 電力は電解槽だけの話だが、係数の扱いを確かめる
    expect(reactionsPerMin(w, at(w, 10, 10)!, rec('haber-bosch'))).toBeCloseTo(60, 5);
  });

  it('量産の全指令：最終段の装置を、能力から計算した台数だけ並べれば、求められた速さに届く', () => {
    const ch = CHAPTERS.findIndex((c) => c.name.includes('量産'));
    CHAPTERS[ch].goals.forEach((g, gi) => {
      const w = newWorld();
      setChapter(w, ch);
      w.progress[ch] = gi;
      place(w, 'station', hx - 2, hy, 0);
      at(w, hx - 2, hy)!.role = 'out';
      const r = RECIPES.find((x) => x.machine !== 'collector' && x.machine !== 'battery' && productsOf(x).some(([o]) => o === g.s))!;
      const coef = productsOf(r).find(([o]) => o === g.s)![1];
      const feed: ReturnType<typeof at>[] = [];
      let k = 0;
      // 1 台の能力（毎分の反応回数 × 係数）で割って、必要な台数を決める
      for (let i = 0; i < 6; i++) {
        const x = 100 + i * 14, y = 100;
        if (i > 0 && k * reactionsPerMin(w, feed[0]!, r) * coef >= g.rate! * 1.15) break;
        expect(place(w, r.machine, x, y, 0)).toBeNull();
        const e = at(w, x, y)!, order = productsOf(r).map(([o]) => o);
        configure(e, r, order, r.machine === 'electrolyzer' ? order.map((_, q) => (poleOf(r, q) === 'a' ? 'a' : 'c')) : undefined);
        order.forEach((o, q) => {
          const p = outPort(e, q);
          if (o !== g.s) return;
          const sx2 = p.tx + (p.d === 2 ? -1 : 0), sy2 = p.ty + (p.d === 3 ? -1 : 0);
          expect(place(w, 'station', sx2, sy2, 0)).toBeNull();
          at(w, sx2, sy2)!.cars = 3;   // 納品所まで 130 マスあるので、1 編成では運びきれない。増発する
        });
        order.forEach((o, q) => { const p = outPort(e, q); if (o !== g.s) place(w, 'vent', p.tx, p.ty, 0); });
        feed.push(e); k++;
      }
      expect(k, `${g.s}：台数`).toBeLessThanOrEqual(4);
      let sec = 0, top = 0;
      while (w.progress[ch] === gi && sec < 400) {
        for (let t2 = 0; t2 < 60; t2++) { for (const e of feed) for (const [s2, n] of r.inputs) e!.inBuf![s2] = n * 2; step(w, 1 / 60); }
        sec++; top = Math.max(top, goalRate(w));
      }
      expect(w.progress[ch], `${g.s}：${k} 台、${sec} 秒、最高 毎分 ${top} 個（目標 ${g.rate}）`).toBe(gi + 1);
    });
  });

  it('1 マスだった頃の装置は、そのまま 3 つの出口で動く', () => {
    const w = newWorld();
    w.progress[0] = 2;
    const old = JSON.parse(serialize(w));
    old.ents.push({ kind: 'reactor', x: hx - 1, y: hy, dir: 0, recipe: 'haber-bosch', outOrder: ['NH3'], inBuf: { N2: 1, H2: 3 }, outBuf: [0], busy: false, prog: 0 });
    const r = deserialize(JSON.stringify(old))!;
    const e = at(r, hx - 1, hy)!;
    expect(e.big).toBeUndefined();
    expect(slotCount(e)).toBe(3);
    run(r, 4);
    expect(r.delivered.NH3).toBe(2);
  });

  it('立体交差の先で曲がるベルトは、立体交差からの流れ込みを向きとして認識する', () => {
    const w = newWorld();
    place(w, 'belt', 10, 10, 0);     // → 立体交差へ
    place(w, 'bridge', 11, 10, 0);
    place(w, 'belt', 12, 10, 1);     // 立体交差の先で下へ曲がる
    place(w, 'belt', 11, 9, 1);      // 縦の流れ
    place(w, 'belt', 11, 11, 0);     // 立体交差の下で右へ曲がる
    expect(inflow(w, 12, 10, 1)).toBe(0);
    expect(inflow(w, 11, 11, 0)).toBe(1);
    expect(autoDir(w, 'reactor', 12, 10)).toBe(0);
    // 流れ込みのない向きは認識しない
    place(w, 'bridge', 30, 30, 0);
    place(w, 'belt', 31, 30, 1);
    expect(inflow(w, 31, 30, 1)).toBeNull();
    // 実際に物が曲がって流れる
    at(w, 10, 10)!.item = { s: 'N2', p: 0, m: 0 };
    place(w, 'belt', 12, 11, 1);
    run(w, 1.6);
    expect(at(w, 12, 11)!.item?.s ?? at(w, 12, 10)!.item?.s).toBe('N2');
  });
});

describe('置く手ざわり：複数本引きと合流', () => {
  it('平行なベルトの道筋：角で内側は早く、外側は遅く曲がり、重ならない', async () => {
    const { lanePaths } = await import('../src/engine/lanes');
    // 右へ 4 マス進んでから下へ 3 マス（右に曲がる）。2 本目は右手（下側）にずれるので内側になる
    const center: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3]];
    const [a, b, c] = lanePaths(center, 3);
    expect(a.map((q) => [q.x, q.y])).toEqual(center);
    expect(b[0]).toMatchObject({ x: 0, y: 1, dir: 0 });
    expect(b.map((q) => [q.x, q.y])).toEqual([[0, 1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 3]]);
    expect(b[3]).toMatchObject({ dir: 1, straight: false }); // 角
    expect(c.map((q) => [q.x, q.y])).toEqual([[0, 2], [1, 2], [2, 2], [2, 3]]);
    const all = [...a, ...b, ...c].map((q) => `${q.x},${q.y}`);
    expect(new Set(all).size).toBe(all.length);
    // 左に曲がる（右へ進んでから上へ）：2 本目は外側になり、1 マス先で曲がる
    const [, l2] = lanePaths([[0, 0], [1, 0], [2, 0], [2, -1], [2, -2]], 2);
    expect(l2.map((q) => [q.x, q.y])).toEqual([[0, 1], [1, 1], [2, 1], [3, 1], [3, 0], [3, -1], [3, -2]]);
    // 1 マスだけ：向きは引数で決まる
    expect(lanePaths([[5, 5]], 2, 1).map((l) => [l[0].x, l[0].y, l[0].dir])).toEqual([[5, 5, 1], [4, 5, 1]]);
  });

  it('合流点は交互に通し、優先を決めるとその流れを先に通す', () => {
    const run2 = (pri?: 0 | 1 | 2 | 3) => {
      const w = newWorld();
      // 本線：左から右へ。支線：上から本線の (22, 20) へ合流
      for (let x = 18; x <= 26; x++) place(w, 'belt', x, 20, 0);
      for (let y = 16; y <= 19; y++) place(w, 'belt', 22, y, 1);
      place(w, 'vent', 27, 20, 0);
      const m = at(w, 22, 20)!;
      let a = 0, b = 0;
      for (let i = 0; i < 60 * 40; i++) {
        // 両方の流れを切らさない
        const p = at(w, 18, 20)!, q = at(w, 22, 16)!;
        if (!p.item) p.item = { s: 'N2', p: 0, m: w.tick };
        if (!q.item) q.item = { s: 'O2', p: 0, m: w.tick };
        if (i === 300 && pri !== undefined) m.pri = pri;
        const before = m.item;
        step(w, 1 / 60);
        if (m.item && m.item !== before && i > 600) { if (m.item.s === 'N2') a++; else b++; }
      }
      return [a, b];
    };
    const [a0, b0] = run2();
    expect(a0).toBeGreaterThan(20);
    expect(Math.abs(a0 - b0)).toBeLessThanOrEqual(2);       // 交互
    const [a1, b1] = run2(0);                                // 本線（右向きの流れ）を優先
    expect(b1).toBe(0);
    expect(a1).toBeGreaterThan(a0 * 1.6);
    const [a2, b2] = run2(1);                                // 支線（下向きの流れ）を優先
    expect(a2).toBe(0);
    expect(b2).toBeGreaterThan(b0 * 1.6);
  });
});

describe('研究・信号・2 階・設計図の共有・区画', () => {
  it('研究：段の条件、先に要る研究、二者択一の切り替え', async () => {
    const { RESEARCH, doResearch, has, researchBlock, maxLanes, tunnelRange, trainCap, trainSpeed: ts2 } = await import('../src/engine/world');
    expect(new Set(RESEARCH.map((r) => r.id)).size).toBe(RESEARCH.length);
    for (const r of RESEARCH) for (const n of r.needs ?? []) expect(RESEARCH.some((x) => x.id === n)).toBe(true);
    const w = newWorld();
    const R = (id: string) => RESEARCH.find((r) => r.id === id)!;
    expect(doResearch(w, 'lanes3')).toBe(false);            // 研究点が足りない
    w.points = 1000;
    expect(maxLanes(w)).toBe(2);
    expect(researchBlock(w, R('lanes4'))).toMatch(/2 個/);  // 第 2 段はまだ開かない
    expect(doResearch(w, 'lanes3')).toBe(true);
    expect(w.points).toBe(1000 - R('lanes3').cost);
    expect(maxLanes(w)).toBe(3);
    expect(doResearch(w, 'lanes3')).toBe(false);            // 二重には取れない
    expect(tunnelRange(w)).toBe(TUNNEL_RANGE);
    expect(doResearch(w, 'tunnel')).toBe(true);
    expect(tunnelRange(w)).toBe(12);
    // 二者択一：急行にしてから重連へ切り替えると、急行は取り消される
    const v0 = ts2(w);
    expect(doResearch(w, 'express')).toBe(true);
    expect(ts2(w)).toBeCloseTo(v0 * 1.5);
    expect(doResearch(w, 'heavy')).toBe(true);
    expect(has(w, 'express')).toBe(false);
    expect(ts2(w)).toBeCloseTo(v0);
    expect(trainCap(w)).toBe(40);
    // 保存して読み直しても残る。知らない id は捨てる
    const j = JSON.parse(serialize(w)); j.research.push('nonsense');
    expect(deserialize(JSON.stringify(j))!.research.sort()).toEqual([...w.research].sort());
    expect(toolUnlocked(w, MACHINES.sensor)).toBe(false);
    doResearch(w, 'logic');
    expect(toolUnlocked(w, MACHINES.sensor)).toBe(true);
  });

  it('検知器と弁：主製品のラインが詰まったときだけ、捨て口が開く', async () => {
    const { signalOn } = await import('../src/engine/world');
    const w = newWorld();
    // 本線：(10,10) から右へ。(13,10) の分配器で、正面は検知器 → 行き止まりのベルト、右手（下）は弁 → 廃棄口
    for (const x of [10, 11, 12]) place(w, 'belt', x, 10, 0);
    place(w, 'splitter', 13, 10, 0);
    place(w, 'sensor', 14, 10, 0);
    for (const x of [15, 16, 17]) place(w, 'belt', x, 10, 0);
    place(w, 'gate', 13, 11, 1);
    place(w, 'vent', 13, 12, 1);
    place(w, 'belt', 13, 9, 3); place(w, 'vent', 13, 8, 3); // 分配器の左手は、いつでも流れる別の捨て口
    const feed = () => { const b = at(w, 10, 10)!; if (!b.item) b.item = { s: 'N2', p: 0, m: w.tick }; };
    for (let i = 0; i < 60 * 3; i++) { feed(); step(w, 1 / 60); }
    // 本線の先は行き止まりなので、じきに詰まって信号が点き、弁が開く
    for (let i = 0; i < 60 * 12; i++) { feed(); step(w, 1 / 60); }
    expect(signalOn(w, 1)).toBe(true);
    const vented = w.vented.N2 || 0;
    expect(vented).toBeGreaterThan(3);
    // 番号の違う弁は開かない
    at(w, 13, 11)!.ch = 2;
    for (let i = 0; i < 60 * 3; i++) { feed(); step(w, 1 / 60); }
    expect(at(w, 13, 11)!.item).not.toBeNull();
    // 「来ていない間だけ通す」にすると流れる
    at(w, 13, 11)!.test = 'off';
    const before = w.vented.N2 || 0;
    for (let i = 0; i < 60 * 3; i++) { feed(); step(w, 1 / 60); }
    expect(w.vented.N2).toBeGreaterThan(before);
    // 物質の検知：O2 が通ったら 3 秒間だけ点く
    const w2 = newWorld();
    for (const x of [10, 11]) place(w2, 'belt', x, 10, 0);
    place(w2, 'sensor', 12, 10, 0); place(w2, 'vent', 13, 10, 0);
    Object.assign(at(w2, 12, 10)!, { test: 'is:O2', ch: 5 });
    at(w2, 10, 10)!.item = { s: 'N2', p: 0, m: 0 };
    for (let i = 0; i < 120; i++) step(w2, 1 / 60);
    expect(signalOn(w2, 5)).toBe(false);
    at(w2, 10, 10)!.item = { s: 'O2', p: 0, m: 0 };
    for (let i = 0; i < 120; i++) step(w2, 1 / 60);
    expect(signalOn(w2, 5)).toBe(true);
    for (let i = 0; i < 60 * 4; i++) step(w2, 1 / 60);
    expect(signalOn(w2, 5)).toBe(false);
  });

  it('2 階：昇降機で上がり、2 階のベルトを通って、降りてくる', async () => {
    const { FLOOR_DY, floorOf, groundY, liftPartner } = await import('../src/engine/world');
    const w = newWorld(), U = FLOOR_DY;
    // 1 階：ベルト → 昇降機（上りの入口）。2 階：出口 → ベルト → 昇降機（下りの入口）。1 階：出口 → 廃棄口
    place(w, 'belt', 10, 10, 0);
    expect(place(w, 'lift', 11, 10, 0)).toBeNull();
    const up = at(w, 11, 10)!, upOut = liftPartner(w, up)!;
    expect([up.role, upOut.role, floorOf(upOut.y), groundY(upOut.y)]).toEqual(['in', 'out', 1, 10]);
    for (const x of [12, 13, 14]) place(w, 'belt', x, 10 + U, 0);
    // 1 階の同じ場所には装置を置ける（2 階のベルトの下）
    expect(place(w, 'reactor', 12, 10, 0)).toBeNull();
    expect(place(w, 'lift', 15, 10 + U, 0)).toBeNull();     // 2 階に置いた側が入口
    const down = at(w, 15, 10 + U)!;
    expect(liftPartner(w, down)!.y).toBe(10);
    place(w, 'vent', 16, 10, 0);
    expect(place(w, 'extractor', 20, 10 + U, 0)).toMatch(/1 階/);
    expect(place(w, 'lift', 12, 10 + U, 0)).not.toBeNull(); // ふさがっている
    for (let i = 0; i < 60 * 8; i++) { const b = at(w, 10, 10)!; if (!b.item) b.item = { s: 'N2', p: 0, m: w.tick }; step(w, 1 / 60); }
    expect(w.vented.N2).toBeGreaterThan(5);
    // 保存して読み直しても、階と組が残る
    const w2 = deserialize(serialize(w))!;
    expect(liftPartner(w2, at(w2, 11, 10)!)!.role).toBe('out');
    // 片方を消すと、もう片方も消える
    remove(w, 11, 10);
    expect(at(w, 11, 10 + U)).toBeUndefined();
    // 2 階でも、置く向きは納品所の方角になる
    expect(autoDir(w, 'belt', HUB_TILES[0][0] - 10, HUB_TILES[0][1] + U)).toBe(0);
  });

  it('設計図は文字列にして渡せる。壊れた文字列や知らない設定は受けつけない', async () => {
    const { encodeBlueprint, decodeBlueprint } = await import('../src/engine/blueprint');
    const stamps = [
      { kind: 'reactor' as const, dx: 0, dy: 0, dir: 1 as const, recipe: 'haber-bosch', outOrder: ['NH3'], outSlot: [2] },
      { kind: 'belt' as const, dx: 2, dy: 0, dir: 0 as const },
      { kind: 'station' as const, dx: 0, dy: 3, dir: 0 as const, ch: 4, role: 'out' as const },
      { kind: 'analyzer' as const, dx: 3, dy: 3, dir: 2 as const, test: 'is:NH3' },
    ];
    const text = encodeBlueprint('アンモニアの列', stamps);
    expect(text.startsWith('CHEMYTH-BP1:')).toBe(true);
    const back = decodeBlueprint('  ' + text.slice(0, 40) + '\n' + text.slice(40) + ' ')!;   // 改行や空白が混ざってもよい
    expect(back.name).toBe('アンモニアの列');
    expect(back.stamps).toEqual(stamps);
    expect(decodeBlueprint('hello')).toBeNull();
    expect(decodeBlueprint(text.slice(0, -9))).toBeNull();
    const forge = (o: unknown) => 'CHEMYTH-BP1:' + btoa(JSON.stringify(o));
    expect(decodeBlueprint(forge({ n: 'x', s: [['hub', 0, 0, 0]] }))).toBeNull();          // 置けない種類
    expect(decodeBlueprint(forge({ n: 'x', s: [['belt', -1, 0, 0]] }))).toBeNull();
    expect(decodeBlueprint(forge({ n: 'x', s: [['belt', 0, 0, 7]] }))).toBeNull();
    expect(decodeBlueprint(forge({ n: 'x', s: [] }))).toBeNull();
    // 知らない反応は設定だけ外して、設備は残す
    const loose = decodeBlueprint(forge({ n: '', s: [['reactor', 0, 0, 0, 'no-such-recipe', ['NH3']]] }))!;
    expect(loose.stamps[0].recipe).toBeUndefined();
    expect(loose.name).toBe('受け取った設計図');
    // 大きい設計図でも往復できる
    const many = Array.from({ length: 1500 }, (_, i) => ({ kind: 'belt' as const, dx: i % 200, dy: Math.floor(i / 200), dir: (i % 4) as 0 | 1 | 2 | 3 }));
    expect(decodeBlueprint(encodeBlueprint('大', many))!.stamps.length).toBe(1500);
  });

  it('区画：近くの装置をまとめ、いちばん多く作っている物質と速さを出す', async () => {
    const { districtsOf } = await import('../src/engine/districts');
    const w = newWorld();
    // 区画 A：アンモニアの反応器 3 台。区画 B：離れた場所に水の電解槽 1 台
    for (const [x, y] of [[10, 10], [13, 10], [10, 13]]) { place(w, 'reactor', x, y, 0); configure(at(w, x, y)!, rec('haber-bosch'), ['NH3']); }
    place(w, 'electrolyzer', 60, 60, 0); configure(at(w, 60, 60)!, rec('water-electrolysis'), ['H2', 'O2'], ['c', 'a']);
    place(w, 'reactor', 30, 30, 0); // 設定していない装置は数えない
    for (let i = 0; i < 60 * 30; i++) { for (const [x, y] of [[10, 10], [13, 10]]) at(w, x, y)!.inBuf = { N2: 4, H2: 12 }; at(w, 10, 10)!.outBuf = [0]; at(w, 13, 10)!.outBuf = [0]; step(w, 1 / 60); }
    const ds = districtsOf(w);
    expect(ds.length).toBe(2);
    const a = ds.find((d) => d.s === 'NH3')!, b = ds.find((d) => d.s === 'H2')!;
    expect([a.n, a.x0, a.y0, a.x1, a.y1]).toEqual([3, 10, 10, 15, 15]);
    expect(a.perMin).toBeGreaterThan(reactionsPerMin(w, at(w, 10, 10)!, rec('haber-bosch')) * 2 * 2 * 0.5); // 2 台が動いている
    expect([b.n, b.perMin]).toEqual([1, 0]);
  });
});

describe('線路の網', () => {
  const run = (w: ReturnType<typeof newWorld>, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };
  it('幹線を共有する：2 つの積む駅の列車が、同じ線路を通って同じ降ろす駅へ届く', () => {
    const w = newWorld();
    // 積む駅 A1 (0,100)・A2 (0,110)、降ろす駅 B (60,100)。A2 の支線は (20,100) で幹線に合流する（分岐点）
    place(w, 'station', 0, 100, 0); place(w, 'station', 0, 110, 0); place(w, 'station', 60, 100, 0);
    const a1 = at(w, 0, 100)!, a2 = at(w, 0, 110)!, b = at(w, 60, 100)!;
    b.role = 'out';
    layRail(w, [[2, 100], [59, 100]]);                // 幹線
    expect(railRoute(w, a1, b)!.tiles.length).toBe(58);
    expect(railRoute(w, a2, b)).toBeNull();           // まだつながっていない
    expect(railOf(w, a2)!.custom).toBe(false);        // つながるまでは自動の仮線路
    layRail(w, [[2, 110], [20, 110], [20, 100]]);     // 支線
    const r2 = railRoute(w, a2, b)!;
    expect(r2.custom).toBe(true);
    expect(w.rails.get('20,100')).toBe(0b0111);          // 分岐点：右・下（支線）・左の 3 方向につながる
    expect(r2.tiles.some(([x, y]) => x === 40 && y === 100)).toBe(true); // 幹線を通る
    a1.cars = 2; a2.cars = 2;
    let got = 0, held = 0, clash = 0;
    for (let i = 0; i < 60 * 90; i++) {
      a1.buf = Array(STATION_CAP).fill('N2'); a2.buf = Array(STATION_CAP).fill('O2');
      got += b.buf!.length; b.buf = [];
      step(w, 1 / 60);
      const trs = [a1.tr!, ...a1.xtr!, a2.tr!, ...a2.xtr!];
      if (trs.some((t) => t.held)) held++;
      // 同じ向きの列車が同じマスに重なっていないか（位置の覚え書きは 1 マスに 1 編成）
      const seen = new Set<object>();
      for (const o of w.occ.values()) if (o.t === w.tick) { if (seen.has(o.o)) clash++; seen.add(o.o); }
    }
    expect(got).toBeGreaterThan(TRAIN_CAP * 20);
    expect(held).toBeGreaterThan(0);                  // 幹線が混んで、待つ列車が出る
    expect(clash).toBe(0);
    // 線路を切ると、つながらなくなり、自動の仮線路に戻る
    expect(removeRail(w, 40, 100)).toBe(true);
    expect(railRoute(w, a1, b)).toBeNull();
    expect(stationRoutes(w, a1).map((r) => r.custom)).toEqual([false]);
    expect(w.rails.get('39,100')! & 1).toBe(0);
    expect(addRail(w, [39, 100], [40, 100])).toBe(true);
    expect(addRail(w, [40, 100], [41, 100])).toBe(true);
    expect(addRail(w, [40, 100], [41, 100])).toBe(false); // もうつながっている
    expect(addRail(w, [40, 100], [42, 100])).toBe(false); // 隣り合っていない
    expect(railRoute(w, a1, b)).not.toBeNull();
  });

  it('分岐：1 つの積む駅から、線路でつながる降ろす駅だけへ順番に配る。保存しても線路は残る', () => {
    const w = newWorld();
    place(w, 'station', 0, 100, 0); place(w, 'station', 40, 90, 0); place(w, 'station', 40, 110, 0); place(w, 'station', 80, 100, 0);
    const a = at(w, 0, 100)!, b1 = at(w, 40, 90)!, b2 = at(w, 40, 110)!, b3 = at(w, 80, 100)!;
    for (const b of [b1, b2, b3]) b.role = 'out';
    // 幹線 → (30,100) で上下に分かれる。b3 にはつながない
    layRail(w, [[2, 100], [30, 100], [30, 91], [39, 91]]);
    layRail(w, [[30, 100], [30, 111], [39, 111]]);
    expect(stationRoutes(w, a).map((r) => r.dest).sort((p, q) => p.y - q.y)).toEqual([b1, b2]);
    a.buf = Array(TRAIN_CAP * 4).fill('N2');
    run(w, 60);
    expect(b1.buf!.length).toBeGreaterThan(0);
    expect(b2.buf!.length).toBeGreaterThan(0);
    expect(b3.buf!.length).toBe(0);                    // 線路がつながっていない駅へは行かない
    const r = deserialize(serialize(w))!;
    expect(r.rails.size).toBe(w.rails.size);
    expect(railRoute(r, at(r, 0, 100)!, at(r, 40, 90)!)!.custom).toBe(true);
    // 古いセーブ（駅ごとに線路を持っていた頃）は、地図の線路へ移される
    const old = JSON.parse(serialize(newWorld()));
    old.ents.push({ kind: 'station', x: 10, y: 10, dir: 0, big: true, role: 'in', ch: 1, buf: [], rail: [[10.5, 10.5], [10.5, 40.5]], railTo: '10,40' }, { kind: 'station', x: 10, y: 40, dir: 0, big: true, role: 'out', ch: 1, buf: [] });
    delete old.rails;
    const m = deserialize(JSON.stringify(old))!;
    expect(at(m, 10, 10)!.rail).toBeUndefined();
    expect(railRoute(m, at(m, 10, 10)!, at(m, 10, 40)!)!.custom).toBe(true);
    // 2 階には敷けない
    expect(addRail(m, [0, 100000], [1, 100000])).toBe(false);
  });
});

describe('反応の見せ方', () => {
  it('物質の見た目：色を言うのは決めてある物質だけ。物質の一覧にない id を持たない', async () => {
    const { LOOKS, appearance, hexOf } = await import('../src/content/looks');
    for (const id of Object.keys(LOOKS)) { expect(SUBSTANCES.some((s) => s.id === id), id).toBe(true); expect(LOOKS[id].hex).toMatch(/^#[0-9a-f]{6}$/); }
    // 有色の気体は 4 つだけ
    expect(Object.keys(LOOKS).filter((id) => sub(id).state === 'gas').sort()).toEqual(['Cl2', 'F2', 'NO2', 'O3']);
    expect(appearance('NO2')).toBe('赤褐色の気体');
    expect(appearance('Cl2')).toBe('黄緑色の気体');
    expect(appearance('CuSO4')).toBe('水溶液は青色');
    expect(appearance('N2')).toBe('気体');          // 色は言わない
    expect(appearance('NaNO3')).toBe('固体');
    expect(hexOf('N2')).toMatch(/^#/);
  });

  it('反応ごとの見た目：色の変化・気体・沈殿・加熱を、反応から決める', async () => {
    const { reactionLook, equationOf } = await import('../src/content/looks');
    const no2 = reactionLook(rec('ostwald-2'));
    expect([no2.gasPhase, no2.before !== no2.after, no2.notes.map((n) => n.text)]).toEqual([true, true, ['赤褐色の気体']]);
    const agcl = reactionLook(rec('precip-agcl'));
    expect([agcl.gasPhase, agcl.dry, agcl.solids.length, agcl.notes.map((n) => n.text)]).toEqual([false, false, 1, ['白色の沈殿']]);
    const furnace = reactionLook(rec('blast-furnace'));
    expect([furnace.dry, furnace.heat, furnace.solids.length]).toEqual([true, true, 0]);
    const kmno4 = reactionLook(rec('kmno4-h2o2'));
    expect(kmno4.notes.map((n) => `${n.made ? '後' : '前'}:${n.text}`)).toEqual(['前:水溶液は赤紫色', '後:水溶液はほぼ無色（淡桃色）']);
    const daniell = reactionLook(rec('daniell'));
    expect(daniell.notes.find((n) => n.id === 'Cu')!.text).toBe('赤色の固体が析出する');
    expect(reactionLook(rec('haber-bosch')).tag).toBe('Fe₃O₄');
    expect(equationOf(rec('haber-bosch'))).toBe('N₂ + 3H₂ ⇄ 2NH₃');
    expect(equationOf(rec('daniell'))).toContain('2e⁻');
    // すべての反応で、落ちずに決まる
    for (const r of RECIPES) { const l = reactionLook(r); expect(l.before).toMatch(/^#[0-9a-f]{6}$/); expect(l.after).toMatch(/^#[0-9a-f]{6}$/); }
  });

  it('原子の組み替え：両辺で原子の数が合い、どの原子も 1 回だけ飛ぶ', async () => {
    const { planScene, MAX_ATOMS } = await import('../src/content/sceneplan');
    const { atomsOf } = await import('../src/content/tokenlayout');
    // N₂ + 3H₂ → 2NH₃：原子 8 個（N 2 個、H 6 個）
    const hb = planScene(rec('haber-bosch'), 560, 150);
    expect([hb.left.length, hb.right.length, hb.flights!.length]).toEqual([4, 2, 8]);
    expect(hb.flights!.filter((f) => f.sym === 'N').length).toBe(2);
    expect(hb.flights!.every((f) => f.x1 > f.x0)).toBe(true);        // 左から右へ
    // 粒は枠の中に収まり、重ならない
    for (const side of [hb.left, hb.right]) for (const u of side) { expect(u.x - u.r).toBeGreaterThanOrEqual(0); expect(u.x + u.r).toBeLessThanOrEqual(560); expect(u.y - u.r).toBeGreaterThanOrEqual(0); expect(u.y + u.r).toBeLessThanOrEqual(150); }
    for (const [i, a] of hb.left.entries()) for (const b of hb.left.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 0.01);
    // 原子が多い物質は、個数ぶんに開く（C₆H₁₂O₆ は 24 個）
    expect(atomsOf('C6H12O6')!.length).toBe(24);
    expect(atomsOf('air')).toBeNull();
    // 混合物・高分子がからむ反応は、原子を飛ばさない
    expect(planScene(rec('air-distillation'), 560, 150).flights).toBeNull();
    // 全反応：飛ばすなら、元素ごとの数が両辺で一致し、上限を超えない。飛ばさないなら理由がある
    let fly = 0;
    for (const r of RECIPES) {
      const p = planScene(r, 560, 150);
      if (!p.flights) { expect(p.why.length, r.id).toBeGreaterThan(0); continue; }
      fly++;
      expect(p.flights.length, r.id).toBeLessThanOrEqual(MAX_ATOMS);
      const count = (us: { id: string }[]) => { const m: Record<string, number> = {}; for (const u of us) if (u.id !== 'e') for (const a of atomsOf(u.id)!) m[a.sym] = (m[a.sym] || 0) + 1; return m; };
      expect(count(p.left), r.id).toEqual(count(p.right));
    }
    expect(fly).toBeGreaterThan(RECIPES.length * 0.6);
  });
});

describe('金属イオンの系統分離とタンク', () => {
  const A = (id: string) => agentById(id)!;
  const run = (w: ReturnType<typeof newWorld>, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };

  it('混合溶液の id は順をそろえ、知らないイオンや重複は受けつけない', () => {
    expect(ionsId(['Cu', 'Ag'])).toBe('ions:Ag.Cu');
    expect(ionsOf('ions:Ag.Cu')).toEqual(['Ag', 'Cu']);
    for (const bad of ['ions:', 'ions:Cu.Ag', 'ions:Ag.Ag', 'ions:Xx', 'Ag.Cu']) expect(ionsOf(bad), bad).toBeNull();
    expect(hasSub('ions:Ag.Cu')).toBe(true);
    expect(hasSub('ions:Cu.Ag')).toBe(false);
    expect(sub('ions:Ag.Cu').name).toBe('Ag⁺・Cu²⁺ の溶液');
    expect(sub('ions:Na').state).toBe('liquid');
    // 試薬の沈殿は、どれも物質の一覧にある
    for (const a of AGENTS) { for (const k of ION_ORDER) if (a.ppt[k]) expect(hasSub(a.ppt[k]!), a.ppt[k]).toBe(true); for (const x of a.quiz.answer) expect(a.quiz.pool).toContain(x); }
    expect(new Set(AGENTS.map((a) => a.id)).size).toBe(AGENTS.length);
  });

  it('試薬の順が正しければ 1 種類ずつ沈殿し、誤るとまじる', () => {
    // 第 1 属 → 第 2 属：Ag⁺ と Cu²⁺
    expect(settle('ions:Ag.Cu', A('hcl'))).toEqual({ solid: 'AgCl', liquid: 'ions:Cu' });
    expect(settle('ions:Cu', A('h2s-acid'))).toEqual({ solid: 'CuS', liquid: null });
    // 先に硫化水素を通じると、Ag₂S と CuS がまじる
    expect(settle('ions:Ag.Cu', A('h2s-acid'))).toEqual({ solid: SLUDGE, liquid: null });
    // 硫化水素は、酸性では Zn²⁺ を沈殿させず、塩基性で沈殿させる
    expect(settle('ions:Cu.Fe.Zn', A('h2s-acid'))).toEqual({ solid: 'CuS', liquid: 'ions:Fe.Zn' });
    expect(settle('ions:Fe.Zn', A('nh3'))).toEqual({ solid: 'Fe(OH)3', liquid: 'ions:Zn' });
    expect(settle('ions:Zn', A('h2s-base'))).toEqual({ solid: 'ZnS', liquid: null });
    // アンモニア水（過剰）では、Ag⁺・Cu²⁺・Zn²⁺ は錯イオンになって溶けたまま
    expect(settle('ions:Ag.Cu.Fe.Zn', A('nh3'))).toEqual({ solid: 'Fe(OH)3', liquid: 'ions:Ag.Cu.Zn' });
    // 何も沈殿しなければ、そのまま通る
    expect(settle('ions:Ca.Na', A('hcl'))).toEqual({ solid: null, liquid: 'ions:Ca.Na' });
    expect(settle('ions:Ca.Na', A('co3'))).toEqual({ solid: 'CaCO3', liquid: 'ions:Na' });
    // 重金属が残ったまま炭酸アンモニウムを使うと、混ざる
    expect(settle('ions:Zn.Ca', A('co3')).solid).toBe(SLUDGE);
  });

  it('まじりの沈殿は、教科書の手順で溶かし分けられる', () => {
    expect(settle('ions:Ag.Pb', A('hcl'))).toEqual({ solid: MUD_CL, liquid: null });
    expect(settle(MUD_CL, A('hot'))).toEqual({ solid: 'AgCl', liquid: 'ions:Pb' });
    expect(settle('ions:Pb', A('cro4'))).toEqual({ solid: 'PbCrO4', liquid: null });
    expect(settle('ions:Fe.Al.Ca', A('nh3'))).toEqual({ solid: MUD_OH, liquid: 'ions:Ca' });
    expect(settle(MUD_OH, A('naoh'))).toEqual({ solid: 'Fe(OH)3', liquid: 'ions:Al' });
    // 効かない試薬では、沈殿はそのまま残る
    expect(settle(MUD_CL, A('naoh'))).toEqual({ solid: MUD_CL, liquid: null });
    // 両性：過剰の NaOH では Al³⁺・Zn²⁺・Pb²⁺ は溶けたまま
    expect(settle('ions:Pb.Fe.Al.Zn', A('naoh'))).toEqual({ solid: 'Fe(OH)3', liquid: 'ions:Pb.Al.Zn' });
    // 言い切れない組み合わせは使わせない
    expect(refusal('ions:Fe.Ca', A('naoh'))).toMatch(/Ca²⁺/);
    expect(refusal('ions:Pb', A('cro4'))).toBeNull();
    expect(refusal('ions:Pb.Cu', A('cro4'))).toMatch(/Cu²⁺/);
  });

  it('系統分離の指令は、どれも混合溶液から達成できる', () => {
    const ch = CHAPTERS.find((c) => c.name.includes('系統分離'))!;
    expect(ch.goals.length).toBe(MIXES.length);
    ch.goals.forEach((g, i) => {
      const can = reachableFrom(MIXES[i].id);
      for (const x of [g.s, ...(g.also ?? [])]) expect(can.has(x), `${MIXES[i].name}: ${x}`).toBe(true);
    });
    // 8 種すべてからは、6 つの属の沈殿がすべて取り出せる
    const all = reachableFrom(MIXES[MIXES.length - 1].id);
    for (const x of ['AgCl', 'PbCrO4', 'CuS', 'Fe(OH)3', 'ZnS', 'CaCO3', 'ions:Na', 'ions:Al']) expect(all.has(x), x).toBe(true);
  });

  it('沈殿槽を並べた工場で、最初の指令（Ag⁺ と Cu²⁺）を通す', () => {
    const w = newWorld();
    const ci = CHAPTERS.findIndex((c) => c.name.includes('系統分離'));
    setChapter(w, ci);
    expect(toolUnlocked(w, MACHINES.settler)).toBe(true);
    const [hx0, hy0] = HUB_TILES[0];
    // 試薬棚 → 沈殿槽①（希塩酸）→ 沈殿槽②（硫化水素・酸性）。沈殿は右手（下）へ出るので、ベルトで納品所へ
    place(w, 'sampler', hx0 - 12, hy0, 0); at(w, hx0 - 12, hy0)!.sub = 'ions:Ag.Cu';
    place(w, 'settler', hx0 - 11, hy0, 0); place(w, 'settler', hx0 - 8, hy0, 0);
    place(w, 'belt', hx0 - 9, hy0, 0);
    const s1 = at(w, hx0 - 11, hy0)!, s2 = at(w, hx0 - 8, hy0)!;
    // 試薬を決めるまでは受け取らない
    run(w, 3);
    expect(s1.item).toBeNull();
    expect(s1.bad).toBe('ions:Ag.Cu');
    s1.test = 'hcl'; s2.test = 'h2s-acid';
    // 沈殿の出口（右手・手前＝下向き）から、下の行を通って納品所へ
    for (const s of [s1, s2]) { const p = slotPort(s, 2); expect(p.d).toBe(1); for (let y = p.ty; y <= hy0 + 3; y++) place(w, 'belt', p.tx, y, 1); }
    for (let x = slotPort(s1, 2).tx; x < hx0; x++) if (!at(w, x, hy0 + 4)) place(w, 'belt', x, hy0 + 4, 0);
    place(w, 'belt', hx0, hy0 + 4, 3); for (let y = hy0 + 3; y > hy0 + 1; y--) place(w, 'belt', hx0, y, 3);
    run(w, 200);
    expect(w.delivered.AgCl).toBeGreaterThan(0);
    expect(w.delivered.CuS).toBeGreaterThan(0);
    expect(w.made.AgCl).toBeGreaterThanOrEqual(w.delivered.AgCl);
    expect(w.progress[ci]).toBeGreaterThanOrEqual(1);       // 1 つ目の指令を達成
    // 受け取れないもの：ただの物質
    const w2 = newWorld();
    place(w2, 'settler', 10, 10, 0); at(w2, 10, 10)!.test = 'hcl';
    place(w2, 'belt', 9, 10, 0); at(w2, 9, 10)!.item = { s: 'N2', p: 0, m: 0 };
    run(w2, 2);
    expect(at(w2, 10, 10)!.bad).toBe('N2');
    // 保存して読み直しても、試薬と途中の物が残る
    const r = deserialize(serialize(w))!;
    expect(at(r, hx0 - 11, hy0)!.test).toBe('hcl');
  });

  it('貯蔵タンク：1 種類だけをため、出口を閉じればためるだけになり、開けば出てくる', () => {
    const w = newWorld();
    place(w, 'belt', 8, 10, 0); place(w, 'belt', 9, 10, 0);
    place(w, 'tank', 10, 10, 0);
    place(w, 'belt', 12, 10, 0); place(w, 'vent', 13, 10, 0);
    const tank = at(w, 10, 10)!;
    tank.test = 'hold';
    const feed = (s: string) => { const b = at(w, 8, 10)!; if (!b.item) b.item = { s, p: 0, m: w.tick }; };
    for (let i = 0; i < 60 * 20; i++) { feed('NH3'); step(w, 1 / 60); }
    expect(tank.sub).toBe('NH3');
    expect(tank.cnt!).toBeGreaterThan(20);
    expect(w.vented.NH3 || 0).toBe(0);                       // 閉じているあいだは出ない
    // 別の物質は受け取らない
    const before = tank.cnt!;
    for (let i = 0; i < 60 * 3; i++) { feed('O2'); step(w, 1 / 60); }
    expect(tank.bad).toBe('O2');
    expect(tank.cnt).toBeGreaterThanOrEqual(before);
    expect(tank.sub).toBe('NH3');
    at(w, 8, 10)!.item = null; at(w, 9, 10)!.item = null;
    // 開くと出てくる。数は合う
    tank.test = undefined;
    const held = tank.cnt!;
    run(w, 120);
    expect(tank.cnt).toBe(0);
    expect(w.vented.NH3).toBe(held);
    // 上限まで
    const w2 = newWorld();
    place(w2, 'tank', 10, 10, 0); const t2 = at(w2, 10, 10)!; t2.test = 'hold';
    place(w2, 'belt', 9, 10, 0);
    for (let i = 0; i < 60 * 200; i++) { const b = at(w2, 9, 10)!; if (!b.item) b.item = { s: 'H2O', p: 1, m: 0 }; step(w2, 1 / 60); }
    expect(t2.cnt).toBe(200);
    // 試薬棚から来たぶんは、タンクを通しても指令に数えない
    const w3 = newWorld();
    const [hx0, hy0] = HUB_TILES[0];
    place(w3, 'sampler', hx0 - 6, hy0, 0); at(w3, hx0 - 6, hy0)!.sub = 'N2';
    place(w3, 'tank', hx0 - 5, hy0, 0);
    for (let x = hx0 - 3; x < hx0; x++) place(w3, 'belt', x, hy0, 0);
    run(w3, 30);
    expect(w3.stock.N2).toBeGreaterThan(0);
    expect(w3.delivered.N2 || 0).toBe(0);
  });
});

describe('抽出分離と電気泳動', () => {
  const W = (id: string) => washById(id)!;
  const run = (w: ReturnType<typeof newWorld>, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };

  it('抽出：酸・塩基の強さの順に、塩になるものだけが水層へ移る', () => {
    const all = 'org:An.Bz.Ph.Nb';
    expect(sub(all).name).toBe('アニリン・安息香酸・フェノール・ニトロベンゼン のエーテル溶液');
    expect(extract(all, W('x-hcl'))).toEqual({ main: 'org:Bz.Ph.Nb', side: 'C6H5NH3Cl' });
    // 炭酸水素ナトリウムでは、カルボン酸だけ。フェノールは炭酸より弱いので動かない
    expect(extract('org:Bz.Ph.Nb', W('x-nahco3'))).toEqual({ main: 'org:Ph.Nb', side: 'C6H5COONa' });
    expect(extract('org:Ph.Nb', W('x-naoh'))).toEqual({ main: 'org:Nb', side: 'C6H5ONa' });
    expect(extract('org:Nb', W('x-evap'))).toEqual({ main: 'C6H5NO2', side: null });
    // 水酸化ナトリウムでは、安息香酸とフェノールがまとめて移る。CO₂ でフェノールだけが遊離する
    expect(extract('org:Bz.Ph.Nb', W('x-naoh'))).toEqual({ main: 'org:Nb', side: 'aq:Bz.Ph' });
    expect(extract('aq:Bz.Ph', W('x-co2'))).toEqual({ main: 'org:Ph', side: 'C6H5COONa' });
    expect(extract('C6H5ONa', W('x-co2'))).toEqual({ main: 'org:Ph', side: null });
    // 効かない操作
    expect(extract('org:Nb', W('x-hcl'))).toEqual({ main: 'org:Nb', side: null });
    expect(extractRefusal(all, W('x-evap'))).toMatch(/残っている/);
    expect(extractRefusal(all, W('x-co2'))).toMatch(/水層/);
    expect(extractRefusal('aq:Bz.Ph', W('x-hcl'))).toMatch(/エーテル層/);
    expect(extractRefusal('org:Nb', W('x-evap'))).toBeNull();
    for (const a of WASHES) if (a.quiz) for (const x of a.quiz.answer) expect(a.quiz.pool).toContain(x);
    // 塩は、反応器の反応で元の化合物に戻せる
    for (const id of ['aniline-release', 'benzoic-release', 'phenol-release', 'phenol-release-hcl', 'benzoate']) expect(RECIPES.some((r) => r.id === id), id).toBe(true);
  });

  it('電気泳動：等電点より酸性側では陰極へ、塩基性側では陽極へ動く', () => {
    expect([AMINO.Glu.pI, AMINO.Ala.pI, AMINO.Lys.pI]).toEqual([3.2, 6.0, 9.7]);
    expect([poleAt('Glu', 6), poleAt('Ala', 6), poleAt('Lys', 6)]).toEqual(['anode', 'stay', 'cathode']);
    expect([poleAt('Glu', 1), poleAt('Ala', 1), poleAt('Lys', 1)]).toEqual(['cathode', 'cathode', 'cathode']);
    expect([poleAt('Glu', 13), poleAt('Ala', 13), poleAt('Lys', 13)]).toEqual(['anode', 'anode', 'anode']);
    expect(poleAt('Glu', 3)).toBe('stay');
    expect(poleAt('Lys', 10)).toBe('stay');
    // pH 6 なら、3 種が 1 回で分かれる
    expect(migrate('amino:Glu.Ala.Lys', 6)).toEqual({ main: 'Ala', side: 'Glu', side2: 'Lys' });
    // pH 1 では全部が陰極へ動いて、分かれない
    expect(migrate('amino:Glu.Ala.Lys', 1)).toEqual({ main: null, side: null, side2: 'amino:Glu.Ala.Lys' });
    expect(migrate('amino:Glu.Lys', 8)).toEqual({ main: null, side: 'Glu', side2: 'Lys' });
    expect(migrate('amino:Ala.Lys', 8)).toEqual({ main: null, side: 'Ala', side2: 'Lys' });
    expect(sub('amino:Glu.Lys').name).toBe('グルタミン酸・リシン の水溶液');
  });

  it('新しい 2 つの章の指令は、どれも試薬棚の混合物から達成できる', () => {
    const have = new Set<string>();
    for (const m of ORG_MIXES) for (const x of extractReachable(m.id)) have.add(x);
    for (const m of AMINO_MIXES) for (const x of migrateReachable(m.id)) have.add(x);
    // 水層の塩は、反応器で元に戻す
    for (let grew = true; grew;) { grew = false; for (const r of RECIPES) if (r.inputs.every(([s2]) => have.has(s2) || REAGENTS.includes(s2) || s2 === 'CO2' || s2 === 'H2O')) for (const [s2] of r.outputs) if (!have.has(s2)) { have.add(s2); grew = true; } }
    for (const name of ['抽出分離', '電気泳動']) {
      const ch = CHAPTERS.find((c) => c.name.includes(name))!;
      for (const g of ch.goals) for (const x of [g.s, ...(g.also ?? [])]) expect(have.has(x), `${name}: ${x}`).toBe(true);
    }
    expect(CHAPTERS[MACHINES.funnel.chapter!].name).toContain('抽出分離');
    expect(CHAPTERS[MACHINES.phoresis.chapter!].name).toContain('電気泳動');
  });

  it('分液ろうとと反応器の工場で、アニリンとニトロベンゼンを分けて納める', () => {
    const w = newWorld();
    const ci = CHAPTERS.findIndex((c) => c.name.includes('抽出分離'));
    setChapter(w, ci);
    const [hx0, hy0] = HUB_TILES[0];
    // 試薬棚 → ろうと①（希塩酸）→ ろうと②（蒸発）→ 納品所。水層（下へ出る）は反応器で NaOH を加えてアニリンに戻す
    place(w, 'sampler', hx0 - 9, hy0, 0); at(w, hx0 - 9, hy0)!.sub = 'org:An.Nb';
    place(w, 'funnel', hx0 - 8, hy0, 0); place(w, 'funnel', hx0 - 5, hy0, 0);
    place(w, 'belt', hx0 - 6, hy0, 0);
    for (let x = hx0 - 3; x < hx0; x++) place(w, 'belt', x, hy0, 0);
    const f1 = at(w, hx0 - 8, hy0)!, f2 = at(w, hx0 - 5, hy0)!;
    f1.test = 'x-hcl'; f2.test = 'x-evap';
    const p = slotPort(f1, 2);                       // 水層の出口（下向き）
    place(w, 'belt', p.tx, p.ty, 1);
    place(w, 'reactor', p.tx, p.ty + 1, 0);
    const rx = at(w, p.tx, p.ty + 1)!;
    configure(rx, rec('aniline-release'), ['C6H5NH2', 'NaCl', 'H2O']);
    place(w, 'sampler', p.tx - 1, p.ty + 1, 0); at(w, p.tx - 1, p.ty + 1)!.sub = 'NaOH';
    // 反応器の正面（左）からアニリン。右へ運んで納品所の下から入れる。残りの出口は廃棄口へ
    const out = outPort(rx, 0);
    for (let x = out.tx; x < hx0; x++) place(w, 'belt', x, out.ty, 0);
    place(w, 'belt', hx0, out.ty, 3);
    for (let y = out.ty - 1; y > hy0 + 1; y--) place(w, 'belt', hx0, y, 3);
    for (const i of [1, 2]) { const q = outPort(rx, i); if (!at(w, q.tx, q.ty)) place(w, 'vent', q.tx, q.ty, q.d as 0 | 1 | 2 | 3); }
    run(w, 240);
    expect(w.delivered.C6H5NO2).toBeGreaterThan(0);
    expect(w.delivered.C6H5NH2).toBeGreaterThan(0);
    expect(w.progress[ci]).toBeGreaterThanOrEqual(1);
  });

  it('電気泳動槽 1 台で、3 種のアミノ酸が 3 方向に分かれる', () => {
    const w = newWorld();
    place(w, 'sampler', 9, 10, 0); at(w, 9, 10)!.sub = 'amino:Glu.Ala.Lys';
    place(w, 'phoresis', 10, 10, 0);
    const e = at(w, 10, 10)!;
    run(w, 3);
    expect(e.bad).toBe('amino:Glu.Ala.Lys');          // pH を決めるまでは受け取らない
    e.test = '6';
    // 出口ごとにタンクで受ける：正面（残る）、右手（陽極）、左手（陰極）
    const spots = [0, 2, 3].map((i) => slotPort(e, i));
    expect(spots.map((q) => q.d)).toEqual([0, 1, 3]);
    place(w, 'tank', spots[0].tx, spots[0].ty, 0);
    place(w, 'tank', spots[1].tx - 1, spots[1].ty, 0);
    place(w, 'tank', spots[2].tx - 1, spots[2].ty - 1, 0);
    for (const q of spots) at(w, q.tx, q.ty)!.test = 'hold';
    run(w, 60);
    expect(spots.map((q) => at(w, q.tx, q.ty)!.sub)).toEqual(['Ala', 'Glu', 'Lys']);
    expect(at(w, spots[0].tx, spots[0].ty)!.cnt!).toBeGreaterThan(5);
    // 物質でないものは受け取らない
    const w2 = newWorld();
    place(w2, 'phoresis', 10, 10, 0); at(w2, 10, 10)!.test = '6';
    place(w2, 'belt', 9, 10, 0); at(w2, 9, 10)!.item = { s: 'ions:Ag.Cu', p: 0, m: 0 };
    run(w2, 2);
    expect(at(w2, 10, 10)!.bad).toBe('ions:Ag.Cu');
  });
});

describe('課題：壊れた工場・限られた原料・中身の見えない装置', () => {
  const run = (w: ReturnType<typeof newWorld>, sec: number) => { for (let i = 0; i < sec * 60; i++) step(w, 1 / 60); };

  it('課題の一覧：id が重ならず、3 種類ともある', async () => {
    const { CASES } = await import('../src/engine/cases');
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(CASES.filter((c) => c.kind === 'repair').length).toBe(6);
    expect(CASES.filter((c) => c.kind === 'limit').length).toBe(4);
    expect(CASES.filter((c) => c.kind === 'box').length).toBe(4);
  });

  it('壊れた工場：そのままでは目的の物が届かず、正しく直すと届く', async () => {
    const { CASES } = await import('../src/engine/cases');
    for (const c of CASES.filter((x) => x.kind === 'repair')) {
      const w = c.build(1);
      run(w, 90);
      expect(c.check(w).done, `${c.id}：壊れたままでは達成しない`).toBe(false);
      c.fix!(w);
      run(w, 150);
      expect(c.check(w).done, `${c.id}：直すと達成する`).toBe(true);
    }
  });

  it('限られた原料：できる数と残る数は、係数で割った小さいほうで決まる。工場の結果と一致する', async () => {
    const { CASES, limitAnswer, limitStock } = await import('../src/engine/cases');
    // N₂ 10 個と H₂ 21 個：H₂ が先に尽きる（7 回）。NH₃ 14 個、残り N₂ 3 個
    expect(limitAnswer('haber-bosch', 'NH3', [10, 21])).toEqual({ runs: 7, out: 14, rest: 3 });
    expect(limitAnswer('contact', 'SO3', [9, 20])).toEqual({ runs: 4, out: 8, rest: 1 + 16 });
    for (const c of CASES.filter((x) => x.kind === 'limit')) {
      for (const seed of [1, 2, 3]) {
        const w = c.build(seed);
        const stock = [...w.ents.values()].filter((e) => e.kind === 'sampler').map((e) => e.left!);
        expect(stock.every((n) => n > 0)).toBe(true);
        const machine = [...w.ents.values()].find((e) => e.recipe)!, target = machine.outOrder![0];
        expect(limitStock(machine.recipe!, seed)).toEqual(stock);
        const ans = limitAnswer(machine.recipe!, target, stock);
        expect(c.check(w)).toMatchObject({ done: false, text: '先に予想を答えろ' });
        w.pred = { out: ans.out, rest: ans.rest };
        run(w, 240);
        // 原料を捨てずに使い切り、計算どおりの数だけできる
        expect(w.delivered[target], `${c.id} seed ${seed}`).toBe(ans.out);
        expect(Object.keys(w.spilled).length).toBe(0);
        expect(c.check(w)).toMatchObject({ done: true, ok: true });
        // 予想が違っていれば、終わっても正解にならない
        w.pred = { out: ans.out + 1, rest: ans.rest };
        expect(c.check(w)).toMatchObject({ done: true, ok: false });
      }
    }
    // seed が変わると数も変わる
    expect(limitStock('haber-bosch', 1)).not.toEqual(limitStock('haber-bosch', 2));
  });

  it('中身の見えない装置：封印された装置は動いてタンクに数がたまり、同じ反応を設定すると正解になる', async () => {
    const { CASES } = await import('../src/engine/cases');
    for (const c of CASES.filter((x) => x.kind === 'box')) {
      const w = c.build(1);
      const sealed = [...w.ents.values()].find((e) => e.sealed)!, r = rec(sealed.recipe!);
      run(w, 40);
      expect(sealed.n!, c.id).toBeGreaterThan(3);
      // 出てきた数の比が、係数の比になっている
      const tanks = [...w.ents.values()].filter((e) => e.kind === 'tank');
      expect(tanks.length).toBe(sealed.outOrder!.length);
      for (const [s, n] of r.outputs) { const t = tanks.find((x) => x.sub === s)!; expect(Math.abs(t.cnt! - sealed.n! * n), `${c.id} ${s}`).toBeLessThanOrEqual(n); }
      expect(c.check(w).done).toBe(false);
      // 別の反応を設定しても正解にならない
      const twin = [...w.ents.values()].find((e) => e.kind === sealed.kind && !e.sealed)!;
      const other = RECIPES.find((x) => x.machine === sealed.kind && x.id !== sealed.recipe)!;
      configure(twin, other, other.outputs.map(([s]) => s).filter((s) => s !== 'e'), other.machine === 'electrolyzer' ? other.outputs.map(() => 'c' as const) : undefined);
      expect(c.check(w).done).toBe(false);
      c.fix!(w);
      expect(c.check(w)).toMatchObject({ done: true, ok: true });
    }
  });
});

describe('模試：自分の工場から', () => {
  it('どの反応からも、答えの決まった小問が作れる', async () => {
    const { questionsFor, numOk, molarMass, MASS } = await import('../src/content/mock');
    expect(molarMass('H2SO4')).toBe(98);
    expect(molarMass('NH3')).toBe(17);
    expect(molarMass('air')).toBeNull();
    for (const el of ELEMENTS) expect(MASS[el.sym], el.sym).toBeGreaterThan(0);
    let total = 0, none = 0;
    for (const r of RECIPES) {
      let a = 12345;
      const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
      const qs = questionsFor(r, '①', 2, rnd);
      total += qs.length; if (!qs.length) none++;
      for (const q of qs) {
        expect(q.recipe).toBe(r.id);
        expect(q.text.length, r.id).toBeGreaterThan(10);
        if (q.kind === 'num') { expect(Number.isFinite(q.answer as number), `${r.id} ${q.topic}`).toBe(true); expect(q.answer as number).toBeGreaterThan(0); expect(numOk(q, q.answer as number)).toBe(true); expect(numOk(q, (q.answer as number) * 1.1)).toBe(false); }
        else { expect(q.choices!, `${r.id} ${q.topic}`).toContain(q.answer); expect(new Set(q.choices).size).toBe(q.choices!.length); expect(q.choices!.length).toBeGreaterThanOrEqual(3); }
      }
    }
    expect(total).toBeGreaterThan(RECIPES.length * 2);
    expect(none).toBeLessThan(RECIPES.length * 0.2);
  });

  it('量的関係と質量の計算は、反応式の係数どおりになる', async () => {
    const { questionsFor } = await import('../src/content/mock');
    let a = 7;
    const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    const qs = questionsFor(rec('haber-bosch'), '①', 3, rnd);
    const coef = qs.find((q) => q.topic === '反応式')!;
    expect(coef.answer).toBe(3);                                  // N₂ + x H₂ ⇄ 2NH₃
    expect(coef.text).toContain('x H₂');
    const amount = qs.find((q) => q.topic === '量的関係')!;
    const [used, made] = [Number(amount.text.match(/合わせて (\d+) 個/)![1]), amount.answer as number];
    // N₂ 1 : H₂ 3 : NH₃ 2 のどれかの比になっている
    expect([2, 2 / 3]).toContain(made / used);
    expect(qs.some((q) => q.topic === '化学平衡' && q.answer === '低温・高圧')).toBe(true);
    expect(qs.some((q) => q.kind === 'choice' && q.answer === 'Fe₃O₄')).toBe(true);
  });

  it('工場の反応から大問を作る：つながった反応を選び、工程の順に並べる', async () => {
    const { makeMock } = await import('../src/content/mock');
    expect(makeMock([], 1)).toBeNull();
    const m = makeMock([{ id: 'precip-agcl', count: 1 }, { id: 'ostwald-1', count: 2 }, { id: 'ostwald-2', count: 2 }, { id: 'ostwald-3', count: 1 }, { id: 'haber-bosch', count: 4 }], 3)!;
    expect(m.lead.length).toBeGreaterThanOrEqual(3);
    expect(m.qs.length).toBeGreaterThanOrEqual(5);
    expect(m.qs.length).toBeLessThanOrEqual(8);
    // つながっていない沈殿反応は選ばれない
    expect(m.lead.join('')).not.toContain('塩化銀');
    expect(m.lead.some((x) => x.includes('原料になる'))).toBe(true);
    // seed が変わると数値が変わる
    const again = makeMock([{ id: 'haber-bosch', count: 1 }], 1)!, other = makeMock([{ id: 'haber-bosch', count: 1 }], 2)!;
    expect(again.qs.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(again.qs)).not.toBe(JSON.stringify(other.qs));
  });
});

describe('達成の報酬', () => {
  it('習熟メッキ：復習の間隔が伸びると銅 → 銀 → 金。まちがえると剥がれる', async () => {
    const { platingOf, PLATING } = await import('../src/engine/world');
    const w = newWorld();
    expect(platingOf(w.srs, 'haber-bosch')).toBe(0);
    learn(w, rec('haber-bosch'), true);                 // 初めて設定：間隔は最初（10 分）
    expect(platingOf(w.srs, 'haber-bosch')).toBe(0);
    const tiers: number[] = [];
    for (let i = 0; i < 5; i++) { schedule(w, 'r:haber-bosch', true); tiers.push(platingOf(w.srs, 'haber-bosch')); }
    expect(tiers).toEqual([0, 1, 2, 3, 3]);             // 1 日 → 3 日（銅）→ 7 日（銀）→ 16 日（金）→ 35 日（金）
    expect(PLATING[3]).toBe('金');
    schedule(w, 'r:haber-bosch', false);
    expect(platingOf(w.srs, 'haber-bosch')).toBe(0);    // 剥がれる
    expect(platingOf(w.srs, undefined)).toBe(0);
  });

  it('夜景・本棚・花火の元になる集計', async () => {
    const { litZones, chaptersDone, flamesFed, summarize } = await import('../src/engine/world');
    const { FLAMES } = await import('../src/content/looks');
    const w = newWorld();
    expect(litZones(w).size).toBe(0);
    expect(chaptersDone(w.progress).every((x) => !x)).toBe(true);
    // 資源地を使う指令を 1 つ終えると、その資源地に灯りがともる
    const ci = CHAPTERS.findIndex((c) => c.goals.some((g) => g.zone)), gi = CHAPTERS[ci].goals.findIndex((g) => g.zone);
    w.progress[ci] = gi;
    expect(litZones(w).has(CHAPTERS[ci].goals[gi].zone!)).toBe(false);
    w.progress[ci] = gi + 1;
    expect(litZones(w).has(CHAPTERS[ci].goals[gi].zone!)).toBe(true);
    w.progress[0] = CHAPTERS[0].goals.length;
    expect(chaptersDone(w.progress)[0]).toBe(true);
    // 花火の色：炎色反応を示す元素のうち、納品所が飲み込んだものだけ
    for (const el of Object.keys(FLAMES)) expect(ELEMENTS.some((e) => e.sym === el), el).toBe(true);
    expect(flamesFed(w)).toEqual([]);
    w.fed.Na = 12; w.fed.Cu = 10; w.fed.Fe = 99;
    expect(flamesFed(w).sort()).toEqual(['Cu', 'Na']);
    // セーブの要約に、章ごとの進み具合が入る（タイトルの本棚に使う）
    const sum = summarize(serialize(w))!;
    expect(sum.progress[0]).toBe(CHAPTERS[0].goals.length);
  });
});

describe('立体表示のカメラ', () => {
  const cam = { x: 42.3, y: 27.6, z: 48 }, cw = 1180, ch = 820;
  it('注視点は画面の真ん中に見え、そこでの 1 マスは cam.z ピクセル', () => {
    const c = camera3(cam, cw, ch);
    const [px, py] = c.project(cam.x, cam.y, 0);
    expect(px).toBeCloseTo(cw / 2, 3); expect(py).toBeCloseTo(ch / 2, 3);
    expect(c.project(cam.x + 1, cam.y, 0)[0] - px).toBeCloseTo(cam.z, 2);
    // 傾いているので、南北は縦に縮んで見える
    const dy = c.project(cam.x, cam.y + 1, 0)[1] - py;
    expect(dy).toBeGreaterThan(cam.z * 0.75); expect(dy).toBeLessThan(cam.z * 0.95);
  });
  it('画面の点 → 地面の点 → 画面の点、で元に戻る（高さがあっても）', () => {
    const c = camera3(cam, cw, ch);
    for (const h of [0, TOP_H]) for (const [px, py] of [[0, 0], [cw, 0], [300, 500], [cw, ch], [17, 803]]) {
      const [x, y] = c.unproject(px, py, h), [qx, qy] = c.project(x, y, h);
      expect(qx).toBeCloseTo(px, 2); expect(qy).toBeCloseTo(py, 2);
    }
  });
  it('遠く（北）ほど小さく見え、高い所は画面の上へずれる', () => {
    const c = camera3(cam, cw, ch);
    const near = c.project(cam.x + 1, cam.y + 5, 0)[0] - c.project(cam.x, cam.y + 5, 0)[0];
    const far = c.project(cam.x + 1, cam.y - 5, 0)[0] - c.project(cam.x, cam.y - 5, 0)[0];
    expect(near).toBeGreaterThan(far);
    expect(c.project(cam.x, cam.y, TOP_H)[1]).toBeLessThan(c.project(cam.x, cam.y, 0)[1]);
  });
  it('見えている範囲は、画面の四隅（地面と天面）をすべて含み、絵の大きさは拡大率によらない', () => {
    const c = camera3(cam, cw, ch);
    for (const h of [0, TOP_H]) for (const [px, py] of [[0, 0], [cw, 0], [0, ch], [cw, ch]]) {
      const [x, y] = c.unproject(px, py, h);
      expect(x).toBeGreaterThanOrEqual(c.x0 - 1e-6); expect(x).toBeLessThanOrEqual(c.x1 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(c.y0 - 1e-6); expect(y).toBeLessThanOrEqual(c.y1 + 1e-6);
    }
    const [gw, gh] = planeSize(cw, ch);
    for (const z of [9, 30, 110]) { const q = camera3({ ...cam, z }, cw, ch); expect((q.x1 - q.x0) * z).toBeLessThanOrEqual(gw); expect((q.y1 - q.y0) * z).toBeLessThanOrEqual(gh); }
    // 平らな表示よりは広いが、2 倍までは要らない
    expect(gw).toBeGreaterThan(cw); expect(gw * gh).toBeLessThan(cw * ch * 2);
  });
  it('箱の天面や南の側面に触れたら、その設備のマス。何もなければ地面のマス', () => {
    const c = camera3(cam, cw, ch);
    const big = { kind: 'reactor', big: true } as const, vent = { kind: 'vent' } as const;
    const entAt = (x: number, y: number) => (x >= 40 && x <= 41 && y >= 26 && y <= 27 ? big : x === 45 && y === 27 ? vent : undefined);
    const tap = (x: number, y: number, h: number) => pickTile(c, ...c.project(x, y, h), entAt);
    expect(tap(40.5, 26.5, TOP_H)).toEqual([40, 26]);          // 天面の奥の左
    expect(tap(41.5, 27.9, TOP_H * 0.5)[0]).toBe(41);          // 南の側面
    expect(tap(41.5, 27.9, TOP_H * 0.5)[1]).toBe(27);
    expect(tap(45.5, 27.5, heightOf(vent))).toEqual([45, 27]); // 低い設備の天面
    expect(tap(43.5, 29.5, 0)).toEqual([43, 29]);              // 地面
    // 箱の天面の奥の辺は、地面でいえば 1 マスほど北に見える。そこを触っても、北の地面ではなく箱を取る
    const [px, py] = c.project(40.5, 26.1, TOP_H);
    expect(Math.floor(c.unproject(px, py, 0)[1])).toBeLessThan(26);
    expect(pickTile(c, px, py, entAt)).toEqual([40, 26]);
  });
  it('平らなもの（ベルト、立体交差、地下ベルトの口）は高さ 0、2×2 の装置と納品所は同じ高さ', () => {
    for (const kind of ['belt', 'bridge', 'tunnel', 'part']) expect(heightOf({ kind } as never)).toBe(0);
    expect(heightOf({ kind: 'hub' } as never)).toBe(TOP_H);
    expect(heightOf({ kind: 'tank', big: true } as never)).toBe(TOP_H);
    expect(heightOf({ kind: 'extractor' } as never)).toBeGreaterThan(0);
    expect(heightOf({ kind: 'extractor' } as never)).toBeLessThan(TOP_H);
  });
});
