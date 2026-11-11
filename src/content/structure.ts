import { pretty } from '../chem/formula';
import {
  byKey, cisTransCount, dehydCount, isomers, methylCount, monoSubCount, ringPos, ringSubCount, skeleton, specOf, specText, stereoCount, triPattern, twinPos,
  type IsoClass, type Isomer, type Spec,
} from '../chem/isomers';

/**
 * 有機の構造決定の問題をつくる。
 *  - makeCount：分子式と条件を示し、当てはまる異性体の数を答えさせる
 *  - makeIdentify：実験結果を並べ、ただ 1 つに決まる化合物を答えさせる
 * 文章はすべてここで組み立てる。同じ乱数列からは同じ問題ができる。
 *
 * 数え上げの範囲は isomers.ts の規則による（単官能の鎖式化合物、アミノ酸、三置換までのベンゼン）。
 * 現実にはその外にも異性体がある分子式では、問題文で範囲を言い切る
 * （「アルケン」「カルボニル化合物」「アミド」「–NH₂ と –COOH を 1 個ずつもつ」など）。
 */

/** [0, 1) の乱数 */
export type Rng = () => number;

export interface CountProblem {
  kind: 'count';
  spec: Spec;
  text: string;
  answer: number;
  /** 条件を満たす構造異性体 */
  list: Isomer[];
  how: string;
  /** 条件を満たすかどうか（検算用） */
  check: (i: Isomer) => boolean;
  /** 立体異性体の数え方。none：区別しない、ct：シス-トランスだけ区別、all：鏡像異性体も区別 */
  stereo: 'none' | 'ct' | 'all';
}

export interface IdentifyProblem {
  kind: 'identify';
  spec: Spec;
  text: string;
  clues: string[];
  /** 選択肢（同じ分子式の異性体。最大 8 個） */
  options: Isomer[];
  /** 正解の key */
  answer: string;
  how: string;
  /** clues と 1 対 1 に対応する判定（検算用） */
  checks: ((i: Isomer) => boolean)[];
}

/** 出題する分子式。level 1：C3〜C4、2：C5 とエステル、3：芳香族と多段階 */
export const SPECS: { spec: Spec; level: 1 | 2 | 3; note: string }[] = [
  { spec: { c: 4, h: 10 }, level: 1, note: 'アルカン 2' },
  { spec: { c: 3, h: 8, o: 1 }, level: 1, note: 'アルコール 2、エーテル 1' },
  { spec: { c: 4, h: 10, o: 1 }, level: 1, note: 'アルコール 4、エーテル 3' },
  { spec: { c: 4, h: 8 }, level: 1, note: 'アルケン 3。シス-トランス異性体を数えると 4' },
  { spec: { c: 3, h: 6, o: 1 }, level: 1, note: 'アルデヒド 1、ケトン 1' },
  { spec: { c: 4, h: 8, o: 1 }, level: 1, note: 'アルデヒド 2、ケトン 1' },
  { spec: { c: 3, h: 6, o: 2 }, level: 1, note: 'カルボン酸 1、エステル 2' },
  { spec: { c: 3, h: 7, cl: 1 }, level: 1, note: '2 種類' },
  { spec: { c: 4, h: 9, cl: 1 }, level: 1, note: '4 種類。不斉炭素原子をもつものが 1 つ' },
  { spec: { c: 3, h: 6, cl: 2 }, level: 1, note: '4 種類' },
  { spec: { c: 2, h: 7, n: 1 }, level: 1, note: 'アミン 2' },

  { spec: { c: 5, h: 12 }, level: 2, note: 'アルカン 3' },
  { spec: { c: 6, h: 14 }, level: 2, note: 'アルカン 5' },
  { spec: { c: 5, h: 12, o: 1 }, level: 2, note: 'アルコール 8、エーテル 6' },
  { spec: { c: 5, h: 10 }, level: 2, note: 'アルケン 5。シス-トランス異性体を数えると 6' },
  { spec: { c: 5, h: 10, o: 1 }, level: 2, note: 'アルデヒド 4、ケトン 3' },
  { spec: { c: 4, h: 8, o: 2 }, level: 2, note: 'カルボン酸 2、エステル 4' },
  { spec: { c: 5, h: 10, o: 2 }, level: 2, note: 'カルボン酸 4、エステル 9' },
  { spec: { c: 5, h: 11, cl: 1 }, level: 2, note: '8 種類' },
  { spec: { c: 4, h: 8, cl: 2 }, level: 2, note: '9 種類' },
  { spec: { c: 3, h: 9, n: 1 }, level: 2, note: 'アミン 4（第一級 2、第二級 1、第三級 1）' },
  { spec: { c: 4, h: 11, n: 1 }, level: 2, note: 'アミン 8（第一級 4、第二級 3、第三級 1）' },
  { spec: { c: 3, h: 7, n: 1, o: 1 }, level: 2, note: 'アミド 4' },
  { spec: { c: 3, h: 7, n: 1, o: 2 }, level: 2, note: 'アラニン、β-アラニン、N-メチルグリシン' },

  { spec: { c: 7, h: 16 }, level: 3, note: 'アルカン 9' },
  { spec: { c: 6, h: 12 }, level: 3, note: 'アルケン 13' },
  { spec: { c: 7, h: 8, o: 1 }, level: 3, note: 'ベンジルアルコール、アニソール、クレゾール 3' },
  { spec: { c: 8, h: 10 }, level: 3, note: 'エチルベンゼンとキシレン 3' },
  { spec: { c: 8, h: 10, o: 1 }, level: 3, note: 'フェノール類 9（うちジメチルフェノール 6）、アルコール 5、エーテル 5' },
  { spec: { c: 8, h: 8, o: 1 }, level: 3, note: '芳香族のアルデヒド 4、ケトン 1' },
  { spec: { c: 9, h: 12 }, level: 3, note: '一置換体 2、二置換体 3、三置換体 3' },
  { spec: { c: 8, h: 8, o: 2 }, level: 3, note: '芳香族のカルボン酸 4、エステル 6' },
  { spec: { c: 9, h: 10, o: 2 }, level: 3, note: '芳香族のカルボン酸 14、エステル 24' },
  { spec: { c: 6, h: 3, cl: 3 }, level: 3, note: 'トリクロロベンゼン 3' },
  { spec: { c: 7, h: 6, cl: 2 }, level: 3, note: 'ジクロロトルエン 6 を含む 10 種類' },
  { spec: { c: 4, h: 9, n: 1, o: 2 }, level: 3, note: '–NH₂ と –COOH をもつもの 5（α-アミノ酸 2）' },
  { spec: { c: 7, h: 9, n: 1 }, level: 3, note: 'ベンジルアミン、N-メチルアニリン、トルイジン 3' },
  { spec: { c: 8, h: 11, n: 1 }, level: 3, note: '芳香族アミン 20（ジメチルアニリン 6 を含む）' },
  { spec: { c: 8, h: 9, n: 1, o: 1 }, level: 3, note: '芳香族アミド 11（アセトアニリドなど）' },
];

// ---------------------------------------------------------------- 共通

const F = (spec: Spec): string => pretty(specText(spec));
const show = (i: Isomer): string => pretty(i.formula) + (i.name ? `（${i.name}）` : '');
const isClass = (...cs: IsoClass[]) => (i: Isomer): boolean => cs.includes(i.cls);

interface Shape { rings: number; dbl: number; o: number; n: number; hal: number; extra: number }

/** 分子式から決まる形。extra は環以外の原子（H を除く）の数 */
function shapeOf(spec: Spec): Shape {
  const o = spec.o || 0, n = spec.n || 0, hal = (spec.cl || 0) + (spec.br || 0);
  const dou = (2 * spec.c + 2 + n - spec.h - hal) / 2;
  const rings = Math.floor(dou / 4);
  return { rings, dbl: dou - 4 * rings, o, n, hal, extra: spec.c - 6 * rings + o + n + hal };
}

const pick = <T>(rng: Rng, list: T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

function shuffle<T>(rng: Rng, list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const acidOf = (i: Isomer): Isomer | undefined => (i.props.hydrolysis ? byKey(i.props.hydrolysis.acid) : undefined);
/** アミドの加水分解で得られるアミン（アンモニアを含む） */
const amineOf = (i: Isomer): Isomer | undefined => (i.props.hydrolysis?.amine ? byKey(i.props.hydrolysis.amine) : undefined);
/** –NH2 と –COOH を 1 個ずつもつ */
const primaryAA = (i: Isomer): boolean => i.cls === 'aminoacid' && i.props.grade === 1;
/** N に H が残っているアミン（無水酢酸でアミドになる） */
const hasNH = (i: Isomer): boolean => i.cls === 'amine' && i.props.grade !== undefined && i.props.grade < 3;
const ringKind = (i: Isomer): string => (i.mol.atoms.includes('Tr') ? 'Tr' : i.mol.atoms.includes('Ar') ? 'Ar' : i.mol.atoms.includes('Ph') ? 'Ph' : '');
const alcOf = (i: Isomer): Isomer | undefined => (i.props.hydrolysis ? byKey(i.props.hydrolysis.alcohol) : undefined);

/** 第一級アルコールを十分に酸化して得られるカルボン酸の key */
function fullOxid(alc: Isomer | undefined): string | undefined {
  if (!alc || alc.props.oxid !== 'aldehyde' || !alc.props.oxidTo) return undefined;
  return byKey(alc.props.oxidTo)?.props.oxidTo;
}

/** 酸化剤で酸化されるか（第一級・第二級アルコール、アルデヒド、C=C、フェノール類） */
const oxidizable = (i: Isomer): boolean =>
  i.props.oxid === 'aldehyde' || i.props.oxid === 'ketone' || i.props.silver || i.props.br2 || i.props.fecl3 || (i.cls === 'alcohol' && !i.props.oxid);

const ozClasses = (i: Isomer): string => (i.props.ozonolysis || []).map((k) => byKey(k)?.cls || '?').sort().join('+');

const BENZOIC = byKey('C(=O)(O)(Ph)')!.key;
const PHTHALIC = byKey('Aro(C(=O)(O))(C(=O)(O))')!.key;
const DIACIDS = [PHTHALIC, byKey('Arm(C(=O)(O))(C(=O)(O))')!.key, byKey('Arp(C(=O)(O))(C(=O)(O))')!.key];
const FORMALDEHYDE = byKey('C(=O)')!.key;
const FORMIC = byKey('C(=O)(O)')!.key;
const AMMONIA = byKey('N')!.key;
const ANILINE = byKey('N(Ph)')!.key;

// ---------------------------------------------------------------- 数える問題

interface Universe { label: string; list: Isomer[]; pred: (i: Isomer) => boolean }

/** 問題文で言い切る母集団。この範囲なら、数え上げた異性体が現実の異性体と一致する */
function universesOf(spec: Spec, all: Isomer[]): Universe[] {
  const s = shapeOf(spec);
  const out: Universe[] = [];
  const add = (label: string, pred: (i: Isomer) => boolean): void => {
    const list = all.filter(pred);
    if (list.length) out.push({ label, list, pred });
  };
  const any = (): boolean => true;
  if (s.n) {
    if (s.n !== 1 || s.hal) return out;
    if (s.o === 0 && s.dbl === 0) add(s.rings ? 'ベンゼン環をもつアミン' : 'アミン', any);
    else if (s.o === 1 && s.dbl === 1) add(s.rings ? 'ベンゼン環をもつアミド' : 'アミド', isClass('amide'));
    else if (s.o === 2 && s.dbl === 1 && !s.rings) add('、アミノ基 –NH₂ とカルボキシ基 –COOH を 1 個ずつもつ化合物', primaryAA);
    return out;
  }
  if (s.rings === 0) {
    if (s.o === 0 && s.dbl === 0) add(s.hal ? '化合物' : 'アルカン', any);
    else if (s.o === 0 && s.dbl === 1) add(s.hal ? '鎖式の化合物' : 'アルケン', any);
    else if (s.o === 1 && s.dbl === 0) {
      add('化合物', any);
      add('アルコール', isClass('alcohol'));
      add('エーテル', isClass('ether'));
    } else if (s.o === 1 && s.dbl === 1) {
      add('カルボニル化合物（アルデヒドとケトン）', isClass('aldehyde', 'ketone'));
      add('アルデヒド', isClass('aldehyde'));
      add('ケトン', isClass('ketone'));
    } else if (s.o === 2 && s.dbl === 1) {
      add('エステル', isClass('ester'));
      add('カルボン酸', isClass('acid'));
    }
  } else if (s.rings === 1) {
    if (s.o === 0 && s.dbl === 0) add(s.hal ? 'ベンゼン環をもつ化合物' : '芳香族炭化水素', any);
    else if (s.hal) return out;
    else if (s.o === 1 && s.dbl === 0) add('ベンゼン環をもつ化合物', any);
    else if (s.o === 1 && s.dbl === 1) add('ベンゼン環をもつカルボニル化合物（アルデヒドとケトン）', isClass('aldehyde', 'ketone'));
    else if (s.o === 2 && s.dbl === 1) {
      add('ベンゼン環をもつエステル', isClass('ester'));
      add('ベンゼン環をもつカルボン酸', isClass('acid'));
    }
  }
  return out;
}

interface Cond {
  id: string;
  /** 同じ group の条件は組み合わせない */
  group: string;
  /** 「〜し、」と続ける形 */
  te: string;
  /** 「〜するもの」と続ける形 */
  rentai: string;
  pred: (i: Isomer) => boolean;
  why: string;
  /** 母集団がこれを満たすときだけ使う */
  ok?: (u: Isomer[]) => boolean;
}

const C = (id: string, group: string, te: string, rentai: string, pred: (i: Isomer) => boolean, why: string, ok?: (u: Isomer[]) => boolean): Cond =>
  ({ id, group, te, rentai, pred, why, ok });

const allAlcohol = (u: Isomer[]): boolean => u.every((i) => !!i.props.dehydration);
const allEster = (u: Isomer[]): boolean => u.every((i) => i.cls === 'ester' && !!i.props.hydrolysis);
const allAlkene = (u: Isomer[]): boolean => u.every((i) => !!i.props.ozonolysis && !!i.props.hydration);
const noEster = (u: Isomer[]): boolean => u.every((i) => i.cls !== 'ester');
const allChain = (u: Isomer[]): boolean => u.every((i) => skeleton(i) !== undefined);
const oneRing = (u: Isomer[]): boolean => u.every((i) => ringSubCount(i) !== undefined);
const allAlkane = (u: Isomer[]): boolean => u.every((i) => i.cls === 'alkane');
const allAmide = (u: Isomer[]): boolean => u.every((i) => i.cls === 'amide' && !!i.props.hydrolysis?.amine);

const CONDS: Cond[] = [
  C('na', 'na', '金属ナトリウムと反応して水素を発生し', '金属ナトリウムと反応して水素を発生する', (i) => i.props.na, 'ナトリウムと反応するのは –OH をもつ化合物。'),
  C('na-', 'na', '金属ナトリウムと反応せず', '金属ナトリウムと反応しない', (i) => !i.props.na, 'ナトリウムと反応しないのは –OH をもたない化合物。'),
  C('fecl3', 'fecl3', '塩化鉄(III)水溶液で呈色し', '塩化鉄(III)水溶液で呈色する', (i) => i.props.fecl3, '呈色するのは、ベンゼン環に直接 –OH が結合したフェノール類。'),
  C('fecl3-', 'fecl3', '塩化鉄(III)水溶液で呈色せず', '塩化鉄(III)水溶液で呈色しない', (i) => !i.props.fecl3, 'フェノール類でなければ呈色しない。'),
  C('nahco3', 'acid', '炭酸水素ナトリウム水溶液と反応して二酸化炭素を発生し', '炭酸水素ナトリウム水溶液と反応して二酸化炭素を発生する', (i) => i.props.nahco3, '炭酸より強い酸であるカルボン酸。'),
  C('silver', 'silver', '銀鏡反応を示し', '銀鏡反応を示す', (i) => i.props.silver, '銀鏡反応を示すのはホルミル基をもつ化合物。ギ酸とそのエステルも含む。'),
  C('silver-', 'silver', '銀鏡反応を示さず', '銀鏡反応を示さない', (i) => !i.props.silver, 'ホルミル基をもたなければ銀鏡反応を示さない。'),
  C('iodoform', 'iodoform', 'ヨードホルム反応を示し', 'ヨードホルム反応を示す', (i) => i.props.iodoform, 'ヨードホルム反応を示すのは CH₃CH(OH)– か CH₃CO– の構造をもつ化合物。', noEster),
  C('ox-ald', 'oxid', '酸化するとアルデヒドになり', '酸化するとアルデヒドになる', (i) => i.props.oxid === 'aldehyde', '酸化してアルデヒドになるのは第一級アルコール。'),
  C('ox-ket', 'oxid', '酸化するとケトンになり', '酸化するとケトンになる', (i) => i.props.oxid === 'ketone', '酸化してケトンになるのは第二級アルコール。'),
  C('ox-none', 'oxid', '第三級アルコールであり', '第三級アルコールである', (i) => i.props.oxid === 'none', '–OH のついた炭素に炭素が 3 個結合している。酸化されにくい。'),
  C('chiral', 'chiral', '不斉炭素原子をもち', '不斉炭素原子をもつ', (i) => i.chiral > 0, '4 種類の異なる原子・原子団が結合した炭素を探す。'),
  C('dehyd0', 'dehyd', '分子内脱水でアルケンを生じず', '分子内脱水でアルケンを生じない', (i) => dehydCount(i) === 0, '–OH のついた炭素の隣に、H をもつ炭素がない。', allAlcohol),
  C('dehyd1', 'dehyd', '分子内脱水で生じるアルケンが 1 種類だけであり', '分子内脱水で生じるアルケンが 1 種類だけである', (i) => dehydCount(i) === 1, '隣の炭素から H がとれる向きを数える。', allAlcohol),
  C('dehyd2', 'dehyd', '分子内脱水で、シス-トランス異性体も含めて 2 種類のアルケンを生じ', '分子内脱水で、シス-トランス異性体も含めて 2 種類のアルケンを生じる', (i) => dehydCount(i) === 2, '隣の炭素から H がとれる向きと、生じる C=C のシス-トランスを数える。', allAlcohol),
  C('dehyd3', 'dehyd', '分子内脱水で、シス-トランス異性体も含めて 3 種類のアルケンを生じ', '分子内脱水で、シス-トランス異性体も含めて 3 種類のアルケンを生じる', (i) => dehydCount(i) === 3, '隣の炭素から H がとれる向きと、生じる C=C のシス-トランスを数える。', allAlcohol),
  C('cistrans', 'cistrans', 'シス-トランス異性体が存在し', 'シス-トランス異性体が存在する', (i) => i.cisTrans, 'C=C の両方の炭素に、それぞれ異なる 2 つの原子・原子団が結合している。'),
  C('oz-ket', 'oz', 'オゾン分解するとケトンを生じ', 'オゾン分解するとケトンを生じる', (i) => (i.props.ozonolysis || []).some((k) => byKey(k)?.cls === 'ketone'), 'C=C の炭素に H がなければ、切れたあとケトンになる。', allAlkene),
  C('oz-hcho', 'oz', 'オゾン分解するとホルムアルデヒドを生じ', 'オゾン分解するとホルムアルデヒドを生じる', (i) => (i.props.ozonolysis || []).includes(FORMALDEHYDE), '末端の CH₂= からホルムアルデヒドができる。', allAlkene),
  C('oz-one', 'oz', 'オゾン分解すると 1 種類の化合物だけを生じ', 'オゾン分解すると 1 種類の化合物だけを生じる', (i) => (i.props.ozonolysis || []).length === 1, 'C=C の両側が同じ形のアルケン。', allAlkene),
  C('hy-one', 'hy', '水を付加させると 1 種類のアルコールだけを生じ', '水を付加させると 1 種類のアルコールだけを生じる', (i) => (i.props.hydration || []).length === 1, 'C=C の両側が同じ形なら、–OH がどちらについても同じ。', allAlkene),
  C('hy-tert', 'hy', '水を付加させると第三級アルコールを生じうるものであり', '水を付加させると第三級アルコールを生じうる', (i) => (i.props.hydration || []).some((k) => byKey(k)?.props.grade === 3), 'C=C の炭素の一方に H がない。', allAlkene),
  C('es-iodo', 'es-alc', '加水分解して得られるアルコールがヨードホルム反応を示し', '加水分解して得られるアルコールがヨードホルム反応を示す', (i) => !!alcOf(i)?.props.iodoform, 'アルコール部分が CH₃CH(OH)– の構造をもつ。', allEster),
  C('es-sec', 'es-alc', '加水分解すると第二級アルコールを生じ', '加水分解すると第二級アルコールを生じる', (i) => alcOf(i)?.props.grade === 2, 'エステル結合の –O– が、炭素 2 個と結合した炭素についている。', allEster),
  C('es-same', 'es-alc', '加水分解して得られるアルコールを十分に酸化するともう一方の生成物と同じカルボン酸になり', '加水分解して得られるアルコールを十分に酸化するともう一方の生成物と同じカルボン酸になる', (i) => !!i.props.hydrolysis && fullOxid(alcOf(i)) === i.props.hydrolysis.acid, '酸の部分とアルコールの部分の炭素骨格が同じ。', allEster),
  C('es-phenol', 'es-alc', '加水分解するとフェノール類を生じ', '加水分解するとフェノール類を生じる', (i) => !!alcOf(i)?.props.fecl3, 'エステル結合の –O– がベンゼン環に直接結合している。', allEster),
  C('side-bz', 'side', '過マンガン酸カリウムで酸化すると安息香酸になり', '過マンガン酸カリウムで酸化すると安息香酸になる', (i) => i.props.sideOxid === BENZOIC, '側鎖が 1 本なら、長さによらず安息香酸になる。'),
  C('side-di', 'side', '過マンガン酸カリウムで酸化すると 2 価のカルボン酸になり', '過マンガン酸カリウムで酸化すると 2 価のカルボン酸になる', (i) => !!i.props.sideOxid && DIACIDS.includes(i.props.sideOxid), '側鎖が 2 本あれば、それぞれが –COOH になる。'),
  ...[1, 2, 3, 4].map((n) => C('ring' + n, 'ring', `ベンゼン環の水素原子 1 個を塩素原子で置換してできる構造異性体が ${n} 種類であり`, `ベンゼン環の水素原子 1 個を塩素原子で置換してできる構造異性体が ${n} 種類である`,
    (i) => ringSubCount(i) === n, '環上の等価でない水素原子を数える。一置換体は 3 種類、二置換体は置換基が同じなら o 2・m 3・p 1、異なれば o 4・m 4・p 2。三置換体は環の対称性から数える。', oneRing)),
  C('mono', 'nsub', 'ベンゼンの一置換体であり', 'ベンゼンの一置換体である', (i) => ringKind(i) === 'Ph', '環に結合した置換基が 1 個。', oneRing),
  C('di', 'nsub', 'ベンゼンの二置換体であり', 'ベンゼンの二置換体である', (i) => ringKind(i) === 'Ar', '環に結合した置換基が 2 個。オルト・メタ・パラの 3 通りを考える。', oneRing),
  C('tri', 'nsub', 'ベンゼンの三置換体であり', 'ベンゼンの三置換体である', (i) => ringKind(i) === 'Tr', '環に結合した置換基が 3 個。位置は 1,2,3、1,2,4、1,3,5 の 3 通りで、置換基の並べ方も数える。', oneRing),
  ...[1, 2, 3].map((n) => C('am' + n, 'amine', `第${'一二三'[n - 1]}級アミンであり`, `第${'一二三'[n - 1]}級アミンである`, (i) => i.cls === 'amine' && i.props.grade === n,
    `窒素原子に炭素が ${n} 個結合している。`)),
  C('bleach', 'bleach', 'さらし粉水溶液で呈色し', 'さらし粉水溶液で呈色する', (i) => i.props.bleach, '呈色するのは、ベンゼン環に直接 –NH₂ が結合した化合物。'),
  C('amd-nh3', 'amd', '加水分解するとアンモニアを生じ', '加水分解するとアンモニアを生じる', (i) => i.props.hydrolysis?.amine === AMMONIA, '–CONH₂ の形のアミド。', allAmide),
  C('amd-prim', 'amd', '加水分解すると第一級アミンを生じ', '加水分解すると第一級アミンを生じる', (i) => amineOf(i)?.props.grade === 1, 'アミド結合の N に、C=O の炭素のほかに炭素が 1 個結合している。', allAmide),
  C('amd-aniline', 'amd', '加水分解するとアニリンを生じ', '加水分解するとアニリンを生じる', (i) => i.props.hydrolysis?.amine === ANILINE, '–NH– がベンゼン環に直接結合し、環にほかの置換基がない。', allAmide),
  C('amd-formic', 'amd-acid', '加水分解するとギ酸を生じ', '加水分解するとギ酸を生じる', (i) => allAmide([i]) && i.props.hydrolysis?.acid === FORMIC, 'HCO–N< の形のアミド。', allAmide),
  C('alpha', 'alpha', 'α-アミノ酸であり', 'α-アミノ酸である', (i) => i.props.alpha === true, '–NH₂ と –COOH が同じ炭素に結合している。'),
  C('branched', 'chain', '炭素鎖に枝分かれがあり', '炭素鎖に枝分かれがある', (i) => skeleton(i) === 'branched', '炭素 3 個以上と結合した炭素がある。', allChain),
  C('linear', 'chain', '炭素鎖に枝分かれがなく', '炭素鎖に枝分かれがない', (i) => skeleton(i) === 'linear', 'どの炭素も、結合している炭素は 2 個以下。', allChain),
  ...[1, 2, 3, 4].map((n) => C('me' + n, 'methyl', `メチル基を ${n} 個もち`, `メチル基を ${n} 個もつ`, (i) => methylCount(i) === n, '–CH₃ を数える。', allChain)),
  ...[1, 2, 3, 4].map((n) => C('sub' + n, 'sub', `水素原子 1 個を塩素原子で置換してできる構造異性体が ${n} 種類であり`, `水素原子 1 個を塩素原子で置換してできる構造異性体が ${n} 種類である`,
    (i) => monoSubCount(i) === n, '等価でない水素原子を数える。', allAlkane)),
];

interface CountCand { u: Universe; conds: Cond[]; list: Isomer[] }

const COUNT_CACHE = new Map<string, CountCand[]>();

/** その分子式でつくれる（母集団 × 条件）の組。答えが 0 のものと、条件が何も絞らないものは除く */
function countCands(spec: Spec): CountCand[] {
  const id = specText(spec);
  const hit = COUNT_CACHE.get(id);
  if (hit) return hit;
  const all = isomers(spec);
  const out: CountCand[] = [];
  for (const u of universesOf(spec, all)) {
    out.push({ u, conds: [], list: u.list });
    const singles: { c: Cond; list: Isomer[] }[] = [];
    for (const c of CONDS) {
      if (c.ok && !c.ok(u.list)) continue;
      const list = u.list.filter(c.pred);
      if (list.length >= 1 && list.length < u.list.length) singles.push({ c, list });
    }
    for (const s of singles) out.push({ u, conds: [s.c], list: s.list });
    for (const a of singles) for (const b of singles) {
      if (a.c.group === b.c.group || a.c === b.c) continue;
      const list = a.list.filter(b.c.pred);
      // 2 つ目の条件がさらに絞ること。逆順の重複は片方だけ残す
      if (list.length < 1 || list.length >= a.list.length || list.length > b.list.length) continue;
      if (list.length < b.list.length && CONDS.indexOf(a.c) > CONDS.indexOf(b.c)) continue;
      out.push({ u, conds: [a.c, b.c], list });
    }
  }
  COUNT_CACHE.set(id, out);
  return out;
}

const specsOf = (level?: 1 | 2 | 3): Spec[] => SPECS.filter((s) => !level || s.level === level).map((s) => s.spec);

/** 立体異性体の数え方ごとの答え */
function stereoAnswer(list: Isomer[], mode: 'none' | 'ct' | 'all'): number | undefined {
  if (mode === 'none') return list.length;
  let n = 0;
  for (const i of list) {
    if (mode === 'ct') n += cisTransCount(i) > 1 ? NaN : i.cisTrans ? 2 : 1;
    else n += stereoCount(i) ?? NaN;
  }
  return Number.isNaN(n) ? undefined : n;
}

export function makeCount(rng: Rng, level?: 1 | 2 | 3): CountProblem {
  const pool = specsOf(level).filter((s) => countCands(s).length > 0);
  const spec = pick(rng, pool);
  const all = countCands(spec);
  // 答えは 1〜9 を優先する
  const small = all.filter((c) => c.list.length <= 9);
  const cands = small.length ? small : all;
  const r = rng();
  const want = r < 0.15 ? 0 : r < 0.6 ? 1 : 2;
  let group = cands.filter((c) => c.conds.length === want);
  if (!group.length) group = cands;
  const cand = pick(rng, group);
  const { u, conds, list } = cand;

  // 立体異性体の数え方
  const modes: ('ct' | 'all')[] = [];
  const stereoFree = !conds.some((c) => c.id === 'cistrans' || c.id === 'chiral');
  const ct = stereoAnswer(list, 'ct'), full = stereoAnswer(list, 'all');
  if (stereoFree && ct !== undefined && ct !== list.length && ct <= 12) modes.push('ct');
  if (stereoFree && full !== undefined && full !== list.length && full !== ct && full <= 12) modes.push('all');
  const rs = rng();
  const stereo: 'none' | 'ct' | 'all' = modes.length && rs < 0.35 ? modes[Math.min(modes.length - 1, Math.floor((rs / 0.35) * modes.length))] : 'none';
  const answer = stereoAnswer(list, stereo)!;

  const s = shapeOf(spec);
  let text = `分子式 ${F(spec)} で表される${u.label}`;
  if (conds.length === 0) text += 'は何種類あるか。';
  else text += `のうち、${conds.map((c, k) => (k < conds.length - 1 ? c.te : c.rentai)).join('、')}ものは何種類あるか。`;
  if (s.rings === 1 && s.extra >= 4) text += 'ただし、ベンゼン環に直接結合した置換基が 4 個以上のものは考えない。';
  text += stereo === 'none' ? '立体異性体は区別しない。'
    : stereo === 'ct' ? 'シス-トランス異性体は区別して数えろ（鏡像異性体は区別しない）。'
      : list.some((i) => i.props.br2) ? '立体異性体（シス-トランス異性体と鏡像異性体）も区別して数えろ。' : '鏡像異性体も区別して数えろ。';

  let how = '';
  if (conds.length) how += `${u.label.replace(/^、/, '')}は構造異性体が ${u.list.length} 種類。${conds.map((c) => c.why).join('')}当てはまるのは `;
  else how += '構造異性体は ';
  how += `${list.map(show).join('、')} の ${list.length} 種類。`;
  if (stereo !== 'none') {
    const twice = list.filter((i) => (stereo === 'ct' ? i.cisTrans : (stereoCount(i) || 1) > 1));
    how += stereo === 'ct'
      ? `このうち ${twice.map(show).join('、')} にはシス-トランス異性体があり、2 種類ずつに数える。`
      : `このうち ${twice.map((i) => `${show(i)} は ${stereoCount(i)} 種類`).join('、')}の立体異性体に分かれる。`;
    how += `合わせて ${answer} 種類。`;
  }
  const check = (i: Isomer): boolean => u.pred(i) && conds.every((c) => c.pred(i));
  return { kind: 'count', spec, text, answer, list: list.slice(), how, check, stereo };
}

// ---------------------------------------------------------------- 決める問題

interface Clue {
  id: string;
  /** 1：実験結果、2：構造についての情報、3：最後の手段 */
  tier: 1 | 2 | 3;
  text: string;
  check: (i: Isomer) => boolean;
  why: string;
  /** 同じ group の手がかりは 1 つの文章にまとめる。head はその書き出し */
  group?: string;
  head?: string;
}

/** 範囲を言い切る文。候補を減らすものは最初の手がかりに、減らさないものは問題文に入れる */
function scopeOf(spec: Spec): Clue[] {
  const s = shapeOf(spec);
  const out: Clue[] = [];
  const add = (id: string, text: string, check: (i: Isomer) => boolean, why: string): void => { out.push({ id, tier: 1, text, check, why }); };
  if (s.rings === 1) {
    add('scope-ring', s.extra >= 4 ? 'A はベンゼン環を 1 個もち、環に直接結合した置換基は 3 個以下である。' : 'A はベンゼン環をもつ。', () => true, '');
  }
  if (s.n) {
    if (s.o === 1 && s.dbl === 1) add('scope-amide', 'A はアミドである。', isClass('amide'), 'N と O は –CO–N< の形で使われている。');
    if (s.o === 2 && s.dbl === 1) add('scope-aa', 'A は –NH₂ と –COOH を 1 個ずつもつ。', primaryAA, 'アミノ酸。炭素の並び方と –NH₂ の位置を決めればよい。');
    return out;
  }
  if (s.dbl === 1 && s.o === 0 && s.rings === 0) add('scope-chain', 'A は鎖式の化合物である。', () => true, '');
  if (s.dbl === 1 && s.o === 1) {
    add('scope-cc', s.rings ? 'A はベンゼン環のほかに環構造をもたず、炭素原子間の二重結合ももたない。' : 'A は炭素原子間の二重結合も環構造ももたない。',
      (i) => !i.props.br2, '不飽和度の残り 1 は C=O。A はアルデヒドかケトン。');
  }
  if (s.dbl === 1 && s.o === 2) add('scope-acid', 'A はカルボン酸かエステルのどちらかである。', isClass('acid', 'ester'), 'O 2 個は –COOH か –COO– に使われている。');
  return out;
}

function cluesFor(t: Isomer): Clue[] {
  const P = t.props;
  const out: Clue[] = [];
  const add = (id: string, tier: 1 | 2 | 3, text: string, check: (i: Isomer) => boolean, why: string): void => { out.push({ id, tier, text, check, why }); };
  /** 当てはまるかどうかで文が変わる手がかり */
  const yn = (id: string, tier: 1 | 2 | 3, v: boolean, f: (i: Isomer) => boolean, yes: [string, string], no: [string, string]): void => {
    add(id, tier, v ? yes[0] : no[0], (i) => f(i) === v, v ? yes[1] : no[1]);
  };

  yn('na', 1, P.na, (i) => i.props.na,
    ['A に金属ナトリウムを加えると、水素が発生した。', 'ナトリウムと反応するので –OH をもつ。'],
    ['A に金属ナトリウムを加えても、気体は発生しなかった。', 'ナトリウムと反応しないので –OH をもたない。']);
  yn('nahco3', 1, P.nahco3, (i) => i.props.nahco3,
    ['A を炭酸水素ナトリウム水溶液に加えると、二酸化炭素が発生した。', '炭酸より強い酸。カルボキシ基をもつ。'],
    ['A を炭酸水素ナトリウム水溶液に加えても、気体は発生しなかった。', 'カルボン酸ではない。']);
  yn('fecl3', 1, P.fecl3, (i) => i.props.fecl3,
    ['A に塩化鉄(III)水溶液を加えると、呈色した。', 'ベンゼン環に直接 –OH が結合している。'],
    ['A に塩化鉄(III)水溶液を加えても、呈色しなかった。', 'フェノール性の –OH をもたない。']);
  yn('silver', 1, P.silver, (i) => i.props.silver,
    ['A にアンモニア性硝酸銀水溶液を加えて温めると、銀が析出した。', '銀鏡反応を示すのでホルミル基をもつ。'],
    ['A にアンモニア性硝酸銀水溶液を加えて温めても、銀は析出しなかった。', 'ホルミル基をもたない。']);
  // エステルは NaOH で加水分解されるので、そのままのヨードホルム反応は手がかりにしない
  if (t.cls !== 'ester' && t.cls !== 'amide') {
    yn('iodoform', 1, P.iodoform, (i) => i.props.iodoform,
      ['A にヨウ素と水酸化ナトリウム水溶液を加えて温めると、黄色の沈殿が生じた。', 'ヨードホルム反応。CH₃CH(OH)– か CH₃CO– の構造をもつ。'],
      ['A にヨウ素と水酸化ナトリウム水溶液を加えて温めても、黄色の沈殿は生じなかった。', 'CH₃CH(OH)– も CH₃CO– ももたない。']);
  }
  yn('br2', 1, P.br2, (i) => i.props.br2,
    ['A に臭素を作用させると、付加反応が起こった。', 'C=C 結合をもつ。'],
    ['A は臭素と付加反応しなかった。', 'C=C 結合をもたない。']);

  // アミン
  if (t.mol.atoms.includes('N')) {
    yn('basic', 1, P.basic, (i) => i.props.basic,
      ['A は希塩酸と塩をつくって溶けた。', '塩基性を示す。アミノ基をもつ。'],
      ['A は希塩酸と塩をつくらなかった。', '塩基性を示すアミノ基をもたない。']);
    if (ringKind(t) && (t.cls === 'amine' || P.bleach)) {
      yn('bleach', 1, P.bleach, (i) => i.props.bleach,
        ['A にさらし粉水溶液を加えると、赤紫色に呈色した。', 'ベンゼン環に直接 –NH₂ が結合している。'],
        ['A にさらし粉水溶液を加えても、呈色しなかった。', 'ベンゼン環に直接結合した –NH₂ をもたない。']);
    }
    if (t.cls === 'amine' && P.grade) {
      const g = P.grade;
      yn('acyl', 1, hasNH(t), hasNH,
        ['A に無水酢酸を作用させると、アミドが生じた。', 'N に H が結合している。第一級か第二級のアミン。'],
        ['A に無水酢酸を作用させても、アミドは生じなかった。', 'N に H がない。第三級アミン。']);
      add('ngrade', 2, `A の窒素原子には、炭素原子が ${g} 個結合している。`, (i) => i.cls === 'amine' && i.props.grade === g, `第${'一二三'[g - 1]}級アミン。`);
    }
    if (t.cls === 'aminoacid' && P.alpha !== undefined) {
      yn('alpha', 2, P.alpha, (i) => i.props.alpha === true,
        ['A は α-アミノ酸である。', '–NH₂ と –COOH が同じ炭素に結合している。'],
        ['A は α-アミノ酸ではない。', '–NH₂ は –COOH のついた炭素にはない。']);
    }
  }

  // アルコールの酸化と脱水
  if (t.cls === 'alcohol' && P.oxid) {
    if (P.oxid === 'aldehyde') add('oxid', 1, 'A を穏やかに酸化して得られた化合物 B は、銀鏡反応を示した。', (i) => i.props.oxid === 'aldehyde', 'B はアルデヒド。A は第一級アルコール。');
    else if (P.oxid === 'ketone') add('oxid', 1, 'A を酸化すると中性の化合物 B が得られた。B は銀鏡反応を示さなかった。', (i) => i.props.oxid === 'ketone', 'B はケトン。A は第二級アルコール。');
    else add('oxid', 1, 'A は、硫酸酸性の二クロム酸カリウム水溶液を加えて温めても酸化されなかった。', (i) => !oxidizable(i), '第一級・第二級アルコールではない。');
    if (P.dehydration) {
      const n = dehydCount(t);
      const names = P.dehydration.map((k) => byKey(k)).filter((x): x is Isomer => !!x).map(show).join('、');
      add('dehyd', 1,
        n === 0 ? 'A は、分子内の脱水でアルケンを生じる構造をもたない。'
          : n === 1 ? 'A に濃硫酸を加えて加熱し、分子内で脱水させると、1 種類のアルケンだけが生じた。'
            : `A に濃硫酸を加えて加熱し、分子内で脱水させると、シス-トランス異性体も含めて ${n} 種類のアルケンが生じた。`,
        (i) => dehydCount(i) === n,
        n === 0 ? '–OH のついた炭素の隣に、H をもつ炭素がない。' : `隣の炭素の H と –OH がとれる。生じるアルケンは ${names}。`);
    }
  }

  // エステルの加水分解
  if (t.cls === 'ester' && P.hydrolysis) {
    const acid = acidOf(t), alc = alcOf(t);
    if (acid && alc) {
      const phenol = alc.props.fecl3;
      const head = phenol ? 'A を加水分解すると、カルボン酸 B とフェノール類 C が得られた。' : 'A を加水分解すると、カルボン酸 B とアルコール C が得られた。';
      const base = (i: Isomer): boolean => !!i.props.hydrolysis && !!alcOf(i) && alcOf(i)!.props.fecl3 === phenol;
      const fact = (id: string, tier: 1 | 2 | 3, text: string, f: (i: Isomer) => boolean, why: string): void => {
        out.push({ id, tier, text, check: (i) => base(i) && f(i), why, group: 'hyd', head });
      };
      fact('hyd', 1, '', () => true, phenol ? 'A はフェノール類のエステル。–O– がベンゼン環に直接結合している。' : 'A はエステル。');
      const af = specText(specOf(acid.mol));
      fact('hyd-formula', 1, `B の分子式は ${pretty(af)} であった。`, (i) => !!acidOf(i) && specText(specOf(acidOf(i)!.mol)) === af, '酸の部分の炭素数が決まり、残りが C の炭素数になる。');
      const sv = acid.props.silver;
      fact('hyd-silver', 1, sv ? 'B は銀鏡反応を示した。' : 'B は銀鏡反応を示さなかった。', (i) => acidOf(i)?.props.silver === sv, sv ? 'B はギ酸。' : 'B はギ酸ではない。');
      if (!phenol) {
        const io = alc.props.iodoform;
        fact('hyd-iodo', 1, io ? 'C はヨードホルム反応を示した。' : 'C はヨードホルム反応を示さなかった。', (i) => alcOf(i)?.props.iodoform === io,
          io ? 'C は CH₃CH(OH)– の構造をもつ。' : 'C は CH₃CH(OH)– の構造をもたない。');
        const ox = alc.props.oxid;
        if (ox) {
          fact('hyd-oxid', 1,
            ox === 'aldehyde' ? 'C を穏やかに酸化すると、銀鏡反応を示す化合物が得られた。' : ox === 'ketone' ? 'C を酸化すると、銀鏡反応を示さない中性の化合物が得られた。' : 'C は酸化されにくかった。',
            (i) => alcOf(i)?.props.oxid === ox,
            ox === 'aldehyde' ? 'C は第一級アルコール。' : ox === 'ketone' ? 'C は第二級アルコール。' : 'C は第三級アルコール。');
        }
        if (fullOxid(alc) === acid.key) fact('hyd-same', 1, 'C を十分に酸化すると B になった。', (i) => !!i.props.hydrolysis && fullOxid(alcOf(i)) === i.props.hydrolysis.acid, 'B と C は炭素骨格が同じ。');
        if (alc.chiral > 0) fact('hyd-chiral', 2, 'C は不斉炭素原子をもつ。', (i) => (alcOf(i)?.chiral || 0) > 0, 'C の –OH のついた炭素に、異なる 4 つの原子・原子団が結合している。');
      }
      for (const [x, nm, get] of [[acid, 'B', acidOf], [alc, 'C', alcOf]] as const) {
        const sk = skeleton(x);
        if (sk) {
          fact('hyd-chain-' + nm, 2, sk === 'linear' ? `${nm} の炭素鎖に枝分かれはない。` : `${nm} の炭素鎖には枝分かれがある。`, (i) => !!get(i) && skeleton(get(i)!) === sk,
            sk === 'linear' ? `${nm} は直鎖。` : `${nm} は枝分かれをもつ。`);
        }
        const rn = ringSubCount(x);
        if (rn !== undefined) {
          fact('hyd-ring-' + nm, 2, `${nm} のベンゼン環の水素原子 1 個を塩素原子で置換すると、${rn} 種類の構造異性体が考えられる。`, (i) => !!get(i) && ringSubCount(get(i)!) === rn,
            `${nm} の環上の等価でない水素原子が ${rn} 種類。一置換体は 3、二置換体は置換基が異なれば o 4・m 4・p 2。`);
        }
      }
    }
  }

  // アミドの加水分解
  if (t.cls === 'amide' && P.hydrolysis?.amine) {
    const acid = acidOf(t), am = amineOf(t);
    if (acid && am) {
      const nh3 = am.key === AMMONIA;
      const head = nh3 ? 'A を加水分解すると、カルボン酸 B とアンモニアが得られた。' : 'A を加水分解すると、カルボン酸 B とアミン C が得られた。';
      const base = (i: Isomer): boolean => !!amineOf(i) && (amineOf(i)!.key === AMMONIA) === nh3;
      const fact = (id: string, tier: 1 | 2 | 3, text: string, f: (i: Isomer) => boolean, why: string): void => {
        out.push({ id, tier, text, check: (i) => base(i) && f(i), why, group: 'amd', head });
      };
      fact('amd', 1, '', () => true, nh3 ? 'A は –CONH₂ の形のアミド。' : 'A はアミド結合の N に炭素が結合したアミド。');
      const af = specText(specOf(acid.mol));
      fact('amd-formula', 1, `B の分子式は ${pretty(af)} であった。`, (i) => !!acidOf(i) && specText(specOf(acidOf(i)!.mol)) === af, nh3 ? '酸の部分の炭素数が決まる。' : '酸の部分の炭素数が決まり、残りが C の炭素数になる。');
      const sv = acid.props.silver;
      fact('amd-silver', 1, sv ? 'B は銀鏡反応を示した。' : 'B は銀鏡反応を示さなかった。', (i) => acidOf(i)?.props.silver === sv, sv ? 'B はギ酸。' : 'B はギ酸ではない。');
      if (!nh3) {
        if (ringKind(am)) {
          const bl = am.props.bleach;
          fact('amd-bleach', 1, bl ? 'C はさらし粉水溶液で赤紫色に呈色した。' : 'C はさらし粉水溶液で呈色しなかった。', (i) => amineOf(i)?.props.bleach === bl,
            bl ? 'C はベンゼン環に直接 –NH₂ が結合したアミン。' : 'C の –NH₂ はベンゼン環に直接結合していない。');
        }
        const g = am.props.grade;
        if (g) fact('amd-grade', 2, `C の窒素原子には、炭素原子が ${g} 個結合している。`, (i) => amineOf(i)?.props.grade === g, `C は第${'一二三'[g - 1]}級アミン。`);
        if (am.chiral > 0) fact('amd-chiral', 2, 'C は不斉炭素原子をもつ。', (i) => (amineOf(i)?.chiral || 0) > 0, 'C に、異なる 4 つの原子・原子団が結合した炭素がある。');
      }
      for (const [x, nm, get] of [[acid, 'B', acidOf], [am, 'C', amineOf]] as const) {
        if (nm === 'C' && nh3) continue;
        const sk = skeleton(x);
        if (sk) {
          fact('amd-chain-' + nm, 2, sk === 'linear' ? `${nm} の炭素鎖に枝分かれはない。` : `${nm} の炭素鎖には枝分かれがある。`, (i) => !!get(i) && skeleton(get(i)!) === sk,
            sk === 'linear' ? `${nm} は直鎖。` : `${nm} は枝分かれをもつ。`);
        }
        const rn = ringSubCount(x);
        if (rn !== undefined) {
          fact('amd-ring-' + nm, 2, `${nm} のベンゼン環の水素原子 1 個を塩素原子で置換すると、${rn} 種類の構造異性体が考えられる。`, (i) => !!get(i) && ringSubCount(get(i)!) === rn,
            `${nm} の環上の等価でない水素原子が ${rn} 種類。一置換体は 3、二置換体は置換基が異なれば o 4・m 4・p 2。`);
        }
      }
    }
  }

  // アルケン
  if (P.ozonolysis) {
    const prods = P.ozonolysis.map((k) => byKey(k)).filter((x): x is Isomer => !!x);
    const sig = ozClasses(t);
    const said: Record<string, string> = {
      aldehyde: '1 種類のアルデヒドだけが得られた', ketone: '1 種類のケトンだけが得られた',
      'aldehyde+aldehyde': '2 種類のアルデヒドが得られた', 'ketone+ketone': '2 種類のケトンが得られた', 'aldehyde+ketone': 'アルデヒドとケトンが 1 種類ずつ得られた',
    };
    if (said[sig]) add('oz-class', 1, `A をオゾン分解すると、${said[sig]}。`, (i) => ozClasses(i) === sig, 'C=C が切れて、それぞれの炭素が C=O になる。H をもつ側はアルデヒド、もたない側はケトン。');
    if (prods.length === P.ozonolysis.length && prods.every((x) => x.name)) {
      const keys = P.ozonolysis.join('|');
      add('oz-name', 2, prods.length === 1 ? `A をオゾン分解すると、${prods[0].name}だけが得られた。` : `A をオゾン分解すると、${prods.map((x) => x.name).join('と')}が得られた。`,
        (i) => (i.props.ozonolysis || []).join('|') === keys, '2 つの C=O の炭素どうしを C=C でつなぎ直すと A になる。');
    }
  }
  if (P.hydration) {
    const n = P.hydration.length;
    add('hydration', 1, n === 1 ? 'A に水を付加させると、1 種類のアルコールだけが生じる。' : 'A に水を付加させると、2 種類のアルコールが生じうる。',
      (i) => (i.props.hydration || []).length === n, n === 1 ? 'C=C の両側が同じ形。' : 'C=C の両側の形が異なる。');
  }
  if (P.br2) {
    yn('cistrans', 2, t.cisTrans, (i) => i.cisTrans,
      ['A にはシス-トランス異性体が存在する。', 'C=C の両方の炭素に、それぞれ異なる 2 つの原子・原子団が結合している。'],
      ['A にはシス-トランス異性体が存在しない。', 'C=C の少なくとも一方の炭素に、同じ原子・原子団が 2 つ結合している。']);
  }

  // 置換体の数
  const chainOnly = !ringKind(t);
  if (chainOnly && !P.br2 && (t.cls === 'alkane' || t.cls === 'halide' || t.cls === 'ether')) {
    const n = monoSubCount(t);
    add('sub', 1, n === 1 ? 'A の炭素原子に結合した水素原子 1 個を塩素原子で置換した化合物は、1 種類しか考えられない。' : `A の炭素原子に結合した水素原子 1 個を塩素原子で置換すると、${n} 種類の構造異性体が考えられる。`,
      (i) => monoSubCount(i) === n, `等価でない水素原子が ${n} 種類ある。`);
  }
  const rn = ringSubCount(t);
  if (rn !== undefined) {
    add('ring', 2, `A のベンゼン環の水素原子 1 個を塩素原子で置換すると、${rn} 種類の構造異性体が考えられる。`, (i) => ringSubCount(i) === rn,
      `環上の等価でない水素原子が ${rn} 種類。一置換体は 3、二置換体は置換基が同じなら o 2・m 3・p 1、異なれば o 4・m 4・p 2。三置換体は環の対称性から数える。`);
  }
  if (P.sideOxid) {
    const k = P.sideOxid;
    const prod = byKey(k);
    if (k === PHTHALIC) add('side', 1, 'A を過マンガン酸カリウム水溶液で酸化して得られた化合物 B は、加熱すると分子内で脱水して酸無水物になった。', (i) => i.props.sideOxid === k, 'B はフタル酸。2 個の置換基はオルト位にある。');
    else if (prod?.name) add('side', 1, `A を過マンガン酸カリウム水溶液で酸化すると、${prod.name}が得られた。`, (i) => i.props.sideOxid === k, 'ベンゼン環に結合した炭化水素基は、長さによらず –COOH になる。');
  }

  // 構造についての情報
  yn('chiral', 2, t.chiral > 0, (i) => i.chiral > 0,
    ['A は不斉炭素原子をもつ。', '異なる 4 つの原子・原子団が結合した炭素がある。'],
    ['A は不斉炭素原子をもたない。', '異なる 4 つの原子・原子団が結合した炭素はない。']);
  const sk = skeleton(t);
  if (sk) {
    add('chain', 2, sk === 'linear' ? 'A の炭素原子は、枝分かれなく 1 本の鎖状につながっている。' : 'A の炭素原子はすべて C–C 結合でつながり、その炭素鎖には枝分かれがある。',
      (i) => skeleton(i) === sk, sk === 'linear' ? '直鎖の炭素骨格。' : '枝分かれのある炭素骨格。');
  }
  const me = methylCount(t);
  add('methyl', 2, me === 0 ? 'A はメチル基をもたない。' : `A は分子内にメチル基を ${me} 個もつ。`, (i) => methylCount(i) === me, `–CH₃ が ${me} 個。`);
  const kind = ringKind(t);
  if (kind && rn !== undefined) {
    const word = kind === 'Ph' ? '一' : kind === 'Ar' ? '二' : '三';
    add('nsub', 2, `A はベンゼンの${word}置換体である。`, (i) => ringKind(i) === kind, `環に結合した置換基は ${kind === 'Ph' ? 1 : kind === 'Ar' ? 2 : 3} 個。`);
  }
  const pat = triPattern(t);
  if (pat) {
    add('tri', 3,
      pat === '123' ? 'A の 3 個の置換基は、ベンゼン環の隣り合う 3 個の炭素原子に結合している。'
        : pat === '135' ? 'A の 3 個の置換基は、ベンゼン環の炭素原子に 1 個おきに結合している。'
          : 'A の 3 個の置換基は、ベンゼン環の 1,2,4 位に結合している。',
      (i) => triPattern(i) === pat, `置換基の位置は ${pat.split('').join(',')} 位。`);
    const tw = twinPos(t);
    if (tw) {
      const word = tw === 'o' ? 'オルト' : tw === 'm' ? 'メタ' : 'パラ';
      add('twin', 3, `A の 3 個の置換基のうち、同じ 2 個は互いに${word}位にある。`, (i) => twinPos(i) === tw, `同じ置換基どうしが${word}位。残る 1 個の位置が決まる。`);
    }
  }
  const p = ringPos(t);
  if (p) {
    const word = p === 'o' ? 'オルト' : p === 'm' ? 'メタ' : 'パラ';
    add('pos', 3, `A の 2 個の置換基は、互いに${word}位にある。`, (i) => ringPos(i) === p, `${word}位の二置換体。`);
  }
  return out;
}

interface Plan { all: Isomer[]; scope: Clue[]; targets: Isomer[] }
const PLAN_CACHE = new Map<string, Plan>();

/** その分子式で、手がかりをすべて使えばただ 1 つに決まる化合物を調べておく */
function planOf(spec: Spec): Plan {
  const id = specText(spec);
  const hit = PLAN_CACHE.get(id);
  if (hit) return hit;
  const all = isomers(spec);
  const scope = scopeOf(spec);
  const pool = all.filter((i) => scope.every((c) => c.check(i)));
  const targets = pool.filter((t) => {
    const clues = cluesFor(t);
    return pool.filter((i) => clues.every((c) => c.check(i))).length === 1;
  });
  const plan = { all, scope, targets };
  PLAN_CACHE.set(id, plan);
  return plan;
}

export function makeIdentify(rng: Rng, level?: 1 | 2 | 3): IdentifyProblem {
  const pool = specsOf(level).filter((s) => planOf(s).targets.length > 0);
  const spec = pick(rng, pool);
  const { all, scope, targets } = planOf(spec);
  const target = pick(rng, targets);

  // 範囲の文。候補を減らすものだけ手がかりにする
  let cands = all;
  const chosen: { clue: Clue; before: number; after: number }[] = [];
  const notes: string[] = [];
  for (const c of scope) {
    const rest = cands.filter(c.check);
    if (rest.length < cands.length) {
      chosen.push({ clue: c, before: cands.length, after: rest.length });
      cands = rest;
    } else notes.push(c.text);
  }

  // 候補が 1 つになるまで、候補を減らす手がかりを足す。実験結果を先に使う
  const clues = cluesFor(target);
  while (cands.length > 1) {
    const useful = clues
      .filter((c) => !chosen.some((x) => x.clue === c))
      .map((c) => ({ c, rest: cands.filter(c.check) }))
      .filter((x) => x.rest.length < cands.length);
    if (!useful.length) break; // planOf で確かめてあるので、ここには来ない
    const tier = Math.min(...useful.map((x) => x.c.tier));
    const tierPool = useful.filter((x) => x.c.tier === tier);
    const total = tierPool.reduce((s, x) => s + (cands.length - x.rest.length), 0);
    let r = rng() * total;
    let got = tierPool[tierPool.length - 1];
    for (const x of tierPool) {
      r -= cands.length - x.rest.length;
      if (r < 0) { got = x; break; }
    }
    chosen.push({ clue: got.c, before: cands.length, after: got.rest.length });
    cands = got.rest;
  }

  // 生成物の名前まで言う手がかりを使ったら、種類だけを言う手がかりは要らない
  if (chosen.some((x) => x.clue.id === 'oz-name')) {
    const kept = chosen.filter((x) => x.clue.id !== 'oz-class');
    chosen.length = 0;
    let rest = all;
    for (const x of kept) {
      const next = rest.filter(x.clue.check);
      chosen.push({ clue: x.clue, before: rest.length, after: next.length });
      rest = next;
    }
  }

  // 同じ group の手がかりを 1 つの文章にまとめる
  const texts: string[] = [];
  const checks: ((i: Isomer) => boolean)[] = [];
  const done = new Set<string>();
  for (const { clue } of chosen) {
    if (!clue.group) {
      texts.push(clue.text);
      checks.push(clue.check);
      continue;
    }
    if (done.has(clue.group)) continue;
    done.add(clue.group);
    const members = chosen.filter((x) => x.clue.group === clue.group).map((x) => x.clue);
    texts.push((clue.head || '') + members.map((m) => m.text).join(''));
    checks.push((i) => members.every((m) => m.check(i)));
  }

  // 選択肢。多いときは、より多くの手がかりに合う紛らわしいものを残す
  let others = all.filter((i) => i.key !== target.key);
  if (others.length > 7) {
    const score = (i: Isomer): number => checks.filter((f) => f(i)).length;
    others = shuffle(rng, others).map((i) => ({ i, s: score(i) })).sort((a, b) => b.s - a.s).slice(0, 7).map((x) => x.i);
  }
  const options = shuffle(rng, [target, ...others]);

  const text = `分子式 ${F(spec)} で表される化合物 A がある。${notes.join('')}次のことから A の構造を決めろ。`;
  let how = `考えられる構造は ${all.length} 種類。`;
  for (const { clue, before, after } of chosen) {
    const said = clue.group && clue.text === '' ? clue.head || '' : clue.text;
    how += `「${said.replace(/。$/, '')}」→ ${clue.why}（${before} → ${after} 種類）`;
  }
  how += `残るのは ${show(target)}。`;
  return { kind: 'identify', spec, text, clues: texts, options, answer: target.key, how, checks };
}
