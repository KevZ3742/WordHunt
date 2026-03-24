/**
 * useBoard.js — Board state and path logic.
 *
 * Owns: currentPath, gameBoard, adjacency checks, word display updates,
 *       SVG path line rendering, and found-word list.
 *
 * Exposes a factory `createBoard(send)` that returns the board API.
 * `send` is the WebSocket send function used to submit words.
 *
 * Optionally accepts a `trie` for client-side live validation so the
 * word display can show green while dragging before the server confirms.
 */

export function createBoard(send) {
  let gameBoard    = [];   // 16-letter array set by server
  let currentPath  = [];   // tile indices in selection order
  let clientTrie   = null; // set via setTrie() once dictionary loads
  let foundWords   = new Set(); // words already found this game

  // ── PUBLIC API ──

  function setBoard(board) {
    gameBoard = board;
    foundWords.clear();
  }

  function getBoard() {
    return gameBoard;
  }

  /** Provide the client-side Trie for live word validation feedback. */
  function setTrie(trie) {
    clientTrie = trie;
  }

  /** Returns the lowercase word string built from currentPath, or ''. */
  function currentWord() {
    return currentPath.map(i => gameBoard[i] ?? '').join('');
  }

  /**
   * Add a tile index to the path, with adjacency + duplicate checks.
   * Returns true if the tile was added.
   */
  function tryAddIndex(idx) {
    if (isNaN(idx) || idx < 0 || idx >= 16) return false;

    if (currentPath.includes(idx)) {
      // Backtrack: if user drags back to second-to-last tile, undo the last one
      const pos = currentPath.indexOf(idx);
      if (pos === currentPath.length - 2) {
        const removed = currentPath.pop();
        _removeTileClass(removed, 'in-path', 'first-path');
        _refreshDisplay();
        _drawLines();
      }
      return false;
    }

    if (currentPath.length > 0 && !isAdjacent(currentPath[currentPath.length - 1], idx)) {
      return false;
    }

    currentPath.push(idx);
    _applyTileClass(idx, 'in-path');
    if (currentPath.length === 1) _applyTileClass(idx, 'first-path');
    _refreshDisplay();
    _drawLines();
    return true;
  }

  /** Clear all selections. */
  function clearPath() {
    currentPath.forEach(i => _removeTileClass(i, 'in-path', 'first-path'));
    currentPath = [];
    _refreshDisplay();
    _drawLines();
  }

  /** Submit the current path to the server, then clear. */
  function submitPath() {
    if (currentPath.length < 3) { clearPath(); return; }
    send({ type: 'submit_word', path: [...currentPath] });
    clearPath();
  }

  /** Show feedback after server validates a word. */
  function onWordResult(msg) {
    const wd = document.getElementById('g-word');
    if (!wd) return;

    if (msg.ok) {
      foundWords.add(msg.word.toLowerCase());
      wd.textContent = msg.word.toUpperCase() + ' +' + msg.pts;
      wd.className = 'word-display found';
      _addFoundChip(msg.word, msg.pts);
      setTimeout(() => {
        if (wd.classList.contains('found')) {
          wd.textContent = '—'; wd.className = 'word-display';
        }
      }, 1000);
    } else {
      wd.textContent = msg.msg.toUpperCase();
      wd.className = 'word-display invalid';
      setTimeout(() => {
        if (wd.classList.contains('invalid')) {
          wd.textContent = '—'; wd.className = 'word-display';
        }
      }, 800);
    }
  }

  function clearFoundList() {
    const el = document.getElementById('g-found-list');
    if (el) el.innerHTML = '';
    foundWords.clear();
  }

  // ── PRIVATE HELPERS ──

  function isAdjacent(a, b) {
    const ar = Math.floor(a / 4), ac = a % 4;
    const br = Math.floor(b / 4), bc = b % 4;
    return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && a !== b;
  }

  function _applyTileClass(idx, ...classes) {
    document.querySelector(`.tile[data-idx="${idx}"]`)?.classList.add(...classes);
  }

  function _removeTileClass(idx, ...classes) {
    document.querySelector(`.tile[data-idx="${idx}"]`)?.classList.remove(...classes);
  }

  /**
   * Update the word display bar.
   * Priority: found (already got it) > valid (trie hit) > building > empty
   */
  function _refreshDisplay() {
    const wd = document.getElementById('g-word');
    if (!wd) return;

    if (currentPath.length === 0) {
      wd.textContent = '—';
      wd.className = 'word-display';
      return;
    }

    const word = currentWord();
    const upper = word.toUpperCase();
    wd.textContent = upper;

    if (currentPath.length < 3) {
      // Still building — no validation yet
      wd.className = 'word-display';
      return;
    }

    if (foundWords.has(word)) {
      // Already found this word this game
      wd.className = 'word-display found';
      return;
    }

    if (clientTrie) {
      if (clientTrie.search(word)) {
        wd.className = 'word-display valid';   // green: word exists
      } else if (clientTrie.startsWith(word)) {
        wd.className = 'word-display';          // neutral: could still grow into a word
      } else {
        wd.className = 'word-display invalid';  // red: no word starts with this
      }
    } else {
      // Trie not loaded yet — just show neutral valid for 3+ letters
      wd.className = 'word-display' + (currentPath.length >= 3 ? ' valid' : '');
    }
  }

  function _drawLines() {
    const svg = document.getElementById('path-svg');
    if (!svg) return;
    svg.innerHTML = '';
    if (currentPath.length < 2) return;

    const wrap = document.getElementById('grid-wrap');
    const wRect = wrap.getBoundingClientRect();

    const points = currentPath.map(idx => {
      const tile = document.querySelector(`.tile[data-idx="${idx}"]`);
      if (!tile) return null;
      const tr = tile.getBoundingClientRect();
      const x = ((tr.left + tr.width  / 2 - wRect.left) / wRect.width)  * 100;
      const y = ((tr.top  + tr.height / 2 - wRect.top)  / wRect.height) * 100;
      return `${x},${y}`;
    }).filter(Boolean);

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', points.join(' '));
    poly.setAttribute('class', 'path-line');
    svg.appendChild(poly);
  }

  function _addFoundChip(word, pts) {
    const list = document.getElementById('g-found-list');
    if (!list) return;
    const chip = document.createElement('div');
    chip.className = 'found-word';
    chip.innerHTML = `${word.toUpperCase()} <span class="pts">+${pts}</span>`;
    list.prepend(chip);
  }

  return {
    setBoard, getBoard, setTrie, currentWord,
    tryAddIndex, clearPath, submitPath,
    onWordResult, clearFoundList,
    isAdjacent,
  };
}