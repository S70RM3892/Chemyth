import { describe, expect, it } from 'vitest';
import {
  FRAMES, frameHand, geomOf, jst, jstAt, jstOf, keyCol, nightOf, skyAt, sunAt, sunLen, sunPos, windowDir, windowHand, wrap180, type LookName,
} from '../src/ui/gfx/sky';
import { E_SKY, E_SUN, KEY_HEX, SKY_EL, SUN_HEX, ZENITH_HEX } from '../src/ui/gfx/skytab';
import { hexG2 } from '../src/ui/gfx/tonemath';

const MIN = 60000;
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
const vec = (s: { el: number; az: number }) => { const e = (s.el * Math.PI) / 180, a = (s.az * Math.PI) / 180; return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]; };

/**
 * 国立天文台 暦計算室「日の出入り」京都（北緯 35.0167°、東経 135.7500°、2026 年）。
 * 日付、日の出の時刻と方位、南中の時刻と高度、日の入りの時刻と方位（eco.mtk.nao.ac.jp/koyomi/dni/2026/s2703.html ほか、2026-11-13 に確認）
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
  it('2026-11-12 15:00 は高度 19.4°・方位 230.4°、市民薄明の終わりは 17:22 ごろ', () => {
    const s = sunAt(jst(2026, 11, 12, 15));
    expect(Math.abs(s.el - 19.4)).toBeLessThanOrEqual(0.5);
    expect(angDiff(s.az, 230.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(cross(2026, 11, 12, -6, false) - hm('17:22'))).toBeLessThanOrEqual(3);
  });
  it('夏至と冬至の南中高度：2026-06-21 は 78.4°、2026-12-22 は 31.6°（±0.3°）', () => {
    expect(Math.abs(transit(2026, 6, 21).el - 78.4)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(transit(2026, 12, 22).el - 31.6)).toBeLessThanOrEqual(0.3);
  });
  it('一年を通して、国立天文台の京都の表と時刻 2 分・高度 0.5°・方位 1° 以内で合う', () => {
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
  it('方位は北から時計回り（朝は東、正午ごろ南、夕方は西）で、0〜360° におさまる', () => {
    expect(sunPos(2026, 316, 8 * 60).az).toBeGreaterThan(90);
    expect(sunPos(2026, 316, 8 * 60).az).toBeLessThan(180);
    expect(angDiff(sunPos(2026, 316, 11 * 60 + 41).az, 180)).toBeLessThan(2);
    expect(sunPos(2026, 316, 16 * 60).az).toBeGreaterThan(180);
    for (let m = 0; m < 1440; m += 7) { const s = sunPos(2026, 316, m); expect(s.az).toBeGreaterThanOrEqual(0); expect(s.az).toBeLessThan(360); }
  });
  it('日付と年の変わり目（うるう年は一年を 366 日として数える、NOAA の注）で、位置は跳ばない', () => {
    for (const y of [2027, 2028]) {
      const days = y === 2028 ? 366 : 365;
      for (let d = 0; d < days; d++) {
        const mid = jst(y, 1, 1 + d + 1).getTime();   // その日の終わりの 0 時
        // 天球の上の角度で比べる（真夜中は太陽が天底の近くにあり、方位だけは速く回る）
        const a = vec(sunAt(new Date(mid - MIN))), b = vec(sunAt(new Date(mid)));
        expect(Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / (Math.PI / 180)).toBeLessThan(0.3);
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
  it('灯りの色は §10.7 の値', () => {
    expect(KEY_HEX).toEqual({ candle: '#ff8500', tungsten: '#ffae59', led: '#ffd4a5', panel: '#ffe7d0' });
    expect(keyCol('candle')).toEqual(hexG2('#ff8500'));
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
  it('重み：高い日は窓の日だけ、深い夜は灯りだけ、日が窓の壁の向こうなら窓の空だけ', () => {
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
    for (const el of [-9, -5, -2, 0, 3, 7, 12]) for (const az of [60, 120, 180, 240, 300]) {
      const h = windowHand(el, az);
      expect(h.aS + h.aW + h.aK).toBeGreaterThanOrEqual(1 - 1e-12);
      for (const a of [h.aS, h.aW, h.aK]) { expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(1); }
    }
  });
  it('一年を 1 分きざみで：どの見た目でも光は上半分から（dir.y ≤ −0.435）、向きの変化は 1 分に 0.05 以下、長さ・濃さ・やわらかさは有限で連続', () => {
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
    expect(worst).toBeLessThanOrEqual(0.05);
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
  it('建物の見た目は真上から。暗い見た目は時刻で変わらない', () => {
    for (const look of ['punk-light', 'lab-light', 'note-dark', 'punk-dark', 'lab-dark'] as const) {
      for (const h of [3, 9, 12, 17, 21]) expect(geomOf(look, jst(2026, 11, 12, h), true).dir).toEqual([0, -1]);
    }
    for (const look of ['note-dark', 'punk-dark', 'arcane-dark', 'lab-dark'] as const) {
      const a = geomOf(look, jst(2026, 11, 12, 12), true), b = geomOf(look, jst(2026, 11, 12, 21, 30), true);
      expect([a.dir, a.len, a.vis, a.soft, a.night]).toEqual([b.dir, b.len, b.vis, b.soft, 0]);
    }
    expect(geomOf('arcane-dark', jst(2026, 11, 12, 21, 30), true).dir[0]).toBeCloseTo(-Math.SQRT1_2, 12);
    // 工場の昼は北の天窓の柔らかい光、夜は投光器
    const pd = geomOf('punk-light', jst(2026, 11, 12, 12), true), pn = geomOf('punk-light', jst(2026, 11, 12, 21, 30), true);
    expect([pd.len, pd.soft]).toEqual([0.45, 0.8]);
    expect([pn.len, pn.soft]).toEqual([0.25, 0.3]);
  });
  it('影の長さ：低い日ほど長く、2.5 で頭打ち', () => {
    expect(sunLen(90)).toBeLessThan(1e-9);
    expect(sunLen(45)).toBeCloseTo(2.5 * Math.tanh(0.4), 12);
    expect(sunLen(0.5)).toBeGreaterThan(2.49);
    expect(sunLen(-3)).toBe(2.5);
    let p = 9;
    for (let el = 0.5; el <= 90; el += 0.5) { const l = sunLen(el); expect(l).toBeLessThanOrEqual(p); p = l; }
  });
  it('夜は 21:30 に 1、昼は 0。夕暮れを切ると、その日の 14:00 の状態で night = 0（有限）', () => {
    expect(geomOf('note-light', jst(2026, 11, 12, 21, 30), true).night).toBe(1);
    expect(geomOf('note-light', jst(2026, 11, 12, 12), true).night).toBe(0);
    for (const look of LOOKS) {
      const off = geomOf(look, jst(2026, 11, 12, 21, 30), false), two = geomOf(look, jst(2026, 11, 12, 14), true);
      expect(off).toEqual({ ...two, night: 0 });
      expect(off.minute).toBe(14 * 60);
      for (const v of [off.len, off.vis, off.soft, off.dir[0], off.dir[1], off.sunEl, off.sunAz]) expect(Number.isFinite(v)).toBe(true);
    }
    // 夏の夜明け前でも同じ（その日の 14:00）
    expect(geomOf('note-light', jst(2027, 6, 21, 3), false)).toEqual({ ...geomOf('note-light', jst(2027, 6, 21, 14), true), night: 0 });
  });
});
