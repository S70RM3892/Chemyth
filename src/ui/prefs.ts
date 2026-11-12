/**
 * 端末ごとの好み（振動・音量・動き・文字の大きさ・札の位置など）。セーブ枠とは別に、この端末のブラウザに置く。
 * 学習の設定（目標の保持率）は、端末をまたいで同じにしたいので、セーブ（World）の側に持つ。
 */
import { store } from './title';

export interface Prefs {
  /** 置く・消す・まちがえたときに震わせる（対応している端末だけ） */
  vib: boolean;
  /** 効果音と音楽の大きさ（0〜1） */
  sfxVol: number;
  musicVol: number;
  /** 動きを減らす（土ぼこり・花火・画面の滑らかな移動を控える） */
  calm: boolean;
  /** 文字を大きく、ボタンを大きく */
  bigText: boolean;
  bigButtons: boolean;
  /** 夕暮れ（実際の時刻で地図が暮れる） */
  dusk: boolean;
  /** 指令の札にヒントを出す */
  hints: boolean;
  /** 反応式の札を、うんと近づかなくても、見えている装置すべてに出す */
  plates: boolean;
  /** 復習の札を左右どちらに出すか */
  cardSide: 'left' | 'right';
  /** 休憩の知らせ（分。0 で出さない） */
  breakMin: 0 | 25 | 50;
  /** 小地図の大きさ */
  miniBig: boolean;
  /** 5 分さわらなければ、描く回数を減らして電池をもたせる（工場は動き続ける） */
  saver: boolean;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const PREFS_DEFAULT = (): Prefs => ({ vib: true, sfxVol: 1, musicVol: 1, calm: reduced(), bigText: false, bigButtons: false, dusk: true, hints: true, plates: false, cardSide: 'left', breakMin: 25, miniBig: false, saver: true });

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
/** 保存された好みを読む。壊れた値は既定に戻す */
export function prefs(): Prefs {
  const d = PREFS_DEFAULT(), m = (store.meta().prefs ?? {}) as Partial<Prefs>;
  const b = (k: keyof Prefs) => (typeof m[k] === 'boolean' ? (m[k] as boolean) : (d[k] as boolean));
  return {
    vib: b('vib'), sfxVol: clamp01(m.sfxVol, d.sfxVol), musicVol: clamp01(m.musicVol, d.musicVol), calm: b('calm'), bigText: b('bigText'), bigButtons: b('bigButtons'),
    dusk: b('dusk'), hints: b('hints'), plates: b('plates'), cardSide: m.cardSide === 'right' ? 'right' : 'left', breakMin: m.breakMin === 0 || m.breakMin === 50 ? m.breakMin : 25,
    miniBig: b('miniBig'), saver: b('saver'),
  };
}
const listeners: ((p: Prefs) => void)[] = [];
export const onPrefs = (f: (p: Prefs) => void) => { listeners.push(f); };
export function setPrefs(p: Partial<Prefs>) {
  store.setMeta({ prefs: { ...prefs(), ...p } });
  applyPrefs();
}
/** 好みを画面に反映する（html の class と、登録された関数） */
export function applyPrefs() {
  const p = prefs(), root = document.documentElement;
  root.classList.toggle('calm', p.calm);
  root.classList.toggle('big-text', p.bigText);
  root.classList.toggle('big-btn', p.bigButtons);
  root.classList.toggle('card-right', p.cardSide === 'right');
  root.classList.toggle('mini-big', p.miniBig);
  root.classList.toggle('no-hints', !p.hints);
  for (const f of listeners) f(p);
}

/** 短く震わせる。iPhone・iPad の Safari は振動に対応していないので、何も起きない */
export function buzz(ms: number | number[]) {
  if (!prefs().vib) return;
  try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(ms); } catch { /* 対応していない */ }
}
