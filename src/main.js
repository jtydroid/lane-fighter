import { createGame, act, tick, PHASE } from './engine.js';
import { createRenderer } from './render.js';
import { createSound } from './sound.js';
import { bindInput } from './input.js';
import { DEFAULT_VARIANT } from './variants.js';
import { setupPicker } from './picker.js';
import { setupRulesPanel } from './rules-panel.js';
import { rulesFromParams, rulesToSearch, hiScoreKey } from './custom-rules.js';
import { RELEASE, VERSION } from './version.js';

const canvas = document.getElementById('screen');
const sound = createSound();
const draw = createRenderer(canvas);

let game;
let hiKey;
let hi = 0;

// (Re)start with a preset plus any changed rules. Keeps the URL in sync so the
// game can be reloaded or shared exactly as it is.
function start(variant, overrides, rules) {
  game = createGame(rules, (Math.random() * 2 ** 31) | 0);
  // High scores are kept per release, preset and set of changed rules, since
  // different rules make scores incomparable.
  hiKey = hiScoreKey(RELEASE, variant.id, overrides);
  try { hi = Number(localStorage.getItem(hiKey)) || 0; } catch { hi = 0; }

  const custom = Object.keys(overrides).length > 0;
  const face = document.getElementById('variant');
  face.textContent = variant.name.toUpperCase() + (custom ? '*' : '');
  face.title = custom ? 'Custom rules' : '';
  document.getElementById('bomb-wrap').hidden = rules.bombs === 0;

  history.replaceState(null, '', location.pathname + rulesToSearch(variant.id, overrides, DEFAULT_VARIANT) + location.hash);

  // Handy for debugging and for automated smoke tests against a deployed build.
  window.__game = game;
  window.__variant = { ...variant, rules, overrides };
}

const initial = rulesFromParams(new URLSearchParams(location.search));
start(initial.variant, initial.overrides, initial.rules);

document.getElementById('version').textContent = VERSION;
setupPicker();
setupRulesPanel({
  ...initial,
  onApply: start,
  onFocus: () => {
    if (game.phase === PHASE.PLAYING) handle(act(game, 'start'));
  },
});

function handle(events) {
  for (const e of events) sound.play(e);
  if (game.score > hi) {
    hi = game.score;
    try { localStorage.setItem(hiKey, String(hi)); } catch {}
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
  while (acc >= game.rules.tickMs) {
    acc -= game.rules.tickMs;
    handle(tick(game));
  }
  draw(game, { hi, muted: sound.muted });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
