/**
 * 空の表（SPEC2 L1・§10.7）。太陽の高度ごとの、日の円盤の色・日の光の強さ・天頂の空の色・空の光の強さと、灯りの色。
 * 晴れた大気を通した日の光（レイリー散乱 λ⁻⁴ を Hansen–Travis の形で、エアロゾル 0.08·(λ/550)^−1.3、オゾンのシャピュイ帯 300 DU、
 * Kasten–Young の空気量）と、一回散乱の天頂の空を、CIE 1931 等色関数の近似（Wyman–Sloan–Shirley 2013）で sRGB にしたもの。
 * 作った道具（試作の sun.py）は同梱しない。この表が正。
 * - 日の円盤の色：明るさをそろえた色。高度が 0° より下は日が見えない（null）
 * - Esun：大気の外の日の光に対する、地上の日の光の明るさの比
 * - Esky：太陽が天頂にあるときの天頂の空に対する、天頂の空の明るさの比
 * 高度のあいだは、色を 2 乗した値（ガンマ 2 の作業の空間）と明るさを、直線に補う（sky.ts の skyAt）。
 */

/** 表の高度（度） */
export const SKY_EL: readonly number[] = [-8, -6, -4, -2, 0, 2, 5, 10, 15, 20, 30, 45, 60, 90];
/** 日の円盤の色 */
export const SUN_HEX: readonly (string | null)[] = [null, null, null, null, '#ff6200', '#ffa000', '#ffc45e', '#ffd993', '#ffe1ab', '#ffe5b9', '#ffe9c7', '#ffebd1', '#ffecd5', '#ffedd8'];
/** 日の光の強さ（大気の外 = 1） */
export const E_SUN: readonly number[] = [0, 0, 0, 0, 0.001, 0.024, 0.134, 0.334, 0.472, 0.564, 0.674, 0.756, 0.796, 0.820];
/** 天頂の空の色 */
export const ZENITH_HEX: readonly string[] = ['#000000', '#aaf2ff', '#a1dcff', '#c0e7ff', '#c7efff', '#b8e9ff', '#a9dcff', '#9fcfff', '#9bc9ff', '#99c5ff', '#97c1ff', '#96bfff', '#95beff', '#94bdff'];
/** 天頂の空の明るさ（太陽が天頂にあるとき = 1） */
export const E_SKY: readonly number[] = [0, 0.0006, 0.012, 0.070, 0.208, 0.371, 0.561, 0.736, 0.825, 0.876, 0.933, 0.971, 0.989, 1];

/**
 * 灯りの色（黒体の光を同じ等色関数の近似で sRGB にしたもの、明るさをそろえた色）。
 * 第 1 ラウンドでは、描いた灯り（ランプの絵、ろうそくの炎）の色にだけ使う。地図が夜に受ける光は、白に寄せた夜の場 N（tonemath.ts の NIGHT）
 */
export const KEY_HEX = {
  candle: '#ff8500',    // ろうそく 1850 K
  tungsten: '#ffae59',  // 白熱電球 2700 K
  led: '#ffd4a5',       // LED 4000 K
  panel: '#ffe7d0',     // 天井の灯り 5000 K
} as const;
/** 灯りの色温度（K） */
export const KEY_K: Readonly<Record<keyof typeof KEY_HEX, number>> = { candle: 1850, tungsten: 2700, led: 4000, panel: 5000 };
