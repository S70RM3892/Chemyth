import type { Zone } from './map';

export interface Goal {
  s: string;
  n: number;
  hint: string;
  /** 画面の縁に道しるべを出す資源地 */
  zone?: Zone;
}

export interface Chapter { name: string; goals: Goal[] }

export const CHAPTERS: Chapter[] = [
  { name: '第1章 空気と水', goals: [
    { s: 'N2', n: 10, hint: '陸地ならどこでも空気が採れる。採取機を置いて、蒸留塔で分けろ。' },
    { s: 'H2', n: 10, hint: '西の海で海水を採り、水を取り出して電気で分解しろ。要らない物質は廃棄口へ。', zone: 'sea' },
    { s: 'NH3', n: 20, hint: '窒素と水素を反応器に入れろ。' },
  ] },
  { name: '第2章 酸とアルカリの工業', goals: [
    { s: 'HNO3', n: 10, hint: 'アンモニアを酸化して硝酸にしろ。3段階ある。捨てていた酸素と水に使い道ができた。' },
    { s: 'H2SO4', n: 10, hint: '南東の硫黄鉱床から始めろ。これも3段階。', zone: 'sulfur' },
    { s: 'NaOH', n: 10, hint: '海水から採った塩と水を、一緒に電気分解しろ。' , zone: 'sea' },
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
];

export const GOALS: Goal[] = CHAPTERS.flatMap((c) => c.goals);
export function chapterOf(goalIndex: number): { name: string; index: number; of: number } | null {
  let i = goalIndex;
  for (const c of CHAPTERS) { if (i < c.goals.length) return { name: c.name, index: i, of: c.goals.length }; i -= c.goals.length; }
  return null;
}
/** 何番目の指令で始まる章か */
export const chapterStart = (ch: number) => CHAPTERS.slice(0, ch).reduce((a, c) => a + c.goals.length, 0);
