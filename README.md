# 🐍 Snake Arena — Multiplayer Battle Game

Fast-paced competitive multiplayer snake game with 28+ gameplay modifiers. Split into a clean **backend / frontend** monorepo.

---

## Project Structure

\`\`\`
snake/
├── backend/           # Node.js WebSocket game server
│   ├── server.js      # Game engine, rooms, 28 modifiers
│   ├── .env           # PORT=5000
│   └── package.json
│
├── frontend/          # React + Vite + Capacitor (mobile-ready)
│   ├── src/
│   │   ├── App.tsx              # Root app & state orchestration
│   │   ├── config.ts            # SERVER_URL read from .env
│   │   ├── main.tsx             # ReactDOM entry
│   │   ├── components/
│   │   │   ├── ArenaBoard.tsx   # Canvas game renderer
│   │   │   ├── ChatPanel.tsx    # Comms sidebar/drawer
│   │   │   ├── DPad.tsx         # Mobile on-screen D-Pad
│   │   │   ├── Lobby.tsx        # Create/join match screen
│   │   │   ├── Scoreboard.tsx   # Live player score chips
│   │   │   ├── SettingsModal.tsx # 28 modifier toggles + presets
│   │   │   ├── Toast.tsx        # Toast notification popup
│   │   │   └── TopBar.tsx       # HUD: timer, room code, ability buttons
│   │   ├── services/
│   │   │   ├── socket.ts        # Singleton WS client with auto-reconnect
│   │   │   └── webrtc.ts        # WebRTC voice mesh (Opus low-bitrate)
│   │   ├── styles/
│   │   │   └── theme.css        # Modern dark glassmorphism theme
│   │   └── types/
│   │       └── game.ts          # All TypeScript interfaces
│   ├── .env                     # VITE_SERVER_URL + VITE_WS_URL
│   ├── capacitor.config.ts      # Capacitor mobile config
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── .gitignore
├── package.json        # Root workspace descriptor
└── README.md
\`\`\`

---

## Running Locally

### Backend
\`\`\`bash
cd backend
npm install
npm start
# Listening on http://localhost:5000
\`\`\`

### Frontend (Web)
\`\`\`bash
cd frontend
npm install
npm run dev
# Vite dev server on http://localhost:3000
\`\`\`

---

## Mobile Build (Capacitor)

\`\`\`bash
cd frontend
npm run build       # Build web bundle
npm run cap:sync    # Sync to native platforms
npm run cap:android # Open Android Studio
npm run cap:ios     # Open Xcode
\`\`\`

### Pointing mobile app at your server
Edit **\`frontend/.env\`**:

\`\`\`env
# Local (same machine)
VITE_SERVER_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000

# LAN (phone on same Wi-Fi)
VITE_SERVER_URL=http://192.168.1.X:5000
VITE_WS_URL=ws://192.168.1.X:5000

# Production
VITE_SERVER_URL=https://your-backend.com
VITE_WS_URL=wss://your-backend.com
\`\`\`

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Steer | WASD or Arrow Keys | D-Pad / Swipe |
| 3D Z-Layer Jump | Z or Shift | Z button (HUD) |
| Drop Tail Mine | E | E button (HUD) |
| Admin Pause | P or Space | Pause button (HUD) |

---

## Game Presets

| Preset | Description |
|---|---|
| Classic Arena | Pure retro snake, no modifiers |
| Quantum Warp | Portals, gravity wells, Z-layers, teleporters |
| Battle Royale | Shrinking storm, decay, mines, severed chunks |
| Stealth & Chaos | Fog of war, mirrored controls, poison food |
| Fusion & Social | Symbiote merges, pack bonding, betrayal bonuses |
| Total Mayhem | All 28 modifiers active simultaneously |
