import { describe, expect, it } from 'vitest';
import { branches, candidates, cleave, glucans, linear, makeSugar, methylation, methylName, reducing, size, sugarKey, sugarMass, sugarText, type Sugar } from '../src/content/sugar';

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const glc = (...subs: Sugar['subs']): Sugar => ({ mono: 'グルコース', subs });

describe('糖の構造決定', () => {
  const glucose = glc();
  const maltose = linear([{ anomer: 'α', pos: 4 }]), cellobiose = linear([{ anomer: 'β', pos: 4 }]), trehalose = linear([{ anomer: 'α', pos: 1 }]);
  const sucrose = linear([{ anomer: 'α', pos: 2 }], ['グルコース', 'フルクトース']);
  const lactose = linear([{ anomer: 'β', pos: 4 }], ['ガラクトース', 'グルコース']);
  /** アミロペクチンの枝分かれのまわり：右から 2 番目のグルコースの 4 位と 6 位に 1 つずつ */
  const branched = glc({ anomer: 'α', pos: 4, sugar: glc({ anomer: 'α', pos: 4, sugar: glc() }, { anomer: 'α', pos: 6, sugar: glc() }) });

  it('二糖の性質', () => {
    expect(sugarMass(maltose)).toBe(342);
    expect(reducing(maltose)).toBe(true);
    expect(reducing(trehalose)).toBe(false);                       // 1 位どうしの結合は還元性を示さない
    expect(methylation(maltose)).toEqual(['2,3,4,6', '2,3,6']);    // 非還元末端と、4 位で結合した還元末端
    expect(methylation(linear([{ anomer: 'α', pos: 6 }]))).toEqual(['2,3,4', '2,3,4,6']);
    expect(methylation(trehalose)).toEqual(['2,3,4,6', '2,3,4,6']);
    expect(cleave(maltose, 'α')).toEqual([glucose, glucose]);      // α 結合を切る酵素で 2 分子のグルコース
    expect(cleave(cellobiose, 'α')).toEqual([cellobiose]);         // セロビオースは α の酵素では切れない
    expect(cleave(trehalose, 'α')).toEqual([trehalose]);           // α1→4・α1→6 を切る酵素は、1 位どうしの結合には作用しない
    expect(sugarMass(linear([{ anomer: 'α', pos: 4 }, { anomer: 'α', pos: 6 }]))).toBe(504);
    expect(sugarText(maltose)).toBe('グルコース–(α1→4)–グルコース');
    expect(sugarText(trehalose)).toBe('グルコース–(α1↔α1)–グルコース');
  });

  it('スクロースとラクトース', () => {
    expect(sugarText(sucrose)).toBe('グルコース–(α1↔β2)–フルクトース');
    expect(sugarText(lactose)).toBe('ガラクトース–(β1→4)–グルコース');
    expect([sugarMass(sucrose), sugarMass(lactose)]).toEqual([342, 342]);   // どれも C₆H₁₂O₆ の単糖 2 個から水 1 分子
    expect(reducing(sucrose)).toBe(false);                         // グルコースの 1 位とフルクトースの 2 位が結合に使われる
    expect(reducing(lactose)).toBe(true);
    expect(cleave(sucrose, 'スクロース型').map(sugarText).sort()).toEqual(['グルコース', 'フルクトース']);   // インベルターゼ
    expect(cleave(sucrose, 'α')).toEqual([sucrose]);
    expect(cleave(lactose, 'スクロース型')).toEqual([lactose]);
    expect(cleave(lactose, 'β').map(sugarText).sort()).toEqual(['ガラクトース', 'グルコース']);
    expect(methylation(sucrose).map(methylName).sort()).toEqual(['1,3,4,6-テトラ-O-メチルフルクトース', '2,3,4,6-テトラ-O-メチルグルコース']);
    expect(methylation(lactose).map(methylName).sort()).toEqual(['2,3,4,6-テトラ-O-メチルガラクトース', '2,3,6-トリ-O-メチルグルコース']);
  });

  it('枝分かれのある糖', () => {
    expect(sugarText(branched)).toBe('グルコース–(α1→4)–[グルコース–(α1→6)]–グルコース–(α1→4)–グルコース');
    expect([size(branched), branches(branched), branches(maltose)]).toEqual([4, 1, 0]);
    expect(sugarMass(branched)).toBe(666);                         // 180 × 4 − 18 × 3
    expect(reducing(branched)).toBe(true);
    // 非還元末端 2 つがテトラ、枝分かれの糖は 4 位と 6 位が –OH に戻るので 2,3-ジ、還元末端は 4 位で結合しているので 2,3,6-トリ
    expect(methylation(branched)).toEqual(['2,3', '2,3,4,6', '2,3,4,6', '2,3,6']);
    expect(methylName('2,3')).toBe('2,3-ジ-O-メチルグルコース');
    // 枝を切る酵素（α1→6 だけ）：グルコース 1 分子と、α1→4 だけの三糖
    expect(cleave(branched, 'α1→6').map(sugarText).sort()).toEqual(['グルコース', 'グルコース–(α1→4)–グルコース–(α1→4)–グルコース']);
    // α1→4 だけを切る酵素：グルコース 2 分子と、α1→6 の二糖
    expect(cleave(branched, 'α1→4').map(sugarText).sort()).toEqual(['グルコース', 'グルコース', 'グルコース–(α1→6)–グルコース']);
    expect(cleave(branched, 'α').map(sugarText)).toEqual(['グルコース', 'グルコース', 'グルコース', 'グルコース']);
    expect(cleave(branched, 'β')).toEqual([branched]);
    // 鎖状の糖は、結合の並びから作っても木として作っても同じ
    expect(sugarKey(linear([{ anomer: 'α', pos: 4 }, { anomer: 'β', pos: 6 }]))).toBe(sugarKey(glc({ anomer: 'β', pos: 6, sugar: glc({ anomer: 'α', pos: 4, sugar: glc() }) })));
    // 4 位と 6 位の枝は、どちらを先に書いても同じ構造
    const swapped = glc({ anomer: 'α', pos: 4, sugar: glc({ anomer: 'α', pos: 6, sugar: glc() }, { anomer: 'α', pos: 4, sugar: glc() }) });
    expect([sugarKey(swapped), sugarText(swapped)]).toEqual([sugarKey(branched), sugarText(branched)]);
  });

  it('候補の数', () => {
    // 鎖状のグルコース n 個：結合 n−1 個のそれぞれが α/β × 4 位/6 位の 4 通り → 4^(n−1)
    expect([2, 3, 4].map((n) => glucans(n).length)).toEqual([4, 16, 64]);
    // 枝分かれ 1 か所の四糖（結合 3 個、向きは 2^3 = 8 通り）：
    //  (a) 還元末端が枝分かれで、4 位と 6 位の一方に二糖、他方に単糖：どちらが二糖かで 2 × 二糖の中の結合が 4 位か 6 位かで 2 × 8 = 32
    //  (b) 還元末端の隣が枝分かれ（4 位と 6 位に単糖が 1 つずつ）：還元末端との結合が 4 位か 6 位かで 2 × 8 = 16
    //  合わせて 48
    expect(glucans(4, 1).length).toBe(48);
    expect(glucans(3, 1).length).toBe(4);                          // 三糖の枝分かれは形が 1 つで、2 つの結合の向き 2 × 2
    // 水準 1（二糖）：グルコースどうし 4 ＋ 非還元末端がガラクトース 4（ラクトースを含む）＋ トレハロース型 1 ＋ スクロース 1 = 10
    expect(candidates(2).length).toBe(10);
    // 水準 2（三糖）：グルコース 3 個 16 ＋ 左端をガラクトースにしたもの 16
    //  ＋ 右端がスクロース型のフルクトース（左端がグルコースかガラクトースかで 2 × 残りの結合 4）8 = 40
    expect(candidates(3).length).toBe(40);
    // 水準 3（グルコースだけの四糖）：鎖状 64 ＋ 枝分かれ 1 か所 48 = 112
    expect(candidates(4).length).toBe(112);
    for (const n of [2, 3, 4]) {
      const all = candidates(n);
      expect(new Set(all.map(sugarKey)).size).toBe(all.length);    // 同じ構造を二重に数えていない
      expect(new Set(all.map(sugarText)).size).toBe(all.length);   // 表記も構造ごとに違う
      for (const s of all) { expect(size(s)).toBe(n); expect(sugarMass(s)).toBe(180 * n - 18 * (n - 1)); }
    }
    const keys = candidates(2).map(sugarKey);
    for (const s of [maltose, cellobiose, trehalose, sucrose, lactose]) expect(keys).toContain(sugarKey(s));
    expect(candidates(3).filter((s) => !reducing(s)).length).toBe(8);   // 三糖で還元性がないのはスクロース型だけ
    expect(candidates(4).filter((s) => branches(s) === 1).length).toBe(48);
    expect(candidates(4).every(reducing)).toBe(true);
    expect(candidates(4).map(sugarKey)).toContain(sugarKey(branched));
  });

  for (const level of [1, 2, 3] as const) {
    it(`水準 ${level}：手がかりを全部満たす構造は、答えの 1 つだけ`, () => {
      const all = candidates(level + 1), seen = new Set<string>();
      let branchedAnswers = 0, linearAnswers = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const q = makeSugar(mulberry(seed * 104729 + level), level);
        expect(q.level).toBe(level);
        expect(size(q.answer)).toBe(level + 1);
        expect(q.clues.length).toBeGreaterThanOrEqual(2);
        // どの手がかりも、その水準のどの候補にも当てはめられる
        for (const c of q.clues) for (const s of all) expect(typeof c.check(s)).toBe('boolean');
        const ok = all.filter((s) => q.clues.every((c) => c.check(s))).map(sugarKey);
        expect(ok, `seed ${seed}`).toEqual([sugarKey(q.answer)]);
        expect(q.options.map(sugarKey)).toContain(sugarKey(q.answer));
        expect(new Set(q.options.map(sugarKey)).size).toBe(q.options.length);
        expect(q.options.length).toBeLessThanOrEqual(8);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        const texts = q.text + q.how + q.clues.map((c) => c.text).join('') + q.options.map(sugarText).join('');
        expect(texts).not.toMatch(/undefined|NaN|〈/);
        expect(q.how).toContain(`答え：${sugarText(q.answer)}`);
        expect(q.text).toContain(`分子量 ${sugarMass(q.answer)}`);
        // 酵素の記号は A から順に振られている
        const letters = [...new Set([...q.clues.map((c) => c.text).join('').matchAll(/酵素 ([A-F])/g)].map((m) => m[1]))];
        expect(letters.join('')).toBe('ABCDEF'.slice(0, letters.length));
        // 同じ乱数からは同じ問題
        const again = makeSugar(mulberry(seed * 104729 + level), level);
        expect(sugarKey(again.answer)).toBe(sugarKey(q.answer));
        expect([again.text, again.how, ...again.clues.map((c) => c.text), ...again.options.map(sugarKey)]).toEqual([q.text, q.how, ...q.clues.map((c) => c.text), ...q.options.map(sugarKey)]);
        seen.add(sugarKey(q.answer));
        if (branches(q.answer)) branchedAnswers++; else linearAnswers++;
      }
      expect(seen.size).toBeGreaterThanOrEqual(level === 1 ? 5 : 8); // いろいろな答えが出る
      if (level === 3) { expect(branchedAnswers).toBeGreaterThanOrEqual(30); expect(linearAnswers).toBeGreaterThanOrEqual(30); } // 鎖状も枝分かれも出る
      else expect(branchedAnswers).toBe(0);
    });
  }

  it('水準 1・2 では、スクロース型やガラクトースを含む答えも出る', () => {
    for (const level of [1, 2] as const) {
      const monos = new Set<string>();
      for (let seed = 1; seed <= 300; seed++) for (const m of sugarText(makeSugar(mulberry(seed * 7919 + level), level).answer).match(/[ァ-ヶー]+/g) || []) monos.add(m);
      expect([...monos].sort()).toEqual(['ガラクトース', 'グルコース', 'フルクトース']);
    }
  });

  it('どの候補も、手がかりをすべて使えば 1 つに決まる（答えになれない候補がない）', () => {
    for (const level of [1, 2, 3] as const) {
      const all = candidates(level + 1), seen = new Set<string>();
      for (let seed = 1; seed <= 4000 && seen.size < all.length; seed++) seen.add(sugarKey(makeSugar(mulberry(seed * 31 + level), level).answer));
      expect(seen.size).toBe(all.length);
    }
  });
});
