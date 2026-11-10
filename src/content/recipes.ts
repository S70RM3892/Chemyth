export type MachineKind = 'separator' | 'electrolyzer' | 'reactor';

export interface Recipe {
  id: string;
  machine: MachineKind;
  name: string;
  /** [物質id, 係数] */
  inputs: [string, number][];
  /** 電解槽では [陰極, 陽極] の順 */
  outputs: [string, number][];
  /** 装置ごとの条件欄で正解になる選択肢 */
  accept: string[];
  /** 1回の反応にかかる秒数 */
  time: number;
  /** 分離操作は反応式ではないので係数を問わない */
  separation?: boolean;
  /** 答えを見たときに出す解説 */
  note: string;
  /** 教科書での単元 */
  source: string;
}

/** 装置ごとの条件欄。選択肢は誤答候補を含む */
export const CONDITIONS: Record<MachineKind, { label: string; options: string[] }> = {
  separator: {
    label: '分離法',
    options: ['蒸留', '分留', '再結晶', 'ろ過', '抽出', '昇華法', 'クロマトグラフィー'],
  },
  electrolyzer: {
    label: '水に溶かす電解質',
    options: ['NaOH', 'H₂SO₄', 'NaCl', 'CuSO₄', 'なし（純水のまま）'],
  },
  reactor: {
    label: '触媒',
    options: ['Fe₃O₄', 'Pt', 'V₂O₅', 'MnO₂', 'Ni', 'なし'],
  },
};

export const RECIPES: Recipe[] = [
  {
    id: 'air-distillation',
    machine: 'separator',
    name: '液体空気の分留',
    inputs: [['air', 5]],
    outputs: [['N2', 4], ['O2', 1]],
    accept: ['分留'],
    time: 2,
    separation: true,
    note: '沸点の異なる液体どうしの混合物を、沸点の差で成分ごとに分けるのが分留。空気を冷却・圧縮して液体空気にし、沸点の差で分ける。沸点は N₂ が −196 ℃、O₂ が −183 ℃ で、沸点の低い N₂ が先に気化する。空気の体積比はおよそ N₂ : O₂ = 4 : 1。',
    source: '化学基礎：物質の分離・精製／化学：非金属元素（窒素・酸素）',
  },
  {
    id: 'seawater-distillation',
    machine: 'separator',
    name: '海水の蒸留',
    inputs: [['seawater', 5]],
    outputs: [['H2O', 4], ['NaCl', 1]],
    accept: ['蒸留'],
    time: 2,
    separation: true,
    note: '液体とそこに溶けた不揮発性の物質を分けるのが蒸留。海水を加熱すると水だけが蒸発するので、冷却して純水を得る。あとに NaCl などの塩が残る。液体どうしを沸点の差で分ける分留とは区別する。実際の海水の塩分は質量で約 3.5 % で、ここでは量を誇張している。',
    source: '化学基礎：物質の分離・精製',
  },
  {
    id: 'water-electrolysis',
    machine: 'electrolyzer',
    name: '水の電気分解',
    inputs: [['H2O', 2]],
    outputs: [['H2', 2], ['O2', 1]],
    accept: ['NaOH', 'H₂SO₄'],
    time: 1.5,
    note: '2H₂O → 2H₂ + O₂。純水は電気をほとんど通さないので NaOH か希硫酸を加える。陰極で還元が起きて H₂、陽極で酸化が起きて O₂ が発生する。NaCl を加えると陽極で Cl₂、CuSO₄ を加えると陰極で Cu が出てしまう。',
    source: '化学：電気分解',
  },
  {
    id: 'haber-bosch',
    machine: 'reactor',
    name: 'ハーバー・ボッシュ法',
    inputs: [['N2', 1], ['H2', 3]],
    outputs: [['NH3', 2]],
    accept: ['Fe₃O₄'],
    time: 2,
    note: 'N₂ + 3H₂ ⇄ 2NH₃。四酸化三鉄 Fe₃O₄ を主成分とする触媒を使う。発熱反応で気体分子数が減るので、平衡上は低温・高圧が有利。ただし低温では反応が遅いため、実際は 400〜600 ℃、高圧で行う。',
    source: '化学：化学平衡／非金属元素（アンモニアの工業的製法）',
  },
  {
    id: 'ostwald-1',
    machine: 'reactor',
    name: 'オストワルト法 ①アンモニアの酸化',
    inputs: [['NH3', 4], ['O2', 5]],
    outputs: [['NO', 4], ['H2O', 6]],
    accept: ['Pt'],
    time: 2,
    note: '4NH₃ + 5O₂ → 4NO + 6H₂O。白金 Pt を触媒にして約 800 ℃ で酸化する。N の酸化数は −3 から +2 になる。',
    source: '化学：非金属元素（硝酸の工業的製法）',
  },
  {
    id: 'ostwald-2',
    machine: 'reactor',
    name: 'オストワルト法 ②一酸化窒素の酸化',
    inputs: [['NO', 2], ['O2', 1]],
    outputs: [['NO2', 2]],
    accept: ['なし'],
    time: 1.5,
    note: '2NO + O₂ → 2NO₂。無色の NO は空気に触れるだけで酸化され、赤褐色の NO₂ になる。触媒は要らない。',
    source: '化学：非金属元素（硝酸の工業的製法）',
  },
  {
    id: 'ostwald-3',
    machine: 'reactor',
    name: 'オストワルト法 ③水への吸収',
    inputs: [['NO2', 3], ['H2O', 1]],
    outputs: [['HNO3', 2], ['NO', 1]],
    accept: ['なし'],
    time: 1.5,
    note: '3NO₂ + H₂O → 2HNO₃ + NO。NO₂ の N（+4）が HNO₃（+5）と NO（+2）に分かれる自己酸化還元反応。出てきた NO は②へ戻して再利用する。①〜③をまとめると NH₃ + 2O₂ → HNO₃ + H₂O。',
    source: '化学：非金属元素（硝酸の工業的製法）',
  },
  {
    id: 'sulfur-burn',
    machine: 'reactor',
    name: '接触法 ①硫黄の燃焼',
    inputs: [['S', 1], ['O2', 1]],
    outputs: [['SO2', 1]],
    accept: ['なし'],
    time: 1.5,
    note: 'S + O₂ → SO₂。硫黄を燃やして二酸化硫黄にする。黄鉄鉱 FeS₂ を燃やす方法もある。',
    source: '化学：非金属元素（硫酸の工業的製法）',
  },
  {
    id: 'contact',
    machine: 'reactor',
    name: '接触法 ②二酸化硫黄の酸化',
    inputs: [['SO2', 2], ['O2', 1]],
    outputs: [['SO3', 2]],
    accept: ['V₂O₅'],
    time: 2,
    note: '2SO₂ + O₂ → 2SO₃。酸化バナジウム(V) V₂O₅ を触媒にする。この触媒に接触させることが「接触法」の名の由来。',
    source: '化学：非金属元素（硫酸の工業的製法）',
  },
  {
    id: 'so3-absorb',
    machine: 'reactor',
    name: '接触法 ③三酸化硫黄の吸収',
    inputs: [['SO3', 1], ['H2O', 1]],
    outputs: [['H2SO4', 1]],
    accept: ['なし'],
    time: 1.5,
    note: 'SO₃ + H₂O → H₂SO₄。実際には SO₃ を直接水に吸収させると発熱で霧になるので、濃硫酸に吸収させて発煙硫酸とし、それを希硫酸で薄めて濃硫酸にする。この手順は記述で問われる。',
    source: '化学：非金属元素（硫酸の工業的製法）',
  },
];

export function recipeById(id: string | undefined): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
