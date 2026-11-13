// 重さの計測用の大きな工場：線路 1 万マス（駅 40 組）、ベルト 1 万（荷あり）、反応器 600。node --import tsx で実行する
import { newWorld, step, configure, layRail, slotPort, type World } from '../src/engine/world';
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

/**
 * 採取機の畑の工場：採取機 5800 台（半分はベルトへ出して廃棄口・タンク・納品所へ、半分は出口がふさがったまま）、
 * 蒸留塔 200 台、荷で埋まったベルト 6000、いっぱいの駅 40 組。強化は高め。毎分数十万個が流れる大きな工場に近い形
 */
export function farmWorld(): World {
  const w = newWorld();
  w.up = { extract: 8, belt: 6, machine: 6 };
  const put = (e: Record<string, unknown>) => w.ents.set(`${e.x},${e.y}` as never, e as never);
  // 出口がふさがった採取機の畑（隣の採取機へ向いている）：2900 台
  for (let i = 0; i < 2900; i++) put({ kind: 'extractor', x: -300 + (i % 58), y: 200 + Math.floor(i / 58), dir: 0 });
  // ベルトへ出す採取機：横 1 列のベルトの上と下に並べる。ベルトの先は廃棄口か納品所行きの駅
  for (let r = 0; r < 29; r++) {
    const y = -300 + r * 3;
    for (let x = 0; x < 50; x++) { put({ kind: 'extractor', x: -300 + x, y: y - 1, dir: 1 }); put({ kind: 'extractor', x: -300 + x, y: y + 1, dir: 3 }); put({ kind: 'belt', x: -300 + x, y, dir: 0 }); }
    for (let x = 50; x < 150; x++) put({ kind: 'belt', x: -300 + x, y, dir: 0 });
    if (r % 2) put({ kind: 'vent', x: -150, y, dir: 0 });
    else { put({ kind: 'separator', x: -150, y, dir: 0, big: true }); const e = (w.ents as Map<string, any>).get(`-150,${y}`); configure(e, recipeById('air-distill') ?? recipeById('haber-bosch')!, (recipeById('air-distill')?.outputs ?? [['NH3', 1]]).map(([s]) => s)); }
  }
  for (let r = 0; r < 40; r++) {
    const y = -200 + r * 4;
    layRail(w, [[100, y], [249, y]]);
    put({ kind: 'station', x: 98, y: y - 1, dir: 0, ch: (r % 8) + 1, role: 'in', big: true, buf: Array(1200).fill('N2') });
    put({ kind: 'station', x: 250, y: y - 1, dir: 0, ch: (r % 8) + 1, role: 'out', big: true, buf: Array(600).fill('N2') });
  }
  return w;
}

/**
 * 巨大な区画の工場（実際の大きな工場の形）：230×210 マスの区画に、1 行おきの横の線路（各 230 マス）と、行を束ねる縦の幹線。
 * 行ごとに積む駅を 6 つ（合わせて 600 あまり）、採取機 5800 台が駅へ直接出す。降ろす駅は納品所のそばに 12。すべて同じ番線。
 * 線路は約 2.6 万マス、列車は駅ごとに 3 編成
 */
export function megaWorld(): World {
  const w = newWorld();
  w.up = { extract: 8, belt: 6, machine: 6 };
  w.research.push('yard', 'heavy');
  const put = (e: Record<string, unknown>) => w.ents.set(`${e.x},${e.y}` as never, e as never);
  const big = (e: Record<string, unknown>) => { put({ ...e, big: true }); for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) put({ kind: 'part', x: (e.x as number) + dx, y: (e.y as number) + dy, dir: 0, ref: `${e.x},${e.y}` }); };
  const X0 = 60, Y0 = 40, W = 230, ROWS = 105;
  const set = new Set<string>();
  for (let r = 0; r < ROWS; r++) for (let x = 0; x < W; x++) set.add(`${X0 + x},${Y0 + r * 2}`);
  // 縦の幹線：区画の左の縁（3 列）。納品所の方へ上にのびる
  for (let c = 0; c < 3; c++) for (let y = Y0 - 30; y < Y0 + ROWS * 2; y++) set.add(`${X0 - 3 + c},${y}`);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < 3; c++) set.add(`${X0 - 1 + c},${Y0 + r * 2}`);
  // 駅と採取機の場所は、線路から外す（線路は設備の上を通れるが、ここでは行の間に置く）
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const k of set) { const [x, y] = k.split(',').map(Number); let m = 0; D.forEach(([dx, dy], d) => { if (set.has(`${x + dx},${y + dy}`)) m |= 1 << d; }); w.rails.set(k, m); }
  w.railRev++;
  let stations = 0;
  for (let r = 0; r < ROWS; r += 1) {
    const y = Y0 + r * 2 + 1;   // 線路の行の間の行：採取機を並べ、ところどころに駅
    if (r % 2 === 0) continue;  // 駅は 2×2 なので、1 行おきに置く（線路の行を 1 本またぐ）
    for (let x = 0; x < W - 2; x++) {
      if (x % 38 === 18) { big({ kind: 'station', x: X0 + x, y, dir: 0, ch: 8, role: 'in', cars: 3, buf: Array(1200).fill('N2') }); stations++; x++; continue; }
      if (x % 38 === 19) continue;
      put({ kind: 'extractor', x: X0 + x, y, dir: x % 38 < 18 ? 0 : 2 });
      put({ kind: 'extractor', x: X0 + x, y: y + 1, dir: x % 38 < 18 ? 0 : 2 });
    }
  }
  for (let i = 0; i < 12; i++) {
    const st = { kind: 'station', x: X0 - 6 - (i % 2) * 6 + (i % 2 ? 9 : 0), y: Y0 - 28 + Math.floor(i / 2) * 4, dir: 0, ch: 8, role: 'out', buf: [] };
    big(st);
    // 降ろした物は、正面の 2 つの口の先の廃棄口へ捨てる（列車が降ろせずに駅で待ち続けないように。本物の工場では、ベルトが運び去る）
    for (const k of [0, 1]) { const q = slotPort({ ...st, big: true } as never, k); put({ kind: 'vent', x: q.tx, y: q.ty, dir: 0 }); }
  }
  return w;
}

/**
 * 線路を敷かずに駅だけを並べた、とても大きな工場：積む駅 1,500（同じ番線）から、納品所のまわりの降ろす駅 7 つへ、自動の仮線路で運ぶ。
 * 仮線路は「積む駅 × 降ろす駅」で 1 万本を超え、その全部と列車が、降ろす駅のまわりに集まる（そこを近くで見るのが、いちばん重い）。
 * 積む駅には、まわりの採取機 4 台がじかに入れる。降ろした物は廃棄口へ捨てる
 */
export function autoWorld(): World {
  const w = newWorld();
  w.up = { extract: 5, belt: 5, machine: 5 };
  w.research.push('yard');
  const put = (e: Record<string, unknown>) => w.ents.set(`${e.x},${e.y}` as never, e as never);
  const big = (e: Record<string, unknown>) => { put({ ...e, big: true }); for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) put({ kind: 'part', x: (e.x as number) + dx, y: (e.y as number) + dy, dir: 0, ref: `${e.x},${e.y}` }); };
  for (let i = 0; i < 1500; i++) {
    const x = 70 + (i % 50) * 5, y = 60 + Math.floor(i / 50) * 5;
    big({ kind: 'station', x, y, dir: 0, ch: 100, role: 'in', cars: 1, buf: Array(600).fill('N2') });
    put({ kind: 'extractor', x: x - 1, y, dir: 0 }); put({ kind: 'extractor', x: x - 1, y: y + 1, dir: 0 });
    put({ kind: 'extractor', x: x + 2, y, dir: 2 }); put({ kind: 'extractor', x: x + 2, y: y + 1, dir: 2 });
  }
  for (let i = 0; i < 7; i++) {
    const st = { kind: 'station', x: 36 + (i % 4) * 3, y: i < 4 ? 20 : 32, dir: i < 4 ? 3 : 1, ch: 100, role: 'out', buf: [] };
    big(st);
    for (const k of [0, 1]) { const q = slotPort({ ...st, big: true } as never, k); put({ kind: 'vent', x: q.tx, y: q.ty, dir: 0 }); }
  }
  return w;
}
