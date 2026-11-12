/**
 * 睡眠をはさんだ復習と、夜の閉店。
 * - 今夜の 10 問：その日に覚えたもの・まちがえたものを、就寝の 4 時間前から 1 時間前までに出す。
 * - 今朝の 10 問：翌朝、同じ問いを出して、寝ている間に残ったかを確かめる（学習と再学習の間に睡眠をはさむ）。
 * - 閉店：就寝時刻から起床時刻までは、工場を動かさない。
 * - 夕暮れ：実際の時刻に合わせて、地図が暮れていく（夕方 16:30 から 18:30 に暗くなり、朝 5:00 から 6:30 に明ける）。
 */
import { dayKey } from './fsrs';
import { learnedToday } from './quiz';
import type { World } from './world';

export interface SleepCfg { on: boolean; /** 0 時からの分 */ bed: number; wake: number }
export const SLEEP_DEFAULT: SleepCfg = { on: true, bed: 23 * 60, wake: 6 * 60 + 30 };
export const minuteOf = (t: Date) => t.getHours() * 60 + t.getMinutes();
export const hhmm = (m: number) => `${Math.floor((((m % 1440) + 1440) % 1440) / 60)}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;

/** 就寝から起床までのあいだか */
export function isClosed(cfg: SleepCfg, now: Date): boolean {
  if (!cfg.on) return false;
  const m = minuteOf(now);
  return cfg.bed > cfg.wake ? m >= cfg.bed || m < cfg.wake : m >= cfg.bed && m < cfg.wake;
}
/** 就寝まであと何分か（0〜1439） */
export const minutesToBed = (cfg: SleepCfg, now: Date) => (cfg.bed - minuteOf(now) + 1440) % 1440;
/** 今夜の 10 問を出す時間帯：就寝の 4 時間前から 1 時間前まで */
export const eveningWindow = (cfg: SleepCfg, now: Date) => cfg.on && !isClosed(cfg, now) && minutesToBed(cfg, now) <= 240 && minutesToBed(cfg, now) >= 60;
/** 寝る支度の時間帯：就寝の 1 時間前から就寝まで */
export const windDown = (cfg: SleepCfg, now: Date) => cfg.on && !isClosed(cfg, now) && minutesToBed(cfg, now) < 60;

/** 夕暮れの度合い（0 昼〜1 夜） */
export function duskOf(now: Date): number {
  const m = minuteOf(now) + now.getSeconds() / 60;
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (m - a) / (b - a)));
  if (m >= 16.5 * 60) return ramp(16.5 * 60, 18.5 * 60);
  if (m < 5 * 60) return 1;
  return 1 - ramp(5 * 60, 6.5 * 60);
}

/** 今夜の 10 問：今日まちがえたもの（自信を持ってまちがえたものから）→ 今日覚えたもの */
export function nightSetIds(w: World, now: number): string[] {
  const today = dayKey(now);
  const hc = w.hcLog.filter((x) => dayKey(x.t) === today).map((x) => x.id);
  const wrong = w.today.day === today ? w.today.wrong : [];
  const fresh = learnedToday(w, now);
  return [...new Set([...hc, ...wrong, ...fresh])].filter((id) => w.srs[id]).slice(0, 10);
}
/** 今夜の 10 問を、今夜もう済ませたか */
export const nightDone = (w: World, now: number) => !!w.night && w.night.day === dayKey(now);
/** 今朝の 10 問を出すか：前の夜（48 時間以内）に今夜の 10 問を済ませていて、まだ朝の確認をしていない */
export function morningDue(w: World, cfg: SleepCfg, now: Date): boolean {
  const n = w.night;
  if (!n || n.morning !== undefined || !n.ids.length || n.day === dayKey(now.getTime()) || isClosed(cfg, now)) return false;
  const [y, mo, d] = n.day.split('-').map(Number);
  return now.getTime() - new Date(y, mo - 1, d).getTime() < 2 * 86400000;
}
