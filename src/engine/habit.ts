/**
 * 復習の習慣：今日の数・続いた日数・直近の日ごとの数・苦手（何度も忘れたもの）・毎日の目標。
 */
import { dayKey, retrievability, type Card } from './fsrs';
import type { World } from './world';

const DAY = 86400000;
/** 毎日の復習の目標（問）と、達したときの研究点 */
export const DAILY_GOAL = 10, DAILY_BONUS = 20;
/** 苦手とみなす、忘れた回数 */
export const LEECH = 3;

/** 今日答えた数と、思い出せた数 */
export const todayCount = (w: World, now = Date.now()): [number, number] => w.revDays[dayKey(now)] ?? [0, 0];
/** 続けて復習した日数。今日まだなら、昨日までの続きを数える（今日やれば途切れない） */
export function streakOf(w: World, now = Date.now()): number {
  let n = 0, t = now;
  if (!(w.revDays[dayKey(t)]?.[0] > 0)) t -= DAY;
  while (w.revDays[dayKey(t)]?.[0] > 0) { n++; t -= DAY; }
  return n;
}
/** 直近 n 日の、日ごとの数（古い順） */
export function lastDays(w: World, n = 7, now = Date.now()): { day: string; n: number; ok: number }[] {
  return Array.from({ length: n }, (_, i) => { const k = dayKey(now - (n - 1 - i) * DAY); const v = w.revDays[k] ?? [0, 0]; return { day: k, n: v[0], ok: v[1] }; });
}
/** 苦手：忘れた回数が多い順 */
export const leeches = (w: World): string[] => Object.keys(w.srs).filter((id) => w.srs[id].l >= LEECH).sort((a, b) => w.srs[b].l - w.srs[a].l);
/** いま思い出せる確率（0〜1） */
export const recallNow = (c: Card, now = Date.now()) => retrievability((now - c.last) / DAY, c.s);
/** 今日の目標に達していて、まだごほうびをもらっていなければ、研究点を足して true */
export function dailyBonus(w: World, now = Date.now()): boolean {
  const k = dayKey(now);
  if (w.bonusDay === k || todayCount(w, now)[0] < DAILY_GOAL) return false;
  w.bonusDay = k;
  w.points += DAILY_BONUS;
  return true;
}
/** 次の試験までの日数（なければ null） */
export function daysToExam(w: World, now = Date.now()): number | null {
  const next = w.exams.filter((e) => e > now).sort((a, b) => a - b)[0];
  return next ? Math.ceil((next - now) / DAY) : null;
}
