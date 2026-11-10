export type Atoms = Record<string, number>;

const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** 全角・下付き数字・空白を吸収して、比較用の表記にそろえる */
export function normalizeFormula(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, '');
}

/** 表示用：数字を下付きにする */
export function pretty(formula: string): string {
  return formula.replace(/\d/g, (d) => SUB[+d]);
}

/** 化学式を原子数に分解する。括弧に対応。電荷と水和物は未対応 */
export function parseFormula(formula: string): Atoms {
  const f = normalizeFormula(formula);
  let i = 0;
  const num = (): number => {
    let s = '';
    while (i < f.length && /\d/.test(f[i])) s += f[i++];
    return s ? parseInt(s, 10) : 1;
  };
  const group = (): Atoms => {
    const out: Atoms = {};
    const add = (a: Atoms, k: number) => {
      for (const el in a) out[el] = (out[el] || 0) + a[el] * k;
    };
    while (i < f.length && f[i] !== ')') {
      if (f[i] === '(') {
        i++;
        const inner = group();
        if (f[i] !== ')') throw new Error(`括弧が閉じていない: ${formula}`);
        i++;
        add(inner, num());
      } else if (/[A-Z]/.test(f[i])) {
        let el = f[i++];
        while (i < f.length && /[a-z]/.test(f[i])) el += f[i++];
        add({ [el]: 1 }, num());
      } else {
        throw new Error(`化学式として読めない: ${formula}`);
      }
    }
    return out;
  };
  const atoms = group();
  if (i !== f.length) throw new Error(`化学式として読めない: ${formula}`);
  return atoms;
}

/** 反応式の両辺の原子数が一致するか */
export function isBalanced(lhs: [string, number][], rhs: [string, number][]): boolean {
  const sum = (side: [string, number][]) => {
    const t: Atoms = {};
    for (const [f, n] of side) {
      const a = parseFormula(f);
      for (const el in a) t[el] = (t[el] || 0) + a[el] * n;
    }
    return t;
  };
  const a = sum(lhs), b = sum(rhs);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}
