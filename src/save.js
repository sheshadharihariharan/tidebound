// What's kept between voyages, saved on this device: the home chest, shipyard upgrades and a few counts.
// Also the shipyard's upgrades and what each level does.

const KEY = 'tidebound-save';
// krakens / crabs / admirals: bosses beaten (the Kraken unlocks the Coral Reef, the Crab King the Storm Belt).
const FRESH = { bank: 0, levels: { hull: 0, sails: 0, cannons: 0, purse: 0 }, voyages: 0, krakens: 0, crabs: 0, admirals: 0, seenHelp: false };
export const BEATEN = { kraken: 'krakens', crab: 'crabs', flagship: 'admirals' }; // which count each boss adds to

export const save = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY)) ?? {};
    return { ...FRESH, ...stored, levels: { ...FRESH.levels, ...stored.levels } };
  } catch {
    return structuredClone(FRESH);
  }
})();

export function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage blocked (private browsing): progress lasts until the page closes.
  }
}

// Permanent upgrades bought with the home chest. Each has 5 levels.
export const UPGRADES = {
  hull: { name: 'Stronger hull', text: '+15 hull a level',
    icon: '<path d="M3 13h18l-3 6H6z"/><path d="M12 13V4M12 5l6 5h-6"/>' },
  sails: { name: 'Faster sails', text: '+6% speed and turning a level',
    icon: '<path d="M10 3v16M10 4c7 3 9 9 8 13h-8"/><path d="M4 21h16"/>' },
  cannons: { name: 'Heavier cannons', text: '+1 damage a level',
    icon: '<path d="M3 11l14-5 2 6-14 4z"/><circle cx="8" cy="17" r="3"/>' },
  purse: { name: 'Bigger purse', text: 'Start voyages with +30 gold a level',
    icon: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5v7M9.5 11.5c0-1.5 5-1.5 5 0s-5 1.5-5 3 5 1.5 5 0"/>' },
};
export const MAX_LEVEL = 5;
const COST = [80, 160, 280, 450, 700];
export const upgradeCost = (id) => COST[save.levels[id]]; // undefined at the top level

// The ship's stats for a voyage, with the upgrades bought so far.
export function upgradedStats(base) {
  const L = save.levels;
  return { ...base, hp: base.hp + 15 * L.hull, maxSpeed: base.maxSpeed * (1 + 0.06 * L.sails), turn: base.turn * (1 + 0.06 * L.sails) };
}
export const shotDamage = (base) => base + save.levels.cannons;
export const startGold = () => 30 * save.levels.purse;
