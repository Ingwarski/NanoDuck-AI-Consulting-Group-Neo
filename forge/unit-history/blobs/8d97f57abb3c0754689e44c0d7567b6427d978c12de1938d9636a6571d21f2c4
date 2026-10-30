import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readRegularFile } from "../src/server/read-regular-file.mjs";
import { maximumRecoveryBytes, openRecoveryEnvelope, sealRecoverySnapshot } from "../src/server/recovery.mjs";

const realOpen = fs.open;
const fixture = async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), "nanoduck-file-read-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  t.after(() => { t.mock.restoreAll(); fs.open = realOpen; syncBuiltinESMExports(); });
  return directory;
};
const interceptOpen = (t, path, inspect) => {
  t.mock.method(fs, "open", async (...args) => {
    const file = await realOpen(...args);
    if (args[0] === path) await inspect(file);
    return file;
  });
  syncBuiltinESMExports();
};

test("regular-file reads preserve empty, binary, multi-chunk and symlinked files", async t => {
  const directory = await fixture(t);
  const path = join(directory, "input");
  for (const content of [Buffer.alloc(0), Buffer.from([0, 255, 128, 13, 10]), Buffer.alloc(150_000, 42)]) {
    await fs.writeFile(path, content);
    assert.deepEqual(await readRegularFile(path), content);
    assert.deepEqual(await readRegularFile(path, content.length), content);
  }
  const link = join(directory, "link");
  await fs.symlink(path, link);
  assert.deepEqual(await readRegularFile(link), await fs.readFile(path));
});

test("pathname and symlink replacement after validation cannot replace the opened contents", async t => {
  const directory = await fixture(t);
  for (const replaceWithSymlink of [false, true]) {
    const path = join(directory, `input-${replaceWithSymlink}`);
    const replacement = join(directory, `replacement-${replaceWithSymlink}`);
    await fs.writeFile(path, "checked file");
    await fs.writeFile(replacement, "replacement exceeds the size limit");
    let opened;
    interceptOpen(t, path, file => {
      opened = file;
      const stat = file.stat.bind(file);
      t.mock.method(file, "stat", async () => {
        const info = await stat();
        if (replaceWithSymlink) {
          await fs.unlink(path);
          await fs.symlink(replacement, path);
        } else await fs.rename(replacement, path);
        return info;
      });
    });
    assert.equal((await readRegularFile(path, 16)).toString(), "checked file");
    assert.equal(opened.fd, -1);
  }
});

test("bounded reads reject growth of the opened file and close its descriptor", async t => {
  const directory = await fixture(t);
  const path = join(directory, "input");
  await fs.writeFile(path, "checked file");
  let opened; let readBytes = 0;
  interceptOpen(t, path, file => {
    opened = file;
    const stat = file.stat.bind(file); const read = file.read.bind(file);
    t.mock.method(file, "stat", async () => {
      const info = await stat();
      await fs.appendFile(path, "now larger than the limit");
      return info;
    });
    t.mock.method(file, "read", async (...args) => {
      const result = await read(...args); readBytes += result.bytesRead; return result;
    });
  });
  await assert.rejects(readRegularFile(path, 16), { name: "RangeError", message: "file_too_large" });
  assert.equal(readBytes, 17);
  assert.equal(opened.fd, -1);
});

test("recovery reads accept the exact 32 MiB limit and reject one byte more", async t => {
  const directory = await fixture(t);
  const path = join(directory, "input");
  await fs.writeFile(path, "");
  await fs.truncate(path, maximumRecoveryBytes);
  assert.equal((await readRegularFile(path, maximumRecoveryBytes)).length, maximumRecoveryBytes);
  await fs.truncate(path, maximumRecoveryBytes + 1);
  await assert.rejects(readRegularFile(path, maximumRecoveryBytes), { message: "file_too_large" });
});

test("bounded recovery reads preserve authenticated envelopes and reject tampering", async t => {
  const directory = await fixture(t);
  const path = join(directory, "backup");
  const key = Buffer.alloc(32, 42);
  const snapshot = { schemaVersion: 1, kind: "nanoduck-owner-records", createdAt: "2026-09-21T00:00:00.000Z", conversations: [] };
  const sealed = sealRecoverySnapshot(snapshot, key);
  await fs.writeFile(path, JSON.stringify(sealed));
  const envelope = JSON.parse((await readRegularFile(path, maximumRecoveryBytes)).toString("utf8"));
  assert.deepEqual(openRecoveryEnvelope(envelope, key), snapshot);
  envelope.payload.tag = "tampered";
  assert.equal(openRecoveryEnvelope(envelope, key), undefined);
});

test("directories, missing files and failed reads do not leak open descriptors", async t => {
  const directory = await fixture(t);
  let opened;
  interceptOpen(t, directory, file => { opened = file; });
  await assert.rejects(readRegularFile(directory), /not_a_regular_file/u);
  assert.equal(opened.fd, -1);
  await assert.rejects(readRegularFile(join(directory, "missing")), { code: "ENOENT" });
  const path = join(directory, "input");
  await fs.writeFile(path, "data");
  interceptOpen(t, path, file => {
    opened = file;
    t.mock.method(file, "read", async () => { throw new Error("synthetic_read_failure"); });
  });
  await assert.rejects(readRegularFile(path), /synthetic_read_failure/u);
  assert.equal(opened.fd, -1);
});

test("a FIFO is rejected without waiting for a writer", { skip: process.platform === "win32", timeout: 2_000 }, async t => {
  const directory = await fixture(t);
  const path = join(directory, "pipe");
  execFileSync("mkfifo", [path]);
  await assert.rejects(readRegularFile(path), /not_a_regular_file/u);
});
