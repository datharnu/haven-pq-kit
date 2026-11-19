# QoreChain kits used here

| Kit | Version | Job |
| --- | --- | --- |
| `@qorechain/sdk` | 0.14.0 | Mnemonics, the unified eth-native account, ML-DSA-87 sign and verify, `ensurePqcRegistered`, window messages, REST status and KEM reads |
| `@qorechain/evm` | 0.14.0 | Present, but its `qorechainTestnet` object is typed for a newer viem than 2.47.6. This kit defines the chain id 9800 client itself and does not import that object |
| `@qorechain/pqc` | 0.2.3 | Pulled in by the SDK. Direct calls go through the SDK's `pqcSign` and `pqcVerify` |
| `viem` | 2.47.6 | ABI encoding that matches Solidity `abi.encode`, and the EVM client |
| `@noble/hashes` | 2.4.0 | SHA3-256 of a KEM public key. This is NIST SHA3, not keccak |

Not used, and why:

- QoreSeal and QoreSign. No ML-KEM derivation is wired yet, so there is nothing honest to seal.
- QoreX, the wallet adapter, MCP, and QoreScan. Those belong to the apps, not this library.
- `create-qorechain-dapp`. This repo is a library. The apps will start from that template.
