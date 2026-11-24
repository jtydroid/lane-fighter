// Custom rules: a preset (variant) plus any rule values the player changed.
// They live in the URL so a custom game can be shared as a link, e.g.
//   ?variant=gunner&enemyMinStepTicks=4&speedupEveryPoints=25
// Pure functions, no DOM, so they're tested in Node.

import { RULES } from './rules.js';
import { resolveVariant } from './variants.js';
import { validateRules } from './engine.js';
import { RULE_INFO } from './rule-meta.js';

// Turn one text value into a rule value, or throw a readable error.
export function parseRuleValue(key, text) {
  const info = RULE_INFO[key];
  if (!info) throw new Error(`unknown rule "${key}"`);
  const t = String(text).trim();
  if (info.type === 'bool') {
    if (t === 'true' || t === '1') return true;
    if (t === 'false' || t === '0') return false;
    throw new Error(`${info.label} must be on or off`);
  }
  const n = Number(t);
  if (t === '' || !Number.isFinite(n)) throw new Error(`${info.label} must be a number`);
  if (info.type === 'int' && !Number.isInteger(n)) throw new Error(`${info.label} must be a whole number`);
  if (n < info.min || n > info.max) throw new Error(`${info.label} must be between ${info.min} and ${info.max}`);
  return n;
}

// Read a preset and overrides from URL search params. Unknown params are
// ignored; overrides equal to the preset's value are dropped.
export function rulesFromParams(params) {
  const variant = resolveVariant(params.get('variant'));
  const overrides = {};
  const errors = [];
  for (const key of Object.keys(RULES)) {
    if (!params.has(key)) continue;
    try {
      const v = parseRuleValue(key, params.get(key));
      if (v !== variant.rules[key]) overrides[key] = v;
    } catch (err) {
      errors.push(err.message);
    }
  }
  const built = buildRules(variant, overrides);
  if (built.error) {
    // Combination doesn't validate: fall back to the plain preset.
    return { variant, overrides: {}, rules: variant.rules, errors: [...errors, built.error] };
  }
  return { variant, overrides, rules: built.rules, errors };
}

// Preset + overrides -> frozen, validated rules, or { error }.
export function buildRules(variant, overrides) {
  const rules = Object.freeze({ ...variant.rules, ...overrides });
  try {
    validateRules(rules);
    return { rules };
  } catch (err) {
    return { error: readable(err.message) };
  }
}

// "Invalid rules:\n  gunshipTelegraphTicks must ..." -> "Warning time must ..."
function readable(message) {
  let text = message.replace(/^Invalid rules:\n\s*/, '').replace(/\n\s*/g, '; ');
  for (const key of Object.keys(RULE_INFO).sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`\\b${key}\\b`, 'g'), `“${RULE_INFO[key].label}”`);
  }
  return text;
}

// The URL search string for a preset + overrides, in a stable order.
export function rulesToSearch(variantId, overrides, defaultVariant = 'classic') {
  const params = new URLSearchParams();
  if (variantId !== defaultVariant) params.set('variant', variantId);
  for (const key of Object.keys(RULES)) {
    if (Object.hasOwn(overrides, key)) params.set(key, String(overrides[key]));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

// High scores are kept per release and preset; custom rules get their own table,
// keyed by a short hash of exactly which rules changed.
export function hiScoreKey(release, variantId, overrides) {
  const base = `lanefighter.hi.${release}.${variantId}`;
  const keys = Object.keys(RULES).filter((k) => Object.hasOwn(overrides, k));
  if (!keys.length) return base;
  const canon = keys.map((k) => `${k}=${overrides[k]}`).join('&');
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < canon.length; i++) h = Math.imul(h ^ canon.charCodeAt(i), 0x01000193);
  return `${base}.custom-${(h >>> 0).toString(36)}`;
}
