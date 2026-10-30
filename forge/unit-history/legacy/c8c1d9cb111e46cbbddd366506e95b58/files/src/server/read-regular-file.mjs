import { constants } from "node:fs";
import { open } from "node:fs/promises";

export async function readRegularFile(path, maximumBytes = Infinity) {
  // Bind metadata and reads to one open file, even if its pathname is replaced.
  // Nonblocking open lets us reject FIFOs before a read can wait for a writer.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("not_a_regular_file");
    if (info.size > maximumBytes) throw new RangeError("file_too_large");
    const chunks = []; let size = 0;
    while (true) {
      // One extra byte detects growth past the limit without an unbounded read.
      const buffer = Buffer.alloc(Math.min(64 * 1024, maximumBytes - size + 1));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) return Buffer.concat(chunks, size);
      size += bytesRead;
      if (size > maximumBytes) throw new RangeError("file_too_large");
      chunks.push(buffer.subarray(0, bytesRead));
    }
  } finally { await file.close(); }
}
