// Estimate how hard a set of rules is for a person, by playing many games with
// a simulated player that has human limits:
//
//   --react N   it sees the board N ticks late (reaction time)
//   --gap N     it can press a button at most once every N ticks
//   --slip P    chance it hesitates instead of pressing (0..1)
//
// The defaults are calibrated so the player scores about what a real player did
// on the old Classic speed ramp (median ~55; see README "Balance"). It is a
// yardstick for comparing rules, not a prediction of any one person's score.
//
// Usage:
//   node scripts/balance.js                        # every preset
//   node scripts/balance.js --preset gunner        # one preset
//   node scripts/balance.js --set speedupEveryPoints=10 --set enemyMinStepTicks=2
//   node scripts/balance.js --games 500 --react 3 --gap 2 --slip 0.05

import { createGame, act, tick, PHASE } from '../src/engine.js';
import { VARIANTS, resolveVariant } from '../src/variants.js';
import { parseRuleValue, buildRules } from '../src/custom-rules.js';

export const HUMAN = Object.freeze({ react: 3, gap: 2, slip: 0.1 });

// One game. Returns the final score and how many ticks it lasted.
export function playHuman(rules, seed, human = HUMAN, maxTicks = 100_000) {
  const s = createGame(rules, seed);
  act(s, 'fire');
  let rng = (seed * 2654435761) >>> 0; // the player's own randomness (slips)
  const rand = () => ((rng = (Math.imul(rng ^ (rng >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);

  const seen = []; // what the player has seen, newest last
  let cooldown = 0;
  let ticks = 0;
  while (s.phase !== PHASE.OVER && ticks < maxTicks) {
    seen.push({
      enemies: s.enemies.map((e) => ({ kind: e.kind, lane: e.lane, col: e.col })),
      bullets: s.bullets.map((b) => ({ lane: b.lane, col: b.col })),
    });
    if (seen.length > human.react + 1) seen.shift();

    if (s.phase === PHASE.PLAYING) {
      if (cooldown > 0) cooldown--;
      else {
        const action = decide(s, seen[0]);
        if (action && rand() >= human.slip) {
          act(s, action);
          cooldown = human.gap - 1;
        }
      }
    }
    tick(s);
    ticks++;
  }
  return { score: s.score, ticks };
}

// A sensible strategy, playing on a delayed view of the board: dodge a bullet
// that's close in your lane, else line up with the enemy nearest to getting
// past, else fire.
function decide(s, view) {
  const r = s.rules;
  const lanesOf = (e) => (e.kind === 'heavy' ? [e.lane, e.lane + 1] : [e.lane]);
  const blocked = (lane) =>
    lane < 0 || lane >= r.lanes ||
    view.enemies.some((e) => e.col <= 1 && lanesOf(e).includes(lane)) ||
    view.bullets.some((b) => b.lane === lane && b.col <= 1);
  const step = (dir) => {
    const lane = r.wrapLanes ? (s.lane + dir + r.lanes) % r.lanes : s.lane + dir;
    return blocked(lane) ? null : dir < 0 ? 'up' : 'down';
  };

  if (view.bullets.some((b) => b.lane === s.lane && b.col <= 3)) {
    return step(-1) ?? step(1);
  }
  const targets = view.enemies.filter((e) => e.col >= 1).sort((a, b) => a.col - b.col);
  if (!targets.length) return null;
  const t = targets[0];
  const lanes = lanesOf(t);
  if (lanes.includes(s.lane)) return 'fire';
  const goal = lanes.reduce((a, b) => (Math.abs(b - s.lane) < Math.abs(a - s.lane) ? b : a));
  let dir = Math.sign(goal - s.lane);
  if (r.wrapLanes && Math.abs(goal - s.lane) > r.lanes / 2) dir = -dir;
  return step(dir);
}

export function summarize(rules, games, human = HUMAN) {
  const runs = Array.from({ length: games }, (_, i) => playHuman(rules, i + 1, human));
  const scores = runs.map((g) => g.score).sort((a, b) => a - b);
  const pct = (p) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
  const seconds = runs.reduce((a, g) => a + g.ticks, 0) / runs.length * rules.tickMs / 1000;
  return { p10: pct(0.1), median: pct(0.5), p90: pct(0.9), seconds: Math.round(seconds) };
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const human = {
    react: Number(opt('--react', HUMAN.react)),
    gap: Number(opt('--gap', HUMAN.gap)),
    slip: Number(opt('--slip', HUMAN.slip)),
  };
  const games = Number(opt('--games', 300));
  const overrides = {};
  args.forEach((a, i) => {
    if (a !== '--set') return;
    const [key, value] = args[i + 1].split('=');
    overrides[key] = parseRuleValue(key, value);
  });
  const presets = opt('--preset') ? [opt('--preset')] : Object.keys(VARIANTS);

  console.log(`Simulated player: sees ${human.react} ticks late, presses at most every ${human.gap} ticks, hesitates ${Math.round(human.slip * 100)}% of the time. ${games} games each.`);
  if (Object.keys(overrides).length) console.log(`Custom rules: ${JSON.stringify(overrides)}`);
  console.log('preset     p10  median   p90   avg game');
  for (const id of presets) {
    const built = buildRules(resolveVariant(id), overrides);
    if (built.error) {
      console.log(`${id.padEnd(9)} invalid: ${built.error}`);
      continue;
    }
    const r = summarize(built.rules, games, human);
    console.log(`${id.padEnd(9)} ${String(r.p10).padStart(4)}  ${String(r.median).padStart(6)}  ${String(r.p90).padStart(4)}   ${String(r.seconds).padStart(5)}s`);
  }
}
