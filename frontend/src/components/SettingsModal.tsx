import React, { useState, useEffect } from 'react';
import { GameModifiers } from '../types/game';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  initialModifiers: GameModifiers;
  initialMatchSeconds: number;
  onApply: (modifiers: GameModifiers, matchSeconds: number) => void;
}

const PRESETS: Record<string, GameModifiers> = {
  classic: {
    portalWalls: false, gravityWells: false, shrinkingArena: false, teleportTiles: false,
    oneWayCorridors: false, elasticTether: false, inverseMode: false, detachableTail: false,
    segmentedOwnership: false, decayMode: false, symbioteFusion: false, packBonding: false,
    fogOfWar: false, colorReshuffle: false, mirroredCurse: false, fakeFood: false, zLayers: false,
    bumperPhysics: false, weatherSystem: false, chaosCards: false, leaderboardCurse: false
  },
  quantum: {
    portalWalls: true, gravityWells: true, shrinkingArena: false, teleportTiles: true,
    oneWayCorridors: true, elasticTether: true, inverseMode: false, detachableTail: false,
    segmentedOwnership: true, decayMode: false, symbioteFusion: false, packBonding: false,
    fogOfWar: false, colorReshuffle: false, mirroredCurse: false, fakeFood: false, zLayers: true,
    bumperPhysics: true, weatherSystem: false, chaosCards: true, leaderboardCurse: false
  },
  royale: {
    portalWalls: false, gravityWells: false, shrinkingArena: true, teleportTiles: true,
    oneWayCorridors: false, elasticTether: false, inverseMode: false, detachableTail: true,
    segmentedOwnership: true, decayMode: true, symbioteFusion: false, packBonding: false,
    fogOfWar: false, colorReshuffle: false, mirroredCurse: false, fakeFood: true, zLayers: false,
    bumperPhysics: false, weatherSystem: true, chaosCards: true, leaderboardCurse: true
  },
  stealth: {
    portalWalls: true, gravityWells: false, shrinkingArena: false, teleportTiles: true,
    oneWayCorridors: false, elasticTether: false, inverseMode: false, detachableTail: true,
    segmentedOwnership: false, decayMode: false, symbioteFusion: false, packBonding: false,
    fogOfWar: true, colorReshuffle: false, mirroredCurse: true, fakeFood: true, zLayers: true,
    bumperPhysics: false, weatherSystem: false, chaosCards: true, leaderboardCurse: true
  },
  fusion: {
    portalWalls: true, gravityWells: true, shrinkingArena: false, teleportTiles: true,
    oneWayCorridors: false, elasticTether: true, inverseMode: false, detachableTail: true,
    segmentedOwnership: true, decayMode: false, symbioteFusion: true, packBonding: true,
    fogOfWar: false, colorReshuffle: false, mirroredCurse: false, fakeFood: false, zLayers: true,
    bumperPhysics: false, weatherSystem: false, chaosCards: true, leaderboardCurse: false
  },
  chaos: {
    portalWalls: true, gravityWells: true, shrinkingArena: true, teleportTiles: true,
    oneWayCorridors: true, elasticTether: true, inverseMode: true, detachableTail: true,
    segmentedOwnership: true, decayMode: true, symbioteFusion: true, packBonding: true,
    fogOfWar: true, colorReshuffle: true, mirroredCurse: true, fakeFood: true, zLayers: true,
    bumperPhysics: true, weatherSystem: true, chaosCards: true, leaderboardCurse: true
  }
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  initialModifiers,
  initialMatchSeconds,
  onApply
}) => {
  const [mods, setMods] = useState<GameModifiers>(initialModifiers);
  const [seconds, setSeconds] = useState<number>(initialMatchSeconds);

  useEffect(() => {
    setMods(initialModifiers);
    setSeconds(initialMatchSeconds);
  }, [initialModifiers, initialMatchSeconds, isOpen]);

  if (!isOpen) return null;

  const toggle = (key: keyof GameModifiers) => {
    setMods(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loadPreset = (presetKey: string) => {
    if (PRESETS[presetKey]) {
      setMods({ ...PRESETS[presetKey] });
    }
  };

  const handleApply = () => {
    onApply(mods, seconds);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide-modal">
        <div className="modal-header">
          <div className="modal-title">
            <svg className="svg-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            <h3>ARENA CUSTOMIZER & MODIFIERS</h3>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <svg className="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="modal-hint" style={{ color: isAdmin ? 'var(--primary)' : 'var(--danger)' }}>
          {isAdmin ? 'You are the admin. You can customize all 28 modifiers and presets.' : 'Only the match admin can apply changes.'}
        </p>

        <div className="presets-section">
          <span className="section-tag">ONE-CLICK PRESETS:</span>
          <div className="presets-grid">
            <button className="preset-chip" onClick={() => loadPreset('classic')}>🎮 Classic Arena</button>
            <button className="preset-chip" onClick={() => loadPreset('quantum')}>🌀 Quantum Warp</button>
            <button className="preset-chip" onClick={() => loadPreset('royale')}>⚔️ Battle Royale</button>
            <button className="preset-chip" onClick={() => loadPreset('stealth')}>👁️ Stealth & Chaos</button>
            <button className="preset-chip" onClick={() => loadPreset('fusion')}>🧬 Fusion & Social</button>
            <button className="preset-chip" onClick={() => loadPreset('chaos')}>🎲 Total Mayhem</button>
          </div>
        </div>

        <div className="modal-scroll-body">
          <label className="modal-label">
            <span>MATCH DURATION (SECONDS)</span>
            <input
              type="number"
              min={30}
              max={1800}
              step={30}
              value={seconds}
              onChange={e => setSeconds(Number(e.target.value))}
            />
          </label>

          <div className="modifier-group">
            <span className="group-title">1. MOVEMENT & SPACE</span>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.portalWalls} onChange={() => toggle('portalWalls')} />
              <span>Portal Walls (Wrap around borders)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.gravityWells} onChange={() => toggle('gravityWells')} />
              <span>Gravity Wells (Drifting orbital singularities)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.shrinkingArena} onChange={() => toggle('shrinkingArena')} />
              <span>Shrinking Arena (Battle royale storm)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.teleportTiles} onChange={() => toggle('teleportTiles')} />
              <span>Teleport Tiles (Instant portal pairs)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.oneWayCorridors} onChange={() => toggle('oneWayCorridors')} />
              <span>One-Way Corridors (Directional pathways)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.elasticTether} onChange={() => toggle('elasticTether')} />
              <span>Elastic Tether (Invisible pair attraction)</span>
            </label>
          </div>

          <div className="modifier-group">
            <span className="group-title">2. GROWTH & LENGTH MECHANICS</span>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.inverseMode} onChange={() => toggle('inverseMode')} />
              <span>Inverse Mode (60s win condition flip)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.detachableTail} onChange={() => toggle('detachableTail')} />
              <span>Detachable Tail (Key E / Drop mine obstacle)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.segmentedOwnership} onChange={() => toggle('segmentedOwnership')} />
              <span>Segmented Ownership (Collectible severed tail chunks)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.decayMode} onChange={() => toggle('decayMode')} />
              <span>Decay Mode (Continuous length decay)</span>
            </label>
          </div>

          <div className="modifier-group">
            <span className="group-title">3. FUSION & SOCIAL MECHANICS</span>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.symbioteFusion} onChange={() => toggle('symbioteFusion')} />
              <span>Symbiote Fusion (Head-on merge for 10s)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.packBonding} onChange={() => toggle('packBonding')} />
              <span>Pack Bonding (Close ally shield & speed)</span>
            </label>
          </div>

          <div className="modifier-group">
            <span className="group-title">4. PERCEPTION & INFORMATION WARFARE</span>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.fogOfWar} onChange={() => toggle('fogOfWar')} />
              <span>Fog of War (Head perception radius)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.mirroredCurse} onChange={() => toggle('mirroredCurse')} />
              <span>Mirrored Controls Curse (Invert steering)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.fakeFood} onChange={() => toggle('fakeFood')} />
              <span>Fake Food (Poison shrinking decoys)</span>
            </label>
          </div>

          <div className="modifier-group">
            <span className="group-title">5. PHYSICS, META & WEATHER</span>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.zLayers} onChange={() => toggle('zLayers')} />
              <span>3D Z-Layers (Key Z / Jump over snakes)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.bumperPhysics} onChange={() => toggle('bumperPhysics')} />
              <span>Elastic Bumper Physics (Bumper bounce)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.weatherSystem} onChange={() => toggle('weatherSystem')} />
              <span>Weather System (Wind drift & ice patches)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.chaosCards} onChange={() => toggle('chaosCards')} />
              <span>Chaos Card Draws (Periodic arena modifiers)</span>
            </label>
            <label className="checkbox-item">
              <input type="checkbox" checked={mods.leaderboardCurse} onChange={() => toggle('leaderboardCurse')} />
              <span>Leaderboard Curse (#1 player handicap)</span>
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-primary" disabled={!isAdmin} onClick={handleApply}>
            Apply Arena Settings
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
