import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import { VARIANTS, DEFAULT_VARIANT, resolveVariant } from '../src/variants.js';
import { validateRules, createGame } from '../src/engine.js';
import { siteRoot } from '../src/picker.js';

test('classic is exactly the base rules', () => {
  assert.equal(DEFAULT_VARIANT, 'classic');
  assert.deepEqual(VARIANTS.classic.overrides, {});
  assert.deepEqual({ ...resolveVariant('classic').rules }, { ...RULES });
});

for (const [id, v] of Object.entries(VARIANTS)) {
  test(`variant "${id}" is well-formed and playable`, () => {
    assert.match(id, /^[a-z0-9-]+$/, 'ids must be URL-safe');
    assert.ok(v.name && v.description, 'needs a name and description');
    for (const key of Object.keys(v.overrides)) {
      assert.ok(Object.hasOwn(RULES, key), `overrides unknown rule "${key}"`);
    }
    const { rules } = resolveVariant(id);
    assert.doesNotThrow(() => validateRules(rules));
    assert.doesNotThrow(() => createGame(rules, 1));
  });
}

test('unknown or missing variant falls back to classic', () => {
  for (const id of [null, undefined, '', 'nope', '__proto__', 'constructor']) {
    assert.equal(resolveVariant(id).id, 'classic');
  }
});

test('siteRoot finds the site root from latest and frozen release pages', () => {
  const root = (href) => siteRoot(new URL(href)).href;
  assert.equal(root('https://x.github.io/lane-fighter/'), 'https://x.github.io/lane-fighter/');
  assert.equal(root('https://x.github.io/lane-fighter/index.html'), 'https://x.github.io/lane-fighter/');
  assert.equal(root('https://x.github.io/lane-fighter/v/v0.1.0/'), 'https://x.github.io/lane-fighter/');
  assert.equal(root('https://x.github.io/lane-fighter/v/v0.1.0/index.html'), 'https://x.github.io/lane-fighter/');
  assert.equal(root('http://localhost:8080/'), 'http://localhost:8080/');
});
