import React from 'react';

interface TopBarProps {
  timeRemaining: number;
  pingMs: number | null;
  roomCode: string;
  isAdmin: boolean;
  isPaused: boolean;
  isZElevated: boolean;
  isVoiceActive: boolean;
  unreadChat: boolean;
  onCopyRoom: () => void;
  onToggleZ: () => void;
  onDropMine: () => void;
  onTogglePause: () => void;
  onOpenSettings: () => void;
  onToggleChat: () => void;
  onToggleVoice: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  timeRemaining,
  pingMs,
  roomCode,
  isAdmin,
  isPaused,
  isZElevated,
  isVoiceActive,
  unreadChat,
  onCopyRoom,
  onToggleZ,
  onDropMine,
  onTogglePause,
  onOpenSettings,
  onToggleChat,
  onToggleVoice
}) => {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const pingColor = pingMs === null ? 'var(--text-dim)' : pingMs < 80 ? 'var(--primary)' : pingMs < 180 ? 'var(--amber)' : 'var(--danger)';

  return (
    <header className="top-bar">
      <div className="bar-left">
        <div className={`hud-pill timer-pill ${timeRemaining <= 10 ? 'low' : ''}`}>
          {formatTime(timeRemaining)}
        </div>
        <div className="latency-indicator">
          <span className="ping-dot" style={{ backgroundColor: pingColor, boxShadow: `0 0 6px ${pingColor}` }} />
          <span>{pingMs !== null ? `${pingMs}ms` : 'Connected'}</span>
        </div>
      </div>

      <div className="bar-right">
        <button className="hud-pill room-pill" onClick={onCopyRoom} title="Copy Room Code">
          <span className="room-label">ROOM</span>
          <strong>{roomCode}</strong>
        </button>

        <button
          className={`icon-btn ${isZElevated ? 'active' : ''}`}
          onClick={onToggleZ}
          title="Jump 3D Z-Layer (Z / Shift)"
        >
          <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span className="btn-key-badge">Z</span>
        </button>

        <button className="icon-btn" onClick={onDropMine} title="Drop Tail Mine (E)">
          <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="14" r="8" />
            <path d="M12 6V3M9 3h6M19 5l-2.5 2.5" />
          </svg>
          <span className="btn-key-badge">E</span>
        </button>

        {isAdmin && (
          <button className="icon-btn" onClick={onTogglePause} title="Pause/Resume Match" style={{ color: 'var(--amber)' }}>
            <svg className="svg-icon" viewBox="0 0 24 24" fill="currentColor">
              {isPaused ? (
                <polygon points="5 3 19 12 5 21 5 3" />
              ) : (
                <>
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </>
              )}
            </svg>
          </button>
        )}

        <button className="icon-btn" onClick={onOpenSettings} title="Arena Settings & Modifiers">
          <svg className="svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path fillRule="evenodd" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" clipRule="evenodd" />
          </svg>
        </button>

        <button className="icon-btn" onClick={onToggleChat} title="Live Comms">
          <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          {unreadChat && <span className="unread-dot" />}
        </button>

        <button className={`icon-btn ${isVoiceActive ? 'active' : ''}`} onClick={onToggleVoice} title="Voice Chat">
          <svg className="svg-icon" viewBox="0 0 24 24" fill={isVoiceActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
          </svg>
        </button>
      </div>
    </header>
  );
};
