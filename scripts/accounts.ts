import { StargateClient } from "@cosmjs/stargate";
import { createPublicClient, http, type Address } from "viem";
import { EthNativeSigner, deriveUnifiedAccount, fetchEvmWindow, fetchPqcStatus, generateMnemonic, type UnifiedAccount } from "@qorechain/sdk";
import { deriveSealKeys, type SealKeyPair } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { TESTNET, qorechainDiana } from "../src/ts/network.js";
import { readMnemonic, writeSecret } from "./secrets.js";

export const CHAIN_ID = "qorechain-diana";
/** 0.15 uqor per gas, above the network minimum of 0.1, for a 600,000 gas limit. */
const FEE = { amount: [{ denom: "uqor", amount: "90000" }], gas: "600000" };

/** The secp256k1 key and the canonical ML-DSA-87 key, both from the mnemonic. */
export async function loadAccount(name: string): Promise<UnifiedAccount> {
  return deriveUnifiedAccount(readMnemonic(name));
}

/** The ML-KEM-1024 and X25519 keys QoreSeal derives from the same mnemonic (index 0). */
export function loadSealKeys(name: string, index = 0): SealKeyPair {
  return deriveSealKeys({ mnemonic: readMnemonic(name), index });
}

export async function newAccount(name: string): Promise<void> {
  const mnemonic = generateMnemonic(256);
  writeSecret(name, mnemonic);
  const account = await deriveUnifiedAccount(mnemonic);
  console.log(`qor ${account.cosmos}`);
  console.log(`evm ${account.evm}`);
}

async function accountSequence(account: UnifiedAccount): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const evm = createPublicClient({ chain: qorechainDiana, transport: http(TESTNET.evmRpc) });
  const [response, nonce] = await Promise.all([
    fetch(`${TESTNET.rest}/cosmos/auth/v1beta1/accounts/${account.cosmos}`),
    evm.getTransactionCount({ address: account.evm as Address, blockTag: "pending" }),
  ]);
  if (!response.ok) throw new Error(`account ${account.cosmos} is not on chain (${response.status})`);
  const body = (await response.json()) as { account?: { account_number?: string } };
  if (!body.account?.account_number) throw new Error(`account ${account.cosmos} is not on chain`);
  // The Cosmos sequence and the EVM nonce are one number. The EVM count updates
  // as soon as a transaction is sent; the REST account query can lag behind it.
  return { accountNumber: BigInt(body.account.account_number), sequence: BigInt(nonce) };
}

export type NativeMessages = Parameters<EthNativeSigner["sign"]>[0]["messages"];

/**
 * A unified account is eth-native: its qor1 address is the 20-byte EVM address.
 * The cosmjs secp256k1 signer derives a different address, so every native
 * transaction goes through EthNativeSigner. Registration is the one classical
 * transaction; everything after it is hybrid.
 */
export async function broadcast(
  account: UnifiedAccount,
  messages: NativeMessages,
  signMode: "hybrid" | "classical",
): Promise<string> {
  const auth = await accountSequence(account);
  const signer = new EthNativeSigner(account, { signMode, rest: TESTNET.rest, signBytesVersion: "auto" });
  const node = await StargateClient.connect(TESTNET.rpc);
  try {
    const result = await signer.signAndBroadcast(node, {
      chainId: CHAIN_ID,
      messages,
      fee: FEE,
      accountNumber: auth.accountNumber,
      sequence: auth.sequence,
    });
    if (result.code !== 0) {
      throw new Error(`tx ${result.transactionHash} failed with code ${result.code}: ${result.rawLog ?? ""}`);
    }
    return result.transactionHash;
  } finally {
    node.disconnect();
  }
}

export async function printStatus(name: string): Promise<void> {
  const account = await loadAccount(name);
  const [status, kem, window, balances] = await Promise.all([
    fetchPqcStatus({ rest: TESTNET.rest, address: account.cosmos }),
    fetchKemKey({ rest: TESTNET.rest, address: account.cosmos }),
    fetchEvmWindow({ rest: TESTNET.rest, address: account.cosmos }),
    fetch(`${TESTNET.rest}/cosmos/bank/v1beta1/balances/${account.cosmos}`).then((response) => response.json()),
  ]);
  console.log(`qor ${account.cosmos}`);
  console.log(`evm ${account.evm}`);
  console.log(
    `pqc registered=${String(status.registered)} algorithm=${String(status.algorithmId ?? "-")} possession=${String(status.possessionProven)}`,
  );
  console.log(`kem registered=${String(kem.registered)} algorithm=${String(kem.algorithmName ?? kem.algorithmId ?? "-")}`);
  console.log(
    `window found=${String(window.found)} live=${String(window.live)} remainingTxs=${String(window.remainingTxs)}`,
  );
  console.log(`balances ${JSON.stringify(balances)}`);
}
