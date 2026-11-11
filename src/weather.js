// Storm Belt weather: rain, lightning flashes, wind gusts that push every ship sideways
// (a gold arrow warns which way first), and sometimes a waterspout that wanders the bay,
// pulling ships in and battering anything in its middle.
import * as THREE from 'three';
import { flat } from './stage.js';
import { sfx, setRain } from './audio.js';

const GUST = { every: [8, 13], warn: 1.5, last: 2.5, push: 6 }; // seconds; push in units a second, every second
const SPOUT = { pull: 7, core: 2, pullSpeed: 5, damage: 6, speed: 2.2, roam: 17 };
const FUNNEL = new THREE.CylinderGeometry(1.7, 0.5, 8, 16, 1, true).translate(0, 4, 0);
const RING = new THREE.RingGeometry(1, 1.4, 24).rotateX(-Math.PI / 2);

// api: hurtPlayer(amount, x, y, z).
export function createWeather(scene, fx, api) {
  const $ = (id) => document.getElementById(id);
  let on = false, gust = 0, gustState = 'calm', gustDir = 0, flash = 6;
  let spout = null;
  const v = new THREE.Vector3(), w = new THREE.Vector3();

  function makeSpout() {
    const g = new THREE.Group();
    const layers = [0.8, 0.5].map((o, i) => {
      const funnel = new THREE.Mesh(FUNNEL, flat(o * 0.6, 0xe8f4f8));
      funnel.material.side = THREE.DoubleSide;
      funnel.scale.setScalar(1 - i * 0.25);
      g.add(funnel);
      return funnel;
    });
    const spray = new THREE.Mesh(RING, flat(0.6));
    spray.position.y = 0.06;
    g.add(spray);
    scene.add(g);
    const a = Math.random() * 6.28;
    return { g, layers, spray, x: Math.cos(a) * 12, z: Math.sin(a) * 12, dir: a + Math.PI, hurt: 0 };
  }

  // A stop at sea begins. storm: is this the Storm Belt? spoutToo: add a waterspout.
  function start(storm, spoutToo = false) {
    stop();
    on = storm;
    if (!on) return;
    $('rain').classList.add('on');
    setRain(1);
    gust = GUST.every[0];
    if (spoutToo) spout = makeSpout();
  }

  function stop() {
    on = false;
    $('rain').classList.remove('on');
    $('wind').classList.remove('on');
    setRain(0);
    if (spout) {
      scene.remove(spout.g);
      spout.layers.forEach((l) => l.material.dispose());
      spout.spray.material.dispose();
      spout = null;
    }
  }

  // ships: the state of every ship that gets pushed and pulled (the player's first). camera: to point the wind arrow.
  function update(dt, t, ships, camera) {
    if (!on) return;
    const p = ships[0];
    // Lightning now and then, with thunder a moment later.
    flash -= dt;
    if (flash <= 0) {
      flash = 7 + Math.random() * 12;
      $('flash').classList.remove('on');
      void $('flash').offsetWidth;
      $('flash').classList.add('on');
      setTimeout(sfx.thunder, 300 + Math.random() * 600);
    }

    // Wind: warn with the arrow, then push everyone the same way.
    gust -= dt;
    if (gustState === 'calm' && gust <= 0) {
      gustState = 'warn';
      gust = GUST.warn;
      gustDir = Math.random() * Math.PI * 2;
      $('wind').classList.add('on');
      sfx.gust();
    } else if (gustState === 'warn' && gust <= 0) {
      gustState = 'blow';
      gust = GUST.last;
    } else if (gustState === 'blow') {
      for (const s of ships) {
        if (s.sinking >= 0) continue;
        s.vx += Math.cos(gustDir) * GUST.push * dt;
        s.vz += Math.sin(gustDir) * GUST.push * dt;
      }
      if (Math.random() < dt * 20) fx.puff(p.x + (Math.random() - 0.5) * 16, 0.3, p.z + (Math.random() - 0.5) * 16, 0.5);
      if (gust <= 0) {
        gustState = 'calm';
        gust = GUST.every[0] + Math.random() * (GUST.every[1] - GUST.every[0]);
        $('wind').classList.remove('on');
      }
    }
    if (gustState !== 'calm') { // turn the arrow to the wind's direction on screen
      v.set(p.x, 0, p.z).project(camera);
      w.set(p.x + Math.cos(gustDir), 0, p.z + Math.sin(gustDir)).project(camera);
      $('wind').style.transform = `translateX(-50%) rotate(${Math.atan2(-(w.y - v.y), w.x - v.x)}rad)`;
      $('wind').classList.toggle('blow', gustState === 'blow');
    }

    if (spout) updateSpout(dt, t, ships, p);
  }

  function updateSpout(dt, t, ships, p) {
    const s = spout;
    // Wander about the bay, turning back toward the middle near the edge.
    s.dir += (Math.random() - 0.5) * dt * 1.5;
    if (Math.hypot(s.x, s.z) > SPOUT.roam) s.dir = Math.atan2(-s.z, -s.x) + (Math.random() - 0.5);
    s.x += Math.cos(s.dir) * SPOUT.speed * dt;
    s.z += Math.sin(s.dir) * SPOUT.speed * dt;
    s.g.position.set(s.x, 0, s.z);
    s.layers.forEach((l, i) => { l.rotation.y = t * (3 + i * 2); });
    s.spray.scale.setScalar(1.6 + Math.sin(t * 6) * 0.2);
    if (Math.random() < dt * 10) fx.splash(s.x + (Math.random() - 0.5) * 2, s.z + (Math.random() - 0.5) * 2, 0.6);
    // Pull every ship in, spinning it around; batter the player in the middle.
    for (const sh of ships) {
      if (sh.sinking >= 0) continue;
      const dx = s.x - sh.x, dz = s.z - sh.z, d = Math.hypot(dx, dz);
      if (d > SPOUT.pull || d === 0) continue;
      const k = SPOUT.pullSpeed * (1 - d / SPOUT.pull) * dt;
      sh.vx += (dx / d) * k - (dz / d) * k * 0.8;
      sh.vz += (dz / d) * k + (dx / d) * k * 0.8;
    }
    s.hurt -= dt;
    if (p.sinking < 0 && Math.hypot(s.x - p.x, s.z - p.z) < SPOUT.core && s.hurt <= 0) {
      s.hurt = 0.5;
      api.hurtPlayer(SPOUT.damage / 2, p.x, 1, p.z);
    }
  }

  return { start, stop, update };
}
