import { describe, expect, it } from 'vitest';
import {
  COMPARISON_ANALOGS,
  SMALL_FIELD_CURVE,
  addPoints,
  chordSlope,
  enumeratePoints,
  explainScalarMultiply,
  groupOrder,
  invert,
  isOnCurve,
  mod,
  multiplesOfPoint,
  negatePoint,
  pointOrder,
  pointsEqual,
  scalarMultiply,
  solveDiscreteLog,
  type FinitePoint,
} from './curve';

const curve = SMALL_FIELD_CURVE;
const G = curve.generator as FinitePoint;

describe('finite-field helpers', () => {
  it('mod always returns a non-negative residue', () => {
    expect(mod(-1, 17)).toBe(16);
    expect(mod(18, 17)).toBe(1);
    expect(mod(0, 17)).toBe(0);
  });

  it('invert returns a true multiplicative inverse', () => {
    for (let value = 1; value < curve.p; value += 1) {
      expect(mod(value * invert(value, curve.p), curve.p)).toBe(1);
    }
  });

  it('invert throws when no inverse exists', () => {
    expect(() => invert(0, 17)).toThrow();
  });
});

describe('point membership', () => {
  it('places the generator on the curve', () => {
    expect(isOnCurve(curve, G)).toBe(true);
  });

  it('treats the point at infinity as on the curve', () => {
    expect(isOnCurve(curve, null)).toBe(true);
  });

  it('rejects an off-curve point', () => {
    expect(isOnCurve(curve, { x: 0, y: 1 })).toBe(false);
  });
});

describe('group law', () => {
  it('uses O as the additive identity', () => {
    expect(pointsEqual(addPoints(curve, null, G), G)).toBe(true);
    expect(pointsEqual(addPoints(curve, G, null), G)).toBe(true);
  });

  it('sends P + (-P) to O', () => {
    expect(addPoints(curve, G, negatePoint(curve, G))).toBeNull();
  });

  it('is commutative', () => {
    const points = enumeratePoints(curve);
    for (const p of points) {
      for (const q of points) {
        expect(pointsEqual(addPoints(curve, p, q), addPoints(curve, q, p))).toBe(true);
      }
    }
  });

  it('doubles the generator to the known point (6, 3)', () => {
    expect(addPoints(curve, G, G)).toEqual({ x: 6, y: 3 });
  });

  it('keeps every sum on the curve', () => {
    const points = enumeratePoints(curve);
    for (const p of points) {
      for (const q of points) {
        expect(isOnCurve(curve, addPoints(curve, p, q))).toBe(true);
      }
    }
  });
});

describe('chordSlope', () => {
  it('matches the tangent slope used by doubling', () => {
    // 2G = (6,3); the tangent slope at G should reproduce it.
    const slope = chordSlope(curve, G, G);
    expect(slope).not.toBeNull();
    const x = mod((slope as number) ** 2 - 2 * G.x, curve.p);
    expect(x).toBe(6);
  });

  it('is null for a vertical line (P = -P)', () => {
    expect(chordSlope(curve, G, negatePoint(curve, G))).toBeNull();
  });
});

describe('scalar multiplication', () => {
  it('agrees with repeated addition', () => {
    let expected = null as ReturnType<typeof addPoints>;
    for (let k = 1; k <= 10; k += 1) {
      expected = addPoints(curve, expected, G);
      expect(pointsEqual(scalarMultiply(curve, k, G), expected)).toBe(true);
    }
  });

  it('wraps to O at the generator order', () => {
    const order = pointOrder(curve, G);
    expect(scalarMultiply(curve, order, G)).toBeNull();
    expect(pointsEqual(scalarMultiply(curve, order + 1, G), G)).toBe(true);
  });

  it('produces a trace whose final accumulator equals the result', () => {
    const steps = explainScalarMultiply(curve, 13, G);
    const last = steps[steps.length - 1];
    expect(pointsEqual(last.accumulatorAfter, scalarMultiply(curve, 13, G))).toBe(true);
  });
});

describe('group structure', () => {
  it('counts the affine points plus the point at infinity', () => {
    expect(groupOrder(curve)).toBe(enumeratePoints(curve).length + 1);
  });

  it("the generator's order divides the group order (Lagrange)", () => {
    expect(groupOrder(curve) % pointOrder(curve, G)).toBe(0);
  });
});

describe('Montgomery analog curve', () => {
  const montgomery = COMPARISON_ANALOGS.curve25519;

  it('enumerates points satisfying the Montgomery equation b·y² = x³ + a·x² + x', () => {
    const points = enumeratePoints(montgomery);
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      const { p, a, b } = montgomery;
      const lhs = mod(b * point.y * point.y, p);
      const rhs = mod(point.x ** 3 + a * point.x ** 2 + point.x, p);
      expect(lhs).toBe(rhs);
    }
  });

  it('refuses Weierstrass-only operations on a Montgomery curve', () => {
    const point: FinitePoint = { x: 1, y: 1 };
    expect(() => addPoints(montgomery, point, point)).toThrow();
    expect(() => scalarMultiply(montgomery, 2, point)).toThrow();
    expect(chordSlope(montgomery, point, point)).toBeNull();
  });
});

describe('discrete logarithm', () => {
  it('recovers the secret scalar for every k in the subgroup', () => {
    const order = pointOrder(curve, G);
    for (let k = 1; k < order; k += 1) {
      const target = scalarMultiply(curve, k, G);
      const result = solveDiscreteLog(curve, G, target);
      expect(result.k).toBe(k);
      expect(result.steps).toBe(k);
      expect(result.walk).toHaveLength(k);
    }
  });

  it('walks multiples in order', () => {
    const target = scalarMultiply(curve, 5, G);
    const result = solveDiscreteLog(curve, G, target);
    expect(result.walk).toEqual(multiplesOfPoint(curve, G, 5));
  });
});
