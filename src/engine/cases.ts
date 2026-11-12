import { CHAPTERS } from '../content/goals';
import { HUB_TILES } from '../content/map';
import { recipeById } from '../content/recipes';
import { label } from '../content/substances';
import { at, clearRecipe, configure, fitAnchor, newWorld, outPort, place, poleOf, slotPort, type Dir, type Ent, type World } from './world';

/**
 * 課題：本編の工場とは別に、小さな工場を 1 つ渡して解かせる。
 *  - 修理（repair）：1 か所だけ誤った工場。止まり方や出てくる物から誤りを突き止めて直す
 *  - 限られた原料（limit）：原料の数が決まっている。どちらが先に尽きるかを計算し、できる数を先に予想する
 *  - 中身の見えない装置（box）：入れた物と出てきた物の数だけから、中の反応を当てる
 */
export type CaseKind = 'repair' | 'limit' | 'box';
export interface CaseState { done: boolean; ok: boolean; text: string }
export interface Case {
  id: string;
  kind: CaseKind;
  title: string;
  /** 何をすればよいか */
  brief: string;
  /** 解いたあとに見せる解説 */
  note: string;
  build(seed: number): World;
  check(w: World): CaseState;
  /** 正しい直し方（テストで、課題が解けることを確かめるのに使う） */
  fix?(w: World): void;
}
export const CASE_KIND: Record<CaseKind, string> = { repair: '壊れた工場を直せ', limit: '限られた原料', box: '中身の見えない装置' };
/** 初めて解いたときの研究点 */
export const CASE_REWARD = 40;

const [HX, HY] = HUB_TILES[0];

function base(): World {
  const w = newWorld();
  w.noSpill = true;
  // 道具はすべて使える。本編の指令は出さない（納品所は、届いた数を数えるだけ）
  w.seen = CHAPTERS.length - 1;
  w.progress = CHAPTERS.map((c) => c.goals.length);
  return w;
}
const feed = (w: World, x: number, y: number, dir: Dir, sub: string, left?: number): Ent => {
  place(w, 'sampler', x, y, dir);
  const e = at(w, x, y)!;
  e.sub = sub;
  if (left !== undefined) e.left = left;
  return e;
};
const belts = (w: World, x0: number, x1: number, y: number, dir: Dir = 0) => { for (let x = x0; x <= x1; x++) if (!at(w, x, y)) place(w, 'belt', x, y, dir); };
/** 空いている出口の先すべてに廃棄口を置く（設定をやり直して出口が変わっても詰まらないように） */
function vents(w: World, e: Ent) {
  for (let slot = 0; slot < 6; slot++) { const p = slotPort(e, slot); if (!at(w, p.tx, p.ty)) place(w, 'vent', p.tx, p.ty, p.d); }
}
/** 反応を設定した装置を置く。main を正面（左）の出口から出す */
function machine(w: World, x: number, y: number, recipeId: string, main?: string): Ent {
  const r = recipeById(recipeId)!;
  place(w, r.machine, x, y, 0);
  const e = at(w, x, y)!;
  set(e, recipeId, main);
  return e;
}
function set(e: Ent, recipeId: string, main?: string) {
  const r = recipeById(recipeId)!;
  const outs = r.outputs.map(([s]) => s).filter((s) => s !== 'e');
  const order = main ? [main, ...outs.filter((s) => s !== main)] : outs;
  clearRecipe(e);
  if (r.machine === 'electrolyzer') configure(e, r, order, order.map((s) => (poleOf(r, r.outputs.findIndex(([x]) => x === s)) === 'a' ? 'a' : 'c')));
  else { configure(e, r, order); e.outSlot = order.map((_, i) => [0, 2, 4, 1, 3, 5][i]); }
}
const delivered = (w: World, s: string) => w.delivered[s] || 0;
const need = (w: World, targets: string[], n: number): CaseState => {
  const done = targets.every((s) => delivered(w, s) >= n);
  return { done, ok: done, text: targets.map((s) => `${label(s)} ${Math.min(n, delivered(w, s))} / ${n}`).join('　') };
};

// ---------------- 修理 ----------------

/** 反応の選び方を誤った工場：原料 → 装置 1 台 → 納品所 */
function wrongReaction(id: string, title: string, wrong: string, right: string, target: string, feeds: string[], brief: string, note: string): Case {
  const x = HX - 3;
  return {
    id, kind: 'repair', title, brief, note,
    build() {
      const w = base();
      feeds.forEach((s, i) => feed(w, x - 1, HY + i, 0, s));
      const e = machine(w, x, HY, wrong);
      belts(w, x + 2, HX - 1, HY);
      vents(w, e);
      return w;
    },
    check: (w) => need(w, [target], 3),
    fix(w) { set(at(w, x, HY)!, right, target); },
  };
}

const REPAIRS: Case[] = [
  wrongReaction('fix-ethylene', 'エチレンが出てこない', 'ether', 'ethanol-dehydration', 'C2H4', ['C2H5OH'],
    'エタノールからエチレン C₂H₄ を作るはずの工場だが、別の物が出てくる。装置を開いて、何がおかしいかを突き止めろ。「設定をやり直す」で直せる。目的の物質は、正面の出口から出せ。',
    'エタノールと濃硫酸は、温度で生成物が変わる。130〜140 ℃ では 2 分子から水が取れてジエチルエーテル（分子間脱水）、160〜170 ℃ では 1 分子から水が取れてエチレン（分子内脱水）。'),
  wrongReaction('fix-no2', '赤褐色の気体が出てこない', 'lab-no', 'lab-no2', 'NO2', ['Cu', 'HNO3'],
    '銅と硝酸から、赤褐色の気体 NO₂ を作るはずの工場だが、無色の気体が出てくる。何がおかしいか。直したら、NO₂ を正面の出口から出せ（出口の図で入れ替えられる）。',
    '銅と希硝酸では NO（無色）、濃硝酸では NO₂（赤褐色）が発生する。3Cu + 8HNO₃ → 3Cu(NO₃)₂ + 2NO + 4H₂O と、Cu + 4HNO₃ → Cu(NO₃)₂ + 2NO₂ + 2H₂O。係数まで書けるようにしておけ。'),
  {
    id: 'fix-na', kind: 'repair', title: 'ナトリウムが取れない',
    brief: '塩化ナトリウムを電気分解して単体のナトリウムを取り出すはずの工場だが、陰極から出てくるのは別の物だ。なぜか。直したら、陰極の生成物がそのまま納品所へ流れる。',
    note: '水溶液を電気分解すると、陰極では Na⁺ ではなく水が還元されて H₂ が出る（Na はイオン化傾向が大きい）。ナトリウムの単体を得るには、水のない融解塩を電気分解する（溶融塩電解）。2NaCl → 2Na + Cl₂。',
    build() {
      const w = base(), x = HX - 5;
      feed(w, x - 1, HY, 0, 'NaCl'); feed(w, x - 1, HY + 1, 0, 'H2O');
      const e = machine(w, x, HY, 'brine-electrolysis');
      // 陰極の生成物（左手の出口）は、上の行のベルトで納品所へ
      belts(w, x, HX - 1, HY - 1);
      place(w, 'belt', HX, HY - 1, 1);
      vents(w, e);
      return w;
    },
    check: (w) => need(w, ['Na'], 3),
    fix(w) { set(at(w, HX - 5, HY)!, 'molten-nacl'); },
  },
  {
    id: 'fix-order', kind: 'repair', title: '沈殿が混ざる',
    brief: 'Ag⁺ と Cu²⁺ の混合溶液から AgCl と CuS を取り出すはずの工場だが、納品所には「混ざった沈殿」しか届かない。2 台の沈殿槽を開いて、何がおかしいかを突き止めろ。',
    note: '系統分離は、希塩酸（第 1 属：AgCl）が先、硫化水素（第 2 属：CuS）が後。先に硫化水素を通じると、Ag⁺ も Cu²⁺ も硫化物（Ag₂S・CuS、どちらも黒色）になって、いっしょに沈殿してしまう。',
    build() {
      const w = base(), x1 = HX - 9, x2 = HX - 6;
      feed(w, x1 - 1, HY, 0, 'ions:Ag.Cu');
      place(w, 'settler', x1, HY, 0); place(w, 'settler', x2, HY, 0);
      at(w, x1, HY)!.test = 'h2s-acid'; at(w, x2, HY)!.test = 'hcl';
      place(w, 'belt', x1 + 2, HY, 0);
      place(w, 'vent', x2 + 2, HY, 0);
      // 沈殿（右手の出口）は、下の行のベルトで納品所へ
      belts(w, x1 + 1, HX - 1, HY + 2);
      place(w, 'belt', HX, HY + 2, 3);
      return w;
    },
    check: (w) => need(w, ['AgCl', 'CuS'], 2),
    fix(w) { at(w, HX - 9, HY)!.test = 'hcl'; at(w, HX - 6, HY)!.test = 'h2s-acid'; },
  },
  {
    id: 'fix-ph', kind: 'repair', title: 'アラニンが出てこない',
    brief: 'グルタミン酸・アラニン・リシンの混合水溶液から、アラニンだけを正面へ取り出すはずの電気泳動槽だが、正面からは何も出てこない。何がおかしいか。',
    note: 'アラニンの等電点は 6.0。pH が等電点に等しいとき、アラニンは全体の電荷が 0 の双性イオンになって動かない。pH 1 のような強い酸性では、3 種とも陽イオンになって陰極へ動く。',
    build() {
      const w = base(), x = HX - 3;
      feed(w, x - 1, HY, 0, 'amino:Glu.Ala.Lys');
      place(w, 'phoresis', x, HY, 0);
      const e = at(w, x, HY)!;
      e.test = '1';
      belts(w, x + 2, HX - 1, HY);
      vents(w, e);
      return w;
    },
    check: (w) => need(w, ['Ala'], 3),
    fix(w) { at(w, HX - 3, HY)!.test = '6'; },
  },
  {
    id: 'fix-extract', kind: 'repair', title: '安息香酸が戻ってこない',
    brief: '安息香酸とフェノールのエーテル溶液から、安息香酸だけを水層へ移し、塩酸で元に戻して納めるはずの工場だが、下の反応器が止まっている。分液ろうとを開いて、何がおかしいかを突き止めろ。',
    note: '水酸化ナトリウム水溶液では、安息香酸もフェノールも塩になって、いっしょに水層へ移る。炭酸水素ナトリウム水溶液なら、炭酸より強い酸の安息香酸だけが反応し、炭酸より弱い酸のフェノールはエーテル層に残る。',
    build() {
      const w = base(), fx = HX - 8;
      feed(w, fx - 1, HY, 0, 'org:Bz.Ph');
      place(w, 'funnel', fx, HY, 0);
      at(w, fx, HY)!.test = 'x-naoh';
      place(w, 'vent', fx + 2, HY, 0);                         // エーテル層は捨てる
      // 水層を下の反応器へ。反応器が受け取らないものは、分配器が左右の廃棄口へ逃がす（詰まったままにならないように）
      place(w, 'splitter', fx + 1, HY + 2, 1);
      place(w, 'vent', fx, HY + 2, 2); place(w, 'vent', fx + 2, HY + 2, 0);
      const r = machine(w, fx + 1, HY + 3, 'benzoic-release', 'C6H5COOH');
      feed(w, fx, HY + 3, 0, 'HCl');
      belts(w, fx + 3, HX - 1, HY + 3);
      place(w, 'belt', HX, HY + 3, 3); place(w, 'belt', HX, HY + 2, 3);
      vents(w, r);
      return w;
    },
    check: (w) => need(w, ['C6H5COOH'], 3),
    fix(w) { at(w, HX - 8, HY)!.test = 'x-nahco3'; },
  },
];

// ---------------- 限られた原料 ----------------

const rng = (seed: number) => { let a = (seed >>> 0) || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
/** 数の決まった原料から、できる数と、反応せずに残る数 */
export function limitAnswer(recipeId: string, target: string, stock: number[]): { out: number; rest: number; runs: number } {
  const r = recipeById(recipeId)!;
  const runs = Math.min(...r.inputs.map(([, n], i) => Math.floor(stock[i] / n)));
  return { runs, out: runs * r.outputs.find(([s]) => s === target)![1], rest: r.inputs.reduce((a, [, n], i) => a + stock[i] - runs * n, 0) };
}
/** この課題の原料の数（seed ごとに変わる） */
export function limitStock(recipeId: string, seed: number): number[] {
  const r = recipeById(recipeId)!, rnd = rng(seed * 7919 + recipeId.length * 104729);
  // 反応の回数を原料ごとに別々に決め、半端も足す。どれが先に尽きるかは、計算しないとわからない
  const runs = r.inputs.map(() => 6 + Math.floor(rnd() * 8));
  if (runs.every((x) => x === runs[0])) runs[0] += 2;
  return r.inputs.map(([, n], i) => runs[i] * n + Math.floor(rnd() * n));
}
function limited(id: string, recipeId: string, target: string, note: string): Case {
  const r = recipeById(recipeId)!, x = HX - 3;
  return {
    id, kind: 'limit', title: `${r.name}：原料は数が決まっている`, note,
    brief: `原料は、試薬棚に書いてある数しかない。${label(target)} が最大でいくつできるかと、反応せずに残る原料が合わせていくつになるかを、先に計算して答えろ。答えると工場が動き、結果と照らし合わせる。`,
    build(seed) {
      const w = base(), stock = limitStock(recipeId, seed);
      r.inputs.forEach(([s], i) => feed(w, x - 1, HY + i, 0, s, stock[i]));
      const e = machine(w, x, HY, recipeId, target);
      belts(w, x + 2, HX - 1, HY);
      vents(w, e);
      return w;
    },
    check(w) {
      const stock = r.inputs.map(([s]) => [...w.ents.values()].find((e) => e.kind === 'sampler' && e.sub === s)!), e = at(w, x, HY)!;
      // はじめの数：いま棚に残る数 ＋ すでに出したぶん（運ばれている途中・装置の中・反応に使った数）
      const first = r.inputs.map(([s, n], i) => (stock[i].left || 0) + (e.inBuf?.[s] || 0) + (e.n || 0) * n + (e.busy ? n : 0) + [...w.ents.values()].reduce((sum, b) => sum + (b.item?.s === s ? b.item.n || 1 : 0), 0));
      const ans = limitAnswer(recipeId, target, first), got = delivered(w, target);
      if (!w.pred) return { done: false, ok: false, text: '先に予想を答えろ' };
      const done = got >= ans.out, ok = w.pred.out === ans.out && w.pred.rest === ans.rest;
      return { done, ok, text: done ? `できた数 ${ans.out}（予想 ${w.pred.out}）　残った原料 ${ans.rest}（予想 ${w.pred.rest}）` : `${label(target)} ${got} 個 納品済み` };
    },
  };
}
const LIMITS: Case[] = [
  limited('lim-nh3', 'haber-bosch', 'NH3', 'N₂ + 3H₂ → 2NH₃。原料それぞれを係数で割り、小さいほうが反応の回数を決める（先に尽きる原料）。もう一方は余る。入試の「過不足のある反応」は、必ずこの割り算から始める。'),
  limited('lim-so3', 'contact', 'SO3', '2SO₂ + O₂ → 2SO₃。SO₂ は 2 個で 1 回、O₂ は 1 個で 1 回。個数の多い少ないではなく、係数で割った値を比べる。'),
  limited('lim-fe', 'blast-furnace', 'Fe', 'Fe₂O₃ + 3CO → 2Fe + 3CO₂。CO は 3 個で 1 回ぶん。半端は反応できずに残る。'),
  limited('lim-no', 'ostwald-1', 'NO', '4NH₃ + 5O₂ → 4NO + 6H₂O。係数が大きい反応ほど、割り算を省くと間違える。'),
];

// ---------------- 中身の見えない装置 ----------------

function sealedBox(id: string, recipeId: string, note: string): Case {
  const r = recipeById(recipeId)!, bx = HX - 8, by = HY + 3, tx = HX - 2;
  return {
    id, kind: 'box', title: `封印された${r.machine === 'electrolyzer' ? '電解槽' : '反応器'}`, note,
    brief: '左の装置は封印されていて、中の設定が見えない。入っていく物と、出てきてタンクにたまる物の数を見て、中で起きている反応を突き止めろ。わかったら、右の空の装置に同じ反応を設定する。係数と条件まで合えば正解。',
    build() {
      const w = base();
      r.inputs.forEach(([s], i) => feed(w, bx - 1, by + i, 0, s));
      const e = machine(w, bx, by, recipeId);
      e.sealed = true;
      // 出口ごとにタンクで受ける（数が読める）
      e.outOrder!.forEach((_, i) => { const p = outPort(e, i), a = fitAnchor(w, p.tx, p.ty); if (a) { place(w, 'tank', a[0], a[1], 0); at(w, a[0], a[1])!.test = 'hold'; } });
      place(w, r.machine, tx, by, 0);
      return w;
    },
    check(w) {
      const twin = at(w, tx, by), done = twin?.recipe === recipeId;
      return { done, ok: done, text: twin?.recipe ? (done ? '同じ反応だ' : 'それは別の反応だ。出てくる物と数を見直せ') : '右の空の装置に、同じ反応を設定しろ' };
    },
    fix(w) { set(at(w, tx, by)!, recipeId); },
  };
}
const BOXES: Case[] = [
  sealedBox('box-no2', 'lab-no2', '出てくる気体が赤褐色なら NO₂、つまり濃硝酸。数の比 1 : 4 → 1 : 2 : 2 が、そのまま係数になる。'),
  sealedBox('box-ethylene', 'ethanol-dehydration', 'エタノール 1 個から、気体 1 個と水 1 個。2 個から 1 個ならエーテル、1 個から 1 個ならエチレン。数の比で分子内脱水だとわかり、温度が決まる。'),
  sealedBox('box-so3', 'contact', 'SO₂ 2 個と O₂ 1 個から、SO₃ 2 個。反応式は数の比から書ける。問われるのは触媒（V₂O₅）のほうだ。'),
  sealedBox('box-na', 'molten-nacl', '陰極から金属のナトリウムが出ている。水溶液なら陰極は H₂ になるので、これは水のない融解塩の電気分解だとわかる。'),
];

export const CASES: Case[] = [...REPAIRS, ...LIMITS, ...BOXES];
export const caseById = (id: string) => CASES.find((c) => c.id === id);
