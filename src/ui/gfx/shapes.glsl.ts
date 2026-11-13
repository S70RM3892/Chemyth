/**
 * 形の層のシェーダー（SPEC2 §6.H H3・H4）。式は sdf.ts の JS の見本（fragShape・shadeAt）と同じ。
 * - SH0：形を 1 つずつ四角 1 枚で描き（インスタンス。四角の角が属性 0、形の 8 つの数が属性 1・2）、形の距離から 1 画素ぶん
 *   ぼかした縁をつけて tShape（R いちばん上の面の高さ、G 層/16、B 浮いた物の下の面、A 床から積み上がった物の高さ）に塗る。
 *   どれも大きいほうを残せばよい量なので、水の段を混ぜずに書いたあと（uWater = 1、縁はくっきり）、形を blendEquation(MAX) で重ねる。
 *   地面は消すときの値（0.1, 1/16, 0, 0.1）
 * - SH1：tShape から影（光の向きへ 12 歩。接地点でくっきり、離れるほどぼける。浮いた線路の下は低い光がくぐる）、
 *   くぼみの陰り（4 方向 × 3 歩、床から積み上がった物が自分より高いときだけ。天面と、0.18 マスより離れた地面にはつかない）、
 *   面の傾き（縁の上の側だけ）を作り、tShade（r 影、g 陰り、b 傾き 0.5 が平ら、a 天面）に書く。ぼかしの段はない
 * 精度（D2）：位置・uv・世界の座標は highp。pow・exp・log と、sin を使った乱数は使わない（この 2 つは乱数をまったく使わない）。
 * 整数を使う（形の種類を取り出す）ので highp int も宣言する。データで決まる分かれ道の中の読みこみは textureLod(…, 0.0)。
 * SH1 の手間（§4.3 の数え方）：読みこみ 25（中心 1、影 12、陰り 12。面の傾きは陰りの 1 歩目の 4 点を使う）、
 * 計算はおよそ 154（影 1 歩 8 × 12 − 1、陰り 42、傾き 12、仕上げ 5）。影の歩く位置は頂点で計算して渡す（画面を覆う三角形 1 枚なので、
 * 補間しても正確）
 */
import { AO_BIAS, AO_STEPS, AO_TOP, SHADOW_STEPS } from './sdf';

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
/** GLSL の小数（必ず小数点をつける） */
const f = (x: number) => { const s = Number.isInteger(x) ? x.toFixed(1) : x.toPrecision(9).replace(/0+$/, ''); return s.endsWith('.') ? s + '0' : s; };

/** SH0 の属性の番号（layout で決めてある） */
export const SH0_ATTR = { aQ: 0, aBox: 1, aPar: 2 } as const;
/** SH0 の四角の角（TRIANGLE_STRIP で 4 頂点） */
export const SH0_QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
/** 形 1 つぶんのバイト数（属性 1 が 0 バイト目から、属性 2 が 16 バイト目から、どちらも vec4、divisor 1） */
export const SH0_BYTES = 32;

/** SH0 の頂点：形の外の四角に 1 画素ぶん足した四角を、世界の位置から tShape の clip へ */
export const VS_SH0 = HEAD + `layout(location = 0) in vec2 aQ;
layout(location = 1) in vec4 aBox;
layout(location = 2) in vec4 aPar;
uniform vec2 uCam, uK;
uniform float uAA;
out vec2 vP;
flat out vec4 vA;
flat out vec4 vH;
void main() {
  int kc = int(aPar.y + 0.5), kind = kc & 15;
  vec2 c, lo, hi;
  if (kind == 2) {
    // カプセル：aBox は軸の両端。vP は始点からの位置
    vec2 ax = aBox.zw - aBox.xy;
    float r = max(aPar.z, 0.0);
    c = aBox.xy; lo = min(ax, vec2(0.0)) - r; hi = max(ax, vec2(0.0)) + r;
    vA = vec4(ax, r, 0.0);
  } else {
    // ほか：aBox は外の四角。vP は中心からの位置。円とドームの半径は短い辺の半分、角の丸みと面取りは短い辺の半分まで
    c = (aBox.xy + aBox.zw) * 0.5;
    vec2 b = abs(aBox.zw - aBox.xy) * 0.5;
    float m = min(b.x, b.y);
    lo = -b; hi = b;
    vA = vec4(b, (kind == 1 || kind == 4) ? m : clamp(aPar.z, 0.0, m), 0.0);
  }
  vH = vec4(aPar.x, float(kind), float(kc >> 4), aPar.w);
  vP = mix(lo - uAA, hi + uAA, aQ);
  gl_Position = vec4((c - uCam + vP) * uK, 0.0, 1.0);
}`;

/** SH0 の画素：形の距離 → 覆いの割合 → 高さ・層・浮いた物の下の面・床から積み上がった物の高さ（浮いた物は書かない） */
export const FS_SH0 = HEAD + `in vec2 vP;
flat in vec4 vA;
flat in vec4 vH;
uniform float uInvAA, uWater;
out vec4 o;
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0));
}
float sdRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdOct(vec2 p, vec2 b, float c) {
  p = abs(p);
  float d = max(max(p.x - b.x, p.y - b.y), (p.x + p.y - (b.x + b.y - c)) * 0.70710678);
  if (d <= 0.0) return d;
  vec2 B = vec2(b.x - c, b.y), C = vec2(b.x, b.y - c);
  return min(min(seg(p, vec2(0.0, b.y), B), seg(p, B, C)), seg(p, C, vec2(b.x, 0.0)));
}
void main() {
  int kind = int(vH.y + 0.5);
  float d;
  if (kind == 2) d = seg(vP, vec2(0.0), vA.xy) - vA.z;
  else if (kind == 1 || kind == 4) d = length(vP) - vA.z;
  else if (kind == 3) d = sdOct(vP, vA.xy, vA.z);
  else d = sdRect(vP, vA.xy, vA.z);
  if (uWater > 0.5) {
    // 水の段：混ぜずに書く。画素の中心が中にあるときだけ（ひと続きの継ぎ目に隙間も重なりも出ない）
    if (d > 0.0) discard;
    o = vec4(0.0);
    return;
  }
  float cov = clamp(0.5 - d * uInvAA, 0.0, 1.0);
  if (cov <= 0.0) discard;
  float h = vH.x * cov;
  if (kind == 4) { float q = length(vP) / vA.z; h = vH.x * sqrt(max(1.0 - q * q, 0.0)); }
  o = vec4(h, step(0.5, cov) * vH.z * 0.0625, vH.w * cov, vH.w > 0.0 ? 0.0 : h);
}`;

/** SH1 の頂点：画面を覆う三角形（属性 0 の p）。tShape の uv と、影の 12 歩の位置（2 歩ずつ vec4 に）を渡す */
export const VS_SH1 = HEAD + `layout(location = 0) in vec2 p;
uniform vec2 uShapeScale, uShapeOff, uD;
out vec2 vS;
${Array.from({ length: SHADOW_STEPS / 2 }, (_, k) => `out vec4 vM${k};`).join('\n')}
void main() {
  vS = (p * 0.5 + 0.5) * uShapeScale + uShapeOff;
  vec4 s = vS.xyxy, d = uD.xyxy;
${Array.from({ length: SHADOW_STEPS / 2 }, (_, k) => `  vM${k} = s + d * vec4(vec2(${f((2 * k + 1) / SHADOW_STEPS)}), vec2(${f((2 * k + 2) / SHADOW_STEPS)}));`).join('\n')}
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/**
 * 影の 1 歩（歩 i、t = i/12）：光の線の高さ r = h0 + t が、物の占める [0, hs]（A）と [l, h]（B, R）の外を通る余りを t で割る。
 * c/t − 1 = max(h0 − h, min(l − h0 − 2t, h0 − hs))/t（sdf.ts の shadeAt と同じ）
 */
function shadowStep(i: number): string {
  const t = i / SHADOW_STEPS, k = (i - 1) >> 1, at = `vM${k}.${i % 2 ? 'xy' : 'zw'}`;
  const ratio = `max(h0 - s.r, min(s.b - c, h0 - s.a)) * ${f(1 / t)}`;
  return `  s = textureLod(uShape, ${at}, 0.0); c = h0 + ${f(2 * t)}; m = ${i === 1 ? ratio : `min(m, ${ratio})`};`;
}
/** くぼみの陰りの j 歩目（0 から）：4 方向の、床から積み上がった物の高さ（A）。1 歩目はいちばん上の面（R）を面の傾きにも使う */
function aoStep(j: number): string {
  const x = `uAOX.${'xyz'[j]}`, y = `uAOY.${'xyz'[j]}`;
  return `  e = HA(vec2(vS.x + ${x}, vS.y)); w = HA(vec2(vS.x - ${x}, vS.y)); n = HA(vec2(vS.x, vS.y + ${y})); q = HA(vec2(vS.x, vS.y - ${y}));
${j === 0 ? '  ge = e.x; gw = w.x; gn = n.x; gs = q.x;\n' : ''}  A.${'xyz'[j]} = max(e.y, hT) + max(w.y, hT) + max(n.y, hT) + max(q.y, hT);`;
}

/** SH1 の画素 */
export const FS_SH1 = HEAD + `uniform sampler2D uShape;
uniform float uK, uVis, uAOS, uAOMax;
uniform vec3 uAOX, uAOY, uAOW;
uniform vec2 uBev;
in vec2 vS;
${Array.from({ length: SHADOW_STEPS / 2 }, (_, k) => `in vec4 vM${k};`).join('\n')}
out vec4 o;
vec2 HA(vec2 p) { return textureLod(uShape, p, 0.0).ra; }
void main() {
  float h0 = textureLod(uShape, vS, 0.0).r;
  // 影：res = clamp(K·(1 + m))、m は余りと t の比のいちばん小さいもの（天面は、もっと高い物にだけ影をうける）
  vec4 s;
  float c, m;
${Array.from({ length: SHADOW_STEPS }, (_, i) => shadowStep(i + 1)).join('\n')}
  float shadow = uVis - uVis * clamp(uK * m + uK, 0.0, 1.0);
  // くぼみの陰り：床から積み上がった物が自分より ${f(AO_BIAS)} 以上高いときだけ（Σ max(hs, hT) − 4·hT が Σ max(0, hs − hT)）。
  // 陰りを受けるのは地面と水だけ
  float hT = h0 + ${f(AO_BIAS)}, ge, gw, gn, gs;
  vec2 e, w, n, q;
  vec3 A;
${Array.from({ length: AO_STEPS }, (_, j) => aoStep(j)).join('\n')}
  float ao = clamp(dot(A, uAOW) - hT * uAOS, 0.0, uAOMax) * step(h0, ${f(AO_TOP)});
  // 面の傾き：1 歩目の 4 点の差と光の向き。まわりより高い側（縁の上）だけ
  float up = step((ge + gw + gn + gs) * 0.25, h0);
  float bevel = 0.5 + up * clamp(dot(vec2(ge - gw, gn - gs), uBev), -0.5, 0.5);
  o = vec4(shadow, ao, bevel, step(${f(AO_TOP)}, h0));
}`;

/** プログラムごとの uniform の名前（shapes.ts が場所を引く。検査で、ソースにあることと sdf.ts の値と揃っていることを確かめる） */
export const SH0_UNIFORMS = ['uCam', 'uK', 'uAA', 'uInvAA', 'uWater'] as const;
export const SH1_UNIFORMS = ['uShapeScale', 'uShapeOff', 'uD', 'uShape', 'uK', 'uVis', 'uAOX', 'uAOY', 'uAOW', 'uAOS', 'uAOMax', 'uBev'] as const;
