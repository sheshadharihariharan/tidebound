// One stop at sea. A battle: enemies come in waves, sink them all to win.
// A treasure cove: open every chest; sometimes pirates ambush you halfway through.
import { sfx } from './audio.js';

// show.banner(text, small): a message in the middle. show.end(won): the stop is over.
export function createBattle(enemies, loot, show) {
  let waves, wave, queue, timer, state = 'over', cove;

  // waves: lists of enemy kinds. Or for a cove: waves = [] and cove = { chests, ambush (a wave, or null) }.
  // Or for Skull Rock: waves = 'kraken'.
  function start(w, c = null) {
    waves = w;
    cove = c;
    wave = -1;
    if (waves === 'kraken') {
      state = 'boss';
      enemies.summonKraken();
      show.banner('The Kraken!', 'Shoot its tentacles, then its head');
    } else if (cove) {
      state = 'cove';
      timer = 0;
      show.banner('Treasure cove', `Find all ${cove.chests} chests`);
    } else {
      nextWave(1);
    }
  }

  function nextWave(delay) {
    wave++;
    queue = [...waves[wave]];
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
      show.banner(`Wave ${wave + 1} of ${waves.length}`, wave === waves.length - 1 ? 'Last wave!' : 'Sink them all!');
      sfx.wave();
      state = 'spawning';
      timer = 1;
    } else if (state === 'spawning') {
      if (timer > 0) return;
      enemies.spawn(queue.shift(), p);
      timer = 1.4;
      if (!queue.length) state = 'fighting';
    } else if (state === 'fighting' && enemies.alive() === 0 && p.sinking < 0) {
      if (cove) state = 'cove';
      else if (wave < waves.length - 1) nextWave(2.5);
      else win('Victory!', 'Gathering the gold…');
    } else if (state === 'cove') {
      const left = loot.chestsLeft();
      if (cove.ambush && left <= cove.chests / 2) { // pirates were lying in wait
        queue = cove.ambush;
        cove.ambush = null;
        state = 'spawning';
        timer = 0.6;
        show.banner('Ambush!', 'Pirates were hiding in the cove');
        sfx.wave();
      } else if (left === 0) {
        win('Cove cleared!', 'Gathering the gold…');
      }
    } else if (state === 'boss' && enemies.krakenBeaten()) {
      win('Kraken defeated!', 'Gathering the gold…');
    } else if (state === 'won' && timer <= 0) {
      state = 'over';
      show.end(true);
    }
  }

  function win(text, small) {
    state = 'won';
    timer = 2.5;
    enemies.disarm();
    show.banner(text, small);
    sfx.victory();
  }

  return { start, update, won: () => state === 'won', over: () => state === 'over' };
}
