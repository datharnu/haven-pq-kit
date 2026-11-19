import { readFileSync } from "node:fs";
import { encodeAbiParameters, encodeFunctionData, toHex, type Address, type Hex } from "viem";
import { generatePqcKeypair, pqcSign, pqcVerify, ML_DSA_87_PUBLIC_KEY_LENGTH, ML_DSA_87_SIGNATURE_LENGTH } from "@qorechain/sdk";
import { PQC_VERIFY, SIG_LEN } from "../src/ts/network.js";
import { readMlDsaKey, testnetClient, verifyOnChain } from "../src/ts/keydir.js";

const EMPTY = "0x0000000000000000000000000000000000000001" as const;

function bytesToHex(bytes: Uint8Array): Hex {
  return toHex(bytes);
}

async function main(): Promise<void> {
  const client = testnetClient();
  const empty = await readMlDsaKey(client, EMPTY);
  if (empty.registered || empty.possessionProven || empty.algorithmId !== 0 || empty.pubkey !== "0x") {
    throw new Error(`unexpected status for an account with no key: ${JSON.stringify(empty)}`);
  }

  const key = generatePqcKeypair();
  if (key.publicKey.length !== ML_DSA_87_PUBLIC_KEY_LENGTH) {
    throw new Error(`public key length ${key.publicKey.length}`);
  }
  const message = new Uint8Array(256).fill(0x11);
  const signature = pqcSign(key.secretKey, message);
  if (signature.length !== ML_DSA_87_SIGNATURE_LENGTH || signature.length !== SIG_LEN) {
    throw new Error(`signature length ${signature.length}`);
  }
  if (!pqcVerify(key.publicKey, message, signature)) {
    throw new Error("local ML-DSA-87 verification failed");
  }

  const pubkey = bytesToHex(key.publicKey);
  const sigHex = bytesToHex(signature);
  const messageHex = bytesToHex(message);
  const valid = await verifyOnChain(client, pubkey, sigHex, messageHex);
  const flipped = new Uint8Array(signature);
  flipped[flipped.length - 1] ^= 0x01;
  const invalid = await verifyOnChain(client, pubkey, bytesToHex(flipped), messageHex);
  if (valid !== true || invalid !== false) {
    throw new Error(`precompile verdicts valid=${String(valid)} flipped=${String(invalid)}`);
  }

  const data = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "pqcVerify",
        stateMutability: "view",
        inputs: [
          { name: "pubkey", type: "bytes" },
          { name: "signature", type: "bytes" },
          { name: "message", type: "bytes" },
        ],
        outputs: [{ name: "valid", type: "bool" }],
      },
    ],
    functionName: "pqcVerify",
    args: [pubkey, sigHex, messageHex],
  });
  let gas: string;
  try {
    gas = (await client.estimateGas({ to: PQC_VERIFY, data })).toString();
  } catch (error) {
    gas = `estimate failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const artifact = JSON.parse(readFileSync("out/PqAuthProbe.sol/PqAuthProbe.json", "utf8")) as {
    bytecode: { object: string };
  };
  const init = (artifact.bytecode.object +
    encodeAbiParameters([{ type: "address" }], [EMPTY]).slice(2)) as Hex;
  const created = await client.call({ data: init });
  const probe = created.data ?? "0x";

  const report = {
    network: "qorechain-diana",
    evmChainId: 9800,
    emptyAccount: EMPTY,
    emptyStatus: empty,
    localVerify: true,
    precompileValid: valid,
    precompileFlipped: invalid,
    signatureBytes: signature.length,
    publicKeyBytes: key.publicKey.length,
    messageBytes: message.length,
    estimateGas: gas,
    probeReturn: probe,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
