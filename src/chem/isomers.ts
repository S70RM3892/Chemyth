/**
 * 有機化合物の構造異性体を数え上げる。DOM に触れない純粋なロジック。
 *
 * 分子は「水素を省いた原子の木」で表す。環はベンゼン環だけを 1 個の節点として扱う。
 *   C  …… 炭素（原子価 4）      O  …… 酸素（原子価 2）
 *   N  …… 窒素（原子価 3。単独ならアンモニア NH3）
 *   Cl, Br …… ハロゲン（原子価 1）
 *   Ph …… フェニル基 C6H5–（原子価 1。単独ならベンゼン C6H6）
 *   Ar …… 二置換ベンゼン環 –C6H4–（原子価 2。o / m / p の位置をもつ）
 *   Tr …… 三置換ベンゼン環 C6H3（原子価 3。置換の型 123 / 124 / 135 をもち、
 *          どの置換基がどの位置にあるかは、結合の 4 番目の要素（位置番号）で表す。
 *          123 型は 2 が中央で 1 と 3 は同等。124 型は 1 が「2 の隣で 4 の向かい」の位置。
 *          135 型は 3 つとも同等なので位置番号は要らない）
 * 結合は単結合か二重結合。二重結合は C=C と C=O だけ。
 *
 * 数え上げる範囲（高校化学の範囲にしぼるための規則）
 *  1. 不飽和度を分子式から求める。ベンゼン環 1 個で 4。残りは二重結合の数で、
 *     0〜2 でなければ対象外（空の配列を返す）。環は 2 個まで、Ar と Tr は合わせて 1 個まで。
 *     四置換以上のベンゼン、ベンゼン以外の環（シクロアルカンなど）、三重結合は扱わない。
 *  2. Ar・Tr を取り除いてできる各部分（なければ分子全体）について、
 *     官能基は 1 個まで。官能基として数えるのは
 *       C=C、C=O（アルデヒド・ケトン）、–OH、エーテル結合 –O–、–COOH、–COO–、
 *       アミンの N、アミド結合 –CO–N<。
 *     したがって鎖式化合物は単官能だけ（ジオール・ヒドロキシ酸・不飽和アルコールは対象外）。
 *     例外は 2 つ。
 *       ・アミノ酸：アミンの N 1 個と –COOH 1 個は同じ部分に同居できる。
 *         N は第一級に限らない（N-メチルグリシンも aminoacid に分類する。級数は props.grade）。
 *         アミノ酸のエステルやヒドロキシアミドは対象外。
 *       ・Ar・Tr は置換基ごとに 1 個ずつ官能基をもてる（サリチル酸、フタル酸、クレゾールなど）。
 *  3. 1 個の炭素に O が 2 個つくのは、=O と –O– の組（カルボン酸・エステル）だけ。
 *     1 個の炭素につく N は 1 個までで、N と単結合の O は同じ炭素につかない。
 *     O–O、N–N、N–O、エノール、エナミン、ビニルエーテル、gem-ジオール、アセタール、
 *     酸無水物、炭酸エステル、尿素、カルバミン酸、ニトロ化合物は規則 2・3 から除かれる。
 *  4. ハロゲンは C=C やベンゼン環とは同居できるが、同じ部分に O や N があるものは除く。
 * 立体異性体は別の項目にせず、chiral と cisTrans で知らせる。
 */

export type Atom = 'C' | 'O' | 'N' | 'Cl' | 'Br' | 'Ph' | 'Ar' | 'Tr';
export type Pos = 'o' | 'm' | 'p';
/** 三置換ベンゼンの置換の型 */
export type Pattern = '123' | '124' | '135';
/** [原子, 原子, 結合次数, Tr につく結合ならその位置番号] */
export type Bond = [number, number, 1 | 2, number?];
/** pos は Ar なら o / m / p、Tr なら 123 / 124 / 135。原子の順序は自由 */
export interface Mol { atoms: Atom[]; pos?: (Pos | Pattern | undefined)[]; bonds: Bond[] }
/** 'aromatic' は芳香族炭化水素。官能基をもつ芳香族化合物は官能基で分類する。phenol は環に直接ついた OH */
export type IsoClass = 'alkane' | 'alkene' | 'halide' | 'alcohol' | 'ether' | 'aldehyde' | 'ketone' | 'acid' | 'ester' | 'phenol' | 'aromatic'
  | 'amine' | 'amide' | 'aminoacid';
/** 分子式。環の炭素も数える（Ph = C6H5、Ar = C6H4） */
export interface Spec { c: number; h: number; o?: number; n?: number; cl?: number; br?: number }

export interface Props {
  /** 金属 Na と反応して H2 を出す */
  na: boolean;
  /** NaHCO3 水溶液と反応して CO2 を出す */
  nahco3: boolean;
  /** NaOH 水溶液と中和して溶ける */
  naoh: boolean;
  /** 塩化鉄(III) で呈色 */
  fecl3: boolean;
  /** 銀鏡反応 */
  silver: boolean;
  /** ヨードホルム反応（化合物そのもの。エステルの加水分解後は考えない） */
  iodoform: boolean;
  /** 臭素が付加する（C=C） */
  br2: boolean;
  /** 希塩酸に塩をつくって溶ける（アミン、アミノ酸） */
  basic: boolean;
  /** さらし粉水溶液で呈色する（ベンゼン環に直接ついた –NH2） */
  bleach: boolean;
  /** アルコールの級数。アルコールでなければ、アミン・アミノ酸の N に結合した炭素の数 */
  grade?: 1 | 2 | 3;
  /** アミノ酸で、N が –COOH の隣の炭素についている（α-アミノ酸） */
  alpha?: boolean;
  /** アルコールを穏やかに酸化したときの生成物 */
  oxid?: 'aldehyde' | 'ketone' | 'none';
  /** 酸化生成物の key。アルコール → アルデヒド・ケトン、アルデヒド → カルボン酸 */
  oxidTo?: string;
  /** アルコールの分子内脱水で生じるアルケンの key（構造異性体として） */
  dehydration?: string[];
  /** 加水分解の生成物の key。エステルなら酸とアルコール（またはフェノール類）。
   *  アミドなら酸とアミンで、alcohol は '' にして amine に入れる（アンモニアの key は 'N'） */
  hydrolysis?: { acid: string; alcohol: string; amine?: string };
  /** アルケンのオゾン分解で得られるカルボニル化合物の key（重複は除く） */
  ozonolysis?: string[];
  /** アルケンへの水の付加で考えられるアルコールの key */
  hydration?: string[];
  /** 側鎖を KMnO4 で酸化して得られるカルボン酸の key */
  sideOxid?: string;
}

export interface Isomer {
  mol: Mol;
  /** 構造異性体ごとに一意な正準文字列 */
  key: string;
  cls: IsoClass;
  /** 示性式（ASCII）。pretty() に通せる */
  formula: string;
  /** 名称。つけられないときは '' */
  name: string;
  /** 不斉炭素原子の数 */
  chiral: number;
  /** シス-トランス異性体が存在する C=C をもつ */
  cisTrans: boolean;
  props: Props;
}

export const CLASS_ORDER: IsoClass[] = ['alkane', 'alkene', 'halide', 'alcohol', 'ether', 'aldehyde', 'ketone', 'acid', 'ester', 'phenol', 'aromatic', 'amine', 'amide', 'aminoacid'];

const VAL: Record<Atom, number> = { C: 4, O: 2, N: 3, Cl: 1, Br: 1, Ph: 1, Ar: 2, Tr: 3 };
const ATOMS: Atom[] = ['C', 'O', 'N', 'Cl', 'Br', 'Ph', 'Ar', 'Tr'];
const isHal = (a: Atom): boolean => a === 'Cl' || a === 'Br';
const isRing = (a: Atom): boolean => a === 'Ph' || a === 'Ar' || a === 'Tr';
/** 置換基を 2 個以上もつ環 */
const isHub = (a: Atom): boolean => a === 'Ar' || a === 'Tr';
/** 数え上げる節点数の上限（暴走を防ぐ） */
const MAX_NODES = 12;

interface Nb { to: number; order: 1 | 2; slot?: number }
type Adj = Nb[][];

function adjOf(mol: Mol): Adj {
  const adj: Adj = mol.atoms.map(() => []);
  for (const [a, b, o, slot] of mol.bonds) {
    if (!adj[a] || !adj[b]) continue;
    adj[a].push({ to: b, order: o, slot });
    adj[b].push({ to: a, order: o, slot });
  }
  return adj;
}

// ---------------------------------------------------------------- 正準形

const label = (mol: Mol, i: number): string => (isHub(mol.atoms[i]) ? mol.atoms[i] + (mol.pos?.[i] ?? '?') : mol.atoms[i]);

/** Tr につく結合の位置番号をそろえる。123 型の両端は 1、135 型は区別しない（0） */
function slotOf(mol: Mol, i: number, nb: Nb): number {
  const ring = mol.atoms[i] === 'Tr' ? i : mol.atoms[nb.to] === 'Tr' ? nb.to : -1;
  if (ring < 0) return 0;
  const pat = mol.pos?.[ring];
  if (pat === '123') return nb.slot === 2 ? 2 : 1;
  if (pat === '124') return nb.slot ?? 0;
  return 0;
}

/** i を根とし from の側を除いた部分木の文字列。子は文字列順に並べる */
function rootStr(mol: Mol, adj: Adj, i: number, from: number): string {
  const kids: string[] = [];
  for (const nb of adj[i]) {
    if (nb.to !== from) kids.push('(' + (slotOf(mol, i, nb) || '') + (nb.order === 2 ? '=' : '') + rootStr(mol, adj, nb.to, i) + ')');
  }
  kids.sort();
  return label(mol, i) + kids.join('');
}

/** 木の中心（1 個か 2 個） */
function centres(adj: Adj): number[] {
  const deg = adj.map((a) => a.length);
  const gone = adj.map(() => false);
  let leaves: number[] = [];
  for (let i = 0; i < adj.length; i++) if (deg[i] <= 1) leaves.push(i);
  let left = adj.length;
  while (left > 2) {
    const next: number[] = [];
    for (const l of leaves) {
      gone[l] = true;
      left--;
      for (const nb of adj[l]) if (!gone[nb.to] && --deg[nb.to] === 1) next.push(nb.to);
    }
    leaves = next;
  }
  return leaves;
}

/** 連結で閉路のない分子か */
function isTree(mol: Mol, adj: Adj): boolean {
  const n = mol.atoms.length;
  if (n === 0 || mol.bonds.length !== n - 1) return false;
  if (mol.bonds.some(([a, b]) => a === b || !(a >= 0 && a < n && b >= 0 && b < n))) return false;
  const seen = mol.atoms.map(() => false);
  const stack = [0];
  seen[0] = true;
  let cnt = 0;
  while (stack.length) {
    const i = stack.pop()!;
    cnt++;
    for (const nb of adj[i]) if (!seen[nb.to]) { seen[nb.to] = true; stack.push(nb.to); }
  }
  return cnt === n;
}

/**
 * 正準文字列。木の中心を根にして、子を整列して書く。同じ構造なら同じ文字列になる。
 * 原子や結合の順序は問わない。環ができているなど木でない分子には、どの key とも一致しない '#…' を返す
 */
export function canonical(mol: Mol): string {
  const adj = adjOf(mol);
  if (!isTree(mol, adj)) return '#' + mol.atoms.length + ':' + mol.bonds.length;
  let best = '';
  for (const c of centres(adj)) {
    const s = rootStr(mol, adj, c, -1);
    if (best === '' || s < best) best = s;
  }
  return best;
}

/** canonical() の書式を分子に戻す。子の順序は問わない。読めなければ undefined */
export function parseKey(key: string): Mol | undefined {
  const atoms: Atom[] = [];
  const pos: (Pos | Pattern | undefined)[] = [];
  const bonds: Bond[] = [];
  let i = 0;
  let hasAr = false;
  const node = (): number => {
    let a: Atom;
    let p: Pos | Pattern | undefined;
    if (key.startsWith('Cl', i)) { a = 'Cl'; i += 2; }
    else if (key.startsWith('Br', i)) { a = 'Br'; i += 2; }
    else if (key.startsWith('Ph', i)) { a = 'Ph'; i += 2; }
    else if (key.startsWith('Ar', i)) {
      a = 'Ar'; i += 2; hasAr = true;
      const ch = key[i];
      if (ch !== 'o' && ch !== 'm' && ch !== 'p') throw new Error('pos');
      p = ch; i++;
    }
    else if (key.startsWith('Tr', i)) {
      a = 'Tr'; i += 2; hasAr = true;
      const pat = key.slice(i, i + 3);
      if (pat !== '123' && pat !== '124' && pat !== '135') throw new Error('pattern');
      p = pat; i += 3;
    }
    else if (key[i] === 'N') { a = 'N'; i++; }
    else if (key[i] === 'C') { a = 'C'; i++; }
    else if (key[i] === 'O') { a = 'O'; i++; }
    else throw new Error('atom');
    const id = atoms.length;
    atoms.push(a);
    pos.push(p);
    while (key[i] === '(') {
      i++;
      let slot: number | undefined;
      if (/[1-4]/.test(key[i] || '')) { slot = +key[i]; i++; }
      let order: 1 | 2 = 1;
      if (key[i] === '=') { order = 2; i++; }
      const c = node();
      if (key[i] !== ')') throw new Error('paren');
      i++;
      bonds.push(slot ? [id, c, order, slot] : [id, c, order]);
    }
    return id;
  };
  try {
    node();
    if (i !== key.length) return undefined;
  } catch {
    return undefined;
  }
  return hasAr ? { atoms, pos, bonds } : { atoms, bonds };
}

// ---------------------------------------------------------------- 基本量

interface Info { mol: Mol; adj: Adj; h: number[] }

function hOf(mol: Mol, adj: Adj): number[] {
  return mol.atoms.map((a, i) => {
    const s = adj[i].reduce((t, nb) => t + nb.order, 0);
    if (a === 'C') return 4 - s;
    if (a === 'O') return 2 - s;
    if (a === 'N') return 3 - s;
    if (isRing(a)) return 6 - s;
    return 1 - s;
  });
}

const infoOf = (mol: Mol): Info => {
  const adj = adjOf(mol);
  return { mol, adj, h: hOf(mol, adj) };
};

/** 分子の分子式 */
export function specOf(mol: Mol): Spec {
  const adj = adjOf(mol);
  const h = hOf(mol, adj);
  const out = { c: 0, h: 0, o: 0, n: 0, cl: 0, br: 0 };
  mol.atoms.forEach((a, i) => {
    if (a === 'C') out.c++;
    else if (a === 'O') out.o++;
    else if (a === 'N') out.n++;
    else if (a === 'Cl') out.cl++;
    else if (a === 'Br') out.br++;
    else out.c += 6;
    if (!isHal(a)) out.h += h[i];
  });
  return out;
}

const el = (sym: string, n: number | undefined): string => (n ? sym + (n > 1 ? n : '') : '');

/** 分子式の文字列。C、H のあとはアルファベット順（'C5H12O'、'C4H9Cl'） */
export function specText(spec: Spec): string {
  return el('C', spec.c) + el('H', spec.h) + el('Br', spec.br) + el('Cl', spec.cl) + el('N', spec.n) + el('O', spec.o);
}

/** Ar・Tr を取り除いたときの連結成分。各成分は節点番号の配列 */
function parts(mol: Mol, adj: Adj): number[][] {
  const seen = mol.atoms.map(isHub);
  const out: number[][] = [];
  for (let s = 0; s < mol.atoms.length; s++) {
    if (seen[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = true;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      for (const nb of adj[i]) if (!seen[nb.to]) { seen[nb.to] = true; stack.push(nb.to); }
    }
    out.push(comp);
  }
  return out;
}

const hasDblO = (mol: Mol, adj: Adj, i: number): boolean => mol.atoms[i] === 'C' && adj[i].some((nb) => nb.order === 2 && mol.atoms[nb.to] === 'O');

/** 完成した分子として規則を満たすか */
export function isValid(mol: Mol): boolean {
  const n = mol.atoms.length;
  const adj = adjOf(mol);
  const at = mol.atoms;
  if (!isTree(mol, adj)) return false;
  if (n === 1 && at[0] === 'N') return true; // アンモニア
  // 原子価
  let nAr = 0;
  let skeleton = 0;
  for (let i = 0; i < n; i++) {
    const s = adj[i].reduce((t, nb) => t + nb.order, 0);
    const a = at[i];
    if (s > VAL[a]) return false;
    if (a === 'Ar') {
      const p = mol.pos?.[i];
      if (adj[i].length !== 2 || s !== 2 || (p !== 'o' && p !== 'm' && p !== 'p')) return false;
      nAr++;
    }
    if (a === 'Tr') {
      const p = mol.pos?.[i];
      if (adj[i].length !== 3 || s !== 3) return false;
      const slots = adj[i].map((nb) => nb.slot ?? 0).sort((x, y) => x - y);
      if (p === '123') { if (slots.filter((x) => x === 2).length !== 1 || slots.some((x) => x !== 1 && x !== 2 && x !== 3)) return false; }
      else if (p === '124') { if (slots.join() !== '1,2,4') return false; }
      else if (p !== '135') return false;
      nAr++;
    }
    if (isHal(a) && s !== 1) return false;
    if (a !== 'O' && a !== 'N' && !isHal(a)) skeleton++;
  }
  if (nAr > 1 || skeleton === 0) return false;
  // 結合の種類
  for (const [a, b, o] of mol.bonds) {
    const A = at[a], B = at[b];
    if (o === 2 && !((A === 'C' && B === 'C') || (A === 'C' && B === 'O') || (A === 'O' && B === 'C'))) return false;
    const hetero = (x: Atom): boolean => x === 'O' || x === 'N';
    if (hetero(A) && hetero(B)) return false;
    if ((isHal(A) && (hetero(B) || isHal(B))) || (isHal(B) && hetero(A))) return false;
  }
  // 1 個の炭素に O が 2 個つくのは =O と –O– の組だけ
  for (let i = 0; i < n; i++) {
    if (at[i] !== 'C') continue;
    const os = adj[i].filter((nb) => at[nb.to] === 'O');
    if (os.length > 2) return false;
    if (os.length === 2 && os.filter((nb) => nb.order === 2).length !== 1) return false;
    // N は 1 個まで。N と単結合の O は同じ炭素につかない
    const ns = adj[i].filter((nb) => at[nb.to] === 'N').length;
    if (ns > 1 || (ns === 1 && os.some((nb) => nb.order === 1))) return false;
  }
  // 部分ごとに官能基は 1 個まで（アミノ酸だけは N と –COOH が同居できる）
  for (const comp of parts(mol, adj)) {
    let cc = 0, co = 0, freeO = 0, freeN = 0, cooh = 0;
    let hal = false;
    let hetero = false;
    for (const i of comp) {
      const a = at[i];
      if (isHal(a)) hal = true;
      if (a === 'O') {
        hetero = true;
        if (adj[i].some((nb) => nb.order === 2)) co++; // C=O
        else if (!adj[i].some((nb) => hasDblO(mol, adj, nb.to))) freeO++; // –OH、エーテル
        else if (adj[i].length === 1) cooh++;
      }
      if (a === 'N') {
        hetero = true;
        if (!adj[i].some((nb) => hasDblO(mol, adj, nb.to))) freeN++; // アミン（アミドの N は C=O と合わせて 1 個）
      }
      if (a === 'C') for (const nb of adj[i]) if (nb.order === 2 && at[nb.to] === 'C' && nb.to > i) cc++;
    }
    const units = cc + co + freeO + freeN;
    const aminoAcid = units === 2 && co === 1 && cooh === 1 && freeN === 1;
    if ((units > 1 && !aminoAcid) || (hal && hetero)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- 数え上げ

function sumOrders(adj: Adj, i: number): number {
  return adj[i].reduce((t, nb) => t + nb.order, 0);
}

/** Tr の 3 本の結合への位置番号の振り方（重複は正準文字列で除く） */
const TR_PLACES: { p: Pattern; slots: number[] }[] = [
  { p: '123', slots: [2, 1, 1] }, { p: '123', slots: [1, 2, 1] }, { p: '123', slots: [1, 1, 2] },
  { p: '124', slots: [1, 2, 4] }, { p: '124', slots: [1, 4, 2] }, { p: '124', slots: [2, 1, 4] },
  { p: '124', slots: [2, 4, 1] }, { p: '124', slots: [4, 1, 2] }, { p: '124', slots: [4, 2, 1] },
  { p: '135', slots: [0, 0, 0] },
];

/** 節点を 1 個ずつ葉として付け足し、正準文字列で重複を除く */
function grow(counts: Record<Atom, number>, dbl: number): Mol[] {
  const total = ATOMS.reduce((t, a) => t + counts[a], 0);
  interface St { mol: Mol; left: Record<Atom, number>; dbl: number }
  let level = new Map<string, St>();
  for (const a of ATOMS) {
    if (counts[a] <= 0) continue;
    const left = { ...counts };
    left[a]--;
    const mol: Mol = { atoms: [a], pos: [undefined], bonds: [] };
    level.set(canonical(mol), { mol, left, dbl: 0 });
  }
  for (let k = 1; k < total; k++) {
    const next = new Map<string, St>();
    for (const st of level.values()) {
      const { mol } = st;
      const adj = adjOf(mol);
      for (let i = 0; i < k; i++) {
        const a = mol.atoms[i];
        const free = VAL[a] - sumOrders(adj, i);
        if (free <= 0) continue;
        for (const t of ATOMS) {
          if (st.left[t] <= 0) continue;
          const hetA = a === 'O' || a === 'N', hetT = t === 'O' || t === 'N';
          if (hetA && hetT) continue;
          if ((isHal(a) && (hetT || isHal(t))) || (hetA && isHal(t))) continue;
          if (VAL[a] === 1 && VAL[t] === 1 && total !== 2) continue;
          for (const order of [1, 2] as const) {
            if (order === 2) {
              if (free < 2 || st.dbl >= dbl) continue;
              if (!((a === 'C' && (t === 'C' || t === 'O')) || (a === 'O' && t === 'C'))) continue;
            }
            // 1 個の炭素に O が 2 個つくなら =O と –O– の組
            if (a === 'C' && t === 'O') {
              const os = adj[i].filter((nb) => mol.atoms[nb.to] === 'O');
              if (os.length >= 2) continue;
              if (os.length === 1 && (os[0].order === 2) === (order === 2)) continue;
              if (order === 1 && adj[i].some((nb) => mol.atoms[nb.to] === 'N')) continue;
            }
            if (a === 'C' && t === 'N' && adj[i].some((nb) => mol.atoms[nb.to] === 'N' || (mol.atoms[nb.to] === 'O' && nb.order === 1))) continue;
            // 環が最後の置換基を得るとき、位置の決め方をすべて試す
            const places: { p?: Pos | Pattern; slots?: number[] }[] =
              a === 'Ar' && adj[i].length === 1 ? [{ p: 'o' }, { p: 'm' }, { p: 'p' }]
                : a === 'Tr' && adj[i].length === 2 ? TR_PLACES
                  : [{}];
            for (const { p, slots } of places) {
              const pos = mol.pos!.slice();
              if (p) pos[i] = p;
              pos.push(undefined);
              const bonds: Bond[] = [...mol.bonds, [i, k, order]];
              if (slots) {
                let q = 0;
                bonds.forEach((b, bi) => { if (b[0] === i || b[1] === i) bonds[bi] = [b[0], b[1], b[2], slots[q++]]; });
              }
              const grown: Mol = { atoms: [...mol.atoms, t], pos, bonds };
              const key = canonical(grown);
              if (next.has(key)) continue;
              const left = { ...st.left };
              left[t]--;
              next.set(key, { mol: grown, left, dbl: st.dbl + (order === 2 ? 1 : 0) });
            }
          }
        }
      }
    }
    level = next;
  }
  const out: Mol[] = [];
  for (const st of level.values()) if (st.dbl === dbl && isValid(st.mol)) out.push(st.mol);
  return out;
}

// ---------------------------------------------------------------- 分子の加工

function clone(mol: Mol): Mol {
  return {
    atoms: mol.atoms.slice(),
    pos: mol.atoms.map((_, i) => mol.pos?.[i]),
    bonds: mol.bonds.map((b) => [b[0], b[1], b[2], b[3]] as Bond),
  };
}

/** keep に含まれる節点だけを残す。map は旧番号 → 新番号 */
function sub(mol: Mol, keep: Set<number>): { mol: Mol; map: Map<number, number> } {
  const map = new Map<number, number>();
  const atoms: Atom[] = [];
  const pos: (Pos | Pattern | undefined)[] = [];
  mol.atoms.forEach((a, i) => {
    if (!keep.has(i)) return;
    map.set(i, atoms.length);
    atoms.push(a);
    pos.push(mol.pos?.[i]);
  });
  const bonds: Bond[] = [];
  for (const [a, b, o, slot] of mol.bonds) if (keep.has(a) && keep.has(b)) bonds.push([map.get(a)!, map.get(b)!, o, slot]);
  return { mol: { atoms, pos, bonds }, map };
}

/** start から block を通らずに届く節点 */
function sideOf(adj: Adj, start: number, block: number): Set<number> {
  const out = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    for (const nb of adj[i]) if (nb.to !== block && !out.has(nb.to)) { out.add(nb.to); stack.push(nb.to); }
  }
  return out;
}

function addAtom(mol: Mol, a: Atom, to: number, order: 1 | 2, slot?: number): number {
  const id = mol.atoms.length;
  mol.atoms.push(a);
  if (mol.pos) mol.pos.push(undefined);
  mol.bonds.push([to, id, order, slot]);
  return id;
}

function setOrder(mol: Mol, a: number, b: number, order: 1 | 2): void {
  for (const bd of mol.bonds) if ((bd[0] === a && bd[1] === b) || (bd[0] === b && bd[1] === a)) bd[2] = order;
}

const tryKey = (mol: Mol): string | undefined => (isValid(mol) ? canonical(mol) : undefined);

// ---------------------------------------------------------------- 官能基

interface Groups {
  /** –COOH の O（H をもつ側） */
  carboxylOH: number[];
  /** 環に直接ついた –OH の O */
  phenolOH: number[];
  /** 飽和炭素についた –OH の O */
  alcoholOH: number[];
  /** エステル結合の –O– */
  esterO: number[];
  etherO: number[];
  /** アルデヒド・ケトンの C=O の炭素 */
  carbonylC: number[];
  /** そのうち H をもつもの */
  aldehydeC: number[];
  /** C=C */
  cc: [number, number][];
  hal: number[];
  ring: number[];
  /** アミンの N（C=O の隣でないもの） */
  amineN: number[];
  /** アミド結合の N */
  amideN: number[];
}

function groupsOf(I: Info): Groups {
  const { mol, adj, h } = I;
  const at = mol.atoms;
  const g: Groups = { carboxylOH: [], phenolOH: [], alcoholOH: [], esterO: [], etherO: [], carbonylC: [], aldehydeC: [], cc: [], hal: [], ring: [], amineN: [], amideN: [] };
  at.forEach((a, i) => {
    if (isHal(a)) g.hal.push(i);
    else if (isRing(a)) g.ring.push(i);
    else if (a === 'N') (adj[i].some((nb) => hasDblO(mol, adj, nb.to)) ? g.amideN : g.amineN).push(i);
    else if (a === 'O') {
      if (adj[i].some((nb) => nb.order === 2)) return;
      if (adj[i].length === 1) {
        const c = adj[i][0].to;
        if (isRing(at[c])) g.phenolOH.push(i);
        else if (hasDblO(mol, adj, c)) g.carboxylOH.push(i);
        else g.alcoholOH.push(i);
      } else if (adj[i].length === 2) {
        if (adj[i].some((nb) => hasDblO(mol, adj, nb.to))) g.esterO.push(i);
        else g.etherO.push(i);
      }
    } else if (a === 'C') {
      for (const nb of adj[i]) if (nb.order === 2 && at[nb.to] === 'C' && nb.to > i) g.cc.push([i, nb.to]);
      if (hasDblO(mol, adj, i) && !adj[i].some((nb) => nb.order === 1 && (at[nb.to] === 'O' || at[nb.to] === 'N'))) {
        g.carbonylC.push(i);
        if (h[i] >= 1) g.aldehydeC.push(i);
      }
    }
  });
  return g;
}

function classOf(g: Groups): IsoClass {
  if (g.carboxylOH.length && g.amineN.length) return 'aminoacid';
  if (g.carboxylOH.length) return 'acid';
  if (g.esterO.length) return 'ester';
  if (g.amideN.length) return 'amide';
  if (g.aldehydeC.length) return 'aldehyde';
  if (g.carbonylC.length) return 'ketone';
  if (g.phenolOH.length) return 'phenol';
  if (g.alcoholOH.length) return 'alcohol';
  if (g.etherO.length) return 'ether';
  if (g.amineN.length) return 'amine';
  if (g.hal.length) return 'halide';
  if (g.ring.length) return 'aromatic';
  if (g.cc.length) return 'alkene';
  return 'alkane';
}

// ---------------------------------------------------------------- 立体

function chiralOf(I: Info): number {
  const { mol, adj, h } = I;
  let n = 0;
  mol.atoms.forEach((a, i) => {
    if (a !== 'C' || h[i] >= 2 || adj[i].some((nb) => nb.order === 2)) return;
    const subs = adj[i].map((nb) => rootStr(mol, adj, nb.to, i));
    if (h[i] === 1) subs.push('H');
    if (subs.length === 4 && new Set(subs).size === 4) n++;
  });
  return n;
}

/** シス-トランス異性体が存在する C=C の数 */
function cisTransOf(I: Info, g: Groups): number {
  const { mol, adj, h } = I;
  const two = (x: number, partner: number): boolean => {
    const subs = adj[x].filter((nb) => nb.to !== partner).map((nb) => rootStr(mol, adj, nb.to, x));
    for (let k = 0; k < h[x]; k++) subs.push('H');
    return subs.length === 2 && subs[0] !== subs[1];
  };
  return g.cc.filter(([a, b]) => two(a, b) && two(b, a)).length;
}

// ---------------------------------------------------------------- 性質

const carbonLike = (a: Atom): boolean => a === 'C' || isRing(a);

function propsOf(I: Info, g: Groups): Props {
  const { mol, adj, h } = I;
  const at = mol.atoms;
  const isMethyl = (i: number): boolean => at[i] === 'C' && h[i] === 3;
  const p: Props = {
    na: g.carboxylOH.length + g.phenolOH.length + g.alcoholOH.length > 0,
    nahco3: g.carboxylOH.length > 0,
    naoh: g.carboxylOH.length + g.phenolOH.length > 0,
    fecl3: g.phenolOH.length > 0,
    silver: at.some((_, i) => hasDblO(mol, adj, i) && h[i] >= 1 && !adj[i].some((nb) => at[nb.to] === 'N')),
    iodoform: false,
    br2: g.cc.length > 0,
    basic: g.amineN.length > 0,
    bleach: g.amineN.some((n) => adj[n].length === 1 && isRing(at[adj[n][0].to])),
  };
  // ヨードホルム反応：CH3CH(OH)–R、CH3CO–R（R は H か炭素）
  for (const o of g.alcoholOH) {
    const c = adj[o][0].to;
    if (h[c] >= 1 && adj[c].some((nb) => isMethyl(nb.to))) p.iodoform = true;
  }
  for (const c of g.carbonylC) if (adj[c].some((nb) => isMethyl(nb.to))) p.iodoform = true;

  // アルコール（アルコール性の OH がちょうど 1 個）
  if (g.alcoholOH.length === 1) {
    const o = g.alcoholOH[0];
    const c = adj[o][0].to;
    const nc = adj[c].filter((nb) => carbonLike(at[nb.to])).length;
    p.grade = nc <= 1 ? 1 : nc === 2 ? 2 : 3;
    p.oxid = p.grade === 1 ? 'aldehyde' : p.grade === 2 ? 'ketone' : 'none';
    if (p.grade !== 3) {
      const m = clone(mol);
      setOrder(m, c, o, 2);
      const k = tryKey(m);
      if (k) p.oxidTo = k;
    }
    const keys = new Set<string>();
    for (const nb of adj[c]) {
      const b = nb.to;
      if (at[b] !== 'C' || nb.order !== 1 || h[b] < 1) continue;
      const m = clone(mol);
      setOrder(m, c, b, 2);
      const keep = new Set(at.map((_, i) => i));
      keep.delete(o);
      const k = tryKey(sub(m, keep).mol);
      if (k) keys.add(k);
    }
    p.dehydration = [...keys].sort();
  } else if (g.alcoholOH.length === 0 && g.aldehydeC.length === 1) {
    // アルデヒド → カルボン酸
    const m = clone(mol);
    addAtom(m, 'O', g.aldehydeC[0], 1);
    const k = tryKey(m);
    if (k) p.oxidTo = k;
  }

  // アミン・アミノ酸（アミンの N がちょうど 1 個）
  if (g.alcoholOH.length === 0 && g.amineN.length === 1) {
    const n = g.amineN[0];
    const nc = adj[n].filter((nb) => carbonLike(at[nb.to])).length;
    if (nc >= 1) p.grade = nc as 1 | 2 | 3;
    if (g.carboxylOH.length === 1) {
      const acyl = adj[g.carboxylOH[0]][0].to;
      p.alpha = adj[n].some((nb) => at[nb.to] === 'C' && adj[nb.to].some((x) => x.to === acyl));
    }
  }

  // アミド（アミド結合がちょうど 1 個）
  if (g.esterO.length === 0 && g.amideN.length === 1) {
    const n = g.amideN[0];
    const acyl = adj[n].find((nb) => hasDblO(mol, adj, nb.to))!.to;
    const a = sub(mol, sideOf(adj, acyl, n));
    addAtom(a.mol, 'O', a.map.get(acyl)!, 1);
    const acid = tryKey(a.mol);
    const amine = tryKey(sub(mol, sideOf(adj, n, acyl)).mol);
    if (acid && amine) p.hydrolysis = { acid, alcohol: '', amine };
  }

  // エステル（エステル結合がちょうど 1 個）
  if (g.esterO.length === 1 && g.amideN.length === 0) {
    const e = g.esterO[0];
    const acyl = adj[e].find((nb) => hasDblO(mol, adj, nb.to))!.to;
    const a = sub(mol, sideOf(adj, acyl, e));
    addAtom(a.mol, 'O', a.map.get(acyl)!, 1);
    const acid = tryKey(a.mol);
    const alcohol = tryKey(sub(mol, sideOf(adj, e, acyl)).mol);
    if (acid && alcohol) p.hydrolysis = { acid, alcohol };
  }

  // アルケン（C=C がちょうど 1 個）
  if (g.cc.length === 1) {
    const [a, b] = g.cc[0];
    const oz: string[] = [];
    for (const [x, y] of [[a, b], [b, a]]) {
      const s = sub(mol, sideOf(adj, x, y));
      addAtom(s.mol, 'O', s.map.get(x)!, 2);
      const k = tryKey(s.mol);
      if (k) oz.push(k);
    }
    if (oz.length === 2) p.ozonolysis = [...new Set(oz)].sort();
    const hy: string[] = [];
    for (const x of [a, b]) {
      const m = clone(mol);
      setOrder(m, a, b, 1);
      addAtom(m, 'O', x, 1);
      const k = tryKey(m);
      if (k) hy.push(k);
    }
    if (hy.length === 2) p.hydration = [...new Set(hy)].sort();
  }

  // 側鎖の酸化（環が 1 個で、側鎖が炭化水素基・–COOH・ハロゲンだけのとき）
  if (g.ring.length === 1) {
    const r = g.ring[0];
    const m: Mol = { atoms: [at[r]], pos: [mol.pos?.[r]], bonds: [] }; // 環と位置はそのまま
    let changed = 0;
    let ok = true;
    for (const nb of adj[r]) {
      const s = nb.to;
      const side = [...sideOf(adj, s, r)];
      if (isHal(at[s])) {
        addAtom(m, at[s], 0, 1, nb.slot);
        continue;
      }
      const isCooh = at[s] === 'C' && side.length === 3 && hasDblO(mol, adj, s) && adj[s].some((x) => g.carboxylOH.includes(x.to));
      const isAlkyl = at[s] === 'C' && h[s] >= 1 && side.every((i) => at[i] === 'C');
      if (!isCooh && !isAlkyl) { ok = false; break; }
      if (isAlkyl) changed++;
      const c = addAtom(m, 'C', 0, 1, nb.slot);
      addAtom(m, 'O', c, 2);
      addAtom(m, 'O', c, 1);
    }
    if (ok && changed > 0) {
      const k = tryKey(m);
      if (k) p.sideOxid = k;
    }
  }
  return p;
}

// ---------------------------------------------------------------- 示性式

/** s は文字列、pen は減点、par は括弧に入れた枝の大きさ（小さい枝を括弧に入れる方を選ぶ） */
interface W { s: string; pen: number; par: number }

const lighter = (a: W, b: W): boolean =>
  a.pen !== b.pen ? a.pen < b.pen : a.par !== b.par ? a.par < b.par : a.s.length !== b.s.length ? a.s.length < b.s.length : a.s < b.s;

/** 環の位置番号は全角数字で書く（pretty() は半角数字を下付きにするため） */
const LOCANTS: Record<string, string> = { '123': '１,２,３-', '124': '１,２,４-', '135': '１,３,５-' };

/**
 * 示性式を書く。Ar があれば 'o-C6H4(X)Y'、Tr があれば '１,２,４-C6H3(X)(Y)Z'（位置番号の順に置換基を並べる）、
 * なければ端から端へ主鎖をたどる。
 * 書き方の候補をすべて作り、減点（慣用から外れる書き方）→ 括弧の中の小ささ → 短さ → 特徴の早さ の順で選ぶ。
 */
function formulaOf(I: Info): string {
  const { mol, adj, h } = I;
  const at = mol.atoms;
  const dblO = (nb: Nb): boolean => nb.order === 2 && at[nb.to] === 'O';
  const carbonyl = (i: number): boolean => hasDblO(mol, adj, i);
  const hStr = (n: number): string => (n <= 0 ? '' : n === 1 ? 'H' : 'H' + n);
  const halStr = (i: number): string => {
    let s = '';
    for (const x of ['Br', 'Cl'] as const) {
      const n = adj[i].filter((nb) => at[nb.to] === x).length;
      if (n) s += x + (n > 1 ? n : '');
    }
    return s;
  };
  /** 鎖として書く相手（=O とハロゲンは炭素の飾りとして書くので除く） */
  const kidsOf = (i: number, from: number, skip?: Set<number>): Nb[] =>
    adj[i].filter((nb) => nb.to !== from && !(skip && skip.has(nb.to)) && !dblO(nb) && !isHal(at[nb.to]));
  const isMethyl = (i: number): boolean => at[i] === 'C' && h[i] === 3 && adj[i].length === 1;
  const memo = new Map<string, W>();

  /** 左側（from）につながる基として i 以下を書く */
  const right = (i: number, from: number): W => {
    const id = i + ',' + from;
    const hit = memo.get(id);
    if (hit) return hit;
    const a = at[i];
    let w: W;
    if (isHal(a)) w = { s: a, pen: 0, par: 0 };
    else if (a === 'Ph') w = { s: 'C6H5', pen: 0, par: 0 };
    else if (a === 'O') {
      const k = adj[i].filter((nb) => nb.to !== from);
      if (!k.length) w = { s: 'OH', pen: 0, par: 0 };
      else {
        const r = right(k[0].to, i);
        w = { s: 'O' + r.s, pen: r.pen, par: r.par };
      }
    } else if (a === 'N') w = writeN(i, from);
    else w = writeC(i, from);
    memo.set(id, w);
    return w;
  };

  /** core（'CH'、'NH' など）のあとに枝と続きを書く。どれを続きにするかを総当たりする */
  const branchy = (i: number, core: string, kids: Nb[]): W => {
    let best: W | undefined;
    const conts: (Nb | undefined)[] = [undefined, ...kids];
    for (const cont of conts) {
      if (!cont && kids.length === 1) continue;
      let pen = 0;
      let par = 0;
      const groups = new Map<string, number>();
      for (const b of kids) {
        if (b === cont) continue;
        const r = right(b.to, i);
        // 二重結合の枝や、官能基を含む枝を括弧に入れる書き方は避ける
        pen += r.pen + (b.order === 2 ? 10 : 0) + (r.s !== 'OH' && r.s.includes('O') ? 1 : 0);
        const s = (b.order === 2 ? '=' : '') + r.s;
        if (!groups.has(s)) par += s.length + r.par;
        groups.set(s, (groups.get(s) || 0) + 1);
      }
      const names = [...groups.keys()].sort((x, y) => {
        const cx = x.startsWith('C') ? 0 : 1, cy = y.startsWith('C') ? 0 : 1;
        return cx !== cy ? cx - cy : x < y ? -1 : x > y ? 1 : 0;
      });
      let s = core;
      for (const nm of names) s += '(' + nm + ')' + (groups.get(nm)! > 1 ? groups.get(nm) : '');
      if (cont) {
        const r = right(cont.to, i);
        s += (cont.order === 2 ? '=' : '') + r.s;
        pen += r.pen;
        par += r.par;
        // 鎖の途中の炭素についた –OH・–NH2 は CH(OH)、CH(NH2) と書く
        if (at[i] === 'C' && h[i] === 1 && adj[cont.to].length === 1 && (at[cont.to] === 'O' || at[cont.to] === 'N')) pen += 1;
      }
      const w = { s, pen, par };
      if (!best || lighter(w, best)) best = w;
    }
    return best!;
  };

  const writeN = (i: number, from: number, skip?: Set<number>): W => {
    const kids = kidsOf(i, from, skip);
    if (from < 0 && !skip) {
      // 端の N から書くのは、ほかに端がないとき（H2NCH2COOH）
      if (!kids.length) return { s: 'NH3', pen: 0, par: 0 };
      const r = right(kids[0].to, i);
      return { s: 'H2N' + r.s, pen: r.pen + 1, par: r.par };
    }
    return branchy(i, 'N' + hStr(h[i]), kids);
  };

  const writeC = (i: number, from: number, skip?: Set<number>): W => {
    const kids = kidsOf(i, from, skip);
    if (carbonyl(i)) {
      if (from < 0) {
        if (kids.length === 0) return { s: 'HCHO', pen: 0, par: 0 };
        if (kids.length === 1) {
          const r = right(kids[0].to, i);
          if (at[kids[0].to] === 'O' || at[kids[0].to] === 'N') return { s: 'HCO' + r.s, pen: r.pen, par: r.par };
          return { s: 'OHC' + r.s, pen: r.pen + 10, par: r.par };
        }
      } else {
        // O の側から来たら R–O–CO–R' の向き。酸の側から書く方を優先する（アミドは少しだけ）
        const rev = at[from] === 'O' ? 10 : at[from] === 'N' ? 1 : 0;
        if (kids.length === 0) return { s: 'CHO', pen: rev, par: 0 };
        if (kids.length === 1) {
          const r = right(kids[0].to, i);
          return { s: 'CO' + r.s, pen: r.pen + rev, par: r.par };
        }
      }
      // ここには来ないはず。念のための書き方
      const rs = kids.map((k) => right(k.to, i));
      return { s: 'CO' + rs.map((r) => '(' + r.s + ')').join(''), pen: 20 + rs.reduce((t, r) => t + r.pen, 0), par: 0 };
    }
    const hal = halStr(i);
    if (from >= 0 && (at[from] === 'O' || at[from] === 'N' || isRing(at[from])) && h[i] === 2 && !hal && kids.length === 1 && kids[0].order === 1 && isMethyl(kids[0].to)) {
      return { s: 'C2H5', pen: 0, par: 0 };
    }
    return branchy(i, 'C' + hStr(h[i]) + hal, kids);
  };

  /** 環につく置換基を並べる順。値が大きいほど後ろ（主な官能基を最後に書く） */
  const rank = (n: number, ring: number): number => {
    if (at[n] === 'C' && carbonyl(n)) return 5;
    if (at[n] === 'O') return adj[n].length === 1 ? 4 : 3;
    if (at[n] === 'N') return 3.5;
    if (isHal(at[n])) return 2;
    return [...sideOf(adj, n, ring)].every((i) => at[i] === 'C' && adj[i].every((nb) => nb.order === 1)) ? 0 : 1;
  };

  // 二置換ベンゼン
  const ar = at.indexOf('Ar');
  if (ar >= 0) {
    const [n1, n2] = adj[ar].map((nb) => nb.to);
    const w1 = right(n1, ar).s, w2 = right(n2, ar).s;
    const head = (mol.pos?.[ar] ?? '') + '-C6H4';
    if (w1 === w2) return head + (isHal(at[n1]) ? w1 + '2' : '(' + w1 + ')2');
    const r1 = rank(n1, ar), r2 = rank(n2, ar);
    const first = r1 < r2 || (r1 === r2 && w1 < w2);
    return head + '(' + (first ? w1 : w2) + ')' + (first ? w2 : w1);
  }

  // 三置換ベンゼン。位置番号の順（123 型は端・中央・端、124 型は 1・2・4）に並べる
  const tr = at.indexOf('Tr');
  if (tr >= 0) {
    const pat = String(mol.pos?.[tr] ?? '');
    const items = adj[tr].map((nb) => ({ n: nb.to, slot: slotOf(mol, tr, nb), w: right(nb.to, tr).s }));
    const byRank = (x: { n: number; w: string }, y: { n: number; w: string }): number => rank(x.n, tr) - rank(y.n, tr) || (x.w < y.w ? -1 : x.w > y.w ? 1 : 0);
    let seq = items.slice().sort(byRank);
    if (pat === '123') {
      const ends = seq.filter((x) => x.slot !== 2);
      seq = [ends[0], seq.find((x) => x.slot === 2)!, ends[1]];
    } else if (pat === '124') seq.sort((x, y) => x.slot - y.slot);
    const head = (LOCANTS[pat] || '') + 'C6H3';
    if (seq[0].w === seq[1].w && seq[1].w === seq[2].w) return head + (isHal(at[seq[0].n]) ? seq[0].w + '3' : '(' + seq[0].w + ')3');
    return head + seq.map((x, k) => (k === 2 ? x.w : '(' + x.w + ')')).join('');
  }

  // 端から書く
  const hasPh = at.includes('Ph');
  const feat = (s: string): number => {
    const k = s.search(/[=(O]/);
    return k < 0 ? 99 : k;
  };
  const halAt = (s: string): number => s.search(/Cl|Br/);
  const cands: W[] = [];
  at.forEach((a, s) => {
    if (isHal(a) || a === 'O') return;
    const kids = kidsOf(s, -1);
    if (kids.length > 1) return;
    const off = hasPh && a !== 'Ph' ? 2 : 0;
    if (a === 'Ph') {
      if (adj[s].length === 0) cands.push({ s: 'C6H6', pen: 0, par: 0 });
      else if (!kids.length) cands.push({ s: 'C6H5' + halStr(s), pen: 0, par: 0 });
      else {
        const r = right(kids[0].to, s);
        cands.push({ s: 'C6H5' + r.s, pen: r.pen, par: r.par });
      }
      return;
    }
    if (a === 'N') {
      const w = writeN(s, -1);
      cands.push({ s: w.s, pen: w.pen + off, par: w.par });
      return;
    }
    const w = writeC(s, -1);
    cands.push({ s: w.s, pen: w.pen + off, par: w.par });
    if (!isMethyl(s)) return;
    const v = adj[s][0].to;
    if ((at[v] !== 'C' && at[v] !== 'N') || carbonyl(v) || adj[s][0].order !== 1) return;
    // (CH3)2CH– のように端のメチル基をまとめる
    const ms = adj[v].filter((nb) => nb.order === 1 && isMethyl(nb.to)).map((nb) => nb.to);
    if (ms.length >= 2 && s === ms[0]) {
      const r = at[v] === 'N' ? writeN(v, -1, new Set(ms)) : writeC(v, -1, new Set(ms));
      cands.push({ s: '(CH3)' + ms.length + r.s, pen: r.pen + off + (h[v] === 1 && halStr(v) ? 1 : 0), par: r.par + 3 });
    }
    // 端のエチル基が O・N・環につくなら C2H5 と書く
    if (at[v] === 'C' && h[v] === 2 && !halStr(v) && adj[v].length === 2) {
      const w2 = adj[v].find((nb) => nb.to !== s)!.to;
      if (at[w2] === 'O' || at[w2] === 'N' || at[w2] === 'Ph') {
        const r = right(w2, v);
        cands.push({ s: 'C2H5' + r.s, pen: r.pen + off, par: r.par });
      }
    }
  });
  if (!cands.length) return canonical(mol);
  let best = cands[0];
  for (const c of cands) {
    if (c.pen !== best.pen) { if (c.pen < best.pen) best = c; continue; }
    if (c.par !== best.par) { if (c.par < best.par) best = c; continue; }
    if (c.s.length !== best.s.length) { if (c.s.length < best.s.length) best = c; continue; }
    const hc = halAt(c.s), hb = halAt(best.s);
    if (hc !== hb) { if (hc > hb) best = c; continue; }
    const fc = feat(c.s), fb = feat(best.s);
    if (fc !== fb) { if (fc < fb) best = c; continue; }
    if (c.s < best.s) best = c;
  }
  return best.s;
}

// ---------------------------------------------------------------- 名称

/** key の書式で書いた部分木を、根つき文字列（子を整列）に直す */
function rooted(notation: string): string {
  const m = parseKey(notation);
  if (!m) throw new Error('読めない表記: ' + notation);
  return rootStr(m, adjOf(m), 0, -1);
}

/** アルキル基など。[名称, 並べ順に使う英語名] */
const ALKYL = new Map<string, [string, string]>([
  [rooted('C'), ['メチル', 'methyl']],
  [rooted('C(C)'), ['エチル', 'ethyl']],
  [rooted('C(C(C))'), ['プロピル', 'propyl']],
  [rooted('C(C)(C)'), ['イソプロピル', 'isopropyl']],
  [rooted('C(C(C(C)))'), ['ブチル', 'butyl']],
  [rooted('C(C(C)(C))'), ['イソブチル', 'isobutyl']],
  [rooted('C(C)(C(C))'), ['sec-ブチル', 'butyl2']],
  [rooted('C(C)(C)(C)'), ['tert-ブチル', 'butyl3']],
  [rooted('C(C(C(C(C))))'), ['ペンチル', 'pentyl']],
  [rooted('Ph'), ['フェニル', 'phenyl']],
  [rooted('C(Ph)'), ['ベンジル', 'benzyl']],
]);

const ALKANE = ['', 'メタン', 'エタン', 'プロパン', 'ブタン', 'ペンタン', 'ヘキサン', 'ヘプタン', 'オクタン', 'ノナン', 'デカン'];
const ALKENE = ['', '', 'エテン', 'プロペン', 'ブテン', 'ペンテン', 'ヘキセン', 'ヘプテン', 'オクテン', 'ノネン', 'デセン'];
const ALKANOL = ['', 'メタノール', 'エタノール', 'プロパノール', 'ブタノール', 'ペンタノール', 'ヘキサノール', 'ヘプタノール', 'オクタノール', 'ノナノール', 'デカノール'];
const ALKANAL = ['', 'メタナール', 'エタナール', 'プロパナール', 'ブタナール', 'ペンタナール', 'ヘキサナール', 'ヘプタナール', 'オクタナール', 'ノナナール', 'デカナール'];
const ALKANONE = ['', '', '', 'プロパノン', 'ブタノン', 'ペンタノン', 'ヘキサノン', 'ヘプタノン', 'オクタノン', 'ノナノン', 'デカノン'];
const MULT = ['', '', 'ジ', 'トリ', 'テトラ'];

/** 慣用名。key の書式（子の順序は自由）で書く。? は o / m / p に展開する */
const COMMON_SRC: [string, string][] = [
  ['C(=C)', 'エチレン'],
  ['C(=O)', 'ホルムアルデヒド'],
  ['C(C)(=O)', 'アセトアルデヒド'],
  ['C(C(C))(=O)', 'プロピオンアルデヒド'],
  ['C(C)(C)(=O)', 'アセトン'],
  ['C(C)(C(C))(=O)', 'エチルメチルケトン'],
  ['C(=O)(O)', 'ギ酸'],
  ['C(C)(=O)(O)', '酢酸'],
  ['C(C(C))(=O)(O)', 'プロピオン酸'],
  ['C(C(C(C)))(=O)(O)', '酪酸'],
  ['C(Cl)(=C)', '塩化ビニル'],
  ['C(Cl)(Cl)(Cl)', 'クロロホルム'],
  ['C(Cl)(Cl)(Cl)(Cl)', '四塩化炭素'],
  ['Ph', 'ベンゼン'],
  ['C(Ph)', 'トルエン'],
  ['C(C)(Ph)', 'エチルベンゼン'],
  ['C(C(C))(Ph)', 'プロピルベンゼン'],
  ['C(C)(C)(Ph)', 'クメン'],
  ['C(=C)(Ph)', 'スチレン'],
  ['Ph(Ph)', 'ビフェニル'],
  ['Ar?(C)(C)', '?-キシレン'],
  ['Ar?(C)(C(C))', '?-エチルトルエン'],
  ['O(Ph)', 'フェノール'],
  ['Ar?(C)(O)', '?-クレゾール'],
  ['Ar?(C(C))(O)', '?-エチルフェノール'],
  ['Aro(O)(O)', 'カテコール'],
  ['Arm(O)(O)', 'レソルシノール'],
  ['Arp(O)(O)', 'ヒドロキノン'],
  ['C(O)(Ph)', 'ベンジルアルコール'],
  ['C(C)(O)(Ph)', '1-フェニルエタノール'],
  ['C(C(O))(Ph)', '2-フェニルエタノール'],
  ['Ar?(C)(C(O))', '?-メチルベンジルアルコール'],
  ['O(C)(Ph)', 'アニソール'],
  ['Ar?(C)(O(C))', '?-メチルアニソール'],
  ['O(Ph)(Ph)', 'ジフェニルエーテル'],
  ['C(=O)(Ph)', 'ベンズアルデヒド'],
  ['C(C(=O))(Ph)', 'フェニルアセトアルデヒド'],
  ['Ar?(C)(C(=O))', '?-トルアルデヒド'],
  ['C(C)(=O)(Ph)', 'アセトフェノン'],
  ['C(=O)(Ph)(Ph)', 'ベンゾフェノン'],
  ['C(=O)(O)(Ph)', '安息香酸'],
  ['C(C(=O)(O))(Ph)', 'フェニル酢酸'],
  ['Ar?(C)(C(=O)(O))', '?-トルイル酸'],
  ['Aro(C(=O)(O))(C(=O)(O))', 'フタル酸'],
  ['Arm(C(=O)(O))(C(=O)(O))', 'イソフタル酸'],
  ['Arp(C(=O)(O))(C(=O)(O))', 'テレフタル酸'],
  ['Aro(O)(C(=O)(O))', 'サリチル酸'],
  ['Aro(O)(C(=O)(O(C)))', 'サリチル酸メチル'],
  ['Aro(O(C(=O)(C)))(C(=O)(O))', 'アセチルサリチル酸'],
  ['Ar?(C)(O(C(=O)))', 'ギ酸 ?-トリル'],
  ['Ar?(C)(O(C(=O)(C)))', '酢酸 ?-トリル'],
  ['N', 'アンモニア'],
  ['N(Ph)', 'アニリン'],
  ['N(C)(Ph)', 'N-メチルアニリン'],
  ['N(C(C))(Ph)', 'N-エチルアニリン'],
  ['N(C)(C)(Ph)', 'N,N-ジメチルアニリン'],
  ['Ar?(C)(N)', '?-トルイジン'],
  ['Ar?(N)(O)', '?-アミノフェノール'],
  ['Ar?(N)(C(=O)(O))', '?-アミノ安息香酸'],
  ['C(N)(C(=O)(O))', 'グリシン'],
  ['C(C)(N)(C(=O)(O))', 'アラニン'],
  ['C(N)(C(C(=O)(O)))', 'β-アラニン'],
  ['C(N(C))(C(=O)(O))', 'N-メチルグリシン'],
  ['C(=O)(N)', 'ホルムアミド'],
  ['C(C)(=O)(N)', 'アセトアミド'],
  ['C(C(C))(=O)(N)', 'プロピオンアミド'],
  ['C(=O)(N(C))', 'N-メチルホルムアミド'],
  ['C(=O)(N(C(C)))', 'N-エチルホルムアミド'],
  ['C(=O)(N(C)(C))', 'N,N-ジメチルホルムアミド'],
  ['C(C)(=O)(N(C))', 'N-メチルアセトアミド'],
  ['C(C)(=O)(N(C)(C))', 'N,N-ジメチルアセトアミド'],
  ['C(C)(=O)(N(Ph))', 'アセトアニリド'],
  ['C(=O)(N(Ph))', 'ホルムアニリド'],
  ['C(=O)(N(C)(Ph))', 'N-メチルホルムアニリド'],
  ['C(=O)(N)(Ph)', 'ベンズアミド'],
  ['C(=O)(N(C))(Ph)', 'N-メチルベンズアミド'],
  ['C(C(Ph))(=O)(N)', 'フェニルアセトアミド'],
  ['C(=O)(N(C(Ph)))', 'N-ベンジルホルムアミド'],
  ['Ar?(C)(C(=O)(N))', '?-トルアミド'],
  ['Ar?(C)(N(C(=O)))', 'N-(?-トリル)ホルムアミド'],
  ['Cl(Ph)', 'クロロベンゼン'],
  ['Br(Ph)', 'ブロモベンゼン'],
  ['C(Cl)(Ph)', '塩化ベンジル'],
  ['Ar?(Cl)(Cl)', '?-ジクロロベンゼン'],
  ['Ar?(C)(Cl)', '?-クロロトルエン'],
];

let COMMON: Map<string, string> | undefined;
function commonName(key: string): string | undefined {
  if (!COMMON) {
    COMMON = new Map();
    for (const [src, name] of COMMON_SRC) {
      const forms: [string, string][] = src.includes('?')
        ? (['o', 'm', 'p'] as const).map((p) => [src.replace('?', p), name.replace('?', p)] as [string, string])
        : [[src, name]];
      for (const [s, nm] of forms) {
        const m = parseKey(s);
        if (!m) throw new Error('読めない表記: ' + s);
        COMMON.set(canonical(m), nm);
      }
    }
  }
  return COMMON.get(key);
}

function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity, y = b[i] ?? -Infinity;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 鎖式の単官能化合物の体系名。主鎖・位置番号を総当たりで決める。つけられなければ '' */
function chainName(I: Info, g: Groups, cls: IsoClass): string {
  const { mol, adj } = I;
  const at = mol.atoms;
  if (g.ring.length || g.cc.length > 1) return '';
  let kind: 'ane' | 'ene' | 'ol' | 'al' | 'one' | 'acid';
  let must: number[] = [];
  let head = -1;
  const own = new Set<number>(); // 主基に属する O
  if (cls === 'alkane') kind = 'ane';
  else if (cls === 'alkene' || cls === 'halide') {
    kind = g.cc.length ? 'ene' : 'ane';
    if (g.cc.length) must = g.cc[0];
  } else if (cls === 'alcohol' && g.alcoholOH.length === 1) {
    kind = 'ol';
    own.add(g.alcoholOH[0]);
    must = [adj[g.alcoholOH[0]][0].to];
  } else if ((cls === 'aldehyde' || cls === 'ketone') && g.carbonylC.length === 1) {
    kind = cls === 'aldehyde' ? 'al' : 'one';
    const c = g.carbonylC[0];
    must = [c];
    if (cls === 'aldehyde') head = c;
    for (const nb of adj[c]) if (at[nb.to] === 'O') own.add(nb.to);
  } else if ((cls === 'acid' || (cls === 'aminoacid' && g.amineN.length === 1)) && g.carboxylOH.length === 1) {
    kind = 'acid';
    const c = adj[g.carboxylOH[0]][0].to;
    must = [c];
    head = c;
    for (const nb of adj[c]) if (at[nb.to] === 'O') own.add(nb.to);
  } else return '';

  const cs = at.map((a, i) => (a === 'C' ? i : -1)).filter((i) => i >= 0);
  const pathTo = (u: number, v: number): number[] | undefined => {
    const walk = (i: number, from: number): number[] | undefined => {
      if (i === v) return [i];
      for (const nb of adj[i]) {
        if (nb.to === from || at[nb.to] !== 'C') continue;
        const r = walk(nb.to, i);
        if (r) return [i, ...r];
      }
      return undefined;
    };
    return walk(u, -1);
  };
  interface Cand { path: number[]; subs: { loc: number; name: string; eng: string }[]; ploc: number; bad: boolean; score: number[] }
  const cands: Cand[] = [];
  let maxLen = 0;
  for (const u of cs) for (const v of cs) {
    const path = pathTo(u, v);
    if (!path || (head >= 0 && path[0] !== head) || !must.every((m) => path.includes(m))) continue;
    if (path.length < maxLen) continue;
    maxLen = path.length;
    const subs: Cand['subs'] = [];
    let bad = false;
    path.forEach((i, k) => {
      for (const nb of adj[i]) {
        if (nb.to === path[k - 1] || nb.to === path[k + 1] || own.has(nb.to)) continue;
        const a = at[nb.to];
        if (a === 'Cl') subs.push({ loc: k + 1, name: 'クロロ', eng: 'chloro' });
        else if (a === 'Br') subs.push({ loc: k + 1, name: 'ブロモ', eng: 'bromo' });
        else if (a === 'N' && adj[nb.to].length === 1) subs.push({ loc: k + 1, name: 'アミノ', eng: 'amino' });
        else {
          const al = a === 'C' && nb.order === 1 ? ALKYL.get(rootStr(mol, adj, nb.to, i)) : undefined;
          if (al) subs.push({ loc: k + 1, name: al[0], eng: al[1] });
          else { bad = true; subs.push({ loc: k + 1, name: '?', eng: '?' }); }
        }
      }
    });
    const ploc = kind === 'ane' ? 0 : Math.min(...must.map((m) => path.indexOf(m))) + 1;
    subs.sort((x, y) => (x.eng !== y.eng ? (x.eng < y.eng ? -1 : 1) : x.loc - y.loc));
    const score = [-subs.length, ploc, ...subs.map((s) => s.loc).sort((x, y) => x - y), ...subs.map((s) => s.loc)];
    cands.push({ path, subs, ploc, bad, score });
  }
  const pool = cands.filter((c) => c.path.length === maxLen);
  if (!pool.length || maxLen >= ALKANE.length) return '';
  let best = pool[0];
  for (const c of pool) if (cmpTuple(c.score, best.score) < 0) best = c;
  if (best.bad) return '';
  const len = maxLen;
  const total = best.subs.length;
  const noLoc = len === 1 || (len === 2 && total === 1);
  const names: string[] = [];
  const pre: string[] = [];
  for (const s of best.subs) if (!names.includes(s.name)) names.push(s.name);
  for (const nm of names) {
    const locs = best.subs.filter((s) => s.name === nm).map((s) => s.loc).sort((x, y) => x - y);
    if (locs.length >= MULT.length) return '';
    pre.push((noLoc ? '' : locs.join(',') + '-') + MULT[locs.length] + nm);
  }
  let parent: string;
  if (kind === 'ane') parent = ALKANE[len];
  else if (kind === 'ene') parent = (len >= 4 ? best.ploc + '-' : '') + ALKENE[len];
  else if (kind === 'ol') parent = (len >= 3 ? best.ploc + '-' : '') + ALKANOL[len];
  else if (kind === 'al') parent = ALKANAL[len];
  else if (kind === 'one') parent = (len >= 4 ? best.ploc + '-' : '') + ALKANONE[len];
  else parent = ALKANE[len] + '酸';
  if (!parent) return '';
  const prefix = pre.join('-');
  return prefix ? (/^\d/.test(parent) ? prefix + '-' + parent : prefix + parent) : parent;
}

/** 環の 6 つの位置に置換基（根つき文字列）を並べる。H は '' */
function hexOf(mol: Mol, adj: Adj, r: number): string[] {
  const hex = ['', '', '', '', '', ''];
  const p = mol.pos?.[r];
  const str = (nb: Nb): string => rootStr(mol, adj, nb.to, r);
  if (mol.atoms[r] === 'Ph') {
    if (adj[r][0]) hex[0] = str(adj[r][0]);
  } else if (mol.atoms[r] === 'Ar') {
    hex[0] = str(adj[r][0]);
    hex[p === 'o' ? 1 : p === 'm' ? 2 : 3] = str(adj[r][1]);
  } else if (p === '123') {
    const ends = adj[r].filter((nb) => slotOf(mol, r, nb) !== 2);
    hex[0] = str(ends[0]);
    hex[1] = str(adj[r].find((nb) => slotOf(mol, r, nb) === 2)!);
    hex[2] = str(ends[1]);
  } else if (p === '124') {
    for (const nb of adj[r]) hex[[0, 0, 1, 0, 3][slotOf(mol, r, nb)]] = str(nb);
  } else adj[r].forEach((nb, k) => { hex[2 * k] = str(nb); });
  return hex;
}

/** 正六角形の対称操作（回転 6、鏡映 6）。map[i] は位置 i の移り先 */
const HEX_MAPS: number[][] = [0, 1, 2, 3, 4, 5].flatMap((k) => [
  [0, 1, 2, 3, 4, 5].map((i) => (i + k) % 6),
  [0, 1, 2, 3, 4, 5].map((i) => (k - i + 6) % 6),
]);

function hexCanon(hex: string[]): string {
  let best = '';
  for (const map of HEX_MAPS) {
    const out: string[] = [];
    hex.forEach((x, i) => { out[map[i]] = x; });
    const s = out.join('|');
    if (best === '' || s < best) best = s;
  }
  return best;
}

/** 三置換ベンゼンの名称。置換基がメチル・エチル・ハロゲンと、主基 1 個（–COOH、–OH、–NH2）のときだけつける */
function triName(mol: Mol, adj: Adj): string {
  const r = mol.atoms.indexOf('Tr');
  const hex = hexOf(mol, adj, r);
  const PRE: Record<string, [string, string]> = {
    [rooted('C')]: ['メチル', 'methyl'], [rooted('C(C)')]: ['エチル', 'ethyl'], Cl: ['クロロ', 'chloro'], Br: ['ブロモ', 'bromo'],
  };
  const HEAD: [string, string][] = [[rooted('C(=O)(O)'), '安息香酸'], ['O', 'フェノール'], ['N', 'アニリン']];
  const subs = hex.filter((x) => x);
  let head = '';
  let parent = 'ベンゼン';
  for (const [str, nm] of HEAD) {
    const k = subs.filter((x) => x === str).length;
    if (k > 1) return '';
    if (k === 1) { head = str; parent = nm; break; }
  }
  if (!head && subs.filter((x) => x === rooted('C')).length === 1 && subs.every((x) => x === rooted('C') || x === 'Cl' || x === 'Br')) {
    head = rooted('C');
    parent = 'トルエン';
  }
  if (subs.some((x) => x !== head && !PRE[x])) return '';
  let best: { score: number[]; items: { loc: number; name: string; eng: string }[] } | undefined;
  for (const map of HEX_MAPS) {
    if (head && map[hex.indexOf(head)] !== 0) continue;
    const items = hex.map((x, i) => ({ x, loc: map[i] + 1 })).filter((q) => q.x && (q.x !== head || q.loc !== 1 || !head))
      .map((q) => ({ loc: q.loc, name: PRE[q.x][0], eng: PRE[q.x][1] }))
      .sort((a, b) => (a.eng !== b.eng ? (a.eng < b.eng ? -1 : 1) : a.loc - b.loc));
    const score = [...items.map((q) => q.loc).sort((a, b) => a - b), ...items.map((q) => q.loc)];
    if (!best || cmpTuple(score, best.score) < 0) best = { score, items };
  }
  if (!best) return '';
  const names = [...new Set(best.items.map((q) => q.name))];
  return names.map((nm) => {
    const locs = best!.items.filter((q) => q.name === nm).map((q) => q.loc);
    return locs.join(',') + '-' + MULT[locs.length] + nm;
  }).join('-') + parent;
}

function nameOf(I: Info, g: Groups, cls: IsoClass, key: string, props: Props): string {
  const { mol, adj } = I;
  const common = commonName(key);
  if (common) return common;
  if (mol.atoms.includes('Tr')) return triName(mol, adj);
  if (cls === 'amine' && g.amineN.length === 1) {
    // アルキル基を英語名の順に並べる（エチルメチルアミン、ジエチルアミン）
    const n = g.amineN[0];
    const rs = adj[n].map((nb) => ALKYL.get(rootStr(mol, adj, nb.to, n)));
    const known = rs.filter((r): r is [string, string] => !!r).sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
    if (known.length !== rs.length || !rs.length) return '';
    const names = [...new Set(known.map((r) => r[0]))];
    return names.map((nm) => MULT[known.filter((r) => r[0] === nm).length] + nm).join('') + 'アミン';
  }
  if (cls === 'ether' && g.etherO.length === 1) {
    const o = g.etherO[0];
    const rs = adj[o].map((nb) => ALKYL.get(rootStr(mol, adj, nb.to, o)));
    const [a, b] = rs;
    if (!a || !b) return '';
    if (a[0] === b[0]) return 'ジ' + a[0] + 'エーテル';
    const [x, y] = a[1] < b[1] ? [a, b] : [b, a];
    return x[0] + y[0] + 'エーテル';
  }
  if (cls === 'ester' && g.esterO.length === 1 && props.hydrolysis) {
    const e = g.esterO[0];
    const r = adj[e].find((nb) => !hasDblO(mol, adj, nb.to));
    const al = r ? ALKYL.get(rootStr(mol, adj, r.to, e)) : undefined;
    const acid = byKey(props.hydrolysis.acid)?.name;
    return al && acid ? acid + al[0] : '';
  }
  return chainName(I, g, cls);
}

// ---------------------------------------------------------------- 公開する関数

const BY_KEY = new Map<string, Isomer>();
const CACHE = new Map<string, Isomer[]>();

function build(key: string): Isomer {
  const hit = BY_KEY.get(key);
  if (hit) return hit;
  const mol = parseKey(key)!;
  const I = infoOf(mol);
  const g = groupsOf(I);
  const cls = classOf(g);
  const props = propsOf(I, g);
  const iso: Isomer = {
    mol, key, cls,
    formula: formulaOf(I),
    name: nameOf(I, g, cls, key, props),
    chiral: chiralOf(I),
    cisTrans: cisTransOf(I, g) > 0,
    props,
  };
  BY_KEY.set(key, iso);
  return iso;
}

/** key から分子を引く。数え上げていない分子（反応の生成物など）もその場で作る */
export function byKey(key: string): Isomer | undefined {
  const hit = BY_KEY.get(key);
  if (hit) return hit;
  const mol = parseKey(key);
  if (!mol || !isValid(mol)) return undefined;
  return build(canonical(mol));
}

const whole = (n: number | undefined): boolean => n === undefined || (Number.isInteger(n) && n >= 0);

/** 分子式に当てはまる構造異性体をすべて返す（範囲は冒頭の規則）。範囲外の分子式なら [] */
export function isomers(spec: Spec): Isomer[] {
  if (!whole(spec.c) || !whole(spec.h) || !whole(spec.o) || !whole(spec.n) || !whole(spec.cl) || !whole(spec.br) || spec.c < 1) return [];
  const id = specText(spec);
  const hit = CACHE.get(id);
  if (hit) return hit.slice();
  const o = spec.o || 0, n = spec.n || 0, cl = spec.cl || 0, br = spec.br || 0;
  const out: Isomer[] = [];
  const twice = 2 * spec.c + 2 + n - spec.h - cl - br;
  if (twice >= 0 && twice % 2 === 0) {
    const dou = twice / 2;
    const rings = Math.floor(dou / 4);
    const dbl = dou - 4 * rings;
    const chain = spec.c - 6 * rings;
    if (rings <= 2 && chain >= 0 && chain + o + n + cl + br + rings <= MAX_NODES) {
      const seen = new Set<string>();
      // 環のうち 1 個までは、二置換（Ar）か三置換（Tr）でもよい
      for (const hub of rings ? ['', 'Ar', 'Tr'] : ['']) {
        const counts = { C: chain, O: o, N: n, Cl: cl, Br: br, Ph: rings - (hub ? 1 : 0), Ar: hub === 'Ar' ? 1 : 0, Tr: hub === 'Tr' ? 1 : 0 };
        for (const mol of grow(counts, dbl)) {
          const key = canonical(mol);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(build(key));
        }
      }
    }
  }
  out.sort((a, b) => {
    const ca = CLASS_ORDER.indexOf(a.cls), cb = CLASS_ORDER.indexOf(b.cls);
    if (ca !== cb) return ca - cb;
    if (a.formula.length !== b.formula.length) return a.formula.length - b.formula.length;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  CACHE.set(id, out);
  return out.slice();
}

// ---------------------------------------------------------------- 問題づくりに使う量

/** シス-トランス異性体が存在する C=C の数 */
export function cisTransCount(iso: Isomer): number {
  const I = infoOf(iso.mol);
  return cisTransOf(I, groupsOf(I));
}

/** 立体異性体まで区別した数。不斉炭素原子が 2 個以上あるなど、単純に決まらないときは undefined */
export function stereoCount(iso: Isomer): number | undefined {
  const ct = cisTransCount(iso);
  if (iso.chiral > 1 || ct > 1) return undefined;
  return 2 ** (iso.chiral + ct);
}

/** 分子内脱水で生じるアルケンの数。シス-トランス異性体も区別する。アルコールでなければ 0 */
export function dehydCount(iso: Isomer): number {
  let n = 0;
  for (const k of iso.props.dehydration || []) n += byKey(k)?.cisTrans ? 2 : 1;
  return n;
}

/** 炭素についた H 1 個を Cl で置換したときの構造異性体の数（環の H は数えない） */
export function monoSubCount(iso: Isomer): number {
  const { mol, h } = infoOf(iso.mol);
  const keys = new Set<string>();
  mol.atoms.forEach((a, i) => {
    if (a !== 'C' || h[i] < 1) return;
    const m = clone(mol);
    addAtom(m, 'Cl', i, 1);
    keys.add(canonical(m));
  });
  return keys.size;
}

/** ベンゼン環の H 1 個を置換したときの構造異性体の数。環が 1 個でなければ undefined */
export function ringSubCount(iso: Isomer): number | undefined {
  const { mol, adj } = infoOf(iso.mol);
  const rings = mol.atoms.map((a, i) => (isRing(a) ? i : -1)).filter((i) => i >= 0);
  if (rings.length !== 1) return undefined;
  const hex = hexOf(mol, adj, rings[0]);
  const seen = new Set<string>();
  hex.forEach((x, i) => {
    if (x) return;
    const y = hex.slice();
    y[i] = '*';
    seen.add(hexCanon(y));
  });
  return seen.size;
}

/** メチル基 –CH3 の数 */
export function methylCount(iso: Isomer): number {
  const { mol, h } = infoOf(iso.mol);
  return mol.atoms.filter((a, i) => a === 'C' && h[i] === 3).length;
}

/** 炭素骨格。すべての炭素が C–C 結合で 1 つにつながる鎖式化合物について、枝分かれの有無を返す */
export function skeleton(iso: Isomer): 'linear' | 'branched' | undefined {
  const { mol, adj } = infoOf(iso.mol);
  const at = mol.atoms;
  if (at.some(isRing)) return undefined;
  const nC = at.filter((a) => a === 'C').length;
  const nCC = mol.bonds.filter(([a, b]) => at[a] === 'C' && at[b] === 'C').length;
  if (nC === 0 || nCC !== nC - 1) return undefined;
  const branched = at.some((a, i) => a === 'C' && adj[i].filter((nb) => at[nb.to] === 'C').length >= 3);
  return branched ? 'branched' : 'linear';
}

/** 二置換ベンゼンなら置換基の位置 */
export function ringPos(iso: Isomer): Pos | undefined {
  const i = iso.mol.atoms.indexOf('Ar');
  const p = i >= 0 ? iso.mol.pos?.[i] : undefined;
  return p === 'o' || p === 'm' || p === 'p' ? p : undefined;
}

/** 三置換ベンゼンなら置換の型 */
export function triPattern(iso: Isomer): Pattern | undefined {
  const i = iso.mol.atoms.indexOf('Tr');
  const p = i >= 0 ? iso.mol.pos?.[i] : undefined;
  return p === '123' || p === '124' || p === '135' ? p : undefined;
}

/** 三置換ベンゼンで、同じ置換基がちょうど 2 個あるとき、その 2 個の位置関係 */
export function twinPos(iso: Isomer): Pos | undefined {
  const { mol, adj } = infoOf(iso.mol);
  const r = mol.atoms.indexOf('Tr');
  if (r < 0) return undefined;
  const hex = hexOf(mol, adj, r);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    if (!hex[i] || hex[i] !== hex[j] || hex.filter((x) => x === hex[i]).length !== 2) continue;
    const d = Math.min(j - i, 6 - (j - i));
    return d === 1 ? 'o' : d === 2 ? 'm' : 'p';
  }
  return undefined;
}

/**
 * 環の炭素の番号（1〜6、向きと起点は自由）から、環の節点の書き方を求める。描いた構造を Mol に直すときに使う。
 * 1 個なら Ph、2 個なら Ar と pos、3 個なら Tr と pos、それに positions と同じ順の位置番号 slots を返す
 */
export function ringNode(positions: number[]): { atom: 'Ph' | 'Ar' | 'Tr'; pos?: Pos | Pattern; slots?: number[] } | undefined {
  const ps = positions.map((p) => (((p - 1) % 6) + 6) % 6);
  if (new Set(ps).size !== ps.length || ps.some((p) => !Number.isInteger(p))) return undefined;
  const gap = (a: number, b: number): number => Math.min((a - b + 6) % 6, (b - a + 6) % 6);
  if (ps.length <= 1) return { atom: 'Ph' };
  if (ps.length === 2) return { atom: 'Ar', pos: (['o', 'm', 'p'] as const)[gap(ps[0], ps[1]) - 1] };
  if (ps.length !== 3) return undefined;
  // それぞれの置換基から見た、ほかの 2 個までの距離
  const seen = ps.map((p, i) => ps.filter((_, j) => j !== i).map((q) => gap(p, q)).sort().join(''));
  if (seen.every((x) => x === '22')) return { atom: 'Tr', pos: '135', slots: [0, 0, 0] };
  if (seen.includes('11')) return { atom: 'Tr', pos: '123', slots: seen.map((x) => (x === '11' ? 2 : 1)) };
  return { atom: 'Tr', pos: '124', slots: seen.map((x) => (x === '13' ? 1 : x === '12' ? 2 : 4)) };
}
