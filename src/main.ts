import { CHAPTERS, TOTAL_GOALS } from './content/goals';
import { RESEARCH } from './content/research';
import { HUB_CENTER, LAND, ZONES, hubRect, resourceAt, zoneAt, zoneSpots } from './content/map';
import { ELEMENTS } from './content/elements';
import { MACHINES } from './content/machines';
import { label, sub } from './content/substances';
import { moveEnts, moveRails, researchBlock, UPGRADE_COST, signalOn, stationCap, TANK_CAP, type Item, relearnReady, MOVERS, JAM_SEC, machineState, freeLine, lineNo, LINE_MAX, BIG, FEED_TIERS, flamesFed, addRail, removeRail, setRailMask, stationRoutes, FLOOR_DY, floorOf, groundY, has, liftPartner, footprint, inDoors, maxLanes, mergeDirs, slotCount, slotPort, at, autoDir, beltSpeed, configure, currentGoal, extractInterval, fedTier, flowStats, goalRate, deserialize, doneCount, fitAnchor, goalCount, requiredOf, isMachine, newWorld, place, remove, restore, serialize, sizeOf, step, toolUnlocked, type Dir, type Ent, type Kind, type World } from './engine/world';
import { productsOf, recipeById } from './content/recipes';
import { about, chip, diagram, openConfig } from './ui/config';
import { $, h } from './ui/dom';
import { attachInput, Z_MAX, Z_MIN, Z_MIN_3D, type InputHandlers } from './ui/input';
import { FAR_Z } from './ui/far';
import { numPad, typeNumber, reviewCount, showAnalyzer, showBook, showChapters, showDepot, showLog, showPassages, showSampler, showTestOut, showPhoresis, showSettler, showSignal, showStation, showTank, showSyllabus, showUpgrades, type PanelCtx } from './ui/panels';
import { showDrills, showEssays, showStructure } from './ui/practice';
import { burst, draw, setCalm, type Camera } from './ui/render';
import { applyPrefs, buzz, onPrefs, prefs, setPrefs, type Prefs } from './ui/prefs';
import { lanePaths, type LaneTile } from './engine/lanes';
import { CASES, CASE_KIND, CASE_REWARD, limitStock, type Case, type CaseState } from './engine/cases';
import { appearance, equationOf } from './content/looks';
import { isSep, sepSlots } from './content/sep';
import { showMock } from './ui/mock';
import { drawFireworks, fireworksActive, launchFireworks } from './ui/fireworks';
import { PLAIN_LOOK, POST_PRESETS, createPost, type Post } from './ui/gl';
import { TOP_H, camera3, heightOf, pickTile, planeSize } from './ui/three';
import { palette } from './ui/theme';
import { FLAMES } from './content/looks';
import { decodeBlueprint, encodeBlueprint, type Stamp } from './engine/blueprint';
import { showStats, type StatsCtx } from './ui/stats';
import { paintPts, showAchievements, statsTick } from './ui/achieve';
import { showChain } from './ui/chain';
import { showGoalLog } from './ui/goals';
import { setSound, setVolume, sfx, soundOn, unlockAudio } from './ui/sound';
import { musicOn, musicTick, setMusic, setMusicVolume } from './ui/music';
import { fmtDate, fmtTime, initTitle, skinButtons, slotName, store, themeButtons } from './ui/title';
import { SLEEP_DEFAULT, duskOf, eveningWindow, hhmm, isClosed, minutesToBed, morningDue, nightDone, nightSetIds, windDown, type SleepCfg } from './engine/sleep';
import { capByExams, dayKey } from './engine/fsrs';
import { buildQueue, partnerOf, quizFor } from './engine/quiz';
import { addPlayTime, canTestOut } from './engine/pace';
import { DAILY_GOAL, daysToExam, streakOf, todayCount } from './engine/habit';
import { showReview, renderQuiz, calibLine, quizKey } from './ui/review';
import { showWeek, todayExtras } from './ui/learn2';
import { logNight } from './engine/learn';
import { conflictSlots, flushAccount, initAccount, onAccountChange, syncState } from './ui/account';
import { applySkin, applyTheme } from './ui/theme';
import { showRanking, submitScore } from './ui/ranking';
import { drawToken, elementIcon } from './ui/token';
import { autoOpen, breakReminder, dataExtra, helpExtra, initSettings2, menuExtra, prefExtras, prefRow, started } from './ui/settings2';
import { freeSpace, putAlbum } from './ui/slots2';
import { initBuild2 } from './ui/build2';

type Placeable = Exclude<Kind, 'hub' | 'part'>;
type Tool = 'pan' | 'erase' | 'area' | 'rail' | 'route' | Placeable;
/** 範囲コピーした設計図。左上からのずれで持つ */
type Op = { t: 'add'; x: number; y: number } | { t: 'del'; ent: Ent } | { t: 'dir'; x: number; y: number; dir: Dir } | { t: 'rails'; snap: [string, number | undefined][] } | { t: 'ch'; x: number; y: number; ch: number };
const BUILD: Placeable[] = ['belt', 'bridge', 'tunnel', 'lift', 'splitter', 'analyzer', 'sensor', 'gate', 'station', 'extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'collector', 'settler', 'funnel', 'phoresis', 'sampler', 'depot', 'tank', 'vent'];
/** 道具の分類。道具が多いので、棚を分けて出す */
const GROUPS: { id: string; name: string; tools: Tool[] }[] = [
  { id: 'move', name: '運ぶ', tools: ['pan', 'belt', 'route', 'bridge', 'tunnel', 'lift', 'splitter', 'analyzer', 'sensor', 'gate', 'station', 'rail'] },
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
  { id: 'route', glyph: '道', name: '自動ベルト', need: {}, color: '#5b7a3a', tip: '始まりと終わりをタップすると、空いたマスを通る最短の道にベルトを敷く。始まりに装置を選べばその出口から、終わりに装置を選べばそこへ流し込む向きで敷く。まっすぐのベルトは立体交差で横切る。' },
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
  /** ずらしている最中：つかんだマス（gx, gy）からの移動量。arm は「ずらす」ボタンを押して、行き先のタップを待っている設備 */
  let moving: { es: Ent[]; gx: number; gy: number; dx: number; dy: number; area: boolean } | null = null, moveArm: Ent | null = null;
  /** 置くときの向き。null は自動（流れ込みに合わせるか、納品所の方角） */
  let placeDir: Dir | null = null;
  /** ベルトをまとめて引く本数と、いまのなぞり書きの道筋・敷いたマス */
  let lanes = 1, lanePath: [number, number][] = [];
  const laneLaid = new Set<string>();
  /** 設計図を置こうとしている場所（左上のマス） */
  let ghost: [number, number] | null = null;
  /** いまのなぞり書きで敷いた線路のマス数 */
  let railsLaid = 0, beltRun = 0;
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
  let pf = prefs();
  onPrefs((p) => { pf = p; setVolume(p.sfxVol); setMusicVolume(p.musicVol); setCalm(p.calm); dusk = p.dusk ? duskOf(new Date()) : 0; paintMarks(); });
  // 背景音楽は、最初に画面に触れたときから鳴らせる（ブラウザの決まり）
  window.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  applyTheme(store.meta().theme ?? 'auto');
  applySkin(store.meta().skin ?? 'note');
  /** 課題を開いているあいだ、本編の工場は home に預けておく。world は課題の小さな工場 */
  let sandbox: { c: Case; home: World; done: boolean } | null = null;
  /** 時刻を「15:04」の形に */
  const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  let savedAt = 0, saveFailTold = 0;
  const save = () => {
    if (!slot) return;
    const json = serialize(sandbox ? sandbox.home : world);
    if (store.write(slot, json)) { savedAt = Date.now(); return; }
    // 入りきらなければ、アルバムの古い写真から減らして、もう一度（セーブを先に残す）
    for (let i = 0; i < 30 && freeSpace(); i++) if (store.write(slot, json)) { savedAt = Date.now(); toast('この端末の保存領域が足りないので、アルバムの古い写真を減らして保存した。', 6000); return; }
    // 保存できなかった（容量がいっぱい・プライベートモードなど）。1 分に 1 度だけ知らせる
    if (Date.now() - saveFailTold > 60000) { saveFailTold = Date.now(); toast('保存できなかった。この端末の保存領域がいっぱいかもしれない。メニューの「すべて書き出す」でファイルに控えておけ。', 9000); }
  };
  /** セーブ枠ごとに、見ていた場所を覚える（次に開いたとき、同じ場所から始める） */
  const saveCam = () => { if (slot && !sandbox) store.setMeta({ cams: { ...(store.meta().cams ?? {}), [String(slot)]: { x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), z: +cam.z.toFixed(2) } } }); };
  hot?.snapshot?.(() => (slot ? { slot, save: serialize(world) } : {}));

  // ---- WebGL の合成段：地図の絵（#cv）を素材にして、光・発光・ゆらぎをかけた結果を #gl に出す ----
  const glCv = $<HTMLCanvasElement>('gl');
  let post: Post | null = null, gfxHigh = store.meta().gfx !== 'plain';
  /** 高画質の段：2 最高（影・光の筋・レンズの筋・雲・水面・色調・立体の材質）、1 高（前の高画質）。保存は 'high'＝最高、'mid'＝高 */
  let gfxTier: 1 | 2 = store.meta().gfx === 'mid' ? 1 : 2;
  /** 光の層と効果の層。画面の 1/3 の細かさで足りる（どうせぼかす） */
  const FX_SCALE = 1 / 3;
  const glowCv = document.createElement('canvas'), maskCv = document.createElement('canvas');
  const glowCtx = glowCv.getContext('2d')!, maskCtx = maskCv.getContext('2d')!;
  /** 高さの層（最高画質の、平らな表示）：地面 0.1、水 0、ベルト・装置・納品所ほど高い。影とくぼみの陰りを作る */
  const heightCv = document.createElement('canvas'), heightCtx = heightCv.getContext('2d')!;
  const fxOn = () => !!post && gfxHigh && !post.lost();
  // ---- 立体表示：地面の絵と、装置の天面の絵を別々に描き、WebGL で箱と影をつけて、傾いたカメラで見る ----
  let three = store.meta().view3d === 'on';
  const threeOn = () => three && fxOn();
  /** 地面の層と天面の層（画面より広い範囲を描く。遠くは小さく見えるので、奥ほど広く要る）。大きさは gw × gh */
  const gndCv = document.createElement('canvas'), topCv = document.createElement('canvas');
  const gndCtx = gndCv.getContext('2d')!, topCtx = topCv.getContext('2d')!;
  /** 画面にじかに描く光（花火） */
  const glowSCv = document.createElement('canvas'), glowSCtx = glowSCv.getContext('2d')!;
  let gw = 0, gh = 0, fxK = FX_SCALE;
  const boxes: number[] = [], slabs: number[] = [];
  let boxBuf = new Float32Array(8 * 256);
  const applyGfx = () => {
    if (gfxHigh && !post) { try { post = createPost(glCv); } catch { post = null; } if (!post) gfxHigh = false; }
    glCv.hidden = !fxOn();
    // 立体表示では、WebGL の絵が下、#cv はその上の透明な層（縁の道しるべと花火）になる
    if (threeOn()) { if (cv.previousElementSibling !== glCv) cv.before(glCv); } else if (glCv.previousElementSibling !== cv) cv.after(glCv);
    app.classList.toggle('three', threeOn());
  };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (threeOn() && cw > 0 && ch > 0) {
      // 層の絵は、画面より 5 割ほど広い。重くなりすぎないよう、細かさは 1.5 倍までにする
      const dg = Math.min(dpr, 1.5);
      [gw, gh] = planeSize(cw, ch);
      for (const c of [gndCv, topCv]) { c.width = Math.round(gw * dg); c.height = Math.round(gh * dg); }
      gndCtx.setTransform(dg, 0, 0, dg, 0, 0); topCtx.setTransform(dg, 0, 0, dg, 0, 0);
      for (const c of [glowCv, maskCv]) { c.width = Math.max(8, Math.round(gw * FX_SCALE)); c.height = Math.max(8, Math.round(gh * FX_SCALE)); }
      glowSCv.width = Math.max(8, Math.round(cw * FX_SCALE)); glowSCv.height = Math.max(8, Math.round(ch * FX_SCALE));
    } else {
      for (const c of [glowCv, maskCv, heightCv]) { c.width = Math.max(8, Math.round(cw * FX_SCALE)); c.height = Math.max(8, Math.round(ch * FX_SCALE)); }
    }
    fxK = FX_SCALE;
    post?.resize(cv.width, cv.height);
  };
  new ResizeObserver(resize).observe(cv);
  applyGfx();
  resize();
  const nearZoom = () => Math.max(40, Math.min(54, cw / 24));
  /** いま引ける限界。立体表示は、平らな表示ほど引けない */
  const zMin = () => (threeOn() ? Z_MIN_3D : Z_MIN);
  /** 建てたもの全体と、採取機を置いた資源地、いまの指令の資源地が収まる視野 */
  const fitView = (vw = cw, vh = ch - 150): Camera => {
    const hr = hubRect(world.hubSize);
    let x0 = hr.x, y0 = hr.y, x1 = hr.x + hr.s, y1 = hr.y + hr.s;
    const grow = (ax: number, ay: number, bx: number, by: number) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
    for (const e of world.ents.values()) {
      const gy = groundY(e.y);
      grow(e.x, gy, e.x + 1, gy + 1);
      if (e.kind === 'extractor' && !floorOf(e.y)) for (const s of zoneSpots(e.x - 6, gy - 6, e.x + 6, gy + 6)) if (Math.hypot(e.x + 0.5 - s.cx, gy + 0.5 - s.cy) <= s.r * 1.3 + 0.5) grow(s.cx - s.r * 1.3, s.cy - s.r * 1.3, s.cx + s.r * 1.3, s.cy + s.r * 1.3);
    }
    const gz = !sandbox ? currentGoal(world)?.zone : undefined, za = gz ? ZONES[gz as keyof typeof ZONES]?.at : undefined;
    if (za) grow(za[0] - za[2] * 1.3, za[1] - za[2] * 1.3, za[0] + za[2] * 1.3, za[1] + za[2] * 1.3);
    const w0 = Math.max(60, x1 - x0 + 16), h0 = Math.max(40, y1 - y0 + 16);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + (vh === ch - 150 ? 2 : 0), z: Math.max(zMin(), Math.min(nearZoom(), vw / w0, vh / h0)) };
  };

  // ---- トースト ----
  const toastEl = $('toast');
  let toastTimer = 0;
  /** 通知の履歴（直近 30 件。メニューの「通知の履歴」で見られる） */
  const toastLog: { t: number; msg: string }[] = [];
  let lastToast = '', toastN = 1;
  const toast = (msg: string, ms = 2600) => {
    if (!msg) return;
    // 同じ知らせが続いたら、新しく出さずに「×2」とまとめる
    if (msg === lastToast && !toastEl.hidden) toastN++;
    else { toastN = 1; lastToast = msg; toastLog.push({ t: Date.now(), msg }); if (toastLog.length > 30) toastLog.shift(); }
    toastEl.replaceChildren(msg, toastN > 1 ? h('span', { class: 'n' }, `×${toastN}`) : '');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    // 長い知らせは、読み終えられるだけ長く出す（1 文字 80 ms を目安。最長 9 秒）。押せば消える
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, Math.max(ms, Math.min(9000, 1000 + msg.length * 80)));
  };
  toastEl.addEventListener('click', () => { toastEl.hidden = true; clearTimeout(toastTimer); });
  const showNotes = () => showSheet(
    h('header', {}, h('h2', {}, '通知の履歴'), closeBtn()),
    toastLog.length ? h('ol', { class: 'notes' }, ...[...toastLog].reverse().map((n) => h('li', {}, h('span', { class: 'muted' }, `${new Date(n.t).getHours()}:${String(new Date(n.t).getMinutes()).padStart(2, '0')}　`), n.msg))) : h('p', { class: 'muted' }, 'まだ通知はない。'),
    h('p', { class: 'muted' }, '直近 30 件。この画面を閉じると残らない（ページを開き直すと消える）。'));

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
  const undo: Op[][] = [], redo: Op[][] = [];
  let group: Op[] | null = null;
  const undoBtn = $<HTMLButtonElement>('b-undo'), redoBtn = $<HTMLButtonElement>('b-redo');
  const OP_NAME = { add: '置いた', del: '消した', dir: '回した', rails: '線路', ch: '番号' } as const;
  /** 手の組の中身を短く言う（元に戻すボタンの説明に使う） */
  const describe = (g: Op[] | undefined) => {
    if (!g?.length) return '';
    const adds = g.filter((o) => o.t === 'add').length, dels = g.filter((o) => o.t === 'del').length;
    if (adds && dels && adds === dels) return `ずらした ${adds} 個`;
    const kinds = [...new Set(g.map((o) => o.t))];
    return kinds.map((k) => `${OP_NAME[k]} ${g.filter((o) => o.t === k).length}`).join('・');
  };
  const paintUndo = () => {
    undoBtn.disabled = undo.length === 0; redoBtn.hidden = redo.length === 0;
    undoBtn.title = undo.length ? `元に戻す：${describe(undo[undo.length - 1])}（Ctrl + Z、2 本指で軽くたたいても）` : '元に戻す';
    redoBtn.title = redo.length ? `やり直す：${describe(redo[redo.length - 1])}` : 'やり直す';
  };
  const record = (op: Op) => {
    if (!group) { group = []; undo.push(group); if (undo.length > 60) undo.shift(); }
    group.push(op);
    // 新しく手を加えたら、やり直しの分は捨てる
    redo.length = 0;
    paintUndo();
  };
  const clearUndo = () => { undo.length = 0; redo.length = 0; group = null; paintUndo(); };
  const doPlace = (kind: Placeable, x: number, y: number, dir: Dir): string | null => {
    if (b2.locked()) return b2.LOCKED;
    const err = place(world, kind, x, y, dir);
    if (!err) { record({ t: 'add', x, y }); const e = at(world, x, y); if (e) burst(e.x, e.y, sizeOf(e), 'place'); if (kind !== 'belt') buzz(8); }
    return err;
  };
  const doErase = (x: number, y: number): boolean => {
    if (b2.locked()) { b2.lockNote(); return false; }
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
    burst(e.x, e.y, sizeOf(e), 'erase');
    buzz(12);
    return remove(world, x, y);
  };
  const doTurn = (e: Ent, dir: Dir) => {
    if (e.dir === dir) return;
    if (b2.locked()) { b2.lockNote(); return; }
    record({ t: 'dir', x: e.x, y: e.y, dir: e.dir });
    e.dir = dir;
  };
  /**
   * 置いたものをずらす。ずらせたら true。元の設備を消した手と、新しく置いた手として 1 組に記録する（元に戻すと、元の場所に戻る）。
   * rect：範囲選択でずらすときの範囲。その中の線路も一緒にずらす
   */
  const doMove = (es: Ent[], dx: number, dy: number, quiet = false, rect?: [number, number, number, number] | null): boolean => {
    group = null;
    if (b2.locked()) { if (!quiet) b2.lockNote(); return false; }
    const r = moveEnts(world, es, dx, dy);
    if (!r.ok) { if (!quiet) { toast(r.why, 2200); sfx.bad(); buzz(30); } return false; }
    if (!r.added.length) return true;
    for (const e of r.removed) record({ t: 'del', ent: e });
    for (const e of r.added) record({ t: 'add', x: e.x, y: e.y });
    if (rect) { const snap = moveRails(world, rect, dx, dy); if (snap.length) record({ t: 'rails', snap }); }
    group = null;
    if (selected && r.removed.includes(selected)) selected = r.added[r.removed.indexOf(selected)];
    for (const e of r.added) burst(e.x, e.y, sizeOf(e), 'move');
    if (!quiet) { sfx.place(); buzz(12); }
    save();
    return true;
  };
  /** 手の組を逆からたどって打ち消し、打ち消した手を逆にした組（＝やり直すための組）を返す */
  const applyOps = (g: Op[]): Op[] => {
    const inv: Op[] = [];
    for (const op of [...g].reverse()) {
      if (op.t === 'add') {
        const e = at(world, op.x, op.y);
        if (!e || e.kind === 'hub') continue;
        // 昇降機は 2 つで 1 組。やり直すときに両方とも戻るよう、相方も覚える
        const p = e.kind === 'lift' ? liftPartner(world, e) : null;
        inv.push({ t: 'del', ent: e });
        if (p) inv.push({ t: 'del', ent: p });
        remove(world, op.x, op.y);
      } else if (op.t === 'del') {
        if (restore(world, op.ent)) inv.push({ t: 'add', x: op.ent.x, y: op.ent.y });
      } else if (op.t === 'rails') {
        inv.push({ t: 'rails', snap: op.snap.map(([k]) => [k, world.rails.get(k)] as [string, number | undefined]) });
        for (const [k, m] of op.snap) setRailMask(world, k, m);
      } else if (op.t === 'ch') {
        const e = at(world, op.x, op.y);
        if (e) { inv.push({ t: 'ch', x: op.x, y: op.y, ch: e.ch ?? 1 }); e.ch = op.ch; e.tr = undefined; e.xtr = undefined; }
      } else {
        const e = at(world, op.x, op.y);
        if (e) { inv.push({ t: 'dir', x: op.x, y: op.y, dir: e.dir }); e.dir = op.dir; }
      }
    }
    return inv;
  };
  const doUndo = () => {
    if (b2.locked()) { b2.lockNote(); return; }
    const g = undo.pop();
    group = null;
    if (g) { selected = null; redo.push(applyOps(g)); toast(`ひとつ前に戻した（${describe(g)}）`, 1400); }
    paintUndo();
  };
  const doRedo = () => {
    if (b2.locked()) { b2.lockNote(); return; }
    const g = redo.pop();
    group = null;
    if (g) { selected = null; undo.push(applyOps(g)); toast('やり直した', 1200); }
    paintUndo();
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
    // 中に物をためた装置は、確かめてから消す
    erase: (e: Ent) => b2.askErase(e, () => { group = null; if (doErase(e.x, e.y)) sfx.erase(); group = null; }),
    memo: (e: Ent) => b2.memoRow(e),
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
      b2.memoRow(e) ?? '',
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
    h('p', { class: 'muted' }, '置いたものは、「見る」で長押ししてそのまま指を動かすと、ずらせる。選んだものの帯の ⇲ を押してから行き先をタップしてもよい。'),
    first ? null : h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'help-keys', onclick: () => showKeys() }, 'キーと指の操作の一覧'), h('button', { class: 'ghost', type: 'button', id: 'help-prefs', onclick: () => showPrefs() }, '設定'), ...helpExtra(false)),
    first ? h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'start', onclick: closeModal }, '始める'), ...helpExtra(true)) : null,
  );

  // ---- 画面写真（PNG）：次に描いたコマを、見えているとおりに保存する ----
  let shotPending = false;
  const download = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.append(a); a.click(); a.remove(); };
  type Saver = { save(r: { filename: string; data: Blob }): Promise<unknown> };
  /**
   * ファイルを渡す。claude.ai の中では、ふつうのダウンロードが止められているので、そこで用意された保存の確認（downloads）を使う。
   * それ以外（GitHub Pages や、保存した HTML）では、ふつうにダウンロードする。保存できたら true
   */
  const saveFile = async (name: string, data: Blob): Promise<boolean> => {
    const cl = (window as unknown as { claude?: { use?: (n: string) => Promise<Saver | null> } }).claude;
    const dl = cl?.use ? await cl.use('downloads').catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename: name, data }); return true; }
      catch (e) { const code = (e as { code?: string } | null)?.code; if (code !== 'declined') toast(code === 'rate_limited' ? '保存の確認がまだ開いている。少し待ってからもう一度。' : 'ここでは保存できなかった。', 3000); return false; }
    }
    const u = URL.createObjectURL(data);
    download(u, name);
    window.setTimeout(() => URL.revokeObjectURL(u), 5000);
    return true;
  };
  /** data: の URL（アルバムの写真）を、ファイルの中身にする */
  const dataUrlBlob = (d: string): Blob => { const [head, b64] = d.split(','), bin = atob(b64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return new Blob([buf], { type: head.slice(5).split(';')[0] }); };
  const stampName = (ext: string) => { const d = new Date(); return `chemyth-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.${ext}`; };
  const shot = () => { shotPending = true; };
  /** 描き終えたコマを 1 枚にまとめる（高画質・立体表示では、WebGL の絵の上に #cv を重ねる） */
  const takeShot = () => {
    shotPending = false;
    try {
      const out = document.createElement('canvas'), W = cv.width, Hh = cv.height;
      out.width = W; out.height = Hh;
      const o = out.getContext('2d')!;
      if (fxOn() && !glCv.hidden) o.drawImage(glCv, 0, 0, W, Hh);
      if (!fxOn() || threeOn()) o.drawImage(cv, 0, 0, W, Hh);
      out.toBlob((b) => { if (!b) { toast('写真を作れなかった。', 2000); return; } void saveFile(stampName('png'), b).then((ok) => { if (ok) toast('画面写真を保存した。', 2000); }); }, 'image/png');
    } catch { toast('この画面では写真を保存できない。', 2400); }
  };
  /** キーと指の操作の一覧 */
  const KEYS: [string, string][] = [
    ['矢印・W A S D', '地図を動かす'], ['+ / −', '拡大・縮小'], ['0', '全体を見る'], ['H', '納品所へ'], ['K・L', '覚えた場所 1・2 へ（Shift を押しながらで、いまの場所を覚える）'],
    ['V・B・X・G・T・U', '見る・ベルト・撤去・範囲・線路・自動ベルト'], ['Q', '直前の道具に戻る'], ['R', '選んだものを回す（設備の道具なら置く向き、範囲なら囲んだものを回す）'],
    ['Ctrl + D', '選んだ設備を、同じ設定で隣に複製（正面がふさがっていれば横）'], ['.', '最後に置いたものを、同じ向きでもう一度（マウスの下に置く）'],
    ['Shift + 矢印', '選んだもの（範囲選択なら囲んだもの）を 1 マスずらす'], ['Delete', '選んだものを消す'], ['Esc', 'やめる・選択を外す・窓を閉じる'],
    ['Space', '一時停止・再開'], ['F', '速さを切り替える'], ['J', '稼働率と詰まりを地図に重ねる'], ['M', '小地図を出す・隠す'], ['P', '画面写真を保存'], ['N', '通知の履歴'],
    ['Ctrl + Z / Ctrl + Y', '元に戻す・やり直す'], ['Ctrl + C', '選んだ設備・囲んだものをコピー'], ['Ctrl + S', 'いますぐ保存'],
    ['1〜4 → 1〜3 → Enter', '復習：選択肢 → 自信（確実・たぶん・勘）→ 次へ'], ['?', 'この一覧'],
  ];
  const GESTURES: [string, string][] = [
    ['長押し → そのまま動かす', '「見る」のとき、置いたものをつかんでずらす（設備の道具なら、置く場所を選ぶ）'], ['⇲（選んだものの帯）', '押してから行き先をタップすると、そこへずらす'],
    ['範囲の中から引く', '囲んだものをまとめてずらす（中の線路も一緒に）'], ['2 本指で軽くたたく', '元に戻す'], ['3 本指で軽くたたく', 'やり直す'], ['ダブルタップ', 'その場所へ寄る'],
    ['なぞって画面の端へ', '地図が自動で送られる（ベルト・ずらす・範囲選択）'], ['通知を押す', '通知を消す'], ['場所1・場所2 を長押し', 'いまの場所を覚える'],
    ['道具を長押し', '★ をつける（★ の棚に並ぶ）。もう一度長押しで外す'], ['設備の道具で、置けない所を長押し', '置けない理由が出る'],
  ];
  const showKeys = () => showSheet(
    h('header', {}, h('h2', {}, 'キーと指の操作'), closeBtn()),
    h('h3', {}, '指（タブレット・スマホ）'),
    h('table', { class: 'keys' }, ...GESTURES.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b)))),
    h('h3', {}, 'キーボード'),
    h('table', { class: 'keys' }, ...KEYS.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b)))));
  // ---- データ：すべてのセーブ枠を 1 つのファイルに書き出す・ファイルから読み込む ----
  const BACKUP = 'chemyth-v2-backup';
  let memBackup: string | null = null;
  const exportAll = () => {
    save(); saveCam();
    const slots: Record<string, string | null> = {};
    for (const n of [1, 2, 3]) slots[String(n)] = store.read(n);
    let blueprints: unknown = [];
    try { blueprints = JSON.parse(localStorage.getItem(BP_KEY) || '[]'); } catch { /* なくてよい */ }
    const blob = new Blob([JSON.stringify({ app: 'chemyth', v: 2, at: Date.now(), slots, blueprints })], { type: 'application/json' });
    void saveFile(stampName('json'), blob).then((ok) => { if (ok) toast('3 冊ぶんを 1 つのファイルに書き出した（アルバムの写真は含まない）。', 3000); });
  };
  const importAll = () => {
    const inp = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      f.text().then((text) => {
        let d: { app?: string; slots?: Record<string, string | null>; blueprints?: unknown };
        try { d = JSON.parse(text); } catch { toast('読めないファイルだった。', 3000); return; }
        if (d.app !== 'chemyth' || !d.slots) { toast('Chemyth の書き出したファイルではない。', 3000); return; }
        const ok = [1, 2, 3].filter((n) => { const j = d.slots![String(n)]; return typeof j === 'string' && !!deserialize(j); });
        if (!ok.length) { toast('読めるノートが入っていなかった。', 3000); return; }
        showSheet(h('header', {}, h('h2', {}, 'ファイルから読み込む'), closeBtn()),
          h('p', {}, `読み込むと、${ok.map((n) => slotName(n)).join('・')}が、ファイルの中身に置き換わる。`),
          h('p', { class: 'muted' }, '置き換える前の中身は控えておく。メニューの「データ」から、読み込む前に戻せる（控えは 1 回ぶん）。'),
          h('div', { class: 'row' },
            h('button', { class: 'primary', type: 'button', id: 'imp-go', onclick: () => {
              const prev: Record<string, string | null> = {};
              for (const n of [1, 2, 3]) prev[String(n)] = store.read(n);
              memBackup = JSON.stringify(prev);
              try { localStorage.setItem(BACKUP, memBackup); } catch { toast('控えはこの画面を閉じるまでしか残せない（保存領域がいっぱい）。', 4000); }
              // 遊んでいる枠を置き換えるなら、先にタイトルへ戻る（あとで上書きしないように）
              modal.hidden = true; sheet.replaceChildren();
              toTitle();
              for (const n of ok) store.write(n, d.slots![String(n)]!);
              if (Array.isArray(d.blueprints)) try { localStorage.setItem(BP_KEY, JSON.stringify(d.blueprints)); } catch { /* 設計図は入らなくてもよい */ }
              title.show();
              toast(`${ok.length} 冊を読み込んだ。`, 2600);
            } }, '置き換えて読み込む'),
            h('button', { class: 'ghost', type: 'button', onclick: closeModal }, 'やめる')));
      }, () => toast('ファイルを読めなかった。', 3000));
    };
    inp.click();
  };
  const backupText = () => { try { return localStorage.getItem(BACKUP) ?? memBackup; } catch { return memBackup; } };
  const restoreBackup = () => {
    const t = backupText();
    if (!t) return;
    let prev: Record<string, string | null>;
    try { prev = JSON.parse(t); } catch { return; }
    modal.hidden = true; sheet.replaceChildren();
    toTitle();
    for (const n of [1, 2, 3]) { const j = prev[String(n)]; if (typeof j === 'string') store.write(n, j); else store.erase(n); }
    try { localStorage.removeItem(BACKUP); } catch { /* 消せなくてもよい */ }
    memBackup = null;
    title.show();
    toast('読み込む前の状態に戻した。', 2600);
  };
  const showData = () => showSheet(
    h('header', {}, h('h2', {}, 'データ'), closeBtn()),
    h('p', { class: 'muted' }, `最後に保存：${savedAt ? hm(savedAt) : 'まだ'}。5 秒ごとと、出来事のたびに、この端末へ自動で保存している。`),
    h('div', { class: 'menu' },
      h('button', { class: 'ghost', type: 'button', id: 'd-export', onclick: exportAll }, 'すべて書き出す（3 冊ぶんを 1 つのファイルに）'),
      h('button', { class: 'ghost', type: 'button', id: 'd-import', onclick: importAll }, 'ファイルから読み込む'),
      backupText() ? h('button', { class: 'ghost warn', type: 'button', id: 'd-restore', onclick: restoreBackup }, '読み込む前に戻す') : null,
      h('button', { class: 'ghost', type: 'button', id: 'd-shot', onclick: () => { closeModal(); window.setTimeout(shot, 60); } }, '画面写真を保存（PNG）'), ...dataExtra()),
    h('p', { class: 'muted' }, '1 冊ずつの書き出し（文字列）は、タイトル画面の各ノートの「書き出す」から。アカウントにログインしていれば、端末どうしで自動でそろう。'));

  // ---- どこで作っている？：物質の名前・化学式から、作っている装置と採っている採取機を探して、そこへ移る ----
  const showWhere = () => {
    const by = new Map<string, Ent[]>();
    for (const e of world.ents.values()) {
      if (e.kind === 'part') continue;
      const r = recipeById(e.recipe);
      const outs = r ? productsOf(r).map(([s0]) => s0) : e.kind === 'extractor' ? [resourceAt(e.x, groundY(e.y))] : e.kind === 'tank' && e.sub ? [e.sub] : [];
      for (const s0 of outs) { if (!by.has(s0)) by.set(s0, []); by.get(s0)!.push(e); }
    }
    const rows = [...by].sort((a, b) => b[1].length - a[1].length);
    const q = h('input', { type: 'search', id: 'where-q', placeholder: '物質の名前か化学式（例：アンモニア、NH3）', autocomplete: 'off' }) as HTMLInputElement;
    const list = h('div', { class: 'menu', id: 'where-list' });
    const turn = new Map<string, number>();
    const norm = (t: string) => t.toLowerCase().replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080)).replace(/\s/g, '');
    const paint = () => {
      const k = norm(q.value);
      const hit = rows.filter(([s0]) => !k || norm(sub(s0).name).includes(k) || norm(label(s0)).includes(k) || norm(s0).includes(k));
      list.replaceChildren(...hit.slice(0, 40).map(([s0, es]) => h('button', { class: 'ghost', type: 'button', id: `where-${s0}`, onclick: () => {
        const i = turn.get(s0) ?? 0; turn.set(s0, i + 1);
        statsCtx().focus(es[i % es.length]);
        if (es.length > 1) toast(`${sub(s0).name}：${es.length} 台のうち ${(i % es.length) + 1} 台目。もう一度選ぶと次へ。`, 2600);
      } }, `${sub(s0).name} ${label(s0)}　${es.length} 台`)), hit.length ? '' : h('p', { class: 'muted' }, '工場の中に、その物質を作っている所はない。'));
    };
    q.oninput = paint;
    showSheet(h('header', {}, h('h2', {}, 'どこで作っている？'), closeBtn()), q, h('p', { class: 'muted' }, '選ぶと、作っている装置（採取機・タンク）へ移る。同じ物質を何台かで作っていれば、選ぶたびに次へ。'), list);
    paint();
    window.setTimeout(() => { if (matchMedia('(hover: hover)').matches) q.focus(); }, 50);
  };
  // ---- 設定：この端末の好み（振動・音量・動き・大きさ・札・休憩）と、覚える確率（セーブに入る） ----
  const showPrefs = () => {
    // 設定を変えて描き直すときは、見ていた位置のまま
    const keep = !modal.hidden && sheet.querySelector('.pref-row') ? sheet.scrollTop : 0;
    const p = prefs();
    const seg = <T,>(id: string, cur: T, opts: [T, string][], set: (v: T) => void) => h('span', { class: 'seg', role: 'group' }, ...opts.map(([v, name], i) => h('button', { type: 'button', id: `${id}-${i}`, class: cur === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); showPrefs(); } }, name)));
    const onoff = (id: string, cur: boolean, k: keyof Prefs, on = 'あり', off = 'なし') => seg(id, cur, [[true, on], [false, off]], (v) => setPrefs({ [k]: v } as Partial<Prefs>));
    const row = (what: string, note: string, ctl: HTMLElement) => h('div', { class: 'pref-row' }, h('div', { class: 'what' }, h('b', {}, what), note ? h('small', {}, note) : null), ctl);
    const range = (id: string, v: number, set: (v: number) => void) => { const r = h('input', { type: 'range', id, min: '0', max: '100', step: '5', value: String(Math.round(v * 100)) }) as HTMLInputElement; r.oninput = () => set(Number(r.value) / 100); r.onchange = () => sfx.tap(); return r; };
    const w0 = sandbox ? sandbox.home : world;
    showSheet(h('header', {}, h('h2', {}, '設定'), closeBtn()),
      h('h3', {}, '学習（セーブに入る。端末をまたいで同じ）'),
      row('覚えておく確率の目標', '復習の間隔は、思い出せる確率がこの値に下がる日を目安に決まる。上げるほど忘れにくいが、復習が増える。標準は 90 %。', seg('p-ret', w0.ret, [[0.85, '85 %'], [0.9, '90 %'], [0.95, '95 %']], (v) => { w0.ret = v; save(); })),
      h('h3', {}, 'この端末の好み'),
      prefRow('haptics', showPrefs),
      row('効果音の大きさ', '', range('p-sfx', p.sfxVol, (v) => setPrefs({ sfxVol: v }))),
      row('音楽の大きさ', '', range('p-music', p.musicVol, (v) => setPrefs({ musicVol: v }))),
      row('動きを減らす', '土ぼこり・花火・画面の滑らかな移動・窓の動きを控える。', onoff('p-calm', p.calm, 'calm', 'オン', 'オフ')),
      prefRow('text', showPrefs),
      row('ボタンを大きく', '上の帯・道具・選んだものの帯のボタンを大きくする。', onoff('p-btn', p.bigButtons, 'bigButtons', 'オン', 'オフ')),
      row('夕暮れ', '実際の時刻に合わせて、地図が暮れていく。', onoff('p-dusk', p.dusk, 'dusk')),
      row('指令のヒント', '自分で考えたいときは隠す。', onoff('p-hints', p.hints, 'hints', '出す', '隠す')),
      row('反応式の札', '「いつも」なら、うんと近づかなくても、見えている装置すべてに反応式を出す。', onoff('p-plates', p.plates, 'plates', 'いつも', '近づいたとき')),
      row('復習の札の位置', '', seg<'left' | 'right'>('p-side', p.cardSide, [['left', '左'], ['right', '右']], (v) => setPrefs({ cardSide: v }))),
      row('休憩の知らせ', '続けて遊んだ時間で知らせる。', seg<0 | 25 | 50>('p-break', p.breakMin, [[25, '25 分'], [50, '50 分'], [0, 'なし']], (v) => setPrefs({ breakMin: v }))),
      row('放置で省電力', '5 分さわらなければ、描く回数を減らして電池をもたせる（工場は動き続ける）。', onoff('p-saver', p.saver, 'saver')),
      row('小地図の大きさ', '', seg('p-mini', p.miniBig, [[false, '小'], [true, '大']], (v) => { setPrefs({ miniBig: v }); window.setTimeout(paintMini, 30); })),
      ...prefExtras(showPrefs),
      ...b2.prefRows(showPrefs));
    sheet.scrollTop = keep;
  };

  const showMenu = () => {
    const item = (id: string, text: string, go: () => void) => h('button', { class: 'ghost', type: 'button', id, onclick: go }, text);
    showSheet(
      h('header', {}, h('h2', {}, 'メニュー'), closeBtn()),
      h('h3', {}, '工場'),
      h('div', { class: 'menu' },
        item('m-chapters', '指令の一覧（章を切り替える）', () => showChapters(panel())),
        item('m-stats', '統計（納品の速さ・装置の稼働率・学習の進み）', () => showStats(statsCtx())),
        item('m-chain', '生産の流れ（いまの指令を原料までたどる）', () => showChain(statsCtx())),
        item('m-goals', '終えた指令（評価・かかった時間・見込み）', () => showGoalLog(panel())),
        item('m-where', 'どこで作っている？（物質から装置を探す）', () => showWhere()),
        ...b2.menuItems(item),
        item('m-album', 'アルバム（達成した瞬間の工場の写真）', () => showAlbum()),
        ...menuExtra('factory')),
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
        item('m-week', '週の報告（直近 7 日・試験までの復習の見込み）', () => showWeek(panel())),
        item('m-ach', '実績（工場・納品・指令・学習の節目）', () => showAchievements(panel())),
        item('m-rank', 'ランキング', () => showRanking(panel()))),
      h('h3', {}, '設定'),
      h('div', { class: 'menu' },
        h('div', { class: 'row' }, h('span', { class: 'muted' }, '見た目'), h('span', { class: 'seg' }, ...skinButtons(showMenu)), h('span', { class: 'seg' }, ...themeButtons(showMenu))),
        item('m-sleep', (() => { const c = sleepCfg(); return c.on ? `睡眠と試験日（就寝 ${hhmm(c.bed)}・起床 ${hhmm(c.wake)}、その間は工場を閉める）` : '睡眠と試験日（閉店：なし）'; })(), () => showSleepSettings()),
        item('m-sound', soundOn() ? '音：あり' : '音：なし', () => { setSound(!soundOn()); store.setMeta({ sound: soundOn() }); sfx.tap(); showMenu(); }),
        item('m-gfx', fxOn() ? (gfxTier === 2 ? '画質：最高（影・光の筋・水面・色調。押すと「高」）' : '画質：高（光・発光・ゆらぎ。押すと「標準」）') : post || store.meta().gfx !== 'plain' ? '画質：標準（軽い。押すと「最高」）' : '画質：標準（この端末では高画質を使えない）', () => {
          // 最高 → 高 → 標準 → 最高
          slowFrames = 0;
          if (fxOn() && gfxTier === 2) gfxTier = 1;
          else if (fxOn()) gfxHigh = false;
          else { gfxHigh = true; gfxTier = 2; }
          applyGfx(); resize();
          store.setMeta({ gfx: !gfxHigh ? 'plain' : gfxTier === 2 ? 'high' : 'mid' }); sfx.tap(); showMenu();
          if (gfxHigh && !fxOn()) toast('この端末では高画質を使えない。', 2600);
        }),
        item('m-mini', miniOn ? '全体の小地図：あり（右下。押すとその場所へ移る）' : '全体の小地図：なし', () => { miniOn = !miniOn; store.setMeta({ minimap: miniOn }); paintMini(); sfx.tap(); showMenu(); }),
        item('m-3d', threeOn() ? '立体表示：オン（傾いた視点・箱・影）' : '立体表示：オフ（真上からの平らな表示）', () => {
          three = !threeOn(); slowFrames = 0;
          if (three && !fxOn()) { gfxHigh = true; }
          applyGfx(); resize();
          if (three && !threeOn()) { three = false; toast('この端末では立体表示を使えない。', 2600); }
          store.setMeta({ view3d: three ? 'on' : 'off', ...(three ? { gfx: 'high' as const } : {}) }); sfx.tap(); placeAct(); showMenu();
        }),
        item('m-music', musicOn() ? '音楽：あり' : '音楽：なし', () => { setMusic(!musicOn()); store.setMeta({ music: musicOn() }); sfx.tap(); showMenu(); }),
        item('m-prefs', '設定（振動・音量・動き・文字とボタンの大きさ・札・休憩・覚える確率）', () => showPrefs()),
        item('m-data', 'データ（すべて書き出す・読み込む・画面写真）', () => showData()),
        item('m-notes', `通知の履歴（${toastLog.length} 件）`, () => showNotes()),
        item('m-keys', 'キーと指の操作', () => showKeys()),
        item('m-help', '遊び方', () => showHelp()),
        ...menuExtra('settings'),
        item('m-title', '保存してタイトルへ戻る（今日のまとめ）', () => { if (sandbox) { modal.hidden = true; sheet.replaceChildren(); toTitle(); } else showToday(); })),
      h('p', { class: 'muted' }, `${slotName(slot)}${(sandbox ? sandbox.home : world).fname ? `「${(sandbox ? sandbox.home : world).fname}」` : ''}。この端末に自動で保存している（最後に保存 ${savedAt ? hm(savedAt) : '—'}）。今日遊んだ時間 ${fmtTime(world.dayMs[dayKey(Date.now())] ?? 0)}。${(() => { const st = syncState(); return st.on ? `アカウント：${st.trouble ? `同期できていない（${st.trouble}）` : st.busy ? '同期中' : st.lastSync ? `${hm(st.lastSync)} に同期` : '同期待ち'}。` : ''; })()}`),
    );
  };

  $('b-menu').onclick = showMenu;
  $('b-up').onclick = () => showUpgrades(panel());
  $('b-book').onclick = () => showBook(panel());
  $('b-review').onclick = () => showReview(panel());
  // ---- 指令カード：たたむと細い帯。組む道具を持っている間は、自動でたたむ（押せば開く） ----
  const goalEl = $('goal');
  let foldPref = store.meta().goalFold === true, foldPeek = false;
  const paintFold = () => {
    const building = tool !== 'pan';
    if (!building) foldPeek = false;
    const folded = foldPref || (building && !foldPeek);
    goalEl.classList.toggle('folded', folded);
    $('goal-fold').setAttribute('aria-label', folded ? '指令を開く' : '指令をたたむ');
  };
  const setFold = (fold: boolean) => {
    if (tool !== 'pan') { foldPeek = !fold; if (!fold) foldPref = false; }
    else foldPref = fold;
    store.setMeta({ goalFold: foldPref });
    paintFold();
  };
  /** 夕暮れ：光のない所を沈め、光をよく広げる */
  /**
   * 太陽の向き（実際の時刻）：朝は右上（東）から、昼は左上、夕方は左（西）から差す。昼は影が短く、朝夕は長い。
   * 暗いテーマは、左上の灯りから（夜なので、影は控えめ）
   */
  const sunNow = (light: boolean): { sun: [number, number]; len: number } => {
    if (!light) return { sun: [-0.72, -0.69], len: 0.75 };
    const d = new Date(), f = Math.min(1, Math.max(0, (d.getHours() + d.getMinutes() / 60 - 6) / 12));
    const a = ((-60 - 120 * f) * Math.PI) / 180;
    return { sun: [Math.cos(a), Math.sin(a)], len: 0.55 + 0.9 * Math.pow(Math.abs(f - 0.5) * 2, 1.6) };
  };
  /** 毎コマの合成の設定：見た目ごとの設定に、夕暮れ・太陽・カメラ・画質の段・立体表示を重ねる */
  const duskPost = (p: (typeof POST_PRESETS)[string], time: number, d3 = false) => {
    const pal = palette(), light = pal.name === 'light', k = light ? dusk : dusk * 0.5;
    const ultra = gfxTier === 2, s0 = sunNow(light), dpr = cv.width / Math.max(1, cw);
    const hr = hubRect(world.hubSize), hx = hr.x + hr.s / 2, hy = hr.y + hr.s / 2;
    const base = ultra ? p : { ...p, ...PLAIN_LOOK };
    const paper = parseInt(pal.paper.slice(1), 16), pc: [number, number, number] = [((paper >> 16) & 255) / 255, ((paper >> 8) & 255) / 255, (paper & 255) / 255];
    return {
      ...base, time, ambient: p.ambient * (1 - 0.3 * k), spill: p.spill * (1 + 0.9 * k), bloom: p.bloom * (1 + 0.25 * k), vignette: Math.min(0.6, p.vignette + 0.15 * k),
      // 平らな表示の影は、夕暮れとともに薄れる（夜は灯りだけ）。立体表示では、箱が影を落とすので使わない
      shadow: d3 ? 0 : base.shadow * (1 - 0.8 * k), ao: d3 ? 0 : base.ao, bevel: d3 ? 0 : base.bevel,
      sun: s0.sun, sunLen: s0.len, tile: cam.z * fxK,
      godPos: [(hx - cam.x) / (cw / cam.z) + 0.5, 0.5 - (hy - cam.y - floor * 0) / (ch / cam.z)] as [number, number],
      // 雲の影は地図に貼りついている。引くと細かいしみに見えるので、1 マス 10 ピクセルより引いたら薄めて消す
      cloud: d3 ? 0 : base.cloud * (1 - k) * Math.min(1, Math.max(0, (cam.z - 6) / 4)),
      fog: d3 && ultra ? (light ? 0.34 : 0.42) : 0, fogColor: light ? pc : ([pc[0] * 1.4 + 0.03, pc[1] * 1.4 + 0.04, pc[2] * 1.4 + 0.07] as [number, number, number]), tilt: d3 && ultra && !pf.calm ? 0.8 : 0,
      cam: [cam.x, cam.y, cam.z * dpr] as [number, number, number],
    };
  };
  // ---- 睡眠：今夜の 10 問、今朝の 10 問、就寝から起床までの閉店、実際の時刻の夕暮れ ----
  const sleepCfg = (): SleepCfg => ({ ...SLEEP_DEFAULT, ...(store.meta().sleep ?? {}) });
  const closedNow = () => { const ext = store.meta().ext; if (ext && ext.until > Date.now()) return false; return isClosed(sleepCfg(), new Date()); };
  let dusk = prefs().dusk ? duskOf(new Date()) : 0;
  /** 問いを順に出す（今夜・今朝の 10 問）。終わったら finish(正解数) */
  const runSet = (title: string, lead: string, ids: string[], finish: (right: number) => void) => {
    let right = 0;
    const step = (i: number) => {
      const id = ids[i];
      if (!id) { finish(right); return; }
      const q = quizFor(world, id, Math.random, world.srs[id]?.full ? undefined : undefined);
      if (!q) { step(i + 1); return; }
      const body = h('div', { class: 'rv-body' });
      showSheet(h('header', {}, h('h2', {}, title), closeBtn()), h('p', { class: 'muted' }, `${lead}　${i + 1} / ${ids.length}`), body);
      renderQuiz(body, world, q, {
        // 正解の数は onDone で数える（組み直しも onDone を通る）
        onFull: (done) => { const r = recipeById(id.slice(2))!; showSheet(); openConfig(sheet, world, { kind: r.machine, x: -1, y: -1, dir: 0 }, sheetActions, { recipe: r, done: (ok) => { done(ok); step(i + 1); } }); },
        onDone: (r) => { if (r.ok && r.conf !== 'guess') right++; save(); },
        onUndo: (r) => { if (r.ok && r.conf !== 'guess') right--; save(); },
        next: { label: i + 1 < ids.length ? '次へ' : '結果', go: () => step(i + 1) },
      });
    };
    step(0);
  };
  const showNightSet = () => {
    const ids = nightSetIds(world, Date.now());
    if (!ids.length) { toast('今日覚えたもの・まちがえたものが、まだない。', 2400); return; }
    runSet('今夜の 10 問', '今日覚えたもの・まちがえたもの。明日の朝、同じ問いを出す', ids, (right) => {
      world.night = { day: dayKey(Date.now()), ids, got: right };
      logNight(world);
      save();
      showSheet(h('header', {}, h('h2', {}, '今夜の 10 問'), closeBtn()),
        h('p', { class: 'qtext' }, `${ids.length} 問中 ${right} 問正解。`),
        h('p', {}, `ここで閉じて寝ろ。眠っている間に、今日の分が固まる。明日の朝、最初に開いたときに同じ問いを出す。就寝は ${hhmm(sleepCfg().bed)}。`),
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'night-title', onclick: () => { closeModal(); toTitle(); } }, 'タイトルへ')));
    });
  };
  const showMorningSet = () => {
    const n = world.night;
    if (!n) return;
    runSet('今朝の 10 問', `昨夜の問い（昨夜は ${n.ids.length} 問中 ${n.got} 問正解）`, n.ids, (right) => {
      n.morning = right;
      logNight(world);
      save();
      const drop = n.got - right;
      showSheet(h('header', {}, h('h2', {}, '今朝の 10 問'), closeBtn()),
        h('p', { class: 'qtext' }, `昨夜 ${n.got} / ${n.ids.length} → 今朝 ${right} / ${n.ids.length}`),
        h('p', {}, drop > 0 ? `${drop} 問、ひと晩で抜けた。抜けたものは今日のうちに戻ってくる。` : '寝ている間に、抜けなかった。'),
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', onclick: closeModal }, '工場へ')));
    });
  };
  const closingEl = $('closing');
  const showClosing = () => {
    if (!closingEl.hidden) return;
    const cfg = sleepCfg(), ext = store.meta().ext, today = dayKey(Date.now());
    $('closing-text').textContent = `就寝（${hhmm(cfg.bed)}）を過ぎた。工場は ${hhmm(cfg.wake)} まで閉める。眠っている間に、今日覚えたことが固まる。${world.night && world.night.day === today ? '' : '今夜の 10 問はやっていない。明日、早めにやれ。'}`;
    ($('closing-extend') as HTMLButtonElement).hidden = !!ext && ext.day === today;
    closingEl.hidden = false; rvCard.hidden = true; modal.hidden = true;
    sfx.erase();
  };
  $('closing-title-btn').onclick = () => { closingEl.hidden = true; toTitle(); };
  $('closing-extend').onclick = () => { store.setMeta({ ext: { day: dayKey(Date.now()), until: Date.now() + 15 * 60000 } }); closingEl.hidden = true; toast('15 分だけ延長した。今夜はこれ以上延ばせない。', 4000); };
  $('b-night').onclick = () => { sfx.tap(); showNightSet(); };
  /** 1 秒に 1 回：夕暮れ、寝る前の知らせ、閉店 */
  let sleepTick = 0;
  const sleepCheck = () => {
    const now = new Date(), cfg = sleepCfg(), today = dayKey(now.getTime());
    dusk = prefs().dusk ? duskOf(now) : 0;
    const nb = $('b-night');
    nb.hidden = !(slot && !sandbox && eveningWindow(cfg, now) && !nightDone(world, now.getTime()) && nightSetIds(world, now.getTime()).length >= 3);
    if (!nb.hidden) { const m = minutesToBed(cfg, now); nb.textContent = `今夜の 10 問（就寝まで ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}）`; }
    if (!slot || sandbox) return;
    if (closedNow()) { showClosing(); return; }
    if (windDown(cfg, now) && store.meta().warned !== today) { store.setMeta({ warned: today }); toast(`就寝 ${hhmm(cfg.bed)} まで 1 時間を切った。今夜の 10 問をやって、画面を閉じろ。`, 8000); }
  };

  /** 睡眠と試験日の設定。閉店中は変えられない（寝る時刻を、その場で後ろへずらせないように） */
  const showSleepSettings = () => {
    const cfg = sleepCfg(), locked = closedNow() && cfg.on;
    const set = (patch: Partial<SleepCfg>) => { if (locked) return; store.setMeta({ sleep: { ...cfg, ...patch } }); sfx.tap(); showSleepSettings(); };
    const stepBtn = (id: string, text: string, f: () => void) => h('button', { class: 'ghost', type: 'button', id, disabled: locked, onclick: f }, text);
    const md = (t: number) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
    const moveExam = (i: number, days: number) => { world.exams[i] += days * 86400000; const t = Date.now(); for (const k of Object.keys(world.srs)) world.srs[k].due = capByExams(world.srs[k].due, t, world.exams, k); save(); sfx.tap(); showSleepSettings(); };
    showSheet(h('header', {}, h('h2', {}, '睡眠と試験日'), closeBtn()),
      h('p', { class: 'muted' }, '就寝の 4 時間前から 1 時間前までに「今夜の 10 問」が出る。翌朝、最初に開いたときに同じ問いを出す（覚えた夜と思い出す朝の間に、睡眠をはさむ）。就寝から起床までは工場を閉める。10 代に勧められている睡眠は 8〜10 時間。'),
      locked ? h('p', { class: 'feedback bad' }, '閉店中は変えられない。朝になってから変えろ。') : null,
      h('div', { class: 'row' }, h('span', {}, '閉店'), stepBtn('sl-on', cfg.on ? 'あり' : 'なし', () => set({ on: !cfg.on }))),
      h('div', { class: 'row' }, h('span', {}, `就寝 ${hhmm(cfg.bed)}`), stepBtn('sl-bed-dn', '− 15 分', () => set({ bed: (cfg.bed + 1440 - 15) % 1440 })), stepBtn('sl-bed-up', '＋ 15 分', () => set({ bed: (cfg.bed + 15) % 1440 }))),
      h('div', { class: 'row' }, h('span', {}, `起床 ${hhmm(cfg.wake)}`), stepBtn('sl-wake-dn', '− 15 分', () => set({ wake: (cfg.wake + 1440 - 15) % 1440 })), stepBtn('sl-wake-up', '＋ 15 分', () => set({ wake: (cfg.wake + 15) % 1440 }))),
      h('p', { class: 'muted', id: 'sl-hours' }, `睡眠 ${(((cfg.wake - cfg.bed + 1440) % 1440) / 60).toFixed(1)} 時間`),
      h('h3', {}, '試験日（復習の間隔は、これをまたがない）'),
      h('div', { class: 'row' }, h('span', {}, `共通テスト ${md(world.exams[0])}`), h('button', { class: 'ghost', type: 'button', id: 'ex0-dn', onclick: () => moveExam(0, -1) }, '− 1 日'), h('button', { class: 'ghost', type: 'button', id: 'ex0-up', onclick: () => moveExam(0, 1) }, '＋ 1 日')),
      h('div', { class: 'row' }, h('span', {}, `2 次 ${md(world.exams[1])}`), h('button', { class: 'ghost', type: 'button', id: 'ex1-dn', onclick: () => moveExam(1, -1) }, '− 1 日'), h('button', { class: 'ghost', type: 'button', id: 'ex1-up', onclick: () => moveExam(1, 1) }, '＋ 1 日')),
      h('p', { class: 'muted' }, '共通テストの 1/16 は大学入試センターの実施要項による。2 次の 2/25 は例年の日付で仮に置いてある。京大の募集要項が出たら合わせろ。'));
  };

  // ---- 工場の中の復習：手を止めて 8 秒たったときや、指令を終えたときに、期限の来た問いを 1 つだけ出す ----
  //      地図はそのまま触れる。まちがえた問いは今日のうちに戻り、取り違えやすい組は続けて相手を出す
  const rvCard = $('rvcard'), rvBody = $('rvcard-body'), rvLeft = $('rvcard-left');
  let lastInput = performance.now(), lastCardAt = -1e9, snoozeUntil = 0;
  const recentCards: string[] = [];
  document.addEventListener('pointerdown', () => { lastInput = performance.now(); }, true);
  document.addEventListener('keydown', () => { lastInput = performance.now(); }, true);
  const nextCardId = (): string | null => {
    const now = Date.now(), recent = recentCards.slice(-3);
    const ready = relearnReady(world, now).filter((id) => !recent.includes(id) && quizFor(world, id));
    if (ready.length) return ready[0];
    const last = recentCards[recentCards.length - 1];
    if (last) { const p = partnerOf(world, last, now, recentCards.slice(-8)); if (p && quizFor(world, p)) return p; }
    return buildQueue(world, now, 8, []).find((id) => !recent.includes(id) && quizFor(world, id)) ?? null;
  };
  const hideCard = () => { rvCard.hidden = true; lastCardAt = performance.now(); };
  const showCard = (id: string) => {
    const q = quizFor(world, id);
    if (!q) return;
    recentCards.push(id); if (recentCards.length > 30) recentCards.shift();
    rvCard.hidden = false;
    rvLeft.textContent = `残り ${reviewCount(world)}`;
    renderQuiz(rvBody, world, q, {
      compact: true,
      onFull: (done) => {
        const r = recipeById(id.slice(2))!;
        showSheet();
        openConfig(sheet, world, { kind: r.machine, x: -1, y: -1, dir: 0 }, sheetActions, { recipe: r, done: (ok) => { done(ok); closeModal(); } });
        sheet.prepend(h('p', { class: 'muted' }, '前回まちがえた反応：すべてを組み直す'));
      },
      onDone: () => { rvLeft.textContent = `残り ${reviewCount(world)}`; $('due').textContent = reviewCount(world) ? String(reviewCount(world)) : ''; save(); },
      onUndo: () => { rvLeft.textContent = `残り ${reviewCount(world)}`; $('due').textContent = reviewCount(world) ? String(reviewCount(world)) : ''; save(); },
      next: { label: '次の問い', go: () => { const n = nextCardId(); if (n) showCard(n); else { hideCard(); toast('いま出す問いは、もうない。', 1800); } } },
    });
  };
  $('rvcard-later').onclick = () => { snoozeUntil = performance.now() + 5 * 60000; hideCard(); sfx.tap(); };
  $('rvcard-close').onclick = () => { hideCard(); sfx.tap(); };
  const cardTick = (now: number) => {
    if (!slot || sandbox || !rvCard.hidden || !modal.hidden || now < snoozeUntil || closedNow()) return;
    if (now - lastInput < 8000 || now - lastCardAt < 45000) return;
    const id = nextCardId();
    if (id) showCard(id); else lastCardAt = now;
  };

  // ---- 全体の小地図：いまの階の設備を点で描き、止まった装置と詰まった荷に印をつける。押す・なぞると、その場所へ移る ----
  const mini = $<HTMLCanvasElement>('minimap'), mctx = mini.getContext('2d')!;
  let miniOn = store.meta().minimap !== false;
  let miniMap = { ox: 0, oy: 0, k: 1 };
  function paintMini() {
    if (!miniOn || !slot) { mini.hidden = true; app.classList.remove('mini-fit'); return; }
    const hr = hubRect(world.hubSize);
    let x0 = hr.x, y0 = hr.y, x1 = hr.x + hr.s, y1 = hr.y + hr.s;
    // いまの指令の資源地も入るように広げる（どこへ取りに行けばよいかがわかる）
    const gz = !sandbox ? currentGoal(world)?.zone : undefined, za = gz ? ZONES[gz as keyof typeof ZONES]?.at : undefined;
    if (za && !floor) { x0 = Math.min(x0, za[0] - za[2]); y0 = Math.min(y0, za[1] - za[2]); x1 = Math.max(x1, za[0] + za[2]); y1 = Math.max(y1, za[1] + za[2]); }
    const here: Ent[] = [];
    for (const e of world.ents.values()) {
      if (e.kind === 'part' || floorOf(e.y) !== floor) continue;
      here.push(e);
      const gy = groundY(e.y);
      if (e.x < x0) x0 = e.x; if (e.x + 1 > x1) x1 = e.x + 1; if (gy < y0) y0 = gy; if (gy + 1 > y1) y1 = gy + 1;
    }
    // 全体が画面に収まっているあいだは、小地図を隠す（地図そのものが全体図になっている）
    const vw = cw / 2 / cam.z, vh = ch / 2 / cam.z;
    const fits = !threeOn() && cam.x - vw <= x0 && cam.x + vw >= x1 && cam.y - vh <= y0 && cam.y + vh >= y1;
    mini.hidden = fits;
    app.classList.toggle('mini-fit', fits);
    if (fits || !mini.clientWidth) return;
    const W = mini.clientWidth, Hh = mini.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (mini.width !== Math.round(W * dpr)) { mini.width = Math.round(W * dpr); mini.height = Math.round(Hh * dpr); }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, W, Hh);
    const P = palette();
    x0 = Math.min(x0, cam.x - vw); y0 = Math.min(y0, cam.y - vh); x1 = Math.max(x1, cam.x + vw); y1 = Math.max(y1, cam.y + vh);
    x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
    const k = Math.min((W - 8) / (x1 - x0), (Hh - 8) / (y1 - y0)), ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (Hh - (y1 - y0) * k) / 2 - y0 * k;
    miniMap = { ox, oy, k };
    const px = (x: number) => ox + x * k, py = (y: number) => oy + y * k, dot = Math.max(1.2, k);
    const jams: [number, number][] = [], stops: Ent[] = [];
    for (const e of here) {
      const gy = groundY(e.y), sz = sizeOf(e);
      if (MOVERS.has(e.kind)) {
        mctx.fillStyle = P.soft; mctx.fillRect(px(e.x), py(gy), dot, dot);
        const it = e.item ?? e.items?.find((x) => !!x);
        if (it && (it.w || 0) > JAM_SEC) jams.push([e.x, gy]);
      } else {
        mctx.fillStyle = MACHINES[e.kind as keyof typeof MACHINES]?.color ?? P.ink;
        mctx.fillRect(px(e.x), py(gy), Math.max(2, sz * k), Math.max(2, sz * k));
        if ((isMachine(e.kind) && e.recipe && machineState(e) === 2 && (e.stuck || 0) > 2.5) || e.bad) stops.push(e);
      }
    }
    // 線路（1 階だけ）と駅
    if (!floor && world.rails.size) {
      mctx.fillStyle = P.ink; mctx.globalAlpha = 0.55;
      for (const kk of world.rails.keys()) { const [rx, ry] = kk.split(',').map(Number); mctx.fillRect(px(rx + 0.25), py(ry + 0.25), Math.max(1, k * 0.5), Math.max(1, k * 0.5)); }
      mctx.globalAlpha = 1;
    }
    mctx.strokeStyle = P.ink; mctx.lineWidth = 1.2;
    for (const e of here) if (e.kind === 'station') mctx.strokeRect(px(e.x) - 1, py(groundY(e.y)) - 1, Math.max(4, 2 * k) + 2, Math.max(4, 2 * k) + 2);
    // いまの指令の資源地：点線の輪
    if (za && !floor) {
      mctx.strokeStyle = P.red; mctx.lineWidth = 1.5; mctx.setLineDash([3, 2]);
      mctx.beginPath(); mctx.arc(px(za[0]), py(za[1]), Math.max(4, za[2] * k), 0, Math.PI * 2); mctx.stroke(); mctx.setLineDash([]);
    }
    mctx.fillStyle = P.red; mctx.fillRect(px(hr.x), py(hr.y), Math.max(3, hr.s * k), Math.max(3, hr.s * k));
    mctx.fillStyle = 'rgba(235,150,30,0.95)';
    for (const [x, y] of jams) { mctx.beginPath(); mctx.arc(px(x + 0.5), py(y + 0.5), 2.2, 0, Math.PI * 2); mctx.fill(); }
    mctx.strokeStyle = P.red; mctx.lineWidth = 2;
    for (const e of stops) { mctx.beginPath(); mctx.arc(px(e.x + sizeOf(e) / 2), py(groundY(e.y) + sizeOf(e) / 2), 4.5, 0, Math.PI * 2); mctx.stroke(); }
    // いま見ている範囲
    mctx.strokeStyle = P.ink; mctx.lineWidth = 1.5;
    mctx.strokeRect(px(cam.x - vw), py(cam.y - vh), vw * 2 * k, vh * 2 * k);
    mini.title = `止まった装置 ${stops.length} 台・詰まった荷 ${jams.length} か所`;
  }
  const miniGo = (ev: PointerEvent) => {
    const r = mini.getBoundingClientRect();
    camTo = { x: (ev.clientX - r.left - miniMap.ox) / miniMap.k, y: (ev.clientY - r.top - miniMap.oy) / miniMap.k, z: cam.z };
  };
  let miniDrag = false;
  mini.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); mini.setPointerCapture(ev.pointerId); miniDrag = true; miniGo(ev); sfx.tap(); });
  mini.addEventListener('pointermove', (ev) => { if (miniDrag) miniGo(ev); });
  mini.addEventListener('pointerup', () => { miniDrag = false; });
  mini.addEventListener('pointercancel', () => { miniDrag = false; });
  $('goal-fold').onclick = (ev) => { ev.stopPropagation(); sfx.tap(); setFold(!goalEl.classList.contains('folded')); };
  goalEl.onclick = () => {
    // たたんであるときは、押すと開く（章の一覧は、開いてからもう一度押す）
    if (goalEl.classList.contains('folded')) { sfx.tap(); setFold(false); return; }
    if (sandbox) showCaseBrief(); else showChapters(panel());
  };
  const speedBtn = $('b-speed');
  const paintSpeed = () => { speedBtn.textContent = speed === 0 ? '⏸ 停止中' : `▶ ×${speed}`; speedBtn.classList.toggle('hot', speed !== 1); $('paused').hidden = speed !== 0 || !slot; };
  speedBtn.onclick = () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; paintSpeed(); sfx.tap(); };
  undoBtn.onclick = doUndo;
  redoBtn.onclick = doRedo;
  paintUndo();
  // ---- キーボード（一覧は「?」キーか、遊び方の「キーと指の操作」） ----
  /** 直前の道具（Q で戻る） */
  let prevTool: Tool = 'pan', lastSpeed = 1;
  const KEY_TOOLS: Record<string, Tool> = { v: 'pan', b: 'belt', x: 'erase', g: 'area', t: 'rail', u: 'route' };
  const zoomBy = (f: number) => { const base = camTo ?? cam; camTo = { x: base.x, y: base.y, z: Math.min(Z_MAX, Math.max(zMin(), base.z * f)) }; };
  const togglePause = () => { if (speed === 0) speed = lastSpeed || 1; else { lastSpeed = speed; speed = 0; } paintSpeed(); sfx.tap(); };
  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (!slot || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.isComposing) return;
    // 復習の問い（窓でも札でも）：数字で選び、Enter で次へ
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && quizKey(ev.key)) { ev.preventDefault(); return; }
    const k = ev.key, low = k.length === 1 ? k.toLowerCase() : k;
    if (!modal.hidden) { if (k === 'Escape') { ev.preventDefault(); closeModal(); } return; }
    if (!closingEl.hidden) return;
    if (ev.ctrlKey || ev.metaKey) {
      // Ctrl（⌘）+ Z で元に戻す、Ctrl + Shift + Z か Ctrl + Y でやり直す。Ctrl + S で保存、Ctrl + C でコピー
      if (low === 'z' && !ev.shiftKey) { ev.preventDefault(); doUndo(); }
      else if ((low === 'z' && ev.shiftKey) || low === 'y') { ev.preventDefault(); doRedo(); }
      else if (low === 's') { ev.preventDefault(); save(); saveCam(); toast(savedAt ? '保存した。' : '保存できなかった。', 1200); }
      else if (low === 'c' && selected && copyable(selected)) { ev.preventDefault(); actCopy.click(); }
      else if (low === 'c' && tool === 'area' && !blueprint && inArea().length) { ev.preventDefault(); $('area-copy').click(); }
      else if (low === 'd' && selected) { ev.preventDefault(); b2.dup(); }
      return;
    }
    if (ev.altKey) return;
    const ARROW: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const WASD: Record<string, [number, number]> = { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
    const arrow = ARROW[k] ?? (!ev.shiftKey ? WASD[low] : undefined);
    if (arrow) {
      ev.preventDefault();
      // Shift + 矢印：選んだもの（範囲選択なら、囲んだもの）を 1 マスずらす
      if (ev.shiftKey) {
        if (tool === 'area' && !blueprint && inArea().length) { if (shiftArea(arrow[0], arrow[1], false)) sfx.tap(); }
        else if (selected && selected.kind !== 'hub') doMove([selected], arrow[0], arrow[1]);
        else toast('Shift + 矢印は、選んだもの（範囲選択なら囲んだもの）を 1 マスずらす。', 2200);
        return;
      }
      camTo = null; input.stop();
      const d = Math.max(1, 140 / cam.z);
      cam.x += arrow[0] * d; cam.y += arrow[1] * d;
      return;
    }
    switch (low) {
      case 'Escape':
        if (b2.esc()) break;
        if (moveArm) { moveArm = null; app.classList.remove('arming'); toast('ずらすのをやめた。', 1000); }
        else if (moving) moving = null;
        else if (clone) { clone = null; pick('pan'); toast('コピーをやめた。', 1000); }
        else if (tool === 'area' && (blueprint || areaRect())) { blueprint = null; ghost = null; areaA = areaB = null; paintArea(); }
        else if (selected) selected = null;
        else if (!rvCard.hidden) hideCard();
        else if (tool !== 'pan') pick('pan');
        break;
      case 'Delete': case 'Backspace':
        ev.preventDefault();
        if (selected && selected.kind !== 'hub') sheetActions.erase(selected);
        else if (tool === 'area' && !blueprint && inArea().length) $('area-del').click();
        break;
      case 'r':
        if (selected && selected.kind !== 'hub') { sheetActions.rotate(selected); sfx.tap(); }
        else if (tool === 'area' && blueprint) $('area-rot').click();
        else if (tool === 'area' && inArea().length) b2.rotArea();
        else if (isBuild(tool)) { placeDir = placeDir === null ? 0 : (((placeDir + 1) % 4) as Dir); paintOpts(); toast(`置く向き：${ARROWS[placeDir]}`, 900); }
        break;
      case ' ': ev.preventDefault(); togglePause(); break;
      case 'f': speedBtn.click(); break;
      case '+': case '=': case ';': zoomBy(1.25); break;
      case '-': case '_': zoomBy(0.8); break;
      case '0': camTo = fitView(); break;
      case 'h': camTo = { x: hubCX, y: hubCY, z: nearZoom() }; break;
      case 'q': if (!buttons.get(prevTool)?.hidden) { pick(prevTool); sfx.tap(); } break;
      case 'k': case 'l': if (ev.shiftKey) setMark(low === 'k' ? 0 : 1); else goMark(low === 'k' ? 0 : 1); break;
      case 'j': overlay = !overlay; store.setMeta({ overlay }); paintOverlay(); toast(overlay ? '稼働率と詰まりを地図に重ねた（J で消す）。' : '稼働率の表示を消した。', 1400); break;
      case 'm': miniOn = !miniOn; store.setMeta({ minimap: miniOn }); paintMini(); paintMarks(); break;
      case 'p': shot(); break;
      case 'n': showNotes(); break;
      case '?': case '/': showKeys(); break;
      case '.': b2.again(); break;
      default: { const t = KEY_TOOLS[low]; if (t && !buttons.get(t)?.hidden) { pick(t); sfx.tap(); } }
    }
  });
  // ---- 覚えた場所（2 か所）：K・L で移る、Shift + K・L で覚える。小地図の上のボタンは、押すと移り、長押しで覚える ----
  const marksOf = (): (Camera | null)[] => { const m = store.meta().marks?.[String(slot)]; return [m?.[0] ?? null, m?.[1] ?? null]; };
  const paintMarks = () => {
    const el = $('marks');
    el.hidden = !slot || !miniOn || !!sandbox;
    marksOf().forEach((m, i) => $(`mark-${i}`).classList.toggle('set', !!m));
  };
  function setMark(i: number) {
    const m = marksOf();
    m[i] = { x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), z: +cam.z.toFixed(2) };
    store.setMeta({ marks: { ...(store.meta().marks ?? {}), [String(slot)]: m } });
    toast(`いまの場所を「場所 ${i + 1}」に覚えた。${i ? 'L' : 'K'} キーか、小地図の上の「場所${i + 1}」で戻れる。`, 2600); sfx.ok(); paintMarks();
  }
  function goMark(i: number) {
    const m = marksOf()[i];
    if (!m) { toast(`「場所 ${i + 1}」はまだない。ボタンを長押しするか、Shift + ${i ? 'L' : 'K'} で、いまの場所を覚える。`, 2800); return; }
    camTo = { ...m }; sfx.tap();
  }
  for (const i of [0, 1]) {
    const b = $(`mark-${i}`);
    let timer = 0, long = false;
    b.addEventListener('pointerdown', () => { long = false; clearTimeout(timer); timer = window.setTimeout(() => { long = true; setMark(i); buzz(20); }, 550); });
    const cancel = () => clearTimeout(timer);
    b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
    b.addEventListener('click', () => { if (!long) goMark(i); });
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }
  $('mini-size').onclick = () => { setPrefs({ miniBig: !prefs().miniBig }); sfx.tap(); window.setTimeout(paintMini, 30); };

  // ---- 組み立ての道具（自動ベルト・回す・鏡・隣に複製・一時停止・ロック・旗・名前・つなぎ忘れ など）：src/ui/build2.ts ----
  const b2 = initBuild2({
    app, cam, world: () => world, slot: () => slot, floor: () => floor, tool: () => tool, pick: (t) => pick(t as Tool),
    placeDir: () => placeDir, setPlaceDir: (d) => { placeDir = d; paintOpts(); }, placeAt: (x, y) => placeAt(x, y),
    selected: () => selected, select: (e) => { selected = e; }, hover: () => hover, toast,
    place: (k, x, y, d) => doPlace(k as Placeable, x, y, d), erase: doErase, turn: doTurn, cut: () => { group = null; },
    recordMove: (removed, added, snap) => {
      group = null;
      for (const e of removed) record({ t: 'del', ent: e });
      for (const e of added) record({ t: 'add', x: e.x, y: e.y });
      if (snap.length) record({ t: 'rails', snap });
      group = null;
      if (selected && removed.includes(selected)) selected = added[removed.indexOf(selected)];
      for (const e of added) burst(e.x, e.y, sizeOf(e), 'move');
    },
    save, focus: (e) => statsCtx().focus(e), goTo: (x, y) => { setFloor(floorOf(y)); camTo = { x, y: groundY(y), z: Math.max(cam.z, nearZoom()) }; },
    show: showSheet, closeBtn, close: closeModal, zoom: (f) => zoomBy(f),
    clone: () => clone, cancelClone: () => { clone = null; pick('pan'); toast('コピーをやめた。', 1000); },
    blueprint: () => blueprint, setBlueprint: (bp) => { blueprint = bp; }, areaRect: () => areaRect(), setArea: (r) => { areaA = r ? [r[0], r[1]] : null; areaB = r ? [r[2], r[3]] : null; }, inArea: () => inArea(), paintArea: () => paintArea(),
    setTab: (id) => { tab = id; paintTabs(); },
  });

  // ---- 道具バー ----
  const bar = $('tools'), tip = $('tip');
  const buttons = new Map<Tool, HTMLButtonElement>();
  const pick = (id: Tool, keepClone = false) => {
    if (!b2.canPick(id)) return;
    if (id !== tool) prevTool = tool;
    tool = id;
    if (!keepClone) clone = null;
    if (id !== 'area') { blueprint = null; ghost = null; areaA = areaB = null; }
    const grp = GROUPS.find((g) => g.tools.includes(id));
    if (grp && !b2.keepTab(tab, id)) { tab = grp.id; paintTabs(); }
    paintArea();
    const t = TOOLS.find((x) => x.id === id)!;
    for (const [k, el] of buttons) { el.classList.toggle('on', k === tool); el.setAttribute('aria-pressed', String(k === tool)); }
    tip.replaceChildren(h('b', {}, clone ? `${t.name}をコピー中` : t.name), clone ? 'タップした場所に、同じ設定のものを貼りつける。ほかの道具を選ぶとやめる。' : t.tip);
    // 説明は選んだ直後だけ出して、じきに消す（出しっぱなしだと下側が地図をふさぐ）
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => { tip.hidden = true; }, clone ? 9000 : 5200);
    paintOpts();
    paintFold();
    b2.picked(id);
  };
  let tipTimer = 0;
  /** 道具ごとの切り替え（棚の右端）：ベルトは引く本数、設備は置く向き */
  const optsEl = $('opts');
  const ARROWS = ['→', '↓', '←', '↑'];
  const isBuild = (t: Tool): t is Placeable => t !== 'pan' && t !== 'erase' && t !== 'area' && t !== 'rail' && t !== 'route';
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
    b2.toolButton(b, t.id);
  }
  buttons.get('belt')!.after(buttons.get('route')!); // 自動ベルトは、ベルトの隣に
  // 道具の棚：分類ごとに切り替える
  // 最後に開いていた棚を覚えておく（次に開いたときも同じ棚から）
  let tab = GROUPS.some((g) => g.id === store.meta().tab) ? store.meta().tab! : 'move';
  const tabs = h('div', { id: 'tabs' }, ...GROUPS.map((g) => h('button', { type: 'button', id: `tab-${g.id}`, onclick: () => { tab = g.id; store.setMeta({ tab }); paintTabs(); sfx.tap(); } }, g.name)));
  bar.before(tabs);
  function paintTabs() {
    for (const g of GROUPS) {
      $(`tab-${g.id}`).classList.toggle('on', g.id === tab);
      for (const id of g.tools) buttons.get(id)?.classList.toggle('off', g.id !== tab);
    }
    b2.paintTabs(tab);
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
  $('act-move').onclick = () => { if (!selected || selected.kind === 'hub') return; moveArm = selected; app.classList.add('arming'); toast('動かす先をタップ（2×2 の装置は、そこが左上）。長押しして指を動かしても、ずらせる。', 4200); sfx.tap(); };
  actTurn.onclick = () => { if (selected) sheetActions.rotate(selected); };
  actErase.onclick = () => { if (selected) sheetActions.erase(selected); };
  const actNote = $('act-note');
  /** 選んだ設備の状態の一行：動いているか、何を待っているか、何を運んでいるか、どれだけためているか */
  const statusOf = (e: Ent): string => {
    const its = (xs: (Item | null | undefined)[]) => { const m = new Map<string, number>(); for (const it of xs) if (it) m.set(it.s, (m.get(it.s) ?? 0) + (it.n ?? 1)); return [...m].map(([s0, n]) => `${label(s0)} ×${n}`).join('　'); };
    if (isMachine(e.kind)) {
      const r = recipeById(e.recipe);
      if (!r) return '反応が未設定（「設定」で反応を組む）';
      if (e.sealed) return '中身の見えない装置';
      if (e.bad) return `${label(e.bad)} を受け取れずに止まっている（この反応では使わない）`;
      const st = machineState(e), u = Math.round((e.u ?? 0) * 100);
      const same = e === selected ? (sameMarks()?.length ?? 0) : 0, tail = same ? `　同じ反応 ほかに ${same} 台` : '';
      if (st === 0) return `動いている　稼働 ${u} %　反応 ${e.n ?? 0} 回${tail}`;
      if (st === 2) return `出口が詰まっている：${(e.outOrder ?? []).filter((_, i) => (e.outBuf?.[i] ?? 0) > 0).map(label).join('・') || '生成物'} の行き先を確かめろ`;
      const lack = r.inputs.filter(([s0, n]) => (e.inBuf?.[s0] ?? 0) < n).map(([s0]) => label(s0));
      return lack.length ? `原料待ち：${lack.join('・')} が足りない　稼働 ${u} %${tail}` : `待機中　稼働 ${u} %${tail}`;
    }
    if (MOVERS.has(e.kind)) { const t = its([e.item, ...(e.items ?? [])]); return t ? `運んでいる：${t}` : '空'; }
    if (e.kind === 'tank') return e.sub ? `${label(e.sub)} ${e.cnt ?? 0} / ${TANK_CAP}${e.test === 'hold' ? '　出口を閉じている' : ''}` : '空のタンク';
    if (e.kind === 'station') { const cars = [e.tr, ...(e.xtr ?? [])].filter((t): t is NonNullable<typeof t> => !!t); return `${e.role === 'out' ? '降ろす駅' : '積む駅'}　路線 ${e.ch ?? 1}　ためている荷 ${e.buf?.length ?? 0} / ${stationCap(world)}${e.role !== 'out' && cars.length ? `　走っている列車 ${cars.filter((t) => t.p > 0 || t.back).length} / ${cars.length}` : ''}`; }
    if (e.kind === 'extractor') { const z = zoneAt(e.x, groundY(e.y)); return `採っている：${z ? ZONES[z].name : '陸地'}の ${label(resourceAt(e.x, groundY(e.y)))}`; }
    if (e.kind === 'sensor' || e.kind === 'gate') return `信号 ${e.ch ?? 1}　${signalOn(world, e.ch ?? 1) ? 'オン' : 'オフ'}`;
    if (isSep(e.kind)) { const n = (e.buf?.length ?? 0) + (e.buf2?.length ?? 0) + (e.buf3?.length ?? 0); return n ? `分けたものをためている：${n} 個` : e.item ? `分けている：${label(e.item.s)}` : '待機中'; }
    return '';
  };
  const placeAct = () => {
    if (!selected || !modal.hidden || !slot || floorOf(selected.y) !== floor) { act.hidden = true; actNote.hidden = true; return; }
    const hub = selected.kind === 'hub';
    actOpen.textContent = isMachine(selected.kind) || selected.kind === 'station' || selected.kind === 'sensor' || selected.kind === 'gate' || isSep(selected.kind) ? '設定' : selected.kind === 'tank' ? '中身' : selected.kind === 'depot' || selected.kind === 'sampler' ? '選ぶ' : selected.kind === 'analyzer' ? '検査' : '説明';
    actTurn.hidden = actErase.hidden = hub;
    ($('act-move') as HTMLButtonElement).hidden = hub;
    actCopy.hidden = !copyable(selected);
    b2.paintAct(selected);
    act.hidden = false;
    const hr = hubRect(world.hubSize);
    const wx = hub ? hr.x + hr.s / 2 : selected.x + sizeOf(selected) / 2, wy = hub ? hr.y : groundY(selected.y);
    // 立体表示では、箱の天面の奥の辺の上に出す
    const scr = threeOn() ? camera3(cam, cw, ch).project(wx, wy, heightOf(selected)) : [(wx - cam.x) * cam.z + cw / 2, (wy - cam.y) * cam.z + ch / 2];
    const ax = scr[0];
    // 稼働率の札を出しているときは、札の上に出す
    const ay = scr[1] - 14 - (overlay && !hub ? 26 : 0);
    act.style.transform = `translate(${Math.round(Math.min(cw - 110, Math.max(110, ax)))}px, ${Math.round(Math.max(64, ay))}px) translate(-50%, -100%)`;
    const note = hub ? '' : b2.note(selected, statusOf(selected));
    actNote.hidden = !note;
    if (note) {
      if (actNote.textContent !== note) actNote.textContent = note;
      actNote.style.transform = `translate(${Math.round(Math.min(cw - 110, Math.max(110, ax)))}px, ${Math.round(Math.max(64, ay) - 58)}px) translate(-50%, -100%)`;
    }
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
    b2.lastPlaced(tool, dir);
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
  /** 選んだ設備の出口と入口（反応で使う出口だけ） */
  const selPorts = () => {
    const e = selected;
    if (!e || e.kind === 'hub' || e.kind === 'station' || MOVERS.has(e.kind) || floorOf(e.y) !== floor) return null;
    const outs = isMachine(e.kind) ? (e.outOrder?.length ? (e.outSlot ?? e.outOrder.map((_, i) => i)) : Array.from({ length: slotCount(e) }, (_, i) => i))
      : isSep(e.kind) ? sepSlots(e.kind) : e.kind === 'splitter' ? [0, 1, 2] : e.kind === 'analyzer' || e.kind === 'tank' ? [0, 1] : e.kind === 'vent' ? [] : [0];
    const ports: { x: number; y: number; d: number; out: boolean }[] = [];
    for (const i of outs) { const q = slotPort(e, i); ports.push({ x: q.x, y: q.y, d: q.d, out: true }); }
    if (e.kind !== 'extractor' && e.kind !== 'depot' && e.kind !== 'sampler') for (const q of inDoors(e)) ports.push({ x: q.x, y: q.y, d: q.d, out: false });
    return ports;
  };
  let marksFor: Ent | null = null, marksN = -1, marksList: Ent[] = [];
  /** 選んだ装置と同じ反応の装置（選び直すか、設備の数が変わったときだけ数え直す） */
  const sameMarks = () => {
    const e = selected;
    if (!e?.recipe) return null;
    if (marksFor !== e || marksN !== world.ents.size) { marksFor = e; marksN = world.ents.size; marksList = [...world.ents.values()].filter((o) => o !== e && o.kind !== 'part' && o.recipe === e.recipe); }
    return marksList;
  };
  /** ずらしている間の見本：行き先に置けるなら蛍光、ふさがっていれば赤 */
  const moveGhost = () => {
    if (!moving) return null;
    const m = moving, set = new Set(m.es.flatMap((e) => (e.kind === 'lift' ? [e, liftPartner(world, e)].filter((x): x is Ent => !!x) : [e])));
    const ok = [...set].every((e) => footprint(e.x + m.dx, e.y + m.dy, sizeOf(e)).every(([fx, fy]) => { const o = at(world, fx, fy); return !o || set.has(o); }));
    return [...set].filter((e) => floorOf(e.y) === floor).map((e) => ({ x: e.x + m.dx, y: e.y + m.dy, size: sizeOf(e), ok, dir: e.dir, glyph: MACHINES[e.kind as keyof typeof MACHINES]?.glyph ?? '' }));
  };
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
    groundMode: () => !!moving,
    minZoom: zMin,
    undo: () => { if (modal.hidden) doUndo(); },
    redo: () => { if (modal.hidden) doRedo(); },
    begin: () => { group = null; camTo = null; cross = null; railsLaid = 0; beltRun = 0; tip.hidden = true; lanePath = []; laneLaid.clear(); holding = false; b2.strokeStart(); },
    // 設備の道具で空いたマスを押し続けると、見本が出て、指で場所を選べる。離すと置く
    hold(x, y, g) {
      if (b2.locked()) return false;
      // 「見る」のとき、置いたものを長押しすると、つかんでずらせる（移す量は、指の下の地面のマスで測る）
      const held = at(world, x, y);
      if (tool === 'pan' && held && held.kind !== 'hub' && cam.z >= FAR_Z) { moving = { es: [held], gx: g ? g[0] : x, gy: g ? g[1] : y, dx: 0, dy: 0, area: false }; selected = held; sfx.tap(); buzz(15); return true; }
      if (!isBuild(tool) || tool === 'belt') return false;
      // 置けない所を長押ししたら、理由を知らせる（空いていても置けなければ、見本は赤く出る）
      if (at(world, x, y)) { b2.whyNot(tool, x, y); return false; }
      holding = true; hover = [x, y];
      if (!b2.whyNot(tool, x, y)) sfx.tap();
      return true;
    },
    end() {
      b2.strokeEnd();
      if (tool === 'rail' && railsLaid) {
        // 敷き終えた：つながった駅があれば知らせる
        const linked = [...world.ents.values()].filter((e) => e.kind === 'station' && e.role === 'in' && stationRoutes(world, e).some((r) => r.custom)).length;
        toast(`線路を ${railsLaid} マス敷いた。${linked ? `線路でつながった積む駅：${linked} か所。` : 'まだ、積む駅と降ろす駅はつながっていない。'}`, 2600);
        sfx.ok(); railsLaid = 0;
      }
      if (moving) {
        const m = moving;
        moving = null;
        if (m.dx || m.dy) { if (m.area) shiftArea(m.dx, m.dy, false); else doMove(m.es, m.dx, m.dy); }
        return;
      }
      if (!holding) return;
      holding = false;
      const hv = hover;
      hover = null;
      if (hv && !at(world, hv[0], hv[1])) placeAt(hv[0], hv[1]);
      else if (hv) b2.whyNot(tool, hv[0], hv[1]);
    },
    hover(t) { if (!holding) hover = t; cv.classList.toggle('over-ent', !!t && tool === 'pan' && !!at(world, t[0], t[1])); },
    // 引いた視野（戦略図）では、「見る」でなぞると、いつも地図が動く（設備が小さすぎて、ベルトを引くつもりでつかむことはない）
    mode: (x, y) => (b2.locked() ? 'pan' : tool === 'rail' ? (!floor && railStart(x, y) ? 'stroke' : 'pan') : tool === 'area' ? (blueprint ? 'pan' : 'stroke') : tool === 'belt' || tool === 'erase' || (tool === 'pan' && pullsBelt(x, y) && cam.z >= FAR_Z) ? 'stroke' : 'pan'),
    tap(x, y) {
      // 「ずらす」を押したあとのタップ：その場所へ（2×2 の装置は、タップしたマスが左上になる）
      if (moveArm) {
        const e = moveArm;
        moveArm = null; app.classList.remove('arming');
        if (at(world, x, y) !== e) doMove([e], x - e.x, y - e.y);
        return;
      }
      if (tool === 'route') { b2.routeTap(x, y); return; }
      if (tool === 'rail') {
        const e = at(world, x, y), m = world.rails.get(`${x},${y}`) || 0;
        if (e?.kind === 'station') inspect(e);
        else toast(floor ? '線路は 1 階にしか敷けない。' : m ? ([0, 1, 2, 3].filter((d) => (m >> d) & 1).length >= 3 ? '分岐点。ここから別の駅へ枝分かれする。ここからなぞれば、さらに伸ばせる。' : '線路。ここからなぞれば、枝分かれさせて伸ばせる。消すときは「消す」。') : '線路は、駅か、敷いてある線路からなぞって伸ばす。', 2600);
        return;
      }
      if (tool === 'area') { if (blueprint) { ghost = [x, y]; sfx.tap(); } else areaA = areaB = null; paintArea(); return; }
      const e = at(world, x, y);
      if (tool === 'erase') { if (e?.kind === 'hub') toast('納品所は消せない'); else if (e && b2.stocked(e)) sheetActions.erase(e); else if (doErase(x, y)) sfx.erase(); else toast('ここには何もない', 1200); return; }
      if (e) {
        if (selected === e) inspect(e);
        else { selected = e; sfx.tap(); }
        return;
      }
      if (tool === 'pan') { if (selected) selected = null; else if (!floor) showZone(x, y); return; }
      placeAt(x, y);
    },
    stroke(x, y, prev) {
      if (moving) { moving.dx = x - moving.gx; moving.dy = y - moving.gy; return; }
      // 範囲選択の中から引き始めたら、囲んだものをまとめてずらす
      if (tool === 'area' && !prev && !blueprint && areaRect() && inRect(x, y)) { const es = inArea(); if (es.length) { moving = { es, gx: x, gy: y, dx: 0, dy: 0, area: true }; return; } }
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
      if (tool === 'erase') { if (!b2.skipStocked(at(world, x, y))) doErase(x, y); return; }
      b2.strokeAt(x, y);
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
      if (!e) {
        if ((prev || tool === 'belt') && !doPlace('belt', x, y, beltDir)) {
          // 引いている長さを、下の説明の欄に出す
          beltRun++;
          tip.replaceChildren(h('b', {}, `ベルト ${beltRun} マス`), beltRun >= 2 ? '　離すと引き終わる。画面の端まで引くと、地図が送られる。' : '');
          tip.hidden = false; clearTimeout(tipTimer); tipTimer = window.setTimeout(() => { tip.hidden = true; }, 1600);
        }
      }
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
    hold: (x, y, g) => H.hold(x, F(y), [g[0], F(g[1])]),
    groundMode: () => !!moving,
    hover: (t) => H.hover(t && [t[0], F(t[1])]),
    undo: H.undo, redo: H.redo, minZoom: H.minZoom,
  }, {
    ground: (px, py) => (threeOn() ? camera3(cam, cw, ch).unproject(px, py, 0) : null),
    pick: (px, py) => (threeOn() ? pickTile(camera3(cam, cw, ch), px, py, (x, y) => at(world, x, F(y))) : null),
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
    return r ? [...world.ents.values()].filter((e) => e.kind !== 'hub' && e.kind !== 'part' && e.x >= r[0] && e.x <= r[2] && e.y >= r[1] && e.y <= r[3] && b2.keep(e)) : [];
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
    const r = areaRect();
    $('area-n').textContent = bp ? (ghost ? `設計図 ${blueprint!.length} 個。場所を変えるなら別のマスをタップ。` : `設計図 ${blueprint!.length} 個。置きたい場所の左上をタップ。`) : r ? `${n} 個を選択中（${r[2] - r[0] + 1}×${r[3] - r[1] + 1} マス）。${n ? '中から引くと、まとめてずらせる。' : ''}` : 'なぞって四角く囲め。';
    $('area-all').hidden = bp;
    $('area-copy').hidden = $('area-del').hidden = bp || n === 0;
    $('area-num').hidden = bp || !inArea().some((e) => NUMBERED.includes(e.kind));
    $('area-nudge').hidden = bp || n === 0;
    $('area-rot').hidden = $('area-save').hidden = $('area-put').hidden = !bp;
    ($('area-put') as HTMLButtonElement).disabled = !ghost;
    $('area-lib').hidden = bp;
    $('area-cancel').hidden = !bp && !areaRect();
    b2.paintArea(bp, n);
  }
  // ---- 番号をまとめて振る：囲んだ検知器・弁・貨物駅に、連番か同じ番号を付ける（元に戻せる） ----
  const NUMBERED = ['sensor', 'gate', 'station'];
  const showNumbering = () => {
    const all = inArea().filter((e) => NUMBERED.includes(e.kind));
    if (!all.length) return;
    const sig = all.filter((e) => e.kind !== 'station'), sta = all.filter((e) => e.kind === 'station');
    let target: 'sig' | 'sta' = sig.length ? 'sig' : 'sta', seq = true, text = '';
    const pickedEnts = () => (target === 'sig' ? sig : sta)
      // 読む順（上の行から、左から）
      .slice().sort((a, b) => groundY(a.y) - groundY(b.y) || a.x - b.x);
    const used = () => [...world.ents.values()].filter((e) => (target === 'sig' ? e.kind === 'sensor' || e.kind === 'gate' : e.kind === 'station') && !pickedEnts().includes(e)).map((e) => e.ch || 1);
    const startNo = () => (text ? lineNo(+text) : freeLine(used()));
    const again = () => {
      const es = pickedEnts(), s0 = startNo(), nums = es.map((_, i) => lineNo(seq ? s0 + i : s0));
      const seg = (id: string, on: boolean, label: string, f: () => void) => h('button', { class: 'ghost' + (on ? ' picked on' : ''), type: 'button', id, onclick: () => { f(); sfx.tap(); again(); } }, label);
      showSheet(h('header', {}, h('h2', {}, '番号を振る'), closeBtn()),
        h('p', { class: 'muted' }, '囲んだ設備に、上の行から左から順に番号を付ける。付けたあとでも「元に戻す」で戻せる。'),
        h('div', { class: 'row' },
          sig.length ? seg('num-sig', target === 'sig', `検知器と弁 ${sig.length} 個（信号の番号）`, () => { target = 'sig'; }) : null,
          sta.length ? seg('num-sta', target === 'sta', `貨物駅 ${sta.length} 個（路線番号）`, () => { target = 'sta'; }) : null),
        h('div', { class: 'row' }, seg('num-seq', seq, '連番', () => { seq = true; }), seg('num-same', !seq, 'すべて同じ番号', () => { seq = false; })),
        h('p', { class: 'eq', id: 'num-start' }, `${seq ? '最初の番号' : '番号'}：${s0}${text ? '' : '（空き番号）'}`),
        h('div', { class: 'keys numpad' }, ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0'].map((k) =>
          h('button', { class: 'key ' + (k === '⌫' ? 'fn' : 'n'), type: 'button', id: `pad-${k === '⌫' ? 'del' : k}`, onclick: () => { text = k === '⌫' ? text.slice(0, -1) : (text + k).replace(/^0+/, '').slice(0, 4); again(); } }, k))),
        h('p', { class: 'muted', id: 'num-preview' }, `付く番号：${nums.slice(0, 12).join('、')}${nums.length > 12 ? ' …' : ''}${seq && s0 + es.length - 1 > LINE_MAX ? `（${LINE_MAX} を超える分は ${LINE_MAX} になる）` : ''}`),
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'num-ok', onclick: () => {
          group = null;
          es.forEach((e, i) => { if ((e.ch || 1) === nums[i]) return; record({ t: 'ch', x: e.x, y: e.y, ch: e.ch ?? 1 }); e.ch = nums[i]; e.tr = undefined; e.xtr = undefined; });
          group = null;
          sfx.ok(); closeModal(); toast(`${es.length} 個に番号を振った。`, 2200); save();
        } }, `${es.length} 個に振る`)));
    };
    again();
  };
  $('area-num').onclick = showNumbering;
  const inRect = (x: number, y: number) => { const r = areaRect(); return !!r && x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; };
  /** 囲んだものを、まとめて 1 マスずつずらす（中の線路も一緒に）。囲みも一緒に動く */
  const shiftArea = (dx: number, dy: number, quiet: boolean) => {
    const es = inArea(), r = areaRect();
    if (!es.length || !areaA || !areaB || !r) return false;
    if (!doMove(es, dx, dy, quiet, r)) return false;
    areaA = [areaA[0] + dx, areaA[1] + dy]; areaB = [areaB[0] + dx, areaB[1] + dy];
    paintArea();
    return true;
  };
  const nudgeArea = (dx: number, dy: number) => { if (shiftArea(dx, dy, false)) sfx.tap(); };
  // 画面に見えている範囲を、まとめて囲む
  $('area-all').onclick = () => {
    const vw = cw / 2 / cam.z, vh = ch / 2 / cam.z;
    areaA = [Math.floor(cam.x - vw) + 1, F(Math.floor(cam.y - vh) + 1)];
    areaB = [Math.floor(cam.x + vw) - 1, F(Math.floor(cam.y + vh) - 1)];
    blueprint = null; ghost = null; sfx.tap(); paintArea();
  };
  $('area-left').onclick = () => nudgeArea(-1, 0); $('area-right').onclick = () => nudgeArea(1, 0);
  $('area-up').onclick = () => nudgeArea(0, -1); $('area-down').onclick = () => nudgeArea(0, 1);
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
  // 30 個以上か、中に物をためた装置があれば、確かめてから消す
  $('area-del').onclick = () => b2.bulkErase(inArea(), () => {
    group = null;
    for (const e of inArea()) doErase(e.x, e.y);
    group = null;
    areaA = areaB = null;
    sfx.erase();
    paintArea();
  });
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
          b2.bpThumb(bp.stamps),
          h('span', { class: 'stack' }, (() => { const inp = h('input', { class: 'bp-name', type: 'text', id: `bp-name-${i}`, value: bp.name, maxLength: 30, ariaLabel: '設計図の名前' }); inp.onchange = () => { bp.name = inp.value.trim().slice(0, 30) || bp.name; saveLibrary(l); }; return inp; })(), h('span', { class: 'muted' }, `装置 ${n((b) => BIG.includes(b.kind))}・ベルト類 ${n((b) => b.kind === 'belt' || b.kind === 'bridge' || b.kind === 'tunnel')}・ほか ${n((b) => !BIG.includes(b.kind) && b.kind !== 'belt' && b.kind !== 'bridge' && b.kind !== 'tunnel')}`)),
          ...b2.bpOrder(l, i, () => { saveLibrary(l); showLibrary(); }),
          h('button', { class: 'primary', type: 'button', id: `bp-use-${i}`, onclick: () => { blueprint = bp.stamps.map((b) => ({ ...b })); ghost = null; areaA = areaB = null; closeModal(); pick('area', true); } }, '使う'),
          h('button', { class: 'ghost', type: 'button', id: `bp-out-${i}`, onclick: () => showLibrary({ mode: 'out', text: encodeBlueprint(bp.name, bp.stamps) }) }, '書き出す'),
          h('button', { class: 'ghost warn', type: 'button', id: `bp-del-${i}`, onclick: () => b2.ask(`設計図「${bp.name}」を消す？`, 'この端末から消える。元には戻せない。', '消す', () => { l.splice(i, 1); saveLibrary(l); showLibrary(); }) }, '消す'));
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
    clearUndo(); selected = null; shownGoal = ''; clone = null; hover = null;
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
  const fireworks = (count: number) => pf.calm ? undefined : launchFireworks(flamesFed(world).map((sym) => ({ sym, ...FLAMES[sym] })), count);
  // 確認用：アドレスに ?fw を付けると、花火を上げる関数と、いまの視点を外から読める
  if (typeof location !== 'undefined' && location.search.includes('fw')) Object.assign(window, { __fireworks: fireworks, __cam: cam, __world: () => world, __at: (x: number, y: number) => at(world, x, y), __project: (x: number, y: number, hh = 0) => (threeOn() ? camera3(cam, cw, ch).project(x, y, hh) : [(x - cam.x) * cam.z + cw / 2, (y - cam.y) * cam.z + ch / 2]) });

  // ---- アルバム：指令を達成した瞬間の工場を、上から撮って残す（章ごとに最新の 1 枚と、最初の 1 枚）----
  interface Photo { k: string; cap: string; d: string; done: number; ms: number }
  const albumKey = () => `chemyth-v2-album-${slot}`;
  const album = (): Photo[] => { try { return JSON.parse(localStorage.getItem(albumKey()) || '[]'); } catch { return []; } };
  const snap = (key: string, cap: string) => {
    try {
      const W = 560, H = 350, cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      // 写真は、これまでどおり近くの絵で撮る（引いた視野の戦略図にはしない）
      const fv = fitView(W, H);
      draw(cvs.getContext('2d')!, W, H, world, { ...fv, z: Math.max(FAR_Z + 1, fv.z) }, performance.now() / 1000, 0, { floor: 0, tool: 'pan', selected: null });
      let list = album();
      const photo: Photo = { k: list.length ? key : 'first', cap, d: cvs.toDataURL('image/jpeg', 0.62), done: doneCount(world), ms: Math.round(world.playMs) };
      list = [...list.filter((p) => p.k !== photo.k), photo].slice(-26);
      // 保存先がいっぱいなら、古い写真から小さくし、それでも入らなければ古いものから減らす
      putAlbum(albumKey(), list, (msg) => toast(msg, 5000));
    } catch { /* 撮れなくても遊べる */ }
  };
  const showAlbum = (big?: Photo) => {
    const list = album();
    if (big) {
      const img = h('img', { class: 'photo-big', src: big.d, alt: big.cap });
      showSheet(h('header', {}, h('h2', {}, 'アルバム'), h('button', { class: 'ghost', type: 'button', id: 'album-back', onclick: () => showAlbum() }, '戻る')), img, h('p', {}, big.cap), h('p', { class: 'muted' }, `達成 ${big.done} / ${TOTAL_GOALS}`),
        h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'album-save', onclick: () => { void saveFile(stampName('jpg'), dataUrlBlob(big.d)).then((ok) => { if (ok) toast('写真を保存した。', 2000); }); } }, 'この写真を保存する')));
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
    paintPts($('pts'), world);
    // 強化か研究ができるだけの研究点がたまったら、ボタンに印をつける
    if (world.tick % 30 === 0) {
      const can = (['extract', 'belt', 'machine'] as const).some((k) => { const c = UPGRADE_COST[world.up[k]]; return c !== undefined && world.points >= c; }) || RESEARCH.some((r) => !has(world, r.id) && !researchBlock(world, r));
      $('b-up').classList.toggle('ready', can);
    }
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
    const side = world.side, sideEl = $('goal-side');
    sideEl.hidden = !side;
    if (side) sideEl.textContent = `混ぜ注文：${label(side.s)} を ${side.got} / ${side.n}（${CHAPTERS[side.ch].name.split(' ')[0]}の物質）　研究点 +${side.reward}`;
  };

  // ---- アカウント：セーブを書くたびに、少しあとで預ける。ほかの端末が先へ進めていたら、知らせる ----
  initAccount();
  let clashTold = 0;
  /** メニューの右肩の印：緑＝同期済み、黄＝同期中、赤＝同期できていない・食い違い */
  const paintSync = () => {
    const st = syncState(), dot = $('sync-dot');
    dot.hidden = !st.on;
    if (!st.on) return;
    dot.className = st.trouble || st.conflicts ? 'bad' : st.busy ? 'busy' : '';
    dot.title = st.trouble ? `同期できていない：${st.trouble}` : st.conflicts ? 'ほかの端末と食い違っている（タイトルの「アカウント」で選ぶ）' : st.busy ? '同期中' : st.lastSync ? `${hm(st.lastSync)} に同期` : '同期待ち';
  };
  onAccountChange(paintSync);
  onAccountChange(() => {
    if (app.classList.contains('in-title') || !slot || !conflictSlots().includes(slot) || clashTold === slot) return;
    clashTold = slot;
    toast('ほかの端末で、この枠を先へ進めている。ここでの続きは預けていない。タイトルの「アカウント」で、どちらを残すか選べ。', 9000);
  });

  // ---- タイトルと開始 ----
  const title = initTitle({
    start(n, json) {
      world = (json && deserialize(json)) || newWorld();
      slot = n;
      clearUndo(); selected = null; shownGoal = ''; speed = 1; paintSpeed(); clone = null;
      cam.x = hubCX; cam.y = hubCY; cam.z = nearZoom(); camTo = null;
      // 前に見ていた場所から始める
      const c0 = json ? store.meta().cams?.[String(n)] : undefined;
      if (c0 && [c0.x, c0.y, c0.z].every((v) => typeof v === 'number' && isFinite(v))) { cam.x = c0.x; cam.y = c0.y; cam.z = Math.min(Z_MAX, Math.max(zMin(), c0.z)); }
      $('b-fit').textContent = '全体';
      title.hide();
      app.classList.remove('in-title');
      for (const b of buttons.values()) b.hidden = false;
      refreshTools(false);
      lastSeen = world.seen; lastRes = world.research.length; floor = 0; paintFloor();
      pick('pan');
      // 「見る」を選ぶと棚が「運ぶ」に替わるので、最後に開いていた棚に戻す
      const t0 = store.meta().tab;
      if (t0 && GROUPS.some((g) => g.id === t0)) { tab = t0; paintTabs(); }
      began = performance.now(); warned = false;
      save(); paintSpeed(); paintMarks(); paintSync(); started(n);
      if (!json) { showHelp(true); store.setMeta({ news: NEWS }); }
      else if (closedNow()) showClosing();
      else if (morningDue(world, sleepCfg(), new Date())) showMorningSet();
      else if (store.meta().news !== NEWS) showNews();
    },
  });
  const toTitle = () => { rvCard.hidden = true; leaveCase(); save(); saveCam(); slot = 0; selected = null; moving = null; moveArm = null; app.classList.remove('arming'); actNote.hidden = true; $('paused').hidden = true; $('marks').hidden = true; app.classList.add('in-title'); title.show(); };
  /** 今日のまとめ：タイトルへ戻る前に、今日の時間・復習・続いた日数・次の復習を見せる */
  const showToday = () => {
    const now = Date.now(), [n, ok] = todayCount(world, now), st = streakOf(world, now), ex = daysToExam(world, now);
    const next = Object.values(world.srs).map((c) => c.due).filter((d) => d > now).sort((a, b) => a - b)[0];
    const dueNow = reviewCount(world);
    showSheet(h('header', {}, h('h2', {}, '今日のまとめ'), closeBtn()),
      h('table', { class: 'keys' },
        h('tr', {}, h('th', {}, '遊んだ時間'), h('td', {}, fmtTime(world.dayMs[dayKey(now)] ?? 0))),
        h('tr', {}, h('th', {}, '復習'), h('td', {}, `${n} 問（思い出せた ${ok} 問）　目標 ${DAILY_GOAL} 問${n >= DAILY_GOAL ? '　達成' : ''}`)),
        h('tr', {}, h('th', {}, '続けた日数'), h('td', {}, `${st} 日`)),
        h('tr', {}, h('th', {}, 'いま待っている復習'), h('td', {}, dueNow ? `${dueNow} 問` : 'なし')),
        h('tr', {}, h('th', {}, '次の復習'), h('td', {}, next ? fmtDate(next) : '—')),
        ex !== null ? h('tr', {}, h('th', {}, '次の試験まで'), h('td', {}, `${ex} 日`)) : null),
      // 学習時間の目標と、今日まちがえた問い（正しい答えつき）
      ...todayExtras(world),
      dueNow ? h('p', { class: 'muted' }, '待っている復習は、閉じる前に片づけると、間隔どおりに覚えられる。') : null,
      h('div', { class: 'row' },
        dueNow ? h('button', { class: 'ghost', type: 'button', id: 'today-review', onclick: () => showReview(panel()) }, `復習する（${dueNow} 問）`) : null,
        h('button', { class: 'primary', type: 'button', id: 'today-title', onclick: () => { modal.hidden = true; sheet.replaceChildren(); toTitle(); } }, 'タイトルへ')));
  };

  // ---- ループ ----
  let miniTick = 0, idleSkip = 0;
  let began = performance.now(), warned = false, prev = performance.now(), acc = 0, sinceSave = 0, lastSeen = -1, lastRes = 0, musicAt = 0, chapterBefore = 0, slowFrames = 0;
  const STEP = 1 / 60;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (slot) {
      // 「限られた原料」は、予想を答えるまで動かさない
      if (modal.hidden && closingEl.hidden && !(sandbox?.c.kind === 'limit' && !world.pred)) {
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
            const took = world.goalMs[`${chapterBefore}:${Math.max(0, (world.progress[chapterBefore] || 1) - 1)}`];
            if (took) window.setTimeout(() => toast(`この指令にかかった時間：${fmtTime(took)}（工場を動かしていた時間）。`, 3000), 4200);
            buzz([20, 60, 20]);
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
        if (ev === 'side-new' && world.side) toast(`混ぜ注文：${CHAPTERS[world.side.ch].name}の ${label(world.side.s)} を ${world.side.n} 個。指令とは別に納めると研究点 +${world.side.reward}。`, 6000);
        if (ev === 'side-done' && world.lastSide) { toast(`混ぜ注文を終えた（${label(world.lastSide.s)}）。研究点 +${world.lastSide.reward}。`, 4500); sfx.goal(); }
        if (ev === 'goal-done' || ev === 'chapter-done') lastCardAt = -1e9;
        if (ev === 'chapter-done' && canTestOut(world, world.chapter)) window.setTimeout(() => toast(`次は「${CHAPTERS[world.chapter].name}」。知っている章なら、指令の札を押して章の一覧から「確認テスト」（10 問、9 割で章を短縮）。`, 8000), 4500);
        if (ev === 'wrong-sample' && now - lastWrong > 2500) { lastWrong = now; toast('違う物質が納品所に入った。2 個減点。検査を見直せ。', 3200); sfx.bad(); }
        if (ev === 'all-done') { toast('すべての指令を終えた。', 6000); sfx.goal(); }
        save();
      }
      if (!sandbox) statsTick(world); // 指令の見込みの記録と、実績（半秒に 1 回）
      sinceSave += dt;
      if (sinceSave > 5) { sinceSave = 0; save(); saveCam(); paintSync(); }
      if (!warned && pf.breakMin && now - began > pf.breakMin * 60000) { warned = true; breakReminder(pf.breakMin); }
      // 立体表示は、平らな表示ほど引けない。下限より引いていたら（立体表示に切り替えたときなど）、すぐ下限まで寄る。
      // 寄りながら描くと、下限より引いた視野を立体で描くことになり、近くの絵の区画が何千枚も要って数秒止まる
      const zm = zMin();
      if (camTo && camTo.z < zm) camTo.z = zm;
      if (cam.z < zm) cam.z = zm;
      if (camTo && pf.calm) { cam.x = camTo.x; cam.y = camTo.y; cam.z = camTo.z; camTo = null; }
      if (camTo) {
        const k = 1 - Math.exp(-dt * 7);
        cam.x += (camTo.x - cam.x) * k; cam.y += (camTo.y - cam.y) * k; cam.z += (camTo.z - cam.z) * k;
        if (Math.abs(camTo.z - cam.z) < 0.05 && Math.hypot(camTo.x - cam.x, camTo.y - cam.y) < 0.01) camTo = null;
      } else input.tick(dt);
      if (selected && at(world, selected.x, selected.y) !== selected) selected = null;
      if (lastSeen !== world.seen) { lastSeen = world.seen; refreshTools(true); }
      if (lastRes !== world.research.length) { lastRes = world.research.length; refreshTools(true); paintOpts(); paintFloor(); }
      const d0 = PERF ? performance.now() : 0;
      const idle = pf.saver && performance.now() - lastInput > 5 * 60000 && !shotPending;
      if (idle && ++idleSkip % 6) { hud(); placeAct(); requestAnimationFrame(frame); return; }
      const fx = fxOn(), t3 = fx && three && gw > 0;
      const view = { dusk: palette().name === 'light' ? dusk : dusk * 0.5, floor, tool, selected, stats: overlay, area: tool === 'area' ? areaRect() : null, ghost: moving && (moving.dx || moving.dy) ? moveGhost() : tool === 'area' ? ghostCells() : toolGhost(), lift: !!moving && !!(moving.dx || moving.dy), ports: moving ? null : selPorts(), marks: sameMarks(), allPlates: pf.plates, over: b2.draw };
      if (fx) {
        // 光の層は黒地に加算、効果の層は黒地（何もない所は効果なし）
        for (const c2 of [glowCtx, maskCtx]) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalCompositeOperation = 'source-over'; c2.globalAlpha = 1; c2.fillStyle = '#000'; c2.fillRect(0, 0, glowCv.width, glowCv.height); c2.setTransform(fxK, 0, 0, fxK, 0, 0); c2.globalCompositeOperation = 'lighter'; }
        // 高さの層は、地面の高さ（0.1）で塗ってから、高いものを「明るいほうを残す」で重ねる
        if (gfxTier === 2 && !(three && gw > 0) && cam.z >= FAR_Z) { heightCtx.setTransform(1, 0, 0, 1, 0, 0); heightCtx.globalCompositeOperation = 'source-over'; heightCtx.globalAlpha = 1; heightCtx.fillStyle = 'rgb(26,26,26)'; heightCtx.fillRect(0, 0, heightCv.width, heightCv.height); heightCtx.setTransform(fxK, 0, 0, fxK, 0, 0); heightCtx.globalCompositeOperation = 'lighten'; }
      }
      // 高さの層（影とくぼみの陰り）は、引いた視野では使わない（1 マスが数ピクセルでは影が見えず、合成の手間だけかかる）
      const useH = fx && gfxTier === 2 && !(three && gw > 0) && cam.z >= FAR_Z;
      if (t3) {
        // 立体表示：見えている範囲を囲む長方形を、地面の層と天面の層に描く。#cv は透明にして、画面にじかに描くものだけを載せる
        const c3 = camera3(cam, cw, ch), cam2 = { x: (c3.x0 + c3.x1) / 2, y: (c3.y0 + c3.y1) / 2, z: cam.z };
        topCtx.clearRect(0, 0, gw, gh);
        ctx.clearRect(0, 0, cw, ch);
        boxes.length = 0; slabs.length = 0;
        draw(gndCtx, gw, gh, world, cam2, now / 1000, dt, { ...view, fx: { glow: glowCtx, mask: maskCtx }, three: { top: topCtx, screen: ctx, sw: cw, sh: ch, project: c3.project, boxes, slabs } });
        const fw = fireworksActive();
        if (fw) { glowSCtx.setTransform(1, 0, 0, 1, 0, 0); glowSCtx.globalCompositeOperation = 'source-over'; glowSCtx.globalAlpha = 1; glowSCtx.fillStyle = '#000'; glowSCtx.fillRect(0, 0, glowSCv.width, glowSCv.height); glowSCtx.setTransform(FX_SCALE, 0, 0, FX_SCALE, 0, 0); glowSCtx.globalCompositeOperation = 'lighter'; }
        drawFireworks(ctx, cw, ch, dt, fw ? glowSCtx : null);
        if (boxBuf.length < boxes.length + slabs.length) boxBuf = new Float32Array((boxes.length + slabs.length) * 2);
        boxBuf.set(boxes); boxBuf.set(slabs, boxes.length);
        const pal = palette(), ink = parseInt((pal.skin === 'punk' ? '#0b0d10' : pal.ink).slice(1), 16);
        post!.render3d({
          ground: gndCv, top: topCv, rect: [cam2.x - gw / 2 / cam.z, cam2.y - gh / 2 / cam.z, cam2.x + gw / 2 / cam.z, cam2.y + gh / 2 / cam.z],
          vp: new Float32Array(c3.vp), boxes: boxBuf, count: boxes.length / 8, slabs: slabs.length / 8, topH: TOP_H,
          ink: [((ink >> 16) & 255) / 255, ((ink >> 8) & 255) / 255, (ink & 255) / 255], shadow: pal.name === 'light' ? 0.3 : 0.5, glowScreen: fw ? glowSCv : null,
          ao: gfxTier === 2 ? (pal.name === 'light' ? 0.32 : 0.45) : 0, rich: gfxTier === 2 ? 1 : 0, skin: pal.skin === 'punk' ? 1 : pal.skin === 'arcane' ? 2 : pal.skin === 'lab' ? 3 : 0, dark: pal.name === 'dark',
        }, glowCv, maskCv, duskPost(POST_PRESETS[pal.key], now / 1000, true));
      } else {
        draw(ctx, cw, ch, world, cam, now / 1000, dt, { ...view, fx: fx ? { glow: glowCtx, mask: maskCtx, height: useH ? heightCtx : null } : null });
        drawFireworks(ctx, cw, ch, dt, fx ? glowCtx : null);
        if (fx) post!.render(cv, glowCv, maskCv, duskPost(POST_PRESETS[palette().key], now / 1000), useH ? heightCv : null);
      }
      if (fx) {
        // 遅い端末では、自動で軽い表示に戻す（3 秒ほど、1 コマ 45 ms を超え続けたら）。立体表示 → 平らな高画質 → 標準、の順
        slowFrames = dt > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
        if (slowFrames > 70 && !KEEP_GFX) {
          slowFrames = 0;
          if (t3) { three = false; applyGfx(); resize(); store.setMeta({ view3d: 'off' }); toast('動きが重いので、立体表示を切った。メニューの「立体表示」で戻せる。', 5000); }
          else if (gfxTier === 2) { gfxTier = 1; store.setMeta({ gfx: 'mid' }); toast('動きが重いので、画質を「高」にした（影と光の筋を切った）。メニューの「画質」で戻せる。', 5000); }
          else { gfxHigh = false; applyGfx(); store.setMeta({ gfx: 'plain' }); toast('動きが重いので、画質を標準に切り替えた。メニューの「画質」で戻せる。', 5000); }
        }
      }
      if (shotPending) takeShot();
      if (++miniTick % 20 === 0) paintMini();
      if (miniTick % 30 === 0) cardTick(performance.now());
      if (++sleepTick % 60 === 0) sleepCheck();
      if (!sandbox && !document.hidden) addPlayTime(world, dt * 1000);
      if (PERF) { PERF.draw.push(performance.now() - d0); if (PERF.draw.length > 600) { PERF.draw.shift(); PERF.step.shift(); } }
      hud();
      b2.tick();
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); flushAccount(); } });

  initSettings2({
    world: () => (slot ? (sandbox ? sandbox.home : world) : null), slot: () => slot, toast, show: showSheet, close: closeModal, closeBtn, save,
    repaintTitle: () => { if (!slot) title.show(); },
    morning: () => { if (slot && !sandbox && modal.hidden && closingEl.hidden && morningDue(world, sleepCfg(), new Date())) showMorningSet(); },
  });
  applyPrefs();
  let errTold = 0;
  const onCrash = () => {
    try { save(); saveCam(); } catch { /* 保存できなくても、知らせる */ }
    if (slot && Date.now() - errTold > 30000) { errTold = Date.now(); toast('不具合が起きた。ここまでの工場は保存した。動きがおかしければ、メニューから「保存してタイトルへ戻る」で開き直せ。', 8000); }
  };
  window.addEventListener('error', onCrash);
  window.addEventListener('unhandledrejection', onCrash);
  window.addEventListener('pagehide', () => { save(); saveCam(); });
  // 更新のお知らせ：新しい版で、はじめて工場を開いたときに 1 度だけ
  const NEWS = '2026-11-lab';
  const showNews = () => {
    store.setMeta({ news: NEWS });
    showSheet(h('header', {}, h('h2', {}, '更新のお知らせ'), closeBtn()),
      h('p', {}, h('b', {}, '4 つ目のスキン「研究所」を足した。'), 'タイトルかメニューの見た目で選べる（白の研究棟／深夜のラボ）。光る床に設備が映り、ベルトは浮いて流れ、納品所は反応炉になる。'),
      h('p', {}, h('b', {}, '地図を、ずっと遠くまで引けるようになった。'), '引くほど「戦略図」に替わり、資源地の名前と産出物、いまの指令の資源地、線路、区画ごとの生産が見える。「全体」で工場ぜんぶが入る。'),
      h('p', {}, h('b', {}, 'ほかに 100 項目。'), '復習のヒントと取り消し、週の報告、自動ベルト、装置ごとの一時停止、旗、生産の流れ、実績、物質の収支、毎日の自動控え、色覚の補助、集中モードなど。メニューの「設定」「データ」「実績」「週の報告」「つなぎ忘れ」から。'),
      h('p', {}, h('b', {}, '前の更新：グラフィックを、すべてのスキンで強化した。'), 'メニューの「画質」に「最高」を足した（重い端末では、自動で「高」→「標準」に下げる）。'),
      h('ul', {},
        h('li', {}, '設備が地面に影を落とし、足もとが陰る。影の向きと長さは、実際の時刻の太陽で変わる（朝は右上から、夕方は左から、昼は短い）。'),
        h('li', {}, '暗いテーマでは、納品所や灯りから光の筋がのび、工業はレンズの横の筋、魔術は星形のきらめきが出る。水面に空が映り、日が照り返し、岸に泡が寄せる。'),
        h('li', {}, '地面の細部：紙の繊維としみ、黒板の消し跡と消し残した式、羊皮紙の錬金術の印、夜の書斎の石の床と光る魔法陣、工場の床の排水格子・危険表示・赤く光る割れ目。'),
        h('li', {}, '立体表示：箱の足もとの陰り、面取りした天面の縁、スキンごとの側面（厚紙・鋼板と鋲・木目と真鍮）、遠くのかすみ、ミニチュアのような上下のぼかし。')),
      h('p', {}, h('b', {}, '置いたものを、ずらせるようになった。')),
      h('ul', {},
        h('li', {}, '「見る」で、置いたものを長押し → そのまま指を動かすと、ずらせる（離すと置く。ふさがっていれば赤い見本と理由が出る）。'),
        h('li', {}, '選んだものの帯の ⇲ を押して、行き先をタップしてもよい。'),
        h('li', {}, '「範囲」で囲んだら、囲みの中から引くと、まとめてずらせる（中の線路も一緒に）。帯の ← ↑ ↓ → で 1 マスずつ。'),
        h('li', {}, 'ずらしたことは「元に戻す」で戻せる。')),
      h('p', {}, 'ほかに 90 項目あまり：キーボード操作、選んだ設備の状態の一行、どこで作っている？、場所を覚える、通知の履歴、復習の数字キー・反応式・練習・苦手の一覧・連続日数・グラフ、設定の画面（振動・音量・動きを減らす・文字とボタンの大きさ・覚える確率）、全ノートの書き出し、画面写真など。'),
      h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', id: 'news-keys', onclick: () => showKeys() }, 'キーと指の操作'), h('button', { class: 'primary', type: 'button', id: 'news-ok', onclick: closeModal }, '閉じる')));
  };
  // 開いたまま更新されたときは、遊んでいた枠にそのまま戻る
  if (data.slot && data.save && deserialize(data.save)) {
    store.write(data.slot, data.save);
    const s = data.slot;
    title.show();
    ($(`slot-${s}-go`) as HTMLButtonElement | null)?.click();
  } else { title.show(); autoOpen(); }
}

if (hot?.ready) hot.ready(boot); else boot(hot?.data ?? {});
