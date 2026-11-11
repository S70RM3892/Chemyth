/**
 * 芳香族化合物の抽出による分離。
 * アニリン・安息香酸・フェノール・ニトロベンゼンがエーテルに溶けた混合物を、分液ろうとで、
 * 加える水溶液を変えながら、1 種類ずつ水層へ移して分ける。
 * 酸の強さ（塩酸 ＞ カルボン酸 ＞ 炭酸 ＞ フェノール）と、塩になると水に溶ける、という 2 点だけで決まる。
 */

export type OrgKey = 'An' | 'Bz' | 'Ph' | 'Nb';
export const ORG_ORDER: OrgKey[] = ['An', 'Bz', 'Ph', 'Nb'];
export const ORG: Record<OrgKey, { name: string; pure: string; salt?: string; saltName?: string; kind: string }> = {
  An: { name: 'アニリン', pure: 'C6H5NH2', salt: 'C6H5NH3Cl', saltName: 'アニリン塩酸塩', kind: '塩基' },
  Bz: { name: '安息香酸', pure: 'C6H5COOH', salt: 'C6H5COONa', saltName: '安息香酸ナトリウム', kind: 'カルボン酸' },
  Ph: { name: 'フェノール', pure: 'C6H5OH', salt: 'C6H5ONa', saltName: 'ナトリウムフェノキシド', kind: 'フェノール類' },
  Nb: { name: 'ニトロベンゼン', pure: 'C6H5NO2', kind: '中性' },
};

const idOf = (prefix: string, keys: OrgKey[]) => `${prefix}:` + ORG_ORDER.filter((k) => keys.includes(k)).join('.');
const parse = (prefix: string, id: string): OrgKey[] | null => {
  if (!id.startsWith(prefix + ':')) return null;
  const keys = id.slice(prefix.length + 1).split('.');
  const sorted = ORG_ORDER.filter((k) => (keys as string[]).includes(k));
  return keys.length && sorted.join('.') === keys.join('.') ? sorted : null;
};
/** エーテル溶液（上層）：'org:An.Nb' など */
export const orgId = (keys: OrgKey[]) => idOf('org', keys);
export const orgOf = (id: string) => parse('org', id);
/** 2 種類の塩がまじった水層：'aq:Bz.Ph' だけ */
export const aqId = (keys: OrgKey[]) => idOf('aq', keys);
export const aqOf = (id: string): OrgKey[] | null => { const k = parse('aq', id); return k && k.length >= 2 && k.every((x) => !!ORG[x].salt && x !== 'An') ? k : null; };

export interface Wash {
  id: string;
  name: string;
  /** エーテル層から水層へ移るもの */
  moves: OrgKey[];
  quiz?: { text: string; pool: string[]; answer: string[] };
  note: string;
}
const NAMES = ORG_ORDER.map((k) => ORG[k].name);
const Q = 'アニリン・安息香酸・フェノール・ニトロベンゼンのエーテル溶液に、';

export const WASHES: Wash[] = [
  {
    id: 'x-hcl', name: '希塩酸', moves: ['An'],
    quiz: { text: Q + '希塩酸を加えて振る。水層へ移るものをすべて選べ。', pool: NAMES, answer: ['アニリン'] },
    note: '塩基のアニリンだけが、塩酸と中和してアニリン塩酸塩（C₆H₅NH₃Cl）になり、水層へ移る。水層に NaOH 水溶液を加えると、弱塩基のアニリンが遊離する。',
  },
  {
    id: 'x-nahco3', name: '炭酸水素ナトリウム水溶液', moves: ['Bz'],
    quiz: { text: Q + '炭酸水素ナトリウム水溶液を加えて振る。水層へ移るものをすべて選べ。', pool: NAMES, answer: ['安息香酸'] },
    note: '炭酸より強い酸のカルボン酸だけが、NaHCO₃ と反応して塩になり（CO₂ が発生）、水層へ移る。フェノールは炭酸より弱い酸なので反応せず、エーテル層に残る。酸の強さは、塩酸・硫酸 ＞ カルボン酸 ＞ 炭酸 ＞ フェノール。',
  },
  {
    id: 'x-naoh', name: '水酸化ナトリウム水溶液', moves: ['Bz', 'Ph'],
    quiz: { text: Q + '水酸化ナトリウム水溶液を加えて振る。水層へ移るものをすべて選べ。', pool: NAMES, answer: ['安息香酸', 'フェノール'] },
    note: '酸性の安息香酸とフェノールが、どちらも塩（安息香酸ナトリウム・ナトリウムフェノキシド）になって水層へ移る。2 つがまじった水層に CO₂ を通じると、炭酸より弱い酸のフェノールだけが遊離する。',
  },
  {
    id: 'x-co2', name: '二酸化炭素を通じてエーテルを加える', moves: [],
    quiz: { text: '安息香酸ナトリウムとナトリウムフェノキシドがまじった水溶液に、二酸化炭素を十分に通じる。遊離してエーテル層へ移るものを選べ。', pool: ['安息香酸', 'フェノール'], answer: ['フェノール'] },
    note: '弱い酸の塩に、それより強い酸を加えると、弱い酸が遊離する。炭酸はフェノールより強く、安息香酸より弱い。だから遊離するのはフェノールだけで、安息香酸は塩のまま水層に残る。',
  },
  {
    id: 'x-evap', name: 'エーテルを蒸発させる', moves: [],
    note: 'エーテル層に 1 種類だけ残ったら、エーテルを蒸発させて取り出す。2 種類以上残っているうちは、蒸発させても分かれない。',
  },
];
export const washById = (id: string | undefined) => WASHES.find((a) => a.id === id);

/** 分液ろうとに入れられるもの：エーテル溶液、塩のまじった水層、ナトリウムフェノキシドの水溶液 */
export const extractable = (id: string) => orgOf(id) !== null || aqOf(id) !== null || id === ORG.Ph.salt;
export function extractRefusal(item: string, wash: Wash): string | null {
  const keys = orgOf(item);
  if (wash.id === 'x-evap') return keys && keys.length > 1 ? `エーテル層に ${keys.map((k) => ORG[k].name).join('・')} が残っている。1 種類になるまで、水層へ移して分けろ。` : keys ? null : 'エーテルを蒸発させるのは、エーテル層だけだ。';
  if (wash.id === 'x-co2') return keys ? '二酸化炭素を通じるのは、塩が溶けた水層だ。エーテル層には使わない。' : null;
  return keys ? null : `${wash.name} を加えて振るのは、エーテル層だ。水層には使わない。`;
}

/** 分液ろうとの結果。main：エーテル層（上層）または取り出した物質、side：水層（下層） */
export function extract(item: string, wash: Wash): { main: string | null; side: string | null } {
  const keys = orgOf(item);
  if (wash.id === 'x-evap') return { main: keys && keys.length === 1 ? ORG[keys[0]].pure : item, side: null };
  if (wash.id === 'x-co2') {
    // 水層のフェノキシドだけが遊離して、加えたエーテルへ移る
    const aq = aqOf(item) ?? (item === ORG.Ph.salt ? ['Ph' as OrgKey] : null);
    if (!aq || !aq.includes('Ph')) return { main: null, side: item };
    const rest = aq.filter((k) => k !== 'Ph');
    return { main: orgId(['Ph']), side: rest.length === 1 ? ORG[rest[0]].salt! : rest.length ? aqId(rest) : null };
  }
  if (!keys) return { main: item, side: null };
  const moved = keys.filter((k) => wash.moves.includes(k)), rest = keys.filter((k) => !moved.includes(k));
  return { main: rest.length ? orgId(rest) : null, side: moved.length === 1 ? ORG[moved[0]].salt! : moved.length ? aqId(moved) : null };
}

/** 指令で使う混合物。試薬棚から出る */
export const ORG_MIXES: { id: string; name: string; keys: OrgKey[] }[] = [
  { id: orgId(['An', 'Nb']), name: 'エーテル溶液 ア', keys: ['An', 'Nb'] },
  { id: orgId(['Bz', 'Ph']), name: 'エーテル溶液 イ', keys: ['Bz', 'Ph'] },
  { id: orgId(['An', 'Bz', 'Ph', 'Nb']), name: 'エーテル溶液 ウ', keys: ['An', 'Bz', 'Ph', 'Nb'] },
];

/** start から、分液ろうとの操作だけで作れるもの */
export function extractReachable(start: string): Set<string> {
  const seen = new Set<string>([start]), queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    if (!extractable(cur)) continue;
    for (const a of WASHES) {
      if (extractRefusal(cur, a)) continue;
      const r = extract(cur, a);
      for (const x of [r.main, r.side]) if (x && !seen.has(x)) { seen.add(x); queue.push(x); }
    }
  }
  return seen;
}
