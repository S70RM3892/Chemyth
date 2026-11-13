/**
 * 復習の画面。答える → 自信を選ぶ → 正誤と解説、の順に進む。
 * 自信を持ってまちがえたものは、はっきり知らせて早めに出し直す（訂正したあと定着しやすい）。勘で当てたものは「覚えた」に数えない。
 * 反応で前回まちがえたものは、設定の画面で、すべてを組み直させる。
 */
import { KNOWLEDGE } from '../content/knowledge';
import { equationOf } from '../content/looks';
import { recipeById } from '../content/recipes';
import { DAILY_BONUS, DAILY_GOAL, dailyBonus, daysToExam, streakOf, todayCount } from '../engine/habit';
import { answer, relearnReady, type World } from '../engine/world';
import { buildQueue, groupsOf, partsFor, quizFor, type Quiz } from '../engine/quiz';
import type { Confidence } from '../engine/fsrs';
import { calibAdvice, hintFor, practiceIds, recordTime, snapAnswer, tagWhy, undoAnswer, UNDO_MS } from '../engine/learn';
import { WHY_NAME, WHY_TIP, type Why } from '../engine/study';
import { openConfig } from './config';
import { h } from './dom';
import type { PanelCtx } from './panels';
import { sfx } from './sound';
import { buzz } from './prefs';
import { linkText } from './subcard';

const CONF: [Confidence, string][] = [['sure', '確実'], ['maybe', 'たぶん'], ['guess', '勘']];
const shuffled = <T>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pct = (a: [number, number]) => (a[0] ? `${Math.round((a[1] / a[0]) * 100)} %（${a[0]} 問）` : '—');

/** 自信ごとの正答率。「確実」の正答率が低いなら、思い込みでまちがえている */
export function calibLine(w: World): string {
  return `確実：${pct(w.calib.sure)}　たぶん：${pct(w.calib.maybe)}　勘：${pct(w.calib.guess)}`;
}

export interface QuizResult { ok: boolean; conf?: Confidence; hc: boolean; /** ヒントを見て答えた */ hint?: boolean }

/** 今日の目標までの進み（復習の画面の上に出す横棒） */
function paintGoal(el: HTMLElement, w: World) {
  const [n] = todayCount(w), done = n >= DAILY_GOAL, fill = h('i', {});
  fill.style.width = `${Math.round(Math.min(1, n / DAILY_GOAL) * 100)}%`;
  el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', String(DAILY_GOAL)); el.setAttribute('aria-valuenow', String(Math.min(n, DAILY_GOAL)));
  el.replaceChildren(h('span', { class: 'rv-goal-t' }, done ? `今日の目標 ${DAILY_GOAL} 問：達成（${n} 問）` : `今日の目標まで あと ${DAILY_GOAL - n} 問（${n} / ${DAILY_GOAL}）`), h('span', { class: 'meter' + (done ? ' good' : '') }, fill));
}
const goalBar = (w: World) => { const el = h('div', { class: 'rv-goal', id: 'rv-goal' }); paintGoal(el, w); return el; };

/** 描いた問い（新しいものが後ろ。描く場所ごとに 1 つ）。キーボードで答えるのに使う（数字で選択肢 → 数字で自信、Enter で次へ） */
interface Active { root: HTMLElement; choose(i: number): boolean; conf(i: number): boolean; next(): boolean }
let actives: Active[] = [];
/** 同じ場所に描き直したら、前の問いは捨てる（工場の札は、同じ場所に次の問いを描く） */
const setActive = (a: Active) => { actives = [...actives.filter((x) => x.root !== a.root && x.root.isConnected), a]; };
/**
 * 押されたキーで問いに答える。使ったら true。
 * within を渡すと、その中の問いにだけ答える（窓を開いている間は、窓の下に残った工場の札に答えない）。隠れた問いと、開いた窓の後ろ（inert）の札の問いにも答えない
 */
export function quizKey(key: string, within?: HTMLElement | null): boolean {
  const a = [...actives].reverse().find((x) => x.root.isConnected && !x.root.closest('[hidden], [inert]') && (!within || within.contains(x.root)));
  if (!a) return false;
  if (/^[1-9]$/.test(key)) { const n = Number(key) - 1; return a.choose(n) || a.conf(n); }
  if (key === 'Enter') return a.next();
  return false;
}
/** 練習で出す問い。すべてを組み直す問い（前回まちがえた反応）は、選ぶ問いに替える。作れなければ null */
function choiceQuiz(w: World, id: string): Quiz | null {
  const q = quizFor(w, id);
  if (q?.part !== 'full') return q;
  const r = recipeById(id.slice(2)), part = r ? partsFor(r)[0] : undefined;
  const q2 = part ? quizFor(w, id, Math.random, part) : null;
  return q2 && q2.part !== 'full' ? q2 : null;
}
/** キーボードのある端末か（選択肢に数字を添える） */
const keyboardish = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
/** 今日の数・続いた日数・試験までの日数の一行 */
export function habitLine(w: World): string {
  const [n] = todayCount(w), st = streakOf(w), ex = daysToExam(w);
  return `今日 ${n} 問（目標 ${DAILY_GOAL}）　連続 ${st} 日${ex !== null ? `　次の試験まで ${ex} 日` : ''}`;
}

/**
 * 問いを 1 つ描く。choose（答え）→ 自信 → 結果。full（すべてを組み直す）は、onFull で設定の画面を開き、結果を受け取る。
 * compact：工場の画面の端に出す小さな札のとき。
 * 答える前に「ヒント」を押せる（使うと、覚え具合は「たぶん」まで）。onUndo を渡すと、答えてから 5 秒の間「取り消す」を出す（押しまちがい用）。
 * 取り消して選び直すときは、もう正しい答えを見ているので（seen）、ヒントを使ったのと同じく「たぶん」までとする。
 * extra：結果の 1 行目のあとに足すもの（連続正解など）
 */
export function renderQuiz(root: HTMLElement, w: World, q: Quiz, o: { compact?: boolean; practice?: boolean; seen?: boolean; onFull: (done: (ok: boolean) => void) => void; onDone: (r: QuizResult) => void; next?: { label: string; go: () => void }; onUndo?: (r: QuizResult) => void; extra?: (r: QuizResult) => HTMLElement | null }) {
  const group = groupsOf(q.id)[0];
  const head = h('div', { class: 'rv-head' }, h('span', { class: 'pill' }, q.topic || '復習'), group ? h('span', { class: 'pill contrast', title: '取り違えやすい組。続けて相手も出る' }, `見比べ：${group.name}`) : null);
  const result = h('div', { class: 'answer rv-result', hidden: true });
  // 答えるまでの時間：問いを出してから、選択肢を選ぶまで
  const shownAt = Date.now();
  // 取り消したあとの選び直しは、答えを見たあと。ヒントを使ったのと同じに扱う
  let pickedAt = shownAt, hinted = !!o.seen && !o.practice;
  const finish = (ok: boolean, conf: Confidence | undefined, picked?: string) => {
    // 練習（解き直し・図鑑から）は、予定も記録も動かさない。取り消せるように、答える前の状態を控える
    const snap = !o.practice && q.part !== 'full' && o.onUndo ? snapAnswer(w, q.id) : null;
    const p0 = w.points;
    // 答えを見てからの選び直しは、思い出すのにかかった時間ではないので数えない
    if (!o.practice) { answer(w, q.id, ok, conf, Date.now(), hinted); if (q.part !== 'full' && !o.seen) recordTime(w, q.id, pickedAt - shownAt); }
    const hc = !ok && conf === 'sure', lucky = ok && conf === 'guess';
    if (!ok && q.part !== 'full' && !o.practice) w.mistakes.push({ machine: q.id.startsWith('k:') ? 'quiz' : (recipeById(q.id.slice(2))?.machine ?? 'quiz'), recipe: q.id.slice(2), part: q.part === 'k' ? 'quiz' : q.part === 'coef' ? 'coefficients' : q.part === 'cond' ? 'condition' : q.part === 'pole' ? 'electrodes' : 'products', t: Date.now() });
    ok && !lucky ? sfx.ok() : sfx.bad();
    if (!ok) buzz([30, 40, 30]);
    // 取り違えやすい組の相手：まちがえたら、相手の問いも続けて解いて見比べる（練習）。
    // 反応は覚えたものだけ（まだ組んでいない反応の答えを見せない）。組み直す問いは、選ぶ問いに替えて出す
    const mate = !ok || lucky ? group?.ids.find((x) => x !== q.id && (x.startsWith('k:') || w.learned.includes(x.slice(2))) && choiceQuiz(w, x)) : undefined;
    if (ok && conf !== 'guess' && !o.practice) w.points += 3;
    const bonus = !o.practice && dailyBonus(w);
    if (snap) snap.gain = w.points - p0;
    const r = q.id.startsWith('r:') ? recipeById(q.id.slice(2)) : undefined;
    const res: QuizResult = { ok, conf, hc, hint: hinted };
    // 反応式と解説の中の物質名は、押すとその場で図鑑の札が開く
    const subBox = h('div', { class: 'rv-sub', hidden: true });
    // まちがえた理由（うっかり・知らなかった・取り違え）。記録で数える
    const whyTip = h('p', { class: 'muted rv-why-tip' });
    const whyRow: HTMLElement | null = !ok && !o.practice && q.part !== 'full' ? h('div', { class: 'row rv-why' }, h('span', { class: 'muted' }, 'なぜまちがえた？'),
      ...(['slip', 'unknown', 'mixup'] as Why[]).map((k) => {
        const b = h('button', { class: 'chip plain', type: 'button', id: `rv-why-${k}` }, WHY_NAME[k]);
        b.onclick = () => { tagWhy(w, q.id, k); for (const x of b.parentElement!.querySelectorAll('button')) x.classList.toggle('on', x === b); whyTip.textContent = WHY_TIP[k]; sfx.tap(); };
        return b;
      })) : null;
    const undoBtn = snap ? h('button', { class: 'ghost rv-undo', type: 'button', id: 'rv-undo' }, '取り消す') : null;
    // 「もう一度」「見比べ」はわき道の練習：呼び出し元の正解の数や連続正解には数えない
    const side = { ...o, practice: true, seen: undefined, onDone: () => undefined, onUndo: undefined, extra: undefined };
    const parts: (HTMLElement | null)[] = [
      h('p', { class: hc ? 'rv-hc' : '' }, h('b', {}, hc ? '自信を持ってまちがえた。ここがいちばん伸びる所' : ok ? (lucky ? '当たったが、勘' : '正解') : '不正解'),
        picked !== undefined && !ok ? `　正しくは「${q.choices[0]}」` : ''),
      lucky && !o.practice ? h('p', { class: 'muted' }, '勘で当てたものは、覚えたことにしない。今日のうちに、もう一度出す。') : null,
      hinted && !o.practice ? h('p', { class: 'muted' }, o.seen ? '答えを見てから選び直したので、覚え具合は「たぶん」までとして記録した。自信ごとの正答率には入れない。' : 'ヒントを見たので、覚え具合は「たぶん」までとして記録した。自信ごとの正答率には入れない。') : null,
      !ok && !o.practice ? h('p', { class: 'muted' }, hc ? '1 分後に、もう一度出す。紙に正しい答えを書いて、なぜ思い込んだかも書け。' : '今日のうちに、正解するまで戻ってくる。') : null,
      r ? h('p', { class: 'rv-eq' }, h('span', { class: 'muted' }, '反応式　'), h('b', {}, ...linkText(equationOf(r), [...r.inputs, ...r.outputs].map(([x]) => x), subBox)), r.accept[0] && r.accept[0] !== 'なし' ? h('span', { class: 'muted' }, `　条件：${r.accept[0]}`) : null) : null,
      h('p', { class: 'note' }, ...linkText(q.why, w.discovered, subBox)),
      subBox,
      whyRow, whyRow ? whyTip : null,
      bonus ? h('p', { class: 'rv-bonus' }, `今日の目標 ${DAILY_GOAL} 問に達した。研究点 +${DAILY_BONUS}。`) : null,
      o.practice ? h('p', { class: 'muted' }, '練習なので、復習の予定と記録は動かさない。') : null,
      h('div', { class: 'row' },
        !ok || lucky ? h('button', { class: 'ghost', type: 'button', id: 'rv-again', onclick: () => renderQuiz(root, w, q, side) }, 'もう一度（練習）') : null,
        // 相手の問いは組み直す問いにならないので、呼び出し元の onFull（この問いの反応を組み直す）は渡さない
        mate ? h('button', { class: 'ghost', type: 'button', id: 'rv-mate', onclick: () => { const mq = choiceQuiz(w, mate); if (mq) renderQuiz(root, w, mq, { ...side, onFull: () => undefined }); } }, `見比べ：${group!.name}の相手も解く`) : null,
        undoBtn,
        o.next ? h('button', { class: 'primary', type: 'button', id: 'rv-next', onclick: o.next.go }, o.next.label) : null)];
    result.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
    result.hidden = false;
    o.onDone(res);
    const ex = o.extra?.(res);
    if (ex) result.firstElementChild?.after(ex);
    // 押しまちがい：5 秒の間だけ、答えを取り消して選び直せる
    if (undoBtn && snap) {
      const tick = () => {
        const left = Math.ceil((snap.at + UNDO_MS - Date.now()) / 1000);
        if (left <= 0 || !undoBtn.isConnected) { window.clearInterval(timer); undoBtn.remove(); return; }
        undoBtn.textContent = `取り消す（${left} 秒）`;
      };
      const timer = window.setInterval(tick, 250);
      tick();
      undoBtn.onclick = () => {
        window.clearInterval(timer);
        if (!undoAnswer(w, snap)) { undoBtn.remove(); return; }
        o.onUndo!(res);
        sfx.tap();
        renderQuiz(root, w, q, { ...o, seen: true });
      };
    }
  };
  const next = () => { const b = result.hidden ? null : result.querySelector<HTMLButtonElement>('#rv-next'); if (!b) return false; b.click(); return true; };
  if (q.part === 'full') {
    root.replaceChildren(head, h('p', { class: 'qtext' }, q.q),
      h('p', { class: 'muted' }, '前回まちがえた反応は、原料・生成物・係数・条件を、すべて組み直す。'),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'rv-full', onclick: () => o.onFull((ok) => finish(ok, undefined)) }, '設定の画面で組み直す')), result);
    // 選ぶものはない。前に同じ場所へ描いた問いのキーが、残って効かないようにする（Enter は組み直したあとの「次へ」だけ）
    setActive({ root, choose: () => false, conf: () => false, next });
    return;
  }
  const choices = shuffled(q.choices);
  const opts = h('div', { class: o.compact ? 'menu rv-choices compact' : 'menu rv-choices' });
  const confRow = h('div', { class: 'row rv-conf', hidden: true }, h('span', { class: 'muted' }, '自信は？'));
  let picked = '';
  const keys = keyboardish();
  // 答える前のヒント：問いに出ていない手がかりを 1 つ。使うと、覚え具合は「たぶん」まで
  const hint = hintFor(q);
  const hintText = h('p', { class: 'rv-hint', id: 'rv-hint-text', hidden: true });
  const hintBtn = hint && !hinted ? h('button', { class: 'ghost mini rv-hint-btn', type: 'button', id: 'rv-hint' }, o.practice ? 'ヒント' : 'ヒント（使うと「たぶん」まで）') : null;
  if (hint && hintBtn) hintBtn.onclick = () => {
    if (picked || hinted) return;
    hinted = true;
    hintText.textContent = `ヒント：${hint.text}`;
    hintText.hidden = false;
    hintBtn.closest('.rv-hint-row')?.remove();
    for (const x of opts.children) { const el = x as HTMLButtonElement; if (hint.drop.includes(el.dataset.v ?? '')) { el.disabled = true; el.classList.add('dropped'); } }
    sfx.tap();
  };
  for (const [i, ch] of choices.entries()) {
    const b = h('button', { class: 'ghost', type: 'button', id: `rv-c-${i}` }, keys ? h('kbd', {}, String(i + 1)) : null, ch);
    b.dataset.v = ch;
    b.onclick = () => {
      if (picked) return;
      picked = ch;
      pickedAt = Date.now();
      hintBtn?.closest('.rv-hint-row')?.remove();
      for (const x of opts.children) (x as HTMLButtonElement).disabled = true;
      b.classList.add('chosen');
      confRow.hidden = false;
      sfx.tap();
    };
    opts.append(b);
  }
  for (const [ci, [c, name]] of CONF.entries()) confRow.append(h('button', { class: 'ghost', type: 'button', id: `rv-conf-${c}`, onclick: () => {
    if (!picked || !result.hidden) return;
    const ok = picked === q.choices[0];
    for (const x of confRow.querySelectorAll('button')) (x as HTMLButtonElement).disabled = true;
    for (const x of opts.children) { const el = x as HTMLButtonElement; el.classList.toggle('picked', el.dataset.v === q.choices[0]); el.classList.toggle('wrong', el.dataset.v === picked && !ok); }
    finish(ok, c, picked);
  } }, keys ? h('kbd', {}, String(ci + 1)) : null, name));
  const nodes: (HTMLElement | null)[] = [head, o.practice ? h('p', { class: 'muted' }, '練習（予定は動かさない）') : null,
    hinted ? h('p', { class: 'muted', id: 'rv-seen' }, '選び直し（答えを見たので「たぶん」まで）') : null,
    h('p', { class: 'qtext' }, q.q), hintBtn ? h('div', { class: 'row rv-hint-row' }, hintBtn) : null, hintText, opts, confRow, result];
  root.replaceChildren(...nodes.filter((x): x is HTMLElement => !!x));
  setActive({
    root,
    choose: (i) => { if (picked) return false; const b = opts.children[i] as HTMLButtonElement | undefined; if (!b) return false; b.click(); return true; },
    conf: (i) => { if (!picked || !result.hidden) return false; const b = confRow.querySelectorAll('button')[i]; if (!b) return false; b.click(); return true; },
    next,
  });
}
/**
 * 決まった問いの一覧を、その場で解く（苦手の一覧・間違いの記録・図鑑から）。practice なら予定を動かさない。
 * 練習は、記録で選んだ順番（混ぜる・苦手から）に並べる。終わったら、何問正解したかを返す
 */
export function solveList(c: PanelCtx, title: string, ids: string[], practice: boolean, done?: (right: number) => void) {
  const { w } = c;
  // 練習では、すべてを組み直す問い（前回まちがえた反応）も、選ぶ問いとして出す
  const pick = (id: string): Quiz | null => choiceQuiz(w, id);
  // 10 問は、渡された並び（まちがえたもの・苦手なものが先）で選んでから、練習の順番に並べる
  const list = practice ? practiceIds(w, ids, (id) => !!pick(id)) : ids.filter((id) => pick(id)).slice(0, 10);
  let right = 0;
  const closeBtn = () => h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる');
  const step = (i: number) => {
    const id = list[i];
    if (!id) { c.show(h('header', {}, h('h2', {}, title), closeBtn()), h('p', { class: 'qtext' }, list.length ? `${list.length} 問中 ${right} 問正解。` : '解ける問いがない。'), h('p', { class: 'muted' }, habitLine(w))); done?.(right); return; }
    const q = pick(id)!;
    const body = h('div', { class: 'rv-body' });
    c.show(h('header', {}, h('h2', {}, title), closeBtn()), h('p', { class: 'muted' }, `${i + 1} / ${list.length}`), body);
    renderQuiz(body, w, q, {
      practice,
      onFull: () => { /* 組み直す問いは、ここでは選ぶ問いとして出す */ },
      onDone: (r) => { if (r.ok && r.conf !== 'guess') right++; },
      next: { label: i + 1 < list.length ? '次へ' : '結果を見る', go: () => step(i + 1) },
    });
  };
  step(0);
}

/** 復習の画面（上の「復習」ボタン）。今日まちがえたもの → 期限の来たもの、の順。取り違えやすい組は続けて出す */
export function showReview(c: PanelCtx) {
  const { w } = c;
  const now = Date.now();
  const queue = buildQueue(w, now, 10, relearnReady(w, now));
  // まだ出していない知識の問いを、少しずつ混ぜる
  const fresh = KNOWLEDGE.filter((k) => !w.srs[`k:${k.id}`]).slice(0, Math.max(1, 4 - queue.length)).map((k) => `k:${k.id}`);
  const list = [...queue, ...fresh].slice(0, 10);
  // combo：続けて思い出せた数（表示だけ。勘で当たったものと、まちがえたもので 0 に戻る）
  let right = 0, combo = 0, best = 0;
  // 自信を持ってまちがえた問い（出したときのまま。答えたあとに作り直すと、組み直す問いになって答えが消える）
  const hcs: Quiz[] = [];
  const closeBtn = () => h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる');
  const finish = () => {
    const next = Object.values(w.srs).map((x) => x.due).sort((a, b) => a - b)[0];
    const mins = next ? Math.max(0, Math.round((next - Date.now()) / 60000)) : 0;
    c.show(h('header', {}, h('h2', {}, '復習'), closeBtn()),
      h('p', { class: 'qtext' }, list.length ? `${list.length} 問中 ${right} 問正解。研究点 +${right * 3}。` : 'いま復習するものはない。'),
      best >= 3 ? h('p', { class: 'rv-combo', id: 'rv-best' }, `いちばん長く続いた正解：${best} 問`) : null,
      h('p', { class: 'rv-habit' }, habitLine(w)),
      goalBar(w),
      hcs.length ? h('div', { class: 'rv-hclist' }, h('b', {}, '自信を持ってまちがえたもの'), ...hcs.map((q) => h('p', {}, `${q.q.replace(/→ できるものは？$/, '→ ？')}　正しくは「${q.choices[0]}」`))) : null,
      h('p', { class: 'muted' }, `自信ごとの正答率　${calibLine(w)}`),
      h('p', { class: 'rv-advice', id: 'rv-advice' }, calibAdvice(w).text),
      h('p', { class: 'muted' }, `次の問いが来るのは ${mins < 60 ? `${mins} 分後` : mins < 1440 ? `${Math.round(mins / 60)} 時間後` : `${Math.round(mins / 1440)} 日後`}。間隔は、問題ごとの覚え具合で決まる（覚えているものほど長く、まちがえたものは今日のうちに戻ってくる）。試験日をまたぐ間隔は作らない。`));
  };
  const step = (i: number) => {
    const id = list[i];
    if (!id) { finish(); return; }
    const q = quizFor(w, id);
    if (!q) { step(i + 1); return; }
    const body = h('div', { class: 'rv-body' }), bar = goalBar(w);
    c.show(h('header', {}, h('h2', {}, '復習'), closeBtn()), h('p', { class: 'muted' }, `復習 ${i + 1} / ${list.length}　${habitLine(w)}`), bar, body);
    // 取り消したら、この問いで数えたものを戻す
    let before = { right, combo, best, hcs: hcs.length };
    renderQuiz(body, w, q, {
      onFull: (done) => {
        const r = recipeById(id.slice(2))!;
        c.show();
        // 正解の数は onDone で数える
        openConfig(c.sheet, w, { kind: r.machine, x: -1, y: -1, dir: 0 }, c.actions, { recipe: r, done: (ok) => { done(ok); step(i + 1); } });
        c.sheet.prepend(h('p', { class: 'muted' }, `復習 ${i + 1} / ${list.length}　前回まちがえた反応：すべてを組み直す`));
        c.sheet.scrollTop = 0;
      },
      onDone: (r) => {
        before = { right, combo, best, hcs: hcs.length };
        if (r.ok && r.conf !== 'guess') { right++; combo++; } else combo = 0;
        best = Math.max(best, combo);
        if (r.hc) hcs.push(q);
        paintGoal(bar, w);
      },
      onUndo: () => { right = before.right; combo = before.combo; best = before.best; hcs.length = before.hcs; paintGoal(bar, w); },
      extra: () => (combo >= 2 ? h('p', { class: 'rv-combo', id: 'rv-combo' }, `${combo} 問続けて正解`) : null),
      next: { label: i + 1 < list.length ? '次へ' : '結果を見る', go: () => step(i + 1) },
    });
  };
  step(0);
}
