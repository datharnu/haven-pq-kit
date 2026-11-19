import { readFileSync } from "node:fs";
import type { RecipientCard } from "@qorechain/qoreseal";
import { readVerifiedKemKey, testnetClient } from "../src/ts/keydir.js";
import { TESTNET } from "../src/ts/network.js";
import { CHAIN_ID, newAccount, printStatus } from "./accounts.js";
import { registerKem, registerMlDsa } from "./register.js";
import { closeWindow, openWindow } from "./window.js";

const [command, ...args] = process.argv.slice(2);

const USAGE = `usage:
  pq new-account <name>
  pq status <name>
  pq register <name>
  pq register-kem <name> [--replace]
  pq open-window <name> <txs> <maxValueUqor> [targets...]
  pq close-window <name>
  pq verify-kem <qor1-address> [card.json]`;

function need(value: string | undefined): string {
  if (!value) {
    console.error(USAGE);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  switch (command) {
    case "new-account":
      await newAccount(need(args[0]));
      return;
    case "status":
      await printStatus(need(args[0]));
      return;
    case "register":
      await registerMlDsa(need(args[0]));
      return;
    case "register-kem":
      await registerKem(need(args[0]), { replace: args.includes("--replace") });
      return;
    case "open-window":
      await openWindow(need(args[0]), {
        txs: Number(need(args[1])),
        maxValueUqor: need(args[2]),
        targets: args.slice(3),
      });
      return;
    case "close-window":
      await closeWindow(need(args[0]));
      return;
    case "verify-kem": {
      const address = need(args[0]);
      const card = JSON.parse(readFileSync(args[1] ?? `cards/${address}.json`, "utf8")) as RecipientCard;
      const verified = await readVerifiedKemKey({
        client: testnetClient(),
        rest: TESTNET.rest,
        chainId: CHAIN_ID,
        address,
        card,
      });
      console.log(
        `ml-kem verified ${verified.address} bytes=${verified.mlkemPublicKey.length} sha3=${verified.mlkemKeySha3}`,
      );
      return;
    }
    default:
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
