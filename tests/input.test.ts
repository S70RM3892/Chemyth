import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// far.ts が読み込む見た目（theme.ts）は、読み込んだときに document と matchMedia を使う。最小の代わりを置いておく
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.window ??= g;
  g.document ??= { documentElement: { dataset: {} } };
  g.matchMedia ??= () => ({ matches: false, addEventListener() { /* なし */ } });
  g.MutationObserver ??= class { observe() { /* なし */ } };
});

import { attachInput, type InputHandlers } from '../src/ui/input';
import { farBegin, isFar } from '../src/ui/far';

/** 指の操作（src/ui/input.ts）を、DOM なしで確かめる。絵の代わりに、イベントを受けるだけの箱を使う */
class FakeCanvas extends EventTarget {
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
  setPointerCapture() { /* なし */ }
}

const ptr = (cv: FakeCanvas, type: string, id: number, x: number, y: number, pointerType = 'touch') => {
  const ev = new Event(type);
  Object.assign(ev, { pointerId: id, clientX: x, clientY: y, pointerType });
  cv.dispatchEvent(ev);
};

/** 呼ばれた順に記録する。hold が true を返すかは引数で決める */
function rig(holdOk: boolean, extra: Partial<InputHandlers> = {}) {
  const log: string[] = [];
  const cv = new FakeCanvas();
  const cam = { x: 0, y: 0, z: 40 };
  const h: InputHandlers = {
    begin: () => log.push('begin'),
    tap: (x, y) => log.push(`tap ${x},${y}`),
    stroke: (x, y) => log.push(`stroke ${x},${y}`),
    mode: () => 'stroke',
    hold: (x, y) => { log.push(`hold ${x},${y}`); return holdOk; },
    end: () => log.push('end'),
    abort: () => log.push('abort'),
    press: (x, y) => log.push(`press ${x},${y}`),
    ...extra,
  };
  attachInput(cv as unknown as HTMLCanvasElement, cam, h);
  return { cv, cam, log };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('2 本指の拡大・移動', () => {
  it('3 本目の指が触れて 1 本目が離れても、拡大率は跳ばない（指の組が替わるたびに基準を取り直す）', () => {
    const { cv, cam } = rig(false);
    ptr(cv, 'pointerdown', 1, 400, 400);
    vi.advanceTimersByTime(300);
    ptr(cv, 'pointerdown', 2, 800, 400);
    ptr(cv, 'pointermove', 1, 401, 400);
    const z0 = cam.z;
    ptr(cv, 'pointerdown', 3, 860, 420);
    ptr(cv, 'pointerup', 1, 401, 400);
    // 残った 2 本（2 と 3）の片方が 1 ピクセル動いただけ
    ptr(cv, 'pointermove', 2, 801, 400);
    expect(cam.z / z0).toBeGreaterThan(0.95);
    expect(cam.z / z0).toBeLessThan(1.05);
    expect(Math.abs(cam.x)).toBeLessThan(1);
  });
});

describe('長押しの見本と、2 本目の指', () => {
  it('見本が出ているときに 2 本目の指が触れたら、置かずに捨てる（end ではなく abort）', () => {
    const { cv, log } = rig(true);
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(400);
    expect(log).toContain('hold -3,0');
    ptr(cv, 'pointerdown', 2, 600, 450);
    expect(log).toContain('abort');
    expect(log).not.toContain('end');
    ptr(cv, 'pointermove', 1, 280, 290);
    ptr(cv, 'pointerup', 1, 280, 290);
    ptr(cv, 'pointerup', 2, 600, 450);
    expect(log).not.toContain('end');
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });
  it('なぞり書きの途中で指が取り消されたら、決めずに捨てる', () => {
    const { cv, log } = rig(true);
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(400);
    ptr(cv, 'pointermove', 1, 360, 300);
    ptr(cv, 'pointercancel', 1, 360, 300);
    expect(log).toContain('abort');
    expect(log).not.toContain('end');
  });
  it('ベルトをなぞっている途中の 2 本目の指でも、なぞり書きは終わる（abort から end を呼ぶのは main.ts の仕事）', () => {
    const { cv, log } = rig(false);
    ptr(cv, 'pointerdown', 1, 300, 300);
    ptr(cv, 'pointermove', 1, 340, 300);
    expect(log).toContain('stroke -3,0');
    ptr(cv, 'pointerdown', 2, 600, 450);
    expect(log.filter((l) => l === 'abort' || l === 'end')).toEqual(['abort']);
  });
  it('abort がなければ、これまでどおり end を呼ぶ', () => {
    const { cv, log } = rig(true, { abort: undefined });
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(400);
    ptr(cv, 'pointerdown', 2, 600, 450);
    expect(log).toContain('end');
  });
});

describe('ゆっくりめのタップ', () => {
  it('長押しが始まってすぐ（500 ms より前）に、動かさずに離したら、タップになる', () => {
    const { cv, log } = rig(true);
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(300);
    ptr(cv, 'pointermove', 1, 303, 302);
    ptr(cv, 'pointerup', 1, 303, 302);
    expect(log.slice(-2)).toEqual(['abort', 'tap -3,0']);
    expect(log).not.toContain('end');
  });
  it('500 ms 以上押し続けてから離したら、長押しのまま（タップにしない）', () => {
    const { cv, log } = rig(true);
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(600);
    ptr(cv, 'pointerup', 1, 300, 300);
    expect(log.slice(-1)).toEqual(['end']);
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });
  it('長押しのあと指を動かしたら、早く離しても、ずらし（なぞり書き）として終える', () => {
    const { cv, log } = rig(true);
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(300);
    ptr(cv, 'pointermove', 1, 345, 300);
    ptr(cv, 'pointerup', 1, 345, 300);
    expect(log.slice(-1)).toEqual(['end']);
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });
  it('abort がなければ、早く離しても end で終え、タップにはしない（置いたあとに、そのマスをタップしない）', () => {
    const { cv, log } = rig(true, { abort: undefined });
    ptr(cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(300);
    ptr(cv, 'pointerup', 1, 300, 300);
    expect(log.slice(-1)).toEqual(['end']);
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });
  it('長押しが何も始めなければ、500 ms で press を呼ぶ。それより前に離せば、ただのタップ', () => {
    const a = rig(false);
    ptr(a.cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(300);
    ptr(a.cv, 'pointerup', 1, 300, 300);
    expect(a.log.some((l) => l.startsWith('press'))).toBe(false);
    expect(a.log.slice(-1)).toEqual(['tap -3,0']);
    const b = rig(false);
    ptr(b.cv, 'pointerdown', 1, 300, 300);
    vi.advanceTimersByTime(520);
    expect(b.log.slice(-1)).toEqual(['press -3,0']);
    ptr(b.cv, 'pointerup', 1, 300, 300);
    expect(b.log.slice(-1)).toEqual(['tap -3,0']);
  });
});

describe('引いた視野（戦略図）との境', () => {
  /** 絵の大きさ 0 の canvas：切り替えの重ね描き（写し取り）はしない */
  const fakeCtx = () => ({ canvas: { width: 0, height: 0 } }) as unknown as CanvasRenderingContext2D;
  it('isFar は、絵と同じずらし幅（7.5〜8.5）で決まる', () => {
    const ctx = fakeCtx(), cv = ctx.canvas;
    expect(farBegin(ctx, { x: 0, y: 0, z: 12 }, 0, 800, 600)).toBe(false);
    // 寄った絵から引いていく：7.5 までは近くの絵のまま
    expect(isFar(cv, { x: 0, y: 0, z: 7.8 })).toBe(false);
    expect(farBegin(ctx, { x: 0, y: 0, z: 7.8 }, 0, 800, 600)).toBe(false);
    expect(isFar(cv, { x: 0, y: 0, z: 7.4 })).toBe(true);
    expect(farBegin(ctx, { x: 0, y: 0, z: 7.4 }, 0, 800, 600)).toBe(true);
    // 引いた絵から寄っていく：8.5 までは引いた絵のまま（8 を越えても、指の操作は戦略図のまま）
    expect(isFar(cv, { x: 0, y: 0, z: 8.2 })).toBe(true);
    expect(farBegin(ctx, { x: 0, y: 0, z: 8.2 }, 0, 800, 600)).toBe(true);
    expect(isFar(cv, { x: 0, y: 0, z: 8.6 })).toBe(false);
    expect(farBegin(ctx, { x: 0, y: 0, z: 8.6 }, 0, 800, 600)).toBe(false);
  });
  it('まだ描いていない絵は、8 で分ける', () => {
    const cv = fakeCtx().canvas;
    expect(isFar(cv, { x: 0, y: 0, z: 7.9 })).toBe(true);
    expect(isFar(cv, { x: 0, y: 0, z: 8.1 })).toBe(false);
  });
});
