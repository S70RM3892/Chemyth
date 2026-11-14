/**
 * 学習の記録のうち、復習の予定（FSRS）とは別に残すもの。セーブに入る（World.study）。
 * - 問いごとの、答えるまでにかかった時間
 * - まちがえた理由（うっかり・知らなかった・取り違え）
 * - 今夜の 10 問・今朝の 10 問の結果（日ごと）
 * - 1 日の学習時間の目標、練習の順番、計算問題を解き直した時刻
 * - 途中で閉じた今夜・今朝の 10 問の続き
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
/**
 * 途中で閉じた今夜・今朝の 10 問。次に開いたら、続き（i 問目）から出す（答えた問いを、同じ回でもう一度数えない）。
 * day は、今夜の 10 問ならその夜の日付、今朝の 10 問なら前の夜の日付。got は、それまでの正解の数
 */
export interface SetRun { kind: 'night' | 'morning'; day: string; ids: string[]; i: number; got: number }
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
  /** 図鑑で星を付けた反応（反応の id。覚えたいもの・苦手なものの目印）。新しい STAR_MAX 件 */
  stars?: string[];
  /** 途中で閉じた今夜・今朝の 10 問（種類ごとに 1 つ。なければ無い） */
  runs?: Partial<Record<SetRun['kind'], SetRun>>;
}
export const GOAL_MINS = [0, 15, 30, 45, 60, 90];
export const WHY_KEEP = 300, NIGHT_KEEP = 30, STAR_MAX = 200;
/** 反応 id に星が付いているか */
export const starred = (s: Study, id: string) => !!s.stars?.includes(id);
/** 星を付ける・外す。付けたあとの状態を返す */
export function toggleStar(s: Study, id: string): boolean {
  const l = (s.stars ??= []), i = l.indexOf(id);
  if (i >= 0) { l.splice(i, 1); return false; }
  l.push(id);
  if (l.length > STAR_MAX) l.splice(0, l.length - STAR_MAX);
  return true;
}

export const newStudy = (): Study => ({ ms: {}, why: [], nights: [], goalMin: 0, order: 'mix', redo: {} });
/** 続きから出せる回（同じ種類・同じ日のもの）。なければ null */
export const runOf = (s: Study, kind: SetRun['kind'], day: string): SetRun | null => { const r = s.runs?.[kind]; return r && r.day === day ? r : null; };
/** 途中まで答えた回を残す（種類ごとに 1 つ。ほかの種類の続きは消さない） */
export const keepRun = (s: Study, r: SetRun) => { s.runs = { ...s.runs, [r.kind]: r }; };
/** 終わった回の続きを消す（ほかの種類の続きは残す） */
export const endRun = (s: Study, kind: SetRun['kind']) => { if (s.runs) delete s.runs[kind]; };

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
  if (Array.isArray(o.stars)) { const l = [...new Set(o.stars.filter((x: unknown): x is string => typeof x === 'string' && x.length <= 80))].slice(-STAR_MAX); if (l.length) s.stars = l; }
  if (o.redo && typeof o.redo === 'object') for (const [k, v] of Object.entries(o.redo as Record<string, unknown>)) if (num(v)) s.redo[k] = v;
  if (o.runs && typeof o.runs === 'object') {
    for (const kind of ['night', 'morning'] as const) {
      const r = (o.runs as Record<string, { kind?: unknown; day?: unknown; ids?: unknown; i?: unknown; got?: unknown } | null | undefined>)[kind];
      if (!r || typeof r !== 'object' || r.kind !== kind || typeof r.day !== 'string' || !Array.isArray(r.ids) || !r.ids.every((x) => typeof x === 'string') || !num(r.i) || !num(r.got)) continue;
      const i = Math.max(0, Math.min(r.ids.length, r.i | 0));
      (s.runs ??= {})[kind] = { kind, day: r.day, ids: [...(r.ids as string[])], i, got: Math.max(0, Math.min(i, r.got | 0)) };
    }
  }
  return s;
}
