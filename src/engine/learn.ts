/**
 * 学習の補助（画面に出すものの中身。画面は src/ui/learn2.ts と src/ui/review.ts）。
 * 答える前のヒント、答えの取り消し、答えるまでの時間、自信の見積もりの助言、週の報告、試験までの復習の見込み、
 * まちがえた単元、まちがえた理由、今夜と今朝の 10 問の記録、学習時間の目標、練習の順番、計算問題の解き直し、
 * 反応を使う指令、章ごとの習熟、反応式の穴埋め、解説の中の物質名。
 * 化学の中身は、反応・物質・知識問題・計算問題のデータから組み立てるだけで、新しい事実は書かない。
 */
import { KNOWLEDGE } from '../content/knowledge';
import { CHAPTERS } from '../content/goals';
import { MACHINES } from '../content/machines';
import { QUESTIONS } from '../content/questions';
import { CONDITIONS, productsOf, recipeById, RECIPES, type Recipe } from '../content/recipes';
import { equationOf } from '../content/looks';
import { hasSub, label, sub } from '../content/substances';
import { dayKey, dayNum, review, type Card } from './fsrs';
import { leeches, recallNow } from './habit';
import { chapterRecipes } from './pace';
import { CONFUSABLE, condsInProducts, nameTells, partsFor, topicOf, type Quiz } from './quiz';
import { platingOf, type Mistake, type World } from './world';
import { NIGHT_KEEP, WHY_KEEP, type NightRec, type Why } from './study';

const DAY = 86400000;
const shuffle = <T>(a: T[], rnd: () => number) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
/** 復習の問いとして実在するか */
export const known = (id: string) => (id.startsWith('k:') ? KNOWLEDGE.some((k) => `k:${k.id}` === id) : id.startsWith('r:') && !!recipeById(id.slice(2)));

// ---------------- 答える前のヒント ----------------

export interface Hint { text: string; drop: string[] }
const STATE = { gas: '気体', liquid: '液体', solid: '固体' } as const;
/** 生成物の数と状態（名前は出さない） */
function productShape(r: Recipe): string {
  const words = productsOf(r).map(([s]) => (sub(s).formula ? STATE[sub(s).state] : '高分子・混合物など'));
  const count = new Map<string, number>();
  for (const x of words) count.set(x, (count.get(x) || 0) + 1);
  const kinds = [...count];
  return `できるものは ${words.length} つ（${kinds.length > 1 ? kinds.map(([k, n]) => `${k} ${n}`).join('・') : words.length > 1 ? `どれも${kinds[0][0]}` : kinds[0][0]}）`;
}
/**
 * 答える前のヒント。問いに出ていない手がかりを 1 つ出し、答えそのものは出さない。使うと、覚え具合は「たぶん」までになる。
 * - 生成物を問う：装置と条件は問いに出ているので、反応の名前（名前に生成物の名前・式や、問いで伏せた条件が入っているときは、生成物の数と状態）
 * - 係数を問う：装置と条件。まちがいの式を 1 つ消す
 * - 条件・極を問う：反応式（条件と極は入っていない。問いがもう反応式で出ているか、式に条件が入っているときは、選択肢を 2 つに絞る）
 * - 知識：単元は問いの上に出ているので、選択肢を 2 つに絞る
 */
export function hintFor(q: Quiz): Hint | null {
  if (q.part === 'full') return null;
  if (q.part === 'k') return q.choices.length > 2 ? { text: '選択肢を 2 つに絞った。', drop: q.choices.slice(2) } : null;
  const r = recipeById(q.id.slice(2));
  if (!r) return null;
  if (q.part === 'products') {
    const tells = nameTells(r, productsOf(r).map(([s]) => s)) || condsInProducts(r).some((c) => r.name.includes(c));
    return { text: tells ? productShape(r) : `反応の名前：${r.name}`, drop: [] };
  }
  if (q.part === 'coef') return { text: `${MACHINES[r.machine].name}・${CONDITIONS[r.machine].label}：${r.accept.join(' または ')}。両辺の原子の数を、元素ごとに数えて比べろ。`, drop: q.choices.slice(3) };
  const eq = equationOf(r);
  // 条件の名前が反応式に入っているとき（加硫 → 加硫ゴム など）は、式を見せずに選択肢を 2 つに絞る。問いがもう反応式で出ているときも
  if ((q.part === 'cond' && r.accept.some((c) => eq.includes(c))) || q.q.includes(eq)) return { text: '選択肢を 2 つに絞った。', drop: q.choices.slice(2) };
  return { text: `反応式：${eq}`, drop: [] };
}

// ---------------- 答えの取り消し（押しまちがい） ----------------

/** 答えてから取り消せる時間（ミリ秒） */
export const UNDO_MS = 5000;
export interface AnswerSnap {
  id: string; at: number; card?: Card; calib: World['calib']; revDays: World['revDays']; relearn: World['relearn'];
  hcLog: World['hcLog']; today: World['today']; bonusDay: string; ms?: [number, number];
  /** この答えで増えた研究点（答えたあとに入れる） */
  gain: number;
}
const copy = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
/** 答える直前の状態を控える */
export function snapAnswer(w: World, id: string, now = Date.now()): AnswerSnap {
  return { id, at: now, card: copy(w.srs[id]), calib: copy(w.calib), revDays: copy(w.revDays), relearn: copy(w.relearn), hcLog: copy(w.hcLog), today: copy(w.today), bonusDay: w.bonusDay, ms: copy(w.study.ms[id]), gain: 0 };
}
/** 答えを取り消して、答える前に戻す（予定・自信ごとの正答率・日ごとの数・出し直し・間違いの記録・研究点・答えた時間・理由）。時間を過ぎていたら false */
export function undoAnswer(w: World, s: AnswerSnap, now = Date.now()): boolean {
  if (now - s.at > UNDO_MS || now < s.at) return false;
  // あとでほかの問いに答えていたら（工場の札で答えてすぐ、復習の窓で答えたなど）、取り消さない。控えに戻すと、その答えの記録まで消える
  const k = dayKey(s.at);
  if ((w.revDays[k]?.[0] ?? 0) !== (s.revDays[k]?.[0] ?? 0) + 1) return false;
  if (s.card) w.srs[s.id] = s.card; else delete w.srs[s.id];
  w.calib = s.calib; w.revDays = s.revDays; w.relearn = s.relearn; w.hcLog = s.hcLog; w.today = s.today;
  // この答えで足した記録だけを除く（間違いの記録は時刻の順に並んでいる）
  const rid = s.id.slice(2);
  for (let i = w.mistakes.length - 1; i >= 0 && w.mistakes[i].t >= s.at; i--) if (w.mistakes[i].recipe === rid) w.mistakes.splice(i, 1);
  w.study.why = w.study.why.filter((x) => !(x.id === s.id && x.t >= s.at));
  w.points -= s.gain;
  w.bonusDay = s.bonusDay;
  if (s.ms) w.study.ms[s.id] = s.ms; else delete w.study.ms[s.id];
  return true;
}

// ---------------- 答えるまでの時間 ----------------

/** 1 回の答えに数える時間の上限。よそ見していた時間まで数えないため */
export const TIME_CAP = 60000;
export function recordTime(w: World, id: string, ms: number) {
  const e = (w.study.ms[id] ??= [0, 0]);
  e[0] += Math.round(Math.max(0, Math.min(TIME_CAP, ms)));
  e[1]++;
}
/** 全体の平均と、平均がいちばん長い問い */
export function timeStats(w: World, top = 5): { n: number; avg: number; slow: { id: string; avg: number; n: number }[] } {
  const rows = Object.entries(w.study.ms).filter(([id, v]) => v[1] > 0 && known(id));
  const n = rows.reduce((a, [, v]) => a + v[1], 0), sum = rows.reduce((a, [, v]) => a + v[0], 0);
  const slow = rows.map(([id, [ms, k]]) => ({ id, avg: ms / k, n: k })).sort((a, b) => b.avg - a.avg).slice(0, top);
  return { n, avg: n ? sum / n : 0, slow };
}

// ---------------- 自信の見積もりの助言 ----------------

export type CalibKind = 'few' | 'over' | 'under' | 'both' | 'good';
/** 「確実」と「勘」の正答率から、自信の見積もりが合っているかを言う。「確実」が 9 割を切れば自信過剰、「勘」が 5 割を超えれば自信不足 */
export function calibAdvice(w: World): { kind: CalibKind; text: string } {
  const [sn, so] = w.calib.sure ?? [0, 0], [gn, go] = w.calib.guess ?? [0, 0];
  const p = (a: number, b: number) => Math.round((a / b) * 100);
  if (sn < 5 && gn < 5) return { kind: 'few', text: '自信の見積もりの助言は、「確実」か「勘」を 5 回以上選ぶと出る。' };
  const over = sn >= 5 && so / sn < 0.9, under = gn >= 5 && go / gn > 0.5;
  if (over && under) return { kind: 'both', text: `「確実」の正答率が ${p(so, sn)} %、「勘」の正答率が ${p(go, gn)} %。自信と正誤がかみ合っていない。選んだ答えの理由を 1 つ言えるかどうかで、自信を決めろ。` };
  if (over) return { kind: 'over', text: `「確実」の正答率が ${p(so, sn)} %（9 割を切っている）。自信を持ちすぎている。「確実」を押す前に、なぜそう言えるかを 1 つ言えるか確かめろ。言えなければ「たぶん」にしろ。` };
  if (under) return { kind: 'under', text: `「勘」の正答率が ${p(go, gn)} %（4 択の当てずっぽうなら 25 % ほど）。思っているより覚えている。少しでも根拠があれば「たぶん」を選べ。` };
  return { kind: 'good', text: sn >= 5 ? `「確実」の正答率は ${p(so, sn)} %。自信と正答率が合っている。このまま正直に選べ。` : `「勘」の正答率は ${p(go, gn)} %。わからないものを、わからないと選べている。` };
}

// ---------------- 週の報告 ----------------

export interface WeekStats { n: number; ok: number; rate: number | null; learned: number; ms: number; days: number }
/** from 日前から 7 日間（from = 0 なら今日までの 7 日） */
export function weekStats(w: World, now = Date.now(), from = 0): WeekStats {
  const keys = new Set(Array.from({ length: 7 }, (_, i) => dayKey(now - (from + i) * DAY)));
  let n = 0, ok = 0, ms = 0, days = 0;
  for (const k of keys) { const v = w.revDays[k]; if (v) { n += v[0]; ok += v[1]; if (v[0] > 0) days++; } ms += w.dayMs[k] || 0; }
  const learned = Object.entries(w.srs).filter(([id, c]) => id.startsWith('r:') && c.t0 !== undefined && keys.has(dayKey(c.t0))).length;
  return { n, ok, rate: n ? ok / n : null, learned, ms, days };
}
/** 直近 7 日と、その前の 7 日 */
export const weekReport = (w: World, now = Date.now()) => ({ cur: weekStats(w, now, 0), prev: weekStats(w, now, 7) });

// ---------------- 試験までの復習の見込み ----------------

export interface Forecast { exam: number; name: string; days: number; cards: number; total: number; perDay: number }
/**
 * 次の試験の日までに、いま覚えている問いの復習が何回来るか。どの問いも毎回思い出せた（G = 3）として、FSRS の間隔で先へ進めて数える。
 * 試験日をまたぐ間隔は作らない（capByExams）ので、試験の手前 10 日間の 1 回も、実際の予定と同じように入る。
 * 忘れたものは今日のうちに戻ってくるので、実際はこれより多くなる。これから覚える問いは入っていない。
 */
export function forecast(w: World, now = Date.now()): Forecast | null {
  const exam = w.exams.filter((e) => e > now).sort((a, b) => a - b)[0];
  if (!exam) return null;
  let total = 0, cards = 0;
  for (const [id, c0] of Object.entries(w.srs)) {
    if (!known(id)) continue;
    cards++;
    let c: Card = c0, t = Math.max(c0.due, now), guard = 0;
    while (t < exam && guard++ < 400) { total++; c = review(c, 3, t, w.exams, id, w.ret); t = c.due; }
  }
  const days = Math.max(1, Math.ceil((exam - now) / DAY));
  return { exam, name: w.exams.indexOf(exam) === 0 ? '共通テスト' : '2 次', days, cards, total, perDay: total / days };
}

// ---------------- まちがえた単元 ----------------

const RX_MACHINES = ['separator', 'electrolyzer', 'reactor', 'battery', 'collector'];
/** 間違いの記録を、復習の問いの id に読み替える（読み替えられないものは null） */
export function quizIdOf(m: Mistake): string | null {
  if (!m.recipe) return null;
  if (m.machine === 'quiz') return KNOWLEDGE.some((k) => k.id === m.recipe) ? `k:${m.recipe}` : recipeById(m.recipe) ? `r:${m.recipe}` : null;
  return RX_MACHINES.includes(m.machine) && recipeById(m.recipe) ? `r:${m.recipe}` : null;
}
/**
 * 初めて正しく設定できるまでに、設定でまちがえた反応（記録の「一発で書けたもの」に数えない）。
 * 覚えたあと（t0 より後）の間違い（復習の問い・組み直し）は、一発で書けたかどうかと関係ないので除く。覚えた時刻のない古いセーブは、すべての間違いで数える
 */
export function setupMissed(w: World): Set<string> {
  const out = new Set<string>();
  for (const m of w.mistakes) {
    if (!m.recipe || !RX_MACHINES.includes(m.machine)) continue;
    const t0 = w.srs[`r:${m.recipe}`]?.t0;
    if (t0 === undefined || m.t <= t0) out.add(m.recipe);
  }
  return out;
}
/** 単元の名前。反応は教科書の単元（頭の「化学：」「化学基礎：」は除く） */
export const unitOf = (id: string) => topicOf(id).replace(/^化学(基礎)?：/, '');
/** 単元の問い：知識問題はすべて、反応は覚えたものだけ（まだ組んでいない反応の答えを見せない） */
const unitIds = (w: World, unit: string) => [
  ...KNOWLEDGE.filter((k) => k.topic === unit).map((k) => `k:${k.id}`),
  ...RECIPES.filter((r) => w.learned.includes(r.id) && unitOf(`r:${r.id}`) === unit).map((r) => `r:${r.id}`)];
/** まちがえた回数の多い単元（上位 top）。ids は、まちがえた回数の多い問いから並べた、その単元の練習の問い */
export function mistakeUnits(w: World, top = 3): { unit: string; n: number; ids: string[] }[] {
  const by = new Map<string, Map<string, number>>();
  for (const m of w.mistakes) {
    const id = quizIdOf(m);
    if (!id || (id.startsWith('r:') && !w.learned.includes(id.slice(2)))) continue;
    const u = unitOf(id);
    if (!u) continue;
    const per = by.get(u) ?? new Map<string, number>();
    per.set(id, (per.get(id) || 0) + 1);
    by.set(u, per);
  }
  return [...by].map(([unit, per]) => ({ unit, n: [...per.values()].reduce((a, x) => a + x, 0), ids: [...new Set([...[...per].sort((a, b) => b[1] - a[1]).map(([id]) => id), ...unitIds(w, unit)])] }))
    .sort((a, b) => b.n - a.n).slice(0, top);
}

// ---------------- まちがえた理由 ----------------

/** まちがえた理由をつける。同じ答えで選び直したら（1 分以内の同じ問い）、付け替える */
export function tagWhy(w: World, id: string, why: Why, now = Date.now()) {
  const list = w.study.why, last = list[list.length - 1];
  if (last && last.id === id && now - last.t < 60000) { last.why = why; return; }
  list.push({ id, why, t: now });
  if (list.length > WHY_KEEP) list.splice(0, list.length - WHY_KEEP);
}
/** 理由ごとの数と、その理由でまちがえた問い（新しい順） */
export function whyTally(w: World): Record<Why, { n: number; ids: string[] }> {
  const out: Record<Why, { n: number; ids: string[] }> = { slip: { n: 0, ids: [] }, unknown: { n: 0, ids: [] }, mixup: { n: 0, ids: [] } };
  for (const x of [...w.study.why].reverse()) { const o = out[x.why]; o.n++; if (!o.ids.includes(x.id) && known(x.id)) o.ids.push(x.id); }
  return out;
}

// ---------------- 今夜・今朝の 10 問の記録 ----------------

/** いまの今夜の 10 問（w.night）を、日ごとの記録に書き写す。同じ夜は上書き */
export function logNight(w: World) {
  const n = w.night;
  if (!n || !n.ids.length) return;
  const rec: NightRec = { day: n.day, n: n.ids.length, got: n.got, morning: n.morning };
  const list = w.study.nights, i = list.findIndex((x) => x.day === n.day);
  if (i >= 0) list[i] = rec; else list.push(rec);
  list.sort((a, b) => dayNum(a.day) - dayNum(b.day));
  if (list.length > NIGHT_KEEP) list.splice(0, list.length - NIGHT_KEEP);
}
/** 直近 days 日の記録（新しい順） */
export function nightHistory(w: World, now = Date.now(), days = 7): NightRec[] {
  logNight(w);
  const keys = new Set(Array.from({ length: days }, (_, i) => dayKey(now - i * DAY)));
  return w.study.nights.filter((x) => keys.has(x.day)).reverse();
}

// ---------------- 学習時間の目標 ----------------

/** 今日の学習時間（工場とノートを開いていた時間）と、目標までの進み */
export function studyToday(w: World, now = Date.now()) {
  const ms = w.dayMs[dayKey(now)] || 0, goal = w.study.goalMin * 60000;
  return { ms, goal, frac: goal ? Math.min(1, ms / goal) : 0, done: goal > 0 && ms >= goal, left: Math.max(0, goal - ms) };
}

// ---------------- 練習の順番 ----------------

/** 練習の順番に並べる。混ぜる：でたらめに。苦手から：いま思い出せる確率の低い順（同じなら忘れた回数の多い順）、まだ答えていない問いは後ろ */
export function orderIds(w: World, ids: string[], rnd: () => number = Math.random, now = Date.now()): string[] {
  const uniq = [...new Set(ids)];
  if (w.study.order !== 'weak') return shuffle(uniq, rnd);
  const seen = uniq.filter((id) => w.srs[id]), fresh = uniq.filter((id) => !w.srs[id]);
  seen.sort((a, b) => recallNow(w.srs[a], now) - recallNow(w.srs[b], now) || w.srs[b].l - w.srs[a].l);
  return [...seen, ...fresh];
}
/**
 * 練習で解く問い（max 問まで）。渡された並び（まちがえたもの・苦手なものが先）のまま、解けるもの（ok）を選んでから、練習の順番に並べる。
 * 並べてから選ぶと、混ぜたときに、まちがえた問いが 10 問からこぼれる
 */
export function practiceIds(w: World, ids: string[], ok: (id: string) => boolean, max = 10, rnd: () => number = Math.random, now = Date.now()): string[] {
  return orderIds(w, [...new Set(ids)].filter(ok).slice(0, max), rnd, now);
}

// ---------------- 計算問題の解き直し ----------------

/** 強化・研究でまちがえた計算問題。まだ解き直していないものが先、新しくまちがえた順 */
export function calcRedo(w: World): { id: string; topic: string; misses: number; last: number; done: boolean }[] {
  const m = new Map<string, { misses: number; last: number }>();
  for (const x of w.mistakes) {
    if (x.machine !== 'calc' || !x.recipe || !QUESTIONS.some((q) => q.id === x.recipe)) continue;
    const e = m.get(x.recipe) ?? { misses: 0, last: 0 };
    e.misses++; e.last = Math.max(e.last, x.t);
    m.set(x.recipe, e);
  }
  return [...m].map(([id, e]) => ({ id, topic: QUESTIONS.find((q) => q.id === id)!.topic, ...e, done: (w.study.redo[id] ?? 0) > e.last }))
    .sort((a, b) => Number(a.done) - Number(b.done) || b.last - a.last);
}
/** 解き直して正解した。正解した計算問題にも入れる */
export function redoSolved(w: World, id: string, now = Date.now()) {
  w.study.redo[id] = now;
  if (!w.solved.includes(id)) w.solved.push(id);
}

// ---------------- 反応を使う指令・章ごとの習熟 ----------------

/** この反応で作れる指令の物質（章・何番目の指令・物質）。電池はどれも電子を出す */
export function goalsOf(r: Recipe): { ch: number; gi: number; s: string }[] {
  const outs = new Set(productsOf(r).map(([s]) => s));
  if (r.machine === 'battery') outs.add('e');
  const res: { ch: number; gi: number; s: string }[] = [];
  CHAPTERS.forEach((c, ch) => c.goals.forEach((g, gi) => { const s = [g.s, ...(g.also ?? [])].find((x) => outs.has(x)); if (s) res.push({ ch, gi, s }); }));
  return res;
}
/** 章の反応（指令の物質を作る反応。確認テストと同じ）のうち、正しく設定できたものの数と、習熟メッキ（銅・銀・金）の数 */
export function chapterMastery(w: World, ch: number): { learned: number; total: number; plate: [number, number, number] } {
  const rs = chapterRecipes(ch), got = rs.filter((r) => w.learned.includes(r.id));
  const plate: [number, number, number] = [0, 0, 0];
  for (const r of got) { const p = platingOf(w.srs, r.id); if (p) plate[p - 1]++; }
  return { learned: got.length, total: rs.length, plate };
}

// ---------------- 反応式の穴埋め（練習） ----------------

export interface FillTerm { side: 0 | 1; id: string; n: number; fixed: boolean }
/** 係数を書き込める反応（係数の問いが作れるもの）・生成物を組める反応 */
export const canFillCoef = (r: Recipe) => partsFor(r).includes('coef');
export const canPickProducts = (r: Recipe) => partsFor(r).includes('products');
/** 式の項。電池の電子は書き込まず、そのまま見せる */
export function fillTerms(r: Recipe): FillTerm[] {
  const outs = r.machine === 'battery' ? r.outputs : productsOf(r);
  return [...r.inputs.map(([id, n]) => ({ side: 0 as const, id, n, fixed: false })), ...outs.map(([id, n]) => ({ side: 1 as const, id, n, fixed: id === 'e' }))];
}
/** 書き込んだ係数の採点。scaled：比は合っているが、いちばん簡単な整数比ではない */
export function checkCoefs(r: Recipe, typed: number[]): 'ok' | 'scaled' | 'wrong' {
  const want = fillTerms(r).filter((t) => !t.fixed).map((t) => t.n);
  if (typed.length !== want.length || typed.some((x) => !Number.isInteger(x) || x < 1)) return 'wrong';
  if (typed.every((x, i) => x === want[i])) return 'ok';
  const k = typed[0] / want[0];
  return Number.isInteger(k) && k > 1 && typed.every((x, i) => x === want[i] * k) ? 'scaled' : 'wrong';
}
/**
 * 生成物を組む練習の札：正しい生成物に、まぎらわしいものを近い順にまぜる。
 * 原料そのもの（2 つまで）→ 同じ原料を使う反応の生成物 → 同じ装置の反応の生成物
 */
export function productPool(r: Recipe, rnd: () => number = Math.random, size = 7): string[] {
  const right = productsOf(r).map(([s]) => s);
  const outs = (pred: (x: Recipe) => boolean) => RECIPES.filter((x) => x !== r && !x.mix && pred(x)).flatMap((x) => productsOf(x).map(([s]) => s));
  const tiers = [shuffle(r.inputs.map(([s]) => s), rnd).slice(0, 2), outs((x) => x.inputs.some(([s]) => r.inputs.some(([t]) => t === s))), outs((x) => x.machine === r.machine)];
  const need = Math.max(2, size - right.length), wrong: string[] = [];
  // 札は答えと同じ種類にそろえる：捕集びんの気体（jar-）は捕集の反応のときだけ、名前で選ぶ物（高分子・ボンベなど）は答えにあるときだけ
  const named = right.some((s) => sub(s).named);
  const fits = (s: string) => s !== 'e' && !right.includes(s) && !wrong.includes(s) && hasSub(s) && (r.machine === 'collector' || !s.startsWith('jar-')) && (named || !sub(s).named);
  for (const t of tiers) for (const s of shuffle([...new Set(t)], rnd)) if (wrong.length < need && fits(s)) wrong.push(s);
  return shuffle([...right, ...wrong], rnd);
}
export function checkProducts(r: Recipe, picked: string[]): boolean {
  const want = productsOf(r).map(([s]) => s);
  return picked.length === want.length && want.every((s) => picked.includes(s));
}

// ---------------- 苦手の一覧・問いと答え ----------------

/** 苦手の一覧（印刷用）：今日まちがえたもの・何度も忘れたもの・自信を持ってまちがえたもの */
export function weakIds(w: World, now = Date.now()): string[] {
  const hc = [...w.hcLog].reverse().map((x) => x.id);
  const today = w.today.day === dayKey(now) ? w.today.wrong : [];
  return [...new Set([...today, ...leeches(w), ...hc])].filter(known).slice(0, 60);
}
/** 問いと、その正しい答えの 1 行。反応は名前と、反応式・条件 */
export function answerRow(id: string): { q: string; a: string } | null {
  if (id.startsWith('k:')) { const k = KNOWLEDGE.find((x) => `k:${x.id}` === id); return k ? { q: k.q, a: k.choices[0] } : null; }
  const r = recipeById(id.slice(2));
  if (!r) return null;
  const c = r.accept[0];
  return { q: r.name, a: equationOf(r) + (c && c !== 'なし' && c !== '（どれでもよい）' ? `（${CONDITIONS[r.machine].label}：${c}）` : '') };
}

// ---------------- 用語カード・取り違えやすい組 ----------------

/** 知識問題を単元ごとに（データの順） */
export function termTopics(): { topic: string; ids: string[] }[] {
  const m = new Map<string, string[]>();
  for (const k of KNOWLEDGE) { if (!m.has(k.topic)) m.set(k.topic, []); m.get(k.topic)!.push(`k:${k.id}`); }
  return [...m].map(([topic, ids]) => ({ topic, ids }));
}
/** 練習できる取り違えやすい組（反応は覚えたものだけ。2 つ以上残るもの）。まちがえた回数の多い組から */
export function practiceGroups(w: World): { name: string; ids: string[]; miss: number }[] {
  const miss = new Map<string, number>();
  for (const m of w.mistakes) { const id = quizIdOf(m); if (id) miss.set(id, (miss.get(id) || 0) + 1); }
  return CONFUSABLE.map((g) => ({ name: g.name, ids: g.ids.filter((id) => id.startsWith('k:') || w.learned.includes(id.slice(2))) }))
    .filter((g) => g.ids.length >= 2)
    .map((g) => ({ ...g, miss: g.ids.reduce((a, id) => a + (miss.get(id) || 0), 0) }))
    .sort((a, b) => b.miss - a.miss);
}

// ---------------- 解説の中の物質名 ----------------

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
/**
 * 文の中から、ids の物質の名前（化学式）を探して切り分ける。2 文字以上のものだけ。
 * 長い式の一部（NaCl の Na）や、イオン（Cu²⁺ の Cu）は拾わない。前に付いた係数（2H₂O の 2）は構わない
 */
export function subSpans(text: string, ids: Iterable<string>): { t: string; id?: string }[] {
  const labs = [...new Set(ids)].filter((id) => id !== 'e' && hasSub(id)).map((id) => ({ id, lab: label(id) })).filter((x) => x.lab.length >= 2).sort((a, b) => b.lab.length - a.lab.length);
  const tail = (ch: string) => /[A-Za-z0-9₀-₉(]/.test(ch) || (ch !== '' && SUPS.includes(ch));
  const head = (ch: string) => /[A-Za-z₀-₉)]/.test(ch);
  const out: { t: string; id?: string }[] = [];
  let buf = '', i = 0;
  while (i < text.length) {
    const hit = i > 0 && head(text[i - 1]) ? undefined : labs.find((x) => text.startsWith(x.lab, i) && !tail(text[i + x.lab.length] ?? ''));
    if (hit) { if (buf) out.push({ t: buf }); out.push({ t: hit.lab, id: hit.id }); buf = ''; i += hit.lab.length; }
    else { buf += text[i]; i++; }
  }
  if (buf) out.push({ t: buf });
  return out;
}
