import { DRILLS, checkStep, mulberry32, type Drill, type DrillGen } from '../content/drills';
import { pretty } from '../chem/formula';
import { specText, type Isomer } from '../chem/isomers';
import { AMINOS, makePeptide } from '../content/peptide';
import { makeCount, makeIdentify, type CountProblem, type IdentifyProblem } from '../content/structure';
import { SYLLABUS } from '../content/syllabus';
import type { World } from '../engine/world';
import { h } from './dom';
import { numPad, typeNumber, type PanelCtx } from './panels';
import { sfx } from './sound';

/** 演習の成績をつける。clean は、最初の答えで全問正解したとき */
function record(w: World, id: string, clean: boolean) {
  const p = (w.practice[id] ??= { tries: 0, clean: 0 });
  p.tries++;
  if (clean) p.clean++;
}
const seed = () => (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
const back = (id: string, text: string, go: () => void) => h('button', { class: 'ghost', type: 'button', id, onclick: go }, text);
const LEVEL = ['', '基本', '標準', '発展'];

// ---------------- 連鎖計算 ----------------

/** 京大形式の大問：1 つの設定から、前の答えを使って次を解いていく。数値は開くたびに変わる */
export function showDrills(c: PanelCtx) {
  const { w } = c;
  const unitName = (id: string) => SYLLABUS.find((u) => u.id === id)?.title ?? '';
  const row = (g: DrillGen) => {
    const st = w.practice[g.id];
    return h('button', { class: 'ghost drill', type: 'button', id: `drill-${g.id}`, onclick: () => runDrill(c, g) },
      h('span', { class: 'drill-t' }, g.title),
      h('span', { class: 'muted' }, `${unitName(g.unit)}・${LEVEL[g.level]}`),
      h('span', { class: 'drill-n' + (st?.clean ? ' ok' : '') }, st ? `全問正解 ${st.clean} / ${st.tries} 回` : '未挑戦'));
  };
  const done = DRILLS.filter((g) => w.practice[g.id]?.clean).length;
  c.show(
    h('header', {}, h('h2', {}, '連鎖計算'), back('sheet-close', '閉じる', c.close)),
    h('p', {}, '京大の理論の大問と同じ形。1 つの設定から、前の答えを使って次を求めていく。数値は開くたびに変わるので、型が身につくまで繰り返せ。'),
    h('p', { class: 'muted' }, `全問正解したことのある型：${done} / ${DRILLS.length}。紙と鉛筆を用意しろ。途中の値は有効数字 3 桁で持ち回れ。`),
    ...[1, 2, 3].flatMap((lv) => {
      const gs = DRILLS.filter((g) => g.level === lv);
      return gs.length ? [h('h3', {}, LEVEL[lv]), h('div', { class: 'menu' }, ...gs.map(row))] : [];
    }),
  );
}

function runDrill(c: PanelCtx, g: DrillGen) {
  const { w } = c;
  const d: Drill = g.make(mulberry32(seed()));
  let right = 0;
  const body = h('div', { class: 'rxlist' });
  const ask = (i: number) => {
    if (i >= d.steps.length) {
      const clean = right === d.steps.length;
      record(w, g.id, clean);
      const gain = right * 3 + (clean ? 10 : 0);
      w.points += gain;
      clean ? sfx.goal() : sfx.ok();
      if (clean) c.actions.stamp('全問正解');
      body.append(h('div', { class: 'answer' },
        h('p', { class: 'qtext' }, `${d.steps.length} 問中 ${right} 問正解。研究点 +${gain}。`),
        h('p', { class: 'muted' }, clean ? '同じ型を、数値を変えてもう一度解け。3 回続けて全問正解できれば身についている。' : '間違えた設問の考え方を紙に書き写してから、もう一度解け。'),
        h('div', { class: 'row' },
          h('button', { class: 'primary', type: 'button', id: 'drill-again', onclick: () => runDrill(c, g) }, '数値を変えてもう一度'),
          back('drill-list', '一覧へ', () => showDrills(c)))));
      c.sheet.scrollTop = c.sheet.scrollHeight;
      return;
    }
    const s = d.steps[i];
    let text = '';
    const display = h('div', { class: 'slot on numslot', id: `drill-display-${i}` }, '');
    const paint = () => { display.textContent = text || '答えを入れる'; display.classList.toggle('empty', !text); };
    const keys = numPad((k) => { text = typeNumber(text, k); sfx.tap(); paint(); });
    const ok = h('button', { class: 'primary', type: 'button', id: `drill-ok-${i}` }, '答える');
    const fb = h('div', { class: 'answer', hidden: true });
    const box = h('section', { class: 'drill-step', id: `drill-step-${i}` },
      h('p', { class: 'qtext' }, h('b', {}, `(${i + 1}) `), s.text),
      h('div', { class: 'row' }, display, h('span', { class: 'formula' }, s.unit)), keys, h('div', { class: 'row' }, ok), fb);
    ok.onclick = () => {
      const x = parseFloat(text);
      if (Number.isNaN(x)) return;
      const good = checkStep(s, x);
      if (good) { right++; sfx.ok(); } else { sfx.bad(); w.mistakes.push({ machine: 'drill', recipe: g.title, part: 'calc', t: Date.now() }); }
      fb.replaceChildren(h('p', {}, h('b', {}, good ? '正解。' : '不正解。'), `答えは ${fmt(s.answer)} ${s.unit}`), h('p', { class: 'note' }, s.how));
      fb.hidden = false;
      keys.hidden = true; ok.hidden = true;
      display.classList.remove('on');
      ask(i + 1);
    };
    paint();
    body.append(box);
    if (i > 0) box.scrollIntoView({ block: 'nearest' });
  };
  c.show(
    h('header', {}, h('h2', {}, d.title), back('drill-back', '一覧へ', () => showDrills(c))),
    h('p', { class: 'passage' }, d.intro),
    body,
  );
  ask(0);
}

/** 答えの表示：有効数字 3 桁 */
function fmt(x: number): string {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1000 || a < 0.001) return x.toExponential(2).replace(/e\+?(-?\d+)/, '×10^$1');
  return String(Number(x.toPrecision(3)));
}

// ---------------- 構造決定 ----------------

/** 初見の分子式から、異性体を数え上げる・実験事実から 1 つに絞る */
export function showStructure(c: PanelCtx) {
  const { w } = c;
  const cell = (kind: 'count' | 'id', lv: 1 | 2 | 3) => {
    const id = `iso-${kind}-${lv}`, st = w.practice[id];
    return h('button', { class: 'ghost drill', type: 'button', id, onclick: () => (kind === 'count' ? runCount(c, lv) : runIdentify(c, lv)) },
      h('span', { class: 'drill-t' }, `${kind === 'count' ? '数え上げ' : '構造の特定'}　${LEVEL[lv]}`),
      h('span', { class: 'muted' }, ['', 'C₃〜C₄ の脂肪族', 'C₅ とエステル', '芳香族を含む'][lv]),
      h('span', { class: 'drill-n' + (st?.clean ? ' ok' : '') }, st ? `正解 ${st.clean} / ${st.tries} 回` : '未挑戦'));
  };
  c.show(
    h('header', {}, h('h2', {}, '構造決定'), back('sheet-close', '閉じる', c.close)),
    h('p', {}, '京大の有機と天然高分子の大問は、初めて見る分子式や配列から構造を決める。ここでは、考えられる異性体や配列をその場で全部作り出して出題する。数え上げと特定は、答えがただ 1 つに決まることを機械的に確かめてある。'),
    h('p', { class: 'muted' }, '紙に構造式を書き出してから答えろ。頭の中だけで数えると必ず落とす。'),
    h('h3', {}, '異性体を数え上げる'), h('div', { class: 'menu' }, ...([1, 2, 3] as const).map((lv) => cell('count', lv))),
    h('h3', {}, '実験事実から 1 つに決める'), h('div', { class: 'menu' }, ...([1, 2, 3] as const).map((lv) => cell('id', lv))),
    h('h3', {}, 'ペプチドの配列を決める'), h('div', { class: 'menu' }, ...([1, 2, 3] as const).map((lv) => {
      const id = `pep-${lv}`, st = w.practice[id];
      return h('button', { class: 'ghost drill', type: 'button', id, onclick: () => runPeptide(c, lv) },
        h('span', { class: 'drill-t' }, `配列決定　${LEVEL[lv]}`),
        h('span', { class: 'muted' }, ['', 'トリペプチド', 'テトラペプチド', 'ペンタペプチド'][lv]),
        h('span', { class: 'drill-n' + (st?.clean ? ' ok' : '') }, st ? `正解 ${st.clean} / ${st.tries} 回` : '未挑戦'));
    })),
  );
}

/** ペプチドの配列決定：酵素による切断と呈色反応から、N 末端からの並びを決める */
function runPeptide(c: PanelCtx, lv: 1 | 2 | 3) {
  const { w } = c;
  const q = makePeptide(mulberry32(seed()), lv);
  const name = (id: string) => AMINOS.find((a) => a.id === id)!.name;
  const seq: number[] = []; // parts の添字を、選んだ順に
  const line = h('div', { class: 'pep-line', id: 'pep-line' });
  const chips = h('div', { class: 'chips' });
  const ok = h('button', { class: 'primary', type: 'button', id: 'pep-ok' }, '答える');
  const fb = h('div', { class: 'answer', hidden: true });
  let done = false;
  const paint = () => {
    line.replaceChildren(h('span', { class: 'tag' }, 'N 末端'),
      ...q.parts.map((_, i) => h('span', { class: 'slot' + (seq[i] === undefined ? ' empty' : '') }, seq[i] === undefined ? '？' : name(q.parts[seq[i]]))),
      h('span', { class: 'tag' }, 'C 末端'));
    chips.replaceChildren(...q.parts.map((id, i) => {
      const b = h('button', { class: 'chip plain', type: 'button', id: `pep-a-${i}`, disabled: done || seq.includes(i) }, name(id));
      b.onclick = () => { seq.push(i); sfx.tap(); paint(); };
      return b;
    }), h('button', { class: 'chip plain', type: 'button', id: 'pep-del', disabled: done || !seq.length, onclick: () => { seq.pop(); sfx.tap(); paint(); } }, '⌫ 1 つ戻す'));
    ok.disabled = seq.length !== q.parts.length;
  };
  ok.onclick = () => {
    const good = seq.map((i) => q.parts[i]).join('-') === q.answer.join('-');
    done = true;
    record(w, `pep-${lv}`, good);
    if (good) { w.points += 8 + lv * 2; sfx.ok(); c.actions.stamp('正解'); } else { sfx.bad(); w.mistakes.push({ machine: 'structure', recipe: 'ペプチドの配列', part: 'calc', t: Date.now() }); }
    fb.replaceChildren(
      h('p', {}, h('b', {}, good ? `正解。研究点 +${8 + lv * 2}。` : '不正解。'), `答えは ${q.answer.map(name).join(' – ')}。`),
      h('p', { class: 'note' }, q.how),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'pep-next', onclick: () => runPeptide(c, lv) }, '次の問題'), back('iso-list', '一覧へ', () => showStructure(c))));
    fb.hidden = false;
    ok.hidden = true;
    paint();
    c.sheet.scrollTop = c.sheet.scrollHeight;
  };
  paint();
  c.show(
    h('header', {}, h('h2', {}, 'ペプチドの配列決定'), back('iso-back', '一覧へ', () => showStructure(c))),
    h('p', { class: 'qtext' }, q.text),
    h('ol', { class: 'clues' }, ...q.clues.map((t) => h('li', {}, t.text))),
    h('p', { class: 'muted' }, 'アミノ酸を、N 末端から順にタップして並べろ。'),
    line, chips, h('div', { class: 'row' }, ok), fb,
  );
}

const isoChip = (i: Isomer, extra = '') => h('span', { class: `iso ${extra}` }, h('span', { class: 'formula' }, pretty(i.formula)), i.name ? h('span', { class: 'muted' }, i.name) : null);

function runCount(c: PanelCtx, lv: 1 | 2 | 3) {
  const { w } = c;
  const q: CountProblem = makeCount(mulberry32(seed()), lv);
  let text = '';
  const display = h('div', { class: 'slot on numslot', id: 'iso-display' }, '');
  const paint = () => { display.textContent = text || '答えを入れる'; display.classList.toggle('empty', !text); };
  const keys = numPad((k) => { if (k !== '.' && k !== '−') { text = typeNumber(text, k); sfx.tap(); paint(); } });
  const ok = h('button', { class: 'primary', type: 'button', id: 'iso-ok' }, '答える');
  const fb = h('div', { class: 'answer', hidden: true });
  ok.onclick = () => {
    const x = parseInt(text, 10);
    if (Number.isNaN(x)) return;
    const good = x === q.answer;
    record(w, `iso-count-${lv}`, good);
    if (good) { w.points += 8; sfx.ok(); c.actions.stamp('正解'); } else { sfx.bad(); w.mistakes.push({ machine: 'structure', recipe: `${specText(q.spec)} の数え上げ`, part: 'calc', t: Date.now() }); }
    fb.replaceChildren(
      h('p', {}, h('b', {}, good ? '正解。研究点 +8。' : '不正解。'), `答えは ${q.answer} 種類。`),
      h('p', { class: 'note' }, q.how),
      h('div', { class: 'isos' }, ...q.list.map((i) => isoChip(i))),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'iso-next', onclick: () => runCount(c, lv) }, '次の問題'), back('iso-list', '一覧へ', () => showStructure(c))));
    fb.hidden = false;
    keys.hidden = true; ok.hidden = true;
    c.sheet.scrollTop = c.sheet.scrollHeight;
  };
  paint();
  c.show(
    h('header', {}, h('h2', {}, `数え上げ　${pretty(specText(q.spec))}`), back('iso-back', '一覧へ', () => showStructure(c))),
    h('p', { class: 'qtext' }, q.text),
    h('div', { class: 'row' }, display, h('span', { class: 'formula' }, '種類')), keys, h('div', { class: 'row' }, ok), fb,
  );
}

function runIdentify(c: PanelCtx, lv: 1 | 2 | 3) {
  const { w } = c;
  const q: IdentifyProblem = makeIdentify(mulberry32(seed()), lv);
  const fb = h('div', { class: 'answer', hidden: true });
  const opts = h('div', { class: 'isos pick' }, ...q.options.map((i, n) => {
    const b = h('button', { class: 'chip plain iso', type: 'button', id: `iso-opt-${n}` }, h('span', { class: 'formula' }, pretty(i.formula)));
    b.dataset.right = String(i.key === q.answer);
    b.onclick = () => {
      const good = i.key === q.answer;
      record(w, `iso-id-${lv}`, good);
      if (good) { w.points += 8; sfx.ok(); c.actions.stamp('正解'); } else { sfx.bad(); w.mistakes.push({ machine: 'structure', recipe: `${specText(q.spec)} の特定`, part: 'calc', t: Date.now() }); }
      for (const o of opts.children) { (o as HTMLButtonElement).disabled = true; o.classList.toggle('picked', (o as HTMLElement).dataset.right === 'true'); }
      b.classList.toggle('wrong', !good);
      const ans = q.options.find((o) => o.key === q.answer)!;
      fb.replaceChildren(
        h('p', {}, h('b', {}, good ? '正解。研究点 +8。' : '不正解。'), '答えは ', isoChip(ans)),
        h('p', { class: 'note' }, q.how),
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'iso-next', onclick: () => runIdentify(c, lv) }, '次の問題'), back('iso-list', '一覧へ', () => showStructure(c))));
      fb.hidden = false;
      c.sheet.scrollTop = c.sheet.scrollHeight;
    };
    return b;
  }));
  c.show(
    h('header', {}, h('h2', {}, `構造の特定　${pretty(specText(q.spec))}`), back('iso-back', '一覧へ', () => showStructure(c))),
    h('p', { class: 'qtext' }, q.text),
    h('ol', { class: 'clues' }, ...q.clues.map((t) => h('li', {}, t))),
    h('p', { class: 'muted' }, '候補を紙に全部書き出し、実験事実ごとに消していけ。残った 1 つを選べ。'),
    opts, fb,
  );
}
