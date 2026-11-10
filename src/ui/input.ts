import { MAP_H, MAP_W } from '../content/map';
import type { Camera } from './render';

export interface InputHandlers {
  /** 指を動かさずに離した */
  tap(tx: number, ty: number): void;
  /** なぞり始め・なぞり中に新しいマスへ入った。prev は直前のマス */
  stroke(tx: number, ty: number, prev: [number, number] | null): void;
  /** いまの道具は、なぞると地図が動くか */
  pans(): boolean;
}

const Z_MIN = 18, Z_MAX = 110;

/** 1本指で操作、2本指で拡大縮小と移動。マウスとホイールにも対応 */
export function attachInput(cv: HTMLCanvasElement, cam: Camera, h: InputHandlers) {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null;
  let moved = false;
  let last: [number, number] | null = null;
  let pinch: { d: number; cx: number; cy: number } | null = null;

  const rect = () => cv.getBoundingClientRect();
  const toTile = (px: number, py: number): [number, number] => {
    const r = rect();
    return [Math.floor(cam.x + (px - r.left - r.width / 2) / cam.z), Math.floor(cam.y + (py - r.top - r.height / 2) / cam.z)];
  };
  const clamp = () => {
    cam.x = Math.min(MAP_W, Math.max(0, cam.x));
    cam.y = Math.min(MAP_H, Math.max(0, cam.y));
  };
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
    if (pts.size === 1) {
      start = { x: ev.clientX, y: ev.clientY };
      moved = false;
      last = null;
    } else if (pts.size === 2) {
      start = null;
      pinch = pinchState();
    }
  });

  cv.addEventListener('pointermove', (ev) => {
    const p = pts.get(ev.pointerId);
    if (!p) return;
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
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
    if (h.pans()) {
      moved = true;
      cam.x -= dx / cam.z;
      cam.y -= dy / cam.z;
      clamp();
      return;
    }
    if (!moved) {
      moved = true;
      last = toTile(start.x, start.y);
      h.stroke(last[0], last[1], null);
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
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && start && !moved && ev.type === 'pointerup') {
      const [tx, ty] = toTile(ev.clientX, ev.clientY);
      h.tap(tx, ty);
    }
    if (pts.size === 0) start = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });
}
