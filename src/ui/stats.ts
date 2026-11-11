import { CHAPTERS, TOTAL_GOALS } from '../content/goals';
import { KNOWLEDGE } from '../content/knowledge';
import { MACHINES } from '../content/machines';
import { QUESTIONS } from '../content/questions';
import { recipeById, RECIPES } from '../content/recipes';
import { SYLLABUS } from '../content/syllabus';
import { BUCKET_SEC, TOXIC, TOXIC_PER_POINT, doneCount, dueIds, flowStats, isMachine, machineState, type Ent, type World } from '../engine/world';
import { label } from '../content/substances';
import { chip, statusOf } from './config';
import { h } from './dom';
import { showLog, showSyllabus, unitProgress, type PanelCtx } from './panels';
import { sfx } from './sound';

const pct = (x: number) => `${Math.round(x * 100)}`;
const mmss = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} 時間 ${Math.floor((sec % 3600) / 60)} 分` : sec >= 60 ? `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒` : `${Math.round(sec)} 秒`);

/** 見出しの数字 1 つ */
function tile(label: string, value: string, unit: string, note = '', id = ''): HTMLElement {
  return h('div', { class: 'tile', id }, h('span', { class: 'tile-l' }, label),
    h('span', { class: 'tile-v' }, value, unit ? h('small', {}, unit) : null), note ? h('span', { class: 'tile-n' }, note) : null);
}
/** 0〜1 の割合を横棒で */
function meter(f: number, cls = ''): HTMLElement {
  const i = h('i', {});
  i.style.width = `${Math.max(0, Math.min(100, Math.round(f * 100)))}%`;
  return h('span', { class: `meter ${cls}` }, i);
}
/** 状態は色だけに頼らず、記号と言葉を必ず添える */
const STATE = [
  { cls: 'good', icon: '●', text: '稼働' },
  { cls: 'warn', icon: '▲', text: '原料待ち' },
  { cls: 'bad', icon: '✕', text: '出口詰まり' },
];
export const utilClass = (u: number) => (u >= 0.7 ? 'good' : u >= 0.35 ? 'warn' : 'bad');

/** 10 秒ごとの納品数（直近 5 分）。系列は 1 つなので凡例は置かず、見出しが名前になる */
function deliveryChart(w: World): HTMLElement {
  const now = Math.floor(w.playMs / 1000 / BUCKET_SEC), N = 30;
  const vals = Array.from({ length: N }, (_, i) => w.buckets.find((b) => b.t === now - (N - 1 - i))?.deliver ?? 0);
  const max = Math.max(1, ...vals);
  const tip = h('p', { class: 'muted chart-tip', id: 'chart-tip' }, '棒をタップすると、その 10 秒間の数が出る。');
  const bars = h('div', { class: 'bars' }, ...vals.map((v, i) => {
    const b = h('button', { class: 'bar', type: 'button', ariaLabel: `${(N - 1 - i) * BUCKET_SEC} 秒前：${v} 個` }, h('i', {}));
    (b.firstChild as HTMLElement).style.height = `${v ? Math.max(4, (v / max) * 100) : 0}%`;
    b.onclick = () => {
      for (const o of bars.children) o.classList.toggle('on', o === b);
      tip.textContent = `${(N - i) * BUCKET_SEC}〜${(N - 1 - i) * BUCKET_SEC} 秒前の 10 秒間：${v} 個（1 分あたり ${v * 6} 個の速さ）`;
    };
    return b;
  }));
  return h('figure', { class: 'chart' },
    h('figcaption', {}, '納品数の推移（10 秒ごと、直近 5 分）'),
    h('div', { class: 'chart-body' }, h('span', { class: 'chart-max' }, String(max)), bars),
    h('div', { class: 'chart-x' }, h('span', {}, '5 分前'), h('span', {}, 'いま')),
    tip,
    h('details', {}, h('summary', {}, '表で見る'),
      h('table', { class: 'log' }, ...vals.map((v, i) => [v, i] as const).filter(([v]) => v > 0).reverse().slice(0, 12).map(([v, i]) =>
        h('tr', {}, h('td', {}, `${(N - 1 - i) * BUCKET_SEC} 秒前`), h('td', { class: 'n' }, `${v} 個`))))));
}

export interface StatsCtx extends PanelCtx { overlay(): boolean; setOverlay(on: boolean): void; focus(e: Ent): void }

export function showStats(c: StatsCtx) {
  const { w } = c;
  const f = flowStats(w);

  // ---- 装置ごと ----
  const machines = [...w.ents.values()].filter((e) => isMachine(e.kind) && e.recipe).sort((a, b) => (a.u || 0) - (b.u || 0));
  const row = (e: Ent) => {
    const r = recipeById(e.recipe)!, st = STATE[machineState(e)], ts = e.ts ?? [0, 0, 0], total = ts[0] + ts[1] + ts[2] || 1;
    const b = h('button', { class: 'mrow', type: 'button', onclick: () => { sfx.tap(); c.focus(e); } },
      h('span', { class: 'mrow-t' }, h('b', {}, r.name), h('span', { class: 'muted' }, `${MACHINES[e.kind as keyof typeof MACHINES].name}・${e.n || 0} 回`)),
      h('span', { class: `state ${st.cls}` }, h('i', {}, st.icon), st.text),
      h('span', { class: 'mrow-u' }, `${pct(e.u || 0)} %`),
      meter(e.u || 0, utilClass(e.u || 0)),
      h('span', { class: 'muted mrow-d' }, `通算：稼働 ${pct(ts[0] / total)} %・原料待ち ${pct(ts[1] / total)} %・詰まり ${pct(ts[2] / total)} %。${machineState(e) ? statusOf(e, r) : ''}`));
    return b;
  };

  // ---- 学習 ----
  const learned = RECIPES.filter((r) => w.learned.includes(r.id));
  const missed = new Set(w.mistakes.filter((m) => isMachine(m.machine as Ent['kind']) && m.recipe).map((m) => m.recipe));
  const firstTry = learned.filter((r) => !missed.has(r.id)).length;
  const kStage = (id: string) => w.srs[`k:${id}`]?.iv;
  const kFirm = KNOWLEDGE.filter((k) => (kStage(k.id) ?? -1) >= 2).length, kSeen = KNOWLEDGE.filter((k) => kStage(k.id) !== undefined).length;
  const pr = Object.values(w.practice), tries = pr.reduce((a, p) => a + p.tries, 0), clean = pr.reduce((a, p) => a + p.clean, 0);
  const done = doneCount(w);
  const PART: Record<string, string> = { reactants: '原料の組み合わせ', products: '生成物', electrodes: '電極', coefficients: '係数', electrons: '電子の数', condition: '条件', equilibrium: '平衡の条件', revealed: '答えを見た', calc: '計算', isomer: '仕分け', quiz: '知識問題', passage: 'リード文' };
  const byPart = new Map<string, number>();
  for (const m of w.mistakes) byPart.set(PART[m.part] ?? m.part, (byPart.get(PART[m.part] ?? m.part) || 0) + 1);
  const parts = [...byPart].sort((a, b) => b[1] - a[1]).slice(0, 6), pmax = Math.max(1, ...parts.map(([, n]) => n));
  // 手をつけたのに進みの遅い単元
  const weak = SYLLABUS.map((u) => ({ u, ...unitProgress(w, u) })).filter((x) => x.done > 0 && x.done < x.total).sort((a, b) => a.done / a.total - b.done / b.total).slice(0, 4);

  const top = (rec: Record<string, number>, n = 8) => Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n).map(([s, k]) => { const b = chip(s); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${k}`)); return b; });
  const sumOf = (rec: Record<string, number>) => Object.values(rec).reduce((a, n) => a + n, 0);
  const made = sumOf(w.made), lost = sumOf(w.vented) + sumOf(w.spilled);

  const grade = (g: string) => Object.values(w.grades).filter((x) => x === g).length;
  const emitted = sumOf(w.emitted), worst = Object.entries(w.emitted).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const toggle = h('button', { class: 'ghost' + (c.overlay() ? ' on' : ''), type: 'button', id: 'stats-overlay' }, c.overlay() ? '地図に稼働率を表示中（押すと消す）' : '地図に稼働率を表示する');
  toggle.onclick = () => { c.setOverlay(!c.overlay()); sfx.tap(); showStats(c); };

  c.show(
    h('header', {}, h('h2', {}, '統計'), h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる')),
    h('h3', {}, '工場の効率'),
    h('div', { class: 'tiles' },
      tile('納品の速さ', f.perMin1.toFixed(1), '個/分', `直近 1 分。5 分平均は ${f.perMin5.toFixed(1)}`, 'st-rate'),
      tile('いまの指令', f.goalPerMin.toFixed(1), '個/分', f.etaSec === null ? '指令の物質はまだ届いていない' : `この速さなら、あと ${mmss(f.etaSec)}`, 'st-goal'),
      tile('装置の稼働率', f.util === null ? '—' : pct(f.util), f.util === null ? '' : '%', `設定済み ${f.machines} 台の、直近 20 秒ほどの平均`, 'st-util'),
      tile('捨てた割合', f.wasteRate === null ? '—' : pct(f.wasteRate), f.wasteRate === null ? '' : '%', '直近 5 分に作ったもののうち、廃棄口とあふれで失った分', 'st-waste'),
      tile('操業評価', `S ${grade('S')}・A ${grade('A')}`, '', `B ${grade('B')}・C ${grade('C')}。指令を終えた時点の速さが毎分 30 個で S、15 個で A、6 個で B`, 'st-grade'),
      tile('有毒ガスの排出', String(emitted), '個', emitted ? `そのまま捨てた数。${TOXIC_PER_POINT} 個ごとに研究点 −1。多いのは ${worst.map(([s2, n]) => `${label(s2)} ${n}`).join('、')}` : 'そのまま捨てた有毒な気体はない', 'st-toxic'),
    ),
    worst.length ? h('p', { class: 'muted' }, `処理のしかた：${worst.map(([s2]) => `${label(s2)} は${TOXIC[s2]}`).join('。')}。`) : null,
    h('p', { class: 'states' },
      h('span', { class: 'state bad' }, h('i', {}, '✕'), `出口詰まり ${f.jammed} 台`),
      h('span', { class: 'state warn' }, h('i', {}, '▲'), `原料待ちで止まりがち ${f.starved} 台`),
      h('span', { class: 'state' }, h('i', {}, '？'), `未設定 ${f.unset} 台`)),
    h('div', { class: 'row' }, toggle),
    deliveryChart(w),
    h('h3', {}, '装置ごとの稼働率（低い順）'),
    machines.length
      ? h('div', { class: 'mrows' }, ...machines.slice(0, 12).map(row))
      : h('p', { class: 'muted' }, 'まだ設定済みの装置がない。'),
    machines.length ? h('p', { class: 'muted' }, '行をタップすると、その装置の場所へ移る。稼働率の低い装置が、流れを細くしている所。原料待ちなら上流を、詰まりなら下流を太くしろ。') : null,
    h('h3', {}, '作った数と捨てた数（通算）'),
    h('p', { class: 'muted' }, `装置が作ったもの ${made} 個。そのうち廃棄口で ${sumOf(w.vented)} 個、あふれで ${sumOf(w.spilled)} 個を失った${made ? `（${pct(Math.min(1, lost / made))} %）` : ''}。副生成物を別の指令に回せば、この数は減る。`),
    Object.keys(w.vented).length ? h('div', { class: 'chips' }, ...top(w.vented)) : null,

    h('h3', {}, '学習'),
    h('div', { class: 'tiles' },
      tile('指令', String(done), `/ ${TOTAL_GOALS}`, `${CHAPTERS.filter((ch, i) => w.progress[i] >= ch.goals.length).length} 章を修了`),
      tile('反応', String(learned.length), `/ ${RECIPES.length}`, learned.length ? `そのうち一発で書けたもの ${pct(firstTry / learned.length)} %` : 'まだ設定した反応がない'),
      tile('計算問題', String(w.solved.length), `/ ${QUESTIONS.length}`, ''),
      tile('知識問題', String(kFirm), `/ ${KNOWLEDGE.length}`, `2 回続けて正解して定着したもの。出題済みは ${kSeen}、復習待ちは ${dueIds(w).length}`),
      tile('演習', tries ? pct(clean / tries) : '—', tries ? '%' : '', tries ? `連鎖計算・構造決定を ${tries} 回解いて、全問正解 ${clean} 回` : 'メニューの連鎖計算・構造決定はまだ解いていない'),
      tile('遊んだ時間', mmss(w.playMs / 1000), '', done ? `指令 1 つあたり平均 ${mmss(w.playMs / 1000 / done)}` : ''),
    ),
    parts.length ? h('h3', {}, '間違いの内訳') : null,
    parts.length ? h('div', { class: 'hbars' }, ...parts.map(([name, n]) => h('div', { class: 'hbar' }, h('span', {}, name), meter(n / pmax), h('span', { class: 'hbar-n' }, `${n} 回`)))) : null,
    weak.length ? h('h3', {}, '手をつけたが進んでいない単元') : null,
    weak.length ? h('div', { class: 'hbars' }, ...weak.map((x) => h('div', { class: 'hbar' }, h('span', {}, x.u.title), meter(x.done / x.total), h('span', { class: 'hbar-n' }, `${x.done} / ${x.total}`)))) : null,
    h('div', { class: 'row' },
      h('button', { class: 'ghost', type: 'button', id: 'st-log', onclick: () => showLog(c) }, '記録（間違えた反応の一覧）'),
      h('button', { class: 'ghost', type: 'button', id: 'st-syl', onclick: () => showSyllabus(c) }, '範囲表')),
  );
}
