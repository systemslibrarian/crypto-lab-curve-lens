# crypto-lab-curve-lens

P-256 · Curve25519 · secp256k1 · ECDH

## Overview

crypto-lab-curve-lens is a browser-based crypto-lab demo for seeing elliptic-curve math from two angles at once: a small finite-field model where you can click visible points, and real P-256, Curve25519, and secp256k1 arithmetic computed with @noble/curves.

It is designed as the foundational ECC explainer in the crypto-lab collection: point addition, scalar multiplication, curve-family tradeoffs, and live ECDH with exact arithmetic.

## Repo and Live Demo

- Repository: https://github.com/systemslibrarian/crypto-lab-curve-lens
- Demo: https://systemslibrarian.github.io/crypto-lab-curve-lens/

## What You Can Explore

- Panel 1: A small-field curve explorer that plots every point on y² = x³ + 2x + 2 mod 17, labels the generator G, and lets you click two points to compute their exact sum.
- Panel 2: Scalar multiplication in both toy and production modes, with a double-and-add trace for the small field and real generator multiplication on P-256, Curve25519, and secp256k1.
- Panel 3: Side-by-side comparison cards for P-256, Curve25519, and secp256k1, including equation form, field size, subgroup order, cofactor, SafeCurves note, use cases, and post-quantum status.
- Panel 4: A live ECDH demo showing Alice and Bob derive the same shared value from opposite sides of the exchange.

## Primitives Used

- P-256
- Curve25519 / X25519
- secp256k1
- Elliptic-curve Diffie-Hellman (ECDH)
- Exact finite-field point arithmetic for the educational small-field model
- @noble/curves for real curve arithmetic and key agreement

## Running Locally

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

## Security Notes

- The small-field visualization is illustrative only. Real ECC security comes from prime fields around 256 bits, not from toy curves over p = 17 or p = 19.
- P-256 parameters match FIPS 186-5 / SP 800-186, Curve25519 matches RFC 7748, and secp256k1 matches SEC 2 v2.0.
- Real scalar multiplication and ECDH are computed through @noble/curves, not with floating-point approximations or simulated math.
- SafeCurves references in the UI point to safecurves.cr.yp.to.
- All classical ECC systems shown here are broken by Shor's algorithm on a sufficiently large fault-tolerant quantum computer.

## Why This Matters

ECC underpins TLS, Signal, SSH, hardware authenticators, and Bitcoin. Seeing the same group law on a tiny field and on production curves makes signatures, key exchange, and public-key compression less opaque.

## Related Demos

- [crypto-lab-x3dh-wire](https://github.com/systemslibrarian/crypto-lab-x3dh-wire)
- [crypto-lab-ratchet-wire](https://github.com/systemslibrarian/crypto-lab-ratchet-wire)
- [crypto-compare](https://github.com/systemslibrarian/crypto-compare)
- [crypto-lab landing page](https://github.com/systemslibrarian/crypto-lab)

So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31