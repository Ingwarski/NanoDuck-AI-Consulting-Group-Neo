// Explicit opt-in only: this spends the selected signed-in subscription's usage.
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadConfig } from "../src/server/config.mjs";
import { createCodexProvider } from "../src/server/codex-provider.mjs";
import { readPromptDefault } from "../src/server/instruction-bootstrap.mjs";
const { values } = parseArgs({ options: { live: { type: "boolean" }, model: { type: "string" }, effort: { type: "string" }, output: { type: "string" } } });
if (!values.live || !values.model || !values.effort || !values.output) {
  console.log("Usage: node scripts/benchmark-research.mjs --live --model MODEL --effort EFFORT --output REPORT.json");
} else {
  const provider = createCodexProvider(loadConfig(), { idleMs: 90000, maximumMs: 180000 });
  const runtimeInstructions = await readPromptDefault();
  const facts = ["Find the official Node.js documentation: does fs.readFile support AbortSignal, and what is the cancellation limitation?", "Find the official Node.js documentation: when are worker_threads useful for CPU-intensive work versus asynchronous I/O?"];
  const stamp = Date.now(); const reports = [];
  const invoke = async (variant, question) => {
    const attempts = []; const start = Date.now();
    const result = await provider.invoke({ model: values.model, effort: values.effort, contextScope: `research-benchmark-${stamp}-${variant}`, research: true, outputKind: "public_research", runtimeInstructions,
      assignment: "Answer only the listed factual documentation gaps. Use official Node.js documentation, cite direct URLs, preserve the relevant qualification for each fact, and stop when those facts are supported. No general tutorial. Existing evidence is absent. Return a concise factual answer with sources.", evidence: { owner: question, discussion: "" }, onUsage: attempt => { if (attempt.status !== "running") attempts.push(attempt); } });
    return { variant, question, elapsedMs: Date.now() - start, ok: result.ok, code: result.code, body: result.body, sources: result.sources, attempts };
  };
  try {
    reports.push(await invoke("combined", facts.join("\n")));
    reports.push(...await Promise.all(facts.map(question => invoke("focused", question))));
  } finally {
    await Promise.all(["combined", "focused"].map(variant => provider.releaseScope(`research-benchmark-${stamp}-${variant}`)));
  }
  await writeFile(values.output, JSON.stringify({ model: values.model, effort: values.effort, method: "One combined turn versus two concurrent focused turns, same public facts and instructions. Small non-randomized exploratory sample; provider cache routing and changing search results uncontrolled. No subscription-cost inference.", reports }, null, 2) + "\n", { mode: 0o600 });
  console.log("Research comparison saved.");
}
