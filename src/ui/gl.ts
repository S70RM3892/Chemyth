/**
 * WebGL の合成段。
 * 地図の絵そのものは、これまでどおり Canvas 2D で描く（scene）。それを「素材の層」として受け取り、
 * 別に描いた発光の層（glow）と効果の層（mask：赤＝熱、青＝水面、緑＝色を守る所）を合わせて、Canvas ではできなかった処理をかける。
 *  - 発光：光っている所を 3 段にぼかして重ねる（近くのにじみ、中くらいの暈、遠くまで届く明かり）
 *  - 照明：遠くまで届く明かりで、まわりの地面や設備を照らす。暗いテーマでは、光のない所が沈む
 *  - 熱のゆらぎ：炉や炎の上で、背景の絵がゆらぐ
 *  - 水面：海や入り江で、絵がさざ波でゆれ、きらめきが走る
 *  - 仕上げ：浮き彫りの陰影、周辺の減光、粒子、走査線、色のにじみ、色調
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
}
export interface Post {
  /** 絵の大きさ（画素）を合わせる */
  resize(w: number, h: number): void;
  render(scene: TexImageSource, glow: TexImageSource, mask: TexImageSource, p: PostParams): void;
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
uniform sampler2D uTex, uShadow; uniform vec2 uRes; uniform float uShade;
in vec2 uv; out vec4 o;
void main() {
  vec4 c = texture(uTex, uv);
  // 地面には、箱の影が落ちる（影は別に描いてぼかしてある）
  if (uShade > 0.0) c.rgb *= 1.0 - texture(uShadow, gl_FragCoord.xy / uRes).r * uShade;
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
out vec2 uv; out vec3 nor; out vec2 face; out vec4 col;
void main() {
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
uniform sampler2D uGround, uTop; uniform vec3 uInk;
in vec2 uv; in vec3 nor; in vec2 face; in vec4 col; out vec4 o;
void main() {
  if (col.a > 1.5) {
    // 2 階の設備：色のついた半透明の板
    float l = nor.y > 0.5 ? 1.0 : nor.z > 0.5 ? 0.7 : 0.55;
    o = vec4(col.rgb * l, 1.0) * 0.5;
    return;
  }
  vec4 g = col.a < 0.5 ? texture(uGround, uv) : texture(uTop, uv);
  vec3 base = g.rgb + col.rgb * (1.0 - g.a);
  if (nor.y > 0.5) { o = vec4(base, 1.0); return; }
  // 側面：絵の縁の色と装置の色を混ぜ、面の向きで明るさを変え、下ほど暗くする。角と地面との境に輪郭線
  vec3 side = mix(col.rgb, base, 0.6);
  float sh = nor.z > 0.5 ? 0.66 : nor.x < -0.5 ? 0.86 : nor.x > 0.5 ? 0.54 : 0.5;
  side *= sh * (0.74 + 0.26 * face.y);
  float ex = fwidth(face.x) * 1.4, ey = fwidth(face.y) * 1.4;
  float line = max(max(step(face.x, ex), step(1.0 - ex, face.x)), max(step(face.y, ey), step(1.0 - ey, face.y)));
  o = vec4(mix(side, side * 0.3 + uInk * 0.08, line), 1.0);
}`;
const FS_BOX_B = `#version 300 es
precision highp float;
uniform sampler2D uGlow, uMask;
in vec2 uv; in vec3 nor; in vec2 face; in vec4 col; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
void main() {
  if (nor.y > 0.5) { o0 = vec4(texture(uGlow, uv).rgb, 1.0); o1 = vec4(texture(uMask, uv).rgb, 1.0); }
  else { o0 = vec4(0.0, 0.0, 0.0, 1.0); o1 = vec4(0.0, 0.0, 0.0, 1.0); }
}`;
const FS_WHITE = `#version 300 es
precision highp float;
in vec2 uv; in vec3 nor; in vec2 face; in vec4 col; out vec4 o;
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

const FS_COPY = `#version 300 es
precision highp float;
uniform sampler2D uTex; in vec2 uv; out vec4 o;
void main() { o = vec4(texture(uTex, uv).rgb, 1.0); }`;

const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene, uB1, uB2, uB3, uMask;
uniform vec2 uRes;
uniform float uTime, uAmbient, uSpill, uBloom, uVig, uGrain, uScan, uAb, uRelief, uGlint;
uniform vec3 uTint;
in vec2 uv; out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 m = texture(uMask, uv).rgb;
  vec2 px = 1.0 / uRes, q = uv * uRes;
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
  vec3 b1 = texture(uB1, uv).rgb, b2 = texture(uB2, uv).rgb, b3 = texture(uB3, uv).rgb;
  // 浮き彫り：明るさの傾きから、左上から光が当たっているように縁を起こす
  float l = dot(s, vec3(0.299, 0.587, 0.114));
  float rel = clamp(dot(vec2(dFdx(l), dFdy(l)), vec2(-1.0, 1.0)) * uRelief * 6.0, -0.22, 0.22);
  // 照明：光のない所は ambient まで沈み、発光の広いぼかしが、まわりを照らす
  vec3 light = min(vec3(uAmbient) + (b3 + b2 * 0.5) * uSpill, vec3(1.3));
  light = mix(light, vec3(1.0), keep);
  vec3 col = clamp(s * light * (1.0 + rel), 0.0, 1.0);
  // 発光のにじみ：足し算ではなく「スクリーン」で重ねる（明るい所が白く飛ばず、装置の中の色が残る）
  vec3 halo = clamp((b1 * 0.5 + b2 * 0.45 + b3 * 0.35) * uBloom, 0.0, 1.0) * (1.0 - keep * 0.92);
  col = 1.0 - (1.0 - col) * (1.0 - halo);
  // 水面のきらめき
  // 2 つの流れが重なった所だけが光る（細かい点が、流れながら点いたり消えたりする）
  if (m.b > 0.004) {
    float gl1 = noise(q * 0.085 + vec2(uTime * 0.5, uTime * 0.22)), gl2 = noise(q * 0.13 - vec2(uTime * 0.33, -uTime * 0.18));
    col += vec3(0.9, 0.97, 1.0) * smoothstep(0.5, 0.72, gl1 * gl2) * m.b * uGlint;
  }
  col *= uTint;
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
  try { pre = program(FS_PRE); blur = program(FS_BLUR); copy = program(FS_COPY); fin = program(FS_FINAL); } catch { return null; }

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
  const tScene = texture(), tGlow = texture(), tMask = texture();
  let W = 0, H = 0, lv: Target[] = [];
  const free = () => { for (const t of lv) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } lv = []; };

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

  /** 絵（scene）、光（glow）、効果（mask）のテクスチャから、発光・照明・ゆらぎをかけて画面に出す */
  const composite = (scene: WebGLTexture, glow: WebGLTexture, mask: WebGLTexture, p: PostParams, glow2: WebGLTexture | null) => {
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const [a1, w1, a2, w2, a3, w3] = lv;
    // 発光の層 ＋ 絵の明るい所
    gl.useProgram(pre.pr);
    into(a1); bind(0, glow, pre.loc('uGlow')); bind(1, scene, pre.loc('uScene')); bind(2, glow2 ?? glow, pre.loc('uGlow2'));
    gl.uniform1f(pre.loc('uUse2'), glow2 ? 1 : 0);
    gl.uniform1f(pre.loc('uBright'), p.bright); gl.uniform1f(pre.loc('uThr'), p.threshold); tri();
    blurInPlace(a1, w1);
    down(a1, a2); blurInPlace(a2, w2);
    down(a2, a3); blurInPlace(a3, w3); blurInPlace(a3, w3);
    // 合成
    gl.useProgram(fin.pr);
    into(null);
    bind(0, scene, fin.loc('uScene')); bind(1, a1.tex, fin.loc('uB1')); bind(2, a2.tex, fin.loc('uB2')); bind(3, a3.tex, fin.loc('uB3')); bind(4, mask, fin.loc('uMask'));
    gl.uniform2f(fin.loc('uRes'), W, H);
    gl.uniform1f(fin.loc('uTime'), p.time % 1000);
    gl.uniform1f(fin.loc('uAmbient'), p.ambient); gl.uniform1f(fin.loc('uSpill'), p.spill); gl.uniform1f(fin.loc('uBloom'), p.bloom);
    gl.uniform1f(fin.loc('uVig'), p.vignette); gl.uniform1f(fin.loc('uGrain'), p.grain); gl.uniform1f(fin.loc('uScan'), p.scan);
    gl.uniform1f(fin.loc('uAb'), p.aberration); gl.uniform1f(fin.loc('uRelief'), p.relief); gl.uniform1f(fin.loc('uGlint'), p.glint);
    gl.uniform3f(fin.loc('uTint'), p.tint[0], p.tint[1], p.tint[2]);
    tri();
  };

  // ---- 立体表示の道具（初めて使うときに作る）----
  interface Stage3 {
    plane: ReturnType<typeof program>; planeB: ReturnType<typeof program>; box: ReturnType<typeof program>; boxB: ReturnType<typeof program>; boxS: ReturnType<typeof program>;
    quad: WebGLVertexArrayObject; cube: WebGLVertexArrayObject; inst: WebGLBuffer;
    tGround: WebGLTexture; tTop: WebGLTexture; tGlowS: WebGLTexture;
    w: number; h: number; ms: WebGLFramebuffer | null; msColor: WebGLRenderbuffer | null; msDepth: WebGLRenderbuffer | null; scene: Target | null;
    fbB: WebGLFramebuffer | null; bGlow: WebGLTexture | null; bMask: WebGLTexture | null; bDepth: WebGLRenderbuffer | null; bw: number; bh: number;
    sh1: Target | null; sh2: Target | null;
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
      st3 = { plane, planeB, box, boxB, boxS, quad, cube, inst, tGround: texture(), tTop: texture(), tGlowS: texture(), w: 0, h: 0, ms: null, msColor: null, msDepth: null, scene: null, fbB: null, bGlow: null, bMask: null, bDepth: null, bw: 0, bh: 0, sh1: null, sh2: null };
    } catch { bad3 = true; st3 = null; }
    return st3;
  };
  /** 立体表示の描き先を、画面の大きさに合わせて作り直す */
  const size3 = (s: Stage3) => {
    if (s.w === W && s.h === H) return;
    if (s.ms) { gl.deleteFramebuffer(s.ms); gl.deleteRenderbuffer(s.msColor); gl.deleteRenderbuffer(s.msDepth); gl.deleteFramebuffer(s.scene!.fbo); gl.deleteTexture(s.scene!.tex); gl.deleteFramebuffer(s.fbB); gl.deleteTexture(s.bGlow); gl.deleteTexture(s.bMask); gl.deleteRenderbuffer(s.bDepth); for (const t of [s.sh1!, s.sh2!]) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } }
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
    s.sh1 = target(sw, sh); s.sh2 = target(sw, sh);
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
    render(scene, glow, mask, p) {
      if (dead || !lv.length) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      upload(tScene, scene); upload(tGlow, glow); upload(tMask, mask);
      composite(tScene, tGlow, tMask, p, null);
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
      const boxes = (pr: ReturnType<typeof program>, shadow: boolean) => {
        gl.uniformMatrix4fv(pr.loc('uVP'), false, sc.vp);
        gl.uniform4f(pr.loc('uRect'), rect[0], rect[1], rect[2], rect[3]);
        // 光は北西の上から。影は、高さ 1 につき東へ 0.5、南へ 0.38 のびる
        gl.uniform3f(pr.loc('uSh'), 0.5, 0.38, shadow ? 1 : 0);
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
      // 2. 絵：地面 → 箱 → 天面の絵（透明地なので、重ねて描く）
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.ms); gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.useProgram(s.plane.pr);
      bind(0, s.tGround, s.plane.loc('uTex')); bind(1, s.sh1!.tex, s.plane.loc('uShadow'));
      gl.uniform2f(s.plane.loc('uRes'), W, H); gl.uniform1f(s.plane.loc('uShade'), sc.shadow);
      planeAt(s.plane, 0);
      gl.useProgram(s.box.pr);
      bind(0, s.tGround, s.box.loc('uGround')); bind(1, s.tTop, s.box.loc('uTop'));
      gl.uniform3f(s.box.loc('uInk'), sc.ink[0], sc.ink[1], sc.ink[2]);
      boxes(s.box, false);
      gl.useProgram(s.plane.pr);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      bind(0, s.tTop, s.plane.loc('uTex')); gl.uniform1f(s.plane.loc('uShade'), 0);
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
      composite(s.scene!.tex, s.bGlow!, s.bMask!, p, sc.glowScreen ? s.tGlowS : null);
    },
  };
}

/** スキンと明暗ごとの設定。明るいテーマは控えめに、暗いテーマは光と影をはっきりつける */
export const POST_PRESETS: Record<string, Omit<PostParams, 'time'>> = {
  'note-light': { ambient: 1.0, spill: 0.16, bloom: 0.4, bright: 0, threshold: 1, vignette: 0.1, grain: 0.01, scan: 0, aberration: 0, relief: 0.2, glint: 0.35, tint: [1, 1, 1] },
  'note-dark': { ambient: 0.84, spill: 0.7, bloom: 0.6, bright: 0.18, threshold: 0.85, vignette: 0.26, grain: 0.02, scan: 0, aberration: 0, relief: 0.28, glint: 0.5, tint: [1, 1, 1] },
  'punk-light': { ambient: 0.97, spill: 0.3, bloom: 0.55, bright: 0, threshold: 1, vignette: 0.22, grain: 0.026, scan: 0, aberration: 0.0008, relief: 0.32, glint: 0.35, tint: [1.0, 0.99, 0.97] },
  'punk-dark': { ambient: 0.86, spill: 1.1, bloom: 0.8, bright: 0.3, threshold: 0.78, vignette: 0.3, grain: 0.03, scan: 0.03, aberration: 0.001, relief: 0.38, glint: 0.5, tint: [1.03, 0.99, 0.95] },
  'arcane-light': { ambient: 0.95, spill: 0.4, bloom: 0.7, bright: 0, threshold: 1, vignette: 0.26, grain: 0.018, scan: 0, aberration: 0, relief: 0.28, glint: 0.4, tint: [1.02, 1.0, 0.96] },
  'arcane-dark': { ambient: 0.7, spill: 1.1, bloom: 0.85, bright: 0.2, threshold: 0.82, vignette: 0.4, grain: 0.02, scan: 0, aberration: 0.0005, relief: 0.33, glint: 0.6, tint: [0.98, 1.0, 1.05] },
};
