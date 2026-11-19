import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedRestPath, proxyRest } from "../src/ts/rest.js";

test("the allowlist accepts the routes the apps read", () => {
  assert.equal(isAllowedRestPath("/qorechain/pqc/v1/account/qor1abc"), true);
  assert.equal(isAllowedRestPath("/qorechain/pqc/v1/kem/qor1abc"), true);
  assert.equal(isAllowedRestPath("/qorechain/pqc/v1/evm_window/qor1abc"), true);
  assert.equal(isAllowedRestPath("/cosmos/bank/v1beta1/balances/qor1abc"), true);
});

test("the allowlist refuses other paths", () => {
  assert.equal(isAllowedRestPath("/cosmos/tx/v1beta1/txs"), false);
  assert.equal(isAllowedRestPath("/qorechain/pqc/v1/account/qor1abc/extra"), false);
  assert.equal(isAllowedRestPath("/admin"), false);
});

test("the proxy drops cookies, blocks posts, and strips unknown query parameters", async () => {
  let seen = "";
  const fetchImpl: typeof fetch = async (input) => {
    seen = String(input);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const request = new Request(
    "http://localhost/api/qore/qorechain/pqc/v1/account/qor1abc?pagination.limit=1&token=secret",
    { method: "GET", headers: { cookie: "session=1" } },
  );
  const result = await proxyRest(request, {
    upstream: "https://api-testnet.qore.host",
    prefix: "/api/qore",
    fetch: fetchImpl,
  });
  assert.equal(result.status, 200);
  assert.equal(seen, "https://api-testnet.qore.host/qorechain/pqc/v1/account/qor1abc?pagination.limit=1");
  const posted = await proxyRest(new Request("http://localhost/api/qore/qorechain/pqc/v1/evm_limits", { method: "POST" }), {
    upstream: "https://api-testnet.qore.host",
    prefix: "/api/qore",
    fetch: fetchImpl,
  });
  assert.equal(posted.status, 405);
});
