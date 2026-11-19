import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { encodeAuthMessage } from "../src/ts/pqauth.js";
import { anyAction, assertAscending, quorumAction } from "../src/ts/quorum.js";
import { encodeInvoice } from "../src/ts/vendor.js";

const file = JSON.parse(readFileSync(new URL("../vectors/messages.json", import.meta.url), "utf8")) as {
  action: `0x${string}`;
  quorumAction: string;
  anyAction: string;
  auth: {
    chainId: string;
    contract: `0x${string}`;
    signer: `0x${string}`;
    action: `0x${string}`;
    nonce: string;
    deadline: string;
    argsHash: `0x${string}`;
    message: string;
  };
  invoice: {
    chainId: string;
    gate: `0x${string}`;
    vendor: `0x${string}`;
    payee: `0x${string}`;
    token: `0x${string}`;
    amount: string;
    invoiceId: `0x${string}`;
    dueDate: string;
    memoHash: `0x${string}`;
    message: string;
  };
};

test("auth message matches the committed vector", () => {
  const message = encodeAuthMessage({
    chainId: BigInt(file.auth.chainId),
    contract: file.auth.contract,
    signer: file.auth.signer,
    action: file.auth.action,
    nonce: BigInt(file.auth.nonce),
    deadline: BigInt(file.auth.deadline),
    argsHash: file.auth.argsHash,
  });
  assert.equal(message, file.auth.message);
  assert.equal((message.length - 2) / 2, 256);
});

test("quorum domains match the committed vector", () => {
  assert.equal(quorumAction(file.action), file.quorumAction);
  assert.equal(anyAction(file.action), file.anyAction);
  assert.notEqual(file.quorumAction, file.anyAction);
});

test("invoice message matches the committed vector", () => {
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
  assert.equal(message, file.invoice.message);
});

test("ascending signers are required", () => {
  assert.doesNotThrow(() =>
    assertAscending([
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ]),
  );
  assert.throws(() =>
    assertAscending([
      "0x2222222222222222222222222222222222222222",
      "0x1111111111111111111111111111111111111111",
    ]),
  );
});
