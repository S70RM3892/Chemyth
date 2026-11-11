import { productsOf, recipeById, type Recipe } from './recipes';
import { hasSub, label, sub } from './substances';

/**
 * 物質の実際の見た目。入試で色を問われるものだけを、教科書の言い方で持つ。
 * ここに無い物質は、色を言わない（「白色」などと勝手に決めない）。絵には、状態ごとの控えめな色を使う。
 * aq：水溶液にしたときの色（固体そのものの色ではない）。
 */
export interface Look { hex: string; word: string; aq?: boolean; metal?: boolean }

const L = (hex: string, word: string, extra: Partial<Look> = {}): Look => ({ hex, word, ...extra });

export const LOOKS: Record<string, Look> = {
  // ---- 有色の気体（気体はふつう無色。色がつくのはこの 4 つ）----
  Cl2: L('#b9cf4a', '黄緑色'),
  NO2: L('#a4532c', '赤褐色'),
  O3: L('#a9cfe8', '淡青色'),
  F2: L('#e6e2a0', '淡黄色'),
  // ---- 液体 ----
  Br2: L('#8a2f1c', '赤褐色'),
  C6H5NO2: L('#e6da8a', '淡黄色'),
  crude: L('#3a2c22', '黒褐色'),
  tar: L('#231d1a', '黒色'),
  heavy: L('#3b2f27', '黒褐色'),
  // ---- 単体 ----
  S: L('#e6cf3a', '黄色'),
  I2: L('#3a2440', '黒紫色'),
  P4: L('#ece3a8', '淡黄色'),
  C: L('#2a2a2c', '黒色'),
  Si: L('#5b6068', '灰黒色', { metal: true }),
  Cu: L('#c8733f', '赤色', { metal: true }),
  Ag: L('#d9dde2', '銀白色', { metal: true }),
  Fe: L('#b8bcc2', '銀白色', { metal: true }),
  Al: L('#d5d8dc', '銀白色', { metal: true }),
  Zn: L('#c2c8cf', '銀白色', { metal: true }),
  Pb: L('#8d949c', '灰色', { metal: true }),
  Sn: L('#cfd3d8', '銀白色', { metal: true }),
  Na: L('#d7dbe0', '銀白色', { metal: true }),
  // ---- 酸化物・硫化物 ----
  CuO: L('#222224', '黒色'),
  Cu2S: L('#26262a', '黒色'),
  Fe2O3: L('#9a3a22', '赤褐色'),
  MnO2: L('#28262a', '黒色'),
  PbO: L('#e2c33a', '黄色'),
  PbO2: L('#5a3a26', '褐色'),
  PbS: L('#222226', '黒色'),
  FeS: L('#26262a', '黒色'),
  ZnS: L('#f3f3ef', '白色'),
  ZnO: L('#f3f3ef', '白色'),
  CuFeS2: L('#b99a3a', '黄金色'),
  // ---- 沈殿になる塩 ----
  AgCl: L('#f4f4f1', '白色'),
  PbSO4: L('#f4f4f1', '白色'),
  CaCO3: L('#f2f1ec', '白色'),
  CaSO4: L('#f2f1ec', '白色'),
  H2SiO3: L('#eef0f0', '白色（ゲル状）'),
  // ---- 系統分離の沈殿 ----
  PbCl2: L('#f4f4f1', '白色'),
  Ag2S: L('#222226', '黒色'),
  CuS: L('#222226', '黒色'),
  'Fe(OH)3': L('#9a4a26', '赤褐色'),
  'Al(OH)3': L('#f2f2ee', '白色'),
  'Pb(OH)2': L('#f2f2ee', '白色'),
  Ag2O: L('#6a4a32', '褐色'),
  'Cu(OH)2': L('#a9cfe2', '青白色'),
  PbCrO4: L('#e8c62a', '黄色'),
  Ag2CrO4: L('#8f3a26', '赤褐色'),
  // ---- 水溶液に色がつくもの（金属イオン・酸化剤）----
  CuSO4: L('#3b82d6', '青色', { aq: true }),
  CuCl2: L('#3aa0c8', '青色', { aq: true }),
  'Cu(NO3)2': L('#3b82d6', '青色', { aq: true }),
  FeSO4: L('#b9d8b0', '淡緑色', { aq: true }),
  FeCl2: L('#b9d8b0', '淡緑色', { aq: true }),
  FeCl3: L('#b98a2c', '黄褐色', { aq: true }),
  KMnO4: L('#8e2a7e', '赤紫色', { aq: true }),
  MnSO4: L('#f0dfe3', 'ほぼ無色（淡桃色）', { aq: true }),
  MnCl2: L('#f0dfe3', 'ほぼ無色（淡桃色）', { aq: true }),
  // ---- 有機 ----
  C6H5N2C6H4OH: L('#d8612a', '橙赤色'),
  // ---- 混合物 ----
  coal: L('#1f1f21', '黒色'),
  bauxite: L('#a2543a', '赤褐色'),
  redmud: L('#8f3a26', '赤褐色'),
  crudeCu: L('#b5693f', '赤色', { metal: true }),
};

/** 炎色反応の色。章を終えたときの花火は、納品所が飲み込んだ元素のこの色で上がる */
export const FLAMES: Record<string, { hex: string; word: string }> = {
  Na: { hex: '#ffd43a', word: '黄色' },
  K: { hex: '#c98bff', word: '赤紫色' },
  Ca: { hex: '#ff7b3a', word: '橙赤色' },
  Ba: { hex: '#b9e24a', word: '黄緑色' },
  Cu: { hex: '#3ad9b4', word: '青緑色' },
};

/** 色を言わない物質の、絵に使う控えめな色 */
const PLAIN = { gas: '#e4ecf1', liquid: '#cfe2ee', solid: '#ecebe6' };

export const lookOf = (id: string): Look | undefined => LOOKS[id];
/** 絵に使う色。見た目の決まっていない物質は、状態ごとの控えめな色 */
export const hexOf = (id: string): string => LOOKS[id]?.hex ?? PLAIN[(hasSub(id) ? sub(id).state : 'liquid') as 'gas' | 'liquid' | 'solid'] ?? PLAIN.liquid;
const STATE_WORD = { gas: '気体', liquid: '液体', solid: '固体' } as const;
/** 「赤褐色の気体」のような言い方。色の決まっていない物質は、状態だけを言う */
export function appearance(id: string): string {
  if (id === 'e' || !hasSub(id)) return '';
  const s = sub(id), l = LOOKS[id];
  const st = STATE_WORD[s.state as keyof typeof STATE_WORD] ?? '';
  if (!l) return st;
  return l.aq ? `水溶液は${l.word}` : `${l.word}の${st}`;
}

/** 条件のうち、熱を加えるもの・光を当てるもの */
const HEAT = /加熱|高温|融解|℃|乾留|アルカリ融解|焙焼/;

/** 装置の絵と、反応の様子の説明に使う、反応の見た目 */
export interface ReactionLook {
  /** 容器の中身の色：反応の前と後。液体や水溶液がなければ気体の色 */
  before: string;
  after: string;
  /** 中身が気体だけか（液面を描かず、もやとして描く） */
  gasPhase: boolean;
  /** 固体どうしを熱する反応か（液面を描かず、粒として描く） */
  dry: boolean;
  /** 生じる気体の色（泡や煙の色）。気体が生じなければ空 */
  gases: string[];
  /** 生じる固体の色（沈殿・析出）。もとから固体だけの反応では空 */
  solids: string[];
  heat: boolean;
  light: boolean;
  cold: boolean;
  /** 装置の札に出す、触媒や条件の短い名前。「なし」や長いものは空 */
  tag: string;
  /** 色のつく物質についての一言（「NO₂：赤褐色の気体」など）。見た目の決まっている物質だけ */
  notes: { id: string; text: string; made: boolean }[];
}

const blend = (cols: string[]): string => {
  if (!cols.length) return PLAIN.liquid;
  let r = 0, g = 0, b = 0;
  for (const c of cols) { r += parseInt(c.slice(1, 3), 16); g += parseInt(c.slice(3, 5), 16); b += parseInt(c.slice(5, 7), 16); }
  const h = (v: number) => Math.round(v / cols.length).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

const cache = new Map<string, ReactionLook>();
export function reactionLook(r: Recipe): ReactionLook {
  const hit = cache.get(r.id);
  if (hit) return hit;
  const ins = r.inputs.map(([s]) => s).filter((s) => s !== 'e' && hasSub(s)), outs = r.outputs.map(([s]) => s).filter((s) => s !== 'e' && hasSub(s));
  const st = (s: string) => sub(s).state;
  const cond = r.accept[0] ?? '', heat = HEAT.test(cond);
  const allGas = [...ins, ...outs].every((s) => st(s) === 'gas');
  // 塩は固体として持っているが、反応は水溶液で起きるものが多い。熱して固体どうしを反応させるもの（乾式）だけ、液を描かない
  const dry = !allGas && heat && !/酸|水|溶液/.test(cond) && !ins.some((s) => st(s) === 'liquid' || LOOKS[s]?.aq);
  const wet = !allGas && !dry;
  // 容器の中身：色のついた気体・液体・水溶液があればその色。なければ、水溶液なら無色の液、乾式なら固体の色
  const body = (ids: string[]) => {
    // 乾式：固体そのものの色（水溶液の色は使わない）。気体だけ：気体の色。水溶液：液体と水溶液の色（気体は泡として出ていく）
    if (dry) { const solid = ids.filter((s) => st(s) === 'solid'); return solid.length ? blend(solid.map((s) => (LOOKS[s] && !LOOKS[s].aq ? LOOKS[s].hex : PLAIN.solid))) : PLAIN.solid; }
    const colored = ids.filter((s) => LOOKS[s] && !LOOKS[s].metal && (allGas ? st(s) === 'gas' : st(s) === 'liquid' || !!LOOKS[s].aq));
    if (colored.length) return blend(colored.map(hexOf));
    return wet ? PLAIN.liquid : PLAIN.gas;
  };
  const look: ReactionLook = {
    before: body(ins), after: body(outs), gasPhase: allGas, dry,
    gases: allGas ? [] : outs.filter((s) => st(s) === 'gas').map(hexOf),
    // 沈殿・析出：水溶液の反応で生じる、色の決まっている固体（溶けない塩・硫化物・単体など）
    solids: wet ? outs.filter((s) => st(s) === 'solid' && LOOKS[s] && !LOOKS[s].aq).map(hexOf) : [],
    heat, light: cond === '光', cold: /氷冷/.test(cond),
    tag: (r.machine === 'reactor' || r.machine === 'separator') && cond !== 'なし' && cond.length <= 9 ? cond : '',
    notes: [...ins.map((s) => ({ id: s, made: false })), ...outs.map((s) => ({ id: s, made: true }))]
      .filter((x, i, a) => LOOKS[x.id] && a.findIndex((y) => y.id === x.id) === i)
      .map((x) => {
        const l = LOOKS[x.id];
        // 水溶液の中で生じる固体は、沈殿（金属なら析出）と言う。乾式の反応では、水溶液の色は言わない
        const text = x.made && wet && st(x.id) === 'solid' && !l.aq ? (l.metal ? `${l.word}の固体が析出する` : `${l.word}の沈殿`) : dry && l.aq ? '' : appearance(x.id);
        return { ...x, text };
      }).filter((x) => x.text),
  };
  cache.set(r.id, look);
  return look;
}
export const reactionLookById = (id: string | undefined): ReactionLook | null => { const r = recipeById(id); return r ? reactionLook(r) : null; };

/** 反応式の文字列。可逆反応は ⇄ で書く。係数を問わない反応（混合物・高分子）は係数を省く */
export function equationOf(r: Recipe): string {
  const side = (list: [string, number][], coef: boolean) => list.map(([id, n]) => (!coef || n === 1 ? '' : n) + label(id)).join(' + ');
  const outs = r.machine === 'battery' ? r.outputs : productsOf(r);
  return `${side(r.inputs, !r.loose)} ${r.shift ? '⇄' : '→'} ${side(outs, !r.loose && !r.mix)}`;
}
