import React, { useEffect, useRef } from "react";
import { playBeep, createAudioContext } from "../lib/audio";
import { getBallPairPositions, canvasPointerFromRef } from "../lib/app-physics";
import type { CanvasContextWithLetterSpacing } from "../types/app";

interface NewtonsCradleProps {
  isAuthenticated: boolean;
  activeApp: number | null;
  setActiveApp: (app: number | null) => void;
}

export const NewtonsCradle: React.FC<NewtonsCradleProps> = ({
  isAuthenticated,
  activeApp,
  setActiveApp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dragStartInfo = useRef({ x: 0, y: 0, time: 0 });

  // Physics state (starts at 0 - static rest until interacted with)
  const physicsState = useRef({
    theta: [0, 0, 0],
    omega: [0, 0, 0],
    draggedIndex: null as number | null,
    targetTheta: 0,
    prevDragTheta: 0,
  });

  // Mouse state tracker
  const mouseState = useRef({
    x: 0,
    y: 0,
    isDown: false,
  });

  // Keep a ref of activeApp for the animation loop to access without re-running useEffect
  const activeAppRef = useRef<number | null>(activeApp);
  useEffect(() => {
    activeAppRef.current = activeApp;
  }, [activeApp]);

  // Dynamic layout calculations based on viewport size
  const getLayout = (width: number, height: number) => {
    const minR = width < 360 ? 38 : 50;
    const R = Math.max(minR, Math.min(180, Math.min(width, height) * 0.12));
    const L = Math.max(250, height * 0.65);
    const yStart = 16;
    const xCenter = width / 2;
    return { R, L, yStart, xCenter };
  };

  // Web Audio click generator for collisions
  const playCollisionSound = (velocity: number) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = createAudioContext();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const now = ctx.currentTime;
      
      const volume = Math.min(Math.max(velocity * 0.14, 0.015), 0.35);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      gainNode.connect(ctx.destination);
      
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(2600, now);
      osc1.connect(gainNode);
      
      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(850, now);
      osc2.connect(gainNode);
      
      osc1.start(now);
      osc1.stop(now + 0.06);
      osc2.start(now);
      osc2.stop(now + 0.06);
    } catch {
      // ignore
    }
  };

  // Mouse/Touch drag handlers
  const handleStartDrag = (clientX: number, clientY: number) => {
    const pointer = canvasPointerFromRef(canvasRef, clientX, clientY);
    if (!pointer) return;
    const { w, h, mx, my } = pointer;

    const { R, L, yStart, xCenter } = getLayout(w, h);
    
    mouseState.current.x = mx;
    mouseState.current.y = my;
    mouseState.current.isDown = true;
    
    const state = physicsState.current;
    let closestIndex = -1;
    let minDist = Infinity;
    
    for (let i = 0; i < 3; i++) {
      const xAnchor = xCenter + (i - 1) * 2 * R;
      const bx = xAnchor + L * Math.sin(state.theta[i]);
      const by = yStart + L * Math.cos(state.theta[i]);
      
      const dx = mx - bx;
      const dy = my - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < R * 1.8 && dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
    }
    
    if (closestIndex !== -1) {
      playBeep("click");
      state.draggedIndex = closestIndex;
      const xAnchor = xCenter + (closestIndex - 1) * 2 * R;
      state.targetTheta = Math.atan2(mx - xAnchor, my - yStart);
      state.prevDragTheta = state.targetTheta;
      dragStartInfo.current = {
        x: mx,
        y: my,
        time: performance.now(),
      };
    }
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    const pointer = canvasPointerFromRef(canvasRef, clientX, clientY);
    if (!pointer) return;
    const { w, h, mx, my } = pointer;

    const { R, yStart, xCenter } = getLayout(w, h);
    
    mouseState.current.x = mx;
    mouseState.current.y = my;
    
    const state = physicsState.current;
    if (state.draggedIndex !== null) {
      const xAnchor = xCenter + (state.draggedIndex - 1) * 2 * R;
      let angle = Math.atan2(mx - xAnchor, my - yStart);
      
      const limit = (75 * Math.PI) / 180;
      angle = Math.max(-limit, Math.min(limit, angle));
      
      state.prevDragTheta = state.targetTheta;
      state.targetTheta = angle;
    }
  };

  const handleEndDrag = () => {
    mouseState.current.isDown = false;
    const state = physicsState.current;
    if (state.draggedIndex !== null) {
      const startX = dragStartInfo.current.x;
      const startY = dragStartInfo.current.y;
      const endX = mouseState.current.x;
      const endY = mouseState.current.y;
      
      const dist = Math.hypot(endX - startX, endY - startY);
      const duration = performance.now() - dragStartInfo.current.time;
      
      if (dist < 8 && duration < 350) {
        playBeep("success");
        setActiveApp(state.draggedIndex + 1);
        state.draggedIndex = null;
        return;
      }

      playBeep("click");
      const dt = 1 / 60;
      const dragVel = (state.targetTheta - state.prevDragTheta) / dt;
      state.omega[state.draggedIndex] = Math.max(-14, Math.min(14, dragVel));
      state.draggedIndex = null;
    }
  };

  // Setup simulation, canvas resize handling, and render loop
  useEffect(() => {
    if (!isAuthenticated) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // When a subapp overlay is open the canvas is blurred + non-interactive, so
    // running a 60fps physics/canvas loop wastes CPU & battery. The loop below
    // self-pauses whenever activeAppRef is set and resumes on return.
    let paused = activeAppRef.current !== null;
    
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    };
    
    window.addEventListener("resize", handleResize);
    handleResize();

    let animationId: number;
    let lastTime = performance.now();

    const updatePhysics = (dtFrame: number, w: number, h: number) => {
      const state = physicsState.current;
      const subSteps = 16;
      const dt = dtFrame / subSteps;
      const { R, L } = getLayout(w, h);
      
      let collisionRecorded = false;
      let maxVelocity = 0;

      const { xCenter, yStart } = getLayout(w, h);
      const ballLayout = { xCenter, yStart, R, L };
      
      for (let step = 0; step < subSteps; step++) {
        // 1. Integrator
        for (let i = 0; i < 3; i++) {
          if (state.draggedIndex !== i) {
            const acc = -(2400 / L) * Math.sin(state.theta[i]) - 0.001 * state.omega[i];
            state.omega[i] += acc * dt;
            state.theta[i] += state.omega[i] * dt;
          }
        }

        // 2. Ceiling bounce check
        const cosLimit = R / L;
        for (let i = 0; i < 3; i++) {
          if (state.draggedIndex !== i) {
            if (Math.cos(state.theta[i]) <= cosLimit) {
              state.omega[i] = -state.omega[i] * 0.55;
              state.theta[i] = Math.sign(state.theta[i]) * Math.acos(cosLimit - 0.0001);
            }
          }
        }

        // 3. Drag / push constraints
        if (state.draggedIndex !== null) {
          const idx = state.draggedIndex;
          state.theta[idx] = state.targetTheta;
          state.omega[idx] = 0;
          
          for (let i = idx; i < 2; i++) {
            if (state.theta[i] > state.theta[i+1]) {
              state.theta[i+1] = state.theta[i];
              state.omega[i+1] = 0;
            }
          }
          for (let i = idx; i > 0; i--) {
            if (state.theta[i] < state.theta[i-1]) {
              state.theta[i-1] = state.theta[i];
              state.omega[i-1] = 0;
            }
          }
        }

        // 4. Sequential 1D elastic collisions (Velocity swap)
        let collided = true;
        let iter = 0;
        while (collided && iter < 5) {
          collided = false;
          for (let i = 0; i < 2; i++) {
            const { dist } = getBallPairPositions(ballLayout, state.theta, i);
            if (dist <= 2 * R) {
              if (state.omega[i] > state.omega[i+1]) {
                const w1 = state.omega[i];
                const w2 = state.omega[i+1];
                
                state.omega[i] = 0.5 * ((1 - 0.99) * w1 + (1 + 0.99) * w2);
                state.omega[i+1] = 0.5 * ((1 + 0.99) * w1 + (1 - 0.99) * w2);
                
                collisionRecorded = true;
                const v = w1 - w2;
                if (v > maxVelocity) {
                  maxVelocity = v;
                }
                collided = true;
              }
            }
          }
          iter++;
        }

        // 5. Hard positional projection to ensure balls NEVER overlap/intersect
        let overlapCorrectionIter = 0;
        let positionsCorrected = true;
        while (positionsCorrected && overlapCorrectionIter < 10) {
          positionsCorrected = false;
          for (let i = 0; i < 2; i++) {
            const { x1, y1, x2, y2, dist } = getBallPairPositions(ballLayout, state.theta, i);
            const minDist = 2 * R;
            
            if (dist < minDist) {
              const overlap = minDist - dist;
              const dx = (x2 - x1) / (dist || 1);
              const dy = (y2 - y1) / (dist || 1);
              
              const pushX = dx * overlap * 0.5;
              const pushY = dy * overlap * 0.5;
              
              const tangentX1 = Math.cos(state.theta[i]);
              const tangentY1 = -Math.sin(state.theta[i]);
              const dTheta1 = (-pushX * tangentX1 - pushY * tangentY1) / L;
              
              const tangentX2 = Math.cos(state.theta[i+1]);
              const tangentY2 = -Math.sin(state.theta[i+1]);
              const dTheta2 = (pushX * tangentX2 + pushY * tangentY2) / L;
              
              if (state.draggedIndex === i) {
                state.theta[i+1] += dTheta2 * 2;
              } else if (state.draggedIndex === i+1) {
                state.theta[i] += dTheta1 * 2;
              } else {
                state.theta[i] += dTheta1;
                state.theta[i+1] += dTheta2;
              }
              positionsCorrected = true;
            }
          }
          overlapCorrectionIter++;
        }
      }

      if (activeAppRef.current === null && collisionRecorded && maxVelocity > 0.05) {
        playCollisionSound(maxVelocity);
      }
    };

    const draw = (w: number, h: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      
      const state = physicsState.current;
      const { R, L, yStart, xCenter } = getLayout(w, h);
      
      // Sleek metallic ceiling plate
      const ceilingGrad = ctx.createLinearGradient(0, 0, w, 0);
      ceilingGrad.addColorStop(0, "#09090b");
      ceilingGrad.addColorStop(0.2, "#18181b");
      ceilingGrad.addColorStop(0.5, "#3f3f46");
      ceilingGrad.addColorStop(0.8, "#18181b");
      ceilingGrad.addColorStop(1, "#09090b");
      
      ctx.fillStyle = ceilingGrad;
      ctx.fillRect(0, 0, w, 16);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(w, 16);
      ctx.stroke();

      // Anchor pegs
      for (let i = 0; i < 3; i++) {
        const xAnchor = xCenter + (i - 1) * 2 * R;
        ctx.fillStyle = "#27272a";
        ctx.beginPath();
        ctx.arc(xAnchor, 16, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      const yGround = yStart + L + R;

      // Soft ambient glow pool
      const floorGlow = ctx.createRadialGradient(xCenter, yGround + 24, 0, xCenter, yGround + 24, R * 5);
      floorGlow.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      floorGlow.addColorStop(0.5, "rgba(255, 255, 255, 0.015)");
      floorGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      
      ctx.save();
      ctx.translate(xCenter, yGround + 24);
      ctx.scale(1, 0.18);
      ctx.fillStyle = floorGlow;
      ctx.beginPath();
      ctx.arc(0, 0, R * 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // Shadows
      for (let i = 0; i < 3; i++) {
        const xAnchor = xCenter + (i - 1) * 2 * R;
        const x = xAnchor + L * Math.sin(state.theta[i]);
        const y = yStart + L * Math.cos(state.theta[i]);
        
        const hOffset = y - (yStart + L);
        const shadowScale = Math.max(0.3, 1 - hOffset / 120);
        const shadowOpacity = Math.max(0, 0.35 * (1 - hOffset / 150));
        const shadowRadius = R * 1.5 * shadowScale;
        
        ctx.save();
        ctx.translate(x, yGround + 24);
        ctx.scale(1, 0.22);
        
        const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadius);
        shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
        shadowGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.5)");
        shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, shadowRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        const glowGrad = ctx.createRadialGradient(0, 0, shadowRadius * 0.2, 0, 0, shadowRadius * 1.3);
        glowGrad.addColorStop(0, `rgba(255, 255, 255, ${shadowOpacity * 0.15})`);
        glowGrad.addColorStop(0.5, `rgba(255, 255, 255, ${shadowOpacity * 0.05})`);
        glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, shadowRadius * 1.3, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
      }

      // Strings and Balls
      for (let i = 0; i < 3; i++) {
        const xAnchor = xCenter + (i - 1) * 2 * R;
        const x = xAnchor + L * Math.sin(state.theta[i]);
        const y = yStart + L * Math.cos(state.theta[i]);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xAnchor - 2, yStart);
        ctx.lineTo(x, y);
        ctx.moveTo(xAnchor + 2, yStart);
        ctx.lineTo(x, y);
        ctx.stroke();

        const grad = ctx.createRadialGradient(
          x - R * 0.2, y - R * 0.2, R * 0.1,
          x, y, R
        );
        grad.addColorStop(0, "#27272a");
        grad.addColorStop(0.5, "#09090b");
        grad.addColorStop(1, "#030303");
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, 2 * Math.PI);
        ctx.fill();

        const rimGrad = ctx.createRadialGradient(
          x, y + R * 0.5, 0,
          x, y + R * 0.5, R * 0.7
        );
        rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
        rimGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, 2 * Math.PI);
        ctx.fill();

        ctx.save();
        ctx.translate(x, y);
        
        const specGrad = ctx.createRadialGradient(
          -R * 0.35, -R * 0.35, 0,
          -R * 0.35, -R * 0.35, R * 0.45
        );
        specGrad.addColorStop(0, "rgba(255, 255, 255, 0.25)");
        specGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
        specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(-R * 0.35, -R * 0.35, R * 0.45, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(-R * 0.35, -R * 0.35, R * 0.035, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.save();
        ctx.font = `bold ${Math.max(12, Math.round(R * 0.23))}px var(--font-heading), Montserrat, Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        try {
          (ctx as CanvasContextWithLetterSpacing).letterSpacing = "3px";
        } catch {
          // ignore
        }

        ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        
        const labels = ["DEVELOPER", "TIME & CAL", "BOOKMARK"];
        ctx.fillText(labels[i], x, y);
        ctx.restore();
      }
    };

    const renderLoop = (time: number) => {
      // Pause work while a subapp overlay is active (canvas is hidden/blurred).
      if (activeAppRef.current !== null) {
        if (!paused) paused = true;
        lastTime = time;
        animationId = requestAnimationFrame(renderLoop);
        return;
      }
      // Resuming after a pause: keep dt sane instead of a single huge step.
      if (paused) {
        lastTime = time;
        paused = false;
      }

      const dtFrame = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const w = window.innerWidth;
      const h = window.innerHeight;

      updatePhysics(dtFrame, w, h);
      draw(w, h);
      animationId = requestAnimationFrame(renderLoop);
    };

    animationId = requestAnimationFrame(renderLoop);
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, [isAuthenticated]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={(e) => handleStartDrag(e.clientX, e.clientY)}
      onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
      onMouseUp={handleEndDrag}
      onMouseLeave={handleEndDrag}
      onTouchStart={(e) => {
        if (e.touches.length > 0) {
          handleStartDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length > 0) {
          handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchEnd={handleEndDrag}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing bg-black"
    />
  );
};
