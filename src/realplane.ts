/**
 * The group law over the REAL numbers (ℝ), not a finite field.
 *
 * Newcomers can only accept the finite-field "scatter of dots" once they have
 * internalised the smooth, continuous picture: draw the straight chord through
 * P and Q, read off the third intersection with the curve, then reflect it
 * across the x-axis to get P + Q. Everything here is ordinary floating-point
 * geometry on y² = x³ + ax + b over ℝ — it exists purely to teach intuition and
 * is never used for any cryptographic result. The exact, spec-accurate math
 * lives in curve.ts (finite field) and realcurve.ts (@noble/curves).
 */

export interface RealCurveParams {
  a: number;
  b: number;
}

/**
 * A gentle teaching curve y² = x³ - 3x + 5 over ℝ. It is nonsingular
 * (discriminant ≠ 0) and has a single connected component over the plotted
 * window, so a chord through two points reliably meets it a third time.
 */
export const REAL_PLANE_CURVE: RealCurveParams = { a: -3, b: 5 };

/** Right-hand side x³ + ax + b. */
export function rhs(curve: RealCurveParams, x: number): number {
  return x * x * x + curve.a * x + curve.b;
}

/** The upper branch y = +√(x³ + ax + b), or null where the curve is undefined. */
export function upperY(curve: RealCurveParams, x: number): number | null {
  const value = rhs(curve, x);
  return value < 0 ? null : Math.sqrt(value);
}

/**
 * Sample the curve as two polylines (upper and lower branch) across [xMin, xMax].
 * Segments where the radicand is negative are dropped, so callers get contiguous
 * runs of on-curve points suitable for an SVG <polyline>.
 */
export function sampleBranches(
  curve: RealCurveParams,
  xMin: number,
  xMax: number,
  steps = 400,
): { upper: Array<{ x: number; y: number }>; lower: Array<{ x: number; y: number }> } {
  const upper: Array<{ x: number; y: number }> = [];
  const lower: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    const y = upperY(curve, x);
    if (y === null) {
      continue;
    }
    upper.push({ x, y });
    lower.push({ x, y: -y });
  }
  return { upper, lower };
}

/**
 * Add two points P and Q on y² = x³ + ax + b over ℝ using the chord/tangent law.
 * Returns the sum together with the geometric intermediate the visualization
 * draws: the slope of the line and the third intersection −(P+Q) (the point the
 * chord actually hits before the reflection).
 */
export function addRealPoints(
  curve: RealCurveParams,
  p: { x: number; y: number },
  q: { x: number; y: number },
): {
  sum: { x: number; y: number };
  third: { x: number; y: number };
  slope: number;
} {
  const isDouble = p.x === q.x && p.y === q.y;
  const slope = isDouble ? (3 * p.x * p.x + curve.a) / (2 * p.y) : (q.y - p.y) / (q.x - p.x);

  const x3 = slope * slope - p.x - q.x;
  const yLine = slope * (x3 - p.x) + p.y; // y of the line at x3 = the third intersection
  return {
    third: { x: x3, y: yLine },
    sum: { x: x3, y: -yLine },
    slope,
  };
}
