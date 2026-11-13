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
