// Things that float where an enemy sank: gold coins, and sometimes a repair crate.
// Sail close and they fly to you.
import * as THREE from 'three';
import { toon } from './stage.js';
import { sfx } from './audio.js';

const COIN = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14).rotateX(Math.PI / 2);
const COIN_MAT = toon(0xffc93c);
const BOX = new THREE.BoxGeometry(0.8, 0.6, 0.8);
const BAR = new THREE.BoxGeometry(0.56, 0.05, 0.16);
const BOX_MAT = toon(0xb07a45), PLUS_MAT = toon(0x5bd16a);
const VALUE = 5, LIFE = 30, MAGNET = 4;
export const REPAIR = 25; // hull points a crate gives back

// A wooden crate with a green plus on the lid.
function crateModel() {
  const g = new THREE.Group();
  const lid = new THREE.Mesh(BAR, PLUS_MAT), cross = new THREE.Mesh(BAR, PLUS_MAT);
  lid.position.y = cross.position.y = 0.31;
  cross.rotation.y = Math.PI / 2;
  g.add(new THREE.Mesh(BOX, BOX_MAT), lid, cross);
  return g;
}

export function createLoot(scene) {
  const items = new Set();

  function add(m, x, z, delay, crate) {
    scene.add(m);
    items.add({ m, x, z, age: -delay, phase: Math.random() * 6, crate });
  }

  function drop(x, z, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random(), d = 0.6 + Math.random() * 1.6;
      add(new THREE.Mesh(COIN, COIN_MAT), x + Math.cos(a) * d, z + Math.sin(a) * d, i * 0.08, false);
    }
  }

  const crate = (x, z) => add(crateModel(), x, z, 0.3, true);

  // Returns what was picked up this frame: { gold, repair }.
  // all: everything flies to the ship (the battle is won).
  function update(dt, t, p, all = false) {
    const got = { gold: 0, repair: 0 };
    for (const c of items) {
      c.age += dt;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (p.sinking < 0 && (d < MAGNET || all) && c.age > 0.6 && d > 0) {
        const pull = Math.min(d, dt * (all ? 10 + d * 2 : 6 + (MAGNET - d) * 4));
        c.x += (dx / d) * pull;
        c.z += (dz / d) * pull;
      }
      if (p.sinking < 0 && d < 1.3 && c.age > 0.6) {
        if (c.crate) {
          got.repair += REPAIR;
          sfx.repair();
        } else {
          got.gold += VALUE;
          sfx.coin();
        }
      } else if (c.age < LIFE) {
        const pop = Math.min(1, Math.max(0, c.age) * 3); // pops up out of the water
        c.m.position.set(c.x, (c.crate ? 0.2 : 0.35) + Math.sin(t * 3 + c.phase) * 0.08 + (1 - pop) * -0.5, c.z);
        c.m.rotation.y = c.crate ? Math.sin(t + c.phase) * 0.4 : t * 2.5 + c.phase;
        c.m.visible = c.age > 0 && (c.age < LIFE - 5 || Math.sin(t * 20) > 0); // blinks before it's gone
        continue;
      }
      scene.remove(c.m);
      items.delete(c);
    }
    return got;
  }

  function clear() {
    items.forEach((c) => scene.remove(c.m));
    items.clear();
  }

  return { drop, crate, update, clear };
}
