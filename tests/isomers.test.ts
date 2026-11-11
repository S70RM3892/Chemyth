import { describe, expect, it } from 'vitest';
import { parseFormula } from '../src/chem/formula';
import {
  byKey, canonical, cisTransCount, dehydCount, isValid, isomers, monoSubCount, parseKey, ringNode, ringSubCount, specOf, specText, stereoCount, triPattern, twinPos,
  type IsoClass, type Isomer, type Mol, type Spec,
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
/** 窒素 1 個を含む分子式 */
const N = (c: number, h: number, o = 0): Spec => ({ c, h, n: 1, o });
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
  it('C8H10O：一置換体 4、二置換体 9、三置換体 6', () => {
    // 全部で 19 種類（フェノール類 9、アルコール 5、エーテル 5）。三置換体はジメチルフェノール 6 種。
    const all = isomers(S(8, 10, 1));
    const mono = all.filter((i) => i.mol.atoms.includes('Ph'));
    const di = all.filter((i) => i.mol.atoms.includes('Ar'));
    const tri = all.filter((i) => i.mol.atoms.includes('Tr'));
    expect(mono.map((i) => i.formula).sort()).toEqual(['C6H5CH(OH)CH3', 'C6H5CH2CH2OH', 'C6H5CH2OCH3', 'C6H5OC2H5']);
    expect(di.length).toBe(9);
    expect(tri.map((i) => i.name).sort()).toEqual(['2,3-ジメチルフェノール', '2,4-ジメチルフェノール', '2,5-ジメチルフェノール', '2,6-ジメチルフェノール', '3,4-ジメチルフェノール', '3,5-ジメチルフェノール']);
    expect(all.length).toBe(19);
    expect(new Set(all.map((i) => i.formula)).size).toBe(19);
    expect(classes(S(8, 10, 1))).toEqual({ alcohol: 5, ether: 5, phenol: 9 });
    for (const p of ['o', 'm', 'p']) {
      expect(di.filter((i) => i.formula.startsWith(p + '-')).map((i) => i.formula.slice(2)).sort()).toEqual(['C6H4(C2H5)OH', 'C6H4(CH3)CH2OH', 'C6H4(CH3)OCH3']);
    }
  });
  it('C8H8O2：重複がなく、分類が妥当', () => {
    const all = isomers(S(8, 8, 2));
    expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
    expect(new Set(all.map((i) => i.formula)).size).toBe(all.length);
    for (const i of all) expect(['aldehyde', 'ketone', 'acid', 'ester', 'phenol']).toContain(i.cls);
    // フェノール類に分類されるのは、三置換体のジヒドロキシスチレンだけ
    for (const i of all.filter((x) => x.cls === 'phenol')) expect(i.mol.atoms.includes('Tr') && i.props.br2).toBe(true);
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
    S(7, 6, 2), S(7, 6, 3), S(8, 6, 4), S(8, 8, 3), S(9, 8, 4), S(8, 8), S(7, 7, 0, 1), S(3, 5, 0, 1), S(13, 10, 1), S(12, 10, 1), S(13, 10, 2),
    N(1, 5), N(6, 7), N(2, 5, 2), N(4, 9, 1), N(7, 7, 2), N(7, 7, 1), N(9, 11, 1), S(10, 14), S(9, 12, 1), S(9, 6, 6), S(6, 5, 0, 1)];
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
      // 環の位置は o- / m- / p- か、全角数字の位置番号で頭に書く
      const atoms = parseFormula(i.formula.replace(/^[omp]-/, '').replace(/^[１-５,]+-/, '').replace(/=/g, ''));
      const want: Record<string, number> = {};
      const sp = specOf(i.mol);
      for (const [k, el] of [['c', 'C'], ['h', 'H'], ['o', 'O'], ['n', 'N'], ['cl', 'Cl'], ['br', 'Br']] as const) if (sp[k]) want[el] = sp[k]!;
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

describe('窒素を含む化合物', () => {
  const grades = (spec: Spec): number[] => [1, 2, 3].map((g) => isomers(spec).filter((i) => i.props.grade === g).length);
  it('アミン', () => {
    expect(classes(N(2, 7))).toEqual({ amine: 2 });
    expect(classes(N(3, 9))).toEqual({ amine: 4 });
    expect(grades(N(3, 9))).toEqual([2, 1, 1]);
    expect(classes(N(4, 11))).toEqual({ amine: 8 });
    expect(grades(N(4, 11))).toEqual([4, 3, 1]);
    expect(isomers(N(4, 11)).filter((i) => i.chiral > 0).map((i) => i.formula)).toEqual(['CH3CH(NH2)CH2CH3']);
    expect(isomers(N(2, 7)).map((i) => i.name).sort()).toEqual(['エチルアミン', 'ジメチルアミン']);
    for (const i of isomers(N(4, 11))) expect([i.props.basic, i.props.na, i.props.bleach]).toEqual([true, false, false]);
    expect(specText({ c: 4, h: 9, n: 1, o: 2 })).toBe('C4H9NO2');
  });
  it('アミド', () => {
    const all = isomers(N(3, 7, 1));
    expect(all.map((i) => i.formula).sort()).toEqual(['CH3CH2CONH2', 'CH3CONHCH3', 'HCON(CH3)2', 'HCONHC2H5']);
    for (const i of all) expect([i.cls, i.props.basic, i.props.silver]).toEqual(['amide', false, false]);
    const h = (formula: string): string[] => {
      const i = all.find((x) => x.formula === formula)!;
      expect(i.props.hydrolysis!.alcohol).toBe('');
      return [byKey(i.props.hydrolysis!.acid)!.name, byKey(i.props.hydrolysis!.amine!)!.name];
    };
    expect(h('CH3CH2CONH2')).toEqual(['プロピオン酸', 'アンモニア']);
    expect(h('CH3CONHCH3')).toEqual(['酢酸', 'メチルアミン']);
    expect(h('HCON(CH3)2')).toEqual(['ギ酸', 'ジメチルアミン']);
    expect(h('HCONHC2H5')).toEqual(['ギ酸', 'エチルアミン']);
    expect(mol('N').formula).toBe('NH3');
    expect(classes(N(4, 9, 1))).toEqual({ amide: 8 });
  });
  it('アミノ酸', () => {
    // アミンの N 1 個と –COOH 1 個をもつものを aminoacid とする。N は第一級に限らない
    const c3 = isomers(N(3, 7, 2));
    expect(c3.map((i) => i.name).sort()).toEqual(['N-メチルグリシン', 'β-アラニン', 'アラニン']);
    expect(c3.filter((i) => i.props.grade === 1).map((i) => [i.name, i.props.alpha, i.chiral])).toEqual([['β-アラニン', false, 0], ['アラニン', true, 1]]);
    const c4 = isomers(N(4, 9, 2));
    expect(classes(N(4, 9, 2))).toEqual({ aminoacid: 9 });
    const primary = c4.filter((i) => i.props.grade === 1);
    expect(primary.map((i) => i.name).sort()).toEqual(['2-アミノ-2-メチルプロパン酸', '2-アミノブタン酸', '3-アミノ-2-メチルプロパン酸', '3-アミノブタン酸', '4-アミノブタン酸']);
    expect(primary.filter((i) => i.props.alpha).map((i) => i.name).sort()).toEqual(['2-アミノ-2-メチルプロパン酸', '2-アミノブタン酸']);
    for (const i of c4) expect([i.props.basic, i.props.nahco3, i.props.naoh]).toEqual([true, true, true]);
    expect(mol('C(N)(C(=O)(O))').formula).toBe('H2NCH2COOH');
    expect(mol('C(N)(C(=O)(O))').name).toBe('グリシン');
    // 対象外：アミノ酸のエステル、ヒドロキシアミド、尿素、カルバミン酸、ニトロ・N–O 化合物、エナミン
    for (const bad of ['C(N)(C(=O)(O(C)))', 'C(O)(C(=O)(N))', 'C(=O)(N)(N)', 'C(=O)(N)(O)', 'N(O)(C)', 'C(=C)(N)', 'C(N)(N)', 'C(N)(O)', 'N(N)(C)', 'N(Cl)(C)']) {
      expect(byKey(bad), bad).toBeUndefined();
    }
  });
  it('芳香族の窒素化合物', () => {
    expect(isomers(N(7, 9)).map((i) => i.name).sort()).toEqual(['N-メチルアニリン', 'm-トルイジン', 'o-トルイジン', 'p-トルイジン', 'ベンジルアミン']);
    const aniline = mol('N(Ph)');
    expect([aniline.name, aniline.cls, aniline.props.basic, aniline.props.bleach, aniline.props.grade]).toEqual(['アニリン', 'amine', true, true, 1]);
    expect(mol('C(N)(Ph)').props.bleach).toBe(false);
    const anilide = mol('C(C)(=O)(N(Ph))');
    expect([anilide.name, anilide.formula, anilide.cls, anilide.props.basic]).toEqual(['アセトアニリド', 'C6H5NHCOCH3', 'amide', false]);
    expect(byKey(anilide.props.hydrolysis!.acid)!.name).toBe('酢酸');
    expect(byKey(anilide.props.hydrolysis!.amine!)!.name).toBe('アニリン');
    const amides = isomers(N(8, 9, 1)).filter((i) => i.cls === 'amide');
    expect(amides.length).toBe(11);
    expect(amides.map((i) => i.name)).toContain('アセトアニリド');
    expect(classes(N(8, 11))).toEqual({ amine: 20 });
    const paba = mol('Arp(N)(C(=O)(O))');
    expect([paba.cls, paba.props.alpha, paba.props.basic, paba.props.nahco3]).toEqual(['aminoacid', false, true, true]);
  });
});

describe('三置換ベンゼン', () => {
  it('数え上げ', () => {
    expect(isomers({ c: 6, h: 3, cl: 3 }).map((i) => i.name).sort()).toEqual(['1,2,3-トリクロロベンゼン', '1,2,4-トリクロロベンゼン', '1,3,5-トリクロロベンゼン']);
    const c9 = isomers(S(9, 12));
    expect(c9.length).toBe(8);
    expect(c9.filter((i) => i.mol.atoms.includes('Tr')).map((i) => i.name).sort()).toEqual(['1,2,3-トリメチルベンゼン', '1,2,4-トリメチルベンゼン', '1,3,5-トリメチルベンゼン']);
    const c7 = isomers({ c: 7, h: 6, cl: 2 });
    expect(c7.length).toBe(10);
    expect(c7.filter((i) => i.mol.atoms.includes('Tr')).map((i) => i.name).sort()).toEqual(
      ['2,3-ジクロロトルエン', '2,4-ジクロロトルエン', '2,5-ジクロロトルエン', '2,6-ジクロロトルエン', '3,4-ジクロロトルエン', '3,5-ジクロロトルエン']);
    // 3 つとも異なる置換基なら 10 通り
    expect(isomers({ c: 7, h: 6, o: 1, cl: 1, br: 1 }).filter((i) => i.mol.atoms.includes('Tr') && i.cls === 'phenol' && i.formula.includes('CH3')).length).toBe(0);
    expect(isomers({ c: 6, h: 4, o: 1, cl: 1, br: 1 }).filter((i) => i.mol.atoms.includes('Tr')).length).toBe(10);
    // 既存の数は変わらない
    expect(isomers(S(8, 10)).length).toBe(4);
    expect(isomers(S(7, 8, 1)).length).toBe(5);
  });
  it('性質', () => {
    const tmb = (pat: string) => isomers(S(9, 12)).find((i) => triPattern(i) === pat)!;
    expect(['123', '124', '135'].map((p) => ringSubCount(tmb(p)))).toEqual([2, 3, 1]);
    for (const p of ['123', '124', '135']) {
      const acid = byKey(tmb(p).props.sideOxid!)!;
      expect(triPattern(acid)).toBe(p);
      expect(specText(specOf(acid.mol))).toBe('C9H6O6');
      expect(acid.cls).toBe('acid');
    }
    const x = (name: string) => named(S(8, 10, 1), name);
    expect(['2,3-', '2,4-', '2,5-', '2,6-', '3,4-', '3,5-'].map((p) => ringSubCount(x(p + 'ジメチルフェノール')))).toEqual([3, 3, 3, 2, 3, 2]);
    expect(['2,3-', '2,4-', '2,5-', '2,6-', '3,4-', '3,5-'].map((p) => twinPos(x(p + 'ジメチルフェノール')))).toEqual(['o', 'm', 'p', 'm', 'o', 'm']);
    expect(['2,3-', '2,4-', '2,5-', '2,6-', '3,4-', '3,5-'].map((p) => triPattern(x(p + 'ジメチルフェノール')))).toEqual(['123', '124', '124', '123', '124', '135']);
    expect(x('2,4-ジメチルフェノール').props.fecl3).toBe(true);
    expect(x('2,4-ジメチルフェノール').formula).toBe('１,２,４-C6H3(OH)(CH3)CH3');
  });
  it('原子や結合の順序、番号の向きによらず同じ key', () => {
    // 2,4-ジメチルフェノール：環の 1 位に OH、2 位と 4 位に CH3
    const a: Mol = { atoms: ['Tr', 'O', 'C', 'C'], pos: ['124'], bonds: [[0, 1, 1, 1], [0, 2, 1, 2], [0, 3, 1, 4]] };
    const b: Mol = { atoms: ['C', 'O', 'C', 'Tr'], pos: [undefined, undefined, undefined, '124'], bonds: [[2, 3, 1, 4], [3, 1, 1, 1], [0, 3, 1, 2]] };
    expect(canonical(a)).toBe(canonical(b));
    expect(byKey(canonical(a))!.name).toBe('2,4-ジメチルフェノール');
    expect(isValid(a)).toBe(true);
    expect(specText(specOf(a))).toBe('C8H10O');
    // 123 型の両端は 1 と 3 のどちらで書いてもよい
    const c: Mol = { atoms: ['Tr', 'O', 'C', 'C'], pos: ['123'], bonds: [[0, 1, 1, 2], [0, 2, 1, 1], [0, 3, 1, 3]] };
    expect(byKey(canonical(c))!.name).toBe('2,6-ジメチルフェノール');
    expect(isValid({ atoms: ['Tr', 'O', 'C', 'C'], pos: ['124'], bonds: [[0, 1, 1, 1], [0, 2, 1, 2], [0, 3, 1, 2]] })).toBe(false);
    // 環の炭素の番号から節点の書き方を求める
    expect(ringNode([3])).toEqual({ atom: 'Ph' });
    expect(ringNode([2, 5])).toEqual({ atom: 'Ar', pos: 'p' });
    expect(ringNode([6, 1])).toEqual({ atom: 'Ar', pos: 'o' });
    expect(ringNode([1, 3, 5])).toEqual({ atom: 'Tr', pos: '135', slots: [0, 0, 0] });
    expect(ringNode([6, 1, 2])).toEqual({ atom: 'Tr', pos: '123', slots: [1, 2, 1] });
    expect(ringNode([1, 2, 4])).toEqual({ atom: 'Tr', pos: '124', slots: [1, 2, 4] });
    expect(ringNode([1, 3, 4])).toEqual({ atom: 'Tr', pos: '124', slots: [4, 2, 1] });
    expect(ringNode([1, 1])).toBeUndefined();
    // 2,5-ジメチルフェノールを、環の番号 1（OH）、2、5（CH3）から組み立てる
    const node = ringNode([1, 2, 5])!;
    const d: Mol = { atoms: [node.atom, 'O', 'C', 'C'], pos: [node.pos], bonds: [[0, 1, 1, node.slots![0]], [0, 2, 1, node.slots![1]], [0, 3, 1, node.slots![2]]] };
    expect(byKey(canonical(d))!.name).toBe('2,5-ジメチルフェノール');
  });
  it('描いた構造が木でなくても止まらない', () => {
    const ring: Mol = { atoms: ['C', 'C', 'C'], bonds: [[0, 1, 1], [1, 2, 1], [2, 0, 1]] };
    expect(canonical(ring).startsWith('#')).toBe(true);
    expect(isValid(ring)).toBe(false);
    expect(specText(specOf(ring))).toBe('C3H6');
    const apart: Mol = { atoms: ['C', 'C', 'O'], bonds: [[0, 1, 1]] };
    expect(canonical(apart).startsWith('#')).toBe(true);
    expect(isValid(apart)).toBe(false);
    // 規則の外でも、木であれば key は決まる（描いた答えと照合できる）
    const diol: Mol = { atoms: ['O', 'C', 'C', 'O'], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1]] };
    expect(canonical(diol)).toBe(canonical({ atoms: ['C', 'O', 'O', 'C'], bonds: [[3, 2, 1], [0, 3, 1], [1, 0, 1]] }));
    expect(isValid(diol)).toBe(false);
    const amine: Mol = { atoms: ['N', 'C', 'C'], bonds: [[1, 0, 1], [1, 2, 1]] };
    expect(byKey(canonical(amine))!.name).toBe('エチルアミン');
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
    for (const level of levels) for (let seed = 0; seed < 4000; seed++) {
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
    expect(got.get('C3H9N')!.size).toBe(4);
    expect(got.get('C3H7NO')!.size).toBe(4);
    expect(got.get('C4H9NO2')!.size).toBe(5);
    expect(got.get('C6H3Cl3')!.size).toBe(3);
    expect(got.get('C9H12')!.size).toBe(8);
    expect(got.get('C7H6Cl2')!.size).toBe(10);
    expect(got.get('C7H9N')!.size).toBe(5);
    expect(got.get('C8H9NO')!.size).toBe(11);
    // 6 種類のジメチルフェノールもすべて決められる
    expect([...got.get('C8H10O')!].filter((k) => k.includes('Tr')).length).toBe(6);
    // 正解は必ず、問題文で言い切った範囲に入っている
    for (const k of got.get('C4H9NO2')!) expect(byKey(k)!.props.grade).toBe(1);
    for (const k of got.get('C8H9NO')!) expect(byKey(k)!.cls).toBe('amide');
  });
});
