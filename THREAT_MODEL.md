# Threat model

What a contract or app using this kit can rely on, and what it cannot.

## Relied on

- `pqcKeyStatus` and `pqcVerify` at `0x…0a02` and `0x…0a01` on qorechain-diana do what the docs say. A check uses the key returned for that account at that moment, so a later rotation takes effect on the next call. These precompiles are not active on mainnet (`qorechain-vladi`).
- The key was registered with a proof of possession. `registered` alone is not accepted.
- The signature covers chain id, contract, signer, action, nonce, deadline and the argument hash. A signature for another contract, chain, action or nonce does not verify.
- Quorum shares and single-member vetoes use different action domains.
- An inactive precompile returns success with empty data. The library treats a short or failed answer as unavailable, never as "valid".
- The contracts reach ML-DSA only through those two precompiles and never call `ecrecover`. `npm run cbom:check` enforces this in CI.
- A KEM key is used only when the owner's recipient card names its SHA3-256 hash and is signed by the ML-DSA key from `pqcKeyStatus`. A lying REST node or proxy can deny service, but it cannot substitute a key.

## Who it protects against

- Someone holding only the account's classical secp256k1 key, for example after Q-Day. They cannot produce an ML-DSA-87 signature, so they cannot pass `PqAuth`, `PqQuorum` or `VendorSig`, open a window, or publish a KEM key.
- A relayer or transaction sender. Being `msg.sender` grants nothing.
- A REST endpoint or proxy that lies about KEM keys.

## Not protected

- A precompile that returns `true` for a bad signature. The library trusts the chain's verifier. The Foundry mock includes a lying mode to show exactly this.
- Replay of a `VendorSig` invoice. The signature has no nonce. The contract that pays must store the invoice id.
- Whoever holds the mnemonic in `~/.haven` holds the classical key, the ML-DSA key and the ML-KEM key. The file permissions are 0600. That is not a second device and not a hardware signer.
- EVM-lane transactions are classical (secp256k1). They are bounded only by the window that the ML-DSA key opened. Keep windows scoped and short.
- A recipient card has no expiry in this kit. Rotating the KEM key makes old cards fail, because they name the old hash.
- The Foundry mock accepts a keyed hash with ML-DSA byte lengths. Those tests do not prove the NIST algorithm. `npm run probe` is the live check.
- `ws`, a dependency of viem 2.47.6, has a published advisory. The kit uses HTTP transports only.
- Nothing here has been audited.
