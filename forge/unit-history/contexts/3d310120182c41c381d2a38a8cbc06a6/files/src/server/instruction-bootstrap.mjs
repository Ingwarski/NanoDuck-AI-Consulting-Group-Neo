import { readFile } from "node:fs/promises";
import { parseRuntimeInstructions, upgradeRuntimeInstructionMarkdown } from "./prompt-contracts.mjs";

export const readPromptDefault = async () => parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(
  await readFile(new URL("../../instructions/RUNTIME_PROMPTS.md", import.meta.url), "utf8")
));

export async function initializeInstructions(store) {
  // An existing owner document always wins. Packaged Markdown is first-use seed only.
  if (!await store.runtimeInstructions()) await store.bootstrapRuntimeInstructions(await readPromptDefault());
  await store.initializeDocuments();
  await store.migrateDefaultDocuments();
}
