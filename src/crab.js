// The Crab King: the Coral Reef's boss, sitting on a sandbar in the middle of Crab Atoll.
// It throws rocks at you (a red circle shows where each lands) and snaps a claw along a red strip
// when you come close. Shoot off both claws and its shell cracks open: then hit its soft middle.
import * as THREE from 'three';
import { toon, flat } from './stage.js';
import { sfx } from './audio.js';
import { SHELL_RADIUS } from './effects.js';

const BLOB = new THREE.SphereGeometry(1, 14, 10);
const DOME = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const LIMB = new THREE.CylinderGeometry(0.22, 0.28, 1, 8).rotateZ(Math.PI / 2).translate(0.5, 0, 0); // points along +x
const STALK = new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6).translate(0, 0.45, 0);
const PINCER = new THREE.ConeGeometry(0.5, 1.6, 8).rotateZ(-Math.PI / 2);
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
const SAND = new THREE.CylinderGeometry(1, 1.05, 0.5, 24);
const red = toon(0xd9583a), shellMat = toon(0xe8744a), soft = toon(0xf7a8a0), white = toon(0xffffff), dark = toon(0x1d2326), sand = toon(0xf2d49b);

const CLAW_HP = 30, BODY_HP = 70;
const THROW = { every: [2.6, 1.6], flight: 1.6, damage: 12 }; // rock throws: before / after its shell cracks
const SNAP = { near: 9, aim: 0.9, reach: 6.5, damage: 14, rest: 2.2 }; // a claw snap when you come close
const RADIUS = 4.2; // ships can't get closer than this to its middle

// api: hurtPlayer(amount, x, y, z), shake(amount). loot: for the gold it drops.
export function createCrab(scene, fx, loot, api) {
  const root = new THREE.Group(); // turns to face the player
  const island = new THREE.Mesh(SAND, sand);
  island.scale.set(5, 1, 5);
  island.position.y = 0.05;
  const body = new THREE.Group();
  root.add(body);
  scene.add(island, root);

  const belly = mesh(BLOB, red, [0, 0.9, 0], [2.6, 1.1, 2.2]);
  const middle = mesh(BLOB, soft, [0, 1.3, 0], [2.1, 0.8, 1.8]); // shows when the shell opens
  const shellPivot = new THREE.Group(); // hinged at the back, so it can crack open
  shellPivot.position.set(-2, 1.3, 0);
  const shell = mesh(DOME, shellMat, [2, 0, 0], [2.7, 1.4, 2.3]);
  shellPivot.add(shell);
  body.add(belly, middle, shellPivot);
  // Eyes on stalks, at the front.
  for (const z of [-0.6, 0.6]) {
    const stalk = mesh(STALK, red, [1.7, 1.9, z]);
    stalk.add(mesh(BLOB, white, [0, 0.95, 0], [0.32, 0.32, 0.32]), mesh(BLOB, dark, [0.22, 1, 0], [0.15, 0.15, 0.15]));
    body.add(stalk);
  }
  // Three legs a side.
  const legs = [];
  for (const side of [-1, 1]) for (const x of [-1, 0, 1]) {
    const leg = mesh(LIMB, red, [x * 0.9, 0.7, side * 1.8]);
    leg.scale.set(1.6, 0.8, 0.8);
    leg.rotation.y = -side * (Math.PI / 2 + x * 0.35);
    leg.rotation.z = -0.5;
    body.add(leg);
    legs.push(leg);
  }
  const claws = [-1, 1].map(makeClaw);

  function makeClaw(side) {
    const arm = new THREE.Group(); // turns toward its target
    arm.position.set(1.6, 1, side * 1.9);
    const upper = mesh(LIMB, red, [0, 0, 0]);
    upper.scale.set(2.2, 1.2, 1.2);
    const hand = new THREE.Group();
    hand.position.x = 2.2;
    const palm = mesh(BLOB, red, [0.6, 0, 0], [1.1, 0.75, 0.75]);
    const top = mesh(PINCER, shellMat, [1.6, 0.25, 0]);
    const bottom = mesh(PINCER, shellMat, [1.5, -0.2, 0]);
    bottom.scale.set(0.8, 0.8, 0.8);
    hand.add(palm, top, bottom);
    arm.add(upper, hand);
    arm.rotation.y = -side * 0.6;
    body.add(arm);
    const strip = new THREE.Mesh(STRIP, flat(0, 0xff4a3a));
    strip.scale.set(SNAP.reach + 2.5, 1, 2.2);
    strip.visible = false;
    scene.add(strip);
    return { side, arm, hand, top, palm, strip, hp: CLAW_HP, state: 'rest', t: 0, dir: 0, reach: 0 };
  }

  let phase = 'claws', phaseTime = 0, throwTimer = 2, snapTimer = 2, bodyHp = BODY_HP, facing = 0;
  const bar = document.getElementById('boss');
  bar.querySelector('b').textContent = 'The Crab King';
  bar.classList.add('on');
  const v = new THREE.Vector3();

  // A rock lobbed at where you're heading.
  function throwRock(p) {
    const tx = p.x + p.vx * THROW.flight * 0.6 + (Math.random() - 0.5) * 2.5, tz = p.z + p.vz * THROW.flight * 0.6 + (Math.random() - 0.5) * 2.5;
    fx.lob(0, 0, tx, tz, THROW.flight, (x, z) => {
      if (p.sinking < 0 && Math.hypot(p.x - x, p.z - z) < SHELL_RADIUS + 0.6) api.hurtPlayer(THROW.damage, p.x, 1, p.z);
    });
    sfx.mortar(THROW.flight);
  }

  function updateClaw(c, dt, t, p) {
    c.t += dt;
    if (c.state === 'gone') return;
    if (c.state === 'rest') {
      c.reach += (0 - c.reach) * Math.min(1, dt * 4);
      c.top.rotation.z = 0.15 + Math.sin(t * 3 + c.side) * 0.12; // idle clicking
    } else if (c.state === 'aim') { // the red strip shows where it will snap
      c.strip.material.opacity = 0.4 + 0.2 * Math.sin(t * 18);
      c.top.rotation.z = 0.5; // pincer wide open
      if (c.t >= SNAP.aim) { c.state = 'snap'; c.t = 0; sfx.snap(); }
    } else if (c.state === 'snap') {
      c.reach = Math.min(1, c.t / 0.18);
      c.top.rotation.z = 0.5 - c.reach * 0.5;
      if (c.t >= 0.18) {
        c.state = 'out';
        c.t = 0;
        c.strip.visible = false;
        api.shake(0.35);
        // Was the player along the strip?
        const sx = c.strip.position.x, sz = c.strip.position.z, dx = Math.cos(c.dir), dz = Math.sin(c.dir);
        const along = Math.max(0, Math.min(SNAP.reach + 2.5, (p.x - sx) * dx + (p.z - sz) * dz));
        if (p.sinking < 0 && Math.hypot(p.x - sx - dx * along, p.z - sz - dz * along) < 1.9) api.hurtPlayer(SNAP.damage, p.x, 1, p.z);
        fx.splash(sx + dx * SNAP.reach, sz + dz * SNAP.reach, 1.2);
      }
    } else if (c.state === 'out' && c.t > 0.8) {
      c.state = 'rest';
      c.t = 0;
    } else if (c.state === 'falling') { // shot off: drops into the sea
      c.hand.position.y -= dt * 3;
      c.hand.rotation.z += dt * 3;
      if (c.t > 1.5) { c.state = 'gone'; c.arm.visible = false; }
    }
    // Reach out along the strip: the arm points at its target and stretches.
    const aimAngle = c.state === 'rest' ? -c.side * 0.6 : -(c.dir - facing);
    c.arm.rotation.y += (aimAngle - c.arm.rotation.y) * Math.min(1, dt * 8);
    c.hand.position.x = 2.2 + c.reach * SNAP.reach;
  }

  function startSnap(p) {
    const ready = claws.filter((c) => c.state === 'rest');
    if (!ready.length) return;
    // The claw on the player's side.
    const c = ready.sort((a, b) => clawDist(a, p) - clawDist(b, p))[0];
    c.arm.getWorldPosition(v);
    c.dir = Math.atan2(p.z - v.z, p.x - v.x);
    c.strip.position.set(v.x, 0.07, v.z);
    c.strip.rotation.y = -c.dir;
    c.strip.visible = true;
    c.state = 'aim';
    c.t = 0;
    sfx.sharkWarn();
  }
  const clawDist = (c, p) => { c.arm.getWorldPosition(v); return Math.hypot(p.x - v.x, p.z - v.z); };

  function update(dt, t, p) {
    phaseTime += dt;
    // Turn slowly to face the player.
    const want = Math.atan2(p.z, p.x), diff = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
    if (phase !== 'beaten') facing += Math.max(-dt * 0.8, Math.min(dt * 0.8, diff));
    root.rotation.y = -facing;
    legs.forEach((leg, i) => { leg.rotation.z = -0.5 + Math.sin(t * 6 + i) * 0.08 * Math.min(1, Math.abs(diff) * 4); });
    body.position.y = Math.sin(t * 2) * 0.05;

    if (phase !== 'beaten' && p.sinking < 0) {
      throwTimer -= dt;
      if (throwTimer <= 0 && Math.hypot(p.x, p.z) > SNAP.near - 2) {
        throwTimer = THROW.every[phase === 'open' ? 1 : 0];
        throwRock(p);
        if (phase === 'open') setTimeout(() => throwRock(p), 400); // two at a time once it's angry
      }
      snapTimer -= dt;
      if (snapTimer <= 0 && Math.hypot(p.x, p.z) < SNAP.near + RADIUS) {
        snapTimer = SNAP.rest;
        startSnap(p);
      }
    }
    claws.forEach((c) => updateClaw(c, dt, t, p));

    if (phase === 'claws' && claws.every((c) => c.hp <= 0)) { // shell cracks open
      phase = 'open';
      phaseTime = 0;
      sfx.roar();
      sfx.crack();
      api.shake(0.6);
    }
    shellPivot.rotation.z = phase === 'claws' ? 0 : Math.min(0.9, phaseTime * 2);
    if (phase === 'beaten') {
      body.rotation.x = Math.min(0.7, phaseTime * 0.4);
      body.position.y = -phaseTime * phaseTime * 0.3;
      if (Math.random() < dt * 12) fx.bubble((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    // Ships can't sail into it.
    const d = Math.hypot(p.x, p.z);
    if (phase !== 'beaten' && d < RADIUS && d > 0 && p.sinking < 0) { p.x *= RADIUS / d; p.z *= RADIUS / d; }
    drawBar();
  }

  // A player's cannonball at (x, y, z). Returns true if it hit the crab.
  function hitAt(x, y, z, amount) {
    if (phase === 'beaten' || y > 3.5) return false;
    for (const c of claws) {
      if (c.hp <= 0) continue;
      c.palm.getWorldPosition(v);
      if (Math.hypot(x - v.x, z - v.z) > 1.6) continue;
      fx.shipHit(x, y, z, 0xd9583a);
      sfx.crack();
      c.hp -= amount;
      if (c.hp <= 0) { // the claw comes off
        c.state = 'falling';
        c.t = 0;
        c.strip.visible = false;
        fx.splash(v.x, v.z, 1.6);
        sfx.splashBig();
        loot.drop(v.x, v.z, 5);
      }
      return true;
    }
    if (Math.hypot(x, z) > 3) return false;
    if (phase === 'claws') { // bounces off the closed shell
      fx.puff(x, y, z, 0.6, 0xffffff);
      sfx.clank();
      return true;
    }
    fx.shipHit(x, y, z, 0xf7a8a0);
    sfx.squish();
    bodyHp = Math.max(0, bodyHp - amount);
    if (bodyHp === 0) {
      phase = 'beaten';
      phaseTime = 0;
      sfx.roar();
      sfx.sink();
      api.shake(0.8);
      loot.drop(0, 5, 30);
      loot.crate(5, 0);
      loot.crate(-5, 0);
    }
    return true;
  }

  // The bar: the claws while it has them, then the soft middle.
  function drawBar() {
    const clawHp = claws.reduce((n, c) => n + Math.max(0, c.hp), 0);
    bar.querySelector('i').style.width = (phase === 'claws' ? (100 * clawHp) / (CLAW_HP * 2) : (100 * bodyHp) / BODY_HP) + '%';
    bar.querySelector('.pips').innerHTML = claws.map((c) => `<span class="${c.hp <= 0 ? 'out' : ''}"></span>`).join('');
  }

  function remove() {
    scene.remove(root, island);
    claws.forEach((c) => { scene.remove(c.strip); c.strip.material.dispose(); });
    bar.classList.remove('on');
  }

  return { update, hitAt, remove, beaten: () => phase === 'beaten' && phaseTime > 2 };
}

function mesh(geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
