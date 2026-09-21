import { ecdh, weierstrass, type ECDH } from '@noble/curves/abstract/weierstrass.js';

/**
 * brainpoolP256r1 — built from published domain parameters, then checked against an
 * INDEPENDENT published vector before anything is allowed to use it.
 *
 * The other three curves in this lab arrive pre-instantiated from @noble/curves, so their
 * parameters were vetted upstream. This one is assembled here out of seven bare integers
 * typed into a source file, which is exactly the situation where a single transposed hex
 * digit produces a curve that still *works* — points add, scalars multiply, ECDH agrees —
 * while being the wrong curve. Every one of those operations would look correct on screen.
 *
 * So the parameters are not trusted on the strength of having been copied carefully. They
 * are confirmed by recomputing a key exchange whose answer was published separately, by a
 * different document, years later:
 *
 *   - Domain parameters (p, A, B, x, y, q, h): RFC 5639 §3.4, "Domain Parameters for
 *     256-Bit Curves". RFC 5639 writes the subgroup order as `q` and the generator as
 *     (x, y); @noble/curves calls them `n` and (Gx, Gy).
 *   - Validation vector: RFC 7027 Appendix A.1, "256-Bit Curve" — a full ECDH exchange
 *     (dA, qA, dB, qB) together with BOTH coordinates of the shared point (x_Z, y_Z).
 *
 * A wrong prime, a wrong coefficient or a wrong base point cannot survive that check: the
 * shared point lands somewhere else. Failing it means the constants below are wrong, and
 * {@link brainpoolP256r1} is then `null` — the curve is withheld from the registry rather
 * than offered with a caveat, and the verification list in Panel 2 reports the failure by
 * name. Fail closed: a curve that cannot reproduce its own published vector does not get
 * to be one of the choices in the selector.
 */

/** RFC 5639 §3.4, Curve-ID brainpoolP256r1. Verbatim, in the RFC's own notation. */
const RFC5639_SECTION_3_4 = {
  p: 'A9FB57DBA1EEA9BC3E660A909D838D726E3BF623D52620282013481D1F6E5377',
  A: '7D5A0975FC2C3057EEF67530417AFFE7FB8055C126DC5C6CE94A4B44F330B5D9',
  B: '26DC5C6CE94A4B44F330B5D9BBD77CBF958416295CF7E1CE6BCCDC18FF8C07B6',
  x: '8BD2AEB9CB7E57CB2C4B482FFC81B7AFB9DE27E1E3BD23C23A4453BD9ACE3262',
  y: '547EF835C3DAC4FD97F8461A14611DC9C27745132DED8E545C1D54C72F046997',
  q: 'A9FB57DBA1EEA9BC3E660A909D838D718C397AA3B561A6F7901E0E82974856A7',
  h: 1n,
} as const;

/**
 * RFC 7027 Appendix A.1, "256-Bit Curve", Curve brainpoolP256r1. Verbatim, including the
 * RFC's label spellings (`dA`/`dB` for the secret keys, `x_qA`… for the coordinates).
 *
 * y_Z is published too, so the check below can compare the whole shared POINT rather than
 * just the x-coordinate that ECDH goes on to use. Two distinct curves can agree on an x
 * and differ on y; requiring both closes that gap.
 */
export const RFC7027_A1_BRAINPOOLP256R1 = {
  dA: '81DB1EE100150FF2EA338D708271BE38300CB54241D79950F77B063039804F1D',
  x_qA: '44106E913F92BC02A1705D9953A8414DB95E1AAA49E81D9E85F929A8E3100BE5',
  y_qA: '8AB4846F11CACCB73CE49CBDD120F5A900A69FD32C272223F789EF10EB089BDC',
  dB: '55E40BC41E37E3E2AD25C3C6654511FFA8474A91A0032087593852D3E7D76BD3',
  x_qB: '8D2D688C6CF93E1160AD04CC4429117DC2C41825E1E9FCA0ADDD34E6F1B39F7B',
  y_qB: '990C57520812BE512641E47034832106BC7D3E8DD0E4C7F1136D7006547CEC6A',
  x_Z: '89AFC39D41D3B327814B80940B042590F96556EC91E6AE7939BCE31F3A18BF2B',
  y_Z: '49C27868F4ECA2179BFD7D59B1E3BF34C1DBDE61AE12931648F43E59632504DE',
} as const;

function fromHex(value: string): bigint {
  return BigInt(`0x${value}`);
}

/** Fixed-width lowercase hex, so a comparison can never pass on a differing-width value. */
function toFixedHex(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

export interface Rfc7027CheckResult {
  passed: boolean;
  /** x_Z as this build's arithmetic computed it — the value shown on the page. */
  computedX: string;
  /** y_Z as this build's arithmetic computed it. */
  computedY: string;
  /** x_Z exactly as RFC 7027 Appendix A.1 publishes it, lowercased for comparison. */
  expectedX: string;
  expectedY: string;
  /** Which side of the exchange was recomputed — both must land on the same point. */
  bothDirectionsAgree: boolean;
}

/**
 * Recompute RFC 7027 Appendix A.1 from scratch on the instantiated curve.
 *
 * Both directions are run — Alice's dA·qB and Bob's dB·qA — because a·B == b·A is the
 * property ECDH rests on, and a curve whose arithmetic was subtly wrong could still land
 * both parties on one *incorrect* point. Agreement alone proves nothing; agreement on the
 * published point is the claim.
 *
 * The public keys are re-derived from the secret keys as well, so the generator is exercised
 * rather than taken on trust: qA is recomputed as dA·G and compared with the RFC's qA.
 */
function checkAgainstRfc7027(Point: ReturnType<typeof weierstrass<bigint>>): Rfc7027CheckResult {
  const v = RFC7027_A1_BRAINPOOLP256R1;
  const expectedX = v.x_Z.toLowerCase();
  const expectedY = v.y_Z.toLowerCase();
  const failed: Rfc7027CheckResult = {
    passed: false,
    computedX: '',
    computedY: '',
    expectedX,
    expectedY,
    bothDirectionsAgree: false,
  };

  // Anything thrown in here is a failed check, not a crash: a bad parameter set must leave
  // the page running and the curve withheld, never take the whole lab down at import time.
  try {
    // Public keys, re-derived from the secret scalars via the base point.
    const qA = Point.BASE.multiply(fromHex(v.dA)).toAffine();
    const qB = Point.BASE.multiply(fromHex(v.dB)).toAffine();
    const publicKeysMatch =
      toFixedHex(qA.x) === v.x_qA.toLowerCase() &&
      toFixedHex(qA.y) === v.y_qA.toLowerCase() &&
      toFixedHex(qB.x) === v.x_qB.toLowerCase() &&
      toFixedHex(qB.y) === v.y_qB.toLowerCase();

    // fromAffine() deliberately does NOT check curve membership — the library says to call
    // assertValidity() on input you have not already vetted. Do that: the RFC's published
    // public points must lie on the curve these parameters actually built.
    const peerForAlice = Point.fromAffine({ x: fromHex(v.x_qB), y: fromHex(v.y_qB) });
    const peerForBob = Point.fromAffine({ x: fromHex(v.x_qA), y: fromHex(v.y_qA) });
    peerForAlice.assertValidity();
    peerForBob.assertValidity();

    // The shared point, computed independently from each side.
    const zFromAlice = peerForAlice.multiply(fromHex(v.dA)).toAffine();
    const zFromBob = peerForBob.multiply(fromHex(v.dB)).toAffine();

    const computedX = toFixedHex(zFromAlice.x);
    const computedY = toFixedHex(zFromAlice.y);
    const bothDirectionsAgree =
      computedX === toFixedHex(zFromBob.x) && computedY === toFixedHex(zFromBob.y);

    return {
      passed:
        publicKeysMatch &&
        bothDirectionsAgree &&
        computedX === expectedX &&
        computedY === expectedY,
      computedX,
      computedY,
      expectedX,
      expectedY,
      bothDirectionsAgree,
    };
  } catch {
    return failed;
  }
}

function instantiate(): { curve: ECDH | null; check: Rfc7027CheckResult } {
  const Point = weierstrass({
    p: fromHex(RFC5639_SECTION_3_4.p),
    n: fromHex(RFC5639_SECTION_3_4.q),
    h: RFC5639_SECTION_3_4.h,
    a: fromHex(RFC5639_SECTION_3_4.A),
    b: fromHex(RFC5639_SECTION_3_4.B),
    Gx: fromHex(RFC5639_SECTION_3_4.x),
    Gy: fromHex(RFC5639_SECTION_3_4.y),
  });

  const check = checkAgainstRfc7027(Point);
  // Fail closed: no vector, no curve. The caller sees `null` and leaves it out.
  return { curve: check.passed ? ecdh(Point) : null, check };
}

const instantiated = instantiate();

/**
 * The live curve, or `null` if it could not reproduce RFC 7027 Appendix A.1.
 *
 * Shaped like the `p256` / `secp256k1` objects this lab already uses (`.Point`,
 * `.getPublicKey`), so the registry treats all three short-Weierstrass curves identically.
 */
export const brainpoolP256r1: ECDH | null = instantiated.curve;

/** The check result itself, surfaced so the page can show the recomputed point. */
export const BRAINPOOL_RFC7027_CHECK: Rfc7027CheckResult = instantiated.check;

/** The published base point, for the comparison card. */
export const BRAINPOOL_GENERATOR = {
  x: RFC5639_SECTION_3_4.x.toLowerCase(),
  y: RFC5639_SECTION_3_4.y.toLowerCase(),
} as const;

export const BRAINPOOL_PARAMS = {
  p: RFC5639_SECTION_3_4.p.toLowerCase(),
  n: RFC5639_SECTION_3_4.q.toLowerCase(),
  cofactor: String(RFC5639_SECTION_3_4.h),
} as const;
