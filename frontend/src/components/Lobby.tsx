import React, { useState } from 'react';
import { AVAILABLE_COLORS, BALL_COLOR } from '../config';

interface LobbyProps {
  onJoin: (name: string, color: string, code?: string) => void;
  error: string | null;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin, error }) => {
  const [name, setName] = useState(localStorage.getItem('snake_saved_name') || '');
  const [color, setColor] = useState(localStorage.getItem('snake_saved_color') || AVAILABLE_COLORS[0]);
  const [code, setCode] = useState('');

  const handleCreate = () => {
    const finalName = name.trim() || `Player ${Math.floor(100 + Math.random() * 900)}`;
    console.log('[Lobby] CREATE MATCH clicked, name:', finalName, 'color:', color);
    localStorage.setItem('snake_saved_name', finalName);
    localStorage.setItem('snake_saved_color', color);
    onJoin(finalName, color);
  };

  const handleJoin = () => {
    const finalName = name.trim() || `Player ${Math.floor(100 + Math.random() * 900)}`;
    const finalCode = code.trim().toUpperCase();
    if (finalCode.length !== 4) return;
    localStorage.setItem('snake_saved_name', finalName);
    localStorage.setItem('snake_saved_color', color);
    onJoin(finalName, color, finalCode);
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <div className="brand-header">
          <div className="brand-badge">
            <span className="live-pulse"></span> MULTIPLAYER ARENA
          </div>
          <h1 className="brand-title">SNAKE<span>ARENA</span></h1>
          <p className="brand-subtitle">Fast-paced competitive multiplayer battle</p>
        </div>

        <div className="lobby-form">
          <div className="input-group">
            <label className="field-label">PLAYER HANDLE</label>
            <div className="input-wrapper">
              <input
                type="text"
                maxLength={16}
                placeholder="Enter your nickname"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </div>

          <div className="input-group">
            <div className="label-row">
              <label className="field-label">SNAKE COLOR</label>
              <span className="red-restriction-badge">
                <span className="dot-red"></span> Red is ball-only
              </span>
            </div>
            <div className="color-picker-grid">
              <div
                className="color-swatch disabled"
                style={{ backgroundColor: BALL_COLOR }}
                title="Red is reserved for the food ball"
              />
              {AVAILABLE_COLORS.map(c => (
                <div
                  key={c}
                  className={`color-swatch ${c === color ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="action-divider"><span>OR</span></div>

          <button className="btn-cta" onClick={handleCreate}>
            <span>CREATE NEW MATCH</span>
          </button>

          <div className="join-box">
            <span className="join-label">HAVE A MATCH CODE?</span>
            <div className="join-row">
              <input
                type="text"
                maxLength={4}
                placeholder="CODE"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                autoComplete="off"
                spellCheck="false"
              />
              <button className="btn-join" onClick={handleJoin}>JOIN</button>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>
      </div>
    </div>
  );
};
