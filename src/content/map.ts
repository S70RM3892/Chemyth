export const MAP_W = 42;
export const MAP_H = 26;

export type Zone = 'sea' | 'air' | 'sulfur';

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
    name: '海', resource: 'seawater', labelAt: [0.5, 13.4], form: '混合物',
    about: '海水は、水に NaCl などの塩が溶けた混合物。そのままでは水としても食塩としても使えない。',
    exam: '「海水から純水を得る操作」は蒸留。NaCl の原料は海水（または岩塩）。純物質と混合物の区別、分離法の名前が共通テストで頻出。',
  },
  air: {
    name: '大気採取地', resource: 'air', labelAt: [29.4, 6.2], form: '混合物',
    about: '空気は N₂ と O₂ がおよそ 4 : 1（体積比）で混ざった混合物で、少量の Ar、CO₂ などを含む。N₂、O₂、Ar は単体のまま存在している。',
    exam: 'N₂ と O₂ の工業的製法は「液体空気の分留」。化合物から作るのではなく、単体の混合物を分けるだけ、という点が問われる。',
  },
  sulfur: {
    name: '硫黄鉱床', resource: 'S', labelAt: [30.6, 20.2], form: '単体',
    about: '硫黄は火山地帯で単体のまま産出する、数少ない非金属。黄色の固体で、斜方硫黄・単斜硫黄・ゴム状硫黄の同素体がある。現在の工業では、石油を精製するときの脱硫で回収したものが主に使われる。',
    exam: '同素体をもつ元素は S・C・O・P。硫黄は接触法による硫酸製造の出発物質。「単体で産出する」こと自体が問われる。',
  },
};

const blob = (x: number, y: number, cx: number, cy: number, r: number, ph: number) => {
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy, th = Math.atan2(dy, dx);
  return Math.hypot(dx, dy) < r * (1 + 0.16 * Math.sin(3 * th + ph) + 0.09 * Math.sin(5 * th + ph * 2));
};

export function zoneAt(x: number, y: number): Zone | null {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  if (x + 0.5 < 4.2 + 1.3 * Math.sin(y * 0.55) + 0.6 * Math.sin(y * 1.7 + 1)) return 'sea';
  if (blob(x, y, 31, 6, 3.5, 0.6)) return 'air';
  if (blob(x, y, 32, 20, 2.7, 2.1)) return 'sulfur';
  return null;
}

/** 納品所が占めるマス */
export const HUB_TILES: [number, number][] = [[19, 12], [20, 12], [19, 13], [20, 13]];

export interface Goal {
  s: string;
  n: number;
  hint: string;
}

export const GOALS: Goal[] = [
  { s: 'N2', n: 10, hint: '大気採取地の空気から取り出せ。' },
  { s: 'H2', n: 10, hint: '海水から水を取り出し、電気で分解しろ。要らない物質は廃棄口へ。' },
  { s: 'NH3', n: 20, hint: '窒素と水素を反応器に入れろ。比が合わないと余って詰まる。' },
  { s: 'HNO3', n: 10, hint: 'アンモニアを酸化して硝酸にしろ。3段階ある。捨てていた酸素と水に使い道ができた。' },
  { s: 'H2SO4', n: 10, hint: '南東の硫黄鉱床から始めろ。これも3段階。' },
];
