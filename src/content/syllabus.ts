import { DRILLS } from './drills';
import { ESSAYS } from './essays';
import { KNOWLEDGE, type Knowledge } from './knowledge';
import { PASSAGES, type Passage } from './passages';
import { QUESTIONS, type Question } from './questions';
import { RECIPES, type Recipe } from './recipes';
import { SETS, type SampleSet } from './samples';

/** 高等学校学習指導要領（平成 30 年告示）の「化学基礎」「化学」の内容項目と、このゲームの内容との対応。
 *  項目名は文部科学省の比較対照表（理科）による。points はその項目で入試に出る事柄を自分で書き出したもの */
export interface Unit {
  id: string;
  subject: '化学基礎' | '化学';
  section: string;
  title: string;
  points: string;
  /** 反応：単元名（source）に含まれる語、または反応の id */
  recipes?: string[];
  /** 仕分けの試料の組 */
  sets?: string[];
  /** 計算問題の分野 */
  questions?: string[];
  /** 知識問題の分野 */
  knowledge?: string[];
  /** リード文課題 */
  passages?: string[];
  /** 構造決定の演習の型（'iso-count-1' など）。連鎖計算は、演習の側がもつ項目の id で自動的に入る */
  practice?: string[];
}

const B1 = '(1) 化学と人間生活', B2 = '(2) 物質の構成', B3 = '(3) 物質の変化とその利用';
const C1 = '(1) 物質の状態と平衡', C2 = '(2) 物質の変化と平衡', C3 = '(3) 無機物質の性質', C4 = '(4) 有機化合物の性質', C5 = '(5) 化学が果たす役割';

export const SYLLABUS: Unit[] = [
  // ================= 化学基礎 =================
  { id: 'b11', subject: '化学基礎', section: B1, title: '化学の特徴', points: '金属・プラスチック・洗剤・医薬品など、身のまわりの物質と化学の関わり',
    recipes: ['医薬品', '油脂', '合成樹脂'], knowledge: ['合成高分子', '油脂', '物質量'] },
  { id: 'b12', subject: '化学基礎', section: B1, title: '物質の分離・精製', points: 'ろ過、蒸留、分留、再結晶、抽出、昇華法、クロマトグラフィー。純物質と混合物',
    recipes: ['物質の分離', 'coal-carbonization', 'crude-distillation', 'bayer'], sets: ['Y'], questions: ['溶解度'], knowledge: ['物質の分離'] },
  { id: 'b13', subject: '化学基礎', section: B1, title: '単体と化合物', points: '元素、単体、化合物、同素体。炎色反応や沈殿による成分元素の検出',
    sets: ['I', 'G'], knowledge: ['単体と化合物', '炎色反応'], recipes: ['ozone', 'phosphorus'] },
  { id: 'b14', subject: '化学基礎', section: B1, title: '熱運動と物質の三態', points: '粒子の熱運動、三態の変化、物理変化と化学変化',
    knowledge: ['状態変化'], passages: ['vapor'], sets: ['P'] },
  { id: 'b21', subject: '化学基礎', section: B2, title: '原子の構造', points: '陽子・中性子・電子、原子番号と質量数、同位体、放射性同位体と半減期',
    questions: ['原子の構造'], knowledge: ['原子の構造'], sets: ['R'] },
  { id: 'b22', subject: '化学基礎', section: B2, title: '電子配置と周期表', points: '電子殻、価電子、周期律、イオン化エネルギー、電子親和力、電気陰性度、典型元素と遷移元素',
    knowledge: ['電子配置と周期表'], sets: ['R', 'U'] },
  { id: 'b23', subject: '化学基礎', section: B2, title: 'イオンとイオン結合', points: 'イオンの生成、多原子イオン、組成式、イオン結晶の性質',
    sets: ['P', 'R', 'T'], knowledge: ['化学結合'], questions: ['結晶'] },
  { id: 'b24', subject: '化学基礎', section: B2, title: '分子と共有結合', points: '電子式と構造式、配位結合、分子の形と極性、分子間力と水素結合、分子結晶と共有結合の結晶',
    sets: ['Q', 'P'], questions: ['化学結合'], knowledge: ['化学結合'] },
  { id: 'b25', subject: '化学基礎', section: B2, title: '金属と金属結合', points: '自由電子、金属の性質、代表的な金属とその利用',
    sets: ['P', 'S'], knowledge: ['化学結合', '遷移元素'] },
  { id: 'b31', subject: '化学基礎', section: B3, title: '物質量', points: '原子量・分子量・式量、物質量、モル質量、気体のモル体積、モル濃度と質量パーセント濃度',
    questions: ['物質量', '濃度'], knowledge: ['物質量'] },
  { id: 'b32', subject: '化学基礎', section: B3, title: '化学反応式', points: '化学反応式の係数、反応の量的関係、過不足のある反応',
    questions: ['化学反応式と量', '工業と量'], recipes: ['haber-bosch', 'ostwald-1', 'ostwald-3', 'blast-furnace', 'copper-matte', 'lab-no'] },
  { id: 'b33', subject: '化学基礎', section: B3, title: '酸・塩基と中和', points: '酸・塩基の定義と強弱、電離度、pH、中和と塩、中和滴定と指示薬、塩の水溶液の性質',
    questions: ['中和', '中和滴定', 'pH'], knowledge: ['指示薬', '酸と塩基'], sets: ['T'], recipes: ['neutralize-acetate', 'slaking', 'phenoxide', 'scrub-hcl'] },
  { id: 'b34', subject: '化学基礎', section: B3, title: '酸化と還元', points: '酸化数、酸化剤と還元剤、金属のイオン化傾向、ダニエル電池、金属の製錬',
    questions: ['酸化還元'], sets: ['S'], recipes: ['酸化と還元', '金属の製錬', 'daniell', 'cl-br', 'thermite'], knowledge: ['酸化と還元', 'イオンの色'] },
  { id: 'b35', subject: '化学基礎', section: B3, title: '化学が拓く世界', points: '洗剤・食品保存・水の浄化・金属の利用など、化学基礎で学んだことの利用',
    recipes: ['肥料', 'saponification', 'bleaching-powder', 'ion-exchange'], knowledge: ['実用電池', '油脂'] },

  // ================= 化学 =================
  { id: 'c11', subject: '化学', section: C1, title: '状態変化', points: '融解熱・蒸発熱、状態図、蒸気圧と沸点、気液平衡',
    knowledge: ['状態変化'], passages: ['vapor'], questions: ['気体'] },
  { id: 'c12', subject: '化学', section: C1, title: '気体の性質', points: 'ボイル・シャルルの法則、状態方程式、分圧、気体の分子量測定、実在気体',
    questions: ['気体'], knowledge: ['気体'], passages: ['vapor'], recipes: ['cylinder', '気体の捕集'] },
  { id: 'c13', subject: '化学', section: C1, title: '固体の構造', points: '金属結晶の単位格子（体心立方・面心立方・六方最密）、イオン結晶、共有結合の結晶、分子結晶、アモルファス',
    questions: ['結晶'], knowledge: ['固体の構造'], passages: ['lattice'], sets: ['P'] },
  { id: 'c14', subject: '化学', section: C1, title: '溶解平衡', points: '固体と気体の溶解度、再結晶、ヘンリーの法則',
    questions: ['溶解度', '溶解度積'], recipes: ['precip-agcl'], sets: ['G', 'H'], knowledge: ['沈殿の性質'] },
  { id: 'c15', subject: '化学', section: C1, title: '溶液とその性質', points: '沸点上昇、凝固点降下、浸透圧、コロイド溶液（チンダル現象、凝析、塩析、透析、電気泳動）',
    questions: ['希薄溶液'], knowledge: ['コロイド'], sets: ['Z'] },
  { id: 'c21', subject: '化学', section: C2, title: '化学反応と熱・光', points: 'エンタルピー変化、ヘスの法則、生成エンタルピー、結合エネルギー、光が関わる反応',
    questions: ['熱化学'], knowledge: ['化学反応と熱', '化学反応と光'], recipes: ['hcl-synthesis', 'chloromethane', 'ozone'] },
  { id: 'c22', subject: '化学', section: C2, title: '電池', points: 'ダニエル電池、鉛蓄電池、燃料電池、実用電池（一次電池と二次電池）',
    recipes: ['：電池', '／電池', 'fuel-cell', 'daniell', 'lead-acid'], questions: ['電池'], knowledge: ['実用電池'], passages: ['lead'] },
  { id: 'c23', subject: '化学', section: C2, title: '電気分解', points: '水溶液と溶融塩の電気分解、各極の反応、ファラデーの法則、電解精錬',
    recipes: ['電気分解', 'hall-heroult', 'molten-nacl'], questions: ['電気分解'], knowledge: ['電気分解'] },
  { id: 'c24', subject: '化学', section: C2, title: '反応速度', points: '反応速度の表し方、濃度・温度・触媒の影響、反応速度式、活性化エネルギー',
    questions: ['反応速度'], knowledge: ['反応速度'], recipes: ['hi-decomp', 'lab-o2'] },
  { id: 'c25', subject: '化学', section: C2, title: '化学平衡とその移動', points: '可逆反応、平衡定数、ルシャトリエの原理、工業的製法の条件',
    questions: ['化学平衡'], knowledge: ['化学平衡'], passages: ['equil'], recipes: ['haber-bosch', 'contact', 'methanol', 'steam-reforming', 'lime-kiln'] },
  { id: 'c26', subject: '化学', section: C2, title: '電離平衡', points: '水のイオン積と pH、弱酸・弱塩基の電離定数、塩の加水分解、緩衝液、溶解度積',
    questions: ['電離平衡', '緩衝液', 'pH', '溶解度積'], knowledge: ['電離平衡', '指示薬'], recipes: ['buffer-47', 'buffer-57', 'precip-agcl'], sets: ['T'] },
  { id: 'c31', subject: '化学', section: C3, title: '典型元素', points: '水素、貴ガス、ハロゲン、酸素・硫黄、窒素・リン、炭素・ケイ素、アルカリ金属、2 族、アルミニウム、気体の製法と捕集',
    recipes: ['非金属元素', 'アルカリ金属', 'アルカリ土類金属', '両性金属', 'アルミニウム'], sets: ['U', 'I', 'H'], knowledge: ['典型元素', '気体の性質', '炎色反応'], passages: ['solvay'] },
  { id: 'c32', subject: '化学', section: C3, title: '遷移元素', points: '鉄・銅・亜鉛・銀とその化合物、錯イオン、合金とめっき、金属イオンの沈殿と系統分離',
    recipes: ['（鉄）', '（銅）', '（銀）', 'zinc-roast', 'zinc-reduce', 'zn-naoh'], sets: ['G', 'H', 'S'], knowledge: ['遷移元素', '錯イオン', 'イオンの色', '沈殿の色', '沈殿の性質'] },
  { id: 'c41', subject: '化学', section: C4, title: '炭化水素', points: 'アルカンの置換、アルケン・アルキンの付加、構造異性体とシス-トランス異性体、石油',
    recipes: ['アルカン', 'アルケン', 'アルキン', '石油'], sets: ['J'], knowledge: ['炭化水素'], practice: ['iso-count-1'] },
  { id: 'c42', subject: '化学', section: C4, title: '官能基をもつ化合物', points: 'アルコール、エーテル、アルデヒド、ケトン、カルボン酸、エステル、油脂とセッケン、鏡像異性体、元素分析',
    recipes: ['アルコール', 'アルデヒド', 'カルボン酸', 'エステル', '油脂'], sets: ['A', 'B', 'D', 'K', 'L'], knowledge: ['官能基をもつ化合物', '油脂', '有機の検出'], questions: ['元素分析', '有機と量', '油脂'], passages: ['c4h10o', 'ester'], practice: ['iso-count-2', 'iso-id-1', 'iso-id-2'] },
  { id: 'c43', subject: '化学', section: C4, title: '芳香族化合物', points: 'ベンゼンの置換反応、フェノール類、芳香族カルボン酸、アニリンとアゾ化合物、医薬品、抽出による分離',
    recipes: ['芳香族', 'フェノール', 'アゾ化合物', '医薬品', 'ethylbenzene', 'styrene'], sets: ['C', 'Y'], knowledge: ['芳香族化合物'], practice: ['iso-count-3', 'iso-id-3'] },
  { id: 'c44', subject: '化学', section: C4, title: '合成高分子化合物', points: '付加重合と縮合重合、合成繊維、合成樹脂（熱可塑性・熱硬化性）、ゴム、イオン交換樹脂、機能性高分子',
    recipes: ['合成繊維', '合成樹脂', 'ゴム', '機能性高分子', '再生繊維', '半合成繊維', 'polyethylene', 'polypropylene', 'pvc', 'polystyrene', 'styrene', 'phenol-resin'], sets: ['W'], knowledge: ['合成高分子', 'ゴム', 'イオン交換'], questions: ['高分子', 'イオン交換'] },
  { id: 'c45', subject: '化学', section: C4, title: '天然高分子化合物', points: '単糖・二糖・多糖、アミノ酸とタンパク質、酵素、核酸',
    recipes: ['糖類', 'タンパク質', '核酸', 'セルロース'], sets: ['V', 'E', 'F', 'N'], knowledge: ['天然高分子', '核酸', '有機の検出'], questions: ['アミノ酸', '高分子'], passages: ['peptide'], practice: ['pep-1', 'pep-2', 'pep-3', 'sugar-1', 'sugar-2', 'sugar-3'] },
  { id: 'c51', subject: '化学', section: C5, title: '様々な物質と人間生活', points: '肥料、医薬品、染料、洗剤、金属やセラミックスなど、生活を支える物質',
    recipes: ['肥料', '医薬品', 'アゾ化合物', 'waterglass', 'silicon'], knowledge: ['油脂', '遷移元素'] },
  { id: 'c52', subject: '化学', section: C5, title: '化学が築く未来', points: '燃料電池、機能性高分子、資源の再利用など',
    recipes: ['fuel-cell', '機能性高分子', 'steam-reforming'], knowledge: ['合成高分子', '実用電池'] },
];

export interface Coverage { recipes: Recipe[]; sets: SampleSet[]; questions: Question[]; knowledge: Knowledge[]; passages: Passage[]; practice: string[]; total: number }

/** 項目に対応する内容を、実際のデータから拾う */
export function coverageOf(u: Unit): Coverage {
  const recipes = RECIPES.filter((r) => (u.recipes ?? []).some((k) => r.id === k || r.source.includes(k)));
  const sets = SETS.filter((s) => (u.sets ?? []).includes(s.id));
  const questions = QUESTIONS.filter((q) => (u.questions ?? []).includes(q.topic));
  const knowledge = KNOWLEDGE.filter((k) => (u.knowledge ?? []).includes(k.topic));
  const passages = PASSAGES.filter((p) => (u.passages ?? []).includes(p.id));
  const practice = [...DRILLS.filter((d) => d.unit === u.id).map((d) => d.id), ...ESSAYS.filter((x) => x.unit === u.id).map((x) => `essay-${x.id}`), ...(u.practice ?? [])];
  return { recipes, sets, questions, knowledge, passages, practice, total: recipes.length + sets.length + questions.length + knowledge.length + passages.length + practice.length };
}
