// How each rule is shown in the rules panel: which tab it's on, its label and a
// one-line explanation. Types and ranges come from the engine (INT_RULES,
// BOOL_RULES, CHANCE_RULES), so the panel accepts exactly what the game does.
//
// Every rule in rules.js must appear here exactly once (a test checks this),
// so a newly voted-in rule shows up in the panel.

import { INT_RULES, BOOL_RULES, CHANCE_RULES } from './engine.js';

export const RULE_TABS = [
  {
    id: 'speed',
    label: 'Speed',
    rules: [
      ['enemyStartStepTicks', 'Starting enemy speed', 'Ticks an enemy takes to move one cell at the start. Higher is slower.'],
      ['enemyMinStepTicks', 'Top enemy speed', 'The fastest enemies ever get, in ticks per cell. Higher is slower.'],
      ['speedupEveryPoints', 'Speed up every', 'Points between each one-tick speed-up. Higher means a gentler ramp.'],
      ['tickMs', 'Game clock', 'Milliseconds per tick. Higher slows the whole game down.'],
      ['shotStepTicks', 'Shot speed', 'Ticks your shot takes to move one cell. Higher is slower.'],
    ],
  },
  {
    id: 'player',
    label: 'Player',
    rules: [
      ['startLives', 'Ships', 'Lives at the start of a game.'],
      ['maxShots', 'Shots at once', 'How many of your shots can be on screen together.'],
      ['wrapLanes', 'Wrap lanes', 'Moving off the top lane wraps to the bottom, and back.'],
      ['breachCostsLife', 'Breaches cost a life', 'An enemy slipping past you in another lane costs a life.'],
      ['hitFreezeTicks', 'Pause after a hit', 'Ticks the game freezes after you lose a ship.'],
    ],
  },
  {
    id: 'enemies',
    label: 'Enemies',
    rules: [
      ['spawnChance', 'Spawn rate', 'Chance a new enemy appears each time enemies move.'],
      ['maxEnemies', 'Enemies at once', 'Most enemies on screen together.'],
      ['pointsPerKill', 'Points per fighter', 'Score for destroying a fighter.'],
      ['lanes', 'Lanes', 'Rows you can move between.'],
      ['columns', 'Columns', 'Cells per lane. More columns give you more time to react.'],
    ],
  },
  {
    id: 'heavy',
    label: 'Heavy cruisers',
    rules: [
      ['heavyChance', 'Heavy cruisers', 'Share of new enemies that are two-lane heavy cruisers. 0 turns them off.'],
      ['heavyHits', 'Hits to destroy', 'Hits a heavy cruiser takes.'],
      ['heavyPoints', 'Points', 'Score for destroying a heavy cruiser.'],
    ],
  },
  {
    id: 'gunships',
    label: 'Gunships',
    rules: [
      ['gunshipChance', 'Gunships', 'Share of new enemies that are gunships. 0 turns them off.'],
      ['gunshipMinScore', 'Appear from score', 'Gunships only appear once your score reaches this.'],
      ['gunshipTelegraphTicks', 'Warning time', 'Ticks the muzzle flashes before each shot.'],
      ['gunshipFireEveryTicks', 'Fire every', 'Ticks between a gunship’s shots.'],
      ['enemyBulletStepTicks', 'Bullet speed', 'Ticks an enemy bullet takes to move one cell. Higher is slower.'],
      ['maxEnemyBullets', 'Bullets at once', 'Most enemy bullets on screen together.'],
      ['shotsCancelBullets', 'Shoot bullets down', 'Your shot destroys an enemy bullet it meets.'],
      ['gunshipPoints', 'Points', 'Score for destroying a gunship.'],
    ],
  },
].map((tab) => ({
  ...tab,
  rules: tab.rules.map(([key, label, help]) => ({ key, label, help, ...ruleType(key) })),
}));

export const RULE_INFO = Object.fromEntries(RULE_TABS.flatMap((t) => t.rules.map((r) => [r.key, r])));

function ruleType(key) {
  if (BOOL_RULES.includes(key)) return { type: 'bool' };
  if (CHANCE_RULES.includes(key)) return { type: 'chance', min: 0, max: 1 };
  const range = INT_RULES[key];
  if (range) return { type: 'int', min: range[0], max: range[1] };
  throw new Error(`rule-meta: no type for rule "${key}"`);
}
