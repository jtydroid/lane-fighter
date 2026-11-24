// Pure game logic: no DOM, no timers, no Math.random. Given the same rules,
// seed and inputs, the game plays out identically, which keeps it testable in Node.

import { RULES } from './rules.js';

export const PHASE = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  HIT: 'hit',
  OVER: 'over',
});

const INT_RULES = {
  lanes: [1, 9],
  columns: [3, 40],
  tickMs: [16, 2000],
  startLives: [1, 99],
  hitFreezeTicks: [0, 1000],
  maxShots: [1, 20],
  shotStepTicks: [1, 100],
  enemyStartStepTicks: [1, 100],
  enemyMinStepTicks: [1, 100],
  speedupEveryPoints: [1, 100000],
  maxEnemies: [1, 200],
  pointsPerKill: [0, 1000],
  heavyHits: [1, 99],
  heavyPoints: [0, 1000],
  gunshipMinScore: [0, 100000],
  gunshipFireEveryTicks: [2, 1000],
  gunshipTelegraphTicks: [1, 100],  // at least 1: every enemy shot is warned
  enemyBulletStepTicks: [1, 100],
  maxEnemyBullets: [1, 20],
  gunshipPoints: [0, 1000],
};
const BOOL_RULES = ['wrapLanes', 'breachCostsLife', 'shotsCancelBullets'];
const CHANCE_RULES = ['spawnChance', 'heavyChance', 'gunshipChance'];

export function validateRules(r) {
  const errors = [];
  for (const [key, [min, max]] of Object.entries(INT_RULES)) {
    const v = r[key];
    if (!Number.isInteger(v) || v < min || v > max) {
      errors.push(`${key} must be an integer in [${min}, ${max}], got ${v}`);
    }
  }
  for (const key of BOOL_RULES) {
    if (typeof r[key] !== 'boolean') errors.push(`${key} must be a boolean, got ${r[key]}`);
  }
  for (const key of CHANCE_RULES) {
    if (typeof r[key] !== 'number' || !(r[key] >= 0 && r[key] <= 1)) {
      errors.push(`${key} must be a number in [0, 1], got ${r[key]}`);
    }
  }
  if (r.gunshipTelegraphTicks >= r.gunshipFireEveryTicks) {
    errors.push('gunshipTelegraphTicks must be less than gunshipFireEveryTicks');
  }
  if (r.heavyChance > 0 && r.lanes < 2) {
    errors.push('heavy cruisers span two lanes, so heavyChance > 0 needs lanes >= 2');
  }
  if (r.enemyMinStepTicks > r.enemyStartStepTicks) {
    errors.push('enemyMinStepTicks must not exceed enemyStartStepTicks');
  }
  if (errors.length) throw new Error('Invalid rules:\n  ' + errors.join('\n  '));
  return r;
}

export function createGame(rules = RULES, seed = 1) {
  validateRules(rules);
  const s = { rules, rng: seed | 0, phase: PHASE.READY };
  resetRun(s);
  return s;
}

// mulberry32, with its state kept on the game object so the game is serializable.
function random(s) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function resetRun(s) {
  s.lane = Math.floor(s.rules.lanes / 2);
  s.enemies = [];
  s.shots = [];
  s.bullets = [];         // enemy bullets, travelling toward the player
  s.score = 0;
  s.lives = s.rules.startLives;
  s.shotTimer = 0;
  s.enemyTimer = 0;
  s.bulletTimer = 0;
  s.freeze = 0;
  s.ticks = 0;
}

export function enemyStepTicks(s) {
  const r = s.rules;
  return Math.max(
    r.enemyMinStepTicks,
    r.enemyStartStepTicks - Math.floor(s.score / r.speedupEveryPoints),
  );
}

// Apply a player action immediately. Actions: 'up' | 'down' | 'fire' | 'start'.
// Returns a list of event names (used for sound, analytics, etc.).
export function act(s, action) {
  const ev = [];
  switch (s.phase) {
    case PHASE.READY:
    case PHASE.OVER:
      if (action === 'fire' || action === 'start') {
        resetRun(s);
        s.phase = PHASE.PLAYING;
        ev.push('start');
      }
      return ev;
    case PHASE.PAUSED:
      if (action === 'start') {
        s.phase = PHASE.PLAYING;
        ev.push('resume');
      }
      return ev;
    case PHASE.HIT:
      return ev;
  }

  // PHASE.PLAYING
  if (action === 'start') {
    s.phase = PHASE.PAUSED;
    ev.push('pause');
  } else if (action === 'up' || action === 'down') {
    const lanes = s.rules.lanes;
    let lane = s.lane + (action === 'up' ? -1 : 1);
    lane = s.rules.wrapLanes ? (lane + lanes) % lanes : Math.max(0, Math.min(lanes - 1, lane));
    if (lane !== s.lane) {
      s.lane = lane;
      ev.push('move');
      checkCrash(s, ev);
    }
  } else if (action === 'fire') {
    if (s.shots.length < s.rules.maxShots && !s.shots.some((x) => x.lane === s.lane && x.col === 1)) {
      s.shots.push({ lane: s.lane, col: 1 });
      ev.push('fire');
      resolveHits(s, ev);
    }
  }
  return ev;
}

// Advance the game clock by one tick.
export function tick(s) {
  const ev = [];
  if (s.phase === PHASE.HIT) {
    if (--s.freeze <= 0) endFreeze(s, ev);
    return ev;
  }
  if (s.phase !== PHASE.PLAYING) return ev;

  const r = s.rules;
  s.ticks++;

  // Shots move first, then enemy bullets, then enemies, with a hit check after
  // each move so nothing can pass through anything else.
  if (++s.shotTimer >= r.shotStepTicks) {
    s.shotTimer = 0;
    for (const shot of s.shots) shot.col++;
    s.shots = s.shots.filter((x) => x.col < r.columns);
    resolveHits(s, ev);
  }

  if (s.bullets.length && ++s.bulletTimer >= r.enemyBulletStepTicks) {
    s.bulletTimer = 0;
    for (const b of s.bullets) b.col--;
    s.bullets = s.bullets.filter((b) => b.col >= 0);
    resolveHits(s, ev);
    checkCrash(s, ev);
    if (s.phase !== PHASE.PLAYING) return ev;
  }

  gunshipsFire(s, ev);

  if (++s.enemyTimer >= enemyStepTicks(s)) {
    s.enemyTimer = 0;
    for (const e of s.enemies) e.col--;
    resolveHits(s, ev);
    checkCrash(s, ev);
    if (s.phase !== PHASE.PLAYING) return ev;

    const breached = s.enemies.filter((e) => e.col < 0);
    if (breached.length) {
      s.enemies = s.enemies.filter((e) => e.col >= 0);
      if (r.breachCostsLife) {
        loseLife(s, ev, 'breach');
        return ev;
      }
      for (let i = 0; i < breached.length; i++) ev.push('escape');
    }
    spawn(s, ev);
  }
  return ev;
}

// Enemy kinds:
//   fighter  one cell, destroyed by one hit
//   heavy    spans `lane` and `lane + 1`, destroyed after rules.heavyHits hits
//   gunship  one cell, one hit; fires bullets back up its lane. `charge` counts
//            ticks toward its next shot, and `warn` is true while it blinks.
export function occupies(e, lane, col) {
  return e.col === col && (e.lane === lane || (e.kind === 'heavy' && e.lane + 1 === lane));
}

function enemyAt(s, lane, col) {
  return s.enemies.findIndex((e) => occupies(e, lane, col));
}

function spawn(s, ev) {
  const r = s.rules;
  if (s.enemies.length >= r.maxEnemies) return;
  if (random(s) >= r.spawnChance) return;
  const col = r.columns - 1;
  const heavy = r.heavyChance > 0 && random(s) < r.heavyChance;
  // Only roll for a gunship when they're on, so rules without them keep the
  // exact same random sequence (and so the same games) as before they existed.
  const gunship = !heavy && r.gunshipChance > 0 && s.score >= r.gunshipMinScore && random(s) < r.gunshipChance;
  let enemy;
  if (heavy) enemy = { kind: 'heavy', lane: Math.floor(random(s) * (r.lanes - 1)), col, hp: r.heavyHits };
  else if (gunship) enemy = { kind: 'gunship', lane: Math.floor(random(s) * r.lanes), col, hp: 1, charge: 0, warn: false };
  else enemy = { kind: 'fighter', lane: Math.floor(random(s) * r.lanes), col, hp: 1 };
  const lanes = heavy ? [enemy.lane, enemy.lane + 1] : [enemy.lane];
  if (lanes.some((lane) => enemyAt(s, lane, col) >= 0)) return;
  s.enemies.push(enemy);
  ev.push(heavy ? 'spawn-heavy' : gunship ? 'spawn-gunship' : 'spawn');
}

// Each gunship charges toward its next shot. For the last gunshipTelegraphTicks
// ticks it blinks a warning, then fires a bullet into the cell in front of it.
// A gunship with no room in front, or with the bullet limit reached, holds its
// fire (and keeps blinking if it was already warning).
function gunshipsFire(s, ev) {
  const r = s.rules;
  for (const g of s.enemies) {
    if (g.kind !== 'gunship') continue;
    if (g.charge < r.gunshipFireEveryTicks) g.charge++;
    const wasWarning = g.warn;
    g.warn = g.col >= 2 && g.charge >= r.gunshipFireEveryTicks - r.gunshipTelegraphTicks;
    if (g.warn && !wasWarning) ev.push('warn');
    if (g.warn && g.charge >= r.gunshipFireEveryTicks && s.bullets.length < r.maxEnemyBullets) {
      s.bullets.push({ lane: g.lane, col: g.col - 1 });
      if (s.bullets.length === 1) s.bulletTimer = 0;
      g.charge = 0;
      g.warn = false;
      ev.push('enemy-fire');
    }
  }
  resolveHits(s, ev); // a bullet fired straight into a shot
}

function resolveHits(s, ev) {
  if (s.rules.shotsCancelBullets) {
    for (const shot of s.shots) {
      const b = s.bullets.find((b) => b.lane === shot.lane && b.col === shot.col);
      if (!b) continue;
      shot.dead = b.dead = true;
      ev.push('cancel');
    }
    s.bullets = s.bullets.filter((b) => !b.dead);
    s.shots = s.shots.filter((x) => !x.dead);
  }
  for (const shot of s.shots) {
    const i = enemyAt(s, shot.lane, shot.col);
    if (i < 0) continue;
    const e = s.enemies[i];
    shot.dead = true;
    e.hp = (e.hp ?? 1) - 1;
    if (e.hp > 0) {
      ev.push('damage');
      continue;
    }
    s.enemies.splice(i, 1);
    if (e.kind === 'heavy') {
      s.score += s.rules.heavyPoints;
      ev.push('heavykill');
    } else if (e.kind === 'gunship') {
      s.score += s.rules.gunshipPoints;
      ev.push('gunkill');
    } else {
      s.score += s.rules.pointsPerKill;
      ev.push('kill');
    }
  }
  s.shots = s.shots.filter((x) => !x.dead);
}

function checkCrash(s, ev) {
  if (enemyAt(s, s.lane, 0) >= 0) loseLife(s, ev, 'crash');
  else if (s.bullets.some((b) => b.lane === s.lane && b.col === 0)) loseLife(s, ev, 'shot');
}

function loseLife(s, ev, cause) {
  s.lives--;
  s.lastHit = cause;
  s.enemies = [];
  s.shots = [];
  s.bullets = [];
  s.phase = PHASE.HIT;
  s.freeze = s.rules.hitFreezeTicks;
  ev.push('hit', cause);
  if (s.freeze <= 0) endFreeze(s, ev);
}

function endFreeze(s, ev) {
  s.freeze = 0;
  s.shotTimer = 0;
  s.enemyTimer = 0;
  s.bulletTimer = 0;
  if (s.lives <= 0) {
    s.phase = PHASE.OVER;
    ev.push('gameover');
  } else {
    s.phase = PHASE.PLAYING;
    ev.push('respawn');
  }
}
