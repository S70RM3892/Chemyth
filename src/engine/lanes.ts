import { DX, DY, type Dir } from './world';

export interface LaneTile { x: number; y: number; dir: Dir; /** 前後とも同じ向きで、まっすぐ通り抜けるマスか */ straight: boolean }

const dirOf = (a: [number, number], b: [number, number]): Dir => (b[0] > a[0] ? 0 : b[0] < a[0] ? 2 : b[1] > a[1] ? 1 : 3);
const right = (d: Dir) => ((d + 1) % 4) as Dir;

/**
 * 指でなぞった道筋（隣り合うマスの列）から、平行な n 本のベルトの道筋を作る。
 * 0 本目はなぞった道筋そのもの。k 本目は、進む向きの右手へ k マスずれる。
 * 角では、内側の線は早く曲がり、外側の線は遅く曲がるので、線どうしは交わらない。
 * first は、まだ 1 マスしかなぞっていないときの向き。
 */
export function lanePaths(center: [number, number][], n: number, first: Dir = 0): LaneTile[][] {
  if (!center.length) return [];
  const dirs: Dir[] = [];
  for (let i = 1; i < center.length; i++) dirs.push(dirOf(center[i - 1], center[i]));
  const d0 = dirs[0] ?? first, dEnd = dirs[dirs.length - 1] ?? first;
  // 曲がり角：向きが変わるマスと、その前後の向き
  const corners: { c: [number, number]; din: Dir; dout: Dir }[] = [];
  for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) corners.push({ c: center[i], din: dirs[i - 1], dout: dirs[i] });
  const out: LaneTile[][] = [];
  for (let k = 0; k < n; k++) {
    const r0 = right(d0), rE = right(dEnd);
    const pts: [number, number][] = [[center[0][0] + k * DX[r0], center[0][1] + k * DY[r0]]];
    for (const { c, din, dout } of corners) {
      // 右に曲がるなら内側（k マス手前で曲がる）、左に曲がるなら外側（k マス先で曲がる）
      const s = dout === right(din) ? -1 : 1;
      pts.push([c[0] + s * k * DX[din] - s * k * DX[dout], c[1] + s * k * DY[din] - s * k * DY[dout]]);
    }
    const last = center[center.length - 1];
    pts.push([last[0] + k * DX[rE], last[1] + k * DY[rE]]);
    // 角から角へ、まっすぐ埋める。短すぎる区間で内側の線が行き過ぎるときは、その区間を飛ばす
    const segDirs = [d0, ...corners.map((c) => c.dout)];
    const tiles: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const d = segDirs[i - 1], cur = tiles[tiles.length - 1], to = pts[i];
      const len = (to[0] - cur[0]) * DX[d] + (to[1] - cur[1]) * DY[d];
      for (let j = 1; j <= len; j++) tiles.push([cur[0] + j * DX[d], cur[1] + j * DY[d]]);
    }
    const lane: LaneTile[] = tiles.map((q, i) => {
      const next = tiles[i + 1], prev = tiles[i - 1];
      const adj = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
      const dir = next && adj(q, next) ? dirOf(q, next) : prev && adj(prev, q) ? (i === tiles.length - 1 ? dEnd : dirOf(prev, q)) : dEnd;
      const straight = !!prev && !!next && adj(prev, q) && adj(q, next) && dirOf(prev, q) === dirOf(q, next);
      return { x: q[0], y: q[1], dir, straight };
    });
    out.push(lane);
  }
  return out;
}
