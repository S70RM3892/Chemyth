import { describe, expect, it } from 'vitest';
import { parseFormula } from '../src/chem/formula';
import {
  byKey, canonical, cisTransCount, dehydCount, isomers, monoSubCount, parseKey, ringSubCount, specOf, specText, stereoCount,
  type IsoClass, type Isomer, type Spec,
} from '../src/chem/isomers';
import { SPECS, makeCount, makeIdentify } from '../src/content/structure';

/** 種から決まる乱数（mulberry32） */
const rngOf = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const S = (c: number, h: number, o = 0, cl = 0): Spec => ({ c, h, o, cl });
const count = (spec: Spec, cls?: IsoClass): number => isomers(spec).filter((i) => !cls || i.cls === cls).length;
const classes = (spec: Spec): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const i of isomers(spec)) out[i.cls] = (out[i.cls] || 0) + 1;
  return out;
};
const named = (spec: Spec, name: string): Isomer => {
  const hit = isomers(spec).filter((i) => i.name === name);
  expect(hit.length, name).toBe(1);
  return hit[0];
};
const mol = (notation: string): Isomer => {
  const i = byKey(notation);
  expect(i, notation).toBeDefined();
  return i!;
};

describe('異性体の数え上げ', () => {
  it('アルカン', () => {
    expect(classes(S(4, 10))).toEqual({ alkane: 2 });
    expect(classes(S(5, 12))).toEqual({ alkane: 3 });
    expect(classes(S(6, 14))).toEqual({ alkane: 5 });
    expect(classes(S(7, 16))).toEqual({ alkane: 9 });
    expect(classes(S(8, 18))).toEqual({ alkane: 18 });
  });
  it('アルコールとエーテル', () => {
    expect(classes(S(3, 8, 1))).toEqual({ alcohol: 2, ether: 1 });
    expect(classes(S(4, 10, 1))).toEqual({ alcohol: 4, ether: 3 });
    expect(classes(S(5, 12, 1))).toEqual({ alcohol: 8, ether: 6 });
    expect(classes(S(6, 14, 1))).toEqual({ alcohol: 17, ether: 15 });
    const c4 = isomers(S(4, 10, 1)).filter((i) => i.cls === 'alcohol' && i.chiral > 0);
    expect(c4.map((i) => i.name)).toEqual(['2-ブタノール']);
    expect(isomers(S(5, 12, 1)).filter((i) => i.cls === 'alcohol' && i.chiral > 0).length).toBe(3);
  });
  it('アルケン', () => {
    expect(classes(S(4, 8))).toEqual({ alkene: 3 });
    expect(classes(S(5, 10))).toEqual({ alkene: 5 });
    expect(classes(S(6, 12))).toEqual({ alkene: 13 });
    expect(isomers(S(4, 8)).filter((i) => i.cisTrans).map((i) => i.name)).toEqual(['2-ブテン']);
    expect(isomers(S(5, 10)).filter((i) => i.cisTrans).map((i) => i.name)).toEqual(['2-ペンテン']);
    expect(isomers(S(6, 12)).filter((i) => i.cisTrans).length).toBe(4);
  });
  it('アルデヒドとケトン', () => {
    expect(classes(S(3, 6, 1))).toEqual({ aldehyde: 1, ketone: 1 });
    expect(classes(S(4, 8, 1))).toEqual({ aldehyde: 2, ketone: 1 });
    expect(classes(S(5, 10, 1))).toEqual({ aldehyde: 4, ketone: 3 });
  });
  it('カルボン酸とエステル', () => {
    expect(classes(S(3, 6, 2))).toEqual({ acid: 1, ester: 2 });
    expect(classes(S(4, 8, 2))).toEqual({ acid: 2, ester: 4 });
    expect(classes(S(5, 10, 2))).toEqual({ acid: 4, ester: 9 });
    expect(classes(S(6, 12, 2))).toEqual({ acid: 8, ester: 20 });
  });
  it('ハロゲン化物', () => {
    expect(classes(S(3, 7, 0, 1))).toEqual({ halide: 2 });
    expect(classes(S(4, 9, 0, 1))).toEqual({ halide: 4 });
    expect(classes(S(5, 11, 0, 1))).toEqual({ halide: 8 });
    expect(classes(S(2, 4, 0, 2))).toEqual({ halide: 2 });
    expect(classes(S(3, 6, 0, 2))).toEqual({ halide: 4 });
    expect(isomers(S(4, 9, 0, 1)).filter((i) => i.chiral > 0).map((i) => i.name)).toEqual(['2-クロロブタン']);
    // 1,1- と 1,2-（シス・トランス）で、立体異性体まで数えると 3 種類
    const c2 = isomers(S(2, 2, 0, 2));
    expect(c2.length).toBe(2);
    expect(c2.reduce((n, i) => n + (stereoCount(i) || 0), 0)).toBe(3);
    expect(isomers({ c: 2, h: 5, br: 1 }).map((i) => i.formula)).toEqual(['CH3CH2Br']);
  });
  it('芳香族', () => {
    expect(isomers(S(8, 10)).map((i) => i.name).sort()).toEqual(['m-キシレン', 'o-キシレン', 'p-キシレン', 'エチルベンゼン']);
    expect(isomers(S(7, 8, 1)).map((i) => i.name).sort()).toEqual(['m-クレゾール', 'o-クレゾール', 'p-クレゾール', 'アニソール', 'ベンジルアルコール']);
    expect(classes(S(7, 8, 1))).toEqual({ alcohol: 1, ether: 1, phenol: 3 });
    expect(isomers(S(6, 6)).map((i) => i.formula)).toEqual(['C6H6']);
    expect(isomers(S(6, 4, 0, 2)).map((i) => i.name).sort()).toEqual(['m-ジクロロベンゼン', 'o-ジクロロベンゼン', 'p-ジクロロベンゼン']);
  });
  it('C8H10O：一置換体 4 と二置換体 9', () => {
    // 現実には 19 種類（フェノール類 9、アルコール 5、エーテル 5）。
    // ジメチルフェノール 6 種は三置換ベンゼンなので、この数え上げの範囲外。
    const all = isomers(S(8, 10, 1));
    const mono = all.filter((i) => i.mol.atoms.includes('Ph'));
    const di = all.filter((i) => i.mol.atoms.includes('Ar'));
    expect(mono.map((i) => i.formula).sort()).toEqual(['C6H5CH(OH)CH3', 'C6H5CH2CH2OH', 'C6H5CH2OCH3', 'C6H5OC2H5']);
    expect(di.length).toBe(9);
    expect(all.length).toBe(13);
    expect(classes(S(8, 10, 1))).toEqual({ alcohol: 5, ether: 5, phenol: 3 });
    for (const p of ['o', 'm', 'p']) {
      expect(di.filter((i) => i.formula.startsWith(p + '-')).map((i) => i.formula.slice(2)).sort()).toEqual(['C6H4(C2H5)OH', 'C6H4(CH3)CH2OH', 'C6H4(CH3)OCH3']);
    }
  });
  it('C8H8O2：重複がなく、分類が妥当', () => {
    const all = isomers(S(8, 8, 2));
    expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
    expect(new Set(all.map((i) => i.formula)).size).toBe(all.length);
    for (const i of all) expect(['aldehyde', 'ketone', 'acid', 'ester']).toContain(i.cls);
    expect(all.filter((i) => i.cls === 'acid').map((i) => i.name).sort()).toEqual(['m-トルイル酸', 'o-トルイル酸', 'p-トルイル酸', 'フェニル酢酸']);
    const esters = all.filter((i) => i.cls === 'ester');
    expect(esters.length).toBe(6);
    expect(esters.map((i) => i.name)).toContain('安息香酸メチル');
    expect(esters.map((i) => i.name)).toContain('酢酸フェニル');
    for (const i of all) expect(i.props.nahco3).toBe(i.cls === 'acid');
  });
  it('範囲外の分子式は空', () => {
    expect(isomers(S(4, 6))).toEqual([]); // 二重結合 2 個
    expect(isomers(S(4, 10, 2))).toEqual([]); // ジオールは単官能でない
    expect(isomers(S(2, 8))).toEqual([]);
    expect(isomers(S(3, 7))).toEqual([]);
    expect(isomers(S(0, 2, 1))).toEqual([]);
    expect(isomers({ c: 2.5, h: 6 })).toEqual([]);
    expect(isomers(S(1, 0, 2))).toEqual([]); // CO2
  });
});

describe('正準形と表記', () => {
  const pool: Spec[] = [...SPECS.map((s) => s.spec), S(1, 4), S(2, 6), S(2, 4), S(1, 4, 1), S(1, 2, 1), S(1, 2, 2), S(2, 6, 1), S(6, 6), S(6, 6, 1), S(7, 8),
    S(7, 6, 2), S(7, 6, 3), S(8, 6, 4), S(8, 8, 3), S(9, 8, 4), S(8, 8), S(7, 7, 0, 1), S(3, 5, 0, 1), S(13, 10, 1), S(12, 10, 1), S(13, 10, 2)];
  it('key は一意で、読み戻しても同じ', () => {
    for (const spec of pool) {
      const all = isomers(spec);
      expect(all.length, specText(spec)).toBeGreaterThan(0);
      expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
      for (const i of all) {
        expect(canonical(parseKey(i.key)!)).toBe(i.key);
        expect(canonical(i.mol)).toBe(i.key);
        expect(byKey(i.key)).toBe(i);
        expect(specText(specOf(i.mol))).toBe(specText(spec));
      }
    }
  });
  it('子の順序が違っても同じ key になる', () => {
    expect(mol('C(O)(C)(C(C))').key).toBe(mol('C(C(C)(O))(C)').key);
    expect(mol('C(C)(C(O)(C))').name).toBe('2-ブタノール');
    expect(mol('Arp(O)(C)').key).toBe(mol('C(Arp(O))').key);
    expect(mol('Arp(O)(C)').key).not.toBe(mol('Arm(O)(C)').key);
    expect(byKey('C(O)(O)')).toBeUndefined(); // gem-ジオール
    expect(byKey('C(=C(O))')).toBeUndefined(); // エノール
    expect(byKey('O(O(C))(C)')).toBeUndefined(); // 過酸化物
    expect(byKey('C(=O)(C)(O(C(=O)(C)))')).toBeUndefined(); // 酸無水物
    expect(byKey('C(C(O))(O)')).toBeUndefined(); // ジオール
    expect(byKey('xyz')).toBeUndefined();
  });
  it('示性式の原子数が分子式と合う', () => {
    for (const spec of pool) for (const i of isomers(spec)) {
      const atoms = parseFormula(i.formula.replace(/^[omp]-/, '').replace(/=/g, ''));
      const want: Record<string, number> = {};
      const sp = specOf(i.mol);
      for (const [k, el] of [['c', 'C'], ['h', 'H'], ['o', 'O'], ['cl', 'Cl'], ['br', 'Br']] as const) if (sp[k]) want[el] = sp[k]!;
      expect(atoms, i.formula).toEqual(want);
    }
  });
  it('示性式と名称の例', () => {
    const f = (notation: string): string => mol(notation).formula;
    expect(f('C(C)(O)(C(C))')).toBe('CH3CH(OH)CH2CH3');
    expect(f('C(C)(C)(C)(O)')).toBe('(CH3)3COH');
    expect(f('C(=O)(O(C(C)(C)))')).toBe('HCOOCH(CH3)2');
    expect(f('C(C)(=O)(O(C(C)))')).toBe('CH3COOC2H5');
    expect(f('C(C)(=C(C))')).toBe('CH3CH=CHCH3');
    expect(f('C(O)(Ph)')).toBe('C6H5CH2OH');
    expect(f('Aro(C)(O)')).toBe('o-C6H4(CH3)OH');
    expect(f('Arp(C(=O)(O))(C(=O)(O))')).toBe('p-C6H4(COOH)2');
    expect(f('Aro(O)(C(=O)(O))')).toBe('o-C6H4(OH)COOH');
    expect(f('Aro(O(C(=O)(C)))(C(=O)(O))')).toBe('o-C6H4(OCOCH3)COOH');
    expect(f('C(C)(O)')).toBe('C2H5OH');
    expect(f('O(C(C))(C(C))')).toBe('C2H5OC2H5');
    expect(f('C(=O)')).toBe('HCHO');
    expect(f('C(=O)(O)')).toBe('HCOOH');
    expect(f('C(C)(=O)(C)')).toBe('CH3COCH3');
    expect(f('C(C)(C)(Cl)')).toBe('CH3CHClCH3');
    expect(f('C(=C)(Ph)')).toBe('C6H5CH=CH2');
    expect(f('C(=O)(O(C))(Ph)')).toBe('C6H5COOCH3');
    const n = (notation: string): string => mol(notation).name;
    expect(n('C(C)(=O)(O(C(C)))')).toBe('酢酸エチル');
    expect(n('C(=O)(O(C(C)(C)))')).toBe('ギ酸イソプロピル');
    expect(n('C(C)(C)(C(O))')).toBe('2-メチル-1-プロパノール');
    expect(n('C(C)(C)(C)(O)')).toBe('2-メチル-2-プロパノール');
    expect(n('O(C(C))(C(C))')).toBe('ジエチルエーテル');
    expect(n('O(C)(C(C(C)))')).toBe('メチルプロピルエーテル');
    expect(n('C(C)(C)(=C(C))')).toBe('2-メチル-2-ブテン');
    expect(n('C(C)(C)(C)(C(C))')).toBe('2,2-ジメチルブタン');
    expect(n('C(C(C))(C(C))(C(C))')).toBe('3-エチルペンタン');
    expect(n('C(Cl)(C(Cl))')).toBe('1,2-ジクロロエタン');
    expect(n('Aro(O)(C(=O)(O))')).toBe('サリチル酸');
    expect(specText({ c: 5, h: 12, o: 1 })).toBe('C5H12O');
    expect(specText({ c: 4, h: 9, cl: 1 })).toBe('C4H9Cl');
    expect(specText({ c: 1, h: 4 })).toBe('CH4');
  });
});

describe('性質', () => {
  it('C4H10O のアルコール', () => {
    const alcohols = isomers(S(4, 10, 1)).filter((i) => i.cls === 'alcohol');
    expect(alcohols.filter((i) => i.props.iodoform).map((i) => i.name)).toEqual(['2-ブタノール']);
    expect(alcohols.filter((i) => i.chiral > 0).map((i) => i.name)).toEqual(['2-ブタノール']);
    for (const i of alcohols) expect(i.props.na).toBe(true);
    for (const i of isomers(S(4, 10, 1)).filter((x) => x.cls === 'ether')) expect(i.props.na).toBe(false);
    const t = named(S(4, 10, 1), '2-メチル-2-プロパノール');
    expect(t.props.grade).toBe(3);
    expect(t.props.oxid).toBe('none');
    expect(t.props.oxidTo).toBeUndefined();
    expect(named(S(4, 10, 1), '1-ブタノール').props.oxid).toBe('aldehyde');
    const b2 = named(S(4, 10, 1), '2-ブタノール');
    expect(b2.props.oxid).toBe('ketone');
    expect(byKey(b2.props.oxidTo!)!.name).toBe('エチルメチルケトン');
    const enes = b2.props.dehydration!.map((k) => byKey(k)!);
    expect(enes.map((i) => i.name).sort()).toEqual(['1-ブテン', '2-ブテン']);
    expect(enes.find((i) => i.name === '2-ブテン')!.cisTrans).toBe(true);
    expect(enes.find((i) => i.name === '1-ブテン')!.cisTrans).toBe(false);
    expect(dehydCount(b2)).toBe(3);
    expect(dehydCount(t)).toBe(1);
    expect(dehydCount(named(S(5, 12, 1), '2,2-ジメチル-1-プロパノール'))).toBe(0);
  });
  it('C4H8O2 のエステル', () => {
    const esters = isomers(S(4, 8, 2)).filter((i) => i.cls === 'ester');
    expect(esters.filter((i) => i.props.silver).map((i) => i.name).sort()).toEqual(['ギ酸イソプロピル', 'ギ酸プロピル']);
    const ea = named(S(4, 8, 2), '酢酸エチル');
    expect(ea.props.iodoform).toBe(false);
    expect(byKey(ea.props.hydrolysis!.acid)!.name).toBe('酢酸');
    const ethanol = byKey(ea.props.hydrolysis!.alcohol)!;
    expect(ethanol.name).toBe('エタノール');
    expect(ethanol.props.iodoform).toBe(true);
    expect(named(S(4, 8, 2), '酪酸').props.hydrolysis).toBeUndefined();
    const acids = isomers(S(4, 8, 2)).filter((i) => i.cls === 'acid');
    for (const i of acids) expect([i.props.na, i.props.nahco3, i.props.naoh, i.props.silver]).toEqual([true, true, true, false]);
    expect(mol('C(=O)(O)').props.silver).toBe(true);
    expect(mol('C(C)(=O)(O)').props.iodoform).toBe(false);
    // エタノール → アセトアルデヒド → 酢酸
    expect(byKey(byKey(ethanol.props.oxidTo!)!.props.oxidTo!)!.name).toBe('酢酸');
  });
  it('カルボニル化合物', () => {
    expect(mol('C(C)(=O)').props.iodoform).toBe(true);
    expect(mol('C(C)(=O)').props.silver).toBe(true);
    expect(mol('C(C)(C)(=O)').props.iodoform).toBe(true);
    expect(mol('C(C)(C)(=O)').props.silver).toBe(false);
    expect(mol('C(C(C))(C(C))(=O)').props.iodoform).toBe(false);
    expect(mol('C(C)(=O)(Ph)').props.iodoform).toBe(true);
    expect(mol('C(C(C))(=O)').props.iodoform).toBe(false);
  });
  it('アルケン', () => {
    const a = mol('C(C)(C)(=C(C))');
    expect(a.props.br2).toBe(true);
    expect(a.props.ozonolysis!.map((k) => byKey(k)!.name).sort()).toEqual(['アセトアルデヒド', 'アセトン']);
    expect(a.props.hydration!.map((k) => byKey(k)!.name).sort()).toEqual(['2-メチル-2-ブタノール', '3-メチル-2-ブタノール']);
    expect(mol('C(C)(=C(C))').props.ozonolysis!.map((k) => byKey(k)!.name)).toEqual(['アセトアルデヒド']);
    expect(mol('C(C)(=C(C))').props.hydration!.map((k) => byKey(k)!.name)).toEqual(['2-ブタノール']);
    expect(cisTransCount(mol('C(C)(=C(C))'))).toBe(1);
  });
  it('芳香族', () => {
    expect(byKey(mol('Aro(C)(C)').props.sideOxid!)!.name).toBe('フタル酸');
    expect(byKey(mol('Arm(C)(C)').props.sideOxid!)!.name).toBe('イソフタル酸');
    expect(byKey(mol('Arp(C)(C(C))').props.sideOxid!)!.name).toBe('テレフタル酸');
    expect(byKey(mol('C(C)(Ph)').props.sideOxid!)!.name).toBe('安息香酸');
    expect(mol('Aro(C)(O)').props.sideOxid).toBeUndefined();
    const sa = mol('Aro(O)(C(=O)(O))');
    expect(sa.cls).toBe('acid');
    expect([sa.props.na, sa.props.nahco3, sa.props.naoh, sa.props.fecl3]).toEqual([true, true, true, true]);
    const cresol = mol('Arp(C)(O)');
    expect([cresol.props.na, cresol.props.nahco3, cresol.props.naoh, cresol.props.fecl3]).toEqual([true, false, true, true]);
    const bn = mol('C(O)(Ph)');
    expect([bn.props.na, bn.props.naoh, bn.props.fecl3, bn.props.oxid]).toEqual([true, false, false, 'aldehyde']);
    expect(byKey(bn.props.oxidTo!)!.name).toBe('ベンズアルデヒド');
    const aspirin = mol('Aro(O(C(=O)(C)))(C(=O)(O))');
    expect(byKey(aspirin.props.hydrolysis!.acid)!.name).toBe('酢酸');
    expect(byKey(aspirin.props.hydrolysis!.alcohol)!.name).toBe('サリチル酸');
    const pa = mol('C(C)(=O)(O(Ph))');
    expect(byKey(pa.props.hydrolysis!.alcohol)!.name).toBe('フェノール');
    // 環の H 1 個を置換した化合物の数
    expect([mol('Aro(C)(C)'), mol('Arm(C)(C)'), mol('Arp(C)(C)'), mol('C(C)(Ph)')].map(ringSubCount)).toEqual([2, 3, 1, 3]);
    expect([mol('Aro(C)(O)'), mol('Arm(C)(O)'), mol('Arp(C)(O)')].map(ringSubCount)).toEqual([4, 4, 2]);
    // ペンタン 3、2-メチルブタン 4、2,2-ジメチルプロパン 1
    expect(isomers(S(5, 12)).map(monoSubCount).sort()).toEqual([1, 3, 4]);
  });
  it('8 節点までなら速く、結果は使い回す', () => {
    for (const spec of [S(7, 16, 1), S(7, 14), S(6, 13, 0, 1), S(6, 12, 1), S(7, 14, 2)]) {
      const t0 = performance.now();
      const a = isomers(spec);
      const dt = performance.now() - t0;
      expect(a.length).toBeGreaterThan(0);
      expect(dt, specText(spec)).toBeLessThan(200);
      const b = isomers(spec);
      expect(b).toEqual(a);
      expect(b[0]).toBe(a[0]);
    }
    expect(classes(S(7, 16, 1))).toEqual({ alcohol: 39, ether: 33 });
    expect(classes(S(7, 14))).toEqual({ alkene: 27 });
    expect(classes(S(6, 13, 0, 1))).toEqual({ halide: 17 });
  });
});

describe('構造決定の問題', () => {
  const N = 300;
  const polite = /です|ます|ください|でしょう/;
  const levels = [1, 2, 3] as const;

  it('makeCount：答えが独立に数えた数と合う', () => {
    for (const level of levels) {
      const seen = new Set<string>();
      for (let seed = 0; seed < N; seed++) {
        const p = makeCount(rngOf(seed * 31 + level), level);
        const id = specText(p.spec);
        seen.add(id);
        expect(p.kind).toBe('count');
        expect(SPECS.some((s) => s.level === level && specText(s.spec) === id)).toBe(true);
        expect(p.text).toContain('何種類あるか');
        expect(p.text + p.how).not.toMatch(polite);
        expect(p.how.length).toBeGreaterThan(0);
        const mine = isomers(p.spec).filter(p.check);
        expect(mine.map((i) => i.key).sort(), p.text).toEqual(p.list.map((i) => i.key).sort());
        expect(p.list.length).toBeGreaterThan(0);
        let want = 0;
        for (const i of mine) {
          if (p.stereo === 'none') want += 1;
          else if (p.stereo === 'ct') want += 2 ** cisTransCount(i);
          else want += 2 ** (i.chiral + cisTransCount(i));
          if (p.stereo === 'all') expect(i.chiral).toBeLessThanOrEqual(1);
          if (p.stereo !== 'none') expect(cisTransCount(i)).toBeLessThanOrEqual(1);
        }
        expect(p.answer, p.text).toBe(want);
        expect(p.answer).toBeGreaterThanOrEqual(1);
        for (const i of p.list) expect(p.how).toContain(i.formula.replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[+d]));
      }
      expect(seen.size, `level ${level}`).toBe(SPECS.filter((s) => s.level === level).length);
    }
  });

  it('makeIdentify：手がかりすべてに合う異性体は正解だけ', () => {
    for (const level of levels) {
      const seen = new Set<string>();
      for (let seed = 0; seed < N; seed++) {
        const p = makeIdentify(rngOf(seed * 17 + level), level);
        const id = specText(p.spec);
        seen.add(id);
        expect(p.kind).toBe('identify');
        expect(SPECS.some((s) => s.level === level && specText(s.spec) === id)).toBe(true);
        expect(p.clues.length).toBeGreaterThan(0);
        expect(p.checks.length).toBe(p.clues.length);
        for (const c of p.clues) expect(c.length).toBeGreaterThan(5);
        expect(new Set(p.clues).size).toBe(p.clues.length);
        expect(p.text + p.clues.join('') + p.how).not.toMatch(polite);
        const all = isomers(p.spec);
        const left = all.filter((i) => p.checks.every((f) => f(i)));
        expect(left.map((i) => i.key), p.text + p.clues.join('')).toEqual([p.answer]);
        // どの手がかりも、それがなければ決まらないか、少なくとも正解には当てはまる
        const answer = byKey(p.answer)!;
        for (const f of p.checks) expect(f(answer)).toBe(true);
        expect(p.options.length).toBe(Math.min(8, all.length));
        expect(new Set(p.options.map((i) => i.key)).size).toBe(p.options.length);
        expect(p.options.some((i) => i.key === p.answer)).toBe(true);
        for (const o of p.options) expect(specText(specOf(o.mol))).toBe(id);
        expect(p.how).toContain('残るのは');
      }
      expect(seen.size, `level ${level}`).toBe(SPECS.filter((s) => s.level === level).length);
    }
  });

  it('同じ乱数列なら同じ問題', () => {
    for (const level of levels) for (let seed = 0; seed < 20; seed++) {
      const a = makeCount(rngOf(seed), level), b = makeCount(rngOf(seed), level);
      expect([a.text, a.answer, a.how]).toEqual([b.text, b.answer, b.how]);
      const c = makeIdentify(rngOf(seed), level), d = makeIdentify(rngOf(seed), level);
      expect([c.text, c.clues, c.answer, c.how, c.options.map((i) => i.key)]).toEqual([d.text, d.clues, d.answer, d.how, d.options.map((i) => i.key)]);
    }
    // level を省くと全体から選ぶ
    const any = new Set<string>();
    for (let seed = 0; seed < 200; seed++) any.add(specText(makeIdentify(rngOf(seed)).spec));
    expect(any.size).toBeGreaterThan(15);
  });

  it('決められる化合物が十分にある', () => {
    // 手がかりで 1 つに決まる化合物の種類を、分子式ごとに数える
    const got = new Map<string, Set<string>>();
    for (const level of levels) for (let seed = 0; seed < 600; seed++) {
      const p = makeIdentify(rngOf(seed * 13 + level * 7), level);
      const id = specText(p.spec);
      if (!got.has(id)) got.set(id, new Set());
      got.get(id)!.add(p.answer);
    }
    expect(got.get('C4H10O')!.size).toBe(7);
    expect(got.get('C4H8')!.size).toBe(3);
    expect(got.get('C4H8O2')!.size).toBe(6);
    expect(got.get('C7H8O')!.size).toBe(5);
    expect(got.get('C8H10')!.size).toBe(4);
  });
});
