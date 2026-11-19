# Threat model

What a contract using this kit can rely on, and what it cannot.

## Relied on

- `pqcKeyStatus` and `pqcVerify` at `0x…0a02` and `0x…0a01` on qorechain-diana do what the docs say. A signature check uses the key returned for that account at that moment, so a later key rotation is picked up on the next call.
- The key was registered with a proof of possession. `registered` alone is not accepted.
- The signature covers chain id, contract, signer, action, nonce, deadline, and the argument hash. A signature for another contract, chain, or action does not verify.
- Quorum shares and single-member vetoes use different action domains.
- An inactive precompile returns success with empty data. The library treats a short or failed answer as unavailable. It does not decode that as "valid".

## Not protected

- A precompile that returns `true` for a bad signature. The library trusts the chain's verifier.
- Replay of a `VendorSig` invoice. The signature has no nonce. The contract that pays must store the invoice id.
- Whoever holds the mnemonic in `~/.haven` holds both the classical key and the ML-DSA key. The file permissions are 0600. That is not a second device and not a hardware signer.
- EVM transactions still need a live authorisation window opened with the ML-DSA key. This library does not open one inside a contract call.
- The Foundry mock accepts a keyed hash with ML-DSA byte lengths. Those tests do not prove the NIST algorithm. `npm run probe` is the live signature check. Registration and one scoped window were exercised once on testnet; see `docs/spikes.md`.
- Nothing here has been audited.
