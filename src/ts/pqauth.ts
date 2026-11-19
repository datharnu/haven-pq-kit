import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";

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
