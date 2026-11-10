import { normalizeFormula, pretty } from '../chem/formula';

export interface Substance {
  id: string;
  /** 純物質のみ。混合物は持たない */
  formula?: string;
  name: string;
  color: string;
  /** 常温常圧での状態。ベルト上の形が変わる */
  state: 'gas' | 'liquid' | 'solid';
}

export const SUBSTANCES: Substance[] = [
  { id: 'air', name: '空気', color: '#a9bccb', state: 'gas' },
  { id: 'seawater', name: '海水', color: '#3f9ec4', state: 'liquid' },
  { id: 'H2O', formula: 'H2O', name: '水', color: '#6cc7f2', state: 'liquid' },
  { id: 'NaCl', formula: 'NaCl', name: '塩化ナトリウム', color: '#f1ede2', state: 'solid' },
  { id: 'N2', formula: 'N2', name: '窒素', color: '#8ea6ff', state: 'gas' },
  { id: 'O2', formula: 'O2', name: '酸素', color: '#ff8192', state: 'gas' },
  { id: 'H2', formula: 'H2', name: '水素', color: '#eef1f4', state: 'gas' },
  { id: 'NH3', formula: 'NH3', name: 'アンモニア', color: '#a8dd77', state: 'gas' },
];

const byId = new Map(SUBSTANCES.map((s) => [s.id, s]));

export function sub(id: string): Substance {
  const s = byId.get(id);
  if (!s) throw new Error(`未定義の物質: ${id}`);
  return s;
}

/** 入力された化学式から物質を引く。知らない式なら null */
export function subByFormula(raw: string): Substance | null {
  const f = normalizeFormula(raw);
  return SUBSTANCES.find((s) => s.formula === f) ?? null;
}

export function label(id: string): string {
  const s = sub(id);
  return s.formula ? pretty(s.formula) : s.name;
}
