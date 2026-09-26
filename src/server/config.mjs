import { FORBIDDEN_RUNTIME_ENVIRONMENT_NAMES } from "./forbidden-environment.mjs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const required = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} is required.`);
  return value.trim();
};

const optionalUrl = (value, name) => {
  if (value === undefined || value === "") return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be a clean HTTPS origin.`);
  }
  return url.origin;
};

const positiveInteger = (value, fallback, name) => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/u.test(value)) throw new Error(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be positive.`);
  return parsed;
};

const optionalBase64urlBytes = (value, name) => {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error(`${name} must be base64url-encoded bytes.`);
  const decoded = Buffer.from(value, "base64url");
  if (!decoded.byteLength || decoded.toString("base64url") !== value) throw new Error(`${name} must be canonical base64url-encoded bytes.`);
  return decoded;
};

const optionalGzipBase64urlBytes = (value, name) => {
  const compressed = optionalBase64urlBytes(value, name);
  if (!compressed) return undefined;
  try {
    return gunzipSync(compressed, { maxOutputLength: 64 * 1024 });
  } catch {
    throw new Error(`${name} must be valid gzip-compressed base64url bytes of at most 64 KiB.`);
  }
};

const optionalString = value => typeof value === "string" && value.trim() ? value.trim() : undefined;

const optionalModelCandidates = value => {
  if (value === undefined || value === "") return Object.freeze([]);
  if (typeof value !== "string") throw new Error("CLAUDE_CODE_MODEL_CANDIDATES must be a comma-separated model list.");
  const candidates = [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
  if (candidates.length > 12 || candidates.some(item => !/^[A-Za-z0-9._-]{1,128}$/u.test(item))) throw new Error("CLAUDE_CODE_MODEL_CANDIDATES contains an invalid model id.");
  return Object.freeze(candidates);
};

const quotedInner = value => {
  const quote = value[0];
  return (quote === "'" || quote === '"') && value.length > 1 && value.at(-1) === quote ? value.slice(1, -1) : undefined;
};

const dotenvAssignmentValue = (value, name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matched = new RegExp(`^(?:export[\\t ]+)?${escapedName}[\\t ]*=[\\t ]*(.+)$`, "u").exec(value);
  return matched?.[1]?.trim() || undefined;
};

const secretKeyBytes = (value, name, acceptsLength) => {
  if (value === undefined) return undefined;
  const supplied = required(value, name);
  const candidates = [];
  const add = bytes => {
    if (!candidates.some(candidate => candidate.equals(bytes))) candidates.push(bytes);
  };
  const collectCanonical = secret => {
    if (/^[A-Za-z0-9_-]+={0,2}$/u.test(secret)) {
      const decoded = Buffer.from(secret, "base64url");
      const canonical = decoded.toString("base64url");
      const padded = canonical.padEnd(Math.ceil(canonical.length / 4) * 4, "=");
      if (decoded.byteLength && (secret === canonical || secret === padded)) add(decoded);
    }
    if (/^[A-Za-z0-9+/]+={0,2}$/u.test(secret)) {
      const decoded = Buffer.from(secret, "base64");
      const canonical = decoded.toString("base64");
      if (decoded.byteLength && (secret === canonical || secret === canonical.replace(/=+$/u, ""))) add(decoded);
    }
    if (/^[0-9A-Fa-f]{64}$/u.test(secret)) add(Buffer.from(secret, "hex"));
  };
  const textCandidates = [];
  const addText = secret => {
    if (secret && !textCandidates.includes(secret)) textCandidates.push(secret);
  };
  addText(supplied);
  addText(quotedInner(supplied));
  const assignment = dotenvAssignmentValue(supplied, name);
  addText(assignment);
  addText(assignment && quotedInner(assignment));
  for (const secret of textCandidates) collectCanonical(secret);
  for (const secret of textCandidates) add(Buffer.from(secret, "utf8"));
  const selected = candidates.find(candidate => acceptsLength(candidate.byteLength));
  if (!selected) throw new Error(`${name} has an unsupported encoding or byte length.`);
  return selected;
};

const managedDatabaseUrl = environment => {
  const existing = optionalString(environment.DATABASE_URL);
  if (existing) return existing;
  const host = optionalString(environment.DB_HOST);
  const port = optionalString(environment.DB_PORT);
  const name = optionalString(environment.DB_NAME);
  const user = optionalString(environment.DB_USER);
  const password = optionalString(environment.DB_PASSWORD);
  if (![host, port, name, user, password].some(Boolean)) return undefined;
  if (![host, port, name, user, password].every(Boolean) || !/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error("DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD must form one valid managed database connection.");
  }
  const url = new URL("mysql://localhost");
  url.hostname = host; url.port = port; url.username = user; url.password = password; url.pathname = `/${name}`;
  return url.toString();
};

export function loadConfig(environment = process.env) {
  const forbidden = FORBIDDEN_RUNTIME_ENVIRONMENT_NAMES.filter(name => environment[name]?.trim());
  if (forbidden.length) throw new Error(`Unsupported provider environment: ${forbidden.join(", ")}. Use the managed subscription credentials.`);
  const mode = environment.NANODUCK_RUNTIME_MODE ?? environment.NODE_ENV ?? "production";
  if (!["development", "test", "production"].includes(mode)) throw new Error("NANODUCK_RUNTIME_MODE or NODE_ENV is invalid.");
  const origin = optionalUrl(environment.APP_ORIGIN ?? environment.SETTINGS_PUBLIC_ORIGIN, "APP_ORIGIN");
  if (mode === "production" && origin === undefined) throw new Error("APP_ORIGIN is required in production.");
  const edgeProxyKey = optionalString(environment.EDGE_PROXY_KEY);
  if (edgeProxyKey !== undefined && Buffer.byteLength(edgeProxyKey, "utf8") < 32) {
    throw new Error("EDGE_PROXY_KEY must contain at least 32 bytes.");
  }
  const dataKey = environment.DATA_ENCRYPTION_KEY;
  const decodedKey = secretKeyBytes(dataKey, "DATA_ENCRYPTION_KEY", length => length === 32);
  if (mode === "production" && (!decodedKey || decodedKey.byteLength !== 32)) {
    throw new Error("DATA_ENCRYPTION_KEY must be a supported 32-byte key in production.");
  }
  if (decodedKey !== undefined && decodedKey.byteLength !== 32) throw new Error("DATA_ENCRYPTION_KEY must contain 32 bytes.");
  const recoveryKey = environment.RECOVERY_ENCRYPTION_KEY;
  const decodedRecoveryKey = secretKeyBytes(recoveryKey, "RECOVERY_ENCRYPTION_KEY", length => length === 32);
  if (mode === "production" && (!decodedRecoveryKey || decodedRecoveryKey.byteLength !== 32)) {
    throw new Error("RECOVERY_ENCRYPTION_KEY must be a separate supported 32-byte key in production.");
  }
  if (decodedRecoveryKey !== undefined && decodedRecoveryKey.byteLength !== 32) throw new Error("RECOVERY_ENCRYPTION_KEY must contain 32 bytes.");
  if (decodedKey && decodedRecoveryKey && decodedKey.equals(decodedRecoveryKey)) throw new Error("RECOVERY_ENCRYPTION_KEY must differ from DATA_ENCRYPTION_KEY.");
  const sessionKeyValue = environment.SESSION_SIGNING_KEY ?? environment.SETTINGS_SESSION_HMAC_KEY;
  const sessionKey = sessionKeyValue === undefined
    ? (mode === "production" ? undefined : createHash("sha256").update("nanoduck-development-session-key").digest())
    : secretKeyBytes(sessionKeyValue, "SESSION_SIGNING_KEY", length => length >= 32);
  if (!sessionKey || sessionKey.byteLength < 32) throw new Error("SESSION_SIGNING_KEY must contain at least 32 bytes.");
  if ([decodedKey, decodedRecoveryKey].some(key => key?.equals(sessionKey))) throw new Error("SESSION_SIGNING_KEY must differ from data and recovery keys.");
  const databaseUrl = managedDatabaseUrl(environment);
  if (mode === "production" && (typeof databaseUrl !== "string" || databaseUrl.length === 0)) {
    throw new Error("DATABASE_URL or the managed DB_* connection is required in production.");
  }
  const databaseSslCaPath = optionalString(environment.DATABASE_SSL_CA_PATH);
  const databaseSslCaBytes = optionalBase64urlBytes(environment.DATABASE_SSL_CA_B64, "DATABASE_SSL_CA_B64");
  if (databaseSslCaBytes && databaseSslCaBytes.byteLength > 64 * 1024) {
    throw new Error("DATABASE_SSL_CA_B64 cannot exceed 64 KiB after decoding.");
  }
  if (databaseSslCaPath && databaseSslCaBytes) {
    throw new Error("Use only one database CA source.");
  }
  const ownerSubject = optionalString(environment.OWNER_GOOGLE_SUBJECT);
  const ownerEmail = optionalString(environment.OWNER_GOOGLE_EMAIL ?? environment.SETTINGS_OWNER_GOOGLE_EMAIL)?.toLowerCase();
  const googleClientId = environment.GOOGLE_CLIENT_ID;
  const googleClientSecret = environment.GOOGLE_CLIENT_SECRET;
  if (mode === "production" && (![googleClientId, googleClientSecret].every(value => typeof value === "string" && value.length > 0) || (!ownerSubject && !ownerEmail))) {
    throw new Error("Google owner identity configuration is required in production.");
  }
  const codexAuthPath = typeof environment.CODEX_APP_SERVER_AUTH_PATH === "string" && environment.CODEX_APP_SERVER_AUTH_PATH.trim()
    ? environment.CODEX_APP_SERVER_AUTH_PATH.trim()
    : undefined;
  const codexAuthBase64Bytes = optionalBase64urlBytes(environment.CODEX_APP_SERVER_AUTH_B64, "CODEX_APP_SERVER_AUTH_B64");
  const codexAuthGzipBytes = optionalGzipBase64urlBytes(environment.CODEX_APP_SERVER_AUTH_GZIP_B64, "CODEX_APP_SERVER_AUTH_GZIP_B64");
  if (codexAuthBase64Bytes && codexAuthGzipBytes) {
    throw new Error("Use only one Codex app-server auth secret.");
  }
  const codexAuthBytes = codexAuthBase64Bytes ?? codexAuthGzipBytes;
  if (mode === "production" && !codexAuthPath && !codexAuthBytes) {
    throw new Error("CODEX_APP_SERVER_AUTH_PATH, CODEX_APP_SERVER_AUTH_B64 or CODEX_APP_SERVER_AUTH_GZIP_B64 is required in production.");
  }

  const runtimeDataKey = decodedKey ?? createHash("sha256").update("nanoduck-development-data-key").digest();
  const runtimeRecoveryKey = decodedRecoveryKey ?? createHash("sha256").update("nanoduck-development-recovery-key").digest();
  const maxAttachmentBytes = positiveInteger(environment.MAX_ATTACHMENT_BYTES, 8 * 1024 * 1024, "MAX_ATTACHMENT_BYTES");
  if (maxAttachmentBytes > 8 * 1024 * 1024) throw new Error("MAX_ATTACHMENT_BYTES cannot exceed 8 MiB.");
  const sessionLifetimeSeconds = positiveInteger(environment.SESSION_ABSOLUTE_SECONDS, 86_400, "SESSION_ABSOLUTE_SECONDS");
  if (sessionLifetimeSeconds > 86_400) throw new Error("SESSION_ABSOLUTE_SECONDS cannot exceed 24 hours.");
  return Object.freeze({
    mode,
    port: positiveInteger(environment.PORT, 3000, "PORT"),
    origin,
    edgeProxyKey,
    databaseUrl,
    databaseSslCaPath,
    databaseSslCaBytes,
    dataKey: runtimeDataKey,
    recoveryKey: runtimeRecoveryKey,
    sessionKey,
    sessionLifetimeSeconds,
    maxAttachmentBytes,
    google: (ownerSubject || ownerEmail) && googleClientId && googleClientSecret && origin
      ? Object.freeze({ ownerSubject, ownerEmail, clientId: googleClientId, clientSecret: googleClientSecret, redirectUri: `${origin}/auth/google/callback` })
      : undefined,
    developmentOwnerEmail: mode === "development" ? environment.DEV_OWNER_EMAIL : undefined,
    codexCommand: environment.CODEX_APP_SERVER_COMMAND ?? "codex",
    codexCommandArgs: Object.freeze([]),
    codexAuthPath,
    codexAuthBytes,
    readyForProvider: Boolean(codexAuthPath || codexAuthBytes),
    claudeCommand: environment.CLAUDE_CODE_COMMAND ?? resolve(process.cwd(), "node_modules", ".bin", "claude"),
    claudeCommandArgs: Object.freeze([]),
    claudeHome: undefined,
    claudeConfigDirectory: undefined,
    claudeOAuthToken: optionalString(environment.CLAUDE_CODE_OAUTH_TOKEN),
    claudeModelCandidates: optionalModelCandidates(environment.CLAUDE_CODE_MODEL_CANDIDATES)
  });
}
