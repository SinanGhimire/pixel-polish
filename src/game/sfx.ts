// Tiny WebAudio synth for crisp combat sounds (no files needed).
let ctx: AudioContext | null = null;
let volume = 0.8;
export function setSfxVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}
export function setSfxMuted(m: boolean) {
  muted = m;
}
let muted = false;
function ac() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
function noise(dur: number, freq: number, q: number, vol: number, sweep = 0) {
  if (muted || volume <= 0) return;
  const c = ac();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(freq, c.currentTime);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, c.currentTime + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol * volume;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}
function tone(freq: number, dur: number, vol: number, type: OscillatorType = "square", to?: number, delay = 0) {
  if (muted || volume <= 0) return;
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol * volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}
export const sfx = {
  swing: () => noise(0.16, 2400, 1.2, 0.35, 700),
  hit: () => {
    noise(0.12, 900, 0.8, 0.6, 200);
    tone(140, 0.12, 0.15, "square", 60);
  },
  kill: () => {
    noise(0.3, 500, 0.6, 0.5, 120);
    tone(90, 0.3, 0.12, "sawtooth", 40);
  },
  jump: () => tone(300, 0.12, 0.06, "triangle", 620),
  land: () => noise(0.08, 300, 0.7, 0.25),
  dash: () => noise(0.22, 600, 0.6, 0.3, 2400),
  hurt: () => tone(220, 0.25, 0.15, "sawtooth", 70),
  block: () => {
    tone(1200, 0.08, 0.1, "square", 800);
    noise(0.06, 3000, 2, 0.3);
  },
  parry: () => {
    tone(1800, 0.25, 0.12, "triangle", 2400);
    tone(900, 0.3, 0.08, "triangle", 1200, 0.03);
  },
  coin: () => {
    tone(1320, 0.06, 0.06, "square");
    tone(1760, 0.1, 0.06, "square", undefined, 0.05);
  },
  chime: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 0.07, "triangle", undefined, i * 0.08)),
  horn: () => {
    tone(110, 1.2, 0.18, "sawtooth", 90);
    tone(165, 1.2, 0.1, "sawtooth", 130);
  },
  special: () => {
    noise(0.6, 200, 0.5, 0.6, 3000);
    tone(80, 0.6, 0.2, "sawtooth", 300);
  },
  tick: () => tone(660, 0.08, 0.08, "square"),
  go: () => tone(880, 0.3, 0.1, "square", 1320),
};
