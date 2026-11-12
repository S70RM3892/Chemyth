/**
 * 学習の画面のうち、復習の画面（review.ts）の外にあるもの。
 * - 図鑑：物質を名前・化学式で探す／反応を装置で絞る・並べ替える・使う指令を見る・係数と生成物を書いて練習する／用語カード
 * - 記録：学習時間の目標・練習の順番・週の報告・苦手の印刷・まちがえた単元・まちがえた理由・答えるまでの時間・
 *   今夜と今朝の 10 問の記録・計算問題の解き直し・取り違えやすい組
 * - 週の報告（直近 7 日と、その前の 7 日）と、次の試験までの復習の見込み
 * - 今日のまとめに足すもの（今日まちがえた問いと正しい答え、学習時間の目標）
 * 練習はどれも、復習の予定と記録を動かさない。
 */
import { CHAPTERS } from '../content/goals';
import { KNOWLEDGE } from '../content/knowledge';
import { MACHINES } from '../content/machines';
import { isCorrect, QUESTIONS } from '../content/questions';
import { CONDITIONS, electronsOf, recipeById, type MachineKind, type Recipe } from '../content/recipes';
import { equationOf } from '../content/looks';
import { label, sub } from '../content/substances';
import { dayKey } from '../engine/fsrs';
import { recallNow } from '../engine/habit';
import {
  answerRow, calcRedo, canFillCoef, canPickProducts, checkCoefs, checkProducts, fillTerms, forecast, goalsOf, known, mistakeUnits,
  nightHistory, orderIds, practiceGroups, productPool, redoSolved, studyToday, termTopics, timeStats, weakIds, weekReport, whyTally,
} from '../engine/learn';
import { GOAL_MINS, WHY_NAME, WHY_TIP, type Why } from '../engine/study';
import { PLATING, platingOf, type World } from '../engine/world';
import { chip, equation } from './config';
import { h } from './dom';
import { numPad, typeNumber, type PanelCtx } from './panels';
import { solveList } from './review';
import { sfx } from './sound';
import { linkText, subCard } from './subcard';

type Back = () => void;
const WHYS: Why[] = ['slip', 'unknown', 'mixup'];
/** 分の表示（1 時間を超えたら時間と分） */
const fmtMin = (ms: number) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} 時間 ${m % 60} 分` : `${m} 分`; };
/** 'YYYY-M-D' を 'M/D' に */
const md = (k: string) => k.split('-').slice(1).join('/');
/** 長い問題文の頭だけ */
const short = (t: string, n = 32) => (t.length > n ? `${t.slice(0, n)}…` : t);
/** 0〜1 の割合を横棒で */
function meter(f: number, good: boolean): HTMLElement {
  const i = h('i', {});
  i.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
  return h('span', { class: 'meter' + (good ? ' good' : '') }, i);
}
/** 切り替えの並び（押すとすぐ反映して描き直す） */
function seg<T>(id: string, cur: T, opts: [T, string][], set: (v: T) => void): HTMLElement {
  return h('span', { class: 'seg', role: 'group' }, ...opts.map(([v, name], i) => h('button', { type: 'button', id: `${id}-${i}`, class: cur === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); } }, name)));
}
/** 練習の順番の切り替え（セーブに入る） */
export function orderSeg(w: World, again: Back, id = 'order'): HTMLElement {
  return h('div', { class: 'row' }, h('span', { class: 'muted' }, '練習の順番'),
    seg<'mix' | 'weak'>(id, w.study.order, [['mix', '混ぜる'], ['weak', '苦手から']], (v) => { w.study.order = v; again(); }),
    h('span', { class: 'muted' }, w.study.order === 'weak' ? 'いま思い出せる確率の低い問いから' : '毎回でたらめに並べる'));
}

// ---------------- 図鑑：物質を探す ----------------

let subQuery = '';
/** 全角・下つき数字（₂）・大文字小文字の違いを消す */
const norm = (t: string) => t.normalize('NFKC').toLowerCase().replace(/\s/g, '');
export function bookSubs(w: World): HTMLElement[] {
  const seen = w.discovered.filter((s) => s !== 'e');
  const input = h('input', { type: 'search', id: 'book-q', class: 'book-q', placeholder: '名前か化学式で探す（例：アンモニア、NH3、H₂SO₄）', autocomplete: 'off', value: subQuery }) as HTMLInputElement;
  const count = h('p', { class: 'muted', id: 'book-n' });
  const grid = h('div', { class: 'grid', id: 'book-subs' });
  const paint = () => {
    subQuery = input.value;
    const k = norm(input.value);
    const hit = seen.filter((id) => { const s = sub(id); return !k || [s.name, label(id), s.formula ?? '', ...(s.aliases ?? [])].some((x) => x && norm(x).includes(k)); });
    grid.replaceChildren(...hit.map(subCard));
    count.textContent = k ? `「${input.value.trim()}」：${hit.length} 種類` : `これまでに出会った物質：${seen.length} 種類。`;
    if (!hit.length) grid.append(h('p', { class: 'muted' }, 'その名前・化学式の物質には、まだ出会っていない。'));
  };
  input.oninput = paint;
  paint();
  return [input, count, grid];
}

// ---------------- 図鑑：反応（装置で絞る・並べ替える・使う指令・書いて練習） ----------------

let rxMachine: MachineKind | 'all' = 'all';
let rxSort: 'learned' | 'due' | 'lapse' = 'learned';
const goalName = (g: { ch: number; gi: number; s: string }) => `${CHAPTERS[g.ch].name}・${g.gi + 1} 番目の指令（${sub(g.s).name}）`;
export function bookRx(c: PanelCtx, again: Back): HTMLElement[] {
  const { w } = c;
  const now = Date.now();
  const learned = [...new Set(w.learned)].map((id) => recipeById(id)).filter((r): r is Recipe => !!r);
  if (!learned.length) return [h('p', { class: 'muted' }, 'まだ正しく設定できた反応がない。')];
  const kinds = [...new Set(learned.map((r) => r.machine))];
  if (rxMachine !== 'all' && !kinds.includes(rxMachine)) rxMachine = 'all';
  const card = (r: Recipe) => w.srs[`r:${r.id}`];
  const shown = learned.filter((r) => rxMachine === 'all' || r.machine === rxMachine);
  if (rxSort === 'due') shown.sort((a, b) => (card(a)?.due ?? Infinity) - (card(b)?.due ?? Infinity));
  if (rxSort === 'lapse') shown.sort((a, b) => (card(b)?.l ?? 0) - (card(a)?.l ?? 0) || (card(a)?.due ?? Infinity) - (card(b)?.due ?? Infinity));
  const when = (t: number) => { const d = Math.round((t - now) / 86400000); return t <= now ? 'いま' : d <= 0 ? '今日' : d === 1 ? '明日' : `${d} 日後`; };
  const fillIds = (pred: (r: Recipe) => boolean) => orderIds(w, shown.filter(pred).map((r) => `r:${r.id}`));
  const nCoef = shown.filter(canFillCoef).length, nProd = shown.filter(canPickProducts).length;
  return [
    h('div', { class: 'chips small', id: 'book-machines' },
      ...([['all', `すべて ${learned.length}`], ...kinds.map((k) => [k, `${MACHINES[k].name} ${learned.filter((r) => r.machine === k).length}`])] as [MachineKind | 'all', string][]).map(([k, name]) =>
        h('button', { class: 'chip plain' + (rxMachine === k ? ' on' : ''), type: 'button', id: `book-m-${k}`, onclick: () => { rxMachine = k; sfx.tap(); again(); } }, name))),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, '並べ方'),
      seg<typeof rxSort>('book-sort', rxSort, [['learned', '覚えた順'], ['due', '次の復習が近い順'], ['lapse', '忘れた回数の多い順']], (v) => { rxSort = v; again(); })),
    h('div', { class: 'row' },
      h('button', { class: 'ghost', type: 'button', id: 'book-fill-coef', disabled: !nCoef, onclick: () => runFill(c, 'coef', fillIds(canFillCoef), again) }, `係数を書く練習（${Math.min(10, nCoef)} 問）`),
      h('button', { class: 'ghost', type: 'button', id: 'book-fill-prod', disabled: !nProd, onclick: () => runFill(c, 'prod', fillIds(canPickProducts), again) }, `生成物を組む練習（${Math.min(10, nProd)} 問）`)),
    orderSeg(w, again, 'book-order'),
    h('div', { class: 'rxlist' }, ...shown.map((r) => {
      const cd = card(r), pl = platingOf(w.srs, r.id), goals = goalsOf(r);
      return h('details', { class: 'rx', id: `book-rx-${r.id}` },
        h('summary', {}, h('b', {}, r.name), h('span', { class: 'formula' }, equation(r) + (r.machine === 'battery' ? `（e⁻ ${electronsOf(r)}）` : '')),
          cd ? h('span', { class: 'muted rx-srs' }, `次の復習 ${when(cd.due)}　いま思い出せる確率 ${Math.round(recallNow(cd, now) * 100)} %${cd.l ? `　忘れた ${cd.l} 回` : ''}${pl ? `　${PLATING[pl]}` : ''}`) : null),
        h('p', { class: 'muted' }, `${MACHINES[r.machine].name}　${CONDITIONS[r.machine].label}：${r.accept.join(' または ')}`),
        h('p', { class: 'note' }, r.note), h('p', { class: 'muted' }, r.source),
        h('p', { class: 'rx-goals' }, goals.length ? `この反応で作れる指令の物質：${goals.map(goalName).join('、')}` : 'この反応で直接作る指令の物質はない。'),
        h('div', { class: 'row' },
          cd ? h('button', { class: 'ghost', type: 'button', id: `book-try-${r.id}`, onclick: () => solveList(c, `練習：${r.name}`, [`r:${r.id}`], true, () => undefined) }, '練習する（予定は動かさない）') : null,
          canFillCoef(r) ? h('button', { class: 'ghost', type: 'button', id: `book-coef-${r.id}`, onclick: () => runFill(c, 'coef', [`r:${r.id}`], again) }, '係数を書く') : null,
          canPickProducts(r) ? h('button', { class: 'ghost', type: 'button', id: `book-prod-${r.id}`, onclick: () => runFill(c, 'prod', [`r:${r.id}`], again) }, '生成物を組む') : null));
    })),
  ];
}

/**
 * 反応式の穴埋め（練習）。coef：係数を自分で書き込む。prod：札から生成物をすべて選ぶ。
 * 4 択とちがい、答えの候補を見ずに組み立てる。予定と記録は動かさない
 */
export function runFill(c: PanelCtx, mode: 'coef' | 'prod', ids: string[], back: Back) {
  const list = ids.map((id) => recipeById(id.slice(2))).filter((r): r is Recipe => !!r && (mode === 'coef' ? canFillCoef(r) : canPickProducts(r))).slice(0, 10);
  const title = mode === 'coef' ? '係数を書く' : '生成物を組む';
  let right = 0;
  const head = (i: number) => [h('header', {}, h('h2', {}, title), h('button', { class: 'ghost', type: 'button', id: 'fill-back', onclick: back }, '戻る')),
    h('p', { class: 'muted' }, `${i + 1} / ${list.length}　練習（予定は動かさない）`)];
  /** 採点のあと：正しい式と解説、次へ */
  const verdict = (box: HTMLElement, good: boolean, msg: string, r: Recipe, i: number) => {
    if (good) right++;
    good ? sfx.ok() : sfx.bad();
    const c0 = r.accept[0];
    box.replaceChildren(h('p', {}, h('b', {}, good ? '正解' : '不正解'), msg ? `　${msg}` : ''),
      h('p', { class: 'rv-eq' }, h('span', { class: 'muted' }, '反応式　'), h('b', {}, equationOf(r)), c0 && c0 !== 'なし' ? h('span', { class: 'muted' }, `　${CONDITIONS[r.machine].label}：${c0}`) : null),
      h('p', { class: 'note' }, r.note),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'fill-next', onclick: () => step(i + 1) }, i + 1 < list.length ? '次へ' : '結果を見る')));
    box.hidden = false;
    c.sheet.scrollTop = c.sheet.scrollHeight;
  };
  const coef = (r: Recipe, i: number) => {
    const terms = fillTerms(r);
    const vals = terms.map((t) => (t.fixed ? String(t.n) : ''));
    let cur = terms.findIndex((t) => !t.fixed), closed = false;
    const eq = h('div', { class: 'fill-eq', id: 'fill-eq' });
    const box = h('div', { class: 'answer', hidden: true });
    const ok = h('button', { class: 'primary', type: 'button', id: 'fill-ok' }, '答える');
    const paint = () => {
      const parts: (Node | string)[] = [];
      terms.forEach((t, k) => {
        if (k > 0) parts.push(terms[k - 1].side !== t.side ? (r.shift ? ' ⇄ ' : ' → ') : ' + ');
        if (t.fixed) { parts.push(h('span', { class: 'formula' }, `${t.n === 1 ? '' : t.n}${label(t.id)}`)); return; }
        parts.push(h('span', { class: 'fill-term' }, h('button', { class: 'slot fill-slot' + (k === cur && !closed ? ' on' : '') + (vals[k] ? '' : ' empty'), type: 'button', id: `fill-s-${k}`, disabled: closed, onclick: () => { cur = k; sfx.tap(); paint(); } }, vals[k] || '□'), h('span', { class: 'formula' }, label(t.id))));
      });
      eq.replaceChildren(...parts);
      ok.disabled = closed || terms.some((t, k) => !t.fixed && !vals[k]);
    };
    const next = () => { const k = terms.findIndex((t, j) => j > cur && !t.fixed); cur = k >= 0 ? k : terms.findIndex((t, j) => !t.fixed && !vals[j]); };
    const press = (d: string) => {
      if (closed || cur < 0) return;
      if (d === '⌫') vals[cur] = vals[cur].slice(0, -1);
      else if (d === '→') next();
      else if (!(d === '0' && !vals[cur]) && vals[cur].length < 2) vals[cur] += d;
      sfx.tap(); paint();
    };
    const pad = h('div', { class: 'keys numpad', id: 'fill-pad' }, ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '→'].map((d) =>
      h('button', { class: 'key ' + (d === '⌫' || d === '→' ? 'fn' : 'n'), type: 'button', id: `fill-k-${d === '⌫' ? 'del' : d === '→' ? 'next' : d}`, onclick: () => press(d) }, d)));
    ok.onclick = () => {
      if (closed) return;
      closed = true;
      const got = checkCoefs(r, terms.flatMap((t, k) => (t.fixed ? [] : [Number(vals[k])])));
      pad.hidden = true; ok.hidden = true; paint();
      verdict(box, got === 'ok', got === 'scaled' ? '比は合っているが、いちばん簡単な整数比で書け。' : got === 'wrong' ? '両辺の原子の数を、元素ごとに数え直せ。' : '', r, i);
    };
    paint();
    c.show(...head(i), h('p', { class: 'qtext' }, `「${r.name}」の係数を書け。`),
      h('p', { class: 'muted' }, '□ を押して数字を入れる。係数が 1 のときも 1 と入れる。→ で次の □ へ。'), eq, pad, h('div', { class: 'row' }, ok), box);
  };
  const prod = (r: Recipe, i: number) => {
    const picked = new Set<string>();
    let closed = false;
    const box = h('div', { class: 'answer', hidden: true });
    const ok = h('button', { class: 'primary', type: 'button', id: 'fill-ok', disabled: true }, '答える');
    const pool = productPool(r);
    const chips = h('div', { class: 'chips', id: 'fill-pool' }, ...pool.map((s, k) => {
      const b = chip(s);
      b.id = `fill-p-${k}`;
      b.onclick = () => { if (closed) return; if (picked.has(s)) picked.delete(s); else picked.add(s); b.classList.toggle('on', picked.has(s)); ok.disabled = !picked.size; sfx.tap(); };
      return b;
    }));
    ok.onclick = () => {
      if (closed) return;
      closed = true;
      const good = checkProducts(r, [...picked]);
      for (const b of chips.querySelectorAll<HTMLButtonElement>('button')) { b.disabled = true; const s = b.dataset.sub!; b.classList.toggle('right', r.outputs.some(([x]) => x === s)); b.classList.toggle('wrong', picked.has(s) && !r.outputs.some(([x]) => x === s)); }
      ok.hidden = true;
      verdict(box, good, good ? '' : '数と種類を確かめろ。緑の枠が正しい生成物。', r, i);
    };
    const inputs = r.inputs.map(([s]) => label(s)).join(' + ');
    c.show(...head(i), h('p', { class: 'qtext' }, `${MACHINES[r.machine].name}：${inputs}（${CONDITIONS[r.machine].label}：${r.accept[0]}）→ ？`),
      h('p', { class: 'muted' }, 'できるものを、札からすべて選べ（数も種類も）。原料がまぎれていることもある。'), chips, h('div', { class: 'row' }, ok), box);
  };
  const step = (i: number) => {
    const r = list[i];
    if (r) { (mode === 'coef' ? coef : prod)(r, i); return; }
    c.show(h('header', {}, h('h2', {}, title), h('button', { class: 'ghost', type: 'button', id: 'fill-back', onclick: back }, '戻る')),
      h('p', { class: 'qtext', id: 'fill-score' }, list.length ? `${list.length} 問中 ${right} 問正解。` : '練習できる反応がない。'),
      h('p', { class: 'muted' }, mode === 'coef' ? '係数は、原子の数を元素ごとに左右で数えて合わせる。電子を含む式は、電荷も合わせる。' : '生成物は、何と何が反応して、何が残るかで決まる。原料のまま出るものはない。'),
      h('div', { class: 'row' }, list.length ? h('button', { class: 'primary', type: 'button', id: 'fill-again', onclick: () => runFill(c, mode, ids, back) }, 'もう一度') : null,
        h('button', { class: 'ghost', type: 'button', id: 'fill-done', onclick: back }, '図鑑へ')));
  };
  step(0);
}

// ---------------- 図鑑：用語カード ----------------

export function bookTerms(c: PanelCtx, again: Back): HTMLElement[] {
  const { w } = c;
  const topics = termTopics(), all = topics.flatMap((t) => t.ids);
  return [
    h('p', { class: 'muted' }, '知識問題を、表に問い・裏に答えと解説のカードにした。めくる前に答えを思い浮かべ、裏を見て、覚えていたかを自分でつけろ。練習なので、復習の予定は動かさない。'),
    orderSeg(w, again, 'term-order'),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'term-all', onclick: () => runFlip(c, 'すべての単元', orderIds(w, all).slice(0, 20), again) }, `すべての単元から 20 枚`)),
    h('div', { class: 'menu' }, ...topics.map((t, i) => h('button', { class: 'ghost chapter', type: 'button', id: `term-t-${i}`, onclick: () => runFlip(c, t.topic, orderIds(w, t.ids), again) },
      h('span', {}, h('b', {}, t.topic)), h('span', { class: 'muted' }, `復習で出た ${t.ids.filter((id) => w.srs[id]).length} / ${t.ids.length} 枚`)))),
  ];
}

/** 用語カード：表（問い）→ めくる → 裏（答えと解説）→ 自分でつける。最後に、あやしいものを 4 択で確かめられる */
export function runFlip(c: PanelCtx, title: string, ids: string[], back: Back) {
  const { w } = c;
  const list = ids.filter((id) => id.startsWith('k:') && known(id));
  const marks: Record<string, 'ok' | 'shaky' | 'no'> = {};
  const head = () => h('header', {}, h('h2', {}, `用語カード：${title}`), h('button', { class: 'ghost', type: 'button', id: 'flip-back', onclick: back }, '戻る'));
  const step = (i: number) => {
    const id = list[i];
    if (!id) { summary(); return; }
    const k = KNOWLEDGE.find((x) => `k:${x.id}` === id)!;
    const face = h('div', { class: 'flip', id: 'flip-card' }, h('span', { class: 'pill' }, k.topic), h('p', { class: 'qtext' }, k.q), h('p', { class: 'muted' }, '答えを思い浮かべてから、めくれ。'));
    const box = h('div', { class: 'rv-sub', hidden: true });
    const rate = h('div', { class: 'row', hidden: true, id: 'flip-rate' }, h('span', { class: 'muted' }, '覚えていた？'),
      ...([['ok', '覚えていた'], ['shaky', 'あやしい'], ['no', '覚えていなかった']] as const).map(([v, name]) =>
        h('button', { class: 'ghost', type: 'button', id: `flip-${v}`, onclick: () => { marks[id] = v; sfx.tap(); step(i + 1); } }, name)));
    const turn = h('button', { class: 'primary', type: 'button', id: 'flip-turn' }, 'めくる');
    turn.onclick = () => {
      face.classList.add('back');
      face.replaceChildren(h('span', { class: 'pill' }, k.topic), h('p', { class: 'muted' }, k.q), h('p', { class: 'flip-a' }, h('b', {}, k.choices[0])), h('p', { class: 'note' }, ...linkText(k.why, w.discovered, box)), box);
      turn.hidden = true; rate.hidden = false;
      sfx.tap();
    };
    c.show(head(), h('p', { class: 'muted' }, `${i + 1} / ${list.length}　練習（予定は動かさない）`), face, h('div', { class: 'row' }, turn), rate);
  };
  const summary = () => {
    const n = (v: string) => Object.values(marks).filter((x) => x === v).length;
    const weak = list.filter((id) => marks[id] && marks[id] !== 'ok');
    c.show(head(), h('p', { class: 'qtext', id: 'flip-score' }, `覚えていた ${n('ok')}・あやしい ${n('shaky')}・覚えていなかった ${n('no')}`),
      weak.length ? h('table', { class: 'log' }, ...weak.map((id) => { const row = answerRow(id)!; return h('tr', {}, h('td', {}, row.q), h('td', {}, row.a)); })) : null,
      h('p', { class: 'muted' }, weak.length ? 'あやしいものと覚えていなかったものは、4 択で確かめるか、もう一度めくれ。' : list.length ? 'ぜんぶ覚えていた。' : 'めくるカードがない。'),
      h('div', { class: 'row' },
        weak.length ? h('button', { class: 'primary', type: 'button', id: 'flip-quiz', onclick: () => solveList(c, `用語の確かめ：${title}`, weak, true) }, `4 択で確かめる（${Math.min(10, weak.length)} 問・練習）`) : null,
        weak.length ? h('button', { class: 'ghost', type: 'button', id: 'flip-again', onclick: () => runFlip(c, title, weak, back) }, 'もう一度めくる') : null,
        h('button', { class: 'ghost', type: 'button', id: 'flip-done', onclick: back }, '一覧へ')));
  };
  step(0);
}

// ---------------- 記録 ----------------

/** 記録の上：今日の学習時間と目標・練習の順番・週の報告・苦手の印刷 */
export function logTop(c: PanelCtx, again: Back): HTMLElement[] {
  const { w } = c;
  const st = studyToday(w);
  return [h('div', { class: 'log-top' },
    h('p', { id: 'log-study' }, `今日の学習時間 ${fmtMin(st.ms)}`, st.goal ? (st.done ? `（目標 ${w.study.goalMin} 分：達成）` : `（目標 ${w.study.goalMin} 分まで あと ${Math.ceil(st.left / 60000)} 分）`) : ''),
    st.goal ? meter(st.frac, st.done) : null,
    h('div', { class: 'row' }, h('span', { class: 'muted' }, '1 日の学習時間の目標'),
      seg('log-goal', w.study.goalMin, GOAL_MINS.map((m) => [m, m ? `${m} 分` : 'なし'] as [number, string]), (v) => { w.study.goalMin = v; again(); })),
    orderSeg(w, again, 'log-order'),
    h('div', { class: 'row' },
      h('button', { class: 'ghost', type: 'button', id: 'log-week', onclick: () => showWeek(c, again) }, '週の報告（直近 7 日・試験までの見込み）'),
      h('button', { class: 'ghost', type: 'button', id: 'log-print', onclick: () => showPrint(c, again) }, '苦手の一覧を印刷する')))];
}

/** 記録のつづき：まちがえた単元・理由・答えるまでの時間・今夜と今朝の 10 問・計算の解き直し・取り違えやすい組 */
export function logMore(c: PanelCtx, again: Back): (HTMLElement | null)[] {
  const { w } = c;
  const units = mistakeUnits(w), tally = whyTally(w), ts = timeStats(w), nights = nightHistory(w), redo = calcRedo(w), groups = practiceGroups(w);
  const whyAll = WHYS.reduce((a, k) => a + tally[k].n, 0), whyTop = [...WHYS].sort((a, b) => tally[b].n - tally[a].n)[0];
  const q = (id: string) => answerRow(id)?.q ?? id;
  return [
    h('h3', {}, 'まちがえた単元（多い順）'),
    units.length ? h('div', { class: 'menu', id: 'log-units' }, ...units.map((u, i) => h('div', { class: 'chapter-row' },
      h('span', { class: 'unit-name' }, h('b', {}, u.unit), h('span', { class: 'muted' }, `　まちがい ${u.n} 回・練習 ${Math.min(10, u.ids.length)} 問`)),
      h('button', { class: 'ghost', type: 'button', id: `log-unit-${i}`, onclick: () => solveList(c, `単元の練習：${u.unit}`, u.ids, true) }, 'この単元を練習'))))
      : h('p', { class: 'muted' }, 'まだない。'),
    h('h3', {}, 'まちがえた理由'),
    whyAll ? h('table', { class: 'log', id: 'log-why' }, ...WHYS.map((k) => h('tr', {}, h('td', {}, WHY_NAME[k]), h('td', { class: 'n' }, `${tally[k].n} 回`)))) : null,
    whyAll ? h('p', { class: 'note' }, `いちばん多いのは「${WHY_NAME[whyTop]}」。${WHY_TIP[whyTop].replace(/^[^：]+：/, '')}`) : h('p', { class: 'muted' }, '復習でまちがえたとき、結果の下で理由を選ぶと、ここで数える。'),
    whyAll && tally[whyTop].ids.length ? h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'log-why-go', onclick: () => solveList(c, `「${WHY_NAME[whyTop]}」でまちがえた問い`, tally[whyTop].ids, true) }, `「${WHY_NAME[whyTop]}」の問いを練習（${Math.min(10, tally[whyTop].ids.length)} 問）`)) : null,
    h('h3', {}, '答えるまでの時間'),
    ts.n ? h('p', { id: 'log-time' }, `平均 ${(ts.avg / 1000).toFixed(1)} 秒（${ts.n} 回）。問いが出てから選択肢を選ぶまでの時間で、1 分を超えたものは 1 分として数える。`) : h('p', { class: 'muted' }, '復習で答えると、ここに出る。'),
    ts.n ? h('table', { class: 'log', id: 'log-slow' }, ...ts.slow.map((x) => h('tr', {}, h('td', {}, q(x.id)), h('td', { class: 'n' }, `${(x.avg / 1000).toFixed(1)} 秒`), h('td', { class: 'n' }, `${x.n} 回`)))) : null,
    ts.n ? h('p', { class: 'muted' }, '正解していても時間のかかる問いは、まだすぐには思い出せない。間隔を空けて何度も思い出すうちに速くなる。') : null,
    ts.slow.length ? h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'log-slow-go', onclick: () => solveList(c, '時間のかかる問いを練習', ts.slow.map((x) => x.id), true) }, `時間のかかる問いを練習（${ts.slow.length} 問）`)) : null,
    h('h3', {}, '今夜の 10 問・今朝の 10 問（直近 7 日）'),
    nights.length ? h('table', { class: 'log', id: 'log-nights' }, ...nights.map((x) => h('tr', {}, h('td', {}, `${md(x.day)} の夜`), h('td', {}, `今夜 ${x.got} / ${x.n}`),
      h('td', {}, x.morning === undefined ? '今朝 —' : `今朝 ${x.morning} / ${x.n}`),
      x.morning !== undefined && x.got > x.morning ? h('td', { class: 'n' }, `${x.got - x.morning} 問抜けた`) : h('td', { class: 'muted' }, x.morning === undefined ? '' : '抜けなし'))))
      : h('p', { class: 'muted' }, 'まだない。就寝の 4 時間前から 1 時間前までに「今夜の 10 問」が出る。翌朝、同じ問いを出す。'),
    h('h3', {}, '計算問題の解き直し'),
    redo.length ? h('table', { class: 'log', id: 'log-redo' }, ...redo.slice(0, 12).map((x, i) => h('tr', {}, h('td', {}, h('span', { class: 'pill' }, x.topic), ' ', short(QUESTIONS.find((q2) => q2.id === x.id)?.text ?? '')), h('td', { class: 'n' }, `まちがい ${x.misses} 回`),
      h('td', {}, x.done ? h('span', { class: 'pill ok' }, '解き直した') : h('button', { class: 'ghost mini', type: 'button', id: `log-redo-${i}`, onclick: () => runRedo(c, x.id, again) }, '解き直す')))))
      : h('p', { class: 'muted' }, '強化・研究の計算問題でまちがえると、ここに並ぶ。'),
    h('h3', {}, '取り違えやすい組を続けて解く'),
    groups.length ? h('div', { class: 'menu', id: 'log-groups' }, ...groups.slice(0, 10).map((g, i) => h('div', { class: 'chapter-row' },
      h('span', { class: 'unit-name' }, h('b', {}, g.name), h('span', { class: 'muted' }, `　${g.ids.length} 問${g.miss ? `・まちがい ${g.miss} 回` : ''}`)),
      h('button', { class: 'ghost', type: 'button', id: `log-group-${i}`, onclick: () => solveList(c, `見比べ：${g.name}`, g.ids, true) }, '続けて解く'))))
      : h('p', { class: 'muted' }, 'まだない。反応を覚えると増える。'),
    groups.length ? h('p', { class: 'muted' }, '似たものを続けて解くと、どこで見分けるかがはっきりする。練習なので、予定は動かさない。') : null,
  ];
}

/** 計算問題の解き直し（練習：研究点は動かさない）。正解すれば、解き直した印がつき、正解した計算問題にも入る */
export function runRedo(c: PanelCtx, id: string, back: Back) {
  const { w } = c;
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) { back(); return; }
  let text = '';
  const display = h('div', { class: 'slot on numslot', id: 'redo-display' }, '');
  const paint = () => { display.textContent = text || '答えを入れる'; display.classList.toggle('empty', !text); };
  const keys = numPad((k) => { text = typeNumber(text, k); sfx.tap(); paint(); });
  const fb = h('div', { class: 'answer', hidden: true });
  const ok = h('button', { class: 'primary', type: 'button', id: 'redo-ok' }, '答える');
  ok.onclick = () => {
    const x = parseFloat(text);
    if (Number.isNaN(x)) return;
    const good = isCorrect(q, x);
    if (good) { redoSolved(w, q.id); sfx.ok(); } else sfx.bad();
    fb.replaceChildren(h('p', {}, h('b', {}, good ? '正解。' : '不正解。'), `答えは ${q.answer} ${q.unit}`), h('p', { class: 'note' }, q.how),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'redo-list', onclick: back }, '記録へ'),
        good ? null : h('button', { class: 'ghost', type: 'button', id: 'redo-again', onclick: () => runRedo(c, id, back) }, 'もう一度')));
    fb.hidden = false; keys.hidden = true; ok.hidden = true;
    display.classList.remove('on');
  };
  paint();
  c.show(h('header', {}, h('h2', {}, '計算問題の解き直し'), h('button', { class: 'ghost', type: 'button', id: 'redo-back', onclick: back }, '戻る')),
    h('p', {}, h('span', { class: 'pill' }, q.topic)), h('p', { class: 'qtext' }, q.text),
    h('div', { class: 'row' }, display, h('span', { class: 'formula big' }, q.unit)),
    h('p', { class: 'muted' }, '有効数字 2 桁が合っていれば正解。練習なので研究点は動かない。紙に書いて計算しろ。'),
    keys, fb, h('div', { class: 'row' }, ok));
}

// ---------------- 苦手の一覧を印刷 ----------------

/** 印刷の見本を窓に出し、「印刷する」で印刷する。印刷では、問いと正しい答えの表だけが出る（ほかの画面は隠す） */
export function showPrint(c: PanelCtx, back: Back) {
  const { w } = c;
  const rows = weakIds(w).map((id) => answerRow(id)).filter((x): x is { q: string; a: string } => !!x);
  const d = new Date(), date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const table = () => h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '問い'), h('th', {}, '正しい答え'))),
    h('tbody', {}, ...rows.map((r, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, r.q), h('td', {}, r.a)))));
  const lead = `${date}　${rows.length} 問。今日まちがえたもの・何度も忘れたもの・自信を持ってまちがえたもの。`;
  c.show(h('header', {}, h('h2', {}, '苦手の一覧を印刷する'), h('button', { class: 'ghost', type: 'button', id: 'print-back', onclick: back }, '戻る')),
    h('p', { class: 'muted' }, rows.length ? '印刷すると、この表だけが紙に出る。答えの列を紙で隠して、問いから答えを言えるか確かめろ。' : 'まだ苦手の問いがない。'),
    rows.length ? h('div', { class: 'print-preview', id: 'print-preview' }, h('p', {}, lead), table()) : null,
    h('div', { class: 'row' }, rows.length ? h('button', { class: 'primary', type: 'button', id: 'print-go', onclick: () => {
      document.getElementById('print-sheet')?.remove();
      document.body.append(h('div', { id: 'print-sheet' }, h('h1', {}, '苦手の一覧'), h('p', {}, lead), table()));
      sfx.tap();
      try { window.print(); } catch { c.toast('この画面からは印刷できない。', 2400); }
    } }, '印刷する') : null));
}

// ---------------- 週の報告 ----------------

/** 直近 7 日と、その前の 7 日。次の試験までの復習の見込み */
export function showWeek(c: PanelCtx, back?: Back) {
  const { w } = c;
  const now = Date.now(), { cur, prev } = weekReport(w, now), fc = forecast(w, now);
  const pc = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);
  const diff = (a: number, b: number, unit: string) => (a === b ? '±0' : `${a > b ? '+' : '−'}${Math.abs(a - b)} ${unit}`);
  const rows: [string, string, string, string][] = [
    ['復習した数', `${cur.n} 問`, `${prev.n} 問`, diff(cur.n, prev.n, '問')],
    ['思い出せた割合', pc(cur.rate), pc(prev.rate), cur.rate !== null && prev.rate !== null ? diff(Math.round(cur.rate * 100), Math.round(prev.rate * 100), 'ポイント') : '—'],
    ['復習した日', `${cur.days} 日`, `${prev.days} 日`, diff(cur.days, prev.days, '日')],
    ['新しく覚えた反応', `${cur.learned} 個`, `${prev.learned} 個`, diff(cur.learned, prev.learned, '個')],
    ['遊んだ時間', fmtMin(cur.ms), fmtMin(prev.ms), diff(Math.floor(cur.ms / 60000), Math.floor(prev.ms / 60000), '分')],
  ];
  const say = !cur.n ? 'この 7 日は復習していない。今日 10 問から始めろ。'
    : cur.days < 7 ? `7 日のうち ${cur.days} 日復習した。毎日少しずつのほうが、まとめてやるより忘れにくい。`
    : '7 日とも復習した。この調子で続けろ。';
  const rateSay = cur.rate !== null && prev.rate !== null && cur.rate < prev.rate - 0.05 ? '思い出せた割合が下がった。苦手と、自信を持ってまちがえた問いを先に練習しろ。' : '';
  const ex = fc ? new Date(fc.exam) : null;
  c.show(h('header', {}, h('h2', {}, '週の報告'), back ? h('button', { class: 'ghost', type: 'button', id: 'week-back', onclick: back }, '戻る') : h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる')),
    h('table', { class: 'log week', id: 'week-table' }, h('tr', {}, h('th', {}, ''), h('th', {}, '直近 7 日'), h('th', {}, 'その前の 7 日'), h('th', {}, '変化')),
      ...rows.map(([a, b, c2, d2]) => h('tr', {}, h('td', {}, a), h('td', { class: 'n' }, b), h('td', { class: 'n' }, c2), h('td', { class: 'n' }, d2)))),
    h('p', { id: 'week-say' }, say, rateSay ? `　${rateSay}` : ''),
    h('p', { class: 'muted' }, '日の区切りは朝 4 時。思い出せた割合は、勘で当たったものを数えない。新しく覚えた反応は、はじめて正しく設定できた日で数える。'),
    h('h3', {}, '次の試験までの復習の見込み'),
    fc && ex ? h('p', { id: 'week-forecast' }, `${fc.name}（${ex.getMonth() + 1}/${ex.getDate()}）まで ${fc.days} 日。いま覚えている ${fc.cards} 問の復習は、毎回思い出せたとしても あと `, h('b', {}, `${fc.total} 回`), `、1 日あたり 約 ${fc.perDay.toFixed(1)} 回。`)
      : h('p', { id: 'week-forecast' }, '次の試験の日が過ぎている。メニューの「睡眠と試験日」で、次の試験の日を入れろ。'),
    fc ? h('p', { class: 'muted' }, '復習の予定（FSRS）を、どの問いも思い出せたとして試験の日まで進めて数えた。試験日をまたぐ間隔は作らないので、どの問いも試験の前にもう一度出る。忘れた問いは今日のうちに戻ってくるので、実際はこれより多い。これから覚える問いは入っていない。') : null);
}

// ---------------- 今日のまとめに足すもの ----------------

/** 今日のまとめ：学習時間の目標と、今日まちがえた問い（正しい答えつき） */
export function todayExtras(w: World): HTMLElement[] {
  const now = Date.now(), st = studyToday(w, now);
  const wrong = w.today.day === dayKey(now) ? w.today.wrong.filter(known) : [];
  const out: HTMLElement[] = [];
  if (st.goal) out.push(h('div', { class: 'log-top', id: 'today-study' }, h('p', {}, `学習時間の目標 ${w.study.goalMin} 分：${st.done ? '達成' : `あと ${Math.ceil(st.left / 60000)} 分（いま ${fmtMin(st.ms)}）`}`), meter(st.frac, st.done)));
  out.push(wrong.length
    ? h('div', { class: 'rv-hclist', id: 'today-missed' }, h('b', {}, `今日まちがえた問い（${wrong.length}）と正しい答え`), ...wrong.slice(0, 12).map((id) => { const r = answerRow(id)!; return h('p', {}, `${r.q}　→ ${r.a}`); }),
      wrong.length > 12 ? h('p', { class: 'muted' }, `ほか ${wrong.length - 12} 問。記録の「苦手の一覧を印刷する」で全部見られる。`) : null)
    : h('p', { class: 'muted', id: 'today-missed' }, '今日まちがえた問いはない。'));
  return out;
}

// ---------------- 章の一覧に出す習熟 ----------------

/** 章の反応のうち正しく設定できた数と、習熟メッキの数 */
export function masteryText(m: { learned: number; total: number; plate: [number, number, number] }): string {
  if (!m.total) return '';
  const plates = m.plate.map((n, i) => (n ? `${PLATING[i + 1]} ${n}` : '')).filter(Boolean).join('・');
  return `反応 ${m.learned} / ${m.total}${plates ? `（${plates}）` : ''}`;
}
