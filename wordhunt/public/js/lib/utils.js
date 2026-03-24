/**
 * utils.js — Shared DOM helpers used across the app.
 */

// ── SCREEN SWITCHING ──
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── TOAST ──
let _toastTimer = null;

export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── FLOATING SCORE POP ──
export function showScorePop(text, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'score-pop';
  pop.textContent = text;
  pop.style.left = (rect.left + rect.width / 2 - 30) + 'px';
  pop.style.top  = (rect.top - 10) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1300);
}