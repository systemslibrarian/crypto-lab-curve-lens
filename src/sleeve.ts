/**
 * "Nothing up my sleeve": where a curve's seed came from.
 *
 * Both brainpoolP256r1 and P-256 are *pseudo-random* curves — neither coefficient was
 * picked by hand. Each was generated from a 160-bit seed by a published algorithm, and in
 * both cases anyone can re-run that algorithm and confirm the curve really does fall out of
 * the seed. That part is equally verifiable for both, and it is worth being clear about,
 * because "NIST curves are unverifiable" is a common overstatement.
 *
 * The difference is one level up. Where did the SEED come from?
 *
 *   - P-256's seed is published (FIPS 186-4 D.1.2.3 / SEC 2 v2.0 §2.4.2) and the curve
 *     verifiably derives from it, but no derivation of the seed itself has ever been
 *     published. It is 160 bits that simply appear, and the reader is asked to accept that
 *     whoever chose them was not searching for a curve with a property only they knew about.
 *   - brainpool's seeds are not free choices at all. RFC 5639 Appendix A.1 takes the seven
 *     prime seeds from the binary expansion of pi, and Appendix A.2 takes the seven curve
 *     seeds from the expansion of e. There is nowhere to hide a search in a constant you
 *     cannot alter.
 *
 * This module computes pi and e to 1120 bits from their own definitions — Machin's formula
 * and the exponential series, in exact integer arithmetic — and slices out the seeds. It
 * imports no constant table: if the digits of pi did not actually produce RFC 5639's
 * published Seed_p_256, the check below would fail. That is the whole exhibit. Asserting
 * "the seeds come from pi" in a sentence would teach nothing a reader could check.
 *
 * Scope: this shows the seeds are unmanipulable. It is NOT a claim that P-256 is backdoored,
 * and no such claim is made or supported here.
 */

/**
 * Working precision. The seeds need the first 1120 bits; the extra 80 guard bits absorb the
 * truncation each series term contributes, so the 1120 bits handed back are exact.
 */
const SCALE = 1200n;
const ONE = 1n << SCALE;
/** RFC 5639 Appendix A slices seven 160-bit seeds out of each constant. */
const SEED_BITS = 160n;
const SEED_COUNT = 7;
const SEED_HEX_CHARS = Number(SEED_BITS / 4n);

/** The curve sizes RFC 5639 defines, in the order its seed lists are given. */
export const BRAINPOOL_SEED_SIZES = [160, 192, 224, 256, 320, 384, 512] as const;

/**
 * arctan(1/x), scaled by 2^SCALE, by the Gregory series in integer arithmetic:
 * arctan(1/x) = 1/x - 1/(3x^3) + 1/(5x^5) - …
 */
function arctanInverse(x: bigint): bigint {
  const xSquared = x * x;
  let power = ONE / x;
  let sum = 0n;
  let n = 0n;

  while (power !== 0n) {
    const term = power / (2n * n + 1n);
    sum += n % 2n === 0n ? term : -term;
    power /= xSquared;
    n += 1n;
  }

  return sum;
}

/** pi · 2^SCALE, via Machin's formula: pi = 16·arctan(1/5) − 4·arctan(1/239). */
function scaledPi(): bigint {
  return 16n * arctanInverse(5n) - 4n * arctanInverse(239n);
}

/** e · 2^SCALE, via the exponential series e = sum 1/k!. */
function scaledE(): bigint {
  let sum = 0n;
  let term = ONE;
  let k = 1n;

  while (term !== 0n) {
    sum += term;
    term /= k;
    k += 1n;
  }

  return sum;
}

/**
 * Slice the leading 7 × 160 bits out of `floor(constant · 2^1120)`.
 *
 * RFC 5639 A.1: "These seeds have been obtained as the first 7 substrings of 160-bit length
 * each of Q = Pi*2^1120". A.2 says the same of R = floor(e*2^1120). The leading digit of
 * each constant (3 for pi, 2 for e) is part of the first seed, which is why these read as
 * the hex expansion with the radix point removed.
 */
function seedsFrom(scaled: bigint): string[] {
  const shifted = scaled >> (SCALE - 1120n);
  const hex = shifted.toString(16).toUpperCase();
  const seeds: string[] = [];

  for (let index = 0; index < SEED_COUNT; index += 1) {
    seeds.push(hex.slice(index * SEED_HEX_CHARS, (index + 1) * SEED_HEX_CHARS));
  }

  return seeds;
}

/** The seven Seed_p values RFC 5639 Appendix A.1 derives from pi, recomputed from pi. */
export function derivePrimeSeeds(): string[] {
  return seedsFrom(scaledPi());
}

/** The seven Seed_ab values RFC 5639 Appendix A.2 derives from e, recomputed from e. */
export function deriveCurveSeeds(): string[] {
  return seedsFrom(scaledE());
}

/** Index of the 256-bit curve within RFC 5639's seed lists. */
const INDEX_256 = BRAINPOOL_SEED_SIZES.indexOf(256);

export interface SeedProvenance {
  /** What the constant's own expansion yields, computed here from pi / e. */
  derived: string;
  /** What RFC 5639 Appendix A publishes for brainpoolP256r1. */
  published: string;
  matches: boolean;
}

/**
 * RFC 5639 Appendix A.1, Seed_p_256 — the seed the prime p was generated from.
 * Pinned so the derivation has something to be checked against; it is never the source of
 * the value shown as "derived".
 */
const PUBLISHED_SEED_P_256 = '5B54709179216D5D98979FB1BD1310BA698DFB5A';
/** RFC 5639 Appendix A.2, Seed_ab_256 — the seed A, B and G were generated from. */
const PUBLISHED_SEED_AB_256 = '757F5958490CFD47D7C19BB42158D9554F7B46BC';

/**
 * NIST P-256's seed, as published in FIPS 186-4 D.1.2.3 and SEC 2 v2.0 §2.4.2.
 *
 * Confirmed rather than copied: under the ANSI X9.62 / FIPS 186-4 D.3.3 generation rule,
 * SHA-1 of this seed yields the c for which P-256's own b satisfies b^2·c = -27 (mod p).
 * `sleeve.test.ts` runs that derivation, and a single flipped bit in the seed fails it — so
 * the value below is pinned by arithmetic, not by recollection.
 */
export const NIST_P256_SEED = 'C49D360886E704936A6678E1139D26B7819F7E90';

/** brainpoolP256r1's prime seed, recomputed from pi and compared with the RFC. */
export function primeSeedProvenance(): SeedProvenance {
  const derived = derivePrimeSeeds()[INDEX_256];
  return { derived, published: PUBLISHED_SEED_P_256, matches: derived === PUBLISHED_SEED_P_256 };
}

/** brainpoolP256r1's curve-coefficient seed, recomputed from e and compared with the RFC. */
export function curveSeedProvenance(): SeedProvenance {
  const derived = deriveCurveSeeds()[INDEX_256];
  return { derived, published: PUBLISHED_SEED_AB_256, matches: derived === PUBLISHED_SEED_AB_256 };
}
