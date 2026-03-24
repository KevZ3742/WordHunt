/**
 * ScoreStrip.js — Renders the horizontal score strip during a game.
 *
 * Usage:
 *   import { ScoreStrip } from './components/ScoreStrip.js';
 *   ScoreStrip.render(players, myIndex);
 *
 * `players` shape: [{ name, score, wordCount }]
 */

export const ScoreStrip = {
  render(players, myIndex) {
    const strip = document.getElementById('g-scores');
    if (!strip) return;

    const maxScore = Math.max(0, ...players.map(p => p.score));

    strip.innerHTML = players.map((p, i) => {
      const isMe      = i === myIndex;
      const isLeading = p.score === maxScore && p.score > 0;
      const cls = ['score-chip', isMe ? 'me' : '', isLeading ? 'leading' : '']
        .filter(Boolean).join(' ');

      return `<div class="${cls}">
        <div class="score-name">${_esc(p.name)}</div>
        <div class="score-val">${p.score.toLocaleString()} · ${p.wordCount}w</div>
      </div>`;
    }).join('');
  },
};

function _esc(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}