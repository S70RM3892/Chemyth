import { appearance, equationOf, lookOf, reactionLook } from '../content/looks';
import { productsOf, type Recipe } from '../content/recipes';
import { hasSub, label, sub } from '../content/substances';
import { h } from './dom';
import { palette } from './theme';
import { drawElement, drawToken } from './token';
import { planScene, type ScenePlan, type Unit } from '../content/sceneplan';

/**
 * 反応の様子：原料の粒がばらけ、原子が飛んで、生成物に組み替わる。
 * 原子の数が両辺で合っていること（係数の意味）が、目で見てわかる。
 * 化学式のない物質（混合物・高分子）がからむ反応や、原子が多すぎる反応は、粒のまま入れ替わる絵にする。
 */

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** 場面を 1 コマ描く。phase は 0〜1 の繰り返し：0〜0.22 原料、0.22〜0.72 組み替え、0.72〜1 生成物 */
export function drawScene(ctx: CanvasRenderingContext2D, plan: ScenePlan, r: Recipe, W: number, H: number, phase: number) {
  const P = palette();
  ctx.clearRect(0, 0, W, H);
  const A = 0.22, B = 0.72;
  const q = phase < A ? 0 : phase > B ? 1 : (phase - A) / (B - A);
  const units = (list: Unit[], alpha: number) => {
    if (alpha <= 0.01) return;
    for (const u of list) {
      // 色の決まっている物質は、その色の輪で囲む（NO₂ は赤褐色、CuSO₄ は青色…）
      const l = lookOf(u.id);
      if (l) { ctx.globalAlpha = alpha * 0.85; ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 1.16, 0, Math.PI * 2); ctx.fillStyle = l.hex; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = P.ink; ctx.stroke(); }
      ctx.globalAlpha = alpha;
      drawToken(ctx, u.id, u.x, u.y, u.r * (l ? 0.94 : 1));
    }
    ctx.globalAlpha = 1;
  };
  // まんなかの矢印と条件
  const cond = r.accept[0] && r.accept[0] !== 'なし' ? r.accept[0] : '';
  ctx.strokeStyle = P.ink; ctx.fillStyle = P.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ax0 = W * 0.44, ax1 = W * 0.56, ay = H / 2;
  ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.moveTo(ax1 - 8, ay - 6); ctx.lineTo(ax1, ay); ctx.lineTo(ax1 - 8, ay + 6); ctx.stroke();
  if (r.shift) { ctx.beginPath(); ctx.moveTo(ax1, ay + 11); ctx.lineTo(ax0, ay + 11); ctx.moveTo(ax0 + 8, ay + 5); ctx.lineTo(ax0, ay + 11); ctx.lineTo(ax0 + 8, ay + 17); ctx.stroke(); }
  if (cond) {
    ctx.font = '600 11.5px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // 長い条件（電解液の組み合わせなど）は、ここには書かない。下の説明に出ている
    if (ctx.measureText(cond).width <= W * 0.17) { ctx.fillStyle = P.red; ctx.fillText(cond, W / 2, ay - 12); }
  }
  if (!plan.flights) {
    // 粒のまま入れ替わる：原料が薄れ、生成物が現れる
    units(plan.left, 1 - 0.75 * ease(q));
    units(plan.right, 0.25 + 0.75 * ease(q));
    return;
  }
  // 粒の台は、ばらける前とまとまった後だけ見せる
  units(plan.left, 1 - ease(q * 4));
  units(plan.right, ease((q - 0.75) * 4));
  if (q > 0 && q < 1) {
    for (const f of plan.flights) {
      const k = ease((q - f.delay) / (1 - 0.25)), x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * (18 + f.bend);
      drawElement(ctx, f.sym, x, y, f.r0 + (f.r1 - f.r0) * k);
    }
  }
  // 電子は、生成物の側に現れる
  ctx.globalAlpha = 1;
}

/** 設定画面に置く、反応の様子（動く絵と、見た目の説明） */
export function reactionScene(r: Recipe): HTMLElement {
  const W = 560, H = 150;
  const cv = h('canvas', { class: 'scene-cv', id: 'scene-cv', width: W * 2, height: H * 2, ariaLabel: `${equationOf(r)} の様子` });
  const ctx = cv.getContext('2d')!;
  ctx.scale(2, 2);
  const plan = planScene(r, W, H);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now(), PERIOD = 4200;
  let seen = false;
  const frame = (now: number) => {
    // 画面から外されたら止める。いつまでも画面に出なければ、あきらめる
    if (cv.isConnected) seen = true; else if (seen || now - t0 > 4000) return;
    drawScene(ctx, plan, r, W, H, still ? 0.47 : ((now - t0) % PERIOD) / PERIOD);
    if (!(still && seen)) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // 見た目の説明：色の決まっている物質だけを言う。気体の発生と沈殿は、絵と同じ言葉で言う
  const L = reactionLook(r);
  const seenGas = !L.gasPhase && !L.dry ? productsOf(r).map(([s]) => s).filter((s) => hasSub(s) && sub(s).state === 'gas') : [];
  const before = L.notes.filter((n) => !n.made), after = L.notes.filter((n) => n.made);
  const line = (title: string, list: { id: string; text: string }[]) => (list.length ? h('p', { class: 'scene-note' }, h('b', {}, title), ...list.map((n) => h('span', { class: 'scene-chip' }, `${label(n.id)}：${n.text}`))) : null);
  const atoms = plan.flights ? `原子 ${plan.flights.length} 個が、数を変えずに組み替わる。` : `${plan.why}。`;
  return h('div', { class: 'scene', id: 'scene' },
    cv,
    h('p', { class: 'muted scene-cap' }, atoms),
    line('反応の前', before),
    line('反応の後', after),
    seenGas.length ? h('p', { class: 'scene-note' }, h('b', {}, '見えるもの'), h('span', { class: 'scene-chip' }, `気体が発生する（${seenGas.map((s) => label(s) + (appearance(s).includes('色') ? '・' + appearance(s).replace('の気体', '') : '')).join('、')}）`)) : null,
  );
}
