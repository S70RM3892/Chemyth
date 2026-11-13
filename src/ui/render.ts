import { ZONES, hubRect, isSea, resourceAt, zoneAt, zoneSpots, type Zone } from '../content/map';
import { ELEMENTS } from '../content/elements';
import { lineColor, MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { heightOf, TOP_H } from './three';
import { flowTrace, JAM_SEC, MOVERS, type FlowTrace } from '../engine/world';
import { at, floorOf, FLOOR_DY, PLATING, TANK_CAP, chaptersDone, litZones, platingOf, poleOf, beltSpeed, currentGoal, DX, DY, fedTier, goalCount, goalRate, STATION_CAP, inDoors, inflow, isMachine, machineState, outPort, stationRoutes, tunnelPair, portDir, requiredOf, sizeOf, slotPort, type Dir, type Ent, type World } from '../engine/world';
import { BRASS, BRASS_DARK, mix, onThemeChange, palette, type Palette } from './theme';
import { drawElement, sprite } from './token';
import { buildChunkLab, hubLab, labAmbient, labBelts, labFrame, labHubGlow, labSelect, labZoneLabel, machineLab } from './skinLab';
import { districtsOf, type District } from '../engine/districts';
import { equationOf, hexOf, reactionLookById } from '../content/looks';
import { collectCaption, dHCaption } from '../content/captions';
import { drawScene } from './scene';
import { planScene } from '../content/sceneplan';
import type { Recipe } from '../content/recipes';
import { recipeById } from '../content/recipes';
import { agentById, ionsOf, settle } from '../content/ions';
import { washById } from '../content/extract';
import { AMINO_ORDER, aminoOf, phOf, poleAt, type AminoKey } from '../content/phoresis';
import { SEP_PORTS, isSep, sepReady, sepSlots, type SepKind } from '../content/sep';
import { drawFar, farBegin, farEnd } from './far';
import { drawGlints, hubMeter, mapStats, noteFx } from './mapfx';

export interface Camera { x: number; y: number; z: number }
/** WebGL の合成段に渡す層。glow：光っている所（黒地に加算で描く）、mask：効果をかける所（赤＝熱のゆらぎ、青＝水面）。どちらも画面と同じ座標で描ける */
export interface FxLayers { glow: CanvasRenderingContext2D; mask: CanvasRenderingContext2D; /** 高さの層（最高画質）：地面 0.1・水 0・ベルト・装置・納品所ほど高い（明るい） */ height?: CanvasRenderingContext2D | null }
/** 立体表示のときに渡すもの。top：2×2 の装置と納品所、その上を通るもの（線路・札）を描く層（地面と同じ座標、透明地）。
 *  screen：画面にじかに描く層（縁の道しるべ）。boxes：箱の一覧を、ここへ書き足す（1 個につき x, y, 大きさ, 高さ, r, g, b, 層） */
export interface Three { top: CanvasRenderingContext2D; screen: CanvasRenderingContext2D; sw: number; sh: number; project(x: number, y: number, h?: number): [number, number]; boxes: number[]; /** 1 階から見た 2 階の設備（宙に浮く板として描く） */ slabs: number[] }
export interface View { /** 夕暮れ（実際の時刻。0 昼〜1 夜） */ dusk?: number; /** 立体表示 */ three?: Three | null; /** 光と効果の層。あれば、絵と一緒に描く */ fx?: FxLayers | null; /** 見ている階（0 が 1 階） */ floor?: number; tool: string; selected: Ent | null; stats?: boolean; /** 範囲選択 [x0, y0, x1, y1]（両端を含む） */ area?: [number, number, number, number] | null; /** 設計図を置こうとしている場所の見本 */ ghost?: { x: number; y: number; size: number; ok: boolean; dir: number; glyph: string; /** 出口（out）と入口の場所。d は物が流れる向き */ ports?: { x: number; y: number; d: number; out: boolean }[] }[] | null; /** 敷いている途中の線路（マスの中心の列） */ rail?: [number, number][] | null;
  /** 見本を持ち上げて見せる（ずらしている最中） */ lift?: boolean;
  /** 選んだ設備の出口と入口（d は物が流れる向き） */ ports?: { x: number; y: number; d: number; out: boolean }[] | null;
  /** 選んだ装置と同じ反応の装置（印をつける） */ marks?: Ent[] | null;
  /** 反応式の札を、うんと近づかなくても出す */ allPlates?: boolean;
  /** 1 枚だけ描く絵（アルバムの写真、タイトルの小さな絵）。画面の煙や光（粒子・光の効果）は描かず、進めず、消さない。世界の出来事（w.fx）も、画面のために残しておく */ still?: boolean;
  /** 上に重ねて描くもの（src/ui/build2.ts）。base は地面の層、top は天面の層（平らな表示では同じ） */ over?: (base: CanvasRenderingContext2D, top: CanvasRenderingContext2D, sx: (x: number) => number, sy: (y: number) => number, z: number, t: number, view: View) => void }

// 方眼ノートに描いた工場の図面。輪郭線と斜線で描き、ぼかしや発光は使わない
let FONT_HAND = '"Klee One", sans-serif';
/** 小さい文字用。工業スキンの極太書体は小さいと潰れるので使わない */
let FONT_SMALL = FONT_HAND;
const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace';

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// ---- 地形は区画ごとに描いてためておく。地図に果てはないので、見えた所から作る ----
const TS = 24, CH = 16, SIZE = TS * CH;
const chunks = new Map<string, HTMLCanvasElement>();
/** ためておく区画の絵の量（バイト）。1 枚は lod 0 で 576 KB、lod 1 で 144 KB、lod 2 で 36 KB。
 *  ふだんは 96 MB まで（細かさの替わり目で寄ったり引いたりしても、両方の絵が収まる）。見える区画が多いときは、見えている分の 2 倍まで増やす */
const CHUNK_MIN = 96 * 1024 * 1024;
let chunkKeep = CHUNK_MIN, chunkBytes = 0, chunkFrame = 0;
/** 区画の絵を最後に描いたコマ。このコマに描く絵は捨てない */
const chunkUsed = new WeakMap<HTMLCanvasElement, number>();
/** 古いものから捨てる。絵の分のメモリもすぐ返す（参照を外すだけでは GC まで残り、iPad では絵のメモリの上限に当たる） */
const trimChunks = () => {
  if (chunkBytes <= chunkKeep) return;
  for (const [k, c] of chunks) {
    if (chunkBytes <= chunkKeep) break;
    if (chunkUsed.get(c) === chunkFrame) continue;
    chunks.delete(k); chunkBytes -= c.width * c.height * 4; c.width = c.height = 0;
  }
};
onThemeChange(() => { for (const c of chunks.values()) c.width = c.height = 0; chunks.clear(); chunkBytes = 0; });
let scratch: HTMLCanvasElement | null = null;
const ORDER = Object.keys(ZONES) as Zone[];
const mod = (a: number, n: number) => ((a % n) + n) % n;

function buildChunk(P: Palette, cx: number, cy: number): HTMLCanvasElement {
  if (P.skin === 'punk') return buildChunkPunk(P, cx, cy);
  if (P.skin === 'lab') return buildChunkLab(P, cx, cy, TS, CH);
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  scratch ??= Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const t = scratch.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, OX = ox * TS, OY = oy * TS;
  const X = (tx: number) => (tx - ox) * TS, Y = (ty: number) => (ty - oy) * TS;
  const punk = (P.skin as string) === 'punk', light = P.name === 'light';
  const base = P.paper;

  g.fillStyle = base;
  g.fillRect(0, 0, SIZE, SIZE);
  if (punk) {
    // 鋼板の床：ヘアラインの筋
    g.strokeStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.025)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = 0; y < SIZE; y += 4) { const w0 = hash(cx * 31 + y, cy * 17) * SIZE; g.moveTo(w0, y + 0.5); g.lineTo(Math.min(SIZE, w0 + 60 + hash(y, cx) * 160), y + 0.5); }
    g.stroke();
  }

  // 区画にかかる資源地のマス（縁のにじみぶんだけ外側も見る）
  const tiles = new Map<Zone, [number, number][]>();
  for (let y = oy - 1; y <= oy + CH; y++) for (let x = ox - 1; x <= ox + CH; x++) {
    const zn = zoneAt(x, y);
    if (!zn) continue;
    if (!tiles.has(zn)) tiles.set(zn, []);
    tiles.get(zn)!.push([x + 0.5 + (hash(x, y) - 0.5) * 0.3, y + 0.5 + (hash(y, x) - 0.5) * 0.3]);
  }
  const blobs = (c: CanvasRenderingContext2D, list: [number, number][], r: number) => {
    c.beginPath();
    for (const [x, y] of list) { c.moveTo(X(x) + r * TS, Y(y)); c.arc(X(x), Y(y), r * TS, 0, Math.PI * 2); }
    c.fill();
  };
  // 輪郭 → 塗り → 模様、の順に重ねる。輪郭は外周にだけ残る
  for (const [zn, list] of tiles) {
    g.fillStyle = punk && !light ? mix(base, ZONES[zn].tint[1], 0.75) : P.ink;
    blobs(g, list, punk ? 0.88 : 0.86);
  }
  for (const [zn, list] of tiles) {
    const core = ZONES[zn].tint[1];
    g.fillStyle = mix(base, core, punk ? (light ? 0.5 : 0.22) : light ? 0.2 : 0.26);
    blobs(g, list, 0.78);
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, SIZE, SIZE);
    t.fillStyle = '#000';
    blobs(t, list, 0.72);
    t.globalCompositeOperation = 'source-in';
    t.strokeStyle = punk ? (light ? mix(P.ink, core, 0.35) : mix(base, core, 0.6)) : mix(base, core, light ? 0.62 : 0.7);
    t.lineWidth = punk ? 1.1 : 1.4;
    t.lineCap = 'round';
    t.beginPath();
    if (isSea(zn)) {
      const r = TS * 0.62, p = TS * 1.1;
      for (let y = -mod(OY, r); y < SIZE + r; y += r) {
        const row = Math.round((y + OY) / r);
        for (let x = -mod(OX + (mod(row, 2) ? p / 2 : 0), p) - p; x < SIZE + p; x += p) {
          t.moveTo(x, y);
          t.quadraticCurveTo(x + TS * 0.2, y - TS * 0.16, x + TS * 0.4, y);
          t.quadraticCurveTo(x + TS * 0.6, y + TS * 0.16, x + TS * 0.8, y);
        }
      }
    } else {
      const sp = TS * 0.34, dirs = punk ? [1, -1] : [ORDER.indexOf(zn) % 2 ? 1 : -1];
      for (const dir of dirs) {
        // 斜線は地図全体でつながるように、区画の位置からずらす
        const off = mod(dir === 1 ? OX - OY : OX + OY, sp);
        for (let d = -SIZE - off; d < SIZE * 2; d += sp) { t.moveTo(dir === 1 ? d : d + SIZE, 0); t.lineTo(dir === 1 ? d + SIZE : d, SIZE); }
      }
    }
    t.stroke();
    g.drawImage(scratch, 0, 0);
  }

  // 方眼（ノート）／鋼板の継ぎ目と鋲（工業）
  const every = punk ? 4 : 5;
  for (const bold of [false, true]) {
    g.strokeStyle = bold ? P.gridBold : P.grid;
    g.lineWidth = bold ? (punk ? 2 : 1.2) : 1;
    g.beginPath();
    for (let i = 0; i <= CH; i++) {
      if ((mod(ox + i, every) === 0) === bold) { g.moveTo(i * TS + 0.5, 0); g.lineTo(i * TS + 0.5, SIZE); }
      if ((mod(oy + i, every) === 0) === bold) { g.moveTo(0, i * TS + 0.5); g.lineTo(SIZE, i * TS + 0.5); }
    }
    g.stroke();
  }
  if (punk) {
    for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
      if (mod(ox + i, every) || mod(oy + j, every)) continue;
      for (const [dx, dy] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) {
        g.fillStyle = light ? 'rgba(20,24,29,0.45)' : 'rgba(0,0,0,0.7)';
        g.beginPath(); g.arc(i * TS + dx, j * TS + dy, 1.8, 0, Math.PI * 2); g.fill();
        g.fillStyle = light ? 'rgba(255,255,255,0.7)' : 'rgba(255,170,90,0.25)';
        g.beginPath(); g.arc(i * TS + dx - 0.5, j * TS + dy - 0.5, 0.8, 0, Math.PI * 2); g.fill();
      }
    }
  }
  groundDetail(g, P, cx, cy);
  return cv;
}

/** 区画ごとに決まった乱数（同じ区画は、いつも同じ絵になる） */
function rngOf(cx: number, cy: number, salt = 0) {
  let a = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 黒板と方眼ノートに、うっすら残る化学の式（消した跡・鉛筆の跡） */
const GHOSTS = ['H₂O', 'NaCl', 'CO₂', 'NH₃', 'H₂SO₄', 'CH₄', '2H₂ + O₂ → 2H₂O', 'pH = 7', 'PV = nRT', 'C₆H₁₂O₆', 'Fe₂O₃', 'Cu²⁺', 'ΔH < 0', 'mol/L', 'N₂ + 3H₂ ⇄ 2NH₃', 'Kw = 1.0×10⁻¹⁴', 'CaCO₃', 'Ag⁺ + Cl⁻ → AgCl', 'e⁻', 'HNO₃'];
/**
 * 地面の細部（区画の絵にためるので、毎コマの重さは増えない）。
 * 方眼ノート：紙の繊維とむら、鉛筆の消し跡、まれにコーヒーの輪じみと、うすい式。
 * 黒板：消し跡の渦、チョークの粉、消し残した式。
 * 羊皮紙：繊維、しみ（褐色の斑点）、インクの飛び、うすい錬金術の印。
 * 夜の書斎：石の床（石ごとに色が違う）、ひび、苔、青く光る魔法陣（高画質では本当に光る）。
 */
function groundDetail(g: CanvasRenderingContext2D, P: Palette, cx: number, cy: number) {
  const r = rngOf(cx, cy), light = P.name === 'light', arc = P.skin === 'arcane';
  const blob = (x: number, y: number, rad: number, rgb: string, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  const fibers = (n: number, rgb: string, a: number) => {
    g.lineWidth = 0.8; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * SIZE, y = r() * SIZE, ang = r() * Math.PI, len = 4 + r() * 12;
      g.strokeStyle = `rgba(${rgb},${a * (0.5 + r())})`;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang + 0.5) * len * 0.5, y + Math.sin(ang + 0.5) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    }
  };
  const ghost = (rgb: string, a: number, font: string) => {
    // 区画の端で切れないよう、文字の幅を測って、区画の中に収まる所に置く（少し傾けるので、余白を多めに）
    const txt = GHOSTS[Math.floor(r() * GHOSTS.length)], size = 15 + Math.floor(r() * 9), rot = (r() - 0.5) * 0.25;
    g.font = `600 ${size}px ${font}`;
    const wd = g.measureText(txt).width, room = SIZE - wd - 40;
    if (room < 20) return;
    const x = 20 + r() * room, y = 30 + r() * (SIZE - 60);
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = `rgba(${rgb},${a})`; g.textBaseline = 'middle';
    g.fillText(txt, 0, 0);
    g.restore();
  };
  if (!arc && light) {
    // 紙のむら（暖かい色と冷たい色の、大きくうすい斑）と繊維
    for (let i = 0; i < 4; i++) blob(r() * SIZE, r() * SIZE, 80 + r() * 140, r() < 0.5 ? '190,170,120' : '120,150,190', 0.035);
    fibers(70, '60,70,90', 0.06);
    if (r() < 0.22) { const x = r() * SIZE, y = r() * SIZE; g.save(); g.translate(x, y); g.rotate(r() * Math.PI); g.scale(2.6, 0.7); blob(0, 0, 26, '70,80,100', 0.07); g.restore(); }
    if (r() < 0.08) {
      // コーヒーの輪じみ（ふちが濃い、途切れた輪）
      const x = 60 + r() * (SIZE - 120), y = 60 + r() * (SIZE - 120), rad = 26 + r() * 16, a0 = r() * 6.28;
      g.strokeStyle = 'rgba(150,105,55,0.13)'; g.lineWidth = 2.6; g.beginPath(); g.arc(x, y, rad, a0, a0 + 5.3); g.stroke();
      g.strokeStyle = 'rgba(150,105,55,0.06)'; g.lineWidth = 7; g.beginPath(); g.arc(x, y, rad - 3, a0 + 0.4, a0 + 4.4); g.stroke();
    }
    if (r() < 0.3) ghost('70,80,100', 0.07, FONT_HAND);
  } else if (!arc) {
    // 黒板：消し跡の渦、チョークの粉、消し残した式
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = r() * SIZE, y = r() * SIZE, rad = 60 + r() * 120, a0 = r() * 6.28;
      g.strokeStyle = 'rgba(235,240,230,0.025)'; g.lineWidth = 34 + r() * 30;
      g.beginPath(); g.arc(x, y, rad, a0, a0 + 1.4 + r() * 1.6); g.stroke();
    }
    g.fillStyle = 'rgba(235,240,230,0.07)';
    for (let i = 0; i < 150; i++) g.fillRect(r() * SIZE, r() * SIZE, 1 + r(), 1 + r());
    if (r() < 0.4) ghost('235,240,230', 0.075, FONT_HAND);
    if (r() < 0.15) ghost('243,216,107', 0.06, FONT_HAND);
  } else if (light) {
    // 羊皮紙：繊維、褐色のしみ、インクの飛び、うすい錬金術の印
    fibers(80, '110,78,36', 0.07);
    for (let i = 0; i < 5; i++) blob(r() * SIZE, r() * SIZE, 50 + r() * 120, '150,110,50', 0.05);
    for (let k = 0; k < 2; k++) {
      const x = r() * SIZE, y = r() * SIZE;
      for (let i = 0; i < 9; i++) { const rr2 = 1 + r() * 3.5; g.fillStyle = `rgba(120,80,30,${0.08 + r() * 0.12})`; g.beginPath(); g.arc(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40, rr2, 0, Math.PI * 2); g.fill(); }
    }
    if (r() < 0.18) {
      const x = r() * SIZE, y = r() * SIZE; g.fillStyle = 'rgba(59,42,26,0.22)';
      g.beginPath(); g.arc(x, y, 4 + r() * 4, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = 8 + r() * 22; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8 + r() * 2, 0, Math.PI * 2); g.fill(); }
    }
    if (r() < 0.28) sigil(g, 60 + r() * (SIZE - 120), 60 + r() * (SIZE - 120), 34 + r() * 26, r, 'rgba(110,78,36,0.11)', 1.2);
  } else {
    // 夜の書斎：石の床。3 マスごとの石に、ずらした継ぎ目と色の違い、ひび、苔、まれに光る魔法陣
    const ST = TS * 3;
    for (let j = -1; j <= CH / 3 + 1; j++) for (let i = -1; i <= CH / 3 + 1; i++) {
      const sx0 = i * ST + (mod(cy * 6 + j, 2) ? ST / 2 : 0), sy0 = j * ST, h0 = hash(cx * 7 + i, cy * 11 + j);
      g.fillStyle = `rgba(${h0 < 0.5 ? '120,140,200' : '200,170,120'},${0.02 + h0 * 0.04})`;
      g.fillRect(sx0 + 2, sy0 + 2, ST - 4, ST - 4);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2.5; g.strokeRect(sx0 + 1, sy0 + 1, ST - 2, ST - 2);
      g.strokeStyle = 'rgba(160,180,255,0.05)'; g.lineWidth = 1; g.strokeRect(sx0 + 3, sy0 + 3, ST - 6, ST - 6);
    }
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) { let x = r() * SIZE, y = r() * SIZE; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 5; i++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 26; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 3; k++) blob(r() * SIZE, r() * SIZE, 18 + r() * 26, '70,120,80', 0.08);
    if (r() < 0.2) {
      const x = 70 + r() * (SIZE - 140), y = 70 + r() * (SIZE - 140), rad = 38 + r() * 22;
      blob(x, y, rad * 1.6, '92,202,255', 0.07);
      sigil(g, x, y, rad, r, 'rgba(120,215,255,0.55)', 1.6);
    }
  }
}
/** 錬金術の印：二重の円、目盛り、四元素の三角（火・水・空気・土）を一つ */
function sigil(g: CanvasRenderingContext2D, x: number, y: number, rad: number, r: () => number, color: string, lw2: number) {
  g.save(); g.translate(x, y); g.rotate(r() * Math.PI);
  g.strokeStyle = color; g.lineWidth = lw2;
  g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, rad * 0.82, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, k = i % 3 ? 0.88 : 0.94; g.moveTo(Math.cos(a) * rad * 0.82, Math.sin(a) * rad * 0.82); g.lineTo(Math.cos(a) * rad * k, Math.sin(a) * rad * k); }
  g.stroke();
  const kind = Math.floor(r() * 4), up = kind % 2 === 0, tr = rad * 0.55;
  g.beginPath();
  for (let i = 0; i < 3; i++) { const a = (up ? -Math.PI / 2 : Math.PI / 2) + (i * Math.PI * 2) / 3; g.lineTo(Math.cos(a) * tr, Math.sin(a) * tr); }
  g.closePath(); g.stroke();
  // 空気と土は、三角に横線が入る
  if (kind >= 2) { const yy = (up ? 1 : -1) * tr * 0.1; g.beginPath(); g.moveTo(-tr * 0.62, yy); g.lineTo(tr * 0.62, yy); g.stroke(); }
  g.beginPath(); g.arc(0, 0, rad * 0.12, 0, Math.PI * 2); g.stroke();
  g.restore();
}

/** 工業スキンの床：縞鋼板、鋼板の継ぎ目と鋲、油じみ。資源地は角ばった採掘区画で、縁は危険表示 */
function buildChunkPunk(P: Palette, cx: number, cy: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  const ox = cx * CH, oy = cy * CH, light = P.name === 'light', base = P.paper;
  g.fillStyle = base;
  g.fillRect(0, 0, SIZE, SIZE);
  // 鋼板 1 枚ごとに、わずかに色が違う
  const PANEL = 4;
  for (let j = 0; j < CH / PANEL; j++) for (let i = 0; i < CH / PANEL; i++) {
    const h0 = hash(ox / PANEL + i, oy / PANEL + j);
    g.fillStyle = light ? `rgba(255,255,255,${h0 * 0.22})` : `rgba(255,255,255,${h0 * 0.04})`;
    g.fillRect(i * PANEL * TS, j * PANEL * TS, PANEL * TS, PANEL * TS);
  }
  // 縞鋼板のすべり止め
  const tread = (dx: number, color: string) => {
    g.strokeStyle = color; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath();
    for (let y = 6; y < SIZE; y += 12) for (let x = 6; x < SIZE; x += 12) {
      const d = ((x - 6) / 12 + (y - 6) / 12) % 2 ? 1 : -1;
      g.moveTo(x - 2.4 + dx, y - 2.4 * d + dx); g.lineTo(x + 2.4 + dx, y + 2.4 * d + dx);
    }
    g.stroke();
  };
  tread(0, light ? 'rgba(20,24,29,0.09)' : 'rgba(0,0,0,0.5)');
  tread(-1, light ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.035)');
  // 油じみと擦り傷
  for (let k = 0; k < 3; k++) {
    const x = hash(cx * 7 + k, cy * 13) * SIZE, y = hash(cx * 11, cy * 5 + k) * SIZE, r = 30 + hash(cx + k, cy - k) * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, light ? 'rgba(20,24,29,0.13)' : 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = light ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 7; k++) {
    const x = hash(cx * 3 + k, cy * 19) * SIZE, y = hash(cx * 23, cy * 3 + k) * SIZE, a = hash(k, cx + cy) * 6.28, l = 20 + hash(k, cx) * 60;
    g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  g.stroke();

  // 採掘区画
  const INK = '#0b0d10';
  for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
    const x = ox + tx, y = oy + ty, zn = zoneAt(x, y);
    if (!zn) continue;
    const core = ZONES[zn].tint[1], px = tx * TS, py = ty * TS, sea = isSea(zn);
    g.fillStyle = sea ? (light ? '#62aebf' : '#06202b') : mix(base, core, light ? 0.62 : 0.36);
    g.fillRect(px, py, TS, TS);
    if (sea) {
      // 貯水槽の水面
      g.strokeStyle = light ? 'rgba(255,255,255,0.55)' : 'rgba(90,220,255,0.22)'; g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 2; k++) { const wx = px + hash(x + k * 9, y) * (TS - 10), wy = py + 5 + hash(x, y + k * 7) * (TS - 10); g.moveTo(wx, wy); g.lineTo(wx + 8, wy); }
      g.stroke();
    } else {
      // 鉱石のかけら
      for (let k = 0; k < 3; k++) {
        const qx = px + 3 + hash(x + k * 5, y) * (TS - 6), qy = py + 3 + hash(x, y + k * 5) * (TS - 6), r = 2.5 + hash(x + k, y + k) * 4, a = hash(x - k, y + k) * 6.28;
        g.fillStyle = mix(core, k % 2 ? '#ffffff' : '#000000', light ? 0.25 : 0.3);
        g.beginPath();
        for (let v = 0; v < 3; v++) g.lineTo(qx + Math.cos(a + v * 2.1) * r, qy + Math.sin(a + v * 2.1) * r * 0.8);
        g.closePath(); g.fill();
      }
    }
    // 区画の縁：黒い太線と、危険表示の破線。闇では鉱石の色がにじむ
    for (const [dx, dy, x1, y1, x2, y2] of [[1, 0, px + TS, py, px + TS, py + TS], [-1, 0, px, py, px, py + TS], [0, 1, px, py + TS, px + TS, py + TS], [0, -1, px, py, px + TS, py]]) {
      if (zoneAt(x + dx, y + dy) === zn) continue;
      if (!light && !sea) {
        g.strokeStyle = core; g.globalAlpha = 0.3; g.lineWidth = 10;
        g.beginPath(); g.moveTo(x1 - dx * 4, y1 - dy * 4); g.lineTo(x2 - dx * 4, y2 - dy * 4); g.stroke();
        g.globalAlpha = 1;
      }
      g.lineCap = 'butt';
      g.strokeStyle = INK; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = sea ? (light ? '#f4f5f2' : '#3aa7c2') : P.hi; g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.setLineDash([]);
    }
  }

  // 鋼板の継ぎ目：溝と、その縁のハイライト
  for (let i = 0; i <= CH; i += PANEL) {
    g.fillStyle = light ? 'rgba(20,24,29,0.42)' : 'rgba(0,0,0,0.85)';
    g.fillRect(i * TS - 1, 0, 2, SIZE); g.fillRect(0, i * TS - 1, SIZE, 2);
    g.fillStyle = light ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.07)';
    g.fillRect(i * TS + 1, 0, 1, SIZE); g.fillRect(0, i * TS + 1, SIZE, 1);
  }
  // マス目は角の小さな十字だけ
  g.fillStyle = light ? 'rgba(20,24,29,0.22)' : 'rgba(255,255,255,0.09)';
  for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) { if (i % PANEL === 0 || j % PANEL === 0) continue; g.fillRect(i * TS - 2, j * TS, 5, 1); g.fillRect(i * TS, j * TS - 2, 1, 5); }
  // 鋲
  for (let j = 0; j <= CH; j += PANEL) for (let i = 0; i <= CH; i += PANEL) {
    for (const [dx, dy] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) {
      g.fillStyle = light ? '#59626b' : '#000';
      g.beginPath(); g.arc(i * TS + dx, j * TS + dy, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = light ? '#f4f5f2' : `rgba(${P.glow},0.35)`;
      g.beginPath(); g.arc(i * TS + dx - 0.7, j * TS + dy - 0.7, 1, 0, Math.PI * 2); g.fill();
    }
  }
  punkDetail(g, P, cx, cy);
  return cv;
}
/** 工業の床の細部：排水の格子、危険表示の塗装、焦げ跡、闇では赤く光る割れ目、光では水たまり */
function punkDetail(g: CanvasRenderingContext2D, P: Palette, cx: number, cy: number) {
  const r = rngOf(cx, cy, 7), light = P.name === 'light';
  const free = (x: number, y: number) => !zoneAt(cx * CH + Math.floor(x / TS), cy * CH + Math.floor(y / TS));
  if (r() < 0.35) {
    // 排水の格子
    const x = Math.floor(r() * (CH - 2)) * TS + 4, y = Math.floor(r() * (CH - 2)) * TS + 4, wd = TS * 2 - 8, ht = TS - 8;
    if (free(x, y) && free(x + wd, y + ht)) {
      g.fillStyle = light ? 'rgba(20,24,29,0.55)' : 'rgba(0,0,0,0.85)'; g.fillRect(x, y, wd, ht);
      g.strokeStyle = light ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, wd - 1, ht - 1);
      g.fillStyle = light ? '#8d969e' : '#2a2f36';
      for (let i = 4; i < wd - 2; i += 6) g.fillRect(x + i, y + 2, 2, ht - 4);
    }
  }
  if (r() < 0.2) {
    // 危険表示の塗装（黄と黒の斜め縞の帯）
    const x = Math.floor(r() * (CH - 4)) * TS, y = Math.floor(r() * (CH - 1)) * TS + 6, wd = TS * 4, ht = 10;
    if (free(x, y) && free(x + wd, y)) {
      g.save(); g.beginPath(); g.rect(x, y, wd, ht); g.clip();
      g.fillStyle = light ? 'rgba(255,196,0,0.55)' : 'rgba(255,138,31,0.28)'; g.fillRect(x, y, wd, ht);
      g.fillStyle = light ? 'rgba(20,24,29,0.6)' : 'rgba(0,0,0,0.7)';
      for (let i = -ht; i < wd; i += 12) { g.beginPath(); g.moveTo(x + i, y + ht); g.lineTo(x + i + 6, y + ht); g.lineTo(x + i + 6 + ht, y); g.lineTo(x + i + ht, y); g.closePath(); g.fill(); }
      g.restore();
    }
  }
  if (!light) {
    // 焦げ跡と、赤く光る割れ目（高画質では、光の層に拾われて本当に光る）
    for (let k = 0; k < 2; k++) {
      const x = r() * SIZE, y = r() * SIZE, rad = 22 + r() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (r() < 0.3) {
      let x = r() * SIZE, y = r() * SIZE;
      g.lineCap = 'round'; g.lineJoin = 'round';
      const pts: [number, number][] = [[x, y]];
      for (let i = 0; i < 6; i++) { x += (r() - 0.3) * 22; y += (r() - 0.5) * 22; pts.push([x, y]); }
      for (const [wd, col] of [[5, 'rgba(255,90,20,0.18)'], [1.6, 'rgba(255,170,60,0.85)']] as [number, string][]) {
        g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      }
    }
  } else if (r() < 0.3) {
    // 水たまり：空を映す、うすい青灰と、縁の照り
    const x = r() * SIZE, y = r() * SIZE, rw = 20 + r() * 34, rh = 8 + r() * 12;
    if (free(x, y)) {
      g.save(); g.translate(x, y); g.rotate(r() * Math.PI);
      g.fillStyle = 'rgba(120,150,175,0.28)'; g.beginPath(); g.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, 0, rw, rh, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
      g.restore();
    }
  }
}

/** 地面の 1 区画の絵。lod：0 はそのまま、1 は半分、2 は 4 分の 1 の大きさに縮めたもの。
 *  引いた視野で大きい絵を毎フレーム縮めて描くと重いので、あらかじめ縮めた絵を使う */
function chunk(P: Palette, cx: number, cy: number, lod = 0, use = true): HTMLCanvasElement {
  const k = `${P.key}:${cx},${cy}:${lod}`;
  let c = chunks.get(k);
  if (c) {
    if (use) { chunks.delete(k); chunks.set(k, c); chunkUsed.set(c, chunkFrame); } // 最近使ったものを後ろへ
    return c;
  }
  if (lod === 0) c = buildChunk(P, cx, cy);
  else {
    // 元の絵（lod 0）もためておく（寄ったときに作り直さずにすむ）。このコマには描かないので、量が足りなくなれば先に捨てられる
    const full = chunk(P, cx, cy, 0, false), size = full.width >> lod;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(full, 0, 0, size, size);
  }
  chunks.set(k, c);
  chunkBytes += c.width * c.height * 4;
  if (use) { chunkUsed.set(c, chunkFrame); trimChunks(); }
  return c;
}

// 工業スキンの空気：光の側は日差しと塵、闇の側は火の粉
interface Mote { x: number; y: number; v: number; s: number; ph: number }
const motes: Mote[] = Array.from({ length: 46 }, (_, i) => ({ x: hash(i, 3), y: hash(i, 5), v: 0.02 + hash(i, 7) * 0.05, s: 0.6 + hash(i, 9) * 1.8, ph: hash(i, 11) * 6.28 }));

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; text?: string; r: number; tint?: string }
const particles: Particle[] = [];
/** 動きを減らす設定のときは、土ぼこりを出さない */
let calm = false;
export const setCalm = (v: boolean) => { calm = v; };
/** 色覚の補助：状態の印と詰まりの印を、赤と緑の色だけでなく、形と模様でも分ける（緑は青にする） */
let cvd = false;
export const setCvd = (v: boolean) => { cvd = v; };
const CVD_GO = '#2f7fd8';
/** 状態の形（0 丸＝動いている、1 三角＝待っている、2 四角＝止まっている）を道筋に足す */
const lampShape = (c: CanvasRenderingContext2D, x: number, y: number, r: number, st: number) => {
  if (st === 0) c.arc(x, y, r, 0, Math.PI * 2);
  else if (st === 1) { c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.1, y + r * 0.85); c.lineTo(x - r * 1.1, y + r * 0.85); c.closePath(); }
  else c.rect(x - r, y - r, r * 2, r * 2);
};
/** 色覚の補助の印：× と、斜線の網 */
const cross = (c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, lw: number) => { c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); c.moveTo(x + s, y - s); c.lineTo(x - s, y + s); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
const hatch = (c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, lw: number) => {
  c.save(); c.beginPath(); c.rect(x, y, s, s); c.clip(); c.beginPath();
  for (let d = -s; d < s; d += s * 0.25) { c.moveTo(x + d, y); c.lineTo(x + d + s, y + s); }
  c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.restore();
};
/**
 * 置いた・撤去した・ずらしたときの土ぼこり（設備の足もとから外へ散る）。
 * place：輪が広がる、erase：設備の形が薄れて消える、move：行き先で輪が広がる。x, y は設備の左上（階のずれを含む座標）
 */
export function burst(x: number, y: number, size: number, kind: 'place' | 'erase' | 'move') {
  if (calm) return;
  const n = 6 + size * 4, cx = x + size / 2, cy = y + size / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, sp = 0.7 + Math.random() * 0.6;
    particles.push({ x: cx + Math.cos(a) * size * 0.45, y: cy + Math.sin(a) * size * 0.45, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.2, age: 0, life: 0.35 + Math.random() * 0.25, color: 'smoke', r: 0.05 + Math.random() * 0.04, tint: kind === 'erase' ? '#8a8f96' : undefined });
  }
  particles.push({ x: cx, y: cy, vx: 0, vy: 0, age: 0, life: kind === 'erase' ? 0.5 : 0.32, color: kind === 'erase' ? 'gone' : 'ring', r: size / 2 });
  if (particles.length > 900) particles.splice(0, particles.length - 900);
}
const born = new WeakMap<Ent, number>();

function spawn(w: World, P: Palette) {
  for (const f of w.fx.splice(0)) {
    if (noteFx(f)) continue; // 列車の到着と指令の達成は mapfx.ts だけで描く
    if (f.type === 'deliver') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.2, vx: 0, vy: -0.9, age: 0, life: 0.9, color: P.red, text: '+1', r: 0 });
    } else if (f.type === 'vent') {
      // 廃棄口は煙突：捨てた物質の色の煙を吐く
      particles.push({ x: f.x + 0.5 + (Math.random() - 0.5) * 0.2, y: f.y + 0.3, vx: 0.2 + Math.random() * 0.15, vy: -0.6 - Math.random() * 0.3, age: 0, life: 1.6 + Math.random() * 0.8, color: 'smoke', r: 0.13 + Math.random() * 0.07, tint: mix(sub(f.s).color, '#3a3d42', 0.45) });
    } else if (f.type === 'spill') {
      particles.push({ x: f.x + 0.5, y: f.y + 0.5, vx: (Math.random() - 0.5) * 0.8, vy: 0.5, age: 0, life: 0.5, color: P.red, r: 0.06 });
    } else {
      for (let i = 0; i < (P.skin === 'punk' ? 9 : 4); i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: f.x + 0.5, y: f.y + 0.25, vx: Math.cos(a) * 0.3, vy: -0.5 - Math.random() * 0.4, age: 0, life: 0.6 + Math.random() * 0.3, color: P.soft, r: 0.06 + Math.random() * 0.05 });
      }
    }
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300);
}

/** ベルト1マスぶんの道筋。横から入るときは弧になる */
function beltCurve(e: Ent, inDir: Dir) {
  return { ax: -DX[inDir] * 0.5, ay: -DY[inDir] * 0.5, bx: DX[e.dir] * 0.5, by: DY[e.dir] * 0.5 };
}
function onCurve(c: ReturnType<typeof beltCurve>, p: number): [number, number] {
  const q = 1 - p; // 制御点はマスの中心
  return [q * q * c.ax + p * p * c.bx, q * q * c.ay + p * p * c.by];
}

/** 敷いた線路のマスを、描きやすい形（x, y, つながり の並び）にして覚えておく。線路が変わるまで作り直さない */
let railCache: { w: World; rev: number; geo: Int32Array } | null = null;
function railGeo(w: World): Int32Array {
  if (railCache && railCache.w === w && railCache.rev === w.railRev) return railCache.geo;
  const geo = new Int32Array(w.rails.size * 3);
  let i = 0;
  for (const [k, m] of w.rails) { const c = k.indexOf(','); geo[i++] = +k.slice(0, c); geo[i++] = +k.slice(c + 1); geo[i++] = m; }
  railCache = { w, rev: w.railRev, geo };
  return geo;
}
/** いまの信号の状態（検知器と弁の絵に使う） */
let SIG: number[] = [];
/** 区画の集計は 1 秒半に 1 回でよい */
let distCache: { w: World; tick: number; n: number; list: District[] } | null = null;
/** 流れをたどった結果（選んだものが同じあいだは、20 tick ごとに計り直す） */
let flowCache: { e: Ent; w: World; tick: number; f: FlowTrace } | null = null;
function districts(w: World): District[] {
  if (!distCache || distCache.w !== w || Math.abs(w.tick - distCache.tick) > 90 || distCache.n !== w.ents.size) distCache = { w, tick: w.tick, n: w.ents.size, list: districtsOf(w) };
  return distCache.list;
}

/** 地図を描く。1 マスが小さく見えるほど引いたら（平らな表示のとき）、far.ts の戦略図に切り替える */
export function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, cam: Camera, t: number, dt: number, view: View) {
  if (view.three || !farBegin(ctx, cam, t, cw, ch)) drawNear(ctx, cw, ch, w, cam, t, dt, view);
  else {
    // 引いた視野では煙や土ぼこりを描かないので、出来事はためずに捨てる（写真などは、画面の分を消さない）
    if (!view.still) { w.fx.length = 0; particles.length = 0; }
    drawFar(ctx, cw, ch, w, cam, t, view, palette());
    // 旗や名前の札など、上に重ねるもの（build2.ts）は、引いた視野でも小さな印として出す
    const z = cam.z, off = (view.floor || 0) * FLOOR_DY;
    view.over?.(ctx, ctx, (x) => (x - cam.x) * z + cw / 2, (y) => (y - off - cam.y) * z + ch / 2, z, t, view);
  }
  if (!view.three) farEnd(ctx, cw, ch, cam, t);
}

function drawNear(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, cam: Camera, t: number, dt: number, view: View) {
  const P = palette();
  const z = cam.z;
  // 立体表示では、描き先を層ごとに替える。base：地面、T：装置の天面とその上を通るもの
  const base = ctx, three = view.three ?? null, T = three ? three.top : null;
  const use = (c: CanvasRenderingContext2D) => {
    if (c === ctx) return;
    c.textAlign = ctx.textAlign; c.textBaseline = ctx.textBaseline; c.font = ctx.font; c.lineCap = ctx.lineCap; c.lineJoin = ctx.lineJoin;
    ctx = c;
  };
  const rgb01 = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  // 2 階の設備は y を FLOOR_DY だけずらして持っているので、描くときに引く。gy は地面（地形・資源地・1 階）の y
  const off = (view.floor || 0) * FLOOR_DY;
  const sx = (x: number) => (x - cam.x) * z + cw / 2;
  const gy = (y: number) => (y - cam.y) * z + ch / 2;
  const sy = (y: number) => (y - off - cam.y) * z + ch / 2;
  SIG = w.sig;
  // 写真などの 1 枚だけの絵では、出来事を受け取らない（受け取ると、画面に出るはずの光の柱や粒子を、写真の側で使い切ってしまう）
  if (!view.still) spawn(w, P);
  /** 1 枚だけの絵を描く前の粒子の数（描くあいだに足された煙は、画面のものではないので捨てる） */
  const keep = particles.length;
  FONT_HAND = P.font;
  FONT_SMALL = P.skin === 'punk' ? FONT_UI : P.font;
  const punk = P.skin === 'punk', arcane = P.skin === 'arcane', lab = P.skin === 'lab', light = P.name === 'light';

  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  const wx0 = cam.x - cw / 2 / z, wy0 = cam.y - ch / 2 / z, wx1 = cam.x + cw / 2 / z, wy1 = cam.y + ch / 2 / z;
  // 画面の 1 マスが何ピクセルかで、地面の絵の細かさを選ぶ
  const tilePx = z * (ctx.getTransform().a || 1), lod = tilePx >= 20 ? 0 : tilePx >= 10 ? 1 : 2;
  // ためておく量：見えている区画の 2 倍（寄ったときは減らして、余った分を捨てる）
  chunkFrame++;
  chunkKeep = Math.max(CHUNK_MIN, 2 * (Math.floor(wx1 / CH) - Math.floor(wx0 / CH) + 1) * (Math.floor(wy1 / CH) - Math.floor(wy0 / CH) + 1) * (SIZE >> lod) ** 2 * 4);
  trimChunks();
  for (let cy = Math.floor(wy0 / CH); cy <= Math.floor(wy1 / CH); cy++) for (let cx = Math.floor(wx0 / CH); cx <= Math.floor(wx1 / CH); cx++) {
    ctx.drawImage(chunk(P, cx, cy, lod), Math.floor(sx(cx * CH)), Math.floor(gy(cy * CH)), Math.ceil(CH * z) + 1, Math.ceil(CH * z) + 1);
  }

  const x0 = Math.floor(wx0), x1 = Math.ceil(wx1), y0 = Math.floor(wy0), y1 = Math.ceil(wy1);
  const inView = (e: Ent) => e.x >= x0 - 2 && e.x <= x1 + 2 && e.y - off >= y0 - 2 && e.y - off <= y1 + 2;
  // ---- 光と効果の層（WebGL の合成段があるときだけ）----
  const G = view.fx?.glow ?? null, M = view.fx?.mask ?? null;
  if (lab) labFrame(G, M, !!three, calm);
  /** 光の点：中心が明るく、外へ消える。rgb は '255,200,80' の形 */
  const shine = (c2: CanvasRenderingContext2D | null, x: number, y: number, r: number, rgb: string, a: number) => {
    if (!c2 || r <= 0 || x < -r || y < -r || x > cw + r || y > ch + r) return;
    const g = c2.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c2.fillStyle = g; c2.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => shine(G, x, y, r, rgb, a);
  const heat = (x: number, y: number, r: number, a: number) => shine(M, x, y, r, '255,0,0', a);
  const HT = view.fx?.height ?? null;
  if (HT && z >= 7) {
    // 高さの層：水は地面より低く（先に塗る）、そのあと設備を「明るいほうを残す」で重ねる。影とくぼみの陰りになる
    HT.globalCompositeOperation = 'source-over';
    if (!off) {
      HT.fillStyle = 'rgb(0,0,0)';
      for (let y = y0; y <= y1; y++) {
        let run = -1;
        for (let x = x0; x <= x1 + 1; x++) {
          const wet = x <= x1 && waterAt(x, y);
          if (wet && run < 0) run = x;
          else if (!wet && run >= 0) { HT.fillRect(sx(run), gy(y), (x - run) * z, z + 0.5); run = -1; }
        }
      }
    }
    HT.globalCompositeOperation = 'lighten';
    const fl = view.floor || 0;
    const put = (v: number, x: number, y: number, ww: number, hh: number) => { const b = Math.round(v * 255); HT.fillStyle = `rgb(${b},${b},${b})`; HT.fillRect(sx(x), sy(y), ww * z, hh * z); };
    for (const e of w.ents.values()) {
      if (e.kind === 'part' || !inView(e) || floorOf(e.y) !== fl) continue;
      const k = e.kind;
      if (k === 'hub') continue;
      if (k === 'belt') { if (e.dir % 2 === 0) put(0.24, e.x, e.y + 0.22, 1, 0.56); else put(0.24, e.x + 0.22, e.y, 0.56, 1); continue; }
      if (k === 'bridge') { put(0.36, e.x + 0.12, e.y + 0.12, 0.76, 0.76); continue; }
      const sz = sizeOf(e), pad = sz === 2 ? 0.1 : 0.13;
      put(sz === 2 ? 0.62 : k === 'tunnel' ? 0.3 : 0.44, e.x + pad, e.y + pad, sz - pad * 2, sz - pad * 2);
    }
    if (!off) { const hr = hubRect(w.hubSize); put(0.95, hr.x + 0.06, hr.y + 0.06, hr.s - 0.12, hr.s - 0.12); }
    HT.globalCompositeOperation = 'source-over';
  }
  if (M && !off && z >= 9) {
    // 水面：海と入り江のマスを青で塗る（合成段で、さざ波ときらめきになる）
    M.fillStyle = 'rgb(0,0,255)';
    for (let y = y0; y <= y1; y++) {
      let run = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const wet = x <= x1 && waterAt(x, y) && !at(w, x, y); // 設備の上は、ゆらさない
        if (wet && run < 0) run = x;
        else if (!wet && run >= 0) { M.fillRect(sx(run), gy(y), (x - run) * z, z + 0.5); run = -1; }
      }
    }
  }
  if (off) {
    // 2 階：地面を床板で覆い、1 階の設備を薄い影として透かす
    ctx.fillStyle = punk ? (light ? 'rgba(196,201,206,0.82)' : 'rgba(15,18,22,0.84)') : lab ? (light ? 'rgba(226,234,240,0.84)' : 'rgba(6,11,18,0.86)') : light ? 'rgba(240,242,236,0.84)' : 'rgba(22,26,34,0.84)';
    ctx.fillRect(0, 0, cw, ch);
    if (z >= 12) {
      ctx.strokeStyle = punk ? 'rgba(0,0,0,0.3)' : P.grid; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(Math.round(sx(x)) + 0.5, 0); ctx.lineTo(Math.round(sx(x)) + 0.5, ch); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(0, Math.round(gy(y)) + 0.5); ctx.lineTo(cw, Math.round(gy(y)) + 0.5); }
      ctx.stroke();
    }
    for (const e of w.ents.values()) {
      if (e.kind === 'part' || e.y >= FLOOR_DY / 2 || e.x < x0 - 2 || e.x > x1 + 2 || e.y < y0 - 2 || e.y > y1 + 2) continue;
      const sz = sizeOf(e), thin = e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'tunnel', pad = z * (thin ? 0.3 : 0.1);
      ctx.fillStyle = e.kind === 'hub' ? 'rgba(40,46,70,0.45)' : thin ? (light ? 'rgba(60,70,84,0.22)' : 'rgba(200,210,225,0.2)') : light ? 'rgba(60,70,84,0.3)' : 'rgba(200,210,225,0.26)';
      ctx.fillRect(sx(e.x) + pad, gy(e.y) + pad, sz * z - pad * 2, sz * z - pad * 2);
    }
  }
  const lw = (k: number) => Math.max(1.2, z * k);

  if (!off) {
  // ---- 採取機を持っているとき、資源地のマスに印をつける ----
  if (view.tool === 'extractor' && z >= 16) {
    ctx.fillStyle = P.red;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!zoneAt(x, y)) continue;
      ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * 3 + x + y);
      ctx.beginPath();
      ctx.arc(sx(x + 0.5), gy(y + 0.5), z * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- 夜景：指令を達成した資源地に、家々の灯りがともる ----
  {
    const lit = litZones(w);
    if (lit.size) {
      if (!light) ctx.globalCompositeOperation = 'lighter';
      for (const sp of zoneSpots(x0, y0, x1, y1)) {
        if (!lit.has(sp.zone)) continue;
        for (let i = 0; i < 9; i++) {
          const a = hash(i * 7 + 3, Math.round(sp.cx * 3)) * Math.PI * 2, rad = 0.5 + 2.1 * hash(i * 5 + 1, Math.round(sp.cy * 3));
          const px = sx(sp.cx + Math.cos(a) * rad), py = gy(sp.cy + Math.sin(a) * rad * 0.7 + 0.6), k = 0.6 + 0.4 * Math.sin(t * (1.3 + i * 0.21) + i * 2.1), r0 = Math.max(1.6, z * 0.075);
          ctx.fillStyle = `rgba(255,214,107,${0.22 * k})`; ctx.beginPath(); ctx.arc(px, py, r0 * 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(255,226,140,${0.6 + 0.4 * k})`; ctx.beginPath(); ctx.arc(px, py, r0, 0, Math.PI * 2); ctx.fill();
          if (light) { ctx.strokeStyle = 'rgba(90,60,10,0.75)'; ctx.lineWidth = 1; ctx.stroke(); }
          shine(G, px, py, r0 * 7, '255,214,107', 0.55 * k);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---- 資源地の名前 ----
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const sp of zoneSpots(x0, y0, x1, y1)) {
    const zn = ZONES[sp.zone], lx = sp.cx, ly = sp.cy;
    if (lab) { labZoneLabel(ctx, P, zn.name, z >= 20 ? `${sub(zn.resource).name}・${zn.form}` : '', sx(lx), gy(ly), z, zn.tint[1]); continue; }
    if (punk) {
      // 鉱区の標識板
      const fs = Math.max(11, z * 0.3), sub2 = `${sub(zn.resource).name} / ${zn.form}`;
      ctx.font = `400 ${fs}px ${FONT_HAND}`;
      const w1 = ctx.measureText(zn.name).width;
      ctx.font = `700 ${fs * 0.62}px ${FONT_UI}`;
      const w2 = z >= 20 ? ctx.measureText(sub2).width : 0;
      const bw = Math.max(w1, w2) + fs * 1.5, bh = fs * (z >= 20 ? 2.5 : 1.7), bx = sx(lx) - bw / 2, by = gy(ly) - fs * 1.15;
      chamfer(ctx, bx, by, bw, bh, fs * 0.35);
      ctx.fillStyle = '#0b0d10'; ctx.fill();
      ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(1.2, fs * 0.09); ctx.stroke();
      ctx.fillStyle = P.hi;
      ctx.font = `400 ${fs}px ${FONT_HAND}`;
      ctx.fillText(zn.name, sx(lx), gy(ly));
      if (z >= 20) { ctx.fillStyle = '#c9ced2'; ctx.font = `700 ${fs * 0.62}px ${FONT_UI}`; ctx.fillText(sub2, sx(lx), gy(ly) + fs * 0.95); }
      continue;
    }
    const fs = Math.max(12, z * 0.42);
    ctx.font = `600 ${fs}px ${FONT_HAND}`;
    ctx.lineWidth = fs * 0.3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.paper;
    ctx.strokeText(zn.name, sx(lx), gy(ly));
    ctx.fillStyle = P.ink;
    ctx.fillText(zn.name, sx(lx), gy(ly));
    if (z >= 20) {
      const s2 = Math.max(10, z * 0.26), tx = `${sub(zn.resource).name}・${zn.form}`;
      ctx.font = `500 ${s2}px "Zen Kaku Gothic New", sans-serif`;
      ctx.lineWidth = s2 * 0.3;
      ctx.strokeText(tx, sx(lx), gy(ly) + s2 * 1.4);
      ctx.fillStyle = P.soft;
      ctx.fillText(tx, sx(lx), gy(ly) + s2 * 1.4);
    }
  }
  ctx.textBaseline = 'middle';

  // ---- いまの指令で使う資源地が画面の外にあれば、縁に道しるべを出す ----
  const gz = currentGoal(w)?.zone;
  if (gz) {
    const zn = ZONES[gz];
    // 立体表示では、地面の絵の縁は画面の縁ではないので、画面にじかに描く
    const [tx, ty] = three ? three.project(zn.at[0], zn.at[1], 0) : [sx(zn.at[0]), gy(zn.at[1])];
    const pc = three ? three.screen : ctx, pw = three ? three.sw : cw, ph = three ? three.sh : ch;
    if (three) { pc.textAlign = 'center'; pc.textBaseline = 'middle'; }
    if (tx < 0 || tx > pw || ty < 150 || ty > ph - 170) {
      const px = Math.min(pw - 80, Math.max(80, tx)), py = Math.min(ph - 190, Math.max(170, ty));
      const ang = Math.atan2(ty - py, tx - px);
      pc.font = `700 14px ${FONT_SMALL}`;
      const wd = pc.measureText(zn.name).width + 22;
      pc.fillStyle = P.plate;
      pc.strokeStyle = P.ink;
      pc.lineWidth = 1.5;
      rr(pc, px - wd / 2, py - 14, wd, 28, 4);
      pc.fill(); pc.stroke();
      pc.fillStyle = P.ink;
      pc.fillText(zn.name, px, py + 1);
      pc.fillStyle = P.red;
      pc.save();
      pc.translate(px + Math.cos(ang) * (wd / 2 + 10), py + Math.sin(ang) * 25);
      pc.rotate(ang);
      pc.beginPath(); pc.moveTo(8, 0); pc.lineTo(-5, -6); pc.lineTo(-5, 6); pc.closePath(); pc.fill();
      pc.restore();
    }
  }

  }

  // ---- ベルト：輪郭線つきの管。中身の状態で太さと模様が変わる ----
  const belts: { e: Ent; c: ReturnType<typeof beltCurve> }[] = [];
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || !inView(e)) continue;
    belts.push({ e, c: beltCurve(e, inflow(w, e.x, e.y, e.dir) ?? e.dir) });
  }
  type Belt = (typeof belts)[number];
  const trace = (b: Belt) => {
    const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + b.c.ax * z, cy + b.c.ay * z);
    ctx.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z);
  };
  // 固体は幅広のコンベヤ、液体は管、気体は細い管
  const WIDTH = { solid: 0.6, liquid: 0.46, gas: 0.34, none: 0.52 };
  const DASH = { solid: [0.04, 0.21], liquid: [0.18, 0.32], gas: [0.03, 0.22], none: [0.1, 0.4] };
  const st = (b: Belt) => b.e.st ?? 'none';
  const edge = lw(0.045) * 2;
  /** 管の輪郭の色（研究所は銀、夜は黒） */
  const rim = lab ? (light ? '#7f8c97' : '#02060b') : punk ? '#0b0d10' : P.ink;
  // 速さのために：同じ見た目のベルトは 1 本の道にまとめ、1 回の線引きで描く。
  // 大きな工場を引いて見たとき、1 本ずつ描くと 1 フレームに数万回の線引きになる
  type BK = 'solid' | 'liquid' | 'gas' | 'none';
  const KINDS: BK[] = ['solid', 'liquid', 'gas', 'none'];
  const byKind: Record<BK, Belt[]> = { solid: [], liquid: [], gas: [], none: [] };
  for (const b of belts) byKind[st(b)].push(b);
  const strokeAll = (list: Belt[]) => {
    if (!list.length) return;
    ctx.beginPath();
    for (const b of list) {
      const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5);
      ctx.moveTo(cx + b.c.ax * z, cy + b.c.ay * z);
      ctx.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z);
    }
    ctx.stroke();
  };
  /** 状態ごとに線の設定をしてから、その状態のベルトをまとめて描く */
  const pass = (style: (k: BK) => void) => { for (const k of KINDS) if (byKind[k].length) { style(k); strokeAll(byKind[k]); } };
  // 引いた視野では、細部（厚み・流れ線・影）を省く
  const far = z < 15, veryFar = z < 11;
  // 厚み：ベルトと配管を地面から浮かせる。まず地面に落ちる影、次に手前の側面を描き、そのあと上面を描く
  const lift = z * 0.1;
  ctx.lineCap = 'round';
  if (!far && !lab) {
    ctx.save();
    ctx.translate(lift * 0.7, lift * 1.7);
    ctx.strokeStyle = punk ? `rgba(0,0,0,${light ? 0.2 : 0.42})` : P.shadow;
    pass((k) => { ctx.lineWidth = z * WIDTH[k] + edge; });
    ctx.restore();
    ctx.save();
    ctx.translate(0, lift);
    ctx.strokeStyle = punk ? '#0b0d10' : P.ink;
    pass((k) => { ctx.lineWidth = z * WIDTH[k] + edge; });
    pass((k) => { ctx.strokeStyle = mix(P.line[k], punk ? '#0b0d10' : P.ink, punk ? 0.6 : 0.42); ctx.lineWidth = z * WIDTH[k]; });
    ctx.restore();
  }
  if (lab) labBelts(ctx, P, z, t, beltSpeed(w), belts, pass, far, veryFar, sx, sy);
  else if (punk) {
    // 工業：固体はゴムのベルトに鋼の側板、液体と気体は継ぎ手のある配管
    const PW = { solid: 0.62, liquid: 0.44, gas: 0.3, none: 0.5 };
    const casing = '#0b0d10', rail = light ? '#8d969e' : '#4d545c', rubber = light ? '#33383e' : '#16191d';
    const isPipe = (k: BK) => k === 'liquid' || k === 'gas';
    ctx.lineCap = 'round';
    ctx.strokeStyle = casing;
    pass((k) => { ctx.lineWidth = z * PW[k] + lw(0.055) * 2; });
    pass((k) => { ctx.strokeStyle = isPipe(k) ? P.line[k] : rail; ctx.lineWidth = z * PW[k]; });
    // 配管は円筒に見えるよう中央にハイライト、ベルトは中央がゴム
    pass((k) => { ctx.strokeStyle = isPipe(k) ? `rgba(255,255,255,${light ? 0.55 : 0.2})` : rubber; ctx.lineWidth = z * PW[k] * (isPipe(k) ? 0.26 : 0.7); });
    if (!veryFar) {
      ctx.lineCap = 'butt';
      ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
      if (!light) ctx.globalCompositeOperation = 'lighter';
      pass((k) => {
        if (k === 'liquid') { ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(90,220,255,0.85)'; ctx.lineWidth = lw(0.07); ctx.setLineDash([z * 0.2, z * 0.3]); }
        else if (k === 'gas') { ctx.strokeStyle = light ? 'rgba(20,24,29,0.6)' : `rgba(${P.glow},0.8)`; ctx.lineWidth = lw(0.05); ctx.setLineDash([z * 0.04, z * 0.21]); }
        else { ctx.strokeStyle = light ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.lineWidth = z * PW[k] * 0.7; ctx.setLineDash([z * 0.04, z * 0.21]); }
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.setLineDash([]);
    }
    // 配管の継ぎ手
    if (!far) {
      ctx.strokeStyle = casing;
      ctx.lineWidth = lw(0.08);
      ctx.beginPath();
      for (const k of ['liquid', 'gas'] as BK[]) for (const b of byKind[k]) {
        const jx = sx(b.e.x + 0.5 + b.c.ax), jy = sy(b.e.y + 0.5 + b.c.ay), hw = z * (PW[k] / 2 + 0.07);
        const px = b.c.ax ? 0 : 1, py = b.c.ax ? 1 : 0;
        ctx.moveTo(jx - px * hw, jy - py * hw); ctx.lineTo(jx + px * hw, jy + py * hw);
      }
      ctx.stroke();
    }
  } else if (arcane) {
    // 魔術：ガラス管。真鍮色の細い縁、淡いガラス、中を流れる液、青い光の筋。マスの継ぎ目ごとに真鍮の輪
    const GW = { solid: 0.56, liquid: 0.48, gas: 0.4, none: 0.46 };
    ctx.lineCap = 'round';
    ctx.strokeStyle = light ? BRASS_DARK : '#07060d';
    pass((k) => { ctx.lineWidth = z * GW[k] + edge * 0.9; });
    pass((k) => { ctx.strokeStyle = light ? '#eef6fa' : '#1b2436'; ctx.lineWidth = z * GW[k]; });
    pass((k) => { ctx.strokeStyle = mix(P.line[k], light ? '#ffffff' : '#0c1220', 0.25); ctx.lineWidth = z * GW[k] * 0.66; });
    if (!veryFar) {
      ctx.lineCap = 'round';
      if (!light) ctx.globalCompositeOperation = 'lighter';
      ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
      pass((k) => { ctx.strokeStyle = `rgba(${P.glow},${light ? 0.8 : 0.85})`; ctx.lineWidth = lw(k === 'solid' ? 0.05 : 0.075); ctx.setLineDash([z * 0.2, z * 0.3]); });
      ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.82 + z * 0.17;
      pass(() => { ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(210,240,255,0.7)'; ctx.lineWidth = lw(0.028); ctx.setLineDash([z * 0.07, z * 0.43]); });
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      // ガラスの映り込み
      if (!far) { ctx.save(); ctx.translate(-z * 0.035, -z * 0.085); ctx.globalAlpha = light ? 0.75 : 0.28; ctx.strokeStyle = '#ffffff'; pass(() => { ctx.lineWidth = lw(0.03); }); ctx.restore(); ctx.globalAlpha = 1; }
    }
    if (!far) {
      // 真鍮の輪：管が次のマスへ入る所に 1 つ
      ctx.lineCap = 'butt';
      for (const b of belts) {
        const kx = b.c.ax, ky = b.c.ay, gx = sx(b.e.x + 0.5) + kx * z * 0.94, gy = sy(b.e.y + 0.5) + ky * z * 0.94, half = z * (GW[st(b)] / 2 + 0.07);
        // 継ぎ目は流れに直角：入口がマスの左右なら縦、上下なら横
        const px = Math.abs(kx) > Math.abs(ky) ? 0 : 1, py = 1 - px;
        ctx.beginPath(); ctx.moveTo(gx - px * half, gy - py * half); ctx.lineTo(gx + px * half, gy + py * half);
        ctx.strokeStyle = light ? BRASS_DARK : '#07060d'; ctx.lineWidth = z * 0.13 + 2; ctx.stroke();
        ctx.strokeStyle = BRASS; ctx.lineWidth = z * 0.13; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.lineWidth = Math.max(1, z * 0.03); ctx.stroke();
      }
    }
  } else {
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.ink;
    pass((k) => { ctx.lineWidth = z * WIDTH[k] + edge; });
    pass((k) => { ctx.strokeStyle = P.line[k]; ctx.lineWidth = z * WIDTH[k]; });
    if (!veryFar) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = P.ink;
      ctx.globalAlpha = light ? 0.5 : 0.45;
      ctx.lineDashOffset = -t * beltSpeed(w) * z * 0.5;
      pass((k) => { ctx.lineWidth = k === 'solid' ? z * WIDTH.solid * 0.72 : lw(0.05); ctx.setLineDash([z * DASH[k][0], z * DASH[k][1]]); });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  if (G && belts.length && (arcane || punk)) {
    // 管の中の光：魔術はガラス管の青い光、工業は液体の配管だけがうっすら光る
    G.lineCap = 'round';
    const strokeOn = (list: Belt[]) => {
      G.beginPath();
      for (const b of list) { const cx = sx(b.e.x + 0.5), cy = sy(b.e.y + 0.5); G.moveTo(cx + b.c.ax * z, cy + b.c.ay * z); G.quadraticCurveTo(cx, cy, cx + b.c.bx * z, cy + b.c.by * z); }
      G.stroke();
    };
    if (arcane) { G.strokeStyle = `rgba(${P.glow},${light ? 0.34 : 0.5})`; G.lineWidth = z * 0.2; strokeOn(belts); }
    else if (byKind.liquid.length) { G.strokeStyle = `rgba(90,210,255,${light ? 0.14 : 0.3})`; G.lineWidth = z * 0.16; strokeOn(byKind.liquid); }
  }

  // ベルトの段階：強化するほど、中央の流れ線が色を変えて速く流れる
  const tier = Math.min(5, w.up.belt);
  if (tier > 0 && z >= 14) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = ['', '#3f8fd0', '#2fa06a', '#d9a520', '#e0662c', '#c23fb0'][tier];
    ctx.lineWidth = lw(0.075);
    ctx.setLineDash([z * 0.16, z * 0.34]); ctx.lineDashOffset = -t * beltSpeed(w) * z;
    strokeAll(belts);
    ctx.setLineDash([]);
    if (tier >= 3 && !far) { ctx.lineWidth = lw(0.025); ctx.globalAlpha = 0.55; strokeAll(belts); ctx.globalAlpha = 1; }
  }

  // 地下ベルト：入口は後ろ半分、出口は前半分だけ地上に見える。あいだは点線
  for (const e of w.ents.values()) {
    if (e.kind !== 'tunnel' || !inView(e)) continue;
    const cx = sx(e.x + 0.5), cy = sy(e.y + 0.5), wd = z * WIDTH.none, pair = tunnelPair(w, e);
    const dxv = DX[e.dir], dyv = DY[e.dir], side = pair ? -1 : 1;
    if (pair) {
      ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.3; ctx.lineWidth = lw(0.07);
      ctx.setLineDash([z * 0.12, z * 0.16]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx(pair.x + 0.5), sy(pair.y + 0.5)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
    for (const [col, lwid] of [[rim, wd + edge], [P.line.none, wd]] as [string, number][]) {
      ctx.strokeStyle = col; ctx.lineWidth = lwid;
      ctx.beginPath(); ctx.moveTo(cx + dxv * side * z * 0.5, cy + dyv * side * z * 0.5); ctx.lineTo(cx, cy); ctx.stroke();
    }
    const it = e.item;
    if (it) {
      const dist = pair ? Math.abs(pair.x - e.x) + Math.abs(pair.y - e.y) : 1;
      const off = pair ? -0.5 + it.p * dist : it.p - 0.5;
      if (pair ? off < -0.05 : off > 0.05) token(ctx, P, cx + dxv * off * z, cy + dyv * off * z, z, it.s);
    }
    // 坑口：黒い口と、もぐる・出る向きの矢じり
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate((e.dir * Math.PI) / 2);
    ctx.fillStyle = punk ? 'rgba(0,0,0,0.45)' : P.shadow; rr(ctx, -z * 0.17 + z * 0.05, -z * 0.4 + z * 0.1, z * 0.34, z * 0.8, z * 0.08); ctx.fill();
    rr(ctx, -z * 0.17, -z * 0.4, z * 0.34, z * 0.8, z * 0.08);
    ctx.fillStyle = MACHINES.tunnel.color; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = lw(0.05); ctx.stroke();
    rr(ctx, -z * 0.09, -z * 0.3, z * 0.18, z * 0.6, z * 0.05); ctx.fillStyle = '#050607'; ctx.fill();
    ctx.fillStyle = P.hi;
    ctx.beginPath(); ctx.moveTo(z * 0.06, 0); ctx.lineTo(-z * 0.05, -z * 0.1); ctx.lineTo(-z * 0.05, z * 0.1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 立体交差：縦の管の上を横の管がまたぐ
  for (const e of w.ents.values()) {
    if (e.kind !== 'bridge' || !inView(e)) continue;
    const cx = sx(e.x + 0.5), cy = sy(e.y + 0.5), wd = z * WIDTH.none;
    const pipe = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.strokeStyle = lab ? rim : P.ink; ctx.lineWidth = wd + edge;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = P.line.none; ctx.lineWidth = wd;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    pipe(cx, cy - z / 2, cx, cy + z / 2);
    ctx.strokeStyle = P.paper; ctx.lineWidth = wd + edge * 3;
    ctx.beginPath(); ctx.moveTo(cx - z * 0.36, cy); ctx.lineTo(cx + z * 0.36, cy); ctx.stroke();
    pipe(cx - z / 2, cy, cx + z / 2, cy);
  }
  /** まとまった荷の個数の札（×10 など）。荷の右下に出す。引いた視野では出さない */
  /**
   * まとまった荷は、個数ぶんの山で描く（9 個まで。係数がそのまま、ベルトの上に数として見える）。10 個からは 9 個の山に個数の札を添える。
   * 引いた視野では、ひとつの粒で描く
   */
  const load = (x: number, y: number, s: string, n: number | undefined) => {
    const k = Math.min(9, n || 1);
    if (far || k <= 1) { token(ctx, P, x, y, z, s, far); if (!far) stack(x, y, n); return; }
    const spots = HEAP[k], zz = z * (k <= 4 ? 0.62 : 0.5);
    // 山の影
    ctx.fillStyle = punk ? 'rgba(0,0,0,0.32)' : 'rgba(20,30,50,0.16)';
    ctx.beginPath(); ctx.ellipse(x + z * 0.03, y + z * 0.25, z * (k <= 4 ? 0.3 : 0.38), z * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy] of spots) token(ctx, P, x + dx * z, y + dy * z - z * 0.04, zz, s, true);
    if ((n || 1) >= 10) stack(x, y, n);
  };
  const stack = (x: number, y: number, n: number | undefined) => {
    if (!n || n < 10 || z < 22) return;
    const tx = `×${n}`, fs = Math.max(9, z * 0.21), wd = fs * (0.6 * tx.length + 0.5), bx = x + z * 0.2, by = y + z * 0.21;
    rr(ctx, bx - wd / 2, by - fs * 0.62, wd, fs * 1.24, fs * 0.35);
    ctx.fillStyle = punk ? '#0b0d10' : P.ink; ctx.fill();
    ctx.fillStyle = punk ? '#ffd166' : P.paper; ctx.font = `700 ${fs}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tx, bx, by + fs * 0.05); ctx.textBaseline = 'alphabetic';
  };
  for (const b of belts) {
    if (!b.e.item) continue;
    const [ox, oy] = onCurve(b.c, b.e.item.p);
    if (veryFar) {
      // ごく引いた視野：物質は、その色の小さな点で示す
      ctx.fillStyle = b.e.item.s === 'e' ? P.hi : sub(b.e.item.s).color;
      ctx.fillRect(sx(b.e.x + 0.5 + ox) - z * 0.2, sy(b.e.y + 0.5 + oy) - z * 0.2, z * 0.4, z * 0.4);
    } else load(sx(b.e.x + 0.5 + ox), sy(b.e.y + 0.5 + oy), b.e.item.s, b.e.item.n);
  }
  for (const e of w.ents.values()) {
    if (e.kind !== 'bridge' || !e.items || !inView(e)) continue;
    e.items.forEach((it, a) => {
      if (!it) return;
      const d = it.d ?? a;
      load(sx(e.x + 0.5 + DX[d] * (it.p - 0.5)), sy(e.y + 0.5 + DY[d] * (it.p - 0.5)), it.s, it.n);
    });
  }

  // 合流の優先：優先する流れが入ってくる縁に、三角の印
  if (!far) for (const b of belts) {
    const q = b.e.pri;
    if (q === undefined) continue;
    const ux = DX[q], uy = DY[q], ex = sx(b.e.x + 0.5 - ux * 0.36), ey = sy(b.e.y + 0.5 - uy * 0.36), a0 = z * 0.2, b0 = z * 0.16;
    ctx.beginPath(); ctx.moveTo(ex + ux * a0, ey + uy * a0); ctx.lineTo(ex - uy * b0, ey + ux * b0); ctx.lineTo(ex + uy * b0, ey - ux * b0); ctx.closePath();
    ctx.fillStyle = P.hi; ctx.fill(); ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = lw(0.03); ctx.stroke();
  }

  // ---- 装置 ----
  for (const e of w.ents.values()) {
    if (e.kind === 'belt' || e.kind === 'bridge' || e.kind === 'tunnel' || e.kind === 'hub' || e.kind === 'part' || !(inView(e) || (e.big && inView({ ...e, x: e.x + 1, y: e.y + 1 })))) continue;
    if (!born.has(e)) born.set(e, t);
    const age = t - born.get(e)!;
    const pop = age < 0.24 ? 0.7 + 0.3 * (1 - Math.pow(1 - age / 0.24, 3)) + 0.1 * Math.sin((age / 0.24) * Math.PI) : 1;
    const sz = sizeOf(e);
    if (three) {
      // 立体表示：2×2 の装置は天面の層へ描く。1 マスの設備は地面に描いたまま、その絵を少し持ち上げる
      use(sz === 2 ? T! : base);
      const c = rgb01(mix(MACHINES[e.kind as keyof typeof MACHINES]?.color ?? '#888888', light ? '#fbf7ea' : '#15181d', light ? 0.35 : 0.5));
      // 箱は、絵の中の装置の本体（マスの 84%）に合わせる
      const ins = sz * 0.08;
      three.boxes.push(e.x + ins, e.y - off + ins, sz - ins * 2, heightOf(e) * Math.max(0.05, Math.min(1.1, (pop - 0.7) / 0.3)), c[0], c[1], c[2], sz === 2 ? 1 : 0);
    }
    if (far) {
      // 引いた視野：機種の色の札と、状態を示す点だけ
      const info = MACHINES[e.kind as keyof typeof MACHINES], px0 = sx(e.x) + z * 0.08, py0 = sy(e.y) + z * 0.08, ps = sz * z - z * 0.16;
      ctx.fillStyle = info.color; ctx.fillRect(px0, py0, ps, ps);
      ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = Math.max(1, z * 0.07); ctx.strokeRect(px0, py0, ps, ps);
      const needs = (isMachine(e.kind) && !e.recipe) || ((e.kind === 'analyzer' && !e.test) || (isSep(e.kind) && !sepReady(e.kind, e.test))) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
      const jam = (e.stuck || 0) > 2.5 || !!e.bad;
      if (needs || jam || e.busy) {
        ctx.fillStyle = needs || jam ? P.red : cvd ? CVD_GO : '#58e06a';
        if (cvd && !(needs || jam)) { ctx.beginPath(); ctx.arc(px0 + ps / 2, py0 + ps / 2, ps * 0.22, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(px0 + ps * 0.3, py0 + ps * 0.3, ps * 0.4, ps * 0.4);
        if (cvd && jam) cross(ctx, px0 + ps / 2, py0 + ps / 2, ps * 0.14, '#ffffff', Math.max(1, ps * 0.07));
      }
      if (G && e.busy) glow(px0 + ps / 2, py0 + ps / 2, z * sz * 1.5, glowOf(e, P), 0.4);
      continue;
    }
    machine(ctx, P, sx(e.x + sz / 2), sy(e.y + sz / 2), z * pop * sz, z, e, t);
    // ---- 粒子まで拡大：うんと近づくと、装置の天面が「粒子の窓」に変わり、いま進んでいる反応の原子の組み替えが見える ----
    if (z >= ZOOM_IN && sz === 2 && e.recipe && isMachine(e.kind)) {
      const r = recipeById(e.recipe);
      if (r) {
        const a = Math.min(1, (z - ZOOM_IN) / 20), cx2 = sx(e.x + 1), cy2 = sy(e.y + 1), ww = z * 1.62, hh = ww * (SW_H / SW_W);
        const img = sceneImage(r, e.busy ? Math.min(0.999, e.prog || 0) : (t * 0.12) % 0.2);
        ctx.save(); ctx.globalAlpha = a;
        rr(ctx, cx2 - ww / 2 - 4, cy2 - hh / 2 - 4, ww + 8, hh + 8, 10); ctx.fillStyle = P.paper; ctx.fill();
        ctx.strokeStyle = arcane ? BRASS : P.ink; ctx.lineWidth = Math.max(2, z * 0.04); ctx.stroke();
        ctx.drawImage(img, cx2 - ww / 2, cy2 - hh / 2, ww, hh);
        ctx.font = `700 ${Math.max(10, z * 0.1)}px ${FONT_UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = P.soft; ctx.fillText(e.busy ? '粒子の世界：いま反応している' : '粒子の世界：原料待ち', cx2 - ww / 2 + 6, cy2 - hh / 2 + 4);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }
    }
    if (G) {
      // 動いている装置は光をこぼす。色は、その反応で生じる気体や液の色（なければスキンの光の色）。熱する反応は橙に光り、上の空気がゆらぐ
      const mcx = sx(e.x + sz / 2), mcy = sy(e.y + sz / 2);
      // 装置の中身（液や沈殿の色）は覚える対象なので、光で色が変わらないように守る（効果の層の緑）
      if (M && sz > 1) { M.fillStyle = 'rgb(0,255,0)'; M.beginPath(); M.arc(mcx, mcy, z * sz * 0.4, 0, Math.PI * 2); M.fill(); }
      if (e.busy) {
        glow(mcx, mcy, z * sz * 1.3, glowOf(e, P), 0.3 + 0.05 * Math.sin(t * 5 + e.x));
        if (reactionLookById(e.recipe)?.heat) { glow(mcx, mcy + z * sz * 0.38, z * sz * 0.75, '255,130,40', 0.38); heat(mcx, mcy - z * sz * 0.55, z * sz * 0.85, 0.85); }
      }
      if (e.kind === 'vent') { glow(mcx, mcy - z * 0.05, z * 0.5, '255,120,50', 0.22); heat(mcx, mcy - z * 0.7, z * 0.6, 0.5); }
      else if (e.kind === 'sensor' && (SIG[e.ch || 1] || 0) > 0) glow(mcx, mcy, z * 0.8, hexRgb(lineColor(e.ch || 1)), 0.7);
      else if (e.kind === 'tank' && (e.cnt || 0) + (e.rcn || 0) > 0 && e.sub) glow(mcx, mcy, z * 0.9, hexRgb(hexOf(e.sub)), 0.22);
    }
    // 習熟メッキ：その反応を、間隔を空けた復習で覚えているほど、縁が銅 → 銀 → 金になる。まちがえると剥がれる
    const plate = isMachine(e.kind) && !e.sealed ? platingOf(w.srs, e.recipe) : 0;
    if (plate) {
      const u2 = z * pop * sz, pcx = sx(e.x + sz / 2), pcy = sy(e.y + sz / 2), col = ['', '#b8733a', '#cfd6dd', '#f4c531'][plate], dark = ['', '#6a3d1a', '#7d868f', '#8a6a10'][plate];
      const rim = () => { if (punk) chamfer(ctx, pcx - u2 * 0.43, pcy - u2 * 0.43, u2 * 0.86, u2 * 0.86, u2 * 0.13); else rr(ctx, pcx - u2 * 0.42, pcy - u2 * 0.42, u2 * 0.84, u2 * 0.84, u2 * 0.12); };
      const lw2 = Math.max(2.5, u2 * 0.05);
      rim(); ctx.strokeStyle = dark; ctx.lineWidth = lw2 + 2; ctx.stroke();
      rim(); ctx.strokeStyle = col; ctx.lineWidth = lw2; ctx.stroke();
      // 縁を走る光（金は速く、銅はゆっくり）
      const per = u2 * 0.84 * 4;
      rim(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw2 * 0.45; ctx.lineCap = 'round';
      ctx.setLineDash([per * 0.07, per * 0.93]); ctx.lineDashOffset = -((t * (0.12 + 0.07 * plate) + e.x * 0.13) % 1) * per; ctx.stroke(); ctx.setLineDash([]);
      if (z >= 30) {
        // 左下に、金・銀・銅の印
        const mx2 = sx(e.x) + z * 0.24, my2 = sy(e.y + sz) - z * 0.24, mr = Math.max(7, z * 0.17);
        ctx.beginPath(); ctx.arc(mx2, my2, mr, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.2, z * 0.035); ctx.stroke();
        ctx.fillStyle = '#1a1408'; ctx.font = `800 ${mr * 1.15}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(PLATING[plate], mx2, my2 + 0.5); ctx.textBaseline = 'alphabetic';
      }
    }
    // 状態灯：動いていれば緑、原料待ちは橙、出口の詰まりは赤の点滅。色だけに頼らないよう、形も変える（丸・三角・四角）。
    // 一時停止している装置は灯さない（上に灰色の ‖ の印が付く）
    if (z >= 26 && isMachine(e.kind) && e.recipe && !e.off) {
      // 2×2 の装置は上辺の真ん中（出口と入口の間で、どの向きでも空いている）。1 マスの装置は左下の角
      const st = machineState(e), lx = sz === 2 ? sx(e.x + 1) : sx(e.x) + z * 0.2, ly = sz === 2 ? sy(e.y) + z * 0.2 : sy(e.y + 1) - z * 0.2, lr = Math.max(3, z * 0.085);
      ctx.beginPath();
      if (st === 0) ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      else if (st === 1) { ctx.moveTo(lx, ly - lr * 1.15); ctx.lineTo(lx + lr * 1.1, ly + lr * 0.85); ctx.lineTo(lx - lr * 1.1, ly + lr * 0.85); ctx.closePath(); }
      else ctx.rect(lx - lr, ly - lr, lr * 2, lr * 2);
      ctx.fillStyle = st === 0 ? (cvd ? CVD_GO : '#3fbf63') : st === 1 ? '#e0962a' : Math.sin(t * 9) > 0 ? P.red : mix(P.red, '#000000', 0.55);
      ctx.fill(); ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = Math.max(1, z * 0.03); ctx.stroke();
      if (cvd && st === 2) cross(ctx, lx, ly, lr * 0.55, '#ffffff', Math.max(1, lr * 0.3));
      if (st === 0 && punk && !light) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(lx, ly, lr * 2.1, 0, Math.PI * 2); ctx.fillStyle = cvd ? CVD_GO : '#3fbf63'; ctx.fill(); ctx.globalAlpha = 1; }
    }
    // 採取機は、採れているあいだ、土ぼこりやしぶきを飛ばす
    if (e.kind === 'extractor' && z >= 20 && (e.u ?? 0) > 0.3 && particles.length < 260 && Math.random() < dt * 2.2) {
      const a = Math.random() * Math.PI * 2, wet = sub(resourceAt(e.x, e.y)).state !== 'solid';
      particles.push({ x: e.x + 0.5 + Math.cos(a) * 0.2, y: e.y + 0.5 + Math.sin(a) * 0.2, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5 - 0.25, age: 0, life: 0.45 + Math.random() * 0.25, color: wet ? '#5aa9d6' : P.soft, r: 0.035 + Math.random() * 0.03 });
    }
    // 稼働中の装置は、蒸気や火花を出す
    if (e.busy && z >= 20 && particles.length < 260 && Math.random() < dt * (e.kind === 'electrolyzer' || e.kind === 'battery' ? 5 : 3)) {
      const r1 = Math.random(), r2 = Math.random();
      if (e.kind === 'electrolyzer' || e.kind === 'battery') particles.push({ x: e.x + sz / 2 + (r1 - 0.5) * 0.9, y: e.y + sz / 2 + (r2 - 0.5) * 0.5, vx: (r2 - 0.5) * 1.6, vy: -0.6 - r1 * 0.9, age: 0, life: 0.28 + r1 * 0.2, color: 'spark', r: 0.05 });
      else particles.push({ x: e.x + sz * 0.3 + r1 * sz * 0.4, y: e.y + 0.25, vx: 0.1 + r2 * 0.14, vy: -0.42 - r1 * 0.25, age: 0, life: 1.3 + r2 * 0.7, color: 'smoke', r: 0.1 + r1 * 0.07, tint: smokeTint(e.recipe) });
    }
  }

  use(base);
  // ---- 詰まりの見える化：稼働率の札を出しているとき、荷が待っているマスを、待った時間で黄 → 赤に塗る ----
  if (view.stats && !veryFar) {
    for (const e of w.ents.values()) {
      if (!MOVERS.has(e.kind) || !inView(e)) continue;
      const its = e.kind === 'bridge' ? e.items ?? [] : [e.item];
      let wt = 0;
      for (const it of its) if (it && (it.w || 0) > wt) wt = it.w || 0;
      if (wt < 0.3) continue;
      const k = Math.min(1, wt / JAM_SEC), col = k >= 1 ? '214,48,49' : '235,165,35';
      rr(ctx, sx(e.x) + z * 0.06, sy(e.y) + z * 0.06, z * 0.88, z * 0.88, z * 0.14);
      ctx.fillStyle = `rgba(${col},${0.16 + 0.22 * k})`; ctx.fill();
      // 色覚の補助：待ち始めは点線の枠、詰まりきったら斜線の網
      if (cvd && k < 1) ctx.setLineDash([z * 0.12, z * 0.09]);
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = Math.max(1.5, z * 0.05); ctx.stroke(); ctx.setLineDash([]);
      if (cvd && k >= 1) hatch(ctx, sx(e.x) + z * 0.06, sy(e.y) + z * 0.06, z * 0.88, `rgba(${col},0.9)`, Math.max(1, z * 0.045));
    }
  }
  // ---- 流れをたどる：選んだベルトなどから、下流（水色）と上流（紫）を光らせ、流れが止まっている先頭に理由を出す ----
  const selT = view.selected && MOVERS.has(view.selected.kind) ? view.selected : null;
  if (selT) {
    if (!flowCache || flowCache.e !== selT || flowCache.w !== w || Math.abs(w.tick - flowCache.tick) > 20) flowCache = { e: selT, w, tick: w.tick, f: flowTrace(w, selT) };
    const f = flowCache.f, vis = (x: number, y: number) => x >= x0 - 2 && x <= x1 + 2 && y - off >= y0 - 2 && y - off <= y1 + 2;
    const tiles = (list: [number, number][], rgb: string) => {
      ctx.fillStyle = `rgba(${rgb},0.3)`; ctx.strokeStyle = `rgba(${rgb},0.9)`; ctx.lineWidth = Math.max(1, z * 0.035);
      for (const [x, y] of list) { if (!vis(x, y)) continue; rr(ctx, sx(x) + z * 0.14, sy(y) + z * 0.14, z * 0.72, z * 0.72, z * 0.2); ctx.fill(); ctx.stroke(); }
    };
    const ends = (list: [number, number][], rgb: string) => {
      ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineWidth = Math.max(2, z * 0.07); ctx.setLineDash([z * 0.18, z * 0.12]);
      for (const [x, y] of list) { const n = at(w, x, y); if (!n || !vis(x, y)) continue; const sz2 = sizeOf(n); rr(ctx, sx(n.x) + z * 0.04, sy(n.y) + z * 0.04, z * (sz2 - 0.08), z * (sz2 - 0.08), z * 0.16); ctx.stroke(); }
      ctx.setLineDash([]);
    };
    tiles(f.up, '150,90,230'); tiles(f.down, '30,165,220');
    ends(f.sources, '150,90,230'); ends(f.sinks, '30,165,220');
    if (f.head && vis(f.head.x, f.head.y)) {
      const hx = sx(f.head.x + 0.5), hy = sy(f.head.y + 0.5), pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.strokeStyle = P.red; ctx.lineWidth = Math.max(2.5, z * 0.08);
      ctx.beginPath(); ctx.arc(hx, hy, z * (0.62 + 0.08 * pulse), 0, Math.PI * 2); ctx.stroke();
      const tx = `止まっている：${label(f.head.s)}　${f.head.why}`, fs = Math.max(11, Math.min(14, z * 0.3));
      ctx.font = `700 ${fs}px ${FONT_UI}`;
      const tw = ctx.measureText(tx).width + fs * 1.2, ty = hy + z * 0.95 + fs * 0.9, bx = Math.max(6, Math.min(cw - tw - 6, hx - tw / 2));
      rr(ctx, bx, ty - fs * 0.8, tw, fs * 1.6, 5); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.red; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = P.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tx, bx + fs * 0.6, ty + 0.5); ctx.textBaseline = 'alphabetic';
    }
  }
  // 闇の炉：稼働中の装置と納品所は、暗がりに光をこぼす
  if ((punk || arcane || lab) && !light && !G) {
    ctx.globalCompositeOperation = 'lighter';
    const pool = (gx: number, gy: number, r: number, a: number) => {
      const g = ctx.createRadialGradient(sx(gx), sy(gy), 0, sx(gx), sy(gy), r * z);
      g.addColorStop(0, `rgba(${P.glow},${a})`);
      g.addColorStop(1, `rgba(${P.glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(sx(gx) - r * z, sy(gy) - r * z, 2 * r * z, 2 * r * z);
    };
    const hr0 = hubRect(w.hubSize);
    pool(hr0.x + hr0.s / 2, hr0.y + hr0.s / 2, hr0.s * 1.6 + 1, 0.2 + 0.04 * Math.sin(t * 2.3));
    for (const e of w.ents.values()) if (e.busy && inView(e)) pool(e.x + sizeOf(e) / 2, e.y + sizeOf(e) / 2, 1 + sizeOf(e) * 0.5, 0.22 + 0.06 * Math.sin(t * 9 + e.x));
    ctx.globalCompositeOperation = 'source-over';
  }
  // 1 階から見たとき、2 階の設備がある場所に薄い印をつける
  if (!off && w.research.includes('floor2')) {
    ctx.setLineDash([z * 0.14, z * 0.1]);
    ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(1, z * 0.04);
    ctx.fillStyle = punk || lab ? `rgba(${P.glow},0.1)` : 'rgba(255,225,77,0.16)';
    for (const e of w.ents.values()) {
      if (e.y < FLOOR_DY / 2 || e.kind === 'part') continue;
      const ey = e.y - FLOOR_DY;
      if (e.x < x0 - 2 || e.x > x1 + 2 || ey < y0 - 2 || ey > y1 + 2) continue;
      const sz = sizeOf(e) * z, pad = z * 0.12;
      if (three && e.kind !== 'belt') { const c = rgb01(MACHINES[e.kind as keyof typeof MACHINES]?.color ?? '#999999'), s2 = sizeOf(e); three.slabs.push(e.x + 0.1, ey + 0.1, s2 - 0.2, 0.16, c[0], c[1], c[2], 2); }
      ctx.fillRect(sx(e.x) + pad, gy(ey) + pad, sz - pad * 2, sz - pad * 2);
      ctx.strokeRect(sx(e.x) + pad, gy(ey) + pad, sz - pad * 2, sz - pad * 2);
    }
    ctx.setLineDash([]);
  }
  const hr = hubRect(w.hubSize);
  if (!off && arcane && z >= 10) {
    // 魔術：納品所の下で、魔法陣がゆっくり回る
    const hcx = sx(hr.x + hr.s / 2), hcy = sy(hr.y + hr.s / 2), R = (hr.s / 2 + 0.75) * z;
    ctx.save(); ctx.translate(hcx, hcy);
    ctx.strokeStyle = light ? 'rgba(110,78,36,0.45)' : `rgba(${P.glow},0.45)`; ctx.lineWidth = Math.max(1, z * 0.03);
    for (const [rad, dir] of [[R, 1], [R * 0.86, -1]] as [number, number][]) {
      ctx.save(); ctx.rotate(t * 0.12 * dir);
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, k = i % 3 ? 0.96 : 0.92; ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); ctx.lineTo(Math.cos(a) * rad * k, Math.sin(a) * rad * k); }
      ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.rotate(-t * 0.05);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = (i * 2 * Math.PI * 2) / 6 + Math.PI / 2; ctx.lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); }
    ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
    ctx.restore();
    if (G) { G.strokeStyle = `rgba(${P.glow},${light ? 0.25 : 0.4})`; G.lineWidth = z * 0.14; G.beginPath(); G.arc(hcx, hcy, R, 0, Math.PI * 2); G.stroke(); }
  }
  if (!off) {
    if (three) { use(T!); const c = rgb01(light ? '#8a8d93' : '#2a2023'); three.boxes.push(hr.x + 0.04, hr.y + 0.04, hr.s - 0.08, TOP_H, c[0], c[1], c[2], 1); }
    hub(ctx, P, sx(hr.x), sy(hr.y), z, hr.s, w, t);
    hubMeter(ctx, P, w, sx(hr.x + hr.s / 2), sy(hr.y), z);
    use(base);
  }
  // 納品所の口は、赤く脈打つ光。熱で上の空気がゆらぐ（研究所は、炉心の青緑の光の輪と、回る光の弧）
  if (G && !off && lab) labHubGlow(G, P, sx(hr.x + hr.s / 2), sy(hr.y + hr.s / 2), hr.s, z, t);
  if (G && !off && !lab) { const hx2 = sx(hr.x + hr.s / 2), hy2 = sy(hr.y + hr.s / 2); glow(hx2, hy2, hr.s * z * 0.95, '255,70,40', 0.4 + 0.1 * Math.sin(t * 2.3)); heat(hx2, hy2 - hr.s * z * 0.5, hr.s * z * 0.6, 0.5); }
  // 高画質の飾り：納品所のまわりを、光の弧が 2 重に回る（光の層だけに描くので、標準の画質は変わらない）
  if (G && !off && z >= 10 && !lab) {
    const hx2 = sx(hr.x + hr.s / 2), hy2 = sy(hr.y + hr.s / 2), R1 = (hr.s / 2 + 0.45) * z, R2 = (hr.s / 2 + 0.7) * z;
    G.lineCap = 'round'; G.lineWidth = Math.max(1.5, z * 0.08);
    for (let k = 0; k < 3; k++) { const a = t * 0.7 + k * 2.094; G.strokeStyle = `rgba(${P.glow},${light ? 0.3 : 0.55})`; G.beginPath(); G.arc(hx2, hy2, R1, a, a + 0.85); G.stroke(); }
    G.lineWidth = Math.max(1, z * 0.05);
    for (let k = 0; k < 4; k++) { const a = -t * 0.45 + k * 1.571; G.strokeStyle = `rgba(255,110,70,${light ? 0.2 : 0.38})`; G.beginPath(); G.arc(hx2, hy2, R2, a, a + 0.45); G.stroke(); }
  }
  // 納品所のまわりの灯り：章を 1 つ終えるごとに 1 つともる
  if (!off && z >= 12) {
    const done = chaptersDone(w.progress), n = done.length, hcx = sx(hr.x + hr.s / 2), hcy = sy(hr.y + hr.s / 2), ring = (hr.s / 2 + 1.05) * z, lr = Math.max(2.2, z * 0.09);
    if (done.some(Boolean)) for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2, px = hcx + Math.cos(a) * ring, py = hcy + Math.sin(a) * ring;
      if (done[i]) {
        const k = 0.75 + 0.25 * Math.sin(t * 2.2 + i);
        ctx.fillStyle = `rgba(255,214,107,${0.28 * k})`; ctx.beginPath(); ctx.arc(px, py, lr * 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(px, py, lr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = Math.max(1, z * 0.025); ctx.stroke();
        glow(px, py, lr * 6, '255,214,107', 0.7 * k);
      } else { ctx.strokeStyle = punk ? 'rgba(255,255,255,0.25)' : P.soft; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, lr * 0.7, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    }
  }

  // ---- 夕暮れ（実際の時刻）：平らな表示で後処理がないときは、ここで地図を暮れさせ、動いている装置と納品所に灯りをともす。
  //      後処理（WebGL）があるときは、光のない所を沈める処理を後処理に任せ、ここでは灯りだけを足す ----
  const dusk = view.dusk ?? 0;
  if (dusk > 0.01 && !off) {
    if (!G && !three) {
      ctx.fillStyle = `rgba(14,20,44,${0.36 * dusk})`; ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter';
      const pool = (x: number, y: number, r: number, rgb: string, a: number) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
      for (const e of w.ents.values()) if (e.busy && inView(e)) pool(sx(e.x + sizeOf(e) / 2), sy(e.y + sizeOf(e) / 2), z * (0.8 + sizeOf(e) * 0.6), '255,214,140', 0.32 * dusk);
      pool(sx(hr.x + hr.s / 2), sy(hr.y + hr.s / 2), z * hr.s * 1.2, '255,150,90', 0.3 * dusk);
      ctx.globalCompositeOperation = 'source-over';
    } else if (G) {
      for (const e of w.ents.values()) if (e.busy && inView(e)) glow(sx(e.x + sizeOf(e) / 2), sy(e.y + sizeOf(e) / 2), z * (0.8 + sizeOf(e) * 0.6), '255,214,140', 0.35 * dusk);
    }
  }
  // 線路・列車・札は装置の上を通るので、立体表示では天面の層に描く
  if (T) use(T);
  // ---- 貨物線：設備の上を越える高架の線路と列車。
  //      敷いた線路は、どの駅の列車も共有する網。つながっていない駅どうしは、自動の仮線路（横に進んでから縦に曲がる）で結ぶ ----
  if (!off) {
    const ink = punk ? '#0b0d10' : lab && !light ? '#03070c' : P.ink, lift2 = z * 0.3;
    if (w.rails.size) {
      const geo = railGeo(w);
      const seg: number[] = [], junc: number[] = [];
      for (let k = 0; k < geo.length; k += 3) {
        const x = geo[k], y = geo[k + 1], m = geo[k + 2];
        if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) continue;
        if (m & 1) seg.push(x + 0.5, y + 0.5, x + 1.5, y + 0.5);
        if (m & 2) seg.push(x + 0.5, y + 0.5, x + 0.5, y + 1.5);
        if ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) >= 3) junc.push(x + 0.5, y + 0.5);
      }
      const path = (ox: number, oy: number) => { ctx.beginPath(); for (let k = 0; k < seg.length; k += 4) { ctx.moveTo(sx(seg[k]) + ox, sy(seg[k + 1]) + oy); ctx.lineTo(sx(seg[k + 2]) + ox, sy(seg[k + 3]) + oy); } };
      ctx.lineJoin = 'round';
      if (!far) { ctx.lineCap = 'round'; ctx.strokeStyle = punk ? 'rgba(0,0,0,0.35)' : P.shadow; ctx.lineWidth = z * 0.22; path(lift2 * 0.5, lift2); ctx.stroke(); }
      // 枕木 → 桁 → 2 本のレール
      ctx.lineCap = 'butt';
      if (!veryFar) { ctx.strokeStyle = ink; ctx.lineWidth = z * 0.32; ctx.setLineDash([z * 0.07, z * 0.18]); path(0, 0); ctx.stroke(); ctx.setLineDash([]); }
      ctx.lineCap = 'round';
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, z * 0.2); path(0, 0); ctx.stroke();
      ctx.strokeStyle = punk ? (light ? '#c9ced3' : '#8a939c') : lab ? (light ? '#dfe7ec' : '#6c8194') : light ? '#e9e6da' : '#aeb6c2'; ctx.lineWidth = Math.max(1, z * 0.1); path(0, 0); ctx.stroke();
      if (!far) { ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, z * 0.03); path(0, 0); ctx.stroke(); }
      // 分岐点：転てつ器の印
      for (let k = 0; k < junc.length; k += 2) {
        ctx.beginPath(); ctx.arc(sx(junc[k]), sy(junc[k + 1]), z * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = P.hi; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = lw(0.05); ctx.stroke();
      }
    }
    for (const e of w.ents.values()) {
      if (e.kind !== 'station' || e.role !== 'in') continue;
      const routes = stationRoutes(w, e);
      if (!routes.length) continue;
      const col = lineColor(e.ch || 1);
      const screen = routes.map((r) => ({ r, xs: r.pts.map((q) => sx(q[0])), ys: r.pts.map((q) => sy(q[1])) }));
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      for (const { r, xs, ys } of screen) {
        if (Math.max(...xs) < -50 || Math.min(...xs) > cw + 50 || Math.max(...ys) < -50 || Math.min(...ys) > ch + 50) continue;
        const path = (ox: number, oy: number) => { ctx.beginPath(); xs.forEach((x, k) => (k ? ctx.lineTo(x + ox, ys[k] + oy) : ctx.moveTo(x + ox, ys[k] + oy))); };
        if (r.custom) {
          // 敷いた線路の上に、この駅の番線の色を細く重ねる（どの駅がどこを通るかがわかる）
          ctx.globalAlpha = 0.75; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, z * 0.045); path(0, 0); ctx.stroke(); ctx.globalAlpha = 1;
          continue;
        }
        // 自動の仮線路：地面の影 → 枕木 → 桁 → 路線色
        ctx.strokeStyle = punk ? 'rgba(0,0,0,0.35)' : P.shadow; ctx.lineWidth = z * 0.2; path(lift2 * 0.5, lift2); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = z * 0.26; ctx.setLineDash([z * 0.07, z * 0.2]); path(0, 0); ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = z * 0.13; path(0, 0); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = z * 0.07; path(0, 0); ctx.stroke();
      }
      // 列車：それぞれの行き先の道のりに沿って進む
      if (z >= 10) for (const tr of [e.tr, ...(e.xtr ?? [])]) {
        if (!tr) continue;
        const sc = screen.find((q) => `${q.r.dest.x},${q.r.dest.y}` === tr.to) ?? screen[0];
        const { xs, ys } = sc, pts = sc.r.pts;
        const segs = pts.slice(1).map((q, k) => Math.abs(q[0] - pts[k][0]) + Math.abs(q[1] - pts[k][1]));
        let d = Math.max(0, Math.min(1, tr.p)) * segs.reduce((x, y) => x + y, 0), a = 0;
        while (a < segs.length - 1 && d > segs[a]) { d -= segs[a]; a++; }
        const f = segs[a] ? Math.min(1, d / segs[a]) : 0;
        const tx = xs[a] + (xs[a + 1] - xs[a]) * f, ty = ys[a] + (ys[a + 1] - ys[a]) * f;
        if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) continue;
        const ang = Math.atan2(ys[a + 1] - ys[a], xs[a + 1] - xs[a]) + (tr.back ? Math.PI : 0);
        ctx.save();
        ctx.translate(tx, ty); ctx.rotate(ang);
        const L = z * 0.95, Wd = z * 0.46;
        ctx.fillStyle = punk ? 'rgba(0,0,0,0.4)' : P.shadow; rr(ctx, -L / 2 + z * 0.06, -Wd / 2 + z * 0.14, L, Wd, z * 0.08); ctx.fill();
        rr(ctx, -L / 2, -Wd / 2, L, Wd, z * 0.08); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = lw(0.05); ctx.stroke();
        rr(ctx, -L / 2 + z * 0.08, -Wd / 2 + z * 0.07, L * 0.62, Wd - z * 0.14, z * 0.04); ctx.fillStyle = tr.cargo.length ? '#f3f1e8' : 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.stroke();
        // 先頭の灯り：前の列車を待って止まっているときは赤
        ctx.fillStyle = tr.held ? P.red : punk ? '#14181d' : P.ink; ctx.fillRect(L / 2 - z * 0.2, -Wd / 2 + z * 0.06, z * 0.14, Wd - z * 0.12);
        ctx.restore();
        // 前照灯
        glow(tx + Math.cos(ang) * z * 0.7, ty + Math.sin(ang) * z * 0.7, z * 1.1, tr.held ? '255,60,50' : '255,236,180', 0.6);
        // 走っている列車は、後ろへ煙を残す
        if (z >= 16 && !tr.held && tr.p > 0.01 && tr.p < 0.99 && particles.length < 260 && Math.random() < dt * 5) {
          particles.push({ x: cam.x + (tx - cw / 2) / z - Math.cos(ang) * 0.4, y: cam.y + (ty - ch / 2) / z - Math.sin(ang) * 0.4, vx: -Math.cos(ang) * 0.3, vy: -0.35 - Math.random() * 0.2, age: 0, life: 0.8 + Math.random() * 0.5, color: 'smoke', r: 0.08 + Math.random() * 0.05 });
        }
        if (tr.cargo.length && z >= 22) { const s0 = tr.cargo[0]; ctx.drawImage(sprite(s0.startsWith('!') ? s0.slice(1) : s0), tx - z * 0.17 - Math.cos(ang) * z * 0.1, ty - z * 0.17 - Math.sin(ang) * z * 0.1, z * 0.34, z * 0.34); }
      }
    }
  }

  // ---- 稼働率の色分けと、ベルトの毎分の数（統計の重ね表示のあいだ）。立体表示では、地面に描くもの（1 マスの装置・ベルト）と天面に描くものを分ける ----
  mapStats(base, ctx, P, w, !!view.stats, sx, sy, z, inView);
  // ---- 稼働率の札：装置の上に、直近の稼働率と止まっている理由を出す ----
  if (view.stats && z >= 13) {
    const GOOD = '#2f8f55', WARN = '#c9821a';
    ctx.textAlign = 'center';
    for (const e of w.ents.values()) {
      const cfg = isMachine(e.kind) && !!e.recipe;
      if (!(cfg || e.kind === 'extractor') || !inView(e)) continue;
      const u = e.u ?? 0, sz = sizeOf(e), st = e.off ? 3 : cfg ? machineState(e) : u >= 0.5 ? 0 : 2;
      // 色だけに頼らない：稼働は ●、原料待ちは ▲、詰まりは ✕、一時停止は ‖（灰色）
      const color = st === 3 ? P.soft : u >= 0.7 ? GOOD : u >= 0.35 ? WARN : P.red, mark = st === 0 ? '●' : st === 1 ? '▲' : st === 3 ? '‖' : '✕';
      const fs = Math.max(10, Math.min(15, z * 0.3)), tx = `${mark} ${Math.round(u * 100)}%`;
      ctx.font = `700 ${fs}px ${FONT_MONO}`;
      const wd = ctx.measureText(tx).width + fs * 0.9, hh = fs * 1.5;
      const bx = sx(e.x + sz / 2) - wd / 2, by = sy(e.y) - hh - z * 0.06;
      ctx.fillStyle = punk ? '#0b0d10' : P.plate;
      rr(ctx, bx, by, wd, hh, punk ? 0 : 4); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      // 稼働率の横棒
      ctx.fillStyle = color;
      ctx.fillRect(bx + 2, by + hh - 4, (wd - 4) * u, 2.5);
      ctx.fillStyle = punk ? '#eef0ea' : P.ink;
      ctx.fillText(tx, bx + wd / 2, by + hh / 2 - 1);
    }
  }

  // ---- 引いた視点：区画ごとに、何を毎分いくつ作っているかの札 ----
  if (z < 22) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const fs = 12.5;
    for (const d of districts(w)) {
      if (d.x1 < x0 || d.x0 > x1 || d.y1 - off < y0 || d.y0 - off > y1) continue;
      const bx = sx(d.x0 - 0.5), by = sy(d.y0 - 0.5), bw = (d.x1 - d.x0 + 1) * z, bh = (d.y1 - d.y0 + 1) * z;
      ctx.strokeStyle = P.hi; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      rr(ctx, bx, by, bw, bh, punk ? 0 : 8); ctx.stroke();
      ctx.setLineDash([]);
      // 区画の名前：いちばん多くの装置が作っている物質の名前で呼ぶ（「アンモニア工場」）
      const title = `${d.s === 'e' ? '電池' : sub(d.s).name.replace(/（.*）| .*$/g, '')}工場`, rate = d.perMin >= 10 ? String(Math.round(d.perMin)) : d.perMin.toFixed(1);
      if (z < 10 && bw >= 90 && bh >= 40) {
        // うんと引いた視点：区画の中に、大きく名前を書く
        const big = Math.max(13, Math.min(30, bw * 0.14, bh * 0.36));
        // 区画が画面からはみ出していても、見えている部分の真ん中に書く
        const mx = (Math.max(bx, 0) + Math.min(bx + bw, cw)) / 2, my = (Math.max(by, 0) + Math.min(by + bh, ch)) / 2;
        ctx.textAlign = 'center';
        ctx.font = `800 ${big}px ${FONT_UI}`; ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, big * 0.22); ctx.strokeStyle = punk ? '#0b0d10' : P.paper; ctx.strokeText(title, mx, my - big * 0.3);
        ctx.fillStyle = punk ? '#eef0ea' : P.ink; ctx.fillText(title, mx, my - big * 0.3);
        ctx.font = `700 ${big * 0.5}px ${FONT_UI}`;
        const sub2 = `毎分 ${rate}・${d.n} 台`;
        ctx.lineWidth = Math.max(2.5, big * 0.12); ctx.strokeText(sub2, mx, my + big * 0.42); ctx.fillStyle = d.perMin > 0 ? (punk ? '#eef0ea' : P.ink) : P.red; ctx.fillText(sub2, mx, my + big * 0.42);
        ctx.textAlign = 'left';
        continue;
      }
      const name = label(d.s), tx = `${title}${name !== title.slice(0, -2) ? ` ${name}` : ''}　${rate}/分　${d.n}台`;
      ctx.font = `700 ${fs}px ${FONT_UI}`;
      const tw = ctx.measureText(tx).width, pw = tw + 34, ph = 22, px = Math.max(4, Math.min(cw - pw - 4, bx + bw / 2 - pw / 2)), py = by - ph - 3;
      ctx.fillStyle = punk ? '#0b0d10' : P.plate;
      rr(ctx, px, py, pw, ph, punk ? 0 : 5); ctx.fill();
      ctx.strokeStyle = d.perMin > 0 ? P.hi : P.red; ctx.lineWidth = 2; ctx.stroke();
      token(ctx, P, px + 12, py + ph / 2, 17, d.s, true);
      ctx.fillStyle = punk ? '#eef0ea' : P.ink;
      ctx.fillText(tx, px + 25, py + ph / 2 + 0.5);
    }
    ctx.textBaseline = 'alphabetic';
  }

  use(base);
  // ---- 敷いている途中の線路 ----
  if (view.rail && view.rail.length) {
    ctx.strokeStyle = P.hi; ctx.lineWidth = z * 0.16; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([z * 0.25, z * 0.2]);
    ctx.beginPath(); view.rail.forEach((q, k) => (k ? ctx.lineTo(sx(q[0]), sy(q[1])) : ctx.moveTo(sx(q[0]), sy(q[1])))); ctx.stroke();
    ctx.setLineDash([]);
    const q = view.rail[view.rail.length - 1];
    ctx.fillStyle = P.hi; ctx.beginPath(); ctx.arc(sx(q[0]), sy(q[1]), z * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  /** 出口（外向き・蛍光）と入口（内向き・白）の矢印 */
  const portArrow = (q: { x: number; y: number; d: number; out: boolean }) => {
    const ux = DX[q.d], uy = DY[q.d], ex = sx(q.x + 0.5 + ux * (q.out ? 0.5 : -0.5)), ey = sy(q.y + 0.5 + uy * (q.out ? 0.5 : -0.5));
    const a0 = z * 0.3, b0 = z * 0.2, bx = ex + ux * (q.out ? 0.04 : -0.34) * z, by = ey + uy * (q.out ? 0.04 : -0.34) * z;
    ctx.beginPath();
    ctx.moveTo(bx + ux * a0, by + uy * a0);
    ctx.lineTo(bx - uy * b0, by + ux * b0);
    ctx.lineTo(bx + uy * b0, by - ux * b0);
    ctx.closePath();
    ctx.fillStyle = q.out ? P.hi : punk ? '#f0e9dc' : P.paper; ctx.fill();
    ctx.strokeStyle = punk ? '#0b0d10' : P.ink; ctx.lineWidth = lw(0.035); ctx.stroke();
  };
  // ---- 設計図の見本：置ける所は蛍光、ふさがっている所は赤 ----
  if (view.ghost) {
    ctx.textAlign = 'center';
    for (const g of view.ghost) {
      const gx = sx(g.x), gy = sy(g.y), gs = g.size * z;
      // ずらしている最中は、持ち上げたように影を落とす
      if (view.lift) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(gx + 2 + z * 0.12, gy + 2 + z * 0.18, gs - 4, gs - 4); }
      ctx.fillStyle = g.ok ? (punk || lab ? `rgba(${P.glow},0.3)` : 'rgba(255,225,77,0.45)') : 'rgba(210,63,58,0.4)';
      ctx.fillRect(gx + 2, gy + 2, gs - 4, gs - 4);
      ctx.strokeStyle = g.ok ? P.hi : P.red; ctx.lineWidth = lw(0.05); ctx.strokeRect(gx + 2, gy + 2, gs - 4, gs - 4);
      if (cvd && !g.ok) cross(ctx, gx + gs / 2, gy + gs / 2, gs * 0.32, P.red, lw(0.08));
      if (z >= 18) { ctx.fillStyle = punk ? '#f0e9dc' : P.ink; ctx.font = `700 ${Math.min(gs * 0.45, z * 0.5)}px ${FONT_SMALL}`; ctx.textBaseline = 'middle'; ctx.fillText(g.glyph, gx + gs / 2, gy + gs / 2 + 1); ctx.textBaseline = 'alphabetic'; }
      // 出口は外向き、入口は内向きの矢印。置く前に、どこから何が出入りするかがわかる
      for (const q of g.ports ?? []) portArrow(q);
    }
  }
  // ---- 選んだ設備の出口と入口 ----
  if (view.ports && z >= 14) for (const q of view.ports) portArrow(q);
  // ---- 選んだ装置と同じ反応の装置：点線の輪で印をつける ----
  if (view.marks?.length && z >= 10) {
    ctx.strokeStyle = P.hi; ctx.lineWidth = lw(0.06); ctx.setLineDash([z * 0.18, z * 0.12]);
    for (const e of view.marks) {
      if (floorOf(e.y) !== (view.floor || 0)) continue;
      const sz = sizeOf(e), cx0 = sx(e.x + sz / 2), cy0 = sy(e.y + sz / 2);
      if (cx0 < -z * 2 || cy0 < -z * 2 || cx0 > cw + z * 2 || cy0 > ch + z * 2) continue;
      ctx.beginPath(); ctx.arc(cx0, cy0, z * (sz === 2 ? 1.25 : 0.6), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ---- 範囲選択 ----
  if (view.area) {
    const [ax0, ay0, ax1, ay1] = view.area;
    ctx.fillStyle = punk || lab ? `rgba(${P.glow},0.12)` : 'rgba(255,225,77,0.2)';
    ctx.fillRect(sx(ax0), sy(ay0), (ax1 - ax0 + 1) * z, (ay1 - ay0 + 1) * z);
    ctx.strokeStyle = P.hi; ctx.lineWidth = lw(0.08);
    ctx.setLineDash([z * 0.3, z * 0.2]); ctx.lineDashOffset = -t * z * 0.6;
    ctx.strokeRect(sx(ax0), sy(ay0), (ax1 - ax0 + 1) * z, (ay1 - ay0 + 1) * z);
    ctx.setLineDash([]);
  }
  // ---- 組み立ての道具が重ねて描くもの（名前・旗・一時停止・つながりの印・道の見本） ----
  view.over?.(base, T ?? base, sx, sy, z, t, view);

  // （立体表示では、札は天面の層に描く。地面に描くと、手前の設備の箱に隠れたり、持ち上がったりする）
  if (T) use(T);
  // ---- 反応式の札：選んだ装置の下に、その装置の反応式と条件を出す。うんと近づけば、見えている装置すべてに出す ----
  {
    const plate = (e: Ent, more = false) => {
      const r = recipeById(e.recipe);
      if (!r || e.sealed) return;
      const sz = sizeOf(e), eq = equationOf(r), cond = r.accept[0] && r.accept[0] !== 'なし' ? r.accept[0] : '';
      // 選んだ装置には、もう 1 行：状態つきの式と ΔH（熱化学の表にある反応）、捕集装置なら集め方のわけ。文と出典は captions.ts
      const note = more ? (dHCaption(r.id) ?? collectCaption(r.id))?.text ?? '' : '';
      const fs = Math.max(11, Math.min(15, z * 0.3));
      ctx.font = `700 ${fs}px ${FONT_MONO}`;
      let w1 = ctx.measureText(eq).width;
      const max = Math.min(cw - 16, 420), k = w1 > max ? max / w1 : 1;
      if (k < 1) { ctx.font = `700 ${fs * k}px ${FONT_MONO}`; w1 = max; }
      ctx.font = `600 ${fs * 0.8}px ${FONT_UI}`;
      const w2 = cond ? Math.min(max, ctx.measureText(cond).width) : 0;
      ctx.font = `500 ${fs * 0.74}px ${FONT_UI}`;
      const w3 = note ? Math.min(max, ctx.measureText(note).width) : 0;
      const wd = Math.max(w1, w2, w3) + 18, hh = fs * (cond ? 2.7 : 1.7) + (note ? fs * 1.05 : 0);
      const px = Math.max(4, Math.min(cw - wd - 4, sx(e.x + sz / 2) - wd / 2)), py = sy(e.y + sz) + z * 0.16;
      ctx.fillStyle = punk ? '#0b0d10' : P.plate;
      rr(ctx, px, py, wd, hh, punk ? 0 : 5); ctx.fill();
      ctx.strokeStyle = punk ? P.hi : P.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = punk ? '#eef0ea' : P.ink;
      ctx.font = `700 ${fs * k}px ${FONT_MONO}`;
      ctx.fillText(eq, px + wd / 2, py + fs * 0.9);
      if (cond) { ctx.font = `600 ${fs * 0.8}px ${FONT_UI}`; ctx.fillStyle = punk ? P.hi : P.red; ctx.fillText(cond, px + wd / 2, py + fs * 2.0, max); }
      if (note) { ctx.font = `500 ${fs * 0.74}px ${FONT_UI}`; ctx.fillStyle = punk ? '#c9ccc4' : P.soft; ctx.fillText(note, px + wd / 2, py + fs * (cond ? 3.05 : 2.0), max); }
      ctx.textBaseline = 'alphabetic';
    };
    if (z >= (view.allPlates ? 34 : 70)) { for (const e of w.ents.values()) if (e.recipe && e !== view.selected && inView(e) && floorOf(e.y) === (view.floor || 0)) plate(e); }
    if (view.selected?.recipe && inView(view.selected)) plate(view.selected, true);
  }

  // ---- 選んだものは蛍光ペンで囲む ----
  if (view.selected && view.selected.kind !== 'hub') {
    const e = view.selected;
    use(T && sizeOf(e) === 2 ? T : base);
    if (lab) labSelect(ctx, P, sx(e.x + sizeOf(e) / 2), sy(e.y + sizeOf(e) / 2), sizeOf(e), z, t);
    else if (punk) {
      // 照準の角
      const cx0 = sx(e.x + sizeOf(e) / 2), cy0 = sy(e.y + sizeOf(e) / 2), r = z * (sizeOf(e) * 0.5 + 0.1 + 0.03 * Math.sin(t * 6)), L = z * 0.2;
      ctx.strokeStyle = P.hi; ctx.lineWidth = lw(0.08); ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(cx0 + ax * r, cy0 + ay * (r - L)); ctx.lineTo(cx0 + ax * r, cy0 + ay * r); ctx.lineTo(cx0 + ax * (r - L), cy0 + ay * r);
      }
      ctx.stroke();
    } else {
    ctx.strokeStyle = P.hi;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = lw(0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(sx(e.x + sizeOf(e) / 2), sy(e.y + sizeOf(e) / 2), z * (sizeOf(e) === 2 ? 1.3 : 0.62), -0.4 + Math.sin(t * 2) * 0.1, Math.PI * 2 - 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    }
  }

  // ---- 粒子 ----
  if (T) use(T);
  ctx.textAlign = 'center';
  if (view.still) particles.length = Math.min(particles.length, keep);
  for (let i = view.still ? -1 : particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = k;
    if (p.color === 'ring' || p.color === 'gone') {
      // 置いた所に広がる輪／撤去した設備の形が、縮みながら薄れる
      const grow = p.color === 'ring' ? 1 + (1 - k) * 0.35 : 0.6 + k * 0.4, half = p.r * grow * z;
      ctx.globalAlpha = k * (p.color === 'ring' ? 0.9 : 0.6);
      ctx.strokeStyle = p.color === 'ring' ? P.hi : P.soft; ctx.lineWidth = lw(0.06);
      if (p.color === 'gone') ctx.setLineDash([z * 0.15, z * 0.1]);
      ctx.strokeRect(sx(p.x) - half, sy(p.y) - half, half * 2, half * 2);
      ctx.setLineDash([]);
    } else if (p.color === 'smoke') {
      // 蒸気：上がりながら広がって薄れる
      ctx.globalAlpha = k * (punk ? (light ? 0.5 : 0.3) : 0.32);
      ctx.fillStyle = p.tint ?? (punk ? (light ? '#ffffff' : '#aeb7bf') : P.soft);
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), z * p.r * (2.6 - k * 1.6), 0, Math.PI * 2); ctx.fill();
    } else if (p.color === 'spark') {
      ctx.strokeStyle = (punk && !light) || lab ? P.hi : P.red;
      ctx.lineWidth = lw(0.035);
      ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.x - p.vx * 0.12), sy(p.y - p.vy * 0.12)); ctx.stroke();
    } else if (p.text) {
      ctx.fillStyle = p.color;
      ctx.font = `600 ${z * 0.4}px ${FONT_HAND}`;
      ctx.fillText(p.text, sx(p.x), sy(p.y));
    } else if (punk) {
      // 火花
      ctx.strokeStyle = light ? P.red : P.hi;
      ctx.lineWidth = lw(0.04);
      ctx.beginPath();
      ctx.moveTo(sx(p.x), sy(p.y));
      ctx.lineTo(sx(p.x - p.vx * 0.22), sy(p.y - p.vy * 0.22));
      ctx.stroke();
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = lw(0.03);
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), z * p.r * (1.8 - k * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // ---- 光の効果（納品の光の尾・反応の光・列車の到着・指令の光の柱） ----
  if (!view.still) drawGlints(ctx, G, P, sx, sy, z, dt, cw, ch, three ? { screen: three.screen, sh: three.sh, project: three.project } : null);

  use(base);
  if (punk) ambient(ctx, P, cw, ch, t, dt, sx(hr.x + hr.s / 2), sy(hr.y + hr.s / 2), z);
  if (!punk && !arcane && !lab) ambientNote(ctx, G, P, cw, ch, t, dt);
  if (lab) labAmbient(ctx, P, cw, ch, t, dt);
  if (arcane) ambientArcane(ctx, G, P, cw, ch, t, dt);
  if (arcane) {
    // 魔術：ゆっくり漂う青い光の粒と、四隅の暗がり
    if (!light) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const px = mod(hash(i, 7) * cw + t * (6 + 9 * hash(i, 11)) * (i % 2 ? 1 : -1), cw), py = mod(hash(i, 13) * ch - t * (4 + 7 * hash(i, 17)), ch);
      const a = (0.25 + 0.35 * Math.sin(t * (0.8 + hash(i, 19)) + i)) * (light ? 0.5 : 1), rad = 1.2 + 2.2 * hash(i, 23);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(${P.glow},${a})`; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (!G) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, light ? 'rgba(70,45,15,0.2)' : 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
  }
}

/**
 * 文具スキンの空気。方眼ノート：窓から差す日だまりがゆっくり動き、その中で埃が光る。
 * 黒板：チョークの粉が、ゆっくり舞い落ちる。左上から、机の灯りがあたる
 */
function ambientNote(ctx: CanvasRenderingContext2D, G: CanvasRenderingContext2D | null, P: Palette, cw: number, ch: number, t: number, dt: number) {
  const light = P.name === 'light', big = Math.max(cw, ch);
  if (light) {
    // 日だまり：窓枠の形の、やわらかな光の台形（地図を「やわらかい光」で明るくする）
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.translate(cw * (0.3 + 0.08 * Math.sin(t * 0.021)), ch * 0.4);
    ctx.rotate(-0.5);
    const gw2 = big * 0.24, gh2 = big * 0.9;
    for (let k = 0; k < 2; k++) {
      const ox = (k - 0.5) * gw2 * 1.15;
      const gr = ctx.createLinearGradient(ox - gw2 / 2, 0, ox + gw2 / 2, 0);
      gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.2, 'rgba(255,240,200,0.55)'); gr.addColorStop(0.8, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = gr; ctx.fillRect(ox - gw2 / 2, -gh2 / 2, gw2, gh2);
    }
    ctx.restore();
    if (calm) return;
    // 光の中の埃
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 0.15, 1);
      const x = mod(m.x + Math.sin(t * 0.25 + m.ph) * 0.02, 1) * cw, y = m.y * ch;
      ctx.globalAlpha = 0.18 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.1 + m.ph * 2));
      ctx.fillRect(x, y, m.s * 0.8, m.s * 0.8);
    }
    ctx.globalAlpha = 1;
  } else {
    // 机の灯り：左上から、あたたかい光
    const lx = cw * 0.18, ly = ch * 0.12;
    const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, big * 0.9);
    gr.addColorStop(0, 'rgba(255,226,170,0.12)'); gr.addColorStop(0.5, 'rgba(255,226,170,0.04)'); gr.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch);
    if (calm) return;
    // チョークの粉
    for (const m of motes) {
      m.y = mod(m.y + m.v * dt * 0.25, 1);
      const x = mod(m.x + Math.sin(t * 0.4 + m.ph) * 0.015, 1) * cw, y = m.y * ch;
      ctx.fillStyle = `rgba(236,238,226,${0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.9 + m.ph))})`;
      ctx.beginPath(); ctx.arc(x, y, m.s * 0.7, 0, Math.PI * 2); ctx.fill();
      if (G && m.s > 2) { G.fillStyle = 'rgba(236,238,226,0.12)'; G.fillRect(x - 2, y - 2, 4, 4); }
    }
  }
}
/**
 * 魔術スキンの空気。羊皮紙：ろうそくの灯がゆらぎ、金の粉が立ちのぼる。
 * 夜の書斎：星形にまたたく光の粒（高画質では光として描く）と、月明かり
 */
function ambientArcane(ctx: CanvasRenderingContext2D, G: CanvasRenderingContext2D | null, P: Palette, cw: number, ch: number, t: number, dt: number) {
  const light = P.name === 'light', big = Math.max(cw, ch);
  if (light) {
    const fl = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1);
    const gr = ctx.createRadialGradient(cw * 0.82, ch * 0.18, 0, cw * 0.82, ch * 0.18, big * 0.8);
    gr.addColorStop(0, `rgba(255,200,120,${0.13 * fl})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over';
    if (calm) return;
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 0.35, 1);
      const x = mod(m.x + Math.sin(t * 0.6 + m.ph) * 0.02, 1) * cw, y = m.y * ch, a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2 + m.ph * 3));
      ctx.fillStyle = `rgba(200,150,60,${a})`; ctx.beginPath(); ctx.arc(x, y, m.s * 0.55, 0, Math.PI * 2); ctx.fill();
      if (G) { G.fillStyle = `rgba(255,190,90,${a * 0.5})`; G.fillRect(x - 3, y - 3, 6, 6); }
    }
  } else {
    // 月明かり：右上から、青白い帯
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cw * 0.75, 0); ctx.rotate(0.55);
    const bw = big * 0.16;
    const gr = ctx.createLinearGradient(-bw, 0, bw, 0);
    gr.addColorStop(0, 'rgba(120,170,255,0)'); gr.addColorStop(0.5, 'rgba(120,170,255,0.07)'); gr.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(-bw, 0, bw * 2, big * 1.6);
    ctx.restore();
    if (calm) return;
    // 星形にまたたく光の粒
    for (let i = 0; i < 14; i++) {
      const x = mod(hash(i, 71) * cw + t * 3 * (i % 2 ? 1 : -1), cw), y = mod(hash(i, 73) * ch - t * 2.5, ch);
      const tw = Math.max(0, Math.sin(t * (1.3 + hash(i, 79)) + i * 2.1)), len = 3 + 7 * tw;
      if (tw < 0.05) continue;
      ctx.strokeStyle = `rgba(170,225,255,${0.55 * tw})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); ctx.moveTo(x, y - len); ctx.lineTo(x, y + len); ctx.stroke();
      if (G) { G.fillStyle = `rgba(150,215,255,${0.6 * tw})`; G.fillRect(x - 2, y - 2, 4, 4); }
    }
  }
}

/** 工業スキンの空気。同じ工場の「光の側」と「闇の側」。
 *  光：雲の影が流れ、その切れ間から日が差し、塵が光る。
 *  闇：煙が漂って視界を奪い、納品所の警告灯が回り、火の粉が立ちのぼる。 */
function ambient(ctx: CanvasRenderingContext2D, P: Palette, cw: number, ch: number, t: number, dt: number, hx: number, hy: number, z: number) {
  const light = P.name === 'light', big = Math.max(cw, ch);
  const blob = (x: number, y: number, r: number, rgba: (a: number) => string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(a)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (light) {
    // 雲の影（闇）と、その切れ間の日だまり（光）
    for (let i = 0; i < 4; i++) {
      const x = (mod(i * 0.37 + t * 0.006, 1.4) - 0.2) * cw, y = (0.15 + 0.7 * hash(i, 41)) * ch;
      blob(x, y, big * (0.28 + 0.1 * hash(i, 43)), (a) => `rgba(18,28,40,${a})`, 0.16);
    }
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 3; i++) {
      const x = (mod(i * 0.41 + 0.2 + t * 0.006, 1.4) - 0.2) * cw, y = (0.2 + 0.6 * hash(i, 47)) * ch;
      blob(x, y, big * 0.26, (a) => `rgba(255,248,225,${a})`, 0.75);
    }
    // 天窓からの光の帯
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(-0.42);
    const span = Math.hypot(cw, ch);
    for (let i = 0; i < 4; i++) {
      const x = mod(t * 14 + i * span * 0.31, span * 1.25) - span * 0.62, wd = span * (0.05 + 0.03 * (i % 2));
      const g = ctx.createLinearGradient(x - wd, 0, x + wd, 0);
      g.addColorStop(0, `rgba(${P.glow},0)`); g.addColorStop(0.5, `rgba(${P.glow},0.7)`); g.addColorStop(1, `rgba(${P.glow},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - wd, -span, wd * 2, span * 2);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 0.4, 1);
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
      ctx.fillRect(mod(m.x + Math.sin(t * 0.3 + m.ph) * 0.01, 1) * cw, m.y * ch, m.s, m.s);
    }
    ctx.globalAlpha = 1;
  } else {
    // 回る警告灯
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const ang = t * 1.1 + k * Math.PI, R = z * 16;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      g.addColorStop(0, 'rgba(255,60,36,0.28)'); g.addColorStop(1, 'rgba(255,60,36,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, R, ang - 0.17, ang + 0.17); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 漂う煙
    for (let i = 0; i < 5; i++) {
      const x = (mod(i * 0.29 + t * 0.011, 1.4) - 0.2) * cw, y = (0.1 + 0.8 * hash(i, 53)) * ch + Math.sin(t * 0.2 + i) * 20;
      blob(x, y, big * (0.22 + 0.1 * hash(i, 59)), (a) => `rgba(4,5,7,${a})`, 0.42);
    }
    // 周辺は闇に沈む
    const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.28, cw / 2, ch / 2, big * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.68)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
    // 火の粉
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const m of motes) {
      m.y = mod(m.y - m.v * dt * 1.8, 1);
      const fl = 0.5 + 0.5 * Math.sin(t * 7 + m.ph * 3), x = mod(m.x + Math.sin(t * 0.9 + m.ph) * 0.02, 1) * cw, y = m.y * ch;
      ctx.strokeStyle = `rgba(${P.glow},${0.3 + 0.6 * fl * m.y})`;
      ctx.lineWidth = m.s * (0.7 + 0.6 * m.y);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t + m.ph) * 2, y + 5 * m.s); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** 粒子の窓が出はじめる拡大率（1 マスのピクセル数）。最大の拡大は 110 */
const ZOOM_IN = 72;
/** 粒子の窓の絵（反応ごとに 1 枚の画面外の絵に描き、それを貼る） */
const SW_W = 360, SW_H = 210;
const scenes = new Map<string, { cv: HTMLCanvasElement; c: CanvasRenderingContext2D; plan: ReturnType<typeof planScene> }>();
onThemeChange(() => { for (const s of scenes.values()) s.cv.width = s.cv.height = 0; scenes.clear(); });
function sceneImage(r: Recipe, phase: number): HTMLCanvasElement {
  let s = scenes.get(r.id);
  if (!s) {
    const cv = document.createElement('canvas'); cv.width = SW_W * 2; cv.height = SW_H * 2;
    const c = cv.getContext('2d')!; c.scale(2, 2);
    s = { cv, c, plan: planScene(r, SW_W, SW_H) };
    scenes.set(r.id, s);
    // 古いものから捨てる（絵の分のメモリもすぐ返す）
    if (scenes.size > 24) { const [k0, s0] = scenes.entries().next().value!; scenes.delete(k0); s0.cv.width = s0.cv.height = 0; }
  }
  drawScene(s.c, s.plan, r, SW_W, SW_H, phase);
  return s.cv;
}

/** 荷の山の並び：個数ごとの、粒の位置（マスに対する割合）。下の段から積み、奥の粒を先に描く */
const HEAP: [number, number][][] = [[], [[0, 0]],
  [[-0.11, 0.05], [0.11, 0.05]],
  [[0, -0.1], [-0.12, 0.08], [0.12, 0.08]],
  [[-0.11, -0.09], [0.11, -0.09], [-0.11, 0.1], [0.11, 0.1]],
  [[-0.1, -0.08], [0.1, -0.08], [-0.2, 0.1], [0, 0.1], [0.2, 0.1]],
  [[0, -0.2], [-0.1, -0.04], [0.1, -0.04], [-0.2, 0.12], [0, 0.12], [0.2, 0.12]],
  [[-0.17, -0.04], [0, -0.04], [0.17, -0.04], [-0.26, 0.12], [-0.09, 0.12], [0.09, 0.12], [0.26, 0.12]],
  [[0, -0.2], [-0.17, -0.04], [0, -0.04], [0.17, -0.04], [-0.26, 0.12], [-0.09, 0.12], [0.09, 0.12], [0.26, 0.12]],
  [[-0.09, -0.2], [0.09, -0.2], [-0.17, -0.04], [0, -0.04], [0.17, -0.04], [-0.26, 0.12], [-0.09, 0.12], [0.09, 0.12], [0.26, 0.12]],
];

function token(ctx: CanvasRenderingContext2D, P: Palette, x: number, y: number, z: number, s: string, flat = false) {
  const d = z * 0.78;
  if (flat) { ctx.drawImage(sprite(s), x - d / 2, y - d / 2, d, d); return; }
  // 物質はベルトの上に乗っている：下に影を落とし、少し持ち上げて描く（研究所では、青緑の光の上に浮かせる）
  const lab = P.skin === 'lab';
  ctx.fillStyle = P.skin === 'punk' ? 'rgba(0,0,0,0.38)' : lab ? `rgba(${P.glow},${P.name === 'light' ? 0.32 : 0.45})` : 'rgba(20,30,50,0.2)';
  ctx.beginPath(); ctx.ellipse(x + (lab ? 0 : d * 0.05), y + d * 0.36, d * 0.3, d * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(sprite(s), x - d / 2, y - d / 2 - d * (lab ? 0.17 : 0.09), d, d);
  if (z >= 52) {
    const su = sub(s), tx = label(s);
    ctx.font = `600 ${z * 0.13}px ${su.formula && !su.mask ? FONT_MONO : FONT_HAND}`;
    const wd = ctx.measureText(tx).width + z * 0.1;
    ctx.fillStyle = P.paper;
    rr(ctx, x - wd / 2, y + z * 0.27, wd, z * 0.18, z * 0.04);
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'center';
    ctx.fillText(tx, x, y + z * 0.365);
  }
}

/** 研究所スキンの装置に渡す、ここにしかない絵の道具 */
const LAB_KIT = { glyph, poleMarks, powerMark };
function machine(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number) {
  if (P.skin === 'punk') { machinePunk(ctx, P, cx, cy, u, z, e, t); return; }
  if (P.skin === 'lab') { machineLab(ctx, P, cx, cy, u, z, e, t, LAB_KIT); return; }
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const unset = isMachine(e.kind) && !e.recipe;
  const line = Math.max(1.5, u * 0.045);
  const disc = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const inked = (fill: string) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke(); };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const punk = (P.skin as string) === 'punk';
  if (punk) {
    // 角を落とした鋼板に四隅のボルト
    ctx.fillStyle = P.shadow;
    chamfer(ctx, cx - u * 0.43 + u * 0.05, cy - u * 0.43 + u * 0.07, u * 0.86, u * 0.86, u * 0.13);
    ctx.fill();
    chamfer(ctx, cx - u * 0.43, cy - u * 0.43, u * 0.86, u * 0.86, u * 0.13);
    inked(P.plate);
    ctx.strokeStyle = P.name === 'light' ? 'rgba(255,255,255,0.9)' : `rgba(${P.glow},${e.busy ? 0.7 : 0.25})`;
    ctx.lineWidth = line * 0.6;
    chamfer(ctx, cx - u * 0.37, cy - u * 0.37, u * 0.74, u * 0.74, u * 0.1);
    ctx.stroke();
    if (z >= 30) {
      ctx.fillStyle = P.ink;
      for (const [bx, by] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { ctx.beginPath(); ctx.arc(cx + bx * u * 0.37, cy + by * u * 0.37, u * 0.022, 0, Math.PI * 2); ctx.fill(); }
    }
  } else {
  // 台：紙に貼った札。影はずらしたベタ
  // 厚み：地面の影 → 機種の色の側面 → 上面
  const th = (u / sizeOf(e)) * 0.13;
  ctx.fillStyle = P.shadow;
  rr(ctx, cx - u * 0.42 + th * 0.8, cy - u * 0.42 + th * 1.9, u * 0.84, u * 0.84, u * 0.12);
  ctx.fill();
  const arc = (P.skin as string) === 'arcane';
  // 魔術スキンの台は、インクではなく濃い真鍮（夜は闇の色）で縁取る
  const cardEdge = arc ? (P.name === 'light' ? BRASS_DARK : '#08060f') : P.ink;
  const card = (fill: string) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = cardEdge; ctx.lineWidth = line; ctx.stroke(); };
  rr(ctx, cx - u * 0.42, cy - u * 0.42 + th, u * 0.84, u * 0.84, u * 0.12);
  card(arc ? mix(BRASS_DARK, '#1a1206', 0.35) : mix(info.color, P.ink, 0.25));
  rr(ctx, cx - u * 0.42, cy - u * 0.42, u * 0.84, u * 0.84, u * 0.12);
  card(P.plate);
  if (arc) {
    // 魔術：真鍮の縁取りと、四隅の青い石（動いている間は灯る）
    ctx.strokeStyle = BRASS; ctx.lineWidth = line * 1.25;
    rr(ctx, cx - u * 0.385, cy - u * 0.385, u * 0.77, u * 0.77, u * 0.09); ctx.stroke();
    ctx.strokeStyle = BRASS_DARK; ctx.lineWidth = Math.max(0.8, line * 0.35);
    rr(ctx, cx - u * 0.355, cy - u * 0.355, u * 0.71, u * 0.71, u * 0.07); ctx.stroke();
    if (z >= 24) for (const [gx, gy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); ctx.arc(cx + gx * u * 0.355, cy + gy * u * 0.355, Math.max(1.5, u * 0.028), 0, Math.PI * 2);
      ctx.fillStyle = e.busy ? `rgb(${P.glow})` : mix(P.plate, BRASS_DARK, 0.6); ctx.fill();
      ctx.strokeStyle = BRASS_DARK; ctx.lineWidth = Math.max(0.8, line * 0.4); ctx.stroke();
    }
  }
  }

  const busy = !!e.busy;
  glyph(ctx, P, e, cx, cy, u, t, line);

  // 名札
  if (z >= 34 && !unset) {
    rr(ctx, cx - u * 0.46, cy - u * 0.46, u * 0.27, u * 0.27, u * 0.05); inked(info.color);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${u * 0.17}px ${FONT_SMALL}`;
    ctx.textAlign = 'center';
    ctx.fillText(info.glyph, cx - u * 0.325, cy - u * 0.315);
  }

  // 出口の矢じり。大きい装置では、出口のあるマスごとに描く。ox, oy は装置の中心から出口のマスの中心までのずれ（マス単位）
  const sz = sizeOf(e), pu = u / sz, EO = sz === 2 ? 0.34 : 0.42, mx = e.x + sz / 2, my = e.y + sz / 2;
  const port = (d: number, color: string, text?: string, ox = 0, oy = 0, s?: string) => {
    const bx = cx + ox * pu, by = cy + oy * pu;
    ctx.save();
    ctx.translate(bx + DX[d] * pu * EO, by + DY[d] * pu * EO);
    ctx.rotate((d * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(pu * 0.15, 0); ctx.lineTo(-pu * 0.03, -pu * 0.12); ctx.lineTo(-pu * 0.03, pu * 0.12);
    ctx.closePath();
    inked(color);
    ctx.restore();
    if (sz === 2 && s && z >= 26) {
      // 何が出る出口かを、出口のすぐ内側に絵柄で示す
      const d2 = pu * 0.44, ix = bx + DX[d] * pu * 0.06, iy = by + DY[d] * pu * 0.06;
      disc(ix, iy, d2 * 0.52); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.6; ctx.stroke();
      ctx.drawImage(sprite(s), ix - d2 / 2, iy - d2 / 2, d2, d2);
    } else if (text && z >= 48) {
      ctx.font = `600 ${pu * 0.13}px ${FONT_MONO}`;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'center';
      ctx.fillText(text, cx + DX[d] * u * 0.2 + (DY[d] ? u * 0.26 : 0), cy + DY[d] * u * 0.25 + (DX[d] ? u * 0.3 : 0));
    }
  };
  // 入口の目安：奥の面に、内向きの切り欠き
  for (const dr of inDoors(e)) {
    ctx.save();
    ctx.translate(cx + (dr.x + 0.5 - mx) * pu - DX[dr.d] * pu * (EO + 0.1), cy + (dr.y + 0.5 - my) * pu - DY[dr.d] * pu * (EO + 0.1));
    ctx.rotate((dr.d * Math.PI) / 2);
    ctx.strokeStyle = P.ink; ctx.lineWidth = line;
    ctx.beginPath(); ctx.moveTo(-pu * 0.06, -pu * 0.13); ctx.lineTo(pu * 0.08, 0); ctx.lineTo(-pu * 0.06, pu * 0.13); ctx.stroke();
    ctx.restore();
  }
  if (e.kind === 'extractor' || e.kind === 'depot' || e.kind === 'sampler' || e.kind === 'sensor' || e.kind === 'gate' || (e.kind === 'lift' && e.role === 'out')) port(e.dir, P.plate);
  else if (e.kind === 'analyzer') { port(portDir(e.dir, 0), '#7fc06a', '陽'); port(portDir(e.dir, 1), P.red, '陰'); }
  else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), P.plate);
  else if (e.kind === 'station') { if (e.role === 'out') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, P.plate, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); } }
  else if (e.kind === 'tank') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, P.plate, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  else if (isSep(e.kind)) { if (sepReady(e.kind, e.test)) sepSlots(e.kind).forEach((i, k) => { const p = slotPort(e, i); port(p.d, ['#9fd0e6', '#c9b27a', '#b9a0d6'][k], SEP_PORTS[e.kind as SepKind][k], p.x + 0.5 - mx, p.y + 0.5 - my); }); }
  else if (e.outOrder) e.outOrder.forEach((s2, i) => { const p = outPort(e, i); port(p.d, sub(s2).color, label(s2), p.x + 0.5 - mx, p.y + 0.5 - my, s2); });
  else if (unset) { const p = slotPort(e, 0); port(p.d, P.plate, undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  if (e.kind === 'electrolyzer' && e.big) poleMarks(ctx, P, e, cx, cy, pu, line);
  if ((e.pw || 0) > 0) powerMark(ctx, P, cx, cy, u, t);

  // 赤ペンの印：設定が要る「？」、詰まっている「！」
  const jam = (e.stuck || 0) > 2.5 || !!e.bad || (e.kind === 'station' && e.role === 'out' && (e.buf?.length ?? 0) >= STATION_CAP);
  const needs = unset || ((e.kind === 'analyzer' && !e.test) || (isSep(e.kind) && !sepReady(e.kind, e.test))) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
  if (needs || jam) {
    if (needs) {
      ctx.strokeStyle = P.red; ctx.lineWidth = line * 1.2;
      ctx.setLineDash([u * 0.12, u * 0.09]);
      ctx.lineDashOffset = -t * u * 0.2;
      if (punk) chamfer(ctx, cx - u * 0.43, cy - u * 0.43, u * 0.86, u * 0.86, u * 0.13); else rr(ctx, cx - u * 0.42, cy - u * 0.42, u * 0.84, u * 0.84, u * 0.12);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    disc(cx + u * 0.32, cy - u * 0.32, u * 0.15); inked(P.red);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${u * 0.2}px ${FONT_SMALL}`;
    ctx.textAlign = 'center';
    ctx.fillText(jam ? '！' : '？', cx + u * 0.32, cy - u * 0.31);
  }
  if (busy) {
    // 進み具合は蛍光ペンの下線
    ctx.strokeStyle = P.hi; ctx.lineWidth = u * 0.07; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(cx - u * 0.34, cy + u * 0.36); ctx.lineTo(cx - u * 0.34 + u * 0.68 * (e.prog || 0), cy + u * 0.36); ctx.stroke();
  }
}

/** 工業スキンの装置：機種の色で塗った厚い筐体、黒い計器盤、四隅のボルト、状態を示すランプ */
function machinePunk(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, z: number, e: Ent, t: number) {
  const info = MACHINES[e.kind as keyof typeof MACHINES], light = P.name === 'light';
  const unset = isMachine(e.kind) && !e.recipe;
  const needs = unset || ((e.kind === 'analyzer' && !e.test) || (isSep(e.kind) && !sepReady(e.kind, e.test))) || ((e.kind === 'sampler' || e.kind === 'depot') && !e.sub);
  const jam = (e.stuck || 0) > 2.5 || !!e.bad || (e.kind === 'station' && e.role === 'out' && (e.buf?.length ?? 0) >= STATION_CAP), busy = !!e.busy;
  const line = Math.max(1.5, u * 0.05), a = u * 0.46, c = u * 0.14, INK = '#0b0d10';
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  // 出口：筐体から突き出た管。大きい装置では、出口のあるマスごとに描く
  const sz = sizeOf(e), pu = u / sz, EO = sz === 2 ? 0.42 : 0.46, mx = e.x + sz / 2, my = e.y + sz / 2;
  const marks: (() => void)[] = [];
  const port = (d: number, color: string, text?: string, ox = 0, oy = 0, s?: string) => {
    const bx = cx + ox * pu, by = cy + oy * pu;
    ctx.save();
    ctx.translate(bx + DX[d] * pu * EO, by + DY[d] * pu * EO);
    ctx.rotate((d * Math.PI) / 2);
    ctx.fillStyle = light ? '#8d969e' : '#4d545c';
    ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8;
    ctx.fillRect(-pu * 0.02, -pu * 0.13, pu * 0.1, pu * 0.26); ctx.strokeRect(-pu * 0.02, -pu * 0.13, pu * 0.1, pu * 0.26);
    ctx.beginPath(); ctx.moveTo(pu * 0.2, 0); ctx.lineTo(pu * 0.08, -pu * 0.1); ctx.lineTo(pu * 0.08, pu * 0.1); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    ctx.restore();
    if (sz === 2 && s && z >= 26) {
      // 筐体を描いたあとで、出口のすぐ内側に中身の絵柄を載せる
      const d2 = pu * 0.44, ix = bx + DX[d] * pu * 0.1, iy = by + DY[d] * pu * 0.1;
      marks.push(() => {
        ctx.beginPath(); ctx.arc(ix, iy, d2 * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = '#eef0ea'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line * 0.6; ctx.stroke();
        ctx.drawImage(sprite(s), ix - d2 / 2, iy - d2 / 2, d2, d2);
      });
    } else if (text && z >= 48) {
      ctx.font = `600 ${pu * 0.12}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      const tx = cx + DX[d] * u * 0.22 + (DY[d] ? u * 0.2 : 0), ty = cy + DY[d] * u * 0.25 + (DX[d] ? u * 0.25 : 0);
      ctx.fillStyle = '#eef0ea';
      ctx.fillText(text, tx, ty);
    }
  };
  const ports = () => {
    // 入口の目安：奥の面の受け口
    for (const dr of inDoors(e)) {
      ctx.save();
      ctx.translate(cx + (dr.x + 0.5 - mx) * pu - DX[dr.d] * pu * (EO + 0.06), cy + (dr.y + 0.5 - my) * pu - DY[dr.d] * pu * (EO + 0.06));
      ctx.rotate((dr.d * Math.PI) / 2);
      ctx.fillStyle = INK;
      ctx.fillRect(-pu * 0.08, -pu * 0.16, pu * 0.14, pu * 0.32);
      ctx.strokeStyle = P.hi; ctx.lineWidth = line * 0.7;
      ctx.beginPath(); ctx.moveTo(-pu * 0.05, -pu * 0.09); ctx.lineTo(pu * 0.03, 0); ctx.lineTo(-pu * 0.05, pu * 0.09); ctx.stroke();
      ctx.restore();
    }
    if (e.kind === 'extractor' || e.kind === 'depot' || e.kind === 'sampler' || e.kind === 'sensor' || e.kind === 'gate' || (e.kind === 'lift' && e.role === 'out')) port(e.dir, '#eef0ea');
    else if (e.kind === 'analyzer') { port(portDir(e.dir, 0), '#7fc06a', '陽'); port(portDir(e.dir, 1), P.red, '陰'); }
    else if (e.kind === 'splitter') for (let i = 0; i < 3; i++) port(portDir(e.dir, i), '#eef0ea');
    else if (e.kind === 'station') { if (e.role === 'out') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, '#eef0ea', undefined, p.x + 0.5 - mx, p.y + 0.5 - my); } }
    else if (e.kind === 'tank') for (const i of [0, 1]) { const p = slotPort(e, i); port(p.d, '#eef0ea', undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
    else if (isSep(e.kind)) { if (sepReady(e.kind, e.test)) sepSlots(e.kind).forEach((i, k) => { const p = slotPort(e, i); port(p.d, ['#9fd0e6', '#c9b27a', '#b9a0d6'][k], SEP_PORTS[e.kind as SepKind][k], p.x + 0.5 - mx, p.y + 0.5 - my); }); }
    else if (e.outOrder) e.outOrder.forEach((s2, i) => { const p = outPort(e, i); port(p.d, sub(s2).color, label(s2), p.x + 0.5 - mx, p.y + 0.5 - my, s2); });
    else if (unset) { const p = slotPort(e, 0); port(p.d, '#eef0ea', undefined, p.x + 0.5 - mx, p.y + 0.5 - my); }
  };

  // 影と筐体
  // 厚み：地面に落ちる影と、筐体の手前の側面
  const th = pu * 0.15;
  ctx.fillStyle = `rgba(0,0,0,${light ? 0.26 : 0.5})`;
  chamfer(ctx, cx - a + th * 0.9, cy - a + th * 2.1, a * 2, a * 2, c); ctx.fill();
  chamfer(ctx, cx - a, cy - a + th, a * 2, a * 2, c);
  ctx.fillStyle = mix(info.color, '#0b0d10', light ? 0.55 : 0.72); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  // 側面のリブ
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = line * 0.6;
  ctx.beginPath();
  for (let k = 1; k < 4 * sz; k++) { const rx = cx - a + c + ((a * 2 - c * 2) * k) / (4 * sz); ctx.moveTo(rx, cy + a + line * 0.5); ctx.lineTo(rx, cy + a + th - line * 0.5); }
  ctx.stroke();
  chamfer(ctx, cx - a, cy - a, a * 2, a * 2, c);
  ctx.fillStyle = mix(info.color, '#0b0d10', light ? 0.1 : 0.42); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  // 面取りの光と影
  ctx.lineWidth = line * 0.7;
  ctx.strokeStyle = `rgba(255,255,255,${light ? 0.6 : 0.2})`;
  ctx.beginPath(); ctx.moveTo(cx - a + line, cy + a - c); ctx.lineTo(cx - a + line, cy - a + c); ctx.lineTo(cx - a + c, cy - a + line); ctx.lineTo(cx + a - c, cy - a + line); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.moveTo(cx + a - line, cy - a + c); ctx.lineTo(cx + a - line, cy + a - c); ctx.lineTo(cx + a - c, cy + a - line); ctx.lineTo(cx - a + c, cy + a - line); ctx.stroke();

  // 計器盤
  const b = u * 0.335;
  chamfer(ctx, cx - b, cy - b, b * 2, b * 2, u * 0.07);
  ctx.fillStyle = '#0e1115'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8; ctx.stroke();
  if (busy) {
    // 稼働中は内側から機種の色で光る
    ctx.save();
    chamfer(ctx, cx - b, cy - b, b * 2, b * 2, u * 0.07); ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b * 1.4);
    g.addColorStop(0, mix(info.color, '#ffffff', 0.25)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 9 + e.x);
    ctx.fillStyle = g; ctx.fillRect(cx - b, cy - b, b * 2, b * 2);
    ctx.restore();
  }
  glyph(ctx, { ...P, ink: '#eef0ea', plate: '#2c333c', soft: '#9aa3ab' }, e, cx, cy, u * 0.74, t, line * 0.75);
  ports();

  if (z >= 30) {
    // 四隅のボルト
    for (const [bx, by] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); ctx.arc(cx + bx * u * 0.385, cy + by * u * 0.385, u * 0.03, 0, Math.PI * 2);
      ctx.fillStyle = light ? '#f4f5f2' : '#6b727a'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = line * 0.5; ctx.stroke();
    }
    // 機種名の刻印
    ctx.fillStyle = P.hi;
    ctx.fillRect(cx - a + u * 0.1, cy - a + u * 0.02, u * 0.22, u * 0.1);
    ctx.fillStyle = INK;
    ctx.font = `700 ${u * 0.1}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.fillText(info.name.slice(0, 2), cx - a + u * 0.21, cy - a + u * 0.075);
  }
  for (const m of marks) m();
  if (e.kind === 'electrolyzer' && e.big) poleMarks(ctx, P, e, cx, cy, pu, line);
  if ((e.pw || 0) > 0) powerMark(ctx, P, cx, cy, u, t);
  // 状態ランプ：緑＝稼働、橙＝待機、赤の点滅＝設定待ち・詰まり
  const lamp = needs || jam ? (Math.sin(t * 10) > 0 ? P.red : '#3a1410') : busy ? (cvd ? CVD_GO : '#58e06a') : e.recipe || e.test || e.sub || e.kind === 'extractor' ? '#ffb020' : '#3b4048';
  // 色覚の補助：丸＝稼働、三角＝待機、四角＝設定待ち・詰まり
  ctx.beginPath(); if (cvd) lampShape(ctx, cx + a - u * 0.14, cy - a + u * 0.07, u * 0.055, needs || jam ? 2 : busy ? 0 : 1); else ctx.arc(cx + a - u * 0.14, cy - a + u * 0.07, u * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = lamp; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = line * 0.5; ctx.stroke();
  if (!light && lamp !== '#3b4048' && lamp !== '#3a1410') {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx + a - u * 0.14, cy - a + u * 0.07, 0, cx + a - u * 0.14, cy - a + u * 0.07, u * 0.3);
    g.addColorStop(0, lamp + '88'); g.addColorStop(1, lamp + '00');
    ctx.fillStyle = g; ctx.fillRect(cx + a - u * 0.44, cy - a - u * 0.23, u * 0.6, u * 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (needs || jam) {
    ctx.strokeStyle = P.red; ctx.lineWidth = line * 1.3;
    ctx.setLineDash([u * 0.12, u * 0.09]);
    ctx.lineDashOffset = -t * u * 0.25;
    chamfer(ctx, cx - a - u * 0.03, cy - a - u * 0.03, a * 2 + u * 0.06, a * 2 + u * 0.06, c); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.red;
    ctx.font = `700 ${u * 0.34}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    if (Math.sin(t * 6) > -0.3) ctx.fillText(jam ? '！' : '？', cx, cy + u * 0.02);
  }
  if (busy) {
    // 進み具合は盤の下のランプ列
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i < Math.ceil((e.prog || 0) * 8) ? P.hi : 'rgba(255,255,255,0.14)';
      ctx.fillRect(cx - b + u * 0.03 + i * ((b * 2 - u * 0.06) / 8), cy + b - u * 0.08, (b * 2 - u * 0.06) / 8 - u * 0.012, u * 0.045);
    }
  }
}

/** 装置の中身の絵。台は呼ぶ側が描く */
function glyph(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, u: number, t: number, line: number) {
  const info = MACHINES[e.kind as keyof typeof MACHINES];
  const disc = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  const inked = (fill: string) => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke(); };
  /** 信号の番号の小さな札（色が似ていても、番号で見分けられるように） */
  const chNo = (n: number, x: number, y: number) => {
    const tx = String(n), fs = u * 0.13, wd = fs * (0.62 * tx.length + 0.5);
    rr(ctx, x - wd / 2, y - fs * 0.62, wd, fs * 1.24, fs * 0.3); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.5; ctx.stroke();
    ctx.fillStyle = P.ink; ctx.font = `700 ${fs}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tx, x, y + fs * 0.04); ctx.textBaseline = 'alphabetic';
  };
  const busy = !!e.busy;
  // 反応を設定した装置は、その反応の様子を描く（中身の色、気体、沈殿、加熱、電極での変化）
  if (e.sealed) {
    // 封印された装置：中は見せない。鎖と「？」
    rr(ctx, cx - u * 0.27, cy - u * 0.27, u * 0.54, u * 0.54, u * 0.06); ctx.fillStyle = mix(P.plate, P.ink, 0.82); ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke();
    ctx.strokeStyle = P.hi; ctx.lineWidth = line * 0.8; ctx.setLineDash([u * 0.04, u * 0.03]);
    ctx.beginPath(); ctx.moveTo(cx - u * 0.27, cy - u * 0.27); ctx.lineTo(cx + u * 0.27, cy + u * 0.27); ctx.moveTo(cx + u * 0.27, cy - u * 0.27); ctx.lineTo(cx - u * 0.27, cy + u * 0.27); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = P.hi; ctx.font = `800 ${u * 0.3}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + (busy ? Math.sin(t * 6) * u * 0.012 : 0)); ctx.textBaseline = 'alphabetic';
    return;
  }
  if (e.recipe && reactionGlyph(ctx, P, e, cx, cy, u, t, line)) return;
  switch (e.kind) {
    case 'extractor': {
      disc(cx, cy, u * 0.27); inked(info.color);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 3 + e.x);
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.ellipse(u * 0.12, 0, u * 0.11, u * 0.045, 0, 0, Math.PI * 2);
        ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7; ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'separator': {
      rr(ctx, cx - u * 0.13, cy - u * 0.33, u * 0.26, u * 0.66, u * 0.1); inked(info.color);
      ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7;
      for (let i = 0; i < 4; i++) {
        const ty = cy + u * (0.2 - i * 0.13);
        const lit = busy && Math.floor(((e.prog || 0) * 8) % 4) === i;
        if (lit) { ctx.fillStyle = P.hi; ctx.fillRect(cx - u * 0.13, ty - u * 0.05, u * 0.26, u * 0.1); }
        ctx.beginPath(); ctx.moveTo(cx - u * 0.13, ty); ctx.lineTo(cx + u * 0.13, ty); ctx.stroke();
      }
      break;
    }
    case 'electrolyzer': {
      rr(ctx, cx - u * 0.29, cy - u * 0.06, u * 0.58, u * 0.34, u * 0.06); inked(mix(info.color, '#ffffff', P.name === 'light' ? 0.55 : 0.1));
      ctx.strokeStyle = P.ink; ctx.lineWidth = u * 0.07;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.14, cy - u * 0.24); ctx.lineTo(cx - u * 0.14, cy + u * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + u * 0.14, cy - u * 0.24); ctx.lineTo(cx + u * 0.14, cy + u * 0.18); ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = `600 ${u * 0.16}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('−', cx - u * 0.14, cy - u * 0.33);
      ctx.fillText('+', cx + u * 0.14, cy - u * 0.33);
      if (busy) {
        ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.6;
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.4 + i * 0.37) % 1;
          disc(cx + (i % 2 ? 0.21 : -0.07) * u + Math.sin(i * 9 + t * 4) * u * 0.02, cy + u * (0.22 - ph * 0.26), u * 0.024);
          ctx.stroke();
        }
      }
      break;
    }
    case 'reactor': {
      disc(cx, cy, u * 0.3); inked(info.color);
      disc(cx, cy, u * 0.17); inked(busy ? P.hi : P.plate);
      if (busy) {
        ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 4);
        ctx.beginPath(); ctx.moveTo(-u * 0.1, 0); ctx.lineTo(u * 0.1, 0); ctx.moveTo(0, -u * 0.1); ctx.lineTo(0, u * 0.1); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'battery': {
      rr(ctx, cx - u * 0.27, cy - u * 0.18, u * 0.54, u * 0.46, u * 0.06); inked(info.color);
      rr(ctx, cx - u * 0.2, cy - u * 0.29, u * 0.12, u * 0.11, u * 0.02); inked(P.plate);
      rr(ctx, cx + u * 0.08, cy - u * 0.29, u * 0.12, u * 0.11, u * 0.02); inked(P.plate);
      ctx.fillStyle = '#1c2a48';
      ctx.font = `600 ${u * 0.2}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('−', cx - u * 0.14, cy + u * 0.06);
      ctx.fillText('+', cx + u * 0.14, cy + u * 0.06);
      if (busy && Math.sin(t * 14) > 0) { disc(cx, cy - u * 0.24, u * 0.045); ctx.fillStyle = P.hi; ctx.fill(); }
      break;
    }
    case 'splitter': {
      disc(cx, cy, u * 0.28); inked(info.color);
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.28, cy - u * 0.28, u * 0.56, u * 0.56);
      break;
    }
    case 'analyzer': {
      ctx.strokeStyle = P.ink; ctx.lineWidth = u * 0.1;
      ctx.beginPath(); ctx.moveTo(cx + u * 0.12, cy + u * 0.12); ctx.lineTo(cx + u * 0.28, cy + u * 0.28); ctx.stroke();
      disc(cx - u * 0.04, cy - u * 0.04, u * 0.21); inked(mix(info.color, '#ffffff', P.name === 'light' ? 0.6 : 0.15));
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.22, cy - u * 0.22, u * 0.36, u * 0.36);
      break;
    }
    case 'sampler': {
      for (let i = -1; i <= 1; i++) {
        rr(ctx, cx + i * u * 0.19 - u * 0.07, cy - u * 0.13, u * 0.14, u * 0.28, u * 0.03); inked(['#d9a05b', '#8fbf7a', '#7fb2d9'][i + 1]);
        ctx.fillStyle = P.ink;
        ctx.fillRect(cx + i * u * 0.19 - u * 0.035, cy - u * 0.2, u * 0.07, u * 0.07);
      }
      ctx.strokeStyle = P.ink; ctx.lineWidth = line;
      ctx.beginPath(); ctx.moveTo(cx - u * 0.32, cy + u * 0.2); ctx.lineTo(cx + u * 0.32, cy + u * 0.2); ctx.stroke();
      // 数の決まった試薬棚（課題）：残りの数を出す
      if (e.left !== undefined) {
        const tx = String(e.left);
        ctx.font = `700 ${Math.max(10, u * 0.24)}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(tx).width + u * 0.12, th = Math.max(13, u * 0.3);
        rr(ctx, cx - tw / 2, cy + u * 0.24, tw, th, th * 0.3); ctx.fillStyle = e.left ? P.hi : P.red; ctx.fill(); ctx.lineWidth = Math.max(0.8, line * 0.5); ctx.stroke();
        ctx.fillStyle = '#14181d'; ctx.fillText(tx, cx, cy + u * 0.24 + th / 2 + 0.5); ctx.textBaseline = 'alphabetic';
      }
      break;
    }
    case 'collector': {
      rr(ctx, cx - u * 0.17, cy - u * 0.14, u * 0.34, u * 0.42, u * 0.06); inked(mix(info.color, '#ffffff', P.name === 'light' ? 0.6 : 0.12));
      if (busy) { ctx.fillStyle = info.color; ctx.fillRect(cx - u * 0.14, cy + u * (0.25 - 0.34 * (e.prog || 0)), u * 0.28, u * 0.34 * (e.prog || 0)); }
      rr(ctx, cx - u * 0.09, cy - u * 0.27, u * 0.18, u * 0.13, u * 0.02); inked(info.color);
      break;
    }
    case 'depot': {
      rr(ctx, cx - u * 0.26, cy - u * 0.26, u * 0.52, u * 0.52, u * 0.06); inked(info.color);
      if (e.sub) ctx.drawImage(sprite(e.sub), cx - u * 0.25, cy - u * 0.25, u * 0.5, u * 0.5);
      break;
    }
    case 'station': {
      // 駅舎：路線色の屋根に番線の数字。積む駅は上向き、降ろす駅は下向きの矢じり
      const col = lineColor(e.ch || 1), out = e.role === 'out';
      rr(ctx, cx - u * 0.3, cy - u * 0.22, u * 0.6, u * 0.44, u * 0.05); inked(col);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = line * 0.6;
      for (const k of [-0.1, 0.1]) { ctx.beginPath(); ctx.moveTo(cx - u * 0.3, cy + u * k); ctx.lineTo(cx + u * 0.3, cy + u * k); ctx.stroke(); }
      disc(cx, cy, u * 0.14); inked('#f3f1e8');
      // 桁が増えたら、丸に収まるように字を小さくする
      const no = String(e.ch || 1);
      ctx.fillStyle = '#14181d'; ctx.font = `700 ${u * [0.18, 0.18, 0.15, 0.11, 0.088][no.length]}px ${FONT_MONO}`; ctx.textAlign = 'center';
      ctx.fillText(no, cx, cy + u * 0.01);
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      if (out) { ctx.moveTo(cx - u * 0.08, cy + u * 0.27); ctx.lineTo(cx + u * 0.08, cy + u * 0.27); ctx.lineTo(cx, cy + u * 0.36); }
      else { ctx.moveTo(cx - u * 0.08, cy - u * 0.27); ctx.lineTo(cx + u * 0.08, cy - u * 0.27); ctx.lineTo(cx, cy - u * 0.36); }
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'settler': {
      // 沈殿槽：ビーカーに溶液。試薬を加えると沈殿が底にたまり、ろ過して分ける
      const a = agentById(e.test), wd = u * 0.5, hh = u * 0.5, x0 = cx - wd / 2, y0 = cy - hh * 0.42;
      const cur = e.item?.s, keys = cur ? ionsOf(cur) : null;
      // 溶液の色：色のつくイオン（Cu²⁺ 青、Fe³⁺ 黄褐）が入っていれば、その色
      const liq = keys?.includes('Cu') ? '#5a9be0' : keys?.includes('Fe') ? '#d9b45a' : cur ? hexOf(cur) : '#cfe2ee';
      const res = a && cur && busy ? settle(cur, a) : null, down = res?.solid && res.solid !== cur ? hexOf(res.solid) : cur && !keys ? hexOf(cur) : null;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + hh - u * 0.06); ctx.quadraticCurveTo(x0, y0 + hh, x0 + u * 0.06, y0 + hh); ctx.lineTo(x0 + wd - u * 0.06, y0 + hh); ctx.quadraticCurveTo(x0 + wd, y0 + hh, x0 + wd, y0 + hh - u * 0.06); ctx.lineTo(x0 + wd, y0);
      ctx.fillStyle = P.plate; ctx.fill();
      ctx.save(); ctx.clip();
      if (cur) {
        ctx.fillStyle = liq; ctx.fillRect(x0, y0 + hh * 0.22, wd, hh);
        if (down) {
          const k = busy ? Math.min(1, e.prog || 0) : 1, h0 = hh * (0.08 + 0.24 * k);
          ctx.fillStyle = down; ctx.fillRect(x0, y0 + hh - h0, wd, h0);
          if (busy) for (let i = 0; i < 7; i++) { const f = cyc(t, i + e.x, 0.8); ctx.fillRect(x0 + wd * ((i * 0.29 + 0.1) % 1), y0 + hh * 0.25 + (hh * 0.7 - h0) * f, u * 0.03, u * 0.03); }
        }
      }
      ctx.restore();
      ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke();
      // 試薬を垂らすピペット
      ctx.lineWidth = line * 0.8; ctx.beginPath(); ctx.moveTo(cx + wd * 0.2, y0 - u * 0.2); ctx.lineTo(cx + wd * 0.2, y0 - u * 0.04); ctx.stroke();
      if (busy) { const f = cyc(t, e.y, 1.6); disc(cx + wd * 0.2, y0 - u * 0.04 + hh * 0.3 * f, u * 0.022); ctx.fillStyle = P.hi; ctx.fill(); ctx.stroke(); }
      if (a && u >= 84) {
        const tx = a.name.replace(/（.*）/, '').slice(0, 8);
        ctx.font = `700 ${Math.max(8, u * 0.07)}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(tx).width + u * 0.05, th = Math.max(11, u * 0.095);
        rr(ctx, cx - tw / 2, y0 + hh + u * 0.035, tw, th, th * 0.3); ctx.fillStyle = P.plate; ctx.fill(); ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
        ctx.fillStyle = P.ink; ctx.fillText(tx, cx, y0 + hh + u * 0.035 + th / 2 + 0.5); ctx.textBaseline = 'alphabetic';
      }
      break;
    }
    case 'funnel': {
      // 分液ろうと：上にエーテル層、下に水層。振ると、塩になったものが下の層へ移る
      const a = washById(e.test), top = cy - u * 0.3, hh = u * 0.52, wd = u * 0.4;
      const shape = () => { ctx.beginPath(); ctx.moveTo(cx - wd * 0.28, top); ctx.lineTo(cx + wd * 0.28, top); ctx.quadraticCurveTo(cx + wd * 0.62, top + hh * 0.35, cx + wd * 0.1, top + hh); ctx.lineTo(cx - wd * 0.1, top + hh); ctx.quadraticCurveTo(cx - wd * 0.62, top + hh * 0.35, cx - wd * 0.28, top); ctx.closePath(); };
      shape(); ctx.fillStyle = P.plate; ctx.fill();
      if (e.item) {
        const k = busy ? Math.min(1, e.prog || 0) : 0, sh = busy ? Math.sin(t * 16) * u * 0.012 * (1 - k) : 0, mid = top + hh * 0.52 + sh;
        ctx.save(); shape(); ctx.clip();
        ctx.fillStyle = '#e9d9a0'; ctx.fillRect(cx - wd, top + hh * 0.14, wd * 2, hh);            // エーテル層（上）
        ctx.fillStyle = '#bcdff0'; ctx.fillRect(cx - wd, mid, wd * 2, hh);                           // 水層（下）
        if (busy) for (let i = 0; i < 6; i++) { const f = cyc(t, i + e.x, 1.1); disc(cx + (((i * 0.37) % 1) - 0.5) * wd * 0.7, top + hh * 0.2 + hh * 0.6 * f, u * 0.018); ctx.fillStyle = i % 2 ? '#e9d9a0' : '#bcdff0'; ctx.fill(); }
        ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.beginPath(); ctx.moveTo(cx - wd, mid); ctx.lineTo(cx + wd, mid); ctx.stroke();
        ctx.restore();
      }
      shape(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke();
      // 栓とコック
      rr(ctx, cx - wd * 0.14, top - u * 0.07, wd * 0.28, u * 0.07, u * 0.015); ctx.fillStyle = P.plate; ctx.fill(); ctx.stroke();
      ctx.lineWidth = line * 0.9; ctx.beginPath(); ctx.moveTo(cx, top + hh); ctx.lineTo(cx, top + hh + u * 0.1); ctx.moveTo(cx - u * 0.06, top + hh + u * 0.035); ctx.lineTo(cx + u * 0.06, top + hh + u * 0.035); ctx.stroke();
      if (a && u >= 84) sepTag(ctx, P, a.name.slice(0, 9), cx, top + hh + u * 0.15, u, line);
      break;
    }
    case 'phoresis': {
      // 電気泳動槽：ろ紙の帯の両端に電極。陽イオンは陰極（左）へ、陰イオンは陽極（右）へ動く
      const pH = phOf(e.test), wd = u * 0.62, hh = u * 0.2, x0 = cx - wd / 2, y0 = cy - hh / 2;
      rr(ctx, x0, y0, wd, hh, u * 0.03); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke();
      const keys = e.item ? aminoOf(e.item.s) ?? ((AMINO_ORDER as string[]).includes(e.item.s) ? [e.item.s as AminoKey] : []) : [];
      const k = busy ? Math.min(1, e.prog || 0) : 0;
      keys.forEach((key, i) => {
        const pole = pH === null ? 'stay' : poleAt(key, pH), dx = pole === 'cathode' ? -1 : pole === 'anode' ? 1 : 0;
        disc(cx + dx * wd * 0.36 * k, y0 + hh * (0.3 + 0.2 * i), u * 0.035);
        ctx.fillStyle = ['#d86a5a', '#7ab86a', '#5a8ad8'][AMINO_ORDER.indexOf(key)]; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(0.6, line * 0.35); ctx.stroke();
      });
      // 電極と電源
      ctx.lineWidth = u * 0.05; ctx.lineCap = 'butt'; ctx.strokeStyle = P.ink;
      for (const sx2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx2 * wd * 0.46, y0 - u * 0.1); ctx.lineTo(cx + sx2 * wd * 0.46, y0 + hh + u * 0.02); ctx.stroke(); }
      ctx.lineCap = 'round'; ctx.lineWidth = line * 0.7;
      ctx.beginPath(); ctx.moveTo(cx - wd * 0.46, y0 - u * 0.1); ctx.lineTo(cx - wd * 0.46, y0 - u * 0.18); ctx.lineTo(cx + wd * 0.46, y0 - u * 0.18); ctx.lineTo(cx + wd * 0.46, y0 - u * 0.1); ctx.stroke();
      ctx.fillStyle = P.ink; ctx.font = `700 ${u * 0.12}px ${FONT_MONO}`; ctx.textAlign = 'center';
      ctx.fillText('−', cx - wd * 0.46, y0 + hh + u * 0.15); ctx.fillText('+', cx + wd * 0.46, y0 + hh + u * 0.15);
      if (pH !== null && u >= 70) sepTag(ctx, P, `pH ${pH}`, cx, y0 + hh + u * 0.1, u, line);
      break;
    }
    case 'tank': {
      // 貯蔵タンク：中身の色で、たまっている量だけ満ちる
      const n = (e.cnt || 0) + (e.rcn || 0), k = Math.min(1, n / TANK_CAP), wd = u * 0.46, hh = u * 0.6, x0 = cx - wd / 2, y0 = cy - hh / 2;
      rr(ctx, x0, y0, wd, hh, u * 0.12); ctx.fillStyle = P.plate; ctx.fill();
      if (n && e.sub) {
        ctx.save(); rr(ctx, x0, y0, wd, hh, u * 0.12); ctx.clip();
        const gas = sub(e.sub).state === 'gas', col = hexOf(e.sub);
        if (gas) { ctx.globalAlpha = 0.25 + 0.7 * k; ctx.fillStyle = col; ctx.fillRect(x0, y0, wd, hh); ctx.globalAlpha = 1; }
        else { const top = y0 + hh * (1 - k) + Math.sin(t * 2 + e.x) * u * 0.006; ctx.fillStyle = col; ctx.fillRect(x0, top, wd, hh); ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0 + wd, top); ctx.stroke(); }
        ctx.restore();
      }
      rr(ctx, x0, y0, wd, hh, u * 0.12); ctx.strokeStyle = P.ink; ctx.lineWidth = line; ctx.stroke();
      // 目盛り
      ctx.lineWidth = Math.max(0.8, line * 0.4);
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + wd * 0.7, y0 + (hh * i) / 4); ctx.lineTo(x0 + wd, y0 + (hh * i) / 4); ctx.stroke(); }
      if (n && e.sub) {
        ctx.drawImage(sprite(e.sub), cx - u * 0.13, cy - u * 0.15, u * 0.26, u * 0.26);
        if (u >= 70) {
          ctx.font = `700 ${Math.max(9, u * 0.085)}px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tx = String(n), tw = ctx.measureText(tx).width + u * 0.05, th = Math.max(11, u * 0.1);
          rr(ctx, cx - tw / 2, cy + u * 0.13, tw, th, th * 0.3); ctx.fillStyle = P.plate; ctx.fill(); ctx.stroke();
          ctx.fillStyle = P.ink; ctx.fillText(tx, cx, cy + u * 0.13 + th / 2 + 0.5); ctx.textBaseline = 'alphabetic';
        }
      }
      if (e.test === 'hold') { ctx.strokeStyle = P.red; ctx.lineWidth = line * 1.2; ctx.beginPath(); ctx.moveTo(x0 - u * 0.04, y0 + hh + u * 0.05); ctx.lineTo(x0 + wd + u * 0.04, y0 + hh + u * 0.05); ctx.stroke(); }
      break;
    }
    case 'sensor': {
      // 検知器：信号の色の灯り。点いているときは明るく、まわりに輪が出る
      const on = (SIG[e.ch || 1] || 0) > 0, col = lineColor(e.ch || 1);
      rr(ctx, cx - u * 0.27, cy - u * 0.2, u * 0.54, u * 0.4, u * 0.08); inked(P.plate);
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.02, cy - u * 0.16, u * 0.32, u * 0.32);
      disc(cx - u * 0.13, cy, u * 0.1); inked(on ? col : mix(col, '#20242a', 0.7));
      if (on) { ctx.strokeStyle = col; ctx.lineWidth = line * 0.8; disc(cx - u * 0.13, cy, u * (0.15 + 0.03 * Math.sin(t * 9))); ctx.stroke(); }
      chNo(e.ch || 1, cx + u * 0.13, cy + u * 0.3);
      break;
    }
    case 'gate': {
      // 弁：開いているときは板が開き、閉じているときは流れをふさぐ
      const open = ((SIG[e.ch || 1] || 0) > 0) === (e.test !== 'off'), col = lineColor(e.ch || 1);
      disc(cx, cy, u * 0.26); inked(P.plate);
      if (e.item) ctx.drawImage(sprite(e.item.s), cx - u * 0.17, cy - u * 0.17, u * 0.34, u * 0.34);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate((e.dir * Math.PI) / 2 + (open ? 0 : Math.PI / 2));
      ctx.fillStyle = open ? col : P.red; ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.8;
      rr(ctx, -u * 0.3, -u * 0.055, u * 0.6, u * 0.11, u * 0.03); ctx.fill(); ctx.stroke();
      ctx.restore();
      disc(cx, cy, u * 0.06); inked(col);
      chNo(e.ch || 1, cx + u * 0.16, cy + u * 0.3);
      break;
    }
    case 'lift': {
      // 昇降機：1 階の入口と 2 階の出口は上向き、その逆は下向きの矢印
      const upFloor = e.y >= FLOOR_DY / 2, goingUp = (e.role === 'in') !== upFloor;
      rr(ctx, cx - u * 0.25, cy - u * 0.25, u * 0.5, u * 0.5, u * 0.07); inked(info.color);
      ctx.fillStyle = e.role === 'in' ? '#ffffff' : P.hi; ctx.strokeStyle = P.ink; ctx.lineWidth = line * 0.7;
      const k = goingUp ? -1 : 1, bob = Math.sin(t * 4 + e.x) * u * 0.03 * (e.item ? 1 : 0);
      ctx.beginPath(); ctx.moveTo(cx, cy + k * u * 0.17 + bob); ctx.lineTo(cx - u * 0.14, cy - k * u * 0.03 + bob); ctx.lineTo(cx - u * 0.05, cy - k * u * 0.03 + bob); ctx.lineTo(cx - u * 0.05, cy - k * u * 0.16 + bob); ctx.lineTo(cx + u * 0.05, cy - k * u * 0.16 + bob); ctx.lineTo(cx + u * 0.05, cy - k * u * 0.03 + bob); ctx.lineTo(cx + u * 0.14, cy - k * u * 0.03 + bob); ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    }
    case 'vent': {
      disc(cx, cy + u * 0.06, u * 0.21); inked(info.color);
      disc(cx, cy + u * 0.06, u * 0.12); inked(P.plate);
      const f = 0.2 + 0.06 * Math.sin(t * 11 + e.x * 3) + 0.03 * Math.sin(t * 23);
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.08, cy + u * 0.06);
      ctx.quadraticCurveTo(cx, cy - u * f * 1.6, cx + u * 0.08, cy + u * 0.06);
      ctx.closePath();
      inked(P.red);
      break;
    }
  }
}

/** 装置の煙の色：色のついた気体が生じる反応なら、その色（NO₂ なら赤褐色、Cl₂ なら黄緑色） */
function smokeTint(recipe: string | undefined): string | undefined {
  const L = reactionLookById(recipe);
  if (!L) return undefined;
  const c = L.gasPhase ? L.after : L.gases.find((g) => g !== '#e4ecf1');
  return c && c !== '#e4ecf1' ? c : undefined;
}
/** '#rrggbb' を '255,200,80' の形に */
const hexRgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
/** 動いている装置がこぼす光の色：色のついた気体が生じる反応ならその色、電気を使う装置は青白、ほかはスキンの光の色 */
function glowOf(e: Ent, P: Palette): string {
  const tint = smokeTint(e.recipe);
  if (tint) return hexRgb(tint);
  if (e.kind === 'electrolyzer' || e.kind === 'battery' || e.kind === 'phoresis') return '150,210,255';
  return P.skin === 'note' ? '255,225,120' : P.glow;
}
/** 水面のマスか（海・入り江）。マスごとの判定は重いので、覚えておく */
const waterMemo = new Map<number, boolean>();
function waterAt(x: number, y: number): boolean {
  const k = (x + 20000) * 40001 + (y + 20000);
  let v = waterMemo.get(k);
  if (v === undefined) { v = isSea(zoneAt(x, y)); if (waterMemo.size > 200000) waterMemo.clear(); waterMemo.set(k, v); }
  return v;
}
/** 装置の下に出す、短い札（試薬の名前や pH） */
function sepTag(ctx: CanvasRenderingContext2D, P: Palette, text: string, cx: number, y: number, u: number, line: number) {
  ctx.font = `700 ${Math.max(8, u * 0.07)}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width + u * 0.05, th = Math.max(11, u * 0.095);
  rr(ctx, cx - tw / 2, y - th / 2, tw, th, th * 0.3); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
  ctx.fillStyle = P.ink; ctx.fillText(text, cx, y + 0.5); ctx.textBaseline = 'alphabetic';
}
/** 色の明るさ（0〜1）。濃い色の上には白、淡い色の上には墨で描くために使う */
const lum = (hex: string) => (0.299 * parseInt(hex.slice(1, 3), 16) + 0.587 * parseInt(hex.slice(3, 5), 16) + 0.114 * parseInt(hex.slice(5, 7), 16)) / 255;
/** 位相をずらした 0〜1 の繰り返し（泡や粒の動きに使う） */
const cyc = (t: number, k: number, speed = 1) => (((t * speed + k * 0.37) % 1) + 1) % 1;

/** 反応を設定した装置の中身。その反応で実際に見えるもの（色の変化・気体・沈殿・炎・電極）を描く。描いたら true */
function reactionGlyph(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, u: number, t: number, line: number): boolean {
  const L = reactionLookById(e.recipe), r = recipeById(e.recipe);
  if (!L || !r) return false;
  const busy = !!e.busy, prog = busy ? Math.min(1, e.prog || 0) : 0, ph = e.x * 0.7 + e.y * 1.3;
  const disc = (x: number, y: number, rad: number) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); };
  const ink = P.ink, body = mix(L.before, L.after, prog);
  const bubbles = (x0: number, x1: number, yb: number, yt: number, col: string, n: number, size: number) => {
    for (let i = 0; i < n; i++) {
      const k = cyc(t, i + ph, 0.9 + (i % 3) * 0.25), bx = x0 + (x1 - x0) * ((i * 0.618 + ph) % 1) + Math.sin(t * 4 + i * 2) * size * 0.6;
      disc(bx, yb + (yt - yb) * k, size * (0.7 + 0.5 * k));
      ctx.fillStyle = col; ctx.globalAlpha = 0.9 * (1 - k * 0.5); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.6, line * 0.35); ctx.stroke();
    }
  };
  const flame = (x: number, y: number, s: number) => {
    const f = busy ? 1 + 0.25 * Math.sin(t * 13 + x) : 0.45;
    ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.7 * f, x, y - s * 1.5 * f); ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.7 * f, x + s * 0.5, y); ctx.closePath();
    ctx.fillStyle = busy ? '#f08a24' : mix('#f08a24', P.plate, 0.6); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, line * 0.5); ctx.stroke();
    if (busy) { ctx.beginPath(); ctx.moveTo(x - s * 0.22, y); ctx.quadraticCurveTo(x, y - s * 0.9 * f, x + s * 0.22, y); ctx.closePath(); ctx.fillStyle = '#ffe07a'; ctx.fill(); }
  };
  const tag = (text: string, y: number) => {
    if (!text || u < 84) return;
    ctx.font = `700 ${Math.max(8, u * 0.075)}px ${FONT_UI}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const wd = ctx.measureText(text).width + u * 0.06, hh = Math.max(11, u * 0.1);
    rr(ctx, cx - wd / 2, y - hh / 2, wd, hh, hh * 0.3); ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, line * 0.45); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText(text, cx, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  };

  switch (e.kind) {
    case 'reactor': {
      const R = u * 0.27, vy = cy - u * 0.03;
      if (L.heat) for (const dx of [-0.5, 0, 0.5]) flame(cx + dx * R * 0.8, vy + R + u * 0.075, u * 0.055);
      disc(cx, vy, R); ctx.fillStyle = P.plate; ctx.fill();
      ctx.save();
      disc(cx, vy, R - line * 0.3); ctx.clip();
      if (L.gasPhase) {
        // 気体どうしの反応：容器いっぱいの気体の色が変わっていく
        ctx.fillStyle = body; ctx.fillRect(cx - R, vy - R, R * 2, R * 2);
        for (let i = 0; i < 7; i++) {
          const a = t * (busy ? 1.6 : 0.3) + i * 0.9 + ph, rr2 = R * (0.25 + 0.5 * ((i * 0.37) % 1));
          disc(cx + Math.cos(a) * rr2, vy + Math.sin(a * 1.3) * rr2, R * 0.11);
          ctx.fillStyle = mix(body, lum(body) > 0.6 ? '#7d8a96' : '#ffffff', 0.28); ctx.fill();
        }
      } else if (L.dry) {
        // 固体を熱する反応：粒の山。熱しているときは下から赤く光る
        ctx.fillStyle = mix(P.plate, '#000000', 0.06); ctx.fillRect(cx - R, vy - R, R * 2, R * 2);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(cx - R, vy + R); ctx.lineTo(cx - R, vy + R * 0.25); ctx.quadraticCurveTo(cx - R * 0.3, vy - R * 0.2, cx + R * 0.1, vy + R * 0.1); ctx.quadraticCurveTo(cx + R * 0.6, vy + R * 0.35, cx + R, vy + R * 0.2); ctx.lineTo(cx + R, vy + R); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, line * 0.5); ctx.stroke();
        if (busy && L.heat) { const g = ctx.createLinearGradient(0, vy + R, 0, vy); g.addColorStop(0, 'rgba(255,120,30,0.75)'); g.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = g; ctx.fillRect(cx - R, vy, R * 2, R); }
        if (L.gases.length) bubbles(cx - R * 0.5, cx + R * 0.5, vy + R * 0.1, vy - R * 0.95, L.gases[L.gases.length - 1], busy ? 4 : 0, R * 0.09);
      } else {
        // 水溶液の反応：液の色が変わり、気体は泡になって上がり、溶けない固体は底にたまる
        const top = vy - R * 0.28 + Math.sin(t * 2.2 + ph) * R * 0.03;
        ctx.fillStyle = body; ctx.fillRect(cx - R, top, R * 2, R * 2);
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, line * 0.45);
        ctx.beginPath(); ctx.moveTo(cx - R, top); ctx.quadraticCurveTo(cx - R * 0.5, top - R * 0.07, cx, top); ctx.quadraticCurveTo(cx + R * 0.5, top + R * 0.07, cx + R, top); ctx.stroke();
        if (L.solids.length) {
          const col = L.solids[0], h0 = R * (0.12 + 0.2 * (busy ? prog : 0.6));
          ctx.fillStyle = col; ctx.fillRect(cx - R, vy + R - h0, R * 2, h0);
          ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(cx - R, vy + R - h0); ctx.lineTo(cx + R, vy + R - h0); ctx.stroke();
          if (busy) for (let i = 0; i < 6; i++) { const k = cyc(t, i + ph, 0.7); ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.5, line * 0.3); ctx.beginPath(); ctx.rect(cx - R * 0.7 + ((i * 0.31 + ph) % 1) * R * 1.4, top + (vy + R - h0 - top) * k, R * 0.1, R * 0.1); ctx.fill(); ctx.stroke(); }
        }
        if (busy) for (const g of L.gases) bubbles(cx - R * 0.6, cx + R * 0.6, vy + R * 0.8, top, g, 3, R * 0.08);
        if (busy) { ctx.save(); ctx.translate(cx, vy + R * 0.35); ctx.rotate(t * 5); ctx.strokeStyle = ink; ctx.lineWidth = line * 0.7; ctx.beginPath(); ctx.moveTo(-R * 0.3, 0); ctx.lineTo(R * 0.3, 0); ctx.stroke(); ctx.restore(); }
      }
      if (L.light) { ctx.fillStyle = 'rgba(255,225,77,0.35)'; ctx.fillRect(cx - R, vy - R, R * 2, R * 2); }
      if (L.cold) { ctx.fillStyle = 'rgba(150,200,240,0.3)'; ctx.fillRect(cx - R, vy - R, R * 2, R * 2); }
      ctx.restore();
      disc(cx, vy, R); ctx.strokeStyle = ink; ctx.lineWidth = line; ctx.stroke();
      // 反応の進み具合：容器のまわりの輪
      if (busy) { ctx.beginPath(); ctx.arc(cx, vy, R + line * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.strokeStyle = P.hi; ctx.lineWidth = line * 1.5; ctx.lineCap = 'butt'; ctx.stroke(); ctx.lineCap = 'round'; }
      tag(L.light ? '光' : L.tag, vy + R + u * (L.heat ? 0.2 : 0.12));
      return true;
    }
    case 'separator': {
      // 塔の中に、取り出す物質が軽い順に上から並ぶ（気体 → 液体 → 固体）
      const info = MACHINES.separator, x0 = cx - u * 0.13, y0 = cy - u * 0.34, wd = u * 0.26, hh = u * 0.62;
      const outs = [...(e.outOrder ?? [])].filter((s) => s !== 'e').sort((a, b) => 'gls'.indexOf(sub(a).state[0]) - 'gls'.indexOf(sub(b).state[0]));
      rr(ctx, x0, y0, wd, hh, u * 0.1); ctx.fillStyle = info.color; ctx.fill();
      ctx.save(); rr(ctx, x0, y0, wd, hh, u * 0.1); ctx.clip();
      outs.forEach((s2, i) => { ctx.fillStyle = hexOf(s2); ctx.fillRect(x0, y0 + (hh * i) / outs.length, wd, hh / outs.length + 1); });
      // 上がっていく蒸気の帯
      if (busy) { const k = cyc(t, ph, 0.5); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x0, y0 + hh * (1 - k) - hh * 0.06, wd, hh * 0.06); }
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = line * 0.6;
      for (let i = 1; i < Math.max(4, outs.length * 2); i++) { const ty = y0 + (hh * i) / Math.max(4, outs.length * 2); ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x0 + wd, ty); ctx.stroke(); }
      rr(ctx, x0, y0, wd, hh, u * 0.1); ctx.lineWidth = line; ctx.stroke();
      if (L.heat) flame(cx, y0 + hh + u * 0.075, u * 0.05);
      tag(L.tag, y0 + hh + u * (L.heat ? 0.15 : 0.085));
      return true;
    }
    case 'electrolyzer': {
      // 電解槽：液の色、陰極（−）と陽極（＋）。気体は泡、金属は電極に析出する
      const x0 = cx - u * 0.3, y0 = cy - u * 0.1, wd = u * 0.6, hh = u * 0.4, ex = [cx - u * 0.15, cx + u * 0.15];
      rr(ctx, x0, y0, wd, hh, u * 0.06); ctx.fillStyle = P.plate; ctx.fill();
      ctx.save(); rr(ctx, x0, y0, wd, hh, u * 0.06); ctx.clip();
      ctx.fillStyle = L.dry ? mix('#f08a24', body, 0.55) : body; ctx.fillRect(x0, y0 + hh * 0.18, wd, hh);
      const outs = r.outputs.map(([s2], i) => ({ s: s2, pole: poleOf(r, i) }));
      outs.forEach((o) => {
        if (o.pole === 'x' || o.s === 'e') return;
        const x = ex[o.pole === 'c' ? 0 : 1], st = sub(o.s).state;
        if (st === 'gas') { if (busy) bubbles(x - u * 0.07, x + u * 0.07, y0 + hh * 0.95, y0 + hh * 0.2, hexOf(o.s), 3, u * 0.022); }
        else if (st === 'solid') { ctx.fillStyle = hexOf(o.s); ctx.fillRect(x - u * 0.06, y0 + hh * (0.95 - 0.5 * (busy ? 0.4 + 0.6 * prog : 0.6)), u * 0.12, hh); }
      });
      ctx.restore();
      if (/交換膜|素焼き/.test(r.accept[0] ?? '')) { ctx.strokeStyle = ink; ctx.lineWidth = line * 0.5; ctx.setLineDash([u * 0.025, u * 0.025]); ctx.beginPath(); ctx.moveTo(cx, y0 + hh * 0.12); ctx.lineTo(cx, y0 + hh); ctx.stroke(); ctx.setLineDash([]); }
      rr(ctx, x0, y0, wd, hh, u * 0.06); ctx.strokeStyle = ink; ctx.lineWidth = line; ctx.stroke();
      ctx.lineWidth = u * 0.055; ctx.lineCap = 'butt';
      for (const x of ex) { ctx.beginPath(); ctx.moveTo(x, y0 - u * 0.14); ctx.lineTo(x, y0 + hh * 0.82); ctx.stroke(); }
      ctx.lineCap = 'round';
      // 電源：陰極と陽極をつなぐ線
      ctx.lineWidth = line * 0.7; ctx.beginPath(); ctx.moveTo(ex[0], y0 - u * 0.14); ctx.lineTo(ex[0], y0 - u * 0.2); ctx.lineTo(ex[1], y0 - u * 0.2); ctx.lineTo(ex[1], y0 - u * 0.14); ctx.stroke();
      if (busy) for (let i = 0; i < 3; i++) { const k = cyc(t, i, 0.8); disc(ex[1] + (ex[0] - ex[1]) * k, y0 - u * 0.2, u * 0.018); ctx.fillStyle = P.hi; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.6, line * 0.3); ctx.stroke(); }
      ctx.fillStyle = ink; ctx.font = `700 ${u * 0.13}px ${FONT_MONO}`; ctx.textAlign = 'center';
      ctx.fillText('−', ex[0] - u * 0.1, y0 - u * 0.1); ctx.fillText('+', ex[1] + u * 0.1, y0 - u * 0.1);
      return true;
    }
    case 'battery': {
      // 電池：負極（−）から正極（＋）へ、導線を電子が流れる。電極は活物質の色
      const x0 = cx - u * 0.3, y0 = cy - u * 0.06, wd = u * 0.6, hh = u * 0.36, ex = [cx - u * 0.16, cx + u * 0.16];
      rr(ctx, x0, y0, wd, hh, u * 0.06); ctx.fillStyle = P.plate; ctx.fill();
      ctx.save(); rr(ctx, x0, y0, wd, hh, u * 0.06); ctx.clip();
      ctx.fillStyle = body; ctx.fillRect(x0, y0 + hh * 0.2, wd, hh);
      ctx.restore();
      if (/素焼き|｜/.test(r.accept[0] ?? '')) { ctx.strokeStyle = ink; ctx.lineWidth = line * 0.5; ctx.setLineDash([u * 0.025, u * 0.025]); ctx.beginPath(); ctx.moveTo(cx, y0 + hh * 0.12); ctx.lineTo(cx, y0 + hh); ctx.stroke(); ctx.setLineDash([]); }
      rr(ctx, x0, y0, wd, hh, u * 0.06); ctx.strokeStyle = ink; ctx.lineWidth = line; ctx.stroke();
      [r.neg, r.pos].forEach((s2, i) => {
        rr(ctx, ex[i] - u * 0.04, y0 - u * 0.12, u * 0.08, hh * 0.86 + u * 0.12, u * 0.015);
        ctx.fillStyle = s2 && hasSubLook(s2) ? hexOf(s2) : '#8d949c'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = line * 0.6; ctx.stroke();
      });
      // 導線と豆電球。電子は負極から正極へ
      const wy = y0 - u * 0.24;
      ctx.strokeStyle = ink; ctx.lineWidth = line * 0.7; ctx.beginPath(); ctx.moveTo(ex[0], y0 - u * 0.12); ctx.lineTo(ex[0], wy); ctx.lineTo(ex[1], wy); ctx.lineTo(ex[1], y0 - u * 0.12); ctx.stroke();
      disc(cx, wy, u * 0.05); ctx.fillStyle = busy ? P.hi : P.plate; ctx.fill(); ctx.stroke();
      if (busy) for (let i = 0; i < 3; i++) { const k = cyc(t, i, 0.9); disc(ex[0] + (ex[1] - ex[0]) * k, wy, u * 0.018); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.6, line * 0.3); ctx.stroke(); }
      ctx.fillStyle = ink; ctx.font = `700 ${u * 0.12}px ${FONT_MONO}`; ctx.textAlign = 'center';
      ctx.fillText('−', ex[0] - u * 0.1, y0 - u * 0.02); ctx.fillText('+', ex[1] + u * 0.1, y0 - u * 0.02);
      return true;
    }
    default:
      return false;
  }
}
/** 電池の電極に使う色があるか（気体の活物質は、電極そのものの色ではないので灰色にする） */
const hasSubLook = (id: string) => { try { return sub(id).state === 'solid'; } catch { return false; } };

/** 納品所：全元素を欲しがる機械。大きくなるほど、歯・煙突・棘・回る環が増えていかつくなる。
 *  外周に並ぶ元素の印は、その元素を飲み込むと灯る */
function hub(ctx: CanvasRenderingContext2D, P: Palette, px: number, py: number, z: number, size: number, w: World, t: number) {
  if (P.skin === 'lab') { hubLab(ctx, P, px, py, z, size, w, t); return; }
  const s = z * size, lv = Math.max(0, [2, 4, 6, 8].indexOf(size)), punk = P.skin === 'punk', light = P.name === 'light';
  const cxh = px + s / 2, cyh = py + s / 2, line = Math.max(1.5, z * 0.05), m = z * 0.06, c = z * 0.3;
  const INK = punk ? '#07090b' : P.ink;
  const hull = punk ? (light ? '#2e353d' : '#171b20') : light ? '#2b3550' : '#1a2620';
  const steel = punk ? (light ? '#8d969e' : '#4d545c') : light ? '#8792ab' : '#6f8176';
  const hot = punk ? P.hi : light ? P.red : P.hi, core = punk ? '#ff3c24' : P.red;
  const pulse = 0.5 + 0.5 * Math.sin(t * (2.2 + lv * 0.5));
  const box = (ox: number, oy: number, grow = 0) => chamfer(ctx, px + m - grow + ox, py + m - grow + oy, s - 2 * m + grow * 2, s - 2 * m + grow * 2, c);
  ctx.lineJoin = 'miter';

  // 地面の影と、背の高い側面
  const th = z * (0.22 + lv * 0.06);
  ctx.fillStyle = punk ? `rgba(0,0,0,${light ? 0.3 : 0.55})` : P.shadow;
  box(th * 0.7, th * 1.8); ctx.fill();
  // 棘：段階 2 から外へ突き出す。段階 3 では脈打つ
  if (lv >= 2) {
    const n = size * 2, len = z * (lv >= 3 ? 0.42 + 0.08 * pulse : 0.3), half = z * 0.16;
    ctx.fillStyle = steel; ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8;
    for (let side = 0; side < 4; side++) for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * (s - z * 0.9);
      const [bx, by, nx, ny] = side === 0 ? [cxh + u, py + m, 0, -1] : side === 1 ? [px + s - m, cyh + u, 1, 0] : side === 2 ? [cxh + u, py + s - m, 0, 1] : [px + m, cyh + u, -1, 0];
      ctx.beginPath(); ctx.moveTo(bx - ny * half, by + nx * half); ctx.lineTo(bx + nx * len, by + ny * len); ctx.lineTo(bx + ny * half, by - nx * half); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
  box(0, th); ctx.fillStyle = punk ? '#0b0d10' : mix(hull, '#000000', 0.35); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  // 筐体
  box(0, 0); ctx.fillStyle = hull; ctx.fill(); ctx.stroke();
  if (punk) {
    // 縁の危険表示
    ctx.save(); box(0, 0); ctx.clip();
    ctx.strokeStyle = P.hi; ctx.lineWidth = z * 0.1; ctx.globalAlpha = light ? 0.9 : 0.75;
    ctx.setLineDash([z * 0.22, z * 0.22]); ctx.lineDashOffset = -t * z * 0.3;
    chamfer(ctx, px + m + z * 0.07, py + m + z * 0.07, s - 2 * m - z * 0.14, s - 2 * m - z * 0.14, c * 0.8); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // 四辺の搬入口：歯が噛み合う口。マスごとに 1 つ
  const chomp = 0.5 + 0.5 * Math.sin(t * 7);
  for (let side = 0; side < 4; side++) for (let k = 0; k < size; k++) {
    const u = (k + 0.5 - size / 2) * z;
    ctx.save();
    ctx.translate(side === 0 ? cxh + u : side === 1 ? px + s - m : side === 2 ? cxh + u : px + m, side === 0 ? py + m : side === 1 ? cyh + u : side === 2 ? py + s - m : cyh + u);
    ctx.rotate((side * Math.PI) / 2);
    const jw = z * 0.34, jh = z * 0.26;
    ctx.fillStyle = '#050607'; ctx.fillRect(-jw, 0, jw * 2, jh);
    ctx.fillStyle = core; ctx.globalAlpha = 0.25 + 0.3 * pulse; ctx.fillRect(-jw, jh * 0.55, jw * 2, jh * 0.45); ctx.globalAlpha = 1;
    ctx.fillStyle = steel;
    for (let i = 0; i < 4; i++) {
      const x0 = -jw + (i * jw) / 2, d = jh * (0.35 + 0.3 * (i % 2 ? chomp : 1 - chomp));
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + jw / 4, d); ctx.lineTo(x0 + jw / 2, 0); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = line * 0.7; ctx.strokeRect(-jw, 0, jw * 2, jh);
    ctx.restore();
  }

  // 元素の環：飲み込んだ元素は色がつき、まだのものは影だけ
  const els = ELEMENTS, ringR = s / 2 - z * (0.42 + (lv ? 0.1 : 0)), er = Math.max(2.5, Math.min(z * 0.17, (ringR * 8) / els.length / 2.6));
  // 2×2 のうちは場所がないので、元素の環は出さない（納品所をタップすれば一覧が見える）
  if (z >= 16 && lv >= 1) els.forEach((el, i) => {
    const a = (i / els.length) * Math.PI * 2 - Math.PI / 2 + (lv >= 3 ? t * 0.05 : 0);
    const k = Math.SQRT2, ex = cxh + ringR * Math.max(-1, Math.min(1, Math.cos(a) * k)), ey = cyh + ringR * Math.max(-1, Math.min(1, Math.sin(a) * k));
    const tier = fedTier(w, el.sym);
    ctx.beginPath(); ctx.arc(ex, ey, er * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = tier ? '#f3f1e8' : '#0a0c0e'; ctx.fill();
    ctx.strokeStyle = tier >= 3 ? hot : tier ? INK : steel; ctx.lineWidth = tier >= 2 ? line * 0.9 : line * 0.5; ctx.stroke();
    ctx.globalAlpha = tier ? 1 : 0.28;
    drawElement(ctx, el.sym, ex, ey, er * 0.8);
    ctx.globalAlpha = 1;
  });

  // 中央の口：回る歯の環と、赤く脈打つ炉心
  const R = lv === 0 ? z * 0.6 : Math.min(s * 0.3, s / 2 - z * 0.82);
  const ring = (r: number, teeth: number, rot: number, depth: number, fill: string) => {
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = rot + (i / (teeth * 2)) * Math.PI * 2, rr2 = i % 2 ? r : r + depth; ctx.lineTo(cxh + Math.cos(a) * rr2, cyh + Math.sin(a) * rr2); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8; ctx.stroke();
  };
  if (lv >= 3) ring(R * 1.34, 28, -t * 0.25, R * 0.1, steel);
  if (lv >= 1) ring(R * 1.14, 10 + lv * 4, t * 0.35, R * 0.12, mix(steel, hull, 0.35));
  ctx.beginPath(); ctx.arc(cxh, cyh, R * 1.04, 0, Math.PI * 2); ctx.fillStyle = '#050607'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line; ctx.stroke();
  const glow = ctx.createRadialGradient(cxh, cyh, R * 0.15, cxh, cyh, R);
  glow.addColorStop(0, punk && !light ? 'rgba(255,90,40,0.55)' : 'rgba(210,63,58,0.42)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55 + 0.45 * pulse; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cxh, cyh, R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  // 内向きの牙
  const fangs = 8 + lv * 4;
  ctx.fillStyle = steel; ctx.strokeStyle = INK; ctx.lineWidth = line * 0.6;
  for (let i = 0; i < fangs; i++) {
    const a = t * -0.5 + (i / fangs) * Math.PI * 2, wd = (Math.PI / fangs) * 0.7, r1 = R * 1.02, r2 = R * (0.8 - 0.05 * chomp);
    ctx.beginPath(); ctx.moveTo(cxh + Math.cos(a - wd) * r1, cyh + Math.sin(a - wd) * r1); ctx.lineTo(cxh + Math.cos(a) * r2, cyh + Math.sin(a) * r2); ctx.lineTo(cxh + Math.cos(a + wd) * r1, cyh + Math.sin(a + wd) * r1); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // 煙突：段階 1 から四隅に立ち、煙を吐く
  if (lv >= 1) {
    const off = s / 2 - z * 0.62;
    for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cxh + ax * off, y = cyh + ay * off, r = z * (0.2 + lv * 0.03);
      ctx.beginPath(); ctx.arc(x, y + r * 0.35, r, 0, Math.PI * 2); ctx.fillStyle = '#0b0d10'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = steel; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = line * 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#050607'; ctx.fill();
      if (particles.length < 260 && Math.random() < 0.025 * lv) { const hr = hubRect(size); particles.push({ x: hr.x + (x - px) / z, y: hr.y + (y - py) / z, vx: 0.18 + Math.random() * 0.1, vy: -0.55 - Math.random() * 0.2, age: 0, life: 1.8 + Math.random(), color: 'smoke', r: 0.14 + lv * 0.02, tint: '#30343a' }); }
    }
  }

  // いま欲しがっているもの
  const u = Math.min(s / 2, R * 2.1);
  ctx.textAlign = 'center';
  const ink = punk ? P.hi : '#f3f1e8';
  ctx.fillStyle = ink;
  const goal = currentGoal(w);
  const gs = goal ? sub(goal.s) : null;
  const plain = !gs?.formula || !!gs.mask;
  const tx = !gs ? '満腹' : goal!.also ? `${label(goal!.s)} ほか` : plain ? (goal!.s === 'e' ? 'e⁻' : gs.name.replace(/（.*）| .*$/g, '')) : label(goal!.s);
  ctx.lineWidth = Math.max(2, u * 0.05); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  ctx.font = `600 ${u * Math.min(0.4, 1.15 / Math.max(1, tx.length * (plain ? 1 : 0.62)))}px ${plain ? FONT_HAND : FONT_MONO}`;
  ctx.strokeText(tx, cxh, cyh - u * 0.06); ctx.fillText(tx, cxh, cyh - u * 0.06);
  if (goal) {
    ctx.font = `600 ${u * 0.2}px ${FONT_MONO}`;
    const ct = goal.rate ? `毎分 ${Math.round(goalRate(w))} / ${goal.rate}` : `${goalCount(w)} / ${requiredOf(w, goal)}`;
    ctx.strokeText(ct, cxh, cyh + u * 0.3); ctx.fillText(ct, cxh, cyh + u * 0.3);
  }
}

/** 角を落とした四角 */
/** 電池の電力で加速しているしるし：中央に稲妻 */
function powerMark(ctx: CanvasRenderingContext2D, P: Palette, cx: number, cy: number, u: number, t: number) {
  const r = u * 0.13, k = 0.75 + 0.25 * Math.sin(t * 14);
  ctx.save();
  ctx.translate(cx, cy - u * 0.36);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0d10'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.25, -r); ctx.lineTo(-r * 0.55, r * 0.15); ctx.lineTo(-r * 0.05, r * 0.15); ctx.lineTo(-r * 0.25, r); ctx.lineTo(r * 0.55, -r * 0.2); ctx.lineTo(r * 0.05, -r * 0.2);
  ctx.closePath();
  ctx.globalAlpha = k;
  ctx.fillStyle = P.hi; ctx.fill();
  ctx.restore();
}

/** 電解槽：左半分が陰極（−）、右半分が陽極（＋） */
function poleMarks(ctx: CanvasRenderingContext2D, P: Palette, e: Ent, cx: number, cy: number, pu: number, line: number) {
  const f = e.dir as number, l = (f + 3) % 4, r = (f + 1) % 4;
  for (const [side, text, color] of [[l, '−', '#3f7fc0'], [r, '＋', P.red]] as [number, string, string][]) {
    const x = cx + DX[side] * pu * 0.68 - DX[f] * 0, y = cy + DY[side] * pu * 0.68 - DY[f] * 0;
    ctx.beginPath(); ctx.arc(x, y, pu * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#0b0d10'; ctx.lineWidth = line * 0.8; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${pu * 0.22}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + pu * 0.01);
  }
}

function chamfer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number) {
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c);
  ctx.closePath();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
