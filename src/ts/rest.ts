/**
 * Allowlisted, GET-only reads of the QoreChain REST API. `rest-proxy.ts` serves the
 * same allowlist to browsers, because the public endpoint sends no CORS headers.
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

export const KEPT_QUERY: ReadonlySet<string> = new Set([
  "pagination.limit",
  "pagination.offset",
  "pagination.key",
  "pagination.count_total",
]);

export function isAllowedRestPath(pathname: string): boolean {
  return ALLOWED.some((pattern) => pattern.test(pathname));
}

export class RestPathRefused extends Error {
  constructor(pathname: string) {
    super(`REST path not allowed: ${pathname}`);
    this.name = "RestPathRefused";
  }
}

/** The upstream URL for an allowed path, with every query parameter but pagination dropped. */
export function restUrl(upstream: string, pathname: string, query?: URLSearchParams): URL {
  if (!isAllowedRestPath(pathname)) throw new RestPathRefused(pathname);
  const url = new URL(upstream);
  url.pathname = pathname;
  for (const [key, value] of query ?? []) {
    if (KEPT_QUERY.has(key)) url.searchParams.append(key, value);
  }
  return url;
}

/** GET an allowed path and parse the JSON. No request headers are sent. */
export async function readRest<T>(
  upstream: string,
  pathname: string,
  options: { query?: URLSearchParams; fetch?: typeof fetch } = {},
): Promise<T> {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(restUrl(upstream, pathname, options.query), { method: "GET" });
  if (!response.ok) throw new Error(`REST ${pathname} returned ${response.status}`);
  return (await response.json()) as T;
}
