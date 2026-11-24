// LCD-style renderer. Like a real LCD handheld, every possible sprite position
// is faintly visible ("ghost" segments); the game just darkens the active ones.

import { PHASE } from './engine.js';

const W = 480;
const H = 300;
const PF = { x: 12, y: 60, w: 456, h: 228 }; // playfield
const INK = '#1c2318';
const GHOST_ALPHA = 0.07;

// Sprites are drawn in a unit square (0..1) and scaled into a cell.
const SPRITES = {
  ship(p) {
    p.moveTo(0.08, 0.18); p.lineTo(0.38, 0.36); p.lineTo(0.92, 0.5);
    p.lineTo(0.38, 0.64); p.lineTo(0.08, 0.82); p.lineTo(0.22, 0.5); p.closePath();
    p.rect(0.42, 0.45, 0.16, 0.1); // cockpit cutout
  },
  enemy(p) {
    p.moveTo(0.08, 0.5); p.lineTo(0.42, 0.2); p.lineTo(0.92, 0.14);
    p.lineTo(0.66, 0.5); p.lineTo(0.92, 0.86); p.lineTo(0.42, 0.8); p.closePath();
    p.rect(0.36, 0.43, 0.14, 0.14); // eye cutout
  },
  shot(p) {
    p.rect(0.2, 0.44, 0.6, 0.12);
  },
  // Gunship = enemy body + cannon prongs.
  cannon(p) {
    p.rect(0.0, 0.22, 0.34, 0.08);
    p.rect(0.0, 0.7, 0.34, 0.08);
  },
  // Muzzle flash, lit in the cell in front of a gunship while it warns.
  muzzle(p) {
    p.moveTo(0.98, 0.22); p.lineTo(0.52, 0.5); p.lineTo(0.98, 0.78);
    p.lineTo(0.98, 0.64); p.lineTo(0.74, 0.5); p.lineTo(0.98, 0.36); p.closePath();
  },
  bullet(p) {
    p.moveTo(0.26, 0.5); p.lineTo(0.5, 0.28); p.lineTo(0.74, 0.5); p.lineTo(0.5, 0.72); p.closePath();
  },
};

// Heavy cruiser hull in a tall unit box (spans two lanes). The hit-point
// windows are cut out of the hull and lit one per remaining hit.
function heavyHull(p, windows) {
  p.moveTo(0.04, 0.5); p.lineTo(0.3, 0.2); p.lineTo(0.62, 0.12); p.lineTo(0.96, 0.03);
  p.lineTo(0.8, 0.3); p.lineTo(0.8, 0.7); p.lineTo(0.96, 0.97);
  p.lineTo(0.62, 0.88); p.lineTo(0.3, 0.8); p.closePath();
  for (const w of windows) p.rect(...w);
}

function heavyWindows(count) {
  const h = 0.4 / count;
  return Array.from({ length: count }, (_, i) => [0.38, 0.3 + i * h + h * 0.14, 0.3, h * 0.72]);
}

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '',
};

export function createRenderer(canvas, rules) {
  const ctx = canvas.getContext('2d');
  let scale = 1;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    scale = (canvas.clientWidth * dpr) / W || 1;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const cw = PF.w / rules.columns;
  const ch = PF.h / rules.lanes;

  function sprite(name, col, lane, lit) {
    const size = Math.min(cw, ch) * 0.92;
    const x = PF.x + col * cw + (cw - size) / 2;
    const y = PF.y + lane * ch + (ch - size) / 2;
    const p = new Path2D();
    SPRITES[name](p);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.globalAlpha = lit ? 1 : GHOST_ALPHA;
    ctx.fill(p, 'evenodd');
    ctx.restore();
  }

  const windows = heavyWindows(rules.heavyHits);

  function heavy(e) {
    const size = Math.min(cw, ch) * 0.92;
    const x = PF.x + e.col * cw + (cw - size) / 2;
    const y = PF.y + e.lane * ch + (ch - size) / 2;
    const hull = new Path2D();
    heavyHull(hull, windows);
    // Remaining hit points, drawn as smaller blocks inside their windows.
    const pips = new Path2D();
    for (const [wx, wy, ww, wh] of windows.slice(0, Math.max(0, e.hp))) {
      pips.rect(wx + ww * 0.14, wy + wh * 0.16, ww * 0.72, wh * 0.68);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, ch + size);
    ctx.fill(hull, 'evenodd');
    ctx.fill(pips);
    ctx.restore();
  }

  function digits(str, x, y, w, h, gap) {
    for (let i = 0; i < str.length; i++) {
      const dx = x + i * (w + gap);
      sevenSeg(ctx, dx, y, w, h, 'abcdefg', GHOST_ALPHA);
      sevenSeg(ctx, dx, y, w, h, SEGMENTS[str[i]] ?? '', 1);
    }
  }

  function label(text, x, y, align = 'left') {
    ctx.globalAlpha = 0.75;
    ctx.font = '700 9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  function message(lines) {
    const boxH = 26 + (lines.length - 1) * 22;
    const y0 = PF.y + PF.h / 2 - boxH / 2;
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#a9b59b';
    ctx.fillRect(PF.x + 70, y0 - 10, PF.w - 140, boxH + 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(PF.x + 70, y0 - 10, PF.w - 140, boxH + 20);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((text, i) => {
      ctx.font = i === 0
        ? '800 24px ui-monospace, Menlo, Consolas, monospace'
        : '700 13px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(text, PF.x + PF.w / 2, y0 + (i === 0 ? 0 : 10 + i * 18));
    });
    ctx.restore();
  }

  return function draw(s, hud) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // LCD glass
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#b4bfa6');
    g.addColorStop(1, '#9ba78d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;

    // Printed lane dividers
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    for (let lane = 1; lane < rules.lanes; lane++) {
      const y = PF.y + lane * ch + 0.5;
      ctx.beginPath(); ctx.moveTo(PF.x, y); ctx.lineTo(PF.x + PF.w, y); ctx.stroke();
    }
    ctx.restore();

    // Ghost segments. Gunship segments are only printed on screens that have them.
    const gunships = rules.gunshipChance > 0;
    for (let lane = 0; lane < rules.lanes; lane++) {
      sprite('ship', 0, lane, false);
      if (gunships) sprite('bullet', 0, lane, false);
      for (let col = 1; col < rules.columns; col++) {
        sprite('enemy', col, lane, false);
        sprite('shot', col, lane, false);
        if (gunships) {
          sprite('bullet', col, lane, false);
          sprite('cannon', col, lane, false);
          if (col < rules.columns - 1) sprite('muzzle', col, lane, false);
        }
      }
    }

    // Lit segments get a slight drop shadow, like real LCD ink over a reflector.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 2;

    const blinkOff = s.phase === PHASE.HIT && Math.floor(s.freeze / 3) % 2 === 1;
    if (s.phase !== PHASE.READY && s.phase !== PHASE.OVER && !blinkOff) {
      sprite('ship', 0, s.lane, true);
    }
    for (const e of s.enemies) {
      if (e.kind === 'heavy') heavy(e);
      else sprite('enemy', e.col, e.lane, true);
      if (e.kind === 'gunship') {
        sprite('cannon', e.col, e.lane, true);
        if (e.warn) sprite('muzzle', e.col - 1, e.lane, true);
      }
    }
    for (const x of s.shots) sprite('shot', x.col, x.lane, true);
    for (const b of s.bullets ?? []) sprite('bullet', b.col, b.lane, true);

    // HUD
    label('SCORE', 14, 8);
    digits(String(Math.min(s.score, 9999)).padStart(4, ' '), 14, 20, 16, 28, 6);
    label('HI', 130, 8);
    digits(String(Math.min(hud.hi, 9999)).padStart(4, ' '), 130, 20, 16, 28, 6);

    label('SHIPS', W - 14, 8, 'right');
    const shown = Math.min(rules.startLives, 6);
    for (let i = 0; i < shown; i++) {
      const p = new Path2D();
      SPRITES.ship(p);
      ctx.save();
      ctx.translate(W - 14 - 26 * (shown - i), 20);
      ctx.scale(24, 24);
      ctx.globalAlpha = i < s.lives ? 1 : GHOST_ALPHA;
      ctx.fill(p, 'evenodd');
      ctx.restore();
    }
    if (hud.muted) label('MUTE', W - 14, 46, 'right');
    ctx.restore();

    if (s.phase === PHASE.READY) message(['PRESS FIRE', 'UP/DOWN TO MOVE']);
    else if (s.phase === PHASE.PAUSED) message(['PAUSE', 'PRESS START']);
    else if (s.phase === PHASE.OVER) message(['GAME OVER', `SCORE ${s.score}  -  PRESS FIRE`]);
  };
}

function sevenSeg(ctx, x, y, w, h, segs, alpha) {
  if (!segs) return;
  const t = w * 0.22;
  const gp = 1;
  const v = h / 2 - t / 2 - 2 * gp;
  const hw = w - t - 2 * gp;
  const rects = {
    a: [x + t / 2 + gp, y, hw, t],
    g: [x + t / 2 + gp, y + h / 2 - t / 2, hw, t],
    d: [x + t / 2 + gp, y + h - t, hw, t],
    f: [x, y + t / 2 + gp, t, v],
    b: [x + w - t, y + t / 2 + gp, t, v],
    e: [x, y + h / 2 + gp, t, v],
    c: [x + w - t, y + h / 2 + gp, t, v],
  };
  ctx.globalAlpha = alpha;
  for (const sname of segs) ctx.fillRect(...rects[sname]);
  ctx.globalAlpha = 1;
}
