// The Kraken: the boss at Skull Rock.
// A tentacle bursts up where the water ripples, rears back while a red strip shows where it will land,
// then slams down along it and lies there for a moment (that's when to shoot it).
// Beat every tentacle and the head comes up in the middle, squirting ink: shoot it before it dives.
// Each round its tentacles grow back weaker, until the head is beaten.
import * as THREE from 'three';
import { toon, flat } from './stage.js';
import { sfx } from './audio.js';
import { SHELL_RADIUS } from './effects.js';

const SEG = new THREE.SphereGeometry(1, 10, 8);
const RING = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2);
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
const skin = toon(0x8e55b0), tip = toon(0xf0b4d8), white = toon(0xffffff), dark = toon(0x1d2326), belly = toon(0xb98ad0);

const N = 9, LEN = 0.85; // tentacle segments and the gap between them
const T = { ripple: 1.2, rise: 0.5, aim: 0.7, slam: 0.22, down: 3, sink: 0.8 }; // a tentacle's attack, in seconds
const TENTACLES = 4, TENTACLE_HP = [26, 16], HEAD_HP = 80, HEAD_UP = 8;
const DAMAGE = { slam: 16, burst: 8, spit: 12 };
const BUSY = [2, 3]; // tentacles attacking at once: in the first round, then later rounds
const GAP = { first: 2, less: 0.3, least: 1.2 }; // seconds between attacks: drops each round, down to `least`
const SPIT = { every: 2.2, flight: 1.5 }; // while its head is up, it spits ink balls at you
const ease = (u) => u * u * (3 - 2 * u);
const ball = new THREE.Vector3();

// api: hurtPlayer(amount, x, y, z), ink(), shake(amount). loot: for the gold it drops.
export function createKraken(scene, fx, loot, api) {
  const root = new THREE.Group();
  scene.add(root);
  const tentacles = Array.from({ length: TENTACLES }, makeTentacle);
  const head = makeHead();
  let round = 0, next = 2, phase = 'tentacles', phaseTime = 0, inked = 0, spit = 0;
  const bar = document.getElementById('boss');
  bar.querySelector('b').textContent = 'The Kraken';
  bar.classList.add('on');
  drawBar();

  // ---------- tentacles ----------

  function makeTentacle() {
    const group = new THREE.Group();
    const segs = Array.from({ length: N }, (_, i) => {
      const m = new THREE.Mesh(SEG, i === N - 1 ? tip : skin);
      m.scale.setScalar(0.62 - i * 0.045);
      group.add(m);
      return m;
    });
    const ripple = new THREE.Mesh(RING, flat(0, 0x3a1f52));
    const strip = new THREE.Mesh(STRIP, flat(0, 0xff4a3a));
    strip.scale.set(N * LEN, 1, 1.8);
    group.visible = ripple.visible = strip.visible = false;
    root.add(group, ripple, strip);
    return { group, segs, ripple, strip, state: 'idle', t: 0, x: 0, z: 0, dir: 0, hp: TENTACLE_HP[0], maxHp: TENTACLE_HP[0], wave: Math.random() * 6 };
  }

  // Lay the segments out: from the base at (x, baseY, z), bent `bend` radians from upright toward `dir`.
  function pose(k, baseY, bend, curl, t) {
    const dx = Math.cos(k.dir), dz = Math.sin(k.dir);
    let x = k.x, y = baseY, z = k.z;
    k.segs.forEach((m, i) => {
      m.position.set(x, y, z);
      const a = bend + curl * (i / N) + Math.sin(t * 2.4 + i * 0.6 + k.wave) * 0.12 * (1 - bend / 1.6);
      x += Math.sin(a) * dx * LEN;
      y += Math.cos(a) * LEN;
      z += Math.sin(a) * dz * LEN;
    });
  }

  function attack(k, p) {
    // Burst up near where the player is heading, but never right on top of the middle.
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 3;
      k.x = p.x + p.vx * 0.8 + Math.cos(a) * d;
      k.z = p.z + p.vz * 0.8 + Math.sin(a) * d;
      const r = Math.hypot(k.x, k.z);
      if (r > 21) { k.x *= 21 / r; k.z *= 21 / r; }
      if (Math.hypot(k.x, k.z) > 4) break;
    }
    k.state = 'ripple';
    k.t = 0;
    k.ripple.position.set(k.x, 0.06, k.z);
    k.ripple.visible = true;
    sfx.rumble();
  }

  function updateTentacle(k, dt, t, p) {
    if (k.state === 'idle' || k.state === 'gone') return;
    k.t += dt;
    const u = (len) => Math.min(1, k.t / len);
    if (k.state === 'ripple') {
      k.ripple.scale.setScalar(1 + ((k.t * 2.5) % 1) * 2.2);
      k.ripple.material.opacity = 0.55 * (1 - ((k.t * 2.5) % 1));
      if (Math.random() < dt * 10) fx.bubble(k.x, k.z);
      if (k.t >= T.ripple) {
        k.state = 'rise';
        k.t = 0;
        k.ripple.visible = false;
        k.group.visible = true;
        k.dir = Math.atan2(p.z - k.z, p.x - k.x); // will slam toward where you are now
        fx.splash(k.x, k.z, 1.6);
        sfx.splashBig();
        if (Math.hypot(p.x - k.x, p.z - k.z) < 1.9) api.hurtPlayer(DAMAGE.burst, p.x, 1, p.z);
      }
    } else if (k.state === 'rise') {
      pose(k, -N * LEN * (1 - ease(u(T.rise))), 0, 0.3, t);
      if (k.t >= T.rise) { k.state = 'aim'; k.t = 0; k.strip.visible = true; }
    } else if (k.state === 'aim') { // rears back; the red strip shows where it will land
      pose(k, 0, -0.35 * ease(u(T.aim)), 0.5, t);
      k.strip.position.set(k.x, 0.07, k.z);
      k.strip.rotation.y = -k.dir;
      k.strip.material.opacity = 0.4 + 0.2 * Math.sin(t * 18);
      if (k.t >= T.aim) { k.state = 'slam'; k.t = 0; }
    } else if (k.state === 'slam') {
      pose(k, 0, -0.35 + (Math.PI / 2 + 0.35) * u(T.slam) ** 2, 0.5 * (1 - u(T.slam)), t);
      if (k.t >= T.slam) {
        k.state = 'down';
        k.t = 0;
        k.strip.visible = false;
        const dx = Math.cos(k.dir), dz = Math.sin(k.dir);
        for (let i = 1; i <= 3; i++) fx.splash(k.x + dx * i * 2.4, k.z + dz * i * 2.4, 1.2);
        sfx.slam();
        api.shake(0.5);
        // Was the player lying along the strip?
        const along = Math.max(0, Math.min(N * LEN, (p.x - k.x) * dx + (p.z - k.z) * dz));
        if (Math.hypot(p.x - k.x - dx * along, p.z - k.z - dz * along) < 1.8) api.hurtPlayer(DAMAGE.slam, p.x, 1, p.z);
      }
    } else if (k.state === 'down') { // lying on the water, wriggling: shoot it now
      pose(k, 0, Math.PI / 2 - 0.08, -0.25 + Math.sin(t * 3) * 0.1, t);
      if (k.t >= T.down) { k.state = 'sink'; k.t = 0; }
    } else if (k.state === 'sink' || k.state === 'beaten') {
      const len = k.state === 'beaten' ? 1.2 : T.sink;
      pose(k, -N * LEN * ease(u(len)), Math.PI / 2 * (1 - u(len)) + 0.2, 0.3, t * (k.state === 'beaten' ? 3 : 1));
      if (k.t >= len) {
        k.group.visible = false;
        k.state = k.state === 'beaten' ? 'gone' : 'idle';
      }
    }
  }

  // ---------- the head ----------

  function makeHead() {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(SEG, skin);
    dome.scale.set(2.6, 2.9, 2.6);
    const under = new THREE.Mesh(SEG, belly);
    under.scale.set(2.7, 1.2, 2.7);
    under.position.y = -1.2;
    g.add(dome, under);
    // Two big eyes facing the camera's side.
    const eyes = [-1, 1].map((side) => {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(SEG, white);
      ball.scale.setScalar(0.75);
      const pupil = new THREE.Mesh(SEG, dark);
      pupil.scale.setScalar(0.38);
      pupil.position.z = 0.48;
      eye.add(ball, pupil);
      eye.position.set(side * 1.05, 0.5, 2.25);
      g.add(eye);
      return eye;
    });
    const pivot = new THREE.Group();
    pivot.add(g);
    pivot.position.y = -6;
    pivot.visible = false;
    root.add(pivot);
    return { pivot, g, eyes, hp: HEAD_HP, y: -6 };
  }

  function updateHead(dt, t, p) {
    // Face the player.
    head.pivot.rotation.y = Math.atan2(p.x, p.z); // the eyes are on its +z side
    head.g.rotation.z = Math.sin(t * 1.3) * 0.05;
    head.eyes.forEach((e, i) => e.scale.y = Math.sin(t * 0.9 + i * 0.2) > 0.97 ? 0.15 : 1); // blinks
    const up = phase === 'head' ? (phaseTime < 1.2 ? ease(phaseTime / 1.2) : 1) : phase === 'dive' ? 1 - ease(Math.min(1, phaseTime)) : phase === 'beaten' ? 1 - Math.min(1, phaseTime / 3) : 0;
    head.y = -6 + up * 6.6;
    head.pivot.position.y = head.y + Math.sin(t * 1.6) * 0.15;
    head.pivot.visible = head.y > -5.9;
    if (phase === 'beaten') head.pivot.rotation.z = Math.min(0.6, phaseTime * 0.3);
    // Ships can't sail through it while it's up.
    if (head.y > -2 && p.sinking < 0) {
      const d = Math.hypot(p.x, p.z);
      if (d < 3.6 && d > 0) { p.x *= 3.6 / d; p.z *= 3.6 / d; }
    }
  }

  // ---------- the fight ----------

  function update(dt, t, p) {
    phaseTime += dt;
    if (phase === 'tentacles') {
      next -= dt;
      const busy = tentacles.filter((k) => k.state !== 'idle' && k.state !== 'gone').length;
      const ready = tentacles.filter((k) => k.state === 'idle');
      if (next <= 0 && busy < BUSY[Math.min(1, round)] && ready.length && p.sinking < 0) {
        attack(ready[Math.floor(Math.random() * ready.length)], p);
        next = Math.max(GAP.least, GAP.first - round * GAP.less);
      }
      if (tentacles.every((k) => k.state === 'gone')) {
        phase = 'head';
        phaseTime = 0;
        inked = 0;
        sfx.roar();
        api.shake(0.6);
        fx.splash(0, 0, 3.5);
      }
    } else if (phase === 'head') {
      if (phaseTime > 1.4 && inked === 0 || phaseTime > 5.5 && inked === 1) { inked++; api.ink(); sfx.ink(); }
      spit -= dt;
      if (spit <= 0 && phaseTime > 1.2 && p.sinking < 0) { // an ink ball lobbed at where you're heading
        spit = SPIT.every;
        const tx = p.x + p.vx * SPIT.flight * 0.6 + (Math.random() - 0.5) * 2, tz = p.z + p.vz * SPIT.flight * 0.6 + (Math.random() - 0.5) * 2;
        fx.lob(0, 0, tx, tz, SPIT.flight, (x, z) => {
          if (p.sinking < 0 && Math.hypot(p.x - x, p.z - z) < SHELL_RADIUS + 0.6) api.hurtPlayer(DAMAGE.spit, p.x, 1, p.z);
        });
        sfx.ink();
      }
      if (Math.random() < dt * 4) fx.bubble((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      if (phaseTime > HEAD_UP) { phase = 'dive'; phaseTime = 0; sfx.splashBig(); }
    } else if (phase === 'dive' && phaseTime > 1.2) { // tentacles grow back, a little weaker
      round++;
      tentacles.forEach((k) => { k.state = 'idle'; k.maxHp = k.hp = TENTACLE_HP[1]; });
      phase = 'tentacles';
      next = 1.5;
    } else if (phase === 'beaten') {
      if (Math.random() < dt * 14) fx.bubble((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
    }
    tentacles.forEach((k) => updateTentacle(k, dt, t, p));
    updateHead(dt, t, p);
    drawBar();
  }

  // A player's cannonball at (x, y, z). Returns true if it hit the Kraken.
  function hitAt(x, y, z, amount) {
    if ((phase === 'head' && phaseTime > 0.6) && y < head.y + 3 && Math.hypot(x, z) < 2.9) {
      fx.shipHit(x, y, z, 0x8e55b0);
      sfx.squish();
      head.hp = Math.max(0, head.hp - amount);
      if (head.hp === 0) {
        phase = 'beaten';
        phaseTime = 0;
        sfx.roar();
        sfx.sink();
        api.shake(0.8);
        loot.drop(0, 0, 30);
        loot.crate(2, 2);
        loot.crate(-2, -2);
      }
      return true;
    }
    ball.set(x, y, z);
    for (const k of tentacles) {
      if (!['rise', 'aim', 'slam', 'down'].includes(k.state)) continue;
      if (!k.segs.some((m) => m.position.y > -0.6 && m.position.distanceTo(ball) < m.scale.x + 0.35)) continue;
      fx.shipHit(x, y, z, 0x8e55b0);
      sfx.squish();
      k.hp -= amount;
      if (k.hp <= 0) {
        k.state = 'beaten';
        k.t = 0;
        k.strip.visible = false;
        sfx.splashBig();
        const end = k.segs[N - 1].position;
        loot.drop(end.x, end.z, 3);
      }
      return true;
    }
    return false;
  }

  // The bar at the top: the head's health, and a dot for each tentacle still fighting this round.
  function drawBar() {
    bar.querySelector('i').style.width = (100 * head.hp) / HEAD_HP + '%';
    bar.querySelector('.pips').innerHTML = tentacles.map((k) => `<span class="${k.state === 'gone' || k.state === 'beaten' ? 'out' : ''}"></span>`).join('');
  }

  function remove() {
    scene.remove(root);
    bar.classList.remove('on');
    tentacles.forEach((k) => { k.ripple.material.dispose(); k.strip.material.dispose(); });
  }

  return { update, hitAt, remove, beaten: () => phase === 'beaten' && phaseTime > 2 };
}
