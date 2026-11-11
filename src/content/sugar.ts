/** 糖の構造決定。京大の大問 IV で繰り返し出る、オリゴ糖の結合様式を決める型。
 *  還元性、酵素による加水分解、メチル化分析を手がかりにして、候補が 1 つに絞れるまで足していく。
 *  水準 1・2 は鎖状の二糖・三糖（ガラクトースやスクロース型の結合も候補に入る）、
 *  水準 3 はグルコースだけの四糖で、アミロペクチンのような枝分かれが 1 か所あるものも候補に入る */
export type Rng = () => number;
export type Mono = 'グルコース' | 'ガラクトース' | 'フルクトース';
export type Anomer = 'α' | 'β';

/** グリコシド結合 1 つ。非還元末端側の糖の 1 位が、還元末端側の糖の pos 位につながる。
 *  pos が相手の「還元性のもとになる炭素」（グルコースの 1 位、フルクトースの 2 位）のときは、
 *  その炭素どうしの結合で、還元性を失う（トレハロース型 α1↔α1、スクロース型 α1↔β2） */
export interface Link { anomer: Anomer; pos: 1 | 2 | 4 | 6 }
/** ある糖のヒドロキシ基に、1 位でつながっている糖（とその先） */
export interface Sub extends Link { sugar: Sugar }
/** オリゴ糖は、還元末端側の糖を根とする木で表す。subs は、この糖に 1 位で結合している糖。
 *  鎖状なら subs は 1 つずつ、枝分かれの糖では 4 位と 6 位の 2 つになる */
export interface Sugar { mono: Mono; subs: Sub[] }

const GLC: Mono = 'グルコース', GAL: Mono = 'ガラクトース', FRU: Mono = 'フルクトース';
const MONOS: Mono[] = [GLC, GAL, FRU];
const ABBR: Record<Mono, string> = { グルコース: 'G', ガラクトース: 'L', フルクトース: 'F' };
/** 還元性のもとになる炭素（環をつくるヘミアセタールの炭素） */
const anomericC = (m: Mono) => (m === FRU ? 2 : 1);
/** 還元性のもとになる炭素どうしの結合で、根の側の糖がとる向き：トレハロースは α、スクロースのフルクトースは β */
const rootAnomer = (m: Mono): Anomer => (m === FRU ? 'β' : 'α');
/** 環と結合に使われていない、メチル化される –OH の位置。グルコースとガラクトースは六員環、スクロースのフルクトースは五員環 */
const FREE_OH: Record<Mono, number[]> = { グルコース: [2, 3, 4, 6], ガラクトース: [2, 3, 4, 6], フルクトース: [1, 3, 4, 6] };

const byPos = (a: Link, b: Link) => a.pos - b.pos;
const sorted = (s: Sugar) => [...s.subs].sort(byPos);
const node = (mono: Mono, subs: Sub[] = []): Sugar => ({ mono, subs: [...subs].sort(byPos) });

/** 鎖状の糖を、左（非還元末端）からの結合の並びで作る。monos を省くとすべてグルコース */
export function linear(links: Link[], monos: Mono[] = []): Sugar {
  let cur = node(monos[0] ?? GLC);
  links.forEach((l, i) => { cur = node(monos[i + 1] ?? GLC, [{ anomer: l.anomer, pos: l.pos, sugar: cur }]); });
  return cur;
}

const linkText = (l: Link, parent: Mono) => (l.pos === anomericC(parent) ? `${l.anomer}1↔${rootAnomer(parent)}${l.pos}` : `${l.anomer}1→${l.pos}`);
/** 1 行の表記。左が非還元末端、右端が根（還元末端側）。枝は [ ] で囲み、[ ] のすぐ右の糖に結合する：
 *  グルコース–(α1→4)–[グルコース–(α1→6)]–グルコース–(α1→4)–グルコース */
export function sugarText(s: Sugar): string {
  if (!s.subs.length) return s.mono;
  const [main, ...rest] = sorted(s);
  return `${sugarText(main.sugar)}–(${linkText(main, s.mono)})–` + rest.map((b) => `[${sugarText(b.sugar)}–(${linkText(b, s.mono)})]–`).join('') + s.mono;
}
/** 構造ごとに 1 つに決まる文字列 */
export function sugarKey(s: Sugar): string {
  return ABBR[s.mono] + (s.subs.length ? `(${sorted(s).map((l) => l.anomer + l.pos + sugarKey(l.sugar)).join('|')})` : '');
}
/** 単糖の数 */
export const size = (s: Sugar): number => 1 + s.subs.reduce((n, l) => n + size(l.sugar), 0);
/** 枝分かれ（4 位と 6 位の両方で結合している糖）の数 */
export const branches = (s: Sugar): number => (s.subs.length > 1 ? 1 : 0) + s.subs.reduce((n, l) => n + branches(l.sugar), 0);
/** 分子量：単糖はどれも C₆H₁₂O₆ = 180。グリコシド結合（単糖の数 − 1）の数だけ水 18 が取れる */
export const sugarMass = (s: Sugar) => 180 * size(s) - 18 * (size(s) - 1);
/** 還元性：根の糖の、還元性のもとになる炭素が結合に使われていなければ、開環して還元性を示す */
export const reducing = (s: Sugar) => !s.subs.some((l) => l.pos === anomericC(s.mono));

function residues(s: Sugar, out: Sugar[] = []): Sugar[] {
  out.push(s);
  for (const l of s.subs) residues(l.sugar, out);
  return out;
}
/** 非還元末端（ほかの糖が結合していない糖）が、1 位でつくっている結合の向き */
function leafAnomers(s: Sugar, out: Anomer[] = []): Anomer[] {
  for (const l of s.subs) { if (l.sugar.subs.length) leafAnomers(l.sugar, out); else out.push(l.anomer); }
  return out.sort();
}

/** メチル化分析：すべての –OH をメチル化してから加水分解すると、結合に使われていた位置だけが –OH に戻る。
 *  各単糖について、メチル基が残る位置の組を返す（グルコース以外は「単糖名:位置」）。
 *  枝分かれのグルコースは 4 位と 6 位がともに –OH に戻るので 2,3 になる */
export function methylation(s: Sugar): string[] {
  return residues(s).map((r) => {
    const used = r.subs.map((l): number => l.pos);
    const kept = FREE_OH[r.mono].filter((p) => !used.includes(p)).join(',');
    return r.mono === GLC ? kept : `${r.mono}:${kept}`;
  }).sort();
}
const COUNT = ['', 'モノ', 'ジ', 'トリ', 'テトラ'];
/** 2,3,6 → 2,3,6-トリ-O-メチルグルコース */
export function methylName(key: string): string {
  const [mono, pos] = key.includes(':') ? key.split(':') : [GLC, key];
  return `${pos}-${COUNT[pos.split(',').length]}-O-メチル${mono}`;
}
const tally = <T>(xs: T[]) => { const m = new Map<T, number>(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
const methylText = (m: string[]) => {
  const count = tally(m);
  if (count.size === 1) return `${methylName(m[0])}だけ`;
  return [...count].map(([k, n]) => `${methylName(k)}（物質量の比 ${n}）`).join(' と ');
};

/** 酵素が切る結合。α・β は 1→4 と 1→6 の両方、α1→4 などはその結合だけ、スクロース型はインベルターゼ */
export type Enzyme = 'α' | 'β' | 'α1→4' | 'α1→6' | 'β1→4' | 'β1→6' | 'スクロース型';
function cuts(e: Enzyme, l: Link, parent: Mono): boolean {
  if (l.pos === anomericC(parent)) return e === 'スクロース型' && parent === FRU;
  if (e === 'α' || e === 'β') return l.anomer === e;
  return e === `${l.anomer}1→${l.pos}`;
}
/** 酵素を十分に作用させたときの断片。切り離された側は、切れた糖が新しい還元末端（根）になる */
export function cleave(s: Sugar, e: Enzyme): Sugar[] {
  const out: Sugar[] = [];
  const walk = (n: Sugar): Sugar => {
    const subs: Sub[] = [];
    for (const l of n.subs) { const c = walk(l.sugar); if (cuts(e, l, n.mono)) out.push(c); else subs.push({ anomer: l.anomer, pos: l.pos, sugar: c }); }
    return { mono: n.mono, subs };
  };
  out.push(walk(s));
  return out;
}
/** 酵素を作用させたときに、実験でわかること：切れなければそれだけ。
 *  切れたら、断片ごとに、単糖ならその種類、それ以外は大きさとメチル化分析の結果 */
const fragKey = (fs: Sugar[]) => (fs.length === 1 ? '' : fs.map((f) => (f.subs.length ? `${size(f)}:${methylation(f).join('|')}` : f.mono)).sort().join(' / '));
const SIZE = ['', '単糖', '二糖', '三糖', '四糖'];

export interface Clue { text: string; check(s: Sugar): boolean }
export interface SugarProblem { level: 1 | 2 | 3; answer: Sugar; text: string; clues: Clue[]; options: Sugar[]; how: string }

const ANOMERS: Anomer[] = ['α', 'β'];
const CHAIN_POS = [4, 6] as const;
/** グルコース n 個が 1→4・1→6 結合だけでつながり、枝分かれがちょうど b か所ある構造をすべて並べる。
 *  1 つの糖に結合できるのは 4 位と 6 位に 1 つずつ。b = 0 なら鎖状で 4^(n−1) 通り */
export function glucans(n: number, b = 0): Sugar[] {
  if (n === 1) return b === 0 ? [node(GLC)] : [];
  const out: Sugar[] = [];
  for (const pos of CHAIN_POS) for (const anomer of ANOMERS) for (const t of glucans(n - 1, b)) out.push(node(GLC, [{ anomer, pos, sugar: t }]));
  if (b >= 1) {
    for (let k = 1; k <= n - 2; k++) for (let b4 = 0; b4 <= b - 1; b4++) {
      const at6 = glucans(n - 1 - k, b - 1 - b4);
      for (const t4 of glucans(k, b4)) for (const t6 of at6) for (const a4 of ANOMERS) for (const a6 of ANOMERS) {
        out.push(node(GLC, [{ anomer: a4, pos: 4, sugar: t4 }, { anomer: a6, pos: 6, sugar: t6 }]));
      }
    }
  }
  return out;
}
/** 非還元末端（左端）のグルコースを、ガラクトースに置き換える。鎖状の糖にだけ使う */
function withGalactoseEnd(s: Sugar): Sugar {
  if (!s.subs.length) return node(GAL);
  return node(s.mono, s.subs.map((l) => ({ anomer: l.anomer, pos: l.pos, sugar: withGalactoseEnd(l.sugar) })));
}
/** 還元末端のグルコースの 1 位に、フルクトースをスクロース型（α1↔β2）で結合させる */
const withFructose = (s: Sugar): Sugar => node(FRU, [{ anomer: 'α', pos: 2, sugar: s }]);

/** 単糖 n 個の候補をすべて並べる。
 *  n = 2, 3（鎖状）：グルコースの鎖、その非還元末端をガラクトースに替えたもの、
 *  右端にフルクトースがスクロース型で結合したもの。n = 2 には、グルコースの 1 位どうしが結合したトレハロース型も入る。
 *  n ≥ 4（グルコースだけ）：鎖状のものと、枝分かれが 1 か所のもの */
export function candidates(n: number): Sugar[] {
  const chains = glucans(n);
  if (n >= 4) return [...chains, ...glucans(n, 1)];
  const out = [...chains, ...chains.map(withGalactoseEnd)];
  if (n === 2) out.push(node(GLC, [{ anomer: 'α', pos: 1, sugar: node(GLC) }]), withFructose(node(GLC)));
  else for (const c of glucans(n - 1)) out.push(withFructose(c), withFructose(withGalactoseEnd(c)));
  return out;
}

const composition = (s: Sugar) => { const c = tally(residues(s).map((r) => r.mono)); return MONOS.filter((m) => c.has(m)).map((m) => [m, c.get(m) as number] as const); };
/** 部分的に加水分解したときに得られる二糖の種類（隣り合う 2 つの糖の組） */
const pairs = (s: Sugar) => [...new Set(residues(s).flatMap((r) => r.subs.map((l) => `${l.sugar.mono}–(${linkText(l, r.mono)})–${r.mono}`)))].sort();
const rootPos = (s: Sugar) => sorted(s).map((l) => l.pos).join(',');
const TETRA = '2,3,4,6', DI = '2,3';

/** 問題で使う酵素。どれも、決まった種類の結合だけを切る仮想的な酵素として、はたらきを問題文で定義する。
 *  記号（酵素 A, B, …）は、手がかりに出てきた順にあとで振る */
const ENZYMES: { kind: Enzyme; spec: string; name?: string; use(n: number): boolean }[] = [
  { kind: 'α', spec: 'α1→4 結合と α1→6 結合だけを加水分解する', use: () => true },
  { kind: 'β', spec: 'β1→4 結合と β1→6 結合だけを加水分解する', use: () => true },
  { kind: 'α1→4', spec: 'α1→4 結合だけを加水分解する', use: (n) => n >= 3 },
  { kind: 'α1→6', spec: 'α1→6 結合だけを加水分解する。アミロペクチンの枝分かれを切る酵素と同じはたらき', use: (n) => n >= 3 },
  { kind: 'β1→4', spec: 'β1→4 結合だけを加水分解する', use: (n) => n >= 3 },
  { kind: 'β1→6', spec: 'β1→6 結合だけを加水分解する', use: (n) => n >= 3 },
  { kind: 'スクロース型', name: 'インベルターゼ', spec: 'スクロースの、グルコースの 1 位とフルクトースの 2 位のあいだの結合だけを加水分解する', use: (n) => n <= 3 },
];
/** 酵素の記号を入れる前の手がかり。text の ENZ を、酵素の呼び名に置き換えて使う */
interface Draft extends Clue { enzyme?: Enzyme }
const ENZ = '〈酵素〉';

function cluesFor(a: Sugar): Draft[] {
  const out: Draft[] = [], n = size(a);
  const red = reducing(a);
  out.push({ text: red ? 'X の水溶液は、フェーリング液を還元した。' : 'X の水溶液は、フェーリング液を還元しなかった。', check: (s) => reducing(s) === red });

  // 構成する単糖（水準 3 はグルコースだけと問題文で断っている）
  if (n <= 3) {
    const comp = composition(a), key = comp.join('/');
    const text = comp.length === 1 ? `${comp[0][0]}だけが得られた` : `${comp.map(([m]) => m).join('と')}が物質量の比 ${comp.map(([, k]) => k).join(' : ')} で得られた`;
    out.push({ text: `X を希硫酸で完全に加水分解すると、${text}。`, check: (s) => composition(s).join('/') === key });
  }

  // メチル化分析
  const ma = methylation(a), m = ma.join('|');
  out.push({ text: `X のすべてのヒドロキシ基をメチル化してから希硫酸で加水分解すると、${methylText(ma)}が得られた。`, check: (s) => methylation(s).join('|') === m });
  if (n >= 4) {
    const ends = ma.filter((k) => k === TETRA).length, di = ma.includes(DI);
    out.push({ text: `X 1 mol のすべてのヒドロキシ基をメチル化してから希硫酸で加水分解すると、${methylName(TETRA)}が ${ends} mol 得られた。`, check: (s) => methylation(s).filter((k) => k === TETRA).length === ends });
    out.push({ text: `X のすべてのヒドロキシ基をメチル化してから希硫酸で加水分解した生成物に、${methylName(DI)}は含まれて${di ? 'いた' : 'いなかった'}。`, check: (s) => methylation(s).includes(DI) === di });
  }

  // 酵素による加水分解
  for (const { kind, use } of ENZYMES) {
    if (!use(n)) continue;
    const fs = cleave(a, kind), key = fragKey(fs);
    let text: string;
    if (fs.length === 1) text = `${ENZ}を作用させても、X は加水分解されなかった。`;
    else if (fs.every((f) => !f.subs.length && f.mono === GLC)) text = `${ENZ}を十分に作用させると、X はすべてグルコースになった。`;
    else {
      const parts = fs.map((f) => (f.subs.length ? `${SIZE[size(f)]}（メチル化分析で ${methylText(methylation(f))}を与える）` : f.mono));
      text = `${ENZ}を十分に作用させると、X 1 分子は、${[...tally(parts)].map(([q, k]) => `${q} ${k} 分子`).join('、')}に分かれた。`;
    }
    out.push({ text, enzyme: kind, check: (s) => fragKey(cleave(s, kind)) === key });
  }

  // 部分的な加水分解で得られる二糖（スクロース型の結合は酸にとくに弱いので、フルクトースを含む糖では使わない）
  const pa = pairs(a), pk = pa.join(' / ');
  if (n >= 3 && !residues(a).some((r) => r.mono === FRU)) {
    out.push({ text: `X を穏やかな条件で部分的に加水分解すると、二糖としては ${pa.join(' と ')} ${pa.length > 1 ? `の ${pa.length} 種類` : ''}だけが得られた。`, check: (s) => pairs(s).join(' / ') === pk });
  }

  // 両端の糖の結合。どちらも還元末端がある糖についての記述で、文もそれを前提にしている
  if (red) {
    const rp = rootPos(a);
    const how = a.subs.length > 1 ? '4 位と 6 位の両方のヒドロキシ基で、別々の糖と結合している'
      : n >= 4 ? `${rp} 位のヒドロキシ基だけで、ほかの糖と結合している` : `${rp} 位のヒドロキシ基で隣の糖と結合している`;
    out.push({ text: `X の還元末端（1 位が結合に使われていない側）のグルコースは、${how}。`, check: (s) => reducing(s) && rootPos(s) === rp });
    const la = leafAnomers(a), lk = la.join('');
    const end = n <= 3 ? `X の、還元末端とは反対側の端（非還元末端）の糖の 1 位は、${la[0]} 型でグリコシド結合している。`
      : la.length === 1 ? `X の非還元末端の糖は 1 つで、その 1 位は ${la[0]} 型でグリコシド結合している。`
        : `X には非還元末端の糖が ${la.length} つあり、その 1 位は、${la.every((x) => x === la[0]) ? `${la.length === 2 ? 'どちらも' : 'どれも'} ${la[0]} 型` : [...tally(la)].map(([x, k]) => `${k} つが ${x} 型`).join('、')}でグリコシド結合している。`;
    out.push({ text: end, check: (s) => reducing(s) && leafAnomers(s).join('') === lk });
  }
  return out;
}

function shuffle<T>(rng: Rng, a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/** 高校の教科書に出てくる二糖の名前 */
const NAMES: Record<string, string> = {
  [sugarKey(linear([{ anomer: 'α', pos: 4 }]))]: 'マルトース',
  [sugarKey(linear([{ anomer: 'β', pos: 4 }]))]: 'セロビオース',
  [sugarKey(linear([{ anomer: 'α', pos: 1 }]))]: 'トレハロース',
  [sugarKey(linear([{ anomer: 'β', pos: 4 }], [GAL, GLC]))]: 'ラクトース',
  [sugarKey(linear([{ anomer: 'α', pos: 2 }], [GLC, FRU]))]: 'スクロース',
};

const NOTATION = '表記は、左が非還元末端で、(α1→4) は「左の糖の 1 位が α 型で、右の糖の 4 位と結合している」ことを表す。';
function stem(n: number, mass: number): string {
  if (n >= 4) {
    return `グルコースだけからなる${SIZE[n]} X（分子量 ${mass}）がある。X は、枝分かれのない鎖状か、1 か所だけ枝分かれした構造（1 つのグルコースが 4 位と 6 位の両方で別のグルコースと結合している）で、結合はどれも 1→4 か 1→6 である。次の実験事実から、X の構造を決めろ。`
      + NOTATION + '[ ] で囲んだ部分は枝で、[ ] のすぐ右のグルコースに結合している'
      + '（例：グルコース–(α1→4)–[グルコース–(α1→6)]–グルコース は、右端のグルコースの 4 位と 6 位に 1 つずつグルコースが結合した三糖）。';
  }
  return `グルコース・ガラクトース・フルクトース（どれも分子量 180）のいずれか ${n} 分子が脱水縮合した${SIZE[n]} X（分子量 ${mass}）がある。次の実験事実から、X の構造を決めろ。`
    + 'ただし、ガラクトースは非還元末端（左端）にだけ、フルクトースは、スクロースと同じ結合 (α1↔β2) でグルコースと結合した右端にだけ現れ、ほかの結合はどれも 1→4 か 1→6 であるとする。'
    + (n === 2 ? 'グルコースの 1 位どうしが結合したトレハロース型 (α1↔α1) も考える。' : '')
    + NOTATION + '(α1↔β2) は、左のグルコースの 1 位（α 型）と右のフルクトースの 2 位（β 型）の結合を表す。';
}

export function makeSugar(rng: Rng, level: 1 | 2 | 3 = 2): SugarProblem {
  const n = level + 1, all = candidates(n);
  for (let attempt = 0; attempt < 200; attempt++) {
    const answer = all[Math.floor(rng() * all.length)], key = sugarKey(answer);
    let left = all;
    const drafts: Draft[] = [], steps = [all.length];
    for (const c of shuffle(rng, cluesFor(answer))) {
      if (left.length === 1) break;
      const next = left.filter((s) => c.check(s));
      if (next.length < left.length) { drafts.push(c); left = next; steps.push(left.length); }
    }
    if (left.length !== 1 || drafts.length < 2) continue;
    // 酵素の記号は、出てきた順に A, B, C, … と振る
    const used = [...new Set(drafts.flatMap((c) => (c.enzyme ? [c.enzyme] : [])))].map((k) => ENZYMES.find((e) => e.kind === k) as (typeof ENZYMES)[number]);
    const letters = used.filter((e) => !e.name);
    const label = (k: Enzyme) => { const e = used.find((x) => x.kind === k) as (typeof ENZYMES)[number]; return `${e.name ?? `酵素 ${'ABCDEF'[letters.indexOf(e)]}`}（${e.spec}）`; };
    const clues: Clue[] = drafts.map((c) => ({ text: c.enzyme ? c.text.replace(ENZ, label(c.enzyme)) : c.text, check: c.check }));
    // 誤答は、手がかりを多く満たす（答えに近い）ものから選ぶ
    const score = new Map(all.map((s) => [s, clues.filter((c) => c.check(s)).length]));
    const others = shuffle(rng, all.filter((s) => sugarKey(s) !== key)).sort((p, q) => (score.get(q) as number) - (score.get(p) as number)).slice(0, 7);
    const mass = sugarMass(answer), ma = methylation(answer);
    const how = `考えられる構造は ${steps[0]} 通り。手がかりを順に当てはめると ${steps.join(' → ')} 通りに絞れる。`
      + ' メチル化分析では、結合に使われていた位置だけが –OH として残る：2,3,4,6-テトラは非還元末端、2,3,6-トリは 4 位で、2,3,4-トリは 6 位で結合していたグルコース。'
      + (n >= 4 ? ' 2,3-ジは 4 位と 6 位の両方で結合していた枝分かれのグルコースで、2,3,4,6-テトラの物質量は非還元末端の数に等しい（枝分かれが 1 か所あれば 2）。' : '')
      + (ma.some((k) => k.startsWith(FRU)) ? ' スクロース型で結合したフルクトースは五員環で、1,3,4,6 位がメチル化される。' : '')
      + (n <= 3 ? ' 還元性のもとになる炭素（グルコースとガラクトースの 1 位、フルクトースの 2 位）どうしで結合した糖は開環できないので、還元性を示さない。' : '')
      + ` 分子量の確認：180 × ${n} − 18 × ${n - 1} = ${mass}。答え：${sugarText(answer)}${NAMES[key] ? `（${NAMES[key]}）` : ''}。`;
    return { level, answer, text: stem(n, mass), clues, options: shuffle(rng, [answer, ...others]), how };
  }
  throw new Error('糖の問題を作れなかった');
}
