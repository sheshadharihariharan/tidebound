import '@fontsource/lilita-one';
import './style.css';
import * as THREE from 'three';
import { createStage } from './stage.js';
import { input, readInput } from './input.js';
import { createShip } from './ship.js';
import { createWorld, createFoam } from './world.js';
import { createEffects } from './effects.js';
import { unlockAudio, audioSetting, toggleAudio, sfx, seaSpeed } from './audio.js';

const stage = createStage(document.getElementById('game'));
const world = createWorld(stage.scene);
const foam = createFoam(stage.scene);
const ship = createShip(stage.scene);
const fx = createEffects(stage.scene, world.solidAt);
const fireButtons = { left: document.getElementById('fireL'), right: document.getElementById('fireR') };
const wasReady = { left: true, right: true };

input.onFire = (side) => {
  const shots = ship.fire(side);
  if (!shots) return;
  shots.forEach((c) => fx.shoot(c.x, c.z, c.dx, c.dz));
  sfx.cannon(shots.length);
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
  document.getElementById('audio').append(btn);
}

const focus = new THREE.Vector3(); // what the camera looks at
let time = 0, shake = 0;

function frame(dt) {
  time += dt;
  const s = ship.state;
  readInput();
  ship.update(dt, time, input);
  world.update(s.x, s.z, time);
  const hit = world.collide(s);
  if (hit > 1) { // bump: splash, knock and a little camera shake
    fx.splash(s.hitX, s.hitZ, 0.8);
    sfx.bump();
    shake = Math.min(0.4, hit * 0.06);
  }
  foam(s.x, s.z, time);
  fx.update(dt);
  seaSpeed(Math.min(1, s.speed / 7));
  for (const side of ['left', 'right']) {
    const ready = ship.ready(side);
    fireButtons[side].style.setProperty('--ready', ready.toFixed(2));
    if (ready >= 1 && !wasReady[side]) sfx.reloaded();
    wasReady[side] = ready >= 1;
  }

  // Camera: ship in the middle, leaning a little the way it is going.
  const k = 1 - Math.exp(-dt * 3);
  focus.x += (s.x + s.vx * 0.35 - focus.x) * k;
  focus.z += (s.z + s.vz * 0.35 - focus.z) * k;
  shake *= Math.exp(-dt * 8);
  stage.look(focus.clone().add(new THREE.Vector3((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake)));
  stage.render();
}

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  frame(Math.min(0.05, (now - last) / 1000));
  last = now;
});

// Lets the browser console inspect the game while developing.
if (import.meta.env.DEV) window.game = { stage, ship, world, frame };
