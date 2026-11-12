import { accountAvailable, accountLine, conflictSlots, onAccountChange, renderAccount, signedIn, slotErased, syncIfStale } from './account';
import { ELEMENTS } from '../content/elements';
import { CHAPTERS, TOTAL_GOALS } from '../content/goals';
import { chaptersDone } from '../engine/world';
import { deserialize, summarize } from '../engine/world';
import { $, h } from './dom';
import { setSound, sfx, soundOn } from './sound';
import { drawElement } from './token';
import { applySkin, applyTheme, skinName, type Skin, type ThemeChoice } from './theme';

export const SLOTS = 3;
const slotKey = (n: number) => `chemyth-v2-slot-${n}`;
const META = 'chemyth-v2-meta';

type Cam = { x: number; y: number; z: number };
/** 端末ごとの設定。セーブ枠とは別に置く */
export interface Meta {
  sound?: boolean; theme?: ThemeChoice; skin?: Skin; name?: string; device?: string; overlay?: boolean; music?: boolean; gfx?: 'high' | 'mid' | 'plain'; view3d?: 'on' | 'off'; goalFold?: boolean; minimap?: boolean;
  sleep?: { on: boolean; bed: number; wake: number }; ext?: { day: string; until: number }; warned?: string;
  /** 好み（prefs.ts） */
  prefs?: Record<string, unknown>;
  /** セーブ枠ごとの、最後に見ていた場所と、覚えた場所（2 か所） */
  cams?: Record<string, Cam>; marks?: Record<string, (Cam | null)[]>;
  /** 最後に見た更新のお知らせ */
  news?: string;
  /** 下の道具の帯で、最後に開いていた組 */
  tab?: string;
  /** 最後に保存できた時刻と、保存に失敗した時刻 */
  savedAt?: number;
}
// セーブはこの端末のブラウザの中だけに置く。読み書きに失敗しても遊べるようにする
export const store = {
  read(n: number): string | null { try { return localStorage.getItem(slotKey(n)); } catch { return null; } },
  /** セーブを書いたときに呼ぶもの（同期の予約に使う） */
  onWrite: null as ((n: number) => void) | null,
  write(n: number, json: string, quiet = false): boolean { try { localStorage.setItem(slotKey(n), json); if (!quiet) store.onWrite?.(n); return true; } catch { return false; } },
  erase(n: number) { try { localStorage.removeItem(slotKey(n)); localStorage.removeItem(`chemyth-v2-album-${n}`); } catch { /* 同上 */ } },
  meta(): Meta { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch { return {}; } },
  setMeta(m: Meta) { try { localStorage.setItem(META, JSON.stringify({ ...store.meta(), ...m })); } catch { /* 同上 */ } },
};

export const fmtTime = (ms: number) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} 時間 ${m % 60} 分` : `${m} 分`; };
export const fmtDate = (t: number) => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

export interface TitleApi { start(slot: number, json: string | null): void }

/** セーブ枠の呼び名。文具スキンではノート、工業スキンでは生産ライン、研究所スキンでは研究室 */
export const slotName = (n: number) => (skinName() === 'punk' ? `第 ${n} ライン` : skinName() === 'arcane' ? `実験録 第 ${n} 巻` : skinName() === 'lab' ? `第 ${n} 研究室` : `ノート ${n} 冊目`);

/** 明暗の切り替えボタン。呼び名はスキンごとに違う（ノート／黒板、光／闇、白の研究棟／深夜のラボ） */
export function themeButtons(after: () => void): HTMLElement[] {
  const cur = store.meta().theme ?? 'auto', punk = skinName() === 'punk', arcane = skinName() === 'arcane', lab = skinName() === 'lab';
  return ([['auto', '自動'], ['light', punk ? '光' : arcane ? '羊皮紙' : lab ? '白の研究棟' : 'ノート'], ['dark', punk ? '闇' : arcane ? '夜' : lab ? '深夜のラボ' : '黒板']] as [ThemeChoice, string][]).map(([id, name]) =>
    h('button', { type: 'button', id: `theme-${id}`, class: cur === id ? 'on' : '', onclick: () => { store.setMeta({ theme: id }); applyTheme(id); sfx.tap(); after(); } }, name));
}
/** スキンの切り替えボタン */
export function skinButtons(after: () => void): HTMLElement[] {
  const cur = skinName();
  return ([['note', '文具'], ['punk', '工業'], ['arcane', '魔術'], ['lab', '研究所']] as [Skin, string][]).map(([id, name]) =>
    h('button', { type: 'button', id: `skin-${id}`, class: cur === id ? 'on' : '', onclick: () => { store.setMeta({ skin: id }); applySkin(id); sfx.tap(); after(); } }, name));
}

/** 本棚：終えた章が、背表紙になって 1 冊ずつ並ぶ。途中の章は、進んだぶんだけ色がつく。評価 S・A だけで終えた章には印がつく */
function shelf(progress: number[], grades: Record<string, string>): HTMLElement {
  const done = chaptersDone(progress), n = done.filter(Boolean).length;
  return h('div', { class: 'shelf', title: `${n} / ${CHAPTERS.length} 章を修了` }, ...CHAPTERS.map((c, i) => {
    const frac = Math.min(1, (progress[i] || 0) / c.goals.length);
    const fine = done[i] && c.goals.every((g, k) => g.strict || ['S', 'A'].includes(grades[`${i}:${k}`]));
    const spine = h('i', { class: 'spine' + (done[i] ? ' done' : frac > 0 ? ' part' : '') + (fine ? ' fine' : ''), title: `${c.name}　${progress[i] || 0} / ${c.goals.length}` }, String(i + 1));
    spine.style.setProperty('--fill', `${Math.round(frac * 100)}%`);
    spine.style.setProperty('--hue', String((i * 47) % 360));
    return spine;
  }), h('span', { class: 'shelf-n' }, `${n} / ${CHAPTERS.length} 冊`));
}

export function initTitle(api: TitleApi) {
  const root = $('title'), list = $('slots'), bg = $<HTMLCanvasElement>('title-bg'), panel = $('title-panel');
  const ctx = bg.getContext('2d')!;
  let running = false, confirmErase = 0, accountOpen = false;
  const acBtn = $<HTMLButtonElement>('title-account');
  acBtn.onclick = () => { accountOpen = !accountOpen; sfx.tap(); paint(); };
  // 同期が進んだら、一覧を描き直す（受け取ったセーブが、すぐ見えるように）
  onAccountChange(() => { if (!root.hidden) paint(); });

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
      ctx.globalAlpha = f.a * 0.55;
      drawElement(ctx, f.el.sym, f.x * w, f.y * hh - 20, f.r);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  };

  const paint = () => {
    acBtn.hidden = !accountAvailable();
    acBtn.textContent = accountLine();
    acBtn.classList.toggle('picked', accountOpen);
    acBtn.classList.toggle('warn', conflictSlots().length > 0);
    if (accountOpen) { panel.hidden = false; renderAccount(panel, () => { accountOpen = false; paint(); }, paint); } else panel.hidden = true;
    list.replaceChildren(...Array.from({ length: SLOTS }, (_, i) => {
      const n = i + 1, json = store.read(n), sum = summarize(json);
      if (!sum) {
        return h('div', { class: 'slotcard empty' },
          h('div', { class: 'stack tight' }, h('b', {}, slotName(n)), h('span', { class: 'muted' }, json ? '古い版のデータ（読めない）' : skinName() === 'punk' ? '未稼働' : skinName() === 'lab' ? 'まだ何も記録していない' : 'まだ何も書いていない')),
          h('div', { class: 'row' },
            h('button', { class: 'primary', type: 'button', id: `slot-${n}-new`, onclick: () => { sfx.ok(); api.start(n, null); } }, 'はじめる'),
            h('button', { class: 'ghost', type: 'button', id: `slot-${n}-import`, onclick: () => importInto(n) }, '読み込む')));
      }
      const erase = h('button', { class: 'ghost warn', type: 'button', id: `slot-${n}-erase` }, confirmErase === n ? (signedIn() ? '本当に消す（預けた分も）' : '本当に消す') : '消す');
      erase.onclick = () => { if (confirmErase === n) { store.erase(n); slotErased(n); confirmErase = 0; sfx.erase(); } else confirmErase = n; paint(); };
      return h('div', { class: 'slotcard' },
        h('div', { class: 'stack tight' }, h('b', {}, slotName(n)),
          h('span', {}, sum.done >= TOTAL_GOALS ? `全 ${TOTAL_GOALS} 指令を達成` : `${CHAPTERS[sum.chapter]?.name ?? ''}　達成 ${sum.done} / ${TOTAL_GOALS}`),
          h('span', { class: 'muted' }, `${fmtTime(sum.playMs)}　研究点 ${sum.points}　${fmtDate(sum.savedAt)}`),
          h('span', { class: 'slot-learn' }, [sum.due ? `復習 ${sum.due} 問が待っている` : '待っている復習なし', sum.exam !== null ? `次の試験まで ${sum.exam} 日` : ''].filter(Boolean).join('　')),
          sum.morning ? h('span', { class: 'slot-morning' }, '今朝の 10 問：昨夜の問いが、寝ている間に残ったかを確かめる。開くとすぐ出る。') : null,
          shelf(sum.progress, sum.grades)),
        h('div', { class: 'row' },
          h('button', { class: 'primary', type: 'button', id: `slot-${n}-go`, onclick: () => { sfx.ok(); api.start(n, json); } }, 'つづける'),
          h('button', { class: 'ghost', type: 'button', id: `slot-${n}-export`, onclick: () => exportFrom(n, json!) }, '書き出す'),
          erase));
    }));
    const snd = $('title-sound');
    snd.textContent = soundOn() ? '音：あり' : '音：なし';
    $('title-theme').replaceChildren(...themeButtons(paint));
    $('title-skin').replaceChildren(...skinButtons(paint));
  };

  const exportFrom = (n: number, json: string) => {
    accountOpen = false; acBtn.classList.remove('picked');
    const area = h('textarea', { id: 'io-text', readOnly: true, value: json, rows: 5 });
    const note = h('p', { class: 'muted' }, '');
    panel.replaceChildren(h('b', {}, `${slotName(n)}の書き出し`),
      h('p', { class: 'muted' }, 'この文字列を控えておけば、別の端末やブラウザの「読み込む」で同じ状態に戻せる。'), area,
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', id: 'io-copy', onclick: () => {
          navigator.clipboard.writeText(json).then(() => { note.textContent = 'コピーした。'; }, () => { area.select(); note.textContent = 'コピーできなかった。選択された文字列を自分でコピーしろ。'; });
        } }, 'コピーする'),
        h('button', { class: 'ghost', type: 'button', onclick: paint }, '閉じる')), note);
    panel.hidden = false;
  };
  const importInto = (n: number) => {
    accountOpen = false; acBtn.classList.remove('picked');
    const area = h('textarea', { id: 'io-text', rows: 5, placeholder: '書き出した文字列をここに貼り付ける' });
    const note = h('p', { class: 'feedback' }, '');
    panel.replaceChildren(h('b', {}, `${slotName(n)}に読み込む`), area,
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
    show() { confirmErase = 0; root.hidden = false; paint(); syncIfStale(); if (!running) { running = true; requestAnimationFrame(tick); } },
    hide() { root.hidden = true; running = false; },
  };
}
