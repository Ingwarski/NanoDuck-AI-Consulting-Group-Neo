import { readFileSync } from "node:fs";
import { parseRuntimeInstructions } from "../../src/server/prompt-contracts.mjs";

// Test the public first-use contract without storing any owner's edited instructions.
export const testRuntimeInstructions = parseRuntimeInstructions(readFileSync(new URL("../../instructions/RUNTIME_PROMPTS.md", import.meta.url), "utf8"));
export const testRuntimeInstructionsBootstrap = Buffer.from(testRuntimeInstructions.markdown, "utf8").toString("base64url");
