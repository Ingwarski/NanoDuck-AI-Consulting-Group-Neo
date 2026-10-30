import { createHash } from "node:crypto";
// GET_LOCK is scoped to a MySQL server; include the decoded database identity.
export const databaseLockName = databaseUrl => "nanoduck-" + createHash("sha256").update(decodeURIComponent(new URL(databaseUrl).pathname.slice(1))).digest("hex").slice(0, 48);
