import { execFile, spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import { isAbsolute, join } from "node:path";

let windowsTerminator;
const terminationExecutable = () => {
  if (windowsTerminator) return windowsTerminator;
  const root = process.env.SystemRoot ?? process.env.WINDIR;
  if (!root || !isAbsolute(root)) throw new Error("process_termination_unavailable");
  const path = join(root, "System32", "taskkill.exe");
  if (!lstatSync(path).isFile()) throw new Error("process_termination_unavailable");
  windowsTerminator = path;
  return path;
};

export function spawnIsolatedProcess(command, args, options) {
  if (process.platform === "win32") terminationExecutable();
  // A private POSIX process group lets Stop include child processes as well.
  return spawn(command, args, { ...options, detached: process.platform !== "win32", windowsHide: true });
}

export async function signalProcessTree(child, signal = "SIGTERM") {
  if (!Number.isSafeInteger(child.pid) || child.pid < 1) return;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  // Windows cannot catch Unix termination signals. Terminate the entire tree.
  await new Promise((resolve, reject) => {
    execFile(terminationExecutable(), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5_000, encoding: "utf8" }, error => {
      if (!error || child.exitCode !== null || child.signalCode !== null) resolve();
      else reject(new Error("process_termination_failed"));
    });
  });
}
