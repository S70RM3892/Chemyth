import { describe, expect, it } from 'vitest';
import { AMINOS, arrangements, cleave, makePeptide, peptideMass } from '../src/content/peptide';

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const perms = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

describe('ペプチドの配列決定', () => {
  it('分子量と切断の計算', () => {
    expect(peptideMass(['Gly', 'Ala'])).toBe(75 + 89 - 18);
    expect(peptideMass(['Gly', 'Ala', 'Phe', 'Lys'])).toBe(75 + 89 + 165 + 146 - 54);
    const ring = (a: { ring?: boolean }) => !!a.ring;
    expect(cleave(['Gly', 'Phe', 'Ala', 'Tyr', 'Ser'], ring)).toEqual([['Gly', 'Phe'], ['Ala', 'Tyr'], ['Ser']]);
    expect(cleave(['Gly', 'Ala', 'Phe'], ring)).toEqual([['Gly', 'Ala', 'Phe']]); // C 末端では切れない
    expect(arrangements(['Gly', 'Gly', 'Ala'])).toBe(3);
    expect(arrangements(['Gly', 'Ala', 'Phe'])).toBe(6);
    expect(new Set(AMINOS.map((a) => a.id)).size).toBe(AMINOS.length);
  });
  for (const level of [1, 2, 3] as const) {
    it(`水準 ${level}：手がかりを全部満たす配列は、答えの 1 つだけ`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const q = makePeptide(mulberry(seed * 7919 + level), level);
        expect(q.answer.length).toBe(level + 2);
        expect([...q.parts].sort()).toEqual([...q.answer].sort());
        expect(q.clues.length).toBeGreaterThanOrEqual(2);
        const ok = new Set(perms(q.answer).filter((s) => q.clues.every((c) => c.check(s))).map((s) => s.join('-')));
        expect([...ok], `seed ${seed}`).toEqual([q.answer.join('-')]);
        expect(q.text).not.toMatch(/undefined|NaN/);
        expect(q.how).not.toMatch(/undefined|NaN/);
        // 同じ乱数なら同じ問題
        expect(makePeptide(mulberry(seed * 7919 + level), level).answer).toEqual(q.answer);
      }
    });
  }
});
