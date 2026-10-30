const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const hopByHopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
];
const originKeyHeader = "x-nanoduck-origin-key";
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const hsts = "max-age=31536000; includeSubDomains";

function failure(body, status, headers = {}) {
  return new Response(body, { status, headers: { ...headers, "cache-control": "no-store", "strict-transport-security": hsts } });
}

function configuredOrigin(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required.`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTPS origin without credentials, path, query or fragment.`);
  }
  return parsed.origin;
}

function rewriteLocation(value, upstreamOrigin, publicOrigin) {
  if (!value) return value;
  try {
    const resolved = new URL(value, `${upstreamOrigin}/`);
    return resolved.origin === upstreamOrigin
      ? `${publicOrigin}${resolved.pathname}${resolved.search}${resolved.hash}`
      : value;
  } catch {
    return value;
  }
}

export async function proxyRequest(request, env, fetchUpstream = fetch) {
  let publicOrigin;
  let upstreamOrigin;
  try {
    publicOrigin = configuredOrigin(env.PUBLIC_ORIGIN, "PUBLIC_ORIGIN");
    upstreamOrigin = configuredOrigin(env.UPSTREAM_ORIGIN, "UPSTREAM_ORIGIN");
    if (publicOrigin === upstreamOrigin) throw new Error("Origins must differ.");
  } catch {
    return failure("Proxy configuration unavailable", 503);
  }

  const incoming = new URL(request.url);
  if (incoming.origin !== publicOrigin) return failure("Misdirected Request", 421);
  if (!allowedMethods.has(request.method)) return failure("Method Not Allowed", 405, { allow: [...allowedMethods].join(", ") });
  if (typeof env.EDGE_PROXY_KEY !== "string" || env.EDGE_PROXY_KEY.length < 32) {
    return failure("Proxy configuration unavailable", 503);
  }

  const target = new URL(upstreamOrigin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  const connectionHeaders = (headers.get("connection") ?? "").split(",").map(name => name.trim()).filter(name => headerName.test(name));
  for (const name of ["host", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto", "x-real-ip", originKeyHeader, ...connectionHeaders, ...hopByHopHeaders]) headers.delete(name);
  headers.set(originKeyHeader, env.EDGE_PROXY_KEY);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");

  const retargeted = new Request(target, request);
  const upstreamRequest = new Request(retargeted, { headers, redirect: "manual", cache: "no-store" });
  let upstreamResponse;
  try {
    upstreamResponse = await fetchUpstream(upstreamRequest);
  } catch {
    return failure("Bad Gateway", 502);
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  const location = rewriteLocation(responseHeaders.get("location"), upstreamOrigin, publicOrigin);
  if (location) responseHeaders.set("location", location);
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("strict-transport-security", hsts);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

export default {
  fetch(request, env) {
    return proxyRequest(request, env);
  }
};
