// Gear found during a voyage: picked after a battle or bought in port, lost when the voyage ends.
// Some gear changes the ship right away (apply); the rest is checked where it matters (cannon hits, ramming).

export const GEAR = {
  double: { name: 'Double shot', text: 'Each cannon fires two balls',
    icon: '<circle cx="8" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/>' },
  chain: { name: 'Chain shot', text: 'Hits slow enemies down',
    icon: '<rect x="2" y="8.5" width="11" height="7" rx="3.5"/><rect x="11" y="8.5" width="11" height="7" rx="3.5"/>' },
  fire: { name: 'Fire shot', text: 'Hits set enemies burning',
    icon: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4.5 3-6.5 1 2 2 3 3 3 0-3-1-5 0-7.5z"/>' },
  cannon: { name: 'Extra cannon', text: 'One more cannon each side',
    icon: '<path d="M3 11l14-5 2 6-14 4z"/><circle cx="8" cy="17" r="3"/>', apply: ({ ship }) => ship.addCannon() },
  ram: { name: 'Ram spikes', text: 'Sail into enemies to hurt them',
    icon: '<path d="M3 5l18 7-18 7 5-7z"/>', apply: ({ ship }) => ship.addSpikes() },
  sails: { name: 'Better sails', text: 'Sail and turn faster',
    icon: '<path d="M10 3v16M10 4c7 3 9 9 8 13h-8"/><path d="M4 21h16"/>',
    apply: ({ ship }) => { ship.stats.maxSpeed *= 1.2; ship.stats.turn *= 1.15; } },
  patch: { name: 'Hull patch', text: '+30 hull, fixed right away',
    icon: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7.5v9M7.5 12h9"/>',
    apply: ({ ship }) => { ship.stats.hp += 30; ship.state.maxHp += 30; ship.state.hp += 30; } },
  magnet: { name: 'Gold magnet', text: 'Gold flies to you from afar',
    icon: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/>', apply: ({ loot }) => loot.setMagnet(9) },
};

// Up to n gear ids you don't have yet, in random order.
export function gearChoices(owned, n) {
  return Object.keys(GEAR).filter((id) => !owned.has(id)).sort(() => Math.random() - 0.5).slice(0, n);
}

export const gearIcon = (id) => `<svg viewBox="0 0 24 24">${GEAR[id].icon}</svg>`;
