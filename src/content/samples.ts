import { sub } from './substances';

/** 分析器で行う検査。陽性なら正面、陰性なら右手へ流れる */
export interface Test {
  id: string;
  group: 'organic' | 'amino' | 'ion' | 'nucleic';
  /** 行う操作 */
  name: string;
  /** 陽性のときに見えること */
  sees: string;
  /** そこからわかること（解説） */
  means: string;
}

const T = (id: string, group: Test['group'], name: string, sees: string, means: string): Test => ({ id, group, name, sees, means });

export const TESTS: Test[] = [
  T('na', 'organic', '金属ナトリウムを加える', '水素が発生する', 'ヒドロキシ基 –OH をもつ（アルコール、フェノール、カルボン酸）。エーテルは反応しない。'),
  T('iodoform', 'organic', 'ヨウ素と NaOH 水溶液を加えて温める', '特有のにおいの黄色沈殿 CHI₃ が生じる', 'CH₃CH(OH)– または CH₃CO– の構造をもつ（ヨードホルム反応）。エタノール、2-プロパノール、アセトン、アセトアルデヒドなど。'),
  T('silver', 'organic', 'アンモニア性硝酸銀水溶液を加えて温める', '銀が析出する', 'ホルミル基（アルデヒド基）をもつ（銀鏡反応）。ギ酸とギ酸エステルも陽性。'),
  T('nahco3', 'organic', '炭酸水素ナトリウム水溶液を加える', '二酸化炭素が発生する', 'カルボキシ基をもつ。炭酸より強い酸だけが反応する。フェノールは反応しない。'),
  T('fecl3', 'organic', '塩化鉄(III)水溶液を加える', '青紫〜赤紫色に呈色する', 'フェノール性ヒドロキシ基をもつ。ベンジルアルコールのような、環に直接つかない –OH では呈色しない。'),
  T('br2', 'organic', '臭素水を加える', '赤褐色が消える', 'C=C または C≡C をもつ（付加反応）。'),
  T('oxid', 'organic', '硫酸酸性の二クロム酸カリウム水溶液と温める', '橙赤色が緑色に変わる', '酸化される。第一級・第二級アルコール、アルデヒド。第三級アルコールとエーテル、ケトンは酸化されにくい。'),
  T('oxald', 'organic', '穏やかに酸化し、生成物の銀鏡反応を調べる', '生成物が銀鏡反応を示す', '第一級アルコール（酸化するとアルデヒドになる）。第二級アルコールはケトンになるので陰性。'),
  T('chiral', 'organic', '偏光を通す', '偏光面が回転する', '不斉炭素原子をもち、鏡像異性体が存在する。グリシン以外の α-アミノ酸も陽性。'),
  T('ozone_hcho', 'organic', 'オゾン分解し、生成物を調べる（ホルムアルデヒドを探す）', 'ホルムアルデヒドが生じる', '二重結合の端が CH₂= になっている。オゾン分解では C=C が切れて、それぞれの炭素が C=O になる。'),
  T('ozone_ketone', 'organic', 'オゾン分解し、生成物を調べる（ケトンを探す）', '生成物にケトンが含まれる', '二重結合の炭素に炭化水素基が 2 つついている（>C=）。H が 1 つでもついていればアルデヒドになる。'),
  T('cistrans', 'organic', '立体異性体の有無を調べる', 'シス-トランス異性体が存在する', '二重結合の両方の炭素に、それぞれ異なる 2 つの原子・基がついている。1-ブテンや 2-メチルプロペンにはない。'),
  T('hyd_silver', 'organic', '加水分解し、得られたカルボン酸の銀鏡反応を調べる', '得られた酸が銀鏡反応を示す', 'ギ酸のエステル。ギ酸はホルミル基をもつので還元性を示す。'),
  T('hyd_iodoform', 'organic', '加水分解し、得られたアルコールのヨードホルム反応を調べる', '得られたアルコールがヨードホルム反応を示す', 'アルコール部分がエタノールか 2-プロパノールなど、CH₃CH(OH)– をもつもの。'),
  T('burn_eq', 'organic', '完全燃焼させ、生じた CO₂ と H₂O の物質量を比べる（等しいか）', 'CO₂ と H₂O の物質量が等しい', 'C : H = 1 : 2。CₙH₂ₙOₓ の形で、アルケン、アルデヒド、ケトン、カルボン酸、エステルなど。元素分析では、CO₂ から C、H₂O から H の質量を出し、残りを O とする。'),
  T('burn_c', 'organic', '完全燃焼させ、生じた CO₂ と H₂O の物質量を比べる（CO₂ が多いか）', 'CO₂ の物質量が H₂O より多い', 'H の数が C の 2 倍より少ない。不飽和度が高い。ベンゼン C₆H₆ なら CO₂ : H₂O = 6 : 3。'),
  T('burn_h', 'organic', '完全燃焼させ、生じた CO₂ と H₂O の物質量を比べる（H₂O が多いか）', 'H₂O の物質量が CO₂ より多い', 'H の数が C の 2 倍より多い。鎖式の飽和化合物（アルカン CₙH₂ₙ₊₂、飽和の一価アルコールなど）。'),
  T('purine', 'nucleic', '塩基の環の数を調べる', '環が 2 つつながっている', 'プリン塩基（アデニン、グアニン）。環が 1 つのものはピリミジン塩基（シトシン、チミン、ウラシル）。対は必ずプリンとピリミジンでできる。'),
  T('pair3', 'nucleic', '対をつくる相手との水素結合を数える', '水素結合 3 本で対をつくる', 'グアニンとシトシン。アデニンとチミン（ウラシル）は 2 本。'),
  T('dna_only', 'nucleic', 'DNA と RNA のどちらに含まれるか調べる（DNA だけか）', 'DNA にだけ含まれる', 'チミン。DNA は A・T・G・C。'),
  T('rna_only', 'nucleic', 'DNA と RNA のどちらに含まれるか調べる（RNA だけか）', 'RNA にだけ含まれる', 'ウラシル。RNA は A・U・G・C で、糖はリボース。'),
  T('xantho', 'amino', '濃硝酸を加えて加熱し、冷やしてアンモニア水を加える', '黄色になり、さらに橙黄色に変わる', 'ベンゼン環をもつ（キサントプロテイン反応）。フェニルアラニン、チロシンなど。'),
  T('sulfur', 'amino', 'NaOH 水溶液と加熱し、酢酸鉛(II)水溶液を加える', '黒色沈殿 PbS が生じる', '硫黄を含む。システイン、メチオニン。'),
  T('anode', 'amino', 'pH 6 の緩衝液にひたしたろ紙で電気泳動する（陽極側を見る）', '陽極側へ移動する', '酸性アミノ酸。側鎖にカルボキシ基をもち、pH 6 では全体として負に帯電する。'),
  T('cathode', 'amino', 'pH 6 の緩衝液にひたしたろ紙で電気泳動する（陰極側を見る）', '陰極側へ移動する', '塩基性アミノ酸。側鎖にアミノ基をもち、pH 6 では全体として正に帯電する。'),
  T('biuret', 'amino', 'NaOH 水溶液と少量の硫酸銅(II)水溶液を加える', '赤紫色になる', 'ペプチド結合を 2 つ以上もつ（ビウレット反応）。トリペプチド以上。'),
  T('hcl', 'ion', '希塩酸を加える', '白色沈殿が生じる', 'Ag⁺、Pb²⁺。塩化物 AgCl、PbCl₂ が水に溶けにくい。'),
  T('h2s_acid', 'ion', '酸性のまま硫化水素を通じる', '硫化物が沈殿する', 'Cu²⁺、Ag⁺、Pb²⁺、Hg²⁺、Cd²⁺。イオン化傾向が小さい金属の硫化物は酸性でも沈殿する（CuS・Ag₂S・PbS は黒、CdS は黄）。'),
  T('h2s_base', 'ion', '塩基性にして硫化水素を通じる', '硫化物が沈殿する', '酸性で沈殿するものに加えて Zn²⁺（ZnS 白）、Fe²⁺・Fe³⁺（FeS 黒）、Mn²⁺、Ni²⁺。Al³⁺ や Ca²⁺、Na⁺ は硫化物として沈殿しない。'),
  T('nh3_few', 'ion', 'アンモニア水を少量加える', '沈殿が生じる', 'アルカリ金属・アルカリ土類金属以外。水酸化物が沈殿する（Ag⁺ は褐色の Ag₂O）。'),
  T('nh3_ex', 'ion', 'アンモニア水を過剰に加える', '沈殿が残る', 'Fe³⁺、Al³⁺、Pb²⁺。Cu²⁺・Zn²⁺・Ag⁺ はアンモニアと錯イオン [Cu(NH₃)₄]²⁺（深青色）・[Zn(NH₃)₄]²⁺・[Ag(NH₃)₂]⁺ をつくって溶ける。'),
  T('naoh_ex', 'ion', '水酸化ナトリウム水溶液を過剰に加える', '沈殿が残る', 'Fe³⁺、Cu²⁺、Ag⁺ など。両性金属の Al³⁺・Zn²⁺・Pb²⁺ は [Al(OH)₄]⁻・[Zn(OH)₄]²⁻ などになって溶ける。'),
  T('h2so4', 'ion', '希硫酸を加える', '白色沈殿が生じる', 'Ba²⁺、Ca²⁺、Pb²⁺。硫酸塩 BaSO₄、CaSO₄、PbSO₄ が水に溶けにくい。'),
  T('co3', 'ion', '炭酸アンモニウム水溶液を加える', '沈殿が生じる', 'アルカリ金属以外。系統分離では最後に Ca²⁺、Ba²⁺ を CaCO₃、BaCO₃ として沈殿させる。'),
  T('fecn', 'ion', 'ヘキサシアニド鉄(II)酸カリウム水溶液を加える', '濃青色の沈殿が生じる', 'Fe³⁺。Fe²⁺ にはヘキサシアニド鉄(III)酸カリウムで濃青色沈殿。Fe³⁺ は KSCN 水溶液で血赤色溶液にもなる。'),
  T('flame_y', 'ion', '白金線につけて炎に入れる（黄色を探す）', '炎が黄色になる', 'Na⁺。'),
  T('flame_rp', 'ion', '白金線につけて炎に入れる（赤紫色を探す）', '炎が赤紫色になる', 'K⁺。'),
  T('flame_or', 'ion', '白金線につけて炎に入れる（橙赤色を探す）', '炎が橙赤色になる', 'Ca²⁺。'),
  T('flame_yg', 'ion', '白金線につけて炎に入れる（黄緑色を探す）', '炎が黄緑色になる', 'Ba²⁺。'),
  T('flame_bg', 'ion', '白金線につけて炎に入れる（青緑色を探す）', '炎が青緑色になる', 'Cu²⁺。'),
];
export const testById = (id: string | undefined) => TESTS.find((t) => t.id === id);
/** 検査の結果。試料でないものはすべて陰性 */
export const isPositive = (substance: string, test: string) => !!sub(substance).pos?.includes(test);

/** 試薬棚から出せる、見分けのつかない試料の組 */
export interface SampleSet { id: string; name: string; about: string; members: string[] }

export const SETS: SampleSet[] = [
  { id: 'A', name: '試料 A：分子式 C₄H₁₀O', about: 'アルコール 4 種とエーテル 1 種が混ざって出てくる。', members: ['x-1-butanol', 'x-2-butanol', 'x-isobutanol', 'x-tbutanol', 'x-ether'] },
  { id: 'B', name: '試料 B：分子式 C₃H₆O', about: 'アルデヒド、ケトン、不飽和アルコールの 3 種。', members: ['x-propanal', 'x-acetone', 'x-allyl'] },
  { id: 'C', name: '試料 C：分子式 C₇H₈O（芳香族）', about: 'ベンゼン環をもつ 3 種。', members: ['x-cresol', 'x-benzyl', 'x-anisole'] },
  { id: 'D', name: '試料 D：分子式 C₄H₈O₂', about: 'カルボン酸 1 種とエステル 3 種。', members: ['x-butyric', 'x-ethylacetate', 'x-methylpropionate', 'x-formate'] },
  { id: 'J', name: '試料 J：分子式 C₄H₈', about: 'アルケン 3 種とシクロアルカン 1 種。', members: ['x-1-butene', 'x-2-butene', 'x-isobutene', 'x-cyclobutane'] },
  { id: 'K', name: '試料 K：分子式 C₄H₈O₂ のエステル', about: 'エステル 4 種。加水分解して調べる。', members: ['x-formate', 'x-isopropylformate', 'x-ethylacetate', 'x-methylpropionate'] },
  { id: 'L', name: '試料 L：有機化合物（元素分析）', about: '分子式の違う 5 種。燃やして生じる CO₂ と H₂O の量から絞り込む。', members: ['x-benzene', 'x-hexane', 'x-ethanol', 'x-acetic', 'x-acetaldehyde'] },
  { id: 'N', name: '試料 N：核酸の塩基', about: 'DNA と RNA をつくる 5 種の塩基。', members: ['x-A', 'x-G', 'x-C', 'x-T', 'x-U'] },
  { id: 'E', name: '試料 E：α-アミノ酸', about: '6 種の α-アミノ酸。', members: ['x-gly', 'x-ala', 'x-phe', 'x-cys', 'x-glu', 'x-lys'] },
  { id: 'F', name: '試料 F：アミノ酸とペプチド', about: 'アミノ酸、ジペプチド、トリペプチド。', members: ['x-ala2', 'x-dipeptide', 'x-tripeptide'] },
  { id: 'G', name: '試料 G：金属イオン（Ag⁺・Cu²⁺・Fe³⁺・Na⁺）', about: '4 種の金属イオンの水溶液。', members: ['x-Ag', 'x-Cu', 'x-Fe', 'x-Na'] },
  { id: 'H', name: '試料 H：金属イオン（Al³⁺・Zn²⁺・Fe³⁺・Pb²⁺）', about: '両性金属を含む 4 種。', members: ['x-Al', 'x-Zn', 'x-Fe', 'x-Pb'] },
  { id: 'I', name: '試料 I：金属イオン（Ca²⁺・Ba²⁺・Na⁺・K⁺）', about: 'アルカリ金属とアルカリ土類金属。', members: ['x-Ca', 'x-Ba', 'x-Na', 'x-K'] },
];
export const setById = (id: string) => SETS.find((s) => s.id === id);
/** その試料が入っている組 */
export const setsOf = (substance: string) => SETS.filter((s) => s.members.includes(substance));

/** 試薬棚から出せる実験室の試薬。ここから出したものを納品しても指令には数えない */
export const REAGENTS = ['H2O2', 'MnO2', 'KClO3', 'NH4Cl', 'Ca(OH)2', 'CaCO3', 'NaCl', 'FeS', 'Zn', 'Cu', 'HCl', 'H2SO4', 'HNO3', 'NaOH',
  'NaNO2', 'CH3COOH', 'C6H5NH2', 'C6H5ONa', 'HOOC(CH2)4COOH', 'H2N(CH2)6NH2', 'CH2CHCHCH2', 'resinH', 'AgNO3', 'HI', 'H3PO4', 'C5H10O4', 'base'];
