/**
 * アミノ酸の電気泳動。
 * アミノ酸は、等電点より酸性側では陽イオン（陰極へ動く）、塩基性側では陰イオン（陽極へ動く）、
 * 等電点では全体の電荷が 0 の双性イオン（動かない）になる。
 * 溶液の pH を決めると、混合物は陰極側・動かない・陽極側の 3 つに分かれる。
 */

export type AminoKey = 'Glu' | 'Ala' | 'Lys';
export const AMINO_ORDER: AminoKey[] = ['Glu', 'Ala', 'Lys'];
/** 等電点は、教科書・資料集で使われる値 */
export const AMINO: Record<AminoKey, { name: string; pI: number; kind: string }> = {
  Glu: { name: 'グルタミン酸', pI: 3.2, kind: '酸性アミノ酸（側鎖に –COOH）' },
  Ala: { name: 'アラニン', pI: 6.0, kind: '中性アミノ酸' },
  Lys: { name: 'リシン', pI: 9.7, kind: '塩基性アミノ酸（側鎖に –NH₂）' },
};

export const aminoId = (keys: AminoKey[]) => 'amino:' + AMINO_ORDER.filter((k) => keys.includes(k)).join('.');
export function aminoOf(id: string): AminoKey[] | null {
  if (!id.startsWith('amino:')) return null;
  const keys = id.slice(6).split('.');
  const sorted = AMINO_ORDER.filter((k) => (keys as string[]).includes(k));
  return keys.length && sorted.join('.') === keys.join('.') ? sorted : null;
}

export type Pole = 'cathode' | 'stay' | 'anode';
/** 等電点との差がこれ以下なら「動かない」とみなす */
export const PI_BAND = 0.5;
/** pH を決めたとき、そのアミノ酸がどちらへ動くか */
export function poleAt(key: AminoKey, pH: number): Pole {
  const d = pH - AMINO[key].pI;
  return Math.abs(d) <= PI_BAND ? 'stay' : d < 0 ? 'cathode' : 'anode';
}
export const POLE_NAME: Record<Pole, string> = { cathode: '陰極へ動く', stay: '動かない', anode: '陽極へ動く' };

/** 設定できる pH（整数） */
export const PH_MIN = 1, PH_MAX = 13;
export const phOf = (setting: string | undefined): number | null => { const n = Number(setting); return setting !== undefined && Number.isInteger(n) && n >= PH_MIN && n <= PH_MAX ? n : null; };

const out = (keys: AminoKey[]): string | null => (keys.length === 0 ? null : keys.length === 1 ? keys[0] : aminoId(keys));
/** 電気泳動の結果。main：動かずに残るもの、side：陽極側、side2：陰極側 */
export function migrate(item: string, pH: number): { main: string | null; side: string | null; side2: string | null } {
  const keys = aminoOf(item) ?? ((AMINO_ORDER as string[]).includes(item) ? [item as AminoKey] : null);
  if (!keys) return { main: item, side: null, side2: null };
  const at = (p: Pole) => out(keys.filter((k) => poleAt(k, pH) === p));
  return { main: at('stay'), side: at('anode'), side2: at('cathode') };
}
export const migratable = (id: string) => aminoOf(id) !== null || (AMINO_ORDER as string[]).includes(id);

export const AMINO_MIXES: { id: string; name: string; keys: AminoKey[] }[] = [
  { id: aminoId(['Glu', 'Lys']), name: 'アミノ酸の混合水溶液 ア', keys: ['Glu', 'Lys'] },
  { id: aminoId(['Ala', 'Lys']), name: 'アミノ酸の混合水溶液 イ', keys: ['Ala', 'Lys'] },
  { id: aminoId(['Glu', 'Ala', 'Lys']), name: 'アミノ酸の混合水溶液 ウ', keys: ['Glu', 'Ala', 'Lys'] },
];

export function migrateReachable(start: string): Set<string> {
  const seen = new Set<string>([start]), queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    if (!migratable(cur)) continue;
    for (let pH = PH_MIN; pH <= PH_MAX; pH++) {
      const r = migrate(cur, pH);
      for (const x of [r.main, r.side, r.side2]) if (x && !seen.has(x)) { seen.add(x); queue.push(x); }
    }
  }
  return seen;
}
