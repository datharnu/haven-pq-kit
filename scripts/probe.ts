import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  hexToBytes,
  keccak256,
  toBytes,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePqcKeypair, pqcSign, pqcVerify, ML_DSA_87_PUBLIC_KEY_LENGTH, ML_DSA_87_SIGNATURE_LENGTH } from "@qorechain/sdk";
import { PQC_VERIFY, SIG_LEN, qorechainDiana } from "../src/ts/network.js";
import { readMlDsaKey, requireMlDsaKey, testnetClient, verifyOnChain } from "../src/ts/keydir.js";
import { signAuth } from "../src/ts/pqauth.js";
import { loadAccount } from "./accounts.js";

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

  const live = await runPqAuth(client);

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
    pqAuth: live,
  };
  console.log(JSON.stringify(report, null, 2));
}

/**
 * PqAuth itself, live: a target contract created inside an eth_call inits on the
 * registered account, refuses a flipped signature, accepts the real one, refuses its
 * replay, and refuses to init on an account with no key.
 */
async function runPqAuth(client: PublicClient) {
  const name = process.env.PROBE_ACCOUNT ?? "spike";
  const account = await loadAccount(name);
  const from = account.evm as Address;
  const status = await readMlDsaKey(client, from);
  requireMlDsaKey(status);

  const nonce = await client.getTransactionCount({ address: from, blockTag: "latest" });
  const probeAddress = getContractAddress({ from, nonce: BigInt(nonce) });
  const target = getContractAddress({ from: probeAddress, nonce: 1n });
  const block = await client.getBlock({ blockTag: "latest" });
  const deadline = block.timestamp + 3600n;
  const action = keccak256(toBytes("haven-pq-kit.probe.action"));
  const argsHash = keccak256(toBytes("haven-pq-kit.probe.args"));
  const signed = signAuth(account.pqc.secretKey, {
    chainId: BigInt(qorechainDiana.id),
    contract: target,
    signer: from,
    action,
    nonce: 0n,
    deadline,
    argsHash,
  });
  const bad = hexToBytes(signed.signature);
  bad[bad.length - 1] ^= 0x01;

  const liveArtifact = JSON.parse(readFileSync("out/PqAuthLiveProbe.sol/PqAuthLiveProbe.json", "utf8")) as {
    bytecode: { object: Hex };
  };
  const args = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes" },
      { type: "bytes" },
    ],
    [from, EMPTY, action, argsHash, deadline, signed.signature, toHex(bad)],
  );
  const result = await client.call({
    account: from,
    data: (liveArtifact.bytecode.object + args.slice(2)) as Hex,
    gas: 15_000_000n,
    blockTag: "latest",
  });
  if (!result.data || result.data === "0x") throw new Error("PqAuthLiveProbe returned no data");
  const [returnedTarget, nonceAfter, badError, replayError, noKeyError] = decodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "bytes4" }, { type: "bytes4" }, { type: "bytes4" }],
    result.data,
  );
  const expected = {
    signatureInvalid: toFunctionSelector("SignatureInvalid()"),
    keyNotRegistered: toFunctionSelector("KeyNotRegistered(address)"),
  };
  const report = {
    account: from,
    target: returnedTarget,
    predictedTarget: target,
    nonceAfter: nonceAfter.toString(),
    flippedSignature: badError,
    replay: replayError,
    accountWithoutKey: noKeyError,
  };
  const ok =
    returnedTarget.toLowerCase() === target.toLowerCase() &&
    nonceAfter === 1n &&
    badError === expected.signatureInvalid &&
    replayError === expected.signatureInvalid &&
    noKeyError === expected.keyNotRegistered;
  if (!ok) throw new Error(`PqAuth live probe failed: ${JSON.stringify(report)}`);
  return { ...report, passed: true };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
