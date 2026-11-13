import { describe, expect, it } from 'vitest';
import { layRail, newWorld } from '../src/engine/world';
import { railRuns } from '../src/ui/railruns';

// 線路をまっすぐな区間にまとめる：まとめても、描く線（マスの中心どうしをつなぐ短い線）の集まりは同じ
const unit = (runs: Float64Array) => {
  const out: string[] = [];
  for (let i = 0; i < runs.length; i += 4) {
    const [ax, ay, bx, by] = [runs[i], runs[i + 1], runs[i + 2], runs[i + 3]];
    if (ay === by) for (let x = ax; x < bx; x++) out.push(`h${x},${ay}`); else for (let y = ay; y < by; y++) out.push(`v${ax},${y}`);
  }
  return out.sort();
};
const cells = (w: ReturnType<typeof newWorld>) => {
  const out: string[] = [];
  for (const [k, m] of w.rails) { const [x, y] = k.split(',').map(Number); if (m & 1) out.push(`h${x + 0.5},${y + 0.5}`); if (m & 2) out.push(`v${x + 0.5},${y + 0.5}`); }
  return out.sort();
};

describe('線路の区間', () => {
  it('L 字・T 字・離れた 2 本：区間の数は少なく、線の集まりはマスごとの線と同じ', () => {
    const w = newWorld();
    layRail(w, [[0, 0], [9, 0], [9, 6]]);
    layRail(w, [[4, 0], [4, 5]]);
    layRail(w, [[20, 3], [30, 3]]);
    const r = railRuns(w);
    expect(r.length / 4).toBe(4);   // 横 (0..9) は分岐を通しても 1 本、縦 2 本、離れた横 1 本
    expect(unit(r)).toEqual(cells(w));
  });
  it('1 万マスの線路でも、まっすぐな区間の数だけ', () => {
    const w = newWorld();
    for (let r = 0; r < 40; r++) layRail(w, [[-100, r * 4], [149, r * 4]]);
    expect(w.rails.size).toBe(10000);
    expect(railRuns(w).length / 4).toBe(40);
    expect(unit(railRuns(w))).toEqual(cells(w));
  });
  it('線路を敷き直すと、作り直す', () => {
    const w = newWorld();
    layRail(w, [[0, 0], [3, 0]]);
    const a = railRuns(w);
    layRail(w, [[3, 0], [3, 3]]);
    expect(railRuns(w)).not.toBe(a);
    expect(unit(railRuns(w))).toEqual(cells(w));
  });
});
