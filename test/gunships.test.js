import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { resolveVariant } from '../src/variants.js';
import { createGame, act, tick, validateRules, PHASE } from '../src/engine.js';

// A game in progress with no random spawns and enemies that never move on
// their own, so each test controls exactly where gunships and bullets are.
function playing(overrides = {}) {
  const s = createGame({ ...RULES, spawnChance: 0, enemyStartStepTicks: 100, enemyMinStepTicks: 100, ...overrides }, 7);
  act(s, 'fire');
  return s;
}

function gunship(lane, col, charge = 0) {
  return { kind: 'gunship', lane, col, hp: 1, charge, warn: false };
}

function ticks(s, n) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...tick(s));
  return ev;
}

// Ticks until the next enemy-fire event, recording whether the gunship warned
// on every tick before it fired.
function untilFire(s, g, limit = 200) {
  const warnedTicks = [];
  for (let i = 0; i < limit; i++) {
    const ev = tick(s);
    if (ev.includes('enemy-fire')) return { tick: i, warnedTicks };
    if (g.warn) warnedTicks.push(i);
  }
  throw new Error('gunship never fired');
}

test('base rules have no gunships, so Classic is unchanged', () => {
  assert.equal(RULES.gunshipChance, 0);
  const s = createGame({ ...RULES, spawnChance: 1, maxEnemies: 200 }, 3);
  act(s, 'fire');
  s.score = 1000;
  for (let i = 0; i < 2000 && s.phase === PHASE.PLAYING; i++) {
    tick(s);
    assert.ok(s.enemies.every((e) => e.kind !== 'gunship'));
  }
});

test('the Gunner rules turn gunships on and are valid', () => {
  const { rules } = resolveVariant('gunner');
  assert.ok(rules.gunshipChance > 0);
  assert.doesNotThrow(() => validateRules(rules));
});

test('a gunship always warns for gunshipTelegraphTicks before it fires', () => {
  const s = playing();
  const g = gunship(0, 8);
  s.enemies.push(g);
  const { tick: fired, warnedTicks } = untilFire(s, g);
  assert.equal(fired, RULES.gunshipFireEveryTicks - 1);
  assert.equal(warnedTicks.length, RULES.gunshipTelegraphTicks);
  // ...and the warning is the run of ticks right before the shot.
  assert.equal(warnedTicks.at(-1), fired - 1);
  assert.deepEqual(s.bullets, [{ lane: 0, col: 7 }]);
  assert.equal(g.warn, false);
});

test('a warning emits one warn event when it starts', () => {
  const s = playing();
  s.enemies.push(gunship(0, 8));
  const ev = ticks(s, RULES.gunshipFireEveryTicks);
  assert.equal(ev.filter((e) => e === 'warn').length, 1);
  assert.ok(ev.indexOf('warn') < ev.indexOf('enemy-fire'));
});

test('enemy bullets travel toward the player at enemyBulletStepTicks per cell', () => {
  const s = playing();
  s.lane = 4; // out of the way
  s.bullets.push({ lane: 0, col: 6 });
  ticks(s, RULES.enemyBulletStepTicks * 2);
  assert.equal(s.bullets[0].col, 4);
});

test('a bullet reaching the player costs a life', () => {
  const s = playing();
  s.lane = 1;
  s.bullets.push({ lane: 1, col: 1 });
  const ev = ticks(s, RULES.enemyBulletStepTicks);
  assert.ok(ev.includes('hit') && ev.includes('shot'));
  assert.equal(s.lives, RULES.startLives - 1);
  assert.equal(s.phase, PHASE.HIT);
  assert.deepEqual(s.bullets, []);
});

test('moving into a bullet at the player column costs a life', () => {
  const s = playing();
  s.lane = 1;
  s.bullets.push({ lane: 2, col: 0 });
  const ev = act(s, 'down');
  assert.ok(ev.includes('shot'));
  assert.equal(s.lives, RULES.startLives - 1);
});

test('stepping out of the lane dodges the bullet, which then leaves the board', () => {
  const s = playing();
  s.lane = 1;
  s.bullets.push({ lane: 1, col: 2 });
  act(s, 'up');
  ticks(s, RULES.enemyBulletStepTicks * 3);
  assert.deepEqual(s.bullets, []);
  assert.equal(s.lives, RULES.startLives);
  assert.equal(s.phase, PHASE.PLAYING);
});

test('the bullet is slow enough to dodge after seeing it fired from point-blank', () => {
  // Worst case: a gunship two cells away fires into column 1. The player still
  // has enemyBulletStepTicks ticks to move before it reaches column 0.
  const s = playing();
  s.lane = 2;
  const g = gunship(2, 2, RULES.gunshipFireEveryTicks - 1);
  g.warn = true;
  s.enemies.push(g);
  assert.ok(tick(s).includes('enemy-fire'));
  assert.deepEqual(s.bullets, [{ lane: 2, col: 1 }]);
  assert.ok(RULES.enemyBulletStepTicks >= 2);
  act(s, 'up');
  ticks(s, RULES.enemyBulletStepTicks * 2);
  assert.equal(s.lives, RULES.startLives);
});

test('a shot destroys an enemy bullet it meets, and both are removed', () => {
  const s = playing();
  s.lane = 0;
  s.bullets.push({ lane: 0, col: 6 });
  act(s, 'fire');
  const ev = ticks(s, 8);
  assert.ok(ev.includes('cancel'));
  assert.deepEqual(s.bullets, []);
  assert.deepEqual(s.shots, []);
  assert.equal(s.lives, RULES.startLives);
});

test('shots and bullets cannot pass through each other at any speed', () => {
  for (const shotStepTicks of [1, 2, 3]) {
    for (const enemyBulletStepTicks of [1, 2, 3]) {
      for (const start of [3, 4, 5, 6, 7]) {
        const s = playing({ shotStepTicks, enemyBulletStepTicks });
        s.lane = 0;
        s.bullets.push({ lane: 0, col: start });
        act(s, 'fire');
        const ev = ticks(s, 30);
        assert.ok(ev.includes('cancel'), `shot ${shotStepTicks}, bullet ${enemyBulletStepTicks}, start ${start}`);
        assert.equal(s.lives, RULES.startLives);
      }
    }
  }
});

test('with shotsCancelBullets off, shots and bullets pass each other', () => {
  const s = playing({ shotsCancelBullets: false });
  s.lane = 0;
  s.bullets.push({ lane: 0, col: 6 });
  act(s, 'fire');
  const ev = ticks(s, 30);
  assert.ok(!ev.includes('cancel'));
  assert.ok(ev.includes('shot'));
});

test('firing into a bullet in front of the player cancels it at once', () => {
  const s = playing();
  s.lane = 3;
  s.bullets.push({ lane: 3, col: 1 });
  const ev = act(s, 'fire');
  assert.deepEqual(ev, ['fire', 'cancel']);
  assert.deepEqual(s.bullets, []);
});

test('a gunship dies to one hit and scores gunshipPoints', () => {
  const s = playing();
  s.lane = 2;
  s.enemies.push(gunship(2, 5));
  act(s, 'fire');
  const ev = ticks(s, 6);
  assert.ok(ev.includes('gunkill'));
  assert.equal(s.score, RULES.gunshipPoints);
  assert.deepEqual(s.enemies, []);
});

test('only maxEnemyBullets bullets are in the air; a gunship holds its fire until there is room', () => {
  const s = playing();
  s.lane = 4;
  const a = gunship(0, 10, RULES.gunshipFireEveryTicks - 1);
  const b = gunship(1, 10, RULES.gunshipFireEveryTicks - 1);
  s.enemies.push(a, b);
  const ev = tick(s);
  assert.equal(ev.filter((e) => e === 'enemy-fire').length, 1);
  assert.equal(s.bullets.length, 1);
  assert.equal(b.warn, true, 'the held gunship keeps warning');
  // Once the first bullet leaves the board, the held gunship fires.
  s.enemies = [b];
  let fired = false;
  for (let i = 0; i < 200 && !fired; i++) fired = tick(s).includes('enemy-fire');
  assert.ok(fired);
  assert.deepEqual(s.bullets, [{ lane: 1, col: 9 }]);
});

test('a gunship too close to fire does not warn or fire', () => {
  const s = playing();
  s.lane = 4;
  const g = gunship(0, 1, RULES.gunshipFireEveryTicks - 1);
  s.enemies.push(g);
  const ev = tick(s);
  assert.ok(!ev.includes('enemy-fire'));
  assert.equal(g.warn, false);
  assert.deepEqual(s.bullets, []);
});

test('gunships only spawn once the score reaches gunshipMinScore', () => {
  const rules = { ...RULES, spawnChance: 1, maxEnemies: 1, heavyChance: 0, gunshipChance: 1, breachCostsLife: false };
  const s = createGame(rules, 5);
  act(s, 'fire');
  s.score = RULES.gunshipMinScore - 1;
  ticks(s, 50);
  assert.ok(s.enemies.length > 0);
  assert.ok(s.enemies.every((e) => e.kind === 'fighter'));
  s.enemies = [];
  s.score = RULES.gunshipMinScore;
  const ev = ticks(s, 50);
  assert.ok(ev.includes('spawn-gunship'));
  assert.ok(s.enemies.some((e) => e.kind === 'gunship' && e.charge >= 0 && e.hp === 1));
});

test('losing a life clears enemy bullets', () => {
  const s = playing();
  s.lane = 0;
  s.bullets.push({ lane: 4, col: 6 });
  s.enemies.push({ kind: 'fighter', lane: 0, col: 0, hp: 1 });
  act(s, 'down');
  act(s, 'up'); // move back into the fighter
  assert.equal(s.phase, PHASE.HIT);
  assert.deepEqual(s.bullets, []);
});

test('gunship rules are validated', () => {
  assert.throws(() => validateRules({ ...RULES, gunshipChance: 1.5 }), /gunshipChance/);
  assert.throws(() => validateRules({ ...RULES, gunshipTelegraphTicks: 0 }), /gunshipTelegraphTicks/);
  assert.throws(() => validateRules({ ...RULES, maxEnemyBullets: 0 }), /maxEnemyBullets/);
  assert.throws(() => validateRules({ ...RULES, shotsCancelBullets: 'yes' }), /shotsCancelBullets/);
  assert.throws(
    () => validateRules({ ...RULES, gunshipTelegraphTicks: 20, gunshipFireEveryTicks: 20 }),
    /must be less than gunshipFireEveryTicks/,
  );
});

test('same seed + same inputs = same Gunner game', () => {
  const { rules } = resolveVariant('gunner');
  const run = () => {
    const s = createGame(rules, 99);
    act(s, 'fire');
    s.score = 20;
    const log = [];
    for (let i = 0; i < 3000 && s.phase !== PHASE.OVER; i++) {
      if (i % 7 === 0) act(s, i % 14 ? 'up' : 'down');
      if (i % 5 === 0) act(s, 'fire');
      log.push(...tick(s));
    }
    return { log: log.join(','), score: s.score };
  };
  assert.deepEqual(run(), run());
  assert.ok(run().log.includes('enemy-fire'), 'gunships fired during the run');
});
