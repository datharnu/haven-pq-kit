import { mkdirSync, writeFileSync } from "node:fs";
import {
  REGISTER_KEM_KEY_TYPE_URL,
  buildRegisterPqcKeyMsg,
  fetchPqcStatus,
  signProofOfPossession,
  validateKemPublicKey,
} from "@qorechain/sdk";
import { ALGORITHM_ML_KEM_1024, signRecipientCard, validateMlkemPublicKey, type RecipientCard } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { classicalKeyFromPrivate } from "@qorechain/qoresign";
import { hexToBytes, type Hex } from "viem";
import { kemKeySha3 } from "../src/ts/keydir.js";
import { TESTNET } from "../src/ts/network.js";
import { CHAIN_ID, broadcast, loadAccount, loadSealKeys } from "./accounts.js";

function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  return a !== undefined && a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function asBytes(value: string | Uint8Array | undefined): Uint8Array | undefined {
  if (value === undefined || value instanceof Uint8Array) return value;
  return hexToBytes((value.startsWith("0x") ? value : `0x${value}`) as Hex);
}

/** ML-DSA-87 registration with proof of possession. The one classically signed transaction. */
export async function registerMlDsa(name: string): Promise<void> {
  const account = await loadAccount(name);
  const status = await fetchPqcStatus({ rest: TESTNET.rest, address: account.cosmos });
  if (status.registered) {
    const ours = sameBytes(asBytes(status.pubkey), account.pqc.publicKey);
    if (!ours) throw new Error(`${account.cosmos} already has a different ML-DSA key; this script does not rotate keys`);
    console.log(`ml-dsa already registered ${account.cosmos}`);
    return;
  }
  const proof = signProofOfPossession({ chainId: CHAIN_ID, account: account.cosmos, algorithmId: 1, keypair: account.pqc });
  const hash = await broadcast(
    account,
    [
      buildRegisterPqcKeyMsg(account.cosmos, {
        pqcKeypair: account.pqc,
        ecdsaPubkey: hexToBytes(account.publicKey as Hex),
        proofOfPossession: proof,
        keyType: "hybrid",
      }),
    ],
    "classical",
  );
  console.log(`ml-dsa registered ${account.cosmos} tx ${hash}`);
}

/**
 * Publish the account's ML-KEM-1024 key (hybrid signed) and write its recipient card:
 * the key's SHA3-256 and an X25519 key, signed with the account's classical and
 * ML-DSA-87 keys. Readers accept the KEM key only through that card.
 * A different key already on chain is replaced only with `replace`.
 */
export async function registerKem(name: string, options: { replace: boolean }): Promise<RecipientCard> {
  const account = await loadAccount(name);
  const keys = loadSealKeys(name);
  validateMlkemPublicKey(keys.mlkemPublicKey);
  validateKemPublicKey(keys.mlkemPublicKey, ALGORITHM_ML_KEM_1024);
  const current = await fetchKemKey({ rest: TESTNET.rest, address: account.cosmos });
  if (current.registered && sameBytes(current.publicKey, keys.mlkemPublicKey)) {
    console.log(`ml-kem already published ${account.cosmos}`);
  } else {
    if (current.registered && !options.replace) {
      throw new Error(`${account.cosmos} already publishes a different KEM key. Pass --replace to overwrite it.`);
    }
    const hash = await broadcast(
      account,
      [
        {
          typeUrl: REGISTER_KEM_KEY_TYPE_URL,
          value: { sender: account.cosmos, algorithmId: ALGORITHM_ML_KEM_1024, publicKey: keys.mlkemPublicKey },
        },
      ],
      "hybrid",
    );
    console.log(`ml-kem published ${account.cosmos} tx ${hash}`);
  }
  const card = signRecipientCard({
    chainId: CHAIN_ID,
    address: account.cosmos,
    keys,
    classicalKey: classicalKeyFromPrivate(hexToBytes(account.privateKey as Hex), "eth_secp256k1"),
    pqKey: { secretKey: account.pqc.secretKey },
  });
  mkdirSync("cards", { recursive: true });
  const path = `cards/${account.cosmos}.json`;
  writeFileSync(path, `${JSON.stringify(card, null, 2)}\n`);
  console.log(`card ${path} mlkemKeySha3 ${kemKeySha3(keys.mlkemPublicKey)}`);
  return card;
}
