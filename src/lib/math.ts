// lib/math.ts

/**
 * Clamp a number between a min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Round a number to the nearest multiple of a step.
 */
export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Snap a number up to the nearest step multiple.
 */
export function snapUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * Snap a number down to the nearest step multiple.
 */
export function snapDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/**
 * Get the sign of a number (returns -1, 0, or 1).
 */
export function sign(n: number): number {
  return n === 0 ? 0 : n > 0 ? 1 : -1;
}

/**
 * Smoothstep interpolation (slower but smoother than lerp).
 * Good for easing animations or transitions.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Calculate aspect ratio width given height and ratio.
 */
export function calcWidthFromHeight(height: number, aspectRatio: number): number {
  return height * aspectRatio;
}

/**
 * Calculate aspect ratio height given width and ratio.
 */
export function calcHeightFromWidth(width: number, aspectRatio: number): number {
  return width / aspectRatio;
}

export type Vec2 = { x: number; y: number };

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec(v: Vec2, scalar: number): Vec2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function distanceVec(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t)
  };
}


export function getAspectRatio(width: number, height: number): number {
  return width / height;
}

export function scaleToAspectRatio(
  width: number,
  height: number,
  targetAspect: number
): { width: number; height: number } {
  const currentAspect = width / height;

  if (currentAspect > targetAspect) {
    // Too wide — shrink width
    return { width: height * targetAspect, height };
  } else {
    // Too tall — shrink height
    return { width, height: width / targetAspect };
  }
}

export function clampToStepRange(
  value: number,
  step: number,
  min: number,
  max: number
): number {
  return clamp(roundToStep(value, step), min, max);
}
