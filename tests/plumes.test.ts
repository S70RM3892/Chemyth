import { describe, expect, it } from 'vitest';
import { newPlume, NO_TURN, plumePaint, plumeRadius, plumeReact, SINK, stepPlume, type Plume } from '../src/ui/plumephys';

// 決まった乱数（同じ結果になるように）
const rng = (seed = 1) => { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; };
const run = (p: Plume, sec: number, dt = 1 / 60) => { const path: Plume[] = []; for (let t = 0; t < sec; t += dt) { if (!stepPlume(p, dt)) break; path.push({ ...p }); } return path; };

describe('廃棄口の気体の動き（SPEC2 §6.M M13）', () => {
  it('軽い気体は重い気体より速く昇る。H₂ は昇り、Cl₂ は下り、HCN（M 27.0）はほぼ空気と同じ', () => {
    const r = rng();
    const h2 = newPlume('H2', 0, 0, false, r), nh3 = newPlume('NH3', 0, 0, false, r), cl2 = newPlume('Cl2', 0, 0, false, r);
    stepPlume(h2, 0.5); stepPlume(nh3, 0.5); stepPlume(cl2, 0.5);
    expect(h2.y).toBeLessThan(nh3.y);
    expect(nh3.y).toBeLessThan(0);
    expect(cl2.y).toBeGreaterThan(0);
  });
  it('重い気体（Cl₂）は、出口から 0.3 マスより下へは行かず、8 秒のあいだ横に広がり続ける', () => {
    const p = newPlume('Cl2', 5, 5, false, rng(3));
    p.life = 20;
    const path = run(p, 8);
    for (const q of path) expect(q.y).toBeLessThanOrEqual(5 + SINK + 1e-9);
    expect(path[path.length - 1].pool).toBe(true);
    const r1 = plumeRadius(path[Math.floor(path.length / 2)]), r2 = plumeRadius(path[path.length - 1]);
    expect(r2).toBeGreaterThan(r1);
  });
  it('熱い出口は、はじめは少し重い気体も昇る（重い・軽いは同じ温度で比べる。CO₂ は M 44）', () => {
    const cold = newPlume('CO2', 0, 0, false, rng(5)), hot = newPlume('CO2', 0, 0, true, rng(5));
    stepPlume(cold, 0.2); stepPlume(hot, 0.2);
    expect(hot.y).toBeLessThan(0);
    expect(cold.y).toBeGreaterThan(0);
  });
  it('無色の気体は輪で描き、塗らない（H₂・NH₃・CO₂・HCl）', () => {
    for (const id of ['H2', 'NH3', 'CO2', 'HCl', 'O2']) {
      const p = newPlume(id, 0, 0, false, rng());
      expect(plumePaint(p), id).toEqual({ ring: true, fill: null, k: 0 });
    }
  });
  it('色のある気体は、その色で塗る（Cl₂ は黄緑、NO₂ は赤褐色）', () => {
    expect(plumePaint(newPlume('Cl2', 0, 0, false, rng())).fill).toBe('#b9cf4a');
    expect(plumePaint(newPlume('NO2', 0, 0, false, rng())).fill).toBe('#a4532c');
  });
  it('NO は無色で出て、0.6 秒で赤褐色（NO₂）になる。色の割合は単調にふえる', () => {
    const p = newPlume('NO', 0, 0, false, rng());
    p.life = 5;
    let last = -1;
    for (let t = 0; t < 1; t += 0.05) { stepPlume(p, 0.05); const s = plumePaint(p); expect(s.k).toBeGreaterThanOrEqual(last); last = s.k; }
    expect(last).toBe(1);
    const q = newPlume('NO', 0, 0, false, rng()); stepPlume(q, NO_TURN * 0.25);
    expect(plumePaint(q).ring).toBe(true);
  });
  it('水蒸気は、出口から 0.3 マスまでは輪（無色）、その先だけ白い湯気', () => {
    const p = newPlume('H2O', 0, 0, false, rng());
    p.life = 10;
    expect(plumePaint(p).ring).toBe(true);
    let sawWhite = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      stepPlume(p, 1 / 60);
      const s = plumePaint(p);
      if (-p.y < 0.3) expect(s.ring).toBe(true); else { expect(s.ring).toBe(false); sawWhite = true; }
    }
    expect(sawWhite).toBe(true);
  });
  it('NH₃ と HCl の雲が重なったときだけ、白煙の NH₄Cl ができ、1 粒ずつ使う', () => {
    const r = rng(7);
    const a = newPlume('NH3', 3.2, 4.2, false, r), b = newPlume('HCl', 3.6, 4.5, false, r), c = newPlume('NH3', 9.5, 4.5, false, r);
    // 雲は広がってから重なる（出たばかりの粒は半径 0.15 マス）
    for (const q of [a, b, c]) q.age = q.life * 0.6;
    const list = [a, b, c];
    expect(plumeReact(list, 1, r)).toEqual([]); // 4 コマに 1 回
    const made = plumeReact(list, 4, r);
    expect(made.map((p) => p.sid)).toEqual(['NH4Cl']);
    expect(plumePaint(made[0])).toEqual({ ring: false, fill: '#f4f4f2', k: 1 });
    expect(list.map((p) => p.sid)).toEqual(['NH3']);
    // 片方だけでは何もできない。離れていてもできない
    expect(plumeReact([newPlume('NH3', 0, 0, false, r), newPlume('NH3', 0.2, 0.1, false, r)], 8, r)).toEqual([]);
    expect(plumeReact([newPlume('NH3', 0, 0, false, r), newPlume('HCl', 2, 0, false, r)], 8, r)).toEqual([]);
  });
  it('動きを減らす設定では、出たときの形のまま止まる', () => {
    const p = newPlume('H2', 1, 1, false, rng());
    const x = p.x, y = p.y;
    stepPlume(p, 0.5, true);
    expect([p.x, p.y]).toEqual([x, y]);
  });
});
