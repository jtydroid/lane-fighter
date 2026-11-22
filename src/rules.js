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
  enemyMinStepTicks: 2,   // fastest enemies ever get
  speedupEveryPoints: 10, // enemies get one tick faster every N points
  spawnChance: 0.45,      // chance an enemy spawns each enemy step
  maxEnemies: 6,
  breachCostsLife: true,  // an enemy slipping past in another lane costs a life

  // Scoring
  pointsPerKill: 1,
});
