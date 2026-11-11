import { describe, expect, it } from 'vitest';
import { canonical, isomers, isValid, specOf, specText, type Mol } from '../src/chem/isomers';

/** 画面で組み立てた構造（原子の並び順は置いた順でまちまち）が、エンジンの異性体と同じ分子として判定されること */
describe('組み立てた構造式の判定', () => {
  const find = (spec: Parameters<typeof isomers>[0], formula: string) => isomers(spec).find((i) => i.formula === formula);
  it('鎖式：置いた順が違っても同じ分子になる', () => {
    const a: Mol = { atoms: ['C', 'C', 'O', 'C'], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 1]] };      // CH3–CH(OH)–CH3
    const b: Mol = { atoms: ['O', 'C', 'C', 'C'], bonds: [[1, 0, 1], [2, 1, 1], [1, 3, 1]] };
    expect(canonical(a)).toBe(canonical(b));
    expect(specText(specOf(a))).toBe('C3H8O');
    const target = isomers({ c: 3, h: 8, o: 1 }).find((i) => i.name === '2-プロパノール')!;
    expect(canonical(a)).toBe(target.key);
    const ald: Mol = { atoms: ['C', 'C', 'O'], bonds: [[0, 1, 1], [1, 2, 2]] };                     // CH3–CH=O
    expect(isValid(ald)).toBe(true);
    expect(specText(specOf(ald))).toBe('C2H4O');
  });
  it('ベンゼン環：一置換と二置換（o・m・p）を部品として置く', () => {
    const cresol = (pos: 'o' | 'm' | 'p'): Mol => ({ atoms: ['Ar', 'C', 'O'], pos: [pos, undefined, undefined], bonds: [[0, 1, 1], [0, 2, 1]] });
    const keys = new Set((['o', 'm', 'p'] as const).map((p) => canonical(cresol(p))));
    expect(keys.size).toBe(3);
    const all = isomers({ c: 7, h: 8, o: 1 });
    for (const k of keys) expect(all.some((i) => i.key === k)).toBe(true);
    const benzyl: Mol = { atoms: ['Ph', 'C', 'O'], bonds: [[0, 1, 1], [1, 2, 1]] };                 // C6H5–CH2–OH
    expect(all.find((i) => i.key === canonical(benzyl))?.name).toBe('ベンジルアルコール');
    expect(specText(specOf(benzyl))).toBe('C7H8O');
    expect(find({ c: 7, h: 8, o: 1 }, 'C6H5CH2OH')?.key).toBe(canonical(benzyl));
  });
  it('窒素：アミンとアミドを組み立てられる', () => {
    const amine: Mol = { atoms: ['C', 'C', 'N'], bonds: [[0, 1, 1], [1, 2, 1]] };                   // CH3CH2NH2
    expect(isomers({ c: 2, h: 7, n: 1 }).some((i) => i.key === canonical(amine))).toBe(true);
    const amide: Mol = { atoms: ['C', 'C', 'O', 'N'], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] };   // CH3CONH2
    expect(specText(specOf(amide))).toBe('C2H5NO');
    expect(isValid(amide)).toBe(true);
  });
  it('環になっている・つながっていない・手が多すぎる構造は、正しくないと判定する（止まらない）', () => {
    const ring: Mol = { atoms: ['C', 'C', 'C'], bonds: [[0, 1, 1], [1, 2, 1], [2, 0, 1]] };
    expect(isValid(ring)).toBe(false);
    expect(typeof canonical(ring)).toBe('string');
    const over: Mol = { atoms: ['O', 'C', 'C', 'C'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] };
    expect(isValid(over)).toBe(false);
  });
});
