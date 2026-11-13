import { parseFormula } from '../chem/formula';
import { productsOf, recipeById, type Recipe } from './recipes';
import { hasSub, label, sub } from './substances';
import { PROCESS_T, dHOf, processOf, type ProcessKind } from './thermo';

/**
 * 物質の実際の見た目。入試で色を問われるものだけを、教科書の言い方で持つ。
 * ここに無い物質は、色を言わない（「白色」などと勝手に決めない）。絵には、状態ごとの控えめな色を使う。
 * aq：水溶液にしたときの色（固体そのものの色ではない）。
 * word は主な言い方（模試の色の問いはこれから作る）。場面ごとの見た目は sol・vap・anhyd に分けて持つ。
 * 出典の鍵（SPEC2 §11.2）は LOOK_SRC に持つ。
 */
export interface Look { hex: string; word: string; aq?: boolean; metal?: boolean;
  /** 水（I₂ は KI 水溶液）に溶かしたときの色 */
  sol?: Form;
  /** 蒸気の色 */
  vap?: Form;
  /** 無水物の色（水溶液の色を主に持つ物質） */
  anhyd?: Form;
  /** 水溶液の中で沈殿として生じる */
  ppt?: boolean;
  /** 水の中で細かく生じて白く濁るときの色 */
  turbid?: string;
  /** 水と混ざらない液体：水の上に浮くか、下に沈むか */
  layer?: 'top' | 'bottom';
  /** 湿った空気の中で白い霧になるときの色（いまは SO₃ だけで、SO₃ は無色の気体なので LOOKS ではなく PLUMES に持つ） */
  fume?: string;
  /** 空気中で自ら光る（化学発光）ときの色（第 2 ラウンドで描く） */
  glowAir?: string;
  /** 光に当たると変わる色（途中、最後） */
  photo?: [string, string];
  /** 保存のしかた（STORE と同じ） */
  store?: Store;
  /** 色のほかに見分ける手がかり：元素記号・試薬の名前・札の物質名 */
  cue?: 'symbol' | 'reagent' | 'label' }
export interface Form { hex: string; word: string }
export type Store = 'kerosene' | 'water' | 'poly' | 'brown';
export type Cue = NonNullable<Look['cue']>;

const L = (hex: string, word: string, extra: Partial<Look> = {}): Look => ({ hex, word, ...extra });
const F = (hex: string, word: string): Form => ({ hex, word });

/*
 * cue（色のほかの手がかり）は、同じ場面に並ぶ色どうしが、一般の色覚または 1 型・2 型の色覚の模擬で
 * CIEDE2000 の色差 10 未満になる物質に付ける（SPEC2 §10.10。tests/matter-data.test.ts が場面ごとに確かめる）。
 * label は、反応の札・沈殿槽の札・気体の説明が物質名を書くこと。
 */
export const LOOKS: Record<string, Look> = {
  // ---- 有色の気体（気体はふつう無色。色がつくのはこの 4 つ）----
  // 塩素水（淡黄緑色）は Fe²⁺（淡緑色）と 1 型の色覚で色差 9.5
  Cl2: L('#b9cf4a', '黄緑色', { sol: F('#e3eba0', '淡黄緑色'), cue: 'label' }),
  // NO₂ と Br₂ の蒸気は同じ赤褐色（色差 5.0）：札の物質名で見分ける
  NO2: L('#a4532c', '赤褐色', { cue: 'label' }),
  O3: L('#a9cfe8', '淡青色'),
  F2: L('#e6e2a0', '淡黄色'),
  // ---- 液体 ----
  Br2: L('#8a2f1c', '赤褐色', { vap: F('#b0482a', '赤褐色'), sol: F('#c8642a', '赤褐色（薄いと黄褐色）'), cue: 'label' }),
  C6H5NO2: L('#e6da8a', '淡黄色', { layer: 'bottom' }),
  crude: L('#3a2c22', '黒褐色'),
  tar: L('#231d1a', '黒色'),
  heavy: L('#3b2f27', '黒褐色'),
  // ---- 単体 ----
  // SO₂ + H₂S で水の中に生じる硫黄は、細かい粒で白く濁る
  S: L('#e6cf3a', '黄色', { turbid: '#efe9c4' }),
  // I₂ を KI 水溶液に溶かすと I₃⁻ の褐色（水の中で生じた I₂ もこの色）。濃い I₃⁻ と Fe(OH)₃ は色差 6.8：札で見分ける
  I2: L('#3a2440', '黒紫色', { vap: F('#9b4fd0', '紫色'), sol: F('#c08a3a', '褐色'), cue: 'label' }),
  P4: L('#ece3a8', '淡黄色', { glowAir: '#bfe8ff' }),
  C: L('#2a2a2c', '黒色'),
  Si: L('#5b6068', '灰黒色', { metal: true }),
  Cu: L('#c8733f', '赤色', { metal: true }),
  Ag: L('#d9dde2', '銀白色', { metal: true }),
  Fe: L('#b8bcc2', '銀白色', { metal: true }),
  Al: L('#d5d8dc', '銀白色', { metal: true }),
  Zn: L('#c2c8cf', '銀白色', { metal: true }),
  Pb: L('#8d949c', '灰色', { metal: true }),
  Sn: L('#cfd3d8', '銀白色', { metal: true }),
  Na: L('#d7dbe0', '銀白色', { metal: true }),
  // ---- 酸化物・硫化物 ----
  CuO: L('#222224', '黒色'),
  Cu2S: L('#26262a', '黒色'),
  Fe2O3: L('#9a3a22', '赤褐色'),
  MnO2: L('#28262a', '黒色'),
  PbO: L('#e2c33a', '黄色'),
  PbO2: L('#5a3a26', '褐色'),
  PbS: L('#222226', '黒色', { ppt: true }),
  FeS: L('#222226', '黒色', { ppt: true }),
  ZnS: L('#f3f3ef', '白色', { ppt: true }),
  ZnO: L('#f3f3ef', '白色'),
  CuFeS2: L('#b99a3a', '黄金色'),
  // ---- 沈殿になる塩 ----
  // AgCl は光に当たると紫を経て黒くなる（Ag が遊離する）。描くのは第 2 ラウンド
  AgCl: L('#f4f4f1', '白色', { ppt: true, photo: ['#8a7a9a', '#3a3640'] }),
  PbSO4: L('#f4f4f1', '白色', { ppt: true }),
  CaCO3: L('#f2f1ec', '白色', { ppt: true }),
  CaSO4: L('#f2f1ec', '白色', { ppt: true }),
  H2SiO3: L('#eef0f0', '白色（ゲル状）', { ppt: true }),
  CaSO3: L('#f6f6f3', '白色', { ppt: true }),
  // ---- 系統分離の沈殿 ----
  PbCl2: L('#f4f4f1', '白色', { ppt: true }),
  Ag2S: L('#222226', '黒色', { ppt: true }),
  CuS: L('#222226', '黒色', { ppt: true }),
  // Fe(OH)₃ は Cu₂O（8.6）・濃い I₃⁻（6.8）・Ag₂CrO₄（6.5）・Ag₂O（1 型 6.9）と色が近い：札の物質名で見分ける
  'Fe(OH)3': L('#9a4a26', '赤褐色', { ppt: true, cue: 'label' }),
  'Al(OH)3': L('#f2f2ee', '白色', { ppt: true }),
  'Pb(OH)2': L('#f2f2ee', '白色', { ppt: true }),
  // Ag₂O（褐色）は Ag₂CrO₄（1 型 3.0）・Fe(OH)₃（1 型 6.9）と近い
  Ag2O: L('#6a4a32', '褐色', { ppt: true, cue: 'label' }),
  'Cu(OH)2': L('#a9cfe2', '青白色', { ppt: true }),
  PbCrO4: L('#e8c62a', '黄色', { ppt: true }),
  Ag2CrO4: L('#8f3a26', '赤褐色', { ppt: true, cue: 'label' }),
  'mud-oh': L('#b0603a', '赤褐色', { ppt: true, cue: 'label' }),
  // ---- 水溶液に色がつくもの（金属イオン・酸化剤）----
  CuSO4: L('#3b82d6', '青色', { aq: true, anhyd: F('#eceae4', '白色') }),
  CuCl2: L('#3aa0c8', '青色', { aq: true, sol: F('#3aa0c8', '青色（濃いと青緑色）'), anhyd: F('#a0702a', '褐色がかった黄色') }),
  'Cu(NO3)2': L('#3b82d6', '青色', { aq: true }),
  FeSO4: L('#b9d8b0', '淡緑色', { aq: true, cue: 'label' }),
  FeCl2: L('#b9d8b0', '淡緑色', { aq: true, cue: 'label' }),
  FeCl3: L('#b98a2c', '黄褐色', { aq: true }),
  KMnO4: L('#8e2a7e', '赤紫色', { aq: true }),
  MnSO4: L('#f0dfe3', 'ほぼ無色（淡桃色）', { aq: true }),
  MnCl2: L('#f0dfe3', 'ほぼ無色（淡桃色）', { aq: true }),
  // ---- 有機 ----
  C6H5N2C6H4OH: L('#d8612a', '橙赤色'),
  // ---- 混合物 ----
  coal: L('#1f1f21', '黒色'),
  bauxite: L('#a2543a', '赤褐色'),
  redmud: L('#8f3a26', '赤褐色'),
  crudeCu: L('#b5693f', '赤色', { metal: true }),
};

/**
 * 見た目の出典（SPEC2 §11.2 の鍵）。general は、どの教科書にもある一般的な事実で、個別の出典を挙げていないもの。
 * 検査で、LOOKS のどの物質にも 1 つ以上あることを確かめる
 */
export const LOOK_SRC: Record<string, string[]> = {
  // C46 は気体の黄緑色だけを言う。Cl₂ の sol（塩素水の淡黄緑色）の出典は general だけ（SOLUTIONS['Cl2-water'] と同じ。言い方は SPEC2 §12 で確かめる）
  Cl2: ['C46', 'general'], NO2: ['C15'], O3: ['C16'], F2: ['C47'], Br2: ['C21'], C6H5NO2: ['general'], crude: ['general'], tar: ['general'], heavy: ['general'],
  S: ['C30', 'C17'], I2: ['C22', 'C4', 'C7', 'C8'], P4: ['C32', 'JP4'], C: ['general'], Si: ['general'], Cu: ['C3'], Ag: ['general'], Fe: ['general'],
  Al: ['general'], Zn: ['general'], Pb: ['general'], Sn: ['general'], Na: ['JNa'],
  CuO: ['C3'], Cu2S: ['general'], Fe2O3: ['C41'], MnO2: ['C40'], PbO: ['general'], PbO2: ['general'], PbS: ['C2'], FeS: ['C2'], ZnS: ['C37'], ZnO: ['general'],
  CuFeS2: ['general'], AgCl: ['C33', 'C2'], PbSO4: ['C2', 'C56'], CaCO3: ['C2', 'C56'], CaSO4: ['C2', 'C56'], H2SiO3: ['general'], CaSO3: ['general'],
  PbCl2: ['C56'], Ag2S: ['C58'], CuS: ['C55'], 'Fe(OH)3': ['C54'], 'Al(OH)3': ['C57'], 'Pb(OH)2': ['C59'], Ag2O: ['C42'], 'Cu(OH)2': ['C9', 'C44'],
  PbCrO4: ['C10'], Ag2CrO4: ['C43'], 'mud-oh': ['C54', 'C57'],
  CuSO4: ['C5', 'C39', 'C2'], CuCl2: ['C20'], 'Cu(NO3)2': ['C5', 'C39'], FeSO4: ['C7'], FeCl2: ['C7'], FeCl3: ['C7', 'C29'], KMnO4: ['C7', 'C40'],
  MnSO4: ['C7'], MnCl2: ['C7'], C6H5N2C6H4OH: ['general'], coal: ['general'], bauxite: ['general'], redmud: ['general'], crudeCu: ['general'],
};
/** 天然の鉱石の色（物質としての色とは別）。閃亜鉛鉱は鉄を含んで褐色〜黒褐色 [C37] */
export const ORES: Record<string, string> = { ZnS: '#4a2a1e' };
/**
 * 決まった反応の中でだけ沈殿になる物質。NaHCO₃ はアンモニアソーダ法（濃い NaCl・NH₄Cl の液）では沈殿するが、
 * フェノキシドに CO₂ を通す反応では溶けたまま。そこで LOOKS には入れず（入れると水溶液の反応の固体の生成物はすべて沈殿として描かれる）、
 * 沈殿する反応だけをここに書く
 */
export const PPT_IN: Record<string, { id: string; hex: string; word: string; src: string[] }[]> = {
  solvay: [{ id: 'NaHCO3', hex: '#f6f6f3', word: '白色', src: ['general'] }],
};
/** 白く濁るときの言い方（色は Look の turbid）。SO₂ + H₂S の硫黄 [C17]（言い方は教科書で確かめる、SPEC2 §12） */
export const TURBID_WORD: Record<string, string> = { S: '白濁（淡黄白色）' };

/**
 * 炎色反応の色（SPEC2 §10.1）。どの炎にも元素記号を添えて描く（sym：色のほかの手がかり。Na と Ba は 1 型の色覚で色差 1.4）。
 * FLAME_TESTS は教科書の 7 元素すべて、FLAMES はそのうちゲームの元素の一覧（ELEMENTS）にある 5 つ。
 * 章を終えたときの花火は、納品所が飲み込んだ元素の FLAMES の色で上がる（Li と Sr は納品所が飲み込まないので FLAMES に入れない）
 */
export interface Flame { sym: string; hex: string; word: string; nm?: string; src: string[] }
export const FLAME_TESTS: Record<string, Flame> = {
  Li: { sym: 'Li', hex: '#e8283c', word: '赤色', nm: '670.8', src: ['C1', 'N2'] },
  Na: { sym: 'Na', hex: '#ffd43a', word: '黄色', nm: '589.0 / 589.6', src: ['C1', 'N2'] },
  // 直接見ると淡い紫、コバルトガラスを通すと赤紫
  K: { sym: 'K', hex: '#c98bff', word: '赤紫色', nm: '766.5 / 769.9、404.4', src: ['C1', 'N2', 'JF'] },
  Ca: { sym: 'Ca', hex: '#ff7b3a', word: '橙赤色', src: ['C1'] },
  // Li より暗く、青みの少ない深い赤（Li と色差 14.8）
  Sr: { sym: 'Sr', hex: '#a8001e', word: '紅色（深赤色）', src: ['C1', 'FT'] },
  Ba: { sym: 'Ba', hex: '#b9e24a', word: '黄緑色', src: ['C1'] },
  // バイルシュタイン試験の炎も同じ色（Cl・Br・I を含むと見える。F では見えない）
  Cu: { sym: 'Cu', hex: '#3ad9b4', word: '青緑色', src: ['C1', 'BE'] },
};
/** main.ts は { sym, ...FLAMES[sym] } と広げるので、型では sym を省けるようにしておく（値はどの行にもある） */
export const FLAMES: Record<string, Omit<Flame, 'sym'> & { sym?: string }> = {
  Na: FLAME_TESTS.Na, K: FLAME_TESTS.K, Ca: FLAME_TESTS.Ca, Ba: FLAME_TESTS.Ba, Cu: FLAME_TESTS.Cu,
};
/** 空気を調節したガスバーナーの青い炎（絵の色）。赤っぽい炎は不完全燃焼 [CT] */
export const BURNER = { inner: '#4a7bff', outer: '#9fb6ff', word: '青い炎', src: ['CT'] } as const;

/** 燃える反応の炎（SPEC2 §10.6）。決めた 5 つの反応だけ。O₂ が原料にあるかどうかでは決めない */
export interface Burn { fuel: 'S' | 'CO' | 'C' | 'P4'; flame: string; word: string;
  /** 赤熱した層として描く（背の高い炎を立てない） */
  bed?: boolean;
  /** 白煙の色 */
  smoke?: string;
  /** 反応の札の説明（captions.ts の鍵） */
  caption?: string;
  src: string[] }
export const BURN: Record<string, Burn> = {
  // 容器の中で燃える硫黄の上に描く（融けた硫黄の池は描かない：融点よりずっと高い硫黄は黒ずむ）
  'sulfur-burn': { fuel: 'S', flame: '#4a6bff', word: '青い炎', caption: 'burn:S', src: ['C30'] },
  'co-burn': { fuel: 'CO', flame: '#3d6cff', word: '青い炎', caption: 'burn:CO', src: ['C31'] },
  // 約 900 ℃ の赤熱（§10.7 の表の色）
  'carbon-burn': { fuel: 'C', flame: '#ff5400', word: '赤熱', bed: true, src: ['D1'] },
  'coke-burn': { fuel: 'C', flame: '#ff5400', word: '赤熱', bed: true, src: ['D1'] },
  'p4-burn': { fuel: 'P4', flame: '#fff1d6', word: '明るい炎', smoke: '#f4f4f0', caption: 'burn:P4', src: ['C32'] },
};
/**
 * 炎を出さない反応（O₂ を使っても燃えない、または熱で光るだけ）。
 * copper-oxide：銅は黒い CuO になる [C3]。ostwald-2：常温で進み、無色から赤褐色 [C34]。焙焼・溶錬・転炉：温度で光るだけ（§10.7）。
 * hcl-synthesis（H₂ が Cl₂ の中で燃える）は、炎の言い方の出典がそろうまで炎を描かない（SPEC2 §12）
 */
export const NO_FLAME = ['copper-oxide', 'ostwald-2', 'zinc-roast', 'lead-roast', 'copper-matte', 'copper-converter', 'hcl-synthesis'];
/** 発熱が目に見えて大きい（湯気・熱のゆらぎを描く）反応 */
export const EXO = ['slaking', 'so3-absorb', 'phosphoric'];

/**
 * 原子量（IUPAC CIAAW の標準原子量の簡略値）。気体の分子量と、空気より重いか軽いかに使う。
 * 模試の計算に使う丸めた原子量（mock.ts の MASS）とは別
 */
export const ATOMIC: Record<string, number> = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45,
  K: 39.098, Ca: 40.078, Cr: 51.996, Mn: 54.938, Fe: 55.845, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.87, Sn: 118.71, I: 126.9, Ba: 137.33, Pb: 207.2,
};
/** 化学式（formula.ts で分解する）からモル質量（g/mol）。化学式のない物質、知らない元素を含む物質は null */
export function molarOf(id: string): number | null {
  if (!hasSub(id)) return null;
  const f = sub(id).formula;
  if (!f) return null;
  let m = 0;
  for (const [el, n] of Object.entries(parseFormula(f))) { if (ATOMIC[el] === undefined) return null; m += ATOMIC[el] * n; }
  return m;
}
/** 空気の平均分子量（N₂ : O₂ = 4 : 1） */
export const AIR = 28.8;
export type GasClass = 'heavy' | 'light' | 'neutral';
/** 空気より重い（M > 30.8）・軽い（M < 26.8）・ほぼ同じ（差が 2 以内）。同じ温度で比べたときの話 */
export const gasClass = (M: number): GasClass => (M > AIR + 2 ? 'heavy' : M < AIR - 2 ? 'light' : 'neutral');

/**
 * 気体の煙（廃棄口から出る気体）の表（SPEC2 §10.3）。hex が null の気体は無色で、輪で示す。
 * white は白く見えるもの：smoke は固体の細かい粒（NH₄Cl・P₄O₁₀）、mist は液体の細かい粒（SO₃ が湿った空気でつくる硫酸の霧、冷えた湯気）。
 * 水蒸気そのものは無色なので、出口から clearTiles マスまでは輪で描き、その先だけ白い（湯気）。
 * air は空気に触れて変わる色（NO は O₂ と反応して赤褐色の NO₂ になる）。
 */
export interface PlumeRow { hex: string | null; white?: 'smoke' | 'mist'; clearTiles?: number; air?: string; src: string[] }
const P = (hex: string | null, src: string[], extra: Partial<PlumeRow> = {}): PlumeRow => ({ hex, src, ...extra });
export const PLUMES: Record<string, PlumeRow> = {
  // ---- 色のある気体（Br₂・I₂ は蒸気の色）----
  Cl2: P('#b9cf4a', ['C46']), NO2: P('#a4532c', ['C15']), O3: P('#a9cfe8', ['C16']), F2: P('#e6e2a0', ['C47']),
  Br2: P('#b0482a', ['C21']), I2: P('#9b4fd0', ['C22', 'C4']),
  // ---- 無色の気体 ----
  N2: P(null, ['general']), O2: P(null, ['general']), H2: P(null, ['general']), NH3: P(null, ['C18']),
  NO: P(null, ['C34'], { air: '#a4532c' }), SO2: P(null, ['general']), HCl: P(null, ['C45']), CO2: P(null, ['general']), CO: P(null, ['C31']),
  H2S: P(null, ['C17']), HI: P(null, ['general']), HF: P(null, ['general']), CH4: P(null, ['general']), C2H4: P(null, ['general']),
  C3H6: P(null, ['general']), C2H2: P(null, ['general']), HCHO: P(null, ['general']), CH2CHCl: P(null, ['general']), C2H4O: P(null, ['general']),
  CH3Cl: P(null, ['general']), HCN: P(null, ['general']), CH2CHCHCH2: P(null, ['general']),
  // ---- 白く見えるもの（何が白いのかを説明に書く）----
  // 水蒸気は無色の気体。出口のすぐ上は輪、冷えて水滴（湯気）になった先だけ白い
  H2O: P('#f2f4f6', ['JYG'], { white: 'mist', clearTiles: 0.3 }),
  // SO₃ そのものは無色。白いのは空気中の水分とできた硫酸の霧
  SO3: P('#f4f4f2', ['C48'], { white: 'mist' }),
  NH4Cl: P('#f4f4f2', ['C18', 'C45'], { white: 'smoke' }),
  P4O10: P('#f4f4f0', ['C32'], { white: 'smoke' }),
};
/** 煙の見た目：色（無色なら null）、分子量、空気と比べた重さ（SPEC2 §5.5 の形） */
export function plumeOf(id: string): { hex: string | null; M: number; cls: GasClass; white?: 'smoke' | 'mist'; clearTiles?: number } {
  const p = PLUMES[id], l = LOOKS[id];
  const M = molarOf(id) ?? AIR;
  const hex = p ? p.hex : l?.vap ? l.vap.hex : l && hasSub(id) && sub(id).state === 'gas' ? l.hex : null;
  const out: ReturnType<typeof plumeOf> = { hex, M, cls: gasClass(M) };
  if (p?.white) out.white = p.white;
  if (p?.clearTiles !== undefined) out.clearTiles = p.clearTiles;
  return out;
}
/** 捕集びん（jar-NO2 など）の中の気体。びんでなければ null */
export const jarGas = (id: string): string | null => (id.startsWith('jar-') ? id.slice(4) : null);

/** '#rrggbb' を '255,200,80' の形に */
export const hexRgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
/** 色のある物質か（見た目の表にあり、無色・ほぼ無色でない）。捕集びんは中の気体で決める */
export const colouredOf = (id: string): boolean => { const l = LOOKS[jarGas(id) ?? id]; return !!l && !/無色/.test(l.word); };
/**
 * 反応や納品の「ぽん」の描き方（S10）。色のある生成物は、その色の吸収する煙（puff）。無色の生成物は光（light）で、
 * その色はスキンの中立の白（POP_LIGHT）を描く側が決めるので、rgb は使わない（物質の色を光にしない、SPEC2 §2 D6）
 */
export function popLook(id: string): { rgb: string; mode: 'light' | 'puff' } {
  return colouredOf(id) ? { rgb: hexRgb(LOOKS[jarGas(id) ?? id].hex), mode: 'puff' } : { rgb: '255,255,255', mode: 'light' };
}

/**
 * 水溶液の色（SPEC2 §10.4）。hex は薄い液の色、conc は濃い液の色。ids は、その色を見た目の表（LOOKS）で持つ物質。
 * alpha はほとんど無色の液を描くときの上限。to は反応で変わったあとの色。
 * cue は、同じ容器・沈殿槽に並ぶ色と近い液に付ける（反応の札が物質名を書く。試薬は試薬の名前）
 */
export interface SolutionRow { word: string; hex: string | null; conc?: string; alpha?: number; to?: Form; ids?: string[]; cue?: Cue; src: string[]; note?: string }
export const SOLUTIONS: Record<string, SolutionRow> = {
  'Cu2+': { word: '青色', hex: '#7fb6e8', conc: '#3b82d6', ids: ['CuSO4', 'Cu(NO3)2'], src: ['C5', 'C39'] },
  CuCl2: { word: '青色（濃いと青緑色）', hex: '#3aa0c8', ids: ['CuCl2'], cue: 'label', src: ['C20'], note: '言い方は教科書で確かめる（SPEC2 §12）' },
  'Cu(NH3)4': { word: '深青色', hex: '#1b3fa8', cue: 'reagent', src: ['C10'] },
  'Fe2+': { word: '淡緑色', hex: '#b9d8b0', ids: ['FeSO4', 'FeCl2'], cue: 'label', src: ['C7'] },
  'Fe3+': { word: '黄褐色', hex: '#b98a2c', ids: ['FeCl3'], cue: 'label', src: ['C7', 'C29'] },
  FeSCN: { word: '血赤色', hex: '#9a0a10', cue: 'label', src: ['C10'] },
  MnO4: { word: '赤紫色', hex: '#8e2a7e', ids: ['KMnO4'], cue: 'label', src: ['C7', 'C40'] },
  'Mn2+': { word: 'ほぼ無色（淡桃色）', hex: '#f0dfe3', alpha: 0.15, ids: ['MnSO4', 'MnCl2'], cue: 'label', src: ['C7'] },
  CrO4: { word: '黄色', hex: '#f2c81e', src: ['C5'] },
  Cr2O7: { word: '橙赤色', hex: '#e8641e', to: F('#3f8f5a', '緑色'), cue: 'label', src: ['GS'], note: '還元されて Cr³⁺ の緑色。言い方は分析器の検査の文（SPEC2 §12）' },
  I3: { word: '褐色', hex: '#c08a3a', conc: '#8a4a14', ids: ['I2'], cue: 'label', src: ['C7', 'C8'] },
  'I2-starch': { word: '青紫色', hex: '#3b2a8a', cue: 'reagent', src: ['C22', 'C7'] },
  'Br2-water': { word: '赤褐色（薄いと黄褐色）', hex: '#c8642a', ids: ['Br2'], cue: 'label', src: ['C21'] },
  // C46（ja.wikipedia「塩素」）は気体の黄緑色だけで、塩素水の色を言わない。SPEC2 §10.4 もこの行に出典を挙げない
  'Cl2-water': { word: '淡黄緑色', hex: '#e3eba0', ids: ['Cl2'], cue: 'label', src: ['general'], note: '言い方は教科書で確かめる（SPEC2 §12）' },
  fehling: { word: '深青色', hex: '#1f4fb0', cue: 'reagent', src: ['C25'] },
  // Ag⁺・Pb²⁺・Al³⁺・Zn²⁺・Ca²⁺・Na⁺・K⁺・Ba²⁺ と、Ag・Zn・Al のアンミン錯イオン・ヒドロキシド錯イオン
  colourless: { word: '無色', hex: null, src: ['general'] },
};

/** pH 指示薬（SPEC2 §10.4、[C38]）。range は変色域。指示薬の色を描くときは、いつもスポイトと名前を添える（cue） */
export interface IndicatorInfo { name: string; acid: { hex: string | null; word: string }; mid?: Form; base: { hex: string | null; word: string }; faint?: Form; range?: [number, number]; cue: Cue; src: string[] }
export const INDICATORS: Record<string, IndicatorInfo> = {
  pp: { name: 'フェノールフタレイン', acid: { hex: null, word: '無色' }, base: F('#ff5fa2', '赤色'), faint: F('#ffb3cf', '淡赤色'), range: [8.0, 9.8], cue: 'reagent', src: ['C38'] },
  mo: { name: 'メチルオレンジ', acid: F('#e0362a', '赤色'), base: F('#f2b81e', '黄色'), range: [3.1, 4.4], cue: 'reagent', src: ['C38'] },
  btb: { name: 'BTB', acid: F('#e8d02a', '黄色'), mid: F('#3faa5a', '緑色'), base: F('#2a6ad0', '青色'), range: [6.0, 7.6], cue: 'reagent', src: ['C38'] },
  litmus: { name: 'リトマス', acid: F('#d8404a', '赤色'), base: F('#3a5ad0', '青色'), cue: 'reagent', src: ['C38'] },
};
/** 反応に加えてある指示薬（SPEC2 §10.16）。ほかの反応では指示薬を描かない */
export interface Indicator { id: 'pp' | 'mo'; name: string; from: string | null; to: string; caption: string }
export const RECIPE_INDICATOR: Record<string, Indicator> = {
  // 中和点で、無色からうすい赤（淡赤色）
  'neutralize-acetate': { id: 'pp', name: 'フェノールフタレイン', from: null, to: '#ffb3cf', caption: 'indicatorPP' },
  // 酸が使われていくと、赤から黄へ
  'scrub-nh3': { id: 'mo', name: 'メチルオレンジ', from: '#e0362a', to: '#f2b81e', caption: 'indicatorMO' },
};
/** 触媒の見た目（SPEC2 §10.16）。alt はくり返し変わるもう一つの姿（Cu ⇄ CuO）、T は運転温度（℃、光るかどうかは spectra.ts の G） */
export interface Catalyst { name: string; hex: string; word: string; alt?: Form; T?: number; caption?: string; src: string[] }
export const CATALYSTS: Record<string, Catalyst> = {
  'haber-bosch': { name: 'Fe₃O₄', hex: '#26262a', word: '黒色', src: ['C41'] },
  contact: { name: 'V₂O₅', hex: '#e8a83a', word: '黄〜橙色', src: ['C23'] },
  // 白金網そのものは銀白色の金属。800 ℃ で赤く光る
  'ostwald-1': { name: '白金網', hex: '#d4d7db', word: '銀白色', T: 800, src: ['JOS'] },
  'lab-o2': { name: 'MnO₂', hex: '#28262a', word: '黒色', src: ['C40'] },
  'lab-o2b': { name: 'MnO₂', hex: '#28262a', word: '黒色', src: ['C40'] },
  formaldehyde: { name: 'Cu', hex: '#c8733f', word: '赤色', alt: F('#222224', '黒色'), caption: 'cuCat', src: ['MK'] },
};

/** 保存のしかた（SPEC2 §10.15）。容器の枠に描き、中身の色は変えない。substances.ts にある物質だけ */
export const STORE: Record<string, Store> = { Na: 'kerosene', P4: 'water', HF: 'poly', HNO3: 'brown', KMnO4: 'brown', AgNO3: 'brown', NaOH: 'poly' };
export const STORE_SRC: Record<string, string[]> = { Na: ['JNa'], P4: ['JP4'], HF: ['JHF'], HNO3: ['JHNO3'], KMnO4: ['C8'], AgNO3: ['JAgNO3'], NaOH: ['JNaOH'] };
/** 保存のしかたの説明（captions.ts の鍵） */
export const STORE_CAPTION: Record<string, string> = { Na: 'storeNa', P4: 'storeP4', HF: 'storeHF', HNO3: 'storeBrown', KMnO4: 'storeBrown', AgNO3: 'storeBrown', NaOH: 'storeNaOH' };
for (const [id, s] of Object.entries(STORE)) if (LOOKS[id]) LOOKS[id].store = s;
/** 水と混ざらない液体の層：酢酸エチルとジエチルエーテルは浮き、ニトロベンゼン（密度 1.20）は沈む */
export const LAYERS: Record<string, 'top' | 'bottom'> = { CH3COOC2H5: 'top', C2H5OC2H5: 'top', C6H5NO2: 'bottom' };

/**
 * 分析器の検査の見た目（SPEC2 §10.11）。reagent は試験管の横にいつも書く試薬の名前（青い色どうしを見分ける手がかり）。
 * before → after は試験管の色（after が null なら無色になる）。wall は銀鏡の壁のグラデーション。
 * kind：flame 白金線と炎、tube 試験管、mirror 銀鏡、bubbles 泡（無色の気体は輪）、tyndall 横からの光、spots ろ紙の斑点。
 * per は試料のイオンごとの色、perWord はその言い方。p1 は余力があれば描くもの。
 * 試薬の名前はいつも描くので、色のある検査にはどれも cue がある（炎色反応は元素記号）
 */
export interface AnalyzerRow { reagent: string; before?: string; after?: string | null; word: string;
  kind: 'flame' | 'tube' | 'mirror' | 'bubbles' | 'tyndall' | 'spots'; ppt?: boolean; phases?: 2; sym?: string; wall?: [string, string];
  per?: Record<string, string>; perWord?: Record<string, string>; cue?: Cue; p1?: boolean; src: string[] }
const flameRow = (el: string): AnalyzerRow => ({ reagent: '白金線（青い炎）', before: BURNER.inner, after: FLAME_TESTS[el].hex, word: FLAME_TESTS[el].word, kind: 'flame', sym: el, cue: 'symbol', src: ['C1'] });
const white = (reagent: string): AnalyzerRow => ({ reagent, after: '#f4f4f1', word: '白色', kind: 'tube', ppt: true, cue: 'reagent', src: ['C33', 'C56', 'C2'] });
const gasRow = (reagent: string): AnalyzerRow => ({ reagent, after: null, word: '気体が発生', kind: 'bubbles', src: ['GS'] });
const mirror: AnalyzerRow = { reagent: 'アンモニア性硝酸銀（温める）', wall: ['#d9dde2', '#8d949c'], word: '銀白色（銀鏡）', kind: 'mirror', cue: 'reagent', src: ['GS'] };
const h2s: AnalyzerRow = { reagent: 'H₂S', after: '#222226', word: '黒色（ZnS は白色）', kind: 'tube', ppt: true, per: { Zn: '#f3f3ef' }, perWord: { Zn: '白色' }, cue: 'reagent', src: ['C2', 'C37'] };
const nh3: AnalyzerRow = { reagent: 'NH₃ 水（少量 → 過剰）', before: '#a9cfe2', after: '#1b3fa8', word: '青白色 → 深青色', kind: 'tube', phases: 2, cue: 'reagent', src: ['C10'] };
const iod: AnalyzerRow = { reagent: 'ヨウ素液', before: '#c08a3a', after: '#3b2a8a', word: '青紫色', kind: 'tube', cue: 'reagent', src: ['C22', 'C7'] };
const brw: AnalyzerRow = { reagent: '臭素水', before: '#c8642a', after: null, word: '無色（脱色）', kind: 'tube', cue: 'reagent', src: ['C21'] };
export const ANALYZER: Record<string, AnalyzerRow> = {
  flame_y: flameRow('Na'), flame_rp: flameRow('K'), flame_or: flameRow('Ca'), flame_yg: flameRow('Ba'), flame_bg: flameRow('Cu'),
  has_cl: { reagent: '加熱した銅線', before: BURNER.inner, after: '#3ad9b4', word: '青緑色（F 以外のハロゲン）', kind: 'flame', cue: 'reagent', src: ['C1', 'BE'] },
  fecl3: { reagent: 'FeCl₃ 水溶液', before: '#b98a2c', after: '#5b2a8e', word: '紫色', kind: 'tube', cue: 'reagent', src: ['C29', 'GS'] },
  iodoform: { reagent: 'I₂ と NaOH（温める）', after: '#f2d23a', word: '黄色', kind: 'tube', ppt: true, cue: 'reagent', src: ['C28'] },
  silver: mirror, hyd_silver: mirror, oxald: mirror,
  fehling: { reagent: 'フェーリング液（加熱）', before: '#1f4fb0', after: '#b8321e', word: '赤色', kind: 'tube', ppt: true, cue: 'reagent', src: ['C25'] },
  iodine: iod, starch: { ...iod, reagent: 'デンプン水溶液' },
  biuret: { reagent: 'NaOH と少量の CuSO₄', before: '#a9cfe2', after: '#9a3a8a', word: '赤紫色', kind: 'tube', cue: 'reagent', src: ['GS'] },
  xantho: { reagent: '濃 HNO₃（加熱）、そのあと NH₃', before: '#e6c02a', after: '#f0a020', word: '黄色 → 橙黄色', kind: 'tube', cue: 'reagent', src: ['GS'] },
  sulfur: { reagent: 'NaOH（加熱）と酢酸鉛(II)', after: '#222226', word: '黒色', kind: 'tube', ppt: true, cue: 'reagent', src: ['GS', 'C2'] },
  br2: brw, aldose: brw,
  oxid: { reagent: '硫酸酸性 K₂Cr₂O₇（温める）', before: '#e8641e', after: '#3f8f5a', word: '橙赤色 → 緑色', kind: 'tube', cue: 'reagent', src: ['GS'] },
  fecn: { reagent: 'K₄[Fe(CN)₆]', after: '#1f3a8a', word: '濃青色', kind: 'tube', ppt: true, cue: 'reagent', src: ['C7'] },
  hcl: white('HCl'), h2so4: white('H₂SO₄'), co3: white('(NH₄)₂CO₃'),
  h2s_acid: h2s, h2s_base: h2s,
  nh3_few: nh3, nh3_ex: nh3,
  // 残る沈殿の色は物質ごと（Fe(OH)₃・Cu(OH)₂・Ag₂O）。Al・Zn・Pb の水酸化物は溶けて無色
  naoh_ex: { reagent: 'NaOH 水溶液（過剰）', word: '沈殿が残る', kind: 'tube', phases: 2, per: { Fe: '#9a4a26', Cu: '#a9cfe2', Ag: '#6a4a32' },
    perWord: { Fe: '赤褐色', Cu: '青白色', Ag: '褐色' }, cue: 'reagent', src: ['C57', 'C59'] },
  na: gasRow('金属ナトリウム'), cold_water: gasRow('水'), acid_h2: gasRow('希塩酸'), nahco3: gasRow('NaHCO₃ 水溶液'),
  ext_nahco3: gasRow('NaHCO₃ 水溶液'), gas_hcl: gasRow('希塩酸'), water_o2: gasRow('水'),
  tyndall: { reagent: '横から光', word: '光の通り道が見える', kind: 'tyndall', src: ['GS'] },
  // ---- 余力があれば描く（P1）----
  displace_cu: { reagent: 'CuSO₄ 水溶液', before: '#3b82d6', after: '#c8733f', word: '赤色の銅が析出', kind: 'tube', cue: 'reagent', p1: true, src: ['C9'] },
  displace_ag: { reagent: 'AgNO₃ 水溶液', after: '#d9dde2', word: '銀白色の銀が析出', kind: 'tube', cue: 'reagent', p1: true, src: ['C9'] },
  passive: { reagent: '濃 HNO₃', word: '変化なし（不動態）', kind: 'tube', p1: true, src: ['GS'] },
  ox_br: { reagent: 'KBr 水溶液', after: '#c8642a', word: '赤褐色（Br₂ が遊離）', kind: 'tube', cue: 'reagent', p1: true, src: ['C21'] },
  acidic: { reagent: '青色リトマス紙', before: '#3a5ad0', after: '#d8404a', word: '赤色', kind: 'tube', cue: 'reagent', p1: true, src: ['C38'] },
  basic: { reagent: 'フェノールフタレイン', after: '#ff5fa2', word: '赤色', kind: 'tube', cue: 'reagent', p1: true, src: ['C38'] },
  has_n: { reagent: 'ソーダ石灰（加熱）、赤色リトマス紙', before: '#d8404a', after: '#3a5ad0', word: '青色', kind: 'tube', cue: 'reagent', p1: true, src: ['C38'] },
  to_cathode: { reagent: '直流の電圧', after: '#9a4a26', word: '陰極側へ移動', kind: 'tube', cue: 'reagent', p1: true, src: ['GS'] },
  coag_small: { reagent: '少量の電解質', word: '沈殿する（凝析）', kind: 'tube', p1: true, src: ['GS'] },
  // 電気泳動のろ紙のニンヒドリン（紫色：ゲームの札 org-ninhydrin と同じ言い方）。デンプン（6.5）・FeCl₃ とフェノール（4.4）と近いので試薬名を書く
  ninhydrin: { reagent: 'ニンヒドリン（温める）', after: '#5a3a9a', word: '紫色', kind: 'spots', cue: 'reagent', p1: true, src: ['JNH', 'GK'] },
};

/** SPEC2 §10.13 の色の言葉。新しい言葉を足すときは出典を §11 に足す */
export const COLOUR_WORDS = ['白色', '黒色', '赤色', '赤褐色', '褐色', '黒褐色', '黒紫色', '紫色', '赤紫色', '青紫色', '青色', '深青色', '濃青色', '青白色', '青緑色',
  '緑色', '淡緑色', '黄緑色', '淡黄緑色', '黄色', '淡黄色', '黄褐色', '黄金色', '橙赤色', '橙色', '橙黄色', '淡青色', '淡赤色', '銀白色', '灰色', '灰黒色', '無色',
  'ほぼ無色（淡桃色）', '白色（ゲル状）', '血赤色', '紅色', '深赤色', '淡黄白色', '淡桃色'];
/** 文の中の色の言葉（「褐色がかった黄色」なら 褐色 と 黄色。「濃いと」「光で」などの修飾や「白濁」「赤熱」は拾わない） */
export const colourWordsIn = (text: string): string[] => text.match(/[淡濃深薄青赤黄緑紫白黒褐橙紅灰銀金血桃無]+色/g) ?? [];


/** 色を言わない物質の、絵に使う控えめな色 */
const PLAIN = { gas: '#e4ecf1', liquid: '#cfe2ee', solid: '#ecebe6' };

export const lookOf = (id: string): Look | undefined => LOOKS[id];
/** 絵に使う色。見た目の決まっていない物質は、状態ごとの控えめな色 */
export const hexOf = (id: string): string => LOOKS[id]?.hex ?? PLAIN[(hasSub(id) ? sub(id).state : 'liquid') as 'gas' | 'liquid' | 'solid'] ?? PLAIN.liquid;
const STATE_WORD = { gas: '気体', liquid: '液体', solid: '固体' } as const;
/** 「赤褐色の気体」のような言い方。色の決まっていない物質は、状態だけを言う */
export function appearance(id: string): string {
  if (id === 'e' || !hasSub(id)) return '';
  const s = sub(id), l = LOOKS[id];
  const st = STATE_WORD[s.state as keyof typeof STATE_WORD] ?? '';
  if (!l) return st;
  return l.aq ? `水溶液は${l.word}` : `${l.word}の${st}`;
}
/** 溶かすときの言い方。I₂ は水にはほとんど溶けず、KI 水溶液に I₃⁻ として溶ける */
const SOL_IN: Record<string, string> = { I2: 'KI 水溶液に溶かすと' };
/**
 * 水溶液の中で溶けている形の名前。水溶液の反応で生じる I₂ は、まわりの I⁻ と I₃⁻ になって溶け、液が褐色になる（黒紫色の粒の沈殿にはならない）。
 * 反応の見た目（reactionLook）では、sol を持つ固体を水溶液の反応で溶けたものとして扱い、solids・solidsIn に入れず、液の色に sol の色を混ぜる。
 * 電解槽の絵は生成物の固体を電極に hexOf の色で描くので、ヨウ化カリウム水溶液の電気分解の陽極の I₂ は、陽極のまわりの褐色（SPEC2 M7）に替えるまで黒紫色のまま
 */
const SOL_ION: Record<string, string> = { I2: 'I₃⁻' };
/**
 * 図鑑の札の見た目の文。場面ごとの色も添える：「黒紫色の固体（蒸気は紫色、KI 水溶液に溶かすと褐色）」
 * 「水溶液は青色。無水物は白色の固体」。見た目の決まっていない物質は appearance と同じ
 */
export function lookSentence(id: string): string {
  const base = appearance(id), l = LOOKS[id];
  if (!l || !base) return base;
  if (l.aq) return `水溶液は${l.sol?.word ?? l.word}${l.anhyd ? `。無水物は${l.anhyd.word}の固体` : ''}`;
  const extra: string[] = [];
  if (l.vap) extra.push(`蒸気は${l.vap.word}`);
  if (l.sol) extra.push(`${SOL_IN[id] ?? '水に溶かすと'}${l.sol.word}`);
  if (l.photo) extra.push('光に当たると紫を経て黒くなる');
  if (l.glowAir) extra.push('暗い所では空気中で青白く光る（化学発光）');
  return extra.length ? `${base}（${extra.join('、')}）` : base;
}

/** 条件のうち、熱を加えるもの・光を当てるもの */
const HEAT = /加熱|高温|融解|℃|乾留|アルカリ融解|焙焼/;
/** 融解した塩や NaOH の中で起きる反応（融解塩・融解した氷晶石・アルカリ融解。水溶液ではない） */
const MELT = /融解/;

/** 装置の絵と、反応の様子の説明に使う、反応の見た目 */
export interface ReactionLook {
  /** 容器の中身の色：反応の前と後。液体や水溶液がなければ気体の色 */
  before: string;
  after: string;
  /** 中身が気体だけか（液面を描かず、もやとして描く） */
  gasPhase: boolean;
  /** 固体どうしを熱する反応か、融解した塩の中の反応か（どちらも水溶液ではないので、水の液面を描かない） */
  dry: boolean;
  /** 生じる気体の色（泡や煙の色）。気体が生じなければ空 */
  gases: string[];
  /** 生じる固体の色（沈殿・析出）。もとから固体だけの反応では空 */
  solids: string[];
  heat: boolean;
  light: boolean;
  cold: boolean;
  /** 装置の札に出す、触媒や条件の短い名前。「なし」や長いものは空 */
  tag: string;
  /** 色のつく物質についての一言（「NO₂：赤褐色の気体」など）。見た目の決まっている物質だけ */
  notes: { id: string; text: string; made: boolean; form?: 'sol' | 'vap' }[];
  // form：その場面での見え方が、物質の主な見た目と違うとき（sol 水溶液に溶けた色、vap 蒸気の色）。模試の色の問いは、その場面の色を問う
  /** 燃える反応の炎（BURN の 5 つだけ） */
  burn?: Burn;
  /** 融解した媒質の中の反応なら 1（融解塩・融解した氷晶石・アルカリ融解）。温度は T に持つ */
  melt?: number;
  /** 運転温度（℃、出典のあるものだけ）。熱で光るかどうかを決める */
  T?: number;
  /** T が表示の上限で切った値のとき、説明に書く温度 */
  Tcap?: string;
  /** 工程の種類（装置の形） */
  process: ProcessKind;
  /** 発熱が大きい（湯気・熱のゆらぎ） */
  exo?: boolean;
  /** 加えてある指示薬 */
  indicator?: Indicator;
  /** 触媒の見た目 */
  catalyst?: Catalyst;
  /** 水溶液の反応に入ってくる、見た目の決まっている気体と固体（物質 id） */
  gasIn: string[];
  solidsIn: string[];
  /** 生じる気体の係数を、生成物の並び順に（同じ温度・圧力なら体積の比）。水の電気分解なら [2, 1]（H₂ : O₂） */
  gasRatio: number[];
  /** 反応エンタルピー（kJ、thermo.ts の表の値）。数値のない反応は undefined */
  dH?: number;
}

const blend = (cols: string[]): string => {
  if (!cols.length) return PLAIN.liquid;
  let r = 0, g = 0, b = 0;
  for (const c of cols) { r += parseInt(c.slice(1, 3), 16); g += parseInt(c.slice(3, 5), 16); b += parseInt(c.slice(5, 7), 16); }
  const h = (v: number) => Math.round(v / cols.length).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

const cache = new Map<string, ReactionLook>();
export function reactionLook(r: Recipe): ReactionLook {
  const hit = cache.get(r.id);
  if (hit) return hit;
  const ins = r.inputs.map(([s]) => s).filter((s) => s !== 'e' && hasSub(s)), outs = r.outputs.map(([s]) => s).filter((s) => s !== 'e' && hasSub(s));
  const st = (s: string) => sub(s).state;
  const cond = r.accept[0] ?? '', heat = HEAT.test(cond);
  // 熱した気体の反応の中の、蒸気の色を持つ物質（HI の分解で生じる I₂ は気体：2HI(気) → H₂(気) + I₂(気)）。固体の粒にしない
  const vapour = (s: string) => heat && st(s) !== 'gas' && !!LOOKS[s]?.vap;
  const allGas = [...ins, ...outs].every((s) => st(s) === 'gas' || vapour(s));
  // 融解塩・融解した氷晶石・アルカリ融解は、水のない融解液の中の反応（「融解塩（水なし）」の「水」で水溶液と取り違えない）
  const melt = r.accept.some((a) => MELT.test(a));
  // 塩は固体として持っているが、反応は水溶液で起きるものが多い。熱して固体どうしを反応させるもの（乾式）と融解液の反応だけ、水の液を描かない
  const dry = !allGas && (melt || (heat && !/酸|水|溶液/.test(cond) && !ins.some((s) => st(s) === 'liquid' || LOOKS[s]?.aq)));
  const wet = !allGas && !dry;
  // 水溶液の反応で溶けて色を見せる固体（sol を持つもの。I₂ は I₃⁻ の褐色）。水溶液の色を主に持つ物質（aq）は、もとから液の色で描く
  const dissolved = (s: string) => wet && st(s) === 'solid' && !!LOOKS[s]?.sol && !LOOKS[s].aq;
  const tint = (s: string) => (allGas && vapour(s) ? LOOKS[s].vap!.hex : dissolved(s) ? LOOKS[s].sol!.hex : hexOf(s));
  const pt = PROCESS_T[r.id];
  // 容器の中身：色のついた気体・液体・水溶液があればその色。なければ、水溶液なら無色の液、乾式なら固体の色
  const body = (ids: string[]) => {
    // 乾式：固体そのものの色（水溶液の色は使わない）。気体だけ：気体の色。水溶液：液体と水溶液の色（気体は泡として出ていく）
    if (dry) { const solid = ids.filter((s) => st(s) === 'solid'); return solid.length ? blend(solid.map((s) => (LOOKS[s] && !LOOKS[s].aq ? LOOKS[s].hex : PLAIN.solid))) : PLAIN.solid; }
    const colored = ids.filter((s) => LOOKS[s] && !LOOKS[s].metal && (allGas ? st(s) === 'gas' || vapour(s) : st(s) === 'liquid' || !!LOOKS[s].aq || dissolved(s)));
    if (colored.length) return blend(colored.map(tint));
    return wet ? PLAIN.liquid : PLAIN.gas;
  };
  const look: ReactionLook = {
    before: body(ins), after: body(outs), gasPhase: allGas, dry,
    gases: allGas ? [] : outs.filter((s) => st(s) === 'gas').map(hexOf),
    // 沈殿・析出：水溶液の反応で生じる、色の決まっている固体（溶けない塩・硫化物・単体など）。溶けるもの（I₂）は液の色にする
    solids: wet ? outs.filter((s) => st(s) === 'solid' && LOOKS[s] && !LOOKS[s].aq && !dissolved(s)).map(hexOf) : [],
    heat, light: cond === '光', cold: /氷冷/.test(cond),
    tag: (r.machine === 'reactor' || r.machine === 'separator') && cond !== 'なし' && cond.length <= 9 ? cond : '',
    notes: [...ins.map((s) => ({ id: s, made: false })), ...outs.map((s) => ({ id: s, made: true }))]
      .filter((x, i, a) => LOOKS[x.id] && a.findIndex((y) => y.id === x.id) === i)
      .map((x) => {
        const l = LOOKS[x.id];
        // 水溶液の中で生じる固体は、沈殿（金属なら析出）と言う。乾式の反応では、水溶液の色は言わない。
        // 蒸気になるもの・溶けるものは、その場面の色を言い、主な言い方（模試の色の問いの答え）も添える
        const own = `（${STATE_WORD[st(x.id) as keyof typeof STATE_WORD]}は${l.word}）`;
        const text = allGas && vapour(x.id) ? `${l.vap!.word}の気体${own}`
          : dissolved(x.id) ? `水溶液中では${SOL_ION[x.id] ? ` ${SOL_ION[x.id]} の` : ''}${l.sol!.word}${own}`
          : x.made && wet && st(x.id) === 'solid' && !l.aq ? (l.metal ? `${l.word}の固体が析出する` : `${l.word}の沈殿`) : dry && l.aq ? '' : appearance(x.id);
        const form = allGas && vapour(x.id) ? ('vap' as const) : dissolved(x.id) ? ('sol' as const) : undefined;
        return form ? { ...x, text, form } : { ...x, text };
      }).filter((x) => x.text),
    process: processOf(r.id),
    gasIn: wet ? ins.filter((s) => st(s) === 'gas' && LOOKS[s]) : [],
    solidsIn: wet ? ins.filter((s) => st(s) === 'solid' && LOOKS[s] && !LOOKS[s].aq && !dissolved(s)) : [],
    gasRatio: r.outputs.filter(([s]) => s !== 'e' && hasSub(s) && st(s) === 'gas').map(([, n]) => n),
  };
  if (BURN[r.id]) look.burn = BURN[r.id];
  if (melt) look.melt = 1;
  if (pt?.T !== undefined) look.T = pt.T;
  if (pt?.Tcap) look.Tcap = pt.Tcap;
  if (EXO.includes(r.id)) look.exo = true;
  if (RECIPE_INDICATOR[r.id]) look.indicator = RECIPE_INDICATOR[r.id];
  if (CATALYSTS[r.id]) look.catalyst = CATALYSTS[r.id];
  const dH = dHOf(r.id);
  if (dH !== undefined) look.dH = dH;
  cache.set(r.id, look);
  return look;
}
export const reactionLookById = (id: string | undefined): ReactionLook | null => { const r = recipeById(id); return r ? reactionLook(r) : null; };

/** 反応式の文字列。可逆反応は ⇄ で書く。係数を問わない反応（混合物・高分子）は係数を省く */
export function equationOf(r: Recipe): string {
  const side = (list: [string, number][], coef: boolean) => list.map(([id, n]) => (!coef || n === 1 ? '' : n) + label(id)).join(' + ');
  const outs = r.machine === 'battery' ? r.outputs : productsOf(r);
  return `${side(r.inputs, !r.loose)} ${r.shift ? '⇄' : '→'} ${side(outs, !r.loose && !r.mix)}`;
}
