import { OAuth2Client } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";
import { randomId, secureEqual, sign } from "./crypto.mjs";

const SESSION_COOKIE = "__Host-nanoduck-session";
const FLOW_COOKIE = "__Host-nanoduck-oauth";
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = value => {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { return undefined; }
};
const cookies = header => Object.fromEntries((header ?? "").split(";").map(item => item.trim().split(/=(.*)/s, 2)).filter(([key, value]) => key && value !== undefined));

const cookie = (name, value, maxAge, secure) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
const clearCookie = (name, secure) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

export function createAuth({ config, store, createOAuthClient = (...args) => new OAuth2Client(...args) }) {
  const secure = config.origin?.startsWith("https://") === true;
  const sessionCookieName = secure ? SESSION_COOKIE : "nanoduck-session";
  const flowCookieName = secure ? FLOW_COOKIE : "nanoduck-oauth";
  const signValue = value => `${value}.${sign(value, config.sessionKey)}`;
  const verifyValue = value => {
    const dot = value?.lastIndexOf(".") ?? -1;
    if (dot < 1) return undefined;
    const body = value.slice(0, dot); const signature = value.slice(dot + 1);
    return secureEqual(signature, sign(body, config.sessionKey)) ? body : undefined;
  };
  const browserSession = async request => {
    const raw = verifyValue(cookies(request.headers.cookie)[sessionCookieName]);
    if (!raw) return undefined;
    const session = await store.session(raw);
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) return undefined;
    return session;
  };
  const sessionCookie = session => cookie(sessionCookieName, signValue(session.id), Math.max(0, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000)), secure);
  const createSession = async ownerSubject => {
    const issuedAt = new Date().toISOString();
    const session = { id: randomId(), ownerSubject, csrfToken: randomId(), consentedAt: null, issuedAt, expiresAt: new Date(Date.now() + config.sessionLifetimeSeconds * 1000).toISOString() };
    await store.createSession(session); return session;
  };

  return Object.freeze({
    async session(request) { return browserSession(request); },
    async require(request, { consent = true, csrf = false } = {}) {
      const session = await browserSession(request);
      if (!session || (consent && !session.consentedAt)) return undefined;
      if (csrf && config.origin && request.headers.origin !== config.origin) return undefined;
      if (csrf && !secureEqual(request.headers["x-csrf-token"] ?? "", session.csrfToken)) return undefined;
      return session;
    },
    sessionCookie,
    clearSessionCookie: () => clearCookie(sessionCookieName, secure),
    async developmentSignIn() {
      if (!config.developmentOwnerEmail) return undefined;
      return createSession(`development:${config.developmentOwnerEmail}`);
    },
    async beginGoogle() {
      if (!config.google) return undefined;
      const state = randomId(); const nonce = randomId(); const verifier = randomBytes(48).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const client = createOAuthClient(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
      const location = client.generateAuthUrl({ access_type: "offline", prompt: "select_account", scope: ["openid", "email"], state, nonce, code_challenge: challenge, code_challenge_method: "S256" });
      const payload = encode({ state, nonce, verifier, expiresAt: Date.now() + 10 * 60_000 });
      return { location, cookie: cookie(flowCookieName, signValue(payload), 600, secure) };
    },
    async finishGoogle(requestUrl, request) {
      if (!config.google) return undefined;
      const url = new URL(requestUrl, config.origin ?? "http://localhost");
      const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
      const raw = verifyValue(cookies(request.headers.cookie)[flowCookieName]); const flow = raw ? decode(raw) : undefined;
      if (url.searchParams.getAll("code").length !== 1 || url.searchParams.getAll("state").length !== 1 || !code || !state || !flow || flow.expiresAt < Date.now() || !secureEqual(state, flow.state)) return undefined;
      const client = createOAuthClient(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
      const result = await client.getToken({ code, codeVerifier: flow.verifier });
      if (!result.tokens.id_token) return undefined;
      const ticket = await client.verifyIdToken({ idToken: result.tokens.id_token, audience: config.google.clientId });
      const claims = ticket.getPayload();
      const verifiedSubject = typeof claims?.sub === "string" && claims.sub.length > 0 && claims.sub === config.google.ownerSubject;
      const verifiedEmail = typeof claims?.email === "string" && claims.email.toLowerCase() === config.google.ownerEmail;
      if (!claims || typeof claims.sub !== "string" || !claims.sub || (config.google.ownerSubject ? !verifiedSubject : !verifiedEmail) || claims.email_verified !== true || typeof claims.nonce !== "string" || !secureEqual(claims.nonce, flow.nonce) || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss ?? "")) return undefined;
      const session = await createSession(claims.sub);
      return { session, clearFlowCookie: clearCookie(flowCookieName, secure) };
    },
    async consent(request) { const session = await this.require(request, { consent: false, csrf: true }); return session ? store.updateSession(session.id, { consentedAt: new Date().toISOString() }) : undefined; },
    async signOut(request) { const session = await this.require(request, { consent: false, csrf: true }); if (!session) return false; await store.revokeSession(session.id); return true; }
  });
}
