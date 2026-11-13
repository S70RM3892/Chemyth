import type { World } from '../engine/world';
/**
 * 線路を、まっすぐ続く所ごとに 1 本の線にまとめる（[x0, y0, x1, y1] の並び。マスの中心どうしを結ぶ）。
 * 線路は縦と横しかないので、1 万マスでも、まっすぐな区間の数（多くは数十〜数百）だけ線を引けばよい。
 * 線路を敷き直すまで（railRev が変わるまで）覚えておく
 */
let cache: { w: World; rev: number; runs: Float64Array; junc: Float64Array } | null = null;
export function railRuns(w: World): Float64Array {
  if (cache && cache.w === w && cache.rev === w.railRev) return cache.runs;
  const east = new Map<number, number[]>(), south = new Map<number, number[]>(), junc: number[] = [];
  for (const [k, m] of w.rails) {
    const c = k.indexOf(','), x = +k.slice(0, c), y = +k.slice(c + 1);
    if ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) >= 3) junc.push(x + 0.5, y + 0.5);
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
