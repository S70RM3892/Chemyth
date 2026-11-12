/**
 * 端末ごとの好み（振動・音量・動き・文字の大きさ・札の位置など）。セーブ枠とは別に、この端末のブラウザに置く。
 * 学習の設定（目標の保持率）は、端末をまたいで同じにしたいので、セーブ（World）の側に持つ。
 */
import { hapticPattern, hapticsOf, textSizeOf, type Level3 } from '../engine/device';
import { store } from './title';

export interface Prefs {
  /** 振動するか（haptics が 0 でない）。古い設定の名残。変えるときは haptics を使う */
  vib: boolean;
  /** 振動の強さ：0 なし、1 弱、2 強（置く・消す・まちがえたとき。対応している端末だけ） */
  haptics: Level3;
  /** 効果音と音楽の大きさ（0〜1） */
  sfxVol: number;
  musicVol: number;
  /** 動きを減らす（土ぼこり・花火・画面の滑らかな移動を控える） */
  calm: boolean;
  /** 文字の大きさ：0 標準、1 大（15 %）、2 特大（30 %） */
  textSize: Level3;
  /** 文字を大きくしているか（textSize が 0 でない）。古い設定の名残 */
  bigText: boolean;
  /** ボタンを大きく */
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
  /** 色覚の補助：状態の印と詰まりの印を、赤と緑の色だけでなく、形と模様でも分ける */
  cvd: boolean;
  /** 高コントラスト：線を太く、文字と枠を濃くする */
  contrast: boolean;
  /** 画面を暗くする段（0 そのまま〜3）と、夜（夕暮れ）だけにするか */
  dim: 0 | 1 | 2 | 3;
  dimNight: boolean;
  /** 通知を画面の上に出す */
  toastTop: boolean;
  /** 上の帯に、時計と就寝までの時間を出す */
  clock: boolean;
  /** 開いたら、最後に開いていたノートをそのまま開く */
  autoOpen: boolean;
  /** 就寝の 1 時間前から、効果音と音楽を少しずつ小さくする */
  windVol: boolean;
}

const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
const reduced = () => media('(prefers-reduced-motion: reduce)');
export const PREFS_DEFAULT = (): Prefs => ({
  vib: true, haptics: 1, sfxVol: 1, musicVol: 1, calm: reduced(), textSize: 0, bigText: false, bigButtons: false, dusk: true, hints: true, plates: false, cardSide: 'left', breakMin: 25, miniBig: false, saver: true,
  cvd: false, contrast: media('(prefers-contrast: more)'), dim: 0, dimNight: true, toastTop: false, clock: false, autoOpen: false, windVol: true,
});

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
/** 保存された好みを読む。壊れた値は既定に戻す。古い「振動」「文字を大きく」は、段階のある新しい好みに読み替える */
export function prefs(): Prefs {
  const d = PREFS_DEFAULT(), m = (store.meta().prefs ?? {}) as Record<string, unknown>;
  const b = (k: keyof Prefs) => (typeof m[k] === 'boolean' ? (m[k] as boolean) : (d[k] as boolean));
  const haptics = hapticsOf(m), textSize = textSizeOf(m);
  return {
    vib: haptics > 0, haptics, sfxVol: clamp01(m.sfxVol, d.sfxVol), musicVol: clamp01(m.musicVol, d.musicVol), calm: b('calm'), textSize, bigText: textSize > 0, bigButtons: b('bigButtons'),
    dusk: b('dusk'), hints: b('hints'), plates: b('plates'), cardSide: m.cardSide === 'right' ? 'right' : 'left', breakMin: m.breakMin === 0 || m.breakMin === 50 ? m.breakMin : 25,
    miniBig: b('miniBig'), saver: b('saver'),
    cvd: b('cvd'), contrast: b('contrast'), dim: m.dim === 1 || m.dim === 2 || m.dim === 3 ? m.dim : 0, dimNight: b('dimNight'), toastTop: b('toastTop'), clock: b('clock'), autoOpen: b('autoOpen'), windVol: b('windVol'),
  };
}
const listeners: ((p: Prefs) => void)[] = [];
export const onPrefs = (f: (p: Prefs) => void) => { listeners.push(f); };
export function setPrefs(p: Partial<Prefs>) {
  const cur = prefs(), q = { ...p };
  // 古い名前（あり・なし、オン・オフ）で変えられたら、段階に読み替える
  if (q.vib !== undefined && q.haptics === undefined) q.haptics = q.vib ? cur.haptics || 1 : 0;
  if (q.bigText !== undefined && q.textSize === undefined) q.textSize = q.bigText ? cur.textSize || 1 : 0;
  const next = { ...cur, ...q };
  // 古い版のコードが読んでも同じ意味になるよう、古い名前も合わせて書く
  next.vib = next.haptics > 0; next.bigText = next.textSize > 0;
  store.setMeta({ prefs: next as unknown as Record<string, unknown> });
  applyPrefs();
}
/** 好みを初期値に戻す */
export function resetPrefs() {
  store.setMeta({ prefs: {} });
  applyPrefs();
}
/** 好みを画面に反映する（html の class と、登録された関数） */
export function applyPrefs() {
  const p = prefs(), root = document.documentElement;
  root.classList.toggle('calm', p.calm);
  root.classList.toggle('big-text', p.textSize >= 1);
  root.classList.toggle('huge-text', p.textSize === 2);
  root.classList.toggle('big-btn', p.bigButtons);
  root.classList.toggle('card-right', p.cardSide === 'right');
  root.classList.toggle('mini-big', p.miniBig);
  root.classList.toggle('no-hints', !p.hints);
  root.classList.toggle('cvd', p.cvd);
  root.classList.toggle('hc', p.contrast);
  root.classList.toggle('toast-top', p.toastTop);
  for (const f of listeners) f(p);
}

/** 短く震わせる。強さは設定に従う。iPhone・iPad の Safari は振動に対応していないので、何も起きない */
export function buzz(ms: number | number[]) {
  const pat = hapticPattern(ms, prefs().haptics);
  if (pat === null) return;
  try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pat); } catch { /* 対応していない */ }
}
