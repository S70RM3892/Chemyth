/**
 * 章の確認テスト（知っている章を短くする）と、ペースの逆算（試験日までに何章まで届くか）。
 */
import { CHAPTERS } from '../content/goals';
import { productsOf, RECIPES } from '../content/recipes';
import { firstCard, dayKey } from './fsrs';
import { partsFor, recipeQuiz, type Quiz } from './quiz';
import type { World } from './world';

/** その章の指令の物質を作る反応 */
export function chapterRecipes(ch: number) {
  const want = new Set(CHAPTERS[ch]?.goals.flatMap((g) => [g.s, ...(g.also ?? [])]) ?? []);
  return RECIPES.filter((r) => productsOf(r).some(([s]) => want.has(s)) || (r.machine === 'battery' && want.has('e') && r.outputs.some(([s]) => want.has(s))));
}
/** 確認テストを受けられる章：最初の章（操作を覚える章）は除く。まだ 1 つも指令を終えていない章だけ。反応が 3 つ以上ある章だけ */
export const canTestOut = (w: World, ch: number) => ch > 0 && (w.progress[ch] || 0) === 0 && !w.tested.includes(ch) && chapterRecipes(ch).length >= 3;

/** 確認テストの 10 問：章の反応から、問うところを替えながら作る */
export function testOutQuiz(ch: number, rnd: () => number = Math.random): Quiz[] {
  const rs = chapterRecipes(ch), out: Quiz[] = [], seen = new Set<string>();
  for (let round = 0; out.length < 10 && round < 4; round++) {
    for (const r of rs) {
      if (out.length >= 10) break;
      const parts = partsFor(r);
      const p = parts[(round + r.id.length) % Math.max(1, parts.length)];
      if (!p) continue;
      const q = recipeQuiz(r, p, rnd);
      if (q && !seen.has(q.q)) { seen.add(q.q); out.push(q); }
    }
  }
  return out;
}
/** 9 割以上なら合格 */
export const testOutPass = (right: number, total: number) => total >= 6 && right / total >= 0.9;
/**
 * 合格した章を短くする：最後の指令だけを残す。章の反応は「覚えた」に入れ、すべて正解した反応は「思い出せた」、
 * 1 か所でもまちがえた反応は「忘れた」から復習を始める（今日のうちに戻ってくる）
 */
export function applyTestOut(w: World, ch: number, results: { id: string; ok: boolean }[], now = Date.now()) {
  const goals = CHAPTERS[ch].goals.length;
  w.progress[ch] = Math.max(w.progress[ch] || 0, goals - 1);
  w.counts[ch] = 0;
  if (!w.tested.includes(ch)) w.tested.push(ch);
  // 1 か所でもまちがえた反応は「忘れた」から始め、今日のうちに出し直す
  const badIds = new Set(results.filter((x) => !x.ok).map((x) => x.id));
  for (const r of chapterRecipes(ch)) {
    const id = `r:${r.id}`, bad = badIds.has(id);
    if (!w.learned.includes(r.id)) w.learned.push(r.id);
    if (!w.srs[id]) w.srs[id] = firstCard(bad ? 1 : 3, now);
    if (bad && !w.relearn.some((x) => x.id === id)) w.relearn.push({ id, at: now + 180000 });
  }
}

// ---------------- ペースの逆算 ----------------
export interface Pace {
  /** 直近 14 日の、遊んだ日 1 日あたりの分 */
  perDayMin: number;
  /** 1 指令あたりの分（終えた指令の中央値） */
  perGoalMin: number;
  /** 残りの指令の数 */
  left: number;
  /** 試験日ごとの、そのペースで終えられる最後の章の番号（0 から）と、残りの日数 */
  reach: { at: number; days: number; chapter: number; all: boolean }[];
  /** 試験日までに全章を終えるのに要る 1 日あたりの分（最初の試験に対して） */
  needPerDayMin: number;
}
/** 遊んだ日 1 日あたりの時間と、1 指令の時間から、試験日までにどこまで届くかを出す。記録が足りなければ null */
export function paceOf(w: World, now = Date.now()): Pace | null {
  const days = Object.entries(w.dayMs).filter(([, ms]) => ms > 60000);
  const recent = days.filter(([k]) => { const [y, m, d] = k.split('-').map(Number); return now - new Date(y, m - 1, d).getTime() < 14 * 86400000; });
  const goals = Object.values(w.goalMs).filter((ms) => ms > 0).sort((a, b) => a - b);
  if (!recent.length || goals.length < 2) return null;
  const perDayMin = recent.reduce((a, [, ms]) => a + ms, 0) / recent.length / 60000;
  const perGoalMin = goals[Math.floor(goals.length / 2)] / 60000;
  const remainingIn = (ch: number) => Math.max(0, CHAPTERS[ch].goals.length - (w.progress[ch] || 0));
  const left = CHAPTERS.reduce((a, _, i) => a + remainingIn(i), 0);
  // 章の順（いまの章から、まだ終えていない章を前から）に、指令を消化していくとみなす
  const order = [...CHAPTERS.keys()].map((i) => (w.chapter + i) % CHAPTERS.length).filter((i) => remainingIn(i) > 0);
  const reach = w.exams.filter((e) => e > now).map((at) => {
    const dd = Math.max(0, (at - now) / 86400000);
    let budget = (dd * perDayMin) / Math.max(0.5, perGoalMin), last = -1;
    for (const i of order) { const n = remainingIn(i); if (budget >= n) { budget -= n; last = i; } else break; }
    return { at, days: Math.round(dd), chapter: last, all: last === order[order.length - 1] && order.length > 0 };
  });
  const first = w.exams.filter((e) => e > now).sort((a, b) => a - b)[0];
  const needPerDayMin = first ? (left * perGoalMin) / Math.max(1, (first - now) / 86400000) : 0;
  return { perDayMin, perGoalMin, left, reach, needPerDayMin };
}
/** 遊んだ時間を、今日の分に足す（実時間）。60 日より前は捨てる */
export function addPlayTime(w: World, ms: number, now = Date.now()) {
  const k = dayKey(now);
  w.dayMs[k] = (w.dayMs[k] || 0) + ms;
  const keys = Object.keys(w.dayMs);
  if (keys.length > 60) for (const old of keys.sort((a, b) => { const p = (s: string) => s.split('-').map(Number).reduce((x, y) => x * 40 + y, 0); return p(a) - p(b); }).slice(0, keys.length - 60)) delete w.dayMs[old];
}
