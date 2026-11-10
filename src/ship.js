// A ship (the player's or a pirate's): model, steering with a little drift, wake, cannons, damage and sinking.
import * as THREE from 'three';
import { toon, flat } from './stage.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const HULL = (() => {
  const s = new THREE.Shape(); // seen from above: x is forward
  s.moveTo(1.9, 0);
  s.quadraticCurveTo(1.2, 0.62, 0.3, 0.66);
  s.lineTo(-1.2, 0.62);
  s.quadraticCurveTo(-1.65, 0.55, -1.65, 0.3);
  s.lineTo(-1.65, -0.3);
  s.quadraticCurveTo(-1.65, -0.55, -1.2, -0.62);
  s.lineTo(0.3, -0.66);
  s.quadraticCurveTo(1.2, -0.62, 1.9, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); // stand it up
  g.translate(0, -0.2, 0); // half under the water
  return g;
})();
const MAST = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6);
const SAIL = new THREE.BoxGeometry(1.5, 1.6, 0.06); // fore-and-aft, seen from the side
const STRIPE = new THREE.BoxGeometry(1.52, 0.3, 0.08);
const FLAG = new THREE.BoxGeometry(0.55, 0.26, 0.02);
const CANNON = new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8);
const WAKE = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const mats = new Map();
const mat = (c) => mats.get(c) ?? mats.set(c, toon(c)).get(c); // ships of one colour share materials

const PLAYER_LOOK = { hull: 0xb5532c, deck: 0xd9a45b, sail: 0xfff4dc, stripe: 0xd8452e, flag: 0xd8452e };
const PLAYER_STATS = { maxSpeed: 7, turn: 2.2, reload: 1.2, hp: 100 };

// look: colours. stats: maxSpeed, turn (radians a second), reload (seconds), hp. arcs: show aim arcs.
export function createShip(scene, look = PLAYER_LOOK, stats = PLAYER_STATS, arcs = false) {
  const root = new THREE.Group(); // position and heading
  const body = new THREE.Group(); // bobs, leans and sinks
  root.add(body);
  scene.add(root);

  const deck = new THREE.Mesh(HULL, mat(look.deck));
  deck.scale.set(0.86, 0.2, 0.8);
  deck.position.y = 0.26;
  const mast = new THREE.Mesh(MAST, mat(0x6b4a2b));
  mast.position.set(0.2, 1.3, 0);
  const sail = new THREE.Mesh(SAIL, mat(look.sail));
  sail.position.set(-0.45, 1.55, 0);
  const stripe = new THREE.Mesh(STRIPE, mat(look.stripe));
  stripe.position.copy(sail.position);
  const flag = new THREE.Mesh(FLAG, mat(look.flag));
  flag.position.set(-0.05, 2.7, 0);
  body.add(new THREE.Mesh(HULL, mat(look.hull)), deck, mast, sail, stripe, flag);

  const muzzles = [0.5, -0.4]; // cannon spots along the hull, on both sides
  for (const z of [-0.62, 0.62]) {
    for (const x of muzzles) {
      const c = new THREE.Mesh(CANNON, mat(0x2a2e33));
      c.rotation.x = Math.PI / 2; // points sideways
      c.position.set(x, 0.5, z);
      body.add(c);
    }
  }

  // Faint arcs on the water show where each side's cannons will hit.
  const arcMeshes = {};
  if (arcs) {
    for (const [side, angle] of [['left', Math.PI / 2], ['right', -Math.PI / 2]]) {
      const g = new THREE.CircleGeometry(13, 20, angle - 0.45, 0.9).rotateX(-Math.PI / 2);
      arcMeshes[side] = new THREE.Mesh(g, flat(0.2));
      arcMeshes[side].position.y = 0.06;
      root.add(arcMeshes[side]);
    }
  }
  const shadow = new THREE.Mesh(DISC, flat(0.22, 0x0a3a44));
  shadow.scale.set(2.2, 1, 1.0);
  shadow.position.y = 0.04;
  root.add(shadow);

  // Wake: foam discs left behind the stern that grow and fade.
  const wakeGroup = new THREE.Group();
  scene.add(wakeGroup);
  const wake = Array.from({ length: 24 }, () => {
    const m = new THREE.Mesh(WAKE, flat(0));
    m.visible = false;
    wakeGroup.add(m);
    return { m, age: 9 };
  });
  let wakeNext = 0, wakeTimer = 0;

  // sinking: -1 while afloat, then seconds since it started going down.
  const s = { x: 0, z: 0, vx: 0, vz: 0, heading: -Math.PI / 4, lean: 0, speed: 0, hp: stats.hp, maxHp: stats.hp, sinking: -1, cool: { left: 0, right: 0 } };

  // want: heading to turn toward (or null to coast). throttle: 0..1.
  function update(dt, t, want = null, throttle = 0) {
    let turn = 0;
    if (s.sinking >= 0) {
      s.sinking += dt;
      throttle = 0;
    } else if (want !== null) {
      const diff = wrap(want - s.heading);
      turn = clamp(diff, -stats.turn * dt, stats.turn * dt);
      s.heading += turn;
      throttle *= 0.4 + 0.6 * Math.max(0, Math.cos(diff));
    } else {
      throttle = 0;
    }
    const k = 1 - Math.exp(-dt * 1.4); // slow catch-up: the ship drifts a little
    s.vx += (Math.cos(s.heading) * throttle * stats.maxSpeed - s.vx) * k;
    s.vz += (Math.sin(s.heading) * throttle * stats.maxSpeed - s.vz) * k;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.speed = Math.hypot(s.vx, s.vz);
    for (const side of ['left', 'right']) s.cool[side] = Math.max(0, s.cool[side] - dt);

    s.lean += (clamp((-turn / dt) * 0.12, -0.3, 0.3) - s.lean) * Math.min(1, dt * 6);
    root.position.set(s.x, 0, s.z);
    root.rotation.y = -s.heading;
    const sink = Math.max(0, s.sinking);
    body.rotation.x = s.lean + Math.sin(t * 1.7) * 0.02 + Math.min(0.5, sink * 0.25);
    body.rotation.z = Math.sin(t * 2.1) * 0.025 - s.speed * 0.006 + Math.min(0.4, sink * 0.2);
    body.position.y = Math.sin(t * 2.3) * 0.05 - sink * sink * 0.35;
    shadow.visible = s.sinking < 0;
    flag.rotation.z = Math.sin(t * 6) * 0.2;
    for (const side in arcMeshes) {
      arcMeshes[side].visible = s.sinking < 0;
      arcMeshes[side].material.opacity = s.cool[side] > 0 ? 0.06 : 0.2;
    }

    wakeTimer -= dt;
    if (s.speed > 1.2 && wakeTimer <= 0 && s.sinking < 0) {
      wakeTimer = 0.08;
      const w = wake[wakeNext++ % wake.length];
      w.age = 0;
      w.m.position.set(s.x - Math.cos(s.heading) * 1.5, 0.05, s.z - Math.sin(s.heading) * 1.5);
    }
    for (const w of wake) {
      w.age += dt;
      const u = w.age / 1.4;
      w.m.visible = u < 1;
      w.m.scale.setScalar(0.5 + u * 1.3);
      w.m.material.opacity = 0.55 * (1 - u);
    }
  }

  // Fire one side. Returns [{ x, z, dx, dz }] for each cannon, or null while reloading or sinking.
  function fire(side) {
    if (s.cool[side] > 0 || s.sinking >= 0) return null;
    s.cool[side] = stats.reload;
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading);
    const dx = side === 'left' ? fz : -fz, dz = side === 'left' ? -fx : fx;
    return muzzles.map((m) => ({ x: s.x + fx * m + dx * 0.7, z: s.z + fz * m + dz * 0.7, dx, dz }));
  }

  // Is a cannonball at (x, y, z) touching this ship? The hull is treated as a short capsule.
  function touches(x, y, z) {
    if (s.sinking >= 0 || y > 2) return false;
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading);
    const along = clamp((x - s.x) * fx + (z - s.z) * fz, -1.5, 1.7);
    return Math.hypot(x - s.x - fx * along, z - s.z - fz * along) < 0.85;
  }

  // Take damage. Returns true if this hit sinks the ship.
  function hurt(amount) {
    if (s.sinking >= 0) return false;
    s.hp = Math.max(0, s.hp - amount);
    if (s.hp > 0) return false;
    s.sinking = 0;
    return true;
  }

  function reset(x, z, heading = -Math.PI / 4) {
    Object.assign(s, { x, z, vx: 0, vz: 0, heading, lean: 0, hp: stats.hp, sinking: -1 });
    s.cool.left = s.cool.right = 0;
  }

  function remove() {
    scene.remove(root, wakeGroup);
    wake.forEach((w) => w.m.material.dispose());
  }

  const ready = (side) => 1 - s.cool[side] / stats.reload;
  return { state: s, root, update, fire, ready, touches, hurt, reset, remove };
}
