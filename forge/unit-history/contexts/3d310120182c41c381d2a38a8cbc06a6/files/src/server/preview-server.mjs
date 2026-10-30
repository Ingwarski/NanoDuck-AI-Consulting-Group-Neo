import { createServer } from "node:http";

const allowedPreviewOrigin = value => {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return ["http:", "https:"].includes(url.protocol);
    return url.protocol === "https:" && !url.port && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.preview\.c\d+\.airoapp\.ai$/u.test(url.hostname);
  } catch { return false; }
};

if (!allowedPreviewOrigin(process.env.APP_ORIGIN)) {
  throw new Error("Preview deployment role requires a GoDaddy Preview APP_ORIGIN or a loopback test origin.");
}
const portValue = process.env.PORT;
const port = Number(portValue);
if (typeof portValue !== "string" || !/^\d+$/u.test(portValue) || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535 for the preview listener.");
}

const page = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>NanoDuck deployment preview</title></head><body><main><h1>NanoDuck deployment preview</h1><p>This staging listener is running. The application backend is disabled here.</p><p>Use the Published app for sign-in, saved conversations and consultations.</p></main></body></html>";
const headers = { "cache-control": "no-store", "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const respond = (request, response, status, body, type = "application/json; charset=utf-8", extraHeaders = {}) => {
  response.writeHead(status, { ...headers, "content-type": type, "content-length": Buffer.byteLength(body), ...extraHeaders });
  response.end(request.method === "HEAD" ? undefined : body);
};
const server = createServer((request, response) => {
  let pathname;
  try { pathname = new URL(request.url ?? "/", "http://localhost").pathname; }
  catch { return respond(request, response, 400, JSON.stringify({ error: "invalid_request" })); }
  if (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/auth" || pathname.startsWith("/auth/")) {
    return respond(request, response, 503, JSON.stringify({ error: "preview_backend_disabled" }));
  }
  if (pathname === "/" || pathname === "/healthz") {
    if (!["GET", "HEAD"].includes(request.method)) return respond(request, response, 405, JSON.stringify({ error: "method_not_allowed" }), undefined, { allow: "GET, HEAD" });
    return pathname === "/healthz"
      ? respond(request, response, 200, JSON.stringify({ status: "preview", store: "disabled" }))
      : respond(request, response, 200, page, "text/html; charset=utf-8");
  }
  return respond(request, response, 404, JSON.stringify({ error: "not_found" }));
});
server.requestTimeout = 30_000;
server.headersTimeout = 20_000;
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 1_000); deadline.unref();
  server.close(() => clearTimeout(deadline));
  server.closeIdleConnections();
};
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, close);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "0.0.0.0", resolve);
});
const address = server.address();
process.stdout.write(`NanoDuck deployment preview listening on ${address.address}:${address.port} (backend disabled).\n`);
