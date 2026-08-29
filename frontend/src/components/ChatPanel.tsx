import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, SnakeState } from '../types/game';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  voiceActive: boolean;
  voicePeers: string[];
  snakes: Record<string, SnakeState>;
  myPlayerId: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  voiceActive,
  voicePeers,
  snakes,
  myPlayerId
}) => {
  const [inputText, setInputText] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  if (!isOpen) return null;

  return (
    <aside className="chat-panel">
      <div className="panel-header">
        <div className="panel-title">
          <svg className="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          <span>LIVE COMMS</span>
        </div>
        <button className="btn-ghost" onClick={onClose} aria-label="Close Chat">
          <svg className="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {(voiceActive || voicePeers.length > 0) && (
        <div className="voice-strip">
          {voiceActive && (
            <span className="voice-peer" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
              🎙️ <span>You</span>
            </span>
          )}
          {voicePeers.map(pid => {
            const p = snakes[pid];
            const pcolor = p ? p.color : 'var(--text-muted)';
            const pname = p ? p.name : pid.slice(-4);
            return (
              <span key={pid} className="voice-peer" style={{ borderColor: pcolor, color: pcolor }}>
                🔊 <span>{pname}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="chat-stream" ref={logRef}>
        {messages.map((m, idx) => (
          <div key={idx} className={`chat-msg ${m.isSystem ? 'system' : ''}`}>
            {!m.isSystem && (
              <span className="chat-from" style={{ color: m.color }}>
                {m.name}:
              </span>
            )}
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          maxLength={200}
          placeholder="Type message…"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
            if (e.key === 'Escape') onClose();
          }}
          autoComplete="off"
          spellCheck="false"
        />
        <button className="btn-send" onClick={handleSend}>
          <svg className="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" />
          </svg>
        </button>
      </div>
    </aside>
  );
};
