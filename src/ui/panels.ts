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
import { TANK_CAP, RESEARCH, RAIL_BOOST, maxCars, stationCap, stationRoutes, trainCap, SIGNALS, signalOn, doResearch, has, researchBlock, tierNeed, LINES, SRS_STEPS, STATION_CAP, TRAIN_CAP, UPGRADE_COST, railOf, stationTargets, beltSpeed, discover, dueIds, stationTarget, trainSpeed, extractInterval, machineRate, schedule, setChapter, type Ent, type UpgradeKey, type World } from '../engine/world';
import { researchById } from '../content/research';
import { appearance, lookOf } from '../content/looks';
import { AGENTS, ION_LABEL, ION_ORDER, MIXES, agentById, refusal, settleable, type Agent } from '../content/ions';
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
    h('h3', {}, `研究　${w.research.length} / ${RESEARCH.length}`),
    h('p', { class: 'muted' }, '工場づくりの道具と能力を開く。強化と同じく、研究点を払って計算問題を 1 問解く。「どちらか一方」の組は、工場の形に合うほうを選べ。あとで切り替えるには、もう一度払う。'),
    ...[1, 2, 3].map((tier) => h('div', { class: 'rs-tier' },
      h('div', { class: 'rs-head' }, h('b', {}, `第 ${tier} 段`), h('span', { class: 'muted' }, tierNeed(tier) ? (w.research.length >= tierNeed(tier) ? '開いている' : `研究を ${tierNeed(tier)} 個終えると開く（いま ${w.research.length} 個）`) : '最初から開いている')),
      h('div', { class: 'rs-grid' }, ...RESEARCH.filter((r) => r.tier === tier).map((r) => {
        const done = has(w, r.id), block = researchBlock(w, r);
        const rival = r.group ? RESEARCH.find((x) => x.group === r.group && x.id !== r.id && has(w, x.id)) : undefined;
        const btn = done ? h('span', { class: 'pill ok' }, '研究済み')
          : h('button', { class: 'primary', type: 'button', id: `rs-${r.id}`, disabled: !!block, onclick: () => askQuestion(c, `r:${r.id}`) }, rival ? `${r.cost} 点で切り替える` : `${r.cost} 点で研究`);
        return h('div', { class: 'rs-card' + (done ? ' done' : block && !done ? ' locked' : '') },
          h('div', { class: 'row' }, h('b', {}, r.name), r.group ? h('span', { class: 'pill' }, 'どちらか一方') : null),
          h('p', {}, r.text),
          rival ? h('p', { class: 'muted' }, `いまは「${rival.name}」を選んでいる。切り替えると、そちらは取り消される。`) : null,
          block && !done && !block.startsWith('研究点') ? h('p', { class: 'muted' }, block) : null,
          btn);
      })))),
  );
}

function pickQuestion(w: World): Question {
  const fresh = QUESTIONS.filter((q) => !w.solved.includes(q.id));
  const pool = fresh.length ? fresh : QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function askQuestion(c: PanelCtx, key: UpgradeKey | `r:${string}`, q = pickQuestion(c.w)) {
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
      if (key.startsWith('r:')) {
        const r = researchById(key.slice(2));
        if (!doResearch(w, key.slice(2))) { c.toast('研究できなかった。研究点か、先に要る研究を確かめろ。', 2600); showUpgrades(c); return; }
        c.toast(`正解。「${r?.name}」を研究した。`, 3200);
      } else {
        const k = key as UpgradeKey, cost = UPGRADE_COST[w.up[k]];
        w.points -= cost;
        w.up[k]++;
        c.toast('正解。強化した。', 2600);
      }
      if (!w.solved.includes(q.id)) w.solved.push(q.id);
      sfx.goal();
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

/** 物質の実際の色の見本 */
const swatch = (hex: string) => { const i = h('i', {}); i.style.background = hex; return i; };

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
      h('div', { class: 'stack tight' }, h('b', { class: s.formula ? 'formula' : '' }, label(id)), h('span', { class: 'muted' }, `${s.name}・${s.formula ? st[s.state] : '混合物など'}`), lookOf(id) ? h('span', { class: 'look' }, swatch(lookOf(id)!.hex), appearance(id)) : null)); }));
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
    h('h3', {}, '金属イオンの混合溶液（沈殿槽で系統分離する）'),
    h('div', { class: 'menu' }, ...MIXES.map((m, i) => h('button', { class: 'ghost' + (e.sub === m.id ? ' picked' : ''), type: 'button', id: `mix-${i}`, onclick: () => pick(m.id) },
      h('b', {}, m.name), h('span', { class: 'muted' }, `　${m.ions.map((k) => ION_LABEL[k]).join('・')}`)))),
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

// ---------------- 沈殿槽（金属イオンの系統分離）----------------

export function showSettler(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const { w } = c, again = () => showSettler(c, e, extra);
  const a = agentById(e.test);
  const waiting = [...(e.buf ?? []), ...(e.buf2 ?? [])];
  const why = e.bad ? (a && settleable(e.bad) ? refusal(e.bad, a) : null) ?? `${label(e.bad)} は受け取れない。沈殿槽に入れられるのは、金属イオンの混合溶液と、まじりの沈殿だけだ。` : '';
  const state = !a ? '試薬が決まっていない。下から選べ。' : e.bad ? why : e.busy ? `${label(e.item!.s)} に ${a.name} を加えている。` : waiting.length ? `出口が詰まっている（${waiting.map((x) => label(x)).join('、')}）。ろ液は正面、沈殿は右手から出る。` : '溶液を待っている。';
  const choose = (ag: Agent) => {
    if (w.agents.includes(ag.id)) { e.test = ag.id; e.bad = undefined; sfx.ok(); again(); return; }
    askAgent(c, e, ag, extra);
  };
  c.show(h('header', {}, h('h2', {}, '沈殿槽'), closeBtn(c)),
    a ? h('p', { class: 'eq' }, `試薬：${a.name}` + (a.group ? `　（第 ${a.group} 属を沈殿させる）` : '')) : null,
    h('p', { class: 'status', id: 'settler-status' }, state),
    a ? h('p', { class: 'note' }, a.note) : null,
    a ? h('div', { class: 'chips' }, ...ION_ORDER.filter((k) => a.ppt[k]).map((k) => { const b = chip(a.ppt[k]!); b.disabled = true; b.append(h('span', { class: 'muted' }, `${ION_LABEL[k]} → ${appearance(a.ppt[k]!)}`)); return b; })) : null,
    h('h3', {}, '加える試薬'),
    h('p', { class: 'muted' }, '1 台に 1 つ。初めて使う試薬は、何が沈殿するかを答えてから使える。試薬を正しい順に並べれば、イオンは 1 種類ずつ取り出せる。'),
    h('div', { class: 'menu' }, ...AGENTS.map((ag) => h('button', { class: 'ghost' + (e.test === ag.id ? ' picked on' : ''), type: 'button', id: `agent-${ag.id}`, onclick: () => choose(ag) },
      h('b', {}, ag.name), h('span', { class: 'muted' }, `　${ag.group ? `第 ${ag.group} 属` : ag.dissolve && !Object.keys(ag.ppt).length ? '溶かし分け' : ag.dissolve ? '溶かし分けにも使う' : '確認'}${w.agents.includes(ag.id) ? '' : '　（まだ使ったことがない）'}`)))),
    h('p', { class: 'muted' }, 'ろ液は正面（左）の出口、沈殿は右手（手前）の出口から出る。沈殿槽を一列に並べると、ろ液がまっすぐ次の槽へ流れ、沈殿が横へ出ていく。'),
    extra);
}

function askAgent(c: PanelCtx, e: Ent, ag: Agent, extra: HTMLElement, fails = 0, picked = new Set<string>(), msg = '') {
  const { w } = c;
  const redo = (m: string, f = fails) => askAgent(c, e, ag, extra, f, picked, m);
  const submit = () => {
    const ok = picked.size === ag.quiz.answer.length && ag.quiz.answer.every((x) => picked.has(x));
    if (!ok) {
      w.mistakes.push({ machine: 'analysis', recipe: `sep:${ag.id}`, part: 'quiz', t: Date.now() });
      sfx.bad();
      redo(fails >= 1 ? '違う。下の解説を読んでから、もう一度選べ。' : '違う。多すぎるか、足りない。沈殿する理由を 1 つずつ考えろ。', fails + 1);
      return;
    }
    w.agents.push(ag.id);
    w.points += fails === 0 ? 12 : 6;
    e.test = ag.id; e.bad = undefined;
    sfx.ok();
    c.toast(`正解。${ag.name} が使えるようになった。研究点 +${fails === 0 ? 12 : 6}。`, 3200);
    showSettler(c, e, extra);
  };
  c.show(h('header', {}, h('h2', {}, ag.name), h('button', { class: 'ghost', type: 'button', id: 'agent-back', onclick: () => showSettler(c, e, extra) }, '戻る')),
    h('p', { class: 'qtext' }, ag.quiz.text),
    h('div', { class: 'chips' }, ...ag.quiz.pool.map((x, i) => h('button', { class: 'chip plain' + (picked.has(x) ? ' on' : ''), type: 'button', id: `agent-opt-${i}`, onclick: () => { if (picked.has(x)) picked.delete(x); else picked.add(x); sfx.tap(); redo(''); } }, x))),
    msg ? h('p', { class: 'feedback', id: 'agent-msg' }, msg) : null,
    fails >= 2 ? h('p', { class: 'note' }, ag.note) : null,
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'agent-ok', onclick: submit }, '答える')));
}

// ---------------- 貯蔵タンク ----------------

export function showTank(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const again = () => showTank(c, e, extra);
  const n = (e.cnt || 0) + (e.rcn || 0), held = e.test === 'hold';
  c.show(h('header', {}, h('h2', {}, '貯蔵タンク'), closeBtn(c)),
    n && e.sub ? h('p', { class: 'eq' }, tokenIcon(e.sub, 26), ` ${sub(e.sub).name}　${n} / ${TANK_CAP} 個`) : h('p', { class: 'eq' }, `空（${TANK_CAP} 個まで入る）`),
    h('p', { class: 'status', id: 'tank-status' }, e.bad && n ? `${label(e.bad)} が来ているが、中身が ${label(e.sub!)} なので受け取れない。空にするか、別のタンクへ送れ。` : n >= TANK_CAP ? '満杯。これ以上は受け取れない。' : held ? '出口を閉じている。ためるだけで、出さない。' : n ? '正面の 2 つの口から出している。' : '最初に入ってきた物質が、このタンクの中身になる。'),
    h('div', { class: 'row' },
      h('button', { class: 'ghost' + (!held ? ' picked on' : ''), type: 'button', id: 'tank-open', onclick: () => { e.test = undefined; sfx.tap(); again(); } }, '出口を開く'),
      h('button', { class: 'ghost' + (held ? ' picked on' : ''), type: 'button', id: 'tank-hold', onclick: () => { e.test = 'hold'; sfx.tap(); again(); } }, '出口を閉じる（ためるだけ）')),
    n ? h('div', { class: 'row' }, h('button', { class: 'ghost warn', type: 'button', id: 'tank-empty', onclick: () => { e.cnt = 0; e.rcn = 0; e.sub = undefined; e.bad = undefined; sfx.erase(); again(); } }, '中身を捨てて空にする')) : null,
    h('p', { class: 'muted' }, '上流が速く下流が遅いときの緩衝や、あとで使う中間生成物の置き場に使う。「弁」と「検知器」を組み合わせれば、決めたときだけ流すこともできる。'),
    extra);
}

// ---------------- 検知器・弁 ----------------

export function showSignal(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const again = () => showSignal(c, e, extra);
  const sensor = e.kind === 'sensor', on = signalOn(c.w, e.ch);
  const users = [...c.w.ents.values()].filter((n) => (n.kind === 'sensor' || n.kind === 'gate') && n.ch === e.ch);
  const mode = (id: string, text: string) => h('button', { class: 'ghost' + (e.test === id ? ' picked on' : ''), type: 'button', id: `sg-${id}`, onclick: () => { e.test = id; sfx.ok(); again(); } }, text);
  c.show(h('header', {}, h('h2', {}, sensor ? '検知器' : '弁'), closeBtn(c)),
    h('p', { class: 'status' }, `${e.ch} 番の信号は、いま${on ? '点いている' : '消えている'}。同じ番号の検知器 ${users.filter((n) => n.kind === 'sensor').length} 個、弁 ${users.filter((n) => n.kind === 'gate').length} 個。`),
    h('h3', {}, '① 信号の番号'),
    h('p', { class: 'muted' }, sensor ? 'この検知器が点ける信号。同じ番号の弁が、どれだけ離れていても動く。' : 'この弁を動かす信号。同じ番号の検知器が点ける。'),
    h('div', { class: 'chips' }, ...Array.from({ length: SIGNALS }, (_, i) => {
      const b = h('button', { class: 'chip plain line' + (e.ch === i + 1 ? ' on' : ''), type: 'button', id: `sg-ch-${i + 1}`, onclick: () => { e.ch = i + 1; sfx.tap(); again(); } }, `${i + 1} 番`);
      b.style.setProperty('--line', LINE_COLORS[i]);
      return b;
    })),
    h('h3', {}, sensor ? '② 何を見張るか' : '② いつ通すか'),
    ...(sensor ? [
      h('div', { class: 'row' }, mode('jam', '詰まり（先が詰まって止まっている間、点く）')),
      h('p', { class: 'muted' }, 'または、決めた物質が通ったら 3 秒間点く：'),
      h('div', { class: 'chips' }, ...c.w.discovered.filter((x) => x !== 'e' && !sub(x).mask && !x.startsWith('jar-')).map((x) => {
        const b = chip(x, e.test === `is:${x}` ? 'on' : '');
        b.id = `sg-is-${x}`;
        b.onclick = () => { e.test = `is:${x}`; sfx.ok(); again(); };
        return b;
      })),
    ] : [h('div', { class: 'row' }, mode('on', '信号が来ている間だけ通す'), mode('off', '信号が来ていない間だけ通す'))]),
    h('p', { class: 'muted' }, '使い方の例：主製品のベルトに検知器（詰まり）を置き、副生成物の捨て口の手前に同じ番号の弁（来ている間だけ通す）を置く。ふだんは全部を製品にし、あふれたときだけ捨てる。'),
    extra);
}

// ---------------- 貨物駅 ----------------


export function showStation(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const again = () => showStation(c, e, extra);
  const role = (id: 'in' | 'out', text: string) => h('button', { class: 'ghost' + (e.role === id ? ' picked on' : ''), type: 'button', id: `st-role-${id}`, onclick: () => { e.role = id; e.buf = []; e.tr = undefined; e.xtr = undefined; sfx.ok(); again(); } }, text);
  const routes = e.role === 'in' ? stationRoutes(c.w, e) : [], route = routes[0] ?? null, to = route?.dest ?? null, laid = !!route?.custom;
  const speedOn = (custom: boolean) => trainSpeed(c.w) * (custom ? RAIL_BOOST : 1);
  const held = [e.tr, ...(e.xtr ?? [])].filter((t) => t?.held).length;
  const feeders = e.role === 'out' ? [...c.w.ents.values()].filter((n) => n.kind === 'station' && n.role === 'in' && n.ch === e.ch).length : 0;
  const buf = (e.buf ?? []).map((s) => (s.startsWith('!') ? s.slice(1) : s));
  const kinds = [...new Set(buf)];
  c.show(h('header', {}, h('h2', {}, '貨物駅'), closeBtn(c)),
    h('h3', {}, '① 役割'),
    h('div', { class: 'row' }, role('in', '積む駅（ここから運び出す）'), role('out', '降ろす駅（ここへ届く）')),
    h('h3', {}, '② 路線番号'),
    h('p', { class: 'muted' }, '同じ番号の「積む駅」と「降ろす駅」が結ばれる。積む駅は、同じ番号のいちばん近い降ろす駅へ運ぶ。'),
    h('div', { class: 'chips' }, ...Array.from({ length: LINES }, (_, i) => {
      const b = h('button', { class: 'chip plain line' + (e.ch === i + 1 ? ' on' : ''), type: 'button', id: `st-line-${i + 1}`, onclick: () => { e.ch = i + 1; e.tr = undefined; e.xtr = undefined; sfx.tap(); again(); } }, `${i + 1} 番線`);
      b.style.setProperty('--line', LINE_COLORS[i]);
      return b;
    })),
    h('p', { class: 'status' }, e.role === 'in'
      ? (to && route ? `行き先：線路 ${Math.round(route.len)} マス先の降ろす駅（${route.custom ? '敷いた線路' : '自動の仮線路'}）。片道 約 ${(route.len / speedOn(route.custom)).toFixed(1)} 秒、1 編成 ${trainCap(c.w)} 個で、1 分あたり およそ ${Math.round(((e.cars || 1) * trainCap(c.w) * 60) / ((2 * route.len) / speedOn(route.custom) + 1))} 個まで運べる。${held ? `いま ${held} 編成が、前の列車を待って止まっている。幹線が混んでいる。` : ''}` : `${e.ch} 番線の「降ろす駅」がまだない。届け先に貨物駅を置き、同じ番線の「降ろす駅」にしろ。`)
      : `${e.ch} 番線の積む駅：${feeders} か所。届いたものは、正面の 2 つの口から出る。${(e.buf?.length ?? 0) >= stationCap(c.w) ? '満杯で、列車が降ろせずに待っている。出口にベルトをつなげ。' : ''}`),
    e.role === 'in' ? h('h3', {}, '③ 編成の数') : null,
    e.role === 'in' ? h('div', { class: 'row' }, ...Array.from({ length: maxCars(c.w) }, (_, i) => i + 1).map((n) => h('button', { class: 'ghost' + ((e.cars || 1) === n ? ' picked on' : ''), type: 'button', id: `st-cars-${n}`, onclick: () => { e.cars = n; sfx.tap(); again(); } }, `${n} 編成`)), h('span', { class: 'muted' }, '増やすと、そのぶん多く運べる。')) : null,
    e.role === 'in' && routes.length > 1 ? h('p', { class: 'muted' }, `行き先は ${routes.length} か所。列車は順番に配る（分岐）。`) : null,
    e.role === 'in' ? h('p', { class: 'muted' }, laid ? `敷いた線路でつながっている降ろす駅：${routes.length} か所。線路でつながる駅があるあいだは、そこだけへ送る。線路はほかの駅の列車と共有するので、混むと待ちが出る。待ちが多ければ、線路をもう 1 本敷いて分けろ。` : '線路は自動で仮に引かれる。道具「線路」で駅から駅まで敷くと、1.5 倍の速さで走り、行き先も線路でつながる駅だけになる。線路は枝分かれさせて、何駅でも共有できる。') : null,
    h('p', { class: 'muted' }, `駅にあるもの：${buf.length} / ${stationCap(c.w)} 個`),
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
