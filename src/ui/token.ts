import { parseFormula } from '../chem/formula';
import { element } from '../content/elements';
import { sub } from '../content/substances';
import { layoutOf } from '../content/tokenlayout';
import { BRASS, BRASS_DARK, onThemeChange, palette } from './theme';

/** 物質の絵柄。元素ごとの固有の形を、分子のように並べて描く */

const paths = new Map<string, Path2D>();
function pathOf(sym: string): Path2D {
  let p = paths.get(sym);
  if (!p) { p = new Path2D(element(sym).d); paths.set(sym, p); }
  return p;
}

/** 元素の形を 1 つ描く。r は半径 */
export function drawElement(ctx: CanvasRenderingContext2D, sym: string, x: number, y: number, r: number, count?: number) {
  const el = element(sym);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.fillStyle = el.color;
  ctx.fill(pathOf(sym), el.evenodd ? 'evenodd' : 'nonzero');
  ctx.lineWidth = 0.13;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette().edge;
  ctx.stroke(pathOf(sym));
  ctx.restore();
  if (count && count > 1) {
    ctx.font = `700 ${r * 1.05}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = r * 0.28;
    ctx.strokeStyle = 'rgba(8,12,10,0.9)';
    ctx.strokeText(String(count), x, y + r * 0.05);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(count), x, y + r * 0.05);
  }
}

/** 物質を描く。r は台の半径。台の形は常温での状態（気体＝円、液体＝しずく、固体＝角丸の四角） */
export function drawToken(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number) {
  const s = sub(id);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  const P = palette();
  if (s.mask) {
    // 分析用の試料は、見た目では区別できない
    ctx.beginPath();
    ctx.arc(0, 0, 0.95, 0, Math.PI * 2);
    ctx.fillStyle = P.plate;
    ctx.fill();
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = P.ink;
    ctx.setLineDash([0.3, 0.2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.red;
    ctx.font = '700 1.25px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0.08);
    ctx.restore();
    return;
  }
  const punk = P.skin === 'punk';
  ctx.beginPath();
  if (id === 'e') ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
  else if (punk && s.state === 'solid') {
    // 工業：固体は角を落とした木箱
    const a = 0.9, c = 0.3;
    ctx.moveTo(-a + c, -a); ctx.lineTo(a - c, -a); ctx.lineTo(a, -a + c); ctx.lineTo(a, a - c); ctx.lineTo(a - c, a); ctx.lineTo(-a + c, a); ctx.lineTo(-a, a - c); ctx.lineTo(-a, -a + c);
    ctx.closePath();
  } else if (punk && s.state === 'gas') {
    // 気体は八角のボンベの口金
    for (let i = 0; i < 8; i++) ctx.lineTo(Math.cos(Math.PI / 8 + (i * Math.PI) / 4), Math.sin(Math.PI / 8 + (i * Math.PI) / 4));
    ctx.closePath();
  } else if (s.state === 'solid') {
    const a = 0.9, c = 0.34;
    ctx.moveTo(-a + c, -a); ctx.lineTo(a - c, -a); ctx.quadraticCurveTo(a, -a, a, -a + c); ctx.lineTo(a, a - c); ctx.quadraticCurveTo(a, a, a - c, a);
    ctx.lineTo(-a + c, a); ctx.quadraticCurveTo(-a, a, -a, a - c); ctx.lineTo(-a, -a + c); ctx.quadraticCurveTo(-a, -a, -a + c, -a);
  } else if (s.state === 'liquid') {
    ctx.moveTo(0, -1.18);
    ctx.bezierCurveTo(1.35, -0.1, 0.95, 1, 0, 1);
    ctx.bezierCurveTo(-0.95, 1, -1.35, -0.1, 0, -1.18);
  } else ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fillStyle = punk && P.name === 'dark' ? '#101317' : P.plate;
  ctx.fill();
  ctx.lineJoin = punk ? 'miter' : 'round';
  if (punk) {
    // 太い黒縁の内側に、物質の色の細い縁
    ctx.lineWidth = 0.2; ctx.strokeStyle = '#0b0d10'; ctx.stroke();
    ctx.lineWidth = 0.07; ctx.strokeStyle = P.name === 'dark' ? s.color : '#f4f5f2';
    if (!s.formula && id !== 'e') ctx.setLineDash([0.22, 0.16]);
    ctx.stroke();
  } else {
    if (P.skin === 'arcane') {
      // 魔術：真鍮の輪にはめた札
      ctx.lineWidth = 0.17; ctx.strokeStyle = BRASS_DARK; ctx.stroke();
      ctx.lineWidth = 0.08; ctx.strokeStyle = BRASS;
    } else if (P.skin === 'lab') {
      // 研究所：ガラスの容器。銀の縁の内側に、青緑の細い光の縁
      ctx.lineWidth = 0.18; ctx.strokeStyle = P.name === 'light' ? '#6f7d89' : '#02060b'; ctx.stroke();
      ctx.lineWidth = 0.07; ctx.strokeStyle = P.name === 'light' ? '#0fa9bb' : '#2ef0e0';
    } else {
      ctx.lineWidth = 0.1;
      ctx.strokeStyle = P.ink;
    }
    if (!s.formula && id !== 'e') ctx.setLineDash([0.22, 0.16]); // 混合物・高分子は破線
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const dy = s.state === 'liquid' && id !== 'e' ? 0.1 : 0;
  for (const a of layoutOf(id)) drawElement(ctx, a.sym, a.x * 0.9, a.y * 0.9 + dy, a.r * 0.9, a.n);
  ctx.restore();
}

const sprites = new Map<string, HTMLCanvasElement>();
onThemeChange(() => sprites.clear());
const SPRITE = 112;
/** ベルト上で使う、描き済みの絵柄 */
export function sprite(id: string): HTMLCanvasElement {
  let cv = sprites.get(id);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = SPRITE;
    drawToken(cv.getContext('2d')!, id, SPRITE / 2, SPRITE / 2 + 4, SPRITE / 2 - 12);
    sprites.set(id, cv);
  }
  return cv;
}

/** 画面部品に置く小さな絵柄 */
export function tokenIcon(id: string, px = 28): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px * 2;
  cv.style.width = cv.style.height = `${px}px`;
  cv.className = 'ico';
  drawToken(cv.getContext('2d')!, id, px, px + px * 0.06, px * 0.82);
  return cv;
}
export function elementIcon(sym: string, px = 20): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px * 2;
  cv.style.width = cv.style.height = `${px}px`;
  cv.className = 'ico';
  drawElement(cv.getContext('2d')!, sym, px, px, px * 0.86);
  return cv;
}
