/**
 * 組み立てを手早くする道具（改善 26〜50）。main.ts からは、短い呼び出し（フック）だけで使う。
 *  自動ベルト「道」・範囲をその場で回す／鏡に映す・設計図の並べ替えと見本・隣に複製・最近の道具・★ の棚・
 *  拡大縮小のボタン・片手の配置・操作のロック・消す前の確かめ・ベルトを引く向きの矢印・置く前のつながりの印・
 *  採取機の産出物・置けない理由・装置の一時停止・ベルトを逆向きに・範囲の絞り込み・同じものをもう一度・
 *  地図の旗・設備の名前・コピー中の帯・つなぎ忘れ
 */
import { MACHINES } from '../content/machines';
import { resourceAt } from '../content/map';
import { recipeById } from '../content/recipes';
import { setById } from '../content/samples';
import { isSep } from '../content/sep';
import { hasSub, label, sub } from '../content/substances';
import type { Stamp } from '../engine/blueprint';
import { findRoute, type RouteStep } from '../engine/route';
import { acceptsFrom, beltLine, dupSpot, looseOutputs, mirrorFixed, nameOf, reversedDirs, stockOf, whyNot, xEnts, xStamps, type Rect, type Xform } from '../engine/shape';
import { at, BIG, configure, DX, DY, floorOf, FLOOR_DY, groundY, inflow, isMachine, liftPartner, MOVERS, PIN_MAX, PIN_NOTE, sizeOf, type Dir, type Ent, type Kind, type World } from '../engine/world';
import { $, h } from './dom';
import { adoptPrefs, buzz, onPrefs, prefs, setPrefs, type Prefs } from './prefs';
import type { Camera, View } from './render';
import { sfx } from './sound';
import { palette } from './theme';

/** main.ts が渡す、いまの状態と操作 */
export interface B2Ctx {
  app: HTMLElement;
  cam: Camera;
  world(): World;
  slot(): number;
  floor(): number;
  tool(): string;
  pick(t: string): void;
  placeDir(): Dir | null;
  setPlaceDir(d: Dir | null): void;
  /** いまの道具で (x, y) に置く（装置なら設定が開く） */
  placeAt(x: number, y: number): void;
  selected(): Ent | null;
  select(e: Ent | null): void;
  /** マウスが乗っているマス（階のずれを含む） */
  hover(): [number, number] | null;
  toast(msg: string, ms?: number): void;
  /** 置く・消す・回す（元に戻せるように記録する） */
  place(kind: Kind, x: number, y: number, dir: Dir): string | null;
  erase(x: number, y: number): boolean;
  turn(e: Ent, d: Dir): void;
  /** ここで手の組を区切る（このあとの手は、新しい 1 手になる） */
  cut(): void;
  /** 設備を移したことを 1 手として記録する（線路の控えも）。how：回す・鏡に映したときの付け替え */
  recordMove(removed: Ent[], added: Ent[], snap: [string, number | undefined][], how?: Xform): void;
  save(): void;
  /** その設備へ移って選ぶ */
  focus(e: Ent): void;
  /** その場所（階のずれを含む）へ移る */
  goTo(x: number, y: number): void;
  show(...nodes: (Node | string | null)[]): void;
  closeBtn(): HTMLElement;
  close(): void;
  zoom(f: number): void;
  clone(): { kind: string; recipe?: string; sub?: string } | null;
  cancelClone(): void;
  blueprint(): Stamp[] | null;
  setBlueprint(b: Stamp[]): void;
  areaRect(): Rect | null;
  setArea(r: Rect | null): void;
  inArea(): Ent[];
  paintArea(): void;
  setTab(id: string): void;
}

/** この端末だけの記録：最近の道具、★ の道具（拡大縮小のボタンと道具の棚の位置は、設定の好み prefs にある） */
interface Mine { recent: string[]; fav: string[] }
const KEY = 'chemyth-v2-build';
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 40) : []);
function readMine(): Mine {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || '{}'), mine = { recent: strs(m.recent), fav: strs(m.fav) };
    // 以前は拡大縮小のボタンと道具の棚の位置もここに置いていて、設定の「初期値に戻す」と設定のファイルから漏れていた。好みへ移して、ここからは消す
    if ('zoom' in m || 'hand' in m) {
      const old: Partial<Prefs> = {};
      if (m.zoom === true) old.zoomBtns = true;
      if (m.hand === 'left' || m.hand === 'right') old.hand = m.hand;
      if (Object.keys(old).length) adoptPrefs(old);
      try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch { /* 残せなくても使える */ }
    }
    return mine;
  } catch { return { recent: [], fav: [] }; }
}
const ARROWS = ['→', '↓', '←', '↑'];
/** 中にこれだけたまっていたら、消す前に確かめる */
export const STOCK_ASK = 30;
/** まとめて消すとき、これだけ以上なら確かめる */
export const BULK_ASK = 30;
/** 一時停止できる設備：装置・分ける装置・採取機・試薬棚・搬出口 */
const pausable = (e: Ent) => isMachine(e.kind) || isSep(e.kind) || e.kind === 'extractor' || e.kind === 'sampler' || e.kind === 'depot';
const FILTER_NAME = { all: '選ぶ：すべて', belt: '選ぶ：ベルト類だけ', machine: '選ぶ：装置だけ' } as const;
type Filter = keyof typeof FILTER_NAME;

export function initBuild2(c: B2Ctx) {
  const mine = readMine();
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch { /* 残せなくても使える */ } };
  const titleOf = (e: Ent) => { const r = recipeById(e.recipe); return `${nameOf(e.kind)}${r && !e.sealed ? `（${r.name}）` : ''}${e.memo ? `「${e.memo}」` : ''}${floorOf(e.y) ? '・2 階' : ''}`; };
  const toolBtn = (id: string) => document.getElementById(`tool-${id}`) as HTMLButtonElement | null;
  const toolHidden = (id: string) => { const b = toolBtn(id); return !b || b.hidden; };

  // ---- 確かめの窓（設定の窓が閉じても残る、小さな窓） ----
  const askEl = h('div', { id: 'ask2', hidden: true });
  c.app.append(askEl);
  let askYes: (() => void) | null = null;
  const askClose = () => { askEl.hidden = true; askEl.replaceChildren(); askYes = null; };
  const ask = (msg: string, note: string, yes: string, go: () => void) => {
    askYes = () => { askClose(); go(); };
    askEl.replaceChildren(h('div', { class: 'ask-box', role: 'alertdialog', ariaLabel: msg },
      h('p', { class: 'ask-msg' }, msg), note ? h('p', { class: 'muted' }, note) : null,
      h('div', { class: 'row' },
        h('button', { class: 'primary danger', type: 'button', id: 'ask-yes', onclick: () => askYes?.() }, yes),
        h('button', { class: 'ghost', type: 'button', id: 'ask-no', onclick: () => { askClose(); sfx.tap(); } }, 'やめる'))));
    askEl.hidden = false;
    sfx.tap();
  };
  askEl.addEventListener('pointerdown', (ev) => { if (ev.target === askEl) askClose(); });
  // 窓が開いている間は、キーを地図の操作に回さない（Enter で決める、Esc でやめる）
  document.addEventListener('keydown', (ev) => {
    if (askEl.hidden) return;
    if (ev.key === 'Escape') askClose();
    else if (ev.key === 'Enter') askYes?.();
    else return;
    ev.preventDefault(); ev.stopPropagation();
  }, true);

  // ---- 操作のロック：見るだけにする（置く・消す・ずらす・回すを止める） ----
  let lock = false, lockTold = 0;
  const LOCK_SVG = (on: boolean) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="${on ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.6-1.8'}"></path></svg>`;
  const lockBtn = h('button', { type: 'button', id: 'b-lock', title: '操作のロック：見るだけにする（置く・消す・ずらすを止める）', ariaLabel: '操作のロック' });
  lockBtn.innerHTML = LOCK_SVG(false);
  /** 外し方：集中表示では上の帯（鍵のある所）が隠れているので、まず表示を戻す */
  const unlockHow = () => (c.app.classList.contains('focus') ? '右上の「表示を戻す」で上の帯を出して、鍵を押すと外れる' : '右上の鍵を押すと外れる');
  const lockNote = () => { if (performance.now() - lockTold > 1500) { lockTold = performance.now(); c.toast(`ロック中（見るだけ）。${unlockHow()}。`, 1800); sfx.bad(); } };
  const setLock = (on: boolean, quiet = false) => {
    lock = on;
    lockBtn.innerHTML = LOCK_SVG(on);
    lockBtn.classList.toggle('hot', on);
    lockBtn.setAttribute('aria-pressed', String(on));
    c.app.classList.toggle('locked', on);
    if (on) { routeA = null; preview = null; c.pick('pan'); }
    if (quiet) return;
    c.toast(on ? 'ロックした。見るだけになる（置く・消す・ずらす・回すはできない）。もう一度押すと外れる。' : 'ロックを外した。', 2600);
    sfx.tap();
  };
  lockBtn.onclick = () => setLock(!lock);

  // ---- 地図の旗：覚えておきたい場所に、ひと言を添えて立てる（ノートごと、20 本まで） ----
  const pinBtn = h('button', { type: 'button', id: 'b-pins', title: '地図の旗（覚えておきたい場所と、ひと言）' }, '旗');
  $('b-fit').before(pinBtn, lockBtn);
  const showPins = () => {
    const w = c.world(), pins = w.pins, sel = c.selected();
    const add = () => {
      if (pins.length >= PIN_MAX) return;
      const [x, y] = sel && sel.kind !== 'hub' ? [sel.x, sel.y] : [Math.floor(c.cam.x), Math.floor(c.cam.y) + c.floor() * FLOOR_DY];
      pins.push({ x, y, note: sel && sel.kind !== 'hub' ? titleOf(sel).slice(0, PIN_NOTE) : `旗 ${pins.length + 1}` });
      c.save(); sfx.ok(); showPins();
    };
    c.show(h('header', {}, h('h2', {}, '地図の旗'), c.closeBtn()),
      h('p', { class: 'muted' }, `覚えておきたい場所に旗を立てて、ひと言書いておける（${PIN_MAX} 本まで。このノートに残る）。「行く」で、その場所へ移る。ひと言はタップして書き換えられる。`),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'pin-add', disabled: pins.length >= PIN_MAX, onclick: add }, sel && sel.kind !== 'hub' ? '選んだものの所に旗を立てる' : '画面の真ん中に旗を立てる'), h('span', { class: 'muted' }, `${pins.length} / ${PIN_MAX} 本`)),
      pins.length ? h('div', { class: 'menu', id: 'pin-list' }, ...pins.map((p, i) => {
        const inp = h('input', { class: 'bp-name', type: 'text', id: `pin-note-${i}`, value: p.note, maxLength: PIN_NOTE, ariaLabel: '旗のひと言' }) as HTMLInputElement;
        inp.onchange = () => { p.note = inp.value.trim().slice(0, PIN_NOTE); c.save(); };
        return h('div', { class: 'row bp' },
          h('span', { class: 'stack' }, inp, h('span', { class: 'muted' }, `${floorOf(p.y) ? '2 階　' : ''}(${p.x}, ${groundY(p.y)})`)),
          h('button', { class: 'primary', type: 'button', id: `pin-go-${i}`, onclick: () => { c.close(); c.goTo(p.x + 0.5, p.y + 0.5); sfx.tap(); } }, '行く'),
          h('button', { class: 'ghost warn', type: 'button', id: `pin-del-${i}`, onclick: () => { pins.splice(i, 1); c.save(); showPins(); } }, '抜く'));
      })) : h('p', {}, 'まだ旗はない。'));
  };
  pinBtn.onclick = () => { showPins(); sfx.tap(); };

  // ---- 拡大・縮小のボタン（片手で使う）と、道具の棚の位置 ----
  const zoomEl = h('div', { id: 'zoom2', hidden: true },
    h('button', { type: 'button', id: 'zoom-in', ariaLabel: '拡大', onclick: () => { c.zoom(1.25); sfx.tap(); } }, '+'),
    h('button', { type: 'button', id: 'zoom-out', ariaLabel: '縮小', onclick: () => { c.zoom(0.8); sfx.tap(); } }, '−'));
  c.app.append(zoomEl);
  // ボタンを出すかと棚を寄せる側は、設定の好み（寄せる側は html の class にして、applyPrefs が付ける）
  let zoomBtns = prefs().zoomBtns;
  onPrefs((p) => { zoomBtns = p.zoomBtns; });

  // ---- 最近の道具（棚の右端に 3 つ）・★ の棚・同じものをもう一度 ----
  const recentEl = h('div', { id: 'recent', hidden: true, title: '最近使った道具' });
  $('tools').after(recentEl);
  let last: { kind: Kind; dir: Dir } | null = null, curTab = '';
  const mini = (id: string, onclick: () => void, extra?: string) => {
    const src = toolBtn(id)!, b = h('button', { type: 'button', class: 'tool mini', id: `recent-${id}`, title: `${src.querySelector('.l')?.textContent ?? ''}（最近使った道具）`, onclick: () => { onclick(); sfx.tap(); } },
      h('span', { class: 'g' }, src.querySelector('.g')?.textContent ?? ''), h('span', { class: 'l' }, extra ?? src.querySelector('.l')?.textContent ?? ''));
    const tint = src.style.getPropertyValue('--tint');
    if (tint) b.style.setProperty('--tint', tint);
    return b;
  };
  const again = () => {
    if (!last) { c.toast('まだ何も置いていない。', 1400); return; }
    if (lock) { lockNote(); return; }
    if (toolHidden(last.kind)) return;
    const { kind, dir } = last;
    if (c.tool() !== kind) c.pick(kind);
    c.setPlaceDir(dir);
    const hv = c.hover(), w = c.world();
    if (hv && !at(w, hv[0], hv[1])) { c.placeAt(hv[0], hv[1]); return; }
    c.toast(`${nameOf(kind)}を ${ARROWS[dir]} 向きで置く。置く場所をタップ（. キーなら、マウスの下に置く）。`, 2400);
  };
  const paintRecent = () => {
    const cur = c.tool();
    const ids = mine.recent.filter((id) => id !== cur && id !== 'pan' && !toolHidden(id)).slice(0, 3);
    const nodes = ids.map((id) => mini(id, () => c.pick(id)));
    if (last && !toolHidden(last.kind) && !(cur === last.kind && c.placeDir() === last.dir)) {
      const b = mini(last.kind, again, `もう一度${ARROWS[last.dir]}`);
      b.id = 'b-again'; b.classList.add('again'); b.title = `${nameOf(last.kind)}を同じ向き（${ARROWS[last.dir]}）でもう一度置く（. キー）`;
      nodes.push(b);
    }
    recentEl.replaceChildren(...nodes);
    recentEl.hidden = !nodes.length;
  };
  // 道具を長押しすると ★ をつける・外す（指を離したときの押した扱いは捨てる）
  let swallow = false;
  $('tools').addEventListener('click', (ev) => { if (swallow) { swallow = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
  const paintFavs = () => { for (const b of $('tools').querySelectorAll<HTMLElement>('.tool')) b.classList.toggle('fav', mine.fav.includes(b.id.slice(5))); };
  const toggleFav = (id: string) => {
    const on = !mine.fav.includes(id), name = toolBtn(id)?.querySelector('.l')?.textContent ?? '';
    mine.fav = on ? [...mine.fav, id] : mine.fav.filter((x) => x !== id);
    write();
    c.toast(on ? `「${name}」に ★ をつけた。★ の棚に並ぶ。もう一度長押しすると外れる。` : `「${name}」の ★ を外した。`, 2600);
    c.setTab((curTab === 'fav' && !mine.fav.length) || !curTab ? 'move' : curTab);
  };

  // ---- 選んだものの帯：隣に複製・一時停止・ベルトを逆向きに ----
  const dupBtn = h('button', { type: 'button', id: 'act-dup', title: '隣に複製（Ctrl + D）', ariaLabel: '隣に複製' }, '隣に');
  const pauseBtn = h('button', { type: 'button', id: 'act-pause', title: '一時停止・再開', ariaLabel: '一時停止' }, '‖');
  const revBtn = h('button', { type: 'button', id: 'act-rev', title: 'つながったベルトを、まとめて逆向きにする', ariaLabel: 'ベルトを逆向きに' }, '⇄');
  $('act-erase').before(revBtn, pauseBtn, dupBtn);
  const copySettings = (s: Ent, d: Ent) => {
    const r = recipeById(s.recipe);
    if (r && s.outOrder) { configure(d, r, s.outOrder.filter((x) => x !== 'e')); d.outOrder = [...s.outOrder]; d.outBuf = s.outOrder.map(() => 0); if (s.outSlot) d.outSlot = [...s.outSlot]; }
    d.test = s.test;
    if (s.kind !== 'tank') d.sub = s.sub;   // タンクの物質は中身なので写さない
    if (s.kind === 'station') { d.ch = s.ch ?? 1; d.role = s.role ?? 'in'; d.cars = s.cars; }
    if (s.kind === 'sensor' || s.kind === 'gate') d.ch = s.ch;
    // 昇降機は、置いた側が入口になる。写したのが出口なら、相方と入れ替える
    if (s.kind === 'lift' && s.role === 'out') { const p = liftPartner(c.world(), d); if (p) { d.role = 'out'; p.role = 'in'; } }
  };
  const dup = () => {
    const e = c.selected();
    if (!e || e.kind === 'hub' || e.kind === 'part') return;
    if (lock) { lockNote(); return; }
    if (e.sealed) { c.toast('中身の見えない装置は、複製できない。', 2000); return; }
    const w = c.world(), spot = dupSpot(w, e);
    if (!spot) { c.toast('まわりがふさがっていて、隣に置けない。', 2200); sfx.bad(); return; }
    c.cut();
    const err = c.place(e.kind as Kind, spot.x, spot.y, e.dir);
    if (err) { c.toast(err, 2200); sfx.bad(); return; }
    const p = at(w, spot.x, spot.y)!;
    copySettings(e, p);
    c.cut();
    c.select(p); sfx.place(); c.save();
    c.toast(spot.side === 0 ? '隣（正面）に複製した。続けて押すと、さらに隣へ。' : `正面がふさがっていたので、${['', '右手', '背中側', '左手'][spot.side]}に複製した。`, 2200);
  };
  const togglePause = () => {
    const e = c.selected();
    if (!e || !pausable(e)) return;
    if (lock) { lockNote(); return; }
    // 欄を消さずに空にする（欄を消すと、その設備だけデータの形が変わり、読むのが遅くなる）
    e.off = e.off ? undefined : true;
    dirty = true; c.save(); sfx.tap();
    c.toast(e.off ? `${nameOf(e.kind)}を止めた。物も受け取らない。▶ で動かす。` : `${nameOf(e.kind)}を動かした。`, 2000);
  };
  const reverse = () => {
    const e = c.selected();
    if (!e || e.kind !== 'belt') return;
    if (lock) { lockNote(); return; }
    const w = c.world(), line = beltLine(w, e), dirs = reversedDirs(w, line);
    c.cut(); line.forEach((b, i) => c.turn(b, dirs[i])); c.cut();
    c.save(); sfx.tap();
    c.toast(`ベルト ${line.length} マスの向きを逆にした（合流・分かれ道の手前まで）。元に戻すで戻せる。`, 2600);
  };
  dupBtn.onclick = dup; pauseBtn.onclick = togglePause; revBtn.onclick = reverse;

  // ---- 範囲：その場で回す・鏡に映す、選ぶものの絞り込み ----
  let filter: Filter = 'all';
  const rot2 = h('button', { type: 'button', id: 'area-rot2', title: '囲んだものを、その場で右に 90° 回す（R）' }, '↻ 回す');
  const flipX = h('button', { type: 'button', id: 'area-flipx', title: '左右を入れ替える（鏡に映す）' }, '⇋ 左右');
  const flipY = h('button', { type: 'button', id: 'area-flipy', title: '上下を入れ替える（鏡に映す）' }, '⇵ 上下');
  const filt = h('button', { type: 'button', id: 'area-filter', title: '囲んだ中から、ベルト類だけ・装置だけを選ぶ' }, FILTER_NAME.all);
  $('area-rot').after(rot2, flipX, flipY);
  $('area-all').after(filt);
  const fixedNote = (warn: string[]) => { if (warn.length) c.toast(`${warn.join('・')}は、左右の出口が入れ替わらない。つなぎ直しが要る。`, 4200); };
  const xArea = (how: Xform) => {
    const bp = c.blueprint();
    if (bp) { c.setBlueprint(xStamps(bp, how)); c.paintArea(); sfx.tap(); fixedNote(mirrorFixed(bp.map((b) => b.kind), how)); return; }
    if (lock) { lockNote(); return; }
    const r = c.areaRect(), es = c.inArea();
    if (!r || !es.length) return;
    const res = xEnts(c.world(), es, how, r);
    if (!res.ok) { c.toast(res.why, 2400); sfx.bad(); buzz(30); return; }
    c.recordMove(res.removed, res.added, res.snap, how);
    c.setArea(res.box);
    c.paintArea(); c.save(); sfx.place(); buzz(12);
    fixedNote(res.warn);
  };
  rot2.onclick = () => xArea('rot');
  flipX.onclick = () => xArea('flipX');
  flipY.onclick = () => xArea('flipY');
  filt.onclick = () => { filter = filter === 'all' ? 'belt' : filter === 'belt' ? 'machine' : 'all'; areaKey = ''; c.paintArea(); sfx.tap(); };

  // ---- 自動ベルト「道」：始まりと終わりをタップすると、最短の道筋にベルトを敷く ----
  let routeA: [number, number] | null = null, preview: RouteStep[] | null = null, prevKey = '';
  /** マウスがいまのマスに乗った時刻（見本は、少しとどまってから探す） */
  let hoverKey = '', hoverAt = 0;
  const routeTap = (x: number, y: number) => {
    const w = c.world();
    if (!routeA) {
      const e = at(w, x, y);
      if (e && (e.kind === 'hub' || e.kind === 'vent')) { c.toast('納品所や廃棄口からは始められない。物が出る設備か、空いたマスを選べ。', 2600); sfx.bad(); return; }
      routeA = [x, y]; preview = null; prevKey = '';
      c.toast(e ? `始まり：${nameOf(e.kind)}の出口。次に、終わり（装置か空いたマス）をタップ。` : '始まり：ここ。次に、終わり（装置か空いたマス）をタップ。', 2600);
      sfx.tap();
      return;
    }
    if (routeA[0] === x && routeA[1] === y) { routeA = null; preview = null; c.toast('道の始まりを外した。', 1000); return; }
    if (lock) { lockNote(); return; }
    const r = findRoute(w, routeA, [x, y]);
    if (!r.ok) { c.toast(`${r.why}　別の終わりを選ぶか、始まりをもう一度タップしてやめる。`, 3600); sfx.bad(); buzz(30); return; }
    c.cut();
    let n = 0, b = 0;
    for (const s of r.steps) {
      if (s.bridge) { c.erase(s.x, s.y); if (!c.place('bridge', s.x, s.y, 0)) b++; }
      else if (!c.place('belt', s.x, s.y, s.dir)) n++;
    }
    c.cut();
    routeA = null; preview = null;
    c.save(); sfx.place(); buzz(12);
    c.toast(`ベルトを ${n} マス敷いた${b ? `（立体交差 ${b} か所）` : ''}。元に戻すで、まとめて戻せる。`, 2600);
  };

  // ---- ベルトを引いている間の向きの矢印 ----
  let trail: [number, number][] = [], trailEnd = 0, skipTold = false;

  // ---- 地図に重ねるもの：一時停止・名前（数が少ないので、ときどき拾い直す） ----
  let marked: Ent[] = [], markW: World | null = null, markN = -1, markT = 0, dirty = true;
  const refreshMarked = (w: World) => {
    if (!dirty && w === markW && w.ents.size === markN && ++markT % 45) return;
    dirty = false; markW = w; markN = w.ents.size;
    marked = [...w.ents.values()].filter((e) => e.kind !== 'part' && (e.off || e.memo));
  };
  let areaList: Ent[] = [], areaKey = '', areaT = 0;
  const filtered = () => {
    const r = c.areaRect(), k = r ? r.join(',') + filter : '';
    if (k !== areaKey || ++areaT % 20 === 0) { areaKey = k; areaList = r && filter !== 'all' ? c.inArea() : []; }
    return areaList;
  };

  /** 矢じり（cx, cy が中心、r が大きさ） */
  const chev = (g: CanvasRenderingContext2D, cx: number, cy: number, d: number, r: number, fill: string, ink: string, lw: number) => {
    const ux = DX[d], uy = DY[d];
    g.beginPath();
    g.moveTo(cx + ux * r, cy + uy * r);
    g.lineTo(cx - ux * r * 0.6 - uy * r * 0.8, cy - uy * r * 0.6 + ux * r * 0.8);
    g.lineTo(cx - ux * r * 0.15, cy - uy * r * 0.15);
    g.lineTo(cx - ux * r * 0.6 + uy * r * 0.8, cy - uy * r * 0.6 - ux * r * 0.8);
    g.closePath();
    g.fillStyle = fill; g.fill(); g.strokeStyle = ink; g.lineWidth = lw; g.stroke();
  };
  /** 札（名前・産出物・旗のひと言） */
  const tag = (g: CanvasRenderingContext2D, text: string, x: number, y: number, fs: number, align: 'center' | 'left', bg: string, fg: string, edge: string) => {
    g.font = `700 ${fs}px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif`;
    const tw = g.measureText(text).width + fs * 0.8, th = fs * 1.5, bx = align === 'center' ? x - tw / 2 : x, by = y - th / 2, rd = Math.min(5, th / 3);
    g.beginPath();
    g.moveTo(bx + rd, by); g.arcTo(bx + tw, by, bx + tw, by + th, rd); g.arcTo(bx + tw, by + th, bx, by + th, rd); g.arcTo(bx, by + th, bx, by, rd); g.arcTo(bx, by, bx + tw, by, rd); g.closePath();
    g.fillStyle = bg; g.fill(); g.strokeStyle = edge; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, bx + tw / 2, y + 0.5);
  };

  const draw = (base: CanvasRenderingContext2D, top: CanvasRenderingContext2D, sx: (x: number) => number, sy: (y: number) => number, z: number, t: number, view: View) => {
    const w = c.world(), P = palette(), fl = view.floor || 0, punk = P.skin === 'punk';
    const bg = punk ? '#0b0d10' : P.plate, fg = punk ? '#eef0ea' : P.ink, edge = punk ? P.hi : P.ink;
    const k = base.getTransform().a || 1, W = base.canvas.width / k, H = base.canvas.height / k;
    const vis = (px: number, py: number, m: number) => px > -m && py > -m && px < W + m && py < H + m;
    refreshMarked(w);
    base.save(); top.save();
    try {
      // ---- 範囲の絞り込み：選ばれているものに印 ----
      if (filter !== 'all' && view.area) {
        base.strokeStyle = P.hi; base.lineWidth = Math.max(1.5, z * 0.08);
        for (const e of filtered()) { if (floorOf(e.y) !== fl) continue; const s = sizeOf(e); base.strokeRect(sx(e.x) + 2, sy(e.y) + 2, s * z - 4, s * z - 4); }
      }
      // ---- 自動ベルト：始まりの印と、マウスの下までの道の見本 ----
      if (routeA && c.tool() === 'route') {
        const hv = c.hover(), key = hv ? hv.join(',') : '', now = performance.now();
        // 見本は、近い所（120 マスまで）だけ探す（遠いと、マウスを動かすたびに重くなる）。
        // マウスが同じマスに 90 ms とどまってから探す（動かしている間に 1 マスごとに探すと、そのたびに絵が止まる）。それまでは前の見本のまま
        if (key !== hoverKey) { hoverKey = key; hoverAt = now; }
        if (key !== prevKey && now - hoverAt >= 90) { prevKey = key; const near = hv && Math.abs(hv[0] - routeA[0]) + Math.abs(hv[1] - routeA[1]) <= 120 && (hv[0] !== routeA[0] || hv[1] !== routeA[1]); const r = near ? findRoute(w, routeA, hv) : null; preview = r?.ok ? r.steps : null; }
        for (const s of preview ?? []) {
          if (floorOf(s.y) !== fl) continue;
          const px = sx(s.x), py = sy(s.y);
          base.fillStyle = s.bridge ? 'rgba(90,140,220,0.35)' : punk ? `rgba(${P.glow},0.28)` : 'rgba(255,225,77,0.42)';
          base.fillRect(px + 1, py + 1, z - 2, z - 2);
          if (z >= 12) chev(base, px + z / 2, py + z / 2, s.dir, z * 0.26, P.hi, punk ? '#0b0d10' : P.ink, Math.max(1, z * 0.03));
        }
        if (floorOf(routeA[1]) === fl) {
          const cx = sx(routeA[0] + 0.5), cy = sy(routeA[1] + 0.5);
          base.strokeStyle = P.red; base.lineWidth = Math.max(2, z * 0.08);
          base.setLineDash([z * 0.18, z * 0.12]); base.lineDashOffset = -t * z * 0.5;
          base.beginPath(); base.arc(cx, cy, z * 0.62, 0, Math.PI * 2); base.stroke(); base.setLineDash([]);
          if (z >= 12) tag(base, '始まり', cx, cy + z * 0.95, Math.max(10, Math.min(14, z * 0.26)), 'center', bg, fg, edge);
        }
      }
      // ---- ベルトを引いている間：引いたマスに、流れる向きの矢印 ----
      if (trail.length && z >= 10) {
        const a = trailEnd ? 1 - (performance.now() - trailEnd) / 700 : 1;
        if (a <= 0) trail = [];
        else {
          base.globalAlpha = a;
          const dirOf = (p: [number, number], q: [number, number]) => (q[0] > p[0] ? 0 : q[0] < p[0] ? 2 : q[1] > p[1] ? 1 : 3);
          trail.forEach(([x, y], i) => {
            const e = at(w, x, y);
            if (!e || floorOf(y) !== fl || (e.kind !== 'belt' && e.kind !== 'bridge')) return;
            // 立体交差は、なぞった向き
            const d = e.kind === 'belt' ? e.dir : i > 0 ? dirOf(trail[i - 1], trail[i]) : trail[i + 1] ? dirOf(trail[i], trail[i + 1]) : 0;
            chev(base, sx(x + 0.5), sy(y + 0.5), d, z * 0.3, P.hi, punk ? '#0b0d10' : P.ink, Math.max(1.2, z * 0.04));
          });
          base.globalAlpha = 1;
        }
      }
      // ---- 置く前の見本：出口の先がつながるか（緑のチェック）、何もないか（灰）、受け取れない向きか（赤） ----
      const ghost = view.ghost?.length === 1 && view.ghost[0].ports && view.ghost[0].ok ? view.ghost[0] : null;
      if (ghost && z >= 12) {
        const r = Math.max(5, z * 0.15);
        const mark = (x: number, y: number, st: 'ok' | 'none' | 'bad') => {
          base.beginPath(); base.arc(x, y, r, 0, Math.PI * 2);
          base.fillStyle = st === 'ok' ? '#2f9e55' : st === 'bad' ? '#d23f3a' : 'rgba(140,146,150,0.9)';
          base.fill(); base.strokeStyle = '#ffffff'; base.lineWidth = Math.max(1.5, r * 0.28); base.lineCap = 'round'; base.lineJoin = 'round';
          base.beginPath();
          if (st === 'ok') { base.moveTo(x - r * 0.45, y + r * 0.02); base.lineTo(x - r * 0.1, y + r * 0.38); base.lineTo(x + r * 0.5, y - r * 0.35); }
          else if (st === 'bad') { base.moveTo(x - r * 0.38, y - r * 0.38); base.lineTo(x + r * 0.38, y + r * 0.38); base.moveTo(x + r * 0.38, y - r * 0.38); base.lineTo(x - r * 0.38, y + r * 0.38); }
          else { base.moveTo(x - r * 0.42, y); base.lineTo(x + r * 0.42, y); }
          base.stroke();
        };
        for (const q of ghost.ports ?? []) {
          if (q.out) {
            const tt = at(w, q.x + DX[q.d], q.y + DY[q.d]);
            mark(sx(q.x + 0.5 + DX[q.d] * 0.95), sy(q.y + 0.5 + DY[q.d] * 0.95), !tt ? 'none' : acceptsFrom(tt, q.d as Dir) ? 'ok' : 'bad');
          } else if (inflow(w, q.x, q.y, q.d as Dir) === q.d) mark(sx(q.x + 0.5 - DX[q.d] * 0.95), sy(q.y + 0.5 - DY[q.d] * 0.95), 'ok');
        }
        // 採取機：その場所で採れるもの（出口の印と重ならないよう、下向きなら上、ほかは下に出す）
        if (view.tool === 'extractor' && !floorOf(ghost.y)) {
          const name = sub(resourceAt(ghost.x, groundY(ghost.y))).name, fs = Math.max(11, Math.min(15, z * 0.28));
          tag(base, `採れる：${name}`, sx(ghost.x + 0.5), ghost.dir === 1 ? sy(ghost.y) - fs * 1.3 : sy(ghost.y + 1) + fs * 1.3, fs, 'center', bg, fg, edge);
        }
      }
      // ---- 一時停止している設備：灰色にして、縦 2 本の印 ----
      for (const e of marked) {
        // ずらした・消した設備は、次のコマで拾い直す
        if (at(w, e.x, e.y) !== e) { dirty = true; continue; }
        if (!e.off || floorOf(e.y) !== fl) continue;
        const s = sizeOf(e), S = s * z, x0 = sx(e.x), y0 = sy(e.y);
        if (!vis(x0, y0, S)) continue;
        // 立体表示では、2×2 の装置は天面の層、1 マスの設備は地面の層（1 マスの箱の天面には、地面の絵が貼られる）
        const c = s === 2 ? top : base;
        c.fillStyle = 'rgba(118,122,128,0.55)';
        c.fillRect(x0 + z * 0.06, y0 + z * 0.06, S - z * 0.12, S - z * 0.12);
        const cx = x0 + S / 2, cy = y0 + S / 2, bh = Math.max(7, S * 0.34), bw = Math.max(2.5, S * 0.1);
        c.fillStyle = '#ffffff'; c.strokeStyle = '#2a2f36'; c.lineWidth = Math.max(1, z * 0.03);
        for (const sgn of [-1, 1]) { c.fillRect(cx + sgn * bw * 0.85 - bw / 2, cy - bh / 2, bw, bh); c.strokeRect(cx + sgn * bw * 0.85 - bw / 2, cy - bh / 2, bw, bh); }
      }
      // ---- 設備の名前：設備の上に小さな札 ----
      if (z >= 14) for (const e of marked) {
        if (!e.memo || floorOf(e.y) !== fl || at(w, e.x, e.y) !== e) continue;
        const s = sizeOf(e), cx = sx(e.x + s / 2), y0 = sy(e.y);
        if (!vis(cx, y0, 120)) continue;
        tag(top, e.memo, cx, y0 - Math.max(8, z * 0.2), Math.max(10, Math.min(14, z * 0.25)), 'center', bg, fg, edge);
      }
      // ---- 地図の旗 ----
      for (const p of w.pins) {
        if (floorOf(p.y) !== fl) continue;
        const x = sx(p.x + 0.5), y = sy(p.y + 0.5);
        if (!vis(x, y, 160)) continue;
        if (z < 12) { top.beginPath(); top.arc(x, y, 5, 0, Math.PI * 2); top.fillStyle = P.red; top.fill(); top.strokeStyle = '#ffffff'; top.lineWidth = 1.5; top.stroke(); continue; }
        const px = x - z * 0.2, y1 = y + z * 0.4, y2 = y - z * 0.45;
        top.strokeStyle = punk ? '#eef0ea' : P.ink; top.lineWidth = Math.max(1.5, z * 0.05); top.lineCap = 'round';
        top.beginPath(); top.moveTo(px, y1); top.lineTo(px, y2); top.stroke();
        top.beginPath(); top.moveTo(px, y2); top.lineTo(px + z * 0.52, y2 + z * 0.16); top.lineTo(px, y2 + z * 0.32); top.closePath();
        top.fillStyle = P.red; top.fill(); top.lineWidth = Math.max(1, z * 0.03); top.stroke();
        if (p.note) tag(top, p.note, px + z * 0.6, y2 + z * 0.16, Math.max(10, Math.min(14, z * 0.25)), 'left', bg, fg, edge);
      }
    } finally { base.restore(); top.restore(); }
  };

  /** 地図の上の帯の表示：コピー中の帯・拡大縮小のボタン・もう一度のボタン（変わったときだけ描き直す） */
  const cloneBar = h('div', { id: 'clone-bar', hidden: true, role: 'status' }, h('span', { id: 'clone-text' }), h('button', { type: 'button', id: 'clone-cancel', ariaLabel: 'コピーをやめる', onclick: () => { c.cancelClone(); sfx.tap(); } }, '× やめる'));
  c.app.append(cloneBar);
  let shownClone: unknown = null, againKey = '';
  /** 試薬棚・搬出口の中身の名前。試料の組（'set:A'）は物質ではないので、組の名前（「試料 A」）にする */
  const subName = (s: string) => { const set = s.startsWith('set:') ? setById(s.slice(4)) : undefined; return set ? set.name.split('：')[0] : hasSub(s) ? label(s) : ''; };
  const tick = () => {
    const cl = c.slot() ? c.clone() : null;
    if (cl !== shownClone) {
      shownClone = cl;
      cloneBar.hidden = !cl;
      if (cl) { const r = recipeById(cl.recipe), what = r ? r.name : cl.sub ? subName(cl.sub) : ''; $('clone-text').textContent = `${nameOf(cl.kind as Kind)}${what ? `（${what}）` : ''}をコピー中。タップした所に、同じ設定で貼る。`; }
    }
    const zOn = zoomBtns && c.slot() > 0;
    if (zoomEl.hidden === zOn) zoomEl.hidden = !zOn;
    const k = `${c.tool()}|${c.placeDir()}|${last?.kind}|${last?.dir}`;
    if (k !== againKey) { againKey = k; paintRecent(); }
  };

  /** 状態の一行に、名前と一時停止を添える */
  const note = (e: Ent, s: string) => { const head = e.memo ? `「${e.memo}」` : '', body = e.off ? '一時停止中（▶ で動かす）' : s; return head && body ? `${head}　${body}` : head || body; };

  /** 設定の窓の「名前」の欄 */
  const memoRow = (e: Ent) => {
    // 復習の窓の、地図にない仮の装置には出さない
    if (e.kind === 'hub' || at(c.world(), e.x, e.y) !== e) return null;
    const inp = h('input', { type: 'text', class: 'memo-in', id: 'memo-in', value: e.memo ?? '', maxLength: 12, placeholder: '例：NH₃ 1 号', autocomplete: 'off', ariaLabel: 'この設備の名前' }) as HTMLInputElement;
    inp.onchange = () => {
      const v = inp.value.trim().slice(0, 12);
      e.memo = v || undefined;
      dirty = true; c.save();
      c.toast(v ? `名前を「${v}」にした。地図に小さく出る。` : '名前を消した。', 1600);
    };
    return h('label', { class: 'memo-row' }, h('span', {}, '名前'), inp);
  };

  /** つなぎ忘れ：出口の先に何もない設備の一覧。選ぶと、その設備へ移る */
  const showLoose = () => {
    const list = looseOutputs(c.world());
    c.show(h('header', {}, h('h2', {}, 'つなぎ忘れ'), c.closeBtn()),
      h('p', { class: 'muted' }, '出口の先に何もない（または、受け取れない向きのベルトがある）設備。出口がつながっていないと、生成物がたまって装置が止まる。選ぶと、その設備へ移る。'),
      list.length ? h('div', { class: 'menu', id: 'loose-list' }, ...list.slice(0, 80).map((l, i) => {
        const what = l.what.filter(Boolean).map((s) => (s === 'e' ? 'e⁻' : label(s))).join('・');
        return h('button', { class: 'ghost', type: 'button', id: `loose-${i}`, onclick: () => { c.focus(l.e); sfx.tap(); } }, `${titleOf(l.e)}：${what ? `${what} の出口` : '出口'}`);
      })) : h('p', { id: 'loose-none' }, 'つなぎ忘れはない。'));
  };

  /** 設計図の見本：設備を色の点で描いた小さな絵 */
  const bpThumb = (stamps: Stamp[]) => {
    const Wd = 64, Hd = 44, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'bp-thumb', width: Math.round(Wd * dpr), height: Math.round(Hd * dpr) }) as HTMLCanvasElement;
    cv.style.width = `${Wd}px`; cv.style.height = `${Hd}px`;
    const g = cv.getContext('2d');
    if (!g || !stamps.length) return cv;
    g.scale(dpr, dpr);
    const P = palette(), size = (b: Stamp) => (BIG.includes(b.kind) ? 2 : 1);
    let bw = 1, bh = 1;
    for (const b of stamps) { bw = Math.max(bw, b.dx + size(b)); bh = Math.max(bh, b.dy + size(b)); }
    const k = Math.min((Wd - 6) / bw, (Hd - 6) / bh), ox = (Wd - bw * k) / 2, oy = (Hd - bh * k) / 2;
    g.fillStyle = P.paper; g.fillRect(0, 0, Wd, Hd);
    for (const b of stamps) {
      const x = ox + b.dx * k, y = oy + b.dy * k;
      if (MOVERS.has(b.kind)) { const r = Math.max(0.7, k * 0.3); g.fillStyle = P.soft; g.fillRect(x + k / 2 - r, y + k / 2 - r, r * 2, r * 2); }
      else { g.fillStyle = MACHINES[b.kind].color; g.fillRect(x + 0.4, y + 0.4, Math.max(1, size(b) * k - 0.8), Math.max(1, size(b) * k - 0.8)); }
    }
    return cv;
  };
  /** 設計図の並べ替え（上へ・下へ） */
  const bpOrder = <T,>(l: T[], i: number, done: () => void) => [
    h('button', { class: 'ghost tiny-btn', type: 'button', id: `bp-up-${i}`, disabled: i === 0, ariaLabel: '上へ', title: '上へ', onclick: () => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; sfx.tap(); done(); } }, '↑'),
    h('button', { class: 'ghost tiny-btn', type: 'button', id: `bp-dn-${i}`, disabled: i === l.length - 1, ariaLabel: '下へ', title: '下へ', onclick: () => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; sfx.tap(); done(); } }, '↓'),
  ];

  /** 設定の画面に足す行（片手で使う） */
  const prefRows = (refresh: () => void) => {
    const seg = <T,>(id: string, cur: T, opts: [T, string][], set: (v: T) => void) => h('span', { class: 'seg', role: 'group' }, ...opts.map(([v, name], i) => h('button', { type: 'button', id: `${id}-${i}`, class: cur === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); refresh(); } }, name)));
    const row = (what: string, note: string, ctl: HTMLElement) => h('div', { class: 'pref-row' }, h('div', { class: 'what' }, h('b', {}, what), note ? h('small', {}, note) : null), ctl);
    const p = prefs();
    return [
      h('h3', {}, '片手で使う（この端末）'),
      row('拡大・縮小のボタン', '地図の端に ＋ と − を出す。2 本指を使わずに拡大・縮小できる。', seg('p-zoom', p.zoomBtns, [[true, 'あり'], [false, 'なし']], (v) => setPrefs({ zoomBtns: v }))),
      row('道具の棚の位置', '持つ手の側に寄せる。拡大・縮小のボタンも、同じ側に出る。', seg<Prefs['hand']>('p-hand', p.hand, [['left', '左'], ['center', '中央'], ['right', '右']], (v) => setPrefs({ hand: v }))),
    ];
  };

  return {
    // ロック
    locked: () => lock,
    lockNote,
    get LOCKED() { return `ロック中は置けない（見るだけ）。${unlockHow()}。`; },
    /** ノートや課題の工場を開いたとき：ロックは外れている */
    unlock: () => { if (lock) setLock(false, true); },
    /** その道具を選べるか（ロック中は「見る」だけ） */
    canPick: (id: string) => { if (lock && id !== 'pan') { lockNote(); return false; } return true; },
    /** 道具を選んだあと：最近の道具を更新し、ほかの道具の途中の状態を片づける */
    picked: (id: string) => {
      if (id !== 'pan') { mine.recent = [id, ...mine.recent.filter((x) => x !== id)].slice(0, 6); write(); }
      if (id !== 'route') { routeA = null; preview = null; }
      if (id !== 'area') filter = 'all';
      againKey = ''; paintRecent();
    },
    /** 道具のボタンを作ったとき：長押しで ★ */
    toolButton: (b: HTMLButtonElement, id: string) => {
      let timer = 0, x0 = 0, y0 = 0;
      b.addEventListener('pointerdown', (ev) => { swallow = false; x0 = ev.clientX; y0 = ev.clientY; clearTimeout(timer); timer = window.setTimeout(() => { swallow = true; toggleFav(id); buzz(20); }, 550); });
      b.addEventListener('pointermove', (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) clearTimeout(timer); });
      for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, () => clearTimeout(timer));
      b.addEventListener('contextmenu', (ev) => ev.preventDefault());
    },
    /** 棚を描き直したあと：★ の棚 */
    paintTabs: (tab: string) => {
      curTab = tab;
      let fav = document.getElementById('tab-fav');
      if (!fav) { fav = h('button', { type: 'button', id: 'tab-fav', title: '★ をつけた道具（道具を長押しでつける）', onclick: () => { c.setTab('fav'); sfx.tap(); } }, '★'); $('tabs').append(fav); }
      fav.hidden = !mine.fav.length;
      fav.classList.toggle('on', tab === 'fav');
      if (tab === 'fav') for (const id of mine.fav) toolBtn(id)?.classList.remove('off');
      paintFavs();
    },
    /** ★ の棚を開いているとき、★ の道具を選んでも棚を替えない */
    keepTab: (tab: string, id: string) => tab === 'fav' && mine.fav.includes(id),
    /** 選んだものの帯を描いたあと */
    paintAct: (e: Ent) => {
      const show = (b: HTMLElement, v: boolean) => { if (b.hidden === v) b.hidden = !v; };
      show(dupBtn, e.kind !== 'hub' && !lock && !e.sealed);
      show(pauseBtn, pausable(e) && !lock);
      const pt = e.off ? '▶' : '‖';
      if (pauseBtn.textContent !== pt) { pauseBtn.textContent = pt; pauseBtn.setAttribute('aria-label', e.off ? '動かす' : '一時停止'); pauseBtn.classList.toggle('hot', !!e.off); }
      show(revBtn, e.kind === 'belt' && !lock);
      if (lock) for (const id of ['act-turn', 'act-move', 'act-erase', 'act-copy']) { const b = document.getElementById(id); if (b && !b.hidden) b.hidden = true; }
    },
    note,
    /** 範囲の絞り込み */
    keep: (e: Ent) => filter === 'all' || (filter === 'belt') === MOVERS.has(e.kind),
    paintArea: (bp: boolean, n: number) => {
      rot2.hidden = bp || !n;
      flipX.hidden = flipY.hidden = !bp && !n;
      filt.hidden = bp;
      if (filt.textContent !== FILTER_NAME[filter]) filt.textContent = FILTER_NAME[filter];
      filt.classList.toggle('on', filter !== 'all');
    },
    rotArea: () => xArea('rot'),
    routeTap,
    /** Esc：自動ベルトの始まりを外す。外したら true */
    esc: () => { if (routeA) { routeA = null; preview = null; c.toast('道の始まりを外した。', 1000); return true; } return false; },
    /** 置けない理由を知らせる（理由があれば true） */
    whyNot: (kind: string, x: number, y: number) => { const why = whyNot(c.world(), kind as Kind, x, y); if (why) { c.toast(why, 2600); sfx.bad(); } return !!why; },
    strokeStart: () => { trail = []; trailEnd = 0; skipTold = false; },
    strokeAt: (x: number, y: number) => { const l = trail[trail.length - 1]; if (!l || l[0] !== x || l[1] !== y) trail.push([x, y]); if (trail.length > 600) trail.shift(); },
    strokeEnd: () => { if (trail.length) trailEnd = performance.now(); },
    /** 中に物をためた装置か（消す前に確かめる） */
    stocked: (e: Ent | undefined | null) => !!e && !MOVERS.has(e.kind) && stockOf(e) >= STOCK_ASK,
    /** なぞって消すとき、中に物をためた装置は飛ばす。飛ばしたら true */
    skipStocked: (e: Ent | undefined) => {
      if (!e || MOVERS.has(e.kind) || stockOf(e) < STOCK_ASK) return false;
      if (!skipTold) { skipTold = true; c.toast('中に物をためた装置は、なぞっても消さない。タップすると、確かめてから消す。', 3000); }
      return true;
    },
    /** 消す前に、中にたまっていれば確かめる */
    askErase: (e: Ent, go: () => void) => {
      if (lock) { lockNote(); return; }
      const n = stockOf(e);
      if (MOVERS.has(e.kind) || n < STOCK_ASK) { go(); return; }
      ask(`中に ${n} 個たまっている。消す？`, `${titleOf(e)}を消すと、中の物も消える（元に戻すで戻せる）。`, '消す', go);
    },
    /** まとめて消す前に、数が多いか、物をためた装置があれば確かめる */
    bulkErase: (es: Ent[], go: () => void) => {
      if (lock) { lockNote(); return; }
      const st = es.filter((e) => !MOVERS.has(e.kind) && stockOf(e) >= STOCK_ASK).length;
      if (es.length < BULK_ASK && !st) { go(); return; }
      ask(`${es.length} 個をまとめて消す？`, st ? `中に物をためた装置 ${st} 台を含む。元に戻すで、まとめて戻せる。` : '元に戻すで、まとめて戻せる。', 'まとめて消す', go);
    },
    ask,
    dup,
    again,
    /** 置いたものを覚える（同じものをもう一度） */
    lastPlaced: (kind: string, dir: Dir) => { if (kind !== 'belt') { last = { kind: kind as Kind, dir }; againKey = ''; } },
    bpThumb,
    bpOrder,
    prefRows,
    /** メニューの「工場」に足す項目 */
    menuItems: (item: (id: string, text: string, go: () => void) => HTMLElement) => [
      item('m-loose', `つなぎ忘れ（出口の先に何もない設備）　${looseOutputs(c.world()).length} 台`, showLoose),
      item('m-pins', `地図の旗（${c.world().pins.length} / ${PIN_MAX} 本）`, showPins),
    ],
    showLoose,
    showPins,
    memoRow,
    draw,
    tick,
  };
}
