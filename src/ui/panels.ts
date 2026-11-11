import { ELEMENTS } from '../content/elements';
import { LINE_COLORS, MACHINES } from '../content/machines';
import { CONDITIONS, electronsOf, recipeById, RECIPES } from '../content/recipes';
import { isCorrect, QUESTIONS, type Question } from '../content/questions';
import { label, sub } from '../content/substances';
import { CHAPTERS } from '../content/goals';
import { KNOWLEDGE } from '../content/knowledge';
import { PASSAGES, checkBlank, type Passage } from '../content/passages';
import { REAGENTS, SETS, TESTS, testById } from '../content/samples';
import { SYLLABUS, coverageOf, type Unit } from '../content/syllabus';
import { pretty } from '../chem/formula';
import { LINES, SRS_STEPS, STATION_CAP, TRAIN_CAP, UPGRADE_COST, railOf, stationTargets, beltSpeed, discover, dueIds, stationTarget, trainSpeed, extractInterval, machineRate, schedule, setChapter, type Ent, type UpgradeKey, type World } from '../engine/world';
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
    const name = m.machine === 'drill' ? `連鎖計算：${m.recipe ?? ''}` : m.machine === 'structure' ? `構造決定：${m.recipe ?? ''}`
      : m.machine === 'calc' ? QUESTIONS.find((q) => q.id === m.recipe)?.topic ?? '計算'
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
  const times = Object.entries(w.goalMs).map(([k, ms]) => { const [ch, i] = k.split(':').map(Number); const g = CHAPTERS[ch]?.goals[i]; return [g ? `${CHAPTERS[ch].name.split(' ')[0]}　${sub(g.s).name}` : k, ms] as [string, number]; })
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  c.show(
    h('header', {}, h('h2', {}, '記録'), closeBtn(c)),
    h('h3', {}, '間違えたところ（多い順）'),
    rows.length
      ? h('table', { class: 'log' }, ...rows.map(([k, n]) => { const [a, b] = k.split('｜'); return h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', { class: 'n' }, `${n}回`)); }))
      : h('p', { class: 'muted' }, 'まだ間違いはない。'),
    h('p', { class: 'muted' }, '回数の多いものから、反応式と条件を紙に書いて確認しろ。図鑑の「反応」に解説がある。'),
    h('h3', {}, '時間のかかった指令'),
    times.length ? h('table', { class: 'log' }, ...times.map(([name, ms]) => h('tr', {}, h('td', {}, name), h('td', { class: 'n' }, `${Math.max(1, Math.round(ms / 60000))} 分`)))) : h('p', { class: 'muted' }, '—'),
    h('h3', {}, 'これまでの納品'),
    delivered.length ? h('div', { class: 'chips' }, ...delivered.map(([s, n]) => { const b = chip(s); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${n}`)); return b; })) : h('p', { class: 'muted' }, '—'),
  );
}

// ---------------- 範囲表 ----------------

/** 項目ごとの進み具合。反応は正しく設定できた数、計算は解いた数、知識は復習で正解した数、リード文は埋めた空欄の数 */
export function unitProgress(w: World, u: Unit) {
  const c = coverageOf(u);
  const blanks = c.passages.flatMap((p) => p.blanks.map((b) => `${p.id}:${b.id}`));
  const done = c.recipes.filter((r) => w.learned.includes(r.id)).length + c.questions.filter((q) => w.solved.includes(q.id)).length
    + c.knowledge.filter((k) => (w.srs[`k:${k.id}`]?.iv ?? 0) >= 1).length + blanks.filter((b) => w.cleared.includes(b)).length
    + c.practice.filter((id) => (w.practice[id]?.clean ?? 0) >= 1).length;
  const total = c.recipes.length + c.questions.length + c.knowledge.length + blanks.length + c.practice.length;
  return { c, done, total };
}

function bar(f: number): HTMLElement {
  const i = h('i', {});
  i.style.width = `${Math.round(f * 100)}%`;
  return h('span', { class: 'syl-bar' }, i);
}

export function showSyllabus(c: PanelCtx) {
  const { w } = c;
  let all = 0, got = 0;
  const groups = new Map<string, HTMLElement[]>();
  for (const u of SYLLABUS) {
    const { c: cov, done, total } = unitProgress(w, u);
    all += total; got += done;
    const parts = [cov.recipes.length ? `反応 ${cov.recipes.length}` : '', cov.sets.length ? `仕分け ${cov.sets.length} 組` : '', cov.questions.length ? `計算 ${cov.questions.length}` : '',
      cov.knowledge.length ? `知識 ${cov.knowledge.length}` : '', cov.passages.length ? `リード文 ${cov.passages.length}` : '', cov.practice.length ? `演習 ${cov.practice.length} 型` : ''].filter(Boolean).join('・');
    const row = h('details', { class: 'syl' },
      h('summary', {}, h('span', { class: 'syl-t' }, u.title), h('span', { class: 'syl-n' }, `${done} / ${total}`),
        bar(total ? done / total : 0)),
      h('p', { class: 'muted' }, u.points),
      h('p', { class: 'note' }, parts),
      cov.recipes.length ? h('p', { class: 'syl-list' }, ...cov.recipes.map((r) => h('span', { class: w.learned.includes(r.id) ? 'got' : '' }, r.name))) : null,
      cov.sets.length ? h('p', { class: 'syl-list' }, ...cov.sets.map((x) => h('span', {}, `仕分け：${x.name}`))) : null,
    );
    const k = `${u.subject}　${u.section}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }
  c.show(
    h('header', {}, h('h2', {}, '範囲表'), closeBtn(c)),
    h('p', {}, `高等学校学習指導要領の「化学基礎」14 項目と「化学」20 項目に、このゲームの内容を割り当てた表。全体の進み具合は `, h('b', {}, `${got} / ${all}`), '。'),
    h('p', { class: 'muted' }, '数字は、正しく設定できた反応・解いた計算問題・復習で正解した知識問題・埋めたリード文の空欄・全問正解したことのある演習の型の合計。項目をタップすると中身が開く。'),
    ...[...groups].flatMap(([k, rows]) => [h('h3', {}, k), ...rows]),
  );
}

// ---------------- 入力用のキー ----------------

export function numPad(press: (k: string) => void): HTMLElement {
  return h('div', { class: 'keys numpad' }, ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '−', '0', '.'].map((k) =>
    h('button', { class: 'key n', type: 'button', onclick: () => press(k) }, k)),
    h('button', { class: 'key fn wide', type: 'button', onclick: () => press('⌫') }, '⌫'));
}
export function typeNumber(text: string, k: string): string {
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
  const GROUP = { theory: '原子・結合・結晶・溶液の検査', ion: '無機物質の検査', organic: '有機化合物・高分子の検査', amino: 'アミノ酸・ペプチドの検査', nucleic: '核酸の塩基の検査' } as const;
  const cur = testById(e.test);
  c.show(h('header', {}, h('h2', {}, '分析器'), closeBtn(c)),
    cur ? h('div', { class: 'answer' }, h('p', {}, h('b', {}, `いまの検査：${cur.name}`)), h('p', {}, `陽性（正面へ）：${cur.sees}`), h('p', { class: 'muted' }, 'そうならなかったものは陰性として右手へ出る。'),
      h('details', { class: 'named' }, h('summary', {}, 'この検査でわかること（まず自分で思い出せ）'), h('p', { class: 'note' }, cur.means)))
      : e.test?.startsWith('is:') ? h('div', { class: 'answer' }, h('p', {}, h('b', {}, `いまの設定：${sub(e.test.slice(3)).name} だけを正面へ通す`)), h('p', { class: 'muted' }, 'それ以外は右手へ出る。'))
      : h('p', {}, '物質を指定するか、行う検査を 1 つ選べ。当てはまるものは正面、そうでないものは右手へ流れる。'),
    h('h3', {}, '物質を指定して分ける（選別）'),
    h('p', { class: 'muted' }, '1 本のベルトに混ざった物質から、指定したものだけを抜き出す。副生成物を別々の行き先へ振り分けるのに使う。'),
    h('div', { class: 'chips' }, ...c.w.discovered.filter((s) => s !== 'e' && !sub(s).mask && !s.startsWith('jar-')).map((s) => {
      const b = chip(s, e.test === `is:${s}` ? 'on' : '');
      b.id = `is-${s}`;
      b.onclick = () => { e.test = `is:${s}`; sfx.ok(); showAnalyzer(c, e, extra); };
      return b;
    })),
    ...(Object.keys(GROUP) as (keyof typeof GROUP)[]).flatMap((g) => [
      h('h3', {}, GROUP[g]),
      h('div', { class: 'menu' }, ...TESTS.filter((t) => t.group === g).map((t) =>
        h('button', { class: 'ghost' + (e.test === t.id ? ' picked' : ''), type: 'button', id: `test-${t.id}`, onclick: () => { e.test = t.id; sfx.ok(); showAnalyzer(c, e, extra); } }, t.name))),
    ]),
    extra);
}

// ---------------- 貨物駅 ----------------


export function showStation(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const again = () => showStation(c, e, extra);
  const role = (id: 'in' | 'out', text: string) => h('button', { class: 'ghost' + (e.role === id ? ' picked on' : ''), type: 'button', id: `st-role-${id}`, onclick: () => { e.role = id; e.buf = []; e.tr = undefined; e.rail = undefined; e.railTo = undefined; sfx.ok(); again(); } }, text);
  const route = e.role === 'in' ? railOf(c.w, e) : null, to = route?.dest ?? null;
  const feeders = e.role === 'out' ? [...c.w.ents.values()].filter((n) => n.kind === 'station' && n.role === 'in' && n.ch === e.ch).length : 0;
  const buf = (e.buf ?? []).map((s) => (s.startsWith('!') ? s.slice(1) : s));
  const kinds = [...new Set(buf)];
  c.show(h('header', {}, h('h2', {}, '貨物駅'), closeBtn(c)),
    h('h3', {}, '① 役割'),
    h('div', { class: 'row' }, role('in', '積む駅（ここから運び出す）'), role('out', '降ろす駅（ここへ届く）')),
    h('h3', {}, '② 路線番号'),
    h('p', { class: 'muted' }, '同じ番号の「積む駅」と「降ろす駅」が結ばれる。積む駅は、同じ番号のいちばん近い降ろす駅へ運ぶ。'),
    h('div', { class: 'chips' }, ...Array.from({ length: LINES }, (_, i) => {
      const b = h('button', { class: 'chip plain line' + (e.ch === i + 1 ? ' on' : ''), type: 'button', id: `st-line-${i + 1}`, onclick: () => { e.ch = i + 1; e.tr = undefined; e.rail = undefined; e.railTo = undefined; sfx.tap(); again(); } }, `${i + 1} 番線`);
      b.style.setProperty('--line', LINE_COLORS[i]);
      return b;
    })),
    h('p', { class: 'status' }, e.role === 'in'
      ? (to && route ? `行き先：線路 ${Math.round(route.len)} マス先の降ろす駅（${route.custom ? '自分で敷いた線路' : '自動で引いた線路'}）。片道 約 ${(route.len / trainSpeed(c.w)).toFixed(1)} 秒、1 編成 ${TRAIN_CAP} 個で、1 分あたり およそ ${Math.round(((e.cars || 1) * TRAIN_CAP * 60) / ((2 * route.len) / trainSpeed(c.w) + 1))} 個まで運べる。列車は ${e.tr && (e.tr.p > 0 || e.tr.back) ? (e.tr.back ? '戻っている' : `${e.tr.cargo.length} 個を運んでいる`) : '駅で積んでいる'}。` : `${e.ch} 番線の降ろす駅がまだない。行き先に貨物駅を置き、「降ろす駅」にして同じ番号にしろ。`)
      : `${e.ch} 番線の積む駅：${feeders} か所。届いたものは、正面の 2 つの口から出る。${(e.buf?.length ?? 0) >= STATION_CAP ? '満杯で、列車が降ろせずに待っている。出口にベルトをつなげ。' : ''}`),
    e.role === 'in' ? h('h3', {}, '③ 編成の数') : null,
    e.role === 'in' ? h('div', { class: 'row' }, ...[1, 2, 3].map((n) => h('button', { class: 'ghost' + ((e.cars || 1) === n ? ' picked on' : ''), type: 'button', id: `st-cars-${n}`, onclick: () => { e.cars = n; sfx.tap(); again(); } }, `${n} 編成`)), h('span', { class: 'muted' }, '増やすと、そのぶん多く運べる。')) : null,
    e.role === 'in' && !e.rail && stationTargets(c.w, e).length > 1 ? h('p', { class: 'muted' }, `この番線には降ろす駅が ${stationTargets(c.w, e).length} か所ある。列車は順番に配る（分岐）。1 か所だけに送りたいときは、線路を自分で敷け。`) : null,
    e.role === 'in' ? h('p', { class: 'muted' }, '線路は自動で引かれる。道筋を自分で決めたいときは、道具「線路」で、この駅から降ろす駅まで指でなぞれ。') : null,
    e.rail ? h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'st-auto', onclick: () => { e.rail = undefined; e.railTo = undefined; e.tr = undefined; sfx.tap(); again(); } }, '線路を自動に戻す')) : null,
    h('p', { class: 'muted' }, `駅にあるもの：${buf.length} / ${STATION_CAP} 個`),
    kinds.length ? h('div', { class: 'chips' }, ...kinds.map((s) => { const b = chip(s); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${buf.filter((x) => x === s).length}`)); return b; })) : null,
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
        h('span', {}, h('b', {}, ch.name), h('span', { class: 'muted' }, g ? `　次：${[g.s, ...(g.also ?? [])].map((x) => sub(x).name).join('・')}` : '　完了')),
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
