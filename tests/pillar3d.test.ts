import { describe, expect, it } from 'vitest';
import { camera3, riseTo } from '../src/ui/three';

/** 立体表示で、指令を達成したときの光の柱の先（地面から真上へ 14 マス）がどこに見えるか */
describe('立体表示の光の柱', () => {
  it('うんと寄った低い画面でも、柱は足もとから上へ伸びる（下へ向かない）', () => {
    // iPad の Safari の横向き（画面の高さ 700 ほど）で、いちばん寄ったとき。14 マスの高さはカメラより後ろになる
    const cw = 1024, ch = 700, c = camera3({ x: 0, y: 0, z: 110 }, cw, ch);
    const [, by] = c.project(0, 0.5, 0);
    // そのまま投影すると、画面の下のはるか外（ここが、柱が下を向いた原因）
    expect(c.project(0, 0.5, 14)[1]).toBeGreaterThan(by);
    const top = riseTo(c.project, 0, 0.5, 14, -ch)!;
    expect(top).not.toBeNull();
    expect(top[1]).toBeLessThan(by);
    expect(top[1]).toBeGreaterThanOrEqual(-ch - 1e-6);
    // 柱は真上へ：少しだけ上げた点と同じ向き
    const [ux, uy] = c.project(0, 0.5, 0.25), [bx] = c.project(0, 0.5, 0);
    expect(Math.abs((top[0] - bx) * (uy - by) - (top[1] - by) * (ux - bx))).toBeLessThan(1e-3 * Math.abs(top[1] - by) + 1e-6);
  });
  it('ふつうの寄り方では、14 マスの高さの点をそのまま使う', () => {
    const cw = 1024, ch = 768, c = camera3({ x: 0, y: 0, z: 30 }, cw, ch);
    const p = c.project(0, 0.5, 14), top = riseTo(c.project, 0, 0.5, 14, -ch)!;
    expect(top[0]).toBeCloseTo(p[0], 6);
    expect(top[1]).toBeCloseTo(p[1], 6);
    expect(top[1]).toBeLessThan(c.project(0, 0.5, 0)[1]);
  });
  it('足もとがカメラより後ろ（画面の下のずっと外）なら、柱は描かない', () => {
    const c = camera3({ x: 0, y: 0, z: 110 }, 1024, 700);
    expect(riseTo(c.project, 0, 60, 14, -700)).toBeNull();
  });
});
