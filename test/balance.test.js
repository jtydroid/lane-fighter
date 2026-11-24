import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { resolveVariant } from '../src/variants.js';
import { playHuman, summarize, HUMAN } from '../scripts/balance.js';

// The simulated player is calibrated to a real player, who reached about 55
// points on the old Classic speed ramp (v0.5.0: speed-up every 10 points, top
// speed 2) before it became unplayable. If engine changes shift this, the
// balance numbers are no longer comparable, so recalibrate HUMAN.
const OLD_CLASSIC = { ...RULES, speedupEveryPoints: 10, enemyMinStepTicks: 2 };

test('simulated player is calibrated: about 55 on the old Classic ramp', () => {
  const { median } = summarize(OLD_CLASSIC, 100);
  assert.ok(median >= 45 && median <= 65, `median ${median}`);
});

test('simulated games are deterministic', () => {
  assert.deepEqual(playHuman(RULES, 7), playHuman(RULES, 7));
});

test('a slower player scores less than the calibrated one', () => {
  const slow = summarize(OLD_CLASSIC, 60, { ...HUMAN, react: 6, gap: 4 });
  const normal = summarize(OLD_CLASSIC, 60);
  assert.ok(slow.median < normal.median, `${slow.median} vs ${normal.median}`);
});

test('every preset is survivable for a while by the simulated player', () => {
  for (const id of ['classic', 'warp', 'gunner']) {
    const { p10, seconds } = summarize(resolveVariant(id).rules, 40);
    assert.ok(p10 >= 20 && seconds >= 30, `${id}: p10 ${p10}, ${seconds}s`);
  }
});
