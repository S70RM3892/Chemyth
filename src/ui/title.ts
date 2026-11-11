import { ELEMENTS } from '../content/elements';
import { GOALS, chapterOf } from '../content/goals';
import { deserialize, summarize } from '../engine/world';
import { $, h } from './dom';
import { setSound, sfx, soundOn } from './sound';
import { drawElement } from './token';

export const SLOTS = 3;
const slotKey = (n: number) => `chemyth-v2-slot-${n}`;
const META = 'chemyth-v2-meta';

// セーブはこの端末のブラウザの中だけに置く。読み書きに失敗しても遊べるようにする
export const store = {
  read(n: number): string | null { try { return localStorage.getItem(slotKey(n)); } catch { return null; } },
  write(n: number, json: string): boolean { try { localStorage.setItem(slotKey(n), json); return true; } catch { return false; } },
  erase(n: number) { try { localStorage.removeItem(slotKey(n)); } catch { /* 同上 */ } },
  meta(): { sound?: boolean } { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch { return {}; } },
  setMeta(m: { sound?: boolean }) { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* 同上 */ } },
};

const fmtTime = (ms: number) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} 時間 ${m % 60} 分` : `${m} 分`; };
const fmtDate = (t: number) => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

export interface TitleApi { start(slot: number, json: string | null): void }

export function initTitle(api: TitleApi) {
  const root = $('title'), list = $('slots'), bg = $<HTMLCanvasElement>('title-bg'), panel = $('title-panel');
  const ctx = bg.getContext('2d')!;
  let running = false, confirmErase = 0;

  // 背景：元素の形がゆっくり漂う
  const floats = Array.from({ length: 34 }, (_, i) => ({
    el: ELEMENTS[i % ELEMENTS.length], x: Math.random(), y: Math.random(), r: 14 + Math.random() * 26,
    vx: (Math.random() - 0.5) * 0.012, vy: -0.006 - Math.random() * 0.012, a: 0.1 + Math.random() * 0.22,
  }));
  let last = 0;
  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = bg.clientWidth, hh = bg.clientHeight;
    if (bg.width !== Math.round(w * dpr)) { bg.width = Math.round(w * dpr); bg.height = Math.round(hh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    for (const f of floats) {
      f.x = (f.x + f.vx * dt + 1) % 1;
      f.y = (f.y + f.vy * dt + 1.1) % 1.1;
      ctx.globalAlpha = f.a;
      drawElement(ctx, f.el.sym, f.x * w, f.y * hh - 20, f.r);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  };

  const paint = () => {
    panel.hidden = true;
    list.replaceChildren(...Array.from({ length: SLOTS }, (_, i) => {
      const n = i + 1, json = store.read(n), sum = summarize(json);
      if (!sum) {
        return h('div', { class: 'slotcard empty' },
          h('div', { class: 'stack tight' }, h('b', {}, `セーブ ${n}`), h('span', { class: 'muted' }, json ? '古い版のデータ（読めない）' : 'からっぽ')),
          h('div', { class: 'row' },
            h('button', { class: 'primary', type: 'button', id: `slot-${n}-new`, onclick: () => { sfx.ok(); api.start(n, null); } }, 'はじめる'),
            h('button', { class: 'ghost', type: 'button', id: `slot-${n}-import`, onclick: () => importInto(n) }, '読み込む')));
      }
      const ch = chapterOf(sum.goal);
      const erase = h('button', { class: 'ghost warn', type: 'button', id: `slot-${n}-erase` }, confirmErase === n ? '本当に消す' : '消す');
      erase.onclick = () => { if (confirmErase === n) { store.erase(n); confirmErase = 0; sfx.erase(); } else confirmErase = n; paint(); };
      return h('div', { class: 'slotcard' },
        h('div', { class: 'stack tight' }, h('b', {}, `セーブ ${n}`),
          h('span', {}, ch ? `${ch.name}　指令 ${sum.goal + 1} / ${GOALS.length}` : `全 ${GOALS.length} 指令を達成`),
          h('span', { class: 'muted' }, `${fmtTime(sum.playMs)}　研究点 ${sum.points}　${fmtDate(sum.savedAt)}`)),
        h('div', { class: 'row' },
          h('button', { class: 'primary', type: 'button', id: `slot-${n}-go`, onclick: () => { sfx.ok(); api.start(n, json); } }, 'つづける'),
          h('button', { class: 'ghost', type: 'button', id: `slot-${n}-export`, onclick: () => exportFrom(n, json!) }, '書き出す'),
          erase));
    }));
    const snd = $('title-sound');
    snd.textContent = soundOn() ? '音：あり' : '音：なし';
  };

  const exportFrom = (n: number, json: string) => {
    const area = h('textarea', { id: 'io-text', readOnly: true, value: json, rows: 5 });
    const note = h('p', { class: 'muted' }, '');
    panel.replaceChildren(h('b', {}, `セーブ ${n} の書き出し`),
      h('p', { class: 'muted' }, 'この文字列を控えておけば、別の端末やブラウザの「読み込む」で同じ状態に戻せる。'), area,
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', id: 'io-copy', onclick: () => {
          navigator.clipboard.writeText(json).then(() => { note.textContent = 'コピーした。'; }, () => { area.select(); note.textContent = 'コピーできなかった。選択された文字列を自分でコピーしろ。'; });
        } }, 'コピーする'),
        h('button', { class: 'ghost', type: 'button', onclick: paint }, '閉じる')), note);
    panel.hidden = false;
  };
  const importInto = (n: number) => {
    const area = h('textarea', { id: 'io-text', rows: 5, placeholder: '書き出した文字列をここに貼り付ける' });
    const note = h('p', { class: 'feedback' }, '');
    panel.replaceChildren(h('b', {}, `セーブ ${n} に読み込む`), area,
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', id: 'io-load', onclick: () => {
          const text = area.value.trim();
          if (!deserialize(text)) { note.textContent = '読めない。書き出した文字列を最初から最後まで貼り付けろ。'; return; }
          store.write(n, text);
          sfx.ok();
          paint();
        } }, '読み込む'),
        h('button', { class: 'ghost', type: 'button', onclick: paint }, 'やめる')), note);
    panel.hidden = false;
  };

  $('title-sound').onclick = () => { setSound(!soundOn()); store.setMeta({ sound: soundOn() }); sfx.tap(); paint(); };

  return {
    show() { confirmErase = 0; root.hidden = false; paint(); if (!running) { running = true; requestAnimationFrame(tick); } },
    hide() { root.hidden = true; running = false; },
  };
}
