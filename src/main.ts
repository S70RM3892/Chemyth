import { CHAPTERS, TOTAL_GOALS } from './content/goals';
import { HUB_CENTER, LAND, ZONES, hubRect, resourceAt, zoneAt } from './content/map';
import { MACHINES } from './content/machines';
import { label, sub } from './content/substances';
import { BIG, at, autoDir, configure, currentGoal, deserialize, doneCount, fitAnchor, goalCount, requiredOf, isMachine, newWorld, place, remove, restore, serialize, sizeOf, step, toolUnlocked, type Dir, type Ent, type Kind, type World } from './engine/world';
import { recipeById } from './content/recipes';
import { about, diagram, openConfig } from './ui/config';
import { $, h } from './ui/dom';
import { attachInput, Z_MIN } from './ui/input';
import { reviewCount, showAnalyzer, showBook, showChapters, showDepot, showLog, showPassages, showReview, showSampler, showSyllabus, showUpgrades, type PanelCtx } from './ui/panels';
import { showDrills, showStructure } from './ui/practice';
import { draw, type Camera } from './ui/render';
import { setSound, sfx, soundOn } from './ui/sound';
import { initTitle, skinButtons, slotName, store, themeButtons } from './ui/title';
import { applySkin, applyTheme } from './ui/theme';
import { showRanking, submitScore } from './ui/ranking';
import { drawToken } from './ui/token';

type Placeable = Exclude<Kind, 'hub' | 'part'>;
type Tool = 'pan' | 'erase' | Placeable;
type Op = { t: 'add'; x: number; y: number } | { t: 'del'; ent: Ent } | { t: 'dir'; x: number; y: number; dir: Dir };
const SESSION_LIMIT_MS = 25 * 60 * 1000;
const BUILD: Placeable[] = ['belt', 'extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'sampler', 'analyzer', 'collector', 'splitter', 'bridge', 'depot', 'vent'];
const SPEEDS = [1, 2, 4, 0];
/** 複製：同じ設定の装置を続けて置く */
interface Clone { kind: Placeable; recipe?: string; outOrder?: string[]; outSlot?: number[]; big?: boolean; test?: string; sub?: string }

const TOOLS: { id: Tool; glyph: string; name: string; tip: string; color?: string; need: { done?: number; chapter?: number } }[] = [
  { id: 'pan', glyph: '☝', name: '見る', need: {}, tip: 'タップで選ぶ。装置やベルトから指を引くとベルトが伸びる。何もない所を引くと地図が動く。' },
  ...BUILD.map((id) => ({ id, glyph: MACHINES[id].glyph, name: MACHINES[id].name, tip: MACHINES[id].tip, color: MACHINES[id].color, need: MACHINES[id] })),
  { id: 'erase', glyph: '✕', name: '消す', need: {}, color: '#b0453f', tip: 'タップするか、なぞると消える。間違えたら右上の「元に戻す」。' },
];

interface HotData { slot?: number; save?: string }
interface Hot { data?: HotData; snapshot?(f: () => unknown): void; ready?(f: (d: HotData) => void): void }
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function boot(data: HotData) {
  let world: World = newWorld();
  let slot = 0; // 0 はタイトル画面
  let tool: Tool = 'pan';
  let beltDir: Dir = 0;
  let selected: Ent | null = null;
  let camTo: Camera | null = null;
  let shownGoal = '';
  let speed = 1;
  let clone: Clone | null = null;
  /** なぞり書きで、いま乗っている「横切るかもしれない」ベルト */
  let cross: [number, number] | null = null;
  let lastWrong = 0;
  const app = $('app');
  const cv = $<HTMLCanvasElement>('cv');
  const ctx = cv.getContext('2d')!;
  const [hubCX, hubCY] = HUB_CENTER;
  const cam: Camera = { x: hubCX, y: hubCY, z: 48 };
  let cw = 0, ch = 0;

  setSound(store.meta().sound !== false);
  applyTheme(store.meta().theme ?? 'auto');
  applySkin(store.meta().skin ?? 'note');
  const save = () => { if (slot) store.write(slot, serialize(world)); };
  hot?.snapshot?.(() => (slot ? { slot, save: serialize(world) } : {}));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  new ResizeObserver(resize).observe(cv);
  resize();
  const nearZoom = () => Math.max(40, Math.min(54, cw / 24));
  /** 建てたもの全体が収まる視野 */
  const fitView = (): Camera => {
    const hr = hubRect(world.hubSize);
    let x0 = hr.x, y0 = hr.y, x1 = hr.x + hr.s, y1 = hr.y + hr.s;
    for (const e of world.ents.values()) { x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + 1); y1 = Math.max(y1, e.y + 1); }
    const w0 = Math.max(60, x1 - x0 + 16), h0 = Math.max(40, y1 - y0 + 16);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 2, z: Math.max(Z_MIN, Math.min(nearZoom(), cw / w0, (ch - 150) / h0)) };
  };

  // ---- トースト ----
  const toastEl = $('toast');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2600) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, ms);
  };

  // ---- 赤いはんこ：正解や達成のとき ----
  const stampEl = $('stamp');
  const stamp = (text: string) => {
    stampEl.textContent = text;
    stampEl.hidden = true;
    void stampEl.offsetWidth;
    stampEl.hidden = false;
    window.setTimeout(() => { stampEl.hidden = true; }, 1000);
  };

  // ---- 置く・消す・回す（元に戻せる） ----
  const undo: Op[][] = [];
  let group: Op[] | null = null;
  const undoBtn = $<HTMLButtonElement>('b-undo');
  const record = (op: Op) => {
    if (!group) { group = []; undo.push(group); if (undo.length > 60) undo.shift(); }
    group.push(op);
    undoBtn.disabled = false;
  };
  const doPlace = (kind: Placeable, x: number, y: number, dir: Dir): string | null => {
    const err = place(world, kind, x, y, dir);
    if (!err) record({ t: 'add', x, y });
    return err;
  };
  const doErase = (x: number, y: number): boolean => {
    const e = at(world, x, y);
    if (!e || e.kind === 'hub') return false;
    if (selected === e) selected = null;
    record({ t: 'del', ent: e });
    return remove(world, x, y);
  };
  const doTurn = (e: Ent, dir: Dir) => {
    if (e.dir === dir) return;
    record({ t: 'dir', x: e.x, y: e.y, dir: e.dir });
    e.dir = dir;
  };
  const doUndo = () => {
    const g = undo.pop();
    group = null;
    undoBtn.disabled = undo.length === 0;
    if (!g) return;
    selected = null;
    for (const op of g.reverse()) {
      if (op.t === 'add') remove(world, op.x, op.y);
      else if (op.t === 'del') restore(world, op.ent);
      else { const e = at(world, op.x, op.y); if (e) e.dir = op.dir; }
    }
    toast('ひとつ前に戻した', 1400);
  };

  // ---- モーダル ----
  const modal = $('modal'), sheet = $('sheet');
  const closeModal = () => { modal.hidden = true; sheet.replaceChildren(); selected = null; save(); };
  const showSheet = (...nodes: (Node | string | null)[]) => { sheet.replaceChildren(...nodes.filter((n): n is Node | string => n !== null)); sheet.scrollTop = 0; modal.hidden = false; };
  modal.addEventListener('pointerdown', (ev) => { if (ev.target === modal) closeModal(); });
  const closeBtn = () => h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: closeModal }, '閉じる');
  const sheetActions = {
    close: closeModal,
    toast,
    stamp,
    rotate: (e: Ent) => { group = null; doTurn(e, ((e.dir + 1) % 4) as Dir); },
    erase: (e: Ent) => { group = null; doErase(e.x, e.y); sfx.erase(); },
  };
  const panel = (): PanelCtx => ({ w: world, show: showSheet, close: closeModal, toast, sheet, actions: sheetActions });

  const sideOf = (e: Ent) => {
    const side = h('div', { class: 'side' });
    const paint = () => side.replaceChildren(
      diagram(e),
      h('button', { class: 'ghost', type: 'button', id: 'info-rotate', onclick: () => { sheetActions.rotate(e); paint(); } }, '↻ 向きを変える'),
      h('button', { class: 'ghost warn', type: 'button', id: 'info-erase', onclick: () => { sheetActions.erase(e); closeModal(); } }, '✕ これを消す'),
    );
    paint();
    return side;
  };

  /** 置いたものの説明。設定のある装置は設定シートへ */
  const inspect = (e: Ent) => {
    if (isMachine(e.kind)) { modal.hidden = false; sheet.scrollTop = 0; openConfig(sheet, world, e, sheetActions); return; }
    if (e.kind === 'hub') {
      const g = currentGoal(world);
      showSheet(h('header', {}, h('h2', {}, '納品所'), closeBtn()),
        h('p', {}, '指定された物質をここへ運ぶ。どの側からでも受け取る。指定と違う物質も受け取って在庫にする。在庫は「搬出口」で取り出せる。'),
        h('p', { class: 'muted' }, g ? `いまの指令：${sub(g.s).name} を ${requiredOf(world, g)} 個（${goalCount(world)} 個 納品済み）` : 'この章の指令は終えた。'),
        h('p', { class: 'muted' }, `いまの大きさは ${world.hubSize}×${world.hubSize} マス。指令を達成していくと大きくなり、受け取れる口が増える。そのぶん 1 つの指令で求められる数も増える。`),
        h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', onclick: () => showChapters(panel()) }, '指令の一覧を開く')));
      return;
    }
    const kind = e.kind as Placeable;
    const extra = () => h('div', { class: 'split' }, about(kind), sideOf(e));
    if (kind === 'depot') { showDepot(panel(), e, extra()); return; }
    if (kind === 'sampler') { showSampler(panel(), e, extra()); return; }
    if (kind === 'analyzer') { showAnalyzer(panel(), e, extra()); return; }
    showSheet(h('header', {}, h('h2', {}, MACHINES[kind].name), closeBtn()),
      kind === 'extractor' ? h('p', { class: 'eq' }, `ここで採れるもの：${sub(resourceAt(e.x, e.y)).name}`) : null,
      h('div', { class: 'split' }, about(kind), sideOf(e)));
  };

  const showZone = (x: number, y: number) => {
    const zn = zoneAt(x, y);
    const z = zn ? ZONES[zn] : LAND;
    showSheet(h('header', {}, h('h2', {}, z.name), closeBtn()),
      h('p', { class: 'eq' }, `${sub(z.resource).name}　`, h('span', { class: 'pill' }, z.form)),
      h('dl', { class: 'about' }, h('dt', {}, '採れるもの'), h('dd', {}, z.about), h('dt', {}, '入試では'), h('dd', {}, z.exam)),
      h('p', { class: 'muted' }, '採取機を置くと、この産出物が出てくる。'));
  };

  const showHelp = (first = false) => showSheet(
    h('header', {}, h('h2', {}, first ? 'はじめに' : '遊び方'), first ? null : closeBtn()),
    h('p', {}, '資源地から原料を採り、装置で分離・反応させ、中央の納品所へ運ぶ。装置は、反応を自分で正しく書けたときだけ動く。'),
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, '採る'), '下の道具から「採取機」を選んでタップ。陸地では空気、資源地ではその産出物が、天然のままの姿で出てくる。'),
      h('li', {}, h('b', {}, 'つなぐ'), '装置から指を引くとベルトが伸びる。なぞった向きに流れ、角は自然に曲がる。'),
      h('li', {}, h('b', {}, '設定する'), '装置を置くと設定が開く。原料、生成物の化学式、係数、条件を自分で決める。蒸留塔・反応器・電解槽・電池は 2×2 マスで、出口が 6 か所ある。どの出口から何が出るかは、出口の絵柄でわかる。'),
      h('li', {}, h('b', {}, '納める'), 'ベルトを納品所までつなぐ。要らない副生成物は「廃棄口」へ。出口が詰まると装置は止まる。'),
      h('li', {}, h('b', {}, '強化する'), '研究点がたまったら「強化」。計算問題を解くと、採取・運搬・処理が速くなる。'),
    ),
    h('p', { class: 'muted' }, '物質の絵柄は、元素ごとに決まった形の組み合わせでできている（「図鑑」で確認できる）。置いたものをタップすると、その場に「設定・回す・消す」が出る。間違えたら右上の「元に戻す」。'),
    first ? h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'start', onclick: closeModal }, '始める')) : null,
  );

  const showMenu = () => showSheet(
    h('header', {}, h('h2', {}, 'メニュー'), closeBtn()),
    h('div', { class: 'menu' },
      h('button', { class: 'ghost', type: 'button', id: 'm-chapters', onclick: () => showChapters(panel()) }, '指令の一覧（章を切り替える）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-passages', onclick: () => showPassages(panel()) }, 'リード文課題（京大形式の空欄補充）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-drills', onclick: () => showDrills(panel()) }, '連鎖計算（京大形式の理論の大問。数値は毎回変わる）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-structure', onclick: () => showStructure(panel()) }, '配列決定（ペプチドのアミノ酸配列を実験事実から決める）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-syllabus', onclick: () => showSyllabus(panel()) }, '範囲表（入試範囲のどこまで進んだか）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-log', onclick: () => showLog(panel()) }, '記録（間違えたところ）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-help', onclick: () => showHelp() }, '遊び方'),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, '見た目'), h('span', { class: 'seg' }, ...skinButtons(showMenu)), h('span', { class: 'seg' }, ...themeButtons(showMenu))),
      h('button', { class: 'ghost', type: 'button', id: 'm-rank', onclick: () => showRanking(panel()) }, 'ランキング'),
      h('button', { class: 'ghost', type: 'button', id: 'm-sound', onclick: () => { setSound(!soundOn()); store.setMeta({ sound: soundOn() }); sfx.tap(); showMenu(); } }, soundOn() ? '音：あり' : '音：なし'),
      h('button', { class: 'ghost', type: 'button', id: 'm-title', onclick: () => { modal.hidden = true; sheet.replaceChildren(); toTitle(); } }, '保存してタイトルへ戻る'),
    ),
    h('p', { class: 'muted' }, `${slotName(slot)}。この端末に自動で保存している。`),
  );

  $('b-menu').onclick = showMenu;
  $('b-up').onclick = () => showUpgrades(panel());
  $('b-book').onclick = () => showBook(panel());
  $('b-review').onclick = () => showReview(panel());
  $('goal').onclick = () => showChapters(panel());
  const speedBtn = $('b-speed');
  const paintSpeed = () => { speedBtn.textContent = speed === 0 ? '⏸ 停止中' : `▶ ×${speed}`; speedBtn.classList.toggle('hot', speed !== 1); };
  speedBtn.onclick = () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; paintSpeed(); sfx.tap(); };
  undoBtn.onclick = doUndo;
  undoBtn.disabled = true;

  // ---- 道具バー ----
  const bar = $('tools'), tip = $('tip');
  const buttons = new Map<Tool, HTMLButtonElement>();
  const pick = (id: Tool, keepClone = false) => {
    tool = id;
    if (!keepClone) clone = null;
    const t = TOOLS.find((x) => x.id === id)!;
    for (const [k, el] of buttons) { el.classList.toggle('on', k === tool); el.setAttribute('aria-pressed', String(k === tool)); }
    tip.replaceChildren(h('b', {}, clone ? `${t.name}をコピー中` : t.name), clone ? 'タップした場所に、同じ設定のものを貼りつける。ほかの道具を選ぶとやめる。' : t.tip);
  };
  for (const t of TOOLS) {
    const b = h('button', { type: 'button', id: `tool-${t.id}`, class: 'tool' }, h('span', { class: 'g' }, t.glyph), h('span', { class: 'l' }, t.name));
    b.onclick = () => { pick(t.id); sfx.tap(); };
    if (t.color) b.style.setProperty('--tint', t.color);
    buttons.set(t.id, b);
    bar.append(b);
  }
  /** 指令が進むと使える道具が増える */
  const refreshTools = (announce: boolean) => {
    for (const t of TOOLS) {
      const b = buttons.get(t.id)!, locked = !toolUnlocked(world, t.need);
      if (announce && b.hidden && !locked) toast(`新しい道具「${t.name}」が使えるようになった`, 4000);
      b.hidden = locked;
    }
    if (buttons.get(tool)!.hidden) pick('pan');
  };

  // ---- 選んだものの上に出る操作 ----
  const act = $('act');
  const actOpen = $<HTMLButtonElement>('act-open'), actTurn = $<HTMLButtonElement>('act-turn'), actErase = $<HTMLButtonElement>('act-erase'), actCopy = $<HTMLButtonElement>('act-copy');
  const copyable = (e: Ent) => !!(e.recipe || e.test || ((e.kind === 'sampler' || e.kind === 'depot') && e.sub));
  actCopy.onclick = () => {
    if (!selected || !copyable(selected)) return;
    const e = selected;
    clone = { kind: e.kind as Placeable, recipe: e.recipe, outOrder: e.outOrder ? [...e.outOrder] : undefined, outSlot: e.outSlot ? [...e.outSlot] : undefined, big: e.big, test: e.test, sub: e.sub };
    selected = null;
    pick(clone.kind, true);
    sfx.ok();
  };
  actOpen.onclick = () => { if (selected) inspect(selected); };
  actTurn.onclick = () => { if (selected) sheetActions.rotate(selected); };
  actErase.onclick = () => { if (selected) sheetActions.erase(selected); };
  const placeAct = () => {
    if (!selected || !modal.hidden || !slot) { act.hidden = true; return; }
    const hub = selected.kind === 'hub';
    actOpen.textContent = isMachine(selected.kind) ? '設定' : selected.kind === 'depot' || selected.kind === 'sampler' ? '選ぶ' : selected.kind === 'analyzer' ? '検査' : '説明';
    actTurn.hidden = actErase.hidden = hub;
    actCopy.hidden = !copyable(selected);
    act.hidden = false;
    const hr = hubRect(world.hubSize);
    const ax = ((hub ? hr.x + hr.s / 2 : selected.x + sizeOf(selected) / 2) - cam.x) * cam.z + cw / 2;
    const ay = ((hub ? hr.y : selected.y) - cam.y) * cam.z + ch / 2 - 14;
    act.style.transform = `translate(${Math.round(Math.min(cw - 110, Math.max(110, ax)))}px, ${Math.round(Math.max(64, ay))}px) translate(-50%, -100%)`;
  };

  $('b-fit').onclick = () => {
    const fit = fitView();
    const wide = cam.z > fit.z * 1.15;
    camTo = wide ? fit : { x: hubCX, y: hubCY, z: nearZoom() };
    $('b-fit').textContent = wide ? '近く' : '全体';
  };

  // ---- 地図の操作 ----
  const pullsBelt = (x: number, y: number) => { const e = at(world, x, y); return !!e && e.kind !== 'hub' && e.kind !== 'vent'; };
  const input = attachInput(cv, cam, {
    begin: () => { group = null; camTo = null; cross = null; },
    mode: (x, y) => (tool === 'belt' || tool === 'erase' || (tool === 'pan' && pullsBelt(x, y)) ? 'stroke' : 'pan'),
    tap(x, y) {
      const e = at(world, x, y);
      if (tool === 'erase') { if (e?.kind === 'hub') toast('納品所は消せない'); else if (doErase(x, y)) sfx.erase(); else toast('ここには何もない', 1200); return; }
      if (e) {
        if (selected === e) inspect(e);
        else { selected = e; sfx.tap(); }
        return;
      }
      if (tool === 'pan') { if (selected) selected = null; else showZone(x, y); return; }
      // 2×2 の装置は、タップしたマスを含む空き場所に置く
      const [px, py] = (BIG.includes(tool) ? fitAnchor(world, x, y) : null) ?? [x, y];
      const err = doPlace(tool, px, py, tool === 'belt' ? beltDir : autoDir(world, tool, px, py));
      if (err) { toast(err); sfx.bad(); return; }
      sfx.place();
      const placed = at(world, px, py)!;
      if (clone && clone.kind === tool) {
        // 複製：設定を写す
        const r = recipeById(clone.recipe);
        if (r && clone.outOrder) {
          configure(placed, r, clone.outOrder.filter((s) => s !== 'e'));
          if (r.machine === 'electrolyzer') placed.outOrder = [...clone.outOrder];
          if (clone.big === placed.big && clone.outSlot) placed.outSlot = [...clone.outSlot];
        }
        placed.test = clone.test;
        placed.sub = clone.sub;
        return;
      }
      if (isMachine(tool) || tool === 'depot' || tool === 'sampler' || tool === 'analyzer') inspect(placed);
    },
    stroke(x, y, prev) {
      selected = null;
      if (tool === 'erase') { doErase(x, y); return; }
      if (prev) {
        const nd = (x > prev[0] ? 0 : x < prev[0] ? 2 : y > prev[1] ? 1 : 3) as Dir;
        const p = at(world, prev[0], prev[1]);
        if (p?.kind === 'belt') {
          // 別のベルトをまっすぐ横切ったら、そこを立体交差にする
          if (cross && cross[0] === prev[0] && cross[1] === prev[1] && nd === beltDir) { doErase(prev[0], prev[1]); doPlace('bridge', prev[0], prev[1], 0); }
          else doTurn(p, nd);
        }
        beltDir = nd;
      }
      cross = null;
      const e = at(world, x, y);
      if (!e) { if (prev || tool === 'belt') doPlace('belt', x, y, beltDir); }
      else if (e.kind === 'belt' && prev) {
        if (e.dir % 2 !== beltDir % 2) cross = [x, y]; // 直角に乗った。次の一歩で、横切るか合流かが決まる
        else doTurn(e, beltDir);
      }
    },
  });

  // ---- 指令の表示 ----
  const goalIco = $<HTMLCanvasElement>('goal-ico');
  const hud = () => {
    const g = currentGoal(world), ch2 = CHAPTERS[world.chapter];
    $('pts').textContent = String(world.points);
    const due = reviewCount(world);
    $('due').textContent = due ? String(due) : '';
    const sig = `${world.chapter}:${world.progress[world.chapter]}:${world.hubSize}`;
    if (shownGoal !== sig) {
      shownGoal = sig;
      const c2 = goalIco.getContext('2d')!;
      c2.clearRect(0, 0, 88, 88);
      if (g) drawToken(c2, g.s, 44, 46, 36);
      goalIco.hidden = !g;
      $('goal-step').textContent = `${ch2.name}　${Math.min(world.progress[world.chapter] + 1, ch2.goals.length)} / ${ch2.goals.length}`;
      const s2 = g ? sub(g.s) : null;
      $('goal-name').textContent = g && s2 ? `${s2.name}${s2.formula && !s2.mask ? ' ' + label(g.s) : g.s === 'e' ? ' e⁻' : ''} を ${requiredOf(world, g)} 個` : doneCount(world) >= TOTAL_GOALS ? 'すべての指令を終えた' : 'この章は完了。ここを押して別の章へ';
      $('goal-hint').textContent = g ? g.hint : '記録を開いて、間違えた反応を紙に書き出して確認しろ。';
    }
    $('goal-count').textContent = g ? `${goalCount(world)} / ${requiredOf(world, g)}` : '';
    $('goal-bar').style.width = g ? `${Math.min(100, (goalCount(world) / requiredOf(world, g)) * 100)}%` : '100%';
  };

  // ---- タイトルと開始 ----
  const title = initTitle({
    start(n, json) {
      world = (json && deserialize(json)) || newWorld();
      slot = n;
      undo.length = 0; group = null; selected = null; undoBtn.disabled = true; shownGoal = ''; speed = 1; paintSpeed(); clone = null;
      cam.x = hubCX; cam.y = hubCY; cam.z = nearZoom(); camTo = null;
      $('b-fit').textContent = '全体';
      title.hide();
      app.classList.remove('in-title');
      for (const b of buttons.values()) b.hidden = false;
      refreshTools(false);
      lastSeen = world.seen;
      pick('pan');
      began = performance.now(); warned = false;
      save();
      if (!json) showHelp(true);
    },
  });
  const toTitle = () => { save(); slot = 0; selected = null; app.classList.add('in-title'); title.show(); };

  // ---- ループ ----
  let began = performance.now(), warned = false, prev = performance.now(), acc = 0, sinceSave = 0, lastSeen = -1;
  const STEP = 1 / 60;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (slot) {
      if (modal.hidden) {
        acc += dt * speed;
        let guard = 0;
        while (acc >= STEP && guard++ < 24) { step(world, STEP); acc -= STEP; }
        if (acc > STEP * 4) acc = 0;
      }
      for (const ev of world.events.splice(0)) {
        if (ev === 'goal-done') { stamp('納品済'); toast('納品完了。研究点 +30。次の指令が出た。', 3500); sfx.goal(); refreshTools(true); }
        if (ev === 'hub-grow') { toast(`納品所が ${world.hubSize}×${world.hubSize} に広がった。重なった設備は撤去され、求められる数も増える。`, 6000); selected = null; }
        if (ev === 'goal-done' || ev === 'chapter-done' || ev === 'all-done') void submitScore(world);
        if (ev === 'chapter-done') { stamp('修了'); toast(`章を終えた。${CHAPTERS[world.chapter].name} へ進む。`, 5000); sfx.goal(); refreshTools(true); }
        if (ev === 'wrong-sample' && now - lastWrong > 2500) { lastWrong = now; toast('違う物質が納品所に入った。2 個減点。検査を見直せ。', 3200); sfx.bad(); }
        if (ev === 'all-done') { toast('すべての指令を終えた。', 6000); sfx.goal(); }
        save();
      }
      sinceSave += dt;
      if (sinceSave > 5) { sinceSave = 0; save(); }
      if (!warned && now - began > SESSION_LIMIT_MS) { warned = true; toast('25分たった。ここで切り上げて休め。', 8000); }
      if (camTo) {
        const k = 1 - Math.exp(-dt * 7);
        cam.x += (camTo.x - cam.x) * k; cam.y += (camTo.y - cam.y) * k; cam.z += (camTo.z - cam.z) * k;
        if (Math.abs(camTo.z - cam.z) < 0.05 && Math.hypot(camTo.x - cam.x, camTo.y - cam.y) < 0.01) camTo = null;
      } else input.tick(dt);
      if (selected && at(world, selected.x, selected.y) !== selected) selected = null;
      if (lastSeen !== world.seen) { lastSeen = world.seen; refreshTools(true); }
      draw(ctx, cw, ch, world, cam, now / 1000, dt, { tool, selected });
      hud();
    }
    placeAct();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // 開いたまま更新されたときは、遊んでいた枠にそのまま戻る
  if (data.slot && data.save && deserialize(data.save)) {
    store.write(data.slot, data.save);
    const s = data.slot;
    title.show();
    ($(`slot-${s}-go`) as HTMLButtonElement | null)?.click();
  } else title.show();
}

if (hot?.ready) hot.ready(boot); else boot(hot?.data ?? {});
