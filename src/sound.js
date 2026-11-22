// Square-wave beeps in the spirit of a piezo buzzer.

const TUNES = {
  start: [[660, 70], [880, 90]],
  fire: [[1250, 22]],
  kill: [[1800, 35], [2400, 45]],
  damage: [[700, 25], [500, 25]],
  heavykill: [[1200, 40], [1800, 40], [2400, 40], [3200, 80]],
  'spawn-heavy': [[260, 60], [0, 30], [260, 60]],
  move: [[520, 10]],
  hit: [[220, 120], [140, 220]],
  gameover: [[440, 160], [330, 160], [220, 320]],
  pause: [[600, 40]],
  resume: [[600, 40]],
};

export function createSound() {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('lanefighter.muted') === '1'; } catch {}

  return {
    get muted() { return muted; },
    // Browsers only allow audio after a user gesture.
    unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('lanefighter.muted', muted ? '1' : '0'); } catch {}
    },
    play(name) {
      const tune = TUNES[name];
      if (!tune || muted || !ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      let t = ctx.currentTime;
      for (const [freq, ms] of tune) {
        if (freq === 0) { // rest
          t += ms / 1000;
          continue;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.value = 0.035;
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + ms / 1000);
        t += ms / 1000;
      }
    },
  };
}
