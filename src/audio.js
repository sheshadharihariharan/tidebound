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
let sfxBus, musicBus, reverbSend, noiseBuffer, wash, rain;

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
  rain = loopNoise('highpass', 2500, 0.4, rainWanted * 0.05);

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

// Rain hiss for the Storm Belt: 0 (none) to 1.
let rainWanted = 0;
export function setRain(amount) {
  rainWanted = amount;
  if (rain) rain.gain.setTargetAtTime(amount * 0.05, ctx.currentTime, 0.5);
}

// ---------- sound effects ----------

function play(fn) {
  if (!ctx || !settings.sound) return;
  fn(ctx.currentTime + 0.01);
}

export const sfx = {
  click: () => play((t) => tone(720, t, 0.05, { type: 'triangle', gain: 0.18 })),

  // Combat: a deep boom per cannon, a little apart, with a puff of smoke.
  // `loud` is 0..1, quieter for pirates firing further away.
  cannon: (count = 2, loud = 1) => play((t) => {
    for (let i = 0; i < count; i++) {
      const at = t + i * 0.07;
      tone(120, at, 0.4, { gain: 0.55 * loud, slideTo: 38 });
      noise(at, 0.45, { freq: 2200, freqTo: 180, gain: 0.32 * loud });
      noise(at, 0.03, { type: 'highpass', freq: 3500, gain: 0.25 * loud });
    }
  }),
  // Our shot cracking into a pirate's hull: sharp wood snap.
  crack: () => play((t) => {
    noise(t, 0.08, { type: 'bandpass', freq: 1600, q: 2, gain: 0.5 });
    tone(260, t, 0.15, { type: 'triangle', gain: 0.3, slideTo: 110 });
    for (let i = 0; i < 3; i++) noise(t + 0.05 + i * 0.04, 0.04, { type: 'highpass', freq: 2500 + i * 700, gain: 0.15 });
  }),
  // A pirate shot hitting us: heavier, lower crunch.
  hurt: () => play((t) => {
    tone(90, t, 0.35, { gain: 0.5, slideTo: 40 });
    noise(t, 0.2, { type: 'bandpass', freq: 900, q: 1.5, gain: 0.45 });
    tone(180, t + 0.04, 0.3, { type: 'sawtooth', gain: 0.04, slideTo: 140 });
  }),
  // A ship going under: falling groan and gurgles.
  sink: () => play((t) => {
    tone(200, t, 1.4, { type: 'triangle', gain: 0.18, slideTo: 60 });
    noise(t, 1.6, { freq: 900, freqTo: 120, gain: 0.2 });
    for (let i = 0; i < 7; i++) tone(300 + Math.random() * 300, t + 0.3 + i * 0.17, 0.08, { gain: 0.06, slideTo: 700 });
  }),
  // Picking up a coin: bright two-note jingle, a little higher each time in a quick run.
  coin: (() => {
    let run = 0, last = 0;
    return () => play((t) => {
      run = t - last < 0.6 ? Math.min(run + 1, 6) : 0;
      last = t;
      const base = 81 + [0, 2, 4, 5, 7, 9, 12][run];
      tone(hz(base), t, 0.12, { type: 'triangle', gain: 0.12 });
      tone(hz(base + 7), t + 0.06, 0.25, { type: 'triangle', gain: 0.1 });
    });
  })(),
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

  // Gunboat: a hollow mortar thump, then a falling whistle while the shell is up.
  mortar: (flight) => play((t) => {
    tone(70, t, 0.5, { gain: 0.5, slideTo: 32 });
    noise(t, 0.35, { freq: 600, freqTo: 120, gain: 0.3 });
    tone(1500, t + 0.25, flight - 0.25, { gain: 0.035, slideTo: 450, attack: 0.3 });
  }),
  // The shell landing: a deep boom with a heavy splash.
  shell: () => play((t) => {
    tone(80, t, 0.6, { gain: 0.5, slideTo: 30 });
    noise(t, 0.7, { freq: 1600, freqTo: 140, gain: 0.35 });
  }),
  // A mine going off: the biggest bang in the game.
  boom: () => play((t) => {
    tone(60, t, 0.9, { gain: 0.65, slideTo: 25 });
    noise(t, 0.9, { freq: 3000, freqTo: 100, gain: 0.45 });
    noise(t, 0.05, { type: 'highpass', freq: 3000, gain: 0.3 });
  }),
  // A mine dropped into the water: a small plop.
  plop: () => play((t) => tone(380, t, 0.12, { gain: 0.12, slideTo: 760 })),
  // A mine nearby: a short blip, higher when it is very close.
  beep: (close) => play((t) => tone(close ? 1320 : 990, t, 0.07, { type: 'square', gain: 0.035 })),
  // A shark about to charge: two low warning notes.
  sharkWarn: () => play((t) => {
    tone(hz(40), t, 0.3, { type: 'sawtooth', gain: 0.07, attack: 0.02 });
    tone(hz(41), t + 0.4, 0.3, { type: 'sawtooth', gain: 0.08, attack: 0.02 });
    noise(t, 0.4, { type: 'bandpass', freq: 1200, gain: 0.12 });
  }),
  // The shark's charge: a rushing whoosh.
  sharkGo: () => play((t) => noise(t, 0.8, { type: 'bandpass', freq: 500, freqTo: 2500, q: 1.2, gain: 0.3 })),
  // The shark's bite on the hull: a snap and a crunch.
  bite: () => play((t) => {
    noise(t, 0.06, { type: 'highpass', freq: 2000, gain: 0.4 });
    tone(140, t, 0.3, { type: 'square', gain: 0.12, slideTo: 60 });
    noise(t + 0.05, 0.25, { type: 'bandpass', freq: 800, q: 2, gain: 0.35 });
  }),
  // Picking up a repair crate: two hammer knocks and a warm rising chime.
  repair: () => play((t) => {
    [0, 0.12].forEach((d) => tone(420, t + d, 0.08, { type: 'triangle', gain: 0.22, slideTo: 260 }));
    [69, 73, 76, 81].forEach((m, i) => mallet(m, t + 0.25 + i * 0.07, { gain: 0.14 }));
  }),
  // A chest opening: a creaky lid and a shower of coins.
  chest: () => play((t) => {
    tone(300, t, 0.25, { type: 'sawtooth', gain: 0.04, slideTo: 420 });
    [76, 79, 83, 88, 91].forEach((m, i) => tone(hz(m), t + 0.2 + i * 0.06, 0.2, { type: 'triangle', gain: 0.09 }));
  }),
  // Buying in port, or picking up gear: a short till ring.
  buy: () => play((t) => [81, 88].forEach((m, i) => mallet(m, t + i * 0.08, { gain: 0.16 }))),
  // Kraken: the water rumbling where a tentacle is about to burst up.
  rumble: () => play((t) => {
    tone(45, t, 1.3, { type: 'sawtooth', gain: 0.06, attack: 0.6 });
    noise(t, 1.2, { freq: 300, freqTo: 120, gain: 0.18 });
  }),
  // A big splash: a tentacle bursting up, or the head diving.
  splashBig: () => play((t) => {
    noise(t, 0.9, { freq: 2000, freqTo: 200, gain: 0.35 });
    tone(150, t, 0.4, { gain: 0.25, slideTo: 50 });
  }),
  // A tentacle slamming down on the water.
  slam: () => play((t) => {
    tone(55, t, 0.7, { gain: 0.65, slideTo: 28 });
    noise(t, 0.8, { freq: 2500, freqTo: 150, gain: 0.5 });
    noise(t, 0.04, { type: 'highpass', freq: 3000, gain: 0.3 });
  }),
  // The Kraken's roar when its head comes up (and when it's beaten).
  roar: () => play((t) => {
    tone(110, t, 1.2, { type: 'sawtooth', gain: 0.12, slideTo: 70, attack: 0.2 });
    tone(73, t, 1.3, { type: 'sawtooth', gain: 0.1, slideTo: 55, attack: 0.25 });
    noise(t, 1.2, { type: 'bandpass', freq: 400, q: 1, gain: 0.22 });
  }),
  // Ink squirting at the screen.
  ink: () => play((t) => {
    tone(400, t, 0.25, { gain: 0.15, slideTo: 120 });
    noise(t, 0.3, { type: 'bandpass', freq: 900, gain: 0.25 });
  }),
  // A cannonball thumping into the Kraken.
  squish: () => play((t) => {
    tone(220, t, 0.15, { type: 'triangle', gain: 0.25, slideTo: 120 });
    noise(t, 0.1, { type: 'bandpass', freq: 1200, gain: 0.25 });
  }),
  // Coral Reef: a jellyfish sting, a buzzy zap.
  zap: () => play((t) => {
    tone(880, t, 0.18, { type: 'square', gain: 0.06, slideTo: 300 });
    noise(t, 0.15, { type: 'bandpass', freq: 3000, q: 4, gain: 0.15 });
  }),
  // A pufferfish swelling up: a rising, rubbery squeak.
  inflate: () => play((t) => tone(200, t, 0.8, { type: 'triangle', gain: 0.14, slideTo: 700, attack: 0.1 })),
  // Its spikes bursting out.
  spikes: () => play((t) => {
    noise(t, 0.2, { type: 'highpass', freq: 2500, gain: 0.35 });
    tone(500, t, 0.15, { type: 'triangle', gain: 0.15, slideTo: 150 });
  }),
  // The Crab King's claw snapping shut.
  snap: () => play((t) => {
    noise(t, 0.05, { type: 'bandpass', freq: 2200, q: 3, gain: 0.5 });
    tone(320, t, 0.12, { type: 'square', gain: 0.08, slideTo: 160 });
  }),
  // A cannonball bouncing off its shell.
  clank: () => play((t) => {
    tone(1200, t, 0.25, { type: 'triangle', gain: 0.12 });
    tone(1750, t, 0.18, { type: 'triangle', gain: 0.06 });
  }),
  // Storm Belt: a fire ship's flames crackling.
  crackle: () => play((t) => {
    for (let i = 0; i < 4; i++) noise(t + i * 0.05 + Math.random() * 0.03, 0.03, { type: 'highpass', freq: 3000 + Math.random() * 2000, gain: 0.08 });
  }),
  // A harpoon fired: a twang and a whistle.
  twang: () => play((t) => {
    tone(180, t, 0.4, { type: 'sawtooth', gain: 0.07, slideTo: 140 });
    tone(900, t, 0.25, { gain: 0.05, slideTo: 1400 });
  }),
  // Storm eels charging up: a rising electric whine.
  charge: () => play((t) => {
    tone(200, t, 1.1, { type: 'sawtooth', gain: 0.04, slideTo: 900, attack: 0.3 });
    noise(t, 1.1, { type: 'bandpass', freq: 4000, q: 3, gain: 0.06 });
  }),
  // Thunder: a crack, then a long rolling rumble.
  thunder: () => play((t) => {
    noise(t, 0.15, { type: 'highpass', freq: 1500, gain: 0.25 });
    noise(t + 0.05, 2.5, { freq: 400, freqTo: 60, gain: 0.45 });
    tone(50, t + 0.05, 2, { gain: 0.2, slideTo: 35, attack: 0.1 });
  }),
  // A wind gust coming: a rising whoosh.
  gust: () => play((t) => noise(t, 2.5, { type: 'bandpass', freq: 300, freqTo: 1200, q: 0.8, gain: 0.25 })),
  // A new wave: a short bright call on the marimba.
  wave: () => play((t) => [62, 66, 69, 74].forEach((m, i) => mallet(m, t + i * 0.09, { gain: 0.16 }))),
  // Battle won: a cheerful climb that lands on a held chord.
  victory: () => play((t) => {
    [62, 66, 69, 74, 78].forEach((m, i) => mallet(m, t + i * 0.11, { gain: 0.18 }));
    [74, 78, 81].forEach((m) => mallet(m, t + 0.7, { gain: 0.14, dur: 1.4 }));
  }),
  // Ship lost: a soft, falling phrase.
  defeat: () => play((t) => [69, 66, 64, 62].forEach((m, i) => mallet(m, t + i * 0.28, { gain: 0.14, dur: 0.9 }))),
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

// The Kraken fight: the same 3/4 lilt, but faster, in D minor, with drums.
const Dm = { bass: 50, notes: [62, 65, 69] };
const Bb = { bass: 46, notes: [58, 62, 65] };
const C = { bass: 48, notes: [60, 64, 67] };
const Gm = { bass: 43, notes: [55, 58, 62] };
const BOSS_MELODY = [
  [0, 74, 1], [1, 72, 1], [2, 74, 2], [4, 69, 2],
  [6, 70, 1], [7, 69, 1], [8, 70, 2], [10, 65, 2],
  [12, 67, 1], [13, 69, 1], [14, 70, 2], [16, 72, 2],
  [18, 73, 3], [22, 69, 2],
  [24, 74, 1], [25, 76, 1], [26, 77, 2], [28, 74, 2],
  [30, 77, 1], [31, 76, 1], [32, 74, 2], [34, 70, 2],
  [36, 70, 1], [37, 72, 1], [38, 74, 2], [40, 70, 2],
  [42, 73, 2], [44, 76, 2], [46, 73, 2],
];
const SONGS = {
  calm: { eighth: EIGHTH, chords: CHORDS, melody: MELODY },
  boss: { eighth: 60 / 126 / 2, chords: [Dm, Bb, C, A, Dm, Bb, Gm, A], melody: BOSS_MELODY },
};
let song = SONGS.calm;

// Switch tunes: 'calm' (the sea waltz) or 'boss' (the Kraken). Starts the new tune from its first bar.
export function setMusic(name) {
  if (song === SONGS[name]) return;
  song = SONGS[name];
  nextStep = 0;
  loop = 0;
}

let nextStep = 0, nextTime = 0, loop = 0;

function scheduleStep(step, at) {
  const bar = Math.floor(step / BAR);
  const chord = song.chords[bar];
  const beat = step % BAR;
  const bus = musicBus, E = song.eighth;
  if (song === SONGS.boss) {
    // Driving bass on every beat, a low drum, short chord stabs, the tune every time round.
    if (beat % 2 === 0) tone(hz(chord.bass - (beat === 0 ? 12 : 0)), at, E * 1.6, { type: 'triangle', gain: 0.4, attack: 0.01, bus });
    if (beat === 0 || beat === 3) tone(90, at, 0.25, { gain: 0.3, slideTo: 45, bus });
    if (beat === 2 || beat === 4) chord.notes.forEach((m) => mallet(m, at, { gain: 0.06, dur: 0.25, bus }));
    noise(at, 0.04, { type: 'highpass', freq: 7000, gain: beat % 2 ? 0.015 : 0.03, bus });
    for (const [s, m, l] of song.melody) if (s === step) mallet(m, at, { gain: 0.17, dur: Math.max(0.3, l * E * 1.4), bus });
    return;
  }
  // Oom-pah-pah: bass on one, soft chords on two and three.
  if (beat === 0) tone(hz(chord.bass), at, E * 4, { type: 'triangle', gain: 0.35, attack: 0.02, bus });
  if (beat === 2 || beat === 4) chord.notes.forEach((m, i) => mallet(m, at + i * 0.015, { gain: 0.07, dur: 0.45, bus }));
  if (beat % 2 === 1) noise(at, 0.05, { type: 'highpass', freq: 6500, gain: 0.02, bus });
  // Melody every other time round; long held tones in between so it doesn't get tiring.
  if (loop % 2 === 0) {
    for (const [s, m, l] of song.melody) if (s === step) mallet(m, at, { gain: 0.19, dur: Math.max(0.45, l * E * 1.5), bus });
  } else if (beat === 0 && bar % 2 === 0) {
    tone(hz(chord.notes[1] + 12), at, E * 11, { gain: 0.06, attack: 0.5, bus });
  }
}

function startMusic() {
  nextTime = ctx.currentTime + 0.3;
  // Schedule well ahead so the music keeps going smoothly.
  setInterval(() => {
    while (nextTime < ctx.currentTime + 1.5) {
      scheduleStep(nextStep, nextTime);
      nextTime += song.eighth;
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
