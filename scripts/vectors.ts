import { mkdirSync, writeFileSync } from "node:fs";
import { keccak256, toBytes, type Hex } from "viem";
import { encodeAuthMessage } from "../src/ts/pqauth.js";
import { anyAction, quorumAction, setMembersArgsHash } from "../src/ts/quorum.js";
import { encodeInvoice } from "../src/ts/vendor.js";

const action = keccak256(toBytes("haven.vectors.action"));
const argsHash = keccak256(toBytes("haven.vectors.args"));

const auth = {
  chainId: 9800n,
  contract: "0x1111111111111111111111111111111111111111",
  signer: "0x2222222222222222222222222222222222222222",
  action,
  nonce: 0n,
  deadline: 1_700_003_600n,
  argsHash,
} as const;

const invoice = {
  chainId: 9800n,
  gate: "0x3333333333333333333333333333333333333333",
  vendor: "0x4444444444444444444444444444444444444444",
  payee: "0x5555555555555555555555555555555555555555",
  token: "0x97143B771D34ddb9130b807b135Ae675A5a963CA",
  amount: 1_000_000n,
  invoiceId: keccak256(toBytes("invoice-1")),
  dueDate: 1_700_604_800n,
  memoHash: keccak256(toBytes("memo")),
} as const;

const setMembers = {
  members: [
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "0xcccccccccccccccccccccccccccccccccccccccc",
  ],
  threshold: 2,
} as const;

function jsonHex(value: bigint | Hex | string): string {
  return typeof value === "bigint" ? value.toString() : value;
}

const document = {
  action,
  quorumAction: quorumAction(action),
  anyAction: anyAction(action),
  setMembers: {
    members: setMembers.members,
    threshold: setMembers.threshold,
    argsHash: setMembersArgsHash(setMembers.members, setMembers.threshold),
  },
  auth: {
    chainId: jsonHex(auth.chainId),
    contract: auth.contract,
    signer: auth.signer,
    action: auth.action,
    nonce: jsonHex(auth.nonce),
    deadline: jsonHex(auth.deadline),
    argsHash: auth.argsHash,
    message: encodeAuthMessage(auth),
  },
  invoice: {
    chainId: jsonHex(invoice.chainId),
    gate: invoice.gate,
    vendor: invoice.vendor,
    payee: invoice.payee,
    token: invoice.token,
    amount: jsonHex(invoice.amount),
    invoiceId: invoice.invoiceId,
    dueDate: jsonHex(invoice.dueDate),
    memoHash: invoice.memoHash,
    message: encodeInvoice(invoice),
  },
};

mkdirSync("vectors", { recursive: true });
writeFileSync("vectors/messages.json", `${JSON.stringify(document, null, 2)}\n`);
console.log("wrote vectors/messages.json");
