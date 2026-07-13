import { describe, expect, it } from 'vitest';
import { REAL_PLANE_CURVE, addRealPoints, rhs, upperY } from './realplane';

/**
 * The real-plane sub-panel is teaching geometry, not cryptography, but its
 * chord-and-tangent arithmetic must still be correct: the sum it draws has to be
 * a real point on the curve, and the reflection relationship must hold. These
 * tests pin that so the intuition picture never drifts from the actual group law.
 */
describe('real-plane group law (over ℝ)', () => {
  const onCurve = (x: number, y: number): boolean =>
    Math.abs(y * y - rhs(REAL_PLANE_CURVE, x)) < 1e-6;

  it('places the sum P+Q back on the curve', () => {
    const px = -1;
    const qx = 2;
    const py = upperY(REAL_PLANE_CURVE, px);
    const qy = upperY(REAL_PLANE_CURVE, qx);
    expect(py).not.toBeNull();
    expect(qy).not.toBeNull();
    const p = { x: px, y: py as number };
    const q = { x: qx, y: qy as number };
    const { sum, third } = addRealPoints(REAL_PLANE_CURVE, p, q);

    expect(onCurve(sum.x, sum.y)).toBe(true);
    expect(onCurve(third.x, third.y)).toBe(true);
    // The sum is the third intersection reflected across the x-axis.
    expect(sum.x).toBeCloseTo(third.x, 9);
    expect(sum.y).toBeCloseTo(-third.y, 9);
  });

  it('reports the curve as undefined where the radicand is negative', () => {
    // rhs(-2.5) = (-2.5)^3 - 3(-2.5) + 5 < 0, so no real y exists there.
    expect(upperY(REAL_PLANE_CURVE, -2.5)).toBeNull();
  });

  it('doubles a point (tangent line) back onto the curve', () => {
    const px = 1.5;
    const py = upperY(REAL_PLANE_CURVE, px);
    expect(py).not.toBeNull();
    const p = { x: px, y: py as number };
    const { sum } = addRealPoints(REAL_PLANE_CURVE, p, p);
    expect(onCurve(sum.x, sum.y)).toBe(true);
  });
});
