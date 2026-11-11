/** ペプチドの配列決定。京大の大問 IV（天然高分子）で繰り返し出る型を、その場で作る。
 *  配列を乱数で決め、実験事実（手がかり）を、候補が 1 つに絞れるまで足していく */
export type Rng = () => number;

export interface Amino {
  id: string;
  name: string;
  /** 分子量 */
  m: number;
  /** ベンゼン環をもつ（キサントプロテイン反応） */
  ring?: boolean;
  /** 硫黄をもつ（NaOH と加熱し、酢酸鉛(II)で黒色沈殿） */
  sulfur?: boolean;
  /** 酸性アミノ酸・塩基性アミノ酸 */
  acid?: boolean;
  base?: boolean;
  /** 不斉炭素原子をもたない */
  achiral?: boolean;
}

export const AMINOS: Amino[] = [
  { id: 'Gly', name: 'グリシン', m: 75, achiral: true },
  { id: 'Ala', name: 'アラニン', m: 89 },
  { id: 'Ser', name: 'セリン', m: 105 },
  { id: 'Cys', name: 'システイン', m: 121, sulfur: true },
  { id: 'Phe', name: 'フェニルアラニン', m: 165, ring: true },
  { id: 'Tyr', name: 'チロシン', m: 181, ring: true },
  { id: 'Glu', name: 'グルタミン酸', m: 147, acid: true },
  { id: 'Lys', name: 'リシン', m: 146, base: true },
];
const A = (id: string) => AMINOS.find((a) => a.id === id)!;

export interface Clue { text: string; check(seq: string[]): boolean }
export interface PeptideProblem {
  level: 1 | 2 | 3;
  /** N 末端から C 末端へ */
  answer: string[];
  /** 構成アミノ酸（答えの並べ替え。入力に使う） */
  parts: string[];
  text: string;
  clues: Clue[];
  how: string;
}

/** ペプチドの分子量：アミノ酸の和から、ペプチド結合の数だけ水を引く */
export const peptideMass = (seq: string[]) => seq.reduce((s, id) => s + A(id).m, 0) - 18 * (seq.length - 1);

/** 指定した性質のアミノ酸のカルボキシ基側で切る（末端なら切れない） */
export function cleave(seq: string[], after: (a: Amino) => boolean): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  seq.forEach((id, i) => {
    cur.push(id);
    if (after(A(id)) && i < seq.length - 1) { out.push(cur); cur = []; }
  });
  out.push(cur);
  return out;
}

const KIND = ['', 'アミノ酸', 'ジペプチド', 'トリペプチド', 'テトラペプチド', 'ペンタペプチド'];
/** 断片の、実験でわかる性質。1 分子のアミノ酸は名前までわかるものとする */
function describe(f: string[]): { key: string; text: string } {
  if (f.length === 1) return { key: `1:${f[0]}`, text: `${A(f[0]).name}` };
  const ring = f.some((id) => A(id).ring), s = f.some((id) => A(id).sulfur), biuret = f.length >= 3;
  return {
    key: `${f.length}:${ring ? 1 : 0}${s ? 1 : 0}`,
    text: `${KIND[f.length]}（ビウレット反応を${biuret ? '示す' : '示さない'}。キサントプロテイン反応を${ring ? '示す' : '示さない'}。硫黄の検出反応は${s ? '陽性' : '陰性'}）`,
  };
}
const fragKey = (fs: string[][]) => fs.map((f) => describe(f).key).sort().join('|');

function permutations(parts: string[]): string[][] {
  const out: string[][] = [], seen = new Set<string>();
  const go = (rest: string[], acc: string[]) => {
    if (!rest.length) { const k = acc.join('-'); if (!seen.has(k)) { seen.add(k); out.push(acc); } return; }
    const used = new Set<string>();
    rest.forEach((id, i) => {
      if (used.has(id)) return;
      used.add(id);
      go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, id]);
    });
  };
  go(parts, []);
  return out;
}

/** 配列 seq について言える手がかりを全部作る */
function cluesFor(seq: string[]): Clue[] {
  const n = seq.length, out: Clue[] = [];
  const first = A(seq[0]), last = A(seq[n - 1]);
  if (first.achiral) out.push({ text: 'N 末端（アミノ基が残っている側）のアミノ酸は、不斉炭素原子をもたなかった。', check: (s) => !!A(s[0]).achiral });
  else out.push({ text: `N 末端のアミノ酸は${first.name}だった。`, check: (s) => s[0] === seq[0] });
  out.push({ text: `C 末端（カルボキシ基が残っている側）のアミノ酸は${last.name}だった。`, check: (s) => s[s.length - 1] === seq[n - 1] });

  const enzyme = (label: string, what: string, after: (a: Amino) => boolean) => {
    const fs = cleave(seq, after);
    if (fs.length < 2) {
      if (seq.some((id) => after(A(id)))) out.push({ text: `${label}（${what}のカルボキシ基側のペプチド結合だけを加水分解する）を作用させても、X は切れなかった。`, check: (s) => cleave(s, after).length === 1 });
      return;
    }
    const key = fragKey(fs);
    const list = fs.map((f) => describe(f).text);
    out.push({
      text: `${label}（${what}のカルボキシ基側のペプチド結合だけを加水分解する）を作用させると、${list.join('、')} の ${fs.length} つに分かれた。`,
      check: (s) => fragKey(cleave(s, after)) === key,
    });
  };
  enzyme('酵素 P', 'ベンゼン環をもつアミノ酸', (a) => !!a.ring);
  enzyme('酵素 Q', '塩基性アミノ酸', (a) => !!a.base);

  // 部分加水分解で得られるジペプチド（どちらが N 末端側かはわからない）
  for (let i = 0; i < n - 1; i++) {
    const pair = [seq[i], seq[i + 1]].sort();
    const has = (s: string[]) => s.some((_, k) => k < s.length - 1 && [s[k], s[k + 1]].sort().join() === pair.join());
    const same = pair[0] === pair[1];
    out.push({ text: `X を部分的に加水分解すると、${same ? `${A(pair[0]).name} 2 分子` : `${A(pair[0]).name}と${A(pair[1]).name}`}からなるジペプチドが得られた。`, check: has });
  }
  // 酸性アミノ酸の位置：C 末端側から何番目か、ではなく、N 末端との隣接で与える
  const acid = seq.findIndex((id) => A(id).acid);
  if (acid > 0 && acid < n - 1) {
    const side = [seq[acid - 1], seq[acid + 1]].sort();
    out.push({
      text: `X の中で、酸性アミノ酸の両隣は${A(side[0]).name}と${A(side[1]).name}だった。`,
      check: (s) => { const k = s.findIndex((id) => A(id).acid); return k > 0 && k < s.length - 1 && [s[k - 1], s[k + 1]].sort().join() === side.join(); },
    });
  }
  return out;
}

const pick = <T>(rng: Rng, a: T[]) => a[Math.floor(rng() * a.length)];
function shuffle<T>(rng: Rng, a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function makePeptide(rng: Rng, level: 1 | 2 | 3 = 2): PeptideProblem {
  for (let attempt = 0; attempt < 200; attempt++) {
    const n = level + 2;
    // 手がかりが効くように、ベンゼン環をもつものを 1 つは入れる。発展では同じアミノ酸を 2 つ含むことがある
    const ringOne = pick(rng, AMINOS.filter((a) => a.ring));
    let pool = shuffle(rng, AMINOS.filter((a) => a !== ringOne)).slice(0, n - 1).map((a) => a.id);
    if (level === 3 && rng() < 0.5) pool[pool.length - 1] = pool[0];
    const answer = shuffle(rng, [ringOne.id, ...pool]);
    const cands = permutations(answer);
    let left = cands;
    const clues: Clue[] = [];
    const steps: number[] = [left.length];
    for (const c of shuffle(rng, cluesFor(answer))) {
      if (left.length === 1) break;
      const next = left.filter((s) => c.check(s));
      if (next.length < left.length) { clues.push(c); left = next; steps.push(left.length); }
    }
    if (left.length !== 1 || clues.length < 2) continue;
    const parts = [...answer].sort((a, b) => AMINOS.findIndex((x) => x.id === a) - AMINOS.findIndex((x) => x.id === b));
    const count = new Map<string, number>();
    for (const id of parts) count.set(id, (count.get(id) || 0) + 1);
    const comp = [...count].map(([id, k]) => `${A(id).name}${k > 1 ? ` ${k} 分子` : ''}`).join('、');
    const text = `鎖状の${KIND[n]} X（分子量 ${peptideMass(answer)}）を完全に加水分解すると、${comp}が得られた。次の実験事実から、X のアミノ酸配列を N 末端から順に答えろ。`
      + `（分子量：${[...count.keys()].map((id) => `${A(id).name} ${A(id).m}`).join('、')}）`;
    const how = `構成アミノ酸の並べ方は ${steps[0]} 通り。手がかりを順に当てはめると ${steps.join(' → ')} 通りに絞れる。`
      + ` 分子量の確認：${parts.map((id) => A(id).m).join(' + ')} − 18 × ${n - 1} = ${peptideMass(answer)}。`
      + ' ビウレット反応はペプチド結合が 2 つ以上（トリペプチド以上）で陽性になる。ジペプチドは示さない。'
      + ` 答え：${answer.map((id) => A(id).name).join(' – ')}。`;
    return { level, answer, parts, text, clues, how };
  }
  throw new Error('配列決定の問題を作れなかった');
}

/** 並べ方の数：同じアミノ酸を区別しない順列 */
export const arrangements = (parts: string[]) => permutations(parts).length;
