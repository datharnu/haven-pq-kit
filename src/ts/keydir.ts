import { sha3_256 } from "@noble/hashes/sha3.js";
import {
  createPublicClient,
  decodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { fetchKemKey, type KemKey } from "@qorechain/sdk";
import { qorechainDiana, ML_DSA_87, PQC_STATUS, PQC_VERIFY, PUBKEY_LEN, SIG_LEN, TESTNET } from "./network.js";

const statusAbi = [
  {
    type: "function",
    name: "pqcKeyStatus",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "algorithmId", type: "uint8" },
      { name: "pubkey", type: "bytes" },
      { name: "possessionProven", type: "bool" },
    ],
  },
] as const;

const verifyAbi = [
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
] as const;

export type MlDsaKey = {
  registered: boolean;
  algorithmId: number;
  pubkey: Hex;
  possessionProven: boolean;
};

export class PrecompileUnavailable extends Error {
  constructor(message = "PQC precompile returned empty data") {
    super(message);
    this.name = "PrecompileUnavailable";
  }
}

export function testnetClient(): PublicClient {
  return createPublicClient({ chain: qorechainDiana, transport: http(TESTNET.evmRpc) });
}

/** Read the live ML-DSA key. Empty return data is a failure, never "no key". */
export async function readMlDsaKey(client: PublicClient, account: Address): Promise<MlDsaKey> {
  const data = encodeFunctionData({ abi: statusAbi, functionName: "pqcKeyStatus", args: [account] });
  const raw = await client.call({ to: PQC_STATUS, data });
  if (!raw.data || raw.data === "0x" || raw.data.length < 2 + 64 * 2) {
    throw new PrecompileUnavailable();
  }
  const [registered, algorithmId, pubkey, possessionProven] = decodeAbiParameters(statusAbi[0].outputs, raw.data);
  return { registered, algorithmId, pubkey, possessionProven };
}

/** A registered, possession-proven ML-DSA-87 key of the right length, or an error naming which check failed. */
export function requireMlDsaKey(key: MlDsaKey): void {
  if (!key.registered) throw new Error("no ML-DSA key is registered");
  if (key.algorithmId !== ML_DSA_87) throw new Error(`algorithm ${key.algorithmId} is not ML-DSA-87`);
  if (!key.possessionProven) throw new Error("the key was registered without a proof of possession");
  const length = (key.pubkey.length - 2) / 2;
  if (length !== PUBKEY_LEN) throw new Error(`public key is ${length} bytes, not ${PUBKEY_LEN}`);
}

export async function verifyOnChain(
  client: PublicClient,
  pubkey: Hex,
  signature: Hex,
  message: Hex,
): Promise<boolean> {
  const data = encodeFunctionData({
    abi: verifyAbi,
    functionName: "pqcVerify",
    args: [pubkey, signature, message],
  });
  const raw = await client.call({ to: PQC_VERIFY, data });
  if (!raw.data || raw.data === "0x") throw new PrecompileUnavailable("pqcVerify returned empty data");
  const [valid] = decodeAbiParameters(verifyAbi[0].outputs, raw.data);
  return valid;
}

export async function readKemKey(rest: string, address: string): Promise<KemKey | undefined> {
  const result = await fetchKemKey({ rest, address });
  return result.key;
}

/** SHA3-256 (NIST, not keccak) of a KEM public key. Apps bind this hash with an ML-DSA signature. */
export function kemKeySha3(publicKey: Uint8Array): Hex {
  const digest = sha3_256(publicKey);
  let hex = "0x";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex as Hex;
}

export function pubkeyFingerprint(pubkey: Hex): Hex {
  return keccak256(pubkey);
}

export { SIG_LEN };
