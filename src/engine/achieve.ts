/**
 * 実績：工場づくり・納品・指令・学習の節目。得た時刻を World.ach に残す（セーブに入る）。
 * 条件はどれも、すでに World に記録していることから決まる。prog は [いまの数, 目標の数] で、いまの数が目標に届いたら得る
 */
import { ELEMENTS } from '../content/elements';
import { CHAPTERS, TOTAL_GOALS } from '../content/goals';
import { HUB_SIZES } from '../content/map';
import { RECIPES } from '../content/recipes';
import { recentRate } from './flow';
import { DAILY_GOAL, streakOf } from './habit';
import { researchById } from '../content/research';
import { UPGRADE_COST, chaptersDone, doneCount, fedTier, floorOf, isMachine, type Ent, type World } from './world';

export type AchGroup = '学習' | '工場' | '納品' | '指令';
export interface Achievement { id: string; group: AchGroup; name: string; how: string; prog(w: World, now: number): [number, number] }

const total = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);
const countEnts = (w: World, f: (e: Ent) => boolean) => { let n = 0; for (const e of w.ents.values()) if (f(e)) n++; return n; };
const configured = (w: World) => countEnts(w, (e) => isMachine(e.kind) && !!e.recipe);
const fedN = (w: World) => ELEMENTS.filter((el) => fedTier(w, el.sym) >= 1).length;
const grades = (w: World, g: string) => Object.values(w.grades).filter((x) => x === g).length;
/** 遊びはじめの 1 分は、短い時間で割るので速さが跳ねる。実績には数えない */
const rate = (w: World) => (w.playMs >= 60000 ? recentRate(w) : 0);
/** 設定済みの装置が 10 台以上あるときの、直近の稼働率の平均（%） */
function busyPct(w: World): number {
  let n = 0, u = 0;
  for (const e of w.ents.values()) if (isMachine(e.kind) && e.recipe) { n++; u += e.u || 0; }
  return n >= 10 ? Math.floor((u / n) * 100) : 0;
}
const A = (id: string, group: AchGroup, name: string, how: string, prog: Achievement['prog']): Achievement => ({ id, group, name, how, prog });

export const ACHIEVEMENTS: Achievement[] = [
  // ---- 学習 ----
  A('react-1', '学習', 'はじめての反応', '反応を 1 つ、装置に正しく設定する', (w) => [w.learned.length, 1]),
  A('react-10', '学習', '反応 10 種', '10 種類の反応を、正しく設定する', (w) => [w.learned.length, 10]),
  A('react-50', '学習', '反応 50 種', '50 種類の反応を、正しく設定する', (w) => [w.learned.length, 50]),
  A('react-all', '学習', 'すべての反応', `${RECIPES.length} 種類すべての反応を、正しく設定する`, (w) => [w.learned.length, RECIPES.length]),
  A('review-10', '学習', '1 日 10 問', `1 日に ${DAILY_GOAL} 問、復習する`, (w) => [Math.max(0, ...Object.values(w.revDays).map((v) => v[0])), DAILY_GOAL]),
  A('streak-3', '学習', '3 日続けて', '3 日続けて復習する', (w, now) => [streakOf(w, now), 3]),
  A('streak-7', '学習', '7 日続けて', '7 日続けて復習する', (w, now) => [streakOf(w, now), 7]),
  A('streak-30', '学習', '30 日続けて', '30 日続けて復習する', (w, now) => [streakOf(w, now), 30]),
  A('gold-1', '学習', '金メッキ', '反応を 1 つ、16 日以上空けた復習で思い出し、装置を金にする', (w) => [Object.keys(w.srs).filter((k) => k.startsWith('r:') && (w.srs[k].b ?? 0) >= 16).length, 1]),
  A('calc-10', '学習', '計算 10 問', '計算問題（強化と研究で出る）を 10 問解く', (w) => [w.solved.length, 10]),
  // ---- 工場 ----
  A('machines-10', '工場', '10 台の工場', '設定済みの装置を 10 台そろえる', (w) => [configured(w), 10]),
  A('machines-50', '工場', '50 台の工場', '設定済みの装置を 50 台そろえる', (w) => [configured(w), 50]),
  A('busy-90', '工場', '休まない工場', '設定済みの装置 10 台以上で、直近の稼働率の平均を 90 % 以上にする', (w) => [busyPct(w), 90]),
  A('train-1', '工場', 'はじめての列車', '列車で、積む駅から降ろす駅まで荷を運ぶ', (w) => [countEnts(w, (e) => e.kind === 'station' && (e.n || 0) > 0) ? 1 : 0, 1]),
  A('floor-2', '工場', '2 階建て', '研究「2 階」を終えて、2 階に設備を置く', (w) => [countEnts(w, (e) => floorOf(e.y) === 1) ? 1 : 0, 1]),
  A('research-1', '工場', 'はじめての研究', '研究を 1 つ終える', (w) => [w.research.length, 1]),
  A('research-t3', '工場', '第 3 段の研究', '第 3 段の研究を 1 つ終える', (w) => [w.research.some((id) => researchById(id)?.tier === 3) ? 1 : 0, 1]),
  A('upgrade-max', '工場', '強化 最大', '強化のどれか 1 つを最大まで上げる', (w) => [Math.max(w.up.extract, w.up.belt, w.up.machine), UPGRADE_COST.length]),
  // ---- 納品 ----
  A('deliver-1', '納品', 'はじめての納品', '物質を 1 個、納品所へ運ぶ', (w) => [total(w.delivered), 1]),
  A('deliver-100', '納品', '100 個', '物質を合わせて 100 個納める', (w) => [total(w.delivered), 100]),
  A('deliver-1000', '納品', '1000 個', '物質を合わせて 1000 個納める', (w) => [total(w.delivered), 1000]),
  A('deliver-10000', '納品', '1 万個', '物質を合わせて 1 万個納める', (w) => [total(w.delivered), 10000]),
  A('rate-30', '納品', '毎分 30 個', '納品の速さを、直近 1 分で毎分 30 個以上にする', (w) => [Math.floor(rate(w)), 30]),
  A('rate-100', '納品', '毎分 100 個', '納品の速さを、直近 1 分で毎分 100 個以上にする', (w) => [Math.floor(rate(w)), 100]),
  A('elements-10', '納品', '10 元素', '納品所に、10 種類の元素を飲み込ませる', (w) => [fedN(w), 10]),
  A('elements-all', '納品', '全元素', `納品所に、${ELEMENTS.length} 種類すべての元素を飲み込ませる`, (w) => [fedN(w), ELEMENTS.length]),
  // ---- 指令 ----
  A('goal-1', '指令', 'はじめての指令', '指令を 1 つ達成する', (w) => [doneCount(w), 1]),
  A('chapter-1', '指令', '第 1 章 修了', `${CHAPTERS[0].name}の指令をすべて終える`, (w) => [w.progress[0] || 0, CHAPTERS[0].goals.length]),
  A('chapters-5', '指令', '5 章 修了', '章を 5 つ終える', (w) => [chaptersDone(w.progress).filter(Boolean).length, 5]),
  A('goals-all', '指令', 'すべての指令', `${TOTAL_GOALS} の指令をすべて終える`, (w) => [doneCount(w), TOTAL_GOALS]),
  A('grade-s', '指令', 'はじめての S', '操業評価 S で指令を終える（終えた時点の速さが毎分 30 個以上）', (w) => [grades(w, 'S'), 1]),
  A('grade-s10', '指令', 'S を 10 個', '操業評価 S の指令を 10 個にする', (w) => [grades(w, 'S'), 10]),
  A('hub-max', '指令', '最大の納品所', `納品所を ${HUB_SIZES[HUB_SIZES.length - 1]}×${HUB_SIZES[HUB_SIZES.length - 1]} まで広げる`, (w) => [w.hubSize, HUB_SIZES[HUB_SIZES.length - 1]]),
  A('case-1', '指令', '課題を解く', 'メニューの「課題」を 1 つ解く', (w) => [w.cases.length, 1]),
];
export const achById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/** まだ得ていない実績のうち、条件を満たしたものを得る（得た時刻を残す）。新しく得たものを返す */
export function checkAchievements(w: World, now = Date.now()): Achievement[] {
  const got: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (w.ach[a.id]) continue;
    const [c, n] = a.prog(w, now);
    if (c >= n) { w.ach[a.id] = now; got.push(a); }
  }
  return got;
}
