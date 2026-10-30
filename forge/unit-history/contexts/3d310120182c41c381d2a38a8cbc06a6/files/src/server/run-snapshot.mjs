import { encryptText, decryptText } from "./crypto.mjs";

export function sealRunSnapshot(snapshot, key) {
  return { format: "nanoduck-run-snapshot-v1", ...encryptText(JSON.stringify(snapshot), key) };
}
export function openRunSnapshot(value, key) {
  const stored = Buffer.isBuffer(value) ? JSON.parse(value.toString("utf8")) : typeof value === "string" ? JSON.parse(value) : value;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new Error("invalid_run_snapshot");
  if (stored.format === undefined) return stored; // Existing records are upgraded by the owned migration.
  if (stored.format !== "nanoduck-run-snapshot-v1") throw new Error("invalid_run_snapshot");
  const decoded = JSON.parse(decryptText(stored, key));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("invalid_run_snapshot");
  return decoded;
}
