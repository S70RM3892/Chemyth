import { recipeById, RECIPES, CONDITIONS, electronsOf, productsOf, type MachineKind, type Recipe } from '../content/recipes';
import { HUB_AT, HUB_CENTER, HUB_DEMAND, HUB_SIZES, hubTiles, resourceAt } from '../content/map';
import { CHAPTERS, TOTAL_GOALS, type Goal } from '../content/goals';
import { hasSub, sub } from '../content/substances';
import { isBalanced } from '../chem/formula';
import { isPositive, setById } from '../content/samples';

/** 0:右 1:下 2:左 3:上 */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

/** 'part' は 2×2 の装置が占める残りのマス。ref が本体の位置を指す */
export type Kind = 'belt' | 'extractor' | 'vent' | 'hub' | 'splitter' | 'bridge' | 'depot' | 'sampler' | 'analyzer' | 'part' | MachineKind;
/** 2×2 マスを占める装置。出口が 6 か所あり、奥の面が入口の目安になる */
export const BIG: Kind[] = ['separator', 'reactor', 'electrolyzer', 'battery'];

/** 流れている物質。p は 0〜1 の進み具合、m は最後に動いた tick、rc は搬出口から出た印 */
export interface Item { s: string; p: number; m: number; rc?: boolean; d?: Dir }

export interface Ent {
  kind: Kind;
  x: number;
  y: number;
  dir: Dir;
  /** ベルト・分配器が運んでいるもの */
  item?: Item | null;
  /** 立体交差：[横の流れ, 縦の流れ] */
  items?: (Item | null)[];
  /** 分配器：次に試す出口 */
  rr?: number;
  /** 搬出口：取り出す物質。試薬棚：試薬の id、または 'set:A' のような試料の組 */
  sub?: string;
  /** 分析器：行う検査 */
  test?: string;
  /** ベルト：最後に流れた物質の状態（見た目に使う） */
  st?: 'gas' | 'liquid' | 'solid';
  /** 装置：出口が詰まったままの秒数 */
  stuck?: number;
  recipe?: string;
  /** 2×2 の装置。左上のマスが本体で、残り 3 マスは 'part' が埋める */
  big?: boolean;
  /** 'part'：本体のマスのキー */
  ref?: string;
  /** 出口ごとの物質 */
  outOrder?: string[];
  /** 出口ごとの、出口の場所の番号。省くと 0, 1, 2, … の順。
   *  1 マスの装置：0 正面 1 右手 2 左手。2×2 の装置：0 正面の左 1 正面の右 2 右手の手前 3 左手の手前 4 右手の奥 5 左手の奥 */
  outSlot?: number[];
  inBuf?: Record<string, number>;
  outBuf?: number[];
  busy?: boolean;
  prog?: number;
  timer?: number;
  /** 稼働の記録。ts：[動いていた秒, 原料を待っていた秒, 出口が詰まっていた秒]、n：反応（産出）した回数、u：直近の稼働率（0〜1） */
  ts?: [number, number, number];
  n?: number;
  u?: number;
  /** この反応で使わない物質が入口に来て、受け取れずにいる。bad：その物質、badT：最後に断った tick */
  bad?: string;
  badT?: number;
}

/** 直近の稼働率をならす時間（秒） */
const UTIL_TAU = 20;
/** 流れの記録の 1 区切り（秒）と、残す数 */
export const BUCKET_SEC = 10;
const BUCKET_KEEP = 30;
export interface Bucket { t: number; deliver: number; goal: number; vent: number; spill: number; made: number }

export type MistakePart = 'reactants' | 'products' | 'electrodes' | 'coefficients' | 'electrons' | 'condition' | 'equilibrium' | 'revealed' | 'calc' | 'isomer' | 'quiz' | 'passage';
export interface Mistake {
  machine: MachineKind | 'calc' | 'analysis' | 'quiz' | 'passage' | 'drill' | 'structure';
  /** 特定できた場合の反応、または計算問題の id */
  recipe: string | null;
  part: MistakePart;
  t: number;
}

export type UpgradeKey = 'extract' | 'belt' | 'machine';
export const UPGRADE_COST = [40, 80, 140, 220, 320];

export interface World {
  ents: Map<string, Ent>;
  /** いま取り組んでいる章 */
  chapter: number;
  /** 章ごとの、達成した指令の数 */
  progress: number[];
  /** 章ごとの、いまの指令で納品した数 */
  counts: number[];
  /** これまでに開いた中でいちばん先の章 */
  seen: number;
  /** 納品所の一辺のマス数。達成数が増えると大きくなり、要求数も増える */
  hubSize: number;
  /** 指令ごとにかかった時間（ミリ秒）。キーは '章:番号' */
  goalMs: Record<string, number>;
  /** 復習の予定。キーは 'r:反応id' か 'k:知識id' */
  srs: Record<string, { due: number; iv: number }>;
  /** リード文課題で正解した空欄 */
  cleared: string[];
  delivered: Record<string, number>;
  /** 納品所の在庫。搬出口で取り出せる */
  stock: Record<string, number>;
  discovered: string[];
  /** 正しく設定できたことのある反応 */
  learned: string[];
  mistakes: Mistake[];
  /** 研究点。強化に使う */
  points: number;
  up: Record<UpgradeKey, number>;
  /** 正解した計算問題 */
  solved: string[];
  /** 演習（連鎖計算・構造決定）の型ごとの成績。tries：解いた回数、clean：全問正解した回数 */
  practice: Record<string, { tries: number; clean: number }>;
  playMs: number;
  tick: number;
  /** UI に知らせる出来事。保存しない */
  events: string[];
  /** 装置が作った数、廃棄口で捨てた数、あふれて捨てた数（物質ごとの累計） */
  made: Record<string, number>;
  vented: Record<string, number>;
  spilled: Record<string, number>;
  /** 直近の流れ。10 秒ごとの区切りで 5 分ぶん。保存しない */
  buckets: Bucket[];
  /** 画面効果のきっかけ。保存しない */
  fx: { x: number; y: number; type: 'react' | 'deliver' | 'spill'; s: string }[];
}

export const beltSpeed = (w: World) => 2 * (1 + 0.35 * w.up.belt);
export const extractInterval = (w: World) => 1 / (1 + 0.5 * w.up.extract);
export const machineRate = (w: World) => 1 + 0.4 * w.up.machine;

export const key = (x: number, y: number) => `${x},${y}`;
export const isMachine = (k: Kind): k is MachineKind => k === 'separator' || k === 'electrolyzer' || k === 'reactor' || k === 'battery' || k === 'collector';


/** 復習の間隔（分）。正解するたびに次へ進み、間違えると最初に戻る */
export const SRS_STEPS = [10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 16, 60 * 24 * 35];
export function schedule(w: World, id: string, correct: boolean, now = Date.now()) {
  const cur = w.srs[id];
  const iv = correct && cur ? Math.min(SRS_STEPS.length - 1, cur.iv + 1) : 0;
  w.srs[id] = { iv, due: now + SRS_STEPS[iv] * 60000 };
}
export const dueIds = (w: World, now = Date.now()) => Object.keys(w.srs).filter((k) => w.srs[k].due <= now).sort((a, b) => w.srs[a].due - w.srs[b].due);

export const currentGoal = (w: World): Goal | undefined => CHAPTERS[w.chapter]?.goals[w.progress[w.chapter]];
/** 納品所の段階（0〜3） */
export const hubLevel = (w: World) => Math.max(0, HUB_SIZES.indexOf(w.hubSize));
/** いま要求される個数。仕分けの指令は増やさない */
export const requiredOf = (w: World, g: Goal) => (g.strict ? g.n : Math.ceil(g.n * HUB_DEMAND[hubLevel(w)]));
/** 達成数に見合う大きさまで納品所を広げる。広がった場所にあったものは取り除く。広がったら true */
export function growHub(w: World): boolean {
  const done = w.progress.reduce((a, n) => a + n, 0);
  let lv = 0;
  HUB_AT.forEach((n, i) => { if (done >= n) lv = i; });
  const size = HUB_SIZES[lv];
  if (size <= w.hubSize && at(w, HUB_CENTER[0], HUB_CENTER[1])?.kind === 'hub') return false;
  const grew = size > w.hubSize;
  w.hubSize = Math.max(size, w.hubSize);
  for (const [x, y] of hubTiles(w.hubSize)) {
    if (at(w, x, y) && at(w, x, y)!.kind !== 'hub') remove(w, x, y);
    w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
  }
  return grew;
}
export const goalCount = (w: World) => w.counts[w.chapter] || 0;
export const doneCount = (w: World) => w.progress.reduce((a, n) => a + n, 0);
export function setChapter(w: World, i: number) {
  w.chapter = Math.max(0, Math.min(CHAPTERS.length - 1, i));
  w.seen = Math.max(w.seen, w.chapter);
}
/** 道具が使えるか */
export const toolUnlocked = (w: World, need: { done?: number; chapter?: number }) =>
  (need.done === undefined && need.chapter === undefined) || (need.done !== undefined && doneCount(w) >= need.done) || (need.chapter !== undefined && w.seen >= need.chapter);

export function newWorld(): World {
  const w: World = {
    ents: new Map(), chapter: 0, progress: CHAPTERS.map(() => 0), counts: CHAPTERS.map(() => 0), seen: 0, hubSize: 2, goalMs: {}, srs: {}, cleared: [], delivered: {}, stock: {},
    discovered: ['air', 'seawater'], learned: [], mistakes: [], points: 0,
    up: { extract: 0, belt: 0, machine: 0 }, solved: [], practice: {}, made: {}, vented: {}, spilled: {}, buckets: [], playMs: 0, tick: 0, events: [], fx: [],
  };
  for (const [x, y] of hubTiles(2)) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
  return w;
}

/** そのマスにあるもの。2×2 の装置は、どのマスを指しても本体を返す */
export function at(w: World, x: number, y: number): Ent | undefined {
  const e = w.ents.get(key(x, y));
  return e?.kind === 'part' ? w.ents.get(e.ref!) : e;
}
export const sizeOf = (e: Ent) => (e.big ? 2 : 1);
export const footprint = (x: number, y: number, size: number): [number, number][] =>
  size === 1 ? [[x, y]] : [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
/** 本体と、それが占める残りのマスを書き込む */
function put(w: World, e: Ent) {
  for (const [x, y] of footprint(e.x, e.y, sizeOf(e))) w.ents.set(key(x, y), x === e.x && y === e.y ? e : { kind: 'part', x, y, dir: 0, ref: key(e.x, e.y) });
}
/** 消したものを元の場所に戻す。場所がふさがっていたら false */
export function restore(w: World, e: Ent): boolean {
  if (footprint(e.x, e.y, sizeOf(e)).some(([x, y]) => w.ents.has(key(x, y)))) return false;
  put(w, e);
  return true;
}
/** 2×2 の装置を置くとき、タップしたマスを含む空き場所を探す。左上のマスを返す */
export function fitAnchor(w: World, x: number, y: number): [number, number] | null {
  for (const [ax, ay] of [[x, y], [x - 1, y], [x, y - 1], [x - 1, y - 1]]) {
    if (footprint(ax, ay, 2).every(([fx, fy]) => !w.ents.has(key(fx, fy)))) return [ax, ay];
  }
  return null;
}

export function discover(w: World, s: string) {
  if (!w.discovered.includes(s)) w.discovered.push(s);
}

/** 置けない理由を返す。置けたら null */
export function place(w: World, kind: Kind, x: number, y: number, dir: Dir): string | null {
  const big = BIG.includes(kind);
  if (footprint(x, y, big ? 2 : 1).some(([fx, fy]) => w.ents.has(key(fx, fy)))) return big ? 'この装置は 2×2 マスを使う。空いた場所に置け' : 'そこはもう埋まっている';
  const e: Ent = { kind, x, y, dir };
  if (big) e.big = true;
  if (kind === 'belt' || kind === 'splitter' || kind === 'analyzer') e.item = null;
  if (kind === 'splitter') e.rr = 0;
  if (kind === 'bridge') e.items = [null, null];
  if (kind === 'extractor') { e.timer = 0; discover(w, resourceAt(x, y)); }
  if (kind === 'depot' || kind === 'sampler') { e.timer = 0; e.rr = 0; }
  put(w, e);
  return null;
}

export function remove(w: World, x: number, y: number): boolean {
  const e = at(w, x, y);
  if (!e || e.kind === 'hub') return false;
  for (const [fx, fy] of footprint(e.x, e.y, sizeOf(e))) w.ents.delete(key(fx, fy));
  return true;
}

export function clearRecipe(e: Ent) {
  e.ts = undefined; e.n = 0; e.u = 0;
  e.recipe = undefined; e.outOrder = undefined; e.outSlot = undefined; e.inBuf = undefined; e.outBuf = undefined; e.busy = false; e.prog = 0;
}

export interface Answer {
  /** [物質id, 係数] */
  reactants: [string, number][];
  /** [物質id（読めなければ null）, 係数] */
  products: [string | null, number][];
  /** 電解槽のみ：生成物ごとに、陰極側 'c' か陽極側 'a' か */
  poles?: ('c' | 'a')[];
  condition: string;
  /** 電池のみ */
  neg?: string;
  pos?: string;
  electrons?: number;
  /** 可逆反応のときに答える、平衡を生成物側へ動かす条件 */
  shift?: string;
}

export type Verdict = { ok: true; recipe: Recipe } | { ok: false; part: MistakePart; message: string; recipe: Recipe | null };

/** プレイヤーの設定を採点する。副作用なし */
export function judge(machine: MachineKind, a: Answer): Verdict {
  const ids = a.reactants.map(([s]) => s).sort().join('+');
  const cands = RECIPES.filter((c) => c.machine === machine && c.inputs.map(([s]) => s).sort().join('+') === ids);
  if (!cands.length) return { ok: false, part: 'reactants', recipe: null, message: 'この装置では、その原料の組み合わせから何も作れない。' };

  const got = machine === 'collector' ? productsOf(cands[0]).map(([s]) => s as string | null) : a.products.map(([s]) => s);
  const sameSet = (c: Recipe) => { const want = productsOf(c).map(([s]) => s); return got.length === want.length && want.every((s) => got.includes(s)); };
  const r = cands.find(sameSet);
  if (!r) return { ok: false, part: 'products', recipe: cands[0], message: '生成物が違う。数も種類もよく考えろ。' };
  const outs = productsOf(r);

  if (machine === 'electrolyzer') {
    // どちらの極で生じるか。溶液全体にできるもの（'x'）は、どちら側に書いてもよい
    const wrong = outs.some(([s], i) => {
      const want = poleOf(r, i);
      return want !== 'x' && (a.poles?.[got.indexOf(s)] ?? 'c') !== want;
    });
    if (wrong) return { ok: false, part: 'electrodes', recipe: r, message: '陰極と陽極が違う。陰極では還元、陽極では酸化が起きる。溶液に生じる物質は、それを生むイオンができる極の側に書け。' };
  }
  if (machine === 'battery' && (a.neg !== r.neg || a.pos !== r.pos)) {
    return { ok: false, part: 'electrodes', recipe: r, message: '負極と正極が違う。負極では酸化が起きて電子が出る。正極では還元が起きる。' };
  }
  if (r.mix) {
    if (!r.inputs.every(([s, n]) => a.reactants.find(([x]) => x === s)?.[1] === n)) {
      return { ok: false, part: 'coefficients', recipe: r, message: '混ぜる比が違う。[H⁺] = Ka × [酸]/[塩] から比を計算しろ。最も簡単な整数比で入れる。' };
    }
  } else if (r.free) {
    // 生成物の比が決まらない反応：原子の数が合っていればよい
    const f = (side: [string | null, number][]) => side.map(([s, n]) => [sub(s!).formula!, n] as [string, number]);
    if (!isBalanced(f(a.reactants), f(a.products))) return { ok: false, part: 'coefficients', recipe: r, message: '係数が違う。両辺の原子の数を数えろ。' };
  } else if (!r.loose) {
    const okIn = r.inputs.every(([s, n]) => a.reactants.find(([x]) => x === s)?.[1] === n);
    const okOut = outs.every(([s, n]) => a.products.find(([g]) => g === s)?.[1] === n);
    if (!okIn || !okOut) return { ok: false, part: 'coefficients', recipe: r, message: '係数が違う。両辺の原子の数を数えろ。最も簡単な整数比で書け。' };
  }
  if (machine === 'battery' && a.electrons !== electronsOf(r)) {
    return { ok: false, part: 'electrons', recipe: r, message: '流れる電子の数が違う。酸化数の変化を数えろ。' };
  }
  if (!r.accept.includes(a.condition)) {
    return { ok: false, part: 'condition', recipe: r, message: `${CONDITIONS[machine].label}が違う。` };
  }
  if (r.shift && a.shift !== r.shift) {
    return { ok: false, part: 'equilibrium', recipe: r, message: a.shift ? '平衡を生成物側へ動かす条件が違う。発熱か吸熱か、気体の分子数が増えるか減るかを考えろ。' : 'これは可逆反応だ。平衡を生成物側へ動かす温度と圧力も答えろ。' };
  }
  return { ok: true, recipe: r };
}

/** 採点に通った設定を装置に書き込む。order はプレイヤーが入れた生成物の順（＝出口の順） */
export function configure(e: Ent, r: Recipe, order: string[], poles?: ('c' | 'a')[]) {
  e.recipe = r.id;
  e.outOrder = r.machine === 'battery' ? ['e', ...order] : order;
  e.outSlot = e.big ? e.outOrder.map((_, i) => BIG_ORDER[i]) : undefined;
  e.bad = undefined;
  if (r.machine === 'electrolyzer' && poles) {
    if (e.big) {
      // 陰極側の生成物は左手、陽極側は右手から出す
      const C = [3, 5, 0], A = [2, 4, 1];
      let c = 0, a2 = 0;
      e.outSlot = order.map((_, i) => (poles[i] === 'a' ? A[a2++] : C[c++]));
    } else {
      // 1 マスの古い電解槽：正面に陰極の 1 つ目、右手に陽極の 1 つ目、残りは左手
      const c0 = order.find((_, i) => poles[i] !== 'a'), a0 = order.find((_, i) => poles[i] === 'a');
      const head = [c0, a0].filter((s): s is string => s !== undefined);
      e.outOrder = [...head, ...order.filter((s) => !head.includes(s))];
    }
  }
  e.inBuf = {};
  e.outBuf = e.outOrder.map(() => 0);
  e.busy = false;
  e.prog = 0;
  e.ts = [0, 0, 0]; e.n = 0; e.u = 0;
}

/** いまの区切り。なければ作る */
function bucket(w: World): Bucket {
  const t = Math.floor(w.playMs / 1000 / BUCKET_SEC), last = w.buckets[w.buckets.length - 1];
  if (last && last.t === t) return last;
  const b: Bucket = { t, deliver: 0, goal: 0, vent: 0, spill: 0, made: 0 };
  w.buckets.push(b);
  if (w.buckets.length > BUCKET_KEEP) w.buckets.shift();
  return b;
}
const bump = (rec: Record<string, number>, s: string, n = 1) => { rec[s] = (rec[s] || 0) + n; };

/** 装置がいま止まっている理由。0 動いている、1 原料待ち、2 出口が詰まっている */
export const machineState = (e: Ent): 0 | 1 | 2 => (e.busy ? 0 : e.outBuf?.some((n) => n > 0) ? 2 : 1);

export interface FlowStats {
  /** 直近 1 分・5 分の、1 分あたりの納品数（搬出口から出し直したものは除く） */
  perMin1: number;
  perMin5: number;
  /** いまの指令の物質の、直近 1 分の納品数 */
  goalPerMin: number;
  /** いまの速さで指令が終わるまでの秒数。流れていなければ null */
  etaSec: number | null;
  /** 設定済みの装置の、直近の稼働率の平均（0〜1）。装置がなければ null */
  util: number | null;
  machines: number;
  jammed: number;
  starved: number;
  unset: number;
  /** 作ったもののうち、捨てた割合（直近 5 分）。作っていなければ null */
  wasteRate: number | null;
}
/** 工場全体の効率 */
export function flowStats(w: World): FlowStats {
  const now = Math.floor(w.playMs / 1000 / BUCKET_SEC);
  const span = (n: number) => w.buckets.filter((b) => b.t > now - n);
  const sum = (bs: Bucket[], k: keyof Bucket) => bs.reduce((a, b) => a + b[k], 0);
  // 経過時間が短いうちは、その時間で割る
  const mins = (n: number) => Math.max(BUCKET_SEC, Math.min(n * BUCKET_SEC, w.playMs / 1000)) / 60;
  const m1 = span(6), m5 = span(30);
  const ms = [...w.ents.values()].filter((e) => isMachine(e.kind));
  const set = ms.filter((e) => e.recipe);
  const goalPerMin = sum(m1, 'goal') / mins(6);
  const g = currentGoal(w);
  const left = g ? requiredOf(w, g) - goalCount(w) : 0;
  const made5 = sum(m5, 'made'), lost5 = sum(m5, 'vent') + sum(m5, 'spill');
  return {
    perMin1: sum(m1, 'deliver') / mins(6), perMin5: sum(m5, 'deliver') / mins(30), goalPerMin,
    etaSec: g && goalPerMin > 0 ? (left / goalPerMin) * 60 : null,
    util: set.length ? set.reduce((a, e) => a + (e.u || 0), 0) / set.length : null,
    machines: set.length, jammed: set.filter((e) => (machineState(e) === 2 && (e.stuck || 0) > 2.5) || !!e.bad).length,
    starved: set.filter((e) => machineState(e) === 1 && (e.u || 0) < 0.15).length, unset: ms.length - set.length,
    wasteRate: made5 > 0 ? Math.min(1, lost5 / made5) : null,
  };
}

/** 初めて正しく設定できた反応に研究点を出す。もらえた点を返す */
export function learn(w: World, r: Recipe, firstTry: boolean): number {
  for (const [s] of r.outputs) discover(w, s);
  if (w.learned.includes(r.id)) return 0;
  w.learned.push(r.id);
  schedule(w, `r:${r.id}`, false);
  const gain = firstTry ? 15 : 8;
  w.points += gain;
  return gain;
}

export function portDir(dir: Dir, port: number): Dir {
  return ((dir + [0, 1, 3][port]) % 4) as Dir;
}

/** 電解槽：i 番目の生成物が生じる極。'x' は溶液全体 */
export const poleOf = (r: Recipe, i: number): 'c' | 'a' | 'x' => ((r.poles ?? 'ca')[i] ?? 'x') as 'c' | 'a' | 'x';
/** 出口の場所の数 */
export const slotCount = (e: Ent) => (e.big ? 6 : 3);
/** 2×2 の装置に生成物を割り当てる順。1 つ目は正面、2 つ目は右手、3 つ目は左手と、面を分けて出す */
export const BIG_ORDER = [0, 2, 3, 1, 4, 5];
export const SLOT_NAMES = { small: ['正面', '右手', '左手'], big: ['正面・左', '正面・右', '右手・手前', '左手・手前', '右手・奥', '左手・奥'] };

/** 2×2 の装置のマス。a：0 奥 / 1 手前（正面側）、b：0 左手 / 1 右手 */
function cell(e: Ent, a: number, b: number): [number, number] {
  switch (e.dir) {
    case 0: return [e.x + a, e.y + b];
    case 1: return [e.x + 1 - b, e.y + a];
    case 2: return [e.x + 1 - a, e.y + 1 - b];
    default: return [e.x + b, e.y + 1 - a];
  }
}
const BIG_SLOT: [number, number, number][] = [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 3], [0, 1, 1], [0, 0, 3]];
export interface Port { x: number; y: number; d: Dir; tx: number; ty: number }
/** 出口の場所 slot の、出口のあるマス (x, y)、出ていく向き d、出ていく先のマス (tx, ty) */
export function slotPort(e: Ent, slot: number): Port {
  if (!e.big) { const d = portDir(e.dir, slot); return { x: e.x, y: e.y, d, tx: e.x + DX[d], ty: e.y + DY[d] }; }
  const [a, b, turn] = BIG_SLOT[slot], [x, y] = cell(e, a, b), d = ((e.dir + turn) % 4) as Dir;
  return { x, y, d, tx: x + DX[d], ty: y + DY[d] };
}
/** i 番目の生成物の出口 */
export const outPort = (e: Ent, i: number): Port => slotPort(e, e.outSlot?.[i] ?? i);
/** 2×2 の装置の入口の目安（奥の面の 2 マス）。原料はどの面からでも入るが、ここから入れると出口とぶつからない */
export function inDoors(e: Ent): { x: number; y: number; d: Dir }[] {
  if (!e.big) return [];
  return [0, 1].map((b) => { const [x, y] = cell(e, 0, b); return { x, y, d: e.dir }; });
}
/** 出口の場所を入れ替える（空いた場所なら移すだけ） */
export function moveOutput(e: Ent, i: number, slot: number) {
  if (!e.outOrder) return;
  const slots = e.outOrder.map((_, k) => e.outSlot?.[k] ?? k);
  const j = slots.indexOf(slot);
  if (j >= 0) slots[j] = slots[i];
  slots[i] = slot;
  e.outSlot = slots;
}

/** n が、マス (x, y) へ向き d で物を送り出すか */
function emits(w: World, n: Ent, x: number, y: number, d: Dir, depth = 0): boolean {
  switch (n.kind) {
    case 'belt': case 'extractor': case 'depot': case 'sampler': return n.dir === d;
    case 'analyzer': return [0, 1].some((i) => portDir(n.dir, i) === d);
    case 'splitter': return [0, 1, 2].some((i) => portDir(n.dir, i) === d);
    case 'bridge': return through(w, n, d, depth + 1);
    default: return !!n.outOrder && n.outOrder.some((_, i) => { const p = outPort(n, i); return p.d === d && p.tx === x && p.ty === y; });
  }
}

/** 立体交差 b を向き d に通り抜ける流れがあるか（立体交差が続いていてもたどる） */
function through(w: World, b: Ent, d: Dir, depth = 0): boolean {
  const n = at(w, b.x - DX[d], b.y - DY[d]);
  return !!n && depth <= 8 && emits(w, n, b.x, b.y, d, depth);
}

/** (x,y) へ流れ込んでくるものがあれば、その進行方向を返す。prefer の向きを優先する */
export function inflow(w: World, x: number, y: number, prefer?: Dir): Dir | null {
  const order: Dir[] = prefer === undefined ? [0, 1, 2, 3] : [prefer, ((prefer + 1) % 4) as Dir, ((prefer + 3) % 4) as Dir];
  for (const d of order) {
    const n = at(w, x - DX[d], y - DY[d]);
    if (n && emits(w, n, x, y, d)) return d;
  }
  return null;
}

/** 置くときの向きを決める。流れ込みがあればその向き、なければ納品所の方角 */
export function autoDir(w: World, kind: Kind, x: number, y: number): Dir {
  if (kind === 'extractor' || kind === 'depot' || kind === 'sampler') {
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const n = at(w, x + DX[d], y + DY[d]);
      if (n && n.kind !== 'extractor' && n.kind !== 'depot' && n.kind !== 'sampler' && n.kind !== 'hub' && !(n.kind === 'belt' && n.dir === (d + 2) % 4)) return d;
    }
  } else {
    for (const [fx, fy] of footprint(x, y, BIG.includes(kind) ? 2 : 1)) {
      const d = inflow(w, fx, fy);
      if (d !== null) return d;
    }
  }
  const dx = HUB_CENTER[0] - (x + 0.5), dy = HUB_CENTER[1] - (y + 0.5);
  return (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3) as Dir;
}

function deliver(w: World, s: string, x: number, y: number, rc?: boolean) {
  w.stock[s] = (w.stock[s] || 0) + 1;
  discover(w, s);
  w.fx.push({ x, y, type: 'deliver', s });
  if (rc) return; // 搬出口や試薬棚から出して納めただけのものは数えない
  w.delivered[s] = (w.delivered[s] || 0) + 1;
  bucket(w).deliver++;
  const g = currentGoal(w), ch = w.chapter;
  if (!g) return;
  if (g.s !== s) {
    // 仕分け課題で、同じ試料の別の物質を納めたら減点
    if (g.strict && setById(g.strict)?.members.includes(s)) {
      w.counts[ch] = Math.max(0, w.counts[ch] - 2);
      w.mistakes.push({ machine: 'analysis', recipe: g.s, part: 'isomer', t: Date.now() });
      w.events.push('wrong-sample');
    }
    return;
  }
  w.counts[ch]++;
  bucket(w).goal++;
  w.points++;
  if (w.counts[ch] >= requiredOf(w, g)) {
    for (const b of w.buckets) b.goal = 0; // 指令が変わるので、指令ぶんの速さは数え直す
    w.progress[ch]++;
    w.counts[ch] = 0;
    w.points += 30;
    if (growHub(w)) w.events.push('hub-grow');
    if (w.progress[ch] < CHAPTERS[ch].goals.length) { w.events.push('goal-done'); return; }
    // 章を終えたら、まだ残っている次の章へ進む
    const next = [...CHAPTERS.keys()].map((i) => (ch + 1 + i) % CHAPTERS.length).find((i) => w.progress[i] < CHAPTERS[i].goals.length);
    if (next === undefined) { w.events.push('all-done'); return; }
    setChapter(w, next);
    w.events.push('chapter-done');
  }
}

/** (x,y) のマスへ、向き d で物質 s を押し込む */
function push(w: World, x: number, y: number, d: Dir, s: string, rc?: boolean): boolean {
  const t = at(w, x, y);
  if (!t) return false;
  switch (t.kind) {
    case 'belt':
      if (t.item || t.dir === (d + 2) % 4) return false;
      t.item = { s, p: 0, m: w.tick, rc };
      t.st = s === 'e' ? 'gas' : sub(s).state;
      return true;
    case 'splitter':
    case 'analyzer':
      if (t.item) return false;
      t.item = { s, p: 0, m: w.tick, rc };
      return true;
    case 'bridge': {
      const slots = (t.items ??= [null, null]);
      if (slots[d % 2]) return false;
      slots[d % 2] = { s, p: 0, m: w.tick, rc, d };
      return true;
    }
    case 'hub':
      deliver(w, s, x, y, rc);
      return true;
    case 'vent':
      bump(w.vented, s);
      bucket(w).vent++;
      return true;
    case 'extractor':
    case 'depot':
    case 'sampler':
      return false;
    default: {
      const r = recipeById(t.recipe);
      if (!r || !t.inBuf) return false;
      const need = r.inputs.find(([id]) => id === s)?.[1];
      // 使わない物質は受け取らない。ベルトはそこで止まるので、理由がわかるように印をつける
      if (!need) { t.bad = s; t.badT = w.tick; return false; }
      // 入れすぎた分はあふれて捨てる（1 本のベルトに混ぜても詰まらない）
      if ((t.inBuf[s] || 0) >= need * 4) { w.fx.push({ x, y, type: 'spill', s }); bump(w.spilled, s); bucket(w).spill++; return true; }
      t.inBuf[s] = (t.inBuf[s] || 0) + 1;
      return true;
    }
  }
}

export function step(w: World, dt: number) {
  w.tick++;
  w.playMs += dt * 1000;
  if (currentGoal(w)) { const gk = `${w.chapter}:${w.progress[w.chapter]}`; w.goalMs[gk] = (w.goalMs[gk] || 0) + dt * 1000; }
  const speed = beltSpeed(w), every = extractInterval(w), rate = machineRate(w), kU = 1 - Math.exp(-dt / UTIL_TAU);
  for (const e of w.ents.values()) {
    switch (e.kind) {
      case 'belt': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p >= 1 && it.m !== w.tick && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc)) e.item = null;
        break;
      }
      case 'splitter': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        for (let k = 0; k < 3; k++) {
          const i = ((e.rr || 0) + k) % 3, d = portDir(e.dir, i);
          if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc)) { e.item = null; e.rr = (i + 1) % 3; break; }
        }
        break;
      }
      case 'analyzer': {
        const it = e.item;
        if (!it || !e.test) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        const d = portDir(e.dir, isPositive(it.s, e.test) ? 0 : 1);
        if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc)) e.item = null;
        break;
      }
      case 'sampler': {
        e.timer = (e.timer || 0) + dt;
        if (!e.sub || e.timer < every * 1.5) break;
        const set = e.sub.startsWith('set:') ? setById(e.sub.slice(4)) : undefined;
        const s = set ? set.members[(e.rr || 0) % set.members.length] : e.sub;
        if (!hasSub(s)) break;
        if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, s, !set)) { e.timer = 0; e.rr = ((e.rr || 0) + 1) % 1000; }
        break;
      }
      case 'bridge': {
        const slots = e.items;
        if (!slots) break;
        for (let a = 0; a < 2; a++) {
          const it = slots[a];
          if (!it) continue;
          it.p = Math.min(1, it.p + speed * dt);
          const d = it.d ?? (a as Dir);
          if (it.p >= 1 && it.m !== w.tick && push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc)) slots[a] = null;
        }
        break;
      }
      case 'extractor': {
        e.timer = (e.timer || 0) + dt;
        if (e.timer >= every && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, resourceAt(e.x, e.y))) { e.timer = 0; e.n = (e.n || 0) + 1; }
        // 出した先がふさがっていると、採れるのに出せない
        e.u = (e.u ?? 1) + ((e.timer < every + dt ? 1 : 0) - (e.u ?? 1)) * kU;
        break;
      }
      case 'depot': {
        e.timer = (e.timer || 0) + dt;
        if (!e.sub || !(w.stock[e.sub] > 0) || e.timer < every) break;
        if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, e.sub, true)) { e.timer = 0; w.stock[e.sub]--; }
        break;
      }
      case 'vent':
      case 'hub':
      case 'part':
        break;
      default: {
        const r = recipeById(e.recipe);
        if (!r || !e.inBuf || !e.outBuf || !e.outOrder) break;
        if (e.bad && w.tick - (e.badT || 0) > 45) e.bad = undefined;
        if (!e.busy) {
          // 出口が全部はけるまで次の反応は始まらない（副生成物を放置すると詰まる）
          if (e.outBuf.every((n) => n === 0) && r.inputs.every(([s, n]) => (e.inBuf![s] || 0) >= n)) {
            for (const [s, n] of r.inputs) e.inBuf[s] -= n;
            e.busy = true;
            e.prog = 0;
          }
        } else {
          e.prog = (e.prog || 0) + (dt * rate) / r.time;
          if (e.prog >= 1) {
            e.busy = false;
            e.prog = 0;
            w.fx.push({ x: e.x + (sizeOf(e) - 1) / 2, y: e.y + (sizeOf(e) - 1) / 2, type: 'react', s: e.outOrder[0] });
            e.n = (e.n || 0) + 1;
            e.outOrder.forEach((s, i) => {
              const k = r.outputs.find(([id]) => id === s)![1];
              e.outBuf![i] += k;
              if (s !== 'e') { bump(w.made, s, k); bucket(w).made += k; }
              discover(w, s);
            });
          }
        }
        e.outOrder.forEach((s, i) => {
          if (e.outBuf![i] <= 0) return;
          const p = outPort(e, i);
          if (push(w, p.tx, p.ty, p.d, s)) e.outBuf![i]--;
        });
        e.stuck = !e.busy && e.outBuf.some((n) => n > 0) ? (e.stuck || 0) + dt : 0;
        const st = machineState(e);
        (e.ts ??= [0, 0, 0])[st] += dt;
        e.u = (e.u || 0) + ((st === 0 ? 1 : 0) - (e.u || 0)) * kU;
      }
    }
  }
}

// ---- 保存 ----

export const SAVE_VERSION = 2;

export function serialize(w: World): string {
  return JSON.stringify({
    v: SAVE_VERSION, ents: [...w.ents.values()].filter((e) => e.kind !== 'part'), chapter: w.chapter, progress: w.progress, counts: w.counts, seen: w.seen,
    hubSize: w.hubSize, goalMs: w.goalMs, srs: w.srs, cleared: w.cleared, done: doneCount(w), delivered: w.delivered, stock: w.stock,
    discovered: w.discovered, learned: w.learned, mistakes: w.mistakes.slice(-400), points: w.points, up: w.up, solved: w.solved, practice: w.practice, made: w.made, vented: w.vented, spilled: w.spilled,
    playMs: Math.round(w.playMs), savedAt: Date.now(),
  });
}

export function deserialize(json: string): World | null {
  try {
    const d = JSON.parse(json);
    if (d.v !== SAVE_VERSION || !Array.isArray(d.ents)) return null;
    const w = newWorld();
    w.ents = new Map();
    for (const e of d.ents as Ent[]) if (e.kind !== 'part') restore(w, e);
    for (const e of w.ents.values()) {
      if (e.recipe && !recipeById(e.recipe)) clearRecipe(e);
      if (e.item && !hasSub(e.item.s)) e.item = null;
      if (e.item) e.item.m = 0;
      if (e.items) e.items = e.items.map((it) => (it && hasSub(it.s) ? { ...it, m: 0 } : null));
    }
    if (Array.isArray(d.progress)) {
      w.progress = CHAPTERS.map((c, i) => Math.min(c.goals.length, d.progress[i] | 0));
      w.counts = CHAPTERS.map((_, i) => d.counts?.[i] | 0);
      w.chapter = Math.max(0, Math.min(CHAPTERS.length - 1, d.chapter | 0));
    } else {
      // 章を選べなかった頃のセーブ：通し番号から章ごとの進み具合に直す
      let left = Math.min(TOTAL_GOALS, d.goal | 0), found = false;
      w.chapter = CHAPTERS.length - 1;
      CHAPTERS.forEach((c, i) => {
        const n = Math.min(c.goals.length, left);
        w.progress[i] = n;
        if (n < c.goals.length && !found) { found = true; w.chapter = i; w.counts[i] = d.count | 0; }
        left -= n;
      });
    }
    w.seen = Math.max(d.seen | 0, w.chapter);
    w.goalMs = d.goalMs || {};
    // 納品所は保存された大きさで置き直す。達成数に足りなければ広げる（古いセーブ）
    for (const [k, e] of w.ents) if (e.kind === 'hub') w.ents.delete(k);
    w.hubSize = HUB_SIZES.includes(d.hubSize) ? d.hubSize : 2;
    for (const [x, y] of hubTiles(w.hubSize)) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
    if (growHub(w)) w.events.push('hub-grow');
    w.srs = d.srs || {};
    w.cleared = d.cleared || [];
    for (const id of d.learned || []) if (!w.srs[`r:${id}`] && recipeById(id)) w.srs[`r:${id}`] = { iv: 0, due: Date.now() };
    w.delivered = d.delivered || {};
    w.stock = d.stock || {};
    w.discovered = [...new Set([...w.discovered, ...(d.discovered || [])])].filter(hasSub);
    w.learned = d.learned || [];
    w.mistakes = d.mistakes || [];
    w.points = d.points | 0;
    w.up = { extract: d.up?.extract | 0, belt: d.up?.belt | 0, machine: d.up?.machine | 0 };
    w.solved = d.solved || [];
    w.practice = d.practice || {};
    w.made = d.made || {};
    w.vented = d.vented || {};
    w.spilled = d.spilled || {};
    w.playMs = d.playMs || 0;
    return w;
  } catch {
    return null;
  }
}

/** セーブ枠の一覧に出す要約 */
export function summarize(json: string | null): { done: number; chapter: number; playMs: number; savedAt: number; points: number } | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    if (d.v !== SAVE_VERSION) return null;
    return { done: (d.done ?? d.goal) | 0, chapter: d.chapter | 0, playMs: d.playMs || 0, savedAt: d.savedAt || 0, points: d.points | 0 };
  } catch {
    return null;
  }
}

