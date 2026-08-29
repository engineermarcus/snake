const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, perMessageDeflate: false });

const GRID = 30;
const TICK_MS = 300;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 1;
const MATCH_SECONDS_DEFAULT = 180;
const RECONNECT_GRACE_MS = 30000;
const DEATH_PENALTY = 1;
const RESPAWN_DELAY_MS = 1500;

// Allowed avatar colors (red is strictly forbidden - reserved for ball)
const ALLOWED_COLORS = [
  '#4dff88', '#4dc4ff', '#ffb347', '#ff5cd6',
  '#c084fc', '#ffe14d', '#5cffe1', '#ffd700',
  '#38ef7d', '#00f2fe', '#f9d423', '#a8ff78'
];

function isRedColor(hex) {
  if (!hex || typeof hex !== 'string') return true;
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6) return true;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return true;
  return (r > 170 && g < 120 && b < 120);
}

function sanitizeColor(c) {
  if (!c || isRedColor(c)) return ALLOWED_COLORS[0];
  return c;
}

// room code -> Room object
const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

function makeRoom(code) {
  return {
    code,
    adminId: null,
    players: {},      // id -> { token, ws, connected, color, name, disconnectTimer }
    snakes: {},       // id -> snake state
    food: spawnFood(),
    sockets: new Set(),
    loopHandle: null,
    running: false,
    paused: false,    // admin pause
    matchSeconds: MATCH_SECONDS_DEFAULT,
    matchEndsAt: null,
    matchTimerHandle: null,
    seq: 0,
  };
}

// ---- snake helpers ----
function spawnFood() {
  return { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
}

function randomDir() {
  const opts = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  return opts[Math.floor(Math.random() * opts.length)];
}

function newSnake(room) {
  const occupied = new Set();
  for (const id in room.snakes) {
    if (!room.snakes[id].dead) {
      room.snakes[id].body.forEach(c => occupied.add(`${c.x},${c.y}`));
    }
  }
  let pt;
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * GRID), y = Math.floor(Math.random() * GRID);
    if (!occupied.has(`${x},${y}`)) { pt = { x, y }; break; }
  }
  if (!pt) pt = { x: Math.floor(GRID / 2), y: Math.floor(GRID / 2) };
  const dir = randomDir();
  return { body: [pt], dir, nextDir: dir, score: 0, grow: 0, dead: false };
}

function respawnSnake(room, id) {
  if (!room.snakes[id]) return;
  const fresh = newSnake(room);
  room.snakes[id].body = fresh.body;
  room.snakes[id].dir = fresh.dir;
  room.snakes[id].nextDir = fresh.nextDir;
  room.snakes[id].grow = 0;
  room.snakes[id].dead = false;
}

// ---- broadcast helpers ----
function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.sockets) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function activeIds(room) {
  return Object.keys(room.players).filter(id => room.players[id].connected);
}

function canStart(room) {
  return activeIds(room).length >= MIN_PLAYERS;
}

function publicGame(room) {
  const out = {};
  for (const id in room.snakes) {
    const p = room.players[id];
    out[id] = {
      body: room.snakes[id].body,
      score: room.snakes[id].score,
      dead: room.snakes[id].dead,
      color: p ? p.color : '#888',
      name: p ? (p.name || id.slice(-4)) : id.slice(-4),
      connected: p ? p.connected : false,
    };
  }
  return {
    grid: GRID,
    snakes: out,
    food: room.food,
    running: room.running,
    paused: room.paused,
    timeRemaining: room.matchEndsAt ? Math.max(0, Math.round((room.matchEndsAt - Date.now()) / 1000)) : room.matchSeconds,
    adminId: room.adminId,
    code: room.code
  };
}

function broadcastState(room) {
  room.seq += 1;
  broadcast(room, { type: 'state', seq: room.seq, game: publicGame(room) });
}

// ---- loop control ----
function startLoopIfReady(room) {
  if (canStart(room) && !room.loopHandle && !room.paused) {
    room.running = true;
    if (!room.matchEndsAt) startMatchTimer(room);
    room.loopHandle = setInterval(() => tick(room), TICK_MS);
    broadcastState(room);
  }
}

function pauseLoopIfBelowMin(room, reason) {
  if (!canStart(room) && room.loopHandle) {
    clearInterval(room.loopHandle);
    room.loopHandle = null;
    room.running = false;
    pauseMatchTimer(room);
    broadcast(room, { type: 'paused', reason });
  }
}

// ---- admin pause/resume ----
function adminPause(room) {
  if (!room.running || room.paused) return;
  clearInterval(room.loopHandle);
  room.loopHandle = null;
  room.running = false;
  room.paused = true;
  pauseMatchTimer(room);
  broadcast(room, { type: 'adminPaused' });
  broadcastState(room);
}

function adminResume(room) {
  if (!room.paused) return;
  room.paused = false;
  if (canStart(room)) {
    room.running = true;
    if (!room.matchEndsAt) startMatchTimer(room);
    room.loopHandle = setInterval(() => tick(room), TICK_MS);
    broadcast(room, { type: 'adminResumed' });
    broadcastState(room);
  }
}

// ---- match timer ----
function startMatchTimer(room) {
  room.matchEndsAt = Date.now() + room.matchSeconds * 1000;
  clearInterval(room.matchTimerHandle);
  room.matchTimerHandle = setInterval(() => {
    if (!room.running) return;
    if (room.matchEndsAt - Date.now() <= 0) endMatch(room);
  }, 500);
}

function pauseMatchTimer(room) {
  if (room.matchEndsAt) {
    room.matchSeconds = Math.max(0, Math.round((room.matchEndsAt - Date.now()) / 1000));
  }
}

function endMatch(room) {
  clearInterval(room.loopHandle);
  room.loopHandle = null;
  clearInterval(room.matchTimerHandle);
  room.matchTimerHandle = null;
  room.running = false;
  room.paused = false;

  const standings = Object.keys(room.snakes)
    .map(id => ({
      id,
      score: room.snakes[id].score,
      color: room.players[id] ? room.players[id].color : '#888',
      name: room.players[id] ? (room.players[id].name || id.slice(-4)) : id.slice(-4)
    }))
    .sort((a, b) => b.score - a.score);

  const top = standings.length ? standings[0].score : 0;
  const winners = standings.filter(s => s.score === top).map(w => w.id);

  broadcast(room, { type: 'matchOver', standings, winners });
  setTimeout(() => {
    resetMatch(room);
    startLoopIfReady(room);
  }, 6000);
}

function resetMatch(room) {
  for (const id in room.snakes) {
    room.snakes[id] = newSnake(room);
  }
  room.food = spawnFood();
  room.matchSeconds = MATCH_SECONDS_DEFAULT;
  room.matchEndsAt = null;
}

// ---- tick ----
function tick(room) {
  const ids = Object.keys(room.snakes).filter(id => !room.snakes[id].dead);
  const nextHeads = {};
  for (const id of ids) {
    const s = room.snakes[id];
    s.dir = s.nextDir;
    nextHeads[id] = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
  }

  const deaths = new Map();
  // wall + self collision
  for (const id of ids) {
    if (deaths.has(id)) continue;
    const nh = nextHeads[id];
    if (nh.x < 0 || nh.x >= GRID || nh.y < 0 || nh.y >= GRID) {
      deaths.set(id, { creditTo: null });
      continue;
    }
    if (room.snakes[id].body.some(seg => seg.x === nh.x && seg.y === nh.y)) {
      deaths.set(id, { creditTo: null });
      continue;
    }
  }

  // snake vs snake collision
  for (const id of ids) {
    if (deaths.has(id)) continue;
    const nh = nextHeads[id];
    for (const oid of ids) {
      if (oid === id) continue;
      const onh = nextHeads[oid];
      if (onh && onh.x === nh.x && onh.y === nh.y) {
        if (!deaths.has(id)) deaths.set(id, { creditTo: null });
        if (!deaths.has(oid)) deaths.set(oid, { creditTo: null });
        continue;
      }
      if (room.snakes[oid].body.some(seg => seg.x === nh.x && seg.y === nh.y)) {
        deaths.set(id, { creditTo: oid });
      }
    }
  }

  for (const [id, info] of deaths) {
    killSnake(room, id, info.creditTo);
  }

  for (const id of ids) {
    if (deaths.has(id)) continue;
    const s = room.snakes[id];
    const nh = nextHeads[id];
    s.body.unshift(nh);
    if (nh.x === room.food.x && nh.y === room.food.y) {
      s.score += 1;
      room.food = spawnFood();
    } else if (s.grow > 0) {
      s.grow -= 1;
    } else {
      s.body.pop();
    }
  }

  broadcastState(room);
}

function killSnake(room, id, creditTo) {
  const s = room.snakes[id];
  if (!s || s.dead) return;
  s.dead = true;
  s.score -= DEATH_PENALTY;
  if (creditTo && room.snakes[creditTo]) {
    room.snakes[creditTo].score += 1;
    room.snakes[creditTo].grow += 1;
  }
  broadcast(room, { type: 'died', player: id, creditTo: creditTo || null });
  setTimeout(() => {
    if (room.snakes[id] && room.running) respawnSnake(room, id);
  }, RESPAWN_DELAY_MS);
}

function cleanupRoomIfEmpty(code) {
  const room = rooms[code];
  if (!room) return;
  if (Object.keys(room.players).length === 0) {
    clearInterval(room.loopHandle);
    clearInterval(room.matchTimerHandle);
    delete rooms[code];
  }
}

// ---- WebSocket Connection Handling ----
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // CREATE ROOM
    if (msg.type === 'createRoom') {
      const code = genCode();
      rooms[code] = makeRoom(code);
      sendTo(ws, { type: 'roomCreated', code });
      return;
    }

    // JOIN ROOM
    if (msg.type === 'joinRoom') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms[code];
      if (!room) {
        sendTo(ws, { type: 'error', reason: 'Room not found. Check the code or create a match.' });
        return;
      }

      // Reconnect via existing token
      if (msg.token) {
        const existingId = Object.keys(room.players).find(id => room.players[id].token === msg.token);
        if (existingId) {
          const p = room.players[existingId];
          clearTimeout(p.disconnectTimer);
          p.ws = ws;
          p.connected = true;
          if (msg.name) p.name = String(msg.name).trim().slice(0, 16);
          if (msg.color && !isRedColor(msg.color)) p.color = msg.color;
          ws.playerId = existingId;
          ws.roomCode = code;
          room.sockets.add(ws);

          sendTo(ws, {
            type: 'joined',
            player: existingId,
            token: msg.token,
            color: p.color,
            name: p.name || '',
            isAdmin: existingId === room.adminId,
            code
          });
          broadcast(room, {
            type: 'presence',
            player: existingId,
            connected: true,
            name: p.name || '',
            color: p.color
          });
          startLoopIfReady(room);
          broadcastState(room);
          return;
        }
      }

      // Check max players
      if (Object.keys(room.players).length >= MAX_PLAYERS) {
        room.sockets.add(ws);
        ws.roomCode = code;
        sendTo(ws, { type: 'spectator', code });
        sendTo(ws, { type: 'state', seq: room.seq, game: publicGame(room) });
        return;
      }

      const slot = 'pl_' + crypto.randomBytes(4).toString('hex');
      const token = crypto.randomBytes(12).toString('hex');
      const isAdmin = Object.keys(room.players).length === 0;
      if (isAdmin) room.adminId = slot;

      const chosenColor = sanitizeColor(msg.color);
      const chosenName = (msg.name ? String(msg.name).trim().slice(0, 16) : '') || ('Player ' + (Object.keys(room.players).length + 1));

      room.players[slot] = {
        token,
        ws,
        connected: true,
        color: chosenColor,
        name: chosenName,
        disconnectTimer: null
      };
      room.snakes[slot] = newSnake(room);
      ws.playerId = slot;
      ws.roomCode = code;
      room.sockets.add(ws);

      sendTo(ws, {
        type: 'joined',
        player: slot,
        token,
        color: room.players[slot].color,
        name: room.players[slot].name,
        isAdmin,
        code
      });
      broadcast(room, {
        type: 'presence',
        player: slot,
        connected: true,
        name: room.players[slot].name,
        color: room.players[slot].color
      });
      startLoopIfReady(room);
      broadcastState(room);
      return;
    }

    // In-room commands
    const room = ws.roomCode ? rooms[ws.roomCode] : null;
    if (!room) return;

    if (msg.type === 'dir' && ws.playerId && room.snakes[ws.playerId]) {
      const s = room.snakes[ws.playerId];
      if (s.dead) return;
      const { x, y } = msg.dir;
      if (![-1, 0, 1].includes(x) || ![-1, 0, 1].includes(y) || Math.abs(x) + Math.abs(y) !== 1) return;
      if (s.dir.x === -x && s.dir.y === -y) return; // no 180 reversals
      s.nextDir = { x, y };
      // immediate ack to eliminate perceived input lag on high-latency networks
      sendTo(ws, { type: 'dirAck', dir: s.nextDir });
      return;
    }

    // Settings (Admin only)
    if (msg.type === 'setMatchSeconds') {
      if (ws.playerId !== room.adminId) {
        sendTo(ws, { type: 'error', reason: 'Only the match admin can change game settings.' });
        return;
      }
      const n = Number(msg.seconds);
      if (Number.isFinite(n) && n >= 30 && n <= 1800) {
        room.matchSeconds = Math.round(n);
        broadcast(room, { type: 'settings', matchSeconds: room.matchSeconds });
      }
      return;
    }

    // Pause/Resume (Admin only)
    if (msg.type === 'adminPause') {
      if (ws.playerId === room.adminId) adminPause(room);
      return;
    }
    if (msg.type === 'adminResume') {
      if (ws.playerId === room.adminId) adminResume(room);
      return;
    }

    // Text Chat
    if (msg.type === 'chat' && ws.playerId) {
      const p = room.players[ws.playerId];
      if (!p) return;
      const text = String(msg.text || '').trim().slice(0, 200);
      if (!text) return;
      broadcast(room, {
        type: 'chat',
        from: ws.playerId,
        name: p.name || ws.playerId.slice(-4),
        color: p.color,
        text
      });
      return;
    }

    // WebRTC Voice Signaling
    if (msg.type === 'rtcOffer' || msg.type === 'rtcAnswer' || msg.type === 'rtcIce') {
      const target = msg.to;
      const targetPlayer = room.players[target];
      if (!targetPlayer || !targetPlayer.ws) return;
      sendTo(targetPlayer.ws, { ...msg, from: ws.playerId });
      return;
    }

    if (msg.type === 'rtcPeers' && ws.playerId) {
      const peers = Object.keys(room.players).filter(id => id !== ws.playerId && room.players[id].connected);
      sendTo(ws, { type: 'rtcPeers', peers });
      return;
    }

    if (msg.type === 'ping') {
      sendTo(ws, { type: 'pong', t: msg.t });
      return;
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    const room = code ? rooms[code] : null;
    if (room) room.sockets.delete(ws);
    const pid = ws.playerId;
    if (!pid || !room || !room.players[pid] || room.players[pid].ws !== ws) return;

    room.players[pid].connected = false;
    broadcast(room, { type: 'presence', player: pid, connected: false });
    pauseLoopIfBelowMin(room, 'below-minimum-players');

    broadcast(room, { type: 'rtcPeerLeft', peer: pid });

    room.players[pid].disconnectTimer = setTimeout(() => {
      if (room.players[pid] && !room.players[pid].connected) {
        if (pid === room.adminId) {
          // Transfer admin rights to another active player
          const next = Object.keys(room.players).find(id => id !== pid && room.players[id].connected);
          if (next) {
            room.adminId = next;
            const nws = room.players[next].ws;
            sendTo(nws, { type: 'adminTransfer' });
            broadcast(room, { type: 'newAdmin', adminId: next });
          }
        }
        delete room.players[pid];
        delete room.snakes[pid];
        broadcast(room, { type: 'presence', player: pid, connected: false, freed: true });
        broadcastState(room);
        cleanupRoomIfEmpty(code);
      }
    }, RECONNECT_GRACE_MS);
  });
});

// Heartbeat every 8 seconds to drop dead half-open connections on bad wifi
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 8000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`SNAKE // ARENA listening on port ${PORT}`));
