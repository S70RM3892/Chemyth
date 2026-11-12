/**
 * 統計の集計：物質ごとの収支、詰まりの元、装置の種類ごとの稼働、止まっている理由、納品の推移（1 時間まで）、
 * 納品所の在庫の推移、指令の見込みと実際、表の書き出し（CSV）。
 * どれも World に記録した流れから求める。化学の中身（反応・物質）は、内容データのものをそのまま使う。
 */
import { CHAPTERS } from '../content/goals';
import { MACHINES } from '../content/machines';
import { recipeById } from '../content/recipes';
import { isSep, sepReady } from '../content/sep';
import { label, sub } from '../content/substances';
import { BUCKET_SEC, HOUR_KEEP, currentGoal, goalCount, goalRate, groundY, floorOf, isMachine, machineState, minutes, requiredOf, type Bucket, type Ent, type Kind, type World } from './world';

/** 統計の期間：直近 1 分、直近 5 分、0 はすべて（記録のある最大 1 時間） */
export type Period = 1 | 5 | 0;
export const PERIODS: Period[] = [1, 5, 0];
export const periodName = (p: Period) => (p === 0 ? 'すべて（最大 1 時間）' : `直近 ${p} 分`);

/** 期間の区切り（古い順）。step：1 区切りの秒。span：期間が覆う秒（遊んだ時間が短いうちは、その時間） */
export function periodBuckets(w: World, p: Period, withSub = true): { list: Bucket[]; step: number; span: number } {
  const nowSec = w.playMs / 1000;
  if (p === 0) {
    const list = minutes(w, withSub);
    return { list, step: 60, span: Math.max(BUCKET_SEC, nowSec - (list.length ? list[0].t * 60 : nowSec)) };
  }
  const now = Math.floor(nowSec / BUCKET_SEC), n = p * 6;
  return { list: w.buckets.filter((b) => b.t > now - n), step: BUCKET_SEC, span: Math.max(BUCKET_SEC, Math.min(n * BUCKET_SEC, nowSec)) };
}

// ---------------- 物質ごとの収支 ----------------

/** 1 分あたりの数。made：作った（採取機で採った分を含む）、used：装置が原料に使った、deliver：納めた、lost：捨てた（廃棄口・あふれ）。
 *  net = made − used − deliver − lost。＋ならベルトやタンクにたまっていて、− ならためていた分か、在庫・試薬棚から足した分を使っている */
export interface BalanceRow { s: string; made: number; used: number; deliver: number; lost: number; net: number }
export function balanceOf(w: World, p: Period): { rows: BalanceRow[]; min: number } {
  const { list, span } = periodBuckets(w, p);
  // 読み込んだ 1 時間の記録には物質ごとの数がないので、数のある区切りからだけ求める
  const have = list.filter((b) => b.sub);
  const sec = p === 0 ? (have.length ? Math.max(BUCKET_SEC, w.playMs / 1000 - have[0].t * 60) : BUCKET_SEC) : span;
  const tot: Record<string, number[]> = {};
  for (const b of have) for (const s in b.sub!) { const r = (tot[s] ??= [0, 0, 0, 0]); b.sub![s].forEach((v, i) => { r[i] += v; }); }
  const min = sec / 60;
  const rows = Object.entries(tot).map(([s, r]) => {
    const [made, used, deliver, lost] = r.map((v) => v / min);
    return { s, made, used, deliver, lost, net: made - used - deliver - lost };
  });
  const act = (r: BalanceRow) => r.made + r.used + r.deliver + r.lost;
  rows.sort((a, b) => act(b) - act(a) || (a.s < b.s ? -1 : 1));
  return { rows, min };
}

// ---------------- 納品の推移 ----------------

/** 直近 1 分の納品の速さ（個/分）。k が 'goal' なら、いまの指令の物質だけ。区切りだけから求める軽い版（地図の上の計器と実績に使う） */
export function recentRate(w: World, k: 'deliver' | 'goal' = 'deliver'): number {
  const now = Math.floor(w.playMs / 1000 / BUCKET_SEC);
  let n = 0;
  for (const b of w.buckets) if (b.t > now - 6) n += b[k];
  return n / (Math.max(BUCKET_SEC, Math.min(60, w.playMs / 1000)) / 60);
}
/** 納品数の並び（古い順、最後が途中の区切り）。1 分・5 分は 10 秒ごと、すべては 1 分ごと */
export function deliverySeries(w: World, p: Period): { vals: number[]; step: number } {
  if (p === 0) {
    const list = minutes(w), now = Math.floor(w.playMs / 60000);
    const n = Math.max(1, Math.min(HOUR_KEEP, now - (list.length ? list[0].t : now) + 1));
    const at = new Map(list.map((m) => [m.t, m.deliver]));
    return { vals: Array.from({ length: n }, (_, i) => at.get(now - (n - 1 - i)) ?? 0), step: 60 };
  }
  const now = Math.floor(w.playMs / 1000 / BUCKET_SEC), N = p * 6;
  const at = new Map(w.buckets.map((b) => [b.t, b.deliver]));
  return { vals: Array.from({ length: N }, (_, i) => at.get(now - (N - 1 - i)) ?? 0), step: BUCKET_SEC };
}
/**
 * 1 時間の推移（1 分ごと、古い順。最後は途中の 1 分）：納品・作った・捨てた（廃棄口とあふれ）。
 * avg：途中の 1 分を除いた納品の平均。recent と before：直近 k 分とその前の k 分の納品の平均（k は最大 10。記録が 4 分に満たなければ null）
 */
export function hourTrend(w: World): { vals: number[]; made: number[]; lost: number[]; avg: number; recent: number | null; before: number | null; k: number } {
  const list = minutes(w), now = Math.floor(w.playMs / 60000);
  const n = Math.max(1, Math.min(HOUR_KEEP, now - (list.length ? list[0].t : now) + 1));
  const at = new Map(list.map((m) => [m.t, m])), col = (f: (m: Bucket) => number) => Array.from({ length: n }, (_, i) => { const m = at.get(now - (n - 1 - i)); return m ? f(m) : 0; });
  const vals = col((m) => m.deliver), done = vals.slice(0, -1);
  const mean = (a: number[]) => (a.length ? a.reduce((x, v) => x + v, 0) / a.length : 0);
  const k = Math.min(10, Math.floor(done.length / 2));
  return { vals, made: col((m) => m.made), lost: col((m) => m.vent + m.spill), avg: mean(done), recent: k >= 2 ? mean(done.slice(-k)) : null, before: k >= 2 ? mean(done.slice(-2 * k, -k)) : null, k };
}

// ---------------- 納品所の在庫 ----------------

/** 在庫の多い物質（いま、上位 top 種）の、区切りの始めごとの在庫。最後の値はいまの在庫。ago：それぞれ何秒前か */
export function stockSeries(w: World, p: Period, top = 4): { subs: string[]; series: number[][]; ago: number[] } {
  const { list, step } = periodBuckets(w, p), nowSec = w.playMs / 1000;
  const pts = list.filter((b) => b.stock);
  const subs = Object.entries(w.stock).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top).map(([s]) => s);
  return { subs, series: subs.map((s) => [...pts.map((b) => b.stock![s] || 0), w.stock[s] || 0]), ago: [...pts.map((b) => Math.max(0, Math.round(nowSec - b.t * step))), 0] };
}

// ---------------- 装置 ----------------

/** 詰まりの元。why：jam 出口が詰まっている、bad 使わない物質が入口に来ている、starve 原料が来ない */
export interface Neck { e: Ent; why: 'jam' | 'bad' | 'starve'; score: number }
/** 出口が詰まって長く止まっている装置（受け取れない物質が来ているものを含む）と、原料が来ずに遊んでいる装置。それぞれ上位 n 台 */
export function bottlenecks(w: World, n = 3): { jammed: Neck[]; starved: Neck[] } {
  const jammed: Neck[] = [], starved: Neck[] = [];
  for (const e of w.ents.values()) {
    if (isMachine(e.kind) && e.recipe) {
      const st = machineState(e);
      if (e.bad && !e.busy) jammed.push({ e, why: 'bad', score: 1000 + (e.stuck || 0) });
      else if (st === 2 && (e.stuck || 0) > 0.5) jammed.push({ e, why: 'jam', score: e.stuck || 0 });
      else if (st === 1 && (e.u ?? 0) < 0.6) starved.push({ e, why: 'starve', score: 1 - (e.u ?? 0) });
    } else if (isSep(e.kind) && sepReady(e.kind, e.test)) {
      if (e.bad) jammed.push({ e, why: 'bad', score: 1000 + (e.stuck || 0) });
      else if ((e.stuck || 0) > 0.5) jammed.push({ e, why: 'jam', score: e.stuck || 0 });
    }
  }
  const top = (a: Neck[]) => a.sort((x, y) => y.score - x.score || x.e.x - y.e.x || x.e.y - y.e.y).slice(0, n);
  return { jammed: top(jammed), starved: top(starved) };
}

/** 装置の種類ごとの台数と稼働。util は直近の稼働率の平均（分ける装置は記録がないので null）。run・wait・jam はいまの状態ごとの台数 */
export interface TypeRow { kind: Kind; name: string; n: number; set: number; util: number | null; run: number; wait: number; jam: number }
export const TYPE_ORDER: Kind[] = ['extractor', 'separator', 'reactor', 'electrolyzer', 'battery', 'collector', 'settler', 'funnel', 'phoresis'];
export function machineTypes(w: World): TypeRow[] {
  const rows = new Map<Kind, TypeRow & { us: number; un: number }>();
  for (const e of w.ents.values()) {
    if (!TYPE_ORDER.includes(e.kind)) continue;
    let r = rows.get(e.kind);
    if (!r) { r = { kind: e.kind, name: MACHINES[e.kind as keyof typeof MACHINES].name, n: 0, set: 0, util: null, run: 0, wait: 0, jam: 0, us: 0, un: 0 }; rows.set(e.kind, r); }
    r.n++;
    if (e.kind === 'extractor') {
      // 採取機の稼働率は「ためる所が満杯でない」割合。満杯なら、出口の先が詰まっている
      r.set++; r.us += e.u ?? 1; r.un++;
      if ((e.u ?? 1) >= 0.5) r.run++; else r.jam++;
    } else if (isMachine(e.kind)) {
      if (!e.recipe) continue;
      r.set++; r.us += e.u || 0; r.un++;
      const st = machineState(e);
      if (st === 0) r.run++; else if (st === 1) r.wait++; else r.jam++;
    } else if (isSep(e.kind) && sepReady(e.kind, e.test)) {
      r.set++;
      if (e.busy) r.run++; else if ((e.stuck || 0) > 0.5) r.jam++; else r.wait++;
    }
  }
  return TYPE_ORDER.filter((k) => rows.has(k)).map((k) => { const { us, un, ...r } = rows.get(k)!; return { ...r, util: un ? us / un : null }; });
}

/** 止まっている理由：設定済みの装置の、いまの状態ごとの台数（受け取れない物質が来ているものは別に数える）と未設定の台数。
 *  time：置いてからの [動いていた秒, 原料を待っていた秒, 出口が詰まっていた秒] の合計 */
export interface StopReasons { run: number; wait: number; jam: number; bad: number; unset: number; time: [number, number, number] }
export function stopReasons(w: World): StopReasons {
  const out: StopReasons = { run: 0, wait: 0, jam: 0, bad: 0, unset: 0, time: [0, 0, 0] };
  for (const e of w.ents.values()) {
    if (!isMachine(e.kind)) continue;
    if (!e.recipe) { out.unset++; continue; }
    const st = machineState(e);
    if (e.bad && !e.busy) out.bad++;
    else if (st === 0) out.run++; else if (st === 1) out.wait++; else out.jam++;
    if (e.ts) for (let i = 0; i < 3; i++) out.time[i] += e.ts[i];
  }
  return out;
}

// ---------------- 指令の見込みと記録 ----------------

const goalKey = (w: World) => `${w.chapter}:${w.progress[w.chapter]}`;
/**
 * 指令の見込みを記録する。指令の 4 分の 1 を終えた時点の速さで、終わるまでの時間（それまでにかかった時間 ＋ 残り）を見積もる。
 * 1 つの指令につき 1 回だけ。量産の指令は、求められた速さを保てているときに、残りの秒数で見積もる。記録したら true
 */
export function noteEta(w: World): boolean {
  const g = currentGoal(w);
  if (!g) return false;
  const gk = goalKey(w);
  if (w.eta[gk] !== undefined) return false;
  const spent = (w.goalMs[gk] || 0) / 1000;
  let left: number | null = null;
  if (g.rate) {
    if (w.hold >= g.n / 4 && goalRate(w) >= g.rate) left = g.n - w.hold;
  } else if (goalCount(w) >= Math.max(1, requiredOf(w, g) / 4)) {
    // 速さは、直近 1 分（指令を始めてから 1 分たっていなければ、始めてから）に納めた指令の物質の数で測る。
    // 複数の物質を同時に求める指令は、どの物質も同じ速さで届くとみなす（速さは物質の数で割れる）
    const now = Math.floor(w.playMs / 1000 / BUCKET_SEC);
    let got = 0;
    for (const b of w.buckets) if (b.t > now - 6) got += b.goal;
    const perSec = got / Math.max(BUCKET_SEC, Math.min(60, spent));
    if (perSec > 0) left = ((requiredOf(w, g) - goalCount(w)) / perSec) * (1 + (g.also?.length ?? 0));
  }
  if (left === null) return false;
  w.eta[gk] = Math.round(spent + left);
  return true;
}

/** 終えた指令の記録（章ごと）。sec：かかった時間（工場を動かしていた秒）、eta：4 分の 1 の時点の見込み（秒）、tested：確認テストで飛ばした */
export interface GoalRec { ch: number; i: number; s: string; also?: string[]; rate?: number; grade?: string; sec: number | null; eta: number | null; tested: boolean }
export function goalRecords(w: World): { ch: number; name: string; total: number; goals: GoalRec[] }[] {
  return CHAPTERS.map((c, ch) => ({
    ch, name: c.name, total: c.goals.length,
    goals: c.goals.slice(0, w.progress[ch] || 0).map((g, i) => {
      const k = `${ch}:${i}`, ms = w.goalMs[k];
      return { ch, i, s: g.s, also: g.also, rate: g.rate, grade: w.grades[k], sec: ms ? ms / 1000 : null, eta: w.eta[k] ?? null, tested: !ms && w.tested.includes(ch) };
    }),
  })).filter((x) => x.goals.length);
}

// ---------------- 書き出し ----------------

/** 表を CSV の文字列にする（区切りはカンマ、改行は CRLF。カンマ・引用符・改行を含む欄は引用符で囲む） */
export function csvOf(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
/** 統計の表をまとめて CSV にする：物質ごとの収支（期間 p）、装置の種類ごと、装置ごと、納品の推移（1 分ごと）、終えた指令 */
export function statsCsv(w: World, p: Period): string {
  const rows: (string | number)[][] = [];
  const { rows: bal, min } = balanceOf(w, p);
  rows.push([`物質ごとの収支（1 分あたり・${periodName(p)}・記録 ${min.toFixed(1)} 分）`], ['物質', '化学式', '作った（採取を含む）', '使った', '納品', '捨てた', '差']);
  for (const r of bal) rows.push([sub(r.s).name, label(r.s), r.made, r.used, r.deliver, r.lost, r.net]);
  rows.push([], ['装置の種類ごと'], ['種類', '台数', '設定済み', '平均の稼働率（%）', '稼働', '原料待ち', '出口詰まり']);
  for (const t of machineTypes(w)) rows.push([t.name, t.n, t.set, t.util === null ? '' : Math.round(t.util * 100), t.run, t.wait, t.jam]);
  rows.push([], ['装置ごと'], ['反応', '装置', 'x', 'y', '階', '稼働率（%）', '反応の回数', '稼働（秒）', '原料待ち（秒）', '出口詰まり（秒）']);
  for (const e of w.ents.values()) {
    const r = isMachine(e.kind) ? recipeById(e.recipe) : undefined;
    if (!r) continue;
    const ts = e.ts ?? [0, 0, 0];
    rows.push([r.name, MACHINES[e.kind as keyof typeof MACHINES].name, e.x, groundY(e.y), floorOf(e.y) + 1, Math.round((e.u || 0) * 100), e.n || 0, Math.round(ts[0]), Math.round(ts[1]), Math.round(ts[2])]);
  }
  const { vals } = deliverySeries(w, 0);
  rows.push([], ['納品の推移（1 分ごと・遊んだ時間で数える）'], ['何分前', '納品']);
  vals.forEach((v, i) => rows.push([vals.length - 1 - i, v]));
  rows.push([], ['終えた指令'], ['章', '番号', '物質', '評価', 'かかった時間（秒）', '見込み（秒）']);
  for (const c of goalRecords(w)) for (const g of c.goals) rows.push([c.name, g.i + 1, [g.s, ...(g.also ?? [])].map((s) => sub(s).name).join('・'), g.grade ?? '', g.sec === null ? '' : Math.round(g.sec), g.eta ?? '']);
  return csvOf(rows);
}
