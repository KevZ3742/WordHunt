/**
 * AnalysisScreen.js — Board-replay analysis screen.
 *
 * Shows the frozen game board and lets the user click / navigate through
 * every possible word, animating which tiles to connect for each one.
 *
 * Usage:
 *   import { AnalysisScreen } from './components/AnalysisScreen.js';
 *   AnalysisScreen.open(msg, myIndex);   // msg = game_over payload
 *
 * The component:
 *  1. Builds a read-only 4×4 tile grid
 *  2. Solves each allWords entry back to a valid tile path using BFS
 *     (the server already guaranteed these words exist on the board)
 *  3. Highlights tiles and draws an SVG polyline for the selected word
 *  4. Supports keyboard ← → and on-screen prev/next buttons
 */

import { showScreen } from '../lib/utils.js';
import { attachDefinitionTooltip, injectTooltipStyles } from '../hooks/useDefinition.js';

// ── PATH FINDER ──
// Given the 16-letter board and a target word, find ONE valid tile path
// (adjacency-connected, no repeated tiles) using iterative DFS.
function findPath(board, word) {
  const size = 4;

  function dfs(idx, depth, visited) {
    if (board[idx] !== word[depth]) return null;
    if (depth === word.length - 1) return [idx];

    const r = Math.floor(idx / size), c = idx % size;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const ni = nr * size + nc;
        if (visited.has(ni)) continue;
        visited.add(ni);
        const sub = dfs(ni, depth + 1, visited);
        if (sub) return [idx, ...sub];
        visited.delete(ni);
      }
    }
    return null;
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== word[0]) continue;
    const visited = new Set([i]);
    const result = dfs(i, 0, visited);
    if (result) return result;
  }
  return null; // shouldn't happen for valid server words
}

// ── STATE ──
let _board     = [];
let _allWords  = [];
let _myWords   = new Set();
let _paths     = [];      // parallel array: path (int[]) for each word
let _selected  = 0;       // current word index

// ── RENDER HELPERS ──

function _buildGrid() {
  const grid = document.getElementById('a-grid');
  if (!grid) return;
  grid.innerHTML = '';
  _board.forEach((letter, i) => {
    const tile = document.createElement('div');
    tile.className = 'analysis-tile';
    tile.dataset.idx = i;
    tile.innerHTML = letter.toUpperCase() +
      `<span class="tile-step" id="a-step-${i}"></span>`;
    grid.appendChild(tile);
  });
}

function _highlightPath(path) {
  // Reset all tiles
  document.querySelectorAll('.analysis-tile').forEach(t => {
    t.classList.remove('in-path', 'path-start');
  });
  // Reset step labels
  for (let i = 0; i < 16; i++) {
    const s = document.getElementById(`a-step-${i}`);
    if (s) s.textContent = '';
  }

  if (!path || path.length === 0) { _drawLine([]); return; }

  path.forEach((idx, step) => {
    const tile = document.querySelector(`.analysis-tile[data-idx="${idx}"]`);
    if (!tile) return;
    tile.classList.add('in-path');
    if (step === 0) tile.classList.add('path-start');
    const stepEl = document.getElementById(`a-step-${idx}`);
    if (stepEl) stepEl.textContent = step + 1;
  });

  _drawLine(path);
}

function _drawLine(path) {
  const svg  = document.getElementById('a-svg');
  const wrap = document.getElementById('a-board-wrap');
  if (!svg || !wrap) return;

  svg.innerHTML = '';
  if (path.length < 2) return;

  const wRect = wrap.getBoundingClientRect();

  const points = path.map(idx => {
    const tile = document.querySelector(`.analysis-tile[data-idx="${idx}"]`);
    if (!tile) return null;
    const tr = tile.getBoundingClientRect();
    const x = ((tr.left + tr.width  / 2 - wRect.left) / wRect.width)  * 100;
    const y = ((tr.top  + tr.height / 2 - wRect.top)  / wRect.height) * 100;
    return `${x},${y}`;
  }).filter(Boolean);

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', points.join(' '));
  poly.setAttribute('class', 'replay-line');
  svg.appendChild(poly);

  // Trigger transition
  requestAnimationFrame(() => poly.classList.add('visible'));
}

function _select(idx) {
  _selected = Math.max(0, Math.min(_allWords.length - 1, idx));
  _renderSelected();
}

function _renderSelected() {
  const word = _allWords[_selected];
  const path = _paths[_selected];

  // Word bar
  const bar      = document.getElementById('a-word-bar');
  const wordText = document.getElementById('a-word-text');
  const wordMeta = document.getElementById('a-word-meta');
  if (bar)      bar.className = 'analysis-word-bar active';
  if (wordText) wordText.textContent = word.toUpperCase();
  if (wordMeta) wordMeta.textContent =
    `${word.length} letters · ${_scoreWord(word)} pts${_myWords.has(word) ? ' · ✓ found' : ''}`;

  // Counter
  const counter = document.getElementById('a-counter');
  if (counter) counter.textContent = `${_selected + 1} / ${_allWords.length}`;

  // Nav buttons
  const prev = document.getElementById('a-prev');
  const next = document.getElementById('a-next');
  if (prev) prev.disabled = _selected === 0;
  if (next) next.disabled = _selected === _allWords.length - 1;

  // Pills
  document.querySelectorAll('.aw-pill').forEach((pill, i) => {
    pill.classList.toggle('selected', i === _selected);
    if (i === _selected) {
      pill.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  });

  // Board
  _highlightPath(path);
}

function _buildWordList() {
  const list = document.getElementById('a-word-list');
  if (!list) return;
  list.innerHTML = _allWords.map((w, i) => {
    const isFound = _myWords.has(w);
    return `<span class="aw-pill${isFound ? ' found-by-me' : ''}" data-wi="${i}">
      ${w}<span class="pill-len">${w.length}</span>
    </span>`;
  }).join('');

  list.addEventListener('click', e => {
    const pill = e.target.closest('.aw-pill');
    if (!pill) return;
    _select(parseInt(pill.dataset.wi));
  });
}

function _scoreWord(word) {
  const table = { 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800, 8: 2200 };
  return table[word.length] ?? 100;
}

// ── KEYBOARD ──
function _onKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  _select(_selected + 1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    _select(_selected - 1);
}

// ── PUBLIC API ──

export const AnalysisScreen = {
  open(msg, myIndex) {
    _board    = msg.board || [];
    _allWords = msg.allWords || [];
    _myWords  = new Set(msg.players[myIndex]?.words || []);
    _selected = 0;

    // Pre-compute paths for all words
    _paths = _allWords.map(w => findPath(_board, w));

    showScreen('s-analysis');

    injectTooltipStyles();
    _buildGrid();
    _buildWordList();
    _renderSelected();

    // Attach definition tooltip to the analysis word pills
    // (re-attach is safe — guarded internally by _defTooltipAttached flag)
    attachDefinitionTooltip('#a-word-list', '.aw-pill',
      el => el.textContent.trim().replace(/\d+$/, '').trim().toLowerCase()
    );

    // Keyboard navigation
    document.removeEventListener('keydown', _onKey);
    document.addEventListener('keydown', _onKey);
  },

  prev() { _select(_selected - 1); },
  next() { _select(_selected + 1); },
};