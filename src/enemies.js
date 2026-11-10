// Pirate sloops: they roam, spot you, chase, turn side-on and fire. Sunk ones drop gold.
import { createShip, wrap } from './ship.js';
import { sfx } from './audio.js';

const LOOK = { hull: 0x5a3a2a, deck: 0x9c7a52, sail: 0xc4372c, stripe: 0x2a2e33, flag: 0x22272b };
const STATS = { maxSpeed: 5.2, turn: 1.8, reload: 2.4, hp: 30 };
const COUNT = 2; // pirates around at once
const SIGHT = 24; // how close you must be before they chase
const BROADSIDE = 9; // the distance they like to fight at
const RANGE = 12.5;

// world: rocks. fx: effects. loot: gold. shoot(shots, from): fires a pirate's cannonballs at the player.
export function createEnemies(scene, world, fx, loot, shoot) {
  const list = [];
  const bars = document.getElementById('bars');
  let spawnTimer = 3;

  function spawn(p) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 10;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!world.clearAt(x, z, 3) || list.some((e) => Math.hypot(e.ship.state.x - x, e.ship.state.z - z) < 8)) continue;
      const ship = createShip(scene, LOOK, STATS);
      ship.reset(x, z, Math.random() * 6.28);
      const bar = document.createElement('div');
      bar.className = 'ebar';
      bar.innerHTML = '<i></i>';
      bars.append(bar);
      list.push({ ship, bar, roam: Math.random() < 0.5 ? 1 : -1, roamTimer: 3, aim: 0.4 });
      return;
    }
  }

  function drop(e) {
    e.ship.remove();
    e.bar.remove();
    list.splice(list.indexOf(e), 1);
  }

  // p: the player's ship state. Returns nothing; pirates fire through shoot().
  function update(dt, t, p, camera) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && list.length < COUNT && p.sinking < 0) {
      spawn(p);
      spawnTimer = 5;
    }
    for (const e of [...list]) {
      const s = e.ship.state;
      if (s.sinking >= 0) {
        e.ship.update(dt, t);
        if (Math.random() < dt * 8) fx.bubble(s.x, s.z);
        if (s.sinking > 3) drop(e);
        continue;
      }
      const dx = p.x - s.x, dz = p.z - s.z, dist = Math.hypot(dx, dz), toP = Math.atan2(dz, dx);
      if (dist > 75) { drop(e); continue; } // left far behind

      let want, throttle;
      if (p.sinking < 0 && dist < SIGHT) {
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
          if (dist < RANGE && Math.abs(wrap(s.heading + off - toP)) < 0.35 && e.ship.ready(side) >= 1) {
            e.aim -= dt;
            if (e.aim <= 0) {
              const shots = e.ship.fire(side);
              if (shots) shoot(shots, dist);
              e.aim = 0.4;
            }
          }
        }
      } else { // roam in lazy curves that slowly drift your way
        e.roamTimer -= dt;
        if (e.roamTimer <= 0) { e.roam = -e.roam; e.roamTimer = 3 + Math.random() * 4; }
        want = toP + e.roam * 1.1;
        throttle = 0.45;
      }
      // Steer around rocks a few lengths ahead.
      if (!world.clearAt(s.x + Math.cos(want) * 4, s.z + Math.sin(want) * 4, 1)) want += 1.3 * e.roam;
      e.ship.update(dt, t, want, throttle);
      world.collide(s);
    }
    separate(p);

    // Health bars float above pirates that have been hit.
    for (const e of list) {
      const s = e.ship.state;
      const show = s.hp < s.maxHp && s.sinking < 0;
      e.bar.style.display = show ? '' : 'none';
      if (!show) continue;
      const v = e.ship.root.position.clone().setY(3.3).project(camera);
      e.bar.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -50%)`;
      e.bar.firstChild.style.width = (100 * s.hp) / s.maxHp + '%';
    }
  }

  // Ships push each other apart instead of overlapping.
  function separate(p) {
    const ships = [p, ...list.map((e) => e.ship.state)].filter((s) => s.sinking < 0);
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i], b = ships[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= 2.4 || d === 0) continue;
        const push = (2.4 - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }

  // A player's cannonball at (x, y, z): damage the pirate it touches. Returns true if it hit one.
  function hitAt(x, y, z, damage) {
    const e = list.find((e) => e.ship.touches(x, y, z));
    if (!e) return false;
    const s = e.ship.state;
    fx.shipHit(x, y, z);
    sfx.crack();
    if (e.ship.hurt(damage)) {
      sfx.sink();
      loot.drop(s.x, s.z, 4 + Math.floor(Math.random() * 3));
    }
    return true;
  }

  function clear() {
    [...list].forEach(drop);
    spawnTimer = 6;
  }

  return { update, hitAt, clear, list };
}
