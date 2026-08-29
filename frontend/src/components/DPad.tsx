import React from 'react';
import { Point } from '../types/game';

interface DPadProps {
  onDir: (dir: Point) => void;
}

export const DPad: React.FC<DPadProps> = ({ onDir }) => {
  const trigger = (dir: Point) => {
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch(e) {}
    }
    onDir(dir);
  };

  return (
    <div className="dpad-container">
      <div className="dpad-grid">
        <button
          className="dpad-btn up"
          onTouchStart={(e) => { e.preventDefault(); trigger({ x: 0, y: -1 }); }}
          onClick={() => trigger({ x: 0, y: -1 })}
          aria-label="Up"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className="dpad-btn left"
          onTouchStart={(e) => { e.preventDefault(); trigger({ x: -1, y: 0 }); }}
          onClick={() => trigger({ x: -1, y: 0 })}
          aria-label="Left"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className="dpad-btn down"
          onTouchStart={(e) => { e.preventDefault(); trigger({ x: 0, y: 1 }); }}
          onClick={() => trigger({ x: 0, y: 1 })}
          aria-label="Down"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className="dpad-btn right"
          onTouchStart={(e) => { e.preventDefault(); trigger({ x: 1, y: 0 }); }}
          onClick={() => trigger({ x: 1, y: 0 })}
          aria-label="Right"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="dpad-center" />
      </div>
    </div>
  );
};
