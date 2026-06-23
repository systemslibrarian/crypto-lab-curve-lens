import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  defaultScalarForCurve,
  generateEcdhDemo,
  hexToBytes,
  multiplyGenerator,
  normalizeScalarLabel,
  runVerificationSuite,
  type RealCurveId,
} from './realcurve';

const CURVES: RealCurveId[] = ['p256', 'curve25519', 'secp256k1'];

describe('hex helpers', () => {
  it('round-trips bytes through hex', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('accepts a 0x prefix', () => {
    expect(Array.from(hexToBytes('0xff00'))).toEqual([255, 0]);
  });

  it('rejects odd-length and non-hex input', () => {
    expect(() => hexToBytes('abc')).toThrow();
    expect(() => hexToBytes('zz')).toThrow();
  });
});

describe('verification suite', () => {
  it('passes every published-vector check', () => {
    for (const result of runVerificationSuite()) {
      expect(result.passed).toBe(true);
    }
  });
});

describe('multiplyGenerator', () => {
  it('returns the base point for scalar 1 on P-256', () => {
    const result = multiplyGenerator('p256', '1');
    expect(result.resultHex).toBe(
      '04' +
        '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
        '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5',
    );
  });

  it('rejects scalars outside [1, n-1]', () => {
    expect(() => multiplyGenerator('p256', '0')).toThrow();
    expect(() => multiplyGenerator('secp256k1', '0')).toThrow();
  });

  it('reproduces the RFC 7748 X25519 public key', () => {
    const result = multiplyGenerator(
      'curve25519',
      '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
    );
    expect(result.resultHex).toBe(
      '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
    );
  });

  it('requires a 32-byte scalar for Curve25519', () => {
    expect(() => multiplyGenerator('curve25519', 'ff')).toThrow();
  });
});

describe('ECDH agreement', () => {
  it('derives a matching shared secret on every curve', () => {
    for (const id of CURVES) {
      const transcript = generateEcdhDemo(id);
      expect(transcript.aliceShared).toBe(transcript.bobShared);
      expect(transcript.aliceShared.length).toBeGreaterThan(0);
    }
  });

  it('produces fresh key material on each call', () => {
    const first = generateEcdhDemo('p256');
    const second = generateEcdhDemo('p256');
    expect(first.alicePrivate).not.toBe(second.alicePrivate);
  });
});

describe('scalar labels and defaults', () => {
  it('normalizes short-Weierstrass scalars to 0x-prefixed 32-byte hex', () => {
    const label = normalizeScalarLabel('p256', '2');
    expect(label).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('provides a valid default scalar for every curve', () => {
    for (const id of CURVES) {
      expect(() => multiplyGenerator(id, defaultScalarForCurve(id))).not.toThrow();
    }
  });
});
