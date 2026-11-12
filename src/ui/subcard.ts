/**
 * 物質の札（図鑑の「物質」と同じ形）と、解説の文の中の物質名を押せるようにする部品。
 * 復習の結果で物質名を押すと、その場で図鑑の札を開く（復習の流れを切らない）。
 */
import { appearance, lookOf } from '../content/looks';
import { label, sub } from '../content/substances';
import { subSpans } from '../engine/learn';
import { h } from './dom';
import { sfx } from './sound';
import { tokenIcon } from './token';

const ST = { gas: '気体', liquid: '液体', solid: '固体' } as const;
/** 物質の実際の色の見本 */
export const swatch = (hex: string) => { const i = h('i', {}); i.style.background = hex; return i; };
/** 図鑑の札：絵柄・化学式・名前と状態・見た目 */
export function subCard(id: string): HTMLElement {
  const s = sub(id), look = lookOf(id);
  return h('div', { class: 'card' }, tokenIcon(id, 38),
    h('div', { class: 'stack tight' }, h('b', { class: s.formula ? 'formula' : '' }, label(id)), h('span', { class: 'muted' }, `${s.name}・${s.formula ? ST[s.state] : '混合物など'}`),
      look ? h('span', { class: 'look' }, swatch(look.hex), appearance(id)) : null));
}
/**
 * 文の中の物質名（ids のもの）を、押せる語にする。押すと box に図鑑の札を出す（もう一度押すと閉じる）。
 * box を省くと、札は出さずに語だけ並べる
 */
export function linkText(text: string, ids: Iterable<string>, box?: HTMLElement): (Node | string)[] {
  return subSpans(text, ids).map((x) => {
    if (!x.id || !box) return x.t;
    const id = x.id;
    const b = h('button', { class: 'sublink', type: 'button', title: `${sub(id).name}（図鑑の札を開く）` }, x.t);
    b.dataset.sub = id;
    b.onclick = (ev) => {
      ev.stopPropagation();
      const open = box.dataset.sub === id && !box.hidden;
      box.dataset.sub = open ? '' : id;
      box.hidden = open;
      box.replaceChildren(...(open ? [] : [subCard(id)]));
      sfx.tap();
    };
    return b;
  });
}
