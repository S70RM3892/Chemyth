import { normalizeFormula, pretty } from '../chem/formula';

export interface Substance {
  id: string;
  /** 純物質のみ。混合物は持たない */
  formula?: string;
  name: string;
  color: string;
}

export const SUBSTANCES: Substance[] = [
  { id: 'air', name: '空気', color: '#9fb0bd' },
  { id: 'H2O', formula: 'H2O', name: '水', color: '#4fb6e8' },
  { id: 'N2', formula: 'N2', name: '窒素', color: '#7f9cf5' },
  { id: 'O2', formula: 'O2', name: '酸素', color: '#f0707f' },
  { id: 'H2', formula: 'H2', name: '水素', color: '#e9ecef' },
  { id: 'NH3', formula: 'NH3', name: 'アンモニア', color: '#9bd36b' },
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
