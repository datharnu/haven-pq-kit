import { isAllowedRestPath, restUrl } from "./rest.js";

/**
 * A same-origin REST proxy in the Fetch API shape, `(Request) => Promise<Response>`,
 * so it runs as a Vercel function, an edge handler or under Node. It answers CORS
 * preflight, allows GET only, forwards no request headers, and keeps only
 * pagination query parameters.
 */
export type RestProxyOptions = {
  /** For example `https://api-testnet.qore.host`. */
  upstream: string;
  /** The path the proxy is mounted under, for example `/api/rest`. */
  prefix: string;
  /** Value of `access-control-allow-origin`. Default `*`; the data is public. */
  allowOrigin?: string;
  fetch?: typeof fetch;
};

export type ProxyResult = {
  status: number;
  body: string;
  contentType: string;
};

export function createRestProxy(options: RestProxyOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    const result = await proxyRest(request, options);
    return new Response(request.method === "OPTIONS" ? null : result.body, {
      status: result.status,
      headers: {
        "content-type": result.contentType,
        "access-control-allow-origin": options.allowOrigin ?? "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "cache-control": "no-store",
      },
    });
  };
}

export async function proxyRest(request: Request, options: RestProxyOptions): Promise<ProxyResult> {
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
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(restUrl(options.upstream, pathname, url.searchParams), { method: "GET" });
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "application/json",
  };
}
