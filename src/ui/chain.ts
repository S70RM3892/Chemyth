/**
 * 生産の流れの画面：いまの指令の物質から、原料までの反応の木。
 * 工場にある工程は緑（押すとその設備へ移る）、ない工程は赤。まだ正しく設定したことのない反応は、原料を「ヒント」の中にしまう
 */
import { MACHINES } from '../content/machines';
import { label, sub } from '../content/substances';
import { chainGaps, chainOf, type ChainNode } from '../engine/chain';
import { currentGoal, type Ent } from '../engine/world';
import { h } from './dom';
import { sfx } from './sound';
import type { StatsCtx } from './stats';
import { tokenIcon } from './token';
import { prefs } from './prefs';

const SEP_NAME = { settler: '沈殿槽', funnel: '分液ろうと', phoresis: '電気泳動槽' } as const;
const subName = (s: string) => (s === 'e' ? '電子 e⁻' : `${sub(s).name}${sub(s).formula && !sub(s).mask ? ` ${label(s)}` : ''}`);

export function showChain(c: StatsCtx, pick?: string, back?: () => void) {
  const { w } = c, g = currentGoal(w);
  const opts = [...new Set([...(g ? [g.s, ...(g.also ?? [])] : []), ...(w.side ? [w.side.s] : [])])];
  const s = pick && opts.includes(pick) ? pick : opts[0];
  const head = h('header', {}, h('h2', {}, '生産の流れ'), h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる'));
  if (!s) { c.show(head, h('p', {}, 'いまの章の指令は終えた。指令の一覧から、別の章を選べ。')); return; }
  const tree = chainOf(w, s), gaps = chainGaps(tree), hide = !prefs().hints;
  const go = (e: Ent | undefined) => (e ? () => { sfx.tap(); c.focus(e); } : undefined);
  const status = (n: ChainNode, yes: string, no: string): HTMLElement => n.have && n.at
    ? h('button', { class: 'cn-st ok', type: 'button', title: '押すと、その場所へ移る', onclick: go(n.at) }, `✓ ${yes}`)
    : h('span', { class: `cn-st ${n.have ? 'ok' : 'ng'}` }, n.have ? `✓ ${yes}` : `✕ ${no}`);
  const node = (n: ChainNode): HTMLElement => {
    const what = h('span', { class: 'cn-s' }, tokenIcon(n.s, 22), h('b', {}, subName(n.s)));
    let how: (HTMLElement | null)[] = [];
    if (n.kind === 'recipe' || n.kind === 'deep') {
      const m = MACHINES[n.recipe!.machine];
      const glyph = h('i', { class: 'cn-g' }, m.glyph);
      glyph.style.background = m.color;
      how = [h('span', { class: 'cn-how' }, '← ', glyph, `${m.name}：${n.recipe!.name}`), status(n, '工場にある', '工場にない'),
        n.alt ? h('small', { class: 'muted' }, n.alt <= 9 ? `ほかに ${n.alt} 通りの作り方` : 'ほかの多くの反応でもできる') : null];
    } else if (n.kind === 'raw') how = [h('span', { class: 'cn-how' }, `← 採取：${n.where}`), status(n, '採取機がある', '採取機がない')];
    else if (n.kind === 'reagent') how = [h('span', { class: 'cn-how' }, `← 試薬棚${n.where ? `（試料「${n.where}」）` : ''}`), status(n, '試薬棚がある', '試薬棚がない')];
    else if (n.kind === 'sep') how = [h('span', { class: 'cn-how' }, `← ${SEP_NAME[n.sepKind!]}で、試薬棚の混合物から分ける`), status(n, `${SEP_NAME[n.sepKind!]}がある`, `${SEP_NAME[n.sepKind!]}がない`)];
    else if (n.kind === 'loop') how = [h('span', { class: 'cn-how muted' }, '↺ 上の段で作ったものを、戻して使う（循環）')];
    const own = n.kind === 'loop' ? 'loop' : n.have ? 'have' : 'miss';
    const li = h('li', { class: `cn ${own}` }, h('div', { class: 'cn-row' }, what, ...how));
    if (n.kind === 'deep') li.append(h('p', { class: 'muted' }, 'この先は深いので省いた。この物質を指令に選ぶか、図鑑で確かめろ。'));
    if (n.inputs.length) {
      const kids = h('ul', {}, ...n.inputs.map(node));
      // 「指令のヒント」を隠す設定のときは、まだ正しく設定したことのない反応の原料を、すぐには見せない（自分で考えてから開く）
      if (hide && n.recipe && !w.learned.includes(n.recipe.id) && !n.have) li.append(h('details', { class: 'cn-hint' }, h('summary', {}, `原料を見る（ヒント・${n.inputs.length} 種）`), kids));
      else li.append(kids);
    }
    return li;
  };
  c.show(head,
    opts.length > 1 ? h('div', { class: 'row chips small' }, ...opts.map((x) => h('button', { class: 'chip' + (x === s ? ' on' : ''), type: 'button', id: `chain-${x}`, onclick: () => showChain(c, x, back) }, (w.side?.s === x && !(g && [g.s, ...(g.also ?? [])].includes(x)) ? '混ぜ注文：' : '') + subName(x)))) : null,
    h('p', { class: 'chain-sum', id: 'chain-sum' }, gaps.miss ? h('b', { class: 'ng' }, `足りない工程 ${gaps.miss}`) : h('b', { class: 'ok' }, '工程はすべて工場にある'), `　（全 ${gaps.all} 工程。緑の工程を押すと、その設備へ移る）`),
    h('ul', { class: 'chain', id: 'chain-tree' }, node(tree)),
    h('p', { class: 'muted' }, `反応は、工場にあるもの → 正しく設定したことのあるもの → 原料にいちばん近いもの、の順に選んでいる。${hide ? '指令のヒントを隠す設定なので、まだ設定したことのない反応の原料は「ヒント」の中にしまってある。' : '自分で考えたいときは、設定で「指令のヒント」を隠すと、まだ設定したことのない反応の原料をしまう。'}`),
    back ? h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'chain-back', onclick: back }, '統計へ戻る')) : null);
}
