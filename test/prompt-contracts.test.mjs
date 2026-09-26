import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimePrompts, parseRuntimeInstructions, RuntimeInstructionError, runtimeInstructionsFor, upgradeRuntimeInstructionMarkdown } from "../src/server/prompt-contracts.mjs";
import { createMemoryStore } from "../src/server/store.mjs";
import { testRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

test("a database bootstrap contract parses into the complete contract", () => {
  assert.equal(Object.keys(testRuntimeInstructions.sections).length, 20);
  assert.match(testRuntimeInstructions.markdown, /^## Consultation Routing/mu);
  assert.match(testRuntimeInstructions.revision, /^[a-f0-9]{64}$/u);
});

test("runtime instructions reject a missing required placeholder", () => {
  const invalid = testRuntimeInstructions.markdown.replace("Write this message in {{language}}.", "Write this message in the requested language.");
  assert.throws(() => parseRuntimeInstructions(invalid), RuntimeInstructionError);
});

test("consolidation migration preserves owner edits and is idempotent and reviewable", async () => {
  const old = testRuntimeInstructions.markdown.split("\n\n## Specialist Final Position")[0] + "\n";
  const store = createMemoryStore();
  const previous = await store.bootstrapRuntimeInstructions({ markdown: old, revision: "legacy" });
  const current = await store.migrateRuntimeInstructions(markdown => parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(markdown)));
  assert.ok(current.markdown.startsWith(old.trim()));
  assert.equal((await store.runtimeInstructionVersion(previous.revision)).markdown, old);
  const edited = current.markdown.replace("Keep this concise and specific.", "Use my custom closing style.");
  const upgradedEdit = upgradeRuntimeInstructionMarkdown(edited);
  assert.equal(upgradeRuntimeInstructionMarkdown(upgradedEdit), upgradedEdit);
  const prompts = createRuntimePrompts(parseRuntimeInstructions(upgradedEdit));
  assert.match(prompts.specialistFinal({ specialist: "Finance Consultant", language: "English" }), /my custom closing style/u);
  assert.match(prompts.criticFinal("Ukrainian"), /Write this message in Ukrainian/u);
  assert.match(prompts.conclusion("English", "unresolved or unconfirmed"), /explicitly call the advice provisional/u);
  assert.throws(() => parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(edited.replace(/## Critic Final Review\n[\s\S]*?(?=## Consolidated Advice)/u, ""))), RuntimeInstructionError);
});

test("saved former public defaults migrate without retaining task wrappers or answer caps", async () => {
  const previous = testRuntimeInstructions.markdown
    .replace("Head Consultant sends complete tasks addressed to selected specialists", "Head Consultant may send only a concise task addressed to a selected specialist")
    .replace("Head-directed review", "configured exchanges")
    .replace("As Head Consultant, choose the actual one to five specialist roles most relevant to the complete owner request from {{candidates}}. Honor the owner's team-size setting. Return [TEAM: Role, Role] with exact role names.", "Choose the smallest relevant team from {{candidates}}. Return exactly [TEAM: N].")
    .replace(/As Head Consultant, assign the \{\{specialist\}\}[^\n]+Return the complete task text directly\./u, "Give only a concise, concrete task handoff to the {{specialist}}. Keep the exact case anchor: “{{case_anchor}}” and exact decision detail: “{{case_detail}}”. Return exactly one <nanoduck-task> task.</nanoduck-task>")
    .replace("Return the full assignment text directly, without a wrapper.", "Return only one <nanoduck-task> task.</nanoduck-task>")
    .replace("Write a complete {{output_kind}}. The length must cover the actual requested work; do not truncate to an arbitrary character count.", "Write a {{output_kind}} under {{maximum_characters}} characters.");
  const custom = previous.replace("Use only English or Ukrainian sources.", "Use only English or Ukrainian sources with publication dates.");
  const upgraded = upgradeRuntimeInstructionMarkdown(custom);
  const parsed = parseRuntimeInstructions(upgraded);
  assert.doesNotMatch(parsed.markdown, /\[TEAM: N\]|<nanoduck-task>|under \{\{maximum_characters\}\}/u);
  assert.match(parsed.markdown, /sources with publication dates/u);
  assert.equal(upgradeRuntimeInstructionMarkdown(upgraded), upgraded);
  const store = createMemoryStore();
  const prior = await store.bootstrapRuntimeInstructions(parseRuntimeInstructions(custom));
  const migrated = await store.migrateRuntimeInstructions(markdown => parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(markdown)));
  assert.notEqual(prior.revision, migrated.revision);
  assert.equal((await store.runtimeInstructionVersion(prior.revision)).markdown, prior.markdown);
});

test("Critic defaults become evidence-based and owner-edited guidance remains intact", () => {
  const priorChallenge = "Review the {{specialist}} directly on exchange {{exchange}}. If the reply is circular, irrelevant, fabricated or unsupported, command the consultant to stop and rework it. Identify the exact claim or omission, explain the defect, and state what a useful correction must contain. Otherwise ask only one material unresolved question. Write this message in {{language}}.";
  const priorFinal = "You are the Critic. Address the Head Consultant after reviewing every selected specialist's final position together. Assess whether they support the same current recommendation; identify any incompatibility, unresolved objection, or condition the final advice must preserve. Do not treat a specialist accepting an earlier objection as proof of team agreement. Finish with [CONSILIUM: REACHED] only if all final positions support the same recommendation and you also support it; otherwise finish with [CONSILIUM: CONTINUE]. Write this message in {{language}}.";
  const old = testRuntimeInstructions.markdown.replace(/(?<=## Critic Challenge\n)[^\n]+/u, priorChallenge).replace(/(?<=## Critic Final Review\n)[^\n]+/u, priorFinal);
  const upgraded = upgradeRuntimeInstructionMarkdown(old);
  assert.match(upgraded, /specific correction required/u);
  assert.match(upgraded, /Do not invent a defect or force a reply/u);
  assert.match(upgraded, /missing requested item/u);
  const custom = old.replace(priorChallenge, "Challenge the {{specialist}} on exchange {{exchange}} using my rubric. Write this message in {{language}}.");
  const customUpgraded = upgradeRuntimeInstructionMarkdown(custom);
  assert.match(customUpgraded, /using my rubric/u);
  const prompts = createRuntimePrompts(parseRuntimeInstructions(customUpgraded));
  assert.match(prompts.criticChallenge({ specialist: "Finance Consultant", exchange: 1, language: "English" }), /name the exact issue and direct a specific rework/u);
  assert.match(prompts.criticFinal("English"), /check every requested owner deliverable/u);
  assert.equal(upgradeRuntimeInstructionMarkdown(customUpgraded), customUpgraded);
});

test("a saved Markdown contract renders the customised text for the model", () => {
  const markdown = testRuntimeInstructions.markdown.replace("Every accepted owner question must use the specialist-and-Critic consultation.", "Every accepted owner question must use the specialist-and-Critic consultation, with a distinct task for every selected specialist.");
  const contract = parseRuntimeInstructions(markdown);
  const prompts = createRuntimePrompts(contract);
  assert.match(prompts.headTask({ specialist: "Finance Consultant", caseAnchor: "BTC", caseDetail: "bearish", language: "English" }), /assign the Finance Consultant/u);
  assert.match(prompts.headTask({ specialist: "Finance Consultant", caseAnchor: "BTC", caseDetail: "bearish", language: "English" }), /distinct task for every selected specialist/u);
  assert.doesNotMatch(prompts.headTask({ specialist: "Finance Consultant", caseAnchor: "BTC", caseDetail: "bearish", language: "English" }), /\{\{/u);
  assert.match(prompts.outputContract({ outputKind: "head_final" }), /do not truncate/u);
  assert.match(prompts.providerPolicy(false), /Never use Russian or Belarusian/u);
});

test("a legacy direct-answer section becomes an enforced consultation-routing revision", () => {
  const legacy = testRuntimeInstructions.markdown.replace("Consultation Routing", "Direct Head Answer").replace("Every accepted owner question must use the specialist-and-Critic consultation.", "Give a direct, self-contained answer to this simple question.");
  const upgraded = upgradeRuntimeInstructionMarkdown(legacy);
  const contract = parseRuntimeInstructions(upgraded);
  assert.match(contract.markdown, /^## Consultation Routing/mu);
  assert.doesNotMatch(contract.markdown, /^## Direct Head Answer/mu);
  assert.match(createRuntimePrompts(contract).headTask({ specialist: "Strategy Consultant", caseAnchor: "margin", caseDetail: "gross", language: "English" }), /must not give the owner advice/u);
});

test("a restarted legacy run snapshot uses consultation routing", () => {
  const legacy = testRuntimeInstructions.markdown.replace("Consultation Routing", "Direct Head Answer").replace("Every accepted owner question must use the specialist-and-Critic consultation.", "Give a direct, self-contained answer to this simple question.");
  const contract = runtimeInstructionsFor({ runtimeInstructions: { markdown: legacy } });
  assert.match(contract.markdown, /^## Consultation Routing/mu);
  assert.match(createRuntimePrompts(contract).conclusion("English"), /must not give the owner advice/u);
});

test("a routing migration creates a new current encrypted-document revision without losing review history", async () => {
  const store = createMemoryStore();
  const seeded = await store.bootstrapRuntimeInstructions(testRuntimeInstructions);
  const migrated = await store.migrateRuntimeInstructions(markdown => parseRuntimeInstructions(markdown.replace("must not give the owner advice, a recommendation, analysis, or a preliminary conclusion.", "must not give the owner advice before the final synthesis.")));
  assert.notEqual(migrated?.revision, seeded.revision);
  const history = await store.listRuntimeInstructionHistory();
  assert.equal(history.length, 2);
  assert.equal(history.find(item => item.id === migrated?.revision)?.action, "routing_migration");
  assert.equal(history.find(item => item.id === migrated?.revision)?.restoredFromId, seeded.revision);
  assert.equal((await store.runtimeInstructionVersion(seeded.revision))?.markdown, testRuntimeInstructions.markdown);
});

test("the database bootstrap, history and restore never overwrite a newer revision", async () => {
  const store = createMemoryStore();
  const seeded = await store.bootstrapRuntimeInstructions(testRuntimeInstructions);
  const edited = parseRuntimeInstructions(seeded.markdown.replace("must not give the owner advice, a recommendation, analysis, or a preliminary conclusion.", "must not give the owner advice before the final synthesis."));
  const saved = await store.saveRuntimeInstructions(edited, seeded.revision);
  assert.notEqual(saved?.revision, seeded.revision);
  assert.equal(saved?.contentHash, edited.revision);
  const afterRestart = await store.bootstrapRuntimeInstructions(testRuntimeInstructions);
  assert.equal(afterRestart.revision, saved?.revision);
  assert.equal(await store.saveRuntimeInstructions(testRuntimeInstructions, seeded.revision), undefined);
  const history = await store.listRuntimeInstructionHistory();
  assert.equal(history.length, 2);
  assert.equal((await store.runtimeInstructionVersion(seeded.revision))?.markdown, testRuntimeInstructions.markdown);
  const restored = await store.restoreRuntimeInstructions(testRuntimeInstructions, saved.revision, seeded.revision);
  assert.notEqual(restored?.revision, seeded.revision);
  assert.equal(restored?.markdown, testRuntimeInstructions.markdown);
});
