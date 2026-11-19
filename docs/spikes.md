# Spikes

Read-only checks against qorechain-diana on 19 November 2026. RPC `https://evm-testnet.qore.host`. REST `https://api-testnet.qore.host`.

## Precompiles are on

`GET /cosmos/evm/vm/v1/params` lists `0x…0901`, `0x…0C01`, `0x…0a01` and `0x…0a02`.

`pqcKeyStatus(0x000…0001)` returns `false, 0, 0x, false`. The raw ABI encoding is 160 bytes. That fourth word is `possessionProven`. `@qorechain/evm` 0.14.0's `IQORE_PQC_ABI` stops at three words, so this kit decodes the fourth itself.

`GET /qorechain/pqc/v1/evm_limits` reports `tx_max_gas` 30,000,000 and `precompile_input_max_bytes` 16,384. The nested `limits` object in the same response is zeros. Use the top-level fields.

## A real signature verifies

`npm run probe` generates an ML-DSA-87 key locally (it is not registered, and it is not saved), signs a 256-byte message, and calls `pqcVerify`.

| Check | Result |
| --- | --- |
| Local `pqcVerify` | true |
| Precompile, real signature | true |
| Precompile, last signature byte flipped | false |
| Public key | 2,592 bytes |
| Signature | 4,627 bytes |
| `eth_estimateGas` of that `pqcVerify` | 321,430 |
| `PqAuthProbe` creation-code call for `0x000…0001` | `false, 0, pubkey length 0, false` |

## Account, registration, window

The spike account holds the mnemonic in `~/.haven/spike.env`. It was funded with 5,000,000 uqor by a transfer, not the faucet.

| | |
| --- | --- |
| qor | `qor143f0ghn8slqguwez73087dvq8lqnuuukqdu9fl` |
| evm | `0xaC52f45E6787c08E3B22f45e7f35803Fc13e7396` |

Registration is the one classical transaction. The cosmjs secp256k1 signer derives a different `qor1` address, so it was rejected. `EthNativeSigner` signs for the unified address.

| Step | Result |
| --- | --- |
| `MsgRegisterPQCKeyV2` | `306C8D4B8EDB04FEBDDC79880BFBFAFC0B2F8891CC78878FF8DDA7C25B2BDE90`, code 0, gas used 299,281. Event `pqc_key_registered`, algorithm `dilithium5`, key type `hybrid`. |
| `pqcKeyStatus` by `eth_call` | `registered=true`, algorithm `1`, public key 2,592 bytes, `possessionProven=true`. Raw ABI return is 2,752 bytes. |
| Scoped window opened | `5EBD5134AA247B528EB28C23B5980E0C4AA19294A83F01B6BE6DF141599A5349`. One allowed target, 200 blocks, 3 transactions, 1,000,000 uqor. |
| Transfer inside the window | `0x63c5658017bc1e6579dc10b4992499f2135f052ef0b88b445ef5e319a044a45e`, receipt `0x1`, 0.01 QOR to the allowed target, 21,000 gas. The window then showed `used_txs=1` and `used_value=15355`. |
| Contract creation inside that window | Refused before inclusion: "the window admits listed recipients only, not contract creation". |
| Window closed | `B22F66C9D32888D112C36BC2E506499393AC91375B85C9822229133EC8E0E56B`. A following read returned `found=false`. |

The Cosmos sequence and the EVM nonce are the same number. After the transfer, the REST account query still said sequence 2 while the chain expected 3. Closing the window reads `eth_getTransactionCount` (`pending`) instead.
