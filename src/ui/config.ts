import { pretty } from '../chem/formula';
import { ELEMENTS } from '../content/elements';
import { MACHINES } from '../content/machines';
import { CONDITIONS, electronsOf, productsOf, recipeById, type MachineKind, type Recipe } from '../content/recipes';
import { label, sameAtoms, sub, subByFormula, SUBSTANCES } from '../content/substances';
import { clearRecipe, configure, judge, learn, portDir, type Ent, type Kind, type World } from '../engine/world';
import { h } from './dom';
import { sfx } from './sound';
import { elementIcon, tokenIcon } from './token';

const PORT_NAME = ['正面', '右手', '左手'];
const NAMED = SUBSTANCES.filter((s) => s.named);

export function equation(r: Recipe): string {
  const side = (s: [string, number][]) => s.map(([id, n]) => (r.loose || n === 1 ? '' : n) + label(id)).join(' + ');
  return `${side(r.inputs)} → ${side(productsOf(r))}`;
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
  const names: string[] = kind === 'electrolyzer' ? ['陰極', '陽極', 'ほか'] : kind === 'battery' ? ['e⁻', '生成物', '生成物']
    : kind === 'extractor' ? ['産出物'] : kind === 'depot' ? ['在庫'] : kind === 'splitter' ? ['出口', '出口', '出口']
    : kind === 'vent' || kind === 'belt' || kind === 'bridge' ? [] : PORT_NAME;
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

export interface SheetActions { close(): void; rotate(e: Ent): void; erase(e: Ent): void; toast(msg: string): void }

/** 物質の選択チップ */
export function chip(id: string, extra = ''): HTMLButtonElement {
  const b = h('button', { class: `chip ${extra}`, type: 'button' }, tokenIcon(id, 26), h('span', {}, label(id)));
  b.dataset.sub = id;
  return b;
}

/** 装置の設定シート。原料・生成物・係数・条件を自分で埋めさせる */
export function openConfig(sheet: HTMLElement, w: World, e: Ent, act: SheetActions) {
  const kind = e.kind as MachineKind;
  const cond = CONDITIONS[kind];
  const isCell = kind === 'electrolyzer', isSep = kind === 'separator', isBat = kind === 'battery';
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
        h('p', { class: 'eq' }, equation(r) + (isBat ? `　（e⁻ ${electronsOf(r)} mol）` : '')),
        h('div', { class: 'split' },
          h('div', { class: 'stack' },
            h('p', {}, h('b', {}, r.name)),
            h('p', { class: 'note' }, r.note),
            h('p', { class: 'muted' }, `${cond.label}：${r.accept.join(' または ')}` + (isBat ? `　負極 ${label(r.neg!)}　正極 ${label(r.pos!)}` : '')),
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
    /** 生成物の欄。化学式を打つか、名前で選ぶ */
    const prods: { coef: number; formula: string; id?: string }[] = [];
    let active = 0, condition = '', neg = '', pos = '', electrons = 1;
    let lastRecipe: Recipe | null = null;

    const reactRows = h('div', { class: 'rows' });
    const prodRows = h('div', { class: 'rows' });
    const poleBox = h('div', { class: 'rows' });
    const feedback = h('p', { class: 'feedback', id: 'cfg-feedback' });
    feedback.setAttribute('role', 'status');

    /** 係数は − と ＋ で決める。キーボードは出さない */
    const stepper = (id: string, get: () => number, set: (n: number) => void) => {
      const val = h('span', { class: 'val', id: `${id}-val` }, String(get()));
      const bump = (d: number) => { set(Math.min(20, Math.max(1, get() + d))); val.textContent = String(get()); sfx.tap(); };
      return h('span', { class: 'stepper' },
        h('button', { type: 'button', id: `${id}-minus`, ariaLabel: '減らす', onclick: () => bump(-1) }, '−'), val,
        h('button', { type: 'button', id: `${id}-plus`, ariaLabel: '増やす', onclick: () => bump(1) }, '＋'));
    };

    const paintPoles = () => {
      if (!isBat) return;
      const pick = (title: string, id: string, get: () => string, set: (s: string) => void) => h('div', { class: 'row' }, h('span', { class: 'tag wide' }, title),
        ...[...picked.keys()].map((s) => {
          const b = chip(s, get() === s ? 'on' : '');
          b.id = `${id}-${s}`;
          b.onclick = () => { set(s); paintPoles(); };
          return b;
        }));
      if (!picked.size) { poleBox.replaceChildren(h('p', { class: 'muted' }, '先に原料を選べ。')); return; }
      poleBox.replaceChildren(
        pick('負極（酸化される）', 'cfg-neg', () => neg, (s) => { neg = s; }),
        pick('正極（還元される）', 'cfg-pos', () => pos, (s) => { pos = s; }),
      );
    };

    const chips = h('div', { class: 'chips' }, ...w.discovered.filter((s) => s !== 'e').map((s) => {
      const b = chip(s);
      b.id = `cfg-chip-${s}`;
      b.onclick = () => {
        picked.has(s) ? picked.delete(s) : picked.set(s, 1);
        if (!picked.has(neg)) neg = '';
        if (!picked.has(pos)) pos = '';
        b.classList.toggle('on', picked.has(s));
        b.setAttribute('aria-pressed', String(picked.has(s)));
        reactRows.replaceChildren(...(isSep ? [] : [...picked.keys()].map((p) =>
          h('div', { class: 'row' }, stepper(`cfg-rc-${p}`, () => picked.get(p)!, (n) => picked.set(p, n)), h('span', { class: 'formula big' }, label(p))))));
        paintPoles();
      };
      return b;
    }));

    const slotName = (i: number) => (isCell ? ['陰極', '陽極', 'ほか'][i] : isBat ? ['右手', '左手'][i] : PORT_NAME[i]);
    const maxProds = isBat ? 2 : 3;
    const paintProds = () => {
      prodRows.replaceChildren(...prods.map((p, i) => {
        const text = p.id ? sub(p.id).name : p.formula ? pretty(p.formula) : '下のキーで化学式を入れる';
        const slot = h('button', { class: 'slot' + (i === active ? ' on' : '') + (p.formula || p.id ? '' : ' empty') + (p.id ? ' named' : ''), type: 'button', id: `cfg-slot-${i}` }, text);
        slot.onclick = () => { active = i; paintProds(); };
        return h('div', { class: 'row' }, h('span', { class: 'tag' }, slotName(i)),
          isSep ? null : stepper(`cfg-pc-${i}`, () => p.coef, (n) => { p.coef = n; }), slot);
      }));
      more.hidden = prods.length >= maxProds;
    };
    const more = h('button', { class: 'ghost', type: 'button', id: 'cfg-add' }, '＋ 生成物を追加');
    more.onclick = () => { prods.push({ coef: 1, formula: '' }); active = prods.length - 1; paintProds(); };
    for (let i = 0; i < (isCell ? 2 : 1); i++) prods.push({ coef: 1, formula: '' });

    // 化学式の専用キー。元素は多めに並べて、答えの手がかりにならないようにする
    const press = (k: string) => {
      const p = prods[active];
      p.id = undefined;
      if (k === '⌫') p.formula = p.formula.replace(/([A-Z][a-z]?|\d|\(|\))$/, '');
      else if (k === '消') p.formula = '';
      else if (p.formula.length < 24) p.formula += k;
      sfx.tap();
      paintProds();
    };
    const key = (k: string, cls = '') => h('button', { class: `key ${cls}`, type: 'button', id: `key-${k}`, onclick: () => press(k) }, k);
    const elKey = (sym: string) => h('button', { class: 'key el', type: 'button', id: `key-${sym}`, onclick: () => press(sym) }, elementIcon(sym, 16), h('span', {}, sym));
    const namedBox = h('div', { class: 'chips small' }, ...NAMED.map((s) => {
      const b = h('button', { class: 'chip plain', type: 'button', id: `name-${s.id}` }, s.name);
      b.onclick = () => { prods[active].id = s.id; prods[active].formula = ''; sfx.tap(); paintProds(); };
      return b;
    }));
    const keypad = h('div', { class: 'keypad' },
      h('div', { class: 'keys el' }, ...ELEMENTS.map((el) => elKey(el.sym))),
      h('div', { class: 'keys num' }, ...'23456789'.split('').map((k) => key(k, 'n')), key('1', 'n'), key('0', 'n'), key('(', 'n'), key(')', 'n'), key('⌫', 'fn'), key('消', 'fn')),
      isSep || kind === 'reactor' || isCell ? h('details', { class: 'named' }, h('summary', {}, '化学式で書けないもの（混合物・高分子）は名前で選ぶ'), namedBox) : null);

    const condChips = h('div', { class: 'chips' }, ...shuffle(cond.options).map((o) => {
      const b = h('button', { class: 'chip plain', type: 'button' }, o);
      b.dataset.cond = o;
      b.onclick = () => {
        condition = o;
        for (const c of condChips.children) { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', String(c === b)); }
        sfx.tap();
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

    const n = (isSep ? ['①', '②', '③'] : isBat ? ['①', '②', '③', '④', '⑤'] : ['①', '②', '③']);
    const f = h('form', { class: 'cfg' },
      h('section', {}, h('h3', {}, `${n[0]} 原料`), h('p', { class: 'muted' }, 'この装置に流し込む物質を選べ。' + (isSep ? '' : '選んだら係数を合わせろ。')), chips, reactRows),
      isBat ? h('section', {}, h('h3', {}, `${n[1]} 負極と正極`), poleBox) : null,
      h('section', {}, h('h3', {}, `${n[isBat ? 2 : 1]} ${isSep ? '取り出す物質' : '生成物'}`),
        h('p', { class: 'muted' }, isCell ? '各極で生じる物質を化学式で入れろ。溶液中にできるものがあれば追加しろ。' : isBat ? '電子のほかにできる物質を入れろ。' : '入れた順に、正面・右手・左手の出口から出る。'),
        prodRows, more, keypad),
      isBat ? h('section', {}, h('h3', {}, `${n[3]} 流れる電子 e⁻ の数`), h('div', { class: 'row' }, stepper('cfg-el', () => electrons, (x) => { electrons = x; }), h('span', { class: 'muted' }, '上の係数で反応したとき、導線を流れる電子は何 mol か。'))) : null,
      h('section', {}, h('h3', {}, `${n[isBat ? 4 : 2]} ${cond.label}`), condChips),
      feedback, answerBox,
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', id: 'cfg-ok' }, 'この設定で動かす'), reveal),
    );
    paintProds();
    paintPoles();
    f.onsubmit = (ev) => {
      ev.preventDefault();
      if (picked.size === 0) { feedback.textContent = '原料を選べ。'; return; }
      const filled = prods.filter((p) => p.formula || p.id);
      const products = filled.map((p) => [p.id ?? subByFormula(p.formula)?.id ?? null, p.coef] as [string | null, number]);
      const verdict = judge(kind, { reactants: [...picked], products, condition, neg, pos, electrons });
      if (verdict.ok) {
        configure(e, verdict.recipe, products.map(([p]) => p!));
        const gain = learn(w, verdict.recipe, fails === 0);
        sfx.ok();
        if (gain) act.toast(`${verdict.recipe.name}　研究点 +${gain}` + (fails === 0 ? '（一発正解）' : ''));
        render();
        return;
      }
      fails++;
      w.mistakes.push({ machine: kind, recipe: verdict.recipe?.id ?? null, part: verdict.part, t: Date.now() });
      // 分子式で書いた有機化合物は、どこが違うかを伝える
      const loose = verdict.part === 'products' && filled.some((p) => p.formula && !subByFormula(p.formula) && sameAtoms(p.formula));
      feedback.textContent = loose ? '原子の数は合っているが、書き方が違う。有機化合物は示性式（C₂H₅OH のように官能基がわかる形）で書け。' : verdict.message;
      feedback.classList.remove('shake');
      void feedback.offsetWidth;
      feedback.classList.add('shake');
      sfx.bad();
      lastRecipe = verdict.recipe;
      if (fails >= 2 && lastRecipe && answerBox.hidden) reveal.hidden = false;
    };
    return f;
  };

  render();
}
