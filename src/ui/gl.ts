/**
 * WebGL の合成段。
 * 地図の絵そのものは、これまでどおり Canvas 2D で描く（scene）。それを「素材の層」として受け取り、
 * 別に描いた発光の層（glow）と効果の層（mask：赤＝熱、青＝水面、緑＝色を守る所）を合わせて、Canvas ではできなかった処理をかける。
 *  - 発光：光っている所を 3 段にぼかして重ねる（近くのにじみ、中くらいの暈、遠くまで届く明かり）
 *  - 照明：遠くまで届く明かりで、まわりの地面や設備を照らす。暗いテーマでは、光のない所が沈む
 *  - 熱のゆらぎ：炉や炎の上で、背景の絵がゆらぐ
 *  - 水面：海や入り江で、絵がさざ波でゆれ、きらめきが走る
 *  - 仕上げ：浮き彫りの陰影、周辺の減光、粒子、走査線、色のにじみ、色調
 *  - 最高画質：高さの層から落とす影と、くぼみの陰り（太陽の向きは実際の時刻で変わる）、光の筋（明るい所から放射状にのびる光）、
 *    レンズの光の筋、雲の影、水面の映り込み・照り返し・波打ち際の泡、色調の仕上げ。立体表示では、遠くのかすみと、上下のぼかし。
 *    研究所の床は磨いてあるので、装置と灯が床に映る（reflect）
 */
export interface PostParams {
  time: number;
  /** 光のない所の明るさ（1 で元の絵のまま） */
  ambient: number;
  /** 発光がまわりを照らす強さ */
  spill: number;
  /** 発光のにじみの強さ */
  bloom: number;
  /** 絵の明るい所を発光として拾う強さと、しきい値（0 なら拾わない。明るいテーマでは紙まで光ってしまうので 0） */
  bright: number;
  threshold: number;
  vignette: number;
  grain: number;
  scan: number;
  /** 色のにじみ（画面の端で赤と青がずれる） */
  aberration: number;
  /** 浮き彫りの陰影 */
  relief: number;
  /** 水面のきらめきの強さ */
  glint: number;
  /** 色調（r, g, b の掛け率） */
  tint: [number, number, number];
  /** 高さの層から落とす影・くぼみの陰り・面の傾きの陰影の強さ（0 なら計算しない） */
  shadow: number; ao: number; bevel: number;
  /** 光の来る向き（画面の右が +x、下が +y）、影の長さ（高さ 1 につき何マス）、1 マスの大きさ（高さの層の画素） */
  sun: [number, number]; sunLen: number; tile: number;
  /** 日なたの色（ほんの少し色づける） */
  sunColor: [number, number, number];
  /** 光の筋：明るい所から godPos（画面の 0〜1、下が 0）を中心に外へのびる（0 なら計算しない） */
  god: number; godPos: [number, number];
  /** レンズの光の筋。streakDir 0：横、1：斜めの十字。（0 なら計算しない） */
  streak: number; streakDir: number; streakTint: [number, number, number];
  /** 雲の影（地図に貼りついて流れる）。0 なら計算しない */
  cloud: number;
  /** 水面に映る空の強さと色 */
  waterRefl: number; sky: [number, number, number];
  /** 色調：彩度、コントラスト、暗い所の色、明るい所の色 */
  sat: number; contrast: number; shadowTint: [number, number, number]; hiTint: [number, number, number];
  /** 立体表示：遠くのかすみ（色）と、上下のぼかし */
  fog: number; fogColor: [number, number, number]; tilt: number;
  /** 磨いた床の映り込みの強さ（最高画質の平らな表示で、高さの層があるときだけ。0 なら計算しない） */
  reflect: number;
  /** カメラ：中心のマス（x, y）と、1 マスの画素数（画面の画素） */
  cam: [number, number, number];
}
/** 立体表示の 1 コマ分の材料 */
export interface Scene3 {
  /** 地面の絵と、大きな装置の天面の絵（同じ範囲を、同じ大きさで描いたもの。天面は透明地） */
  ground: TexImageSource; top: TexImageSource;
  /** 絵が覆っている世界の範囲 [x0, y0, x1, y1]（マス） */
  rect: [number, number, number, number];
  /** 世界 → 画面の変換 */
  vp: Float32Array;
  /** 箱：1 個につき [x, y, 大きさ, 高さ, r, g, b, 層（0＝天面は地面の絵、1＝天面の絵）] */
  boxes: Float32Array; count: number;
  /** boxes の count 個のあとに続く、宙に浮く半透明の板の数（1 階から見た 2 階の設備。層は 2） */
  slabs: number;
  /** 天面の絵を置く高さ */
  topH: number;
  /** 輪郭線の色、地面に落ちる影の濃さ */
  ink: [number, number, number]; shadow: number;
  /** 画面に直接描いた光（花火など）。なければ null */
  glowScreen: TexImageSource | null;
  /** 最高画質：箱の足もとの陰りの強さ、箱の材質の強さ（0 なら前の見た目）、スキン（0 文具・1 工業・2 魔術・3 研究所）、暗いテーマか */
  ao: number; rich: number; skin: number; dark: boolean;
}
export interface Post {
  /** 絵の大きさ（画素）を合わせる */
  resize(w: number, h: number): void;
  render(scene: TexImageSource, glow: TexImageSource, mask: TexImageSource, p: PostParams, height?: TexImageSource | null): void;
  /** 立体表示：地面・箱・天面を遠近カメラで描いてから、同じ合成をかける。glow と mask は、地面の絵と同じ範囲に描いたもの */
  render3d(s: Scene3, glow: TexImageSource, mask: TexImageSource, p: PostParams): void;
  lost(): boolean;
}

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

/** 発光の層に、絵の明るい所を足す */
const FS_PRE = `#version 300 es
precision highp float;
uniform sampler2D uGlow, uGlow2, uScene; uniform float uBright, uThr, uUse2;
in vec2 uv; out vec4 o;
void main() {
  vec3 s = texture(uScene, uv).rgb;
  float l = max(s.r, max(s.g, s.b));
  o = vec4(texture(uGlow, uv).rgb + texture(uGlow2, uv).rgb * uUse2 + s * smoothstep(uThr, uThr + 0.18, l) * uBright, 1.0);
}`;

// ---- 立体表示 ----
/** 平面（地面、天面）。uRect の範囲に絵を貼り、高さ uH に置く */
const VS_PLANE = `#version 300 es
uniform mat4 uVP; uniform vec4 uRect; uniform float uH;
layout(location = 0) in vec2 p; out vec2 uv;
void main() {
  vec2 q = p * 0.5 + 0.5;
  vec2 w = mix(uRect.xy, uRect.zw, q);
  uv = vec2(q.x, 1.0 - q.y);
  gl_Position = uVP * vec4(w.x, uH, w.y, 1.0);
}`;
const FS_PLANE = `#version 300 es
precision highp float;
uniform sampler2D uTex, uShadow, uAO; uniform vec2 uRes; uniform float uShade, uAOK;
in vec2 uv; out vec4 o;
void main() {
  vec4 c = texture(uTex, uv);
  // 地面には、箱の影が落ちる（影は別に描いてぼかしてある）。箱の足もとは、まわりより少し暗い（くぼみの陰り）
  if (uShade > 0.0) c.rgb *= 1.0 - texture(uShadow, gl_FragCoord.xy / uRes).r * uShade;
  if (uAOK > 0.0) c.rgb *= 1.0 - texture(uAO, gl_FragCoord.xy / uRes).r * uAOK;
  o = c;
}`;
/** 光の層と効果の層を、同じ形で画面へ写す */
const FS_PLANE_B = `#version 300 es
precision highp float;
uniform sampler2D uGlow, uMask;
in vec2 uv; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
void main() { o0 = vec4(texture(uGlow, uv).rgb, 1.0); o1 = vec4(texture(uMask, uv).rgb, 1.0); }`;
/** 箱（まとめて描く）。天面は絵をそのまま貼り、側面は絵の縁の色を下へ引きのばす */
const VS_BOX = `#version 300 es
uniform mat4 uVP; uniform vec4 uRect; uniform vec3 uSh;
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNor; layout(location = 2) in vec2 aFace;
layout(location = 3) in vec4 iBox; layout(location = 4) in vec4 iCol;
out vec2 uv; out vec3 nor; out vec2 face; out vec4 col; out vec2 bsz;
void main() {
  bsz = vec2(iBox.z, iBox.w);
  vec2 w = iBox.xy + aPos.xz * iBox.z;
  // 層 2 は、2 階の高さに浮く板
  float y = (iCol.a > 1.5 ? 2.0 : 0.0) + aPos.y * iBox.w;
  // 側面は、天面の縁から少し内側の色を使う
  vec2 sp = w - aNor.xz * min(0.13, iBox.z * 0.12);
  uv = vec2((sp.x - uRect.x) / (uRect.z - uRect.x), 1.0 - (sp.y - uRect.y) / (uRect.w - uRect.y));
  nor = aNor; face = aFace; col = iCol;
  // 影：光の向きに沿って、地面へ押しつぶす
  if (uSh.z > 0.5) { w += uSh.xy * y; y = 0.0; }
  gl_Position = uVP * vec4(w.x, y, w.y, 1.0);
}`;
const FS_BOX = `#version 300 es
precision highp float;
uniform sampler2D uGround, uTop; uniform vec3 uInk; uniform float uSkin, uDark, uRich;
in vec2 uv; in vec3 nor; in vec2 face; in vec4 col; in vec2 bsz; out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (col.a > 1.5) {
    // 2 階の設備：色のついた半透明の板
    float l = nor.y > 0.5 ? 1.0 : nor.z > 0.5 ? 0.7 : 0.55;
    o = vec4(col.rgb * l, 1.0) * 0.5;
    return;
  }
  vec4 g = col.a < 0.5 ? texture(uGround, uv) : texture(uTop, uv);
  vec3 base = g.rgb + col.rgb * (1.0 - g.a);
  if (nor.y > 0.5) {
    // 天面の縁：光の来る北と西の縁は明るく、南と東の縁は暗く（面取りした角に見える）
    float k = 0.05 / max(bsz.x, 0.5);
    float lit = max(1.0 - smoothstep(0.0, k, face.x), 1.0 - smoothstep(0.0, k, face.y));
    float dark = max(smoothstep(1.0 - k, 1.0, face.x), smoothstep(1.0 - k, 1.0, face.y));
    o = vec4(base * (1.0 + (lit * 0.22 - dark * 0.18) * uRich), 1.0);
    return;
  }
  // 側面：絵の縁の色と装置の色を混ぜ、面の向きで明るさを変え、下ほど暗くする。角と地面との境に輪郭線
  vec3 side = mix(col.rgb, base, 0.6);
  float sh = nor.z > 0.5 ? 0.66 : nor.x < -0.5 ? 0.86 : nor.x > 0.5 ? 0.54 : 0.5;
  side *= sh * (0.74 + 0.26 * face.y);
  if (uRich > 0.0) {
    float w = bsz.x, hgt = bsz.y;
    if (uSkin < 0.5) {
      // 文具：厚紙の箱。うすい罫線と、上の縁の白い切り口
      side *= 1.0 - 0.07 * step(0.9, fract(face.y * hgt * 9.0)) * uRich;
      side = mix(side, vec3(1.0) * (uDark > 0.5 ? 0.75 : 1.0), smoothstep(0.93, 0.97, face.y) * 0.35 * uRich);
    } else if (uSkin < 1.5) {
      // 工業：鋼板の継ぎ目と鋲、下の縁に油じみ
      float seam = smoothstep(0.955, 0.985, fract(face.x * w * 2.0));
      vec2 rv = vec2(fract(face.x * w * 2.0) - 0.5, (face.y - 0.82) * hgt * 2.0);
      float rivet = 1.0 - smoothstep(0.07, 0.11, length(rv));
      side *= 1.0 - seam * 0.4 * uRich;
      side += rivet * (uDark > 0.5 ? 0.06 : 0.16) * uRich;
      side *= 1.0 - (1.0 - smoothstep(0.0, 0.25, face.y)) * 0.25 * uRich;
    } else if (uSkin < 2.5) {
      // 魔術：木目と、上の縁の真鍮の帯
      float gr = sin(face.x * w * 26.0 + sin(face.y * hgt * 5.0 + face.x * 3.0) * 2.4 + hash(vec2(floor(face.y * hgt * 7.0), 1.0)) * 6.0);
      side *= 0.93 + 0.07 * gr * uRich;
      float band = smoothstep(0.8, 0.83, face.y) * (1.0 - smoothstep(0.93, 0.96, face.y));
      vec3 brass = vec3(0.78, 0.6, 0.27) * (uDark > 0.5 ? 0.75 : 1.0) * (0.75 + 0.35 * face.y);
      side = mix(side, brass * sh * 1.25, band * 0.85 * uRich);
    } else {
      // 研究所：つやのあるパネル（昼は白、夜は黒）。マスごとの細い継ぎ目、上の縁に沿って光る帯、斜めに走る照り、足もとの黒い帯
      float dk = uDark > 0.5 ? 1.0 : 0.0;
      side = mix(side, mix(vec3(0.9, 0.93, 0.95), vec3(0.13, 0.17, 0.22), dk) * sh * (0.8 + 0.25 * face.y), 0.55 * uRich);
      float seam = smoothstep(0.972, 0.992, fract(face.x * w));
      side *= 1.0 - seam * 0.3 * uRich;
      float spec = exp(-pow((face.x - 0.25 - face.y * 0.35) * 5.0, 2.0)) * (0.35 + 0.65 * face.y);
      side += vec3(0.85, 0.95, 1.0) * spec * mix(0.16, 0.1, dk) * uRich;
      float led = smoothstep(0.84, 0.86, face.y) * (1.0 - smoothstep(0.895, 0.915, face.y));
      side = mix(side, mix(vec3(0.05, 0.72, 0.82), vec3(0.2, 1.0, 0.92), dk), led * 0.92 * uRich);
      side *= 1.0 - (1.0 - smoothstep(0.0, 0.1, face.y)) * 0.45 * uRich;
    }
    // 光の当たる西の面の、上ほど強い照り
    if (nor.x < -0.5) side += vec3(1.0) * pow(face.y, 3.0) * 0.08 * uRich;
  }
  float ex = fwidth(face.x) * 1.4, ey = fwidth(face.y) * 1.4;
  float line = max(max(step(face.x, ex), step(1.0 - ex, face.x)), max(step(face.y, ey), step(1.0 - ey, face.y)));
  o = vec4(mix(side, side * 0.3 + uInk * 0.08, line), 1.0);
}`;
const FS_BOX_B = `#version 300 es
precision highp float;
uniform sampler2D uGlow, uMask;
in vec2 uv; in vec3 nor; in vec2 face; in vec4 col; in vec2 bsz; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
void main() {
  if (nor.y > 0.5) { o0 = vec4(texture(uGlow, uv).rgb, 1.0); o1 = vec4(texture(uMask, uv).rgb, 1.0); }
  else { o0 = vec4(0.0, 0.0, 0.0, 1.0); o1 = vec4(0.0, 0.0, 0.0, 1.0); }
}`;
const FS_WHITE = `#version 300 es
precision highp float;
in vec2 uv; in vec3 nor; in vec2 face; in vec4 col; in vec2 bsz; out vec4 o;
void main() { o = vec4(1.0); }`;

/** 9 点のガウスぼかし（横と縦に分けてかける） */
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uDir;
in vec2 uv; out vec4 o;
void main() {
  vec3 c = texture(uTex, uv).rgb * 0.2270270270;
  c += (texture(uTex, uv + uDir * 1.3846153846).rgb + texture(uTex, uv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, uv + uDir * 3.2307692308).rgb + texture(uTex, uv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;

/** 高さの層から、影・くぼみの陰り・面の傾きの陰影を作る（高さの層と同じ、画面の 1/3 の細かさ）
 *  r：影（0 日なた〜1 影）、g：くぼみの陰り、b：面の傾きの明るさ（0.5 が平ら） */
const FS_SHADE = `#version 300 es
precision highp float;
uniform sampler2D uH; uniform vec2 uPx; uniform vec2 uL; uniform float uSlope, uTile;
in vec2 uv; out vec4 o;
const int N = 14;
void main() {
  float h0 = texture(uH, uv).r;
  // 影：光の来る向きへ歩き、途中に光線より高いものがあれば影（遠いものほど薄く、ぼやける）
  float sh = 0.0;
  vec2 side = vec2(-uL.y, uL.x) * 0.35;
  for (int i = 1; i <= N; i++) {
    float f = float(i);
    vec2 q = uv + uL * f;
    float hq = max(texture(uH, q).r, texture(uH, q + side * f * 0.25).r * 0.9);
    float over = hq - (h0 + uSlope * f);
    sh = max(sh, clamp(over * 9.0, 0.0, 1.0) * (1.0 - f / float(N + 2) * 0.55));
  }
  // くぼみの陰り：まわりのほうが高ければ暗い
  float ao = 0.0, r1 = max(1.0, uTile * 0.16), r2 = max(2.0, uTile * 0.42);
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.785398;
    vec2 d = vec2(cos(a), sin(a)) * uPx;
    ao += max(0.0, texture(uH, uv + d * r1).r - h0) * 1.2 + max(0.0, texture(uH, uv + d * r2).r - h0) * 0.7;
  }
  ao = clamp(ao * 0.55, 0.0, 1.0);
  // 面の傾き：高さの差から向きを出し、光の向きとの角度で明るさを決める
  float hx = texture(uH, uv + vec2(uPx.x, 0.0)).r - texture(uH, uv - vec2(uPx.x, 0.0)).r;
  float hy = texture(uH, uv + vec2(0.0, uPx.y)).r - texture(uH, uv - vec2(0.0, uPx.y)).r;
  vec3 n = normalize(vec3(-hx * uTile * 0.9, -hy * uTile * 0.9, 1.0));
  vec3 L = normalize(vec3(normalize(uL + 1e-6), 0.9));
  float dif = dot(n, L) - L.z;
  o = vec4(sh, ao, clamp(0.5 + dif * 0.9, 0.0, 1.0), 1.0);
}`;

/** 光の筋：明るい所を、中心から外へ向かってぼかし重ねる（光の散乱を画面の上で近似する方法） */
const FS_GOD = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uPos; uniform float uDecay, uDensity;
in vec2 uv; out vec4 o;
const int N = 28;
void main() {
  vec2 dir = (uv - uPos) * (uDensity / float(N));
  vec2 tc = uv; vec3 acc = vec3(0.0); float w = 1.0;
  for (int i = 0; i < N; i++) {
    tc -= dir;
    vec3 c = texture(uTex, tc).rgb;
    acc += max(c - 0.05, 0.0) * w;
    w *= uDecay;
  }
  o = vec4(acc * (3.2 / float(N)), 1.0);
}`;

/** レンズの光の筋の 1 段目：とても明るい所だけを拾い、決まった向きに長くぼかす */
const FS_STREAK = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uDir; uniform float uThr;
in vec2 uv; out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  for (int i = -6; i <= 6; i++) {
    float f = float(i);
    vec3 t = texture(uTex, uv + uDir * f).rgb;
    c += max(t - uThr, 0.0) * (1.0 - abs(f) / 7.0);
  }
  o = vec4(c * 0.22, 1.0);
}`;

const FS_COPY = `#version 300 es
precision highp float;
uniform sampler2D uTex; in vec2 uv; out vec4 o;
void main() { o = vec4(texture(uTex, uv).rgb, 1.0); }`;

const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene, uB1, uB2, uB3, uMask, uShade, uGod, uStreak, uSoft, uStreak2, uHgt;
uniform vec2 uRes;
uniform float uRefl, uReach;
uniform float uTime, uAmbient, uSpill, uBloom, uVig, uGrain, uScan, uAb, uRelief, uGlint;
uniform vec3 uTint;
uniform float uShadow, uAO, uBevel, uGodK, uStreakK, uStreak2K, uCloud, uWaterRefl, uSat, uContrast, uFog, uTilt;
uniform vec3 uSunCol, uStreakTint, uSky, uShTint, uHiTint, uFogCol, uCam;
uniform vec2 uSunDir;
in vec2 uv; out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.03 + 7.1) * 0.3 + noise(p * 4.1 - 3.7) * 0.15; }
const vec3 LUM = vec3(0.299, 0.587, 0.114);
void main() {
  vec3 m = texture(uMask, uv).rgb;
  vec2 px = 1.0 / uRes, q = uv * uRes;
  // 地図の上の位置（マス）。雲と水面の模様を、地図に貼りつける
  vec2 wp = uCam.xy + vec2(q.x - uRes.x * 0.5, uRes.y * 0.5 - q.y) / max(uCam.z, 1.0);
  // 熱のゆらぎ：上へ流れる乱れで、背景の絵をずらす
  // （熱も水もない所では、乱れの計算を省く。画面のほとんどがそうなので、軽くなる）
  vec2 d = vec2(0.0);
  if (m.r > 0.004) d = (vec2(noise(q * 0.045 + vec2(0.0, -uTime * 2.2)), noise(q * 0.07 + vec2(3.1, -uTime * 3.1))) - 0.5) * m.r * 9.0 * px;
  // 水面：ゆっくりしたさざ波
  if (m.b > 0.004) d += vec2(sin(q.x * 0.06 + uTime * 1.4 + sin(q.y * 0.05) * 1.5), sin(q.y * 0.08 - uTime * 1.1)) * m.b * 1.8 * px;
  // 緑の所（装置の中身）は、ゆらさず、照らさず、にじませない。物質の色を、そのまま見せる
  float keep = m.g;
  d *= 1.0 - keep;
  vec2 c = uv - 0.5;
  vec3 s = uAb > 0.0
    ? vec3(texture(uScene, uv + d + c * uAb).r, texture(uScene, uv + d).g, texture(uScene, uv + d - c * uAb).b)
    : texture(uScene, uv + d).rgb;
  // 立体表示：画面の上下をぼかして、ミニチュアを近くから撮ったように見せる
  if (uTilt > 0.0) s = mix(s, texture(uSoft, uv).rgb, smoothstep(0.2, 0.52, abs(uv.y - 0.44)) * uTilt);
  vec3 b1 = texture(uB1, uv).rgb, b2 = texture(uB2, uv).rgb, b3 = texture(uB3, uv).rgb;
  // 浮き彫り：明るさの傾きから、左上から光が当たっているように縁を起こす（高さの層があるときは、そちらで陰影をつける）
  float l = dot(s, LUM);
  float rel = uBevel > 0.0 ? 0.0 : clamp(dot(vec2(dFdx(l), dFdy(l)), vec2(-1.0, 1.0)) * uRelief * 6.0, -0.22, 0.22);
  // 照明：光のない所は ambient まで沈み、発光の広いぼかしが、まわりを照らす
  vec3 light = min(vec3(uAmbient) + (b3 + b2 * 0.5) * uSpill, vec3(1.3));
  light = mix(light, vec3(1.0), keep);
  // 日の光：高さの層から作った影・くぼみの陰り・面の傾き。影は少し青く、日なたは少し日の色に
  if (uShadow + uAO + uBevel > 0.0) {
    vec3 sh = texture(uShade, uv).rgb;
    float shade = (1.0 - sh.r * uShadow) * (1.0 - sh.g * uAO) * (1.0 + (sh.b - 0.5) * 2.0 * uBevel);
    vec3 tone = mix(vec3(0.86, 0.92, 1.08), uSunCol, clamp(1.0 - sh.r * 1.5, 0.0, 1.0));
    light *= mix(shade * mix(vec3(1.0), tone, 0.5 * (uShadow > 0.0 ? 1.0 : 0.0)), vec3(1.0), keep * 0.7);
  }
  // 雲の影：地図に貼りついて、ゆっくり流れる
  if (uCloud > 0.0) {
    float n = fbm(wp * 0.05 + vec2(uTime * 0.018, uTime * 0.009));
    light *= 1.0 - smoothstep(0.5, 0.78, n) * uCloud * (1.0 - keep);
  }
  vec3 col = clamp(s * light * (1.0 + rel), 0.0, 1.0);
  // 磨いた床の映り込み（研究所）：床の点から奥（画面の上）へ高さの層をたどり、背の高い物の足もとを見つけたら、
  // 足もとを境に折り返した所の絵を、ぼかして薄く重ねる。背の高い物ほど長く映り、足もとから離れるほど薄れる。
  // 灯（発光のぼかし）は、奥から縦に集めて、床に落ちる光の筋にする。水と、装置・ベルトの上には映さない
  if (uRefl > 0.0) {
    float h0 = texture(uHgt, uv).r;
    float fl = smoothstep(0.05, 0.08, h0) * (1.0 - smoothstep(0.14, 0.2, h0)) * (1.0 - keep);
    if (fl > 0.0) {
      float fres = 0.6 + 0.4 * uv.y;
      float d = 0.0, hh = 0.0;
      for (int i = 1; i <= 9; i++) {
        float f = float(i) * uReach * 0.17;
        float hq = texture(uHgt, uv + vec2(0.0, f)).r;
        if (hq > 0.2) { d = f; hh = hq; break; }
      }
      // 装置の手前の側面（足もとから上へ 0.15 マスほど）は、床ではないので映さない
      float a = d - uReach * 0.15;
      if (d > 0.0 && a > 0.0) {
        float k = 1.0 - smoothstep(0.0, (hh - 0.1) * uReach * 1.5, a);
        vec2 src = uv + vec2(0.0, 2.0 * a);
        // 足もとから離れるほど、ぼやける（縦に長くぼかすと、つやのある床らしくなる）
        vec2 bl = px * (1.5 + 8.0 * a / max(uReach, 1e-4));
        vec3 rc = (texture(uScene, src).rgb * 2.0 + texture(uScene, src + vec2(bl.x, bl.y * 2.5)).rgb + texture(uScene, src - vec2(bl.x, bl.y * 2.5)).rgb
          + texture(uScene, src + vec2(bl.x * 0.5, -bl.y * 5.0)).rgb + texture(uScene, src + vec2(-bl.x * 0.5, bl.y * 5.0)).rgb) / 6.0;
        col = mix(col, rc * light, clamp(k * fres * uRefl * fl, 0.0, 0.85));
      }
      vec3 lr = vec3(0.0);
      for (int i = 1; i <= 4; i++) {
        float f = float(i) * uReach * 0.3;
        lr += (texture(uB1, uv + vec2(0.0, f)).rgb + texture(uB2, uv + vec2(0.0, f * 1.5)).rgb) * (1.0 - float(i) * 0.2);
      }
      col = 1.0 - (1.0 - col) * (1.0 - clamp(lr * 0.32 * fres * uRefl * fl, 0.0, 1.0));
    }
  }
  // 発光のにじみ：足し算ではなく「スクリーン」で重ねる（明るい所が白く飛ばず、装置の中の色が残る）
  vec3 halo = clamp((b1 * 0.5 + b2 * 0.45 + b3 * 0.35) * uBloom, 0.0, 1.0) * (1.0 - keep * 0.92);
  if (uGodK > 0.0) halo += texture(uGod, uv).rgb * uGodK;
  if (uStreakK > 0.0) halo += (texture(uStreak, uv).rgb + texture(uStreak2, uv).rgb * uStreak2K) * uStreakTint * uStreakK;
  col = 1.0 - (1.0 - col) * (1.0 - clamp(halo, 0.0, 1.0));
  // 水面：空の映り込み、日の照り返し、底に揺れる光の網、波打ち際の泡
  if (m.b > 0.004) {
    vec2 wq = wp * 1.6;
    float n1 = noise(wq * 1.3 + vec2(uTime * 0.35, uTime * 0.12)), n2 = noise(wq * 2.1 - vec2(uTime * 0.27, -uTime * 0.21));
    vec3 nrm = normalize(vec3((n1 - 0.5) * 0.9, (n2 - 0.5) * 0.9, 1.0));
    float fres = pow(1.0 - nrm.z, 1.0) * 1.6 + 0.25;
    float rich = uWaterRefl > 0.0 ? 1.0 : 0.0;
    col = mix(col, col * 0.55 + uSky * 0.5, clamp(fres * uWaterRefl, 0.0, 0.7) * m.b * (1.0 - keep));
    vec3 hv = normalize(vec3(normalize(vec2(uSunDir.x, -uSunDir.y) + 1e-6) * 0.6, 1.0));
    col += uSunCol * pow(max(dot(nrm, hv), 0.0), 90.0) * 1.4 * m.b * uGlint * rich;
    float ca = abs(sin(wq.x * 2.6 + n1 * 5.0 + uTime * 0.6) + sin(wq.y * 2.3 + n2 * 5.0 - uTime * 0.5));
    col += vec3(0.85, 0.95, 1.0) * (1.0 - smoothstep(0.0, 0.3, ca)) * 0.07 * m.b * uGlint * rich;
    // 2 つの流れが重なった所だけが光る（細かい点が、流れながら点いたり消えたりする）
    float gl1 = noise(q * 0.085 + vec2(uTime * 0.5, uTime * 0.22)), gl2 = noise(q * 0.13 - vec2(uTime * 0.33, -uTime * 0.18));
    col += vec3(0.9, 0.97, 1.0) * smoothstep(0.5, 0.72, gl1 * gl2) * m.b * uGlint;
    // 岸：まわりに水でない所があれば、泡が寄せては返す
    float r = 5.0;
    float dry = 4.0 - (texture(uMask, uv + vec2(px.x, 0.0) * r).b + texture(uMask, uv - vec2(px.x, 0.0) * r).b + texture(uMask, uv + vec2(0.0, px.y) * r).b + texture(uMask, uv - vec2(0.0, px.y) * r).b);
    float foam = clamp(dry * 0.5, 0.0, 1.0) * smoothstep(0.35, 0.75, noise(wq * 3.0 + vec2(uTime * 0.8, 0.0)) + 0.25 * sin(uTime * 1.7 + wq.x));
    col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.55 * m.b * uGlint * rich);
  }
  // 遠くのかすみ（立体表示）
  if (uFog > 0.0) col = mix(col, uFogCol, smoothstep(0.42, 1.08, uv.y) * uFog);
  // 色調：彩度、コントラスト、暗い所と明るい所の色
  col *= uTint;
  float lum = dot(col, LUM);
  col = mix(vec3(lum), col, uSat);
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  col *= mix(uShTint, uHiTint, smoothstep(0.08, 0.9, lum));
  col *= 1.0 - smoothstep(0.35, 0.95, length(c * vec2(1.0, uRes.y / uRes.x) * 1.7)) * uVig;
  col += (hash(q + uTime * 60.0) - 0.5) * uGrain;
  col *= 1.0 - uScan * (0.5 + 0.5 * sin(q.y * 3.14159));
  o = vec4(col, 1.0);
}`;

interface Target { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

/** 合成段を作る。WebGL2 が使えなければ null */
export function createPost(canvas: HTMLCanvasElement): Post | null {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: typeof location !== 'undefined' && location.search.includes('gfx') });
  if (!gl) return null;
  let dead = false;
  canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); dead = true; });

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    return sh;
  };
  const program = (fs: string, vs = VS) => {
    const pr = gl.createProgram()!;
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
    if (vs === VS) gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'link');
    const u = new Map<string, WebGLUniformLocation | null>();
    return { pr, loc: (name: string) => { if (!u.has(name)) u.set(name, gl.getUniformLocation(pr, name)); return u.get(name)!; } };
  };
  let pre: ReturnType<typeof program>, blur: ReturnType<typeof program>, copy: ReturnType<typeof program>, fin: ReturnType<typeof program>;
  let shadeP: ReturnType<typeof program>, godP: ReturnType<typeof program>, streakP: ReturnType<typeof program>;
  try { pre = program(FS_PRE); blur = program(FS_BLUR); copy = program(FS_COPY); fin = program(FS_FINAL); shadeP = program(FS_SHADE); godP = program(FS_GOD); streakP = program(FS_STREAK); } catch { return null; }

  // 画面全体を覆う三角形 1 枚
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const texture = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const target = (w: number, h: number): Target => {
    const tex = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex, w, h };
  };
  const tScene = texture(), tGlow = texture(), tMask = texture(), tHeight = texture();
  let W = 0, H = 0, lv: Target[] = [];
  /** 最高画質の作業用：影（高さの層と同じ細かさ）、光の筋、レンズの光の筋（2 枚）、上下のぼかし（2 枚） */
  let shA: Target | null = null, shB: Target | null = null, god: Target | null = null, stA: Target | null = null, stB: Target | null = null, sfA: Target | null = null, sfB: Target | null = null;
  let hW = 0, hH = 0;
  const drop = (t: Target | null) => { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } };
  const free = () => {
    for (const t of lv) drop(t);
    lv = [];
    for (const t of [god, stA, stB, sfA, sfB]) drop(t);
    god = stA = stB = sfA = sfB = null;
  };

  const bind = (unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
  const into = (t: Target | null) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); gl.viewport(0, 0, t ? t.w : W, t ? t.h : H); };
  const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
  const upload = (tex: WebGLTexture, src: TexImageSource) => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); };
  /** a の中身をぼかして a に戻す（b を作業用に使う） */
  const blurInPlace = (a: Target, b: Target) => {
    gl.useProgram(blur.pr);
    into(b); bind(0, a.tex, blur.loc('uTex')); gl.uniform2f(blur.loc('uDir'), 1 / a.w, 0); tri();
    into(a); bind(0, b.tex, blur.loc('uTex')); gl.uniform2f(blur.loc('uDir'), 0, 1 / a.h); tri();
  };
  const down = (from: Target, to: Target) => { gl.useProgram(copy.pr); into(to); bind(0, from.tex, copy.loc('uTex')); tri(); };

  /** 絵（scene）、光（glow）、効果（mask）のテクスチャから、発光・照明・ゆらぎをかけて画面に出す。
   *  height があれば（平らな表示の最高画質）、影・くぼみの陰り・面の傾きの陰影もつける */
  const composite = (scene: WebGLTexture, glow: WebGLTexture, mask: WebGLTexture, p: PostParams, glow2: WebGLTexture | null, height: boolean) => {
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const [a1, w1, a2, w2, a3, w3] = lv;
    // 発光の層 ＋ 絵の明るい所
    gl.useProgram(pre.pr);
    into(a1); bind(0, glow, pre.loc('uGlow')); bind(1, scene, pre.loc('uScene')); bind(2, glow2 ?? glow, pre.loc('uGlow2'));
    gl.uniform1f(pre.loc('uUse2'), glow2 ? 1 : 0);
    gl.uniform1f(pre.loc('uBright'), p.bright); gl.uniform1f(pre.loc('uThr'), p.threshold); tri();
    // 光の筋は、ぼかす前の光から作る（くっきりした筋になる）
    const useGod = p.god > 0;
    if (useGod) {
      god ??= target(a2.w, a2.h);
      gl.useProgram(godP.pr);
      into(god); bind(0, a1.tex, godP.loc('uTex'));
      gl.uniform2f(godP.loc('uPos'), p.godPos[0], p.godPos[1]);
      gl.uniform1f(godP.loc('uDecay'), 0.955); gl.uniform1f(godP.loc('uDensity'), 0.55); tri();
    }
    blurInPlace(a1, w1);
    down(a1, a2); blurInPlace(a2, w2);
    down(a2, a3); blurInPlace(a3, w3); blurInPlace(a3, w3);
    // レンズの光の筋：とても明るい所を、横（工業）か斜めの十字（魔術）に長くのばす
    const useStreak = p.streak > 0;
    if (useStreak) {
      stA ??= target(a2.w, a2.h); stB ??= target(a2.w, a2.h);
      gl.useProgram(streakP.pr);
      gl.uniform1f(streakP.loc('uThr'), 0.22);
      if (p.streakDir === 0) {
        into(stB); bind(0, a2.tex, streakP.loc('uTex')); gl.uniform2f(streakP.loc('uDir'), 2.2 / a2.w, 0); tri();
        gl.useProgram(blur.pr);
        into(stA); bind(0, stB.tex, blur.loc('uTex')); gl.uniform2f(blur.loc('uDir'), 5 / a2.w, 0); tri();
        into(stB); bind(0, stA.tex, blur.loc('uTex')); gl.uniform2f(blur.loc('uDir'), 11 / a2.w, 0); tri();
        into(stA); bind(0, stB.tex, blur.loc('uTex')); gl.uniform2f(blur.loc('uDir'), 3 / a2.w, 0); tri();
      } else {
        into(stA); bind(0, a2.tex, streakP.loc('uTex')); gl.uniform2f(streakP.loc('uDir'), 1.6 / a2.w, 1.6 / a2.h); tri();
        into(stB); bind(0, a2.tex, streakP.loc('uTex')); gl.uniform2f(streakP.loc('uDir'), 1.6 / a2.w, -1.6 / a2.h); tri();
      }
    }
    // 影・くぼみの陰り・面の傾き（高さの層から）
    const useShade = height && hW > 0 && p.shadow + p.ao + p.bevel > 0;
    if (useShade) {
      if (!shA || shA.w !== hW || shA.h !== hH) { drop(shA); drop(shB); shA = target(hW, hH); shB = target(hW, hH); }
      gl.useProgram(shadeP.pr);
      into(shA); bind(0, tHeight, shadeP.loc('uH'));
      gl.uniform2f(shadeP.loc('uPx'), 1 / hW, 1 / hH);
      // 1 歩の長さ：いちばん高いもの（高さ 1）の影が届く長さを、14 歩で歩く
      const len = Math.max(1e-3, p.sunLen * p.tile), stepPx = len / 14, n = Math.hypot(p.sun[0], p.sun[1]) || 1;
      gl.uniform2f(shadeP.loc('uL'), (p.sun[0] / n) * stepPx / hW, (-p.sun[1] / n) * stepPx / hH);
      gl.uniform1f(shadeP.loc('uSlope'), 1 / 14);
      gl.uniform1f(shadeP.loc('uTile'), p.tile);
      tri();
      blurInPlace(shA!, shB!);
    }
    // 上下のぼかし（立体表示）
    const useTilt = p.tilt > 0;
    if (useTilt) {
      sfA ??= target(a1.w, a1.h); sfB ??= target(a1.w, a1.h);
      down({ fbo: null as unknown as WebGLFramebuffer, tex: scene, w: W, h: H }, sfA);
      blurInPlace(sfA, sfB); blurInPlace(sfA, sfB);
    }
    // 合成
    gl.useProgram(fin.pr);
    into(null);
    bind(0, scene, fin.loc('uScene')); bind(1, a1.tex, fin.loc('uB1')); bind(2, a2.tex, fin.loc('uB2')); bind(3, a3.tex, fin.loc('uB3')); bind(4, mask, fin.loc('uMask'));
    bind(5, useShade ? shA!.tex : a3.tex, fin.loc('uShade'));
    bind(6, useGod ? god!.tex : a3.tex, fin.loc('uGod'));
    bind(7, useStreak ? stA!.tex : a3.tex, fin.loc('uStreak'));
    bind(8, useTilt ? sfA!.tex : a3.tex, fin.loc('uSoft'));
    bind(9, useStreak && p.streakDir !== 0 ? stB!.tex : a3.tex, fin.loc('uStreak2'));
    // 床の映り込み：高さの層を、そのまま使う（1 マスが画面の縦の何割かも渡す）
    const useRefl = height && hW > 0 && p.reflect > 0;
    bind(10, useRefl ? tHeight : a3.tex, fin.loc('uHgt'));
    gl.uniform1f(fin.loc('uRefl'), useRefl ? p.reflect : 0); gl.uniform1f(fin.loc('uReach'), useRefl ? p.tile / Math.max(1, hH) : 0);
    gl.uniform2f(fin.loc('uRes'), W, H);
    gl.uniform1f(fin.loc('uTime'), p.time % 1000);
    gl.uniform1f(fin.loc('uAmbient'), p.ambient); gl.uniform1f(fin.loc('uSpill'), p.spill); gl.uniform1f(fin.loc('uBloom'), p.bloom);
    gl.uniform1f(fin.loc('uVig'), p.vignette); gl.uniform1f(fin.loc('uGrain'), p.grain); gl.uniform1f(fin.loc('uScan'), p.scan);
    gl.uniform1f(fin.loc('uAb'), p.aberration); gl.uniform1f(fin.loc('uRelief'), p.relief); gl.uniform1f(fin.loc('uGlint'), p.glint);
    gl.uniform3f(fin.loc('uTint'), p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform1f(fin.loc('uShadow'), useShade ? p.shadow : 0); gl.uniform1f(fin.loc('uAO'), useShade ? p.ao : 0); gl.uniform1f(fin.loc('uBevel'), useShade ? p.bevel : 0);
    gl.uniform1f(fin.loc('uGodK'), useGod ? p.god : 0);
    gl.uniform1f(fin.loc('uStreakK'), useStreak ? p.streak : 0); gl.uniform1f(fin.loc('uStreak2K'), useStreak && p.streakDir !== 0 ? 1 : 0);
    gl.uniform3f(fin.loc('uStreakTint'), p.streakTint[0], p.streakTint[1], p.streakTint[2]);
    gl.uniform1f(fin.loc('uCloud'), p.cloud); gl.uniform1f(fin.loc('uWaterRefl'), p.waterRefl);
    gl.uniform3f(fin.loc('uSky'), p.sky[0], p.sky[1], p.sky[2]);
    gl.uniform1f(fin.loc('uSat'), p.sat); gl.uniform1f(fin.loc('uContrast'), p.contrast);
    gl.uniform3f(fin.loc('uShTint'), p.shadowTint[0], p.shadowTint[1], p.shadowTint[2]); gl.uniform3f(fin.loc('uHiTint'), p.hiTint[0], p.hiTint[1], p.hiTint[2]);
    gl.uniform1f(fin.loc('uFog'), p.fog); gl.uniform3f(fin.loc('uFogCol'), p.fogColor[0], p.fogColor[1], p.fogColor[2]); gl.uniform1f(fin.loc('uTilt'), useTilt ? p.tilt : 0);
    gl.uniform3f(fin.loc('uSunCol'), p.sunColor[0], p.sunColor[1], p.sunColor[2]); gl.uniform2f(fin.loc('uSunDir'), p.sun[0], p.sun[1]);
    gl.uniform3f(fin.loc('uCam'), p.cam[0], p.cam[1], p.cam[2]);
    tri();
  };

  // ---- 立体表示の道具（初めて使うときに作る）----
  interface Stage3 {
    plane: ReturnType<typeof program>; planeB: ReturnType<typeof program>; box: ReturnType<typeof program>; boxB: ReturnType<typeof program>; boxS: ReturnType<typeof program>;
    quad: WebGLVertexArrayObject; cube: WebGLVertexArrayObject; inst: WebGLBuffer;
    tGround: WebGLTexture; tTop: WebGLTexture; tGlowS: WebGLTexture;
    w: number; h: number; ms: WebGLFramebuffer | null; msColor: WebGLRenderbuffer | null; msDepth: WebGLRenderbuffer | null; scene: Target | null;
    fbB: WebGLFramebuffer | null; bGlow: WebGLTexture | null; bMask: WebGLTexture | null; bDepth: WebGLRenderbuffer | null; bw: number; bh: number;
    sh1: Target | null; sh2: Target | null; ao1: Target | null;
  }
  let st3: Stage3 | null = null, bad3 = false;
  const stage3 = (): Stage3 | null => {
    if (st3 || bad3) return st3;
    try {
      const plane = program(FS_PLANE, VS_PLANE), planeB = program(FS_PLANE_B, VS_PLANE), box = program(FS_BOX, VS_BOX), boxB = program(FS_BOX_B, VS_BOX), boxS = program(FS_WHITE, VS_BOX);
      const quad = gl.createVertexArray()!;
      gl.bindVertexArray(quad);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      // 箱：天面と 4 つの側面（底は見えないので作らない）。頂点ごとに、位置・面の向き・面の中の位置
      const v: number[] = [];
      const faceOf = (n: number[], c: number[][]) => { for (const k of [0, 1, 2, 0, 2, 3]) v.push(...c[k].slice(0, 3), ...n, ...c[k].slice(3)); };
      faceOf([0, 1, 0], [[0, 1, 0, 0, 0], [1, 1, 0, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 0, 1]]);
      faceOf([0, 0, 1], [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 0, 1]]);
      faceOf([0, 0, -1], [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 1, 0, 1, 1], [0, 1, 0, 0, 1]]);
      faceOf([1, 0, 0], [[1, 0, 0, 0, 0], [1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [1, 1, 0, 0, 1]]);
      faceOf([-1, 0, 0], [[0, 0, 0, 0, 0], [0, 0, 1, 1, 0], [0, 1, 1, 1, 1], [0, 1, 0, 0, 1]]);
      const cube = gl.createVertexArray()!;
      gl.bindVertexArray(cube);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      const inst = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
      st3 = { plane, planeB, box, boxB, boxS, quad, cube, inst, tGround: texture(), tTop: texture(), tGlowS: texture(), w: 0, h: 0, ms: null, msColor: null, msDepth: null, scene: null, fbB: null, bGlow: null, bMask: null, bDepth: null, bw: 0, bh: 0, sh1: null, sh2: null, ao1: null };
    } catch { bad3 = true; st3 = null; }
    return st3;
  };
  /** 立体表示の描き先を、画面の大きさに合わせて作り直す */
  const size3 = (s: Stage3) => {
    if (s.w === W && s.h === H) return;
    if (s.ms) { gl.deleteFramebuffer(s.ms); gl.deleteRenderbuffer(s.msColor); gl.deleteRenderbuffer(s.msDepth); gl.deleteFramebuffer(s.scene!.fbo); gl.deleteTexture(s.scene!.tex); gl.deleteFramebuffer(s.fbB); gl.deleteTexture(s.bGlow); gl.deleteTexture(s.bMask); gl.deleteRenderbuffer(s.bDepth); for (const t of [s.sh1!, s.sh2!, s.ao1!]) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } }
    s.w = W; s.h = H;
    // 絵：輪郭のぎざぎざを消すため、1 画素を 4 点で描いてから（多重標本化）、ふつうのテクスチャへ写す
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    s.ms = gl.createFramebuffer()!; s.msColor = gl.createRenderbuffer()!; s.msDepth = gl.createRenderbuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.ms);
    gl.bindRenderbuffer(gl.RENDERBUFFER, s.msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, s.msColor);
    gl.bindRenderbuffer(gl.RENDERBUFFER, s.msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, s.msDepth);
    s.scene = target(W, H);
    // 光と効果：画面の 1/3 の細かさで、2 枚を同時に描く
    s.bw = Math.max(8, Math.round(W / 3)); s.bh = Math.max(8, Math.round(H / 3));
    s.fbB = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbB);
    const mk = (att: number) => { const t = texture(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, s.bw, s.bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.framebufferTexture2D(gl.FRAMEBUFFER, att, gl.TEXTURE_2D, t, 0); return t; };
    s.bGlow = mk(gl.COLOR_ATTACHMENT0); s.bMask = mk(gl.COLOR_ATTACHMENT1);
    s.bDepth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, s.bDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, s.bw, s.bh);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, s.bDepth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    // 影：画面の半分の細かさ
    const sw = Math.max(8, Math.round(W / 2)), sh = Math.max(8, Math.round(H / 2));
    s.sh1 = target(sw, sh); s.sh2 = target(sw, sh); s.ao1 = target(sw, sh);
  };

  return {
    lost: () => dead || gl.isContextLost(),
    resize(w, h) {
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = w; canvas.height = h;
      free();
      // 発光の 3 段：画面の 1/3、1/6、1/12 の細かさ（それぞれ作業用にもう 1 枚）
      for (const k of [3, 6, 12]) { const tw = Math.max(8, Math.round(w / k)), th = Math.max(8, Math.round(h / k)); lv.push(target(tw, th), target(tw, th)); }
    },
    render(scene, glow, mask, p, height) {
      if (dead || !lv.length) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      upload(tScene, scene); upload(tGlow, glow); upload(tMask, mask);
      const useH = !!height && (p.shadow + p.ao + p.bevel > 0 || p.reflect > 0);
      if (useH) { upload(tHeight, height!); const hs = height as HTMLCanvasElement; hW = hs.width; hH = hs.height; }
      composite(tScene, tGlow, tMask, p, null, useH);
    },
    render3d(sc, glow, mask, p) {
      const s = dead || !lv.length ? null : stage3();
      if (!s) return;
      size3(s);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      upload(s.tGround, sc.ground); upload(s.tTop, sc.top); upload(tGlow, glow); upload(tMask, mask);
      if (sc.glowScreen) upload(s.tGlowS, sc.glowScreen);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.inst);
      gl.bufferData(gl.ARRAY_BUFFER, sc.boxes.subarray(0, (sc.count + sc.slabs) * 8), gl.DYNAMIC_DRAW);
      const rect = sc.rect;
      const boxes = (pr: ReturnType<typeof program>, shadow: boolean, foot = false) => {
        gl.uniformMatrix4fv(pr.loc('uVP'), false, sc.vp);
        gl.uniform4f(pr.loc('uRect'), rect[0], rect[1], rect[2], rect[3]);
        // 光は北西の上から。影は、高さ 1 につき東へ 0.5、南へ 0.38 のびる。foot：足もとの形だけ（くぼみの陰り用）
        gl.uniform3f(pr.loc('uSh'), foot ? 0 : 0.5, foot ? 0 : 0.38, shadow ? 1 : 0);
        gl.bindVertexArray(s.cube);
        if (sc.count) gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, sc.count);
      };
      const planeAt = (pr: ReturnType<typeof program>, h: number) => {
        gl.uniformMatrix4fv(pr.loc('uVP'), false, sc.vp);
        gl.uniform4f(pr.loc('uRect'), rect[0], rect[1], rect[2], rect[3]);
        gl.uniform1f(pr.loc('uH'), h);
        gl.bindVertexArray(s.quad);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      // 1. 影：箱を地面へ押しつぶした形を白で描き、ぼかす
      into(s.sh1); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(s.boxS.pr); boxes(s.boxS, true);
      gl.bindVertexArray(vao); blurInPlace(s.sh1!, s.sh2!);
      // 足もとの陰り：箱の底の形を白で描き、2 回ぼかす（縁から外へ、なだらかに暗さが残る）
      if (sc.ao > 0) {
        into(s.ao1); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(s.boxS.pr); boxes(s.boxS, true, true);
        gl.bindVertexArray(vao); blurInPlace(s.ao1!, s.sh2!); blurInPlace(s.ao1!, s.sh2!);
      }
      // 2. 絵：地面 → 箱 → 天面の絵（透明地なので、重ねて描く）
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.ms); gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.useProgram(s.plane.pr);
      bind(0, s.tGround, s.plane.loc('uTex')); bind(1, s.sh1!.tex, s.plane.loc('uShadow')); bind(2, s.ao1!.tex, s.plane.loc('uAO'));
      gl.uniform2f(s.plane.loc('uRes'), W, H); gl.uniform1f(s.plane.loc('uShade'), sc.shadow); gl.uniform1f(s.plane.loc('uAOK'), sc.ao);
      planeAt(s.plane, 0);
      gl.useProgram(s.box.pr);
      bind(0, s.tGround, s.box.loc('uGround')); bind(1, s.tTop, s.box.loc('uTop'));
      gl.uniform3f(s.box.loc('uInk'), sc.ink[0], sc.ink[1], sc.ink[2]);
      gl.uniform1f(s.box.loc('uSkin'), sc.skin); gl.uniform1f(s.box.loc('uDark'), sc.dark ? 1 : 0); gl.uniform1f(s.box.loc('uRich'), sc.rich);
      boxes(s.box, false);
      gl.useProgram(s.plane.pr);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      bind(0, s.tTop, s.plane.loc('uTex')); gl.uniform1f(s.plane.loc('uShade'), 0); gl.uniform1f(s.plane.loc('uAOK'), 0);
      planeAt(s.plane, sc.topH + 0.004);
      if (sc.slabs) {
        // 2 階の板：同じ箱の形を、続きの分だけ描く
        gl.useProgram(s.box.pr);
        gl.bindVertexArray(s.cube); gl.bindBuffer(gl.ARRAY_BUFFER, s.inst);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, sc.count * 32); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, sc.count * 32 + 16);
        gl.uniform3f(s.box.loc('uSh'), 0, 0, 0);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, sc.slabs);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16);
      }
      gl.disable(gl.BLEND); gl.depthMask(true);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.scene!.fbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      // 3. 光と効果の層を、同じ形で写す（箱の天面は、そこの光と効果を持ち上げる。側面は光らない）
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbB); gl.viewport(0, 0, s.bw, s.bh);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(s.planeB.pr);
      bind(0, tGlow, s.planeB.loc('uGlow')); bind(1, tMask, s.planeB.loc('uMask'));
      planeAt(s.planeB, 0);
      gl.useProgram(s.boxB.pr);
      bind(0, tGlow, s.boxB.loc('uGlow')); bind(1, tMask, s.boxB.loc('uMask'));
      boxes(s.boxB, false);
      gl.disable(gl.DEPTH_TEST);
      // 4. 平らな表示と同じ合成
      composite(s.scene!.tex, s.bGlow!, s.bMask!, p, sc.glowScreen ? s.tGlowS : null, false);
    },
  };
}

/** 見た目ごとの、最高画質の上乗せ（影・光の筋・レンズの筋・雲・水面・色調）。太陽の向き・カメラ・かすみは、毎コマ main が決める */
type Look = Pick<PostParams, 'shadow' | 'ao' | 'bevel' | 'sunColor' | 'god' | 'streak' | 'streakDir' | 'streakTint' | 'cloud' | 'waterRefl' | 'sky' | 'sat' | 'contrast' | 'shadowTint' | 'hiTint'> & Partial<Pick<PostParams, 'reflect'>>;
const FRAME: Pick<PostParams, 'sun' | 'sunLen' | 'tile' | 'godPos' | 'fog' | 'fogColor' | 'tilt' | 'cam'> = { sun: [-0.75, -0.66], sunLen: 0.9, tile: 14, godPos: [0.5, 0.5], fog: 0, fogColor: [1, 1, 1], tilt: 0, cam: [0, 0, 40] };
const LOOKS: Record<string, Look> = {
  // 方眼ノート：紙の白は白のまま。影と雲の影で、紙の上に置いた模型に見せる
  'note-light': { shadow: 0.42, ao: 0.4, bevel: 0.55, sunColor: [1.03, 1.0, 0.95], god: 0, streak: 0, streakDir: 0, streakTint: [1, 1, 1], cloud: 0.13, waterRefl: 0.22, sky: [0.45, 0.7, 0.92], sat: 1.05, contrast: 0.06, shadowTint: [1, 1, 1], hiTint: [1, 1, 1] },
  // 黒板：チョークの粉が光の筋になる
  'note-dark': { shadow: 0.22, ao: 0.42, bevel: 0.42, sunColor: [0.95, 1.0, 1.04], god: 0.28, streak: 0, streakDir: 0, streakTint: [1, 1, 1], cloud: 0, waterRefl: 0.22, sky: [0.36, 0.46, 0.43], sat: 1.02, contrast: 0.12, shadowTint: [0.96, 1.0, 1.03], hiTint: [1.02, 1.0, 0.97] },
  // 光の炉：強い日差しと、くっきりした影
  'punk-light': { shadow: 0.46, ao: 0.42, bevel: 0.6, sunColor: [1.06, 1.0, 0.92], god: 0.14, streak: 0.18, streakDir: 0, streakTint: [1.0, 0.92, 0.78], cloud: 0, waterRefl: 0.36, sky: [0.55, 0.75, 0.92], sat: 1.06, contrast: 0.12, shadowTint: [0.95, 0.98, 1.03], hiTint: [1.02, 1.0, 0.97] },
  // 闇の炉：溶けた橙と、青い影。炉から光の筋、明かりから横に長いレンズの筋
  'punk-dark': { shadow: 0.24, ao: 0.46, bevel: 0.5, sunColor: [1.1, 0.95, 0.84], god: 0.62, streak: 0.62, streakDir: 0, streakTint: [1.0, 0.68, 0.38], cloud: 0, waterRefl: 0.24, sky: [0.24, 0.34, 0.44], sat: 1.12, contrast: 0.22, shadowTint: [0.9, 0.98, 1.08], hiTint: [1.08, 0.98, 0.9] },
  // 羊皮紙：やわらかい日差しと、青い灯の星形のきらめき
  'arcane-light': { shadow: 0.4, ao: 0.38, bevel: 0.5, sunColor: [1.05, 1.0, 0.9], god: 0.18, streak: 0.22, streakDir: 1, streakTint: [0.55, 0.85, 1.0], cloud: 0.12, waterRefl: 0.36, sky: [0.5, 0.74, 0.9], sat: 1.04, contrast: 0.08, shadowTint: [0.98, 0.96, 0.94], hiTint: [1.02, 1.0, 0.96] },
  // 夜の書斎：藍の闇に金の灯。青い光の筋と、星形のきらめき
  'arcane-dark': { shadow: 0.2, ao: 0.44, bevel: 0.45, sunColor: [0.88, 0.95, 1.12], god: 0.66, streak: 0.55, streakDir: 1, streakTint: [0.5, 0.82, 1.0], cloud: 0, waterRefl: 0.22, sky: [0.2, 0.25, 0.45], sat: 1.1, contrast: 0.18, shadowTint: [0.92, 0.94, 1.1], hiTint: [1.06, 1.0, 0.9] },
  // 白の研究棟：天井いっぱいの照明なので、影もくぼみの陰りも薄め（装置の殻に、回り込んだ光のやわらかい影を描いてある）。白は青みの白に。床に装置が映る
  'lab-light': { shadow: 0.18, ao: 0.24, bevel: 0.32, sunColor: [1.0, 1.01, 1.03], god: 0.1, streak: 0.1, streakDir: 0, streakTint: [0.6, 0.95, 1.0], cloud: 0, waterRefl: 0.32, sky: [0.78, 0.92, 0.96], sat: 1.04, contrast: 0.08, shadowTint: [0.93, 0.98, 1.05], hiTint: [0.99, 1.0, 1.02], reflect: 0.3 },
  // 深夜のラボ：暗がりは青緑、明るい所は赤紫に寄せる。灯から光の筋と横に長いレンズの筋、黒い床に灯と装置が映る
  'lab-dark': { shadow: 0.2, ao: 0.5, bevel: 0.42, sunColor: [0.9, 1.0, 1.08], god: 0.42, streak: 0.4, streakDir: 0, streakTint: [0.45, 0.95, 1.0], cloud: 0, waterRefl: 0.26, sky: [0.08, 0.28, 0.36], sat: 1.12, contrast: 0.18, shadowTint: [0.9, 1.0, 1.1], hiTint: [1.05, 0.97, 1.05], reflect: 0.55 },
};
/** 「高」の画質では、最高画質の上乗せを使わない（色調だけは同じにしない：前の見た目のまま） */
export const PLAIN_LOOK: Look = { shadow: 0, ao: 0, bevel: 0, sunColor: [1, 1, 1], god: 0, streak: 0, streakDir: 0, streakTint: [1, 1, 1], cloud: 0, waterRefl: 0, sky: [1, 1, 1], sat: 1, contrast: 0, shadowTint: [1, 1, 1], hiTint: [1, 1, 1], reflect: 0 };

/** スキンと明暗ごとの設定。明るいテーマは控えめに、暗いテーマは光と影をはっきりつける */
const BASE: Record<string, Pick<PostParams, 'ambient' | 'spill' | 'bloom' | 'bright' | 'threshold' | 'vignette' | 'grain' | 'scan' | 'aberration' | 'relief' | 'glint' | 'tint'>> = {
  'note-light': { ambient: 1.0, spill: 0.16, bloom: 0.4, bright: 0, threshold: 1, vignette: 0.1, grain: 0.01, scan: 0, aberration: 0, relief: 0.2, glint: 0.35, tint: [1, 1, 1] },
  'note-dark': { ambient: 0.84, spill: 0.7, bloom: 0.6, bright: 0.18, threshold: 0.85, vignette: 0.26, grain: 0.02, scan: 0, aberration: 0, relief: 0.28, glint: 0.5, tint: [1, 1, 1] },
  'punk-light': { ambient: 0.97, spill: 0.3, bloom: 0.55, bright: 0, threshold: 1, vignette: 0.22, grain: 0.026, scan: 0, aberration: 0.0008, relief: 0.32, glint: 0.35, tint: [1.0, 0.99, 0.97] },
  'punk-dark': { ambient: 0.86, spill: 1.1, bloom: 0.8, bright: 0.3, threshold: 0.78, vignette: 0.3, grain: 0.03, scan: 0.03, aberration: 0.001, relief: 0.38, glint: 0.5, tint: [1.03, 0.99, 0.95] },
  'arcane-light': { ambient: 0.95, spill: 0.4, bloom: 0.7, bright: 0, threshold: 1, vignette: 0.26, grain: 0.018, scan: 0, aberration: 0, relief: 0.28, glint: 0.4, tint: [1.02, 1.0, 0.96] },
  'arcane-dark': { ambient: 0.7, spill: 1.1, bloom: 0.85, bright: 0.2, threshold: 0.82, vignette: 0.4, grain: 0.02, scan: 0, aberration: 0.0005, relief: 0.33, glint: 0.6, tint: [0.98, 1.0, 1.05] },
  // 研究所：澄んだ強めの発光、粒子はごく少なく、色のにじみはほぼなし。夜は灯がよく広がり、明るい所も光る
  'lab-light': { ambient: 1.0, spill: 0.28, bloom: 0.62, bright: 0, threshold: 1, vignette: 0.12, grain: 0.006, scan: 0, aberration: 0, relief: 0.22, glint: 0.4, tint: [0.985, 1.0, 1.02] },
  'lab-dark': { ambient: 0.78, spill: 1.15, bloom: 0.95, bright: 0.22, threshold: 0.8, vignette: 0.3, grain: 0.012, scan: 0, aberration: 0.0003, relief: 0.3, glint: 0.42, tint: [0.97, 1.0, 1.04] },
};
export const POST_PRESETS: Record<string, Omit<PostParams, 'time'>> = Object.fromEntries(Object.keys(BASE).map((k) => [k, { reflect: 0, ...BASE[k], ...LOOKS[k], ...FRAME }]));
