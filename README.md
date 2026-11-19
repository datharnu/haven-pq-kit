# haven-pq-kit

Shared post-quantum toolkit for the Haven projects (Steward, Courier and Haven Escrow) on QoreChain testnet (`qorechain-diana`, EVM chain id 9800). It is a library, not a fest entry.

The Solidity libraries check ML-DSA-87 signatures on chain through the `pqcKeyStatus` and `pqcVerify` precompiles. The TypeScript side builds and signs the same bytes, registers ML-DSA-87 and ML-KEM-1024 keys, runs scoped EVM windows, and reads chain state. Keys stay outside the repository.

Nothing here is audited.

## Install

Releases are git tags. Nothing is published to npm.

```bash
forge install datharnu/haven-pq-kit@v0.1.0      # Solidity, remap haven-pq-kit/=lib/haven-pq-kit/src/
npm install github:datharnu/haven-pq-kit#v0.1.0 # TypeScript, shipped as .ts source
```

Browser-safe entry points are `haven-pq-kit` (everything below), `/pqauth`, `/quorum`, `/vendor`, `/keydir`, `/rest`, `/rest-proxy` and `/network`. Everything under `scripts/` is Node-only and reads `~/.haven`.

## Solidity

### `PqAuth`: one signer

The signed message is eight 32-byte words: domain, chain id, contract, signer, action, nonce, deadline and the hash of the arguments. On every check, the key is read live from `pqcKeyStatus` and must be ML-DSA-87, 2,592 bytes, and registered with proof of possession. An empty, short or reverting precompile answer raises `PqPrecompileUnavailable`. It is never read as a valid signature. The nonce is consumed on success. The transaction sender is never consulted.

```solidity
import {PqAuth} from "haven-pq-kit/PqAuth.sol";

contract Vault {
    using PqAuth for PqAuth.Signer;
    PqAuth.Signer internal owner;

    constructor(address account) { owner.init(account); }

    function sweep(address to, uint256 deadline, bytes calldata signature) external {
        owner.authorize(keccak256("vault.sweep"), keccak256(abi.encode(to)), deadline, 1 days, signature);
        // ...
    }
}
```

### `PqQuorum`: t of n signers

Up to 16 members, passed in strictly ascending order, all signing over one shared set nonce. A quorum share signs `quorumAction(action)` and a single-member veto signs `anyAction(action)`, so neither can be used as the other. `setMembers` is itself a quorum action and consumes the nonce.

```solidity
import {PqQuorum} from "haven-pq-kit/PqQuorum.sol";

contract Arbiters {
    using PqQuorum for PqQuorum.Set;
    PqQuorum.Set internal set;

    constructor(address[] memory members) { set.init(members, 2); }

    function resolve(uint16 splitBps, uint256 deadline, address[] calldata who, bytes[] calldata shares) external {
        set.authorizeQuorum(keccak256("escrow.resolve"), keccak256(abi.encode(splitBps)), deadline, 1 days, who, shares);
    }
}
```

### `VendorSig`: a typed invoice

Verifies an invoice (vendor, payee, token, amount, invoice id, due date, memo hash) signed by the vendor's registered ML-DSA-87 key, bound to the chain and to the gate contract. It has no nonce. The caller must record the invoice id so it cannot be paid twice.

```solidity
VendorSig.verify(invoice, signature); // reverts unless the vendor signed exactly this invoice for this gate
```

## TypeScript

### `pqauth` and `quorum`: message bytes and signatures

```ts
import { signAuth, signQuorumShares } from "haven-pq-kit";

const { signature } = signAuth(account.pqc.secretKey, {
  chainId: 9800n, contract: vault, signer: account.evm, action, nonce, deadline, argsHash,
});

const { who, signatures } = signQuorumShares(
  [{ account: a, secretKey: keyA }, { account: b, secretKey: keyB }],
  { chainId: 9800n, contract: arbiters, action, nonce: setNonce, deadline, argsHash },
); // sorted ascending, ready for authorizeQuorum
```

`vectors/messages.json` pins these bytes. `test/Vectors.t.sol` and Vitest both check them, and CI fails if the vectors drift.

### `keydir`: keys from the chain

```ts
import { readMlDsaKey, requireMlDsaKey, readVerifiedKemKey, testnetClient } from "haven-pq-kit";

const client = testnetClient();
const key = await readMlDsaKey(client, "0x…");   // eth_call to pqcKeyStatus, no REST
requireMlDsaKey(key);                            // registered, ML-DSA-87, possession proven, 2,592 bytes

const kem = await readVerifiedKemKey({ client, rest, chainId: "qorechain-diana", address: "qor1…", card });
```

`readVerifiedKemKey` reads the ML-KEM-1024 key over REST. It accepts that key only when the owner's QoreSeal recipient card names its SHA3-256 hash and the card's ML-DSA-87 signature verifies under the key from `pqcKeyStatus`. A lying node or proxy can swap the KEM key, but it cannot sign a card for the new one. Every other outcome throws `KemKeyRefused` or `PrecompileUnavailable`.

### `rest` and `rest-proxy`: reads without CORS

```ts
import { readRest } from "haven-pq-kit/rest";
import { createRestProxy } from "haven-pq-kit/rest-proxy";

const window = await readRest(rest, `/qorechain/pqc/v1/evm_window/${address}`);

// app/api/rest/[...path]/route.ts
export const GET = createRestProxy({ upstream: "https://api-testnet.qore.host", prefix: "/api/rest" });
export const OPTIONS = GET;
```

The proxy is GET-only behind an allowlist. It answers CORS preflight, forwards no request headers, and keeps only `pagination.*` query parameters.

## Scripts

Secrets go in `~/.haven/<name>.env` (mode 0600). An existing file is never overwritten. The commands print addresses and hashes only.

```bash
npm run pq -- new-account spike
npm run pq -- status spike
npm run pq -- register spike                 # ML-DSA-87 with proof of possession
npm run pq -- register-kem spike [--replace] # ML-KEM-1024 from the same mnemonic, plus cards/<qor1>.json
npm run pq -- verify-kem qor1… [card.json]
npm run pq -- open-window spike <txs> <maxValueUqor> [targets...]
npm run pq -- close-window spike
```

In code, `withWindow(name, { txs, maxValueUqor, targets }, body)` opens a window sized to `txs`, runs `body`, and closes the window in `finally`. `sendEvm` sends with the node's own gas estimate. A different KEM key that is already on chain is replaced only with `--replace`.

```bash
npm run test:sol      # Foundry: unit, fuzz, invariant, vectors
npm run test:ts       # Vitest
npm run typecheck
npm run vectors       # rewrite vectors/messages.json
npm run cbom:check    # QoreScan: contracts reach ML-DSA only through the two precompiles, never ecrecover
npm run cbom          # the same check plus the testnet account, written to cbom.json
npm run evidence      # every hash in deployments/*.json, re-checked through @qorechain/mcp
scripts/forge.sh build && npm run probe  # live precompiles, and PqAuth itself, by eth_call
```

On this machine, `forge` is shadowed by another program. `scripts/forge.sh` and `npm run test:sol` call Homebrew's Foundry.

## What is proven

On 19 November 2026, against qorechain-diana. The hashes are in `deployments/spikes.json` and the detail is in `docs/spikes.md`.

- A real ML-DSA-87 signature over a 256-byte message verifies in `pqcVerify`. One flipped byte does not.
- `qor143f0ghn8slqguwez73087dvq8lqnuuukqdu9fl` registered its ML-DSA-87 key with proof of possession. `pqcKeyStatus` returns a 2,592-byte key with `possessionProven=true`.
- `PqAuth` ran live inside an `eth_call`. It accepted the account's real signature and moved the nonce to 1. It refused a flipped signature and the replay with `SignatureInvalid`, and refused an account with no key with `KeyNotRegistered`.
- A scoped window admitted one transfer to its allowed target and refused contract creation. Then it was closed.
- The account published its ML-KEM-1024 key. `readVerifiedKemKey` accepted it through the signed card.
- `npm run evidence` passes for all five recorded transactions.

Foundry: 58 tests, plus an invariant suite with 5 invariants, held over 128,000 random calls. Vitest: 22 tests.

## Deliberate limits

- A caller's freshness window cannot exceed 30 days, and a signer set cannot exceed 16 members.
- `VendorSig` has no replay protection of its own.
- A recipient card is re-signed each time `register-kem` runs. Any card that names the current key's hash is valid.
- There is no web app, guest account, QoreX funding, MetaMask, Playwright run or demo video here. Those belong to the three apps.

## Kits and credits

See `docs/kits.md`. Built during the Build Before Q-Day fest. Apache-2.0.
