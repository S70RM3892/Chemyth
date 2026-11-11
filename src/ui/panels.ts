import { ELEMENTS } from '../content/elements';
import { MACHINES } from '../content/machines';
import { CONDITIONS, electronsOf, recipeById, RECIPES } from '../content/recipes';
import { isCorrect, QUESTIONS, type Question } from '../content/questions';
import { label, sub } from '../content/substances';
import { CHAPTERS } from '../content/goals';
import { KNOWLEDGE } from '../content/knowledge';
import { PASSAGES, checkBlank, type Passage } from '../content/passages';
import { REAGENTS, SETS, TESTS, testById } from '../content/samples';
import { pretty } from '../chem/formula';
import { SRS_STEPS, UPGRADE_COST, beltSpeed, discover, dueIds, extractInterval, machineRate, schedule, setChapter, type Ent, type UpgradeKey, type World } from '../engine/world';
import { chip, equation, openConfig, type SheetActions } from './config';
import { h } from './dom';
import { sfx } from './sound';
import { elementIcon, tokenIcon } from './token';

type Show = (...nodes: (Node | string | null)[]) => void;
export interface PanelCtx { w: World; show: Show; close(): void; toast(msg: string, ms?: number): void; sheet: HTMLElement; actions: SheetActions }

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
  const PART: Record<string, string> = { reactants: '原料の組み合わせ', products: '生成物', electrodes: '電極', coefficients: '係数', electrons: '電子の数', equilibrium: '平衡の条件', revealed: '答えを見た', calc: '計算問題', isomer: '違う物質を納めた', quiz: '知識問題', passage: 'リード文' };
  const tally = new Map<string, number>();
  for (const m of w.mistakes) {
    const name = m.machine === 'calc' ? QUESTIONS.find((q) => q.id === m.recipe)?.topic ?? '計算'
      : m.machine === 'analysis' ? `仕分け：${m.recipe ? sub(m.recipe).name : ''}`
      : m.machine === 'quiz' ? KNOWLEDGE.find((k) => k.id === m.recipe)?.topic ?? '知識'
      : m.machine === 'passage' ? PASSAGES.find((x) => m.recipe?.startsWith(x.id))?.title ?? 'リード文'
      : m.recipe ? recipeById(m.recipe)?.name ?? m.recipe : MACHINES[m.machine].name;
    const part = m.part === 'condition' && (m.machine in CONDITIONS) ? CONDITIONS[m.machine as keyof typeof CONDITIONS].label : PART[m.part];
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

// ---------------- 入力用のキー ----------------

function numPad(press: (k: string) => void): HTMLElement {
  return h('div', { class: 'keys numpad' }, ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '.'].map((k) =>
    h('button', { class: 'key n', type: 'button', onclick: () => press(k) }, k)),
    h('button', { class: 'key fn wide', type: 'button', onclick: () => press('⌫') }, '⌫'));
}
function typeNumber(text: string, k: string): string {
  if (k === '⌫') return text.slice(0, -1);
  if (k === '−') return text.startsWith('-') ? text.slice(1) : '-' + text;
  if (k === '.') return text.includes('.') ? text : text + (text === '' || text === '-' ? '0.' : '.');
  return text.replace(/[-.]/g, '').length < 8 ? text + k : text;
}
function formulaPad(press: (k: string) => void): HTMLElement {
  return h('div', { class: 'keypad' },
    h('div', { class: 'keys el' }, ...ELEMENTS.map((el) => h('button', { class: 'key el', type: 'button', onclick: () => press(el.sym) }, elementIcon(el.sym, 16), h('span', {}, el.sym)))),
    h('div', { class: 'keys num' }, ...['2', '3', '4', '5', '6', '7', '8', '9', '1', '0', '(', ')', '⌫'].map((k) => h('button', { class: 'key ' + (k === '⌫' ? 'fn' : 'n'), type: 'button', onclick: () => press(k) }, k))));
}
const typeFormula = (text: string, k: string) => (k === '⌫' ? text.replace(/([A-Z][a-z]?|\d|\(|\))$/, '') : text.length < 24 ? text + k : text);
function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// ---------------- 試薬棚 ----------------

export function showSampler(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const pick = (v: string) => { e.sub = v; e.rr = 0; if (!v.startsWith('set:')) discover(c.w, v); sfx.ok(); c.close(); };
  c.show(h('header', {}, h('h2', {}, '試薬棚'), closeBtn(c)),
    h('h3', {}, '分析用の試料（見分けのつかない数種類が順に出る）'),
    h('div', { class: 'menu' }, ...SETS.map((set) => {
      const b = h('button', { class: 'ghost' + (e.sub === `set:${set.id}` ? ' picked' : ''), type: 'button', id: `set-${set.id}`, onclick: () => pick(`set:${set.id}`) },
        h('b', {}, set.name), h('span', { class: 'muted' }, `　${set.about}`));
      return b;
    })),
    h('h3', {}, '実験室の試薬'),
    h('div', { class: 'chips' }, ...REAGENTS.map((r) => { const b = chip(r, e.sub === r ? 'on' : ''); b.id = `reagent-${r}`; b.title = sub(r).name; b.onclick = () => pick(r); return b; })),
    h('p', { class: 'muted' }, '試薬棚から出したものを、そのまま納品所へ運んでも指令には数えない。反応させてできたものは数える。'),
    extra);
}

// ---------------- 分析器 ----------------

export function showAnalyzer(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const GROUP = { organic: '有機化合物の検査', amino: 'アミノ酸・ペプチドの検査', nucleic: '核酸の塩基の検査', ion: '金属イオンの検査' } as const;
  const cur = testById(e.test);
  c.show(h('header', {}, h('h2', {}, '分析器'), closeBtn(c)),
    cur ? h('div', { class: 'answer' }, h('p', {}, h('b', {}, `いまの検査：${cur.name}`)), h('p', {}, `陽性（正面へ）：${cur.sees}`), h('p', { class: 'muted' }, 'そうならなかったものは陰性として右手へ出る。'),
      h('details', { class: 'named' }, h('summary', {}, 'この検査でわかること（まず自分で思い出せ）'), h('p', { class: 'note' }, cur.means)))
      : h('p', {}, '行う検査を 1 つ選べ。陽性は正面、陰性は右手へ流れる。'),
    ...(Object.keys(GROUP) as (keyof typeof GROUP)[]).flatMap((g) => [
      h('h3', {}, GROUP[g]),
      h('div', { class: 'menu' }, ...TESTS.filter((t) => t.group === g).map((t) =>
        h('button', { class: 'ghost' + (e.test === t.id ? ' picked' : ''), type: 'button', id: `test-${t.id}`, onclick: () => { e.test = t.id; sfx.ok(); showAnalyzer(c, e, extra); } }, t.name))),
    ]),
    extra);
}

// ---------------- 章の選択 ----------------

export function showChapters(c: PanelCtx) {
  const { w } = c;
  c.show(h('header', {}, h('h2', {}, '指令の一覧'), closeBtn(c)),
    h('p', { class: 'muted' }, '章はいつでも切り替えられる。進み具合は章ごとに残る。後ろの章には、前の章で作った物質を原料に使うものがある。'),
    h('div', { class: 'menu' }, ...CHAPTERS.map((ch, i) => {
      const done = w.progress[i], total = ch.goals.length, g = ch.goals[done];
      return h('button', { class: 'ghost chapter' + (i === w.chapter ? ' picked' : ''), type: 'button', id: `chapter-${i}`,
        onclick: () => { setChapter(w, i); sfx.ok(); c.close(); } },
        h('span', {}, h('b', {}, ch.name), h('span', { class: 'muted' }, g ? `　次：${sub(g.s).name}` : '　完了')),
        h('span', { class: 'formula' }, `${done} / ${total}`));
    })));
}

// ---------------- 復習 ----------------

export const reviewCount = (w: World) => dueIds(w).length;

export function showReview(c: PanelCtx) {
  const { w } = c;
  const due = dueIds(w).filter((id) => (id.startsWith('r:') ? !!recipeById(id.slice(2)) : KNOWLEDGE.some((k) => `k:${k.id}` === id))).slice(0, 6);
  // まだ出していない知識問題を少しずつ混ぜる
  const fresh = KNOWLEDGE.filter((k) => !w.srs[`k:${k.id}`]).slice(0, Math.max(1, 4 - due.length)).map((k) => `k:${k.id}`);
  const queue = [...due, ...fresh].slice(0, 7);
  let right = 0;
  const finish = () => {
    const next = Object.values(w.srs).map((x) => x.due).sort((a, b) => a - b)[0];
    const mins = next ? Math.max(0, Math.round((next - Date.now()) / 60000)) : 0;
    c.show(h('header', {}, h('h2', {}, '復習'), closeBtn(c)),
      h('p', { class: 'qtext' }, queue.length ? `${queue.length} 問中 ${right} 問正解。研究点 +${right * 3}。` : 'いま復習するものはない。'),
      h('p', { class: 'muted' }, `正解したものは間隔を空けてまた出る（${SRS_STEPS.map((m) => (m < 60 ? `${m}分` : `${Math.round(m / 1440)}日`)).join(' → ')}）。間違えたものは 10 分後に戻ってくる。` + (next ? `次の復習は約 ${mins >= 120 ? `${Math.round(mins / 60)} 時間` : `${mins} 分`}後。` : '')));
  };
  const mark = (id: string, ok: boolean) => { schedule(w, id, ok); if (ok) { right++; w.points += 3; } };
  const step = (i: number) => {
    const id = queue[i];
    if (!id) { finish(); return; }
    const head = h('p', { class: 'muted' }, `復習 ${i + 1} / ${queue.length}`);
    if (id.startsWith('r:')) {
      const r = recipeById(id.slice(2))!;
      c.show();
      openConfig(c.sheet, w, { kind: r.machine, x: -1, y: -1, dir: 0 }, c.actions, { recipe: r, done: (ok) => { mark(id, ok); step(i + 1); } });
      c.sheet.prepend(head);
      c.sheet.scrollTop = 0;
      return;
    }
    const k = KNOWLEDGE.find((x) => `k:${x.id}` === id)!;
    const result = h('div', { class: 'answer', hidden: true });
    const opts = h('div', { class: 'menu' }, ...shuffled(k.choices).map((ch) => {
      const b = h('button', { class: 'ghost', type: 'button' }, ch);
      b.dataset.right = String(ch === k.choices[0]);
      b.onclick = () => {
        const ok = ch === k.choices[0];
        mark(id, ok);
        if (!ok) w.mistakes.push({ machine: 'quiz', recipe: k.id, part: 'quiz', t: Date.now() });
        ok ? sfx.ok() : sfx.bad();
        for (const o of opts.children) { (o as HTMLButtonElement).disabled = true; o.classList.toggle('picked', (o as HTMLElement).dataset.right === 'true'); }
        b.classList.toggle('wrong', !ok);
        result.replaceChildren(h('p', {}, h('b', {}, ok ? '正解。' : `不正解。正しくは「${k.choices[0]}」`)), h('p', { class: 'note' }, k.why),
          h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'rv-next', onclick: () => step(i + 1) }, '次へ')));
        result.hidden = false;
      };
      return b;
    }));
    c.show(h('header', {}, h('h2', {}, '復習'), closeBtn(c)), head, h('p', {}, h('span', { class: 'pill' }, k.topic)), h('p', { class: 'qtext' }, k.q), opts, result);
  };
  step(0);
}

// ---------------- リード文課題 ----------------

export function showPassages(c: PanelCtx) {
  const { w } = c;
  c.show(h('header', {}, h('h2', {}, 'リード文課題'), closeBtn(c)),
    h('p', { class: 'muted' }, '京大の化学と同じ、長い文章の空欄を埋める形式。文章はすべてこのゲーム用に書いたもの。初めて正解した空欄 1 つにつき研究点 4。'),
    h('div', { class: 'menu' }, ...PASSAGES.map((p) => {
      const got = p.blanks.filter((b) => w.cleared.includes(`${p.id}:${b.id}`)).length;
      return h('button', { class: 'ghost chapter', type: 'button', id: `passage-${p.id}`, onclick: () => showPassage(c, p) },
        h('span', {}, h('b', {}, p.title), h('span', { class: 'muted' }, `　${p.field}`)), h('span', { class: 'formula' }, `${got} / ${p.blanks.length}`));
    })));
}

function showPassage(c: PanelCtx, p: Passage) {
  const { w } = c;
  const ans: Record<string, string> = {};
  let active = p.blanks[0].id, graded = false;
  const body = h('div', { class: 'passage' }), editor = h('div', { class: 'editor' }), result = h('div', { class: 'rxlist' });
  const blankOf = (id: string) => p.blanks.find((b) => b.id === id)!;
  const shown = (id: string) => { const b = blankOf(id), v = ans[id]; return !v ? '　　' : b.type === 'formula' ? pretty(v) : v; };
  const paint = () => {
    body.replaceChildren(...p.text.split('\n\n').map((para) => h('p', {}, ...para.split(/(\[[^\]]+\]|\n)/).filter(Boolean).map((part) => {
      if (part === '\n') return h('br', {});
      const m = /^\[(.+)\]$/.exec(part);
      if (!m) return part;
      const id = m[1], ok = graded ? checkBlank(blankOf(id), ans[id] ?? '') : null;
      const b = h('button', { class: 'blank' + (id === active && !graded ? ' on' : '') + (ok === true ? ' ok' : ok === false ? ' ng' : ''), type: 'button' }, h('i', {}, id), shown(id));
      b.dataset.blank = id;
      b.onclick = () => { if (graded) return; active = id; paint(); };
      return b;
    }))));
    if (graded) { editor.replaceChildren(); return; }
    const b = blankOf(active);
    const set = (v: string) => { ans[active] = v; sfx.tap(); paint(); };
    const head = h('p', { class: 'muted' }, `空欄 ${active}` + (b.unit ? `（単位：${b.unit}）` : '') + (b.type === 'formula' ? '　化学式で答えろ' : b.type === 'number' ? '　数値で答えろ（有効数字 2 桁が合えば正解）' : '　選べ'));
    const pad = b.type === 'choice' ? h('div', { class: 'chips' }, ...b.choices!.map((ch) => { const x = h('button', { class: 'chip plain' + (ans[active] === ch ? ' on' : ''), type: 'button' }, ch); x.onclick = () => set(ch); return x; }))
      : b.type === 'number' ? numPad((k) => set(typeNumber(ans[active] ?? '', k)))
      : formulaPad((k) => set(typeFormula(ans[active] ?? '', k)));
    editor.replaceChildren(head, pad);
  };
  const grade = h('button', { class: 'primary', type: 'button', id: 'p-grade' }, '採点する');
  grade.onclick = () => {
    graded = true;
    let gain = 0, right = 0;
    for (const b of p.blanks) {
      const ok = checkBlank(b, ans[b.id] ?? ''), k = `${p.id}:${b.id}`;
      if (ok) { right++; if (!w.cleared.includes(k)) { w.cleared.push(k); gain += 4; } }
      else w.mistakes.push({ machine: 'passage', recipe: k, part: 'passage', t: Date.now() });
    }
    w.points += gain;
    right === p.blanks.length ? sfx.goal() : sfx.bad();
    result.replaceChildren(h('p', { class: 'qtext' }, `${p.blanks.length} 問中 ${right} 問正解。` + (gain ? `研究点 +${gain}。` : '')),
      ...p.blanks.map((b) => h('div', { class: 'rx' }, h('b', {}, `${b.id}　${b.type === 'formula' ? pretty(String(b.answer)) : b.answer}${b.unit ? ' ' + b.unit : ''}`), h('p', { class: 'note' }, b.why))),
      h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'p-retry', onclick: () => showPassage(c, p) }, 'もう一度解く'),
        h('button', { class: 'ghost', type: 'button', onclick: () => showPassages(c) }, '一覧へ')));
    grade.hidden = true;
    paint();
  };
  paint();
  c.show(h('header', {}, h('h2', {}, p.title), h('button', { class: 'ghost', type: 'button', id: 'p-back', onclick: () => showPassages(c) }, '一覧へ')),
    h('p', {}, h('span', { class: 'pill' }, p.field)), body, editor, h('div', { class: 'row' }, grade), result);
}
