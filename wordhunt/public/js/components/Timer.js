/**
 * Timer.js — Circular countdown timer component.
 *
 * Reads/writes the existing SVG elements in the DOM.
 * Call Timer.update(secondsLeft, totalSeconds) every tick.
 */

const CIRCUMFERENCE = 2 * Math.PI * 22; // r=22 → ~138.23

export const Timer = {
  update(secondsLeft, totalSeconds) {
    const textEl = document.getElementById('g-timer');
    const arcEl  = document.getElementById('timer-arc');
    if (!textEl || !arcEl) return;

    textEl.textContent = secondsLeft;

    const pct = Math.max(0, secondsLeft / totalSeconds);
    arcEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
    arcEl.style.stroke =
      secondsLeft > 30 ? 'var(--accent2)' :
      secondsLeft > 10 ? 'var(--gold)'    :
                         'var(--red)';
  },
};