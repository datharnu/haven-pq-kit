import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";
import { signAuth, type AuthFields } from "./pqauth.js";

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

/** The `argsHash` that `PqQuorum.setMembers` signs over. */
export function setMembersArgsHash(next: readonly Address[], threshold: number): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "address[]" }, { type: "uint8" }], [next as Address[], threshold]),
  );
}

/** The contract requires this order, which also proves the signers are distinct. */
export function assertAscending(signers: readonly Address[]): void {
  for (let i = 1; i < signers.length; i++) {
    if (signers[i].toLowerCase() <= signers[i - 1].toLowerCase()) {
      throw new Error(`signers must be strictly ascending: ${signers[i - 1]} then ${signers[i]}`);
    }
  }
}

export type QuorumFields = Omit<AuthFields, "signer">;
export type ShareSigner = { account: Address; secretKey: Uint8Array };
export type QuorumShares = { who: Address[]; signatures: Hex[] };

/**
 * One share per signer over `quorumAction(action)` at the set's shared nonce, sorted
 * the way `authorizeQuorum` reads them.
 */
export function signQuorumShares(signers: readonly ShareSigner[], fields: QuorumFields): QuorumShares {
  const sorted = [...signers].sort((a, b) => (a.account.toLowerCase() < b.account.toLowerCase() ? -1 : 1));
  const who = sorted.map((signer) => signer.account);
  assertAscending(who);
  const signatures = sorted.map(
    (signer) =>
      signAuth(signer.secretKey, { ...fields, signer: signer.account, action: quorumAction(fields.action) }).signature,
  );
  return { who, signatures };
}

/** A single member's veto signature over `anyAction(action)`. */
export function signAnyShare(signer: ShareSigner, fields: QuorumFields): Hex {
  return signAuth(signer.secretKey, { ...fields, signer: signer.account, action: anyAction(fields.action) }).signature;
}
