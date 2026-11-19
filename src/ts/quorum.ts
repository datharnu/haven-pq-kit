import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";

export const QUORUM_DOMAIN_STRING = "haven-pq-kit.PqQuorum.quorum.v1";
export const ANY_DOMAIN_STRING = "haven-pq-kit.PqQuorum.any.v1";
export const SET_ACTION_STRING = "haven-pq-kit.PqQuorum.setMembers";

export const QUORUM_DOMAIN: Hex = keccak256(toBytes(QUORUM_DOMAIN_STRING));
export const ANY_DOMAIN: Hex = keccak256(toBytes(ANY_DOMAIN_STRING));
export const SET_ACTION: Hex = keccak256(toBytes(SET_ACTION_STRING));

/** The action a quorum share signs. A plain `PqAuth` action cannot be reused as one. */
export function quorumAction(action: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [QUORUM_DOMAIN, action]));
}

/** The action a single member signs for a veto. A quorum share cannot be reused as one. */
export function anyAction(action: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [ANY_DOMAIN, action]));
}

/** The contract requires this order, which also proves the signers are distinct. */
export function assertAscending(signers: readonly Address[]): void {
  for (let i = 1; i < signers.length; i++) {
    if (signers[i].toLowerCase() <= signers[i - 1].toLowerCase()) {
      throw new Error(`signers must be strictly ascending: ${signers[i - 1]} then ${signers[i]}`);
    }
  }
}
