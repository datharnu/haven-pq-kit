import { readFileSync } from "node:fs";
import { TESTNET } from "../src/ts/network.js";

type Entry = { hash: string; kind: "native" | "evm"; note?: string };

type Report = { hash: string; ok: boolean; detail: string };

function normalise(hash: string): string {
  return hash.startsWith("0x") || hash.startsWith("0X") ? hash.slice(2) : hash;
}

async function checkNative(hash: string): Promise<Report> {
  const response = await fetch(`${TESTNET.rest}/cosmos/tx/v1beta1/txs/${normalise(hash).toUpperCase()}`);
  if (!response.ok) return { hash, ok: false, detail: `HTTP ${response.status}` };
  const body = (await response.json()) as {
    tx_response?: { code?: number; events?: { type: string; attributes?: { key: string; value: string }[] }[] };
  };
  const code = body.tx_response?.code;
  const verified = body.tx_response?.events?.some(
    (event) =>
      event.type === "pqc_hybrid_verify" &&
      event.attributes?.some((attribute) => attribute.key === "status" && attribute.value === "verified"),
  );
  return {
    hash,
    ok: code === 0 && verified === true,
    detail: `code=${String(code)} ml-dsa=${String(verified === true)}`,
  };
}

async function checkEvm(hash: string): Promise<Report> {
  const response = await fetch(TESTNET.evmRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [hash.startsWith("0x") ? hash : `0x${hash}`],
    }),
  });
  const body = (await response.json()) as { result?: { status?: string } | null };
  const status = body.result?.status;
  return { hash, ok: status === "0x1", detail: `status=${String(status)}` };
}

export async function checkEvidence(path: string): Promise<number> {
  const file = JSON.parse(readFileSync(path, "utf8")) as { transactions?: Entry[] };
  const entries = file.transactions ?? [];
  if (entries.length === 0) {
    console.log("no transactions recorded");
    return 0;
  }
  let failed = 0;
  for (const entry of entries) {
    const report = entry.kind === "native" ? await checkNative(entry.hash) : await checkEvm(entry.hash);
    console.log(`${report.ok ? "ok" : "FAIL"} ${entry.kind} ${entry.hash} ${report.detail}`);
    if (!report.ok) failed += 1;
  }
  return failed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? "deployments/evidence.json";
  checkEvidence(path)
    .then((failed) => process.exit(failed === 0 ? 0 : 1))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
