import type { Camera } from './render';

export interface InputHandlers {
  /** 指が触れた。ひとまとまりの操作の始まり */
  begin(): void;
  /** 指を動かさずに離した */
  tap(tx: number, ty: number): void;
  /** なぞり始め・なぞり中に新しいマスへ入った。prev は直前のマス */
  stroke(tx: number, ty: number, prev: [number, number] | null): void;
  /** このマスからなぞり始めたら、地図を動かすか、なぞり書きにするか */
  mode(tx: number, ty: number): 'pan' | 'stroke';
  /** 指を動かさずに押し続けた。true を返すと、そこからは地図を動かさず、なぞり書き（stroke）として扱う */
  hold?(tx: number, ty: number): boolean;
  /** なぞり書きを終えて指を離した */
  end?(): void;
  /** マウスが乗っているマス。外れたら null */
  hover?(t: [number, number] | null): void;
}

export const Z_MIN = 9, Z_MAX = 110;

/** 1本指で操作、2本指で拡大縮小と移動。指を離すと地図は少し滑る。マウスとホイールにも対応 */
export function attachInput(cv: HTMLCanvasElement, cam: Camera, h: InputHandlers) {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null;
  let moved = false;
  let panning = false;
  let last: [number, number] | null = null;
  let pinch: { d: number; cx: number; cy: number } | null = null;
  let vx = 0, vy = 0, lastMove = 0;
  let holdTimer = 0;
  const HOLD_MS = 260;

  const rect = () => cv.getBoundingClientRect();
  const toTile = (px: number, py: number): [number, number] => {
    const r = rect();
    return [Math.floor(cam.x + (px - r.left - r.width / 2) / cam.z), Math.floor(cam.y + (py - r.top - r.height / 2) / cam.z)];
  };
  const clamp = () => { /* 地図に果てはない */ };
  const zoomAt = (px: number, py: number, factor: number) => {
    const r = rect();
    const ox = px - r.left - r.width / 2, oy = py - r.top - r.height / 2;
    const wx = cam.x + ox / cam.z, wy = cam.y + oy / cam.z;
    cam.z = Math.min(Z_MAX, Math.max(Z_MIN, cam.z * factor));
    cam.x = wx - ox / cam.z;
    cam.y = wy - oy / cam.z;
    clamp();
  };
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  cv.addEventListener('pointerdown', (ev) => {
    cv.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    vx = vy = 0;
    if (pts.size === 1) {
      start = { x: ev.clientX, y: ev.clientY };
      moved = false;
      panning = false;
      last = null;
      h.begin();
      // 押し続け：置く前の見本を出して、指で場所を選べるようにする
      clearTimeout(holdTimer);
      if (h.hold) {
        const sx0 = ev.clientX, sy0 = ev.clientY;
        holdTimer = window.setTimeout(() => {
          if (!start || moved || pts.size !== 1) return;
          const st = toTile(sx0, sy0);
          if (!h.hold!(st[0], st[1])) return;
          moved = true; panning = false; last = st;
        }, HOLD_MS);
      }
    } else if (pts.size === 2) {
      clearTimeout(holdTimer);
      if (start && moved && !panning) h.end?.();
      start = null;
      pinch = pinchState();
    }
  });

  cv.addEventListener('pointermove', (ev) => {
    const p = pts.get(ev.pointerId);
    if (!p) { if (ev.pointerType === 'mouse' && h.hover) h.hover(toTile(ev.clientX, ev.clientY)); return; }
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    p.x = ev.clientX;
    p.y = ev.clientY;
    if (pts.size >= 2 && pinch) {
      const n = pinchState();
      cam.x -= (n.cx - pinch.cx) / cam.z;
      cam.y -= (n.cy - pinch.cy) / cam.z;
      zoomAt(n.cx, n.cy, n.d / pinch.d);
      pinch = n;
      return;
    }
    if (!start) return;
    if (!moved) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
      moved = true;
      clearTimeout(holdTimer);
      const st = toTile(start.x, start.y);
      panning = h.mode(st[0], st[1]) === 'pan';
      if (!panning) { last = st; h.stroke(st[0], st[1], null); }
    }
    if (panning) {
      const now = performance.now(), el = Math.max(1, now - lastMove);
      lastMove = now;
      cam.x -= dx / cam.z;
      cam.y -= dy / cam.z;
      vx = 0.6 * vx + 0.4 * (-dx / cam.z / el) * 1000;
      vy = 0.6 * vy + 0.4 * (-dy / cam.z / el) * 1000;
      clamp();
      return;
    }
    // 速くなぞってもマスを飛ばさない
    const [tx, ty] = toTile(ev.clientX, ev.clientY);
    while (last && (last[0] !== tx || last[1] !== ty)) {
      const next: [number, number] = last[0] !== tx ? [last[0] + Math.sign(tx - last[0]), last[1]] : [last[0], last[1] + Math.sign(ty - last[1])];
      h.stroke(next[0], next[1], last);
      last = next;
    }
  });

  const end = (ev: PointerEvent) => {
    if (!pts.delete(ev.pointerId)) return;
    clearTimeout(holdTimer);
    if (pts.size === 0 && start && moved && !panning) h.end?.();
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && start && !moved && ev.type === 'pointerup') {
      const [tx, ty] = toTile(ev.clientX, ev.clientY);
      h.tap(tx, ty);
    }
    if (pts.size === 0) {
      if (!panning || performance.now() - lastMove > 80) vx = vy = 0;
      start = null;
    } else vx = vy = 0;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  cv.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') h.hover?.(null); });

  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });

  return {
    /** 指を離したあとの滑り */
    tick(dt: number) {
      if (pts.size || (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05)) return;
      cam.x += vx * dt;
      cam.y += vy * dt;
      const k = Math.exp(-dt * 5);
      vx *= k;
      vy *= k;
      clamp();
    },
    stop() { vx = vy = 0; },
  };
}
