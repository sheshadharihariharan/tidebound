// Voyages: each is its own sea with its own enemies and boss. A voyage is a route of 7 stops;
// each step offers 2 or 3 stops to pick from, and the last is the boss.
// Also decides which enemies each battle sends, getting harder further along.

export const STOPS = 7;
export const STOP = {
  battle: { name: 'Battle' },
  treasure: { name: 'Treasure' },
  port: { name: 'Port' },
};

// pools: which enemy kinds can turn up, by how far into the voyage you are (the last one covers the rest).
// harder: extra steps of difficulty for wave sizes. theme: how the sea looks (see world.js).
export const VOYAGES = {
  shallows: {
    name: 'Sunny Shallows', text: 'Pirates, sharks and the Kraken', sea: 0x2aa6b8,
    final: 'Skull Rock', boss: 'kraken', harder: 0,
    pools: [['sloop'], ['sloop', 'shark'], ['sloop', 'shark', 'gunboat'], ['sloop', 'shark', 'gunboat', 'turtle']],
    theme: { rocks: [0x8a8f99, 0x7b8089, 0x9a948b], coral: false, sandbars: 0 },
  },
  reef: {
    name: 'Coral Reef', text: 'Jellyfish, pufferfish and the Crab King', sea: 0x2fbfc0,
    final: 'Crab Atoll', boss: 'crab', harder: 1, unlock: (save) => save.krakens > 0, locked: 'Beat the Kraken to unlock',
    pools: [['sloop', 'jellies'], ['sloop', 'jellies', 'puffer'], ['sloop', 'jellies', 'puffer', 'shark'],
      ['sloop', 'jellies', 'puffer', 'shark', 'gunboat', 'turtle']],
    theme: { rocks: [0xd9b38c, 0xc9a27a, 0xe3c39d], coral: true, sandbars: 4 },
  },
  storm: { name: 'Storm Belt', text: 'Fire ships and the Admiral', locked: 'Coming soon' },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Returns the steps: an array of 7 arrays of stop types. Each step has a battle and no repeats;
// ports turn up from the third step on.
export function createRoute() {
  const steps = [];
  for (let i = 0; i < STOPS - 1; i++) {
    const others = i < 2 ? ['treasure'] : Math.random() < 0.5 ? ['treasure', 'port'] : [pick(['treasure', 'port'])];
    steps.push(['battle', ...others].sort(() => Math.random() - 0.5));
  }
  steps.push(['final']);
  return steps;
}

const poolAt = (voyage, step) => voyage.pools[Math.min(voyage.pools.length - 1, step)];

// The waves for a battle at this step: a list of waves, each a list of enemy kinds. Each wave starts with a sloop.
export function battleWaves(step, voyage) {
  const pool = poolAt(voyage, step), s = Math.min(STOPS - 2, step + voyage.harder);
  const sizes = s < 2 ? [2, 2 + s] : s < 4 ? [2, 3, 3] : [3, 3, 4];
  return sizes.map((n) => fill(['sloop'], n, pool));
}

// Add random kinds to a wave until it has n; at most one gunboat, turtle or jellyfish swarm in a wave.
function fill(wave, n, pool) {
  while (wave.length < n) {
    const kind = pick(pool);
    if (['gunboat', 'turtle', 'jellies'].includes(kind) && wave.includes(kind)) continue;
    wave.push(kind);
  }
  return wave;
}

// Pirates waiting in a treasure cove (about 1 time in 3), or null.
export function ambushWave(step, voyage) {
  if (Math.random() > 0.35) return null;
  return fill(['sloop'], step + voyage.harder >= 4 ? 3 : 2, poolAt(voyage, step));
}
