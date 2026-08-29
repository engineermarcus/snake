import React from 'react';
import { SnakeState } from '../types/game';

interface ScoreboardProps {
  snakes: Record<string, SnakeState>;
  myPlayerId: string | null;
  adminId: string | null;
  inverseMode: boolean;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  snakes,
  myPlayerId,
  adminId,
  inverseMode
}) => {
  const sortedIds = Object.keys(snakes).sort((a, b) => {
    return inverseMode ? snakes[a].score - snakes[b].score : snakes[b].score - snakes[a].score;
  });

  return (
    <div className="scoreboard-strip">
      {sortedIds.map(id => {
        const s = snakes[id];
        const isMe = id === myPlayerId;
        const isAdmin = id === adminId;

        return (
          <div key={id} className={`score-chip ${isMe ? 'me' : ''} ${s.dead ? 'dead' : ''}`}>
            <span
              className="dot"
              style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}` }}
            />
            {isAdmin && <span style={{ color: 'var(--amber)' }}>👑</span>}
            <span className="chip-name" style={{ color: s.color }}>
              {s.name || id.slice(-4)}
              {s.shield && ' 🛡️'}
              {s.zLayer === 1 && ' ✈️'}
            </span>
            <span className={`chip-score ${s.score < 0 ? 'neg' : ''}`}>{s.score}</span>
          </div>
        );
      })}
    </div>
  );
};
