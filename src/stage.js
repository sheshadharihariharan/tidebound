// Renderer, isometric camera, lights and cartoon outlines.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';

export const SEA = 0x2aa6b8;
export const TOUCH = matchMedia('(pointer: coarse)').matches;
const VIEW = 18; // world units shown from top to bottom of the screen

// Toon shading: three flat light bands instead of smooth shading.
const bands = new Uint8Array([100, 175, 255]);
const ramp = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });

// Flat see-through marking on the water (foam, aim arcs): no outline.
export function flat(opacity, color = 0xffffff) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  m.userData.outlineParameters = { visible: false };
  return m;
}

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2)); // lighter on phones
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.0055, defaultColor: [0.06, 0.18, 0.22] });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SEA);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a8fa0, 1.7));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
  sun.position.set(-8, 14, 6);
  scene.add(sun);

  // The sea surface: the same colour as the background, so it can't be seen, but it hides
  // whatever is under the water (a sinking hull, a diving shark, a tentacle about to burst up).
  const seaMat = new THREE.MeshBasicMaterial({ color: SEA });
  seaMat.userData.outlineParameters = { visible: false };
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), seaMat);
  scene.add(surface);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    camera.left = (-VIEW * w) / h / 2;
    camera.right = (VIEW * w) / h / 2;
    camera.top = VIEW / 2;
    camera.bottom = -VIEW / 2;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // Looks at `focus` along (1,1,1): true isometric.
  const look = (focus) => {
    camera.position.set(focus.x + 30, focus.y + 30, focus.z + 30);
    camera.lookAt(focus);
    surface.position.set(focus.x, 0, focus.z);
  };
  // Each voyage's sea has its own colour.
  const setSea = (color) => {
    scene.background.set(color);
    seaMat.color.set(color);
    document.documentElement.style.setProperty('--sea', '#' + new THREE.Color(color).getHexString());
  };
  return { scene, camera, look, setSea, render: () => outline.render(scene, camera), renderer };
}
