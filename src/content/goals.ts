import type { Zone } from './map';
import { SETS, TESTS, isPositive } from './samples';
import { sub } from './substances';

export interface Goal {
  s: string;
  n: number;
  hint: string;
  /** 画面の縁に道しるべを出す資源地 */
  zone?: Zone;
  /** 仕分け課題：この試料の組の別の物質を納品すると減点される */
  strict?: string;
  /** コンビナート：これらの物質も、同じ数だけ同時に納める。副生成物を捨てずに回す配管が要る */
  also?: string[];
  /** 量産：毎分この数の速さで納め続ける。n は、その速さを保つ秒数 */
  rate?: number;
}

export interface Chapter { name: string; goals: Goal[] }

export const CHAPTERS: Chapter[] = [
  { name: '第1章 空気と水', goals: [
    { s: 'N2', n: 10, hint: '陸地ならどこでも空気が採れる。採取機を置いて、蒸留塔で分けろ。' },
    { s: 'H2', n: 10, hint: '海水は、あちこちにある海や入り江で採れる。水を取り出して電気で分解しろ。要らない物質は廃棄口へ。', zone: 'bay' },
    { s: 'NH3', n: 20, hint: '窒素と水素を反応器に入れろ。' },
  ] },
  { name: '第2章 酸とアルカリの工業', goals: [
    { s: 'HNO3', n: 10, hint: 'アンモニアを酸化して硝酸にしろ。3段階ある。捨てていた酸素と水に使い道ができた。' },
    { s: 'H2SO4', n: 10, hint: '南東の硫黄鉱床から始めろ。これも3段階。', zone: 'sulfur' },
    { s: 'NaOH', n: 10, hint: '海水から採った塩と水を、一緒に電気分解しろ。' , zone: 'bay' },
    { s: 'HCl', n: 10, hint: '食塩水の電気分解で出た 2 種類の気体どうしを反応させろ。' },
    { s: 'Na2CO3', n: 10, hint: 'アンモニアソーダ法。北西の石灰岩地帯から CO₂ を得ろ。4 つの原料が要る。', zone: 'limestone' },
  ] },
  { name: '第3章 金属の製錬', goals: [
    { s: 'Fe', n: 10, hint: '東の炭田の石炭を乾留してコークスにし、北東の鉄鉱山の鉱石を還元しろ。還元するのはコークスそのものではない。', zone: 'iron' },
    { s: 'Al', n: 10, hint: '南東のボーキサイトを精製してから電気分解しろ。水溶液では取り出せない。', zone: 'bauxite' },
    { s: 'Cu', n: 10, hint: '北の銅鉱山の黄銅鉱を 2 段階で粗銅にし、電気分解で純銅にしろ。', zone: 'copper' },
    { s: 'Zn', n: 10, hint: '南西の亜鉛鉱山。硫化物はまず焼いて酸化物にしろ。', zone: 'zinc' },
  ] },
  { name: '第4章 電池', goals: [
    { s: 'e', n: 40, hint: '新しい装置「電池」。水素と酸素から電子を取り出せ。どちらが負極か考えろ。' },
    { s: 'ZnSO4', n: 10, hint: 'ダニエル電池を組め。正極側には硫酸銅(II)が要る。銅を酸化して硫酸に溶かせ。' },
    { s: 'PbO2', n: 10, hint: '南の鉛鉱山。PbS → PbO → PbSO₄ と進め、PbSO₄ を電解槽で充電しろ。', zone: 'lead' },
    { s: 'e', n: 60, hint: '鉛蓄電池を放電させろ。出てきた PbSO₄ を充電に戻せば、同じ鉛が何度でも回る。' },
  ] },
  { name: '第5章 有機化合物（脂肪族）', goals: [
    { s: 'C2H4', n: 10, hint: '西の油田。原油を分留し、ナフサを熱分解しろ。', zone: 'oil' },
    { s: 'C2H5OH', n: 10, hint: 'エチレンに水を付加させろ。' },
    { s: 'CH3CHO', n: 10, hint: 'エチレンを酸化しろ。触媒は 2 つの塩化物の組み合わせ。' },
    { s: 'CH3COOH', n: 10, hint: 'アルデヒドをさらに酸化しろ。' },
    { s: 'CH3COOC2H5', n: 10, hint: 'カルボン酸とアルコールから水をとれ。' },
    { s: 'C2H5OC2H5', n: 5, hint: 'エタノールと濃硫酸。温度で生成物が変わる。低い方の温度だ。' },
    { s: 'C2H2', n: 10, hint: '生石灰とコークスからカーバイドを作り、水を加えろ。' },
    { s: 'CH3OH', n: 10, hint: '北西のガス田のメタンと水蒸気から合成ガスを作り、メタノールにしろ。', zone: 'gas' },
    { s: 'HCHO', n: 5, hint: 'メタノールを酸化しろ。' },
  ] },
  { name: '第6章 有機化合物（芳香族）', goals: [
    { s: 'C6H5NO2', n: 10, hint: 'ベンゼンはナフサの熱分解で出ていた。硝酸でニトロ化しろ。' },
    { s: 'C6H5NH2', n: 10, hint: 'ニトロ基を還元しろ。' },
    { s: 'C6H5OH', n: 10, hint: 'クメン法。ベンゼンとプロペンから 2 段階。アセトンも出る。' },
    { s: 'C6H4(OH)COOH', n: 10, hint: 'フェノールを塩にし、高温・高圧で CO₂ と反応させ、強酸で遊離させろ。' },
    { s: 'C6H4(OH)COOCH3', n: 5, hint: 'サリチル酸のカルボキシ基をメタノールでエステル化しろ。' },
    { s: 'C6H4(OCOCH3)COOH', n: 5, hint: 'サリチル酸のヒドロキシ基を無水酢酸でアセチル化しろ。無水酢酸は酢酸から作れ。' },
  ] },
  { name: '第7章 高分子化合物', goals: [
    { s: 'PE', n: 10, hint: 'エチレンをつなげろ。条件欄では反応の種類を選べ。' },
    { s: 'PVC', n: 10, hint: 'アセチレンに塩化水素を付加させて、つなげろ。' },
    { s: 'PS', n: 5, hint: 'ベンゼンとエチレンからエチルベンゼン、脱水素してスチレン、そしてつなげろ。' },
    { s: 'resin', n: 5, hint: 'フェノールとホルムアルデヒド。付加と縮合を繰り返す。' },
    { s: 'C6H12O6', n: 10, hint: '南の農地のデンプンを、酵素で 2 段階に分解しろ。酵素は相手を選ぶ。', zone: 'farm' },
    { s: 'soap', n: 10, hint: '北東のオリーブ畑の油脂を、強塩基で加水分解しろ。', zone: 'grove' },
  ] },
  { name: '第8章 気体の製法と捕集', goals: [
    { s: 'jar-O2', n: 5, hint: '新しい装置「試薬棚」と「捕集器」。試薬棚の過酸化水素を分解して酸素を作り、正しい方法で集めろ。' },
    { s: 'jar-NH3', n: 5, hint: '塩化アンモニウムと水酸化カルシウムを加熱しろ。乾燥剤を間違えるな。' },
    { s: 'jar-Cl2', n: 5, hint: '酸化マンガン(IV)と濃塩酸。ここでの MnO₂ は触媒ではない。' },
    { s: 'jar-H2S', n: 5, hint: '硫化鉄(II)と希硫酸。この気体は濃硫酸では乾燥できない。' },
    { s: 'jar-NO', n: 5, hint: '銅と硝酸。酸の濃さで出てくる気体が変わる。' },
    { s: 'jar-SO2', n: 5, hint: '銅と硫酸。希硫酸では溶けない。' },
  ] },
  { name: '第9章 金属イオンの分離', goals: [
    { s: 'x-Ag', n: 8, strict: 'G', hint: '試薬棚で「試料 G」を選べ。見分けのつかない 4 種のイオンが流れてくる。分析器で検査して、銀イオンだけを納品しろ。違うものを納めると減点される。' },
    { s: 'x-Cu', n: 8, strict: 'G', hint: '同じ試料 G から銅(II)イオンだけを取り出せ。検査は 1 つとは限らない。' },
    { s: 'x-Al', n: 8, strict: 'H', hint: '試料 H。アンモニア水にも水酸化ナトリウム水溶液にも、少量と過剰で違いが出る。' },
    { s: 'x-Zn', n: 8, strict: 'H', hint: '試料 H から亜鉛イオンを。錯イオンをつくって溶けるのはどれか。' },
    { s: 'x-Ba', n: 8, strict: 'I', hint: '試料 I。沈殿をつくらないイオンは炎の色で見分けろ。' },
    { s: 'x-K', n: 8, strict: 'I', hint: '試料 I からカリウムイオンを。' },
  ] },
  { name: '第10章 有機化合物の構造決定', goals: [
    { s: 'x-2-butanol', n: 8, strict: 'A', hint: '試料 A は分子式 C₄H₁₀O の 5 種。2-ブタノールだけがもつ特徴を検査しろ。' },
    { s: 'x-tbutanol', n: 8, strict: 'A', hint: '試料 A から 2-メチル-2-プロパノールを。第三級アルコールの性質を使え。検査を 2 つ直列につなぐ。' },
    { s: 'x-ether', n: 8, strict: 'A', hint: '試料 A からジエチルエーテルを。陰性の側の出口を使え。' },
    { s: 'x-acetone', n: 8, strict: 'B', hint: '試料 B は分子式 C₃H₆O の 3 種。ケトンを取り出せ。' },
    { s: 'x-propanal', n: 8, strict: 'B', hint: '試料 B からアルデヒドを。' },
    { s: 'x-benzyl', n: 8, strict: 'C', hint: '試料 C は芳香族 C₇H₈O の 3 種。ベンジルアルコールを。フェノール類との違いは。' },
    { s: 'x-cresol', n: 8, strict: 'C', hint: '試料 C から o-クレゾールを。' },
    { s: 'x-formate', n: 8, strict: 'D', hint: '試料 D は C₄H₈O₂ の 4 種。エステルなのに還元性を示すものがある。' },
    { s: 'x-butyric', n: 8, strict: 'D', hint: '試料 D からカルボン酸を。' },
    { s: 'x-isobutene', n: 8, strict: 'J', hint: '試料 J は分子式 C₄H₈ の 4 種。オゾン分解の生成物から、二重結合のまわりの形を読め。' },
    { s: 'x-2-butene', n: 8, strict: 'J', hint: '試料 J から、立体異性体をもつものを。' },
    { s: 'x-cyclobutane', n: 8, strict: 'J', hint: '試料 J には、二重結合をもたない C₄H₈ が混ざっている。' },
    { s: 'x-isopropylformate', n: 8, strict: 'K', hint: '試料 K は C₄H₈O₂ のエステル 4 種。加水分解して、できた酸とアルコールをそれぞれ調べろ。' },
    { s: 'x-ethylacetate', n: 8, strict: 'K', hint: '試料 K から酢酸エチルを。' },
    { s: 'x-methylpropionate', n: 8, strict: 'K', hint: '試料 K から、どの検査にもかからないものを。' },
  ] },
  { name: '第11章 アミノ酸・染料・縮合重合・緩衝液', goals: [
    { s: 'aa', n: 10, hint: '納品所の西の牧場でタンパク質を採り、酵素で 2 段階に分解しろ。', zone: 'ranch' },
    { s: 'x-gly', n: 8, strict: 'E', hint: '試料 E は 6 種の α-アミノ酸。グリシンだけがもたないものは何か。' },
    { s: 'x-cys', n: 8, strict: 'E', hint: '試料 E からシステインを。' },
    { s: 'x-lys', n: 8, strict: 'E', hint: '試料 E から塩基性アミノ酸のリシンを。' },
    { s: 'x-tripeptide', n: 8, strict: 'F', hint: '試料 F からトリペプチドを。ペプチド結合の数で決まる呈色がある。' },
    { s: 'C6H5COOH', n: 5, hint: 'ナフサを別の触媒で処理するとトルエンが得られる。側鎖を酸化しろ。', zone: 'oil' },
    { s: 'PET', n: 5, hint: 'p-キシレンからテレフタル酸、エチレンからエチレングリコール。水がとれながらつながる。' },
    { s: 'nylon66', n: 5, hint: '2 種類の単量体は試薬棚にある。' },
    { s: 'C6H5N2C6H4OH', n: 5, hint: 'アニリンをジアゾ化し、ナトリウムフェノキシドとカップリングさせろ。温度に注意。原料は試薬棚にもある。' },
    { s: 'buffer47', n: 10, hint: '酢酸（Ka = 2.0×10⁻⁵ mol/L）と酢酸ナトリウムを混ぜて pH 4.7 にしろ。混ぜる比を係数で指定する。' },
    { s: 'buffer57', n: 11, hint: '同じ 2 つで pH 5.7 の緩衝液を。比を計算しろ。' },
  ] },
  { name: '第12章 油脂・ゴム・イオン交換・条件の計算', goals: [
    { s: 'hardfat', n: 5, hint: '北東のオリーブ畑の油脂に水素を付加させろ。', zone: 'grove' },
    { s: 'vulcanized', n: 10, hint: '南西のゴム園の生ゴムに、硫黄で橋をかけろ。', zone: 'rubber' },
    { s: 'SBR', n: 5, hint: 'スチレンと 1,3-ブタジエン（試薬棚）を一緒に重合させろ。' },
    { s: 'resinNa', n: 5, hint: '試薬棚の陽イオン交換樹脂に食塩水を通せ。出てくる液は何か。' },
    { s: 'AgCl', n: 5, hint: '硝酸銀（試薬棚）と塩化ナトリウム。設定のあとに、沈殿が始まる濃度を計算する。' },
    { s: 'cylN2', n: 5, hint: '窒素をボンベに詰めろ。設定のあとに、圧力を計算する。' },
    { s: 'I2', n: 5, hint: 'ヨウ化水素（試薬棚）を熱分解しろ。設定のあとに、速度の変化を計算する。' },
  ] },
  { name: '第13章 核酸と元素分析', goals: [
    { s: 'nucleotide', n: 5, hint: '試薬棚のリン酸・デオキシリボース・核酸塩基から、水をとってつなげろ。' },
    { s: 'DNA', n: 5, hint: 'ヌクレオチドどうしをつなげろ。' },
    { s: 'x-G', n: 8, strict: 'N', hint: '試料 N は 5 種の塩基。グアニンだけを取り出せ。環の数と水素結合の数。' },
    { s: 'x-U', n: 8, strict: 'N', hint: '試料 N から、RNA にしか含まれない塩基を。' },
    { s: 'x-A', n: 8, strict: 'N', hint: '試料 N からアデニンを。検査を 2 つ重ねる。' },
    { s: 'x-benzene', n: 8, strict: 'L', hint: '試料 L は分子式の違う 5 種。燃やして出る CO₂ と H₂O の量を比べろ。' },
    { s: 'x-acetic', n: 8, strict: 'L', hint: '試料 L から酢酸を。燃焼の結果だけでは決まらない。' },
    { s: 'x-hexane', n: 8, strict: 'L', hint: '試料 L からヘキサンを。' },
  ] },
];

// 総合演習：すべての試料から、検査で他と区別できる物質を自動で拾い、順番を混ぜて指令にする
{
  const pool: Goal[] = [];
  const sig = (id: string) => TESTS.map((t) => (isPositive(id, t.id) ? '1' : '0')).join('');
  for (const set of SETS) for (const m of set.members) {
    if (set.members.some((o) => o !== m && sig(o) === sig(m))) continue;
    pool.push({ s: m, n: 6, strict: set.id, hint: `${set.name}。${sub(m).name}だけを取り出せ。どの検査を使うかは自分で決めろ。` });
  }
  // 並びは毎回同じ（決まった種で混ぜる）
  let seed = 20261112;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  CHAPTERS.push({ name: '第14章 総合演習：仕分け', goals: pool });
}

// 総合演習より後ろに足す章（章の番号をずらさないため）
CHAPTERS.push(
  { name: '第15章 原子・結合・結晶', goals: [
    { s: 'x-ar', n: 6, strict: 'R', hint: '試料 R は 6 種の原子。貴ガスだけを取り出せ。' },
    { s: 'x-na', n: 6, strict: 'R', hint: '試料 R からナトリウムを。価電子が 1 個の原子は 2 つある。' },
    { s: 'x-cl', n: 6, strict: 'R', hint: '試料 R から塩素を。' },
    { s: 'x-h2o', n: 6, strict: 'Q', hint: '試料 Q は 5 種の分子。水だけを取り出せ。' },
    { s: 'x-co2', n: 6, strict: 'Q', hint: '試料 Q から二酸化炭素を。結合に極性があっても、分子が無極性のことがある。' },
    { s: 'x-ch4', n: 6, strict: 'Q', hint: '試料 Q からメタンを。' },
    { s: 'x-nacl-s', n: 6, strict: 'P', hint: '試料 P は 5 種の固体。イオン結晶を取り出せ。' },
    { s: 'x-diamond', n: 6, strict: 'P', hint: '試料 P からダイヤモンドを。' },
    { s: 'x-graphite', n: 6, strict: 'P', hint: '試料 P から黒鉛を。電気を通す固体は 2 つある。' },
  ] },
  { name: '第16章 溶液・コロイド・塩', goals: [
    { s: 'x-feoh3', n: 6, strict: 'Z', hint: '試料 Z から水酸化鉄(III)のコロイドを。帯電の符号を使え。' },
    { s: 'x-gelatin', n: 6, strict: 'Z', hint: '試料 Z から親水コロイドを。' },
    { s: 'x-brine', n: 6, strict: 'Z', hint: '試料 Z から真の溶液を。' },
    { s: 'x-s-nh4cl', n: 6, strict: 'T', hint: '試料 T は 6 種の塩。塩化アンモニウムを。酸性を示す塩は 2 つある。' },
    { s: 'x-s-nahco3', n: 6, strict: 'T', hint: '試料 T から炭酸水素ナトリウムを。酸性塩なのに水溶液は塩基性。' },
    { s: 'x-s-acona', n: 6, strict: 'T', hint: '試料 T から酢酸ナトリウムを。' },
  ] },
  { name: '第17章 非金属と金属の続き', goals: [
    { s: 'P4', n: 5, hint: '納品所の南東のリン鉱床。ケイ砂（西の浜）とコークスを一緒に強熱しろ。', zone: 'phosphate' },
    { s: 'H3PO4', n: 5, hint: 'リンを燃やし、水と反応させろ。試薬棚のリン酸は数えない。' },
    { s: 'Ca(H2PO4)2', n: 5, hint: 'リン鉱石を硫酸で処理して、水に溶ける肥料にしろ。' },
    { s: 'Si', n: 5, hint: 'ケイ砂をコークスで還元しろ。', zone: 'sand' },
    { s: 'H2SiO3', n: 5, hint: 'ケイ砂を水酸化ナトリウムと融解し、塩酸を加えろ。' },
    { s: 'HF', n: 5, hint: '東の蛍石鉱床。濃硫酸と加熱しろ。', zone: 'fluorite' },
    { s: 'CaCl(ClO)', n: 5, hint: '消石灰に塩素を吸収させろ。' },
    { s: 'Br2', n: 5, hint: '試薬棚の臭化カリウムから、塩素で臭素を追い出せ。' },
    { s: 'O3', n: 5, hint: '酸素だけから作れる同素体がある。' },
    { s: 'NaAl(OH)4', n: 5, hint: 'アルミニウムは酸にも強塩基にも溶ける。' },
    { s: 'FeCl3', n: 5, hint: '鉄を塩酸に溶かし、さらに塩素で酸化しろ。' },
    { s: 'MnSO4', n: 5, hint: '過マンガン酸カリウム（試薬棚）を、硫酸酸性で過酸化水素と反応させろ。生成物は 4 つある。' },
    { s: 'Na2S4O6', n: 5, hint: 'ヨウ素滴定。過酸化水素でヨウ化カリウムからヨウ素を遊離させ、チオ硫酸ナトリウム（試薬棚）と反応させろ。' },
    { s: 'x-m-cu', n: 6, strict: 'S', hint: '試料 S は 6 種の金属。銅だけを取り出せ。' },
    { s: 'x-m-au', n: 6, strict: 'S', hint: '試料 S から金を。' },
    { s: 'x-cl2', n: 6, strict: 'U', hint: '試料 U はハロゲンの単体 4 種。塩素を。' },
    { s: 'x-br2', n: 6, strict: 'U', hint: '試料 U から臭素を。' },
  ] },
  { name: '第18章 有機化合物の続き', goals: [
    { s: 'CH3Cl', n: 5, hint: 'メタンと塩素。アルカンの反応は付加ではない。' },
    { s: 'CH2BrCH2Br', n: 5, hint: 'エチレンに臭素（第17章で作った）を加えろ。' },
    { s: 'C6H5SO3Na', n: 5, hint: 'ベンゼンを濃硫酸でスルホン化し、中和しろ。' },
    { s: 'C6H5NHCOCH3', n: 5, hint: 'アニリンを無水酢酸でアセチル化しろ。' },
    { s: 'vinylon', n: 5, hint: 'アセチレンと酢酸から 4 段階。ビニルアルコールは単離できない。' },
    { s: 'PAN', n: 5, hint: 'アセチレンにシアン化水素（試薬棚）を付加させ、重合させろ。' },
    { s: 'x-aniline', n: 6, strict: 'Y', hint: '試料 Y はエーテルに溶けた芳香族 4 種。アニリンを水層へ抜き出せ。' },
    { s: 'x-benzoic', n: 6, strict: 'Y', hint: '試料 Y から安息香酸を。フェノールと一緒に動かない方法を選べ。' },
    { s: 'x-phenol', n: 6, strict: 'Y', hint: '試料 Y からフェノールを。' },
  ] },
  { name: '第19章 高分子化合物の続き', goals: [
    { s: 'nylon6', n: 5, hint: '試薬棚の ε-カプロラクタムの環を開いてつなげろ。' },
    { s: 'urearesin', n: 5, hint: '尿素（試薬棚）とホルムアルデヒド。' },
    { s: 'PMMA', n: 5, hint: '試薬棚のメタクリル酸メチルを重合させろ。' },
    { s: 'rayon', n: 5, hint: '納品所の北西の森林のセルロースを、溶かして繊維に戻せ。', zone: 'forest' },
    { s: 'nitrocellulose', n: 5, hint: 'セルロースの –OH を硝酸でエステルにしろ。' },
    { s: 'fructose', n: 5, hint: 'スクロース（試薬棚）を酵素で分解しろ。' },
    { s: 'x-suc', n: 6, strict: 'V', hint: '試料 V は糖 6 種。スクロースだけがどの検査にもかからない。' },
    { s: 'x-fru', n: 6, strict: 'V', hint: '試料 V からフルクトースを。' },
    { s: 'x-mal', n: 6, strict: 'V', hint: '試料 V からマルトースを。' },
    { s: 'x-pvc', n: 6, strict: 'W', hint: '試料 W は合成高分子 5 種。ポリ塩化ビニルを。' },
    { s: 'x-nylon', n: 6, strict: 'W', hint: '試料 W からナイロンを。' },
    { s: 'x-bakelite', n: 6, strict: 'W', hint: '試料 W から熱硬化性樹脂を。' },
  ] },
  { name: '第20章 コンビナート', goals: [
    { s: 'NaOH', also: ['Cl2', 'H2'], n: 10, hint: '食塩水の電気分解でできる 3 つを、1 つも捨てずに全部納めろ。出口ごとに配管を分けろ。', zone: 'bay' },
    { s: 'HNO3', also: ['H2SO4'], n: 8, hint: '硝酸と硫酸を並行して作れ。空気・水・硫黄から 2 本のラインを引く。' },
    { s: 'Na2CO3', also: ['NH4Cl'], n: 8, hint: 'アンモニアソーダ法。炭酸ナトリウムと、途中でできる塩化アンモニウムの両方を納めろ。' },
    { s: 'Fe', also: ['Al', 'Cu'], n: 6, hint: '鉄・アルミニウム・銅。高炉、溶融塩電解、電解精錬を同時に動かせ。' },
    { s: '(NH4)2SO4', also: ['Ca(H2PO4)2'], n: 6, hint: '窒素肥料とリン酸肥料。アンモニアは硫酸に吸収させ、リン鉱石は硫酸で処理する。硫酸を 2 か所へ分けろ。' },
    { s: 'C2H5OH', also: ['CH3COOH', 'CH3COOC2H5'], n: 6, hint: 'エチレンから、エタノール・酢酸・酢酸エチルを同時に。エタノールと酢酸は、エステルの原料にも分けて回せ。' },
    { s: 'C6H5OH', also: ['CH3COCH3'], n: 6, hint: 'クメン法は、フェノールとアセトンが同時にできる。両方納めろ。' },
    { s: 'PE', also: ['PVC', 'PS'], n: 5, hint: 'ポリエチレン・ポリ塩化ビニル・ポリスチレン。ナフサの分解から 3 本に分かれる。' },
    { s: 'C6H5NH2', also: ['C6H5OH', 'C6H5COOH'], n: 5, hint: 'アニリン・フェノール・安息香酸。ベンゼンとトルエンから、置換基の違う 3 つを作り分けろ。' },
    { s: 'NaClO', also: ['Na2SO3', '(NH4)2SO4'], n: 5, hint: '捨てていた気体を製品にする。塩素・二酸化硫黄・アンモニアを、それぞれ吸収させて納めろ。' },
  ] },
  { name: '第21章 量産', goals: [
    { s: 'N2', rate: 80, n: 20, hint: '採取機 1 台が出すのは毎分 60 個。蒸留塔は空気 5 個から窒素を 4 個作る。毎分 80 個には空気が毎分 100 個要る。採取機を増やして合流させろ。' },
    { s: 'H2', rate: 50, n: 20, hint: '水の電気分解。電解槽 1 台の能力と、それに見合う水の量を、設定画面の「能力」で確かめろ。海水 5 個から水は 4 個。', zone: 'bay' },
    { s: 'NH3', rate: 40, n: 20, hint: 'N₂ と H₂ は 1 : 3 で消える。毎分 40 個のアンモニアには、窒素が毎分 20 個、水素が毎分 60 個要る。足りない方が全体の速さを決める。' },
    { s: 'NaOH', rate: 24, n: 20, hint: '海水 5 個から食塩は 1 個しか取れない。食塩が速さを決める。採取機を何台並べれば足りるか、先に計算しろ。', zone: 'bay' },
    { s: 'H2SO4', rate: 24, n: 20, hint: '接触法。硫黄 1 個につき酸素が 1.5 個要る。酸素は空気 5 個から 1 個。空気のラインがいちばん太くなる。', zone: 'sulfur' },
    { s: 'Fe', rate: 24, n: 20, hint: '高炉。Fe₂O₃ 1 個に CO が 3 個。コークスと酸素から CO を作る反応器を、何台並べればよいか。', zone: 'iron' },
    { s: 'HNO3', rate: 15, n: 20, hint: 'オストワルト法は 3 段。最後の段で NO が戻ってくるので、捨てずに 2 段目へ回せば原料が減らせる。' },
    { s: 'C2H5OH', rate: 15, n: 20, hint: 'ナフサの分解でできるエチレンは 3 個に 1 個。原油の採取から逆算しろ。', zone: 'oil' },
  ] },
  { name: '第22章 金属イオンの系統分離', goals: [
    { s: 'AgCl', also: ['CuS'], n: 5, hint: '試薬棚の「混合溶液 ア」（Ag⁺・Cu²⁺）を、「沈殿槽」2 台で分けろ。試薬の順を誤ると混ざる。' },
    { s: 'CuS', also: ['Fe(OH)3', 'ZnS'], n: 5, hint: '混合溶液 イ（Cu²⁺・Fe³⁺・Zn²⁺）。硫化水素は 2 回使う。酸性と塩基性で、沈殿するイオンが違う。' },
    { s: 'AgCl', also: ['PbCrO4'], n: 5, hint: '混合溶液 ウ（Ag⁺・Pb²⁺）。希塩酸では両方が沈殿する。まじった沈殿を、次の沈殿槽で溶かし分けろ。' },
    { s: 'Fe(OH)3', also: ['CaCO3'], n: 5, hint: '混合溶液 エ（Fe³⁺・Al³⁺・Ca²⁺）。Fe(OH)₃ と Al(OH)₃ がまじる。両性の方だけを溶かす試薬は何か。' },
    { s: 'AgCl', also: ['CuS', 'Fe(OH)3', 'ZnS', 'CaCO3', 'ions:Na'], n: 5, hint: '混合溶液 オ。6 種を第 1 属から順に取り出せ。最後に残るろ液（Na⁺、炎色反応は黄色）も納めろ。' },
    { s: 'AgCl', also: ['PbCrO4', 'CuS', 'Fe(OH)3', 'ZnS', 'CaCO3'], n: 4, hint: '混合溶液 カ。8 種すべて。まじりの沈殿が 2 回出る。溶かし分けの槽を枝に付けろ。' },
  ] },
  { name: '第23章 芳香族化合物の抽出分離', goals: [
    { s: 'C6H5NH2', also: ['C6H5NO2'], n: 5, hint: '試薬棚の「エーテル溶液 ア」（アニリン・ニトロベンゼン）を「分液ろうと」で分けろ。水層の塩は、反応器で元に戻す。' },
    { s: 'C6H5COOH', also: ['C6H5OH'], n: 5, hint: 'エーテル溶液 イ（安息香酸・フェノール）。どちらも酸だが、強さが違う。片方だけが反応する水溶液を選べ。' },
    { s: 'C6H5NH2', also: ['C6H5COOH', 'C6H5OH', 'C6H5NO2'], n: 4, hint: 'エーテル溶液 ウ。4 種すべてを取り出せ。水層へ移す順は 1 通りではない。' },
  ] },
  { name: '第24章 アミノ酸の電気泳動', goals: [
    { s: 'Glu', also: ['Lys'], n: 5, hint: '試薬棚の「アミノ酸の混合水溶液 ア」（グルタミン酸・リシン）を「電気泳動槽」で分けろ。等電点は 3.2 と 9.7。' },
    { s: 'Ala', also: ['Lys'], n: 5, hint: '混合水溶液 イ（アラニン 6.0・リシン 9.7）。片方だけが動く pH も、逆向きに動く pH もある。' },
    { s: 'Glu', also: ['Ala', 'Lys'], n: 5, hint: '混合水溶液 ウ。3 種を 1 台で分けられる pH がある。' },
  ] },
);

export const GOALS: Goal[] = CHAPTERS.flatMap((c) => c.goals);
export function chapterOf(goalIndex: number): { name: string; index: number; of: number } | null {
  let i = goalIndex;
  for (const c of CHAPTERS) { if (i < c.goals.length) return { name: c.name, index: i, of: c.goals.length }; i -= c.goals.length; }
  return null;
}
/** 何番目の指令で始まる章か */
export const chapterStart = (ch: number) => CHAPTERS.slice(0, ch).reduce((a, c) => a + c.goals.length, 0);
export const TOTAL_GOALS = GOALS.length;
