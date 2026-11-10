# Tidebound — Plan (version 1)

Chosen 2026-11-10. Second game after River Puzzle.

## The game in one line
Sail a small cartoon ship through a short voyage of about 20 minutes, with a new sea map every time. Fight pirates and sea creatures, pick up gear, beat the boss, then spend your gold at home on permanent upgrades.

## How it is built (same as River Puzzle)
- Browser game: Vite + three.js, isometric camera, toon shading and outlines, cartoon art made in code (no model files).
- Sounds and music made in code (Web Audio). Copy and adapt `river-puzzle/src/audio.js`.
- Save in the browser. Copy and adapt `river-puzzle/src/save.js`.
- **Phone first, then iPad, then PC.** Touch controls are the main controls from Milestone 1, not added later. Played in **landscape** (portrait shows a "turn your phone" message). Big buttons, nothing important under the notch or the home bar.
- The user tests on their phone, so every milestone must be playable either from the laptop over the same Wi-Fi (dev server started with `--host`, phone opens `http://<laptop IP>:<port>`) or from GitHub Pages after a push.
- Published to GitHub Pages like River Puzzle.
- Must run smoothly on an 8 GB laptop with integrated graphics. Keep the number of objects on screen low.

## Version 1 contents
**Ship and controls**
- **Phone/iPad:** a thumbstick on the left side of the screen steers. Push it in a direction and the ship turns toward it and speeds up; let go and the ship slows down. The ship drifts a little and leaves a wake.
- **Firing (decided 2026-11-10: manual):** two big buttons on the right, **Fire Left** and **Fire Right**, one for each side of the ship. A faint arc on the water shows where each side's cannons will hit, and each button shows its own reload. The skill is steering side-on to an enemy and firing at the right moment.
- **PC:** WASD / arrow keys to steer, **Q** = fire left, **E** = fire right.
- Ship stats: hull (health), speed, turning, cannon damage, reload time, range.

**One voyage**
- Chart screen: a route map 7 steps long. Each step offers 2–3 choices, and the last step is the boss.
- 3 step types:
  - **Battle:** a small stretch of sea fenced in by rocks. Enemies come in 2–3 waves. Winning gives gold and a choice of 1 of 3 gear pieces.
  - **Treasure cove:** a calm island with chests to sail past and collect. There are rocks to avoid, and sometimes an ambush.
  - **Port:** spend gold on repairs or buy gear.
- Losing (the ship sinks) ends the voyage. You keep half the gold you were carrying.

**4 enemies**
1. **Pirate sloop:** chases you and turns side-on to fire its cannons.
2. **Gunboat:** keeps its distance and lobs shots. A red circle on the water shows where each shot will land.
3. **Mine turtle:** slow. Drops floating mines behind it.
4. **Shark:** fast. Circles, then rams. Cannons struggle to hit it, so you have to turn and dodge.

**Boss: the Kraken**
- Tentacles rise from the water with a warning ripple first, then slam down. Shoot the tentacles to make the head come up, then shoot the head. It squirts an ink cloud that hides part of the screen.

**Gear picked up during a voyage (8 pieces, lost when the voyage ends)**
Double shot · Chain shot (slows enemies) · Fire shot (damage over time) · Extra cannon · Ram spikes · Better sails · Hull patch (+ max health) · Gold magnet.

**Shipyard at home (permanent, bought with gold)**
Stronger hull · Faster sails · Heavier cannons · Start each voyage with more gold. Each has 5 levels.

## Not in version 1 (parking lot)
More ships to choose from, storms, mystery steps, crew, captain levels, elite enemies, more seas, more bosses, a story. Add these only after version 1 is finished and fun.

## Milestones (finish each one and test it before the next)
1. **Sailing feel:** the ship on open water with steering, wake, camera, a few rocks and islands. Does sailing feel good?
2. **First fight:** auto-cannons, the pirate sloop, hull health, sinking, gold drops.
3. **All enemies:** add the gunboat, mine turtle and shark. Battles with waves, plus win and lose screens.
4. **Voyage:** chart screen, battle / treasure / port steps, gear choices and the shop.
5. **Kraken boss.**
6. **Shipyard and saving:** permanent upgrades, save, sounds and music.
7. **Polish and publish:** title screen, balancing, touch controls, GitHub Pages.

## Working rules
- The user is new to game making and doesn't read code. Explain in plain words, and confirm the task before building.
- Keep scope tight. Push back on new features until version 1 is done.
- Test in the built-in browser (the dev server goes in `.claude/launch.json`). If the browser pane is hidden, animations slow down, so step frames forward from the console as was done for River Puzzle.

## Later games (in order, each one reusing Tidebound's parts)
1. **Saltwind:** a fixed ocean in rings (Shallows → Reef → Storm Belt → Frozen North → Abyss). Upgrades open new rings. Ghost ships, sea serpents, forts and a Kraken finale.
2. **Deepwell:** a submarine diving through depth layers, managing oxygen and pressure. Eels, anglerfish, jellyfish.
3. **Skyward:** an airship among floating islands with 3 height levels. Harpies, sky pirates, storm spirits.
4. **Merchant Tides:** trading and growing a fleet. Pirates, rival merchants, customs patrols. Could become a mode inside Saltwind.
