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
}

const tint = (syms: string[]) => element(syms.find((s) => s !== 'H' && s !== 'O') ?? syms.find((s) => s !== 'H') ?? syms[0]).color;

/** 化学式のある純物質 */
const F = (formula: string, name: string, state: State, aliases?: string[]): Substance =>
  ({ id: formula, formula, name, state, aliases, color: tint(Object.keys(parseFormula(formula))) });
/** 混合物・高分子など、化学式で表さないもの */
const M = (id: string, name: string, state: State, rep: string[], named = false): Substance =>
  ({ id, name, state, rep, named, color: tint(rep) });

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
  return s.formula ? pretty(s.formula) : s.name;
}
