import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `npm run cbom`: a CycloneDX CBOM of the contracts (and, with --chain, of the
 * spike account on testnet) through QoreScan, then the rule this kit promises:
 * contracts reach ML-DSA only through pqcKeyStatus and pqcVerify, and never use
 * ecrecover or any other signature scheme for authorisation.
 */

const QORESCAN = resolve("node_modules/.bin/qorescan");
const ALLOWED_FAMILIES = new Set(["Keccak", "ML-DSA"]);
const ALLOWED_ML_DSA_SYMBOLS = new Set(["import", "pqcVerify", "pqcKeyStatus"]);
const PRECOMPILES = new Set([
  "0x0000000000000000000000000000000000000a01",
  "0x0000000000000000000000000000000000000a02",
]);

type Component = {
  name: string;
  properties?: { name: string; value: string }[];
  evidence?: { occurrences?: { location: string; line?: number; symbol: string }[] };
};

function property(component: Component, name: string): string[] {
  return (component.properties ?? []).filter((p) => p.name === name).map((p) => p.value);
}

function solidityFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return solidityFiles(path);
    return path.endsWith(".sol") ? [path] : [];
  });
}

/** Findings from the CBOM itself. */
function checkCbom(components: Component[]): string[] {
  const findings: string[] = [];
  let mlDsaSeen = false;
  for (const component of components) {
    if (!property(component, "qorescan:source").includes("solidity")) continue;
    const family = property(component, "qorescan:family")[0];
    if (family === undefined) continue;
    const inContracts = (component.evidence?.occurrences ?? []).filter((o) => o.location.endsWith(".sol"));
    if (inContracts.length === 0) continue;
    if (!ALLOWED_FAMILIES.has(family)) {
      const where = inContracts.map((o) => `${o.location}:${o.line ?? "?"} ${o.symbol}`);
      findings.push(`${component.name} (${family}) in contracts: ${where.join(", ")}`);
    }
    if (family === "ML-DSA") {
      mlDsaSeen = true;
      for (const occurrence of inContracts) {
        if (!ALLOWED_ML_DSA_SYMBOLS.has(occurrence.symbol)) {
          findings.push(`ML-DSA reached through ${occurrence.symbol} at ${occurrence.location}:${occurrence.line ?? "?"}`);
        }
      }
    }
  }
  if (!mlDsaSeen) findings.push("QoreScan found no ML-DSA use in the contracts");
  return findings;
}

/** Findings QoreScan does not cover: what the contracts call. */
function checkSources(dir: string): string[] {
  const findings: string[] = [];
  for (const file of solidityFiles(dir)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const where = `${file}:${i + 1}`;
      if (/\becrecover\s*\(/.test(line)) findings.push(`ecrecover at ${where}`);
      for (const match of line.matchAll(/\b0x[0-9a-fA-F]{40}\b/g)) {
        if (!PRECOMPILES.has(match[0].toLowerCase())) findings.push(`address literal ${match[0]} at ${where}`);
      }
      for (const match of line.matchAll(/(\w+)\s*\.\s*(staticcall|call|delegatecall)\s*\(/g)) {
        if (match[1] !== "PQC_VERIFY" && match[1] !== "PQC_STATUS") {
          findings.push(`low-level ${match[2]} on ${match[1]} at ${where}`);
        }
      }
    });
  }
  return findings;
}

function scan(args: string[], out: string): Component[] {
  execFileSync(QORESCAN, [...args, "--out", out], { stdio: ["ignore", "ignore", "inherit"] });
  return (JSON.parse(readFileSync(out, "utf8")) as { components?: Component[] }).components ?? [];
}

function run(dir: string, out: string, chain: boolean): string[] {
  const args = chain
    ? ["scan", "--network", "testnet", "--address", "qor143f0ghn8slqguwez73087dvq8lqnuuukqdu9fl", "--solidity", dir]
    : ["solidity", dir];
  return [...checkCbom(scan(args, out)), ...checkSources(dir)];
}

const chain = process.argv.includes("--chain");
const out = chain ? "cbom.json" : join(mkdtempSync(join(tmpdir(), "haven-cbom-")), "cbom.json");
const findings = run("src", out, chain);
if (findings.length > 0) {
  console.error(`CBOM check failed for src/:\n- ${findings.join("\n- ")}`);
  process.exit(1);
}
console.log(`CBOM check passed for src/ (${out})`);

const fixture = run("scripts/fixtures/ecrecover", join(mkdtempSync(join(tmpdir(), "haven-cbom-")), "cbom.json"), false);
if (fixture.length === 0) {
  console.error("self-test failed: the ecrecover fixture was not caught");
  process.exit(1);
}
console.log(`self-test caught the ecrecover fixture (${fixture.length} findings)`);
