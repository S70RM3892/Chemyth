/**
 * 章を終えたときの花火。色は炎色反応：納品所が飲み込んだ元素（Na 黄色、K 赤紫色、Ca 橙赤色、Ba 黄緑色、Cu 青緑色）の色で上がり、
 * 開いた所に元素記号と色の名前が出る。飲み込んだ元素が多いほど、色も数も増える。
 */
export interface FlameColor { sym: string; hex: string; word: string }

interface Shell { x: number; y: number; top: number; at: number; c: FlameColor; big: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; age: number; life: number; hex: string; r: number }
interface Tag { x: number; y: number; age: number; text: string; hex: string }

const shells: Shell[] = [], sparks: Spark[] = [], tags: Tag[] = [];
let clock = 0, veil = 0;

/** 花火を上げる。colors が空なら、色のない白い花火（まだ炎色反応を示す元素を納めていない） */
export function launchFireworks(colors: FlameColor[], count: number) {
  const list = colors.length ? colors : [{ sym: '', hex: '#f3f1e8', word: '' }];
  for (let i = 0; i < count; i++) {
    const c = list[i % list.length];
    shells.push({ x: 0.12 + 0.76 * ((i * 0.618 + 0.13) % 1), y: 1.05, top: 0.18 + 0.3 * ((i * 0.371) % 1), at: clock + i * 0.42 + (i % 3) * 0.1, c, big: i % 4 === 3 });
  }
}
export const fireworksActive = () => shells.length > 0 || sparks.length > 0 || tags.length > 0;

/** 1 コマ進めて描く。cw, ch は画面の大きさ */
export function drawFireworks(ctx: CanvasRenderingContext2D, cw: number, ch: number, dt: number) {
  clock += dt;
  const live = fireworksActive();
  veil += ((live ? 1 : 0) - veil) * Math.min(1, dt * 3);
  if (veil < 0.01 && !live) return;
  // 明るい地図の上でも色が見えるように、夜の幕を引く
  ctx.fillStyle = `rgba(8,10,22,${0.55 * veil})`;
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    if (clock < s.at) continue;
    s.y -= dt * 0.75;
    // 上がっていく筋
    ctx.fillStyle = s.c.hex; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(s.x * cw, s.y * ch, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.fillRect(s.x * cw - 1, s.y * ch, 2, 26);
    if (s.y <= s.top) {
      const n = s.big ? 84 : 52, power = (s.big ? 300 : 220) * Math.min(1.2, cw / 900 + 0.3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (k % 2) * 0.05, v = power * (0.55 + 0.45 * ((k * 0.618) % 1));
        sparks.push({ x: s.x * cw, y: s.y * ch, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 1.3 + ((k * 0.37) % 1) * 0.7, hex: s.c.hex, r: s.big ? 2.6 : 2.1 });
      }
      if (s.c.sym) tags.push({ x: s.x * cw, y: s.y * ch, age: 0, text: `${s.c.sym}　${s.c.word}`, hex: s.c.hex });
      shells.splice(i, 1);
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.age += dt;
    if (p.age >= p.life) { sparks.splice(i, 1); continue; }
    p.vx *= 1 - dt * 1.6; p.vy = p.vy * (1 - dt * 1.6) + 120 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = p.hex;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
    // 尾
    ctx.globalAlpha = k * 0.35;
    ctx.beginPath(); ctx.arc(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.r * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 何の元素の色か
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = tags.length - 1; i >= 0; i--) {
    const g = tags[i];
    g.age += dt;
    if (g.age > 2.4) { tags.splice(i, 1); continue; }
    const a = g.age < 0.2 ? g.age / 0.2 : Math.max(0, 1 - (g.age - 1.6) / 0.8);
    ctx.globalAlpha = Math.min(1, a);
    ctx.font = '700 17px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    const w = ctx.measureText(g.text).width + 20;
    ctx.fillStyle = 'rgba(8,10,22,0.82)'; ctx.fillRect(g.x - w / 2, g.y - 15, w, 30);
    ctx.strokeStyle = g.hex; ctx.lineWidth = 2; ctx.strokeRect(g.x - w / 2, g.y - 15, w, 30);
    ctx.fillStyle = g.hex; ctx.fillText(g.text, g.x, g.y + 1);
  }
  ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
}
