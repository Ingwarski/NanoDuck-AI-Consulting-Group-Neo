import assert from "node:assert/strict";
import test from "node:test";
import { createConsultationService } from "../src/server/consultation.mjs";
import { createMemoryStore, defaultSettings } from "../src/server/store.mjs";
import { testRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

const settings = { ...defaultSettings, specialistCount: "2", discussionDepth: "1", runtimeInstructions: testRuntimeInstructions };
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("timed_out");
};
const createRun = async () => {
  const store = createMemoryStore(); const conversation = await store.createConversation();
  const accepted = await store.acceptMessage(conversation.id, { body: "Should a fictional bakery test preorders?", clientRequestId: "consolidation-test-0001" }, settings);
  return { store, id: conversation.id, run: accepted.run };
};
const response = input => ({ ok: true, body: ({
  owner_deliverables: "1. Give a preorder decision. 2. State the evidence gap.",
  auto_team: "[TEAM: Strategy Consultant, Finance Consultant]",
  research_query: "[RESEARCH: NONE]",
  head_review: "[REVIEW: CLOSE]",
  critic_final: "The two positions agree only conditionally. [CONSILIUM: CONTINUE]"
})[input.outputKind] ?? `${input.outputKind} gives a grounded position.`, sources: [] });

test("Head synthesis waits for both closing positions and the Critic's joint review", async () => {
  const fixture = await createRun(); const calls = []; let release;
  const provider = { async invoke(input) {
    calls.push(input);
    if (input.outputKind === "critic_final") return new Promise(resolve => { release = () => resolve(response(input)); });
    if (input.outputKind === "head_final") {
      assert.equal(input.evidence.events.filter(event => event.recipient === "Head Consultant").length, 3);
      assert.ok(input.evidence.discussion.includes("specialist_final gives a grounded position."));
      assert.ok(input.evidence.discussion.includes("The two positions agree only conditionally."));
      assert.ok(input.assignment.includes("explicitly call the advice provisional"));
    }
    return response(input);
  } };
  await createConsultationService({ store: fixture.store, provider }).start(fixture.id, fixture.run);
  await waitFor(() => release);
  assert.equal(calls.some(call => call.outputKind === "head_final"), false);
  release();
  await waitFor(async () => (await fixture.store.run(fixture.id)).status === "complete");
  assert.deepEqual(calls.slice(-4).map(call => call.outputKind), ["specialist_final", "specialist_final", "critic_final", "head_final"]);
  assert.equal((await fixture.store.run(fixture.id)).snapshot.consiliumReached, false);
  assert.match((await fixture.store.events(fixture.id)).at(-1).body, /^## Consolidated advice\n\n/u);
});

test("failure in a closing contribution prevents Head synthesis and preserves the confirmed prefix", async t => {
  for (const failed of ["specialist_final", "critic_final"]) await t.test(failed, async () => {
    const fixture = await createRun(); const calls = [];
    const provider = { async invoke(input) { calls.push(input.outputKind); return input.outputKind === failed ? { ok: false, code: "provider_unavailable" } : response(input); } };
    await createConsultationService({ store: fixture.store, provider }).start(fixture.id, fixture.run);
    await waitFor(async () => (await fixture.store.run(fixture.id)).status === "failed");
    assert.equal(calls.includes("head_final"), false);
    assert.equal((await fixture.store.events(fixture.id)).at(-1).role, "System");
  });
});

test("Continue resumes an interrupted closing stage without repeating a saved position", async () => {
  const fixture = await createRun(); let fail = true; const calls = [];
  const provider = { async invoke(input) {
    calls.push(input.outputKind);
    return fail && input.outputKind === "critic_final" ? { ok: false, code: "provider_unavailable" } : response(input);
  } };
  const service = createConsultationService({ store: fixture.store, provider });
  await service.start(fixture.id, fixture.run);
  await waitFor(async () => (await fixture.store.run(fixture.id)).status === "failed");
  const prefix = await fixture.store.events(fixture.id);
  fail = false;
  assert.ok(await service.continue(fixture.id));
  await waitFor(async () => (await fixture.store.run(fixture.id)).status === "complete");
  assert.equal(calls.filter(kind => kind === "specialist_final").length, 2);
  assert.deepEqual((await fixture.store.events(fixture.id)).slice(0, prefix.length), prefix);
});
