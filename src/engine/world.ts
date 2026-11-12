import { capByExams, dayKey, dayNum, firstCard, gradeOf, migrate, review, RETENTION, RETENTIONS, type Card, type Confidence, type Grade } from './fsrs';
import { recipeById, RECIPES, CONDITIONS, electronsOf, productsOf, type MachineKind, type Recipe } from '../content/recipes';
import { HUB_AT, HUB_CENTER, HUB_DEMAND, HUB_SIZES, hubTiles, resourceAt } from '../content/map';
import { CHAPTERS, TOTAL_GOALS, type Goal } from '../content/goals';
import { hasSub, label, sub } from '../content/substances';
import { isBalanced, parseFormula } from '../chem/formula';
import { ELEMENTS } from '../content/elements';
import { isPositive, setById } from '../content/samples';
import { RESEARCH, researchById, type Research } from '../content/research';
import { FLAMES } from '../content/looks';
import { isSep, sepAccepts, sepReady, sepRefusal, sepRun, sepSlots } from '../content/sep';
import { newStudy, readStudy, type Study } from './study';

/** 0:右 1:下 2:左 3:上 */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

/** 'part' は 2×2 の装置が占める残りのマス。ref が本体の位置を指す */
export type Kind = 'belt' | 'extractor' | 'vent' | 'hub' | 'splitter' | 'bridge' | 'tunnel' | 'station' | 'depot' | 'sampler' | 'analyzer' | 'sensor' | 'gate' | 'lift' | 'settler' | 'funnel' | 'phoresis' | 'tank' | 'part' | MachineKind;
/** 2 階は、同じ x のまま y をこれだけずらした場所として持つ。隣り合うマスの計算は 1 階と同じになる */
export const FLOOR_DY = 100000;
export const floorOf = (y: number) => (y >= FLOOR_DY / 2 ? 1 : 0);
/** 階を外した y（地図の上での位置） */
export const groundY = (y: number) => y - floorOf(y) * FLOOR_DY;
/** 路線番号・信号の番号の上限。数に限りはないのと同じだが、設備に描く数字が 4 桁に収まるようにしてある */
export const LINE_MAX = 9999;
/** 番号として使える値に直す（1 〜 LINE_MAX の整数） */
export const lineNo = (n: number) => Math.max(1, Math.min(LINE_MAX, Math.floor(n) || 1));
/** 使われていない、いちばん小さい番号 */
export function freeLine(used: Iterable<number>): number {
  const u = new Set(used);
  for (let n = 1; n <= LINE_MAX; n++) if (!u.has(n)) return n;
  return LINE_MAX;
}
/** 2×2 マスを占める装置。出口が 6 か所あり、奥の面が入口の目安になる */
export const BIG: Kind[] = ['separator', 'reactor', 'electrolyzer', 'battery', 'station', 'settler', 'funnel', 'phoresis', 'tank'];
/** 貯蔵タンクに入る数 */
export const TANK_CAP = 2000;
/** 沈殿槽が 1 回の操作にかける秒数 */
export const SETTLE_TIME = 1.2;
/** 地下ベルトが届く距離（入口から出口までのマス数） */
export const TUNNEL_RANGE = 7;
/** 貨物駅にためておける数と、列車 1 編成に積める数 */
export const STATION_CAP = 600, TRAIN_CAP = 240;
/** 1 つの積む駅が走らせられる編成の数 */
export const MAX_CARS = 3;

/** 流れている物質。p は 0〜1 の進み具合、m は最後に動いた tick、rc は搬出口から出た印 */
/** ベルトの上の荷。n は個数（省けば 1 個）。同じ物質は、ひとまとめの荷として運ばれる */
export interface Item { s: string; p: number; m: number; rc?: boolean; d?: Dir; n?: number; /** 先へ進めずに待っている時間（秒） */ w?: number }
/** 1 つの荷にまとめられる個数の上限（表示が 2 桁に収まる数） */
export const STACK_MAX = 99;
/** 出口がふさがっている間、出すものをためておける量（ベルトが 1 マス進む時間の何倍ぶんか）。
 *  これがあるので、機械がベルトより速くても、合流で順番を待っていても、ベルトが流れている限り止まらない */
export const HOLD_TILES = 6;
/** 採取機・試薬棚・タンク・駅が、出口のふさがっている間にためておける個数 */
export const SOURCE_HOLD = 12;
/** 待っている荷に、同じ物質を上乗せできる時間（秒）。先が少し遅いだけなら、荷がまとまって流れ続ける。
 *  これより長く動けない荷は「詰まっている」とみなして上乗せを断り、後ろへ詰まっていく（行き先のない副生成物は、これで装置を止める） */
export const JAM_SEC = 2;

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
  /** 出口にためておける反応の回数（保存しない。step が毎回決める） */
  hb?: number;
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
  /** 分ける装置（沈殿槽・分液ろうと・電気泳動槽）：test が設定（試薬の id や pH）、item が処理中のもの。
   *  buf が右手へ出すもの（沈殿・水層・陽極側）、buf2 が正面へ出すもの（ろ液・上層・動かないもの）、buf3 が左手へ出すもの（陰極側）。
   *  貯蔵タンク：sub がためている物質、cnt と rcn が数（rcn は試薬棚や搬出口から出たぶん）、test が 'hold' なら出口を閉じている */
  buf2?: string[];
  buf3?: string[];
  /** 試薬棚：出せる残りの数（課題で使う）。なければ無限 */
  left?: number;
  /** 課題の「中身の見えない装置」：反応の設定を見せない */
  sealed?: boolean;
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
  /** 一時停止：止めている装置。step が飛ばし、物も受け取らない（保存する） */
  off?: boolean;
  /** 設備の名前（プレイヤーが付ける短いメモ。12 文字まで。地図に小さく出す。保存する） */
  memo?: string;
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
/** 1 分ごとの記録を残す数（1 時間ぶん）。5 分より古い区切りは、ここへまとめる */
export const HOUR_KEEP = 60;
/** sub：物質ごとの [作った（採取を含む）, 使った, 納めた, 捨てた（廃棄口・あふれ）]。stock：区切りの始めの納品所の在庫。どちらも保存しない */
export interface Bucket { t: number; deliver: number; goal: number; vent: number; spill: number; made: number; sub?: Record<string, number[]>; stock?: Record<string, number> }

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
  /** 復習の予定（FSRS）。キーは 'r:反応id' か 'k:知識id' */
  srs: Record<string, Card>;
  /** 試験の日時（共通テスト、2 次）。復習の間隔は、これをまたがない */
  exams: number[];
  /** 自信ごとの、答えた数と正解した数 */
  calib: Record<Confidence, [number, number]>;
  /** 今日まちがえた（または勘で当てた）問題。正解するまで、今日のうちに戻ってくる。at より前には出さない */
  relearn: { id: string; at: number }[];
  /** 自信を持ってまちがえた記録（新しい 200 件） */
  hcLog: { id: string; t: number }[];
  /** 混ぜ注文：前の章の物質を、いまの指令とは別に納める */
  side: { s: string; n: number; got: number; ch: number; reward: number } | null;
  /** 今夜の 10 問と、翌朝の確認。day は夜の日付、ids は出した問題、got は夜の正解数、morning は朝の正解数 */
  night: { day: string; ids: string[]; got: number; morning?: number } | null;
  /** 日ごとの遊んだ時間（ミリ秒）。直近 60 日 */
  dayMs: Record<string, number>;
  /** 確認テストで短くした章 */
  tested: number[];
  /** 今日まちがえた問題（今夜の 10 問に入れる） */
  today: { day: string; wrong: string[] };
  /** 日ごとの復習の数：[答えた数, 思い出せた数（勘を除く）]。直近 60 日 */
  revDays: Record<string, [number, number]>;
  /** 狙う「思い出せる確率」（0.85・0.9・0.95） */
  ret: number;
  /** 毎日の復習目標のごほうびを、最後にもらった日 */
  bonusDay: string;
  /** 答えるまでの時間・まちがえた理由・今夜と今朝の 10 問の記録・学習時間の目標など（src/engine/study.ts） */
  study: Study;
  /** 最後に終えた混ぜ注文（知らせるため。保存しない） */
  lastSide?: { s: string; n: number; got: number; ch: number; reward: number };
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
  /** 解いた課題（src/engine/cases.ts の id） */
  cases: string[];
  /** 課題の工場：原料を入れすぎても捨てずに待たせる（原料の数を正確に数えるため）。保存しない */
  noSpill?: boolean;
  /** 課題「限られた原料」での予想。保存しない */
  pred?: { out: number; rest: number };
  /** 正解した計算問題 */
  solved: string[];
  /** 演習（連鎖計算・構造決定）の型ごとの成績。tries：解いた回数、clean：全問正解した回数 */
  practice: Record<string, { tries: number; clean: number }>;
  playMs: number;
  /** 工場の名前（タイトルとメニューに出す。なければ付けていない） */
  fname?: string;
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
  /** それより前の流れ。1 分ごとの区切りで 1 時間ぶん（t は分）。合計だけを小さく保存する */
  hour: Bucket[];
  /** 得た実績と、得た時刻（src/engine/achieve.ts の id） */
  ach: Record<string, number>;
  /** 指令ごとの、終わるまでの見込み（秒）。指令の 4 分の 1 を終えたときの速さで見積もる。キーは '章:番号' */
  eta: Record<string, number>;
  /** 画面効果のきっかけ。train は列車が降ろした数 n、goal は指令の達成。保存しない */
  fx: { x: number; y: number; type: 'react' | 'deliver' | 'spill' | 'vent' | 'train' | 'goal'; s: string; n?: number }[];
  /** 地図の旗（20 本まで）。y は階のずれを含む。note はひと言 */
  pins: { x: number; y: number; note: string }[];
}
/** 地図の旗の上限と、ひと言の長さ */
export const PIN_MAX = 20, PIN_NOTE = 16;

export const beltSpeed = (w: World) => 2 * (1 + 0.35 * w.up.belt);
/** 研究を終えているか */
export const has = (w: World, id: string) => w.research.includes(id);
export const extractInterval = (w: World) => 1 / ((1 + 0.5 * w.up.extract) * (has(w, 'intake') ? 1.5 : 1));
export const machineRate = (w: World) => (1 + 0.4 * w.up.machine) * (has(w, 'overclock') ? 1.25 : 1);
/** いちどに引けるベルトの本数 */
export const maxLanes = (w: World) => (has(w, 'lanes4') ? 4 : has(w, 'lanes3') ? 3 : 2);
export const tunnelRange = (w: World) => (has(w, 'tunnel') ? 12 : TUNNEL_RANGE);
export const stationCap = (w: World) => (has(w, 'yard') ? 1200 : STATION_CAP);
export const trainCap = (w: World) => (has(w, 'heavy') ? 400 : TRAIN_CAP);
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


/** 試験の日時の初期値。共通テストは 2027 年 1 月 16 日（大学入試センターの実施要項）。
 *  2 次（京大の前期日程）は、令和 9 年度の募集要項がまだ出ていないので、例年どおりの 2 月 25 日にしてある。要項が出たら直せる */
export const EXAMS_DEFAULT = [new Date(2027, 0, 16, 9, 0).getTime(), new Date(2027, 1, 25, 9, 0).getTime()];
/** 答えた結果で、次に出す日を決める（FSRS）。g は 1 忘れた〜4 簡単 */
export function rate(w: World, id: string, g: Grade, now = Date.now()) {
  w.srs[id] = review(w.srs[id], g, now, w.exams, id, w.ret);
}
/** 正解か不正解かだけで記録する（自信を聞かない問い） */
export function schedule(w: World, id: string, correct: boolean, now = Date.now()) {
  rate(w, id, correct ? 3 : 1, now);
}
/**
 * 自信と正誤を記録して、次の予定を決める。まちがえたもの・勘で当てたものは、今日のうちに正解するまで戻ってくる
 * （自信を持ってまちがえたものは早めに：1 分後。ほかは 3 分後）。正解すれば、その日の戻りから外す。
 */
export function answer(w: World, id: string, ok: boolean, conf: Confidence | undefined, now = Date.now(), hint = false): Grade {
  // 自信を聞かなかった問い（すべてを組み直す問い）は、正誤だけで決める
  let g: Grade = conf ? gradeOf(ok, conf) : ok ? 3 : 1;
  // ヒントを見て答えたものは、「たぶん」（G = 2）までにする。自信ごとの正答率にも入れない（記憶の確かさを測れない）
  if (hint && g > 2) g = 2;
  if (conf && !hint) { const c = (w.calib[conf] ??= [0, 0]); c[0]++; if (ok) c[1]++; }
  rate(w, id, g, now);
  // 日ごとの復習の数（勘で当てたものは、思い出せたに数えない）
  const rd = (w.revDays[dayKey(now)] ??= [0, 0]);
  rd[0]++; if (ok && conf !== 'guess') rd[1]++;
  const days = Object.keys(w.revDays);
  if (days.length > 60) for (const old of days.sort((a, b) => dayNum(a) - dayNum(b)).slice(0, days.length - 60)) delete w.revDays[old];
  const hc = !ok && conf === 'sure';
  if (hc) { w.srs[id].hc = true; w.hcLog.push({ id, t: now }); if (w.hcLog.length > 200) w.hcLog.splice(0, w.hcLog.length - 200); }
  w.relearn = w.relearn.filter((x) => x.id !== id);
  if (g === 1) {
    w.relearn.push({ id, at: now + (hc ? 60000 : 180000) });
    const day = dayKey(now);
    if (w.today.day !== day) w.today = { day, wrong: [] };
    if (!ok && !w.today.wrong.includes(id)) w.today.wrong.push(id);
  }
  return g;
}
/** 今日のうちに出し直す問題のうち、もう出してよいもの（日をまたいだものは捨てる） */
export function relearnReady(w: World, now = Date.now()): string[] {
  const today = dayKey(now);
  w.relearn = w.relearn.filter((x) => dayKey(x.at) === today || x.at > now);
  return w.relearn.filter((x) => x.at <= now).map((x) => x.id);
}
/** 習熟メッキ：その反応の復習の間隔が伸びるほど、装置が銅 → 銀 → 金になる。復習でまちがえると間隔が最初に戻り、メッキも剥がれる。
 *  0 なし、1 銅（3 日空けて覚えていた）、2 銀（7 日）、3 金（16 日以上） */
export const PLATING = ['', '銅', '銀', '金'];
export function platingOf(srs: World['srs'], recipeId: string | undefined): 0 | 1 | 2 | 3 {
  const b = recipeId ? srs[`r:${recipeId}`]?.b ?? 0 : 0;
  return b >= 16 ? 3 : b >= 7 ? 2 : b >= 3 ? 1 : 0;
}
/** 灯りのともる資源地：その資源地を使う指令を 1 つでも達成したところ */
export function litZones(w: World): Set<string> {
  const lit = new Set<string>();
  CHAPTERS.forEach((c, ci) => c.goals.forEach((g, gi) => { if (g.zone && gi < (w.progress[ci] || 0)) lit.add(g.zone); }));
  return lit;
}
/** 章ごとに、終えたかどうか（納品所のまわりの灯りと、タイトルの本棚に使う） */
export const chaptersDone = (progress: number[]): boolean[] => CHAPTERS.map((c, i) => (progress[i] || 0) >= c.goals.length);
/** 炎色反応で花火の色になる元素のうち、納品所が飲み込んだもの */
export const flamesFed = (w: World): string[] => Object.keys(FLAMES).filter((el) => fedTier(w, el) >= 1);
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
    study: newStudy(),
    ents: new Map(), chapter: 0, progress: CHAPTERS.map(() => 0), counts: CHAPTERS.map(() => 0), seen: 0, hubSize: 2, goalMs: {}, srs: {}, exams: [...EXAMS_DEFAULT], calib: { sure: [0, 0], maybe: [0, 0], guess: [0, 0] }, relearn: [], hcLog: [], side: null, night: null, dayMs: {}, tested: [], today: { day: '', wrong: [] }, revDays: {}, ret: RETENTION, bonusDay: '', cleared: [], delivered: {}, stock: {},
    discovered: ['air', 'seawater'], learned: [], mistakes: [], points: 0,
    up: { extract: 0, belt: 0, machine: 0 }, research: [], agents: [], cases: [], solved: [], practice: {}, made: {}, vented: {}, spilled: {}, emitted: {}, grades: {}, fed: {}, multi: {}, rateWin: [], hold: 0, sig: [], rails: new Map(), railRev: 0, occ: new Map(), buckets: [], hour: [], ach: {}, eta: {}, playMs: 0, tick: 0, events: [], fx: [],
    pins: [],
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
/**
 * 置いたものをずらす：ents を (dx, dy) マスだけ動かす。設定・中身・向きはそのまま。昇降機は、もう一方の階の相方も一緒に動く。
 * 行き先が、動かすもの以外でふさがっていれば何もせず、理由を返す。納品所は動かせない。
 * 成功したら、消した元の設備と、置いた新しい設備を返す（元に戻すときに使う）。
 */
export function moveEnts(w: World, ents: Ent[], dx: number, dy: number): { ok: true; removed: Ent[]; added: Ent[] } | { ok: false; why: string } {
  const set = new Set<Ent>();
  for (const e0 of ents) {
    const e = e0.kind === 'part' ? at(w, e0.x, e0.y) : e0;
    if (!e) continue;
    if (e.kind === 'hub') return { ok: false, why: '納品所は動かせない。' };
    set.add(e);
    if (e.kind === 'lift') { const p = liftPartner(w, e); if (p) set.add(p); }
  }
  if (!set.size) return { ok: false, why: '動かすものがない。' };
  if (!dx && !dy) return { ok: true, removed: [], added: [] };
  for (const e of set) for (const [fx, fy] of footprint(e.x + dx, e.y + dy, sizeOf(e))) {
    const o = at(w, fx, fy);
    if (o && !set.has(o)) return { ok: false, why: o.kind === 'hub' ? '行き先に納品所がある。' : `行き先に${MACHINE_NAME(o)}がある。` };
  }
  const removed = [...set], added: Ent[] = [];
  for (const e of removed) for (const [fx, fy] of footprint(e.x, e.y, sizeOf(e))) w.ents.delete(key(fx, fy));
  for (const e of removed) { const c: Ent = { ...e, x: e.x + dx, y: e.y + dy }; put(w, c); added.push(c); }
  // 走っている列車の行き先の駅をずらしたら、行き先も付け替える（線路がつながっていなければ、列車は引き返す）
  const moved = new Map(removed.filter((e) => e.kind === 'station').map((e) => [key(e.x, e.y), key(e.x + dx, e.y + dy)]));
  if (moved.size) for (const e of w.ents.values()) if (e.kind === 'station') for (const tr of [e.tr, ...(e.xtr ?? [])]) if (tr?.to && moved.has(tr.to)) tr.to = moved.get(tr.to);
  return { ok: true, removed, added };
}
/**
 * 囲んだ範囲の線路を、設備と一緒にずらす。ずらす前の、かかわるマスの線路を返す（元に戻すときに使う）。
 * 行き先にもともとある線路とは、つなぎ目を重ねる
 */
export function moveRails(w: World, r: [number, number, number, number], dx: number, dy: number): [string, number | undefined][] {
  const inside: [number, number, number][] = [];
  for (const [k, m] of w.rails) { const [x, y] = k.split(',').map(Number); if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) inside.push([x, y, m]); }
  if (!inside.length || (!dx && !dy)) return [];
  const cells = new Set<string>();
  for (const [x, y] of inside) { cells.add(key(x, y)); cells.add(key(x + dx, y + dy)); }
  const snap = [...cells].map((k) => [k, w.rails.get(k)] as [string, number | undefined]);
  for (const [x, y] of inside) w.rails.delete(key(x, y));
  for (const [x, y, m] of inside) { const k = key(x + dx, y + dy); w.rails.set(k, (w.rails.get(k) ?? 0) | m); }
  w.railRev++;
  return snap;
}
const MACHINE_NAME = (e: Ent) => (e.kind === 'belt' ? 'ベルト' : e.kind === 'part' ? '装置' : 'ほかの設備');

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
  if (isSep(kind)) { e.item = null; e.buf = []; e.buf2 = []; e.buf3 = []; }
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
  const stock: Record<string, number> = {};
  for (const s in w.stock) if (w.stock[s] > 0) stock[s] = w.stock[s];
  const b: Bucket = { t, deliver: 0, goal: 0, vent: 0, spill: 0, made: 0, sub: {}, stock };
  w.buckets.push(b);
  // 5 分より古い区切りは、1 分ごとの記録（1 時間ぶん）にまとめる
  while (w.buckets.length > BUCKET_KEEP) foldMinute(w.hour, w.buckets.shift()!);
  return b;
}
/** 10 秒の区切り b を、1 分ごとの記録 list に足す（古い順に足していく） */
export function foldMinute(list: Bucket[], b: Bucket) {
  const t = Math.floor((b.t * BUCKET_SEC) / 60);
  let m = list[list.length - 1];
  if (!m || m.t !== t) { m = { t, deliver: 0, goal: 0, vent: 0, spill: 0, made: 0 }; list.push(m); }
  m.deliver += b.deliver; m.goal += b.goal; m.vent += b.vent; m.spill += b.spill; m.made += b.made;
  if (b.sub) { const ms = (m.sub ??= {}); for (const s in b.sub) { const r = (ms[s] ??= [0, 0, 0, 0]); b.sub[s].forEach((v, i) => { r[i] += v; }); } }
  if (b.stock && !m.stock) m.stock = b.stock; // 1 分の始めの在庫
  if (list.length > HOUR_KEEP) list.splice(0, list.length - HOUR_KEEP);
}
/** 1 分ごとの流れ（古い順、最大 1 時間）。直近 5 分の区切りもまとめて入れる。withSub なら物質ごとの数と在庫も写す */
export function minutes(w: World, withSub = false): Bucket[] {
  const out: Bucket[] = w.hour.map((m) => ({ t: m.t, deliver: m.deliver, goal: m.goal, vent: m.vent, spill: m.spill, made: m.made,
    ...(withSub && m.sub ? { sub: Object.fromEntries(Object.entries(m.sub).map(([s, r]) => [s, [...r]])) } : {}), ...(withSub && m.stock ? { stock: m.stock } : {}) }));
  for (const b of w.buckets) foldMinute(out, withSub ? b : { ...b, sub: undefined, stock: undefined });
  return out;
}
const bump = (rec: Record<string, number>, s: string, n = 1) => { rec[s] = (rec[s] || 0) + n; };
/** 物質ごとの流れを、いまの区切りに足す。col：0 作った（採取を含む）、1 使った、2 納めた、3 捨てた。電子と、試薬棚の混合物（':' を含む id）は数えない */
function tally(w: World, s: string, col: 0 | 1 | 2 | 3, n: number) {
  if (s === 'e' || s.includes(':')) return;
  ((bucket(w).sub ??= {})[s] ??= [0, 0, 0, 0])[col] += n;
}
/** ベルトごとの、これまでに入ってきた荷の数（保存しない。統計の重ね表示で、毎分の数を出すのに使う） */
const passed = new WeakMap<Ent, number>();
export const beltPassed = (e: Ent) => passed.get(e) || 0;

/** 装置がいま止まっている理由。0 動いている、1 原料待ち、2 出口が詰まっている */
export const machineState = (e: Ent): 0 | 1 | 2 => (e.busy ? 0 : outputBlocked(e) ? 2 : 1);

/** 出口に 1 回ぶん以上たまっている生成物があるか。あるうちは、次の反応を始められない */
export function outputBlocked(e: Ent, r = recipeById(e.recipe)): boolean {
  if (!r || !e.outBuf || !e.outOrder) return false;
  // 出口には、反応 hb 回ぶんまでためておける（hb は、ベルトが HOLD_TILES マス進む間に終わる反応の回数。step が決める）
  const hb = e.hb || 1;
  return e.outOrder.some((s, i) => e.outBuf![i] >= (r.outputs.find(([id]) => id === s)?.[1] ?? 1) * hb);
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
  const sum = (bs: Bucket[], k: 'deliver' | 'goal' | 'vent' | 'spill' | 'made') => bs.reduce((a, b) => a + b[k], 0);
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
  // はじめて覚えた：一度でできたなら「思い出せた」、まちがえながらなら「忘れた」から始める。10 分後に一度確かめる
  w.srs[`r:${r.id}`] = firstCard(firstTry ? 3 : 1, Date.now());
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
    // 分ける装置：正面（左）・右手（手前）・左手（手前）から出る。タンク：正面の 2 つの口
    case 'settler': case 'funnel': case 'phoresis': return sepReady(n.kind, n.test) && sepSlots(n.kind).some((i) => { const p = slotPort(n, i); return p.d === d && p.tx === x && p.ty === y; });
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

// ---------------- 流れをたどる（どこから来て、どこへ行き、どこで止まっているか） ----------------
/** 物を運ぶだけの設備（反応も貯蔵もしない） */
export const MOVERS = new Set<Kind>(['belt', 'splitter', 'analyzer', 'sensor', 'gate', 'tunnel', 'bridge', 'lift']);
export interface FlowTrace {
  /** 下流（物が行く先）の運ぶ設備のマス。近い順 */
  down: [number, number][];
  /** 上流（物が来る元）の運ぶ設備のマス */
  up: [number, number][];
  /** 流れの行き着く先（装置・納品所・駅など）と、流れの元（採取機・装置など） */
  sinks: [number, number][];
  sources: [number, number][];
  /** 流れが止まっている先頭：下流でいちばん先の「待っている荷」と、その理由 */
  head: { x: number; y: number; s: string; why: string } | null;
}
/** 運ぶ設備 n から、荷が出ていく向き。inDir は入ってきた向き（立体交差はまっすぐ抜ける） */
function moverOuts(w: World, n: Ent, inDir: Dir): { x: number; y: number; d: Dir }[] {
  const step = (d: Dir) => ({ x: n.x + DX[d], y: n.y + DY[d], d });
  switch (n.kind) {
    case 'splitter': return [0, 1, 2].map((i) => step(portDir(n.dir, i)));
    case 'analyzer': return [0, 1].map((i) => step(portDir(n.dir, i)));
    case 'bridge': return [step(inDir)];
    case 'tunnel': { const p = tunnelPair(w, n); return p ? [{ x: p.x, y: p.y, d: n.dir }] : [step(n.dir)]; }
    case 'lift': { if (n.role === 'in') { const p = liftPartner(w, n); return p ? [{ x: p.x, y: p.y, d: p.dir }] : []; } return [step(n.dir)]; }
    default: return [step(n.dir)];
  }
}
/** 待っている荷が、なぜ先へ進めないか */
function stuckWhy(w: World, n: Ent, s: string): string {
  if (n.kind === 'gate' && !signalOn(w, n.ch) === (n.test !== 'off')) return `弁が閉じている（${n.ch || 1} 番の信号が${n.test === 'off' ? '点いている' : '来ていない'}）`;
  const outs = moverOuts(w, n, n.dir);
  const t = outs.length === 1 ? at(w, outs[0].x, outs[0].y) : undefined;
  if (outs.length === 1 && !t) return 'この先に何もない（行き止まり）';
  if (!t) return '出口がどれもふさがっている';
  if (t.kind === 'belt' && t.dir === (outs[0].d + 2) % 4) return '先のベルトが向かい合っている';
  if (t.kind === 'station') return t.role === 'out' ? '降ろす駅には入れられない' : '駅がいっぱい（列車が追いつかない）';
  if (t.kind === 'tank') return t.sub && t.sub !== s && (t.cnt || 0) + (t.rcn || 0) > 0 ? 'タンクに別の物質が入っている' : 'タンクがいっぱい';
  if (t.kind === 'settler' || t.kind === 'funnel' || t.kind === 'phoresis') return !sepReady(t.kind, t.test) ? '分ける装置の設定が決まっていない' : t.bad === s ? 'この装置では分けられない物質' : '分ける装置が手いっぱい';
  if (t.recipe !== undefined || isMachine(t.kind)) {
    const r = recipeById(t.recipe);
    if (!r) return '装置の反応が決まっていない';
    if (!r.inputs.some(([id]) => id === s)) return 'この装置の反応では使わない物質';
    return outputBlocked(t, r) ? '装置の出口が詰まっている（生成物の行き先がない）' : '装置の入口がいっぱい（反応が追いつかない）';
  }
  if (MOVERS.has(t.kind)) return '先が詰まっている';
  return 'この先が受け取らない';
}
export function flowTrace(w: World, e: Ent, cap = 800): FlowTrace {
  const res: FlowTrace = { down: [], up: [], sinks: [], sources: [], head: null };
  if (!MOVERS.has(e.kind)) return res;
  const k2 = (x: number, y: number) => `${x},${y}`;
  // 下流
  const seenD = new Set<string>(), sinkSet = new Set<string>();
  let best = -1;
  const qd: { x: number; y: number; d: Dir; depth: number }[] = [{ x: e.x, y: e.y, d: e.dir, depth: 0 }];
  while (qd.length && res.down.length < cap) {
    const c = qd.shift()!, n = at(w, c.x, c.y);
    if (!n) continue;
    if (!MOVERS.has(n.kind)) { const kk = k2(n.x, n.y); if (!sinkSet.has(kk)) { sinkSet.add(kk); res.sinks.push([n.x, n.y]); } continue; }
    const kk = `${n.x},${n.y},${n.kind === 'bridge' ? c.d % 2 : 0}`;
    if (seenD.has(kk)) continue;
    seenD.add(kk);
    res.down.push([n.x, n.y]);
    const items = n.kind === 'bridge' ? (n.items ?? []).filter((it): it is Item => !!it) : n.item ? [n.item] : [];
    for (const it of items) if ((it.w || 0) > 1 && c.depth > best) { best = c.depth; res.head = { x: n.x, y: n.y, s: it.s, why: stuckWhy(w, n, it.s) }; }
    for (const o of moverOuts(w, n, c.d)) qd.push({ x: o.x, y: o.y, d: o.d, depth: c.depth + 1 });
  }
  // 上流
  const seenU = new Set<string>([k2(e.x, e.y)]), srcSet = new Set<string>();
  const qu: Ent[] = [e];
  while (qu.length && res.up.length < cap) {
    const n = qu.shift()!;
    const feeders: Ent[] = [];
    for (const d of [0, 1, 2, 3] as Dir[]) { const m = at(w, n.x - DX[d], n.y - DY[d]); if (m && m !== n && emits(w, m, n.x, n.y, d)) feeders.push(m); }
    // 地下ベルトの出口と、昇降機の出口は、地上のとなりからではなく、対になる入口から来る
    if (n.kind === 'tunnel') for (let k = 1, R = tunnelRange(w); k <= R; k++) { const m = at(w, n.x - DX[n.dir] * k, n.y - DY[n.dir] * k); if (m?.kind === 'tunnel' && m.dir === n.dir && tunnelPair(w, m) === n) { feeders.push(m); break; } }
    if (n.kind === 'lift' && n.role === 'out') { const p = liftPartner(w, n); if (p) feeders.push(p); }
    for (const m of feeders) {
      const kk = k2(m.x, m.y);
      if (MOVERS.has(m.kind)) { if (!seenU.has(kk)) { seenU.add(kk); res.up.push([m.x, m.y]); qu.push(m); } }
      else if (!srcSet.has(kk)) { srcSet.add(kk); res.sources.push([m.x, m.y]); }
    }
  }
  return res;
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

function deliver(w: World, s: string, x: number, y: number, rc?: boolean, quiet = false) {
  w.stock[s] = (w.stock[s] || 0) + 1;
  discover(w, s);
  if (!quiet) w.fx.push({ x, y, type: 'deliver', s });
  if (rc) return; // 搬出口や試薬棚から出して納めただけのものは数えない
  w.delivered[s] = (w.delivered[s] || 0) + 1;
  bucket(w).deliver++;
  tally(w, s, 2, 1);
  feed(w, s);
  // 混ぜ注文
  if (w.side && w.side.s === s) { w.side.got++; if (w.side.got >= w.side.n) { w.points += w.side.reward; w.events.push('side-done'); w.lastSide = w.side; w.side = null; } }
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

/**
 * 混ぜ注文：指令を 2 つ終えるごとに、前に終えた章の物質を 1 つ、いまの指令とは別に頼む（章をまたいで混ぜて思い出させる）。
 * その物質を作る反応のうち、復習の期限がいちばん近いものを選ぶ。終えた章がなければ出さない。
 */
export function maybeSideOrder(w: World, force = false) {
  if (w.side || (!force && doneCount(w) % 2 !== 0)) return;
  const cands: { s: string; ch: number; due: number }[] = [];
  CHAPTERS.forEach((c, ci) => {
    if (ci === w.chapter) return;
    c.goals.forEach((g, gi) => {
      if (gi >= (w.progress[ci] || 0) || g.rate || g.also || g.strict || g.s === 'e' || !hasSub(g.s)) return;
      const due = Math.min(...RECIPES.filter((r) => productsOf(r).some(([s]) => s === g.s)).map((r) => w.srs[`r:${r.id}`]?.due ?? Infinity));
      cands.push({ s: g.s, ch: ci, due });
    });
  });
  if (!cands.length) return;
  cands.sort((a, b) => a.due - b.due || a.ch - b.ch);
  const pick = cands[0], n = 5 + Math.min(7, pick.ch);
  w.side = { s: pick.s, n, got: 0, ch: pick.ch, reward: 10 + 2 * n };
  w.events.push('side-new');
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
    w.fx.push({ x: HUB_CENTER[0], y: HUB_CENTER[1], type: 'goal', s: g.s });
    maybeSideOrder(w);
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
/** 置いてある荷 it に、物質 s を n 個、上乗せできるか。同じ物質で、流れているか、待ちはじめて JAM_SEC 秒以内のときだけ */
const stacks = (it: Item, s: string, rc: boolean | undefined, n: number) => it.s === s && !it.rc === !rc && (it.p < 1 || (it.w || 0) < JAM_SEC) && (it.n || 1) + n <= STACK_MAX;

/** 荷をとなりのマスへ渡す。n は個数。受け取れたら true（荷は、分けずに丸ごと渡る） */
function push(w: World, x: number, y: number, d: Dir, s: string, rc?: boolean, n = 1, dry = false): boolean {
  const N = n > 1 ? n : undefined;
  const t = at(w, x, y);
  if (!t) return false;
  // 一時停止している装置は、何も受け取らない（ベルトはそこで待つ）
  if (t.off) return false;
  switch (t.kind) {
    case 'belt':
      if (t.dir === (d + 2) % 4) return false;
      if (t.item) {
        // 同じ物質の荷には、上乗せできる（合流しても、先が少し遅くても、順番待ちにならない）。
        // 長く止まっている荷には載せない。先が詰まれば、1 マスに荷 1 つで後ろへ詰まっていく
        if (!stacks(t.item, s, rc, n)) return false;
        if (dry) return true;
        t.item.n = (t.item.n || 1) + n;
        t.ins = (t.ins || 0) | (1 << d);
        passed.set(t, (passed.get(t) || 0) + n);
        return true;
      }
      // 合流点（2 方向以上から入るベルト）：交互に通すか、決めた向きを優先して通す
      if (t.ins && t.ins & (t.ins - 1) && yields(w, t, d)) return false;
      if (dry) return true;
      t.ins = (t.ins || 0) | (1 << d); t.li = d;
      t.item = { s, p: 0, m: w.tick, rc, n: N };
      t.st = s === 'e' ? 'gas' : sub(s).state;
      passed.set(t, (passed.get(t) || 0) + n);
      return true;
    case 'splitter':
    case 'analyzer':
      if (t.item) { if (!stacks(t.item, s, rc, n)) return false; if (!dry) t.item.n = (t.item.n || 1) + n; return true; }
      if (dry) return true;
      t.item = { s, p: 0, m: w.tick, rc, n: N };
      return true;
    case 'sensor':
    case 'gate':
      if (t.dir === (d + 2) % 4) return false;
      if (t.item) { if (!stacks(t.item, s, rc, n)) return false; if (!dry) t.item.n = (t.item.n || 1) + n; return true; }
      if (dry) return true;
      t.item = { s, p: 0, m: w.tick, rc, n: N };
      return true;
    case 'lift':
      if (t.role !== 'in' || t.dir === (d + 2) % 4) return false;
      if (t.item) { if (!stacks(t.item, s, rc, n)) return false; if (!dry) t.item.n = (t.item.n || 1) + n; return true; }
      if (dry) return true;
      t.item = { s, p: 0, m: w.tick, rc, n: N };
      return true;
    case 'settler': case 'funnel': case 'phoresis': {
      // 分ける装置：その装置が扱う混合物だけを受け取る。設定を決めるまでは動かない
      if (!sepReady(t.kind, t.test) || !sepAccepts(t.kind, s) || sepRefusal(t.kind, s, t.test)) { t.bad = s; t.badT = w.tick; return false; }
      // 待っている（または、いま分けている）同じ混合物には、上乗せできる。分ける時間は、個数によらない
      if (t.item) { if (t.item.s !== s || (t.item.n || 1) + n > STACK_MAX) return false; if (!dry) t.item.n = (t.item.n || 1) + n; return true; }
      if (dry) return true;
      t.item = { s, p: 0, m: w.tick, n: N };
      return true;
    }
    case 'tank': {
      // 貯蔵タンク：1 種類だけをためる。別の物質は、空になるまで受け取らない
      const have = (t.cnt || 0) + (t.rcn || 0);
      if (have > 0 && t.sub !== s) { t.bad = s; t.badT = w.tick; return false; }
      // 満杯でなければ、荷は丸ごと入る（最後の 1 つで、少しだけ上限を超えることがある）
      if (have >= TANK_CAP) return false;
      if (dry) return true;
      t.sub = s;
      if (rc) t.rcn = (t.rcn || 0) + n; else t.cnt = (t.cnt || 0) + n;
      return true;
    }
    case 'tunnel':
      if (d !== t.dir) return false;
      if (t.item) { if (!stacks(t.item, s, rc, n)) return false; if (!dry) t.item.n = (t.item.n || 1) + n; return true; }
      if (dry) return true;
      t.item = { s, p: 0, m: w.tick, rc, n: N };
      return true;
    case 'station':
      if (t.role !== 'in' || (t.buf ??= []).length >= stationCap(w)) return false;
      if (dry) return true;
      for (let i = 0; i < n; i++) t.buf.push(rc ? '!' + s : s);
      return true;
    case 'bridge': {
      const slots = (t.items ??= [null, null]);
      const cur = slots[d % 2];
      if (cur) { if ((cur.d ?? d % 2) !== d || !stacks(cur, s, rc, n)) return false; if (!dry) cur.n = (cur.n || 1) + n; return true; }
      if (dry) return true;
      slots[d % 2] = { s, p: 0, m: w.tick, rc, d, n: N };
      return true;
    }
    case 'hub':
      if (dry) return true;
      for (let i = 0; i < n; i++) deliver(w, s, x, y, rc, i > 0);
      return true;
    case 'vent':
      if (dry) return true;
      bump(w.vented, s, n);
      bucket(w).vent += n;
      tally(w, s, 3, n);
      // 有毒な気体も、そのまま捨ててよい。数だけ記録する
      if (TOXIC[s]) bump(w.emitted, s, n);
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
        if (dry) return true;
        t.pw = Math.min(POWER_MAX, (t.pw || 0) + POWER_SEC * n);
        return true;
      }
      const need = r.inputs.find(([id]) => id === s)?.[1];
      // 使わない物質は受け取らない。ベルトはそこで止まるので、理由がわかるように印をつける
      if (!need) { t.bad = s; t.badT = w.tick; return false; }
      // 入れすぎた分はあふれて捨てる（1 本のベルトに混ぜても詰まらない）
      // 反応 4 回ぶんたまるまでは、荷を丸ごと受け取る。それ以上は、
      //  - ほかの原料が足りなくて動けないとき：あふれて捨てる（1 本のベルトに混ぜても、余った方が道をふさがない）
      //  - 原料がそろっていて動けるとき：受け取らずに待たせる（使い切れない分を捨てない。まとまった荷が着いても無駄にならない）
      const cap = need * 4, have = t.inBuf[s] || 0;
      if (have >= cap) {
        const starved = r.inputs.some(([id, k]) => id !== s && (t.inBuf![id] || 0) < k);
        if (w.noSpill || !starved) return false;
        if (dry) return true;
        w.fx.push({ x, y, type: 'spill', s }); bump(w.spilled, s, n); bucket(w).spill += n; tally(w, s, 3, n);
        return true;
      }
      if (dry) return true;
      t.inBuf[s] = have + n;
      return true;
    }
  }
}

export function step(w: World, dt: number) {
  w.tick++;
  w.playMs += dt * 1000;
  bucket(w); // 何も流れていない間も区切りを作る（在庫の推移と、1 時間の記録が途切れない）
  // 量産の指令：求められた速さを保てている間だけ時間が進み、下回ると倍の速さで戻る
  const rg = currentGoal(w);
  if (rg?.rate) {
    while (w.rateWin.length && w.rateWin[0] < w.playMs - RATE_WINDOW * 1000) w.rateWin.shift();
    w.hold = goalRate(w) >= rg.rate ? w.hold + dt : Math.max(0, w.hold - dt * 2);
    w.counts[w.chapter] = Math.floor(w.hold);
    if (w.hold >= rg.n) finishGoal(w, rg, w.chapter);
  }
  if (currentGoal(w)) { const gk = `${w.chapter}:${w.progress[w.chapter]}`; w.goalMs[gk] = (w.goalMs[gk] || 0) + dt * 1000; }
  // 使っている番号だけを回る（番号はいくらでも増やせるので、端から数えない）
  for (const k in w.sig) { if (w.sig[k] > 0) w.sig[k] = Math.max(0, w.sig[k] - dt); else delete w.sig[k]; }
  // 列車の位置の覚え書きは、古いものをときどき捨てる
  if (w.tick % 600 === 0 && w.occ.size) for (const [k, o] of w.occ) if (o.t < w.tick - 2) w.occ.delete(k);
  const speed = beltSpeed(w), every = extractInterval(w), rate = machineRate(w), kU = 1 - Math.exp(-dt / UTIL_TAU);
  for (const e of w.ents.values()) {
    // 一時停止している装置は、反応も採取も出すことも止める（途中の反応・ためた物はそのまま残る）
    if (e.off) continue;
    switch (e.kind) {
      case 'belt': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p >= 1 && it.m !== w.tick) { if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc, it.n)) e.item = null; else it.w = (it.w || 0) + dt; }
        break;
      }
      case 'splitter': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        it.w = (it.w || 0) + dt; // 配り終えれば荷はなくなるので、残っている間だけ意味を持つ
        if ((it.n || 1) === 1) {
          for (let k = 0; k < 3; k++) {
            const i = ((e.rr || 0) + k) % 3, d = portDir(e.dir, i);
            if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc)) { e.item = null; e.rr = (i + 1) % 3; break; }
          }
          break;
        }
        // まとまった荷は、つながっている出口の数で等分して配る（1 個ずつ順に配ったときと同じ割合になる）。
        // ふさがっている出口の分は手元に残り、次の回に、また等分する
        const outs = [0, 1, 2].map((k) => ((e.rr || 0) + k) % 3).filter((i) => { const d = portDir(e.dir, i); return push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc, 1, true); });
        if (!outs.length) break;
        let left = it.n!;
        const share = Math.floor(left / outs.length), extra = left % outs.length;
        outs.forEach((i, k) => {
          const q = share + (k < extra ? 1 : 0), d = portDir(e.dir, i);
          if (q > 0 && push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc, q)) left -= q;
        });
        // 割り切れなかった端数は、次の回には別の出口へ回す
        if (extra) e.rr = (outs[extra - 1] + 1) % 3;
        if (left <= 0) e.item = null; else it.n = left > 1 ? left : undefined;
        break;
      }
      case 'analyzer': {
        const it = e.item;
        if (!it || !e.test) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        // 'is:物質' は選別：その物質だけを正面へ通す
        const d = portDir(e.dir, (e.test.startsWith('is:') ? it.s === e.test.slice(3) : isPositive(it.s, e.test)) ? 0 : 1);
        if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc, it.n)) e.item = null; else it.w = (it.w || 0) + dt;
        break;
      }
      case 'sensor': {
        // 検知器：ベルトのように正面へ流しながら、様子を信号にする
        const it = e.item;
        if (!it) { e.stuck = 0; break; }
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc, it.n)) {
          if (e.test === `is:${it.s}`) w.sig[e.ch || 1] = Math.max(w.sig[e.ch || 1] || 0, 3);
          e.item = null; e.stuck = 0;
        } else {
          it.w = (it.w || 0) + dt;
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
        if (signalOn(w, e.ch) === (e.test !== 'off') && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc, it.n)) e.item = null; else it.w = (it.w || 0) + dt;
        break;
      }
      case 'settler': case 'funnel': case 'phoresis': {
        const ready = sepReady(e.kind, e.test), side = (e.buf ??= []), main = (e.buf2 ??= []), side2 = (e.buf3 ??= []);
        if (e.bad && w.tick - (e.badT || 0) > 45) e.bad = undefined;
        if (ready && e.item && !e.busy && !side.length && !main.length && !side2.length) { e.busy = true; e.prog = 0; }
        if (ready && e.busy && e.item) {
          e.prog = (e.prog || 0) + (dt * rate) / SETTLE_TIME;
          if (e.prog >= 1) {
            const r = sepRun(e.kind, e.item.s, e.test), cnt = e.item.n || 1;
            for (const [x, q] of [[r.main, main], [r.side, side], [r.side2 ?? null, side2]] as [string | null, string[]][]) {
              if (!x) continue;
              for (let i = 0; i < cnt; i++) q.push(x);
              discover(w, x);
              // 新しくできたものだけを「作った数」に入れる（そのまま通り抜けたものは数えない）
              if (x !== e.item.s && !x.includes(':')) { bump(w.made, x, cnt); bucket(w).made += cnt; tally(w, x, 0, cnt); }
            }
            if (r.main !== e.item.s && r.side !== e.item.s && r.side2 !== e.item.s) tally(w, e.item.s, 1, cnt);
            w.fx.push({ x: e.x + 0.5, y: e.y + 0.5, type: 'react', s: r.side ?? r.main ?? r.side2 ?? e.item.s });
            e.item = null; e.busy = false; e.prog = 0; e.n = (e.n || 0) + cnt;
          }
        }
        // 正面（左）・右手（手前）・左手（手前）へ
        for (const [q, slot] of [[main, 0], [side, 2], [side2, 3]] as [string[], number][]) {
          if (!q.length) continue;
          const p = slotPort(e, slot);
          let k = 1;
          while (k < q.length && k < STACK_MAX && q[k] === q[0]) k++;
          if (push(w, p.tx, p.ty, p.d, q[0], undefined, k)) q.splice(0, k);
        }
        e.stuck = !e.busy && (side.length || main.length || side2.length) ? (e.stuck || 0) + dt : 0;
        break;
      }
      case 'tank': {
        if (e.bad && w.tick - (e.badT || 0) > 45) e.bad = undefined;
        const n = (e.cnt || 0) + (e.rcn || 0);
        if (!n || !e.sub || e.test === 'hold') break;
        // 正面の 2 つの口から交互に出す。試薬棚や搬出口から来たぶんを先に出す。たまっている分は、荷にまとめて、待たずに出す
        const rc = (e.rcn || 0) > 0, q = Math.min(rc ? e.rcn! : e.cnt!, STACK_MAX);
        for (let k = 0; k < 2; k++) {
          const i = ((e.rr || 0) + k) % 2, p = slotPort(e, i);
          if (push(w, p.tx, p.ty, p.d, e.sub, rc, q)) { if (rc) e.rcn! -= q; else e.cnt! -= q; e.rr = (i + 1) % 2; break; }
        }
        break;
      }
      case 'lift': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p < 1 || it.m === w.tick) break;
        if (e.role === 'in') {
          const p = liftPartner(w, e);
          if (p && !p.item) { p.item = { s: it.s, p: 0, m: w.tick, rc: it.rc, n: it.n }; e.item = null; }
          else if (p?.item && stacks(p.item, it.s, it.rc, it.n || 1)) { p.item.n = (p.item.n || 1) + (it.n || 1); e.item = null; }
          else it.w = (it.w || 0) + dt;
        } else if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc, it.n)) e.item = null; else it.w = (it.w || 0) + dt;
        break;
      }
      case 'sampler': {
        const gap = every * 1.5;
        e.timer = Math.min((e.timer || 0) + dt, gap * SOURCE_HOLD);
        if (!e.sub || e.timer < gap || e.left === 0) break;
        const set = e.sub.startsWith('set:') ? setById(e.sub.slice(4)) : undefined;
        const s = set ? set.members[(e.rr || 0) % set.members.length] : e.sub;
        if (!hasSub(s)) break;
        const k = set ? 1 : Math.min(Math.floor(e.timer / gap + 1e-9), e.left ?? STACK_MAX);
        // 数を限った試薬棚（課題）から出たものは、反応させて納めたぶんを数える
        if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, s, !set && e.left === undefined, k)) { e.timer = Math.max(0, e.timer - k * gap); e.rr = ((e.rr || 0) + 1) % 1000; if (e.left !== undefined) e.left -= k; }
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
          if (it.p >= 1 && it.m !== w.tick) { if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc, it.n)) slots[a] = null; else it.w = (it.w || 0) + dt; }
        }
        break;
      }
      case 'extractor': {
        // 出口がふさがっている間も採り続け、SOURCE_HOLD 個までためて、空いたときにまとめて出す
        e.timer = Math.min((e.timer || 0) + dt, every * SOURCE_HOLD);
        const k = Math.floor(e.timer / every + 1e-9);
        if (k >= 1 && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, resourceAt(e.x, e.y), undefined, k)) { e.timer = Math.max(0, e.timer - k * every); e.n = (e.n || 0) + k; tally(w, resourceAt(e.x, e.y), 0, k); }
        // ためられる量がいっぱいになると、採れるのに出せない
        e.u = (e.u ?? 1) + ((e.timer < every * SOURCE_HOLD - 1e-9 ? 1 : 0) - (e.u ?? 1)) * kU;
        break;
      }
      case 'depot': {
        e.timer = Math.min((e.timer || 0) + dt, every * SOURCE_HOLD);
        if (!e.sub || !(w.stock[e.sub] > 0) || e.timer < every) break;
        const k = Math.min(Math.floor(e.timer / every + 1e-9), w.stock[e.sub]);
        if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, e.sub, true, k)) { e.timer = Math.max(0, e.timer - k * every); w.stock[e.sub] -= k; }
        break;
      }
      case 'tunnel': {
        const it = e.item;
        if (!it) break;
        const pair = tunnelPair(w, e);
        const dist = pair ? Math.abs(pair.x - e.x) + Math.abs(pair.y - e.y) : 1;
        it.p = Math.min(1, it.p + (speed * dt) / dist);
        if (it.p < 1 || it.m === w.tick) break;
        if (pair) {
          if (!pair.item) { pair.item = { s: it.s, p: 0, m: w.tick, rc: it.rc, n: it.n }; e.item = null; }
          else if (stacks(pair.item, it.s, it.rc, it.n || 1)) { pair.item.n = (pair.item.n || 1) + (it.n || 1); e.item = null; }
          else it.w = (it.w || 0) + dt;
        } else if (push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc, it.n)) e.item = null; else it.w = (it.w || 0) + dt;
        break;
      }
      case 'station': {
        const buf = (e.buf ??= []);
        if (e.role === 'out') {
          // 降ろす駅：ためたものを、正面の 2 つの口から交互に出す
          if (!buf.length) break;
          // 先頭から続く同じ物質を、荷にまとめて、待たずに出す
          let q = 1;
          while (q < STACK_MAX && q < buf.length && buf[q] === buf[0]) q++;
          for (let k = 0; k < 2; k++) {
            const i = ((e.rr || 0) + k) % 2, p = slotPort(e, i), rc = buf[0].startsWith('!');
            if (push(w, p.tx, p.ty, p.d, rc ? buf[0].slice(1) : buf[0], rc, q)) { buf.splice(0, q); e.rr = (i + 1) % 2; e.n = (e.n || 0) + q; break; }
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
            if (buf.length && tr.cargo.length < trainCap(w)) tr.cargo.push(...buf.splice(0, trainCap(w) - tr.cargo.length));
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
              if (tr.cargo.length && db.length < stationCap(w)) {
                const got = tr.cargo.splice(0, stationCap(w) - db.length);
                db.push(...got);
                w.fx.push({ x: dest!.x + 1, y: dest!.y + 1, type: 'train', s: got[0].replace(/^!/, ''), n: got.length });
              }
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
        // 出口にためておける量：ベルトが HOLD_TILES マス進む間にできる分。機械がベルトより速くても、出口の先が流れていれば止まらない
        e.hb = Math.max(1, Math.ceil((HOLD_TILES / speed) / (r.time / (rate * ((e.pw || 0) > 0 ? 2 : 1)))));
        const flush = () => e.outOrder!.forEach((s, i) => {
          if (e.outBuf![i] <= 0) return;
          // たまっている分は、ひとまとめの荷にして出す（1 個ずつ出すと、ベルトが 1 マス進むたびに 1 個しか出せず、係数の大きい生成物で詰まる）
          const p = outPort(e, i), k = Math.min(e.outBuf![i], STACK_MAX);
          if (push(w, p.tx, p.ty, p.d, s, undefined, k)) e.outBuf![i] -= k;
        });
        if (!e.busy) {
          // 出口にためておける量を超えた生成物があるうちは、次の反応を始めない（副生成物を放置すると、ここで詰まる）
          if (!outputBlocked(e, r) && r.inputs.every(([s, n]) => (e.inBuf![s] || 0) >= n)) {
            for (const [s, n] of r.inputs) { e.inBuf[s] -= n; tally(w, s, 1, n); }
            e.busy = true;
            e.prog = 0;
          }
        } else {
          e.prog = (e.prog || 0) + (dt * rate * ((e.pw || 0) > 0 ? 2 : 1)) / r.time;
          if (e.pw) e.pw = Math.max(0, e.pw - dt);
          if (e.prog >= 1) {
            const over = e.prog - 1;
            e.busy = false;
            e.prog = 0;
            w.fx.push({ x: e.x + (sizeOf(e) - 1) / 2, y: e.y + (sizeOf(e) - 1) / 2, type: 'react', s: e.outOrder[0] });
            e.n = (e.n || 0) + 1;
            e.outOrder.forEach((s, i) => {
              const k = r.outputs.find(([id]) => id === s)![1];
              e.outBuf![i] += k;
              if (s !== 'e') { bump(w.made, s, k); bucket(w).made += k; tally(w, s, 0, k); }
              discover(w, s);
            });
            flush();
            // 続けて動けるなら、同じコマのうちに次を始め、余った時間も持ち越す（1 回ごとに 1 コマ休むと、速い装置ほど表示の速さより遅くなる）
            if (!outputBlocked(e, r) && r.inputs.every(([s, n]) => (e.inBuf![s] || 0) >= n)) {
              for (const [s, n] of r.inputs) { e.inBuf[s] -= n; tally(w, s, 1, n); }
              e.busy = true;
              e.prog = Math.min(over, 0.99);
            }
          }
        }
        flush();
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
/** 工場の名前の長さ（文字） */
export const FNAME_MAX = 20;

export function serialize(w: World): string {
  return JSON.stringify({
    v: SAVE_VERSION, ents: [...w.ents.values()].filter((e) => e.kind !== 'part'), chapter: w.chapter, progress: w.progress, counts: w.counts, seen: w.seen,
    rails: [...w.rails], hubSize: w.hubSize, goalMs: w.goalMs, srs: w.srs, exams: w.exams, calib: w.calib, relearn: w.relearn, hcLog: w.hcLog, side: w.side, night: w.night, dayMs: w.dayMs, tested: w.tested, today: w.today, revDays: w.revDays, ret: w.ret, bonusDay: w.bonusDay, cleared: w.cleared, done: doneCount(w), delivered: w.delivered, stock: w.stock,
    discovered: w.discovered, learned: w.learned, mistakes: w.mistakes.slice(-400), points: w.points, up: w.up, solved: w.solved, research: w.research, agents: w.agents, cases: w.cases, practice: w.practice, made: w.made, vented: w.vented, spilled: w.spilled, emitted: w.emitted, grades: w.grades, fed: w.fed, multi: w.multi,
    // 1 時間の流れは、1 分ごとの合計だけを [分, 納品, 指令, 廃棄口, あふれ, 作った] の数の並びで残す（60 行）
    hist: minutes(w).map((m) => [m.t, m.deliver, m.goal, m.vent, m.spill, m.made]), ach: w.ach, eta: w.eta,
    playMs: Math.round(w.playMs), savedAt: Date.now(),
    fname: w.fname || undefined,
    study: w.study,
    pins: w.pins,
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
      // 一時停止と名前（古いセーブにはない）
      if (e.off !== undefined && e.off !== true) delete e.off;
      if (e.memo !== undefined) { const m = typeof e.memo === 'string' ? e.memo.trim().slice(0, 12) : ''; if (m) e.memo = m; else delete e.memo; }
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
    // 古い版の { iv, due } は FSRS の形に読み替える
    w.srs = {};
    for (const [k, v] of Object.entries(d.srs || {})) if (v && typeof v === 'object') w.srs[k] = migrate(v as Parameters<typeof migrate>[0]);
    w.cleared = d.cleared || [];
    for (const id of d.learned || []) if (!w.srs[`r:${id}`] && recipeById(id)) w.srs[`r:${id}`] = migrate({ iv: 0, due: Date.now() });
    w.exams = Array.isArray(d.exams) && d.exams.length === 2 && d.exams.every((x: unknown) => typeof x === 'number' && x > 0) ? d.exams : [...EXAMS_DEFAULT];
    w.calib = { sure: [0, 0], maybe: [0, 0], guess: [0, 0] };
    for (const k of ['sure', 'maybe', 'guess'] as Confidence[]) { const v = d.calib?.[k]; if (Array.isArray(v) && v.length === 2) w.calib[k] = [v[0] | 0, v[1] | 0]; }
    w.relearn = Array.isArray(d.relearn) ? d.relearn.filter((x: { id?: unknown; at?: unknown }) => typeof x?.id === 'string' && typeof x?.at === 'number') : [];
    w.hcLog = Array.isArray(d.hcLog) ? d.hcLog.filter((x: { id?: unknown; t?: unknown }) => typeof x?.id === 'string' && typeof x?.t === 'number').slice(-200) : [];
    w.side = d.side && typeof d.side.s === 'string' && hasSub(d.side.s) ? { s: d.side.s, n: d.side.n | 0, got: d.side.got | 0, ch: d.side.ch | 0, reward: d.side.reward | 0 } : null;
    w.night = d.night && typeof d.night.day === 'string' && Array.isArray(d.night.ids) ? { day: d.night.day, ids: d.night.ids.filter((x: unknown) => typeof x === 'string'), got: d.night.got | 0, morning: typeof d.night.morning === 'number' ? d.night.morning : undefined } : null;
    w.dayMs = d.dayMs && typeof d.dayMs === 'object' ? d.dayMs : {};
    w.tested = Array.isArray(d.tested) ? d.tested.filter((x: unknown) => typeof x === 'number') : [];
    w.revDays = {};
    if (d.revDays && typeof d.revDays === 'object') for (const [k, v] of Object.entries(d.revDays as Record<string, unknown>)) if (Array.isArray(v) && v.length === 2) w.revDays[k] = [Number(v[0]) | 0, Number(v[1]) | 0];
    w.ret = RETENTIONS.includes(d.ret) ? d.ret : RETENTION;
    w.bonusDay = typeof d.bonusDay === 'string' ? d.bonusDay : '';
    w.study = readStudy(d.study);
    w.today = d.today && typeof d.today.day === 'string' && Array.isArray(d.today.wrong) ? { day: d.today.day, wrong: d.today.wrong.filter((x: unknown) => typeof x === 'string') } : { day: '', wrong: [] };
    w.delivered = d.delivered || {};
    w.stock = d.stock || {};
    w.discovered = [...new Set([...w.discovered, ...(d.discovered || [])])].filter(hasSub);
    w.learned = d.learned || [];
    w.mistakes = d.mistakes || [];
    w.points = d.points | 0;
    w.up = { extract: d.up?.extract | 0, belt: d.up?.belt | 0, machine: d.up?.machine | 0 };
    w.solved = d.solved || [];
    w.agents = Array.isArray(d.agents) ? d.agents.filter((x: unknown) => typeof x === 'string') : [];
    w.cases = Array.isArray(d.cases) ? d.cases.filter((x: unknown) => typeof x === 'string') : [];
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
    w.fname = typeof d.fname === 'string' && d.fname.trim() ? d.fname.trim().slice(0, FNAME_MAX) : undefined;
    w.pins = Array.isArray(d.pins) ? d.pins.filter((p: { x?: unknown; y?: unknown }) => Number.isInteger(p?.x) && Number.isInteger(p?.y)).slice(0, PIN_MAX).map((p: { x: number; y: number; note?: unknown }) => ({ x: p.x, y: p.y, note: typeof p.note === 'string' ? p.note.slice(0, PIN_NOTE) : '' })) : [];
    // 1 時間の流れ：数の並びのうち、形の合うものだけを、分の古い順に読む
    const num = (v: unknown) => typeof v === 'number' && isFinite(v) && v >= 0;
    w.hour = (Array.isArray(d.hist) ? d.hist : []).filter((r: unknown) => Array.isArray(r) && r.length === 6 && r.every(num) && Number.isInteger(r[0]))
      .map((r: number[]) => ({ t: r[0], deliver: r[1], goal: r[2], vent: r[3], spill: r[4], made: r[5] })).sort((a: Bucket, b: Bucket) => a.t - b.t).slice(-HOUR_KEEP);
    w.ach = {};
    if (d.ach && typeof d.ach === 'object') for (const [k, v] of Object.entries(d.ach as Record<string, unknown>)) if (typeof v === 'number' && isFinite(v) && v > 0) w.ach[k] = v;
    w.eta = {};
    if (d.eta && typeof d.eta === 'object') for (const [k, v] of Object.entries(d.eta as Record<string, unknown>)) if (/^\d+:\d+$/.test(k) && num(v)) w.eta[k] = Math.round(v as number);
    return w;
  } catch {
    return null;
  }
}

/** セーブ枠の一覧に出す要約 */
/** dayKey の日付の 0 時 */
const dayStart = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export function summarize(json: string | null, now = Date.now()): { done: number; chapter: number; playMs: number; savedAt: number; points: number; progress: number[]; grades: Record<string, string>; due: number; exam: number | null; nightDay: string; morning: boolean } | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    if (d.v !== SAVE_VERSION) return null;
    const srs = d.srs && typeof d.srs === 'object' ? Object.values(d.srs as Record<string, { due?: number; iv?: number }>) : [];
    const exams: number[] = Array.isArray(d.exams) ? d.exams.filter((x: unknown) => typeof x === 'number') : EXAMS_DEFAULT;
    const next = exams.filter((e) => e > now).sort((a, b) => a - b)[0];
    return { due: srs.filter((c) => typeof c?.due === 'number' && c.due <= now).length, exam: next ? Math.ceil((next - now) / 86400000) : null, nightDay: typeof d.night?.day === 'string' ? d.night.day : '', morning: !!d.night && Array.isArray(d.night.ids) && d.night.ids.length > 0 && d.night.morning === undefined && d.night.day !== dayKey(now) && now - dayStart(d.night.day) < 2 * 86400000,
      done: (d.done ?? d.goal) | 0, chapter: d.chapter | 0, playMs: d.playMs || 0, savedAt: d.savedAt || 0, points: d.points | 0, progress: Array.isArray(d.progress) ? d.progress : [], grades: d.grades || {} };
  } catch {
    return null;
  }
}

