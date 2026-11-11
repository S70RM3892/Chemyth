import { CHAPTERS, TOTAL_GOALS } from './content/goals';
import { HUB_CENTER, LAND, ZONES, hubRect, resourceAt, zoneAt } from './content/map';
import { ELEMENTS } from './content/elements';
import { MACHINES } from './content/machines';
import { label, sub } from './content/substances';
import { BIG, FEED_TIERS, flamesFed, addRail, removeRail, setRailMask, stationRoutes, FLOOR_DY, floorOf, groundY, has, liftPartner, footprint, inDoors, maxLanes, mergeDirs, slotCount, slotPort, at, autoDir, beltSpeed, configure, currentGoal, extractInterval, fedTier, flowStats, goalRate, deserialize, doneCount, fitAnchor, goalCount, requiredOf, isMachine, newWorld, place, remove, restore, serialize, sizeOf, step, toolUnlocked, type Dir, type Ent, type Kind, type World } from './engine/world';
import { recipeById } from './content/recipes';
import { about, chip, diagram, openConfig } from './ui/config';
import { $, h } from './ui/dom';
import { attachInput, Z_MIN, type InputHandlers } from './ui/input';
import { numPad, typeNumber, reviewCount, showAnalyzer, showBook, showChapters, showDepot, showLog, showPassages, showReview, showSampler, showPhoresis, showSettler, showSignal, showStation, showTank, showSyllabus, showUpgrades, type PanelCtx } from './ui/panels';
import { showDrills, showEssays, showStructure } from './ui/practice';
import { draw, type Camera } from './ui/render';
import { lanePaths, type LaneTile } from './engine/lanes';
import { CASES, CASE_KIND, CASE_REWARD, limitStock, type Case, type CaseState } from './engine/cases';
import { appearance, equationOf } from './content/looks';
import { isSep, sepSlots } from './content/sep';
import { showMock } from './ui/mock';
import { drawFireworks, launchFireworks } from './ui/fireworks';
import { POST_PRESETS, createPost, type Post } from './ui/gl';
import { palette } from './ui/theme';
import { FLAMES } from './content/looks';
import { decodeBlueprint, encodeBlueprint, type Stamp } from './engine/blueprint';
import { showStats, type StatsCtx } from './ui/stats';
import { setSound, sfx, soundOn, unlockAudio } from './ui/sound';
import { musicOn, musicTick, setMusic } from './ui/music';
import { initTitle, skinButtons, slotName, store, themeButtons } from './ui/title';
import { applySkin, applyTheme } from './ui/theme';
import { showRanking, submitScore } from './ui/ranking';
import { drawToken, elementIcon } from './ui/token';

type Placeable = Exclude<Kind, 'hub' | 'part'>;
type Tool = 'pan' | 'erase' | 'area' | 'rail' | Placeable;
/** 範囲コピーした設計図。左上からのずれで持つ */
type Op = { t: 'add'; x: number; y: number } | { t: 'del'; ent: Ent } | { t: 'dir'; x: number; y: number; dir: Dir } | { t: 'rails'; snap: [string, number | undefined][] };
const SESSION_LIMIT_MS = 25 * 60 * 1000;
const BUILD: Placeable[] = ['belt', 'bridge', 'tunnel', 'lift', 'splitter', 'analyzer', 'sensor', 'gate', 'station', 'extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'collector', 'settler', 'funnel', 'phoresis', 'sampler', 'depot', 'tank', 'vent'];
/** 道具の分類。道具が多いので、棚を分けて出す */
const GROUPS: { id: string; name: string; tools: Tool[] }[] = [
  { id: 'move', name: '運ぶ', tools: ['pan', 'belt', 'bridge', 'tunnel', 'lift', 'splitter', 'analyzer', 'sensor', 'gate', 'station', 'rail'] },
  { id: 'make', name: '作る', tools: ['extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'collector', 'settler', 'funnel', 'phoresis'] },
  { id: 'store', name: '出し入れ', tools: ['sampler', 'depot', 'tank', 'vent'] },
  { id: 'edit', name: '編集', tools: ['area', 'erase'] },
];
const SPEEDS = [1, 2, 4, 0];
/** 複製：同じ設定の装置を続けて置く */
interface Clone { kind: Placeable; recipe?: string; outOrder?: string[]; outSlot?: number[]; big?: boolean; test?: string; sub?: string }

const TOOLS: { id: Tool; glyph: string; name: string; tip: string; color?: string; need: { done?: number; chapter?: number; research?: string } }[] = [
  { id: 'pan', glyph: '☝', name: '見る', need: {}, tip: 'タップで選ぶ。装置やベルトから指を引くとベルトが伸びる。何もない所を引くと地図が動く。' },
  ...BUILD.map((id) => ({ id, glyph: MACHINES[id].glyph, name: MACHINES[id].name, tip: MACHINES[id].tip, color: MACHINES[id].color, need: MACHINES[id] })),
  { id: 'rail', glyph: '線', name: '線路', need: { done: 3 }, color: '#8a5a2c', tip: '駅か、敷いてある線路から指でなぞると、線路が伸びる。積む駅と降ろす駅がつながると、列車はそこを走る（仮の線路の 1.5 倍の速さ）。線路はどの駅も共有でき、途中で枝分かれさせてよい。' },
  { id: 'area', glyph: '▭', name: '範囲', need: {}, color: '#4a5a78', tip: '指でなぞって四角く囲む。囲んだ設備をまとめてコピーして別の場所に貼りつけたり、まとめて消したりできる。ラインを丸ごと増設するのに使う。' },
  { id: 'erase', glyph: '✕', name: '消す', need: {}, color: '#b0453f', tip: 'タップするか、なぞると消える。間違えたら右上の「元に戻す」。' },
];

/** 確認用：アドレスに ?gfx をつけると、重くても高画質のままにする（自動で標準に戻さない） */
const KEEP_GFX = typeof location !== 'undefined' && location.search.includes('gfx');
/** 計測用：アドレスに ?perf をつけると、1 フレームの計算と描画にかかった時間（ミリ秒）を window.__perf にためる */
const PERF: { draw: number[]; step: number[] } | null = typeof location !== 'undefined' && location.search.includes('perf') ? ((window as unknown as { __perf: { draw: number[]; step: number[] } }).__perf = { draw: [], step: [] }) : null;

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
  /** 範囲選択の 2 つの角と、コピーした設計図 */
  let areaA: [number, number] | null = null, areaB: [number, number] | null = null;
  let blueprint: Stamp[] | null = null;
  /** いま見ている階（0 が 1 階、1 が 2 階）。2 階のマスは、y を FLOOR_DY だけずらして持つ */
  let floor = 0;
  /** 置く前の見本を出すマス（マウスが乗っているか、指で押し続けている所）。holding は、押し続けて場所を選んでいる最中 */
  let hover: [number, number] | null = null, holding = false;
  /** 置くときの向き。null は自動（流れ込みに合わせるか、納品所の方角） */
  let placeDir: Dir | null = null;
  /** ベルトをまとめて引く本数と、いまのなぞり書きの道筋・敷いたマス */
  let lanes = 1, lanePath: [number, number][] = [];
  const laneLaid = new Set<string>();
  /** 設計図を置こうとしている場所（左上のマス） */
  let ghost: [number, number] | null = null;
  /** いまのなぞり書きで敷いた線路のマス数 */
  let railsLaid = 0;
  /** 地図に稼働率の札を出すか */
  let overlay = store.meta().overlay === true;
  const app = $('app');
  const cv = $<HTMLCanvasElement>('cv');
  const ctx = cv.getContext('2d')!;
  const [hubCX, hubCY] = HUB_CENTER;
  const cam: Camera = { x: hubCX, y: hubCY, z: 48 };
  let cw = 0, ch = 0;

  setSound(store.meta().sound !== false);
  setMusic(store.meta().music !== false);
  // 背景音楽は、最初に画面に触れたときから鳴らせる（ブラウザの決まり）
  window.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  applyTheme(store.meta().theme ?? 'auto');
  applySkin(store.meta().skin ?? 'note');
  /** 課題を開いているあいだ、本編の工場は home に預けておく。world は課題の小さな工場 */
  let sandbox: { c: Case; home: World; done: boolean } | null = null;
  const save = () => { if (slot) store.write(slot, serialize(sandbox ? sandbox.home : world)); };
  hot?.snapshot?.(() => (slot ? { slot, save: serialize(world) } : {}));

  // ---- WebGL の合成段：地図の絵（#cv）を素材にして、光・発光・ゆらぎをかけた結果を #gl に出す ----
  const glCv = $<HTMLCanvasElement>('gl');
  let post: Post | null = null, gfxHigh = store.meta().gfx !== 'plain';
  /** 光の層と効果の層。画面の 1/3 の細かさで足りる（どうせぼかす） */
  const FX_SCALE = 1 / 3;
  const glowCv = document.createElement('canvas'), maskCv = document.createElement('canvas');
  const glowCtx = glowCv.getContext('2d')!, maskCtx = maskCv.getContext('2d')!;
  const fxOn = () => !!post && gfxHigh && !post.lost();
  const applyGfx = () => {
    if (gfxHigh && !post) { try { post = createPost(glCv); } catch { post = null; } if (!post) gfxHigh = false; }
    glCv.hidden = !fxOn();
  };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const c of [glowCv, maskCv]) { c.width = Math.max(8, Math.round(cw * FX_SCALE)); c.height = Math.max(8, Math.round(ch * FX_SCALE)); }
    post?.resize(cv.width, cv.height);
  };
  new ResizeObserver(resize).observe(cv);
  applyGfx();
  resize();
  const nearZoom = () => Math.max(40, Math.min(54, cw / 24));
  /** 建てたもの全体が収まる視野 */
  const fitView = (vw = cw, vh = ch - 150): Camera => {
    const hr = hubRect(world.hubSize);
    let x0 = hr.x, y0 = hr.y, x1 = hr.x + hr.s, y1 = hr.y + hr.s;
    for (const e of world.ents.values()) { const gy = groundY(e.y); x0 = Math.min(x0, e.x); y0 = Math.min(y0, gy); x1 = Math.max(x1, e.x + 1); y1 = Math.max(y1, gy + 1); }
    const w0 = Math.max(60, x1 - x0 + 16), h0 = Math.max(40, y1 - y0 + 16);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + (vh === ch - 150 ? 2 : 0), z: Math.max(Z_MIN, Math.min(nearZoom(), vw / w0, vh / h0)) };
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
    if (!e && world.rails.has(`${x},${y}`)) {
      // 何も建っていないマスの線路を取り除く
      const snap = [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].map(([qx, qy]) => [`${qx},${qy}`, world.rails.get(`${qx},${qy}`)] as [string, number | undefined]);
      removeRail(world, x, y);
      record({ t: 'rails', snap });
      return true;
    }
    if (!e || e.kind === 'hub') return false;
    if (selected === e) selected = null;
    record({ t: 'del', ent: e });
    // 昇降機は 2 つで 1 組。元に戻すときに両方とも戻るよう、相方も記録する
    if (e.kind === 'lift') { const p = liftPartner(world, e); if (p) record({ t: 'del', ent: p }); }
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
      else if (op.t === 'rails') for (const [k, m] of op.snap) setRailMask(world, k, m);
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
  const statsBtn = $('b-stats');
  const paintOverlay = () => statsBtn.classList.toggle('hot', overlay);
  const statsCtx = (): StatsCtx => ({
    ...panel(),
    overlay: () => overlay,
    setOverlay: (on) => { overlay = on; store.setMeta({ overlay }); paintOverlay(); },
    // 統計の行から、その装置の場所へ移って選ぶ
    focus: (e) => { closeModal(); setFloor(floorOf(e.y)); camTo = { x: e.x + sizeOf(e) / 2, y: groundY(e.y) + sizeOf(e) / 2 + 1, z: nearZoom() }; selected = e; },
  });
  statsBtn.onclick = () => showStats(statsCtx());
  paintOverlay();

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
    if (e.sealed) { showSealed(e); return; }
    if (isMachine(e.kind)) { modal.hidden = false; sheet.scrollTop = 0; openConfig(sheet, world, e, sheetActions); return; }
    if (e.kind === 'hub') {
      const g = currentGoal(world);
      showSheet(h('header', {}, h('h2', {}, '納品所'), closeBtn()),
        h('p', {}, '全元素を欲しがる機械。指定された物質をここへ運べ。どの側からでも飲み込む。指定と違う物質も飲み込んで在庫にする。在庫は「搬出口」で取り出せる。'),
        h('h3', {}, `飲み込んだ元素　${ELEMENTS.filter((x) => fedTier(world, x.sym) >= 1).length} / ${ELEMENTS.length}`),
        h('p', { class: 'muted' }, `納めた物質の化学式から、原子を元素ごとに数える。${FEED_TIERS.join('・')} 個に達するたびに段階が上がり、研究点が入る（+10・+30・+100）。全元素を 1 段階まで上げると +300。機械の外周の印が灯る。`),
        h('div', { class: 'fed' }, ...ELEMENTS.map((el) => {
          const n = world.fed[el.sym] || 0, tier = fedTier(world, el.sym);
          return h('span', { class: 'fed-el' + (tier ? ' on' : '') }, elementIcon(el.sym, 20), h('b', {}, el.sym), h('span', { class: 'muted' }, n >= 10000 ? `${Math.round(n / 1000)}k` : String(n)), h('span', { class: 'fed-t' }, '●'.repeat(tier) + '○'.repeat(FEED_TIERS.length - tier)));
        })),
        h('p', { class: 'muted' }, g?.rate ? `いまの指令：${sub(g.s).name} を毎分 ${g.rate} 個の速さで ${g.n} 秒間納め続ける。いまの速さは毎分 ${Math.round(goalRate(world))} 個。` : g ? `いまの指令：${sub(g.s).name} を ${requiredOf(world, g)} 個（${goalCount(world)} 個 納品済み）` : 'この章の指令は終えた。'),
        h('p', { class: 'muted' }, `いまの大きさは ${world.hubSize}×${world.hubSize} マス。指令を達成していくと大きくなり、受け取れる口が増える。そのぶん 1 つの指令で求められる数も増える。`),
        h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', onclick: () => showChapters(panel()) }, '指令の一覧を開く')));
      return;
    }
    const kind = e.kind as Placeable;
    const extra = () => h('div', { class: 'split' }, about(kind), sideOf(e));
    if (kind === 'depot') { showDepot(panel(), e, extra()); return; }
    if (kind === 'sampler') { showSampler(panel(), e, extra()); return; }
    if (kind === 'analyzer') { showAnalyzer(panel(), e, extra()); return; }
    if (kind === 'station') { showStation(panel(), e, extra()); return; }
    if (kind === 'sensor' || kind === 'gate') { showSignal(panel(), e, extra()); return; }
    if (kind === 'settler' || kind === 'funnel') { showSettler(panel(), e, extra()); return; }
    if (kind === 'phoresis') { showPhoresis(panel(), e, extra()); return; }
    if (kind === 'tank') { showTank(panel(), e, extra()); return; }
    showSheet(h('header', {}, h('h2', {}, MACHINES[kind].name), closeBtn()),
      kind === 'extractor' ? h('p', { class: 'eq' }, `ここで採れるもの：${sub(resourceAt(e.x, e.y)).name}`) : null,
      kind === 'lift' ? h('div', { class: 'row' }, h('span', { class: 'status' }, `${floorOf(e.y) + 1} 階の${e.role === 'in' ? '入口。ここに入った物は、もう一方の階の同じ場所から出る。' : '出口。もう一方の階の入口から入った物が、ここから正面へ出る。'}`),
        h('button', { class: 'ghost', type: 'button', id: 'lift-other', onclick: () => { closeModal(); setFloor(1 - floorOf(e.y)); } }, `${2 - floorOf(e.y)} 階を見る`)) : null,
      kind === 'extractor' ? h('p', { class: 'status' }, `能力：1 台で毎分 ${Math.round(60 / extractInterval(world))} 個。「強化」で増える。足りなければ台数を増やして合流させろ。`) : null,
      kind === 'belt' || kind === 'bridge' || kind === 'tunnel' ? h('p', { class: 'status' }, `能力：1 本で毎分 ${Math.round(beltSpeed(world) * 60)} 個まで運べる。それ以上流すと詰まるので、2 本に分けろ。`) : null,
      kind === 'belt' && mergeDirs(e).length >= 2 ? h('div', {},
        h('h3', {}, '合流の優先'),
        h('p', { class: 'muted' }, 'ここは合流点だ。ふだんは交互に通す。片方を優先にすると、その流れが来ている間、ほかの流れは待つ。主製品を止めたくないときに使う。'),
        h('div', { class: 'row' },
          h('button', { class: 'chip' + (e.pri === undefined ? ' on' : ''), type: 'button', id: 'pri-none', onclick: () => { e.pri = undefined; inspect(e); } }, '交互'),
          ...mergeDirs(e).map((q) => h('button', { class: 'chip' + (e.pri === q ? ' on' : ''), type: 'button', id: `pri-${q}`, onclick: () => { e.pri = q; inspect(e); } }, `${ARROWS[q]} 向きの流れを優先`)))) : null,
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
      h('li', {}, h('b', {}, '広げる'), '道具は「運ぶ・作る・出し入れ・編集」の棚に分かれている。遠くの資源地からは「貨物駅」の列車で運べ。装置やベルトの下は「地下ベルト」でくぐれる。「範囲」で囲んだラインは、コピーして回し、設計図として保存できる。'),
      h('li', {}, h('b', {}, '見直す'), '右上の「統計」で、納品の速さ、装置ごとの稼働率、止まっている理由がわかる。地図に稼働率を重ねて表示できる。'),
      h('li', {}, h('b', {}, '手早く置く'), '設備の道具で空いたマスを押し続けると、置く前の見本（占めるマス・出口・入口）が出る。そのまま指を動かして場所を選び、離すと置く。棚の右端で、ベルトをまとめて引く本数と、設備を置く向きを決められる。'),
      h('li', {}, h('b', {}, '研究する'), '「強化」の下の「研究」で、3 本・4 本引き、長い地下ベルト、信号（検知器と弁）、2 階、列車や装置の能力を開く。二者択一の組は、工場の形に合うほうを選べ。'),
      h('li', {}, h('b', {}, '分ける'), '終盤の章は、混ざったものを順に分ける。金属イオンの混合溶液は「沈殿槽」で試薬の順に、芳香族のエーテル溶液は「分液ろうと」で水層へ移す順に、アミノ酸の混合水溶液は「電気泳動槽」で pH を決めて分ける。混合物は「試薬棚」から出る。作ったものは「貯蔵タンク」にためておける。'),
      h('li', {}, h('b', {}, '試す'), 'メニューの「課題」は、自分の工場とは別の小さな工場を渡す：1 か所だけ誤った工場を直す、数の決まった原料からできる数を先に計算する、封印された装置の反応を数の比から当てる。「模試」は、自分の工場で動いている反応が、そのまま問題文になる。'),
      h('li', {}, h('b', {}, '残る'), '章を終えると、納品所が飲み込んだ元素の炎色で花火が上がる。反応を、日を空けた復習で思い出せるほど、装置が銅 → 銀 → 金になる（まちがえると剥がれる）。達成した瞬間の工場は「アルバム」に残り、タイトルの本棚に背表紙が増え、地図に灯りがともる。'),
      h('li', {}, h('b', {}, '網にする'), '道具「線路」で駅から駅へ線路を敷くと、列車はそこを 1.5 倍の速さで走る。線路は枝分かれさせて何駅でも共有できるが、混むと待ちが出る。地図を引くと、区画ごとに「何を毎分いくつ作っているか」の札が出る。'),
    ),
    h('p', { class: 'muted' }, '物質の絵柄は、元素ごとに決まった形の組み合わせでできている（「図鑑」で確認できる）。置いたものをタップすると、その場に「設定・回す・消す」が出る。間違えたら右上の「元に戻す」。'),
    first ? h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'start', onclick: closeModal }, '始める')) : null,
  );

  const showMenu = () => {
    const item = (id: string, text: string, go: () => void) => h('button', { class: 'ghost', type: 'button', id, onclick: go }, text);
    showSheet(
      h('header', {}, h('h2', {}, 'メニュー'), closeBtn()),
      h('h3', {}, '工場'),
      h('div', { class: 'menu' },
        item('m-chapters', '指令の一覧（章を切り替える）', () => showChapters(panel())),
        item('m-stats', '統計（納品の速さ・装置の稼働率・学習の進み）', () => showStats(statsCtx())),
        item('m-album', 'アルバム（達成した瞬間の工場の写真）', () => showAlbum())),
      h('h3', {}, '京大形式の演習'),
      h('div', { class: 'menu' },
        item('m-drills', '連鎖計算（理論の大問。数値は毎回変わる）', () => showDrills(panel())),
        item('m-structure', '構造決定（異性体の数え上げ・構造の特定・ペプチドの配列）', () => showStructure(panel())),
        item('m-passages', 'リード文課題（空欄補充）', () => showPassages(panel())),
        item('m-essays', '論述（紙に書いて、要点で自己採点）', () => showEssays(panel())),
        item('m-mock', '模試（自分の工場がそのまま問題文になる）', () => showMock(panel()))),
      h('h3', {}, '課題'),
      h('div', { class: 'menu' },
        item('m-cases', `課題（壊れた工場を直せ・限られた原料・中身の見えない装置）　${(sandbox ? sandbox.home : world).cases.length} / ${CASES.length}`, () => showCases()),
        sandbox ? item('m-case-leave', '課題をやめて、自分の工場に戻る', () => { leaveCase(); closeModal(); }) : null),
      h('h3', {}, 'ふり返り'),
      h('div', { class: 'menu' },
        item('m-syllabus', '範囲表（入試範囲のどこまで進んだか）', () => showSyllabus(panel())),
        item('m-log', '記録（間違えたところ）', () => showLog(panel())),
        item('m-rank', 'ランキング', () => showRanking(panel()))),
      h('h3', {}, '設定'),
      h('div', { class: 'menu' },
        h('div', { class: 'row' }, h('span', { class: 'muted' }, '見た目'), h('span', { class: 'seg' }, ...skinButtons(showMenu)), h('span', { class: 'seg' }, ...themeButtons(showMenu))),
        item('m-sound', soundOn() ? '音：あり' : '音：なし', () => { setSound(!soundOn()); store.setMeta({ sound: soundOn() }); sfx.tap(); showMenu(); }),
        item('m-gfx', fxOn() ? '画質：高（光・発光・ゆらぎ）' : post || store.meta().gfx !== 'plain' ? '画質：標準（軽い）' : '画質：標準（この端末では高画質を使えない）', () => {
          gfxHigh = !fxOn(); slowFrames = 0; applyGfx(); resize();
          store.setMeta({ gfx: gfxHigh ? 'high' : 'plain' }); sfx.tap(); showMenu();
          if (!gfxHigh && store.meta().gfx === 'high') toast('この端末では高画質を使えない。', 2600);
        }),
        item('m-music', musicOn() ? '音楽：あり' : '音楽：なし', () => { setMusic(!musicOn()); store.setMeta({ music: musicOn() }); sfx.tap(); showMenu(); }),
        item('m-help', '遊び方', () => showHelp()),
        item('m-title', '保存してタイトルへ戻る', () => { modal.hidden = true; sheet.replaceChildren(); toTitle(); })),
      h('p', { class: 'muted' }, `${slotName(slot)}。この端末に自動で保存している。`),
    );
  };

  $('b-menu').onclick = showMenu;
  $('b-up').onclick = () => showUpgrades(panel());
  $('b-book').onclick = () => showBook(panel());
  $('b-review').onclick = () => showReview(panel());
  $('goal').onclick = () => (sandbox ? showCaseBrief() : showChapters(panel()));
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
    if (id !== 'area') { blueprint = null; ghost = null; areaA = areaB = null; }
    const grp = GROUPS.find((g) => g.tools.includes(id));
    if (grp) { tab = grp.id; paintTabs(); }
    paintArea();
    const t = TOOLS.find((x) => x.id === id)!;
    for (const [k, el] of buttons) { el.classList.toggle('on', k === tool); el.setAttribute('aria-pressed', String(k === tool)); }
    tip.replaceChildren(h('b', {}, clone ? `${t.name}をコピー中` : t.name), clone ? 'タップした場所に、同じ設定のものを貼りつける。ほかの道具を選ぶとやめる。' : t.tip);
    // 説明は選んだ直後だけ出して、じきに消す（出しっぱなしだと下側が地図をふさぐ）
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => { tip.hidden = true; }, clone ? 9000 : 5200);
    paintOpts();
  };
  let tipTimer = 0;
  /** 道具ごとの切り替え（棚の右端）：ベルトは引く本数、設備は置く向き */
  const optsEl = $('opts');
  const ARROWS = ['→', '↓', '←', '↑'];
  const isBuild = (t: Tool): t is Placeable => t !== 'pan' && t !== 'erase' && t !== 'area' && t !== 'rail';
  const paintOpts = () => {
    const nodes: HTMLElement[] = [];
    if (tool === 'belt') {
      lanes = Math.min(lanes, maxLanes(world));
      nodes.push(h('button', { type: 'button', id: 'opt-lanes', class: lanes > 1 ? 'on' : '', ariaLabel: 'まとめて引く本数', onclick: () => { lanes = (lanes % maxLanes(world)) + 1; sfx.tap(); paintOpts(); toast(lanes > 1 ? `ベルトを ${lanes} 本まとめて引く。なぞった線の右手に並ぶ。` : 'ベルトを 1 本ずつ引く。', 1800); } }, '本数', h('b', {}, String(lanes))));
    } else if (isBuild(tool) && tool !== 'bridge' && tool !== 'vent') {
      nodes.push(h('button', { type: 'button', id: 'opt-dir', class: placeDir !== null ? 'on' : '', ariaLabel: '置く向き', onclick: () => { placeDir = placeDir === null ? 0 : placeDir === 3 ? null : (((placeDir + 1) % 4) as Dir); sfx.tap(); paintOpts(); } }, '向き', h('b', {}, placeDir === null ? '自動' : ARROWS[placeDir])));
    }
    optsEl.replaceChildren(...nodes);
    optsEl.hidden = !nodes.length;
  };
  for (const t of TOOLS) {
    const b = h('button', { type: 'button', id: `tool-${t.id}`, class: 'tool' }, h('span', { class: 'g' }, t.glyph), h('span', { class: 'l' }, t.name));
    b.onclick = () => { pick(t.id); sfx.tap(); };
    if (t.color) b.style.setProperty('--tint', t.color);
    buttons.set(t.id, b);
    bar.append(b);
  }
  // 道具の棚：分類ごとに切り替える
  let tab = 'move';
  const tabs = h('div', { id: 'tabs' }, ...GROUPS.map((g) => h('button', { type: 'button', id: `tab-${g.id}`, onclick: () => { tab = g.id; paintTabs(); sfx.tap(); } }, g.name)));
  bar.before(tabs);
  function paintTabs() {
    for (const g of GROUPS) {
      $(`tab-${g.id}`).classList.toggle('on', g.id === tab);
      for (const id of g.tools) buttons.get(id)?.classList.toggle('off', g.id !== tab);
    }
  }
  paintTabs();
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
    if (!selected || !modal.hidden || !slot || floorOf(selected.y) !== floor) { act.hidden = true; return; }
    const hub = selected.kind === 'hub';
    actOpen.textContent = isMachine(selected.kind) || selected.kind === 'station' || selected.kind === 'sensor' || selected.kind === 'gate' || isSep(selected.kind) ? '設定' : selected.kind === 'tank' ? '中身' : selected.kind === 'depot' || selected.kind === 'sampler' ? '選ぶ' : selected.kind === 'analyzer' ? '検査' : '説明';
    actTurn.hidden = actErase.hidden = hub;
    actCopy.hidden = !copyable(selected);
    act.hidden = false;
    const hr = hubRect(world.hubSize);
    const ax = ((hub ? hr.x + hr.s / 2 : selected.x + sizeOf(selected) / 2) - cam.x) * cam.z + cw / 2;
    // 稼働率の札を出しているときは、札の上に出す
    const ay = ((hub ? hr.y : groundY(selected.y)) - cam.y) * cam.z + ch / 2 - 14 - (overlay && !hub ? 26 : 0);
    act.style.transform = `translate(${Math.round(Math.min(cw - 110, Math.max(110, ax)))}px, ${Math.round(Math.max(64, ay))}px) translate(-50%, -100%)`;
  };

  $('b-fit').onclick = () => {
    const fit = fitView();
    const wide = cam.z > fit.z * 1.15;
    camTo = wide ? fit : { x: hubCX, y: hubCY, z: nearZoom() };
    $('b-fit').textContent = wide ? '近く' : '全体';
  };

  // ---- 地図の操作 ----
  /** いまの道具で (x, y) に置く。2×2 の装置は、そのマスを含む空き場所に置く */
  const placeSpot = (x: number, y: number): { px: number; py: number; dir: Dir } => {
    const t = tool as Placeable;
    const [px, py] = (BIG.includes(t) ? fitAnchor(world, x, y) : null) ?? [x, y];
    return { px, py, dir: t === 'belt' ? beltDir : placeDir ?? autoDir(world, t, px, py) };
  };
  const placeAt = (x: number, y: number) => {
    if (!isBuild(tool)) return;
    const { px, py, dir } = placeSpot(x, y);
    const err = doPlace(tool, px, py, dir);
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
    if (isMachine(tool) || tool === 'depot' || tool === 'sampler' || tool === 'analyzer' || tool === 'station' || tool === 'sensor' || tool === 'gate' || isSep(tool)) inspect(placed);
  };
  /** 置く前の見本：占めるマス、置けるかどうか、向き、出口（外向きの矢印）と入口（内向きの矢印） */
  const toolGhost = () => {
    if (!hover || !isBuild(tool) || tool === 'belt' || !modal.hidden) return null;
    if (at(world, hover[0], hover[1]) && !holding) return null;
    const big = BIG.includes(tool), { px, py, dir } = placeSpot(hover[0], hover[1]);
    const ok = footprint(px, py, big ? 2 : 1).every(([fx, fy]) => !at(world, fx, fy));
    const fake: Ent = { kind: tool, x: px, y: py, dir, big: big || undefined };
    const ports: { x: number; y: number; d: number; out: boolean }[] = [];
    const outs = isMachine(tool) ? slotCount(fake) : tool === 'splitter' ? 3 : tool === 'analyzer' ? 2 : tool === 'station' || tool === 'tank' ? 2 : tool === 'vent' || tool === 'bridge' ? 0 : 1;
    // 沈殿槽の出口は、正面（左）のろ液と、右手（手前）の沈殿
    for (const i of isSep(tool) ? sepSlots(tool) : Array.from({ length: outs }, (_, k) => k)) { const q = slotPort(fake, i); ports.push({ x: q.x, y: q.y, d: q.d, out: true }); }
    for (const q of inDoors(fake)) if (tool !== 'station') ports.push({ x: q.x, y: q.y, d: q.d, out: false });
    return [{ x: px, y: py, size: big ? 2 : 1, ok, dir, glyph: MACHINES[tool].glyph, ports }];
  };
  /** ベルトを何本かまとめて引く。なぞった道筋から平行な道筋を作り直し、要らなくなったマスは片づける */
  const laneStroke = (x: number, y: number, prev: [number, number] | null) => {
    const n = lanePath.length;
    if (!prev || !n) lanePath = [[x, y]];
    else if (n >= 2 && lanePath[n - 2][0] === x && lanePath[n - 2][1] === y) lanePath.pop(); // 引き返したら 1 マス戻す
    else lanePath.push([x, y]);
    const m = lanePath.length;
    if (m >= 2) { const a = lanePath[m - 2], b = lanePath[m - 1]; beltDir = (b[0] > a[0] ? 0 : b[0] < a[0] ? 2 : b[1] > a[1] ? 1 : 3) as Dir; }
    const want = new Map<string, LaneTile>();
    for (const lane of lanePaths(lanePath, lanes, beltDir)) for (const q of lane) want.set(`${q.x},${q.y}`, q);
    for (const k of [...laneLaid]) {
      if (want.has(k)) continue;
      const [qx, qy] = k.split(',').map(Number);
      if (at(world, qx, qy)?.kind === 'belt') doErase(qx, qy);
      laneLaid.delete(k);
    }
    for (const [k, q] of want) {
      const e = at(world, q.x, q.y);
      if (!e) { if (!doPlace('belt', q.x, q.y, q.dir)) laneLaid.add(k); }
      else if (e.kind === 'belt') {
        if (laneLaid.has(k) || e.dir % 2 === q.dir % 2) doTurn(e, q.dir);
        // もとからあるベルトをまっすぐ横切るなら、立体交差にする
        else if (q.straight) { doErase(q.x, q.y); doPlace('bridge', q.x, q.y, 0); }
      }
    }
  };
  /** 線路をなぞり始められるマス：駅か線路の上、またはその隣 */
  const railStart = (x: number, y: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(world, x + dx, y + dy)?.kind === 'station' || world.rails.has(`${x + dx},${y + dy}`));
  const pullsBelt = (x: number, y: number) => { const e = at(world, x, y); return !!e && e.kind !== 'hub' && e.kind !== 'vent'; };
  const H: Required<InputHandlers> = {
    begin: () => { group = null; camTo = null; cross = null; railsLaid = 0; tip.hidden = true; lanePath = []; laneLaid.clear(); holding = false; },
    // 設備の道具で空いたマスを押し続けると、見本が出て、指で場所を選べる。離すと置く
    hold(x, y) {
      if (!isBuild(tool) || tool === 'belt' || at(world, x, y)) return false;
      holding = true; hover = [x, y]; sfx.tap();
      return true;
    },
    end() {
      if (tool === 'rail' && railsLaid) {
        // 敷き終えた：つながった駅があれば知らせる
        const linked = [...world.ents.values()].filter((e) => e.kind === 'station' && e.role === 'in' && stationRoutes(world, e).some((r) => r.custom)).length;
        toast(`線路を ${railsLaid} マス敷いた。${linked ? `線路でつながった積む駅：${linked} か所。` : 'まだ、積む駅と降ろす駅はつながっていない。'}`, 2600);
        sfx.ok(); railsLaid = 0;
      }
      if (!holding) return;
      holding = false;
      const hv = hover;
      hover = null;
      if (hv && !at(world, hv[0], hv[1])) placeAt(hv[0], hv[1]);
    },
    hover(t) { if (!holding) hover = t; },
    mode: (x, y) => (tool === 'rail' ? (!floor && railStart(x, y) ? 'stroke' : 'pan') : tool === 'area' ? (blueprint ? 'pan' : 'stroke') : tool === 'belt' || tool === 'erase' || (tool === 'pan' && pullsBelt(x, y)) ? 'stroke' : 'pan'),
    tap(x, y) {
      if (tool === 'rail') {
        const e = at(world, x, y), m = world.rails.get(`${x},${y}`) || 0;
        if (e?.kind === 'station') inspect(e);
        else toast(floor ? '線路は 1 階にしか敷けない。' : m ? ([0, 1, 2, 3].filter((d) => (m >> d) & 1).length >= 3 ? '分岐点。ここから別の駅へ枝分かれする。ここからなぞれば、さらに伸ばせる。' : '線路。ここからなぞれば、枝分かれさせて伸ばせる。消すときは「消す」。') : '線路は、駅か、敷いてある線路からなぞって伸ばす。', 2600);
        return;
      }
      if (tool === 'area') { if (blueprint) { ghost = [x, y]; sfx.tap(); } else areaA = areaB = null; paintArea(); return; }
      const e = at(world, x, y);
      if (tool === 'erase') { if (e?.kind === 'hub') toast('納品所は消せない'); else if (doErase(x, y)) sfx.erase(); else toast('ここには何もない', 1200); return; }
      if (e) {
        if (selected === e) inspect(e);
        else { selected = e; sfx.tap(); }
        return;
      }
      if (tool === 'pan') { if (selected) selected = null; else if (!floor) showZone(x, y); return; }
      placeAt(x, y);
    },
    stroke(x, y, prev) {
      selected = null;
      if (holding) { hover = [x, y]; return; }
      if (tool === 'rail') {
        // なぞったマスを順につなぐ。駅や、敷いてある線路から伸ばせる。どの駅の列車も、つながった線路を共有して走る
        if (!prev || floor) return;
        const snap = [prev, [x, y] as [number, number]].map(([qx, qy]) => [`${qx},${qy}`, world.rails.get(`${qx},${qy}`)] as [string, number | undefined]);
        if (addRail(world, prev, [x, y])) { record({ t: 'rails', snap }); railsLaid++; }
        return;
      }
      if (tool === 'area') { if (!prev || !areaA) areaA = [x, y]; areaB = [x, y]; paintArea(); return; }
      if (tool === 'erase') { doErase(x, y); return; }
      if (tool === 'belt' && lanes > 1) { laneStroke(x, y, prev); return; }
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
  };
  // 画面のマスに、いま見ている階のずれを足してから渡す
  const F = (y: number) => y + floor * FLOOR_DY;
  const input = attachInput(cv, cam, {
    begin: H.begin, end: H.end,
    mode: (x, y) => H.mode(x, F(y)),
    tap: (x, y) => H.tap(x, F(y)),
    stroke: (x, y, prev) => H.stroke(x, F(y), prev && [prev[0], F(prev[1])]),
    hold: (x, y) => H.hold(x, F(y)),
    hover: (t) => H.hover(t && [t[0], F(t[1])]),
  });
  // ---- 階の切り替え ----
  const floorBtn = $<HTMLButtonElement>('b-floor');
  const paintFloor = () => {
    floorBtn.hidden = !has(world, 'floor2');
    floorBtn.textContent = `${floor + 1} 階`;
    floorBtn.classList.toggle('hot', floor === 1);
    app.classList.toggle('upstairs', floor === 1);
  };
  function setFloor(f: number) {
    if (f === floor) return;
    floor = f;
    selected = null; hover = null; areaA = areaB = null; ghost = null;
    paintFloor(); paintArea();
  }
  floorBtn.onclick = () => { setFloor(1 - floor); sfx.tap(); toast(floor ? '2 階。1 階の設備は薄く見える。「昇降機」で上下をつなげ。' : '1 階。', 2400); };

  // ---- 範囲：まとめてコピー・貼りつけ・消去。設計図は回せて、保存できる ----
  const areaAct = $('area-act');
  const BP_KEY = 'chemyth-v2-blueprints';
  const library = (): { name: string; stamps: Stamp[] }[] => { try { return JSON.parse(localStorage.getItem(BP_KEY) || '[]'); } catch { return []; } };
  const saveLibrary = (l: { name: string; stamps: Stamp[] }[]) => { try { localStorage.setItem(BP_KEY, JSON.stringify(l.slice(0, 16))); } catch { /* 保存できなくても遊べる */ } };
  const sizeOfKind = (k: Placeable) => (BIG.includes(k) ? 2 : 1);
  const areaRect = (): [number, number, number, number] | null => (areaA && areaB ? [Math.min(areaA[0], areaB[0]), Math.min(areaA[1], areaB[1]), Math.max(areaA[0], areaB[0]), Math.max(areaA[1], areaB[1])] : null);
  const inArea = () => {
    const r = areaRect();
    return r ? [...world.ents.values()].filter((e) => e.kind !== 'hub' && e.kind !== 'part' && e.x >= r[0] && e.x <= r[2] && e.y >= r[1] && e.y <= r[3]) : [];
  };
  /** 設計図を置こうとしている場所の見本 */
  const ghostCells = () => (blueprint && ghost ? blueprint.map((b) => {
    const sz = sizeOfKind(b.kind), x = ghost![0] + b.dx, y = ghost![1] + b.dy;
    let free = true;
    for (let ix = 0; ix < sz; ix++) for (let iy = 0; iy < sz; iy++) if (at(world, x + ix, y + iy)) free = false;
    return { x, y, size: sz, ok: free, dir: b.dir, glyph: MACHINES[b.kind].glyph };
  }) : null);
  function paintArea() {
    const n = inArea().length, bp = !!blueprint;
    areaAct.hidden = tool !== 'area';
    $('area-n').textContent = bp ? (ghost ? `設計図 ${blueprint!.length} 個。場所を変えるなら別のマスをタップ。` : `設計図 ${blueprint!.length} 個。置きたい場所の左上をタップ。`) : areaRect() ? `${n} 個を選択中` : 'なぞって四角く囲め。';
    $('area-copy').hidden = $('area-del').hidden = bp || n === 0;
    $('area-rot').hidden = $('area-save').hidden = $('area-put').hidden = !bp;
    ($('area-put') as HTMLButtonElement).disabled = !ghost;
    $('area-lib').hidden = bp;
    $('area-cancel').hidden = !bp && !areaRect();
  }
  const toStamps = (r: [number, number, number, number], es: Ent[]): Stamp[] => es.map((e) => ({ kind: e.kind as Placeable, dx: e.x - r[0], dy: e.y - r[1], dir: e.dir, recipe: e.recipe, outOrder: e.outOrder ? [...e.outOrder] : undefined, outSlot: e.outSlot ? [...e.outSlot] : undefined, test: e.test, sub: e.sub, ch: e.ch, role: e.role }));
  $('area-copy').onclick = () => {
    const r = areaRect(), es = inArea();
    if (!r || !es.length) return;
    blueprint = toStamps(r, es);
    // 左上の空きを詰める
    const mx = Math.min(...blueprint.map((b) => b.dx)), my = Math.min(...blueprint.map((b) => b.dy));
    for (const b of blueprint) { b.dx -= mx; b.dy -= my; }
    areaA = areaB = null; ghost = null;
    sfx.ok();
    paintArea();
  };
  $('area-del').onclick = () => {
    group = null;
    for (const e of inArea()) doErase(e.x, e.y);
    areaA = areaB = null;
    sfx.erase();
    paintArea();
  };
  /** 時計回りに 90° 回す。2×2 の装置は、回したあとの左上のマスを新しい位置にする */
  $('area-rot').onclick = () => {
    if (!blueprint) return;
    const H = Math.max(...blueprint.map((b) => b.dy + sizeOfKind(b.kind)));
    blueprint = blueprint.map((b) => ({ ...b, dx: H - b.dy - sizeOfKind(b.kind), dy: b.dx, dir: ((b.dir + 1) % 4) as Dir }));
    sfx.tap();
    paintArea();
  };
  $('area-save').onclick = () => {
    if (!blueprint) return;
    const l = library(), big = blueprint.filter((b) => BIG.includes(b.kind));
    const what = [...new Set(big.map((b) => recipeById(b.recipe)?.name ?? MACHINES[b.kind].name))].slice(0, 2).join('・') || `${blueprint.length} 個`;
    l.unshift({ name: `設計図 ${l.length + 1}：${what}`, stamps: blueprint });
    saveLibrary(l);
    toast('設計図を保存した。「範囲」の「設計図」から、どのノートでも呼び出せる。', 3500);
    sfx.ok();
    paintArea();
  };
  const showLibrary = (io?: { mode: 'out' | 'in'; text?: string; note?: string }) => {
    const l = library();
    // 文字列での受け渡し：書き出した文字列を貼りつければ、ほかの端末や人の設計図を使える
    let ioBox: HTMLElement | null = null;
    if (io?.mode === 'out') {
      const area = h('textarea', { id: 'bp-io', readOnly: true, value: io.text ?? '', rows: 4 });
      const note = h('span', { class: 'muted' }, io.note ?? '');
      ioBox = h('div', { class: 'stack' }, h('b', {}, '設計図の書き出し'), h('p', { class: 'muted' }, 'この文字列を渡せば、相手は「文字列から読み込む」で同じ設計図を使える。反応の設定も入っている。'), area,
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'bp-io-copy', onclick: () => { navigator.clipboard.writeText(area.value).then(() => { note.textContent = 'コピーした。'; }, () => { area.select(); note.textContent = 'コピーできなかった。選択された文字列を自分でコピーしろ。'; }); } }, 'コピー'), note));
    } else if (io?.mode === 'in') {
      const area = h('textarea', { id: 'bp-io', rows: 4, placeholder: '書き出した文字列をここに貼りつける' });
      const note = h('span', { class: 'muted' }, io.note ?? '');
      ioBox = h('div', { class: 'stack' }, h('b', {}, '文字列から読み込む'), area,
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'bp-io-ok', onclick: () => {
          const bp = decodeBlueprint(area.value);
          if (!bp) { note.textContent = '読めない。書き出した文字列を最初から最後まで貼りつけろ。'; return; }
          l.unshift(bp); saveLibrary(l); sfx.ok();
          showLibrary();
          toast(`設計図「${bp.name}」を読み込んだ（${bp.stamps.length} 個）。`, 3000);
        } }, '読み込む'), note));
    }
    showSheet(h('header', {}, h('h2', {}, '設計図'), closeBtn()),
      h('p', { class: 'muted' }, '「範囲」で囲んでコピーし、「保存」したもの。この端末に残り、どのノートからも使える。名前はタップして書き換えられる。文字列にして人に渡すこともできる。'),
      h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'bp-import', onclick: () => showLibrary({ mode: 'in' }) }, '文字列から読み込む')),
      ioBox,
      l.length ? h('div', { class: 'menu' }, ...l.map((bp, i) => {
        const n = (f: (b: Stamp) => boolean) => bp.stamps.filter(f).length;
        return h('div', { class: 'row bp' },
          h('span', { class: 'stack' }, (() => { const inp = h('input', { class: 'bp-name', type: 'text', id: `bp-name-${i}`, value: bp.name, maxLength: 30, ariaLabel: '設計図の名前' }); inp.onchange = () => { bp.name = inp.value.trim().slice(0, 30) || bp.name; saveLibrary(l); }; return inp; })(), h('span', { class: 'muted' }, `装置 ${n((b) => BIG.includes(b.kind))}・ベルト類 ${n((b) => b.kind === 'belt' || b.kind === 'bridge' || b.kind === 'tunnel')}・ほか ${n((b) => !BIG.includes(b.kind) && b.kind !== 'belt' && b.kind !== 'bridge' && b.kind !== 'tunnel')}`)),
          h('button', { class: 'primary', type: 'button', id: `bp-use-${i}`, onclick: () => { blueprint = bp.stamps.map((b) => ({ ...b })); ghost = null; areaA = areaB = null; closeModal(); pick('area', true); } }, '使う'),
          h('button', { class: 'ghost', type: 'button', id: `bp-out-${i}`, onclick: () => showLibrary({ mode: 'out', text: encodeBlueprint(bp.name, bp.stamps) }) }, '書き出す'),
          h('button', { class: 'ghost warn', type: 'button', id: `bp-del-${i}`, onclick: () => { l.splice(i, 1); saveLibrary(l); showLibrary(); } }, '消す'));
      })) : h('p', {}, 'まだ保存した設計図はない。'));
  };
  $('area-lib').onclick = () => showLibrary();
  $('area-cancel').onclick = () => { blueprint = null; ghost = null; areaA = areaB = null; paintArea(); };
  $('area-put').onclick = () => { if (ghost) pasteAt(ghost[0], ghost[1]); };
  function pasteAt(x: number, y: number) {
    if (!blueprint) return;
    group = null;
    let ok = 0;
    // 大きい装置から先に置く（ベルトに場所を取られないように）
    for (const b of [...blueprint].sort((p, q) => sizeOfKind(q.kind) - sizeOfKind(p.kind))) {
      if (doPlace(b.kind, x + b.dx, y + b.dy, b.dir)) continue;
      ok++;
      const placed = at(world, x + b.dx, y + b.dy)!;
      const r = recipeById(b.recipe);
      if (r && b.outOrder) { configure(placed, r, b.outOrder.filter((s) => s !== 'e')); placed.outOrder = [...b.outOrder]; placed.outBuf = b.outOrder.map(() => 0); if (b.outSlot) placed.outSlot = [...b.outSlot]; }
      placed.test = b.test;
      placed.sub = b.sub;
      if (b.kind === 'station') { placed.ch = b.ch ?? 1; placed.role = b.role ?? 'in'; }
    }
    if (ok < blueprint.length) toast(`${blueprint.length} 個のうち ${ok} 個を置いた。残りは場所がふさがっていた。`); else toast(`${ok} 個を置いた。続けて別の場所にも置ける。`, 1800);
    ok ? sfx.place() : sfx.bad();
    ghost = null;
    paintArea();
  }

  // ---- 課題：本編とは別の小さな工場を開く ----
  const resetView = () => {
    undo.length = 0; group = null; selected = null; undoBtn.disabled = true; shownGoal = ''; clone = null; hover = null;
    setFloor(0); paintFloor();
    cam.x = hubCX; cam.y = hubCY; cam.z = nearZoom(); camTo = null;
    refreshTools(false);
    pick('pan');
  };
  function enterCase(c: Case) {
    const home = sandbox ? sandbox.home : world;
    save();
    const w = c.build((Date.now() % 9973) + 1);
    // 覚えたこと・間違いの記録・研究は、本編と同じものを使う
    w.learned = home.learned; w.srs = home.srs; w.mistakes = home.mistakes; w.agents = home.agents; w.research = home.research; w.discovered = home.discovered; w.solved = home.solved;
    sandbox = { c, home, done: false };
    world = w;
    speed = 1; paintSpeed();
    resetView();
    camTo = fitView();   // 課題の工場の全体が見えるところへ
    showCaseBrief();
  }
  function leaveCase() {
    if (!sandbox) return;
    world = sandbox.home;
    sandbox = null;
    speed = 1; paintSpeed();
    goalIco.hidden = false;
    resetView();
    save();
  }
  function showCases() {
    const done = (sandbox ? sandbox.home : world).cases;
    showSheet(h('header', {}, h('h2', {}, '課題'), closeBtn()),
      h('p', { class: 'muted' }, `自分の工場とは別に、小さな工場を 1 つ渡す。いつでもやめて戻れる。初めて解くと研究点 +${CASE_REWARD}。`),
      ...(['repair', 'limit', 'box'] as const).flatMap((k) => [
        h('h3', {}, CASE_KIND[k]),
        h('p', { class: 'muted' }, k === 'repair' ? '1 か所だけ誤った工場。止まり方や、出てくる物から、誤りを突き止めて直す。' : k === 'limit' ? '原料の数が決まっている。どちらが先に尽きるかを計算し、できる数を先に答える。数は毎回変わる。' : '封印された装置に入る物と、出てくる物の数だけから、中の反応を当てる。'),
        h('div', { class: 'menu' }, ...CASES.filter((c) => c.kind === k).map((c) => h('button', { class: 'ghost' + (done.includes(c.id) ? ' picked' : ''), type: 'button', id: `case-${c.id}`, onclick: () => enterCase(c) },
          h('b', {}, (done.includes(c.id) ? '✓ ' : '') + c.title)))),
      ]));
  }
  function showCaseBrief() {
    if (!sandbox) return;
    const c = sandbox.c;
    if (c.kind === 'limit' && !world.pred) { askPrediction(); return; }
    showSheet(h('header', {}, h('h2', {}, c.title), closeBtn()),
      h('p', {}, h('span', { class: 'pill' }, CASE_KIND[c.kind])),
      h('p', { class: 'qtext' }, c.brief),
      h('p', { class: 'status' }, c.check(world).text),
      h('div', { class: 'row' },
        h('button', { class: 'primary', type: 'button', id: 'case-go', onclick: closeModal }, '工場を見る'),
        h('button', { class: 'ghost', type: 'button', id: 'case-leave', onclick: () => { leaveCase(); closeModal(); } }, 'やめて、自分の工場に戻る')));
  }
  /** 限られた原料：できる数と、残る数を、動かす前に答えさせる */
  function askPrediction() {
    if (!sandbox) return;
    const c = sandbox.c, m = [...world.ents.values()].find((e) => e.recipe)!, r = recipeById(m.recipe)!, target = m.outOrder![0];
    const stock = [...world.ents.values()].filter((e) => e.kind === 'sampler');
    const vals = ['', ''];
    let active = 0;
    const slots = [0, 1].map((i) => h('button', { class: 'slot numslot', type: 'button', id: `pred-${i}`, onclick: () => { active = i; paint(); } }, ''));
    const paint = () => slots.forEach((el, i) => { el.textContent = vals[i] || '数を入れる'; el.classList.toggle('on', i === active); el.classList.toggle('empty', !vals[i]); });
    paint();
    showSheet(h('header', {}, h('h2', {}, c.title), h('button', { class: 'ghost', type: 'button', id: 'case-leave', onclick: () => { leaveCase(); closeModal(); } }, 'やめる')),
      h('p', {}, h('span', { class: 'pill' }, CASE_KIND[c.kind])),
      h('p', { class: 'eq' }, equationOf(r)),
      h('p', { class: 'qtext' }, `原料は ${stock.map((e) => `${label(e.sub!)} ${e.left} 個`).join('、')} しかない。`),
      h('div', { class: 'row' }, h('span', { class: 'tag wide' }, `${label(target)} は最大で`), slots[0], h('span', {}, '個できる')),
      h('div', { class: 'row' }, h('span', { class: 'tag wide' }, '反応せずに残る原料は、合わせて'), slots[1], h('span', {}, '個')),
      h('p', { class: 'muted' }, '紙に書いて計算しろ。答えると工場が動き、結果と照らし合わせる。'),
      numPad((k) => { vals[active] = typeNumber(vals[active], k).replace(/[-.]/g, '').slice(0, 4); paint(); }),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'pred-ok', onclick: () => {
        if (vals.some((v) => v === '')) { toast('2 つとも答えろ。', 1600); return; }
        world.pred = { out: Number(vals[0]), rest: Number(vals[1]) };
        speed = 4; paintSpeed();
        closeModal();
        toast('予想を受け取った。工場を動かす。', 2200);
      } }, '答えて、工場を動かす')));
  }
  function finishCase(st: CaseState) {
    if (!sandbox) return;
    const { c, home } = sandbox;
    sandbox.done = true;
    const first = st.ok && !home.cases.includes(c.id);
    if (first) { home.cases.push(c.id); home.points += CASE_REWARD; }
    if (st.ok) { stamp('解決'); sfx.goal(); } else sfx.bad();
    if (!st.ok) home.mistakes.push({ machine: 'calc', recipe: c.id, part: 'calc', t: Date.now() });
    save();
    showSheet(h('header', {}, h('h2', {}, st.ok ? '解決' : '予想が違った'), closeBtn()),
      h('p', { class: 'eq' }, c.title),
      h('p', { class: 'status' }, st.text),
      st.ok ? h('p', {}, first ? `研究点 +${CASE_REWARD}。` : 'この課題は前にも解いている。') : h('p', {}, '工場は計算どおりに動いた。予想のどこが違ったかを、下の解説で確かめろ。数を変えて、もう一度やれる。'),
      h('p', { class: 'note' }, c.note),
      h('div', { class: 'row' },
        !st.ok || c.kind === 'limit' ? h('button', { class: st.ok ? 'ghost' : 'primary', type: 'button', id: 'case-again', onclick: () => enterCase(c) }, '数を変えて、もう一度') : null,
        h('button', { class: 'ghost', type: 'button', id: 'case-list', onclick: () => { leaveCase(); showCases(); } }, '課題の一覧'),
        h('button', { class: st.ok ? 'primary' : 'ghost', type: 'button', id: 'case-home', onclick: () => { leaveCase(); closeModal(); } }, '自分の工場に戻る')));
  }
  /** 封印された装置：設定は見せず、入った数と出てきた数だけを見せる */
  function showSealed(e: Ent) {
    const r = recipeById(e.recipe)!, n = e.n || 0;
    showSheet(h('header', {}, h('h2', {}, '封印された装置'), closeBtn()),
      h('p', {}, '中の設定は見えない。これまでに入った数と、出てきた数は次のとおり。'),
      h('h3', {}, '入った数'),
      h('div', { class: 'chips' }, ...r.inputs.map(([id, k]) => { const b = chip(id); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${n * k}`)); return b; })),
      h('h3', {}, '出てきた数'),
      h('div', { class: 'chips' }, ...r.outputs.filter(([id]) => id !== 'e').map(([id, k]) => { const b = chip(id); b.disabled = true; b.append(h('span', { class: 'muted' }, `×${n * k}（${appearance(id) || '—'}）`)); return b; })),
      h('p', { class: 'muted' }, '数の比から反応式を書け。条件や触媒は、出てくる物から考える。わかったら、空の装置に同じ反応を設定しろ。'));
  }

  // ---- 花火：章を終えたら、納品所が飲み込んだ元素の炎色で上げる ----
  const fireworks = (count: number) => launchFireworks(flamesFed(world).map((sym) => ({ sym, ...FLAMES[sym] })), count);
  // 確認用：アドレスに ?fw を付けると、花火を上げる関数と、いまの視点を外から読める
  if (typeof location !== 'undefined' && location.search.includes('fw')) Object.assign(window, { __fireworks: fireworks, __cam: cam });

  // ---- アルバム：指令を達成した瞬間の工場を、上から撮って残す（章ごとに最新の 1 枚と、最初の 1 枚）----
  interface Photo { k: string; cap: string; d: string; done: number; ms: number }
  const albumKey = () => `chemyth-v2-album-${slot}`;
  const album = (): Photo[] => { try { return JSON.parse(localStorage.getItem(albumKey()) || '[]'); } catch { return []; } };
  const snap = (key: string, cap: string) => {
    try {
      const W = 560, H = 350, cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      draw(cvs.getContext('2d')!, W, H, world, fitView(W, H), performance.now() / 1000, 0, { floor: 0, tool: 'pan', selected: null });
      let list = album();
      const photo: Photo = { k: list.length ? key : 'first', cap, d: cvs.toDataURL('image/jpeg', 0.62), done: doneCount(world), ms: Math.round(world.playMs) };
      list = [...list.filter((p) => p.k !== photo.k), photo].slice(-26);
      // 保存先がいっぱいなら、古いものから減らして入れ直す
      for (let tries = 0; tries < 4; tries++) { try { localStorage.setItem(albumKey(), JSON.stringify(list)); break; } catch { list = [list[0], ...list.slice(Math.ceil(list.length / 2))].filter((p, i, a) => a.indexOf(p) === i); } }
    } catch { /* 撮れなくても遊べる */ }
  };
  const showAlbum = (big?: Photo) => {
    const list = album();
    if (big) {
      const img = h('img', { class: 'photo-big', src: big.d, alt: big.cap });
      showSheet(h('header', {}, h('h2', {}, 'アルバム'), h('button', { class: 'ghost', type: 'button', id: 'album-back', onclick: () => showAlbum() }, '戻る')), img, h('p', {}, big.cap), h('p', { class: 'muted' }, `達成 ${big.done} / ${TOTAL_GOALS}`));
      return;
    }
    showSheet(h('header', {}, h('h2', {}, 'アルバム'), closeBtn()),
      h('p', { class: 'muted' }, '指令を達成した瞬間の工場を、上から撮ったもの。最初の 1 枚と、章ごとに最新の 1 枚が残る。この端末にだけ保存される。'),
      list.length ? h('div', { class: 'album' }, ...list.map((ph, i) => { const fig = h('button', { class: 'photo', type: 'button', id: `photo-${i}`, onclick: () => showAlbum(ph) }, h('img', { src: ph.d, alt: ph.cap }), h('span', {}, ph.cap)); return fig; }))
        : h('p', {}, 'まだ写真はない。指令を 1 つ達成すると、最初の 1 枚が撮られる。'));
  };

  // ---- 指令の表示 ----
  const goalIco = $<HTMLCanvasElement>('goal-ico');
  let rateTick = -99;
  const hud = () => {
    if (sandbox) {
      // 課題のあいだは、指令の札に課題の内容を出す
      const st = sandbox.c.check(world);
      $('pts').textContent = String(sandbox.home.points);
      $('goal-step').textContent = `課題：${CASE_KIND[sandbox.c.kind]}`;
      $('goal-name').textContent = sandbox.c.title;
      $('goal-hint').textContent = 'ここを押すと、課題の説明が出る。';
      $('goal-count').textContent = '';
      $('goal-rate').textContent = st.text;
      $('goal-bar').style.width = st.done ? '100%' : '0%';
      goalIco.hidden = true;
      shownGoal = '';
      return;
    }
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
      $('goal-name').textContent = g?.rate ? `${label(g.s)} を 毎分 ${g.rate} 個で ${g.n} 秒`
        : g?.also ? `${[g.s, ...g.also].map((x) => label(x)).join('・')} を各 ${requiredOf(world, g)} 個`
        : g && s2 ? `${s2.name}${s2.formula && !s2.mask ? ' ' + label(g.s) : g.s === 'e' ? ' e⁻' : ''} を ${requiredOf(world, g)} 個` : doneCount(world) >= TOTAL_GOALS ? 'すべての指令を終えた' : 'この章は完了。ここを押して別の章へ';
      $('goal-hint').textContent = g ? g.hint : '記録を開いて、間違えた反応を紙に書き出して確認しろ。';
    }
    $('goal-count').textContent = g?.rate ? `毎分 ${Math.round(goalRate(world))} / ${g.rate}` : g ? `${goalCount(world)} / ${requiredOf(world, g)}` : '';
    // 納品の速さと、終わるまでの見込み。1 秒に 2 回だけ計算する
    // （早送りでは 1 コマに何 tick も進むので、割り切れる tick を待つと表示が止まる。前回からの経過で見る）
    if (g && Math.abs(world.tick - rateTick) >= 30) {
      rateTick = world.tick;
      const f = flowStats(world);
      const each = g.rate ? `速さを保てた時間 ${goalCount(world)} / ${g.n} 秒（下回ると戻る）　` : g.also ? [g.s, ...g.also].map((x) => `${label(x)} ${world.multi[x] || 0}`).join('　') + '　' : '';
      $('goal-rate').textContent = g.rate ? each.trim() : each || f.goalPerMin > 0 ? each + (f.goalPerMin <= 0 ? '' : `${f.goalPerMin.toFixed(1)} 個/分${f.etaSec !== null && f.etaSec > 0 ? `　あと約 ${f.etaSec >= 90 ? `${Math.round(f.etaSec / 60)} 分` : `${Math.max(5, Math.round(f.etaSec / 5) * 5)} 秒`}` : ''}`) : '';
    } else if (!g) $('goal-rate').textContent = '';
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
      lastSeen = world.seen; lastRes = world.research.length; floor = 0; paintFloor();
      pick('pan');
      began = performance.now(); warned = false;
      save();
      if (!json) showHelp(true);
    },
  });
  const toTitle = () => { leaveCase(); save(); slot = 0; selected = null; app.classList.add('in-title'); title.show(); };

  // ---- ループ ----
  let began = performance.now(), warned = false, prev = performance.now(), acc = 0, sinceSave = 0, lastSeen = -1, lastRes = 0, musicAt = 0, chapterBefore = 0, slowFrames = 0;
  const STEP = 1 / 60;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (slot) {
      // 「限られた原料」は、予想を答えるまで動かさない
      if (modal.hidden && !(sandbox?.c.kind === 'limit' && !world.pred)) {
        acc += dt * speed;
        let guard = 0;
        const s0 = PERF ? performance.now() : 0;
        while (acc >= STEP && guard++ < 24) { step(world, STEP); acc -= STEP; }
        if (PERF) PERF.step.push(performance.now() - s0);
        if (acc > STEP * 4) acc = 0;
      }
      if (sandbox && !sandbox.done && modal.hidden) { const st = sandbox.c.check(world); if (st.done) finishCase(st); }
      if (!world.events.length) chapterBefore = world.chapter;
      for (const ev of world.events.splice(0)) {
        if (sandbox) continue;   // 課題の工場の出来事は、本編の進み具合に数えない
        if (ev === 'goal-done' || ev === 'chapter-done') {
          // 操業評価：指令を終えた時点の納品の速さ
          const gr = world.lastGrade;
          world.lastGrade = undefined;
          if (ev === 'goal-done') {
            stamp(gr ? `評価 ${gr.g}` : '納品済');
            toast(gr ? `納品完了。研究点 +30。操業評価 ${gr.g}（毎分 ${gr.rate.toFixed(1)} 個）${gr.bonus ? `で +${gr.bonus}` : '。毎分 6 個以上で B、15 個で A、30 個で S'}。` : '納品完了。研究点 +30。次の指令が出た。', 4500);
            sfx.goal(); refreshTools(true);
          }
        }
        if (ev.startsWith('fed:')) {
          // 納品所が新しい元素を飲み込んだ
          const [, el, tier] = ev.split(':');
          const n = ELEMENTS.filter((x) => fedTier(world, x.sym) >= 1).length;
          toast(tier === '1' ? `納品所が ${el} を飲み込んだ（${n} / ${ELEMENTS.length} 元素）。研究点 +10。` : `納品所が ${el} をさらに欲しがっている（段階 ${tier}）。研究点 +${tier === '2' ? 30 : 100}。`, 3200);
        }
        if (ev === 'fed-all') { stamp('全元素'); toast('納品所が全 ' + ELEMENTS.length + ' 元素を飲み込んだ。研究点 +300。', 7000); sfx.goal(); }
        if (ev === 'hub-grow') { toast(`納品所が ${world.hubSize}×${world.hubSize} に広がった。重なった設備は撤去され、求められる数も増える。`, 6000); selected = null; }
        if (ev === 'goal-done' || ev === 'chapter-done' || ev === 'all-done') void submitScore(world);
        if (ev === 'goal-done' || ev === 'chapter-done' || ev === 'all-done') snap(`c${chapterBefore}`, `${CHAPTERS[chapterBefore].name}　${world.progress[chapterBefore]} / ${CHAPTERS[chapterBefore].goals.length}`);
        if (ev === 'chapter-done') {
          stamp('修了'); sfx.goal(); refreshTools(true);
          const fl = flamesFed(world);
          toast(`章を終えた。${CHAPTERS[world.chapter].name} へ進む。${fl.length ? `花火の色は、納品所が飲み込んだ ${fl.join('・')} の炎色反応。` : '炎色反応を示す元素（Na・K・Ca・Ba・Cu）を納めると、花火に色がつく。'}`, 7000);
          fireworks(12 + fl.length * 2);
        }
        if (ev === 'all-done') fireworks(36);
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
      if (lastRes !== world.research.length) { lastRes = world.research.length; refreshTools(true); paintOpts(); paintFloor(); }
      const d0 = PERF ? performance.now() : 0;
      const fx = fxOn();
      if (fx) {
        // 光の層は黒地に加算、効果の層は黒地（何もない所は効果なし）
        for (const c2 of [glowCtx, maskCtx]) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalCompositeOperation = 'source-over'; c2.globalAlpha = 1; c2.fillStyle = '#000'; c2.fillRect(0, 0, glowCv.width, glowCv.height); c2.setTransform(FX_SCALE, 0, 0, FX_SCALE, 0, 0); c2.globalCompositeOperation = 'lighter'; }
      }
      draw(ctx, cw, ch, world, cam, now / 1000, dt, { fx: fx ? { glow: glowCtx, mask: maskCtx } : null, floor, tool, selected, stats: overlay, area: tool === 'area' ? areaRect() : null, ghost: tool === 'area' ? ghostCells() : toolGhost() });
      drawFireworks(ctx, cw, ch, dt, fx ? glowCtx : null);
      if (fx) {
        post!.render(cv, glowCv, maskCv, { ...POST_PRESETS[palette().key], time: now / 1000 });
        // 遅い端末では、自動で標準の画質に戻す（3 秒ほど、1 コマ 45 ms を超え続けたら）
        slowFrames = dt > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
        if (slowFrames > 70 && !KEEP_GFX) { gfxHigh = false; applyGfx(); store.setMeta({ gfx: 'plain' }); toast('動きが重いので、画質を標準に切り替えた。メニューの「画質」で戻せる。', 5000); }
      }
      if (PERF) { PERF.draw.push(performance.now() - d0); if (PERF.draw.length > 600) { PERF.draw.shift(); PERF.step.shift(); } }
      hud();
    }
    placeAct();
    // 背景音楽：工場の画面でだけ鳴らす。動いている装置が多いほど、音が増える
    if (now - musicAt > 250) {
      musicAt = now;
      let busy = 0, all = 0;
      if (slot) for (const e of world.ents.values()) if (e.recipe) { all++; if (e.busy) busy++; }
      musicTick(slot !== 0 && !document.hidden, all ? Math.min(1, (busy / all) * 0.6 + Math.min(1, all / 30) * 0.4) : 0);
    }
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
