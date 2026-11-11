import { describe, expect, it } from 'vitest';
import { ESSAYS } from '../src/content/essays';
import { SYLLABUS, coverageOf } from '../src/content/syllabus';
import { DRILLS, mulberry32, sameExpr } from '../src/content/drills';

describe('論述', () => {
  it('id は重複せず、範囲表の項目に結びつき、要点と模範解答がある', () => {
    expect(new Set(ESSAYS.map((e) => e.id)).size).toBe(ESSAYS.length);
    expect(ESSAYS.length).toBeGreaterThanOrEqual(20);
    for (const e of ESSAYS) {
      expect(SYLLABUS.some((u) => u.id === e.unit), e.id).toBe(true);
      expect(e.keys.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.keys.length, e.id).toBeLessThanOrEqual(4);
      expect(e.model.length, e.id).toBeGreaterThan(20);
      // 模範解答は、字数の目安の 1.6 倍までに収める（目安は答案の長さで、模範解答は少し丁寧に書いてある）
      expect(e.model.length, e.id).toBeLessThanOrEqual(e.limit * 1.6);
    }
  });
  it('範囲表に、論述と演習が数えられている', () => {
    const c45 = coverageOf(SYLLABUS.find((u) => u.id === 'c45')!);
    expect(c45.practice).toEqual(expect.arrayContaining(['essay-sucrose', 'essay-denature', 'pep-1', 'sugar-1']));
  });
});

describe('式を打ち込んで答える設問', () => {
  it('どの型の式も、キーパッドで打てる文字だけでできていて、同じ式と判定される', () => {
    const KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '+', '−', '×', '÷', '(', ')', '²', '³', '√', '^']);
    let checked = 0;
    for (const g of DRILLS) for (let seed = 1; seed <= 20; seed++) {
      for (const s of g.make(mulberry32(seed)).steps) {
        const m = s as typeof s & { choices?: string[]; vars?: string[]; conceptual?: boolean };
        if (!m.choices || m.conceptual || !m.vars?.length) continue;
        const right = m.choices[s.answer];
        expect(sameExpr(right, right, m.vars), `${g.id}: ${right}`).toBe(true);
        // 上つきの数字や ⁿ は、キーパッドでは ^ を使って打つ。そう打ち直した式が、同じ式と判定されること
        const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n' };
        const typed = right.replace(/[⁰¹⁴-⁹ⁿ]+/g, (m2) => '^' + (m2.length > 1 ? '(' : '') + [...m2].map((ch) => SUP[ch]).join('') + (m2.length > 1 ? ')' : ''));
        expect(sameExpr(typed, right, m.vars), `${g.id}: ${typed}`).toBe(true);
        // 変数を取り除いた残りが、キーパッドにある文字だけであること（そうでないと、正しい式を打てない）
        let rest = typed;
        for (const v of [...m.vars].sort((x, y) => y.length - x.length)) rest = rest.split(v).join('');
        const extra = [...rest].filter((ch) => !KEYS.has(ch) && ch !== ' ' && ch !== '/' && ch !== '-' && ch !== '*');
        expect(extra, `${g.id}: ${typed} に打てない文字`).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
