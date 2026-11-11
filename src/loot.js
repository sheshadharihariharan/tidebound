// Gold coins that float where a pirate sank. Sail close and they fly to you.
import * as THREE from 'three';
import { toon } from './stage.js';
import { sfx } from './audio.js';

const COIN = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14).rotateX(Math.PI / 2);
const COIN_MAT = toon(0xffc93c);
const VALUE = 5, LIFE = 30, MAGNET = 4;

export function createLoot(scene) {
  const coins = new Set();

  function drop(x, z, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random(), d = 0.6 + Math.random() * 1.6;
      const m = new THREE.Mesh(COIN, COIN_MAT);
      scene.add(m);
      coins.add({ m, x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, age: -i * 0.08, phase: Math.random() * 6 });
    }
  }

  // Returns the gold picked up this frame. all: every coin flies to the ship (the battle is won).
  function update(dt, t, p, all = false) {
    let gold = 0;
    for (const c of coins) {
      c.age += dt;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (p.sinking < 0 && (d < MAGNET || all) && c.age > 0.6) {
        const pull = Math.min(d, dt * (all ? 10 + d * 2 : 6 + (MAGNET - d) * 4));
        c.x += (dx / d) * pull;
        c.z += (dz / d) * pull;
      }
      if (p.sinking < 0 && d < 1.2 && c.age > 0.6) {
        gold += VALUE;
        sfx.coin();
      } else if (c.age < LIFE) {
        const pop = Math.min(1, Math.max(0, c.age) * 3); // pops up out of the water
        c.m.position.set(c.x, 0.35 + Math.sin(t * 3 + c.phase) * 0.08 + (1 - pop) * -0.5, c.z);
        c.m.rotation.y = t * 2.5 + c.phase;
        c.m.visible = c.age > 0 && (c.age < LIFE - 5 || Math.sin(t * 20) > 0); // blinks before it's gone
        continue;
      }
      scene.remove(c.m);
      coins.delete(c);
    }
    return gold;
  }

  function clear() {
    coins.forEach((c) => scene.remove(c.m));
    coins.clear();
  }

  return { drop, update, clear };
}
