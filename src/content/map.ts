export const MAP_W = 42;
export const MAP_H = 26;

export type Zone = 'sea' | 'air';

/** 資源地。採取機を置くと resource が出る */
export const ZONES: Record<Zone, { name: string; resource: string; labelAt: [number, number] }> = {
  sea: { name: '海', resource: 'H2O', labelAt: [0.4, 13.6] },
  air: { name: '大気採取地', resource: 'air', labelAt: [31, 2.6] },
};

export function zoneAt(x: number, y: number): Zone | null {
  if (x < 5 + Math.round(1.5 * Math.sin(y * 0.7))) return 'sea';
  if (x >= 27 && x <= 34 && y >= 3 && y <= 9) return 'air';
  return null;
}

/** 納品ハブが占めるマス */
export const HUB_TILES: [number, number][] = [[19, 12], [20, 12], [19, 13], [20, 13]];

export interface Goal {
  s: string;
  n: number;
  hint: string;
}

export const GOALS: Goal[] = [
  { s: 'N2', n: 10, hint: '大気採取地の空気から取り出せ。' },
  { s: 'H2', n: 10, hint: '海の水を電気で分解しろ。余った気体は放出口へ。' },
  { s: 'NH3', n: 20, hint: '窒素と水素を別々のベルトで反応器に入れろ。' },
];
