// Sea creatures (the mine turtle and the shark) and the floating mines the turtle leaves behind.
// Creatures steer like ships and offer the same calls (update, touches, hurt, reset, remove).
import * as THREE from 'three';
import { toon, flat } from './stage.js';
import { steer } from './ship.js';
import { sfx } from './audio.js';

const BLOB = new THREE.SphereGeometry(1, 12, 8);
const DOME = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const FIN = new THREE.ConeGeometry(0.5, 1, 4);
const SPIKE = new THREE.ConeGeometry(0.09, 0.3, 5);
const DISC = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
const mat = { shell: toon(0x5c7a35), plate: toon(0x89a84a), rim: toon(0xd8c27a), skin: toon(0x8bbf5a), eye: toon(0x1d2326),
  shark: toon(0x6d8796), belly: toon(0xeef3f2), mine: toon(0x2a2e33) };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mesh(geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

// The shared part: steering, the hit shape (a capsule from `back` to `front`, `r` wide), damage.
function createBody(scene, stats, hit) {
  const root = new THREE.Group(), body = new THREE.Group();
  const shadow = new THREE.Mesh(DISC, flat(0.22, 0x0a3a44));
  shadow.position.y = 0.04;
  shadow.scale.set(hit.front - hit.back, 1, hit.r * 2);
  root.add(body, shadow);
  scene.add(root);
  const s = { x: 0, z: 0, vx: 0, vz: 0, heading: 0, speed: 0, hp: stats.hp, maxHp: stats.hp, sinking: -1, under: false };

  return {
    state: s, root, body, shadow,
    move(dt, want, throttle) {
      if (s.sinking >= 0) s.sinking += dt;
      steer(s, stats, dt, s.sinking >= 0 ? null : want, throttle);
      root.position.set(s.x, 0, s.z);
      root.rotation.y = -s.heading;
      shadow.visible = s.sinking < 0;
    },
    // Cannonballs pass over a creature that is under the water.
    touches(x, y, z) {
      if (s.sinking >= 0 || s.under || y > hit.top) return false;
      const fx = Math.cos(s.heading), fz = Math.sin(s.heading);
      const along = clamp((x - s.x) * fx + (z - s.z) * fz, hit.back, hit.front);
      return Math.hypot(x - s.x - fx * along, z - s.z - fz * along) < hit.r;
    },
    hurt(amount) {
      if (s.sinking >= 0) return false;
      s.hp = Math.max(0, s.hp - amount);
      if (s.hp > 0) return false;
      s.sinking = 0;
      return true;
    },
    reset(x, z, heading = 0) {
      Object.assign(s, { x, z, vx: 0, vz: 0, heading, hp: stats.hp, sinking: -1, under: false });
    },
    remove() {
      scene.remove(root);
      shadow.material.dispose();
    },
  };
}

// Mine turtle: slow and tough, a mine strapped to its shell, paddling with four flippers.
export function createTurtle(scene) {
  const b = createBody(scene, { maxSpeed: 2.4, turn: 1.1, hp: 45 }, { back: -1, front: 1.2, r: 1.25, top: 2 });
  const shell = mesh(DOME, mat.shell, [0, 0.15, 0], [1.25, 0.75, 1.05]);
  const plate = mesh(DOME, mat.plate, [0, 0.35, 0], [0.8, 0.6, 0.65]);
  const rim = mesh(BLOB, mat.rim, [0, 0.15, 0], [1.3, 0.14, 1.1]);
  const head = mesh(BLOB, mat.skin, [1.45, 0.35, 0], [0.42, 0.34, 0.36]);
  const eyes = [-0.16, 0.16].map((z) => mesh(BLOB, mat.eye, [1.72, 0.48, z], [0.06, 0.07, 0.06]));
  const mine = createMineModel();
  mine.position.set(-0.2, 1.05, 0);
  mine.scale.setScalar(0.7);
  const flippers = [[0.6, 1], [0.6, -1], [-0.7, 1], [-0.7, -1]].map(([x, side]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.12, side * 0.9);
    pivot.add(mesh(BLOB, mat.skin, [0.1, 0, side * 0.35], [0.4, 0.08, 0.3]));
    pivot.userData = { side, front: x > 0 };
    return pivot;
  });
  b.body.add(shell, plate, rim, head, ...eyes, mine, ...flippers);

  return {
    ...b,
    update(dt, t, want, throttle) {
      b.move(dt, want, throttle);
      const s = b.state, sink = Math.max(0, s.sinking);
      for (const f of flippers) f.rotation.y = Math.sin(t * 4 + (f.userData.front ? 0 : 1.6)) * 0.5 * f.userData.side;
      head.position.y = 0.35 + Math.sin(t * 2) * 0.04;
      b.body.position.y = Math.sin(t * 1.8) * 0.06 - sink * sink * 0.3;
      b.body.rotation.x = Math.min(0.6, sink * 0.3);
    },
  };
}

// Shark: fast and small. Swims under the water (only the fin shows) where cannonballs can't reach it,
// comes up to charge, and is tired and easy to hit for a moment after.
export function createShark(scene) {
  const b = createBody(scene, { maxSpeed: 6.5, turn: 3.2, grip: 3, hp: 10 }, { back: -1.5, front: 1.5, r: 0.95, top: 1.8 });
  const fish = new THREE.Group();
  const torso = mesh(BLOB, mat.shark, [0, 0, 0], [1.35, 0.5, 0.52]);
  const belly = mesh(BLOB, mat.belly, [0.2, -0.12, 0], [1.05, 0.36, 0.44]);
  const fin = mesh(FIN, mat.shark, [-0.1, 0.7, 0], [1, 1, 0.22]);
  fin.rotation.z = -0.35; // leans back
  const tail = mesh(FIN, mat.shark, [-1.5, 0.15, 0], [0.9, 1, 0.18]);
  tail.rotation.z = Math.PI / 2 + 0.25;
  const eyes = [-0.33, 0.33].map((z) => mesh(BLOB, mat.eye, [0.9, 0.12, z], [0.07, 0.07, 0.05]));
  fish.add(torso, belly, fin, tail, ...eyes);
  b.body.add(fish);
  // Red strip on the water: where it is about to charge.
  const warn = new THREE.Mesh(STRIP, flat(0, 0xff4a3a));
  warn.scale.set(12, 1, 1.4);
  warn.position.set(1, 0.06, 0);
  warn.visible = false;
  b.root.add(warn);
  let depth = 0;

  return {
    ...b,
    warn(on) { warn.visible = on; },
    update(dt, t, want, throttle) {
      b.move(dt, want, throttle);
      const s = b.state, sink = Math.max(0, s.sinking);
      depth += ((s.under ? -0.75 : 0) - depth) * Math.min(1, dt * 5); // dive or come up smoothly
      b.body.position.y = 0.15 + depth - sink * 0.6;
      b.body.rotation.x = Math.min(Math.PI, sink * 2.5); // rolls over when it's beaten
      b.shadow.visible = s.sinking < 0 && !s.under;
      tail.rotation.y = Math.sin(t * (6 + s.speed)) * 0.4;
      warn.material.opacity = 0.45 + 0.15 * Math.sin(t * 18);
    },
    remove() {
      b.remove();
      warn.material.dispose();
    },
  };
}

function createMineModel() {
  const g = new THREE.Group();
  g.add(mesh(BLOB, mat.mine, [0, 0, 0], [0.42, 0.42, 0.42]));
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0]]) {
    const spike = mesh(SPIKE, mat.mine, [x * 0.45, y * 0.45, z * 0.45]);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
    g.add(spike);
  }
  return g;
}

const ARM = 1.2, LIFE = 40, TRIGGER = 1.8, BEEP_NEAR = 6;

// Floating mines. They arm after a moment, blink and beep faster as you get close,
// and go off when you touch one or shoot it. boom(x, z) deals the damage around the blast.
export function createMines(scene, fx, boom) {
  const live = new Set();

  function drop(x, z) {
    const m = createMineModel();
    const light = mesh(BLOB, new THREE.MeshBasicMaterial({ color: 0x661a14 }), [0, 0.5, 0], [0.12, 0.12, 0.12]);
    m.add(light);
    scene.add(m);
    live.add({ m, light, x, z, age: 0, beep: 0, phase: Math.random() * 6 });
    fx.splash(x, z, 0.5);
    sfx.plop();
  }

  function remove(mine) {
    scene.remove(mine.m);
    mine.light.material.dispose();
    live.delete(mine);
  }

  function explode(mine) {
    remove(mine);
    fx.boom(mine.x, mine.z);
    boom(mine.x, mine.z);
  }

  function update(dt, t, p) {
    for (const mine of [...live]) {
      mine.age += dt;
      const armed = mine.age > ARM, d = Math.hypot(p.x - mine.x, p.z - mine.z);
      if (armed && d < TRIGGER && p.sinking < 0) { explode(mine); continue; }
      if (mine.age > LIFE) { remove(mine); continue; } // waterlogged: sinks quietly
      const pop = Math.min(1, mine.age * 2);
      mine.m.position.set(mine.x, -0.6 + pop * 0.85 + Math.sin(t * 2.4 + mine.phase) * 0.06, mine.z);
      mine.m.rotation.y = t * 0.5 + mine.phase;
      // Blinks red; faster, and with a beep, when you are close.
      const near = armed && d < BEEP_NEAR && p.sinking < 0;
      const rate = near ? 3 + (BEEP_NEAR - d) * 2 : 0.8;
      mine.beep += dt * rate;
      const on = armed && mine.beep % 1 < 0.3;
      mine.light.material.color.setHex(on ? 0xff3b2a : 0x661a14);
      if (near && mine.beep >= 1) sfx.beep(d < 3.5);
      mine.beep %= 1;
    }
  }

  // A cannonball at (x, y, z): set off any mine it touches. Returns true if it hit one.
  function hitAt(x, y, z) {
    for (const mine of live) {
      if (y < 1.3 && Math.hypot(x - mine.x, z - mine.z) < 0.75) { explode(mine); return true; }
    }
    return false;
  }

  const clear = () => live.forEach(remove);
  return { drop, update, hitAt, clear, count: () => live.size };
}
