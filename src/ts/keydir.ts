import { sha3_256 } from "@noble/hashes/sha3.js";
import {
  createPublicClient,
  decodeAbiParameters,
  encodeFunctionData,
  hexToBytes,
  http,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { fetchKemKey, qorToEvm, type KemKey } from "@qorechain/sdk";
import { verifyRecipientCard, type RecipientCard, type SealRecipient } from "@qorechain/qoreseal";
import { fetchMlkemPublicKey } from "@qorechain/qoreseal/network";
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

export class KemKeyRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KemKeyRefused";
  }
}

export type VerifiedKemKey = {
  address: string;
  mlkemPublicKey: Uint8Array;
  mlkemKeySha3: Hex;
  recipient: SealRecipient;
};

/**
 * The account's ML-KEM-1024 key, accepted only when the owner's recipient card names
 * its SHA3-256 and the card's ML-DSA-87 signature verifies under the key read from
 * `pqcKeyStatus`. The REST answer alone is never trusted: a lying node or proxy could
 * swap the KEM key, but it cannot sign a card for it.
 */
export async function readVerifiedKemKey(opts: {
  client: PublicClient;
  rest: string;
  chainId: string;
  address: string;
  card: RecipientCard;
  fetch?: typeof fetch;
}): Promise<VerifiedKemKey> {
  if (opts.card.address !== opts.address) {
    throw new KemKeyRefused(`card is for ${opts.card.address}, not ${opts.address}`);
  }
  if (opts.card.chainId !== opts.chainId) {
    throw new KemKeyRefused(`card is for chain ${opts.card.chainId}, not ${opts.chainId}`);
  }
  const evm = (opts.address.startsWith("0x") ? opts.address : qorToEvm(opts.address)) as Address;
  const mlDsa = await readMlDsaKey(opts.client, evm);
  requireMlDsaKey(mlDsa);
  const mlkemPublicKey = await fetchMlkemPublicKey({ rest: opts.rest, address: opts.address, fetch: opts.fetch });
  const digest = kemKeySha3(mlkemPublicKey);
  if (digest.slice(2).toLowerCase() !== opts.card.mlkemKeySha3.replace(/^0x/, "").toLowerCase()) {
    throw new KemKeyRefused("the registered KEM key does not match the hash the owner signed");
  }
  let recipient: SealRecipient;
  try {
    recipient = verifyRecipientCard({
      card: opts.card,
      chainId: opts.chainId,
      address: opts.address,
      pqPublicKey: hexToBytes(mlDsa.pubkey),
      mlkemPublicKey,
    });
  } catch (error) {
    throw new KemKeyRefused(`recipient card refused: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { address: opts.address, mlkemPublicKey, mlkemKeySha3: digest, recipient };
}

export { SIG_LEN };
