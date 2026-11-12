/**
 * 実績の画面と、得たときの知らせ。あわせて、工場を動かしている間の小さな手ごたえ（研究点の数字が弾む）。
 * statsTick は、本編の工場を動かしている間だけ呼ぶ（課題の工場では呼ばない）
 */
import { ACHIEVEMENTS, checkAchievements, type AchGroup, type Achievement } from '../engine/achieve';
import { noteEta } from '../engine/flow';
import type { World } from '../engine/world';
import { h } from './dom';
import type { PanelCtx } from './panels';
import { sfx } from './sound';
import { fmtDate } from './title';

// ---------------- 得たときの知らせ ----------------

let lastTick = 0, popEl: HTMLElement | null = null, popTimer = 0;
const queue: Achievement[][] = [];
/** 通知とは別の小さな札で知らせる（通知を上書きしない）。続けて得たものは、順に出す */
function pop(list: Achievement[]) {
  const app = document.getElementById('app');
  if (!app) return;
  if (!popEl) {
    popEl = h('div', { id: 'ach-pop', role: 'status', hidden: true });
    popEl.addEventListener('click', () => { popEl!.hidden = true; clearTimeout(popTimer); next(); });
    app.append(popEl);
  }
  if (!popEl.hidden) { queue.push(list); return; }
  const many = list.length > 2;
  popEl.replaceChildren(h('b', { class: 'ach-medal' }, '★'),
    h('span', {}, h('small', {}, '実績'), many ? `${list.length} 個を得た（メニューの「実績」で見られる）` : list.map((a) => `「${a.name}」`).join(''),
      !many && list.length === 1 ? h('small', { class: 'ach-how' }, list[0].how) : null));
  popEl.hidden = false;
  sfx.ok();
  clearTimeout(popTimer);
  popTimer = window.setTimeout(() => { if (popEl) popEl.hidden = true; next(); }, 4200);
}
const next = () => { const l = queue.shift(); if (l) window.setTimeout(() => pop(l), 250); };

/** 工場を動かしている間、半秒に 1 回：指令の見込みを記録し、新しく得た実績を知らせる */
export function statsTick(w: World, now = performance.now()) {
  if (now - lastTick < 500) return;
  lastTick = now;
  noteEta(w);
  const got = checkAchievements(w);
  if (got.length) pop(got);
}

// ---------------- 実績の画面 ----------------

const GROUPS: AchGroup[] = ['学習', '工場', '納品', '指令'];
export function showAchievements(c: PanelCtx) {
  const { w } = c, now = Date.now();
  checkAchievements(w, now);
  const have = ACHIEVEMENTS.filter((a) => w.ach[a.id]).length;
  const card = (a: Achievement) => {
    const at = w.ach[a.id], [cur, goal] = a.prog(w, now), f = Math.max(0, Math.min(1, cur / goal));
    const bar = h('span', { class: 'meter' }, h('i', {}));
    (bar.firstChild as HTMLElement).style.width = `${Math.round(f * 100)}%`;
    return h('div', { class: 'ach' + (at ? ' got' : ''), id: `ach-${a.id}` },
      h('b', { class: 'ach-medal' }, at ? '★' : '☆'),
      h('div', { class: 'stack' },
        h('b', {}, a.name),
        h('span', { class: 'muted' }, a.how),
        at ? h('span', { class: 'ach-at' }, `${fmtDate(at)} に得た`)
          : goal > 1 ? h('span', { class: 'ach-prog' }, bar, h('small', {}, `いま ${Math.min(cur, goal)} / ${goal}`)) : h('span', { class: 'ach-at muted' }, 'まだ')));
  };
  c.show(
    h('header', {}, h('h2', {}, '実績'), h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる')),
    h('p', {}, h('b', { class: 'points' }, `${have} / ${ACHIEVEMENTS.length}`), '　工場づくり・納品・指令・学習の節目。得た日時はセーブに残る。まだのものには、得る条件といまの進み具合を出す。'),
    ...GROUPS.flatMap((g) => {
      const list = ACHIEVEMENTS.filter((a) => a.group === g);
      return [h('h3', {}, `${g}　${list.filter((a) => w.ach[a.id]).length} / ${list.length}`), h('div', { class: 'achs' }, ...list.map(card))];
    }),
  );
}

// ---------------- 研究点の数字 ----------------

let shown: { w: World | null; n: number } = { w: null, n: 0 };
/** 上の帯の研究点。増えたときだけ、数字が弾んで増えた数が浮かぶ（動きを減らす設定では弾まない）。ノートを開き直したときは弾ませない */
export function paintPts(el: HTMLElement, w: World) {
  const n = w.points;
  if (shown.w === w && n === shown.n && el.textContent === String(n)) return;
  const gain = shown.w === w ? n - shown.n : 0;
  shown = { w, n };
  el.textContent = String(n);
  if (gain <= 0) return;
  el.dataset.gain = `+${gain}`;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
