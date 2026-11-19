import { createPublicClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { qorToEvm } from "@qorechain/sdk";
import { loadAccount } from "./accounts.js";
import { withWindow } from "./window.js";
import { sendEvm } from "./evm.js";
import { readMlDsaKey } from "../src/ts/keydir.js";
import { PQC_STATUS, TESTNET, qorechainDiana } from "../src/ts/network.js";

/** The account that funded the spike. A public address; the transfer goes back there. */
const PAYEE = "qor10hr66l9zfsgkhp7jfpkpsav44nrdx6n8wdzett";

const account = await loadAccount("spike");
const client = createPublicClient({ chain: qorechainDiana, transport: http(TESTNET.evmRpc) });
const key = await readMlDsaKey(client, account.evm as `0x${string}`);
const raw = await client.call({
  to: PQC_STATUS,
  data: encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "pqcKeyStatus",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [],
      },
    ],
    functionName: "pqcKeyStatus",
    args: [account.evm as `0x${string}`],
  }),
});
console.log(
  JSON.stringify({
    registered: key.registered,
    algorithmId: Number(key.algorithmId),
    pubkeyBytes: (key.pubkey.length - 2) / 2,
    possessionProven: key.possessionProven,
    statusCallBytes: ((raw.data?.length ?? 2) - 2) / 2,
  }),
);

const target = qorToEvm(PAYEE) as `0x${string}`;
await withWindow("spike", { txs: 3, maxValueUqor: "1000000", targets: [target], blocks: 200 }, async () => {
  const sent = await sendEvm({
    privateKey: account.privateKey as `0x${string}`,
    to: target,
    value: 10n ** 16n,
  });
  console.log(`sent ${sent}`);

  const signer = privateKeyToAccount(account.privateKey as `0x${string}`);
  const nonce = await client.getTransactionCount({ address: signer.address, blockTag: "pending" });
  const gasPrice = await client.getGasPrice();
  const signed = await signer.signTransaction({
    chainId: qorechainDiana.id,
    nonce,
    gas: 100_000n,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
    data: "0x600160005260206000f3",
    type: "eip1559",
  });
  try {
    const created = await client.sendRawTransaction({ serializedTransaction: signed });
    console.log(`create-refused false tx ${created}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`create-refused true ${message.split("\n")[0]}`);
  }
});
