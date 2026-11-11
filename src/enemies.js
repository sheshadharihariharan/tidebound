// Every enemy kind and how it behaves. Sunk ones drop gold.
//   sloop:   chases you, turns side-on and fires its cannons.
//   gunboat: keeps its distance and lobs shells; a red circle shows where each will land.
//   turtle:  slow; circles you and drops floating mines behind it.
//   shark:   circles under the water, comes up to charge, then is tired for a moment.
import * as THREE from 'three';
import { createShip, wrap } from './ship.js';
import { createTurtle, createShark, createMines } from './creatures.js';
import { SHELL_RADIUS } from './effects.js';
import { ARENA } from './world.js';
import { sfx } from './audio.js';
import { toon } from './stage.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SLOOP = { look: { hull: 0x5a3a2a, deck: 0x9c7a52, sail: 0xc4372c, stripe: 0x2a2e33, flag: 0x22272b }, stats: { maxSpeed: 5.2, turn: 1.8, reload: 2.4, hp: 30 } };
const GUNBOAT = { look: { hull: 0x3e4a57, deck: 0x8a8f99, sail: 0x5d6b7a, stripe: 0xffc93c, flag: 0xffc93c }, stats: { maxSpeed: 4.5, turn: 1.6, reload: 99, hp: 30 } };
const MORTAR = new THREE.CylinderGeometry(0.28, 0.36, 0.7, 10);
const MORTAR_MAT = toon(0x2a2e33);

const SIGHT = 24; // how close you must be before a sloop chases
const BROADSIDE = 9; // the distance sloops like to fight at
const RANGE = 12.5;
const DAMAGE = { shell: 12, ram: 10, mine: 15 };
// Shark timings in seconds: aiming (red strip showing), the charge, and resting after a bite or a miss.
const SHARK = { aim: 1.5, charge: 1.2, restBite: 3.5, restMiss: 3.2 };
const BLAST = 2.8; // a mine hurts everything this close
const CRATE_CHANCE = 0.35; // a sunk enemy leaves a repair crate this often

// world: rocks. fx: effects. loot: gold.
// api.shoot(shots, dist): a sloop fires cannonballs at the player.
// api.hurtPlayer(amount, x, y, z): something other than a cannonball hit the player.
export function createEnemies(scene, world, fx, loot, api) {
  const list = [];
  const bars = document.getElementById('bars');
  const mines = createMines(scene, fx, (x, z) => {
    if (Math.hypot(player.x - x, player.z - z) < BLAST) api.hurtPlayer(DAMAGE.mine, player.x, 1, player.z);
    for (const e of [...list]) {
      const s = e.body.state;
      if (Math.hypot(s.x - x, s.z - z) < BLAST) damage(e, DAMAGE.mine, s.x, 1, s.z);
    }
  });
  let player = { x: 0, z: 0 };

  const KINDS = {
    sloop: { gold: 5, barY: 3.3, hitColor: 0x8a5a33, make: () => createShip(scene, SLOOP.look, SLOOP.stats), think: sloop },
    gunboat: { gold: 6, barY: 3.3, hitColor: 0x8a5a33, make: makeGunboat, think: gunboat },
    turtle: { gold: 7, barY: 2.4, hitColor: 0x5c7a35, make: () => createTurtle(scene), think: turtle },
    shark: { gold: 4, barY: 1.9, hitColor: 0x6d8796, make: () => createShark(scene), think: shark },
  };

  function makeGunboat() {
    const ship = createShip(scene, GUNBOAT.look, GUNBOAT.stats);
    const mortar = new THREE.Mesh(MORTAR, MORTAR_MAT);
    mortar.position.set(1, 0.65, 0);
    mortar.rotation.z = -0.5; // tipped forward, ready to lob
    ship.body.add(mortar);
    return ship;
  }

  // A new enemy somewhere along the edge of the arena, away from the player.
  function spawn(kind, p) {
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * Math.PI * 2, d = 17 + Math.random() * 5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const far = Math.hypot(p.x - x, p.z - z) > (tries < 30 ? 14 : 8);
      if (!far || !world.clearAt(x, z, 2.5) || list.some((e) => Math.hypot(e.body.state.x - x, e.body.state.z - z) < 6)) continue;
      const body = KINDS[kind].make();
      body.reset(x, z, Math.atan2(-z, -x)); // facing the middle
      if (kind === 'shark') body.state.under = true;
      const bar = document.createElement('div');
      bar.className = 'ebar';
      bar.innerHTML = '<i></i>';
      bars.append(bar);
      list.push({ kind, body, bar, roam: Math.random() < 0.5 ? 1 : -1, roamTimer: 3, aim: 0.4, timer: 2 + Math.random() * 2, mode: 'circle' });
      fx.splash(x, z, 1.4);
      return;
    }
  }

  function drop(e) {
    e.body.remove();
    e.bar.remove();
    list.splice(list.indexOf(e), 1);
  }

  // Hurt an enemy. Sinks it and drops its gold when that was the last of its health.
  function damage(e, amount, x, y, z) {
    const s = e.body.state;
    if (s.sinking >= 0) return;
    if (e.kind === 'shark') fx.splash(x, z, 0.8);
    fx.shipHit(x, y, z, KINDS[e.kind].hitColor);
    sfx.crack();
    if (e.body.hurt(amount)) {
      sfx.sink();
      const g = KINDS[e.kind].gold;
      loot.drop(s.x, s.z, g - 1 + Math.floor(Math.random() * 3));
      // A repair crate: sometimes, and always from the last enemy left afloat.
      if (Math.random() < CRATE_CHANCE || alive() === 0) loot.crate(s.x, s.z);
      if (e.kind === 'shark') e.body.warn(false);
    }
  }

  // ---------- how each kind thinks: returns [heading it wants, throttle] ----------

  function sloop(e, dt, p, dist, toP) {
    const s = e.body.state;
    if (p.sinking >= 0 || dist >= SIGHT) return roam(e, dt, toP);
    let want, throttle;
    if (dist > BROADSIDE + 3) {
      want = toP; // chase
      throttle = 1;
    } else { // turn side-on, whichever way is quicker
      const a = toP + Math.PI / 2, b = toP - Math.PI / 2;
      want = Math.abs(wrap(a - s.heading)) < Math.abs(wrap(b - s.heading)) ? a : b;
      if (dist < BROADSIDE - 3) want += (wrap(want - toP) > 0 ? 0.5 : -0.5); // edge away when too close
      throttle = 0.5;
    }
    // Fire when the player sits in a side's line of fire, after a short aim.
    for (const [side, off] of [['left', -Math.PI / 2], ['right', Math.PI / 2]]) {
      if (dist < RANGE && Math.abs(wrap(s.heading + off - toP)) < 0.35 && e.body.ready(side) >= 1) {
        e.aim -= dt;
        if (e.aim <= 0) {
          const shots = e.body.fire(side);
          if (shots) api.shoot(shots, dist);
          e.aim = 0.4;
        }
      }
    }
    return [want, throttle];
  }

  // Lazy curves that slowly drift toward the player.
  function roam(e, dt, toP) {
    e.roamTimer -= dt;
    if (e.roamTimer <= 0) { e.roam = -e.roam; e.roamTimer = 3 + Math.random() * 4; }
    return [toP + e.roam * 1.1, 0.45];
  }

  // Stays 13 to 19 away and lobs a shell every few seconds at where you are heading.
  function gunboat(e, dt, p, dist, toP) {
    const s = e.body.state;
    e.timer -= dt;
    if (e.timer <= 0 && p.sinking < 0 && dist < 24) {
      e.timer = 3.4 + Math.random();
      const flight = 1.8;
      let tx = p.x + p.vx * flight * 0.6 + (Math.random() - 0.5) * 2.5;
      let tz = p.z + p.vz * flight * 0.6 + (Math.random() - 0.5) * 2.5;
      const out = Math.hypot(tx, tz) / (ARENA - 2);
      if (out > 1) { tx /= out; tz /= out; }
      fx.lob(s.x, s.z, tx, tz, flight, (x, z) => {
        if (p.sinking < 0 && Math.hypot(p.x - x, p.z - z) < SHELL_RADIUS + 0.6) api.hurtPlayer(DAMAGE.shell, p.x, 1, p.z);
      });
      sfx.mortar(flight);
    }
    if (p.sinking >= 0) return roam(e, dt, toP);
    if (dist > 19) return [toP, 0.8];
    if (dist < 13) return [toP + Math.PI + e.roam * 0.5, 1]; // back off
    return [toP + e.roam * Math.PI / 2, 0.35]; // drift sideways
  }

  // Circles about 9 away from you, leaving a mine every few seconds.
  function turtle(e, dt, p, dist, toP) {
    const s = e.body.state;
    e.timer -= dt;
    if (e.timer <= 0 && dist < 22 && p.sinking < 0 && mines.count() < 10) {
      e.timer = 2.8;
      mines.drop(s.x - Math.cos(s.heading) * 1.8, s.z - Math.sin(s.heading) * 1.8);
    }
    return [toP + e.roam * (Math.PI / 2 - clamp((dist - 9) * 0.12, -0.8, 0.8)), 1];
  }

  // Circles under the water, then comes up, aims (red strip), charges, and is tired after.
  function shark(e, dt, p, dist, toP) {
    const s = e.body.state;
    e.timer -= dt;
    if (e.mode === 'circle') {
      if (e.timer <= 0 && dist < 13 && p.sinking < 0) {
        e.mode = 'aim';
        e.timer = SHARK.aim;
        s.under = false;
        e.body.warn(true);
        sfx.sharkWarn();
      }
      return [toP + e.roam * (Math.PI / 2 - clamp((dist - 7) * 0.15, -0.9, 0.9)), 1];
    }
    if (e.mode === 'aim') {
      if (e.timer <= 0) {
        e.mode = 'charge';
        e.timer = SHARK.charge;
        e.dir = s.heading;
        e.body.warn(false);
        sfx.sharkGo();
      }
      return [Math.atan2(p.z + p.vz * 0.3 - s.z, p.x + p.vx * 0.3 - s.x), 0.05];
    }
    if (e.mode === 'charge') {
      if (p.sinking < 0 && dist < 2.7) { // bite
        api.hurtPlayer(DAMAGE.ram, p.x, 1, p.z);
        sfx.bite();
        p.vx += Math.cos(e.dir) * 7;
        p.vz += Math.sin(e.dir) * 7;
        s.vx *= -0.3;
        s.vz *= -0.3;
        e.mode = 'tired';
        e.timer = SHARK.restBite;
      } else if (e.timer <= 0) {
        e.mode = 'tired';
        e.timer = SHARK.restMiss;
      }
      return [e.dir, 1.75];
    }
    if (e.timer <= 0) { // done resting: back under
      e.mode = 'circle';
      e.timer = 4 + Math.random() * 3;
      s.under = true;
    }
    return [s.heading + 0.3 * e.roam, 0.1];
  }

  // p: the player's ship state.
  function update(dt, t, p, camera) {
    player = p;
    for (const e of [...list]) {
      const s = e.body.state;
      if (s.sinking >= 0) {
        e.body.update(dt, t);
        if (Math.random() < dt * 8) fx.bubble(s.x, s.z);
        if (s.sinking > 3) drop(e);
        continue;
      }
      const dx = p.x - s.x, dz = p.z - s.z, dist = Math.hypot(dx, dz), toP = Math.atan2(dz, dx);
      let [want, throttle] = KINDS[e.kind].think(e, dt, p, dist, toP);
      // Steer around rocks a few lengths ahead (a charging shark doesn't look).
      if (e.mode !== 'charge' && !world.clearAt(s.x + Math.cos(want) * 4, s.z + Math.sin(want) * 4, 1)) want += 1.3 * e.roam;
      e.body.update(dt, t, want, throttle);
      world.collide(s, e.kind === 'turtle' ? 1.3 : 1);
    }
    mines.update(dt, t, p);
    separate(p);

    // Health bars float above enemies that have been hit.
    for (const e of list) {
      const s = e.body.state;
      const show = s.hp < s.maxHp && s.sinking < 0;
      e.bar.style.display = show ? '' : 'none';
      if (!show) continue;
      const v = e.body.root.position.clone().setY(KINDS[e.kind].barY).project(camera);
      e.bar.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -50%)`;
      e.bar.firstChild.style.width = (100 * s.hp) / s.maxHp + '%';
    }
  }

  // Ships and creatures push each other apart instead of overlapping.
  function separate(p) {
    const all = [p, ...list.map((e) => e.body.state)].filter((s) => s.sinking < 0);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= 2.4 || d === 0) continue;
        const push = (2.4 - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }

  // A player's cannonball at (x, y, z): damage the enemy or set off the mine it touches. Returns true on a hit.
  function hitAt(x, y, z, amount) {
    const e = list.find((e) => e.body.touches(x, y, z));
    if (e) damage(e, amount, x, y, z);
    return !!e || mines.hitAt(x, y, z);
  }

  function clear() {
    [...list].forEach(drop);
    mines.clear();
  }

  // Enemies still afloat (sinking ones don't count).
  const alive = () => list.filter((e) => e.body.state.sinking < 0).length;

  return { spawn, update, hitAt, clear, disarm: mines.clear, alive, list };
}
