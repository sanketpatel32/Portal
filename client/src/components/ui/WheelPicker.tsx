import React, { useEffect, useRef, useState } from "react";

interface WheelPickerProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const ITEM_HEIGHT = 90; // height of each item in px
const VISIBLE_ITEMS = 5; // number of visible items (must be odd)
const RADIUS = 175; // cylinder radius for 3D layout

export const WheelPicker: React.FC<WheelPickerProps> = ({
  min,
  max,
  value,
  onChange,
  label,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(value * ITEM_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);

  const dragInfo = useRef({
    startY: 0,
    startScrollY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  });

  const animFrame = useRef<number | null>(null);

  const prevValueRef = useRef(value);
  // Keep scrollY in sync with value prop if it changes programmatically
  useEffect(() => {
    if (value !== prevValueRef.current) {
      setScrollY(value * ITEM_HEIGHT);
      prevValueRef.current = value;
    }
  }, [value]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrame.current !== null) {
        cancelAnimationFrame(animFrame.current);
      }
    };
  }, []);

  // Generate range of integers
  const items: number[] = [];
  for (let i = min; i <= max; i++) {
    items.push(i);
  }

  const handleStart = (clientY: number) => {
    setIsDragging(true);
    dragInfo.current.startY = clientY;
    dragInfo.current.startScrollY = scrollY;
    dragInfo.current.lastY = clientY;
    dragInfo.current.lastTime = performance.now();
    dragInfo.current.velocity = 0;

    if (animFrame.current !== null) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }
  };

  const handleMove = (clientY: number) => {
    if (!isDragging) return;

    const now = performance.now();
    const dt = now - dragInfo.current.lastTime;
    const dy = clientY - dragInfo.current.lastY;

    // Calculate instantaneous velocity (px / ms)
    if (dt > 0) {
      dragInfo.current.velocity = -dy / dt;
    }

    dragInfo.current.lastY = clientY;
    dragInfo.current.lastTime = now;

    const totalDeltaY = clientY - dragInfo.current.startY;
    let newScrollY = dragInfo.current.startScrollY - totalDeltaY;

    // Bounds constraint with rubber banding
    const minScroll = min * ITEM_HEIGHT;
    const maxScroll = max * ITEM_HEIGHT;

    if (newScrollY < minScroll) {
      newScrollY = minScroll + (newScrollY - minScroll) * 0.4;
    } else if (newScrollY > maxScroll) {
      newScrollY = maxScroll + (newScrollY - maxScroll) * 0.4;
    }

    setScrollY(newScrollY);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Start inertial animation
    let velocity = dragInfo.current.velocity;
    let currentScrollY = scrollY;
    const minScroll = min * ITEM_HEIGHT;
    const maxScroll = max * ITEM_HEIGHT;
    const friction = 0.95;

    const animate = () => {
      // If within bounds, apply inertial scrolling
      if (currentScrollY >= minScroll && currentScrollY <= maxScroll) {
        currentScrollY += velocity * 16.67; // approx 1 frame (16.7ms)
        velocity *= friction;
      } else {
        // Pull back if out of bounds
        const target = currentScrollY < minScroll ? minScroll : maxScroll;
        currentScrollY += (target - currentScrollY) * 0.2;
        velocity = 0;
      }

      // Snapping once slow enough
      if (Math.abs(velocity) < 0.15) {
        const targetSnapped = Math.round(currentScrollY / ITEM_HEIGHT) * ITEM_HEIGHT;
        const clampedTarget = Math.max(minScroll, Math.min(maxScroll, targetSnapped));
        
        currentScrollY += (clampedTarget - currentScrollY) * 0.2;

        if (Math.abs(clampedTarget - currentScrollY) < 0.5) {
          currentScrollY = clampedTarget;
          setScrollY(currentScrollY);
          const finalValue = Math.round(currentScrollY / ITEM_HEIGHT);
          prevValueRef.current = finalValue; // sync ref immediately to prevent race
          onChange(finalValue);
          animFrame.current = null;
          return; // stop animation
        }
      }

      setScrollY(currentScrollY);
      animFrame.current = requestAnimationFrame(animate);
    };

    animFrame.current = requestAnimationFrame(animate);
  };

  // Support Mouse Wheel scroll
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (animFrame.current !== null) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }

    const minScroll = min * ITEM_HEIGHT;
    const maxScroll = max * ITEM_HEIGHT;
    const delta = e.deltaY;
    
    let targetScroll = scrollY + (delta > 0 ? ITEM_HEIGHT : -ITEM_HEIGHT);
    targetScroll = Math.max(minScroll, Math.min(maxScroll, targetScroll));
    
    // Smooth scroll transition
    let currentScroll = scrollY;
    const animateSnap = () => {
      currentScroll += (targetScroll - currentScroll) * 0.25;
      if (Math.abs(targetScroll - currentScroll) < 0.5) {
        currentScroll = targetScroll;
        setScrollY(currentScroll);
        const finalValue = Math.round(currentScroll / ITEM_HEIGHT);
        prevValueRef.current = finalValue; // sync ref immediately to prevent race
        onChange(finalValue);
        animFrame.current = null;
        return;
      }
      setScrollY(currentScroll);
      animFrame.current = requestAnimationFrame(animateSnap);
    };

    animFrame.current = requestAnimationFrame(animateSnap);
  };

  const centerIndex = scrollY / ITEM_HEIGHT;

  return (
    <div className="flex flex-col items-center select-none">
      {/* 3D Drum cylinder viewport */}
      <div
        ref={containerRef}
        className="relative w-36 h-[450px] overflow-hidden cursor-grab active:cursor-grabbing animate-scale-up"
        style={{
          perspective: "1000px",
          touchAction: "none",
        }}
        onMouseDown={(e) => handleStart(e.clientY)}
        onMouseMove={(e) => handleMove(e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            handleStart(e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length > 0) {
            handleMove(e.touches[0].clientY);
          }
        }}
        onTouchEnd={handleEnd}
        onWheel={handleWheel}
      >
        {/* Invisible target highlight indicator */}
        <div 
          className="absolute left-0 right-0 border-y border-white/10 pointer-events-none"
          style={{
            top: `${(VISIBLE_ITEMS - 1) / 2 * ITEM_HEIGHT}px`,
            height: `${ITEM_HEIGHT}px`,
          }}
        />

        {/* Cylinder list */}
        <div
          className="absolute w-full h-full"
          style={{
            transformStyle: "preserve-3d",
          }}
        >
          {items.map((item) => {
            const indexDiff = item - centerIndex;
            // Hide items too far away to optimize render/layout
            if (Math.abs(indexDiff) > VISIBLE_ITEMS / 2 + 1) return null;

            // Compute 3D cylinder transform
            const angle = indexDiff * 24; // 24 degrees separation
            const opacity = Math.max(0, 1 - Math.abs(indexDiff) * 0.35);
            const scale = Math.max(0.65, 1 - Math.abs(indexDiff) * 0.12);

            return (
              <div
                key={item}
                className="absolute left-0 w-full flex items-center justify-center font-mono text-6xl font-thin tracking-widest text-white"
                style={{
                  height: `${ITEM_HEIGHT}px`,
                  top: `${(VISIBLE_ITEMS - 1) / 2 * ITEM_HEIGHT}px`,
                  transform: `rotateX(${-angle}deg) translateZ(${RADIUS}px) scale(${scale})`,
                  opacity: opacity,
                  transformOrigin: "center center",
                  backfaceVisibility: "hidden",
                }}
              >
                {item.toString().padStart(2, "0")}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Label under dial */}
      {label && (
        <span className="text-[10px] font-mono tracking-[0.25em] text-zinc-500 uppercase mt-8 select-none">
          {label}
        </span>
      )}
    </div>
  );
};
