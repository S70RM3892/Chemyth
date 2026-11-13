/**
 * 引いた視野（戦略図）。1 マスが数ピクセルしかないときの地図。
 * 近くで見るときの絵は、地面の区画を 1 枚 384 ピクセルで描き、装置を 1 台ずつ細かく描く。何百もの区画が見えると重すぎる。
 * そこで、引いた視野では地図を「図」として描く。
 *  - 地面：紙の色を塗り、方眼の線を引き、資源地を塗る。資源地は形（map.ts と同じ式）を多角形にして、広い区画ごとの小さな絵
 *    （256 ピクセル四方、1 マス 2・4・8 ピクセル）に描きためて貼る。近くの絵の 384 ピクセルの区画は作らない
 *  - 設備：色ごとにまとめて 1 回で描く。装置は機種の色の四角、ベルトは細い線、線路は線、列車は点。文字・記号・粒子・粒子の窓は描かない
 *  - 重ね書き：資源地の名前と産出物、納品所、線路の網、いまの指令の資源地、区画ごとの生産の札、縮尺。重ならないように、大事なものから置く
 * 色は、見た目（Palette）と資源地の色（ZONES）から作る。新しいスキンでも、そのまま描ける。
 */
import { TRAIN, lineRuns, railRuns, trainAt } from './railruns';
import { ZONES, blobRadius, hubRect, isSea, zoneSpots, type Zone, type ZoneSpot } from '../content/map';
import { lineColor, MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { isSep, sepReady } from '../content/sep';
import { DX, DY, FLOOR_DY, at, currentGoal, floorOf, inflow, isMachine, sizeOf, railOf as railOf2, stationDests, stationVer, stationsOf, type Ent, type World } from '../engine/world';
import { districtsOf, type District } from '../engine/districts';
import { BRASS_DARK, mix, onThemeChange, type Palette } from './theme';
import { sprite } from './token';
import { beltRate, cvdOn, flowEdge, flowStep, flowWidth, heatColor, heatOn, STALL } from './mapfx';
import type { Camera, View } from './render';

/** 引いた視野に替わる 1 マスの大きさ（CSS ピクセル）。境の前後でちらつかないよう、入るのは 7.5 より小さくなったとき、出るのは 8.5 より大きくなったとき */
export const FAR_Z = 8;
const FAR_ENTER = FAR_Z - 0.5, FAR_LEAVE = FAR_Z + 0.5;
/** 切り替わったとき、前の絵を重ねたまま消していく時間（秒） */
const FADE = 0.3;

const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
type BK = 'solid' | 'liquid' | 'gas' | 'none';
const KINDS: BK[] = ['solid', 'liquid', 'gas', 'none'];
/** ベルトの太さ（マス）。近くの絵と同じ */
const WIDTH: Record<BK, number> = { solid: 0.6, liquid: 0.46, gas: 0.34, none: 0.52 };

// ---- 近くの絵と引いた絵の切り替え ----
interface Mode { far: boolean; cam: Camera; cw: number; ch: number; snap: HTMLCanvasElement | null; from: Camera; t0: number }
/** 絵（canvas）ごとの状態。アルバムの写真など、ほかの絵に描くときは、切り替えの重ね描きをしない */
const modes = new WeakMap<HTMLCanvasElement, Mode>();

/**
 * この絵を、いまの視点で描くなら、引いた視野になるか（farBegin と同じ決め方で、状態は変えない）。
 * 指の操作や合成段の高さの層は、FAR_Z ではなく、これで決める（7.5〜8.5 のずらし幅の中では、前の視野のまま描いているので）
 */
export function isFar(cv: HTMLCanvasElement, cam: Camera): boolean {
  const m = modes.get(cv);
  return m ? (m.far ? cam.z < FAR_LEAVE : cam.z < FAR_ENTER) : cam.z < FAR_Z;
}

/**
 * この絵を、引いた視野で描くか。切り替わった瞬間は、前のコマの絵（まだ canvas に残っている）を写しておく。
 * farEnd が、それを新しい視点に合わせて縮め、少しのあいだ重ねて消していく（ぱっと替わって見えないように）
 */
export function farBegin(ctx: CanvasRenderingContext2D, cam: Camera, t: number, cw: number, ch: number): boolean {
  const cv = ctx.canvas, m = modes.get(cv), far = isFar(cv, cam);
  if (!m) {
    modes.set(cv, { far, cam: { ...cam }, cw, ch, snap: null, from: { ...cam }, t0: -1 });
    return far;
  }
  if (far !== m.far) {
    m.far = far;
    if (cv.width > 0 && cv.height > 0 && m.cw === cw && m.ch === ch) {
      m.snap ??= document.createElement('canvas');
      if (m.snap.width !== cv.width || m.snap.height !== cv.height) { m.snap.width = cv.width; m.snap.height = cv.height; }
      const g = m.snap.getContext('2d')!;
      g.globalCompositeOperation = 'copy'; g.globalAlpha = 1;
      g.drawImage(cv, 0, 0);
      g.globalCompositeOperation = 'source-over';
      m.from = { ...m.cam }; m.t0 = t;
    }
  }
  return far;
}

/** 切り替えの重ね描き（前の絵を、いまの視点の位置と大きさに合わせて、薄くしながら重ねる）。毎コマの最後に呼ぶ */
export function farEnd(ctx: CanvasRenderingContext2D, cw: number, ch: number, cam: Camera, t: number) {
  const m = modes.get(ctx.canvas);
  if (!m) return;
  if (m.snap && m.t0 >= 0) {
    const k = (t - m.t0) / FADE;
    if (k >= 1 || k < 0 || m.cw !== cw || m.ch !== ch) {
      // 使い終えたら、絵の分のメモリを返す
      m.snap.width = m.snap.height = 0; m.snap = null; m.t0 = -1;
    } else {
      const s = cam.z / m.from.z, x = (m.from.x - cam.x) * cam.z + cw / 2 - (cw / 2) * s, y = (m.from.y - cam.y) * cam.z + ch / 2 - (ch / 2) * s;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (1 - k) * (1 - k) * (1 + 2 * k);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m.snap, x, y, cw * s, ch * s);
      ctx.restore();
    }
  }
  m.cam = { x: cam.x, y: cam.y, z: cam.z }; m.cw = cw; m.ch = ch;
}

// ---- 色と形（見た目ごとに作ってためておく）----
/** 輪郭の色。近くの絵に合わせる（工業は黒い鋼の縁、魔術は真鍮の暗い縁、ほかは主線の色） */
const edgeOf = (P: Palette) => (P.skin === 'punk' ? '#0b0d10' : P.skin === 'arcane' ? (P.name === 'light' ? BRASS_DARK : '#07060d') : P.ink);
/** ベルトの縁の色。研究所は、近くの絵（skinLab.ts のベルト）と同じ銀（夜は黒）の縁 */
const rimOf = (P: Palette) => (P.skin === 'lab' ? (P.name === 'light' ? '#7f8c97' : '#02060b') : edgeOf(P));
/** 線路の色（桁と、中の 2 本のレール）。近くの絵（render.ts の貨物線）と同じ */
const railOf = (P: Palette) => {
  const light = P.name === 'light', punk = P.skin === 'punk', lab = P.skin === 'lab';
  return { ink: punk ? '#0b0d10' : lab && !light ? '#03070c' : P.ink, core: punk ? (light ? '#c9ced3' : '#8a939c') : lab ? (light ? '#dfe7ec' : '#6c8194') : light ? '#e9e6da' : '#aeb6c2' };
};
/** 2 階を見ているときに地面を覆う床板の色。近くの絵と同じ */
const floorCover = (P: Palette) => {
  const light = P.name === 'light';
  return P.skin === 'punk' ? (light ? 'rgba(196,201,206,0.82)' : 'rgba(15,18,22,0.84)') : P.skin === 'lab' ? (light ? 'rgba(226,234,240,0.84)' : 'rgba(6,11,18,0.86)') : light ? 'rgba(240,242,236,0.84)' : 'rgba(22,26,34,0.84)';
};
/** 色覚の補助のとき、動いている装置の印の色（render.ts と同じ青） */
const CVD_GO = '#2f7fd8';
const looks = new Map<string, { fill: string; rim: string }>();
const labels = new Map<string, { cv: HTMLCanvasElement; w: number; h: number }>();
const subColors = new Map<string, string>();
onThemeChange(() => { looks.clear(); labels.clear(); });
// 書体が読み込まれたら、札を作り直す（読み込み前の代わりの書体のまま残らないように）
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => { labels.clear(); plates.clear(); });

/** 資源地の塗りと縁の色。紙の色に、資源地の色を混ぜる。海と入り江は、液体の管の色（どの見た目でも水に見える）から作る */
function zoneLook(P: Palette, zn: Zone) {
  const key = `${P.key}:${zn}`;
  let c = looks.get(key);
  if (!c) {
    const light = P.name === 'light';
    const fill = isSea(zn)
      ? mix(P.paper, mix(P.line.liquid, ZONES[zn].tint[0], light ? 0.3 : 0.45), light ? 0.95 : 0.85)
      : mix(P.paper, ZONES[zn].tint[1], light ? 0.38 : 0.5);
    // 縁は、塗りを主線の色に寄せる（明るい紙なら濃く、暗い紙なら明るく）
    c = { fill, rim: mix(fill, P.ink, light ? 0.42 : 0.34) };
    looks.set(key, c);
  }
  return c;
}

const shapes = new Map<string, Float32Array>();
/** 資源地の形（世界の座標の多角形、n 角形）。近くの絵の資源地は、マスの中心から 0.86 マスの円を重ねて描くので、縁を半マス外へ広げて合わせる */
function shape(s: ZoneSpot, n: number): Float32Array {
  const key = `${s.cx},${s.cy},${s.r},${n}`;
  let p = shapes.get(key);
  if (!p) {
    p = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2, rad = blobRadius(s.cx, s.cy, s.r, th) + 0.5;
      p[i * 2] = s.cx + Math.cos(th) * rad; p[i * 2 + 1] = s.cy + Math.sin(th) * rad;
    }
    if (shapes.size > 6000) shapes.clear();
    shapes.set(key, p);
  }
  return p;
}

// ---- 資源地の絵：地図を区画に分け、区画ごとに 1 枚の絵（256 ピクセル四方）に描いてためておく ----
// 毎コマ何百もの資源地の形を塗ると重い（とくに GPU で描く端末）。描きためた絵を貼るだけなら、見える範囲が広くても軽い
/** 区画の絵の大きさ（ピクセル）。1 マスの細かさ ppt（2・4・8 ピクセル）によって、1 枚がおおう広さ（128・64・32 マス）が変わる */
const REG_PX = 256;
/** ためておく区画の絵の数（1 枚 256 KB、合わせて 32 MB ほど）。大きな画面で、見えている数の 2 倍より少ないときは、そこまで増やす。資源地のない区画は、絵を作らない */
const REG_MAX = 128;
let regionKeep = REG_MAX;
const regions = new Map<string, HTMLCanvasElement | null>();
let regionCount = 0;
const dropRegions = () => { for (const c of regions.values()) if (c) c.width = c.height = 0; regions.clear(); regionCount = 0; };
onThemeChange(dropRegions);

/** 区画 [x0, x0 + span) × [y0, y0 + span) に重なる資源地 */
function regionSpots(x0: number, y0: number, span: number): ZoneSpot[] {
  return zoneSpots(x0 - 6, y0 - 6, x0 + span + 6, y0 + span + 6).filter((s) => {
    const R = s.r * 1.25 + 0.7, dx = Math.max(x0 - s.cx, 0, s.cx - (x0 + span)), dy = Math.max(y0 - s.cy, 0, s.cy - (y0 + span));
    return dx < R && dy < R;
  });
}

/** 資源地を塗る。世界の点 (X, Y) を (ox + X k, oy + Y k) に描く。縁は、細かい絵（引いた視野）ほど薄くする */
function zonePaint(g: CanvasRenderingContext2D, P: Palette, spots: ZoneSpot[], k: number, ox: number, oy: number) {
  const n = k <= 2 ? 14 : k <= 4 ? 20 : 32, a0 = g.globalAlpha, rimA = Math.min(1, Math.max(0.3, (k - 1.5) / 3));
  const byZone = new Map<Zone, ZoneSpot[]>();
  for (const s of spots) { let l = byZone.get(s.zone); if (!l) byZone.set(s.zone, (l = [])); l.push(s); }
  g.lineJoin = 'round'; g.lineWidth = Math.max(1, k * 0.13);
  for (const [zn, list] of byZone) {
    const c = zoneLook(P, zn);
    g.beginPath();
    for (const s of list) {
      const p = shape(s, n);
      g.moveTo(ox + p[0] * k, oy + p[1] * k);
      for (let i = 2; i < p.length; i += 2) g.lineTo(ox + p[i] * k, oy + p[i + 1] * k);
      g.closePath();
    }
    g.fillStyle = c.fill; g.fill();
    g.globalAlpha = a0 * rimA; g.strokeStyle = c.rim; g.stroke(); g.globalAlpha = a0;
  }
}

/** 区画の絵。まだなければ make のときだけ作る（作らなければ undefined）。資源地のない区画は null */
function regionImage(P: Palette, rx: number, ry: number, ppt: number, make: boolean): HTMLCanvasElement | null | undefined {
  const key = `${P.key}:${ppt}:${rx},${ry}`, got = regions.get(key);
  if (got !== undefined) { regions.delete(key); regions.set(key, got); return got; }
  if (!make) return undefined;
  const span = REG_PX / ppt, x0 = rx * span, y0 = ry * span, spots = regionSpots(x0, y0, span);
  let cv: HTMLCanvasElement | null = null;
  if (spots.length) {
    cv = document.createElement('canvas');
    cv.width = cv.height = REG_PX;
    zonePaint(cv.getContext('2d')!, P, spots, ppt, -x0 * ppt, -y0 * ppt);
    regionCount++;
  }
  regions.set(key, cv);
  // 古いものから捨てる（絵の分のメモリも返す）
  while (regionCount > regionKeep || regions.size > regionKeep * 4) {
    const [k, c] = regions.entries().next().value as [string, HTMLCanvasElement | null];
    regions.delete(k);
    if (c) { c.width = c.height = 0; regionCount--; }
  }
  return cv;
}

const subColor = (P: Palette, s: string) => {
  if (s === 'e') return P.hi;
  let c = subColors.get(s);
  if (!c) { try { c = sub(s).color; } catch { c = '#888888'; } subColors.set(s, c); }
  return c;
};

// ---- 集計（毎コマ数え直さない）----
let railCache: { w: World; rev: number; geo: Int32Array } | null = null;
/** 敷いた線路を（x, y, つながり）の並びにしておく。線路が変わるまで作り直さない */
function railGeo(w: World): Int32Array {
  if (railCache && railCache.w === w && railCache.rev === w.railRev) return railCache.geo;
  const geo = new Int32Array(w.rails.size * 3);
  let i = 0;
  for (const [k, m] of w.rails) { const c = k.indexOf(','); geo[i++] = +k.slice(0, c); geo[i++] = +k.slice(c + 1); geo[i++] = m; }
  railCache = { w, rev: w.railRev, geo };
  return geo;
}
let spotMemo: { k: string; list: ZoneSpot[] } | null = null;
/** 引いた視野を描いた回数（ためた集計を、止めている間も時々作り直すのに使う） */
let frameNo = 0;
let runCache: { w: World; n: number; at: number; fl: number; runs: Record<BK, number[]> } | null = null;
/**
 * ベルトの直線（世界の座標 [x0, y0, x1, y1] の並び、中身の状態ごと）。同じ向き・同じ状態のベルトがまっすぐ続く所は 1 本にまとめる。
 * 始まりは、後ろから流れ込むなら入口の縁、横から曲がって入るならマスの中心（曲がる前の線がそこまで来る）。
 * 終わりは、先に何かあればそのマスの中心（曲がり角や装置とつながる）、なければ出口の縁。
 * 設備の数が変わるか、30 コマたつまで作り直さない
 */
function beltRuns(w: World, fl: number): Record<BK, number[]> {
  if (runCache && runCache.w === w && runCache.n === w.ents.size && runCache.fl === fl && frameNo - runCache.at < 30) return runCache.runs;
  const off = fl * FLOOR_DY, runs: Record<BK, number[]> = { solid: [], liquid: [], gas: [], none: [] };
  const same = (e: Ent, x: number, y: number) => { const n = at(w, x, y); return !!n && n.kind === 'belt' && n.dir === e.dir && n.st === e.st; };
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || floorOf(e.y) !== fl || same(e, e.x - DX[e.dir], e.y - DY[e.dir])) continue;
    const dx = DX[e.dir], dy = DY[e.dir];
    let x = e.x, y = e.y, n = 0;
    while (n++ < 100000 && same(e, x + dx, y + dy)) { x += dx; y += dy; }
    const fin = inflow(w, e.x, e.y, e.dir), back = fin === null || fin === e.dir ? 0.5 : 0, ahead = at(w, x + dx, y + dy) ? 1 : 0.5;
    runs[e.st ?? 'none'].push(e.x + 0.5 - dx * back, e.y - off + 0.5 - dy * back, x + 0.5 + dx * ahead, y - off + 0.5 + dy * ahead);
  }
  runCache = { w, n: w.ents.size, at: frameNo, fl, runs };
  return runs;
}
/**
 * 稼働率の重ね表示の流れの線：太さの段（0〜4）ごとの帯（x0, y0, x1, y1 のマスの座標）。同じ向きに続くベルトの列をたどり、段が同じ所を 1 本にまとめる。
 * 何万ものベルトを 1 本ずつ線で引くと重いので、帯にして四角で塗る。毎分の数はベルトごとに計るので、となりどうしでも少し揺れる。
 * 段は、列の中の前・自分・後の 3 つの真ん中の値で決める（1 マスだけの揺れでは帯を切らない。流れが本当に変わる所では、そのまま切れる）。
 * 毎分の数は遊んだ時間の 2 秒ごとにしか変わらないので、2 秒ごとに作り直す。まだ計り始めたばかりのベルト（数が出るまで 1 秒）があるときは、1 秒後に作り直す。
 * 止めているあいだも、置き換えたベルトが分かるよう、2 秒ほど（120 コマ）で作り直す
 */
let flowCache: { w: World; n: number; at: number; fl: number; due: number; groups: number[][] } | null = null;
function flowRuns(w: World, fl: number): number[][] {
  const c = flowCache;
  if (c && c.w === w && c.n === w.ents.size && c.fl === fl && w.playMs < c.due && frameNo - c.at < 120) return c.groups;
  const off = fl * FLOOR_DY, groups: number[][] = [[], [], [], [], []];
  // その階のベルトを、位置から番号で引けるようにする（位置は数の鍵。文字の鍵より軽い）
  const pos = (x: number, y: number) => x * 4194304 + y, idx = new Map<number, number>(), list: Ent[] = [], rate: number[] = [];
  let fresh = false;
  for (const e of w.ents.values()) {
    if (e.kind !== 'belt' || floorOf(e.y) !== fl) continue;
    const r = beltRate(w, e);
    idx.set(pos(e.x, e.y), list.length); list.push(e); rate.push(r);
    if (r < 0) fresh = true;
  }
  /** (x, y) にある、向き d のベルトの番号（なければ -1） */
  const belt = (x: number, y: number, d: number) => { const i = idx.get(pos(x, y)); return i !== undefined && list[i].dir === d ? i : -1; };
  const line: number[] = [];
  list.forEach((e, i0) => {
    const d = e.dir, dx = DX[d], dy = DY[d];
    // 列の先頭からだけたどる
    if (belt(e.x - dx, e.y - dy, d) >= 0) return;
    line.length = 0;
    for (let x = e.x, y = e.y, i = i0; i >= 0; x += dx, y += dy, i = belt(x, y, d)) line.push(i);
    let from = 0, k0 = -1;
    for (let j = 0; j <= line.length; j++) {
      let k = -1;
      if (j < line.length) {
        const a = rate[line[Math.max(0, j - 1)]], b = rate[line[j]], q = rate[line[Math.min(line.length - 1, j + 1)]];
        k = flowStep(j === 0 || j === line.length - 1 ? b : Math.max(Math.min(a, b), Math.min(Math.max(a, b), q)));
      }
      if (k === k0) continue;
      if (k0 >= 0) {
        const s = list[line[from]], t = list[line[j - 1]];
        groups[k0].push(s.x + 0.5 - dx * 0.5, s.y - off + 0.5 - dy * 0.5, t.x + 0.5 + dx * 0.5, t.y - off + 0.5 + dy * 0.5);
      }
      from = j; k0 = k;
    }
  });
  flowCache = { w, n: w.ents.size, at: frameNo, fl, due: w.playMs + (fresh ? 1000 : 2000), groups };
  return groups;
}
/**
 * 横に並ぶ 1 マスのものを、帯にまとめる入れ物。add(x, y) を呼ぶと、同じ行で右隣に続くものを 1 本にのばす。
 * out は [x, y, 長さ] の並び。並べ替えはしない（置いた順に右へ続いていればまとまる。そうでなければ、短い帯が増えるだけ）
 */
class Strips {
  out: number[] = [];
  private open = new Map<number, number>();
  add(x: number, y: number) {
    const i = this.open.get(y);
    if (i !== undefined && this.out[i] + this.out[i + 2] === x) this.out[i + 2]++;
    else { this.open.set(y, this.out.length); this.out.push(x, y, 1); }
  }
}
/** 設備の多い工場（この数を超える）では、引いた視野の装置を帯にまとめて塗る */
const CROWD_ENTS = 6000;
/**
 * 装置の四角を、機種の色ごとに帯にまとめたもの（1 マスの装置は横につなげ、2×2 の装置は 1 台ずつ）。
 * 採取機の畑では、何千台を 1 台ずつ塗る代わりに、行ごとに 1 回ですむ。置く・消すが起きるまで覚えておく
 */
let stripCache: { w: World; rev: number; fl: number; soft: string; m: Map<string, { strips: number[]; boxes: number[] }> } | null = null;
function machineStrips(w: World, fl: number, P: Palette): Map<string, { strips: number[]; boxes: number[] }> | null {
  const rev = (w.ents as { rev?: number }).rev;
  if (rev === undefined) return null;
  if (stripCache && stripCache.w === w && stripCache.rev === rev && stripCache.fl === fl && stripCache.soft === P.soft) return stripCache.m;
  const tmp = new Map<string, { s: Strips; boxes: number[] }>(), off = fl * FLOOR_DY;
  for (const e of w.ents.values()) {
    const k = e.kind;
    if (k === 'part' || k === 'hub' || k === 'belt' || k === 'bridge' || floorOf(e.y) !== fl) continue;
    const col = MACHINES[k as keyof typeof MACHINES]?.color ?? P.soft;
    let g = tmp.get(col);
    if (!g) tmp.set(col, (g = { s: new Strips(), boxes: [] }));
    if (sizeOf(e) === 1) g.s.add(e.x, e.y - off); else g.boxes.push(e.x, e.y - off, sizeOf(e));
  }
  const m = new Map<string, { strips: number[]; boxes: number[] }>();
  for (const [c, g] of tmp) m.set(c, { strips: g.s.out, boxes: g.boxes });
  stripCache = { w, rev, fl, soft: P.soft, m };
  return m;
}
let distCache: { w: World; tick: number; n: number; list: District[] } | null = null;
function districts(w: World): District[] {
  if (!distCache || distCache.w !== w || Math.abs(w.tick - distCache.tick) > 90 || distCache.n !== w.ents.size) distCache = { w, tick: w.tick, n: w.ents.size, list: districtsOf(w) };
  return distCache.list;
}
/** 採取機が置いてある資源地（中心の位置で見分ける）。設備が変わるまで数え直さない */
let usedCache: { w: World; n: number; tick: number; set: Set<string> } | null = null;
function usedSpots(w: World): Set<string> {
  if (usedCache && usedCache.w === w && usedCache.n === w.ents.size && Math.abs(w.tick - usedCache.tick) < 300) return usedCache.set;
  const set = new Set<string>();
  for (const e of w.ents.values()) {
    if (e.kind !== 'extractor' || floorOf(e.y)) continue;
    for (const s of zoneSpots(e.x - 6, e.y - 6, e.x + 6, e.y + 6)) {
      if (Math.hypot(e.x + 0.5 - s.cx, e.y + 0.5 - s.cy) <= s.r * 1.3 + 0.5) set.add(`${s.cx},${s.cy}`);
    }
  }
  usedCache = { w, n: w.ents.size, tick: w.tick, set };
  return set;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 資源地の札（産出物の絵柄・名前・産出物）。同じ資源地は何か所にも出てくるので、見た目と大きさごとに 1 枚描いてためておく。
 * goal：いまの指令の資源地（赤い縁の札にする）
 */
function zoneLabel(P: Palette, zn: Zone, fs: number, dpr: number, goal: boolean) {
  const key = `${P.key}:${zn}:${fs}:${dpr}:${goal ? 1 : 0}`;
  let l = labels.get(key);
  if (l) return l;
  const info = ZONES[zn], res = label(info.resource), fs2 = Math.round(fs * 0.74), ico = Math.round(fs * 1.7);
  const m = document.createElement('canvas').getContext('2d')!;
  const font = P.skin === 'punk' ? FONT_UI : P.font;
  m.font = `700 ${fs}px ${font}`; const w1 = m.measureText(info.name).width;
  m.font = `700 ${fs2}px ${FONT_UI}`; const w2 = m.measureText(goal ? `${res}　いまの指令` : res).width;
  const pad = goal ? 8 : 4, w = Math.ceil(ico + 5 + Math.max(w1, w2) + pad * 2), h = Math.ceil(Math.max(ico, fs * 1.15 + fs2 * 1.15) + pad * 2);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  if (goal) {
    rr(g, 1.5, 1.5, w - 3, h - 3, 5);
    g.fillStyle = P.plate; g.fill(); g.strokeStyle = P.red; g.lineWidth = 2.5; g.stroke();
  }
  g.drawImage(sprite(info.resource), pad - ico * 0.08, (h - ico) / 2 - ico * 0.04, ico * 1.16, ico * 1.16);
  const tx = pad + ico + 5, y1 = h / 2 - fs2 * 0.6 + 1, y2 = h / 2 + fs * 0.62;
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = `700 ${fs}px ${font}`;
  if (!goal) { g.strokeStyle = P.paper; g.lineWidth = Math.max(3, fs * 0.32); g.strokeText(info.name, tx, y1); }
  g.fillStyle = P.ink; g.fillText(info.name, tx, y1);
  g.font = `700 ${fs2}px ${FONT_UI}`;
  if (!goal) { g.lineWidth = Math.max(3, fs2 * 0.34); g.strokeText(res, tx, y2); }
  g.fillStyle = P.soft; g.fillText(res, tx, y2);
  if (goal) { g.fillStyle = P.red; g.fillText('いまの指令', tx + m.measureText(`${res}　`).width, y2); }
  l = { cv, w, h };
  labels.set(key, l);
  return l;
}

const plates = new Map<string, { cv: HTMLCanvasElement; w: number; h: number }>();
onThemeChange(() => plates.clear());
/** 区画の生産の札（産出物の絵柄・物質・毎分の数・台数）。文字が変わるまで、描いた絵を使い回す */
function districtPlate(P: Palette, d: District, dpr: number) {
  const tx = `${label(d.s)}　${d.perMin >= 10 ? Math.round(d.perMin) : d.perMin.toFixed(1)}/分　${d.n}台`, ok = d.perMin > 0;
  const key = `${P.key}:${d.s}:${tx}:${ok ? 1 : 0}:${dpr}`;
  let l = plates.get(key);
  if (l) return l;
  const punk = P.skin === 'punk', m = document.createElement('canvas').getContext('2d')!;
  m.font = `700 12.5px ${FONT_UI}`;
  const w = Math.ceil(m.measureText(tx).width + 32), h = 22, cv = document.createElement('canvas');
  cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  rr(g, 1, 1, w - 2, h - 2, punk ? 0 : 5);
  g.fillStyle = punk ? '#0b0d10' : P.plate; g.fill();
  g.strokeStyle = ok ? P.hi : P.red; g.lineWidth = 2; g.stroke();
  g.drawImage(sprite(d.s), 3, 2, 18, 18);
  g.font = m.font; g.fillStyle = punk ? '#eef0ea' : P.ink; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(tx, 24, h / 2 + 0.5);
  l = { cv, w, h };
  if (plates.size > 400) plates.clear();
  plates.set(key, l);
  return l;
}

/** 文字に紙の色の縁取りをつけて書く（地図の上でも読めるように） */
function haloText(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, fill: string, lw: number) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = P.paper; ctx.lineWidth = lw; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

/** 1 マスが cam.z ピクセルの引いた視野を描く */
export function drawFar(ctx: CanvasRenderingContext2D, cw: number, ch: number, w: World, cam: Camera, t: number, view: View, P: Palette) {
  const z = cam.z, light = P.name === 'light', ink = edgeOf(P), rail = railOf(P);
  // 装置の縁取りは主線の色（近くの絵の、引いたときの装置と同じ）。色覚の補助と、稼働率の色分け（統計の切り替え）
  const line = P.skin === 'punk' ? '#0b0d10' : P.ink, cv = cvdOn(), heat = heatOn();
  frameNo++;
  const fl = view.floor || 0, off = fl * FLOOR_DY;
  const sx = (x: number) => (x - cam.x) * z + cw / 2, sy = (y: number) => (y - cam.y) * z + ch / 2;
  const wx0 = cam.x - cw / 2 / z, wy0 = cam.y - ch / 2 / z, wx1 = cam.x + cw / 2 / z, wy1 = cam.y + ch / 2 / z;
  const dpr = Math.max(1, Math.min(3, Math.round((ctx.getTransform().a || 1) * 2) / 2));
  const G = view.fx?.glow ?? null;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);

  // ---- 地面：紙 → 資源地（描きためた区画の絵）→ 方眼 ----
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, cw, ch);
  // 札を出す資源地（見えているもの）。見えている範囲（マス）が変わらないうちは、探し直さない
  const vk = `${Math.floor(wx0)},${Math.floor(wy0)},${Math.ceil(wx1)},${Math.ceil(wy1)}`;
  if (!spotMemo || spotMemo.k !== vk) spotMemo = { k: vk, list: zoneSpots(Math.floor(wx0) - 6, Math.floor(wy0) - 6, Math.ceil(wx1) + 6, Math.ceil(wy1) + 6) };
  const vis = spotMemo.list.filter((s) => {
    const R = (s.r * 1.25 + 0.6) * z, X = sx(s.cx), Y = sy(s.cy);
    return X > -R && X < cw + R && Y > -R && Y < ch + R;
  });
  // 区画の絵の細かさ：画面の 1 マスの画素数に近いもの（2・4・8 ピクセル）。拡大しても 2 倍までにおさまる
  const tp = z * dpr, ppt = tp <= 3 ? 2 : tp <= 6 ? 4 : 8, span = REG_PX / ppt;
  // うんと引くと、遠くの資源地が細かい色の散らばりになって工場が埋もれる。少し紙になじませる
  ctx.globalAlpha = Math.min(1, 0.72 + 0.28 * Math.max(0, (z - 2) / 4));
  ctx.imageSmoothingEnabled = true;
  const until = performance.now() + 6;
  regionKeep = Math.max(REG_MAX, 2 * (Math.floor(wx1 / span) - Math.floor(wx0 / span) + 1) * (Math.floor(wy1 / span) - Math.floor(wy0 / span) + 1));
  // 区画の境は、画面の画素にそろえる（となりの絵とのあいだに、すき間の線が出ないように）
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  for (let ry = Math.floor(wy0 / span); ry <= Math.floor(wy1 / span); ry++) for (let rx = Math.floor(wx0 / span); rx <= Math.floor(wx1 / span); rx++) {
    const X0 = snap(sx(rx * span)), Y0 = snap(sy(ry * span)), X1 = snap(sx((rx + 1) * span)), Y1 = snap(sy((ry + 1) * span));
    let img = regionImage(P, rx, ry, ppt, performance.now() < until);
    if (img === undefined) {
      // 1 コマで作る数には限りがある。まだ作っていない区画は、ひとまず形をじかに描く（次のコマ以降で作る）
      ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
      zonePaint(ctx, P, regionSpots(rx * span, ry * span, span), z, sx(0), sy(0));
      ctx.restore();
      img = null;
    }
    if (img) ctx.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0);
  }
  ctx.globalAlpha = 1;
  // 方眼：5・10・50・100 … マスごとの線。細かい線は、引くにつれて薄れて消える。太い区切りは、何段にも重なって濃くなる
  ctx.lineWidth = 1;
  for (const s of [5, 10, 50, 100, 500, 1000]) {
    const px = s * z;
    if (px < 8) continue;
    ctx.globalAlpha = Math.min(1, (px - 8) / 18) * (s >= 50 ? 0.9 : 0.75);
    ctx.strokeStyle = s >= 50 ? P.gridBold : P.grid;
    ctx.beginPath();
    for (let x = Math.ceil(wx0 / s) * s; x <= wx1; x += s) { const X = Math.round(sx(x)) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, ch); }
    for (let y = Math.ceil(wy0 / s) * s; y <= wy1; y += s) { const Y = Math.round(sy(y)) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(cw, Y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (off) {
    // 2 階：地面を床板で覆う（近くの絵と同じ色）
    ctx.fillStyle = floorCover(P);
    ctx.fillRect(0, 0, cw, ch);
  }

  // ---- 設備：見えるものを、色ごとの束に分ける ----
  const x0 = Math.floor(wx0) - 2, x1 = Math.ceil(wx1) + 2, y0 = Math.floor(wy0) - 2, y1 = Math.ceil(wy1) + 2;
  const runs = beltRuns(w, fl), bridges: number[] = [];
  const rects = new Map<string, number[]>();
  const items = new Map<string, number[]>();
  const bad: number[] = [], busy: number[] = [], jams: number[] = [], below: number[] = [], stall: number[] = [];
  /** 稼働率の色（5 % ごと。このコマで使う分だけ作る） */
  const heatCols: string[] = [];
  const showItems = z >= 4;
  // 設備の多い工場：装置の四角は、帯にまとめたもの（覚えてある）を塗る。止まっている・動いている印も、横に続く所は 1 本の線にまとめる。
  // 稼働率の色分けのあいだは、装置ごとに色が違うので、これまでどおり 1 台ずつ
  const strips = !heat && w.ents.size > CROWD_ENTS ? machineStrips(w, fl, P) : null;
  const badS = strips ? new Strips() : null, busyS = strips ? new Strips() : null;
  for (const e of w.ents.values()) {
    const k = e.kind;
    if (k === 'part' || k === 'hub') continue;
    const f = floorOf(e.y);
    if (f !== fl) {
      // 2 階を見ているときは、1 階の設備を薄い影として透かす
      if (fl && !f && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) below.push(e.x, e.y, sizeOf(e));
      continue;
    }
    const ey = e.y - off;
    if (e.x < x0 || e.x > x1 || ey < y0 || ey > y1) continue;
    if (k === 'belt' || k === 'bridge') {
      const cx = e.x + 0.5, cy = ey + 0.5;
      if (k === 'bridge') bridges.push(e.x, ey);
      const it = e.item ?? e.items?.find((q) => !!q);
      if (it) {
        if (showItems) {
          const c = subColor(P, it.s);
          let list = items.get(c);
          if (!list) items.set(c, (list = []));
          const d = k === 'belt' ? e.dir : (it.d ?? 0);
          list.push(cx + DX[d] * (it.p - 0.5), cy + DY[d] * (it.p - 0.5));
        }
        if (view.stats && (it.w || 0) >= 0.3) jams.push(e.x, ey, Math.min(1, (it.w || 0) / 2));
      }
      continue;
    }
    const sz = sizeOf(e);
    let col = MACHINES[k as keyof typeof MACHINES]?.color ?? P.soft;
    if (heat && ((isMachine(k) && !!e.recipe) || k === 'extractor')) {
      // 稼働率の色分け：近くの絵（mapfx.ts）と同じ色で、機種の色の代わりに塗る（色は 5 % ごとにまとめる）
      const b = Math.round(Math.max(0, Math.min(1, e.u ?? (k === 'extractor' ? 1 : 0))) * 20);
      col = heatCols[b] ??= heatColor(b / 20, light, cv, 1);
      if (cv && b / 20 < STALL) stall.push(e.x, ey, sz);
    }
    if (!strips) {
      let list = rects.get(col);
      if (!list) rects.set(col, (list = []));
      list.push(e.x, ey, sz);
    }
    const needs = (isMachine(k) && !e.recipe) || (k === 'analyzer' && !e.test) || (isSep(k) && !sepReady(k, e.test)) || ((k === 'sampler' || k === 'depot') && !e.sub);
    if (needs || (e.stuck || 0) > 2.5 || !!e.bad) { if (badS && sz === 1) badS.add(e.x, ey); else bad.push(e.x + sz / 2, ey + sz / 2, sz); }
    else if (e.busy) { if (busyS && sz === 1) busyS.add(e.x, ey); else busy.push(e.x + sz / 2, ey + sz / 2, sz); }
  }
  if (below.length) {
    ctx.fillStyle = light ? 'rgba(60,70,84,0.22)' : 'rgba(200,210,225,0.18)';
    ctx.beginPath();
    for (let i = 0; i < below.length; i += 3) ctx.rect(sx(below[i]), sy(below[i + 1]), below[i + 2] * z, below[i + 2] * z);
    ctx.fill();
  }

  // ベルト：まっすぐ続く所を 1 本の帯にまとめ、四角で塗る（線を引くより、ずっと軽い）。
  // 寄っているうちは近くの絵と同じ縁取りの管、引くと、主線の色に寄せた細い 1 本の線になる
  const edgeK = Math.min(1, Math.max(0, (z - 2.5) / 3));
  const strip = (list: number[], half: number) => {
    for (let i = 0; i < list.length; i += 4) {
      const X0 = sx(list[i]), Y0 = sy(list[i + 1]), X1 = sx(list[i + 2]), Y1 = sy(list[i + 3]);
      const L = Math.min(X0, X1) - half, T = Math.min(Y0, Y1) - half, R = Math.max(X0, X1) + half, B = Math.max(Y0, Y1) + half;
      if (R > 0 && B > 0 && L < cw && T < ch) ctx.fillRect(L, T, R - L, B - T);
    }
  };
  // 立体交差は、十字の 2 本
  const cross: number[] = [];
  for (let i = 0; i < bridges.length; i += 2) { const cx = bridges[i] + 0.5, cy = bridges[i + 1] + 0.5; cross.push(cx - 0.5, cy, cx + 0.5, cy, cx, cy - 0.5, cx, cy + 0.5); }
  const lane = (k: BK) => (k === 'none' && cross.length ? runs.none.concat(cross) : runs[k]);
  if (edgeK > 0) {
    ctx.globalAlpha = edgeK; ctx.fillStyle = rimOf(P);
    for (const k of KINDS) strip(lane(k), Math.max(1, z * WIDTH[k]) / 2 + Math.max(1.2, z * 0.045));
    ctx.globalAlpha = 1;
  }
  for (const k of KINDS) {
    const list = lane(k);
    if (!list.length) continue;
    ctx.fillStyle = mix(P.line[k], P.ink, 0.5 * (1 - edgeK));
    strip(list, Math.max(1, z * WIDTH[k]) / 2);
  }
  // 運んでいる物：その物質の色の点
  if (showItems) {
    const r = Math.max(1.2, z * 0.2);
    for (const [c, list] of items) {
      ctx.fillStyle = c; ctx.beginPath();
      for (let i = 0; i < list.length; i += 2) ctx.rect(sx(list[i]) - r, sy(list[i + 1]) - r, r * 2, r * 2);
      ctx.fill();
    }
  }
  // 稼働率の重ね表示のとき：流れの多いベルトほど太い帯（近くの絵の線と同じ色と太さ。端は四角）。
  // 段ごとに 1 つの形にまとめて 1 回で塗る（重なった所が濃くならない）。詰まりの印は、この上に描く
  if (view.stats) {
    const groups = flowRuns(w, fl);
    for (const [pass, col] of [[1, flowEdge(P)], [0, P.hi]] as const) {
      ctx.fillStyle = col; ctx.globalAlpha = pass ? 0.55 : 0.95;
      groups.forEach((g, k) => {
        if (!g.length) return;
        const half = flowWidth(z, k) / 2 + pass;
        ctx.beginPath();
        for (let i = 0; i < g.length; i += 4) {
          const X0 = sx(g[i]), Y0 = sy(g[i + 1]), X1 = sx(g[i + 2]), Y1 = sy(g[i + 3]);
          const L = Math.min(X0, X1) - half, T = Math.min(Y0, Y1) - half, R = Math.max(X0, X1) + half, B = Math.max(Y0, Y1) + half;
          if (R > 0 && B > 0 && L < cw && T < ch) ctx.rect(L, T, R - L, B - T);
        }
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  }
  // 詰まり（稼働率の重ね表示のとき）：待っている荷のマスを、黄 → 赤で塗る。
  // 色覚の補助のときは、形でも分ける（待ち始めは枠だけ、詰まりきったら塗りつぶす。近くの絵の点線の枠と斜線の網にあたる）
  if (jams.length) {
    // 流れの線（スキンによっては黄や橙）の上でも黄の印が埋もれないよう、外側に暗い細い縁をつける
    const s = Math.max(2, z);
    ctx.strokeStyle = 'rgba(20,18,16,0.7)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < jams.length; i += 3) ctx.rect(sx(jams[i]) - 0.5, sy(jams[i + 1]) - 0.5, s + 1, s + 1);
    ctx.stroke();
    for (const hot of [false, true]) {
      const hollow = cv && !hot, lw = Math.max(1, Math.min(2, z * 0.2));
      ctx.beginPath();
      for (let i = 0; i < jams.length; i += 3) if ((jams[i + 2] >= 1) === hot) {
        if (hollow) ctx.rect(sx(jams[i]) + lw / 2, sy(jams[i + 1]) + lw / 2, s - lw, s - lw);
        else ctx.rect(sx(jams[i]), sy(jams[i + 1]), s, s);
      }
      if (hollow) { ctx.strokeStyle = 'rgba(235,165,35,0.95)'; ctx.lineWidth = lw; ctx.stroke(); }
      else { ctx.fillStyle = hot ? 'rgba(214,48,49,0.75)' : 'rgba(235,165,35,0.7)'; ctx.fill(); }
    }
  }

  // 装置：機種の色の四角（色ごとに続けて塗る）。寄っているうちは、ひと回り大きい主線の色の四角を下に敷いて縁取りにする
  const pad = z >= 3 ? z * 0.08 : 0;
  if (z >= 2.5) {
    const lw = Math.max(1, z * 0.07);
    ctx.globalAlpha = Math.min(1, z - 2.5); ctx.fillStyle = line;
    for (const list of rects.values()) for (let i = 0; i < list.length; i += 3) { const s = Math.max(1, list[i + 2] * z - pad * 2); ctx.fillRect(sx(list[i]) + pad - lw, sy(list[i + 1]) + pad - lw, s + lw * 2, s + lw * 2); }
    ctx.globalAlpha = 1;
  }
  for (const [c, list] of rects) {
    ctx.fillStyle = c;
    for (let i = 0; i < list.length; i += 3) { const s = Math.max(1, list[i + 2] * z - pad * 2); ctx.fillRect(sx(list[i]) + pad, sy(list[i + 1]) + pad, s, s); }
  }
  if (strips) {
    // 帯：見える所だけに切りつめて、縁取り（ひと回り大きい主線の色）→ 機種の色。2×2 の装置は 1 台ずつ
    const lw = Math.max(1, z * 0.07), edge = z >= 2.5;
    const each = (fn: (X: number, Y: number, wd: number, ht: number) => void, g: { strips: number[]; boxes: number[] }) => {
      const a = g.strips, b = g.boxes;
      for (let i = 0; i < a.length; i += 3) {
        const y = a[i + 1];
        if (y < y0 || y > y1) continue;
        const xa = Math.max(a[i], x0), xb = Math.min(a[i] + a[i + 2], x1 + 1);
        if (xb > xa) fn(sx(xa) + pad, sy(y) + pad, Math.max(1, (xb - xa) * z - pad * 2), Math.max(1, z - pad * 2));
      }
      for (let i = 0; i < b.length; i += 3) {
        if (b[i] < x0 || b[i] > x1 || b[i + 1] < y0 || b[i + 1] > y1) continue;
        const sd = Math.max(1, b[i + 2] * z - pad * 2);
        fn(sx(b[i]) + pad, sy(b[i + 1]) + pad, sd, sd);
      }
    };
    if (edge) {
      ctx.globalAlpha = Math.min(1, z - 2.5); ctx.fillStyle = line;
      for (const g of strips.values()) each((X, Y, wd, ht) => ctx.fillRect(X - lw, Y - lw, wd + lw * 2, ht + lw * 2), g);
      ctx.globalAlpha = 1;
    }
    for (const [c, g] of strips) { ctx.fillStyle = c; each((X, Y, wd, ht) => ctx.fillRect(X, Y, wd, ht), g); }
    // 状態の印：横に 3 台以上続く所は 1 本の線（止まっている＝赤、動いている＝緑）。ばらばらの所は、これまでどおりの輪と点
    const lines = (S: Strips, into: number[], color: string, wd: number) => {
      const a = S.out;
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < a.length; i += 3) {
        const n = a[i + 2];
        if (n < 3) { for (let q = 0; q < n; q++) into.push(a[i] + q + 0.5, a[i + 1] + 0.5, 1); continue; }
        const Y = sy(a[i + 1] + 0.5);
        ctx.moveTo(sx(a[i] + 0.3), Y); ctx.lineTo(sx(a[i] + n - 0.3), Y); any = true;
      }
      if (any) { ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.lineCap = 'butt'; ctx.stroke(); }
    };
    if (busyS && z >= 3) lines(busyS, busy, cv ? CVD_GO : '#58e06a', Math.max(1.2, z * 0.28));
    if (badS) lines(badS, bad, P.red, Math.max(1.5, z * 0.3));
  }
  // 色覚の補助のとき、稼働率の色分けで止まりがちの装置には、斜めの線を 1 本
  if (stall.length && z >= 2.5) {
    ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, z * 0.09); ctx.beginPath();
    for (let i = 0; i < stall.length; i += 3) { const s = stall[i + 2] * z - pad * 2, X = sx(stall[i]) + pad, Y = sy(stall[i + 1]) + pad; ctx.moveTo(X, Y); ctx.lineTo(X + s, Y + s); }
    ctx.stroke();
  }
  // 状態：止まっている装置（設定がない・出口が詰まった・使わない物質が来た）は赤い輪。寄っているうちは、動いている装置に緑の点
  // （色覚の補助のときは、近くの絵と同じく青い丸）
  if (z >= 3 && busy.length) {
    ctx.fillStyle = cv ? CVD_GO : '#58e06a'; ctx.beginPath();
    for (let i = 0; i < busy.length; i += 3) {
      const s = busy[i + 2] * z * 0.28, X = sx(busy[i]), Y = sy(busy[i + 1]);
      if (cv) { ctx.moveTo(X + s * 0.6, Y); ctx.arc(X, Y, s * 0.6, 0, Math.PI * 2); } else ctx.rect(X - s / 2, Y - s / 2, s, s);
    }
    ctx.fill();
    // 稼働率の色分けのときは、よく動く装置が点と同じ色で塗られるので、点を縁取って見分ける
    if (heat) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke(); }
  }
  if (bad.length) {
    ctx.strokeStyle = P.red; ctx.lineWidth = z < 3 ? 1.5 : 2;
    ctx.beginPath();
    for (let i = 0; i < bad.length; i += 3) { const X = sx(bad[i]), Y = sy(bad[i + 1]), r = Math.max(3.5, bad[i + 2] * z * 0.72); ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, Math.PI * 2); }
    ctx.stroke();
  }

  // ---- 線路の網：敷いた線路、積む駅から降ろす駅までの道筋（番線の色）、列車 ----
  const trains: number[] = [];
  if (!off) {
    if (w.rails.size) {
      // まっすぐ続く区間ごとに 1 本（1 万マスでも、区間の数だけ）
      const runs = railRuns(w), p = new Path2D();
      for (let i = 0; i < runs.length; i += 4) {
        const ax = runs[i], ay = runs[i + 1], bx = runs[i + 2], by = runs[i + 3];
        if (bx < x0 || ax > x1 + 1 || by < y0 || ay > y1 + 1) continue;
        p.moveTo(sx(ax), sy(ay)); p.lineTo(sx(bx), sy(by));
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = rail.ink; ctx.lineWidth = Math.max(2, z * 0.26); ctx.stroke(p);
      ctx.strokeStyle = rail.core; ctx.lineWidth = Math.max(0.8, z * 0.1); ctx.stroke(p);
    }
    // 敷いた線路の上の番線の色は、道筋の重なりを 1 回にまとめて描く（駅が多いと、道筋は積む駅 × 降ろす駅の数だけある）
    ctx.lineCap = 'butt'; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.2, z * 0.1);
    for (const L of lineRuns(w)) {
      ctx.strokeStyle = lineColor(L.ch); ctx.beginPath();
      for (const a of [L.runs, L.stubs]) for (let i = 0; i < a.length; i += 4) {
        if (Math.max(a[i], a[i + 2]) < x0 || Math.min(a[i], a[i + 2]) > x1 + 1 || Math.max(a[i + 1], a[i + 3]) < y0 || Math.min(a[i + 1], a[i + 3]) > y1 + 1) continue;
        ctx.moveTo(sx(a[i]), sy(a[i + 1])); ctx.lineTo(sx(a[i + 2]), sy(a[i + 3]));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const sver = stationVer(w);
    for (const e of stationsOf(w)) {
      if (e.role !== 'in') continue;
      const ds = stationDests(w, e, sver);
      if (!ds.list.length) continue;
      // 自動の仮線路（線路でつながっていない駅）は点線。行き先が多いときは、近い 3 か所だけ描く
      if (!ds.laid) {
        ctx.strokeStyle = lineColor(e.ch || 1); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(1.5, z * 0.14); ctx.setLineDash([Math.max(4, z * 0.6), Math.max(3, z * 0.4)]);
        for (let k = 0; k < ds.list.length && k < 3; k++) {
          const d = ds.list[k];
          if (Math.max(e.x, d.x) + 2 < x0 || Math.min(e.x, d.x) > x1 + 1 || Math.max(e.y, d.y) + 2 < y0 || Math.min(e.y, d.y) > y1 + 1) continue;
          const pts = railOf2(w, e, d)?.pts;
          if (!pts) continue;
          ctx.beginPath();
          pts.forEach((q, i) => (i ? ctx.lineTo(sx(q[0]), sy(q[1])) : ctx.moveTo(sx(q[0]), sy(q[1]))));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      // 列車：道のりに沿った位置に、番線の色の点
      for (let k = -1, xt = e.xtr, n = xt ? xt.length : 0; k < n; k++) {
        const tr = k < 0 ? e.tr : xt![k];
        if (!tr) continue;
        trainAt(w, e, tr);
        trains.push(TRAIN.x, TRAIN.y, e.ch || 1, tr.held ? 1 : 0);
      }
    }
    // 列車の点は、番線の色ごと・縁の色ごとにまとめて塗る（千本あっても、塗るのは数回）
    {
      const r = Math.max(2.6, z * 0.42), byCh = new Map<number, number[]>();
      for (let i = 0; i < trains.length; i += 4) {
        const X = sx(trains[i]), Y = sy(trains[i + 1]);
        if (X < -r || Y < -r || X > cw + r || Y > ch + r) continue;
        let l = byCh.get(trains[i + 2]);
        if (!l) byCh.set(trains[i + 2], (l = []));
        l.push(X, Y, trains[i + 3]);
      }
      const dots = (l: number[], held: number) => { ctx.beginPath(); for (let i = 0; i < l.length; i += 3) if (held < 0 || l[i + 2] === held) { ctx.moveTo(l[i] + r, l[i + 1]); ctx.arc(l[i], l[i + 1], r, 0, Math.PI * 2); } };
      ctx.lineWidth = 1.5;
      for (const [c, l] of byCh) {
        dots(l, -1); ctx.fillStyle = lineColor(c); ctx.fill();
        dots(l, 0); ctx.strokeStyle = rail.ink; ctx.stroke();
        dots(l, 1); ctx.strokeStyle = P.red; ctx.stroke();
      }
    }
  }

  // ---- 納品所：小さく見えても見落とさない、太い印 ----
  const hr = hubRect(w.hubSize), hcx = sx(hr.x + hr.s / 2), hcy = sy(hr.y + hr.s / 2);
  if (!off) {
    // 研究所の納品所は、近くの絵と同じく青緑の炉心（赤い印と赤い光にしない）
    const R = Math.max(hr.s * z / 2, 8), lab = P.skin === 'lab', glowRgb = lab ? P.glow : '255,70,40';
    ctx.lineJoin = 'miter';
    rr(ctx, hcx - R - 3, hcy - R - 3, R * 2 + 6, R * 2 + 6, R * 0.35 + 2); ctx.fillStyle = P.paper; ctx.fill();
    rr(ctx, hcx - R, hcy - R, R * 2, R * 2, R * 0.3); ctx.fillStyle = lab ? P.hi : P.red; ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
    const r2 = R * 0.42;
    ctx.fillStyle = light ? '#ffffff' : lab ? P.paper : P.hi; ctx.fillRect(hcx - r2 / 2, hcy - r2 / 2, r2, r2);
    if (G) {
      const r3 = Math.max(hr.s * z * 1.1, 26), g = G.createRadialGradient(hcx, hcy, 0, hcx, hcy, r3);
      g.addColorStop(0, `rgba(${glowRgb},${0.45 + 0.08 * Math.sin(t * 2.3)})`); g.addColorStop(1, `rgba(${glowRgb},0)`);
      G.fillStyle = g; G.fillRect(hcx - r3, hcy - r3, r3 * 2, r3 * 2);
    }
  }
  if (G) {
    // 光の層：動いている装置と列車の灯りだけ（1 台ずつのぼかしは描かない。合成段がまとめてぼかす）
    if (busy.length) {
      G.fillStyle = `rgba(${P.glow},0.5)`; G.beginPath();
      for (let i = 0; i < busy.length; i += 3) { const s = Math.max(2, busy[i + 2] * z); G.rect(sx(busy[i]) - s / 2, sy(busy[i + 1]) - s / 2, s, s); }
      G.fill();
    }
    if (trains.length) {
      G.fillStyle = 'rgba(255,236,180,0.7)'; G.beginPath();
      for (let i = 0; i < trains.length; i += 4) { const r = Math.max(2.5, z * 0.5); G.rect(sx(trains[i]) - r, sy(trains[i + 1]) - r, r * 2, r * 2); }
      G.fill();
    }
  }

  // ---- 区画：近くに固まった装置のまとまりを、点線で囲む ----
  const dists = districts(w).filter((d) => floorOf(d.y0) === fl && !(d.x1 < wx0 || d.x0 > wx1 || d.y1 - off < wy0 || d.y0 - off > wy1));
  if (dists.length) {
    ctx.strokeStyle = P.hi; ctx.lineWidth = z < 3 ? 1.5 : 2;
    if (z >= 3) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (const d of dists) ctx.rect(sx(d.x0 - 0.5), sy(d.y0 - off - 0.5), (d.x1 - d.x0 + 1) * z, (d.y1 - d.y0 + 1) * z);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // ---- 選んだもの・範囲・見本 ----
  if (view.selected && view.selected.kind !== 'hub' && floorOf(view.selected.y) === fl) {
    const e = view.selected, s = sizeOf(e), r = Math.max(7, s * z * 0.9);
    ctx.strokeStyle = P.hi; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx(e.x + s / 2), sy(e.y - off + s / 2), r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx(e.x + s / 2), sy(e.y - off + s / 2), r + 2, 0, Math.PI * 2); ctx.stroke();
  }
  if (view.marks?.length) {
    ctx.strokeStyle = P.hi; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const e of view.marks) { if (floorOf(e.y) !== fl) continue; const s = sizeOf(e), X = sx(e.x + s / 2), Y = sy(e.y - off + s / 2), r = Math.max(5, s * z * 0.8); ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, Math.PI * 2); }
    ctx.stroke();
  }
  if (view.area) {
    const [ax0, ay0, ax1, ay1] = view.area;
    ctx.fillStyle = light ? 'rgba(255,225,77,0.2)' : `rgba(${P.glow},0.14)`;
    ctx.fillRect(sx(ax0), sy(ay0 - off), (ax1 - ax0 + 1) * z, (ay1 - ay0 + 1) * z);
    ctx.strokeStyle = P.hi; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 12;
    ctx.strokeRect(sx(ax0), sy(ay0 - off), (ax1 - ax0 + 1) * z, (ay1 - ay0 + 1) * z);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  if (view.ghost) {
    for (const g of view.ghost) {
      ctx.fillStyle = g.ok ? (light ? 'rgba(255,225,77,0.5)' : `rgba(${P.glow},0.35)`) : 'rgba(210,63,58,0.45)';
      ctx.fillRect(sx(g.x), sy(g.y - off), Math.max(2, g.size * z), Math.max(2, g.size * z));
    }
  }
  if (view.rail?.length) {
    ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(2, z * 0.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); view.rail.forEach((q, i) => (i ? ctx.lineTo(sx(q[0]), sy(q[1])) : ctx.moveTo(sx(q[0]), sy(q[1])))); ctx.stroke();
  }

  // ---- いまの指令の資源地：赤い点線の輪で囲む。同じ種類のほかの資源地（そこでも採れる）は、細く薄い輪 ----
  const gz = currentGoal(w)?.zone as Zone | undefined;
  if (gz && !off) {
    const home = ZONES[gz].at;
    ctx.strokeStyle = P.red; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 10;
    for (const main of [false, true]) {
      ctx.lineWidth = main ? 2.5 : 1.5; ctx.globalAlpha = main ? 1 : 0.55;
      ctx.beginPath();
      for (const s of vis) {
        if (s.zone !== gz || (s.cx === home[0] && s.cy === home[1]) !== main) continue;
        const r = (s.r * 1.25 + 0.5) * z + (main ? 7 : 4);
        ctx.moveTo(sx(s.cx) + r, sy(s.cy)); ctx.arc(sx(s.cx), sy(s.cy), r, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  // ---- 札：大事なものから順に置く。先に置いた札と重なる所には置かない ----
  const placed: number[] = [];
  const free = (bx: number, by: number, bw: number, bh: number, m: number) => {
    if (bx < 2 || by < 2 || bx + bw > cw - 2 || by + bh > ch - 2) return false;
    for (let i = 0; i < placed.length; i += 4) if (bx - m < placed[i + 2] && bx + bw + m > placed[i] && by - m < placed[i + 3] && by + bh + m > placed[i + 1]) return false;
    return true;
  };
  const take = (bx: number, by: number, bw: number, bh: number) => { placed.push(bx, by, bx + bw, by + bh); };
  // 設備のある所に、粗い升目（12 ピクセル）で印をつけておく。資源地の札で、工場を隠さないように
  const OC = 12, ow = Math.ceil(cw / OC) + 1, oh = Math.ceil(ch / OC) + 1, occ = new Uint8Array(ow * oh);
  const mark = (X0: number, Y0: number, X1: number, Y1: number) => {
    const a = Math.max(0, Math.floor(X0 / OC)), b = Math.min(ow - 1, Math.floor(X1 / OC)), c = Math.max(0, Math.floor(Y0 / OC)), d = Math.min(oh - 1, Math.floor(Y1 / OC));
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) occ[j * ow + i] = 1;
  };
  const bare = (bx: number, by: number, bw: number, bh: number) => {
    const a = Math.max(0, Math.floor(bx / OC)), b = Math.min(ow - 1, Math.floor((bx + bw) / OC)), c = Math.max(0, Math.floor(by / OC)), d = Math.min(oh - 1, Math.floor((by + bh) / OC));
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) if (occ[j * ow + i]) return false;
    return true;
  };
  // 資源地の中心のある升目（何番目の資源地か ＋ 1）。札を資源地の外へよけるとき、ほかの資源地の上に乗せない（その資源地の札に見えてしまう）
  const cen = new Int32Array(ow * oh);
  vis.forEach((s, i) => { const X = Math.floor(sx(s.cx) / OC), Y = Math.floor(sy(s.cy) / OC); if (X >= 0 && Y >= 0 && X < ow && Y < oh) cen[Y * ow + X] = i + 1; });
  const alone = (bx: number, by: number, bw: number, bh: number, own: number) => {
    const a = Math.max(0, Math.floor((bx + 2) / OC)), b = Math.min(ow - 1, Math.floor((bx + bw - 2) / OC)), c = Math.max(0, Math.floor((by + 2) / OC)), d = Math.min(oh - 1, Math.floor((by + bh - 2) / OC));
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) { const v = cen[j * ow + i]; if (v && v !== own) return false; }
    return true;
  };
  for (const list of rects.values()) for (let i = 0; i < list.length; i += 3) { const X = sx(list[i]), Y = sy(list[i + 1]), s2 = list[i + 2] * z; mark(X, Y, X + s2, Y + s2); }
  for (const k of KINDS) { const list = runs[k]; for (let i = 0; i < list.length; i += 4) { const X0 = sx(list[i]), Y0 = sy(list[i + 1]), X1 = sx(list[i + 2]), Y1 = sy(list[i + 3]); mark(Math.min(X0, X1) - 1, Math.min(Y0, Y1) - 1, Math.max(X0, X1) + 1, Math.max(Y0, Y1) + 1); } }
  // 縮尺の場所は、先に空けておく
  const scale = scaleBar(z);
  take(10, ch - 150, 26 + scale.px + 70, 46);
  // 納品所
  if (!off) {
    const R = Math.max(hr.s * z / 2, 8);
    take(hcx - R - 4, hcy - R - 4, R * 2 + 8, R * 2 + 8);
    mark(hcx - R, hcy - R, hcx + R, hcy + R);
    ctx.font = `800 14px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const tw = ctx.measureText('納品所').width;
    if (free(hcx - tw / 2 - 4, hcy + R + 8, tw + 8, 18, 1)) { take(hcx - tw / 2 - 4, hcy + R + 8, tw + 8, 18); haloText(ctx, P, '納品所', hcx, hcy + R + 8, P.red, 4); }
  }
  // 資源地の札：資源地の真ん中に。設備や、ほかの札とかち合えば、下・上・右・左へよける
  const fs = z < 2.5 ? 13 : z < 5 ? 14 : 16;
  const zoneTag = (s: ZoneSpot, r: number, own: number): boolean => {
    const l = zoneLabel(P, s.zone, r === 0 ? fs + 1 : fs, dpr, r === 0);
    const X = sx(s.cx), Y = sy(s.cy), R = (s.r * 1.25 + 0.5) * z, m = r === 3 ? 10 : 4;
    const cand: [number, number][] = [[X - l.w / 2, Y - l.h / 2]];
    // いまの指令の資源地は、少し離れた所まで空きを探す（離れたら、細い線で資源地とつなぐ）
    for (const d of r === 0 ? [2, 26, 52] : [2]) cand.push([X - l.w / 2, Y + R + d], [X - l.w / 2, Y - R - d - l.h], [X + R + d, Y - l.h / 2], [X - R - d - l.w, Y - l.h / 2]);
    let pos = cand.find(([bx, by], i) => free(bx, by, l.w, l.h, m) && bare(bx, by, l.w, l.h) && (i === 0 || alone(bx, by, l.w, l.h, own)));
    // いまの指令の資源地は、どこにも空きがなくても出す
    if (!pos && r === 0) pos = cand[0];
    if (!pos) return false;
    take(pos[0], pos[1], l.w, l.h);
    const qx = Math.max(pos[0], Math.min(pos[0] + l.w, X)), qy = Math.max(pos[1], Math.min(pos[1] + l.h, Y));
    if (r === 0 && Math.hypot(qx - X, qy - Y) > R + 12) {
      const a = Math.atan2(qy - Y, qx - X);
      ctx.strokeStyle = P.red; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X + Math.cos(a) * (R + 7), Y + Math.sin(a) * (R + 7)); ctx.lineTo(qx, qy); ctx.stroke();
    }
    ctx.drawImage(l.cv, pos[0], pos[1], l.w, l.h);
    return true;
  };
  const used = off ? new Set<string>() : usedSpots(w), core = new Set(Object.values(ZONES).map((zi) => `${zi.at[0]},${zi.at[1]}`));
  const goalAt = gz ? `${ZONES[gz].at[0]},${ZONES[gz].at[1]}` : '';
  const rank = (s: ZoneSpot) => { const k = `${s.cx},${s.cy}`; return k === goalAt ? 0 : used.has(k) ? 1 : core.has(k) ? 2 : 3; };
  const order = off ? [] : vis.map((s, i) => ({ s, own: i + 1, r: rank(s), d: Math.hypot(sx(s.cx) - cw / 2, sy(s.cy) - ch / 2) })).sort((a, b) => a.r - b.r || a.d - b.d);
  // 1. いまの指令の資源地
  for (const o of order) if (o.r === 0) zoneTag(o.s, 0, o.own);
  // 2. 区画ごとの生産の札：毎分の数が多い区画から。区画の上に（空きがなければ下に）
  for (const d of [...dists].sort((a, b) => b.perMin - a.perMin || b.n - a.n)) {
    const l = districtPlate(P, d, dpr), pw = l.w, ph = l.h;
    const mx = sx((d.x0 + d.x1) / 2) - pw / 2, top = sy(d.y0 - off - 0.5) - ph - 3, bottom = sy(d.y1 - off + 0.5) + 3, right = sx(d.x1 + 0.5) + 4;
    const pos = ([[mx, top], [mx, bottom], [right, top], [right, bottom], [mx - pw / 2, top - ph - 2]] as [number, number][]).find(([x, y]) => free(x, y, pw, ph, 3));
    if (!pos) continue;
    take(pos[0], pos[1], pw, ph);
    ctx.drawImage(l.cv, pos[0], pos[1], pw, ph);
  }
  // 3. 採取機を置いた資源地 → 最初の区画の資源地 → ほか（遠くのほかの資源地は、札が多すぎて地図が見えなくならないよう、ある数まで）
  let others = 0, tries = 0;
  for (const o of order) {
    if (o.r === 0) continue;
    if (o.r === 3 && (others >= (z < 3 ? 16 : 28) || tries++ > 90)) break;
    if (zoneTag(o.s, o.r, o.own) && o.r === 3) others++;
  }
  // いまの指令の資源地が画面の外なら、縁に道しるべ
  if (gz && !off) {
    const zn = ZONES[gz], tx = sx(zn.at[0]), ty = sy(zn.at[1]);
    if (tx < 0 || tx > cw || ty < 150 || ty > ch - 170) {
      const px = Math.min(cw - 80, Math.max(80, tx)), py = Math.min(ch - 190, Math.max(170, ty)), ang = Math.atan2(ty - py, tx - px);
      ctx.font = `700 14px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const wd = ctx.measureText(zn.name).width + 22;
      rr(ctx, px - wd / 2, py - 14, wd, 28, 4);
      ctx.fillStyle = P.plate; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = P.ink; ctx.fillText(zn.name, px, py + 1);
      ctx.save(); ctx.translate(px + Math.cos(ang) * (wd / 2 + 10), py + Math.sin(ang) * 25); ctx.rotate(ang);
      ctx.fillStyle = P.red; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---- 縮尺 ----
  {
    const x = 18, y = ch - 118, L = scale.px;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = P.paper; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.lineTo(x + L, y - 6); ctx.stroke();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.lineTo(x + L, y - 6); ctx.stroke();
    ctx.font = `700 13px ${FONT_UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    haloText(ctx, P, `${scale.n} マス`, x + L + 8, y - 2, P.ink, 4);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

  // 夕暮れ：合成段（WebGL）がないときは、ここで地図を暮れさせる
  const dusk = view.dusk ?? 0;
  if (dusk > 0.01 && !G && !off) { ctx.fillStyle = `rgba(14,20,44,${0.36 * dusk})`; ctx.fillRect(0, 0, cw, ch); }
}

/** 縮尺の長さ：1・2・5 の刻みで、画面で 70 ピクセル以上になる、いちばん短いマス数 */
function scaleBar(z: number): { n: number; px: number } {
  for (const n of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) if (n * z >= 70) return { n, px: n * z };
  return { n: 1000, px: 1000 * z };
}
