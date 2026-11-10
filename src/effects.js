// Short-lived things: cannonballs, smoke puffs, splashes, and debris when a shot hits land.
import * as THREE from 'three';
import { toon, flat } from './stage.js';
import { sfx } from './audio.js';

const BALL = new THREE.SphereGeometry(0.22, 8, 6);
const BALL_MAT = toon(0x20262b);
const BLOB = new THREE.SphereGeometry(1, 8, 6);
const RING = new THREE.RingGeometry(0.62, 1, 20).rotateX(-Math.PI / 2);
const CHUNK = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const LAND = {
  rock: { chunk: toon(0x7b8089), dust: 0xdfe3e6 },
  island: { chunk: toon(0xc99a5b), dust: 0xf2d49b },
};
const SPLINTER = toon(0x8a5a33);
const SPEED = 18, RANGE = 13;

// solidAt(x, y, z) -> 'rock' | 'island' | null: what a shot at that spot would hit.
export function createEffects(scene, solidAt) {
  const live = new Set();
  // update(u) gets 0..1 through its life; returning true ends it early.
  function add(obj, life, update, mat) {
    scene.add(obj);
    live.add({ obj, life, age: 0, update, mat });
  }

  function puff(x, y, z, size = 1, color = 0xffffff) {
    const mat = flat(0.9, color);
    const m = new THREE.Mesh(BLOB, mat);
    add(m, 0.5 + size * 0.1, (u) => {
      m.position.set(x, y + u * 0.6 * size, z);
      m.scale.setScalar((0.25 + u * 0.7) * size);
      mat.opacity = 0.9 * (1 - u);
    }, mat);
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

  // Shot hits a rock or an island: dust cloud and chunks thrown out.
  function impact(x, y, z, kind) {
    const look = LAND[kind];
    puff(x, y, z, 1.6, look.dust);
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, out = 1 + Math.random() * 1.5, up = 3 + Math.random() * 3;
      const c = new THREE.Mesh(CHUNK, look.chunk);
      c.scale.setScalar(0.6 + Math.random() * 0.8);
      add(c, 0.7, (u) => {
        const t = u * 0.7;
        c.position.set(x + Math.cos(a) * out * t * 2, Math.max(0, y + up * t - 9 * t * t), z + Math.sin(a) * out * t * 2);
        c.rotation.set(t * 9, t * 7, 0);
        c.visible = u < 0.95;
      });
    }
    sfx.thud();
  }

  // Cannonball hits a ship: orange flash and wood splinters.
  function shipHit(x, y, z) {
    puff(x, y, z, 1.1, 0xffb347);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, out = 1 + Math.random(), up = 2 + Math.random() * 3;
      const c = new THREE.Mesh(CHUNK, SPLINTER);
      c.scale.set(1.4, 0.4, 0.4);
      add(c, 0.6, (u) => {
        const t = u * 0.6;
        c.position.set(x + Math.cos(a) * out * t * 2, Math.max(0, y + up * t - 9 * t * t), z + Math.sin(a) * out * t * 2);
        c.rotation.set(t * 10, t * 6, 0);
      });
    }
  }

  // One bubble rising where a ship is going down.
  function bubble(x, z) {
    const mat = flat(0.9);
    const b = new THREE.Mesh(BLOB, mat);
    const bx = x + (Math.random() - 0.5) * 2, bz = z + (Math.random() - 0.5) * 2, size = 0.1 + Math.random() * 0.15;
    add(b, 0.8, (u) => {
      b.position.set(bx, u * 0.6, bz);
      b.scale.setScalar(size * (1 + u));
      mat.opacity = 0.9 * (1 - u);
    }, mat);
  }

  // One cannonball from (x, z) heading along the unit vector (dx, dz).
  // hitShip(x, y, z) -> true when it struck a ship (that code deals the damage).
  function shoot(x, z, dx, dz, hitShip) {
    const m = new THREE.Mesh(BALL, BALL_MAT);
    puff(x + dx * 0.3, 0.8, z + dz * 0.3);
    add(m, RANGE / SPEED, (u) => {
      const d = u * RANGE;
      const px = x + dx * d, py = 0.9 * (1 - u) + 5 * u * (1 - u), pz = z + dz * d;
      m.position.set(px, py, pz);
      if (hitShip(px, py, pz)) return true;
      const kind = solidAt(px, py, pz);
      if (kind) { impact(px, Math.max(py, 0.4), pz, kind); return true; }
      if (u >= 1) { splash(px, pz); sfx.splash(); }
    });
  }

  function update(dt) {
    for (const e of live) {
      e.age += dt;
      const u = Math.min(1, e.age / e.life);
      if (e.update(u) === true || u >= 1) {
        scene.remove(e.obj);
        e.mat?.dispose();
        live.delete(e);
      }
    }
  }
  return { shoot, splash, shipHit, bubble, update };
}
