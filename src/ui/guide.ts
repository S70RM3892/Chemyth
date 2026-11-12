/**
 * 用語集と、はじめての手引き。
 * - 用語集：工場の設備（分配器・検知器・弁・昇降機・貨物駅 …）と、地図・学習のことば。押すと説明が開く
 * - はじめての手引き：画面のボタンを順に光らせて、何をするものかを 1 つずつ示す。メニューと遊び方から、いつでも見直せる
 */
import { MACHINES } from '../content/machines';
import type { Kind } from '../engine/world';
import { h } from './dom';
import { prefs } from './prefs';
import { sfx } from './sound';

type Show = (...nodes: (Node | string | null)[]) => void;
type MKind = Exclude<Kind, 'hub' | 'part'>;

/** 設備は、道具の棚の順に並べる */
const SHELVES: { name: string; kinds: MKind[] }[] = [
  { name: '運ぶ', kinds: ['belt', 'bridge', 'tunnel', 'lift', 'splitter', 'analyzer', 'sensor', 'gate', 'station'] },
  { name: '作る', kinds: ['extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'collector', 'settler', 'funnel', 'phoresis'] },
  { name: '出し入れ', kinds: ['sampler', 'depot', 'tank', 'vent'] },
];
/** 設備でないことば：[id, 名前, 説明] */
const WORDS: { name: string; words: [string, string, string][] }[] = [
  { name: '地図と工場', words: [
    ['hub', '納品所', '地図の中央にある、全元素を欲しがる機械。指令の物質をここへ運ぶ。どの側からでも飲み込み、指令と違う物質は在庫になる（「搬出口」で取り出せる）。'],
    ['zone', '資源地', '地図の色のついた区画。採取機を置くと、その産出物が天然のままの姿で出てくる。陸地では、どこでも空気が採れる。タップすると、採れるものと入試での扱いが出る。'],
    ['goal', '指令', 'いま作って納める物質と数（速さを保つ指令もある）。左上の札に出る。達成すると研究点 +30。章ごとに並んでいて、札を押すと章の一覧が開く。'],
    ['rail', '線路', '道具「線路」で、駅か、敷いてある線路からなぞって伸ばす。列車は線路の上を 1.5 倍の速さで走る。枝分かれさせて、何駅でも共有できる。'],
    ['line', '路線番号', '貨物駅の番号。同じ番号の「積む駅」と「降ろす駅」の間を、列車が行き来する。「範囲」で囲んで「番号を振る」と、まとめて付けられる。'],
    ['signal', '信号の番号', '検知器と弁の番号。検知器が出した信号で、同じ番号の弁が開け閉めされる。'],
    ['util', '稼働率', '装置が動いていた時間の割合。「統計」と、地図への重ね表示（J キー）で見られる。'],
    ['jam', '詰まり', '出口の先がふさがって、物が進めない状態。装置は止まり、赤い「！」が出る。重ね表示では、荷が待っているマスが黄 → 赤に塗られる。'],
    ['points', '研究点', '指令の達成・正しい復習・課題などでたまる点。上の帯の「強化」の数字。強化と研究に使う。'],
    ['upgrade', '強化', '計算問題を解いて、採取機・ベルト・装置を速くする。'],
    ['research', '研究', '3 本・4 本引き、長い地下ベルト、信号（検知器と弁）、2 階、列車や装置の能力を開く。二者択一の組は、工場の形に合うほうを選ぶ。'],
    ['area', '範囲・設計図', '「範囲」で四角く囲むと、まとめてコピー・ずらす・消す・番号を振る、ができる。コピーしたものは回して「設計図」として保存でき、どのノートでも使える。'],
    ['floor', '2 階', '研究で開く、もう 1 つの階。「昇降機」で 1 階とつなぐ。上の帯の「1 階・2 階」で切り替える。'],
    ['grade', '操業評価', '指令を終えたときの納品の速さで決まる評価。毎分 6 個以上で B、15 個で A、30 個で S。'],
    ['side', '混ぜ注文', '前の章の物質を、いまの指令とは別に納める注文。終えると研究点が入る。'],
    ['plating', '習熟メッキ', 'その反応を、日を空けた復習で思い出せるほど、装置の縁が銅 → 銀 → 金になる。まちがえると剥がれる。'],
  ] },
  { name: '学習と時間', words: [
    ['review', '復習', '日を空けて問いを出し、思い出せるかを確かめる。間隔は、思い出せる確率が目標（標準 90 %）まで下がる日を目安に決まる。'],
    ['conf', '自信', '答えたあとに「確実・たぶん・勘」を選ぶ。勘で当てたものは、覚えたことにしない。自信を持ってまちがえたものは、早めに出し直す。'],
    ['night', '今夜の 10 問', '就寝の 4 時間前から 1 時間前までに出る、その日に覚えたもの・まちがえたものの問い。'],
    ['morning', '今朝の 10 問', '翌朝、最初に開いたときに、昨夜と同じ問いを出す。寝ている間に残ったかを確かめる。'],
    ['closing', '閉店', '就寝から起床までは、工場を閉める。メニューの「睡眠と試験日」で時刻を変えたり、切ったりできる。'],
    ['cases', '課題', '自分の工場とは別の小さな工場で解く問題：1 か所だけ誤った工場を直す、限られた原料からできる数を先に計算する、中身の見えない装置の反応を当てる。'],
    ['mock', '模試', '自分の工場で動いている反応が、そのまま問題文になる。'],
    ['daily', '前日の控え', '毎日 1 回、その日はじめてノートを保存するときに、前の日までの状態を別の場所に控える。タイトルの「前日に戻す」で戻せる。'],
  ] },
];

/** 用語集の窓。show・closeBtn：本体の窓を使う。back：戻る先（遊び方など） */
export function showGlossary(show: Show, closeBtn: () => HTMLElement, back?: () => void) {
  const q = h('input', { type: 'search', id: 'gl-q', placeholder: 'ことばを探す（例：弁、駅、メッキ）', autocomplete: 'off', ariaLabel: 'ことばを探す' }) as HTMLInputElement;
  const list = h('div', { class: 'gl', id: 'gl-list' });
  let open = '';
  const term = (id: string, name: string, text: string, more?: string, chip?: HTMLElement) => {
    const body = h('div', { class: 'gl-text', id: `gl-${id}-text`, hidden: open !== id }, h('p', {}, text), more ? h('p', { class: 'muted' }, more) : null);
    const btn = h('button', { class: 'gl-name' + (open === id ? ' on' : ''), type: 'button', id: `gl-${id}`, ariaExpanded: String(open === id), onclick: () => { open = open === id ? '' : id; sfx.tap(); paint(); } }, chip ?? null, name);
    return h('div', { class: 'gl-term' + (open === id ? ' open' : '') }, btn, body);
  };
  const norm = (t: string) => t.toLowerCase().replace(/\s/g, '');
  const paint = () => {
    const k = norm(q.value), hit = (s: string) => !k || norm(s).includes(k);
    const groups: HTMLElement[] = [];
    for (const s of SHELVES) {
      const items = s.kinds.filter((id) => hit(MACHINES[id].name) || hit(MACHINES[id].what)).map((id) => {
        const m = MACHINES[id], chip = h('span', { class: 'gl-chip' }, m.glyph);
        chip.style.background = m.color;
        return term(id, m.name, m.what, m.ports, chip);
      });
      if (items.length) groups.push(h('h3', {}, `設備（${s.name}）`), h('div', { class: 'gl-grid' }, ...items));
    }
    for (const g of WORDS) {
      const items = g.words.filter(([, name, text]) => hit(name) || hit(text)).map(([id, name, text]) => term(id, name, text));
      if (items.length) groups.push(h('h3', {}, g.name), h('div', { class: 'gl-grid' }, ...items));
    }
    list.replaceChildren(...(groups.length ? groups : [h('p', { class: 'muted' }, '見つからなかった。')]));
  };
  q.oninput = () => { open = ''; paint(); };
  show(h('header', {}, h('h2', {}, '用語集'), back ? h('button', { class: 'ghost', type: 'button', id: 'gl-back', onclick: back }, '戻る') : closeBtn()),
    h('p', { class: 'muted' }, 'ことばを押すと、説明が開く。設備は、下の道具の棚の順に並べてある。'), q, list);
  paint();
}

// ---------------- はじめての手引き ----------------

/** 光らせる場所と説明。見えていない場所（狭い画面の小地図など）は飛ばす */
const STEPS: { sel: string | null; title: string; text: string }[] = [
  { sel: '#goal', title: '指令', text: 'いま作って納める物質と数。押すと章の一覧が開く。右上の ▴ でたたむと、細い帯になる。' },
  { sel: '#tabs', title: '道具の棚', text: '道具は「運ぶ・作る・出し入れ・編集」の 4 つの棚に分かれている。押して棚を切り替える。' },
  { sel: '#tools', title: '道具', text: '選んでから地図をタップすると置ける。まず「作る」の棚の「採取機」を置き、そこから指を引いてベルトを中央の納品所へつなぐ。' },
  { sel: '#tool-pan', title: '見る', text: 'タップで選ぶ。置いたものを長押ししてそのまま動かすと、ずらせる。何もない所を引くと、地図が動く。' },
  { sel: '#b-undo', title: '元に戻す', text: 'まちがえたら、ひとつ前に戻す（2 本指で軽くたたいても戻る）。' },
  { sel: '#b-speed', title: '速さ', text: '押すたびに ×1 → ×2 → ×4 → 停止。' },
  { sel: '#b-review', title: '復習', text: '数字は、いま待っている復習の数。日を空けて解くほど、覚えていられる。' },
  { sel: '#b-up', title: '強化と研究', text: '数字は研究点。採取・運搬・処理を速くしたり、新しい道具を研究したりする。赤い点は、使える研究点がたまった印。' },
  { sel: '#b-stats', title: '統計', text: '納品の速さ、装置の稼働率、止まっている理由、学習の進み。' },
  { sel: '#b-book', title: '図鑑', text: '物質・反応・元素の形を調べる。' },
  { sel: '#b-menu', title: 'メニュー', text: '章の一覧・演習・課題・設定・データ・遊び方・用語集。この手引きも、ここからもう一度見られる。' },
  { sel: '#minimap', title: '小地図', text: '工場の全体。押すと、その場所へ移る。' },
  { sel: null, title: 'ここから', text: 'まずは指令の物質を作るところから。わからないことばは、メニューの「用語集」で引ける。' },
];
let tour: { el: HTMLElement; i: number; end(): void } | null = null;
export const tourActive = () => !!tour;
/** 横に流れる帯（上の帯・道具の棚）の中なら、その帯だけを動かして見せる（scrollIntoView はページ全体まで動かしてしまう） */
const reveal = (el: HTMLElement) => {
  const strip = el.parentElement?.closest<HTMLElement>('#topbtns, #tools');
  if (!strip) return;
  const r = el.getBoundingClientRect(), s = strip.getBoundingClientRect();
  if (r.left < s.left) strip.scrollLeft -= s.left - r.left + 12;
  else if (r.right > s.right) strip.scrollLeft += r.right - s.right + 12;
};
const visible = (el: Element | null): el is HTMLElement => {
  if (!el || !(el instanceof HTMLElement) || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
};

/** はじめての手引きを始める。from：何番目から */
export function startTour(from = 0) {
  tour?.end();
  const ring = h('div', { class: 'tour-ring', id: 'tour-ring' }), tip = h('div', { class: 'tour-tip', id: 'tour-tip', role: 'dialog', ariaLabel: 'はじめての手引き' });
  const el = h('div', { id: 'tour' }, ring, tip);
  document.getElementById('app')?.append(el);
  const steps = () => STEPS.filter((s) => !s.sel || visible(document.querySelector(s.sel)));
  const place = () => {
    if (!tour) return;
    const list = steps(), i = Math.min(tour.i, list.length - 1), s = list[i], target = s.sel ? document.querySelector<HTMLElement>(s.sel) : null;
    if (target) reveal(target);
    const W = window.innerWidth, H = window.innerHeight;
    tip.replaceChildren(
      h('p', { class: 'tour-n' }, `はじめての手引き　${i + 1} / ${list.length}`),
      h('b', {}, s.title), h('p', {}, s.text),
      h('div', { class: 'row' },
        i > 0 ? h('button', { class: 'ghost', type: 'button', id: 'tour-back', onclick: () => go(-1) }, '戻る') : null,
        i < list.length - 1 ? h('button', { class: 'primary', type: 'button', id: 'tour-next', onclick: () => go(1) }, '次へ') : null,
        h('button', { class: i < list.length - 1 ? 'ghost' : 'primary', type: 'button', id: 'tour-end', onclick: () => tour?.end() }, i < list.length - 1 ? '終える' : '始める')));
    const tw = Math.min(360, W - 24);
    tip.style.width = `${tw}px`;
    if (!target) {
      ring.hidden = true;
      tip.style.left = `${Math.round((W - tw) / 2)}px`; tip.style.top = `${Math.round(H * 0.3)}px`;
      return;
    }
    const r = target.getBoundingClientRect(), pad = 6;
    ring.hidden = false;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const th = tip.offsetHeight || 150, below = r.bottom + pad + 12, above = r.top - pad - 12 - th;
    const top = below + th <= H - 8 ? below : above >= 8 ? above : Math.max(8, H - th - 8);
    tip.style.left = `${Math.round(Math.min(W - tw - 12, Math.max(12, r.left + r.width / 2 - tw / 2)))}px`;
    tip.style.top = `${Math.round(top)}px`;
  };
  const go = (d: number) => { if (!tour) return; tour.i = Math.max(0, Math.min(steps().length - 1, Math.min(tour.i, steps().length - 1) + d)); sfx.tap(); place(); };
  const onKey = (ev: KeyboardEvent) => {
    const k = ev.key;
    if (k === 'Escape') tour?.end();
    else if (k === 'ArrowRight' || k === 'Enter') go(1);
    else if (k === 'ArrowLeft') go(-1);
    else return;
    ev.preventDefault(); ev.stopImmediatePropagation();
  };
  const onResize = () => place();
  tour = {
    el, i: from,
    end() { el.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); tour = null; },
  };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  el.classList.toggle('calm', prefs().calm);
  place();
  // 吹き出しの高さが決まってから、もう一度置き直す
  requestAnimationFrame(place);
}
