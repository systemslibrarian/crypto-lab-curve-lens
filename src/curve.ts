export type CurveKind = 'weierstrass' | 'montgomery';

export interface FinitePoint {
  x: number;
  y: number;
}

export type Point = FinitePoint | null;

export interface SmallCurveConfig {
  name: string;
  kind: CurveKind;
  p: number;
  a: number;
  b: number;
  generator: FinitePoint | null;
  subtitle: string;
}

export interface ScalarStep {
  type: 'double' | 'add';
  bit: string;
  accumulatorBefore: Point;
  operand: Point;
  accumulatorAfter: Point;
  description: string;
}

export const SMALL_FIELD_CURVE: SmallCurveConfig = {
  name: 'Small Field Explorer',
  kind: 'weierstrass',
  p: 17,
  a: 2,
  b: 2,
  generator: { x: 5, y: 1 },
  subtitle: 'y^2 = x^3 + 2x + 2 mod 17',
};

export const COMPARISON_ANALOGS: Record<string, SmallCurveConfig> = {
  p256: {
    name: 'P-256 Analog',
    kind: 'weierstrass',
    p: 17,
    a: 14,
    b: 3,
    generator: null,
    subtitle: 'Small-field analog of a short Weierstrass curve',
  },
  curve25519: {
    name: 'Curve25519 Analog',
    kind: 'montgomery',
    p: 19,
    a: 15,
    b: 1,
    generator: null,
    subtitle: 'Small-field analog of a Montgomery curve',
  },
  secp256k1: {
    name: 'secp256k1 Analog',
    kind: 'weierstrass',
    p: 19,
    a: 0,
    b: 7,
    generator: null,
    subtitle: 'Small-field analog of koblitz-style y^2 = x^3 + 7',
  },
};

export function mod(value: number, prime: number): number {
  const remainder = value % prime;
  return remainder >= 0 ? remainder : remainder + prime;
}

function rhs(curve: SmallCurveConfig, x: number): number {
  if (curve.kind === 'montgomery') {
    return mod(x * x * x + curve.a * x * x + x, curve.p);
  }

  return mod(x * x * x + curve.a * x + curve.b, curve.p);
}

function lhs(curve: SmallCurveConfig, y: number): number {
  if (curve.kind === 'montgomery') {
    return mod(curve.b * y * y, curve.p);
  }

  return mod(y * y, curve.p);
}

export function isOnCurve(curve: SmallCurveConfig, point: Point): boolean {
  if (point === null) {
    return true;
  }

  return lhs(curve, point.y) === rhs(curve, point.x);
}

export function invert(value: number, prime: number): number {
  let t = 0;
  let newT = 1;
  let r = prime;
  let newR = mod(value, prime);

  while (newR !== 0) {
    const quotient = Math.floor(r / newR);
    [t, newT] = [newT, t - quotient * newT];
    [r, newR] = [newR, r - quotient * newR];
  }

  if (r !== 1) {
    throw new Error('Value is not invertible in this field.');
  }

  return mod(t, prime);
}

export function negatePoint(curve: SmallCurveConfig, point: Point): Point {
  if (point === null) {
    return null;
  }

  return { x: point.x, y: mod(-point.y, curve.p) };
}

export function pointsEqual(left: Point, right: Point): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.x === right.x && left.y === right.y;
}

export function addPoints(curve: SmallCurveConfig, left: Point, right: Point): Point {
  if (curve.kind !== 'weierstrass') {
    throw new Error('Point addition explorer is implemented for the small Weierstrass demo curve.');
  }

  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  if (left.x === right.x && mod(left.y + right.y, curve.p) === 0) {
    return null;
  }

  let slope: number;

  if (left.x === right.x && left.y === right.y) {
    if (left.y === 0) {
      return null;
    }

    slope = mod((3 * left.x * left.x + curve.a) * invert(2 * left.y, curve.p), curve.p);
  } else {
    slope = mod((right.y - left.y) * invert(right.x - left.x, curve.p), curve.p);
  }

  const x = mod(slope * slope - left.x - right.x, curve.p);
  const y = mod(slope * (left.x - x) - left.y, curve.p);
  return { x, y };
}

export function scalarMultiply(curve: SmallCurveConfig, scalar: number, point: Point): Point {
  if (curve.kind !== 'weierstrass') {
    throw new Error('Scalar multiplication explorer is implemented for the small Weierstrass demo curve.');
  }

  let result: Point = null;
  let addend = point;
  let remaining = scalar;

  while (remaining > 0) {
    if (remaining & 1) {
      result = addPoints(curve, result, addend);
    }

    addend = addPoints(curve, addend, addend);
    remaining >>= 1;
  }

  return result;
}

export function explainScalarMultiply(curve: SmallCurveConfig, scalar: number, point: Point): ScalarStep[] {
  if (curve.kind !== 'weierstrass') {
    throw new Error('Scalar multiplication explorer is implemented for the small Weierstrass demo curve.');
  }

  if (scalar < 1) {
    return [];
  }

  const bits = scalar.toString(2);
  let accumulator: Point = null;
  const steps: ScalarStep[] = [];

  for (const bit of bits) {
    const beforeDouble = accumulator;
    accumulator = addPoints(curve, accumulator, accumulator);
    steps.push({
      type: 'double',
      bit,
      accumulatorBefore: beforeDouble,
      operand: beforeDouble,
      accumulatorAfter: accumulator,
      description: `Double the accumulator for bit ${bit}.`,
    });

    if (bit === '1') {
      const beforeAdd = accumulator;
      accumulator = addPoints(curve, accumulator, point);
      steps.push({
        type: 'add',
        bit,
        accumulatorBefore: beforeAdd,
        operand: point,
        accumulatorAfter: accumulator,
        description: 'Add the generator because this bit is 1.',
      });
    }
  }

  return steps;
}

export function enumeratePoints(curve: SmallCurveConfig): FinitePoint[] {
  const points: FinitePoint[] = [];

  for (let x = 0; x < curve.p; x += 1) {
    for (let y = 0; y < curve.p; y += 1) {
      const point = { x, y };
      if (isOnCurve(curve, point)) {
        points.push(point);
      }
    }
  }

  return points;
}

export function groupOrder(curve: SmallCurveConfig): number {
  return enumeratePoints(curve).length + 1;
}

export function pointOrder(curve: SmallCurveConfig, point: Point): number {
  if (curve.kind !== 'weierstrass') {
    throw new Error('Point order is used for the small Weierstrass demo curve.');
  }

  if (point === null) {
    return 1;
  }

  let current: Point = point;
  let order = 1;

  while (current !== null) {
    current = addPoints(curve, current, point);
    order += 1;

    if (order > curve.p * curve.p + 2) {
      throw new Error('Point order search exceeded the Hasse bound.');
    }
  }

  return order;
}

export function formatPoint(point: Point): string {
  if (point === null) {
    return 'O';
  }

  return `(${point.x}, ${point.y})`;
}
