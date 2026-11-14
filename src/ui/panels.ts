import { ELEMENTS } from '../content/elements';
import { lineColor, MACHINES } from '../content/machines';
import { CONDITIONS, recipeById, RECIPES } from '../content/recipes';
import { isCorrect, QUESTIONS, type Question } from '../content/questions';
import { label, sub } from '../content/substances';
import { CHAPTERS } from '../content/goals';
import { KNOWLEDGE } from '../content/knowledge';
import { PASSAGES, checkBlank, type Passage } from '../content/passages';
import { REAGENTS, SETS, TESTS, testById } from '../content/samples';
import { SYLLABUS, coverageOf, type Unit } from '../content/syllabus';
import { pretty } from '../chem/formula';
import { TANK_CAP, RESEARCH, credit, RAIL_BOOST, maxCars, stationCap, stationDests, trainCap, LINE_MAX, freeLine, lineNo, signalOn, doResearch, has, researchBlock, tierNeed, STATION_CAP, TRAIN_CAP, UPGRADE_COST, railOf, stationTargets, beltSpeed, discover, dueIds, stationTarget, trainSpeed, extractInterval, machineRate, schedule, setChapter, setStationRole, type Ent, type UpgradeKey, type World } from '../engine/world';
import { applyTestOut, canTestOut, paceOf, testOutPass, testOutQuiz } from '../engine/pace';
import { quizFor } from '../engine/quiz';
import { calibLine, solveList } from './review';
import { LEECH, leeches } from '../engine/habit';
import { calibAdvice, chapterMastery } from '../engine/learn';
import { researchById } from '../content/research';
import { appearance } from '../content/looks';
import { AGENTS, ION_LABEL, ION_ORDER, MIXES } from '../content/ions';
import { ORG as ORGANICS, ORG_MIXES, WASHES } from '../content/extract';
import { AMINO, AMINO_MIXES, AMINO_ORDER, PH_MAX, PH_MIN, PI_BAND, POLE_NAME, phOf, poleAt, type AminoKey, type Pole } from '../content/phoresis';
import { sepAccepts, sepRefusal } from '../content/sep';
import { chip, openConfig, type SheetActions } from './config';
import { bookRx, bookSubs, bookTerms, logMore, logTop, masteryText } from './learn2';
import { h } from './dom';
import { sfx } from './sound';
import { elementIcon, tokenIcon } from './token';
import { researchMap } from './resmap';
import { showGoalLog } from './goals';

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
    researchMap(w),
    ...[1, 2, 3].map((tier) => h('div', { class: 'rs-tier' },
      h('div', { class: 'rs-head' }, h('b', {}, `第 ${tier} 段`), h('span', { class: 'muted' }, tierNeed(tier) ? (w.research.length >= tierNeed(tier) ? '開いている' : `研究を ${tierNeed(tier)} 個終えると開く（いま ${w.research.length} 個）`) : '最初から開いている')),
      h('div', { class: 'rs-grid' }, ...RESEARCH.filter((r) => r.tier === tier).map((r) => {
        const done = has(w, r.id), block = researchBlock(w, r);
        const rival = r.group ? RESEARCH.find((x) => x.group === r.group && x.id !== r.id && has(w, x.id)) : undefined;
        const btn = done ? h('span', { class: 'pill ok' }, '研究済み')
          : h('button', { class: 'primary', type: 'button', id: `rs-${r.id}`, disabled: !!block, onclick: () => askQuestion(c, `r:${r.id}`) }, rival ? `${r.cost} 点で切り替える` : `${r.cost} 点で研究`);
        return h('div', { class: 'rs-card' + (done ? ' done' : block && !done ? ' locked' : ''), id: `rsc-${r.id}` },
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

/** 図鑑。物質は名前・化学式で探せる。反応は装置で絞り、並べ替え、係数と生成物を書いて練習できる。用語は知識問題のカード（src/ui/learn2.ts） */
export function showBook(c: PanelCtx, tab: 'el' | 'sub' | 'rx' | 'term' = 'el') {
  const { w } = c;
  const tabs = h('div', { class: 'tabs' }, ...([['el', '元素の形'], ['sub', '物質'], ['rx', '反応'], ['term', '用語カード']] as const).map(([id, name]) =>
    h('button', { class: 'chip plain' + (id === tab ? ' on' : ''), type: 'button', id: `book-${id}`, onclick: () => showBook(c, id) }, name)));
  const again = () => { const top = c.sheet.scrollTop; showBook(c, tab); c.sheet.scrollTop = top; };
  const body: (HTMLElement | null)[] = tab === 'el'
    ? [h('div', { class: 'grid' }, ...ELEMENTS.map((el) => h('div', { class: 'card' }, elementIcon(el.sym, 34),
      h('div', { class: 'stack tight' }, h('b', {}, `${el.sym}　${el.name}`), h('span', { class: 'muted' }, el.why)))))]
    : tab === 'sub' ? bookSubs(w) : tab === 'rx' ? bookRx(c, again) : bookTerms(c, again);
  c.show(h('header', {}, h('h2', {}, '図鑑'), closeBtn(c)), tabs,
    tab === 'el' ? h('p', { class: 'muted' }, '物質の絵柄は、元素の形の組み合わせでできている。原子が多い物質は、元素ごとに 1 つの形と個数で表す。台の形は常温での状態（丸＝気体、しずく＝液体、角丸の四角＝固体）で、破線は混合物や高分子。')
      : tab === 'rx' ? h('p', { class: 'muted' }, `正しく設定できた反応：${w.learned.length} / ${RECIPES.length}。タップすると解説が開く。`) : null,
    ...body);
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
  const weak = leeches(w);
  const hcIds = (() => { const seen = new Set<string>(); return [...w.hcLog].reverse().filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).map((x) => x.id); })();
  // 学習時間の目標・練習の順番・まちがえた単元などは src/ui/learn2.ts。切り替えたら、同じ所を見たまま描き直す
  const again = () => { const top = c.sheet.scrollTop; showLog(c); c.sheet.scrollTop = top; };
  c.show(
    h('header', {}, h('h2', {}, '記録'), closeBtn(c)),
    ...logTop(c, again),
    h('h3', {}, `苦手（${LEECH} 回以上忘れた問い）`),
    weak.length
      ? h('table', { class: 'log' }, ...weak.slice(0, 12).map((id) => { const q = quizFor(w, id, () => 0.5, id.startsWith('k:') ? undefined : 'products'); return h('tr', {}, h('td', {}, q ? q.q : id), h('td', {}, q?.choices[0] ?? ''), h('td', { class: 'n' }, `${w.srs[id].l} 回`)); }))
      : h('p', { class: 'muted' }, 'まだない。'),
    weak.length ? h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'log-weak', onclick: () => solveList(c, '苦手を練習', weak, true, () => undefined) }, `いま解く（${Math.min(10, weak.length)} 問・練習）`)) : null,
    weak.length ? h('p', { class: 'muted' }, '何度も忘れるものは、覚え方が合っていない。答えのあとの解説を読み、反応式を紙に 1 回書いてから次へ進め。') : null,
    h('h3', {}, '間違えたところ（多い順）'),
    rows.length
      ? h('table', { class: 'log' }, ...rows.map(([k, n]) => { const [a, b] = k.split('｜'); return h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', { class: 'n' }, `${n}回`)); }))
      : h('p', { class: 'muted' }, 'まだ間違いはない。'),
    h('p', { class: 'muted' }, '回数の多いものから、反応式と条件を紙に書いて確認しろ。図鑑の「反応」に解説がある。'),
    h('h3', {}, '自信を持ってまちがえたもの（新しい順）'),
    (() => {
      const seen = new Set<string>(), list = [...w.hcLog].reverse().filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 15);
      return list.length ? h('table', { class: 'log' }, ...list.map((x) => { const q = quizFor(w, x.id, () => 0.5, x.id.startsWith('k:') ? undefined : 'products'); return h('tr', {}, h('td', {}, q ? q.q : x.id), h('td', {}, q?.choices[0] ?? '')); }))
        : h('p', { class: 'muted' }, 'まだない。');
    })(),
    hcIds.length ? h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'log-hc', onclick: () => solveList(c, '自信を持ってまちがえた問いを練習', hcIds, true) }, `この一覧を解く（${Math.min(10, hcIds.length)} 問・練習）`)) : null,
    h('p', { class: 'muted' }, `自信ごとの正答率　${calibLine(w)}。「確実」の正答率が 9 割を切るなら、思い込みでまちがえている。勘で当たった ${w.calib.guess[1]} 回は、覚えたことにしていない。`),
    h('p', { class: 'rv-advice', id: 'log-advice' }, calibAdvice(w).text),
    ...logMore(c, again),
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
    h('button', { class: 'key n', type: 'button', id: `pad-${k}`, onclick: () => press(k) }, k)),
    h('button', { class: 'key fn wide', type: 'button', id: 'pad-del', onclick: () => press('⌫') }, '⌫'));
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
    h('h3', {}, '芳香族化合物のエーテル溶液（分液ろうとで抽出する）'),
    h('div', { class: 'menu' }, ...ORG_MIXES.map((m, i) => h('button', { class: 'ghost' + (e.sub === m.id ? ' picked' : ''), type: 'button', id: `orgmix-${i}`, onclick: () => pick(m.id) },
      h('b', {}, m.name), h('span', { class: 'muted' }, `　${m.keys.map((k) => ORGANICS[k].name).join('・')}`)))),
    h('h3', {}, 'アミノ酸の混合水溶液（電気泳動槽で分ける）'),
    h('div', { class: 'menu' }, ...AMINO_MIXES.map((m, i) => h('button', { class: 'ghost' + (e.sub === m.id ? ' picked' : ''), type: 'button', id: `aminomix-${i}`, onclick: () => pick(m.id) },
      h('b', {}, m.name), h('span', { class: 'muted' }, `　${m.keys.map((k) => `${AMINO[k].name}（等電点 ${AMINO[k].pI.toFixed(1)}）`).join('・')}`)))),
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

// ---------------- 分ける装置：沈殿槽（金属イオンの系統分離）・分液ろうと（芳香族の抽出）----------------

/** 試薬を 1 つ選んで使う装置の、画面に出す形 */
interface AgentView { id: string; name: string; tag: string; quiz?: { text: string; pool: string[]; answer: string[] }; note: string; chips: [string, string][] }
const SEP_VIEW: Record<'settler' | 'funnel', { title: string; pick: string; lead: string; ports: string; only: string; agents: AgentView[] }> = {
  settler: {
    title: '沈殿槽', pick: '加える試薬',
    lead: '1 台に 1 つ。初めて使う試薬は、何が沈殿するかを答えてから使える。試薬を正しい順に並べれば、イオンは 1 種類ずつ取り出せる。',
    ports: 'ろ液は正面（左）の出口、沈殿は右手（手前）の出口から出る。沈殿槽を一列に並べると、ろ液がまっすぐ次の槽へ流れ、沈殿が横へ出ていく。',
    only: '沈殿槽に入れられるのは、金属イオンの混合溶液と、まじりの沈殿だけだ。',
    agents: AGENTS.map((a) => ({ id: a.id, name: a.name, quiz: a.quiz, note: a.note,
      tag: a.group ? `第 ${a.group} 属` : a.dissolve && !Object.keys(a.ppt).length ? '溶かし分け' : a.dissolve ? '溶かし分けにも使う' : '確認',
      chips: ION_ORDER.filter((k) => a.ppt[k]).map((k) => [a.ppt[k]!, `${ION_LABEL[k]} → ${appearance(a.ppt[k]!)}`] as [string, string]) })),
  },
  funnel: {
    title: '分液ろうと', pick: '加えるもの・操作',
    lead: '1 台に 1 つ。初めて使う水溶液は、何が水層へ移るかを答えてから使える。',
    ports: 'エーテル層（上層）は正面（左）の出口、水層（下層）は右手（手前）の出口から出る。水層に出た塩は、反応器で酸や塩基を加えると元の化合物に戻る。',
    only: '分液ろうとに入れられるのは、芳香族化合物のエーテル溶液と、その塩の水溶液だけだ。',
    agents: WASHES.map((a) => ({ id: a.id, name: a.name, quiz: a.quiz, note: a.note, tag: a.id === 'x-evap' ? '取り出す' : a.id === 'x-co2' ? '水層に使う' : 'エーテル層に使う',
      chips: a.moves.map((k) => [ORGANICS[k].salt!, `${ORGANICS[k].name} → ${ORGANICS[k].saltName}`] as [string, string]) })),
  },
};

export function showSettler(c: PanelCtx, e: Ent, extra: HTMLElement) {
  const { w } = c, again = () => showSettler(c, e, extra);
  const kind = e.kind as 'settler' | 'funnel', V = SEP_VIEW[kind], a = V.agents.find((x) => x.id === e.test);
  const waiting = [...(e.buf ?? []), ...(e.buf2 ?? [])];
  const why = e.bad ? (a && sepAccepts(kind, e.bad) ? sepRefusal(kind, e.bad, e.test) : null) ?? `${label(e.bad)} は受け取れない。${V.only}` : '';
  const state = !a ? '何を加えるかが決まっていない。下から選べ。' : e.bad ? why : e.busy ? `${label(e.item!.s)} に ${a.name}。` : waiting.length ? `出口が詰まっている（${waiting.map((x) => label(x)).join('、')}）。` : '溶液を待っている。';
  const choose = (ag: AgentView) => {
    if (!ag.quiz || w.agents.includes(ag.id)) { e.test = ag.id; e.bad = undefined; sfx.ok(); again(); return; }
    askAgent(c, e, ag, extra);
  };
  c.show(h('header', {}, h('h2', {}, V.title), closeBtn(c)),
    a ? h('p', { class: 'eq' }, `${a.name}` + (a.tag ? `　（${a.tag}）` : '')) : null,
    h('p', { class: 'status', id: 'settler-status' }, state),
    a ? h('p', { class: 'note' }, a.note) : null,
    a && a.chips.length ? h('div', { class: 'chips' }, ...a.chips.map(([id, text]) => { const b = chip(id); b.disabled = true; b.append(h('span', { class: 'muted' }, text)); return b; })) : null,
    h('h3', {}, V.pick),
    h('p', { class: 'muted' }, V.lead),
    h('div', { class: 'menu' }, ...V.agents.map((ag) => h('button', { class: 'ghost' + (e.test === ag.id ? ' picked on' : ''), type: 'button', id: `agent-${ag.id}`, onclick: () => choose(ag) },
      h('b', {}, ag.name), h('span', { class: 'muted' }, `　${ag.tag}${!ag.quiz || w.agents.includes(ag.id) ? '' : '　（まだ使ったことがない）'}`)))),
    h('p', { class: 'muted' }, V.ports),
    extra);
}

function askAgent(c: PanelCtx, e: Ent, ag: AgentView, extra: HTMLElement, fails = 0, picked = new Set<string>(), msg = '') {
  const { w } = c, quiz = ag.quiz!;
  const redo = (m: string, f = fails) => askAgent(c, e, ag, extra, f, picked, m);
  const submit = () => {
    const ok = picked.size === quiz.answer.length && quiz.answer.every((x) => picked.has(x));
    if (!ok) {
      w.mistakes.push({ machine: 'analysis', recipe: `sep:${ag.id}`, part: 'quiz', t: Date.now() });
      sfx.bad();
      redo(fails >= 1 ? '違う。下の解説を読んでから、もう一度選べ。' : '違う。多すぎるか、足りない。理由を 1 つずつ考えろ。', fails + 1);
      return;
    }
    w.agents.push(ag.id);
    credit(w, fails === 0 ? 12 : 6);
    e.test = ag.id; e.bad = undefined;
    sfx.ok();
    c.toast(`正解。${ag.name} が使えるようになった。研究点 +${fails === 0 ? 12 : 6}。`, 3200);
    showSettler(c, e, extra);
  };
  c.show(h('header', {}, h('h2', {}, ag.name), h('button', { class: 'ghost', type: 'button', id: 'agent-back', onclick: () => showSettler(c, e, extra) }, '戻る')),
    h('p', { class: 'qtext' }, quiz.text),
    h('div', { class: 'chips' }, ...quiz.pool.map((x, i) => h('button', { class: 'chip plain' + (picked.has(x) ? ' on' : ''), type: 'button', id: `agent-opt-${i}`, onclick: () => { if (picked.has(x)) picked.delete(x); else picked.add(x); sfx.tap(); redo(''); } }, x))),
    msg ? h('p', { class: 'feedback', id: 'agent-msg' }, msg) : null,
    fails >= 2 ? h('p', { class: 'note' }, ag.note) : null,
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'agent-ok', onclick: submit }, '答える')));
}

// ---------------- 電気泳動槽（アミノ酸）----------------

export function showPhoresis(c: PanelCtx, e: Ent, extra: HTMLElement, draft?: number, guess: Partial<Record<AminoKey, Pole>> = {}, msg = '') {
  const { w } = c, cur = phOf(e.test), pH = draft ?? cur ?? 7, changing = draft !== undefined && draft !== cur;
  const again = (d?: number, g = guess, m = '') => showPhoresis(c, e, extra, d, g, m);
  const waiting = [...(e.buf ?? []), ...(e.buf2 ?? []), ...(e.buf3 ?? [])];
  const state = cur === null ? 'pH が決まっていない。下で決めろ。' : e.bad ? `${label(e.bad)} は受け取れない。電気泳動槽に入れられるのは、アミノ酸の水溶液だけだ。` : e.busy ? `${label(e.item!.s)} に電圧をかけている。` : waiting.length ? `出口が詰まっている（${waiting.map((x) => label(x)).join('、')}）。` : '溶液を待っている。';
  const submit = () => {
    const ok = AMINO_ORDER.every((k) => guess[k] === poleAt(k, pH));
    if (!ok) {
      w.mistakes.push({ machine: 'analysis', recipe: 'sep:phoresis', part: 'quiz', t: Date.now() });
      sfx.bad();
      again(pH, guess, '違う。pH が等電点より小さいか大きいかを、1 つずつ比べろ。等電点より酸性側では H⁺ を受け取って陽イオンになる。');
      return;
    }
    const first = !w.agents.includes('phoresis');
    if (first) { w.agents.push('phoresis'); credit(w, 12); }
    e.test = String(pH); e.bad = undefined;
    sfx.ok();
    c.toast(first ? '正解。電気泳動槽が使えるようになった。研究点 +12。' : `正解。pH ${pH} にした。`, 2800);
    showPhoresis(c, e, extra);
  };
  const step = (d: number) => h('button', { class: 'stepper', type: 'button', id: d < 0 ? 'ph-down' : 'ph-up', onclick: () => { sfx.tap(); again(Math.max(PH_MIN, Math.min(PH_MAX, pH + d)), {}, ''); } }, d < 0 ? '−' : '＋');
  c.show(h('header', {}, h('h2', {}, '電気泳動槽'), closeBtn(c)),
    cur !== null ? h('p', { class: 'eq' }, `pH ${cur}`) : null,
    h('p', { class: 'status', id: 'phoresis-status' }, state),
    h('h3', {}, '① pH を決める'),
    h('div', { class: 'row' }, step(-1), h('b', { class: 'formula big', id: 'ph-value' }, `pH ${pH}`), step(1)),
    h('h3', {}, '② この pH で、それぞれがどちらへ動くかを答える'),
    h('p', { class: 'muted' }, '等電点：' + AMINO_ORDER.map((k) => `${AMINO[k].name} ${AMINO[k].pI.toFixed(1)}`).join('、') + `。等電点との差が ${PI_BAND} 以内なら「動かない」とする。`),
    ...AMINO_ORDER.map((k) => h('div', { class: 'row' }, h('span', { class: 'tag wide' }, AMINO[k].name),
      ...(['cathode', 'stay', 'anode'] as Pole[]).map((p) => h('button', { class: 'chip plain' + (guess[k] === p ? ' on' : ''), type: 'button', id: `ph-${k}-${p}`, onclick: () => { sfx.tap(); again(pH, { ...guess, [k]: p }, ''); } }, POLE_NAME[p])))),
    msg ? h('p', { class: 'feedback', id: 'ph-msg' }, msg) : null,
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'ph-ok', disabled: !AMINO_ORDER.every((k) => guess[k]), onclick: submit }, changing || cur === null ? `pH ${pH} にする` : 'もう一度確かめる')),
    h('p', { class: 'muted' }, '動かないものは正面（左）、陽極へ動くものは右手（手前）、陰極へ動くものは左手（手前）の出口から出る。酸性アミノ酸は等電点が小さく、塩基性アミノ酸は等電点が大きい。'),
    extra);
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

// ---------------- 番号の選び方（路線番号・信号の番号）----------------
/** 番号を打ち込んでいる途中の文字。画面を描き直しても残るように、ここに持つ（null なら、打ち込みの欄は閉じている） */
let lineDraft: { id: string; text: string } | null = null;
/**
 * 番号を選ぶ部品。番号は 1 から LINE_MAX まで、いくらでも使える。
 * よく使う 1〜8 番と、いま使われている番号は、押すだけで選べる。ほかの番号は −／＋ で動かすか、数字を打つ。
 * 「空き番号」は、まだどこにも使われていない、いちばん小さい番号。
 */
function linePicker(o: { id: string; unit: string; cur: number; used: number[]; pick: (n: number) => void; again: () => void }): HTMLElement {
  const used = new Set(o.used), count = new Map<number, number>();
  for (const n of o.used) count.set(n, (count.get(n) || 0) + 1);
  // 並べる番号：1〜8、使われている番号、いまの番号。多すぎるときは、いまの番号に近いものから 40 個
  let list = [...new Set([1, 2, 3, 4, 5, 6, 7, 8, ...used, o.cur])].sort((a, b) => a - b);
  const all = list.length;
  if (all > 40) list = list.sort((a, b) => Math.abs(a - o.cur) - Math.abs(b - o.cur)).slice(0, 40).sort((a, b) => a - b);
  const chip = (n: number) => {
    const b = h('button', { class: 'chip plain line' + (o.cur === n ? ' on' : ''), type: 'button', id: `${o.id}-${n}`, onclick: () => { lineDraft = null; o.pick(n); } }, `${n} ${o.unit}`, count.get(n) ? h('span', { class: 'chip-n' }, `×${count.get(n)}`) : null);
    b.style.setProperty('--line', lineColor(n));
    return b;
  };
  const step = (id: string, text: string, n: number, off: boolean) => h('button', { class: 'ghost', type: 'button', id: `${o.id}-${id}`, disabled: off, onclick: () => { lineDraft = null; o.pick(lineNo(n)); } }, text);
  const now = h('span', { class: 'chip plain line on line-now', id: `${o.id}-now` }, `${o.cur} ${o.unit}`);
  now.style.setProperty('--line', lineColor(o.cur));
  const typing = lineDraft && lineDraft.id === o.id ? lineDraft : null, free = freeLine(used);
  const typed = typing && typing.text ? lineNo(+typing.text) : 0;
  return h('div', { class: 'linepick' },
    h('div', { class: 'row' },
      step('dec', '−', o.cur - 1, o.cur <= 1), now, step('inc', '＋', o.cur + 1, o.cur >= LINE_MAX),
      h('button', { class: 'ghost', type: 'button', id: `${o.id}-free`, disabled: free === o.cur, onclick: () => { lineDraft = null; o.pick(free); } }, `空き番号（${free}）`),
      h('button', { class: 'ghost' + (typing ? ' picked on' : ''), type: 'button', id: `${o.id}-type`, onclick: () => { lineDraft = typing ? null : { id: o.id, text: '' }; o.again(); } }, '番号を打つ')),
    typing ? h('div', { class: 'linetype' },
      h('p', { class: 'eq', id: `${o.id}-typed` }, typing.text ? `${typed} ${o.unit}` : `1 〜 ${LINE_MAX} の数字を打つ`),
      h('div', { class: 'keys numpad' }, ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0'].map((k) =>
        h('button', { class: 'key ' + (k === '⌫' ? 'fn' : 'n'), type: 'button', id: `${o.id}-key-${k === '⌫' ? 'del' : k}`, onclick: () => { typing.text = k === '⌫' ? typing.text.slice(0, -1) : typing.text.length < 4 ? (typing.text + k).replace(/^0+/, '') : typing.text; o.again(); } }, k)),
        h('button', { class: 'key fn', type: 'button', id: `${o.id}-ok`, disabled: !typed, onclick: () => { lineDraft = null; o.pick(typed); } }, '決定'))) : null,
    h('div', { class: 'chips' }, ...list.map(chip)),
    all > 40 ? h('p', { class: 'muted' }, `使われている番号は ${used.size} 個。いまの番号に近い 40 個を並べている。ほかの番号は、数字を打って選ぶ。`) : null);
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
    linePicker({ id: 'sg-ch', unit: '番', cur: e.ch || 1, used: [...c.w.ents.values()].filter((n) => n.kind === 'sensor' || n.kind === 'gate').map((n) => n.ch || 1), pick: (n) => { e.ch = n; sfx.tap(); again(); }, again }),
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
  const role = (id: 'in' | 'out', text: string) => h('button', { class: 'ghost' + (e.role === id ? ' picked on' : ''), type: 'button', id: `st-role-${id}`, onclick: () => { setStationRole(e, id); sfx.ok(); again(); } }, text);
  // 行き先は、線路のつながりから決める（道筋を探すのは、いちばん近い 1 か所だけ）
  const routes = stationDests(c.w, e).list, route = routes.length ? railOf(c.w, e, routes[0]) : null, to = route?.dest ?? null, laid = !!route?.custom;
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
    linePicker({ id: 'st-line', unit: '番線', cur: e.ch || 1, used: [...c.w.ents.values()].filter((n) => n.kind === 'station').map((n) => n.ch || 1), pick: (n) => { e.ch = n; sfx.tap(); again(); }, again }),
    h('p', { class: 'status' }, e.role === 'in'
      ? (to && route ? `行き先：線路 ${Math.round(route.len)} マス先の降ろす駅（${route.custom ? '敷いた線路' : '自動の仮線路'}）。片道 約 ${(route.len / speedOn(route.custom)).toFixed(1)} 秒、1 編成 ${trainCap(c.w)} 個で、1 分あたり およそ ${Math.round(((e.cars || 1) * trainCap(c.w) * 60) / ((2 * route.len) / speedOn(route.custom) + 1))} 個まで運べる。${held ? `いま ${held} 編成が、前の列車を待って止まっている。幹線が混んでいる。` : ''}` : `${e.ch} 番線の「降ろす駅」がまだない。届け先に貨物駅を置き、同じ番線の「降ろす駅」にしろ。`)
      : `${e.ch} 番線の積む駅：${feeders} か所。届いたものは、正面の 2 つの口から出る。${(e.buf?.length ?? 0) >= stationCap(c.w) ? `満杯。先頭の ${label((e.buf![0] ?? '').replace(/^!/, ''))} を、出口の先が受け取っていない（タンクは 1 種類しか入らない。ベルトは詰まっていないか）。満杯のあいだ、列車はこの駅を飛ばして、ほかの降ろす駅へ行く。` : ''}`),
    e.role === 'in' ? h('h3', {}, '③ 編成の数') : null,
    e.role === 'in' ? h('div', { class: 'row' }, ...Array.from({ length: maxCars(c.w) }, (_, i) => i + 1).map((n) => h('button', { class: 'ghost' + ((e.cars || 1) === n ? ' picked on' : ''), type: 'button', id: `st-cars-${n}`, onclick: () => { e.cars = n; sfx.tap(); again(); } }, `${n} 編成`)), h('span', { class: 'muted' }, '増やすと、そのぶん多く運べる。')) : null,
    e.role === 'in' && routes.length > 1 ? h('p', { class: 'muted' }, `行き先は ${routes.length} か所。列車は順番に配る（分岐）。`) : null,
    e.role === 'in' ? h('p', { class: 'muted' }, laid ? `敷いた線路でつながっている降ろす駅：${routes.length} か所。線路でつながる駅があるあいだは、そこだけへ送る。線路はほかの駅の列車と共有するので、混むと待ちが出る。待ちが多ければ、線路をもう 1 本敷いて分けろ。` : '線路は自動で仮に引かれる。道具「線路」で駅から駅まで敷くと、1.5 倍の速さで走り、行き先も線路でつながる駅だけになる。線路は枝分かれさせて、何駅でも共有できる。') : null,
    h('p', { class: 'muted' }, `駅にあるもの：${buf.length} / ${stationCap(c.w)} 個`),
    kinds.length ? h('div', { class: 'chips' }, ...kinds.map((s) => { const b = chip(s); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${buf.filter((x) => x === s).length}`)); return b; })) : null,
    extra);
}

// ---------------- 章の選択 ----------------

/** ペースの逆算の文 */
export function paceText(w: World): string {
  const p = paceOf(w);
  if (!p) return 'ペースの見込みは、遊んだ記録が 1 日分と、終えた指令が 2 つ以上たまると出る。';
  const md = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const parts = p.reach.map((r, i) => `${i === 0 ? '共通テスト' : '2 次'}（${md(r.at)}、あと ${r.days} 日）までに${r.all ? '全章を終える' : r.chapter >= 0 ? `「${CHAPTERS[r.chapter].name}」まで` : '次の章も終わらない'}`);
  return `いまのペース：遊んだ日 1 日あたり 約 ${Math.round(p.perDayMin)} 分、指令 1 つに 約 ${Math.max(1, Math.round(p.perGoalMin))} 分。残り ${p.left} 指令。${parts.join('。')}。最初の試験までに全章を終えるには、1 日 約 ${Math.round(p.needPerDayMin)} 分要る。知っている章は「確認テスト」で短くしろ。`;
}

export function showChapters(c: PanelCtx) {
  const { w } = c;
  c.show(h('header', {}, h('h2', {}, '指令の一覧'), closeBtn(c)),
    h('p', { class: 'muted' }, '章はいつでも切り替えられる。進み具合は章ごとに残る。後ろの章には、前の章で作った物質を原料に使うものがある。'),
    h('p', { class: 'pace', id: 'pace' }, paceText(w)),
    h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'chapters-log', onclick: () => showGoalLog(c) }, '終えた指令（評価・かかった時間・見込み）')),
    h('div', { class: 'menu' }, ...CHAPTERS.map((ch, i) => {
      const done = w.progress[i], total = ch.goals.length, g = ch.goals[done];
      // 章の習熟：章の反応のうち正しく設定できた数と、習熟メッキの数
      const mastery = masteryText(chapterMastery(w, i));
      const btn = h('button', { class: 'ghost chapter' + (i === w.chapter ? ' picked' : ''), type: 'button', id: `chapter-${i}`,
        onclick: () => { setChapter(w, i); sfx.ok(); c.close(); } },
        h('span', {}, h('b', {}, ch.name), h('span', { class: 'muted' }, g ? `　次：${[g.s, ...(g.also ?? [])].map((x) => sub(x).name).join('・')}` : '　完了'), w.tested.includes(i) ? h('span', { class: 'pill' }, '確認テストで短縮') : null,
          mastery ? h('span', { class: 'ch-mastery', id: `chapter-m-${i}` }, mastery) : null),
        h('span', { class: 'formula' }, `${done} / ${total}`));
      return canTestOut(w, i) ? h('div', { class: 'chapter-row' }, btn, h('button', { class: 'ghost testout', type: 'button', id: `testout-${i}`, onclick: () => showTestOut(c, i) }, '確認テスト')) : btn;
    })));
}

/** 章の確認テスト：10 問。9 割以上なら、その章は最後の指令だけになる */
export function showTestOut(c: PanelCtx, ch: number) {
  const { w } = c;
  const qs = testOutQuiz(ch), res: { id: string; ok: boolean }[] = [], missed: { q: string; a: string }[] = [];
  const head = () => h('header', {}, h('h2', {}, `確認テスト：${CHAPTERS[ch].name}`), closeBtn(c));
  const finish = () => {
    const right = res.filter((x) => x.ok).length, pass = testOutPass(right, res.length);
    if (pass) applyTestOut(w, ch, res);
    if (pass) sfx.goal(); else sfx.bad();
    c.show(head(), h('p', { class: 'qtext' }, `${res.length} 問中 ${right} 問正解。`),
      missed.length ? h('div', { class: 'rv-hclist' }, h('b', {}, 'まちがえた問いと正解'), ...missed.map((m) => h('p', {}, `${m.q.replace(/→ できるものは？$/, '→ ？')}　正しくは「${m.a}」`))) : null,
      h('p', {}, pass ? `合格。この章は最後の指令だけを残した。章の反応は覚えたものとして、復習に入れた${res.some((x) => !x.ok) ? '（まちがえた反応は、今日のうちに出し直す）' : ''}。` : '9 割に届かなかった。この章は、指令を全部やれ。'),
      h('div', { class: 'row' }, pass ? h('button', { class: 'primary', type: 'button', id: 'testout-go', onclick: () => { setChapter(w, ch); c.close(); } }, 'この章へ') : null, h('button', { class: 'ghost', type: 'button', onclick: () => showChapters(c) }, '一覧へ')));
  };
  const step = (i: number) => {
    const q = qs[i];
    if (!q) { finish(); return; }
    const result = h('div', { class: 'answer', hidden: true });
    const opts = h('div', { class: 'menu' });
    const choices = shuffledOf(q.choices);
    for (const [k, ch2] of choices.entries()) opts.append(h('button', { class: 'ghost', type: 'button', id: `to-c-${k}`, onclick: () => {
      if (!result.hidden) return;
      const ok = ch2 === q.choices[0];
      res.push({ id: q.id, ok });
      if (!ok) missed.push({ q: q.q, a: q.choices[0] });
      ok ? sfx.ok() : sfx.bad();
      for (const x of opts.children) { const el = x as HTMLButtonElement; el.disabled = true; el.classList.toggle('picked', el.textContent === q.choices[0]); el.classList.toggle('wrong', el.textContent === ch2 && !ok); }
      result.replaceChildren(h('p', {}, h('b', {}, ok ? '正解' : `不正解。正しくは「${q.choices[0]}」`)), h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'to-next', onclick: () => step(i + 1) }, i + 1 < qs.length ? '次へ' : '結果')));
      result.hidden = false;
    } }, ch2));
    c.show(head(), h('p', { class: 'muted' }, `${i + 1} / ${qs.length}　9 割以上で、この章は最後の指令だけになる。`), h('p', { class: 'qtext' }, q.q), opts, result);
  };
  step(0);
}
const shuffledOf = <T>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---------------- 復習 ----------------

/** 復習の残り：期限の来たもの ＋ 今日まちがえて戻ってきたもの（重ならないように数える） */
export const reviewCount = (w: World) => new Set([...dueIds(w), ...w.relearn.filter((x) => x.at <= Date.now()).map((x) => x.id)]).size;

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
