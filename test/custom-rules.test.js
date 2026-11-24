import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { VARIANTS, resolveVariant } from '../src/variants.js';
import { RULE_TABS, RULE_INFO } from '../src/rule-meta.js';
import { parseRuleValue, rulesFromParams, rulesToSearch, buildRules, hiScoreKey } from '../src/custom-rules.js';

const params = (s) => new URLSearchParams(s);

test('every rule is on exactly one tab of the rules panel', () => {
  const listed = RULE_TABS.flatMap((t) => t.rules.map((r) => r.key));
  assert.deepEqual([...listed].sort(), Object.keys(RULES).sort());
  assert.equal(new Set(listed).size, listed.length);
  for (const r of Object.values(RULE_INFO)) assert.ok(r.label && r.help, `${r.key} needs a label and help`);
});

test('every preset value fits its field range', () => {
  for (const id of Object.keys(VARIANTS)) {
    const { rules } = resolveVariant(id);
    for (const [key, v] of Object.entries(rules)) {
      assert.deepEqual(parseRuleValue(key, String(v)), v, `${id}.${key}`);
    }
  }
});

test('parseRuleValue checks types and ranges', () => {
  assert.equal(parseRuleValue('lanes', '7'), 7);
  assert.equal(parseRuleValue('spawnChance', '0.3'), 0.3);
  assert.equal(parseRuleValue('wrapLanes', 'true'), true);
  assert.equal(parseRuleValue('wrapLanes', '0'), false);
  assert.throws(() => parseRuleValue('lanes', '2.5'), /whole number/);
  assert.throws(() => parseRuleValue('lanes', '0'), /between 1 and 9/);
  assert.throws(() => parseRuleValue('lanes', ''), /must be a number/);
  assert.throws(() => parseRuleValue('spawnChance', '1.5'), /between 0 and 1/);
  assert.throws(() => parseRuleValue('wrapLanes', 'yes'), /on or off/);
  assert.throws(() => parseRuleValue('nope', '1'), /unknown rule/);
});

test('no params means plain Classic', () => {
  const r = rulesFromParams(params(''));
  assert.equal(r.variant.id, 'classic');
  assert.deepEqual(r.overrides, {});
  assert.deepEqual({ ...r.rules }, { ...RULES });
  assert.deepEqual(r.errors, []);
});

test('URL overrides apply on top of the preset', () => {
  const r = rulesFromParams(params('variant=gunner&enemyMinStepTicks=4&speedupEveryPoints=25'));
  assert.equal(r.variant.id, 'gunner');
  assert.deepEqual(r.overrides, { enemyMinStepTicks: 4, speedupEveryPoints: 25 });
  assert.equal(r.rules.enemyMinStepTicks, 4);
  assert.equal(r.rules.gunshipChance, VARIANTS.gunner.overrides.gunshipChance);
  assert.ok(Object.isFrozen(r.rules));
});

test('overrides equal to the preset are dropped, unknown params ignored', () => {
  const r = rulesFromParams(params(`lanes=${RULES.lanes}&foo=1&tickMs=120`));
  assert.deepEqual(r.overrides, { tickMs: 120 });
  assert.deepEqual(r.errors, []);
});

test('bad values are reported and skipped; the rest still apply', () => {
  const r = rulesFromParams(params('lanes=99&tickMs=150'));
  assert.deepEqual(r.overrides, { tickMs: 150 });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /Lanes must be between/);
});

test('a combination that fails validation falls back to the plain preset', () => {
  const r = rulesFromParams(params('variant=warp&enemyMinStepTicks=9&enemyStartStepTicks=3'));
  assert.equal(r.variant.id, 'warp');
  assert.deepEqual(r.overrides, {});
  assert.deepEqual({ ...r.rules }, { ...resolveVariant('warp').rules });
  assert.match(r.errors.at(-1), /“Top enemy speed” must not exceed “Starting enemy speed”/);
});

test('buildRules reports invalid combinations as one readable line', () => {
  const { error } = buildRules(resolveVariant('classic'), { gunshipTelegraphTicks: 30, gunshipFireEveryTicks: 20 });
  assert.equal(error, '“Warning time” must be less than “Fire every”');
  assert.ok(!error.includes('\n'));
});

test('rulesToSearch round-trips through rulesFromParams in a stable order', () => {
  const overrides = { speedupEveryPoints: 30, wrapLanes: true, spawnChance: 0.3 };
  const search = rulesToSearch('gunner', overrides);
  assert.equal(search, '?variant=gunner&wrapLanes=true&speedupEveryPoints=30&spawnChance=0.3');
  const back = rulesFromParams(params(search));
  assert.equal(back.variant.id, 'gunner');
  assert.deepEqual(back.overrides, overrides);
  assert.equal(rulesToSearch('classic', {}), '');
});

test('custom rules get their own high-score table, stable for the same changes', () => {
  assert.equal(hiScoreKey('v0.4.0', 'classic', {}), 'lanefighter.hi.v0.4.0.classic');
  const a = hiScoreKey('v0.4.0', 'classic', { tickMs: 150, lanes: 4 });
  const b = hiScoreKey('v0.4.0', 'classic', { lanes: 4, tickMs: 150 });
  const c = hiScoreKey('v0.4.0', 'classic', { tickMs: 151, lanes: 4 });
  assert.match(a, /^lanefighter\.hi\.v0\.4\.0\.classic\.custom-[0-9a-z]+$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});
