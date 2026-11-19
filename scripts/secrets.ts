import { mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function secretsDir(): string {
  return process.env.HAVEN_SECRETS_DIR ?? join(homedir(), ".haven");
}

export function secretPath(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) {
    throw new Error("account name must be lowercase letters, digits and dashes");
  }
  return join(secretsDir(), `${name}.env`);
}

/** Write a new secret file. Refuses to overwrite one that already exists. */
export function writeSecret(name: string, mnemonic: string): string {
  const dir = secretsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = secretPath(name);
  if (existsSync(path)) throw new Error(`refusing to overwrite ${path}`);
  writeFileSync(path, `MNEMONIC=${JSON.stringify(mnemonic)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  return path;
}

export function readMnemonic(name: string): string {
  const path = secretPath(name);
  const text = readFileSync(path, "utf8");
  const match = text.match(/^MNEMONIC=(?:"([^"]+)"|(\S+))\s*$/m);
  const mnemonic = match?.[1] ?? match?.[2];
  if (!mnemonic) throw new Error(`no MNEMONIC in ${path}`);
  return mnemonic;
}
