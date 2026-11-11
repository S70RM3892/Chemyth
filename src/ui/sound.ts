/** 短い合成音。外部ファイルは使わない */
let ac: AudioContext | null = null;
let enabled = true;

export const setSound = (on: boolean) => { enabled = on; };
export const soundOn = () => enabled;

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.05, when = 0) {
  if (!enabled) return;
  try {
    ac ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === 'suspended') void ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
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
