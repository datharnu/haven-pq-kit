import {
  closeWindow,
  newAccount,
  openWindow,
  printStatus,
  registerAccount,
  registerKem,
} from "./accounts.js";

const [command, ...args] = process.argv.slice(2);

function need(value: string | undefined, usage: string): string {
  if (!value) {
    console.error(usage);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  switch (command) {
    case "new-account":
      await newAccount(need(args[0], "usage: pq new-account <name>"));
      return;
    case "status":
      await printStatus(need(args[0], "usage: pq status <name>"));
      return;
    case "register":
      await registerAccount(need(args[0], "usage: pq register <name>"));
      return;
    case "open-window": {
      const name = need(args[0], "usage: pq open-window <name> <blocks> <txs> <maxValueUqor> [targets...]");
      const blocks = Number(need(args[1], "blocks required"));
      const txs = Number(need(args[2], "txs required"));
      const maxValue = need(args[3], "maxValue required");
      await openWindow(name, blocks, txs, maxValue, args.slice(4));
      return;
    }
    case "close-window":
      await closeWindow(need(args[0], "usage: pq close-window <name>"));
      return;
    case "register-kem":
      registerKem();
      return;
    default:
      console.error(
        "usage: pq <new-account|status|register|open-window|close-window|register-kem> ...",
      );
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
