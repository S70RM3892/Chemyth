export type MachineKind = 'separator' | 'electrolyzer' | 'reactor' | 'battery';

export interface Recipe {
  id: string;
  machine: MachineKind;
  name: string;
  /** [物質id, 係数] */
  inputs: [string, number][];
  /** 電解槽では [陰極, 陽極, …]。電池では先頭が電子 */
  outputs: [string, number][];
  /** 装置ごとの条件欄で正解になる選択肢 */
  accept: string[];
  /** 1回の反応にかかる秒数 */
  time: number;
  /** 混合物や高分子がからむので係数を問わない */
  loose?: boolean;
  /** 電池：負極・正極の活物質 */
  neg?: string;
  pos?: string;
  /** 答えを見たときに出す解説 */
  note: string;
  /** 教科書での単元 */
  source: string;
}

/** 装置ごとの条件欄。選択肢は誤答候補を含む */
export const CONDITIONS: Record<MachineKind, { label: string; options: string[] }> = {
  separator: {
    label: '分離法',
    options: ['蒸留', '分留', '再結晶', 'ろ過', '抽出', '昇華法', 'クロマトグラフィー', '乾留', '濃NaOH水溶液に溶かす'],
  },
  electrolyzer: {
    label: '電解の条件',
    options: ['水 + NaOH', '水 + H₂SO₄', '水のみ', '飽和食塩水（陽イオン交換膜）', 'CuSO₄ 水溶液（硫酸酸性）', '融解した氷晶石', '融解塩（水なし）'],
  },
  reactor: {
    label: '触媒・条件',
    options: ['なし', '加熱', '光', '高温・高圧', 'Fe₃O₄', 'Pt', 'V₂O₅', 'Ni', 'Cu（加熱）', 'ZnO', '鉄粉', 'HgCl₂', 'PdCl₂とCuCl₂', 'リン酸', '希硫酸',
      '濃硫酸（触媒）', '濃硫酸 130〜140 ℃', '濃硫酸 160〜170 ℃', '脱水剤 P₄O₁₀', '付加重合', '付加縮合', 'けん化', 'アミラーゼ', 'マルターゼ', 'チマーゼ'],
  },
  battery: {
    label: '電解質',
    options: ['希硫酸', 'リン酸水溶液', 'KOH 水溶液', 'ZnSO₄ 水溶液｜CuSO₄ 水溶液（素焼き板）', 'ZnCl₂ 水溶液', 'NaCl 水溶液'],
  },
};

const side = (s: string): [string, number][] => s.split(' + ').map((t) => {
  const m = /^(\d+)?\s*(.+)$/.exec(t.trim())!;
  return [m[2], m[1] ? +m[1] : 1];
});

type Opt = { time?: number; loose?: boolean; neg?: string; pos?: string };
const R = (id: string, machine: MachineKind, name: string, eq: string, accept: string[], source: string, note: string, o: Opt = {}): Recipe => {
  const [l, r] = eq.split(' -> ');
  return { id, machine, name, inputs: side(l), outputs: side(r), accept, source, note, time: o.time ?? 1.6, loose: o.loose, neg: o.neg, pos: o.pos };
};
const ANY = ['なし', '加熱'];
const HEAT = ['加熱'];

export const RECIPES: Recipe[] = [
  // ================= 分離 =================
  R('air-distillation', 'separator', '液体空気の分留', '5 air -> 4 N2 + 1 O2', ['分留'], '化学基礎：物質の分離／化学：非金属元素',
    '沸点の異なる液体どうしの混合物を、沸点の差で成分ごとに分けるのが分留。空気を冷却・圧縮して液体空気にし、沸点の低い N₂（−196 ℃）を先に気化させる。O₂ は −183 ℃。体積比はおよそ N₂ : O₂ = 4 : 1。', { loose: true, time: 2 }),
  R('seawater-distillation', 'separator', '海水の蒸留', '5 seawater -> 4 H2O + 1 NaCl', ['蒸留'], '化学基礎：物質の分離',
    '液体と、そこに溶けた不揮発性の物質を分けるのが蒸留。海水を加熱すると水だけが蒸発するので、冷却して純水を得る。あとに NaCl などの塩が残る。実際の塩分は質量で約 3.5 % で、ここでは量を誇張している。', { loose: true, time: 2 }),
  R('coal-carbonization', 'separator', '石炭の乾留', '5 coal -> 4 C + 1 tar', ['乾留'], '化学：有機化合物／金属の製錬',
    '空気を断って固体を強熱し、分解して成分を取り出すのが乾留。石炭を乾留するとコークス（ほぼ炭素）、コールタール、石炭ガスが得られる。コークスは製鉄の還元剤になる。', { loose: true, time: 2 }),
  R('crude-distillation', 'separator', '原油の分留', '4 crude -> 3 naphtha + 1 heavy', ['分留'], '化学：有機化合物（石油）',
    '原油は炭化水素の混合物。沸点の差で分留し、石油ガス、ナフサ（粗製ガソリン）、灯油、軽油、重油に分ける。ナフサが石油化学の出発原料になる。', { loose: true, time: 2 }),
  R('bayer', 'separator', 'ボーキサイトの精製（バイヤー法）', '5 bauxite -> 4 Al2O3 + 1 redmud', ['濃NaOH水溶液に溶かす'], '化学：金属元素（アルミニウム）',
    'Al₂O₃ は両性酸化物なので濃 NaOH 水溶液に溶けて Na[Al(OH)₄] になるが、不純物の Fe₂O₃ は溶けずに赤泥として残る。ろ液から Al(OH)₃ を沈殿させ、加熱して純粋な Al₂O₃（アルミナ）にする。', { loose: true, time: 2.4 }),

  // ================= 電気分解 =================
  R('water-electrolysis', 'electrolyzer', '水の電気分解', '2H2O -> 2H2 + O2', ['水 + NaOH', '水 + H₂SO₄'], '化学：電気分解',
    '2H₂O → 2H₂ + O₂。純水は電気をほとんど通さないので NaOH か希硫酸を加える。陰極で還元が起きて H₂、陽極で酸化が起きて O₂ が発生する。電子 4 mol で H₂ 2 mol、O₂ 1 mol。'),
  R('brine-electrolysis', 'electrolyzer', '食塩水の電気分解（イオン交換膜法）', '2NaCl + 2H2O -> H2 + Cl2 + 2NaOH', ['飽和食塩水（陽イオン交換膜）'], '化学：電気分解／アルカリ金属',
    '2NaCl + 2H₂O → H₂ + Cl₂ + 2NaOH。陰極では Na⁺ ではなく水が還元されて H₂ と OH⁻ が生じ、陽極では Cl⁻ が酸化されて Cl₂ になる。陽イオン交換膜は Na⁺ だけを通すので、陰極側に純度の高い NaOH がたまる。'),
  R('molten-nacl', 'electrolyzer', '塩化ナトリウムの溶融塩電解', '2NaCl -> 2Na + Cl2', ['融解塩（水なし）'], '化学：アルカリ金属',
    '2NaCl → 2Na + Cl₂。水溶液では水が先に還元されて Na は得られない。イオン化傾向の大きい金属は、水のない融解塩を電気分解して取り出す。'),
  R('hall-heroult', 'electrolyzer', 'アルミナの溶融塩電解', '2Al2O3 + 3C -> 4Al + 3CO2', ['融解した氷晶石'], '化学：金属元素（アルミニウム）',
    '融点の高い Al₂O₃（約 2000 ℃）を、融解した氷晶石 Na₃AlF₆ に溶かして約 1000 ℃ で電気分解する。陰極に Al が析出し、陽極の炭素は O²⁻ と反応して CO や CO₂ になって消耗する。大量の電力が要る。'),
  R('copper-refining', 'electrolyzer', '銅の電解精錬', '10 crudeCu -> 9 Cu + 1 slime', ['CuSO₄ 水溶液（硫酸酸性）'], '化学：金属元素（銅）／電気分解',
    '粗銅を陽極、純銅を陰極にして硫酸酸性の CuSO₄ 水溶液を電気分解する。陽極で Cu → Cu²⁺ + 2e⁻、陰極で Cu²⁺ + 2e⁻ → Cu。銅よりイオン化傾向の大きい Fe・Zn・Ni は溶けたまま残り、小さい Ag・Au は陽極泥として沈む。', { loose: true, time: 2 }),
  R('lead-charge', 'electrolyzer', '鉛蓄電池の充電', '2PbSO4 + 2H2O -> Pb + PbO2 + 2H2SO4', ['水 + H₂SO₄'], '化学：電池',
    '放電の逆反応。外部電源の負極をつないだ側（陰極）で PbSO₄ が還元されて Pb に、正極をつないだ側（陽極）で PbSO₄ が酸化されて PbO₂ に戻る。硫酸の濃度も元に戻る。'),

  // ================= 無機の反応 =================
  R('haber-bosch', 'reactor', 'ハーバー・ボッシュ法', 'N2 + 3H2 -> 2NH3', ['Fe₃O₄'], '化学：化学平衡／非金属元素',
    'N₂ + 3H₂ ⇄ 2NH₃。四酸化三鉄 Fe₃O₄ を主成分とする触媒を使う。発熱反応で気体分子数が減るので、平衡上は低温・高圧が有利。ただし低温では遅いので、実際は 400〜600 ℃、高圧で行う。', { time: 2 }),
  R('ostwald-1', 'reactor', 'オストワルト法 ①アンモニアの酸化', '4NH3 + 5O2 -> 4NO + 6H2O', ['Pt'], '化学：非金属元素（硝酸）',
    '4NH₃ + 5O₂ → 4NO + 6H₂O。白金 Pt を触媒にして約 800 ℃ で酸化する。N の酸化数は −3 から +2 になる。', { time: 2 }),
  R('ostwald-2', 'reactor', 'オストワルト法 ②一酸化窒素の酸化', '2NO + O2 -> 2NO2', ['なし'], '化学：非金属元素（硝酸）',
    '2NO + O₂ → 2NO₂。無色の NO は空気に触れるだけで酸化され、赤褐色の NO₂ になる。触媒は要らない。'),
  R('ostwald-3', 'reactor', 'オストワルト法 ③水への吸収', '3NO2 + H2O -> 2HNO3 + NO', ['なし'], '化学：非金属元素（硝酸）',
    '3NO₂ + H₂O → 2HNO₃ + NO。NO₂ の N（+4）が HNO₃（+5）と NO（+2）に分かれる自己酸化還元反応。出てきた NO は②へ戻して再利用する。①〜③をまとめると NH₃ + 2O₂ → HNO₃ + H₂O。'),
  R('sulfur-burn', 'reactor', '接触法 ①硫黄の燃焼', 'S + O2 -> SO2', ANY, '化学：非金属元素（硫酸）',
    'S + O₂ → SO₂。硫黄を燃やして二酸化硫黄にする。'),
  R('contact', 'reactor', '接触法 ②二酸化硫黄の酸化', '2SO2 + O2 -> 2SO3', ['V₂O₅'], '化学：非金属元素（硫酸）',
    '2SO₂ + O₂ → 2SO₃。酸化バナジウム(V) V₂O₅ を触媒にする。この触媒に接触させることが「接触法」の名の由来。', { time: 2 }),
  R('so3-absorb', 'reactor', '接触法 ③三酸化硫黄の吸収', 'SO3 + H2O -> H2SO4', ['なし'], '化学：非金属元素（硫酸）',
    'SO₃ + H₂O → H₂SO₄。実際には SO₃ を直接水に吸収させると発熱で霧になるので、濃硫酸に吸収させて発煙硫酸とし、それを希硫酸で薄めて濃硫酸にする。'),
  R('hcl-synthesis', 'reactor', '塩化水素の合成', 'H2 + Cl2 -> 2HCl', ['光', '加熱'], '化学：非金属元素（ハロゲン）',
    'H₂ + Cl₂ → 2HCl。光を当てるか点火すると爆発的に反応する。HCl を水に溶かしたものが塩酸。'),
  R('lime-kiln', 'reactor', '石灰石の熱分解', 'CaCO3 -> CaO + CO2', HEAT, '化学：アルカリ土類金属',
    'CaCO₃ → CaO + CO₂。石灰石を強熱すると生石灰と二酸化炭素に分かれる。アンモニアソーダ法の CO₂ 源。'),
  R('solvay', 'reactor', 'アンモニアソーダ法 ①炭酸水素ナトリウムの沈殿', 'NaCl + NH3 + CO2 + H2O -> NaHCO3 + NH4Cl', ['なし'], '化学：アルカリ金属',
    'NaCl + NH₃ + CO₂ + H₂O → NaHCO₃ + NH₄Cl。飽和食塩水にアンモニアを十分に溶かしてから CO₂ を吹き込むと、溶解度の小さい NaHCO₃ が沈殿する。'),
  R('soda-ash', 'reactor', 'アンモニアソーダ法 ②熱分解', '2NaHCO3 -> Na2CO3 + H2O + CO2', HEAT, '化学：アルカリ金属',
    '2NaHCO₃ → Na₂CO₃ + H₂O + CO₂。沈殿をろ過して加熱する。出てきた CO₂ は①へ戻す。'),
  R('slaking', 'reactor', '生石灰の消和', 'CaO + H2O -> Ca(OH)2', ['なし'], '化学：アルカリ土類金属',
    'CaO + H₂O → Ca(OH)₂。多量の熱を出して消石灰になる。乾燥剤にも使う。'),
  R('ammonia-recovery', 'reactor', 'アンモニアソーダ法 ③アンモニアの回収', '2NH4Cl + Ca(OH)2 -> CaCl2 + 2NH3 + 2H2O', HEAT, '化学：アルカリ金属／アンモニアの製法',
    '2NH₄Cl + Ca(OH)₂ → CaCl₂ + 2NH₃ + 2H₂O。副生成物の NH₄Cl からアンモニアを回収して①へ戻す。実験室でのアンモニアの製法と同じ反応。全体では 2NaCl + CaCO₃ → Na₂CO₃ + CaCl₂。'),
  R('coke-burn', 'reactor', 'コークスの不完全燃焼', '2C + O2 -> 2CO', HEAT, '化学：金属の製錬（鉄）',
    '2C + O₂ → 2CO。高炉の中でコークスから一酸化炭素ができる。これが鉄鉱石の還元剤になる。'),
  R('blast-furnace', 'reactor', '高炉での鉄の還元', 'Fe2O3 + 3CO -> 2Fe + 3CO2', HEAT, '化学：金属の製錬（鉄）',
    'Fe₂O₃ + 3CO → 2Fe + 3CO₂。得られるのは炭素を約 4 % 含む銑鉄で、硬くてもろい。転炉で酸素を吹き込んで炭素を減らすと、ねばり強い鋼になる。石灰石は不純物をスラグとして除く。', { time: 2 }),
  R('copper-matte', 'reactor', '黄銅鉱の溶錬', '4CuFeS2 + 9O2 -> 2Cu2S + 2Fe2O3 + 6SO2', HEAT, '化学：金属の製錬（銅）',
    '黄銅鉱を空気とともに強熱すると、硫化銅(I) Cu₂S と鉄の酸化物、SO₂ に分かれる。', { time: 2.4 }),
  R('copper-converter', 'reactor', '転炉での粗銅の製造', '1 Cu2S + 1 O2 -> 2 crudeCu + 1 SO2', HEAT, '化学：金属の製錬（銅）',
    'Cu₂S + O₂ → 2Cu + SO₂。得られるのは純度約 99 % の粗銅で、不純物として Fe・Zn・Ag・Au などを含む。電解精錬で純銅にする。', { loose: true, time: 2 }),
  R('zinc-roast', 'reactor', '閃亜鉛鉱の焙焼', '2ZnS + 3O2 -> 2ZnO + 2SO2', HEAT, '化学：金属の製錬',
    '2ZnS + 3O₂ → 2ZnO + 2SO₂。硫化物の鉱石は、まず空気中で焼いて酸化物にする（焙焼）。'),
  R('zinc-reduce', 'reactor', '酸化亜鉛の還元', 'ZnO + C -> Zn + CO', HEAT, '化学：金属の製錬',
    'ZnO + C → Zn + CO。イオン化傾向が中程度の金属は、酸化物を炭素で還元して取り出せる。Al より大きい金属は溶融塩電解が必要。'),
  R('lead-roast', 'reactor', '方鉛鉱の焙焼', '2PbS + 3O2 -> 2PbO + 2SO2', HEAT, '化学：金属の製錬',
    '2PbS + 3O₂ → 2PbO + 2SO₂。'),
  R('lead-sulfate', 'reactor', '酸化鉛(II)と硫酸', 'PbO + H2SO4 -> PbSO4 + H2O', ANY, '化学：金属元素／電池',
    'PbO + H₂SO₄ → PbSO₄ + H₂O。PbSO₄ は水に溶けにくい白色の固体。鉛蓄電池の放電でも両極に付着する。'),
  R('copper-oxide', 'reactor', '銅の酸化', '2Cu + O2 -> 2CuO', HEAT, '化学：金属元素（銅）',
    '2Cu + O₂ → 2CuO。銅を空気中で加熱すると黒色の酸化銅(II)になる。1000 ℃ 以上では赤色の Cu₂O になる。'),
  R('copper-sulfate', 'reactor', '酸化銅(II)と硫酸', 'CuO + H2SO4 -> CuSO4 + H2O', ANY, '化学：金属元素（銅）',
    'CuO + H₂SO₄ → CuSO₄ + H₂O。塩基性酸化物と酸の反応。水溶液は Cu²⁺ の青色。'),

  // ================= 電池 =================
  R('fuel-cell', 'battery', '燃料電池', '2H2 + O2 -> 4e + 2H2O', ['リン酸水溶液', 'KOH 水溶液'], '化学：電池',
    '全体では 2H₂ + O₂ → 2H₂O。負極で H₂ が酸化され（H₂ → 2H⁺ + 2e⁻）、正極で O₂ が還元される（O₂ + 4H⁺ + 4e⁻ → 2H₂O）。H₂ 2 mol あたり電子 4 mol が流れる。生成物が水だけなのが特徴。', { neg: 'H2', pos: 'O2' }),
  R('daniell', 'battery', 'ダニエル電池', 'Zn + CuSO4 -> 2e + ZnSO4 + Cu', ['ZnSO₄ 水溶液｜CuSO₄ 水溶液（素焼き板）'], '化学：電池',
    '負極：Zn → Zn²⁺ + 2e⁻、正極：Cu²⁺ + 2e⁻ → Cu。イオン化傾向の大きい Zn が負極になる。素焼き板は両液が混ざるのを防ぎつつイオンを通す。起電力は約 1.1 V。', { neg: 'Zn', pos: 'CuSO4' }),
  R('lead-acid', 'battery', '鉛蓄電池の放電', 'Pb + PbO2 + 2H2SO4 -> 2e + 2PbSO4 + 2H2O', ['希硫酸'], '化学：電池',
    '負極：Pb + SO₄²⁻ → PbSO₄ + 2e⁻、正極：PbO₂ + 4H⁺ + SO₄²⁻ + 2e⁻ → PbSO₄ + 2H₂O。電子 2 mol が流れると、負極は 96 g、正極は 64 g 重くなり、硫酸 2 mol が消費されて水 2 mol ができる。充電できる二次電池。', { neg: 'Pb', pos: 'PbO2' }),

  // ================= 有機（脂肪族） =================
  R('cracking', 'reactor', 'ナフサの熱分解', '3 naphtha -> 1 C2H4 + 1 C3H6 + 1 C6H6', HEAT, '化学：有機化合物（石油化学）',
    'ナフサを 800 ℃ 前後で熱分解（クラッキング）すると、エチレン、プロペンなどの小さなアルケンが得られる。ベンゼンなどの芳香族は接触改質で得る。ここでは一つにまとめている。', { loose: true, time: 2 }),
  R('ethylene-hydration', 'reactor', 'エチレンへの水の付加', 'C2H4 + H2O -> C2H5OH', ['リン酸'], '化学：有機化合物（アルケン・アルコール）',
    'CH₂=CH₂ + H₂O → C₂H₅OH。リン酸を触媒にして水を付加させる。エタノールの工業的製法。'),
  R('wacker', 'reactor', 'エチレンの酸化（アセトアルデヒドの製法）', '2C2H4 + O2 -> 2CH3CHO', ['PdCl₂とCuCl₂'], '化学：有機化合物（アルデヒド）',
    '2CH₂=CH₂ + O₂ → 2CH₃CHO。塩化パラジウム(II)と塩化銅(II)を触媒にする。アセトアルデヒドの工業的製法。'),
  R('acetic-acid', 'reactor', 'アセトアルデヒドの酸化', '2CH3CHO + O2 -> 2CH3COOH', ANY, '化学：有機化合物（カルボン酸）',
    '2CH₃CHO + O₂ → 2CH₃COOH。アルデヒドは酸化されやすく（還元性をもつ）、カルボン酸になる。第一級アルコール → アルデヒド → カルボン酸の順。'),
  R('esterification', 'reactor', 'エステル化（酢酸エチル）', 'CH3COOH + C2H5OH -> CH3COOC2H5 + H2O', ['濃硫酸（触媒）'], '化学：有機化合物（エステル）',
    'CH₃COOH + C₂H₅OH ⇄ CH₃COOC₂H₅ + H₂O。濃硫酸は触媒として働き、さらに生じた水を取り除いて平衡を右へ動かす。カルボン酸の OH とアルコールの H から水がとれる。'),
  R('ether', 'reactor', 'エタノールの分子間脱水', '2C2H5OH -> C2H5OC2H5 + H2O', ['濃硫酸 130〜140 ℃'], '化学：有機化合物（アルコール）',
    '2C₂H₅OH → C₂H₅OC₂H₅ + H₂O。濃硫酸と約 130〜140 ℃ では 2 分子から水がとれてジエチルエーテルになる（縮合）。温度で生成物が変わる。'),
  R('ethanol-dehydration', 'reactor', 'エタノールの分子内脱水', 'C2H5OH -> C2H4 + H2O', ['濃硫酸 160〜170 ℃'], '化学：有機化合物（アルコール）',
    'C₂H₅OH → CH₂=CH₂ + H₂O。濃硫酸と約 160〜170 ℃ では 1 分子の中で水がとれてエチレンになる（脱離）。'),
  R('carbide', 'reactor', '炭化カルシウムの製造', 'CaO + 3C -> CaC2 + CO', HEAT, '化学：有機化合物（アルキン）',
    'CaO + 3C → CaC₂ + CO。生石灰とコークスを電気炉で強熱する。'),
  R('acetylene', 'reactor', 'アセチレンの製法', 'CaC2 + 2H2O -> C2H2 + Ca(OH)2', ['なし'], '化学：有機化合物（アルキン）',
    'CaC₂ + 2H₂O → CH≡CH + Ca(OH)₂。炭化カルシウム（カーバイド）に水を加えるだけで発生する。'),
  R('steam-reforming', 'reactor', 'メタンの水蒸気改質', 'CH4 + H2O -> CO + 3H2', ['Ni'], '化学：非金属元素（水素）／有機化合物',
    'CH₄ + H₂O → CO + 3H₂。ニッケル触媒を用いて高温で反応させる。水素の工業的製法で、得られる CO と H₂ の混合気体を合成ガスという。', { time: 2 }),
  R('methanol', 'reactor', 'メタノールの合成', 'CO + 2H2 -> CH3OH', ['ZnO'], '化学：有機化合物（アルコール）',
    'CO + 2H₂ → CH₃OH。酸化亜鉛 ZnO を主成分とする触媒を用い、高温・高圧で合成する。'),
  R('formaldehyde', 'reactor', 'メタノールの酸化', '2CH3OH + O2 -> 2HCHO + 2H2O', ['Cu（加熱）'], '化学：有機化合物（アルデヒド）',
    '2CH₃OH + O₂ → 2HCHO + 2H₂O。加熱した銅線をメタノールの蒸気に触れさせると、刺激臭のホルムアルデヒドができる。約 37 % 水溶液がホルマリン。'),
  R('vinyl-chloride', 'reactor', 'アセチレンへの塩化水素の付加', 'C2H2 + HCl -> CH2CHCl', ['HgCl₂'], '化学：有機化合物（アルキン）',
    'CH≡CH + HCl → CH₂=CHCl。塩化水銀(II)を触媒にして付加させると塩化ビニルになる。現在の工業ではエチレンから作る。'),
  R('acetic-anhydride', 'reactor', '酢酸の脱水', '2CH3COOH -> (CH3CO)2O + H2O', ['脱水剤 P₄O₁₀'], '化学：有機化合物（カルボン酸）',
    '2CH₃COOH → (CH₃CO)₂O + H₂O。十酸化四リンなどの脱水剤と加熱すると、2 分子から水がとれて無水酢酸になる。'),
  R('saponification', 'reactor', '油脂のけん化', '1 fat + 3 NaOH -> 3 soap + 1 C3H5(OH)3', ['けん化'], '化学：有機化合物（油脂）',
    '油脂（高級脂肪酸とグリセリンのエステル）1 mol に NaOH 3 mol を加えて加熱すると、セッケン（脂肪酸ナトリウム）3 mol とグリセリン 1 mol になる。エステルを塩基で加水分解する反応をけん化という。', { loose: true, time: 2 }),

  // ================= 有機（芳香族） =================
  R('nitration', 'reactor', 'ベンゼンのニトロ化', 'C6H6 + HNO3 -> C6H5NO2 + H2O', ['濃硫酸（触媒）'], '化学：有機化合物（芳香族）',
    'C₆H₆ + HNO₃ → C₆H₅NO₂ + H₂O。濃硝酸と濃硫酸の混合物（混酸）を約 60 ℃ で作用させる置換反応。ニトロベンゼンは淡黄色の油状の液体で、水より重い。'),
  R('aniline', 'reactor', 'ニトロベンゼンの還元', 'C6H5NO2 + 3H2 -> C6H5NH2 + 2H2O', ['Ni', 'Pt'], '化学：有機化合物（芳香族アミン）',
    'C₆H₅NO₂ + 3H₂ → C₆H₅NH₂ + 2H₂O。工業的には触媒を用いて水素で還元する。実験室ではスズ（または鉄）と濃塩酸で還元してアニリン塩酸塩とし、NaOH を加えてアニリンを遊離させる。', { time: 2 }),
  R('chlorination', 'reactor', 'ベンゼンの塩素化', 'C6H6 + Cl2 -> C6H5Cl + HCl', ['鉄粉'], '化学：有機化合物（芳香族）',
    'C₆H₆ + Cl₂ → C₆H₅Cl + HCl。鉄粉（または FeCl₃）を触媒にした置換反応。光を当てると付加が起きて C₆H₆Cl₆ になる、という対比が問われる。'),
  R('cumene', 'reactor', 'クメン法 ①クメンの合成', 'C6H6 + C3H6 -> C6H5CH(CH3)2', ['リン酸'], '化学：有機化合物（フェノール）',
    'ベンゼンにプロペンを酸触媒で付加させてクメン（イソプロピルベンゼン）にする。'),
  R('cumene-phenol', 'reactor', 'クメン法 ②酸化と分解', 'C6H5CH(CH3)2 + O2 -> C6H5OH + CH3COCH3', ['希硫酸'], '化学：有機化合物（フェノール）',
    'クメンを酸素で酸化してクメンヒドロペルオキシドにし、希硫酸で分解するとフェノールとアセトンが得られる。フェノールの工業的製法。'),
  R('phenoxide', 'reactor', 'フェノールの中和', 'C6H5OH + NaOH -> C6H5ONa + H2O', ['なし'], '化学：有機化合物（フェノール）',
    'C₆H₅OH + NaOH → C₆H₅ONa + H₂O。フェノールは弱い酸で、NaOH と塩をつくって水に溶ける。酸の強さは カルボン酸 ＞ 炭酸 ＞ フェノール。'),
  R('kolbe', 'reactor', 'サリチル酸ナトリウムの合成', 'C6H5ONa + CO2 -> C6H4(OH)COONa', ['高温・高圧'], '化学：有機化合物（芳香族カルボン酸）',
    'ナトリウムフェノキシドに高温・高圧で CO₂ を作用させると、サリチル酸ナトリウムになる。'),
  R('salicylic-acid', 'reactor', 'サリチル酸の遊離', '2C6H4(OH)COONa + H2SO4 -> 2C6H4(OH)COOH + Na2SO4', ['なし'], '化学：有機化合物（芳香族カルボン酸）',
    '弱酸の塩に強酸を加えると弱酸が遊離する。サリチル酸はカルボキシ基とフェノール性ヒドロキシ基の両方をもつ。'),
  R('methyl-salicylate', 'reactor', 'サリチル酸メチルの合成', 'C6H4(OH)COOH + CH3OH -> C6H4(OH)COOCH3 + H2O', ['濃硫酸（触媒）'], '化学：有機化合物（医薬品）',
    'カルボキシ基がメタノールとエステル化する。サリチル酸メチルは消炎鎮痛剤（湿布薬）。フェノール性 OH が残るので FeCl₃ 水溶液で呈色する。'),
  R('aspirin', 'reactor', 'アセチルサリチル酸の合成', 'C6H4(OH)COOH + (CH3CO)2O -> C6H4(OCOCH3)COOH + CH3COOH', ['濃硫酸（触媒）'], '化学：有機化合物（医薬品）',
    'フェノール性ヒドロキシ基が無水酢酸でアセチル化される。アセチルサリチル酸は解熱鎮痛剤（アスピリン）。フェノール性 OH がなくなるので FeCl₃ 水溶液で呈色しない。'),
  R('ethylbenzene', 'reactor', 'エチルベンゼンの合成', 'C6H6 + C2H4 -> C6H5C2H5', ['リン酸'], '化学：高分子化合物',
    'ベンゼンにエチレンを酸触媒で付加させる。'),
  R('styrene', 'reactor', 'スチレンの合成', 'C6H5C2H5 -> C6H5CHCH2 + H2', ['Fe₃O₄', '加熱'], '化学：高分子化合物',
    'エチルベンゼンを触媒とともに加熱して脱水素すると、スチレン C₆H₅CH=CH₂ になる。'),

  // ================= 高分子 =================
  R('polyethylene', 'reactor', 'ポリエチレンの合成', '1 C2H4 -> 1 PE', ['付加重合'], '化学：高分子化合物',
    'n CH₂=CH₂ → [–CH₂–CH₂–]ₙ。二重結合が開いて次々につながる付加重合。重合度 n のポリエチレンの分子量は 28n。', { loose: true }),
  R('polypropylene', 'reactor', 'ポリプロピレンの合成', '1 C3H6 -> 1 PP', ['付加重合'], '化学：高分子化合物',
    'n CH₂=CH(CH₃) → [–CH₂–CH(CH₃)–]ₙ。付加重合。', { loose: true }),
  R('pvc', 'reactor', 'ポリ塩化ビニルの合成', '1 CH2CHCl -> 1 PVC', ['付加重合'], '化学：高分子化合物',
    'n CH₂=CHCl → [–CH₂–CHCl–]ₙ。付加重合。燃やすと HCl が出る。', { loose: true }),
  R('polystyrene', 'reactor', 'ポリスチレンの合成', '1 C6H5CHCH2 -> 1 PS', ['付加重合'], '化学：高分子化合物',
    'n CH₂=CH(C₆H₅) → [–CH₂–CH(C₆H₅)–]ₙ。付加重合。発泡させたものが発泡スチロール。', { loose: true }),
  R('phenol-resin', 'reactor', 'フェノール樹脂の合成', '1 C6H5OH + 1 HCHO -> 1 resin + 1 H2O', ['付加縮合'], '化学：高分子化合物',
    'フェノールとホルムアルデヒドが、付加と縮合を繰り返して立体網目構造をつくる（付加縮合）。熱硬化性樹脂。酸触媒ではノボラック、塩基触媒ではレゾールを経る。', { loose: true, time: 2 }),
  R('starch-hydrolysis', 'reactor', 'デンプンの加水分解', '2 starch + 1 H2O -> 1 C12H22O11', ['アミラーゼ'], '化学：高分子化合物（糖類）',
    '2(C₆H₁₀O₅)ₙ + nH₂O → nC₁₂H₂₂O₁₁。アミラーゼはデンプンを二糖のマルトースまで分解する。酵素は特定の基質にしか働かない（基質特異性）。', { loose: true, time: 2 }),
  R('maltose-hydrolysis', 'reactor', 'マルトースの加水分解', 'C12H22O11 + H2O -> 2C6H12O6', ['マルターゼ'], '化学：高分子化合物（糖類）',
    'C₁₂H₂₂O₁₁ + H₂O → 2C₆H₁₂O₆。マルターゼはマルトースをグルコース 2 分子に分解する。スクロースを分解するのはインベルターゼ（スクラーゼ）。'),
  R('fermentation', 'reactor', 'アルコール発酵', 'C6H12O6 -> 2C2H5OH + 2CO2', ['チマーゼ'], '化学：高分子化合物（糖類）',
    'C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂。酵母のもつ酵素群チマーゼの働きで、グルコースからエタノールと二酸化炭素ができる。', { time: 2.4 }),
];

export function recipeById(id: string | undefined): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** 電子を除いた生成物 */
export const productsOf = (r: Recipe) => r.outputs.filter(([s]) => s !== 'e');
export const electronsOf = (r: Recipe) => r.outputs.find(([s]) => s === 'e')?.[1] ?? 0;
