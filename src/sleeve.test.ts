import { describe, expect, it } from 'vitest';
import {
  BRAINPOOL_SEED_SIZES,
  NIST_P256_SEED,
  curveSeedProvenance,
  deriveCurveSeeds,
  derivePrimeSeeds,
  primeSeedProvenance,
} from './sleeve';

/**
 * RFC 5639 Appendix A.1 — the seven Seed_p values, published as constants in the RFC and
 * derived here from π alone. Pinned in full because the claim on the page is not "the 256-bit
 * seed comes from π" but "these seeds are the expansion of π", and one matching slice out of
 * seven would be a coincidence worth suspecting.
 */
const RFC5639_A1_PRIME_SEEDS = [
  '3243F6A8885A308D313198A2E03707344A409382',
  '2299F31D0082EFA98EC4E6C89452821E638D0137',
  '7BE5466CF34E90C6CC0AC29B7C97C50DD3F84D5B',
  '5B54709179216D5D98979FB1BD1310BA698DFB5A',
  'C2FFD72DBD01ADFB7B8E1AFED6A267E96BA7C904',
  '5F12C7F9924A19947B3916CF70801F2E2858EFC1',
  '6636920D871574E69A458FEA3F4933D7E0D95748',
];

/** RFC 5639 Appendix A.2 — the seven Seed_ab values, derived here from e alone. */
const RFC5639_A2_CURVE_SEEDS = [
  '2B7E151628AED2A6ABF7158809CF4F3C762E7160',
  'F38B4DA56A784D9045190CFEF324E7738926CFBE',
  '5F4BF8D8D8C31D763DA06C80ABB1185EB4F7C7B5',
  '757F5958490CFD47D7C19BB42158D9554F7B46BC',
  'ED55C4D79FD5F24D6613C31C3839A2DDF8A9A276',
  'BCFBFA1C877C56284DAB79CD4C2B3293D20E9E5E',
  'AF02AC60ACC93ED874422A52ECB238FEEE5AB6AD',
];

describe('brainpool seed derivation', () => {
  it('reproduces every RFC 5639 Appendix A.1 prime seed from π', () => {
    expect(derivePrimeSeeds()).toEqual(RFC5639_A1_PRIME_SEEDS);
  });

  it('reproduces every RFC 5639 Appendix A.2 curve seed from e', () => {
    expect(deriveCurveSeeds()).toEqual(RFC5639_A2_CURVE_SEEDS);
  });

  it('derives one 160-bit seed per curve size the RFC defines', () => {
    for (const seeds of [derivePrimeSeeds(), deriveCurveSeeds()]) {
      expect(seeds).toHaveLength(BRAINPOOL_SEED_SIZES.length);
      for (const seed of seeds) {
        expect(seed, 'a seed is 160 bits of uppercase hex').toMatch(/^[0-9A-F]{40}$/u);
      }
    }
  });

  it('reports the brainpoolP256r1 seeds as matching their published values', () => {
    const prime = primeSeedProvenance();
    const curve = curveSeedProvenance();
    expect(prime.matches).toBe(true);
    expect(curve.matches).toBe(true);
    // The derived value is what the page prints; it must be the computation, not the pin.
    expect(prime.derived).toBe(RFC5639_A1_PRIME_SEEDS[BRAINPOOL_SEED_SIZES.indexOf(256)]);
    expect(curve.derived).toBe(RFC5639_A2_CURVE_SEEDS[BRAINPOOL_SEED_SIZES.indexOf(256)]);
    // π and e are different constants; a bug collapsing both to one source would show here.
    expect(prime.derived).not.toBe(curve.derived);
  });
});

/**
 * The page claims two things about NIST P-256's seed: that P-256 verifiably derives from it,
 * and that the seed itself has no published derivation. The first is checkable, and checking
 * it is what lets the note state the second fairly rather than insinuating.
 *
 * ANSI X9.62 / FIPS 186-4 D.3.3: from seed S, compute c from SHA-1(S); the curve is accepted
 * when its own b satisfies b²·c ≡ −27 (mod p).
 */
describe('NIST P-256 seed', () => {
  const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
  const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

  async function seedToC(seedHex: string): Promise<bigint> {
    const seed = Uint8Array.from(seedHex.match(/../gu)!.map((byte) => parseInt(byte, 16)));
    const t = 256;
    const s = Math.floor((t - 1) / 160);
    const v = t - 160 * s;

    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', seed));
    // c0 = the rightmost v bits of SHA-1(S), with the leftmost bit cleared.
    const head = digest.slice(digest.length - v / 8);
    head[0] &= 0x7f;

    let bits = Array.from(head, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const seedInt = BigInt(`0x${seedHex}`);
    for (let index = 1; index <= s; index += 1) {
      const next = (seedInt + BigInt(index)) % (1n << BigInt(seed.length * 8));
      const nextBytes = Uint8Array.from(
        next
          .toString(16)
          .padStart(seed.length * 2, '0')
          .match(/../gu)!
          .map((byte) => parseInt(byte, 16)),
      );
      const nextDigest = new Uint8Array(await crypto.subtle.digest('SHA-1', nextBytes));
      bits += Array.from(nextDigest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    return BigInt(`0x${bits}`);
  }

  const verifies = async (seedHex: string): Promise<boolean> =>
    (((B * B) % P) * ((await seedToC(seedHex)) % P)) % P === (P - 27n) % P;

  it('is the seed P-256 was generated from', async () => {
    expect(await verifies(NIST_P256_SEED)).toBe(true);
  });

  it('fails the same derivation if a single bit of the seed changes', async () => {
    const flipped = NIST_P256_SEED.slice(0, -1) + (NIST_P256_SEED.endsWith('0') ? '1' : '0');
    expect(flipped).not.toBe(NIST_P256_SEED);
    expect(await verifies(flipped)).toBe(false);
  });
});
