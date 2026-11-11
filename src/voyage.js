// A voyage: a route of 7 stops. Each step offers 2 or 3 stops to pick from; the last is Skull Rock.
// Also decides which enemies each battle sends, getting harder further along.

export const STOPS = 7;
export const STOP = {
  battle: { name: 'Battle' },
  treasure: { name: 'Treasure' },
  port: { name: 'Port' },
  final: { name: 'Skull Rock' },
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

// Which kinds can turn up, by how far into the voyage you are (step 0 to 6).
const POOL = [['sloop'], ['sloop', 'shark'], ['sloop', 'shark', 'gunboat'], ['sloop', 'shark', 'gunboat', 'turtle']];

// The waves for a battle at this step: a list of waves, each a list of enemy kinds. Each wave starts with a sloop.
export function battleWaves(step) {
  const pool = POOL[Math.min(POOL.length - 1, step)];
  const final = step === STOPS - 1;
  const sizes = final ? [3, 4, 4] : step < 2 ? [2, 2 + step] : step < 4 ? [2, 3, 3] : [3, 3, 4];
  return sizes.map((n) => fill(['sloop'], n, pool));
}

// Add random kinds to a wave until it has n; at most one gunboat and one turtle in a wave.
function fill(wave, n, pool) {
  while (wave.length < n) {
    const kind = pick(pool);
    if ((kind === 'gunboat' || kind === 'turtle') && wave.includes(kind)) continue;
    wave.push(kind);
  }
  return wave;
}

// Pirates waiting in a treasure cove (about 1 time in 3), or null.
export function ambushWave(step) {
  if (Math.random() > 0.35) return null;
  const pool = POOL[Math.min(POOL.length - 1, step)];
  return fill(['sloop'], step >= 4 ? 3 : 2, pool);
}
