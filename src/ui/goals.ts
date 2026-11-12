/**
 * 終えた指令の一覧：章ごとに、評価・かかった時間（工場を動かしていた時間）・見込み（指令の 4 分の 1 の時点の速さで見積もった時間）。
 * 見込みと実際の差から、自分の見積もりがどれくらい当たるかがわかる
 */
import { CHAPTERS, TOTAL_GOALS } from '../content/goals';
import { label, sub } from '../content/substances';
import { goalRecords, type GoalRec } from '../engine/flow';
import { doneCount } from '../engine/world';
import { h } from './dom';
import type { PanelCtx } from './panels';

export const dur = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} 時間 ${Math.round((sec % 3600) / 60)} 分` : sec >= 60 ? `${Math.floor(sec / 60)} 分 ${String(Math.round(sec % 60)).padStart(2, '0')} 秒` : `${Math.round(sec)} 秒`);
/** 見込みと実際の差（実際 − 見込み）を、割合つきで */
function diff(g: GoalRec): string {
  if (g.eta === null || g.sec === null) return '';
  const d = g.sec - g.eta, p = g.eta > 0 ? Math.round((d / g.eta) * 100) : 0;
  return Math.abs(d) < 5 ? 'ほぼ見込みどおり' : `${d > 0 ? '+' : '−'}${dur(Math.abs(d))}（${d > 0 ? '+' : '−'}${Math.abs(p)} %）`;
}
const name = (g: GoalRec) => [g.s, ...(g.also ?? [])].map((s) => (s === 'e' ? 'e⁻' : sub(s).name)).join('・') + (g.rate ? `（毎分 ${g.rate} 個）` : '');

export function showGoalLog(c: PanelCtx) {
  const { w } = c;
  const recs = goalRecords(w), all = recs.flatMap((x) => x.goals);
  const timed = all.filter((g) => g.sec !== null), est = all.filter((g) => g.sec !== null && g.eta !== null);
  // 見込みのずれ：実際との差の割合の中央値
  const errs = est.map((g) => Math.abs(g.sec! - g.eta!) / Math.max(1, g.eta!)).sort((a, b) => a - b);
  const mid = errs.length >> 1, median = errs.length ? (errs.length % 2 ? errs[mid] : (errs[mid - 1] + errs[mid]) / 2) : null;
  const grade = (k: string) => all.filter((g) => g.grade === k).length;
  const last = recs[recs.length - 1]?.ch;
  c.show(
    h('header', {}, h('h2', {}, '終えた指令'), h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる')),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('span', { class: 'tile-l' }, '終えた指令'), h('span', { class: 'tile-v' }, String(doneCount(w)), h('small', {}, `/ ${TOTAL_GOALS}`)), h('span', { class: 'tile-n' }, `評価 S ${grade('S')}・A ${grade('A')}・B ${grade('B')}・C ${grade('C')}`)),
      h('div', { class: 'tile' }, h('span', { class: 'tile-l' }, '1 つあたりの時間'), h('span', { class: 'tile-v' }, timed.length ? dur(timed.reduce((a, g) => a + g.sec!, 0) / timed.length) : '—'), h('span', { class: 'tile-n' }, '工場を動かしていた時間の平均')),
      h('div', { class: 'tile', id: 'gl-eta' }, h('span', { class: 'tile-l' }, '見込みのずれ'), h('span', { class: 'tile-v' }, median === null ? '—' : String(Math.round(median * 100)), median === null ? null : h('small', {}, '%')), h('span', { class: 'tile-n' }, median === null ? '指令の 4 分の 1 を終えたときに、終わるまでの時間を見積もる。終えると、ここに実際との差が出る' : `見込みと実際の差の中央値（${est.length} 件）`))),
    h('p', { class: 'muted' }, '見込みは、指令の 4 分の 1 を納めた時点の速さから出した、終わるまでの時間（それまでにかかった時間を含む）。実際が見込みより長ければ、途中で流れが細くなっている。'),
    recs.length ? null : h('p', {}, 'まだ終えた指令はない。'),
    ...recs.map((r) => {
      const d = h('details', { class: 'gl-ch', id: `gl-ch-${r.ch}` },
        h('summary', {}, h('b', {}, r.name), h('span', { class: 'muted' }, `　${r.goals.length} / ${r.total}`)),
        h('table', { class: 'log gl' },
          h('tr', {}, h('th', {}, ''), h('th', {}, '物質'), h('th', {}, '評価'), h('th', { class: 'n' }, 'かかった時間'), h('th', { class: 'n' }, '見込み → 差')),
          ...r.goals.map((g) => h('tr', {},
            h('td', { class: 'n' }, String(g.i + 1)),
            h('td', {}, name(g), g.s !== 'e' && !g.also ? h('span', { class: 'muted' }, ` ${label(g.s)}`) : null),
            h('td', {}, g.grade ? h('span', { class: `gl-g g${g.grade}` }, g.grade) : h('span', { class: 'muted' }, '—')),
            h('td', { class: 'n' }, g.sec !== null ? dur(g.sec) : g.tested ? '確認テストで短縮' : '—'),
            h('td', { class: 'n' }, g.eta !== null ? h('span', {}, dur(g.eta), h('br', {}), h('small', { class: g.sec !== null && g.sec > g.eta * 1.25 ? 'late' : 'muted' }, diff(g))) : h('span', { class: 'muted' }, '—'))))));
      d.open = r.ch === last || r.ch === w.chapter;
      return d;
    }),
    h('p', { class: 'muted' }, `評価は、指令を終えた時点の、指令の物質の納品の速さで決まる（毎分 6 個で B、15 個で A、30 個で S）。仕分けの指令には評価をつけない。${CHAPTERS.length} 章のうち、手をつけた章だけを出している。`),
  );
}
