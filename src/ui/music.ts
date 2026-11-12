import { audioContext, soundOn } from './sound';

/** その場で合成する静かな背景音楽。外部ファイルは使わない。
 *  4 つの和音をゆっくり回し、工場がよく動いているほど、上に乗る音が増える */
let on = true;
let nextBar = 0, bar = 0, level = 0;
let master: GainNode | null = null, echo: DelayNode | null = null;

export const setMusic = (v: boolean) => { on = v; if (!v) fade(0); };
let vol = 1;
/** 音楽の大きさ（0〜1） */
export const setMusicVolume = (v: number) => { vol = Math.max(0, Math.min(1, v)); };
export const musicOn = () => on;

const BAR = 4.8;                      // 1 小節の秒数（1 拍 1.2 秒）
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// ニ短調のあたりを回る 4 つの和音（根音・五度・七度・九度）。どれも五音音階の旋律と濁らない
const CHORDS = [[38, 45, 53, 60, 64], [34, 41, 50, 57, 60], [41, 48, 52, 57, 64], [36, 43, 52, 57, 62]];
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81];

function fade(to: number) {
  const ac = audioContext(false);
  if (!ac || !master) return;
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setTargetAtTime(to, ac.currentTime, 0.6);
}

function pad(ac: AudioContext, out: AudioNode, note: number, t: number, dur: number, gain: number) {
  const g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(gain * 0.7, t + dur * 0.75);
  g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.15);
  for (const detune of [-5, 6]) {
    const o = ac.createOscillator();
    o.type = 'triangle'; o.frequency.value = hz(note); o.detune.value = detune;
    o.connect(f); o.start(t); o.stop(t + dur * 1.2);
  }
  f.connect(g).connect(out);
}

function pluck(ac: AudioContext, out: AudioNode, note: number, t: number, gain: number) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = hz(note);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  o.connect(g).connect(out);
  if (echo) g.connect(echo);
  o.start(t); o.stop(t + 1.7);
}

// 乱数は小節の番号から作る（同じ場所では同じ節になり、落ち着いて聞こえる）
const rnd = (k: number) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** 毎フレーム呼ぶ。playing：工場の画面を開いているか。activity：0〜1、工場の忙しさ */
export function musicTick(playing: boolean, activity: number) {
  const ac = audioContext(false);
  if (!ac || ac.state !== 'running') return;   // 最初の操作で音が出せるようになるまで待つ
  if (!master) {
    master = ac.createGain(); master.gain.value = 0;
    echo = ac.createDelay(1.5); echo.delayTime.value = 0.6;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    echo.connect(fb).connect(echo);
    echo.connect(master);
    master.connect(ac.destination);
  }
  const want = on && soundOn() && playing && vol > 0;
  fade(want ? 0.5 * vol : 0);
  if (!want) { nextBar = 0; return; }
  level += (Math.max(0, Math.min(1, activity)) - level) * 0.02;
  const now = ac.currentTime;
  if (nextBar < now) nextBar = now + 0.1;
  // 1 小節ぶん先まで予約しておく
  while (nextBar < now + 1.2) {
    const t0 = nextBar, ch = CHORDS[bar % CHORDS.length];
    ch.forEach((n, i) => pad(ac, master!, n, t0 + i * 0.05, BAR, i === 0 ? 0.055 : 0.03));
    // 旋律：8 分音符の升目に、忙しさに応じてまばらに置く
    for (let s = 0; s < 8; s++) {
      const r = rnd(bar * 8 + s);
      if (r > 0.16 + level * 0.3) continue;
      const n = SCALE[Math.floor(rnd(bar * 8 + s + 0.5) * SCALE.length)];
      pluck(ac, master!, n, t0 + (s * BAR) / 8, 0.035 + level * 0.02);
    }
    bar++;
    nextBar += BAR;
  }
}
