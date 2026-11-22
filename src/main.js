import { createGame, act, tick, PHASE } from './engine.js';
import { createRenderer } from './render.js';
import { createSound } from './sound.js';
import { bindInput } from './input.js';
import { resolveVariant } from './variants.js';
import { setupPicker } from './picker.js';
import { RELEASE, VERSION } from './version.js';

const variant = resolveVariant(new URLSearchParams(location.search).get('variant'));
const rules = variant.rules;

// High scores are kept per release and variant, since different rules make
// scores incomparable.
const HI_KEY = `lanefighter.hi.${RELEASE}.${variant.id}`;

const canvas = document.getElementById('screen');
const game = createGame(rules, (Math.random() * 2 ** 31) | 0);
const sound = createSound();
const draw = createRenderer(canvas, rules);

let hi = 0;
try { hi = Number(localStorage.getItem(HI_KEY)) || 0; } catch {}

document.getElementById('version').textContent = VERSION;
document.getElementById('variant').textContent = variant.name.toUpperCase();
setupPicker(variant);

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

// Fixed-timestep loop: logic runs at exactly one tick per rules.tickMs.
let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= rules.tickMs) {
    acc -= rules.tickMs;
    handle(tick(game));
  }
  draw(game, { hi, muted: sound.muted });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging and for automated smoke tests against a deployed build.
window.__game = game;
window.__variant = variant;
