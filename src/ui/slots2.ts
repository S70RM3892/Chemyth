/**
 * ノートまわりの追加。
 * - 前日の控え：その日（朝 4 時区切り）はじめてノートを書くとき、書く前の中身を別の場所に控える。タイトルの「前日に戻す」で戻せる
 * - 工場の名前：タイトルのノートとメニューに出す（セーブに入るので、書き出し・同期でも一緒に動く）
 * - ノートの複製：空いている枠へ写す
 * - タイトルの小さな絵：アルバムのいちばん新しい写真。なければ、工場を小さく描いたもの
 * - 保存領域の使い方と、アルバムが入りきらないときの詰め方（古い写真から小さくし、それでも足りなければ古いものから落とす）
 */
import { TOTAL_GOALS } from '../content/goals';
import { hubRect } from '../content/map';
import { dailyOffer, dailyPlan, dropOldest, fmtBytes, parseDaily, storeUse, type Daily, type DailySum, type StoreItem } from '../engine/device';
import { dayKey } from '../engine/fsrs';
import { pack, unpack } from '../engine/sync';
import { FLOOR_DY, FNAME_MAX, deserialize, summarize } from '../engine/world';
import { h } from './dom';
import { draw } from './render';
import { sfx } from './sound';
import { SLOTS, fmtDate, fmtTime, slotName, store } from './title';

const slotKey = (n: number) => `chemyth-v2-slot-${n}`;
const albumKey = (n: number) => `chemyth-v2-album-${n}`;
const dailyKey = (n: number) => `chemyth-v2-daily-${n}`;
const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string): boolean => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const sumOf = (json: string | null): DailySum | null => { const s = summarize(json); return s ? { done: s.done, points: s.points, playMs: s.playMs, savedAt: s.savedAt } : null; };

// ---------------- 前日の控え ----------------

/** 枠ごとの、控えた日（毎回読み直さないで済むように覚えておく） */
const dailyDay: Record<number, string> = {};
/** 「前日に戻す」の最中は、控えを取り直さない */
let hold = false;
export const readDaily = (n: number): Daily | null => parseDaily(get(dailyKey(n)));

/** ノートを書く直前に呼ぶ（title.ts の store.write から）。その日はじめてなら、書く前の中身を控えに回す。控えは縮めて置く */
function beforeWrite(n: number) {
  if (hold) return;
  const now = Date.now(), today = dayKey(now);
  if (dailyDay[n] === today) return;   // 今日はもう決めた（セーブのたびに枠を読み直さない）
  if (!(n in dailyDay)) dailyDay[n] = readDaily(n)?.day ?? '';
  const cur = get(slotKey(n)), plan = dailyPlan(dailyDay[n], cur, now);
  if (plan === 'skip') return;
  dailyDay[n] = today;
  const sum = sumOf(cur);
  if (plan === 'mark' || !cur || !sum) return;
  // 控えは、なくても遊べる。入りきらなければ、今日は控えない（アルバムの写真は消してまで控えない）
  void pack(cur).then((data) => { put(dailyKey(n), JSON.stringify({ day: today, at: now, sum, data })); }, () => { /* 控えなくてよい */ });
}
export function initSlots2() { store.beforeWrite = beforeWrite; }

/** 控えのノートに戻す。いまの中身は控えに回す（もう一度押せば、戻す前に戻る）。うまくいかなければ理由を返す */
async function restoreDaily(n: number): Promise<string> {
  const d = readDaily(n);
  if (!d) return '控えがない。';
  const json = await unpack(d.data);
  if (!json || !deserialize(json)) return '控えが読めなかった。';
  const cur = store.read(n), sum = sumOf(cur), data = cur && sum ? await pack(cur) : null;
  hold = true;
  try {
    if (!store.write(n, json)) return '書き込めなかった（この端末の保存領域がいっぱい）。';
    if (data && sum) put(dailyKey(n), JSON.stringify({ day: dayKey(Date.now()), at: Date.now(), sum, data, undo: !d.undo }));
    else try { localStorage.removeItem(dailyKey(n)); } catch { /* 消せなくてもよい */ }
    dailyDay[n] = dayKey(Date.now());
  } finally { hold = false; }
  return '';
}

// ---------------- 工場の名前 ----------------

/** セーブの文字列から、工場の名前を取り出す（名前はセーブの最後に書かれるので、後ろから探す） */
export function nameOf(json: string | null): string {
  if (!json) return '';
  const i = json.lastIndexOf('"fname":"');
  if (i < 0) return '';
  const m = /^"fname":("(?:[^"\\]|\\.)*")/.exec(json.slice(i, i + 400));
  try { return m ? String(JSON.parse(m[1])) : ''; } catch { return ''; }
}
/** セーブの文字列の、工場の名前を書き換える（ほかは変えない） */
function renamed(json: string, name: string): string | null {
  try { const d = JSON.parse(json); d.fname = name.trim().slice(0, FNAME_MAX) || undefined; return JSON.stringify(d); } catch { return null; }
}
/** 名前の入力欄と「決める」。done(新しい名前) */
export function nameEditor(cur: string, done: (name: string) => void, cancel: () => void): HTMLElement {
  const inp = h('input', { class: 'namebox', type: 'text', id: 'fname-input', value: cur, maxLength: FNAME_MAX, placeholder: `工場の名前（${FNAME_MAX} 文字まで。空にすると名前なし）`, ariaLabel: '工場の名前' }) as HTMLInputElement;
  const ok = () => { done(inp.value.trim().slice(0, FNAME_MAX)); };
  inp.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.isComposing) ok(); };
  window.setTimeout(() => { if (typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches) inp.focus(); }, 50);
  return h('div', { class: 'stack' }, inp,
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'fname-ok', onclick: ok }, '決める'), h('button', { class: 'ghost', type: 'button', id: 'fname-cancel', onclick: cancel }, 'やめる')));
}

// ---------------- 複製 ----------------

/** from のノートを、空いている枠 to へ写す（アルバムと、最後に見ていた場所も）。写せたら true */
function duplicate(from: number, to: number): boolean {
  const json = store.read(from);
  if (!json || store.read(to)) return false;
  const out = renamed(json, `${nameOf(json) || slotName(from)}の写し`);
  if (!out || !store.write(to, out)) return false;
  const a = get(albumKey(from));
  if (a) put(albumKey(to), a);   // 入りきらなければ、アルバムは写さない
  const m = store.meta(), cams = m.cams ?? {}, marks = m.marks ?? {};
  store.setMeta({ cams: cams[from] ? { ...cams, [to]: cams[from] } : cams, marks: marks[from] ? { ...marks, [to]: marks[from] } : marks });
  return true;
}

// ---------------- タイトルの小さな絵 ----------------

const thumbs = new Map<number, { at: number; url: string }>();
/** アルバムのいちばん新しい写真 */
function newestPhoto(n: number): string | null {
  try { const l = JSON.parse(get(albumKey(n)) || '[]'); const p = Array.isArray(l) ? l[l.length - 1] : null; return typeof p?.d === 'string' && p.d.startsWith('data:image/') ? p.d : null; } catch { return null; }
}
/** 工場の全体を小さく描く（1 階だけ。引いた視野の簡単な絵になる） */
function overview(json: string): string | null {
  const w = deserialize(json);
  if (!w) return null;
  const W = 240, H = 150, hr = hubRect(w.hubSize);
  let x0 = hr.x, y0 = hr.y, x1 = hr.x + hr.s, y1 = hr.y + hr.s;
  for (const e of w.ents.values()) { if (e.kind === 'part' || e.y >= FLOOR_DY / 2) continue; x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + 1); y1 = Math.max(y1, e.y + 1); }
  const z = Math.min(12, W / Math.max(24, x1 - x0 + 6), H / Math.max(15, y1 - y0 + 6));
  try {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    draw(cv.getContext('2d')!, W, H, w, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z }, performance.now() / 1000, 0, { floor: 0, tool: 'pan', selected: null, still: true });
    return cv.toDataURL('image/jpeg', 0.75);
  } catch { return null; }
}
/** タイトルのノートに出す小さな絵。保存した時刻が変わるまで作り直さない */
export function slotThumb(n: number, json: string, savedAt: number): HTMLElement | null {
  let c = thumbs.get(n);
  if (!c || c.at !== savedAt) {
    const url = newestPhoto(n) ?? overview(json);
    if (!url) return null;
    c = { at: savedAt, url };
    thumbs.set(n, c);
  }
  return h('img', { class: 'slot-thumb', id: `slot-${n}-thumb`, src: c.url, alt: '' });
}

// ---------------- タイトルのノートの追加の操作 ----------------

/** タイトル画面から渡してもらうもの。showPanel：タイトルの下の欄に出す。repaint：一覧を描き直す */
export interface TitleUi { showPanel(...nodes: (Node | null)[]): void; repaint(): void }
const line = (s: DailySum) => `達成 ${s.done} / ${TOTAL_GOALS}・研究点 ${s.points}・${fmtTime(s.playMs)}`;

/** 前日に戻す（空いた枠では、消したノートを戻す） */
function restoreBtn(n: number, ui: TitleUi, cur: DailySum | null): HTMLElement | null {
  const d = readDaily(n);
  if (!d || !dailyOffer(d, cur)) return null;
  const what = d.undo ? '戻す前に戻す' : '前日に戻す';
  return h('button', { class: 'ghost', type: 'button', id: `slot-${n}-daily`, title: `${fmtDate(d.sum.savedAt)} の状態`, onclick: () => {
    const note = h('p', { class: 'feedback', id: 'daily-note' }, '');
    ui.showPanel(h('b', {}, `${slotName(n)}を${d.undo ? '、戻す前の状態に' : '前日の状態に'}戻す`),
      h('p', {}, `${fmtDate(d.sum.savedAt)} に保存した状態（${line(d.sum)}）に戻す。`),
      h('p', { class: 'muted' }, cur ? `いまの状態（${line(cur)}）は控えに回すので、もう一度押せば戻せる。前日の控えは、その日はじめてノートを開いて保存したときに、毎日 1 回とる。` : 'このノートは消してある。控えから戻す。'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', id: 'daily-go', onclick: () => {
          void restoreDaily(n).then((err) => { if (err) { note.textContent = err; sfx.bad(); return; } sfx.ok(); thumbs.delete(n); ui.repaint(); ui.showPanel(h('p', { class: 'feedback', id: 'daily-done' }, `${slotName(n)}を戻した。`), h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', onclick: ui.repaint }, '閉じる'))); });
        } }, '戻す'),
        h('button', { class: 'ghost', type: 'button', onclick: ui.repaint }, 'やめる')), note);
  } }, what);
}

/** ノートのある枠：名前・複製・前日に戻す */
export function slotMore(n: number, json: string, ui: TitleUi): HTMLElement {
  const cur = sumOf(json), empty = Array.from({ length: SLOTS }, (_, i) => i + 1).filter((k) => k !== n && !store.read(k));
  const nm = nameOf(json);
  return h('div', { class: 'row slot-more' },
    h('button', { class: 'ghost', type: 'button', id: `slot-${n}-name`, onclick: () => {
      ui.showPanel(h('b', {}, `${slotName(n)}の工場の名前`), h('p', { class: 'muted' }, 'タイトルとメニューに出る。セーブに入るので、書き出しやアカウントの同期でも一緒に動く。'),
        nameEditor(nm, (name) => { const out = renamed(store.read(n) ?? json, name); if (out && store.write(n, out)) sfx.ok(); ui.repaint(); }, ui.repaint));
    } }, nm ? '名前を変える' : '名前をつける'),
    h('button', { class: 'ghost', type: 'button', id: `slot-${n}-dup`, disabled: !empty.length, title: empty.length ? '空いている枠へ写す' : '空いている枠がない', onclick: () => {
      ui.showPanel(h('b', {}, `${slotName(n)}を写す`), h('p', { class: 'muted' }, '工場・学習の記録・アルバムを、そのまま空いている枠へ写す。写したノートは、もとのノートとは別に進む。'),
        h('div', { class: 'row' }, ...empty.map((k) => h('button', { class: 'primary', type: 'button', id: `dup-to-${k}`, onclick: () => {
          const ok = duplicate(n, k);
          ok ? sfx.ok() : sfx.bad();
          ui.repaint();
          ui.showPanel(h('p', { class: 'feedback', id: 'dup-done' }, ok ? `${slotName(k)}へ写した。` : '写せなかった（この端末の保存領域がいっぱい）。'), h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', onclick: ui.repaint }, '閉じる')));
        } }, `${slotName(k)}へ`)), h('button', { class: 'ghost', type: 'button', onclick: ui.repaint }, 'やめる')));
    } }, '複製'),
    restoreBtn(n, ui, cur));
}
/** 空いている枠：消したノートの前日の控えがあれば、戻せる */
export function emptyMore(n: number, ui: TitleUi): HTMLElement | null {
  const b = restoreBtn(n, ui, null);
  return b ? h('div', { class: 'row slot-more' }, b) : null;
}

// ---------------- アルバムが入りきらないとき ----------------

interface Photo { k: string; d: string; small?: boolean }
/** 写真を小さく描き直す（幅 280 の JPEG） */
async function shrinkPhoto(d: string): Promise<string> {
  const img = new Image();
  img.src = d;
  await img.decode();
  const W = Math.min(280, img.width), H = Math.round((W * img.height) / Math.max(1, img.width)), c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d')!.drawImage(img, 0, 0, W, H);
  const out = c.toDataURL('image/jpeg', 0.5);
  return out.length < d.length ? out : d;
}
const albums = (): { key: string; list: Photo[] }[] => {
  const out: { key: string; list: Photo[] }[] = [];
  for (let n = 1; n <= SLOTS; n++) { try { const l = JSON.parse(get(albumKey(n)) || '[]'); if (Array.isArray(l) && l.length) out.push({ key: albumKey(n), list: l }); } catch { /* 読めないものは触らない */ } }
  return out;
};
/** すべてのアルバムの写真を、古いものから小さくする（いちばん新しい 1 枚はそのまま）。空いたおよそのバイト数を返す */
export async function shrinkAlbums(): Promise<number> {
  let freed = 0;
  for (const a of albums()) {
    const before = JSON.stringify(a.list).length;
    for (let i = 0; i < a.list.length - 1; i++) {
      const p = a.list[i];
      if (p.small) continue;
      try { a.list[i] = { ...p, d: await shrinkPhoto(p.d), small: true }; } catch { /* 描き直せなければそのまま */ }
    }
    const s = JSON.stringify(a.list);
    if (s.length < before && put(a.key, s)) freed += (before - s.length) * 2;
  }
  return freed;
}
/** 保存領域を少し空ける（すぐに）：いちばん大きいアルバムから、古い写真を 1 枚落とす。落とせたら true */
export function freeSpace(): boolean {
  const all = albums().map((a) => ({ ...a, size: JSON.stringify(a.list).length })).sort((a, b) => b.size - a.size);
  for (const a of all) {
    const next = dropOldest(a.list, 1);
    if (next.length < a.list.length && put(a.key, JSON.stringify(next))) return true;
  }
  return false;
}
/**
 * アルバムを保存する。入りきらなければ、古い写真から小さくし、それでも入らなければ古いものから落とす
 * （最初の 1 枚といちばん新しい 1 枚は残す）。told：詰めたことを知らせる
 */
export function putAlbum(key: string, list: Photo[], told?: (msg: string) => void): void {
  if (put(key, JSON.stringify(list))) return;
  void (async () => {
    let l = list.slice();
    for (let i = 0; i < l.length - 1; i++) {
      if (l[i].small) continue;
      try { l[i] = { ...l[i], d: await shrinkPhoto(l[i].d), small: true }; } catch { continue; }
      if (put(key, JSON.stringify(l))) { told?.('この端末の保存領域が足りないので、アルバムの古い写真を小さくした。'); return; }
    }
    if ((await shrinkAlbums()) > 0 && put(key, JSON.stringify(l))) { told?.('この端末の保存領域が足りないので、アルバムの古い写真を小さくした。'); return; }
    while (l.length > 2) {
      const n0 = l.length;
      l = dropOldest(l, 1);
      if (l.length === n0) break;
      if (put(key, JSON.stringify(l))) { told?.('この端末の保存領域が足りないので、アルバムの古い写真を減らした。'); return; }
    }
  })();
}

// ---------------- 保存領域の使い方 ----------------

/** このブラウザの保存領域のうち、Chemyth が使っている分。ほかのページの分（同じ場所に置いたページ）は others に */
function measure(): { items: StoreItem[]; others: number } {
  const items: StoreItem[] = [];
  let others = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) ?? '', size = (k.length + v.length) * 2;
      if (!k.startsWith('chemyth-')) { others += size; continue; }
      items.push({ key: k, size, photos: /^chemyth-v2-album-\d+$/.test(k) ? (v.match(/"d":"data:/g) ?? []).length : undefined });
    }
  } catch { /* 読めなければ空 */ }
  return { items, others };
}
/** 目安にする保存領域の大きさ（多くのブラウザで 1 つの場所に 5 MB ほど） */
const QUOTA = 5 * 1024 * 1024;
/** 保存領域の使い方の画面。show・close：窓を出す・閉じる。closeBtn：閉じるボタン */
export function showStorage(show: (...n: (Node | string | null)[]) => void, closeBtn: () => HTMLElement, note = '') {
  const { items, others } = measure(), u = storeUse(items, SLOTS), total = u.total + others;
  const bar = (b: number) => { const i = h('i', {}); i.style.width = `${Math.min(100, (b / QUOTA) * 100)}%`; return h('span', { class: 'meter' + (total > QUOTA * 0.85 ? ' bad' : total > QUOTA * 0.6 ? ' warn' : '') }, i); };
  const tr = (name: string, b: number, extra = '') => h('tr', {}, h('th', {}, name), h('td', {}, fmtBytes(b), extra ? h('span', { class: 'muted' }, `　${extra}`) : null));
  const msg = h('p', { class: 'feedback', id: 'st-note' }, note);
  show(h('header', {}, h('h2', {}, '保存領域の使い方'), closeBtn()),
    h('p', { class: 'muted' }, 'このブラウザの中に置いているデータの大きさ（およそ）。ブラウザがこのページに使わせる量は、多くの場合 5 MB ほど（ブラウザによって違う）。いっぱいになると、アルバムの古い写真から小さくしたり減らしたりして、セーブを先に残す。'),
    h('div', { class: 'stack tight', id: 'st-total' }, h('b', {}, `合計 ${fmtBytes(total)}　（目安 ${fmtBytes(QUOTA)} のうち ${Math.round((total / QUOTA) * 100)} %）`), bar(total)),
    h('table', { class: 'keys', id: 'st-table' },
      ...u.slots.flatMap((s) => [
        h('tr', {}, h('th', { colSpan: 2 }, h('b', {}, slotName(s.n)))),
        tr('　セーブ', s.save), tr('　アルバム', s.album, s.photos ? `${s.photos} 枚` : ''), tr('　前日の控え', s.daily, (() => { const d = readDaily(s.n); return d ? `${fmtDate(d.sum.savedAt)} の状態` : ''; })()),
      ]),
      tr('設計図', u.blueprints), tr('読み込む前の控え', u.backup), tr('設定・アカウント', u.other), others ? tr('ほかのページの分', others, '同じ場所に置いたほかのページ') : null),
    msg,
    h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'st-shrink', onclick: async () => {
      msg.textContent = '小さくしている…';
      const freed = await shrinkAlbums();
      showStorage(show, closeBtn, freed > 0 ? `アルバムの古い写真を小さくして、${fmtBytes(freed)} 空けた。` : 'これ以上は小さくできなかった。');
    } }, 'アルバムの古い写真を小さくする')));
}
