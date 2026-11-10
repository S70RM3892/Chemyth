export const MAP_W = 42;
export const MAP_H = 26;

export type Zone = 'sea' | 'air';

export interface ZoneInfo {
  name: string;
  resource: string;
  labelAt: [number, number];
  /** 天然での存在のしかた。入試で問われるので、採れる形は現実に合わせる */
  form: '単体' | '化合物' | '混合物';
  about: string;
  /** 入試での問われ方 */
  exam: string;
}

/** 資源地。採取機を置くと resource が出る */
export const ZONES: Record<Zone, ZoneInfo> = {
  sea: {
    name: '海', resource: 'seawater', labelAt: [0.4, 13.6], form: '混合物',
    about: '海水は、水に NaCl などの塩が溶けた混合物。そのままでは水としても食塩としても使えない。',
    exam: '「海水から純水を得る操作」は蒸留。NaCl の原料は海水（または岩塩）。純物質と混合物の区別、分離法の名前が共通テストで頻出。',
  },
  air: {
    name: '大気採取地', resource: 'air', labelAt: [31, 2.6], form: '混合物',
    about: '空気は N₂ と O₂ がおよそ 4 : 1（体積比）で混ざった混合物で、少量の Ar、CO₂ などを含む。N₂、O₂、Ar は単体のまま存在している。',
    exam: 'N₂ と O₂ の工業的製法は「液体空気の分留」。化合物から作るのではなく、単体の混合物を分けるだけ、という点が問われる。',
  },
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
  { s: 'H2', n: 10, hint: '海水から水を取り出し、電気で分解しろ。要らない物質は廃棄口へ。' },
  { s: 'NH3', n: 20, hint: '窒素と水素を別々のベルトで反応器に入れろ。' },
];
