// One battle: enemies come in waves, each harder than the last. Sink them all to win.
import { sfx } from './audio.js';

const WAVES = [
  ['sloop', 'sloop'],
  ['sloop', 'gunboat', 'shark'],
  ['turtle', 'gunboat', 'sloop', 'shark'],
];

// show.banner(text, small): a message in the middle. show.end(won): the battle is over.
export function createBattle(enemies, show) {
  let wave, queue, timer, state;

  function start() {
    wave = -1;
    nextWave(1);
  }

  function nextWave(delay) {
    wave++;
    queue = [...WAVES[wave]];
    timer = delay;
    state = 'intro';
  }

  // p: the player's ship state.
  function update(dt, p) {
    if (state === 'over') return;
    timer -= dt;
    if (p.sinking > 2.5 && state !== 'won') { // lost
      state = 'over';
      sfx.defeat();
      show.end(false);
      return;
    }
    if (state === 'intro') {
      if (timer > 0) return;
      show.banner(`Wave ${wave + 1} of ${WAVES.length}`, wave === WAVES.length - 1 ? 'Last wave!' : 'Sink them all!');
      sfx.wave();
      state = 'spawning';
      timer = 1;
    } else if (state === 'spawning') {
      if (timer > 0) return;
      enemies.spawn(queue.shift(), p);
      timer = 1.4;
      if (!queue.length) state = 'fighting';
    } else if (state === 'fighting' && enemies.alive() === 0 && p.sinking < 0) {
      if (wave < WAVES.length - 1) {
        nextWave(2.5);
      } else {
        state = 'won';
        timer = 2.5;
        enemies.disarm();
        show.banner('Victory!', 'Gathering the gold…');
        sfx.victory();
      }
    } else if (state === 'won' && timer <= 0) {
      state = 'over';
      show.end(true);
    }
  }

  return { start, update, won: () => state === 'won' };
}
