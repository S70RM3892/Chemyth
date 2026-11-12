/** 短い合成音。外部ファイルは使わない */
let ac: AudioContext | null = null;
let enabled = true, volume = 1;
/** 効果音の大きさ（0〜1） */
export const setVolume = (v: number) => { volume = Math.max(0, Math.min(1, v)); };

export const setSound = (on: boolean) => { enabled = on; };
export const soundOn = () => enabled;

/** 音を出す土台。create が false なら、まだ作られていないときは null を返す（操作の前には作れない） */
export function audioContext(create = true): AudioContext | null {
  try {
    if (!ac && create) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac && create && ac.state === 'suspended') void ac.resume();
  } catch { /* 音が出せない環境では黙る */ }
  return ac;
}
/** 最初の操作で音を出せるようにする（背景音楽のため） */
export function unlockAudio() { if (enabled) audioContext(true); }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.05, when = 0) {
  if (!enabled || volume <= 0) return;
  try {
    const ac = audioContext(true);
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
    gain *= volume;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* 音が出せない環境では黙る */ }
}

export const sfx = {
  place: () => tone(520, 0.07, 'triangle', 0.04),
  erase: () => tone(210, 0.09, 'triangle', 0.04),
  ok: () => { tone(660, 0.12, 'sine', 0.05); tone(990, 0.18, 'sine', 0.05, 0.09); },
  bad: () => tone(150, 0.18, 'sawtooth', 0.03),
  goal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.05, i * 0.1)); },
  tap: () => tone(880, 0.03, 'sine', 0.02),
};
