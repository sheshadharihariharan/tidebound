import '@fontsource/lilita-one';
import './style.css';
import * as THREE from 'three';
import { createStage } from './stage.js';
import { input, readInput } from './input.js';
import { createShip } from './ship.js';
import { createWorld, createFoam } from './world.js';
import { createEffects } from './effects.js';
import { createEnemies } from './enemies.js';
import { createLoot } from './loot.js';
import { createBattle } from './battle.js';
import { unlockAudio, audioSetting, toggleAudio, sfx, seaSpeed } from './audio.js';

const PLAYER_SHOT = 5; // damage per cannonball: a pirate (30) takes about 3 good broadsides
const PIRATE_SHOT = 6; // we (100) can take about 8

const stage = createStage(document.getElementById('game'));
const world = createWorld(stage.scene);
const foam = createFoam(stage.scene);
const fx = createEffects(stage.scene, world.solidAt);
const loot = createLoot(stage.scene);
const ship = createShip(stage.scene, undefined, undefined, true);
const p = ship.state;
const enemies = createEnemies(stage.scene, world, fx, loot, {
  shoot(shots, dist) {
    shots.forEach((c) => fx.shoot(c.x, c.z, c.dx, c.dz, hitPlayer));
    sfx.cannon(shots.length, Math.max(0.3, 0.9 - dist / 25));
  },
  hurtPlayer,
});
const battle = createBattle(enemies, { banner, end });

const $ = (id) => document.getElementById(id);
const fireButtons = { left: $('fireL'), right: $('fireR') };
const wasReady = { left: true, right: true };
let gold = 0, battleGold = 0;

input.onFire = (side) => {
  const shots = ship.fire(side);
  if (!shots) return;
  shots.forEach((c) => fx.shoot(c.x, c.z, c.dx, c.dz, (x, y, z) => enemies.hitAt(x, y, z, PLAYER_SHOT)));
  sfx.cannon(shots.length);
};

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
  $('hull').classList.remove('hit');
  void $('hull').offsetWidth; // restart the shake animation
  $('hull').classList.add('hit');
  if (ship.hurt(amount)) sfx.sink();
}

function banner(text, small = '') {
  $('banner').innerHTML = `${text}<small>${small}</small>`;
  $('banner').classList.add('on');
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => $('banner').classList.remove('on'), 2400);
}

// The battle is over: show the result and a button to start the next one.
function end(won) {
  $('banner').classList.remove('on');
  $('panel').classList.toggle('lost', !won);
  $('panel').querySelector('h1').textContent = won ? 'Victory!' : 'Sunk!';
  $('panel').querySelector('p').innerHTML = won
    ? `All three waves sunk.<br>You won <b>${battleGold}</b> gold.`
    : `The sea won this time.<br>You found <b>${battleGold}</b> gold.`;
  $('again').textContent = won ? 'Sail again' : 'Try again';
  $('panel').classList.add('on');
  setTimeout(() => $('again').focus(), 50); // Enter or Space works on a keyboard
}

// A fresh arena, the ship in the middle and fully repaired, wave 1 on its way.
function newBattle() {
  $('panel').classList.remove('on');
  enemies.clear();
  loot.clear();
  fx.clear();
  world.build(Math.floor(Math.random() * 1e6));
  ship.reset(0, 0);
  focus.set(0, 0, 0);
  battleGold = 0;
  battle.start();
}
$('again').onclick = () => {
  sfx.click();
  newBattle();
};

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

const focus = new THREE.Vector3(); // what the camera looks at
let time = 0, shake = 0;

function frame(dt) {
  time += dt;
  readInput();
  const mag = Math.hypot(input.x, input.y);
  // Thumbstick on the screen -> heading in the world (the camera looks along (1,1,1)).
  const want = mag > 0.12 ? Math.atan2(-input.x - input.y, input.x - input.y) : null;
  ship.update(dt, time, want, Math.min(1, mag * 1.3));
  world.update(time);
  const hit = world.collide(p);
  if (hit > 1) { // bump: splash, knock and a little camera shake
    fx.splash(p.hitX, p.hitZ, 0.8);
    sfx.bump();
    shake = Math.min(0.4, hit * 0.06);
  }
  enemies.update(dt, time, p, stage.camera);
  battle.update(dt, p);
  const got = loot.update(dt, time, p, battle.won());
  if (got.repair) {
    p.hp = Math.min(p.maxHp, p.hp + got.repair);
    $('hull').classList.remove('heal');
    void $('hull').offsetWidth; // restart the glow
    $('hull').classList.add('heal');
  }
  if (got.gold) {
    gold += got.gold;
    battleGold += got.gold;
    $('gold').lastChild.textContent = gold;
    $('gold').classList.remove('pop');
    void $('gold').offsetWidth;
    $('gold').classList.add('pop');
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

newBattle();
let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  frame(Math.min(0.05, (now - last) / 1000));
  last = now;
});

// Lets the browser console inspect the game while developing.
if (import.meta.env.DEV) window.game = { stage, ship, world, enemies, battle, loot, fx, frame, newBattle };
