import { readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { createSecureContext } from "node:tls";

export async function createDatabaseSslOptions(config) {
  const ca = config.databaseSslCaBytes
    ?? (config.databaseSslCaPath ? await readFile(config.databaseSslCaPath) : undefined);
  if (!ca) return { rejectUnauthorized: true };
  const pem = Buffer.isBuffer(ca) ? ca.toString("utf8") : String(ca);
  try {
    new X509Certificate(pem);
    createSecureContext({ ca: pem });
  } catch {
    throw new Error("The configured database CA is not a valid PEM certificate.");
  }
  return { ca: pem, rejectUnauthorized: true };
}
