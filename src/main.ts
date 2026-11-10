import { GOALS, MAP_H, MAP_W } from './content/map';
import { recipeById, CONDITIONS } from './content/recipes';
import { label, sub } from './content/substances';
import { at, deserialize, isMachine, newWorld, place, remove, serialize, step, type Dir, type Kind, type World } from './engine/world';
import { equation, openConfig } from './ui/config';
import { $, h } from './ui/dom';
import { attachInput } from './ui/input';
import { describe, draw, MACHINE_STYLE, type Camera } from './ui/render';

type Tool = 'pan' | 'belt' | 'rotate' | 'erase' | Exclude<Kind, 'belt' | 'hub'>;
const SAVE_KEY = 'chemyth-save-v1';
const SESSION_LIMIT_MS = 25 * 60 * 1000;

const TOOLS: { id: Tool; glyph: string; name: string }[] = [
  { id: 'pan', glyph: '✥', name: '移動・設定' },
  { id: 'belt', glyph: '→', name: 'ベルト' },
  { id: 'extractor', glyph: '採', name: '採取機' },
  { id: 'separator', glyph: '留', name: '分留塔' },
  { id: 'electrolyzer', glyph: '電', name: '電解槽' },
  { id: 'reactor', glyph: '反', name: '反応器' },
  { id: 'vent', glyph: '放', name: '放出口' },
  { id: 'rotate', glyph: '↻', name: '回転' },
  { id: 'erase', glyph: '✕', name: '撤去' },
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

  // ---- モーダル ----
  const modal = $('modal'), sheet = $('sheet');
  const closeModal = () => { modal.hidden = true; sheet.replaceChildren(); save(); };
  const showSheet = (...nodes: (Node | string)[]) => { sheet.replaceChildren(...nodes); modal.hidden = false; };
  modal.addEventListener('pointerdown', (ev) => { if (ev.target === modal) closeModal(); });
  const closeBtn = () => h('button', { class: 'ghost', type: 'button', onclick: closeModal }, '閉じる');

  const configure = (x: number, y: number) => {
    const e = at(world, x, y);
    if (!e || !isMachine(e.kind)) return;
    modal.hidden = false;
    openConfig(sheet, world, e, closeModal);
  };

  const showHelp = () => showSheet(
    h('header', {}, h('h2', {}, '遊び方'), closeBtn()),
    h('p', {}, '資源地から原料を採り、装置で反応させ、中央の納品ハブへ運ぶ。'),
    h('ul', { class: 'help' },
      h('li', {}, h('b', {}, '移動・設定'), '：1本指で地図を動かす。装置をタップすると設定を開く。2本指でいつでも拡大縮小。'),
      h('li', {}, h('b', {}, 'ベルト'), '：なぞった向きに敷かれる。'),
      h('li', {}, h('b', {}, '採取機'), '：海か大気採取地に置く。正面へ原料を出す。'),
      h('li', {}, h('b', {}, '分留塔・電解槽・反応器'), '：原料、生成物の化学式、係数、条件を自分で入力する。合っていれば動く。'),
      h('li', {}, h('b', {}, '出口'), '：1つ目の生成物は正面、2つ目は右手、3つ目は左手から出る。出口が詰まると装置は止まる。要らない物質は放出口へ流せ。'),
      h('li', {}, h('b', {}, '原料の入口'), '：ベルトをどの側からつないでもよい。2種類の原料は別々のベルトで入れろ。同じベルトに混ぜると詰まる。'),
    ),
  );

  const showLog = () => {
    const PART: Record<string, string> = { reactants: '原料の組み合わせ', products: '生成物', electrodes: '陰極と陽極', coefficients: '係数', condition: '条件', revealed: '答えを見た' };
    const tally = new Map<string, number>();
    for (const m of world.mistakes) {
      const name = m.recipe ? recipeById(m.recipe)?.name ?? m.recipe : MACHINE_STYLE[m.machine].name;
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
    );
  };

  const showReset = () => showSheet(
    h('header', {}, h('h2', {}, '最初からやり直す'), closeBtn()),
    h('p', {}, '工場、納品の進み具合、間違いの記録がすべて消える。'),
    h('div', { class: 'row' }, h('button', { class: 'danger', type: 'button', id: 'reset-yes', onclick: () => { world = newWorld(); save(); closeModal(); hud(); toast('最初からやり直した'); } }, '消してやり直す')),
  );

  $('b-help').onclick = showHelp;
  $('b-log').onclick = showLog;
  $('b-reset').onclick = showReset;

  // ---- 道具バー ----
  const bar = $('tools');
  const buttons = new Map<Tool, HTMLButtonElement>();
  for (const t of TOOLS) {
    const b = h('button', { type: 'button', id: `tool-${t.id}`, class: 'tool' }, h('span', { class: 'g' }, t.glyph), h('span', { class: 'l' }, t.name));
    b.onclick = () => {
      tool = t.id;
      for (const [id, el] of buttons) { el.classList.toggle('on', id === tool); el.setAttribute('aria-pressed', String(id === tool)); }
    };
    if (t.id in MACHINE_STYLE) b.style.setProperty('--tint', MACHINE_STYLE[t.id as keyof typeof MACHINE_STYLE].color);
    buttons.set(t.id, b);
    bar.append(b);
  }
  buttons.get('pan')!.click();

  // ---- 地図の操作 ----
  attachInput(cv, cam, {
    pans: () => tool === 'pan' || tool === 'rotate' || (tool !== 'belt' && tool !== 'erase'),
    tap(x, y) {
      const e = at(world, x, y);
      if (tool === 'erase') { if (e?.kind === 'hub') toast('納品ハブは撤去できない'); else remove(world, x, y); return; }
      if (tool === 'rotate') { if (e && e.kind !== 'hub') e.dir = ((e.dir + 1) % 4) as Dir; return; }
      if (e) {
        if (isMachine(e.kind)) configure(x, y);
        else if (tool === 'belt' && e.kind === 'belt') e.dir = ((e.dir + 1) % 4) as Dir;
        else toast(describe(e));
        return;
      }
      if (tool === 'pan') return;
      const err = place(world, tool, x, y, tool === 'belt' ? beltDir : 0);
      if (err) toast(err);
      else if (isMachine(tool)) configure(x, y);
    },
    stroke(x, y, prev) {
      if (tool === 'erase') { remove(world, x, y); return; }
      if (tool !== 'belt') return;
      if (prev) {
        beltDir = (x > prev[0] ? 0 : x < prev[0] ? 2 : y > prev[1] ? 1 : 3) as Dir;
        const p = at(world, prev[0], prev[1]);
        if (p?.kind === 'belt') p.dir = beltDir;
      }
      const e = at(world, x, y);
      if (!e) place(world, 'belt', x, y, beltDir);
      else if (e.kind === 'belt' && prev) e.dir = beltDir;
    },
  });

  // ---- 目標表示 ----
  const hud = () => {
    const g = GOALS[world.goal];
    if (!g) {
      $('goal-step').textContent = `納品 ${GOALS.length} / ${GOALS.length}`;
      $('goal-name').textContent = '試作段階の納品はすべて完了';
      $('goal-hint').textContent = '記録を開いて、間違えた反応を紙に書き出して確認しろ。';
      $('goal-bar').style.width = '100%';
      return;
    }
    $('goal-step').textContent = `納品 ${world.goal + 1} / ${GOALS.length}`;
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
      if (ev === 'goal-done') toast('納品完了。次の指定が出た。', 3500);
      if (ev === 'all-done') toast('試作段階の納品をすべて終えた。', 5000);
      save();
    }
    sinceSave += dt;
    if (sinceSave > 5) { sinceSave = 0; save(); }
    if (!warned && now - began > SESSION_LIMIT_MS) { warned = true; toast('25分たった。ここで切り上げて休め。', 8000); }
    draw(ctx, cw, ch, world, cam);
    hud();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  let seen = false;
  try { seen = !!localStorage.getItem(SAVE_KEY); } catch { /* 同上 */ }
  if (!seen && !data.save) showHelp();
}

if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
