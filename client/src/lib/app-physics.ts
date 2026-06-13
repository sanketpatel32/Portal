import type { RefObject } from "react";

export type BallPairLayout = {
  xCenter: number;
  yStart: number;
  R: number;
  L: number;
};

export type BallPairPositions = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dist: number;
};

export function getBallPairPositions(
  layout: BallPairLayout,
  theta: number[],
  pairIndex: number
): BallPairPositions {
  const { xCenter, yStart, R, L } = layout;
  const xAnchor1 = xCenter + (pairIndex - 1) * 2 * R;
  const xAnchor2 = xCenter + pairIndex * 2 * R;

  const x1 = xAnchor1 + L * Math.sin(theta[pairIndex]);
  const y1 = yStart + L * Math.cos(theta[pairIndex]);
  const x2 = xAnchor2 + L * Math.sin(theta[pairIndex + 1]);
  const y2 = yStart + L * Math.cos(theta[pairIndex + 1]);

  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  return { x1, y1, x2, y2, dist };
}

function getCanvasPointer(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): { mx: number; my: number; w: number; h: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    w: rect.width,
    h: rect.height,
    mx: clientX - rect.left,
    my: clientY - rect.top,
  };
}

export function canvasPointerFromRef(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  clientX: number,
  clientY: number
): ({ canvas: HTMLCanvasElement } & ReturnType<typeof getCanvasPointer>) | null {
  const canvas = canvasRef.current;
  if (!canvas) return null;
  return { canvas, ...getCanvasPointer(canvas, clientX, clientY) };
}
