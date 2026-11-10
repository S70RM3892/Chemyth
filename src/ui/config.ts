import { MACHINES } from '../content/machines';
import { CONDITIONS, recipeById, type MachineKind, type Recipe } from '../content/recipes';
import { label, sub, subByFormula } from '../content/substances';
import { clearRecipe, configure, judge, portDir, type Ent, type Kind, type World } from '../engine/world';
import { h } from './dom';

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

/** 装置の説明ブロック */
export function about(kind: Exclude<Kind, 'hub'>): HTMLElement {
  const m = MACHINES[kind];
  return h('dl', { class: 'about' },
    h('dt', {}, '働き'), h('dd', {}, m.what),
    h('dt', {}, '入口と出口'), h('dd', {}, m.ports),
    m.exam ? h('dt', {}, '入試では') : null, m.exam ? h('dd', {}, m.exam) : null,
  );
}

/** 装置を上から見た図。どの側から何が出るかを示す */
export function diagram(e: Ent): HTMLElement {
  const kind = e.kind as Exclude<Kind, 'hub'>;
  const cells: (HTMLElement | null)[] = Array(9).fill(null);
  const cellOf = [5, 7, 3, 1]; // 右・下・左・上
  const names = kind === 'electrolyzer' ? ['陰極', '陽極'] : kind === 'extractor' ? ['産出物'] : kind === 'vent' || kind === 'belt' ? [] : PORT_NAME;
  const count = e.outOrder ? e.outOrder.length : names.length;
  for (let i = 0; i < count; i++) {
    const d = portDir(e.dir, i);
    const s = e.outOrder?.[i];
    const c = h('div', { class: 'port' }, h('span', { class: 'arrow' }, '→↓←↑'[d]), h('span', {}, s ? label(s) : names[i]));
    if (s) c.style.setProperty('--dot', sub(s).color);
    cells[cellOf[d]] = c;
  }
  const g = h('div', { class: 'diagram' });
  g.setAttribute('aria-label', '出口の向き');
  for (let i = 0; i < 9; i++) {
    if (i === 4) { const c = h('div', { class: 'core' }, MACHINES[kind].glyph); c.style.background = MACHINES[kind].color; g.append(c); }
    else g.append(cells[i] ?? h('div', {}));
  }
  return g;
}

export interface SheetActions { close(): void; rotate(e: Ent): void; erase(e: Ent): void }

/** 装置の設定シート。原料・生成物・係数・条件を自分で埋めさせる */
export function openConfig(sheet: HTMLElement, w: World, e: Ent, act: SheetActions) {
  const kind = e.kind as MachineKind;
  const cond = CONDITIONS[kind];
  const isCell = kind === 'electrolyzer';
  const isSep = kind === 'separator';
  let fails = 0;

  const side = () => {
    const box = h('div', { class: 'side' });
    const paint = () => box.replaceChildren(
      diagram(e),
      h('button', { class: 'ghost', type: 'button', id: 'cfg-rotate', onclick: () => { act.rotate(e); paint(); } }, '↻ 向きを変える'),
      h('button', { class: 'ghost warn', type: 'button', id: 'cfg-erase', onclick: () => { act.erase(e); act.close(); } }, '✕ この装置を消す'),
    );
    paint();
    return box;
  };

  const render = () => {
    sheet.replaceChildren();
    const r = recipeById(e.recipe);
    sheet.append(h('header', {}, h('h2', {}, MACHINES[kind].name), h('button', { class: 'ghost', type: 'button', id: 'cfg-close', onclick: act.close }, '閉じる')));
    if (r) {
      sheet.append(
        h('p', { class: 'eq' }, equation(r)),
        h('div', { class: 'split' },
          h('div', { class: 'stack' },
            h('p', {}, h('b', {}, r.name)),
            h('p', { class: 'note' }, r.note),
            h('p', { class: 'muted' }, `条件：${cond.label}＝${r.accept.join(' または ')}`),
            h('button', { class: 'ghost', type: 'button', id: 'cfg-redo', onclick: () => { clearRecipe(e); render(); } }, '設定をやり直す'),
          ),
          side(),
        ),
      );
      return;
    }
    sheet.append(h('div', { class: 'split' }, about(kind), side()), form());
  };

  const form = () => {
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
        reactRows.replaceChildren(...(isSep ? [] : [...picked].map((p) =>
          h('div', { class: 'row' }, coef(`cfg-rc-${p}`), h('span', { class: 'formula' }, label(p))))));
      };
      return b;
    }));
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
      h('section', {}, h('h3', {}, '① 原料'), h('p', { class: 'muted' }, 'この装置に流し込む物質を選べ。' + (isSep ? '' : '係数が 1 のときは空欄でよい。')), chips, reactRows),
      h('section', {}, h('h3', {}, isSep ? '② 取り出す物質' : '② 生成物'),
        h('p', { class: 'muted' }, isCell ? '各極で生じる物質を化学式で書け。' : '化学式で書け。書いた順に、正面・右手・左手の出口から出る。'),
        prodRows, isCell ? null : more),
      h('section', {}, h('h3', {}, `③ ${cond.label}`), select),
      feedback, answerBox,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', id: 'cfg-ok' }, 'この設定で動かす'), reveal),
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
        configure(e, verdict.recipe, products.map(([p]) => subByFormula(p)!.id));
        // 上流がまだ動いていなくても、下流の装置で原料として選べるようにする
        for (const [s] of verdict.recipe.outputs) if (!w.discovered.includes(s)) w.discovered.push(s);
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
