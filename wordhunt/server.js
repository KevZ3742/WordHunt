const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PUBLIC_DIR = path.resolve(path.dirname(require.resolve('./package.json')), 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ── TRIE ──
class TrieNode {
  constructor() { this.children = {}; this.isEnd = false; }
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

// ── WORD LIST (curated common English words 3+ letters) ──
// We embed a reasonable word set directly so no file dependency is needed
const WORD_LIST = `
ace aces ache ached aches acing acme acne acre acres act acts add adds age aged ages ago aid aids aim aims air airs ale ales all aloe also alto amen amid amp amps and ants any ape aped apes apex arch are area areas ark arm arms army art arts ash ask asks ate atop awe axe axes axis aye ayes
back backs bad bade bake baked baler bales ball balls band bands bane banes bang bangs bank banks bans bar bare bared bark barks barn barns bars base bases bash bask basks bass baste bat bate bated bath baths bats baud bay bays bead beads beam beams bean beans bear bears beat beats bed beds beer beers beg begs bell bells belt belts best bets bid bide bin bind bins bit bite bites bits blow blue blues blur blurs boat boats bold bolt bolts bone bones book books boom booms boot boots bore bored born bow bows boy boys bred brew brews brim brow brown bud buds bug bugs bun buns bus bust but buy buys
cab cabs cage cages cake cakes calm calms came camp camps cane canes cap cape capes caps card cards care cares cart carts case cases cash cast casts cat cave caves cent cine cite claim clan clay clam clamp clap clash cleat clip clog clone close cob code coded coin coins cold color comb come cone copes core corn cost costs cot cots count coup crab cram crawl cream crow crown crud cube cue cues cup cups curb curbs cure cures curl curls cut cute cuts
dab dabs dam dame damp damps dare dares dark dash date dated day days deal deals dean debt deep den deny desk dew did die dies dig digs dim dime dims dip dips disk doe dogs dole dome done doom dot dots dove down drag draw drew drip drop drum dual due dug dune dusk dust
each ear earn ears ease east eat eave edge elbow elm email
face fade fail faint fall fame far fare fares farm fast fate fawn fear feast feel felt felt fend fern few fin fine fines fins firm fist fit fits fix flair flame flap flat flaw fled flew flip flock flop flour flow foam foil fold fond font fool form fort foal foil foe fond food fore fore form fort foam foam foul four frame frog from fume fund fuse
gab gale game games gap gaps gate gave gear gels gem get gets give given glad glee glow glue goad goal goat goats gold golf gong got gown grab grade grin grip grow gum gust gust guys
had hag hale hall halo halp halt hand hang hard hare harm harp has hast hat hate hay heal heap heat heel held help helm her herd here hill hint hire hive hoe hold hole home hood hook hope horn hot hour how hug hulk hull hum hump hunt hurt husk hymn
ice icy idea idle idol inch inky into iris isle
jab jar jaw jazz jet jig job jolt joy jug just
keen kept kiln kind kite knob knot know
lab lace lack lamp land lane laps lash last late laud lawn leaf lean leap lend lime limp line lint lion list live loan lode loft lone long loop lore lorn loss lure
mad made mail main make male mall malt mama mane map mare mark marsh mast mate mean meat meek melt mend menu mere mesh met mew mile mind mint miss moan moat mode mole molt moon mop mow muck mule must
nag nail name nap near nest next nice node node noel noon nor note noun numb
oak oar odd ode oil omen open oral orb ore oven over
pace pack pact page paid pail pain pair pale palm pane part past path pave pawn peak pear peel peg pen pest pet pile pill pine pipe plan plat play plea plot plow plug plum pod poem poet pole poll pond pore port pose pound pour power pray prey prow pull pump purl push puts
race rack rage rail rain rake ramp rang rank rant rap rare rash rate rave raw read real realm reap reel rely rend rent rest rice ride rife rift ring rink rip rise risk roam roar robe rode role roof root rope rose rove rude rule rune rung rush rust
sac safe sage sail sale salt same sand sane sang sank sap save scan seam seed seek seem sent set sew sewn shed ship show side silk sin sine sip sit skew skin skip slab slam slap slat sled slew slim slip slop slot slow slug slum snap snob soak soar sob sock sod soil some song soul soup spam span spar spin spot star stem step stew stir stud sub sue suit sum swam
tab tail take tale tall tame tang tank tape tare tart task taut team tear ten tend tent term than tide tile time tine tip tire toad told toll tome tone top torn tote tow town toy trap trim trio trip true tuck tune turf turn tusk
ulcer undo unit upon urge used
vale vast veil vend vent vest vine void volt vote
wade wage wail wake wane ward ware warp wart wasp wave ways weal weld went west whet whim whip wide wile wind wink wisp woe woke wolf word work worn wrap writ
yam yap yawn year yell yelp yore
zeal zest zinc zone
`.trim().split(/\s+/).filter(w => w.length >= 3);

const TRIE = new Trie();
const WORD_SET = new Set();
for (const w of WORD_LIST) {
  TRIE.insert(w);
  WORD_SET.add(w);
}

// ── BOARD GENERATION & SOLVING ──
const LETTER_WEIGHTS = {
  a:9,e:12,i:9,o:8,u:4,s:6,t:6,r:6,n:6,l:4,h:3,d:4,c:3,p:2,m:2,g:3,b:2,f:2,
  w:2,y:2,k:1,v:1,x:1,j:1,q:1,z:1
};
const LETTERS = Object.keys(LETTER_WEIGHTS);
const WEIGHTS = Object.values(LETTER_WEIGHTS);

function weightedRandom() {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < LETTERS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return LETTERS[i];
  }
  return LETTERS[LETTERS.length - 1];
}

function generateBoard(size = 4) {
  // Ensure ~2-3 vowels guaranteed per row
  const board = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    let vowels = 0;
    for (let c = 0; c < size; c++) {
      if (vowels < 2 && c >= size - 1) {
        // Force a vowel
        const v = ['a','e','i','o','u'][Math.floor(Math.random() * 5)];
        row.push(v);
        vowels++;
      } else {
        const ch = weightedRandom();
        if ('aeiou'.includes(ch)) vowels++;
        row.push(ch);
      }
    }
    board.push(...row);
  }
  return board;
}

function solveBoard(board, size = 4) {
  const found = new Set();
  const dirs = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (dr !== 0 || dc !== 0) dirs.push([dr, dc]);

  function dfs(r, c, visited, word) {
    if (word.length >= 3 && TRIE.search(word)) found.add(word);
    if (word.length >= 8) return; // Limit depth
    if (!TRIE.startsWith(word)) return;
    for (const [dr, dc] of dirs) {
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
      const visited = new Set([i]);
      dfs(r, c, visited, board[i]);
    }
  }

  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function scoreWord(word) {
  const pts = { 3: 100, 4: 400, 5: 800, 6: 1400, 7: 1800, 8: 2200 };
  return pts[word.length] || (word.length > 8 ? 2600 : 100);
}

// Validate a word path on the board
function validatePath(board, path, size = 4) {
  if (!path || path.length < 3) return false;
  const dirs = new Set();
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (dr !== 0 || dc !== 0) dirs.add(`${dr},${dc}`);

  const visited = new Set();
  let word = '';
  for (let k = 0; k < path.length; k++) {
    const idx = path[k];
    if (idx < 0 || idx >= board.length) return false;
    if (visited.has(idx)) return false;
    if (k > 0) {
      const pr = Math.floor(path[k-1] / size), pc = path[k-1] % size;
      const cr = Math.floor(idx / size), cc = idx % size;
      const dr = cr - pr, dc = cc - pc;
      if (!dirs.has(`${dr},${dc}`)) return false;
    }
    visited.add(idx);
    word += board[idx];
  }
  return WORD_SET.has(word) ? word : false;
}

// ── ROOMS ──
const rooms = {};
const GAME_DURATION = 90; // seconds

function broadcast(room, msg) {
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
  });
}

function sendTo(room, pi, msg) {
  const p = room.players[pi];
  if (p?.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
}

function broadcastState(room) {
  const g = room.game;
  room.players.forEach((p, i) => {
    if (p.ws.readyState !== WebSocket.OPEN) return;
    p.ws.send(JSON.stringify({
      type: 'game_state',
      myIndex: i,
      board: g.board,
      timeLeft: Math.max(0, g.timeLeft),
      phase: g.phase,
      allWords: g.phase === 'ended' ? g.allWords : null,
      players: g.players.map((gp, j) => ({
        name: gp.name,
        score: gp.score,
        words: j === i ? gp.words : (g.phase === 'ended' ? gp.words : gp.words.map(() => '?')),
        wordCount: gp.words.length,
      })),
    }));
  });
}

function initGame(room) {
  const board = generateBoard(4);
  const allWords = solveBoard(board, 4);
  const g = {
    board,
    allWords,
    timeLeft: GAME_DURATION,
    phase: 'playing',
    players: room.players.map(p => ({ name: p.name, score: 0, words: [] })),
    timer: null,
  };
  room.game = g;

  broadcast(room, { type: 'game_starting', players: room.players.map(p => p.name) });
  broadcastState(room);

  g.timer = setInterval(() => {
    g.timeLeft--;
    // Broadcast time every second
    broadcast(room, { type: 'tick', timeLeft: g.timeLeft });
    if (g.timeLeft <= 0) {
      clearInterval(g.timer);
      g.phase = 'ended';
      broadcastState(room);
      broadcast(room, {
        type: 'game_over',
        players: g.players.map(p => ({ name: p.name, score: p.score, words: p.words })),
        allWords: g.allWords,
        winner: g.players.reduce((a, b) => a.score >= b.score ? a : b).name,
      });
    }
  }, 1000);
}

// ── WEBSOCKET ──
wss.on('connection', ws => {
  let myRoom = null, myCode = null;

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create_room') {
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      rooms[code] = { players: [], game: null };
      myCode = code; myRoom = rooms[code];
      myRoom.players.push({ name: msg.name, ws });
      ws.send(JSON.stringify({ type: 'room_created', code, playerIndex: 0 }));
    }

    else if (msg.type === 'join_room') {
      const code = msg.code.toUpperCase();
      if (!rooms[code]) { ws.send(JSON.stringify({ type: 'error', msg: 'Room not found' })); return; }
      const room = rooms[code];
      if (room.game?.phase === 'playing') { ws.send(JSON.stringify({ type: 'error', msg: 'Game in progress' })); return; }
      if (room.players.length >= 4) { ws.send(JSON.stringify({ type: 'error', msg: 'Room full (max 4)' })); return; }
      myCode = code; myRoom = room;
      const idx = room.players.length;
      room.players.push({ name: msg.name, ws });
      ws.send(JSON.stringify({ type: 'room_joined', code, playerIndex: idx }));
      broadcast(room, { type: 'lobby', players: room.players.map(p => p.name), code });
    }

    else if (msg.type === 'start_game') {
      if (!myRoom) return;
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      if (pi !== 0) { ws.send(JSON.stringify({ type: 'error', msg: 'Only host can start' })); return; }
      initGame(myRoom);
    }

    else if (msg.type === 'solo_start') {
      // Solo mode — single player room
      const code = '__SOLO_' + Math.random().toString(36).slice(2, 8);
      rooms[code] = { players: [{ name: msg.name, ws }], game: null };
      myCode = code; myRoom = rooms[code];
      ws.send(JSON.stringify({ type: 'room_joined', code, playerIndex: 0 }));
      initGame(myRoom);
    }

    else if (msg.type === 'submit_word') {
      if (!myRoom?.game) return;
      const g = myRoom.game;
      if (g.phase !== 'playing') return;
      const pi = myRoom.players.findIndex(p => p.ws === ws);
      const gp = g.players[pi];

      const word = validatePath(g.board, msg.path);
      if (!word) {
        ws.send(JSON.stringify({ type: 'word_result', ok: false, msg: 'Invalid word or path' }));
        return;
      }
      if (gp.words.includes(word)) {
        ws.send(JSON.stringify({ type: 'word_result', ok: false, msg: 'Already found!' }));
        return;
      }

      const pts = scoreWord(word);
      gp.words.push(word);
      gp.score += pts;

      ws.send(JSON.stringify({ type: 'word_result', ok: true, word, pts, score: gp.score }));
      // Broadcast updated scores to all
      broadcast(myRoom, {
        type: 'score_update',
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
server.listen(PORT, () => console.log(`\n🔤 Word Hunt running on http://localhost:${PORT}\n`));