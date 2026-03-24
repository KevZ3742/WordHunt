/**
 * app.js — Main entry point.
 *
 * Responsibilities:
 *  - Connect to the WebSocket server
 *  - Handle all incoming server messages
 *  - Orchestrate screen transitions
 *  - Delegate rendering to components / hooks
 *
 * Everything that touches a specific piece of UI is delegated:
 *   Timer      → components/Timer.js
 *   ScoreStrip → components/ScoreStrip.js
 *   EndScreen  → components/EndScreen.js
 *   Board/path → hooks/useBoard.js
 *   Drag input → hooks/useDrag.js
 *   WS layer   → lib/ws.js
 *   DOM utils  → lib/utils.js
 */

import { connect, send, onMessage } from './lib/ws.js';
import { showScreen, toast, showScorePop } from './lib/utils.js';
import { createBoard } from './hooks/useBoard.js';
import { initDrag }    from './hooks/useDrag.js';
import { Timer }       from './components/Timer.js';
import { ScoreStrip }  from './components/ScoreStrip.js';
import { EndScreen }   from './components/EndScreen.js';

// ── APP STATE ──
let myIndex   = -1;
let isHost    = false;
const TOTAL_TIME = 90;

// Board hook — owns path state and word submission
const board = createBoard(send);

// ── WEBSOCKET CONNECTION STATUS ──
onMessage('__connected',    () => _setConn(true));
onMessage('__disconnected', () => _setConn(false));
onMessage('__error',        () => _setConn(false));

function _setConn(ok) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  if (dot)   dot.className   = 'conn-dot ' + (ok ? 'ok' : 'err');
  if (label) label.textContent = ok ? 'connected' : 'reconnecting…';
}

// ── SERVER MESSAGE HANDLERS ──

onMessage('room_created', msg => {
  myIndex = 0; isHost = true;
  showScreen('s-lobby');
  _updateLobby([_getName()], msg.code, true);
});

onMessage('room_joined', () => {
  showScreen('s-lobby');
});

onMessage('lobby', msg => {
  _updateLobby(msg.players, msg.code, isHost);
});

onMessage('game_starting', () => {
  toast('🔤 Game starting!', 'good');
});

onMessage('game_state', msg => {
  myIndex = msg.myIndex;
  board.setBoard(msg.board);

  if (msg.phase === 'playing') {
    showScreen('s-game');
    _renderBoard(msg.board);
    ScoreStrip.render(msg.players, myIndex);
    Timer.update(msg.timeLeft, TOTAL_TIME);
  }
});

onMessage('tick', msg => {
  Timer.update(msg.timeLeft, TOTAL_TIME);
});

onMessage('score_update', msg => {
  ScoreStrip.render(msg.players, myIndex);
});

onMessage('word_result', msg => {
  board.onWordResult(msg);
  if (msg.ok) {
    const anchor = document.getElementById('grid-wrap');
    if (anchor) showScorePop('+' + msg.pts, anchor);
  }
});

onMessage('game_over', msg => {
  showScreen('s-end');
  EndScreen.render(msg, myIndex);
});

onMessage('error', msg => {
  toast('⚠ ' + msg.msg, 'bad');
});

onMessage('player_left', msg => {
  toast(`${msg.name} left`);
});

// ── LOBBY HELPERS ──

function _updateLobby(players, code, amHost) {
  const codeEl   = document.getElementById('lobby-code');
  const listEl   = document.getElementById('lobby-players');
  const actionEl = document.getElementById('lobby-action');
  const hintEl   = document.getElementById('lobby-hint');

  if (codeEl) codeEl.textContent = code;

  if (listEl) {
    listEl.innerHTML = players.map((n, i) =>
      `<div class="player-chip${i === myIndex ? ' me' : ''}">${i === 0 ? '👑 ' : ''}${n}</div>`
    ).join('');
  }

  if (amHost) {
    if (actionEl) actionEl.innerHTML =
      `<button class="btn btn-primary" onclick="window._startGame()" ${players.length < 2 ? 'disabled' : ''}>Start Game!</button>`;
    if (hintEl) hintEl.textContent =
      players.length < 2 ? 'Waiting for players…' : `${players.length}/4 ready!`;
  } else {
    if (actionEl) actionEl.innerHTML = '';
    if (hintEl)   hintEl.textContent = 'Waiting for host to start…';
  }
}

// ── BOARD RENDER ──

function _renderBoard(letters) {
  const grid = document.getElementById('g-grid');
  if (!grid) return;
  grid.innerHTML = '';

  letters.forEach((letter, i) => {
    const tile = document.createElement('div');
    tile.className  = 'tile';
    tile.dataset.idx = i;
    tile.innerHTML  = letter.toUpperCase() +
      `<span class="tile-index">${i}</span>`;
    grid.appendChild(tile);
  });

  board.clearFoundList();
  // Wire up drag now that tiles exist in the DOM
  initDrag(board);
}

// ── INPUT HELPERS ──

function _getName() {
  const el = document.getElementById('inp-name');
  const n  = el?.value.trim();
  if (!n) { toast('Enter your name first!', 'bad'); return null; }
  return n;
}

// ── GLOBAL ACTIONS (called from inline HTML onclick) ──
// Exposed on window so onclick="" attributes in index.html can reach them.

window._createRoom = function () {
  const name = _getName(); if (!name) return;
  myIndex = 0; isHost = true;
  send({ type: 'create_room', name });
};

window._joinRoom = function () {
  const name = _getName(); if (!name) return;
  const code = document.getElementById('inp-code')?.value.trim().toUpperCase();
  if (!code) { toast('Enter room code', 'bad'); return; }
  myIndex = -1; isHost = false;
  send({ type: 'join_room', name, code });
};

window._soloStart = function () {
  const name = _getName(); if (!name) return;
  myIndex = 0; isHost = true;
  send({ type: 'solo_start', name });
};

window._startGame = function () {
  send({ type: 'start_game' });
};

window._clearPath = function () {
  board.clearPath();
};

// ── BOOT ──
connect();