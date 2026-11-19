import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { encodeAuthMessage } from "../src/ts/pqauth.js";
import { anyAction, assertAscending, quorumAction, setMembersArgsHash } from "../src/ts/quorum.js";
import { encodeInvoice } from "../src/ts/vendor.js";

const file = JSON.parse(readFileSync(new URL("../vectors/messages.json", import.meta.url), "utf8")) as {
  action: Hex;
  quorumAction: Hex;
  anyAction: Hex;
  setMembers: { members: Address[]; threshold: number; argsHash: Hex };
  auth: {
    chainId: string;
    contract: Address;
    signer: Address;
    action: Hex;
    nonce: string;
    deadline: string;
    argsHash: Hex;
    message: Hex;
  };
  invoice: {
    chainId: string;
    gate: Address;
    vendor: Address;
    payee: Address;
    token: Address;
    amount: string;
    invoiceId: Hex;
    dueDate: string;
    memoHash: Hex;
    message: Hex;
  };
};

describe("vectors shared with Solidity", () => {
  it("auth message is the committed 256 bytes", () => {
    const message = encodeAuthMessage({
      chainId: BigInt(file.auth.chainId),
      contract: file.auth.contract,
      signer: file.auth.signer,
      action: file.auth.action,
      nonce: BigInt(file.auth.nonce),
      deadline: BigInt(file.auth.deadline),
      argsHash: file.auth.argsHash,
    });
    expect(message).toBe(file.auth.message);
    expect((message.length - 2) / 2).toBe(256);
  });

  it("quorum and veto domains differ and match", () => {
    expect(quorumAction(file.action)).toBe(file.quorumAction);
    expect(anyAction(file.action)).toBe(file.anyAction);
    expect(file.quorumAction).not.toBe(file.anyAction);
  });

  it("setMembers args hash matches", () => {
    expect(setMembersArgsHash(file.setMembers.members, file.setMembers.threshold)).toBe(file.setMembers.argsHash);
  });

  it("invoice message matches", () => {
    const message = encodeInvoice({
      chainId: BigInt(file.invoice.chainId),
      gate: file.invoice.gate,
      vendor: file.invoice.vendor,
      payee: file.invoice.payee,
      token: file.invoice.token,
      amount: BigInt(file.invoice.amount),
      invoiceId: file.invoice.invoiceId,
      dueDate: BigInt(file.invoice.dueDate),
      memoHash: file.invoice.memoHash,
    });
    expect(message).toBe(file.invoice.message);
  });
});

describe("signer order", () => {
  it("accepts strictly ascending signers", () => {
    expect(() =>
      assertAscending(["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"]),
    ).not.toThrow();
  });

  it("refuses descending or repeated signers", () => {
    expect(() =>
      assertAscending(["0x2222222222222222222222222222222222222222", "0x1111111111111111111111111111111111111111"]),
    ).toThrow(/ascending/);
    expect(() =>
      assertAscending(["0x1111111111111111111111111111111111111111", "0x1111111111111111111111111111111111111111"]),
    ).toThrow(/ascending/);
  });
});
