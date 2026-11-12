/**
 * 生産の流れ：指令の物質から、原料（資源地で採るもの・試薬棚の試薬・分ける装置で取り出すもの）までを、反応の木としてたどる。
 * 反応の選び方：工場にある反応（その反応を設定した装置がある）→ 覚えた反応 → 原料にいちばん近い反応、の順。
 * 反応そのもの（原料と生成物）は、内容データ（src/content/recipes.ts）をそのまま使う。
 */
import { ORG_MIXES, extractReachable } from '../content/extract';
import { MIXES, reachableFrom } from '../content/ions';
import { LAND, ZONES, resourceAt } from '../content/map';
import { MACHINES } from '../content/machines';
import { AMINO_MIXES, migrateReachable } from '../content/phoresis';
import { RECIPES, type Recipe } from '../content/recipes';
import { REAGENTS, SETS } from '../content/samples';
import { isSep, type SepKind } from '../content/sep';
import { isMachine, toolUnlocked, type Ent, type World } from './world';

/** recipe：反応で作る。raw：資源地で採る。reagent：試薬棚から出す（試料の組を含む）。sep：分ける装置で混合物から取り出す。
 *  loop：同じ木の上のほうで作ったものを戻して使う（鉛蓄電池の充電など）。deep：深すぎるので、ここで打ち切った */
export type ChainKind = 'recipe' | 'raw' | 'reagent' | 'sep' | 'loop' | 'deep';
export interface ChainNode {
  s: string;
  kind: ChainKind;
  /** 選んだ反応と、ほかの作り方の数 */
  recipe?: Recipe;
  alt?: number;
  /** 工場にあるか：反応はその反応を設定した装置、採るものは採取機、試薬は試薬棚、分けるものは分ける装置 */
  have: boolean;
  /** 工場の中で、それを担っている設備（地図で移るのに使う） */
  at?: Ent;
  /** raw：採れる場所の名前。reagent：試料の組の名前（試料のとき） */
  where?: string;
  sepKind?: SepKind;
  inputs: ChainNode[];
}

/** 採れるもの → 採れる場所の名前 */
let RAW: Map<string, string[]> | null = null;
const raw = () => {
  if (RAW) return RAW;
  RAW = new Map([[LAND.resource, [LAND.name]]]);
  for (const z of Object.values(ZONES)) { const l = RAW.get(z.resource) ?? []; if (!l.includes(z.name)) l.push(z.name); RAW.set(z.resource, l); }
  return RAW;
};
/** 分ける装置で、試薬棚の混合物から取り出せるもの → 装置の種類 */
let SEPS: Map<string, SepKind> | null = null;
const seps = () => {
  if (SEPS) return SEPS;
  SEPS = new Map();
  for (const m of MIXES) for (const x of reachableFrom(m.id)) if (!SEPS.has(x)) SEPS.set(x, 'settler');
  for (const m of ORG_MIXES) for (const x of extractReachable(m.id)) if (!SEPS.has(x)) SEPS.set(x, 'funnel');
  for (const m of AMINO_MIXES) for (const x of migrateReachable(m.id)) if (!SEPS.has(x)) SEPS.set(x, 'phoresis');
  return SEPS;
};
const sampleSet = (s: string) => SETS.find((x) => x.members.includes(s));

/** 原料からの段数（原料 0）。lab：試薬棚と分ける装置も原料に数えるか */
const DEPTH = new Map<boolean, Map<string, number>>();
function depths(lab: boolean): Map<string, number> {
  const hit = DEPTH.get(lab);
  if (hit) return hit;
  const d = new Map<string, number>();
  for (const s of raw().keys()) d.set(s, 0);
  if (lab) for (const s of [...REAGENTS, ...SETS.flatMap((x) => x.members), ...seps().keys()]) d.set(s, 0);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of RECIPES) {
      let m = 0;
      if (!r.inputs.every(([s]) => { const v = d.get(s); if (v === undefined) return false; m = Math.max(m, v); return true; })) continue;
      for (const [s] of r.outputs) { const v = d.get(s); if (v === undefined || v > m + 1) { d.set(s, m + 1); grew = true; } }
    }
  }
  DEPTH.set(lab, d);
  return d;
}

/** 工場にあるもの：反応ごと・採るものごと・試薬ごと・分ける装置の種類ごとに、最初に見つけた設備 */
function inventory(w: World) {
  const recipe = new Map<string, Ent>(), rawAt = new Map<string, Ent>(), reagent = new Map<string, Ent>(), sep = new Map<string, Ent>();
  for (const e of w.ents.values()) {
    if (isMachine(e.kind) && e.recipe) { if (!recipe.has(e.recipe)) recipe.set(e.recipe, e); }
    else if (e.kind === 'extractor') { const s = resourceAt(e.x, e.y); if (!rawAt.has(s)) rawAt.set(s, e); }
    else if (e.kind === 'sampler' && e.sub) {
      const set = e.sub.startsWith('set:') ? SETS.find((x) => x.id === e.sub!.slice(4)) : undefined;
      for (const s of set ? set.members : [e.sub]) if (!reagent.has(s)) reagent.set(s, e);
    } else if (isSep(e.kind) && !sep.has(e.kind)) sep.set(e.kind, e);
  }
  return { recipe, rawAt, reagent, sep };
}

/** s を作る流れの木。maxDepth より深い所と、節が多すぎる所は打ち切る */
export function chainOf(w: World, s: string, maxDepth = 9): ChainNode {
  const inv = inventory(w), lab = toolUnlocked(w, MACHINES.sampler);
  let budget = 90;
  const cost = (d: Map<string, number>, r: Recipe) => r.inputs.reduce((m, [x]) => Math.max(m, d.get(x) ?? Infinity), 0) + 1;
  const pick = (cands: Recipe[]): Recipe | undefined => {
    for (const d of lab ? [depths(true)] : [depths(false), depths(true)]) {
      const ok = cands.filter((r) => isFinite(cost(d, r)));
      if (!ok.length) continue;
      // 工場にある → 覚えた → 原料に近い → 内容データの順
      const rank = (r: Recipe) => (inv.recipe.has(r.id) ? 0 : w.learned.includes(r.id) ? 1 : 2);
      return ok.sort((a, b) => rank(a) - rank(b) || cost(d, a) - cost(d, b) || RECIPES.indexOf(a) - RECIPES.indexOf(b))[0];
    }
    return undefined;
  };
  const leaf = (s: string, top: boolean): ChainNode | null => {
    const where = raw().get(s);
    if (where) return { s, kind: 'raw', have: inv.rawAt.has(s), at: inv.rawAt.get(s), where: where.join('・'), inputs: [] };
    const set = sampleSet(s);
    if (set) return { s, kind: 'reagent', have: inv.reagent.has(s), at: inv.reagent.get(s), where: set.name, inputs: [] };
    // 試薬棚から出したものを、そのまま納めても指令には数えない。いちばん上（指令の物質）は試薬にしない
    if (!top && lab && REAGENTS.includes(s)) return { s, kind: 'reagent', have: inv.reagent.has(s), at: inv.reagent.get(s), inputs: [] };
    return null;
  };
  const make = (s: string, path: Set<string>, depth: number, top: boolean): ChainNode => {
    budget--;
    if (path.has(s)) return { s, kind: 'loop', have: true, inputs: [] };
    const cands = RECIPES.filter((r) => r.outputs.some(([x]) => x === s));
    const here = cands.filter((r) => inv.recipe.has(r.id));
    // 工場で作っていなければ、採るもの・試料・試薬はそこで止める
    if (!here.length) { const l = leaf(s, top); if (l) return l; }
    const r = here.length ? pick(here) ?? here[0] : pick(cands);
    if (!r) {
      const sk = seps().get(s);
      if (sk) return { s, kind: 'sep', sepKind: sk, have: inv.sep.has(sk), at: inv.sep.get(sk), inputs: [] };
      return { s, kind: 'reagent', have: inv.reagent.has(s), at: inv.reagent.get(s), inputs: [] };
    }
    const base = { s, recipe: r, alt: cands.length - 1, have: inv.recipe.has(r.id), at: inv.recipe.get(r.id) };
    if (depth >= maxDepth || budget <= 0) return { ...base, kind: 'deep', inputs: [] };
    const next = new Set(path).add(s);
    return { ...base, kind: 'recipe', inputs: r.inputs.map(([x]) => make(x, next, depth + 1, false)) };
  };
  return make(s, new Set(), 0, true);
}

/** 木の中の、工場にない工程（反応と採取）の数と、全体の数 */
export function chainGaps(n: ChainNode): { miss: number; all: number } {
  const own = n.kind === 'recipe' || n.kind === 'deep' || n.kind === 'raw' || n.kind === 'reagent' || n.kind === 'sep' ? 1 : 0;
  return n.inputs.reduce((a, c) => { const x = chainGaps(c); return { miss: a.miss + x.miss, all: a.all + x.all }; }, { miss: own && !n.have ? 1 : 0, all: own });
}
