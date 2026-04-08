import { p256 } from '@noble/curves/p256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { x25519 } from '@noble/curves/ed25519';

export type RealCurveId = 'p256' | 'curve25519' | 'secp256k1';

export interface RealCurveMeta {
  id: RealCurveId;
  label: string;
  equation: string;
  prime: string;
  subgroupOrder: string;
  cofactor: string;
  generator: string;
  safeCurves: string;
  useCases: string;
  recommendedStatus: string;
  shorStatus: string;
  standards: string;
}

export interface ScalarMultiplyResult {
  curve: RealCurveId;
  scalarHex: string;
  resultHex: string;
  stepCount: number;
  explanation: string;
}

export interface EcdhTranscript {
  curve: RealCurveId;
  alicePrivate: string;
  bobPrivate: string;
  alicePublic: string;
  bobPublic: string;
  aliceShared: string;
  bobShared: string;
}

export interface VerificationResult {
  passed: boolean;
  title: string;
  detail: string;
}

const P256_GENERATOR_UNCOMPRESSED =
  '04' +
  '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
  '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';

const SECP256K1_GENERATOR_UNCOMPRESSED =
  '04' +
  '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
  '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';

const RFC7748_ALICE_PRIVATE = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const RFC7748_ALICE_PUBLIC = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const RFC7748_BOB_PRIVATE = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const RFC7748_BOB_PUBLIC = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
const RFC7748_SHARED = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';

export const REAL_CURVES: Record<RealCurveId, RealCurveMeta> = {
  p256: {
    id: 'p256',
    label: 'P-256',
    equation: 'y^2 = x^3 - 3x + b mod p',
    prime: '0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff',
    subgroupOrder: '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
    cofactor: '1',
    generator:
      'Gx = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296, Gy = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5',
    safeCurves: 'SafeCurves: does not satisfy all SafeCurves criteria. Source: safecurves.cr.yp.to.',
    useCases: 'TLS certificates, WebAuthn, government and enterprise ECDSA/ECDH deployments',
    recommendedStatus: 'Acceptable where interoperability requires it',
    shorStatus: 'Broken by Shor on a fault-tolerant quantum computer',
    standards: 'FIPS 186-5, SP 800-186',
  },
  curve25519: {
    id: 'curve25519',
    label: 'Curve25519',
    equation: 'y^2 = x^3 + 486662x^2 + x mod (2^255 - 19)',
    prime: '2^255 - 19',
    subgroupOrder: '2^252 + 27742317777372353535851937790883648493',
    cofactor: '8',
    generator: 'X25519 base u-coordinate = 9',
    safeCurves: 'SafeCurves: passes SafeCurves. Source: safecurves.cr.yp.to.',
    useCases: 'X25519 key agreement in TLS, Signal, WireGuard, MLS, Noise-based protocols',
    recommendedStatus: 'Recommended for new key agreement protocols',
    shorStatus: 'Broken by Shor on a fault-tolerant quantum computer',
    standards: 'RFC 7748',
  },
  secp256k1: {
    id: 'secp256k1',
    label: 'secp256k1',
    equation: 'y^2 = x^3 + 7 mod p',
    prime: '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f',
    subgroupOrder: '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
    cofactor: '1',
    generator:
      'Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798, Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
    safeCurves: 'SafeCurves: does not satisfy all SafeCurves criteria. Source: safecurves.cr.yp.to.',
    useCases: 'Bitcoin, Ethereum, Schnorr and ECDSA signatures in cryptocurrency systems',
    recommendedStatus: 'Acceptable when the surrounding ecosystem requires it',
    shorStatus: 'Broken by Shor on a fault-tolerant quantum computer',
    standards: 'SEC 2 v2.0',
  },
};

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = stripHexPrefix(hex).trim().toLowerCase();

  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(clean)) {
    throw new Error('Hex input must contain an even number of hexadecimal characters.');
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }

  return bytes;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.reduce((accumulator, byte) => (accumulator << 8n) + BigInt(byte), 0n);
}

function bigIntToFixedBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = value;

  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

function decimalToBigInt(value: string): bigint {
  return BigInt(value.trim());
}

function normalizeScalarForShortWeierstrass(curveId: 'p256' | 'secp256k1', rawScalar: string): bigint {
  const curve = curveId === 'p256' ? p256 : secp256k1;
  const scalar = /^0x/i.test(rawScalar.trim()) ? BigInt(rawScalar.trim()) : decimalToBigInt(rawScalar);

  if (scalar <= 0n || scalar >= curve.CURVE.n) {
    throw new Error(`Scalar must be in [1, n-1] for ${REAL_CURVES[curveId].label}.`);
  }

  return scalar;
}

function normalizeScalarForCurve25519(rawScalar: string): Uint8Array {
  const clean = stripHexPrefix(rawScalar).trim();
  if (clean.length !== 64) {
    throw new Error('Curve25519 real mode expects a 32-byte scalar in hex.');
  }

  return hexToBytes(clean);
}

export function multiplyGenerator(curveId: RealCurveId, rawScalar: string): ScalarMultiplyResult {
  if (curveId === 'curve25519') {
    const scalarBytes = normalizeScalarForCurve25519(rawScalar);
    const publicKey = x25519.getPublicKey(scalarBytes);
    return {
      curve: curveId,
      scalarHex: bytesToHex(scalarBytes),
      resultHex: bytesToHex(publicKey),
      stepCount: 255,
      explanation: 'X25519 uses a 255-step Montgomery ladder over Curve25519.',
    };
  }

  const scalar = normalizeScalarForShortWeierstrass(curveId, rawScalar);
  const curve = curveId === 'p256' ? p256 : secp256k1;
  const point = curve.ProjectivePoint.BASE.multiply(scalar);
  return {
    curve: curveId,
    scalarHex: `0x${scalar.toString(16)}`,
    resultHex: point.toHex(false),
    stepCount: scalar.toString(2).length,
    explanation: `${REAL_CURVES[curveId].label} scalar multiplication is computed over its exact prime field using @noble/curves.`,
  };
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomScalarBytes(maxExclusive: bigint): Uint8Array {
  while (true) {
    const candidate = randomBytes(32);
    const value = bytesToBigInt(candidate);
    if (value > 0n && value < maxExclusive) {
      return candidate;
    }
  }
}

export function generateEcdhDemo(curveId: RealCurveId): EcdhTranscript {
  if (curveId === 'curve25519') {
    const alicePrivate = randomBytes(32);
    const bobPrivate = randomBytes(32);
    const alicePublic = x25519.getPublicKey(alicePrivate);
    const bobPublic = x25519.getPublicKey(bobPrivate);
    const aliceShared = x25519.getSharedSecret(alicePrivate, bobPublic);
    const bobShared = x25519.getSharedSecret(bobPrivate, alicePublic);

    return {
      curve: curveId,
      alicePrivate: bytesToHex(alicePrivate),
      bobPrivate: bytesToHex(bobPrivate),
      alicePublic: bytesToHex(alicePublic),
      bobPublic: bytesToHex(bobPublic),
      aliceShared: bytesToHex(aliceShared),
      bobShared: bytesToHex(bobShared),
    };
  }

  const curve = curveId === 'p256' ? p256 : secp256k1;
  const alicePrivate = randomScalarBytes(curve.CURVE.n);
  const bobPrivate = randomScalarBytes(curve.CURVE.n);
  const alicePublic = curve.getPublicKey(alicePrivate, false);
  const bobPublic = curve.getPublicKey(bobPrivate, false);
  const aliceScalar = bytesToBigInt(alicePrivate);
  const bobScalar = bytesToBigInt(bobPrivate);
  const aliceShared = curve.ProjectivePoint.fromHex(bobPublic).multiply(aliceScalar).toHex(false);
  const bobShared = curve.ProjectivePoint.fromHex(alicePublic).multiply(bobScalar).toHex(false);

  return {
    curve: curveId,
    alicePrivate: bytesToHex(alicePrivate),
    bobPrivate: bytesToHex(bobPrivate),
    alicePublic: bytesToHex(alicePublic),
    bobPublic: bytesToHex(bobPublic),
    aliceShared,
    bobShared,
  };
}

export function defaultScalarForCurve(curveId: RealCurveId): string {
  if (curveId === 'curve25519') {
    return RFC7748_ALICE_PRIVATE;
  }

  return curveId === 'p256' ? '2' : '7';
}

export function runVerificationSuite(): VerificationResult[] {
  const p256GeneratorMatches = p256.ProjectivePoint.BASE.toHex(false) === P256_GENERATOR_UNCOMPRESSED;
  const p256OrderMatches = p256.ProjectivePoint.BASE.multiply(p256.CURVE.n - 1n).add(p256.ProjectivePoint.BASE).equals(p256.ProjectivePoint.ZERO);
  const secpGeneratorMatches =
    secp256k1.ProjectivePoint.BASE.toHex(false) === SECP256K1_GENERATOR_UNCOMPRESSED;
  const secpOrderMatches =
    secp256k1.ProjectivePoint.BASE.multiply(secp256k1.CURVE.n - 1n).add(secp256k1.ProjectivePoint.BASE).equals(secp256k1.ProjectivePoint.ZERO);

  const alicePrivate = hexToBytes(RFC7748_ALICE_PRIVATE);
  const bobPrivate = hexToBytes(RFC7748_BOB_PRIVATE);
  const alicePublicMatches = bytesToHex(x25519.getPublicKey(alicePrivate)) === RFC7748_ALICE_PUBLIC;
  const bobPublicMatches = bytesToHex(x25519.getPublicKey(bobPrivate)) === RFC7748_BOB_PUBLIC;
  const aliceSharedMatches =
    bytesToHex(x25519.getSharedSecret(alicePrivate, hexToBytes(RFC7748_BOB_PUBLIC))) === RFC7748_SHARED;
  const bobSharedMatches =
    bytesToHex(x25519.getSharedSecret(bobPrivate, hexToBytes(RFC7748_ALICE_PUBLIC))) === RFC7748_SHARED;

  return [
    {
      passed: p256GeneratorMatches && p256OrderMatches,
      title: 'P-256 generator and order check',
      detail: 'Verified against the published FIPS 186-5 base point and subgroup order n.',
    },
    {
      passed: secpGeneratorMatches && secpOrderMatches,
      title: 'secp256k1 generator and order check',
      detail: 'Verified against SEC 2 v2.0 base point and subgroup order n.',
    },
    {
      passed: alicePublicMatches && bobPublicMatches && aliceSharedMatches && bobSharedMatches,
      title: 'Curve25519 RFC 7748 vector check',
      detail: 'Verified Alice and Bob public keys plus the shared secret from RFC 7748.',
    },
  ];
}

export function normalizeScalarLabel(curveId: RealCurveId, rawScalar: string): string {
  if (curveId === 'curve25519') {
    return bytesToHex(normalizeScalarForCurve25519(rawScalar));
  }

  const scalar = normalizeScalarForShortWeierstrass(curveId, rawScalar);
  return `0x${bytesToHex(bigIntToFixedBytes(scalar, 32))}`;
}
