/**
 * 設定・見やすさ・休みの追加。
 * - 設定の画面の行：振動の強さ（なし・弱・強）、文字の大きさ（標準・大・特大）、色覚の補助、高コントラスト、画面の明るさ、通知の位置、
 *   時計、寝る前は音を小さく、目を休める、最後のノートをすぐ開く、設定のファイル（書き出す・読み込む）、初期値に戻す
 * - 上の帯の時計（就寝までの時間）と、アカウントの同期がつながらないときの印
 * - 集中表示（上の帯と指令を隠す）、目を休める（20 秒）、寝る前の音量、日付の切り替わり（朝 4 時）での数え直し
 * 本体（main.ts）からは initSettings2 で、窓の出し方や、いまの工場を受け取る。
 */
import { nextDay, parsePrefsFile, rollDay, windVolume, type Level3 } from '../engine/device';
import { SLEEP_DEFAULT, duskOf, hhmm, isClosed, minutesToBed, type SleepCfg } from '../engine/sleep';
import type { World } from '../engine/world';
import { onAccountChange, syncAll, syncState } from './account';
import { $, h } from './dom';
import { showGlossary, startTour } from './guide';
import { setMusic, setMusicVolume } from './music';
import { reviewCount } from './panels';
import { applyPrefs, buzz, onPrefs, prefs, resetPrefs, setPrefs, type Prefs } from './prefs';
import { setCvd } from './render';
import { initSlots2, nameEditor, showStorage } from './slots2';
import { setSound, setVolume, sfx } from './sound';
import { applySkin, applyTheme, type Skin } from './theme';
import { SLOTS, store } from './title';
import { initWebApp } from './webapp';

/** 本体から受け取るもの */
export interface Ctx2 {
  /** 開いている工場（課題のあいだは自分の工場）。タイトルでは null */
  world(): World | null;
  /** 開いているノート（0 はタイトル） */
  slot(): number;
  toast(msg: string, ms?: number): void;
  /** 窓を出す・閉じる。閉じるボタン */
  show(...nodes: (Node | string | null)[]): void;
  close(): void;
  closeBtn(): HTMLElement;
  save(): void;
  /** タイトルの一覧を描き直す */
  repaintTitle(): void;
  /** 今朝の 10 問を出す（出せるときだけ） */
  morning(): void;
}
let C: Ctx2 | null = null;
const sleepCfg = (): SleepCfg => ({ ...SLEEP_DEFAULT, ...(store.meta().sleep ?? {}) });
const pad2 = (n: number) => String(n).padStart(2, '0');

// ---------------- 設定の画面の行 ----------------

type Again = () => void;
const seg = <T,>(id: string, cur: T, opts: [T, string][], set: (v: T) => void, again: Again) =>
  h('span', { class: 'seg', role: 'group' }, ...opts.map(([v, name], i) => h('button', { type: 'button', id: `${id}-${i}`, class: cur === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); again(); } }, name)));
const row = (what: string, note: string, ctl: HTMLElement) => h('div', { class: 'pref-row' }, h('div', { class: 'what' }, h('b', {}, what), note ? h('small', {}, note) : null), ctl);
const onoff = (id: string, k: keyof Prefs, again: Again, on = 'オン', off = 'オフ') => seg(id, prefs()[k] as boolean, [[true, on], [false, off]], (v) => setPrefs({ [k]: v } as Partial<Prefs>), again);
const btn = (id: string, text: string, f: () => void, cls = 'ghost') => h('button', { class: cls, type: 'button', id, onclick: f }, text);

/** 振動の強さと文字の大きさの行（もとの「振動」「文字を大きく」の行の置きかえ） */
export function prefRow(kind: 'haptics' | 'text', again: Again): HTMLElement {
  const p = prefs();
  if (kind === 'haptics') return row('振動', '置く・消す・ずらす・まちがえたとき。強は長めに震える。iPhone・iPad では震わない（ブラウザが対応していない）。', seg<Level3>('p-hap', p.haptics, [[0, 'なし'], [1, '弱'], [2, '強']], (v) => { setPrefs({ haptics: v }); buzz([20, 50, 20]); }, again));
  return row('文字の大きさ', '窓・指令・通知・札の文字。大は 15 %、特大は 30 % 大きくする。', seg<Level3>('p-size', p.textSize, [[0, '標準'], [1, '大'], [2, '特大']], (v) => setPrefs({ textSize: v }), again));
}

/** 「初期値に戻す」は、2 度押して戻す（4 秒以内） */
let resetArmed = 0;
/** 設定の画面の終わりに足す行 */
export function prefExtras(again: Again): (HTMLElement | null)[] {
  const p = prefs(), armed = Date.now() - resetArmed < 4000;
  return [
    h('h3', {}, '見やすさ'),
    row('色覚の補助', '装置の状態の印・詰まりの印・置けない場所の見本を、赤と緑の色だけでなく、形と模様でも分ける（丸＝動いている、三角＝待っている、四角と × ＝止まっている。詰まりは斜線）。', onoff('p-cvd', 'cvd', again)),
    row('高コントラスト', '線を太く、文字と枠を濃くする。', onoff('p-hc', 'contrast', again)),
    row('画面の明るさ', '暗い部屋で、画面全体を暗くする。', seg<Prefs['dim']>('p-dim', p.dim, [[0, 'そのまま'], [1, '85 %'], [2, '70 %'], [3, '55 %']], (v) => setPrefs({ dim: v }), again)),
    p.dim ? row('暗くする時間', '「夜だけ」なら、夕方から実際の時刻に合わせて少しずつ暗くなる。', seg('p-dimn', p.dimNight, [[true, '夜だけ'], [false, 'いつも']], (v) => setPrefs({ dimNight: v }), again)) : null,
    row('通知の位置', '下の道具の棚と重なって読みにくいときは、上にする。', seg('p-toast', p.toastTop, [[false, '下'], [true, '上']], (v) => { setPrefs({ toastTop: v }); C?.toast(v ? '通知は上に出す。' : '通知は下に出す。', 1600); }, again)),
    h('h3', {}, '時間と休み'),
    row('時計', '上の帯に、いまの時刻と、就寝までの時間を出す。', onoff('p-clock', 'clock', again, '出す', '出さない')),
    row('寝る前は音を小さく', '就寝の 1 時間前から、効果音と音楽を少しずつ小さくする（「睡眠と試験日」で閉店ありのとき）。', onoff('p-wind', 'windVol', again)),
    row('目を休める', '20 秒、画面から目を離して遠くをながめる。休憩の知らせにも出る。', btn('p-eye', 'いま始める', () => eyeRest())),
    h('h3', {}, '開くとき'),
    row('最後のノートをすぐ開く', 'ページを開いたら、タイトルを飛ばして、最後に開いていたノートを開く。', onoff('p-auto', 'autoOpen', again)),
    h('h3', {}, '設定のファイル'),
    h('p', { class: 'muted' }, 'この画面の好みと、音・音楽・明暗・スキン・睡眠の設定を、ファイルにして別の端末へ移せる。ノート（セーブ）、画質、立体表示は入らない。'),
    h('div', { class: 'row' },
      btn('p-export', '書き出す', exportPrefs),
      btn('p-import', '読み込む', () => importPrefs(again)),
      btn('p-reset', armed ? 'もう一度押すと戻す' : '初期値に戻す', () => {
        if (!armed) { resetArmed = Date.now(); again(); return; }
        resetArmed = 0; resetPrefs(); sfx.ok(); C?.toast('この端末の好みを、初期値に戻した（覚えておく確率・睡眠の設定・ノートはそのまま）。', 3200); again();
      }, armed ? 'ghost warn' : 'ghost')),
  ];
}

// ---------------- 設定のファイル ----------------

type Saver = { save(r: { filename: string; data: Blob }): Promise<unknown> };
/** ファイルを渡す。claude.ai の中では、そこで用意された保存の確認（downloads）を使い、それ以外ではふつうにダウンロードする。保存できたら true */
async function saveBlob(name: string, data: Blob): Promise<boolean> {
  const cl = (window as unknown as { claude?: { use?: (n: string) => Promise<Saver | null> } }).claude;
  const dl = cl?.use ? await cl.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data }); return true; }
    catch (e) { const code = (e as { code?: string } | null)?.code; if (code !== 'declined') C?.toast(code === 'rate_limited' ? '保存の確認がまだ開いている。少し待ってからもう一度。' : 'ここでは保存できなかった。', 3000); return false; }
  }
  const u = URL.createObjectURL(data), a = document.createElement('a');
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(u), 5000);
  return true;
}
function exportPrefs() {
  const m = store.meta(), d = new Date();
  const data = { app: 'chemyth-prefs', v: 1, at: Date.now(), prefs: m.prefs ?? {}, sound: m.sound, music: m.music, theme: m.theme, skin: m.skin, sleep: m.sleep };
  const name = `chemyth-settings-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`;
  void saveBlob(name, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })).then((ok) => { if (ok) C?.toast('設定をファイルに書き出した。', 2400); });
}
function importPrefs(again: Again) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (!f) return;
    f.text().then((text) => {
      const d = parsePrefsFile(text);
      if (!d) { C?.toast('Chemyth の設定のファイルではない。', 3000); sfx.bad(); return; }
      // 閉店の時間帯は、睡眠の設定は変えない（寝る時刻を、その場で後ろへずらせないように）
      const lockSleep = isClosed(sleepCfg(), new Date());
      store.setMeta({
        prefs: d.prefs, ...(d.sound !== undefined ? { sound: d.sound } : {}), ...(d.music !== undefined ? { music: d.music } : {}),
        ...(d.theme ? { theme: d.theme } : {}), ...(d.skin ? { skin: d.skin as Skin } : {}), ...(d.sleep && !lockSleep ? { sleep: d.sleep } : {}),
      });
      if (d.sound !== undefined) setSound(d.sound);
      if (d.music !== undefined) setMusic(d.music);
      if (d.theme) applyTheme(d.theme);
      if (d.skin) applySkin(d.skin as Skin);
      applyPrefs();
      sfx.ok();
      C?.toast(d.sleep && lockSleep ? '設定を読み込んだ（睡眠の設定は、閉店の時間帯なので変えなかった）。' : '設定を読み込んだ。', 3000);
      again();
    }, () => C?.toast('ファイルを読めなかった。', 3000));
  };
  inp.click();
}

// ---------------- 集中表示 ----------------

let focusBtn: HTMLButtonElement | null = null;
/** 集中表示：上の帯・指令・小地図を隠して、地図を広く使う。右上の小さなボタンで戻す */
export function setFocus(on: boolean, quiet = false) {
  $('app').classList.toggle('focus', on);
  if (focusBtn) focusBtn.hidden = !on;
  if (on && !quiet) C?.toast('集中表示：上の帯と指令を隠した。右上の「表示を戻す」で戻る。', 3000);
}

// ---------------- 時計・つながらないときの印・明るさ・音量 ----------------

let clockEl: HTMLElement | null = null, offEl: HTMLButtonElement | null = null;
function paintClock() {
  if (!clockEl) return;
  const show = prefs().clock && !!C?.slot();
  clockEl.hidden = !show;
  if (!show) return;
  const now = new Date(), cfg = sleepCfg(), m = minutesToBed(cfg, now);
  const rest = !cfg.on ? '' : isClosed(cfg, now) ? '就寝の時刻' : `就寝まで ${Math.floor(m / 60)}:${pad2(m % 60)}`;
  clockEl.replaceChildren(h('b', {}, `${now.getHours()}:${pad2(now.getMinutes())}`), rest ? h('span', {}, rest) : '');
  clockEl.classList.toggle('soon', cfg.on && (m < 60 || isClosed(cfg, now)));
  clockEl.title = cfg.on ? `就寝 ${hhmm(cfg.bed)}・起床 ${hhmm(cfg.wake)}` : '';
}
/** ログインしていて、同期が回線の不調で止まっている（または端末がオフライン） */
const offline = () => { const st = syncState(); return st.on && (st.trouble === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false)); };
function paintOffline() { if (offEl) offEl.hidden = !offline(); }
/** 画面を暗くする度合い（黒の重ね。0.15 で明るさ 85 %） */
const DIM = [0, 0.15, 0.3, 0.45];
let dimNow = '';
function paintDim() {
  const p = prefs(), v = (DIM[p.dim] * (p.dim && p.dimNight ? duskOf(new Date()) : 1)).toFixed(3), root = document.documentElement;
  if (v === dimNow) return;   // 変わったときだけ書く（書くと、画面全体の見た目を計算し直す）
  dimNow = v;
  root.style.setProperty('--dim', v);
  root.classList.toggle('dimmed', Number(v) > 0.004);
}
/** 寝る前の音量（設定の音量に、就寝までの時間で決まる割合をかける） */
function paintVolume() {
  const p = prefs(), k = p.windVol ? windVolume(sleepCfg(), new Date()) : 1;
  setVolume(p.sfxVol * k);
  setMusicVolume(p.musicVol * k);
}

// ---------------- 日付の切り替わり（朝 4 時） ----------------

let day = '';
function dayTick() {
  const k = nextDay(day, Date.now());
  if (!k) return;
  const first = !day;
  day = k;
  if (first || !C) return;
  const w = C.world();
  if (w && rollDay(w, Date.now())) C.save();
  if (!C.slot()) { C.repaintTitle(); return; }
  if (!w) return;
  const left = document.getElementById('rvcard-left'), card = document.getElementById('rvcard');
  if (left && card && !card.hidden) left.textContent = `残り ${reviewCount(w)}`;
  C.toast('朝 4 時を過ぎたので、日付が変わった。今日の復習の数と遊んだ時間を、0 から数え直す。', 6000);
  C.morning();
  paintClock();
}

// ---------------- 目を休める ----------------

/** 目を休める：20 秒数えて、終わったら音で知らせる */
export function eyeRest() {
  if (!C) return;
  const total = 20;
  let left = total;
  const num = h('b', { id: 'eye-n' }, String(left)), ring = h('div', { class: 'eye-ring', id: 'eye-ring' }, num);
  ring.style.setProperty('--p', '0');
  const text = h('p', { class: 'eye-text', id: 'eye-text' }, '画面から目を離して、遠く（窓の外など）をぼんやりながめる。まばたきも、ゆっくり何回か。');
  const done = h('div', { class: 'row', hidden: true }, h('button', { class: 'primary', type: 'button', id: 'eye-done', onclick: () => C?.close() }, '戻る'));
  C.show(h('header', {}, h('h2', {}, '目を休める'), C.closeBtn()), ring, text, h('p', { class: 'muted' }, '終わると音で知らせる（音を出す設定のとき）。'), done);
  const timer = window.setInterval(() => {
    if (!num.isConnected) { clearInterval(timer); return; }
    left--;
    num.textContent = String(Math.max(0, left));
    ring.style.setProperty('--p', String((total - left) / total));
    if (left > 0) return;
    clearInterval(timer);
    sfx.ok(); buzz([30, 80, 30]);
    text.textContent = 'おつかれさま。続けるなら「戻る」。長く遊んだなら、ここで切り上げるのもよい。';
    done.hidden = false;
  }, 1000);
}
/** 休憩の知らせ（本体の、続けて遊んだ時間の知らせから呼ぶ）。通知に「目を休める」を添える */
export function breakReminder(min: number) {
  if (!C) return;
  C.toast(`${min} 分たった。ここで切り上げて休め。立って、遠くを見ろ。`, 12000);
  buzz([40, 60, 40]);
  const t = document.getElementById('toast');
  if (t && !t.hidden) t.append(h('button', { class: 'ghost', type: 'button', id: 'eye-offer', onclick: () => eyeRest() }, '目を休める（20 秒）'));
}

// ---------------- メニュー・データ・遊び方に足すもの ----------------

const item = (id: string, text: string, go: () => void) => h('button', { class: 'ghost', type: 'button', id, onclick: go }, text);
const glossary = () => { if (C) showGlossary(C.show, C.closeBtn); };
const tour = () => { C?.close(); startTour(); };
function showFactoryName() {
  const w = C?.world();
  if (!C || !w) return;
  C.show(h('header', {}, h('h2', {}, '工場の名前'), C.closeBtn()),
    h('p', { class: 'muted' }, 'タイトルのノートと、メニューに出る。セーブに入るので、書き出しやアカウントの同期でも一緒に動く。'),
    nameEditor(w.fname ?? '', (name) => { w.fname = name || undefined; C?.save(); C?.toast(name ? `工場の名前を「${name}」にした。` : '工場の名前を消した。', 2400); C?.close(); }, () => C?.close()));
}
/** メニューに足す項目。factory：「工場」の組、settings：「設定」の組 */
export function menuExtra(where: 'factory' | 'settings'): HTMLElement[] {
  if (!C) return [];
  if (where === 'factory') { const w = C.world(); return w ? [item('m-fname', w.fname ? `工場の名前：${w.fname}（変える）` : '工場の名前をつける', showFactoryName)] : []; }
  return [
    item('m-focus', '集中表示（上の帯と指令を隠して、地図を広く使う）', () => { C?.close(); setFocus(true); }),
    item('m-eye', '目を休める（20 秒、遠くをながめる）', eyeRest),
    item('m-tour', 'はじめての手引き（画面のボタンを順に示す）', tour),
    item('m-glossary', '用語集（分配器・検知器・弁・昇降機・貨物駅 …）', glossary),
  ];
}
/** データの画面に足すもの */
export function dataExtra(): HTMLElement[] {
  if (!C) return [];
  return [
    item('d-storage', '保存領域の使い方（ノート・アルバム・控えの大きさ）', () => { if (C) showStorage(C.show, C.closeBtn); }),
    h('p', { class: 'muted' }, '毎日 1 回、その日はじめてノートを保存するときに、前の日までの状態を控えている。タイトルの「前日に戻す」で戻せる。ホーム画面に追加して開いたときは、ブラウザで開いたときとは別に保存されることがある（iPhone・iPad など）。移すときは、各ノートの「書き出す」と「読み込む」か、アカウントの同期を使う。'),
  ];
}
/** 遊び方の画面に足すボタン。first：はじめに開く「はじめに」の画面 */
export function helpExtra(first: boolean): HTMLElement[] {
  if (first) return [h('button', { class: 'ghost', type: 'button', id: 'help-tour', onclick: tour }, '画面の案内を見る')];
  return [h('button', { class: 'ghost', type: 'button', id: 'help-glossary', onclick: glossary }, '用語集'), h('button', { class: 'ghost', type: 'button', id: 'help-tour', onclick: tour }, 'はじめての手引き')];
}

// ---------------- 開くとき ----------------

/** ノートを開いたときに呼ぶ */
export function started(n: number) {
  store.setMeta({ last: n });
  setFocus(false, true);
  paintClock(); paintOffline();
}
/** ページを開いたとき：設定があれば、最後に開いていたノートをそのまま開く */
export function autoOpen() {
  const n = store.meta().last;
  if (!prefs().autoOpen || !n || n < 1 || n > SLOTS) return;
  document.getElementById(`slot-${n}-go`)?.click();
}

export function initSettings2(ctx: Ctx2) {
  C = ctx;
  initSlots2();
  initWebApp();
  offEl = h('button', { type: 'button', id: 'offline', hidden: true, onclick: () => C?.toast('つながらない。セーブはこの端末に保存している。つながったら、自動で預ける。', 4000) }, 'オフライン');
  clockEl = h('span', { id: 'clock', hidden: true });
  $('topbtns').prepend(offEl, clockEl);
  focusBtn = h('button', { type: 'button', id: 'focus-exit', hidden: true, ariaLabel: '集中表示をやめる（上の帯と指令を戻す）', onclick: () => { setFocus(false); sfx.tap(); } }, '表示を戻す');
  $('app').append(focusBtn);
  onPrefs((p) => { setCvd(p.cvd); paintDim(); paintVolume(); paintClock(); });
  onAccountChange(paintOffline);
  window.addEventListener('online', () => { paintOffline(); void syncAll(); });
  window.addEventListener('offline', paintOffline);
  let n = 0;
  window.setInterval(() => {
    paintClock(); paintDim(); paintVolume(); dayTick();
    // つながらないあいだは、2 分ごとに預け直してみる
    if (++n % 8 === 0 && syncState().trouble === 'offline' && navigator.onLine !== false) void syncAll();
  }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { dayTick(); paintClock(); paintDim(); paintVolume(); } });
  watchLayout();
  dayTick();
}

/**
 * 画面の枠を測って、#app の CSS 変数にする（上と下に出す札を、指令の札・上の帯・下の道具の段に重ねないため）。
 * --goal-b・--goal-r：指令の札の下と右の端。--top-b：指令の札・上の帯（集中表示では「表示を戻す」）の、下の端のいちばん低い所。
 * --band-b：範囲選択の帯・コピー中の帯の下の端（出ていなければ 0）。--dock-h：下の道具の段（説明と棚）の上の端から、画面の下までの高さ（説明が消えても、一度出た説明の高さは残す）。
 * --rv-top：復習の札の背の上限に使う --top-b（札が出ているあいだは、操作したときだけ合わせる）。
 * 拡大・縮小のボタン（片手で使う）は、手の側の端の空いた所の真ん中に置く（--z2-l・--z2-r。入らない側は z2-l-full・z2-r-full）
 */
function watchLayout() {
  const app = $('app'), goal = $('goal'), top = $('topbtns'), dock = $('dock');
  // 変わったときだけ書く（書くと、#app の中の見た目をすべて計算し直す）
  const last = new Map<string, string>();
  const px = (k: string, v: number) => { const s = `${Math.round(v)}px`; if (last.get(k) !== s) { last.set(k, s); app.style.setProperty(k, s); } };
  const box = (id: string) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
  const placeZoom = (a: DOMRect) => {
    const z = document.getElementById('zoom2');
    if (!z || z.hidden || !z.offsetHeight) return;
    const zw = z.offsetWidth, zh = z.offsetHeight;
    for (const left of [true, false]) {
      // 端の列（端から、ボタンの幅と余白まで）にかかる札だけを見る
      const x0 = left ? a.left : a.right - zw - 24, x1 = x0 + zw + 24;
      const hits = (r: DOMRect | null): r is DOMRect => !!r && r.left < x1 && r.right > x0;
      let hi = a.top + 8, lo = a.bottom - 8;
      for (const id of ['goal', 'topbtns', 'focus-exit', 'area-act', 'clone-bar']) { const r = box(id); if (hits(r)) hi = Math.max(hi, r.bottom + 8); }
      for (const id of ['bar', 'minimap', 'marks', 'rvcard']) { const r = box(id); if (hits(r)) lo = Math.min(lo, r.top - 8); }
      const mid = (a.top + a.bottom - zh) / 2;
      px(left ? '--z2-l' : '--z2-r', Math.max(hi, Math.min(mid, lo - zh)) - a.top);
      app.classList.toggle(left ? 'z2-l-full' : 'z2-r-full', lo - hi < zh);
    }
  };
  // 道具の説明は、選んだ直後とベルトを引くあいだだけ出て、じきに消える。出た高さを覚えておき、消えても下の札を下げない
  // （消えるたびに下げると、復習の札の答えを押そうとした指の下で札が動き、ひとつ上の答えを押してしまう）。
  // 説明の折り返しが変わるとき（画面の幅・スキン・文字やボタンの大きさを変えたとき）だけ、覚えた高さを捨てて測り直す
  let tipKey = '', tipH = 0, rvKey = '';
  let raf = 0;
  const measure = () => {
    raf = 0;
    const a = app.getBoundingClientRect(), g = goal.getBoundingClientRect(), t = top.getBoundingClientRect(), d = dock.getBoundingClientRect();
    const gb = (g.height ? g.bottom : g.top) - a.top;
    px('--goal-b', gb);
    px('--goal-r', g.width ? g.right - a.left : 0);
    const fx = box('focus-exit');
    const topB = Math.max(gb, t.height ? t.bottom - a.top : 0, fx ? fx.bottom - a.top : 0);
    px('--top-b', topB);
    px('--band-b', Math.max(0, ...['area-act', 'clone-bar'].map((id) => { const r = box(id); return r ? r.bottom - a.top : 0; })));
    // 道具の説明は、スキンによっては段の外（段の上）に浮かせているので、別に測る
    const root = document.documentElement;
    const key = [Math.round(a.width), root.dataset.skin ?? '', ...['big-text', 'huge-text', 'big-btn'].map((c) => root.classList.contains(c))].join(' ');
    if (key !== tipKey) { tipKey = key; tipH = 0; }
    const tip = box('tip');
    if (tip) tipH = Math.max(tipH, a.bottom - tip.top);
    px('--dock-h', d.height ? Math.max(a.bottom - d.top, tipH) : 0);
    // 復習の札の背の上限は、--rv-top（上の札の下の端）で決める。札が出ているあいだは、指令の札の高さ（納品の速さの行は、1 秒に 2 回書き換わる）や
    // 上の帯が変わっても合わせない（合わせると札の上の端が動き、中の答えも動く）。札が出ていないとき、指令をたたむ・開く、集中表示、画面や設定を変えたときに合わせる
    const rk = `${key} ${Math.round(a.height)} ${goal.classList.contains('folded')} ${app.classList.contains('focus')}`;
    if (!box('rvcard') || rk !== rvKey) { rvKey = rk; px('--rv-top', topB); }
    placeZoom(app.getBoundingClientRect());
  };
  // 測った値で上の帯の幅が変わり、また測る…が同じ描画のうちに回らないよう、次の描画の前にまとめて測る
  const later = () => { if (!raf) raf = requestAnimationFrame(measure); };
  measure();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(later);
    for (const id of ['goal', 'topbtns', 'dock', 'tip', 'rvcard', 'minimap', 'marks', 'zoom2', 'focus-exit', 'area-act', 'clone-bar']) { const e = document.getElementById(id); if (e) ro.observe(e); }
  }
  // 説明は少し下から浮かんで出てくるので、出終わってから、もう一度測る（出始めに測ると、高さが少し足りない）
  $('tip').addEventListener('animationend', later);
  // 手の側・復習の札の側・小地図の大きさ（html の class）、小地図を隠したときの場所のボタンの位置（#app の class）でも変わる
  // （同じ class を書き直しただけのときは測らない。小地図を出さない間は、毎秒なんども書き直している）
  const mo = new MutationObserver((recs) => { if (recs.some((r) => r.oldValue !== (r.target as Element).getAttribute(r.attributeName!))) later(); });
  mo.observe(document.documentElement, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-skin'] });
  mo.observe(app, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  window.addEventListener('resize', later);
}
