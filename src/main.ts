import { GOALS, chapterOf } from './content/goals';
import { HUB_TILES, LAND, MAP_H, MAP_W, ZONES, resourceAt, zoneAt } from './content/map';
import { MACHINES } from './content/machines';
import { label, sub } from './content/substances';
import { at, autoDir, deserialize, isMachine, key, newWorld, place, remove, serialize, step, type Dir, type Ent, type Kind, type World } from './engine/world';
import { about, diagram, openConfig } from './ui/config';
import { $, h } from './ui/dom';
import { attachInput, Z_MIN } from './ui/input';
import { showBook, showDepot, showLog, showUpgrades, type PanelCtx } from './ui/panels';
import { draw, type Camera } from './ui/render';
import { setSound, sfx, soundOn } from './ui/sound';
import { initTitle, store } from './ui/title';
import { drawToken } from './ui/token';

type Placeable = Exclude<Kind, 'hub'>;
type Tool = 'pan' | 'erase' | Placeable;
type Op = { t: 'add'; x: number; y: number } | { t: 'del'; ent: Ent } | { t: 'dir'; x: number; y: number; dir: Dir };
const SESSION_LIMIT_MS = 25 * 60 * 1000;
const BUILD: Placeable[] = ['belt', 'extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'splitter', 'bridge', 'depot', 'vent'];

const TOOLS: { id: Tool; glyph: string; name: string; tip: string; color?: string; unlock: number }[] = [
  { id: 'pan', glyph: '☝', name: '見る', unlock: 0, tip: 'タップで選ぶ。装置やベルトから指を引くとベルトが伸びる。何もない所を引くと地図が動く。' },
  ...BUILD.map((id) => ({ id, glyph: MACHINES[id].glyph, name: MACHINES[id].name, tip: MACHINES[id].tip, color: MACHINES[id].color, unlock: MACHINES[id].unlock })),
  { id: 'erase', glyph: '✕', name: '消す', unlock: 0, color: '#b0453f', tip: 'タップするか、なぞると消える。間違えたら右上の「元に戻す」。' },
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
  let shownGoal = -2;
  const app = $('app');
  const cv = $<HTMLCanvasElement>('cv');
  const ctx = cv.getContext('2d')!;
  const [hubX, hubY] = HUB_TILES[0];
  const cam: Camera = { x: hubX + 1, y: hubY + 1, z: 48 };
  let cw = 0, ch = 0;

  setSound(store.meta().sound !== false);
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
  const fitZoom = () => Math.max(Z_MIN, Math.min(cw / (MAP_W + 1), (ch - 150) / (MAP_H + 1)));

  // ---- トースト ----
  const toastEl = $('toast');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2600) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, ms);
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
      else if (op.t === 'del') { if (!at(world, op.ent.x, op.ent.y)) world.ents.set(key(op.ent.x, op.ent.y), op.ent); }
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
    rotate: (e: Ent) => { group = null; doTurn(e, ((e.dir + 1) % 4) as Dir); },
    erase: (e: Ent) => { group = null; doErase(e.x, e.y); sfx.erase(); },
  };
  const panel = (): PanelCtx => ({ w: world, show: showSheet, close: closeModal, toast });

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
      const g = GOALS[world.goal];
      showSheet(h('header', {}, h('h2', {}, '納品所'), closeBtn()),
        h('p', {}, '指定された物質をここへ運ぶ。どの側からでも受け取る。指定と違う物質も受け取って在庫にする。在庫は「搬出口」で取り出せる。'),
        h('p', { class: 'muted' }, g ? `いまの指令：${sub(g.s).name} ${label(g.s)} を ${g.n} 個（${world.count} 個 納品済み）` : 'すべての指令を終えた。'));
      return;
    }
    const kind = e.kind as Placeable;
    if (kind === 'depot') { showDepot(panel(), e, h('div', { class: 'split' }, about(kind), sideOf(e))); return; }
    showSheet(h('header', {}, h('h2', {}, MACHINES[kind].name), closeBtn()),
      kind === 'extractor' ? h('p', { class: 'eq' }, `ここで採れるもの：${sub(resourceAt(e.x, e.y)).name}`) : null,
      h('div', { class: 'split' }, about(kind), sideOf(e)));
  };

  const showZone = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
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
      h('li', {}, h('b', {}, '設定する'), '装置を置くと設定が開く。原料、生成物の化学式、係数、条件を自分で決める。'),
      h('li', {}, h('b', {}, '納める'), 'ベルトを納品所までつなぐ。要らない副生成物は「廃棄口」へ。出口が詰まると装置は止まる。'),
      h('li', {}, h('b', {}, '強化する'), '研究点がたまったら「強化」。計算問題を解くと、採取・運搬・処理が速くなる。'),
    ),
    h('p', { class: 'muted' }, '物質の絵柄は、元素ごとに決まった形の組み合わせでできている（「図鑑」で確認できる）。置いたものをタップすると、その場に「設定・回す・消す」が出る。間違えたら右上の「元に戻す」。'),
    first ? h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'start', onclick: closeModal }, '始める')) : null,
  );

  const showMenu = () => showSheet(
    h('header', {}, h('h2', {}, 'メニュー'), closeBtn()),
    h('div', { class: 'menu' },
      h('button', { class: 'ghost', type: 'button', id: 'm-log', onclick: () => showLog(panel()) }, '記録（間違えたところ）'),
      h('button', { class: 'ghost', type: 'button', id: 'm-help', onclick: () => showHelp() }, '遊び方'),
      h('button', { class: 'ghost', type: 'button', id: 'm-sound', onclick: () => { setSound(!soundOn()); store.setMeta({ sound: soundOn() }); sfx.tap(); showMenu(); } }, soundOn() ? '音：あり' : '音：なし'),
      h('button', { class: 'ghost', type: 'button', id: 'm-title', onclick: () => { modal.hidden = true; sheet.replaceChildren(); toTitle(); } }, '保存してタイトルへ戻る'),
    ),
    h('p', { class: 'muted' }, `セーブ ${slot}　この端末に自動で保存している。`),
  );

  $('b-menu').onclick = showMenu;
  $('b-up').onclick = () => showUpgrades(panel());
  $('b-book').onclick = () => showBook(panel());
  undoBtn.onclick = doUndo;
  undoBtn.disabled = true;

  // ---- 道具バー ----
  const bar = $('tools'), tip = $('tip');
  const buttons = new Map<Tool, HTMLButtonElement>();
  const pick = (id: Tool) => {
    tool = id;
    const t = TOOLS.find((x) => x.id === id)!;
    for (const [k, el] of buttons) { el.classList.toggle('on', k === tool); el.setAttribute('aria-pressed', String(k === tool)); }
    tip.replaceChildren(h('b', {}, t.name), t.tip);
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
      const b = buttons.get(t.id)!, locked = world.goal < t.unlock;
      if (announce && b.hidden && !locked) toast(`新しい道具「${t.name}」が使えるようになった`, 4000);
      b.hidden = locked;
    }
    if (buttons.get(tool)!.hidden) pick('pan');
  };

  // ---- 選んだものの上に出る操作 ----
  const act = $('act');
  const actOpen = $<HTMLButtonElement>('act-open'), actTurn = $<HTMLButtonElement>('act-turn'), actErase = $<HTMLButtonElement>('act-erase');
  actOpen.onclick = () => { if (selected) inspect(selected); };
  actTurn.onclick = () => { if (selected) sheetActions.rotate(selected); };
  actErase.onclick = () => { if (selected) sheetActions.erase(selected); };
  const placeAct = () => {
    if (!selected || !modal.hidden || !slot) { act.hidden = true; return; }
    const hub = selected.kind === 'hub';
    actOpen.textContent = isMachine(selected.kind) ? '設定' : selected.kind === 'depot' ? '選ぶ' : '説明';
    actTurn.hidden = actErase.hidden = hub;
    act.hidden = false;
    const ax = (selected.x + (hub ? 1 : 0.5) - cam.x) * cam.z + cw / 2;
    const ay = (selected.y - cam.y) * cam.z + ch / 2 - 14;
    act.style.transform = `translate(${Math.round(Math.min(cw - 110, Math.max(110, ax)))}px, ${Math.round(Math.max(64, ay))}px) translate(-50%, -100%)`;
  };

  $('b-fit').onclick = () => {
    const fit = fitZoom();
    const wide = cam.z > fit * 1.15;
    camTo = wide ? { x: MAP_W / 2, y: MAP_H / 2 + 2, z: fit } : { x: hubX + 1, y: hubY + 1, z: nearZoom() };
    $('b-fit').textContent = wide ? '近く' : '全体';
  };

  // ---- 地図の操作 ----
  const pullsBelt = (x: number, y: number) => { const e = at(world, x, y); return !!e && e.kind !== 'hub' && e.kind !== 'vent'; };
  const input = attachInput(cv, cam, {
    begin: () => { group = null; camTo = null; },
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
      const err = doPlace(tool, x, y, tool === 'belt' ? beltDir : autoDir(world, tool, x, y));
      if (err) { toast(err); sfx.bad(); return; }
      sfx.place();
      if (isMachine(tool) || tool === 'depot') inspect(at(world, x, y)!);
    },
    stroke(x, y, prev) {
      selected = null;
      if (tool === 'erase') { doErase(x, y); return; }
      if (prev) {
        beltDir = (x > prev[0] ? 0 : x < prev[0] ? 2 : y > prev[1] ? 1 : 3) as Dir;
        const p = at(world, prev[0], prev[1]);
        if (p?.kind === 'belt') doTurn(p, beltDir);
      }
      const e = at(world, x, y);
      if (!e) { if (prev || tool === 'belt') doPlace('belt', x, y, beltDir); }
      else if (e.kind === 'belt' && prev) doTurn(e, beltDir);
    },
  });

  // ---- 指令の表示 ----
  const goalIco = $<HTMLCanvasElement>('goal-ico');
  const hud = () => {
    const g = GOALS[world.goal];
    $('pts').textContent = String(world.points);
    if (shownGoal !== world.goal) {
      shownGoal = world.goal;
      const c2 = goalIco.getContext('2d')!;
      c2.clearRect(0, 0, 88, 88);
      if (g) drawToken(c2, g.s, 44, 46, 36);
      goalIco.hidden = !g;
      const ch2 = chapterOf(world.goal);
      $('goal-step').textContent = ch2 ? `${ch2.name}　${ch2.index + 1} / ${ch2.of}` : `全 ${GOALS.length} 指令 達成`;
      $('goal-name').textContent = g ? `${sub(g.s).name} ${sub(g.s).formula ? label(g.s) : g.s === 'e' ? 'e⁻' : ''} を ${g.n} 個` : 'すべての指令を終えた';
      $('goal-hint').textContent = g ? g.hint : '記録を開いて、間違えた反応を紙に書き出して確認しろ。ここから先は過去問で仕上げる。';
    }
    $('goal-count').textContent = g ? `${world.count} / ${g.n}` : '';
    $('goal-bar').style.width = g ? `${(world.count / g.n) * 100}%` : '100%';
  };

  // ---- タイトルと開始 ----
  const title = initTitle({
    start(n, json) {
      world = (json && deserialize(json)) || newWorld();
      slot = n;
      undo.length = 0; group = null; selected = null; undoBtn.disabled = true; shownGoal = -2;
      cam.x = hubX + 1; cam.y = hubY + 1; cam.z = nearZoom(); camTo = null;
      $('b-fit').textContent = '全体';
      title.hide();
      app.classList.remove('in-title');
      for (const b of buttons.values()) b.hidden = false;
      refreshTools(false);
      pick('pan');
      began = performance.now(); warned = false;
      save();
      if (!json) showHelp(true);
    },
  });
  const toTitle = () => { save(); slot = 0; selected = null; app.classList.add('in-title'); title.show(); };

  // ---- ループ ----
  let began = performance.now(), warned = false, prev = performance.now(), acc = 0, sinceSave = 0;
  const STEP = 1 / 60;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (slot) {
      if (modal.hidden) {
        acc += dt;
        while (acc >= STEP) { step(world, STEP); acc -= STEP; }
      }
      for (const ev of world.events.splice(0)) {
        if (ev === 'goal-done') { toast('納品完了。研究点 +30。次の指令が出た。', 3500); sfx.goal(); refreshTools(true); }
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
