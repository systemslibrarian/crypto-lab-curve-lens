import { describe, expect, it } from 'vitest';
import {
  BRAINPOOL_GENERATOR,
  BRAINPOOL_PARAMS,
  BRAINPOOL_RFC7027_CHECK,
  RFC7027_A1_BRAINPOOLP256R1,
  brainpoolP256r1,
} from './brainpool';

/**
 * The curve is assembled from constants typed into a source file, so these tests exist to
 * catch the failure mode that type-checking and "it runs" cannot: a curve that works
 * perfectly and is the wrong curve.
 */
describe('brainpoolP256r1 instantiation', () => {
  it('reproduces the RFC 7027 Appendix A.1 shared point', () => {
    const check = BRAINPOOL_RFC7027_CHECK;
    expect(check.computedX).toBe(RFC7027_A1_BRAINPOOLP256R1.x_Z.toLowerCase());
    expect(check.computedY).toBe(RFC7027_A1_BRAINPOOLP256R1.y_Z.toLowerCase());
    expect(check.bothDirectionsAgree, 'dA·qB and dB·qA reached different points').toBe(true);
    expect(check.passed).toBe(true);
  });

  it('is available to the registry once the vector passes', () => {
    expect(BRAINPOOL_RFC7027_CHECK.passed).toBe(true);
    expect(brainpoolP256r1).not.toBeNull();
  });

  it('exposes the RFC 5639 §3.4 parameters it was built from', () => {
    // n and p differ only after the first 18 hex digits; both are asserted in full so a
    // transposition inside the shared prefix cannot slip through.
    expect(BRAINPOOL_PARAMS.p).toBe(
      'a9fb57dba1eea9bc3e660a909d838d726e3bf623d52620282013481d1f6e5377',
    );
    expect(BRAINPOOL_PARAMS.n).toBe(
      'a9fb57dba1eea9bc3e660a909d838d718c397aa3b561a6f7901e0e82974856a7',
    );
    expect(BRAINPOOL_PARAMS.cofactor).toBe('1');
    expect(brainpoolP256r1?.Point.Fn.ORDER).toBe(BigInt(`0x${BRAINPOOL_PARAMS.n}`));
  });

  it('derives the RFC 7027 public keys from the RFC 7027 secret keys', () => {
    const v = RFC7027_A1_BRAINPOOLP256R1;
    const point = brainpoolP256r1!.Point.BASE.multiply(BigInt(`0x${v.dA}`)).toAffine();
    expect(point.x.toString(16).padStart(64, '0')).toBe(v.x_qA.toLowerCase());
    expect(point.y.toString(16).padStart(64, '0')).toBe(v.y_qA.toLowerCase());
  });

  it('uses the published base point', () => {
    const base = brainpoolP256r1!.Point.BASE.toAffine();
    expect(base.x.toString(16).padStart(64, '0')).toBe(BRAINPOOL_GENERATOR.x);
    expect(base.y.toString(16).padStart(64, '0')).toBe(BRAINPOOL_GENERATOR.y);
  });

  /**
   * Non-vacuity. Every assertion above would also pass if the check compared a value with
   * itself, so prove the parameters actually discriminate. Two negative controls:
   */
  it('rejects a curve whose coefficient differs from brainpoolP256r1 by a single bit', async () => {
    const { weierstrass } = await import('@noble/curves/abstract/weierstrass.js');

    // B with its lowest bit flipped. The published base point is then no longer on the
    // curve, so construction itself fails — the mistyped digit is caught before any scalar
    // multiplication gets the chance to produce a plausible-looking wrong answer.
    expect(() =>
      weierstrass({
        p: BigInt(`0x${BRAINPOOL_PARAMS.p}`),
        n: BigInt(`0x${BRAINPOOL_PARAMS.n}`),
        h: 1n,
        a: BigInt('0x7d5a0975fc2c3057eef67530417affe7fb8055c126dc5c6ce94a4b44f330b5d9'),
        b: BigInt('0x26dc5c6ce94a4b44f330b5d9bbd77cbf958416295cf7e1ce6bccdc18ff8c07b6') ^ 1n,
        Gx: BigInt(`0x${BRAINPOOL_GENERATOR.x}`),
        Gy: BigInt(`0x${BRAINPOOL_GENERATOR.y}`),
      }),
    ).toThrow(/curve params/u);
  });

  /**
   * The sharper control: brainpoolP256t1, the twisted curve published in the SAME RFC 5639
   * §3.4 section, over the same field with the same subgroup order. It is a perfectly valid
   * curve — it constructs, its arithmetic works, ECDH on it agrees. If the RFC 7027 check
   * could not tell it apart from brainpoolP256r1, the check would be proving nothing about
   * WHICH curve the selector is offering.
   */
  it('does not accept brainpoolP256t1, the valid sibling curve from the same section', async () => {
    const { weierstrass } = await import('@noble/curves/abstract/weierstrass.js');
    const v = RFC7027_A1_BRAINPOOLP256R1;

    const t1 = weierstrass({
      p: BigInt(`0x${BRAINPOOL_PARAMS.p}`),
      n: BigInt(`0x${BRAINPOOL_PARAMS.n}`),
      h: 1n,
      a: BigInt('0xa9fb57dba1eea9bc3e660a909d838d726e3bf623d52620282013481d1f6e5374'),
      b: BigInt('0x662c61c430d84ea4fe66a7733d0b76b7bf93ebc4af2f49256ae58101fee92b04'),
      Gx: BigInt('0xa3e8eb3cc1cfe7b7732213b23a656149afa142c47aafbc2b79a191562e1305f4'),
      Gy: BigInt('0x2d996c823439c56d7f7b22e14644417e69bcb6de39d027001dabe8f35b25c9be'),
    });

    // Same secret scalar, different curve: a different public key, so the RFC 7027 vector
    // pins brainpoolP256r1 specifically and not merely "a brainpool-shaped curve".
    const onT1 = t1.BASE.multiply(BigInt(`0x${v.dA}`)).toAffine();
    expect(onT1.x.toString(16).padStart(64, '0')).not.toBe(v.x_qA.toLowerCase());

    // And the RFC's public point does not lie on the twisted curve at all. fromAffine()
    // accepts it without checking — membership is only tested by assertValidity(), which is
    // why the production check calls it rather than assuming construction validates.
    expect(() =>
      t1.fromAffine({ x: BigInt(`0x${v.x_qB}`), y: BigInt(`0x${v.y_qB}`) }).assertValidity(),
    ).toThrow();
  });
});
