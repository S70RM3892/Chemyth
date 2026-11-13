/**
 * 大きな保存領域：アルバムの写真と前日の控えを、localStorage（多くのブラウザで 1 つの場所に 5 MB ほど。セーブと共用）ではなく
 * IndexedDB（端末の空きに応じて、ふつうは数百 MB 以上）に置く。セーブは localStorage のまま（閉じる瞬間にも、すぐ書けるように）。
 * - 読むのはすぐ（起動のときに全部を手もとに読み込んでおく）。書くのは手もとを先に変え、IndexedDB へはあとから書く
 * - 起動のとき、localStorage に残っている写真と控えを移し、移せたら localStorage から消す（セーブの場所が空く）
 * - IndexedDB が使えない（プライベートブラウズなど）ときは、これまでどおり localStorage に置く
 * - 「消さないで」と頼む（navigator.storage.persist）。端末の空きが少なくなっても、ブラウザが勝手に消さないように
 */
const DB = 'chemyth', STORE = 'kv';
/** ここに置く項目（キーの形） */
export const isBig = (k: string) => /^chemyth-v2-(album|daily)-\d+$/.test(k);

const mem = new Map<string, string>();
let db: IDBDatabase | null = null, ready: Promise<void> | null = null;

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsPut = (k: string, v: string): boolean => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch { /* 消せなくてもよい */ } };

function open(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') { res(null); return; }
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
      // 開けないまま止まるブラウザがあるので、2 秒で諦めて localStorage に置く
      setTimeout(() => res(null), 2000);
    } catch { res(null); }
  });
}
const tx = (mode: IDBTransactionMode) => db!.transaction(STORE, mode).objectStore(STORE);
const idbPut = (k: string, v: string) => new Promise<boolean>((res) => { try { const r = tx('readwrite').put(v, k); r.onsuccess = () => res(true); r.onerror = () => res(false); } catch { res(false); } });
const idbDel = (k: string) => { try { tx('readwrite').delete(k); } catch { /* 消せなくてもよい */ } };

/** 起動のときに 1 度。IndexedDB を開き、中身を手もとに読み、localStorage に残っている写真と控えを移す */
export function bigReady(): Promise<void> {
  ready ??= (async () => {
    db = await open();
    if (db) {
      await new Promise<void>((res) => {
        try {
          const r = tx('readonly').openCursor();
          r.onsuccess = () => { const c = r.result; if (c) { if (typeof c.value === 'string') mem.set(String(c.key), c.value); c.continue(); } else res(); };
          r.onerror = () => res();
        } catch { res(); }
      });
      // 移す：IndexedDB に書けたものだけ、localStorage から消す（新しいほうを残す：手もとにないときだけ移す）
      const keys: string[] = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isBig(k)) keys.push(k); } } catch { /* 読めなければ移さない */ }
      for (const k of keys) {
        const v = lsGet(k);
        if (v === null) continue;
        if (!mem.has(k)) { if (!(await idbPut(k, v))) continue; mem.set(k, v); }
        lsDel(k);
      }
      try { void navigator.storage?.persist?.(); } catch { /* 頼めなくてもよい */ }
    }
  })();
  return ready;
}
/** IndexedDB を使っているか（使えなければ localStorage に置いている） */
export const bigOn = () => !!db;

export function bigGet(k: string): string | null {
  if (db) return mem.get(k) ?? null;
  return lsGet(k);
}
/** 置く。IndexedDB なら手もとをすぐ変え、書き込みはあとから（容量の上限は、端末の空きしだい） */
export function bigPut(k: string, v: string): boolean {
  if (!db) return lsPut(k, v);
  mem.set(k, v);
  void idbPut(k, v);
  return true;
}
export function bigDel(k: string): boolean {
  if (!db) { const had = lsGet(k) !== null; lsDel(k); return had; }
  const had = mem.delete(k);
  idbDel(k);
  return had;
}
/** ここに置いている項目（キーと文字数） */
export function bigItems(): { key: string; size: number; value: string }[] {
  if (!db) return [];
  return [...mem.entries()].map(([key, value]) => ({ key, size: (key.length + value.length) * 2, value }));
}
/** 端末がこのページに使わせる量と、使っている量（およそ。分からなければ null） */
export async function bigEstimate(): Promise<{ usage: number; quota: number } | null> {
  try { const e = await navigator.storage?.estimate?.(); return e && e.quota ? { usage: e.usage ?? 0, quota: e.quota } : null; } catch { return null; }
}
