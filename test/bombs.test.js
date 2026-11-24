import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { createGame, act, tick, validateRules, PHASE } from '../src/engine.js';

function playing(overrides = {}) {
  const s = createGame({ ...RULES, spawnChance: 0, ...overrides }, 11);
  act(s, 'fire');
  return s;
}

const fighter = (lane, col) => ({ kind: 'fighter', lane, col, hp: 1 });
const gunship = (lane, col) => ({ kind: 'gunship', lane, col, hp: 1, charge: 0, warn: false });
const heavy = (lane, col, hp = RULES.heavyHits) => ({ kind: 'heavy', lane, col, hp });

test('every game starts with rules.bombs bombs', () => {
  assert.equal(RULES.bombs, 3);
  assert.equal(playing().bombs, 3);
  assert.equal(playing({ bombs: 0 }).bombs, 0);
});

test('a bomb destroys fighters and gunships anywhere on screen and scores them', () => {
  const s = playing();
  s.enemies.push(fighter(0, 3), fighter(4, 11), gunship(2, 7));
  const ev = act(s, 'bomb');
  assert.deepEqual(ev, ['bomb']);
  assert.deepEqual(s.enemies, []);
  assert.equal(s.score, 2 * RULES.pointsPerKill + RULES.gunshipPoints);
  assert.equal(s.bombs, RULES.bombs - 1);
});

test('a bomb deals bombHits to a heavy cruiser: a full one survives on its last hit', () => {
  const s = playing();
  s.enemies.push(heavy(1, 6));
  act(s, 'bomb');
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].hp, RULES.heavyHits - RULES.bombHits);
  assert.equal(s.score, 0);
  act(s, 'bomb');
  assert.deepEqual(s.enemies, []);
  assert.equal(s.score, RULES.heavyPoints);
});

test('a damaged heavy cruiser is finished off by a bomb', () => {
  const s = playing();
  s.enemies.push(heavy(1, 6, 2));
  act(s, 'bomb');
  assert.deepEqual(s.enemies, []);
  assert.equal(s.score, RULES.heavyPoints);
});

test('a bomb clears enemy bullets only when bombClearsBullets is on', () => {
  const on = playing();
  on.bullets.push({ lane: 0, col: 4 });
  act(on, 'bomb');
  assert.deepEqual(on.bullets, []);

  const off = playing({ bombClearsBullets: false });
  off.bullets.push({ lane: 0, col: 4 });
  act(off, 'bomb');
  assert.deepEqual(off.bullets, [{ lane: 0, col: 4 }]);
});

test('a bomb leaves the player\'s own shots alone', () => {
  const s = playing();
  act(s, 'fire');
  act(s, 'bomb');
  assert.equal(s.shots.length, 1);
});

test('bombs run out, and do nothing once they have', () => {
  const s = playing({ bombs: 1 });
  assert.deepEqual(act(s, 'bomb'), ['bomb']);
  s.enemies.push(fighter(0, 5));
  assert.deepEqual(act(s, 'bomb'), []);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.bombs, 0);
});

test('bombs are not refilled by losing a life, only by a new game', () => {
  const s = playing();
  act(s, 'bomb');
  s.enemies.push(fighter(s.lane, 0));
  act(s, 'up');
  act(s, 'down'); // crash back into it
  assert.equal(s.phase, PHASE.HIT);
  for (let i = 0; i < RULES.hitFreezeTicks; i++) tick(s);
  assert.equal(s.bombs, RULES.bombs - 1);
  s.lives = 0;
  s.phase = PHASE.OVER;
  act(s, 'fire');
  assert.equal(s.bombs, RULES.bombs);
});

test('a bomb only works while playing', () => {
  const s = createGame({ ...RULES, spawnChance: 0 }, 1);
  assert.deepEqual(act(s, 'bomb'), []); // READY
  act(s, 'fire');
  act(s, 'start'); // pause
  assert.deepEqual(act(s, 'bomb'), []);
  assert.equal(s.bombs, RULES.bombs);
});

test('the bomb flash lasts a few ticks', () => {
  const s = playing();
  act(s, 'bomb');
  assert.ok(s.flash > 0);
  for (let i = 0; i < 10; i++) tick(s);
  assert.equal(s.flash, 0);
});

test('bomb rules are validated', () => {
  assert.throws(() => validateRules({ ...RULES, bombs: -1 }), /bombs must be/);
  assert.throws(() => validateRules({ ...RULES, bombs: 10 }), /bombs must be/);
  assert.throws(() => validateRules({ ...RULES, bombHits: 0 }), /bombHits/);
  assert.throws(() => validateRules({ ...RULES, bombClearsBullets: 1 }), /bombClearsBullets/);
});
