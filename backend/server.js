const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), roomsCount: Object.keys(rooms).length });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, perMessageDeflate: false });

const GRID = 30;
const TICK_MS = 280;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 1;
const MATCH_SECONDS_DEFAULT = 180;
const RECONNECT_GRACE_MS = 30000;
const DEATH_PENALTY = 1;
const RESPAWN_DELAY_MS = 1500;

// Allowed avatar colors (red is strictly forbidden - reserved for food ball)
const ALLOWED_COLORS = [
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#d946ef', '#f59e0b', '#14b8a6', '#eab308',
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

const DEFAULT_MODIFIERS = {
  portalWalls: true,
  gravityWells: true,
  shrinkingArena: false,
  teleportTiles: true,
  oneWayCorridors: false,
  elasticTether: false,
  inverseMode: false,
  detachableTail: true,
  segmentedOwnership: true,
  decayMode: false,
  symbioteFusion: true,
  packBonding: true,
  fogOfWar: false,
  colorReshuffle: false,
  mirroredCurse: true,
  fakeFood: true,
  chaosCards: true,
  leaderboardCurse: true,
  zLayers: true,
  bumperPhysics: false,
  weatherSystem: true
};

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
    players: {},
    snakes: {},
    food: spawnFood(GRID),
    fakeFoods: [],
    mines: [],
    severedChunks: [],
    teleporters: spawnTeleporters(GRID),
    gravityWells: [spawnGravityWell(GRID)],
    icePatches: spawnIcePatches(GRID),
    oneWayCorridors: spawnOneWayCorridors(GRID),
    storm: { active: false, radius: GRID / 2, center: { x: GRID / 2, y: GRID / 2 }, damageTick: 0 },
    weather: { wind: { x: 0, y: 0 }, timer: 0 },
    chaosCard: null,
    chaosTimer: 0,
    inverseModeActive: false,
    inverseTimer: 60,
    modifiers: { ...DEFAULT_MODIFIERS },
    sockets: new Set(),
    loopHandle: null,
    running: false,
    paused: false,
    matchSeconds: MATCH_SECONDS_DEFAULT,
    matchEndsAt: null,
    matchTimerHandle: null,
    seq: 0,
    tickCount: 0
  };
}

function spawnFood(grid, occupied = new Set()) {
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * grid);
    const y = Math.floor(Math.random() * grid);
    if (!occupied.has(`${x},${y}`)) return { x, y };
  }
  return { x: Math.floor(grid / 2), y: Math.floor(grid / 2) };
}

function spawnTeleporters(grid) {
  return [
    { a: { x: 4, y: 4 }, b: { x: grid - 5, y: grid - 5 }, color: '#06b6d4' },
    { a: { x: grid - 5, y: 4 }, b: { x: 4, y: grid - 5 }, color: '#a855f7' }
  ];
}

function spawnGravityWell(grid) {
  return {
    x: Math.floor(grid * 0.3 + Math.random() * grid * 0.4),
    y: Math.floor(grid * 0.3 + Math.random() * grid * 0.4),
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    pullRadius: 6
  };
}

function spawnIcePatches(grid) {
  const patches = [];
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor(5 + Math.random() * (grid - 10));
    const cy = Math.floor(5 + Math.random() * (grid - 10));
    patches.push({ x: cx, y: cy, radius: 2.5 });
  }
  return patches;
}

function spawnOneWayCorridors(grid) {
  return [
    { x: Math.floor(grid / 2) - 3, y: 3, w: 6, h: 2, dir: { x: 1, y: 0 } },
    { x: Math.floor(grid / 2) - 3, y: grid - 5, w: 6, h: 2, dir: { x: -1, y: 0 } }
  ];
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
    const x = Math.floor(Math.random() * GRID);
    const y = Math.floor(Math.random() * GRID);
    if (!occupied.has(`${x},${y}`)) { pt = { x, y }; break; }
  }
  if (!pt) pt = { x: Math.floor(GRID / 2), y: Math.floor(GRID / 2) };
  const dir = randomDir();
  return {
    body: [pt],
    dir,
    nextDir: dir,
    score: 0,
    grow: 0,
    dead: false,
    zLayer: 0,
    zCooldown: 0,
    shield: 0,
    curseTimer: 0,
    isMirrored: false,
    fusedWith: null,
    fusedTimer: 0,
    wrapCount: 0,
    lastUnfusedFrom: null,
    unfusedGrace: 0
  };
}

function respawnSnake(room, id) {
  if (!room.snakes[id]) return;
  const fresh = newSnake(room);
  room.snakes[id].body = fresh.body;
  room.snakes[id].dir = fresh.dir;
  room.snakes[id].nextDir = fresh.nextDir;
  room.snakes[id].grow = 0;
  room.snakes[id].dead = false;
  room.snakes[id].zLayer = 0;
  room.snakes[id].shield = 0;
  room.snakes[id].fusedWith = null;
  room.snakes[id].curseTimer = 0;
  room.snakes[id].isMirrored = false;
}

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
  const outSnakes = {};
  for (const id in room.snakes) {
    const p = room.players[id];
    const s = room.snakes[id];
    outSnakes[id] = {
      body: s.body,
      score: s.score,
      dead: s.dead,
      color: p ? p.color : '#888',
      name: p ? (p.name || id.slice(-4)) : id.slice(-4),
      connected: p ? p.connected : false,
      zLayer: s.zLayer,
      shield: s.shield > 0,
      isMirrored: s.isMirrored,
      fusedWith: s.fusedWith,
      wrapCount: s.wrapCount
    };
  }

  return {
    grid: GRID,
    snakes: outSnakes,
    food: room.food,
    fakeFoods: room.fakeFoods,
    mines: room.mines,
    severedChunks: room.severedChunks,
    teleporters: room.teleporters,
    gravityWells: room.gravityWells,
    icePatches: room.icePatches,
    oneWayCorridors: room.oneWayCorridors,
    storm: room.storm,
    weather: room.weather,
    chaosCard: room.chaosCard,
    inverseModeActive: room.inverseModeActive,
    inverseTimer: room.inverseTimer,
    modifiers: room.modifiers,
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
    .sort((a, b) => room.inverseModeActive ? (a.score - b.score) : (b.score - a.score));

  const top = standings.length ? standings[0].score : 0;
  const winners = standings.filter(s => s.score === top).map(w => w.id);

  broadcast(room, { type: 'matchOver', standings, winners });
  setTimeout(() => {
    resetMatch(room);
    startLoopIfReady(room);
  }, 6000);
}

function resetMatch(room) {
  for (const id in room.snakes) room.snakes[id] = newSnake(room);
  room.food = spawnFood(GRID);
  room.fakeFoods = [];
  room.mines = [];
  room.severedChunks = [];
  room.storm = { active: room.modifiers.shrinkingArena, radius: GRID / 2, center: { x: GRID / 2, y: GRID / 2 }, damageTick: 0 };
  room.matchSeconds = MATCH_SECONDS_DEFAULT;
  room.matchEndsAt = null;
  room.tickCount = 0;
  room.inverseModeActive = false;
  room.inverseTimer = 60;
  room.chaosCard = null;
}

function tick(room) {
  room.tickCount++;
  const m = room.modifiers;
  const ids = Object.keys(room.snakes).filter(id => !room.snakes[id].dead);

  if (m.inverseMode) {
    room.inverseTimer--;
    if (room.inverseTimer <= 0) {
      room.inverseModeActive = !room.inverseModeActive;
      room.inverseTimer = 60;
      broadcast(room, {
        type: 'chaosEvent',
        title: room.inverseModeActive ? 'INVERSE MODE ACTIVATED!' : 'NORMAL MODE RESTORED!',
        desc: room.inverseModeActive ? 'Shrinking is now winning! Getting eaten benefits you.' : 'Back to regular scoring rules.'
      });
    }
  }

  if (m.chaosCards) {
    room.chaosTimer = (room.chaosTimer || 0) + 1;
    if (room.chaosTimer >= 45) {
      room.chaosTimer = 0;
      const cards = [
        { id: 'SPEED_SURGE', title: 'SPEED SURGE', desc: 'All snakes speed up by 30%!' },
        { id: 'REVERSE_GRAVITY', title: 'GRAVITY SHIFT', desc: 'Gravity wells drift across the arena!' },
        { id: 'CHAOS_PORTAL', title: 'PORTAL WARP', desc: 'New teleporters opened on the grid!' },
        { id: 'FOOD_FRENZY', title: 'FOOD FRENZY', desc: 'Double food balls spawned!' }
      ];
      room.chaosCard = cards[Math.floor(Math.random() * cards.length)];
      broadcast(room, { type: 'chaosCardDraw', card: room.chaosCard });
      setTimeout(() => { room.chaosCard = null; }, 6000);
    }
  }

  if (m.gravityWells && room.gravityWells.length) {
    room.gravityWells.forEach(gw => {
      gw.x += gw.vx;
      gw.y += gw.vy;
      if (gw.x < 3 || gw.x > GRID - 4) gw.vx *= -1;
      if (gw.y < 3 || gw.y > GRID - 4) gw.vy *= -1;
    });
  }

  if (m.shrinkingArena) {
    room.storm.active = true;
    if (room.storm.radius > 6 && room.tickCount % 10 === 0) {
      room.storm.radius = Math.max(6, room.storm.radius - 0.25);
    }
  }

  if (m.weatherSystem && room.tickCount % 40 === 0) {
    const winds = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    room.weather.wind = winds[Math.floor(Math.random() * winds.length)];
  }

  if (m.fakeFood && room.fakeFoods.length < 2 && Math.random() < 0.08) {
    const occupied = new Set();
    for (const id of ids) room.snakes[id].body.forEach(c => occupied.add(`${c.x},${c.y}`));
    room.fakeFoods.push(spawnFood(GRID, occupied));
  }

  const nextHeads = {};
  for (const id of ids) {
    const s = room.snakes[id];
    
    if (s.zCooldown > 0) s.zCooldown--;
    if (s.curseTimer > 0) {
      s.curseTimer--;
      if (s.curseTimer === 0) s.isMirrored = false;
    }
    if (s.fusedTimer > 0) {
      s.fusedTimer--;
      if (s.fusedTimer === 0 && s.fusedWith) {
        s.lastUnfusedFrom = s.fusedWith;
        s.unfusedGrace = 20;
        s.fusedWith = null;
      }
    }
    if (s.unfusedGrace > 0) s.unfusedGrace--;

    let appliedDir = s.nextDir;
    if (s.isMirrored) {
      appliedDir = { x: -appliedDir.x, y: -appliedDir.y };
    }
    s.dir = appliedDir;

    const head = s.body[0];
    let nx = head.x + s.dir.x;
    let ny = head.y + s.dir.y;

    if (m.gravityWells) {
      room.gravityWells.forEach(gw => {
        const dist = Math.hypot(gw.x - head.x, gw.y - head.y);
        if (dist < gw.pullRadius && dist > 0.8 && Math.random() < 0.35) {
          const dx = Math.sign(gw.x - head.x);
          const dy = Math.sign(gw.y - head.y);
          if (Math.abs(gw.x - head.x) > Math.abs(gw.y - head.y)) nx += dx * 0.5;
          else ny += dy * 0.5;
        }
      });
    }

    if (m.portalWalls) {
      if (nx < 0) { nx = GRID - 1; s.wrapCount++; }
      else if (nx >= GRID) { nx = 0; s.wrapCount++; }
      if (ny < 0) { ny = GRID - 1; s.wrapCount++; }
      else if (ny >= GRID) { ny = 0; s.wrapCount++; }
    }

    nextHeads[id] = { x: Math.round(nx), y: Math.round(ny) };
  }

  if (m.teleportTiles) {
    for (const id of ids) {
      const nh = nextHeads[id];
      room.teleporters.forEach(tp => {
        if (nh.x === tp.a.x && nh.y === tp.a.y) {
          nextHeads[id] = { x: tp.b.x, y: tp.b.y };
          broadcast(room, { type: 'teleport', player: id, from: tp.a, to: tp.b });
        } else if (nh.x === tp.b.x && nh.y === tp.b.y) {
          nextHeads[id] = { x: tp.a.x, y: tp.a.y };
          broadcast(room, { type: 'teleport', player: id, from: tp.b, to: tp.a });
        }
      });
    }
  }

  const deaths = new Map();

  if (!m.portalWalls) {
    for (const id of ids) {
      const nh = nextHeads[id];
      if (nh.x < 0 || nh.x >= GRID || nh.y < 0 || nh.y >= GRID) {
        deaths.set(id, { creditTo: null });
      }
    }
  }

  if (m.shrinkingArena && room.storm.active) {
    for (const id of ids) {
      const nh = nextHeads[id];
      const distFromCenter = Math.hypot(nh.x - room.storm.center.x, nh.y - room.storm.center.y);
      if (distFromCenter > room.storm.radius) {
        if (room.snakes[id].body.length > 2) {
          room.snakes[id].body.pop();
        } else {
          deaths.set(id, { creditTo: null });
        }
      }
    }
  }

  if (m.detachableTail && room.mines.length) {
    for (const id of ids) {
      const nh = nextHeads[id];
      for (let i = room.mines.length - 1; i >= 0; i--) {
        const mine = room.mines[i];
        if (nh.x === mine.x && nh.y === mine.y) {
          deaths.set(id, { creditTo: mine.owner !== id ? mine.owner : null });
          room.mines.splice(i, 1);
          broadcast(room, { type: 'mineExploded', pos: mine, player: id });
        }
      }
    }
  }

  for (const id of ids) {
    if (deaths.has(id)) continue;
    const s = room.snakes[id];
    const nh = nextHeads[id];

    if (s.body.some(seg => seg.x === nh.x && seg.y === nh.y)) {
      deaths.set(id, { creditTo: null });
      continue;
    }

    for (const oid of ids) {
      if (oid === id || deaths.has(oid)) continue;
      const other = room.snakes[oid];
      const otherNH = nextHeads[oid];

      if (m.zLayers && s.zLayer !== other.zLayer) continue;

      if (otherNH && otherNH.x === nh.x && otherNH.y === nh.y) {
        if (m.symbioteFusion && !s.fusedWith && !other.fusedWith) {
          s.fusedWith = oid;
          other.fusedWith = id;
          s.fusedTimer = 35;
          other.fusedTimer = 35;
          s.grow += 2;
          other.grow += 2;
          broadcast(room, { type: 'symbioteFused', p1: id, p2: oid });
          continue;
        }

        if (m.bumperPhysics) {
          s.dir = { x: -s.dir.x, y: -s.dir.y };
          other.dir = { x: -other.dir.x, y: -other.dir.y };
          broadcast(room, { type: 'bumperBounce', p1: id, p2: oid });
          continue;
        }

        if (!deaths.has(id)) deaths.set(id, { creditTo: null });
        if (!deaths.has(oid)) deaths.set(oid, { creditTo: null });
        continue;
      }

      if (other.body.some(seg => seg.x === nh.x && seg.y === nh.y)) {
        if (s.shield > 0) {
          s.shield = 0;
          broadcast(room, { type: 'shieldPopped', player: id });
          continue;
        }

        let creditScore = 1;
        if (s.lastUnfusedFrom === oid && s.unfusedGrace > 0) {
          creditScore = 3;
          broadcast(room, { type: 'betrayalBonus', killer: oid, victim: id });
        }

        deaths.set(id, { creditTo: oid, bonus: creditScore });
      }
    }
  }

  for (const [id, info] of deaths) {
    if (m.segmentedOwnership && room.snakes[id]) {
      room.snakes[id].body.slice(1).forEach(seg => {
        if (Math.random() < 0.6) {
          room.severedChunks.push({ x: seg.x, y: seg.y, color: room.players[id] ? room.players[id].color : '#4dff88' });
        }
      });
      if (room.severedChunks.length > 25) room.severedChunks.splice(0, room.severedChunks.length - 25);
    }
    killSnake(room, id, info.creditTo, info.bonus || 1);
  }

  for (const id of ids) {
    if (deaths.has(id)) continue;
    const s = room.snakes[id];
    const nh = nextHeads[id];
    s.body.unshift(nh);

    if (nh.x === room.food.x && nh.y === room.food.y) {
      if (m.inverseMode && room.inverseModeActive) {
        s.score -= 1;
        if (s.body.length > 2) s.body.pop();
      } else {
        s.score += 1;
        s.grow += 1;
      }
      room.food = spawnFood(GRID);
    } 
    else if (m.fakeFood && room.fakeFoods.some(f => f.x === nh.x && f.y === nh.y)) {
      const idx = room.fakeFoods.findIndex(f => f.x === nh.x && f.y === nh.y);
      if (idx !== -1) room.fakeFoods.splice(idx, 1);
      s.score = Math.max(0, s.score - 2);
      if (s.body.length > 2) s.body.pop();
      broadcast(room, { type: 'fakeFoodEaten', player: id });
    }
    else if (m.segmentedOwnership && room.severedChunks.some(c => c.x === nh.x && c.y === nh.y)) {
      const cIdx = room.severedChunks.findIndex(c => c.x === nh.x && c.y === nh.y);
      if (cIdx !== -1) room.severedChunks.splice(cIdx, 1);
      s.score += 1;
      s.grow += 1;
    }
    else if (s.grow > 0) {
      s.grow -= 1;
    } else {
      s.body.pop();
    }

    if (m.decayMode && room.tickCount % 25 === 0 && s.body.length > 2) {
      s.body.pop();
    }

    if (m.packBonding) {
      const hasCloseAlly = ids.some(otherId => {
        if (otherId === id) return false;
        const otherHead = room.snakes[otherId].body[0];
        return Math.hypot(nh.x - otherHead.x, nh.y - otherHead.y) <= 2.5;
      });
      if (hasCloseAlly) {
        s.shield = Math.min(20, (s.shield || 0) + 1);
      }
    }
  }

  broadcastState(room);
}

function killSnake(room, id, creditTo, bonusPoints = 1) {
  const s = room.snakes[id];
  if (!s || s.dead) return;
  s.dead = true;
  s.score -= DEATH_PENALTY;
  if (creditTo && room.snakes[creditTo]) {
    room.snakes[creditTo].score += bonusPoints;
    room.snakes[creditTo].grow += bonusPoints;
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

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'createRoom') {
      const code = genCode();
      rooms[code] = makeRoom(code);
      sendTo(ws, { type: 'roomCreated', code });
      return;
    }

    if (msg.type === 'joinRoom') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms[code];
      if (!room) {
        sendTo(ws, { type: 'error', reason: 'Room not found. Check code.' });
        return;
      }

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

    const room = ws.roomCode ? rooms[ws.roomCode] : null;
    if (!room) return;

    if (msg.type === 'dir' && ws.playerId && room.snakes[ws.playerId]) {
      const s = room.snakes[ws.playerId];
      if (s.dead) return;
      const { x, y } = msg.dir;
      if (![-1, 0, 1].includes(x) || ![-1, 0, 1].includes(y) || Math.abs(x) + Math.abs(y) !== 1) return;
      if (s.dir.x === -x && s.dir.y === -y) return;
      s.nextDir = { x, y };
      sendTo(ws, { type: 'dirAck', dir: s.nextDir });
      return;
    }

    if (msg.type === 'toggleZ' && ws.playerId && room.snakes[ws.playerId] && room.modifiers.zLayers) {
      const s = room.snakes[ws.playerId];
      if (s.zCooldown === 0) {
        s.zLayer = s.zLayer === 0 ? 1 : 0;
        s.zCooldown = 15;
        broadcast(room, { type: 'zLayerShift', player: ws.playerId, zLayer: s.zLayer });
      }
      return;
    }

    if (msg.type === 'dropMine' && ws.playerId && room.snakes[ws.playerId] && room.modifiers.detachableTail) {
      const s = room.snakes[ws.playerId];
      if (s.body.length >= 5) {
        const dropCount = Math.max(1, Math.floor(s.body.length * 0.3));
        const droppedSegs = s.body.splice(s.body.length - dropCount, dropCount);
        const minePos = droppedSegs[0];
        room.mines.push({ x: minePos.x, y: minePos.y, owner: ws.playerId, color: room.players[ws.playerId].color, createdAt: Date.now() });
        broadcast(room, { type: 'mineDropped', pos: minePos, player: ws.playerId });
      }
      return;
    }

    if (msg.type === 'setModifiers' && ws.playerId === room.adminId) {
      if (msg.modifiers && typeof msg.modifiers === 'object') {
        room.modifiers = { ...room.modifiers, ...msg.modifiers };
        if (msg.matchSeconds) {
          const sec = Number(msg.matchSeconds);
          if (sec >= 30 && sec <= 1800) room.matchSeconds = Math.round(sec);
        }
        broadcast(room, { type: 'modifiersUpdated', modifiers: room.modifiers, matchSeconds: room.matchSeconds });
      }
      return;
    }

    if (msg.type === 'setMatchSeconds' && ws.playerId === room.adminId) {
      const n = Number(msg.seconds);
      if (Number.isFinite(n) && n >= 30 && n <= 1800) {
        room.matchSeconds = Math.round(n);
        broadcast(room, { type: 'settings', matchSeconds: room.matchSeconds });
      }
      return;
    }

    if (msg.type === 'adminPause' && ws.playerId === room.adminId) { adminPause(room); return; }
    if (msg.type === 'adminResume' && ws.playerId === room.adminId) { adminResume(room); return; }

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

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 8000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`SNAKE // ARENA listening on port ${PORT}`));
