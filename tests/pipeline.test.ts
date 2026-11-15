import { describe, expect, it } from 'vitest';
import { at, deserialize, newWorld, place, plainSave, serialize, setPipe, stationCap, stationDests, step, trainTroubles, pipeFlow, flows, RUSH_GAP, RUSH_MS, RUSH_N, rushCandidates, rushReward, type Ent, type World } from '../src/engine/world';
import { decodeBlueprint, encodeBlueprint } from '../src/engine/blueprint';
import { ACHIEVEMENTS } from '../src/engine/achieve';

const station = (w: World, x: number, y: number, role: 'in' | 'out', ch = 1, pipe = false): Ent => {
  place(w, 'station', x, y, 0);
  const e = at(w, x, y)!;
  e.role = role; e.ch = ch;
  if (pipe) expect(setPipe(w, e, true)).toBe(true);
  return e;
};
const vented = (w: World) => Object.values(w.vented).reduce((a, b) => a + b, 0);
const run = (w: World, secs: number, hz = 20) => { for (let i = 0; i < secs * hz; i++) { step(w, 1 / hz); w.fx.length = 0; } };
/** 研究済みの工場 */
const lab = (...ids: string[]) => { const w = newWorld(); w.research.push('pipeline', ...ids); return w; };

describe('パイプライン（気体と液体を、距離に関係なく送る）', () => {
  it('研究を終えるまでは切り替えられない。切り替えると、列車に積んであった荷は駅に戻る', () => {
    const w = newWorld();
    const a = station(w, 300, 300, 'in', 2);
    expect(setPipe(w, a, true)).toBe(false);
    expect(a.pipe).toBeUndefined();
    a.tr = { p: 0, back: false, cargo: Array(30).fill('N2'), wait: 0 };
    w.research.push('pipeline');
    expect(setPipe(w, a, true)).toBe(true);
    expect(a.pipe).toBe(true);
    expect(a.tr).toBeUndefined();
    expect(a.buf!.length).toBe(30);
    expect(setPipe(w, a, false)).toBe(true);
    expect(a.pipe).toBeUndefined();
  });
  it('5,000 マス先でも、次の 1 歩で届く（列車なら数分かかる）', () => {
    const w = lab();
    const a = station(w, 300, 300, 'in', 7, true), b = station(w, 5300, 300, 'out', 7, true);
    place(w, 'vent', 5302, 300, 0); place(w, 'vent', 5302, 301, 0);
    a.buf = Array(100).fill('N2');
    step(w, 1 / 20);
    expect(a.buf.length + (b.buf?.length ?? 0) + vented(w)).toBe(100);
    expect((b.buf?.length ?? 0) + vented(w)).toBeGreaterThan(0);
    run(w, 2);
    expect(vented(w)).toBe(100);
    expect(a.tr).toBeUndefined();     // 列車は作られない
    expect(w.piped).toBe(100);
  });
  it('固体は流れない（入口で止まり、理由の印がつく）。気体・液体・水溶液は流れる', () => {
    expect(flows('N2')).toBe(true);
    expect(flows('H2O')).toBe(true);
    expect(flows('NaCl')).toBe(false);
    expect(flows('Fe2O3')).toBe(false);
    expect(flows('e')).toBe(false);
    const w = lab();
    const a = station(w, 300, 300, 'in', 7, true);
    station(w, 400, 300, 'out', 7, true);
    place(w, 'belt', 299, 300, 0);
    const belt = at(w, 299, 300)!;
    belt.item = { s: 'NaCl', p: 1, m: 0 };
    run(w, 1);
    expect(belt.item).not.toBe(null);        // ベルトで待つ
    expect(a.bad).toBe('NaCl');
    expect(a.buf?.length ?? 0).toBe(0);
    belt.item = { s: 'H2O', p: 1, m: 0, n: 5 };
    run(w, 1);
    expect(belt.item).toBe(null);
    // 列車の駅は、固体も受け取る
    const t = station(w, 300, 320, 'in', 9);
    place(w, 'belt', 299, 320, 0);
    at(w, 299, 320)!.item = { s: 'NaCl', p: 1, m: 0 };
    run(w, 1);
    expect(at(w, 299, 320)!.item).toBe(null);
    expect(t.bad).toBeUndefined();
  });
  it('送り口 1 つから送れるのは、1 秒に決まった数まで。研究「大口径の管」で 4 倍', () => {
    for (const [ids, want] of [[[], 300], [['bigpipe'], 1200]] as [string[], number][]) {
      const w = lab(...ids);
      expect(pipeFlow(w)).toBe(want);
      const a = station(w, 300, 300, 'in', 7, true);
      for (let k = 0; k < 6; k++) { station(w, 400 + k * 4, 300, 'out', 7, true); place(w, 'vent', 402 + k * 4, 300, 0); place(w, 'vent', 402 + k * 4, 301, 0); }
      run(w, 1);                              // 何も入っていない間に、1 秒ぶんまでしかためない
      a.buf = Array(20000).fill('O2');
      const before = a.buf.length;
      run(w, 5);
      const sent = before - a.buf.length;
      expect(sent).toBeGreaterThanOrEqual(want * 5);
      expect(sent).toBeLessThanOrEqual(want * 6 + 1);
    }
  });
  it('受け口がいくつもあれば、順番に配る。満杯の受け口は飛ばす', () => {
    const w = lab();
    const a = station(w, 300, 300, 'in', 7, true);
    const outs = [0, 1, 2].map((k) => station(w, 400, 300 + k * 10, 'out', 7, true));
    outs[1].buf = Array(stationCap(w)).fill('N2');     // 出口の先が何もないので、満杯のまま
    for (let i = 0; i < 20 * 6; i++) { if (a.buf!.length < 100) a.buf!.push(...Array(100).fill('O2')); step(w, 1 / 20); }
    expect(outs[1].buf.filter((s) => s === 'O2').length).toBe(0);
    const n0 = outs[0].buf!.length, n2 = outs[2].buf!.length;
    expect(n0).toBeGreaterThan(100);
    expect(Math.abs(n0 - n2)).toBeLessThanOrEqual(120);
  });
  it('列車の番線とパイプラインの番号は、同じ数でも別の路線', () => {
    const w = lab();
    const tIn = station(w, 300, 300, 'in', 5), pOut = station(w, 400, 300, 'out', 5, true);
    const pIn = station(w, 300, 320, 'in', 5, true), tOut = station(w, 400, 320, 'out', 5);
    expect(stationDests(w, tIn).list).toEqual([tOut]);
    expect(stationDests(w, pIn).list).toEqual([pOut]);
    // 切り替えると、行き先も替わる
    setPipe(w, tOut, true);
    expect(stationDests(w, tIn).list).toEqual([]);
    expect(stationDests(w, pIn).list.length).toBe(2);
  });
  it('点検：受け口のないパイプラインを挙げる。受け口を置けば消える', () => {
    const w = lab();
    const a = station(w, 300, 300, 'in', 7, true);
    a.buf = Array(50).fill('N2');
    run(w, 1);
    const t = trainTroubles(w);
    expect(t.length).toBe(1);
    expect(t[0]).toMatchObject({ type: 'nodest', ch: 7, pipe: true, s: 'N2' });
    station(w, 400, 300, 'out', 7, true);
    expect(trainTroubles(w).length).toBe(0);
  });
  it('セーブと設計図に残る', () => {
    const w = lab();
    const a = station(w, 300, 300, 'in', 7, true);
    station(w, 400, 300, 'out', 7, true);
    a.buf = ['N2', 'N2'];
    const json = serialize(w);
    const st = plainSave(json).ents.filter((e: Ent) => e.kind === 'station');
    expect(st.every((e: Ent) => e.pipe === true)).toBe(true);
    const w2 = deserialize(json)!;
    expect(at(w2, 300, 300)!.pipe).toBe(true);
    expect(at(w2, 400, 300)!.pipe).toBe(true);
    // 駅でないものに付いていたら、読まない
    const d = plainSave(json); d.ents.push({ kind: 'belt', x: 900, y: 900, dir: 0, pipe: true });
    expect(at(deserialize(JSON.stringify(d))!, 900, 900)!.pipe).toBeUndefined();
    const code = encodeBlueprint('管', [{ kind: 'station', dx: 0, dy: 0, dir: 0, ch: 7, role: 'in', pipe: true }, { kind: 'station', dx: 4, dy: 0, dir: 0, ch: 7, role: 'out' }]);
    const back = decodeBlueprint(code)!.stamps;
    expect(back[0].pipe).toBe(true);
    expect(back[1].pipe).toBeUndefined();
  });
  it('実績に、パイプラインと急ぎの注文がある', () => {
    const w = lab();
    const ids = ACHIEVEMENTS.map((a) => a.id);
    for (const id of ['pipe-1', 'pipe-100k', 'rush-1', 'rush-5']) expect(ids).toContain(id);
    w.piped = 5;
    expect(ACHIEVEMENTS.find((a) => a.id === 'pipe-1')!.prog(w, 0)[0]).toBe(5);
  });
});

describe('急ぎの注文（くり返し出る、時間つきの注文）', () => {
  /** 納品所へじかに降ろす駅のある工場。反応を 3 つ覚えている */
  const mk = () => {
    const w = newWorld();
    w.learned.push('haber-bosch', 'water-electrolysis', 'sulfur-burn');
    const hub = [...w.ents.values()].find((e) => e.kind === 'hub' && !at(w, e.x - 1, e.y) && !at(w, e.x - 2, e.y) && !at(w, e.x - 1, e.y + 1) && !at(w, e.x - 2, e.y + 1))!;
    const o = station(w, hub.x - 2, hub.y, 'out', 8);
    return { w, o };
  };
  const until = (w: World, ev: string, max = 20 * 60 * 20) => { for (let i = 0; i < max; i++) { w.events.length = 0; step(w, 1 / 20); if (w.events.includes(ev)) return true; } return false; };

  it('反応を 3 つ覚えるまでは出ない。覚えたら、しばらくして、覚えた反応の生成物が出る', () => {
    const blank = newWorld();
    run(blank, RUSH_GAP / 1000 + 5);
    expect(blank.rush).toBe(null);
    const { w } = mk();
    expect(rushCandidates(w).length).toBeGreaterThan(0);
    expect(until(w, 'rush-new')).toBe(true);
    expect(w.playMs).toBeGreaterThanOrEqual(RUSH_GAP);
    expect(rushCandidates(w)).toContain(w.rush!.s);
    expect(w.rush!.n).toBe(RUSH_N[0]);
    expect(w.rush!.reward).toBe(rushReward(0));
    expect(w.rush!.until - w.playMs).toBeGreaterThan(RUSH_MS - 1000);
  });
  it('数を納めると研究点。続けて間に合わせるほど、数も研究点も増える。ひと山で納めても、数えまちがえない', () => {
    const { w, o } = mk();
    expect(until(w, 'rush-new')).toBe(true);
    const r1 = { ...w.rush! }, p0 = w.points;
    o.buf = Array(r1.n + 25).fill(r1.s);                // 余分に 25 個
    w.events.length = 0; step(w, 1 / 20);
    expect(w.events).toContain('rush-done');
    expect(w.rush).toBe(null);
    expect(w.rushStreak).toBe(1);
    expect(w.lastRush).toMatchObject({ s: r1.s, n: r1.n, ok: true });
    expect(w.points - p0).toBeGreaterThanOrEqual(r1.reward);
    expect(w.delivered[r1.s]).toBe(r1.n + 25);
    expect(until(w, 'rush-new')).toBe(true);
    expect(w.rush!.n).toBe(RUSH_N[1]);
    expect(w.rush!.reward).toBe(rushReward(1));
    expect(w.rush!.reward).toBeGreaterThan(r1.reward);
  });
  it('時間切れなら、続けた回数は 0 に戻る。締め切りは、工場を動かしている時間で数える', () => {
    const { w, o } = mk();
    expect(until(w, 'rush-new')).toBe(true);
    w.rushStreak = 3;
    const r = { ...w.rush! };
    o.buf = Array(2).fill(r.s);
    step(w, 1 / 20);
    expect(w.rush!.got).toBe(2);
    expect(until(w, 'rush-fail')).toBe(true);
    expect(w.playMs).toBeGreaterThanOrEqual(r.until);
    expect(w.rushStreak).toBe(0);
    expect(w.lastRush).toMatchObject({ s: r.s, got: 2, ok: false });
    expect(w.rush).toBe(null);
  });
  it('いまの指令の物質は、急ぎの注文に出ない。課題の工場では出ない', async () => {
    const { currentGoal } = await import('../src/engine/world');
    const { w } = mk();
    const g = currentGoal(w)!;
    expect(rushCandidates(w)).not.toContain(g.s);
    const { w: c } = mk();
    c.noRush = true;
    run(c, RUSH_GAP / 1000 + 5);
    expect(c.rush).toBe(null);
  });
  it('セーブしても残る。壊れた値は読まない', () => {
    const { w } = mk();
    expect(until(w, 'rush-new')).toBe(true);
    w.rush!.got = 3; w.rushStreak = 2; w.piped = 77;
    const w2 = deserialize(serialize(w))!;
    expect(w2.rush).toEqual(w.rush);
    expect(w2.rushStreak).toBe(2);
    expect(w2.rushNo).toBe(w.rushNo);
    expect(w2.piped).toBe(77);
    const d = JSON.parse(serialize(w));
    d.rush = { s: 'no-such-thing', n: 5, got: 0, until: 1, reward: 1 }; d.rushStreak = -4; d.piped = 'x';
    const w3 = deserialize(JSON.stringify(d))!;
    expect(w3.rush).toBe(null);
    expect(w3.rushStreak).toBe(0);
    expect(w3.piped).toBe(0);
  });
});
