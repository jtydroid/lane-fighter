// Named rule variants. Each one starts from the base RULES in rules.js and
// overrides only what it changes, so `classic` is always exactly the base game.
//
// Players pick a variant with ?variant=<id>. Ids must be lowercase URL-safe words.

import { RULES } from './rules.js';

export const DEFAULT_VARIANT = 'classic';

export const VARIANTS = Object.freeze({
  classic: {
    name: 'Classic',
    description: 'The original rules.',
    overrides: {},
  },
  // Example variant showing the mechanism. Replace or remove as votes come in.
  warp: {
    name: 'Warp',
    description: 'Lanes wrap from top to bottom, and two shots can be in the air at once.',
    overrides: { wrapLanes: true, maxShots: 2 },
  },
  gunner: {
    name: 'Gunner',
    description:
      'From 15 points, gunships join the fight. Their guns blink before they fire back up their lane: dodge the bullet, or shoot it down.',
    overrides: { gunshipChance: 0.25 },
  },
});

export function resolveVariant(id) {
  const key = typeof id === 'string' && Object.hasOwn(VARIANTS, id) ? id : DEFAULT_VARIANT;
  const v = VARIANTS[key];
  return {
    id: key,
    name: v.name,
    description: v.description,
    rules: Object.freeze({ ...RULES, ...v.overrides }),
  };
}
