/** 糖の構造決定。京大の大問 IV で繰り返し出る、グルコースだけからなるオリゴ糖の結合様式を決める型。
 *  還元性、酵素による加水分解、メチル化分析を手がかりにして、候補が 1 つに絞れるまで足していく */
export type Rng = () => number;

/** グリコシド結合 1 つ。左（非還元末端側）のグルコースの 1 位が、右のグルコースの pos 位につながる。
 *  pos が 1 のときは 1 位どうしの結合（還元性を失う） */
export interface Link { anomer: 'α' | 'β'; pos: 1 | 4 | 6 }
/** 鎖状のオリゴ糖：グルコース n 個と、そのあいだの結合 n−1 個（左が非還元末端） */
export type Sugar = Link[];

export const sugarText = (s: Sugar) => 'グルコース' + s.map((l) => `–(${l.anomer}1→${l.pos})–グルコース`).join('');
export const sugarKey = (s: Sugar) => s.map((l) => l.anomer + l.pos).join(',');
/** 分子量：グルコース 180 が n 個、結合の数だけ水 18 が取れる */
export const sugarMass = (s: Sugar) => 180 * (s.length + 1) - 18 * s.length;
/** 還元性：右端のグルコースの 1 位が結合に使われていなければ、開環してホルミル基を生じる */
export const reducing = (s: Sugar) => s[s.length - 1].pos !== 1;

const METHYL: Record<string, string> = {
  '2,3,4,6': '2,3,4,6-テトラ-O-メチルグルコース',
  '2,3,6': '2,3,6-トリ-O-メチルグルコース',
  '2,3,4': '2,3,4-トリ-O-メチルグルコース',
};
/** メチル化分析：すべての –OH をメチル化してから加水分解すると、結合に使われていた位置だけが –OH に戻る。
 *  各グルコースについて、メチル基が残る位置の組を返す */
export function methylation(s: Sugar): string[] {
  const out: string[] = ['2,3,4,6']; // 左端は、1 位のほかに結合がない
  for (const l of s) out.push(l.pos === 4 ? '2,3,6' : l.pos === 6 ? '2,3,4' : '2,3,4,6');
  return out.sort();
}
const methylText = (m: string[]) => {
  const count = new Map<string, number>();
  for (const k of m) count.set(k, (count.get(k) || 0) + 1);
  const total = m.length;
  return [...count].map(([k, n]) => `${METHYL[k]}${count.size > 1 || total > 1 ? `（物質量の比 ${n}）` : ''}`).join(' と ');
};

/** 指定した向きの結合だけを切る酵素を作用させたときの断片 */
export function cleave(s: Sugar, anomer: 'α' | 'β'): Sugar[] {
  const out: Sugar[] = [];
  let cur: Sugar = [];
  for (const l of s) { if (l.anomer === anomer) { out.push(cur); cur = []; } else cur.push(l); }
  out.push(cur);
  return out;
}
/** 断片の、実験でわかる特徴：大きさと、メチル化分析の結果 */
const fragKey = (fs: Sugar[]) => fs.map((f) => `${f.length + 1}:${f.length ? methylation(f).join('|') : ''}`).sort().join(' / ');
const SIZE = ['', 'グルコース', '二糖', '三糖', '四糖'];

export interface Clue { text: string; check(s: Sugar): boolean }
export interface SugarProblem { level: 1 | 2 | 3; answer: Sugar; text: string; clues: Clue[]; options: Sugar[]; how: string }

/** その大きさで考えられる結合様式をすべて並べる。1 位どうしの結合は、右端にだけ置ける */
export function candidates(n: number): Sugar[] {
  const links: Link[] = [];
  for (const anomer of ['α', 'β'] as const) for (const pos of [4, 6] as const) links.push({ anomer, pos });
  let out: Sugar[] = [[]];
  for (let i = 0; i < n - 1; i++) out = out.flatMap((s) => links.map((l) => [...s, l]));
  if (n === 2) out.push([{ anomer: 'α', pos: 1 }]); // トレハロース型
  return out;
}

function cluesFor(a: Sugar): Clue[] {
  const out: Clue[] = [];
  const red = reducing(a);
  out.push({ text: red ? 'X の水溶液は、フェーリング液を還元した。' : 'X の水溶液は、フェーリング液を還元しなかった。', check: (s) => reducing(s) === red });
  const m = methylation(a).join('|');
  out.push({ text: `X のすべてのヒドロキシ基をメチル化してから希硫酸で加水分解すると、${methylText(methylation(a))} が得られた。`, check: (s) => methylation(s).join('|') === m });
  for (const [anomer, label] of [['α', '酵素 A（α-グリコシド結合だけを加水分解する。マルターゼなど）'], ['β', '酵素 B（β-グリコシド結合だけを加水分解する。セロビアーゼなど）']] as ['α' | 'β', string][]) {
    const fs = cleave(a, anomer), key = fragKey(fs);
    let text: string;
    if (fs.length === 1) text = `${label}を作用させても、X は加水分解されなかった。`;
    else if (fs.every((f) => f.length === 0)) text = `${label}を十分に作用させると、X はすべてグルコースになった。`;
    else {
      const parts = fs.map((f) => (f.length ? `${SIZE[f.length + 1]}（メチル化分析で ${methylText(methylation(f))} を与える）` : 'グルコース'));
      const count = new Map<string, number>();
      for (const q of parts) count.set(q, (count.get(q) || 0) + 1);
      text = `${label}を十分に作用させると、${[...count].map(([q, n]) => `${q} ${n} 分子`).join('、')} に分かれた。`;
    }
    out.push({ text, check: (s) => fragKey(cleave(s, anomer)) === key });
  }
  // 末端の結合の位置
  const last = a[a.length - 1];
  if (last.pos !== 1) out.push({ text: `X の還元末端（1 位が結合に使われていない側）のグルコースは、${last.pos} 位のヒドロキシ基で隣のグルコースと結合している。`, check: (s) => s[s.length - 1].pos === last.pos });
  const first = a[0];
  out.push({ text: `X の非還元末端のグルコースの 1 位は、${first.anomer} 型でグリコシド結合している。`, check: (s) => s[0].anomer === first.anomer });
  return out;
}

function shuffle<T>(rng: Rng, a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function makeSugar(rng: Rng, level: 1 | 2 | 3 = 2): SugarProblem {
  const n = level + 1, all = candidates(n);
  for (let attempt = 0; attempt < 200; attempt++) {
    const answer = all[Math.floor(rng() * all.length)];
    let left = all;
    const clues: Clue[] = [], steps = [all.length];
    for (const c of shuffle(rng, cluesFor(answer))) {
      if (left.length === 1) break;
      const next = left.filter((s) => c.check(s));
      if (next.length < left.length) { clues.push(c); left = next; steps.push(left.length); }
    }
    if (left.length !== 1 || clues.length < 2) continue;
    const others = shuffle(rng, all.filter((s) => sugarKey(s) !== sugarKey(answer))).slice(0, 7);
    const text = `グルコースだけからなる${SIZE[n]} X（分子量 ${sugarMass(answer)}）がある。次の実験事実から、X の結合様式を決めろ。`
      + '表記は、左が非還元末端で、(α1→4) は「左のグルコースの 1 位が α 型で、右のグルコースの 4 位と結合している」ことを表す。';
    const how = `考えられる結合様式は ${steps[0]} 通り。手がかりを順に当てはめると ${steps.join(' → ')} 通りに絞れる。`
      + ' メチル化分析では、結合に使われていた位置だけが –OH として残る：2,3,4,6-テトラは末端、2,3,6-トリは 4 位で、2,3,4-トリは 6 位で結合していたグルコース。'
      + ' 1 位どうしで結合した糖は開環できないので、還元性を示さない。'
      + ` 分子量の確認：180 × ${n} − 18 × ${n - 1} = ${sugarMass(answer)}。答え：${sugarText(answer)}。`;
    return { level, answer, text, clues, options: shuffle(rng, [answer, ...others]), how };
  }
  throw new Error('糖の問題を作れなかった');
}
