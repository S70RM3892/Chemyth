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
  /** 指を動かさずに押し続けた。true を返すと、そこからは地図を動かさず、なぞり書き（stroke）として扱う。
   *  g は指の下の地面のマス（立体表示では、箱の天面に触れていても、その下の地面ではなく、視線が地面と交わるマス） */
  hold?(tx: number, ty: number, g: [number, number]): boolean;
  /** true の間は、マスを箱で拾わず、指の下の地面で決める（置いたものをずらしている間） */
  groundMode?(): boolean;
  /** なぞり書きを終えて指を離した */
  end?(): void;
  /** なぞり書きを途中でやめた（2 本目の指が触れた・指が取り消された・長押しの見本が出てすぐに、動かさずに離した）。
   *  置く前の見本や、ずらしかけたものは、決めずに捨てる。もう引いたベルトなどは、そのまま。ないときは end を呼ぶ */
  abort?(): void;
  /** タップとは言えない長さまで、指を動かさずに押し続けた（hold が何も始めなかったとき） */
  press?(tx: number, ty: number): void;
  /** マウスが乗っているマス。外れたら null */
  hover?(t: [number, number] | null): void;
  /** 2 本指で軽くたたいた（元に戻す） */
  undo?(): void;
  /** 3 本指で軽くたたいた（やり直す） */
  redo?(): void;
  /** いま引ける限界（1 マスのピクセル数）。立体表示では、平らな表示ほど引けない */
  minZoom?(): number;
}

/** 拡大率（1 マスのピクセル数）の範囲。平らな表示は、工場と資源地の全体が見える 1.5 まで引ける（8 より小さいと、引いた視野の戦略図になる）。
 *  立体表示は、傾けた地面を近くの絵で描くので、これまでどおり 9 まで */
export const Z_MIN = 1.5, Z_MIN_3D = 9, Z_MAX = 110;

/** 1本指で操作、2本指で拡大縮小と移動。指を離すと地図は少し滑る。マウスとホイールにも対応 */
/** 立体表示のときの、画面の点 → 世界の点。px, py は絵の左上からのピクセル。平らな表示のときは null を返す */
export interface Projection {
  /** 視線が地面と交わる点 */
  ground(px: number, py: number): [number, number] | null;
  /** その点にあるマス（箱の天面や側面に触れていれば、その設備のマス） */
  pick(px: number, py: number): [number, number] | null;
}

export function attachInput(cv: HTMLCanvasElement, cam: Camera, h: InputHandlers, proj?: Projection) {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null;
  let moved = false;
  let panning = false;
  let last: [number, number] | null = null;
  let pinch: { d: number; cx: number; cy: number } | null = null;
  let vx = 0, vy = 0, lastMove = 0;
  let holdTimer = 0;
  /** 長押しの見本が出るまで。TAP_MS より前に、ほとんど動かさずに離したら、見本が出ていてもタップにする（ゆっくりめのタップ） */
  const HOLD_MS = 260, TAP_MS = 500;
  /** 長押し（hold）が始まったか。指が触れた所から 8 ピクセル以上動いたことがあるか */
  let held = false, slid = false;
  // 何本かの指でたたく：最初の指から 250 ms 以内にほかの指が触れ、350 ms 以内に、ほとんど動かさずに全部離れたとき
  let firstDown = 0, camAtDown = { x: 0, y: 0, z: 0 };
  let multi: { n: number; moved: number } | null = null;
  /** なぞっている指の、いまの位置（画面の端で地図を送るのに使う） */
  let at: [number, number] | null = null;

  const rect = () => cv.getBoundingClientRect();
  /** 指の下の地面のマス（立体表示では、視線が地面と交わるマス） */
  const groundTile = (px: number, py: number): [number, number] => {
    const r = rect(), g = proj?.ground(px - r.left, py - r.top);
    return g ? [Math.floor(g[0]), Math.floor(g[1])] : [Math.floor(cam.x + (px - r.left - r.width / 2) / cam.z), Math.floor(cam.y + (py - r.top - r.height / 2) / cam.z)];
  };
  const toTile = (px: number, py: number): [number, number] => {
    if (h.groundMode?.()) return groundTile(px, py);
    const r = rect();
    return proj?.pick(px - r.left, py - r.top) ?? [Math.floor(cam.x + (px - r.left - r.width / 2) / cam.z), Math.floor(cam.y + (py - r.top - r.height / 2) / cam.z)];
  };
  /** 指が (ax, ay) から (bx, by) へ動いたとき、指の下の地面がついてくるように視点を動かす量 */
  const drag = (ax: number, ay: number, bx: number, by: number): [number, number] => {
    const r = rect(), g0 = proj?.ground(ax - r.left, ay - r.top), g1 = g0 && proj?.ground(bx - r.left, by - r.top);
    return g0 && g1 ? [g0[0] - g1[0], g0[1] - g1[1]] : [-(bx - ax) / cam.z, -(by - ay) / cam.z];
  };
  const clamp = () => { /* 地図に果てはない */ };
  const zoomAt = (px: number, py: number, factor: number) => {
    const r = rect(), lo = h.minZoom?.() ?? Z_MIN;
    const g0 = proj?.ground(px - r.left, py - r.top);
    if (g0) {
      // 立体表示：拡大の前後で、指の下の地面の点が変わらないようにする
      cam.z = Math.min(Z_MAX, Math.max(lo, cam.z * factor));
      const g1 = proj!.ground(px - r.left, py - r.top)!;
      cam.x += g0[0] - g1[0]; cam.y += g0[1] - g1[1];
      return;
    }
    const ox = px - r.left - r.width / 2, oy = py - r.top - r.height / 2;
    const wx = cam.x + ox / cam.z, wy = cam.y + oy / cam.z;
    cam.z = Math.min(Z_MAX, Math.max(lo, cam.z * factor));
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
    if (pts.size === 1) { firstDown = performance.now(); camAtDown = { x: cam.x, y: cam.y, z: cam.z }; multi = null; }
    else if (multi) multi.n = Math.max(multi.n, pts.size);
    else if (performance.now() - firstDown < 250) multi = { n: pts.size, moved: 0 };
    if (pts.size === 1) {
      start = { x: ev.clientX, y: ev.clientY };
      moved = false;
      panning = false;
      last = null;
      held = slid = false;
      h.begin();
      // 押し続け：置く前の見本を出して、指で場所を選べるようにする
      clearTimeout(holdTimer);
      if (h.hold) {
        const sx0 = ev.clientX, sy0 = ev.clientY;
        holdTimer = window.setTimeout(() => {
          if (!start || moved || pts.size !== 1) return;
          const st = toTile(sx0, sy0), g = groundTile(sx0, sy0);
          if (!h.hold!(st[0], st[1], g)) {
            // 何も始めなかった：タップとは言えない長さまで押し続けたら、知らせる
            if (h.press) holdTimer = window.setTimeout(() => { if (start && !moved && pts.size === 1) h.press!(st[0], st[1]); }, TAP_MS - HOLD_MS);
            return;
          }
          moved = true; held = true; panning = false; last = h.groundMode?.() ? g : st;
        }, HOLD_MS);
      }
    } else {
      clearTimeout(holdTimer);
      // なぞり書きの途中で 2 本目の指が触れた：拡大・移動に移る。置く前の見本や、ずらしかけたものは決めない
      if (start && moved && !panning) { if (h.abort) h.abort(); else h.end?.(); }
      start = null;
      // 指の組が替わるたびに、拡大・移動の基準を取り直す（前の 2 本の幅と比べると、急に寄ったり引いたりする）
      pinch = pinchState();
    }
  });

  cv.addEventListener('pointermove', (ev) => {
    const p = pts.get(ev.pointerId);
    if (!p) { if (ev.pointerType === 'mouse' && h.hover) h.hover(toTile(ev.clientX, ev.clientY)); return; }
    const ox = p.x, oy = p.y;
    p.x = ev.clientX;
    p.y = ev.clientY;
    if (multi) multi.moved += Math.hypot(p.x - ox, p.y - oy);
    if (pts.size >= 2 && pinch) {
      const n = pinchState(), [mx, my] = drag(pinch.cx, pinch.cy, n.cx, n.cy);
      cam.x += mx;
      cam.y += my;
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
      const [mx, my] = drag(ox, oy, ev.clientX, ev.clientY);
      cam.x += mx;
      cam.y += my;
      vx = 0.6 * vx + 0.4 * (mx / el) * 1000;
      vy = 0.6 * vy + 0.4 * (my / el) * 1000;
      clamp();
      return;
    }
    if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) >= 8) slid = true;
    at = [ev.clientX, ev.clientY];
    walk(ev.clientX, ev.clientY);
  });
  /** 速くなぞってもマスを飛ばさない：直前のマスから、指の下のマスまで 1 マスずつ進める */
  const walk = (px: number, py: number) => {
    const [tx, ty] = toTile(px, py);
    while (last && (last[0] !== tx || last[1] !== ty)) {
      const next: [number, number] = last[0] !== tx ? [last[0] + Math.sign(tx - last[0]), last[1]] : [last[0], last[1] + Math.sign(ty - last[1])];
      h.stroke(next[0], next[1], last);
      last = next;
    }
  };
  /** 画面の端にどれだけ寄っているか（-1〜1）。下は道具の帯があるので広めにとる */
  const edge = (px: number, py: number): [number, number] => {
    const r = rect(), L = 44, T = 64, B = 132;
    const ex = px < r.left + L ? -(1 - (px - r.left) / L) : px > r.right - L ? 1 - (r.right - px) / L : 0;
    const ey = py < r.top + T ? -(1 - (py - r.top) / T) : py > r.bottom - B ? 1 - (r.bottom - py) / B : 0;
    return [Math.max(-1, Math.min(1, ex)), Math.max(-1, Math.min(1, ey))];
  };

  const end = (ev: PointerEvent) => {
    if (!pts.delete(ev.pointerId)) return;
    at = null;
    clearTimeout(holdTimer);
    // 長押しの見本が出てすぐ（TAP_MS より前）に、動かさずに離した：ゆっくりめのタップ。見本やずらしかけたものは捨てて、タップにする
    const slowTap = pts.size === 0 && !!start && held && !slid && ev.type === 'pointerup' && performance.now() - firstDown < TAP_MS;
    if (pts.size === 0 && start && moved && !panning) {
      // 指が取り消された（ほかの操作に取られた）ときも、置く前の見本は決めない
      if ((slowTap || ev.type === 'pointercancel') && h.abort) h.abort();
      else h.end?.();
    }
    pinch = pts.size >= 2 ? pinchState() : null;
    if (pts.size === 0 && start && (!moved || slowTap) && ev.type === 'pointerup') {
      const [tx, ty] = toTile(ev.clientX, ev.clientY);
      h.tap(tx, ty);
    }
    if (pts.size === 0) {
      if (!panning || performance.now() - lastMove > 80) vx = vy = 0;
      start = null;
      if (multi && ev.type === 'pointerup' && performance.now() - firstDown < 350 && multi.moved < 30) {
        // 2 本指の拡大・移動で少し動いた分は戻す
        cam.x = camAtDown.x; cam.y = camAtDown.y; cam.z = camAtDown.z; vx = vy = 0;
        if (multi.n >= 3) h.redo?.(); else h.undo?.();
      }
      multi = null;
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
      // なぞり書き・ずらしている途中で指が画面の端に来たら、その向きへ地図を送る（指の下のマスも進める）
      if (pts.size === 1 && start && moved && !panning && at) {
        const [ex, ey] = edge(at[0], at[1]);
        if (ex || ey) {
          const sp = 520 * dt, [mx, my] = drag(at[0], at[1], at[0] - ex * sp, at[1] - ey * sp);
          cam.x += mx; cam.y += my;
          walk(at[0], at[1]);
        }
        return;
      }
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
