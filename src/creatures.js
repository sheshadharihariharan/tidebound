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

// Jellyfish: a see-through pink bell that drifts toward you. Sailing through one stings and slows you;
// one cannonball pops it. They come in swarms.
const JELLY = toon(0xff8fc8, { transparent: true, opacity: 0.85 }), FRILL = toon(0xffc2e2);
const TORUS = new THREE.TorusGeometry(0.62, 0.12, 6, 16).rotateX(Math.PI / 2);
export function createJelly(scene) {
  const b = createBody(scene, { maxSpeed: 1.6, turn: 1.5, hp: 5 }, { back: -0.7, front: 0.7, r: 0.75, top: 1.6 });
  const bell = mesh(DOME, JELLY, [0, 0, 0], [0.7, 0.75, 0.7]);
  const frill = mesh(TORUS, FRILL, [0, 0.02, 0]);
  const spots = [0, 2.1, 4.2].map((a) => mesh(BLOB, FRILL, [Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3], [0.1, 0.06, 0.1]));
  b.body.add(bell, frill, ...spots);
  b.shadow.visible = false;
  const phase = Math.random() * 6;
  return {
    ...b,
    update(dt, t, want, throttle) {
      b.move(dt, want, throttle);
      b.shadow.visible = false;
      const s = b.state, pulse = Math.sin(t * 4 + phase), gone = Math.max(0, s.sinking);
      b.body.scale.set(1 - pulse * 0.08, 1 + pulse * 0.15, 1 - pulse * 0.08).multiplyScalar(Math.max(0.01, 1 - gone * 2));
      b.body.position.y = 0.05 + pulse * 0.05;
    },
  };
}

// Pufferfish: swims at you, then puffs up into a spiky ball (a red ring shows how far the spikes reach)
// and bursts them out. Shoot it while it's puffed up for double damage.
const PUFF = toon(0xf2c14e), PUFF_SPOT = toon(0xc98a2c), PUFF_BELLY = toon(0xfff1c9);
const PUFF_SPIKE = new THREE.ConeGeometry(0.1, 0.35, 5);
export const PUFF_REACH = 3.2;
export function createPuffer(scene) {
  const b = createBody(scene, { maxSpeed: 3.8, turn: 2.6, grip: 2.5, hp: 12 }, { back: -0.8, front: 0.8, r: 0.8, top: 2.2 });
  const fish = new THREE.Group();
  fish.add(mesh(BLOB, PUFF, [0, 0, 0], [0.62, 0.55, 0.55]), mesh(BLOB, PUFF_BELLY, [0.05, -0.18, 0], [0.5, 0.35, 0.45]));
  for (const [x, z] of [[-0.2, 0.3], [0.1, -0.35], [-0.3, -0.15]]) fish.add(mesh(BLOB, PUFF_SPOT, [x, 0.35, z], [0.12, 0.08, 0.12]));
  fish.add(...[-0.25, 0.25].map((z) => mesh(BLOB, mat.eye, [0.5, 0.18, z], [0.08, 0.1, 0.08])));
  const tail = mesh(FIN, PUFF, [-0.75, 0, 0], [0.5, 0.5, 0.15]);
  tail.rotation.z = Math.PI / 2;
  fish.add(tail);
  // Spikes all over, hidden until it puffs up.
  const spikes = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
    const spike = mesh(PUFF_SPIKE, PUFF_SPOT, [v.x * 0.6, v.y * 0.55, v.z * 0.6]);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    spikes.add(spike);
  }
  fish.add(spikes);
  b.body.add(fish);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), flat(0, 0xff4a3a));
  ring.scale.setScalar(PUFF_REACH);
  ring.position.y = 0.06;
  b.root.add(ring);
  let size = 1;

  return {
    ...b,
    puff: 0, // 0 = normal, 1 = fully puffed up (set by its behaviour)
    update(dt, t, want, throttle) {
      b.move(dt, want, throttle);
      const s = b.state, sink = Math.max(0, s.sinking);
      size += (1 + this.puff * 1.2 - size) * Math.min(1, dt * 8);
      fish.scale.setScalar(size * (1 + (this.puff > 0.5 ? Math.sin(t * 40) * 0.03 : 0)));
      spikes.visible = size > 1.4;
      ring.visible = this.puff > 0 && s.sinking < 0;
      ring.material.opacity = 0.35 + 0.25 * Math.sin(t * 16);
      b.body.position.y = 0.2 + (size - 1) * 0.35 + Math.sin(t * 3) * 0.05 - sink * 0.6;
      b.body.rotation.x = Math.min(Math.PI, sink * 2.5);
      tail.rotation.y = Math.sin(t * 10) * 0.4;
    },
    remove() {
      b.remove();
      ring.material.dispose();
    },
  };
}

// Flickering flames, for a fire ship's deck.
const FLAME = new THREE.ConeGeometry(0.35, 1, 6).translate(0, 0.5, 0);
const flameMats = [new THREE.MeshBasicMaterial({ color: 0xff7a1a }), new THREE.MeshBasicMaterial({ color: 0xffd23a })];
flameMats.forEach((m) => { m.userData.outlineParameters = { visible: false }; });
export function createFlames() {
  const g = new THREE.Group();
  const flames = [[-0.8, 0.2], [0, -0.25], [0.7, 0.15], [-0.2, 0.3], [0.3, -0.1]].map(([x, z], i) => {
    const f = mesh(FLAME, flameMats[i % 2], [x, 0.4, z], [1, 1.2 + (i % 3) * 0.4, 1]);
    g.add(f);
    return f;
  });
  g.userData.flicker = (t) => flames.forEach((f, i) => { f.scale.y = 1 + Math.abs(Math.sin(t * 9 + i * 2.1)) * 1.1; f.scale.x = f.scale.z = 0.8 + Math.sin(t * 13 + i) * 0.15; });
  return g;
}

// Storm eel: a striped eel whose head sticks out of the water, sparking. They come in pairs
// with lightning crackling between them. arc(a, b, state, t) draws the bolt from this eel to its partner.
const EEL = toon(0x2f4f5f), EEL_STRIPE = toon(0xd8f05a), SPARK = new THREE.MeshBasicMaterial({ color: 0xfff6a0 });
SPARK.userData.outlineParameters = { visible: false };
const BOLT = new THREE.CylinderGeometry(0.09, 0.09, 1, 5).translate(0, 0.5, 0);
const glowMat = flat(0.35, 0xfff6a0);
const STEPS = 8;
export function createEel(scene) {
  const b = createBody(scene, { maxSpeed: 3.2, turn: 2.4, hp: 15 }, { back: -1.2, front: 0.8, r: 0.7, top: 2 });
  const head = mesh(BLOB, EEL, [0.3, 0.55, 0], [0.55, 0.5, 0.42]);
  const neck = mesh(BLOB, EEL, [-0.3, 0.2, 0], [0.6, 0.35, 0.35]);
  const tail = mesh(BLOB, EEL, [-1, 0, 0], [0.5, 0.25, 0.25]);
  const stripes = [-0.1, -0.55, -0.95].map((x, i) => mesh(BLOB, EEL_STRIPE, [x, 0.38 - i * 0.15, 0], [0.12, 0.3 - i * 0.05, 0.36 - i * 0.05]));
  const eyes = [-0.22, 0.22].map((z) => mesh(BLOB, EEL_STRIPE, [0.7, 0.7, z], [0.09, 0.09, 0.09]));
  const tips = [-0.18, 0.18].map((z) => mesh(BLOB, SPARK, [0.2, 1.05, z], [0.1, 0.1, 0.1]));
  b.body.add(head, neck, tail, ...stripes, ...eyes, ...tips);
  // The bolt: a jagged chain of thin glowing sticks, and a fainter wide one around it.
  const bolt = new THREE.Group();
  const sticks = Array.from({ length: STEPS }, () => {
    const core = new THREE.Mesh(BOLT, SPARK), glow = new THREE.Mesh(BOLT, glowMat);
    glow.scale.set(3.5, 1, 3.5);
    core.add(glow);
    bolt.add(core);
    return core;
  });
  bolt.visible = false;
  scene.add(bolt);
  const up = new THREE.Vector3(0, 1, 0), from = new THREE.Vector3(), to = new THREE.Vector3(), d = new THREE.Vector3();
  let jitter = 0, pts = [];

  return {
    ...b,
    update(dt, t, want, throttle) {
      b.move(dt, want, throttle);
      const sink = Math.max(0, b.state.sinking);
      b.body.position.y = Math.sin(t * 3) * 0.08 - sink * 0.6;
      head.rotation.z = Math.sin(t * 4) * 0.15;
      tips.forEach((tip) => { tip.visible = Math.sin(t * 25 + tip.position.z * 10) > 0; });
    },
    // state: 'off', 'charge' (faint flickers) or 'on' (a full bolt).
    arc(ax, az, bx, bz, state, t, dt) {
      // No bolt when the two eels are on top of each other: there'd be nothing to draw (and it would divide by zero).
      bolt.visible = state !== 'off' && (state === 'on' || Math.sin(t * 30) > 0.6) && Math.hypot(bx - ax, bz - az) > 0.5;
      if (!bolt.visible) return;
      jitter -= dt;
      if (jitter <= 0 || pts.length !== STEPS + 1) { // a new jagged shape a dozen times a second
        jitter = 0.07;
        pts = Array.from({ length: STEPS + 1 }, (_, i) => {
          const u = i / STEPS, wob = i === 0 || i === STEPS ? 0 : (Math.random() - 0.5) * 1.1;
          return [ax + (bx - ax) * u - (bz - az) / Math.hypot(bx - ax, bz - az) * wob, 0.9 + (Math.random() - 0.5) * 0.5 * (wob ? 1 : 0), az + (bz - az) * u + (bx - ax) / Math.hypot(bx - ax, bz - az) * wob];
        });
      }
      sticks.forEach((s, i) => {
        from.set(...pts[i]);
        to.set(...pts[i + 1]);
        d.subVectors(to, from);
        s.position.copy(from);
        s.scale.y = d.length();
        s.quaternion.setFromUnitVectors(up, d.normalize());
        s.scale.x = s.scale.z = state === 'on' ? 1 : 0.5;
      });
    },
    onSink() { bolt.visible = false; },
    remove() {
      b.remove();
      scene.remove(bolt);
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
