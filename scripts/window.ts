import { closeEvmWindowMsg, fetchEvmWindow, openEvmWindowMsg } from "@qorechain/sdk";
import { TESTNET } from "../src/ts/network.js";
import { broadcast, loadAccount } from "./accounts.js";

/** The chain's window limits (`/qorechain/pqc/v1/evm_limits`). */
const MAX_BLOCKS = 17_280;
const MAX_TXS = 1_000;
/** About two minutes of blocks per transaction, plus slack for the open itself. */
const BLOCKS_PER_TX = 40;

export type WindowSpec = {
  /** Exactly how many EVM transactions the body will send. */
  txs: number;
  /** Value plus maximum fee across all of them, in uqor. */
  maxValueUqor: string;
  /** Allowed recipients. A scoped window refuses contract creation; an empty list means unscoped. */
  targets: readonly string[];
  /** Override the computed lifetime. */
  blocks?: number;
};

export function windowBlocks(spec: WindowSpec): number {
  if (!Number.isInteger(spec.txs) || spec.txs < 1 || spec.txs > MAX_TXS) {
    throw new Error(`a window admits 1 to ${MAX_TXS} transactions, not ${spec.txs}`);
  }
  const blocks = spec.blocks ?? Math.min(MAX_BLOCKS, 40 + spec.txs * BLOCKS_PER_TX);
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > MAX_BLOCKS) {
    throw new Error(`a window lasts 1 to ${MAX_BLOCKS} blocks, not ${blocks}`);
  }
  return blocks;
}

export async function openWindow(name: string, spec: WindowSpec): Promise<string> {
  const account = await loadAccount(name);
  const hash = await broadcast(
    account,
    [
      openEvmWindowMsg({
        sender: account.cosmos,
        blocks: windowBlocks(spec),
        maxTxs: spec.txs,
        maxValue: spec.maxValueUqor,
        allowedTargets: spec.targets.length > 0 ? [...spec.targets] : undefined,
      }),
    ],
    "hybrid",
  );
  const window = await fetchEvmWindow({ rest: TESTNET.rest, address: account.cosmos });
  if (!window.live) throw new Error(`window ${hash} was opened but the chain does not report it live`);
  console.log(`window opened ${hash} remainingTxs=${window.remainingTxs}`);
  return hash;
}

export async function closeWindow(name: string): Promise<string> {
  const account = await loadAccount(name);
  const hash = await broadcast(account, [closeEvmWindowMsg(account.cosmos)], "hybrid");
  console.log(`window closed ${hash}`);
  return hash;
}

/** Open a window sized to `spec.txs`, run `body`, and close the window even when `body` throws. */
export async function withWindow<T>(name: string, spec: WindowSpec, body: () => Promise<T>): Promise<T> {
  await openWindow(name, spec);
  try {
    return await body();
  } finally {
    await closeWindow(name);
  }
}
