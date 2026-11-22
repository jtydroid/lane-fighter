import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { createGame, act, tick, validateRules, enemyStepTicks, PHASE } from '../src/engine.js';

// A game in progress with no random spawns, so each test places enemies itself.
function playing(overrides = {}) {
  const s = createGame({ ...RULES, spawnChance: 0, ...overrides }, 42);
  act(s, 'fire'); // fire starts the game from READY
  return s;
}

function ticks(s, n) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...tick(s));
  return ev;
}

test('shipped rules are valid', () => {
  assert.doesNotThrow(() => validateRules(RULES));
});

test('invalid rules are rejected with a readable message', () => {
  assert.throws(() => validateRules({ ...RULES, lanes: 0 }), /lanes must be an integer/);
  assert.throws(() => validateRules({ ...RULES, spawnChance: 2 }), /spawnChance/);
  assert.throws(() => validateRules({ ...RULES, wrapLanes: 'yes' }), /wrapLanes/);
  assert.throws(
    () => validateRules({ ...RULES, enemyMinStepTicks: 9, enemyStartStepTicks: 3 }),
    /enemyMinStepTicks must not exceed/,
  );
});

test('game starts in READY and fire starts play in the middle lane', () => {
  const s = createGame(RULES, 1);
  assert.equal(s.phase, PHASE.READY);
  assert.deepEqual(tick(s), []);
  assert.deepEqual(act(s, 'fire'), ['start']);
  assert.equal(s.phase, PHASE.PLAYING);
  assert.equal(s.lane, 2);
  assert.equal(s.lives, RULES.startLives);
});

test('movement is clamped to the board', () => {
  const s = playing();
  for (let i = 0; i < 10; i++) act(s, 'up');
  assert.equal(s.lane, 0);
  assert.deepEqual(act(s, 'up'), []);
  for (let i = 0; i < 10; i++) act(s, 'down');
  assert.equal(s.lane, RULES.lanes - 1);
});

test('movement wraps when wrapLanes is on', () => {
  const s = playing({ wrapLanes: true });
  s.lane = 0;
  act(s, 'up');
  assert.equal(s.lane, RULES.lanes - 1);
});

test('fire respects maxShots', () => {
  const s = playing({ maxShots: 1 });
  assert.deepEqual(act(s, 'fire'), ['fire']);
  assert.deepEqual(act(s, 'fire'), []);
  assert.equal(s.shots.length, 1);
});

test('shots travel right and leave the board', () => {
  const s = playing();
  act(s, 'fire');
  ticks(s, 3);
  assert.equal(s.shots[0].col, 4);
  ticks(s, RULES.columns);
  assert.equal(s.shots.length, 0);
});

test('a shot destroys an enemy in its lane and scores', () => {
  const s = playing();
  s.enemies.push({ lane: s.lane, col: 5 });
  act(s, 'fire');
  const ev = ticks(s, 6);
  assert.ok(ev.includes('kill'));
  assert.equal(s.enemies.length, 0);
  assert.equal(s.shots.length, 0);
  assert.equal(s.score, RULES.pointsPerKill);
});

test('shots and enemies cannot pass through each other', () => {
  // Make both move on every tick so they would swap cells if checked naively.
  const s = playing({ enemyStartStepTicks: 1, enemyMinStepTicks: 1 });
  s.enemies.push({ lane: s.lane, col: 3 });
  act(s, 'fire'); // shot at col 1, enemy at col 3
  ticks(s, 1); // shot -> 2, enemy -> 2
  assert.equal(s.score, 1);
  s.enemies.push({ lane: s.lane, col: 2 });
  act(s, 'fire'); // shot at 1, enemy at 2: they swap unless checked between moves
  ticks(s, 1);
  assert.equal(s.score, 2);
});

test('a shot in another lane does not hit', () => {
  const s = playing();
  s.enemies.push({ lane: s.lane + 1, col: 4 });
  act(s, 'fire');
  ticks(s, 3);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.score, 0);
});

test('an enemy reaching the player costs a life and freezes the game', () => {
  const s = playing({ hitFreezeTicks: 5 });
  s.enemies.push({ lane: s.lane, col: 1 });
  const ev = ticks(s, RULES.enemyStartStepTicks);
  assert.ok(ev.includes('crash'));
  assert.equal(s.lives, RULES.startLives - 1);
  assert.equal(s.phase, PHASE.HIT);
  assert.deepEqual(act(s, 'fire'), [], 'input ignored while frozen');
  ticks(s, 5);
  assert.equal(s.phase, PHASE.PLAYING);
});

test('moving into an enemy at the player column crashes', () => {
  const s = playing();
  s.enemies.push({ lane: s.lane + 1, col: 0 });
  const ev = act(s, 'down');
  assert.ok(ev.includes('crash'));
  assert.equal(s.lives, RULES.startLives - 1);
});

test('breach costs a life only when breachCostsLife is on', () => {
  const on = playing({ breachCostsLife: true });
  on.enemies.push({ lane: on.lane + 1, col: 0 });
  assert.ok(ticks(on, RULES.enemyStartStepTicks).includes('breach'));
  assert.equal(on.lives, RULES.startLives - 1);

  const off = playing({ breachCostsLife: false });
  off.enemies.push({ lane: off.lane + 1, col: 0 });
  assert.ok(ticks(off, RULES.enemyStartStepTicks).includes('escape'));
  assert.equal(off.lives, RULES.startLives);
  assert.equal(off.enemies.length, 0);
});

test('losing the last life ends the game, and fire restarts it', () => {
  const s = playing({ startLives: 1, hitFreezeTicks: 2 });
  s.enemies.push({ lane: s.lane, col: 1 });
  ticks(s, RULES.enemyStartStepTicks);
  const ev = ticks(s, 2);
  assert.ok(ev.includes('gameover'));
  assert.equal(s.phase, PHASE.OVER);
  act(s, 'fire');
  assert.equal(s.phase, PHASE.PLAYING);
  assert.equal(s.lives, 1);
  assert.equal(s.score, 0);
});

test('start pauses and resumes; paused game does not advance', () => {
  const s = playing();
  act(s, 'fire');
  act(s, 'start');
  assert.equal(s.phase, PHASE.PAUSED);
  ticks(s, 5);
  assert.equal(s.shots[0].col, 1);
  act(s, 'start');
  assert.equal(s.phase, PHASE.PLAYING);
});

test('enemies speed up with score, down to the minimum', () => {
  const s = playing();
  assert.equal(enemyStepTicks(s), RULES.enemyStartStepTicks);
  s.score = RULES.speedupEveryPoints;
  assert.equal(enemyStepTicks(s), RULES.enemyStartStepTicks - 1);
  s.score = 1e6;
  assert.equal(enemyStepTicks(s), RULES.enemyMinStepTicks);
});

test('enemies spawn at the far edge and respect maxEnemies', () => {
  const s = playing({ spawnChance: 1, maxEnemies: 3, breachCostsLife: false });
  s.lives = 99;
  ticks(s, 500);
  assert.ok(s.enemies.length <= 3);
  const fresh = createGame({ ...RULES, spawnChance: 1 }, 7);
  act(fresh, 'fire');
  ticks(fresh, RULES.enemyStartStepTicks);
  assert.equal(fresh.enemies.length, 1);
  assert.equal(fresh.enemies[0].col, RULES.columns - 1);
});

// --- Heavy cruisers ---------------------------------------------------------

const heavyAt = (lane, col, hp = RULES.heavyHits) => ({ kind: 'heavy', lane, col, hp });

test('a heavy cruiser can be hit from either of its two lanes', () => {
  for (const offset of [0, 1]) {
    const s = playing();
    s.enemies.push(heavyAt(s.lane - offset, 4));
    act(s, 'fire');
    const ev = ticks(s, 3);
    assert.ok(ev.includes('damage'), `hit from lane offset ${offset}`);
    assert.equal(s.enemies[0].hp, RULES.heavyHits - 1);
  }
});

test('a heavy cruiser in neither lane is not hit', () => {
  const s = playing();
  s.enemies.push(heavyAt(s.lane + 1, 4)); // occupies lane+1 and lane+2
  act(s, 'fire');
  ticks(s, 4);
  assert.equal(s.enemies[0].hp, RULES.heavyHits);
});

test('a heavy cruiser takes heavyHits hits and scores heavyPoints', () => {
  const s = playing({ heavyHits: 3, heavyPoints: 5, enemyStartStepTicks: 100, enemyMinStepTicks: 100 });
  s.enemies.push(heavyAt(s.lane, 6));
  const events = [];
  for (let hit = 1; hit <= 3; hit++) {
    events.push(...act(s, 'fire'));
    events.push(...ticks(s, 6));
  }
  assert.deepEqual(events.filter((e) => e !== 'fire'), ['damage', 'damage', 'heavykill']);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.score, 5);
});

test('a heavy cruiser reaching the player in either lane crashes', () => {
  for (const offset of [0, 1]) {
    const s = playing();
    s.enemies.push(heavyAt(s.lane - offset, 1));
    assert.ok(ticks(s, RULES.enemyStartStepTicks).includes('crash'), `lane offset ${offset}`);
  }
});

test('moving into a heavy cruiser at the player column crashes', () => {
  const s = playing();
  s.lane = 0;
  s.enemies.push(heavyAt(1, 0)); // lanes 1 and 2
  assert.ok(act(s, 'down').includes('crash'));
});

test('heavy cruisers spawn inside the board with full hit points', () => {
  const s = createGame({ ...RULES, spawnChance: 1, heavyChance: 1, breachCostsLife: false }, 99);
  act(s, 'fire');
  s.lives = 99;
  let spawned = 0;
  for (let i = 0; i < 2000; i++) {
    const ev = tick(s);
    for (const e of s.enemies) {
      assert.equal(e.kind, 'heavy');
      assert.ok(e.lane >= 0 && e.lane <= RULES.lanes - 2, `lane ${e.lane} fits two lanes`);
    }
    spawned += ev.filter((e) => e === 'spawn-heavy').length;
    const fresh = s.enemies.filter((e) => e.col === RULES.columns - 1);
    for (const e of fresh) assert.equal(e.hp, RULES.heavyHits);
  }
  assert.ok(spawned > 10);
});

test('spawns never overlap a heavy cruiser at the spawn column', () => {
  const s = createGame({ ...RULES, spawnChance: 1, heavyChance: 0.5, maxEnemies: 50, breachCostsLife: false }, 5);
  act(s, 'fire');
  s.lives = 99;
  for (let i = 0; i < 3000; i++) {
    tick(s);
    for (let lane = 0; lane < RULES.lanes; lane++) {
      for (let col = 0; col < RULES.columns; col++) {
        const n = s.enemies.filter((e) =>
          e.col === col && (e.lane === lane || (e.kind === 'heavy' && e.lane + 1 === lane))).length;
        assert.ok(n <= 1, `cell ${lane},${col} holds ${n} enemies`);
      }
    }
  }
});

test('heavyChance 0 spawns only fighters', () => {
  const s = createGame({ ...RULES, spawnChance: 1, heavyChance: 0, breachCostsLife: false }, 3);
  act(s, 'fire');
  s.lives = 99;
  ticks(s, 1000);
  assert.ok(s.enemies.every((e) => e.kind === 'fighter'));
});

test('heavy cruiser rules are validated', () => {
  assert.throws(() => validateRules({ ...RULES, heavyChance: -0.1 }), /heavyChance/);
  assert.throws(() => validateRules({ ...RULES, heavyHits: 0 }), /heavyHits/);
  assert.throws(() => validateRules({ ...RULES, lanes: 1 }), /needs lanes >= 2/);
  assert.doesNotThrow(() => validateRules({ ...RULES, lanes: 1, heavyChance: 0 }));
});

test('same seed + same inputs = same game', () => {
  const run = (seed) => {
    const s = createGame(RULES, seed);
    act(s, 'fire');
    for (let i = 0; i < 2000; i++) {
      if (i % 7 === 0) act(s, 'fire');
      if (i % 23 === 0) act(s, i % 46 === 0 ? 'up' : 'down');
      tick(s);
    }
    return JSON.stringify(s);
  };
  assert.equal(run(123), run(123));
  assert.notEqual(run(123), run(456));
});
