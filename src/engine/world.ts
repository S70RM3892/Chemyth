import { recipeById, RECIPES, CONDITIONS, type MachineKind, type Recipe } from '../content/recipes';
import { GOALS, HUB_TILES, MAP_H, MAP_W, ZONES, zoneAt } from '../content/map';
import { subByFormula } from '../content/substances';

/** 0:右 1:下 2:左 3:上 */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export type Kind = 'belt' | 'extractor' | 'vent' | 'hub' | MachineKind;

export interface Ent {
  kind: Kind;
  x: number;
  y: number;
  dir: Dir;
  /** ベルト上の物質。p は 0〜1 の進み具合、m は最後に動いた tick */
  item?: { s: string; p: number; m: number } | null;
  recipe?: string;
  /** 出口ごとの物質。0:正面 1:右手 2:左手 */
  outOrder?: string[];
  inBuf?: Record<string, number>;
  outBuf?: number[];
  busy?: boolean;
  prog?: number;
  timer?: number;
}

export interface Mistake {
  /** どの装置で間違えたか */
  machine: MachineKind;
  /** 特定できた場合の反応 */
  recipe: string | null;
  part: 'reactants' | 'products' | 'electrodes' | 'coefficients' | 'condition' | 'revealed';
  t: number;
}

export interface World {
  ents: Map<string, Ent>;
  goal: number;
  count: number;
  delivered: Record<string, number>;
  discovered: string[];
  mistakes: Mistake[];
  tick: number;
  /** UI に知らせる出来事。保存しない */
  events: string[];
  /** 画面効果のきっかけ。保存しない */
  fx: { x: number; y: number; type: 'react' | 'deliver'; s: string }[];
}

export const BELT_SPEED = 2;
export const EXTRACT_INTERVAL = 1;

export const key = (x: number, y: number) => `${x},${y}`;
export const isMachine = (k: Kind): k is MachineKind => k === 'separator' || k === 'electrolyzer' || k === 'reactor';

export function newWorld(): World {
  const w: World = {
    ents: new Map(), goal: 0, count: 0, delivered: {},
    discovered: Object.values(ZONES).map((z) => z.resource),
    mistakes: [], tick: 0, events: [], fx: [],
  };
  for (const [x, y] of HUB_TILES) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
  return w;
}

export function at(w: World, x: number, y: number): Ent | undefined {
  return w.ents.get(key(x, y));
}

/** 置けない理由を返す。置けたら null */
export function place(w: World, kind: Kind, x: number, y: number, dir: Dir): string | null {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '地図の外だ';
  if (at(w, x, y)) return 'そこはもう埋まっている';
  if (kind === 'extractor' && !zoneAt(x, y)) return '採取機は資源地にしか置けない。点のついた場所を選べ';
  const e: Ent = { kind, x, y, dir };
  if (kind === 'belt') e.item = null;
  if (kind === 'extractor') e.timer = 0;
  w.ents.set(key(x, y), e);
  return null;
}

export function remove(w: World, x: number, y: number): boolean {
  const e = at(w, x, y);
  if (!e || e.kind === 'hub') return false;
  w.ents.delete(key(x, y));
  return true;
}

export function clearRecipe(e: Ent) {
  e.recipe = undefined; e.outOrder = undefined; e.inBuf = undefined; e.outBuf = undefined; e.busy = false; e.prog = 0;
}

export interface Answer {
  /** [物質id, 係数] */
  reactants: [string, number][];
  /** [入力された化学式, 係数]。電解槽では [陰極, 陽極] */
  products: [string, number][];
  condition: string;
}

export type Verdict = { ok: true; recipe: Recipe } | { ok: false; part: Mistake['part']; message: string; recipe: Recipe | null };

/** プレイヤーの設定を採点する。副作用なし */
export function judge(machine: MachineKind, a: Answer): Verdict {
  const ids = a.reactants.map(([s]) => s).sort().join('+');
  const r = RECIPES.find((c) => c.machine === machine && c.inputs.map(([s]) => s).sort().join('+') === ids);
  if (!r) return { ok: false, part: 'reactants', recipe: null, message: 'この装置では、その原料の組み合わせから何も作れない。' };

  const got = a.products.map(([f, n]) => [subByFormula(f)?.id ?? null, n] as [string | null, number]);
  const want = r.outputs.map(([s]) => s);
  const sameSet = got.length === want.length && want.every((s) => got.some(([g]) => g === s));
  if (!sameSet) return { ok: false, part: 'products', recipe: r, message: '生成物が違う。数も種類もよく考えろ。' };
  if (machine === 'electrolyzer' && got.some(([g], i) => g !== want[i])) {
    return { ok: false, part: 'electrodes', recipe: r, message: '陰極と陽極が逆だ。陰極は還元、陽極は酸化が起きる。' };
  }
  if (!r.separation) {
    const okIn = r.inputs.every(([s, n]) => a.reactants.find(([x]) => x === s)?.[1] === n);
    const okOut = r.outputs.every(([s, n]) => got.find(([g]) => g === s)?.[1] === n);
    if (!okIn || !okOut) return { ok: false, part: 'coefficients', recipe: r, message: '係数が違う。両辺の原子の数を数えろ。最も簡単な整数比で書け。' };
  }
  if (!r.accept.includes(a.condition)) {
    return { ok: false, part: 'condition', recipe: r, message: `${CONDITIONS[machine].label}が違う。` };
  }
  return { ok: true, recipe: r };
}

/** 採点に通った設定を装置に書き込む。order はプレイヤーが書いた生成物の順（＝出口の順） */
export function configure(e: Ent, r: Recipe, order: string[]) {
  e.recipe = r.id;
  e.outOrder = order;
  e.inBuf = {};
  e.outBuf = order.map(() => 0);
  e.busy = false;
  e.prog = 0;
}

export function portDir(dir: Dir, port: number): Dir {
  return ((dir + [0, 1, 3][port]) % 4) as Dir;
}

/** (x,y) へ流れ込んでくるものがあれば、その進行方向を返す。prefer の向きを優先する */
export function inflow(w: World, x: number, y: number, prefer?: Dir): Dir | null {
  const order: Dir[] = prefer === undefined ? [0, 1, 2, 3] : [prefer, ((prefer + 1) % 4) as Dir, ((prefer + 3) % 4) as Dir];
  for (const d of order) {
    const n = at(w, x - DX[d], y - DY[d]);
    if (!n) continue;
    if ((n.kind === 'belt' || n.kind === 'extractor') && n.dir === d) return d;
    if (n.outOrder && n.outOrder.some((_, i) => portDir(n.dir, i) === d)) return d;
  }
  return null;
}

/** 置くときの向きを決める。流れ込みがあればその向き、なければ納品所の方角 */
export function autoDir(w: World, kind: Kind, x: number, y: number): Dir {
  if (kind === 'extractor') {
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const n = at(w, x + DX[d], y + DY[d]);
      if (n && n.kind !== 'extractor' && n.kind !== 'hub' && !(n.kind === 'belt' && n.dir === (d + 2) % 4)) return d;
    }
  } else {
    const d = inflow(w, x, y);
    if (d !== null) return d;
  }
  const [hx, hy] = HUB_TILES[0];
  const dx = hx + 1 - (x + 0.5), dy = hy + 1 - (y + 0.5);
  return (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3) as Dir;
}

function discover(w: World, s: string) {
  if (!w.discovered.includes(s)) w.discovered.push(s);
}

function deliver(w: World, s: string, x: number, y: number) {
  w.fx.push({ x, y, type: 'deliver', s });
  w.delivered[s] = (w.delivered[s] || 0) + 1;
  const g = GOALS[w.goal];
  if (!g || g.s !== s) return;
  w.count++;
  if (w.count >= g.n) {
    w.goal++;
    w.count = 0;
    w.events.push(w.goal >= GOALS.length ? 'all-done' : 'goal-done');
  }
}

/** (x,y) のマスへ、向き d で物質 s を押し込む */
function push(w: World, x: number, y: number, d: Dir, s: string): boolean {
  const t = at(w, x, y);
  if (!t) return false;
  switch (t.kind) {
    case 'belt':
      if (t.item || t.dir === (d + 2) % 4) return false;
      t.item = { s, p: 0, m: w.tick };
      return true;
    case 'hub':
      deliver(w, s, x, y);
      return true;
    case 'vent':
      return true;
    case 'extractor':
      return false;
    default: {
      const r = recipeById(t.recipe);
      if (!r || !t.inBuf) return false;
      const need = r.inputs.find(([id]) => id === s)?.[1];
      if (!need) return false;
      if ((t.inBuf[s] || 0) >= need * 2) return false;
      t.inBuf[s] = (t.inBuf[s] || 0) + 1;
      return true;
    }
  }
}

export function step(w: World, dt: number) {
  w.tick++;
  for (const e of w.ents.values()) {
    if (e.kind === 'belt') {
      const it = e.item;
      if (!it) continue;
      it.p = Math.min(1, it.p + BELT_SPEED * dt);
      if (it.p >= 1 && it.m !== w.tick && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, it.s)) e.item = null;
    } else if (e.kind === 'extractor') {
      const z = zoneAt(e.x, e.y);
      if (!z) continue;
      e.timer = (e.timer || 0) + dt;
      if (e.timer >= EXTRACT_INTERVAL && push(w, e.x + DX[e.dir], e.y + DY[e.dir], e.dir, ZONES[z].resource)) e.timer = 0;
    } else if (isMachine(e.kind)) {
      const r = recipeById(e.recipe);
      if (!r || !e.inBuf || !e.outBuf || !e.outOrder) continue;
      if (!e.busy) {
        // 出口が全部はけるまで次の反応は始まらない（副生成物を放置すると詰まる）
        if (e.outBuf.every((n) => n === 0) && r.inputs.every(([s, n]) => (e.inBuf![s] || 0) >= n)) {
          for (const [s, n] of r.inputs) e.inBuf[s] -= n;
          e.busy = true;
          e.prog = 0;
        }
      } else {
        e.prog = (e.prog || 0) + dt / r.time;
        if (e.prog >= 1) {
          e.busy = false;
          e.prog = 0;
          w.fx.push({ x: e.x, y: e.y, type: 'react', s: e.outOrder[0] });
          e.outOrder.forEach((s, i) => {
            e.outBuf![i] += r.outputs.find(([id]) => id === s)![1];
            discover(w, s);
          });
        }
      }
      e.outOrder.forEach((s, i) => {
        if (e.outBuf![i] <= 0) return;
        const d = portDir(e.dir, i);
        if (push(w, e.x + DX[d], e.y + DY[d], d, s)) e.outBuf![i]--;
      });
    }
  }
}

// ---- 保存 ----

export function serialize(w: World): string {
  return JSON.stringify({
    v: 1, ents: [...w.ents.values()], goal: w.goal, count: w.count,
    delivered: w.delivered, discovered: w.discovered, mistakes: w.mistakes,
  });
}

export function deserialize(json: string): World | null {
  try {
    const d = JSON.parse(json);
    if (d.v !== 1 || !Array.isArray(d.ents)) return null;
    const w = newWorld();
    w.ents = new Map(d.ents.map((e: Ent) => [key(e.x, e.y), e]));
    for (const e of w.ents.values()) {
      if (e.recipe && !recipeById(e.recipe)) clearRecipe(e);
      if (e.item) e.item.m = 0;
    }
    for (const [x, y] of HUB_TILES) w.ents.set(key(x, y), { kind: 'hub', x, y, dir: 0 });
    w.goal = d.goal | 0;
    w.count = d.count | 0;
    w.delivered = d.delivered || {};
    w.discovered = [...new Set([...w.discovered, ...(d.discovered || [])])];
    w.mistakes = d.mistakes || [];
    return w;
  } catch {
    return null;
  }
}
