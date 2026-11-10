import { GOALS, MAP_H, MAP_W, ZONES, zoneAt } from './content/map';
import { MACHINES } from './content/machines';
import { recipeById, CONDITIONS } from './content/recipes';
import { label, sub } from './content/substances';
import { at, deserialize, isMachine, key, newWorld, place, remove, serialize, step, type Dir, type Ent, type Kind, type World } from './engine/world';
import { about, diagram, equation, openConfig } from './ui/config';
import { $, h } from './ui/dom';
import { attachInput } from './ui/input';
import { draw, type Camera } from './ui/render';

type Placeable = Exclude<Kind, 'hub'>;
type Tool = 'pan' | 'rotate' | 'erase' | Placeable;
type Op = { t: 'add'; x: number; y: number } | { t: 'del'; ent: Ent } | { t: 'dir'; x: number; y: number; dir: Dir };
const SAVE_KEY = 'chemyth-save-v1';
const SESSION_LIMIT_MS = 25 * 60 * 1000;

const TOOLS: { id: Tool; glyph: string; name: string; tip: string; color?: string }[] = [
  { id: 'pan', glyph: '✥', name: '見る', tip: '1本指で地図を動かす。装置や資源地をタップすると説明と設定が開く。2本指で拡大縮小。' },
  ...(['belt', 'extractor', 'separator', 'electrolyzer', 'reactor', 'vent'] as Placeable[]).map((id) => ({ id, glyph: MACHINES[id].glyph, name: MACHINES[id].name, tip: MACHINES[id].tip, color: MACHINES[id].color })),
  { id: 'rotate', glyph: '↻', name: '回す', tip: '置いたものをタップすると、向きが時計回りに変わる。' },
  { id: 'erase', glyph: '✕', name: '消す', tip: '置いたものをタップするか、なぞると消える。間違えたら「元に戻す」。', color: '#b0453f' },
];

interface Hot { data?: { save?: string }; snapshot?(f: () => unknown): void; ready?(f: (d: { save?: string }) => void): void }
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function load(saved?: string): World {
  let json = saved ?? null;
  if (!json) { try { json = localStorage.getItem(SAVE_KEY); } catch { /* 保存領域が使えない環境でも遊べる */ } }
  return (json && deserialize(json)) || newWorld();
}

function start(data: { save?: string }) {
  let world = load(data.save);
  let tool: Tool = 'pan';
  let beltDir: Dir = 0;
  const cv = $<HTMLCanvasElement>('cv');
  const ctx = cv.getContext('2d')!;
  const cam: Camera = { x: MAP_W / 2, y: MAP_H / 2, z: 52 };
  let cw = 0, ch = 0;

  const save = () => { try { localStorage.setItem(SAVE_KEY, serialize(world)); } catch { /* 同上 */ } };
  hot?.snapshot?.(() => ({ save: serialize(world) }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  new ResizeObserver(resize).observe(cv);
  resize();
  // 地図全体が入る倍率から始める。作業するときは2本指で拡大する
  cam.z = Math.max(20, Math.min(52, cw / (MAP_W + 1)));

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
  const record = (op: Op) => {
    if (!group) { group = []; undo.push(group); if (undo.length > 60) undo.shift(); }
    group.push(op);
    $<HTMLButtonElement>('b-undo').disabled = false;
  };
  const doPlace = (kind: Placeable, x: number, y: number, dir: Dir): string | null => {
    const err = place(world, kind, x, y, dir);
    if (!err) record({ t: 'add', x, y });
    return err;
  };
  const doErase = (x: number, y: number): boolean => {
    const e = at(world, x, y);
    if (!e || e.kind === 'hub') return false;
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
    $<HTMLButtonElement>('b-undo').disabled = undo.length === 0;
    if (!g) return;
    for (const op of g.reverse()) {
      if (op.t === 'add') remove(world, op.x, op.y);
      else if (op.t === 'del') { if (!at(world, op.ent.x, op.ent.y)) world.ents.set(key(op.ent.x, op.ent.y), op.ent); }
      else { const e = at(world, op.x, op.y); if (e) e.dir = op.dir; }
    }
    toast('ひとつ前に戻した', 1400);
  };

  // ---- モーダル ----
  const modal = $('modal'), sheet = $('sheet');
  const closeModal = () => { modal.hidden = true; sheet.replaceChildren(); save(); };
  const showSheet = (...nodes: (Node | string | null)[]) => { sheet.replaceChildren(...nodes.filter((n): n is Node | string => n !== null)); modal.hidden = false; };
  modal.addEventListener('pointerdown', (ev) => { if (ev.target === modal) closeModal(); });
  const closeBtn = () => h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: closeModal }, '閉じる');
  const sheetActions = {
    close: closeModal,
    rotate: (e: Ent) => { group = null; doTurn(e, ((e.dir + 1) % 4) as Dir); },
    erase: (e: Ent) => { group = null; doErase(e.x, e.y); },
  };

  /** 置いたものの説明。設定のある装置は設定シートへ */
  const inspect = (e: Ent) => {
    if (isMachine(e.kind)) { modal.hidden = false; openConfig(sheet, world, e, sheetActions); return; }
    if (e.kind === 'hub') {
      const g = GOALS[world.goal];
      showSheet(h('header', {}, h('h2', {}, '納品所'), closeBtn()),
        h('p', {}, '指定された物質をここへ運ぶ。どの側からでも受け取る。指定と違う物質も受け取るが、数には入らない。'),
        h('p', { class: 'muted' }, g ? `いまの指定：${sub(g.s).name} ${label(g.s)} を ${g.n} 個（${world.count} 個 納品済み）` : '試作段階の指定はすべて終えた。'));
      return;
    }
    const kind = e.kind as Placeable;
    const side = h('div', { class: 'side' });
    const paint = () => side.replaceChildren(
      diagram(e),
      h('button', { class: 'ghost', type: 'button', id: 'info-rotate', onclick: () => { sheetActions.rotate(e); paint(); } }, '↻ 向きを変える'),
      h('button', { class: 'ghost warn', type: 'button', id: 'info-erase', onclick: () => { sheetActions.erase(e); closeModal(); } }, '✕ これを消す'),
    );
    paint();
    showSheet(h('header', {}, h('h2', {}, MACHINES[kind].name), closeBtn()), h('div', { class: 'split' }, about(kind), side));
  };

  const showZone = (x: number, y: number) => {
    const zn = zoneAt(x, y);
    if (!zn) return;
    const z = ZONES[zn];
    showSheet(h('header', {}, h('h2', {}, z.name), closeBtn()),
      h('p', { class: 'eq' }, `${sub(z.resource).name}　`, h('span', { class: 'pill' }, z.form)),
      h('dl', { class: 'about' }, h('dt', {}, '採れるもの'), h('dd', {}, z.about), h('dt', {}, '入試では'), h('dd', {}, z.exam)),
      h('p', { class: 'muted' }, '採取機を置くと、この産出物が 1 秒に 1 個出てくる。'));
  };

  const showHelp = (first = false) => showSheet(
    h('header', {}, first ? h('div', {}, h('p', { class: 'kicker' }, '受験化学の工場'), h('h1', {}, 'Chemyth')) : h('h2', {}, '遊び方'),
      first ? null : closeBtn()),
    h('p', {}, '資源地から原料を採り、装置で分離・反応させ、中央の納品所へ運ぶ。装置は、反応を自分で正しく書けたときだけ動く。'),
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, '採る'), '下の道具から「採取機」を選び、海か大気採取地をタップ。出てくるのは天然のままの混合物。'),
      h('li', {}, h('b', {}, 'つなぐ'), '「ベルト」を選んでなぞる。なぞった向きに流れる。'),
      h('li', {}, h('b', {}, '設定する'), '装置を置くと設定が開く。原料、生成物の化学式、係数、条件を自分で入れる。'),
      h('li', {}, h('b', {}, '納める'), 'ベルトを納品所までつなぐ。要らない副生成物は「廃棄口」へ。出口が詰まると装置は止まる。'),
    ),
    h('p', { class: 'muted' }, '置いたものは「消す」でタップかなぞって消せる。間違えたら右上の「元に戻す」。わからない装置は「見る」でタップすると説明が出る。'),
    first ? h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'start', onclick: closeModal }, '始める')) : null,
  );

  const showLog = () => {
    const PART: Record<string, string> = { reactants: '原料の組み合わせ', products: '生成物', electrodes: '陰極と陽極', coefficients: '係数', condition: '条件', revealed: '答えを見た' };
    const tally = new Map<string, number>();
    for (const m of world.mistakes) {
      const name = m.recipe ? recipeById(m.recipe)?.name ?? m.recipe : MACHINES[m.machine].name;
      const k = `${name}｜${m.part === 'condition' ? CONDITIONS[m.machine].label : PART[m.part]}`;
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    const rows = [...tally].sort((a, b) => b[1] - a[1]);
    const known = [...new Set([...world.ents.values()].map((e) => e.recipe).filter(Boolean))] as string[];
    showSheet(
      h('header', {}, h('h2', {}, '記録'), closeBtn()),
      h('h3', {}, '間違えたところ'),
      rows.length
        ? h('table', { class: 'log' }, ...rows.map(([k, n]) => { const [a, b] = k.split('｜'); return h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', { class: 'n' }, `${n}回`)); }))
        : h('p', { class: 'muted' }, 'まだ間違いはない。'),
      h('h3', {}, 'いま動かしている反応'),
      known.length
        ? h('ul', { class: 'help' }, ...known.map((id) => { const r = recipeById(id)!; return h('li', {}, h('b', {}, r.name), '　', h('span', { class: 'formula' }, equation(r))); }))
        : h('p', { class: 'muted' }, 'まだ装置を設定していない。'),
      h('h3', {}, 'これまでの納品'),
      h('p', { class: 'formula' }, Object.entries(world.delivered).map(([s, n]) => `${label(s)} ×${n}`).join('　') || '—'),
      h('h3', {}, '最初からやり直す'),
      h('div', { class: 'row' }, h('button', { class: 'ghost warn', type: 'button', id: 'b-reset', onclick: showReset }, '工場と記録を消す…')),
    );
  };

  const showReset = () => showSheet(
    h('header', {}, h('h2', {}, '最初からやり直す'), closeBtn()),
    h('p', {}, '工場、納品の進み具合、間違いの記録がすべて消える。元には戻せない。'),
    h('div', { class: 'row' }, h('button', { class: 'danger', type: 'button', id: 'reset-yes', onclick: () => { world = newWorld(); undo.length = 0; save(); closeModal(); toast('最初からやり直した'); } }, '消してやり直す')),
  );

  $('b-help').onclick = () => showHelp();
  $('b-log').onclick = showLog;
  $('b-undo').onclick = doUndo;
  $<HTMLButtonElement>('b-undo').disabled = true;

  // ---- 道具バー ----
  const bar = $('tools'), tip = $('tip');
  const buttons = new Map<Tool, HTMLButtonElement>();
  for (const t of TOOLS) {
    const b = h('button', { type: 'button', id: `tool-${t.id}`, class: 'tool' }, h('span', { class: 'g' }, t.glyph), h('span', { class: 'l' }, t.name));
    b.onclick = () => {
      tool = t.id;
      for (const [id, el] of buttons) { el.classList.toggle('on', id === tool); el.setAttribute('aria-pressed', String(id === tool)); }
      tip.replaceChildren(h('b', {}, t.name), t.tip);
    };
    if (t.color) b.style.setProperty('--tint', t.color);
    buttons.set(t.id, b);
    bar.append(b);
  }
  buttons.get('pan')!.click();

  // ---- 地図の操作 ----
  attachInput(cv, cam, {
    begin: () => { group = null; },
    pans: () => tool !== 'belt' && tool !== 'erase',
    tap(x, y) {
      const e = at(world, x, y);
      if (tool === 'erase') { if (e?.kind === 'hub') toast('納品所は消せない'); else if (!doErase(x, y)) toast('ここには何もない', 1200); return; }
      if (tool === 'rotate') { if (e && e.kind !== 'hub') doTurn(e, ((e.dir + 1) % 4) as Dir); return; }
      if (tool === 'pan') { if (e) inspect(e); else showZone(x, y); return; }
      if (e) {
        if (tool === 'belt' && e.kind === 'belt') doTurn(e, ((e.dir + 1) % 4) as Dir);
        else if (isMachine(e.kind)) inspect(e);
        else toast(`そこには${e.kind === 'hub' ? '納品所' : MACHINES[e.kind as Placeable].name}がある。消すなら「消す」を選べ。`);
        return;
      }
      const err = doPlace(tool, x, y, tool === 'belt' ? beltDir : 0);
      if (err) toast(err);
      else if (isMachine(tool)) inspect(at(world, x, y)!);
    },
    stroke(x, y, prev) {
      if (tool === 'erase') { doErase(x, y); return; }
      if (tool !== 'belt') return;
      if (prev) {
        beltDir = (x > prev[0] ? 0 : x < prev[0] ? 2 : y > prev[1] ? 1 : 3) as Dir;
        const p = at(world, prev[0], prev[1]);
        if (p?.kind === 'belt') doTurn(p, beltDir);
      }
      const e = at(world, x, y);
      if (!e) doPlace('belt', x, y, beltDir);
      else if (e.kind === 'belt' && prev) doTurn(e, beltDir);
    },
  });

  // ---- 目標表示 ----
  const hud = () => {
    const g = GOALS[world.goal];
    if (!g) {
      $('goal-step').textContent = `指令 ${GOALS.length} / ${GOALS.length}`;
      $('goal-name').textContent = '試作段階の納品はすべて完了';
      $('goal-hint').textContent = '記録を開いて、間違えた反応を紙に書き出して確認しろ。';
      $('goal-count').textContent = '';
      $('goal-bar').style.width = '100%';
      return;
    }
    $('goal-step').textContent = `指令 ${world.goal + 1} / ${GOALS.length}`;
    $('goal-name').textContent = `${sub(g.s).name} ${label(g.s)} を ${g.n} 個`;
    $('goal-hint').textContent = g.hint;
    $('goal-count').textContent = `${world.count} / ${g.n}`;
    $('goal-bar').style.width = `${(world.count / g.n) * 100}%`;
  };

  // ---- ループ ----
  const began = performance.now();
  let warned = false, prev = performance.now(), acc = 0, sinceSave = 0;
  const STEP = 1 / 60;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (modal.hidden) {
      acc += dt;
      while (acc >= STEP) { step(world, STEP); acc -= STEP; }
    }
    for (const ev of world.events.splice(0)) {
      if (ev === 'goal-done') toast('納品完了。次の指令が出た。', 3500);
      if (ev === 'all-done') toast('試作段階の指令をすべて終えた。', 5000);
      save();
    }
    sinceSave += dt;
    if (sinceSave > 5) { sinceSave = 0; save(); }
    if (!warned && now - began > SESSION_LIMIT_MS) { warned = true; toast('25分たった。ここで切り上げて休め。', 8000); }
    draw(ctx, cw, ch, world, cam, now / 1000, dt);
    hud();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  let seen = false;
  try { seen = !!localStorage.getItem(SAVE_KEY); } catch { /* 同上 */ }
  if (!seen && !data.save) showHelp(true);
}

if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
