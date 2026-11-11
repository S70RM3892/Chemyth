import { recipeById, RECIPES, CONDITIONS, electronsOf, productsOf, type MachineKind, type Recipe } from '../content/recipes';
import { HUB_AT, HUB_CENTER, HUB_DEMAND, HUB_SIZES, hubTiles, resourceAt } from '../content/map';
import { CHAPTERS, TOTAL_GOALS, type Goal } from '../content/goals';
import { hasSub, sub } from '../content/substances';
import { isPositive, setById } from '../content/samples';

/** 0:右 1:下 2:左 3:上 */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export type Kind = 'belt' | 'extractor' | 'vent' | 'hub' | 'splitter' | 'bridge' | 'depot' | 'sampler' | 'analyzer' | MachineKind;

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
  /** 出口ごとの物質。0:正面 1:右手 2:左手 */
  outOrder?: string[];
  inBuf?: Record<string, number>;
  outBuf?: number[];
  busy?: boolean;
  prog?: number;
  timer?: number;
}

export type MistakePart = 'reactants' | 'products' | 'electrodes' | 'coefficients' | 'electrons' | 'condition' | 'equilibrium' | 'revealed' | 'calc' | 'isomer' | 'quiz' | 'passage';
export interface Mistake {
  machine: MachineKind | 'calc' | 'analysis' | 'quiz' | 'passage';
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
  playMs: number;
  tick: number;
  /** UI に知らせる出来事。保存しない */
  events: string[];
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
  for (const [x, y] of hubTiles(w.hubSize)) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
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
    up: { extract: 0, belt: 0, machine: 0 }, solved: [], playMs: 0, tick: 0, events: [], fx: [],
  };
  for (const [x, y] of hubTiles(2)) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
  return w;
}

export function at(w: World, x: number, y: number): Ent | undefined {
  return w.ents.get(key(x, y));
}

export function discover(w: World, s: string) {
  if (!w.discovered.includes(s)) w.discovered.push(s);
}

/** 置けない理由を返す。置けたら null */
export function place(w: World, kind: Kind, x: number, y: number, dir: Dir): string | null {
  if (at(w, x, y)) return 'そこはもう埋まっている';
  const e: Ent = { kind, x, y, dir };
  if (kind === 'belt' || kind === 'splitter' || kind === 'analyzer') e.item = null;
  if (kind === 'splitter') e.rr = 0;
  if (kind === 'bridge') e.items = [null, null];
  if (kind === 'extractor') { e.timer = 0; discover(w, resourceAt(x, y)); }
  if (kind === 'depot' || kind === 'sampler') { e.timer = 0; e.rr = 0; }
  w.ents.set(key(x, y), e);
  return null;
}

export function remove(w: World, x: number, y: number): boolean {
  const e = at(w, x, y);
  if (!e || e.kind === 'hub') return false;
  w.ents.delete(key(x, y));
  return true;
}

export function clearRecipe(e: Ent) {
  e.recipe = undefined; e.outOrder = undefined; e.inBuf = undefined; e.outBuf = undefined; e.busy = false; e.prog = 0;
}

export interface Answer {
  /** [物質id, 係数] */
  reactants: [string, number][];
  /** [物質id（読めなければ null）, 係数]。電解槽では [陰極, 陽極, …] */
  products: [string | null, number][];
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

  if (machine === 'electrolyzer' && (got[0] !== outs[0][0] || got[1] !== outs[1][0])) {
    return { ok: false, part: 'electrodes', recipe: r, message: '陰極と陽極が違う。陰極は還元、陽極は酸化が起きる。' };
  }
  if (machine === 'battery' && (a.neg !== r.neg || a.pos !== r.pos)) {
    return { ok: false, part: 'electrodes', recipe: r, message: '負極と正極が違う。負極では酸化が起きて電子が出る。正極では還元が起きる。' };
  }
  if (r.mix) {
    if (!r.inputs.every(([s, n]) => a.reactants.find(([x]) => x === s)?.[1] === n)) {
      return { ok: false, part: 'coefficients', recipe: r, message: '混ぜる比が違う。[H⁺] = Ka × [酸]/[塩] から比を計算しろ。最も簡単な整数比で入れる。' };
    }
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
export function configure(e: Ent, r: Recipe, order: string[]) {
  e.recipe = r.id;
  e.outOrder = r.machine === 'battery' ? ['e', ...order] : order;
  e.inBuf = {};
  e.outBuf = e.outOrder.map(() => 0);
  e.busy = false;
  e.prog = 0;
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

/** (x,y) へ流れ込んでくるものがあれば、その進行方向を返す。prefer の向きを優先する */
export function inflow(w: World, x: number, y: number, prefer?: Dir): Dir | null {
  const order: Dir[] = prefer === undefined ? [0, 1, 2, 3] : [prefer, ((prefer + 1) % 4) as Dir, ((prefer + 3) % 4) as Dir];
  for (const d of order) {
    const n = at(w, x - DX[d], y - DY[d]);
    if (!n) continue;
    if ((n.kind === 'belt' || n.kind === 'extractor' || n.kind === 'depot' || n.kind === 'sampler') && n.dir === d) return d;
    if (n.kind === 'analyzer' && [0, 1].some((i) => portDir(n.dir, i) === d)) return d;
    if (n.kind === 'bridge' && d === prefer) return d;
    if (n.kind === 'splitter' && [0, 1, 2].some((i) => portDir(n.dir, i) === d)) return d;
    if (n.outOrder && n.outOrder.some((_, i) => portDir(n.dir, i) === d)) return d;
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
    const d = inflow(w, x, y);
    if (d !== null) return d;
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
  w.points++;
  if (w.counts[ch] >= requiredOf(w, g)) {
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
      return true;
    case 'extractor':
    case 'depot':
    case 'sampler':
      return false;
    default: {
      const r = recipeById(t.recipe);
      if (!r || !t.inBuf) return false;
      const need = r.inputs.find(([id]) => id === s)?.[1];
      if (!need) return false;
      // 入れすぎた分はあふれて捨てる（1 本のベルトに混ぜても詰まらない）
      if ((t.inBuf[s] || 0) >= need * 4) { w.fx.push({ x, y, type: 'spill', s }); return true; }
      t.inBuf[s] = (t.inBuf[s] || 0) + 1;
      return true;
    }
  }
}

export function step(w: World, dt: number) {
  w.tick++;
  w.playMs += dt * 1000;
  if (currentGoal(w)) { const gk = `${w.chapter}:${w.progress[w.chapter]}`; w.goalMs[gk] = (w.goalMs[gk] || 0) + dt * 1000; }
  const speed = beltSpeed(w), every = extractInterval(w), rate = machineRate(w);
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
        if (e.timer >= every && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, resourceAt(e.x, e.y))) e.timer = 0;
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
        break;
      default: {
        const r = recipeById(e.recipe);
        if (!r || !e.inBuf || !e.outBuf || !e.outOrder) break;
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
            w.fx.push({ x: e.x, y: e.y, type: 'react', s: e.outOrder[0] });
            e.outOrder.forEach((s, i) => {
              e.outBuf![i] += r.outputs.find(([id]) => id === s)![1];
              discover(w, s);
            });
          }
        }
        e.outOrder.forEach((s, i) => {
          if (e.outBuf![i] <= 0) return;
          const d = portDir(e.dir, i);
          if (push(w, e.x + DX[d], e.y + DY[d], d, s)) e.outBuf![i]--;
        });
        e.stuck = !e.busy && e.outBuf.some((n) => n > 0) ? (e.stuck || 0) + dt : 0;
      }
    }
  }
}

// ---- 保存 ----

export const SAVE_VERSION = 2;

export function serialize(w: World): string {
  return JSON.stringify({
    v: SAVE_VERSION, ents: [...w.ents.values()], chapter: w.chapter, progress: w.progress, counts: w.counts, seen: w.seen,
    hubSize: w.hubSize, goalMs: w.goalMs, srs: w.srs, cleared: w.cleared, done: doneCount(w), delivered: w.delivered, stock: w.stock,
    discovered: w.discovered, learned: w.learned, mistakes: w.mistakes.slice(-400), points: w.points, up: w.up, solved: w.solved,
    playMs: Math.round(w.playMs), savedAt: Date.now(),
  });
}

export function deserialize(json: string): World | null {
  try {
    const d = JSON.parse(json);
    if (d.v !== SAVE_VERSION || !Array.isArray(d.ents)) return null;
    const w = newWorld();
    w.ents = new Map(d.ents.map((e: Ent) => [key(e.x, e.y), e]));
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

