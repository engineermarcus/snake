import React, { useState } from 'react';
import { Point } from '../types/game';

interface DPadProps {
  onDir: (dir: Point) => void;
}

export const DPad: React.FC<DPadProps> = ({ onDir }) => {
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const handlePress = (dir: Point, name: string, e: React.SyntheticEvent) => {
    e.preventDefault();
    setActiveBtn(name);
    if (navigator.vibrate) {
      try { navigator.vibrate(10); } catch(e) {}
    }
    onDir(dir);
  };

  const handleRelease = () => {
    setActiveBtn(null);
  };

  return (
    <div className="dpad-container" onContextMenu={(e) => e.preventDefault()}>
      <div className="dpad-grid">
        <button
          className={`dpad-btn up ${activeBtn === 'up' ? 'pressed' : ''}`}
          onPointerDown={(e) => handlePress({ x: 0, y: -1 }, 'up', e)}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          onPointerCancel={handleRelease}
          aria-label="Up"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className={`dpad-btn left ${activeBtn === 'left' ? 'pressed' : ''}`}
          onPointerDown={(e) => handlePress({ x: -1, y: 0 }, 'left', e)}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          onPointerCancel={handleRelease}
          aria-label="Left"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className={`dpad-btn down ${activeBtn === 'down' ? 'pressed' : ''}`}
          onPointerDown={(e) => handlePress({ x: 0, y: 1 }, 'down', e)}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          onPointerCancel={handleRelease}
          aria-label="Down"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          className={`dpad-btn right ${activeBtn === 'right' ? 'pressed' : ''}`}
          onPointerDown={(e) => handlePress({ x: 1, y: 0 }, 'right', e)}
          onPointerUp={handleRelease}
          onPointerLeave={handleRelease}
          onPointerCancel={handleRelease}
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

