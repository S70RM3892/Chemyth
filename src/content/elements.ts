/** 元素ごとの固有の形と色。形は −1〜1 の枠に収まる SVG パス */
export interface ElementInfo {
  sym: string;
  name: string;
  color: string;
  d: string;
  evenodd?: boolean;
  /** 形や色の由来。覚える手がかりにする */
  why: string;
}

const f = (n: number) => +n.toFixed(3);
const pts = (p: number[][]) => 'M' + p.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z';
const rad = (deg: number) => (deg * Math.PI) / 180;
const poly = (n: number, rot = -90, r = 1) => pts(Array.from({ length: n }, (_, i) => [r * Math.cos(rad(rot + (360 * i) / n)), r * Math.sin(rad(rot + (360 * i) / n))]));
const star = (n: number, inner: number, rot = -90) => pts(Array.from({ length: 2 * n }, (_, i) => {
  const r = i % 2 ? inner : 1, a = rad(rot + (180 * i) / n);
  return [r * Math.cos(a), r * Math.sin(a)];
}));
const circ = (cx: number, cy: number, r: number) => `M${f(cx + r)},${f(cy)}A${r},${r} 0 1,1 ${f(cx - r)},${f(cy)}A${r},${r} 0 1,1 ${f(cx + r)},${f(cy)}Z`;
const flower = (n: number) => Array.from({ length: n }, (_, i) => circ(0.52 * Math.cos(rad(-90 + (360 * i) / n)), 0.52 * Math.sin(rad(-90 + (360 * i) / n)), 0.48)).join('') + circ(0, 0, 0.42);

export const ELEMENTS: ElementInfo[] = [
  { sym: 'H', name: '水素', color: '#f4f4ee', d: circ(0, 0, 0.72), why: '最も軽い元素。小さな白い玉。' },
  { sym: 'C', name: '炭素', color: '#8f9aa8', d: poly(6, 0), why: 'ベンゼン環の六角形。' },
  { sym: 'N', name: '窒素', color: '#6f8cff', d: poly(3), why: '結合の手が 3 本。' },
  { sym: 'O', name: '酸素', color: '#ff6b6b', d: circ(0, 0, 1) + circ(0, 0, 0.5), evenodd: true, why: '結合の手が 2 本。輪。' },
  { sym: 'F', name: 'フッ素', color: '#e9e59a', d: 'M0,-1A1.25,1.25 0 0,1 0,1A1.25,1.25 0 0,1 0,-1Z', why: 'F₂ は淡黄色の気体。ハロゲンは花びらの数が周期とともに増える。' },
  { sym: 'Cl', name: '塩素', color: '#b9d94a', d: flower(3), why: 'Cl₂ は黄緑色の気体。花びら 3 枚。' },
  { sym: 'Br', name: '臭素', color: '#c8643c', d: flower(4), why: 'Br₂ は赤褐色の液体。花びら 4 枚。' },
  { sym: 'I', name: 'ヨウ素', color: '#9273d6', d: flower(5), why: 'I₂ は黒紫色の固体で、蒸気は紫。花びら 5 枚。' },
  { sym: 'S', name: '硫黄', color: '#f2d43a', d: star(5, 0.45), why: '単体は黄色の固体。' },
  { sym: 'P', name: 'リン', color: '#ff9bb0', d: star(4, 0.38), why: '黄リンは空気中で自然発火して光る。' },
  { sym: 'Si', name: 'ケイ素', color: '#9fb7c9', d: poly(4), why: 'ダイヤモンドと同じ構造の共有結合の結晶。' },
  { sym: 'Na', name: 'ナトリウム', color: '#f7d038', d: 'M-0.5,-0.82L0.5,-0.82Q0.82,-0.82 0.82,-0.5L0.82,0.5Q0.82,0.82 0.5,0.82L-0.5,0.82Q-0.82,0.82 -0.82,0.5L-0.82,-0.5Q-0.82,-0.82 -0.5,-0.82Z', why: '炎色反応は黄。' },
  { sym: 'K', name: 'カリウム', color: '#b98cf0', d: poly(8, 22.5), why: '炎色反応は赤紫。' },
  { sym: 'Mg', name: 'マグネシウム', color: '#eef1f3', d: poly(5), why: '燃えると白く強い光を出す。' },
  { sym: 'Ca', name: 'カルシウム', color: '#f08a4b', d: 'M-0.85,-0.85L0.85,-0.85L0.85,0.1Q0.85,0.8 0,1Q-0.85,0.8 -0.85,0.1Z', why: '炎色反応は橙赤。骨や殻を守る盾。' },
  { sym: 'Ba', name: 'バリウム', color: '#9fdc6a', d: poly(7), why: '炎色反応は黄緑。' },
  { sym: 'Al', name: 'アルミニウム', color: '#cfd6dc', d: pts([[-0.6, -0.75], [0.6, -0.75], [1, 0.75], [-1, 0.75]]), why: '軽い銀白色の両性金属。' },
  { sym: 'Zn', name: '亜鉛', color: '#9db4c0', d: pts([[-0.36, -1], [0.36, -1], [0.36, -0.36], [1, -0.36], [1, 0.36], [0.36, 0.36], [0.36, 1], [-0.36, 1], [-0.36, 0.36], [-1, 0.36], [-1, -0.36], [-0.36, -0.36]]), why: '両性金属。鉄を守るめっき（トタン）。' },
  { sym: 'Fe', name: '鉄', color: '#c9703f', d: star(8, 0.72), why: 'さびは赤褐色。歯車。' },
  { sym: 'Cu', name: '銅', color: '#3fb8a6', d: circ(0, 0, 1) + pts([[-0.36, -0.36], [0.36, -0.36], [0.36, 0.36], [-0.36, 0.36]]), evenodd: true, why: '炎色反応は青緑。穴あきの銅貨。' },
  { sym: 'Ag', name: '銀', color: '#e3e7ea', d: 'M0.35,-0.94A1,1 0 1,0 0.35,0.94A1.15,1.15 0 0,1 0.35,-0.94Z', why: '銀白色。三日月。' },
  { sym: 'Pb', name: '鉛', color: '#8a95a6', d: 'M-1,0.55A1,1 0 0,1 1,0.55Z', why: '重くやわらかい。おもりの形。' },
  { sym: 'Mn', name: 'マンガン', color: '#c858b8', d: pts([[-1, -0.75], [0, -0.2], [1, -0.75], [1, 0.75], [0, 0.2], [-1, 0.75]]), why: 'MnO₄⁻ は赤紫色。' },
  { sym: 'Cr', name: 'クロム', color: '#f09a3e', d: star(6, 0.55), why: 'Cr₂O₇²⁻ は橙赤色、CrO₄²⁻ は黄色。' },
];

/** 電子。元素ではないが、電池の生成物として流れる */
export const ELECTRON: ElementInfo = {
  sym: 'e', name: '電子', color: '#fff27a',
  d: pts([[0.15, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.2, 1], [0.6, -0.2], [0.05, -0.2]]),
  why: '負極から正極へ導線を流れる。',
};

const bySym = new Map([...ELEMENTS, ELECTRON].map((e) => [e.sym, e]));
export function element(sym: string): ElementInfo {
  const e = bySym.get(sym);
  if (!e) throw new Error(`形のない元素: ${sym}`);
  return e;
}
