/**
 * 復習の画面。答える → 自信を選ぶ → 正誤と解説、の順に進む。
 * 自信を持ってまちがえたものは、はっきり知らせて早めに出し直す（訂正したあと定着しやすい）。勘で当てたものは「覚えた」に数えない。
 * 反応で前回まちがえたものは、設定の画面で、すべてを組み直させる。
 */
import { KNOWLEDGE } from '../content/knowledge';
import { recipeById } from '../content/recipes';
import { answer, relearnReady, type World } from '../engine/world';
import { buildQueue, groupsOf, quizFor, type Quiz } from '../engine/quiz';
import type { Confidence } from '../engine/fsrs';
import { openConfig } from './config';
import { h } from './dom';
import type { PanelCtx } from './panels';
import { sfx } from './sound';

const CONF: [Confidence, string][] = [['sure', '確実'], ['maybe', 'たぶん'], ['guess', '勘']];
const shuffled = <T>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pct = (a: [number, number]) => (a[0] ? `${Math.round((a[1] / a[0]) * 100)} %（${a[0]} 問）` : '—');

/** 自信ごとの正答率。「確実」の正答率が低いなら、思い込みでまちがえている */
export function calibLine(w: World): string {
  return `確実：${pct(w.calib.sure)}　たぶん：${pct(w.calib.maybe)}　勘：${pct(w.calib.guess)}`;
}

export interface QuizResult { ok: boolean; conf?: Confidence; hc: boolean }

/**
 * 問いを 1 つ描く。choose（答え）→ 自信 → 結果。full（すべてを組み直す）は、onFull で設定の画面を開き、結果を受け取る。
 * compact：工場の画面の端に出す小さな札のとき
 */
export function renderQuiz(root: HTMLElement, w: World, q: Quiz, o: { compact?: boolean; onFull: (done: (ok: boolean) => void) => void; onDone: (r: QuizResult) => void; next?: { label: string; go: () => void } }) {
  const group = groupsOf(q.id)[0];
  const head = h('div', { class: 'rv-head' }, h('span', { class: 'pill' }, q.topic || '復習'), group ? h('span', { class: 'pill contrast', title: '取り違えやすい組。続けて相手も出る' }, `見比べ：${group.name}`) : null);
  const result = h('div', { class: 'answer rv-result', hidden: true });
  const finish = (ok: boolean, conf: Confidence | undefined, picked?: string) => {
    answer(w, q.id, ok, conf);
    const hc = !ok && conf === 'sure', lucky = ok && conf === 'guess';
    if (!ok && q.part !== 'full') w.mistakes.push({ machine: q.id.startsWith('k:') ? 'quiz' : (recipeById(q.id.slice(2))?.machine ?? 'quiz'), recipe: q.id.slice(2), part: q.part === 'k' ? 'quiz' : q.part === 'coef' ? 'coefficients' : q.part === 'cond' ? 'condition' : q.part === 'pole' ? 'electrodes' : 'products', t: Date.now() });
    ok && !lucky ? sfx.ok() : sfx.bad();
    if (ok && conf !== 'guess') w.points += 3;
    const parts: (HTMLElement | null)[] = [
      h('p', { class: hc ? 'rv-hc' : '' }, h('b', {}, hc ? '自信を持ってまちがえた。ここがいちばん伸びる所' : ok ? (lucky ? '当たったが、勘' : '正解') : '不正解'),
        picked !== undefined && !ok ? `　正しくは「${q.choices[0]}」` : ''),
      lucky ? h('p', { class: 'muted' }, '勘で当てたものは、覚えたことにしない。今日のうちに、もう一度出す。') : null,
      !ok ? h('p', { class: 'muted' }, hc ? '1 分後に、もう一度出す。紙に正しい答えを書いて、なぜ思い込んだかも書け。' : '今日のうちに、正解するまで戻ってくる。') : null,
      h('p', { class: 'note' }, q.why),
      h('div', { class: 'row' }, o.next ? h('button', { class: 'primary', type: 'button', id: 'rv-next', onclick: o.next.go }, o.next.label) : null)];
    result.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
    result.hidden = false;
    o.onDone({ ok, conf, hc });
  };
  if (q.part === 'full') {
    root.replaceChildren(head, h('p', { class: 'qtext' }, q.q),
      h('p', { class: 'muted' }, '前回まちがえた反応は、原料・生成物・係数・条件を、すべて組み直す。'),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'button', id: 'rv-full', onclick: () => o.onFull((ok) => finish(ok, undefined)) }, '設定の画面で組み直す')), result);
    return;
  }
  const choices = shuffled(q.choices);
  const opts = h('div', { class: o.compact ? 'menu rv-choices compact' : 'menu rv-choices' });
  const confRow = h('div', { class: 'row rv-conf', hidden: true }, h('span', { class: 'muted' }, '自信は？'));
  let picked = '';
  for (const [i, ch] of choices.entries()) {
    const b = h('button', { class: 'ghost', type: 'button', id: `rv-c-${i}` }, ch);
    b.onclick = () => {
      if (picked) return;
      picked = ch;
      for (const x of opts.children) (x as HTMLButtonElement).disabled = true;
      b.classList.add('chosen');
      confRow.hidden = false;
      sfx.tap();
    };
    opts.append(b);
  }
  for (const [c, name] of CONF) confRow.append(h('button', { class: 'ghost', type: 'button', id: `rv-conf-${c}`, onclick: () => {
    if (!picked || !result.hidden) return;
    const ok = picked === q.choices[0];
    for (const x of confRow.querySelectorAll('button')) (x as HTMLButtonElement).disabled = true;
    for (const x of opts.children) { const el = x as HTMLButtonElement; el.classList.toggle('picked', el.textContent === q.choices[0]); el.classList.toggle('wrong', el.textContent === picked && !ok); }
    finish(ok, c, picked);
  } }, name));
  root.replaceChildren(head, h('p', { class: 'qtext' }, q.q), opts, confRow, result);
}

/** 復習の画面（上の「復習」ボタン）。今日まちがえたもの → 期限の来たもの、の順。取り違えやすい組は続けて出す */
export function showReview(c: PanelCtx) {
  const { w } = c;
  const now = Date.now();
  const queue = buildQueue(w, now, 10, relearnReady(w, now));
  // まだ出していない知識の問いを、少しずつ混ぜる
  const fresh = KNOWLEDGE.filter((k) => !w.srs[`k:${k.id}`]).slice(0, Math.max(1, 4 - queue.length)).map((k) => `k:${k.id}`);
  const list = [...queue, ...fresh].slice(0, 10);
  let right = 0;
  const hcs: string[] = [];
  const closeBtn = () => h('button', { class: 'ghost', type: 'button', id: 'sheet-close', onclick: c.close }, '閉じる');
  const finish = () => {
    const next = Object.values(w.srs).map((x) => x.due).sort((a, b) => a - b)[0];
    const mins = next ? Math.max(0, Math.round((next - Date.now()) / 60000)) : 0;
    c.show(h('header', {}, h('h2', {}, '復習'), closeBtn()),
      h('p', { class: 'qtext' }, list.length ? `${list.length} 問中 ${right} 問正解。研究点 +${right * 3}。` : 'いま復習するものはない。'),
      hcs.length ? h('div', { class: 'rv-hclist' }, h('b', {}, '自信を持ってまちがえたもの'), ...hcs.map((id) => { const q = quizFor(w, id); return h('p', {}, q ? `${q.q.replace(/→ できるものは？$/, '→ ？')}　正しくは「${q.choices[0] ?? ''}」` : id); })) : null,
      h('p', { class: 'muted' }, `自信ごとの正答率　${calibLine(w)}`),
      h('p', { class: 'muted' }, `次の問いが来るのは ${mins < 60 ? `${mins} 分後` : mins < 1440 ? `${Math.round(mins / 60)} 時間後` : `${Math.round(mins / 1440)} 日後`}。間隔は、問題ごとの覚え具合で決まる（覚えているものほど長く、まちがえたものは今日のうちに戻ってくる）。試験日をまたぐ間隔は作らない。`));
  };
  const step = (i: number) => {
    const id = list[i];
    if (!id) { finish(); return; }
    const q = quizFor(w, id);
    if (!q) { step(i + 1); return; }
    const body = h('div', { class: 'rv-body' });
    c.show(h('header', {}, h('h2', {}, '復習'), closeBtn()), h('p', { class: 'muted' }, `復習 ${i + 1} / ${list.length}`), body);
    renderQuiz(body, w, q, {
      onFull: (done) => {
        const r = recipeById(id.slice(2))!;
        c.show();
        openConfig(c.sheet, w, { kind: r.machine, x: -1, y: -1, dir: 0 }, c.actions, { recipe: r, done: (ok) => { done(ok); if (ok) right++; step(i + 1); } });
        c.sheet.prepend(h('p', { class: 'muted' }, `復習 ${i + 1} / ${list.length}　前回まちがえた反応：すべてを組み直す`));
        c.sheet.scrollTop = 0;
      },
      onDone: (r) => { if (r.ok && r.conf !== 'guess') right++; if (r.hc) hcs.push(id); },
      next: { label: i + 1 < list.length ? '次へ' : '結果を見る', go: () => step(i + 1) },
    });
  };
  step(0);
}
