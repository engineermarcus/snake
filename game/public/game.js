// ============================================================
//  SNAKE ARENA - Modern Client Engine & Desktop/Mobile Controls
// ============================================================

// Color palette (Red is strictly reserved for the ball/food)
const BALL_COLOR = '#ef4444';
const AVAILABLE_COLORS = [
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#d946ef', '#f59e0b', '#14b8a6', '#eab308',
  '#38ef7d', '#00f2fe', '#f9d423', '#a8ff78'
];

// ---- DOM refs ----
const lobbyEl           = document.getElementById('lobby');
const gameScreenEl      = document.getElementById('gameScreen');
const playerNameIn      = document.getElementById('playerName');
const codeInputEl       = document.getElementById('codeInput');
const createBtn         = document.getElementById('createBtn');
const joinBtn           = document.getElementById('joinBtn');
const lobbyError        = document.getElementById('lobbyError');
const colorPickerEl     = document.getElementById('colorPicker');

const canvas            = document.getElementById('board');
const ctx               = canvas.getContext('2d');
const fxCanvas          = document.getElementById('fx');
const fxCtx             = fxCanvas.getContext('2d');
const statusEl          = document.getElementById('status');
const pingDot           = document.getElementById('pingDot');
const msgEl             = document.getElementById('msg');
const timerEl           = document.getElementById('timer');
const scoreboardEl      = document.getElementById('scoreboard');
const youAreEl          = document.querySelector('.you-are');
const dpad              = document.getElementById('dpad');
const roomCodeBtn       = document.getElementById('roomCodeBtn');
const roomCodeEl        = document.getElementById('roomCode');
const toastEl           = document.getElementById('toast');

const settingsBtn       = document.getElementById('settingsBtn');
const settingsModal     = document.getElementById('settingsModal');
const matchSecondsIn    = document.getElementById('matchSecondsInput');
const applySetBtn       = document.getElementById('applySettings');
const closeSetBtn       = document.getElementById('closeSettings');
const closeSettingsX    = document.getElementById('closeSettingsX');
const adminStatusNotice = document.getElementById('adminStatusNotice');

const pauseBtn          = document.getElementById('pauseBtn');
const pauseIcon         = document.getElementById('pauseIcon');
const chatToggle        = document.getElementById('chatToggle');
const chatBadge         = document.getElementById('chatBadge');
const chatPanel         = document.getElementById('chatPanel');
const chatCloseBtn      = document.getElementById('chatCloseBtn');
const chatLog           = document.getElementById('chatLog');
const chatInput         = document.getElementById('chatInput');
const chatSend          = document.getElementById('chatSend');
const voiceBtn          = document.getElementById('voiceBtn');
const voiceIcon         = document.getElementById('voiceIcon');
const voiceStatus       = document.getElementById('voiceStatus');
const boardWrap         = document.getElementById('board-wrap');

// ---- State ----
let ws = null;
let myPlayer = null;
let myColor = localStorage.getItem('snake_saved_color') || AVAILABLE_COLORS[0];
let myName = localStorage.getItem('snake_saved_name') || '';
let isAdmin = false;
let isPaused = false;
let latestGame = null;
let lastSeq = -1;
let reconnectAttempts = 0;
const MAX_BACKOFF = 5000;
let msgTimeout = null;
let particles = [];
let prevAlive = {};
let localDir = null;
let pendingDirs = [];
let selectedColor = myColor;
let pendingRoomCode = null;
let currentRoomCode = null;
let lastPingTime = 0;
let pingLatencyMs = null;
let chatOpen = false;

// ---- WebRTC Voice State ----
const peers = {};
let localStream = null;
let voiceEnabled = false;
let audioCtx = null;
let analyserNodes = {};

// ============================================================
//  LOBBY & COLOR PICKER
// ============================================================
function buildColorPicker() {
  colorPickerEl.innerHTML = '';

  const redSwatch = document.createElement('div');
  redSwatch.className = 'color-swatch disabled';
  redSwatch.style.backgroundColor = BALL_COLOR;
  redSwatch.title = 'Red is reserved for the food ball and cannot be chosen';
  colorPickerEl.appendChild(redSwatch);

  AVAILABLE_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.backgroundColor = c;
    sw.title = `Color: ${c}`;
    sw.addEventListener('click', () => {
      selectedColor = c;
      myColor = c;
      localStorage.setItem('snake_saved_color', c);
      document.querySelectorAll('.color-swatch:not(.disabled)').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    colorPickerEl.appendChild(sw);
  });
}

if (myName) playerNameIn.value = myName;
buildColorPicker();

const urlParams = new URLSearchParams(window.location.search);
const sharedCode = urlParams.get('code') || urlParams.get('room');
if (sharedCode && sharedCode.trim().length === 4) {
  codeInputEl.value = sharedCode.trim().toUpperCase();
}

function showLobbyError(msg) {
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
  setTimeout(() => lobbyError.classList.add('hidden'), 4500);
}

function showToast(text, duration = 2500) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, duration);
}

createBtn.addEventListener('click', () => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  myName = playerNameIn.value.trim() || ('Player ' + Math.floor(100 + Math.random() * 900));
  localStorage.setItem('snake_saved_name', myName);
  myColor = selectedColor;
  pendingRoomCode = null;
  connectWS();
});

joinBtn.addEventListener('click', () => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const code = codeInputEl.value.trim().toUpperCase();
  if (code.length !== 4) {
    showLobbyError('Please enter a valid 4-character room code');
    return;
  }
  myName = playerNameIn.value.trim() || ('Player ' + Math.floor(100 + Math.random() * 900));
  localStorage.setItem('snake_saved_name', myName);
  myColor = selectedColor;
  pendingRoomCode = code;
  connectWS();
});

codeInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinBtn.click();
});

function enterGameScreen(code) {
  currentRoomCode = code;
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  lobbyEl.classList.add('hidden');
  gameScreenEl.classList.remove('hidden');
  roomCodeEl.textContent = code;
  window.focus();

  try {
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?code=' + code;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  } catch (e) {}

  resizeCanvas();
}

roomCodeBtn.addEventListener('click', () => {
  if (!currentRoomCode) return;
  const inviteUrl = window.location.origin + window.location.pathname + '?code=' + currentRoomCode;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast(`Room ${currentRoomCode} & invite link copied!`);
    }).catch(() => {
      showToast(`Room code: ${currentRoomCode}`);
    });
  } else {
    showToast(`Room code: ${currentRoomCode}`);
  }
});

// ============================================================
//  WEBSOCKET & NETWORK LATENCY OPTIMIZATIONS
// ============================================================
function getToken() {
  return localStorage.getItem('snakeToken_' + (currentRoomCode || 'x'));
}
function setToken(t) {
  localStorage.setItem('snakeToken_' + (currentRoomCode || 'x'), t);
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    reconnectAttempts = 0;
    statusEl.textContent = 'Connected';
    if (pingDot) pingDot.style.background = 'var(--primary)';

    if (pendingRoomCode) {
      ws.send(JSON.stringify({
        type: 'joinRoom',
        code: pendingRoomCode,
        token: getToken(),
        name: myName,
        color: myColor
      }));
    } else {
      ws.send(JSON.stringify({ type: 'createRoom' }));
    }
    flushPendingDirs();
  };

  ws.onmessage = ev => {
    try {
      handleMessage(JSON.parse(ev.data));
    } catch (err) {
      console.error(err);
    }
  };

  ws.onclose = () => {
    statusEl.textContent = 'Reconnecting…';
    if (pingDot) pingDot.style.background = 'var(--danger)';
    scheduleReconnect();
  };

  ws.onerror = () => {
    try { ws.close(); } catch(e) {}
  };
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(400 * Math.pow(1.5, reconnectAttempts), MAX_BACKOFF);
  setTimeout(() => {
    if (!currentRoomCode) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => {
      reconnectAttempts = 0;
      statusEl.textContent = 'Reconnected';
      if (pingDot) pingDot.style.background = 'var(--primary)';
      ws.send(JSON.stringify({
        type: 'joinRoom',
        code: currentRoomCode,
        token: getToken(),
        name: myName,
        color: myColor
      }));
      flushPendingDirs();
    };
    ws.onmessage = ev => {
      try { handleMessage(JSON.parse(ev.data)); } catch (e) {}
    };
    ws.onclose = () => {
      statusEl.textContent = 'Reconnecting…';
      if (pingDot) pingDot.style.background = 'var(--danger)';
      scheduleReconnect();
    };
    ws.onerror = () => {
      try { ws.close(); } catch(e) {}
    };
  }, delay);
}

function flushPendingDirs() {
  while (pendingDirs.length) {
    const d = pendingDirs.shift();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'dir', dir: d }));
    }
  }
}

// ============================================================
//  MESSAGE DISPATCHER
// ============================================================
function handleMessage(msg) {
  switch (msg.type) {
    case 'roomCreated':
      ws.send(JSON.stringify({
        type: 'joinRoom',
        code: msg.code,
        token: getToken(),
        name: myName,
        color: myColor
      }));
      break;

    case 'joined':
      myPlayer = msg.player;
      myColor = msg.color;
      myName = msg.name || myName;
      isAdmin = msg.isAdmin || false;
      isPaused = false;
      localDir = null;
      setToken(msg.token);
      currentRoomCode = msg.code;
      enterGameScreen(msg.code);
      updateAdminUI();
      ws.send(JSON.stringify({ type: 'rtcPeers' }));
      break;

    case 'spectator':
      myPlayer = null;
      currentRoomCode = msg.code;
      enterGameScreen(msg.code);
      statusEl.textContent = 'Spectating (Room Full)';
      youAreEl.textContent = 'Spectating';
      pauseBtn.classList.add('hidden');
      break;

    case 'error':
      showLobbyError(msg.reason || 'Error');
      showToast(msg.reason || 'Error');
      break;

    case 'adminTransfer':
      isAdmin = true;
      updateAdminUI();
      addChatSystem('You are now the match admin.');
      showToast('You are now the match admin!');
      break;

    case 'newAdmin': {
      if (latestGame) updateScoreboard();
      const adminPlayer = latestGame && latestGame.snakes[msg.adminId];
      const aname = adminPlayer ? adminPlayer.name : msg.adminId.slice(-4);
      addChatSystem(`${aname} is now the match admin.`);
      break;
    }

    case 'dirAck':
      localDir = msg.dir;
      break;

    case 'state':
      if (msg.seq < lastSeq) return;
      lastSeq = msg.seq;
      latestGame = msg.game;
      isPaused = latestGame.paused;
      boardWrap.classList.toggle('paused', isPaused);
      
      pauseIcon.innerHTML = `<use href="#${isPaused ? 'icon-play' : 'icon-pause'}"></use>`;
      pauseBtn.title = isPaused ? 'Resume Match' : 'Pause Match';

      // Keep local direction synced with snake body vector if not set
      if (myPlayer && latestGame.snakes[myPlayer] && latestGame.snakes[myPlayer].body.length >= 2 && !localDir) {
        const h = latestGame.snakes[myPlayer].body[0];
        const n = latestGame.snakes[myPlayer].body[1];
        localDir = { x: h.x - n.x, y: h.y - n.y };
      }

      updateTimer();
      updateScoreboard();
      detectDeathsForFx();
      render();
      break;

    case 'presence': {
      const pname = msg.name || msg.player.slice(-4);
      if (msg.freed) {
        addChatSystem(`${pname} left the arena.`);
      } else if (msg.connected) {
        addChatSystem(`${pname} joined the arena.`);
      } else {
        addChatSystem(`${pname} connection interrupted…`);
      }
      break;
    }

    case 'paused':
      showMsg('Waiting for players…', 60000);
      break;

    case 'adminPaused':
      showMsg('MATCH PAUSED BY ADMIN', 60000);
      break;

    case 'adminResumed':
      msgEl.classList.remove('show');
      showToast('Match resumed!');
      break;

    case 'died':
      if (msg.player === myPlayer) {
        showMsg(msg.creditTo ? 'CRASHED! Opponent scored' : 'CRASHED! −1 point', 1800);
        if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
      } else if (msg.creditTo === myPlayer) {
        showMsg('KNOCKOUT! +1 point & growth!', 1800);
        if (navigator.vibrate) navigator.vibrate(50);
      }
      break;

    case 'matchOver':
      handleMatchOver(msg);
      break;

    case 'settings':
      matchSecondsIn.value = msg.matchSeconds;
      showToast(`Match duration set to ${msg.matchSeconds}s`);
      break;

    case 'chat':
      addChatMsg(msg.name, msg.color, msg.text, msg.from === myPlayer);
      break;

    // WebRTC Voice Signaling
    case 'rtcPeers':
      if (voiceEnabled) {
        for (const pid of msg.peers) initiateRTC(pid);
      }
      break;

    case 'rtcOffer':
      if (voiceEnabled) handleRTCOffer(msg);
      break;

    case 'rtcAnswer':
      if (peers[msg.from] && peers[msg.from].pc) {
        peers[msg.from].pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(()=>{});
      }
      break;

    case 'rtcIce':
      if (peers[msg.from] && peers[msg.from].pc && msg.candidate) {
        peers[msg.from].pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(()=>{});
      }
      break;

    case 'rtcPeerLeft':
      closePeer(msg.peer);
      break;

    case 'pong':
      if (msg.t) {
        pingLatencyMs = Date.now() - msg.t;
        statusEl.textContent = `${pingLatencyMs}ms`;
        if (pingDot) {
          pingDot.style.background = pingLatencyMs < 80 ? 'var(--primary)' : (pingLatencyMs < 180 ? 'var(--amber)' : 'var(--danger)');
        }
      }
      break;
  }
}

function updateAdminUI() {
  youAreEl.innerHTML = `Player: <strong style="color:${myColor}">${escHtml(myName || 'Player')}</strong> ${isAdmin ? '<span style="color:var(--amber); margin-left:4px;">(Admin)</span>' : ''}`;
  pauseBtn.classList.toggle('hidden', !isAdmin);
  adminStatusNotice.textContent = isAdmin ? 'You are the admin. You can adjust match length.' : 'Only the match admin can apply changes.';
  adminStatusNotice.style.color = isAdmin ? 'var(--primary)' : 'var(--danger)';
  applySetBtn.disabled = !isAdmin;
}

// ============================================================
//  HUD & SCOREBOARD
// ============================================================
function showMsg(text, ms = 2000) {
  msgEl.textContent = text;
  msgEl.classList.add('show');
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => msgEl.classList.remove('show'), ms);
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function updateTimer() {
  if (!latestGame) return;
  const t = latestGame.timeRemaining;
  timerEl.textContent = fmtTime(t);
  timerEl.classList.toggle('low', t <= 10 && latestGame.running);
}

function updateScoreboard() {
  if (!latestGame) return;
  scoreboardEl.innerHTML = '';
  const ids = Object.keys(latestGame.snakes).sort((a, b) => latestGame.snakes[b].score - latestGame.snakes[a].score);

  ids.forEach(id => {
    const s = latestGame.snakes[id];
    const isMe = id === myPlayer;
    const isRoomAdmin = id === latestGame.adminId;
    const chip = document.createElement('div');
    chip.className = 'score-chip' + (isMe ? ' me' : '') + (s.dead ? ' dead' : '');

    const crown = isRoomAdmin ? '<svg class="admin-badge-icon" viewBox="0 0 24 24"><use href="#icon-crown"></use></svg>' : '';
    const nameLabel = escHtml(s.name || id.slice(-4));
    const scoreVal = s.score;
    const scoreClass = scoreVal < 0 ? ' neg' : '';

    chip.innerHTML = `
      <span class="dot" style="background-color:${s.color}; box-shadow: 0 0 6px ${s.color};"></span>
      ${crown}
      <span class="chip-name" style="color:${s.color}">${nameLabel}</span>
      <span class="chip-score${scoreClass}">${scoreVal}</span>
    `;
    scoreboardEl.appendChild(chip);
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectDeathsForFx() {
  if (!latestGame) return;
  for (const id in latestGame.snakes) {
    const s = latestGame.snakes[id];
    if (prevAlive[id] !== false && s.dead && s.body.length) {
      spawnBurst(s.body[0], s.color);
    }
    prevAlive[id] = !s.dead;
  }
}

function handleMatchOver(msg) {
  const iWon = msg.winners.includes(myPlayer);
  const topStandings = msg.standings.slice(0, 3).map((s, i) => `${i + 1}. ${escHtml(s.name)} — ${s.score} pts`).join('\n');
  showMsg(iWon ? 'VICTORY! YOU WON!\n' + topStandings : 'MATCH OVER\n' + topStandings, 5500);
  if (iWon) fireworks();
}

// ============================================================
//  CANVAS RENDERING
// ============================================================
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.floor(Math.min(rect.width, rect.height) * dpr) || 600;

  canvas.width = size;
  canvas.height = size;
  fxCanvas.width = size;
  fxCanvas.height = size;
  render();
}
window.addEventListener('resize', resizeCanvas);

function render() {
  if (!latestGame) return;
  const g = latestGame;
  const cell = canvas.width / g.grid;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw Food Orb (Glowing Red)
  ctx.save();
  ctx.fillStyle = BALL_COLOR;
  ctx.shadowColor = BALL_COLOR;
  ctx.shadowBlur = cell * 0.9;
  ctx.beginPath();
  const fx = g.food.x * cell + cell / 2;
  const fy = g.food.y * cell + cell / 2;
  ctx.arc(fx, fy, cell / 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(fx - cell * 0.1, fy - cell * 0.1, cell / 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Draw Snakes
  for (const id in g.snakes) {
    const s = g.snakes[id];
    if (s.dead || !s.body.length) continue;
    const isMe = id === myPlayer;
    const isRoomAdmin = id === g.adminId;
    drawSnake(s.body, s.color, s.name || id.slice(-4), cell, isMe, isRoomAdmin);
  }
}

function drawSnake(body, color, name, cell, isMe, isRoomAdmin) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isMe ? 12 : 5;

  body.forEach((seg, i) => {
    const pad = i === 0 ? 1 : 2;
    const x = seg.x * cell + pad;
    const y = seg.y * cell + pad;
    const w = cell - pad * 2;
    const h = cell - pad * 2;
    const radius = i === 0 ? Math.max(4, cell * 0.3) : Math.max(3, cell * 0.2);

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, radius);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
  });

  if (body.length > 0) {
    const head = body[0];
    const hx = head.x * cell + cell / 2;
    const hy = head.y * cell + cell / 2;

    ctx.fillStyle = '#07090e';
    ctx.beginPath();
    ctx.arc(hx - cell * 0.2, hy - cell * 0.15, Math.max(1.5, cell * 0.08), 0, Math.PI * 2);
    ctx.arc(hx + cell * 0.2, hy - cell * 0.15, Math.max(1.5, cell * 0.08), 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    const fontSize = Math.max(10, Math.floor(cell * 0.55));
    ctx.font = `600 ${fontSize}px var(--font-sans), sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const displayName = (isRoomAdmin ? '👑 ' : '') + name;
    const tagY = head.y * cell - 4;

    const textMetrics = ctx.measureText(displayName);
    const pillW = textMetrics.width + 12;
    const pillH = fontSize + 6;
    const pillX = hx - pillW / 2;
    const pillY = tagY - pillH;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(pillX, pillY, pillW, pillH, 6);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillText(displayName, hx, tagY - 2);
  }

  ctx.restore();
}

// ============================================================
//  PARTICLES & FX
// ============================================================
function spawnBurst(cellPos, color) {
  const cell = canvas.width / (latestGame ? latestGame.grid : 30);
  const cx = cellPos.x * cell + cell / 2;
  const cy = cellPos.y * cell + cell / 2;
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const speed = 2 + Math.random() * 3.5;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color
    });
  }
}

function fireworks() {
  for (let n = 0; n < 6; n++) {
    setTimeout(() => {
      const cx = (0.15 + Math.random() * 0.7) * canvas.width;
      const cy = (0.15 + Math.random() * 0.7) * canvas.height;
      const color = AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)];
      for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 2.5 + Math.random() * 4;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color
        });
      }
    }, n * 220);
  }
}

function stepParticles() {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  particles = particles.filter(p => p.life > 0.02);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;
    p.life *= 0.94;
    fxCtx.globalAlpha = p.life;
    fxCtx.fillStyle = p.color;
    fxCtx.beginPath();
    fxCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    fxCtx.fill();
  }
  fxCtx.globalAlpha = 1;
  requestAnimationFrame(stepParticles);
}
requestAnimationFrame(stepParticles);

// ============================================================
//  KEYBOARD & DESKTOP CONTROLS
// ============================================================
const DIR_MAP = {
  // Arrow Keys
  'arrowup':    { x: 0, y: -1 },
  'arrowdown':  { x: 0, y: 1 },
  'arrowleft':  { x: -1, y: 0 },
  'arrowright': { x: 1, y: 0 },
  'up':         { x: 0, y: -1 },
  'down':       { x: 0, y: 1 },
  'left':       { x: -1, y: 0 },
  'right':      { x: 1, y: 0 },
  // WASD Keys
  'w':          { x: 0, y: -1 },
  's':          { x: 0, y: 1 },
  'a':          { x: -1, y: 0 },
  'd':          { x: 1, y: 0 },
  'keyw':       { x: 0, y: -1 },
  'keys':       { x: 0, y: 1 },
  'keya':       { x: -1, y: 0 },
  'keyd':       { x: 1, y: 0 },
  // Numpad Keys
  'numpad8':    { x: 0, y: -1 },
  'numpad2':    { x: 0, y: 1 },
  'numpad4':    { x: -1, y: 0 },
  'numpad6':    { x: 1, y: 0 }
};

function sendDir(dir) {
  if (!myPlayer) return;
  // Ignore 180-degree direct reverse into self
  if (localDir && localDir.x === -dir.x && localDir.y === -dir.y) return;
  localDir = dir;

  if (navigator.vibrate) {
    try { navigator.vibrate(8); } catch(e){}
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'dir', dir }));
  } else {
    pendingDirs.push(dir);
    if (pendingDirs.length > 3) pendingDirs.shift();
  }
}

// Global keydown listener for desktop play
window.addEventListener('keydown', e => {
  // Only ignore keys if chat input is actively focused while chat panel is open
  if (chatOpen && (document.activeElement === chatInput || e.target === chatInput)) {
    return;
  }

  // If settings modal is open and focusing input
  if (!settingsModal.classList.contains('hidden') && e.target === matchSecondsIn) {
    return;
  }

  // Admin Pause Toggle with 'P' or 'Space'
  if ((e.key === 'p' || e.key === 'P' || e.code === 'KeyP' || e.key === ' ' || e.code === 'Space') && isAdmin) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      e.preventDefault();
      ws.send(JSON.stringify({ type: isPaused ? 'adminResume' : 'adminPause' }));
      return;
    }
  }

  // Direction resolution by key or code
  const keyLower = (e.key || '').toLowerCase();
  const codeLower = (e.code || '').toLowerCase();
  const dir = DIR_MAP[keyLower] || DIR_MAP[codeLower];

  if (dir) {
    e.preventDefault();
    sendDir(dir);
  }
}, { capture: true });

// Mobile D-Pad Touch Listeners
if (dpad) {
  dpad.querySelectorAll('.dpad-btn').forEach(btn => {
    const dirName = btn.dataset.dir;
    const dirVec = DIR_MAP[dirName];

    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('pressed');
      sendDir(dirVec);
    }, { passive: false });

    btn.addEventListener('touchend', e => {
      e.preventDefault();
      btn.classList.remove('pressed');
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      btn.classList.remove('pressed');
    });

    btn.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') {
        sendDir(dirVec);
      }
    });
  });
}

// Canvas Swipe Handling
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

function handleTouchStart(e) {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = Date.now();
}

function handleTouchMove(e) {
  if (e.target === canvas || e.target === fxCanvas || e.target.closest('#board-wrap')) {
    e.preventDefault();
  }
}

function handleTouchEnd(e) {
  if (!touchStartX && !touchStartY) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (Math.max(absDx, absDy) > 15) {
    if (absDx > absDy) {
      sendDir({ x: dx > 0 ? 1 : -1, y: 0 });
    } else {
      sendDir({ x: 0, y: dy > 0 ? 1 : -1 });
    }
  }
  touchStartX = 0;
  touchStartY = 0;
}

boardWrap.addEventListener('touchstart', handleTouchStart, { passive: true });
boardWrap.addEventListener('touchmove', handleTouchMove, { passive: false });
boardWrap.addEventListener('touchend', handleTouchEnd, { passive: true });

// ============================================================
//  ADMIN SETTINGS & PAUSE
// ============================================================
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});
closeSetBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  window.focus();
});
if (closeSettingsX) {
  closeSettingsX.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    window.focus();
  });
}

applySetBtn.addEventListener('click', () => {
  if (!isAdmin) {
    showToast('Only the match admin can change settings!');
    return;
  }
  const seconds = Number(matchSecondsIn.value);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'setMatchSeconds', seconds }));
  }
  settingsModal.classList.add('hidden');
  window.focus();
});

pauseBtn.addEventListener('click', () => {
  if (!isAdmin || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: isPaused ? 'adminResume' : 'adminPause' }));
});

// ============================================================
//  TEXT CHAT & COMMS
// ============================================================
function setChatOpen(open) {
  chatOpen = open;
  chatPanel.classList.toggle('hidden', !chatOpen);
  if (chatOpen) {
    chatBadge.classList.add('hidden');
    chatInput.focus();
    scrollChat();
  } else {
    chatInput.blur();
    window.focus();
  }
}

chatToggle.addEventListener('click', () => setChatOpen(!chatOpen));
chatCloseBtn.addEventListener('click', () => setChatOpen(false));

function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'chat', text }));
  chatInput.value = '';
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChat();
  }
  // Escape key closes chat and returns focus to gameplay
  if (e.key === 'Escape') {
    setChatOpen(false);
  }
});

function addChatMsg(name, color, text, isSelf) {
  const div = document.createElement('div');
  div.className = 'chat-msg' + (isSelf ? ' self' : '');
  div.innerHTML = `<span class="chat-from" style="color:${escHtml(color)}">${escHtml(name)}:</span><span class="chat-text">${escHtml(text)}</span>`;
  chatLog.appendChild(div);
  scrollChat();

  if (!chatOpen) {
    chatBadge.classList.remove('hidden');
  }
}

function addChatSystem(text) {
  const div = document.createElement('div');
  div.className = 'chat-msg system';
  div.textContent = text;
  chatLog.appendChild(div);
  scrollChat();
}

function scrollChat() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ============================================================
//  WEBRTC VOICE CHAT
// ============================================================
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

async function startVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000
      },
      video: false
    });

    voiceEnabled = true;
    voiceBtn.classList.add('active');
    voiceIcon.innerHTML = `<use href="#icon-mic"></use>`;
    voiceBtn.title = 'Voice connected (Click to mute)';
    addChatSystem('Voice chat connected.');
    showToast('Voice connected');

    for (const pid in peers) {
      const pc = peers[pid].pc;
      localStream.getTracks().forEach(t => {
        try { pc.addTrack(t, localStream); } catch(e) {}
      });
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rtcPeers' }));
    }
    updateVoiceStatus();
  } catch (err) {
    addChatSystem('Microphone access unavailable or denied.');
    showToast('Mic access denied');
  }
}

function stopVoice() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  voiceEnabled = false;
  voiceBtn.classList.remove('active');
  voiceIcon.innerHTML = `<use href="#icon-mic-off"></use>`;
  voiceBtn.title = 'Toggle Voice Chat (Mic)';
  addChatSystem('Voice chat muted.');
  showToast('Voice muted');

  for (const pid in peers) {
    closePeer(pid);
  }
  updateVoiceStatus();
}

voiceBtn.addEventListener('click', () => {
  if (voiceEnabled) stopVoice();
  else startVoice();
});

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceTransportPolicy: 'all'
};

function makePeerConn(peerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = e => {
    if (!e.candidate) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rtcIce', to: peerId, candidate: e.candidate }));
    }
  };

  pc.ontrack = e => {
    const actx = getAudioCtx();
    const src = actx.createMediaStreamSource(e.streams[0]);
    const analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyser.connect(actx.destination);
    analyserNodes[peerId] = analyser;

    peers[peerId] = peers[peerId] || {};
    peers[peerId].stream = e.streams[0];
    updateVoiceStatus();
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      closePeer(peerId);
    }
    updateVoiceStatus();
  };

  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  return pc;
}

async function initiateRTC(peerId) {
  if (peers[peerId]) return;
  const pc = makePeerConn(peerId);
  peers[peerId] = { pc };

  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
      voiceActivityDetection: true
    });
    offer.sdp = preferOpus(offer.sdp);
    await pc.setLocalDescription(offer);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rtcOffer', to: peerId, sdp: pc.localDescription }));
    }
  } catch (e) {}
}

async function handleRTCOffer(msg) {
  const peerId = msg.from;
  if (peers[peerId]) closePeer(peerId);
  const pc = makePeerConn(peerId);
  peers[peerId] = { pc };

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await pc.createAnswer();
    answer.sdp = preferOpus(answer.sdp);
    await pc.setLocalDescription(answer);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rtcAnswer', to: peerId, sdp: pc.localDescription }));
    }
  } catch (e) {}
}

function closePeer(peerId) {
  if (!peers[peerId]) return;
  try { peers[peerId].pc.close(); } catch(e) {}
  delete peers[peerId];
  delete analyserNodes[peerId];
  updateVoiceStatus();
}

function preferOpus(sdp) {
  return sdp.replace(/a=fmtp:(\d+) (.*)/g, (match, pt, params) => {
    if (sdp.includes(`a=rtpmap:${pt} opus`)) {
      return `a=fmtp:${pt} ${params};maxplaybackrate=16000;stereo=0;sprop-stereo=0;cbr=1`;
    }
    return match;
  });
}

function updateVoiceStatus() {
  voiceStatus.innerHTML = '';
  const connectedPeers = Object.keys(peers).filter(pid => peers[pid].stream || (peers[pid].pc && peers[pid].pc.connectionState === 'connected'));

  if (connectedPeers.length === 0 && !voiceEnabled) {
    voiceStatus.style.display = 'none';
    return;
  }
  voiceStatus.style.display = 'flex';

  if (voiceEnabled) {
    const self = document.createElement('span');
    self.className = 'voice-peer';
    self.style.borderColor = myColor;
    self.style.color = myColor;
    self.innerHTML = `<svg class="svg-icon-sm" viewBox="0 0 24 24"><use href="#icon-mic"></use></svg> <span>${escHtml(myName || 'You')}</span>`;
    voiceStatus.appendChild(self);
  }

  connectedPeers.forEach(pid => {
    const span = document.createElement('span');
    span.className = 'voice-peer';
    span.id = 'vp_' + pid;
    const playerInfo = latestGame && latestGame.snakes[pid];
    const color = playerInfo ? playerInfo.color : '#94a3b8';
    const name = playerInfo ? (playerInfo.name || pid.slice(-4)) : pid.slice(-4);
    span.style.borderColor = color;
    span.style.color = color;
    span.innerHTML = `<svg class="svg-icon-sm" viewBox="0 0 24 24"><use href="#icon-speaker"></use></svg> <span>${escHtml(name)}</span>`;
    voiceStatus.appendChild(span);
  });
}

function pollSpeaking() {
  const buf = new Uint8Array(32);
  for (const pid in analyserNodes) {
    const an = analyserNodes[pid];
    an.getByteFrequencyData(buf);
    const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
    const el = document.getElementById('vp_' + pid);
    if (el) el.classList.toggle('speaking', avg > 14);
  }
  requestAnimationFrame(pollSpeaking);
}
requestAnimationFrame(pollSpeaking);

// ============================================================
//  HEARTBEAT & LATENCY TRACKER
// ============================================================
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    lastPingTime = Date.now();
    ws.send(JSON.stringify({ type: 'ping', t: lastPingTime }));
  }
}, 6000);
