import { deriveUnifiedAccount, generateMnemonic, type UnifiedAccount } from "@qorechain/sdk";
import { deriveSealKeys, generateSealKeys, signRecipientCard, type RecipientCard, type SealKeyPair } from "@qorechain/qoreseal";
import { classicalKeyFromPrivate } from "@qorechain/qoresign";
import { beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, hexToBytes, toHex, type Hex, type PublicClient } from "viem";
import { KemKeyRefused, PrecompileUnavailable, readVerifiedKemKey } from "../src/ts/keydir.js";

const CHAIN_ID = "qorechain-diana";
const REST = "https://rest.invalid";

function statusClient(pubkey: Uint8Array | "empty"): PublicClient {
  const data =
    pubkey === "empty"
      ? "0x"
      : encodeAbiParameters(
          [{ type: "bool" }, { type: "uint8" }, { type: "bytes" }, { type: "bool" }],
          [true, 1, toHex(pubkey), true],
        );
  return { call: async () => ({ data: data as Hex }) } as unknown as PublicClient;
}

function kemFetch(address: string, publicKey: Uint8Array): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        found: true,
        key: {
          address,
          algorithm_id: 2,
          algorithm_name: "ml-kem-1024",
          public_key: Buffer.from(publicKey).toString("base64"),
          registered_height: "1",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
}

function card(account: UnifiedAccount, keys: SealKeyPair, chainId = CHAIN_ID): RecipientCard {
  return signRecipientCard({
    chainId,
    address: account.cosmos,
    keys,
    classicalKey: classicalKeyFromPrivate(hexToBytes(account.privateKey as Hex), "eth_secp256k1"),
    pqKey: { secretKey: account.pqc.secretKey },
  });
}

let owner: UnifiedAccount;
let other: UnifiedAccount;
let keys: SealKeyPair;

beforeAll(async () => {
  const mnemonic = generateMnemonic(256);
  owner = await deriveUnifiedAccount(mnemonic);
  other = await deriveUnifiedAccount(generateMnemonic(256));
  keys = deriveSealKeys({ mnemonic });
});

describe("readVerifiedKemKey", () => {
  it("accepts the registered key the owner's card names", async () => {
    const verified = await readVerifiedKemKey({
      client: statusClient(owner.pqc.publicKey),
      rest: REST,
      chainId: CHAIN_ID,
      address: owner.cosmos,
      card: card(owner, keys),
      fetch: kemFetch(owner.cosmos, keys.mlkemPublicKey),
    });
    expect(verified.mlkemPublicKey).toEqual(keys.mlkemPublicKey);
    expect(verified.recipient.x25519PublicKey).toEqual(keys.x25519PublicKey);
  });

  it("refuses a KEM key a lying node swapped in", async () => {
    await expect(
      readVerifiedKemKey({
        client: statusClient(owner.pqc.publicKey),
        rest: REST,
        chainId: CHAIN_ID,
        address: owner.cosmos,
        card: card(owner, keys),
        fetch: kemFetch(owner.cosmos, generateSealKeys().mlkemPublicKey),
      }),
    ).rejects.toThrow(KemKeyRefused);
  });

  it("refuses a card the on-chain ML-DSA key did not sign", async () => {
    await expect(
      readVerifiedKemKey({
        client: statusClient(other.pqc.publicKey),
        rest: REST,
        chainId: CHAIN_ID,
        address: owner.cosmos,
        card: card(owner, keys),
        fetch: kemFetch(owner.cosmos, keys.mlkemPublicKey),
      }),
    ).rejects.toThrow(KemKeyRefused);
  });

  it("refuses a card made for another chain or another account", async () => {
    const base = {
      client: statusClient(owner.pqc.publicKey),
      rest: REST,
      chainId: CHAIN_ID,
      fetch: kemFetch(owner.cosmos, keys.mlkemPublicKey),
    };
    await expect(readVerifiedKemKey({ ...base, address: owner.cosmos, card: card(owner, keys, "qorechain-vladi") })).rejects.toThrow(
      KemKeyRefused,
    );
    await expect(readVerifiedKemKey({ ...base, address: other.cosmos, card: card(owner, keys) })).rejects.toThrow(KemKeyRefused);
  });

  it("fails closed when the status precompile returns nothing", async () => {
    await expect(
      readVerifiedKemKey({
        client: statusClient("empty"),
        rest: REST,
        chainId: CHAIN_ID,
        address: owner.cosmos,
        card: card(owner, keys),
        fetch: kemFetch(owner.cosmos, keys.mlkemPublicKey),
      }),
    ).rejects.toThrow(PrecompileUnavailable);
  });
});
