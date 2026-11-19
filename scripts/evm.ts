import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TESTNET, qorechainDiana } from "../src/ts/network.js";

/** Send one EVM transaction using the node's own gas estimate. The account needs a live window. */
export async function sendEvm(opts: { privateKey: Hex; to: Address; data?: Hex; value?: bigint }): Promise<Hex> {
  const account = privateKeyToAccount(opts.privateKey);
  const transport = http(TESTNET.evmRpc);
  const publicClient = createPublicClient({ chain: qorechainDiana, transport });
  const wallet = createWalletClient({ account, chain: qorechainDiana, transport });
  const gas = await publicClient.estimateGas({
    account,
    to: opts.to,
    data: opts.data ?? "0x",
    value: opts.value ?? 0n,
  });
  return wallet.sendTransaction({
    to: opts.to,
    data: opts.data ?? "0x",
    value: opts.value ?? 0n,
    gas,
  });
}
