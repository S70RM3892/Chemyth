/**
 * 京大型の連鎖計算ドリル。
 * 1 つの設定（リード文）に 4〜7 個の小問が続き、前の小問の結果を次で使う。
 * 数値を答える小問のほかに、文字式を 4 つの選択肢から選ぶ小問（choices）がある。
 * 数値は乱数で毎回変わる。答えはパラメータからコードで計算する。
 */

export type Rng = () => number; // [0,1)

export interface DrillStep {
  /** 小問の文。前の小問の結果を使うことがある */
  text: string;
  /** パラメータから計算した答え（丸めない） */
  answer: number;
  /** 単位。a×10ⁿ の a を答えさせるときは「×10ⁿ …」まで含める */
  unit: string;
  /** 実際の数値を入れた解き方 */
  how: string;
  /** 相対許容誤差。省略時 0.02 */
  tol?: number;
  /** あれば選択式（式を選ぶ小問）。answer は正しい選択肢の番号（0 から）、unit は '' */
  choices?: string[];
  /**
   * 選択式のとき、正しい式に出てくる文字（書いてあるとおり）。式を打ち込ませるときのキーになる。
   * Ka や V₁ のように 2 文字以上のものも 1 つの文字として扱う。
   */
  vars?: string[];
  /** 選択肢が式ではなく文章のとき true（打ち込みにはできない） */
  conceptual?: true;
}

export interface Drill {
  id: string;
  title: string;
  /** シラバスの単元 id */
  unit: string;
  intro: string;
  steps: DrillStep[];
}

export interface DrillGen {
  id: string;
  title: string;
  unit: string;
  level: 1 | 2 | 3;
  make(rng: Rng): Drill;
}

/** 種から決まる乱数 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function checkStep(step: DrillStep, x: number): boolean {
  if (step.choices) return x === step.answer;
  if (!Number.isFinite(x)) return false;
  const tol = step.tol ?? 0.02;
  return Math.abs(x - step.answer) <= Math.max(Math.abs(step.answer) * tol, 1e-9);
}

// ───────────────────────── 式の計算 ─────────────────────────

/** 式の中でそのまま使える定数。logₑ2 は問題文で与える値 0.693 */
const EXPR_CONST: Record<string, number> = { 'logₑ2': 0.693 };
const SUP_DIGIT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const isSupDigit = (ch: string | undefined): ch is string => ch !== undefined && Object.prototype.hasOwnProperty.call(SUP_DIGIT, ch);

/**
 * 選択肢と同じ書き方の式を数値にする。読めない式は例外を投げる（0 で割ったときなどは NaN や Infinity が返る）。
 *
 * 読めるもの：
 * - 文字：vars の名前（Ka、V₁、Δp のように 2 文字以上でもよい。最も長く一致する名前を取る）と、定数 logₑ2
 * - 小数、かっこ、+、−（- も可）、×（* · も可）、÷（/ ⁄ も可）
 * - 並べて書いた積：4α²P、n(1 + α)。割り算より先に計算する（PV/RT は (PV)÷(RT)、1/2k は 1÷(2k)）。
 *   × を書いた積は割り算と同じ強さで、左から順（1/2×k は (1÷2)×k）
 * - 後ろにつく指数：² ³ などの上付き数字、ⁿ（vars の n 乗）、^2 ^(1/2) ^n ^-1
 * - 前につく √：次の因数（数、文字、かっこ。指数がついていればそれも含む）にかかる
 * - 符号の −
 */
export function evalExpr(expr: string, vars: Record<string, number>): number {
  if (typeof expr !== 'string' || expr.length > 200) throw new Error('式が読めない（長すぎる）');
  const s = expr.replace(/\s+/g, '');
  const table: Record<string, number> = { ...EXPR_CONST, ...vars };
  const names = Object.keys(table).filter((n) => n.length > 0).sort((a, b) => b.length - a.length);
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`式が読めない（${why}）: ${expr}`);
  };
  const nameAt = (): string | undefined => names.find((n) => s.startsWith(n, i));
  const isMinus = (ch: string | undefined): boolean => ch === '−' || ch === '-';
  const startsPrimary = (): boolean => i < s.length && (/[0-9.(√]/.test(s[i]) || nameAt() !== undefined);

  function primary(): number {
    const ch = s[i];
    if (ch === undefined) return fail('途中で終わっている');
    if (ch === '(') {
      i++;
      const v = sum();
      if (s[i] !== ')') return fail('かっこが閉じていない');
      i++;
      return v;
    }
    if (ch === '√') {
      i++;
      return Math.sqrt(power());
    }
    const m = /^(\d+(\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    const name = nameAt();
    if (name === undefined) return fail(`知らない文字 ${s.slice(i, i + 3)}`);
    i += name.length;
    return table[name];
  }
  function power(): number {
    let v = primary();
    for (;;) {
      const ch = s[i];
      if (ch === '^') {
        i++;
        let sign = 1;
        if (isMinus(s[i])) {
          sign = -1;
          i++;
        }
        v = v ** (sign * primary());
      } else if (ch === 'ⁿ') {
        if (!Object.prototype.hasOwnProperty.call(table, 'n')) return fail('n がない');
        i++;
        v = v ** table.n;
      } else if (ch === '⁻' || isSupDigit(ch)) {
        let sign = 1;
        if (ch === '⁻') {
          sign = -1;
          i++;
        }
        let digits = '';
        for (let d = s[i]; isSupDigit(d); d = s[i]) {
          digits += SUP_DIGIT[d];
          i++;
        }
        if (digits === '') return fail('指数がない');
        v = v ** (sign * Number(digits));
      } else return v;
    }
  }
  function juxt(): number {
    let v = power();
    while (startsPrimary()) v *= power();
    return v;
  }
  function unary(): number {
    if (isMinus(s[i])) {
      i++;
      return -unary();
    }
    if (s[i] === '+') {
      i++;
      return unary();
    }
    return juxt();
  }
  function product(): number {
    let v = unary();
    for (;;) {
      const ch = s[i];
      if (ch === '×' || ch === '*' || ch === '·') {
        i++;
        v *= unary();
      } else if (ch === '/' || ch === '÷' || ch === '⁄') {
        i++;
        v /= unary();
      } else return v;
    }
  }
  function sum(): number {
    let v = product();
    for (;;) {
      if (s[i] === '+') {
        i++;
        v += product();
      } else if (isMinus(s[i])) {
        i++;
        v -= product();
      } else return v;
    }
  }
  const out = sum();
  if (i !== s.length) return fail(`余り ${s.slice(i, i + 3)}`);
  return out;
}

/** 式を比べるときに文字に入れる値。α・β・Δ… は 0〜1 の間（0.5 付近を避ける）、ほかは 1 より大きい半端な数 */
function sampleValue(name: string, u: number): number {
  if (/^[αβΔ]/.test(name)) return u < 0.5 ? 0.12 + 0.6 * u : 0.28 + 0.6 * u;
  return 1.37 + 7.9 * u;
}

/**
 * 2 つの式が同じ式かどうか。vars の文字に 5 通りの値（毎回同じ）を入れ、どれも相対誤差 1e-6 以内なら同じとみなす。
 * どちらかが読めない式なら false（例外は外に出さない）。vars にない文字を使った式も false。
 */
export function sameExpr(a: string, b: string, vars: string[]): boolean {
  try {
    for (let t = 0; t < 5; t++) {
      const rng = mulberry32(0x5eed + 7919 * t);
      const env: Record<string, number> = {};
      for (const v of vars) {
        const u = rng();
        if (!Object.prototype.hasOwnProperty.call(EXPR_CONST, v)) env[v] = sampleValue(v, u);
      }
      const x = evalExpr(a, env);
      const y = evalExpr(b, env);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (Math.abs(x - y) > 1e-6 * Math.max(Math.abs(x), Math.abs(y))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── 共通の道具 ─────────────────────────

/** 途中の答えの丸め方。ふつうは丸めない。テストでは有効数字 3 桁に丸めて連鎖させる */
type Round = (x: number) => number;
const noRound: Round = (x) => x;
const sig3: Round = (x) => (x === 0 || !Number.isFinite(x) ? x : Number(x.toPrecision(3)));

interface Built {
  intro: string;
  steps: DrillStep[];
  /** テストで検算に使う元の数値 */
  p: Record<string, number>;
}

interface Def {
  id: string;
  title: string;
  unit: string;
  level: 1 | 2 | 3;
  build(rng: Rng, r: Round): Built;
}

const R = 8.31e3; // Pa·L/(K·mol)
const FARADAY = 9.65e4; // C/mol
const VM = 22.4; // L/mol
const NA = 6.02e23;
const KW = 1.0e-14;

const TXT_R = '気体定数 R = 8.31×10³ Pa·L/(K·mol)';
const TXT_F = 'ファラデー定数 F = 9.65×10⁴ C/mol';
const TXT_VM = '標準状態（0 ℃、1.013×10⁵ Pa）の気体のモル体積 22.4 L/mol';
const TXT_LOG = 'log₁₀2 = 0.30、log₁₀3 = 0.48';

function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: number): string => String(n).split('').map((ch) => SUP[ch] ?? ch).join('');

/** a×10ⁿ の形（有効数字 n 桁） */
function sci(x: number, n = 3): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const ax = Math.abs(x);
  let e = Math.floor(Math.log10(ax));
  let m = Number((ax / 10 ** e).toPrecision(n));
  if (m >= 10) {
    m /= 10;
    e += 1;
  }
  return `${x < 0 ? '−' : ''}${m.toFixed(n - 1)}×10${sup(e)}`;
}

/** 有効数字 n 桁のふつうの表記。極端に大きい・小さい数は a×10ⁿ */
function f(x: number, n = 3): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e5 || ax < 1e-3) return sci(x, n);
  const sign = x < 0 ? '−' : '';
  const v = Number(ax.toPrecision(n));
  const before = Math.floor(Math.log10(v)) + 1;
  if (before >= n) return sign + String(Math.round(v));
  return sign + v.toFixed(n - before);
}

/** 整数として書く */
const fi = (x: number): string => (Number.isFinite(x) ? (x < 0 ? '−' : '') + String(Math.round(Math.abs(x))) : String(x));
/** 負の数をかっこでくくる */
const par = (x: number): string => (x < 0 ? `(${fi(x)})` : fi(x));

function st(text: string, answer: number, unit: string, how: string, tol?: number): DrillStep {
  const s: DrillStep = { text, answer, unit, how };
  if (tol !== undefined) s.tol = tol;
  return s;
}

/**
 * 式を選ぶ小問。正しい式 1 つと、ありがちな間違い 3 つを乱数で並べ替える。
 * answer は並べ替えたあとの正しい式の番号。
 */
function choice(rng: Rng, text: string, correct: string, wrong: readonly [string, string, string], vars: readonly string[] | null, how: string): DrillStep {
  const all = [correct, ...wrong];
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const s: DrillStep = { text, answer: order.indexOf(0), unit: '', how, choices: order.map((k) => all[k]), vars: vars ? [...vars] : [] };
  // vars が null なら、選択肢は式ではなく文章
  if (!vars) s.conceptual = true;
  return s;
}

const log10 = (x: number): number => Math.log(x) / Math.LN10;
/** pH は小数第 2 位まで書く */
const ph = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));
/** 正の数に + をつける */
const signed = (x: number): string => (x > 0 ? `+${fi(x)}` : fi(x));

/** 酢酸の電離定数（問題ごとに与える値）。どれも log₁₀2、log₁₀3 だけで pKa が出る */
const ACETIC = [
  { Ka: 2.0e-5, s: '2.0×10⁻⁵', pKaHow: 'pKa = 5 − log₁₀2 = 4.70' },
  { Ka: 2.7e-5, s: '2.7×10⁻⁵', pKaHow: '2.7 = 3³ ÷ 10 より pKa = 6 − 3 × 0.48 = 4.56' },
  { Ka: 1.8e-5, s: '1.8×10⁻⁵', pKaHow: '1.8 = 2 × 3² ÷ 10 より pKa = 6 − 0.30 − 2 × 0.48 = 4.74' },
] as const;

// ───────────────────────── 1. N₂O₄ ⇄ 2NO₂ ─────────────────────────

const N2O4_KP: Record<number, number> = { 300: 1.7e4, 320: 7.2e4, 340: 2.6e5 };
const N2O4_SETS = (() => {
  const out: { m: number; T: number; V: number; P: number }[] = [];
  for (const m of [2.3, 3.68, 4.6, 5.52]) {
    for (const T of [300, 320, 340]) {
      for (const V of [0.5, 1.0, 1.5, 2.0, 3.0]) {
        const n0 = m / 92;
        const c = (n0 * R * T) / V;
        const K = N2O4_KP[T];
        const alpha = (-K + Math.sqrt(K * K + 16 * c * K)) / (8 * c);
        const P = sig3(c * (1 + alpha));
        const n = n0 * (1 + alpha);
        if (P >= 6e4 && P <= 2.5e5 && alpha >= 0.15 && alpha <= 0.8 && n < 0.0995 && alpha * n0 >= 0.008) out.push({ m, T, V, P });
      }
    }
  }
  return out;
})();

const n2o4: Def = {
  id: 'n2o4-kp',
  title: 'N₂O₄ の解離平衡と圧平衡定数',
  unit: 'c25',
  level: 3,
  build(rng, r) {
    const { m, T, V, P } = pick(rng, N2O4_SETS);
    const P2 = pick(rng, [5.0e4, 1.0e5, 2.0e5, 3.0e5, 4.0e5].filter((x) => x / P <= 0.7 || x / P >= 1.4));
    const n0 = m / 92;
    const a1 = (P * V) / (R * T) / 1e-2;
    const nR = r(a1) * 1e-2;
    const alpha = nR / n0 - 1;
    const aR = r(alpha);
    const a3 = (((2 * aR) / (1 + aR)) * P) / 1e4;
    const pR = r(a3) * 1e4;
    const pN = P - pR;
    const a4 = (pR * pR) / pN / 1e4;
    const KR = r(a4) * 1e4;
    const alpha2 = Math.sqrt(KR / (4 * P2 + KR));
    const a2R = r(alpha2);
    const V2 = (n0 * (1 + a2R) * R * T) / P2;
    return {
      intro: `四酸化二窒素 N₂O₄ ${f(m)} g を容積 ${f(V)} L の容器に入れて ${T - 273} ℃ に保つと、一部が解離して N₂O₄ ⇄ 2NO₂ の平衡に達し、全圧は ${sci(P)} Pa になった。気体はすべて理想気体とする。N₂O₄ = 92、${TXT_R}。`,
      steps: [
        st('平衡状態で容器内にある気体の全物質量を a×10⁻² mol と表すとき、a を求めろ。', a1, '×10⁻² mol',
          `n = PV/RT = (${sci(P)} × ${f(V)}) ÷ (8.31×10³ × ${T}) = ${sci(nR)} mol。`),
        st('N₂O₄ の解離度 α を求めろ。', alpha, '',
          `はじめの N₂O₄ は ${f(m)} ÷ 92 = ${f(n0)} mol。平衡時は N₂O₄ が ${f(n0)}(1 − α) mol、NO₂ が 2 × ${f(n0)}α mol で、合計 ${f(n0)}(1 + α) mol。これが ${sci(nR)} mol だから 1 + α = ${f(nR / n0)}、α = ${f(alpha)}。`),
        st('NO₂ の分圧を a×10⁴ Pa と表すとき、a を求めろ。', a3, '×10⁴ Pa',
          `分圧 = 全圧 × モル分率。NO₂ のモル分率は 2α/(1 + α) = ${f((2 * aR) / (1 + aR))}。${sci(P)} × ${f((2 * aR) / (1 + aR))} = ${sci(pR)} Pa。`),
        choice(rng, '全圧を P、解離度を α とするとき、圧平衡定数 Kp = (NO₂ の分圧)² ÷ (N₂O₄ の分圧) を表す式を選べ。',
          '4α²P/(1 − α²)', ['4α²P/(1 − α)', '2αP/(1 − α)', 'α²P/(1 − α²)'], ['α', 'P'],
          'はじめの N₂O₄ を n mol とすると、平衡時は N₂O₄ が n(1 − α)、NO₂ が 2nα、合計 n(1 + α) mol。分圧は全圧 × モル分率なので、N₂O₄ が P(1 − α)/(1 + α)、NO₂ が 2αP/(1 + α)。Kp = {2αP/(1 + α)}² ÷ {P(1 − α)/(1 + α)} = 4α²P/{(1 − α)(1 + α)} = 4α²P/(1 − α²)。モル分率の分母 (1 + α) を落とすと 4α²P/(1 − α)、2 乗を忘れると 2αP/(1 − α)、NO₂ の係数 2 を忘れると α²P/(1 − α²) になる。'),
        st('圧平衡定数 Kp = (NO₂ の分圧)² ÷ (N₂O₄ の分圧) を a×10⁴ Pa と表すとき、a を求めろ。', a4, '×10⁴ Pa',
          `N₂O₄ の分圧は ${sci(P)} − ${sci(pR)} = ${sci(pN)} Pa。Kp = (${sci(pR)})² ÷ ${sci(pN)} = ${sci(KR)} Pa。`, 0.03),
        st(`温度を変えずに容器の容積を変え、全圧を ${sci(P2, 2)} Pa にして平衡に達させた。このときの解離度を求めろ。`, alpha2, '',
          `全圧 P、解離度 α のとき Kp = 4α²P/(1 − α²)。α² = Kp/(4P + Kp) = ${sci(KR)} ÷ (4 × ${sci(P2, 2)} + ${sci(KR)}) = ${f(alpha2 * alpha2)}。α = ${f(alpha2)}。${P2 > P ? '圧力を上げたので、分子数が減る向き（N₂O₄ 側）に平衡が移っている。' : '圧力を下げたので、分子数が増える向き（NO₂ 側）に平衡が移っている。'}`),
        st('(6) のときの容器の容積は何 L か。', V2, 'L',
          `気体の全物質量は ${f(n0)} × (1 + ${f(a2R)}) = ${f(n0 * (1 + a2R))} mol。V = nRT/P = ${f(n0 * (1 + a2R))} × 8.31×10³ × ${T} ÷ ${sci(P2, 2)} = ${f(V2)} L。`),
      ],
      p: { m, T, V, P, P2, n0 },
    };
  },
};

// ───────────────────────── 2. 蒸気圧 ─────────────────────────

const VAPOR_P: Record<number, number> = { 27: 3.6e3, 47: 1.06e4, 57: 1.73e4, 87: 6.25e4 };
const VAPOR_SETS = (() => {
  const out: { V: number; mw: number; tLo: number }[] = [];
  for (const V of [10.0, 16.6, 20.0, 24.9]) {
    for (const mw of [0.9, 1.8, 2.7, 3.6, 5.4]) {
      for (const tLo of [27, 47, 57]) {
        const nw = mw / 18;
        const pHi = (nw * R * 360) / V;
        const pLo = (nw * R * (tLo + 273)) / V;
        if (pHi <= 0.95 * VAPOR_P[87] && pLo >= 1.5 * VAPOR_P[tLo]) out.push({ V, mw, tLo });
      }
    }
  }
  return out;
})();

const vapor: Def = {
  id: 'vapor-n2-water',
  title: '窒素と水を入れた密閉容器と蒸気圧',
  unit: 'c11',
  level: 3,
  build(rng, r) {
    const { V, mw, tLo } = pick(rng, VAPOR_SETS);
    const nN = pick(rng, [0.1, 0.2, 0.3]);
    const TH = 360;
    const TL = tLo + 273;
    const vpH = VAPOR_P[87];
    const vpL = VAPOR_P[tLo];
    const nw = mw / 18;
    const a1 = (nw * R * TH) / V / 1e4;
    const pwR = r(a1) * 1e4;
    const pNH = (nN * R * TH) / V;
    const a2 = (pNH + pwR) / 1e4;
    const a3 = (nw * R * TL) / V / 1e4;
    const nv = (vpL * V) / (R * TL);
    const nvR = r(nv);
    const liq = mw - 18 * nvR;
    const pNL = (nN * R * TL) / V;
    const a6 = (pNL + vpL) / 1e4;
    return {
      intro: `容積 ${f(V)} L の密閉容器（容積は変わらない）に窒素 ${f(nN, 2)} mol と水 ${f(mw, 2)} g を入れ、87 ℃ に保った。その後、容器全体を ${tLo} ℃ まで冷やした。水の蒸気圧は 87 ℃ で ${sci(vpH)} Pa、${tLo} ℃ で ${sci(vpL, vpL === 3.6e3 ? 2 : 3)} Pa である。液体の水の体積と、窒素の水への溶解は無視する。H₂O = 18、${TXT_R}。`,
      steps: [
        st('87 ℃ で、水がすべて気体になっているとしたときの水蒸気の分圧を a×10⁴ Pa と表すとき、a を求めろ。', a1, '×10⁴ Pa',
          `水は ${f(mw, 2)} ÷ 18 = ${f(nw)} mol。p = nRT/V = ${f(nw)} × 8.31×10³ × 360 ÷ ${f(V)} = ${sci(pwR)} Pa。これは 87 ℃ の蒸気圧 ${sci(vpH)} Pa より小さいので、水は実際にすべて気体である。`),
        st('87 ℃ での容器内の全圧を a×10⁴ Pa と表すとき、a を求めろ。', a2, '×10⁴ Pa',
          `窒素の分圧は ${f(nN, 2)} × 8.31×10³ × 360 ÷ ${f(V)} = ${sci(pNH)} Pa。全圧 = ${sci(pNH)} + ${sci(pwR)} = ${sci(pNH + pwR)} Pa。`),
        st(`${tLo} ℃ で、水がすべて気体のままだと仮定したときの水蒸気の分圧を a×10⁴ Pa と表すとき、a を求めろ。`, a3, '×10⁴ Pa',
          `${f(nw)} × 8.31×10³ × ${TL} ÷ ${f(V)} = ${sci(a3 * 1e4)} Pa。これは ${tLo} ℃ の蒸気圧 ${sci(vpL, 2)} Pa を超えるので、水の一部は液体になり、水蒸気の分圧は蒸気圧に等しくなる。`),
        st(`${tLo} ℃ で気体として存在している水は何 mol か。`, nv, 'mol',
          `水蒸気の分圧は蒸気圧 ${sci(vpL, 2)} Pa。n = PV/RT = ${sci(vpL, 2)} × ${f(V)} ÷ (8.31×10³ × ${TL}) = ${f(nvR)} mol。`),
        st(`${tLo} ℃ で液体になっている水は何 g か。`, liq, 'g',
          `気体の水は ${f(nvR)} × 18 = ${f(18 * nvR)} g。${f(mw, 2)} − ${f(18 * nvR)} = ${f(liq)} g。`, 0.03),
        st(`${tLo} ℃ での容器内の全圧を a×10⁴ Pa と表すとき、a を求めろ。`, a6, '×10⁴ Pa',
          `窒素の分圧は ${f(nN, 2)} × 8.31×10³ × ${TL} ÷ ${f(V)} = ${sci(pNL)} Pa。これに水の蒸気圧 ${sci(vpL, 2)} Pa を足して ${sci(pNL + vpL)} Pa。`),
      ],
      p: { V, mw, tLo, nN, vpH, vpL, TH, TL },
    };
  },
};

// ───────────────────────── 3. 弱酸の滴定 ─────────────────────────

/** [酢酸の体積 mL, NaOH 濃度 ÷ 酢酸濃度, 中和点を過ぎて加える体積 mL]。過剰の [OH⁻] が 2・3・5 だけで表せる組 */
const TITR_SETS: readonly (readonly [number, number, number])[] = [
  [10, 1, 5], [10, 1, 10], [10, 1, 30], [20, 1, 10], [20, 1, 20], [20, 1, 40],
  [20, 2, 10], [20, 2, 20], [10, 2, 5], [10, 2, 10],
];

const titration: Def = {
  id: 'weak-acid-titration',
  title: '酢酸を NaOH 水溶液で滴定する',
  unit: 'c26',
  level: 3,
  build(rng, _r) {
    const acid = pick(rng, ACETIC);
    const c = pick(rng, [0.05, 0.1, 0.2]);
    const [V, k, x] = pick(rng, TITR_SETS);
    const frac = pick(rng, [0.2, 0.8]);
    const Ka = acid.Ka;
    const cb = c * k;
    const Ve = V / k;
    const pKa = -log10(Ka);
    const h0 = Math.sqrt(c * Ka);
    const pH0 = -log10(h0);
    const vq = frac * Ve;
    const ratio = frac / (1 - frac);
    const pHq = pKa + log10(ratio);
    const cs = (c * V) / (V + Ve);
    const oh = Math.sqrt((cs * KW) / Ka);
    const pHe = 14 + log10(oh);
    const ohx = (cb * x) / (V + Ve + x);
    const pHx = 14 + log10(ohx);
    return {
      intro: `${f(c, 2)} mol/L の酢酸水溶液 ${V}.0 mL を、${f(cb, 2)} mol/L の NaOH 水溶液で滴定する。温度は 25 ℃ で、酢酸の電離定数は Ka = ${acid.s} mol/L、水のイオン積は Kw = 1.0×10⁻¹⁴ (mol/L)² とする。酢酸の電離度は 1 より十分小さいとしてよい。${TXT_LOG}。pH は小数第 2 位まで求めろ。`,
      steps: [
        st('中和点までに必要な NaOH 水溶液は何 mL か。', Ve, 'mL',
          `${f(c, 2)} × ${V}.0 = ${f(cb, 2)} × V より V = ${f(Ve)} mL。`),
        choice(rng, '濃度 c [mol/L] の酢酸水溶液の [H⁺] を、c と Ka で表す式を選べ。電離度は 1 より十分小さいとする。',
          '√(cKa)', ['√(Ka/c)', 'cKa', '√(cKw/Ka)'], ['c', 'Ka'],
          '電離度を α とすると [H⁺] = [CH₃COO⁻] = cα、[CH₃COOH] = c(1 − α) ≒ c。Ka = (cα)²/c = cα² より α = √(Ka/c)、[H⁺] = cα = √(cKa)。√(Ka/c) は電離度 α そのもの、cKa は平方根を取り忘れた式、√(cKw/Ka) は酢酸ナトリウム水溶液の [OH⁻] の式である。'),
        st('滴定を始める前の酢酸水溶液の pH を求めろ。', pH0, '',
          `[H⁺] = √(cKa) = √(${f(c, 2)} × ${acid.s}) = √(${sci(c * Ka)}) = ${sci(h0)} mol/L。pH = −½ log₁₀(${sci(c * Ka)}) = ${ph(pH0)}。`),
        st(`NaOH 水溶液を ${f(Ve / 2)} mL 加えたとき（中和点の半分）の pH を求めろ。`, pKa, '',
          `酢酸の半分が酢酸ナトリウムになり、[CH₃COOH] = [CH₃COO⁻]。[H⁺] = Ka × [CH₃COOH]/[CH₃COO⁻] = Ka。${acid.pKaHow}${ph(pKa) === acid.pKaHow.slice(-4) ? '' : `（より正確には ${ph(pKa)}）`}。`),
        st(`NaOH 水溶液を合計 ${f(vq)} mL 加えたときの pH を求めろ。`, pHq, '',
          `中和点 ${f(Ve)} mL の ${frac === 0.2 ? '1/5' : '4/5'} まで進んだので [CH₃COO⁻]/[CH₃COOH] = ${frac === 0.2 ? '1/4' : '4'}。pH = pKa + log₁₀(${frac === 0.2 ? '1/4' : '4'}) = ${ph(pKa)} ${frac === 0.2 ? '−' : '+'} 2 × 0.30 = ${ph(pHq)}。`),
        st('中和点での pH を求めろ。', pHe, '',
          `中和点では ${f(cs, 2)} mol/L（体積 ${fi(V + Ve)} mL）の酢酸ナトリウム水溶液になる。CH₃COO⁻ + H₂O ⇄ CH₃COOH + OH⁻ の加水分解で [OH⁻] = √(c × Kw/Ka) = √(${f(cs, 2)} × 1.0×10⁻¹⁴ ÷ ${acid.s}) = ${sci(oh)} mol/L。pOH = ${ph(-log10(oh))}、pH = 14 − ${ph(-log10(oh))} = ${ph(pHe)}。`),
        st(`中和点からさらに NaOH 水溶液を ${x}.0 mL 加えたときの pH を求めろ。酢酸イオンの加水分解は無視してよい。`, pHx, '',
          `余った NaOH は ${f(cb, 2)} × ${x}.0 ÷ 1000 mol、全体積は ${fi(V + Ve + x)} mL。[OH⁻] = ${f(cb, 2)} × ${x}.0 ÷ ${fi(V + Ve + x)} = ${sci(ohx, 2)} mol/L。pOH = ${ph(-log10(ohx))}、pH = ${ph(pHx)}。`),
      ],
      p: { Ka, c, V, k, x, frac, cb, cs },
    };
  },
};

// ───────────────────────── 4. 溶解度積と分別沈殿 ─────────────────────────

const KSP_AGCL = 1.8e-10;
const KSP_AG2CRO4 = 3.6e-12;

const ksp: Def = {
  id: 'ksp-mohr',
  title: '溶解度積と分別沈殿（モール法）',
  unit: 'c26',
  level: 3,
  build(rng, r) {
    const c1 = pick(rng, [0.1, 0.05, 0.02, 0.01]);
    const c2 = pick(rng, [4.0e-3, 1.0e-3, 9.0e-3]);
    const tit = pick(rng, ([[20, 0.05], [10, 0.05], [25, 0.1], [20, 0.1], [10, 0.02], [25, 0.02], [20, 0.02]] as const).filter(([vs, ca]) => {
      const v = (c1 * vs) / ca;
      return v >= 5 && v <= 40;
    }));
    const [vs, cAg] = tit;
    const a1 = KSP_AGCL / c1 / 1e-9;
    const a2 = Math.sqrt(KSP_AG2CRO4 / c2) / 1e-5;
    const ag2R = r(a2) * 1e-5;
    const a3 = KSP_AGCL / ag2R / 1e-6;
    const clR = r(a3) * 1e-6;
    const a4 = ((clR / c1) * 100) / 1e-3;
    const vt = (c1 * vs) / cAg;
    const mg = c1 * vs * 143.5;
    return {
      intro: `Cl⁻ を ${f(c1, 2)} mol/L、CrO₄²⁻ を ${sci(c2, 2)} mol/L 含む水溶液に、AgNO₃ 水溶液を少しずつ加えていく。溶解度積は AgCl（白色）が ${sci(KSP_AGCL, 2)} (mol/L)²、Ag₂CrO₄（赤褐色）が ${sci(KSP_AG2CRO4, 2)} (mol/L)³ である。(1)〜(5) では、AgNO₃ 水溶液を加えても溶液の体積は変わらないとする。Ag = 108、Cl = 35.5。`,
      steps: [
        st('AgCl が沈殿し始めるときの [Ag⁺] を a×10⁻⁹ mol/L と表すとき、a を求めろ。', a1, '×10⁻⁹ mol/L',
          `[Ag⁺][Cl⁻] が溶解度積に達したとき。[Ag⁺] = ${sci(KSP_AGCL, 2)} ÷ ${f(c1, 2)} = ${sci(a1 * 1e-9, 2)} mol/L。`),
        choice(rng, 'CrO₄²⁻ の濃度を c [mol/L]、Ag₂CrO₄ の溶解度積を Ksp とするとき、Ag₂CrO₄ が沈殿し始める [Ag⁺] を表す式を選べ。',
          '√(Ksp/c)', ['Ksp/c', '√(Ksp/c)/2', 'Ksp/c²'], ['Ksp', 'c'],
          'Ag₂CrO₄ ⇄ 2Ag⁺ + CrO₄²⁻ なので Ksp = [Ag⁺]²[CrO₄²⁻]。[Ag⁺]² × c = Ksp より [Ag⁺] = √(Ksp/c)。Ksp/c は [Ag⁺] の 2 乗を忘れた式、Ksp/c² は 2 乗をつけるイオンを取り違えた式である。溶解度積には溶液中の [Ag⁺] をそのまま入れるので、係数の 2 で割ることはしない。'),
        st('Ag₂CrO₄ が沈殿し始めるときの [Ag⁺] を a×10⁻⁵ mol/L と表すとき、a を求めろ。', a2, '×10⁻⁵ mol/L',
          `[Ag⁺]²[CrO₄²⁻] = ${sci(KSP_AG2CRO4, 2)} より [Ag⁺]² = ${sci(KSP_AG2CRO4, 2)} ÷ ${sci(c2, 2)} = ${sci(KSP_AG2CRO4 / c2, 2)}。[Ag⁺] = ${sci(ag2R, 2)} mol/L。(1) よりずっと大きいので、先に沈殿するのは AgCl。`),
        st('Ag₂CrO₄ が沈殿し始めたとき、溶液に残っている [Cl⁻] を a×10⁻⁶ mol/L と表すとき、a を求めろ。', a3, '×10⁻⁶ mol/L',
          `AgCl の沈殿と平衡にあるので [Cl⁻] = ${sci(KSP_AGCL, 2)} ÷ ${sci(ag2R, 2)} = ${sci(clR, 2)} mol/L。`),
        st('(4) のとき、最初にあった Cl⁻ のうち溶液に残っているのは何 % か。a×10⁻³ % と表すときの a を求めろ。', a4, '×10⁻³ %',
          `${sci(clR, 2)} ÷ ${f(c1, 2)} × 100 = ${sci(a4 * 1e-3, 2)} %。Cl⁻ はほぼすべて沈殿しているので、赤褐色の沈殿が出はじめた点を Cl⁻ の滴定の終点にできる。`),
        st(`次に、同じ Cl⁻ 濃度の試料 ${vs}.0 mL に指示薬として少量の K₂CrO₄ を加え、${f(cAg, 2)} mol/L の AgNO₃ 水溶液で滴定した。赤褐色の沈殿が現れるまでに必要な AgNO₃ 水溶液は何 mL か。`, vt, 'mL',
          `Ag⁺ と Cl⁻ は 1 : 1 で反応する。${f(c1, 2)} × ${vs}.0 = ${f(cAg, 2)} × V より V = ${f(vt)} mL。`),
        st('(6) の終点までに生じた AgCl は何 mg か。', mg, 'mg',
          `Cl⁻ は ${f(c1, 2)} × ${vs}.0 ÷ 1000 = ${sci(c1 * vs / 1000, 2)} mol。AgCl = 143.5 なので ${sci(c1 * vs / 1000, 2)} × 143.5 g = ${f(mg)} mg。`),
      ],
      p: { c1, c2, vs, cAg, K1: KSP_AGCL, K2: KSP_AG2CRO4 },
    };
  },
};

// ───────────────────────── 5. 金属結晶 ─────────────────────────

const METALS = [
  { name: '銅', sym: 'Cu', type: 'fcc', a: 3.61, M: 63.5 },
  { name: 'アルミニウム', sym: 'Al', type: 'fcc', a: 4.05, M: 27.0 },
  { name: '銀', sym: 'Ag', type: 'fcc', a: 4.09, M: 108 },
  { name: '金', sym: 'Au', type: 'fcc', a: 4.08, M: 197 },
  { name: 'ナトリウム', sym: 'Na', type: 'bcc', a: 4.29, M: 23.0 },
  { name: '鉄', sym: 'Fe', type: 'bcc', a: 2.87, M: 55.8 },
  { name: 'カリウム', sym: 'K', type: 'bcc', a: 5.33, M: 39.1 },
] as const;

const metal: Def = {
  id: 'metal-crystal',
  title: '金属結晶の単位格子',
  unit: 'c13',
  level: 2,
  build(rng, r) {
    const mt = pick(rng, METALS);
    const fcc = mt.type === 'fcc';
    const Z = fcc ? 4 : 2;
    const cn = fcc ? 12 : 8;
    const a = mt.a * 1e-8;
    const a3 = (fcc ? (Math.SQRT2 * mt.a) / 4 : (Math.sqrt(3) * mt.a) / 4);
    const rR = r(a3);
    const a4 = Z / (a * a * a) / 1e22;
    const nR = r(a4) * 1e22;
    const rho = (nR * mt.M) / NA;
    const fill = ((Z * (4 / 3) * Math.PI * rR ** 3) / mt.a ** 3) * 100;
    return {
      intro: `${mt.name} ${mt.sym} の結晶は${fcc ? '面心立方格子' : '体心立方格子'}で、単位格子の一辺の長さは ${f(mt.a)}×10⁻⁸ cm である。原子は球で、最も近い原子どうしは接しているとする。${mt.sym} = ${f(mt.M)}、アボガドロ定数 6.02×10²³ /mol、√2 = 1.41、√3 = 1.73、π = 3.14。`,
      steps: [
        st('単位格子に含まれる原子は何個か。', Z, '個',
          fcc ? '頂点 8 個 × 1/8 + 面の中心 6 個 × 1/2 = 4 個。' : '頂点 8 個 × 1/8 + 中心 1 個 = 2 個。'),
        st('1 個の原子に最も近い原子は何個あるか（配位数）。', cn, '個',
          fcc ? '面心立方格子は最密構造で、配位数は 12。' : '体心立方格子では、中心の原子が 8 個の頂点の原子と接する。配位数は 8。'),
        st('原子の半径を a×10⁻⁸ cm と表すとき、a を求めろ。', a3, '×10⁻⁸ cm',
          fcc
            ? `面の対角線 √2 a に半径 4 つぶんが並ぶ。r = √2 a ÷ 4 = 1.41 × ${f(mt.a)} ÷ 4 = ${f(a3)}。`
            : `立方体の対角線 √3 a に半径 4 つぶんが並ぶ。r = √3 a ÷ 4 = 1.73 × ${f(mt.a)} ÷ 4 = ${f(a3)}。`),
        st('結晶 1.0 cm³ に含まれる原子の数を a×10²² 個と表すとき、a を求めろ。', a4, '×10²² 個',
          `単位格子の体積は (${f(mt.a)}×10⁻⁸)³ = ${sci(a * a * a)} cm³ で、そこに ${Z} 個。${Z} ÷ ${sci(a * a * a)} = ${sci(nR)} 個。`),
        st('この結晶の密度は何 g/cm³ か。', rho, 'g/cm³',
          `1.0 cm³ 中の原子は ${sci(nR)} ÷ 6.02×10²³ = ${f(nR / NA)} mol。${f(nR / NA)} × ${f(mt.M)} = ${f(rho)} g/cm³。`),
        st('単位格子の体積のうち原子が占める割合（充填率）は何 % か。', fill, '%',
          fcc
            ? `原子 4 個の体積 4 × (4/3)πr³ を a³ で割る。r = √2 a/4 を入れると √2π/6 = 0.74。74 %。`
            : `原子 2 個の体積 2 × (4/3)πr³ を a³ で割る。r = √3 a/4 を入れると √3π/8 = 0.68。68 %。`),
      ],
      p: { fcc: fcc ? 1 : 0, a: mt.a, M: mt.M, Z },
    };
  },
};

// ───────────────────────── 6. イオン結晶 ─────────────────────────

const IONICS = [
  { f: 'NaCl', cat: 'Na⁺', an: 'Cl⁻', type: 'NaCl', a: 5.64, M: 58.5, ra: 1.81 },
  { f: 'KCl', cat: 'K⁺', an: 'Cl⁻', type: 'NaCl', a: 6.29, M: 74.6, ra: 1.81 },
  { f: 'MgO', cat: 'Mg²⁺', an: 'O²⁻', type: 'NaCl', a: 4.21, M: 40.3, ra: 1.4 },
  { f: 'LiF', cat: 'Li⁺', an: 'F⁻', type: 'NaCl', a: 4.03, M: 25.9, ra: 1.33 },
  { f: 'CsCl', cat: 'Cs⁺', an: 'Cl⁻', type: 'CsCl', a: 4.12, M: 168.4, ra: 1.81 },
  { f: 'CsBr', cat: 'Cs⁺', an: 'Br⁻', type: 'CsCl', a: 4.29, M: 212.8, ra: 1.96 },
  { f: 'CsI', cat: 'Cs⁺', an: 'I⁻', type: 'CsCl', a: 4.57, M: 259.8, ra: 2.2 },
] as const;

const ionic: Def = {
  id: 'ionic-crystal',
  title: 'イオン結晶の単位格子',
  unit: 'c13',
  level: 2,
  build(rng, r) {
    const ic = pick(rng, IONICS);
    const rock = ic.type === 'NaCl';
    const Z = rock ? 4 : 1;
    const cn = rock ? 6 : 8;
    const d = rock ? ic.a / 2 : (Math.sqrt(3) * ic.a) / 2;
    const dR = r(d);
    const rc = dR - ic.ra;
    const vol = (ic.a * 1e-8) ** 3;
    const rho = (Z * ic.M) / (NA * vol);
    const lim = rock ? Math.SQRT2 - 1 : Math.sqrt(3) - 1;
    return {
      intro: `${ic.f} の結晶は${rock ? '塩化ナトリウム型（陽イオンと陰イオンがそれぞれ面心立方格子をつくり、互いに一辺の半分だけずれて入り組んだ構造）' : '塩化セシウム型（立方体の頂点に陰イオン、中心に陽イオンがある構造）'}で、単位格子の一辺の長さは ${f(ic.a)}×10⁻⁸ cm である。${ic.an} の半径は ${f(ic.ra)}×10⁻⁸ cm、${ic.f} の式量は ${f(ic.M, ic.M >= 100 ? 4 : 3)}、アボガドロ定数 6.02×10²³ /mol、√2 = 1.41、√3 = 1.73。`,
      steps: [
        st(`単位格子に含まれる ${ic.cat} は何個か。`, Z, '個',
          rock ? `辺の中心 12 個 × 1/4 + 中心 1 個 = 4 個（${ic.an} も頂点 8 × 1/8 + 面 6 × 1/2 = 4 個）。` : `中心に 1 個（${ic.an} は頂点 8 個 × 1/8 = 1 個）。`),
        st(`1 個の ${ic.cat} に最も近い ${ic.an} は何個あるか。`, cn, '個',
          rock ? '上下・左右・前後の 6 個。' : '立方体の頂点の 8 個。'),
        st(`最も近い ${ic.cat} と ${ic.an} の中心間の距離を a×10⁻⁸ cm と表すとき、a を求めろ。`, d, '×10⁻⁸ cm',
          rock ? `辺にそって陽イオンと陰イオンが交互に並ぶ。${f(ic.a)} ÷ 2 = ${f(d)}。` : `立方体の対角線 √3 a の半分。1.73 × ${f(ic.a)} ÷ 2 = ${f(d)}。`),
        st(`最も近い ${ic.cat} と ${ic.an} が接しているとして、${ic.cat} の半径を a×10⁻⁸ cm と表すとき、a を求めろ。`, rc, '×10⁻⁸ cm',
          `${f(dR)} − ${f(ic.ra)} = ${f(rc)}。`),
        st('この結晶の密度は何 g/cm³ か。', rho, 'g/cm³',
          `単位格子の体積は (${f(ic.a)}×10⁻⁸)³ = ${sci(vol)} cm³、その中に ${ic.f} が ${Z} 組。${Z} × ${f(ic.M, ic.M >= 100 ? 4 : 3)} ÷ (6.02×10²³ × ${sci(vol)}) = ${f(rho)} g/cm³。`),
        st(`この型の結晶で、陽イオンを小さくしていくと、やがて陰イオンどうしが接して不安定になる。陽イオンと陰イオンが接したまま陰イオンどうしもちょうど接するときの半径比（陽イオン ÷ 陰イオン）を求めろ。`, lim, '',
          rock
            ? '陰イオンどうしは面の対角線上で接する：4r₋ = √2 a。陽イオンと陰イオンは辺上で接する：2(r₊ + r₋) = a。割ると (r₊ + r₋)/r₋ = √2、r₊/r₋ = √2 − 1 = 0.41。'
            : '陰イオンどうしは辺上で接する：2r₋ = a。陽イオンと陰イオンは立方体の対角線上で接する：2(r₊ + r₋) = √3 a。割ると (r₊ + r₋)/r₋ = √3、r₊/r₋ = √3 − 1 = 0.73。'),
      ],
      p: { rock: rock ? 1 : 0, a: ic.a, M: ic.M, ra: ic.ra, Z },
    };
  },
};

// ───────────────────────── 7. 直列の電解槽 ─────────────────────────

/** [電流 A, 時間 s]。どれも電子がきりのよい物質量になる */
const ELEC_SETS: readonly (readonly [number, number])[] = [
  [0.5, 1930], [1.0, 1930], [2.0, 1930], [1.0, 965], [2.0, 965], [5.0, 965], [2.5, 1544], [0.5, 3860], [1.0, 3860], [1.0, 4825],
];

const electrolysis: Def = {
  id: 'series-electrolysis',
  title: '直列につないだ電解槽',
  unit: 'c23',
  level: 3,
  build(rng, r) {
    const [I, t] = pick(rng, ELEC_SETS);
    const Vs = pick(rng, [0.5, 1.0]);
    const c0 = pick(rng, [0.2, 0.5]);
    const vmL = Vs * 1000;
    const ne = (I * t) / FARADAY;
    const a1 = ne / 1e-2;
    const nR = r(a1) * 1e-2;
    const cu = (nR / 2) * 63.5;
    const ag = nR * 108;
    const o2 = (nR / 4) * VM * 1000;
    const h = nR / Vs;
    const pH = -log10(h);
    const cCu = (c0 * Vs - nR / 2) / Vs;
    return {
      intro: `電解槽 A に ${f(c0, 2)} mol/L の CuSO₄ 水溶液 ${fi(vmL)} mL、電解槽 B に ${f(c0, 2)} mol/L の AgNO₃ 水溶液 ${fi(vmL)} mL を入れ、どちらにも白金電極を浸して直列につなぎ、${f(I)} A の電流を ${fi(t)} 秒間流した。電気分解による溶液の体積変化は無視する。Cu = 63.5、Ag = 108、${TXT_F}、${TXT_VM}、log₁₀2 = 0.30。`,
      steps: [
        st('流れた電子の物質量を a×10⁻² mol と表すとき、a を求めろ。', a1, '×10⁻² mol',
          `電気量は ${f(I)} × ${fi(t)} = ${sci(I * t)} C。${sci(I * t)} ÷ 9.65×10⁴ = ${sci(nR)} mol。直列なので、どちらの槽にも同じだけ流れる。`),
        st('A の陰極に析出する銅は何 g か。', cu, 'g',
          `Cu²⁺ + 2e⁻ → Cu。Cu は ${sci(nR)} ÷ 2 = ${sci(nR / 2)} mol。× 63.5 = ${f(cu)} g。`),
        st('B の陰極に析出する銀は何 g か。', ag, 'g',
          `Ag⁺ + e⁻ → Ag。Ag は ${sci(nR)} mol。× 108 = ${f(ag)} g。`),
        st('A の陽極で発生する気体は標準状態で何 mL か。', o2, 'mL',
          `2H₂O → O₂ + 4H⁺ + 4e⁻。O₂ は ${sci(nR)} ÷ 4 = ${sci(nR / 4)} mol。× 22.4 L = ${f(o2)} mL。`),
        st('電気分解後の B の水溶液の pH を求めろ。電気分解前の水溶液は中性とみなす。', pH, '',
          `B の陽極でも 2H₂O → O₂ + 4H⁺ + 4e⁻ が起こり、H⁺ が電子と同じ ${sci(nR)} mol 生じる。[H⁺] = ${sci(nR)} ÷ ${f(Vs)} = ${sci(h, 2)} mol/L。pH = ${ph(pH)}。`),
        st('電気分解後の A の水溶液の Cu²⁺ の濃度は何 mol/L か。', cCu, 'mol/L',
          `はじめ ${f(c0, 2)} × ${f(Vs)} = ${f(c0 * Vs)} mol。析出した ${sci(nR / 2)} mol を引いて ${f(c0 * Vs - nR / 2)} mol。÷ ${f(Vs)} L = ${f(cCu)} mol/L。`),
      ],
      p: { I, t, Vs, c0, ne },
    };
  },
};

// ───────────────────────── 8. 鉛蓄電池 ─────────────────────────

const LEAD_SETS: readonly (readonly [number, number])[] = [
  [5.0, 3860], [10.0, 3860], [5.0, 9650], [10.0, 9650], [2.0, 9650], [4.0, 9650], [2.5, 7720],
];

const leadAcid: Def = {
  id: 'lead-acid',
  title: '鉛蓄電池の放電',
  unit: 'c22',
  level: 3,
  build(rng, r) {
    const [I, t] = pick(rng, LEAD_SETS);
    const m0 = pick(rng, [500, 1000]);
    const w0 = pick(rng, [30.0, 35.0, 38.0]);
    const ne = (I * t) / FARADAY;
    const nR = r(ne);
    const neg = 48 * nR;
    const pos = 32 * nR;
    const acid = 98 * nR;
    const acidR = r(acid);
    const water = 18 * nR;
    const waterR = r(water);
    const acid0 = (m0 * w0) / 100;
    const w1 = ((acid0 - acidR) / (m0 - acidR + waterR)) * 100;
    return {
      intro: `鉛蓄電池（負極 Pb、正極 PbO₂、電解液は希硫酸）を ${f(I)} A の一定電流で ${fi(t)} 秒間放電させた。放電前の電解液は、質量パーセント濃度 ${f(w0)} % の希硫酸 ${fi(m0)} g であった。放電の全体の反応は Pb + PbO₂ + 2H₂SO₄ → 2PbSO₄ + 2H₂O で、生じた PbSO₄ はすべて電極に付着する。H = 1.0、O = 16、S = 32、Pb = 207、${TXT_F}。`,
      steps: [
        st('流れた電子は何 mol か。', ne, 'mol',
          `${f(I)} × ${fi(t)} = ${sci(I * t)} C。÷ 9.65×10⁴ = ${f(nR)} mol。`),
        st('負極の質量は何 g 増えたか。', neg, 'g',
          `Pb + SO₄²⁻ → PbSO₄ + 2e⁻。電子 2 mol で SO₄（96 g）ぶん重くなる。96 × ${f(nR)} ÷ 2 = ${f(neg)} g。`),
        st('正極の質量は何 g 増えたか。', pos, 'g',
          `PbO₂ + 4H⁺ + SO₄²⁻ + 2e⁻ → PbSO₄ + 2H₂O。PbO₂（239）が PbSO₄（303）になるので、電子 2 mol で 64 g 増える。64 × ${f(nR)} ÷ 2 = ${f(pos)} g。`),
        st('消費された H₂SO₄ は何 g か。', acid, 'g',
          `電子 2 mol で H₂SO₄ 2 mol、つまり電子と同じ物質量。${f(nR)} × 98 = ${f(acid)} g。`),
        st('生じた水は何 g か。', water, 'g',
          `電子 2 mol で H₂O 2 mol。${f(nR)} × 18 = ${f(water)} g。`),
        choice(rng, '電子が x [mol] 流れたとき、電解液の質量は何 g 減るか。x を使って表した式を選べ。',
          '80x', ['98x', '116x', '160x'], ['x'],
          '電子 x mol で H₂SO₄ が x mol（98x g）消費され、H₂O が x mol（18x g）生じて電解液に加わる。減少は 98x − 18x = 80x g。これは両極の質量の増加 48x + 32x = 80x g に等しい。98x は水が生じることを忘れた値、116x は水のぶんを足してしまった値、160x は電子 2 mol あたりの値である。'),
        st('放電後の電解液の質量パーセント濃度は何 % か。', w1, '%',
          `放電前の H₂SO₄ は ${fi(m0)} × ${f(w0)} ÷ 100 = ${f(acid0)} g。放電後は ${f(acid0)} − ${f(acidR)} = ${f(acid0 - acidR, 4)} g。電解液は ${fi(m0)} − ${f(acidR)} + ${f(waterR)} = ${f(m0 - acidR + waterR, 4)} g。${f(acid0 - acidR, 4)} ÷ ${f(m0 - acidR + waterR, 4)} × 100 = ${f(w1)} %。`),
      ],
      p: { I, t, m0, w0, ne },
    };
  },
};

// ───────────────────────── 9. 燃料電池 ─────────────────────────

const fuelCell: Def = {
  id: 'fuel-cell',
  title: '水素–酸素燃料電池のエネルギー効率',
  unit: 'c22',
  level: 3,
  build(rng, r) {
    const vH = pick(rng, [2.24, 4.48, 5.6, 11.2, 22.4]);
    const E = pick(rng, [0.6, 0.7, 0.75, 0.8]);
    const I = pick(rng, [10, 20, 50]);
    const nH = vH / VM;
    const ne = 2 * nH;
    const neR = r(ne);
    const a2 = (neR * FARADAY) / 1e4;
    const qR = r(a2) * 1e4;
    const a3 = qR / I / 1e3;
    const en = (qR * E) / 1000;
    const enR = r(en);
    const heat = 286 * nH;
    const heatR = r(heat);
    const eff = (enR / heatR) * 100;
    return {
      intro: `リン酸形の水素–酸素燃料電池（負極 H₂ → 2H⁺ + 2e⁻、正極 O₂ + 4H⁺ + 4e⁻ → 2H₂O）を、電圧 ${f(E, 2)} V、電流 ${fi(I)} A の一定条件で運転したところ、負極で標準状態に換算して ${f(vH)} L の水素が消費された。水素の燃焼エンタルピー（生じる水は液体）は −286 kJ/mol である。1 J = 1 C × 1 V、${TXT_F}、${TXT_VM}。`,
      steps: [
        st('回路を流れた電子は何 mol か。', ne, 'mol',
          `H₂ は ${f(vH)} ÷ 22.4 = ${f(nH)} mol。H₂ 1 mol から電子 2 mol。${f(ne)} mol。`),
        st('流れた電気量を a×10⁴ C と表すとき、a を求めろ。', a2, '×10⁴ C',
          `${f(neR)} × 9.65×10⁴ = ${sci(qR)} C。`),
        st('運転した時間を a×10³ 秒と表すとき、a を求めろ。', a3, '×10³ 秒',
          `電気量 = 電流 × 時間。${sci(qR)} ÷ ${fi(I)} = ${sci(qR / I)} 秒。`),
        st('取り出された電気エネルギーは何 kJ か。', en, 'kJ',
          `電気量 × 電圧 = ${sci(qR)} × ${f(E, 2)} = ${sci(qR * E)} J = ${f(en)} kJ。`),
        st('同じ量の水素を燃焼させたときに出る熱は何 kJ か。', heat, 'kJ',
          `286 × ${f(nH)} = ${f(heat)} kJ。`),
        st('この燃料電池のエネルギー変換効率（電気エネルギー ÷ 燃焼で出る熱）は何 % か。', eff, '%',
          `${f(enR)} ÷ ${f(heatR)} × 100 = ${f(eff)} %。残りは熱になって逃げる。`),
      ],
      p: { vH, E, I },
    };
  },
};

// ───────────────────────── 10. 熱化学 ─────────────────────────

const HF_CO2 = -394;
const HF_H2O = -286;
const FUELS = [
  { f: 'CH₄', name: 'メタン', c: 1, h: 4, hf: -75 },
  { f: 'C₂H₆', name: 'エタン', c: 2, h: 6, hf: -84 },
  { f: 'C₃H₈', name: 'プロパン', c: 3, h: 8, hf: -105 },
  { f: 'C₂H₄', name: 'エチレン', c: 2, h: 4, hf: 52 },
  { f: 'C₂H₂', name: 'アセチレン', c: 2, h: 2, hf: 227 },
] as const;
const FUEL_PAIRS: readonly (readonly [number, number])[] = [[0, 1], [0, 2], [1, 2], [0, 3], [3, 1], [0, 4], [4, 2], [3, 2]];
const coef = (n: number): string => (n === 1 ? '' : Number.isInteger(n) ? String(n) : `(${n * 2}/2)`);

const thermo: Def = {
  id: 'combustion-enthalpy',
  title: '生成エンタルピーから燃焼エンタルピーと水の温度上昇へ',
  unit: 'c21',
  level: 2,
  build(rng, r) {
    const [ia, ib] = pick(rng, FUEL_PAIRS);
    const A = FUELS[ia];
    const B = FUELS[ib];
    const [ra, rb] = pick(rng, [[1, 1], [3, 1], [1, 3], [2, 3], [4, 1], [1, 4]] as const);
    const V = pick(rng, [2.24, 5.6, 11.2]);
    const eta = pick(rng, [50, 80, 100]);
    const n = V / VM;
    const nA = (n * ra) / (ra + rb);
    const nB = (n * rb) / (ra + rb);
    const dA = A.c * HF_CO2 + (A.h / 2) * HF_H2O - A.hf;
    const dB = B.c * HF_CO2 + (B.h / 2) * HF_H2O - B.hf;
    const qTrue = -(nA * dA + nB * dB);
    const mw = pick(rng, [1.0, 2.0, 5.0, 10.0, 20.0].filter((kg) => {
      const dT = (qTrue * (eta / 100)) / (4.18 * kg);
      return dT >= 10 && dT <= 60;
    }));
    const Q = -(nA * dA + nB * dB);
    const QR = r(Q);
    const dT = (QR * (eta / 100)) / (4.18 * mw);
    const o2 = (nA * (A.c + A.h / 4) + nB * (B.c + B.h / 4)) * VM;
    const eq = (x: typeof A): string => `${x.f} + ${coef(x.c + x.h / 4)}O₂ → ${coef(x.c)}CO₂ + ${coef(x.h / 2)}H₂O(液)`;
    const dh = (x: typeof A, d: number): string => `ΔH = ${x.c === 1 ? '' : `${x.c} × `}(−394) + ${x.h / 2 === 1 ? '' : `${x.h / 2} × `}(−286) − ${par(x.hf)} = ${fi(d)} kJ/mol`;
    return {
      intro: `生成エンタルピーは CO₂(気) −394、H₂O(液) −286、${A.name} ${A.f}(気) ${signed(A.hf)}、${B.name} ${B.f}(気) ${signed(B.hf)} kJ/mol である。${A.name}と${B.name}を物質量の比 ${ra} : ${rb} で混ぜた気体が、標準状態で ${f(V)} L ある。これを完全燃焼させ、出た熱の ${eta} % を ${f(mw, 2)} kg の水に与えた。燃焼で生じる水は液体とする。水の比熱 4.18 J/(g·K)、${TXT_VM}。`,
      steps: [
        st(`${A.name}の燃焼エンタルピー ΔH は何 kJ/mol か。符号をつけて答えろ。`, dA, 'kJ/mol',
          `${eq(A)}。ΔH = (生成物の生成エンタルピーの和) − (反応物の生成エンタルピーの和)。O₂ は単体なので 0。${dh(A, dA)}。`),
        st(`${B.name}の燃焼エンタルピー ΔH は何 kJ/mol か。符号をつけて答えろ。`, dB, 'kJ/mol',
          `${eq(B)}。${dh(B, dB)}。`),
        st('この混合気体を完全燃焼させたときに出る熱は何 kJ か。', Q, 'kJ',
          `混合気体は ${f(V)} ÷ 22.4 = ${f(n)} mol。${A.name} ${f(nA)} mol、${B.name} ${f(nB)} mol。${f(nA)} × ${fi(-dA)} + ${f(nB)} × ${fi(-dB)} = ${f(Q)} kJ。`),
        st('水の温度は何 K 上がるか。', dT, 'K',
          `水が受け取る熱は ${f(QR)} × ${eta / 100} = ${f(QR * eta / 100)} kJ。${sci(QR * eta * 10)} J ÷ (4.18 × ${sci(mw * 1000, 2)} g) = ${f(dT)} K。`),
        st('この燃焼に必要な酸素は標準状態で何 L か。', o2, 'L',
          `${A.name} 1 mol に O₂ ${f(A.c + A.h / 4, 2)} mol、${B.name} 1 mol に O₂ ${f(B.c + B.h / 4, 2)} mol。(${f(nA)} × ${f(A.c + A.h / 4, 2)} + ${f(nB)} × ${f(B.c + B.h / 4, 2)}) × 22.4 = ${f(o2)} L。`),
      ],
      p: { ia, ib, ra, rb, V, eta, mw, nA, nB },
    };
  },
};

// ───────────────────────── 11. 結合エネルギー（NH₃） ─────────────────────────

const bondNH3: Def = {
  id: 'bond-energy-nh3',
  title: '結合エネルギーとアンモニアの生成エンタルピー',
  unit: 'c21',
  level: 3,
  build(rng, r) {
    const ENN = pick(rng, [942, 945, 946]);
    const EHH = pick(rng, [432, 436]);
    const vH = pick(rng, [3.36, 6.72, 11.2, 33.6, 67.2]);
    const HF = -46;
    const HF_N2H4 = 95;
    const dH = 2 * HF;
    const brk = ENN + 3 * EHH;
    const ENH = (brk - dH) / 6;
    const eR = r(ENH);
    const ENNs = ENN + 2 * EHH - 4 * eR - HF_N2H4;
    const heat = ((vH / VM) * -dH) / 3;
    return {
      intro: `アンモニア NH₃(気) の生成エンタルピーは −46 kJ/mol、ヒドラジン N₂H₄(気)（H₂N–NH₂）の生成エンタルピーは +95 kJ/mol である。結合エネルギーは N≡N が ${ENN} kJ/mol、H–H が ${EHH} kJ/mol である。${TXT_VM}。`,
      steps: [
        st('N₂ + 3H₂ → 2NH₃ の ΔH は何 kJ か。符号をつけて答えろ。', dH, 'kJ',
          'NH₃ が 2 mol できる反応なので、生成エンタルピーの 2 倍。2 × (−46) = −92 kJ。'),
        st('N₂ 1 mol と H₂ 3 mol の結合をすべて切って原子にするのに必要なエネルギーは何 kJ か。', brk, 'kJ',
          `${ENN} + 3 × ${EHH} = ${brk} kJ。`),
        st('N–H の結合エネルギーは何 kJ/mol か。', ENH, 'kJ/mol',
          `ΔH = (切る結合のエネルギーの和) − (できる結合のエネルギーの和)。NH₃ 2 mol には N–H が 6 mol。−92 = ${brk} − 6x より x = (${brk} + 92) ÷ 6 = ${f(ENH)} kJ/mol。`),
        st('N₂ + 2H₂ → N₂H₄(気) を考えて、ヒドラジンの N–N 単結合の結合エネルギーは何 kJ/mol か。N–H の結合エネルギーは (3) の値を使え。', ENNs, 'kJ/mol',
          `N₂H₄ には N–N が 1 本、N–H が 4 本。+95 = (${ENN} + 2 × ${EHH}) − (y + 4 × ${f(eR)})。y = ${ENN + 2 * EHH} − ${f(4 * eR, 4)} − 95 = ${f(ENNs)} kJ/mol。三重結合の 1/3 よりずっと小さい。`, 0.03),
        st(`標準状態で ${f(vH)} L の H₂ がすべて N₂ と反応して NH₃ になるとき、出る熱は何 kJ か。`, heat, 'kJ',
          `H₂ は ${f(vH)} ÷ 22.4 = ${f(vH / VM)} mol。H₂ 3 mol あたり 92 kJ の発熱。92 × ${f(vH / VM)} ÷ 3 = ${f(heat)} kJ。`),
      ],
      p: { ENN, EHH, vH },
    };
  },
};

// ───────────────────────── 12. ヘスの法則（炭化水素） ─────────────────────────

const hessCH4: Def = {
  id: 'hess-carbon-cycle',
  title: '黒鉛の昇華エンタルピーと C–C、C=C の結合エネルギー',
  unit: 'c21',
  level: 3,
  build(rng, r) {
    const ECH = pick(rng, [413, 415, 416]);
    const EHH = pick(rng, [432, 436]);
    const vE = pick(rng, [1.12, 2.24, 5.6, 11.2]);
    const atom = 4 * ECH;
    const subl = -75 + atom - 2 * EHH;
    const ECC = 2 * subl + 3 * EHH - 6 * ECH + 84;
    const ECd = 2 * subl + 2 * EHH - 4 * ECH - 52;
    const dHyd = ECd + EHH - (ECC + 2 * ECH);
    const dR = r(dHyd);
    const heat = (-dR * vE) / VM;
    return {
      intro: `生成エンタルピーはメタン CH₄(気) −75、エタン C₂H₆(気) −84、エチレン C₂H₄(気) +52 kJ/mol である。結合エネルギーは C–H が ${ECH} kJ/mol、H–H が ${EHH} kJ/mol で、C–H の値はどの炭化水素でも同じとする。${TXT_VM}。`,
      steps: [
        st('CH₄(気) → C(気) + 4H(気) の ΔH は何 kJ か。', atom, 'kJ',
          `C–H を 4 mol 切る。4 × ${ECH} = ${atom} kJ。`),
        st('黒鉛の昇華エンタルピー C(黒鉛) → C(気) の ΔH は何 kJ/mol か。', subl, 'kJ/mol',
          `C(黒鉛) + 2H₂ → CH₄ ΔH = −75 kJ を、黒鉛の昇華（x）、H₂ 2 mol の解離（2 × ${EHH}）、C–H 4 mol の生成（−${atom}）に分ける。−75 = x + ${2 * EHH} − ${atom}。x = ${subl} kJ/mol。`),
        st('エタンの生成エンタルピーを使って、C–C 単結合の結合エネルギーは何 kJ/mol か。', ECC, 'kJ/mol',
          `2C(黒鉛) + 3H₂ → C₂H₆ ΔH = −84 kJ。C₂H₆ には C–C 1 本と C–H 6 本。−84 = 2 × ${subl} + 3 × ${EHH} − (y + 6 × ${ECH})。y = ${2 * subl + 3 * EHH} − ${6 * ECH} + 84 = ${ECC} kJ/mol。`),
        st('エチレンの生成エンタルピーを使って、C=C 二重結合の結合エネルギーは何 kJ/mol か。', ECd, 'kJ/mol',
          `2C(黒鉛) + 2H₂ → C₂H₄ ΔH = +52 kJ。C₂H₄ には C=C 1 本と C–H 4 本。52 = 2 × ${subl} + 2 × ${EHH} − (z + 4 × ${ECH})。z = ${2 * subl + 2 * EHH} − ${4 * ECH} − 52 = ${ECd} kJ/mol。単結合の 2 倍より小さい。`),
        st('(3)(4) の結合エネルギーを使って、C₂H₄ + H₂ → C₂H₆ の ΔH は何 kJ か。符号をつけて答えろ。', dHyd, 'kJ',
          `切る結合は C=C と H–H、できる結合は C–C と C–H 2 本。(${ECd} + ${EHH}) − (${ECC} + 2 × ${ECH}) = ${fi(dHyd)} kJ。生成エンタルピーの差 −84 − 52 と一致する。`),
        st(`標準状態で ${f(vE)} L のエチレンに水素を完全に付加させるとき、出る熱は何 kJ か。`, heat, 'kJ',
          `エチレンは ${f(vE)} ÷ 22.4 = ${f(vE / VM)} mol。${fi(-dR)} × ${f(vE / VM)} = ${f(heat)} kJ。`),
      ],
      p: { ECH, EHH, vE },
    };
  },
};

// ───────────────────────── 13. 一次反応 ─────────────────────────

const firstOrder: Def = {
  id: 'first-order-h2o2',
  title: '過酸化水素の分解と反応速度定数',
  unit: 'c24',
  level: 2,
  build(rng, r) {
    const c0 = pick(rng, [0.5, 0.8, 1.0]);
    const fr = pick(rng, [0.08, 0.1, 0.12]);
    const t1 = pick(rng, [1.0, 2.0, 4.0]);
    const nh = pick(rng, [2, 3]);
    const vmL = pick(rng, [10, 20, 50]);
    const c1 = c0 * (1 - fr);
    const a1 = (c0 - c1) / t1 / 1e-2;
    const vR = r(a1) * 1e-2;
    const cAvg = (c0 + c1) / 2;
    const a2 = vR / cAvg / 1e-2;
    const kR = r(a2) * 1e-2;
    const half = 0.693 / kR;
    const cn = c0 / 2 ** nh;
    const cnR = r(cn);
    const o2 = (((c0 - cnR) * vmL) / 1000 / 2) * VM * 1000;
    const a6 = (kR * cnR) / 1e-3;
    return {
      intro: `濃度 ${f(c0)} mol/L の過酸化水素水 ${vmL}.0 mL に少量の酸化マンガン(IV)を加え、一定温度に保つと、2H₂O₂ → 2H₂O + O₂ の反応が進んだ。反応開始から ${f(t1, 2)} 分後、H₂O₂ の濃度は ${f(c1)} mol/L になっていた。この反応の速度は v = k[H₂O₂] に従う。溶液の体積は変わらないとする。logₑ2 = 0.693、${TXT_VM}。`,
      steps: [
        st(`反応開始から ${f(t1, 2)} 分後までの、H₂O₂ の平均の分解速度を a×10⁻² mol/(L·分) と表すとき、a を求めろ。`, a1, '×10⁻² mol/(L·分)',
          `(${f(c0)} − ${f(c1)}) ÷ ${f(t1, 2)} = ${sci(vR)} mol/(L·分)。`),
        st('この間の平均の速度と平均の濃度を v = k[H₂O₂] に当てはめて、速度定数 k を a×10⁻² /分 と表すとき、a を求めろ。', a2, '×10⁻² /分',
          `平均の濃度は (${f(c0)} + ${f(c1)}) ÷ 2 = ${f(cAvg)} mol/L。k = ${sci(vR)} ÷ ${f(cAvg)} = ${sci(kR)} /分。`),
        choice(rng, 'この反応では、時刻 t での濃度は [H₂O₂] = c₀e⁻ᵏᵗ（c₀ は初濃度）と表される。濃度が c₀ の半分になるまでの時間（半減期）を表す式を選べ。',
          '(logₑ2)/k', ['1/(2k)', 'c₀/(2k)', 'k/(logₑ2)'], ['logₑ2', 'k'],
          'c₀/2 = c₀e⁻ᵏᵗ より e⁻ᵏᵗ = 1/2、kt = logₑ2。t = (logₑ2)/k。c₀ が消えるので、一次反応の半減期は初濃度によらない。c₀/(2k) は、速度が濃度によらず一定だと考えたときの式である。'),
        st('この反応の半減期は何分か。', half, '分',
          `0.693 ÷ ${sci(kR)} = ${f(half)} 分。一次反応の半減期は濃度によらない。`),
        st(`半減期の ${nh} 倍の時間がたったとき、H₂O₂ の濃度は何 mol/L か。`, cn, 'mol/L',
          `半減期ごとに半分になる。${f(c0)} × (1/2)${sup(nh)} = ${f(cn)} mol/L。`),
        st('(5) の時点までに発生した O₂ は標準状態で何 mL か。', o2, 'mL',
          `分解した H₂O₂ は (${f(c0)} − ${f(cnR)}) × ${vmL}.0 ÷ 1000 = ${sci(((c0 - cnR) * vmL) / 1000)} mol。O₂ はその半分で ${sci(((c0 - cnR) * vmL) / 2000)} mol。× 22.4 L = ${f(o2)} mL。`),
        st('(5) の時点での H₂O₂ の分解速度を a×10⁻³ mol/(L·分) と表すとき、a を求めろ。', a6, '×10⁻³ mol/(L·分)',
          `v = k[H₂O₂] = ${sci(kR)} × ${f(cnR)} = ${sci(kR * cnR)} mol/(L·分)。`),
      ],
      p: { c0, c1, t1, nh, vmL },
    };
  },
};

// ───────────────────────── 14. 凝固点降下（電解質） ─────────────────────────

const NONELEC = [{ M: 180 }, { M: 60 }, { M: 342 }, { M: 92 }] as const;
const ELECS = [
  { f: 'NaCl', name: '塩化ナトリウム', M: 58.5, nu: 2, ions: 'Na⁺ と Cl⁻', alphas: [0.85, 0.9, 0.95] },
  { f: 'CaCl₂', name: '塩化カルシウム', M: 111, nu: 3, ions: 'Ca²⁺ 1 個と Cl⁻ 2 個', alphas: [0.75, 0.8, 0.9] },
  { f: 'Na₂SO₄', name: '硫酸ナトリウム', M: 142, nu: 3, ions: 'Na⁺ 2 個と SO₄²⁻ 1 個', alphas: [0.7, 0.8, 0.85] },
] as const;
const KF_WATER = 1.85;

const fpElectrolyte: Def = {
  id: 'freezing-electrolyte',
  title: '凝固点降下と電解質の見かけの電離度',
  unit: 'c15',
  level: 3,
  build(rng, r) {
    const X = pick(rng, NONELEC);
    const mX = pick(rng, [0.1, 0.2, 0.25]);
    const W = pick(rng, [100, 200]);
    const el = pick(rng, ELECS);
    const alphaTrue = pick(rng, el.alphas);
    const mB = pick(rng, [0.05, 0.1]);
    const wkg = W / 1000;
    const x = sig3(X.M * mX * wkg);
    const dt1 = sig3((KF_WATER * x) / X.M / wkg);
    const y = sig3(el.M * mB * wkg);
    const dt2 = sig3(KF_WATER * (y / el.M / wkg) * (1 + (el.nu - 1) * alphaTrue));
    const mol1 = dt1 / KF_WATER;
    const mol1R = r(mol1);
    const M = x / (mol1R * wkg);
    const mForm = y / el.M / wkg;
    const mFormR = r(mForm);
    const i = dt2 / (KF_WATER * mFormR);
    const iR = r(i);
    const alpha = (iR - 1) / (el.nu - 1);
    return {
      intro: `水 ${fi(W)} g に非電解質 X を ${f(x)} g 溶かした水溶液の凝固点は −${f(dt1)} ℃ であった。また、水 ${fi(W)} g に${el.name} ${el.f} を ${f(y)} g 溶かした水溶液の凝固点は −${f(dt2)} ℃ であった。純水の凝固点は 0 ℃、水のモル凝固点降下は 1.85 K·kg/mol、${el.f} = ${f(el.M)}。`,
      steps: [
        st('X の水溶液の質量モル濃度は何 mol/kg か。', mol1, 'mol/kg',
          `Δt = Kf × m より m = ${f(dt1)} ÷ 1.85 = ${f(mol1)} mol/kg。`),
        st('X の分子量を求めろ。', M, '',
          `水 ${f(wkg)} kg に X は ${f(mol1R)} × ${f(wkg)} = ${f(mol1R * wkg)} mol。${f(x)} ÷ ${f(mol1R * wkg)} = ${f(M)}。`),
        st(`${el.f} が電離しないと仮定したときの、${el.f} 水溶液の質量モル濃度は何 mol/kg か。`, mForm, 'mol/kg',
          `${f(y)} ÷ ${f(el.M)} = ${sci(y / el.M)} mol。÷ ${f(wkg)} kg = ${f(mForm)} mol/kg。`),
        st(`実際の凝固点降下は、${el.f} が電離しないと仮定したときの何倍か。`, i, '倍',
          `電離しないなら Δt = 1.85 × ${f(mFormR)} = ${f(KF_WATER * mFormR)} K。実際は ${f(dt2)} K。${f(dt2)} ÷ ${f(KF_WATER * mFormR)} = ${f(i)} 倍。溶質粒子の総数がこれだけ増えている。`),
        choice(rng, `${el.f} の電離度を α とするとき、溶質粒子の総数は、電離しないと仮定したときの何倍になるか。式を選べ。`,
          el.nu === 2 ? '1 + α' : '1 + 2α', el.nu === 2 ? ['2α', '1 + 2α', '1 − α'] : ['1 + α', '3α', '1 + 3α'], ['α'],
          `${el.f} 1 mol のうち α mol が電離して ${el.ions} になる。電離せずに残るのが 1 − α mol、生じるイオンが合わせて ${el.nu}α mol。合計 1 − α + ${el.nu}α = ${el.nu === 2 ? '1 + α' : '1 + 2α'} 倍。${el.nu}α は電離しなかったぶんを数え忘れた式である。`),
        st(`${el.f} の見かけの電離度 α を求めろ。`, alpha, '',
          `${el.f} 1 個が電離すると ${el.ions} の ${el.nu} 個になる。粒子の数は 1 − α + ${el.nu}α = 1 + ${el.nu - 1}α 倍。1 + ${el.nu - 1}α = ${f(iR)} より α = ${f(alpha)}。`),
      ],
      p: { MX: X.M, W, x, dt1, Mel: el.M, nu: el.nu, alphaTrue, y, dt2 },
    };
  },
};

// ───────────────────────── 15. 凝固点降下（会合） ─────────────────────────

const KF_BENZENE = 5.12;

const fpDimer: Def = {
  id: 'freezing-dimer',
  title: 'ベンゼン中の酢酸の会合度',
  unit: 'c15',
  level: 3,
  build(rng, r) {
    const W = pick(rng, [100, 200]);
    const m1 = pick(rng, [0.1, 0.2]);
    const mA = pick(rng, [0.1, 0.2]);
    const betaTrue = pick(rng, [0.8, 0.85, 0.9, 0.95]);
    const wkg = W / 1000;
    const x = sig3(128 * m1 * wkg);
    const dt1 = sig3((KF_BENZENE * x) / 128 / wkg);
    const y = sig3(60 * mA * wkg);
    const dt2 = sig3(KF_BENZENE * (y / 60 / wkg) * (1 - betaTrue / 2));
    const kf = dt1 / (x / 128 / wkg);
    const kfR = r(kf);
    const mp = dt2 / kfR;
    const mpR = r(mp);
    const Mapp = y / (mpR * wkg);
    const MappR = r(Mapp);
    const beta = 2 * (1 - 60 / MappR);
    const bR = r(beta);
    const a5 = ((y / 60) * bR) / 2 / 1e-3;
    return {
      intro: `ベンゼン ${fi(W)} g にナフタレン C₁₀H₈ を ${f(x)} g 溶かすと、凝固点は純ベンゼンより ${f(dt1)} K 下がった。次に、ベンゼン ${fi(W)} g に酢酸 CH₃COOH を ${f(y)} g 溶かすと、凝固点は ${f(dt2)} K 下がった。ベンゼン中では、酢酸の一部は 2 分子が水素結合で結びついた二量体になっている（2CH₃COOH ⇄ (CH₃COOH)₂）。C₁₀H₈ = 128、CH₃COOH = 60。`,
      steps: [
        st('ナフタレンの結果から、ベンゼンのモル凝固点降下は何 K·kg/mol か。', kf, 'K·kg/mol',
          `ナフタレンは ${f(x)} ÷ 128 = ${sci(x / 128)} mol。質量モル濃度は ${f(x / 128 / wkg)} mol/kg。${f(dt1)} ÷ ${f(x / 128 / wkg)} = ${f(kf)} K·kg/mol。`),
        st('酢酸の溶液中の溶質粒子（単量体と二量体の合計）の質量モル濃度は何 mol/kg か。', mp, 'mol/kg',
          `${f(dt2)} ÷ ${f(kfR)} = ${f(mp)} mol/kg。`),
        st('この凝固点降下から求められる酢酸の見かけの分子量を求めろ。', Mapp, '',
          `粒子は ${f(mpR)} × ${f(wkg)} = ${sci(mpR * wkg)} mol。${f(y)} ÷ ${sci(mpR * wkg)} = ${f(Mapp)}。60 より大きいのは、二量体ができて粒子の数が減っているから。`),
        choice(rng, 'ベンゼンに溶かした酢酸 n [mol] のうち、割合 β の分子が二量体になっているとする。溶液中の溶質粒子（単量体と二量体）の総物質量を表す式を選べ。',
          'n(1 − β/2)', ['n(1 − β)', 'n(1 + β)', 'n(1 + β/2)'], ['n', 'β'],
          '単量体のまま残るのは n(1 − β) mol。二量体になった nβ mol の分子は、2 分子で 1 粒子なので nβ/2 mol の粒子になる。合計 n(1 − β) + nβ/2 = n(1 − β/2)。n(1 − β) は二量体を数え忘れた式、n(1 + β) は電離（1 個が 2 個に分かれる）と取り違えた式である。'),
        st('酢酸分子のうち二量体になっているものの割合（会合度）β を求めろ。', beta, '',
          `はじめ n mol の酢酸のうち βn mol が二量体 βn/2 mol になる。粒子は n(1 − β) + nβ/2 = n(1 − β/2) mol。見かけの分子量 = 60 ÷ (1 − β/2) = ${f(MappR)} より 1 − β/2 = ${f(60 / MappR)}、β = ${f(beta)}。`, 0.03),
        st('この溶液中の二量体の物質量を a×10⁻³ mol と表すとき、a を求めろ。', a5, '×10⁻³ mol',
          `酢酸は ${f(y)} ÷ 60 = ${sci(y / 60)} mol。二量体は ${sci(y / 60)} × ${f(bR)} ÷ 2 = ${sci(a5 * 1e-3)} mol。`, 0.03),
      ],
      p: { W, x, dt1, y, dt2, betaTrue },
    };
  },
};

// ───────────────────────── 16. 浸透圧 ─────────────────────────

const osmotic: Def = {
  id: 'osmotic-polymer',
  title: '浸透圧による高分子の分子量測定',
  unit: 'c15',
  level: 2,
  build(rng, r) {
    const Mtrue = pick(rng, [2.2e4, 4.4e4, 6.6e4, 8.8e4]);
    const x = pick(rng, [1.0, 2.0]);
    const vmL = pick(rng, [100, 200]);
    const T = 300;
    const V = vmL / 1000;
    const Pi = sig3((x / Mtrue / V) * R * T);
    const a1 = Pi / (R * T) / 1e-4;
    const cR = r(a1) * 1e-4;
    const a2 = x / (cR * V) / 1e4;
    const MR = r(a2) * 1e4;
    const deg = MR / 44;
    const h = Pi / 98;
    const a5 = (Pi * MR) / 180 / 1e5;
    const a6 = (KF_WATER * cR) / 1e-4;
    return {
      intro: `ポリビニルアルコール（繰り返し単位 –CH₂–CH(OH)–、式量 44）${f(x)} g を水に溶かして ${fi(vmL)} mL にした水溶液の浸透圧は、27 ℃ で ${fi(Pi)} Pa であった。${TXT_R}、グルコース C₆H₁₂O₆ = 180、水のモル凝固点降下 1.85 K·kg/mol。高さ 1.0 cm の水溶液の柱が底面におよぼす圧力は 98 Pa とする。`,
      steps: [
        choice(rng, '一般に、溶質 w [g] を溶かして体積 V [L] にした水溶液の浸透圧が、温度 T [K] で Π [Pa] であった。溶質のモル質量 M [g/mol] を表す式を選べ。R は気体定数。',
          'wRT/(ΠV)', ['ΠV/(wRT)', 'wRT/Π', 'wΠV/(RT)'], ['w', 'R', 'T', 'Π', 'V'],
          'ファントホッフの法則 ΠV = nRT に n = w/M を入れると ΠV = (w/M)RT。M = wRT/(ΠV)。ΠV/(wRT) は逆数、wRT/Π は体積で割り忘れた式である。'),
        st('この水溶液のモル濃度を a×10⁻⁴ mol/L と表すとき、a を求めろ。', a1, '×10⁻⁴ mol/L',
          `Π = cRT より c = ${fi(Pi)} ÷ (8.31×10³ × 300) = ${sci(cR)} mol/L。`),
        st('このポリビニルアルコールの平均分子量を a×10⁴ と表すとき、a を求めろ。', a2, '×10⁴',
          `${fi(vmL)} mL 中に ${sci(cR)} × ${f(V)} = ${sci(cR * V)} mol。${f(x)} ÷ ${sci(cR * V)} = ${sci(MR)}。`),
        st('平均の重合度（1 分子あたりの繰り返し単位の数）を求めろ。', deg, '',
          `${sci(MR)} ÷ 44 = ${f(deg)}。`),
        st('この水溶液と純水を半透膜で仕切った U 字管に入れると、液面の高さの差は何 cm になるか。浸透による濃度の変化は無視する。', h, 'cm',
          `液柱の圧力が浸透圧とつり合う。${fi(Pi)} ÷ 98 = ${f(h)} cm。`),
        st(`同じ質量（${f(x)} g）のグルコースを溶かして ${fi(vmL)} mL にした水溶液の、27 ℃ での浸透圧を a×10⁵ Pa と表すとき、a を求めろ。`, a5, '×10⁵ Pa',
          `同じ質量なら、物質量も浸透圧も分子量に反比例する。${fi(Pi)} × ${sci(MR)} ÷ 180 = ${sci(a5 * 1e5)} Pa。`),
        st('ポリビニルアルコール水溶液の凝固点降下度を a×10⁻⁴ K と表すとき、a を求めろ。うすい水溶液なので、質量モル濃度はモル濃度と同じ値としてよい。', a6, '×10⁻⁴ K',
          `1.85 × ${sci(cR)} = ${sci(a6 * 1e-4)} K。小さすぎて測れない。高分子の分子量測定に浸透圧が使われる理由である。`),
      ],
      p: { Mtrue, x, vmL, Pi, T },
    };
  },
};

// ───────────────────────── 17. ヘンリーの法則 ─────────────────────────

const HENRY_T = [
  { T: 280, k: 0.06 },
  { T: 290, k: 0.043 },
  { T: 300, k: 0.032 },
] as const;

const henry: Def = {
  id: 'henry-co2',
  title: 'ヘンリーの法則と密閉容器内の CO₂',
  unit: 'c14',
  level: 3,
  build(rng, r) {
    const ht = pick(rng, HENRY_T);
    const Vw = pick(rng, [1.0, 2.0]);
    const Vg = pick(rng, [0.5, 1.0, 2.0]);
    const n = pick(rng, [0.1, 0.15, 0.2]);
    const ratio = pick(rng, [0.5, 2]);
    const Vg2 = Vg * ratio;
    const T = ht.T;
    const b = ht.k * Vw;
    const a1 = (1e5 * Vg) / (R * T) / 1e-2;
    const aR = r(a1) * 1e-2;
    const a2 = n / (aR + b);
    const P1R = r(a2);
    const a3 = (b * P1R) / 1e-2;
    const a4 = n / (aR * ratio + b);
    const P2R = r(a4);
    const mass = b * P2R * 44;
    const pct = ((b * P2R) / n) * 100;
    return {
      intro: `ピストンのついた密閉容器に水 ${f(Vw)} L と二酸化炭素 ${f(n, 2)} mol を入れ、気体部分の体積を ${f(Vg)} L にして ${T - 273} ℃ に保ち、溶解平衡に達させた。この温度で、CO₂ は圧力 1.0×10⁵ Pa のとき水 1.0 L に ${sci(ht.k, 2)} mol 溶ける。CO₂ の溶解はヘンリーの法則に従い、水の蒸気圧、水の体積変化、CO₂ と水の反応は無視する。CO₂ = 44、${TXT_R}。`,
      steps: [
        st('仮に気体部分の圧力が 1.0×10⁵ Pa だとすると、気体部分にある CO₂ は何 mol か。a×10⁻² mol と表すときの a を求めろ。', a1, '×10⁻² mol',
          `n = PV/RT = 1.0×10⁵ × ${f(Vg)} ÷ (8.31×10³ × ${T}) = ${sci(aR)} mol。`),
        choice(rng, '気体部分の圧力を P [Pa]、気体部分の体積を V [L]、水の体積を W [L]、温度を T [K] とし、1.0×10⁵ Pa のとき水 1 L に溶ける CO₂ を k [mol] とする。容器内の CO₂ の全物質量を表す式を選べ。',
          'PV/(RT) + kWP/(1.0×10⁵)', ['PV/(RT) + kW', 'PV/(RT) + kWP', 'P(V + W)/(RT) + kWP/(1.0×10⁵)'], ['P', 'V', 'R', 'T', 'k', 'W'],
          '気体部分の CO₂ は状態方程式から PV/(RT) mol。水に溶けている CO₂ は、ヘンリーの法則により圧力に比例するので k × W × P/(1.0×10⁵) mol。この和 PV/(RT) + kWP/(1.0×10⁵) が、入れた CO₂ の物質量に等しい。kW は圧力に比例させ忘れた式、kWP は基準の圧力 1.0×10⁵ Pa で割り忘れた式、P(V + W)/(RT) は水の体積まで気体として数えた式である。'),
        st('平衡に達したときの気体部分の圧力を a×10⁵ Pa と表すとき、a を求めろ。', a2, '×10⁵ Pa',
          `圧力を a×10⁵ Pa とすると、気体部分に ${sci(aR)} × a mol、水中に ${sci(ht.k, 2)} × ${f(Vw)} × a = ${sci(b)} × a mol。合計が ${f(n, 2)} mol。a = ${f(n, 2)} ÷ (${sci(aR)} + ${sci(b)}) = ${f(a2)}。`),
        st('このとき水に溶けている CO₂ を a×10⁻² mol と表すとき、a を求めろ。', a3, '×10⁻² mol',
          `溶ける量は圧力に比例する。${sci(b)} × ${f(P1R)} = ${sci(a3 * 1e-2)} mol。`),
        st(`次に、温度を変えずにピストンを動かして気体部分の体積を ${f(Vg2)} L にし、ふたたび平衡に達させた。気体部分の圧力を a×10⁵ Pa と表すとき、a を求めろ。`, a4, '×10⁵ Pa',
          `1.0×10⁵ Pa あたり気体部分に入る量は ${ratio === 2 ? '2 倍' : '半分'}の ${sci(aR * ratio)} mol になる。a = ${f(n, 2)} ÷ (${sci(aR * ratio)} + ${sci(b)}) = ${f(a4)}。${ratio === 2 ? '体積を 2 倍にしても圧力は半分にはならない。水から CO₂ が出てくるからである。' : '体積を半分にしても圧力は 2 倍にはならない。CO₂ がさらに水に溶けるからである。'}`),
        st('(5) のとき水に溶けている CO₂ は何 g か。', mass, 'g',
          `${sci(b)} × ${f(P2R)} = ${sci(b * P2R)} mol。× 44 = ${f(mass)} g。`),
        st('(5) のとき、容器内の CO₂ 全体の何 % が水に溶けているか。', pct, '%',
          `${sci(b * P2R)} ÷ ${f(n, 2)} × 100 = ${f(pct)} %。`),
      ],
      p: { T, k: ht.k, Vw, Vg, n, Vg2 },
    };
  },
};

// ───────────────────────── 18. 緩衝液 ─────────────────────────

/** [酢酸 mol, 酢酸ナトリウム mol, 加える酸・塩基 mol]。どの比も 2・3・5 だけで表せる */
const BUFFER_SETS: readonly (readonly [number, number, number])[] = [
  [0.1, 0.1, 0.02], [0.1, 0.1, 0.05], [0.2, 0.2, 0.04], [0.2, 0.1, 0.05], [0.1, 0.2, 0.05],
  [0.1, 0.1, 0.06], [0.2, 0.2, 0.1], [0.15, 0.15, 0.03], [0.25, 0.15, 0.05],
];

const buffer: Def = {
  id: 'buffer-acetate',
  title: '酢酸と酢酸ナトリウムの緩衝液',
  unit: 'c26',
  level: 3,
  build(rng, r) {
    const acid = pick(rng, ACETIC);
    const [a, b, x] = pick(rng, BUFFER_SETS);
    const Ka = acid.Ka;
    const a1 = (Ka * a) / b / 1e-5;
    const hR = r(a1) * 1e-5;
    const pH = -log10(hR);
    const hA = (Ka * (a + x)) / (b - x);
    const pHA = -log10(hA);
    const hB = (Ka * (a - x)) / (b + x);
    const pHB = -log10(hB);
    const pHW = -log10(x);
    const y = (10 * b - a) / 11;
    const a6 = y / 1e-2;
    return {
      intro: `酢酸 ${f(a, 2)} mol と酢酸ナトリウム ${f(b, 2)} mol を水に溶かして 1.0 L にした緩衝液がある。温度は 25 ℃ で、酢酸の電離定数は Ka = ${acid.s} mol/L である。酢酸ナトリウムは完全に電離し、酢酸の電離はわずかで、酸や塩基を加えても溶液の体積は変わらないとする。${TXT_LOG}。pH は小数第 2 位まで求めろ。`,
      steps: [
        st('この緩衝液の [H⁺] を a×10⁻⁵ mol/L と表すとき、a を求めろ。', a1, '×10⁻⁵ mol/L',
          `[H⁺] = Ka × [CH₃COOH]/[CH₃COO⁻] = ${acid.s} × ${f(a, 2)} ÷ ${f(b, 2)} = ${sci(hR, 2)} mol/L。`),
        st('この緩衝液の pH を求めろ。', pH, '',
          `pH = −log₁₀(${sci(hR, 2)}) = ${ph(pH)}。`),
        st(`この緩衝液に HCl を ${f(x, 2)} mol 加えたときの pH を求めろ。`, pHA, '',
          `CH₃COO⁻ + H⁺ → CH₃COOH。酢酸は ${f(a + x, 2)} mol、酢酸イオンは ${f(b - x, 2)} mol になる。[H⁺] = ${acid.s} × ${f(a + x, 2)} ÷ ${f(b - x, 2)} = ${sci(hA, 2)} mol/L。pH = ${ph(pHA)}。`),
        st(`はじめの緩衝液に NaOH を ${f(x, 2)} mol 加えたときの pH を求めろ。`, pHB, '',
          `CH₃COOH + OH⁻ → CH₃COO⁻ + H₂O。酢酸は ${f(a - x, 2)} mol、酢酸イオンは ${f(b + x, 2)} mol になる。[H⁺] = ${acid.s} × ${f(a - x, 2)} ÷ ${f(b + x, 2)} = ${sci(hB, 2)} mol/L。pH = ${ph(pHB)}。`),
        st(`比較のため、純水 1.0 L に HCl を ${f(x, 2)} mol 加えたときの pH を求めろ。`, pHW, '',
          `[H⁺] = ${sci(x, 2)} mol/L。pH = ${ph(pHW)}。純水では pH が 7 から ${ph(7 - pHW)} も下がるが、緩衝液では ${ph(pH - pHA)} しか下がらない。`),
        st('はじめの緩衝液に HCl を加えていき、[CH₃COOH]/[CH₃COO⁻] = 10（pH が pKa より 1 小さい）になるまでに加えられる HCl を a×10⁻² mol と表すとき、a を求めろ。', a6, '×10⁻² mol',
          `HCl を y mol 加えると (${f(a, 2)} + y) ÷ (${f(b, 2)} − y) = 10。11y = 10 × ${f(b, 2)} − ${f(a, 2)} = ${f(10 * b - a)}。y = ${sci(y)} mol。`),
      ],
      p: { Ka, a, b, x },
    };
  },
};

// ───────────────────────── 19. 二段階中和 ─────────────────────────

const twoStep: Def = {
  id: 'two-step-neutralization',
  title: 'NaOH と Na₂CO₃ の混合物の二段階滴定',
  unit: 'b33',
  level: 3,
  build(rng, r) {
    const cHCl = pick(rng, [0.1, 0.05]);
    const n1b = pick(rng, [1.0, 1.5, 2.0]);
    const n2b = pick(rng, [0.5, 0.75, 1.0]);
    const [aliq, total] = pick(rng, [[10, 100], [20, 100], [25, 250], [10, 200]] as const);
    const moist = pick(rng, [0.02, 0.05, 0.08]);
    const scale = cHCl / 0.1;
    const fac = total / aliq;
    const n1 = (n1b * scale) / 1000;
    const n2 = (n2b * scale) / 1000;
    const V1 = (n1b + n2b) * 10;
    const V2 = n2b * 10;
    const m = sig3(fac * (n1 * 40 + n2 * 106) * (1 + moist));
    const a1 = (cHCl * V2) / 1000 / 1e-4;
    const cR = r(a1) * 1e-4;
    const a2 = (cHCl * (V1 - V2)) / 1000 / 1e-4;
    const hR = r(a2) * 1e-4;
    const mc = cR * fac * 106;
    const pct = ((hR * fac * 40) / m) * 100;
    const co2 = cR * fac * VM * 1000;
    const orig = (hR + 2 * cR) * fac * 40;
    return {
      intro: `空気中に置かれていた水酸化ナトリウムの固体（NaOH、Na₂CO₃、水分だけを含む）${f(m)} g を水に溶かして ${total} mL にした。この水溶液 ${aliq}.0 mL をとり、フェノールフタレインを加えて ${f(cHCl)} mol/L の塩酸で滴定すると、${f(V1)} mL で赤色が消えた（第 1 中和点）。続けてメチルオレンジを加えて滴定を続けると、さらに ${f(V2)} mL で黄色から赤色に変わった（第 2 中和点）。NaOH = 40.0、Na₂CO₃ = 106、${TXT_VM}。`,
      steps: [
        st(`とった水溶液 ${aliq}.0 mL 中の Na₂CO₃ を a×10⁻⁴ mol と表すとき、a を求めろ。`, a1, '×10⁻⁴ mol',
          `第 1 中和点から第 2 中和点までは NaHCO₃ + HCl → NaCl + H₂O + CO₂ だけが起こる。NaHCO₃ は Na₂CO₃ と同じ物質量。${f(cHCl)} × ${f(V2)} ÷ 1000 = ${sci(cR)} mol。`),
        st(`とった水溶液 ${aliq}.0 mL 中の NaOH を a×10⁻⁴ mol と表すとき、a を求めろ。`, a2, '×10⁻⁴ mol',
          `第 1 中和点までは NaOH + HCl → NaCl + H₂O と Na₂CO₃ + HCl → NaHCO₃ + NaCl が起こる。NaOH に使われた塩酸は ${f(V1)} − ${f(V2)} = ${f(V1 - V2)} mL。${f(cHCl)} × ${f(V1 - V2)} ÷ 1000 = ${sci(hR)} mol。`),
        st('はじめの固体に含まれていた Na₂CO₃ は何 g か。', mc, 'g',
          `${total} mL 全体では ${fi(fac)} 倍。${sci(cR)} × ${fi(fac)} × 106 = ${f(mc)} g。`),
        st('はじめの固体中の NaOH の質量の割合は何 % か。', pct, '%',
          `NaOH は ${sci(hR)} × ${fi(fac)} × 40.0 = ${f(hR * fac * 40)} g。${f(hR * fac * 40)} ÷ ${f(m)} × 100 = ${f(pct)} %。`),
        st('この固体がそれまでに空気中から吸収した CO₂ は、標準状態で何 mL か。', co2, 'mL',
          `2NaOH + CO₂ → Na₂CO₃ + H₂O。CO₂ は Na₂CO₃ と同じ ${sci(cR * fac)} mol。× 22.4 L = ${f(co2)} mL。`),
        st('CO₂ を吸収する前、この固体に含まれていた NaOH は何 g か。', orig, 'g',
          `Na₂CO₃ 1 mol は NaOH 2 mol からできた。(${sci(hR * fac)} + 2 × ${sci(cR * fac)}) × 40.0 = ${f(orig)} g。`),
      ],
      p: { cHCl, n1, n2, fac, m, V1, V2 },
    };
  },
};

// ───────────────────────── 20. 酸化還元滴定 ─────────────────────────

const redox: Def = {
  id: 'redox-kmno4-h2o2',
  title: '過マンガン酸カリウムによるオキシドールの定量',
  unit: 'b34',
  level: 3,
  build(rng, r) {
    const mOx = pick(rng, [0.504, 0.63, 0.756]);
    const cKtrue = pick(rng, [0.019, 0.02, 0.021, 0.025]);
    const cHtrue = pick(rng, [0.08, 0.085, 0.088, 0.09, 0.095]);
    const cOx0 = mOx / 126 / 0.1;
    const V1 = Math.round(((4 * cOx0) / cKtrue) * 100) / 100;
    const V2 = Math.round(((4 * cHtrue) / cKtrue) * 100) / 100;
    const a1 = cOx0 / 1e-2;
    const cOxR = r(a1) * 1e-2;
    const a2 = (2 * cOxR * 0.01) / 1e-3;
    const eR = r(a2) * 1e-3;
    const a3 = eR / 5 / (V1 / 1000) / 1e-2;
    const cKR = r(a3) * 1e-2;
    const a4 = (5 * cKR * V2) / (2 * 10) / 1e-2;
    const cHR = r(a4) * 1e-2;
    const orig = cHR * 10;
    const origR = r(orig);
    const pct = ((origR * 34) / 1000) * 100;
    return {
      intro: `シュウ酸二水和物 (COOH)₂·2H₂O ${f(mOx)} g を水に溶かして 100 mL にした。この水溶液 10.0 mL に希硫酸を加えて温め、濃度のわからない KMnO₄ 水溶液で滴定すると、${V1.toFixed(2)} mL で薄い赤紫色が消えなくなった。次に、市販のオキシドール 10.0 mL を水でうすめて 100 mL にし、その 10.0 mL に希硫酸を加えて同じ KMnO₄ 水溶液で滴定すると、${V2.toFixed(2)} mL を要した。MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O、(COOH)₂ → 2CO₂ + 2H⁺ + 2e⁻、H₂O₂ → O₂ + 2H⁺ + 2e⁻。(COOH)₂·2H₂O = 126、H₂O₂ = 34、オキシドールの密度 1.00 g/cm³。`,
      steps: [
        st('シュウ酸水溶液のモル濃度を a×10⁻² mol/L と表すとき、a を求めろ。', a1, '×10⁻² mol/L',
          `${f(mOx)} ÷ 126 = ${sci(mOx / 126)} mol。÷ 0.100 L = ${sci(cOxR)} mol/L。`),
        st('シュウ酸水溶液 10.0 mL 中のシュウ酸が出す電子を a×10⁻³ mol と表すとき、a を求めろ。', a2, '×10⁻³ mol',
          `シュウ酸 1 mol は電子 2 mol を出す。2 × ${sci(cOxR)} × 10.0 ÷ 1000 = ${sci(eR)} mol。`),
        st('KMnO₄ 水溶液のモル濃度を a×10⁻² mol/L と表すとき、a を求めろ。', a3, '×10⁻² mol/L',
          `MnO₄⁻ 1 mol は電子 5 mol を受け取る。5 × c × ${V1.toFixed(2)} ÷ 1000 = ${sci(eR)}。c = ${sci(cKR)} mol/L。`),
        st('うすめたオキシドール中の H₂O₂ のモル濃度を a×10⁻² mol/L と表すとき、a を求めろ。', a4, '×10⁻² mol/L',
          `H₂O₂ 1 mol は電子 2 mol を出す。2 × c × 10.0 = 5 × ${sci(cKR)} × ${V2.toFixed(2)}。c = ${sci(cHR)} mol/L。`),
        st('うすめる前のオキシドール中の H₂O₂ のモル濃度は何 mol/L か。', orig, 'mol/L',
          `10 倍にうすめたので ${sci(cHR)} × 10 = ${f(orig)} mol/L。`),
        st('うすめる前のオキシドール中の H₂O₂ の質量パーセント濃度は何 % か。', pct, '%',
          `1 L（1000 g）中に H₂O₂ は ${f(origR)} × 34 = ${f(origR * 34)} g。${f(origR * 34)} ÷ 1000 × 100 = ${f(pct)} %。`),
      ],
      p: { mOx, cKtrue, cHtrue, V1, V2 },
    };
  },
};

// ───────────────────────── 21. 元素分析 ─────────────────────────

const ORGANICS = [
  { c: 4, h: 8, o: 2 }, { c: 3, h: 6, o: 2 }, { c: 4, h: 10, o: 1 }, { c: 6, h: 12, o: 2 }, { c: 4, h: 6, o: 2 },
  { c: 3, h: 6, o: 1 }, { c: 5, h: 10, o: 2 }, { c: 5, h: 8, o: 2 }, { c: 4, h: 8, o: 1 }, { c: 3, h: 8, o: 1 },
] as const;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const subNum = (n: number): string => (n === 1 ? '' : String(n).split('').map((ch) => SUBS[Number(ch)]).join(''));
const cho = (c: number, h: number, o: number): string => `C${subNum(c)}H${subNum(h)}O${subNum(o)}`;

const elemental: Def = {
  id: 'elemental-analysis',
  title: '元素分析から分子式と不飽和度へ',
  unit: 'c42',
  level: 2,
  build(rng, r) {
    const X = pick(rng, ORGANICS);
    const nm = pick(rng, [0.25, 0.5, 1.0]);
    const w = pick(rng, [0.2, 0.3, 0.5]);
    const M = 12 * X.c + X.h + 16 * X.o;
    const g = gcd(gcd(X.c, X.h), X.o);
    const ec = X.c / g;
    const eh = X.h / g;
    const eo = X.o / g;
    const eM = M / g;
    const sample = M * nm;
    const co2 = 44 * X.c * nm;
    const h2o = 9 * X.h * nm;
    const T = 400;
    const P = 1.0e5;
    const vmL = sig3(((w / M) * R * T) / P * 1000);
    const mC = (co2 * 12) / 44;
    const mCR = r(mC);
    const mH = (h2o * 2) / 18;
    const mO = sample - mCR - mH;
    const Mexp = (w * R * T) / (P * (vmL / 1000));
    const dou = (2 * X.c + 2 - X.h) / 2;
    return {
      intro: `炭素・水素・酸素だけからなる有機化合物 X ${f(sample)} mg を完全燃焼させると、CO₂ ${f(co2)} mg と H₂O ${f(h2o)} mg が生じた。また、X ${f(w)} g を気体にすると、127 ℃、1.00×10⁵ Pa で ${f(vmL)} mL を占めた。H = 1.0、C = 12、O = 16、${TXT_R}。`,
      steps: [
        st('燃焼させた X に含まれる炭素は何 mg か。', mC, 'mg',
          `CO₂ 44 のうち C は 12。${f(co2)} × 12 ÷ 44 = ${f(mC)} mg。`),
        st('水素の質量も求めたうえで、燃焼させた X に含まれる酸素は何 mg か。', mO, 'mg',
          `H₂O 18 のうち H は 2.0。${f(h2o)} × 2.0 ÷ 18 = ${f(mH)} mg。酸素は残り。${f(sample)} − ${f(mCR)} − ${f(mH)} = ${f(mO)} mg。`),
        st('X の組成式（原子の数の比を最も簡単な整数比で表した式）の式量を求めろ。', eM, '',
          `C : H : O = ${f(mCR)}/12 : ${f(mH)}/1.0 : ${f(mO)}/16 = ${f(mCR / 12)} : ${f(mH)} : ${f(mO / 16)} = ${ec} : ${eh} : ${eo}。組成式は ${cho(ec, eh, eo)}、式量は ${eM}。`),
        st('気体の体積から X の分子量を求めろ。', Mexp, '',
          `M = wRT/(PV) = ${f(w)} × 8.31×10³ × 400 ÷ (1.00×10⁵ × ${f(vmL / 1000)}) = ${f(Mexp)}。`),
        st('X の分子式に含まれる炭素原子は何個か。', X.c, '個',
          `分子量 ${f(Mexp)} は組成式の式量 ${eM} の ${g} 倍。分子式は ${cho(X.c, X.h, X.o)} で、炭素は ${X.c} 個。`),
        st('X の不飽和度（二重結合と環の数の合計。三重結合は 2 と数える）を求めろ。', dou, '',
          `C が n 個の鎖状の飽和化合物なら H は 2n + 2 = ${2 * X.c + 2} 個（O の数は関係しない）。H が 2 個少ないごとに不飽和度が 1 増える。(${2 * X.c + 2} − ${X.h}) ÷ 2 = ${dou}。`),
      ],
      p: { c: X.c, h: X.h, o: X.o, M, eM, sample, co2, h2o },
    };
  },
};

// ───────────────────────── 22. 油脂 ─────────────────────────

/** 1 種類のトリグリセリドからなる油脂。M は分子量、n は 1 分子中の C=C の数 */
const FATS = [
  { M: 884, n: 3 }, { M: 882, n: 4 }, { M: 878, n: 6 }, { M: 872, n: 9 }, { M: 856, n: 3 }, { M: 886, n: 2 }, { M: 860, n: 1 }, { M: 880, n: 5 },
] as const;

const fat: Def = {
  id: 'fat-saponification-iodine',
  title: '油脂のけん化価とヨウ素価',
  unit: 'c42',
  level: 3,
  build(rng, r) {
    const ft = pick(rng, FATS);
    const m = pick(rng, [50, 100, 200]);
    const sv = sig3((3 * 56.1 * 1000) / ft.M);
    const iv = sig3((100 * ft.n * 253.8) / ft.M);
    const a1 = sv / 56.1;
    const kR = r(a1) * 1e-3;
    const M = 3 / kR;
    const MR = r(M);
    const i2 = iv / 253.8;
    const i2R = r(i2);
    const nCalc = i2R / (100 / MR);
    const h2 = (m / MR) * ft.n * VM;
    const gly = (m / MR) * 92;
    return {
      intro: `1 種類のトリグリセリド（グリセリン 1 分子と高級脂肪酸 3 分子のエステル）だけからなる油脂がある。この油脂 1.00 g を完全にけん化するのに、水酸化カリウム KOH が ${fi(sv)} mg 必要であった。また、この油脂 100 g にはヨウ素 I₂ が ${f(iv)} g 付加した。KOH = 56.1、I₂ = 253.8、グリセリン C₃H₈O₃ = 92、${TXT_VM}。`,
      steps: [
        st('油脂 1.00 g のけん化に使われた KOH を a×10⁻³ mol と表すとき、a を求めろ。', a1, '×10⁻³ mol',
          `${fi(sv)} mg ÷ 56.1 = ${f(a1)} ×10⁻³ mol。`),
        st('この油脂の分子量を求めろ。', M, '',
          `油脂 1 mol にはエステル結合が 3 個あり、KOH 3 mol と反応する。油脂 1.00 g は ${sci(kR)} ÷ 3 = ${sci(kR / 3)} mol。1.00 ÷ ${sci(kR / 3)} = ${f(M)}。`),
        st('油脂 100 g に付加した I₂ は何 mol か。', i2, 'mol',
          `${f(iv)} ÷ 253.8 = ${f(i2)} mol。`),
        st('この油脂 1 分子に含まれる C=C 結合は何個か。整数で答えろ。', ft.n, '個',
          `油脂 100 g は 100 ÷ ${f(MR)} = ${f(100 / MR)} mol。C=C 1 個に I₂ 1 分子が付加する。${f(i2R)} ÷ ${f(100 / MR)} = ${f(nCalc)} ≒ ${ft.n} 個。`),
        st(`この油脂 ${fi(m)} g の C=C をすべて水素で飽和させて硬化油にするには、標準状態で何 L の H₂ が必要か。`, h2, 'L',
          `油脂は ${fi(m)} ÷ ${f(MR)} = ${f(m / MR)} mol。H₂ はその ${ft.n} 倍。${f(m / MR)} × ${ft.n} × 22.4 = ${f(h2)} L。`),
        st(`この油脂 ${fi(m)} g を完全にけん化すると、グリセリンは何 g 得られるか。`, gly, 'g',
          `油脂 1 mol からグリセリン 1 mol。${f(m / MR)} × 92 = ${f(gly)} g。`),
      ],
      p: { Mtrue: ft.M, n: ft.n, m, sv, iv },
    };
  },
};

// ───────────────────────── 23. 縮合重合 ─────────────────────────

const CONDENS = [
  { name: 'ナイロン66', acid: 'アジピン酸 HOOC–(CH₂)₄–COOH', acidS: 'アジピン酸', acidM: 146, other: 'ヘキサメチレンジアミン H₂N–(CH₂)₆–NH₂', otherS: 'ヘキサメチレンジアミン', otherM: 116, bond: 'アミド結合' },
  { name: 'ポリエチレンテレフタラート（PET）', acid: 'テレフタル酸 HOOC–C₆H₄–COOH', acidS: 'テレフタル酸', acidM: 166, other: 'エチレングリコール HO–(CH₂)₂–OH', otherS: 'エチレングリコール', otherM: 62, bond: 'エステル結合' },
] as const;

const condensation: Def = {
  id: 'condensation-polymer',
  title: '縮合重合でできる高分子の重合度',
  unit: 'c44',
  level: 2,
  build(rng, r) {
    const pl = pick(rng, CONDENS);
    const degTrue = pick(rng, [50, 100, 150, 200, 250]);
    const m = pick(rng, [100, 200, 500]);
    const unit = pl.acidM + pl.otherM - 36;
    const Mavg = unit * degTrue;
    const unitR = r(unit);
    const deg = Mavg / unitR;
    const degR = r(deg);
    const bonds = 2 * degR;
    const nUnit = m / unitR;
    const acid = nUnit * pl.acidM;
    const other = nUnit * pl.otherM;
    const water = nUnit * 36;
    return {
      intro: `${pl.name}は、${pl.acid}（分子量 ${pl.acidM}）と${pl.other}（分子量 ${pl.otherM}）が、水分子がとれながら交互につながった高分子である。ある${pl.name}の平均分子量は ${sci(Mavg)} であった。繰り返し単位は、2 種類の単量体が 1 分子ずつ縮合したものとし、分子の両端は無視してよい。H₂O = 18。`,
      steps: [
        st('繰り返し単位の式量を求めろ。', unit, '',
          `2 種類の単量体 1 分子ずつから、水 2 分子がとれる。${pl.acidM} + ${pl.otherM} − 2 × 18 = ${unit}。`),
        st('この高分子の平均の重合度（1 分子中の繰り返し単位の数）を求めろ。', deg, '',
          `${sci(Mavg)} ÷ ${fi(unitR)} = ${f(deg)}。`),
        st(`この高分子 1 分子に含まれる${pl.bond}はおよそ何個か。`, bonds, '個',
          `繰り返し単位 1 つにつき${pl.bond}は 2 個。2 × ${f(degR)} = ${f(bonds)} 個（両端まで数えると 1 個少ないが、無視できる）。`),
        st(`この高分子 ${fi(m)} g をつくるのに必要な${pl.acidS}は何 g か。`, acid, 'g',
          `繰り返し単位は ${fi(m)} ÷ ${fi(unitR)} = ${f(nUnit)} mol。${pl.acidS}も同じ物質量。× ${pl.acidM} = ${f(acid)} g。`),
        st(`同じく必要な${pl.otherS}は何 g か。`, other, 'g',
          `${f(nUnit)} × ${pl.otherM} = ${f(other)} g。`),
        st('このとき生じる水は何 g か。', water, 'g',
          `繰り返し単位 1 mol につき水 2 mol。${f(nUnit)} × 36 = ${f(water)} g。単量体の質量の和 ${f(acid + other)} g から ${fi(m)} g を引いた値と一致する。`),
      ],
      p: { acidM: pl.acidM, otherM: pl.otherM, degTrue, m, Mavg },
    };
  },
};

// ───────────────────────── 24. ビニロン ─────────────────────────

const vinylon: Def = {
  id: 'vinylon-acetal',
  title: 'ビニロンのアセタール化',
  unit: 'c44',
  level: 3,
  build(rng, r) {
    const m = pick(rng, [8.8, 44.0, 88.0]);
    const fTrue = pick(rng, [0.3, 0.35, 0.4, 0.45, 0.5]);
    const conc = pick(rng, [30, 37]);
    const m2 = sig3(m + ((12 * m) / 44) * (fTrue / 2));
    const nOH = m / 44;
    const nOHR = r(nOH);
    const pvac = nOHR * 86;
    const nF = (m2 - m) / 12;
    const nFR = r(nF);
    const pct = ((2 * nFR) / nOHR) * 100;
    const formalin = (nFR * 30) / (conc / 100);
    const ms = (x: number): string => f(x);
    return {
      intro: `ポリ酢酸ビニル（繰り返し単位 –CH₂–CH(OCOCH₃)–、式量 86）をけん化して、ポリビニルアルコール（PVA、繰り返し単位 –CH₂–CH(OH)–、式量 44）${ms(m)} g を得た。これをホルムアルデヒド HCHO の水溶液で処理（アセタール化）すると、質量 ${f(m2)} g のビニロンになった。アセタール化では、隣り合う 2 個の –OH と HCHO 1 分子から –O–CH₂–O– の構造と H₂O 1 分子ができる。H = 1.0、C = 12、O = 16。`,
      steps: [
        st('PVA に含まれていた –OH は何 mol か。', nOH, 'mol',
          `繰り返し単位 1 つに –OH が 1 個。${ms(m)} ÷ 44 = ${f(nOH)} mol。`),
        st('この PVA をつくるのに必要なポリ酢酸ビニルは何 g か。', pvac, 'g',
          `けん化しても繰り返し単位の数は変わらない。${f(nOHR)} × 86 = ${f(pvac)} g。`),
        st('アセタール化で反応した HCHO は何 mol か。', nF, 'mol',
          `HCHO（30）が 1 mol 入り、H₂O（18）が 1 mol とれるので、HCHO 1 mol あたり質量は 12 g 増える。(${f(m2)} − ${ms(m)}) ÷ 12 = ${f(nF)} mol。`),
        st('PVA の –OH のうち、アセタール化されたものは何 % か。', pct, '%',
          `HCHO 1 mol は –OH 2 mol と反応する。2 × ${f(nFR)} ÷ ${f(nOHR)} × 100 = ${f(pct)} %。残った –OH が、ビニロンの適度な吸湿性のもとになる。`),
        st(`(3) の HCHO を質量パーセント濃度 ${conc} % のホルムアルデヒド水溶液でまかなうと、水溶液は何 g 必要か。`, formalin, 'g',
          `HCHO は ${f(nFR)} × 30 = ${f(nFR * 30)} g。÷ ${conc / 100} = ${f(formalin)} g。`),
      ],
      p: { m, fTrue, m2, conc },
    };
  },
};

// ───────────────────────── 25. デンプンと発酵 ─────────────────────────

const starch: Def = {
  id: 'starch-fermentation',
  title: 'デンプンの加水分解とアルコール発酵',
  unit: 'c45',
  level: 2,
  build(rng, r) {
    const Mst = pick(rng, [8.1e4, 1.62e5, 3.24e5, 4.86e5]);
    const m = pick(rng, [8.1, 16.2, 32.4, 81.0]);
    const y = pick(rng, [80, 90, 100]);
    const deg = Mst / 162;
    const water = (m / 162) * 18;
    const glu = (m / 162) * 180;
    const gluR = r(glu);
    const nFer = (gluR / 180) * (y / 100);
    const eth = nFer * 2 * 46;
    const co2 = nFer * 2 * VM;
    return {
      intro: `平均分子量 ${sci(Mst)} のデンプン (C₆H₁₀O₅)ₙ ${f(m)} g を希硫酸で完全に加水分解してグルコース C₆H₁₂O₆ にし、中和したのち酵母を加えてアルコール発酵させた（C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂）。発酵したのは、得られたグルコースの ${y} % であった。H = 1.0、C = 12、O = 16、${TXT_VM}。`,
      steps: [
        st('このデンプンの平均の重合度 n を求めろ。', deg, '',
          `繰り返し単位 C₆H₁₀O₅ の式量は 162。${sci(Mst)} ÷ 162 = ${f(deg)}。`),
        st('加水分解で消費された水は何 g か。分子の両端は無視してよい。', water, 'g',
          `(C₆H₁₀O₅)ₙ + nH₂O → nC₆H₁₂O₆。繰り返し単位は ${f(m)} ÷ 162 = ${f(m / 162)} mol で、水も同じ物質量。× 18 = ${f(water)} g。`),
        st('得られたグルコースは何 g か。', glu, 'g',
          `${f(m / 162)} × 180 = ${f(glu)} g（デンプンと水の質量の和）。`),
        st('発酵で生じたエタノールは何 g か。', eth, 'g',
          `発酵したグルコースは ${f(gluR)} ÷ 180 × ${y / 100} = ${f(nFer)} mol。エタノール（46）はその 2 倍。${f(nFer)} × 2 × 46 = ${f(eth)} g。`),
        st('発酵で発生した CO₂ は標準状態で何 L か。', co2, 'L',
          `CO₂ もグルコースの 2 倍。${f(nFer)} × 2 × 22.4 = ${f(co2)} L。`),
      ],
      p: { Mst, m, y },
    };
  },
};

// ───────────────────────── 26. アミノ酸の等電点 ─────────────────────────

const GLY_SETS = [
  { K1: 4.0e-3, K2: 2.5e-10 }, { K1: 5.0e-3, K2: 2.0e-10 }, { K1: 4.0e-3, K2: 1.6e-10 }, { K1: 5.0e-3, K2: 2.5e-10 }, { K1: 4.0e-3, K2: 2.0e-10 },
] as const;

const glycine: Def = {
  id: 'glycine-isoelectric',
  title: 'グリシンの電離平衡と等電点',
  unit: 'c45',
  level: 3,
  build(rng, r) {
    const gs = pick(rng, GLY_SETS);
    const pHlo = pick(rng, [2.0, 3.0, 4.0]);
    const pHhi = pick(rng, [9.0, 10.0, 11.0]);
    const { K1, K2 } = gs;
    const pK1 = -log10(K1);
    const pK1R = r(pK1);
    const pK2 = -log10(K2);
    const pI = (pK1R + pK2) / 2;
    const a3 = Math.sqrt(K2 / K1) / 1e-4;
    const rLo = 10 ** -pHlo / K1;
    const rHi = K2 / 10 ** -pHhi;
    const rHiR = r(rHi);
    const pct = (rHiR / (1 + rHiR)) * 100;
    return {
      intro: `グリシンは水溶液中で、陽イオン A⁺（H₃N⁺–CH₂–COOH）、双性イオン A±（H₃N⁺–CH₂–COO⁻）、陰イオン A⁻（H₂N–CH₂–COO⁻）の平衡にある。A⁺ ⇄ A± + H⁺ の電離定数は K₁ = [A±][H⁺]/[A⁺] = ${sci(K1, 2)} mol/L、A± ⇄ A⁻ + H⁺ の電離定数は K₂ = [A⁻][H⁺]/[A±] = ${sci(K2, 2)} mol/L とする。${TXT_LOG}、√5 = 2.24。`,
      steps: [
        st('pK₁ = −log₁₀K₁ を求めろ。', pK1, '',
          `K₁ = ${sci(K1, 2)}。pK₁ = 3 − log₁₀${f(K1 * 1e3, 2)} = ${ph(pK1)}。`),
        st('グリシンの等電点（[A⁺] = [A⁻] となる pH）を求めろ。', pI, '',
          `K₁ × K₂ = [A⁻][H⁺]²/[A⁺]。[A⁺] = [A⁻] のとき [H⁺]² = K₁K₂。pK₂ = 10 − log₁₀${f(K2 * 1e10, 2)} = ${ph(pK2)}。pH = (pK₁ + pK₂) ÷ 2 = (${ph(pK1R)} + ${ph(pK2)}) ÷ 2 = ${ph(pI)}。`),
        st('等電点での [A⁺]/[A±] を a×10⁻⁴ と表すとき、a を求めろ。', a3, '×10⁻⁴',
          `[A⁺]/[A±] = [H⁺]/K₁ = √(K₁K₂)/K₁ = √(K₂/K₁) = √(${sci(K2 / K1, 3)}) = ${sci(a3 * 1e-4, 3)}。等電点ではほとんどが双性イオンである。`),
        st(`pH ${f(pHlo, 2)} の水溶液中での [A⁺]/[A±] を求めろ。`, rLo, '',
          `[A⁺]/[A±] = [H⁺]/K₁ = ${sci(10 ** -pHlo, 2)} ÷ ${sci(K1, 2)} = ${f(rLo, 2)}。`),
        st(`pH ${f(pHhi, pHhi >= 10 ? 3 : 2)} の水溶液中での [A⁻]/[A±] を求めろ。`, rHi, '',
          `[A⁻]/[A±] = K₂/[H⁺] = ${sci(K2, 2)} ÷ ${sci(10 ** -pHhi, 2)} = ${f(rHi, 2)}。`),
        st(`pH ${f(pHhi, pHhi >= 10 ? 3 : 2)} の水溶液中で、グリシン全体のうち陰イオン A⁻ になっているものは何 % か。この pH では A⁺ は無視できる。`, pct, '%',
          `[A⁻] ÷ ([A±] + [A⁻]) = ${f(rHiR, 2)} ÷ (1 + ${f(rHiR, 2)}) = ${f(pct / 100)}。${f(pct)} %。`),
      ],
      p: { K1, K2, pHlo, pHhi },
    };
  },
};

// ───────────────────────── 27. 混合気体の燃焼 ─────────────────────────

const HC = [
  { f: 'CH₄', name: 'メタン', c: 1, h: 4 },
  { f: 'C₂H₆', name: 'エタン', c: 2, h: 6 },
  { f: 'C₃H₈', name: 'プロパン', c: 3, h: 8 },
  { f: 'C₂H₄', name: 'エチレン', c: 2, h: 4 },
] as const;
const HC_PAIRS: readonly (readonly [number, number])[] = [[0, 1], [0, 2], [1, 2], [0, 3], [3, 1], [3, 2]];

const mixedCombustion: Def = {
  id: 'mixed-gas-combustion',
  title: '炭化水素の混合気体の燃焼と水の凝縮',
  unit: 'b32',
  level: 3,
  build(rng, r) {
    const [ia, ib] = pick(rng, HC_PAIRS);
    const A = HC[ia];
    const B = HC[ib];
    const x100 = pick(rng, [5, 10, 15, 20]);
    const y100 = pick(rng, [5, 10, 15, 20]);
    const V = pick(rng, [8.31, 16.6, 24.9]);
    const extra = pick(rng, [10, 20]);
    const xT = x100 / 100;
    const yT = y100 / 100;
    const cons100 = Math.round((xT * (A.c + A.h / 4) + yT * (B.c + B.h / 4)) * 100);
    const nO = (Math.ceil(cons100 / 10) * 10 + extra) / 100;
    const nC = A.c * xT + B.c * yT;
    const nH = (A.h * xT + B.h * yT) / 2;
    const mC = 44 * nC;
    const mH = 18 * nH;
    const T = 300;
    const vp = 3.6e3;
    const det = A.c * B.h - B.c * A.h;
    const x = (B.h * nC - 2 * B.c * nH) / det;
    const y = (2 * A.c * nH - A.h * nC) / det;
    const xR = r(x);
    const yR = r(y);
    const a3 = ((xR + yR + nO) * R * T) / V / 1e5;
    const cons = xR * (A.c + A.h / 4) + yR * (B.c + B.h / 4);
    const consR = r(cons);
    const pGas = ((nO - consR + nC) * R * T) / V;
    const a5 = (pGas + vp) / 1e5;
    const nVap = (vp * V) / (R * T);
    const liq = mH - 18 * nVap;
    return {
      intro: `${A.name} ${A.f} と${B.name} ${B.f} の混合気体を、酸素 ${f(nO)} mol とともに容積 ${f(V)} L の密閉容器に入れ、点火して完全燃焼させたところ、CO₂ が ${f(mC)} g、H₂O が ${f(mH)} g 生じた。燃焼後、容器を 27 ℃ に保つと、容器内に液体の水が見られた。27 ℃ の水の蒸気圧は 3.6×10³ Pa である。液体の水の体積と、気体の水への溶解は無視する。H = 1.0、C = 12、O = 16、${TXT_R}。`,
      steps: [
        st(`混合気体に含まれていた${A.name}は何 mol か。`, x, 'mol',
          `CO₂ は ${f(mC)} ÷ 44 = ${f(nC)} mol、H₂O は ${f(mH)} ÷ 18 = ${f(nH)} mol。${A.name} x mol、${B.name} y mol とすると、C について ${coef(A.c)}x + ${coef(B.c)}y = ${f(nC)}、H について ${A.h}x + ${B.h}y = 2 × ${f(nH)}。これを解いて x = ${f(x)} mol。`),
        st(`混合気体に含まれていた${B.name}は何 mol か。`, y, 'mol',
          `同じ連立方程式から y = ${f(y)} mol。`),
        st('点火する前、27 ℃ での容器内の全圧を a×10⁵ Pa と表すとき、a を求めろ。', a3, '×10⁵ Pa',
          `気体は合計 ${f(xR)} + ${f(yR)} + ${f(nO)} = ${f(xR + yR + nO)} mol。P = nRT/V = ${f(xR + yR + nO)} × 8.31×10³ × 300 ÷ ${f(V)} = ${sci(a3 * 1e5)} Pa。`),
        st('燃焼で消費された O₂ は何 mol か。', cons, 'mol',
          `${A.name} 1 mol に O₂ ${f(A.c + A.h / 4, 2)} mol、${B.name} 1 mol に O₂ ${f(B.c + B.h / 4, 2)} mol。${f(xR)} × ${f(A.c + A.h / 4, 2)} + ${f(yR)} × ${f(B.c + B.h / 4, 2)} = ${f(cons)} mol（CO₂ と H₂O の O の数から ${f(nC)} + ${f(nH)} ÷ 2 としても同じ）。`),
        st('燃焼後、27 ℃ での容器内の全圧を a×10⁵ Pa と表すとき、a を求めろ。', a5, '×10⁵ Pa',
          `残った O₂ は ${f(nO)} − ${f(consR)} = ${f(nO - consR)} mol、CO₂ は ${f(nC)} mol。この 2 つの分圧の和は ${f(nO - consR + nC)} × 8.31×10³ × 300 ÷ ${f(V)} = ${sci(pGas)} Pa。液体の水があるので、水蒸気の分圧は蒸気圧 3.6×10³ Pa。合計 ${sci(pGas + vp)} Pa。`),
        st('燃焼後、27 ℃ で液体になっている水は何 g か。', liq, 'g',
          `気体の水は 3.6×10³ × ${f(V)} ÷ (8.31×10³ × 300) = ${f(nVap)} mol = ${f(18 * nVap)} g。${f(mH)} − ${f(18 * nVap)} = ${f(liq)} g。`),
      ],
      p: { ac: A.c, ah: A.h, bc: B.c, bh: B.h, xT, yT, nO, V, nC, nH },
    };
  },
};

// ───────────────────────── 28. デュマ法 ─────────────────────────

const VOLATILES = [
  { emp: 'CH₂', eM: 14, k: 6, ec: 1 },
  { emp: 'C₃H₇', eM: 43, k: 2, ec: 3 },
  { emp: 'C₃H₆O', eM: 58, k: 1, ec: 3 },
  { emp: 'C₂H₄O', eM: 44, k: 2, ec: 2 },
  { emp: 'CH', eM: 13, k: 6, ec: 1 },
  { emp: 'C₅H₁₂', eM: 72, k: 1, ec: 5 },
  { emp: 'C₄H₈O', eM: 72, k: 1, ec: 4 },
] as const;

const dumas: Def = {
  id: 'dumas-molar-mass',
  title: '揮発性の液体の分子量測定（デュマ法）',
  unit: 'c12',
  level: 2,
  build(rng, r) {
    const X = pick(rng, VOLATILES);
    const vmL = pick(rng, [250, 300, 500]);
    const T = pick(rng, [370, 373]);
    const P = pick(rng, [1.0e5, 1.01e5, 1.02e5]);
    const Mtrue = X.eM * X.k;
    const V = vmL / 1000;
    const m = sig3((Mtrue * P * V) / (R * T));
    const a1 = (P * V) / (R * T) / 1e-3;
    const nR = r(a1) * 1e-3;
    const M = m / nR;
    const MR = r(M);
    const nC = X.k * X.ec;
    const dens = m / V;
    const rel = MR / 28.8;
    return {
      intro: `容積 ${fi(vmL)} mL の丸底フラスコに揮発性の液体 X を数 mL 入れ、小さな穴をあけたアルミニウム箔でふたをして、${T - 273} ℃ の湯に浸した。液体がすべて蒸発し、フラスコ内が X の蒸気だけで満たされたのち、フラスコを取り出して冷やすと、フラスコ内に凝縮した X は ${f(m)} g であった。大気圧は ${sci(P)} Pa である。元素分析によると、X の組成式は ${X.emp}（式量 ${X.eM}）である。空気の平均分子量は 28.8、${TXT_R}。`,
      steps: [
        st(`${T - 273} ℃ でフラスコを満たしていた X の蒸気を a×10⁻³ mol と表すとき、a を求めろ。`, a1, '×10⁻³ mol',
          `蒸気の圧力は大気圧に等しい。n = PV/RT = ${sci(P)} × ${f(V)} ÷ (8.31×10³ × ${T}) = ${sci(nR)} mol。`),
        st('X の分子量を求めろ。', M, '',
          `凝縮した ${f(m)} g が、フラスコを満たしていた蒸気の質量。${f(m)} ÷ ${sci(nR)} = ${f(M)}。`),
        st('X の分子式に含まれる炭素原子は何個か。', nC, '個',
          `分子量 ${f(MR)} は組成式の式量 ${X.eM} の ${X.k} 倍。${X.k === 1 ? `分子式は組成式と同じで、炭素は ${nC} 個。` : `組成式の ${X.k} 倍が分子式で、炭素は ${X.k} × ${X.ec} = ${nC} 個。`}`),
        st(`${T - 273} ℃、${sci(P)} Pa での X の蒸気の密度は何 g/L か。`, dens, 'g/L',
          `${f(m)} g ÷ ${f(V)} L = ${f(dens)} g/L。`),
        st('同じ温度・圧力で、X の蒸気の密度は空気の何倍か。', rel, '倍',
          `同温・同圧の気体の密度は分子量に比例する。${f(MR)} ÷ 28.8 = ${f(rel)} 倍。空気よりずっと重いので、蒸気がフラスコ内の空気を押し出して満たす。`),
      ],
      p: { Mtrue, vmL, T, P, m, nC },
    };
  },
};

// ───────────────────────── 29. 解離平衡の一般式（記号） ─────────────────────────

const DISS_SETS = (() => {
  const out: { n: number; T: number; V: number; P: number; alphaTrue: number }[] = [];
  for (const n of [0.05, 0.06, 0.08]) {
    for (const T of [300, 350, 400]) {
      // V = 1.0 L は使わない（体積で割り忘れた式が同じ値になってしまう）
      for (const V of [0.5, 2.0, 5.0]) {
        // α = 0.5 は使わない（2 乗を忘れた式 2nα/((1 − α)V) が同じ値になってしまう）
        for (const alphaTrue of [0.2, 0.25, 0.4, 0.55, 0.6]) {
          const P = sig3((n * (1 + alphaTrue) * R * T) / V);
          if (P >= 4e4 && P <= 4e5) out.push({ n, T, V, P, alphaTrue });
        }
      }
    }
  }
  return out;
})();

const dissGeneral: Def = {
  id: 'dissociation-general',
  title: '気体の解離平衡 A ⇄ 2B を文字式で表す',
  unit: 'c25',
  level: 3,
  build(rng, r) {
    const { n, T, V, P, alphaTrue } = pick(rng, DISS_SETS);
    const alpha = (P * V) / (n * R * T) - 1;
    const aR = r(alpha);
    const kc = (4 * n * aR * aR) / ((1 - aR) * V);
    const a7 = kc / 1e-2;
    return {
      intro: `気体 A が解離して気体 B になる反応 A ⇄ 2B を考える。A だけを n [mol] とって容積 V [L] の容器に入れ、温度を T [K] に保つと、解離度 α で平衡に達した。気体は理想気体とし、気体定数を R とする。(6) と (7) では n = ${f(n, 2)} mol、V = ${f(V, 2)} L、T = ${T} K とし、このときの全圧は ${sci(P)} Pa であった。R = 8.31×10³ Pa·L/(K·mol)。`,
      steps: [
        choice(rng, '平衡状態での気体の全物質量を表す式を選べ。', 'n(1 + α)', ['n(1 − α)', '2nα', 'n(1 + 2α)'], ['n', 'α'],
          'A は nα mol 解離して n(1 − α) mol 残り、B は 2nα mol 生じる。合計 n(1 − α) + 2nα = n(1 + α)。n(1 − α) は A だけ、2nα は B だけを数えた式である。'),
        choice(rng, '平衡状態での全圧を表す式を選べ。', 'n(1 + α)RT/V', ['nRT/V', '2nαRT/V', 'n(1 + α)V/(RT)'], ['n', 'α', 'R', 'T', 'V'],
          '状態方程式 PV = (全物質量) × RT に (1) を入れる。P = n(1 + α)RT/V。nRT/V は解離による分子数の増加を無視した式である。'),
        choice(rng, '濃度平衡定数 Kc = [B]²/[A] を表す式を選べ。', '4nα²/((1 − α)V)', ['4nα²/(1 − α)', '2nα/((1 − α)V)', 'nα²/((1 − α)V)'], ['n', 'α', 'V'],
          '[A] = n(1 − α)/V、[B] = 2nα/V。Kc = (2nα/V)² ÷ (n(1 − α)/V) = 4nα²/((1 − α)V)。物質量のまま計算して体積で割り忘れると 4nα²/(1 − α)、2 乗を忘れると 2nα/((1 − α)V)、B の係数 2 を忘れると nα²/((1 − α)V) になる。'),
        choice(rng, '圧平衡定数 Kp = (B の分圧)²/(A の分圧) を、α と全圧 P で表す式を選べ。', '4α²P/(1 − α²)', ['4α²P/(1 − α)', '2αP/(1 − α)', 'α²P/(1 − α²)'], ['α', 'P'],
          'モル分率は A が (1 − α)/(1 + α)、B が 2α/(1 + α)。Kp = {2αP/(1 + α)}² ÷ {(1 − α)P/(1 + α)} = 4α²P/{(1 − α)(1 + α)} = 4α²P/(1 − α²)。モル分率の分母 (1 + α) を落とすと 4α²P/(1 − α)、2 乗を忘れると 2αP/(1 − α)、B の係数 2 を忘れると α²P/(1 − α²) になる。'),
        choice(rng, 'Kp を Kc、R、T で表す式を選べ。', 'KcRT', ['Kc/(RT)', 'Kc(RT)²', 'Kc'], ['Kc', 'R', 'T'],
          '分圧 = 濃度 × RT（p = (n/V)RT）。Kp = ([B]RT)² ÷ ([A]RT) = [B]²/[A] × RT、つまり Kp = KcRT。右辺と左辺の気体分子の数の差（2 − 1 = 1）が RT の指数になる。'),
        st('数値を入れて、解離度 α を求めろ。', alpha, '',
          `全物質量は PV/(RT) = ${sci(P)} × ${f(V, 2)} ÷ (8.31×10³ × ${T}) = ${f((P * V) / (R * T))} mol。これが ${f(n, 2)} × (1 + α) に等しい。1 + α = ${f((P * V) / (n * R * T))}、α = ${f(alpha)}。`),
        st('Kc を a×10⁻² mol/L と表すとき、a を求めろ。', a7, '×10⁻² mol/L',
          `Kc = 4nα²/((1 − α)V) = 4 × ${f(n, 2)} × ${f(aR)}² ÷ (${f(1 - aR)} × ${f(V, 2)}) = ${sci(kc)} mol/L。`),
      ],
      p: { n, T, V, P, alphaTrue },
    };
  },
};

// ───────────────────────── 30. 弱酸の電離（記号） ─────────────────────────

const WEAK_SETS = (() => {
  const out: { Ka: number; c: number; N: number }[] = [];
  for (const Ka of [1.0e-5, 1.6e-5, 2.5e-5, 4.0e-5]) {
    for (const c of [0.1, 0.04, 0.25]) {
      for (const N of [4, 9, 16, 25, 100]) {
        if (Math.sqrt((Ka * N) / c) <= 0.05) out.push({ Ka, c, N });
      }
    }
  }
  return out;
})();

const weakGeneral: Def = {
  id: 'weak-acid-general',
  title: '弱酸の電離度と電離定数を文字式で表す',
  unit: 'c26',
  level: 3,
  build(rng, r) {
    const { Ka, c, N } = pick(rng, WEAK_SETS);
    const root = Math.round(Math.sqrt(N));
    const alpha = Math.sqrt(Ka / c);
    const a6 = alpha / 1e-2;
    const c2 = c / N;
    const h2 = Math.sqrt(c2 * Ka);
    const pH2 = -log10(h2);
    return {
      intro: `1 価の弱酸 HA の水溶液を考える（HA ⇄ H⁺ + A⁻）。HA の濃度を c [mol/L]、電離度を α、電離定数を Ka [mol/L] とする。水の電離で生じる H⁺ は無視する。(6) と (7) では Ka = ${sci(Ka, 2)} mol/L、c = ${f(c, 2)} mol/L とする。${TXT_LOG}、√10 = 3.16。pH は小数第 2 位まで求めろ。`,
      steps: [
        choice(rng, 'Ka を c と α で表す式を選べ。近似は使わない。', 'cα²/(1 − α)', ['cα²/(1 + α)', 'c²α²/(1 − α)', 'cα/(1 − α)'], ['c', 'α'],
          '[H⁺] = [A⁻] = cα、[HA] = c(1 − α)。Ka = [H⁺][A⁻]/[HA] = (cα)² ÷ {c(1 − α)} = cα²/(1 − α)。c を約分し忘れると c²α²/(1 − α)、分子を 2 乗し忘れると cα/(1 − α) になる。'),
        choice(rng, 'α が 1 より十分小さいとき、α を c と Ka で表す式を選べ。', '√(Ka/c)', ['√(cKa)', 'Ka/c', '√(c/Ka)'], ['Ka', 'c'],
          '1 − α ≒ 1 とすると Ka = cα²。α = √(Ka/c)。√(cKa) は [H⁺] の式、Ka/c は平方根を取り忘れた式である。'),
        choice(rng, '(2) の近似がよく成り立つのは、どのような場合か。', 'c が Ka に比べて十分大きいとき', ['c が Ka に比べて十分小さいとき', 'c が Ka とほぼ等しいとき', 'c の大きさによらずつねに成り立つ'], null,
          'α = √(Ka/c) が 1 より十分小さければよいので、Ka/c ≪ 1、つまり c が Ka に比べて十分大きいとき。うすめて c が Ka に近づくと α が大きくなり、1 − α ≒ 1 とはできなくなる。'),
        choice(rng, '(2) の近似のもとで、[H⁺] を c と Ka で表す式を選べ。', '√(cKa)', ['√(Ka/c)', 'cKa', '√(c/Ka)'], ['c', 'Ka'],
          '[H⁺] = cα = c × √(Ka/c) = √(cKa)。'),
        choice(rng, `この水溶液を水でうすめて濃度を 1/${N} にすると、電離度 α は何倍になるか。(2) の近似が成り立つとする。数を選べ。`, `${root}`, [`${N}`, `1/${root}`, '1'], [],
          `α = √(Ka/c) で、Ka は温度が同じなら変わらない。c が 1/${N} になると α は √${N} = ${root} 倍になる。うすめるほど電離度は大きくなる（1 倍のまま、ではない）。ただし [H⁺] = √(cKa) は 1/${root} 倍に小さくなる。`),
        st('数値を入れて、うすめる前の電離度 α を a×10⁻² と表すとき、a を求めろ。', a6, '×10⁻²',
          `α = √(Ka/c) = √(${sci(Ka, 2)} ÷ ${f(c, 2)}) = √(${sci(Ka / c, 3)}) = ${sci(alpha)}。1 より十分小さいので、近似は成り立っている。`),
        st(`濃度を 1/${N} にうすめた水溶液の pH を求めろ。`, pH2, '',
          `濃度は ${f(c, 2)} ÷ ${N} = ${sci(c2, 2)} mol/L。[H⁺] = √(cKa) = √(${sci(c2, 2)} × ${sci(Ka, 2)}) = √(${sci(c2 * Ka, 3)}) = ${sci(h2)} mol/L。pH = −½ log₁₀(${sci(c2 * Ka, 3)}) = ${ph(pH2)}。このときの電離度は ${sci(Math.sqrt(Ka / c2), 2)} で、まだ近似が使える。`),
      ],
      p: { Ka, c, N },
    };
  },
};

// ───────────────────────── 31. 分配平衡と抽出（記号） ─────────────────────────

const EXTRACT_VOLS: readonly (readonly [number, number])[] = [[100, 50], [200, 100], [100, 200], [200, 50], [50, 100]];

const extraction: Def = {
  id: 'extraction-partition',
  title: '分配平衡と抽出の回数',
  unit: 'c14',
  level: 3,
  build(rng, r) {
    const K = pick(rng, [4, 5, 9, 10, 20]);
    // KV₂ = V₁ だと「残る割合」と「移った割合」が同じ値になるので避ける
    const [V1, V2] = pick(rng, EXTRACT_VOLS.filter(([a, b]) => K * b !== a));
    const m = pick(rng, [100, 200, 500]);
    const f1 = V1 / (V1 + K * V2);
    const f2 = ((2 * V1) / (2 * V1 + K * V2)) ** 2;
    const f3 = ((3 * V1) / (3 * V1 + K * V2)) ** 3;
    const got = m * (1 - f3);
    return {
      intro: `水と混ざり合わない有機溶媒を、物質 X の水溶液に加えて振り混ぜると、X は 2 つの層に分かれて溶け、平衡状態では K = (有機層中の X の濃度) ÷ (水層中の X の濃度) が一定になる（分配平衡。K を分配係数という）。X を含む水溶液 V₁ [mL] から、有機溶媒を合計 V₂ [mL] 使って X を抽出する。X はどちらの層でも会合や電離をせず、振り混ぜても各層の体積は変わらないとする。数値を求める小問では K = ${f(K, 2)}、V₁ = ${V1} mL、V₂ = ${V2} mL とする。`,
      steps: [
        choice(rng, '有機溶媒 V₂ を全部使って 1 回だけ抽出したとき、X のうち水層に残る割合を表す式を選べ。', 'V₁/(V₁ + KV₂)', ['KV₂/(V₁ + KV₂)', 'V₁/(KV₁ + V₂)', 'V₁/(K(V₁ + V₂))'], ['V₁', 'K', 'V₂'],
          '水層の濃度を c とすると有機層の濃度は Kc。X の量は水層に cV₁、有機層に KcV₂。水層に残る割合は cV₁ ÷ (cV₁ + KcV₂) = V₁/(V₁ + KV₂)。KV₂/(V₁ + KV₂) は有機層に移った割合、V₁/(KV₁ + V₂) は K をかける層を取り違えた式である。'),
        st('1 回だけ抽出したとき、水層に残る X は最初の何 % か。', f1 * 100, '%',
          `${V1} ÷ (${V1} + ${f(K, 2)} × ${V2}) = ${f(f1)}。${f(f1 * 100)} %。`),
        choice(rng, '有機溶媒を V₂/2 ずつ 2 回に分けて抽出する（1 回ごとに有機層を取り除く）。2 回の抽出のあと、水層に残る割合を表す式を選べ。', '(2V₁/(2V₁ + KV₂))²', ['(V₁/(V₁ + KV₂))²', '2V₁/(2V₁ + KV₂)', '(V₁/(2V₁ + KV₂))²'], ['V₁', 'K', 'V₂'],
          '1 回の抽出で残る割合は、(1) の V₂ を V₂/2 にして V₁/(V₁ + KV₂/2) = 2V₁/(2V₁ + KV₂)。2 回目は、残った X に同じ割合がもう一度かかるので、2 乗して (2V₁/(2V₁ + KV₂))² になる。(V₁/(V₁ + KV₂))² は 1 回に使う溶媒を半分にし忘れた式、2V₁/(2V₁ + KV₂) は 1 回ぶんしか数えていない式である。'),
        st('2 回に分けて抽出したとき、水層に残る X は最初の何 % か。', f2 * 100, '%',
          `1 回ごとに残る割合は 2 × ${V1} ÷ (2 × ${V1} + ${f(K, 2)} × ${V2}) = ${f(Math.sqrt(f2))}。2 乗して ${f(f2)}。${f(f2 * 100)} %。同じ量の溶媒でも、分けて使うほうが残りが少ない。`),
        choice(rng, '有機溶媒を V₂/n ずつ n 回に分けて抽出したとき、水層に残る割合を表す式を選べ。', '(nV₁/(nV₁ + KV₂))ⁿ', ['(V₁/(V₁ + KV₂))ⁿ', 'nV₁/(nV₁ + KV₂)', '(V₁/(nV₁ + KV₂))ⁿ'], ['n', 'V₁', 'K', 'V₂'],
          '1 回ごとに残る割合は V₁/(V₁ + KV₂/n) = nV₁/(nV₁ + KV₂)。これが n 回かかるので、n 乗して (nV₁/(nV₁ + KV₂))ⁿ になる。'),
        st(`はじめ水層に X が ${m} mg 含まれていたとする。有機溶媒を 3 回に等分して抽出したとき、有機層に移った X は合計で何 mg か。`, got, 'mg',
          `1 回ごとに残る割合は 3 × ${V1} ÷ (3 × ${V1} + ${f(K, 2)} × ${V2}) = ${f(Math.cbrt(f3))}。3 乗して ${f(f3)}。有機層に移ったのは ${m} × (1 − ${f(f3)}) = ${f(got)} mg。`),
      ],
      p: { K, V1, V2, m },
    };
  },
};

// ───────────────────────── 32. ラウールの法則（記号） ─────────────────────────

const RAOULT_T = [
  { t: 25, p0: 3.17e3 },
  { t: 40, p0: 7.38e3 },
  { t: 60, p0: 1.99e4 },
] as const;
const RAOULT_SETS = (() => {
  const out: { W: number; M: number; n2: number }[] = [];
  for (const W of [90, 180]) {
    for (const M of [60, 92, 180, 342]) {
      for (const n2 of [0.1, 0.2, 0.25]) {
        if (n2 / (W / 18) <= 0.04) out.push({ W, M, n2 });
      }
    }
  }
  return out;
})();

const raoult: Def = {
  id: 'raoult-vapor-pressure',
  title: 'ラウールの法則と蒸気圧降下',
  unit: 'c15',
  level: 3,
  build(rng, r) {
    const { W, M: Mtrue, n2: n2True } = pick(rng, RAOULT_SETS);
    const { t, p0 } = pick(rng, RAOULT_T);
    const n1 = W / 18;
    const w = sig3(Mtrue * n2True);
    const dp = sig3((p0 * n2True) / (n1 + n2True));
    const a3 = dp / p0 / 1e-2;
    const x2 = r(a3) * 1e-2;
    const n2 = (n1 * x2) / (1 - x2);
    const n2R = r(n2);
    const M = w / n2R;
    return {
      intro: `不揮発性の物質を溶かしたうすい溶液の蒸気圧 p は、純溶媒の蒸気圧 p₀ に溶媒のモル分率をかけた値になる（ラウールの法則）。モル質量 M₀ [g/mol] の溶媒 W [g] に、モル質量 M [g/mol] の不揮発性の非電解質 w [g] を溶かした溶液を考える。数値を求める小問では、溶媒は水（M₀ = 18.0 g/mol）${f(W)} g、溶質は ${f(w)} g で、${t} ℃ での純水の蒸気圧は ${sci(p0)} Pa、溶液の蒸気圧は純水より ${f(dp)} Pa 低かったとする。`,
      steps: [
        choice(rng, '溶液中の溶媒のモル分率を表す式を選べ。', '(W/M₀)/(W/M₀ + w/M)', ['(w/M)/(W/M₀ + w/M)', 'W/(W + w)', '(W/M₀)/(w/M)'], ['W', 'M₀', 'w', 'M'],
          '溶媒は W/M₀ mol、溶質は w/M mol。溶媒のモル分率 = (W/M₀)/(W/M₀ + w/M)。(w/M)/(W/M₀ + w/M) は溶質のモル分率、W/(W + w) は質量の割合である。'),
        choice(rng, '溶媒の物質量を n₁、溶質の物質量を n₂ とするとき、蒸気圧降下 Δp = p₀ − p を表す式を選べ。', 'p₀n₂/(n₁ + n₂)', ['p₀n₁/(n₁ + n₂)', 'p₀n₁/n₂', 'p₀(n₁ + n₂)/n₂'], ['p₀', 'n₁', 'n₂'],
          'p = p₀ × n₁/(n₁ + n₂)。Δp = p₀ − p = p₀ × {1 − n₁/(n₁ + n₂)} = p₀n₂/(n₁ + n₂)。蒸気圧降下は溶質のモル分率に比例する。p₀n₁/(n₁ + n₂) は溶液の蒸気圧 p そのものである。'),
        st('数値を入れて、溶質のモル分率を a×10⁻² と表すとき、a を求めろ。', a3, '×10⁻²',
          `(2) より 溶質のモル分率 = Δp/p₀ = ${f(dp)} ÷ ${sci(p0)} = ${sci(x2)}。`),
        choice(rng, '溶質のモル質量 M を、w、W、M₀、p₀、Δp で表す式を選べ。', 'wM₀(p₀ − Δp)/(WΔp)', ['wM₀Δp/(W(p₀ − Δp))', 'WM₀(p₀ − Δp)/(wΔp)', 'w(p₀ − Δp)/(WM₀Δp)'], ['w', 'M₀', 'p₀', 'Δp', 'W'],
          'Δp/p₀ = n₂/(n₁ + n₂) より n₂(p₀ − Δp) = n₁Δp、n₂ = n₁Δp/(p₀ − Δp)。n₁ = W/M₀、n₂ = w/M を入れると w/M = WΔp/{M₀(p₀ − Δp)}。M = wM₀(p₀ − Δp)/(WΔp)。分子と分母が逆の式、w と W を取り違えた式、M₀ を分母に置いた式が間違いの例である。'),
        st('溶質の物質量は何 mol か。', n2, 'mol',
          `水は ${f(W)} ÷ 18.0 = ${f(n1)} mol。n₂/(${f(n1)} + n₂) = ${sci(x2)} より n₂ = ${f(n1)} × ${sci(x2)} ÷ (1 − ${sci(x2)}) = ${f(n2)} mol。`),
        st('溶質の分子量を求めろ。', M, '',
          `${f(w)} ÷ ${f(n2R)} = ${f(M)}。`),
      ],
      p: { W, Mtrue, n2True, t, p0, w, dp },
    };
  },
};

// ───────────────────────── 一覧 ─────────────────────────

const DEFS: Def[] = [
  n2o4, vapor, titration, ksp, metal, ionic, electrolysis, leadAcid, fuelCell, thermo, bondNH3, hessCH4, firstOrder,
  fpElectrolyte, fpDimer, osmotic, henry, buffer, twoStep, redox, elemental, fat, condensation, vinylon, starch, glycine,
  mixedCombustion, dumas, dissGeneral, weakGeneral, extraction, raoult,
];

function finish(d: Def, b: Built): Drill {
  return { id: d.id, title: d.title, unit: d.unit, intro: b.intro, steps: b.steps };
}

export const DRILLS: DrillGen[] = DEFS.map((d) => ({
  id: d.id,
  title: d.title,
  unit: d.unit,
  level: d.level,
  make: (rng: Rng): Drill => finish(d, d.build(rng, noRound)),
}));

/**
 * テストと検算のための道具。元の数値（params）もいっしょに返す。
 * chained を true にすると、途中の答えを有効数字 3 桁に丸めて次の小問に使った場合の答えになる
 * （プレイヤーが丸めた値で計算を続けたときに出る値）。乱数の使い方は make と同じ。
 */
export function inspectDrill(id: string, rng: Rng, chained = false): { drill: Drill; params: Record<string, number> } {
  const d = DEFS.find((x) => x.id === id);
  if (!d) throw new Error(`drill not found: ${id}`);
  const b = d.build(rng, chained ? sig3 : noRound);
  return { drill: finish(d, b), params: b.p };
}
