/**
 * 形の層（最高画質の平らな表示。SPEC2 §6.H）の計算。
 * - 形は 1 つを 8 つの数で表す（ShapeBuf）：[x0, y0, x1, y1（マス）, 高さ h（0〜1）, 種類 + 16·層, r, 浮き]。
 *   種類：0 角丸の長方形、1 円、2 カプセル、3 面取りの八角形（工業の筐体）、4 ドーム（円で、高さが h·√(1 − ρ²)）。
 *   カプセルだけは x0, y0, x1, y1 が軸の両端で、r が半径（ほかは外の四角と、角の丸み・面取りの長さ）。
 *   層（cls）は、MAX で重ねたとき上の面の層が残るよう、下から 0 水、1 地面、2 ベルト、3 線路、4 装置、5 納品所、6 列車
 * - 今の絵の寸法（スキンごと）から、装置・ベルト・立体交差・地下ベルトの口・線路・列車・納品所・水の形を作る（ART。絵を描く関数の数をそのまま写した）
 * - 形の距離（中が負、マス）と、SH0（形を tShape に塗る）・SH1（影・くぼみの陰り・面の傾きを tShade に書く）の JS の見本。
 *   シェーダー（shapes.glsl.ts）と同じ式なので、検査はこれで確かめる
 * tShape は画面の 1/2（CSS の画素）に、画面の外の帯（影を落とす物が画面の外にあっても影が出るように）をつけた大きさ。
 * 中身は R いちばん上の面の高さ、G 層/16、B 浮いた物の下の面、A 床から積み上がった物の高さ（RGBA の説明は fragShape の上）。
 * テクスチャの行は GL と同じく下から数える（合成段の uv と同じ向き。画面の下が v = 0）。
 * このファイルは何も読みこまない。
 */

/** 1 つの形の数の個数 */
export const STRIDE = 8;
/** 形の種類 */
export const KIND = { rect: 0, disc: 1, capsule: 2, oct: 3, dome: 4 } as const;
/** 層（MAX で重ねたとき、上の面の層が残る順） */
export const CLS = { water: 0, ground: 1, belt: 2, rail: 3, machine: 4, hub: 5, train: 6 } as const;
/**
 * 高さ（0〜1）。地面は何もない所の値。今の高さの層と同じ尺度（SPEC2 H2）。
 * domeBase は研究所の反応器のドームの下に敷く、殻の外形の低い台。天面の扱い（AO_TOP 0.15）より少しだけ上
 * （8 ビットで 41/255）なので、描いた殻の四隅（ドームの外）にくぼみの陰りが出ない。地面との差は影の 1 歩（1/12）より小さいので、
 * 硬い光では影を落とさない（柔らかい光でだけ、縁のそばに薄い影）
 */
export const HEIGHT = { water: 0, ground: 0.1, belt: 0.24, bridge: 0.36, tunnel: 0.3, small: 0.44, big: 0.62, tank: 0.44, hub: 0.95, rail: 0.36, train: 0.5, domeBase: 0.16 } as const;
/** 浮き：高架の線路と列車の下の面の高さ（その下は空いていて、低い光は下をくぐる） */
export const LIFT = 0.3;

/** 種類と層を 1 つの数に（種類 + 16·層） */
export const packKC = (kind: number, cls: number) => kind + 16 * cls;
export function unpackKC(v: number): { kind: number; cls: number } { const n = Math.round(v); return { kind: n & 15, cls: n >> 4 }; }

// ---- 形の並び ----
/** 形の並び。足りなくなると 2 倍に広げる（GPU の側も同じく 2 倍。4,096 個で 128 KB） */
export interface ShapeBuf { a: Float32Array; n: number }
export const newShapes = (cap = 256): ShapeBuf => ({ a: new Float32Array(Math.max(1, cap) * STRIDE), n: 0 });
export function pushShape(b: ShapeBuf, x0: number, y0: number, x1: number, y1: number, h: number, kind: number, cls: number, r = 0, lift = 0) {
  if ((b.n + 1) * STRIDE > b.a.length) { const a = new Float32Array(b.a.length * 2); a.set(b.a); b.a = a; }
  const o = b.n * STRIDE, a = b.a;
  a[o] = x0; a[o + 1] = y0; a[o + 2] = x1; a[o + 3] = y1; a[o + 4] = h; a[o + 5] = packKC(kind, cls); a[o + 6] = r; a[o + 7] = lift;
  b.n++;
}

// ---- 今の絵の寸法 ----
export type Skin = 'note' | 'punk' | 'arcane' | 'lab';
export type BeltState = 'solid' | 'liquid' | 'gas' | 'none';
/**
 * 今の絵の寸法。装置は大きさ（1 か 2 マス）に対する割合、そのほかはマス。
 * S0 が絵の中から書き出す定数（CARD・PUNK_BODY・LAB_SHELL・TANK_BODY）と等しいことを、shapes.ts の検査で確かめる
 */
export const ART = {
  /** 文具・魔術の台：machine() の rr(cx − 0.42u, cy − 0.42u, 0.84u, 0.84u, 0.12u)（u は装置の大きさ × 1 マスの画素） */
  card: { size: 0.84, r: 0.12 },
  /** 工業の筐体：machinePunk() の chamfer(cx − a, cy − a, 2a, 2a, c)、a = 0.46u、c = 0.14u（八角形の半分の幅と面取り） */
  punk: { a: 0.46, c: 0.14 },
  /** 研究所の殻：shellOf() の rr(b0, b0, bw, bw, R)、bw = 0.84·sz、R = 0.12·sz（窓の角の 0.07·sz ではなく、殻の外の形） */
  shell: { size: 0.84, r: 0.12 },
  /**
   * 研究所の反応器：殻の半分の幅（0.42·sz）を半径とするドーム（SPEC2 H2）。絵の反応器は殻（角丸の四角）に丸い窓なので、
   * ドームの下に殻の外形の低い台（HEIGHT.domeBase）を敷く
   */
  dome: 0.42,
  /** ベルトの太さ（流れているものごと）。文具 WIDTH、工業 PW、魔術 GW、研究所 labBelts の W */
  belt: {
    note: { solid: 0.6, liquid: 0.46, gas: 0.34, none: 0.52 },
    punk: { solid: 0.62, liquid: 0.44, gas: 0.3, none: 0.5 },
    arcane: { solid: 0.56, liquid: 0.48, gas: 0.4, none: 0.46 },
    lab: { solid: 0.58, liquid: 0.46, gas: 0.36, none: 0.52 },
  } as Record<Skin, Record<BeltState, number>>,
  /**
   * 立体交差と地下ベルトの管の太さ：render.ts の「立体交差」と「地下ベルト」の輪で使う WIDTH.none（どのスキンも同じ。端は butt）。
   * 立体交差は、マスいっぱいの縦の管（ベルトの高さ）の上を、マスいっぱいの横の管（橋の高さ）がまたぐ
   */
  pipe: 0.52,
  /**
   * 地下ベルトの坑口：render.ts の「地下ベルト」の輪の rr(−0.17z, −0.4z, 0.34z, 0.8z, 0.08z) を rotate(dir·90°) したもの
   * （マスの中心に、流れの向きに 0.34、横に 0.8、角の丸み 0.08）。管の切れ端は、入口（先に対の口がある）は後ろ半分、出口は前半分
   */
  portal: { along: 0.34, across: 0.8, r: 0.08 },
  /** 納品所：hub() は内側へ 0.06 マス入った面取り 0.3 マスの八角形、hubLab() は角の丸み 0.42 マスの角丸の四角 */
  hub: { inset: 0.06, c: 0.3, r: 0.42 },
  /** 高架の線路の桁の太さ（z·0.2） */
  rail: 0.2,
  /** 列車の車体：rr(−L/2, −W/2, L, W, 0.08) */
  train: { L: 0.95, W: 0.46, r: 0.08 },
} as const;

/**
 * 装置の台（x, y は左上のマス、sz は 1 か 2）。kind は装置の種類。タンクは台の形で低い。
 * 研究所の反応器は、殻の外形の低い台の上にドーム（2 つの形。MAX で重ねるので、ドームの所はドーム、殻の四隅は低い天面）
 */
export function machineShape(b: ShapeBuf, skin: Skin, kind: string, x: number, y: number, sz: number) {
  const h = kind === 'tank' ? HEIGHT.tank : sz === 2 ? HEIGHT.big : HEIGHT.small, cx = x + sz / 2, cy = y + sz / 2;
  if (skin === 'punk') {
    const a = ART.punk.a * sz;
    pushShape(b, cx - a, cy - a, cx + a, cy + a, h, KIND.oct, CLS.machine, ART.punk.c * sz);
  } else if (skin === 'lab' && kind === 'reactor') {
    const a = (ART.shell.size * sz) / 2, R = ART.dome * sz;
    pushShape(b, cx - a, cy - a, cx + a, cy + a, HEIGHT.domeBase, KIND.rect, CLS.machine, ART.shell.r * sz);
    pushShape(b, cx - R, cy - R, cx + R, cy + R, h, KIND.dome, CLS.machine);
  } else {
    const s = skin === 'lab' ? ART.shell : ART.card, a = (s.size * sz) / 2;
    pushShape(b, cx - a, cy - a, cx + a, cy + a, h, KIND.rect, CLS.machine, s.r * sz);
  }
}
/**
 * ベルト 1 マス（x, y は左上）。(ax, ay) → (bx, by) は beltCurve の入口と出口（マスの中心から、辺の中点まで ±0.5）。
 * 絵は中心を制御点とする 2 次曲線を丸い端の線で引くので、まっすぐなら 1 本、曲がるなら曲線の中点で折った 2 本のカプセル
 * （曲線からのずれは 0.044 マス以下）
 */
export function beltShape(b: ShapeBuf, skin: Skin, st: BeltState, x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const r = ART.belt[skin][st] / 2, cx = x + 0.5, cy = y + 0.5;
  if (Math.abs(ax + bx) < 1e-6 && Math.abs(ay + by) < 1e-6) { pushShape(b, cx + ax, cy + ay, cx + bx, cy + by, HEIGHT.belt, KIND.capsule, CLS.belt, r); return; }
  const mx = cx + (ax + bx) / 4, my = cy + (ay + by) / 4;
  pushShape(b, cx + ax, cy + ay, mx, my, HEIGHT.belt, KIND.capsule, CLS.belt, r);
  pushShape(b, mx, my, cx + bx, cy + by, HEIGHT.belt, KIND.capsule, CLS.belt, r);
}
/**
 * 立体交差（tunnel が false）と地下ベルトの口（x, y は左上のマス）。絵のとおり：
 * - 立体交差：マスいっぱいの縦の管（ベルトの高さ）の上を、マスいっぱいの横の管（橋の高さ）がまたぐ（dir と front は使わない）
 * - 地下ベルト：マスの中心の坑口（流れの向き dir に 0.34、横に 0.8）と、管の切れ端（太さ 0.52、マスの縁から中心まで）。
 *   切れ端は、出口（front が true。render.ts で対の口がないとき）は前半分、入口（先に対の口がある）は後ろ半分
 */
export function crossShape(b: ShapeBuf, tunnel: boolean, x: number, y: number, dir: number, front: boolean) {
  const cx = x + 0.5, cy = y + 0.5, w = ART.pipe / 2;
  if (!tunnel) {
    pushShape(b, x + 0.5 - w, y, x + 0.5 + w, y + 1, HEIGHT.belt, KIND.rect, CLS.belt);
    pushShape(b, x, y + 0.5 - w, x + 1, y + 0.5 + w, HEIGHT.bridge, KIND.rect, CLS.belt);
    return;
  }
  // 向き（render.ts の DX・DY と同じ：0 右、1 下、2 左、3 上）
  const d = ((Math.round(dir) % 4) + 4) % 4, dx = d === 0 ? 1 : d === 2 ? -1 : 0, dy = d === 1 ? 1 : d === 3 ? -1 : 0;
  // 管の切れ端：中心と、前（または後ろ）の縁の中点のあいだ。長さ 0.5、太さ 0.52
  const s = front ? 0.25 : -0.25, mx = cx + dx * s, my = cy + dy * s;
  pushShape(b, mx - (dx ? 0.25 : w), my - (dx ? w : 0.25), mx + (dx ? 0.25 : w), my + (dx ? w : 0.25), HEIGHT.belt, KIND.rect, CLS.belt);
  // 坑口：流れの向きに短く、横に長い
  const P = ART.portal, hx = (dx ? P.along : P.across) / 2, hy = (dx ? P.across : P.along) / 2;
  pushShape(b, cx - hx, cy - hy, cx + hx, cy + hy, HEIGHT.tunnel, KIND.rect, CLS.belt, P.r);
}
/** 納品所（x, y は左上、s は一辺のマス数） */
export function hubShape(b: ShapeBuf, skin: Skin, x: number, y: number, s: number) {
  const m = ART.hub.inset;
  if (skin === 'lab') pushShape(b, x + m, y + m, x + s - m, y + s - m, HEIGHT.hub, KIND.rect, CLS.hub, ART.hub.r);
  else pushShape(b, x + m, y + m, x + s - m, y + s - m, HEIGHT.hub, KIND.oct, CLS.hub, ART.hub.c);
}
/** 高架の線路の 1 区間（マスの中心から中心へ）。下は空いている */
export function railShape(b: ShapeBuf, x0: number, y0: number, x1: number, y1: number) {
  pushShape(b, x0, y0, x1, y1, HEIGHT.rail, KIND.capsule, CLS.rail, ART.rail / 2, LIFT);
}
/** 列車 1 両（中心 x, y、進む向き ang。線路は縦か横なので、向きは 90° ごとにそろえる） */
export function trainShape(b: ShapeBuf, x: number, y: number, ang: number) {
  const q = Math.round(ang / (Math.PI / 2)) & 1, hx = (q ? ART.train.W : ART.train.L) / 2, hy = (q ? ART.train.L : ART.train.W) / 2;
  pushShape(b, x - hx, y - hy, x + hx, y + hy, HEIGHT.train, KIND.rect, CLS.train, ART.train.r, LIFT);
}
/** 水のひと続き（y 行の x0 から x1 の手前まで）。SH0 では混ぜずに先に書く */
export function waterShape(b: ShapeBuf, x0: number, x1: number, y: number) {
  pushShape(b, x0, y, x1, y + 1, HEIGHT.water, KIND.rect, CLS.water);
}

// ---- 形の距離（マス。中が負。どれも正確な距離） ----
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** 線分 a → b までの距離 */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const ex = bx - ax, ey = by - ay, qx = px - ax, qy = py - ay, t = clamp((qx * ex + qy * ey) / Math.max(ex * ex + ey * ey, 1e-12), 0, 1);
  return Math.hypot(qx - ex * t, qy - ey * t);
}
/** 角丸の長方形：中心からの位置、半分の幅と高さ、角の丸み（Inigo Quilez の式） */
export function sdRoundRect(px: number, py: number, bx: number, by: number, r: number) {
  r = clamp(r, 0, Math.min(bx, by));
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
export const sdDisc = (px: number, py: number, R: number) => Math.hypot(px, py) - R;
/** カプセル：軸の始点からの位置、軸のベクトル、半径 */
export const sdCapsule = (px: number, py: number, ax: number, ay: number, r: number) => segDist(px, py, 0, 0, ax, ay) - r;
/**
 * 面取りした長方形：中心からの位置、半分の幅と高さ、面取りの長さ c（chamfer() と同じく、角を両方の辺に沿って c ずつ落とす）。
 * 中は 3 本の辺の直線までの距離のいちばん大きいもの（凸な形なので正確）、外は第 1 象限の 3 本の辺までのいちばん近い距離
 */
export function sdOctagon(px: number, py: number, bx: number, by: number, c: number) {
  c = clamp(c, 0, Math.min(bx, by));
  const x = Math.abs(px), y = Math.abs(py);
  const d = Math.max(x - bx, y - by, (x + y - (bx + by - c)) * Math.SQRT1_2);
  if (d <= 0) return d;
  return Math.min(segDist(x, y, 0, by, bx - c, by), segDist(x, y, bx - c, by, bx, by - c), segDist(x, y, bx, by - c, bx, 0));
}
/** i 番目の形の、世界の点 (x, y) での距離（シェーダーの SH0 と同じ） */
export function sdShape(a: ArrayLike<number>, i: number, x: number, y: number): number {
  const o = i * STRIDE, kind = unpackKC(a[o + 5]).kind;
  if (kind === KIND.capsule) return sdCapsule(x - a[o], y - a[o + 1], a[o + 2] - a[o], a[o + 3] - a[o + 1], Math.max(a[o + 6], 0));
  const cx = (a[o] + a[o + 2]) / 2, cy = (a[o + 1] + a[o + 3]) / 2, bx = Math.abs(a[o + 2] - a[o]) / 2, by = Math.abs(a[o + 3] - a[o + 1]) / 2;
  if (kind === KIND.disc || kind === KIND.dome) return sdDisc(x - cx, y - cy, Math.min(bx, by));
  if (kind === KIND.oct) return sdOctagon(x - cx, y - cy, bx, by, a[o + 6]);
  return sdRoundRect(x - cx, y - cy, bx, by, a[o + 6]);
}

// ---- SH0：形を tShape に塗る ----
/**
 * tShape の 1 画素の値：[いちばん上の面の高さ h, 層/16, 浮いた物の下の面 l, 床から積み上がった物の高さ hs]。画素は RGBA8。
 * どれも MAX で重ねてよい量にしてある。その画素で物が占める高さは [0, hs] と [l, h]（浮いた物がなければ l = 0、hs = h）
 */
export type RGBA = [number, number, number, number];
/** 何も塗っていない所（地面）。水の段のあと、形を MAX で重ねる */
export const CLEAR: Readonly<RGBA> = [HEIGHT.ground, CLS.ground / 16, 0, HEIGHT.ground];
/**
 * i 番目の形が、世界の点 (x, y) を中心とする画素（1 画素 aa マス）に塗る値。塗らなければ null。
 * ふちは 1 画素ぶんぼかす（cov）。層は半分より多く覆う画素だけ。浮いた物（線路・列車）は l に浮きを書き、hs には書かない
 */
export function fragShape(a: ArrayLike<number>, i: number, x: number, y: number, aa: number): RGBA | null {
  const o = i * STRIDE, d = sdShape(a, i, x, y), cov = clamp(0.5 - d / aa, 0, 1);
  if (cov <= 0) return null;
  const { kind, cls } = unpackKC(a[o + 5]), lift = a[o + 7];
  let h = a[o + 4] * cov;
  if (kind === KIND.dome) {
    const R = Math.min(Math.abs(a[o + 2] - a[o]), Math.abs(a[o + 3] - a[o + 1])) / 2, q = Math.hypot(x - (a[o] + a[o + 2]) / 2, y - (a[o + 1] + a[o + 3]) / 2) / R;
    h = a[o + 4] * Math.sqrt(Math.max(1 - q * q, 0));
  }
  return [h, cov >= 0.5 ? cls / 16 : 0, lift * cov, lift > 0 ? 0 : h];
}

/** 形の層の大きさと、世界との対応（どれも CSS の画素とマス） */
export interface ShapeView {
  cw: number; ch: number; z: number;   // 画面の大きさ（CSS の画素）、1 マスの画素
  camX: number; camY: number;          // 画面の中心の世界の位置（マス。上の階は、その階の y のずれを引いた位置）
  g: number;                           // 画面の外の帯（tShape の画素）
  W: number; H: number;                // tShape の大きさ（画素）
  aa: number;                          // tShape の 1 画素（マス）
}
/** 画面の外の帯（tShape の画素）：min(3, 影の長さ·0.95) マス·z/2（いちばん高い納品所 0.95 の影が届く所まで。3 マスで打ち切る） */
export const guardOf = (len: number, z: number) => Math.ceil(Math.min(3, Math.max(0, len) * 0.95) * (z / 2));
/** 形の層の大きさを決める。len は高さ 1 の物の影の長さ（マス、LightState.len） */
export function shapeView(cw: number, ch: number, z: number, len: number, camX: number, camY: number): ShapeView {
  const g = guardOf(len, z);
  return { cw, ch, z, camX, camY, g, W: Math.ceil(cw / 2) + 2 * g, H: Math.ceil(ch / 2) + 2 * g, aa: 2 / z };
}
/** 画素 (i, j)（j は下から）の中心の世界の位置。tShape の中心が画面の中心 */
export const texelWorld = (v: ShapeView, i: number, j: number): [number, number] => [v.camX + (i + 0.5 - v.W / 2) * v.aa, v.camY - (j + 0.5 - v.H / 2) * v.aa];
/** SH0 の uniform：uCam（tShape の中心の世界の位置）、uK（1 マスが clip で何か。下から数える行に合わせ、y は負）、uAA、uInvAA */
export const sh0Uniforms = (v: ShapeView) => ({ uCam: [v.camX, v.camY] as [number, number], uK: [v.z / v.W, -v.z / v.H] as [number, number], uAA: v.aa, uInvAA: 1 / v.aa });

/** 0〜1 の値を 8 ビットに丸める（RGBA8 の描き先と同じ） */
const q8 = (x: number) => Math.round(clamp(x, 0, 1) * 255) / 255;
/**
 * SH0 の見本：地面で消してから、水を混ぜずに書き（中心が中に入る画素だけ、ふちはくっきり）、形を MAX で重ねる。
 * 戻り値は W × H × 4（行は下から）。quant で RGBA8 と同じ丸めをする
 */
export function rasterShapes(list: ShapeBuf, water: ShapeBuf | null, v: ShapeView, quant = true): Float32Array {
  const { W, H, aa } = v, out = new Float32Array(W * H * 4);
  for (let k = 0; k < W * H; k++) out.set(CLEAR, k * 4);
  // 形の外の四角（ぼかしの 1 画素を足す）にかかる画素だけを調べる
  const span = (a: ArrayLike<number>, i: number) => {
    const o = i * STRIDE, cap = unpackKC(a[o + 5]).kind === KIND.capsule ? Math.max(a[o + 6], 0) : 0;
    const x0 = Math.min(a[o], a[o + 2]) - cap - aa, x1 = Math.max(a[o], a[o + 2]) + cap + aa, y0 = Math.min(a[o + 1], a[o + 3]) - cap - aa, y1 = Math.max(a[o + 1], a[o + 3]) + cap + aa;
    const i0 = Math.max(0, Math.floor((x0 - v.camX) / aa + W / 2 - 0.5)), i1 = Math.min(W - 1, Math.ceil((x1 - v.camX) / aa + W / 2 - 0.5));
    const j0 = Math.max(0, Math.floor((v.camY - y1) / aa + H / 2 - 0.5)), j1 = Math.min(H - 1, Math.ceil((v.camY - y0) / aa + H / 2 - 0.5));
    return [i0, i1, j0, j1];
  };
  if (water) for (let s = 0; s < water.n; s++) {
    const [i0, i1, j0, j1] = span(water.a, s);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, y] = texelWorld(v, i, j);
      if (sdShape(water.a, s, x, y) <= 0) out.set([0, 0, 0, 0], (j * W + i) * 4);
    }
  }
  for (let s = 0; s < list.n; s++) {
    const [i0, i1, j0, j1] = span(list.a, s);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, y] = texelWorld(v, i, j), f = fragShape(list.a, s, x, y, aa);
      if (!f) continue;
      const k = (j * W + i) * 4;
      for (let c = 0; c < 4; c++) out[k + c] = Math.max(out[k + c], quant ? q8(f[c]) : f[c]);
    }
  }
  if (quant) for (let k = 0; k < out.length; k++) out[k] = q8(out[k]);
  return out;
}

// ---- SH1：影・くぼみの陰り・面の傾き ----
/** 影の歩数（光の向きへ）と、くぼみの陰りの歩数（4 方向それぞれ） */
export const SHADOW_STEPS = 12, AO_STEPS = 3;
/** くぼみの陰りの 1 歩（マス）。3 歩で 0.18 マスまで：それより離れた地面には陰りが出ない（灰色の輪にならない） */
export const AO_STEP = 0.06;
/** くぼみの陰りの強さ（装置の縁にぴったりつくと 1 近くになる）と、この値より低い差は陰りにしない */
export const AO_K = 1.6, AO_BIAS = 0.02;
/** 陰りを受けるのは、この高さより低い所（地面と水）だけ。天面には陰りがない */
export const AO_TOP = 0.15;
/** 合成段で、いちばん暗い陰りが開けた地面の何倍まで暗くなってよいか（明るい見た目 0.92、暗い見た目 0.85） */
export const AO_FLOOR = { light: 0.92, dark: 0.85 } as const;
/** 面の傾きの強さ（装置の縁 0.34 の段差で、ちょうど ±0.5） */
export const BEV_K = 1.5;
/** 光の状態のうち、形の層が使うもの（LightState の dir・len・soft・vis） */
export interface ShapeLight { dir: readonly [number, number]; len: number; soft: number; vis: number }
/** SH1 の uniform（どれも tShape の uv で。uv の v は上が正） */
export interface ShadeU {
  uShapeScale: [number, number]; uShapeOff: [number, number];   // tShade の uv（画面）→ tShape の uv
  uD: [number, number];                                          // 高さ 1 の物の影の長さ、光の来る向き
  uK: number; uVis: number;                                      // 半影の鋭さ 2 + 14·(1 − soft)、影の濃さ
  uAOX: [number, number, number]; uAOY: [number, number, number]; // くぼみの陰りの 1・2・3 歩（x、y）
  uAOW: [number, number, number]; uAOS: number; uAOMax: number;   // 歩ごとの重み（強さ込み）、その和の 4 倍、上限
  uBev: [number, number];                                         // 面の傾き：光の向きの逆 × 強さ
}
/** uAO（見た目の陰りの強さ、post-looks）から、いちばん暗い陰りが AO_FLOOR を下回らないための上限 */
export const aoMaxFor = (uAO: number, dark: boolean) => (uAO > 0 ? Math.min(1, (1 - AO_FLOOR[dark ? 'dark' : 'light']) / uAO) : 1);
export function shadeUniforms(v: ShapeView, L: ShapeLight, o: { aoMax?: number } = {}): ShadeU {
  const sx = v.cw / 2 / v.W, sy = v.ch / 2 / v.H, tx = v.z / 2 / v.W, ty = v.z / 2 / v.H;
  const n = Math.hypot(L.dir[0], L.dir[1]) || 1, dx = L.dir[0] / n, dy = -L.dir[1] / n, len = Math.max(0, L.len);
  const w = [AO_K, AO_K / 2, AO_K / 3] as [number, number, number], a = AO_STEP;
  return {
    uShapeScale: [sx, sy], uShapeOff: [0.5 - 0.5 * sx, 0.5 - 0.5 * sy],
    uD: [dx * len * tx, dy * len * ty],
    uK: 2 + 14 * (1 - clamp(L.soft, 0, 1)), uVis: clamp(L.vis, 0, 1),
    uAOX: [a * tx, 2 * a * tx, 3 * a * tx], uAOY: [a * ty, 2 * a * ty, 3 * a * ty],
    uAOW: w, uAOS: 4 * (w[0] + w[1] + w[2]), uAOMax: clamp(o.aoMax ?? 1, 0, 1),
    uBev: [-BEV_K * dx, -BEV_K * dy],
  };
}

/** tShape を線形補間で読む（LINEAR、CLAMP_TO_EDGE。textureLod(…, 0.0) と同じ） */
export function sampleShape(tex: Float32Array, W: number, H: number, u: number, v: number): RGBA {
  const x = u * W - 0.5, y = v * H - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const ix0 = clamp(x0, 0, W - 1), ix1 = clamp(x0 + 1, 0, W - 1), iy0 = clamp(y0, 0, H - 1), iy1 = clamp(y0 + 1, 0, H - 1);
  const r: RGBA = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = tex[(iy0 * W + ix0) * 4 + c], b = tex[(iy0 * W + ix1) * 4 + c], d = tex[(iy1 * W + ix0) * 4 + c], e = tex[(iy1 * W + ix1) * 4 + c];
    r[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return r;
}
/**
 * SH1 の見本：tShade の uv (u, v) の 1 画素。[影（0 日なた〜1、uVis をかけた値）, くぼみの陰り, 面の傾き（0.5 が平ら）, 天面]。
 * 影：光の向きへ 12 歩。歩 i（t = i/12）で光の線の高さは r = h0 + t。物が占める [0, hs] と [l, h] の外を通る余り
 * c = max(r − h, min(l − r, r − hs)) の、t に対する比のいちばん小さいもの m' から、res = clamp(K·m')
 * （接地点では t が小さいので比が大きく変わり、くっきりする。浮いた線路の下は、低い光がくぐる）。
 * c/t = 1 + max(h0 − h, min(l − h0 − 2t, h0 − hs))/t なので、m はその右の項のいちばん小さいもの、res = clamp(K·(1 + m))。
 * くぼみの陰り：4 方向 × 3 歩、床から積み上がった物（hs）が自分より 0.02 以上高いときだけ（浮いた線路のまわりに輪が出ない）。
 * 面の傾き：1 歩目の 4 点のいちばん上の面の差。まわりより高い側（縁の上）だけにつける（地面に明るい縁や暗い縁が出ない）
 */
export function shadeAt(tex: Float32Array, W: number, H: number, U: ShadeU, u: number, v: number): RGBA {
  const sx = u * U.uShapeScale[0] + U.uShapeOff[0], sy = v * U.uShapeScale[1] + U.uShapeOff[1];
  const at = (x: number, y: number) => sampleShape(tex, W, H, x, y);
  const h0 = at(sx, sy)[0];
  let m = Infinity;
  for (let i = 1; i <= SHADOW_STEPS; i++) {
    const t = i / SHADOW_STEPS, s = at(sx + U.uD[0] * t, sy + U.uD[1] * t);
    m = Math.min(m, Math.max(h0 - s[0], Math.min(s[2] - (h0 + 2 * t), h0 - s[3])) / t);
  }
  const shadow = U.uVis - U.uVis * clamp(U.uK * m + U.uK, 0, 1);
  const hT = h0 + AO_BIAS, A = [0, 0, 0], ring: number[] = [];
  for (let j = 0; j < AO_STEPS; j++) {
    const s = [at(sx + U.uAOX[j], sy), at(sx - U.uAOX[j], sy), at(sx, sy + U.uAOY[j]), at(sx, sy - U.uAOY[j])];
    if (j === 0) ring.push(...s.map((q) => q[0]));
    A[j] = s.reduce((q, p) => q + Math.max(p[3], hT), 0);
  }
  const ao = clamp(A[0] * U.uAOW[0] + A[1] * U.uAOW[1] + A[2] * U.uAOW[2] - hT * U.uAOS, 0, U.uAOMax) * (h0 <= AO_TOP ? 1 : 0);
  const gx = ring[0] - ring[1], gy = ring[2] - ring[3], up = h0 >= (ring[0] + ring[1] + ring[2] + ring[3]) * 0.25 ? 1 : 0;
  const bevel = 0.5 + up * clamp(gx * U.uBev[0] + gy * U.uBev[1], -0.5, 0.5);
  return [shadow, ao, bevel, h0 >= AO_TOP ? 1 : 0];
}
/** SH1 の見本を tShade 全体に（w × h、行は下から） */
export function shadeGrid(tex: Float32Array, W: number, H: number, U: ShadeU, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.set(shadeAt(tex, W, H, U, (i + 0.5) / w, (j + 0.5) / h), (j * w + i) * 4);
  return out;
}
