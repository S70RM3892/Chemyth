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
const ORG = '#c9b27a', ION = '#7ab8c9', AMI = '#c98fb0', THE = '#9fb0d9';
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
  M('base', '核酸塩基', 'solid', ['C', 'N', 'H']),
  M('cellulose', 'セルロース', 'solid', ['C', 'H', 'O', 'O']),
  M('sucrose', 'スクロース', 'solid', ['C', 'H', 'O']),
  M('caprolactam', 'ε-カプロラクタム', 'solid', ['C', 'N', 'O']),
  M('MMA', 'メタクリル酸メチル', 'liquid', ['C', 'H', 'O']),
  M('fructose', 'フルクトース', 'solid', ['C', 'H', 'O'], true),
  M('cellobiose', 'セロビオース', 'solid', ['C', 'H', 'O'], true),
  M('PVAc', 'ポリ酢酸ビニル', 'solid', ['C', 'H', 'O'], true),
  M('PVA', 'ポリビニルアルコール', 'solid', ['C', 'H', 'O'], true),
  M('vinylon', 'ビニロン', 'solid', ['C', 'H', 'O'], true),
  M('PAN', 'ポリアクリロニトリル', 'solid', ['C', 'H', 'N'], true),
  M('nylon6', 'ナイロン6', 'solid', ['C', 'H', 'N', 'O'], true),
  M('urearesin', '尿素樹脂', 'solid', ['C', 'N', 'O'], true),
  M('PMMA', 'ポリメタクリル酸メチル', 'solid', ['C', 'H', 'O'], true),
  M('rayon', 'レーヨン', 'solid', ['C', 'H', 'O'], true),
  M('triacetyl', 'トリアセチルセルロース', 'solid', ['C', 'H', 'O'], true),
  M('nitrocellulose', 'トリニトロセルロース', 'solid', ['C', 'N', 'O'], true),
  M('nucleotide', 'ヌクレオチド', 'solid', ['P', 'C', 'N', 'O'], true),
  M('DNA', 'DNA（ポリヌクレオチド）', 'solid', ['P', 'C', 'N'], true),
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
  F('H3PO4', 'リン酸', 'liquid'), F('C5H10O4', 'デオキシリボース', 'solid'),
  // ---- 非金属・金属の続き ----
  F('Ca3(PO4)2', 'リン酸カルシウム（リン鉱石）', 'solid'), F('SiO2', '二酸化ケイ素（ケイ砂）', 'solid'), F('CaSiO3', 'ケイ酸カルシウム', 'solid'),
  F('P4', '黄リン', 'solid'), F('P4O10', '十酸化四リン', 'solid'), F('Ca(H2PO4)2', 'リン酸二水素カルシウム', 'solid'), F('CaSO4', '硫酸カルシウム', 'solid'),
  F('Si', 'ケイ素', 'solid'), F('Na2SiO3', 'ケイ酸ナトリウム', 'solid'), F('H2SiO3', 'ケイ酸', 'solid'),
  F('CaF2', 'フッ化カルシウム（蛍石）', 'solid'), F('HF', 'フッ化水素', 'gas'), F('H2SiF6', 'ヘキサフルオロケイ酸', 'liquid'),
  F('HClO', '次亜塩素酸', 'liquid'), F('CaCl(ClO)', 'さらし粉', 'solid'),
  F('KBr', '臭化カリウム', 'solid'), F('KI', 'ヨウ化カリウム', 'solid'), F('Br2', '臭素', 'liquid'), F('F2', 'フッ素', 'gas'), F('O3', 'オゾン', 'gas'),
  F('NaAl(OH)4', 'テトラヒドロキシドアルミン酸ナトリウム', 'solid'), F('Na2Zn(OH)4', 'テトラヒドロキシド亜鉛(II)酸ナトリウム', 'solid'),
  F('FeCl2', '塩化鉄(II)', 'solid'), F('FeCl3', '塩化鉄(III)', 'solid'), F('Ag', '銀', 'solid'), F('Na2SO3', '亜硫酸ナトリウム', 'solid'),
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
  F('CH3Cl', 'クロロメタン', 'gas'),
  F('CH2BrCH2Br', '1,2-ジブロモエタン', 'liquid', ['C2H4Br2']),
  F('CH2CHOCOCH3', '酢酸ビニル', 'liquid', ['CH3COOCHCH2']),
  F('HCN', 'シアン化水素', 'gas'),
  F('CH2CHCN', 'アクリロニトリル', 'liquid'),
  F('CO(NH2)2', '尿素', 'solid', ['(NH2)2CO']),
  F('C6H5SO3H', 'ベンゼンスルホン酸', 'solid'),
  F('C6H5SO3Na', 'ベンゼンスルホン酸ナトリウム', 'solid'),
  F('C6H5NH3Cl', 'アニリン塩酸塩', 'solid'),
  F('C6H5NHCOCH3', 'アセトアニリド', 'solid'),

  // ---- 結晶の種類 ----
  X('x-nacl-s', '塩化ナトリウムの結晶', '固体', 'イオン結晶', ['melt_conduct'], THE),
  X('x-diamond', 'ダイヤモンド', '固体', '共有結合の結晶', ['very_hard'], THE),
  X('x-graphite', '黒鉛', '固体', '共有結合の結晶（層状）', ['solid_conduct'], THE),
  X('x-dryice', 'ドライアイス', '固体', '分子結晶', ['sublime'], THE),
  X('x-cu-s', '銅の結晶', '固体', '金属結晶', ['solid_conduct', 'malleable'], THE),
  // ---- 分子の形と極性 ----
  X('x-h2o', '水分子', '分子', 'H₂O　折れ線形', ['polar', 'hbond', 'lone2'], THE),
  X('x-nh3', 'アンモニア分子', '分子', 'NH₃　三角錐形', ['polar', 'hbond'], THE),
  X('x-co2', '二酸化炭素分子', '分子', 'CO₂　直線形', ['linear'], THE),
  X('x-ch4', 'メタン分子', '分子', 'CH₄　正四面体形', [], THE),
  X('x-hcl', '塩化水素分子', '分子', 'HCl　直線形', ['polar', 'linear'], THE),
  // ---- 原子と電子配置 ----
  X('x-na', 'ナトリウム原子', '原子', 'K2 L8 M1', ['val1', 'ne_config'], THE),
  X('x-mg', 'マグネシウム原子', '原子', 'K2 L8 M2', ['cation2', 'ne_config'], THE),
  X('x-o', '酸素原子', '原子', 'K2 L6', ['ne_config'], THE),
  X('x-cl', '塩素原子', '原子', 'K2 L8 M7', ['anion1', 'ar_config'], THE),
  X('x-ar', 'アルゴン原子', '原子', 'K2 L8 M8', ['noble'], THE),
  X('x-k', 'カリウム原子', '原子', 'K2 L8 M8 N1', ['val1', 'ar_config'], THE),
  // ---- コロイド ----
  X('x-feoh3', '水酸化鉄(III)のコロイド溶液', '液体', '疎水コロイド（正に帯電）', ['tyndall', 'coag_small', 'to_cathode'], THE),
  X('x-clay', '粘土のコロイド溶液', '液体', '疎水コロイド（負に帯電）', ['tyndall', 'coag_small'], THE),
  X('x-gelatin', 'ゼラチン水溶液', '液体', '親水コロイド', ['tyndall'], THE),
  X('x-brine', '食塩水', '液体', '真の溶液', [], THE),
  X('x-mud', '泥水', '液体', '懸濁液', ['filter_stop'], THE),
  // ---- 塩の水溶液 ----
  X('x-s-nacl', '塩化ナトリウム', '塩', 'NaCl　強酸と強塩基の正塩', [], THE),
  X('x-s-nh4cl', '塩化アンモニウム', '塩', 'NH₄Cl　強酸と弱塩基の正塩', ['acidic'], THE),
  X('x-s-acona', '酢酸ナトリウム', '塩', 'CH₃COONa　弱酸と強塩基の正塩', ['basic'], THE),
  X('x-s-nahco3', '炭酸水素ナトリウム', '塩', 'NaHCO₃　酸性塩', ['basic', 'acid_salt', 'gas_hcl'], THE),
  X('x-s-nahso4', '硫酸水素ナトリウム', '塩', 'NaHSO₄　酸性塩', ['acidic', 'acid_salt'], THE),
  X('x-s-na2co3', '炭酸ナトリウム', '塩', 'Na₂CO₃　弱酸と強塩基の正塩', ['basic', 'gas_hcl'], THE),
  // ---- 金属のイオン化傾向 ----
  X('x-m-na', 'ナトリウム', '金属', 'Na', ['cold_water', 'acid_h2'], ION),
  X('x-m-zn', '亜鉛', '金属', 'Zn', ['acid_h2', 'displace_cu', 'displace_ag'], ION),
  X('x-m-fe', '鉄', '金属', 'Fe', ['acid_h2', 'displace_cu', 'displace_ag', 'passive'], ION),
  X('x-m-cu', '銅', '金属', 'Cu', ['displace_ag'], ION),
  X('x-m-ag', '銀', '金属', 'Ag', [], ION),
  X('x-m-au', '金', '金属', 'Au', ['aqua_only'], ION),
  // ---- ハロゲンの単体 ----
  X('x-f2', 'フッ素', 'ハロゲン', 'F₂　淡黄色の気体', ['gas_rt', 'water_o2'], ION),
  X('x-cl2', '塩素', 'ハロゲン', 'Cl₂　黄緑色の気体', ['gas_rt', 'ox_br'], ION),
  X('x-br2', '臭素', 'ハロゲン', 'Br₂　赤褐色の液体', ['liquid_rt'], ION),
  X('x-i2', 'ヨウ素', 'ハロゲン', 'I₂　黒紫色の固体', ['starch'], ION),
  // ---- 糖 ----
  X('x-glc', 'グルコース', '糖', '単糖（アルドース）', ['fehling', 'mono', 'aldose'], ORG),
  X('x-fru', 'フルクトース', '糖', '単糖（ケトース）', ['fehling', 'mono'], ORG),
  X('x-suc', 'スクロース', '糖', '二糖（グルコース＋フルクトース）', [], ORG),
  X('x-mal', 'マルトース', '糖', '二糖（グルコース 2 分子）', ['fehling', 'hyd_glc_only', 'aldose'], ORG),
  X('x-starch', 'デンプン', '糖', '多糖（α-グルコース）', ['iodine', 'hyd_glc_only'], ORG),
  X('x-cellulose', 'セルロース', '糖', '多糖（β-グルコース）', ['hyd_glc_only'], ORG),
  // ---- 合成高分子 ----
  X('x-pe', 'ポリエチレン', '高分子', '付加重合・熱可塑性', [], ORG),
  X('x-pvc', 'ポリ塩化ビニル', '高分子', '付加重合・塩素を含む', ['has_cl'], ORG),
  X('x-nylon', 'ナイロン66', '高分子', '縮合重合・アミド結合', ['has_n', 'condense'], ORG),
  X('x-pet', 'ポリエチレンテレフタラート', '高分子', '縮合重合・エステル結合', ['condense', 'ester_bond'], ORG),
  X('x-bakelite', 'フェノール樹脂', '高分子', '付加縮合・熱硬化性', ['thermoset'], ORG),
  // ---- 芳香族化合物の分離 ----
  X('x-aniline', 'アニリン', '芳香族', 'C₆H₅NH₂　塩基', ['ext_hcl'], ORG),
  X('x-phenol', 'フェノール', '芳香族', 'C₆H₅OH　炭酸より弱い酸', ['ext_naoh', 'fecl3'], ORG),
  X('x-benzoic', '安息香酸', '芳香族', 'C₆H₅COOH　炭酸より強い酸', ['ext_naoh', 'ext_nahco3'], ORG),
  X('x-toluene', 'トルエン', '芳香族', 'C₆H₅CH₃　中性', [], ORG),

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
  // ---- 核酸の塩基 ----
  X('x-A', 'アデニン（A）', '核酸の塩基', 'プリン塩基。T（U）と水素結合 2 本', ['purine'], AMI),
  X('x-G', 'グアニン（G）', '核酸の塩基', 'プリン塩基。C と水素結合 3 本', ['purine', 'pair3'], AMI),
  X('x-C', 'シトシン（C）', '核酸の塩基', 'ピリミジン塩基。G と水素結合 3 本', ['pair3'], AMI),
  X('x-T', 'チミン（T）', '核酸の塩基', 'ピリミジン塩基。DNA だけに含まれる', ['dna_only'], AMI),
  X('x-U', 'ウラシル（U）', '核酸の塩基', 'ピリミジン塩基。RNA だけに含まれる', ['rna_only'], AMI),
  // ---- 元素分析で見分ける有機化合物 ----
  X('x-benzene', 'ベンゼン', '有機化合物', 'C₆H₆', ['burn_c'], ORG),
  X('x-hexane', 'ヘキサン', '有機化合物', 'C₆H₁₄', ['burn_h'], ORG),
  X('x-ethanol', 'エタノール', '有機化合物', 'C₂H₅OH', ['burn_h', 'na', 'iodoform', 'oxid', 'oxald'], ORG),
  X('x-acetic', '酢酸', '有機化合物', 'CH₃COOH', ['burn_eq', 'na', 'nahco3'], ORG),
  X('x-acetaldehyde', 'アセトアルデヒド', '有機化合物', 'CH₃CHO', ['burn_eq', 'silver', 'iodoform', 'oxid'], ORG),
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
