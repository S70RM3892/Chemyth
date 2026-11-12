/**
 * 自動ベルト「道」：始まりと終わりを選ぶと、空いたマスを通る最短の道筋を探す（A*）。
 * 置いてある設備は避ける。まっすぐ流れているベルトは、直角に横切れる（そこを立体交差にする。少し遠回りより高くつける）。
 * 曲がり角は少しだけ高くつけるので、同じ長さなら曲がりの少ない道を選ぶ
 */
import { at, DX, DY, footprint, isMachine, sizeOf, slotPort, type Dir, type Ent, type World } from './world';
import { acceptsFrom, emitsInto, outTargets } from './shape';

/** 敷くマス：bridge なら、もとのベルトを立体交差に置きかえる（dir は流れる向き） */
export interface RouteStep { x: number; y: number; dir: Dir; bridge?: boolean }
export type RouteResult = { ok: true; steps: RouteStep[] } | { ok: false; why: string };

/** 道のりの重み（整数で持つ）：1 マス 5、曲がり 2、立体交差 1 か所につき 15 を足す。向きのある設備の入れ方の重みも 5 倍して使う */
const STEP = 5, TURN = 2, BRIDGE = 15, INF = 0x3fffffff;
const MAX_JUMP = 4, MAX_NODES = 80000, MAX_DIST = 400, FLOOD = 4000;
const k2 = (x: number, y: number) => `${x},${y}`;

/** 後ろからだけ流れ込んでいるベルト（曲がり角・合流点ではない）。直角に横切って、立体交差にできる */
function straight(w: World, e: Ent): boolean {
  for (const q of [0, 1, 2, 3] as Dir[]) {
    if (q === e.dir) continue;
    const m = at(w, e.x - DX[q], e.y - DY[q]);
    if (m && m !== e && emitsInto(w, m, e.x, e.y, q)) return false;
  }
  return true;
}

/** 設備のマス（納品所は、全部のマス） */
const cellsOf = (w: World, e: Ent): [number, number][] => (e.kind === 'hub' ? [...w.ents.values()].filter((o) => o.kind === 'hub').map((o) => [o.x, o.y] as [number, number]) : footprint(e.x, e.y, sizeOf(e)));

export function findRoute(w: World, a: [number, number], b: [number, number]): RouteResult {
  if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > MAX_DIST) return { ok: false, why: `遠すぎる（${MAX_DIST} マスまで）。途中で区切って敷け。` };
  const A = at(w, a[0], a[1]), B = at(w, b[0], b[1]);
  if (A && B && A === B) return { ok: false, why: '始まりと終わりが同じ設備だ。' };
  // ---- 始まり：空いたマスならそこから。設備なら、その出口の前のマスから ----
  const starts: { x: number; y: number; d: number }[] = [];
  if (!A) starts.push({ x: a[0], y: a[1], d: 4 });
  else {
    if (A.kind === 'hub' || A.kind === 'vent') return { ok: false, why: '納品所や廃棄口からは始められない。物が出る設備か、空いたマスを選べ。' };
    let outs = outTargets(w, A);
    // 反応をまだ決めていない装置：最初の生成物の出口から
    if (!outs.length && isMachine(A.kind)) { const p = slotPort(A, 0); outs = [{ tx: p.tx, ty: p.ty, d: p.d }]; }
    if (!outs.length) return { ok: false, why: 'ここからは物が出ない。' };
    if (B && outs.some((o) => at(w, o.tx, o.ty) === B)) return { ok: false, why: 'もう、じかにつながっている。' };
    for (const o of outs) if (!at(w, o.tx, o.ty)) starts.push({ x: o.tx, y: o.ty, d: o.d });
    if (!starts.length) return { ok: false, why: '出口の前が、どれもふさがっている。' };
  }
  // ---- 終わり：空いたマスならそこまで。設備なら、受け取れる面の隣の空きマスまで（最後のベルトを設備へ向ける） ----
  const goals = new Map<string, { x: number; y: number; dir: number; pen: number }>();
  if (!B) goals.set(k2(b[0], b[1]), { x: b[0], y: b[1], dir: -1, pen: 0 });
  else {
    if (B.kind === 'extractor' || B.kind === 'depot' || B.kind === 'sampler') return { ok: false, why: `${B.kind === 'extractor' ? '採取機' : B.kind === 'depot' ? '搬出口' : '試薬棚'}には流し込めない。` };
    const cells = cellsOf(w, B), mine = new Set(cells.map(([x, y]) => k2(x, y)));
    // 設備が物を出しているマスには置かない（出てきた物と、ぶつかる）
    const outsB = new Set(outTargets(w, B).map((o) => k2(o.tx, o.ty)));
    for (const [cx, cy] of cells) for (const d of [0, 1, 2, 3] as Dir[]) {
      const gx = cx - DX[d], gy = cy - DY[d], gk = k2(gx, gy);
      if (mine.has(gk) || outsB.has(gk) || at(w, gx, gy) || !acceptsFrom(B, d)) continue;
      // 向きのある設備は、背中側から入れるのがよい（正面には、ふつう出口がある）
      const pen = B.kind === 'hub' || B.kind === 'vent' || B.kind === 'tank' || B.kind === 'station' ? 0 : d === B.dir ? 0 : d === (B.dir + 2) % 4 ? 6 : 2;
      const old = goals.get(gk);
      if (!old || pen < old.pen) goals.set(gk, { x: gx, y: gy, dir: d, pen });
    }
    if (!goals.size) return { ok: false, why: '終わりの設備のまわりに、ベルトを置ける空きがない。' };
  }
  const gl = [...goals.values()];
  // ---- 探す範囲（両端を含む四角に余白）。マスの様子は、はじめて見たときに調べて覚える ----
  const xs = [a[0], b[0], ...starts.map((s) => s.x), ...gl.map((g) => g.x)], ys = [a[1], b[1], ...starts.map((s) => s.y), ...gl.map((g) => g.y)];
  const M = 24 + Math.round((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) / 4);
  const bx0 = Math.min(...xs) - M, bx1 = Math.max(...xs) + M, by0 = Math.min(...ys) - M, by1 = Math.max(...ys) + M;
  const H = by1 - by0 + 1, N = (bx1 - bx0 + 1) * H;
  const idx = (x: number, y: number) => (x - bx0) * H + (y - by0);
  const inBox = (x: number, y: number) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  // 0 空き、1 ふさがり。2 は横に進むとき、4 は縦に進むときに、立体交差で横切れるベルト
  const info = new Int8Array(N).fill(-1);
  const tile = (x: number, y: number) => {
    const i = idx(x, y);
    let v = info[i];
    if (v < 0) { const e = at(w, x, y); v = !e ? 0 : e.kind === 'belt' && straight(w, e) ? (e.dir % 2 ? 3 : 5) : 1; info[i] = v; }
    return v;
  };
  // ---- 囲まれていないか：両端から、空きマス（と横切れるベルト）を広げて確かめる。囲まれていれば、すぐにあきらめる ----
  const flood = (seeds: [number, number][], hit: Set<number>): boolean => {
    const seen = new Set<number>(), q: [number, number][] = [];
    for (const [x, y] of seeds) { const i = idx(x, y); if (hit.has(i)) return true; seen.add(i); q.push([x, y]); }
    for (let h = 0; h < q.length; h++) {
      if (seen.size > FLOOD) return true;
      const [x, y] = q[h];
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inBox(nx, ny)) return true;   // 範囲の端まで広がった：囲まれてはいない
        const i = idx(nx, ny);
        if (seen.has(i) || tile(nx, ny) === 1) continue;
        if (hit.has(i)) return true;
        seen.add(i); q.push([nx, ny]);
      }
    }
    return false;
  };
  const startSet = new Set(starts.map((s) => idx(s.x, s.y))), goalSet = new Set(gl.map((g) => idx(g.x, g.y)));
  if (!flood(gl.map((g) => [g.x, g.y]), startSet) || !flood(starts.map((s) => [s.x, s.y]), goalSet)) return { ok: false, why: '道が見つからない。始まりか終わりが、まわりを囲まれている。' };
  const goalAt = new Map(gl.map((g) => [idx(g.x, g.y), g]));
  const h = (x: number, y: number) => { let m = INF; for (const g of gl) m = Math.min(m, Math.abs(x - g.x) + Math.abs(y - g.y)); return m * STEP; };
  // ---- A*：状態は（マス、入ってきた向き。4 は始まり）。節と二分ヒープは、決まった大きさの配列に持つ ----
  const best = new Int32Array(N * 5).fill(INF);
  const NX = new Int32Array(MAX_NODES), NY = new Int32Array(MAX_NODES), ND = new Int8Array(MAX_NODES), NB = new Int8Array(MAX_NODES), NP = new Int32Array(MAX_NODES), NG = new Int32Array(MAX_NODES);
  let nn = 0;
  // ヒープの中身：節の番号（終わりの印は -1 - 番号）と f
  const HF = new Int32Array(MAX_NODES * 2), HI = new Int32Array(MAX_NODES * 2);
  let hn = 0;
  const push = (f: number, v: number) => {
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= f) break; HF[i] = HF[p]; HI[i] = HI[p]; i = p; }
    HF[i] = f; HI[i] = v;
  };
  const pop = (): number => {
    const top = HI[0], lf = HF[--hn], lv = HI[hn];
    let i = 0;
    for (;;) { const l = i * 2 + 1, r = l + 1; let m = -1, mf = lf; if (l < hn && HF[l] < mf) { m = l; mf = HF[l]; } if (r < hn && HF[r] < mf) { m = r; } if (m < 0) break; HF[i] = HF[m]; HI[i] = HI[m]; i = m; }
    if (hn > 0) { HF[i] = lf; HI[i] = lv; }
    return top;
  };
  const node = (x: number, y: number, d: number, g: number, p: number, nb: number) => { NX[nn] = x; NY[nn] = y; ND[nn] = d; NG[nn] = g; NP[nn] = p; NB[nn] = nb; return nn++; };
  for (const s of starts) { const k = idx(s.x, s.y) * 5 + s.d; if (best[k] <= 0) continue; best[k] = 0; push(h(s.x, s.y), node(s.x, s.y, s.d, 0, -1, 0)); }
  let found = -1, finalDir = 0;
  while (hn > 0) {
    const v = pop();
    if (v < 0) { found = -1 - v; const g = goalAt.get(idx(NX[found], NY[found]))!; finalDir = g.dir >= 0 ? g.dir : ND[found] === 4 ? 0 : ND[found]; break; }
    const x = NX[v], y = NY[v], din = ND[v], g = NG[v];
    if (best[idx(x, y) * 5 + din] < g) continue;
    const gd = goalAt.get(idx(x, y));
    // ここで終われる。最後のベルトを設備へ向けるために曲がるなら、その分も足す
    if (gd) push(g + gd.pen * STEP + (gd.dir >= 0 && din !== 4 && din !== gd.dir ? TURN : 0), -1 - v);
    if (nn + 4 >= MAX_NODES) continue;
    for (let d = 0; d < 4; d++) {
      if (din !== 4 && d === (din + 2) % 4) continue;
      const bit = d % 2 ? 4 : 2;
      let nx = x + DX[d], ny = y + DY[d], nb = 0;
      while (nb < MAX_JUMP && inBox(nx, ny) && tile(nx, ny) & bit) { nb++; nx += DX[d]; ny += DY[d]; }
      if (!inBox(nx, ny) || tile(nx, ny)) continue;
      const ng = g + STEP + nb * (STEP + BRIDGE) + (din !== 4 && d !== din ? TURN : 0), k = idx(nx, ny) * 5 + d;
      if (best[k] <= ng) continue;
      best[k] = ng;
      push(ng + h(nx, ny), node(nx, ny, d, ng, v, nb));
    }
  }
  if (found < 0) return { ok: false, why: nn + 4 >= MAX_NODES ? '道が見つからない（探す範囲が広すぎる）。近くで区切って敷け。' : '道が見つからない。まわりがふさがっている。' };
  // ---- たどって、敷くマスを並べる ----
  const chain: number[] = [];
  for (let i = found; i >= 0; i = NP[i]) chain.unshift(i);
  const steps: RouteStep[] = [];
  chain.forEach((i, k) => {
    const next = chain[k + 1];
    const dir = (next === undefined ? finalDir : ND[next]) as Dir;
    steps.push({ x: NX[i], y: NY[i], dir });
    if (next !== undefined) for (let j = 1; j <= NB[next]; j++) steps.push({ x: NX[i] + DX[dir] * j, y: NY[i] + DY[dir] * j, dir, bridge: true });
  });
  return { ok: true, steps };
}
