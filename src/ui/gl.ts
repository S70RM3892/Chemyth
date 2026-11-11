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
export interface Post {
  /** 絵の大きさ（画素）を合わせる */
  resize(w: number, h: number): void;
  render(scene: TexImageSource, glow: TexImageSource, mask: TexImageSource, p: PostParams): void;
  lost(): boolean;
}

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

/** 発光の層に、絵の明るい所を足す */
const FS_PRE = `#version 300 es
precision highp float;
uniform sampler2D uGlow, uScene; uniform float uBright, uThr;
in vec2 uv; out vec4 o;
void main() {
  vec3 s = texture(uScene, uv).rgb;
  float l = max(s.r, max(s.g, s.b));
  o = vec4(texture(uGlow, uv).rgb + s * smoothstep(uThr, uThr + 0.18, l) * uBright, 1.0);
}`;

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
  const program = (fs: string) => {
    const pr = gl.createProgram()!;
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p');
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
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      upload(tScene, scene); upload(tGlow, glow); upload(tMask, mask);
      const [a1, w1, a2, w2, a3, w3] = lv;
      // 発光の層 ＋ 絵の明るい所
      gl.useProgram(pre.pr);
      into(a1); bind(0, tGlow, pre.loc('uGlow')); bind(1, tScene, pre.loc('uScene'));
      gl.uniform1f(pre.loc('uBright'), p.bright); gl.uniform1f(pre.loc('uThr'), p.threshold); tri();
      blurInPlace(a1, w1);
      down(a1, a2); blurInPlace(a2, w2);
      down(a2, a3); blurInPlace(a3, w3); blurInPlace(a3, w3);
      // 合成
      gl.useProgram(fin.pr);
      into(null);
      bind(0, tScene, fin.loc('uScene')); bind(1, a1.tex, fin.loc('uB1')); bind(2, a2.tex, fin.loc('uB2')); bind(3, a3.tex, fin.loc('uB3')); bind(4, tMask, fin.loc('uMask'));
      gl.uniform2f(fin.loc('uRes'), W, H);
      gl.uniform1f(fin.loc('uTime'), p.time % 1000);
      gl.uniform1f(fin.loc('uAmbient'), p.ambient); gl.uniform1f(fin.loc('uSpill'), p.spill); gl.uniform1f(fin.loc('uBloom'), p.bloom);
      gl.uniform1f(fin.loc('uVig'), p.vignette); gl.uniform1f(fin.loc('uGrain'), p.grain); gl.uniform1f(fin.loc('uScan'), p.scan);
      gl.uniform1f(fin.loc('uAb'), p.aberration); gl.uniform1f(fin.loc('uRelief'), p.relief); gl.uniform1f(fin.loc('uGlint'), p.glint);
      gl.uniform3f(fin.loc('uTint'), p.tint[0], p.tint[1], p.tint[2]);
      tri();
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
