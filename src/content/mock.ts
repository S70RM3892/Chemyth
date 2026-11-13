import { parseFormula } from '../chem/formula';
import { LOOKS, equationOf, reactionLook } from './looks';
import { CONDITIONS, SHIFTS, electronsOf, recipeById, type Recipe } from './recipes';
import { hasSub, label, sub } from './substances';

/**
 * 自分の工場から作る模試。
 * 工場で動いている反応を並べたものをリード文にして、京大の大問のように、
 * 反応式・量的関係・質量や体積の計算・条件・色・平衡を、小問で問う。
 * 数値は、工場の台数や seed から決まるので、開くたびに変わる。
 */
export interface MockQ {
  kind: 'num' | 'choice';
  /** どの反応についての問いか（間違いの記録に使う） */
  recipe: string;
  topic: string;
  text: string;
  answer: number | string;
  unit?: string;
  choices?: string[];
  how: string;
}
export interface Mock { lead: string[]; qs: MockQ[] }
export interface MockSource { id: string; count: number }

/** 計算に使う原子量（問題文に必ず示す） */
export const MASS: Record<string, number> = { H: 1.0, C: 12, N: 14, O: 16, F: 19, Na: 23, Mg: 24, Al: 27, Si: 28, P: 31, S: 32, Cl: 35.5, K: 39, Ca: 40, Cr: 52, Mn: 55, Fe: 56, Cu: 63.5, Zn: 65, Br: 80, Ag: 108, Sn: 119, I: 127, Ba: 137, Pb: 207 };
export function molarMass(id: string): number | null {
  if (!hasSub(id)) return null;
  const f = sub(id).formula;
  if (!f) return null;
  let m = 0;
  for (const [el, n] of Object.entries(parseFormula(f))) { if (MASS[el] === undefined) return null; m += MASS[el] * n; }
  return m;
}
const massNote = (ids: string[]) => {
  const els = new Set<string>();
  for (const id of ids) for (const el of Object.keys(parseFormula(sub(id).formula!))) els.add(el);
  return [...els].map((el) => `${el} = ${MASS[el]}`).join('、');
};
/** 有効数字 3 桁に丸める */
export const sig3 = (x: number) => Number(x.toPrecision(3));
/** 数値の答え合わせ：有効数字 2 桁が合っていればよい（相対誤差 2 % まで） */
export const numOk = (q: MockQ, x: number) => typeof q.answer === 'number' && (q.answer === 0 ? x === 0 : Math.abs(x - q.answer) / Math.abs(q.answer) <= 0.02);

const rng = (seed: number) => { let a = (seed >>> 0) || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
const CIRC = ['①', '②', '③', '④'];

/** 1 つの反応から作れる小問をすべて作る */
export function questionsFor(r: Recipe, tag: string, count: number, rnd: () => number): MockQ[] {
  const qs: MockQ[] = [], pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const shuffle = <T>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const ins = r.inputs.filter(([s]) => s !== 'e'), outs = r.outputs.filter(([s]) => s !== 'e');
  const exact = !r.loose && !r.mix && !r.free, eq = equationOf(r);

  // 係数：いちばん大きい係数を伏せる
  if (exact) {
    const all = [...ins.map(([s, n]) => ({ s, n, left: true })), ...outs.map(([s, n]) => ({ s, n, left: false }))].filter((x) => x.n > 1);
    if (all.length) {
      const t = all.reduce((a, b) => (b.n > a.n ? b : a));
      const side = (list: [string, number][], left: boolean) => list.map(([s, n]) => (s === t.s && left === t.left ? 'x ' : n === 1 ? '' : String(n)) + label(s)).join(' + ');
      qs.push({ kind: 'num', recipe: r.id, topic: '反応式', text: `反応${tag}の反応式 ${side(r.inputs, true)} ${r.shift ? '⇄' : '→'} ${side(r.outputs.filter(([s]) => s !== 'e'), false)} の係数 x を答えよ。`, answer: t.n, how: `${eq}。両辺の原子の数を元素ごとに数えて合わせる。` });
    }
  }
  // 量的関係：台数に応じた個数で
  if (exact && ins.length && outs.length) {
    const [a, ca] = pick(ins), [b, cb] = pick(outs), k = 6 * Math.max(1, Math.min(count, 5)) + Math.floor(rnd() * 4);
    qs.push({ kind: 'num', recipe: r.id, topic: '量的関係', unit: '個', text: `反応${tag}の装置 ${count} 台が、1 分間に ${label(a)} を合わせて ${ca * k} 個使った。この 1 分間にできる ${label(b)} は何個か。`, answer: cb * k, how: `${eq}。${label(a)} ${ca} 個につき ${label(b)} が ${cb} 個できるので、${ca * k} ÷ ${ca} × ${cb} = ${cb * k} 個。` });
  }
  // 質量・体積の計算
  if (exact) {
    const withMass = (list: [string, number][]) => list.filter(([s]) => molarMass(s) !== null);
    const A = withMass(ins), B = withMass(outs);
    if (A.length && B.length) {
      const [a, ca] = pick(A), [b, cb] = pick(B), f = pick([0.25, 0.5, 1, 2]), ma = molarMass(a)!, mb = molarMass(b)!;
      const gram = sig3(ma * ca * f), gas = sub(b).state === 'gas';
      if (gas) qs.push({ kind: 'num', recipe: r.id, topic: '気体の体積', unit: 'L', text: `反応${tag}で、${label(a)} ${gram} g を完全に反応させた。生じる ${label(b)} は、標準状態（0 ℃、1.013×10⁵ Pa）で何 L か。原子量は ${massNote([a])}、標準状態の気体のモル体積は 22.4 L/mol とする。`, answer: sig3(cb * f * 22.4),
        how: `${label(a)} のモル質量は ${ma} g/mol なので ${gram} ÷ ${ma} = ${sig3(ca * f)} mol。${eq} より ${label(b)} は ${sig3(cb * f)} mol、体積は ${sig3(cb * f)} × 22.4 = ${sig3(cb * f * 22.4)} L。` });
      else qs.push({ kind: 'num', recipe: r.id, topic: '質量の計算', unit: 'g', text: `反応${tag}で、${label(a)} ${gram} g を完全に反応させた。生じる ${label(b)} は何 g か。原子量は ${massNote([a, b])} とする。`, answer: sig3(mb * cb * f),
        how: `${label(a)} は ${gram} ÷ ${ma} = ${sig3(ca * f)} mol。${eq} より ${label(b)} は ${sig3(cb * f)} mol で、モル質量 ${mb} g/mol をかけて ${sig3(mb * cb * f)} g。` });
    }
  }
  // 条件・触媒
  const cond = r.accept[0], others = CONDITIONS[r.machine].options.filter((o) => !r.accept.includes(o));
  if (cond && cond !== 'なし' && others.length >= 3) {
    qs.push({ kind: 'choice', recipe: r.id, topic: CONDITIONS[r.machine].label, text: `反応${tag}（${r.name}）に必要な${CONDITIONS[r.machine].label}を選べ。`, answer: cond, choices: shuffle([cond, ...shuffle(others).slice(0, 3)]), how: r.note });
  }
  // 色
  const noted = reactionLook(r).notes.filter((n) => LOOKS[n.id] && /色/.test(LOOKS[n.id].word));
  if (noted.length) {
    // 溶けて色を見せる物質（I₂ は水溶液中で I₃⁻ の褐色）と、熱した気体の中の蒸気（I₂ は紫色）は、その場面の色を問う（固体の色を答えにしない）
    const n = pick(noted), l = LOOKS[n.id], form = n.form ? l[n.form] : undefined, word = form ? form.word : l.word;
    const pool = [...new Set(Object.values(LOOKS).map((x) => x.word))].filter((x) => x !== word && !x.includes('（'));
    const where = n.form === 'sol' ? 'が水溶液中で示す' : n.form === 'vap' ? 'の気体の' : l.aq ? 'の水溶液の' : 'の';
    qs.push({ kind: 'choice', recipe: r.id, topic: '色', text: `反応${tag}に出てくる ${label(n.id)} ${where}色を選べ。`, answer: word, choices: shuffle([word, ...shuffle(pool).slice(0, 3)]), how: `${label(n.id)}：${n.text}。` });
  }
  // 平衡
  if (r.shift) qs.push({ kind: 'choice', recipe: r.id, topic: '化学平衡', text: `反応${tag}は可逆反応である。平衡を生成物側へ動かすのに有利な条件を選べ。`, answer: r.shift, choices: shuffle([...SHIFTS]), how: `${r.note}` });
  // 電池の電子
  const neg = r.machine === 'battery' ? r.inputs.find(([s]) => s === r.neg) : undefined;
  if (neg) qs.push({ kind: 'num', recipe: r.id, topic: '電池', unit: 'mol', text: `反応${tag}の電池で、負極の ${label(neg[0])} が ${neg[1]} mol 反応した。このとき導線を流れた電子は何 mol か。`, answer: electronsOf(r), how: r.note });
  return qs;
}

/** 工場の反応から、大問を 1 題作る。sources は、工場にある反応と台数 */
export function makeMock(sources: MockSource[], seed: number): Mock | null {
  const rnd = rng(seed);
  const list = sources.map((s) => ({ ...s, r: recipeById(s.id) })).filter((s): s is MockSource & { r: Recipe } => !!s.r);
  if (!list.length) return null;
  // つながっている反応（ある反応の生成物が、別の反応の原料）を優先して 3 つまで選ぶ
  const feeds = (a: Recipe, b: Recipe) => a.outputs.some(([s]) => s !== 'e' && b.inputs.some(([x]) => x === s));
  const score = (x: { r: Recipe; count: number }) => list.filter((y) => y.r !== x.r && (feeds(x.r, y.r) || feeds(y.r, x.r))).length * 10 + x.count + rnd();
  const chosen = [...list].sort((a, b) => score(b) - score(a)).slice(0, 3);
  // 工程の順に並べる（原料に近いものが先）
  chosen.sort((a, b) => (feeds(a.r, b.r) ? -1 : feeds(b.r, a.r) ? 1 : 0));
  const lead = chosen.map((c, i) => `反応${CIRC[i]}　${c.r.name}（装置 ${c.count} 台）`);
  const links: string[] = [];
  chosen.forEach((a, i) => chosen.forEach((b, j) => { if (i !== j && feeds(a.r, b.r)) links.push(`反応${CIRC[i]}でできた ${a.r.outputs.filter(([s]) => s !== 'e' && b.r.inputs.some(([x]) => x === s)).map(([s]) => label(s)).join('・')} は、反応${CIRC[j]}の原料になる。`); }));
  // 反応ごとに 2〜3 問。種類が偏らないように、問いの種類を回す
  const qs: MockQ[] = [], per = chosen.length === 1 ? 5 : chosen.length === 2 ? 3 : 3;
  chosen.forEach((c, i) => {
    const all = questionsFor(c.r, CIRC[i], c.count, rnd), seen = new Set<string>(), mine: MockQ[] = [];
    // 計算を先に、同じ種類は 1 問まで
    for (const q of [...all.filter((x) => x.kind === 'num'), ...all.filter((x) => x.kind === 'choice')]) { if (seen.has(q.topic) || mine.length >= per) continue; seen.add(q.topic); mine.push(q); }
    qs.push(...mine);
  });
  return { lead: [...lead, ...links], qs: qs.slice(0, 8) };
}
