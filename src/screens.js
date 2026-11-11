// Screens drawn over the sea: the voyage chart, and the card panel used for results, the port and gear picks.
import { STOPS, STOP } from './voyage.js';
import { GEAR, gearIcon } from './gear.js';

const $ = (id) => document.getElementById(id);

const ICONS = {
  home: '<path d="M7 21V4l11 4.5L7 13"/>',
  battle: '<path d="M5 5l14 14M19 5L5 19M3.5 15.5l5 5M15.5 20.5l5-5"/>',
  treasure: '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M4 10a8 5 0 0 1 16 0M12 13v3"/>',
  port: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13M7.5 11h9M5 15a7 6 0 0 0 14 0"/>',
  final: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l-2 1v3H8v-3z"/><circle cx="9.5" cy="12" r="1.6"/><circle cx="14.5" cy="12" r="1.6"/>',
};

// ---------- the chart ----------

// steps: the route. path: index picked at each step so far. onPick(stepIndex, optionIndex).
export function showChart(steps, path, info, onPick) {
  const W = 800, H = 330, gap = (W - 120) / STOPS;
  const at = (col, i, n) => [60 + col * gap, H / 2 + 8 + (i - (n - 1) / 2) * 92];
  const next = path.length; // the step being chosen now
  const here = next === 0 ? at(0, 0, 1) : at(next, path[next - 1], steps[next - 1].length);
  let svg = '';
  // The route sailed so far: a solid line; the ways on from here: dotted.
  const trail = [at(0, 0, 1), ...path.map((p, s) => at(s + 1, p, steps[s].length))];
  svg += `<polyline class="trail" points="${trail.map((p) => p.join(',')).join(' ')}"/>`;
  if (next < STOPS) steps[next].forEach((_, i) => svg += `<line class="way" x1="${here[0]}" y1="${here[1]}" x2="${at(next + 1, i, steps[next].length)[0]}" y2="${at(next + 1, i, steps[next].length)[1]}"/>`);
  svg += node(at(0, 0, 1), 'home', 'done', 'Home');
  steps.forEach((options, s) => options.forEach((type, i) => {
    const state = s < next ? (path[s] === i ? 'done' : 'past') : s === next ? 'pick' : 'later';
    svg += node(at(s + 1, i, options.length), type, state, STOP[type].name, s, i);
  }));
  $('chart').innerHTML = `
    <h2>${next === 0 ? 'A new voyage!' : 'Choose your next stop'}</h2>
    <svg viewBox="0 0 ${W} ${H}">${svg}</svg>
    <p>Stop ${Math.min(next + 1, STOPS)} of ${STOPS} · Home chest: <b>${info.bank}</b> gold</p>`;
  $('chart').querySelectorAll('.pick').forEach((g) => g.addEventListener('click', () => onPick(+g.dataset.s, +g.dataset.i)));
  $('chart').classList.add('on');
}

function node([x, y], type, state, label, s, i) {
  const show = state === 'pick' || type === 'final' || type === 'home';
  return `<g class="node ${state} ${type}" data-s="${s}" data-i="${i}" transform="translate(${x} ${y})">
    <circle r="30" class="hit"/><circle r="26"/>
    <g transform="translate(-15 -15) scale(1.25)">${ICONS[type]}</g>
    ${show ? `<text y="50">${label}</text>` : ''}</g>`;
}

export const hideChart = () => $('chart').classList.remove('on');

// ---------- the card panel ----------

// title, text (may hold <b>), tiles: [{ icon, name, text, price, disabled, onClick }], buttons: [{ label, onClick }].
export function showPanel({ title, text = '', tiles = [], buttons = [], tone = '' }) {
  const panel = $('panel');
  panel.className = tone + (panel.classList.contains('on') ? ' on' : ''); // redraw in place, no flicker
  panel.querySelector('.card').innerHTML = `<h1>${title}</h1><p>${text}</p>
    ${tiles.length ? '<div class="tiles"></div>' : ''}<div class="buttons"></div>`;
  for (const t of tiles) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.disabled = !!t.disabled;
    b.innerHTML = `${t.icon}<b>${t.name}</b><span>${t.text}</span>${t.price != null ? `<em>${t.price} gold</em>` : ''}`;
    b.onclick = t.onClick;
    panel.querySelector('.tiles').append(b);
  }
  for (const [i, btn] of buttons.entries()) {
    const b = document.createElement('button');
    b.className = 'go';
    b.textContent = btn.label;
    b.onclick = btn.onClick;
    panel.querySelector('.buttons').append(b);
    if (i === 0 && !tiles.length) setTimeout(() => b.focus(), 50); // Enter or Space works on a keyboard
  }
  requestAnimationFrame(() => panel.classList.add('on'));
}

export const hidePanel = () => $('panel').classList.remove('on');

// A gear piece as a tile.
export const gearTile = (id, extra) => ({ icon: gearIcon(id), name: GEAR[id].name, text: GEAR[id].text, ...extra });

// Little gear icons next to the gold.
export function showGear(owned) {
  $('gear').innerHTML = [...owned].map((id) => `<i title="${GEAR[id].name}">${gearIcon(id)}</i>`).join('');
}
