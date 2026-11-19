import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TOOLS, toolContext } from "@qorechain/mcp";

/**
 * What a recorded transaction must show:
 * - `pqc`: hybrid signed, and the ML-DSA-87 layer verifies against the registered key.
 * - `enrollment`: the one classically signed ML-DSA registration.
 * - `classical`: an EVM-lane transaction. Its protection is the window that admitted it, recorded separately.
 */
type Tier = "pqc" | "enrollment" | "classical";

type Entry = { hash: string; tier: Tier; note: string };
type DeploymentFile = { network: string; transactions: Entry[] };

type Row = { file: string; hash: string; tier: Tier; ok: boolean; detail: string; note: string };

type TransactionResult = { success: boolean; failure?: unknown; execution_failures?: unknown[] };
type PqStatusResult = {
  transaction_status: {
    tier: string;
    has_exactly_one_pqc_layer: boolean;
    verification: { checked: boolean; verified: boolean | null; reason: string | null };
  } | null;
};

function tool(name: string) {
  const found = TOOLS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`@qorechain/mcp has no ${name} tool`);
  return found;
}

const getTransaction = tool("get_transaction");
const getPqStatus = tool("get_pq_status");
const ctx = toolContext({ defaultNetwork: "testnet" });

async function check(file: string, entry: Entry): Promise<Row> {
  const row = { file, hash: entry.hash, tier: entry.tier, note: entry.note };
  try {
    const tx = (await getTransaction.handler({ network: "testnet", hash: entry.hash }, ctx)) as TransactionResult;
    const pq = (await getPqStatus.handler({ network: "testnet", target: entry.hash }, ctx)) as PqStatusResult;
    const status = pq.transaction_status;
    const refused = (tx.execution_failures?.length ?? 0) > 0;
    const parts = [`success=${String(tx.success)}`, `tier=${status?.tier ?? "?"}`];
    let ok = tx.success === true && !refused && status?.tier === entry.tier;
    if (entry.tier === "pqc") {
      const verified = status?.has_exactly_one_pqc_layer === true && status.verification.verified === true;
      parts.push(`ml-dsa=${String(verified)}`);
      ok = ok && verified;
    }
    return { ...row, ok, detail: parts.join(" ") };
  } catch (error) {
    return { ...row, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkEvidence(dir: string): Promise<Row[]> {
  const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  const rows: Row[] = [];
  for (const name of files) {
    const document = JSON.parse(readFileSync(join(dir, name), "utf8")) as DeploymentFile;
    if (document.network !== "qorechain-diana") throw new Error(`${name}: network ${document.network} is not the testnet`);
    for (const entry of document.transactions ?? []) rows.push(await check(name, entry));
  }
  return rows;
}

function printTable(rows: Row[]): void {
  const header = ["result", "file", "tier", "hash", "detail", "note"];
  const lines = rows.map((row) => [row.ok ? "PASS" : "FAIL", row.file, row.tier, row.hash, row.detail, row.note]);
  const widths = header.map((_, i) => Math.max(header[i].length, ...lines.map((line) => line[i].length)));
  const format = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  console.log(format(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const line of lines) console.log(format(line));
}

const dir = process.argv[2] ?? "deployments";
checkEvidence(dir)
  .then((rows) => {
    if (rows.length === 0) {
      console.error(`no transactions recorded in ${dir}`);
      process.exit(1);
    }
    printTable(rows);
    const failed = rows.filter((row) => !row.ok).length;
    console.log(`\n${rows.length - failed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
