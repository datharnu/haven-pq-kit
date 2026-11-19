import { generatePqcKeypair, pqcVerify } from "@qorechain/sdk";
import { describe, expect, it } from "vitest";
import { hexToBytes, keccak256, toBytes, type Address } from "viem";
import { encodeAuthMessage, signAuth } from "../src/ts/pqauth.js";
import { anyAction, quorumAction, signAnyShare, signQuorumShares } from "../src/ts/quorum.js";

const fields = {
  chainId: 9800n,
  contract: "0x1111111111111111111111111111111111111111" as Address,
  signer: "0x2222222222222222222222222222222222222222" as Address,
  action: keccak256(toBytes("haven.test.action")),
  nonce: 7n,
  deadline: 1_700_003_600n,
  argsHash: keccak256(toBytes("haven.test.args")),
};

const key = generatePqcKeypair(new Uint8Array(32).fill(1));

describe("signAuth", () => {
  it("signs exactly the PqAuth message with a real ML-DSA-87 signature", () => {
    const signed = signAuth(key.secretKey, fields);
    expect(signed.message).toBe(encodeAuthMessage(fields));
    const signature = hexToBytes(signed.signature);
    expect(signature.length).toBe(4627);
    expect(pqcVerify(key.publicKey, hexToBytes(signed.message), signature)).toBe(true);
  });

  it("does not verify for any other field", () => {
    const signature = hexToBytes(signAuth(key.secretKey, fields).signature);
    for (const changed of [
      { ...fields, chainId: 9801n },
      { ...fields, nonce: 8n },
      { ...fields, deadline: fields.deadline + 1n },
      { ...fields, contract: "0x3333333333333333333333333333333333333333" as Address },
    ]) {
      expect(pqcVerify(key.publicKey, hexToBytes(encodeAuthMessage(changed)), signature)).toBe(false);
    }
  });

  it("is deterministic for the same key and message", () => {
    expect(signAuth(key.secretKey, fields).signature).toBe(signAuth(key.secretKey, fields).signature);
  });
});

describe("quorum shares", () => {
  const members = [
    { account: "0xcccccccccccccccccccccccccccccccccccccccc" as Address, key: generatePqcKeypair(new Uint8Array(32).fill(3)) },
    { account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address, key: generatePqcKeypair(new Uint8Array(32).fill(4)) },
  ];
  const { signer: _ignored, ...quorumFields } = fields;

  it("sorts signers ascending and signs quorumAction at the shared nonce", () => {
    const shares = signQuorumShares(
      members.map((member) => ({ account: member.account, secretKey: member.key.secretKey })),
      quorumFields,
    );
    expect(shares.who).toEqual([members[1].account, members[0].account]);
    shares.who.forEach((who, i) => {
      const member = members.find((m) => m.account === who)!;
      const message = encodeAuthMessage({ ...quorumFields, signer: who, action: quorumAction(fields.action) });
      expect(pqcVerify(member.key.publicKey, hexToBytes(message), hexToBytes(shares.signatures[i]))).toBe(true);
    });
  });

  it("a veto share is not a quorum share", () => {
    const member = members[0];
    const veto = signAnyShare({ account: member.account, secretKey: member.key.secretKey }, quorumFields);
    const asQuorum = encodeAuthMessage({ ...quorumFields, signer: member.account, action: quorumAction(fields.action) });
    const asVeto = encodeAuthMessage({ ...quorumFields, signer: member.account, action: anyAction(fields.action) });
    expect(pqcVerify(member.key.publicKey, hexToBytes(asVeto), hexToBytes(veto))).toBe(true);
    expect(pqcVerify(member.key.publicKey, hexToBytes(asQuorum), hexToBytes(veto))).toBe(false);
  });
});
