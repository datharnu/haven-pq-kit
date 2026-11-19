# How this was written

19 November 2026.

The human chose the Haven family, the rule that a stolen classical key must not move funds, and the order of work: this library first, then Steward, Courier, and Haven Escrow. The human said to start the kit.

The agent in Cursor read the QoreChain docs and the installed `@qorechain/sdk` 0.14.0 type declarations, then wrote the Solidity, the tests, and the scripts. It did not copy another entrant's repository.

Human decisions still in force:

- One signer in `PqAuth`, a t-of-n set in `PqQuorum`, and a separate invoice signature in `VendorSig`.
- Fail closed when the precompile answer is empty, short, or a revert.
- Secrets stay in `~/.haven`, outside the repo.

Agent choices, open to change:

- A caller-chosen deadline cannot be more than 30 days out.
- A signer set is at most 16 members.
- `register-kem` throws until there is a real ML-KEM-1024 derivation. Publishing an ML-DSA key as if it were a KEM key was rejected.
- The chain object is local, because `@qorechain/evm` 0.14.0's exported chain does not typecheck against viem 2.47.6.

The precompile, registration, and scoped-window spikes have been run. The numbers are in `docs/spikes.md`.
