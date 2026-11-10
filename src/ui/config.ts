import { MACHINES } from '../content/machines';
import { CONDITIONS, recipeById, type MachineKind, type Recipe } from '../content/recipes';
import { label, sub, subByFormula } from '../content/substances';
import { clearRecipe, configure, judge, portDir, type Ent, type Kind, type World } from '../engine/world';
import { pretty } from '../chem/formula';
import { h } from './dom';

const ELEMENTS = ['H', 'C', 'N', 'O', 'F', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'K', 'Ca', 'Mn', 'Fe', 'Cu', 'Zn', 'Ag', 'Br', 'I', 'Ba', 'Pb', 'Cr'];

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
    const picked = new Map<string, number>();
    const prods: { coef: number; formula: string }[] = [];
    let active = 0;
    let condition = '';
    let lastRecipe: Recipe | null = null;

    const reactRows = h('div', { class: 'rows' });
    const prodRows = h('div', { class: 'rows' });
    const feedback = h('p', { class: 'feedback', id: 'cfg-feedback' });
    feedback.setAttribute('role', 'status');

    /** 係数は − と ＋ で決める。キーボードは出さない */
    const stepper = (id: string, get: () => number, set: (n: number) => void) => {
      const val = h('span', { class: 'val', id: `${id}-val` }, String(get()));
      const bump = (d: number) => { set(Math.min(20, Math.max(1, get() + d))); val.textContent = String(get()); };
      return h('span', { class: 'stepper' },
        h('button', { type: 'button', id: `${id}-minus`, ariaLabel: '係数を減らす', onclick: () => bump(-1) }, '−'), val,
        h('button', { type: 'button', id: `${id}-plus`, ariaLabel: '係数を増やす', onclick: () => bump(1) }, '＋'));
    };

    const chips = h('div', { class: 'chips' }, ...w.discovered.map((s) => {
      const b = h('button', { class: 'chip', type: 'button', id: `cfg-chip-${s}` }, label(s));
      b.style.setProperty('--dot', sub(s).color);
      b.onclick = () => {
        picked.has(s) ? picked.delete(s) : picked.set(s, 1);
        b.classList.toggle('on', picked.has(s));
        b.setAttribute('aria-pressed', String(picked.has(s)));
        reactRows.replaceChildren(...(isSep ? [] : [...picked.keys()].map((p) =>
          h('div', { class: 'row' }, stepper(`cfg-rc-${p}`, () => picked.get(p)!, (n) => picked.set(p, n)), h('span', { class: 'formula big' }, label(p))))));
      };
      return b;
    }));

    const slotName = (i: number) => (isCell ? ['陰極', '陽極'][i] : PORT_NAME[i]);
    const paintProds = () => {
      prodRows.replaceChildren(...prods.map((p, i) => {
        const slot = h('button', { class: 'slot' + (i === active ? ' on' : '') + (p.formula ? '' : ' empty'), type: 'button', id: `cfg-slot-${i}` }, p.formula ? pretty(p.formula) : '下のキーで化学式を入れる');
        slot.onclick = () => { active = i; paintProds(); };
        return h('div', { class: 'row' }, h('span', { class: 'tag' }, slotName(i)),
          isSep ? null : stepper(`cfg-pc-${i}`, () => p.coef, (n) => { p.coef = n; }), slot);
      }));
      more.hidden = isCell || prods.length >= 3;
    };
    const more = h('button', { class: 'ghost', type: 'button', id: 'cfg-add' }, '＋ 生成物を追加');
    more.onclick = () => { prods.push({ coef: 1, formula: '' }); active = prods.length - 1; paintProds(); };
    for (let i = 0; i < (isCell ? 2 : 1); i++) prods.push({ coef: 1, formula: '' });

    // 化学式の専用キー。元素は多めに並べて、答えの手がかりにならないようにする
    const press = (k: string) => {
      const p = prods[active];
      if (k === '⌫') p.formula = p.formula.replace(/([A-Z][a-z]?|\d|\(|\))$/, '');
      else if (k === '消') p.formula = '';
      else if (p.formula.length < 14) p.formula += k;
      paintProds();
    };
    const key = (k: string, cls = '') => h('button', { class: `key ${cls}`, type: 'button', id: `key-${k}`, onclick: () => press(k) }, k);
    const keypad = h('div', { class: 'keypad' },
      h('div', { class: 'keys el' }, ...ELEMENTS.map((k) => key(k))),
      h('div', { class: 'keys num' }, ...'23456789'.split('').map((k) => key(k, 'n')), key('1', 'n'), key('0', 'n'), key('(', 'n'), key(')', 'n'), key('⌫', 'fn'), key('消', 'fn')));

    const condChips = h('div', { class: 'chips' }, ...shuffle(cond.options).map((o) => {
      const b = h('button', { class: 'chip plain', type: 'button' }, o);
      b.dataset.cond = o;
      b.onclick = () => {
        condition = o;
        for (const c of condChips.children) { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', String(c === b)); }
      };
      return b;
    }));

    const reveal = h('button', { class: 'ghost', type: 'button', id: 'cfg-reveal', hidden: true }, '答えを見る');
    const answerBox = h('div', { class: 'answer', hidden: true });
    reveal.onclick = () => {
      if (!lastRecipe) return;
      w.mistakes.push({ machine: kind, recipe: lastRecipe.id, part: 'revealed', t: Date.now() });
      answerBox.replaceChildren(h('p', { class: 'eq' }, equation(lastRecipe)), h('p', { class: 'note' }, lastRecipe.note),
        h('p', { class: 'muted' }, '読んだら、何も見ずに自分で入力し直せ。'));
      answerBox.hidden = false;
      reveal.hidden = true;
    };

    const f = h('form', { class: 'cfg' },
      h('section', {}, h('h3', {}, '① 原料'), h('p', { class: 'muted' }, 'この装置に流し込む物質を選べ。' + (isSep ? '' : '選んだら係数を合わせろ。')), chips, reactRows),
      h('section', {}, h('h3', {}, isSep ? '② 取り出す物質' : '② 生成物'),
        h('p', { class: 'muted' }, isCell ? '各極で生じる物質を化学式で入れろ。' : '入れた順に、正面・右手・左手の出口から出る。'),
        prodRows, more, keypad),
      h('section', {}, h('h3', {}, `③ ${cond.label}`), condChips),
      feedback, answerBox,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', id: 'cfg-ok' }, 'この設定で動かす'), reveal),
    );
    paintProds();
    f.onsubmit = (ev) => {
      ev.preventDefault();
      if (picked.size === 0) { feedback.textContent = '原料を選べ。'; return; }
      const products = prods.filter((p) => p.formula).map((p) => [p.formula, p.coef] as [string, number]);
      const verdict = judge(kind, { reactants: [...picked], products, condition });
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
      feedback.classList.remove('shake');
      void feedback.offsetWidth;
      feedback.classList.add('shake');
      lastRecipe = verdict.recipe;
      if (fails >= 2 && lastRecipe && answerBox.hidden) reveal.hidden = false;
    };
    return f;
  };

  render();
}
