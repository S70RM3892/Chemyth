import { AIR, plumeOf } from '../content/looks';

/**
 * 廃棄口から出る気体の動き（SPEC2 §6.M M13）。描き方に依らない、計算だけの部品（tests/plumes.test.ts で確かめる）。
 * - 重い・軽いは同じ温度で比べた話：上向きの速さは (28.8 − M)/28.8 に比例（画面の上が「昇る」）。熱い出口は、はじめだけ熱で昇る
 * - 重い気体は、出口の口より 0.3 マス下までしか下りない。そこで止まって横に広がり、低くたまる（北が上の地図で、気体が南へ流れ続けて見えないように）
 * - 無色の気体は輪で示す。水蒸気は出口から 0.3 マスまで輪（無色）で、その先が白い湯気（冷えてできた水滴）
 * - NO は無色で出て、空気中の O₂ と反応して 0.6 秒で赤褐色の NO₂ になる。NH₃ と HCl が同じマスで出会うと白煙の NH₄Cl
 */
export interface Plume {
  sid: string;
  x: number; y: number; vx: number; vy: number;
  /** 出口の口の高さ（マス）。重い気体はここから 0.3 マス下まで */
  y0: number;
  age: number; life: number;
  M: number;
  hot: boolean;
  /** 低くたまって広がっているか */
  pool: boolean;
  /** 塗る色（無色なら null）、白い煙・霧、出口からしばらく輪で描く長さ、空気に触れて変わる色 */
  hex: string | null;
  white?: 'smoke' | 'mist';
  clear?: number;
  air?: string;
}

/** 重い気体が出口から下りる深さの上限（マス） */
export const SINK = 0.3;
/** 煙の数の上限（標準・高・最高） */
export const PLUME_CAP = [60, 120, 200] as const;
/** NO が赤褐色になるまでの時間（秒） */
export const NO_TURN = 0.6;

/** 気体の分子量から、上向きの速さ（マス/秒、画面の上が負）。熱い出口ははじめだけ昇る */
export const plumeVy = (M: number, age: number, hot: boolean) => -0.8 * ((AIR - M) / AIR) + (hot ? -0.6 * Math.exp(-age / 1.5) : 0);

/** 空気に触れて変わる気体（NO → NO₂） */
const AIR_TURN: Record<string, string> = { NO: '#a4532c' };

/** 出口 (x, y) から出る 1 粒。rnd は 0〜1 の乱数 */
export function newPlume(sid: string, x: number, y: number, hot: boolean, rnd: () => number): Plume {
  const p = plumeOf(sid);
  // 白い煙・霧（NH₄Cl・P₄O₁₀ の粒、SO₃ がつくる硫酸の霧）は気体ではなく、空気に乗って漂う細かい粒なので、重さは空気と同じに扱う。湯気は水蒸気として昇る
  const M = p.white && sid !== 'H2O' ? AIR : p.M, light = M < AIR - 2;
  const out: Plume = {
    sid, x: x + (rnd() - 0.5) * 0.2, y, vx: (rnd() - 0.5) * 0.12, vy: 0, y0: y, age: 0,
    life: (2.2 + rnd() * 0.8) * (light ? 0.7 : 1), M, hot, pool: false, hex: p.hex,
  };
  if (p.white) out.white = p.white;
  // 湯気は、出口のすぐ上で白くなってからしばらく漂う（水滴が蒸発して消えるまで）
  if (p.clearTiles !== undefined) { out.clear = p.clearTiles; out.life *= 2; }
  if (AIR_TURN[sid]) out.air = AIR_TURN[sid];
  return out;
}

/** 1 歩進める。消えたら false。calm（動きを減らす）では、出たときの形のまま止める */
export function stepPlume(p: Plume, dt: number, calm = false): boolean {
  p.age += dt;
  if (p.age >= p.life) return false;
  if (calm) return true;
  if (p.pool) {
    // たまった気体は、横に広がりながら、ゆっくり流れるだけ
    p.vy = 0; p.vx *= Math.exp(-dt * 0.5);
  } else {
    p.vy = plumeVy(p.M, p.age, p.hot);
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.y >= p.y0 + SINK && p.vy >= 0) {
    p.y = p.y0 + SINK;
    if (!p.pool) { p.pool = true; p.life *= 1.5; }
  }
  return true;
}

/** 粒の半径（マス）：0.15 から 0.5 へ。低くたまった気体は 2 倍の速さで広がる */
export const plumeRadius = (p: Plume) => { const k = p.age / p.life; return Math.min(1.2, 0.15 + 0.35 * k * (p.pool ? 2 : 1)); };

/**
 * いまの描き方。ring：輪だけ（無色）、fill：塗る（色のある気体・白い煙や霧）。
 * fill の色、塗る濃さの割合（NO は輪から塗りへ 0.6 秒で移る）
 */
export function plumePaint(p: Plume): { ring: boolean; fill: string | null; k: number } {
  if (p.air) { const k = Math.min(1, p.age / NO_TURN); return { ring: k < 1, fill: p.air, k }; }
  if (p.clear !== undefined && p.y0 - p.y < p.clear) return { ring: true, fill: null, k: 0 };
  if (p.hex === null) return { ring: true, fill: null, k: 0 };
  return { ring: false, fill: p.hex, k: 1 };
}

/**
 * 空気の中の反応：4 コマに 1 回、NH₃ と HCl の粒の雲が重なっていれば（中心の距離が、2 つの雲の半径の和より近い）、1 粒ずつ使って白煙の NH₄Cl を 1 つ出す。
 * 1 回に出すのは max 個まで（1 秒に 4 個ほど）。新しい粒を返す（list からは使った粒を消す）
 */
export function plumeReact(list: Plume[], frame: number, rnd: () => number, max = 1): Plume[] {
  if (frame % 4) return [];
  const nh3: number[] = [], hcl: number[] = [];
  list.forEach((p, i) => { if (p.sid === 'NH3') nh3.push(i); else if (p.sid === 'HCl') hcl.push(i); });
  if (!nh3.length || !hcl.length) return [];
  const made: Plume[] = [], used = new Set<number>();
  for (const i of nh3) {
    if (made.length >= max) break;
    const a = list[i];
    const j = hcl.find((k) => !used.has(k) && Math.hypot(list[k].x - a.x, list[k].y - a.y) < plumeRadius(a) + plumeRadius(list[k]));
    if (j === undefined) continue;
    const b = list[j];
    const s = newPlume('NH4Cl', (a.x + b.x) / 2, (a.y + b.y) / 2, false, rnd);
    s.y0 = s.y; s.life = 2.4;
    made.push(s); used.add(i); used.add(j);
  }
  [...used].sort((x, y) => y - x).forEach((i) => list.splice(i, 1));
  return made;
}
