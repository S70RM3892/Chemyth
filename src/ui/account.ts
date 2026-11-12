/**
 * アカウントと、端末をまたいだセーブの同期。
 * メールは使わない。アカウント名と合言葉だけで登録し、同じ名前と合言葉でログインした端末どうしで、3 つの枠のセーブがそろう。
 *
 * - セーブは、これまでどおり、まずこの端末に書く。ログインしていれば、書いてから少しあとに、預ける（送る）。
 * - タイトルを開いたときと、ログインしたときに、預けてある側と見比べる。ほかの端末が先へ進めていて、
 *   この端末では書き換えていなければ、受け取る。両方で進めていたら、どちらを残すかを人に選ばせる（勝手に消さない）。
 * - つながらないときは、何もしない。この端末のセーブで、そのまま遊べる。
 */
import { deserialize, summarize } from '../engine/world';
import { pack, sameSave, syncPlan, unpack, type CloudSave, type SaveBrief, type SyncMeta } from '../engine/sync';
import { TOTAL_GOALS } from '../content/goals';
import { h } from './dom';
import { online, rpc } from './ranking';
import { sfx } from './sound';
import { SLOTS, fmtDate, fmtTime, slotName, store } from './title';

const KEY = 'chemyth-v2-account';
interface Stored { name: string; token: string; sync: Record<number, SyncMeta> }
type Res<T> = ({ ok: true } & T) | { ok?: undefined; error: string; wait?: number; rev?: number; at?: number; device?: string; summary?: Partial<SaveBrief> };

const load = (): Stored | null => { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && typeof d.token === 'string' && typeof d.name === 'string' ? { name: d.name, token: d.token, sync: d.sync || {} } : null; } catch { return null; } };
let st: Stored | null = null;
const persist = () => { try { if (st) localStorage.setItem(KEY, JSON.stringify(st)); else localStorage.removeItem(KEY); } catch { /* 保存できなくても遊べる */ } };

/** 預けてある側の一覧（最後に見たときのもの） */
let cloud: Record<number, CloudSave> = {};
const conflicts = new Set<number>();
/** 枠ごとの、書いた回数（送っている間に書き換えられたかを知るため） */
const seq: number[] = [];
const timers: number[] = [];
let busy = false, trouble = '', lastSync = 0;
/** いま開いて遊んでいる枠（タイトルでは 0）。この枠には、受け取ったセーブを書かない */
let open = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const f of listeners) f(); };
/** 同期が終わるのを待っているもの */
const waiters: (() => void)[] = [];

export const accountAvailable = online;
export const signedIn = () => !!st;
/** 同期の様子（上の帯の小さな印と、メニューに出す） */
export const syncState = () => ({ on: !!st, busy, trouble, lastSync, conflicts: conflicts.size });
export const accountName = () => st?.name ?? '';
export const onAccountChange = (f: () => void) => { listeners.add(f); };
/** 食い違っている枠（どちらを残すか、人が選ぶ） */
export const conflictSlots = () => [...conflicts].sort();
/** 枠を開いた（0 はタイトルへ戻った）。タイトルが呼ぶ */
export const openSlot = (n: number) => { open = n; };
/** 同期の最中なら、終わるまで待つ（長くても ms まで）。タイトルの「つづける」が、受け取ったセーブで開くために使う */
export function whenSynced(ms: number): Promise<void> {
  if (!busy) return Promise.resolve();
  return new Promise((done) => { const t = window.setTimeout(done, ms); waiters.push(() => { clearTimeout(t); done(); }); });
}

const brief = (json: string | null): SaveBrief | null => { const s = summarize(json); return s ? { done: s.done, points: s.points, playMs: s.playMs, savedAt: s.savedAt, chapter: s.chapter } : null; };

/** どの端末で預けたかの目印。機種の名前までは送らない（種類だけ） */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android スマホ' : 'Android タブレット';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'Chromebook';
  return /Linux/.test(ua) ? 'Linux' : 'ほかの端末';
}

async function call<T>(fn: string, body: Record<string, unknown>, keepalive = false): Promise<Res<T>> {
  try {
    const r = await rpc<Res<T>>(fn, body, keepalive);
    if (!r || typeof r !== 'object') return { error: 'offline' };
    // 合言葉を変えた・ほかの端末から消した、などでログインが切れている
    if (!r.ok && r.error === 'signed_out' && st) { st = null; cloud = {}; conflicts.clear(); persist(); emit(); }
    return r;
  } catch (e) {
    // 404：データベースに、アカウントの関数がまだ入っていない
    return { error: e instanceof Error && e.message === '404' ? 'not_ready' : 'offline' };
  }
}

const MESSAGES: Record<string, string> = {
  bad_name: 'アカウント名は 3〜16 文字。空白は使えない。',
  bad_pass: '合言葉は 8 文字以上（長すぎるものは使えない）。',
  name_taken: 'その名前は、もう使われている。別の名前にしろ。',
  bad_login: '名前か合言葉が違う。',
  too_many: 'この回線からの登録が多すぎる。明日やり直せ。',
  signed_out: 'ログインが切れた。もう一度ログインしろ。',
  offline: 'つながらない。この端末のセーブで、そのまま遊べる。',
  not_ready: 'アカウントの準備が、まだできていない（データベース側の設定待ち）。この端末のセーブで、そのまま遊べる。',
  too_big: 'セーブが大きすぎて、預けられない。',
  broken: '預けてあるセーブが読めない。この端末のものを預け直せ。',
};
const say = (r: { error: string; wait?: number }) => (r.error === 'locked' ? `間違いが続いたので、あと ${r.wait && r.wait >= 90 ? `${Math.ceil(r.wait / 60)} 分` : `${r.wait ?? 30} 秒`}はログインできない。` : MESSAGES[r.error] ?? `うまくいかなかった（${r.error}）。`);

/** この端末のセーブを預ける。force：預けてある側がどうなっていても、上書きする */
async function upload(slot: number, force = false, keepalive = false): Promise<string> {
  const json = store.read(slot), b = brief(json);
  if (!st || !json || !b) return '';
  const n0 = seq[slot] || 0, device = deviceLabel();
  const r = await call<{ rev: number; at: number }>('chemyth_save_put', { p_token: st.token, p_slot: slot, p_data: await pack(json), p_base_rev: st.sync[slot]?.rev ?? 0, p_device: device, p_summary: b, p_force: force }, keepalive);
  if (!st) return 'signed_out';
  if (r.ok) {
    st.sync[slot] = { rev: r.rev, dirty: (seq[slot] || 0) !== n0 };
    // 送っている間に書き換えられていなければ、予約していた分は要らない
    if (!st.sync[slot].dirty && timers[slot]) { clearTimeout(timers[slot]); timers[slot] = 0; }
    cloud[slot] = { slot, rev: r.rev, at: r.at, device, bytes: 0, summary: b };
    conflicts.delete(slot); trouble = '';
    persist();
    return '';
  }
  if (r.error === 'conflict') {
    // ほかの端末が先に書き換えている。上書きせず、人に選ばせる
    cloud[slot] = { slot, rev: r.rev ?? 0, at: r.at ?? 0, device: r.device ?? '', bytes: 0, summary: r.summary ?? {} };
    conflicts.add(slot);
  } else trouble = r.error;
  return r.error;
}

/** 預けてあるセーブを、この端末へ受け取る（この端末のその枠は、置き換わる） */
async function download(slot: number): Promise<string> {
  if (!st) return 'signed_out';
  const n0 = seq[slot] || 0;
  const r = await call<{ data: string; rev: number; at: number; device: string; summary: Partial<SaveBrief> }>('chemyth_save_get', { p_token: st.token, p_slot: slot });
  if (!st) return 'signed_out';
  if (!r.ok) { trouble = r.error; return r.error; }
  const json = await unpack(r.data);
  if (!json || !deserialize(json)) { trouble = 'broken'; return 'broken'; }
  cloud[slot] = { slot, rev: r.rev, at: r.at, device: r.device, bytes: r.data.length, summary: r.summary };
  // 受け取っている間に、この端末でその枠を書いた・開いて遊んでいるなら、上書きしない（両方で進めたので、どちらを残すか人に選ばせる）
  if (slot === open || (seq[slot] || 0) !== n0) { conflicts.add(slot); persist(); return 'conflict'; }
  if (!store.write(slot, json, true)) return 'offline';
  st.sync[slot] = { rev: r.rev, dirty: false };
  conflicts.delete(slot); trouble = '';
  persist();
  return '';
}

/** 預けてある側と見比べて、送るものは送り、受け取るものは受け取る。食い違いは残して、人に選ばせる */
export async function syncAll(): Promise<void> {
  if (!st || busy || !online()) return;
  busy = true; emit();
  try {
    const r = await call<{ name: string; saves: CloudSave[] }>('chemyth_save_list', { p_token: st.token });
    if (r.ok && st) {
      trouble = '';
      cloud = {};
      for (const c of r.saves) cloud[c.slot] = c;
      for (let n = 1; n <= SLOTS; n++) {
        if (!st) break;
        const local = brief(store.read(n)), c = cloud[n];
        // つながりがわからなくても、中身が同じなら、そろっているものとして覚える
        if (!st.sync[n] && c && local && sameSave(local, c.summary)) st.sync[n] = { rev: c.rev, dirty: false };
        if (!c && !local) delete st.sync[n];
        const plan = syncPlan(local, st.sync[n], c);
        if (plan === 'upload') await upload(n, !!c?.summary.gone);
        else if (plan === 'download') await download(n);
        // 開いて遊んでいる枠は消さない（次の同期で、もう一度見比べる）
        else if (plan === 'erase') { if (n !== open) { store.erase(n); st.sync[n] = { rev: c.rev, dirty: false }; conflicts.delete(n); } }
        else if (plan === 'conflict') conflicts.add(n);
        else conflicts.delete(n);
      }
      persist();
    } else if (!r.ok) trouble = r.error;
  } finally {
    // 途中で失敗しても、同期中のままにしない
    busy = false; lastSync = Date.now();
    emit();
    for (const f of waiters.splice(0)) f();
  }
}
/** タイトルを開くたびに呼ぶ。続けて何度も問い合わせない */
export function syncIfStale() { if (st && Date.now() - lastSync > 15000) void syncAll(); }

/** この端末でセーブを書いた。少しあとに預ける（遊んでいる間は、45 秒に 1 回まで） */
function touched(slot: number) {
  seq[slot] = (seq[slot] || 0) + 1;
  if (!st) return;
  if (st.sync[slot] && !st.sync[slot].dirty) { st.sync[slot].dirty = true; persist(); }
  if (conflicts.has(slot) || timers[slot]) return;
  timers[slot] = window.setTimeout(async () => {
    timers[slot] = 0;
    const had = conflicts.has(slot), err = await upload(slot);
    if (err === 'conflict' && !had) emit();
  }, 45000);
}
/** 画面を閉じる・隠すときに、預け待ちのものを、すぐ送る */
export function flushAccount() { flush(); }
function flush() {
  for (let n = 1; n <= SLOTS; n++) if (timers[n]) { clearTimeout(timers[n]); timers[n] = 0; void upload(n, false, true); }
}
/** この端末で枠を消した。預けてある分は「消した」という印に置き換える（ほかの端末でも消えるように。印がないと、ほかの端末から戻ってくる） */
export function slotErased(slot: number) {
  if (!st) return;
  const me = st;
  delete me.sync[slot]; delete cloud[slot]; conflicts.delete(slot);
  if (timers[slot]) { clearTimeout(timers[slot]); timers[slot] = 0; }
  persist();
  void call<{ rev: number; at: number }>('chemyth_save_put', { p_token: me.token, p_slot: slot, p_data: 'gone', p_base_rev: 0, p_device: deviceLabel(), p_summary: { gone: true }, p_force: true }).then((r) => {
    if (!r.ok || st !== me || store.read(slot)) return;
    me.sync[slot] = { rev: r.rev, dirty: false };
    cloud[slot] = { slot, rev: r.rev, at: r.at, device: deviceLabel(), bytes: 0, summary: { gone: true } };
    persist();
  });
}

export function initAccount() {
  st = load();
  store.onWrite = touched;
  // 画面を隠したときの分は、本体が保存したあとで flushAccount を呼ぶ
  window.addEventListener('pagehide', flush);
}

/** タイトルに出す 1 行 */
export function accountLine(): string {
  if (!online()) return '';
  if (!st) return 'アカウント：ログインしていない（セーブはこの端末だけ）';
  if (busy) return `アカウント：${st.name}　同期している…`;
  if (conflicts.size) return `アカウント：${st.name}　食い違い ${conflicts.size} 件（どちらを残すか選べ）`;
  if (trouble === 'offline' || trouble === 'not_ready') return `アカウント：${st.name}　つながらない（この端末のセーブで遊べる）`;
  return `アカウント：${st.name}　同期ずみ`;
}

// ---------------- 画面 ----------------
const draft = { name: '', pass: '', pass2: '', mode: '' as '' | 'pass' | 'delete', note: '', bad: false };

const line = (b: (Partial<SaveBrief> & { gone?: boolean }) | null | undefined) => (b?.gone ? '消した' : b && b.done !== undefined ? `達成 ${b.done} / ${TOTAL_GOALS}　研究点 ${b.points ?? 0}　${fmtTime(b.playMs ?? 0)}` : 'なし');

/** タイトルの欄に、アカウントの画面を描く。close：閉じる。again：描き直す */
export function renderAccount(panel: HTMLElement, close: () => void, again: () => void) {
  const note = h('p', { class: 'feedback' + (draft.bad ? ' bad' : ''), id: 'ac-note' }, draft.note);
  const tell = (text: string, bad = false) => { draft.note = text; draft.bad = bad; again(); };
  const field = (id: string, key: 'name' | 'pass' | 'pass2', ph: string, type: string, auto: string) => {
    const el = h('input', { class: 'namebox', id, type, placeholder: ph, value: draft[key], maxLength: key === 'name' ? 16 : 72, autocomplete: auto as AutoFill, spellcheck: false });
    el.setAttribute('autocapitalize', 'off');
    el.oninput = () => { draft[key] = el.value; };
    return el;
  };
  const act = async (text: string, f: () => Promise<{ ok?: true; error?: string; wait?: number }>, done: string) => {
    draft.note = text; draft.bad = false; again();
    const r = await f();
    if (r.ok) { sfx.ok(); draft.pass = draft.pass2 = ''; draft.mode = ''; tell(done); } else { sfx.bad(); tell(say({ error: r.error ?? 'offline', wait: r.wait }), true); }
  };

  if (!st) {
    const enter = (fn: 'chemyth_account_login' | 'chemyth_account_register') => act(fn.endsWith('login') ? 'ログインしている…' : '登録している…', async () => {
      const r = await call<{ name: string; token: string }>(fn, { p_name: draft.name.trim(), p_pass: draft.pass });
      if (!r.ok) return r;
      st = { name: r.name, token: r.token, sync: {} };
      persist();
      await syncAll();
      return { ok: true as const };
    }, 'ログインした。セーブは、これから自動でそろう。');
    panel.replaceChildren(h('b', {}, 'アカウント'),
      h('p', { class: 'muted' }, 'ログインすると、3 つの枠のセーブが、同じアカウントの端末どうしで自動でそろう。メールは使わない。アカウント名と合言葉だけ。'),
      h('div', { class: 'row' }, field('ac-name', 'name', 'アカウント名（3〜16 文字）', 'text', 'username'), field('ac-pass', 'pass', '合言葉（8 文字以上）', 'password', 'current-password')),
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', id: 'ac-login', onclick: () => enter('chemyth_account_login') }, 'ログイン'),
        h('button', { class: 'ghost', type: 'button', id: 'ac-register', onclick: () => enter('chemyth_account_register') }, 'この名前と合言葉で、新しく登録'),
        h('button', { class: 'ghost', type: 'button', id: 'ac-close', onclick: close }, '閉じる')),
      h('p', { class: 'muted' }, '合言葉を忘れると、戻す方法がない（メールを使わないため）。必ず控えろ。ほかのサービスで使っている合言葉は使うな。'),
      note);
    return;
  }

  const me = st;
  const rows = Array.from({ length: SLOTS }, (_, i) => {
    const n = i + 1, local = brief(store.read(n)), c = cloud[n], m = me.sync[n], clash = conflicts.has(n);
    const state = clash ? '食い違い' : !local && (!c || c.summary.gone) ? '空' : m && c && m.rev === c.rev && !m.dirty ? 'そろっている' : '預け待ち';
    return h('div', { class: 'acrow' + (clash ? ' clash' : ''), id: `ac-slot-${n}` },
      h('div', { class: 'stack tight' }, h('b', {}, slotName(n)), h('span', { class: 'muted', id: `ac-state-${n}` }, state)),
      h('div', { class: 'stack tight' },
        h('span', {}, `この端末：${line(local)}${local?.savedAt ? `　${fmtDate(local.savedAt)}` : ''}`),
        h('span', {}, `預けてある：${line(c?.summary)}${c && !c.summary.gone ? `　${fmtDate(c.at)}　${c.device}` : ''}`)),
      clash ? h('div', { class: 'row' },
        h('button', { class: 'ghost', type: 'button', id: `ac-keep-local-${n}`, onclick: () => act('預けている…', async () => { const e = await upload(n, true); emit(); return e ? { error: e } : { ok: true as const }; }, `${slotName(n)}は、この端末のものを残した。`) }, 'この端末のを残す'),
        h('button', { class: 'ghost', type: 'button', id: `ac-keep-cloud-${n}`, onclick: () => act('受け取っている…', async () => { const e = await download(n); emit(); return e ? { error: e } : { ok: true as const }; }, `${slotName(n)}は、預けてあるものに置き換えた。`) }, '預けてあるのを残す')) : null);
  });
  const extra = draft.mode === 'pass'
    ? h('div', { class: 'row' }, field('ac-pass', 'pass', 'いまの合言葉', 'password', 'current-password'), field('ac-pass2', 'pass2', '新しい合言葉（8 文字以上）', 'password', 'new-password'),
      h('button', { class: 'primary', type: 'button', id: 'ac-pass-ok', onclick: () => act('変えている…', () => call('chemyth_account_password', { p_token: me.token, p_old: draft.pass, p_new: draft.pass2 }), '合言葉を変えた。ほかの端末は、ログインし直しになる。') }, '変える'))
    : draft.mode === 'delete'
      ? h('div', { class: 'row' }, field('ac-pass', 'pass', '合言葉（確かめる）', 'password', 'current-password'),
        h('button', { class: 'ghost warn', type: 'button', id: 'ac-delete-ok', onclick: () => act('消している…', async () => {
          const r = await call('chemyth_account_delete', { p_token: me.token, p_pass: draft.pass });
          if (r.ok) { st = null; cloud = {}; conflicts.clear(); persist(); emit(); }
          return r;
        }, 'アカウントと、預けたセーブを消した。この端末のセーブは残っている。') }, 'アカウントを消す（預けたセーブも消える）'))
      : null;
  panel.replaceChildren(h('b', {}, `アカウント：${me.name}`),
    h('p', { class: 'muted' }, conflicts.size ? 'この端末と、預けてある側の両方で進めた枠がある。どちらを残すか選べ。選ばなかった方は消える。' : 'セーブは、書くたびに少しあとで預けられ、タイトルを開いたときに受け取る。'),
    ...rows,
    h('div', { class: 'row' },
      h('button', { class: 'primary', type: 'button', id: 'ac-sync', disabled: busy, onclick: () => { draft.note = ''; draft.bad = false; void syncAll().then(() => tell(trouble ? say({ error: trouble }) : conflicts.size ? '食い違っている枠がある。' : 'そろえた。', !!trouble)); } }, busy ? '同期している…' : 'いま同期する'),
      h('button', { class: 'ghost', type: 'button', id: 'ac-logout', onclick: () => { const t = me.token; flush(); st = null; cloud = {}; conflicts.clear(); persist(); void call('chemyth_account_logout', { p_token: t }); sfx.tap(); tell('ログアウトした。この端末のセーブは残っている。'); emit(); } }, 'ログアウト'),
      h('button', { class: 'ghost' + (draft.mode === 'pass' ? ' picked on' : ''), type: 'button', id: 'ac-pass-open', onclick: () => { draft.mode = draft.mode === 'pass' ? '' : 'pass'; draft.pass = draft.pass2 = ''; again(); } }, '合言葉を変える'),
      h('button', { class: 'ghost' + (draft.mode === 'delete' ? ' picked on' : ''), type: 'button', id: 'ac-delete-open', onclick: () => { draft.mode = draft.mode === 'delete' ? '' : 'delete'; draft.pass = ''; again(); } }, 'アカウントを消す'),
      h('button', { class: 'ghost', type: 'button', id: 'ac-close', onclick: close }, '閉じる')),
    ...(extra ? [extra] : []), note);
}
