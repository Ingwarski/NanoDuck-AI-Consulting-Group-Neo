import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import test from "node:test";
import { loadConfig } from "../src/server/config.mjs";
import { createDatabaseSslOptions } from "../src/server/database-tls.mjs";
import { createMySqlStore } from "../src/server/store.mjs";

const productionEnvironment = Object.freeze({
  NODE_ENV: "production",
  APP_ORIGIN: "https://consulting.example.com",
  DATABASE_URL: "mysql://user:password@host/database",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64url"),
  RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64url"),
  SESSION_SIGNING_KEY: Buffer.alloc(32, 3).toString("base64url"),
  OWNER_GOOGLE_SUBJECT: "owner-subject",
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret",
  CODEX_APP_SERVER_AUTH_B64: Buffer.from("owned-auth-state").toString("base64url")
});

test("database TLS accepts one bounded CA source and rejects malformed configuration", async () => {
  const pem = rootCertificates[0];
  const encoded = Buffer.from(pem).toString("base64url");
  const encodedConfig = loadConfig({ ...productionEnvironment, DATABASE_SSL_CA_B64: encoded });
  assert.deepEqual(encodedConfig.databaseSslCaBytes, Buffer.from(pem));
  assert.deepEqual(await createDatabaseSslOptions(encodedConfig), { ca: pem, rejectUnauthorized: true });
  assert.throws(() => loadConfig({ ...productionEnvironment, DATABASE_SSL_CA_PATH: "/run/secrets/mysql-ca.pem", DATABASE_SSL_CA_B64: encoded }), /only one database CA source/u);
  assert.throws(() => loadConfig({ ...productionEnvironment, DATABASE_SSL_CA_B64: "not+base64url" }), /base64url/u);
  assert.throws(() => loadConfig({ ...productionEnvironment, DATABASE_SSL_CA_B64: Buffer.alloc(64 * 1024 + 1).toString("base64url") }), /64 KiB/u);
  await assert.rejects(createDatabaseSslOptions({ databaseSslCaBytes: Buffer.from("not a certificate") }), /valid PEM certificate/u);

  const directory = await mkdtemp(join(tmpdir(), "nanoduck-database-ca-"));
  try {
    const path = join(directory, "mysql-ca.pem");
    await writeFile(path, pem, { mode: 0o600 });
    assert.deepEqual(await createDatabaseSslOptions({ databaseSslCaPath: path }), { ca: pem, rejectUnauthorized: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("database TLS options remain mutable for mysql2 without weakening verification", async () => {
  const ssl = await createDatabaseSslOptions({ databaseSslCaBytes: Buffer.from(rootCertificates[0]) });
  assert.equal(Object.isFrozen(ssl), false);
  ssl.rejectUnauthorized = true;

  let received;
  let poolCreated = false;
  await assert.rejects(
    createMySqlStore("mysql://owner:password@db.example/nanoduck", Buffer.alloc(32, 7), { rejectUnauthorized: false }, {
      createPool() {
        poolCreated = true;
      }
    }),
    /must verify the server certificate/u
  );
  assert.equal(poolCreated, false);

  const store = await createMySqlStore("mysql://owner:password@db.example/nanoduck", Buffer.alloc(32, 7), ssl, {
    createPool(options) {
      received = options.ssl;
      received.rejectUnauthorized = true;
      return { async end() {} };
    }
  });
  assert.notEqual(received, ssl);
  assert.deepEqual(received, ssl);
  await store.close();
});
