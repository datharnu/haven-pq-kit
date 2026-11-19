# haven-pq-kit

Shared post-quantum toolkit for the Haven projects on QoreChain testnet (`qorechain-diana`, EVM chain id 9800). Solidity libraries check ML-DSA-87 signatures on chain. TypeScript builds the same message bytes, keeps keys outside the repo, and reads the live precompiles.

Nothing here is audited. The mock signatures in the Foundry tests are not ML-DSA; `npm run probe` checks a real ML-DSA-87 signature against the live precompile.

## Libraries

`PqAuth` authorises one signer. The signed message is eight words: domain, chain id, contract, signer, action, nonce, deadline, and the hash of the arguments. The signer account's key is read from `pqcKeyStatus` on every check. It must be ML-DSA-87, 2,592 bytes, and registered with a proof of possession. `pqcVerify` must return true. An empty precompile answer is a failure, never a valid signature. The transaction sender is not consulted.

`PqQuorum` is a 2-of-3 style set, up to 16 members. Quorum shares and a single-member veto sign different action domains, so one cannot be replayed as the other. Replacing the set consumes the shared nonce.

`VendorSig` checks an invoice signed by the vendor's own registered key. Remembering the invoice id, so it cannot be paid twice, is the caller's job.

```solidity
import {PqAuth} from "haven-pq-kit/PqAuth.sol";

contract Gate {
    using PqAuth for PqAuth.Signer;
    PqAuth.Signer internal signer;

    constructor(address account) {
        signer.init(account);
    }
}
```

Install the Solidity with `forge install` once this repo has a git tag. Until then, depend on the local path. Remap `haven-pq-kit/=src/`.

## Scripts

Secrets go in `~/.haven/<name>.env` (mode 0600). The commands print addresses only.

```bash
npm install
npm run test:sol
npm run test:ts
npm run typecheck
scripts/forge.sh build && npm run probe

npm run pq -- new-account spike
npm run pq -- status spike
npm run pq -- register spike
npm run pq -- open-window spike 120 2 1000000 0x1111111111111111111111111111111111111111
npm run pq -- close-window spike
```

`forge` on this machine is shadowed by another program. `scripts/forge.sh` and `npm run test:sol` call Homebrew's Foundry.

## What is proven

On 19 November 2026, against `https://evm-testnet.qore.host`:

- An account with no key returns `registered=false`, algorithm `0`, an empty key, and `possessionProven=false` (160 bytes).
- A real ML-DSA-87 signature over a 256-byte message verifies. One flipped byte does not. `eth_estimateGas` reported 321,430 gas.
- A deployless call of `test/live/PqAuthProbe.sol` returned the same empty-key status.
- `qor143f0ghn8slqguwez73087dvq8lqnuuukqdu9fl` registered an ML-DSA-87 key with proof of possession. `pqcKeyStatus` returned a 2,592-byte key and `possessionProven=true`.
- A scoped window admitted one transfer to its allowed target and refused contract creation. The window was then closed. Hashes are in `docs/spikes.md`.

Foundry: 56 tests. TypeScript: 7 tests. The signed-message vectors match from both languages.

## Not done yet

`register-kem` is refused on purpose. The SDK in use can register an ML-DSA key. It does not derive an ML-KEM-1024 key, and this kit will not publish the wrong key. `keydir` can read a KEM key and hash it with SHA3-256. It does not yet refuse that key unless the owner signed the hash with ML-DSA.

`npm run evidence` re-checks a hash through the public REST and EVM endpoints. It does not call `@qorechain/mcp`. The spike hashes are in `docs/spikes.md`. There is no `deployments/*.json` yet, because this library has not deployed a contract.

TypeScript tests use Node's test runner. Foundry covers unit and fuzz tests. There is no Foundry invariant suite, and there is no `v0.1.0` git tag yet.

A caller's freshness window cannot exceed 30 days. A signer set cannot exceed 16 members. Nothing here is audited.

## Kits

See `docs/kits.md` and `docs/spikes.md`.
