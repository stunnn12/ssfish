// Âm thanh tổng hợp bằng WebAudio: không có file âm thanh nào cần tải.
// Tôn trọng trạng thái tắt tiếng của Playables và tạm dừng khi game bị pause.
let ctx = null;
let master, sfxBus, ambBus, noiseBuf;
let enabled = true;
let paused = false;

function applyGain() {
  if (!ctx) return;
  const v = enabled && !paused ? 1 : 0;
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function makeNoise() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(g, t, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}

function tone({ f = 440, f2, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
  env(g, t, attack, vol, dur);
  o.connect(g);
  g.connect(sfxBus);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f = 1000, f2, q = 1, attack = 0.005, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(sfxBus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + attack + dur + 0.05);
}

const note = semis => 523.25 * Math.pow(2, semis / 12);

const SFX = {
  click: () => tone({ f: 900, f2: 1300, type: 'triangle', dur: 0.05, vol: 0.1 }),
  cast: () => noise({ dur: 0.35, vol: 0.22, type: 'bandpass', f: 500, f2: 2600, q: 1.4 }),
  splash: o => {
    const v = o.v ?? 1;
    noise({ dur: 0.45, vol: 0.32 * v, type: 'lowpass', f: 2400, f2: 260 });
    tone({ f: 320, f2: 110, dur: 0.14, vol: 0.07 * v });
  },
  nibble: () => tone({ f: 520, f2: 380, dur: 0.06, vol: 0.07 }),
  early: () => tone({ f: 260, f2: 200, type: 'triangle', dur: 0.08, vol: 0.08 }),
  bite: () => {
    tone({ f: 760, f2: 240, dur: 0.18, vol: 0.24 });
    noise({ dur: 0.22, vol: 0.25, f: 1600, f2: 400 });
  },
  hook: () => tone({ f: 220, f2: 700, type: 'triangle', dur: 0.12, vol: 0.2 }),
  perfect: () => {
    tone({ f: note(12), type: 'triangle', dur: 0.08, vol: 0.14 });
    tone({ f: note(19), type: 'triangle', dur: 0.16, vol: 0.14, delay: 0.07 });
  },
  reel: () => tone({ f: 1700 + Math.random() * 300, type: 'square', dur: 0.012, vol: 0.025 }),
  warn: () => tone({ f: 1150, type: 'square', dur: 0.06, vol: 0.05 }),
  thrash: () => noise({ dur: 0.32, vol: 0.28, f: 1900, f2: 450 }),
  strain: () => tone({ f: 1400, f2: 1300, type: 'sawtooth', dur: 0.05, vol: 0.035 }),
  snap: () => {
    tone({ f: 1700, f2: 180, type: 'sawtooth', dur: 0.25, vol: 0.16 });
    noise({ dur: 0.15, vol: 0.3, type: 'highpass', f: 2200 });
  },
  escape: () => tone({ f: 420, f2: 190, type: 'triangle', dur: 0.32, vol: 0.14 }),
  catch: () => [0, 4, 7, 12].forEach((s, i) => tone({ f: note(s), type: 'triangle', dur: 0.18, vol: 0.14, delay: i * 0.08 })),
  rare: () => {
    [0, 4, 7, 11, 14, 19].forEach((s, i) => tone({ f: note(s), type: 'triangle', dur: 0.22, vol: 0.13, delay: i * 0.07 }));
    noise({ dur: 0.8, vol: 0.06, type: 'highpass', f: 6000, delay: 0.3 });
  },
  newSpecies: () => [12, 16, 19, 24].forEach((s, i) => tone({ f: note(s), type: 'sine', dur: 0.2, vol: 0.1, delay: 0.45 + i * 0.06 })),
  coin: () => {
    tone({ f: 1318, type: 'square', dur: 0.05, vol: 0.08 });
    tone({ f: 1760, type: 'square', dur: 0.12, vol: 0.08, delay: 0.06 });
  },
  buy: () => [0, 7, 12].forEach((s, i) => tone({ f: note(s + 5), type: 'triangle', dur: 0.12, vol: 0.12, delay: i * 0.06 })),
  deny: () => tone({ f: 200, f2: 150, type: 'square', dur: 0.12, vol: 0.06 }),
  thunder: () => {
    noise({ dur: 2.4, vol: 0.5, type: 'lowpass', f: 380, f2: 50, attack: 0.04 });
    noise({ dur: 0.3, vol: 0.2, type: 'lowpass', f: 1200, f2: 200 });
  },
  horn: () => {
    tone({ f: 196, type: 'sawtooth', dur: 0.6, vol: 0.06, attack: 0.08 });
    tone({ f: 247, type: 'sawtooth', dur: 0.6, vol: 0.04, attack: 0.08 });
  },
  chest: () => [0, 4, 7, 12, 16].forEach((s, i) => tone({ f: note(s + 7), type: 'triangle', dur: 0.14, vol: 0.1, delay: i * 0.05 })),
  quest: () => [0, 7, 12, 16].forEach((s, i) => tone({ f: note(s), type: 'triangle', dur: 0.16, vol: 0.12, delay: i * 0.09 })),
};

let ambGain = null;
let lastReel = 0;

function startAmbience() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  ambGain = ctx.createGain();
  ambGain.gain.value = 0.55;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.35;
  lfo.connect(lfoG);
  lfoG.connect(ambGain.gain);
  src.connect(lp);
  lp.connect(ambGain);
  ambGain.connect(ambBus);
  src.start();
  lfo.start();
}

export const audio = {
  /** Phải gọi trong một thao tác của người chơi (chính sách autoplay). */
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        return;
      }
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8;
      sfxBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = 0.05;
      ambBus.connect(master);
      noiseBuf = makeNoise();
      startAmbience();
      applyGain();
    }
    if (ctx.state === 'suspended' && !paused) ctx.resume().catch(() => {});
  },
  setEnabled(v) {
    enabled = !!v;
    applyGain();
  },
  setPaused(v) {
    paused = !!v;
    if (!ctx) return;
    applyGain();
    if (v) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  },
  /** Mức tiếng sóng nền theo thời tiết (0..1). */
  setAmbience(level) {
    if (!ctx) return;
    ambBus.gain.setTargetAtTime(0.03 + level * 0.09, ctx.currentTime, 0.8);
  },
  play(name, opts) {
    if (!ctx || !enabled || paused || ctx.state !== 'running') return;
    const f = SFX[name];
    if (!f) return;
    if (name === 'reel') {
      const now = ctx.currentTime;
      if (now - lastReel < 0.035) return;
      lastReel = now;
    }
    try {
      f(opts || {});
    } catch {
      /* bỏ qua lỗi âm thanh */
    }
  },
};
