/**
 * 学習の記録のうち、復習の予定（FSRS）とは別に残すもの。セーブに入る（World.study）。
 * - 問いごとの、答えるまでにかかった時間
 * - まちがえた理由（うっかり・知らなかった・取り違え）
 * - 今夜の 10 問・今朝の 10 問の結果（日ごと）
 * - 1 日の学習時間の目標、練習の順番、計算問題を解き直した時刻
 * 古いセーブには無いので、読むときは中身を確かめ、壊れた値は既定に戻す。
 */
export type Why = 'slip' | 'unknown' | 'mixup';
export const WHY_NAME: Record<Why, string> = { slip: 'うっかり', unknown: '知らなかった', mixup: '取り違え' };
/** 理由ごとの次の一手 */
export const WHY_TIP: Record<Why, string> = {
  slip: 'うっかり：知っていたのに落とした。問いを最後まで読み、条件（濃い・薄い、加熱するか、何を問われているか）を確かめてから選べ。',
  unknown: '知らなかった：覚えていない。解説を読み、答え（反応なら反応式）を紙に 1 回書け。今日のうちに、もう一度出る。',
  mixup: '取り違え：似たものと混ざっている。2 つを並べて、違いを 1 行で書け。取り違えやすい組があれば、続けて解いて見比べろ。',
};
/** 今夜の 10 問（day は夜の日付）と、翌朝の結果 */
export interface NightRec { day: string; n: number; got: number; morning?: number }
export interface Study {
  /** 問いごとの、答えるまでにかかった時間の合計（ミリ秒）と回数 */
  ms: Record<string, [number, number]>;
  /** まちがえた理由（新しい WHY_KEEP 件） */
  why: { id: string; why: Why; t: number }[];
  /** 今夜・今朝の 10 問の記録（新しい NIGHT_KEEP 件） */
  nights: NightRec[];
  /** 1 日の学習時間の目標（分）。0 なら目標なし */
  goalMin: number;
  /** 練習の順番：mix 混ぜる、weak 苦手から */
  order: 'mix' | 'weak';
  /** 計算問題を解き直して正解した時刻（問題の id ごと） */
  redo: Record<string, number>;
}
export const GOAL_MINS = [0, 15, 30, 45, 60, 90];
export const WHY_KEEP = 300, NIGHT_KEEP = 30;

export const newStudy = (): Study => ({ ms: {}, why: [], nights: [], goalMin: 0, order: 'mix', redo: {} });

const num = (x: unknown): x is number => typeof x === 'number' && isFinite(x);
const isWhy = (x: unknown): x is Why => x === 'slip' || x === 'unknown' || x === 'mixup';

/** セーブから読む。無い・壊れているところは既定に戻す */
export function readStudy(d: unknown): Study {
  const s = newStudy();
  if (!d || typeof d !== 'object') return s;
  const o = d as Record<string, unknown>;
  if (o.ms && typeof o.ms === 'object') {
    for (const [k, v] of Object.entries(o.ms as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] >= 0 && v[1] >= 1) s.ms[k] = [Math.round(v[0]), Math.floor(v[1])];
    }
  }
  if (Array.isArray(o.why)) {
    s.why = o.why.filter((x: { id?: unknown; why?: unknown; t?: unknown }) => typeof x?.id === 'string' && isWhy(x.why) && num(x.t))
      .map((x: { id: string; why: Why; t: number }) => ({ id: x.id, why: x.why, t: x.t })).slice(-WHY_KEEP);
  }
  if (Array.isArray(o.nights)) {
    s.nights = o.nights.filter((x: { day?: unknown; n?: unknown; got?: unknown }) => typeof x?.day === 'string' && num(x.n) && num(x.got))
      .map((x: { day: string; n: number; got: number; morning?: unknown }) => ({ day: x.day, n: Math.max(0, x.n | 0), got: Math.max(0, x.got | 0), morning: num(x.morning) ? Math.max(0, x.morning | 0) : undefined }))
      .slice(-NIGHT_KEEP);
  }
  s.goalMin = GOAL_MINS.includes(o.goalMin as number) ? (o.goalMin as number) : 0;
  s.order = o.order === 'weak' ? 'weak' : 'mix';
  if (o.redo && typeof o.redo === 'object') for (const [k, v] of Object.entries(o.redo as Record<string, unknown>)) if (num(v)) s.redo[k] = v;
  return s;
}
