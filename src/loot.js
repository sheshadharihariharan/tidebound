// Things that float where an enemy sank: gold coins, and sometimes a repair crate.
// Sail close and they fly to you.
import * as THREE from 'three';
import { toon } from './stage.js';
import { sfx } from './audio.js';

const COIN = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14).rotateX(Math.PI / 2);
const COIN_MAT = toon(0xffc93c);
const BOX = new THREE.BoxGeometry(0.8, 0.6, 0.8);
const BAR = new THREE.BoxGeometry(0.56, 0.05, 0.16);
const BOX_MAT = toon(0xb07a45), PLUS_MAT = toon(0x5bd16a);
const CHEST = new THREE.BoxGeometry(1.2, 0.6, 0.8);
const LID = new THREE.BoxGeometry(1.2, 0.3, 0.8).translate(0, 0.15, 0.4); // hinged at the back edge
const BAND = new THREE.BoxGeometry(1.24, 0.1, 0.84);
const CHEST_MAT = toon(0x8a5a33), BAND_MAT = toon(0xffc93c);
const VALUE = 5, LIFE = 30;
export const REPAIR = 25; // hull points a crate gives back

// A wooden crate with a green plus on the lid.
function crateModel() {
  const g = new THREE.Group();
  const lid = new THREE.Mesh(BAR, PLUS_MAT), cross = new THREE.Mesh(BAR, PLUS_MAT);
  lid.position.y = cross.position.y = 0.31;
  cross.rotation.y = Math.PI / 2;
  g.add(new THREE.Mesh(BOX, BOX_MAT), lid, cross);
  return g;
}

// A treasure chest with a gold band; the lid swings open.
function chestModel() {
  const g = new THREE.Group(), lid = new THREE.Group();
  const band = new THREE.Mesh(BAND, BAND_MAT);
  band.position.y = 0.05;
  lid.position.set(0, 0.3, -0.4);
  lid.add(new THREE.Mesh(LID, BAND_MAT)); // a gold lid, so it reads as treasure from afar
  g.add(new THREE.Mesh(CHEST, CHEST_MAT), band, lid);
  g.scale.setScalar(1.25);
  return { g, lid };
}

export function createLoot(scene) {
  const items = new Set(), chests = new Set();
  const marks = document.getElementById('marks');
  let magnet = 4;

  function add(m, x, z, delay, crate) {
    scene.add(m);
    items.add({ m, x, z, age: -delay, phase: Math.random() * 6, crate });
  }

  // A chest in a treasure cove holding `coins` coins. It opens when you sail up to it.
  function chest(x, z, coins) {
    const { g, lid } = chestModel();
    g.position.set(x, 0.1, z);
    g.rotation.y = Math.random() * 6;
    scene.add(g);
    const mark = document.createElement('div');
    mark.className = 'mark';
    marks.append(mark);
    chests.add({ g, lid, x, z, coins, open: -1, phase: Math.random() * 6, mark });
  }

  // Chests: bob until opened, then the lid swings up, gold spills out, and the chest sinks away.
  function updateChests(dt, t, p, camera) {
    let opened = 0;
    for (const c of chests) {
      if (c.open < 0) {
        c.g.position.y = 0.1 + Math.sin(t * 2 + c.phase) * 0.08;
        if (p.sinking < 0 && Math.hypot(p.x - c.x, p.z - c.z) < 2) {
          c.open = 0;
          opened++;
          drop(c.x, c.z, c.coins);
          sfx.chest();
          c.mark.remove();
        } else {
          pointAt(c, camera);
        }
        continue;
      }
      c.open += dt;
      c.lid.rotation.x = -Math.min(1.3, c.open * 5);
      c.g.position.y = 0.1 - Math.max(0, c.open - 1.5) * 0.8;
      if (c.open > 3) {
        scene.remove(c.g);
        chests.delete(c);
      }
    }
    return opened;
  }

  // An arrow at the edge of the screen when a closed chest is out of sight.
  const v = new THREE.Vector3();
  function pointAt(c, camera) {
    v.set(c.x, 0.5, c.z).project(camera);
    const inside = Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
    c.mark.style.display = inside ? 'none' : '';
    if (inside) return;
    const a = Math.atan2(-v.y, v.x), k = 1 / Math.max(Math.abs(v.x) / 0.9, Math.abs(v.y) / 0.82);
    const sx = ((v.x * k + 1) / 2) * innerWidth, sy = ((1 - v.y * k) / 2) * innerHeight;
    c.mark.style.transform = `translate(${sx}px, ${sy}px) rotate(${a}rad) translate(-11px, -13px)`;
  }

  function drop(x, z, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random(), d = 0.6 + Math.random() * 1.6;
      add(new THREE.Mesh(COIN, COIN_MAT), x + Math.cos(a) * d, z + Math.sin(a) * d, i * 0.08, false);
    }
  }

  const crate = (x, z) => add(crateModel(), x, z, 0.3, true);

  // Returns what was picked up this frame: { gold, repair, chests (how many opened) }.
  // all: everything flies to the ship (the battle is won).
  function update(dt, t, p, camera, all = false) {
    const got = { gold: 0, repair: 0, chests: updateChests(dt, t, p, camera) };
    for (const c of items) {
      c.age += dt;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (p.sinking < 0 && (d < magnet || all) && c.age > 0.6 && d > 0) {
        const pull = Math.min(d, dt * (all ? 10 + d * 2 : 6 + Math.max(0, 4 - d) * 4 + (magnet - 4)));
        c.x += (dx / d) * pull;
        c.z += (dz / d) * pull;
      }
      if (p.sinking < 0 && d < 1.3 && c.age > 0.6) {
        if (c.crate) {
          got.repair += REPAIR;
          sfx.repair();
        } else {
          got.gold += VALUE;
          sfx.coin();
        }
      } else if (c.age < LIFE) {
        const pop = Math.min(1, Math.max(0, c.age) * 3); // pops up out of the water
        c.m.position.set(c.x, (c.crate ? 0.2 : 0.35) + Math.sin(t * 3 + c.phase) * 0.08 + (1 - pop) * -0.5, c.z);
        c.m.rotation.y = c.crate ? Math.sin(t + c.phase) * 0.4 : t * 2.5 + c.phase;
        c.m.visible = c.age > 0 && (c.age < LIFE - 5 || Math.sin(t * 20) > 0); // blinks before it's gone
        continue;
      }
      scene.remove(c.m);
      items.delete(c);
    }
    return got;
  }

  function clear() {
    items.forEach((c) => scene.remove(c.m));
    items.clear();
    chests.forEach((c) => { scene.remove(c.g); c.mark.remove(); });
    chests.clear();
  }

  const chestsLeft = () => [...chests].filter((c) => c.open < 0).length;
  const setMagnet = (range) => { magnet = range; };
  return { drop, crate, chest, update, clear, chestsLeft, setMagnet };
}
