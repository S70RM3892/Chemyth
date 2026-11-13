import { stationRoutes, stationsOf, stationVer, type World } from '../engine/world';
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
 * 番線ごとの、列車が通る線路（敷いた線路の上の道筋）を、まっすぐな区間にまとめたもの。
 * 駅が多いと、道筋は「積む駅 × 降ろす駅」の数だけあり、同じ線路を何百回も重ねて描くことになる。
 * 重なりを 1 回にまとめ、線路と駅の顔ぶれが変わるまで覚えておく。stubs は、駅の中心と線路を結ぶ短い線
 */
let lineCache: { w: World; rev: number; ver: number; list: { ch: number; runs: Float64Array; stubs: Float64Array }[] } | null = null;
export function lineRuns(w: World): { ch: number; runs: Float64Array; stubs: Float64Array }[] {
  const ver = stationVer(w);
  if (lineCache && lineCache.w === w && lineCache.rev === w.railRev && lineCache.ver === ver) return lineCache.list;
  const K = (x: number, y: number) => (x + 32768) * 65536 + (y + 32768);
  const per = new Map<number, { east: Set<number>; south: Set<number>; stubs: number[]; seen: Set<string> }>();
  for (const e of stationsOf(w)) {
    if (e.role !== 'in') continue;
    for (const r of stationRoutes(w, e)) {
      if (!r.custom || !r.tiles.length) continue;
      const ch = e.ch || 1;
      let p = per.get(ch);
      if (!p) per.set(ch, (p = { east: new Set(), south: new Set(), stubs: [], seen: new Set() }));
      const t = r.tiles;
      for (let i = 1; i < t.length; i++) {
        const [ax, ay] = t[i - 1], [bx, by] = t[i];
        if (ay === by) p.east.add(K(Math.min(ax, bx), ay)); else p.south.add(K(ax, Math.min(ay, by)));
      }
      const a = r.pts[0], z = r.pts[r.pts.length - 1], f = t[0], l = t[t.length - 1];
      for (const [sx, sy, tx, ty] of [[a[0], a[1], f[0] + 0.5, f[1] + 0.5], [z[0], z[1], l[0] + 0.5, l[1] + 0.5]]) {
        const k = `${sx},${sy},${tx},${ty}`;
        if (!p.seen.has(k)) { p.seen.add(k); p.stubs.push(sx, sy, tx, ty); }
      }
    }
  }
  const list: { ch: number; runs: Float64Array; stubs: Float64Array }[] = [];
  for (const [ch, p] of per) {
    const out: number[] = [];
    const merge = (set: Set<number>, horiz: boolean) => {
      // 並びの向きにそろえて並べ、続いている所を 1 本に
      const cells = [...set].map((n) => { const x = Math.floor(n / 65536) - 32768, y = (n % 65536) - 32768; return horiz ? [y, x] : [x, y]; }).sort((u, v) => u[0] - v[0] || u[1] - v[1]);
      for (let i = 0; i < cells.length;) {
        let j = i;
        while (j + 1 < cells.length && cells[j + 1][0] === cells[i][0] && cells[j + 1][1] === cells[j][1] + 1) j++;
        const line = cells[i][0], s = cells[i][1], e2 = cells[j][1];
        if (horiz) out.push(s + 0.5, line + 0.5, e2 + 1.5, line + 0.5); else out.push(line + 0.5, s + 0.5, line + 0.5, e2 + 1.5);
        i = j + 1;
      }
    };
    merge(p.east, true); merge(p.south, false);
    list.push({ ch, runs: Float64Array.from(out), stubs: Float64Array.from(p.stubs) });
  }
  lineCache = { w, rev: w.railRev, ver, list };
  return list;
}
