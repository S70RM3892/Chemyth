import { DRILLS, checkStep, mulberry32, sameExpr, type Drill, type DrillGen } from '../content/drills';
import { pretty } from '../chem/formula';
import { canonical, specOf, specText, type Isomer } from '../chem/isomers';
import { makeSugar, sugarKey, sugarText } from '../content/sugar';
import { structureEditor } from './draw';
import { ESSAYS, type Essay } from '../content/essays';
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
    const meta = s as typeof s & { choices?: string[]; vars?: string[]; conceptual?: boolean };
    const choices = meta.choices;
    if (choices) {
      // 文字式で答える設問：式を自分で打ち込む。値を何通りか代入して、正しい式と同じ値になるかで判定する
      const fb2 = h('div', { class: 'answer', hidden: true });
      let closed = false;
      const settle = (good: boolean, picked?: HTMLElement) => {
        if (closed) return;
        closed = true;
        if (good) { right++; sfx.ok(); } else { sfx.bad(); w.mistakes.push({ machine: 'drill', recipe: g.title, part: 'calc', t: Date.now() }); }
        [...list.children].forEach((o, n) => { (o as HTMLButtonElement).disabled = true; o.classList.toggle('picked', n === s.answer); });
        picked?.classList.toggle('wrong', !good);
        fb2.replaceChildren(h('p', {}, h('b', {}, good ? '正解。' : '不正解。'), `正しい式は ${choices[s.answer]}`), h('p', { class: 'note' }, s.how));
        fb2.hidden = false;
        typedBox?.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
        ask(i + 1);
      };
      const list = h('div', { class: 'isos pick col' }, ...choices.map((ch, k) => {
        const b = h('button', { class: 'chip plain iso', type: 'button', id: `drill-choice-${i}-${k}` }, ch);
        b.onclick = () => settle(checkStep(s, k), b);
        return b;
      }));
      let typedBox: HTMLElement | null = null;
      const vars = meta.vars ?? [];
      if (!meta.conceptual && vars.length) {
        const toks: string[] = [];
        const shown = h('div', { class: 'slot on numslot expr', id: `drill-expr-${i}` }, '');
        const note = h('p', { class: 'feedback' });
        const paintExpr = () => { shown.textContent = toks.join('') || '式を入れる'; shown.classList.toggle('empty', !toks.length); };
        const key = (k: string, cls = 'n') => h('button', { class: `key ${cls}`, type: 'button', onclick: () => { if (k === '⌫') toks.pop(); else if (k === '消') toks.length = 0; else if (toks.length < 60) toks.push(k); note.textContent = ''; sfx.tap(); paintExpr(); } }, k);
        const submit = h('button', { class: 'primary', type: 'button', id: `drill-expr-ok-${i}` }, 'この式で答える');
        submit.onclick = () => {
          const expr = toks.join('');
          if (!expr) return;
          // 式として読めないときは、数えずに直させる
          if (!sameExpr(expr, expr, vars)) { note.textContent = '式として読めない。かっこの対応や、演算子の並びを確かめろ。'; return; }
          settle(sameExpr(expr, choices[s.answer], vars));
        };
        paintExpr();
        typedBox = h('div', { class: 'expr-box' },
          h('p', { class: 'muted' }, '式を自分で組み立てろ。かけ算の記号は省いてよい（4α²P のように書ける）。分数は / で書く。PV/RT は (PV)/(RT) と読まれる。上つきの数字は ^ のあとに打つ（10^5）。'),
          shown,
          h('div', { class: 'keys exprkeys' }, ...vars.map((v) => key(v, 'el')), ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'].map((k) => key(k)),
            ...['+', '−', '×', '/', '(', ')', '²', '³', '√', '^'].map((k) => key(k)), key('⌫', 'fn'), key('消', 'fn')),
          note, h('div', { class: 'row' }, submit));
      }
      const box2 = h('section', { class: 'drill-step', id: `drill-step-${i}` }, h('p', { class: 'qtext' }, h('b', {}, `(${i + 1}) `), typedBox ? s.text.replace(/を選べ。$/, 'を答えろ。').replace(/選べ。$/, '答えろ。') : s.text),
        ...(typedBox ? [typedBox, h('details', { class: 'named' }, h('summary', {}, '組み立てられないときは、選択肢から選ぶ'), list)] : [list]), fb2);
      body.append(box2);
      if (i > 0) box2.scrollIntoView({ block: 'nearest' });
      return;
    }
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
    h('p', { class: 'drill-intro' }, d.intro),
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

// ---------------- 論述 ----------------

/** 論述：紙に書いてから、模範解答と要点を見て自分で採点する */
export function showEssays(c: PanelCtx) {
  const { w } = c;
  const done = ESSAYS.filter((x) => w.practice[`essay-${x.id}`]?.clean).length;
  c.show(
    h('header', {}, h('h2', {}, '論述'), back('sheet-close', '閉じる', c.close)),
    h('p', {}, '京大は年によって、字数制限つきの論述を出す。文章は機械では採点できないので、紙に書いてから模範解答と要点を見て、自分で採点しろ。'),
    h('p', { class: 'muted' }, `要点を全部入れて書けたもの：${done} / ${ESSAYS.length}。書かずに模範解答を読むだけでは、書けるようにならない。`),
    h('div', { class: 'menu' }, ...ESSAYS.map((x) => {
      const st = w.practice[`essay-${x.id}`];
      return h('button', { class: 'ghost drill', type: 'button', id: `essay-${x.id}`, onclick: () => runEssay(c, x) },
        h('span', { class: 'drill-t' }, x.q.length > 34 ? x.q.slice(0, 34) + '…' : x.q),
        h('span', { class: 'muted' }, `${SYLLABUS.find((u) => u.id === x.unit)?.title ?? ''}・${x.limit} 字以内`),
        h('span', { class: 'drill-n' + (st?.clean ? ' ok' : '') }, st ? `満点 ${st.clean} / ${st.tries} 回` : '未挑戦'));
    })),
  );
}

function runEssay(c: PanelCtx, x: Essay) {
  const { w } = c;
  const got = new Set<number>();
  const body = h('div', { class: 'rxlist' });
  const reveal = h('button', { class: 'primary', type: 'button', id: 'essay-reveal' }, '紙に書いた。模範解答を見る');
  reveal.onclick = () => {
    reveal.hidden = true;
    const keys = h('div', { class: 'isos pick col' }, ...x.keys.map((k, i) => {
      const b = h('button', { class: 'chip plain iso', type: 'button', id: `essay-key-${i}` }, k);
      b.onclick = () => { got.has(i) ? got.delete(i) : got.add(i); b.classList.toggle('on', got.has(i)); b.setAttribute('aria-pressed', String(got.has(i))); sfx.tap(); };
      return b;
    }));
    const grade = h('button', { class: 'primary', type: 'button', id: 'essay-grade' }, '採点する');
    grade.onclick = () => {
      const full = got.size === x.keys.length, gain = got.size * 2 + (full ? 4 : 0);
      record(w, `essay-${x.id}`, full);
      w.points += gain;
      if (!full) w.mistakes.push({ machine: 'structure', recipe: '論述', part: 'calc', t: Date.now() });
      full ? (sfx.ok(), c.actions.stamp('満点')) : sfx.bad();
      grade.hidden = true;
      body.append(h('div', { class: 'answer' },
        h('p', { class: 'qtext' }, `要点 ${x.keys.length} つのうち ${got.size} つ。研究点 +${gain}。`),
        h('p', { class: 'muted' }, full ? '字数に収まっているかも確かめろ。' : '抜けた要点を入れて、もう一度書き直せ。'),
        h('div', { class: 'row' }, back('essay-list', '一覧へ', () => showEssays(c)))));
      c.sheet.scrollTop = c.sheet.scrollHeight;
    };
    body.append(h('div', { class: 'answer' }, h('p', {}, h('b', {}, '模範解答')), h('p', { class: 'note' }, x.model)),
      h('p', { class: 'muted' }, '自分の答案に入っていた要点を、正直に選べ。言い回しは違ってよい。'), keys, h('div', { class: 'row' }, grade));
    c.sheet.scrollTop = c.sheet.scrollHeight;
  };
  c.show(
    h('header', {}, h('h2', {}, '論述'), back('essay-back', '一覧へ', () => showEssays(c))),
    h('p', { class: 'qtext' }, x.q),
    h('p', { class: 'muted' }, `${x.limit} 字以内。主語と理由のつながりをはっきりさせ、紙に書け。`),
    h('div', { class: 'row' }, reveal), body,
  );
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
    h('h3', {}, '糖の結合様式を決める'), h('div', { class: 'menu' }, ...([1, 2, 3] as const).map((lv) => {
      const id = `sugar-${lv}`, st = w.practice[id];
      return h('button', { class: 'ghost drill', type: 'button', id, onclick: () => runSugar(c, lv) },
        h('span', { class: 'drill-t' }, `結合様式　${LEVEL[lv]}`),
        h('span', { class: 'muted' }, ['', '二糖（還元性と酵素。スクロース・ラクトース型も）', '三糖（メチル化分析）', '四糖（枝分かれあり）'][lv]),
        h('span', { class: 'drill-n' + (st?.clean ? ' ok' : '') }, st ? `正解 ${st.clean} / ${st.tries} 回` : '未挑戦'));
    })),
  );
}

/** 糖の構造決定：還元性・酵素・メチル化分析から、グリコシド結合の向きと位置を決める */
function runSugar(c: PanelCtx, lv: 1 | 2 | 3) {
  const { w } = c;
  const q = makeSugar(mulberry32(seed()), lv);
  const fb = h('div', { class: 'answer', hidden: true });
  const opts = h('div', { class: 'isos pick col' }, ...q.options.map((o, n) => {
    const right = sugarKey(o) === sugarKey(q.answer);
    const b = h('button', { class: 'chip plain iso', type: 'button', id: `sugar-opt-${n}` }, sugarText(o));
    b.dataset.right = String(right);
    b.onclick = () => {
      record(w, `sugar-${lv}`, right);
      if (right) { w.points += 8 + lv * 2; sfx.ok(); c.actions.stamp('正解'); } else { sfx.bad(); w.mistakes.push({ machine: 'structure', recipe: '糖の結合様式', part: 'calc', t: Date.now() }); }
      for (const x of opts.children) { (x as HTMLButtonElement).disabled = true; x.classList.toggle('picked', (x as HTMLElement).dataset.right === 'true'); }
      b.classList.toggle('wrong', !right);
      fb.replaceChildren(h('p', {}, h('b', {}, right ? `正解。研究点 +${8 + lv * 2}。` : '不正解。')), h('p', { class: 'note' }, q.how),
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'sugar-next', onclick: () => runSugar(c, lv) }, '次の問題'), back('iso-list', '一覧へ', () => showStructure(c))));
      fb.hidden = false;
      c.sheet.scrollTop = c.sheet.scrollHeight;
    };
    return b;
  }));
  c.show(
    h('header', {}, h('h2', {}, '糖の結合様式'), back('iso-back', '一覧へ', () => showStructure(c))),
    h('p', { class: 'qtext' }, q.text),
    h('ol', { class: 'clues' }, ...q.clues.map((t) => h('li', {}, t.text))),
    h('p', { class: 'muted' }, 'グルコースを六角形で描き、結合に使われた位置に印をつけてから選べ。'),
    opts, fb,
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
  // 構造式を自分で組み立てて答える。ベンゼン環は、置換基の数に応じた部品（C₆H₅–、–C₆H₄–）として置く
  const ans = q.options.find((o) => o.key === q.answer)!;
  // 三置換のベンゼン環だけは、組み立てずに選択肢から選ぶ
  const drawable = ans.mol.atoms.every((a) => ['C', 'O', 'Cl', 'Br', 'N', 'Ph', 'Ar'].includes(a as string));
  const aromatic = q.options.some((o) => o.mol.atoms.some((a) => ['Ph', 'Ar', 'Tr'].includes(a as string)));
  const els = ['C', 'O', ...(q.spec.cl ? ['Cl'] : []), ...(q.spec.br ? ['Br'] : []), ...((q.spec as { n?: number }).n ? ['N'] : []), ...(aromatic ? ['Ph', 'Ar'] : [])];
  const ed = drawable ? structureEditor(els) : null;
  const drawFb = h('p', { class: 'feedback', id: 'draw-feedback' });
  let tries = 0, done = false;
  const finish = (good: boolean) => {
    done = true;
    record(w, `iso-id-${lv}`, good && tries === 0);
    if (good) { w.points += 12; sfx.ok(); c.actions.stamp('正解'); } else { sfx.bad(); w.mistakes.push({ machine: 'structure', recipe: `${specText(q.spec)} の特定`, part: 'calc', t: Date.now() }); }
    fb.replaceChildren(h('p', {}, h('b', {}, good ? `正解。研究点 +12。${tries ? '' : '（一発）'}` : '答え：'), ' ', isoChip(ans)), h('p', { class: 'note' }, q.how),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'iso-next', onclick: () => runIdentify(c, lv) }, '次の問題'), back('iso-list', '一覧へ', () => showStructure(c))));
    fb.hidden = false;
    c.sheet.scrollTop = c.sheet.scrollHeight;
  };
  const drawOk = h('button', { class: 'primary', type: 'button', id: 'draw-ok' }, 'この構造で答える');
  drawOk.onclick = () => {
    if (done || !ed) return;
    const m = ed.mol();
    if (!m) { drawFb.textContent = ed.problem() ?? ''; return; }
    if (canonical(m) === q.answer) { finish(true); return; }
    tries++;
    const got = specText(specOf(m));
    drawFb.textContent = got !== specText(q.spec) ? `分子式が違う。いまの構造は ${pretty(got)}。` : '分子式は合っているが、実験事実に合わない異性体だ。どの事実に反するかを確かめろ。';
    sfx.bad();
    w.mistakes.push({ machine: 'structure', recipe: `${specText(q.spec)} の特定`, part: 'calc', t: Date.now() });
  };
  const giveUp = h('button', { class: 'ghost', type: 'button', id: 'draw-giveup', onclick: () => { if (!done) { tries++; finish(false); } } }, '答えを見る');
  const optBox = h('details', { class: 'named', id: 'draw-options' }, h('summary', {}, '描けないときは、選択肢から選ぶ'), opts);
  c.show(
    h('header', {}, h('h2', {}, `構造の特定　${pretty(specText(q.spec))}`), back('iso-back', '一覧へ', () => showStructure(c))),
    h('p', { class: 'qtext' }, q.text),
    h('ol', { class: 'clues' }, ...q.clues.map((t) => h('li', {}, t))),
    h('p', { class: 'muted' }, ed ? '候補を紙に全部書き出し、実験事実ごとに消していけ。残った 1 つの構造式を、下のマス目に組み立てろ。' : '候補を紙に全部書き出し、実験事実ごとに消していけ。残った 1 つを選べ。'),
    ...(ed ? [ed.el, drawFb, h('div', { class: 'row' }, drawOk, giveUp), optBox] : [opts]),
    fb,
  );
}
