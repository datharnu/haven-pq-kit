import { StargateClient } from "@cosmjs/stargate";
import { createPublicClient, hexToBytes, http, type Address } from "viem";
import {
  EthNativeSigner,
  buildRegisterPqcKeyMsg,
  deriveUnifiedAccount,
  fetchEvmWindow,
  fetchPqcStatus,
  generateMnemonic,
  openEvmWindowMsg,
  closeEvmWindowMsg,
  signProofOfPossession,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { TESTNET, qorechainDiana } from "../src/ts/network.js";
import { readMnemonic, writeSecret } from "./secrets.js";

const CHAIN_ID = "qorechain-diana";
/** 0.15 uqor per gas, above the network minimum of 0.1, for a 600,000 gas limit. */
const FEE = { amount: [{ denom: "uqor", amount: "90000" }], gas: "600000" };

export async function loadAccount(name: string): Promise<UnifiedAccount> {
  return deriveUnifiedAccount(readMnemonic(name));
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

/**
 * A unified account is eth-native: its qor1 address is the 20-byte EVM address.
 * The cosmjs secp256k1 signer derives a different address, so every native
 * transaction goes through EthNativeSigner. Registration is the one classical
 * transaction; everything after it is hybrid.
 */
async function broadcast(
  account: UnifiedAccount,
  messages: Parameters<EthNativeSigner["sign"]>[0]["messages"],
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

export async function registerAccount(name: string): Promise<void> {
  const account = await loadAccount(name);
  const status = await fetchPqcStatus({ rest: TESTNET.rest, address: account.cosmos });
  if (status.registered) {
    const registered = status.pubkey;
    const bytes =
      typeof registered === "string"
        ? hexToBytes(registered.startsWith("0x") ? (registered as `0x${string}`) : `0x${registered}`)
        : registered;
    const ours = bytes !== undefined && Buffer.from(bytes).equals(Buffer.from(account.pqc.publicKey));
    console.log(`already registered ${account.cosmos} keyVerified=${String(ours)}`);
    return;
  }
  const proof = signProofOfPossession({
    chainId: CHAIN_ID,
    account: account.cosmos,
    algorithmId: 1,
    keypair: account.pqc,
  });
  const hash = await broadcast(
    account,
    [
      buildRegisterPqcKeyMsg(account.cosmos, {
        pqcKeypair: account.pqc,
        ecdsaPubkey: hexToBytes(account.publicKey as `0x${string}`),
        proofOfPossession: proof,
        keyType: "hybrid",
      }),
    ],
    "classical",
  );
  console.log(`registered ${account.cosmos} tx ${hash}`);
}

export async function openWindow(
  name: string,
  blocks: number,
  maxTxs: number,
  maxValue: string,
  allowedTargets: string[],
): Promise<void> {
  const account = await loadAccount(name);
  const hash = await broadcast(
    account,
    [
      openEvmWindowMsg({
        sender: account.cosmos,
        blocks,
        maxTxs,
        maxValue,
        allowedTargets: allowedTargets.length > 0 ? allowedTargets : undefined,
      }),
    ],
    "hybrid",
  );
  const window = await fetchEvmWindow({ rest: TESTNET.rest, address: account.cosmos });
  console.log(`opened ${hash} live=${String(window.live)} remainingTxs=${window.remainingTxs}`);
}

export async function closeWindow(name: string): Promise<void> {
  const account = await loadAccount(name);
  const hash = await broadcast(account, [closeEvmWindowMsg(account.cosmos)], "hybrid");
  console.log(`closed ${hash}`);
}

/** Open a scoped window, run `body`, and close the window even when `body` throws. */
export async function withWindow<T>(
  name: string,
  blocks: number,
  maxTxs: number,
  maxValue: string,
  allowedTargets: string[],
  body: () => Promise<T>,
): Promise<T> {
  await openWindow(name, blocks, maxTxs, maxValue, allowedTargets);
  try {
    return await body();
  } finally {
    await closeWindow(name);
  }
}

export async function printStatus(name: string): Promise<void> {
  const account = await loadAccount(name);
  const [status, window, balances] = await Promise.all([
    fetchPqcStatus({ rest: TESTNET.rest, address: account.cosmos }),
    fetchEvmWindow({ rest: TESTNET.rest, address: account.cosmos }),
    fetch(`${TESTNET.rest}/cosmos/bank/v1beta1/balances/${account.cosmos}`).then((response) => response.json()),
  ]);
  console.log(`qor ${account.cosmos}`);
  console.log(`evm ${account.evm}`);
  console.log(
    `pqc registered=${String(status.registered)} algorithm=${String(status.algorithmId ?? "-")} possession=${String(status.possessionProven)}`,
  );
  console.log(
    `window found=${String(window.found)} live=${String(window.live)} remainingTxs=${String(window.remainingTxs)}`,
  );
  console.log(`balances ${JSON.stringify(balances)}`);
}

export function registerKem(): never {
  throw new Error(
    "register-kem is not wired yet. Publishing a key needs an ML-KEM-1024 derivation, and this kit will not publish an ML-DSA key in its place.",
  );
}
