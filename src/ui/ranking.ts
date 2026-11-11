import { RANKING } from '../config';
import { TOTAL_GOALS } from '../content/goals';
import { doneCount, summarize, type World } from '../engine/world';
import { h } from './dom';
import type { PanelCtx } from './panels';
import { sfx } from './sound';
import { SLOTS, slotName, store } from './title';

interface Row { rank: number; name: string; done: number; points: number; play_ms: number; me: boolean }

export const online = () => !!(RANKING.url && RANKING.key);

function device(): string {
  let d = store.meta().device;
  if (!d) {
    d = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
    store.setMeta({ device: d });
  }
  return d;
}

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${RANKING.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: RANKING.key, authorization: `Bearer ${RANKING.key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** 成績を送る。名前を登録していなければ何もしない。失敗しても遊びは止めない */
export async function submitScore(w: World): Promise<boolean> {
  const name = store.meta().name;
  if (!online() || !name) return false;
  try {
    await rpc('chemyth_submit', { p_device: device(), p_name: name, p_done: doneCount(w), p_points: w.points, p_play_ms: Math.round(w.playMs) });
    return true;
  } catch {
    return false;
  }
}

const fmtTime = (ms: number) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`; };

function table(rows: Row[]): HTMLElement {
  return h('table', { class: 'rank' },
    h('tr', {}, h('th', {}, '順位'), h('th', {}, '名前'), h('th', { class: 'n' }, '達成'), h('th', { class: 'n' }, '研究点'), h('th', { class: 'n' }, '時間')),
    ...rows.map((r) => h('tr', { class: r.me ? 'me' : '' }, h('td', { class: 'n' }, String(r.rank)), h('td', {}, r.name),
      h('td', { class: 'n' }, `${r.done} / ${TOTAL_GOALS}`), h('td', { class: 'n' }, String(r.points)), h('td', { class: 'n' }, fmtTime(r.play_ms)))));
}

/** この端末のノート同士の順位 */
function localRows(): Row[] {
  const rows = Array.from({ length: SLOTS }, (_, i) => ({ n: i + 1, sum: summarize(store.read(i + 1)) })).filter((x) => x.sum)
    .map((x) => ({ rank: 0, name: slotName(x.n), done: x.sum!.done, points: x.sum!.points, play_ms: x.sum!.playMs, me: false }));
  rows.sort((a, b) => b.done - a.done || b.points - a.points || a.play_ms - b.play_ms);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function showRanking(c: PanelCtx) {
  const close = h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる');
  const head = h('header', {}, h('h2', {}, 'ランキング'), close);
  const rule = h('p', { class: 'muted' }, '指令の達成数が多い順。同じなら研究点が多い順、それも同じなら遊んだ時間が短い順。');
  if (!online()) {
    const rows = localRows();
    c.show(head, rule, h('h3', {}, 'この端末のノート'), rows.length ? table(rows) : h('p', { class: 'muted' }, 'まだ記録がない。'),
      h('p', { class: 'muted' }, 'オンラインのランキングは、接続先がまだ設定されていない。'));
    return;
  }
  const body = h('div', { class: 'stack', id: 'rank-body' }, h('p', { class: 'muted' }, '読み込んでいる…'));
  const input = h('input', { class: 'namebox', id: 'rank-name', type: 'text', maxLength: 12, placeholder: '表示する名前（12 文字まで）', value: store.meta().name ?? '' });
  const note = h('p', { class: 'feedback' }, '');
  const load = async () => {
    try {
      const rows = await rpc<Row[]>('chemyth_top', { p_device: device(), p_limit: 50 });
      body.replaceChildren(rows.length ? table(rows) : h('p', { class: 'muted' }, 'まだ誰も登録していない。'));
    } catch {
      body.replaceChildren(h('p', { class: 'muted' }, 'いまは読み込めない。この画面（claude.ai 上の表示など）からは外部へ接続できないことがある。GitHub Pages 版で開け。'), table(localRows()));
    }
  };
  const send = h('button', { class: 'primary', type: 'button', id: 'rank-send' }, '名前を登録して送る');
  send.onclick = async () => {
    const name = input.value.trim().slice(0, 12);
    if (!name) { note.textContent = '名前を入れろ。'; return; }
    store.setMeta({ name });
    note.textContent = '送っている…';
    const ok = await submitScore(c.w);
    note.textContent = ok ? '送った。指令を達成するたびに自動で更新される。' : '送れなかった。あとでもう一度試せ。';
    if (ok) { sfx.ok(); void load(); }
  };
  c.show(head, rule,
    h('div', { class: 'row' }, input, send), note,
    h('p', { class: 'muted' }, '名前は誰でも見られる。本名や学校名は入れるな。成績は自己申告で、不正を完全には防げない。'),
    body);
  void load();
}
