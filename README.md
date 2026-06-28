# crypto-lab-curve-lens

## What It Is

Elliptic-curve Diffie-Hellman (ECDH) is an asymmetric key-agreement protocol built on the elliptic-curve discrete logarithm problem (ECDLP): given a public point Q = k·G on a curve, recovering the private scalar k is computationally infeasible at production field sizes. This demo implements exact finite-field point addition and scalar multiplication for a small teaching curve (y² = x³ + 2x + 2 mod 17 and analogs), plus real arithmetic for P-256, Curve25519/X25519, and secp256k1 via @noble/curves. The security model is asymmetric: two parties exchange public points derived from private scalars and independently compute the same shared point without ever transmitting the secret. None of the three production curves shown are post-quantum secure; Shor's algorithm on a sufficiently large fault-tolerant quantum computer solves ECDLP in polynomial time.

## When to Use It

- **Ephemeral key agreement in TLS 1.3.** X25519 (Curve25519 ECDH) is the preferred key-exchange group; P-256 is the fallback for FIPS-constrained environments. Both prove forward secrecy because the ephemeral scalar is discarded after each handshake.
- **End-to-end encrypted messaging.** Signal's X3DH and Double Ratchet protocols chain multiple ECDH operations on Curve25519 to establish and continuously refresh session keys.
- **Hardware authenticator key generation.** FIDO2/WebAuthn uses P-256 (ES256) for credential key pairs because P-256 is supported in secure-element hardware and is FIPS-approved.
- **Blockchain transaction signing.** secp256k1 is used in Bitcoin and Ethereum for ECDSA signatures; choose it only when compatibility with those ecosystems is required — not for general-purpose key agreement.
- **Do not use ECDH** when post-quantum security is a requirement (NIST PQC finalists such as ML-KEM should be preferred), or when the runtime cannot guarantee a cryptographically secure random number generator for private scalar generation.
- Do NOT treat this as production code — it is a browser teaching demo, not a hardened key-agreement library.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-curve-lens](https://systemslibrarian.github.io/crypto-lab-curve-lens/)**

The demo has five interactive panels. Panel 1 plots every point on the small teaching curve, lets you click any two to compute their exact finite-field sum, and draws the chord/tangent line, the third intersection −(P+Q), and the reflection that defines the group law. Panel 2 runs scalar multiplication in both toy and production modes, with a full double-and-add trace for the small field and real generator multiplication for P-256, Curve25519, and secp256k1. Panel 3 lets you brute-force the elliptic-curve discrete logarithm on the toy curve — watch G, 2·G, 3·G, … walk the subgroup until the public point appears — then contrasts that with the ~2²⁵⁶ work it would take on P-256. Panel 4 shows side-by-side comparison cards for the three production curves, including field size, subgroup order, cofactor, SafeCurves rating, and post-quantum status. Panel 5 is a live ECDH exchange: click "Generate fresh keypairs" to produce new random Alice and Bob key pairs on your chosen curve and verify that both arrive at the same shared value, with one-click copy on every key.

The explorer grid is fully keyboard-navigable (Tab to focus the grid, arrow keys to move between points, Enter to select), and the current view — selected points, scalar, and chosen curves — is encoded in the URL, so "Copy shareable link" reproduces exactly what you're looking at.

## What Can Go Wrong

- **Small-subgroup / invalid-point attack.** If the curve cofactor h > 1 (Curve25519 has h = 8) and the implementation does not validate that the received public point lies in the prime-order subgroup, an attacker can send a low-order point that leaks bits of the private scalar through the shared secret.
- **Reuse of ephemeral scalars.** ECDH is designed for one-time use per session. Reusing the same ephemeral private scalar across multiple exchanges eliminates forward secrecy and, if combined with additional oracle access, can expose the scalar entirely.
- **Scalar generation from a weak RNG.** The security of the entire scheme depends on the private scalar being drawn from a cryptographically uniform distribution. A biased or predictable RNG (e.g., a seeded PRNG, `Math.random()`) reduces the effective key space and makes the scalar recoverable.
- **Timing side-channel in scalar multiplication.** A variable-time double-and-add loop leaks secret scalar bits through execution timing. Production libraries such as @noble/curves use constant-time implementations; hand-rolled implementations often do not.
- **Conflating the shared point with a symmetric key.** The x-coordinate of the ECDH shared point is not uniformly distributed and must be passed through a KDF (e.g., HKDF) before use as an AES or ChaCha20 key. Using the raw coordinate directly is a protocol error present in numerous real-world implementations.

## Real-World Usage

- **TLS 1.3 (RFC 8446).** X25519 and P-256 are the two most widely negotiated key-share groups; the ephemeral ECDH step in the handshake provides forward secrecy for every HTTPS connection.
- **Signal Protocol.** X3DH (Extended Triple Diffie-Hellman) and the Double Ratchet both rely on X25519 ECDH for initial key agreement and continuous ratcheting in Signal, WhatsApp, and other adopters.
- **WireGuard (RFC 8999).** Uses Curve25519 (X25519) as its sole key-exchange mechanism; the simplicity and speed of the curve are central to the protocol's design goals.
- **FIDO2 / WebAuthn (W3C + CTAP2).** P-256 (ES256) is the mandatory-to-implement credential algorithm for hardware security keys and platform authenticators, used in passkey authentication and hardware 2FA.
- **Bitcoin and Ethereum.** secp256k1 is used for ECDSA transaction signing in both networks; every Bitcoin address and Ethereum account is derived from a secp256k1 public key.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-curve-lens
cd crypto-lab-curve-lens
npm install
npm run dev
```

## Related Demos

- [crypto-lab-key-exchange](https://systemslibrarian.github.io/crypto-lab-key-exchange/) — Diffie-Hellman through ECDH, X25519, and ML-KEM in one comparison.
- [crypto-lab-curve448](https://systemslibrarian.github.io/crypto-lab-curve448/) — the higher-security X448/Ed448 sibling to Curve25519 (RFC 7748/8032).
- [crypto-lab-x3dh-wire](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/) — chains X25519 ECDH into Signal's initial key agreement.
- [crypto-lab-ratchet-wire](https://systemslibrarian.github.io/crypto-lab-ratchet-wire/) — the Double Ratchet that keeps re-running ECDH for forward secrecy.
- [crypto-lab-hybrid-wire](https://systemslibrarian.github.io/crypto-lab-hybrid-wire/) — combines X25519 with ML-KEM-768 for post-quantum key exchange.

## Development

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server
npm test         # run the Vitest suite (arithmetic, real-curve vectors, DOM smoke tests)
npm run lint     # ESLint + Prettier check
npm run format   # apply Prettier
npm run build    # typecheck (tsc --noEmit) + production build
```

The finite-field arithmetic, the `@noble/curves` integration, and the rendered UI are all covered by tests. `runVerificationSuite()` additionally re-checks the P-256 and secp256k1 base points and subgroup orders and the RFC 7748 X25519 vectors at runtime, surfacing the results in Panel 2. CI (`.github/workflows/ci.yml`) runs lint, tests, and build on every push and pull request; deployment to GitHub Pages runs only after the same checks pass.

---

_One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite._

_"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31_
