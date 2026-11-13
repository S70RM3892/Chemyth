import { pretty } from '../chem/formula';
import { recipeById } from './recipes';

/**
 * 反応の温度と熱。装置の形（工程の種類）、熱で光るかどうかを決める運転温度、反応エンタルピー ΔH。
 * どの値にも出典の鍵（SPEC2 §11.2）を付ける。出典のない値は持たない（鉛の焙焼の温度など）。
 */

/** 工程の種類。装置の絵の形を選ぶのに使う（S12） */
export type ProcessKind = 'vessel' | 'cell' | 'furnace' | 'kiln' | 'pressure' | 'column';
const FURNACE = new Set(['blast-furnace', 'copper-matte', 'copper-converter', 'zinc-roast', 'lead-roast']);
/** 反応の工程の種類：電解槽と電池は cell、高炉・製錬・焙焼は furnace、石灰窯は kiln、高温・高圧の反応は pressure、蒸留・分留の塔は column、ほかは vessel */
export function processOf(recipeId: string): ProcessKind {
  const r = recipeById(recipeId);
  if (!r) return 'vessel';
  if (r.machine === 'electrolyzer' || r.machine === 'battery') return 'cell';
  if (FURNACE.has(r.id)) return 'furnace';
  if (r.id === 'lime-kiln') return 'kiln';
  if (r.accept.includes('高温・高圧')) return 'pressure';
  if (r.machine === 'separator' && r.accept.some((a) => a === '蒸留' || a === '分留')) return 'column';
  return 'vessel';
}

/**
 * 運転温度（℃）。T が表示の上限（2000 ℃）で切ったものなら、説明に出す温度を Tcap に持つ（その値は T として書かない）。
 * T のない行（鉛の焙焼）は、出典のある温度がないので光らせない。
 */
export interface ProcessT { T?: number; Tcap?: string; src: string[]; note?: string }
export const PROCESS_T: Record<string, ProcessT> = {
  'haber-bosch': { T: 500, src: ['WHB'] },
  contact: { T: 450, src: ['WCP'] },
  'ostwald-1': { T: 800, src: ['JOS'], note: '白金網' },
  cracking: { T: 850, src: ['WSC'] },
  'molten-nacl': { T: 801, src: ['WNaCl'], note: 'NaCl の融点 800.7 ℃' },
  'hall-heroult': { T: 960, src: ['WHH'], note: '940〜980 ℃' },
  'hall-heroult-co': { T: 960, src: ['WHH'], note: '940〜980 ℃' },
  // 同じ電解槽で CO と CO₂ がまじって出る反応。温度は上の 2 つと同じ
  'hall-heroult-mix': { T: 960, src: ['WHH'], note: '940〜980 ℃' },
  'lime-kiln': { T: 900, src: ['WLK'] },
  'zinc-roast': { T: 980, src: ['WZS'], note: '懸濁焙焼炉' },
  'copper-matte': { T: 1100, src: ['WCE'] },
  'copper-converter': { T: 1100, src: ['WCE'], note: '入ってくるマットの温度（下限）' },
  'blast-furnace': { T: 1500, src: ['SU'], note: '出銑時の銑鉄 1480〜1520 ℃' },
  thermite: { T: 2000, Tcap: '約 2500 ℃（鉄がとけるほどの高温）', src: ['WTH'], note: '2000 ℃ は色の表示の上限。断熱燃焼温度は約 2860 ℃' },
  'lead-roast': { src: [], note: '出典のある温度がない（バーナーだけを描く）' },
};
/** 運転温度（℃）。出典のある値がなければ undefined */
export const processT = (recipeId: string): number | undefined => PROCESS_T[recipeId]?.T;

/** 状態の書き方。日本の教科書の熱化学の式のとおり、化学式のあとに付ける */
export type StateMark = '気' | '液' | '固' | '黒鉛' | '斜方' | '黄リン';
export interface Species { n: number; f: string; st: StateMark }
const sp = (n: number, f: string, st: StateMark): Species => ({ n, f, st });

/**
 * 298 K の標準生成エンタルピー ΔfH（kJ/mol）。鍵は「化学式(状態)」。単体の基準の形（黒鉛・斜方硫黄・黄リンなど）は 0。
 * OS：OpenStax Chemistry 2e 付録 G（2026-11-13 に値を照合）。CaCO₃ は OS の値（−1220.0）ではなく ET の −1207.6 を使う（SPEC2 §10.9）。
 * Na₂CO₃ と NaHCO₃ は OS の表にない：Na₂CO₃ は ET、NaHCO₃ は ET にもないので en.wikipedia「Sodium_bicarbonate」の −950.8（鍵 WNaHCO3）。
 */
export const DHF: Record<string, { v: number; src: string }> = {
  'N2(気)': { v: 0, src: 'OS' }, 'H2(気)': { v: 0, src: 'OS' }, 'O2(気)': { v: 0, src: 'OS' }, 'Cl2(気)': { v: 0, src: 'OS' },
  'C(黒鉛)': { v: 0, src: 'OS' }, 'S(斜方)': { v: 0, src: 'OS' }, 'P4(黄リン)': { v: 0, src: 'OS' }, 'Al(固)': { v: 0, src: 'OS' }, 'Fe(固)': { v: 0, src: 'OS' },
  'NH3(気)': { v: -45.9, src: 'OS' }, 'SO2(気)': { v: -296.83, src: 'OS' }, 'SO3(気)': { v: -395.72, src: 'OS' }, 'HCl(気)': { v: -92.307, src: 'OS' },
  'CO2(気)': { v: -393.51, src: 'OS' }, 'CO(気)': { v: -110.52, src: 'OS' }, 'CaO(固)': { v: -634.9, src: 'OS' }, 'CaCO3(固)': { v: -1207.6, src: 'ET' },
  'Ca(OH)2(固)': { v: -985.2, src: 'OS' }, 'H2O(液)': { v: -285.83, src: 'OS' }, 'H2O(気)': { v: -241.82, src: 'OS' },
  'NaHCO3(固)': { v: -950.8, src: 'WNaHCO3' }, 'Na2CO3(固)': { v: -1130.7, src: 'ET' }, 'CH4(気)': { v: -74.6, src: 'OS' }, 'CH3OH(気)': { v: -201.0, src: 'OS' },
  'C2H4(気)': { v: 52.4, src: 'OS' }, 'C2H5OH(気)': { v: -234.8, src: 'OS' }, 'NO(気)': { v: 90.25, src: 'OS' }, 'NO2(気)': { v: 33.2, src: 'OS' }, 'N2O4(気)': { v: 11.1, src: 'OS' },
  'Al2O3(固)': { v: -1676, src: 'OS' }, 'Fe2O3(固)': { v: -824.2, src: 'OS' }, 'HI(気)': { v: 26.48, src: 'OS' }, 'I2(気)': { v: 62.438, src: 'OS' },
  'P4O10(固)': { v: -2984.0, src: 'OS' }, 'H3PO4(固)': { v: -1279.0, src: 'OS' }, 'H2SO4(液)': { v: -813.989, src: 'OS' },
};

/** 反応エンタルピーの表。dH は SPEC2 §10.9 の値（kJ、0.1 単位）。r2 は第 2 ラウンドの図解用（反応の一覧にはない） */
export interface DhRow { lhs: Species[]; rhs: Species[]; dH: number; note?: string; r2?: boolean }
const row = (lhs: Species[], rhs: Species[], dH: number, extra: Partial<DhRow> = {}): DhRow => ({ lhs, rhs, dH, ...extra });
export const DH: Record<string, DhRow> = {
  'haber-bosch': row([sp(1, 'N2', '気'), sp(3, 'H2', '気')], [sp(2, 'NH3', '気')], -91.8),
  contact: row([sp(2, 'SO2', '気'), sp(1, 'O2', '気')], [sp(2, 'SO3', '気')], -197.8),
  'sulfur-burn': row([sp(1, 'S', '斜方'), sp(1, 'O2', '気')], [sp(1, 'SO2', '気')], -296.8),
  'hcl-synthesis': row([sp(1, 'H2', '気'), sp(1, 'Cl2', '気')], [sp(2, 'HCl', '気')], -184.6),
  'carbon-burn': row([sp(1, 'C', '黒鉛'), sp(1, 'O2', '気')], [sp(1, 'CO2', '気')], -393.5),
  'co-burn': row([sp(2, 'CO', '気'), sp(1, 'O2', '気')], [sp(2, 'CO2', '気')], -566.0),
  'coke-burn': row([sp(2, 'C', '黒鉛'), sp(1, 'O2', '気')], [sp(2, 'CO', '気')], -221.0),
  'co2-reduce': row([sp(1, 'CO2', '気'), sp(1, 'C', '黒鉛')], [sp(2, 'CO', '気')], 172.5),
  'lime-kiln': row([sp(1, 'CaCO3', '固')], [sp(1, 'CaO', '固'), sp(1, 'CO2', '気')], 179.2),
  slaking: row([sp(1, 'CaO', '固'), sp(1, 'H2O', '液')], [sp(1, 'Ca(OH)2', '固')], -64.5),
  'soda-ash': row([sp(2, 'NaHCO3', '固')], [sp(1, 'Na2CO3', '固'), sp(1, 'H2O', '気'), sp(1, 'CO2', '気')], 135.6),
  'steam-reforming': row([sp(1, 'CH4', '気'), sp(1, 'H2O', '気')], [sp(1, 'CO', '気'), sp(3, 'H2', '気')], 205.9),
  methanol: row([sp(1, 'CO', '気'), sp(2, 'H2', '気')], [sp(1, 'CH3OH', '気')], -90.5),
  'ethylene-hydration': row([sp(1, 'C2H4', '気'), sp(1, 'H2O', '気')], [sp(1, 'C2H5OH', '気')], -45.4),
  'ostwald-1': row([sp(4, 'NH3', '気'), sp(5, 'O2', '気')], [sp(4, 'NO', '気'), sp(6, 'H2O', '気')], -906.3),
  'ostwald-2': row([sp(2, 'NO', '気'), sp(1, 'O2', '気')], [sp(2, 'NO2', '気')], -114.1),
  'no2-dimer': row([sp(2, 'NO2', '気')], [sp(1, 'N2O4', '気')], -55.3, { r2: true }),
  // 鉄の単体の札が高炉の式を先に見せるように、高炉をテルミットの前に置く
  'blast-furnace': row([sp(1, 'Fe2O3', '固'), sp(3, 'CO', '気')], [sp(2, 'Fe', '固'), sp(3, 'CO2', '気')], -24.8),
  thermite: row([sp(2, 'Al', '固'), sp(1, 'Fe2O3', '固')], [sp(1, 'Al2O3', '固'), sp(2, 'Fe', '固')], -851.8),
  'hi-decomp': row([sp(2, 'HI', '気')], [sp(1, 'H2', '気'), sp(1, 'I2', '気')], 9.5),
  'water-electrolysis': row([sp(2, 'H2O', '液')], [sp(2, 'H2', '気'), sp(1, 'O2', '気')], 571.7, { note: '電気で与える' }),
  'fuel-cell': row([sp(2, 'H2', '気'), sp(1, 'O2', '気')], [sp(2, 'H2O', '液')], -571.7),
  'p4-burn': row([sp(1, 'P4', '黄リン'), sp(5, 'O2', '気')], [sp(1, 'P4O10', '固')], -2984.0),
  phosphoric: row([sp(1, 'P4O10', '固'), sp(6, 'H2O', '液')], [sp(4, 'H3PO4', '固')], -417.0),
  'so3-absorb': row([sp(1, 'SO3', '気'), sp(1, 'H2O', '液')], [sp(1, 'H2SO4', '液')], -132.4),
};

const key = (s: Species) => `${s.f}(${s.st})`;
/** ΔfH の表から計算した ΔH（kJ）。表の dH との差は 0.5 以内（検査で確かめる） */
export function dHFromFormation(r: DhRow): number {
  const sum = (list: Species[]) => list.reduce((a, s) => {
    const v = DHF[key(s)];
    if (!v) throw new Error(`ΔfH がない: ${key(s)}`);
    return a + s.n * v.v;
  }, 0);
  return sum(r.rhs) - sum(r.lhs);
}
/** ΔH の出典の鍵：式の物質の ΔfH の出典をまとめたもの（OS のほか、CaCO₃ は ET、NaHCO₃ は WNaHCO3） */
export const dHSources = (r: DhRow): string[] => [...new Set([...r.lhs, ...r.rhs].map((s) => DHF[key(s)]?.src).filter((x): x is string => !!x))];
/** 式の 1 つの物質：「3H₂(気)」「C(黒鉛)」 */
export const speciesText = (s: Species) => `${s.n === 1 ? '' : s.n}${pretty(s.f)}(${s.st})`;
/** 状態つきの式：「N₂(気) + 3H₂(気) → 2NH₃(気)」 */
export const equationText = (r: DhRow) => `${r.lhs.map(speciesText).join(' + ')} → ${r.rhs.map(speciesText).join(' + ')}`;
/** 0.5 は 0 から遠いほうへ丸める（−393.5 → −394） */
const roundAway = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
/**
 * 説明と札に出す ΔH の整数（kJ）。ΔfH から計算した値を丸める（表の 0.1 単位の値を、もう一度丸めない）。
 * 表の値は計算した値を 0.1 単位に丸めたものなので、それをさらに整数に丸めると、ちょうど .5 になった 4 つの行で
 * 本当の値から遠いほうの整数になる：co2-reduce 172.47 → 172（表 172.5）、slaking −64.47 → −64（表 −64.5）、
 * methanol −90.48 → −90（表 −90.5）、hi-decomp 9.478 → 9（表 9.5）。
 * どの行の整数も tests/matter-data.test.ts が決めておく
 */
export const dHInt = (r: DhRow) => roundAway(dHFromFormation(r));
/** 「−92」「572」：負の数は全角のマイナス記号で書き、正の数に + は付けない（教科書の書き方） */
export const dHText = (r: DhRow) => { const v = dHInt(r); return v < 0 ? `−${-v}` : String(v); };
/** 反応の ΔH（表の値、kJ）。数値のない反応は undefined */
export const dHOf = (recipeId: string): number | undefined => (DH[recipeId] && !DH[recipeId].r2 ? DH[recipeId].dH : undefined);
/** その物質を生じる、表の中の最初の反応（反応の一覧にあるもの）。生成物がそれだけの反応を先に選ぶ */
export function dHRowFor(id: string): string | undefined {
  const ids = Object.keys(DH).filter((k) => !DH[k].r2 && recipeById(k) && DH[k].rhs.some((s) => s.f === id));
  return ids.find((k) => DH[k].rhs.length === 1) ?? ids[0];
}
