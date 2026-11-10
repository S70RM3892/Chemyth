import { CONDITIONS, recipeById, type MachineKind, type Recipe } from '../content/recipes';
import { label, sub } from '../content/substances';
import { clearRecipe, configure, judge, type Dir, type Ent, type World } from '../engine/world';
import { h } from './dom';
import { MACHINE_STYLE } from './render';

const DIR_NAME = ['右 →', '下 ↓', '左 ←', '上 ↑'];
const PORT_NAME = ['正面', '右手', '左手'];

export function equation(r: Recipe): string {
  const side = (s: [string, number][]) => s.map(([id, n]) => (r.separation || n === 1 ? '' : n) + label(id)).join(' + ');
  return `${side(r.inputs)} → ${side(r.outputs)}`;
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** 装置の設定シート。試薬・係数・条件を自分で埋めさせる */
export function openConfig(sheet: HTMLElement, w: World, e: Ent, close: () => void) {
  const kind = e.kind as MachineKind;
  const cond = CONDITIONS[kind];
  const isCell = kind === 'electrolyzer';
  const isSep = kind === 'separator';
  let fails = 0;

  const render = () => {
    sheet.replaceChildren();
    const r = recipeById(e.recipe);
    const facing = h('button', { class: 'ghost', type: 'button', id: 'cfg-rotate' }, `正面の向き：${DIR_NAME[e.dir]}`);
    facing.onclick = () => { e.dir = ((e.dir + 1) % 4) as Dir; facing.textContent = `正面の向き：${DIR_NAME[e.dir]}`; };
    sheet.append(
      h('header', {}, h('h2', {}, MACHINE_STYLE[kind].name), h('button', { class: 'ghost', type: 'button', id: 'cfg-close', onclick: close }, '閉じる')),
    );
    if (r) {
      sheet.append(
        h('p', { class: 'eq' }, equation(r)),
        h('p', { class: 'muted' }, `${r.name}。出口は ` + e.outOrder!.map((s, i) => `${PORT_NAME[i]}＝${label(s)}`).join('、') + '。'),
        h('p', { class: 'note' }, r.note),
        h('div', { class: 'row' }, facing, h('button', { class: 'ghost', type: 'button', id: 'cfg-redo', onclick: () => { clearRecipe(e); render(); } }, '設定をやり直す')),
      );
      return;
    }
    sheet.append(form(facing));
  };

  const form = (facing: HTMLElement) => {
    const picked = new Set<string>();
    const reactRows = h('div', { class: 'rows' });
    const prodRows = h('div', { class: 'rows' });
    const feedback = h('p', { class: 'feedback', id: 'cfg-feedback' });
    feedback.setAttribute('role', 'status');
    const coef = (id: string) => h('input', { class: 'coef', id, type: 'number', min: '1', max: '20', inputMode: 'numeric', placeholder: '1', ariaLabel: '係数' });

    const chips = h('div', { class: 'chips' }, ...w.discovered.map((s) => {
      const b = h('button', { class: 'chip', type: 'button', id: `cfg-chip-${s}` }, label(s));
      b.style.setProperty('--dot', sub(s).color);
      b.onclick = () => {
        picked.has(s) ? picked.delete(s) : picked.add(s);
        b.classList.toggle('on', picked.has(s));
        b.setAttribute('aria-pressed', String(picked.has(s)));
        drawReactants();
      };
      return b;
    }));
    const drawReactants = () => {
      reactRows.replaceChildren(...[...picked].map((s) =>
        h('div', { class: 'row' }, isSep ? null : coef(`cfg-rc-${s}`), h('span', { class: 'formula' }, label(s)))));
    };
    const addProduct = (name: string) => {
      const i = prodRows.children.length;
      prodRows.append(h('label', { class: 'row' },
        h('span', { class: 'tag' }, name),
        isSep ? null : coef(`cfg-pc-${i}`),
        h('input', { class: 'ftext', id: `cfg-pf-${i}`, type: 'text', autocapitalize: 'off', autocomplete: 'off', spellcheck: false, placeholder: '化学式（例 CO2）' }),
      ));
    };
    if (isCell) { addProduct('陰極'); addProduct('陽極'); } else addProduct(PORT_NAME[0]);
    const more = h('button', { class: 'ghost', type: 'button', id: 'cfg-add' }, '＋ 生成物を追加');
    more.onclick = () => {
      addProduct(PORT_NAME[prodRows.children.length]);
      if (prodRows.children.length >= 3) more.hidden = true;
    };

    const select = h('select', { id: 'cfg-cond' }, h('option', { value: '' }, '選べ'), ...shuffle(cond.options).map((o) => h('option', { value: o }, o)));
    const reveal = h('button', { class: 'ghost', type: 'button', id: 'cfg-reveal', hidden: true }, '答えを見る');
    const answerBox = h('div', { class: 'answer', hidden: true });
    let lastRecipe: Recipe | null = null;
    reveal.onclick = () => {
      if (!lastRecipe) return;
      w.mistakes.push({ machine: kind, recipe: lastRecipe.id, part: 'revealed', t: Date.now() });
      answerBox.replaceChildren(h('p', { class: 'eq' }, equation(lastRecipe)), h('p', { class: 'note' }, lastRecipe.note),
        h('p', { class: 'muted' }, '読んだら、何も見ずに自分で入力し直せ。'));
      answerBox.hidden = false;
      reveal.hidden = true;
    };

    const num = (id: string) => {
      const v = (document.getElementById(id) as HTMLInputElement | null)?.value.trim();
      return v ? parseInt(v, 10) : 1;
    };
    const f = h('form', { class: 'cfg' },
      h('section', {}, h('h3', {}, '原料'), h('p', { class: 'muted' }, 'この装置に流し込む物質を選べ。'), chips, reactRows),
      h('section', {}, h('h3', {}, isSep ? '取り出す物質' : '生成物'),
        h('p', { class: 'muted' }, isCell ? '陰極の生成物は正面、陽極の生成物は右手の出口から出る。' : '書いた順に、正面・右手・左手の出口から出る。'),
        prodRows, isCell ? null : more),
      h('section', {}, h('h3', {}, cond.label), select),
      feedback, answerBox,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', id: 'cfg-ok' }, 'この設定で動かす'), facing, reveal),
    );
    f.onsubmit = (ev) => {
      ev.preventDefault();
      if (picked.size === 0) { feedback.textContent = '原料を選べ。'; return; }
      const products: [string, number][] = [];
      for (let i = 0; i < prodRows.children.length; i++) {
        const v = (document.getElementById(`cfg-pf-${i}`) as HTMLInputElement).value.trim();
        if (v) products.push([v, num(`cfg-pc-${i}`)]);
      }
      const verdict = judge(kind, {
        reactants: [...picked].map((s) => [s, num(`cfg-rc-${s}`)] as [string, number]),
        products, condition: select.value,
      });
      if (verdict.ok) {
        const order = products.map(([p]) => verdict.recipe.outputs.find(([s]) => sub(s).formula === p.normalize('NFKC').replace(/\s+/g, ''))![0]);
        configure(e, verdict.recipe, order);
        render();
        return;
      }
      fails++;
      w.mistakes.push({ machine: kind, recipe: verdict.recipe?.id ?? null, part: verdict.part, t: Date.now() });
      feedback.textContent = verdict.message;
      lastRecipe = verdict.recipe;
      if (fails >= 2 && lastRecipe && answerBox.hidden) reveal.hidden = false;
    };
    return f;
  };

  render();
}
