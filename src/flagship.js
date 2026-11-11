// The Admiral's Flagship: the Storm Belt's boss. A huge galleon sailing a slow circle in the bay.
// The side facing you glows red before a full broadside (a red band on the water shows where it reaches),
// and a mortar on its stern lobs shells. Knock out all eight cannons, then sink the hull itself.
// When its cannons are gone the Admiral calls two pirate sloops and the mortar fires faster.
import * as THREE from 'three';
import { toon, flat } from './stage.js';
import { sfx } from './audio.js';
import { SHELL_RADIUS } from './effects.js';

const L = 5.5, W = 2.1; // half length and half width of the hull
const HULL = (() => {
  const s = new THREE.Shape(); // seen from above: x is forward
  s.moveTo(L + 1, 0);
  s.quadraticCurveTo(L - 0.5, W, L - 2, W);
  s.lineTo(-L + 0.6, W);
  s.quadraticCurveTo(-L, W, -L, W - 0.6);
  s.lineTo(-L, -W + 0.6);
  s.quadraticCurveTo(-L, -W, -L + 0.6, -W);
  s.lineTo(L - 2, -W);
  s.quadraticCurveTo(L - 0.5, -W, L + 1, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 1, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.4, 0);
  return g;
})();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const MAST = new THREE.CylinderGeometry(0.15, 0.2, 1, 8).translate(0, 0.5, 0);
const GUN = new THREE.CylinderGeometry(0.2, 0.26, 1, 10).rotateX(Math.PI / 2);
const MORTAR = new THREE.CylinderGeometry(0.45, 0.55, 1, 12);
const BAND = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const m = (c) => toon(c);
const hullMat = m(0x2b3a52), trim = m(0xffc93c), deckMat = m(0xb08850), sailMat = m(0xf1e6cc), stripeMat = m(0x2b3a52), dark = m(0x23262b), wood = m(0x6b4a2b);

const GUN_HP = 12, HULL_HP = 120;
const GUNS = [-3, -1, 1, 3]; // along each side
const BROADSIDE = { every: 3.4, warn: 0.9, reach: 13 }; // seconds between, warning time, how far the band reaches
const MORTAR_FIRE = { every: [4, 2.4], flight: 1.6, damage: 12 }; // before / after the cannons are gone
const SAIL = { radius: 8, speed: [2.2, 3.2] };

// api: shoot(shots, dist), hurtPlayer, shake, spawn(kind). loot: for the gold it drops.
export function createFlagship(scene, fx, loot, api) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  scene.add(root);

  body.add(mesh(HULL, hullMat, [0, 0, 0]));
  body.add(mesh(BOX, deckMat, [0.3, 1.15, 0], [2 * L - 0.6, 0.1, 2 * W - 0.4]));
  body.add(mesh(BOX, trim, [0, 0.95, W + 0.02], [2 * L - 1, 0.18, 0.08]), mesh(BOX, trim, [0, 0.95, -W - 0.02], [2 * L - 1, 0.18, 0.08]));
  body.add(mesh(BOX, hullMat, [-L + 1.3, 1.9, 0], [2.4, 1.6, 2 * W - 0.2])); // the stern castle
  body.add(mesh(BOX, trim, [-L + 1.3, 2.75, 0], [2.5, 0.12, 2 * W - 0.1]));
  for (const [x, h] of [[2.6, 6.5], [0, 7.5], [-2.4, 6]]) {
    body.add(mesh(MAST, wood, [x, 1.2, 0], [1, h, 1]));
    body.add(mesh(BOX, sailMat, [x, 1.2 + h * 0.55, 0], [0.12, h * 0.5, 2 * W + 0.6]));
    body.add(mesh(BOX, stripeMat, [x, 1.2 + h * 0.55, 0], [0.14, h * 0.1, 2 * W + 0.62]));
  }
  const flag = mesh(BOX, trim, [-0.4, 9.2, 0], [1.4, 0.6, 0.05]);
  body.add(flag);
  const mortar = mesh(MORTAR, dark, [-L + 1.3, 3.1, 0], [1, 0.8, 1]);
  mortar.rotation.z = 0.5;
  body.add(mortar);
  // Eight cannons, four a side, each its own target.
  const guns = [];
  for (const side of [-1, 1]) for (const x of GUNS) {
    const g = mesh(GUN, dark, [x, 0.7, side * (W + 0.35)], [1, 1, 1.1]);
    body.add(g);
    guns.push({ mesh: g, side, x, hp: GUN_HP });
  }
  // The broadside warning: a red band on the water along the side about to fire.
  const band = new THREE.Mesh(BAND, flat(0, 0xff4a3a));
  band.visible = false;
  scene.add(band);

  const s = { angle: Math.random() * 6.28, x: 0, z: 0, heading: 0 };
  let phase = 'guns', phaseTime = 0, hullHp = HULL_HP, broadside = 2.5, warnSide = 0, mortarTimer = 3;
  const bar = document.getElementById('boss');
  bar.querySelector('b').textContent = "The Admiral's Flagship";
  bar.classList.add('on');
  const v = new THREE.Vector3();

  // Which side of the ship is the player on? +1 or -1 (the +z side in the ship's own terms is +1).
  function sideOf(p) {
    const ux = Math.cos(s.heading), uz = Math.sin(s.heading);
    return Math.sign(-(p.x - s.x) * uz + (p.z - s.z) * ux) || 1;
  }
  // How far along the hull, and how far out to the side, the player is.
  function relative(p) {
    const ux = Math.cos(s.heading), uz = Math.sin(s.heading), dx = p.x - s.x, dz = p.z - s.z;
    return { along: dx * ux + dz * uz, out: Math.abs(-dx * uz + dz * ux) };
  }

  function fireBroadside(side, p) {
    const ux = Math.cos(s.heading), uz = Math.sin(s.heading);
    const ox = -uz * side, oz = ux * side; // straight out of that side
    const shots = guns.filter((g) => g.side === side && g.hp > 0).map((g) => ({ x: s.x + ux * g.x + ox * (W + 0.6), z: s.z + uz * g.x + oz * (W + 0.6), dx: ox, dz: oz }));
    if (shots.length) api.shoot(shots, Math.hypot(p.x - s.x, p.z - s.z) * 0.5);
  }

  function lob(p) {
    const tx = p.x + p.vx * MORTAR_FIRE.flight * 0.6 + (Math.random() - 0.5) * 2.5, tz = p.z + p.vz * MORTAR_FIRE.flight * 0.6 + (Math.random() - 0.5) * 2.5;
    fx.lob(s.x - Math.cos(s.heading) * (L - 1.3), s.z - Math.sin(s.heading) * (L - 1.3), tx, tz, MORTAR_FIRE.flight, (x, z) => {
      if (p.sinking < 0 && Math.hypot(p.x - x, p.z - z) < SHELL_RADIUS + 0.6) api.hurtPlayer(MORTAR_FIRE.damage, p.x, 1, p.z);
    });
    sfx.mortar(MORTAR_FIRE.flight);
  }

  function update(dt, t, p) {
    phaseTime += dt;
    const angry = phase === 'hull';
    if (phase !== 'beaten') { // sail a slow circle around the middle of the bay
      s.angle += (SAIL.speed[angry ? 1 : 0] / SAIL.radius) * dt;
      s.x = Math.cos(s.angle) * SAIL.radius;
      s.z = Math.sin(s.angle) * SAIL.radius;
      s.heading = s.angle + Math.PI / 2;
    }
    root.position.set(s.x, 0, s.z);
    root.rotation.y = -s.heading;
    body.rotation.x = Math.sin(t * 1.2) * 0.02;
    body.position.y = Math.sin(t * 1.5) * 0.06;
    flag.rotation.y = Math.sin(t * 5) * 0.2;

    if (phase !== 'beaten' && p.sinking < 0) {
      // Broadside: warn along the side you're on, then fire every cannon left on it.
      broadside -= dt;
      const rel = relative(p);
      if (phase === 'guns' && warnSide === 0 && broadside <= 0 && rel.out < BROADSIDE.reach && Math.abs(rel.along) < L + 2) {
        warnSide = sideOf(p);
        broadside = BROADSIDE.warn;
        if (!guns.some((g) => g.side === warnSide && g.hp > 0)) { warnSide = 0; broadside = 0.5; }
        else sfx.sharkWarn();
      } else if (warnSide && broadside <= 0) {
        fireBroadside(warnSide, p);
        warnSide = 0;
        broadside = BROADSIDE.every;
        api.shake(0.3);
      }
      mortarTimer -= dt;
      if (mortarTimer <= 0) {
        mortarTimer = MORTAR_FIRE.every[angry ? 1 : 0];
        lob(p);
        if (angry) setTimeout(() => lob(p), 350);
      }
    }
    // The red band follows the ship while it warns.
    band.visible = warnSide !== 0;
    if (band.visible) {
      const ux = Math.cos(s.heading), uz = Math.sin(s.heading), out = (W + BROADSIDE.reach / 2) * warnSide;
      band.position.set(s.x - uz * out, 0.07, s.z + ux * out);
      band.rotation.y = -s.heading;
      band.scale.set(2 * L, 1, BROADSIDE.reach);
      band.material.opacity = 0.25 + 0.15 * Math.sin(t * 16);
    }
    guns.forEach((g) => { g.mesh.material = g.hp > 0 && g.side === warnSide && Math.sin(t * 20) > 0 ? trim : dark; });

    if (phase === 'guns' && guns.every((g) => g.hp <= 0)) { // out of cannons: the Admiral calls for help
      phase = 'hull';
      phaseTime = 0;
      sfx.roar();
      api.shake(0.5);
      api.spawn('sloop');
      api.spawn('sloop');
    }
    if (phase === 'beaten') {
      body.rotation.z = Math.min(0.5, phaseTime * 0.2);
      body.position.y = -phaseTime * phaseTime * 0.25;
      if (Math.random() < dt * 14) fx.bubble(s.x + (Math.random() - 0.5) * 8, s.z + (Math.random() - 0.5) * 8);
    }
    // Ships can't sail through it.
    if (p.sinking < 0 && phase !== 'beaten') {
      const ux = Math.cos(s.heading), uz = Math.sin(s.heading);
      const along = Math.max(-L, Math.min(L, (p.x - s.x) * ux + (p.z - s.z) * uz));
      const cx = s.x + ux * along, cz = s.z + uz * along, d = Math.hypot(p.x - cx, p.z - cz), min = W + 1;
      if (d < min && d > 0) { p.x = cx + ((p.x - cx) / d) * min; p.z = cz + ((p.z - cz) / d) * min; }
    }
    drawBar();
  }

  // A player's cannonball at (x, y, z). Returns true if it hit the flagship.
  function hitAt(x, y, z, amount) {
    if (phase === 'beaten' || y > 3) return false;
    const ux = Math.cos(s.heading), uz = Math.sin(s.heading);
    const along = (x - s.x) * ux + (z - s.z) * uz, out = Math.abs(-(x - s.x) * uz + (z - s.z) * ux);
    if (Math.abs(along) > L + 1 || out > W + 0.9) return false;
    // A cannon close by takes the hit.
    for (const g of guns) {
      if (g.hp <= 0) continue;
      g.mesh.getWorldPosition(v);
      if (Math.hypot(x - v.x, z - v.z) > 1.3) continue;
      hitFlash(x, y, z);
      g.hp -= amount;
      if (g.hp <= 0) { // knocked out: the cannon drops away
        g.mesh.visible = false;
        fx.puff(v.x, 1, v.z, 1.6, 0x5a6066);
        sfx.thud();
        loot.drop(v.x, v.z, 2);
      }
      return true;
    }
    if (phase === 'guns') { // the thick hull shrugs it off while the cannons still fire
      fx.puff(x, y, z, 0.6, 0xffffff);
      sfx.thud();
      return true;
    }
    hitFlash(x, y, z);
    hullHp = Math.max(0, hullHp - amount);
    if (hullHp === 0) {
      phase = 'beaten';
      phaseTime = 0;
      band.visible = false;
      sfx.sink();
      sfx.roar();
      api.shake(0.8);
      loot.drop(s.x, s.z, 30);
      loot.crate(s.x + 3, s.z);
      loot.crate(s.x - 3, s.z);
    }
    return true;
  }
  const hitFlash = (x, y, z) => { fx.shipHit(x, y, z); sfx.crack(); };

  // The bar: the cannons while it has them, then the hull. A dot per cannon.
  function drawBar() {
    const gunHp = guns.reduce((n, g) => n + Math.max(0, g.hp), 0);
    bar.querySelector('i').style.width = (phase === 'guns' ? (100 * gunHp) / (GUN_HP * guns.length) : (100 * hullHp) / HULL_HP) + '%';
    bar.querySelector('.pips').innerHTML = guns.map((g) => `<span class="${g.hp <= 0 ? 'out' : ''}"></span>`).join('');
  }

  function remove() {
    scene.remove(root, band);
    band.material.dispose();
    bar.classList.remove('on');
  }

  return { update, hitAt, remove, beaten: () => phase === 'beaten' && phaseTime > 2.5 };
}

function mesh(geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1]) {
  const o = new THREE.Mesh(geo, material);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}
