/**
 * 京都の太陽と、見た目ごとの光の枠（SPEC2 D1・L1・L2）。light.ts が光の状態（LightState）を組み立てるときに呼ぶ部品。
 * - 太陽の位置：NOAA の一般式（General Solar Position Calculations）。京都 北緯 35.0116°・東経 135.7681°、日本時間（UTC+9）。
 *   国立天文台の京都の日の出入り・南中の表と、時刻で 2 分、高度で 0.5°、方位で 1° 以内に合う
 * - 空の色と明るさ：skytab.ts の表を、高度で直線に補う（色はガンマ 2 の作業の空間で）
 * - 光の枠：紙の見た目（ノート・魔術）は、机の上の紙を、部屋の南向きの窓から実際の京都の太陽が照らす（朝は左上、夕方は右上）。
 *   工場は北向きの天窓、研究所は天井の灯りなので、光は真上から。どの枠でも光は画面の上半分から来るので、影が下から来たり、
 *   二方向に割れたりしない。地図は北が上のままで、光は地図の方角を名のらない
 * - 昼から夜へ：日なた・窓の空・夜の灯りの重みは、太陽の高度から決める（明るさの比からは決めない。夕方に大きく揺れるため）
 * 時刻は Date（絶対の時刻）で受けとり、日本時間に直して使う。端末の時間帯にはよらない。
 */
import { hexG2, mix, mix3, smoothstep, type RGB } from './tonemath';
import { E_SKY, E_SUN, KEY_HEX, SKY_EL, SUN_HEX, ZENITH_HEX } from './skytab';

/** 京都（緯度・経度は度、時間帯は UTC からの時間） */
export const KYOTO = { lat: 35.0116, lon: 135.7681, tz: 9 } as const;
export interface Place { lat: number; lon: number; tz: number }
const RAD = Math.PI / 180, DAY = 86400000;

// ---- 日本時間の暦 ----
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** 日本時間の年・年の通し日（1 月 1 日 = 1）・0 時からの分（秒の端数つき） */
export function jstOf(date: Date): { year: number; doy: number; minute: number } {
  const t = date.getTime() + KYOTO.tz * 3600000, year = new Date(t).getUTCFullYear(), ms = t - Date.UTC(year, 0, 1);
  const doy = Math.floor(ms / DAY) + 1;
  return { year, doy, minute: (ms - (doy - 1) * DAY) / 60000 };
}
/** 日本時間の y 年 mo 月 d 日 h 時 mi 分 */
export const jst = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - KYOTO.tz, mi));
/** date と同じ日本時間の日付の、0 時から minute 分の時刻（夕暮れを切ったときの 14:00 など） */
export function jstAt(date: Date, minute: number): Date {
  const j = jstOf(date);
  return new Date(Date.UTC(j.year, 0, 1) + (j.doy - 1) * DAY + minute * 60000 - KYOTO.tz * 3600000);
}

// ---- 太陽の位置 ----
/** 太陽の高度と方位（度。方位は北から時計回り）。大気の屈折は入れない（日の出・日の入りは高度 −0.833° で見る） */
export interface Sun { el: number; az: number }
/**
 * NOAA の一般式。year 年の通し日 doy の、その土地の時間帯の 0 時から minute 分の太陽。
 * 一年の長さは、うるう年なら 366 日（NOAA の注のとおり）
 */
export function sunPos(year: number, doy: number, minute: number, at: Place = KYOTO): Sun {
  const hour = minute / 60;
  const g = ((2 * Math.PI) / (leap(year) ? 366 : 365)) * (doy - 1 + (hour - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = minute + eqt + 4 * at.lon - 60 * at.tz;
  const ha = (tst / 4 - 180) * RAD, la = at.lat * RAD;
  const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const el = 90 - Math.acos(Math.min(1, Math.max(-1, cz))) / RAD;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) / RAD + 180;
  return { el, az: ((az % 360) + 360) % 360 };
}
/** その時刻の京都の太陽 */
export function sunAt(date: Date): Sun {
  const j = jstOf(date);
  return sunPos(j.year, j.doy, j.minute);
}
/** 夜の度合い：高度 2° より上は 0、市民薄明の終わり（−6°）より下は 1 */
export const nightOf = (el: number) => 1 - smoothstep(-6, 2, el);

// ---- 空 ----
/** 空の色と明るさ（色は作業の空間。日の円盤は高度 0° より下では 0° の色、明るさは 0） */
export interface Sky { sunCol: RGB; skyCol: RGB; Esun: number; Esky: number }
const SUN_G2 = SUN_HEX.map((h) => hexG2(h ?? SUN_HEX.find((x) => x) ?? '#000000'));
const ZEN_G2 = ZENITH_HEX.map((h) => hexG2(h));
/** 高度 el（度）の空。表の高度ではちょうど表の値、あいだは直線に補う。表の外は端の値 */
export function skyAt(el: number): Sky {
  const n = SKY_EL.length, e = Math.min(SKY_EL[n - 1], Math.max(SKY_EL[0], el));
  let i = 0;
  while (i < n - 2 && e > SKY_EL[i + 1]) i++;
  const t = (e - SKY_EL[i]) / (SKY_EL[i + 1] - SKY_EL[i]);
  return {
    sunCol: mix3(SUN_G2[i], SUN_G2[i + 1], t), skyCol: mix3(ZEN_G2[i], ZEN_G2[i + 1], t),
    Esun: mix(E_SUN[i], E_SUN[i + 1], t), Esky: mix(E_SKY[i], E_SKY[i + 1], t),
  };
}
/** 灯りの色（作業の空間）。描いた灯りにだけ使う */
export const keyCol = (k: keyof typeof KEY_HEX): RGB => hexG2(KEY_HEX[k]);

// ---- 窓の写し方と、昼から夜への受け渡し（D1） ----
/** −180〜180 にまわす */
export const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
/**
 * 窓の写し方：机の紙の上の縁が南向きの窓の方。窓に向かう人には東が左。方位 az の太陽は、窓の正面から r = az − 180 だけ横にずれ、
 * ±75° でおさえた向きから紙を照らす。dir は光の来る向き（画面、y は下向き）
 */
export function windowDir(az: number): { r: number; dir: [number, number] } {
  const r = wrap180(az - 180), rc = Math.min(75, Math.max(-75, r)) * RAD;
  return { r, dir: [Math.sin(rc), -Math.cos(rc)] };
}
/** 日の影の長さ（高さあたりのマス）：低い日ほど長く、2.5 で頭打ち。日が沈んでいれば頭打ちの値 */
export const sunLen = (el: number) => (el > 0 ? 2.5 * Math.tanh(1 / Math.tan(el * RAD) / 2.5) : 2.5);

/** 影の長さ（高さあたりのマス）・濃さ（0〜1）・やわらかさ（0 くっきり〜1 ぼんやり） */
export interface Shade { len: number; vis: number; soft: number }
/** 光の重みと、影の向き・長さ・濃さ・やわらかさ。aS 窓から差す日、aW 窓の空（真上から）、aK 夜の灯り（暗い見た目はその灯り） */
export interface Hand extends Shade { aS: number; aW: number; aK: number; dir: [number, number] }

/** 光の枠 */
export type Frame = 'window' | 'north' | 'overhead';
/** 見た目の名前（registry.ts の LookKey と同じ） */
export type LookName = 'note-light' | 'note-dark' | 'punk-light' | 'punk-dark' | 'arcane-light' | 'arcane-dark' | 'lab-light' | 'lab-dark';
/**
 * 見た目ごとの光の枠（D1 の表）。
 * - clock：実際の時刻で変わるか（明るい見た目だけ。暗い見た目は第 1 ラウンドでは時刻で変わらない）
 * - key：夜の灯り（明るい見た目）または灯り（暗い見た目）の来る向き（画面、y は下向き）
 * - day：昼の拡散光の影（窓の枠では窓の空。天窓と天井の灯りでは昼の値）。night：夜の灯りの影
 * 長さは D1 の表のとおり。濃さとやわらかさは、窓の枠では D1 の式の値、ほかは初期値（関門で合わせる。濃さ 1 は今の影の濃さのまま）
 */
export interface FrameSpec { frame: Frame; clock: boolean; key: readonly [number, number]; day: Shade; night: Shade }
const SKY_SHADE: Shade = { len: 0.35, vis: 0.3, soft: 1 }, LAMP_SHADE: Shade = { len: 0.6, vis: 1, soft: 0.3 };
export const FRAMES: Readonly<Record<LookName, Readonly<FrameSpec>>> = {
  'note-light': { frame: 'window', clock: true, key: [-0.50, -0.87], day: SKY_SHADE, night: LAMP_SHADE },      // 電気スタンド、左上
  'arcane-light': { frame: 'window', clock: true, key: [-0.71, -0.71], day: SKY_SHADE, night: LAMP_SHADE },    // ろうそく、左上
  'punk-light': { frame: 'north', clock: true, key: [0, -1], day: { len: 0.45, vis: 1, soft: 0.8 }, night: { len: 0.25, vis: 1, soft: 0.3 } },  // 北向きの天窓、夜は投光器
  'lab-light': { frame: 'overhead', clock: true, key: [0, -1], day: { len: 0.25, vis: 1, soft: 0.5 }, night: { len: 0.25, vis: 1, soft: 0.5 } }, // 天井の灯り
  'note-dark': { frame: 'overhead', clock: false, key: [0, -1], day: { len: 0.35, vis: 1, soft: 0.5 }, night: { len: 0.35, vis: 1, soft: 0.5 } }, // 黒板灯
  'punk-dark': { frame: 'overhead', clock: false, key: [0, -1], day: { len: 0.25, vis: 1, soft: 0.3 }, night: { len: 0.25, vis: 1, soft: 0.3 } }, // 作業灯
  'arcane-dark': { frame: 'window', clock: false, key: [-0.71, -0.71], day: LAMP_SHADE, night: LAMP_SHADE },   // ろうそく、左上
  'lab-dark': { frame: 'overhead', clock: false, key: [0, -1], day: { len: 0.25, vis: 1, soft: 0.5 }, night: { len: 0.25, vis: 1, soft: 0.5 } },  // 計器の灯り
};

const unit = (x: number, y: number): [number, number] => { const n = Math.hypot(x, y); return [x / n, y / n]; };
/**
 * 窓の枠の受け渡し（D1）：
 * aS = smoothstep(−4°, 8°, el)·(1 − smoothstep(60°, 110°, |r|))（窓から差す日。日が窓の壁の向こうへ回ると消える）、
 * aK = 1 − smoothstep(−8°, 0°, el)（夜の灯り）、aW = max(0, 1 − aS − aK)（窓の空、真上から）。
 * dir = normalize(aS·日 + aW·(0, −1) + aK·灯り)。3 つとも画面の上半分なので、影は二方向に割れず、下半分を通って振れることもない
 */
export function windowHand(el: number, az: number, f: Readonly<FrameSpec> = FRAMES['note-light']): Hand {
  const { r, dir: ds } = windowDir(az);
  const aS = smoothstep(-4, 8, el) * (1 - smoothstep(60, 110, Math.abs(r)));
  const aK = 1 - smoothstep(-8, 0, el);
  const aW = Math.max(0, 1 - aS - aK);
  const dir = unit(aS * ds[0] + aK * f.key[0], aS * ds[1] - aW + aK * f.key[1]);
  return {
    aS, aW, aK, dir,
    len: aS * sunLen(Math.max(el, 0.5)) + aW * f.day.len + aK * f.night.len,
    vis: aS * smoothstep(0, 5, el) + aW * f.day.vis + aK * f.night.vis,
    soft: aW * f.day.soft + aK * f.night.soft,
  };
}
/** 枠ごとの受け渡し。窓の枠は windowHand。天窓と天井の灯りは向きが真上から、長さ・濃さ・やわらかさを昼と夜の値で aK により混ぜる。時刻で変わらない見た目は灯りだけ */
export function frameHand(f: Readonly<FrameSpec>, el: number, az: number): Hand {
  if (!f.clock) return { aS: 0, aW: 0, aK: 1, dir: unit(f.key[0], f.key[1]), ...f.night };
  if (f.frame === 'window') return windowHand(el, az, f);
  const aK = 1 - smoothstep(-8, 0, el);
  return {
    aS: 0, aW: 1 - aK, aK, dir: unit(f.key[0], f.key[1]),
    len: mix(f.day.len, f.night.len, aK), vis: mix(f.day.vis, f.night.vis, aK), soft: mix(f.day.soft, f.night.soft, aK),
  };
}

/** 光の状態のうち、形の部分（色は skyAt と tonemath.ts） */
export interface Geom extends Hand { minute: number; sunEl: number; sunAz: number; night: number }
/**
 * 見た目 look の、時刻 date の光の形。dusk（設定の「夕暮れ」）が切れていれば、明るい見た目はその日の 14:00 の状態で night = 0。
 * 暗い見た目は時刻で変わらない（night = 0）。minute は使った時刻の日本時間の 0 時からの分
 */
export function geomOf(look: LookName, date: Date, dusk: boolean): Geom {
  const f = FRAMES[look], t = dusk ? date : jstAt(date, 14 * 60), s = sunAt(t);
  return { ...frameHand(f, s.el, s.az), minute: jstOf(t).minute, sunEl: s.el, sunAz: s.az, night: f.clock && dusk ? nightOf(s.el) : 0 };
}
