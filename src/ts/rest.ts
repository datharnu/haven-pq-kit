/**
 * Read-only REST proxy. The public QoreChain REST endpoint sends no CORS headers,
 * so a browser reaches it through this allowlist. The proxy forwards no request
 * headers and keeps only pagination query parameters.
 */

const ALLOWED: readonly RegExp[] = [
  /^\/qorechain\/pqc\/v1\/account\/[^/]+$/,
  /^\/qorechain\/pqc\/v1\/kem\/[^/]+$/,
  /^\/qorechain\/pqc\/v1\/evm_window\/[^/]+$/,
  /^\/qorechain\/pqc\/v1\/protocol_features$/,
  /^\/qorechain\/pqc\/v1\/evm_limits$/,
  /^\/cosmos\/bank\/v1beta1\/balances\/[^/]+$/,
  /^\/cosmos\/auth\/v1beta1\/accounts\/[^/]+$/,
  /^\/cosmos\/tx\/v1beta1\/txs\/[0-9A-Fa-f]+$/,
];

const KEPT_QUERY = new Set(["pagination.limit", "pagination.offset", "pagination.key", "pagination.count_total"]);

export function isAllowedRestPath(pathname: string): boolean {
  return ALLOWED.some((pattern) => pattern.test(pathname));
}

export type ProxyResult = {
  status: number;
  body: string;
  contentType: string;
};

export async function handleRestProxy(
  request: Request,
  options: { upstream: string; prefix: string; fetch?: typeof fetch },
): Promise<Response> {
  const result = await proxyRest(request, options);
  return new Response(result.body, {
    status: result.status,
    headers: {
      "content-type": result.contentType,
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}

export async function proxyRest(
  request: Request,
  options: { upstream: string; prefix: string; fetch?: typeof fetch },
): Promise<ProxyResult> {
  if (request.method === "OPTIONS") {
    return { status: 204, body: "", contentType: "text/plain" };
  }
  if (request.method !== "GET") {
    return { status: 405, body: "method not allowed", contentType: "text/plain" };
  }
  const url = new URL(request.url);
  if (!url.pathname.startsWith(options.prefix)) {
    return { status: 404, body: "not found", contentType: "text/plain" };
  }
  const pathname = url.pathname.slice(options.prefix.length) || "/";
  if (!isAllowedRestPath(pathname)) {
    return { status: 403, body: "path not allowed", contentType: "text/plain" };
  }
  const upstream = new URL(options.upstream);
  upstream.pathname = pathname;
  for (const [key, value] of url.searchParams) {
    if (KEPT_QUERY.has(key)) upstream.searchParams.append(key, value);
  }
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(upstream, { method: "GET" });
  const body = await response.text();
  return {
    status: response.status,
    body,
    contentType: response.headers.get("content-type") ?? "application/json",
  };
}
