import { describe, expect, it, vi } from 'vitest';
import { parsePrefsFile } from '../src/engine/device';

// 端末の保存（title.ts の store）と、html の class だけを、テストの中の入れ物に置きかえる
const env = vi.hoisted(() => {
  const s = { meta: {} as Record<string, unknown>, classes: new Set<string>() };
  (globalThis as unknown as { document: unknown }).document = {
    documentElement: { classList: { toggle: (c: string, on?: boolean) => { if (on) s.classes.add(c); else s.classes.delete(c); return !!on; }, contains: (c: string) => s.classes.has(c) } },
  };
  return s;
});
vi.mock('../src/ui/title', () => ({
  store: {
    meta: () => JSON.parse(JSON.stringify(env.meta)),
    setMeta: (m: Record<string, unknown>) => { env.meta = { ...env.meta, ...JSON.parse(JSON.stringify(m)) }; },
  },
}));
const { adoptPrefs, applyPrefs, prefs, resetPrefs, setPrefs } = await import('../src/ui/prefs');

describe('片手で使う（拡大・縮小のボタン、道具の棚の位置）は、設定の好みに入る', () => {
  it('初期値は、ボタンなし・棚は中央', () => {
    env.meta = {};
    applyPrefs();
    expect(prefs().zoomBtns).toBe(false);
    expect(prefs().hand).toBe('center');
    expect(env.classes.has('hand-left') || env.classes.has('hand-right')).toBe(false);
  });
  it('変えると好みに残り、棚の寄せは html の class になる', () => {
    env.meta = {};
    setPrefs({ zoomBtns: true, hand: 'left' });
    expect(prefs()).toMatchObject({ zoomBtns: true, hand: 'left' });
    expect(env.classes.has('hand-left')).toBe(true);
    setPrefs({ hand: 'right' });
    expect(env.classes.has('hand-left')).toBe(false);
    expect(env.classes.has('hand-right')).toBe(true);
  });
  it('「初期値に戻す」で、ほかの好みと一緒に戻る', () => {
    env.meta = {};
    setPrefs({ zoomBtns: true, hand: 'left', cvd: true });
    resetPrefs();
    expect(prefs()).toMatchObject({ zoomBtns: false, hand: 'center', cvd: false });
    expect(env.classes.has('hand-left')).toBe(false);
  });
  it('設定のファイルに入り、読み込むと戻る', () => {
    env.meta = {};
    setPrefs({ zoomBtns: true, hand: 'right' });
    const file = JSON.stringify({ app: 'chemyth-prefs', v: 1, prefs: env.meta.prefs });
    resetPrefs();
    const d = parsePrefsFile(file)!;
    env.meta = { ...env.meta, prefs: d.prefs };
    applyPrefs();
    expect(prefs()).toMatchObject({ zoomBtns: true, hand: 'right' });
    expect(env.classes.has('hand-right')).toBe(true);
  });
  it('以前の置き場所の値は、まだ好みにないときだけ引き取る', () => {
    env.meta = { prefs: { cvd: true } };
    adoptPrefs({ zoomBtns: true, hand: 'right' });
    expect(prefs()).toMatchObject({ zoomBtns: true, hand: 'right', cvd: true });
    env.meta = { prefs: { hand: 'left' } };
    adoptPrefs({ zoomBtns: true, hand: 'right' });
    expect(prefs()).toMatchObject({ zoomBtns: true, hand: 'left' });
  });
  it('壊れた値は初期値に読む', () => {
    env.meta = { prefs: { zoomBtns: 'yes', hand: 'up' } };
    expect(prefs()).toMatchObject({ zoomBtns: false, hand: 'center' });
  });
});
