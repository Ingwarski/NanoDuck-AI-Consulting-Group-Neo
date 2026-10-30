import test from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../cloudflare/northflank-proxy.mjs";

const env = {
  PUBLIC_ORIGIN: "https://nanoduck-neo.example.workers.dev",
  UPSTREAM_ORIGIN: "https://web--nanoduck.example.code.run",
  EDGE_PROXY_KEY: "a".repeat(43)
};

test("edge proxy streams a request, overwrites trusted headers and rewrites only upstream redirects", async () => {
  let forwarded;
  const response = await proxyRequest(new Request(`${env.PUBLIC_ORIGIN}/auth/google/callback?code=one`, {
    method: "POST",
    headers: {
      origin: env.PUBLIC_ORIGIN,
      "content-type": "text/plain",
      connection: "x-evil",
      "x-evil": "remove-me",
      "x-forwarded-for": "spoofed",
      "x-forwarded-host": "spoofed.example",
      "x-nanoduck-origin-key": "spoofed"
    },
    body: "payload"
  }), env, async request => {
    forwarded = request;
    const headers = new Headers({ location: `${env.UPSTREAM_ORIGIN}/welcome?from=oauth` });
    headers.append("set-cookie", "__Host-flow=one; Secure; Path=/");
    headers.append("set-cookie", "__Host-session=two; Secure; Path=/");
    return new Response(null, { status: 303, headers });
  });

  assert.equal(forwarded.url, `${env.UPSTREAM_ORIGIN}/auth/google/callback?code=one`);
  assert.equal(forwarded.redirect, "manual");
  assert.equal(forwarded.headers.get("origin"), env.PUBLIC_ORIGIN);
  assert.equal(forwarded.headers.get("x-forwarded-for"), null);
  assert.equal(forwarded.headers.get("x-evil"), null);
  assert.equal(forwarded.headers.get("x-forwarded-host"), "nanoduck-neo.example.workers.dev");
  assert.equal(forwarded.headers.get("x-forwarded-proto"), "https");
  assert.equal(forwarded.headers.get("x-nanoduck-origin-key"), env.EDGE_PROXY_KEY);
  assert.equal(await forwarded.text(), "payload");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${env.PUBLIC_ORIGIN}/welcome?from=oauth`);
  assert.deepEqual(response.headers.getSetCookie(), ["__Host-flow=one; Secure; Path=/", "__Host-session=two; Secure; Path=/"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
});

test("edge proxy preserves external redirects", async () => {
  const response = await proxyRequest(new Request(`${env.PUBLIC_ORIGIN}/auth/google/start`), env, async () => new Response(null, {
    status: 302,
    headers: { location: "https://accounts.google.com/o/oauth2/v2/auth?client_id=one" }
  }));
  assert.equal(response.headers.get("location"), "https://accounts.google.com/o/oauth2/v2/auth?client_id=one");
});

test("edge proxy keeps scheme-relative-looking paths on the configured upstream", async () => {
  let forwarded;
  await proxyRequest(new Request(`${env.PUBLIC_ORIGIN}//attacker.example/steal?value=one`), env, async request => {
    forwarded = request;
    return new Response("safe");
  });
  const target = new URL(forwarded.url);
  assert.equal(target.origin, env.UPSTREAM_ORIGIN);
  assert.equal(target.pathname, "//attacker.example/steal");
  assert.equal(target.search, "?value=one");
});

test("edge proxy fails closed for another host, unsafe methods, missing secrets and upstream failure", async () => {
  assert.equal((await proxyRequest(new Request("https://wrong.example/"), env)).status, 421);
  assert.equal((await proxyRequest(new Request(`${env.PUBLIC_ORIGIN}/`, { method: "BREW" }), env)).status, 405);
  assert.equal((await proxyRequest(new Request(`${env.PUBLIC_ORIGIN}/`), { ...env, EDGE_PROXY_KEY: "" })).status, 503);
  assert.equal((await proxyRequest(new Request(`${env.PUBLIC_ORIGIN}/`), env, async () => { throw new Error("offline"); })).status, 502);
  assert.equal((await proxyRequest(new Request("https://wrong.example/"), env)).headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
});
