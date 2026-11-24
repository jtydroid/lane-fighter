// Keyboard + on-screen buttons, both mapped to the same small set of actions.

const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'fire', KeyJ: 'fire', KeyZ: 'fire',
  KeyB: 'bomb', KeyX: 'bomb',
  Enter: 'start', KeyP: 'start', Escape: 'start',
  KeyM: 'mute',
};

export function bindInput(onAction) {
  const buttons = new Map();
  document.querySelectorAll('[data-action]').forEach((el) => {
    buttons.set(el.dataset.action, el);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      onAction(el.dataset.action);
    });
    const release = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Keys typed into a form field (the rules panel) are for that field, not the game.
  const typing = (e) => e.target instanceof Element && e.target.closest('input, select, textarea, .rules-panel');

  window.addEventListener('keydown', (e) => {
    const action = KEYS[e.code];
    if (!action || typing(e)) return;
    e.preventDefault();
    if (e.repeat) return; // one press = one move, like a real button
    buttons.get(action)?.classList.add('pressed');
    onAction(action);
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYS[e.code];
    if (action) buttons.get(action)?.classList.remove('pressed');
  });
}
