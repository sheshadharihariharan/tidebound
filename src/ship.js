// The player's ship: model, steering with a little drift, wake, and cannon reloads.
import * as THREE from 'three';
import { toon, flat } from './stage.js';

const MAX_SPEED = 7, TURN = 2.2, RELOAD = 1.2, R2 = Math.SQRT1_2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function buildHull() {
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
}

export function createShip(scene) {
  const root = new THREE.Group(); // position and heading
  const body = new THREE.Group(); // bobs and leans
  root.add(body);
  scene.add(root);

  const hullGeo = buildHull();
  const hull = new THREE.Mesh(hullGeo, toon(0xb5532c));
  const deck = new THREE.Mesh(hullGeo, toon(0xd9a45b));
  deck.scale.set(0.86, 0.2, 0.8);
  deck.position.y = 0.26;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), toon(0x6b4a2b));
  mast.position.set(0.2, 1.3, 0);
  const sail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 0.06), toon(0xfff4dc)); // fore-and-aft, seen from the side
  sail.position.set(-0.45, 1.55, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.3, 0.08), toon(0xd8452e));
  stripe.position.copy(sail.position);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.02), toon(0xd8452e));
  flag.position.set(-0.05, 2.7, 0);
  body.add(hull, deck, mast, sail, stripe, flag);

  const muzzles = { left: [], right: [] };
  const cannonGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8);
  const cannonMat = toon(0x2a2e33);
  for (const [side, z] of [['left', -0.62], ['right', 0.62]]) {
    for (const x of [0.5, -0.4]) {
      const c = new THREE.Mesh(cannonGeo, cannonMat);
      c.rotation.x = Math.PI / 2; // points sideways
      c.position.set(x, 0.5, z);
      body.add(c);
      muzzles[side].push(x);
    }
  }

  // Faint arcs on the water show where each side's cannons will hit.
  const arcs = {};
  for (const [side, angle] of [['left', Math.PI / 2], ['right', -Math.PI / 2]]) {
    const g = new THREE.CircleGeometry(13, 20, angle - 0.45, 0.9).rotateX(-Math.PI / 2);
    arcs[side] = new THREE.Mesh(g, flat(0.2));
    arcs[side].position.y = 0.06;
    root.add(arcs[side]);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), flat(0.22, 0x0a3a44));
  shadow.scale.set(2.2, 1, 1.0);
  shadow.position.y = 0.04;
  root.add(shadow);

  // Wake: foam discs left behind the stern that grow and fade.
  const wakeGeo = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
  const wake = Array.from({ length: 36 }, () => {
    const m = new THREE.Mesh(wakeGeo, flat(0));
    m.position.y = 0.05;
    m.visible = false;
    scene.add(m);
    return { m, age: 9 };
  });
  let wakeNext = 0, wakeTimer = 0;

  const s = { x: 0, z: 0, vx: 0, vz: 0, heading: -Math.PI / 4, lean: 0, cool: { left: 0, right: 0 }, speed: 0 };

  // steer: { x, y } thumbstick on the screen, each -1..1.
  function update(dt, t, steer) {
    const mag = Math.hypot(steer.x, steer.y);
    let turn = 0, throttle = 0;
    if (mag > 0.12) {
      // Screen direction to world direction (the camera looks along (1,1,1)).
      const want = Math.atan2(-steer.x - steer.y, steer.x - steer.y);
      const diff = wrap(want - s.heading);
      turn = clamp(diff, -TURN * dt, TURN * dt);
      s.heading += turn;
      throttle = Math.min(1, mag * 1.3) * (0.4 + 0.6 * Math.max(0, Math.cos(diff)));
    }
    const k = 1 - Math.exp(-dt * 1.4); // slow catch-up: the ship drifts a little
    s.vx += (Math.cos(s.heading) * throttle * MAX_SPEED - s.vx) * k;
    s.vz += (Math.sin(s.heading) * throttle * MAX_SPEED - s.vz) * k;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.speed = Math.hypot(s.vx, s.vz);
    for (const side of ['left', 'right']) s.cool[side] = Math.max(0, s.cool[side] - dt);

    s.lean += (clamp((-turn / dt) * 0.12, -0.3, 0.3) - s.lean) * Math.min(1, dt * 6);
    root.position.set(s.x, 0, s.z);
    root.rotation.y = -s.heading;
    body.rotation.x = s.lean + Math.sin(t * 1.7) * 0.02;
    body.rotation.z = Math.sin(t * 2.1) * 0.025 - s.speed * 0.006;
    body.position.y = Math.sin(t * 2.3) * 0.05;
    flag.rotation.z = Math.sin(t * 6) * 0.2;
    for (const side of ['left', 'right']) arcs[side].material.opacity = s.cool[side] > 0 ? 0.06 : 0.2;

    wakeTimer -= dt;
    if (s.speed > 1.2 && wakeTimer <= 0) {
      wakeTimer = 0.07;
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

  // Fire one side. Returns [{ x, z, dx, dz }] for each cannon, or null while reloading.
  function fire(side) {
    if (s.cool[side] > 0) return null;
    s.cool[side] = RELOAD;
    const fx = Math.cos(s.heading), fz = Math.sin(s.heading);
    const dx = side === 'left' ? fz : -fz, dz = side === 'left' ? -fx : fx;
    return muzzles[side].map((m) => ({
      x: s.x + fx * m + dx * 0.7,
      z: s.z + fz * m + dz * 0.7,
      dx,
      dz,
    }));
  }

  const ready = (side) => 1 - s.cool[side] / RELOAD;
  return { state: s, update, fire, ready };
}
