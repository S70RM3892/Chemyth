import { makeMock, numOk, type Mock, type MockQ, type MockSource } from '../content/mock';
import { recipeById } from '../content/recipes';
import type { World } from '../engine/world';
import { h } from './dom';
import { numPad, typeNumber, type PanelCtx } from './panels';
import { sfx } from './sound';

/** 工場で動いている反応と台数。設定ずみの装置がなければ、これまでに正しく設定できた反応から選ぶ */
export function mockSources(w: World): MockSource[] {
  const count = new Map<string, number>();
  for (const e of w.ents.values()) if (e.recipe && !e.sealed && recipeById(e.recipe)) count.set(e.recipe, (count.get(e.recipe) || 0) + 1);
  if (count.size) return [...count].map(([id, n]) => ({ id, count: n }));
  return w.learned.filter((id) => recipeById(id)).slice(-6).map((id) => ({ id, count: 1 }));
}

/** 模試：自分の工場をリード文にした大問 1 題。全部に答えてから、まとめて採点する */
export function showMock(c: PanelCtx, mock?: Mock | null, started = Date.now()) {
  const { w } = c;
  const src = mockSources(w);
  const m = mock === undefined ? makeMock(src, (Date.now() % 100000) + 1) : mock;
  const close = h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる');
  if (!m || !m.qs.length) {
    c.show(h('header', {}, h('h2', {}, '模試'), close),
      h('p', {}, 'まだ出題できる反応がない。装置を置いて、反応を 1 つ設定しろ。自分の工場が、そのまま問題文になる。'));
    return;
  }
  const ans: string[] = m.qs.map(() => '');
  let active = m.qs.findIndex((q) => q.kind === 'num');
  const boxes = m.qs.map((q, i) => (q.kind === 'num'
    ? h('button', { class: 'slot numslot', type: 'button', id: `mock-a-${i}`, onclick: () => { active = i; paint(); } }, '')
    : h('div', { class: 'chips' }, ...q.choices!.map((x, k) => h('button', { class: 'chip plain', type: 'button', id: `mock-c-${i}-${k}`, onclick: () => { ans[i] = x; sfx.tap(); paint(); } }, x)))));
  const paint = () => m.qs.forEach((q, i) => {
    if (q.kind === 'num') { const el = boxes[i]; el.textContent = ans[i] || '数を入れる'; el.classList.toggle('on', i === active); el.classList.toggle('empty', !ans[i]); }
    else [...boxes[i].children].forEach((b) => b.classList.toggle('on', b.textContent === ans[i]));
  });
  paint();
  const pad = numPad((k) => { if (active >= 0) { ans[active] = typeNumber(ans[active], k); paint(); } });
  const grade = () => {
    const ok = m.qs.map((q, i) => (q.kind === 'num' ? ans[i] !== '' && numOk(q, parseFloat(ans[i])) : ans[i] === q.answer));
    const right = ok.filter(Boolean).length, gain = right * 3, sec = Math.round((Date.now() - started) / 1000);
    m.qs.forEach((q, i) => { if (!ok[i]) w.mistakes.push({ machine: 'quiz', recipe: q.recipe, part: 'quiz', t: Date.now() }); });
    w.points += gain;
    const rec = (w.practice.mock ??= { tries: 0, clean: 0 });
    rec.tries++; if (right === m.qs.length) rec.clean++;
    right === m.qs.length ? sfx.goal() : right ? sfx.ok() : sfx.bad();
    c.show(h('header', {}, h('h2', {}, '模試の結果'), close),
      h('p', { class: 'eq', id: 'mock-score' }, `${m.qs.length} 問中 ${right} 問正解　${Math.floor(sec / 60)} 分 ${sec % 60} 秒　研究点 +${gain}`),
      ...m.qs.map((q, i) => h('div', { class: 'mock-q ' + (ok[i] ? 'ok' : 'ng') },
        h('p', {}, h('b', {}, `問${i + 1}　${ok[i] ? '正解' : '不正解'}`), h('span', { class: 'pill' }, q.topic)),
        h('p', { class: 'qtext' }, q.text),
        h('p', {}, `あなたの答え：${ans[i] || '（無答）'}　／　正しくは ${q.answer}${q.unit ? ' ' + q.unit : ''}`),
        h('p', { class: 'note' }, q.how))),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'mock-again', onclick: () => showMock(c) }, '数値を変えて、もう 1 題')));
  };
  c.show(h('header', {}, h('h2', {}, '模試：自分の工場から'), close),
    h('p', { class: 'muted' }, '次の文は、いま自分の工場で動いている反応だ。全部に答えてから「採点する」を押せ。計算は紙に書け。数値は有効数字 2 桁が合えば正解。'),
    h('div', { class: 'answer', id: 'mock-lead' }, ...m.lead.map((x) => h('p', {}, x))),
    ...m.qs.map((q, i) => h('div', { class: 'mock-q' },
      h('p', {}, h('b', {}, `問${i + 1}`), h('span', { class: 'pill' }, q.topic)),
      h('p', { class: 'qtext' }, q.text),
      q.kind === 'num' ? h('div', { class: 'row' }, boxes[i], q.unit ? h('span', { class: 'formula big' }, q.unit) : null) : boxes[i])),
    pad,
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'mock-grade', onclick: grade }, '採点する')));
}
export type { MockQ };
