// Every sound and the music are made in code with Web Audio: no sound files to download or license.
// Browsers only allow sound after the first tap or key press, so audio starts then.
// Calm side: a lilting waltz, waves, gulls. Combat side: booms, thuds and wood knocks.

const KEY = 'tidebound-audio';
const MUSIC_LEVEL = 0.3;
const settings = (() => {
  try {
    return { music: true, sound: true, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { music: true, sound: true };
  }
})();

let ctx = null;
let sfxBus, musicBus, reverbSend, noiseBuffer, wash;

function setup() {
  ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  // Soft open-air echo shared by music and effects.
  const reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2;
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = impulse;
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.25;
  reverbSend.connect(reverb).connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sound ? 1 : 0;
  sfxBus.connect(master);
  sfxBus.connect(reverbSend);
  musicBus = ctx.createGain();
  musicBus.gain.value = settings.music ? MUSIC_LEVEL : 0;
  musicBus.connect(master);
  musicBus.connect(reverbSend);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const n = noiseBuffer.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

  startSea();
  startMusic();
}

// Start audio on the first tap or key press anywhere; pause it while the game is in the background.
export function unlockAudio() {
  const start = () => {
    if (!ctx) setup();
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  };
  // iPhones and iPads only allow it on a finished tap, so listen for that too.
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(type, start);
  document.addEventListener('visibilitychange', () => ctx && (document.hidden ? ctx.suspend() : ctx.resume()));
}

// ---------- building blocks ----------

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// One note: oscillator with a quick attack and a fading tail.
function tone(freq, at, dur, { type = 'sine', gain = 0.3, slideTo, attack = 0.005, bus = sfxBus } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(bus);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

// A burst of filtered hiss (water, smoke, crumble).
function noise(at, dur, { type = 'lowpass', freq = 1000, freqTo, q = 1, gain = 0.3, bus = sfxBus } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, at);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(at, Math.random() * 1.5);
  src.stop(at + dur + 0.05);
}

// Wooden marimba-like note: body plus a quick bright overtone.
function mallet(midi, at, { gain = 0.25, dur = 0.6, bus = sfxBus } = {}) {
  tone(hz(midi), at, dur, { gain, bus });
  tone(hz(midi) * 4, at, 0.08, { gain: gain * 0.35, bus });
}

// Endless hiss through a filter, for waves and the water rushing past the hull.
function loopNoise(filterType, freq, q, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(sfxBus);
  src.start();
  return g;
}

// ---------- the sea: waves that swell and fall, water past the hull, the odd gull ----------

function startSea() {
  const waves = loopNoise('lowpass', 480, 0.7, 0.07);
  const swell = ctx.createOscillator();
  const depth = ctx.createGain();
  swell.frequency.value = 0.12; // one slow swell about every 8 seconds
  depth.gain.value = 0.05;
  swell.connect(depth).connect(waves.gain);
  swell.start();
  wash = loopNoise('bandpass', 900, 0.7, 0);

  const gull = () => {
    if (settings.sound && ctx.state === 'running') {
      const t = ctx.currentTime + 0.05;
      tone(1250, t, 0.16, { type: 'triangle', gain: 0.02, slideTo: 1650 });
      tone(1600, t + 0.17, 0.32, { type: 'triangle', gain: 0.022, slideTo: 980 });
      if (Math.random() < 0.5) tone(1500, t + 0.6, 0.25, { type: 'triangle', gain: 0.016, slideTo: 1000 });
    }
    setTimeout(gull, 14000 + Math.random() * 18000);
  };
  setTimeout(gull, 6000);
}

// Water rushing past the hull gets louder with speed (0 to 1).
let lastWash = -1;
export function seaSpeed(amount) {
  if (!ctx || Math.abs(amount - lastWash) < 0.03) return;
  lastWash = amount;
  wash.gain.setTargetAtTime(amount * 0.12, ctx.currentTime, 0.2);
}

// ---------- sound effects ----------

function play(fn) {
  if (!ctx || !settings.sound) return;
  fn(ctx.currentTime + 0.01);
}

export const sfx = {
  click: () => play((t) => tone(720, t, 0.05, { type: 'triangle', gain: 0.18 })),

  // Combat: a deep boom per cannon, a little apart, with a puff of smoke.
  cannon: (count = 2) => play((t) => {
    for (let i = 0; i < count; i++) {
      const at = t + i * 0.07;
      tone(120, at, 0.4, { gain: 0.55, slideTo: 38 });
      noise(at, 0.45, { freq: 2200, freqTo: 180, gain: 0.32 });
      noise(at, 0.03, { type: 'highpass', freq: 3500, gain: 0.25 });
    }
  }),
  // Shot dropping into the sea.
  splash: () => play((t) => {
    noise(t, 0.5, { freq: 2400, freqTo: 300, gain: 0.12 });
    tone(240, t, 0.18, { gain: 0.1, slideTo: 90 });
    for (let i = 0; i < 3; i++) tone(1000 + Math.random() * 700, t + 0.12 + i * 0.07, 0.05, { gain: 0.03, slideTo: 1800 });
  }),
  // Shot hitting a rock or an island: dull thud and a crumble.
  thud: () => play((t) => {
    tone(95, t, 0.3, { gain: 0.45, slideTo: 45 });
    noise(t, 0.25, { freq: 700, freqTo: 150, gain: 0.35 });
    for (let i = 0; i < 4; i++) noise(t + 0.06 + i * 0.05, 0.05, { type: 'bandpass', freq: 1200 + Math.random() * 1500, q: 3, gain: 0.12 });
  }),
  // The hull knocking into a rock: a wooden bonk and a creak.
  bump: () => play((t) => {
    tone(150, t, 0.28, { type: 'triangle', gain: 0.4, slideTo: 70 });
    noise(t, 0.12, { type: 'bandpass', freq: 450, q: 2, gain: 0.3 });
    tone(210, t + 0.08, 0.35, { type: 'sawtooth', gain: 0.025, slideTo: 175 });
  }),
  // Cannons on one side are loaded again: a small wooden clack.
  reloaded: () => play((t) => {
    tone(880, t, 0.04, { type: 'triangle', gain: 0.1 });
    tone(620, t + 0.05, 0.05, { type: 'triangle', gain: 0.08 });
  }),
};

// ---------- music: a gentle sea waltz in 3/4, D – Bm – G – A ----------

const BPM = 84;
const EIGHTH = 60 / BPM / 2;
const BAR = 6; // eighths per bar
const D = { bass: 50, notes: [62, 66, 69] };
const Bm = { bass: 47, notes: [59, 62, 66] };
const G = { bass: 43, notes: [55, 59, 62] };
const A = { bass: 45, notes: [57, 61, 64] };
const CHORDS = [D, Bm, G, A, D, Bm, G, A];
// [eighth note step, midi note, length in eighths]
const MELODY = [
  [0, 69, 2], [2, 74, 2], [4, 73, 1], [5, 74, 1],
  [6, 71, 4], [10, 66, 2],
  [12, 67, 2], [14, 71, 2], [16, 74, 2],
  [18, 73, 4], [22, 69, 2],
  [24, 69, 2], [26, 74, 2], [28, 76, 1], [29, 78, 1],
  [30, 78, 2], [32, 76, 2], [34, 74, 2],
  [36, 71, 2], [38, 74, 2], [40, 79, 2],
  [42, 76, 2], [44, 73, 2], [46, 69, 2],
];
const LOOP_STEPS = CHORDS.length * BAR;

let nextStep = 0, nextTime = 0, loop = 0;

function scheduleStep(step, at) {
  const bar = Math.floor(step / BAR);
  const chord = CHORDS[bar];
  const beat = step % BAR;
  const bus = musicBus;
  // Oom-pah-pah: bass on one, soft chords on two and three.
  if (beat === 0) tone(hz(chord.bass), at, EIGHTH * 4, { type: 'triangle', gain: 0.35, attack: 0.02, bus });
  if (beat === 2 || beat === 4) chord.notes.forEach((m, i) => mallet(m, at + i * 0.015, { gain: 0.07, dur: 0.45, bus }));
  if (beat % 2 === 1) noise(at, 0.05, { type: 'highpass', freq: 6500, gain: 0.02, bus });
  // Melody every other time round; long held tones in between so it doesn't get tiring.
  if (loop % 2 === 0) {
    for (const [s, m, l] of MELODY) if (s === step) mallet(m, at, { gain: 0.19, dur: Math.max(0.45, l * EIGHTH * 1.5), bus });
  } else if (beat === 0 && bar % 2 === 0) {
    tone(hz(chord.notes[1] + 12), at, EIGHTH * 11, { gain: 0.06, attack: 0.5, bus });
  }
}

function startMusic() {
  nextTime = ctx.currentTime + 0.3;
  // Schedule well ahead so the music keeps going smoothly.
  setInterval(() => {
    while (nextTime < ctx.currentTime + 1.5) {
      scheduleStep(nextStep, nextTime);
      nextTime += EIGHTH;
      nextStep = (nextStep + 1) % LOOP_STEPS;
      if (nextStep === 0) loop++;
    }
  }, 200);
}

// ---------- on / off ----------

export const audioSetting = (name) => settings[name];

export function toggleAudio(name) {
  settings[name] = !settings[name];
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
  if (ctx) {
    const bus = name === 'music' ? musicBus : sfxBus;
    bus.gain.setTargetAtTime(settings[name] ? (name === 'music' ? MUSIC_LEVEL : 1) : 0, ctx.currentTime, 0.1);
  }
  return settings[name];
}
