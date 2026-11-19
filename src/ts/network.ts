import { defineChain } from "viem";

/** qorechain-diana, the only network where the PQC precompiles are active. */
export const TESTNET = {
  chainId: "qorechain-diana",
  evmChainId: 9800,
  rest: "https://api-testnet.qore.host",
  rpc: "https://rpc-testnet.qore.host",
  evmRpc: "https://evm-testnet.qore.host",
} as const;

/** Local chain object. `@qorechain/evm` 0.14.0's `qorechainTestnet` is typed for a newer viem than 2.47.6. */
export const qorechainDiana = defineChain({
  id: TESTNET.evmChainId,
  name: "QoreChain Diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [TESTNET.evmRpc] } },
});

export const PQC_VERIFY = "0x0000000000000000000000000000000000000a01" as const;
export const PQC_STATUS = "0x0000000000000000000000000000000000000a02" as const;

export const ML_DSA_87 = 1;
export const PUBKEY_LEN = 2592;
export const SIG_LEN = 4627;
