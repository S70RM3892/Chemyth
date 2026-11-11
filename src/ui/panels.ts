import { ELEMENTS } from '../content/elements';
import { MACHINES } from '../content/machines';
import { CONDITIONS, electronsOf, recipeById, RECIPES } from '../content/recipes';
import { isCorrect, QUESTIONS, type Question } from '../content/questions';
import { label, sub } from '../content/substances';
import { UPGRADE_COST, beltSpeed, extractInterval, machineRate, type Ent, type UpgradeKey, type World } from '../engine/world';
import { chip, equation } from './config';
import { h } from './dom';
import { sfx } from './sound';
import { elementIcon, tokenIcon } from './token';

type Show = (...nodes: (Node | string | null)[]) => void;
export interface PanelCtx { w: World; show: Show; close(): void; toast(msg: string, ms?: number): void }

const closeBtn = (c: PanelCtx) => h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる');

// ---------------- 強化 ----------------

const TRACKS: { key: UpgradeKey; name: string; what: string; now(w: World): string }[] = [
  { key: 'extract', name: '採取機・搬出口', what: '産出の間隔が短くなる', now: (w) => `1 個あたり ${extractInterval(w).toFixed(2)} 秒` },
  { key: 'belt', name: 'ベルト', what: '運ぶ速さが上がる', now: (w) => `毎秒 ${beltSpeed(w).toFixed(1)} マス` },
  { key: 'machine', name: '装置', what: '蒸留塔・反応器・電解槽・電池の処理が速くなる', now: (w) => `処理速度 ${machineRate(w).toFixed(1)} 倍` },
];

export function showUpgrades(c: PanelCtx) {
  const { w } = c;
  c.show(
    h('header', {}, h('h2', {}, '強化'), closeBtn(c)),
    h('p', {}, '研究点 ', h('b', { class: 'points' }, String(w.points)), ' 点。強化するには、研究点を払ったうえで計算問題を 1 問解く。'),
    h('p', { class: 'muted' }, '研究点は、指令の物質の納品（1 個 1 点、達成で 30 点）と、反応を初めて正しく設定したとき（一発なら 15 点、それ以外は 8 点）にもらえる。'),
    h('div', { class: 'tracks' }, ...TRACKS.map((t) => {
      const lv = w.up[t.key], cost = UPGRADE_COST[lv];
      const btn = cost === undefined
        ? h('button', { class: 'ghost', type: 'button', disabled: true }, '最大')
        : h('button', { class: 'primary', type: 'button', id: `up-${t.key}`, disabled: w.points < cost, onclick: () => askQuestion(c, t.key) }, `${cost} 点で強化`);
      return h('div', { class: 'track-row' },
        h('div', { class: 'stack' }, h('b', {}, t.name), h('span', { class: 'muted' }, `${t.what}。いま：${t.now(w)}`),
          h('span', { class: 'pips' }, ...UPGRADE_COST.map((_, i) => h('i', { class: i < lv ? 'on' : '' })))),
        btn);
    })),
  );
}

function pickQuestion(w: World): Question {
  const fresh = QUESTIONS.filter((q) => !w.solved.includes(q.id));
  const pool = fresh.length ? fresh : QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function askQuestion(c: PanelCtx, key: UpgradeKey, q = pickQuestion(c.w)) {
  const { w } = c;
  let text = '';
  const display = h('div', { class: 'slot on numslot', id: 'q-display' }, '');
  const feedback = h('div', { class: 'answer', hidden: true });
  const paint = () => { display.textContent = text || '答えを入れる'; display.classList.toggle('empty', !text); };
  const press = (k: string) => {
    if (k === '⌫') text = text.slice(0, -1);
    else if (k === '−') text = text.startsWith('-') ? text.slice(1) : '-' + text;
    else if (k === '.') { if (!text.includes('.')) text += text === '' || text === '-' ? '0.' : '.'; }
    else if (text.replace(/[-.]/g, '').length < 8) text += k;
    sfx.tap();
    paint();
  };
  const keys = h('div', { class: 'keys numpad' }, ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '.'].map((k) =>
    h('button', { class: 'key n', type: 'button', id: `num-${k}`, onclick: () => press(k) }, k)),
    h('button', { class: 'key fn', type: 'button', id: 'num-del', onclick: () => press('⌫') }, '⌫'));
  const submit = h('button', { class: 'primary', type: 'button', id: 'q-ok' }, '答える');
  submit.onclick = () => {
    const x = parseFloat(text);
    if (Number.isNaN(x)) return;
    if (isCorrect(q, x)) {
      const cost = UPGRADE_COST[w.up[key]];
      w.points -= cost;
      w.up[key]++;
      if (!w.solved.includes(q.id)) w.solved.push(q.id);
      sfx.goal();
      c.toast('正解。強化した。', 2600);
      showUpgrades(c);
      return;
    }
    w.mistakes.push({ machine: 'calc', recipe: q.id, part: 'calc', t: Date.now() });
    sfx.bad();
    feedback.replaceChildren(
      h('p', {}, h('b', {}, '不正解。'), `正しくは ${q.answer} ${q.unit}`),
      h('p', { class: 'note' }, q.how),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'q-next', onclick: () => askQuestion(c, key) }, '別の問題に挑戦する')),
    );
    feedback.hidden = false;
    submit.hidden = true;
    keys.hidden = true;
  };
  paint();
  c.show(
    h('header', {}, h('h2', {}, '計算問題'), h('button', { class: 'ghost', type: 'button', id: 'q-back', onclick: () => showUpgrades(c) }, '戻る')),
    h('p', {}, h('span', { class: 'pill' }, q.topic)),
    h('p', { class: 'qtext' }, q.text),
    h('div', { class: 'row' }, display, h('span', { class: 'formula big' }, q.unit)),
    h('p', { class: 'muted' }, '有効数字 2 桁が合っていれば正解。紙に書いて計算しろ。研究点は正解したときだけ引かれる。'),
    keys, feedback,
    h('div', { class: 'row' }, submit),
  );
}

// ---------------- 図鑑 ----------------

export function showBook(c: PanelCtx, tab: 'el' | 'sub' | 'rx' = 'el') {
  const { w } = c;
  const tabs = h('div', { class: 'tabs' }, ...([['el', '元素の形'], ['sub', '物質'], ['rx', '反応']] as const).map(([id, name]) =>
    h('button', { class: 'chip plain' + (id === tab ? ' on' : ''), type: 'button', id: `book-${id}`, onclick: () => showBook(c, id) }, name)));
  let body: HTMLElement;
  if (tab === 'el') {
    body = h('div', { class: 'grid' }, ...ELEMENTS.map((el) => h('div', { class: 'card' }, elementIcon(el.sym, 34),
      h('div', { class: 'stack tight' }, h('b', {}, `${el.sym}　${el.name}`), h('span', { class: 'muted' }, el.why)))));
  } else if (tab === 'sub') {
    const seen = w.discovered.filter((s) => s !== 'e');
    const st = { gas: '気体', liquid: '液体', solid: '固体' } as const;
    body = h('div', { class: 'grid' }, ...seen.map((id) => { const s = sub(id); return h('div', { class: 'card' }, tokenIcon(id, 38),
      h('div', { class: 'stack tight' }, h('b', { class: s.formula ? 'formula' : '' }, label(id)), h('span', { class: 'muted' }, `${s.name}・${s.formula ? st[s.state] : '混合物など'}`))); }));
  } else {
    const done = RECIPES.filter((r) => w.learned.includes(r.id));
    body = done.length ? h('div', { class: 'rxlist' }, ...done.map((r) => h('details', { class: 'rx' },
      h('summary', {}, h('b', {}, r.name), h('span', { class: 'formula' }, equation(r) + (r.machine === 'battery' ? `（e⁻ ${electronsOf(r)}）` : ''))),
      h('p', { class: 'muted' }, `${MACHINES[r.machine].name}　${CONDITIONS[r.machine].label}：${r.accept.join(' または ')}`),
      h('p', { class: 'note' }, r.note), h('p', { class: 'muted' }, r.source))))
      : h('p', { class: 'muted' }, 'まだ正しく設定できた反応がない。');
  }
  c.show(h('header', {}, h('h2', {}, '図鑑'), closeBtn(c)), tabs,
    tab === 'el' ? h('p', { class: 'muted' }, '物質の絵柄は、元素の形の組み合わせでできている。原子が多い物質は、元素ごとに 1 つの形と個数で表す。台の形は常温での状態（丸＝気体、しずく＝液体、角丸の四角＝固体）で、破線は混合物や高分子。')
      : tab === 'sub' ? h('p', { class: 'muted' }, `これまでに出会った物質：${w.discovered.length - (w.discovered.includes('e') ? 1 : 0)} 種類。`)
      : h('p', { class: 'muted' }, `正しく設定できた反応：${w.learned.length} / ${RECIPES.length}。タップすると解説が開く。`),
    body);
}

// ---------------- 搬出口 ----------------

export function showDepot(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const { w } = c;
  const items = Object.entries(w.stock).filter(([s, n]) => n > 0 && s !== 'e').sort((a, b) => b[1] - a[1]);
  const box = h('div', { class: 'chips' }, ...items.map(([s, n]) => {
    const b = chip(s, e.sub === s ? 'on' : '');
    b.id = `depot-${s}`;
    b.append(h('span', { class: 'muted' }, `×${n}`));
    b.onclick = () => { e.sub = s; sfx.ok(); c.close(); };
    return b;
  }));
  c.show(h('header', {}, h('h2', {}, '搬出口'), closeBtn(c)),
    h('p', {}, e.sub ? `いま取り出している物質：${label(e.sub)}（在庫 ${w.stock[e.sub] || 0}）` : '取り出す物質を選べ。'),
    items.length ? box : h('p', { class: 'muted' }, '納品所の在庫がまだない。納品所へ運んだ物質は、指令と関係なくすべて在庫になる。'),
    extra);
}

// ---------------- 記録 ----------------

export function showLog(c: PanelCtx) {
  const { w } = c;
  const PART: Record<string, string> = { reactants: '原料の組み合わせ', products: '生成物', electrodes: '電極', coefficients: '係数', electrons: '電子の数', revealed: '答えを見た', calc: '計算問題' };
  const tally = new Map<string, number>();
  for (const m of w.mistakes) {
    const name = m.machine === 'calc' ? QUESTIONS.find((q) => q.id === m.recipe)?.topic ?? '計算' : m.recipe ? recipeById(m.recipe)?.name ?? m.recipe : MACHINES[m.machine].name;
    const part = m.part === 'condition' && m.machine !== 'calc' ? CONDITIONS[m.machine].label : PART[m.part];
    const k = `${name}｜${part}`;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  const rows = [...tally].sort((a, b) => b[1] - a[1]);
  const delivered = Object.entries(w.delivered).sort((a, b) => b[1] - a[1]);
  c.show(
    h('header', {}, h('h2', {}, '記録'), closeBtn(c)),
    h('h3', {}, '間違えたところ（多い順）'),
    rows.length
      ? h('table', { class: 'log' }, ...rows.map(([k, n]) => { const [a, b] = k.split('｜'); return h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', { class: 'n' }, `${n}回`)); }))
      : h('p', { class: 'muted' }, 'まだ間違いはない。'),
    h('p', { class: 'muted' }, '回数の多いものから、反応式と条件を紙に書いて確認しろ。図鑑の「反応」に解説がある。'),
    h('h3', {}, 'これまでの納品'),
    delivered.length ? h('div', { class: 'chips' }, ...delivered.map(([s, n]) => { const b = chip(s); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${n}`)); return b; })) : h('p', { class: 'muted' }, '—'),
  );
}
