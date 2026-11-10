import '@fontsource/lilita-one';
import './style.css';
import * as THREE from 'three';
import { createStage } from './stage.js';
import { input, readInput } from './input.js';
import { createShip } from './ship.js';
import { createWorld, createFoam } from './world.js';
import { createEffects } from './effects.js';

const stage = createStage(document.getElementById('game'));
const world = createWorld(stage.scene);
const foam = createFoam(stage.scene);
const ship = createShip(stage.scene);
const fx = createEffects(stage.scene);
const fireButtons = { left: document.getElementById('fireL'), right: document.getElementById('fireR') };

input.onFire = (side) => ship.fire(side)?.forEach((c) => fx.shoot(c.x, c.z, c.dx, c.dz));

const focus = new THREE.Vector3(); // what the camera looks at
let time = 0, shake = 0;

function frame(dt) {
  time += dt;
  const s = ship.state;
  readInput();
  ship.update(dt, time, input);
  world.update(s.x, s.z, time);
  const hit = world.collide(s);
  if (hit > 1) { // bump: splash and a little camera shake
    fx.splash(s.hitX, s.hitZ, 0.8);
    shake = Math.min(0.4, hit * 0.06);
  }
  foam(s.x, s.z, time);
  fx.update(dt);
  for (const side of ['left', 'right']) fireButtons[side].style.setProperty('--ready', ship.ready(side).toFixed(2));

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
if (import.meta.env.DEV) window.game = { ship, world, frame };
