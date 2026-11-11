import type { Atom, Mol } from '../chem/isomers';
import { h } from './dom';
import { sfx } from './sound';

/** 構造式を自分で組み立てる入力欄。京大の有機は構造式を描いて答えるので、選択肢に頼らない練習をここでする。
 *  マス目に原子を置き、原子を 2 つ続けてタップすると結合がつく（もう一度で二重結合、さらにもう一度で外れる）。
 *  水素は書かない。価数の残りから自動で補って表示する */
const COLS = 9, ROWS = 5, VALENCE: Record<string, number> = { C: 4, O: 2, N: 3, Cl: 1, Br: 1 };
const SUB = '₀₁₂₃₄₅₆₇₈₉';

export interface Editor { el: HTMLElement; mol(): Mol | null; problem(): string | null }

export function structureEditor(elements: string[] = ['C', 'O', 'Cl']): Editor {
  const atoms = new Map<number, string>();
  let bonds: [number, number, 1 | 2][] = [];
  let tool = 'C', sel: number | null = null;
  const used = (i: number) => bonds.filter((b) => b[0] === i || b[1] === i).reduce((a, b) => a + b[2], 0);
  /** 水素を補った表示：CH₃、CH₂、OH など */
  const text = (i: number) => {
    const el = atoms.get(i)!, hn = VALENCE[el] - used(i);
    if (el === 'Cl' || el === 'Br') return el;
    return hn <= 0 ? el : hn === 1 ? `${el}H` : `${el}H${SUB[hn]}`;
  };
  const grid = h('div', { class: 'draw-grid' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'draw-bonds');
  svg.setAttribute('viewBox', `0 0 ${COLS * 10} ${ROWS * 10}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const palette = h('div', { class: 'chips' });
  const status = h('p', { class: 'muted draw-status' });
  const center = (i: number): [number, number] => [(i % COLS) * 10 + 5, Math.floor(i / COLS) * 10 + 5];

  const paint = () => {
    palette.replaceChildren(
      ...elements.map((el) => h('button', { class: 'chip plain' + (tool === el ? ' on' : ''), type: 'button', id: `draw-el-${el}`, onclick: () => { tool = el; paint(); } }, el)), // 選んでいる原子はそのまま：次に置く原子がそこにつながる
      h('button', { class: 'chip plain' + (tool === '-' ? ' on' : ''), type: 'button', id: 'draw-bond', onclick: () => { tool = '-'; sel = null; paint(); } }, '結合を変える'),
      h('button', { class: 'chip plain' + (tool === 'x' ? ' on' : ''), type: 'button', id: 'draw-erase', onclick: () => { tool = 'x'; sel = null; paint(); } }, '消す'),
      h('button', { class: 'chip plain', type: 'button', id: 'draw-clear', onclick: () => { atoms.clear(); bonds = []; sel = null; paint(); } }, '全部消す'));
    svg.replaceChildren(...bonds.flatMap(([a, b, order]) => {
      const [x1, y1] = center(a), [x2, y2] = center(b), len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (-(y2 - y1) / len) * 0.9, ny = ((x2 - x1) / len) * 0.9;
      return (order === 2 ? [-1, 1] : [0]).map((k) => {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', String(x1 + nx * k)); l.setAttribute('y1', String(y1 + ny * k));
        l.setAttribute('x2', String(x2 + nx * k)); l.setAttribute('y2', String(y2 + ny * k));
        return l;
      });
    }));
    grid.replaceChildren(svg, ...Array.from({ length: COLS * ROWS }, (_, i) => {
      const el = atoms.get(i), over = el ? used(i) > VALENCE[el] : false;
      const b = h('button', { class: 'draw-cell' + (el ? ' atom' : '') + (sel === i ? ' on' : '') + (over ? ' bad' : ''), type: 'button', id: `draw-${i}`, ariaLabel: el ? text(i) : '空き' }, el ? text(i) : '');
      b.onclick = () => {
        if (tool === 'x') { if (el) { atoms.delete(i); bonds = bonds.filter((q) => q[0] !== i && q[1] !== i); } sel = null; }
        else if (!el) { if (tool !== '-') { atoms.set(i, tool); if (sel !== null && atoms.has(sel)) bonds.push([sel, i, 1]); sel = i; } } // 置いた原子は、選んでいた原子につなぐ
        else if (tool !== '-') sel = sel === i ? null : i; // 元素を選んでいるとき：枝を伸ばす元の原子を選ぶだけ
        else if (sel === null || sel === i) sel = sel === i ? null : i;
        else {
          // 結合の道具：2 つの原子を続けてタップすると、結合なし → 単結合 → 二重結合 → 結合なし
          const k = bonds.findIndex((q) => (q[0] === sel && q[1] === i) || (q[0] === i && q[1] === sel));
          if (k < 0) bonds.push([sel, i, 1]); else if (bonds[k][2] === 1) bonds[k][2] = 2; else bonds.splice(k, 1);
          sel = null;
        }
        sfx.tap();
        paint();
      };
      return b;
    }));
    const p = problem();
    status.textContent = atoms.size === 0 ? '元素を選んで、マス目をタップして原子を置け。続けて置くと、前の原子と結合する。枝を出すときは、元の原子をタップしてから置く。二重結合は「結合を変える」を選び、原子を 2 つ続けてタップする。水素は書かなくてよい。' : p ?? '結合の手は合っている。';
  };

  function order(): number[] { return [...atoms.keys()].sort((a, b) => a - b); }
  function problem(): string | null {
    const ids = order();
    if (!ids.length) return 'まだ何も置いていない。';
    for (const i of ids) if (used(i) > VALENCE[atoms.get(i)!]) return `${atoms.get(i)} の結合の手が多すぎる（${atoms.get(i)} は ${VALENCE[atoms.get(i)!]} 本まで）。`;
    // つながっているか
    const seen = new Set([ids[0]]), stack = [ids[0]];
    while (stack.length) { const a = stack.pop()!; for (const [x, y] of bonds) { const o = x === a ? y : y === a ? x : -1; if (o >= 0 && !seen.has(o)) { seen.add(o); stack.push(o); } } }
    if (seen.size !== ids.length) return 'つながっていない原子がある。1 つの分子にしろ。';
    return null;
  }
  function mol(): Mol | null {
    if (problem()) return null;
    const ids = order(), at = new Map(ids.map((id, k) => [id, k]));
    return { atoms: ids.map((i) => atoms.get(i) as Atom), bonds: bonds.map(([a, b, o]) => [at.get(a)!, at.get(b)!, o]) };
  }
  paint();
  return { el: h('div', { class: 'draw' }, palette, grid, status), mol, problem };
}
