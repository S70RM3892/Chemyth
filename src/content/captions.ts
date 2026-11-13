import { FLAME_TESTS, PLUMES, STORE_CAPTION, plumeOf } from './looks';
import { recipeById } from './recipes';
import { G } from './spectra';
import { hasSub, label } from './substances';
import { DH, PROCESS_T, dHSources, dHText, equationText } from './thermo';

/**
 * 地図の上に出す一言（反応の札の 2 行目など）と、そのほかの化学の説明文。SPEC2 §10.14 の文のとおり（日本語の文が正）。
 * 地図に出す新しい文は、すべてここから取る。どの文にも出典の鍵（SPEC2 §11.2、下の SOURCES）を付ける。
 * {El}・{word}・{Tcap}・{gas}・{equation}・{dH} は、caption() で埋める。
 * 文の決まり（tests/chem-captions.test.ts で確かめる）：
 * - 上方置換・下方置換は、まず水への溶けやすさを言う。気体の重い・軽いは「同じ温度で比べる」と言う
 * - 黄リンの光は化学発光（燐光とは言わない）。ナトリウム灯を炎の 589 nm と同じ光とは言わない
 * - バイルシュタイン試験は「F 以外」と言う。チンダル現象は粒子が光を散乱すると言い、コロイドが光るとは言わない
 * - 白い煙のうち NH₄Cl・P₄O₁₀ 以外（湯気・SO₃ の霧）には、白いのが水滴・霧だと言う文だけを出す
 * - 表示の上限で切った温度（テルミットの 2000 ℃）は、温度として書かない
 */
export interface Caption { text: string; src: string[]; p1?: boolean }
const C = (text: string, src: string[], p1?: boolean): Caption => (p1 ? { text, src, p1 } : { text, src });

export const CAPTIONS: Record<string, Caption> = {
  burner: C('青い炎：空気を調節したバーナー（赤っぽい炎は不完全燃焼）', ['CT']),
  // 鍵は flame:Na のように元素記号を付けて使う
  flame: C('炎色反応：{El} は{word}', ['C1']),
  'burn:S': C('硫黄は青い炎を出して燃え、SO₂ になる', ['C30']),
  'burn:CO': C('CO は青い炎を出して燃え、CO₂ になる', ['C31']),
  'burn:P4': C('黄リンは明るい炎を出して燃え、白煙（P₄O₁₀）を出す', ['C32']),
  'noBurn:Cu': C('銅は炎を出さずに酸化され、表面が黒い CuO になる', ['C3'], true),
  beilstein: C('青緑の炎：ハロゲン（F 以外）を含む（バイルシュタイン試験）', ['C1', 'BE']),
  mirror: C('銀鏡反応：還元されて生じた銀が、試験管の内側に付く', ['GS']),
  tyndall: C('チンダル現象：コロイド粒子が光を散乱し、光の通り道が輝いて見える（となりの真の溶液では見えない）', ['GS']),
  // 出典は D1 と、その反応の PROCESS_T の出典（processCaption が足す）
  incand: C('{Tcap}：熱で光っている（約 525 ℃から赤く見え始める）', ['D1']),
  noglow: C('{Tcap}：まだほとんど光らない', ['D1']),
  moltenNaCl: C('赤く光るのは高温のため（融解した NaCl そのものは無色）', ['D1', 'WNaCl']),
  indicatorPP: C('フェノールフタレインを加えてある（塩基性で赤）', ['C38']),
  indicatorMO: C('メチルオレンジを加えてある（酸性で赤、中和が進むと黄）', ['C38']),
  heavyGas: C('{gas}：空気（平均分子量 28.8）より重い。同じ温度で比べると低くたまる', ['AIR']),
  lightGas: C('{gas}：空気より軽い。同じ温度で比べると昇る', ['AIR']),
  neutralGas: C('{gas}：空気とほぼ同じ重さ', ['AIR']),
  hotGas: C('熱い気体は、まず昇る（重い・軽いは同じ温度で比べる）', ['general']),
  colourless: C('無色の気体（輪は目印）', ['AIR']),
  steam: C('白く見えるのは冷えてできた小さな水滴（湯気）。水蒸気そのものは無色', ['JYG']),
  so3Fume: C('白く見えるのは空気中の水分と反応してできた硫酸の霧（SO₃ 自体は無色）', ['C48']),
  nh4cl: C('NH₃ + HCl → NH₄Cl（白煙）', ['C18', 'C45']),
  no2: C('無色の NO は、空気中の O₂ と反応して赤褐色の NO₂ になる', ['C34']),
  collectWater: C('水上置換：水に溶けにくい気体', ['GR']),
  collectUp: C('上方置換：水に溶けやすく、空気より軽い気体', ['GR']),
  collectDown: C('下方置換：水に溶けやすく、空気より重い気体', ['GR']),
  electrolysis21: C('同じ温度・圧力で、体積比 H₂ : O₂ = 2 : 1', ['general']),
  ammine: C('過剰の NH₃：Cu²⁺ は深青色の [Cu(NH₃)₄]²⁺。Zn²⁺・Ag⁺ も錯イオンになって溶ける（無色）', ['C10', 'GI']),
  amphoteric: C('過剰の NaOH：Al・Zn・Pb の水酸化物は溶ける。Fe(OH)₃ は残る', ['C57', 'C59', 'GI']),
  h2sFe: C('H₂S で Fe³⁺ は Fe²⁺ に還元される（あとで HNO₃ で酸化して戻す）', ['C10', 'GI']),
  prussian: C('濃青色沈殿：Fe³⁺ と [Fe(CN)₆]⁴⁻', ['C7']),
  // 出典は OS（ΔfH の表。CaCO₃ は ET、NaHCO₃ は WNaHCO3。dHCaption が足す）
  dH: C('{equation}　ΔH = {dH} kJ', ['OS']),
  storeNa: C('ナトリウム：灯油の中に保存', ['JNa']),
  storeP4: C('黄リン：空気中で自然発火するので、水の中に保存', ['JP4']),
  storeHF: C('フッ化水素酸：ガラスを溶かすので、ポリエチレンの容器', ['JHF']),
  storeBrown: C('光で分解するので、褐色びんに保存', ['JHNO3', 'JAgNO3', 'C8']),
  storeNaOH: C('NaOH：ガラスを侵すので、すり合わせのガラス栓は使わない。潮解性があり CO₂ を吸うので密栓', ['JNaOH']),
  cuCat: C('銅は 赤（Cu）⇄ 黒（CuO）をくり返す：触媒はもとに戻る', ['MK'], true),
  ninhydrin: C('ニンヒドリン反応：アミノ酸をニンヒドリン水溶液と温めると紫色になる', ['JNH', 'GK'], true),
  // ゲームの中のお知らせ（C-notice）。光の枠組み（SPEC2 §2 D1）
  notice: C('影と光：紙のスキンは、部屋の窓から入る実際の京都の太陽（朝は左上から、夕方は右上から）。工場は北向きの天窓、研究所は天井の灯りで、光はいつも画面の上から。地図の方角（上が北）とは別。夜は机の灯り・ろうそく・天井灯。このゲームでは、物質の色はいつも白い光の下での色（教科書の色）で描く。時刻・光・画質の設定では変えない。', ['decisionD1']),
};

/** 文の鍵から、表の行を探す（flame:Na は flame の行） */
const rowOf = (key: string): Caption | undefined => CAPTIONS[key] ?? (key.startsWith('flame:') ? CAPTIONS.flame : undefined);
/** 鍵が表にあるか。flame:<El> は、炎色反応の表（FLAME_TESTS）にある元素だけ */
export const hasCaption = (key: string): boolean => (key.startsWith('flame:') ? !!FLAME_TESTS[key.slice(6)] : !!CAPTIONS[key]);
/** 文の出典の鍵 */
export const captionSrc = (key: string): string[] => rowOf(key)?.src ?? [];

/**
 * 文を作る。{名前} を vars で埋める。flame:<El> は、元素記号と炎色反応の色の言葉を自分で埋める。
 * 表にない鍵や、埋まらない {名前} が残るときは、間違った文を出さないように例外を投げる
 */
export function caption(key: string, vars: Record<string, string | number> = {}): string {
  const row = rowOf(key);
  if (!row || !hasCaption(key)) throw new Error(`説明文の鍵がない: ${key}`);
  const v: Record<string, string | number> = { ...vars };
  if (key.startsWith('flame:')) { const f = FLAME_TESTS[key.slice(6)]; v.El = f.sym; v.word = f.word; }
  const text = row.text.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));
  if (/\{\w+\}/.test(text)) throw new Error(`説明文の {…} が埋まっていない: ${key}`);
  return text;
}

/** 説明文と、その出典 */
export interface CaptionLine { key: string; text: string; src: string[] }
const line = (key: string, vars: Record<string, string | number> = {}, extraSrc: string[] = []): CaptionLine =>
  ({ key, text: caption(key, vars), src: [...new Set([...captionSrc(key), ...extraSrc])] });

/** 炎色反応の文：「炎色反応：Na は黄色」 */
export const flameCaption = (el: string): CaptionLine | null => (FLAME_TESTS[el] ? line(`flame:${el}`) : null);

/**
 * 運転温度の文（incand か noglow）。熱で光る温度なら incand、光らない温度なら noglow。
 * 温度は PROCESS_T の Tcap（表示の上限で切ったとき）、なければ「約 {T} ℃」。出典のある温度がない反応（鉛の焙焼）は null
 */
export function processCaption(recipeId: string): CaptionLine | null {
  const row = PROCESS_T[recipeId];
  if (!row || row.T === undefined) return null;
  const Tcap = row.Tcap ?? `約 ${row.T} ℃`;
  return line(G(row.T) > 0 ? 'incand' : 'noglow', { Tcap }, row.src);
}

/** 反応エンタルピーの文：「N₂(気) + 3H₂(気) → 2NH₃(気)　ΔH = −92 kJ」。数値のない反応は null */
export function dHCaption(recipeId: string): CaptionLine | null {
  const row = DH[recipeId];
  if (!row || row.r2) return null;
  return line('dH', { equation: equationText(row), dH: dHText(row) }, dHSources(row));
}

/**
 * 廃棄口・捕集の気体に出せる文の鍵を、出す順に。白い煙は、何が白いのかを言う文だけ
 * （湯気は steam、SO₃ は so3Fume。重い・軽いの文より先で、これらには重い・軽いの文を出さない）。
 * NH₄Cl と P₄O₁₀ は固体の白煙。NO は空気中で NO₂ になる文を先に。無色の気体には輪の文も添える
 */
export function plumeCaptionKeys(id: string): string[] {
  if (id === 'H2O') return ['steam'];
  if (id === 'SO3') return ['so3Fume'];
  if (id === 'NH4Cl') return ['nh4cl'];
  if (id === 'P4O10') return ['burn:P4'];
  if (!PLUMES[id] || !hasSub(id)) return [];
  const p = plumeOf(id), keys: string[] = [];
  if (id === 'NO') keys.push('no2');
  keys.push(p.cls === 'heavy' ? 'heavyGas' : p.cls === 'light' ? 'lightGas' : 'neutralGas');
  if (p.hex === null) keys.push('colourless');
  return keys;
}
/** 廃棄口・捕集の気体の文（plumeCaptionKeys の順）。{gas} は化学式 */
export const plumeCaptions = (id: string): CaptionLine[] => plumeCaptionKeys(id).map((k) => line(k, { gas: label(id) }));

/**
 * 捕集装置の文。CO₂ は出さない：教科書は「水に少し溶ける（水上置換でも集められる）」と書き、
 * 下方置換の文の「水に溶けやすく」が CO₂ には合わない（SPEC2 §12 の 4）
 */
export function collectCaption(recipeId: string): CaptionLine | null {
  const r = recipeById(recipeId);
  if (!r || r.machine !== 'collector' || recipeId === 'collect-CO2') return null;
  const how = r.accept[0] ?? '';
  return how.startsWith('水上置換') ? line('collectWater') : how.startsWith('上方置換') ? line('collectUp') : how.startsWith('下方置換') ? line('collectDown') : null;
}

/** 保存のしかたの文。保存のしかたが決まっていない物質は null */
export const storeCaption = (id: string): CaptionLine | null => (STORE_CAPTION[id] ? line(STORE_CAPTION[id]) : null);

/** ゲームの中のお知らせ（影と光、物質の色） */
export const NOTICE = CAPTIONS.notice.text;

/**
 * 出典の鍵（SPEC2 §11.2）。ja：ja.wikipedia の項目名、en：en.wikipedia の項目名。general は教科書に共通の事実、
 * AIR は空気の平均分子量 28.8（N₂ : O₂ = 4 : 1）と化学式から求めた分子量、decisionD1 は SPEC2 §2 D1（光の枠組み）。
 * GS・GR・GI・GK はゲームの文（samples.ts・recipes.ts・ions.ts・knowledge.ts）
 */
export const SOURCES: Record<string, string> = {
  C1: '岩手県立総合教育センター「綿棒を使った炎色反応」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto06.pdf',
  C2: '同「炭酸水素ナトリウムの成分元素」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto07.pdf', C3: '同「孔雀石から銅を取り出す」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto01.pdf',
  C4: '同「状態変化（ヨウ素の昇華）」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto08.pdf', C5: '同「酸・塩基・クロム酸銅(Ⅱ)の電気泳動」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto10.pdf',
  C7: '同「酸化剤と還元剤の反応と電子の流れ」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto19.pdf', C8: '同「酸化還元滴定」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto20.pdf', C9: '同「金属樹の生成」 https://www1.iwate-ed.jp/07tantou/kagaku/kagakukiso/kagakukiso%202/sapoto21.pdf',
  C10: '福岡教育大学 金属イオンの系統分離の教材研究 https://staff.fukuoka-edu.ac.jp/haradab/room/332317.pdf',
  CT: '富山県総合教育センター「ガスバーナーの使い方」 https://www.digirika.tym.ed.jp/wp-content/uploads/10gasuba-na-.pdf',
  C59: '愛媛県立松山北高校 金属イオンの分離・確認プリント https://matsuyamakita-h.esnet.ed.jp/file/2842',
  C15: 'ja: 二酸化窒素', C16: 'ja: オゾン', C17: 'ja: 硫化水素', C18: 'ja: アンモニア', C20: 'ja: 塩化銅(II)', C21: 'ja: 臭素', C22: 'ja: ヨウ素',
  C23: 'ja: 酸化バナジウム(V)', C25: 'ja: フェーリング反応', C28: 'ja: ヨードホルム反応', C29: 'ja: 塩化鉄(III)', C30: 'ja: 硫黄', C31: 'ja: 一酸化炭素',
  C32: 'ja: 黄リン', C33: 'ja: 塩化銀', C34: 'ja: 一酸化窒素', C37: 'ja: 閃亜鉛鉱', C38: 'ja: pH指示薬', C39: 'ja: 硫酸銅(II)', C40: 'ja: 過マンガン酸カリウム',
  C41: 'ja: 四酸化三鉄', C42: 'ja: 酸化銀(I)', C43: 'ja: クロム酸銀', C44: 'ja: 水酸化銅(II)', C45: 'ja: 塩化水素', C46: 'ja: 塩素', C47: 'ja: フッ素',
  C48: 'ja: 三酸化硫黄', C54: 'ja: 水酸化鉄(III)', C55: 'ja: 硫化銅(II)', C56: 'ja: 塩化鉛(II)', C57: 'ja: 水酸化アルミニウム', C58: 'ja: 硫化銀',
  JF: 'ja: 炎色反応', BE: 'ja: バイルシュタイン試験', JP4: 'ja: 黄リン（発火点、水中に保存、空気中のゆっくりした酸化で青白い光）', JNa: 'ja: ナトリウム',
  JHF: 'ja: フッ化水素酸', JHNO3: 'ja: 硝酸', JAgNO3: 'ja: 硝酸銀', JNaOH: 'ja: 水酸化ナトリウム', JOS: 'ja: オストワルト法（800 ℃）', JTH: 'ja: テルミット反応',
  JNH: 'ja: ニンヒドリン', JYG: 'ja: 湯気（水蒸気は気体で目に見えず、湯気は液体の小さな水滴）',
  WHB: 'en: Haber_process（500 °C）', WCP: 'en: Contact_process（約 450 °C）', WSC: 'en: Steam_cracking（約 850 °C）', WHH: 'en: Hall–Héroult_process（940–980 °C）',
  WLK: 'en: Lime_kiln（約 900 °C）', WZS: 'en: Zinc_smelting（約 980 °C）', WCE: 'en: Copper_extraction（約 1100 °C）', WBF: 'en: Blast_furnace',
  WTH: 'en: Thermite（約 2500 °C、断熱 3135 K）', WNaCl: 'en: Sodium_chloride（融点 800.7 °C）', SL: 'en: Sodium-vapor_lamp', FT: 'en: Flame_test',
  D1: 'en: Draper_point（525 °C）', WNaHCO3: 'en: Sodium_bicarbonate（ΔfH −950.8 kJ/mol、2026-11-13 に確認）',
  SU: 'steeluniversity, Blast Furnace Steelmaking（出銑時 1480–1520 °C） https://hub.steeluniversity.org/catalog/module/315',
  N1: 'NIST Handbook of Basic Atomic Spectroscopic Data https://physics.nist.gov/PhysRefData/Handbook/',
  N2: 'NIST Atomic Spectra Database https://physics.nist.gov/PhysRefData/ASD/lines_form.html',
  OS: 'OpenStax Chemistry 2e, Appendix G https://openstax.org/books/chemistry-2e/pages/g-standard-thermodynamic-properties-for-selected-substances',
  ET: 'Engineering ToolBox（CaCO₃ −1207.6、Na₂CO₃ −1130.7 kJ/mol） https://www.engineeringtoolbox.com/standard-state-enthalpy-formation-definition-value-Gibbs-free-energy-entropy-molar-heat-capacity-d_1978.html',
  MK: '東京都立小石川中等教育学校「アルコールの酸化1」 https://www.metro.ed.jp/koishikawa-s/l_pdf/04_アルコールの酸化1.pdf',
  GS: 'ゲームの検査の文（src/content/samples.ts）', GR: 'ゲームの捕集の文（src/content/recipes.ts）', GI: 'ゲームの系統分離の文（src/content/ions.ts）',
  GK: 'ゲームの知識の札 org-ninhydrin（src/content/knowledge.ts）',
  general: '教科書に共通の事実', AIR: '空気の平均分子量 28.8（N₂ : O₂ = 4 : 1）と、化学式から求めた分子量', decisionD1: 'SPEC2 §2 D1（光の枠組み）',
};
