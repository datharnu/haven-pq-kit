# Kits and libraries

Every version is pinned exactly in `package.json`.

| Package | Version | Job here |
| --- | --- | --- |
| `@qorechain/sdk` | 0.14.0 | Mnemonics; the unified eth-native account and its canonical ML-DSA-87 key; `EthNativeSigner`; ML-DSA sign and verify; proof of possession; the registration, window and KEM message types; REST status reads |
| `@qorechain/pqc` | 0.2.3 | ML-DSA-87 and ML-KEM-1024 underneath the SDK and QoreSeal |
| `@qorechain/qoreseal` | 0.1.0 | ML-KEM-1024 and X25519 keys derived from the mnemonic, key validation, signed recipient cards, and the KEM read over REST |
| `@qorechain/qoresign` | 0.1.0 | The classical key type that signs recipient cards. Pinned to the version QoreSeal 0.1.0 depends on, not the newer 0.2.0 |
| `@qorechain/mcp` | 0.1.1 | `get_transaction` and `get_pq_status`, called in-process by `npm run evidence` |
| `@qorechain/qore-cli` | 0.1.1 | Installed for manual checks (`npx qore`). The scripts use MCP |
| `@qorechain/qorescan` | 0.1.0 | The CycloneDX 1.6 CBOM, and the data behind `npm run cbom:check` |
| `@qorechain/evm` | 0.14.0 | Present. Its `qorechainTestnet` object is typed for a newer viem than 2.47.6, so this kit defines the chain id 9800 client itself |
| `viem` | 2.47.6 | ABI encoding that matches Solidity `abi.encode`; the EVM client |
| `@cosmjs/stargate` | the version the SDK resolves | Broadcast transport for `EthNativeSigner` |
| `@noble/hashes` | 2.4.0 | SHA3-256 (NIST, not keccak) of a KEM public key |
| `forge-std` | v1.17.0 | Foundry test helpers |
| `vitest` | 5.1.1 | TypeScript tests |

Not used here, and why:

- `create-qorechain-dapp`, `@qorechain/qorex-types` and `@qorechain/wallet-adapter`. They belong to the three web apps, which will start from the template. This repository has no UI.

`npm audit` reports a high-severity advisory in `ws`, which viem 2.47.6 depends on. The kit uses only viem's HTTP transport, never WebSockets. Moving to a fixed viem would also change the pinned ABI library, so it waits for a deliberate upgrade.
