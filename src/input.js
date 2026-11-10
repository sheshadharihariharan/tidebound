// Touch thumbstick, fire buttons and keyboard, folded into one `input` object.
// x is right and y is up on the screen, each from -1 to 1.
export const input = { x: 0, y: 0, onFire: () => {} };

const zone = document.getElementById('zone');
const stick = document.getElementById('stick');
const knob = document.getElementById('knob');
const hint = document.getElementById('hint');
const RADIUS = 56;
let touch = null; // { id, ox, oy }: where the finger first landed
let sx = 0, sy = 0;
const keys = new Set();

function drag(e) {
  const dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
  const len = Math.hypot(dx, dy);
  const k = len > RADIUS ? RADIUS / len : 1;
  knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  sx = (dx * k) / RADIUS;
  sy = (-dy * k) / RADIUS;
}
zone.addEventListener('pointerdown', (e) => {
  if (touch) return;
  zone.setPointerCapture(e.pointerId);
  touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
  stick.style.left = e.clientX + 'px';
  stick.style.top = e.clientY + 'px';
  stick.classList.add('on');
  hint.classList.add('gone');
  drag(e);
});
zone.addEventListener('pointermove', (e) => touch?.id === e.pointerId && drag(e));
const release = (e) => {
  if (touch?.id !== e.pointerId) return;
  touch = null;
  sx = sy = 0;
  knob.style.transform = '';
  stick.classList.remove('on');
};
zone.addEventListener('pointerup', release);
zone.addEventListener('pointercancel', release);

for (const [id, side] of [['fireL', 'left'], ['fireR', 'right']]) {
  document.getElementById(id).addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.onFire(side);
  });
}

// PC: WASD or arrows steer, Q fires left, E fires right.
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'q' || k === 'e') { if (!e.repeat) input.onFire(k === 'q' ? 'left' : 'right'); return; }
  keys.add(k);
  hint.classList.add('gone');
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault()); // no pinch-zoom on iOS

export function readInput() {
  if (touch) { input.x = sx; input.y = sy; return; }
  const has = (...n) => n.some((k) => keys.has(k));
  const x = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
  const y = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  input.x = x / len;
  input.y = y / len;
}
