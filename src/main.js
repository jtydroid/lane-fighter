import { RULES } from './rules.js';
import { createGame, act, tick, PHASE } from './engine.js';
import { createRenderer } from './render.js';
import { createSound } from './sound.js';
import { bindInput } from './input.js';
import { VERSION } from './version.js';

const HI_KEY = 'lanefighter.hi';

const canvas = document.getElementById('screen');
const game = createGame(RULES, (Math.random() * 2 ** 31) | 0);
const sound = createSound();
const draw = createRenderer(canvas, RULES);

let hi = 0;
try { hi = Number(localStorage.getItem(HI_KEY)) || 0; } catch {}

document.getElementById('version').textContent = VERSION;

function handle(events) {
  for (const e of events) sound.play(e);
  if (game.score > hi) {
    hi = game.score;
    try { localStorage.setItem(HI_KEY, String(hi)); } catch {}
  }
}

bindInput((action) => {
  sound.unlock();
  if (action === 'mute') sound.toggle();
  else handle(act(game, action));
});

// Auto-pause when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === PHASE.PLAYING) handle(act(game, 'start'));
});

// Fixed-timestep loop: logic runs at exactly one tick per RULES.tickMs.
let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= RULES.tickMs) {
    acc -= RULES.tickMs;
    handle(tick(game));
  }
  draw(game, { hi, muted: sound.muted });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging and for automated smoke tests against a deployed build.
window.__game = game;
