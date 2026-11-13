import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/content/recipes';
import { KNOWLEDGE } from '../src/content/knowledge';
import { mulberry32 } from '../src/content/drills';
import { practiceIds, setupMissed, snapAnswer, undoAnswer } from '../src/engine/learn';
import { readStudy, runOf } from '../src/engine/study';
import { answer, deserialize, learn, newWorld, serialize } from '../src/engine/world';

const T = new Date(2026, 10, 12, 15, 0).getTime();

describe('練習の 10 問の選び方', () => {
  // 単元の練習：まちがえた問いが先、そのあとに単元の残り。混ぜる順でも、まちがえた問いは 10 問からこぼれない
  const ids = KNOWLEDGE.slice(0, 14).map((k) => `k:${k.id}`);
  const missed = ids.slice(0, 3);
  it('混ぜる順でも、先頭のまちがえた問いを必ず残す', () => {
    const w = newWorld();
    expect(w.study.order).toBe('mix');
    for (let seed = 0; seed < 200; seed++) {
      const list = practiceIds(w, ids, () => true, 10, mulberry32(seed), T);
      expect(list).toHaveLength(10);
      for (const id of missed) expect(list).toContain(id);
      expect(list.every((id) => ids.slice(0, 10).includes(id))).toBe(true);
    }
  });
  it('解けない問いは数に入れず、重なりは 1 つにする', () => {
    const w = newWorld();
    const list = practiceIds(w, [ids[0], ids[0], ...ids.slice(1)], (id) => id !== ids[1], 10, mulberry32(1), T);
    expect(list).toHaveLength(10);
    expect(new Set(list).size).toBe(10);
    expect(list).not.toContain(ids[1]);
    expect(list).toContain(ids[10]);
  });
  it('苦手から：選んだ 10 問を、思い出せる確率の低い順に並べる', () => {
    const w = newWorld();
    w.study.order = 'weak';
    // 3 番目だけ、ずっと前に答えて忘れかけている
    for (const id of ids.slice(0, 10)) w.srs[id] = { due: T, s: 30, d: 5, last: T - 3600000, n: 3, l: 0, iv: 3 };
    w.srs[ids[2]] = { due: T, s: 1, d: 5, last: T - 20 * 86400000, n: 3, l: 2, iv: 1 };
    const list = practiceIds(w, ids, () => true, 10, mulberry32(1), T);
    expect(list[0]).toBe(ids[2]);
    expect(list).not.toContain(ids[12]);
  });
});

describe('一発で書けたもの', () => {
  const r = RECIPES.find((x) => x.machine === 'reactor')!;
  it('覚えたあとの復習でまちがえても、一発で書けたことは変わらない', () => {
    const w = newWorld();
    learn(w, r, true);
    expect(setupMissed(w).has(r.id)).toBe(false);
    // 復習の問いでまちがえた記録（装置の種類で残る）
    w.mistakes.push({ machine: r.machine, recipe: r.id, part: 'condition', t: w.srs[`r:${r.id}`].t0! + 60000 });
    expect(setupMissed(w).has(r.id)).toBe(false);
  });
  it('初めて正しく設定するまでにまちがえたものは、一発に数えない', () => {
    const w = newWorld();
    w.mistakes.push({ machine: r.machine, recipe: r.id, part: 'products', t: Date.now() - 1000 });
    learn(w, r, false);
    expect(setupMissed(w).has(r.id)).toBe(true);
  });
  it('覚えた時刻のない古いセーブは、すべての間違いで数える', () => {
    const w = newWorld();
    w.learned.push(r.id);
    w.srs[`r:${r.id}`] = { due: T, s: 3, d: 5, last: T, n: 2, l: 0, iv: 2 };
    w.mistakes.push({ machine: r.machine, recipe: r.id, part: 'condition', t: T + 1 });
    expect(setupMissed(w).has(r.id)).toBe(true);
    // 知識問題・計算などは、反応の設定の間違いではない
    const w2 = newWorld();
    w2.mistakes.push({ machine: 'quiz', recipe: r.id, part: 'quiz', t: T });
    expect(setupMissed(w2).size).toBe(0);
  });
});

describe('答えの取り消し', () => {
  const a = `k:${KNOWLEDGE[0].id}`, b = `k:${KNOWLEDGE[1].id}`;
  it('そのあとほかの問いに答えていなければ、取り消せる', () => {
    const w = newWorld();
    const s = snapAnswer(w, a, T);
    answer(w, a, false, 'sure', T);
    expect(undoAnswer(w, s, T + 1000)).toBe(true);
    expect(w.srs[a]).toBeUndefined();
    expect(w.calib.sure).toEqual([0, 0]);
    expect(w.relearn).toEqual([]);
  });
  it('あとでほかの問いに答えていたら、取り消さない（その答えの記録を消さない）', () => {
    const w = newWorld();
    const s = snapAnswer(w, a, T);
    answer(w, a, true, 'sure', T);
    // 工場の札で答えてすぐ、復習の窓でほかの問いをまちがえた
    answer(w, b, false, 'sure', T + 2000);
    expect(undoAnswer(w, s, T + 3000)).toBe(false);
    expect(w.relearn.map((x) => x.id)).toContain(b);
    expect(w.hcLog.map((x) => x.id)).toContain(b);
    expect(w.calib.sure).toEqual([2, 1]);
    expect(w.srs[a]).toBeDefined();
  });
});

describe('今夜・今朝の 10 問の続き', () => {
  it('途中まで答えた回は、セーブを通っても残る', () => {
    const w = newWorld();
    w.study.run = { kind: 'morning', day: '2026-11-11', ids: ['k:a', 'k:b', 'k:c'], i: 2, got: 1 };
    const r = deserialize(serialize(w))!;
    expect(r.study.run).toEqual({ kind: 'morning', day: '2026-11-11', ids: ['k:a', 'k:b', 'k:c'], i: 2, got: 1 });
    expect(runOf(r.study, 'morning', '2026-11-11')?.i).toBe(2);
    // ほかの回（今夜の 10 問、別の日）には続きを使わない
    expect(runOf(r.study, 'night', '2026-11-11')).toBeNull();
    expect(runOf(r.study, 'morning', '2026-11-12')).toBeNull();
  });
  it('壊れた記録は読まない。数は範囲に収める', () => {
    expect(readStudy({ run: { kind: 'x', day: 'd', ids: [], i: 0, got: 0 } }).run).toBeFalsy();
    expect(readStudy({ run: { kind: 'night', day: 'd', ids: [1, 2], i: 0, got: 0 } }).run).toBeFalsy();
    expect(readStudy({ run: null }).run).toBeFalsy();
    expect(readStudy({}).run).toBeFalsy();
    expect(readStudy({ run: { kind: 'night', day: 'd', ids: ['k:a'], i: 9, got: 9 } }).run).toEqual({ kind: 'night', day: 'd', ids: ['k:a'], i: 1, got: 1 });
  });
});
