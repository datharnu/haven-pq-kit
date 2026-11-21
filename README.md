# haven-pq-kit

The common cryptographic boundary for Haven Escrow, Haven Steward and Haven Courier on the QoreChain testnet (`qorechain-diana`, EVM chain id 9800).

The kit gives the three products one answer to a narrow question: **which exact bytes must a registered post-quantum key approve before an action is allowed?** Its contracts read ML-DSA-87 keys from QoreChain at the moment of use and verify signatures through the chain's precompiles. Its TypeScript modules produce the same messages, check recipient keys and operate the short-lived EVM windows those products need.

It is supporting infrastructure, not a separate hackathon entry. It has no web app, holds no project funds and has not received an external audit.

## What is Haven-specific

| Module | The Haven job it serves | Where the boundary stops |
| --- | --- | --- |
| `PqAuth` | One named person authorises one fresh contract action; Haven Escrow uses it for delivery, release, dispute and cancellation | The consuming contract still decides what that action is allowed to change |
| `PqQuorum` | A sorted threshold of arbiters signs one Escrow resolution; a distinct one-member domain can support a veto without becoming a quorum share | It verifies membership and signatures, not the fairness of a split |
| `VendorSig` | A Steward vendor signs the exact invoice fields PayGate will inspect | The caller must store the invoice id to stop a second payment |
| `keydir` | Courier and Escrow accept an ML-KEM recipient only when its published key matches a card signed by the same account's registered ML-DSA-87 key | QoreSeal 0.1.0 is still a draft pending external review |
| account and window scripts | The three products register keys, open a window around the intended EVM calls and close what remains | The scripts operate testnet accounts whose secret files stay outside the repository |

## The rule underneath every signature

An accepted `PqAuth` message contains eight fixed-width values:

```text
Haven domain · EVM chain id · contract · signer · action · nonce · deadline · hash(arguments)
```

Each field closes a different replay path. The chain id prevents a signature moving to another EVM chain. The contract and action keep it inside one operation. The nonce makes an accepted signature single-use. The deadline limits an unused signature's life. The argument hash binds the decision to the values the contract will execute.

The transaction sender is not part of the authority. A relayer may pay gas, but it cannot change the signer, action or arguments without invalidating the signature.

## Install

Version `v0.1.0` is available as a git tag. The kit is not published to npm.

```bash
forge install datharnu/haven-pq-kit@v0.1.0
npm install github:datharnu/haven-pq-kit#v0.1.0
```

Add `haven-pq-kit/=lib/haven-pq-kit/src/` to Foundry remappings. The TypeScript package ships source files for a TypeScript-aware bundler. Its browser-safe exports are `/pqauth`, `/quorum`, `/vendor`, `/keydir`, `/rest`, `/rest-proxy` and `/network`; the root export combines them. Files under `scripts/` are Node-only and may read account files from `~/.haven`.

## Contract modules

### One Haven action: `PqAuth`

`PqAuth.authorize` performs the same sequence every time:

1. refuse an expired deadline or a caller-selected freshness window above the kit's 30-day ceiling;
2. build the eight-word message for the current contract and nonce;
3. read the named account from `pqcKeyStatus`;
4. require algorithm `1`, proof of possession and a 2,592-byte public key;
5. require a 4,627-byte signature and ask `pqcVerify` for its verdict;
6. increment the nonce only after a valid verdict.

An empty, truncated or reverting precompile response is `PqPrecompileUnavailable`, never a negative-or-positive guess. Haven Escrow passes its own action label and argument hash into this boundary:

```solidity
clientAuth.authorize(
    EscrowArgs.RELEASE,
    EscrowArgs.releaseArgs(milestone, amount),
    deadline,
    MAX_TTL,
    signature
);
```

The escrow contract, not the kit, enforces that a successful release can pay only the freelancer named at creation.

### Several arbiters, one resolution: `PqQuorum`

`PqQuorum` keeps one member list, threshold and nonce. A submitted signer list must be strictly ascending, which makes duplicate signers impossible without a bitmap or a second mapping. Every share is checked against the member's current key on chain.

Quorum shares and one-member actions use different derived action domains. A signature intended for a veto cannot be counted toward a resolution, and a resolution share cannot become a veto. Replacing the member set is itself a quorum-authorised action that consumes the existing nonce, so older shares do not survive the change.

Haven Escrow uses a two-of-three set to authorise a split between the same client and freelancer already stored by the escrow. `PqQuorum` proves who approved the split; Haven Escrow constrains its recipients.

### One invoice, all of its fields: `VendorSig`

`VendorSig` encodes the vendor, payee, token, amount, invoice id, due date and memo hash together with the chain id and PayGate address. It then applies the same registered-key check as `PqAuth`.

The module intentionally has no nonce because invoices carry their own identity. PayGate must mark `invoiceId` as used after a successful check; using `VendorSig` alone does not provide replay protection.

## TypeScript modules

### The same bytes on both sides

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

`vectors/messages.json` is the hand-off between TypeScript and Solidity. `test/Vectors.t.sol` checks the stored messages in Foundry, and the TypeScript test suite regenerates the same values. A message-format change must make both sides change together.

### A recipient key needs two independent records

```ts
import { readMlDsaKey, requireMlDsaKey, readVerifiedKemKey, testnetClient } from "haven-pq-kit";

const client = testnetClient();
const key = await readMlDsaKey(client, "0x…");   // eth_call to pqcKeyStatus, no REST
requireMlDsaKey(key);                            // registered, ML-DSA-87, possession proven, 2,592 bytes

const kem = await readVerifiedKemKey({ client, rest, chainId: "qorechain-diana", address: "qor1…", card });
```

`readVerifiedKemKey` does not accept the REST response by itself. It hashes the published ML-KEM-1024 key with SHA3-256, requires the same digest in the account's QoreSeal recipient card, and checks that card with the ML-DSA-87 public key returned by `pqcKeyStatus`.

That creates two records an impostor would have to make agree: the KEM publication returned by REST and a card authenticated by the account's registered signing key. A disagreement is `KemKeyRefused`; an unavailable signing-key precompile remains `PrecompileUnavailable`.

### Narrow browser reads

```ts
import { readRest } from "haven-pq-kit/rest";
import { createRestProxy } from "haven-pq-kit/rest-proxy";

const window = await readRest(rest, `/qorechain/pqc/v1/evm_window/${address}`);

// app/api/rest/[...path]/route.ts
export const GET = createRestProxy({ upstream: "https://api-testnet.qore.host", prefix: "/api/rest" });
export const OPTIONS = GET;
```

The public QoreChain REST service does not expose the CORS headers the Haven web apps need. `createRestProxy` supplies a deliberately small bridge: only allowlisted read routes and `GET` requests pass through; cookies and other incoming request headers do not; only pagination query parameters are retained. It cannot broadcast a transaction.

## Testnet operator commands

Account files are stored at `~/.haven/<name>.env` with mode `0600`. Creation refuses to overwrite an existing file. Normal command output contains public addresses and transaction hashes, not mnemonics or secret keys.

```bash
npm run pq -- new-account spike
npm run pq -- status spike
npm run pq -- register spike                 # ML-DSA-87 with proof of possession
npm run pq -- register-kem spike [--replace] # ML-KEM-1024 from the same mnemonic, plus cards/<qor1>.json
npm run pq -- verify-kem qor1… [card.json]
npm run pq -- open-window spike <txs> <maxValueUqor> [targets...]
npm run pq -- close-window spike
```

`withWindow(name, { txs, maxValueUqor, targets }, body)` opens only the window its callback declares and closes any remainder in `finally`. `sendEvm` uses the node's estimate instead of a hardcoded transaction gas value. KEM registration is idempotent for the same key and requires the explicit `--replace` flag before changing an existing publication.

## Check it locally

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

This machine has another executable named `forge` earlier on `PATH`; `scripts/forge.sh` calls Homebrew's Foundry directly.

## Recorded evidence

The following was observed on `qorechain-diana` on 19 November 2026. The full hashes and measurements are in [`deployments/spikes.json`](deployments/spikes.json) and [`docs/spikes.md`](docs/spikes.md).

- A real ML-DSA-87 signature over a 256-byte message verifies in `pqcVerify`. One flipped byte does not.
- `qor143f0ghn8slqguwez73087dvq8lqnuuukqdu9fl` registered its ML-DSA-87 key with proof of possession. `pqcKeyStatus` returns a 2,592-byte key with `possessionProven=true`.
- `PqAuth` ran live inside an `eth_call`. It accepted the account's real signature and moved the nonce to 1. It refused a flipped signature and the replay with `SignatureInvalid`, and refused an account with no key with `KeyNotRegistered`.
- A scoped window admitted one transfer to its named target, refused contract creation, and was then closed.
- The account published its ML-KEM-1024 key. `readVerifiedKemKey` accepted it through the signed card.
- `npm run evidence` passes for all five recorded transactions.

At that recorded run, Foundry passed 58 tests. Its five invariants held over 128,000 generated calls, and Vitest passed 22 tests. Re-run the commands above for the current tree rather than treating these dated counts as permanent.

## Limits

- The kit is unaudited. Its tests and testnet probes are evidence, not an external security review.
- QoreSeal 0.1.0 is a draft pending external review.
- A contract may choose a freshness window up to 30 days; individual Haven products use shorter limits where their rules require them.
- A `PqQuorum` set may contain at most 16 members.
- `VendorSig` does not remember invoice ids. A consuming contract must do that.
- Re-registering a KEM key creates a new signed card. More than one correctly signed card may name the currently published key.
- The REST bridge narrows access but does not make its upstream authoritative. Decisions about a recipient key also require the signed card and the ML-DSA key read through the EVM precompile.
- There is no wallet or user interface in this repository. Browser flows belong to the three Haven products.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/PqAuth.sol` | One registered ML-DSA-87 signer and one consumed nonce |
| `src/PqQuorum.sol` | Threshold and one-member authorisation under separate domains |
| `src/VendorSig.sol` | Steward's typed invoice signature |
| `src/ts/` | Matching messages, signatures, key checks, REST reads and network constants |
| `scripts/` | Account, registration, window, probe, evidence and CBOM commands |
| `test/` | Foundry unit, fuzz, invariant, failure-mode and vector checks |
| `test-ts/` | TypeScript tests for the public modules and script boundaries |
| `vectors/` | Cross-language message fixtures |
| `deployments/` | Public hashes from the testnet spike |
| `docs/spikes.md` | What the network returned and where the implementation had to fail closed |

## Dependencies and licence

[`docs/kits.md`](docs/kits.md) lists every pinned QoreChain package, the exact job it performs and the packages intentionally absent from this library. `npm audit` currently reports the `ws` advisory described there; the kit uses viem's HTTP transport and does not claim the advisory is fixed.

The repository was started on 19 November 2026 during QoreChain's Build Before Q-Day developer fest. It is licensed under Apache-2.0; see [`LICENSE`](LICENSE).
