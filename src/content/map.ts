/** 最初の区画の大きさ。地図そのものに果てはない */
export const MAP_W = 84;
export const MAP_H = 56;

export type Zone = 'sea' | 'sulfur' | 'limestone' | 'iron' | 'coal' | 'bauxite' | 'copper' | 'zinc' | 'lead' | 'oil' | 'gas' | 'farm' | 'grove' | 'ranch' | 'rubber';

export interface ZoneInfo {
  name: string;
  resource: string;
  /** 天然での存在のしかた。入試で問われるので、採れる形は現実に合わせる */
  form: '単体' | '化合物' | '混合物';
  about: string;
  /** 入試での問われ方 */
  exam: string;
  /** 地面の色 [外側, 内側] */
  tint: [string, string];
  /** 中心と半径。海だけは海岸線で決まる */
  at: [number, number, number];
}

/** 資源地。採取機を置くと resource が出る */
export const ZONES: Record<Zone, ZoneInfo> = {
  sea: {
    name: '海', resource: 'seawater', form: '混合物', tint: ['#1f5b63', '#0d3442'], at: [1.6, 27, 0],
    about: '海水は、水に NaCl などの塩が溶けた混合物。そのままでは水としても食塩としても使えない。',
    exam: '「海水から純水を得る操作」は蒸留。NaCl の原料は海水（または岩塩）。純物質と混合物の区別、分離法の名前が共通テストで頻出。',
  },
  sulfur: {
    name: '硫黄鉱床', resource: 'S', form: '単体', tint: ['#5b5320', '#c2ad3c'], at: [60, 41, 3],
    about: '硫黄は火山地帯で単体のまま産出する、数少ない非金属。黄色の固体で、斜方硫黄・単斜硫黄・ゴム状硫黄の同素体がある。現在の工業では、石油の脱硫で回収したものが主に使われる。',
    exam: '同素体をもつ元素は S・C・O・P。硫黄は接触法による硫酸製造の出発物質。',
  },
  limestone: {
    name: '石灰岩地帯', resource: 'CaCO3', form: '化合物', tint: ['#4b4f52', '#a9adb0'], at: [31, 12, 3.2],
    about: '石灰石の主成分は炭酸カルシウム CaCO₃。大理石や貝殻も同じ。強熱すると CaO と CO₂ に分かれる。',
    exam: '石灰石 → 生石灰 → 消石灰の変化、鍾乳洞（CaCO₃ + CO₂ + H₂O ⇄ Ca(HCO₃)₂）、アンモニアソーダ法の CO₂ 源、製鉄でのスラグ形成。',
  },
  iron: {
    name: '鉄鉱山', resource: 'Fe2O3', form: '化合物', tint: ['#4d2a20', '#a04a2c'], at: [62, 13, 3],
    about: '鉄は酸化物の鉱石として産出する。赤鉄鉱の主成分は Fe₂O₃、磁鉄鉱は Fe₃O₄。',
    exam: '高炉で CO によって還元する。銑鉄と鋼の違い、コークス・石灰石の役割が問われる。',
  },
  coal: {
    name: '炭田', resource: 'coal', form: '混合物', tint: ['#22252b', '#3b404a'], at: [73, 25, 3],
    about: '石炭は炭素を主成分とする複雑な混合物。乾留するとコークス、コールタール、石炭ガスに分かれる。',
    exam: 'コークスは製鉄の還元剤（実際に働くのは CO）。乾留という操作名。',
  },
  bauxite: {
    name: 'ボーキサイト鉱床', resource: 'bauxite', form: '混合物', tint: ['#51332a', '#b0705a'], at: [70, 45, 3],
    about: 'ボーキサイトは Al₂O₃·nH₂O を主成分とし、Fe₂O₃ などの不純物を含む赤褐色の鉱石。',
    exam: 'Al₂O₃ が両性酸化物であることを利用して精製し、氷晶石を使って溶融塩電解する。Al は水溶液の電気分解では得られない。',
  },
  copper: {
    name: '銅鉱山', resource: 'CuFeS2', form: '化合物', tint: ['#3c3a1c', '#b79a3a'], at: [50, 8, 2.8],
    about: '銅は主に硫化物の鉱石として産出する。黄銅鉱の主成分は CuFeS₂。',
    exam: '粗銅を電解精錬して純銅にする。陽極泥に入る金属、溶けたまま残る金属の区別が頻出。',
  },
  zinc: {
    name: '亜鉛鉱山', resource: 'ZnS', form: '化合物', tint: ['#2f3a40', '#7d949e'], at: [23, 44, 2.6],
    about: '亜鉛は閃亜鉛鉱（主成分 ZnS）として産出する。',
    exam: '硫化物は焙焼して酸化物にしてから炭素で還元する。亜鉛は両性金属で、ダニエル電池や乾電池の負極。',
  },
  lead: {
    name: '鉛鉱山', resource: 'PbS', form: '化合物', tint: ['#2b2f38', '#6a7386'], at: [37, 49, 2.6],
    about: '鉛は方鉛鉱（主成分 PbS）として産出する。',
    exam: '鉛蓄電池の両極の反応と質量変化は京大でも頻出。PbSO₄・PbCl₂・PbCrO₄ の沈殿の色。',
  },
  oil: {
    name: '油田', resource: 'crude', form: '混合物', tint: ['#1e1b16', '#4a3d22'], at: [17, 27, 3],
    about: '原油はさまざまな炭化水素の混合物。分留してナフサなどに分け、熱分解してエチレンやプロペン、ベンゼンなどを得る。',
    exam: '分留で得られる成分の順、ナフサの熱分解、石油化学の出発原料としてのエチレン。',
  },
  gas: {
    name: 'ガス田', resource: 'CH4', form: '化合物', tint: ['#1f3340', '#3f7f96'], at: [15, 10, 2.6],
    about: '天然ガスの主成分はメタン CH₄。',
    exam: 'メタンの水蒸気改質による水素の製造、合成ガスからのメタノール合成、置換反応。',
  },
  farm: {
    name: '農地', resource: 'starch', form: '化合物', tint: ['#33421c', '#8fae42'], at: [53, 50, 3],
    about: '穀物やいもに含まれるデンプンは、多数の α-グルコースが縮合した天然高分子。アミロースとアミロペクチンからなる。',
    exam: 'ヨウ素デンプン反応、酵素による段階的な加水分解、アルコール発酵の量的関係。',
  },
  grove: {
    name: 'オリーブ畑', resource: 'fat', form: '化合物', tint: ['#2f3b22', '#6f8a3c'], at: [76, 9, 2.6],
    about: '油脂は、グリセリン 1 分子と高級脂肪酸 3 分子からなるエステル。',
    exam: 'けん化価・ヨウ素価の計算、セッケンの性質（弱塩基性、硬水で沈殿）、硬化油。',
  },
  rubber: {
    name: 'ゴム園', resource: 'rubber', form: '化合物', tint: ['#2e3a2a', '#5f9a6a'], at: [12, 45, 2.4],
    about: 'ゴムの木の樹液（ラテックス）を固めた生ゴムは、イソプレンが付加重合した形のポリイソプレンで、二重結合がシス形になっている。',
    exam: '天然ゴムの単量体はイソプレン。シス形だから弾性がある。硫黄を加えて加熱する加硫で架橋構造ができ、弾性と強度が増す。',
  },
  ranch: {
    name: '牧場', resource: 'protein', form: '化合物', tint: ['#3a3326', '#a08a5c'], at: [28, 30, 2.4],
    about: '肉・乳・卵に含まれるタンパク質は、多数の α-アミノ酸がペプチド結合でつながった天然高分子。',
    exam: 'ビウレット反応、キサントプロテイン反応、硫黄の検出、変性、酵素による加水分解、アミノ酸の等電点。',
  },
};

/** 資源地でない陸地。大気はどこでも採れる */
export const LAND = {
  name: '大気', resource: 'air', form: '混合物' as const,
  about: '空気は N₂ と O₂ がおよそ 4 : 1（体積比）で混ざった混合物で、少量の Ar、CO₂ などを含む。N₂、O₂、Ar は単体のまま存在している。陸地ならどこでも採取できる。',
  exam: 'N₂ と O₂ の工業的製法は「液体空気の分留」。化合物から作るのではなく、単体の混合物を分けるだけ、という点が問われる。',
};

const blob = (x: number, y: number, cx: number, cy: number, r: number) => {
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy, th = Math.atan2(dy, dx), ph = cx * 0.7 + cy * 0.3;
  return Math.hypot(dx, dy) < r * (1 + 0.16 * Math.sin(3 * th + ph) + 0.09 * Math.sin(5 * th + ph * 2));
};
const BLOBS = (Object.keys(ZONES) as Zone[]).filter((z) => z !== 'sea');

/** 海岸線。西はどこまでも海 */
const coast = (y: number) => 6 + 1.6 * Math.sin(y * 0.3) + 0.8 * Math.sin(y * 0.9 + 1);

// ---- 地図に果てはない。最初の区画（MAP_W × MAP_H）の外には、同じ種類の資源地が不規則に現れ続ける ----
const CELL = 22;
const hash2 = (x: number, y: number, k: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
export interface ZoneSpot { zone: Zone; cx: number; cy: number; r: number }
const cells = new Map<string, ZoneSpot | null>();
/** 区画ごとに、資源地が 1 つあるかどうかが決まっている */
function spotOf(gx: number, gy: number): ZoneSpot | null {
  const k = `${gx},${gy}`;
  let s = cells.get(k);
  if (s !== undefined) return s;
  s = null;
  const x0 = gx * CELL, y0 = gy * CELL;
  const inCore = x0 < MAP_W + 4 && x0 + CELL > -4 && y0 < MAP_H + 4 && y0 + CELL > -4;
  if (!inCore && x0 > 12 && hash2(gx, gy, 1) < 0.72) {
    s = {
      zone: BLOBS[Math.floor(hash2(gx, gy, 2) * BLOBS.length)],
      cx: x0 + 5 + hash2(gx, gy, 3) * (CELL - 10), cy: y0 + 5 + hash2(gx, gy, 4) * (CELL - 10), r: 2.2 + hash2(gx, gy, 5) * 1.3,
    };
  }
  cells.set(k, s);
  return s;
}

export function zoneAt(x: number, y: number): Zone | null {
  if (x + 0.5 < coast(y)) return 'sea';
  if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
    for (const z of BLOBS) { const [cx, cy, r] = ZONES[z].at; if (blob(x, y, cx, cy, r)) return z; }
    return null;
  }
  const s = spotOf(Math.floor(x / CELL), Math.floor(y / CELL));
  return s && blob(x, y, s.cx, s.cy, s.r) ? s.zone : null;
}

/** 範囲内にある資源地の中心（名前を書く位置） */
export function zoneSpots(x0: number, y0: number, x1: number, y1: number): ZoneSpot[] {
  const out: ZoneSpot[] = [];
  for (const z of Object.keys(ZONES) as Zone[]) {
    const [cx, cy, r] = ZONES[z].at;
    if (z === 'sea') { const yy = Math.round((y0 + y1) / 2 / 40) * 40 + 20; out.push({ zone: z, cx: 1.6, cy: yy, r: 0 }); }
    else if (cx >= x0 - 4 && cx <= x1 + 4 && cy >= y0 - 4 && cy <= y1 + 4) out.push({ zone: z, cx, cy, r });
  }
  for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
    const s = spotOf(gx, gy);
    if (s) out.push(s);
  }
  return out;
}

/** そのマスで採取機が出すもの */
export const resourceAt = (x: number, y: number): string => { const z = zoneAt(x, y); return z ? ZONES[z].resource : LAND.resource; };

/** 納品所の中心（マスの角）。指令を達成していくと、ここを中心に大きくなる */
export const HUB_CENTER: [number, number] = [42, 28];
export const HUB_SIZES = [2, 4, 6, 8];
/** 達成数がこれ以上になると次の大きさになる */
export const HUB_AT = [0, 3, 12, 30];
/** 大きさごとの、要求数の倍率 */
export const HUB_DEMAND = [1, 1.5, 2, 3];
export const hubRect = (size: number) => ({ x: HUB_CENTER[0] - size / 2, y: HUB_CENTER[1] - size / 2, s: size });
export function hubTiles(size: number): [number, number][] {
  const { x, y } = hubRect(size), out: [number, number][] = [];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) out.push([x + i, y + j]);
  return out;
}
/** 最初の大きさの納品所が占めるマス */
export const HUB_TILES: [number, number][] = hubTiles(2);
