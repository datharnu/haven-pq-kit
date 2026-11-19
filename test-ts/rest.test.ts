import { describe, expect, it } from "vitest";
import { RestPathRefused, isAllowedRestPath, readRest, restUrl } from "../src/ts/rest.js";
import { createRestProxy, proxyRest } from "../src/ts/rest-proxy.js";

const UPSTREAM = "https://api-testnet.qore.host";

function recordingFetch() {
  const seen: { url: string; headers: Headers }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  };
  return { seen, fetchImpl };
}

describe("allowlist", () => {
  it("accepts the routes the apps read", () => {
    for (const path of [
      "/qorechain/pqc/v1/account/qor1abc",
      "/qorechain/pqc/v1/kem/qor1abc",
      "/qorechain/pqc/v1/evm_window/qor1abc",
      "/qorechain/pqc/v1/evm_limits",
      "/cosmos/bank/v1beta1/balances/qor1abc",
      "/cosmos/tx/v1beta1/txs/ABCDEF",
    ]) {
      expect(isAllowedRestPath(path)).toBe(true);
    }
  });

  it("refuses everything else", () => {
    for (const path of ["/cosmos/tx/v1beta1/txs", "/qorechain/pqc/v1/account/qor1abc/extra", "/admin", "/"]) {
      expect(isAllowedRestPath(path)).toBe(false);
    }
    expect(() => restUrl(UPSTREAM, "/admin")).toThrow(RestPathRefused);
  });
});

describe("reader", () => {
  it("keeps only pagination parameters and sends no headers", async () => {
    const { seen, fetchImpl } = recordingFetch();
    await readRest(UPSTREAM, "/cosmos/bank/v1beta1/balances/qor1abc", {
      query: new URLSearchParams("pagination.limit=5&token=secret"),
      fetch: fetchImpl,
    });
    expect(seen[0].url).toBe(`${UPSTREAM}/cosmos/bank/v1beta1/balances/qor1abc?pagination.limit=5`);
    expect([...seen[0].headers.keys()]).toEqual([]);
  });
});

describe("proxy", () => {
  it("drops cookies and unknown query parameters", async () => {
    const { seen, fetchImpl } = recordingFetch();
    const request = new Request(
      "http://localhost/api/qore/qorechain/pqc/v1/account/qor1abc?pagination.limit=1&token=secret",
      { method: "GET", headers: { cookie: "session=1", authorization: "Bearer x" } },
    );
    const result = await proxyRest(request, { upstream: UPSTREAM, prefix: "/api/qore", fetch: fetchImpl });
    expect(result.status).toBe(200);
    expect(seen[0].url).toBe(`${UPSTREAM}/qorechain/pqc/v1/account/qor1abc?pagination.limit=1`);
    expect([...seen[0].headers.keys()]).toEqual([]);
  });

  it("refuses writes, unknown paths and paths outside its prefix", async () => {
    const { seen, fetchImpl } = recordingFetch();
    const options = { upstream: UPSTREAM, prefix: "/api/qore", fetch: fetchImpl };
    const post = await proxyRest(new Request("http://localhost/api/qore/qorechain/pqc/v1/evm_limits", { method: "POST" }), options);
    const admin = await proxyRest(new Request("http://localhost/api/qore/admin"), options);
    const outside = await proxyRest(new Request("http://localhost/other/qorechain/pqc/v1/evm_limits"), options);
    expect([post.status, admin.status, outside.status]).toEqual([405, 403, 404]);
    expect(seen).toHaveLength(0);
  });

  it("answers preflight as a fetch handler with CORS headers", async () => {
    const { fetchImpl } = recordingFetch();
    const handler = createRestProxy({ upstream: UPSTREAM, prefix: "/api/qore", fetch: fetchImpl });
    const preflight = await handler(new Request("http://localhost/api/qore/qorechain/pqc/v1/evm_limits", { method: "OPTIONS" }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    const read = await handler(new Request("http://localhost/api/qore/qorechain/pqc/v1/evm_limits"));
    expect(read.status).toBe(200);
    expect(read.headers.get("access-control-allow-origin")).toBe("*");
    expect(await read.json()).toEqual({ ok: true });
  });
});
