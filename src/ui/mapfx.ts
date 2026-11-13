/**
 * 地図の上の統計と手ごたえ（render.ts から短く呼ぶ）。
 *  - 稼働率の重ね表示のあいだ：ベルトに毎分の数（引いた視点では、流れの多いベルトほど太い線）
 *  - 稼働率の色分け：装置を緑（よく動く）→ 赤（止まりがち）で塗る（色覚の補助では青 → 黄 → 橙と斜線。引いた視野でも far.ts が同じ色で塗る）
 *  - 納品所の上の計器：直近 1 分の納品の速さと、操業評価の目安
 *  - 高画質の光：納品所へ飛び込む荷の光の尾、反応を終えたときの光（多いときは間引く）、指令を達成したときの光の柱
 *  - 列車が降ろす駅に着いたとき：光の輪と、降ろした数
 */
import { HUB_CENTER, hubRect } from '../content/map';
import { label, sub } from '../content/substances';
import { recentRate } from '../engine/flow';
import { GRADES, beltPassed, currentGoal, DX, DY, groundY, isMachine, sizeOf, type Ent, type World } from '../engine/world';
import { setStatsUi, statsUi } from './charts';
import type { Palette } from './theme';
import { riseTo } from './three';
import { sprite } from './token';

type Fx = World['fx'][number];
type ToScreen = (v: number) => number;
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';
const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const calm = () => typeof document !== 'undefined' && document.documentElement.classList.contains('calm');
const rgbOf = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const color = (s: string) => { try { return rgbOf(sub(s).color); } catch { return '255,225,140'; } };
/** 角の丸い四角の道（古いブラウザにも roundRect がなくてよいように） */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------- 稼働率の色分け（切り替え） ----------------

let heat = statsUi().heat === true;
export const heatOn = () => heat;
export function setHeat(on: boolean) { heat = on; setStatsUi({ heat: on }); }
/** 色覚の補助（設定）。1 回の描画で 1 度だけ読む */
export const cvdOn = () => typeof document !== 'undefined' && document.documentElement.classList.contains('cvd');
/** 色覚の補助のときの稼働率の色：こげ茶がかった橙（0 %）→ 黄（50 %）→ 青（100 %）。動いている印の青（render.ts）と同じ向き */
const CVD_HEAT = [[184, 72, 16], [232, 182, 18], [47, 127, 216]];
/**
 * 稼働率 u（0〜1）の色。a は不透明度、edge は縁の色（塗りより、明るい地図では濃く、暗い地図では明るく）。
 * ふだんは赤（0 %）→ 黄（50 %）→ 緑（100 %）。色覚の補助（cv）のときは、赤と緑で分けない色にする
 */
export function heatColor(u: number, light: boolean, cv: boolean, a: number, edge = false): string {
  if (!cv) return `hsla(${Math.round(u * 120)},${edge ? 80 : 78}%,${edge ? (light ? 38 : 60) : light ? 48 : 52}%,${a})`;
  const lo = u < 0.5, p = CVD_HEAT[lo ? 0 : 1], q = CVD_HEAT[lo ? 1 : 2], k = lo ? u * 2 : (u - 0.5) * 2;
  const c = p.map((v, i) => { const m = v + (q[i] - v) * k; return Math.round(!edge ? m : light ? m * 0.68 : m + (255 - m) * 0.3); });
  return `rgba(${c.join(',')},${a})`;
}
/** 止まりがち（稼働率 35 % 未満）。色覚の補助のときは、色だけでなく斜線でも示す */
export const STALL = 0.35;

// ---------------- 光の効果 ----------------

interface Glint { kind: 'trail' | 'pop' | 'train' | 'goal'; x: number; y: number; dx: number; dy: number; age: number; life: number; rgb: string; n: number; s: string }
const glints: Glint[] = [];
/** 前のコマで見えていた範囲（マス。2 階を見ているときは、2 階のずれを含む）。見えない所の光は作らない */
let view = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
/** 反応の光の残り枠：1 秒に 14 個まで（多いときは間引く） */
let popBudget = 8, popAt = 0;
const POP_RATE = 14, POP_MAX = 8;
const seen = (x: number, y: number) => x >= view.x0 - 2 && x <= view.x1 + 2 && y >= view.y0 - 2 && y <= view.y1 + 2;

/**
 * 世界の画面効果のきっかけを受け取る。列車と指令のきっかけはここだけで描くので true を返す。
 * 納品と反応は、ふつうの粒子も出すので false を返す（光の尾と光は、高画質のときだけ描く）
 */
export function noteFx(f: Fx): boolean {
  if (f.type === 'train') {
    const same = glints.find((g) => g.kind === 'train' && g.x === f.x && g.y === f.y && g.age < 1.2);
    if (same) { same.n += f.n || 0; same.age = Math.min(same.age, 0.25); }
    else if (glints.length < 200) glints.push({ kind: 'train', x: f.x, y: f.y, dx: 0, dy: 0, age: 0, life: 2.4, rgb: color(f.s), n: f.n || 0, s: f.s });
    return true;
  }
  if (f.type === 'goal') {
    // 動きを減らす設定では、光の柱を立てない
    if (!calm() && !glints.some((g) => g.kind === 'goal' && g.age < 0.5)) glints.push({ kind: 'goal', x: f.x, y: f.y, dx: 0, dy: -1, age: 0, life: 3, rgb: '255,226,140', n: 0, s: f.s });
    return true;
  }
  if (calm() || glints.length >= 200) return false;
  if (f.type === 'deliver' && seen(f.x, f.y)) {
    // 納品所の外から中へ：マスの中心から、納品所の中心の向きへ飛び込む
    const cx = f.x + 0.5, cy = f.y + 0.5, vx = HUB_CENTER[0] - cx, vy = HUB_CENTER[1] - cy;
    const [dx, dy] = Math.abs(vx) >= Math.abs(vy) ? [Math.sign(vx) || 1, 0] : [0, Math.sign(vy) || 1];
    glints.push({ kind: 'trail', x: cx, y: cy, dx, dy, age: 0, life: 0.42, rgb: color(f.s), n: 0, s: f.s });
  } else if (f.type === 'react' && seen(f.x, f.y)) {
    if (popBudget < 1) return false;
    popBudget--;
    glints.push({ kind: 'pop', x: f.x + 0.5, y: f.y + 0.5, dx: 0, dy: 0, age: 0, life: 0.38, rgb: color(f.s), n: 0, s: f.s });
  }
  return false;
}

/**
 * 光の効果を描く（粒子のあとに呼ぶ）。G は光の層（高画質のときだけある）。three は立体表示の画面の層と、高さつきの投影。
 * 標準の画質では、列車の数だけを描き、ほかの光は捨てる
 */
export function drawGlints(ctx: CanvasRenderingContext2D, G: CanvasRenderingContext2D | null, P: Palette, sx: ToScreen, sy: ToScreen, z: number, dt: number, cw: number, ch: number,
  three: { screen: CanvasRenderingContext2D; sh: number; project(x: number, y: number, h?: number): [number, number] } | null) {
  view = { x0: (0 - sx(0)) / z, y0: (0 - sy(0)) / z, x1: (cw - sx(0)) / z, y1: (ch - sy(0)) / z };
  const now = performance.now() / 1000;
  popBudget = Math.min(POP_MAX, popBudget + (now - popAt) * POP_RATE); popAt = now;
  const light = P.name === 'light';
  if (!glints.length) return;
  ctx.save(); // 線の端・文字の揃え・透明度を、あとの絵に持ち越さない
  for (let i = glints.length - 1; i >= 0; i--) {
    const g = glints[i];
    g.age += dt;
    if (g.age >= g.life || (!G && g.kind !== 'train')) { glints.splice(i, 1); continue; }
    const k = g.age / g.life;
    if (g.kind === 'trail' && G) {
      // 光の尾：頭が納品所の中へ進み、尾が少し遅れてついていく。光の層には太くにじむ光、絵には細く明るい芯
      const e = 1 - (1 - k) * (1 - k), hx = g.x - g.dx * 1.3 + g.dx * 1.6 * e, hy = g.y - g.dy * 1.3 + g.dy * 1.6 * e;
      const tx = hx - g.dx * (0.35 + 0.8 * (1 - k)), ty = hy - g.dy * (0.35 + 0.8 * (1 - k));
      const a = 1 - k, X0 = sx(tx), Y0 = sy(ty), X1 = sx(hx), Y1 = sy(hy);
      G.lineCap = 'round';
      G.strokeStyle = `rgba(${g.rgb},${0.9 * a})`; G.lineWidth = Math.max(6, z * 0.5);
      G.beginPath(); G.moveTo(X0, Y0); G.lineTo(X1, Y1); G.stroke();
      const gr = ctx.createLinearGradient(X0, Y0, X1, Y1);
      gr.addColorStop(0, `rgba(${g.rgb},0)`); gr.addColorStop(0.6, `rgba(${g.rgb},${0.7 * a})`); gr.addColorStop(1, `rgba(255,252,236,${0.95 * a})`);
      ctx.lineCap = 'round'; ctx.strokeStyle = gr; ctx.lineWidth = Math.max(2, z * 0.11);
      ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
    } else if (g.kind === 'pop' && G) {
      // 反応を終えた光：光の層に明るい玉、絵に広がる細い輪
      const x = sx(g.x), y = sy(g.y), r = z * (0.5 + 1.3 * k), a = 1 - k;
      if (x < -r * 2 || y < -r * 2 || x > cw + r * 2 || y > ch + r * 2) continue;
      const gr = G.createRadialGradient(x, y, 0, x, y, r * 1.6);
      gr.addColorStop(0, `rgba(255,252,236,${0.95 * a})`); gr.addColorStop(0.4, `rgba(${g.rgb},${0.7 * a})`); gr.addColorStop(1, `rgba(${g.rgb},0)`);
      G.fillStyle = gr; G.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
      ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = `rgb(${g.rgb})`; ctx.lineWidth = Math.max(1.5, z * 0.06);
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,252,236,0.9)';
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, z * 0.09 * (1 - k * 0.6)), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (g.kind === 'goal' && G) {
      pillar(ctx, G, three, sx, sy, z, g, k, light);
    } else if (g.kind === 'train') {
      // 降ろす駅：光の輪が広がり、降ろした数が浮かぶ（数は標準の画質でも出す）
      const x = sx(g.x), y = sy(g.y);
      if (x < -80 || y < -80 || x > cw + 80 || y > ch + 80) continue;
      const ring = z * (0.9 + 1.4 * Math.min(1, k * 2.2)), a = calm() ? 0 : Math.max(0, 1 - k * 1.6);
      if (a > 0) { ctx.globalAlpha = a; ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(2, z * 0.08); ctx.beginPath(); ctx.arc(x, y, ring, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      if (G && a > 0) { const gr = G.createRadialGradient(x, y, 0, x, y, ring * 1.4); gr.addColorStop(0, `rgba(255,236,180,${0.7 * a})`); gr.addColorStop(1, 'rgba(255,236,180,0)'); G.fillStyle = gr; G.fillRect(x - ring * 1.4, y - ring * 1.4, ring * 2.8, ring * 2.8); }
      if (z >= 6) {
        const fs = Math.max(12, Math.min(20, z * 0.42)), ty = y - z * 1.25 - k * z * 0.9, txt = `+${g.n}`;
        ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
        ctx.font = `700 ${fs}px ${FONT_MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width, ic = fs * 1.15, bw = tw + ic + 14, bx = x - bw / 2;
        ctx.fillStyle = P.skin === 'punk' ? '#0b0d10' : P.plate; ctx.strokeStyle = P.hi; ctx.lineWidth = 2;
        rr(ctx, bx, ty - fs * 0.8, bw, fs * 1.6, 5); ctx.fill(); ctx.stroke();
        ctx.drawImage(sprite(g.s), bx + 4, ty - ic / 2, ic, ic);
        ctx.fillStyle = P.skin === 'punk' ? '#eef0ea' : P.ink; ctx.fillText(txt, bx + 8 + ic, ty + 0.5);
        ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      }
    }
  }
  ctx.restore();
}

/** 指令を達成したとき：納品所から光の柱が立つ（高画質）。立体表示では、画面の層に高さをつけて描く */
function pillar(ctx: CanvasRenderingContext2D, G: CanvasRenderingContext2D, three: { screen: CanvasRenderingContext2D; sh: number; project(x: number, y: number, h?: number): [number, number] } | null,
  sx: ToScreen, sy: ToScreen, z: number, g: Glint, k: number, light: boolean) {
  // 立ち上がり 0.2、保ち、終わり 1/3 で消える
  const env = Math.min(1, k / 0.07) * Math.min(1, (1 - k) / 0.33), flick = 0.9 + 0.1 * Math.sin(g.age * 40);
  const a = env * flick, hs = hubRect(2).s;
  if (three) {
    // 柱の先は 14 マスの高さ。うんと寄って先がカメラより後ろになるとき（低い画面）や、画面よりずっと上へ出るときは、画面 1 枚ぶん上で止める
    const S = three.screen, [bx, by] = three.project(g.x, g.y, 0), top = riseTo(three.project, g.x, g.y, 14, -three.sh);
    if (!top) return;
    const [tx, ty] = top, wid = Math.max(10, Math.abs(three.project(g.x + hs * 0.5, g.y, 0)[0] - bx));
    S.save(); S.globalCompositeOperation = 'lighter';
    for (const [m, al] of [[1.6, 0.18], [0.8, 0.35], [0.3, 0.7]] as const) {
      const gr = S.createLinearGradient(bx, by, tx, ty);
      gr.addColorStop(0, `rgba(${g.rgb},${al * a})`); gr.addColorStop(1, `rgba(${g.rgb},0)`);
      S.strokeStyle = gr; S.lineWidth = wid * m; S.lineCap = 'round';
      S.beginPath(); S.moveTo(bx, by); S.lineTo(tx, ty); S.stroke();
    }
    S.restore();
    return;
  }
  const x = sx(g.x), y = sy(g.y), top = Math.min(y - z * 4, 0) - 20, wid = Math.max(14, z * hs * 0.55);
  for (const [m, al] of [[2.2, 0.16], [1, 0.35], [0.35, 0.8]] as const) {
    const gr = G.createLinearGradient(0, y, 0, top);
    gr.addColorStop(0, `rgba(${g.rgb},${al * a})`); gr.addColorStop(0.6, `rgba(${g.rgb},${al * a * 0.45})`); gr.addColorStop(1, `rgba(${g.rgb},0)`);
    G.fillStyle = gr; G.fillRect(x - (wid * m) / 2, top, wid * m, y - top);
  }
  const r = wid * (1.2 + 1.5 * Math.min(1, k * 3)), base = G.createRadialGradient(x, y, 0, x, y, r);
  base.addColorStop(0, `rgba(255,250,230,${0.8 * a})`); base.addColorStop(1, 'rgba(255,250,230,0)');
  G.fillStyle = base; G.fillRect(x - r, y - r, r * 2, r * 2);
  // 明るい地図では光の層が見えにくいので、絵の上にも薄く重ねる
  if (light) {
    const gr = ctx.createLinearGradient(0, y, 0, top);
    gr.addColorStop(0, `rgba(255,236,160,${0.35 * a})`); gr.addColorStop(1, 'rgba(255,236,160,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - wid / 2, top, wid, y - top);
  }
}

// ---------------- 稼働率の重ね表示：ベルトの毎分の数と、装置の色分け ----------------

/** ベルトごとの、直近の毎分の数（近くの絵では見えているベルトだけ、引いた視野ではその階のベルトを、遊んだ時間で 2 秒ごとに計り直す） */
const rates = new WeakMap<Ent, { t: number; n: number; r: number }>();
export function beltRate(w: World, e: Ent): number {
  const n = beltPassed(e), t = w.playMs, s = rates.get(e);
  if (!s) { rates.set(e, { t, n, r: -1 }); return -1; }
  const dt = t - s.t;
  if (dt >= (s.r < 0 ? 1000 : 2000)) {
    const r = ((n - s.n) / dt) * 60000;
    s.r = s.r < 0 ? r : s.r * 0.4 + r * 0.6; s.t = t; s.n = n;
  }
  return s.r;
}
const fmtRate = (r: number) => (r >= 10 ? String(Math.round(r)) : r.toFixed(1));

/** 斜線の網（色覚の補助で、止まりがちの装置に重ねる） */
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, lw: number) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip(); ctx.beginPath();
  for (let d = -s; d < s; d += s * 0.25) { ctx.moveTo(x + d, y); ctx.lineTo(x + d + s, y + s); }
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
}

/**
 * 統計の重ね表示（stats）と色分け（切り替え）。装置と札の上、稼働率の札の下に描く。
 * base は地面の層、top は天面の層（平らな表示では同じ）。立体表示では、1 マスの装置の色分けとベルトの線は地面へ（1 マスの箱の天面には地面の絵が貼られる）、
 * 2×2 の装置の色分けとベルトの札は天面へ描く（天面の層に描くと、1 マスの箱やベルトの上に浮いて見える）
 */
export function mapStats(base: CanvasRenderingContext2D, top: CanvasRenderingContext2D, P: Palette, w: World, stats: boolean, sx: ToScreen, sy: ToScreen, z: number, inView: (e: Ent) => boolean) {
  const punk = P.skin === 'punk';
  if (heat && z >= 5) {
    const cv = cvdOn();
    for (const c of base === top ? [base] : [base, top]) { c.textAlign = 'center'; c.textBaseline = 'middle'; }
    for (const e of w.ents.values()) {
      const cfg = isMachine(e.kind) && !!e.recipe;
      if ((!cfg && e.kind !== 'extractor') || !inView(e)) continue;
      const u = Math.max(0, Math.min(1, e.u ?? (e.kind === 'extractor' ? 1 : 0))), sz = sizeOf(e), pad = z * 0.08, ctx = sz === 2 ? top : base;
      // 一時停止している装置は灰色で「‖」（遊んでいる装置と分ける）
      const x = sx(e.x) + pad, y = sy(e.y) + pad, s = sz * z - pad * 2, edge = e.off ? 'rgba(118,122,128,0.95)' : heatColor(u, light(P), cv, 0.95, true);
      ctx.fillStyle = e.off ? 'rgba(128,132,140,0.42)' : heatColor(u, light(P), cv, 0.42); ctx.fillRect(x, y, s, s);
      if (cv && u < STALL && !e.off) hatch(ctx, x, y, s, edge, Math.max(1, z * 0.045));
      ctx.strokeStyle = edge; ctx.lineWidth = Math.max(2, z * 0.07); ctx.strokeRect(x, y, s, s);
      // 色だけに頼らない：近づけば割合を書く
      if (z >= 18 && !stats) {
        const fs = Math.max(10, Math.min(14, z * 0.26)), tx = e.off ? '‖' : `${Math.round(u * 100)}%`;
        ctx.font = `700 ${fs}px ${FONT_MONO}`;
        ctx.lineWidth = 3; ctx.strokeStyle = punk ? '#0b0d10' : P.paper; ctx.strokeText(tx, x + s / 2, y + s - fs * 0.7);
        ctx.fillStyle = punk ? '#eef0ea' : P.ink; ctx.fillText(tx, x + s / 2, y + s - fs * 0.7);
      }
    }
    for (const c of base === top ? [base] : [base, top]) c.textBaseline = 'alphabetic';
  }
  if (!stats) return;
  if (z < 15) {
    // 引いた視点：流れの多いベルトほど太い線。ベルトは地面にあるので、地面の層に描く
    const list: Ent[] = [];
    for (const e of w.ents.values()) if (e.kind === 'belt' && inView(e)) list.push(e);
    flowLines(base, P, w, sx, sy, z, list);
    return;
  }
  const ctx = top;
  // 近い視点：4 マスおきに、毎分の数の札
  const fs = Math.max(9.5, Math.min(13, z * 0.27));
  ctx.font = `700 ${fs}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || !inView(e)) continue;
    const r = beltRate(w, e);
    if (r < 0.5 || ((e.x + 3 * groundY(e.y)) & 3) !== 0) continue;
    const tx = `${fmtRate(r)}/分`, tw = ctx.measureText(tx).width + 8, x = sx(e.x + 0.5), y = sy(e.y + 0.5);
    ctx.fillStyle = punk ? '#0b0d10' : P.plate; ctx.strokeStyle = P.hi; ctx.lineWidth = 1.5;
    rr(ctx, x - tw / 2, y - fs * 0.75, tw, fs * 1.5, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = punk ? '#eef0ea' : P.ink; ctx.fillText(tx, x, y + 0.5);
  }
  ctx.textBaseline = 'alphabetic';
}
const light = (P: Palette) => P.name === 'light';

/** 流れの線の太さの段（毎分の数 r から 0〜4）。0.5 未満は線を引かない（-1） */
export const flowStep = (r: number) => (r < 0.5 ? -1 : r < 15 ? 0 : r < 40 ? 1 : r < 80 ? 2 : r < 160 ? 3 : 4);
/** 段 k の線の太さ（ピクセル）。うんと引いても（far.ts の引いた視野）、段の違いが見える太さは残す */
export const flowWidth = (z: number, k: number) => Math.min(Math.max(z * 0.95, 1.5 + k), 2 + k * 2.2);
/** 流れの線の下に敷く、ひと回り太い縁の色 */
export const flowEdge = (P: Palette) => (P.skin === 'punk' ? '#0b0d10' : P.ink);

/**
 * 流れの多いベルトほど太い線（太さの段ごとに、まとめて 1 回で引く）。belts は見えているベルト。
 * 引いた視野（far.ts）は、ベルトを 1 本ずつ線で引くと重いので、同じ太さの段で続くベルトを帯にまとめて塗る
 */
function flowLines(ctx: CanvasRenderingContext2D, P: Palette, w: World, sx: ToScreen, sy: ToScreen, z: number, belts: readonly Ent[]) {
  const groups: number[][] = [[], [], [], [], []];
  for (const e of belts) {
    const k = flowStep(beltRate(w, e));
    if (k < 0) continue;
    const cx = sx(e.x + 0.5), cy = sy(e.y + 0.5);
    groups[k].push(cx - DX[e.dir] * z * 0.5, cy - DY[e.dir] * z * 0.5, cx + DX[e.dir] * z * 0.5, cy + DY[e.dir] * z * 0.5);
  }
  ctx.lineCap = 'round';
  for (const [pass, col] of [[1, flowEdge(P)], [0, P.hi]] as const) {
    groups.forEach((g, k) => {
      if (!g.length) return;
      ctx.strokeStyle = col; ctx.globalAlpha = pass ? 0.55 : 0.95;
      ctx.lineWidth = flowWidth(z, k) + pass * 2;
      ctx.beginPath();
      for (let i = 0; i < g.length; i += 4) { ctx.moveTo(g[i], g[i + 1]); ctx.lineTo(g[i + 2], g[i + 3]); }
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

// ---------------- 納品所の上の計器 ----------------

let meterCache = { tick: -1, w: null as World | null, all: 0, goal: 0 };
/**
 * 納品所の上に、直近 1 分の納品の速さを出す。近づけば（z ≥ 16）、いまの指令の物質の速さと、操業評価の目盛り（B・A・S）も出す。
 * cx：納品所の中心、top：上の縁（画面）
 */
export function hubMeter(ctx: CanvasRenderingContext2D, P: Palette, w: World, cx: number, top: number, z: number) {
  if (z < 9 || !Object.keys(w.delivered).length) return;
  if (meterCache.w !== w || Math.abs(w.tick - meterCache.tick) >= 15) meterCache = { tick: w.tick, w, all: recentRate(w), goal: recentRate(w, 'goal') };
  const punk = P.skin === 'punk', g = currentGoal(w), graded = !!g && !g.strict && z >= 16;
  const fs = Math.max(11, Math.min(14, z * 0.3)), ink = punk ? '#eef0ea' : P.ink, pad = 7;
  // 文字の幅を測ってから札の大きさを決める（重ならない）
  const main = `${fmtRate(meterCache.all)}/分`, rate = meterCache.goal, grade = GRADES.find((q) => rate >= q.min)!;
  const side = graded ? `${label(g!.s)} ${fmtRate(rate)}/分・評価 ${grade.g}` : '';
  ctx.font = `700 ${fs}px ${FONT_UI}`; const wL = ctx.measureText('納品 ').width;
  ctx.font = `700 ${fs * 1.05}px ${FONT_MONO}`; const wM = ctx.measureText(main).width;
  ctx.font = `600 ${fs * 0.8}px ${FONT_UI}`; const wS = side ? ctx.measureText(side).width + fs : 0;
  const pw = Math.max(graded ? fs * 12 : 0, pad * 2 + wL + wM + wS), ph = graded ? fs * 3 : fs * 1.7, x = cx - pw / 2, y = top - ph - z * 0.35;
  ctx.fillStyle = punk ? '#0b0d10' : P.plate; ctx.strokeStyle = punk ? P.hi : P.ink; ctx.lineWidth = 1.5;
  rr(ctx, x, y, pw, ph, punk ? 0 : 5); ctx.fill(); ctx.stroke();
  const row = y + fs * 0.85;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = ink;
  ctx.font = `700 ${fs}px ${FONT_UI}`; ctx.fillText('納品', x + pad, row);
  ctx.font = `700 ${fs * 1.05}px ${FONT_MONO}`; ctx.fillText(main, x + pad + wL, row);
  if (graded) {
    // 操業評価は、いまの指令の物質の速さで決まる。棒は毎分 40 まで、目盛りは B・A・S（毎分 6・15・30）
    ctx.font = `600 ${fs * 0.8}px ${FONT_UI}`; ctx.textAlign = 'right'; ctx.fillStyle = punk ? '#aeb7bf' : P.soft;
    ctx.fillText(side, x + pw - pad, row);
    const cap = 40, bx = x + pad, bw = pw - pad * 2, by = y + fs * 1.6, bh = fs * 0.45;
    ctx.fillStyle = punk ? '#262b31' : light(P) ? '#e6e9e2' : '#1b2721'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = grade.g === 'S' ? '#2f8f55' : grade.g === 'A' ? (light(P) ? '#3c7fc0' : '#6aa8e0') : grade.g === 'B' ? '#c9821a' : P.red;
    ctx.fillRect(bx, by, bw * Math.min(1, rate / cap), bh);
    ctx.font = `700 ${fs * 0.6}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = ink;
    for (const q of GRADES) if (q.min > 0) { const tx = bx + bw * (q.min / cap); ctx.fillRect(tx - 0.5, by - 2, 1, bh + 4); ctx.fillText(q.g, tx, by + bh + fs * 0.42); }
  }
  ctx.textBaseline = 'alphabetic';
}
