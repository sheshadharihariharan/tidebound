import '@fontsource/lilita-one';
import './style.css';
import * as THREE from 'three';
import { createStage } from './stage.js';
import { input, readInput } from './input.js';
import { createShip, PLAYER_STATS } from './ship.js';
import { createWorld, createFoam } from './world.js';
import { createEffects } from './effects.js';
import { createEnemies } from './enemies.js';
import { createLoot } from './loot.js';
import { createBattle } from './battle.js';
import { createRoute, battleWaves, ambushWave, STOPS, VOYAGES } from './voyage.js';
import { GEAR, gearChoices } from './gear.js';
import { showChart, hideChart, showPanel, hidePanel, gearTile, showGear, showTitle, hideTitle, icon } from './screens.js';
import { save, store, UPGRADES, MAX_LEVEL, upgradeCost, upgradedStats, shotDamage, startGold, BEATEN } from './save.js';
import { createWeather } from './weather.js';
import { startDevLog } from './devlog.js';
import { unlockAudio, audioSetting, toggleAudio, sfx, seaSpeed, setMusic } from './audio.js';

const PLAYER_SHOT = 5; // damage per cannonball: a pirate (30) takes about 3 good broadsides
const PIRATE_SHOT = 6; // we (100) can take about 8
const PORT = { patch: 30, patchCost: 20, fullCostPerHp: 0.7, gearCost: 70, gearCostPerStop: 10 };

const stage = createStage(document.getElementById('game'));
const world = createWorld(stage.scene);
const foam = createFoam(stage.scene);
const fx = createEffects(stage.scene, world.solidAt);
const loot = createLoot(stage.scene);
const ship = createShip(stage.scene, undefined, undefined, true);
const p = ship.state;
const gear = new Set(); // gear ids carried this voyage
const enemies = createEnemies(stage.scene, world, fx, loot, {
  shoot(shots, dist) {
    shots.forEach((c) => fx.shoot(c.x, c.z, c.dx, c.dz, hitPlayer));
    sfx.cannon(shots.length, Math.max(0.3, 0.9 - dist / 25));
  },
  hurtPlayer,
  shake: (amount) => { shake = Math.max(shake, amount); },
  slowPlayer: (seconds) => { p.slow = seconds; },
  touchesPlayer: (x, y, z) => ship.touches(x, y, z),
  ink: splatInk,
}, gear);
const weather = createWeather(stage.scene, fx, { hurtPlayer });
const battle = createBattle(enemies, loot, { banner, end: endStop });

const $ = (id) => document.getElementById(id);
const fireButtons = { left: $('fireL'), right: $('fireR') };
const wasReady = { left: true, right: true };

// The voyage: the route, which stop was picked at each step, and the gold carried (save.bank is safe at home).
let voyage = VOYAGES.shallows, route, path, gold = 0, stopGold = 0, stop = null;
const BOSS_NAME = { kraken: 'the Kraken', crab: 'the Crab King', flagship: "the Admiral's Flagship" };
let mode = 'title'; // 'title' | 'chart' | 'sea' | 'panel'

input.onFire = (side) => {
  if (mode !== 'sea') return;
  const shots = ship.fire(side);
  if (!shots) return;
  // Double shot: each cannon fires two balls, spread a little.
  const balls = gear.has('double') ? shots.flatMap((c) => [-0.07, 0.07].map((a) => turn(c, a))) : shots;
  const damage = shotDamage(PLAYER_SHOT); // heavier with shipyard upgrades
  balls.forEach((c) => fx.shoot(c.x, c.z, c.dx, c.dz, (x, y, z) => enemies.hitAt(x, y, z, damage)));
  sfx.cannon(shots.length);
};
const turn = (c, a) => ({ ...c, dx: c.dx * Math.cos(a) - c.dz * Math.sin(a), dz: c.dx * Math.sin(a) + c.dz * Math.cos(a) });

// A pirate cannonball at (x, y, z): does it hit us?
function hitPlayer(x, y, z) {
  if (!ship.touches(x, y, z)) return false;
  hurtPlayer(PIRATE_SHOT, x, y, z);
  return true;
}

// Anything that damages us: a flash, a crunch and a shake.
function hurtPlayer(amount, x, y, z) {
  if (p.sinking >= 0) return;
  fx.shipHit(x, y, z);
  sfx.hurt();
  shake = 0.35;
  flash('hull', 'hit');
  if (ship.hurt(amount)) sfx.sink();
}

// Restart a little CSS animation on an element.
function flash(id, cls) {
  $(id).classList.remove(cls);
  void $(id).offsetWidth;
  $(id).classList.add(cls);
}

function banner(text, small = '') {
  $('banner').innerHTML = `${text}<small>${small}</small>`;
  $('banner').classList.add('on');
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => $('banner').classList.remove('on'), 2400);
}

// Kraken ink: two dark blots land somewhere on the screen, then fade after a few seconds.
function splatInk() {
  [...$('ink').children].forEach((blot, i) => {
    blot.style.left = 15 + Math.random() * 70 + '%';
    blot.style.top = 15 + Math.random() * 70 + '%';
  });
  $('ink').classList.add('on');
  clearTimeout(splatInk.timer);
  splatInk.timer = setTimeout(() => $('ink').classList.remove('on'), 3500);
}

function setGold(value) {
  gold = value;
  $('gold').lastChild.textContent = gold;
}

// ---------- home: the title screen, the shipyard and how to play ----------

// Back home: nothing at sea, the ship sailing lazy circles behind the title.
function showHome() {
  mode = 'title';
  hidePanel();
  hideChart();
  clearSea();
  stage.setSea(VOYAGES.shallows.sea); // home waters
  world.build(1, 'battle', VOYAGES.shallows.theme);
  ship.reset(0, 0);
  showTitle(save, {
    sail: () => { sfx.click(); hideTitle(); pickVoyage(); },
    shipyard: () => { sfx.click(); hideTitle(); openShipyard(); },
    help: () => { sfx.click(); hideTitle(); showHelp(showHome); },
  });
}

// Spend the home chest on upgrades that last for every voyage.
function openShipyard() {
  mode = 'panel';
  showPanel({
    title: 'Shipyard',
    text: `Home chest: <b>${save.bank}</b> gold. Upgrades last for every voyage.`,
    tiles: Object.entries(UPGRADES).map(([id, u]) => {
      const cost = upgradeCost(id), top = save.levels[id] >= MAX_LEVEL;
      return {
        icon: `<svg viewBox="0 0 24 24">${u.icon}</svg>`, name: u.name, text: u.text, level: save.levels[id],
        price: top ? 'Fully upgraded' : `${cost} gold`, disabled: top || save.bank < cost,
        onClick: () => {
          save.bank -= cost;
          save.levels[id]++;
          store();
          sfx.buy();
          openShipyard();
        },
      };
    }),
    buttons: [{ label: 'Back', onClick: () => { sfx.click(); showHome(); } }],
  });
}

// The first voyage starts with this; it's also on the title screen.
function showHelp(then) {
  mode = 'panel';
  const svg = (path) => `<svg viewBox="0 0 24 24">${path}</svg>`;
  showPanel({
    title: 'How to play',
    text: 'Sail from stop to stop and beat the Kraken at Skull Rock.',
    tiles: [
      { icon: svg('<circle cx="12" cy="12" r="9"/><circle cx="15" cy="9" r="3"/>'), name: 'Steer',
        text: matchMedia('(pointer: coarse)').matches ? 'Touch the left side and drag' : 'WASD or the arrow keys' },
      { icon: svg('<path d="M3 11l14-5 2 6-14 4z"/><circle cx="8" cy="17" r="3"/>'), name: 'Fire',
        text: 'Fire Left and Fire Right shoot out of each side (Q and E)' },
      { icon: svg('<path d="M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4"/>'), name: 'Turn side-on',
        text: 'Line an enemy up beside you, then fire' },
      { icon: svg('<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M4 10a8 5 0 0 1 16 0M12 13v3"/>'), name: 'Grab the gold',
        text: 'Spend it in port, or bring it home for the shipyard' },
    ],
    buttons: [{ label: 'Got it', onClick: () => { sfx.click(); save.seenHelp = true; store(); then(); } }],
  });
}

function clearSea() {
  enemies.clear();
  loot.clear();
  fx.clear();
  $('ink').classList.remove('on');
  weather.stop();
  setMusic('calm');
}

// ---------- the voyage ----------

// Choose which sea to sail. Later voyages open up as you beat each boss.
function pickVoyage() {
  mode = 'panel';
  showPanel({
    title: 'Choose a voyage',
    tiles: Object.entries(VOYAGES).map(([id, v]) => {
      const open = !v.locked || v.unlock?.(save);
      return {
        icon: icon(open ? (v.boss ?? 'storm') : 'lock'), name: v.name, text: open ? v.text : v.locked, disabled: !open,
        onClick: () => { sfx.click(); newVoyage(id); },
      };
    }),
    buttons: [{ label: 'Back', quiet: true, onClick: () => { sfx.click(); showHome(); } }],
  });
}

// A fresh voyage: new route, full hull (with shipyard upgrades), no gear, the purse's starting gold.
function newVoyage(id) {
  voyage = VOYAGES[id];
  stage.setSea(voyage.sea);
  route = createRoute();
  path = [];
  gear.clear();
  showGear(gear);
  ship.resetGear();
  Object.assign(ship.stats, upgradedStats(PLAYER_STATS));
  loot.setMagnet(4);
  ship.reset(0, 0);
  setGold(startGold());
  if (save.seenHelp) openChart();
  else showHelp(openChart);
}

function openChart() {
  mode = 'chart';
  hidePanel();
  clearSea(); // nothing left sailing about behind the chart
  showChart(route, path, { bank: save.bank, voyage }, (s, i) => {
    sfx.click();
    path.push(i);
    hideChart();
    const type = route[s][i];
    if (type === 'port') openPort(s);
    else startStop(type, s);
  });
}

// Sail into a stop at sea: a battle, a treasure cove or Skull Rock. The hull keeps its damage.
function startStop(type, step) {
  stop = { type, step };
  mode = 'sea';
  enemies.clear();
  loot.clear();
  fx.clear();
  world.build(Math.floor(Math.random() * 1e6), type === 'treasure' ? 'cove' : type === 'final' ? 'boss' : 'battle', voyage.theme);
  const hp = p.hp;
  const edge = voyage.boss === 'flagship' ? 14 : 10; // the flagship sails a wide circle: start outside it
  if (type === 'final') ship.reset(edge, edge, -Math.PI * 0.75); // near the edge, the boss in front
  else ship.reset(0, 0);
  p.hp = hp;
  focus.set(p.x, 0, p.z);
  stopGold = 0;
  setMusic(type === 'final' ? 'boss' : 'calm');
  weather.start(!!voyage.storm, type === 'battle' && Math.random() < 0.6); // a waterspout in some storm battles
  if (type === 'treasure') {
    const spots = world.openSpots(4 + Math.floor(Math.random() * 3));
    spots.forEach((s) => loot.chest(s.x, s.z, 4 + Math.floor(step / 2))); // 20 to 35 gold a chest
    battle.start([], { chests: spots.length, ambush: ambushWave(step, voyage) });
  } else {
    battle.start(type === 'final' ? voyage.boss : battleWaves(step, voyage));
  }
}

// The stop is over: on to a gear pick, the chart, or the end of the voyage.
function endStop(won) {
  mode = 'panel';
  $('banner').classList.remove('on');
  const home = [{ label: 'Home port', onClick: () => { sfx.click(); showHome(); } }];
  if (!won || stop.type === 'final') { // the voyage is over: bank the gold and save
    const kept = won ? gold : Math.floor(gold / 2);
    save.bank += kept;
    save.voyages++;
    const opens = won && Object.values(VOYAGES).find((v) => v.unlock && !v.unlock(save)); // locked before this win
    if (won) save[BEATEN[voyage.boss]]++;
    const opened = opens && opens.unlock(save) ? `<br>The <b>${opens.name}</b> is now open!` : '';
    store();
    showPanel(won
      ? { title: 'Voyage complete!', text: `You beat ${BOSS_NAME[voyage.boss]} and bring home <b>${kept}</b> gold.${opened}`, buttons: home }
      : { title: 'Sunk!', tone: 'lost', text: `Your voyage ends at stop ${path.length} of ${STOPS}.<br>You bring home half your gold: <b>${kept}</b>.`, buttons: home });
  } else if (stop.type === 'battle' && gearChoices(gear, 3).length) {
    showPanel({
      title: 'Victory!',
      text: `You won <b>${stopGold}</b> gold. Pick one piece of gear:`,
      tiles: gearChoices(gear, 3).map((id) => gearTile(id, { onClick: () => { takeGear(id); openChart(); } })),
    });
  } else {
    showPanel({
      title: stop.type === 'treasure' ? 'Cove cleared!' : 'Victory!',
      text: `You found <b>${stopGold}</b> gold.`,
      buttons: [{ label: 'Back to the chart', onClick: () => { sfx.click(); openChart(); } }],
    });
  }
}

function takeGear(id) {
  gear.add(id);
  GEAR[id].apply?.({ ship, loot });
  showGear(gear);
  sfx.buy();
}

// The port: repair the hull and buy gear with the gold you carry.
function openPort(step) {
  mode = 'panel';
  const forSale = gearChoices(gear, 2), price = PORT.gearCost + step * PORT.gearCostPerStop;
  const draw = () => {
    const missing = Math.ceil(p.maxHp - p.hp), full = Math.ceil(missing * PORT.fullCostPerHp);
    const buy = (cost, then) => () => { setGold(gold - cost); then(); draw(); };
    showPanel({
      title: 'Port',
      text: `Hull <b>${Math.ceil(p.hp)} / ${p.maxHp}</b> · Gold <b>${gold}</b>`,
      tiles: [
        { icon: REPAIR_ICON, name: 'Patch the hull', text: `+${PORT.patch} hull`, price: `${PORT.patchCost} gold`,
          disabled: !missing || gold < PORT.patchCost, onClick: buy(PORT.patchCost, () => repair(PORT.patch)) },
        { icon: REPAIR_ICON, name: 'Full repair', text: `+${missing} hull`, price: `${full} gold`,
          disabled: !missing || gold < full, onClick: buy(full, () => repair(missing)) },
        ...forSale.map((id) => gearTile(id, { price, disabled: gold < price || gear.has(id),
          onClick: buy(price, () => takeGear(id)) })),
      ],
      buttons: [{ label: 'Set sail', onClick: () => { sfx.click(); openChart(); } }],
    });
  };
  draw();
}
const REPAIR_ICON = '<svg viewBox="0 0 24 24"><path d="M14 4a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9"/><path d="M4 20l3-3"/></svg>';

function repair(amount) {
  p.hp = Math.min(p.maxHp, p.hp + amount);
  flash('hull', 'heal');
  sfx.repair();
}

// ---------- sound buttons ----------

// Sound starts on the first tap; music and sound buttons in the top-right corner.
unlockAudio();
const icons = {
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
};
for (const name of ['music', 'sound']) {
  const btn = document.createElement('button');
  btn.className = 'round';
  btn.title = name === 'music' ? 'Music on/off' : 'Sound effects on/off';
  btn.innerHTML = icons[name];
  btn.classList.toggle('off', !audioSetting(name));
  btn.onclick = () => {
    btn.classList.toggle('off', !toggleAudio(name));
    sfx.click();
  };
  $('audio').append(btn);
}

// ---------- every frame ----------

const focus = new THREE.Vector3(); // what the camera looks at
let time = 0, shake = 0;

function frame(dt) {
  time += dt;
  readInput();
  const mag = mode === 'sea' ? Math.hypot(input.x, input.y) : 0;
  // Thumbstick on the screen -> heading in the world (the camera looks along (1,1,1)).
  const want = mag > 0.12 ? Math.atan2(-input.x - input.y, input.x - input.y) : null;
  if (mode === 'title') ship.update(dt, time, p.heading + dt * 0.25, 0.4); // lazy wide circles behind the title
  else {
    // Jellyfish stings and sandbars slow the ship down.
    p.slow = Math.max(0, (p.slow ?? 0) - dt);
    const drag = (p.slow > 0 ? 0.5 : 1) * (world.sandAt(p.x, p.z) ? 0.45 : 1);
    ship.update(dt, time, want, Math.min(1, mag * 1.3) * drag);
  }
  world.update(time);
  const hit = world.collide(p);
  if (hit > 1) { // bump: splash, knock and a little camera shake
    fx.splash(p.hitX, p.hitZ, 0.8);
    sfx.bump();
    shake = Math.min(0.4, hit * 0.06);
  }
  enemies.update(dt, time, p, stage.camera);
  if (mode === 'sea') weather.update(dt, time, [p, ...enemies.list.map((e) => e.body.state)], stage.camera);
  battle.update(dt, p);
  const got = loot.update(dt, time, p, stage.camera, battle.won());
  if (got.repair) repair(got.repair);
  if (got.gold) {
    setGold(gold + got.gold);
    stopGold += got.gold;
    flash('gold', 'pop');
  }
  if (p.sinking >= 0 && p.sinking < 4 && Math.random() < dt * 8) fx.bubble(p.x, p.z);
  foam(p.x, p.z, time);
  fx.update(dt);
  seaSpeed(Math.min(1, p.speed / 7));

  $('hull').firstChild.style.width = (100 * p.hp) / p.maxHp + '%';
  $('hull').classList.toggle('low', p.hp <= 30);
  for (const side of ['left', 'right']) {
    const ready = ship.ready(side);
    fireButtons[side].style.setProperty('--ready', ready.toFixed(2));
    if (ready >= 1 && !wasReady[side]) sfx.reloaded();
    wasReady[side] = ready >= 1;
  }

  // Camera: ship in the middle, leaning a little the way it is going.
  const k = 1 - Math.exp(-dt * 3);
  focus.x += (p.x + p.vx * 0.35 - focus.x) * k;
  focus.z += (p.z + p.vz * 0.35 - focus.z) * k;
  shake *= Math.exp(-dt * 8);
  stage.look(focus.clone().add(new THREE.Vector3((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake)));
  stage.render();
}

world.build(1);
showHome();
let last = performance.now();
// On the dev server only: report errors and a heartbeat to the laptop while testing on a phone.
const devlog = import.meta.env.DEV ? startDevLog(stage.renderer.domElement, () =>
  `mode=${mode} hp=${Math.round(p.hp)} enemies=${enemies.list.map((e) => `${e.kind}:${e.mode}`).join(',') || '-'}`) : null;
stage.renderer.setAnimationLoop((now) => {
  const started = performance.now();
  try {
    frame(Math.min(0.05, (now - last) / 1000));
  } catch (err) {
    console.error(err); // one bad frame must never freeze the game: the next frame carries on
    devlog?.error(err);
  }
  devlog?.frame(performance.now() - started);
  last = now;
});

// Lets the browser console inspect the game while developing.
if (import.meta.env.DEV) {
  window.game = { stage, ship, world, enemies, battle, loot, fx, gear, save, frame, takeGear, startStop, openPort, newVoyage, showHome, openShipyard,
    get route() { return route; }, get path() { return path; }, get mode() { return mode; } };
}
