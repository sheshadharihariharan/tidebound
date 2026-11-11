// The sea: a rock-fenced battle arena with rocks and small islands built from a seed,
// plus drifting foam dashes so the water looks like it is moving.
import * as THREE from 'three';
import { toon, flat } from './stage.js';

const ROCK = new THREE.IcosahedronGeometry(1, 0);
const RING = new THREE.RingGeometry(1, 1.45, 24).rotateX(-Math.PI / 2);
const SAND = new THREE.CylinderGeometry(0.9, 1, 0.6, 14);
const GRASS = new THREE.CylinderGeometry(0.62, 0.72, 0.4, 12);
const TRUNK = new THREE.CylinderGeometry(0.1, 0.17, 2.2, 6);
const LEAF = new THREE.SphereGeometry(1, 6, 4);
const rockMats = [0x8a8f99, 0x7b8089, 0x9a948b].map((c) => toon(c));
const sandMat = toon(0xf2d49b), grassMat = toon(0x4fae55), trunkMat = toon(0x7a5230), leafMat = toon(0x2f9a4a);
const foamMat = flat(0.55);

// Same seed, same rocks, every time.
function seeded(i, j) {
  let a = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function palm(x, z, rnd) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK, trunkMat);
  trunk.position.y = 1.1;
  trunk.rotation.z = (rnd() - 0.5) * 0.3;
  g.add(trunk);
  for (let k = 0; k < 5; k++) {
    const arm = new THREE.Group();
    arm.position.set(trunk.rotation.z * -1.1, 2.2, 0);
    arm.rotation.y = (k / 5) * Math.PI * 2;
    const leaf = new THREE.Mesh(LEAF, leafMat);
    leaf.scale.set(0.8, 0.1, 0.28);
    leaf.position.set(0.7, -0.1, 0);
    leaf.rotation.z = -0.35;
    arm.add(leaf);
    g.add(arm);
  }
  g.position.set(x, 0.3, z);
  return g;
}

// The battle arena: a ring of rocks fencing in a stretch of sea, with a few rocks and islands inside.
// Ships start in the middle; build(seed) makes a new arena, the same one for the same seed.
export const ARENA = 28; // radius of the rock fence
const CLEAR = 7; // open water kept around the middle

export function createWorld(scene) {
  let group = new THREE.Group(), hits = [], rings = [];
  scene.add(group);

  function rock(x, z, r, rnd) {
    const m = new THREE.Mesh(ROCK, rockMats[Math.floor(rnd() * 3)]);
    m.scale.set(r, r * 0.8, r);
    m.position.set(x, r * 0.25, z);
    m.rotation.y = rnd() * 6;
    const ring = new THREE.Mesh(RING, foamMat);
    ring.position.set(x, 0.03, z);
    group.add(m, ring);
    rings.push({ ring, r: r * 1.05, phase: rnd() * 6 });
    hits.push({ x, z, r: r * 0.95, top: r * 1.05, kind: 'rock' });
  }

  function island(x, z, R, rnd) {
    const sand = new THREE.Mesh(SAND, sandMat);
    sand.scale.set(R, 1, R);
    sand.position.set(x, 0.1, z);
    const grass = new THREE.Mesh(GRASS, grassMat);
    grass.scale.set(R, 1, R);
    grass.position.set(x, 0.5, z);
    const ring = new THREE.Mesh(RING, foamMat);
    ring.position.set(x, 0.03, z);
    group.add(sand, grass, ring);
    rings.push({ ring, r: R * 1.02, phase: rnd() * 6 });
    for (let n = 1 + Math.floor(rnd() * 3); n > 0; n--) {
      const a = rnd() * 6.28, d = rnd() * R * 0.4;
      group.add(palm(x + Math.cos(a) * d, z + Math.sin(a) * d, rnd));
    }
    hits.push({ x, z, r: R * 0.95, top: 1, kind: 'island' });
  }

  function build(seed) {
    scene.remove(group);
    group = new THREE.Group();
    hits = [];
    rings = [];
    scene.add(group);
    const rnd = seeded(seed, 1);
    // The fence: big rocks close enough together that no ship fits between them.
    const n = 48, turn = rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2, d = ARENA + (rnd() - 0.5) * 1.5;
      rock(Math.cos(a) * d, Math.sin(a) * d, 1.8 + rnd() * 0.8, rnd);
    }
    // Inside: 4 to 6 rock clusters or islands, spread out, leaving the middle open.
    const spots = [];
    for (let tries = 0, want = 4 + Math.floor(rnd() * 3); tries < 60 && spots.length < want; tries++) {
      const a = rnd() * 6.28, d = CLEAR + 4 + rnd() * (ARENA - CLEAR - 10);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 10)) continue;
      spots.push({ x, z });
      if (rnd() < 0.35) {
        island(x, z, 2.6 + rnd() * 1.2, rnd);
      } else {
        for (let k = 1 + Math.floor(rnd() * 3); k > 0; k--) rock(x + (rnd() - 0.5) * 4, z + (rnd() - 0.5) * 4, 0.9 + rnd() * 1.1, rnd);
      }
    }
  }

  function update(t) {
    for (const f of rings) f.ring.scale.setScalar(f.r * (1 + 0.05 * Math.sin(t * 1.5 + f.phase)));
  }

  // Push a ship out of rocks and bounce it. Returns how hard it hit (0 if it didn't).
  function collide(s, radius = 1) {
    let hardest = 0;
    const out = Math.hypot(s.x, s.z) - (ARENA - 1);
    if (out > 0) { // backstop in case anything squeezes through the fence
      s.x *= (ARENA - 1) / (ARENA - 1 + out);
      s.z *= (ARENA - 1) / (ARENA - 1 + out);
    }
    for (const h of hits) {
      const dx = s.x - h.x, dz = s.z - h.z, d = Math.hypot(dx, dz), min = h.r + radius;
      if (d >= min || d === 0) continue;
      const nx = dx / d, nz = dz / d, vn = s.vx * nx + s.vz * nz;
      s.x = h.x + nx * min;
      s.z = h.z + nz * min;
      if (vn < 0) {
        s.vx -= 1.3 * vn * nx;
        s.vz -= 1.3 * vn * nz;
        hardest = Math.max(hardest, -vn);
        s.hitX = h.x + nx * h.r;
        s.hitZ = h.z + nz * h.r;
      }
    }
    return hardest;
  }
  // What a cannonball at this spot and height would hit: 'rock', 'island' or null for open water.
  function solidAt(x, y, z) {
    for (const h of hits) if (y < h.top + 0.2 && Math.hypot(x - h.x, z - h.z) < h.r) return h.kind;
    return null;
  }
  // Is there open water within `margin` of (x, z)?
  function clearAt(x, z, margin) {
    if (Math.hypot(x, z) > ARENA - 2 - margin) return false;
    for (const h of hits) if (Math.hypot(x - h.x, z - h.z) < h.r + margin) return false;
    return true;
  }
  return { build, update, collide, solidAt, clearAt, hits: () => hits };
}

// Light dashes that breathe in and out across the water, wrapping around the camera.
export function createFoam(scene) {
  const N = 200, S = 70, rnd = seeded(7, 11);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 0.14), flat(1, 0x8fdce6), N);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const dash = Array.from({ length: N }, () => ({ x: rnd() * S, z: rnd() * S, phase: rnd() * 6.28, len: 0.6 + rnd() }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  const p = new THREE.Vector3(), sc = new THREE.Vector3();
  return (cx, cz, t) => {
    dash.forEach((d, i) => {
      p.set(d.x + S * Math.round((cx - d.x) / S), 0.02, d.z + S * Math.round((cz - d.z) / S));
      sc.set(d.len * (0.5 + 0.5 * Math.sin(t * 1.2 + d.phase) ** 2), 1, 1);
      mesh.setMatrixAt(i, m.compose(p, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}
