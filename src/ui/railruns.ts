import { railGraph, railOf, railRoute, stationDests, stationRailIdx, stationsOf, stationVer, type Ent, type Train, type World } from '../engine/world';
/**
 * 線路を、まっすぐ続く所ごとに 1 本の線にまとめる（[x0, y0, x1, y1] の並び。マスの中心どうしを結ぶ）。
 * 線路は縦と横しかないので、1 万マスでも、まっすぐな区間の数（多くは数十〜数百）だけ線を引けばよい。
 * 線路を敷き直すまで（railRev が変わるまで）覚えておく
 */
const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
let cache: { w: World; rev: number; runs: Float64Array; junc: Float64Array } | null = null;
export function railRuns(w: World): Float64Array {
  if (cache && cache.w === w && cache.rev === w.railRev) return cache.runs;
  const east = new Map<number, number[]>(), south = new Map<number, number[]>(), junc: number[] = [];
  for (const [k, m] of w.rails) {
    const c = k.indexOf(','), x = +k.slice(0, c), y = +k.slice(c + 1);
    // 分岐点の印：3 方向以上につながり、つながった先に「ふつうの線路（2 方向まで）」があるマスだけ。
    // 線路の束（隣どうしが全部つながっている所）の中は、どのマスも分岐なので印をつけない（何千もの印で線路が見えなくなり、描くのも重い）
    if (bits(m) >= 3) {
      const DXY = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (let d = 0; d < 4; d++) if ((m >> d) & 1 && bits(w.rails.get(`${x + DXY[d][0]},${y + DXY[d][1]}`) || 0) <= 2) { junc.push(x + 0.5, y + 0.5); break; }
    }
    if (m & 1) { let l = east.get(y); if (!l) east.set(y, (l = [])); l.push(x); }
    if (m & 2) { let l = south.get(x); if (!l) south.set(x, (l = [])); l.push(y); }
  }
  const out: number[] = [];
  // 東へつながるマスが続く所：x から x+1 への区間を、つながっている間は伸ばす
  for (const [y, xs] of east) {
    xs.sort((a, b) => a - b);
    let s = xs[0], e = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === e + 1) { e = xs[i]; continue; }
      out.push(s + 0.5, y + 0.5, e + 1.5, y + 0.5);
      if (i < xs.length) s = e = xs[i];
    }
  }
  for (const [x, ys] of south) {
    ys.sort((a, b) => a - b);
    let s = ys[0], e = ys[0];
    for (let i = 1; i <= ys.length; i++) {
      if (i < ys.length && ys[i] === e + 1) { e = ys[i]; continue; }
      out.push(x + 0.5, s + 0.5, x + 0.5, e + 1.5);
      if (i < ys.length) s = e = ys[i];
    }
  }
  cache = { w, rev: w.railRev, runs: Float64Array.from(out), junc: Float64Array.from(junc) };
  return cache.runs;
}
/** 分岐点（3 方向以上につながるマス）の中心 [x, y] の並び。区間と一緒に覚えておく */
export function railJunctions(w: World): Float64Array {
  railRuns(w);
  return cache!.junc;
}

/**
 * 番線ごとの、列車が通る線路（敷いた線路の上の道筋）を、まっすぐな区間にまとめたもの。stubs は、駅の中心と線路を結ぶ短い線。
 * - 駅が少ないうちは、積む駅から降ろす駅までの道筋そのもの（通らない枝には色がつかない）
 * - 駅が多い工場（道筋が LINE_EXACT 本を超える）では、道筋を 1 本ずつ探さず、その番線の駅がつながっている網の線路ぜんぶに色をつける
 *   （道筋は「積む駅 × 降ろす駅」の数だけあり、数千本を探して重ねるのは重い。大きな網では、ほとんどの線路を列車が通る）
 * 線路と駅の顔ぶれが変わるまで覚えておく。続けて線路を敷いている間は、作り直しを 0.4 秒に 1 回までにする（その間は前の色のまま）
 */
export const LINE_EXACT = 400;
type LineRun = { ch: number; runs: Float64Array; stubs: Float64Array };
let lineCache: { w: World; rev: number; ver: number; list: LineRun[]; at: number } | null = null;
export function lineRuns(w: World): LineRun[] {
  const ver = stationVer(w);
  if (lineCache && lineCache.w === w && lineCache.rev === w.railRev && lineCache.ver === ver) return lineCache.list;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (lineCache && lineCache.w === w && w.rails.size > 2000 && now - lineCache.at < 400) return lineCache.list;
  const K = (x: number, y: number) => (x + 32768) * 65536 + (y + 32768);
  const per = new Map<number, { east: Set<number>; south: Set<number>; stubs: number[]; seen: Set<number> }>();
  const of = (ch: number) => { let p = per.get(ch); if (!p) per.set(ch, (p = { east: new Set(), south: new Set(), stubs: [], seen: new Set() })); return p; };
  const ins = stationsOf(w).filter((e) => e.role === 'in'), laid = ins.map((e) => stationDests(w, e)).map((d) => (d.laid ? d.list : []));
  const pairs = laid.reduce((a, l) => a + l.length, 0);
  if (pairs <= LINE_EXACT) {
    ins.forEach((e, k) => {
      for (const d of laid[k]) {
        const r = railRoute(w, e, d);
        if (!r || !r.tiles.length) continue;
        const p = of(e.ch || 1), t = r.tiles;
        for (let i = 1; i < t.length; i++) {
          const [ax, ay] = t[i - 1], [bx, by] = t[i];
          if (ay === by) p.east.add(K(Math.min(ax, bx), ay)); else p.south.add(K(ax, Math.min(ay, by)));
        }
        const a = r.pts[0], z = r.pts[r.pts.length - 1], f = t[0], l = t[t.length - 1];
        for (const [sx, sy, tx, ty] of [[a[0], a[1], f[0] + 0.5, f[1] + 0.5], [z[0], z[1], l[0] + 0.5, l[1] + 0.5]]) {
          const k2 = K(sx * 2, sy * 2) * 16 + (tx - sx + 2) * 4 + (ty - sy + 2);
          if (!p.seen.has(k2)) { p.seen.add(k2); p.stubs.push(sx, sy, tx, ty); }
        }
      }
    });
  } else {
    // 番線ごとに、駅がつながっている網を集める → その網の線路に色をつける
    const g = railGraph(w), nets = new Map<number, Set<number>>();
    const mark = (e: Ent) => {
      const ti = stationRailIdx(w, e);
      if (!ti.length) return;
      const ch = e.ch || 1;
      let set = nets.get(ch);
      if (!set) nets.set(ch, (set = new Set()));
      for (const i of ti) set.add(g.comp[i]);
      of(ch).stubs.push(e.x + 1, e.y + 1, g.xs[ti[0]] + 0.5, g.ys[ti[0]] + 0.5);
    };
    const outs = new Set<Ent>();
    ins.forEach((e, k) => { if (laid[k].length) { mark(e); for (const d of laid[k]) outs.add(d); } });
    for (const d of outs) mark(d);
    for (const [ch, set] of nets) {
      const p = of(ch);
      for (let i = 0; i < g.n; i++) {
        if (!set.has(g.comp[i])) continue;
        if (g.nb[i * 4] >= 0) p.east.add(K(g.xs[i], g.ys[i]));
        if (g.nb[i * 4 + 1] >= 0) p.south.add(K(g.xs[i], g.ys[i]));
      }
    }
  }
  const list: LineRun[] = [];
  for (const [ch, p] of per) {
    const out: number[] = [];
    const merge = (set: Set<number>, horiz: boolean) => {
      // 並びの向きにそろえた鍵（線の番号 × 65536 + 線の上の位置）で並べ、続いている所を 1 本に
      const cells = new Float64Array(set.size);
      let q = 0;
      for (const n of set) { const x = Math.floor(n / 65536), y = n - x * 65536; cells[q++] = horiz ? y * 65536 + x : n; }
      cells.sort();
      for (let i = 0; i < cells.length;) {
        let j = i;
        while (j + 1 < cells.length && cells[j + 1] === cells[j] + 1) j++;
        const line = Math.floor(cells[i] / 65536) - 32768, s = cells[i] - Math.floor(cells[i] / 65536) * 65536 - 32768, e2 = s + (j - i);
        if (horiz) out.push(s + 0.5, line + 0.5, e2 + 1.5, line + 0.5); else out.push(line + 0.5, s + 0.5, line + 0.5, e2 + 1.5);
        i = j + 1;
      }
    };
    merge(p.east, true); merge(p.south, false);
    list.push({ ch, runs: Float64Array.from(out), stubs: Float64Array.from(p.stubs) });
  }
  lineCache = { w, rev: w.railRev, ver, list, at: now };
  return list;
}

/** 列車のいま居る場所（マスの座標）と、進む向き。trainAt が書きこむ（毎コマ・列車ごとに呼ぶので、入れ物を作らない） */
export const TRAIN = { x: 0, y: 0, dx: 1, dy: 0 };
/**
 * 積む駅 e の列車 tr の場所を TRAIN に書く。道筋は、工場を進めるときに列車が覚えたもの（tr.rt）を使い、なければその場で求める。
 * 敷いた線路の道筋では、道のりからマスの番号をじかに出す（道筋の長さによらない手間）
 */
export function trainAt(w: World, e: Ent, tr: Train): void {
  // 駅で積んでいる列車は、駅にいる（道筋を見るまでもない）
  if (tr.p <= 0 && !tr.back && !tr.to) { TRAIN.x = e.x + 1; TRAIN.y = e.y + 1; TRAIN.dx = 1; TRAIN.dy = 0; return; }
  let r = tr.rt;
  if (r === undefined || tr.rtRev !== w.railRev) {
    const d = tr.to ? w.ents.get(tr.to) : undefined;
    r = d && d.kind === 'station' && d.role === 'out' && d.ch === e.ch ? railOf(w, e, d) : null;
  }
  const T = TRAIN, p = tr.p < 0 ? 0 : tr.p > 1 ? 1 : tr.p;
  T.x = e.x + 1; T.y = e.y + 1; T.dx = 1; T.dy = 0;
  if (!r) return;
  let ax: number, ay: number, bx: number, by: number, f: number;
  const t = r.tiles, n = t.length;
  if (r.custom && n) {
    const dx = r.dest.x + 1, dy = r.dest.y + 1;
    const d0 = Math.abs(t[0][0] + 0.5 - T.x) + Math.abs(t[0][1] + 0.5 - T.y), d1 = Math.abs(t[n - 1][0] + 0.5 - dx) + Math.abs(t[n - 1][1] + 0.5 - dy);
    const D = p * (d0 + n - 1 + d1);
    if (D < d0 || n < 1) { ax = T.x; ay = T.y; bx = t[0][0] + 0.5; by = t[0][1] + 0.5; f = d0 ? D / d0 : 0; }
    else if (D >= d0 + n - 1) { ax = t[n - 1][0] + 0.5; ay = t[n - 1][1] + 0.5; bx = dx; by = dy; f = d1 ? Math.min(1, (D - d0 - (n - 1)) / d1) : 0; }
    else { const i = Math.min(n - 2, Math.floor(D - d0)); ax = t[i][0] + 0.5; ay = t[i][1] + 0.5; bx = t[i + 1][0] + 0.5; by = t[i + 1][1] + 0.5; f = D - d0 - i; }
  } else {
    const pts = r.pts;
    if (pts.length < 2) return;
    let tot = 0;
    for (let i = 1; i < pts.length; i++) tot += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    let D = p * tot, i = 0, len = 0;
    for (; i < pts.length - 1; i++) { len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]); if (D <= len || i === pts.length - 2) break; D -= len; }
    ax = pts[i][0]; ay = pts[i][1]; bx = pts[i + 1][0]; by = pts[i + 1][1]; f = len ? Math.min(1, D / len) : 0;
  }
  T.x = ax + (bx - ax) * f; T.y = ay + (by - ay) * f;
  const sgn = tr.back ? -1 : 1;
  if (bx !== ax || by !== ay) { T.dx = (bx - ax) * sgn; T.dy = (by - ay) * sgn; }
}
