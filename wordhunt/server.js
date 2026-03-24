const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const PUBLIC_DIR = path.resolve(path.dirname(require.resolve('./package.json')), 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ── DICTIONARY ──
const RAW_WORDS = require('an-array-of-english-words');

const WORD_ARRAY = RAW_WORDS.filter(
  w => w.length >= 3 && w.length <= 8 && /^[a-z]+$/.test(w)
);

const WORD_SET = new Set(WORD_ARRAY);

console.log(`[dict] loaded ${WORD_ARRAY.length} words`);

// ── TRIE ──
class TrieNode {
  constructor() { this.children = Object.create(null); this.isEnd = false; }
}

class Trie {
  constructor() { this.root = new TrieNode(); }

  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
    }
    node.isEnd = true;
  }

  startsWith(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children[ch]) return false;
      node = node.children[ch];
    }
    return true;
  }

  search(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children[ch]) return false;
      node = node.children[ch];
    }
    return node.isEnd;
  }
}

const TRIE = new Trie();
for (const w of WORD_ARRAY) TRIE.insert(w);
console.log(`[trie] built`);

// ── BOARD GENERATION ──
const LETTER_WEIGHTS = {
  a:9, e:12, i:9, o:8, u:4,
  s:6, t:6,  r:6, n:6, l:4,
  h:3, d:4,  c:3, p:2, m:2,
  g:3, b:2,  f:2, w:2, y:2,
  k:1, v:1,  x:1, j:1, q:1, z:1,
};
const LW_LETTERS = Object.keys(LETTER_WEIGHTS);
const LW_WEIGHTS = Object.values(LETTER_WEIGHTS);
const LW_TOTAL   = LW_WEIGHTS.reduce((a, b) => a + b, 0);

function weightedRandom() {
  let r = Math.random() * LW_TOTAL;
  for (let i = 0; i < LW_LETTERS.length; i++) {
    r -= LW_WEIGHTS[i];
    if (r <= 0) return LW_LETTERS[i];
  }
  return LW_LETTERS[LW_LETTERS.length - 1];
}

const VOWELS = new Set(['a','e','i','o','u']);

function generateBoard(size = 4) {
  const board = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    let vowelCount = 0;
    for (let c = 0; c < size; c++) {
      if (vowelCount < 2 && c === size - 1) {
        const v = [...VOWELS][Math.floor(Math.random() * 5)];
        row.push(v);
        vowelCount++;
      } else {
        const ch = weightedRandom();
        if (VOWELS.has(ch)) vowelCount++;
        row.push(ch);
      }
    }
    board.push(...row);
  }
  return board;
}

// ── BOARD SOLVER ──
const DIRECTIONS = [];
for (let dr = -1; dr <= 1; dr++)
  for (let dc = -1; dc <= 1; dc++)
    if (dr !== 0 || dc !== 0) DIRECTIONS.push([dr, dc]);

function solveBoard(board, size = 4) {
  const found = new Set();

  function dfs(r, c, visited, word) {
    if (word.length >= 3 && TRIE.search(word)) found.add(word);
    if (word.length >= 8) return;
    if (!TRIE.startsWith(word)) return;

    for (const [dr, dc] of DIRECTIONS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const ni = nr * size + nc;
      if (visited.has(ni)) continue;
      visited.add(ni);
      dfs(nr, nc, visited, word + board[ni]);
      visited.delete(ni);
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      dfs(r, c, new Set([i]), board[i]);
    }
  }

  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

// ── SCORING ──
function scoreWord(word) {
  const table = { 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800, 8: 2200 };
  return table[word.length] ?? 100;
}

// ── PATH VALIDATION ──
function validatePath(board, path, size = 4) {
  if (!path || path.length < 3) return false;

  const visited = new Set();
  let word = '';

  for (let k = 0; k < path.length; k++) {
    const idx = path[k];
    if (!Number.isInteger(idx) || idx < 0 || idx >= board.length) return false;
    if (visited.has(idx)) return false;

    if (k > 0) {
      const pr = Math.floor(path[k - 1] / size), pc = path[k - 1] % size;
      const cr = Math.floor(idx / size),          cc = idx % size;
      const dr = Math.abs(cr - pr), dc = Math.abs(cc - pc);
      if (dr > 1 || dc > 1) return false;
    }

    visited.add(idx);
    word += board[idx];
  }

  return WORD_SET.has(word) ? word : false;
}

// ── ROOMS ──
const rooms        = {};
const GAME_DURATION = 90;

function broadcast(room, msg) {
  const json = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(json);
  });
}

function broadcastState(room) {
  const g = room.game;
  room.players.forEach((p, i) => {
    if (p.ws.readyState !== WebSocket.OPEN) return;
    p.ws.send(JSON.stringify({
      type:     'game_state',
      myIndex:  i,
      board:    g.board,
      timeLeft: Math.max(0, g.timeLeft),
      phase:    g.phase,
      allWords: g.phase === 'ended' ? g.allWords : null,
      players:  g.players.map((gp, j) => ({
        name:      gp.name,
        score:     gp.score,
        words:     j === i ? gp.words : (g.phase === 'ended' ? gp.words : gp.words.map(() => '?')),
        wordCount: gp.words.length,
      })),
    }));
  });
}

function initGame(room) {
  const board    = generateBoard(4);
  const allWords = solveBoard(board, 4);

  console.log(`[game] new board | ${allWords.length} solvable words`);

  const g = {
    board,
    allWords,
    timeLeft: GAME_DURATION,
    phase:    'playing',
    players:  room.players.map(p => ({ name: p.name, score: 0, words: [] })),
    timer:    null,
  };
  room.game = g;

  broadcast(room, { type: 'game_starting', players: room.players.map(p => p.name) });
  broadcastState(room);

  g.timer = setInterval(() => {
    g.timeLeft--;
    broadcast(room, { type: 'tick', timeLeft: g.timeLeft });

    if (g.timeLeft <= 0) {
      clearInterval(g.timer);
      g.phase = 'ended';
      broadcastState(room);
      broadcast(room, {
        type:    'game_over',
        board:   g.board,          // ← included so the analysis screen can replay paths
        players: g.players.map(p => ({ name: p.name, score: p.score, words: p.words })),
        allWords: g.allWords,
        winner:  g.players.reduce((a, b) => a.score >= b.score ? a : b).name,
      });
    }
  }, 1000);
}

// ── WEBSOCKET ──
wss.on('connection', ws => {
  let myRoom = null, myCode = null;

  ws.send(JSON.stringify({ type: 'dictionary', words: WORD_ARRAY }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── CREATE ROOM ──
    if (msg.type === 'create_room') {
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      rooms[code] = { players: [], game: null };
      myCode = code;
      myRoom = rooms[code];
      myRoom.players.push({ name: msg.name, ws });
      ws.send(JSON.stringify({ type: 'room_created', code, playerIndex: 0 }));
    }

    // ── JOIN ROOM ──
    else if (msg.type === 'join_room') {
      const code = (msg.code || '').toUpperCase();
      if (!rooms[code]) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room not found' })); return;
      }
      const room = rooms[code];
      if (room.game?.phase === 'playing') {
        ws.send(JSON.stringify({ type: 'error', msg: 'Game in progress' })); return;
      }
      if (room.players.length >= 4) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room full (max 4)' })); return;
      }
      myCode = code;
      myRoom = room;
      room.players.push({ name: msg.name, ws });
      ws.send(JSON.stringify({ type: 'room_joined', code, playerIndex: room.players.length - 1 }));
      broadcast(room, { type: 'lobby', players: room.players.map(p => p.name), code });
    }

    // ── START GAME ──
    else if (msg.type === 'start_game') {
      if (!myRoom) return;
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      if (pi !== 0) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Only host can start' })); return;
      }
      initGame(myRoom);
    }

    // ── SOLO START ──
    else if (msg.type === 'solo_start') {
      const code = '__SOLO_' + Math.random().toString(36).slice(2, 8);
      rooms[code] = { players: [{ name: msg.name, ws }], game: null };
      myCode = code;
      myRoom = rooms[code];
      ws.send(JSON.stringify({ type: 'room_joined', code, playerIndex: 0 }));
      initGame(myRoom);
    }

    // ── SUBMIT WORD ──
    else if (msg.type === 'submit_word') {
      if (!myRoom?.game) return;
      const g  = myRoom.game;
      if (g.phase !== 'playing') return;

      const pi   = myRoom.players.findIndex(p => p.ws === ws);
      const gp   = g.players[pi];
      const word = validatePath(g.board, msg.path);

      if (!word) {
        ws.send(JSON.stringify({ type: 'word_result', ok: false, msg: 'Invalid word or path' }));
        return;
      }
      if (gp.words.includes(word)) {
        ws.send(JSON.stringify({ type: 'word_result', ok: false, msg: 'Already found!' }));
        return;
      }

      const pts   = scoreWord(word);
      gp.words.push(word);
      gp.score   += pts;

      ws.send(JSON.stringify({ type: 'word_result', ok: true, word, pts, score: gp.score }));
      broadcast(myRoom, {
        type:    'score_update',
        players: g.players.map(p => ({ name: p.name, score: p.score, wordCount: p.words.length })),
      });
    }
  });

  ws.on('close', () => {
    if (!myRoom) return;
    const idx = myRoom.players.findIndex(p => p.ws === ws);
    if (idx !== -1) {
      broadcast(myRoom, { type: 'player_left', name: myRoom.players[idx].name });
      myRoom.players.splice(idx, 1);
    }
    if (myRoom.players.length === 0) {
      if (myRoom.game?.timer) clearInterval(myRoom.game.timer);
      delete rooms[myCode];
    }
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`\n Word Hunt running on http://localhost:${PORT}\n`));