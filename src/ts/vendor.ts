import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";

export const VENDOR_DOMAIN_STRING = "haven-pq-kit.VendorSig.v1";
export const VENDOR_DOMAIN: Hex = keccak256(toBytes(VENDOR_DOMAIN_STRING));

export type InvoiceFields = {
  chainId: bigint;
  gate: Address;
  vendor: Address;
  payee: Address;
  token: Address;
  amount: bigint;
  invoiceId: Hex;
  dueDate: bigint;
  memoHash: Hex;
};

/** The exact bytes `VendorSig.encode` signs. The caller must remember `invoiceId` to stop a replay. */
export function encodeInvoice(invoice: InvoiceFields): Hex {
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [
      VENDOR_DOMAIN,
      invoice.chainId,
      invoice.gate,
      invoice.vendor,
      invoice.payee,
      invoice.token,
      invoice.amount,
      invoice.invoiceId,
      invoice.dueDate,
      invoice.memoHash,
    ],
  );
}
