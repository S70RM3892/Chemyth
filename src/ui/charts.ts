/**
 * 統計の部品：折れ線グラフ、積み上げの横棒、たためる見出し、表の書き出し（CSV）、装置の記録。
 * グラフの線と面は SVG、文字は HTML で描く（どの画面の幅でも文字が小さくならない）。色だけに頼らず、凡例と値を必ず添える
 */
import { MACHINES } from '../content/machines';
import { productsOf, type Recipe } from '../content/recipes';
import { label } from '../content/substances';
import type { Period } from '../engine/flow';
import type { Ent } from '../engine/world';
import { h } from './dom';

// ---------------- この端末の表示の好み（期間・たたんだ見出し・色分け） ----------------

const KEY = 'chemyth-v2-stats';
export interface StatsUi { per?: Period; fold?: Record<string, boolean>; heat?: boolean }
/** 読めない・書けない（プライベートモードなど）ときは、既定のまま遊べる */
export function statsUi(): StatsUi {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function setStatsUi(p: Partial<StatsUi>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...statsUi(), ...p })); } catch { /* 保存できなくても、この画面の間は使える */ }
}

/** たためる見出し。開いているかどうかを覚える（id ごと） */
export function fold(id: string, title: string, open: boolean, ...kids: (Node | string | null | false | undefined)[]): HTMLDetailsElement {
  const d = h('details', { class: 'st-fold', id: `sec-${id}` }, h('summary', {}, h('h3', {}, title)), ...kids);
  d.open = statsUi().fold?.[id] ?? open;
  d.addEventListener('toggle', () => setStatsUi({ fold: { ...statsUi().fold, [id]: d.open } }));
  return d;
}

// ---------------- グラフ ----------------

const NS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (SVGElement | null)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) if (c) el.append(c);
  return el;
}
export const fmtN = (v: number) => (v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v >= 10 ? v.toFixed(0) : v.toFixed(1));

export interface Series { name: string; vals: number[]; /** 系列の色の番号（1〜4）。1 本だけなら省いてよい（墨の色） */ slot?: number; /** 点線で描く（平均などの目安） */ dash?: boolean }
/**
 * 折れ線グラフ。縦軸は 1 本（0 から最大まで）。系列が 2 本以上なら、凡例に名前といまの値を出す。
 * 線をタップするか、ポインタを乗せると、その時点の値を下に出す。「表で見る」で数の表も開ける
 */
export function lineChart(o: { id: string; title: string; series: Series[]; left: string; right: string; when(i: number): string; unit: string }): HTMLElement {
  const n = Math.max(1, ...o.series.map((s) => s.vals.length)), max = Math.max(1, ...o.series.flatMap((s) => s.vals));
  const W = 1000, H = 100, x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2), y = (v: number) => H - (v / max) * H;
  const rule = svg('line', { class: 'lc-rule', x1: 0, x2: 0, y1: 0, y2: H, visibility: 'hidden', 'vector-effect': 'non-scaling-stroke' });
  const plot = svg('svg', { class: 'lc-plot', viewBox: `0 -3 ${W} ${H + 6}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `${o.title}。${o.series.map((s) => `${s.name} いま ${fmtN(s.vals[s.vals.length - 1] ?? 0)}`).join('、')}` },
    svg('line', { class: 'lc-grid', x1: 0, x2: W, y1: H / 2, y2: H / 2, 'vector-effect': 'non-scaling-stroke' }),
    svg('line', { class: 'lc-base', x1: 0, x2: W, y1: H, y2: H, 'vector-effect': 'non-scaling-stroke' }),
    ...o.series.map((s) => svg('polyline', { class: `lc-line s${s.slot ?? 0}${s.dash ? ' dash' : ''}`, points: s.vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), 'vector-effect': 'non-scaling-stroke' })),
    rule);
  const tip = h('p', { class: 'muted chart-tip' }, 'グラフをタップすると、その時点の数が出る。');
  const show = (ev: PointerEvent) => {
    const r = plot.getBoundingClientRect();
    if (!r.width) return;
    const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left) / r.width) * (n - 1))));
    rule.setAttribute('x1', String(x(i))); rule.setAttribute('x2', String(x(i))); rule.setAttribute('visibility', 'visible');
    tip.textContent = `${o.when(i)}：${o.series.map((s) => `${s.name} ${fmtN(s.vals[i] ?? 0)}`).join('、')}${o.unit}`;
  };
  plot.addEventListener('pointerdown', show);
  plot.addEventListener('pointermove', show);
  const legend = o.series.length > 1 ? h('div', { class: 'lc-legend' }, ...o.series.map((s) => h('span', {}, h('i', { class: `lc-key s${s.slot ?? 0}${s.dash ? ' dash' : ''}` }), `${s.name} `, h('b', {}, fmtN(s.vals[s.vals.length - 1] ?? 0))))) : null;
  const rows = Array.from({ length: n }, (_, i) => n - 1 - i).filter((i) => o.series.some((s) => (s.vals[i] ?? 0) > 0)).slice(0, 60);
  return h('figure', { class: 'chart lc', id: o.id },
    h('figcaption', {}, o.title),
    legend,
    h('div', { class: 'chart-body' }, h('span', { class: 'chart-max' }, fmtN(max)), plot),
    h('div', { class: 'chart-x' }, h('span', {}, o.left), h('span', {}, o.right)),
    tip,
    rows.length ? h('details', {}, h('summary', {}, '表で見る'),
      h('table', { class: 'log' }, h('tr', {}, h('th', {}, ''), ...o.series.map((s) => h('th', { class: 'n' }, s.name))),
        ...rows.map((i) => h('tr', {}, h('td', {}, o.when(i)), ...o.series.map((s) => h('td', { class: 'n' }, fmtN(s.vals[i] ?? 0))))))) : null);
}

/** 積み上げの横棒。状態の色に、記号と言葉を必ず添える（凡例に台数と割合） */
export function stackBar(id: string, parts: { label: string; n: number; cls: string; icon: string; fmt?: (n: number) => string }[]): HTMLElement {
  const all = parts.reduce((a, p) => a + p.n, 0);
  const pct = (v: number) => (all ? Math.round((v / all) * 100) : 0);
  const bar = h('div', { class: 'sbar', role: 'img', ariaLabel: parts.map((p) => `${p.label} ${p.fmt ? p.fmt(p.n) : p.n}（${pct(p.n)} %）`).join('、') },
    ...parts.filter((p) => p.n > 0).map((p) => { const i = h('i', { class: p.cls, title: `${p.label}：${p.fmt ? p.fmt(p.n) : p.n}（${pct(p.n)} %）` }); i.style.flexGrow = String(p.n); return i; }));
  if (!all) bar.append(h('i', { class: 'none' }));
  return h('div', { class: 'sbar-wrap', id }, bar,
    h('div', { class: 'sbar-key' }, ...parts.map((p) => h('span', { class: `state ${p.cls}` }, h('i', {}, p.icon), `${p.label} `, h('b', {}, p.fmt ? p.fmt(p.n) : String(p.n)), h('small', {}, ` ${pct(p.n)} %`)))));
}

// ---------------- 書き出し ----------------

type Saver = { save(r: { filename: string; data: Blob }): Promise<unknown> };
/**
 * 文字のファイルを渡す。claude.ai の中では、ふつうのダウンロードが止められているので、用意された保存の確認（downloads）を使う。
 * それ以外では、ふつうにダウンロードする。CSV は Excel でも文字化けしないよう、先頭に BOM をつける
 */
export async function saveText(name: string, text: string, type = 'text/csv'): Promise<'saved' | 'declined' | 'busy' | 'failed'> {
  const data = new Blob([type === 'text/csv' ? '﻿' + text : text], { type: `${type};charset=utf-8` });
  const cl = (window as unknown as { claude?: { use?: (n: string) => Promise<Saver | null> } }).claude;
  const dl = cl?.use ? await cl.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data }); return 'saved'; }
    catch (e) { const code = (e as { code?: string } | null)?.code; return code === 'declined' ? 'declined' : code === 'rate_limited' ? 'busy' : 'failed'; }
  }
  try {
    const u = URL.createObjectURL(data), a = document.createElement('a');
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(u), 5000);
    return 'saved';
  } catch { return 'failed'; }
}
/** ファイル名に使う、いまの日時（20261112-1504） */
export const stampOf = (t = Date.now()) => { const d = new Date(t), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

// ---------------- 装置の記録（設定シート） ----------------

const span = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} 時間 ${Math.floor((sec % 3600) / 60)} 分` : sec >= 60 ? `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒` : `${Math.round(sec)} 秒`);
/** 装置の記録：反応の回数、作った数、置いてからの時間の内訳（動いていた・原料を待っていた・出口が詰まっていた） */
export function deviceRecord(e: Ent, r: Recipe): HTMLElement {
  const ts = e.ts ?? [0, 0, 0], total = ts[0] + ts[1] + ts[2], n = e.n || 0;
  const made = (r.machine === 'battery' ? r.outputs : productsOf(r)).map(([s, k]) => `${s === 'e' ? 'e⁻' : label(s)} ${n * k}`).join('・');
  return h('div', { class: 'devrec', id: 'cfg-record' },
    h('p', { class: 'devrec-head' }, h('b', {}, '装置の記録'), h('span', { class: 'muted' }, total >= 1 ? `設定してから ${span(total)}（工場を動かしていた時間）` : 'まだ記録がない')),
    h('div', { class: 'tiles devrec-tiles' },
      h('div', { class: 'tile' }, h('span', { class: 'tile-l' }, '反応の回数'), h('span', { class: 'tile-v' }, String(n), h('small', {}, '回')), h('span', { class: 'tile-n' }, n ? `作った数：${made}` : `${MACHINES[e.kind as keyof typeof MACHINES].name}が反応を終えるたびに増える`)),
      h('div', { class: 'tile' }, h('span', { class: 'tile-l' }, '動いていたときの速さ'), h('span', { class: 'tile-v' }, ts[0] >= 1 ? fmtN((n / ts[0]) * 60) : '—', h('small', {}, '回/分')), h('span', { class: 'tile-n' }, `直近の稼働率 ${Math.round((e.u || 0) * 100)} %`))),
    total >= 1 ? stackBar('cfg-time', [
      { label: '稼働', n: ts[0], cls: 'good', icon: '●', fmt: span },
      { label: '原料待ち', n: ts[1], cls: 'warn', icon: '▲', fmt: span },
      { label: '出口詰まり', n: ts[2], cls: 'bad', icon: '✕', fmt: span },
    ]) : null,
    total >= 1 && ts[1] > ts[0] ? h('p', { class: 'muted' }, '原料を待っている時間が長い。上流の装置か採取機を増やすか、ベルトを太くしろ。') : null,
    total >= 1 && ts[2] > ts[0] ? h('p', { class: 'muted' }, '出口が詰まっている時間が長い。生成物の行き先（ベルト・廃棄口）を見直せ。') : null,
    e.kind === 'electrolyzer' ? h('p', { class: 'muted' }, (e.pw || 0) > 0 ? `電池の電力で 2 倍速（残り ${Math.ceil(e.pw!)} 秒ぶん）。` : '電池の e⁻ を流し込むと 2 倍速になる。') : null);
}
