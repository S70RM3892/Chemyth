/**
 * 復習の間隔を、問題ごとに決める（FSRS-5）。
 * 式と既定の重みは、FSRS の作者たちの説明（open-spaced-repetition / awesome-fsrs の wiki「The Algorithm」）に従う。
 *
 * - 安定度 S（日）：思い出せる確率が 90 % に下がるまでの日数。
 * - 難しさ D（1〜10）：覚えにくさ。間違えると上がり、正解すると下がる。
 * - 思い出せる確率 R(t, S) = (1 + FACTOR · t / S)^DECAY。t は前の復習からの日数。
 * - 評価 G：1 忘れた、2 思い出せたが自信がない、3 思い出せた、4 簡単だった。
 *
 * このゲームでは、答える前に自信を選ばせ、その組み合わせで G を決める（gradeOf）。
 * 「勘」で当たったものは、思い出せたとはみなさない（G = 1。間違いとしては記録しない）。
 */
export const W5 = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
export const DECAY = -0.5, FACTOR = 19 / 81;
/** 狙う「思い出せる確率」。上げるほど復習が増える。設定で 0.85・0.9・0.95 から選べる */
export const RETENTION = 0.9;
export const RETENTIONS = [0.85, 0.9, 0.95];
/** 安定度の下限（日）。0 に近づくと計算が不安定になるので、15 分ほどで止める（この値は FSRS の説明にはなく、ここで決めたもの） */
const S_MIN = 0.01;
const DAY = 86400000;

export type Grade = 1 | 2 | 3 | 4;
export type Confidence = 'sure' | 'maybe' | 'guess';
export interface Card {
  /** 次に出す時刻 */
  due: number;
  /** 安定度（日）と難しさ */
  s: number;
  d: number;
  /** 前に答えた時刻 */
  last: number;
  /** 答えた回数と、忘れた回数 */
  n: number;
  l: number;
  /** 間隔の目安の段（0〜5）。古い版のセーブや、メッキ・進み具合の表示に使う */
  iv: number;
  /** 前回、自信を持って間違えた */
  hc?: boolean;
  /** 前回まちがえた（次は式を全部組ませる） */
  full?: boolean;
  /** はじめて覚えた時刻 */
  t0?: number;
  /** 思い出せた、いちばん長い間隔（日）。忘れると 0 に戻る。習熟メッキはこれで決まる（3 日空けて思い出せたら銅…） */
  b?: number;
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));
export const initS = (g: Grade) => W5[g - 1];
export const initD = (g: Grade) => clampD(W5[4] - Math.exp(W5[5] * (g - 1)) + 1);
/** 思い出せる確率 */
export const retrievability = (tDays: number, s: number) => Math.pow(1 + (FACTOR * Math.max(0, tDays)) / Math.max(S_MIN, s), DECAY);
/** 次の間隔（日）。狙う確率 r に下がるまでの日数 */
export const intervalDays = (s: number, r = RETENTION) => (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);

export function nextD(d: number, g: Grade): number {
  const dd = -W5[6] * (g - 3);
  const d1 = d + (dd * (10 - d)) / 9;
  return clampD(W5[7] * initD(4) + (1 - W5[7]) * d1);
}
/** 思い出せたときの安定度 */
export function recallS(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? W5[15] : 1, easy = g === 4 ? W5[16] : 1;
  return s * (Math.exp(W5[8]) * (11 - d) * Math.pow(s, -W5[9]) * (Math.exp(W5[10] * (1 - r)) - 1) * hard * easy + 1);
}
/** 忘れたときの安定度（忘れる前より大きくはならない） */
export function forgetS(d: number, s: number, r: number): number {
  return Math.min(s, W5[11] * Math.pow(d, -W5[12]) * (Math.pow(s + 1, W5[13]) - 1) * Math.exp(W5[14] * (1 - r)));
}
/** 同じ日のうちにもう一度答えたときの安定度 */
export const shortS = (s: number, g: Grade) => s * Math.exp(W5[17] * (g - 3 + W5[18]));

/** 1 日の区切りは朝 4 時（夜ふかしして 0 時を回っても、同じ日として扱う） */
export const dayKey = (t: number) => { const d = new Date(t - 4 * 3600000); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** dayKey の日付を、並べ替えられる数にする */
export const dayNum = (k: string) => { const [y, m, d] = k.split('-').map(Number); return (y * 13 + m) * 32 + d; };

/** 安定度から、間隔の目安の段（0〜5）を決める：1 日未満・1・3・7・16・35 日以上 */
export const stage = (s: number) => (s >= 35 ? 5 : s >= 16 ? 4 : s >= 7 ? 3 : s >= 3 ? 2 : s >= 1 ? 1 : 0);

/** 自信と正誤から評価を決める */
export function gradeOf(ok: boolean, conf: Confidence | undefined): Grade {
  if (!ok) return 1;
  if (conf === 'guess') return 1;
  if (conf === 'maybe') return 2;
  return 3;
}

/**
 * 試験日をまたぐ間隔を作らない。次の試験の 2 日前を越えるなら、その手前の 10 日間に散らして出す
 * （全部が同じ日に集まらないように、問題ごとに決まった日にずらす）。
 */
export function capByExams(due: number, now: number, exams: number[], id: string): number {
  const next = exams.filter((e) => e > now).sort((a, b) => a - b)[0];
  if (!next) return due;
  const cut = next - 2 * DAY;
  if (now >= cut || due <= cut) return due;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Math.max(now + 3600000, cut - (h % 10) * DAY);
}

/** はじめて覚えたとき。10 分後に一度確かめ、その後は FSRS の間隔で出す */
export function firstCard(g: Grade, now: number): Card {
  const s = initS(g);
  return { due: now + 10 * 60000, s, d: initD(g), last: now, n: 1, l: g === 1 ? 1 : 0, iv: stage(s), full: g === 1 || undefined, t0: now };
}

/** 答えた結果で、次の予定を決める */
export function review(c: Card | undefined, g: Grade, now: number, exams: number[] = [], id = '', ret = RETENTION): Card {
  if (!c) { const f = firstCard(g, now); f.due = capByExams(now + intervalDays(f.s, ret) * DAY, now, exams, id); return f; }
  const t = Math.max(0, (now - c.last) / DAY), sameDay = dayKey(now) === dayKey(c.last);
  const r = retrievability(t, c.s);
  let s: number;
  if (sameDay) s = shortS(c.s, g);
  else s = g === 1 ? forgetS(c.d, c.s, r) : recallS(c.d, c.s, r, g);
  s = Math.max(S_MIN, s);
  const d = nextD(c.d, g);
  // 忘れたものは、同じ日のうちに、もう一度出す（ここでは 10 分後。工場の画面では、正解するまで戻ってくる）
  const due = g === 1 ? now + 10 * 60000 : capByExams(now + Math.max(intervalDays(s, ret), sameDay ? 0.5 : 1) * DAY, now, exams, id);
  const b = g === 1 ? 0 : Math.max(c.b ?? 0, t);
  return { due, s, d, last: now, n: c.n + 1, l: c.l + (g === 1 ? 1 : 0), iv: stage(s), hc: undefined, full: g === 1 || undefined, t0: c.t0, b };
}

/** 古い版のセーブ（{ iv, due } だけ）を読み替える。段に対応する日数を、そのまま安定度にする */
export function migrate(old: { iv?: number; due?: number } & Partial<Card>): Card {
  if (typeof old.s === 'number' && typeof old.d === 'number') {
    return { due: old.due ?? Date.now(), s: old.s, d: old.d, last: old.last ?? Date.now(), n: old.n ?? 1, l: old.l ?? 0, iv: stage(old.s), hc: old.hc, full: old.full, t0: old.t0, b: old.b };
  }
  const iv = Math.max(0, Math.min(5, old.iv ?? 0));
  const s = [0.01, 1, 3, 7, 16, 35][iv], due = old.due ?? Date.now();
  // 古い版のメッキ（段 2 で銅、3 で銀、4 以上で金）が変わらないように、思い出せた間隔を決める
  return { due, s, d: 5, last: due - Math.max(intervalDays(s), 10 / 1440) * DAY, n: iv + 1, l: 0, iv, b: [0, 0, 3, 7, 16, 35][iv] };
}
