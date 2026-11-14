import { CHAPTERS, TOTAL_GOALS } from '../content/goals';
import { KNOWLEDGE } from '../content/knowledge';
import { MACHINES } from '../content/machines';
import { QUESTIONS } from '../content/questions';
import { recipeById, RECIPES } from '../content/recipes';
import { SYLLABUS } from '../content/syllabus';
import { TOXIC, currentGoal, doneCount, dueIds, flowStats, isMachine, machineState, stationCap, trainTroubles, type Ent, type TrainTrouble, type World } from '../engine/world';
import { label, sub } from '../content/substances';
import { PERIODS, balanceOf, bottlenecks, deliverySeries, hourTrend, machineTypes, periodName, statsCsv, stockSeries, stopReasons, type Neck, type Period } from '../engine/flow';
import { ACHIEVEMENTS } from '../engine/achieve';
import { fold, lineChart, saveText, setStatsUi, stackBar, stampOf, statsUi } from './charts';
import { cvdOn, heatOn, setHeat } from './mapfx';
import { showChain } from './chain';
import { showGoalLog } from './goals';
import { showAchievements } from './achieve';
import { tokenIcon } from './token';
import { chip, statusOf } from './config';
import { h } from './dom';
import { showLog, showSyllabus, unitProgress, type PanelCtx } from './panels';
import { sfx } from './sound';
import { DAILY_GOAL, lastDays, streakOf } from '../engine/habit';
import { dayKey } from '../engine/fsrs';
import { setupMissed } from '../engine/learn';

/** 縦の棒グラフ（値・棒の下の名前・2 本目の値は濃い色で重ねる） */
function bars(id: string, rows: { name: string; v: number; v2?: number; note?: string }[], max: number): HTMLElement {
  const m = Math.max(1, max);
  return h('div', { class: 'bars', id }, ...rows.map((r) => {
    const all = h('i', {}), ok = r.v2 !== undefined ? h('i', { class: 'ok' }) : null;
    all.style.height = `${Math.round((r.v / m) * 64)}px`;
    // 2 本目（思い出せた数）は、1 本目の下の端に重ねる
    if (ok) { const hh = Math.round((r.v2! / m) * 64); ok.style.height = `${hh}px`; ok.style.marginTop = `-${hh}px`; }
    return h('div', { class: 'bar', title: r.note ?? '' }, h('b', {}, String(r.v)), all, ok, h('span', {}, r.name));
  }));
}
/** 復習の記録：直近 7 日の数、自信ごとの正答率、これから 7 日の予定 */
function learnCharts(w: World): HTMLElement[] {
  const days = lastDays(w, 7), wk = ['日', '月', '火', '水', '木', '金', '土'];
  const dname = (k: string) => { const [y, m, d] = k.split('-').map(Number); return wk[new Date(y, m - 1, d).getDay()]; };
  const cal = (['sure', 'maybe', 'guess'] as const).map((k, i) => { const [n, ok] = w.calib[k] ?? [0, 0]; return { name: ['確実', 'たぶん', '勘'][i], v: n ? Math.round((ok / n) * 100) : 0, note: `${n} 問中 ${ok} 問正解` }; });
  const now = Date.now(), ahead = Array.from({ length: 7 }, (_, i) => { const k = dayKey(now + i * 86400000); return { name: i === 0 ? '今日' : dname(k), v: Object.values(w.srs).filter((c) => (i === 0 ? c.due <= now + 86400000 && dayKey(Math.max(c.due, now)) === k : dayKey(c.due) === k)).length }; });
  return [
    h('h3', {}, `直近 7 日の復習（連続 ${streakOf(w)} 日・毎日の目標 ${DAILY_GOAL} 問）`),
    bars('st-week', days.map((d) => ({ name: dname(d.day), v: d.n, v2: d.ok, note: `${d.n} 問中 思い出せた ${d.ok} 問` })), Math.max(DAILY_GOAL, ...days.map((d) => d.n))),
    h('p', { class: 'muted' }, '黒が答えた数、緑が思い出せた数（勘で当たったものは数えない）。'),
    h('h3', {}, '自信ごとの正答率（%）'),
    bars('st-calib', cal, 100),
    h('p', { class: 'muted' }, '「確実」が 9 割を切るなら、思い込みでまちがえている。「勘」が高すぎるなら、自信を低く見積もっている。'),
    h('h3', {}, 'これから 7 日の復習（予定）'),
    bars('st-ahead', ahead, Math.max(5, ...ahead.map((a) => a.v))),
    h('p', { class: 'muted' }, '予定が 1 日に偏るなら、その前の日に少し先取りしておけ（「復習」で期限前の問いは出ないので、図鑑の「練習」を使う）。'),
  ];
}

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
  { cls: 'off', icon: '‖', text: '一時停止' },
];
export const utilClass = (u: number) => (u >= 0.7 ? 'good' : u >= 0.35 ? 'warn' : 'bad');

/** 何秒前を、短い言葉で */
const ago = (sec: number) => (sec <= 0 ? 'いま' : sec >= 60 ? `${Math.round(sec / 60)} 分前` : `${Math.round(sec)} 秒前`);
const f1 = (v: number) => (v >= 10 ? String(Math.round(v)) : v >= 0.05 ? v.toFixed(1) : '0');

/** 納品数の推移。直近 1 分・5 分は 10 秒ごと、すべては 1 分ごと（最大 1 時間）。系列は 1 つなので凡例は置かず、見出しが名前になる */
function deliveryChart(w: World, per: Period): HTMLElement {
  const { vals, step } = deliverySeries(w, per), N = vals.length, unit = step === 60 ? '1 分' : '10 秒';
  const max = Math.max(1, ...vals);
  const tip = h('p', { class: 'muted chart-tip', id: 'chart-tip' }, `棒をタップすると、その ${unit}間の数が出る。`);
  const bars = h('div', { class: 'bars' }, ...vals.map((v, i) => {
    const b = h('button', { class: 'bar', type: 'button', ariaLabel: `${ago((N - 1 - i) * step)}：${v} 個` }, h('i', {}));
    (b.firstChild as HTMLElement).style.height = `${v ? Math.max(4, (v / max) * 100) : 0}%`;
    b.onclick = () => {
      for (const o of bars.children) o.classList.toggle('on', o === b);
      tip.textContent = `${ago((N - i) * step)}〜${ago((N - 1 - i) * step)}の ${unit}間：${v} 個（1 分あたり ${f1((v * 60) / step)} 個の速さ）${i === N - 1 ? '。いまの区切りは途中' : ''}`;
    };
    return b;
  }));
  return h('figure', { class: 'chart', id: 'st-deliver' },
    h('figcaption', {}, `納品数の推移（${unit}ごと、${periodName(per)}）`),
    h('div', { class: 'chart-body' }, h('span', { class: 'chart-max' }, String(max)), bars),
    h('div', { class: 'chart-x' }, h('span', {}, ago(N * step)), h('span', {}, 'いま')),
    tip,
    h('details', {}, h('summary', {}, '表で見る'),
      h('table', { class: 'log' }, ...vals.map((v, i) => [v, i] as const).filter(([v]) => v > 0).reverse().slice(0, 15).map(([v, i]) =>
        h('tr', {}, h('td', {}, ago((N - 1 - i) * step)), h('td', { class: 'n' }, `${v} 個`))))));
}

/** 1 時間の推移（1 分ごと）：納品・作った・捨てた。直近とその前の比べ */
function hourChart(w: World): HTMLElement[] {
  const tr = hourTrend(w), n = tr.vals.length;
  const done = tr.vals.slice(0, -1), best = done.length ? Math.max(...done) : 0;
  const ch = (tr.recent ?? 0) - (tr.before ?? 0), pctCh = tr.before ? Math.round((ch / tr.before) * 100) : null;
  const trend = tr.recent === null ? '記録が 4 分たまると、直近とその前を比べる。'
    : tr.before === 0 ? (tr.recent > 0 ? `直近 ${tr.k} 分は毎分 ${f1(tr.recent)} 個。その前の ${tr.k} 分は納品がなかった。` : `直近 ${tr.k * 2} 分は納品がない。`)
    : `直近 ${tr.k} 分の平均は毎分 ${f1(tr.recent)} 個で、その前の ${tr.k} 分（${f1(tr.before!)} 個）より ${Math.abs(pctCh!)} % ${ch >= 0 ? '多い' : '少ない'}。`;
  // 折れ線は、終えた 1 分ずつだけ（途中の 1 分を入れると、最後が落ち込んで見える）。まだ 1 分たっていなければ、途中の 1 分を出す
  const m = n > 1 ? n - 1 : n, cut = (a: number[]) => a.slice(0, m);
  return [
    lineChart({ id: 'st-hour', title: `1 分ごとの納品・作った数・捨てた数（記録 ${m} 分）`, unit: ' 個',
      series: [{ name: '納品', vals: cut(tr.vals), slot: 1 }, { name: '捨てた', vals: cut(tr.lost), slot: 2 }, { name: '作った', vals: cut(tr.made), slot: 3 }],
      left: n > 1 ? `${m} 分前` : 'いま', right: n > 1 ? '1 分前' : '', when: (i) => (n > 1 ? `${m - i} 分前の 1 分` : 'いまの 1 分（途中）') }),
    h('p', { class: 'muted', id: 'st-trend' }, `${trend}${best ? `いちばん多かった 1 分は ${best} 個（${ago((done.length - done.lastIndexOf(best)) * 60)}）。` : ''}1 分ごとの合計は、セーブに 1 時間ぶん残る（遊んだ時間で数える）。`),
  ];
}

/** 物質ごとの収支（1 分あたり）。いまの指令の物質は太字 */
function balanceTable(w: World, per: Period): HTMLElement[] {
  const { rows, min } = balanceOf(w, per), g = currentGoal(w), goal = new Set(g ? [g.s, ...(g.also ?? [])] : []);
  if (!rows.length) return [h('p', { class: 'muted', id: 'st-balance' }, 'この期間には、まだ何も流れていない。')];
  const cell = (v: number) => h('td', { class: 'n' }, v ? f1(v) : '·');
  const net = (v: number) => h('td', { class: 'n ' + (Math.abs(v) < 0.05 ? '' : v > 0 ? 'up' : 'down') }, Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${f1(Math.abs(v))}`);
  const shown = rows.slice(0, 14);
  return [
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'log bal', id: 'st-balance' },
      h('tr', {}, h('th', {}, '物質'), h('th', { class: 'n' }, '作った'), h('th', { class: 'n' }, '使った'), h('th', { class: 'n' }, '納品'), h('th', { class: 'n' }, '捨てた'), h('th', { class: 'n' }, '差')),
      ...shown.map((r) => h('tr', { class: goal.has(r.s) ? 'goal' : '' },
        h('td', {}, tokenIcon(r.s, 18), ' ', h('b', {}, sub(r.s).name), sub(r.s).formula && !sub(r.s).mask ? h('span', { class: 'muted' }, ` ${label(r.s)}`) : null),
        cell(r.made), cell(r.used), cell(r.deliver), cell(r.lost), net(r.net))))),
    h('p', { class: 'muted' }, `1 分あたりの数（${periodName(per)}・記録 ${min >= 1 ? `${f1(min)} 分` : `${Math.round(min * 60)} 秒`}）。「作った」は採取機で採った分を含み、「捨てた」は廃棄口とあふれ。「差」がプラスなら、ベルトやタンクにたまっている（行き先が足りない）。マイナスなら、ためていた分か、在庫や試薬棚の分を使っている。${rows.length > shown.length ? `ほかの ${rows.length - shown.length} 種は CSV に入る。` : ''}`),
  ];
}

/** 納品所の在庫の推移（多い 4 種） */
function stockChart(w: World, per: Period): HTMLElement {
  const st = stockSeries(w, per);
  if (!st.subs.length) return h('p', { class: 'muted', id: 'st-stock' }, 'まだ納品所に在庫がない。納品所へ運んだ物質は、指令と関係なくすべて在庫になる。');
  const n = st.ago.length;
  return lineChart({ id: 'st-stock', title: `納品所の在庫（多い ${st.subs.length} 種、${periodName(per)}）`, unit: ' 個',
    series: st.subs.map((s, i) => ({ name: label(s), vals: st.series[i], slot: i + 1 })), left: ago(st.ago[0]), right: 'いま', when: (i) => ago(st.ago[Math.min(n - 1, i)]) });
}

/** 詰まりの元：詰まっている装置と、原料が来ない装置。それぞれ上位 3 台。押すとその場所へ */
function necks(c: StatsCtx): HTMLElement[] {
  const { jammed, starved } = bottlenecks(c.w);
  const row = (x: Neck) => {
    const e = x.e, r = recipeById(e.recipe), name = r ? r.name : MACHINES[e.kind as keyof typeof MACHINES].name;
    const why = x.why === 'bad' ? `使わない ${label(e.bad!)} が入口に来て、ベルトが止まっている`
      : x.why === 'jam' ? `出口が ${Math.round(e.stuck || 0)} 秒詰まっている${r ? `：${statusOf(e, r).replace(/^止まっている：/, '')}` : '。出口の先をベルトか廃棄口へ'}`
      : `直近の稼働率 ${pct(e.u || 0)} %。${r ? statusOf(e, r) : ''}`;
    return h('button', { class: 'mrow neck', type: 'button', id: `neck-${e.x}-${e.y}`, onclick: () => { sfx.tap(); c.focus(e); } },
      h('span', { class: 'mrow-t' }, h('b', {}, name), h('span', { class: 'muted' }, MACHINES[e.kind as keyof typeof MACHINES].name)),
      h('span', { class: `state ${x.why === 'starve' ? 'warn' : 'bad'}` }, h('i', {}, x.why === 'starve' ? '▲' : x.why === 'bad' ? '！' : '✕'), x.why === 'starve' ? '原料待ち' : x.why === 'bad' ? '受け取れない' : '詰まり'),
      h('span', { class: 'muted mrow-d' }, why));
  };
  if (!jammed.length && !starved.length) return [h('p', { class: 'muted', id: 'st-necks' }, '目立って止まっている装置はない。')];
  return [h('div', { class: 'necks', id: 'st-necks' },
    h('div', {}, h('p', { class: 'neck-h' }, h('b', {}, '詰まっている'), h('span', { class: 'muted' }, '　下流を太くするか、行き先を作る')), ...(jammed.length ? jammed.map(row) : [h('p', { class: 'muted' }, 'なし')])),
    h('div', {}, h('p', { class: 'neck-h' }, h('b', {}, '原料が来ない'), h('span', { class: 'muted' }, '　上流を太くする')), ...(starved.length ? starved.map(row) : [h('p', { class: 'muted' }, 'なし')])))];
}

/** 止まっている理由：いまの状態ごとの台数と、置いてからの時間の内訳 */
function whyChart(w: World): HTMLElement[] {
  const sr = stopReasons(w), t = sr.time, total = t[0] + t[1] + t[2];
  return [
    stackBar('st-why', [
      { label: '稼働', n: sr.run, cls: 'good', icon: '●' },
      { label: '原料待ち', n: sr.wait, cls: 'warn', icon: '▲' },
      { label: '出口詰まり', n: sr.jam, cls: 'bad', icon: '✕' },
      { label: '受け取れない物質', n: sr.bad, cls: 'bad2', icon: '！' },
      ...(sr.off ? [{ label: '一時停止', n: sr.off, cls: 'off', icon: '‖' }] : []),
      { label: '未設定', n: sr.unset, cls: 'unset', icon: '？' },
    ]),
    total >= 1 ? h('p', { class: 'muted sbar-cap' }, '設定済みの装置が、設定してから過ごした時間の合計の内訳') : null,
    total >= 1 ? stackBar('st-why-time', [
      { label: '稼働', n: t[0], cls: 'good', icon: '●', fmt: mmss },
      { label: '原料待ち', n: t[1], cls: 'warn', icon: '▲', fmt: mmss },
      { label: '出口詰まり', n: t[2], cls: 'bad', icon: '✕', fmt: mmss },
    ]) : null,
  ].filter((x): x is HTMLElement => !!x);
}

/** 装置の種類ごとの台数と稼働 */
function typeTable(w: World): HTMLElement {
  const rows = machineTypes(w);
  if (!rows.length) return h('p', { class: 'muted', id: 'st-types' }, 'まだ装置を置いていない。');
  const table = h('div', { class: 'tbl-wrap' }, h('table', { class: 'log types', id: 'st-types' },
    h('tr', {}, h('th', {}, '種類'), h('th', { class: 'n' }, '台数'), h('th', {}, '平均の稼働率'), h('th', { class: 'n' }, '● 稼働'), h('th', { class: 'n' }, '▲ 待ち'), h('th', { class: 'n' }, '✕ 詰まり')),
    ...rows.map((r) => h('tr', {},
      h('td', {}, h('b', {}, r.name)),
      h('td', { class: 'n' }, r.set === r.n ? String(r.n) : `${r.set} / ${r.n}`),
      h('td', {}, r.util === null ? h('span', { class: 'muted' }, '記録なし') : h('span', { class: 'tu' }, meter(r.util, utilClass(r.util)), h('small', {}, `${pct(r.util)} %`))),
      h('td', { class: 'n' }, String(r.run)), h('td', { class: 'n' }, String(r.wait)), h('td', { class: 'n' }, String(r.jam))))));
  // 一時停止している装置は、稼働率にも状態ごとの台数にも入れず、表の下に別に書く（列を足すと、スマホの幅に収まらない）
  const off = rows.filter((r) => r.off > 0);
  return off.length ? h('div', {}, table, h('p', { class: 'muted', id: 'st-types-off' }, `‖ 一時停止：${off.map((r) => `${r.name} ${r.off} 台`).join('・')}（稼働率と状態ごとの台数には入れていない）`)) : table;
}

/** 列車の点検：動けない列車と理由を、番線ごとに 1 行。押すとその駅へ移る */
function trainRows(c: StatsCtx): HTMLElement[] {
  const all = trainTroubles(c.w), cap = stationCap(c.w);
  if (!all.length) return [h('p', { class: 'muted', id: 'st-train-ok' }, '止まっている列車はない（荷を積んだまま行き先のない列車も、満杯の降ろす駅もない）。')];
  const text = (t: TrainTrouble): [string, string] => t.type === 'nodest'
    ? [`${t.ch} 番線：降ろす駅がない`, `${t.s ? `${label(t.s)} を積んだ` : '荷を積んだ'}列車 ${t.trains} 編成が、出発できずに待っている${t.stations > 1 ? `（積む駅 ${t.stations} か所）` : ''}。届け先に貨物駅を置いて ${t.ch} 番線の「降ろす駅」にするか、この駅の番線を、届け先の番線に合わせろ。積む駅が満杯になると、手前の装置も止まる。`]
    : t.type === 'allfull'
      ? [`${t.ch} 番線：降ろす駅がすべて満杯`, `積む駅 ${t.stations} か所の列車 ${t.trains} 編成が、空くのを待っている。降ろす駅の出口の先（ベルト・タンク・装置）が受け取っていない。`]
      : [`${t.ch} 番線：降ろす駅が満杯（${cap} 個）`, `先頭の ${label(t.s)} を、出口の先が受け取っていない。列車はこの駅を飛ばしている。出口のベルトの先をたどれ（タンクは 1 種類だけ。装置は原料にしない物質を受け取らない）。`];
  return [
    h('div', { class: 'mrows', id: 'st-train' }, ...all.slice(0, 24).map((t) => {
      const [head, body] = text(t);
      return h('button', { class: 'mrow', type: 'button', onclick: () => { sfx.tap(); c.focus(t.at); } },
        h('span', { class: 'mrow-t' }, h('b', {}, head), h('span', { class: 'muted' }, `（${t.at.x}, ${t.at.y}）`)),
        h('span', { class: `state ${t.type === 'outfull' ? 'warn' : 'bad'}` }, h('i', {}, t.type === 'outfull' ? '▲' : '✕'), t.type === 'outfull' ? '満杯' : '出発できない'),
        h('span', { class: 'muted mrow-d' }, body));
    })),
    all.length > 24 ? h('p', { class: 'muted' }, `ほかに ${all.length - 24} 件。`) : null,
    h('p', { class: 'muted' }, '行を押すと、その駅へ移る。番線は、同じ番号の「積む駅」と「降ろす駅」を結ぶ。'),
  ].filter(Boolean) as HTMLElement[];
}

export interface StatsCtx extends PanelCtx { overlay(): boolean; setOverlay(on: boolean): void; focus(e: Ent): void }

export function showStats(c: StatsCtx) {
  const { w } = c;
  const f = flowStats(w);
  const per: Period = PERIODS.includes(statsUi().per as Period) ? (statsUi().per as Period) : 5;
  /** 描き直しても、読んでいた場所を保つ */
  const again = () => { const top = c.sheet.scrollTop; showStats(c); c.sheet.scrollTop = top; };

  // ---- 装置ごと ----
  const machines = [...w.ents.values()].filter((e) => isMachine(e.kind) && e.recipe).sort((a, b) => (a.u || 0) - (b.u || 0));
  const row = (e: Ent) => {
    const r = recipeById(e.recipe)!, ms = machineState(e), st = STATE[ms], ts = e.ts ?? [0, 0, 0], total = ts[0] + ts[1] + ts[2] || 1;
    const b = h('button', { class: 'mrow', type: 'button', onclick: () => { sfx.tap(); c.focus(e); } },
      h('span', { class: 'mrow-t' }, h('b', {}, r.name), h('span', { class: 'muted' }, `${MACHINES[e.kind as keyof typeof MACHINES].name}・${e.n || 0} 回`)),
      h('span', { class: `state ${st.cls}` }, h('i', {}, st.icon), st.text),
      h('span', { class: 'mrow-u' }, `${pct(e.u || 0)} %`),
      meter(e.u || 0, utilClass(e.u || 0)),
      h('span', { class: 'muted mrow-d' }, `通算：稼働 ${pct(ts[0] / total)} %・原料待ち ${pct(ts[1] / total)} %・詰まり ${pct(ts[2] / total)} %。${ms === 3 ? '一時停止中（▶ で動かす）' : ms ? statusOf(e, r) : ''}`));
    return b;
  };

  // ---- 学習 ----
  const learned = RECIPES.filter((r) => w.learned.includes(r.id));
  // 覚えたあとの間違い（復習の問いなど）は、一発で書けたかどうかに数えない
  const missed = setupMissed(w);
  const firstTry = learned.filter((r) => !missed.has(r.id)).length;
  const kStage = (id: string) => w.srs[`k:${id}`]?.iv;
  // 定着：3 日以上空けて思い出せた
  const kFirm = KNOWLEDGE.filter((k) => (w.srs[`k:${k.id}`]?.b ?? 0) >= 3).length, kSeen = KNOWLEDGE.filter((k) => kStage(k.id) !== undefined).length;
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

  const toggle = h('button', { class: 'ghost' + (c.overlay() ? ' on' : ''), type: 'button', id: 'stats-overlay' }, c.overlay() ? '地図に稼働率と流れを表示中（押すと消す）' : '地図に稼働率と流れを表示する');
  toggle.onclick = () => { c.setOverlay(!c.overlay()); sfx.tap(); again(); };
  const heat = h('button', { class: 'ghost' + (heatOn() ? ' on' : ''), type: 'button', id: 'stats-heat' }, heatOn() ? '装置を稼働率で色分け中（押すと消す）' : '装置を稼働率で色分けする');
  heat.onclick = () => { setHeat(!heatOn()); sfx.tap(); again(); };
  const perSeg = h('span', { class: 'seg', role: 'group', id: 'st-period', ariaLabel: '統計の期間' }, ...PERIODS.map((p) => h('button', { type: 'button', id: `st-per-${p || 'all'}`, class: p === per ? 'on' : '', onclick: () => { setStatsUi({ per: p }); sfx.tap(); again(); } }, p ? `${p} 分` : 'すべて')));
  const csv = h('button', { class: 'ghost', type: 'button', id: 'st-csv' }, '表を CSV で保存');
  csv.onclick = async () => {
    const r = await saveText(`chemyth-stats-${stampOf()}.csv`, statsCsv(w, per));
    if (r === 'saved') c.toast('統計の表を CSV で保存した（物質ごとの収支・装置・納品の推移・終えた指令）。', 3000);
    else if (r === 'busy') c.toast('保存の確認がまだ開いている。少し待ってからもう一度。', 3000);
    else if (r === 'failed') c.toast('ここでは保存できなかった。', 3000);
  };

  c.show(
    h('header', {}, h('h2', {}, '統計'), h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる')),
    h('div', { class: 'row st-top' }, h('span', { class: 'muted' }, '期間'), perSeg, h('span', { class: 'muted' }, '納品数の推移・物質ごとの収支・在庫の推移に効く')),
    fold('eff', '工場の効率', true,
      h('div', { class: 'tiles' },
        tile('納品の速さ', f.perMin1.toFixed(1), '個/分', `直近 1 分。5 分平均は ${f.perMin5.toFixed(1)}`, 'st-rate'),
        tile('いまの指令', f.goalPerMin.toFixed(1), '個/分', f.etaSec === null ? '指令の物質はまだ届いていない' : `この速さなら、あと ${mmss(f.etaSec)}`, 'st-goal'),
        tile('装置の稼働率', f.util === null ? '—' : pct(f.util), f.util === null ? '' : '%', `設定済み ${f.machines} 台の、直近 20 秒ほどの平均${f.paused ? `（一時停止の ${f.paused} 台を除く）` : ''}`, 'st-util'),
        tile('捨てた割合', f.wasteRate === null ? '—' : pct(f.wasteRate), f.wasteRate === null ? '' : '%', '直近 5 分に作ったもののうち、廃棄口とあふれで失った分', 'st-waste'),
        tile('操業評価', `S ${grade('S')}・A ${grade('A')}`, '', `B ${grade('B')}・C ${grade('C')}。指令を終えた時点の速さが毎分 30 個で S、15 個で A、6 個で B`, 'st-grade'),
        tile('有毒ガスの排出', String(emitted), '個', emitted ? `大気へそのまま捨てた数。罰はない。多いのは ${worst.map(([s2, n]) => `${label(s2)} ${n}`).join('、')}` : 'まだ有毒な気体を捨てていない', 'st-toxic'),
      ),
      worst.length ? h('p', { class: 'muted' }, `捨てずに無害にするなら（入試で問われる）：${worst.map(([s2]) => `${label(s2)} は${TOXIC[s2]}`).join('。')}。`) : null,
      h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'st-chain', onclick: () => showChain(c, undefined, () => showStats(c)) }, '生産の流れ（指令から原料まで）'),
        h('button', { class: 'ghost', type: 'button', id: 'st-goals', onclick: () => showGoalLog(c) }, '終えた指令'),
        h('button', { class: 'ghost', type: 'button', id: 'st-ach', onclick: () => showAchievements(c) }, `実績 ${ACHIEVEMENTS.filter((a) => w.ach[a.id]).length} / ${ACHIEVEMENTS.length}`))),
    fold('why', '止まっている理由', true,
      ...whyChart(w),
      h('p', { class: 'states' },
        h('span', { class: 'state bad' }, h('i', {}, '✕'), `長く詰まっている ${f.jammed} 台`),
        h('span', { class: 'state warn' }, h('i', {}, '▲'), `原料待ちで止まりがち ${f.starved} 台`),
        h('span', { class: 'state' }, h('i', {}, '？'), `未設定 ${f.unset} 台`))),
    fold('neck', '詰まりの元（押すとその場所へ）', true, ...necks(c)),
    fold('train', '列車の点検（動けない列車と理由）', true, ...trainRows(c)),
    h('div', { class: 'row' }, toggle, heat),
    heatOn() ? h('p', { class: 'muted' }, cvdOn() ? '色分け：青はよく動いている、黄は半分ほど、橙に斜線は止まりがち。近づくと割合も出る。' : '色分け：緑はよく動いている、黄は半分ほど、赤は止まりがち。近づくと割合も出る。') : null,
    c.overlay() ? h('p', { class: 'muted' }, '重ね表示：装置の上に稼働率、詰まっているマスに色、ベルトに毎分の数（引いた視点では、流れの多いベルトほど太い線）。') : null,
    fold('chart', '納品数の推移', true, deliveryChart(w, per)),
    fold('balance', '物質ごとの収支', true, ...balanceTable(w, per)),
    fold('hour', '1 時間の推移', false, ...hourChart(w)),
    fold('stock', '納品所の在庫の推移', false, stockChart(w, per)),
    fold('types', '装置の種類ごと', false, typeTable(w)),
    fold('machines', '装置ごとの稼働率（低い順）', false,
      machines.length
        ? h('div', { class: 'mrows' }, ...machines.slice(0, 12).map(row))
        : h('p', { class: 'muted' }, 'まだ設定済みの装置がない。'),
      machines.length ? h('p', { class: 'muted' }, '行をタップすると、その装置の場所へ移る。稼働率の低い装置が、流れを細くしている所。原料待ちなら上流を、詰まりなら下流を太くしろ。') : null),
    fold('waste', '作った数と捨てた数（通算）', false,
      h('p', { class: 'muted' }, `装置が作ったもの ${made} 個。そのうち廃棄口で ${sumOf(w.vented)} 個、あふれで ${sumOf(w.spilled)} 個を失った${made ? `（${pct(Math.min(1, lost / made))} %）` : ''}。副生成物を別の指令に回せば、この数は減る。`),
      Object.keys(w.vented).length ? h('div', { class: 'chips' }, ...top(w.vented)) : null),

    fold('learn', '学習', true,
      h('div', { class: 'tiles' },
        tile('指令', String(done), `/ ${TOTAL_GOALS}`, `${CHAPTERS.filter((ch, i) => w.progress[i] >= ch.goals.length).length} 章を修了`),
        tile('反応', String(learned.length), `/ ${RECIPES.length}`, learned.length ? `そのうち一発で書けたもの ${pct(firstTry / learned.length)} %` : 'まだ設定した反応がない'),
        tile('計算問題', String(w.solved.length), `/ ${QUESTIONS.length}`, ''),
        tile('知識問題', String(kFirm), `/ ${KNOWLEDGE.length}`, `2 回続けて正解して定着したもの。出題済みは ${kSeen}、復習待ちは ${dueIds(w).length}`),
        tile('演習', tries ? pct(clean / tries) : '—', tries ? '%' : '', tries ? `連鎖計算・構造決定を ${tries} 回解いて、全問正解 ${clean} 回` : 'メニューの連鎖計算・構造決定はまだ解いていない'),
        tile('遊んだ時間', mmss(w.playMs / 1000), '', done ? `指令 1 つあたり平均 ${mmss(w.playMs / 1000 / done)}` : ''),
      ),
      ...learnCharts(w),
      parts.length ? h('h3', {}, '間違いの内訳') : null,
      parts.length ? h('div', { class: 'hbars' }, ...parts.map(([name, n]) => h('div', { class: 'hbar' }, h('span', {}, name), meter(n / pmax), h('span', { class: 'hbar-n' }, `${n} 回`)))) : null,
      weak.length ? h('h3', {}, '手をつけたが進んでいない単元') : null,
      weak.length ? h('div', { class: 'hbars' }, ...weak.map((x) => h('div', { class: 'hbar' }, h('span', {}, x.u.title), meter(x.done / x.total), h('span', { class: 'hbar-n' }, `${x.done} / ${x.total}`)))) : null),
    h('div', { class: 'row' },
      h('button', { class: 'ghost', type: 'button', id: 'st-log', onclick: () => showLog(c) }, '記録（間違えた反応の一覧）'),
      h('button', { class: 'ghost', type: 'button', id: 'st-syl', onclick: () => showSyllabus(c) }, '範囲表'),
      csv),
    h('p', { class: 'muted' }, '見出しを押すと、たたんだり開いたりできる（この端末で覚える）。CSV には、物質ごとの収支（いまの期間）・装置・1 分ごとの納品・終えた指令が入る。'),
  );
}
