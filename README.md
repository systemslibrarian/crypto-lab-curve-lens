# crypto-lab-curve-lens

P-256 · Curve25519 · secp256k1 · ECDH

## What It Is

Elliptic-curve Diffie-Hellman (ECDH) is an asymmetric key-agreement protocol built on the elliptic-curve discrete logarithm problem (ECDLP): given a public point Q = k·G on a curve, recovering the private scalar k is computationally infeasible at production field sizes. This demo implements exact finite-field point addition and scalar multiplication for a small teaching curve (y² = x³ + 2x + 2 mod 17 and analogs), plus real arithmetic for P-256, Curve25519/X25519, and secp256k1 via @noble/curves. The security model is asymmetric: two parties exchange public points derived from private scalars and independently compute the same shared point without ever transmitting the secret. None of the three production curves shown are post-quantum secure; Shor's algorithm on a sufficiently large fault-tolerant quantum computer solves ECDLP in polynomial time.

## When to Use It

- **Ephemeral key agreement in TLS 1.3.** X25519 (Curve25519 ECDH) is the preferred key-exchange group; P-256 is the fallback for FIPS-constrained environments. Both prove forward secrecy because the ephemeral scalar is discarded after each handshake.
- **End-to-end encrypted messaging.** Signal's X3DH and Double Ratchet protocols chain multiple ECDH operations on Curve25519 to establish and continuously refresh session keys.
- **Hardware authenticator key generation.** FIDO2/WebAuthn uses P-256 (ES256) for credential key pairs because P-256 is supported in secure-element hardware and is FIPS-approved.
- **Blockchain transaction signing.** secp256k1 is used in Bitcoin and Ethereum for ECDSA signatures; choose it only when compatibility with those ecosystems is required — not for general-purpose key agreement.
- **Do not use ECDH** when post-quantum security is a requirement (NIST PQC finalists such as ML-KEM should be preferred), or when the runtime cannot guarantee a cryptographically secure random number generator for private scalar generation.

## Live Demo

[https://systemslibrarian.github.io/crypto-lab-curve-lens/](https://systemslibrarian.github.io/crypto-lab-curve-lens/)

The demo has four interactive panels. Panel 1 plots every point on the small teaching curve and lets you click any two to compute their exact finite-field sum. Panel 2 runs scalar multiplication in both toy and production modes, with a full double-and-add trace for the small field and real generator multiplication for P-256, Curve25519, and secp256k1. Panel 3 shows side-by-side comparison cards for the three production curves, including field size, subgroup order, cofactor, SafeCurves rating, and post-quantum status. Panel 4 is a live ECDH exchange: click "Generate fresh keypairs" to produce new random Alice and Bob key pairs on your chosen curve and verify that both arrive at the same shared value.

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

## Related Demos

- [crypto-lab-x3dh-wire](https://github.com/systemslibrarian/crypto-lab-x3dh-wire)
- [crypto-lab-ratchet-wire](https://github.com/systemslibrarian/crypto-lab-ratchet-wire)
- [crypto-compare](https://github.com/systemslibrarian/crypto-compare)
- [crypto-lab landing page](https://github.com/systemslibrarian/crypto-lab)

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*