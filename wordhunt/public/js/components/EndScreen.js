/**
 * EndScreen.js — Renders the game-over results screen.
 *
 * Usage:
 *   import { EndScreen } from './components/EndScreen.js';
 *   EndScreen.render(msg, myIndex);
 *
 * `msg` shape: { winner, players: [{ name, score, words }], allWords: string[], board: string[] }
 */

import { attachDefinitionTooltip, injectTooltipStyles } from '../hooks/useDefinition.js';

// Stored so the analysis screen can re-use it
let _lastMsg     = null;
let _lastMyIndex = 0;

export const EndScreen = {
  getLastMsg()     { return _lastMsg; },
  getLastMyIndex() { return _lastMyIndex; },

  render(msg, myIndex) {
    _lastMsg     = msg;
    _lastMyIndex = myIndex;

    const isMe = msg.winner === msg.players[myIndex]?.name;

    // Winner banner
    const emojiEl   = document.getElementById('end-emoji');
    const winnerEl  = document.getElementById('end-winner');
    if (emojiEl)  emojiEl.textContent  = isMe ? '🏆' : '🎯';
    if (winnerEl) winnerEl.textContent = msg.winner;

    // Per-player result rows
    const resultsEl = document.getElementById('end-results');
    if (resultsEl) {
      const sorted = [...msg.players].sort((a, b) => b.score - a.score);
      resultsEl.innerHTML = sorted.map((p, rank) => {
        const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉';
        const words = p.words || [];
        return `<div class="result-row${rank === 0 ? ' winner-row' : ''}">
          <div>
            <div class="result-name">${medal} ${_esc(p.name)}</div>
            <div class="result-words">
              ${words.map(w =>
                `<span class="result-word-chip${w.length >= 6 ? ' long' : ''}">${w}</span>`
              ).join('')}
            </div>
          </div>
          <div class="result-meta">${p.score.toLocaleString()}</div>
        </div>`;
      }).join('');
    }

    // All possible words grid
    const myWords  = new Set(msg.players[myIndex]?.words || []);
    const allWords = msg.allWords || [];
    const countEl  = document.getElementById('aw-count');
    const gridEl   = document.getElementById('aw-grid');
    if (countEl) countEl.textContent = allWords.length;
    if (gridEl) {
      gridEl.innerHTML = allWords.map(w => {
        const cls = myWords.has(w) ? 'found-by-me' : 'missed';
        return `<span class="aw-chip ${cls}">${w}<span class="aw-len"> ${w.length}</span></span>`;
      }).join('');
    }

    // Show the analyse button only if we have board data
    const analyseBtn = document.getElementById('btn-analyse');
    if (analyseBtn) analyseBtn.style.display = msg.board ? '' : 'none';

    // Attach definition tooltips to all word chips on the results screen
    injectTooltipStyles();
    // Use setTimeout so the DOM is fully painted before we query
    setTimeout(() => {
      attachDefinitionTooltip('#aw-grid', '.aw-chip',
        el => el.childNodes[0]?.textContent?.trim().toLowerCase() ?? ''
      );
      attachDefinitionTooltip('#end-results', '.result-word-chip',
        el => el.textContent.trim().toLowerCase()
      );
    }, 0);
  },
};

function _esc(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}