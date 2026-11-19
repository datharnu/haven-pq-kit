import { pqcSign } from "@qorechain/sdk";
import { encodeAbiParameters, hexToBytes, keccak256, toBytes, toHex, type Address, type Hex } from "viem";

/** Domain string hashed by `PqAuth.DOMAIN`. */
export const AUTH_DOMAIN_STRING = "haven-pq-kit.PqAuth.v1";
export const AUTH_DOMAIN: Hex = keccak256(toBytes(AUTH_DOMAIN_STRING));

export type AuthFields = {
  chainId: bigint;
  contract: Address;
  signer: Address;
  action: Hex;
  nonce: bigint;
  deadline: bigint;
  argsHash: Hex;
};

/** The exact bytes `PqAuth.encodeMessage` signs. Eight 32-byte words. */
export function encodeAuthMessage(fields: AuthFields): Hex {
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [
      AUTH_DOMAIN,
      fields.chainId,
      fields.contract,
      fields.signer,
      fields.action,
      fields.nonce,
      fields.deadline,
      fields.argsHash,
    ],
  );
}

export type SignedAuth = { message: Hex; signature: Hex };

/** ML-DSA-87 over the `PqAuth` message. Pass the result's `signature` to `authorize`. */
export function signAuth(secretKey: Uint8Array, fields: AuthFields): SignedAuth {
  const message = encodeAuthMessage(fields);
  return { message, signature: toHex(pqcSign(secretKey, hexToBytes(message))) };
}
