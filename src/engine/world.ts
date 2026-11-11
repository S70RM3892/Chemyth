import { recipeById, RECIPES, CONDITIONS, electronsOf, productsOf, type MachineKind, type Recipe } from '../content/recipes';
import { HUB_AT, HUB_CENTER, HUB_DEMAND, HUB_SIZES, hubTiles, resourceAt } from '../content/map';
import { CHAPTERS, TOTAL_GOALS, type Goal } from '../content/goals';
import { hasSub, label, sub } from '../content/substances';
import { isBalanced, parseFormula } from '../chem/formula';
import { ELEMENTS } from '../content/elements';
import { isPositive, setById } from '../content/samples';
import { RESEARCH, researchById, type Research } from '../content/research';
import { agentById, refusal, settle, settleable } from '../content/ions';

/** 0:右 1:下 2:左 3:上 */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

/** 'part' は 2×2 の装置が占める残りのマス。ref が本体の位置を指す */
export type Kind = 'belt' | 'extractor' | 'vent' | 'hub' | 'splitter' | 'bridge' | 'tunnel' | 'station' | 'depot' | 'sampler' | 'analyzer' | 'sensor' | 'gate' | 'lift' | 'settler' | 'tank' | 'part' | MachineKind;
/** 2 階は、同じ x のまま y をこれだけずらした場所として持つ。隣り合うマスの計算は 1 階と同じになる */
export const FLOOR_DY = 100000;
export const floorOf = (y: number) => (y >= FLOOR_DY / 2 ? 1 : 0);
/** 階を外した y（地図の上での位置） */
export const groundY = (y: number) => y - floorOf(y) * FLOOR_DY;
/** 信号の数（1〜8 番） */
export const SIGNALS = 8;
/** 2×2 マスを占める装置。出口が 6 か所あり、奥の面が入口の目安になる */
export const BIG: Kind[] = ['separator', 'reactor', 'electrolyzer', 'battery', 'station', 'settler', 'tank'];
/** 貯蔵タンクに入る数 */
export const TANK_CAP = 200;
/** 沈殿槽が 1 回の操作にかける秒数 */
export const SETTLE_TIME = 1.2;
/** 地下ベルトが届く距離（入口から出口までのマス数） */
export const TUNNEL_RANGE = 7;
/** 貨物駅にためておける数と、列車 1 編成に積める数 */
export const STATION_CAP = 60, TRAIN_CAP = 24;
/** 路線の数 */
export const LINES = 8;
/** 1 つの積む駅が走らせられる編成の数 */
export const MAX_CARS = 3;

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
  /** 電解槽：電池の e⁻ で加速していられる残り秒数 */
  pw?: number;
  /** 貨物駅：路線の番号、積む駅か降ろす駅か、ためている物質（搬出口から出たものは先頭に '!'） */
  ch?: number;
  role?: 'in' | 'out';
  buf?: string[];
  /** 積む駅が走らせている列車。p：0 が自分の駅、1 が行き先。back：戻り。to：行き先の駅のキー */
  tr?: Train;
  /** 古いセーブの、駅ごとの線路。読み込むときに地図の線路（World.rails）へ移す */
  rail?: [number, number][];
  railTo?: string;
  /** 沈殿槽：test が試薬（src/content/ions.ts の id）、item が処理中のもの、buf がろ紙に残った固体、buf2 がろ液。
   *  貯蔵タンク：sub がためている物質、cnt と rcn が数（rcn は試薬棚や搬出口から出たぶん）、test が 'hold' なら出口を閉じている */
  buf2?: string[];
  cnt?: number;
  rcn?: number;
  /** 検知器・弁：ch が信号の番号。検知器の test は 'jam'（詰まっている間）か 'is:物質'（その物質が通ったあと 3 秒）。
   *  弁の test は 'on'（信号が来ている間だけ通す）か 'off'（来ていない間だけ通す）。
   *  昇降機：role が 'in' なら入口（もう一方の階へ送る）、'out' なら出口 */
  /** ベルト：これまでに物が入ってきた向き（ビットの並び）と、最後に入ってきた向き。2 方向以上から入るベルトが合流点になる */
  ins?: number;
  li?: Dir;
  /** 合流点のベルト：優先して通す流れの向き。なければ交互に通す */
  pri?: Dir;
  /** 積む駅：走らせる編成の数（1〜3）と、2 編成目以降の列車 */
  cars?: number;
  xtr?: Train[];
}
/** 列車。p：0 が自分の駅、1 が行き先。back：戻り。to：行き先の駅のキー。held：前の列車を待って止まっている */
export interface Train { p: number; back: boolean; cargo: string[]; wait: number; to?: string; held?: boolean }

/** 有毒な気体と、無害にする方法。捨てても罰はないが、処理の反応は入試で問われる */
export const TOXIC: Record<string, string> = {
  Cl2: '水酸化ナトリウム水溶液に吸収させる', SO2: '水酸化ナトリウム水溶液か石灰（Ca(OH)₂）に吸収させる', NO2: '水酸化ナトリウム水溶液に吸収させる',
  H2S: '水酸化ナトリウム水溶液に吸収させる', HCl: '水酸化ナトリウムで中和する', HF: '水酸化カルシウムで中和する', NH3: '硫酸に吸収させて肥料（硫安）にする',
  CO: '燃やして二酸化炭素にする', NO: '酸素で NO₂ にしてから吸収させる', Br2: '捨てずに製品として使う', O3: '捨てずに使う', HCN: '捨てずに原料として使う',
};
/** 電池の e⁻ 1 個で、電解槽が加速する秒数と、ためておける上限 */
const POWER_SEC = 2.5, POWER_MAX = 20;
/** 操業評価：指令を終えた時点の、直近 1 分の納品の速さ（個/分）で決まる */
export const GRADES: { g: 'S' | 'A' | 'B' | 'C'; min: number; bonus: number }[] = [{ g: 'S', min: 30, bonus: 30 }, { g: 'A', min: 15, bonus: 15 }, { g: 'B', min: 6, bonus: 5 }, { g: 'C', min: 0, bonus: 0 }];

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
  /** 終えた研究（src/content/research.ts の id） */
  research: string[];
  /** 設問に正解して使えるようになった、系統分離の試薬（src/content/ions.ts の id） */
  agents: string[];
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
  /** 納品所が飲み込んだ原子の数（元素ごとの累計）。納品した物質の化学式から数える */
  fed: Record<string, number>;
  /** 量産の指令：指令の物質を納めた時刻（playMs）と、求められた速さを保てている秒数。保存しない */
  rateWin: number[];
  hold: number;
  /** 信号：番号ごとの、点いていられる残り秒数。保存しない */
  sig: number[];
  /** 敷いた線路。キーはマス 'x,y'、値は 4 方向のつながり（ビット d が立っていれば、向き d の隣とつながる）。どの駅の列車も共有して走る */
  rails: Map<string, number>;
  /** 線路を敷き直すたびに増える番号（道筋の覚え書きを捨てるのに使う）。保存しない */
  railRev: number;
  /** 敷いた線路の上の列車の位置。キーは 'x,y,進む向き'。同じ向きの列車は前の列車を追い越せない。保存しない */
  occ: Map<string, { o: object; t: number }>;
  /** 複数の物質を同時に求める指令で、物質ごとに納めた数 */
  multi: Record<string, number>;
  /** そのまま捨てた有毒な気体の数（物質ごとの累計） */
  emitted: Record<string, number>;
  /** 指令ごとの操業評価（いちばん良かったもの）。キーは '章:番号' */
  grades: Record<string, string>;
  /** いま終えた指令の評価。UI に知らせたら消す。保存しない */
  lastGrade?: { g: string; rate: number; bonus: number };
  /** 直近の流れ。10 秒ごとの区切りで 5 分ぶん。保存しない */
  buckets: Bucket[];
  /** 画面効果のきっかけ。保存しない */
  fx: { x: number; y: number; type: 'react' | 'deliver' | 'spill' | 'vent'; s: string }[];
}

export const beltSpeed = (w: World) => 2 * (1 + 0.35 * w.up.belt);
/** 研究を終えているか */
export const has = (w: World, id: string) => w.research.includes(id);
export const extractInterval = (w: World) => 1 / ((1 + 0.5 * w.up.extract) * (has(w, 'intake') ? 1.5 : 1));
export const machineRate = (w: World) => (1 + 0.4 * w.up.machine) * (has(w, 'overclock') ? 1.25 : 1);
/** いちどに引けるベルトの本数 */
export const maxLanes = (w: World) => (has(w, 'lanes4') ? 4 : has(w, 'lanes3') ? 3 : 2);
export const tunnelRange = (w: World) => (has(w, 'tunnel') ? 12 : TUNNEL_RANGE);
export const stationCap = (w: World) => (has(w, 'yard') ? 120 : STATION_CAP);
export const trainCap = (w: World) => (has(w, 'heavy') ? 40 : TRAIN_CAP);
export const maxCars = (w: World) => (has(w, 'yard') ? 5 : MAX_CARS);
/** 研究の段を開くのに要る、終えた研究の数 */
export const tierNeed = (tier: number) => (tier - 1) * 2;
/** いまこの研究を始められない理由。始められるなら null */
export function researchBlock(w: World, r: Research): string | null {
  if (has(w, r.id)) return '研究済み';
  if (w.research.length < tierNeed(r.tier)) return `研究を ${tierNeed(r.tier)} 個終えると開く`;
  const miss = (r.needs ?? []).filter((id) => !has(w, id));
  if (miss.length) return `先に「${miss.map((id) => researchById(id)?.name ?? id).join('」「')}」が要る`;
  if (w.points < r.cost) return `研究点が足りない（${r.cost} 点）`;
  return null;
}
/** 研究を終える。同じ組の研究は取り消す（二者択一）。できたら true */
export function doResearch(w: World, id: string): boolean {
  const r = researchById(id);
  if (!r || researchBlock(w, r)) return false;
  w.points -= r.cost;
  if (r.group) w.research = w.research.filter((x) => researchById(x)?.group !== r.group);
  w.research.push(id);
  return true;
}
export { RESEARCH };
/** 装置 1 台が、原料が切れず出口も詰まらないときに、毎分こなせる反応の回数 */
export const reactionsPerMin = (w: World, e: Ent, r: Recipe) => (60 * machineRate(w) * ((e.pw || 0) > 0 ? 2 : 1)) / r.time;
/** 列車の速さ（マス/秒）。ベルトの強化で一緒に速くなる */
export const trainSpeed = (w: World) => 14 * (1 + 0.35 * w.up.belt) * (has(w, 'express') ? 1.5 : 1);
/** 線路の長さ：横に進んでから縦に進む、直角の道のり（マス） */
export const railLength = (a: Ent, b: Ent) => Math.max(1, Math.abs(b.x - a.x) + Math.abs(b.y - a.y));
export const pathLength = (pts: [number, number][]) => Math.max(1, pts.slice(1).reduce((a, q, i) => a + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]), 0));
/** 敷いた線路の上では、自動の仮線路より速く走れる */
export const RAIL_BOOST = 1.5;
export interface Route {
  /** 描くための折れ線（マスの中心。曲がり角だけ） */
  pts: [number, number][];
  /** 敷いた線路を通る道筋のマス。自動の線路では空 */
  tiles: [number, number][];
  dest: Ent;
  len: number;
  /** 敷いた線路を通るか */
  custom: boolean;
}
const dirBetween = (a: [number, number], b: [number, number]): number => (b[0] === a[0] + 1 && b[1] === a[1] ? 0 : b[0] === a[0] && b[1] === a[1] + 1 ? 1 : b[0] === a[0] - 1 && b[1] === a[1] ? 2 : b[0] === a[0] && b[1] === a[1] - 1 ? 3 : -1);
/** 隣り合う 2 マスを線路でつなぐ。つないだら true（すでにつながっていたら false） */
export function addRail(w: World, a: [number, number], b: [number, number]): boolean {
  const d = dirBetween(a, b);
  if (d < 0 || floorOf(a[1]) || floorOf(b[1])) return false;
  const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`, ma = w.rails.get(ka) || 0, mb = w.rails.get(kb) || 0;
  if ((ma >> d) & 1) return false;
  w.rails.set(ka, ma | (1 << d));
  w.rails.set(kb, mb | (1 << ((d + 2) % 4)));
  w.railRev++;
  return true;
}
/** そのマスの線路を取り除く。つながっていた隣からも外す */
export function removeRail(w: World, x: number, y: number): boolean {
  const m = w.rails.get(`${x},${y}`);
  if (m === undefined) return false;
  for (let d = 0; d < 4; d++) {
    if (!((m >> d) & 1)) continue;
    const nk = `${x + DX[d]},${y + DY[d]}`, nm = (w.rails.get(nk) || 0) & ~(1 << ((d + 2) % 4));
    if (nm) w.rails.set(nk, nm); else w.rails.delete(nk);
  }
  w.rails.delete(`${x},${y}`);
  w.railRev++;
  return true;
}
/** 元に戻すために、マスの線路をそのまま書き戻す */
export function setRailMask(w: World, k: string, m: number | undefined) {
  if (m) w.rails.set(k, m); else w.rails.delete(k);
  w.railRev++;
}
/** 角のマスを順に結んで線路を敷く（まっすぐな区間は自動で埋める） */
export function layRail(w: World, corners: [number, number][]) {
  for (let i = 1; i < corners.length; i++) {
    let [x, y] = corners[i - 1];
    const [tx, ty] = corners[i];
    while (x !== tx || y !== ty) {
      const nx = x !== tx ? x + Math.sign(tx - x) : x, ny = x !== tx ? y : y + Math.sign(ty - y);
      addRail(w, [x, y], [nx, ny]);
      x = nx; y = ny;
    }
  }
}
/** 駅が線路に触れているマス：駅の 4 マスと、その外周に接するマスのうち、線路があるもの */
function stationTouch(w: World, e: Ent): string[] {
  const out: string[] = [];
  for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) {
    if ((dx === -1 || dx === 2) && (dy === -1 || dy === 2)) continue; // 斜めの角は触れていない
    const k = `${e.x + dx},${e.y + dy}`;
    if (w.rails.has(k)) out.push(k);
  }
  return out;
}
const routeCache = new WeakMap<World, { rev: number; m: Map<string, Route | null> }>();
/** 駅 a から駅 b まで、敷いた線路をたどるいちばん短い道筋。つながっていなければ null */
export function railRoute(w: World, a: Ent, b: Ent): Route | null {
  let c = routeCache.get(w);
  if (!c || c.rev !== w.railRev) { c = { rev: w.railRev, m: new Map() }; routeCache.set(w, c); }
  const ck = `${a.x},${a.y}>${b.x},${b.y}`;
  const hit = c.m.get(ck);
  if (hit !== undefined) return hit ? (hit.dest === b ? hit : { ...hit, dest: b }) : null;
  let found: Route | null = null;
  const starts = w.rails.size ? stationTouch(w, a) : [], goals = new Set(starts.length ? stationTouch(w, b) : []);
  if (starts.length && goals.size) {
    // 幅優先で探す
    const prev = new Map<string, string | null>();
    let queue = starts.slice(), end: string | null = null;
    for (const k of starts) prev.set(k, null);
    search: while (queue.length) {
      const next: string[] = [];
      for (const k of queue) {
        if (goals.has(k)) { end = k; break search; }
        const m = w.rails.get(k)!, [x, y] = k.split(',').map(Number);
        for (let d = 0; d < 4; d++) {
          if (!((m >> d) & 1)) continue;
          const nk = `${x + DX[d]},${y + DY[d]}`;
          if (!prev.has(nk) && w.rails.has(nk)) { prev.set(nk, k); next.push(nk); }
        }
      }
      queue = next;
    }
    if (end) {
      const tiles: [number, number][] = [];
      for (let k: string | null = end; k; k = prev.get(k) ?? null) tiles.unshift(k.split(',').map(Number) as [number, number]);
      const full: [number, number][] = [[a.x + 1, a.y + 1], ...tiles.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]), [b.x + 1, b.y + 1]];
      // 描くときは曲がり角だけ残す
      const pts = full.filter((q, i) => i === 0 || i === full.length - 1 || !((full[i - 1][0] === q[0] && q[0] === full[i + 1][0]) || (full[i - 1][1] === q[1] && q[1] === full[i + 1][1])));
      found = { pts, tiles, dest: b, len: pathLength(full), custom: true };
    }
  }
  c.m.set(ck, found);
  return found;
}
/** 自動の仮線路：横に進んでから縦に曲がる。駅ごとに少しずらす */
function autoRoute(e: Ent, dest: Ent): Route {
  const off = ((((e.x * 7 + e.y * 13) % 5) + 5) % 5 - 2) * 0.24;
  const pts: [number, number][] = [[e.x + 1, e.y + 1 + off], [dest.x + 1 + off, e.y + 1 + off], [dest.x + 1 + off, dest.y + 1]];
  return { pts, tiles: [], dest, len: railLength(e, dest), custom: false };
}
/** 積む駅 e から降ろす駅 to（省くと、いちばん近い行き先）への線路。敷いた線路でつながっていればそれ、なければ自動の仮線路 */
export function railOf(w: World, e: Ent, to?: Ent): Route | null {
  const dest = to ?? stationRoutes(w, e)[0]?.dest;
  if (!dest || dest.kind !== 'station' || dest.role !== 'out' || dest.ch !== e.ch) return null;
  return railRoute(w, e, dest) ?? autoRoute(e, dest);
}
/** 積む駅 e の行き先すべて。敷いた線路でつながる降ろす駅があれば、そこだけへ送る（分岐点で枝分かれする）。
 *  1 つもつながっていなければ、同じ番線のすべての降ろす駅へ、自動の仮線路で送る */
export function stationRoutes(w: World, e: Ent): Route[] {
  const ts = stationTargets(w, e);
  const laid = ts.map((d) => railRoute(w, e, d)).filter((r): r is Route => !!r);
  return laid.length ? laid : ts.map((d) => autoRoute(e, d));
}

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
export const requiredOf = (w: World, g: Goal) => (g.strict || g.rate ? g.n : Math.ceil(g.n * HUB_DEMAND[hubLevel(w)]));
/** 量産の指令で、納品の速さを数える時間の幅（秒） */
export const RATE_WINDOW = 20;
/** 量産の指令：直近 RATE_WINDOW 秒の納品から求めた、いまの速さ（個/分） */
export const goalRate = (w: World) => (w.rateWin.filter((t) => t >= w.playMs - RATE_WINDOW * 1000).length * 60) / RATE_WINDOW;
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
  w.rateWin = []; w.hold = 0;
  w.seen = Math.max(w.seen, w.chapter);
}
/** 道具が使えるか */
export const toolUnlocked = (w: World, need: { done?: number; chapter?: number; research?: string }) =>
  need.research !== undefined ? has(w, need.research)
    : (need.done === undefined && need.chapter === undefined) || (need.done !== undefined && doneCount(w) >= need.done) || (need.chapter !== undefined && w.seen >= need.chapter);

export function newWorld(): World {
  const w: World = {
    ents: new Map(), chapter: 0, progress: CHAPTERS.map(() => 0), counts: CHAPTERS.map(() => 0), seen: 0, hubSize: 2, goalMs: {}, srs: {}, cleared: [], delivered: {}, stock: {},
    discovered: ['air', 'seawater'], learned: [], mistakes: [], points: 0,
    up: { extract: 0, belt: 0, machine: 0 }, research: [], agents: [], solved: [], practice: {}, made: {}, vented: {}, spilled: {}, emitted: {}, grades: {}, fed: {}, multi: {}, rateWin: [], hold: 0, sig: [], rails: new Map(), railRev: 0, occ: new Map(), buckets: [], playMs: 0, tick: 0, events: [], fx: [],
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
  if (floorOf(y) === 1 && (kind === 'extractor' || kind === 'station')) return kind === 'extractor' ? '採取機は 1 階にしか置けない。採ったものを昇降機で上げろ' : '貨物駅は 1 階にしか置けない';
  const e: Ent = { kind, x, y, dir };
  if (kind === 'lift') {
    // 昇降機は 2 つで 1 組：置いた側が入口、もう一方の階の同じ場所が出口
    const oy = y + (floorOf(y) ? -FLOOR_DY : FLOOR_DY);
    if (w.ents.has(key(x, oy))) return 'もう一方の階の同じ場所がふさがっている';
    e.item = null; e.role = 'in';
    w.ents.set(key(x, oy), { kind: 'lift', x, y: oy, dir, item: null, role: 'out' });
  }
  if (kind === 'settler') { e.item = null; e.buf = []; e.buf2 = []; }
  if (kind === 'tank') { e.cnt = 0; e.rcn = 0; e.timer = 0; e.rr = 0; }
  if (kind === 'sensor') { e.item = null; e.ch = 1; e.test = 'jam'; }
  if (kind === 'gate') { e.item = null; e.ch = 1; e.test = 'on'; }
  if (big) e.big = true;
  if (kind === 'belt' || kind === 'splitter' || kind === 'analyzer') e.item = null;
  if (kind === 'splitter') e.rr = 0;
  if (kind === 'bridge') e.items = [null, null];
  if (kind === 'tunnel') e.item = null;
  if (kind === 'station') { e.buf = []; e.ch = 1; e.role = 'in'; e.timer = 0; e.rr = 0; }
  if (kind === 'extractor') { e.timer = 0; discover(w, resourceAt(x, y)); }
  if (kind === 'depot' || kind === 'sampler') { e.timer = 0; e.rr = 0; }
  put(w, e);
  return null;
}

export function remove(w: World, x: number, y: number): boolean {
  const e = at(w, x, y);
  if (!e || e.kind === 'hub') return false;
  for (const [fx, fy] of footprint(e.x, e.y, sizeOf(e))) w.ents.delete(key(fx, fy));
  if (e.kind === 'lift') { const p = liftPartner(w, e); if (p) w.ents.delete(key(p.x, p.y)); }
  return true;
}
/** 昇降機の相方（もう一方の階の同じ場所） */
export function liftPartner(w: World, e: Ent): Ent | undefined {
  const p = w.ents.get(key(e.x, e.y + (floorOf(e.y) ? -FLOOR_DY : FLOOR_DY)));
  return p?.kind === 'lift' ? p : undefined;
}
/** 信号 ch が点いているか */
export const signalOn = (w: World, ch: number | undefined) => (w.sig[ch || 1] || 0) > 0;

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
    const wrong = outs.filter(([s], i) => {
      const want = poleOf(r, i);
      return want !== 'x' && (a.poles?.[got.indexOf(s)] ?? 'c') !== want;
    }).map(([s]) => s);
    if (wrong.length) {
      // どれが違うのかと、考え方を伝える。気体や金属は酸化・還元で、酸と塩基は H⁺・OH⁻ がどちらの極でできるかで決まる
      const names = wrong.map((s) => label(s)).join('、');
      const f = (s: string) => sub(s).formula ?? '';
      const base = wrong.some((s) => /^(Na|K)OH$/.test(f(s))), acid = wrong.some((s) => /^H(2SO4|NO3|Cl)$/.test(f(s)));
      const why = base ? '塩基は OH⁻ が生じる極の側にできる。OH⁻ が生じるのは、水が電子を受け取る反応（2H₂O + 2e⁻ → H₂ + 2OH⁻）が起きる極だ。'
        : acid ? '酸は H⁺ が生じる極の側にできる。H⁺ が生じるのは、水が電子を失う反応（2H₂O → O₂ + 4H⁺ + 4e⁻）が起きる極だ。'
        : '陰極では還元（電子を受け取る）、陽極では酸化（電子を失う）が起きる。';
      return { ok: false, part: 'electrodes', recipe: r, message: `物質の種類と数は合っている。${names} を書く極が違う。${why}` };
    }
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
export const machineState = (e: Ent): 0 | 1 | 2 => (e.busy ? 0 : outputBlocked(e) ? 2 : 1);

/** 出口に 1 回ぶん以上たまっている生成物があるか。あるうちは、次の反応を始められない */
export function outputBlocked(e: Ent, r = recipeById(e.recipe)): boolean {
  if (!r || !e.outBuf || !e.outOrder) return false;
  return e.outOrder.some((s, i) => e.outBuf![i] >= (r.outputs.find(([id]) => id === s)?.[1] ?? 1));
}

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
    case 'belt': case 'extractor': case 'depot': case 'sampler': case 'sensor': case 'gate': return n.dir === d;
    case 'lift': return n.role === 'out' && n.dir === d;
    // 沈殿槽：ろ液は正面（左）、固体は右手（手前）から出る。タンク：正面の 2 つの口
    case 'settler': return !!n.test && [0, 2].some((i) => { const p = slotPort(n, i); return p.d === d && p.tx === x && p.ty === y; });
    case 'tank': return [0, 1].some((i) => { const p = slotPort(n, i); return p.d === d && p.tx === x && p.ty === y; });
    case 'analyzer': return [0, 1].some((i) => portDir(n.dir, i) === d);
    case 'splitter': return [0, 1, 2].some((i) => portDir(n.dir, i) === d);
    case 'bridge': return through(w, n, d, depth + 1);
    // 地下ベルトは、先に出口があれば地下へもぐる。なければそこが出口で、地上へ出す
    case 'tunnel': return n.dir === d && !tunnelPair(w, n);
    case 'station': return n.role === 'out' && [0, 1].some((i) => { const p = slotPort(n, i); return p.d === d && p.tx === x && p.ty === y; });
    default: return !!n.outOrder && n.outOrder.some((_, i) => { const p = outPort(n, i); return p.d === d && p.tx === x && p.ty === y; });
  }
}

/** 地下ベルトの入口 e から見た出口：同じ向きの、いちばん近い地下ベルト */
export function tunnelPair(w: World, e: Ent): Ent | null {
  for (let k = 1, R = tunnelRange(w); k <= R; k++) {
    const n = at(w, e.x + DX[e.dir] * k, e.y + DY[e.dir] * k);
    if (n && n.kind === 'tunnel' && n.dir === e.dir) return n;
  }
  return null;
}
/** 積む駅 e とつながる降ろす駅：同じ路線のものを、近い順に */
export function stationTargets(w: World, e: Ent): Ent[] {
  const out: Ent[] = [];
  for (const n of w.ents.values()) if (n.kind === 'station' && n.role === 'out' && n.ch === e.ch) out.push(n);
  const d = (n: Ent) => Math.abs(n.x - e.x) + Math.abs(n.y - e.y);
  return out.sort((a, b) => d(a) - d(b) || a.x - b.x || a.y - b.y);
}
/** いちばん近い降ろす駅 */
export const stationTarget = (w: World, e: Ent): Ent | null => stationTargets(w, e)[0] ?? null;

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
    // 地下ベルトの 2 つ目は、手前にある入口と同じ向きにそろえる
    if (kind === 'tunnel') for (const d of [0, 1, 2, 3] as Dir[]) for (let k = 1, R = tunnelRange(w); k <= R; k++) {
      const n = at(w, x - DX[d] * k, y - DY[d] * k);
      if (n && n.kind === 'tunnel' && n.dir === d) return d;
    }
    for (const [fx, fy] of footprint(x, y, BIG.includes(kind) ? 2 : 1)) {
      const d = inflow(w, fx, fy);
      if (d !== null) return d;
    }
  }
  const dx = HUB_CENTER[0] - (x + 0.5), dy = HUB_CENTER[1] - (groundY(y) + 0.5);
  return (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3) as Dir;
}

function deliver(w: World, s: string, x: number, y: number, rc?: boolean) {
  w.stock[s] = (w.stock[s] || 0) + 1;
  discover(w, s);
  w.fx.push({ x, y, type: 'deliver', s });
  if (rc) return; // 搬出口や試薬棚から出して納めただけのものは数えない
  w.delivered[s] = (w.delivered[s] || 0) + 1;
  bucket(w).deliver++;
  feed(w, s);
  const g = currentGoal(w), ch = w.chapter;
  if (!g) return;
  if (g.rate) {
    // 量産：数ではなく速さで決まる。納めた時刻だけ記録し、判定は step で行う
    if (g.s !== s) return;
    w.rateWin.push(w.playMs);
    w.points++;
    bucket(w).goal++;
    return;
  }
  if (g.also) {
    // 複数の物質を同時に求める指令：どれも必要な数に達したら達成。いちばん遅れているものが進み具合になる
    const all = [g.s, ...g.also], need = requiredOf(w, g);
    if (!all.includes(s)) return;
    if ((w.multi[s] || 0) < need) { w.multi[s] = (w.multi[s] || 0) + 1; w.points++; bucket(w).goal++; }
    w.counts[ch] = Math.min(...all.map((x) => w.multi[x] || 0));
    if (w.counts[ch] >= need) { w.multi = {}; finishGoal(w, g, ch); }
    return;
  }
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
  if (w.counts[ch] >= requiredOf(w, g)) finishGoal(w, g, ch);
}

/** 納品所が飢えている元素の段階：原子をこの数だけ飲み込むと、その元素の段階が上がる */
export const FEED_TIERS = [10, 100, 1000];
const FEED_BONUS = [10, 30, 100];
export const fedTier = (w: World, sym: string) => FEED_TIERS.filter((n) => (w.fed[sym] || 0) >= n).length;
/** 納めた物質に含まれる原子を、元素ごとに数える */
function feed(w: World, s: string) {
  const su = sub(s);
  let atoms: Record<string, number> = {};
  try { if (su.formula) atoms = parseFormula(su.formula); else for (const el of su.rep ?? []) atoms[el] = (atoms[el] || 0) + 1; } catch { return; }
  for (const el in atoms) {
    if (!ELEMENTS.some((e) => e.sym === el)) continue;
    const before = fedTier(w, el);
    w.fed[el] = (w.fed[el] || 0) + atoms[el];
    const after = fedTier(w, el);
    if (after > before) {
      w.points += FEED_BONUS[after - 1];
      w.events.push(`fed:${el}:${after}`);
      if (after === 1 && ELEMENTS.every((e) => fedTier(w, e.sym) >= 1)) { w.points += 300; w.events.push('fed-all'); }
    }
  }
}

function finishGoal(w: World, g: Goal, ch: number) {
  w.rateWin = []; w.hold = 0;
  {
    // 操業評価：仕分けの指令は速さを競うものではないので付けない
    if (!g.strict) {
      const rate = flowStats(w).goalPerMin, gr = GRADES.find((x) => rate >= x.min)!, gk = `${ch}:${w.progress[ch]}`;
      const rank = (x?: string) => (x ? 'SABC'.indexOf(x) : 9);
      if (rank(gr.g) < rank(w.grades[gk])) w.grades[gk] = gr.g;
      w.points += gr.bonus;
      w.lastGrade = { g: gr.g, rate, bonus: gr.bonus };
    } else w.lastGrade = undefined;
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

/** ベルト t の手前（向き q で流れ込む側）に、じきに入ってくる物があるか。near は、どこまで進んでいれば数えるか（0〜1） */
function waiting(w: World, t: Ent, q: Dir, near: number): boolean {
  const n = at(w, t.x - DX[q], t.y - DY[q]);
  if (!n) return false;
  switch (n.kind) {
    case 'belt': case 'sensor': case 'gate': return n.dir === q && !!n.item && n.item.p >= near;
    case 'tunnel': return n.dir === q && !!n.item && n.item.p >= near && !tunnelPair(w, n);
    case 'bridge': return !!n.items?.some((it, a) => !!it && it.p >= near && (it.d ?? a) === q);
    case 'splitter': case 'analyzer': return !!n.item && n.item.p >= near;
    default: return false;
  }
}
/** 合流点 t に向き d で入ろうとしている物が、ほかの流れに道をゆずるべきか */
function yields(w: World, t: Ent, d: Dir): boolean {
  const live = (q: number) => ((t.ins! >> q) & 1) === 1 && t.dir !== (q + 2) % 4;
  // 優先：優先する流れの手前のマスに物があるうちは、ほかは待つ（流れているベルトは、詰まっていても 1 マスごとにわずかな間が空くので、着く前でも数える）
  if (t.pri !== undefined && live(t.pri)) return t.pri !== d && waiting(w, t, t.pri, 0);
  // 交互：続けて同じ向きから入ろうとしていて、ほかの流れがすぐそこまで来ていれば、ゆずる
  if (t.li !== d) return false;
  for (const q of [0, 1, 2, 3] as Dir[]) if (q !== d && live(q) && waiting(w, t, q, 0.5)) return true;
  return false;
}
/** 合流点のベルトに流れ込んでいる向き */
export const mergeDirs = (e: Ent): Dir[] => ([0, 1, 2, 3] as Dir[]).filter((q) => ((e.ins || 0) >> q) & 1 && e.dir !== (q + 2) % 4);

/** (x,y) のマスへ、向き d で物質 s を押し込む */
function push(w: World, x: number, y: number, d: Dir, s: string, rc?: boolean): boolean {
  const t = at(w, x, y);
  if (!t) return false;
  switch (t.kind) {
    case 'belt':
      if (t.item || t.dir === (d + 2) % 4) return false;
      // 合流点（2 方向以上から入るベルト）：交互に通すか、決めた向きを優先して通す
      if (t.ins && t.ins & (t.ins - 1) && yields(w, t, d)) return false;
      t.ins = (t.ins || 0) | (1 << d); t.li = d;
      t.item = { s, p: 0, m: w.tick, rc };
      t.st = s === 'e' ? 'gas' : sub(s).state;
      return true;
    case 'splitter':
    case 'analyzer':
      if (t.item) return false;
      t.item = { s, p: 0, m: w.tick, rc };
      return true;
    case 'sensor':
    case 'gate':
      if (t.item || t.dir === (d + 2) % 4) return false;
      t.item = { s, p: 0, m: w.tick, rc };
      return true;
    case 'lift':
      if (t.role !== 'in' || t.item || t.dir === (d + 2) % 4) return false;
      t.item = { s, p: 0, m: w.tick, rc };
      return true;
    case 'settler': {
      // 沈殿槽：混合溶液か、分け直せるまじりの沈殿だけを受け取る。試薬を決めるまでは動かない
      const a = agentById(t.test);
      if (!a || !settleable(s) || refusal(s, a)) { t.bad = s; t.badT = w.tick; return false; }
      if (t.item) return false;
      t.item = { s, p: 0, m: w.tick };
      return true;
    }
    case 'tank': {
      // 貯蔵タンク：1 種類だけをためる。別の物質は、空になるまで受け取らない
      const n = (t.cnt || 0) + (t.rcn || 0);
      if (n > 0 && t.sub !== s) { t.bad = s; t.badT = w.tick; return false; }
      if (n >= TANK_CAP) return false;
      t.sub = s;
      if (rc) t.rcn = (t.rcn || 0) + 1; else t.cnt = (t.cnt || 0) + 1;
      return true;
    }
    case 'tunnel':
      if (t.item || d !== t.dir) return false;
      t.item = { s, p: 0, m: w.tick, rc };
      return true;
    case 'station':
      if (t.role !== 'in' || (t.buf ??= []).length >= stationCap(w)) return false;
      t.buf.push(rc ? '!' + s : s);
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
      // 有毒な気体も、そのまま捨ててよい。数だけ記録する
      if (TOXIC[s]) bump(w.emitted, s);
      w.fx.push({ x, y, type: 'vent', s });
      return true;
    case 'extractor':
    case 'depot':
    case 'sampler':
      return false;
    default: {
      const r = recipeById(t.recipe);
      if (!r || !t.inBuf) return false;
      // 電解槽は、電池の e⁻ を受け取ると、そのあいだ 2 倍の速さで動く
      if (s === 'e' && r.machine === 'electrolyzer') {
        if ((t.pw || 0) > POWER_MAX - POWER_SEC) return false;
        t.pw = (t.pw || 0) + POWER_SEC;
        return true;
      }
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
  // 量産の指令：求められた速さを保てている間だけ時間が進み、下回ると倍の速さで戻る
  const rg = currentGoal(w);
  if (rg?.rate) {
    while (w.rateWin.length && w.rateWin[0] < w.playMs - RATE_WINDOW * 1000) w.rateWin.shift();
    w.hold = goalRate(w) >= rg.rate ? w.hold + dt : Math.max(0, w.hold - dt * 2);
    w.counts[w.chapter] = Math.floor(w.hold);
    if (w.hold >= rg.n) finishGoal(w, rg, w.chapter);
  }
  if (currentGoal(w)) { const gk = `${w.chapter}:${w.progress[w.chapter]}`; w.goalMs[gk] = (w.goalMs[gk] || 0) + dt * 1000; }
  for (let i = 1; i <= SIGNALS; i++) if (w.sig[i] > 0) w.sig[i] = Math.max(0, w.sig[i] - dt);
  // 列車の位置の覚え書きは、古いものをときどき捨てる
  if (w.tick % 600 === 0 && w.occ.size) for (const [k, o] of w.occ) if (o.t < w.tick - 2) w.occ.delete(k);
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
        // 'is:物質' は選別：その物質だけを正面へ通す
        const d = portDir(e.dir, (e.test.startsWith('is:') ? it.s === e.test.slice(3) : isPositive(it.s, e.test)) ? 0 : 1);
        if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc)) e.item = null;
        break;
      }
      case 'sensor': {
        // 検知器：ベルトのように正面へ流しながら、様子を信号にする
        const it = e.item;
        if (!it) { e.stuck = 0; break; }
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc)) {
          if (e.test === `is:${it.s}`) w.sig[e.ch || 1] = Math.max(w.sig[e.ch || 1] || 0, 3);
          e.item = null; e.stuck = 0;
        } else {
          e.stuck = (e.stuck || 0) + dt;
          if (e.test === 'jam' && e.stuck > 0.6) w.sig[e.ch || 1] = Math.max(w.sig[e.ch || 1] || 0, 0.5);
        }
        break;
      }
      case 'gate': {
        // 弁：信号が来ている間だけ（または来ていない間だけ）通す
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        if (signalOn(w, e.ch) === (e.test !== 'off') && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc)) e.item = null;
        break;
      }
      case 'settler': {
        const a = agentById(e.test), solids = (e.buf ??= []), liquids = (e.buf2 ??= []);
        if (e.bad && w.tick - (e.badT || 0) > 45) e.bad = undefined;
        if (a && e.item && !e.busy && !solids.length && !liquids.length) { e.busy = true; e.prog = 0; }
        if (a && e.busy && e.item) {
          e.prog = (e.prog || 0) + (dt * rate) / SETTLE_TIME;
          if (e.prog >= 1) {
            const r = settle(e.item.s, a);
            if (r.solid) { solids.push(r.solid); discover(w, r.solid); if (r.solid !== e.item.s) { bump(w.made, r.solid); bucket(w).made++; } }
            if (r.liquid) { liquids.push(r.liquid); discover(w, r.liquid); }
            w.fx.push({ x: e.x + 0.5, y: e.y + 0.5, type: 'react', s: r.solid ?? r.liquid ?? e.item.s });
            e.item = null; e.busy = false; e.prog = 0; e.n = (e.n || 0) + 1;
          }
        }
        // ろ液は正面（左）、固体は右手（手前）へ
        if (liquids.length) { const p = slotPort(e, 0); if (push(w, p.tx, p.ty, p.d, liquids[0])) liquids.shift(); }
        if (solids.length) { const p = slotPort(e, 2); if (push(w, p.tx, p.ty, p.d, solids[0])) solids.shift(); }
        e.stuck = !e.busy && (solids.length || liquids.length) ? (e.stuck || 0) + dt : 0;
        break;
      }
      case 'tank': {
        if (e.bad && w.tick - (e.badT || 0) > 45) e.bad = undefined;
        e.timer = (e.timer || 0) + dt;
        const n = (e.cnt || 0) + (e.rcn || 0);
        if (!n || !e.sub || e.test === 'hold' || e.timer < every * 0.4) break;
        // 正面の 2 つの口から交互に出す。試薬棚や搬出口から来たぶんを先に出す
        const rc = (e.rcn || 0) > 0;
        for (let k = 0; k < 2; k++) {
          const i = ((e.rr || 0) + k) % 2, p = slotPort(e, i);
          if (push(w, p.tx, p.ty, p.d, e.sub, rc)) { if (rc) e.rcn!--; else e.cnt!--; e.rr = (i + 1) % 2; e.timer = 0; break; }
        }
        break;
      }
      case 'lift': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        if (e.role === 'in') { const p = liftPartner(w, e); if (p && !p.item) { p.item = { s: it.s, p: 0, m: w.tick, rc: it.rc }; e.item = null; } }
        else if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc)) e.item = null;
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
      case 'tunnel': {
        const it = e.item;
        if (!it) break;
        const pair = tunnelPair(w, e);
        const dist = pair ? Math.abs(pair.x - e.x) + Math.abs(pair.y - e.y) : 1;
        it.p = Math.min(1, it.p + (speed * dt) / dist);
        if (it.p < 1 || it.m === w.tick) break;
        if (pair) { if (!pair.item) { pair.item = { s: it.s, p: 0, m: w.tick, rc: it.rc }; e.item = null; } }
        else if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc)) e.item = null;
        break;
      }
      case 'station': {
        const buf = (e.buf ??= []);
        if (e.role === 'out') {
          // 降ろす駅：ためたものを、正面の 2 つの口から交互に出す
          e.timer = (e.timer || 0) + dt;
          if (!buf.length || e.timer < every * 0.4) break;
          for (let k = 0; k < 2; k++) {
            const i = ((e.rr || 0) + k) % 2, p = slotPort(e, i), rc = buf[0].startsWith('!');
            if (push(w, p.tx, p.ty, p.d, rc ? buf[0].slice(1) : buf[0], rc)) { buf.shift(); e.rr = (i + 1) % 2; e.timer = 0; e.n = (e.n || 0) + 1; break; }
          }
          break;
        }
        // 積む駅：列車を走らせる。編成は 3 つまで増やせる。降ろす駅がいくつもあれば、順番に配る（分岐）
        const trains = [(e.tr ??= { p: 0, back: false, cargo: [], wait: 0 }), ...(e.xtr ??= [])];
        while (trains.length < Math.min(maxCars(w), e.cars || 1)) { const t2 = { p: 0, back: false, cargo: [], wait: 0 }; e.xtr.push(t2); trains.push(t2); }
        // 減らしたときは、駅に戻っている空の編成から外す
        while (e.xtr.length > Math.max(0, Math.min(maxCars(w), e.cars || 1) - 1)) { const k = e.xtr.findIndex((t2) => t2.p <= 0 && !t2.back && !t2.cargo.length); if (k < 0) break; e.xtr.splice(k, 1); }
        for (const tr of [e.tr, ...e.xtr]) {
          if (tr.p <= 0 && !tr.back) {
            while (tr.cargo.length < trainCap(w) && buf.length) tr.cargo.push(buf.shift()!);
            tr.wait += dt;
            // 満載か、少し待っても増えなければ発車する
            if (tr.cargo.length && (tr.cargo.length >= trainCap(w) || tr.wait > 2.5)) {
              const rs = stationRoutes(w, e);
              if (rs.length) { e.rr = ((e.rr || 0) + 1) % rs.length; const to = rs[e.rr].dest; tr.to = key(to.x, to.y); tr.p = 1e-6; tr.wait = 0; }
            }
            continue;
          }
          const dest = tr.to ? w.ents.get(tr.to) : undefined;
          const ok = !!dest && dest.kind === 'station' && dest.role === 'out' && dest.ch === e.ch;
          if (!ok) tr.back = true; // 行き先がなくなった：引き返す
          const route = ok ? railOf(w, e, dest) : null;
          const v = (trainSpeed(w) * (route?.custom ? RAIL_BOOST : 1) * dt) / (route?.len ?? 12);
          // 敷いた線路は、ほかの駅の列車と共有する。同じ向きに走る前の列車がすぐ先にいれば、止まって待つ
          const tiles = route?.custom ? route.tiles : null, n = tiles?.length ?? 0;
          const idx = (p: number) => Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))));
          const dirAt = (i: number, fwd: boolean) => { if (n < 2) return 0; const k = Math.max(0, Math.min(n - 2, fwd ? i : i - 1)), d = dirBetween(tiles![k], tiles![k + 1]); return fwd ? d : (d + 2) % 4; };
          let held = false;
          if (tiles && n) {
            const i = idx(tr.p), fwd = !tr.back;
            for (const j of fwd ? [i + 1, i + 2] : [i - 1, i - 2]) {
              if (j < 0 || j >= n) continue;
              const o = w.occ.get(`${tiles[j][0]},${tiles[j][1]},${dirAt(j, fwd)}`);
              if (o && o.o !== tr && o.t >= w.tick - 1) held = true;
            }
          }
          tr.held = held || undefined;
          if (!tr.back) {
            if (!held) tr.p = Math.min(1, tr.p + v);
            if (tr.p >= 1) {
              const db = (dest!.buf ??= []);
              while (tr.cargo.length && db.length < stationCap(w)) db.push(tr.cargo.shift()!);
              if (!tr.cargo.length) { tr.back = true; e.n = (e.n || 0) + 1; }
            }
          } else {
            if (!held) tr.p = Math.max(0, tr.p - v);
            if (tr.p <= 0) { tr.p = 0; tr.back = false; if (tr.cargo.length) buf.unshift(...tr.cargo.splice(0)); }
          }
          if (tiles && n && (tr.p > 0 || tr.back)) { const i = idx(tr.p); w.occ.set(`${tiles[i][0]},${tiles[i][1]},${dirAt(i, !tr.back)}`, { o: tr, t: w.tick }); }
        }
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
          // 出口に 1 回ぶん以上たまっている生成物があるうちは、次の反応を始めない（副生成物を放置すると詰まる）。
          // 1 回に何個もできる生成物は、出し切る前でも残りが 1 回ぶん未満になれば次へ進む。そうしないと、
          // ベルトへ 1 個ずつ出している間ずっと止まり、装置の能力の半分しか出ない
          if (!outputBlocked(e, r) && r.inputs.every(([s, n]) => (e.inBuf![s] || 0) >= n)) {
            for (const [s, n] of r.inputs) e.inBuf[s] -= n;
            e.busy = true;
            e.prog = 0;
          }
        } else {
          e.prog = (e.prog || 0) + (dt * rate * ((e.pw || 0) > 0 ? 2 : 1)) / r.time;
          if (e.pw) e.pw = Math.max(0, e.pw - dt);
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
        e.stuck = !e.busy && outputBlocked(e, r) ? (e.stuck || 0) + dt : 0;
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
    rails: [...w.rails], hubSize: w.hubSize, goalMs: w.goalMs, srs: w.srs, cleared: w.cleared, done: doneCount(w), delivered: w.delivered, stock: w.stock,
    discovered: w.discovered, learned: w.learned, mistakes: w.mistakes.slice(-400), points: w.points, up: w.up, solved: w.solved, research: w.research, agents: w.agents, practice: w.practice, made: w.made, vented: w.vented, spilled: w.spilled, emitted: w.emitted, grades: w.grades, fed: w.fed, multi: w.multi,
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
    if (Array.isArray(d.rails)) for (const row of d.rails) if (Array.isArray(row) && typeof row[0] === 'string' && Number.isInteger(row[1]) && row[1] > 0 && row[1] < 16) w.rails.set(row[0], row[1]);
    // 古いセーブ：駅ごとに持っていた線路を、地図の線路へ移す
    for (const e of w.ents.values()) {
      if (e.rail && e.rail.length >= 2) layRail(w, e.rail.map(([x, y]) => [Math.floor(x), Math.floor(y)] as [number, number]));
      e.rail = undefined; e.railTo = undefined;
      for (const t2 of [e.tr, ...(e.xtr ?? [])]) if (t2) t2.held = undefined;
    }
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
    w.agents = Array.isArray(d.agents) ? d.agents.filter((x: unknown) => typeof x === 'string') : [];
    w.research = (Array.isArray(d.research) ? d.research : []).filter((id: string) => RESEARCH.some((r) => r.id === id));
    w.practice = d.practice || {};
    w.made = d.made || {};
    w.vented = d.vented || {};
    w.spilled = d.spilled || {};
    w.emitted = d.emitted || {};
    w.grades = d.grades || {};
    w.fed = d.fed || {};
    w.multi = d.multi || {};
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

