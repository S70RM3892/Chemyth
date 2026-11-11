import { describe, expect, it } from 'vitest';
import { DRILLS, checkStep, mulberry32 } from '../src/content/drills';
import { SYLLABUS } from '../src/content/syllabus';

describe('連鎖計算（共通の検査）', () => {
  it('型の id は重複せず、範囲表の項目に結びついている', () => {
    expect(new Set(DRILLS.map((g) => g.id)).size).toBe(DRILLS.length);
    expect(DRILLS.length).toBeGreaterThanOrEqual(20);
    for (const g of DRILLS) expect(SYLLABUS.some((u) => u.id === g.unit), g.id).toBe(true);
  });
  for (const g of DRILLS) {
    it(`${g.title}：どの乱数でも 4〜6 問で、答えが数として定まる`, () => {
      for (let seed = 1; seed <= 200; seed++) {
        const d = g.make(mulberry32(seed));
        expect(d.steps.length).toBeGreaterThanOrEqual(4);
        expect(d.steps.length).toBeLessThanOrEqual(6);
        expect(d.intro.length).toBeGreaterThan(10);
        for (const s of d.steps) {
          expect(Number.isFinite(s.answer), `${g.id} seed ${seed}: ${s.text}`).toBe(true);
          expect(checkStep(s, s.answer)).toBe(true);
          expect(s.text + s.how + d.intro).not.toMatch(/NaN|undefined|Infinity/);
        }
        expect(g.make(mulberry32(seed))).toEqual(d);
      }
    });
  }
});
