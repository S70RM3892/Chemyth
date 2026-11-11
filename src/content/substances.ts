import { normalizeFormula, parseFormula, pretty } from '../chem/formula';
import { element } from './elements';

export type State = 'gas' | 'liquid' | 'solid';

export interface Substance {
  id: string;
  /** 純物質のみ。混合物・高分子・電子は持たない */
  formula?: string;
  /** 入力で認める別の書き方（示性式の表記ゆれ） */
  aliases?: string[];
  name: string;
  /** 常温常圧での状態。ベルト上の台の形が変わる */
  state: State;
  /** 見分け用の色。主役の元素の色から決まる */
  color: string;
  /** 化学式で描けないものの絵柄（元素記号の並び） */
  rep?: string[];
  /** 化学式で書けない生成物。設定画面では名前で選ぶ */
  named?: boolean;
  /** 分析用の試料。見た目では区別できず、この札だけが出る（分子式など） */
  mask?: string;
  /** 試料の正体（示性式など）。図鑑で見せる */
  struct?: string;
  /** 試料が陽性になる検査 */
  pos?: string[];
}

const tint = (syms: string[]) => element(syms.find((s) => s !== 'H' && s !== 'O') ?? syms.find((s) => s !== 'H') ?? syms[0]).color;

/** 化学式のある純物質 */
const F = (formula: string, name: string, state: State, aliases?: string[]): Substance =>
  ({ id: formula, formula, name, state, aliases, color: tint(Object.keys(parseFormula(formula))) });
/** 混合物・高分子など、化学式で表さないもの */
const M = (id: string, name: string, state: State, rep: string[], named = false): Substance =>
  ({ id, name, state, rep, named, color: tint(rep) });

/** 分析用の試料 */
const X = (id: string, name: string, mask: string, struct: string, pos: string[], color: string): Substance =>
  ({ id, name, state: 'liquid', mask, struct, pos, color });
const ORG = '#c9b27a', ION = '#7ab8c9', AMI = '#c98fb0';
/** 捕集びんに集めた気体 */
const J = (gas: string, name: string, rep: string[]): Substance => ({ id: `jar-${gas}`, name: `捕集した${name}`, state: 'solid', rep, color: tint(rep) });

export const SUBSTANCES: Substance[] = [
  // ---- 天然の産出物（混合物） ----
  M('air', '空気', 'gas', ['N', 'N', 'O']),
  M('seawater', '海水', 'liquid', ['H', 'O', 'Na', 'Cl']),
  M('coal', '石炭', 'solid', ['C', 'C', 'H']),
  M('crude', '原油', 'liquid', ['C', 'H', 'S']),
  M('bauxite', 'ボーキサイト', 'solid', ['Al', 'O', 'Fe']),
  M('starch', 'デンプン', 'solid', ['C', 'H', 'O']),
  M('fat', '油脂', 'liquid', ['C', 'H', 'O', 'O']),
  // ---- 名前で扱う生成物 ----
  M('tar', 'コールタール', 'liquid', ['C', 'H'], true),
  M('naphtha', 'ナフサ', 'liquid', ['C', 'H', 'H'], true),
  M('heavy', '重油', 'liquid', ['C', 'C', 'H'], true),
  M('redmud', '赤泥', 'solid', ['Fe', 'O'], true),
  M('crudeCu', '粗銅', 'solid', ['Cu', 'Cu', 'Fe'], true),
  M('slime', '陽極泥', 'solid', ['Ag'], true),
  M('PE', 'ポリエチレン', 'solid', ['C', 'H'], true),
  M('PP', 'ポリプロピレン', 'solid', ['C', 'C', 'H'], true),
  M('PVC', 'ポリ塩化ビニル', 'solid', ['C', 'H', 'Cl'], true),
  M('PS', 'ポリスチレン', 'solid', ['C', 'C', 'C', 'H'], true),
  M('resin', 'フェノール樹脂', 'solid', ['C', 'H', 'O'], true),
  M('soap', 'セッケン', 'solid', ['C', 'H', 'O', 'Na'], true),
  M('e', '電子', 'gas', ['e']),
  M('protein', 'タンパク質', 'solid', ['C', 'H', 'O', 'N']),
  M('rubber', '生ゴム', 'solid', ['C', 'H']),
  M('resinH', '陽イオン交換樹脂（H 型）', 'solid', ['C', 'S', 'H']),
  M('vulcanized', '加硫ゴム', 'solid', ['C', 'H', 'S'], true),
  M('SBR', 'スチレン-ブタジエンゴム', 'solid', ['C', 'C', 'H'], true),
  M('hardfat', '硬化油', 'solid', ['C', 'H', 'O'], true),
  M('resinNa', '陽イオン交換樹脂（Na 型）', 'solid', ['C', 'S', 'Na'], true),
  M('cylN2', '窒素ボンベ', 'solid', ['N', 'N'], true),
  M('peptide', 'ポリペプチド', 'solid', ['C', 'H', 'O', 'N'], true),
  M('aa', 'α-アミノ酸', 'solid', ['C', 'H', 'N', 'O'], true),
  M('PET', 'ポリエチレンテレフタラート', 'solid', ['C', 'C', 'H', 'O'], true),
  M('nylon66', 'ナイロン66', 'solid', ['C', 'H', 'N', 'O'], true),
  M('buffer47', 'pH 4.7 の緩衝液', 'liquid', ['C', 'H', 'O', 'Na'], true),
  M('buffer57', 'pH 5.7 の緩衝液', 'liquid', ['C', 'H', 'O', 'Na'], true),
  J('O2', '酸素', ['O', 'O']), J('H2', '水素', ['H', 'H']), J('NH3', 'アンモニア', ['N', 'H']), J('HCl', '塩化水素', ['H', 'Cl']),
  J('Cl2', '塩素', ['Cl', 'Cl']), J('H2S', '硫化水素', ['H', 'S']), J('SO2', '二酸化硫黄', ['S', 'O']), J('CO2', '二酸化炭素', ['C', 'O']),
  J('NO', '一酸化窒素', ['N', 'O']), J('NO2', '二酸化窒素', ['N', 'O', 'O']),
  // ---- 無機 ----
  F('H2O', '水', 'liquid'), F('NaCl', '塩化ナトリウム', 'solid'),
  F('N2', '窒素', 'gas'), F('O2', '酸素', 'gas'), F('H2', '水素', 'gas'),
  F('NH3', 'アンモニア', 'gas'), F('NO', '一酸化窒素', 'gas'), F('NO2', '二酸化窒素', 'gas'), F('HNO3', '硝酸', 'liquid'),
  F('S', '硫黄', 'solid'), F('SO2', '二酸化硫黄', 'gas'), F('SO3', '三酸化硫黄', 'gas'), F('H2SO4', '硫酸', 'liquid'),
  F('Cl2', '塩素', 'gas'), F('NaOH', '水酸化ナトリウム', 'solid'), F('HCl', '塩化水素', 'gas'), F('Na', 'ナトリウム', 'solid'),
  F('CaCO3', '炭酸カルシウム（石灰石）', 'solid'), F('CaO', '酸化カルシウム（生石灰）', 'solid'), F('CO2', '二酸化炭素', 'gas'),
  F('NaHCO3', '炭酸水素ナトリウム', 'solid'), F('NH4Cl', '塩化アンモニウム', 'solid'), F('Na2CO3', '炭酸ナトリウム', 'solid'),
  F('Ca(OH)2', '水酸化カルシウム（消石灰）', 'solid'), F('CaCl2', '塩化カルシウム', 'solid'),
  F('C', '炭素（コークス）', 'solid'), F('CO', '一酸化炭素', 'gas'),
  F('Fe2O3', '酸化鉄(III)（赤鉄鉱）', 'solid'), F('Fe', '鉄', 'solid'),
  F('Al2O3', '酸化アルミニウム（アルミナ）', 'solid'), F('Al', 'アルミニウム', 'solid'),
  F('CuFeS2', '黄銅鉱', 'solid'), F('Cu2S', '硫化銅(I)', 'solid'), F('Cu', '銅', 'solid'),
  F('CuO', '酸化銅(II)', 'solid'), F('CuSO4', '硫酸銅(II)', 'solid'),
  F('ZnS', '硫化亜鉛（閃亜鉛鉱）', 'solid'), F('ZnO', '酸化亜鉛', 'solid'), F('Zn', '亜鉛', 'solid'), F('ZnSO4', '硫酸亜鉛', 'solid'),
  F('PbS', '硫化鉛(II)（方鉛鉱）', 'solid'), F('PbO', '酸化鉛(II)', 'solid'), F('PbSO4', '硫酸鉛(II)', 'solid'),
  F('Pb', '鉛', 'solid'), F('PbO2', '酸化鉛(IV)', 'solid'), F('Na2SO4', '硫酸ナトリウム', 'solid'),
  // ---- 実験室の試薬と気体 ----
  F('H2S', '硫化水素', 'gas'), F('H2O2', '過酸化水素', 'liquid'), F('KClO3', '塩素酸カリウム', 'solid'), F('KCl', '塩化カリウム', 'solid'),
  F('MnO2', '酸化マンガン(IV)', 'solid'), F('MnCl2', '塩化マンガン(II)', 'solid'), F('FeS', '硫化鉄(II)', 'solid'), F('FeSO4', '硫酸鉄(II)', 'solid'),
  F('NaHSO4', '硫酸水素ナトリウム', 'solid'), F('Cu(NO3)2', '硝酸銅(II)', 'solid'), F('NaNO2', '亜硝酸ナトリウム', 'solid'),
  F('CH3COONa', '酢酸ナトリウム', 'solid'),
  F('AgNO3', '硝酸銀', 'solid'), F('AgCl', '塩化銀', 'solid'), F('NaNO3', '硝酸ナトリウム', 'solid'),
  F('HI', 'ヨウ化水素', 'gas'), F('I2', 'ヨウ素', 'solid'),
  F('CH2CHCHCH2', '1,3-ブタジエン', 'gas', ['C4H6']),
  // ---- 有機（脂肪族） ----
  F('CH4', 'メタン', 'gas'),
  F('C2H4', 'エチレン', 'gas', ['CH2CH2']),
  F('C3H6', 'プロペン', 'gas', ['CH2CHCH3', 'CH3CHCH2']),
  F('C2H2', 'アセチレン', 'gas', ['CHCH']),
  F('CaC2', '炭化カルシウム（カーバイド）', 'solid'),
  F('C2H5OH', 'エタノール', 'liquid', ['CH3CH2OH']),
  F('CH3CHO', 'アセトアルデヒド', 'liquid'),
  F('CH3COOH', '酢酸', 'liquid'),
  F('CH3COOC2H5', '酢酸エチル', 'liquid', ['CH3COOCH2CH3']),
  F('C2H5OC2H5', 'ジエチルエーテル', 'liquid', ['CH3CH2OCH2CH3', '(C2H5)2O']),
  F('CH3OH', 'メタノール', 'liquid'),
  F('HCHO', 'ホルムアルデヒド', 'gas'),
  F('CH2CHCl', '塩化ビニル', 'gas', ['C2H3Cl']),
  F('(CH3CO)2O', '無水酢酸', 'liquid'),
  F('CH3COCH3', 'アセトン', 'liquid', ['(CH3)2CO']),
  F('C3H5(OH)3', 'グリセリン', 'liquid'),
  F('C12H22O11', 'マルトース', 'solid'),
  F('C6H12O6', 'グルコース', 'solid'),
  // ---- 有機（芳香族） ----
  F('C6H6', 'ベンゼン', 'liquid'),
  F('C6H5NO2', 'ニトロベンゼン', 'liquid'),
  F('C6H5NH2', 'アニリン', 'liquid'),
  F('C6H5Cl', 'クロロベンゼン', 'liquid'),
  F('C6H5CH(CH3)2', 'クメン', 'liquid'),
  F('C6H5OH', 'フェノール', 'solid'),
  F('C6H5ONa', 'ナトリウムフェノキシド', 'solid'),
  F('C6H4(OH)COONa', 'サリチル酸ナトリウム', 'solid'),
  F('C6H4(OH)COOH', 'サリチル酸', 'solid'),
  F('C6H4(OH)COOCH3', 'サリチル酸メチル', 'liquid'),
  F('C6H4(OCOCH3)COOH', 'アセチルサリチル酸', 'solid'),
  F('C6H5C2H5', 'エチルベンゼン', 'liquid', ['C6H5CH2CH3']),
  F('C6H5CHCH2', 'スチレン', 'liquid'),
  F('C6H5CH3', 'トルエン', 'liquid'),
  F('C6H4(CH3)2', 'p-キシレン', 'liquid'),
  F('C6H5COOH', '安息香酸', 'solid'),
  F('C6H4(COOH)2', 'テレフタル酸', 'solid'),
  F('C2H4O', 'エチレンオキシド', 'gas', ['(CH2)2O']),
  F('C2H4(OH)2', 'エチレングリコール', 'liquid', ['HOCH2CH2OH', 'HO(CH2)2OH', '(CH2OH)2']),
  F('HOOC(CH2)4COOH', 'アジピン酸', 'solid'),
  F('H2N(CH2)6NH2', 'ヘキサメチレンジアミン', 'solid'),
  F('C6H5N2Cl', '塩化ベンゼンジアゾニウム', 'solid'),
  F('C6H5N2C6H4OH', 'p-ヒドロキシアゾベンゼン', 'solid', ['C6H5NNC6H4OH']),

  // ---- 分析用の試料：C₄H₁₀O ----
  X('x-1-butanol', '1-ブタノール', 'C₄H₁₀O', 'CH₃CH₂CH₂CH₂OH', ['na', 'oxid', 'oxald'], ORG),
  X('x-2-butanol', '2-ブタノール', 'C₄H₁₀O', 'CH₃CH(OH)CH₂CH₃', ['na', 'oxid', 'iodoform', 'chiral'], ORG),
  X('x-isobutanol', '2-メチル-1-プロパノール', 'C₄H₁₀O', '(CH₃)₂CHCH₂OH', ['na', 'oxid', 'oxald'], ORG),
  X('x-tbutanol', '2-メチル-2-プロパノール', 'C₄H₁₀O', '(CH₃)₃COH', ['na'], ORG),
  X('x-ether', 'ジエチルエーテル', 'C₄H₁₀O', 'C₂H₅OC₂H₅', [], ORG),
  // ---- C₃H₆O ----
  X('x-propanal', 'プロピオンアルデヒド', 'C₃H₆O', 'CH₃CH₂CHO', ['silver', 'oxid'], ORG),
  X('x-acetone', 'アセトン', 'C₃H₆O', 'CH₃COCH₃', ['iodoform'], ORG),
  X('x-allyl', 'アリルアルコール', 'C₃H₆O', 'CH₂=CHCH₂OH', ['na', 'br2', 'oxid', 'oxald'], ORG),
  // ---- C₇H₈O ----
  X('x-cresol', 'o-クレゾール', 'C₇H₈O', 'C₆H₄(CH₃)OH', ['na', 'fecl3'], ORG),
  X('x-benzyl', 'ベンジルアルコール', 'C₇H₈O', 'C₆H₅CH₂OH', ['na', 'oxid', 'oxald'], ORG),
  X('x-anisole', 'アニソール', 'C₇H₈O', 'C₆H₅OCH₃', [], ORG),
  // ---- C₄H₈O₂ ----
  X('x-butyric', '酪酸', 'C₄H₈O₂', 'CH₃CH₂CH₂COOH', ['na', 'nahco3'], ORG),
  X('x-ethylacetate', '酢酸エチル', 'C₄H₈O₂', 'CH₃COOC₂H₅', ['hyd_iodoform'], ORG),
  X('x-methylpropionate', 'プロピオン酸メチル', 'C₄H₈O₂', 'C₂H₅COOCH₃', [], ORG),
  X('x-formate', 'ギ酸プロピル', 'C₄H₈O₂', 'HCOOCH₂CH₂CH₃', ['silver', 'oxid', 'hyd_silver'], ORG),
  X('x-isopropylformate', 'ギ酸イソプロピル', 'C₄H₈O₂', 'HCOOCH(CH₃)₂', ['silver', 'oxid', 'hyd_silver', 'hyd_iodoform'], ORG),
  // ---- C₄H₈ ----
  X('x-1-butene', '1-ブテン', 'C₄H₈', 'CH₂=CHCH₂CH₃', ['br2', 'ozone_hcho'], ORG),
  X('x-2-butene', '2-ブテン', 'C₄H₈', 'CH₃CH=CHCH₃', ['br2', 'cistrans'], ORG),
  X('x-isobutene', '2-メチルプロペン', 'C₄H₈', 'CH₂=C(CH₃)₂', ['br2', 'ozone_hcho', 'ozone_ketone'], ORG),
  X('x-cyclobutane', 'シクロブタン', 'C₄H₈', '環状の C₄H₈', [], ORG),
  // ---- アミノ酸とペプチド ----
  X('x-gly', 'グリシン', 'アミノ酸', 'H₂N–CH₂–COOH', [], AMI),
  X('x-ala', 'アラニン', 'アミノ酸', 'H₂N–CH(CH₃)–COOH', ['chiral'], AMI),
  X('x-phe', 'フェニルアラニン', 'アミノ酸', 'H₂N–CH(CH₂C₆H₅)–COOH', ['chiral', 'xantho'], AMI),
  X('x-cys', 'システイン', 'アミノ酸', 'H₂N–CH(CH₂SH)–COOH', ['chiral', 'sulfur'], AMI),
  X('x-glu', 'グルタミン酸', 'アミノ酸', 'H₂N–CH(CH₂CH₂COOH)–COOH', ['chiral', 'anode'], AMI),
  X('x-lys', 'リシン', 'アミノ酸', 'H₂N–CH((CH₂)₄NH₂)–COOH', ['chiral', 'cathode'], AMI),
  X('x-dipeptide', 'ジペプチド（Gly-Ala）', 'ペプチド', 'ペプチド結合 1 つ', ['chiral'], AMI),
  X('x-tripeptide', 'トリペプチド（Gly-Gly-Ala）', 'ペプチド', 'ペプチド結合 2 つ', ['chiral', 'biuret'], AMI),
  X('x-ala2', 'アラニン（単独）', 'ペプチド', 'アミノ酸 1 分子', ['chiral'], AMI),
  // ---- 金属イオン ----
  X('x-Ag', '銀イオン Ag⁺', '金属イオン', 'Ag⁺（無色）', ['hcl', 'h2s_acid', 'h2s_base', 'nh3_few', 'naoh_ex', 'co3'], ION),
  X('x-Pb', '鉛(II)イオン Pb²⁺', '金属イオン', 'Pb²⁺（無色）', ['hcl', 'h2s_acid', 'h2s_base', 'nh3_few', 'nh3_ex', 'h2so4', 'co3'], ION),
  X('x-Cu', '銅(II)イオン Cu²⁺', '金属イオン', 'Cu²⁺（青色）', ['h2s_acid', 'h2s_base', 'nh3_few', 'naoh_ex', 'co3', 'flame_bg'], ION),
  X('x-Fe', '鉄(III)イオン Fe³⁺', '金属イオン', 'Fe³⁺（黄褐色）', ['h2s_base', 'nh3_few', 'nh3_ex', 'naoh_ex', 'co3', 'fecn'], ION),
  X('x-Al', 'アルミニウムイオン Al³⁺', '金属イオン', 'Al³⁺（無色）', ['nh3_few', 'nh3_ex', 'co3'], ION),
  X('x-Zn', '亜鉛イオン Zn²⁺', '金属イオン', 'Zn²⁺（無色）', ['h2s_base', 'nh3_few', 'co3'], ION),
  X('x-Ca', 'カルシウムイオン Ca²⁺', '金属イオン', 'Ca²⁺（無色）', ['h2so4', 'co3', 'flame_or'], ION),
  X('x-Ba', 'バリウムイオン Ba²⁺', '金属イオン', 'Ba²⁺（無色）', ['h2so4', 'co3', 'flame_yg'], ION),
  X('x-Na', 'ナトリウムイオン Na⁺', '金属イオン', 'Na⁺（無色）', ['flame_y'], ION),
  X('x-K', 'カリウムイオン K⁺', '金属イオン', 'K⁺（無色）', ['flame_rp'], ION),
];

const byId = new Map(SUBSTANCES.map((s) => [s.id, s]));
const byText = new Map<string, Substance>();
for (const s of SUBSTANCES) for (const t of [s.formula, ...(s.aliases ?? [])]) if (t) byText.set(t, s);

export function sub(id: string): Substance {
  const s = byId.get(id);
  if (!s) throw new Error(`未定義の物質: ${id}`);
  return s;
}
export const hasSub = (id: string) => byId.has(id);

/** 入力された化学式から物質を引く。知らない式なら null */
export function subByFormula(raw: string): Substance | null {
  return byText.get(normalizeFormula(raw)) ?? null;
}

/** 原子の数は合うのに書き方が違う（分子式で書いた等）物質があるか */
export function sameAtoms(raw: string): boolean {
  try {
    const a = JSON.stringify(Object.entries(parseFormula(raw)).sort());
    return SUBSTANCES.some((s) => s.formula && JSON.stringify(Object.entries(parseFormula(s.formula)).sort()) === a);
  } catch {
    return false;
  }
}

export function label(id: string): string {
  if (id === 'e') return 'e⁻';
  const s = sub(id);
  return s.mask ?? (s.formula ? pretty(s.formula) : s.name);
}
