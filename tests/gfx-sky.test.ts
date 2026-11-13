import { describe, expect, it } from 'vitest';
import {
  EASE_S, FRAMES, KYOTO, easeK, frameHand, geomOf, jst, jstAt, jstOf, keyCol, keyColOf, mixGeom, nightOf, skyAt, sunAt, sunLen, sunPos,
  windowDir, windowHand, wrap180, type Geom, type LookName,
} from '../src/ui/gfx/sky';
import { E_SKY, E_SUN, KEY_HEX, KEY_K, SKY_EL, SUN_HEX, ZENITH_HEX } from '../src/ui/gfx/skytab';
import { hexG2 } from '../src/ui/gfx/tonemath';

const MIN = 60000, RAD = Math.PI / 180;
const LOOKS = Object.keys(FRAMES) as LookName[];
/** 日本時間 y-mo-d の 0 時から sec 秒の京都の太陽 */
const sunSec = (y: number, mo: number, d: number, sec: number) => sunAt(new Date(jst(y, mo, d).getTime() + sec * 1000));
/** その日に高度 target を上向き（rise）または下向きに横切る時刻（日本時間の 0 時からの分、10 秒きざみ） */
function cross(y: number, mo: number, d: number, target: number, rise: boolean): number {
  let prev = sunSec(y, mo, d, 0).el;
  for (let s = 10; s <= 86400; s += 10) {
    const e = sunSec(y, mo, d, s).el;
    if (rise ? prev < target && e >= target : prev >= target && e < target) return s / 60;
    prev = e;
  }
  return NaN;
}
/** その日の南中（いちばん高い時刻と高度） */
function transit(y: number, mo: number, d: number): { minute: number; el: number } {
  let best = { minute: 0, el: -99 };
  for (let s = 9 * 3600; s <= 15 * 3600; s += 10) { const e = sunSec(y, mo, d, s).el; if (e > best.el) best = { minute: s / 60, el: e }; }
  return best;
}
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const angDiff = (a: number, b: number) => Math.abs(wrap180(a - b));
/** 高度と方位を、天球の上の単位ベクトルに */
const vec = (s: { el: number; az: number }) => { const e = s.el * RAD, a = s.az * RAD; return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]; };

/**
 * 国立天文台 暦計算室「日の出入り」京都（北緯 35.0167°、東経 135.7500°、2026 年。eco.mtk.nao.ac.jp/koyomi/dni/2026/s2703.html・
 * s2706・s2709・s2711・s2712、2026-11-13 に確認）。日付、日の出の時刻と方位、南中の時刻と高度、日の入りの時刻と方位
 */
const NAOJ: [string, string, number, string, number, string, number][] = [
  ['2026-03-01', '6:27', 98.8, '12:09', 47.4, '17:52', 261.4],
  ['2026-03-20', '6:01', 89.8, '12:05', 54.8, '18:08', 270.5],
  ['2026-03-31', '5:46', 84.5, '12:01', 59.1, '18:17', 275.8],
  ['2026-06-01', '4:44', 62.1, '11:55', 77.0, '19:06', 298.0],
  ['2026-06-21', '4:43', 60.3, '11:59', 78.4, '19:14', 299.7],
  ['2026-06-30', '4:46', 60.6, '12:01', 78.2, '19:15', 299.4],
  ['2026-09-01', '5:29', 79.1, '11:57', 63.3, '18:24', 280.6],
  ['2026-09-23', '5:45', 89.3, '11:50', 54.9, '17:53', 270.4],
  ['2026-09-30', '5:51', 92.7, '11:47', 52.2, '17:43', 267.1],
  ['2026-11-01', '6:17', 107.0, '11:41', 40.6, '17:03', 252.9],
  ['2026-11-12', '6:28', 111.0, '11:41', 37.3, '16:54', 248.8],
  ['2026-11-13', '6:29', 111.4, '11:41', 37.1, '16:53', 248.5],
  ['2026-11-30', '6:45', 116.0, '11:45', 33.4, '16:46', 243.9],
  ['2026-12-01', '6:46', 116.2, '11:46', 33.2, '16:45', 243.7],
  ['2026-12-22', '7:01', 118.4, '11:55', 31.6, '16:50', 241.6],
  ['2026-12-31', '7:05', 118.0, '12:00', 31.9, '16:55', 242.1],
];
/** 国立天文台の地点「京都」 */
const NAOJ_KYOTO = { lat: 35.0167, lon: 135.75, tz: 9 };
/**
 * 国立天文台 暦計算室「太陽系天体の高度と方位」（horizontal.cgi、地点 京都、大気差なし、太陽の中心、毎時。2026-11-13 に取得）。
 * 日付、最初の時刻（時）、そこから 1 時間ごとの [高度, 方位]（度。方位は北から東回り）
 */
const NAOJ_HOURLY: [string, number, [number, number][]][] = [
  ['2026-11-12', 7, [[5.1569, 115.7357], [15.7193, 125.5407], [24.9386, 137.2055], [32.1255, 151.2896], [36.4274, 167.8071], [37.1213, 185.6503], [34.0706, 202.8427], [27.8322, 217.8558], [19.2610, 230.3444], [9.1205, 240.7386], [-2.0357, 249.6893]]],
  ['2026-03-20', 6, [[-1.1163, 89.5769], [11.1404, 98.2795], [23.1131, 107.7635], [34.3984, 119.0798], [44.3193, 133.7080], [51.6817, 153.3623], [54.7721, 178.0291], [52.4971, 203.1829], [45.6899, 223.7247], [36.0802, 239.0433], [24.9619, 250.7806], [13.0766, 260.4905], [0.8589, 269.2805]]],
  ['2026-06-21', 5, [[2.1730, 62.6525], [13.4453, 70.6212], [25.2662, 78.0931], [37.4163, 85.6726], [49.6881, 94.3096], [61.7707, 106.1614], [72.7676, 128.2823], [78.4174, 181.4450], [72.3574, 233.0869], [61.2726, 254.4626], [49.1717, 266.0971], [36.9003, 274.6601], [24.7601, 282.2199], [12.9576, 289.7017], [1.7143, 297.7030]]],
  ['2026-09-23', 6, [[2.1570, 91.4527], [14.3599, 100.2916], [26.1996, 110.1431], [37.2213, 122.1560], [46.6395, 137.9392], [53.0935, 159.0825], [54.8492, 184.5610], [51.2493, 208.9352], [43.5427, 228.0672], [33.4277, 242.2926], [22.0396, 253.3665], [10.0175, 262.7287], [-2.2521, 271.4006]]],
  ['2026-12-22', 7, [[-1.0808, 118.2004], [9.2488, 127.3138], [18.2893, 137.9965], [25.4671, 150.6526], [30.0888, 165.3074], [31.5338, 181.2449], [29.5706, 197.0648], [24.5090, 211.4365], [17.0005, 223.7726], [7.7278, 234.1825], [-2.7597, 243.0982]]],
  ['2027-06-21', 5, [[2.1808, 62.6608], [13.4539, 70.6289], [25.2753, 78.1008], [37.4257, 85.6809], [49.6975, 94.3197], [61.7797, 106.1764], [72.7746, 128.3130], [78.4158, 181.5016], [72.3484, 233.1103], [61.2622, 254.4727], [49.1610, 266.1036], [36.8896, 274.6655], [24.7496, 282.2252], [12.9475, 289.7073], [1.7047, 297.7094]]],
  ['2027-12-31', 7, [[-1.6745, 117.3520], [8.7579, 126.3900], [17.9404, 136.9693], [25.3073, 149.5179], [30.1629, 164.1101], [31.8624, 180.0864], [30.1327, 196.0561], [25.2513, 210.6327], [17.8651, 223.1644], [8.6689, 233.7305], [-1.7728, 242.7610]]],
];

/**
 * 比べるための別の式：NOAA の太陽の計算表（Meeus の式。大気差なし）。一般式より細かいので、一年じゅうの毎時刻で比べる。
 * date は絶対の時刻
 */
function meeus(date: Date, at: { lat: number; lon: number } = KYOTO): { el: number; az: number } {
  const jd = date.getTime() / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * RAD);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om * RAD);
  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lam * RAD));
  const yv = Math.tan((eps / 2) * RAD) ** 2;
  const eqt = 4 / RAD * (yv * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * yv * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * yv * yv * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const utcMin = ((date.getTime() / MIN) % 1440 + 1440) % 1440;
  const ha = ((utcMin + eqt + 4 * at.lon) % 1440) / 4 - 180, la = at.lat * RAD;
  const cz = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha * RAD);
  const el = 90 - Math.acos(Math.min(1, Math.max(-1, cz))) / RAD;
  const az = (Math.atan2(Math.sin(ha * RAD), Math.cos(ha * RAD) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) / RAD + 540) % 360;
  return { el, az };
}

describe('日本時間の暦', () => {
  it('Date を日本時間の年・通し日・分に直す（端末の時間帯によらない）', () => {
    expect(jstOf(jst(2026, 11, 12, 21, 30))).toEqual({ year: 2026, doy: 316, minute: 21 * 60 + 30 });
    expect(jstOf(new Date(Date.UTC(2026, 10, 12, 15, 0)))).toEqual({ year: 2026, doy: 317, minute: 0 });   // UTC 15:00 は日本の翌日 0 時
    expect(jstOf(jst(2028, 12, 31, 23, 59))).toEqual({ year: 2028, doy: 366, minute: 23 * 60 + 59 });
    expect(jstOf(jst(2027, 1, 1)).doy).toBe(1);
    expect(jstAt(jst(2026, 11, 12, 21, 30), 14 * 60).getTime()).toBe(jst(2026, 11, 12, 14).getTime());
    expect(jstAt(jst(2026, 11, 12, 0, 5), 14 * 60).getTime()).toBe(jst(2026, 11, 12, 14).getTime());
  });
});

describe('京都の太陽（NOAA の一般式）', () => {
  it('2026-11-12：日の出 06:28（方位 111.0°）・南中 11:41（37.3°）・日の入り 16:54（248.8°）（国立天文台）', () => {
    const rise = cross(2026, 11, 12, -0.833, true), set = cross(2026, 11, 12, -0.833, false), tr = transit(2026, 11, 12);
    expect(Math.abs(rise - hm('6:28'))).toBeLessThanOrEqual(2);
    expect(Math.abs(set - hm('16:54'))).toBeLessThanOrEqual(2);
    expect(Math.abs(tr.minute - hm('11:41'))).toBeLessThanOrEqual(2);
    expect(Math.abs(tr.el - 37.3)).toBeLessThanOrEqual(0.5);
    expect(angDiff(sunAt(new Date(jst(2026, 11, 12).getTime() + rise * MIN)).az, 111.0)).toBeLessThanOrEqual(1);
    expect(angDiff(sunAt(new Date(jst(2026, 11, 12).getTime() + set * MIN)).az, 248.8)).toBeLessThanOrEqual(1);
  });
  it('2026-11-12 15:00 は高度 19.4°・方位 230.4°（国立天文台は 19.26°・230.34°）、市民薄明の終わりは 17:22 ごろ', () => {
    const s = sunAt(jst(2026, 11, 12, 15));
    expect(Math.abs(s.el - 19.4)).toBeLessThanOrEqual(0.5);
    expect(angDiff(s.az, 230.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.el - 19.2610)).toBeLessThanOrEqual(0.5);
    expect(angDiff(s.az, 230.3444)).toBeLessThanOrEqual(1);
    expect(Math.abs(cross(2026, 11, 12, -6, false) - hm('17:22'))).toBeLessThanOrEqual(3);
  });
  it('夏至と冬至の南中高度：2026-06-21 は 78.4°、2026-12-22 は 31.6°（±0.3°）', () => {
    expect(Math.abs(transit(2026, 6, 21).el - 78.4)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(transit(2026, 12, 22).el - 31.6)).toBeLessThanOrEqual(0.3);
  });
  it('一年を通して、国立天文台の京都の日の出入りの表と時刻 2 分・高度 0.5°・方位 1° 以内で合う', () => {
    for (const [d, rise, raz, tr, alt, set, saz] of NAOJ) {
      const [y, mo, da] = d.split('-').map(Number), t0 = jst(y, mo, da).getTime();
      const r = cross(y, mo, da, -0.833, true), s = cross(y, mo, da, -0.833, false), t = transit(y, mo, da);
      expect(Math.abs(r - hm(rise)), `${d} 日の出`).toBeLessThanOrEqual(2);
      expect(Math.abs(s - hm(set)), `${d} 日の入り`).toBeLessThanOrEqual(2);
      expect(Math.abs(t.minute - hm(tr)), `${d} 南中`).toBeLessThanOrEqual(2);
      expect(Math.abs(t.el - alt), `${d} 南中高度`).toBeLessThanOrEqual(0.5);
      expect(angDiff(sunAt(new Date(t0 + r * MIN)).az, raz), `${d} 日の出の方位`).toBeLessThanOrEqual(1);
      expect(angDiff(sunAt(new Date(t0 + s * MIN)).az, saz), `${d} 日の入りの方位`).toBeLessThanOrEqual(1);
    }
  });
  it('国立天文台の毎時の高度と方位（大気差なし）と、高度 0.5°・方位 1° 以内（春分・夏至・秋分・冬至・11 月・2027 年）', () => {
    let we = 0, wa = 0;
    for (const [d, h0, rows] of NAOJ_HOURLY) {
      const [y, mo, da] = d.split('-').map(Number);
      rows.forEach(([el, az], i) => {
        const date = jst(y, mo, da, h0 + i), j = jstOf(date);
        // 国立天文台の地点で比べ、京都（この遊びの地点）でも同じはばに入ることを見る
        for (const s of [sunPos(j.year, j.doy, j.minute, NAOJ_KYOTO), sunAt(date)]) {
          expect(Math.abs(s.el - el), `${d} ${h0 + i}:00 高度`).toBeLessThanOrEqual(0.5);
          expect(angDiff(s.az, az), `${d} ${h0 + i}:00 方位`).toBeLessThanOrEqual(1);
          we = Math.max(we, Math.abs(s.el - el)); wa = Math.max(wa, angDiff(s.az, az));
        }
      });
    }
    // 実際の差は高度 0.31°・方位 0.55°（天頂の近く）まで
    expect(we).toBeLessThan(0.35);
    expect(wa).toBeLessThan(0.6);
  });
  it('NOAA の計算表（Meeus の式）と、2026〜2028 年の 7 分ごとに高度 0.5°・方位 1° 以内（高度 −10° より上）', () => {
    // 比べる式そのものは、国立天文台の毎時の値と 0.05° 以内で合う
    for (const [d, h0, rows] of NAOJ_HOURLY) {
      const [y, mo, da] = d.split('-').map(Number);
      rows.forEach(([el, az], i) => {
        const m = meeus(jst(y, mo, da, h0 + i), NAOJ_KYOTO);
        expect(Math.abs(m.el - el), `${d} ${h0 + i}:00`).toBeLessThan(0.05);
        expect(angDiff(m.az, az), `${d} ${h0 + i}:00`).toBeLessThan(0.05);
      });
    }
    let we = 0, wa = 0;
    const t0 = jst(2026, 1, 1).getTime(), t1 = jst(2029, 1, 1).getTime();
    for (let t = t0; t < t1; t += 7 * MIN) {
      const d = new Date(t), m = meeus(d);
      if (m.el < -10) continue;
      const s = sunAt(d);
      we = Math.max(we, Math.abs(s.el - m.el));
      if (m.el < 85) wa = Math.max(wa, angDiff(s.az, m.az));
    }
    expect(we).toBeLessThanOrEqual(0.5);
    expect(wa).toBeLessThanOrEqual(1);
  });
  it('方位は北から時計回り（朝は東、正午ごろ南、夕方は西）で、0〜360° におさまる', () => {
    expect(sunPos(2026, 316, 8 * 60).az).toBeGreaterThan(90);
    expect(sunPos(2026, 316, 8 * 60).az).toBeLessThan(180);
    expect(angDiff(sunPos(2026, 316, 11 * 60 + 41).az, 180)).toBeLessThan(2);
    expect(sunPos(2026, 316, 16 * 60).az).toBeGreaterThan(180);
    for (let m = 0; m < 1440; m += 7) { const s = sunPos(2026, 316, m); expect(s.az).toBeGreaterThanOrEqual(0); expect(s.az).toBeLessThan(360); }
  });
  it('日付と年の変わり目で、位置は跳ばない', () => {
    for (const y of [2027, 2028]) {
      const days = y === 2028 ? 366 : 365;
      for (let d = 0; d < days; d++) {
        const mid = jst(y, 1, 1 + d + 1).getTime();   // その日の終わりの 0 時
        // 天球の上の角度で比べる（真夜中は太陽が天底の近くにあり、方位だけは速く回る）
        const a = vec(sunAt(new Date(mid - MIN))), b = vec(sunAt(new Date(mid)));
        const step = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / RAD;
        // 式はうるう年でも一年を 365 日で数える（SPEC2 L1）ので、うるう年の大みそかから元日へは 1 分で 0.34° 動く
        // （ふだんは 0.25° まで）。そのとき太陽は地平線の下 78° ほどにあり、日なたの重みは 0 なので、光は変わらない
        const leapEnd = y === 2028 && d === days - 1;
        expect(step, new Date(mid).toISOString()).toBeLessThan(leapEnd ? 0.4 : 0.3);
        if (leapEnd) for (const t of [mid - MIN, mid]) {
          const s = sunAt(new Date(t));
          expect(s.el).toBeLessThan(-70);
          expect(windowHand(s.el, s.az).aS).toBe(0);
        }
      }
    }
    expect(Math.abs(sunPos(2028, 366, 12 * 60).el - sunPos(2027, 365, 12 * 60).el)).toBeLessThan(0.5);
  });
  it('夜の度合いは、高度 2° より上で 0、−6° より下で 1', () => {
    expect(nightOf(2)).toBe(0);
    expect(nightOf(30)).toBe(0);
    expect(nightOf(-6)).toBe(1);
    expect(nightOf(-20)).toBe(1);
    expect(nightOf(-2)).toBeCloseTo(0.5, 12);
  });
});

describe('空の表', () => {
  it('表の高度では、ちょうど表の値（色は 2 乗した値）', () => {
    expect([SUN_HEX.length, E_SUN.length, ZENITH_HEX.length, E_SKY.length]).toEqual([SKY_EL.length, SKY_EL.length, SKY_EL.length, SKY_EL.length]);
    SKY_EL.forEach((el, i) => {
      const s = skyAt(el);
      expect(s.Esun).toBe(E_SUN[i]);
      expect(s.Esky).toBe(E_SKY[i]);
      expect(s.skyCol).toEqual(hexG2(ZENITH_HEX[i]));
      expect(s.sunCol).toEqual(hexG2(SUN_HEX[i] ?? SUN_HEX[4]!));
    });
  });
  it('あいだは直線に補い、表の外は端の値。日の光も空の光も、高度とともに増える', () => {
    const a = skyAt(10), b = skyAt(15), m = skyAt(12.5);
    expect(m.Esun).toBeCloseTo((a.Esun + b.Esun) / 2, 12);
    for (let i = 0; i < 3; i++) expect(m.skyCol[i]).toBeCloseTo((a.skyCol[i] + b.skyCol[i]) / 2, 12);
    expect(skyAt(-30)).toEqual(skyAt(-8));
    expect(skyAt(120)).toEqual(skyAt(90));
    let pe = -1, pk = -1;
    for (let el = -8; el <= 90; el += 0.25) {
      const s = skyAt(el);
      expect(s.Esun).toBeGreaterThanOrEqual(pe);
      expect(s.Esky).toBeGreaterThanOrEqual(pk);
      pe = s.Esun; pk = s.Esky;
      for (const c of [...s.sunCol, ...s.skyCol]) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
    }
    expect(skyAt(-2).Esun).toBe(0);
    expect(skyAt(-1).Esun).toBeCloseTo(0.0005, 12);   // −2° と 0° のあいだも直線
  });
  it('灯りの色は §10.7 の値。見た目ごとの灯りは D1 の色温度（電気スタンド 2700 K・ろうそく 1850 K・投光器 4000 K・天井 5000 K）', () => {
    expect(KEY_HEX).toEqual({ candle: '#ff8500', tungsten: '#ffae59', led: '#ffd4a5', panel: '#ffe7d0' });
    expect(KEY_K).toEqual({ candle: 1850, tungsten: 2700, led: 4000, panel: 5000 });
    expect(keyCol('candle')).toEqual(hexG2('#ff8500'));
    expect(KEY_K[FRAMES['note-light'].lamp]).toBe(2700);
    expect(KEY_K[FRAMES['arcane-light'].lamp]).toBe(1850);
    expect(KEY_K[FRAMES['arcane-dark'].lamp]).toBe(1850);
    expect(KEY_K[FRAMES['punk-light'].lamp]).toBe(4000);
    expect(KEY_K[FRAMES['lab-light'].lamp]).toBe(5000);
    for (const look of LOOKS) expect(keyColOf(look)).toEqual(hexG2(KEY_HEX[FRAMES[look].lamp]));
  });
});

describe('光の枠と、昼から夜への受け渡し（D1）', () => {
  it('窓の写し方：2026-11-12 の 08:00・12:00・15:00・16:00 は D1 の向き（±0.02）', () => {
    const want: [number, [number, number]][] = [[8, [-0.82, -0.58]], [12, [0.10, -0.99]], [15, [0.77, -0.64]], [16, [0.87, -0.49]]];
    for (const [h, v] of want) {
      const s = sunAt(jst(2026, 11, 12, h)), w = windowDir(s.az).dir;
      expect(Math.abs(w[0] - v[0]), `${h}:00`).toBeLessThanOrEqual(0.02);
      expect(Math.abs(w[1] - v[1]), `${h}:00`).toBeLessThanOrEqual(0.02);
      // 受け渡しの重みを入れても、同じ向き
      for (const look of ['note-light', 'arcane-light'] as const) {
        const d = geomOf(look, jst(2026, 11, 12, h), true).dir;
        expect(Math.abs(d[0] - v[0]), `${look} ${h}:00`).toBeLessThanOrEqual(0.02);
        expect(Math.abs(d[1] - v[1]), `${look} ${h}:00`).toBeLessThanOrEqual(0.02);
      }
    }
  });
  it('重み：高い日は窓の日だけ、深い夜は灯りだけ、日が窓の壁の向こうなら窓の空だけ。3 つの和はいつも 1', () => {
    const day = windowHand(30, 180);
    expect([day.aS, day.aW, day.aK]).toEqual([1, 0, 0]);
    expect(day.vis).toBe(1);
    expect(day.soft).toBe(0);
    expect(day.len).toBeCloseTo(sunLen(30), 12);
    const night = windowHand(-10, 300);
    expect([night.aS, night.aW, night.aK]).toEqual([0, 0, 1]);
    expect(night.dir[0]).toBeCloseTo(-0.50 / Math.hypot(0.5, 0.87), 12);
    expect([night.len, night.vis, night.soft]).toEqual([0.6, 1, 0.3]);
    const wall = windowHand(20, 180 + 115);
    expect([wall.aS, wall.aW, wall.aK]).toEqual([0, 1, 0]);
    expect(wall.dir).toEqual([0, -1]);
    expect([wall.len, wall.vis, wall.soft]).toEqual([0.35, 0.3, 1]);
    for (let el = -10; el <= 12; el += 0.25) for (let az = 0; az < 360; az += 15) {
      const h = windowHand(el, az);
      expect(h.aS + h.aW + h.aK).toBeCloseTo(1, 12);
      for (const a of [h.aS, h.aW, h.aK]) { expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(1); }
    }
  });
  it('一年を 1 分きざみで：どの見た目でも光は上半分から（dir.y ≤ −0.435）、向きの変化は 1 分に 0.05 以下、長さ・濃さ・やわらかさは有限で連続', () => {
    // dir.y のいちばん大きい値は −0.4352（窓の日が ±75° でおさえられ、窓の壁の重みが効きはじめる所）。D1 の「−0.44」はこの値を小数 2 桁に丸めたもの
    const t0 = jst(2026, 7, 1).getTime(), n = 366 * 1440;
    const prev = new Map<LookName, { dir: [number, number]; len: number; vis: number; soft: number }>();
    let maxY = -9, worst = 0, dl = 0, dv = 0, ds = 0;
    for (let m = 0; m <= n; m++) {
      const s = sunAt(new Date(t0 + m * MIN));
      for (const look of LOOKS) {
        const h = frameHand(FRAMES[look], s.el, s.az);
        if (!(Number.isFinite(h.len) && Number.isFinite(h.vis) && Number.isFinite(h.soft) && Number.isFinite(h.dir[0]) && Number.isFinite(h.dir[1]))) throw new Error(`${look} ${m}`);
        if (h.dir[1] > maxY) maxY = h.dir[1];
        const p = prev.get(look);
        if (p) {
          worst = Math.max(worst, Math.hypot(h.dir[0] - p.dir[0], h.dir[1] - p.dir[1]));
          dl = Math.max(dl, Math.abs(h.len - p.len)); dv = Math.max(dv, Math.abs(h.vis - p.vis)); ds = Math.max(ds, Math.abs(h.soft - p.soft));
        }
        prev.set(look, h);
      }
    }
    expect(maxY).toBeLessThanOrEqual(-0.435);
    expect(maxY).toBeGreaterThan(-0.44);
    expect(worst).toBeLessThanOrEqual(0.05);
    expect(worst).toBeLessThan(0.035);   // D1 の検算は 0.032（ノート）。魔術は灯りの向きが違うので 0.034
    expect(dl).toBeLessThanOrEqual(0.08);
    expect(dv).toBeLessThanOrEqual(0.06);
    expect(ds).toBeLessThanOrEqual(0.04);
  });
  it('夕暮れの受け渡し（2026-11-12 16:40–16:50、2027-06-21 16:35–16:50）も、1 分に 0.05 以下', () => {
    for (const [y, mo, d, a, b] of [[2026, 11, 12, 16 * 60 + 40, 16 * 60 + 50], [2027, 6, 21, 16 * 60 + 35, 16 * 60 + 50]]) {
      for (const look of ['note-light', 'arcane-light'] as const) {
        let p = geomOf(look, jst(y, mo, d, 0, a), true).dir;
        for (let m = a + 1; m <= b; m++) {
          const g = geomOf(look, jst(y, mo, d, 0, m), true);
          expect(Math.hypot(g.dir[0] - p[0], g.dir[1] - p[1])).toBeLessThanOrEqual(0.05);
          expect(g.dir[1]).toBeLessThanOrEqual(-0.435);
          p = g.dir;
        }
      }
    }
  });
  it('夏の午後、日が窓の壁の向こうへ回ると（2027-06-21 16:41 から）、影は窓の空から真下へ（灯りの方へは振れない）', () => {
    for (let m = 16 * 60 + 41; m <= 19 * 60; m += 3) {
      const g = geomOf('note-light', jst(2027, 6, 21, 0, m), true);
      expect(g.dir[1]).toBeLessThanOrEqual(-0.99);
      expect(g.dir[0]).toBeGreaterThanOrEqual(-0.02);
      expect(g.dir[0]).toBeLessThanOrEqual(0.12);
    }
  });
  it('建物の見た目は真上から。暗い見た目は時刻でも「夕暮れ」の設定でも変わらない', () => {
    for (const look of ['punk-light', 'lab-light', 'note-dark', 'punk-dark', 'lab-dark'] as const) {
      for (const h of [3, 9, 12, 17, 21]) expect(geomOf(look, jst(2026, 11, 12, h), true).dir).toEqual([0, -1]);
    }
    for (const look of ['note-dark', 'punk-dark', 'arcane-dark', 'lab-dark'] as const) {
      const a = geomOf(look, jst(2026, 11, 12, 12), true), b = geomOf(look, jst(2026, 11, 12, 21, 30), true);
      expect([a.dir, a.len, a.vis, a.soft, a.night]).toEqual([b.dir, b.len, b.vis, b.soft, 0]);
      expect(geomOf(look, jst(2026, 11, 12, 21, 30), false)).toEqual(b);
    }
    expect(geomOf('arcane-dark', jst(2026, 11, 12, 21, 30), true).dir[0]).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(geomOf('arcane-dark', jst(2026, 11, 12, 21, 30), true).len).toBe(0.6);
    // 工場の昼は北の天窓の柔らかい光、夜は投光器
    const pd = geomOf('punk-light', jst(2026, 11, 12, 12), true), pn = geomOf('punk-light', jst(2026, 11, 12, 21, 30), true);
    expect([pd.len, pd.soft]).toEqual([0.45, 0.8]);
    expect([pn.len, pn.soft]).toEqual([0.25, 0.3]);
    // 影の長さは D1 の表のとおり
    const len = (look: LookName, h: number) => geomOf(look, jst(2026, 11, 12, h), true).len;
    expect([len('lab-light', 12), len('lab-light', 22), len('note-dark', 12), len('punk-dark', 12), len('lab-dark', 12)]).toEqual([0.25, 0.25, 0.35, 0.25, 0.25]);
    expect([len('note-light', 22), len('arcane-light', 22)]).toEqual([0.6, 0.6]);
  });
  it('影の長さ：低い日ほど長く、2.5 で頭打ち', () => {
    expect(sunLen(90)).toBeLessThan(1e-9);
    expect(sunLen(45)).toBeCloseTo(2.5 * Math.tanh(0.4), 12);
    expect(sunLen(0.5)).toBeGreaterThan(2.49);
    expect(sunLen(-3)).toBe(2.5);
    let p = 9;
    for (let el = 0.5; el <= 90; el += 0.5) { const l = sunLen(el); expect(l).toBeLessThanOrEqual(p); p = l; }
  });
  it('夜は 21:30 に 1、昼は 0。夕暮れを切ると、明るい見た目はその日の 14:00 の状態で night = 0（有限）', () => {
    expect(geomOf('note-light', jst(2026, 11, 12, 21, 30), true).night).toBe(1);
    expect(geomOf('note-light', jst(2026, 11, 12, 12), true).night).toBe(0);
    for (const look of LOOKS.filter((k) => FRAMES[k].clock)) {
      const off = geomOf(look, jst(2026, 11, 12, 21, 30), false), two = geomOf(look, jst(2026, 11, 12, 14), true);
      expect(off).toEqual({ ...two, night: 0 });
      expect(off.minute).toBe(14 * 60);
      for (const v of [off.len, off.vis, off.soft, off.dir[0], off.dir[1], off.sunEl, off.sunAz]) expect(Number.isFinite(v)).toBe(true);
    }
    // 夏の夜明け前でも同じ（その日の 14:00）
    expect(geomOf('note-light', jst(2027, 6, 21, 3), false)).toEqual({ ...geomOf('note-light', jst(2027, 6, 21, 14), true), night: 0 });
  });
});

describe('移り変わり（0.6 秒、calm ではすぐ）', () => {
  it('寄せる割合は 0 から 1 へなめらかに増え、0.6 秒で 1。calm なら初めから 1', () => {
    expect(EASE_S).toBe(0.6);
    expect(easeK(0, false)).toBe(0);
    expect(easeK(0.3, false)).toBeCloseTo(0.5, 12);
    expect(easeK(0.6, false)).toBe(1);
    expect(easeK(5, false)).toBe(1);
    expect(easeK(0, true)).toBe(1);
    let p = -1;
    for (let t = 0; t <= 0.7; t += 0.01) { const k = easeK(t, false); expect(k).toBeGreaterThanOrEqual(p); p = k; }
  });
  it('2 つの光の形のあいだも、向きは長さ 1 で上半分から（dir.y ≤ −0.435）、両端はちょうどその形', () => {
    const at = (look: LookName, h: number, mi = 0) => geomOf(look, jst(2026, 11, 12, h, mi), true);
    const pairs: [Geom, Geom][] = [
      [at('note-light', 8), at('note-light', 16)], [at('note-light', 16), at('arcane-light', 21, 30)], [at('punk-light', 12), at('arcane-dark', 12)],
      [at('note-light', 15), at('lab-dark', 15)], [geomOf('note-light', jst(2026, 7, 18, 13, 56), true), at('arcane-light', 8)],
    ];
    for (const [a, b] of pairs) {
      expect(mixGeom(a, b, 0).dir[0]).toBeCloseTo(a.dir[0], 12);
      expect(mixGeom(a, b, 1)).toEqual({ ...b, dir: [expect.closeTo(b.dir[0], 12), expect.closeTo(b.dir[1], 12)] });
      for (let k = 0; k <= 1; k += 0.05) {
        const g = mixGeom(a, b, k);
        expect(Math.hypot(g.dir[0], g.dir[1])).toBeCloseTo(1, 12);
        expect(g.dir[1]).toBeLessThanOrEqual(-0.435);
        for (const v of [g.len, g.vis, g.soft, g.night]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
