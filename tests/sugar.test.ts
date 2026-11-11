import { describe, expect, it } from 'vitest';
import { candidates, cleave, makeSugar, methylation, reducing, sugarKey, sugarMass, type Sugar } from '../src/content/sugar';

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('糖の構造決定', () => {
  const maltose: Sugar = [{ anomer: 'α', pos: 4 }], cellobiose: Sugar = [{ anomer: 'β', pos: 4 }], trehalose: Sugar = [{ anomer: 'α', pos: 1 }];
  it('二糖の性質', () => {
    expect(sugarMass(maltose)).toBe(342);
    expect(reducing(maltose)).toBe(true);
    expect(reducing(trehalose)).toBe(false);                       // 1 位どうしの結合は還元性を示さない
    expect(methylation(maltose)).toEqual(['2,3,4,6', '2,3,6']);    // 非還元末端と、4 位で結合した還元末端
    expect(methylation([{ anomer: 'α', pos: 6 }])).toEqual(['2,3,4', '2,3,4,6']);
    expect(methylation(trehalose)).toEqual(['2,3,4,6', '2,3,4,6']);
    expect(cleave(maltose, 'α')).toEqual([[], []]);                // マルターゼで 2 分子のグルコース
    expect(cleave(cellobiose, 'α')).toEqual([cellobiose]);         // セロビオースは α の酵素では切れない
    expect(candidates(2).length).toBe(5);
    expect(candidates(3).length).toBe(16);
    expect(candidates(4).length).toBe(64);
    expect(sugarMass([{ anomer: 'α', pos: 4 }, { anomer: 'α', pos: 6 }])).toBe(504);
  });
  for (const level of [1, 2, 3] as const) {
    it(`水準 ${level}：手がかりを全部満たす結合様式は、答えの 1 つだけ`, () => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 300; seed++) {
        const q = makeSugar(mulberry(seed * 104729 + level), level);
        expect(q.answer.length).toBe(level);
        const ok = candidates(level + 1).filter((s) => q.clues.every((c) => c.check(s))).map(sugarKey);
        expect(ok, `seed ${seed}`).toEqual([sugarKey(q.answer)]);
        expect(q.options.map(sugarKey)).toContain(sugarKey(q.answer));
        expect(new Set(q.options.map(sugarKey)).size).toBe(q.options.length);
        expect(q.text + q.how + q.clues.map((c) => c.text).join('')).not.toMatch(/undefined|NaN/);
        expect(sugarKey(makeSugar(mulberry(seed * 104729 + level), level).answer)).toBe(sugarKey(q.answer));
        seen.add(sugarKey(q.answer));
      }
      expect(seen.size).toBeGreaterThanOrEqual(level === 1 ? 5 : 8); // いろいろな答えが出る
    });
  }
});
