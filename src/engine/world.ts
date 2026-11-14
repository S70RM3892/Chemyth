import { capByExams, dayKey, dayNum, firstCard, gradeOf, migrate, review, RETENTION, RETENTIONS, type Card, type Confidence, type Grade } from './fsrs';
import { recipeById, RECIPES, CONDITIONS, electronsOf, productsOf, type MachineKind, type Recipe } from '../content/recipes';
import { HUB_AT, HUB_CENTER, HUB_DEMAND, HUB_SIZES, hubTiles, resourceAt } from '../content/map';
import { CHAPTERS, TOTAL_GOALS, type Goal } from '../content/goals';
import { hasSub, label, sub } from '../content/substances';
import { isBalanced, parseFormula } from '../chem/formula';
import { ELEMENTS } from '../content/elements';
import { isPositive, setById, testById } from '../content/samples';
import { MACHINES } from '../content/machines';
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

/** 装置の段取り：1 歩ごとに引き直さなくてよいものを、まとめておく */
export interface MachinePlan {
  r: Recipe; rid: string; oo: string[]; os: number[] | undefined; dir: number; x: number; y: number;
  /** 出口ごと：生成物の係数、出す先のマスと向き、出す先の設備（設備の顔ぶれ tRev のときのもの） */
  k: number[]; tx: number[]; ty: number[]; td: Dir[]; t: (Ent | null)[]; tRev: number;
}
export interface Ent {
  /** 採取機が採る資源の覚え書き（場所 resAt のときの値。セーブには書かない） */
  res?: string; resAt?: number;
  /** 正面の設備の覚え書き（設備の顔ぶれ nbRev のときのもの。セーブには書かない） */
  nb?: Ent | null; nbRev?: number;
  /** 大きな装置の残りのマス（part）が指す、装置そのもの（ref と同じもの。セーブには書かない） */
  own?: Ent;
  /** 装置の段取りの覚え書き（反応・出口の場所と係数。設定・向き・場所が変わったら作り直す。セーブには書かない） */
  pl?: MachinePlan;
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
  /** 一時停止した装置が、途中で止めた反応（分ける装置は処理）の進み具合。止めている間は busy を外してここに預け、動かすとここから続ける */
  offProg?: number;
  /** 設備の名前（プレイヤーが付ける短いメモ。12 文字まで。地図に小さく出す。保存する） */
  memo?: string;
}
/** 列車。p：0 が自分の駅、1 が行き先。back：戻り。to：行き先の駅のキー。held：前の列車を待って止まっている */
export interface Train {
  p: number; back: boolean; cargo: string[]; wait: number; to?: string; held?: boolean;
  /** いま走っている道筋の覚え書き（線路 rtRev・駅の顔ぶれ rtVer のときのもの。セーブには書かない） */
  rt?: Route | null; rtRev?: number; rtVer?: number;
}

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
  /** 課題の工場：学習で得た研究点を足す先（本編の工場）。課題の工場は、やめると捨てるため。保存しない */
  bank?: World;
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
  occ: Map<number, { o: object; t: number }>;
  /** 複数の物質を同時に求める指令で、物質ごとに納めた数。キーは指令（'章:番号'）。章ごとに残り、ほかの章の指令とは混ざらない */
  multi: Record<string, Record<string, number>>;
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
  /** 列車がいるマスの覚え書きの鍵（行きは [2j]、帰りは [2j+1]。敷いた線路の道筋だけ） */
  ok?: Int32Array;
}
const dirBetween = (a: [number, number], b: [number, number]): number => (b[0] === a[0] + 1 && b[1] === a[1] ? 0 : b[0] === a[0] && b[1] === a[1] + 1 ? 1 : b[0] === a[0] - 1 && b[1] === a[1] ? 2 : b[0] === a[0] && b[1] === a[1] - 1 ? 3 : -1);
/** 隣り合う 2 マスを線路でつなぐ。つないだら true（すでに両側からつながっていたら false。片側だけなら、もう片側も足す） */
export function addRail(w: World, a: [number, number], b: [number, number]): boolean {
  const d = dirBetween(a, b);
  if (d < 0 || floorOf(a[1]) || floorOf(b[1])) return false;
  const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`, ma = w.rails.get(ka) || 0, mb = w.rails.get(kb) || 0;
  if ((ma >> d) & 1 && (mb >> ((d + 2) % 4)) & 1) return false;
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
/** マスと、その 4 方向の隣のキー */
export const railCells = (keys: Iterable<string>): Set<string> => {
  const out = new Set<string>();
  for (const k of keys) { const [x, y] = k.split(',').map(Number); out.add(k); for (let d = 0; d < 4; d++) out.add(`${x + DX[d]},${y + DY[d]}`); }
  return out;
};
/**
 * 片側だけのつながりを外す：向き d のつながりは、隣にも向き (d + 2) % 4 のつながりがあるときだけ残す。
 * 線路の範囲をずらす・回すと、外の隣が消えたマスを指したまま残ったり、動かしたマスが知らない隣を指したりするので、そのあとで直す
 */
export function mendRails(w: World, keys: Iterable<string>) {
  let changed = false;
  for (const k of keys) {
    const m = w.rails.get(k);
    if (m === undefined) continue;
    const [x, y] = k.split(',').map(Number);
    let r = m;
    for (let d = 0; d < 4; d++) if ((m >> d) & 1 && !(((w.rails.get(`${x + DX[d]},${y + DY[d]}`) || 0) >> ((d + 2) % 4)) & 1)) r &= ~(1 << d);
    if (r === m) continue;
    if (r) w.rails.set(k, r); else w.rails.delete(k);
    changed = true;
  }
  if (changed) w.railRev++;
}
/** 角のマスを順に結んで線路を敷く（まっすぐな区間は自動で埋める） */
export function layRail(w: World, corners: [number, number][]) {
  for (let i = 1; i < corners.length; i++) {
    let [x, y] = corners[i - 1];
    const [tx, ty] = corners[i];
    // 整数でない角（NaN や 0.5 など）は、いつまでも行き着かないので飛ばす
    if (![x, y, tx, ty].every(Number.isSafeInteger)) continue;
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
// ---- 線路の道探し ----
// 駅が何百もある大きな工場では、「積む駅 × 降ろす駅」の道筋をすべて作っておくことはできない（数万本、1 本が数百マス）。
// そこで、(1) 線路のつながり（どのマスがどの網に属すか）を線路が変わるたびに 1 度だけ調べ、行ける駅はそれで決める。
// (2) 道筋は、列車が実際に走るときに、その組だけを A* で探す（行き先の方へまっすぐ探すので、網が大きくても道の長さほどの手間）。
// (3) 探した道筋は、新しいものから決まった数だけ覚えておく。走っている列車は、自分の道筋を持っている
const R_OFF = 32768, R_W = 65536;
const rk = (x: number, y: number) => (x + R_OFF) * R_W + (y + R_OFF);
/** 線路の網。マスに 0 から順の番号をふり、あとは番号の配列で扱う（探すときに、文字の鍵も、入れ物の作り直しもいらない） */
interface RailNet {
  rev: number; n: number;
  /** マス（数の鍵）→ 番号 */
  idx: Map<number, number>;
  xs: Int32Array; ys: Int32Array;
  /** 番号 i のマスから向き d（0 東・1 南・2 西・3 北）へ進んだ先の番号（たがいに両側からつながっているときだけ。なければ -1） */
  nb: Int32Array;
  /** どの網に属すか（つながったマスどうしが同じ番号） */
  comp: Int32Array;
  // A* の作業場（回ごとの印 stamp で使い回す）
  g: Int32Array; prev: Int32Array; stamp: Int32Array; goal: Int32Array; gen: number;
}
const netCache = new WeakMap<World, RailNet>();
function railNet(w: World): RailNet {
  const c = netCache.get(w);
  if (c && c.rev === w.railRev) return c;
  const n = w.rails.size, idx = new Map<number, number>(), xs = new Int32Array(n), ys = new Int32Array(n), ms = new Uint8Array(n);
  let i = 0;
  for (const [k, m] of w.rails) { const q = k.indexOf(','), x = +k.slice(0, q), y = +k.slice(q + 1); idx.set(rk(x, y), i); xs[i] = x; ys[i] = y; ms[i] = m; i++; }
  const nb = new Int32Array(n * 4).fill(-1), DN = [R_W, 1, -R_W, -1];
  for (i = 0; i < n; i++) {
    const base = rk(xs[i], ys[i]);
    for (let d = 0; d < 4; d++) {
      if (!((ms[i] >> d) & 1)) continue;
      // 隣からもつながっているときだけ進める（片側だけのつながりは、描かれないので走らない）
      const j = idx.get(base + DN[d]);
      if (j !== undefined && (ms[j] >> ((d + 2) % 4)) & 1) nb[i * 4 + d] = j;
    }
  }
  const comp = new Int32Array(n), stack: number[] = [];
  let id = 0;
  for (i = 0; i < n; i++) {
    if (comp[i]) continue;
    comp[i] = ++id; stack.push(i);
    while (stack.length) { const a = stack.pop()!; for (let d = 0; d < 4; d++) { const b = nb[a * 4 + d]; if (b >= 0 && !comp[b]) { comp[b] = id; stack.push(b); } } }
  }
  const net: RailNet = { rev: w.railRev, n, idx, xs, ys, nb, comp, g: new Int32Array(n), prev: new Int32Array(n), stamp: new Int32Array(n), goal: new Int32Array(n), gen: 0 };
  netCache.set(w, net);
  return net;
}
/** 線路の網（読むだけ。番線の色を線路に重ねるときなどに使う） */
export const railGraph = (w: World): { n: number; xs: Int32Array; ys: Int32Array; nb: Int32Array; comp: Int32Array } => railNet(w);
/** 駅 e が触れている線路のマスの番号（railGraph の番号） */
export const stationRailIdx = (w: World, e: Ent): number[] => (w.rails.size ? touchIdx(railNet(w), e) : []);
/** 駅 e に触れている線路のマス（番号） */
function touchIdx(net: RailNet, e: Ent): number[] {
  const out: number[] = [];
  for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) {
    if ((dx === -1 || dx === 2) && (dy === -1 || dy === 2)) continue;
    const i = net.idx.get(rk(e.x + dx, e.y + dy));
    if (i !== undefined) out.push(i);
  }
  return out;
}
/** 探した道筋の覚え書き（線路が変わったら捨てる。新しいものから ROUTE_KEEP 本） */
const ROUTE_KEEP = 3000;
const routeCache = new WeakMap<World, { rev: number; m: Map<string, Route | null> }>();
// A* の順番待ち（見積もりの小さい順。使い回す）
let heapF = new Float64Array(1024), heapN = new Int32Array(1024), heapLen = 0;
const heapPush = (f: number, n: number) => {
  if (heapLen >= heapF.length) { const f2 = new Float64Array(heapF.length * 2), n2 = new Int32Array(heapF.length * 2); f2.set(heapF); n2.set(heapN); heapF = f2; heapN = n2; }
  let i = heapLen++;
  while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapF[i] = heapF[p]; heapN[i] = heapN[p]; i = p; }
  heapF[i] = f; heapN[i] = n;
};
const heapPop = (): number => {
  const top = heapN[0], f = heapF[--heapLen], n = heapN[heapLen];
  let i = 0;
  for (;;) { let c = i * 2 + 1; if (c >= heapLen) break; if (c + 1 < heapLen && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= f) break; heapF[i] = heapF[c]; heapN[i] = heapN[c]; i = c; }
  heapF[i] = f; heapN[i] = n;
  return top;
};
/** 駅 a から駅 b まで、敷いた線路をたどるいちばん短い道筋。つながっていなければ null */
export function railRoute(w: World, a: Ent, b: Ent): Route | null {
  let c = routeCache.get(w);
  if (!c || c.rev !== w.railRev) { c = { rev: w.railRev, m: new Map() }; routeCache.set(w, c); }
  const ck = `${a.x},${a.y}>${b.x},${b.y}`;
  const hit = c.m.get(ck);
  if (hit !== undefined) {
    // 使ったものを新しい側へ（古いものから捨てる）
    if (c.m.size > ROUTE_KEEP / 2) { c.m.delete(ck); c.m.set(ck, hit); }
    return hit ? (hit.dest === b ? hit : { ...hit, dest: b }) : null;
  }
  let found: Route | null = null;
  const net = w.rails.size ? railNet(w) : null, starts = net ? touchIdx(net, a) : [], goals = starts.length ? touchIdx(net!, b) : [];
  // 同じ網に触れていなければ、探すまでもなくつながっていない
  if (net && goals.length && starts.some((s0) => goals.some((g0) => net.comp[g0] === net.comp[s0]))) {
    const { xs, ys, nb, g, prev, stamp, goal } = net, gen = ++net.gen;
    // 行き先までの残りの見積もり：降ろす駅のまわり（線路が触れる範囲）までの、縦横の距離。実際の残りより長くはならない
    const gx0 = b.x - 1, gx1 = b.x + 2, gy0 = b.y - 1, gy1 = b.y + 2;
    const hOf = (i: number) => { const x = xs[i], y = ys[i]; return (x < gx0 ? gx0 - x : x > gx1 ? x - gx1 : 0) + (y < gy0 ? gy0 - y : y > gy1 ? y - gy1 : 0); };
    for (const g0 of goals) goal[g0] = gen;
    heapLen = 0;
    // 同じ見積もりなら、先に進んだもの（残りの少ないもの）を先に：見積もりに、残りのごく小さな割合を足して順をつける
    for (const s0 of starts) { stamp[s0] = gen; g[s0] = 0; prev[s0] = -1; const h = hOf(s0); heapPush(h + h * 1e-6, s0); }
    let end = -1;
    while (heapLen) {
      const i = heapPop();
      if (goal[i] === gen) { end = i; break; }
      const gi = g[i] + 1;
      for (let d = 0; d < 4; d++) {
        const j = nb[i * 4 + d];
        if (j < 0 || (stamp[j] === gen && g[j] <= gi)) continue;
        stamp[j] = gen; g[j] = gi; prev[j] = i;
        const h = hOf(j);
        heapPush(gi + h + h * 1e-6, j);
      }
    }
    if (end >= 0) {
      const tiles: [number, number][] = [];
      for (let i = end; i >= 0; i = prev[i]) tiles.push([xs[i], ys[i]]);
      tiles.reverse();
      const full: [number, number][] = [[a.x + 1, a.y + 1], ...tiles.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]), [b.x + 1, b.y + 1]];
      // 描くときは曲がり角だけ残す
      const pts = full.filter((q, i) => i === 0 || i === full.length - 1 || !((full[i - 1][0] === q[0] && q[0] === full[i + 1][0]) || (full[i - 1][1] === q[1] && q[1] === full[i + 1][1])));
      // 列車がいるマスの覚え書きの鍵（マスの番号 × 4 + 向き）：行きは [2j]、帰りは [2j+1]
      const n = tiles.length, ok = new Int32Array(n * 2);
      { let j = n - 1; for (let i = end; i >= 0; i = prev[i], j--) { ok[j * 2] = i * 4 + tileDir(tiles, n, j, true); ok[j * 2 + 1] = i * 4 + tileDir(tiles, n, j, false); } }
      found = { pts, tiles, dest: b, len: pathLength(full), custom: true, ok };
    }
  }
  c.m.set(ck, found);
  if (c.m.size > ROUTE_KEEP) { const first = c.m.keys().next().value; if (first !== undefined) c.m.delete(first); }
  return found;
}
/** 道筋 tiles の i 番めのマスを、進む向き fwd で通るときの向き（0 東・1 南・2 西・3 北） */
function tileDir(tiles: [number, number][], n: number, i: number, fwd: boolean): number {
  if (n < 2) return 0;
  const k = Math.max(0, Math.min(n - 2, fwd ? i : i - 1)), d = dirBetween(tiles[k], tiles[k + 1]);
  return fwd ? d : (d + 2) % 4;
}
/** 自動の仮線路：横に進んでから縦に曲がる。駅ごとに少しずらす */
function autoRoute(e: Ent, dest: Ent): Route {
  const off = ((((e.x * 7 + e.y * 13) % 5) + 5) % 5 - 2) * 0.24;
  const pts: [number, number][] = [[e.x + 1, e.y + 1 + off], [dest.x + 1 + off, e.y + 1 + off], [dest.x + 1 + off, dest.y + 1]];
  return { pts, tiles: [], dest, len: railLength(e, dest), custom: false };
}
/** 積む駅 e から降ろす駅 to（省くと、いちばん近い行き先）への線路。敷いた線路でつながっていればそれ、なければ自動の仮線路 */
export function railOf(w: World, e: Ent, to?: Ent): Route | null {
  const dest = to ?? stationDests(w, e).list[0];
  if (!dest || dest.kind !== 'station' || dest.role !== 'out' || dest.ch !== e.ch) return null;
  return railRoute(w, e, dest) ?? autoRoute(e, dest);
}
/**
 * 積む駅 e の行き先（近い順）。敷いた線路でつながる降ろす駅があれば、そこだけへ送る（laid。分岐点で枝分かれする）。
 * 1 つもつながっていなければ、同じ番線のすべての降ろす駅へ、自動の仮線路で送る。
 * 道筋は探さず、線路のつながり（網）だけで決める。線路と駅の顔ぶれが変わるまで覚えておく
 */
const destCache = new WeakMap<World, { rev: number; ver: number; m: Map<Ent, { list: Ent[]; laid: boolean }>; nets: Map<Ent, number[]> }>();
const NO_DEST: { list: Ent[]; laid: boolean } = { list: [], laid: false };
export function stationDests(w: World, e: Ent, ver = stationVer(w)): { list: Ent[]; laid: boolean } {
  if (e.kind !== 'station' || e.role !== 'in') return NO_DEST;
  let c = destCache.get(w);
  if (!c || c.rev !== w.railRev || c.ver !== ver) { c = { rev: w.railRev, ver, m: new Map(), nets: new Map() }; destCache.set(w, c); }
  const hit = c.m.get(e);
  if (hit) return hit;
  const ts = stationTargets(w, e);
  let out = { list: ts, laid: false };
  if (ts.length && w.rails.size) {
    const net = railNet(w), cc = c;
    // 駅が触れている網の番号
    const netsOf = (n: Ent) => { let v = cc.nets.get(n); if (!v) { v = [...new Set(touchIdx(net, n).map((t) => net.comp[t]))]; cc.nets.set(n, v); } return v; };
    const mine = netsOf(e);
    if (mine.length) { const laid = ts.filter((d) => netsOf(d).some((id) => mine.includes(id))); if (laid.length) out = { list: laid, laid: true }; }
  }
  c.m.set(e, out);
  return out;
}
/** 積む駅 e の行き先すべての道筋（行き先の数だけ道を探すので、駅の多い工場で毎コマ呼ばない。行き先だけなら stationDests） */
export function stationRoutes(w: World, e: Ent): Route[] {
  const d = stationDests(w, e);
  return d.list.map((t) => (d.laid ? railRoute(w, e, t) : null) ?? autoRoute(e, t));
}


/** 列車が動けない理由。nodest：積む駅に荷があるのに、同じ番線の降ろす駅がない。allfull：降ろす駅がすべて満杯。outfull：満杯の降ろす駅（出口の先が受け取っていない） */
export interface TrainTrouble { type: 'nodest' | 'allfull' | 'outfull'; ch: number; at: Ent; s: string; stations: number; trains: number }
/**
 * 止まっている列車と、その理由の一覧（番線ごとにまとめる。重いものから）。
 * 列車は、行き先がなければ荷を積んだまま駅で待ち、積む駅が満杯になり、その手前の装置まで止まる。画面のどこで起きているかを、探さずに分かるようにする
 */
export function trainTroubles(w: World): TrainTrouble[] {
  const cap = stationCap(w), out: TrainTrouble[] = [], by = new Map<string, TrainTrouble>();
  const loaded = (e: Ent) => { let n = e.tr && e.tr.cargo.length ? 1 : 0; if (e.xtr) for (const t of e.xtr) if (t.cargo.length) n++; return n; };
  for (const e of stationsOf(w)) {
    const ch = e.ch ?? 1, len = e.buf ? e.buf.length : 0;
    if (e.role === 'out') {
      if (len >= cap) out.push({ type: 'outfull', ch, at: e, s: e.buf![0].replace(/^!/, ''), stations: 1, trains: 0 });
      continue;
    }
    const tr = loaded(e);
    if (!len && !tr) continue;
    const ds = stationDests(w, e).list;
    const type = !ds.length ? 'nodest' : ds.every((d) => (d.buf ? d.buf.length : 0) >= cap) ? 'allfull' : null;
    if (!type) continue;
    const k = `${type}:${ch}`, t = by.get(k);
    const s = (e.buf && e.buf[0] ? e.buf[0] : e.tr && e.tr.cargo[0] ? e.tr.cargo[0] : '').replace(/^!/, '');
    if (t) { t.stations++; t.trains += tr; if (len > (t.at.buf ? t.at.buf.length : 0)) { t.at = e; if (s) t.s = s; } }
    else by.set(k, { type, ch, at: e, s, stations: 1, trains: tr });
  }
  return [...[...by.values()].sort((a, b) => b.trains - a.trains || b.stations - a.stations), ...out];
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
/** 章 ch のいまの指令のキー（'章:番号'） */
export const goalKey = (w: World, ch = w.chapter) => `${ch}:${w.progress[ch] || 0}`;
/** 章 ch のいまの指令（複数の物質を同時に求めるもの）で、物質ごとに納めた数 */
export const multiOf = (w: World, ch = w.chapter): Record<string, number> => w.multi[goalKey(w, ch)] ?? {};
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
    ents: new EntMap(), chapter: 0, progress: CHAPTERS.map(() => 0), counts: CHAPTERS.map(() => 0), seen: 0, hubSize: 2, goalMs: {}, srs: {}, exams: [...EXAMS_DEFAULT], calib: { sure: [0, 0], maybe: [0, 0], guess: [0, 0] }, relearn: [], hcLog: [], side: null, night: null, dayMs: {}, tested: [], today: { day: '', wrong: [] }, revDays: {}, ret: RETENTION, bonusDay: '', cleared: [], delivered: {}, stock: {},
    discovered: ['air', 'seawater'], learned: [], mistakes: [], points: 0,
    up: { extract: 0, belt: 0, machine: 0 }, research: [], agents: [], cases: [], solved: [], practice: {}, made: {}, vented: {}, spilled: {}, emitted: {}, grades: {}, fed: {}, multi: {}, rateWin: [], hold: 0, sig: [], rails: new Map(), railRev: 0, occ: new Map(), buckets: [], hour: [], ach: {}, eta: {}, playMs: 0, tick: 0, events: [], fx: [],
    pins: [],
  };
  for (const [x, y] of hubTiles(2)) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
  return w;
}

/** そのマスにあるもの。2×2 の装置は、どのマスを指しても本体を返す */
/**
 * 設備の地図。鍵は "x,y" の文字列（セーブや外の部品はこの形で使う）。同じ中身を、数の鍵でも引けるようにしてある（num）。
 * 工場を進めるとき、1 歩に何万回もマスを調べる。そのたびに文字列をつなぎ、文字列で探すと、それだけで 1 歩の時間の 3 割を使う
 */
// 小さな整数（31 ビット）に収まる鍵にする：入れ物から探すのが速く、数の箱も作られない
const NUM_OFF = 16384, NUM_W = 32768;
const numKey = (x: number, y: number) => (x + NUM_OFF) * NUM_W + (y + NUM_OFF);
const inNum = (x: number, y: number) => x >= -NUM_OFF && x < NUM_OFF && y >= -NUM_OFF && y < NUM_OFF && Number.isInteger(x) && Number.isInteger(y);
export class EntMap extends Map<string, Ent> {
  num = new Map<number, Ent>();
  private static n(k: string): number { const c = k.indexOf(','), x = +k.slice(0, c), y = +k.slice(c + 1); return c > 0 && inNum(x, y) ? numKey(x, y) : -1; }
  /** 置く・消すたびに進む番号（駅の一覧などを、変わったときだけ作り直すため） */
  rev = 0;
  set(k: string, v: Ent): this { const n = EntMap.n(k); if (n >= 0) this.num.set(n, v); this.rev++; return super.set(k, v); }
  delete(k: string): boolean { const n = EntMap.n(k); if (n >= 0) this.num.delete(n); this.rev++; return super.delete(k); }
  clear(): void { this.num.clear(); this.rev++; super.clear(); }
}
export function at(w: World, x: number, y: number): Ent | undefined {
  const m = w.ents as EntMap;
  const e = m.num && inNum(x, y) ? m.num.get(numKey(x, y)) : m.get(key(x, y));
  return e?.kind === 'part' ? e.own ?? w.ents.get(e.ref!) : e;
}
export const sizeOf = (e: Ent) => (e.big ? 2 : 1);
export const footprint = (x: number, y: number, size: number): [number, number][] =>
  size === 1 ? [[x, y]] : [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
/** 本体と、それが占める残りのマスを書き込む */
/**
 * 設備のデータを、すべての欄を同じ順で持つ形にそろえる（ない欄は undefined）。
 * セーブから読んだ設備は、欄の顔ぶれと並びが 1 台ごとに違う（false や空の欄は書かないので）。形がばらばらだと、
 * 何万台もを回る 1 歩と描画で、欄を 1 つ読むたびに遠回りになる。形が 1 つなら、どの欄もまっすぐ読める。
 * undefined の欄は、セーブには書かれない
 */
export function shaped(o: Ent): Ent {
  // 並び：1 歩ごとに読む欄を前に（設備 1 台の欄は、近くにまとまっているほど速く読める）
  const e: Ent = {
    kind: o.kind, x: o.x, y: o.y, dir: o.dir, off: o.off, offProg: o.offProg, big: o.big, ref: o.ref, own: o.own,
    timer: o.timer, u: o.u, n: o.n, res: o.res, resAt: o.resAt, nb: o.nb, nbRev: o.nbRev,
    recipe: o.recipe, pl: o.pl, inBuf: o.inBuf, outBuf: o.outBuf, outOrder: o.outOrder, outSlot: o.outSlot,
    busy: o.busy, prog: o.prog, stuck: o.stuck, bad: o.bad, badT: o.badT, hb: o.hb, pw: o.pw, ts: o.ts,
    item: o.item, items: o.items, rr: o.rr, sub: o.sub, test: o.test, st: o.st, ins: o.ins, li: o.li, pri: o.pri,
    ch: o.ch, role: o.role, buf: o.buf, buf2: o.buf2, buf3: o.buf3, tr: o.tr, xtr: o.xtr, cars: o.cars, rail: o.rail, railTo: o.railTo,
    left: o.left, sealed: o.sealed, cnt: o.cnt, rcn: o.rcn, memo: o.memo,
  };
  // 知らない欄（これより新しい版が書いたものなど）も、落とさずに持っておく
  for (const k in o) if (!(k in e)) (e as unknown as Record<string, unknown>)[k] = (o as unknown as Record<string, unknown>)[k];
  return e;
}
function put(w: World, e: Ent) {
  for (const [x, y] of footprint(e.x, e.y, sizeOf(e))) w.ents.set(key(x, y), x === e.x && y === e.y ? e : { kind: 'part', x, y, dir: 0, ref: key(e.x, e.y), own: e });
}
/** 消したものを元の場所に戻す。場所がふさがっていたら false */
export function restore(w: World, e: Ent): boolean {
  if (footprint(e.x, e.y, sizeOf(e)).some(([x, y]) => w.ents.has(key(x, y)))) return false;
  put(w, e);
  return true;
}
/**
 * 置いたものをずらす：ents を (dx, dy) マスだけ動かす。設定・中身・向きはそのまま。昇降機は、もう一方の階の相方も一緒に動く。
 * 行き先が、動かすもの以外でふさがっていれば何もせず、理由を返す。納品所は動かせない。階はまたげない。
 * もう地図にないもの（消したもの・ずらす前の古い控え）は動かさない。その場所にいまあるものを消してしまうので。
 * 成功したら、消した元の設備と、置いた新しい設備を返す（元に戻すときに使う）。
 */
export function moveEnts(w: World, ents: Ent[], dx: number, dy: number): { ok: true; removed: Ent[]; added: Ent[] } | { ok: false; why: string } {
  const set = new Set<Ent>();
  for (const e0 of ents) {
    if (w.ents.get(key(e0.x, e0.y)) !== e0) continue;
    const e = e0.kind === 'part' ? at(w, e0.x, e0.y) : e0;
    if (!e) continue;
    if (e.kind === 'hub') return { ok: false, why: '納品所は動かせない。' };
    set.add(e);
    if (e.kind === 'lift') { const p = liftPartner(w, e); if (p) set.add(p); }
  }
  if (!set.size) return { ok: false, why: '動かすものがない。' };
  if (!dx && !dy) return { ok: true, removed: [], added: [] };
  // 階をまたぐと、1 階にしか置けない設備や、昇降機の組の決まりを素通りしてしまう
  if (Math.abs(dy) >= FLOOR_DY / 2 || [...set].some((e) => floorOf(e.y + dy) !== floorOf(e.y))) return { ok: false, why: '階をまたいでは動かせない。' };
  for (const e of set) for (const [fx, fy] of footprint(e.x + dx, e.y + dy, sizeOf(e))) {
    const o = at(w, fx, fy);
    if (o && !set.has(o)) return { ok: false, why: o.kind === 'hub' ? '行き先に納品所がある。' : `行き先に${MACHINE_NAME(o)}がある。` };
  }
  const removed = [...set], added: Ent[] = [];
  for (const e of removed) for (const [fx, fy] of footprint(e.x, e.y, sizeOf(e))) w.ents.delete(key(fx, fy));
  for (const e of removed) { const c: Ent = shaped({ ...e, x: e.x + dx, y: e.y + dy, nb: undefined, nbRev: undefined, pl: undefined }); put(w, c); added.push(c); }
  // 走っている列車の行き先の駅をずらしたら、行き先も付け替える（線路がつながっていなければ、列車は引き返す）
  const moved = new Map(removed.filter((e) => e.kind === 'station').map((e) => [key(e.x, e.y), key(e.x + dx, e.y + dy)]));
  if (moved.size) for (const e of w.ents.values()) if (e.kind === 'station') for (const tr of [e.tr, ...(e.xtr ?? [])]) if (tr?.to && moved.has(tr.to)) tr.to = moved.get(tr.to);
  return { ok: true, removed, added };
}
/**
 * 囲んだ範囲の線路を、設備と一緒にずらす。ずらす前の、かかわるマス（動かしたマスとその隣）の線路を返す（元に戻すときに使う）。
 * 行き先にもともとある線路とは、つなぎ目を重ねる。範囲の外とのつながりは切れる（片側だけのつながりは残さない）
 */
export function moveRails(w: World, r: [number, number, number, number], dx: number, dy: number): [string, number | undefined][] {
  const inside: [number, number, number][] = [];
  for (const [k, m] of w.rails) { const [x, y] = k.split(',').map(Number); if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) inside.push([x, y, m]); }
  if (!inside.length || (!dx && !dy)) return [];
  const cells = new Set<string>();
  for (const [x, y] of inside) { cells.add(key(x, y)); cells.add(key(x + dx, y + dy)); }
  const near = railCells(cells);
  const snap = [...near].map((k) => [k, w.rails.get(k)] as [string, number | undefined]);
  for (const [x, y] of inside) w.rails.delete(key(x, y));
  for (const [x, y, m] of inside) { const k = key(x + dx, y + dy); w.rails.set(k, (w.rails.get(k) ?? 0) | m); }
  w.railRev++;
  mendRails(w, near);
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
  const e: Ent = shaped({ kind, x, y, dir });
  if (kind === 'lift') {
    // 昇降機は 2 つで 1 組：置いた側が入口、もう一方の階の同じ場所が出口
    const oy = y + (floorOf(y) ? -FLOOR_DY : FLOOR_DY);
    if (w.ents.has(key(x, oy))) return 'もう一方の階の同じ場所がふさがっている';
    e.item = null; e.role = 'in';
    w.ents.set(key(x, oy), shaped({ kind: 'lift', x, y: oy, dir, item: null, role: 'out' }));
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
/**
 * 貨物駅の役割（積む駅・降ろす駅）を変える。列車に積んでいた荷は駅へ戻し、駅にためていた物もそのまま残す（新しい役割で積む・出す）。
 * 路線番号を変えるだけなら列車はそのままでよい（行き先が合わなくなった列車は、step が荷を積んだまま引き返させる）
 */
export function setStationRole(e: Ent, role: 'in' | 'out') {
  if (e.role === role) return;
  const back = [e.tr, ...(e.xtr ?? [])].flatMap((t) => t?.cargo ?? []);
  e.buf = [...back, ...(e.buf ?? [])];
  e.tr = undefined; e.xtr = undefined;
  e.role = role;
}

export function clearRecipe(e: Ent) {
  e.ts = undefined; e.n = 0; e.u = 0;
  e.recipe = undefined; e.outOrder = undefined; e.outSlot = undefined; e.inBuf = undefined; e.outBuf = undefined; e.busy = false; e.prog = 0; e.offProg = undefined;
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
  e.offProg = undefined;
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

/** 装置がいま止まっている理由。0 動いている、1 原料待ち、2 出口が詰まっている、3 一時停止している */
export const machineState = (e: Ent): 0 | 1 | 2 | 3 => (e.off ? 3 : e.busy ? 0 : outputBlocked(e) ? 2 : 1);

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
  /** 設定済みの装置（一時停止しているものを除く）の、直近の稼働率の平均（0〜1）。装置がなければ null */
  util: number | null;
  machines: number;
  /** 一時停止している設定済みの装置。稼働率・詰まり・原料待ちには数えない */
  paused: number;
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
  const conf = ms.filter((e) => e.recipe), set = conf.filter((e) => !e.off);
  const goalPerMin = sum(m1, 'goal') / mins(6);
  const g = currentGoal(w);
  const left = g ? requiredOf(w, g) - goalCount(w) : 0;
  const made5 = sum(m5, 'made'), lost5 = sum(m5, 'vent') + sum(m5, 'spill');
  return {
    perMin1: sum(m1, 'deliver') / mins(6), perMin5: sum(m5, 'deliver') / mins(30), goalPerMin,
    etaSec: g && goalPerMin > 0 ? (left / goalPerMin) * 60 : null,
    util: set.length ? set.reduce((a, e) => a + (e.u || 0), 0) / set.length : null,
    machines: set.length, paused: conf.length - set.length, jammed: set.filter((e) => (machineState(e) === 2 && (e.stuck || 0) > 2.5) || !!e.bad).length,
    starved: set.filter((e) => machineState(e) === 1 && (e.u || 0) < 0.15).length, unset: ms.length - conf.length,
    wasteRate: made5 > 0 ? Math.min(1, lost5 / made5) : null,
  };
}

/** 学習で得た研究点を足す。課題の工場では、本編の工場（bank）に足す */
export function credit(w: World, n: number) { (w.bank ?? w).points += n; }

/** 初めて正しく設定できた反応に研究点を出す。もらえた点を返す */
export function learn(w: World, r: Recipe, firstTry: boolean): number {
  for (const [s] of r.outputs) discover(w, s);
  if (w.learned.includes(r.id)) return 0;
  w.learned.push(r.id);
  // はじめて覚えた：一度でできたなら「思い出せた」、まちがえながらなら「忘れた」から始める。10 分後に一度確かめる
  w.srs[`r:${r.id}`] = firstCard(firstTry ? 3 : 1, Date.now());
  const gain = firstTry ? 15 : 8;
  credit(w, gain);
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
export function emits(w: World, n: Ent, x: number, y: number, d: Dir, depth = 0): boolean {
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
/**
 * 駅の一覧（工場を 1 歩進めるたび・1 コマ描くたびに 1 度だけ、全部の設備から選び直す）。
 * 同じ回のうちに駅の向き（積む・降ろす）や番線が変わったら、そこで選び直す。
 * 駅が多い大きな工場で、駅ごとに全部の設備を見直さないため
 */
let stationEpoch = 0;
/** 工場を 1 歩進める前と、1 コマ描く前に呼ぶ（駅の一覧を選び直す合図） */
export const markEpoch = () => { stationEpoch++; };
const stationCache = new WeakMap<World, { epoch: number; size: number; erev: number; list: Ent[]; roles: (string | undefined)[]; chs: (number | undefined)[]; pos: number[]; ver: number; outs: Map<number, Ent[]> }>();
let stationVerNo = 0;
/** 駅の顔ぶれ（場所・向き・番線）が変わるたびに変わる番号 */
export const stationVer = (w: World) => { stationsOf(w); return stationCache.get(w)!.ver; };
export function stationsOf(w: World): Ent[] {
  const c = stationCache.get(w), erev = (w.ents as EntMap).rev;
  // 設備を置いても消してもいない（erev が同じ）なら、駅の向きと番線だけ確かめる。erev のない入れ物（古い形）では、回ごとに選び直す
  if (c && c.size === w.ents.size && (erev !== undefined ? c.erev === erev : c.epoch === stationEpoch)) {
    const l = c.list;
    let ok = true;
    for (let i = 0; i < l.length; i++) { const n = l[i]; if (n.role !== c.roles[i] || n.ch !== c.chs[i] || (erev === undefined && at(w, n.x, n.y) !== n)) { ok = false; break; } }
    if (ok) return l;
  }
  const list: Ent[] = [];
  for (const n of w.ents.values()) if (n.kind === 'station') list.push(n);
  const roles = list.map((n) => n.role), chs = list.map((n) => n.ch), pos = list.map((n) => rk(n.x, n.y));
  // 顔ぶれが前と同じなら、番号は変えない（道筋の覚え書きをそのまま使える）
  const same = !!c && c.list.length === list.length && list.every((n, i) => c.list[i] === n && c.roles[i] === roles[i] && c.chs[i] === chs[i] && c.pos[i] === pos[i]);
  const outs = same ? c!.outs : new Map<number, Ent[]>();
  if (!same) for (const n of list) if (n.role === 'out') { const k = n.ch ?? -1; let l = outs.get(k); if (!l) outs.set(k, (l = [])); l.push(n); }
  stationCache.set(w, { epoch: stationEpoch, size: w.ents.size, erev: erev ?? -1, list, roles, chs, pos, ver: same ? c!.ver : ++stationVerNo, outs });
  return list;
}
export function stationTargets(w: World, e: Ent): Ent[] {
  stationsOf(w);
  const out = (stationCache.get(w)!.outs.get(e.ch ?? -1) ?? []).slice();
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
  if (t.off) return 'この先の装置が一時停止している（▶ で動かす）';
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
    const gk = goalKey(w, ch), m = (w.multi[gk] ??= {});
    if ((m[s] || 0) < need) { m[s] = (m[s] || 0) + 1; w.points++; bucket(w).goal++; }
    w.counts[ch] = Math.min(...all.map((x) => m[x] || 0));
    if (w.counts[ch] >= need) { delete w.multi[gk]; finishGoal(w, g, ch); }
    return;
  }
  if (g.s !== s) {
    // 仕分け課題で、同じ試料の別の物質を納めたら減点
    if (g.strict && setById(g.strict)?.members.includes(s)) {
      w.counts[ch] = Math.max(0, w.counts[ch] - 2);
      // 減点は 1 個ずつ。間違いの記録と知らせは、ひと山（quiet は同じ山の 2 個目から）に 1 回。
      // 同じ仕分けの誤りが続いている間（前の誤りから 1 分以内）は、記録を 1 件にまとめる（ほかの間違いの記録を押し出さないように）
      if (!quiet) {
        const now = Date.now(), last = w.mistakes[w.mistakes.length - 1];
        if (last && last.machine === 'analysis' && last.part === 'isomer' && last.recipe === g.s && now - last.t < 60000) last.t = now;
        else w.mistakes.push({ machine: 'analysis', recipe: g.s, part: 'isomer', t: now });
        w.events.push('wrong-sample');
      }
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
/** 物質ごとの、納品所が飲み込む元素と数（化学式を読むのは、物質ごとに 1 度だけ） */
const feedAtoms = new Map<string, Record<string, number> | null>();
function feed(w: World, s: string) {
  let atoms = feedAtoms.get(s);
  if (atoms === undefined) {
    const su = sub(s);
    let all: Record<string, number> = {};
    try { if (su.formula) all = parseFormula(su.formula); else for (const el of su.rep ?? []) all[el] = (all[el] || 0) + 1; atoms = {}; for (const el in all) if (ELEMENTS.some((e) => e.sym === el)) atoms[el] = all[el]; } catch { atoms = null; }
    feedAtoms.set(s, atoms);
  }
  if (!atoms) return;
  for (const el in atoms) {
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
  return pushInto(w, at(w, x, y), x, y, d, s, rc, n, dry);
}
/**
 * 正面の設備（ベルトと採取機は、向きの先の 1 マス）。置く・消すが起きるまで覚えておく
 * （何千台も並ぶ工場で、毎歩、設備ごとに隣を探し直さない）。セーブには書かない
 */
function ahead(w: World, e: Ent, erev: number | undefined): Ent | undefined {
  if (erev === undefined) return at(w, e.x + DX[e.dir], e.y + DY[e.dir]);
  // いまの顔ぶれの番号で確かめる（1 歩の途中で設備が消えたときも、消えた設備へ渡さない）
  const now = (w.ents as EntMap).rev;
  if (e.nbRev !== now) { e.nb = at(w, e.x + DX[e.dir], e.y + DY[e.dir]) ?? null; e.nbRev = now; }
  return e.nb ?? undefined;
}
/** push と同じ。受け取る側 t がわかっているとき */
function pushInto(w: World, t: Ent | undefined, x: number, y: number, d: Dir, s: string, rc?: boolean, n = 1, dry = false): boolean {
  const N = n > 1 ? n : undefined;
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
      if (fxRoom > 0) { fxRoom--; w.fx.push({ x, y, type: 'vent', s }); }
      return true;
    case 'extractor':
    case 'depot':
    case 'sampler':
      return false;
    default: {
      // 反応は、装置の段取りの覚え書きがあればそこから（毎回、表を引かない）
      const tp = t.pl, r = tp && tp.rid === t.recipe ? tp.r : recipeById(t.recipe);
      if (!r || !t.inBuf) return false;
      // 電解槽は、電池の e⁻ を受け取ると、そのあいだ 2 倍の速さで動く
      if (s === 'e' && r.machine === 'electrolyzer') {
        if ((t.pw || 0) > POWER_MAX - POWER_SEC) return false;
        if (dry) return true;
        t.pw = Math.min(POWER_MAX, (t.pw || 0) + POWER_SEC * n);
        return true;
      }
      let need = 0;
      for (let i = 0; i < r.inputs.length; i++) if (r.inputs[i][0] === s) { need = r.inputs[i][1]; break; }
      // 使わない物質は受け取らない。ベルトはそこで止まるので、理由がわかるように印をつける
      if (!need) { t.bad = s; t.badT = w.tick; return false; }
      // 入れすぎた分はあふれて捨てる（1 本のベルトに混ぜても詰まらない）
      // 反応 4 回ぶんたまるまでは、荷を丸ごと受け取る。それ以上は、
      //  - ほかの原料が足りなくて動けないとき：あふれて捨てる（1 本のベルトに混ぜても、余った方が道をふさがない）
      //  - 原料がそろっていて動けるとき：受け取らずに待たせる（使い切れない分を捨てない。まとまった荷が着いても無駄にならない）
      const cap = need * 4, have = t.inBuf[s] || 0;
      if (have >= cap) {
        let starved = false;
        for (let i = 0; i < r.inputs.length; i++) if (r.inputs[i][0] !== s && (t.inBuf[r.inputs[i][0]] || 0) < r.inputs[i][1]) { starved = true; break; }
        if (w.noSpill || !starved) return false;
        if (dry) return true;
        if (fxRoom > 0) { fxRoom--; w.fx.push({ x, y, type: 'spill', s }); } bump(w.spilled, s, n); bucket(w).spill += n; tally(w, s, 3, n);
        return true;
      }
      if (dry) return true;
      t.inBuf[s] = have + n;
      return true;
    }
  }
}

/** 飾りの出来事（react・vent・spill）を、いまの 1 歩であと何個作ってよいか。step の外では、いくつでも */
const FX_STEP = 48;
let fxRoom = Infinity;
/**
 * 1 歩で動かす設備の一覧（置いた順。何もしない設備＝大きな装置の残りのマス・廃棄口・納品所は入れない）。置く・消すが起きるまで覚えておく。
 * all：ぜんぶ。fast：毎歩動かすもの（ベルト・駅と列車など、動きが見えるもの）。slow[0..3]：採取機と反応装置を、場所で 4 つの組に分けたもの
 */
interface StepLists { rev: number; all: Ent[]; fast: Ent[]; slow: Ent[][]; nSlow: number }
const stepCache = new WeakMap<World, StepLists>();
function stepLists(w: World, erev: number | undefined): StepLists {
  const c = stepCache.get(w);
  if (c && erev !== undefined && c.rev === erev) return c;
  const out: StepLists = { rev: erev ?? -1, all: [], fast: [], slow: [[], [], [], []], nSlow: 0 };
  for (const e of w.ents.values()) {
    if (e.kind === 'part' || e.kind === 'vent' || e.kind === 'hub') continue;
    out.all.push(e);
    if (e.kind === 'extractor' || isMachine(e.kind)) { out.slow[(e.x * 7 + e.y * 13) & 3].push(e); out.nSlow++; } else out.fast.push(e);
  }
  if (erev !== undefined) stepCache.set(w, out);
  return out;
}
/**
 * とても大きな工場（採取機と反応装置が STAG_MIN 台を超える）では、採取機と反応装置を 4 歩に 1 回、4 歩ぶんの時間をまとめて進める
 * （組ごとに 1 歩ずつずらす）。採れる数・反応の回数は同じで、1 歩で回る台数が 4 分の 1 になる。組ごとの、まだ進めていない時間をここに持つ
 */
const STAG_MIN = 3000;
const stagAcc = new WeakMap<World, Float64Array>();
/** 装置 e の段取り。設定（反応・出口の並びと場所）・向き・場所が同じあいだは、前のものを使う */
function planOf(e: Ent): MachinePlan | null {
  const p = e.pl;
  if (p && p.rid === e.recipe && p.oo === e.outOrder && p.os === e.outSlot && p.dir === e.dir && p.x === e.x && p.y === e.y) return p;
  const r = recipeById(e.recipe), oo = e.outOrder;
  if (!r || !oo) { e.pl = undefined; return null; }
  const k: number[] = [], tx: number[] = [], ty: number[] = [], td: Dir[] = [], t: (Ent | null)[] = [];
  for (let i = 0; i < oo.length; i++) {
    let c = 1;
    for (const o of r.outputs) if (o[0] === oo[i]) { c = o[1]; break; }
    const q = outPort(e, i);
    k.push(c); tx.push(q.tx); ty.push(q.ty); td.push(q.d); t.push(null);
  }
  return (e.pl = { r, rid: r.id, oo, os: e.outSlot, dir: e.dir, x: e.x, y: e.y, k, tx, ty, td, t, tRev: -1 });
}
/** 出口に、ためておける量（反応 hb 回ぶん）以上たまっている生成物があるか */
function planBlocked(pl: MachinePlan, ob: number[], hb: number): boolean {
  for (let i = 0; i < pl.k.length; i++) if (ob[i] >= pl.k[i] * hb) return true;
  return false;
}
/** 原料が 1 回ぶんそろっているか */
function planFed(r: Recipe, ib: Record<string, number>): boolean {
  for (let i = 0; i < r.inputs.length; i++) if ((ib[r.inputs[i][0]] || 0) < r.inputs[i][1]) return false;
  return true;
}
/** たまっている生成物を、出口から出す。たまっている分は、ひとまとめの荷にして出す（1 個ずつ出すと、係数の大きい生成物で詰まる） */
function planFlush(w: World, e: Ent, pl: MachinePlan, ob: number[], erev: number | undefined) {
  for (let i = 0; i < pl.k.length; i++) {
    if (ob[i] <= 0) continue;
    const k = ob[i] < STACK_MAX ? ob[i] : STACK_MAX;
    let t: Ent | undefined;
    if (erev === undefined) t = at(w, pl.tx[i], pl.ty[i]);
    else {
      // 出す先の設備は、置く・消すが起きるまで覚えておく（1 歩の途中で消えたときも、探し直す）
      const now = (w.ents as EntMap).rev;
      if (pl.tRev !== now) { for (let q = 0; q < pl.k.length; q++) pl.t[q] = at(w, pl.tx[q], pl.ty[q]) ?? null; pl.tRev = now; }
      t = pl.t[i] ?? undefined;
    }
    if (pushInto(w, t, pl.tx[i], pl.ty[i], pl.td[i], pl.oo[i], undefined, k)) ob[i] -= k;
  }
}
/** 降ろす駅が 1 歩に出せる荷の数（1 荷は STACK_MAX 個まで）と、先頭から飛ばせる物質の種類の数 */
const OUT_PUSHES = 16, OUT_SKIP = 4;
/** 降ろす駅が満杯で降ろせない列車が、荷を積んだまま引き返すまでの時間（秒） */
export const TRAIN_GIVE_UP = 4;
const occRev = new WeakMap<World, number>();
/** 積む駅 e の列車 1 本を、1 歩進める（毎歩・列車ごとに呼ぶので、ここでは配列も関数も作らない） */
function runTrain(w: World, e: Ent, tr: Train, buf: string[], dt: number, sver: number) {
  if (tr.p <= 0 && !tr.back) {
    const cap = trainCap(w);
    if (buf.length && tr.cargo.length < cap) { const got = buf.splice(0, cap - tr.cargo.length); for (let i = 0; i < got.length; i++) tr.cargo.push(got[i]); }
    tr.wait += dt;
    // 満載か、少し待っても増えなければ発車する
    if (tr.cargo.length && (tr.cargo.length >= cap || tr.wait > 2.5)) {
      // 行き先は順番に配る。満杯の降ろす駅は飛ばす（出口が詰まった駅へ、列車を送り続けない）。どこも満杯なら、空くまで駅で待つ
      const ds = stationDests(w, e, sver).list, capS = stationCap(w);
      for (let q = 1; q <= ds.length; q++) {
        const i = ((e.rr || 0) + q) % ds.length, to = ds[i];
        if ((to.buf ? to.buf.length : 0) >= capS) continue;
        e.rr = i; tr.to = key(to.x, to.y); tr.p = 1e-6; tr.wait = 0; tr.rt = undefined;
        break;
      }
    }
    return;
  }
  // 道筋は、線路と駅の顔ぶれが変わるまで、列車が覚えている（毎歩、探し直さない）
  let route: Route | null;
  if (tr.rt !== undefined && tr.rtRev === w.railRev && tr.rtVer === sver) route = tr.rt;
  else {
    const d0 = tr.to ? w.ents.get(tr.to) : undefined;
    route = d0 && d0.kind === 'station' && d0.role === 'out' && d0.ch === e.ch ? railOf(w, e, d0) : null;
    tr.rt = route; tr.rtRev = w.railRev; tr.rtVer = sver;
  }
  const dest = route ? route.dest : undefined;
  if (!route) tr.back = true; // 行き先がなくなった：引き返す
  const v = (trainSpeed(w) * (route?.custom ? RAIL_BOOST : 1) * dt) / (route?.len ?? 12);
  // 敷いた線路は、ほかの駅の列車と共有する。同じ向きに走る前の列車がすぐ先にいれば、止まって待つ
  const tiles = route?.custom ? route.tiles : null, n = tiles ? tiles.length : 0, okeys = route?.ok;
  let held = false;
  if (okeys && n) {
    const i = Math.max(0, Math.min(n - 1, Math.round(tr.p * (n - 1)))), fwd = !tr.back, st = fwd ? 1 : -1;
    for (let q = 1; q <= 2; q++) {
      const j = i + st * q;
      if (j < 0 || j >= n) continue;
      const o = w.occ.get(okeys![j * 2 + (fwd ? 0 : 1)]);
      if (o && o.o !== tr && o.t >= w.tick - 1) held = true;
    }
  }
  tr.held = held || undefined;
  if (!tr.back) {
    if (!held) tr.p = Math.min(1, tr.p + v);
    if (tr.p >= 1) {
      const db = (dest!.buf ??= []), room = stationCap(w) - db.length;
      if (tr.cargo.length && room > 0) {
        const got = tr.cargo.splice(0, room);
        for (let i = 0; i < got.length; i++) db.push(got[i]);
        w.fx.push({ x: dest!.x + 1, y: dest!.y + 1, type: 'train', s: got[0].replace(/^!/, ''), n: got.length });
        tr.wait = 0;
      }
      if (!tr.cargo.length) { tr.back = true; tr.wait = 0; e.n = (e.n || 0) + 1; }
      else {
        // 満杯で降ろせない：しばらく待って空かなければ、残りの荷を積んだまま引き返す（戻ったら、空いている駅へ出直す）。
        // 待ち続けると、出口の詰まった駅 1 つの前に、番線じゅうの列車が集まって止まってしまう
        tr.wait += dt;
        if (tr.wait > TRAIN_GIVE_UP) { tr.back = true; tr.wait = 0; }
      }
    }
  } else {
    if (!held) tr.p = Math.max(0, tr.p - v);
    if (tr.p <= 0) { tr.p = 0; tr.back = false; if (tr.cargo.length) buf.unshift(...tr.cargo.splice(0)); }
  }
  if (okeys && n && (tr.p > 0 || tr.back)) {
    const i = Math.max(0, Math.min(n - 1, Math.round(tr.p * (n - 1)))), k = okeys![i * 2 + (tr.back ? 1 : 0)], o = w.occ.get(k);
    if (o) { o.o = tr; o.t = w.tick; } else w.occ.set(k, { o: tr, t: w.tick });
  }
}

export function step(w: World, dt: number) {
  markEpoch();
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
  // 鍵は線路のマスの番号なので、線路が変わったら捨てる（次の 1 歩で、走っている列車が書き直す）
  if (occRev.get(w) !== w.railRev) { w.occ.clear(); occRev.set(w, w.railRev); }
  const speed = beltSpeed(w), every = extractInterval(w), rate = machineRate(w), kU = 1 - Math.exp(-dt / UTIL_TAU);
  // 駅の顔ぶれの番号は、1 歩のあいだ変わらない（駅ごとに確かめ直さない）
  const sver = stationVer(w);
  const erev: number | undefined = (w.ents as EntMap).rev;
  // 飾りの出来事（煙・土ぼこり・火花）は、1 歩に FX_STEP 個まで（何千台もが同時に動く工場で、画面に出せない数の出来事を作らない）
  fxRoom = FX_STEP;
  // 何もしない設備（大きな装置の残りのマス・廃棄口・納品所）を除いた一覧を、置いた順のまま回る
  const sl = stepLists(w, erev), huge = sl.nSlow > STAG_MIN, dt0 = dt, kU0 = kU;
  let acc = stagAcc.get(w);
  if (!acc) stagAcc.set(w, (acc = new Float64Array(4)));
  const ph = w.tick & 3;
  if (huge) for (let q = 0; q < 4; q++) acc[q] += dt0; else acc.fill(0);
  const dtS = acc[ph];
  if (huge) acc[ph] = 0;
  const kUS = 1 - Math.exp(-dtS / UTIL_TAU);
  // 大きな工場：まず毎歩動かすもの、次に、この歩の番の組の採取機と反応装置（まとめた時間 dtS で）
  for (let pass = 0; pass < (huge ? 2 : 1); pass++) {
  const list = !huge ? sl.all : pass === 0 ? sl.fast : sl.slow[ph], stag = pass === 1;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const dt = stag ? dtS : dt0, kU = stag ? kUS : kU0;
  for (let li = 0; li < list.length; li++) {
    const e = list[li];
    // この 1 歩の途中で設備が消えたとき（納品所が広がったときなど）：消えた設備は動かさない
    if (erev !== undefined && (w.ents as EntMap).rev !== erev && at(w, e.x, e.y) !== e) continue;
    // 一時停止している装置は、反応も採取も出すことも止める（途中の反応・ためた物はそのまま残る）。
    // 途中の反応は busy から offProg へ預ける（止めている間は「動いている」ことにしない）。稼働率は下がっていき、詰まり・受け取れない物質の印は外す
    if (e.off) {
      if (e.busy) { e.offProg = e.prog || 0; e.busy = false; e.prog = 0; }
      if (isMachine(e.kind) || e.kind === 'extractor') e.u = (e.u ?? 0) * (1 - kU);
      if (e.stuck) e.stuck = 0;
      if (e.bad) e.bad = undefined;
      continue;
    }
    // 動かしたら、預けた反応の続きから
    if (e.offProg !== undefined) { e.busy = true; e.prog = e.offProg; e.offProg = undefined; }
    switch (e.kind) {
      case 'belt': {
        const it = e.item;
        if (!it) break;
        it.p = Math.min(1, it.p + speed * dt);
        if (it.p >= 1 && it.m !== w.tick) { if (pushInto(w, ahead(w, e, erev), e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s, it.rc, it.n)) e.item = null; else it.w = (it.w || 0) + dt; }
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
        const outs: number[] = [];
        for (let k = 0; k < 3; k++) { const i = ((e.rr || 0) + k) % 3, d = portDir(e.dir, i); if (push(w, e.x + DX[d], e.y + DY[d], d, it.s, it.rc, 1, true)) outs.push(i); }
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
            if (fxRoom > 0) { fxRoom--; w.fx.push({ x: e.x + 0.5, y: e.y + 0.5, type: 'react', s: r.side ?? r.main ?? r.side2 ?? e.item.s }); }
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
        const cap = every * SOURCE_HOLD, full = (e.timer || 0) >= cap - 1e-9;
        // いっぱいで、出口を確かめる番でもない歩：何も変わらない（稼働率だけ下がる）。何千台も並ぶ畑で、ここが 1 歩の大半
        // （4 歩に 1 回まとめて進めるときは、来るたびに出口を確かめる）
        if (full && !stag && ((w.tick + e.x * 7 + e.y * 13) & 3) !== 0) { e.timer = cap; e.u = (e.u ?? 1) * (1 - kU); break; }
        // まとめて進めるときは、その間に採れた分をためられるように（ためられる量より長い時間をまとめても、採れる数が減らない）
        e.timer = Math.min((e.timer || 0) + dt, stag && !full ? Math.max(cap, dt + every) : cap);
        const k = Math.floor(e.timer / every + 1e-9);
        // いっぱいまでためて出口がふさがったままの採取機は、4 歩に 1 回だけ出口を確かめる（何千台も並ぶ畑で、毎歩すべての出口を調べない。場所でずらす）
        if (k >= 1 && (!full || stag || ((w.tick + e.x * 7 + e.y * 13) & 3) === 0)) {
          // 採れる資源は場所で決まる。場所が変わるまで覚えておく
          const at2 = e.x * 65536 + e.y;
          if (e.resAt !== at2) { e.res = resourceAt(e.x, e.y); e.resAt = at2; }
          if (pushInto(w, ahead(w, e, erev), e.x + DX[e.dir], e.y + DY[e.dir], e.dir, e.res!, undefined, k)) { e.timer = Math.max(0, e.timer - k * every); e.n = (e.n || 0) + k; tally(w, e.res!, 0, k); }
        }
        if (e.timer > cap) e.timer = cap;
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
          // 続く同じ物質を荷にまとめて出す。出口の先が受け取るかぎり、1 歩のうちに何荷でも出す
          // （1 歩に 1 荷までだと、出せる量が計算の歩数で決まってしまい、納品所へじかに降ろしても列車が待つ）。
          // 先頭の物質を出口の先が受け取らないときは、その物質を飛ばして、うしろの別の物質を出す
          // （いろいろな物質が届く駅で、1 つの物質のために全部が止まらないように。飛ばすのは OUT_SKIP 種類まで）
          let start = 0, skipped = 0;
          for (let tries = 0; tries < OUT_PUSHES && start < buf.length; tries++) {
            const s0 = buf[start], rc = s0.startsWith('!');
            let q = 1;
            while (q < STACK_MAX && start + q < buf.length && buf[start + q] === s0) q++;
            let ok = false;
            for (let k = 0; k < 2; k++) {
              const i = ((e.rr || 0) + k) % 2, p = slotPort(e, i);
              if (push(w, p.tx, p.ty, p.d, rc ? s0.slice(1) : s0, rc, q)) { buf.splice(start, q); e.rr = (i + 1) % 2; e.n = (e.n || 0) + q; ok = true; break; }
            }
            if (ok) continue;
            if (++skipped > OUT_SKIP) break;
            let j = start + q;
            while (j < buf.length && buf[j] === s0) j++;
            start = j;
          }
          break;
        }
        // 積む駅：列車を走らせる。編成は 3 つまで増やせる。降ろす駅がいくつもあれば、順番に配る（分岐）
        e.tr ??= { p: 0, back: false, cargo: [], wait: 0 };
        const xtr = (e.xtr ??= []), want = Math.min(maxCars(w), e.cars || 1);
        while (xtr.length + 1 < want) xtr.push({ p: 0, back: false, cargo: [], wait: 0 });
        // 減らしたときは、駅に戻っている空の編成から外す
        while (xtr.length > Math.max(0, want - 1)) { const k = xtr.findIndex((t2) => t2.p <= 0 && !t2.back && !t2.cargo.length); if (k < 0) break; xtr.splice(k, 1); }
        for (let ti = -1; ti < xtr.length; ti++) runTrain(w, e, ti < 0 ? e.tr : xtr[ti], buf, dt, sver);
        break;
      }
      case 'vent':
      case 'hub':
      case 'part':
        break;
      default: {
        if (!e.recipe || !e.inBuf || !e.outBuf || !e.outOrder) break;
        const pl = planOf(e);
        if (!pl) break;
        const r = pl.r, ob = e.outBuf, ib = e.inBuf, no = pl.k.length, mul = (e.pw || 0) > 0 ? 2 : 1;
        if (e.bad && w.tick - (e.badT || 0) > 45) e.bad = undefined;
        // 出口にためておける量：ベルトが HOLD_TILES マス進む間にできる分。機械がベルトより速くても、出口の先が流れていれば止まらない
        const hb = (e.hb = Math.max(1, Math.ceil((HOLD_TILES / speed) / (r.time / (rate * mul)))));
        // まとめた時間が反応 1 回の半分より長いときは、細かく分けて進める（まとめて進めても、反応の回数が減らないように）
        const reps = stag ? Math.max(1, Math.ceil((dt * rate * mul) / r.time / 0.5)) : 1, dtm = dt / reps;
        for (let rp = 0; rp < reps; rp++) {
        if (!e.busy) {
          // 出口にためておける量を超えた生成物があるうちは、次の反応を始めない（副生成物を放置すると、ここで詰まる）
          if (!planBlocked(pl, ob, hb) && planFed(r, ib)) {
            for (let q = 0; q < r.inputs.length; q++) { ib[r.inputs[q][0]] -= r.inputs[q][1]; tally(w, r.inputs[q][0], 1, r.inputs[q][1]); }
            e.busy = true;
            e.prog = 0;
          }
        } else {
          e.prog = (e.prog || 0) + (dtm * rate * mul) / r.time;
          if (e.pw) e.pw = Math.max(0, e.pw - dtm);
          if (e.prog >= 1) {
            const over = e.prog - 1;
            e.busy = false;
            e.prog = 0;
            if (fxRoom > 0) { fxRoom--; w.fx.push({ x: e.x + (sizeOf(e) - 1) / 2, y: e.y + (sizeOf(e) - 1) / 2, type: 'react', s: pl.oo[0] }); }
            e.n = (e.n || 0) + 1;
            for (let q = 0; q < no; q++) {
              const s2 = pl.oo[q], k = pl.k[q];
              ob[q] += k;
              if (s2 !== 'e') { bump(w.made, s2, k); bucket(w).made += k; tally(w, s2, 0, k); }
              discover(w, s2);
            }
            planFlush(w, e, pl, ob, erev);
            // 続けて動けるなら、同じコマのうちに次を始め、余った時間も持ち越す（1 回ごとに 1 コマ休むと、速い装置ほど表示の速さより遅くなる）
            if (!planBlocked(pl, ob, hb) && planFed(r, ib)) {
              for (let q = 0; q < r.inputs.length; q++) { ib[r.inputs[q][0]] -= r.inputs[q][1]; tally(w, r.inputs[q][0], 1, r.inputs[q][1]); }
              e.busy = true;
              e.prog = Math.min(over, 0.99);
            }
          }
        }
        }
        planFlush(w, e, pl, ob, erev);
        // いまの状態（machineState と同じ。ここに来るのは一時停止していない装置だけ）
        const blocked = !e.busy && planBlocked(pl, ob, hb);
        e.stuck = blocked ? (e.stuck || 0) + dt : 0;
        const st = e.busy ? 0 : blocked ? 2 : 1;
        (e.ts ??= [0, 0, 0])[st] += dt;
        e.u = (e.u || 0) + ((st === 0 ? 1 : 0) - (e.u || 0)) * kU;
      }
    }
  }
  }
}

// ---- 保存 ----

export const SAVE_VERSION = 2;
/** 工場の名前の長さ（文字） */
export const FNAME_MAX = 20;

/**
 * セーブを小さくする：設備の欄のうち、null と false は書かない（読むときは、ないのと同じに扱う）。
 * 整数でない数（進み具合・待ち時間・時計）は小数 3 桁まで（1 ミリ秒・0.1 % より細かい違いは、遊びに出ない）
 */
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const slim = (k: string, v: unknown) => (v === null || v === false || k === 'res' || k === 'resAt' || k === 'nb' || k === 'nbRev' || k === 'pl' || k === 'own' || k === 'rt' || k === 'rtRev' || k === 'rtVer' ? undefined : typeof v === 'number' && !Number.isInteger(v) && Number.isFinite(v) ? round3(v) : v);
/** 設備の一覧だけを、欄を整えながら 1 回で文字にする（配列の中の null は、場所を保つためにそのまま） */
/**
 * 駅や列車にためた物の並びを、短く書く：同じ物が続く所は「物質, 個数」にまとめる（["N2", 1200] ＝ N2 が 1200 個）。
 * 大きな工場では、駅と列車の荷だけでセーブの大半を占める（1 個ずつ書くと、駅 1 つで数千字）
 */
const RLE_KEYS = new Set(['buf', 'buf2', 'buf3', 'cargo']);
function rle(a: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < a.length;) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i]);
    if (j - i > 1 && typeof a[i] === 'string') out.push(j - i); else j = i + 1;
    i = j;
  }
  return out;
}
/** rle の逆。数は、直前の物質の個数。古いセーブ（1 個ずつ）もそのまま読める。全部で LIST_MAX 個まで */
const LIST_MAX = 20000;
/** セーブに書かない欄（1 歩や描画のための覚え書き） */
const DROP_KEYS = new Set(['res', 'resAt', 'nb', 'nbRev', 'pl', 'own', 'rt', 'rtRev', 'rtVer']);
/**
 * セーブに書く形に写す：null・false・undefined と覚え書きの欄は落とし、整数でない数は小数 3 桁に、荷の並びはまとめる。
 * （文字にするときに欄ごとに関数を呼ぶより、先に小さな写しを作るほうが速い。設備は、すべての欄を持つ形にそろえてあるので、欄が多い）
 */
function pack(v: unknown): unknown {
  if (typeof v === 'number') return Number.isInteger(v) || !Number.isFinite(v) ? v : round3(v);
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) { const out = new Array<unknown>(v.length); for (let i = 0; i < v.length; i++) out[i] = pack(v[i]); return out; }
  const o = v as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k in o) {
    const x = o[k];
    if (x === undefined || x === null || x === false || DROP_KEYS.has(k)) continue;
    out[k] = RLE_KEYS.has(k) && Array.isArray(x) && x.length > 1 ? pack(rle(x)) : pack(x);
  }
  return out;
}
/**
 * 設備の一覧を、小さく書く。大きな工場では、設備がセーブのほとんどを占める（同じ機種・同じ設定の設備が、何千・何万と並ぶ）。
 *  - 設備ごとに変わらない欄（機種・向き・反応・出口の並び・番線など）は「型」として 1 度だけ書き、設備は「型の番号, x, y, 設備ごとの値…」の並びにする
 *  - 読み直せばすぐ戻る値は書かない：稼働率・出口にためておける量・詰まりの印・採取や搬出の端数（読んだあと数秒で元に戻る）
 *  - 時間の合計は秒まで、進み具合は 2 桁まで
 * 前の形（設備を 1 つずつ欄の名前つきで書いたもの）も、そのまま読める
 */
const SAVE_DROP = new Set(['u', 'hb', 'bad', 'badT', 'stuck', 'timer']);
/** 設備ごとに違う値の欄（この順で並べる） */
const ROW_KEYS = ['n', 'prog', 'ts', 'inBuf', 'outBuf', 'item', 'items', 'buf', 'buf2', 'buf3', 'tr', 'xtr', 'rr', 'cnt', 'rcn', 'pw', 'offProg', 'left', 'memo'];
const ROW_SET = new Set(ROW_KEYS);
interface EntTpl { o: Record<string, unknown>; k: string[]; ik?: string[] }
const round2 = (v: number) => Math.round(v * 100) / 100;
/** 荷：動かした歩の番号（読むと 0 に戻る）は書かない。位置は 2 桁、待った時間は 0.1 秒まで */
const slimItem = (it: unknown): unknown => {
  if (!it || typeof it !== 'object') return it;
  const o = it as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k in o) { const v = o[k]; if (k === 'm' || v === undefined || v === null || v === false) continue; out[k] = k === 'p' && typeof v === 'number' ? round2(v) : k === 'w' && typeof v === 'number' ? Math.round(v * 10) / 10 : v; }
  return out;
};
/** 列車を、並びで書く：[位置, 行き先（なければ 0）, 帰り道なら 1, 待った時間, 荷（まとめた形）…] */
const slimTrain = (t: unknown): unknown => {
  if (!t || typeof t !== 'object') return t;
  const o = t as Record<string, unknown>;
  return [typeof o.p === 'number' ? Math.round(o.p * 10000) / 10000 : 0, typeof o.to === 'string' ? o.to : 0, o.back ? 1 : 0, typeof o.wait === 'number' ? Math.round(o.wait * 10) / 10 : 0, ...(Array.isArray(o.cargo) ? o.cargo : [])];
};
const fatTrain = (t: unknown): unknown => (Array.isArray(t) ? { p: t[0], to: typeof t[1] === 'string' ? t[1] : undefined, back: t[2] === 1, wait: t[3], cargo: t.slice(4) } : t);
/**
 * 書く形：c ＝ 型の一覧、g ＝ 型ごとの組 [型の番号, 設備の数, 数の並び]。数の並びは、設備ごとに「前の設備からの y の差, x の差, 設備ごとの値…」。
 * 同じ型の設備は、上から下・左から右の順に並べるので、差は小さな数になる（何万台の採取機でも、1 台あたり数文字）
 */
export function packEnts(list: Ent[]): { c: EntTpl[]; g: unknown[][] } {
  const c: EntTpl[] = [], index = new Map<string, number>(), rows: { x: number; y: number; v: unknown[] }[][] = [];
  for (const e of list) {
    const p = pack(e) as Record<string, unknown>, o: Record<string, unknown> = {}, k: string[] = [];
    for (const key in p) if (key !== 'x' && key !== 'y' && !ROW_SET.has(key) && !SAVE_DROP.has(key)) o[key] = p[key];
    for (const key of ROW_KEYS) if (p[key] !== undefined) k.push(key);
    const ik = p.inBuf && typeof p.inBuf === 'object' ? Object.keys(p.inBuf as object) : undefined;
    const tk = JSON.stringify(o) + '|' + k.join(',') + '|' + (ik ? ik.join(',') : '');
    let ti = index.get(tk);
    if (ti === undefined) { ti = c.length; index.set(tk, ti); c.push(ik ? { o, k, ik } : { o, k }); rows.push([]); }
    const v: unknown[] = [];
    for (const key of k) {
      const x = p[key];
      v.push(key === 'inBuf' ? ik!.map((q) => (p.inBuf as Record<string, unknown>)[q])
        : key === 'ts' && Array.isArray(x) ? x.map((q) => (typeof q === 'number' ? Math.round(q) : q))
        : key === 'prog' && typeof x === 'number' ? round2(x)
        : key === 'item' ? slimItem(x) : key === 'items' && Array.isArray(x) ? x.map(slimItem)
        : key === 'tr' ? slimTrain(x) : key === 'xtr' && Array.isArray(x) ? x.map(slimTrain) : x);
    }
    rows[ti].push({ x: e.x, y: e.y, v });
  }
  const g: unknown[][] = [];
  rows.forEach((l, ti) => {
    l.sort((a, b) => a.y - b.y || a.x - b.x);
    const flat: unknown[] = [];
    let px = 0, py = 0;
    for (const r of l) { flat.push(r.y - py, r.x - px); for (const q of r.v) flat.push(q); px = r.x; py = r.y; }
    g.push([ti, l.length, flat]);
  });
  return { c, g };
}
/** packEnts の逆：設備を、欄の名前つきの形に戻す（中身の確かめは、このあと readEnt がする）。形がおかしい所は読み飛ばす */
export function unpackEnts(d: unknown): unknown[] {
  if (Array.isArray(d)) return d;
  const pk = d as { c?: unknown; g?: unknown } | null;
  if (!pk || !Array.isArray(pk.c) || !Array.isArray(pk.g)) return [];
  const out: unknown[] = [];
  for (const grp of pk.g as unknown[]) {
    if (!Array.isArray(grp) || !Array.isArray(grp[2])) continue;
    const t = pk.c[grp[0] as number] as EntTpl | undefined, flat = grp[2] as unknown[];
    if (!t || typeof t.o !== 'object' || !t.o || !Array.isArray(t.k)) continue;
    const w = 2 + t.k.length;
    let px = 0, py = 0;
    for (let at2 = 0; at2 + w <= flat.length; at2 += w) {
      const dy = flat[at2], dx = flat[at2 + 1];
      if (typeof dx !== 'number' || typeof dy !== 'number') break;
      px += dx; py += dy;
      const e: Record<string, unknown> = { ...t.o, x: px, y: py };
      for (let i = 0; i < t.k.length; i++) {
        const key = t.k[i], v = flat[at2 + 2 + i];
        if (typeof key !== 'string' || !ROW_SET.has(key)) continue;
        if (key === 'inBuf') { const ib: Record<string, unknown> = {}; if (Array.isArray(t.ik) && Array.isArray(v)) t.ik.forEach((q, j) => { if (typeof q === 'string') ib[q] = v[j]; }); e.inBuf = ib; }
        else e[key] = key === 'tr' ? fatTrain(v) : key === 'xtr' && Array.isArray(v) ? v.map(fatTrain) : v;
      }
      out.push(e);
    }
  }
  return out;
}
const entsJson = (list: Ent[]) => JSON.stringify(packEnts(list));
/** セーブの文字を読み、設備を「欄の名前つきの一覧」に広げたもの（中身を調べる・直す道具やテストのため。この形のセーブも、そのまま読める） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function plainSave(json: string): any {
  const d = JSON.parse(json);
  d.ents = unpackEnts(d.ents);
  return d;
}
export function serialize(w: World): string {
  const ents = entsJson([...w.ents.values()].filter((e) => e.kind !== 'part'));
  return JSON.stringify({
    v: SAVE_VERSION, ents: 0, chapter: w.chapter, progress: w.progress, counts: w.counts, seen: w.seen,
    rails: [...w.rails], hubSize: w.hubSize, goalMs: w.goalMs, srs: w.srs, exams: w.exams, calib: w.calib, relearn: w.relearn, hcLog: w.hcLog, side: w.side, night: w.night, dayMs: w.dayMs, tested: w.tested, today: w.today, revDays: w.revDays, ret: w.ret, bonusDay: w.bonusDay, cleared: w.cleared, done: doneCount(w), delivered: w.delivered, stock: w.stock,
    discovered: w.discovered, learned: w.learned, mistakes: w.mistakes.slice(-400), points: w.points, up: w.up, solved: w.solved, research: w.research, agents: w.agents, cases: w.cases, practice: w.practice, made: w.made, vented: w.vented, spilled: w.spilled, emitted: w.emitted, grades: w.grades, fed: w.fed, multi: w.multi,
    // 1 時間の流れは、1 分ごとの合計だけを [分, 納品, 指令, 廃棄口, あふれ, 作った] の数の並びで残す（60 行）
    hist: minutes(w).map((m) => [m.t, m.deliver, m.goal, m.vent, m.spill, m.made]), ach: w.ach, eta: w.eta,
    playMs: Math.round(w.playMs), savedAt: Date.now(),
    fname: w.fname || undefined,
    study: w.study,
    pins: w.pins,
  }).replace('"ents":0', () => `"ents":${ents}`);
}

/** 置ける設備の種類か（納品所と 'part' は含まない）。'constructor' のような、どのオブジェクトにもある名前は種類ではない */
export const isPlaceable = (k: unknown): k is Exclude<Kind, 'hub' | 'part'> => typeof k === 'string' && Object.prototype.hasOwnProperty.call(MACHINES, k);
/** sub に入れてよい値か。搬出口とタンクは物質、試薬棚は物質か試料の組（'set:A'）。ほかの設備は持たない */
export function subOk(kind: Kind, s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (kind === 'sampler' && s.startsWith('set:')) return !!setById(s.slice(4));
  return (kind === 'sampler' || kind === 'depot' || kind === 'tank') && hasSub(s);
}
/** test に入れてよい値か。設備ごとに、設定の画面で選べるものだけを通す */
export function testOk(kind: Kind, t: unknown): t is string {
  if (typeof t !== 'string') return false;
  const is = t.startsWith('is:') && hasSub(t.slice(3));
  switch (kind) {
    case 'analyzer': return is || !!testById(t);
    case 'sensor': return is || t === 'jam';
    case 'gate': return t === 'on' || t === 'off';
    case 'tank': return t === 'hold';
    case 'settler': case 'funnel': case 'phoresis': return sepReady(kind, t);
    default: return false;
  }
}
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;
/** 物質の並び。知らない物質や文字でないものは外す。bang：駅の荷（搬出口から出たものは先頭に '!'） */
const subList = (a: unknown, bang = false): string[] => {
  if (!Array.isArray(a)) return [];
  const out: string[] = [];
  for (let i = 0; i < a.length && out.length < LIST_MAX; i++) {
    const v = a[i];
    if (typeof v !== 'string' || !hasSub(bang && v.startsWith('!') ? v.slice(1) : v)) continue;
    // 続く数は個数（まとめて書いたもの）
    const c = a[i + 1], n = typeof c === 'number' && Number.isInteger(c) && c > 1 ? Math.min(c, LIST_MAX - out.length) : 1;
    for (let q = 0; q < n; q++) out.push(v);
  }
  return out;
};
/** 保存から読んだ荷。知らない物質なら null */
function readItem(it: unknown): Item | null {
  if (!it || typeof it !== 'object' || typeof (it as Item).s !== 'string' || !hasSub((it as Item).s)) return null;
  const c: Item = { ...(it as Item), m: 0 };
  if (!fin(c.p)) c.p = 0;
  if (c.n !== undefined && !(Number.isSafeInteger(c.n) && c.n > 0)) delete c.n;
  if (c.d !== undefined && !isDir(c.d)) delete c.d;
  if (c.w !== undefined && !fin(c.w)) delete c.w;
  return c;
}
function readTrain(t: unknown): Train | undefined {
  if (!t || typeof t !== 'object') return undefined;
  const o = t as Train;
  return { ...o, p: fin(o.p) ? o.p : 0, back: o.back === true, cargo: subList(o.cargo, true), wait: fin(o.wait) ? o.wait : 0, to: typeof o.to === 'string' ? o.to : undefined, held: undefined };
}
/** 数を持つ欄。数でなければ消す（NaN や文字が混ざると、動かすときや描くときに止まる） */
const NUM_KEYS = ['rr', 'timer', 'prog', 'cnt', 'rcn', 'left', 'n', 'u', 'pw', 'stuck', 'badT', 'ins', 'cars'] as const;
/**
 * 保存から読んだ設備を確かめる。種類や位置がおかしければ null。
 * 知らない物質・反応・設定や、形の合わない中身は外して、設備は残す（書き換えられたセーブや、人からもらったセーブで、地図が止まらないように）
 */
function readEnt(o: unknown): Ent | null {
  if (!o || typeof o !== 'object') return null;
  const e = o as Ent;
  if (!(e.kind === 'hub' || isPlaceable(e.kind)) || !Number.isSafeInteger(e.x) || !Number.isSafeInteger(e.y)) return null;
  if (!isDir(e.dir)) e.dir = 0;
  if (e.big !== undefined && !(e.big === true && BIG.includes(e.kind))) delete e.big;
  delete e.ref;
  if (e.sub !== undefined && !subOk(e.kind, e.sub)) delete e.sub;
  if (e.test !== undefined && !testOk(e.kind, e.test)) delete e.test;
  if (e.ch !== undefined) e.ch = lineNo(Number(e.ch));
  if (e.role !== undefined && e.role !== 'in' && e.role !== 'out') delete e.role;
  for (const k of NUM_KEYS) if (e[k] !== undefined && !fin(e[k])) delete e[k];
  // rr は、順に回す口・行き先・試料の、次の番号。0 以上の整数でなければ 0 から回し直す（0.5 や -1 では口や行き先が引けず、動かすたびに止まる）
  if (e.rr !== undefined && !(Number.isSafeInteger(e.rr) && e.rr >= 0)) e.rr = 0;
  // 中身の物質がわからないタンクは、空として読む
  if (e.kind === 'tank' && e.sub === undefined) { e.cnt = 0; e.rcn = 0; }
  for (const k of ['li', 'pri'] as const) if (e[k] !== undefined && !isDir(e[k])) delete e[k];
  if (e.ts !== undefined && !(Array.isArray(e.ts) && e.ts.length === 3 && e.ts.every(fin))) delete e.ts;
  if (e.st !== undefined && e.st !== 'gas' && e.st !== 'liquid' && e.st !== 'solid') delete e.st;
  if (e.bad !== undefined && !(typeof e.bad === 'string' && hasSub(e.bad))) delete e.bad;
  // 反応：出口の物質は、その反応の生成物でなければならない（違うと、反応が終わったときに止まる）
  if (e.recipe !== undefined || e.outOrder !== undefined) {
    const r = recipeById(e.recipe);
    if (!r || !Array.isArray(e.outOrder) || !e.outOrder.every((s) => typeof s === 'string' && r.outputs.some(([x]) => x === s))) clearRecipe(e);
    else {
      if (!(Array.isArray(e.outBuf) && e.outBuf.length === e.outOrder.length && e.outBuf.every(fin))) e.outBuf = e.outOrder.map(() => 0);
      if (!e.inBuf || typeof e.inBuf !== 'object' || Array.isArray(e.inBuf)) e.inBuf = {};
      else for (const [s, n] of Object.entries(e.inBuf)) if (!fin(n) || !hasSub(s)) delete e.inBuf[s];
      if (e.outSlot !== undefined && !(Array.isArray(e.outSlot) && e.outSlot.every((v) => Number.isInteger(v) && v >= 0 && v <= 5))) delete e.outSlot;
    }
  }
  // 中身：知らない物質の荷は捨てる
  if (e.item !== undefined) e.item = readItem(e.item);
  if (e.items !== undefined) e.items = Array.isArray(e.items) ? e.items.map(readItem) : e.kind === 'bridge' ? [null, null] : undefined;
  for (const k of ['buf', 'buf2', 'buf3'] as const) if (e[k] !== undefined) e[k] = subList(e[k], e.kind === 'station' && k === 'buf');
  if (e.tr !== undefined) e.tr = readTrain(e.tr);
  if (e.xtr !== undefined) e.xtr = Array.isArray(e.xtr) ? e.xtr.map(readTrain).filter((t): t is Train => !!t) : undefined;
  // 一時停止と名前（古いセーブにはない）
  if (e.off !== undefined && e.off !== true) delete e.off;
  if (e.memo !== undefined) { const m = typeof e.memo === 'string' ? e.memo.trim().slice(0, 12) : ''; if (m) e.memo = m; else delete e.memo; }
  return shaped(e);
}
/** 古いセーブの、駅ごとの線路の角。形のおかしいものは null */
const legacyRail = (a: unknown): [number, number][] | null =>
  Array.isArray(a) && a.length >= 2 && a.length <= 1000 && a.every((p) => Array.isArray(p) && fin(p[0]) && fin(p[1])) ? a.map(([x, y]) => [Math.floor(x), Math.floor(y)] as [number, number]) : null;
/** 古いセーブから地図へ移す線路の、マス数の上限（ふつうのセーブは数百マス。書き換えられた巨大な値で固まらないように） */
const LEGACY_RAIL_MAX = 100000;
/** 物質ごとの数の表。数でない値と、知らない物質は外す */
const tallies = (o: unknown): Record<string, number> => {
  const r: Record<string, number> = {};
  if (o && typeof o === 'object') for (const [s, n] of Object.entries(o)) if (fin(n) && hasSub(s)) r[s] = n;
  return r;
};
/** 表のはずの値。表でなければ空の表にする（数や文字のままだと、書き足すときに止まる） */
const table = <T,>(o: unknown): Record<string, T> => (o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, T>) : {});

export function deserialize(json: string): World | null {
  try {
    const d = JSON.parse(json);
    if (d.v !== SAVE_VERSION || !d.ents || typeof d.ents !== 'object') return null;
    const w = newWorld();
    w.ents = new EntMap();
    for (const o of unpackEnts(d.ents)) { const e = readEnt(o); if (e) restore(w, e); }
    if (Array.isArray(d.rails)) for (const row of d.rails) if (Array.isArray(row) && typeof row[0] === 'string' && Number.isInteger(row[1]) && row[1] > 0 && row[1] < 16) w.rails.set(row[0], row[1]);
    // 古いセーブ：駅ごとに持っていた線路を、地図の線路へ移す（形のおかしいもの、長すぎるものは移さない）
    let railLeft = LEGACY_RAIL_MAX;
    for (const e of w.ents.values()) {
      const pts = legacyRail(e.rail);
      const len = pts ? pts.reduce((s, p, i) => (i ? s + Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) : 0), 0) : 0;
      if (pts && len <= railLeft) { railLeft -= len; layRail(w, pts); }
      e.rail = undefined; e.railTo = undefined;
      for (const t2 of [e.tr, ...(e.xtr ?? [])]) if (t2) t2.held = undefined;
    }
    // 線路の範囲をずらすと片側だけのつながりが残っていた頃のセーブ：両側そろったつながりだけにする
    mendRails(w, [...w.rails.keys()]);
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
    w.seen = Math.min(CHAPTERS.length - 1, Math.max(d.seen | 0, w.chapter));
    w.goalMs = table(d.goalMs);
    // 納品所は保存された大きさで置き直す。達成数に足りなければ広げる（古いセーブ）
    for (const [k, e] of w.ents) if (e.kind === 'hub') w.ents.delete(k);
    w.hubSize = HUB_SIZES.includes(d.hubSize) ? d.hubSize : 2;
    for (const [x, y] of hubTiles(w.hubSize)) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
    if (growHub(w)) w.events.push('hub-grow');
    // 古い版の { iv, due } は FSRS の形に読み替える
    w.srs = {};
    for (const [k, v] of Object.entries(d.srs || {})) if (v && typeof v === 'object') w.srs[k] = migrate(v as Parameters<typeof migrate>[0]);
    w.cleared = Array.isArray(d.cleared) ? d.cleared : [];
    for (const id of Array.isArray(d.learned) ? d.learned : []) if (!w.srs[`r:${id}`] && recipeById(id)) w.srs[`r:${id}`] = migrate({ iv: 0, due: Date.now() });
    w.exams = Array.isArray(d.exams) && d.exams.length === 2 && d.exams.every((x: unknown) => typeof x === 'number' && x > 0) ? d.exams : [...EXAMS_DEFAULT];
    // 前の版では、試験日をまたぐ予定が残ることがあった（試験の 2 日前を過ぎて答えると、2 次の後まで出ないなど）。読み込むときに直す
    { const t = Date.now(); for (const [k, c] of Object.entries(w.srs)) c.due = capByExams(c.due, t, w.exams, k, c.last); }
    w.calib = { sure: [0, 0], maybe: [0, 0], guess: [0, 0] };
    for (const k of ['sure', 'maybe', 'guess'] as Confidence[]) { const v = d.calib?.[k]; if (Array.isArray(v) && v.length === 2) w.calib[k] = [v[0] | 0, v[1] | 0]; }
    w.relearn = Array.isArray(d.relearn) ? d.relearn.filter((x: { id?: unknown; at?: unknown }) => typeof x?.id === 'string' && typeof x?.at === 'number') : [];
    w.hcLog = Array.isArray(d.hcLog) ? d.hcLog.filter((x: { id?: unknown; t?: unknown }) => typeof x?.id === 'string' && typeof x?.t === 'number').slice(-200) : [];
    w.side = d.side && typeof d.side.s === 'string' && hasSub(d.side.s) ? { s: d.side.s, n: d.side.n | 0, got: d.side.got | 0, ch: Math.max(0, Math.min(CHAPTERS.length - 1, d.side.ch | 0)), reward: d.side.reward | 0 } : null;
    w.night = d.night && typeof d.night.day === 'string' && Array.isArray(d.night.ids) ? { day: d.night.day, ids: d.night.ids.filter((x: unknown) => typeof x === 'string'), got: d.night.got | 0, morning: typeof d.night.morning === 'number' ? d.night.morning : undefined } : null;
    w.dayMs = d.dayMs && typeof d.dayMs === 'object' ? d.dayMs : {};
    w.tested = Array.isArray(d.tested) ? d.tested.filter((x: unknown) => typeof x === 'number') : [];
    w.revDays = {};
    if (d.revDays && typeof d.revDays === 'object') for (const [k, v] of Object.entries(d.revDays as Record<string, unknown>)) if (Array.isArray(v) && v.length === 2) w.revDays[k] = [Number(v[0]) | 0, Number(v[1]) | 0];
    w.ret = RETENTIONS.includes(d.ret) ? d.ret : RETENTION;
    w.bonusDay = typeof d.bonusDay === 'string' ? d.bonusDay : '';
    w.study = readStudy(d.study);
    w.today = d.today && typeof d.today.day === 'string' && Array.isArray(d.today.wrong) ? { day: d.today.day, wrong: d.today.wrong.filter((x: unknown) => typeof x === 'string') } : { day: '', wrong: [] };
    w.delivered = tallies(d.delivered);
    w.stock = tallies(d.stock);
    w.discovered = [...new Set([...w.discovered, ...(Array.isArray(d.discovered) ? d.discovered : [])])].filter((s) => typeof s === 'string' && hasSub(s));
    w.learned = Array.isArray(d.learned) ? d.learned : [];
    w.mistakes = Array.isArray(d.mistakes) ? d.mistakes : [];
    w.points = d.points | 0;
    w.up = { extract: d.up?.extract | 0, belt: d.up?.belt | 0, machine: d.up?.machine | 0 };
    w.solved = Array.isArray(d.solved) ? d.solved : [];
    w.agents = Array.isArray(d.agents) ? d.agents.filter((x: unknown) => typeof x === 'string') : [];
    w.cases = Array.isArray(d.cases) ? d.cases.filter((x: unknown) => typeof x === 'string') : [];
    w.research = (Array.isArray(d.research) ? d.research : []).filter((id: string) => RESEARCH.some((r) => r.id === id));
    w.practice = table(d.practice);
    w.made = tallies(d.made);
    w.vented = tallies(d.vented);
    w.spilled = tallies(d.spilled);
    w.emitted = tallies(d.emitted);
    w.grades = table(d.grades);
    w.fed = table(d.fed);
    // 複数の物質を同時に求める指令の進み具合。各章のいまの指令の分だけ読む。
    // 古いセーブは物質ごとの数を 1 つだけ持っていた（どの章のものか分からない）ので、進めている章ではその数と章の進み具合の大きいほう、
    // ほかの章では章の進み具合（いちばん遅れている物質の数）を、物質ごとの数とする
    w.multi = {};
    const multiNum = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);
    const old: Record<string, unknown> = d.multi && typeof d.multi === 'object' ? d.multi : {};
    CHAPTERS.forEach((c, ch) => {
      const g = c.goals[w.progress[ch]], gk = goalKey(w, ch);
      if (!g?.also) return;
      const saved = old[gk] && typeof old[gk] === 'object' ? (old[gk] as Record<string, unknown>) : null;
      const m: Record<string, number> = {};
      for (const s of [g.s, ...g.also]) {
        const n = saved ? multiNum(saved[s]) : Math.max(w.counts[ch] || 0, ch === w.chapter ? multiNum(old[s]) : 0);
        if (n) m[s] = n;
      }
      if (Object.keys(m).length) w.multi[gk] = m;
    });
    w.playMs = fin(d.playMs) ? d.playMs : 0;
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

