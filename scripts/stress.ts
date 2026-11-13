// 重さの計測用の大きな工場：線路 1 万マス（駅 40 組）、ベルト 1 万（荷あり）、反応器 600。node --import tsx で実行する
import { newWorld, step, configure, layRail, type World } from '../src/engine/world';
import { recipeById } from '../src/content/recipes';
export function stressWorld(): World {
  const w = newWorld();
  const put = (e: Record<string, unknown>) => w.ents.set(`${e.x},${e.y}` as never, e as never);
  // 線路：40 本の横の線（各 250 マス）。両端に駅（積む駅と降ろす駅、番線 1〜8）
  for (let r = 0; r < 40; r++) {
    const y = -200 + r * 4;
    layRail(w, [[-100, y], [149, y]]);
    put({ kind: 'station', x: -102, y: y - 1, dir: 0, ch: (r % 8) + 1, role: 'in', buf: Array(20).fill('N2') });
    put({ kind: 'station', x: 150, y: y - 1, dir: 0, ch: (r % 8) + 1, role: 'out', buf: [] });
  }
  for (let i = 0; i < 10000; i++) { const x = 300 + (i % 100), y = 300 + Math.floor(i / 100); put({ kind: 'belt', x, y, dir: 0, item: i % 2 ? { s: 'N2', p: 0.4 } : null }); }
  for (let i = 0; i < 600; i++) { const x = -100 + (i % 40) * 3, y = 100 + Math.floor(i / 40) * 3; put({ kind: 'reactor', x, y, dir: 0, big: true }); const e = (w.ents as Map<string, any>).get(`${x},${y}`); configure(e, recipeById('haber-bosch')!, ['NH3']); e.inBuf = { N2: 50, H2: 150 }; }
  return w;
}
if (process.argv[1]?.endsWith('stress.mjs')) {
  const w = stressWorld();
  console.log('rails', w.rails.size, 'ents', w.ents.size);
  for (let i = 0; i < 120; i++) step(w, 1 / 60);
  const t0 = performance.now(), N = 600;
  for (let i = 0; i < N; i++) step(w, 1 / 60);
  console.log('step ms', ((performance.now() - t0) / N).toFixed(3));
}

/**
 * 線路の束の工場：隣どうしが全部つながった 5 列の縦の束 × 4 と、3 行の横の束 × 6（約 1 万マス、分岐点は数千）。
 * 同じ番線の積む駅 40・降ろす駅 40（道筋は 1600 本）。実際の大きな工場に近い形
 */
export function denseWorld(): World {
  const w = newWorld();
  const put = (e: Record<string, unknown>) => w.ents.set(`${e.x},${e.y}` as never, e as never);
  const set = new Set<string>();
  for (let b = 0; b < 4; b++) for (let c = 0; c < 5; c++) for (let y = -150; y < 150; y++) set.add(`${-40 + b * 20 + c},${y}`);
  for (let b = 0; b < 6; b++) for (let r = 0; r < 3; r++) for (let x = -150; x < 150; x++) set.add(`${x},${-140 + b * 50 + r}`);
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const k of set) { const [x, y] = k.split(',').map(Number); let m = 0; D.forEach(([dx, dy], d) => { if (set.has(`${x + dx},${y + dy}`)) m |= 1 << d; }); w.rails.set(k, m); }
  w.railRev++;
  for (let i = 0; i < 40; i++) {
    put({ kind: 'station', x: -42, y: -148 + i * 7, dir: 0, ch: 8, role: 'in', big: true, buf: Array(20).fill('N2') });
    put({ kind: 'station', x: 25, y: -146 + i * 7, dir: 0, ch: 8, role: 'out', big: true, buf: [] });
  }
  return w;
}
