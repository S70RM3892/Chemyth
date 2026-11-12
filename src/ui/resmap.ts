/**
 * 研究の図：段ごとに 1 行。二者択一の組は点線で囲んで「どちらか一方」と結び、先に要る研究からは矢印を引く。
 * 研究済みは塗り、始められるものは実線、まだ開いていないものは点線。押すと、下の札（研究のボタン）へ移る
 */
import { RESEARCH, type Research } from '../content/research';
import { has, researchBlock, tierNeed, type World } from '../engine/world';
import { svg } from './charts';
import { h } from './dom';

const NW = 128, NH = 46, GAP = 12, PAIR = 26, X0 = 80, ROW = 82, TOP = 22;

export function researchMap(w: World): HTMLElement {
  const pos = new Map<string, { x: number; y: number }>(), rows: Research[][] = [];
  for (const tier of [1, 2, 3]) {
    const list = RESEARCH.filter((r) => r.tier === tier);
    // 組のないものを先に、組は 2 つ並べる
    rows.push([...list.filter((r) => !r.group), ...list.filter((r) => r.group)]);
  }
  const groups: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  rows.forEach((list, ti) => {
    let x = X0;
    list.forEach((r, i) => {
      const prev = list[i - 1];
      if (i && prev.group && prev.group === r.group) x += PAIR - GAP;
      pos.set(r.id, { x, y: TOP + ti * ROW });
      if (i && prev.group && prev.group === r.group) groups.push({ a: pos.get(prev.id)!, b: pos.get(r.id)! });
      x += NW + GAP;
    });
  });
  const width = Math.max(...[...pos.values()].map((p) => p.x + NW)) + 8, height = TOP + rows.length * ROW - 18;
  const kids: SVGElement[] = [];
  // 段の見出し：開く条件
  rows.forEach((_, ti) => {
    const need = tierNeed(ti + 1), open = w.research.length >= need, y = TOP + ti * ROW;
    const t1 = svg('text', { class: 'rm-tier', x: 4, y: y + 19 }), t2 = svg('text', { class: 'rm-need' + (open ? '' : ' locked'), x: 4, y: y + 37 });
    t1.textContent = `第 ${ti + 1} 段`;
    t2.textContent = need ? (open ? `${need} 個で開いた` : `あと ${need - w.research.length} 個`) : '最初から';
    kids.push(t1, t2);
  });
  // 二者択一の囲み
  for (const g of groups) {
    const x = g.a.x - 5, y = g.a.y - 12, wd = g.b.x + NW - g.a.x + 10;
    kids.push(svg('rect', { class: 'rm-pair', x, y, width: wd, height: NH + 17, rx: 8 }));
    const t = svg('text', { class: 'rm-pair-t', x: x + wd / 2, y: y + 4 });
    t.textContent = 'どちらか一方';
    kids.push(t, svg('line', { class: 'rm-or', x1: g.a.x + NW + 3, x2: g.b.x - 3, y1: g.a.y + NH / 2, y2: g.b.y + NH / 2 }));
  }
  // 先に要る研究からの矢印
  for (const r of RESEARCH) for (const need of r.needs ?? []) {
    const a = pos.get(need), b = pos.get(r.id);
    if (!a || !b) continue;
    const x1 = a.x + NW / 2, y1 = a.y + NH, x2 = b.x + NW / 2, y2 = b.y - 2;
    kids.push(svg('path', { class: 'rm-need-arrow' + (has(w, need) ? ' on' : ''), d: `M${x1},${y1 + 2} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2 - 6}` }),
      svg('path', { class: 'rm-head' + (has(w, need) ? ' on' : ''), d: `M${x2 - 5},${y2 - 8} L${x2},${y2} L${x2 + 5},${y2 - 8} Z` }));
  }
  // 研究の箱
  for (const r of RESEARCH) {
    const p = pos.get(r.id)!, done = has(w, r.id), block = researchBlock(w, r);
    const rival = r.group ? RESEARCH.find((x) => x.group === r.group && x.id !== r.id && has(w, x.id)) : undefined;
    const st = done ? 'done' : rival ? 'other' : block && !block.startsWith('研究点') ? 'locked' : 'open';
    const name = svg('text', { class: 'rm-name', x: p.x + NW / 2, y: p.y + 19 }), note = svg('text', { class: 'rm-note', x: p.x + NW / 2, y: p.y + 36 });
    name.textContent = r.name;
    note.textContent = done ? '★ 研究済み' : rival ? '選ばなかった' : st === 'locked' ? (block!.startsWith('先に') ? `先に「${(r.needs ?? []).map((id) => RESEARCH.find((x) => x.id === id)?.name ?? id).join('・')}」` : '段がまだ') : `${r.cost} 点${block ? '（足りない）' : ''}`;
    const g = svg('g', { class: `rm-node ${st}`, tabindex: 0, role: 'button', 'aria-label': `${r.name}：${note.textContent}` },
      svg('rect', { x: p.x, y: p.y, width: NW, height: NH, rx: 6 }), name, note);
    const go = () => {
      const card = document.getElementById(`rsc-${r.id}`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    };
    g.addEventListener('click', go);
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
    kids.push(g);
  }
  return h('div', { class: 'rmap', id: 'rs-map' },
    svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': '研究の図。段ごとの研究と、二者択一の組と、先に要る研究' }, ...kids),
    h('p', { class: 'muted' }, '塗った箱は研究済み、実線は始められる、点線はまだ開いていない。箱を押すと、下の説明とボタンへ移る。'));
}
