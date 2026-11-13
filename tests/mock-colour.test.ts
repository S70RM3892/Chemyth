import { describe, expect, it } from 'vitest';
import { questionsFor } from '../src/content/mock';
import { recipeById } from '../src/content/recipes';
import { reactionLook } from '../src/content/looks';

// 模試の色の問い：その場面の色を答えにする（I₂ は水溶液中では I₃⁻ の褐色、熱した気体の中では紫色。固体の黒紫色を答えにしない）
const colourQs = (id: string) => {
  const r = recipeById(id)!;
  const out = [];
  for (let seed = 1; seed <= 60; seed++) {
    let x = seed;
    const rnd = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
    out.push(...questionsFor(r, '①', 6, rnd).filter((q) => q.topic === '色'));
  }
  return out;
};

describe('模試の色の問い', () => {
  it('水溶液の中の I₂ は褐色を答えにし、問いの文も水溶液中と言う', () => {
    for (const id of ['h2o2-ki', 'br-i', 'ki-electrolysis']) {
      expect(reactionLook(recipeById(id)!).notes.find((n) => n.id === 'I2')?.form).toBe('sol');
      const qs = colourQs(id).filter((q) => q.text.includes('I₂'));
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) { expect(q.answer).toBe('褐色'); expect(q.text).toContain('水溶液中で'); }
    }
  });
  it('熱した気体の中の I₂（HI の分解）は紫色を答えにする', () => {
    const qs = colourQs('hi-decomp').filter((q) => q.text.includes('I₂'));
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) { expect(q.answer).toBe('紫色'); expect(q.text).toContain('気体の'); }
  });
  it('ほかの物質の問いは、いままでどおり主な色', () => {
    const qs = colourQs('ostwald-2').filter((q) => q.text.includes('NO₂'));
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) { expect(q.answer).toBe('赤褐色'); expect(q.text).toContain('NO₂ の色'); }
  });
});
