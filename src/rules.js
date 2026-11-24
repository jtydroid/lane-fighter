// Every tunable rule of the game lives here. Audience-voted changes should
// land as edits to this file wherever possible, so a rule change is a small,
// reviewable diff that `npm test` validates before deploy.
//
// Timing is measured in ticks. One tick = `tickMs` milliseconds.

export const RULES = Object.freeze({
  // Board
  lanes: 5,               // rows the player can move between
  columns: 12,            // cells per lane; column 0 is the player's column

  // Clock
  tickMs: 100,

  // Player
  startLives: 3,
  wrapLanes: false,       // true: moving up from the top lane wraps to the bottom
  hitFreezeTicks: 15,     // pause after losing a life

  // Shots
  maxShots: 1,            // shots allowed on screen at once
  shotStepTicks: 1,       // ticks per cell a shot travels

  // Enemies
  enemyStartStepTicks: 7, // ticks per cell an enemy travels at the start
  enemyMinStepTicks: 3,   // fastest enemies ever get
  speedupEveryPoints: 25, // enemies get one tick faster every N points
  spawnChance: 0.45,      // chance an enemy spawns each enemy step
  maxEnemies: 6,
  breachCostsLife: true,  // an enemy slipping past in another lane costs a life

  // Heavy cruisers: span two neighbouring lanes and take several hits.
  heavyChance: 0.15,      // share of spawns that are heavy cruisers (0 = none)
  heavyHits: 3,           // hits needed to destroy one

  // Gunships: fire bullets back up their lane after a blinking warning.
  gunshipChance: 0,       // share of spawns that are gunships (0 = none; the Gunner rules turn them on)
  gunshipMinScore: 15,    // gunships only appear once the score reaches this
  gunshipFireEveryTicks: 20, // ticks between a gunship's shots
  gunshipTelegraphTicks: 3,  // the gun blinks this many ticks before each shot
  enemyBulletStepTicks: 3,   // ticks per cell an enemy bullet travels (higher = slower)
  maxEnemyBullets: 1,     // enemy bullets allowed on screen at once
  shotsCancelBullets: true, // the player's shot destroys an enemy bullet it meets

  // Scoring
  pointsPerKill: 1,
  heavyPoints: 3,         // points for destroying a heavy cruiser
  gunshipPoints: 2,       // points for destroying a gunship
});
