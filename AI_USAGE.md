# How this was written

19 November 2026.

## Workflow

One Cursor agent session, working from a shared Haven context block and the kit prompt (Prompt 1). The human pasted both and approved each step that touched the network: installing Foundry, funding the spike account, publishing its KEM key, and pushing to GitHub.

The agent read the QoreChain docs and the installed type declarations of `@qorechain/sdk`, `@qorechain/qoreseal`, `@qorechain/qoresign`, `@qorechain/mcp` and `@qorechain/qorescan`. It then wrote the Solidity, the tests, the scripts and these documents. Every SDK call is checked against those declarations or against a live answer from the testnet. It did not copy another entrant's repository.

## What the human decided

- The Haven family. The rule that a stolen classical key must not move funds. The order of work: this library first, then Steward, Courier and Haven Escrow.
- To follow Prompt 1 as written. The first pass had left out Vitest, an invariant suite, MCP evidence, KEM publication, the signed KEM check, the proxy split, signing helpers and the tag. The human asked for all of them.
- One signer in `PqAuth`, a t-of-n set in `PqQuorum`, and a separate invoice signature in `VendorSig`.
- Fail closed when a precompile answer is empty, short or a revert.
- Secrets stay in `~/.haven`, outside the repository.

## What the agent chose, open to change

- A caller-chosen deadline cannot be more than 30 days out. A signer set is at most 16 members.
- Native transactions go through `EthNativeSigner`, because cosmjs's signer derives a different address for a unified account.
- The ML-KEM-1024 key comes from QoreSeal's own mnemonic derivation. The binding the prompt asks for (a SHA3-256 hash that the owner signs with ML-DSA) is QoreSeal's recipient card. The kit does not invent its own format.
- `npm run evidence` calls the MCP tool handlers in-process instead of starting an MCP server.
- The live probe creates a `PqAuth` contract inside an `eth_call`, so it deploys nothing.
- The chain object is local, because `@qorechain/evm` 0.14.0's exported chain does not typecheck against viem 2.47.6.

## Mistakes the agent made and fixed

- The first registration attempt used cosmjs's signer, which signs for a different `qor1` address. It failed before reaching the chain and was redone with `EthNativeSigner`.
- The first contract-creation check was rejected by viem before it was sent, so it proved nothing. It was redone as a signed raw transaction, and the chain refused it.
- `vm.expectRevert` was placed before a helper call instead of the call under test in four Foundry tests. Those tests were fixed before any result was recorded.
