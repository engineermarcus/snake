import React, { useState, useEffect, useCallback } from 'react';
import { socketService } from './services/socket';
import { webrtcService } from './services/webrtc';
import { PublicGameState, ChatMessage, Point, GameModifiers } from './types/game';
import { Lobby } from './components/Lobby';
import { TopBar } from './components/TopBar';
import { Scoreboard } from './components/Scoreboard';
import { ArenaBoard } from './components/ArenaBoard';
import { ChatPanel } from './components/ChatPanel';
import { DPad } from './components/DPad';
import { SettingsModal } from './components/SettingsModal';
import { Toast } from './components/Toast';

const KEY_DIR_MAP: Record<string, Point> = {
  arrowup: { x: 0, y: -1 }, arrowdown: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 }, arrowright: { x: 1, y: 0 },
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
  a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
  keyw: { x: 0, y: -1 }, keys: { x: 0, y: 1 },
  keya: { x: -1, y: 0 }, keyd: { x: 1, y: 0 },
  numpad8: { x: 0, y: -1 }, numpad2: { x: 0, y: 1 },
  numpad4: { x: -1, y: 0 }, numpad6: { x: 1, y: 0 }
};

export const App: React.FC = () => {
  const [inGame, setInGame] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [gameMsg, setGameMsg] = useState<string | null>(null);

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<string>('#10b981');
  const [myName, setMyName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string>('----');
  const [pingMs, setPingMs] = useState<number | null>(null);

  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChat, setUnreadChat] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [voicePeers, setVoicePeers] = useState<string[]>([]);

  const showToast = useCallback((msg: string, ms = 2500) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), ms);
  }, []);

  const showGameMsg = useCallback((msg: string, ms = 2000) => {
    setGameMsg(msg);
    setTimeout(() => setGameMsg(null), ms);
  }, []);

  // Handle Join or Create Match
  const handleJoinOrCreate = (name: string, color: string, code?: string) => {
    setMyName(name);
    setMyColor(color);
    socketService.connect(code || null, name, color);
  };

  // Socket message dispatcher
  useEffect(() => {
    const unsubscribe = socketService.addListener((msg) => {
      switch (msg.type) {
        case 'joined':
          setMyPlayerId(msg.player);
          setMyColor(msg.color);
          setMyName(msg.name || myName);
          setIsAdmin(msg.isAdmin || false);
          setRoomCode(msg.code);
          setInGame(true);
          socketService.setToken(msg.token);
          break;

        case 'spectator':
          setMyPlayerId(null);
          setRoomCode(msg.code);
          setInGame(true);
          showToast('Spectating match (room full)');
          break;

        case 'state':
          setGameState(msg.game);
          break;

        case 'error':
          setLobbyError(msg.reason || 'An error occurred');
          showToast(msg.reason || 'Error');
          break;

        case 'adminTransfer':
          setIsAdmin(true);
          showToast('You are now the match admin!');
          break;

        case 'died':
          if (msg.player === myPlayerId) {
            showGameMsg('CRASHED! −1 point', 1800);
            if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
          } else if (msg.creditTo === myPlayerId) {
            showGameMsg('KNOCKOUT! +1 point & growth!', 1800);
            if (navigator.vibrate) navigator.vibrate(50);
          }
          break;

        case 'matchOver':
          const iWon = msg.winners && msg.winners.includes(myPlayerId);
          showGameMsg(iWon ? 'VICTORY! YOU WON!' : 'MATCH OVER', 5000);
          break;

        case 'chat':
          setChatMessages(prev => [...prev, {
            from: msg.from,
            name: msg.name,
            color: msg.color,
            text: msg.text,
            isSelf: msg.from === myPlayerId
          }]);
          if (!isChatOpen) setUnreadChat(true);
          break;

        case 'presence':
          const pname = msg.name || msg.player.slice(-4);
          setChatMessages(prev => [...prev, {
            from: 'system',
            name: 'System',
            color: 'var(--text-dim)',
            text: msg.connected ? `${pname} joined the arena.` : `${pname} left.`,
            isSystem: true
          }]);
          break;

        case 'pong':
          if (msg.t) setPingMs(Date.now() - msg.t);
          break;

        case 'rtcPeers':
          if (isVoiceActive) {
            for (const pid of msg.peers) webrtcService.initiatePeer(pid);
          }
          break;

        case 'rtcOffer':
          if (isVoiceActive) webrtcService.handleOffer(msg);
          break;

        case 'rtcAnswer':
          webrtcService.handleAnswer(msg);
          break;

        case 'rtcIce':
          webrtcService.handleIce(msg);
          break;

        case 'rtcPeerLeft':
          webrtcService.closePeer(msg.peer);
          break;
      }
    });

    return () => unsubscribe();
  }, [myPlayerId, myName, isChatOpen, isVoiceActive, showToast, showGameMsg]);

  // Direction Steering
  const sendDir = useCallback((dir: Point) => {
    socketService.sendDirection(dir);
  }, []);

  // 3D Z-Layer Jump
  const toggleZLayer = useCallback(() => {
    socketService.send({ type: 'toggleZ' });
  }, []);

  // Detachable Tail Mine
  const dropMine = useCallback(() => {
    socketService.send({ type: 'dropMine' });
  }, []);

  // Admin Pause
  const togglePause = useCallback(() => {
    if (!isAdmin || !gameState) return;
    socketService.send({ type: gameState.paused ? 'adminResume' : 'adminPause' });
  }, [isAdmin, gameState]);

  // Voice Chat
  const toggleVoice = async () => {
    const active = await webrtcService.toggle(() => {
      setVoicePeers([...webrtcService.getActivePeers()]);
    });
    setIsVoiceActive(active);
    showToast(active ? 'Voice chat enabled' : 'Voice chat muted');
  };

  // Keyboard Event Handlers for Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never intercept keys when the user is typing in any input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Only handle game controls when in-game
      if (!inGame) return;

      // Pause toggle with P or Space
      if ((e.key === 'p' || e.key === 'P' || e.code === 'KeyP' || e.key === ' ' || e.code === 'Space') && isAdmin) {
        e.preventDefault();
        togglePause();
        return;
      }

      // 3D Z-Layer jump with Z or Shift
      if (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ' || e.key === 'Shift') {
        e.preventDefault();
        toggleZLayer();
        return;
      }

      // Drop tail mine with E
      if (e.key === 'e' || e.key === 'E' || e.code === 'KeyE') {
        e.preventDefault();
        dropMine();
        return;
      }

      const keyLower = (e.key || '').toLowerCase();
      const codeLower = (e.code || '').toLowerCase();
      const dir = KEY_DIR_MAP[keyLower] || KEY_DIR_MAP[codeLower];

      if (dir) {
        e.preventDefault();
        sendDir(dir);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [inGame, isChatOpen, isSettingsOpen, isAdmin, togglePause, toggleZLayer, dropMine, sendDir]);

  const copyRoomCode = () => {
    if (!roomCode || roomCode === '----') return;
    const url = `${window.location.origin}${window.location.pathname}?code=${roomCode}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => showToast(`Room ${roomCode} copied!`));
    } else {
      showToast(`Room code: ${roomCode}`);
    }
  };

  if (!inGame) {
    return (
      <>
        <Lobby onJoin={handleJoinOrCreate} error={lobbyError} />
        <Toast message={toastMsg} />
      </>
    );
  }

  const mySnake = myPlayerId && gameState?.snakes ? gameState.snakes[myPlayerId] : null;

  return (
    <div className="game-screen">
      <div className="app-container">
        <TopBar
          timeRemaining={gameState?.timeRemaining || 180}
          pingMs={pingMs}
          roomCode={roomCode}
          isAdmin={isAdmin}
          isPaused={gameState?.paused || false}
          isZElevated={mySnake?.zLayer === 1}
          isVoiceActive={isVoiceActive}
          unreadChat={unreadChat}
          onCopyRoom={copyRoomCode}
          onToggleZ={toggleZLayer}
          onDropMine={dropMine}
          onTogglePause={togglePause}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleChat={() => {
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen) setUnreadChat(false);
          }}
          onToggleVoice={toggleVoice}
        />

        <Scoreboard
          snakes={gameState?.snakes || {}}
          myPlayerId={myPlayerId}
          adminId={gameState?.adminId || null}
          inverseMode={gameState?.inverseModeActive || false}
        />

        <main className="arena-workspace">
          <ArenaBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            onSendDir={sendDir}
          />

          <ChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={chatMessages}
            onSendMessage={(text) => socketService.send({ type: 'chat', text })}
            voiceActive={isVoiceActive}
            voicePeers={voicePeers}
            snakes={gameState?.snakes || {}}
            myPlayerId={myPlayerId}
          />
        </main>

        <footer className="bottom-bar">
          <div className="player-tag">
            <span className="you-are">
              Player: <strong style={{ color: myColor }}>{myName}</strong> {isAdmin && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>(Admin)</span>}
            </span>
          </div>
          <div className="keyboard-hints">
            <span className="hint-label">Move:</span>
            <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
            <span className="hint-label" style={{ marginLeft: 8 }}>Abilities:</span>
            <kbd>Z</kbd> 3D Layer <kbd>E</kbd> Drop Mine
          </div>
        </footer>

        <DPad onDir={sendDir} />
      </div>

      {gameMsg && <div className="game-msg show">{gameMsg}</div>}
      <Toast message={toastMsg} />

      {gameState && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isAdmin={isAdmin}
          initialModifiers={gameState.modifiers}
          initialMatchSeconds={gameState.timeRemaining}
          onApply={(modifiers: GameModifiers, seconds: number) => {
            socketService.send({ type: 'setModifiers', modifiers, matchSeconds: seconds });
            showToast('Arena settings applied');
          }}
        />
      )}
    </div>
  );
};
