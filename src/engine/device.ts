/**
 * 端末の設定と、セーブの控えにかかわる計算（画面も保存先も持たない。単体テストで確かめる）。
 * - 古い好み（振動のあり・なし、文字を大きくのオン・オフ）を、段階のある新しい好みに読み替える
 * - 前日の控え：その日（朝 4 時区切り）はじめてノートを書くとき、書く前の中身を控えに回す
 * - 寝る前の音量：就寝の 1 時間前から、効果音と音楽を少しずつ小さくする
 * - 日付の切り替わり（朝 4 時）で、その日かぎりの記録を片づける
 * - 保存領域の使い方の集計と、アルバムの写真を減らす順
 * - 設定のファイルの読み取り
 */
import { dayKey } from './fsrs';
import { isClosed, minutesToBed, type SleepCfg } from './sleep';
import { relearnReady, type World } from './world';

export type Level3 = 0 | 1 | 2;
const lvl = (v: unknown): Level3 | null => (v === 0 || v === 1 || v === 2 ? v : null);

/** 文字の大きさ（0 標準・1 大・2 特大）。新しい textSize がなければ、古い「文字を大きく」（bigText）を読み替える：オン＝大 */
export const textSizeOf = (m: Record<string, unknown>): Level3 => lvl(m.textSize) ?? (m.bigText === true ? 1 : 0);
/** 振動の強さ（0 なし・1 弱・2 強）。新しい haptics がなければ、古い「振動」（vib）を読み替える：なし＝0、あり（または未設定）＝弱 */
export const hapticsOf = (m: Record<string, unknown>): Level3 => lvl(m.haptics) ?? (m.vib === false ? 0 : 1);

/** 震わせ方を強さに合わせる。弱はそのまま。強は震える長さを 2 倍（1 回 200 ms まで。あいだの休みはそのまま）。なしは null */
export function hapticPattern(ms: number | number[], level: Level3): number | number[] | null {
  if (!level) return null;
  if (level === 1) return ms;
  const k = (v: number) => Math.min(200, Math.round(v * 2));
  return Array.isArray(ms) ? ms.map((v, i) => (i % 2 ? v : k(v))) : k(ms);
}

// ---- 前日の控え ----

/** 控えに残す要約（タイトルに出す） */
export interface DailySum { done: number; points: number; playMs: number; savedAt: number }
/** 控え。day：控えた日（朝 4 時区切り）、data：控えた中身（縮めた文字列）、undo：「前日に戻す」をしたあとで、戻す前の中身が入っている */
export interface Daily { day: string; at: number; sum: DailySum; data: string; undo?: boolean }

/**
 * ノートを書く前に、控えをどうするか。
 * skip：今日はもう決めた（控えた・控えるものがなかった）。mark：枠が空なので控えるものはない（今日はもう見ない。前の控えは残す）。
 * take：今日はじめて書く。書く前の中身（＝前の日までの状態）を控えに回す
 */
export function dailyPlan(prevDay: string | null | undefined, current: string | null, now: number): 'skip' | 'mark' | 'take' {
  if (prevDay === dayKey(now)) return 'skip';
  return current ? 'take' : 'mark';
}

/** 保存されていた控えを読む。形が違えば null */
export function parseDaily(raw: string | null): Daily | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d.day !== 'string' || typeof d.data !== 'string' || typeof d.at !== 'number' || !d.sum || typeof d.sum.savedAt !== 'number') return null;
    return { day: d.day, at: d.at, data: d.data, undo: d.undo === true || undefined, sum: { done: d.sum.done | 0, points: d.sum.points | 0, playMs: Number(d.sum.playMs) || 0, savedAt: d.sum.savedAt } };
  } catch { return null; }
}

/** 控えを出す（タイトルの「前日に戻す」）か：控えがあり、いまのノートと中身が違うとき（保存した時刻で見分ける） */
export const dailyOffer = (d: Daily | null, current: DailySum | null): boolean => !!d && (!current || d.sum.savedAt !== current.savedAt);

// ---- 寝る前の音量 ----

/** 就寝の時刻に下げきる音量の割合 */
export const WIND_MIN = 0.35;
/** 寝る前に音を小さくする度合い（1 そのまま 〜 WIND_MIN）。就寝の 1 時間前から少しずつ下げ、閉店の時間帯は WIND_MIN のまま。閉店なしの設定では下げない */
export function windVolume(cfg: SleepCfg, now: Date): number {
  if (!cfg.on) return 1;
  if (isClosed(cfg, now)) return WIND_MIN;
  const m = minutesToBed(cfg, now) - now.getSeconds() / 60;
  if (m >= 60) return 1;
  return WIND_MIN + (1 - WIND_MIN) * Math.max(0, m) / 60;
}

// ---- 日付の切り替わり ----

/** 日付（朝 4 時区切り）が prev から変わっていれば、新しい日の印。変わっていなければ null */
export const nextDay = (prev: string, now: number): string | null => { const k = dayKey(now); return k !== prev ? k : null; };
/** 日をまたいだら、その日かぎりの記録を片づける（今日まちがえた問いの一覧、日をまたいだ出し直し）。何か変えたら true */
export function rollDay(w: World, now: number): boolean {
  const k = dayKey(now);
  let changed = false;
  if (w.today.day && w.today.day !== k) { w.today = { day: k, wrong: [] }; changed = true; }
  const n = w.relearn.length;
  relearnReady(w, now);
  return changed || w.relearn.length !== n;
}

// ---- 保存領域 ----

/** このブラウザの保存領域（localStorage）の、ひとつの項目。size はおよそのバイト数（文字数 × 2） */
export interface StoreItem { key: string; size: number; photos?: number }
export interface StoreUse {
  slots: { n: number; save: number; album: number; photos: number; daily: number }[];
  blueprints: number; backup: number; other: number; total: number;
}
/** 項目を、ノートごと（セーブ・アルバム・前日の控え）と、設計図・読み込む前の控え・そのほか（設定・アカウント）に分けて足す */
export function storeUse(items: StoreItem[], slots = 3): StoreUse {
  const out: StoreUse = { slots: Array.from({ length: slots }, (_, i) => ({ n: i + 1, save: 0, album: 0, photos: 0, daily: 0 })), blueprints: 0, backup: 0, other: 0, total: 0 };
  for (const it of items) {
    out.total += it.size;
    const m = /^chemyth-v2-(slot|album|daily)-(\d+)$/.exec(it.key), s = m ? out.slots[Number(m[2]) - 1] : undefined;
    if (m && s) {
      if (m[1] === 'slot') s.save += it.size;
      else if (m[1] === 'album') { s.album += it.size; s.photos += it.photos ?? 0; }
      else s.daily += it.size;
    } else if (it.key === 'chemyth-v2-blueprints') out.blueprints += it.size;
    else if (it.key === 'chemyth-v2-backup') out.backup += it.size;
    else out.other += it.size;
  }
  return out;
}
/** バイト数を短く（KB・MB） */
export const fmtBytes = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(b ? 1 : 0, Math.round(b / 1024))} KB`);

/** アルバムから、古い写真を n 枚落とす。最初の 1 枚（k = 'first'）と、いちばん新しい 1 枚は残す */
export function dropOldest<T extends { k: string }>(list: T[], n = 1): T[] {
  const keep = new Set<T>(list.filter((p, i) => p.k === 'first' || i === list.length - 1));
  const out: T[] = [];
  let left = n;
  for (const p of list) { if (left > 0 && !keep.has(p)) { left--; continue; } out.push(p); }
  return out;
}

// ---- 設定のファイル ----

/** 設定のファイルに入れるもの：好み・音・音楽・明暗・スキン・睡眠。画質と立体表示は端末の力で決まるので入れない */
export interface PrefsFile { prefs: Record<string, unknown>; sound?: boolean; music?: boolean; theme?: 'auto' | 'light' | 'dark'; skin?: string; sleep?: { on: boolean; bed: number; wake: number } }
/** 設定のファイルを読む。Chemyth の設定のファイルでなければ null */
export function parsePrefsFile(text: string): PrefsFile | null {
  let d: Record<string, unknown>;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || d.app !== 'chemyth-prefs' || !d.prefs || typeof d.prefs !== 'object' || Array.isArray(d.prefs)) return null;
  const out: PrefsFile = { prefs: { ...(d.prefs as Record<string, unknown>) } };
  if (typeof d.sound === 'boolean') out.sound = d.sound;
  if (typeof d.music === 'boolean') out.music = d.music;
  if (d.theme === 'auto' || d.theme === 'light' || d.theme === 'dark') out.theme = d.theme;
  if (typeof d.skin === 'string' && /^[a-z]{1,16}$/.test(d.skin)) out.skin = d.skin;
  const s = d.sleep as { on?: unknown; bed?: unknown; wake?: unknown } | undefined;
  const okMin = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1440;
  if (s && typeof s.on === 'boolean' && okMin(s.bed) && okMin(s.wake)) out.sleep = { on: s.on, bed: s.bed, wake: s.wake };
  return out;
}
