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

## ML-KEM-1024 publication

`npm run pq -- register-kem spike` derived the ML-KEM-1024 key from the same mnemonic with QoreSeal (index 0), validated it, and published it in a hybrid-signed transaction. It then wrote the recipient card `cards/qor143f0ghn8slqguwez73087dvq8lqnuuukqdu9fl.json`, signed with the account's classical key and its ML-DSA-87 key.

| Step | Result |
| --- | --- |
| `MsgRegisterKEMKey` | `E3A7A234B84DABFC6E59FCF966CE1E9A4EC5ED1C5B3E43060F1CA111BBC59012`, code 0 |
| REST `/qorechain/pqc/v1/kem/{qor1}` | `found=true`, `ml-kem-1024`, 1,568 bytes |
| SHA3-256 of the key | `0x88e3b72bdd0fcb79f5a67758e05715b5f689ab5a6d5b05b4a85ef5b7cfb38a9d`, the same hash the card names |
| `verify-kem` | accepted. The card verifies under the ML-DSA key from `pqcKeyStatus` |

Running `register-kem` again finds the same key on chain and sends nothing. A different key would be refused unless `--replace` is passed.

## PqAuth running live

`npm run probe` also sends the creation code of `test/live/PqAuthLiveProbe.sol` in an `eth_call` from the spike account. Nothing is deployed. The probe creates a `LiveAuthTarget` that runs `PqAuth.init` and `authorize` against the real precompiles.

| Check | Result |
| --- | --- |
| Target address | `0x89B58275DF16f0d98496662240c77782D702E985`, matching the address predicted from the probe's nonce |
| Real signature from the registered key | accepted, nonce moved to 1 |
| Same message, one byte flipped | `SignatureInvalid` (`0x37e8456b`) |
| Replay of the accepted signature | `SignatureInvalid` (the nonce has moved) |
| An account with no registered key | `KeyNotRegistered` (`0x099326a9`) |
| `eth_estimateGas` of the plain `pqcVerify` on a later run | 321,010 (the first run measured 321,430) |

## Evidence through MCP

`npm run evidence` reads `deployments/spikes.json` and calls the `@qorechain/mcp` handlers `get_transaction` and `get_pq_status` for each hash. All five pass. Registration is tier `enrollment`. Opening the window, closing it and publishing the KEM key are tier `pqc`, each with exactly one verified PQC layer. The EVM transfer is `classical`.
