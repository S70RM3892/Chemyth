import { describe, expect, it, vi } from 'vitest';
import { capByExams, dayKey, initS, migrate, review, S_MAX, type Card } from '../src/engine/fsrs';
import { answer, deserialize, EXAMS_DEFAULT, newWorld, serialize, plainSave } from '../src/engine/world';
import { forecast, hintFor, weekReport } from '../src/engine/learn';
import { learnedToday, nameTells, partsFor, recipeQuiz } from '../src/engine/quiz';
import { applyTestOut, canTestOut, chapterRecipes, testOutQuiz } from '../src/engine/pace';
import { CHAPTERS } from '../src/content/goals';
import { KNOWLEDGE } from '../src/content/knowledge';
import { RECIPES, productsOf, type Recipe } from '../src/content/recipes';
import { label, sub } from '../src/content/substances';
import { equationOf } from '../src/content/looks';

const DAY = 86400000;
const EX = EXAMS_DEFAULT;
const rec = (id: string) => RECIPES.find((r) => r.id === id)!;
const lcg = (seed: number) => { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; };
/** 物質の名前と、その（）の外と中（炭化カルシウム（カーバイド）→ 炭化カルシウム・カーバイド） */
const nameAndParts = (n: string) => [n, ...n.split(/[（）]/).map((t) => t.trim()).filter((t) => t.length >= 2)];
/** 正解の条件を ・ や（）で区切った語の、3 文字のつながり。原料の名前・式に入っているもの（ペプチド → ペプチダーゼ）は除く */
const condRuns = (r: Recipe) => r.accept.flatMap((c) => c.split(/[・（）｜+\s]+/)).flatMap((p) => Array.from({ length: Math.max(0, p.length - 2) }, (_, i) => p.slice(i, i + 3)))
  .filter((w) => !r.inputs.some(([s]) => sub(s).name.includes(w) || label(s).includes(w)));

describe('試験日に合わせた間隔', () => {
  it('試験の手前 10 日間：決まった日に 1 回だけ出し、1 時間ごとに出し直さない（安定度もふくらまない）', () => {
    const id = 'k:ppt-agcl';
    // 期限が来たらすぐ「確実」で正解する
    let c: Card = { due: 0, s: 40, d: 5, last: new Date(2026, 10, 1, 20).getTime(), n: 3, l: 0, iv: 5 };
    let now = new Date(2026, 11, 7, 20).getTime();
    const times: number[] = [];
    for (let i = 0; i < 40 && now < EX[1]; i++) { c = review(c, 3, now, EX, id); times.push(now); expect(c.s).toBeLessThan(2000); now = c.due + 60000; }
    expect(new Set(times.map(dayKey)).size).toBe(times.length);                        // 同じ日に 2 回は出ない
    expect(times.filter((t) => t >= EX[0] - 12 * DAY && t < EX[0]).length).toBe(1);   // 共通テストの前に 1 回
    expect(times.filter((t) => t >= EX[1] - 12 * DAY && t < EX[1]).length).toBe(1);   // 2 次の前にも 1 回
    expect(times.length).toBeLessThan(6);
    // 毎晩 19〜21 時だけ遊ぶ人でも同じ
    c = { due: 0, s: 40, d: 5, last: new Date(2026, 10, 1, 20).getTime(), n: 3, l: 0, iv: 5 };
    const evening: number[] = [];
    for (let day = new Date(2026, 11, 7).getTime(); day < EX[1]; day += DAY) {
      for (let m = 19 * 60; m < 21 * 60; m++) { const t = day + m * 60000; if (c.due <= t) { c = review(c, 3, t, EX, id); evening.push(t); } }
    }
    expect(new Set(evening.map(dayKey)).size).toBe(evening.length);
    expect(evening.filter((t) => t >= EX[0] - 12 * DAY && t < EX[0]).length).toBe(1);
    expect(evening.filter((t) => t >= EX[1] - 12 * DAY && t < EX[1]).length).toBe(1);
    expect(c.s).toBeLessThan(2000);
  });
  it('どの問いも、試験の手前 10 日間の決まった日より前に答えたなら、その日に戻ってくる。決まった日に答えたら、次は 2 次の前', () => {
    for (const id of ['r:a', 'r:b', 'r:c', 'k:x', 'k:yy', 'r:zzz', 'r:haber-bosch', 'k:ppt-agcl']) {
      const last = new Date(2026, 11, 1, 20).getTime();
      const slot = capByExams(last + 200 * DAY, last, EX, id);
      expect(slot).toBeGreaterThanOrEqual(EX[0] - 12 * DAY); expect(slot).toBeLessThanOrEqual(EX[0] - 2 * DAY);
      // 決まった日に答えると、共通テストのためにはもう動かさず、2 次の手前 10 日間に合わせる
      const next = capByExams(slot + 200 * DAY, slot, EX, id);
      expect(next).toBeGreaterThanOrEqual(EX[1] - 12 * DAY); expect(next).toBeLessThanOrEqual(EX[1] - 2 * DAY);
      // 決まった日の数時間後に答えても同じ（1 時間後に出し直さない）
      expect(capByExams(slot + 200 * DAY, slot + 3 * 3600000, EX, id)).toBe(next);
    }
  });
  it('共通テストの 2 日前を過ぎて答えても、2 次をまたぐ予定は作らない', () => {
    const ans = new Date(2027, 0, 15, 12).getTime();
    const c: Card = { due: ans, s: 45, d: 5, last: ans - 40 * DAY, n: 4, l: 0, iv: 5 };
    const r = review(c, 3, ans, EX, 'k:abc');
    expect(r.due).toBeLessThanOrEqual(EX[1] - 2 * DAY);
    expect(r.due).toBeGreaterThanOrEqual(EX[1] - 12 * DAY);
    // 試験の直前は、その試験のためには動かさない（前と同じ）
    expect(capByExams(EX[0] - DAY, EX[0] - 1.5 * DAY, EX, 'r:a')).toBe(EX[0] - DAY);
    // 2 次の後は、もう縮めない
    expect(capByExams(EX[1] + 90 * DAY, EX[1] + DAY, EX, 'r:a')).toBe(EX[1] + 90 * DAY);
  });
  it('試験日を前へ動かして決まった日を過ぎていたら、前に答えたのがそれより前なら、いますぐ出す', () => {
    const now = new Date(2026, 11, 1, 12).getTime(), exams = [now + 6 * DAY, now + 60 * DAY];
    for (const id of ['r:a', 'r:b', 'r:c', 'k:x', 'k:yy', 'r:zzz']) {
      const due = capByExams(now + 90 * DAY, now, exams, id, now - 30 * DAY);
      expect(due).toBeGreaterThanOrEqual(now); expect(due).toBeLessThanOrEqual(exams[0] - 2 * DAY);
    }
  });
  it('前の版でふくらんだ安定度は上限で止め、試験をまたいだ予定は読み込むときに直す', () => {
    // 安定度の上限
    const big = migrate({ due: new Date(3233, 0, 1).getTime(), s: 440558, d: 3, last: EX[0] - 2 * DAY, n: 30, l: 0, iv: 5 });
    expect(big.s).toBe(S_MAX); expect(big.iv).toBe(5);
    expect(review({ ...big, s: 440558 }, 3, EX[1] + 30 * DAY).s).toBeLessThanOrEqual(S_MAX);
    // 読み込むとき：共通テストの 2 日前のあとに答えて 1000 年先になった予定を、2 次の前へ戻す
    vi.useFakeTimers({ now: new Date(2027, 0, 20, 12), toFake: ['Date'] });
    try {
      const j = plainSave(serialize(newWorld()));
      j.srs = {
        'k:ppt-agcl': { due: new Date(3233, 0, 1).getTime(), s: 440558, d: 3, last: EX[0] - 2 * DAY + 3600000, n: 30, l: 0, iv: 5, b: 40 },
        // ふつうの予定は動かさない
        'k:ppt-cus': { due: new Date(2027, 1, 1, 9).getTime(), s: 20, d: 5, last: new Date(2027, 0, 10).getTime(), n: 4, l: 0, iv: 4 },
      };
      const back = deserialize(JSON.stringify(j))!;
      const c = back.srs['k:ppt-agcl'];
      expect(c.s).toBe(S_MAX);
      expect(c.due).toBeGreaterThanOrEqual(EX[1] - 12 * DAY); expect(c.due).toBeLessThanOrEqual(EX[1] - 2 * DAY);
      expect(back.srs['k:ppt-cus'].due).toBe(new Date(2027, 1, 1, 9).getTime());
    } finally { vi.useRealTimers(); }
  });
  it('試験までの見込みは、実際の予定と同じ数え方：試験の手前 10 日間にもう答えた問いは、試験の前にもう出ない', () => {
    const T = new Date(2026, 11, 1, 12).getTime(), w = newWorld();
    w.exams = [T + 10 * DAY, T + 60 * DAY];
    w.srs['k:ppt-agcl'] = { due: T + 70 * DAY, s: 60, d: 5, last: T - 0.5 * DAY, n: 6, l: 0, iv: 5 };
    expect(forecast(w, T)!.total).toBe(0);
  });
});

describe('ヒントと問いの文に答えを出さない', () => {
  it('生成物を問うときのヒント：名前に生成物が入る反応は名前を出さず、原料の名前の一部としてだけ入るものは出す', () => {
    // 炭化カルシウム（カーバイド）・DNA（ポリヌクレオチド）のように名前に（）があるものや、慣用名（硫安・過リン酸石灰）も
    for (const id of ['hcl-synthesis', 'methanol', 'methyl-salicylate', 'ethylene-oxide', 'acetylene', 'bleaching-powder', 'cl-br', 'polyethylene', 'vulcanization', 'carbide', 'dna', 'scrub-nh3', 'superphosphate']) {
      const h = hintFor(recipeQuiz(rec(id), 'products', lcg(3))!)!;
      expect(h.text, id).toMatch(/^できるものは/);
    }
    for (const id of ['cuso4-electrolysis', 'seawater-distillation', 'zinc-reduce', 'hi-decomp', 'scrub-h2s', 'hall-heroult', 'lime-kiln']) {
      expect(hintFor(recipeQuiz(rec(id), 'products', lcg(3))!)!.text, id).toBe(`反応の名前：${rec(id).name}`);
    }
    // 原料の名前の（）の外の語（陽イオン交換樹脂（H 型））は、生成物（陽イオン交換樹脂（Na 型））の語と同じでも数えない
    expect(nameTells({ ...rec('ion-exchange'), name: '陽イオン交換樹脂による交換' }, ['resinNa'])).toBe(false);
    expect(nameTells({ ...rec('ion-exchange'), name: '陽イオン交換樹脂（Na 型）の生成' }, ['resinNa'])).toBe(true);
    // どの反応でも、ヒントに出した名前は、原料の名前（（）の外と中も）を除くと、生成物の名前（（）の外と中も）・式・別名を含まない
    for (const r of RECIPES) {
      if (!partsFor(r).includes('products')) continue;
      const h = hintFor(recipeQuiz(r, 'products', lcg(5))!)!;
      if (!h.text.startsWith('反応の名前')) continue;
      let rest = r.name;
      for (const n of r.inputs.flatMap(([s]) => nameAndParts(sub(s).name)).sort((a, b) => b.length - a.length)) rest = rest.split(n).join('｜');
      for (const [s] of productsOf(r)) for (const w of [label(s), ...nameAndParts(sub(s).name), ...(sub(s).aliases ?? [])]) expect(rest.includes(w), `${r.id}：${w}`).toBe(false);
    }
  });
  it('生成物の問い：同じ装置・同じ原料・問いに出した条件で正しい別の生成物は、まちがいの選択肢に出さない', () => {
    const inKey = (x: Recipe) => x.inputs.map(([s]) => s).sort().join('+');
    const setOf = (labels: string[]) => [...labels].sort().join('|');
    let checked = 0;
    for (const r of RECIPES) {
      if (!partsFor(r).includes('products')) continue;
      const ok = new Set(RECIPES.filter((x) => x.machine === r.machine && inKey(x) === inKey(r) && x.accept.includes(r.accept[0])).map((x) => setOf(productsOf(x).map(([s]) => label(s)))));
      for (let seed = 1; seed <= 10; seed++) {
        const q = recipeQuiz(r, 'products', lcg(seed));
        if (!q) continue;
        for (const c of q.choices.slice(1)) expect(ok.has(setOf(c.split(' + '))), `${r.id}：${c}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
    // 例：Al₂O₃ + C の CO と CO₂、ZnO + C の CO と CO₂、C + O₂（加熱）の CO と CO₂
    for (let seed = 1; seed <= 100; seed++) {
      expect(recipeQuiz(rec('hall-heroult'), 'products', lcg(seed))!.choices).not.toContain('Al + CO');
      expect(recipeQuiz(rec('zinc-reduce'), 'products', lcg(seed))!.choices).not.toContain('Zn + CO₂');
      expect(recipeQuiz(rec('coke-burn'), 'products', lcg(seed))!.choices).not.toContain('CO₂');
    }
  });
  it('条件の問い：反応の名前に条件が入っているときは、名前の代わりに反応式（式にも入っていれば原料だけ）で問う', () => {
    let n = 0;
    for (const r of RECIPES) {
      if (!partsFor(r).includes('cond')) continue;
      for (let seed = 1; seed <= 5; seed++) {
        const q = recipeQuiz(r, 'cond', lcg(seed));
        if (!q) continue;
        for (const c of r.accept) expect(q.q.includes(c), `${r.id}：${q.q}`).toBe(false);
        // 条件の語と 3 文字以上つながって重なるところもない（「…水溶液の電気分解（白金電極）」と「水溶液・白金電極」）
        for (const w of condRuns(r)) expect(q.q.includes(w), `${r.id}：${q.q}（${w}）`).toBe(false);
        // 式で問うときのヒントは、式をもう一度見せずに選択肢を絞る
        const h = hintFor(q)!;
        if (q.q.includes('→')) { expect(h.drop.length, r.id).toBe(2); expect(h.drop).not.toContain(q.choices[0]); }
        // ヒントに式を見せるときも、式に条件は入っていない
        if (h.text.startsWith('反応式')) for (const w of [...r.accept, ...condRuns(r)]) expect(h.text.includes(w), `${r.id}：${h.text}（${w}）`).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(recipeQuiz(rec('coal-carbonization'), 'cond', lcg(1))!.q).toBe('「石炭 → C + コールタール」の分離法は？');
    expect(recipeQuiz(rec('vulcanization'), 'cond', lcg(1))!.q).toBe('「生ゴム + S → ？」の触媒・条件は？');
    // 電気分解：名前の「水溶液」「白金電極」「炭素電極」「食塩水」「イオン交換膜」が条件を明かすので、反応式で問う
    for (const id of ['brine-electrolysis', 'cuso4-electrolysis', 'agno3-electrolysis', 'cucl2-electrolysis', 'ki-electrolysis']) {
      for (let seed = 1; seed <= 5; seed++) expect(recipeQuiz(rec(id), 'cond', lcg(seed))!.q, id).toBe(`「${equationOf(rec(id))}」の電解の条件は？`);
    }
    expect(recipeQuiz(rec('cuso4-electrolysis'), 'cond', lcg(1))!.q).toBe('「2CuSO₄ + 2H₂O → 2Cu + O₂ + 2H₂SO₄」の電解の条件は？');
    // 酵素の名前が基質から来ているもの（ペプチド → ペプチダーゼ）は、それを結びつけるのが覚えることなので、名前で問う
    expect(recipeQuiz(rec('peptidolysis'), 'cond', lcg(1))!.q).toBe('「ペプチドの加水分解」の触媒・条件は？');
    // 式に条件の物質が入るとき（鉛蓄電池の充電の H₂SO₄、ダニエル電池の ZnSO₄）は、ヒントに式を見せず選択肢を絞る
    for (const id of ['lead-charge', 'daniell']) expect(hintFor(recipeQuiz(rec(id), 'cond', lcg(1))!)!.text, id).toBe('選択肢を 2 つに絞った。');
    // 生成物の問いでも、生成物の名前のもとになった条件（加硫 → 加硫ゴム）は伏せる
    expect(recipeQuiz(rec('vulcanization'), 'products', lcg(1))!.q).toBe('反応器：生ゴム + S → できるものは？');
  });
  it('極の問い：名前に陽極の生成物が入るときは反応式で問い、陰極（電池なら正極）の物質をいつも選択肢に入れる', () => {
    for (const id of ['hall-heroult-co', 'hall-heroult-mix']) {
      const q = recipeQuiz(rec(id), 'pole', lcg(1))!;
      expect(q.q.includes('陽極で'), q.q).toBe(false);
      expect(q.choices).toContain('Al');
    }
    for (const r of RECIPES) {
      if (!partsFor(r).includes('pole')) continue;
      for (let seed = 1; seed <= 10; seed++) {
        const q = recipeQuiz(r, 'pole', lcg(seed));
        if (!q) continue;
        expect(new Set(q.choices).size).toBe(q.choices.length);
        if (r.machine === 'battery') expect(q.choices, r.id).toContain(label(r.pos!));
        else {
          const poles = r.poles ?? 'ca', cathode = productsOf(r).filter((_, i) => poles[i] === 'c').map(([s]) => label(s)).join(' + ');
          expect(q.choices, r.id).toContain(cathode);
        }
      }
    }
    // 鉛蓄電池：Pb と PbO₂ のどちらが負極かを問う（「鉛」だけでは決まらない）
    expect(recipeQuiz(rec('lead-acid'), 'pole', lcg(2))!.choices.slice(0, 2)).toEqual(['Pb', 'PbO₂']);
  });
});

describe('確認テストと知識問題', () => {
  it('確認テスト：出なかった反応は「思い出せた」にも「新しく覚えた」にもしない。まだ答えていない問いとして、すぐ出す', () => {
    const T = new Date(2026, 10, 12, 15).getTime(), w = newWorld();
    const ch = CHAPTERS.findIndex((_, i) => canTestOut(w, i) && chapterRecipes(i).length > 20);
    expect(ch).toBeGreaterThan(0);
    const qs = testOutQuiz(ch, lcg(4)), asked = new Set(qs.map((q) => q.id));
    applyTestOut(w, ch, qs.map((q) => ({ id: q.id, ok: true })), T);
    const untested = chapterRecipes(ch).map((r) => `r:${r.id}`).filter((id) => !asked.has(id));
    expect(untested.length).toBeGreaterThan(5);
    for (const id of asked) { expect(w.srs[id].n).toBe(1); expect(w.srs[id].s).toBeCloseTo(initS(3)); expect(w.srs[id].t0).toBe(T); }
    for (const id of untested) { expect(w.srs[id].n).toBe(0); expect(w.srs[id].t0).toBeUndefined(); expect(w.srs[id].due).toBeLessThanOrEqual(T); }
    // 週の報告の「新しく覚えた反応」と、今夜の 10 問に入る「今日覚えたもの」は、テストで出た反応だけ
    expect(weekReport(w, T).cur.learned).toBe(asked.size);
    expect(learnedToday(w, T).filter((id) => id.startsWith('r:')).sort()).toEqual([...asked].sort());
    // 保存して読み込んでも、まだ答えていない問いのまま
    const back = deserialize(serialize(w))!;
    expect(back.srs[untested[0]].n).toBe(0); expect(back.srs[untested[0]].t0).toBeUndefined();
    // 最初に答えたときの評価で、はじめて覚えたときと同じように決まる
    const id = untested[0], t = T + 60000;
    answer(w, id, true, 'sure', t);
    expect(w.srs[id]).toEqual(review(undefined, 3, t, w.exams, id, w.ret));
    expect(w.srs[id].t0).toBe(t);
  });
  it('知識問題に、同じ答えと同じ選択肢の問いは 2 つない（ion-titr は弱塩基を強酸で滴定するとき）', () => {
    const seen = new Map<string, string>();
    for (const k of KNOWLEDGE) {
      const key = `${k.choices[0]}|${[...k.choices].sort().join('/')}`;
      expect(seen.get(key), k.id).toBeUndefined();
      seen.set(key, k.id);
    }
    const t = KNOWLEDGE.find((k) => k.id === 'ion-titr')!;
    expect(t.q).toContain('アンモニア水'); expect(t.choices[0]).toBe('メチルオレンジ');
  });
});
