import { describe, expect, it } from 'vitest';
import { SOURCES, dHCaption } from '../src/content/captions';
import { de00, de00As, hexToRgb, type Cvd } from '../src/content/colorsci';
import { AGENTS, MUD_OH } from '../src/content/ions';
import {
  ANALYZER, BURN, BURNER, CATALYSTS, COLOUR_WORDS, EXO, FLAMES, FLAME_TESTS, INDICATORS, LAYERS, LOOKS, LOOK_SRC, NO_FLAME, ORES, PLUMES, PPT_IN,
  RECIPE_INDICATOR, SOLUTIONS, STORE, STORE_SRC, TURBID_WORD, colourWordsIn, colouredOf, gasClass, lookSentence, molarOf, plumeOf, popLook,
  reactionLook, reactionLookById, type Cue,
} from '../src/content/looks';
import { questionsFor } from '../src/content/mock';
import { RECIPES, recipeById } from '../src/content/recipes';
import { BLACKBODY, DRAPER, G, LIGHT_SOURCES, LINES, T_CLAMP, V, blackbodyHex, logY, whiteHotHex } from '../src/content/spectra';
import { SUBSTANCES, hasSub, sub } from '../src/content/substances';
import { DH, DHF, PROCESS_T, dHFromFormation, dHInt, dHOf, dHText, equationText, processOf } from '../src/content/thermo';

/**
 * SPEC2 §10 の表を、ここにもう一度書き写して持つ（正はこちら：コードの値が出典からずれたら落ちる）。
 * 鍵・色・言葉は SPEC2 §10 のとおり。
 */

// ---- §10.1 炎色反応 ----
const S_FLAMES: Record<string, [string, string]> = {
  Li: ['赤色', '#e8283c'], Na: ['黄色', '#ffd43a'], K: ['赤紫色', '#c98bff'], Ca: ['橙赤色', '#ff7b3a'], Sr: ['紅色（深赤色）', '#a8001e'], Ba: ['黄緑色', '#b9e24a'], Cu: ['青緑色', '#3ad9b4'],
};
// ---- §10.3 気体 ----
const S_COLOURED_GAS: Record<string, [string, string, number, string]> = {
  Cl2: ['黄緑色', '#b9cf4a', 70.9, 'heavy'], NO2: ['赤褐色', '#a4532c', 46.0, 'heavy'], O3: ['淡青色', '#a9cfe8', 48.0, 'heavy'], F2: ['淡黄色', '#e6e2a0', 38.0, 'heavy'],
  Br2: ['赤褐色', '#b0482a', 159.8, 'heavy'], I2: ['紫色', '#9b4fd0', 253.8, 'heavy'],
};
const S_COLOURLESS_GAS: Record<string, [number, string]> = {
  N2: [28.0, 'neutral'], O2: [32.0, 'heavy'], H2: [2.0, 'light'], NH3: [17.0, 'light'], NO: [30.0, 'neutral'], SO2: [64.1, 'heavy'], HCl: [36.5, 'heavy'],
  CO2: [44.0, 'heavy'], CO: [28.0, 'neutral'], H2S: [34.1, 'heavy'], HI: [127.9, 'heavy'], HF: [20.0, 'light'], CH4: [16.0, 'light'], C2H4: [28.1, 'neutral'],
  C3H6: [42.1, 'heavy'], C2H2: [26.0, 'light'], HCHO: [30.0, 'neutral'], CH2CHCl: [62.5, 'heavy'], C2H4O: [44.1, 'heavy'], CH3Cl: [50.5, 'heavy'],
  HCN: [27.0, 'neutral'], CH2CHCHCH2: [54.1, 'heavy'], H2O: [18.0, 'light'],
};
const S_WHITE: Record<string, [string, 'smoke' | 'mist']> = { NH4Cl: ['#f4f4f2', 'smoke'], P4O10: ['#f4f4f0', 'smoke'], SO3: ['#f4f4f2', 'mist'], H2O: ['#f2f4f6', 'mist'] };
// ---- §10.4 イオン・水溶液・指示薬 ----
const S_SOLUTIONS: Record<string, [string, string | null, string?]> = {
  'Cu2+': ['青色', '#7fb6e8', '#3b82d6'], CuCl2: ['青色（濃いと青緑色）', '#3aa0c8'], 'Cu(NH3)4': ['深青色', '#1b3fa8'], 'Fe2+': ['淡緑色', '#b9d8b0'],
  'Fe3+': ['黄褐色', '#b98a2c'], FeSCN: ['血赤色', '#9a0a10'], MnO4: ['赤紫色', '#8e2a7e'], 'Mn2+': ['ほぼ無色（淡桃色）', '#f0dfe3'], CrO4: ['黄色', '#f2c81e'],
  Cr2O7: ['橙赤色', '#e8641e'], I3: ['褐色', '#c08a3a', '#8a4a14'], 'I2-starch': ['青紫色', '#3b2a8a'], 'Br2-water': ['赤褐色（薄いと黄褐色）', '#c8642a'],
  'Cl2-water': ['淡黄緑色', '#e3eba0'], fehling: ['深青色', '#1f4fb0'], colourless: ['無色', null],
};
// ---- §10.5 沈殿と固体（ゲームの物質にあるもの） ----
const S_SOLIDS: Record<string, [string, string]> = {
  AgCl: ['白色', '#f4f4f1'], PbCl2: ['白色', '#f4f4f1'], PbSO4: ['白色', '#f4f4f1'], CaCO3: ['白色', '#f2f1ec'], CaSO4: ['白色', '#f2f1ec'],
  'Al(OH)3': ['白色', '#f2f2ee'], 'Pb(OH)2': ['白色', '#f2f2ee'], ZnS: ['白色', '#f3f3ef'], CuS: ['黒色', '#222226'], PbS: ['黒色', '#222226'],
  Ag2S: ['黒色', '#222226'], FeS: ['黒色', '#222226'], 'Fe(OH)3': ['赤褐色', '#9a4a26'], 'Cu(OH)2': ['青白色', '#a9cfe2'], Ag2O: ['褐色', '#6a4a32'],
  PbCrO4: ['黄色', '#e8c62a'], Ag2CrO4: ['赤褐色', '#8f3a26'], CaSO3: ['白色', '#f6f6f3'], 'mud-oh': ['赤褐色', '#b0603a'], I2: ['黒紫色', '#3a2440'],
  Cu: ['赤色', '#c8733f'], CuO: ['黒色', '#222224'], Fe2O3: ['赤褐色', '#9a3a22'], MnO2: ['黒色', '#28262a'],
};
// ---- §10.7 黒体の色と運転温度 ----
const S_BB: [number, string, number | null][] = [
  [450, '#ff0000', -2.37], [525, '#ff1a00', -1.08], [600, '#ff2a00', 0], [700, '#ff3b00', 1.19], [800, '#ff4900', 2.17], [900, '#ff5400', 2.99], [1000, '#ff5e00', 3.68],
  [1200, '#ff6e00', 4.8], [1400, '#ff7b00', null], [1500, '#ff8100', 6.02], [1600, '#ff8600', null], [1800, '#ff9120', null], [2000, '#ff9b36', 7.36],
];
const S_PROCESS_T: Record<string, [number | null, number | null, string[]]> = {
  'haber-bosch': [500, 0, ['WHB']], contact: [450, 0, ['WCP']], 'ostwald-1': [800, 0.45, ['JOS']], cracking: [850, 0.5, ['WSC']], 'molten-nacl': [801, 0.45, ['WNaCl']],
  'hall-heroult': [960, 0.61, ['WHH']], 'hall-heroult-co': [960, 0.61, ['WHH']], 'lime-kiln': [900, 0.56, ['WLK']], 'zinc-roast': [980, 0.63, ['WZS']],
  'copper-matte': [1100, 0.73, ['WCE']], 'copper-converter': [1100, 0.73, ['WCE']], 'blast-furnace': [1500, 0.96, ['SU']], thermite: [2000, 1, ['WTH']], 'lead-roast': [null, null, []],
};
// ---- §10.9 反応エンタルピー ----
const S_DH: Record<string, [string, number]> = {
  'haber-bosch': ['N₂(気) + 3H₂(気) → 2NH₃(気)', -91.8], contact: ['2SO₂(気) + O₂(気) → 2SO₃(気)', -197.8], 'sulfur-burn': ['S(斜方) + O₂(気) → SO₂(気)', -296.8],
  'hcl-synthesis': ['H₂(気) + Cl₂(気) → 2HCl(気)', -184.6], 'carbon-burn': ['C(黒鉛) + O₂(気) → CO₂(気)', -393.5], 'co-burn': ['2CO(気) + O₂(気) → 2CO₂(気)', -566.0],
  'coke-burn': ['2C(黒鉛) + O₂(気) → 2CO(気)', -221.0], 'co2-reduce': ['CO₂(気) + C(黒鉛) → 2CO(気)', 172.5], 'lime-kiln': ['CaCO₃(固) → CaO(固) + CO₂(気)', 179.2],
  slaking: ['CaO(固) + H₂O(液) → Ca(OH)₂(固)', -64.5], 'soda-ash': ['2NaHCO₃(固) → Na₂CO₃(固) + H₂O(気) + CO₂(気)', 135.6],
  'steam-reforming': ['CH₄(気) + H₂O(気) → CO(気) + 3H₂(気)', 205.9], methanol: ['CO(気) + 2H₂(気) → CH₃OH(気)', -90.5],
  'ethylene-hydration': ['C₂H₄(気) + H₂O(気) → C₂H₅OH(気)', -45.4], 'ostwald-1': ['4NH₃(気) + 5O₂(気) → 4NO(気) + 6H₂O(気)', -906.3],
  'ostwald-2': ['2NO(気) + O₂(気) → 2NO₂(気)', -114.1], 'no2-dimer': ['2NO₂(気) → N₂O₄(気)', -55.3], thermite: ['2Al(固) + Fe₂O₃(固) → Al₂O₃(固) + 2Fe(固)', -851.8],
  'blast-furnace': ['Fe₂O₃(固) + 3CO(気) → 2Fe(固) + 3CO₂(気)', -24.8], 'hi-decomp': ['2HI(気) → H₂(気) + I₂(気)', 9.5],
  'water-electrolysis': ['2H₂O(液) → 2H₂(気) + O₂(気)', 571.7], 'fuel-cell': ['2H₂(気) + O₂(気) → 2H₂O(液)', -571.7], 'p4-burn': ['P₄(黄リン) + 5O₂(気) → P₄O₁₀(固)', -2984.0],
  phosphoric: ['P₄O₁₀(固) + 6H₂O(液) → 4H₃PO₄(固)', -417.0], 'so3-absorb': ['SO₃(気) + H₂O(液) → H₂SO₄(液)', -132.4],
};
/**
 * 札と説明に出す ΔH の整数（dHText）。ΔfH から計算した値を丸めたもの（表の 0.1 単位の値をもう一度丸めない）。
 * 表の値の丸めと整数がずれるのは、計算した値が .5 のすぐ下にある 4 行：co2-reduce 172.47、slaking −64.47、methanol −90.48、hi-decomp 9.478
 */
const S_DH_TEXT: Record<string, string> = {
  'haber-bosch': '−92', contact: '−198', 'sulfur-burn': '−297', 'hcl-synthesis': '−185', 'carbon-burn': '−394', 'co-burn': '−566', 'coke-burn': '−221',
  'co2-reduce': '172', 'lime-kiln': '179', slaking: '−64', 'soda-ash': '136', 'steam-reforming': '206', methanol: '−90', 'ethylene-hydration': '−45',
  'ostwald-1': '−906', 'ostwald-2': '−114', 'blast-furnace': '−25', thermite: '−852', 'hi-decomp': '9', 'water-electrolysis': '572', 'fuel-cell': '−572',
  'p4-burn': '−2984', phosphoric: '−417', 'so3-absorb': '−132',
};
// ---- §10.11 分析器（P0 と、ろ紙のニンヒドリン） ----
const S_ANALYZER: Record<string, [string | undefined, string | null | undefined, string, string]> = {
  flame_y: ['#4a7bff', '#ffd43a', '黄色', 'flame'], flame_rp: ['#4a7bff', '#c98bff', '赤紫色', 'flame'], flame_or: ['#4a7bff', '#ff7b3a', '橙赤色', 'flame'],
  flame_yg: ['#4a7bff', '#b9e24a', '黄緑色', 'flame'], flame_bg: ['#4a7bff', '#3ad9b4', '青緑色', 'flame'], has_cl: ['#4a7bff', '#3ad9b4', '青緑色（F 以外のハロゲン）', 'flame'],
  fecl3: ['#b98a2c', '#5b2a8e', '紫色', 'tube'], iodoform: [undefined, '#f2d23a', '黄色', 'tube'], silver: [undefined, undefined, '銀白色（銀鏡）', 'mirror'],
  hyd_silver: [undefined, undefined, '銀白色（銀鏡）', 'mirror'], oxald: [undefined, undefined, '銀白色（銀鏡）', 'mirror'],
  fehling: ['#1f4fb0', '#b8321e', '赤色', 'tube'], iodine: ['#c08a3a', '#3b2a8a', '青紫色', 'tube'], starch: ['#c08a3a', '#3b2a8a', '青紫色', 'tube'],
  biuret: ['#a9cfe2', '#9a3a8a', '赤紫色', 'tube'], xantho: ['#e6c02a', '#f0a020', '黄色 → 橙黄色', 'tube'], sulfur: [undefined, '#222226', '黒色', 'tube'],
  br2: ['#c8642a', null, '無色（脱色）', 'tube'], aldose: ['#c8642a', null, '無色（脱色）', 'tube'], oxid: ['#e8641e', '#3f8f5a', '橙赤色 → 緑色', 'tube'],
  fecn: [undefined, '#1f3a8a', '濃青色', 'tube'], hcl: [undefined, '#f4f4f1', '白色', 'tube'], h2so4: [undefined, '#f4f4f1', '白色', 'tube'], co3: [undefined, '#f4f4f1', '白色', 'tube'],
  h2s_acid: [undefined, '#222226', '黒色（ZnS は白色）', 'tube'], h2s_base: [undefined, '#222226', '黒色（ZnS は白色）', 'tube'],
  nh3_few: ['#a9cfe2', '#1b3fa8', '青白色 → 深青色', 'tube'], nh3_ex: ['#a9cfe2', '#1b3fa8', '青白色 → 深青色', 'tube'],
  na: [undefined, null, '気体が発生', 'bubbles'], cold_water: [undefined, null, '気体が発生', 'bubbles'], acid_h2: [undefined, null, '気体が発生', 'bubbles'],
  nahco3: [undefined, null, '気体が発生', 'bubbles'], ext_nahco3: [undefined, null, '気体が発生', 'bubbles'], gas_hcl: [undefined, null, '気体が発生', 'bubbles'],
  water_o2: [undefined, null, '気体が発生', 'bubbles'], tyndall: [undefined, undefined, '光の通り道が見える', 'tyndall'], ninhydrin: [undefined, '#5a3a9a', '紫色', 'spots'],
};
// ---- §10.13 色の言葉 ----
const S_WORDS = ['白色', '黒色', '赤色', '赤褐色', '褐色', '黒褐色', '黒紫色', '紫色', '赤紫色', '青紫色', '青色', '深青色', '濃青色', '青白色', '青緑色', '緑色', '淡緑色',
  '黄緑色', '淡黄緑色', '黄色', '淡黄色', '黄褐色', '黄金色', '橙赤色', '橙色', '橙黄色', '淡青色', '淡赤色', '銀白色', '灰色', '灰黒色', '無色', 'ほぼ無色（淡桃色）',
  '白色（ゲル状）', '血赤色', '紅色', '深赤色', '淡黄白色', '淡桃色'];
// ---- §10.15 保存 ----
const S_STORE: Record<string, string> = { Na: 'kerosene', P4: 'water', HF: 'poly', HNO3: 'brown', KMnO4: 'brown', AgNO3: 'brown', NaOH: 'poly' };

const rec = (id: string) => { const r = recipeById(id); if (!r) throw new Error(id); return r; };
const CVDS: (Cvd | undefined)[] = [undefined, 'protan', 'deutan'];
/** 一般の色覚・1 型・2 型のうち、いちばん小さい CIEDE2000 */
const minDE = (a: string, b: string) => Math.min(...CVDS.map((k) => de00As(a, b, k)));
const near = (a: number, b: number, d: number) => Math.abs(a - b) <= d;

describe('SPEC2 §10 の表と同じ値', () => {
  it('§10.1 炎色反応：7 元素、言葉・色・元素記号。花火の FLAMES は ELEMENTS にある 5 つで、同じ行', () => {
    expect(Object.keys(FLAME_TESTS).sort()).toEqual(Object.keys(S_FLAMES).sort());
    for (const [el, [word, hex]] of Object.entries(S_FLAMES)) expect([FLAME_TESTS[el].word, FLAME_TESTS[el].hex, FLAME_TESTS[el].sym], el).toEqual([word, hex, el]);
    expect(Object.keys(FLAMES).sort()).toEqual(['Ba', 'Ca', 'Cu', 'K', 'Na']);
    for (const el of Object.keys(FLAMES)) expect(FLAMES[el]).toBe(FLAME_TESTS[el]);
    expect([BURNER.inner, BURNER.outer, BURNER.word]).toEqual(['#4a7bff', '#9fb6ff', '青い炎']);
    expect(LINES.Na.nm).toEqual([589.0, 589.6]);
    expect(LINES.Li.nm).toEqual([670.8]);
    expect(LINES.K.nm).toEqual([766.5, 769.9, 404.4]);
  });

  it('§10.2・§10.6 燃える反応は決めた 5 つだけ。炎を出さない 6 つには burn がない', () => {
    expect(Object.keys(BURN).sort()).toEqual(['carbon-burn', 'co-burn', 'coke-burn', 'p4-burn', 'sulfur-burn']);
    expect([BURN['sulfur-burn'].flame, BURN['co-burn'].flame, BURN['carbon-burn'].flame, BURN['coke-burn'].flame, BURN['p4-burn'].flame, BURN['p4-burn'].smoke])
      .toEqual(['#4a6bff', '#3d6cff', '#ff5400', '#ff5400', '#fff1d6', '#f4f4f0']);
    expect(BURN['carbon-burn'].bed && BURN['coke-burn'].bed).toBe(true);
    for (const r of RECIPES) expect(!!reactionLook(r).burn, r.id).toBe(!!BURN[r.id]);
    for (const id of ['copper-oxide', 'ostwald-2', 'zinc-roast', 'lead-roast', 'copper-matte', 'copper-converter']) {
      expect(reactionLookById(id)!.burn, id).toBeUndefined();
      expect(NO_FLAME).toContain(id);
    }
    // H₂ が Cl₂ の中で燃える炎は、言い方の出典がそろうまで描かない（§12）
    expect(BURN['hcl-synthesis']).toBeUndefined();
    expect(LOOKS.P4.glowAir).toBe('#bfe8ff');
  });

  it('§10.3 気体：有色 6 つは煙の色、無色の気体は null（輪）、白いのは 4 つ。分子量は化学式から ±0.1、重い・軽いは ±2 の決まり', () => {
    for (const [id, [word, hex, M, cls]] of Object.entries(S_COLOURED_GAS)) {
      const p = plumeOf(id);
      expect([p.hex, p.cls, p.white], id).toEqual([hex, cls, undefined]);
      expect(near(p.M, M, 0.1), `${id} ${p.M}`).toBe(true);
      const l = LOOKS[id], w = id === 'Br2' || id === 'I2' ? l.vap! : l;
      expect([w.word, w.hex], id).toEqual([word, hex]);
    }
    for (const [id, [M, cls]] of Object.entries(S_COLOURLESS_GAS)) {
      const p = plumeOf(id);
      expect(near(molarOf(id)!, M, 0.1), `${id} ${molarOf(id)}`).toBe(true);
      expect([p.cls, gasClass(M)], id).toEqual([cls, cls]);
      // 水蒸気は無色だが、煙としては冷えた湯気（白い霧）。出口から 0.3 マスは輪
      if (id === 'H2O') expect([p.hex, p.white, p.clearTiles]).toEqual(['#f2f4f6', 'mist', 0.3]);
      else expect([p.hex, p.white], id).toEqual([null, undefined]);
    }
    expect(plumeOf('HCN').cls).toBe('neutral');
    for (const [id, [hex, white]] of Object.entries(S_WHITE)) expect([plumeOf(id).hex, plumeOf(id).white], id).toEqual([hex, white]);
    // 白い煙はこの 4 つだけ
    expect(Object.keys(PLUMES).filter((k) => PLUMES[k].white).sort()).toEqual(Object.keys(S_WHITE).sort());
    // NO は空気中で NO₂ の色になる
    expect(PLUMES.NO.air).toBe('#a4532c');
    // 物質の表にある気体だけ
    for (const id of Object.keys(PLUMES)) expect(hasSub(id), id).toBe(true);
  });

  it('§10.4 水溶液と指示薬', () => {
    for (const [k, [word, hex, conc]] of Object.entries(S_SOLUTIONS)) {
      expect([SOLUTIONS[k].word, SOLUTIONS[k].hex], k).toEqual([word, hex]);
      if (conc) expect(SOLUTIONS[k].conc, k).toBe(conc);
    }
    expect(SOLUTIONS['Mn2+'].alpha).toBeLessThanOrEqual(0.15);
    expect(SOLUTIONS.Cr2O7.to).toEqual({ hex: '#3f8f5a', word: '緑色' });
    expect(INDICATORS.pp).toMatchObject({ acid: { hex: null, word: '無色' }, base: { hex: '#ff5fa2', word: '赤色' }, faint: { hex: '#ffb3cf', word: '淡赤色' }, range: [8.0, 9.8] });
    expect(INDICATORS.mo).toMatchObject({ acid: { hex: '#e0362a', word: '赤色' }, base: { hex: '#f2b81e', word: '黄色' }, range: [3.1, 4.4] });
    expect(INDICATORS.btb).toMatchObject({ acid: { hex: '#e8d02a', word: '黄色' }, mid: { hex: '#3faa5a', word: '緑色' }, base: { hex: '#2a6ad0', word: '青色' }, range: [6.0, 7.6] });
    expect(INDICATORS.litmus).toMatchObject({ acid: { hex: '#d8404a', word: '赤色' }, base: { hex: '#3a5ad0', word: '青色' } });
    // 見た目の表の水溶液の色は、§10.4 の濃い液の色
    for (const row of Object.values(SOLUTIONS)) for (const id of row.ids ?? []) {
      const l = LOOKS[id];
      if (l.aq) expect([row.hex, row.conc]).toContain(l.hex);
    }
  });

  it('§10.4・§10.5 物質の見た目：色・言葉・場面ごとの形', () => {
    for (const [id, [word, hex]] of Object.entries(S_SOLIDS)) expect([LOOKS[id].word, LOOKS[id].hex], id).toEqual([word, hex]);
    expect(LOOKS.AgCl.photo).toEqual(['#8a7a9a', '#3a3640']);
    expect(ORES.ZnS).toBe('#4a2a1e');
    expect([LOOKS.S.turbid, TURBID_WORD.S]).toEqual(['#efe9c4', '白濁（淡黄白色）']);
    expect(PPT_IN.solvay).toEqual([{ id: 'NaHCO3', hex: '#f6f6f3', word: '白色', src: ['general'] }]);
    expect([LOOKS.CuSO4.word, LOOKS.CuSO4.hex, LOOKS.CuSO4.anhyd]).toEqual(['青色', '#3b82d6', { hex: '#eceae4', word: '白色' }]);
    expect([LOOKS.CuCl2.hex, LOOKS.CuCl2.sol!.word, LOOKS.CuCl2.anhyd]).toEqual(['#3aa0c8', '青色（濃いと青緑色）', { hex: '#a0702a', word: '褐色がかった黄色' }]);
    // I₂ は水の中では I₃⁻ の褐色（黒い粒ではない）、蒸気は紫色
    expect(LOOKS.I2.sol).toEqual({ hex: '#c08a3a', word: '褐色' });
    expect(LOOKS.I2.vap).toEqual({ hex: '#9b4fd0', word: '紫色' });
    expect(LOOKS.Br2.sol).toEqual({ hex: '#c8642a', word: '赤褐色（薄いと黄褐色）' });
    expect(LOOKS.Cl2.sol).toEqual({ hex: '#e3eba0', word: '淡黄緑色' });
    // 塩素水の淡黄緑色は C46（気体の黄緑色だけを言う）にないので、出典は general（言い方は SPEC2 §12 で確かめる）
    expect(SOLUTIONS['Cl2-water'].src).toEqual(['general']);
    expect(LOOK_SRC.Cl2).toEqual(['C46', 'general']);
    // 図鑑の札の文（SPEC2 §6.C C8 の例のとおり）
    expect(lookSentence('I2')).toBe('黒紫色の固体（蒸気は紫色、KI 水溶液に溶かすと褐色）');
    expect(lookSentence('CuSO4')).toBe('水溶液は青色。無水物は白色の固体');
    expect(lookSentence('N2')).toBe('気体');
    expect(LAYERS).toEqual({ CH3COOC2H5: 'top', C2H5OC2H5: 'top', C6H5NO2: 'bottom' });
    expect(LOOKS.C6H5NO2.layer).toBe('bottom');
    // 沈殿として生じるもの
    for (const id of ['AgCl', 'PbCl2', 'CuS', 'PbS', 'Ag2S', 'ZnS', 'Fe(OH)3', 'Al(OH)3', 'Cu(OH)2', 'Ag2O', 'PbCrO4', 'Ag2CrO4', 'CaCO3', 'PbSO4']) expect(LOOKS[id].ppt, id).toBe(true);
    // 見た目の表の物質は、どれも物質の表にあり、出典がある
    for (const id of Object.keys(LOOKS)) { expect(hasSub(id), id).toBe(true); expect(LOOK_SRC[id]?.length, id).toBeGreaterThan(0); }
    expect(Object.keys(LOOK_SRC).sort()).toEqual(Object.keys(LOOKS).sort());
  });

  it('§10.7 黒体の色は表から 8 ビットで 1 段以内、G と V の決まり', () => {
    expect(BLACKBODY.map((r) => [r.T, r.hex, r.logY ?? null])).toEqual(S_BB);
    for (const [T, hex] of S_BB) {
      const a = hexToRgb(blackbodyHex(T)), b = hexToRgb(hex);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i]), `${T} ℃`).toBeLessThanOrEqual(1);
    }
    // 表示の上限より熱い温度は上限の色
    expect(blackbodyHex(3000)).toBe(blackbodyHex(T_CLAMP));
    expect(T_CLAMP).toBe(2000);
    expect(DRAPER).toBe(525);
    let last = -1;
    for (let T = 300; T <= 2600; T += 5) { const g = G(T); expect(g, `${T}`).toBeGreaterThanOrEqual(last); last = g; }
    expect([G(450), G(500)]).toEqual([0, 0]);
    // 表にない温度の明るさ（1/T について補う）は、プランクの分布から求めた値（1400 ℃ 5.66、1600 ℃ 6.34、1800 ℃ 6.90）と 0.01 以内
    for (const [T, ly] of [[1400, 5.66], [1600, 6.34], [1800, 6.9]]) expect(Math.abs(logY(T) - ly), `${T}`).toBeLessThan(0.01);
    expect(G(525)).toBeGreaterThan(0);
    expect(V(800)).toBeLessThan(0.2);
    expect(G(1500)).toBeGreaterThan(0.9);
    // 白熱の芯：G が 0.7 より小さいうちはまざらない
    expect(whiteHotHex(800)).toBe(blackbodyHex(800));
    expect(whiteHotHex(2000)).toBe('#fff1d6');
    expect(LIGHT_SOURCES).toEqual({ candle: { K: 1850, hex: '#ff8500' }, tungsten: { K: 2700, hex: '#ffae59' }, led: { K: 4000, hex: '#ffd4a5' }, panel: { K: 5000, hex: '#ffe7d0' } });
  });

  it('§10.7 運転温度：どの行にも出典（鉛の焙焼だけない）、G の列、表示の上限の行は説明用の温度を持つ', () => {
    for (const [id, [T, g, src]] of Object.entries(S_PROCESS_T)) {
      const row = PROCESS_T[id];
      expect(row, id).toBeDefined();
      expect([row.T ?? null, row.src], id).toEqual([T, src]);
      if (T !== null && g !== null) expect(near(G(T), g, 0.01), `${id} G=${G(T)}`).toBe(true);
    }
    // 表にない行は、同じ電解槽の hall-heroult-mix だけ（温度と出典は hall-heroult と同じ）
    expect(Object.keys(PROCESS_T).filter((k) => !S_PROCESS_T[k])).toEqual(['hall-heroult-mix']);
    expect(PROCESS_T['hall-heroult-mix']).toMatchObject({ T: 960, src: ['WHH'] });
    for (const [id, row] of Object.entries(PROCESS_T)) {
      if (id === 'lead-roast') { expect(row.src).toEqual([]); expect(row.T).toBeUndefined(); continue; }
      expect(row.src.length, id).toBeGreaterThan(0);
      expect(recipeById(id), id).toBeDefined();
      if (row.T! >= T_CLAMP) expect(row.Tcap, id).toBeTruthy();
      if (row.Tcap) expect(row.Tcap, id).not.toContain(String(T_CLAMP));
    }
    expect(PROCESS_T.thermite.Tcap).toBe('約 2500 ℃（鉄がとけるほどの高温）');
    expect(reactionLookById('thermite')).toMatchObject({ T: 2000, Tcap: '約 2500 ℃（鉄がとけるほどの高温）' });
    expect(reactionLookById('lead-roast')!.T).toBeUndefined();
  });

  it('§10.9 ΔH：式の物質はどれも状態つき、H₂O は (液) か (気)、ΔfH から求めた値は表と 0.5 kJ 以内', () => {
    expect(Object.keys(DH).sort()).toEqual(Object.keys(S_DH).sort());
    for (const [id, [eq, dH]] of Object.entries(S_DH)) {
      const row = DH[id];
      expect(equationText(row), id).toBe(eq);
      expect(row.dH, id).toBe(dH);
      expect(Math.abs(dHFromFormation(row) - dH), id).toBeLessThanOrEqual(0.5);
      expect(Math.abs(dHInt(row) - dH), id).toBeLessThanOrEqual(1);
      for (const s of [...row.lhs, ...row.rhs]) {
        expect(['気', '液', '固', '黒鉛', '斜方', '黄リン'], `${id} ${s.f}`).toContain(s.st);
        if (s.f === 'H2O') expect(['液', '気']).toContain(s.st);
        expect(DHF[`${s.f}(${s.st})`], `${id} ${s.f}(${s.st})`).toBeDefined();
      }
      if (!row.r2) { expect(recipeById(id), id).toBeDefined(); expect(dHOf(id)).toBe(dH); }
    }
    expect(DHF['CaCO3(固)'].v).toBe(-1207.6);
    expect(dHOf('no2-dimer')).toBeUndefined();
    expect(dHOf('cracking')).toBeUndefined();
  });

  it('§10.9 札と説明の ΔH の整数：反応の一覧にあるどの行も決めておく（図鑑の札と dH の説明は同じ dHText を使う）', () => {
    expect(Object.keys(S_DH_TEXT).sort()).toEqual(Object.keys(DH).filter((k) => !DH[k].r2).sort());
    for (const [id, text] of Object.entries(S_DH_TEXT)) {
      expect(dHText(DH[id]), id).toBe(text);
      expect(dHCaption(id)!.text, id).toBe(`${equationText(DH[id])}　ΔH = ${text} kJ`);
      // 計算した値に最も近い整数
      expect(Math.abs(dHInt(DH[id]) - dHFromFormation(DH[id])), id).toBeLessThanOrEqual(0.5);
    }
  });

  it('§10.11 分析器の検査', () => {
    for (const [id, [before, after, word, kind]] of Object.entries(S_ANALYZER)) {
      const a = ANALYZER[id];
      expect([a.before, a.after, a.word, a.kind], id).toEqual([before, after, word, kind]);
      expect(a.src.length, id).toBeGreaterThan(0);
    }
    for (const id of ['silver', 'hyd_silver', 'oxald']) expect(ANALYZER[id].wall).toEqual(['#d9dde2', '#8d949c']);
    expect(ANALYZER.h2s_acid.per).toEqual({ Zn: '#f3f3ef' });
    expect(ANALYZER.naoh_ex.per).toEqual({ Fe: '#9a4a26', Cu: '#a9cfe2', Ag: '#6a4a32' });
    for (const id of ['fecl3', 'iodoform', 'fehling', 'nh3_ex']) expect(ANALYZER[id].reagent.length, id).toBeGreaterThan(0);
    // 炎色反応の検査には元素記号
    for (const [id, el] of [['flame_y', 'Na'], ['flame_rp', 'K'], ['flame_or', 'Ca'], ['flame_yg', 'Ba'], ['flame_bg', 'Cu']]) expect([ANALYZER[id].sym, ANALYZER[id].cue]).toEqual([el, 'symbol']);
  });

  it('§10.15・§10.16 保存のしかた、触媒と指示薬', () => {
    expect(STORE).toEqual(S_STORE);
    for (const id of Object.keys(STORE)) { expect(hasSub(id), id).toBe(true); expect(STORE_SRC[id].length, id).toBeGreaterThan(0); }
    expect([LOOKS.Na.store, LOOKS.P4.store, LOOKS.KMnO4.store]).toEqual(['kerosene', 'water', 'brown']);
    expect(CATALYSTS['haber-bosch']).toMatchObject({ hex: '#26262a', word: '黒色' });
    expect(CATALYSTS.contact).toMatchObject({ hex: '#e8a83a', word: '黄〜橙色' });
    expect(CATALYSTS['ostwald-1']).toMatchObject({ T: 800 });
    expect(CATALYSTS['lab-o2']).toMatchObject({ hex: '#28262a' });
    expect(CATALYSTS.formaldehyde).toMatchObject({ hex: '#c8733f', alt: { hex: '#222224', word: '黒色' } });
    expect(RECIPE_INDICATOR['neutralize-acetate']).toMatchObject({ id: 'pp', from: null, to: '#ffb3cf' });
    expect(RECIPE_INDICATOR['scrub-nh3']).toMatchObject({ id: 'mo', from: '#e0362a', to: '#f2b81e' });
    expect(Object.keys(RECIPE_INDICATOR).sort()).toEqual(['neutralize-acetate', 'scrub-nh3']);
    for (const r of RECIPES) {
      const l = reactionLook(r);
      expect(l.indicator, r.id).toBe(RECIPE_INDICATOR[r.id]);
      expect(l.catalyst, r.id).toBe(CATALYSTS[r.id]);
    }
  });
});

describe('色の言葉（§10.13）', () => {
  it('表は §10.13 のとおり。修飾の言い方や色でない言い方は拾わない', () => {
    expect(COLOUR_WORDS).toEqual(S_WORDS);
    expect(colourWordsIn('褐色がかった黄色')).toEqual(['褐色', '黄色']);
    expect(colourWordsIn('青色（濃いと青緑色）')).toEqual(['青色', '青緑色']);
    expect(colourWordsIn('白色（光で紫 → 黒）')).toEqual(['白色']);
    for (const t of ['白濁', '赤熱', '青い炎', '明るい炎', '青白く光る', '気体が発生', '光の通り道が見える', 'F 以外のハロゲン', '濃いと', '薄いと']) expect(colourWordsIn(t), t).toEqual([]);
  });
  it('どの見た目の言葉・場面の形・分析器の結果・指示薬・触媒の言葉も、許した色の言葉だけを使う', () => {
    const texts: string[] = [];
    for (const l of Object.values(LOOKS)) texts.push(l.word, ...[l.sol, l.vap, l.anhyd].filter((f) => f).map((f) => f!.word));
    for (const f of Object.values(FLAME_TESTS)) texts.push(f.word);
    for (const s of Object.values(SOLUTIONS)) texts.push(s.word, s.to?.word ?? '');
    for (const i of Object.values(INDICATORS)) texts.push(i.acid.word, i.base.word, i.mid?.word ?? '', i.faint?.word ?? '');
    for (const a of Object.values(ANALYZER)) texts.push(a.word, ...Object.values(a.perWord ?? {}));
    for (const c of Object.values(CATALYSTS)) texts.push(c.word, c.alt?.word ?? '');
    for (const b of Object.values(BURN)) texts.push(b.word);
    texts.push(...Object.values(TURBID_WORD), ...PPT_IN.solvay.map((p) => p.word), BURNER.word);
    // 反応の様子の一言（場面の札と模試の解説に出る）
    for (const r of RECIPES) texts.push(...reactionLook(r).notes.map((n) => n.text));
    for (const t of texts) for (const w of colourWordsIn(t)) expect(COLOUR_WORDS, `${t}：${w}`).toContain(w);
    // 主な言い方（word）は、括弧の補足を除けば表にある言葉そのもの
    for (const [id, l] of Object.entries(LOOKS)) expect(COLOUR_WORDS, id).toContain(l.word.includes('（') && !COLOUR_WORDS.includes(l.word) ? l.word.split('（')[0] : l.word);
  });
  it('模試の色の問いは、これまでどおり作れる（答えは見た目の言い方：主な言い方か、その場面の形の言い方。選択肢は 4 つの別々の言葉）', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let n = 0;
    for (const r of RECIPES) for (const q of questionsFor(r, '①', 2, rnd)) {
      if (q.topic !== '色' || q.kind !== 'choice') continue;
      n++;
      expect(Object.values(LOOKS).flatMap((l) => [l.word, l.sol?.word, l.vap?.word]), r.id).toContain(q.answer);
      expect(new Set(q.choices).size, r.id).toBe(4);
      for (const c of q.choices!) expect(c.includes('（') && c !== q.answer, r.id).toBe(false);
    }
    expect(n).toBeGreaterThan(20);
  });
});

describe('反応の見た目の新しい項目（§6.C C2）', () => {
  it('融解の条件の反応は、どれも水溶液ではない（融解塩の NaCl を淡い水の液に描かない）', () => {
    const molten = RECIPES.filter((r) => r.accept.some((a) => /融解/.test(a)));
    expect(molten.map((r) => r.id).sort()).toEqual(['alkali-fusion', 'hall-heroult', 'hall-heroult-co', 'hall-heroult-mix', 'molten-nacl']);
    for (const r of molten) { const l = reactionLook(r); expect(l.gasPhase || l.dry, r.id).toBe(true); expect(l.melt, r.id).toBe(1); }
    for (const r of RECIPES) if (!molten.includes(r)) expect(reactionLook(r).melt, r.id).toBeUndefined();
  });
  it('水の中の I₂ は I₃⁻ の褐色の液（黒紫色の粒の沈殿ではない）、HI の分解の I₂ は紫色の蒸気（SPEC2 M6）', () => {
    const inWater = '水溶液中では I₃⁻ の褐色（固体は黒紫色）';
    for (const id of ['br-i', 'h2o2-ki', 'ki-electrolysis']) {
      const l = reactionLookById(id)!;
      expect([l.dry, l.gasPhase], id).toEqual([false, false]);
      expect(l.solids, id).not.toContain(LOOKS.I2.hex);
      expect(l.after, id).toBe(LOOKS.I2.sol!.hex);
      expect(l.notes.find((n) => n.id === 'I2'), id).toEqual({ id: 'I2', made: true, text: inWater, form: 'sol' });
    }
    // ヨウ素滴定：褐色から無色へ（I₂ を固体の粒として入れない）
    const io = reactionLookById('iodometry')!;
    expect([io.before, io.solidsIn, io.notes.find((n) => n.id === 'I2')!.text]).toEqual([LOOKS.I2.sol!.hex, [], inWater]);
    // HI の分解（2HI(気) → H₂(気) + I₂(気)）：無色から紫色の気体へ
    const hi = reactionLookById('hi-decomp')!;
    expect([hi.gasPhase, hi.dry, hi.after, hi.notes.find((n) => n.id === 'I2')!.text]).toEqual([true, false, LOOKS.I2.vap!.hex, '紫色の気体（固体は黒紫色）']);
    // どの水溶液の反応でも、溶ける固体（sol を持ち、水溶液の色を主に持たないもの）を沈殿として描かない
    for (const r of RECIPES) {
      const l = reactionLook(r);
      if (l.dry || l.gasPhase) continue;
      for (const [s] of r.outputs) if (LOOKS[s]?.sol && !LOOKS[s].aq && hasSub(s) && sub(s).state === 'solid') expect(l.solids, `${r.id} ${s}`).not.toContain(LOOKS[s].hex);
    }
    // 水溶液の色を主に持つ CuCl₂ は、これまでどおり「水溶液は青色」
    expect(reactionLookById('cucl2-electrolysis')!.notes.find((n) => n.id === 'CuCl2')!.text).toBe('水溶液は青色');
  });
  it('生じる気体の比（同じ温度・圧力の体積比）：水の電気分解は H₂ : O₂ = 2 : 1', () => {
    expect(reactionLookById('water-electrolysis')!.gasRatio).toEqual([2, 1]);
    expect(reactionLookById('brine-electrolysis')!.gasRatio).toEqual([1, 1]);
    expect(reactionLookById('lime-kiln')!.gasRatio).toEqual([1]);
    expect(reactionLookById('precip-agcl')!.gasRatio).toEqual([]);
  });
  it('工程の種類（S12）', () => {
    const want: Record<string, string> = {
      'water-electrolysis': 'cell', 'molten-nacl': 'cell', daniell: 'cell', 'fuel-cell': 'cell', 'blast-furnace': 'furnace', 'copper-matte': 'furnace',
      'copper-converter': 'furnace', 'zinc-roast': 'furnace', 'lead-roast': 'furnace', 'lime-kiln': 'kiln', kolbe: 'pressure', 'air-distillation': 'column',
      'crude-distillation': 'column', 'seawater-distillation': 'column', 'coal-carbonization': 'vessel', 'haber-bosch': 'vessel', 'precip-agcl': 'vessel', 'collect-NH3': 'vessel',
    };
    for (const [id, k] of Object.entries(want)) { expect(processOf(id), id).toBe(k); expect(reactionLookById(id)!.process, id).toBe(k); }
    expect(processOf('no-such-recipe')).toBe('vessel');
  });
  it('発熱の目印・入ってくる気体と固体・ΔH・運転温度', () => {
    expect(EXO).toEqual(['slaking', 'so3-absorb', 'phosphoric']);
    for (const r of RECIPES) expect(!!reactionLook(r).exo, r.id).toBe(EXO.includes(r.id));
    expect(reactionLookById('cl-br')!.gasIn).toEqual(['Cl2']);
    expect(reactionLookById('copper-sulfate')!.solidsIn).toEqual(['CuO']);
    expect(reactionLookById('haber-bosch')!.gasIn).toEqual([]);
    expect(reactionLookById('haber-bosch')).toMatchObject({ dH: -91.8, T: 500 });
    expect(reactionLookById('cracking')!.dH).toBeUndefined();
    for (const r of RECIPES) { const l = reactionLook(r); expect(l.T, r.id).toBe(PROCESS_T[r.id]?.T); }
  });
});

describe('「ぽん」の描き方（S10）', () => {
  it('色のある生成物は吸収する煙（その色）、無色の生成物は光（色は描く側の中立の白）', () => {
    const products = new Set(RECIPES.flatMap((r) => r.outputs.map(([s]) => s)).filter((s) => s !== 'e'));
    for (const id of products) {
      const p = popLook(id);
      if (colouredOf(id)) { expect(p.mode, id).toBe('puff'); expect(p.rgb, id).toBe(hexRgb(LOOKS[id.startsWith('jar-') ? id.slice(4) : id].hex)); }
      else expect(p.mode, id).toBe('light');
    }
    expect(popLook('NO2')).toEqual({ rgb: '164,83,44', mode: 'puff' });
    expect(popLook('jar-NO2').mode).toBe('puff');
    for (const id of ['SO2', 'H2S', 'NH3', 'NO', 'H2', 'MnSO4', 'jar-O2']) expect(popLook(id).mode, id).toBe('light');
  });
});
const hexRgb = (hex: string) => hexToRgb(hex).join(',');

describe('見分けやすさ（§10.10：一般の色覚と 1 型・2 型の模擬）', () => {
  /** 同じ場面に並ぶ色。word は主な色の言葉（同じ言葉どうしは、色で見分けるものではないので比べない） */
  interface Item { name: string; hex: string; word?: string; cue?: Cue }
  /** 場面の中で、色差 10 未満の組（言葉が同じ組・同じ行どうしは除く）の両方に cue があること */
  const check = (ctx: string, items: Item[], sameRow = (a: Item, b: Item) => a.name === b.name) => {
    const bad: string[] = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (sameRow(a, b) || (a.word && a.word === b.word)) continue;
      const d = minDE(a.hex, b.hex);
      if (d < 10 && !(a.cue && b.cue)) bad.push(`${ctx}: ${a.name}–${b.name} ${d.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  };
  const first = (w: string) => colourWordsIn(w)[0] ?? w;

  it('炎：一般の色覚で最小 14.8（Li–Sr）、どの炎にも元素記号。1 型・2 型で近い組は記号で見分ける', () => {
    const els = Object.keys(FLAME_TESTS);
    let min = Infinity;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) min = Math.min(min, de00(FLAME_TESTS[els[i]].hex, FLAME_TESTS[els[j]].hex));
    expect(min).toBeGreaterThanOrEqual(10);
    expect(near(min, 14.8, 0.05)).toBe(true);
    for (const el of els) expect(FLAME_TESTS[el].sym).toBe(el);
    check('炎', els.map((el) => ({ name: el, hex: FLAME_TESTS[el].hex, cue: 'symbol' as Cue })));
    // §10.10 の数値（色の計算の約束が同じであることも確かめる）
    expect(de00(FLAME_TESTS.Na.hex, FLAME_TESTS.Ba.hex)).toBeCloseTo(19.3, 1);
    expect(de00(FLAME_TESTS.Li.hex, FLAME_TESTS.Ca.hex)).toBeCloseTo(21.6, 1);
    expect(de00As(FLAME_TESTS.Na.hex, FLAME_TESTS.Ba.hex, 'protan')).toBeCloseTo(1.4, 1);
    expect(de00As(FLAME_TESTS.Li.hex, FLAME_TESTS.Sr.hex, 'protan')).toBeCloseTo(11.6, 1);
    expect(de00As(FLAME_TESTS.Na.hex, FLAME_TESTS.Ba.hex, 'deutan')).toBeCloseTo(3.6, 1);
    expect(de00As(FLAME_TESTS.Ca.hex, FLAME_TESTS.Ba.hex, 'deutan')).toBeCloseTo(9.9, 1);
    expect(de00(FLAME_TESTS.Sr.hex, SOLUTIONS.FeSCN.hex!)).toBeCloseTo(4.2, 1);
    expect(SOLUTIONS.FeSCN.cue).toBeTruthy();
  });

  it('分析器：青い 5 組とニンヒドリンは試薬の名前で見分ける。近い組はどれも手がかりがある', () => {
    const blue: [string, string, number][] = [['fecn', 'nh3_ex', 4.4], ['fehling', 'nh3_ex', 5.3], ['fecl3', 'starch', 6.0], ['fecn', 'starch', 7.7], ['fecn', 'fehling', 8.0]];
    const colourOf = (id: string) => (id === 'fehling' ? ANALYZER.fehling.before! : id === 'nh3_ex' ? ANALYZER.nh3_ex.after! : ANALYZER[id].after!);
    for (const [a, b, d] of blue) {
      expect(de00(colourOf(a), colourOf(b))).toBeCloseTo(d, 1);
      expect([ANALYZER[a].cue, ANALYZER[b].cue], `${a}–${b}`).toEqual(['reagent', 'reagent']);
    }
    expect(ANALYZER.ninhydrin.cue).toBe('reagent');
    expect(de00(ANALYZER.ninhydrin.after!, ANALYZER.fecl3.after!)).toBeCloseTo(4.4, 1);
    expect(de00(ANALYZER.ninhydrin.after!, ANALYZER.starch.after!)).toBeCloseTo(6.5, 1);
    const items: Item[] = [];
    for (const [id, a] of Object.entries(ANALYZER)) {
      const cols = [a.before, a.after, ...(a.wall ?? []), ...Object.values(a.per ?? {})].filter((c): c is string => !!c);
      for (const hex of cols) items.push({ name: id, hex, cue: a.cue });
    }
    // 同じ試薬の行（silver と oxald、iodine と starch など）は同じ検査の別名なので比べない
    check('分析器', items, (x, y) => x.name === y.name || ANALYZER[x.name] === ANALYZER[y.name] || ANALYZER[x.name].reagent === ANALYZER[y.name].reagent);
  });

  it('沈殿の色：Cu₂O–Fe(OH)₃ 8.6、Fe(OH)₃–I₃⁻（濃い液）6.8、Fe(OH)₃–Ag₂CrO₄ 6.5 は札の物質名で見分ける', () => {
    expect(de00(ANALYZER.fehling.after!, LOOKS['Fe(OH)3'].hex)).toBeCloseTo(8.6, 1);
    expect(de00(LOOKS['Fe(OH)3'].hex, SOLUTIONS.I3.conc!)).toBeCloseTo(6.8, 1);
    expect(de00(LOOKS['Fe(OH)3'].hex, LOOKS.Ag2CrO4.hex)).toBeCloseTo(6.5, 1);
    expect([LOOKS['Fe(OH)3'].cue, LOOKS.I2.cue, LOOKS.Ag2CrO4.cue]).toEqual(['label', 'label', 'label']);
  });

  it('色のある気体：Cl₂–F₂ 12.4、NO₂–Br₂（蒸気）5.0 は同じ赤褐色で、札の物質名で見分ける', () => {
    expect(de00(LOOKS.Cl2.hex, LOOKS.F2.hex)).toBeCloseTo(12.4, 1);
    expect(de00(LOOKS.NO2.hex, LOOKS.Br2.vap!.hex)).toBeCloseTo(5.0, 1);
    const items: Item[] = Object.entries(PLUMES).filter(([, p]) => p.hex && !p.white).map(([id, p]) => {
      const l = LOOKS[id];
      return { name: id, hex: p.hex!, word: first((l.vap ?? l).word), cue: l.cue };
    });
    expect(items.length).toBe(6);
    check('気体', items);
    expect([LOOKS.NO2.cue, LOOKS.Br2.cue]).toEqual(['label', 'label']);
  });

  it('沈殿槽（系統分離）：沈殿とろ液と試薬の色', () => {
    const ids = new Set<string>([MUD_OH]);
    for (const a of AGENTS) for (const s of Object.values(a.ppt)) if (s) ids.add(s);
    const items: Item[] = [...ids].filter((id) => LOOKS[id]).map((id) => ({ name: id, hex: LOOKS[id].hex, word: first(LOOKS[id].word), cue: LOOKS[id].cue }));
    for (const k of ['Cu2+', 'Fe3+', 'Fe2+', 'Cu(NH3)4', 'CrO4']) { const s = SOLUTIONS[k]; items.push({ name: k, hex: s.hex!, word: first(s.word), cue: s.cue }); }
    expect(items.length).toBeGreaterThan(15);
    check('沈殿槽', items);
  });

  it('水溶液と指示薬：反応の容器に並ぶ色', () => {
    const items: Item[] = [];
    for (const [k, s] of Object.entries(SOLUTIONS)) {
      if (!s.hex) continue;
      items.push({ name: k, hex: s.hex, word: first(s.word), cue: s.cue });
      if (s.conc) items.push({ name: k, hex: s.conc, word: first(s.word), cue: s.cue });
      if (s.to) items.push({ name: k, hex: s.to.hex, word: first(s.to.word), cue: s.cue });
    }
    for (const [k, i] of Object.entries(INDICATORS)) for (const f of [i.acid, i.mid, i.base, i.faint]) if (f?.hex) items.push({ name: k, hex: f.hex, word: first(f.word), cue: i.cue });
    check('水溶液', items);
  });

  it('1 つの反応の容器の中：原料と生成物の見た目（場面ごとの形も）', () => {
    for (const r of RECIPES) {
      const items: Item[] = [];
      for (const id of new Set([...r.inputs, ...r.outputs].map(([s]) => s))) {
        const l = LOOKS[id];
        if (!l) continue;
        for (const f of [l, l.sol, l.vap].filter((x) => x)) items.push({ name: id, hex: f!.hex, word: first(f!.word), cue: l.cue });
      }
      check(r.id, items);
    }
  });
});

describe('出典の鍵', () => {
  it('見た目・炎・煙・水溶液・分析器・触媒・保存・温度・ΔfH のどの出典の鍵も、SPEC2 §11.2 の鍵（SOURCES）にある', () => {
    const keys = new Set<string>();
    const add = (l?: string[]) => l?.forEach((k) => keys.add(k));
    Object.values(LOOK_SRC).forEach(add);
    Object.values(FLAME_TESTS).forEach((f) => add(f.src));
    Object.values(BURN).forEach((b) => add(b.src));
    Object.values(PLUMES).forEach((p) => add(p.src));
    Object.values(SOLUTIONS).forEach((s) => add(s.src));
    Object.values(INDICATORS).forEach((s) => add(s.src));
    Object.values(ANALYZER).forEach((s) => add(s.src));
    Object.values(CATALYSTS).forEach((s) => add(s.src));
    Object.values(STORE_SRC).forEach(add);
    Object.values(PROCESS_T).forEach((p) => add(p.src));
    Object.values(DHF).forEach((d) => keys.add(d.src));
    Object.values(LINES).forEach((l) => add(l.src));
    add(PPT_IN.solvay[0].src);
    add([...BURNER.src]);
    for (const k of keys) expect(SOURCES[k], k).toBeTruthy();
  });
  it('物質の表に、色を言う物質の id がそろっている（見た目の表の外に色を持たない）', () => {
    for (const s of SUBSTANCES) if (!LOOKS[s.id]) expect(lookSentence(s.id), s.id).not.toMatch(/色/);
    expect(sub('HF').state).toBe('gas');
  });
});
