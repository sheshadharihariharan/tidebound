// Short-lived things: cannonballs, smoke puffs, splashes.
import * as THREE from 'three';
import { toon, flat } from './stage.js';

const BALL = new THREE.SphereGeometry(0.22, 8, 6);
const BALL_MAT = toon(0x20262b);
const BLOB = new THREE.SphereGeometry(1, 8, 6);
const RING = new THREE.RingGeometry(0.62, 1, 20).rotateX(-Math.PI / 2);
const SPEED = 18, RANGE = 13;

export function createEffects(scene) {
  const live = new Set();
  // update(t) gets seconds since it began and returns false when finished.
  function add(obj, life, update, mat) {
    scene.add(obj);
    live.add({ obj, life, age: 0, update, mat });
  }

  function puff(x, y, z) {
    const mat = flat(0.9);
    const m = new THREE.Mesh(BLOB, mat);
    m.position.set(x, y, z);
    add(m, 0.5, (u) => { m.scale.setScalar(0.25 + u * 0.7); mat.opacity = 0.9 * (1 - u); m.position.y = y + u * 0.5; }, mat);
  }

  function splash(x, z, big = 1) {
    const mat = flat(0.85);
    const ring = new THREE.Mesh(RING, mat);
    ring.position.set(x, 0.07, z);
    add(ring, 0.6, (u) => { ring.scale.setScalar((0.4 + u * 2) * big); mat.opacity = 0.85 * (1 - u); }, mat);
    for (let i = 0; i < 5; i++) { // droplets
      const a = (i / 5) * Math.PI * 2, dm = flat(0.95);
      const d = new THREE.Mesh(BLOB, dm);
      d.scale.setScalar(0.1 * big);
      add(d, 0.5, (u) => {
        d.position.set(x + Math.cos(a) * u * 0.9 * big, 4 * u * (1 - u) * big, z + Math.sin(a) * u * 0.9 * big);
        dm.opacity = 1 - u;
      }, dm);
    }
  }

  // One cannonball from (x, z) heading along the unit vector (dx, dz).
  function shoot(x, z, dx, dz) {
    const m = new THREE.Mesh(BALL, BALL_MAT);
    const T = RANGE / SPEED;
    puff(x + dx * 0.3, 0.8, z + dz * 0.3);
    add(m, T, (u) => {
      const d = u * RANGE;
      m.position.set(x + dx * d, 0.9 * (1 - u) + 5 * u * (1 - u), z + dz * d);
      if (u >= 1) splash(x + dx * RANGE, z + dz * RANGE);
    });
  }

  function update(dt) {
    for (const e of live) {
      e.age += dt;
      const u = Math.min(1, e.age / e.life);
      e.update(u);
      if (u >= 1) { scene.remove(e.obj); e.mat?.dispose(); live.delete(e); }
    }
  }
  return { shoot, splash, update };
}
