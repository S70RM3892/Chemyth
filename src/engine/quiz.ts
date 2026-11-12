/**
 * 復習の問い。知識の問い（4 択）と、反応の問いを作る。
 * 反応は、毎回すべてを組ませると重いので、1 か所だけを問う：生成物・係数・条件・極（電池と電気分解）。
 * 前回まちがえた反応だけは、設定の画面で、すべてを組み直させる（part = 'full'）。
 *
 * 取り違えやすいものの組（CONFUSABLE）も、ここに置く。組の 1 つを出したら、続けて組の相手を出して見比べさせる。
 */
import { KNOWLEDGE } from '../content/knowledge';
import { CONDITIONS, productsOf, recipeById, RECIPES, type Recipe } from '../content/recipes';
import { MACHINES } from '../content/machines';
import { equationOf } from '../content/looks';
import { label, sub } from '../content/substances';
import { isBalanced } from '../chem/formula';
import { dayKey } from './fsrs';
import type { World } from './world';

export type Part = 'k' | 'products' | 'coef' | 'cond' | 'pole' | 'full';
export interface Quiz { id: string; part: Part; topic: string; q: string; choices: string[]; why: string }

const shuffle = <T>(a: T[], rnd: () => number) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const join = (list: string[]) => list.map(label).join(' + ');
const uniq = (list: string[], not: string) => [...new Set(list)].filter((x) => x !== not && x.trim() !== '');
/** 物質を指すことば（式・名前・別名） */
const wordsOf = (s: string) => { const x = sub(s); return [label(s), x.name, ...(x.aliases ?? [])].filter((t): t is string => !!t); };
/**
 * 反応の名前に、その物質を指すことばが入っているか（名前を見せると答えが分かる）。
 * 原料の名前の一部としてだけ出てくるもの（「硫酸銅(II)水溶液」の「硫酸」や「銅」、「海水」の「水」）は数えない。
 */
export function nameTells(r: Recipe, ids: string[]): boolean {
  const name = r.name, ins = r.inputs.map(([s]) => sub(s).name);
  const at = (w: string) => { const out: number[] = []; for (let i = name.indexOf(w); i >= 0; i = name.indexOf(w, i + 1)) out.push(i); return out; };
  // name の i 文字目からの len 文字が、原料の名前の中に収まっているか
  const inside = (i: number, len: number) => ins.some((n) => at(n).some((j) => j <= i && i + len <= j + n.length));
  return ids.some((s) => wordsOf(s).some((w) => at(w).some((i) => !inside(i, w.length))));
}
/** 生成物の名前のもとになった条件（加硫 → 加硫ゴム）。問いやヒントに出すと、答えが分かる */
export const condsInProducts = (r: Recipe) => r.accept.filter((c) => productsOf(r).some(([s]) => wordsOf(s).some((w) => w.includes(c))));

/** その反応で問えるところ */
export function partsFor(r: Recipe): Part[] {
  const parts: Part[] = [];
  if (!r.mix && productsOf(r).length) parts.push('products');
  if (!r.loose && !r.free && !r.mix && [...r.inputs, ...r.outputs].some(([s, n]) => s !== 'e' && n !== 1)) parts.push('coef');
  if (CONDITIONS[r.machine].options.filter((o) => !r.accept.includes(o)).length >= 3 && r.accept.length && !r.accept.includes('（どれでもよい）')) parts.push('cond');
  if ((r.machine === 'electrolyzer' && (r.poles ?? 'ca').slice(0, productsOf(r).length).includes('a') && productsOf(r).length >= 2) || (r.machine === 'battery' && r.neg && r.pos)) parts.push('pole');
  return parts;
}

/** 係数を 1 つずらした式（原子の数が合わなくなるものだけ） */
function wrongCoefs(r: Recipe, rnd: () => number): string[] {
  const terms = [...r.inputs.map((t, i) => ({ side: 0, i, t })), ...r.outputs.map((t, i) => ({ side: 1, i, t }))].filter(({ t }) => t[0] !== 'e');
  const out = new Set<string>(), right = equationOf(r);
  for (let tries = 0; tries < 40 && out.size < 3; tries++) {
    const pick = terms[Math.floor(rnd() * terms.length)], delta = rnd() < 0.5 ? -1 : 1, n = pick.t[1] + delta;
    if (n < 1) continue;
    const ins = r.inputs.map(([s, k], i) => [s, pick.side === 0 && pick.i === i ? n : k] as [string, number]);
    const outs = r.outputs.map(([s, k], i) => [s, pick.side === 1 && pick.i === i ? n : k] as [string, number]);
    try { if (isBalanced(ins, outs.filter(([s]) => s !== 'e'))) continue; } catch { continue; }
    const eq = equationOf({ ...r, inputs: ins, outputs: outs });
    if (eq !== right) out.add(eq);
  }
  return [...out];
}

/** 反応の問いを 1 つ作る */
export function recipeQuiz(r: Recipe, part: Part, rnd: () => number): Quiz | null {
  const id = `r:${r.id}`, why = r.note, topic = r.source.replace(/^化学(基礎)?：/, '');
  const pick3 = (cands: string[], right: string) => shuffle(uniq(cands, right), rnd).slice(0, 3);
  if (part === 'products') {
    const right = join(productsOf(r).map(([s]) => s));
    // 生成物の名前が条件から来ているとき（加硫 → 加硫ゴム）は、条件を伏せる
    const hide = condsInProducts(r).includes(r.accept[0]);
    // 同じ装置・同じ原料で、問いに出す条件でもできる別の生成物（Al₂O₃ + C の CO と CO₂ など）も正しい（工場の採点 judge と同じ）。まちがいの選択肢には出さない
    const setOf = (x: Recipe) => productsOf(x).map(([s]) => s).sort().join('+'), inKey = (x: Recipe) => x.inputs.map(([s]) => s).sort().join('+');
    const ok = new Set(RECIPES.filter((x) => x.machine === r.machine && inKey(x) === inKey(r) && (hide || x.accept.includes(r.accept[0]))).map(setOf));
    const cands = RECIPES.filter((x) => x !== r && !x.mix && productsOf(x).length && !ok.has(setOf(x)));
    const near = cands.filter((x) => x.machine === r.machine || x.inputs.some(([s]) => r.inputs.some(([t]) => t === s)));
    let wrong = pick3(near.map((x) => join(productsOf(x).map(([s]) => s))), right);
    if (wrong.length < 3) wrong = [...wrong, ...pick3(cands.map((x) => join(productsOf(x).map(([s]) => s))), right)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
    if (wrong.length < 3) return null;
    const cond = hide ? ' ' : `（${CONDITIONS[r.machine].label}：${r.accept[0]}）`;
    return { id, part, topic, q: `${MACHINES[r.machine].name}：${join(r.inputs.map(([s]) => s))}${cond}→ できるものは？`, choices: [right, ...wrong], why };
  }
  if (part === 'coef') {
    const wrong = wrongCoefs(r, rnd);
    if (wrong.length < 3) return null;
    return { id, part, topic, q: `「${r.name}」の、係数の正しい式は？`, choices: [equationOf(r), ...wrong], why };
  }
  if (part === 'cond') {
    const opts = CONDITIONS[r.machine].options.filter((o) => !r.accept.includes(o));
    // 同じ装置の、ほかの反応で使う条件を優先して混ぜる（まぎらわしいものほど効く）
    const used = RECIPES.filter((x) => x.machine === r.machine && x !== r).flatMap((x) => x.accept).filter((o) => opts.includes(o));
    const wrong = [...pick3(used, r.accept[0]), ...pick3(opts, r.accept[0])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
    if (wrong.length < 3) return null;
    // 名前に条件が入っているとき（石炭の乾留・油脂のけん化など）は、名前の代わりに反応式で問う。式にも入っているとき（加硫ゴム）は、原料だけで問う
    const tells = (t: string) => r.accept.some((c) => t.includes(c)), eq = equationOf(r);
    const what = !tells(r.name) ? r.name : !tells(eq) ? eq : `${join(r.inputs.map(([s]) => s))} → ？`;
    return { id, part, topic, q: `「${what}」の${CONDITIONS[r.machine].label}は？`, choices: [r.accept[0], ...wrong], why };
  }
  if (part === 'pole') {
    if (r.machine === 'battery' && r.neg && r.pos) {
      const others = RECIPES.filter((x) => x.machine === 'battery' && x !== r).flatMap((x) => [x.neg, x.pos]).filter((x): x is string => !!x);
      // 正極の物質は、いつも選択肢に入れる（負極と正極の取り違えを問う。鉛蓄電池の「鉛」だけで答えが決まらないように）
      const pos = label(r.pos);
      const wrong = [pos, ...pick3([...others, 'Cu', 'Zn', 'PbO₂', 'O2', 'H2'].map((s) => (s.match(/[₀-₉]/) ? s : label(s))), label(r.neg)).filter((x) => x !== pos)].slice(0, 3);
      if (wrong.length < 3) return null;
      return { id, part, topic, q: `「${r.name}」で、負極で酸化される（電子を出す）のは？`, choices: [label(r.neg), ...wrong], why };
    }
    const ps = productsOf(r), poles = r.poles ?? 'ca';
    const anode = ps.filter((_, i) => poles[i] === 'a').map(([s]) => s), cathode = ps.filter((_, i) => poles[i] === 'c').map(([s]) => s);
    if (!anode.length || !cathode.length) return null;
    const right = join(anode), other = join(cathode);
    // 陰極に生じるものは、いつも選択肢に入れる（陽極と陰極の取り違えを問う）
    const wrong = [other, ...pick3(['O2', 'H2', 'Cl2', 'Cu', 'Na', 'I2', 'Ag', 'NaOH'].filter((s) => !anode.includes(s)).map((s) => label(s)), right).filter((x) => x !== other)].slice(0, 3);
    if (wrong.length < 3) return null;
    // 名前に陽極の生成物が入っているとき（陽極で CO が生じる場合）は、名前の代わりに反応式で問う
    return { id, part, topic, q: `「${nameTells(r, anode) ? equationOf(r) : r.name}」で、陽極に生じるのは？`, choices: [right, ...wrong], why };
  }
  return null;
}

/** id の問いを作る。part を省くと、答えた回数で問うところを順に替える。前回まちがえた反応は 'full'（すべてを組み直す） */
export function quizFor(w: World | null, id: string, rnd: () => number = Math.random, part?: Part): Quiz | null {
  if (id.startsWith('k:')) {
    const k = KNOWLEDGE.find((x) => `k:${x.id}` === id);
    return k ? { id, part: 'k', topic: k.topic, q: k.q, choices: [...k.choices], why: k.why } : null;
  }
  const r = recipeById(id.slice(2));
  if (!r) return null;
  const card = w?.srs[id];
  if (!part && card?.full) return { id, part: 'full', topic: r.source, q: `「${r.name}」を、はじめから組み直す`, choices: [], why: r.note };
  const parts = partsFor(r);
  if (!parts.length) return { id, part: 'full', topic: r.source, q: `「${r.name}」を、はじめから組み直す`, choices: [], why: r.note };
  const order = part ? [part, ...parts.filter((p) => p !== part)] : [...parts.slice((card?.n ?? 0) % parts.length), ...parts.slice(0, (card?.n ?? 0) % parts.length)];
  for (const p of order) { const q = recipeQuiz(r, p, rnd); if (q) return q; }
  return { id, part: 'full', topic: r.source, q: `「${r.name}」を、はじめから組み直す`, choices: [], why: r.note };
}

// ---------------- 取り違えやすいものの組 ----------------
const RAW_GROUPS: { name: string; ids: string[] }[] = [
  { name: '電池（正極・負極）と電気分解（陽極・陰極）', ids: ['r:daniell', 'r:lead-acid', 'r:fuel-cell', 'r:lead-charge', 'r:cuso4-electrolysis', 'r:water-electrolysis', 'k:el-anode', 'k:en-cell'] },
  { name: '水溶液の電気分解で生じるもの', ids: ['r:brine-electrolysis', 'r:cuso4-electrolysis', 'r:agno3-electrolysis', 'r:cucl2-electrolysis', 'r:ki-electrolysis', 'r:water-electrolysis', 'r:molten-nacl'] },
  { name: 'エタノールの脱水（130〜140 ℃ と 160〜170 ℃）', ids: ['r:ether', 'r:ethanol-dehydration'] },
  { name: '硫酸の使い分け（不揮発性・酸化作用・強酸）', ids: ['r:lab-hcl', 'r:hf', 'r:lab-so2', 'r:lab-so2-sulfite', 'r:lab-h2s', 'k:in-h2so4'] },
  { name: '硝酸：濃いと NO₂、薄いと NO', ids: ['r:lab-no', 'r:lab-no2', 'r:ag-hno3'] },
  { name: '気体の製法（弱酸の遊離・揮発性の酸の遊離・酸化還元）', ids: ['r:lab-co2', 'r:lab-h2s', 'r:lab-so2-sulfite', 'r:lab-hcl', 'r:lab-cl2', 'r:lab-o2', 'r:lab-o2b', 'r:lab-h2'] },
  { name: '酸化剤と還元剤（H₂O₂ と SO₂ はどちらにもなる）', ids: ['r:kmno4-h2o2', 'r:h2o2-ki', 'r:kmno4-oxalic', 'r:so2-h2s', 'k:rx-so2', 'k:rx-series'] },
  { name: '銀とクロム酸の沈殿の色', ids: ['k:ppt-agcl', 'k:ppt-agi', 'k:ppt-ag2o', 'k:ppt-ag2cro4', 'k:ppt-pbcro4'] },
  { name: '硫化物の沈殿の色', ids: ['k:ppt-cus', 'k:ppt-zns', 'k:ppt-cds'] },
  { name: '水酸化物の沈殿', ids: ['k:ppt-cuoh2', 'k:ppt-feoh2', 'k:ppt-feoh3', 'k:ppt-aloh3'] },
  { name: '錯イオンの形と色', ids: ['k:cx-ag', 'k:cx-cu', 'k:cx-zn', 'k:cx-fe'] },
  { name: '炎色反応', ids: ['k:flame-li', 'k:flame-sr', 'k:flame-k'] },
  { name: '指示薬の変色域', ids: ['k:ind-pp', 'k:ind-mo', 'k:ind-which', 'k:ion-titr'] },
  { name: '付加重合・縮合重合・開環重合', ids: ['r:polyethylene', 'r:pvc', 'r:polystyrene', 'r:pet', 'r:nylon66', 'r:nylon6', 'r:phenol-resin', 'r:urea-resin'] },
  { name: '糖の加水分解（酵素と生成物）', ids: ['r:starch-hydrolysis', 'r:maltose-hydrolysis', 'r:inversion', 'r:cellulase', 'k:pl-lactose'] },
  { name: 'アセチレンへの付加', ids: ['r:vinyl-chloride', 'r:acetylene-hydration', 'r:vinyl-acetate', 'r:trimerization', 'r:acrylonitrile'] },
  { name: 'フェノールの作り方', ids: ['r:cumene', 'r:cumene-phenol', 'r:alkali-fusion', 'r:sulfonation', 'r:sulfonate'] },
  { name: '弱い酸の遊離（フェノール・サリチル酸・安息香酸）', ids: ['r:phenol-release', 'r:phenol-release-hcl', 'r:salicylic-acid', 'r:salicylic-acid-hcl', 'r:benzoic-release', 'r:benzoate'] },
  { name: '有機の検出反応', ids: ['k:org-fehling', 'k:org-iodine', 'k:org-ninhydrin', 'k:org-bleach'] },
  { name: '金属の製錬（還元のしかた）', ids: ['r:blast-furnace', 'r:zinc-reduce', 'r:thermite', 'r:hall-heroult', 'r:copper-converter'] },
  { name: '両性金属', ids: ['r:al-naoh', 'r:zn-naoh', 'k:ppt-aloh3'] },
  { name: '工業的製法の触媒', ids: ['r:contact', 'r:ostwald-1', 'r:haber-bosch', 'r:methanol', 'r:hydrogenation'] },
  { name: '化学結合の種類', ids: ['k:bd-ionic', 'k:bd-coord', 'k:bd-polar', 'k:bd-hbond', 'k:bd-metal'] },
  { name: '平衡の移動', ids: ['k:eq-const', 'k:eq-inert', 'k:eq-solid', 'k:eq-haber'] },
  { name: '電離平衡', ids: ['k:ion-buffer', 'k:ion-common', 'k:ion-salt', 'k:ion-kw'] },
];
const exists = (id: string) => (id.startsWith('k:') ? KNOWLEDGE.some((k) => `k:${k.id}` === id) : !!recipeById(id.slice(2)));
/** 実在する問いだけを残した組 */
export const CONFUSABLE = RAW_GROUPS.map((g) => ({ name: g.name, ids: g.ids.filter(exists) })).filter((g) => g.ids.length >= 2);
export const groupsOf = (id: string) => CONFUSABLE.filter((g) => g.ids.includes(id));

/** 出題の単元（同じ単元が続かないように並べる） */
export const topicOf = (id: string) => (id.startsWith('k:') ? KNOWLEDGE.find((k) => `k:${k.id}` === id)?.topic ?? '' : recipeById(id.slice(2))?.source ?? '');

/**
 * 組の相手のうち、いま見比べる価値があるもの：もう覚えたことがあり（復習の予定がある）、
 * 定着しきっていない（安定度 10 日未満）か、3 日以内に期限が来るもの。直前に出したものは除く。
 */
export function partnerOf(w: World, id: string, now: number, recent: string[]): string | null {
  for (const g of groupsOf(id)) {
    const cands = g.ids.filter((x) => x !== id && !recent.includes(x) && w.srs[x] && (w.srs[x].s < 10 || w.srs[x].due - now < 3 * 86400000));
    if (cands.length) return cands.sort((a, b) => w.srs[a].due - w.srs[b].due)[0];
  }
  return null;
}

/**
 * 復習の順番を作る：まず今日まちがえて戻ってきたもの、次に期限の来たもの（古い順）。
 * 組のあるものは、相手をすぐ後ろに置いて見比べさせる。それ以外は、同じ単元が続かないように混ぜる。
 */
export function buildQueue(w: World, now: number, max: number, relearn: string[]): string[] {
  const due = Object.keys(w.srs).filter((k) => w.srs[k].due <= now && exists(k)).sort((a, b) => w.srs[a].due - w.srs[b].due);
  const pool = [...relearn.filter(exists), ...due.filter((x) => !relearn.includes(x))];
  const out: string[] = [];
  let lastTopic = '';
  while (out.length < max && pool.length) {
    // 前と同じ単元でないもののうち、いちばん先のもの（なければ先頭）
    let i = pool.findIndex((x) => topicOf(x) !== lastTopic);
    if (i < 0) i = 0;
    const id = pool.splice(i, 1)[0];
    out.push(id); lastTopic = topicOf(id);
    if (out.length >= max) break;
    const p = partnerOf(w, id, now, out);
    if (p) { const j = pool.indexOf(p); if (j >= 0) pool.splice(j, 1); out.push(p); lastTopic = topicOf(p); }
  }
  return out;
}

/** 今日はじめて覚えたもの（今夜の 10 問に入れる） */
export function learnedToday(w: World, now: number): string[] {
  const today = dayKey(now);
  return Object.keys(w.srs).filter((k) => exists(k) && w.srs[k].t0 !== undefined && dayKey(w.srs[k].t0!) === today);
}
