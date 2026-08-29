import React, { useEffect, useRef } from 'react';
import { PublicGameState, Point } from '../types/game';
import { BALL_COLOR } from '../config';

interface ArenaBoardProps {
  gameState: PublicGameState | null;
  myPlayerId: string | null;
  onSendDir: (dir: Point) => void;
}

export const ArenaBoard: React.FC<ArenaBoardProps> = ({
  gameState,
  myPlayerId,
  onSendDir
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>>([]);
  const prevAliveRef = useRef<Record<string, boolean>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const animFrameRef = useRef<number>(0);

  // Resize canvas to always match its CSS container via ResizeObserver
  useEffect(() => {
    const setSize = (w: number, h: number) => {
      if (!canvasRef.current || !fxCanvasRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      // Square: take the smaller of width/height so the canvas is never distorted
      const cssPx = Math.floor(Math.min(w, h)) || 600;
      const bufPx = Math.floor(cssPx * dpr);

      // Set CSS display size to a square (overrides width:100%;height:100% in stylesheet)
      const px = `${cssPx}px`;
      canvasRef.current.style.width  = px;
      canvasRef.current.style.height = px;
      fxCanvasRef.current.style.width  = px;
      fxCanvasRef.current.style.height = px;

      // Set draw-buffer size (retina-aware)
      canvasRef.current.width  = bufPx;
      canvasRef.current.height = bufPx;
      fxCanvasRef.current.width  = bufPx;
      fxCanvasRef.current.height = bufPx;
    };

    const el = wrapRef.current;
    if (!el) return;

    // Initial size
    const rect = el.getBoundingClientRect();
    setSize(rect.width, rect.height);

    // Watch for container size changes (orientation, resize, flex layout settle)
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    if (!canvasRef.current || !gameState) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    animFrameRef.current++;
    const g = gameState;
    const cell = canvas.width / g.grid;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Ice Patches
    if (g.icePatches) {
      g.icePatches.forEach(ice => {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ice.x * cell + cell/2, ice.y * cell + cell/2, ice.radius * cell, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    // 2. One-Way Corridors
    if (g.oneWayCorridors) {
      g.oneWayCorridors.forEach(ow => {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
        ctx.fillRect(ow.x * cell, ow.y * cell, ow.w * cell, ow.h * cell);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.font = `${cell * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const symbol = ow.dir.x > 0 ? '▶' : '◀';
        ctx.fillText(symbol, (ow.x + ow.w/2) * cell, (ow.y + ow.h/2) * cell);
      });
    }

    // 3. Teleporters
    if (g.teleporters) {
      g.teleporters.forEach(tp => {
        [tp.a, tp.b].forEach(p => {
          ctx.save();
          ctx.strokeStyle = tp.color;
          ctx.shadowColor = tp.color;
          ctx.shadowBlur = 8;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          const r = (cell * 0.4) + Math.sin(animFrameRef.current * 0.08) * 2;
          ctx.arc(p.x * cell + cell/2, p.y * cell + cell/2, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });
      });
    }

    // 4. Gravity Wells
    if (g.gravityWells) {
      g.gravityWells.forEach(gw => {
        ctx.save();
        const gx = gw.x * cell + cell/2;
        const gy = gw.y * cell + cell/2;
        const pulseR = gw.pullRadius * cell * 0.5 + Math.sin(animFrameRef.current * 0.05) * 4;
        const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, pulseR);
        grad.addColorStop(0, 'rgba(168, 85, 247, 0.8)');
        grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
        grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, pulseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f3e8ff';
        ctx.beginPath();
        ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // 5. Shrinking Storm
    if (g.storm && g.storm.active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(g.storm.center.x * cell, g.storm.center.y * cell, g.storm.radius * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Severed Chunks
    if (g.severedChunks) {
      g.severedChunks.forEach(chunk => {
        ctx.fillStyle = chunk.color || '#4dff88';
        const cx = chunk.x * cell + cell/2;
        const cy = chunk.y * cell + cell/2;
        const sz = cell * 0.25;
        ctx.fillRect(cx - sz/2, cy - sz/2, sz, sz);
      });
    }

    // 7. Mines
    if (g.mines) {
      g.mines.forEach(mine => {
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        const mx = mine.x * cell + cell/2;
        const my = mine.y * cell + cell/2;
        ctx.beginPath();
        ctx.arc(mx, my, cell * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(mx, my, cell * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // 8. Food Orb (Luminous Red)
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

    // 9. Fake Poison Food
    if (g.fakeFoods) {
      g.fakeFoods.forEach(fake => {
        ctx.save();
        ctx.fillStyle = '#a855f7';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 8;
        const px = fake.x * cell + cell/2;
        const py = fake.y * cell + cell/2;
        ctx.beginPath();
        ctx.arc(px, py, cell / 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, cell / 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // 10. Draw Ground Snakes
    for (const id in g.snakes) {
      const s = g.snakes[id];
      if (s.dead || !s.body.length || s.zLayer === 1) continue;
      drawSnake(ctx, s.body, s.color, s.name || id.slice(-4), cell, id === myPlayerId, id === g.adminId, 0, s.shield, s.fusedWith !== null);
    }

    // 11. Draw Elevated 3D Z-Layer Snakes
    for (const id in g.snakes) {
      const s = g.snakes[id];
      if (s.dead || !s.body.length || s.zLayer !== 1) continue;
      drawSnake(ctx, s.body, s.color, s.name || id.slice(-4), cell, id === myPlayerId, id === g.adminId, 1, s.shield, s.fusedWith !== null);
    }

    // 12. Fog of War
    if (g.modifiers && g.modifiers.fogOfWar && myPlayerId && g.snakes[myPlayerId] && !g.snakes[myPlayerId].dead) {
      const myHead = g.snakes[myPlayerId].body[0];
      const hx = myHead.x * cell + cell/2;
      const hy = myHead.y * cell + cell/2;
      const visRadius = cell * 7.5;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      const grad = ctx.createRadialGradient(hx, hy, cell * 2, hx, hy, visRadius);
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.9)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // Detect Deaths for FX
    for (const id in g.snakes) {
      const s = g.snakes[id];
      if (prevAliveRef.current[id] !== false && s.dead && s.body.length) {
        spawnBurst(s.body[0], s.color, cell);
      }
      prevAliveRef.current[id] = !s.dead;
    }
  }, [gameState, myPlayerId]);

  // Particle Loop
  useEffect(() => {
    let animId: number;
    const step = () => {
      if (fxCanvasRef.current) {
        const fxCtx = fxCanvasRef.current.getContext('2d');
        if (fxCtx) {
          fxCtx.clearRect(0, 0, fxCanvasRef.current.width, fxCanvasRef.current.height);
          particlesRef.current = particlesRef.current.filter(p => p.life > 0.02);
          for (const p of particlesRef.current) {
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
        }
      }
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, []);

  const spawnBurst = (cellPos: Point, color: string, cell: number) => {
    const cx = cellPos.x * cell + cell / 2;
    const cy = cellPos.y * cell + cell / 2;
    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const speed = 2 + Math.random() * 3.5;
      particlesRef.current.push({
        x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color
      });
    }
  };

  const drawSnake = (
    ctx: CanvasRenderingContext2D,
    body: Point[],
    color: string,
    name: string,
    cell: number,
    isMe: boolean,
    isRoomAdmin: boolean,
    zLayer: number,
    hasShield: boolean,
    isFused: boolean
  ) => {
    ctx.save();
    if (zLayer === 1) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
    } else {
      ctx.shadowColor = color;
      ctx.shadowBlur = isMe ? 12 : 5;
    }
    ctx.fillStyle = color;

    body.forEach((seg, i) => {
      const pad = i === 0 ? 1 : 2;
      const x = seg.x * cell + pad;
      const y = seg.y * cell + pad;
      const w = cell - pad * 2;
      const h = cell - pad * 2;
      const radius = i === 0 ? Math.max(4, cell * 0.3) : Math.max(3, cell * 0.2);

      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
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
      ctx.font = `600 ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      let prefix = isRoomAdmin ? '👑 ' : '';
      if (isFused) prefix = '🧬 ';
      if (hasShield) prefix = '🛡️ ';
      const suffix = zLayer === 1 ? ' [3D]' : '';
      const displayName = prefix + name + suffix;
      const tagY = head.y * cell - 4;

      const textMetrics = ctx.measureText(displayName);
      const pillW = textMetrics.width + 12;
      const pillH = fontSize + 6;
      const pillX = hx - pillW / 2;
      const pillY = tagY - pillH;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = zLayer === 1 ? 'rgba(168, 85, 247, 0.8)' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if ((ctx as any).roundRect) (ctx as any).roundRect(pillX, pillY, pillW, pillH, 6);
      else ctx.rect(pillX, pillY, pillW, pillH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = zLayer === 1 ? '#e9d5ff' : color;
      ctx.fillText(displayName, hx, tagY - 2);
    }

    ctx.restore();
  };

  // Zero-Lag Touch Swipe Steering Handler
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) >= 12) {
      if (absDx > absDy) {
        onSendDir({ x: dx > 0 ? 1 : -1, y: 0 });
      } else {
        onSendDir({ x: 0, y: dy > 0 ? 1 : -1 });
      }
      // Reset origin to current position so player can chain immediate continuous swipes
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    }
  };

  const onTouchEnd = () => {
    touchStartRef.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className={`board-wrap ${gameState?.paused ? 'paused' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <canvas id="board" ref={canvasRef} />
      <canvas id="fx" ref={fxCanvasRef} />

      {gameState?.chaosCard && (
        <div className="chaos-banner">
          <div className="chaos-title">CHAOS EVENT: {gameState.chaosCard.title}</div>
          <div className="chaos-desc">{gameState.chaosCard.desc}</div>
        </div>
      )}
    </div>
  );
};
