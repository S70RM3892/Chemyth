import { describe, expect, it } from 'vitest';
import { addRail, at, deserialize, STATION_CAP, layRail, newWorld, place, railOf, railRoute, remove, serialize, stationDests, stationRoutes, stationsOf, step, TRAIN_CAP, type Ent, type Train, type World, plainSave } from '../src/engine/world';
import { LINE_EXACT, lineRuns, TRAIN, trainAt } from '../src/ui/railruns';

// 決まった乱数
const rng = (seed: number) => { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; };
const station = (w: World, x: number, y: number, role: 'in' | 'out', ch = 1): Ent => { place(w, 'station', x, y, 0); const e = at(w, x, y)!; e.role = role; e.ch = ch; return e; };
/** 確かめ用：幅優先で、駅 a から駅 b までの線路のマスの数（たがいに両側からつながったマスだけを進む）。つながっていなければ -1 */
function bfsLen(w: World, a: Ent, b: Ent): number {
  const touch = (e: Ent) => { const out: string[] = []; for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) { if ((dx === -1 || dx === 2) && (dy === -1 || dy === 2)) continue; const k = `${e.x + dx},${e.y + dy}`; if (w.rails.has(k)) out.push(k); } return out; };
  const goal = new Set(touch(b)), dist = new Map<string, number>(), q: string[] = [];
  for (const k of touch(a)) { dist.set(k, 1); q.push(k); }
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], [x, y] = k.split(',').map(Number), m = w.rails.get(k)!;
    if (goal.has(k)) return dist.get(k)!;
    for (let d = 0; d < 4; d++) {
      if (!((m >> d) & 1)) continue;
      const nk = `${x + D[d][0]},${y + D[d][1]}`;
      if (dist.has(nk) || !(((w.rails.get(nk) || 0) >> ((d + 2) % 4)) & 1)) continue;
      dist.set(nk, dist.get(k)! + 1); q.push(nk);
    }
  }
  return -1;
}

describe('線路の道探し（行き先へ向かって探す）', () => {
  it('でたらめに敷いた網でも、道筋はいちばん短い（幅優先で確かめた長さと同じ）。つながらない組は null', () => {
    for (const seed of [3, 11, 29]) {
      const r = rng(seed), w = newWorld();
      // 60×40 の中に、縦横の線をでたらめに敷く（交わる所は分岐点になる）。ところどころ切る
      for (let i = 0; i < 26; i++) {
        const horiz = r() < 0.5, c = Math.floor(r() * (horiz ? 40 : 60)), s = Math.floor(r() * 30), e = s + 6 + Math.floor(r() * 24);
        layRail(w, horiz ? [[100 + s, 200 + c], [100 + Math.min(59, e), 200 + c]] : [[100 + c, 200 + Math.min(s, 30)], [100 + c, 200 + Math.min(39, e)]]);
      }
      const keys = [...w.rails.keys()];
      const sts: Ent[] = [];
      // 駅は、線路の外に並べ、短い支線で網につなぐ（つながない駅もある）
      for (let i = 0; i < 12; i++) {
        const e = station(w, 80 - (i % 2) * 6, 200 + i * 4, i % 3 === 0 ? 'out' : 'in');
        sts.push(e);
        if (i % 5 !== 4) { const [tx, ty] = keys[Math.floor(r() * keys.length)].split(',').map(Number); layRail(w, [[e.x + 2, e.y], [tx, e.y], [tx, ty]]); }
      }
      let linked = 0;
      for (const a of sts) for (const b of sts) {
        if (a === b) continue;
        const want = bfsLen(w, a, b), got = railRoute(w, a, b);
        expect(got ? got.tiles.length : -1, `${seed}: ${a.x},${a.y} → ${b.x},${b.y}`).toBe(want);
        if (got) {
          linked++;
          // 道筋は、隣り合うマスを順にたどる
          for (let i = 1; i < got.tiles.length; i++) expect(Math.abs(got.tiles[i][0] - got.tiles[i - 1][0]) + Math.abs(got.tiles[i][1] - got.tiles[i - 1][1])).toBe(1);
        }
      }
      expect(linked).toBeGreaterThan(10);
    }
  });
  it('行き先は線路のつながりで決まる：つながる降ろす駅があればそこだけ（近い順）。なければ同じ番線のすべて', () => {
    const w = newWorld();
    const a = station(w, 0, 100, 'in'), b1 = station(w, 40, 100, 'out'), b2 = station(w, 20, 110, 'out'), other = station(w, 10, 90, 'out', 2);
    expect(stationDests(w, a)).toEqual({ list: [b2, b1], laid: false });   // 線路なし：近い順にすべて（番線の違う駅は入らない）
    layRail(w, [[2, 100], [39, 100]]);
    expect(stationDests(w, a)).toEqual({ list: [b1], laid: true });
    expect(stationRoutes(w, a).map((q) => [q.dest, q.custom])).toEqual([[b1, true]]);
    layRail(w, [[20, 100], [20, 109]]);
    expect(stationDests(w, a).list).toEqual([b2, b1]);
    expect(stationDests(w, other).list).toEqual([]);                        // 降ろす駅には行き先がない
    // 番線を変えると、すぐ行き先が変わる
    b1.ch = 2;
    expect(stationDests(w, a).list).toEqual([b2]);
  });
  it('駅を置いた・消したは、同じ回のうちでもすぐ一覧に出る（設備の数が同じままでも）', () => {
    const w = newWorld();
    for (let i = 0; i < 4; i++) place(w, 'belt', 300 + i, 300, 0);
    const a = station(w, 0, 100, 'in');
    expect(stationsOf(w)).toEqual([a]);
    const before = w.ents.size;
    for (let i = 0; i < 4; i++) remove(w, 300 + i, 300);
    const b = station(w, 30, 100, 'out');
    expect(w.ents.size).toBe(before);
    expect(stationsOf(w)).toEqual([a, b]);
    remove(w, 30, 100);
    expect(stationsOf(w)).toEqual([a]);
  });
});

describe('列車の場所（道のりからじかに出す）', () => {
  /** これまでの出し方：曲がり角だけの折れ線を、道のりの割合でたどる */
  const slow = (pts: [number, number][], p: number) => {
    const segs = pts.slice(1).map((q, k) => Math.abs(q[0] - pts[k][0]) + Math.abs(q[1] - pts[k][1]));
    let d = Math.max(0, Math.min(1, p)) * segs.reduce((x, y) => x + y, 0), a = 0;
    while (a < segs.length - 1 && d > segs[a]) { d -= segs[a]; a++; }
    const f = segs[a] ? Math.min(1, d / segs[a]) : 0;
    return [pts[a][0] + (pts[a + 1][0] - pts[a][0]) * f, pts[a][1] + (pts[a + 1][1] - pts[a][1]) * f];
  };
  it('敷いた線路でも、自動の仮線路でも、折れ線をたどったときと同じ場所になる', () => {
    const w = newWorld();
    const a = station(w, 0, 100, 'in'), b = station(w, 40, 80, 'out');
    for (const laid of [false, true]) {
      if (laid) layRail(w, [[2, 100], [25, 100], [25, 81], [39, 81]]);
      const r = railOf(w, a, b)!;
      expect(r.custom).toBe(laid);
      for (let i = 0; i <= 200; i++) {
        const tr: Train = { p: i / 200, back: i % 2 === 1, cargo: [], wait: 0, to: `${b.x},${b.y}` };
        trainAt(w, a, tr);
        const [x, y] = slow(r.pts, tr.p);
        expect(TRAIN.x).toBeCloseTo(x, 6);
        expect(TRAIN.y).toBeCloseTo(y, 6);
      }
    }
    // 向き：行きは進む方、帰りは逆
    const go: Train = { p: 0.5, back: false, cargo: [], wait: 0, to: `${b.x},${b.y}` };
    trainAt(w, a, go);
    const dx = TRAIN.dx, dy = TRAIN.dy;
    trainAt(w, a, { ...go, back: true });
    expect([TRAIN.dx, TRAIN.dy]).toEqual([-dx, -dy]);
    // 行き先のない列車は、駅にいる
    trainAt(w, a, { p: 0, back: false, cargo: [], wait: 0 });
    expect([TRAIN.x, TRAIN.y]).toEqual([1, 101]);
  });
  it('走っている列車は自分の道筋を覚えていて、線路を敷き直すと選び直す。覚えた道筋はセーブに書かない', () => {
    const w = newWorld();
    const a = station(w, 0, 100, 'in'), b = station(w, 40, 100, 'out');
    layRail(w, [[2, 100], [39, 100]]);
    a.buf = Array(TRAIN_CAP).fill('N2');
    for (let i = 0; i < 30; i++) step(w, 1 / 60);
    const r1 = a.tr!.rt!;
    expect(r1.custom).toBe(true);
    expect(r1.tiles.length).toBe(38);
    expect(serialize(w)).not.toMatch(/"rt"|"rtRev"|"nb"/);
    // 遠回りの線路を足しても道筋は同じ長さ。途中を切ると、遠回りへ選び直す
    layRail(w, [[10, 100], [10, 95], [30, 95], [30, 100]]);
    step(w, 1 / 60);
    expect(a.tr!.rt!.tiles.length).toBe(38);
    w.rails.set('20,100', 0); w.rails.set('19,100', w.rails.get('19,100')! & ~1); w.rails.set('21,100', w.rails.get('21,100')! & ~4); w.rails.delete('20,100'); w.railRev++;
    step(w, 1 / 60);
    expect(a.tr!.rt!.tiles.length).toBe(48);
    expect(a.tr!.rt).not.toBe(r1);
    // 読み込んだあとも、そのまま走り続けて届く
    const w2 = deserialize(serialize(w))!, a2 = at(w2, 0, 100)!, b2 = at(w2, 40, 100)!;
    expect(a2.tr!.rt).toBeUndefined();
    for (let i = 0; i < 60 * 20; i++) step(w2, 1 / 60);
    expect(b2.buf!.length).toBe(TRAIN_CAP);
  });
});

describe('番線の色を重ねる線路', () => {
  const cover = (runs: Float64Array) => { const s = new Set<string>(); for (let i = 0; i < runs.length; i += 4) { if (runs[i + 1] === runs[i + 3]) for (let x = runs[i]; x < runs[i + 2]; x++) s.add(`h${x},${runs[i + 1]}`); else for (let y = runs[i + 1]; y < runs[i + 3]; y++) s.add(`v${runs[i]},${y}`); } return s; };
  const routeEdges = (w: World) => {
    const s = new Set<string>();
    for (const e of stationsOf(w)) if (e.role === 'in') for (const r of stationRoutes(w, e)) for (let i = 1; i < r.tiles.length; i++) {
      const [ax, ay] = r.tiles[i - 1], [bx, by] = r.tiles[i];
      s.add(ay === by ? `h${Math.min(ax, bx) + 0.5},${ay + 0.5}` : `v${ax + 0.5},${Math.min(ay, by) + 0.5}`);
    }
    return s;
  };
  it('駅が少ないうちは、列車が通る道筋だけ（通らない枝には色がつかない）', () => {
    const w = newWorld();
    station(w, 0, 100, 'in', 3); station(w, 40, 100, 'out', 3);
    layRail(w, [[2, 100], [39, 100]]);
    layRail(w, [[20, 100], [20, 120]]);   // だれも通らない枝
    const L = lineRuns(w);
    expect(L.map((l) => l.ch)).toEqual([3]);
    expect(cover(L[0].runs)).toEqual(routeEdges(w));
    expect(cover(L[0].runs).has('v20.5,110.5')).toBe(false);
    expect(L[0].stubs.length).toBe(8);
  });
  it('駅が多い工場では、つながった網の線路ぜんぶに色がつく（どの道筋も含む）。つながっていない線路にはつかない', () => {
    const w = newWorld();
    // 積む駅 42 × 降ろす駅 10 ＝ 420 組（LINE_EXACT より多い）。幹線 1 本に、駅ごとの支線
    layRail(w, [[0, 300], [200, 300]]);
    for (let i = 0; i < 42; i++) { station(w, i * 4, 290, 'in', 5); layRail(w, [[i * 4, 292], [i * 4, 300]]); }
    for (let i = 0; i < 10; i++) { station(w, i * 4, 310, 'out', 5); layRail(w, [[i * 4, 309], [i * 4, 300]]); }
    layRail(w, [[0, 400], [30, 400]]);    // どの駅にもつながらない線路
    expect(42 * 10).toBeGreaterThan(LINE_EXACT);
    const L = lineRuns(w);
    expect(L.map((l) => l.ch)).toEqual([5]);
    const got = cover(L[0].runs);
    for (const k of routeEdges(w)) expect(got.has(k), k).toBe(true);
    expect(got.has('h10.5,400.5')).toBe(false);
    expect(got.has('h190.5,300.5')).toBe(true);   // 幹線の先（列車は通らないが、同じ網）
    expect(L[0].stubs.length).toBe(52 * 4);
  });
});

describe('セーブ：駅と列車の荷をまとめて書く', () => {
  it('同じ物が続く所は「物質, 個数」。読み込むと元どおり。1 個ずつ書いた古いセーブも読める', () => {
    const w = newWorld();
    const a = station(w, 0, 100, 'in'), b = station(w, 40, 100, 'out');
    a.buf = [...Array(700).fill('N2'), 'O2', ...Array(3).fill('!H2'), 'N2', 'N2'];
    a.tr = { p: 0.4, back: false, cargo: Array(TRAIN_CAP).fill('!O2'), wait: 0, to: '40,100' };
    b.buf = ['H2'];
    const s = serialize(w);
    // 文字の中では、まとめた形で書かれている（1 個ずつ 700 回は書かない）
    expect(s).toContain('["N2",700,"O2","!H2",3,"N2",2]');
    expect(s).toContain(`"!O2",${TRAIN_CAP}]`);
    expect(s.length).toBeLessThan(3000);
    const flat = plainSave(s).ents.find((e: { x: number; y: number }) => e.x === 0 && e.y === 100);
    expect(flat.buf).toEqual(['N2', 700, 'O2', '!H2', 3, 'N2', 2]);
    expect(flat.tr.cargo).toEqual(['!O2', TRAIN_CAP]);
    const r = deserialize(s)!;
    expect(at(r, 0, 100)!.buf).toEqual(a.buf);
    expect(at(r, 0, 100)!.tr!.cargo).toEqual(a.tr.cargo);
    expect(at(r, 40, 100)!.buf).toEqual(['H2']);
    // 古い形
    const old = plainSave(s);
    for (const e of old.ents) if (e.x === 0 && e.y === 100) { e.buf = ['N2', 'N2', 'O2']; e.tr.cargo = ['!O2', '!O2']; }
    const r2 = deserialize(JSON.stringify(old))!;
    expect(at(r2, 0, 100)!.buf).toEqual(['N2', 'N2', 'O2']);
    expect(at(r2, 0, 100)!.tr!.cargo).toEqual(['!O2', '!O2']);
    // おかしな個数（負・小数・とても大きい）は、1 個か上限まで
    for (const e of old.ents) if (e.x === 0 && e.y === 100) e.buf = ['N2', -5, 'O2', 2.5, 'H2', 1e9];
    const r3 = deserialize(JSON.stringify(old))!.ents.get('0,100')!.buf!;
    expect(r3.slice(0, 3)).toEqual(['N2', 'O2', 'H2']);
    expect(r3.length).toBeLessThanOrEqual(20000);
    expect(new Set(r3.slice(2))).toEqual(new Set(['H2']));
  });
  it('大きな工場（積む駅 100・列車 300 本）：最初の 1 歩で固まらず、荷は降ろす駅へ届く', () => {
    const w = newWorld();
    w.research.push('yard');
    layRail(w, [[0, 300], [420, 300]]);
    const ins: Ent[] = [];
    for (let i = 0; i < 100; i++) { const e = station(w, i * 4, 290, 'in', 7); e.cars = 3; e.buf = Array(600).fill('N2'); ins.push(e); layRail(w, [[i * 4, 292], [i * 4, 300]]); }
    const outs: Ent[] = [];
    for (let i = 0; i < 6; i++) { const e = station(w, 404 + i * 3, 310, 'out', 7); outs.push(e); layRail(w, [[404 + i * 3, 309], [404 + i * 3, 300]]); }
    const t0 = performance.now();
    step(w, 1 / 30);
    // これまでは、駅の組ぜんぶの道筋を最初に探していた（この大きさで数百 ms〜）。余裕を大きくとって確かめる
    expect(performance.now() - t0).toBeLessThan(400);
    let got = 0;
    for (let i = 0; i < 30 * 120; i++) { step(w, 1 / 30); for (const o of outs) { got += o.buf!.length; o.buf = []; } w.fx.length = 0; }
    expect(got).toBeGreaterThan(TRAIN_CAP * 20);
    expect(ins.every((e) => e.xtr!.length === 2)).toBe(true);
    // 行き先は 6 か所に順番に配られる
    expect(stationDests(w, ins[0]).list.length).toBe(6);
  });
});

describe('置いた・消したあとの、正面の設備の覚え書き', () => {
  it('ベルトの先に設備を置くと、すぐそこへ流れる。消すと止まる（古い覚え書きを使わない）', () => {
    const w = newWorld();
    place(w, 'belt', 300, 300, 0);
    const b = at(w, 300, 300)!;
    b.item = { s: 'N2', p: 1, m: -1 };
    step(w, 1 / 60);
    expect(b.item).not.toBeNull();          // 先に何もない
    place(w, 'belt', 301, 300, 0);
    step(w, 1 / 60);
    expect(b.item).toBeNull();
    expect(at(w, 301, 300)!.item!.s).toBe('N2');
    b.item = { s: 'O2', p: 1, m: -1 };
    remove(w, 301, 300);
    step(w, 1 / 60);
    expect(b.item!.s).toBe('O2');           // 消したので、進めない
    expect(addRail(w, [300, 300], [301, 300])).toBe(true);
  });
});

describe('とても大きな工場：計算をまとめる', () => {
  /** 採取機 → 廃棄口の組を n 組ならべた工場（海の上：海水が採れる） */
  const farm = (n: number) => {
    const w = newWorld();
    let made = 0;
    for (let i = 0; made < n; i++) {
      const x = 400 + (i % 80) * 2, y = 400 + Math.floor(i / 80) * 2;
      if (place(w, 'extractor', x, y, 0) === null && place(w, 'vent', x + 1, y, 0) === null) made++;
    }
    return w;
  };
  const vented = (w: World) => Object.values(w.vented).reduce((a, b) => a + b, 0);
  it('採取機が 3000 台を超えると 4 歩に 1 回まとめて進めるが、採れる数は 1 台あたり同じ', () => {
    const small = farm(40), big = farm(3200);
    for (let i = 0; i < 30 * 40; i++) { step(small, 1 / 30); step(big, 1 / 30); small.fx.length = 0; big.fx.length = 0; }
    const a = vented(small) / 40, b = vented(big) / 3200;
    expect(a).toBeGreaterThan(20);
    expect(Math.abs(b - a) / a).toBeLessThan(0.03);
    // 稼働率も同じように上がっている
    expect(at(big, 400, 400)!.u).toBeGreaterThan(0.9);
  });
  it('飾りの出来事（煙など）は、1 歩に決まった数まで。数の記録は、すべて残る', () => {
    const w = farm(400);
    let most = 0;
    for (let i = 0; i < 300; i++) { step(w, 1 / 30); most = Math.max(most, w.fx.length); w.fx.length = 0; }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(48);
    expect(vented(w)).toBeGreaterThan(400 * 5);
  });
  it('セーブ：設備は、すべての欄を同じ並びで持つ形で読み込まれ、書き出しには空の欄・覚え書きが出ない。読んで書いても変わらない', () => {
    const w = newWorld();
    place(w, 'extractor', 300, 300, 0); place(w, 'belt', 301, 300, 0); place(w, 'separator', 302, 300, 0);
    station(w, 310, 300, 'in'); station(w, 330, 300, 'out');
    at(w, 310, 300)!.buf = Array(50).fill('N2');
    for (let i = 0; i < 200; i++) step(w, 1 / 60);
    const s1 = serialize(w);
    const entsPart = s1.slice(s1.indexOf('"ents":'), s1.indexOf(',"chapter"'));
    expect(entsPart.length).toBeGreaterThan(100);
    expect(entsPart).not.toMatch(/"(nb|nbRev|pl|own|rt|rtRev|rtVer|res|resAt)"/);
    expect(entsPart).not.toMatch(/:null[,}]|:false[,}]/);
    const r = deserialize(s1)!;
    const keys = (e: Ent) => Object.keys(e).join(',');
    const real = [...r.ents.values()].filter((e) => e.kind !== 'part' && e.kind !== 'hub');
    expect(new Set(real.map(keys)).size).toBe(1);
    // 2×2 の設備の残りのマスは、設備そのものを指している
    expect(at(r, 311, 301)).toBe(at(r, 310, 300));
    const strip = (s: string) => s.replace(/"savedAt":\d+/, '');
    // 読み込むと、納品所は並びの最後に置き直され、荷の「動かした歩」は 0 に戻る（これまでどおり）。そのあとは、読んで書いても同じ
    const s2 = serialize(r);
    expect(strip(serialize(deserialize(s2)!))).toBe(strip(s2));
  });
});

describe('自動の仮線路をまとめて描く', () => {
  it('同じ行・同じ列を通る仮線路は 1 本になり、どの仮線路の道筋も含む', async () => {
    const { autoRuns } = await import('../src/ui/railruns');
    const w = newWorld();
    const ins: Ent[] = [], outs: Ent[] = [];
    for (let i = 0; i < 40; i++) ins.push(station(w, 500 + (i % 8) * 6, 500 + Math.floor(i / 8) * 4, 'in', 9));
    for (let i = 0; i < 3; i++) outs.push(station(w, 600 + i * 4, 480, 'out', 9));
    const a = autoRuns(w);
    expect(a.pairs).toBe(120);
    expect(a.list.map((l) => l.ch)).toEqual([9]);
    const runs = a.list[0].runs;
    // 横の線は積む駅の行ごと（ずらしは 5 とおり）、縦の線は「降ろす駅 × ずらし」まで：1 本ずつ描くより、ずっと少ない
    expect(runs.length / 4).toBeLessThan(40 + 3 * 5 + 1);
    const on = (x0: number, y0: number, x1: number, y1: number) => {
      for (let k = 0; k < runs.length; k += 4) if (runs[k] <= Math.min(x0, x1) + 1e-9 && runs[k + 2] >= Math.max(x0, x1) - 1e-9 && runs[k + 1] <= Math.min(y0, y1) + 1e-9 && runs[k + 3] >= Math.max(y0, y1) - 1e-9) return true;
      return false;
    };
    for (const e of ins) for (const d of outs) {
      const pts = railOf(w, e, d)!.pts;
      for (let i = 1; i < pts.length; i++) expect(on(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]), `${e.x},${e.y} → ${d.x},${d.y} 区間 ${i}`).toBe(true);
    }
    // 線路でつなぐと、その駅の仮線路は消える
    layRail(w, [[ins[0].x + 2, ins[0].y], [outs[0].x - 1, ins[0].y], [outs[0].x - 1, outs[0].y]]);
    expect(autoRuns(w).pairs).toBeLessThan(120);
  });
});

describe('図鑑の星', () => {
  it('付ける・外す。セーブしても残る。壊れた値は読まない', async () => {
    const { starred, toggleStar, readStudy, STAR_MAX } = await import('../src/engine/study');
    const w = newWorld();
    expect(starred(w.study, 'haber-bosch')).toBe(false);
    expect(toggleStar(w.study, 'haber-bosch')).toBe(true);
    expect(toggleStar(w.study, 'water-electrolysis')).toBe(true);
    expect(starred(w.study, 'haber-bosch')).toBe(true);
    const r = deserialize(serialize(w))!;
    expect(r.study.stars).toEqual(['haber-bosch', 'water-electrolysis']);
    expect(toggleStar(r.study, 'haber-bosch')).toBe(false);
    expect(r.study.stars).toEqual(['water-electrolysis']);
    expect(readStudy({ stars: ['a', 'a', 5, null, 'b'] }).stars).toEqual(['a', 'b']);
    expect(readStudy({ stars: 'x' }).stars).toBeUndefined();
    const s = readStudy({});
    for (let i = 0; i < STAR_MAX + 5; i++) toggleStar(s, `r${i}`);
    expect(s.stars!.length).toBe(STAR_MAX);
    expect(s.stars![0]).toBe('r5');
  });
});

describe('降ろす駅の詰まり', () => {
  const vented = (w: World) => Object.values(w.vented).reduce((a, b) => a + b, 0);
  it('出口の先が受け取るかぎり、1 歩のうちに何荷でも出す（出せる量が、計算の歩数で決まらない）', () => {
    const w = newWorld();
    const o = station(w, 300, 300, 'out');
    // 正面（向き 0 ＝ 東）の 2 つの口の先に、廃棄口
    place(w, 'vent', 302, 300, 0); place(w, 'vent', 302, 301, 0);
    o.buf = Array(1000).fill('N2');
    step(w, 1 / 30);
    expect(o.buf.length).toBe(0);
    expect(vented(w)).toBe(1000);
  });
  it('先頭の物質を出口の先が受け取らなくても、うしろの別の物質は出ていく', () => {
    const w = newWorld();
    const o = station(w, 300, 300, 'out');
    place(w, 'tank', 302, 300, 0);
    const tank = at(w, 302, 300)!;
    tank.sub = 'O2'; tank.cnt = 5;          // O₂ のタンク：N₂ は受け取らない
    o.buf = [...Array(50).fill('N2'), ...Array(30).fill('O2'), ...Array(20).fill('N2')];
    step(w, 1 / 30);
    expect(tank.cnt).toBe(35);
    expect(o.buf).toEqual(Array(70).fill('N2'));
  });
  it('満杯で出せない降ろす駅があっても、列車はそこで止まり続けず、空いている駅へ運ぶ', async () => {
    const { TRAIN_GIVE_UP } = await import('../src/engine/world');
    const w = newWorld();
    const a = station(w, 300, 300, 'in'), dead = station(w, 320, 300, 'out'), good = station(w, 320, 310, 'out');
    place(w, 'vent', 322, 310, 0); place(w, 'vent', 322, 311, 0);
    // dead：出口の先に何もないので、ためるだけ。もう満杯
    dead.buf = Array(STATION_CAP).fill('O2');
    // 走っている途中で満杯になった駅へ向かう列車：着いても降ろせない
    a.tr = { p: 0.99, back: false, cargo: Array(100).fill('N2'), wait: 0, to: '320,300' };
    for (let i = 0; i < 30 * (TRAIN_GIVE_UP + 1); i++) step(w, 1 / 30);
    expect(a.tr.back || a.tr.p <= 0 || a.tr.to === '320,310').toBe(true);   // 引き返した（か、もう出直した）
    // そのあとは、満杯の駅を飛ばして、空いている駅へ運び続ける
    for (let i = 0; i < 30 * 90; i++) { if (a.buf!.length < 200) a.buf!.push(...Array(200).fill('N2')); step(w, 1 / 30); w.fx.length = 0; }
    expect(dead.buf.length).toBe(STATION_CAP);
    expect(vented(w)).toBeGreaterThan(300);
    expect(a.tr.to).toBe('320,310');
  });
  it('降ろす駅がどこも満杯なら、列車は積む駅で待つ（荷を持ったまま走り回らない）', () => {
    const w = newWorld();
    const a = station(w, 300, 300, 'in'), dead = station(w, 320, 300, 'out');
    dead.buf = Array(STATION_CAP).fill('O2');
    a.buf = Array(300).fill('N2');
    for (let i = 0; i < 30 * 20; i++) step(w, 1 / 30);
    expect(a.tr!.p).toBe(0);
    expect(a.tr!.cargo.length + a.buf.length).toBe(300);
  });
});

describe('列車の点検', () => {
  it('行き先のない番線・どこも満杯の番線・満杯の降ろす駅を、理由つきで挙げる。流れている番線は挙げない', async () => {
    const { trainTroubles } = await import('../src/engine/world');
    const w = newWorld();
    // 1 番線：流れている
    const a = station(w, 300, 300, 'in', 1); station(w, 320, 300, 'out', 1);
    a.buf = Array(50).fill('N2');
    // 7 番線：降ろす駅がない（積む駅 2 か所。1 か所は荷がないので数えない）
    const b = station(w, 300, 320, 'in', 7), b2 = station(w, 300, 330, 'in', 7); station(w, 300, 340, 'in', 7);
    b.buf = Array(STATION_CAP).fill('Fe2O3'); b2.buf = Array(10).fill('Fe2O3');
    // 9 番線：降ろす駅がすべて満杯
    const c = station(w, 300, 360, 'in', 9), full = station(w, 320, 360, 'out', 9);
    c.buf = Array(20).fill('SO2'); full.buf = Array(STATION_CAP).fill('!C');
    for (let i = 0; i < 30 * 5; i++) step(w, 1 / 30);
    const t = trainTroubles(w);
    expect(t.map((x) => `${x.type}:${x.ch}`).sort()).toEqual(['allfull:9', 'nodest:7', 'outfull:9']);
    const nd = t.find((x) => x.type === 'nodest')!;
    expect(nd.at).toBe(b);           // いちばんたまっている駅へ案内する
    expect(nd.s).toBe('Fe2O3');
    expect(nd.stations).toBe(2);
    expect(nd.trains).toBe(2);       // 積んだまま出られない列車
    expect(t.find((x) => x.type === 'outfull')!.s).toBe('C');   // 試薬棚から来た印（!）は外す
    // 降ろす駅を置けば、消える
    station(w, 320, 320, 'out', 7);
    expect(trainTroubles(w).some((x) => x.type === 'nodest')).toBe(false);
  });
});

describe('セーブの大きさ', () => {
  it('同じ設定の設備は 1 つの型にまとめ、場所は前の設備との差で書く。読み戻すと同じ工場になる', async () => {
    const { packEnts, unpackEnts } = await import('../src/engine/world');
    const w = newWorld();
    for (let i = 0; i < 400; i++) { place(w, 'extractor', 300 + (i % 40) * 2, 300 + Math.floor(i / 40) * 3, 1); place(w, 'belt', 300 + (i % 40) * 2, 301 + Math.floor(i / 40) * 3, 0); }
    const a = station(w, 500, 300, 'in', 12), o = station(w, 520, 300, 'out', 12);
    a.buf = [...Array(40).fill('N2'), ...Array(3).fill('!O2')];
    a.tr = { p: 0.25, back: false, cargo: Array(7).fill('N2'), wait: 1.5, to: '520,300' };
    a.xtr = [{ p: 0.5, back: true, cargo: [], wait: 0, to: '520,300' }];
    a.cars = 2; o.memo = '受け取り';
    at(w, 300, 301)!.item = { s: 'air', p: 0.5, m: 0, n: 3 };
    for (let i = 0; i < 40; i++) step(w, 1 / 30);
    const json = serialize(w), d = JSON.parse(json);
    expect(Array.isArray(d.ents)).toBe(false);
    // 400 台の採取機と 400 本のベルトが、数個の型に収まる
    expect(d.ents.c.length).toBeLessThan(30);
    const plain = JSON.stringify(plainSave(json).ents);
    expect(JSON.stringify(d.ents).length).toBeLessThan(plain.length / 3);
    // 読み戻し：設備の数・場所・中身が同じ
    const w2 = deserialize(json)!;
    expect(w2.ents.size).toBe(w.ents.size);
    const a2 = at(w2, 500, 300)!;
    expect(a2.ch).toBe(12); expect(a2.role).toBe('in'); expect(a2.cars).toBe(2);
    expect(a2.buf).toEqual(a.buf);
    expect(a2.tr!.cargo).toEqual(a.tr!.cargo); expect(a2.tr!.to).toBe(a.tr!.to); expect(a2.tr!.p).toBeCloseTo(a.tr!.p, 2);
    expect(a2.xtr!.length).toBe(1); expect(a2.xtr![0].back).toBe(a.xtr![0].back);
    expect(at(w2, 520, 300)!.memo).toBe('受け取り');
    for (const e of w.ents.values()) {
      if (e.kind === 'part') continue;   // 大きな設備の残りのマス：at() は持ち主を返す
      const f = at(w2, e.x, e.y)!;
      expect(f.kind).toBe(e.kind); expect(f.dir).toBe(e.dir);
      if (e.item) { expect(f.item!.s).toBe(e.item.s); expect(f.item!.n ?? 1).toBe(e.item.n ?? 1); }
      if (e.kind === 'extractor') expect(f.n ?? 0).toBe(e.n ?? 0);
    }
    // 読んで書くと、同じ形に落ち着く（型の並びは、読み込んだ順で決まる）
    const again = serialize(w2);
    expect(JSON.stringify(JSON.parse(serialize(deserialize(again)!)).ents)).toBe(JSON.stringify(JSON.parse(again).ents));
    expect(JSON.parse(again).ents.c.length).toBe(d.ents.c.length);
    // 型と行の往復
    const back = unpackEnts(packEnts([...w.ents.values()]));
    expect(back.length).toBe(w.ents.size);
  });
  it('これまでの形（設備を 1 つずつ並べた配列）のセーブも読める。壊れた型・行は、その分だけ捨てて、残りを読む', async () => {
    const { unpackEnts } = await import('../src/engine/world');
    const w = newWorld();
    place(w, 'belt', 300, 300, 0); place(w, 'belt', 301, 300, 0); station(w, 310, 300, 'in', 3);
    const json = serialize(w), old = plainSave(json);
    expect(Array.isArray(old.ents)).toBe(true);
    const w2 = deserialize(JSON.stringify(old))!;
    expect(w2.ents.size).toBe(w.ents.size);
    expect(at(w2, 310, 300)!.ch).toBe(3);
    // 壊れた入れ物
    for (const bad of [null, 5, 'x', {}, { c: 1, g: 2 }, { c: [], g: [[9, 1, [0, 0]]] }, { c: [{ o: { kind: 'belt' }, k: [] }], g: [[0, 5, [1]], 'x', [0]] }]) expect(Array.isArray(unpackEnts(bad))).toBe(true);
    const d = JSON.parse(json);
    d.ents.g.push([999, 3, [0, 0, 0, 0]], 'junk');
    const w3 = deserialize(JSON.stringify(d))!;
    expect(w3.ents.size).toBe(w.ents.size);
  });
});
